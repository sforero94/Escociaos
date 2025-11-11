# 🗺️ Implementación de React Router - Escocia Hass

Documentación completa del sistema de rutas implementado con React Router.

---

## 📋 Estructura de Rutas

```
/
├── /login                          → Login (público)
│
└── /* (protegidas)                 → Requiere autenticación
    ├── /                           → Dashboard (principal)
    │
    ├── /inventario                 → Lista de inventario
    │   ├── /nueva-compra           → Nueva compra
    │   └── /producto/:id           → Detalle de producto (próximamente)
    │
    ├── /aplicaciones               → Aplicaciones fitosanitarias (próximamente)
    ├── /monitoreo                  → Monitoreo de plagas (próximamente)
    ├── /produccion                 → Producción y cosechas (próximamente)
    ├── /ventas                     → Ventas y despachos (próximamente)
    ├── /lotes                      → Gestión de lotes (próximamente)
    └── /configuracion              → Configuración (próximamente)
```

---

## 🎯 Componentes Principales

### 1. **App.tsx** - Raíz de la aplicación

```tsx
<BrowserRouter>
  <AuthProvider>
    <AppContent />
  </AuthProvider>
</BrowserRouter>
```

**Responsabilidades:**
- Inicializar React Router
- Proveer contexto de autenticación
- Renderizar AppContent

---

### 2. **AppContent** - Rutas de nivel superior

```tsx
<Routes>
  <Route path="/login" element={...} />
  <Route path="/*" element={<ProtectedRoute>...</ProtectedRoute>} />
</Routes>
```

**Responsabilidades:**
- Separar rutas públicas (login) de protegidas
- Redirigir según estado de autenticación
- Proteger rutas con ProtectedRoute

---

### 3. **LayoutRoutes** - Rutas protegidas con Layout

```tsx
<Layout>
  <Routes>
    <Route index element={<Dashboard />} />
    <Route path="inventario">
      <Route index element={<InventoryList />} />
      <Route path="nueva-compra" element={<NewPurchase />} />
    </Route>
    ...
  </Routes>
</Layout>
```

**Responsabilidades:**
- Renderizar Layout persistente
- Definir rutas anidadas
- Manejar navegación 404

---

### 4. **Layout.tsx** - Navegación lateral

```tsx
const menuItems = [
  { id: 'dashboard', path: '/', icon: LayoutDashboard },
  { id: 'inventory', path: '/inventario', icon: Package },
  ...
];

// Verificar ruta activa
const isActive = (path: string) => {
  if (path === '/') return location.pathname === '/';
  return location.pathname.startsWith(path);
};

// Navegar con React Router
const navigate = useNavigate();
navigate('/inventario');
```

**Características:**
- ✅ Usa `useLocation()` para detectar ruta activa
- ✅ Usa `useNavigate()` para navegación programática
- ✅ Sidebar responsive (móvil + desktop)
- ✅ Resalta ruta actual automáticamente

---

## 🔐 Protección de Rutas

### ProtectedRoute Component

```tsx
<ProtectedRoute fallback={<Navigate to="/login" replace />}>
  <LayoutRoutes />
</ProtectedRoute>
```

**Funcionamiento:**
1. Verifica si usuario está autenticado
2. Si SÍ → Renderiza children (rutas protegidas)
3. Si NO → Renderiza fallback (redirect a login)

---

## 🧭 Navegación

### Desde el Dashboard

```tsx
function DashboardWrapper() {
  const navigate = useNavigate();

  const handleNavigate = (view: string) => {
    const routeMap = {
      'inventory': '/inventario',
      'applications': '/aplicaciones',
      'monitoring': '/monitoreo',
      ...
    };
    navigate(routeMap[view]);
  };

  return <Dashboard onNavigate={handleNavigate} />;
}
```

**Por qué Wrappers:**
- Los componentes existentes usan `onNavigate(view: string)`
- Los wrappers traducen string → path de React Router
- Mantiene compatibilidad sin refactorizar componentes

---

### Desde el Sidebar (Layout)

```tsx
// Layout.tsx
const navigate = useNavigate();

const handleNavigateClick = (path: string) => {
  navigate(path);
  setMobileMenuOpen(false); // Cerrar menú móvil
};

<button onClick={() => handleNavigateClick('/inventario')}>
  Inventario
</button>
```

**Características:**
- ✅ Navegación directa con paths
- ✅ Cierra menú móvil automáticamente
- ✅ Resalta botón activo con `useLocation()`

---

## 📍 Rutas Implementadas

### ✅ **Dashboard** - `/`
```tsx
<Route index element={<DashboardWrapper />} />
```
- **Componente:** `Dashboard.tsx`
- **Función:** Vista principal con métricas y alertas
- **Navegación:** Click en cards navega a módulos

### ✅ **Inventario** - `/inventario`
```tsx
<Route path="inventario">
  <Route index element={<InventoryListWrapper />} />
  <Route path="nueva-compra" element={<NewPurchaseWrapper />} />
  <Route path="producto/:id" element={<ComingSoon />} />
</Route>
```
- **Componente:** `InventoryList.tsx`
- **Función:** Lista de productos
- **Sub-rutas:**
  - `/inventario/nueva-compra` - Registrar compra
  - `/inventario/producto/:id` - Detalle (próximamente)

---

## 🚧 Rutas en Desarrollo

Todas usan el componente `ComingSoon`:

```tsx
<Route path="aplicaciones" element={<ComingSoon moduleName="Aplicaciones" />} />
<Route path="monitoreo" element={<ComingSoon moduleName="Monitoreo" />} />
<Route path="produccion" element={<ComingSoon moduleName="Producción" />} />
<Route path="ventas" element={<ComingSoon moduleName="Ventas" />} />
<Route path="lotes" element={<ComingSoon moduleName="Lotes" />} />
<Route path="configuracion" element={<ComingSoon moduleName="Configuración" />} />
```

**ComingSoon Component:**
```tsx
function ComingSoon({ moduleName }: { moduleName: string }) {
  return (
    <div className="text-center py-12">
      <div className="...">🚧</div>
      <h2>{moduleName} - En Desarrollo</h2>
      <p>Esta funcionalidad estará disponible próximamente</p>
    </div>
  );
}
```

---

## 🔀 Redirecciones

### Login → Dashboard (si autenticado)
```tsx
<Route
  path="/login"
  element={
    isAuthenticated ? (
      <Navigate to="/" replace />
    ) : (
      <Login />
    )
  }
/>
```

### 404 → Dashboard
```tsx
<Route path="*" element={<Navigate to="/" replace />} />
```

---

## 🎨 Resaltado de Ruta Activa

### En el Sidebar

```tsx
const isActive = (path: string) => {
  if (path === '/') {
    return location.pathname === '/';  // Exacto para dashboard
  }
  return location.pathname.startsWith(path);  // Prefix para anidadas
};

<button
  className={`... ${
    isActive(item.path)
      ? 'bg-gradient-to-r from-[#73991C] to-[#BFD97D] text-white'
      : 'text-[#172E08] hover:bg-[#E7EDDD]/50'
  }`}
>
  {item.label}
</button>
```

**Lógica:**
- Dashboard (`/`) → Match exacto
- Otras rutas → Match por prefijo
- Ejemplo: `/inventario/nueva-compra` activa botón "Inventario"

---

## 🔧 Configuración de React Router

### BrowserRouter vs HashRouter

Actualmente usando `BrowserRouter`:

```tsx
<BrowserRouter>
  ...
</BrowserRouter>
```

**Características:**
- ✅ URLs limpias: `/inventario`
- ✅ Sin `#` en la URL
- ⚠️ Requiere configuración del servidor

**Si necesitas HashRouter:**
```tsx
import { HashRouter } from 'react-router-dom';

<HashRouter>
  ...
</HashRouter>
```
- URLs con hash: `/#/inventario`
- Funciona sin configuración del servidor

---

## 🎯 Navegación Programática

### Desde Componentes

```tsx
import { useNavigate } from 'react-router-dom';

function MiComponente() {
  const navigate = useNavigate();

  const handleClick = () => {
    navigate('/inventario');
    // o
    navigate('/inventario/nueva-compra');
    // o con replace (no agregar a historial)
    navigate('/', { replace: true });
  };
}
```

### Con Parámetros (futuro)

```tsx
// Navegar con parámetro
navigate(`/inventario/producto/${productId}`);

// Leer parámetro
import { useParams } from 'react-router-dom';

function ProductDetail() {
  const { id } = useParams();
  // id = "123"
}
```

---

## 📱 Responsive

El sistema de rutas funciona en:

- ✅ **Mobile** (< 768px)
  - Menú hamburguesa
  - Navegación fullscreen
  - Cierra automáticamente al navegar

- ✅ **Desktop** (≥ 1024px)
  - Sidebar fijo
  - Navegación siempre visible

---

## 🧪 Testing de Rutas

### Verificar Todas las Rutas

```bash
# Dashboard
http://localhost:5173/

# Inventario
http://localhost:5173/inventario

# Nueva Compra
http://localhost:5173/inventario/nueva-compra

# Módulos en desarrollo
http://localhost:5173/aplicaciones
http://localhost:5173/monitoreo
http://localhost:5173/produccion

# Login
http://localhost:5173/login

# 404 (debe redirigir a /)
http://localhost:5173/ruta-inexistente
```

---

## 🔄 Migración de Estado a Rutas

### Antes (con estado)

```tsx
const [currentView, setCurrentView] = useState('dashboard');

const handleNavigate = (view: string) => {
  setCurrentView(view);
};

// Renderizado condicional
switch (currentView) {
  case 'dashboard':
    return <Dashboard />;
  case 'inventory':
    return <InventoryList />;
}
```

### Ahora (con rutas)

```tsx
<Routes>
  <Route path="/" element={<Dashboard />} />
  <Route path="/inventario" element={<InventoryList />} />
</Routes>

// Navegación
const navigate = useNavigate();
navigate('/inventario');
```

**Ventajas:**
- ✅ URL refleja el estado
- ✅ Botón atrás/adelante funciona
- ✅ Compartir links específicos
- ✅ Mejor SEO (futuro)

---

## 🚀 Próximos Pasos

### 1. Implementar Módulos
```tsx
// Reemplazar ComingSoon por componentes reales
<Route path="aplicaciones" element={<ApplicationsList />} />
<Route path="monitoreo" element={<MonitoringList />} />
```

### 2. Rutas con Parámetros
```tsx
<Route path="producto/:id" element={<ProductDetail />} />

// En ProductDetail.tsx
const { id } = useParams();
```

### 3. Lazy Loading
```tsx
import { lazy, Suspense } from 'react';

const Dashboard = lazy(() => import('./components/Dashboard'));

<Suspense fallback={<LoadingSpinner />}>
  <Route path="/" element={<Dashboard />} />
</Suspense>
```

### 4. Breadcrumbs
```tsx
// Dashboard > Inventario > Nueva Compra
<Breadcrumbs>
  <Crumb to="/">Dashboard</Crumb>
  <Crumb to="/inventario">Inventario</Crumb>
  <Crumb>Nueva Compra</Crumb>
</Breadcrumbs>
```

---

## 📝 Checklist de Implementación

- ✅ BrowserRouter configurado
- ✅ AuthProvider envuelve la app
- ✅ Rutas públicas (login)
- ✅ Rutas protegidas (dashboard, inventario, etc.)
- ✅ Layout con sidebar responsive
- ✅ Navegación con useNavigate()
- ✅ Resaltado de ruta activa con useLocation()
- ✅ Redirecciones (login → dashboard, 404 → dashboard)
- ✅ ComingSoon para módulos pendientes
- ✅ Wrappers para compatibilidad con componentes existentes

---

## 🐛 Troubleshooting

### Problema: "Cannot find module 'react-router-dom'"
```bash
npm install react-router-dom
```

### Problema: Blank screen al navegar
- Verificar que todas las rutas tengan un `element`
- Revisar consola de errores
- Verificar que componentes existan

### Problema: Sidebar no resalta ruta correcta
```tsx
// Verificar lógica de isActive()
const isActive = (path: string) => {
  if (path === '/') return location.pathname === '/';
  return location.pathname.startsWith(path);
};
```

### Problema: 404 no redirige
```tsx
// Asegurar que esté al final de las rutas
<Route path="*" element={<Navigate to="/" replace />} />
```

---

**Sistema de rutas completamente funcional con React Router** ✅

- 📍 8 rutas definidas
- 🔐 Protección de rutas
- 🧭 Navegación bidireccional (sidebar + programática)
- 📱 Responsive completo
- 🎨 Resaltado de ruta activa
- 🔀 Redirecciones inteligentes
