# 🚀 Inicio Rápido - Escocia Hass

Guía rápida para poner en funcionamiento el sistema en **menos de 10 minutos**.

---

## ✅ Checklist Pre-requisitos

Antes de comenzar, asegúrate de tener:

- [ ] Cuenta en [Supabase](https://supabase.com) (gratis)
- [ ] Navegador web moderno (Chrome, Firefox, Safari, Edge)
- [ ] Esta aplicación descargada o clonada

---

## 📝 Paso 1: Configurar Supabase (5 minutos)

### 1.1 Crear Proyecto en Supabase

1. Ve a [supabase.com](https://supabase.com)
2. Click en **"Start your project"** o **"New project"**
3. Dale un nombre: `escocia-hass`
4. Elige una contraseña fuerte para la base de datos
5. Selecciona la región más cercana
6. Click en **"Create new project"**
7. ⏳ Espera 2 minutos mientras se crea...

### 1.2 Obtener Credenciales

Una vez creado el proyecto:

1. En el panel lateral, click en **⚙️ Settings**
2. Click en **API**
3. Encontrarás dos valores importantes:

```
Project URL:  https://xxxxxxxxxxxxx.supabase.co
              └── Copia solo esto: xxxxxxxxxxxxx

anon/public:  eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
              └── Copia todo el texto largo
```

### 1.3 Configurar en la Aplicación

Edita el archivo `/utils/supabase/info.tsx`:

```typescript
// ANTES:
export const projectId = 'tu-project-id';
export const publicAnonKey = 'tu-anon-key-aqui';

// DESPUÉS:
export const projectId = 'xxxxxxxxxxxxx';  // ← Tu project ID
export const publicAnonKey = 'eyJhbGciOiJI...';  // ← Tu anon key completa
```

✅ **¡Listo! Ya está conectado a Supabase**

---

## 🗄️ Paso 2: Crear las Tablas (3 minutos)

### 2.1 Ir al SQL Editor

1. En Supabase, click en **🛢️ SQL Editor** en el panel lateral
2. Click en **"+ New query"**

### 2.2 Ejecutar Script de Tablas

Copia y pega este SQL (o usa el archivo `SUPABASE_CONFIG.md`):

```sql
-- Tabla de usuarios
CREATE TABLE usuarios (
  id UUID PRIMARY KEY REFERENCES auth.users(id),
  nombre TEXT,
  email TEXT,
  rol TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Tabla de productos
CREATE TABLE productos (
  id SERIAL PRIMARY KEY,
  nombre TEXT NOT NULL,
  categoria TEXT,
  unidad_medida TEXT,
  cantidad_actual NUMERIC DEFAULT 0,
  stock_minimo NUMERIC DEFAULT 0,
  precio_unitario NUMERIC,
  estado TEXT DEFAULT 'Disponible',
  activo BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Tabla de compras
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

-- Tabla de movimientos
CREATE TABLE movimientos_inventario (
  id SERIAL PRIMARY KEY,
  producto_id INTEGER REFERENCES productos(id),
  tipo_movimiento TEXT NOT NULL,
  cantidad NUMERIC NOT NULL,
  cantidad_anterior NUMERIC,
  cantidad_nueva NUMERIC,
  referencia_id INTEGER,
  tipo_referencia TEXT,
  notas TEXT,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMP DEFAULT NOW()
);

-- Tablas adicionales para Dashboard completo
CREATE TABLE lotes (
  id SERIAL PRIMARY KEY,
  nombre TEXT NOT NULL,
  hectareas NUMERIC,
  numero_arboles INTEGER,
  variedad TEXT,
  activo BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE aplicaciones (
  id SERIAL PRIMARY KEY,
  nombre_aplicacion TEXT,
  fecha_aplicacion DATE,
  estado TEXT,
  responsable TEXT,
  observaciones TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE plagas_enfermedades_catalogo (
  id SERIAL PRIMARY KEY,
  nombre TEXT NOT NULL,
  tipo TEXT,
  descripcion TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE monitoreos (
  id SERIAL PRIMARY KEY,
  lote_id INTEGER REFERENCES lotes(id),
  plaga_enfermedad_id INTEGER REFERENCES plagas_enfermedades_catalogo(id),
  nivel_incidencia NUMERIC,
  gravedad_numero INTEGER,
  gravedad_texto TEXT,
  fecha_monitoreo DATE,
  observaciones TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE cosechas (
  id SERIAL PRIMARY KEY,
  lote_id INTEGER REFERENCES lotes(id),
  fecha_cosecha DATE,
  kilos_cosechados NUMERIC,
  calidad TEXT,
  responsable TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE clientes (
  id SERIAL PRIMARY KEY,
  nombre_empresa TEXT,
  nit TEXT,
  contacto TEXT,
  telefono TEXT,
  email TEXT,
  ciudad TEXT,
  activo BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE despachos (
  id SERIAL PRIMARY KEY,
  cliente_id INTEGER REFERENCES clientes(id),
  fecha_despacho DATE,
  kilos_despachados NUMERIC,
  precio_kilo NUMERIC,
  valor_total NUMERIC,
  estado TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);
```

3. Click en **"Run"** (abajo derecha)
4. Deberías ver: ✅ **"Success. No rows returned"**

### 2.3 Habilitar Row Level Security (RLS)

Copia y ejecuta esto en una nueva query:

```sql
-- Habilitar RLS
ALTER TABLE usuarios ENABLE ROW LEVEL SECURITY;
ALTER TABLE productos ENABLE ROW LEVEL SECURITY;
ALTER TABLE compras ENABLE ROW LEVEL SECURITY;
ALTER TABLE movimientos_inventario ENABLE ROW LEVEL SECURITY;
ALTER TABLE lotes ENABLE ROW LEVEL SECURITY;
ALTER TABLE aplicaciones ENABLE ROW LEVEL SECURITY;
ALTER TABLE plagas_enfermedades_catalogo ENABLE ROW LEVEL SECURITY;
ALTER TABLE monitoreos ENABLE ROW LEVEL SECURITY;
ALTER TABLE cosechas ENABLE ROW LEVEL SECURITY;
ALTER TABLE clientes ENABLE ROW LEVEL SECURITY;
ALTER TABLE despachos ENABLE ROW LEVEL SECURITY;

-- Políticas simples (permite todo a usuarios autenticados)
CREATE POLICY "Usuarios autenticados" ON productos FOR ALL TO authenticated USING (true);
CREATE POLICY "Usuarios autenticados" ON compras FOR ALL TO authenticated USING (true);
CREATE POLICY "Usuarios autenticados" ON movimientos_inventario FOR ALL TO authenticated USING (true);
CREATE POLICY "Usuarios autenticados" ON lotes FOR ALL TO authenticated USING (true);
CREATE POLICY "Usuarios autenticados" ON aplicaciones FOR ALL TO authenticated USING (true);
CREATE POLICY "Usuarios autenticados" ON plagas_enfermedades_catalogo FOR ALL TO authenticated USING (true);
CREATE POLICY "Usuarios autenticados" ON monitoreos FOR ALL TO authenticated USING (true);
CREATE POLICY "Usuarios autenticados" ON cosechas FOR ALL TO authenticated USING (true);
CREATE POLICY "Usuarios autenticados" ON clientes FOR ALL TO authenticated USING (true);
CREATE POLICY "Usuarios autenticados" ON despachos FOR ALL TO authenticated USING (true);
```

✅ **¡Tablas creadas y protegidas!**

---

## 👤 Paso 3: Crear Usuario de Prueba (2 minutos)

### 3.1 Crear Usuario en Auth

1. En Supabase, click en **🔐 Authentication** > **Users**
2. Click en **"Add user"** > **"Create new user"**
3. Completa:
   ```
   Email:    admin@escocia.com
   Password: Admin123!
   ```
4. ✅ Check **"Auto Confirm User"** (importante!)
5. Click en **"Create user"**
6. **Copia el User UID** (aparece en la lista, algo como `a1b2c3d4-...`)

### 3.2 Crear Perfil del Usuario

Vuelve al SQL Editor y ejecuta:

```sql
INSERT INTO usuarios (id, nombre, email, rol)
VALUES (
  'a1b2c3d4-e5f6-7890-abcd-ef1234567890',  -- ← Reemplaza con tu User UID
  'Administrador Principal',
  'admin@escocia.com',
  'Administrador'
);
```

✅ **¡Usuario listo para hacer login!**

---

## 📊 Paso 4: Cargar Datos de Ejemplo (OPCIONAL)

Si quieres ver el dashboard con datos realistas:

1. En SQL Editor, crea una nueva query
2. Copia y pega TODO el contenido del archivo `SAMPLE_DATA.sql`
3. Click en **"Run"**
4. Espera ~30 segundos
5. ✅ Deberías ver un resumen al final

Esto creará:
- 8 Lotes
- 23 Productos
- Compras, Monitoreos, Aplicaciones
- Cosechas y Ventas de ejemplo

---

## 🎉 Paso 5: Probar la Aplicación

### 5.1 Abrir la Aplicación

1. Abre tu navegador
2. Ve a la URL de tu aplicación (localhost o donde esté desplegada)
3. Deberías ver la pantalla de **Login**

### 5.2 Hacer Login

```
Email:    admin@escocia.com
Password: Admin123!
```

### 5.3 Explorar el Dashboard

Deberías ver:

✅ **6 Cards con Métricas:**
- Inventario: Valor total
- Aplicaciones: En ejecución
- Monitoreo: Incidencias críticas
- Producción: Kilos semanales
- Ventas: Total mensual
- Lotes: Total activos

✅ **Alertas Recientes:**
- Stock bajo
- Monitoreos críticos
- Aplicaciones próximas

✅ **Navegación:**
- Click en sidebar para ir a Inventario
- Prueba "Nueva Compra"
- Explora las diferentes secciones

---

## ✅ Verificación Final

### Todo funciona si:

- [ ] Puedes hacer login con admin@escocia.com
- [ ] Ves tu nombre en el header (Administrador Principal)
- [ ] El dashboard carga sin errores
- [ ] Las métricas muestran números (no ceros)
- [ ] Aparecen alertas en la sección inferior
- [ ] Puedes navegar a Inventario
- [ ] La lista de productos carga
- [ ] Puedes abrir "Nueva Compra"

### Si algo falla:

1. **Abre la consola del navegador** (F12)
2. Busca errores en rojo
3. Verifica que configuraste bien las credenciales en `info.tsx`
4. Revisa que las tablas existan en Supabase
5. Asegúrate de que las políticas RLS estén activas
6. Verifica que el usuario existe y está confirmado

---

## 🎯 Próximos Pasos

Ya tienes el sistema funcionando! Ahora puedes:

1. **Personalizar datos:**
   - Agrega tus propios productos
   - Configura tus lotes reales
   - Registra tus compras

2. **Agregar usuarios:**
   - Crea usuarios para tu equipo
   - Asigna roles (Gerente, Verificador, etc.)

3. **Explorar módulos:**
   - Inventario está completo
   - Dashboard está completo
   - Otros módulos en desarrollo

4. **Leer documentación:**
   - [README.md](./README.md) - Documentación completa
   - [AUTH_SYSTEM.md](./AUTH_SYSTEM.md) - Sistema de autenticación
   - [MIGRATION_GUIDE.md](./MIGRATION_GUIDE.md) - De HTML a React

---

## 🆘 Ayuda Rápida

### Error: "Invalid API key"
```
❌ Problema: Credenciales incorrectas
✅ Solución: Verifica info.tsx, copia las keys correctamente
```

### Error: "Row Level Security"
```
❌ Problema: Políticas RLS no creadas
✅ Solución: Ejecuta el script de RLS del Paso 2.3
```

### Login no funciona
```
❌ Problema: Usuario no existe o no confirmado
✅ Solución: Verifica en Authentication > Users
           - Check "Email Confirmed"
           - Crea perfil en tabla usuarios
```

### Dashboard sin datos
```
❌ Problema: Tablas vacías
✅ Solución: Ejecuta SAMPLE_DATA.sql (Paso 4)
           O agrega tus propios datos
```

### Consola muestra errores
```
❌ Problema: Varios posibles
✅ Solución: Lee el mensaje de error
           - "table does not exist" → Crea las tablas
           - "permission denied" → Verifica RLS
           - "network error" → Verifica credenciales
```

---

## 📞 Recursos

- **Supabase Docs:** https://supabase.com/docs
- **React Docs:** https://react.dev
- **Tailwind CSS:** https://tailwindcss.com

---

**¡Listo! Deberías tener el sistema funcionando en menos de 10 minutos** ⏱️

Si todo salió bien, verás el hermoso dashboard con la paleta de colores verde aguacate 🥑

---

**Tiempo total estimado:** 
- ⚙️ Supabase: 5 min
- 🗄️ Tablas: 3 min  
- 👤 Usuario: 2 min
- 📊 Datos (opcional): 2 min
- 🎉 Prueba: 1 min

**TOTAL: ~10-13 minutos**
