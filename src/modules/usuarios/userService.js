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

export const userService = {
  // Asegura que el Administrador exista en Firestore al iniciar
  async ensureAdminInitialized() {
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

  // Suscripción en tiempo real a usuarios desde Firestore
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
            password: data.password,
            nombre: data.nombre || data.username || d.id,
            sede: data.sede || 'Sin sede',
            area: data.area || 'Sin área',
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

  // Forzar verificación y obtención de usuarios actualizados
  async refreshUsers() {
    try {
      const snap = await getDocs(collection(db, 'usuarios'));
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
      window.dispatchEvent(new CustomEvent('erp_users_refreshed', { detail: list }));
      return list;
    } catch (err) {
      console.warn('Error al verificar usuarios en Firebase:', err);
      return [];
    }
  },

  // Inicio de sesión consultando Firestore
  async login(username, password) {
    const cleanUser = String(username || '').trim();
    const cleanPass = String(password || '').trim();

    if (!cleanUser || !cleanPass) {
      throw new Error('Por favor ingresa tu usuario y contraseña.');
    }

    if (cleanUser.toLowerCase() === 'administrador') {
      await this.ensureAdminInitialized();
    }

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

    throw new Error('Usuario o contraseña incorrectos.');
  },

  // Crear usuario en Firestore
  async createUser(userData) {
    const username = userData.username?.trim();
    const password = userData.password?.trim();
    const nombre = userData.nombre?.trim();
    const sede = userData.sede?.trim();
    const area = userData.area?.trim() || '';
    const roles = userData.roles || ['solicitar'];
    const excluirDestinatario = Boolean(userData.excluirDestinatario);

    if (!username) throw new Error('El nombre de usuario es obligatorio.');
    if (!password || password.length < 3) throw new Error('La contraseña debe tener al menos 3 caracteres.');
    if (!nombre) throw new Error('El nombre completo de la persona es obligatorio.');
    if (!sede) throw new Error('Debes seleccionar una sede.');
    if (!roles || roles.length === 0) throw new Error('Debes asignar al menos un rol.');

    const docRef = doc(db, 'usuarios', username);
    const snap = await getDoc(docRef);

    if (snap.exists()) {
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

    await setDoc(docRef, newUser);
    return { id: username, ...newUser };
  },

  // Actualizar usuario en Firestore
  async updateUser(userId, updateData) {
    if (!userId) throw new Error('ID de usuario inválido.');

    const docRef = doc(db, 'usuarios', userId);
    const snap = await getDoc(docRef);

    if (!snap.exists()) {
      throw new Error('El usuario no existe.');
    }

    const existing = snap.data();
    const cleanPass = updateData.password?.trim() || existing.password;
    if (cleanPass.length < 3) throw new Error('La contraseña debe tener al menos 3 caracteres.');

    const updated = {
      ...updateData,
      password: cleanPass,
      roles: updateData.roles || existing.roles,
      excluirDestinatario: updateData.excluirDestinatario !== undefined ? Boolean(updateData.excluirDestinatario) : Boolean(existing.excluirDestinatario),
      updatedAt: new Date().toISOString()
    };

    await setDoc(docRef, updated, { merge: true });

    const active = this.getCurrentUser();
    if (active && active.username.toLowerCase() === userId.toLowerCase()) {
      localStorage.setItem(CURRENT_USER_KEY, JSON.stringify({
        ...active,
        nombre: updated.nombre || existing.nombre,
        sede: updated.sede || existing.sede,
        area: updated.area || existing.area,
        roles: updated.roles,
        excluirDestinatario: updated.excluirDestinatario
      }));
    }

    return { id: userId, ...existing, ...updated };
  },

  // Eliminar usuario de Firestore
  async deleteUser(userId) {
    if (!userId) return false;

    if (userId.toLowerCase() === 'administrador') {
      throw new Error('No es posible eliminar el usuario Administrador principal del sistema.');
    }

    await deleteDoc(doc(db, 'usuarios', userId));
    return true;
  },

  // Obtener sesión activa de localStorage
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

  // Obtener destinatarios habilitados directamente de Firestore
  async getMatrizDestinatarios() {
    try {
      const snap = await getDocs(collection(db, 'usuarios'));
      if (!snap.empty) {
        return snap.docs
          .map(d => ({ id: d.id, ...d.data() }))
          .filter(u => {
            const roles = u.roles || u.rol || [];
            const hasDespacharRole = roles.includes('despachar');
            const isAdministrativoArea = String(u.area || '').trim().toLowerCase() === 'administrativo';
            const isExcluded = Boolean(u.excluirDestinatario);

            return hasDespacharRole && !isAdministrativoArea && !isExcluded;
          });
      }
    } catch (e) {
      console.warn('Error al obtener destinatarios de Firebase:', e);
    }
    
    return [];
  }
};
