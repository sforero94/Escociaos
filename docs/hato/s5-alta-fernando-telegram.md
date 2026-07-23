# S5 — Alta de Fernando en el bot de Telegram

**No ejecutado por el agente.** Es una acción de datos de producción (alta de un usuario real del bot) — corresponde al dueño o a un administrador, no a este agente. Este documento entrega ambos caminos: el recomendado (UI ya existente) y el equivalente en SQL crudo, por si se prefiere ese camino.

## Camino recomendado — UI existente (`TelegramConfig.tsx`)

El repo ya tiene un flujo completo para esto en **Configuración → Usuarios → Bot de Telegram** (`src/components/configuracion/TelegramConfig.tsx`, gateado a Gerencia). Es preferible al SQL crudo porque genera el código de vinculación y su expiración con las mismas funciones que usa el resto del sistema (`generarCodigoVinculacion`, `calcularExpiracion`, `src/utils/telegramUsuarios.ts`) — nada que mantener sincronizado a mano.

Pasos:

1. Configuración → Usuarios → pestaña Bot de Telegram → **Nuevo usuario**.
2. Nombre: `Fernando`. Rol en el bot: `campo`.
3. Módulos permitidos: marcar **"Producción Hato Lechero"** (`hato_produccion`, agregado en esta sesión S5 — cubre `/pesaje` y `/produccion` en el bot).
4. Guardar → el sistema genera un código de 8 caracteres y lo muestra en un modal ("Enviar este mensaje al bot: `/start <CODIGO>`"), válido 7 días.
5. Enviar ese código a Fernando (WhatsApp/en persona). Él lo manda como mensaje `/start <CODIGO>` al bot de Telegram (`@escociaos_bot`) y su cuenta queda vinculada automáticamente (`bot.ts`, handler de `/start` con payload).

Si el código expira antes de que Fernando lo use, el botón **Código** (ícono de refrescar) en la fila de Fernando genera uno nuevo sin perder la configuración de módulos.

## Alternativa — SQL directo

Si por algún motivo no se puede usar la UI, este es el INSERT equivalente. **No genera el código de vinculación automáticamente** — hay que generarlo aparte (8 caracteres alfanuméricos en mayúscula, ver `generarCodigoVinculacion()` en `src/utils/telegramUsuarios.ts`) y calcular su expiración (7 días desde hoy).

```sql
-- Alta de Fernando en telegram_usuarios (campo, con acceso al módulo
-- hato_produccion agregado en S5: /pesaje y /produccion). Ejecutar como
-- Administrador/Gerencia contra el proyecto de producción.
INSERT INTO telegram_usuarios (
  nombre_display,
  rol_bot,
  modulos_permitidos,
  codigo_vinculacion,
  codigo_expira_at,
  activo
) VALUES (
  'Fernando',
  'campo',
  ARRAY['hato_produccion'],
  -- Reemplazar por un código real de 8 caracteres (mayúsculas + dígitos),
  -- ej. generado con: SELECT upper(substr(md5(random()::text), 1, 8));
  'REEMPLAZAR',
  now() + interval '7 days',
  true
);
```

Fernando confirma el vínculo enviando `/start REEMPLAZAR` (con el código real) al bot.

### Si más adelante Fernando también necesita otros módulos

`modulos_permitidos` es un `text[]` — para agregar, por ejemplo, `gastos` sin perder `hato_produccion`:

```sql
UPDATE telegram_usuarios
SET modulos_permitidos = array_append(modulos_permitidos, 'gastos')
WHERE nombre_display = 'Fernando'
  AND NOT ('gastos' = ANY(modulos_permitidos));
```

(Cuando S6 — motor de alertas — despliegue el lazo cerrado de Telegram, Fernando también necesitará estar dado de alta como destinatario de alertas; eso lo define esa sesión, no esta.)
