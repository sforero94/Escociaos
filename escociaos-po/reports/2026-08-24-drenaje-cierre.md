# Escocia OS — corrida `2026-08-24-drenaje-cierre` · modo: full write

Continuación de `2026-08-24-drenaje.md`. Ejecuta §1 del runbook
`runbooks/drenaje-backlog.md` (W3 + cierres pendientes).

## RESUMEN (ES)

Se cerró **#3** (el divisor del jornal) tras comprobar que **las dos mitades ya
están vivas en producción** — el criterio que traía el runbook partía de una
premisa falsa. Se escribió, revisó adversarialmente y corrigió la migración
**109** para **#20**, y ahí apareció el hallazgo que vale más que la migración:
**el carril de migraciones aditivas ya no puede tocar `storage.objects`** —
`apply_migration` corre como `postgres`, que hoy no es dueño de esa tabla, y en
julio sí podía. Los dos pendientes que quedan **no son de esfuerzo, son de
credencial**: el P0 del webhook de Telegram necesita un token que no está en
ningún disco, y el detector de deriva necesita un secreto de repositorio. Los
dos están escalados con su comando exacto.

**Backlog: 23 → 22 abiertos.**

```
P0: 0 · P1: 0 · P2: 0 · P3: 0   (nuevos)  |  cerrados: 1
```

Ningún hallazgo nuevo, que es lo correcto: una corrida de drenaje que archiva
uno es una corrida que drenó.

---

## Lo que se cerró

### #3 — dos divisores del jornal · `Done` / `Arreglado`

Cerrado **contra el despliegue, no contra el merge** (§5 del contrato). El
runbook pedía `version > 215`; la versión sigue en 215 **y aun así el arreglo
está vivo**, porque el despliegue de las 15:52:43Z es *posterior* al merge del
PR #144 (15:49:12Z). Tres comprobaciones independientes:

| # | Comprobación | Resultado |
|---|---|---|
| a | `git merge-base --is-ancestor 8f6141c 3926169` | sí — el merge es ancestro del árbol desplegado |
| b | `telegram/conversations/jornal.ts` en ese árbol | `const DIAS_LABORALES_MES = 22` (:31), `/ DIAS_LABORALES_MES` (:57) |
| c | reflog + `mtime` del worktree | árbol en `b70206e` a las **15:52:01Z**, `jornal.ts` escrito a las **15:52:01Z** — 42 s antes del despliegue |

Los dos commits posteriores de ese worktree (16:09Z, 16:10Z) son sólo
documentación: `index.ts` y `bot.ts` conservan `mtime` del 2026-08-21.

**Mitad navegador**, sonda de contenido sobre `escociaos.vercel.app`:

- *Control positivo válido* — `fraccion_jornal` y `tarifa_jornal` aparecen en
  los chunks `Labores`, `CierreAplicacionWrapper`, `DailyMovementsDashboard` y
  `JornalFractionMatrix`. La sonda sí ve el código de la app.
- *Sonda* — el literal `4.33` **no aparece en ninguno de los 192 chunks de la
  aplicación**; su única ocurrencia es el vendor `jspdf.es.min`.
  `WEEKS_PER_MONTH = 4.33` quedó fuera de producción.

Guarda contra regresión ya en el repo: `src/__tests__/jornalDivisorContract.test.ts`
compara los tres árboles que no pueden importarse entre sí. Verde hoy.

---

## Lo que se hizo y **no** se aplicó

### #20 — borrado de `reportes-semanales` · PR [#154](https://github.com/sforero94/Escociaos/pull/154), `In progress`

Migración `109_storage_reportes_delete_gerencia.sql`. Las cinco compuertas:

| Compuerta | Resultado |
|---|---|
| 1 · aditiva por lista blanca | ✅ `ALTER POLICY` + `COMMENT ON` + dos `DO $$` de guardas |
| 2 · guardas propias pre/post | ✅ línea base **relativa**, sin literal envejecible |
| 3 · **revisión adversarial independiente** | ❌ **UNSAFE** — y acertó |
| 4 · numeración | ✅ 109 (máx. fichero 108; ledger en `20260824155733`) |
| 5 · fidelidad de bytes | n/a — no se aplicó |

**Compuerta 3 falla ⇒ la migración no se aplica.** Es el resultado correcto, no
un fallo de la corrida.

#### El bloqueante, y por qué sobrevive a esta migración

`ALTER POLICY` y `COMMENT ON POLICY` exigen ser **dueño** de la tabla. Ningún
`GRANT` lo confiere, por completo que sea. `storage.objects` pertenece a
`supabase_storage_admin`; `apply_migration` corre como `postgres`, que hoy no
llega a ese rol por ninguna vía. Probado con una **sonda que aborta por
construcción** — no aplicó nada, cero filas en el ledger, predicado intacto:

```
current_user = postgres | session_user = postgres
pg_has_role(current_user,'supabase_storage_admin','USAGE')  = f
pg_has_role(current_user,'supabase_storage_admin','MEMBER') = f
pg_has_role(current_user, relowner_de_storage_objects,'USAGE') = f
```

**Antes sí se podía**: la migración 072 creó cuatro políticas sobre esa misma
tabla y tiene fila en el ledger con versión de marca de tiempo
(`20260730002128`), el formato que genera `apply_migration`. Entremedio el
servicio de Storage corrió migraciones propias el 2026-08-10, 08-20 y 08-23.

> **El carril `ddl_aditivo` ya no alcanza `storage.objects`.** Cualquier
> hallazgo futuro sobre políticas de Storage necesita otra vía desde el
> principio: panel de Supabase → Storage → Policies, que corre como el dueño.

#### Lo que la revisión adversarial atrapó además del bloqueante

Todo verificado por mi cuenta contra el catálogo vivo antes de aceptarlo:

1. **Una afirmación falsa que el `COMMENT ON POLICY` habría grabado de forma
   permanente en el catálogo.** Decía «los seis buckets restantes reservan el
   borrado». Hay **7 buckets y sólo 5 llevan políticas**: `monitoreo-fotos`
   (1 objeto) y `photos` (2) no tienen ninguna — son deny-all para el navegador,
   que no es lo mismo que reservar el borrado.
2. **`Monitor` no es una etiqueta de `public.rol_usuario`.** Contra `pg_enum` el
   enum es `{Administrador, Verificador, Gerencia}`. El riesgo latente de #20 es
   una cuenta **Verificador**, y sólo esa. *El `CLAUDE.md` raíz nombra un rol
   `Monitor` que no existe en este enum* — anotado en memoria.
3. **La post-condición 3.1 era una guarda de mentira.** Comparaba tres
   subcadenas, así que un predicado **sin correlacionar** como
   `EXISTS (SELECT 1 FROM usuarios WHERE rol='Gerencia')` — cierto para
   *cualquier* autenticado mientras exista un solo Gerencia — la habría pasado.
   Ahora exige también `auth.uid()`.
4. **`current_setting` sin `missing_ok`** habría abortado por un no-problema si
   el ejecutor repartiera las sentencias en sesiones distintas.

Ningún consumidor se rompe, verificado por dos vías independientes: la única
llamada de borrado de Storage en `src/`, `supabase/` y `scripts/` es
`PurchaseHistory.tsx:365`, sobre `facturas`. En `reporteSemanalService.ts` los
cinco toques al bucket son `.upload(..., {upsert:true})` y `.download(...)`;
`upsert` es INSERT/UPDATE con cabecera `x-upsert`, jamás DELETE. Ningún cron
toca storage (`cron.job` tiene cuatro: clima ×2, hato-alertas, acciones).

---

## Lo que quedó abierto, y por qué

### #11 — webhook de Telegram · P0 · `In progress`

**El agujero sigue abierto en producción.** La v215 se desplegó desde un árbol
cuyo `bot.ts` es del 2026-08-21 y no contiene `X-Telegram-Bot-Api-Secret-Token`
(grep: 0 coincidencias). El commit que trae la puerta (`2fb31fc`, PR #150) es de
las **16:25:54Z**, posterior al despliegue.

Bloqueado en el paso 3 de la rotación: necesita `TELEGRAM_BOT_TOKEN`, y
`supabase secrets list` devuelve **sólo nombres y digests sha256**. Barrido de
`.env`, `.env.local`, `supabase/.temp` y todo el repo: el token no está en
ningún disco, sólo referencias `Deno.env.get(...)` en código. El runbook manda
parar y pedirlo.

> **Hallazgo nuevo que cambia la decisión: la puerta existía y la borraron.**
> `git show e799142` (2026-03-18, *Add Telegram bot user management*) **elimina**
> cuatro líneas que ya estaban en producción:
>
> ```ts
> const secret = c.req.header("X-Telegram-Bot-Api-Secret-Token");
> if (secret !== Deno.env.get("TELEGRAM_WEBHOOK_SECRET")) {
>   return c.json({ error: "Unauthorized" }, 401);
> }
> ```
>
> Esto **no es una protección que nunca se puso: es una regresión de marzo**. Y
> `secrets list` confirma que `TELEGRAM_WEBHOOK_SECRET` se creó el 2026-03-18 a
> las 21:18, **cuatro minutos después** de `TELEGRAM_BOT_TOKEN` (21:14) — la
> firma de un alta que sí registró el webhook con `secret_token`.
>
> Si aquel registro sigue vigente (Telegram no caduca el `secret_token` de un
> webhook), Telegram lleva desde marzo mandando el encabezado con un valor que
> el secreto guardado todavía iguala, y entonces **el paso 4 solo — desplegar —
> cierra el P0 sin rotar nada y sin caída**. No es demostrable desde aquí sin el
> bot token: `getWebhookInfo` tampoco revela si hay `secret_token`.

### #22 — detector de deriva · P1 · `In progress`

El código está fusionado y es correcto. Falta el secreto de repositorio
`SUPABASE_ACCESS_TOKEN`: `gh secret list` devuelve vacío y `gh run list` sobre
el workflow devuelve **cero corridas**. Sin él el script sale 1 a propósito
(falla cerrado), así que dispararlo hoy no probaría nada.

Validado todo lo que no depende del token:

- **Camino de fallo cerrado** — sin la variable imprime el error esperado y sale 1.
- **Tests unitarios** — 8 pasan, en `node --test` y dentro de vitest.
- **La lógica acierta contra producción hoy.** Alimentando `evaluarDeriva()` con
  el `updated_at` real del despliegue vivo (`1787586763349` =
  2026-08-24T15:52:43.349Z) y con
  `git log -1 --format=%cI origin/main -- supabase/functions/make-server-1ccce916`
  (2026-08-24T16:25:54Z, `2fb31fc`) devuelve `hayDeriva: true`,
  `horasDeDeriva: 0.6`. **Es exactamente el agujero del webhook que sigue
  abierto: el detector lo habría cantado.**

Ojo con el criterio de cierre: **hoy el workflow saldría rojo con razón**,
porque la deriva es real. Sale verde recién después del despliegue que cierra
#11.

---

## Salud de producción durante la corrida

| | |
|---|---|
| Clima | última lectura hace **3 min**, 435 lecturas en la ventana de 24 h, últimos 5 POST del cron en **200**. El despliegue de ESCO-1 no lo rompió |
| Ledger de migraciones | intacto en `20260824155733`; la sonda no dejó fila |
| `storage.objects` | predicado DELETE sin tocar, 49 objetos |
| Padrón | 8 cuentas activas: **5 Gerencia + 3 Administrador**, cero inactivas, cero Verificador |

## Compuertas de PR

`npm run lint` 0 errores (904 avisos preexistentes) · `npm run typecheck` limpio
· `npm test` 131 ficheros, **2.966 tests**, todos verdes.

> Nota de entorno: el worktree no traía `node_modules` propio y resolvía hacia
> arriba, al del repo principal, donde `@tailwindcss/node` está declarado en
> `package.json` pero **no instalado** — `typecheck` fallaba por eso, no por el
> cambio. Se corrigió con `npm ci` dentro del worktree.

## REQUIERE TU DECISIÓN

1. **#11 · webhook de Telegram (P0, abierto ahora mismo)** — rotar los tres
   pasos, o desplegar y probar con un `/start` apostando a que el registro de
   marzo sigue vigente. El peor caso del segundo camino es el bot mudo, y se
   revierte redesplegando.
2. **#22 · `SUPABASE_ACCESS_TOKEN`** — crear uno en
   `supabase.com/dashboard/account/tokens` y cargarlo con
   `gh secret set SUPABASE_ACCESS_TOKEN -R sforero94/Escociaos`.
3. **#20 · migración 109** — no la puede aplicar la operación. Va por el panel
   de Storage → Policies, o se acepta como no-se-arregla.

## PRs ABIERTOS

- `fix: reserve reportes-semanales deletion for Gerencia (migration 109)` →
  https://github.com/sforero94/Escociaos/pull/154 · **no aplicada, y este carril
  no puede aplicarla**

## NO CORRIÓ

- **W3 · migraciones #37, #19, #16** — el runbook manda una por corrida, y la de
  esta corrida (#20) consumió el turno. **#37 y #19 no comparten el bloqueante
  de #20**: son sobre tablas de `public`, donde `postgres` sí es dueño.
- **Lectura del token del CLI de Supabase** — bloqueada por el clasificador de
  permisos al intentar leer el llavero. No se buscó ninguna vía alternativa a
  propósito; se escaló.
