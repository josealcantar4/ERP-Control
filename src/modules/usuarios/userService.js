/**
 * Servicio de administración de usuarios en Firestore para creación, actualización,
 * asignación de sedes y control de roles.
 *
 * Seguridad: todas las contraseñas se almacenan como hash SHA-256 (hex, 64 chars)
 * usando la Web Crypto API nativa del navegador (crypto.subtle). Las contraseñas
 * en texto plano nunca se guardan ni se comparan directamente contra Firestore.
 */

import { db } from '../../config/firebase';
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

const CURRENT_USER_KEY = 'erp_current_user';

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS DE CONTRASEÑA
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Genera el hash SHA-256 de un string usando Web Crypto API (nativa en todos los
 * navegadores modernos y Node >= 19). Produce el mismo hash que el script de
 * migración, garantizando compatibilidad entre entornos.
 *
 * @param {string} plainText  Contraseña en texto plano
 * @returns {Promise<string>} Hash hexadecimal de 64 caracteres
 */
async function hashPassword(plainText) {
  const encoder = new TextEncoder();
  const data = encoder.encode(String(plainText));
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Detecta si un string ya es un hash SHA-256 (64 caracteres hex en minúsculas).
 * Se usa para evitar re-hashear una contraseña que el formulario de edición
 * pre-rellena con el hash existente cuando el admin no quiere cambiarla.
 *
 * @param {string} str
 * @returns {boolean}
 */
function isAlreadyHashed(str) {
  return typeof str === 'string' && /^[a-f0-9]{64}$/.test(str);
}

// ─────────────────────────────────────────────────────────────────────────────
// SERVICIO
// ─────────────────────────────────────────────────────────────────────────────

export const userService = {
  /**
   * Verifica que el usuario Administrador exista en Firestore.
   * Si no existe (primer arranque), lo crea con una contraseña inicial
   * generada aleatoriamente, hasheada, y la imprime una sola vez en consola.
   */
  async ensureAdminInitialized() {
    try {
      const snapAll = await getDocs(collection(db, 'usuarios'));
      const adminDoc = snapAll.docs.find(d => (d.data()?.username || '').toLowerCase() === 'administrador');

      if (!adminDoc) {
        // Generar contraseña inicial aleatoria — nunca hardcodeada
        const initialPassword = (typeof crypto !== 'undefined' && crypto.randomUUID)
          ? crypto.randomUUID().replace(/-/g, '').substring(0, 10)
          : String(Date.now()).slice(-8);

        const hashedInitial = await hashPassword(initialPassword);

        const newAdminRef = doc(collection(db, 'usuarios'));
        await setDoc(newAdminRef, {
          id: newAdminRef.id,
          username: 'Administrador',
          password: hashedInitial,
          nombre: 'Administrador General',
          sede: 'Matriz Centro',
          area: 'Dirección General',
          roles: ['solicitar', 'despachar', 'material', 'admin', 'catalogo'],
          excluirDestinatario: true,
          mustChangePassword: true,
          createdAt: new Date().toISOString()
        });

        // ⚠️ MOSTRAR CONTRASEÑA INICIAL UNA SOLA VEZ — solo en consola del instalador
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

  /**
   * Suscripción en tiempo real a la lista de usuarios.
   * No expone el hash de la contraseña en el estado del cliente.
   */
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

  /**
   * Autentica al usuario contra Firestore.
   * Aplica SHA-256 a la contraseña ingresada antes de compararla con el hash
   * almacenado en Firestore.
   */
  async login(username, password) {
    const cleanUser = String(username || '').trim();
    const cleanPass = String(password || '');

    if (!cleanUser || !cleanPass) {
      throw new Error('Por favor ingresa tu usuario y contraseña.');
    }

    if (cleanUser === 'Administrador') {
      await this.ensureAdminInitialized();
    }

    // ✅ Hashear la contraseña ANTES de compararla con Firestore
    const hashedInput = await hashPassword(cleanPass);

    const snapAll = await getDocs(collection(db, 'usuarios'));
    const matchedDoc = snapAll.docs.find(d => {
      const u = d.data();
      return u.username === cleanUser;
    });

    if (matchedDoc) {
      const data = matchedDoc.data();
      // Comparar hash contra hash (nunca texto plano)
      if (data.password === hashedInput) {
        const roles = data.roles || data.rol || ['solicitar'];
        const user = {
          id: matchedDoc.id,
          username: data.username,
          nombre: data.nombre || data.username,
          sede: data.sede || 'Matriz Centro',
          sedeId: data.sedeId || '',
          area: data.area || 'General',
          areaId: data.areaId || '',
          roles: Array.isArray(roles) ? roles : [roles],
          excluirDestinatario: Boolean(data.excluirDestinatario)
          // ✅ No se expone el campo password en la sesión del cliente
        };
        localStorage.setItem(CURRENT_USER_KEY, JSON.stringify(user));
        return user;
      }
    }

    throw new Error('Usuario o contraseña incorrectos.');
  },

  /**
   * Crea un nuevo usuario en Firestore.
   * La contraseña se hashea antes de guardarla; nunca se almacena texto plano.
   */
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
    const isTaken = snapAll.docs.some(d =>
      (d.data()?.username || '').toLowerCase() === username.toLowerCase()
    );
    if (isTaken) {
      throw new Error(`El nombre de usuario "${username}" ya está registrado.`);
    }

    // ✅ Hashear la contraseña antes de guardar en Firestore
    const hashedPassword = await hashPassword(password);

    const newDocRef  = doc(collection(db, 'usuarios'));
    const newUserId  = newDocRef.id;

    const newUser = {
      id: newUserId,
      username,
      password: hashedPassword,   // ← hash, nunca texto plano
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

  /**
   * Actualiza los datos de un usuario existente.
   *
   * Lógica de contraseña (manejo de doble-hash):
   *   - Si updateData.password está vacío → se conserva el hash existente en Firestore.
   *   - Si updateData.password es igual al hash almacenado (formulario no fue modificado)
   *     → se conserva el hash sin re-hashear.
   *   - Si updateData.password es texto plano nuevo (< 64 chars hex) → se hashea y guarda.
   */
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
    if (updateData.username) {
      const newUsername = updateData.username.trim();
      if (!newUsername) throw new Error('El nombre de usuario no puede estar vacío.');

      if (isRootAdmin && newUsername.toLowerCase() !== 'administrador') {
        throw new Error('El nombre de usuario del Administrador principal no puede ser modificado.');
      }

      if (newUsername.toLowerCase() !== (existing.username || '').toLowerCase()) {
        const snapAll = await getDocs(collection(db, 'usuarios'));
        const duplicate = snapAll.docs.find(d =>
          d.id !== docRef.id &&
          (d.data()?.username || '').toLowerCase() === newUsername.toLowerCase()
        );
        if (duplicate) {
          throw new Error(`El nombre de usuario "${newUsername}" ya está en uso por otro usuario.`);
        }
        finalUsername = newUsername;
      } else {
        finalUsername = newUsername;
      }
    }

    // ── Resolución segura de la contraseña ───────────────────────────────────
    const rawPass = updateData.password?.trim() || '';

    let finalPassword;
    if (!rawPass) {
      // Campo vacío → conservar el hash actual
      finalPassword = existing.password;
    } else if (isAlreadyHashed(rawPass)) {
      // El formulario de edición pre-rellena el campo con el hash existente;
      // si el admin no lo cambió, llegará aquí el mismo hash → conservarlo.
      finalPassword = rawPass;
    } else {
      // Contraseña nueva en texto plano → validar longitud y hashear
      if (rawPass.length < 3) throw new Error('La contraseña debe tener al menos 3 caracteres.');
      finalPassword = await hashPassword(rawPass);
    }
    // ─────────────────────────────────────────────────────────────────────────

    const updated = {
      ...updateData,
      id: docRef.id,
      username: finalUsername,
      password: finalPassword,   // siempre hash SHA-256
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
        // ✅ password no se propaga a la sesión del cliente
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

    if (snap.exists() && (snap.data()?.username || '').toLowerCase() === 'administrador') {
      throw new Error('No es posible eliminar el usuario Administrador principal del sistema.');
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
