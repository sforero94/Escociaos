# Telegram Bot para Escocia OS — Especificación de Producto

## Contexto

Escocia OS es un sistema completo de gestión agrícola con 9+ módulos, pero **toda la captura de datos depende de la app web**. Esto genera tres fricciones:

1. **Los trabajadores de campo no usan la app web.** Carlos (contratista) y Lucía (monitora) no tienen acceso cómodo a un navegador mientras recorren lotes. Sus datos llegan tarde.
2. **El administrador es cuello de botella.** Santiago (gerencia) centraliza el registro de datos que otros generan verbalmente o en papel.
3. **La brecha tecnológica es innecesaria.** Los trabajadores ya usan apps de mensajería diariamente.

**Propuesta de valor:** Un bot de Telegram que captura los datos más críticos **en el momento y lugar donde ocurren**, sin login, sin navegador. No reemplaza la web — la complementa para flujos de campo.

**¿Por qué Telegram sobre WhatsApp?**
- Setup instantáneo via @BotFather (vs. proceso de aprobación de Meta)
- API 100% gratuita, sin límite de mensajes
- Inline keyboards ilimitados (vs. máx 3 botones en WhatsApp)
- Sin ventana de 24h — el bot puede enviar mensajes proactivos sin restricción
- Sin template messages que requieran aprobación
- SDK maduro: `grammy` (Deno/Node.js, TypeScript nativo)
- Mejor soporte de archivos y fotos

---

## 1. Personas Target

| Persona | Perfil | Módulos Bot |
|---------|--------|-------------|
| **Carlos** (Contratista/Trabajador) | Android básico, instala Telegram | Labores (jornales) |
| **Lucía** (Monitora fitosanitaria) | Teléfono con cámara, recorre lotes | Monitoreo (plagas + fotos) |
| **Santiago** (Gerencia/Admin) | Acceso completo al sistema | Gastos rápidos, consultas IA, todos los módulos |

---

## 2. Priorización de Módulos

| Módulo | Fase | Justificación |
|--------|------|---------------|
| **Labores** (jornales) | **MVP** | Alta frecuencia diaria, pocos campos, máximo beneficio en campo |
| **Monitoreo** (plagas) | **MVP** | Captura en campo con fotos, datos simples, cálculo automático |
| **Finanzas** (gastos rápidos) | **MVP** | Muy frecuente, foto de factura, solo campos esenciales |
| **Consultas IA** (lectura) | **MVP** | Reutiliza Esco existente, valor inmediato para gerencia |
| Inventario (movimientos) | Fase 2 | Útil pero requiere búsqueda de producto + cantidades precisas |
| Producción (kilos) | Fase 2 | Datos simples pero menos frecuente |
| Aplicaciones (mov. diarios) | Fase 3 | Depende de aplicación activa, flujo complejo |
| Empleados, Config, Reportes | **No aplica** | Baja frecuencia o complejidad inherente. Solo web. |

---

## 3. Flujos de Conversación

### 3.1 Comandos de Telegram

```
/start        → Registro inicial o menú principal
/jornal       → Registrar jornales (acceso directo)
/monitoreo    → Registrar monitoreo de plagas
/gasto        → Registrar gasto rápido
/cancelar     → Cancelar flujo activo
/ayuda        → Lista de comandos disponibles
```

### 3.2 Menú Principal

**Trigger:** `/start` o cualquier mensaje sin flujo activo.

```
BOT: ¡Hola Carlos! Soy Esco 🌿
     ¿Qué quieres hacer?

     [📋 Registrar jornal]
     [🔍 Registrar monitoreo]
     [💰 Registrar gasto]
     [💬 Preguntarle a Esco]
```

Usa **inline keyboard** de Telegram. Se filtra por `modulos_permitidos` del usuario.

### 3.3 Registro de Jornales (Labores)

Inserta en `registros_trabajo`. Flujo por tarea con asignación grupal de trabajadores.

**Lógica de campo:** Un capataz asigna tareas al equipo. El mismo trabajador puede estar en múltiples tareas al día con fracciones distintas (ej: Pedro = ½ poda + ½ limpieza). El resultado es una matriz empleado × tarea por día.

**Flujo principal (una ronda = una tarea + fracción + grupo de trabajadores):**

1. **Fecha** → Inline keyboard: `[Hoy] [Ayer] [Otra fecha]`
2. **Tarea** → Inline keyboard con tareas activas (estado "En Proceso" o "Programada"). Paginación con `[← Anterior] [Siguiente →]`
3. **Lote** → Inline keyboard con lotes vinculados a la tarea
4. **Fracción jornal** → `[¼ (2h)] [½ (4h)] [¾ (6h)] [Completo (8h)]`
5. **Trabajadores** → Multi-select con toggles. Cada tap marca/desmarca:

```
👥 ¿Quién trabajó Completo (8h) en Poda?
Toca para seleccionar:

[  Carlos] [  Pedro] [  María]
[  Juan]   [  Ana]   [  Luis]
[✔️ Listo]
```

Los nombres vienen de `empleados` + `terceros` (contratistas) activos. Si hay más de 8, se paginan.

6. **Observaciones** → "Escribe observaciones o toca Saltar" + botón `[Saltar]`
7. **Confirmación** → Resumen del grupo:

```
📋 *Registro de Jornal*
━━━━━━━━━━━━━━━
📅 Fecha: 9 de marzo 2026
📌 Tarea: Poda de formación
🌳 Lote: Lote 3 - La Pradera
⏱ Jornal: Completo (8h)
👥 Carlos, Juan (2 trabajadores)

[✅ Confirmar] [✏️ Corregir] [❌ Cancelar]
```

**Post-registro (iteración rápida):**

```
[👥 Misma tarea, otra fracción]
[📋 Otra tarea] [✅ Terminar]
```

- **`Misma tarea, otra fracción`** → Mantiene fecha, tarea y lote. Vuelve al paso 4 (fracción). Para cuando parte del equipo trabajó ½ jornal y otros el completo en la misma tarea.
- **`Otra tarea`** → Mantiene fecha. Vuelve al paso 2 (selección de tarea).
- **`Terminar`** → Muestra resumen del día y regresa al menú principal.

**Resumen del día (al terminar):**

```
📊 *Resumen del día — 9 de marzo*
━━━━━━━━━━━━━━━━━━━
Carlos: Poda 1.0 ✓
Pedro: Poda 0.5 + Limpieza 0.5 = 1.0 ✓
María: Limpieza 0.75 + Arvenses 0.25 = 1.0 ✓
Juan: Poda 1.0 ✓
⚠️ Ana: Poda 0.5 (total 0.5 — ¿incompleto?)
```

- Se valida server-side que ningún trabajador exceda 1.0 en el día. Si ocurre, se advierte antes de confirmar.
- Los trabajadores con jornada incompleta (< 1.0) se marcan con ⚠️ como recordatorio, pero se permite guardar.

**Ejemplo completo de un día típico (3 rondas):**

1. Poda → Lote 3 → Completo → Carlos, Juan → ✅
2. Misma tarea, otra fracción → ½ → Pedro, Ana → ✅
3. Otra tarea → Limpieza → Lote 2 → ½ → Pedro → ✅
4. Otra tarea → Limpieza → Lote 2 → ¾ → María → ✅
5. Otra tarea → Arvenses → Lote 1 → ¼ → María → ✅
6. Misma tarea, otra fracción → ½ → Ana → ✅
7. Terminar → Resumen del día

### 3.4 Registro de Monitoreo

Inserta en `monitoreos`. Campos calculados server-side.

**Flujo por sublote:** La planilla de campo se organiza por sublote — una hoja por sublote con todas las plagas en filas. El bot replica este flujo: se fija el sublote y los árboles monitoreados, y se itera sobre las plagas encontradas.

**Primer registro del sublote (pasos 1-9):**

1. **Lote** → Inline keyboard con lotes activos
2. **Sublote** → Inline keyboard con sublotes del lote
3. **Árboles monitoreados** → Texto libre (número). Se mantiene fijo para todo el sublote.
4. **Plaga/enfermedad** → Inline keyboard del catálogo activo + botón `[Otra...]`
5. **Árboles afectados** → Texto libre (validación: ≤ monitoreados)
6. **Individuos encontrados** → Texto libre (número)
7. **Foto** (opcional) → "Envía una foto o toca Saltar" + `[Saltar]`
   - Telegram envía la foto como `PhotoSize[]` — se descarga via `getFile()` y se sube a Supabase Storage `monitoreo-fotos/`
8. **Observaciones** → Texto libre o `[Saltar]`
9. **Confirmación** → Resumen con cálculos automáticos:

```
🔍 *Registro de Monitoreo*
━━━━━━━━━━━━━━━
📅 8 de marzo 2026
🌳 Lote 3 - La Cumbre > Sublote A
🐛 Monilia
🌲 Monitoreados: 35 | Afectados: 8
🔢 Individuos: 12

📊 Incidencia: 22.9%
📊 Severidad: 0.34 ind/árbol
⚠️ Gravedad: MEDIA

[✅ Confirmar] [✏️ Corregir] [❌ Cancelar]
```

**Cálculos server-side:**
- `incidencia` = (afectados / monitoreados) × 100
- `severidad` = individuos / monitoreados
- `gravedad`: Baja (<10%), Media (10-30%), Alta (>30%)

**Post-registro (flujo rápido por sublote):**

```
[🐛 Siguiente plaga (mismo sublote)]
[📍 Siguiente sublote] [✅ Terminar]
```

- **`Siguiente plaga`** (principal) → Mantiene lote, sublote y árboles monitoreados. Salta directo al paso 4 (selección de plaga). Esto replica la planilla de campo donde el monitor recorre las filas de plagas para el mismo sublote.
- **`Siguiente sublote`** → Mantiene lote. Vuelve al paso 2 (selección de sublote) y luego pide árboles monitoreados (paso 3), ya que puede variar entre sublotes.
- **`Terminar`** → Regresa al menú principal.

### 3.5 Registro de Gastos

Inserta en `fin_gastos` con estado `Pendiente`. Incluye todos los campos obligatorios de la tabla.

1. **Descripción** → Texto libre ("Compra de guadaña en Ferretería La 14")
2. **Valor** → Número en pesos (validación numérica)
3. **Negocio** → Inline keyboard con `fin_negocios` activos: `[Aguacate] [Hato] [Ganado] [Caballos] [Agrícola]`
4. **Región** → Inline keyboard con `fin_regiones` activas
5. **Categoría** → Inline keyboard con `fin_categorias_gastos`
6. **Concepto** → Inline keyboard con `fin_conceptos_gastos` filtrados por la categoría seleccionada + botón `[Otro...]`
7. **Medio de pago** → Inline keyboard con `fin_medios_pago`: `[Efectivo] [Transferencia] [Tarjeta] [...]`
8. **Foto factura** (opcional) → "Envía foto de factura o toca Saltar" + `[Saltar]`
   - Se sube a Storage, URL en `url_factura`
9. **Confirmación** → Resumen con valor formateado

```
💰 *Registro de Gasto*
━━━━━━━━━━━━━━━
📝 Compra de guadaña en Ferretería La 14
💵 $85.000
🏢 Aguacate
📍 Escocia
📂 Herramientas > Compra herramienta
💳 Efectivo
📎 Factura adjunta ✓
⏳ Estado: Pendiente

[✅ Confirmar] [✏️ Corregir] [❌ Cancelar]
```

**Post-registro:**

```
[💰 Otro gasto] [🏠 Menú principal]
```

### 3.6 Consultas IA (Reutilización de Esco)

Texto libre sin flujo activo → se pasa al motor Esco existente:
- Reutiliza las 10 herramientas (tools) de `chat.ts`
- Respuesta formateada con Markdown de Telegram (bold, italic, code)
- Almacenada en `telegram_mensajes`

Ejemplos:
- "¿Cuántos jornales se trabajaron esta semana?"
- "¿Cuál es la incidencia de Monilia en Lote 3?"
- "¿Cuánto hemos gastado en insumos este mes?"

---

## 4. Arquitectura Técnica

### 4.1 Telegram Bot API

**Setup:** `@BotFather` → crear bot → obtener token. Listo.

**Librería:** `grammy` — framework de bots para Telegram, TypeScript nativo, compatible con Deno (Edge Functions).

**Modo:** Webhook (no polling) — el bot recibe updates via POST al endpoint configurado.

### 4.2 Arquitectura

```
[Telegram User] ←→ [Telegram Bot API]
                           |
                    POST /telegram/webhook
                           ↓
              [Edge Function: telegram-bot.ts]
                           |
                   [grammy middleware]
                           |
              [Auth: identificar usuario
               por telegram_id en
               telegram_usuarios]
                           |
            [Conversation Plugin]
            (grammy conversations —
             gestión de estado built-in)
                           |
          ┌────────┼────────┬────────┐
          │        │        │        │
     [Labores] [Monitoreo] [Gastos] [Esco AI]
   Conversation Conversation Conv.   Handler
          │        │        │        │
          ↓        ↓        ↓        ↓
                 [Supabase DB]
                 (mismas tablas existentes)
```

### 4.3 grammy Conversations

`grammy` tiene un plugin nativo `conversations` que **elimina la necesidad de tablas de sesión manuales**:

```typescript
// Ejemplo simplificado del flujo de jornales
async function jornalConversation(conversation: Conversation, ctx: Context) {
  // Paso 1: Fecha
  await ctx.reply("¿Cuándo trabajaste?", {
    reply_markup: new InlineKeyboard()
      .text("Hoy", "fecha_hoy")
      .text("Ayer", "fecha_ayer")
      .text("Otra fecha", "fecha_otra")
  });
  const fechaCtx = await conversation.waitForCallbackQuery(/^fecha_/);
  const fecha = parseFecha(fechaCtx.callbackQuery.data);

  // Paso 2: Tarea
  const tareas = await conversation.external(() => fetchTareasActivas());
  // ... inline keyboard con tareas

  // Paso 6: Confirmar e insertar
  await conversation.external(() => insertRegistroTrabajo(datos));
}
```

**Ventaja:** El estado del flujo vive en la función misma (como una coroutine). No necesitamos tablas de sesión ni `paso_actual` ni `datos_parciales`. grammy serializa el estado automáticamente.

### 4.4 Endpoint nuevo

Se agrega a `index.ts` del servidor Hono existente:

```
POST /make-server-1ccce916/telegram/webhook  → Recepción de updates
```

Configurar webhook con Telegram:
```
POST https://api.telegram.org/bot<TOKEN>/setWebhook
  ?url=https://<SUPABASE_URL>/functions/v1/make-server-1ccce916/telegram/webhook
```

### 4.5 Autenticación y Vinculación

**Sin login.** Vinculación por Telegram ID:

1. Admin registra al trabajador desde la web (Configuración > Telegram Bot)
2. El trabajador envía `/start` al bot
3. El bot le pide su nombre o cédula para identificarse
4. El admin confirma la vinculación desde la web (o se auto-vincula si el admin pre-registró el Telegram username)
5. `telegram_usuarios` vincula `telegram_id` → `empleado_id` o `contratista_id`
6. `modulos_permitidos` controla qué flujos ve cada usuario

**Flujo de vinculación alternativo (más simple):**
1. Admin genera un código de 6 dígitos desde la web para cada trabajador
2. El trabajador envía `/start CODIGO` al bot
3. El bot lo vincula automáticamente

### 4.6 Reutilización del Motor Esco

De `chat.ts` se reutilizan:
- `executeTool()` y todos los `exec*()` — se importan directamente
- `llmToolLoop()` — tal cual
- `getSystemPrompt()` — con nota de que el usuario está en Telegram
- Auth cambia de JWT a identificación por `telegram_id`

---

## 5. Modelo de Datos Nuevos

### 5.1 Tablas nuevas

```sql
-- Usuarios vinculados a Telegram
CREATE TABLE telegram_usuarios (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  telegram_id bigint NOT NULL UNIQUE,       -- ID numérico de Telegram
  telegram_username text,                    -- @username (opcional)
  usuario_id uuid REFERENCES auth.users(id), -- NULL si no tiene cuenta web
  empleado_id uuid REFERENCES empleados(id),
  contratista_id uuid REFERENCES terceros(id),
  nombre_display text NOT NULL,
  rol_bot text NOT NULL DEFAULT 'campo'
    CHECK (rol_bot IN ('campo', 'admin', 'gerencia')),
  modulos_permitidos text[] DEFAULT '{labores}',
  codigo_vinculacion text,                   -- Código de 6 dígitos temporal
  codigo_expira_at timestamptz,
  activo boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Log de mensajes (auditoría) — opcional pero útil
CREATE TABLE telegram_mensajes (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  telegram_usuario_id uuid REFERENCES telegram_usuarios(id),
  telegram_id bigint NOT NULL,
  direccion text NOT NULL CHECK (direccion IN ('entrante', 'saliente')),
  tipo_mensaje text NOT NULL,               -- 'text' | 'callback_query' | 'photo' | 'command'
  contenido jsonb NOT NULL,
  flujo text,
  created_at timestamptz DEFAULT now()
);

-- RLS: solo service_role accede
ALTER TABLE telegram_usuarios ENABLE ROW LEVEL SECURITY;
ALTER TABLE telegram_mensajes ENABLE ROW LEVEL SECURITY;

-- Índices
CREATE INDEX idx_telegram_usuarios_telegram_id ON telegram_usuarios(telegram_id);
CREATE INDEX idx_telegram_usuarios_codigo ON telegram_usuarios(codigo_vinculacion) WHERE codigo_vinculacion IS NOT NULL;
CREATE INDEX idx_telegram_mensajes_usuario ON telegram_mensajes(telegram_usuario_id);
CREATE INDEX idx_telegram_mensajes_created ON telegram_mensajes(created_at);
```

**Nota:** En webhook mode (stateless), grammy conversations necesita un storage adapter para persistir el estado entre requests. Se usa `@grammyjs/storage-supabase` con una tabla adicional:

```sql
-- Sesiones de grammy conversations (webhook mode requiere persistencia)
CREATE TABLE telegram_sessions (
  key text PRIMARY KEY,
  session jsonb NOT NULL
);

ALTER TABLE telegram_sessions ENABLE ROW LEVEL SECURITY;
```

### 5.2 Cambios a tablas existentes

- **`monitoreos`**: Agregar columna `foto_url text` para fotos del bot
- **`fin_gastos`**: Ya tiene `url_factura` — se reutiliza

### 5.3 Storage (buckets existentes + nuevo)

- **`facturas`** (ya existe) → carpeta `facturas_compra/` para fotos de gastos del bot. Se sube via `supabase.storage.from('facturas').upload('facturas_compra/telegram/{id}.jpg', file)`
- **`monitoreo-fotos`** (nuevo) → bucket para fotos de monitoreo enviadas por Telegram. Path: `{lote_id}/{fecha}/{id}.jpg`

### 5.3 Variables de entorno nuevas (Edge Function secrets)

- `TELEGRAM_BOT_TOKEN` — Token del bot (de @BotFather)
- `TELEGRAM_WEBHOOK_SECRET` — Secret para verificar webhooks (generado por nosotros)

Solo 2 secrets vs. 4 que requeriría WhatsApp.

---

## 6. Fases de Implementación y Esfuerzo

### Fase 1 — MVP (3-4 semanas)

| Componente | Estimación |
|------------|------------|
| Setup Telegram Bot (@BotFather + webhook) | 0.5 días |
| Migración BD (2 tablas nuevas + foto_url) | 0.5 días |
| Edge Function: grammy setup + webhook handler | 1-2 días |
| Middleware: auth por telegram_id | 1 día |
| Flujo de vinculación (código de 6 dígitos) | 1-2 días |
| Conversation: Labores (jornales) | 2-3 días |
| Conversation: Monitoreo (fotos, cálculos) | 2-3 días |
| Conversation: Gastos (foto factura) | 1-2 días |
| Handler: Consultas IA (integración Esco) | 1-2 días |
| Panel web: CRUD usuarios Telegram en Configuración | 2-3 días |
| Testing end-to-end | 2-3 días |
| **TOTAL MVP** | **~12-18 días** |

### Fase 2 — Expansión (2 semanas)

| Componente | Estimación |
|------------|------------|
| Conversation: Movimientos de inventario | 2-3 días |
| Conversation: Registro de producción (kilos) | 1-2 días |
| Notificaciones proactivas ("No has registrado jornal hoy") | 1-2 días |
| Dashboard actividad bot en la web | 2-3 días |
| **TOTAL** | **~6-10 días** |

### Fase 3 — Avanzado (2 semanas)

| Componente | Estimación |
|------------|------------|
| Conversation: Movimientos diarios de aplicaciones | 3-4 días |
| Envío de reportes PDF via Telegram (documento adjunto) | 1-2 días |
| Recordatorios programados (cron-like) | 2-3 días |
| **TOTAL** | **~6-9 días** |

### Comparación de esfuerzo: Telegram vs WhatsApp

| Concepto | WhatsApp | Telegram | Ahorro |
|----------|----------|----------|--------|
| MVP | 20-30 días | 12-18 días | ~40% menos |
| Setup plataforma | 1-2 días | 0.5 días | Inmediato vs proceso de aprobación |
| Session management | 2-3 días (manual) | 0 días (grammy conversations) | Eliminado |
| Webhook + verificación | 2-3 días (HMAC) | 1 día (simple secret) | Más simple |
| Secrets necesarios | 4 | 2 | Mitad |
| Restricciones API | Muchas | Ninguna | Sin fricciones |

### Costos recurrentes

| Concepto | Costo/mes |
|----------|-----------|
| Telegram Bot API | **$0 (gratis)** |
| Supabase Storage (fotos) | ~$1-5 USD |
| Tokens LLM (consultas IA) | ~$1-10 USD |
| **TOTAL** | **~$1-15 USD/mes** |

---

## 7. Consideraciones

### Ventajas de Telegram para este caso

- **Inline keyboards:** botones ilimitados, múltiples filas, callbacks con data
- **Comandos nativos:** menú de comandos visible en la UI del chat
- **Markdown:** el bot puede formatear respuestas con bold, italic, code blocks
- **Archivos:** envío y recepción de fotos y documentos sin restricción
- **Grupos:** posibilidad futura de crear un grupo donde el bot notifique al equipo
- **Sin costos:** API completamente gratuita

### Manejo de errores

| Escenario | Comportamiento |
|-----------|----------------|
| Usuario no vinculado | "No estás registrado. Pide un código de acceso a tu administrador." |
| `/cancelar` durante flujo | Cancela y vuelve al menú |
| Valor no numérico | Re-pide: "Necesito un número. Ej: 50" |
| Muchas opciones (>8 tareas) | Paginación con botones `[← Anterior] [Siguiente →]` |
| Error de BD | "Hubo un error guardando. Intenta de nuevo." + log en `telegram_mensajes` |
| Registro duplicado | "Ya registraste jornal para esta tarea hoy. ¿Reemplazar?" |
| Foto no válida | "No pude procesar la imagen. Intenta otra o toca Saltar." |

### Conectividad de campo
- Telegram funciona bien con 2G/3G
- Mensajes se encolan y entregan cuando hay red
- Fotos se pueden enviar en resolución reducida (Telegram comprime)

### Seguridad
- Bot token se almacena como secret en Supabase Edge Functions
- Webhook verificado con secret header
- RLS en tablas nuevas — solo service_role accede
- No se exponen datos sensibles (salarios, etc.) por el bot
- `modulos_permitidos` limita acceso granular por usuario

---

## Archivos críticos para implementación

- `supabase/functions/make-server-1ccce916/index.ts` — Rutas Hono, agregar endpoint webhook
- `supabase/functions/make-server-1ccce916/chat.ts` — Motor Esco a reutilizar (executeTool, llmToolLoop)
- `src/types/shared.ts` — Tipos de Empleado, Contratista, FraccionJornal
- `src/types/monitoreo.ts` — Tipos de Monitoreo, Plaga, campos calculados
- **Nuevo:** `supabase/functions/make-server-1ccce916/telegram-bot.ts` — Handler principal del bot
- **Nuevo:** `supabase/functions/make-server-1ccce916/telegram/` — Directorio con conversations por módulo
- **Nuevo:** `src/components/configuracion/TelegramConfig.tsx` — Panel web de gestión de usuarios bot

## Verificación

1. Crear bot con @BotFather, configurar webhook apuntando a Edge Function
2. Enviar `/start` al bot → verificar menú principal con inline keyboard
3. Probar flujo de vinculación con código de 6 dígitos
4. Completar flujo de jornales → verificar registro en `registros_trabajo` vía web
5. Completar flujo de monitoreo con foto → verificar en `monitoreos` + foto en Storage
6. Registrar gasto con foto → verificar en `fin_gastos` con estado Pendiente
7. Enviar pregunta libre → verificar respuesta de Esco
8. Probar con usuario no vinculado → verificar mensaje de rechazo
9. Probar `/cancelar` durante flujo → verificar que cancela limpiamente
