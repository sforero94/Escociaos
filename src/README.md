# 🥑 Escocia Hass - Sistema de Gestión Agrícola

Sistema integral de gestión para cultivo de aguacate Hass de 52 hectáreas con certificación GlobalGAP.

![Version](https://img.shields.io/badge/version-2.0.0-green)
![React](https://img.shields.io/badge/React-18-blue)
![TypeScript](https://img.shields.io/badge/TypeScript-5-blue)
![Supabase](https://img.shields.io/badge/Supabase-2.0-green)

---

## 📋 Características

✅ **Gestión de Inventario** - Control de productos agrícolas con alertas de stock  
✅ **Aplicaciones Fitosanitarias** - Registro y seguimiento de tratamientos  
✅ **Monitoreo de Plagas** - Sistema de alertas por gravedad  
✅ **Control de Producción** - Registro de cosechas y rendimiento  
✅ **Ventas y Despachos** - Gestión de clientes y facturación  
✅ **Trazabilidad GlobalGAP** - Cumplimiento de certificación  
✅ **Autenticación por Roles** - Gerencia, Administradores, Verificadores  
✅ **Mobile-First Responsive** - Optimizado para tablets y móviles  

---

## 🎨 Paleta de Colores

```css
Primary:    #73991C  /* Verde aguacate */
Secondary:  #BFD97D  /* Verde claro */
Background: #F8FAF5  /* Beige claro */
Dark Text:  #172E08  /* Verde oscuro */
Brown:      #4D240F  /* Café tierra */
```

### Efectos Visuales
- 🌊 Glassmorphism en cards
- 🎨 Gradientes en botones y fondos
- 💫 Sombras suaves con color primary
- 🎭 Animaciones hover suaves

---

## 🏗️ Arquitectura

### Tech Stack

```
Frontend:  React 18 + TypeScript
Styling:   Tailwind CSS 4.0
Backend:   Supabase (PostgreSQL + Auth)
Icons:     Lucide React
UI:        shadcn/ui components
```

### Estructura del Proyecto

```
escocia-hass/
├── /components/          # Componentes React
│   ├── /auth/           # Autenticación y protección
│   ├── /inventory/      # Módulo de inventario
│   ├── /ui/             # Componentes UI reutilizables
│   ├── Layout.tsx       # Sidebar y navegación
│   ├── Login.tsx        # Pantalla de login
│   └── Dashboard.tsx    # Dashboard principal
├── /contexts/           # React Context (AuthContext)
├── /utils/              
│   └── /supabase/       # Cliente y configuración
├── /styles/             # Estilos globales
├── App.tsx              # Aplicación principal
└── index.html           # Entry point
```

---

## 🚀 Inicio Rápido

### 1. Configurar Supabase

Edita `/utils/supabase/info.tsx`:

```typescript
export const projectId = 'tu-project-id';
export const publicAnonKey = 'tu-anon-key-aqui';
```

### 2. Crear Tablas en Supabase

Ver [SUPABASE_CONFIG.md](./SUPABASE_CONFIG.md) para SQL completo.

Tablas principales:
- `usuarios` - Perfiles de usuario
- `productos` - Inventario
- `compras` - Registro de compras
- `movimientos_inventario` - Trazabilidad
- `aplicaciones` - Aplicaciones fitosanitarias
- `monitoreos` - Monitoreo de plagas
- `cosechas` - Producción
- `despachos` - Ventas

### 3. Crear Usuario de Prueba

En Supabase Dashboard → Authentication → Users:

```
Email:    admin@escocia.com
Password: Admin123!
```

Luego en SQL Editor:

```sql
INSERT INTO usuarios (id, nombre, email, rol)
VALUES (
  'uuid-del-usuario',
  'Administrador Principal',
  'admin@escocia.com',
  'Administrador'
);
```

### 4. Ejecutar la Aplicación

La aplicación ya está lista para usar. Solo abre el navegador y accede a tu URL de desarrollo.

---

## 📱 Módulos del Sistema

### ✅ Implementados

#### 1. **Login**
- Autenticación con Supabase Auth
- Validación de credenciales
- Redirección automática
- Diseño glassmorphism

#### 2. **Dashboard**
- **6 Cards de Métricas:**
  - Inventario: Valor total + alertas de stock
  - Aplicaciones: En ejecución + próxima programada
  - Monitoreo: Incidencias críticas + último registro
  - Producción: Kilos semanales + promedio por árbol
  - Ventas: Total mensual + clientes activos
  - Lotes: Total activos + más productivo
- **Alertas Recientes:**
  - Stock bajo (productos)
  - Monitoreos críticos
  - Aplicaciones próximas
- **Auto-refresh** cada 30 segundos

#### 3. **Inventario**
- Lista de productos con búsqueda y filtros
- Indicadores de stock (Normal, Bajo, Crítico)
- Nueva compra con:
  - Selección de producto
  - Cantidad y precio
  - Proveedor y factura
  - Lote y fecha de vencimiento
  - Actualización automática de stock
  - Registro en movimientos

### 🚧 Por Implementar

#### 4. **Aplicaciones Fitosanitarias**
- Registro de aplicaciones
- Programación de fumigaciones
- Historial por lote
- Control de productos usados
- Certificación GlobalGAP

#### 5. **Monitoreo de Plagas**
- Registro de monitoreos
- Catálogo de plagas y enfermedades
- Niveles de gravedad
- Fotos de incidencias
- Alertas automáticas

#### 6. **Producción**
- Registro de cosechas
- Calidad y calibre
- Rendimiento por lote
- Estadísticas históricas

#### 7. **Ventas**
- Gestión de clientes
- Registro de despachos
- Facturación
- Seguimiento de pagos

#### 8. **Lotes**
- Mapa de lotes (8 lotes)
- Información por lote:
  - Hectáreas: 52 total
  - Árboles: 12,000 total
  - Variedad: Hass
  - Edad y estado
- Historial de actividades

---

## 🔐 Sistema de Autenticación

### AuthContext

Gestión global de autenticación con React Context:

```typescript
const { user, profile, isAuthenticated, signOut } = useAuth();
```

**Datos disponibles:**
- `user` - Usuario de Supabase Auth
- `profile` - Perfil desde tabla usuarios (nombre, rol, etc.)
- `session` - Sesión activa
- `isLoading` - Estado de carga
- `isAuthenticated` - Boolean de autenticación

### Protección de Rutas

#### ProtectedRoute
Protege rutas completas:

```typescript
<ProtectedRoute fallback={<Login />}>
  <Dashboard />
</ProtectedRoute>
```

#### RoleGuard
Protege secciones por rol:

```typescript
<RoleGuard allowedRoles={['Administrador', 'Gerente']}>
  <FinancialReports />
</RoleGuard>
```

### Roles del Sistema

1. **Administrador** - Acceso completo
2. **Gerente** - Acceso a reportes y configuración
3. **Verificador** - Monitoreo y verificación
4. **Operador** - Operaciones diarias básicas

Ver [AUTH_SYSTEM.md](./AUTH_SYSTEM.md) para documentación completa.

---

## 📊 Base de Datos

### Tablas Principales (23 total)

#### Gestión de Usuarios
- `usuarios` - Perfiles y roles

#### Inventario
- `productos` - Catálogo de productos
- `categorias_productos` - Categorías
- `compras` - Registro de compras
- `movimientos_inventario` - Trazabilidad completa

#### Aplicaciones
- `aplicaciones` - Registro de aplicaciones
- `productos_usados_aplicacion` - Productos por aplicación
- `lotes_aplicados` - Lotes donde se aplicó

#### Monitoreo
- `monitoreos` - Registros de monitoreo
- `plagas_enfermedades_catalogo` - Catálogo
- `fotos_monitoreo` - Evidencias fotográficas

#### Producción
- `cosechas` - Registro de cosechas
- `calidades_cosecha` - Calidad y calibre

#### Ventas
- `clientes` - Base de clientes
- `despachos` - Registro de ventas
- `productos_despachados` - Detalle de despacho

#### Configuración
- `lotes` - 8 lotes del cultivo
- `variedades` - Variedades de aguacate
- `temporadas` - Temporadas de cosecha

Ver [SUPABASE_CONFIG.md](./SUPABASE_CONFIG.md) para SQL completo.

---

## 🎯 Certificación GlobalGAP

El sistema está diseñado para cumplir con GlobalGAP v6:

✅ **Trazabilidad completa** - De la semilla al cliente  
✅ **Registro de aplicaciones** - Productos, dosis, operadores  
✅ **Monitoreo de plagas** - Histórico y evidencias  
✅ **Control de inventario** - Entradas y salidas rastreables  
✅ **Gestión de lotes** - Identificación única  
✅ **Auditoría** - Registro de usuarios y timestamps  

---

## 📈 Información del Cultivo

**Finca:** Escocia Hass  
**Ubicación:** [Tu ubicación]  
**Extensión:** 52 hectáreas  
**Lotes:** 8 lotes productivos  
**Árboles:** 12,000 aproximadamente  
**Variedad:** Hass (100%)  
**Certificación:** GlobalGAP  

---

## 🛠️ Desarrollo

### Estructura de Componentes

```typescript
// Componente típico
import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { getSupabase } from '../utils/supabase/client';

export function MyComponent() {
  const { profile } = useAuth();
  const [data, setData] = useState([]);
  
  useEffect(() => {
    loadData();
  }, []);
  
  const loadData = async () => {
    const supabase = getSupabase();
    const { data, error } = await supabase
      .from('table')
      .select('*');
    
    if (!error) setData(data);
  };
  
  return <div>...</div>;
}
```

### Convenciones de Código

- **TypeScript** para type safety
- **Functional components** con hooks
- **Tailwind CSS** para estilos
- **Paleta de colores** consistente
- **Error handling** en todas las queries
- **Loading states** en componentes async

---

## 📝 Documentación

- [AUTH_SYSTEM.md](./AUTH_SYSTEM.md) - Sistema de autenticación completo
- [SUPABASE_CONFIG.md](./SUPABASE_CONFIG.md) - Configuración de base de datos
- [MIGRATION_GUIDE.md](./MIGRATION_GUIDE.md) - Migración de HTML a React

---

## 🐛 Troubleshooting

### Error: "Invalid API key"
- Verifica las credenciales en `/utils/supabase/info.tsx`
- Asegúrate de usar solo el ID del proyecto, no la URL completa

### Error: "Row Level Security"
- Crea las políticas RLS en Supabase
- Ver [SUPABASE_CONFIG.md](./SUPABASE_CONFIG.md)

### No aparecen datos
- Verifica que las tablas existan
- Revisa la consola del navegador
- Comprueba las políticas RLS

### Login no funciona
- Verifica que el usuario exista en Auth
- Asegúrate de que el email esté confirmado
- Revisa que exista el perfil en tabla `usuarios`

---

## 🚀 Roadmap

### Fase 1 - MVP ✅ COMPLETADA
- [x] Login y autenticación
- [x] Dashboard con métricas
- [x] Inventario (lista y compras)
- [x] Sistema de diseño moderno

### Fase 2 - Módulos Core 🚧 EN PROGRESO
- [ ] Aplicaciones fitosanitarias
- [ ] Monitoreo de plagas
- [ ] Producción y cosechas
- [ ] Ventas y despachos

### Fase 3 - Características Avanzadas
- [ ] Reportes y estadísticas
- [ ] Exportación a PDF/Excel
- [ ] Notificaciones push
- [ ] Modo offline
- [ ] App móvil nativa

### Fase 4 - Optimización
- [ ] Performance optimization
- [ ] PWA (Progressive Web App)
- [ ] Analytics y métricas
- [ ] Backup automático

---

## 👥 Usuarios del Sistema

### Gerencia (Desktop)
- Dashboard completo
- Reportes financieros
- Configuración avanzada
- Gestión de usuarios

### Administradores (Mobile/Desktop)
- Inventario completo
- Aplicaciones
- Monitoreo
- Producción y ventas

### Verificadores (Mobile)
- Monitoreo de plagas
- Verificación de aplicaciones
- Registros de campo
- Fotos de evidencia

---

## 📄 Licencia

Proyecto privado para Finca Escocia Hass.

---

## 🤝 Soporte

Para preguntas o problemas:
1. Revisa la documentación en `/docs`
2. Verifica los logs en consola del navegador
3. Consulta [Supabase Docs](https://supabase.com/docs)
4. Revisa [React Docs](https://react.dev)

---

**Desarrollado con 🥑 para Escocia Hass**
