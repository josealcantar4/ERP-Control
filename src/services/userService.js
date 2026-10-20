import { db, isFirebaseConfigured } from '../config/firebase';
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
const LOCAL_USERS_CACHE_KEY = 'erp_control_users_cache';

function getLocalUsersCache() {
  const raw = localStorage.getItem(LOCAL_USERS_CACHE_KEY);
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    } catch {}
  }
  return [];
}

function saveLocalUsersCache(users) {
  localStorage.setItem(LOCAL_USERS_CACHE_KEY, JSON.stringify(users));
  window.dispatchEvent(new Event('erp_users_changed'));
}

export const userService = {
  // Asegura que el Administrador exista en Firestore
  async ensureAdminInitialized() {
    if (!isFirebaseConfigured) return;
    try {
      const adminRef = doc(db, 'usuarios', 'Administrador');
      const snap = await getDoc(adminRef);
      if (!snap.exists()) {
        await setDoc(adminRef, {
          username: 'Administrador',
          password: '1234',
          nombre: 'Administrador General',
          sede: 'Matriz Centro',
          area: 'Dirección General',
          roles: ['solicitar', 'despachar'],
          excluirDestinatario: true,
          createdAt: new Date().toISOString()
        });
      }
    } catch (e) {
      console.warn('Verificación inicial de Administrador en Firestore:', e);
    }
  },

  // Suscripción en tiempo real a usuarios
  subscribeUsers(onUpdate) {
    this.ensureAdminInitialized();

    if (isFirebaseConfigured) {
      try {
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
                password: data.password,
                nombre: data.nombre || data.username || d.id,
                sede: data.sede || 'Sin sede',
                area: data.area || 'Sin área',
                roles: Array.isArray(userRoles) ? userRoles : [userRoles],
                excluirDestinatario: Boolean(data.excluirDestinatario)
              };
            });

            onUpdate(list);
            saveLocalUsersCache(list);
          },
          (err) => {
            console.warn('Error leyendo usuarios de Firebase:', err);
            onUpdate(getLocalUsersCache());
          }
        );
      } catch (err) {
        console.warn('Error en snapshot de usuarios:', err);
      }
    }

    onUpdate(getLocalUsersCache());
    const handler = () => onUpdate(getLocalUsersCache());
    window.addEventListener('erp_users_changed', handler);
    return () => window.removeEventListener('erp_users_changed', handler);
  },

  // Inicio de sesión
  async login(username, password) {
    const cleanUser = String(username || '').trim();
    const cleanPass = String(password || '').trim();

    if (!cleanUser || !cleanPass) {
      throw new Error('Por favor ingresa tu usuario y contraseña.');
    }

    if (isFirebaseConfigured) {
      try {
        const docRef = doc(db, 'usuarios', cleanUser);
        const snap = await getDoc(docRef);

        if (snap.exists()) {
          const data = snap.data();
          if (String(data.password) === cleanPass) {
            const roles = data.roles || data.rol || ['solicitar'];
            const user = {
              id: snap.id,
              username: data.username,
              nombre: data.nombre || data.username,
              sede: data.sede || 'Matriz Centro',
              area: data.area || 'General',
              roles: Array.isArray(roles) ? roles : [roles],
              excluirDestinatario: Boolean(data.excluirDestinatario)
            };
            localStorage.setItem(CURRENT_USER_KEY, JSON.stringify(user));
            return user;
          }
        }
      } catch (err) {
        console.warn('Error en login de Firestore, verificando caché:', err);
      }
    }

    const localUsers = getLocalUsersCache();
    const match = localUsers.find(
      u => u.username.toLowerCase() === cleanUser.toLowerCase() && String(u.password) === cleanPass
    );

    if (match) {
      const user = {
        id: match.id || match.username,
        username: match.username,
        nombre: match.nombre || match.username,
        sede: match.sede || 'Matriz Centro',
        area: match.area || 'General',
        roles: match.roles || ['solicitar', 'despachar'],
        excluirDestinatario: Boolean(match.excluirDestinatario)
      };
      localStorage.setItem(CURRENT_USER_KEY, JSON.stringify(user));
      return user;
    }

    throw new Error('Usuario o contraseña incorrectos.');
  },

  // Crear usuario
  async createUser(userData) {
    const username = userData.username?.trim();
    const password = userData.password?.trim();
    const nombre = userData.nombre?.trim();
    const sede = userData.sede?.trim();
    const area = userData.area?.trim();
    const roles = userData.roles || ['solicitar'];
    const excluirDestinatario = Boolean(userData.excluirDestinatario);

    if (!username) throw new Error('El nombre de usuario es obligatorio.');
    if (!password || password.length < 3) throw new Error('La contraseña debe tener al menos 3 caracteres.');
    if (!nombre) throw new Error('El nombre completo de la persona es obligatorio.');
    if (!sede) throw new Error('Debes seleccionar una sede.');
    if (!area) throw new Error('Debes seleccionar un área.');
    if (!roles || roles.length === 0) throw new Error('Debes asignar al menos un rol.');

    const current = getLocalUsersCache();
    if (current.some(u => u.username.toLowerCase() === username.toLowerCase())) {
      throw new Error(`El usuario "${username}" ya existe en el sistema.`);
    }

    const newUser = {
      username,
      password,
      nombre,
      sede,
      area,
      roles: Array.isArray(roles) ? roles : [roles],
      excluirDestinatario,
      createdAt: new Date().toISOString()
    };

    if (isFirebaseConfigured) {
      try {
        await setDoc(doc(db, 'usuarios', username), newUser);
      } catch (err) {
        console.warn('Error creando usuario en Firebase:', err);
      }
    }

    saveLocalUsersCache([...current, { id: username, ...newUser }]);
    return { id: username, ...newUser };
  },

  // Actualizar usuario
  async updateUser(userId, updateData) {
    if (!userId) throw new Error('ID de usuario inválido.');

    const current = getLocalUsersCache();
    const existing = current.find(u => u.id === userId || u.username === userId);
    if (!existing) throw new Error('El usuario no existe.');

    const cleanPass = updateData.password?.trim() || existing.password;
    if (cleanPass.length < 3) throw new Error('La contraseña debe tener al menos 3 caracteres.');

    const updated = {
      ...existing,
      ...updateData,
      password: cleanPass,
      roles: updateData.roles || existing.roles,
      excluirDestinatario: updateData.excluirDestinatario !== undefined ? Boolean(updateData.excluirDestinatario) : Boolean(existing.excluirDestinatario),
      updatedAt: new Date().toISOString()
    };

    if (isFirebaseConfigured) {
      try {
        await setDoc(doc(db, 'usuarios', existing.username), updated, { merge: true });
      } catch (err) {
        console.warn('Error actualizando usuario en Firebase:', err);
      }
    }

    const newUsers = current.map(u => (u.id === userId || u.username === userId) ? updated : u);
    saveLocalUsersCache(newUsers);

    const active = this.getCurrentUser();
    if (active && active.username.toLowerCase() === existing.username.toLowerCase()) {
      localStorage.setItem(CURRENT_USER_KEY, JSON.stringify({
        ...active,
        nombre: updated.nombre,
        sede: updated.sede,
        area: updated.area,
        roles: updated.roles,
        excluirDestinatario: updated.excluirDestinatario
      }));
    }

    return updated;
  },

  // Eliminar usuario
  async deleteUser(userId) {
    const current = getLocalUsersCache();
    const user = current.find(u => u.id === userId || u.username === userId);
    if (!user) return false;

    if (user.username.toLowerCase() === 'administrador') {
      throw new Error('No es posible eliminar el usuario Administrador principal del sistema.');
    }

    if (isFirebaseConfigured) {
      try {
        await deleteDoc(doc(db, 'usuarios', user.username));
      } catch (err) {
        console.warn('Error eliminando usuario en Firebase:', err);
      }
    }

    const filtered = current.filter(u => u.id !== userId && u.username !== userId);
    saveLocalUsersCache(filtered);
    return true;
  },

  // Obtener sesión activa
  getCurrentUser() {
    const raw = localStorage.getItem(CURRENT_USER_KEY);
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  },

  // Cerrar sesión
  logout() {
    localStorage.removeItem(CURRENT_USER_KEY);
  },

  // Obtener destinatarios habilitados (Excluye área 'Administrativo' o con 'excluirDestinatario = true')
  async getMatrizDestinatarios() {
    const filterRecipient = (u) => {
      const roles = u.roles || u.rol || [];
      const hasDespacharRole = roles.includes('despachar');
      const isAdministrativoArea = String(u.area || '').trim().toLowerCase() === 'administrativo';
      const isExcluded = Boolean(u.excluirDestinatario);

      return hasDespacharRole && !isAdministrativoArea && !isExcluded;
    };

    if (isFirebaseConfigured) {
      try {
        const snap = await getDocs(collection(db, 'usuarios'));
        if (!snap.empty) {
          return snap.docs
            .map(d => ({ id: d.id, ...d.data() }))
            .filter(filterRecipient);
        }
      } catch (e) {
        console.warn('Error al obtener destinatarios de Firebase:', e);
      }
    }

    const cached = getLocalUsersCache();
    return cached.filter(filterRecipient);
  }
};