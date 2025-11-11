# 🔐 Sistema de Autenticación - Escocia Hass

## Descripción General

El sistema de autenticación está construido con **React Context API** y **Supabase Auth**, proporcionando protección de rutas y control de acceso basado en roles.

---

## 📚 Componentes Principales

### 1. **AuthContext** (`/contexts/AuthContext.tsx`)

Contexto global que maneja el estado de autenticación en toda la aplicación.

**Características:**
- ✅ Gestión automática de sesiones
- ✅ Carga del perfil de usuario desde la tabla `usuarios`
- ✅ Listener de cambios de autenticación
- ✅ Funciones helper para roles y permisos

**Estado que proporciona:**
```typescript
{
  user: User | null;              // Usuario de Supabase Auth
  profile: UserProfile | null;    // Perfil desde tabla usuarios
  session: Session | null;        // Sesión activa
  isLoading: boolean;             // Estado de carga
  isAuthenticated: boolean;       // ¿Está autenticado?
  signOut: () => Promise<void>;   // Cerrar sesión
  refreshProfile: () => Promise<void>; // Refrescar perfil
  hasRole: (roles: string[]) => boolean; // Verificar rol
}
```

---

## 🎣 Hooks Personalizados

### `useAuth()`
Hook básico para acceder al contexto de autenticación.

```typescript
import { useAuth } from '../contexts/AuthContext';

function MyComponent() {
  const { user, profile, isAuthenticated } = useAuth();
  
  return (
    <div>
      <p>Hola, {profile?.nombre}!</p>
      <p>Tu rol es: {profile?.rol}</p>
    </div>
  );
}
```

### `useRequireAuth()`
Hook que requiere autenticación (muestra advertencia si no hay usuario).

```typescript
import { useRequireAuth } from '../contexts/AuthContext';

function ProtectedComponent() {
  const auth = useRequireAuth();
  
  if (!auth.isAuthenticated) {
    return <div>Cargando...</div>;
  }
  
  return <div>Contenido protegido</div>;
}
```

### `useRequireRole(allowedRoles: string[])`
Hook que verifica roles específicos.

```typescript
import { useRequireRole } from '../contexts/AuthContext';

function AdminPanel() {
  const { hasPermission, profile } = useRequireRole(['Administrador', 'Gerente']);
  
  if (!hasPermission) {
    return <div>No tienes permisos</div>;
  }
  
  return <div>Panel de administración</div>;
}
```

---

## 🛡️ Componentes de Protección

### `<ProtectedRoute>`
Protege rutas completas, requiere autenticación.

```typescript
import { ProtectedRoute } from './components/auth/ProtectedRoute';
import { Login } from './components/Login';

function App() {
  return (
    <ProtectedRoute fallback={<Login />}>
      <Dashboard />
    </ProtectedRoute>
  );
}
```

**Props:**
- `children`: Contenido a mostrar si está autenticado
- `fallback`: Componente a mostrar si NO está autenticado (opcional)

### `<RoleGuard>`
Protege secciones según roles del usuario.

```typescript
import { RoleGuard } from './components/auth/RoleGuard';

function Settings() {
  return (
    <div>
      <h1>Configuración</h1>
      
      {/* Solo Administradores */}
      <RoleGuard allowedRoles={['Administrador']}>
        <div>Panel de Admin</div>
      </RoleGuard>
      
      {/* Gerentes y Administradores */}
      <RoleGuard allowedRoles={['Gerente', 'Administrador']}>
        <div>Reportes Financieros</div>
      </RoleGuard>
    </div>
  );
}
```

**Props:**
- `children`: Contenido a mostrar si tiene permiso
- `allowedRoles`: Array de roles permitidos
- `fallback`: Componente personalizado si no tiene permiso (opcional)
- `onUnauthorized`: Callback cuando no tiene permiso (opcional)

---

## 🔑 Roles Disponibles

El sistema soporta los siguientes roles (definidos en tu base de datos):

1. **Administrador** - Acceso completo al sistema
2. **Gerente** - Acceso a reportes y configuración avanzada
3. **Verificador** - Acceso a monitoreo y verificación
4. **Operador** - Acceso básico a operaciones diarias

---

## 📖 Ejemplos de Uso

### Ejemplo 1: Componente con Información del Usuario

```typescript
import { useAuth } from '../contexts/AuthContext';
import { User } from 'lucide-react';

export function UserProfile() {
  const { profile, signOut } = useAuth();
  
  return (
    <div className="p-4">
      <div className="flex items-center gap-3">
        <User className="w-10 h-10" />
        <div>
          <p className="font-bold">{profile?.nombre}</p>
          <p className="text-sm text-gray-600">{profile?.email}</p>
          <p className="text-xs text-gray-500">{profile?.rol}</p>
        </div>
      </div>
      <button onClick={signOut}>Cerrar Sesión</button>
    </div>
  );
}
```

### Ejemplo 2: Protección de Módulo Completo

```typescript
import { RoleGuard } from './components/auth/RoleGuard';
import { FinancialReports } from './components/FinancialReports';

export function ReportsModule() {
  return (
    <RoleGuard 
      allowedRoles={['Gerente', 'Administrador']}
      onUnauthorized={() => console.log('Acceso denegado a reportes')}
    >
      <FinancialReports />
    </RoleGuard>
  );
}
```

### Ejemplo 3: Mostrar Contenido Diferente por Rol

```typescript
import { useAuth } from '../contexts/AuthContext';

export function Dashboard() {
  const { hasRole } = useAuth();
  
  return (
    <div>
      <h1>Dashboard</h1>
      
      {hasRole(['Administrador']) && (
        <div>Vista de Administrador</div>
      )}
      
      {hasRole(['Gerente', 'Administrador']) && (
        <div>Reportes Financieros</div>
      )}
      
      {/* Contenido para todos */}
      <div>Vista General</div>
    </div>
  );
}
```

### Ejemplo 4: Botón Condicional por Rol

```typescript
import { useAuth } from '../contexts/AuthContext';
import { Button } from './ui/button';

export function ActionButtons() {
  const { hasRole } = useAuth();
  
  return (
    <div className="flex gap-2">
      <Button>Ver Inventario</Button>
      
      {hasRole(['Administrador', 'Gerente']) && (
        <Button variant="destructive">Eliminar Producto</Button>
      )}
      
      {hasRole(['Administrador']) && (
        <Button>Configuración Avanzada</Button>
      )}
    </div>
  );
}
```

---

## 🔄 Flujo de Autenticación

```
1. Usuario carga la app
   ↓
2. AuthProvider verifica sesión activa
   ↓
3. Si hay sesión → Carga perfil desde tabla usuarios
   ↓
4. ProtectedRoute verifica autenticación
   ↓
5. Si está autenticado → Muestra contenido
   Si NO → Muestra Login
   ↓
6. Usuario hace login
   ↓
7. AuthContext escucha el evento SIGNED_IN
   ↓
8. Carga automáticamente el perfil
   ↓
9. ProtectedRoute detecta cambio y muestra contenido
```

---

## 🚀 Integración en tu App

### Paso 1: Envolver la app con AuthProvider

```typescript
// App.tsx
import { AuthProvider } from './contexts/AuthContext';

function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}
```

### Paso 2: Usar ProtectedRoute

```typescript
// AppContent.tsx
import { ProtectedRoute } from './components/auth/ProtectedRoute';
import { Login } from './components/Login';
import { Dashboard } from './components/Dashboard';

function AppContent() {
  return (
    <ProtectedRoute fallback={<Login />}>
      <Dashboard />
    </ProtectedRoute>
  );
}
```

### Paso 3: Usar RoleGuard donde necesites

```typescript
// Dashboard.tsx
import { RoleGuard } from './components/auth/RoleGuard';

function Dashboard() {
  return (
    <div>
      <h1>Dashboard</h1>
      
      <RoleGuard allowedRoles={['Administrador']}>
        <AdminPanel />
      </RoleGuard>
    </div>
  );
}
```

---

## 📝 Notas Importantes

1. **AuthProvider debe estar en la raíz** - Envuelve toda tu aplicación
2. **RoleGuard es opcional** - Solo úsalo donde necesites control de acceso por rol
3. **Los roles se definen en la tabla usuarios** - Asegúrate de tener el campo `rol`
4. **La sesión persiste** - Supabase mantiene la sesión activa entre recargas
5. **Escucha cambios automáticamente** - No necesitas refrescar manualmente

---

## 🎯 Mejores Prácticas

✅ **SÍ hacer:**
- Usar `useAuth()` en componentes que necesiten info del usuario
- Usar `<RoleGuard>` para proteger secciones sensibles
- Definir roles claros y específicos en la base de datos
- Manejar el estado de carga (`isLoading`)

❌ **NO hacer:**
- No verificar roles solo en el frontend (también en backend)
- No almacenar información sensible en el perfil del usuario
- No confiar ciegamente en el rol del frontend
- No olvidar las políticas RLS en Supabase

---

## 🔍 Debugging

Si tienes problemas:

```typescript
// En cualquier componente
const auth = useAuth();

console.log('Usuario:', auth.user);
console.log('Perfil:', auth.profile);
console.log('Sesión:', auth.session);
console.log('¿Autenticado?:', auth.isAuthenticated);
console.log('¿Es Admin?:', auth.hasRole(['Administrador']));
```

---

## 📚 Ver También

- [SUPABASE_CONFIG.md](./SUPABASE_CONFIG.md) - Configuración de Supabase
- [Documentación de Supabase Auth](https://supabase.com/docs/guides/auth)
- [React Context API](https://react.dev/reference/react/useContext)
