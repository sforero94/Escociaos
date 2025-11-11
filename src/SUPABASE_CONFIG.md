# Configuración de Supabase para Escocia Hass

## 📋 Información del Proyecto

Este documento explica cómo configurar correctamente la conexión a Supabase para el Sistema de Gestión Escocia Hass.

---

## 🎯 Arquitectura de Autenticación

El sistema utiliza un **AuthContext** de React que maneja:
- ✅ Autenticación con Supabase Auth
- ✅ Gestión de perfiles de usuario desde tabla `usuarios`
- ✅ Protección de rutas con `ProtectedRoute`
- ✅ Control de acceso por roles con `RoleGuard`
- ✅ Hooks personalizados: `useAuth()`, `useRequireAuth()`, `useRequireRole()`

---

## 🔐 Paso 1: Obtener Credenciales

1. Ve a tu proyecto en [Supabase](https://supabase.com)
2. En el panel lateral, haz clic en **Settings** (⚙️)
3. Luego en **API**
4. Copia los siguientes valores:
   - **Project URL**: `https://xxxxxxxxxxxxx.supabase.co`
   - **Anon/Public Key**: La key pública que comienza con `eyJhbGc...`

## 📝 Paso 2: Configurar las Credenciales

Las credenciales se configuran en el archivo `/utils/supabase/info.tsx`:

```typescript
// ⚠️ REEMPLAZA ESTOS VALORES CON LOS TUYOS
export const projectId = 'tu-project-id'; // Solo el ID, ej: 'abcdefghijk'
export const publicAnonKey = 'tu-anon-key-aqui'; // La key completa
```

## 🗄️ Estructura de Base de Datos Requerida

El sistema espera las siguientes tablas en Supabase:

### Tabla: `usuarios`
```sql
CREATE TABLE usuarios (
  id UUID PRIMARY KEY REFERENCES auth.users(id),
  nombre TEXT,
  email TEXT,
  rol TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);
```

### Tabla: `productos`
```sql
CREATE TABLE productos (
  id SERIAL PRIMARY KEY,
  nombre TEXT NOT NULL,
  categoria TEXT,
  unidad_medida TEXT,
  cantidad_actual NUMERIC DEFAULT 0,
  stock_minimo NUMERIC DEFAULT 0,
  precio_unitario NUMERIC,
  estado TEXT DEFAULT 'Disponible',
  created_at TIMESTAMP DEFAULT NOW()
);
```

### Tabla: `compras`
```sql
CREATE TABLE compras (
  id SERIAL PRIMARY KEY,
  producto_id INTEGER REFERENCES productos(id),
  cantidad NUMERIC NOT NULL,
  precio_unitario NUMERIC NOT NULL,
  proveedor TEXT,
  numero_factura TEXT,
  fecha DATE NOT NULL,
  lote_producto TEXT,
  fecha_vencimiento DATE,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMP DEFAULT NOW()
);
```

### Tabla: `movimientos_inventario`
```sql
CREATE TABLE movimientos_inventario (
  id SERIAL PRIMARY KEY,
  producto_id INTEGER REFERENCES productos(id),
  tipo_movimiento TEXT NOT NULL, -- 'entrada' o 'salida'
  cantidad NUMERIC NOT NULL,
  cantidad_anterior NUMERIC,
  cantidad_nueva NUMERIC,
  referencia_id INTEGER, -- ID de compra, aplicación, etc.
  tipo_referencia TEXT, -- 'compra', 'aplicacion', etc.
  notas TEXT,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMP DEFAULT NOW()
);
```

## 🔒 Configuración de Políticas RLS (Row Level Security)

### Habilitar RLS en todas las tablas:
```sql
ALTER TABLE usuarios ENABLE ROW LEVEL SECURITY;
ALTER TABLE productos ENABLE ROW LEVEL SECURITY;
ALTER TABLE compras ENABLE ROW LEVEL SECURITY;
ALTER TABLE movimientos_inventario ENABLE ROW LEVEL SECURITY;
```

### Políticas de ejemplo para `productos`:
```sql
-- Permitir lectura a usuarios autenticados
CREATE POLICY "Usuarios pueden leer productos"
ON productos FOR SELECT
TO authenticated
USING (true);

-- Permitir inserción a usuarios autenticados
CREATE POLICY "Usuarios pueden crear productos"
ON productos FOR INSERT
TO authenticated
WITH CHECK (true);

-- Permitir actualización a usuarios autenticados
CREATE POLICY "Usuarios pueden actualizar productos"
ON productos FOR UPDATE
TO authenticated
USING (true);
```

### Políticas similares para otras tablas:
```sql
-- Compras
CREATE POLICY "Usuarios pueden leer compras" ON compras FOR SELECT TO authenticated USING (true);
CREATE POLICY "Usuarios pueden crear compras" ON compras FOR INSERT TO authenticated WITH CHECK (true);

-- Movimientos
CREATE POLICY "Usuarios pueden leer movimientos" ON movimientos_inventario FOR SELECT TO authenticated USING (true);
CREATE POLICY "Usuarios pueden crear movimientos" ON movimientos_inventario FOR INSERT TO authenticated WITH CHECK (true);
```

## 👤 Crear Usuario de Prueba

Puedes crear un usuario de prueba desde el panel de Supabase:

1. Ve a **Authentication** > **Users**
2. Haz clic en **Add user** > **Create new user**
3. Ingresa:
   - Email: `admin@escocia.com`
   - Password: `Admin123!`
4. Confirma el email automáticamente

Luego, inserta el perfil en la tabla `usuarios`:
```sql
INSERT INTO usuarios (id, nombre, email, rol)
VALUES (
  'uuid-del-usuario-creado',
  'Administrador',
  'admin@escocia.com',
  'Administrador'
);
```

## ✅ Verificar Conexión

Para verificar que todo esté configurado correctamente:

1. Inicia la aplicación
2. Intenta hacer login con el usuario de prueba
3. Deberías ver el Dashboard con las métricas
4. Ve a Inventario y verifica que puedes ver los productos
5. Intenta registrar una nueva compra

## 🐛 Solución de Problemas

### Error: "Invalid API key"
- Verifica que hayas copiado correctamente la Anon Key
- Asegúrate de no haber incluido espacios al inicio o final

### Error: "Failed to fetch"
- Verifica que el Project URL sea correcto
- Verifica que solo uses el ID del proyecto, no la URL completa en `projectId`

### Error: "Row Level Security"
- Asegúrate de haber creado las políticas RLS
- Verifica que las políticas permitan acceso a usuarios autenticados

### No aparecen datos en el Dashboard
- Inserta datos de prueba en las tablas
- Verifica la consola del navegador para errores
- Revisa que las consultas en Dashboard.tsx coincidan con tu esquema

## 📚 Recursos Adicionales

- [Documentación de Supabase](https://supabase.com/docs)
- [Guía de Row Level Security](https://supabase.com/docs/guides/auth/row-level-security)
- [Supabase Auth](https://supabase.com/docs/guides/auth)

---

**Nota**: Este sistema está optimizado para cultivos de aguacate Hass con certificación GlobalGAP. Las 23 tablas mencionadas en el brief original deben configurarse según las necesidades específicas de trazabilidad del cultivo.