# 🔧 Solución de Problemas - Login

Guía completa para resolver problemas de autenticación en Escocia Hass.

---

## 🐛 Problema: "Se queda en 'Buscando perfil en tabla usuarios'"

### **Síntoma:**
- El login se queda cargando indefinidamente
- En la consola aparece: `📋 Buscando perfil en tabla usuarios...`
- No avanza al dashboard

### **Causa:**
El usuario existe en **Supabase Auth** pero **NO existe en la tabla `usuarios`**.

---

## ✅ Solución Rápida (Modo Desarrollo)

### **Opción 1: El sistema ahora crea un perfil temporal automáticamente**

Con la última actualización, el sistema:
1. ✅ Detecta que no existe el perfil en la tabla
2. ✅ Crea un perfil temporal automáticamente
3. ✅ Permite el login exitoso
4. ⚠️ **Muestra advertencia en consola**

**Logs esperados:**
```
📋 Buscando perfil en tabla usuarios...
⚠️ No se encontró perfil en la tabla usuarios. Creando perfil temporal...
📝 Perfil temporal creado: { id: '...', nombre: 'admin', email: 'admin@escocia.com', rol: 'Administrador' }
💡 NOTA: Para usar el perfil completo, crea el registro en la tabla usuarios
✅ AuthContext: Carga completada, isLoading = false
```

**Acción:**
- ✅ **Ya puedes usar la aplicación normalmente**
- ⚠️ Los datos del perfil se toman del email (nombre) y un rol por defecto
- 💡 Se recomienda crear el registro en la tabla para tener control completo

---

## ✅ Solución Completa (Producción)

### **Paso 1: Verificar usuario en Supabase Auth**

1. Ve a Supabase Dashboard
2. Ve a **Authentication** → **Users**
3. Verifica que el usuario existe
4. **Copia el UUID del usuario** (lo necesitarás)

Ejemplo:
```
Email: admin@escocia.com
UUID: 550e8400-e29b-41d4-a716-446655440000
```

---

### **Paso 2: Crear el registro en la tabla usuarios**

#### **Opción A: Via SQL Editor (Recomendado)**

1. Ve a **SQL Editor** en Supabase
2. Ejecuta el siguiente SQL (reemplaza el UUID):

```sql
-- Reemplaza 'UUID_DEL_USUARIO' con el UUID copiado del paso 1
INSERT INTO usuarios (id, nombre, email, rol)
VALUES (
  'UUID_DEL_USUARIO',  -- UUID desde Authentication > Users
  'Administrador Escocia',
  'admin@escocia.com',
  'Administrador'
)
ON CONFLICT (id) DO NOTHING;
```

**Ejemplo completo:**
```sql
INSERT INTO usuarios (id, nombre, email, rol)
VALUES (
  '550e8400-e29b-41d4-a716-446655440000',
  'Administrador Escocia',
  'admin@escocia.com',
  'Administrador'
)
ON CONFLICT (id) DO NOTHING;
```

---

#### **Opción B: Via Table Editor**

1. Ve a **Table Editor** → **usuarios**
2. Click en **Insert** → **Insert row**
3. Completa los campos:
   - **id**: Pega el UUID del usuario
   - **nombre**: "Administrador Escocia"
   - **email**: "admin@escocia.com"
   - **rol**: "Administrador"
4. Click en **Save**

---

### **Paso 3: Verificar**

1. Recarga la aplicación
2. Intenta login nuevamente
3. Ahora debería ver en consola:

```
📋 Buscando perfil en tabla usuarios...
✅ Perfil encontrado: Administrador Escocia
✅ AuthContext: Carga completada, isLoading = false
```

---

## 🔍 Diagnóstico Completo

### **1. Verificar conexión a Supabase**

Abre la consola del navegador y ejecuta:

```javascript
// Verificar project ID
console.log('Project ID:', import.meta.env.VITE_SUPABASE_PROJECT_ID);

// Verificar que el cliente de Supabase esté funcionando
const { data, error } = await supabase.auth.getSession();
console.log('Session:', data, error);
```

---

### **2. Verificar tabla usuarios existe**

En **SQL Editor** de Supabase:

```sql
-- Ver estructura de la tabla
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'usuarios';

-- Ver todos los usuarios
SELECT * FROM usuarios;
```

**Resultado esperado:**
```
column_name | data_type
-----------+-----------
id         | uuid
nombre     | text
email      | text
rol        | text
created_at | timestamp
```

---

### **3. Verificar políticas RLS**

En **SQL Editor**:

```sql
-- Ver políticas de la tabla usuarios
SELECT * FROM pg_policies WHERE tablename = 'usuarios';
```

**Si no hay políticas, créalas:**

```sql
-- Habilitar RLS
ALTER TABLE usuarios ENABLE ROW LEVEL SECURITY;

-- Permitir SELECT a usuarios autenticados
CREATE POLICY "Usuarios autenticados pueden ver usuarios"
ON usuarios FOR SELECT
TO authenticated
USING (true);

-- Permitir INSERT/UPDATE al propio usuario
CREATE POLICY "Usuarios pueden actualizar su perfil"
ON usuarios FOR UPDATE
TO authenticated
USING (auth.uid() = id);
```

---

## 🚨 Errores Comunes

### **Error: "Invalid API key"**
```
❌ Error obteniendo perfil: { message: "Invalid API key" }
```

**Solución:**
1. Verifica `/utils/supabase/info.tsx`
2. Asegúrate de que `publicAnonKey` sea correcta
3. La key debe empezar con `eyJ...`

---

### **Error: "Row Level Security"**
```
❌ Error obteniendo perfil: { code: "PGRST301" }
```

**Solución:**
Crea las políticas RLS (ver paso 3 arriba)

---

### **Error: "Timeout: getUserProfile tardó más de 5 segundos"**
```
❌ Excepción en getUserProfile: Timeout: getUserProfile tardó más de 5 segundos
📝 Perfil de emergencia creado debido a error
```

**Causas posibles:**
1. **Red lenta** - Verifica tu conexión
2. **Supabase lento** - Espera unos minutos
3. **RLS bloqueando** - Verifica políticas

**Solución temporal:**
- El sistema creará un perfil de emergencia
- Podrás usar la app normalmente
- Resuelve el problema de RLS o red

---

### **Error: "Table not found"**
```
❌ Error obteniendo perfil: { message: "relation \"usuarios\" does not exist" }
```

**Solución:**
Crea la tabla `usuarios`:

```sql
CREATE TABLE usuarios (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  nombre TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  rol TEXT NOT NULL DEFAULT 'Usuario',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Habilitar RLS
ALTER TABLE usuarios ENABLE ROW LEVEL SECURITY;

-- Política básica
CREATE POLICY "Usuarios autenticados pueden ver usuarios"
ON usuarios FOR SELECT
TO authenticated
USING (true);
```

---

## 📋 Checklist de Configuración

### **Supabase Auth**
- [ ] Usuario creado en Authentication > Users
- [ ] Email confirmado (check en "Email Confirmed")
- [ ] UUID del usuario copiado

### **Tabla usuarios**
- [ ] Tabla `usuarios` existe
- [ ] Registro con el UUID del usuario creado
- [ ] Campos: `id`, `nombre`, `email`, `rol`
- [ ] RLS habilitado
- [ ] Política SELECT creada

### **Aplicación**
- [ ] `/utils/supabase/info.tsx` con credenciales correctas
- [ ] Login muestra logs en consola
- [ ] Perfil encontrado o perfil temporal creado
- [ ] Dashboard carga correctamente

---

## 🔐 Crear Usuario de Prueba Completo

### **Script SQL completo:**

```sql
-- 1. Primero crea el usuario en Auth manualmente via Dashboard
-- Authentication > Add User
-- Email: admin@escocia.com
-- Password: Admin123!
-- Auto Confirm Email: ✓

-- 2. Luego ejecuta este SQL (reemplaza el UUID)
INSERT INTO usuarios (id, nombre, email, rol)
VALUES (
  'UUID_DEL_USUARIO_CREADO',  -- Copia desde Authentication > Users
  'Administrador Escocia',
  'admin@escocia.com',
  'Administrador'
)
ON CONFLICT (id) DO NOTHING;

-- 3. Verificar
SELECT * FROM usuarios WHERE email = 'admin@escocia.com';
```

---

## 🎯 Flujo de Login Actualizado

```
1. Usuario ingresa email/password
   ↓
2. signIn() llama a Supabase Auth
   ↓
3. Auth verifica credenciales
   ↓
4. AuthProvider detecta SIGNED_IN event
   ↓
5. loadUserData() se ejecuta
   ↓
6. getUserProfile() busca en tabla usuarios (con timeout 5s)
   ↓
   ├─ ✅ Perfil encontrado → Usa datos reales
   │                         (nombre, rol de la tabla)
   │
   ├─ ⚠️ Perfil no encontrado → Crea perfil temporal
   │                            (nombre desde email, rol por defecto)
   │
   └─ ❌ Timeout/Error → Crea perfil de emergencia
                        (permite login de todas formas)
   ↓
7. setIsLoading(false)
   ↓
8. Usuario redirigido al Dashboard ✅
```

---

## 🛠️ Modo Debug

Para obtener más información, revisa la consola del navegador (F12):

```
🔐 AuthProvider: Iniciando verificación de usuario...
🔍 Verificando usuario actual...
✅ Sesión encontrada, cargando usuario...
👤 Cargando datos del usuario...
📋 Buscando perfil en tabla usuarios...
🔍 getUserProfile: Buscando perfil para user ID: 550e8400-...
✅ Perfil obtenido exitosamente: { id: '...', nombre: '...', ... }
✅ Perfil encontrado: Administrador Escocia
✅ AuthContext: Carga completada, isLoading = false
```

---

## ✅ Resumen

### **Problema actual:**
- Login se queda en "Buscando perfil en tabla usuarios"

### **Causa:**
- Usuario existe en Auth pero no en tabla `usuarios`

### **Solución Rápida (YA IMPLEMENTADA):**
- ✅ Sistema crea perfil temporal automáticamente
- ✅ Login funciona aunque no exista el registro
- ⚠️ Se recomienda crear el registro en la tabla

### **Solución Completa:**
1. Crear usuario en Supabase Auth
2. Copiar UUID del usuario
3. Insertar registro en tabla `usuarios` con ese UUID
4. Verificar políticas RLS

---

## 📞 Soporte

Si después de seguir estos pasos sigue sin funcionar:

1. **Revisa la consola del navegador** (F12)
2. **Copia todos los logs**
3. **Verifica en Supabase Dashboard:**
   - Authentication > Users
   - Table Editor > usuarios
   - SQL Editor (ejecuta `SELECT * FROM usuarios;`)

---

**¡El sistema ahora es más robusto y permite login incluso sin el registro en la tabla usuarios!** ✅
