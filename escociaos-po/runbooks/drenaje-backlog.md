# Runbook — Drenaje del backlog

**Estado: DRENADO. §1 está cerrada entera.** Última actualización 2026-08-24,
tras W0, W1, la corrida de cierre y la continuación
(`reports/2026-08-24-drenaje-continuacion.md`).

**No queda nada pendiente en §1.** Las cuatro migraciones de §1.4 se aplicaron
—salvo la 109, que este carril no puede aplicar y aplicó Santiago a mano por el
panel de Storage— y con ellas se fueron seis más: **110 a 119, diez en total**,
todas verificadas contra el catálogo vivo y fusionadas a `main`. Todo se conserva
abajo **tachado, con lo que costó averiguar**, porque ahí está la parte
reutilizable.

**Producción**: edge function **v216**, clima sano, deriva en `false` y el
detector corriendo solo todos los días.

> **Lo más caro de olvidar de esta tanda no es una migración: es que un
> verificador independiente me corrigió DOS veces antes de escribir en
> producción.** La 118 apuntaba a la fila equivocada (la evidencia que decidía
> estaba en `compras`, no en `movimientos_inventario`) y el argumento central de
> la 119 era **circular** — sostenía que un saldo era de fiar porque coincidía con
> un dato de la propia fila bajo sospecha. Las dos veces el veredicto llegó con
> una prueba externa que yo no había buscado. **La compuerta 3 no es burocracia.**

Si te dijeron «termina el trabajo», **este runbook ya no tiene trabajo que dar**.
Lo que queda vivo son los hallazgos abiertos en Notion, que es la fuente de
verdad. El resto del documento es la referencia que sostuvo el drenaje: leelo
como manual de método, no como lista de tareas.

**Antes de nada**: leé `escociaos-po/CLAUDE.md` (la constitución) y **verificá el
estado real** contra Notion y contra el catálogo vivo. Este documento es de
2026-08-24; si estás leyéndolo días después, algo cambió.

Fuente de verdad de los hallazgos: Notion `collection://b22d2385-a812-4d4a-8094-cefa9d080f60`.

---

## 1. LO QUE FALTA

### ~~1.1 · P0 — cerrar el webhook de Telegram~~ · ✅ CERRADO 2026-08-24 18:10Z

Desplegada la **v216**. `POST` anónimo al webhook pasó de **aceptado** a **401**;
controles en el mismo lote: `/hato/alertas/tick` → 401, `/ruta/que/no/existe` →
404 (que es lo que prueba que el 401 es la puerta y no un catch-all). **Santiago
confirmó un `/start` real y el bot respondió normal.**

**No hizo falta rotar nada, y eso es lo que hay que recordar.** La puerta
**existía y la borró** `e799142` (2026-03-18): no era una protección que nunca se
puso, era una **regresión que vivió cinco meses**. Y como Telegram **no caduca**
el `secret_token` de un webhook, el registro de marzo seguía vigente — Telegram
llevaba todo ese tiempo mandando el encabezado correcto contra un servidor que
había dejado de mirarlo. **Desplegar bastó.**

> **La lección, para la próxima puerta que aparezca abierta:** antes de diseñar
> una rotación de tres pasos, averiguá con `git log -S` si la validación existió
> alguna vez y cuándo se creó el secreto (`supabase secrets list` da `updated_at`,
> que es lo único útil que devuelve). Un secreto creado minutos después del token
> del servicio es la firma de un alta que **sí** lo registró. La apuesta es barata
> porque el peor caso — bot mudo — se arregla corriendo la rotación después, sin
> revertir nada.

**Antes de desplegar la edge function, comprobá el alcance real**:
`git diff --stat <árbol-desplegado>..origin/main -- supabase/functions/make-server-1ccce916`.
Acá fueron **2 ficheros**. Y revisá que no haya otra puerta mergeada cuya
contraparte en base de datos no haya corrido (la mina de la 105).

### ~~1.2 · Secreto de CI para el detector de deriva~~ · ✅ CERRADO 2026-08-24 18:30Z

Corrida `32762758337` en **verde**, 10 s. Reportó `OK: el despliegue vivo es
posterior al ultimo commit`. Queda corriendo solo: cron diario 12:30 UTC (07:30
Bogotá) más `workflow_dispatch`.

> **El atasco no fue el `gh secret set`.** Santiago estaba en el **tope de 20
> tokens personales de Supabase** y no podía crear otro. Tres cosas que
> destrabaron y no conviene volver a averiguar:
>
> 1. **Los acuña `npx supabase login`** — cada login deja uno listado en la cuenta
>    (nombre tipo `cli_…`). Veinte son meses de logins en worktrees y máquinas
>    distintas. **Un agente no puede acuñar uno**: hace falta el navegador o un
>    token que ya exista, así que si alguien dice «los creó Claude», no fue así.
> 2. **La columna que decide es «Last used», no el nombre.** Exactamente uno
>    muestra *hoy* — el del llavero. Ése se conserva, el resto se borra.
> 3. **Borrar un PAT no destruye nada**: lo peor es que algo tenga que volver a
>    autenticarse (`npx supabase login`). Por eso **se borra primero y se crea
>    después** — al revés seguís en el tope.
>
> **El token de CI va DEDICADO, nunca el del CLI.** Un PAT de Supabase es *de
> cuenta, no de proyecto*, da Management API sobre todos y no se puede acotar a
> solo-lectura; reusar el del CLI acopla CI a la sesión local y revocar uno mata
> al otro.

### 1.3 · Cerrar en Notion lo que quede verificado

> **Un hallazgo se cierra cuando el arreglo está VIVO, no cuando está fusionado.**
> Se ganó el 2026-08-24: ESCO-1 se cerró contra el merge y cuatro días después las
> cinco rutas seguían abiertas en producción.

| # | Cierra sólo si | Resultado |
|---|---|---|
| **#11** | el POST anónimo da 401 **y** el bot responde a un `/start` | ✅ **CERRADO** — las dos |
| **#3** | ~~`version > 215`~~ | ✅ **CERRADO** — el criterio era un proxy falso |
| **#22** | el workflow corrió en **verde** | ✅ **CERRADO** |

Los tres cerrados. La regla se conserva para la próxima tanda: **cualquiera que
no cumpla su criterio se deja `In progress` y se escribe por qué.**

> **Por qué #3 cerró con la versión todavía en 215, y la lección que deja.** El
> criterio de arriba era un **proxy**, y partía de una premisa falsa: suponía que
> la mitad de Telegram de #3 viajaba en el *siguiente* despliegue. Ya viajaba en
> el actual — el deploy de las 15:52:43Z es **posterior** al merge del PR #144
> (15:49:12Z). La regla real del contrato (§5: `updated_at` posterior al commit)
> sí se cumplía.
>
> **Cuando un criterio de cierre es un proxy, verificá la regla, no el proxy.**
> Cerrar por el proxy habría dejado un hallazgo ya resuelto abierto otra semana.
>
> Y el mismo despliegue resolvió dos hallazgos **en direcciones opuestas**: llevó
> el arreglo de #3 (`jornal.ts`, `mtime` 42 s antes del deploy) y **no** llevó el
> de #11 (`bot.ts`, `mtime` del 2026-08-21). **No asumas que un despliegue
> arrastra todo lo fusionado antes — mirá fichero por fichero.** La receta para
> hacerlo sin leer el código desplegado está en `memory/_compartida.md`.

### ~~1.4 · W3 — las 4 migraciones aditivas~~ · ✅ CERRADA 2026-08-24

**Las cuatro salieron, y arrastraron seis más.** Aplicadas y verificadas contra
el catálogo vivo: **110** (#37, y el alcance real eran **7 tablas, no 4**),
**111** y **113** (#19), **112** (#16), **114** (#37 residual), **115** (#42),
**116** (#4), **117** (#12), **118** (#43) y **119** (#29). La **109** sigue
siendo la única que este carril no pudo aplicar — ver el límite duro de abajo, que
se mantiene vigente y hay que releer antes de escribir cualquier migración de
Storage.

Lo que sigue de esta sección es la referencia con la que se hicieron. **El texto
original se conserva sin editar**, incluidas las advertencias que resultaron
ciertas.


Ya están desbloqueadas (flag quitado en W0). **Una por corrida**, con las cinco
compuertas de la constitución: aditiva por lista blanca · guardas propias
`RAISE EXCEPTION` pre y post · **revisión adversarial independiente que por defecto
dice «insegura»** · número secuencial correcto · transferencia byte a byte desde el
fichero del PR (base64 → decode → una sentencia atómica), nunca retecleada.

> ### ⛔ LÍMITE DURO DESCUBIERTO EL 2026-08-24: el carril NO alcanza `storage.objects`
>
> `ALTER POLICY`, `CREATE POLICY` y `COMMENT ON POLICY` exigen ser **DUEÑO** de la
> tabla. Ningún `GRANT` lo confiere — `postgres` tiene DML entero con grant option
> sobre `storage.objects` y **aun así no puede tocar una política**.
> `storage.objects` pertenece a `supabase_storage_admin`, y `apply_migration` corre
> como `postgres`, que hoy no llega a ese rol por ninguna vía:
>
> ```
> current_user = postgres | pg_has_role(…,'supabase_storage_admin','USAGE')  = f
>                         | pg_has_role(…,'supabase_storage_admin','MEMBER') = f
> ```
>
> **Antes sí se podía** — la migración 072 creó cuatro políticas ahí y tiene fila
> en el ledger con versión de marca de tiempo (`20260730002128`), el formato de
> `apply_migration`. Entremedio el servicio de Storage corrió migraciones propias
> el 2026-08-10, 08-20 y 08-23. **Un permiso de julio no prueba el de hoy.**
>
> **Un hallazgo sobre políticas de Storage no es `ddl_aditivo`.** Clasificalo
> aparte desde el principio o perdés la corrida descubriéndolo. La vía que sí
> funciona es el panel de Supabase → Storage → Policies, que corre como el dueño y
> **no la puede recorrer un agente**.
>
> Para contestar una pregunta de permisos **antes** de escribir una migración que
> quizá ni arranca, usá la sonda que aborta por construcción — está en
> `memory/_compartida.md`. No puede escribir aunque quiera.

Orden, de menor a mayor riesgo:

1. ~~**#20**~~ — **HECHO Y BLOQUEADO.** Migración `109_storage_reportes_delete_gerencia.sql`
   escrita, revisada adversarialmente (veredicto **UNSAFE**, y acertó), corregida y
   publicada en el **PR #154**. **No aplicada, y este carril no puede aplicarla** —
   ver el límite duro de arriba. Necesita el panel de Storage → Policies, o
   cerrarse como `Aceptado (no se arregla)`. **El siguiente turno del carril es
   para #37.**
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

**#37, #19 y #16 NO comparten el bloqueante de #20**: son sobre tablas de
`public`, donde `postgres` sí es dueño. El carril sigue vivo para ellas — lo que
murió es su alcance a `storage.objects`. **Comprobalo igual antes de escribir**,
con la sonda que aborta: cuesta una llamada y evita escribir una migración
entera que no puede correr.

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

**Corrida de cierre (misma fecha, sesión interactiva)** — reporte completo en
`reports/2026-08-24-drenaje-cierre.md`:

- **#3 cerrado** (`Arreglado`), contra el despliegue verificado en sus **dos**
  superficies: edge function v215 (reflog + `mtime` del worktree desplegado) y
  navegador (sonda de contenido sobre los 192 chunks de Vercel — el literal
  `4.33` ya no aparece en ningún chunk de la app).
- **#20**: migración 109 escrita, revisada, corregida y publicada en el PR #154;
  **sin aplicar**, y el carril no puede aplicarla.
- **#11 y #22 escalados**: los dos están bloqueados por una **credencial**, no
  por esfuerzo. Ninguna cantidad de trabajo desatendido los cierra.
- Cero hallazgos nuevos, que es lo correcto en drenaje.

**Backlog**: 23 → **22 abiertos**.

> **Lo más caro que dejó esta corrida, y no estaba en ningún hallazgo:** la
> revisión adversarial de la compuerta 3 **pagó por sí sola**. Además del
> bloqueante, atrapó una afirmación falsa que el `COMMENT ON POLICY` habría
> grabado **de forma permanente en el catálogo de producción**, un rol
> (`Monitor`) que el `CLAUDE.md` raíz nombra y que **no existe en el enum
> `rol_usuario`**, y una post-condición que era una guarda de mentira — comparaba
> subcadenas, así que un predicado *sin correlacionar* (`EXISTS (SELECT 1 FROM
> usuarios WHERE rol='Gerencia')`, cierto para **cualquier** autenticado) la
> habría pasado. **No la trates como un trámite.**

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
