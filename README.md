# 🏥 ERP Control - Transferencias de Medicamentos
### React.js + Firebase + PWA (Offline-First) &bull; Estilo Apple iOS

Sistema exclusivo para la gestión ágil de transferencias de medicamentos entre sucursales y la bodega matriz, diseñado con una estética limpia inspirada en **iOS / Apple** (Light Mode estricto, tarjetas suaves, efectos traslúcidos).

---

## 📱 Características Principales

### 1. Estética Apple / iOS (Light Mode Estricto)
- Fondos claros (`bg-slate-50`), tarjetas blancas con bordes redondeados (`rounded-3xl`), sombras sutiles y barras de navegación translúcidas con efecto de desenfoque (`backdrop-blur-xl`).
- Tipografía limpia con contraste óptimo (tipo San Francisco / Inter).
- Sin modos oscuros forzados, sin neón, sin elementos artificiales.

### 2. Autenticación por Usuario y Contraseña (Roles & Sedes)
- Inicio de sesión con **Username** y **Contraseña** (sin requerir correos electrónicos).
- Estructura de usuario:
  - `username`: identificador único (ej. `sucursal.milagro`, `juan.patente`).
  - `roles`: `['solicitar']`, `['despachar']`, o `['solicitar', 'despachar']`.
  - `sede`: Ej. *El Milagro*, *La Fé*, *Matriz Centro*.
  - `area`: Ej. *Bodega de Patente*, *Bodega de Genérico*, *Farmacia General*.

### 3. Dashboard Inteligente por Rol
- Pantalla de inicio con Cards minimalistas táctiles según los permisos del usuario activo:
  - **"Solicitar Pedido"** para sucursales.
  - **"Despachar Pedido"** para matriz / bodega.

### 4. Módulo "Solicitar" (Sucursales)
- **Destinatario específico:** La sucursal selecciona al usuario responsable de bodega en la Matriz (ej. *Juan - Bodega de Patente*).
- **Escáner Rápido de Cámara (`html5-qrcode`):**
  - Botón prominente de escáner.
  - Al detectar el código de barras, autocompleta inmediatamente la descripción del fármaco.
  - Despliega modal con input enfocado automáticamente con `inputMode="numeric"` para abrir el teclado numérico en teléfonos móviles al instante.
  - Permite teclear la cantidad y presionar **"Listo"**.
- **Autoguardado de Borrador en Vivo:** Cada medicamento escaneado se guarda automáticamente en local y en Firestore. Si el personal atiende a un cliente o cierra la app, la lista permanece intacta al volver.
- **Historial de Solicitudes:** Permite consultar los pedidos anteriores y su estado de despacho.

### 5. Módulo "Despachar" (Matriz / Bodega)
- **Orden de Solicitudes:**
  - **Arriba:** Solicitudes enviadas listas para surtir.
  - **Abajo:** Solicitudes en borrador que las sucursales están capturando en tiempo real.
- **Surtido tipo To-Do:**
  - Al abrir un pedido, los medicamentos se muestran como una lista de tareas.
  - El despachador toca cada producto conforme lo coloca en la caja física, marcando un checkbox visual con progreso en porcentaje.
- **Agregar Extras:**
  - Botón para escanear o buscar e incluir medicamentos adicionales no solicitados originalmente (`esExtra: true`).
- **Finalizar Despacho:** Marca la transferencia como completada para su envío a sucursal.

---

## 👥 Cuentas de Prueba Preconfiguradas (1-Toque en Login)

| Usuario | Contraseña | Sede | Área | Rol |
| :--- | :--- | :--- | :--- | :--- |
| `sucursal.milagro` | `123` | El Milagro | Farmacia General | **Solicitar** |
| `sucursal.lafe` | `123` | La Fé | Farmacia General | **Solicitar** |
| `juan.patente` | `123` | Matriz Centro | Bodega de Patente | **Despachar** |
| `maria.generico` | `123` | Matriz Centro | Bodega de Genérico | **Despachar** |
| `admin.general` | `123` | Matriz Centro | Dirección Operaciones | **Ambos Roles** |

---

## 🚀 Cómo Ejecutar

En la terminal del proyecto:

```powershell
npm run dev
```

Abre en tu navegador la URL (ej. `http://localhost:5173`).
