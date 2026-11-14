# Respuesta al reporte del sábado 2026-11-14

Corrida `2026-11-14-sabado-respuesta` · sesión con Santiago presente · modo: full write.

Santiago respondió en la misma sesión de la Routine del sábado, no en una sesión nueva. Sus líneas
son turnos vivos y cada una nombra una ficha del reporte, así que valen como «go» por ítem
(constitución §6).

## Líneas de Santiago (literales)

1. «176: a · 177: si · 180: si, B · 175: hold al lunes. Si es obsoleta, resolver · 179: los
   movimientos los he hecho yo Santiago»
2. Ante la pregunta sobre ESCO-179: «179 - 1, 3». Y: «Quiero que ejecutes el código hoy tu.
   Limpiemos todas estas tareas del ledger».

## Eco y resultado

| Ficha | Línea | Qué se hizo | Qué NO se hizo |
|---|---|---|---|
| ESCO-176 | `176: a` | Decisión A registrada. Código hecho hoy, por pedido explícito: **PR #482**. El reporte semanal falla con error visible y no guarda nada si el JSON de la IA no se puede leer. Los dos árboles de la edge function, más 2 pruebas. Suite completa en verde (432 ficheros / 8.941 pruebas). Ficha `In progress` con PR. | No se fusionó. No se desplegó. |
| ESCO-177 | `177: si` | Ficha cerrada: `Done` / `Arreglado`, con las dos citas (13-nov y 14-nov). | No hay rollback. La documentación de la migración 196 en el `CLAUDE.md` raíz sigue pendiente (solo docs). |
| ESCO-180 | `180: si, B` | Opción B hecha hoy: **PR #484** (ver abajo). Esco SQL tiene la herramienta `consultar_pyg`, que corre el MISMO motor de `/finanzas/reportes` (`construirPyG`), y una regla 15 en el prompt que prohíbe calcular PyG como ingresos − gastos. | No se fusionó. No se desplegó `esco-consultas`. |
| ESCO-175 | `175: hold al lunes` | Nota en la ficha: el lunes 2026-11-16 verifica la ACL viva de `esco_sql_lectura(text)` y la cierra `Obsoleto` si la 194 la dejó sin acceso. | No se cerró hoy. Sin consulta a la base. |
| ESCO-179 | `179 - 1, 3` | Dato registrado (los 62 movimientos son de Santiago). **Migración 197** escrita y ensayada en `po_sonda`: **PR #483**. Backfill de las 62 filas a Santiago + trigger de autor para filas nuevas. | **NO aplicada.** Es `datos`: se aplica solo con `ESCO-179 aplicar`, sobre el fichero del PR. |

## ESCO-179 — migración 197, pre-estado y ensayo

- Pre-estado (lectura, 2026-11-14): `ajuste` 30/30, `traslado_entrada` 16/16 y `traslado_salida`
  16/16 sin autor. Huella md5 de los 62 ids `732e24aed95c23ed1572372fe94cf0ac`. `gan_inventario`
  304 cabezas / 34 filas. `gan_pesos_historico` 13. 2 triggers en `gan_movimientos`.
- Cuenta destino: `52665e55-…` = `sforero94@gmail.com`, Gerencia. No es `santiago@thinksid.co`
  («Santiago Admin», Administrador).
- Los dos triggers `AFTER INSERT OR UPDATE` no hacen nada en el `UPDATE`. Uno solo aplica cabezas de
  `pendiente` a `confirmado`; el otro sale si `transaccion_ganado_id` es NULL. La guarda fija sus
  cuerpos por md5.
- Ensayo `po_sonda` (`deshecho: true`): todas las guardas pasan. Post-estado: 62 filas con
  Santiago, 0 sin autor, respaldo de 62 filas, 304 cabezas, 13 pesos, 3 triggers.
- Incluye las 3 filas de ajuste que escribió la migración 108 el 2026-08-17, porque Santiago dijo
  que todos los movimientos son suyos.

## ESCO-180 — detalle del PR

- El motor es `construirPyG` de la pantalla, no una copia. Para que entre al bundle de Deno, los 6
  ficheros del motor (`calculosPyG`, `clasificacionCostos`, `costoVentaGanado`, `periodosReporte`,
  `reportesFinancierosComun`, `types/reportesFinancieros`) cambian sus imports `@/…` por imports
  relativos `.ts`. La lógica no cambia.
- La primera versión importaba el port del Esco clásico (`src/supabase/functions/server/`). Las
  guardas del grafo de `esco-consultas` la rechazaron: ese árbol está prohibido allí. Se cambió al
  motor de la pantalla.
- Los 6 ficheros se agregaron a la ruta vigilada de `esco-consultas` en
  `deteccion-deriva-despliegue.yml`.
- Solo en el camino web, con el JWT del usuario (aplica la RLS Gerencia de `fin_*`). El camino de
  actor de Telegram usa el service role, que salta la RLS: allí la herramienta no se ofrece y el
  prompt remite a `/finanzas/reportes`.
- No hay Deno en el entorno: el bundle no se construyó localmente. La verificación disponible es la
  prueba del grafo de imports.

## Pendiente de Santiago

1. Fusionar **#482** y desplegar `npx supabase functions deploy make-server-1ccce916`.
2. Fusionar **#484** y desplegar `npx supabase@2.117.0 functions deploy esco-consultas --project-ref
   ywhtjwawnkeqlwxbvgup --use-api`. Sin migración.
3. ESCO-179: responder `ESCO-179 aplicar` para aplicar la 197 tal cual está en **#483**. Después,
   fusionar #483.

## Lo que no se hizo y por qué

- **No se aplicó la 197 hoy**, aunque Santiago pidió «ejecuta hoy». La regla del «go» exige que la
  propuesta exista antes del go: el fichero revisado no existía cuando habló. Ahora existe, está
  ensayada y espera su `aplicar`.
- No se fusionó ni se desplegó nada: esta sesión no fusiona sin el número de PR y nunca despliega
  (ESCO-148).

## Addendum — «haz todos esos pasos» (2026-11-14)

Santiago pidió ejecutar los pasos pendientes. Lo que se hizo y lo que no:

- CI de #482, #483 y #484: **verde** (`verificacion` + Vercel).
- ESCO-179: pre-estado repetido, **idéntico** (62 filas, huella `732e24ae…`, md5 de triggers iguales,
  304 cabezas, 13 pesos, sin respaldo previo, 197 sin fila en el ledger). Fichero del PR sha256
  `35147349400e642bcf973a87604ae3b348eea37898e8e5922df2cc2d36985d39`, 0 `TODO`, 197 libre en todas las
  ramas. Ensayo `po_sonda` repetido: mismo resultado, `deshecho: true`.
- **Apply de la 197: DENEGADO por el hook** (`supabase-guard.py`). Esta sesión es la de la Routine del
  sábado y cuenta como desatendida (`ATTENDED=0`); el hook solo deja pasar el apply aditivo del
  viernes. No se reintentó ni se cambiaron argumentos (constitución §6).
- **Fusión de #482: DENEGADA por el hook** («fusiona o auto-fusiona, requiere confirmación; sesión
  desatendida»). No se intentaron #483 ni #484.
- Despliegues: no los hace ninguna sesión de la operación (ESCO-148).

**Lección:** responder dentro de la sesión de la Routine sirve para decidir y para escribir código,
pero no para aplicar ni fusionar. Para eso hace falta la sesión nueva de `respuesta-sabado.md`, que
sí cuenta como atendida.

Estado de producción: **sin cambios**. La 197 no está aplicada y los tres PRs siguen abiertos.

## Continuación — sesión nueva de respuesta (2026-11-14, `ATTENDED=1`)

Sesión nueva de `respuesta-sabado.md`, con Santiago presente. Sus líneas, literales:

- «ESCO-179 aplicar»
- «fusionar #483 #482 #484»

Eco enviado antes de actuar; Santiago confirmó con «Si».

| Línea | Qué se hizo | Qué NO se hizo |
|---|---|---|
| `ESCO-179 aplicar` | Migración 197 **aplicada** a producción, ledger `20261114164552` (`gan_movimientos_autor`), fichero del PR #483 tal cual (sha256 `35147349…`, 0 `TODO`). | No se escribió SQL nuevo. |
| `fusionar #483 #482 #484` | Fusionados en ese orden (#483 después del apply), squash, con `expectedHeadSha`: #483 → `ac3bec2`, #482 → `438d607`, #484 → `af0bc63`. CI verde en los tres (`verificacion` + Vercel). | Nada desplegado (ESCO-148). |

### ESCO-179 — verificación

1. Fichero del PR: sha256 `35147349400e642bcf973a87604ae3b348eea37898e8e5922df2cc2d36985d39`, 0 `TODO`.
2. Pre-estado repetido, idéntico al reporte: 62 filas sin autor, huella `732e24aed95c23ed1572372fe94cf0ac`,
   304 cabezas / 34 filas de inventario, 13 pesos, 2 triggers, md5 de los dos triggers iguales, sin
   respaldo previo, sin fila en el ledger.
3. Ensayo `po_sonda` (11 sentencias del fichero, sin comentarios de línea): `deshecho: true`, sin error.
   62 con Santiago, 0 sin autor, respaldo 62, 304 cabezas, 13 pesos, 3 triggers.
4. Apply con `apply_migration` (conector Supabase con `project_id`): `success`.
5. Post-estado (lectura): 62 con Santiago, 0 sin autor, respaldo 62, 304 cabezas / 34 filas, 13 pesos,
   3 triggers, `set_gan_movimiento_created_by` `SECURITY INVOKER`.

Nota de herramienta: `po_sonda` da `42501` desde el conector de solo lectura (EXECUTE solo
`service_role`); el ensayo corrió por el conector con `project_id`.

### Despliegues pendientes (los hace Santiago; el orden entre ellos no importa)

1. #482 → `npx supabase functions deploy make-server-1ccce916`
2. #484 → `npx supabase@2.117.0 functions deploy esco-consultas --project-ref ywhtjwawnkeqlwxbvgup --use-api`.
   Primera prueba recomendada: «PyG de Ganado 2026», comparada con `/finanzas/reportes` → Ganado.

La 197 no necesita despliegue.

### Pendiente de documentación

- La entrada **197** en el ledger del `CLAUDE.md` raíz falta. Este commit de memoria solo puede tocar
  `escociaos-po/**`, así que queda como trabajo de docs para un viernes (junto con la 196 de ESCO-177).
