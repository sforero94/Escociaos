# Runbook — Drenaje del backlog

**Estado: EN CURSO.** Última actualización 2026-08-24, tras ejecutar W0 y W1.

Si te dijeron «termina el trabajo», empezá por §1: son las tareas que quedan, en
orden. El resto del documento es la referencia que las sostiene.

**Antes de nada**: leé `escociaos-po/CLAUDE.md` (la constitución) y **verificá el
estado real** contra Notion y contra el catálogo vivo. Este documento es de
2026-08-24; si estás leyéndolo días después, algo cambió.

Fuente de verdad de los hallazgos: Notion `collection://b22d2385-a812-4d4a-8094-cefa9d080f60`.

---

## 1. LO QUE FALTA

### 1.1 · P0 — cerrar el webhook de Telegram (lo más urgente)

El PR #150 está fusionado en `main`: el webhook exige el encabezado
`X-Telegram-Bot-Api-Secret-Token` contra la variable `TELEGRAM_WEBHOOK_SECRET`
(401 si no coincide, 503 si falta — falla cerrado). **Pero la función desplegada
sigue en v215 y no lo trae**, así que hoy el webhook está ABIERTO en producción:
cualquiera que lea el repo público puede POSTear un update forjado con un chat_id
conocido y actuar como ese usuario, incluido uno de rol Gerencia.

**`supabase secrets list` NO devuelve valores, sólo nombres y digests.** No
intentes leer `TELEGRAM_WEBHOOK_SECRET`: **rotalo**. Generás uno nuevo y lo ponés
en los dos lados; nunca necesitás conocer el viejo.

**Orden obligatorio — es al revés de lo intuitivo, y así no hay caída del bot:**

1. Generá un secreto nuevo (32+ bytes aleatorios, urlsafe).
2. `supabase secrets set TELEGRAM_WEBHOOK_SECRET=<nuevo>`
3. Registralo en Telegram con el **mismo** valor:
   ```
   POST https://api.telegram.org/bot<TELEGRAM_BOT_TOKEN>/setWebhook
     url=https://ywhtjwawnkeqlwxbvgup.supabase.co/functions/v1/make-server-1ccce916/telegram/webhook
     secret_token=<nuevo>
   ```
4. **Recién ahora**: `npx supabase functions deploy make-server-1ccce916`

*Por qué en ese orden*: v215 no lee ese encabezado, así que Telegram puede
mandarlo desde el paso 3 sin romper nada. Cuando el paso 4 activa la puerta, el
encabezado ya está llegando. **Cero downtime.** Al revés, el bot rebota TODO con
401 en el medio.

> **El paso 3 necesita `TELEGRAM_BOT_TOKEN`, que tampoco es legible con
> `secrets list`.** Buscalo en `.env` / `.env.local` o en la config local de
> supabase. **Si no lo encontrás, PARÁ Y PEDILO.** No sigas al paso 4 sin haber
> hecho el 3: rotar a medias deja el bot muerto y sólo se recupera revirtiendo el
> deploy.

**Verificación, obligatoria antes de cantar victoria:**
- `list_edge_functions` → `version > 215`
- POST anónimo al webhook (cuerpo `{}`, sin encabezados) → **401**
- Controles en el mismo lote: `/ruta/que/no/existe` → 404 · `/hato/alertas/tick` → 401
- **Mandale un `/start` real desde Telegram y comprobá que responde.** Un 401
  correcto y un bot muerto se ven idénticos desde afuera.
- El clima no se rompió: `net._http_response` últimos ticks en 200 con `synced:1`,
  y `select round(extract(epoch from (now()-max(timestamp)))/60) from clima_lecturas` ≤ 10

**Si el bot queda mudo**: los dos valores no coinciden. **No toques el código del
gate** — re-corré los pasos 2 y 3 con el mismo valor.

### 1.2 · Secreto de CI para el detector de deriva

El PR #152 agregó `.github/workflows/deteccion-deriva-despliegue.yml`. Necesita el
secreto de repositorio **`SUPABASE_ACCESS_TOKEN`**. Santiago ya tiene varios tokens
de Supabase; si podés obtener uno, `gh secret set SUPABASE_ACCESS_TOKEN`. Si no,
dejalo anotado como pendiente suyo — **no inventes un token**.

Después disparalo a mano (`gh workflow run`) y confirmá que sale **verde**. Sin el
secreto sale rojo a propósito (falla cerrado).

### 1.3 · Cerrar en Notion lo que quede verificado

> **Un hallazgo se cierra cuando el arreglo está VIVO, no cuando está fusionado.**
> Se ganó el 2026-08-24: ESCO-1 se cerró contra el merge y cuatro días después las
> cinco rutas seguían abiertas en producción.

| # | Cierra sólo si |
|---|---|
| **#11** | el POST anónimo da 401 **y** el bot responde a un `/start` |
| **#3** | `version > 215` (su mitad de Telegram viaja en ese deploy) |
| **#22** | el workflow corrió en **verde** |

Cualquiera que no cumpla su criterio: dejalo `In progress` y escribí por qué.

### 1.4 · W3 — las 4 migraciones aditivas

Ya están desbloqueadas (flag quitado en W0). **Una por corrida**, con las cinco
compuertas de la constitución: aditiva por lista blanca · guardas propias
`RAISE EXCEPTION` pre y post · **revisión adversarial independiente que por defecto
dice «insegura»** · número secuencial correcto · transferencia byte a byte desde el
fichero del PR (base64 → decode → una sentencia atómica), nunca retecleada.

Orden, de menor a mayor riesgo:

1. **#20** — DELETE de `reportes-semanales` sólo Gerencia. Alinea con los otros 6
   buckets. El más trivial: **hacelo primero y usalo para comprobar que el carril
   funciona** antes de apuntarlo a #37.
2. **#37** — las 4 políticas DELETE con predicado `true` sobre tablas GlobalGAP.
   **Leé esto antes de escribir una línea**: esas tablas **no tienen ninguna
   política de Gerencia/Administrador**, así que la always-true es el **único**
   camino de borrado y es lo que hace funcionar el borrar-y-reinsertar de
   `CalculadoraAplicaciones.tsx:492/501/505`. **Acotar por propietario ROMPE
   producción**, y ninguna de las 4 tiene `created_by`. Va **por rol**, con
   `ALTER POLICY` (nunca DROP+CREATE — precedente 077) y el predicado envuelto
   `(SELECT get_user_role())` (precedente 093). Guarda previa: abortar si el padrón
   dejó de ser 5 Gerencia + 3 Administrador. Filas afectadas esperadas: **cero**.
   Añadí también `REVOKE DELETE … FROM anon` en las cuatro (precedente 081).
3. **#19** — endurecer `logs_auditoria` (hoy INSERT sin autenticar, 0 filas, nada
   escribe). Alcance recortado: la parte «no existe historial general» es decisión
   de producto y va a G2, no acá.
4. **#16** — `productos.updated_by` + trigger, patrón 040/050/063/074.

Respaldos **siempre en el esquema `respaldos`, nunca en `public`** (migración 081).

### 1.5 · Lo que NO hacés

- **No tocás datos existentes.** Los 5 de clase `datos` (#7 #24 #29 #38 #43)
  esperan una propuesta escrita y un go **por ítem**. **#29 arrastra un refute del
  2026-08-10**: su remedio automático habría fabricado **$5,36M** de fertilizante
  inexistente. No lo re-intentes; necesita conteo físico.
- **No tomás las decisiones de G2** (§4). Son de Santiago.
- **No modificás una migración ya aplicada.**
- **Nunca fusionás** salvo autorización explícita y en vivo.
- Push directo a `main` **sólo** para el commit de memoria, y **sólo** bajo
  `escociaos-po/memory/**` y `escociaos-po/reports/**`.
- **Nunca escribís un secreto, token ni chat_id** en Notion, un commit, un PR o el
  reporte. Redactá.

### 1.6 · Al terminar

Reporte en `escociaos-po/reports/AAAA-MM-DD-<slug>.md`, deltas de memoria aplicadas,
las dos rutas en un solo commit. Resumen final corto en español: qué quedó vivo,
qué no, y qué sigue necesitando a Santiago.

---

## 2. LO QUE YA SE HIZO (2026-08-24)

**W0 — re-triage del flag `Requiere aprobación`.** Era el cuello de botella real:
18 de 25 hallazgos lo llevaban y §5 dice que anula `clase` por completo, así que una
sesión desatendida podía trabajar en 7 de 25.

- **4 desbloqueados** (#20 #16 #19 #37): filas afectadas esperadas cero, política ya
  elegida en otro lado del sistema, o patrón ya aplicado varias veces.
- **4 separados** (#11 #45 #12 #42): empaquetaban decisión + código. El flag **se
  conservó** —la mitad que decide es real— y el corte quedó escrito en cada fila.

*Criterio para repetirlo*: se quita el flag cuando (a) las filas afectadas son cero,
(b) la política ya está elegida en otro sitio, o (c) es un patrón ya aplicado sin
incidente. Se conserva cuando hay una decisión adentro — y entonces se escribe
PARTE A / PARTE B en la propia fila, en vez de crear filas nuevas que inflan el conteo.

**W1 — 6 PRs, todos fusionados**: #147 (este runbook), #148 (#35, docs), #149 (#45b,
divisor), #150 (#11a, webhook), #151 (#12a, umbral), #152 (#22, detector de deriva).
`main` = `a2c249e`.

**G1 + parte de W2 — Santiago desplegó ESCO-1.** Migración 105 aplicada, función en
v215, `/clima/sync` anónimo pasó de 200 con escritura efectiva a **401**, y el clima
no perdió un tick. **#36 cerrado.**

**Cerrados**: #15 (obsoleto), #36, #35. **PR #118 cerrado sin fusionar** — #148 lo
sustituye.

**Backlog**: 25 → **23 abiertos**.

---

## 3. TRES COSAS QUE EL TRABAJO DESTAPÓ Y NO ESTABAN EN NINGÚN HALLAZGO

1. **#37 rompe producción si se acota mal** — ver §1.4.2. Es el hallazgo con más
   riesgo de ejecución de todo el backlog.
2. **#19 estaba sobredimensionado**: mezclaba un hardening trivial con una decisión
   de producto. Recortarlo lo desbloqueó. **Buscá ese patrón en los que sigan
   trabados.**
3. **#42 esconde una decisión del dueño**: subir el umbral de cobertura de lluvia a
   275 **descarta lluvia real** (2026-07-09, 28,19 mm sobre 268 lecturas).
   Recomendación: no tocar ese día — un contador truncado da una **cota inferior,
   jamás un total**. Está en la agenda de G2.

---

## 4. AGENDA G2 — pendiente de Santiago (≈15 min, todo en una sentada)

| # | Pregunta | Recomendación |
|---|---|---|
| **#39** | ¿El reporte de cierre deriva la mano de obra en vivo, o manda el snapshot? | **en vivo** — es lo que costo/kg ya hace |
| **#45B** | ¿`valor_jornal_empleado` es salario mensual o valor de un jornal? | **renombrar a `salario_mensual_empleado`** — es lo que guardan 2.461 de 2.536 filas |
| **#12B** | ¿Re-etiquetar las 48 filas de `gravedad_texto`? | **sí** — están subvaluadas contra lo que muestra cualquier pantalla |
| **#42** | ¿Descartar 28,19 mm de lluvia real del 2026-07-09? | **no** |
| **#4** | Alertas del hato: 1 en 15 días. ¿Sin qué disparar, o ciegas por fichas incompletas? | **instrumentar el tick antes de decidir** — 62 de 65 vacas sin raza |
| **#25** | ¿Ensayo del chequeo por foto antes del ~08-sep? | **sí** — hoy sería el estreno con Martha en el corral |
| **#44** | ¿Encender el bloqueo de contraseñas filtradas? | **sí**, o cerrarlo como aceptado |

**Más el paquete de datos** (#7 #24 #29 #38 #43): una sola propuesta escrita, cada
ítem con SQL exacto, rollback, filas que toca y chequeo de pre-estado. **Un go por
ítem**, no uno global.

**Nunca cirugía de datos sin que un verificador independiente reproduzca la
reconciliación por otro método.** El 2026-08-10 dos agentes reconciliaron el mismo
inventario y les dio 3 y 5 productos.

---

## 5. MÉTODO — lo que cuesta caro reaprender

- **Cerrar contra el despliegue, no contra el merge.** Para `supabase/functions/**`,
  `list_edge_functions.updated_at` posterior al commit. Para frontend, sonda de
  contenido contra `escociaos.vercel.app`.
- **`updated_at` viene en epoch MILISEGUNDOS.** Leerlo como segundos da 1970, que es
  anterior a cualquier commit: el detector diría «sin deriva» para siempre.
- **Comparar con `git log -1 --format=%cI` (committer date), no `%aI`.** La fecha de
  autor puede ser días anterior a cuando el commit aterrizó en `main`, y eso sólo
  puede **esconder** deriva.
- **En una sonda de contenido, el control positivo se elige entre cadenas de dominio**
  (`tarifa_jornal`, `fraccion_jornal`), nunca entre nombres de función — no
  sobreviven al minificado, y sin control válido una *ausencia* no significa nada.
- **Sonda de rutas de edge function sólo sobre endpoints idempotentes.** El
  2026-08-24 una sonda a `/clima/sync` produjo una escritura efectiva.
- **`pg_cron succeeded` no prueba nada.** Sólo registra que encoló el `net.http_post`.
  El estado real está en `net._http_response`; la liveness real, en el dato mismo.
- **Checkout compartido**: un worktree se basa en `origin/main` **explícitamente**,
  nunca en `HEAD`, y el orquestador no crea ramas ahí con agentes en vuelo. El
  2026-08-24 eso contaminó un PR con 253 líneas ajenas.
- **Los ficheros de la propia operación (`escociaos-po/`) son parte del repo público**
  y entran en todo barrido de secretos. Un chat id de Gerencia vivió ahí desde el
  2026-08-10 y sobrevivió dos barridos.
- Al buscar ids con un regex de 9–11 dígitos, **los números de versión de migración
  (`20260803170340`) son falsos positivos**. Filtralos antes de contar.

---

## 6. Criterio de parada

Parar y reportar cuando: (a) no queda nada elegible sin compuerta, (b) dos compuertas
seguidas sin respuesta, o (c) el backlog llega a 0. **Una corrida que no cerró nada
pero dejó las agendas escritas es un éxito**: el cuello de botella es el flag, no el
esfuerzo.
