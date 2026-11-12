/**
 * Servicio de administración de usuarios en Firestore para creación, actualización,
 * asignación de sedes y control de roles.
 *
 * Seguridad: todas las contraseñas se almacenan como hash SHA-256 (hex, 64 chars)
 * usando la Web Crypto API nativa del navegador (crypto.subtle). Las contraseñas
 * en texto plano nunca se guardan ni se comparan directamente contra Firestore.
 */

import { db, auth, secondaryAuth } from '../../config/firebase';
import {
  collection,
  doc,
  setDoc,
  getDoc,
  deleteDoc,
  getDocs,
  onSnapshot,
  query
} from 'firebase/firestore';
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  updatePassword,
  deleteUser as deleteAuthUser,
  signOut
} from 'firebase/auth';

const CURRENT_USER_KEY = 'erp_current_user';

async function hashPassword(plainText) {
  const encoder = new TextEncoder();
  const data = encoder.encode(String(plainText));
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

function isAlreadyHashed(str) {
  return typeof str === 'string' && /^[a-f0-9]{64}$/.test(str);
}

export function normalizeUsernameKey(username) {
  return String(username || '').trim().toLowerCase().replace(/\s+/g, '_');
}

export function deriveVirtualEmail(username) {
  return `${normalizeUsernameKey(username)}@erp-control.internal`;
}

export function findConflictingUser(users, candidateUsername, excludeId = null) {
  const cleanCandidate = String(candidateUsername || '').trim();
  if (!cleanCandidate) return null;

  const candidateLower = cleanCandidate.toLowerCase();
  const candidateKey = normalizeUsernameKey(cleanCandidate);
  const candidateVirtualEmail = deriveVirtualEmail(cleanCandidate);

  return (users || []).find((u) => {
    if (!u) return false;
    const isSameUser = excludeId && (u.id ? u.id === excludeId : u.username === excludeId);
    if (isSameUser) return false;

    const existingUsername = String(u.username || '').trim();
    if (!existingUsername) return false;

    const existingLower = existingUsername.toLowerCase();
    const existingKey = normalizeUsernameKey(existingUsername);
    const existingVirtualEmail = String(u.virtualEmail || deriveVirtualEmail(existingUsername))
      .trim()
      .toLowerCase();

    return (
      existingLower === candidateLower ||
      existingKey === candidateKey ||
      existingVirtualEmail === candidateVirtualEmail
    );
  }) || null;
}

export const userService = {
  async ensureAdminInitialized() {
    try {
      const snapAll = await getDocs(collection(db, 'usuarios'));
      const adminDoc = snapAll.docs.find(d => (d.data()?.username || '').toLowerCase() === 'administrador');

      if (!adminDoc) {
        const initialPassword = (typeof crypto !== 'undefined' && crypto.randomUUID)
          ? crypto.randomUUID().replace(/-/g, '').substring(0, 10)
          : String(Date.now()).slice(-8);

        const hashedInitial = await hashPassword(initialPassword);
        const virtualEmail = deriveVirtualEmail('Administrador');
        let authUid = '';

        try {
          const cred = await createUserWithEmailAndPassword(secondaryAuth, virtualEmail, hashedInitial);
          authUid = cred.user?.uid || '';
        } catch (authErr) {
          if (authErr?.code !== 'auth/email-already-in-use') {
            console.warn('No se pudo aprovisionar Administrador en Firebase Auth:', authErr);
          }
        } finally {
          await signOut(secondaryAuth).catch(() => {});
        }

        const newAdminRef = doc(collection(db, 'usuarios'));
        await setDoc(newAdminRef, {
          id: newAdminRef.id,
          username: 'Administrador',
          password: hashedInitial,
          ...(authUid ? { authUid } : {}),
          virtualEmail,
          nombre: 'Administrador General',
          sede: 'Matriz Centro',
          area: 'Dirección General',
          roles: ['solicitar', 'despachar', 'material', 'admin', 'catalogo'],
          excluirDestinatario: true,
          mustChangePassword: true,
          createdAt: new Date().toISOString()
        });

        console.info(
          `%c[ERP SETUP] ✅ Usuario Administrador creado.` +
          `\n  Contraseña inicial: ${initialPassword}` +
          `\n  ⚠️  Cámbiela de inmediato desde el panel de administración.`,
          'color: #f59e0b; font-weight: bold; font-size: 13px;'
        );
      }
    } catch (e) {
      console.warn('Verificación inicial de Administrador en Firestore:', e);
    }
  },

  subscribeUsers(onUpdate) {
    this.ensureAdminInitialized();

    const q = query(collection(db, 'usuarios'));
    return onSnapshot(
      q,
      (snap) => {
        const list = snap.docs.map(d => {
          const data = d.data();
          const userRoles = data.roles || data.rol || ['solicitar'];
          return {
            id: d.id,
            username: data.username || d.id,
            virtualEmail: data.virtualEmail || deriveVirtualEmail(data.username || d.id),
            nombre: data.nombre || data.username || d.id,
            sede: data.sede || 'Sin sede',
            sedeId: data.sedeId || '',
            area: data.area || 'Sin área',
            areaId: data.areaId || '',
            roles: Array.isArray(userRoles) ? userRoles : [userRoles],
            excluirDestinatario: Boolean(data.excluirDestinatario)
          };
        });
        onUpdate(list);
      },
      (err) => {
        console.error('Error leyendo usuarios de Firebase:', err);
      }
    );
  },

  async refreshUsers() {
    try {
      const snap = await getDocs(collection(db, 'usuarios'));
      const list = snap.docs.map(d => {
        const data = d.data();
        const userRoles = data.roles || data.rol || ['solicitar'];
        return {
          id: d.id,
          username: data.username || d.id,
          virtualEmail: data.virtualEmail || deriveVirtualEmail(data.username || d.id),
          nombre: data.nombre || data.username || d.id,
          sede: data.sede || 'Sin sede',
          sedeId: data.sedeId || '',
          area: data.area || 'Sin área',
          areaId: data.areaId || '',
          roles: Array.isArray(userRoles) ? userRoles : [userRoles],
          excluirDestinatario: Boolean(data.excluirDestinatario)
        };
      });
      window.dispatchEvent(new CustomEvent('erp_users_refreshed', { detail: list }));
      return list;
    } catch (err) {
      console.warn('Error al verificar usuarios en Firebase:', err);
      return [];
    }
  },

  async login(username, password) {
    const cleanUser = String(username || '').trim();
    const cleanPass = String(password || '');

    if (!cleanUser || !cleanPass) {
      throw new Error('Por favor ingresa tu usuario y contraseña.');
    }

    const virtualEmail = deriveVirtualEmail(cleanUser);
    const hashedInput = await hashPassword(cleanPass);

    let authUser = null;
    try {
      const credential = await signInWithEmailAndPassword(auth, virtualEmail, hashedInput);
      authUser = credential.user;
    } catch (authErr) {
      const fallbackCodes = [
        'auth/user-not-found',
        'auth/invalid-credential',
        'auth/invalid-login-credentials',
        'auth/wrong-password'
      ];

      if (!fallbackCodes.includes(authErr?.code)) {
        if (authErr?.code === 'auth/too-many-requests') {
          throw new Error('Demasiados intentos fallidos. Espera unos minutos e intenta de nuevo.');
        }
        if (authErr?.code === 'auth/network-request-failed') {
          throw new Error('Error de conexión. Verifica tu acceso a internet.');
        }
        if (authErr?.code === 'auth/operation-not-allowed') {
          throw new Error('El proveedor de Email/Contraseña no está habilitado en Firebase Authentication.');
        }
        throw new Error('No se pudo iniciar sesión. Intenta de nuevo.');
      }

      if (cleanPass.length >= 6) {
        try {
          const legacyCred = await signInWithEmailAndPassword(auth, virtualEmail, cleanPass);
          authUser = legacyCred.user;
          await updatePassword(authUser, hashedInput).catch(() => {});
        } catch (legacyErr) {
          if (!fallbackCodes.includes(legacyErr?.code)) {
            if (legacyErr?.code === 'auth/too-many-requests') {
              throw new Error('Demasiados intentos fallidos. Espera unos minutos e intenta de nuevo.');
            }
            if (legacyErr?.code === 'auth/network-request-failed') {
              throw new Error('Error de conexión. Verifica tu acceso a internet.');
            }
          }
        }
      }
    }

    if (!authUser && cleanUser === 'Administrador') {
      await this.ensureAdminInitialized();
    }

    let snapAll;
    try {
      snapAll = await getDocs(collection(db, 'usuarios'));
    } catch (fsErr) {
      if (fsErr?.code === 'permission-denied') {
        if (authUser) {
          await signOut(auth).catch(() => {});
        }
        throw new Error('Usuario o contraseña incorrectos.');
      }
      throw fsErr;
    }

    const matchedDoc = snapAll.docs.find(d => {
      const u = d.data();
      if (u.username === cleanUser) return true;
      if (authUser) {
        return (
          (u.authUid && u.authUid === authUser.uid) ||
          (typeof u.username === 'string' && u.username.toLowerCase() === cleanUser.toLowerCase())
        );
      }
      return false;
    });

    if (!matchedDoc) {
      if (authUser) {
        await signOut(auth).catch(() => {});
      }
      throw new Error('Usuario o contraseña incorrectos.');
    }

    const data = matchedDoc.data();

    if (!authUser) {
      if (data.password !== hashedInput) {
        throw new Error('Usuario o contraseña incorrectos.');
      }

      try {
        const createdCredential = await createUserWithEmailAndPassword(auth, virtualEmail, hashedInput);
        authUser = createdCredential.user;
      } catch (createErr) {
        if (createErr?.code === 'auth/email-already-in-use') {
          throw new Error(
            'Tu contraseña fue actualizada en la base de datos pero no coincide con Firebase Authentication. Contacta al administrador.'
          );
        }
        if (createErr?.code === 'auth/network-request-failed') {
          throw new Error('Error de conexión. Verifica tu acceso a internet.');
        }
        if (createErr?.code === 'auth/operation-not-allowed') {
          throw new Error('El proveedor de Email/Contraseña no está habilitado en Firebase Authentication.');
        }
        throw createErr;
      }
    }

    if (authUser?.uid && data.authUid !== authUser.uid) {
      setDoc(
        doc(db, 'usuarios', matchedDoc.id),
        { authUid: authUser.uid, virtualEmail },
        { merge: true }
      ).catch(() => {});
    }

    const roles = data.roles || data.rol || ['solicitar'];
    const user = {
      id: matchedDoc.id,
      uid: authUser?.uid || '',
      username: data.username,
      nombre: data.nombre || data.username,
      sede: data.sede || 'Matriz Centro',
      sedeId: data.sedeId || '',
      area: data.area || 'General',
      areaId: data.areaId || '',
      roles: Array.isArray(roles) ? roles : [roles],
      excluirDestinatario: Boolean(data.excluirDestinatario)
    };
    localStorage.setItem(CURRENT_USER_KEY, JSON.stringify(user));
    return user;
  },

  async createUser(userData) {
    const username = userData.username?.trim();
    const password = userData.password?.trim();
    const nombre   = userData.nombre?.trim();
    const sede     = userData.sede?.trim();
    const area     = userData.area?.trim() || '';
    const roles    = userData.roles || ['solicitar'];
    const excluirDestinatario = Boolean(userData.excluirDestinatario);

    if (!username) throw new Error('El nombre de usuario es obligatorio.');
    if (!password || password.length < 3) throw new Error('La contraseña debe tener al menos 3 caracteres.');
    if (!nombre)   throw new Error('El nombre completo de la persona es obligatorio.');
    if (!sede)     throw new Error('Debes seleccionar una sede.');
    if (!roles || roles.length === 0) throw new Error('Debes asignar al menos un rol.');

    const snapAll = await getDocs(collection(db, 'usuarios'));
    const existingUsers = snapAll.docs.map(d => ({ id: d.id, ...d.data() }));
    const conflict = findConflictingUser(existingUsers, username);
    if (conflict) {
      if (String(conflict.username || '').trim().toLowerCase() === username.toLowerCase()) {
        throw new Error(`El nombre de usuario "${username}" ya está registrado.`);
      }
      throw new Error(
        `El nombre de usuario "${username}" entra en conflicto con "@${conflict.username}" porque generan el mismo identificador interno.`
      );
    }

    const hashedPassword = await hashPassword(password);
    const virtualEmail = deriveVirtualEmail(username);

    let authUid = '';
    try {
      const cred = await createUserWithEmailAndPassword(secondaryAuth, virtualEmail, hashedPassword);
      authUid = cred.user?.uid || '';
    } catch (authErr) {
      if (authErr?.code === 'auth/email-already-in-use') {
        throw new Error(
          `El nombre de usuario "${username}" (o un identificador equivalente) ya está registrado en Firebase Authentication.`
        );
      }
      throw authErr;
    } finally {
      await signOut(secondaryAuth).catch(() => {});
    }

    const newDocRef  = doc(collection(db, 'usuarios'));
    const newUserId  = newDocRef.id;

    const newUser = {
      id: newUserId,
      username,
      password: hashedPassword,
      authUid,
      virtualEmail,
      nombre,
      sede,
      sedeId: userData.sedeId?.trim() || '',
      area,
      areaId: userData.areaId?.trim() || '',
      roles: Array.isArray(roles) ? roles : [roles],
      excluirDestinatario,
      createdAt: new Date().toISOString()
    };

    await setDoc(newDocRef, newUser);
    return newUser;
  },

  async updateUser(userId, updateData) {
    if (!userId) throw new Error('ID de usuario inválido.');

    let docRef = doc(db, 'usuarios', userId);
    let snap   = await getDoc(docRef);

    if (!snap.exists()) {
      const snapAll = await getDocs(collection(db, 'usuarios'));
      const matched = snapAll.docs.find(d =>
        d.id === userId ||
        (d.data()?.username && d.data().username.toLowerCase() === userId.toLowerCase())
      );
      if (matched) {
        docRef = doc(db, 'usuarios', matched.id);
        snap   = matched;
      } else {
        throw new Error('El usuario no existe.');
      }
    }

    const existing    = snap.data();
    const isRootAdmin = (existing.username || '').toLowerCase() === 'administrador';

    let finalUsername = existing.username;
    if (updateData.username !== undefined) {
      const newUsername = updateData.username.trim();
      if (!newUsername) throw new Error('El nombre de usuario no puede estar vacío.');

      if (isRootAdmin && newUsername.toLowerCase() !== 'administrador') {
        throw new Error('El nombre de usuario del Administrador principal no puede ser modificado.');
      }

      const snapAll = await getDocs(collection(db, 'usuarios'));
      const existingUsers = snapAll.docs.map(d => ({ id: d.id, ...d.data() }));
      const conflict = findConflictingUser(existingUsers, newUsername, docRef.id);
      if (conflict) {
        if (String(conflict.username || '').trim().toLowerCase() === newUsername.toLowerCase()) {
          throw new Error(`El nombre de usuario "${newUsername}" ya está en uso por otro usuario.`);
        }
        throw new Error(
          `El nombre de usuario "${newUsername}" entra en conflicto con "@${conflict.username}" porque generan el mismo identificador interno.`
        );
      }
      finalUsername = newUsername;
    }

    const rawPass = updateData.password?.trim() || '';

    let finalPassword;
    let isPasswordChanged = false;
    if (!rawPass) {
      finalPassword = existing.password;
    } else if (isAlreadyHashed(rawPass)) {
      finalPassword = rawPass;
    } else {
      if (rawPass.length < 3) throw new Error('La contraseña debe tener al menos 3 caracteres.');
      finalPassword = await hashPassword(rawPass);
      isPasswordChanged = finalPassword !== existing.password;
    }

    let updatedAuthUid = existing.authUid || '';
    let updatedVirtualEmail = existing.virtualEmail || deriveVirtualEmail(existing.username);

    if (isPasswordChanged) {
      const oldHash = existing.password;
      try {
        if (oldHash) {
          const cred = await signInWithEmailAndPassword(secondaryAuth, updatedVirtualEmail, oldHash);
          updatedAuthUid = cred.user?.uid || updatedAuthUid;
          if (secondaryAuth.currentUser) {
            await updatePassword(secondaryAuth.currentUser, finalPassword);
          }
        } else {
          const created = await createUserWithEmailAndPassword(secondaryAuth, updatedVirtualEmail, finalPassword);
          updatedAuthUid = created.user?.uid || updatedAuthUid;
        }
      } catch (authErr) {
        if (authErr?.code === 'auth/user-not-found' || authErr?.code === 'auth/invalid-credential' || authErr?.code === 'auth/invalid-login-credentials') {
          try {
            const created = await createUserWithEmailAndPassword(secondaryAuth, updatedVirtualEmail, finalPassword);
            updatedAuthUid = created.user?.uid || updatedAuthUid;
          } catch (createErr) {
            if (createErr?.code !== 'auth/email-already-in-use') {
              throw createErr;
            }
            console.warn('[AdminProvisioner] La cuenta ya existía en Firebase Auth con otra credencial:', updatedVirtualEmail);
          }
        } else {
          throw authErr;
        }
      } finally {
        await signOut(secondaryAuth).catch(() => {});
      }
    }

    const updated = {
      ...updateData,
      id: docRef.id,
      username: finalUsername,
      password: finalPassword,
      ...(updatedAuthUid ? { authUid: updatedAuthUid } : {}),
      virtualEmail: updatedVirtualEmail,
      roles: updateData.roles || existing.roles,
      excluirDestinatario: updateData.excluirDestinatario !== undefined
        ? Boolean(updateData.excluirDestinatario)
        : Boolean(existing.excluirDestinatario),
      updatedAt: new Date().toISOString()
    };

    await setDoc(docRef, updated, { merge: true });

    const active = this.getCurrentUser();
    if (active && (
      (active.id && active.id === docRef.id) ||
      (active.username && active.username.toLowerCase() === existing.username.toLowerCase())
    )) {
      const updatedActiveUser = {
        ...active,
        id: docRef.id,
        username: updated.username,
        nombre: updated.nombre || existing.nombre,
        sede: updated.sede || existing.sede,
        sedeId: updated.sedeId || existing.sedeId || '',
        area: updated.area || existing.area,
        areaId: updated.areaId || existing.areaId || '',
        roles: updated.roles,
        excluirDestinatario: updated.excluirDestinatario
      };
      localStorage.setItem(CURRENT_USER_KEY, JSON.stringify(updatedActiveUser));
      window.dispatchEvent(new CustomEvent('erp_current_user_updated', { detail: updatedActiveUser }));
    }

    return { id: docRef.id, ...existing, ...updated };
  },

  async deleteUser(userId) {
    if (!userId) return false;

    let docRef = doc(db, 'usuarios', userId);
    let snap   = await getDoc(docRef);
    if (!snap.exists()) {
      const snapAll = await getDocs(collection(db, 'usuarios'));
      const matched = snapAll.docs.find(d =>
        d.id === userId ||
        (d.data()?.username && d.data().username.toLowerCase() === userId.toLowerCase())
      );
      if (matched) {
        docRef = doc(db, 'usuarios', matched.id);
        snap   = matched;
      }
    }

    if (snap.exists()) {
      const data = snap.data() || {};
      if ((data.username || '').toLowerCase() === 'administrador') {
        throw new Error('No es posible eliminar el usuario Administrador principal del sistema.');
      }

      const virtualEmail = data.virtualEmail || deriveVirtualEmail(data.username);
      const hashedPassword = data.password;

      try {
        if (virtualEmail && hashedPassword) {
          const cred = await signInWithEmailAndPassword(secondaryAuth, virtualEmail, hashedPassword);
          await deleteAuthUser(cred.user);
        }
      } catch (authErr) {
        console.warn('No se pudo eliminar la cuenta en Firebase Auth:', authErr);
      } finally {
        await signOut(secondaryAuth).catch(() => {});
      }
    }

    await deleteDoc(docRef);
    return true;
  },

  getCurrentUser() {
    const raw = localStorage.getItem(CURRENT_USER_KEY);
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  },

  logout() {
    localStorage.removeItem(CURRENT_USER_KEY);
    signOut(auth).catch((err) => {
      console.warn('Error al cerrar sesión en Firebase Auth:', err);
    });
  },

  async getMatrizDestinatarios() {
    try {
      const snap = await getDocs(collection(db, 'usuarios'));
      if (!snap.empty) {
        return snap.docs
          .map(d => ({ id: d.id, ...d.data() }))
          .filter(u => {
            const roles = u.roles || u.rol || [];
            const hasDespacharRole      = roles.includes('despachar');
            const isAdministrativoArea  = String(u.area || '').trim().toLowerCase() === 'administrativo';
            const isExcluded            = Boolean(u.excluirDestinatario);
            return hasDespacharRole && !isAdministrativoArea && !isExcluded;
          });
      }
    } catch (e) {
      console.warn('Error al obtener destinatarios de Firebase:', e);
    }
    return [];
  }
};