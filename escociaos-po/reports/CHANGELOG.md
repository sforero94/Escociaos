# Changelog — Escocia OS maintenance operation

What the maintenance operation actually shipped to production, newest first.

**This is a living file, appended once per run.** The `release-changelog` agent runs last
in every sweep and adds one section for that run, on top. It is never rewritten from
scratch and never regenerated — earlier sections are the record and stay as written.
There is no automation for this; the agent appends it by hand as part of the Phase 5
memory commit.

**Scope.** Only what landed: merged PRs and migrations applied to production. Findings
that were filed, discussed, deferred or refuted belong in the run report
(`escociaos-po/reports/<fecha>-<corrida>.md`), not here. A run that shipped nothing says
so plainly — a quiet week is information.

**Why this path.** The `release-changelog` brief asked for a `CHANGELOG.md` "in the PO
folder", which reads as `escociaos-po/CHANGELOG.md`. Constitution §6 limits the memory
commit to `escociaos-po/memory/**` and `escociaos-po/reports/**`, so that file could
never be committed and the changelog lived scattered across five run reports for a month.
Santiago decided on 2026-09-09 (option (b) of three registered): the changelog moves
here, inside an already-permitted path. The constitution was not weakened and no extra PR
per run is needed. **Do not invent a fourth outlet.**

---

## 2026-09-21 — corrida lunes

A clean release week. 15 PRs merged (#248–#274), nine migrations applied (147, 151, 152,
153, 154, 155, 156, 157, 158) and four edge-function deploys, ending at **v264 on
2026-09-19 at 15:43 UTC — 66 seconds after the commit that needed it**. The deployed
bundle hash matches the repo state file, the two edge trees are byte-identical across 74
files, and nothing is waiting on a manual deploy. This section also covers the 2026-09-17
Thursday and 2026-09-18 Friday runs, whose sections were never written.

### Tablero General
- **"Novedades" replaces "Acciones recomendadas".** The daily LLM engine is retired: its
  cron no longer runs, its `/acciones/tick` route is gone, and its four tables are kept
  untouched as historical evidence. Its code was archived rather than deleted, in
  `archive/acciones-recomendadas/`. The new feed is live and in use — 23 interactions by
  two accounts between 2026-09-17 16:32 UTC and 2026-09-20 05:00 UTC. (issue #266, PR
  #267, migrations 155 and 156)

### Clima
- The figure the screen called "horas-sol" was daily energy in kWh/m², not time. Sunshine
  is now measured as hours with radiation at or above 120 W/m² and shown separately; the
  energy figure keeps its own, correct label. (PR #250, migration 151)
- A day with too few readings no longer reports a fabricated `0.00` hours of sun — it
  reports no data. 2026-09-16 (11 readings) and 2026-09-17 (189) are now blank, while
  09-18, 09-19 and 09-20 carry 9.42, 8.58 and 9.25 hours on full coverage. (PR #269,
  migration 158, ledger `20260917204545`)

### Hato Lechero
- Fernando is the only Telegram recipient of the secado and tratamiento alerts. The tick
  had been sending them to Gerencia as well, with 48-hour escalation on top. (PR #251,
  migration 152)
- Uploading a chequeo no longer creates a second copy of a service already registered by
  Telegram on the same day. The date boundary excluded exactly the day of the visit.
  (PR #259)
- The 2026-09-08 vet check was corrected against the paper planilla: real service dates
  for seven cows, the right bull for two more, four duplicate treatments removed, one
  treatment that was never captured added, and **#177 (MOTONETA) and #178 (COMINA)
  reactivated** — both were written off in the August inventory cleanup but are alive and
  were served in September. (migrations 153 and 154)
- A row the planilla could not anchor to a cow is now promoted for review instead of being
  dropped, and the printed planilla always carries ten spare rows. (PR #260)
- A QA test chequeo dated 2020-01-15 was removed from production. (migration 157)

### Telegram
- Every write path — jornal, gasto, ingreso, monitoreo, pesaje, evento, ronda — resolves
  who is writing from `telegram_usuarios`. `/pesaje` had been treating Fernando as an
  unlinked user, which is why milk weighing had stalled. (PR #274)
- A gasto captured by Telegram after 19:00 Bogotá no longer saves with tomorrow's date.
  (PR #267)

### Finanzas
- Saving a gasto or ingreso dated more than a day ahead asks for confirmation in the batch
  grids as well as the dialogs. A date like 14/12/26, which has only one reading, no longer
  triggers the ambiguity question. (PR #264)

### Inventario
- Resolving a count difference with a supporting document now asks David for the physical
  count, separately from the movement quantity. The two are different numbers, and the
  voice interpreter's figure used to survive all the way into the closing report — that is
  what made the "three bags of 15-15-15" correction necessary. (migration 147, ledger
  `20260916154436`)

### Interno
- `informes-visita-proponer` was retired as a separate edge function; the browser now calls
  its twin on `make-server-1ccce916`. One function is deployed where there were two.
  (PR #264)
- The hato alert tick and the 5-minute clima sync retry PostgREST 504s instead of dying
  mid-run. (PR #265)
- The maintenance operation's Supabase reads and Notion access moved to Composio, leaving
  `Supabase_Escritura` as the sole write exception. (PR #248)

### Requiere despliegue manual
- Nothing. `make-server-1ccce916` is at v264 and its published hash (`7139fbad…`) matches
  the last commit that touched the deployed tree.

### Known holes in this record
- Migrations **155** and **156** are live in production with **no row** in
  `supabase_migrations.schema_migrations` — applied outside `apply_migration`, the same
  path as 035–039, 041, 046 and 093. Verified against the live catalog instead:
  `novedades_uso` and `fn_novedades_autores` exist, and the `acciones-recomendadas-tick`
  cron is gone.
- Migration **147** was applied by hand. Its file still cannot run: the post-condition
  looks for `'Ajuste'` in single quotes while the body writes `"Ajuste"` in double quotes
  (ESCO-112). Do not re-run the file.
- `main` shipped **red** on 2026-09-19 (`a5e5987`) and deployed 66 seconds later. Two days
  of red typecheck and one failing test followed. Fixed in PR #275, opened by this run.

## 2026-09-14 — corrida lunes

18 PRs merged (#229–#246) and migrations 142, 146, 148 and 149 applied in the 2,3 days
since the Friday drain. The edge function was redeployed on 2026-09-14 at 02:13 UTC — the
first deploy in this window — and the frontend is at `main`. One migration (147) is merged
and still waiting.

### Hato Lechero
- Every photo-capture attempt (pesaje and chequeo) now leaves a record of how it ended.
  Nine uploads since 2026-08-11 had produced no rows and no explanation; "the OCR failed",
  "nobody approved it" and "the server broke" used to look identical from outside.
  (migration 146, ledger `20260913221334`, PR #236)
- An alert that has been superseded is now retired instead of sitting in the queue, and the
  coverage report says which of the two reasons kept an animal out of a rule. (PR #234)
- The ambiguous-date dialog marks the most likely reading instead of offering two equal
  options. (PR #242)
- Alert defaults are on the record: Fernando receives only `secado_due` and
  `tratamiento_paso`; the three management alerts stay web-only until Gerencia turns them
  on. The screen used to show a matrix the engine did not honour. (migration 142, ledger
  `20260912195023`)
- The alert history and "who receives what" tabs use the shared table component. (PR #230)

### Labores
- A person can no longer be registered with more than one full jornal on the same day,
  however the day is split across lotes and tareas. Both the browser and the database block
  it. The historical cases are left as they are — correcting them is a separate, case-by-case
  decision. (migration 149, ledger `20260913224221`, PR #246)
- `valor_jornal_empleado` now stores the rate of one jornal, not the raw monthly salary.
  2.619 of 2.694 historical rows were repaired, derived from each row's own
  `costo_jornal / fraccion_jornal` — never from today's salary, which has already changed.
  (migration 148, ledger `20260913223447`, PRs #229, #244)

### Finanzas
- Saving a gasto dated more than a day in the future now asks for confirmation. It never
  blocks — a scheduled payment is legitimate — but a typo no longer makes the record vanish
  from the historial for five days. (PR #239)

### Ganado
- Editing a cattle transaction re-derives its `gan_movimientos` instead of leaving the old
  ones behind. (PR #237)

### Clima
- The daily backfill deletes at source before reinserting, so a re-run cannot leave two
  readings for the same instant. (PR #245)

### Aguacate · Informes de visita
- The third, separately-deployed copy of the anti-invention rules is now guarded by a parity
  test. It had none. (PR #243)

### Interno
- Deploy-drift detection got a second signal: it compares the published bundle's own content
  hash against the previous run, covers both edge functions in a matrix, and notifies by
  Telegram when it fails. Clock-only checking had reported green over two real regressions.
  (PR #232)
- The migration ledger in the root `CLAUDE.md` was corrected for 120, 123, 131, 132, 133,
  137, 139, 141 and 142 — several said "written, not applied" while live. (PR #231)
- This changelog now exists at `escociaos-po/reports/CHANGELOG.md`, bootstrapped from the
  run reports. (PR #233)

### Requiere despliegue manual
- Nothing. `make-server-1ccce916` is at v253 (2026-09-14T02:13:55Z), later than every commit
  in the window; `informes-visita-proponer` is at v3 and unchanged.

### Pendiente de aplicar
- **Migration 147** (`fn_ronda_resolver_con_captura_cantidad_confirmada`) is merged with no
  ledger row. Its edge half shipped with v253, so Telegram already asks David for the
  physical count and the live RPC still discards it.

## 2026-09-11 — corrida viernes (drenaje)

8 PRs merged, migrations 143 and 145 applied, edge function deployed and verified by
bundle content. `main` back to green (175 files / 3.759 tests) — the first full green
since 2026-09-09.

### Hato Lechero
- A treatment-step alert no longer says "due today" over a step that expired in July. It
  now names the real due date. (PR #219)

### Inventario · Ronda
- The monthly closing report prints the unit of measure. It used to contradict itself —
  "3" in the narrative against "Entrada de 150" in the movement, for the same finding.
  (PR #220)
- The August round's exception row was corrected from `3` to `150` kg: Uriel dictated
  "three 50-kg sacks" and the system stored the number without the unit. Stock and the
  already-issued report were left untouched — an issued report is frozen by contract.
  (migration 145, ledger `20260911192621`)
- `movimientos_inventario.responsable` now receives an account email instead of a display
  name. The new `fn_ronda_actor_correo` serves the two RPCs that write that column;
  `fn_ronda_actor_nombre` is untouched, so the closing report still signs
  `-- Santiago Forero` and the Telegram message still says `Martha Vega`.
  (migration 143, ledger `20260911161812`, PR #222)

### Aguacate · Monitoreo
- The severity threshold had a fourth hidden copy in the Telegram bot, invisible to every
  guard because it was named differently. All five copies now agree at 10% / 30%, and a
  new guard matches by shape rather than by name. (PR #221)

### Interno
- The duplicate `140_*` migration prefix is gone. Two files shared it since the 09-09
  renumbering and had kept `hatoSchemaContract.test.ts` red for two days. (PR #224, #226)
- Agent dispatch now gives each agent its own `git worktree` with `node_modules`
  symlinked, so four agents can run lint, typecheck and the suite without moving each
  other's tree. A shared checkout is what made a red `main` invisible to the Thursday
  review. (PR #226, #227)

---

## 2026-09-10 — corrida jueves

16 PRs merged and 5 migrations applied (137–141) in the window. Edge function v248
deployed 2026-09-09, verified by content.

### Hato Lechero
- A treatment can be registered and its follow-up step scheduled in one transaction.
  `hato_tratamientos` / `hato_tratamiento_pasos` existed since July with zero rows, so the
  `tratamiento_paso` alert rule had never fired once — not because it failed, but because
  no step existed to remember. Clinical detail stays free text in `nota` by owner
  decision. (migration 140, PR #211)
- Registering a treatment through Telegram now demands a date with the year. (PR #214)
- Jericó's straw stock reads 0, the real physical count. The same ELECTRA insemination had
  been registered twice through two different Telegram paths. (migration 138, PR #208)
- A guardrail against duplicate hato records. (migration 139)

### Ganado
- A ceba sale is captured the same way from Finanzas and from Inventario, with origin
  potrero and destare in the same modal, so heads decrement in the same save.
  (migration 141, PR #216)

### Seguridad
- Deactivating a user now revokes access. `get_user_role()` ignored `usuarios.activo`,
  so a deactivated account still passed ~125 policies — and a deactivated Gerencia could
  reactivate itself. `ProtectedRoute` shows a "cuenta desactivada" screen.
  (migration 137, PR #202)

### Aguacate · Hato · Interno
- The chequeo history read is paginated, so PostgREST can no longer truncate it. (PR #198)
- A parity guard over the whole mirrored edge-function tree. (PR #197)
- `BUG_REPORT.md` re-verified against production; the inventory module contract updated
  for migrations 131 and 132. (PR #199, #200)

---

## 2026-09-09 — sesión de decisiones

**Nothing shipped.** An interactive session with Santiago, no production writes and no
findings filed. It collected seven decisions the backlog was waiting on — including the
one that produced this file — and corrected two misclassifications that would have cost
the Friday drain a week each.

---

## 2026-09-04 — corrida viernes (drenaje)

**Nothing reached production.** Three fixes drained to green PRs (#194, #195, #196), each
reproduced with a red test first; zero migrations applied. The `ddl_aditivo` lane had no
eligible candidate at all. All three need an edge-function deploy to take effect.

---

## 2026-09-07 — corrida lunes

The Informes de Visita module arrived (already carrying 1 report and 19 captured notes)
and four fixes merged. Migrations 134–136 were applied 2026-09-03.

### Aguacate · Informes de visita
- The agronomist's monthly Word report can be uploaded, parsed into notes tagged by
  theme, searched in Spanish full text, and read by Esco. Photos go to a private bucket.
  Nothing persists until a human confirms the preview. (migrations 134, 135, 136)

### Interno
- The deployment of `make-server-1ccce916` stalled at the 2026-09-01 build for a week —
  the third deployment incident in three weeks. Caught by an HTTP probe for a route that
  only exists in the new code, not by a timestamp.

---

## 2026-09-03 — corrida jueves

### Seguridad · Base de datos
- Writing to 20 tables stops being open to any authenticated account. Inserting and
  updating monitoreos, producción, lotes, sublotes, registros de trabajo, movimientos
  diarios and the GlobalGAP chain now requires Gerencia or Administrador; the browser's
  `anon` key loses the direct grant on all 20. Zero rows affected; exactly one account of
  ten loses capability, and it is the Verificador account that has never signed in.
  (migration 133, PR #188 — merged 02:18Z, applied 02:23Z)

### Despliegue
- The ronda de inventario module got its server back. The 08-30 deploy had republished a
  bundle from 08-28, leaving 17 files out of production. v238 restored them on 09-01 at
  01:53Z, ten hours before the September start tick. Measured cost: exactly one lost tick,
  the one on 08-31.

### Para el usuario
- Nothing. No screen changed and no new function reached the field: zero `src/` files in
  the five commits of the window.

---

## 2026-08-31 — corrida lunes

Record development week: 133 commits, almost all of the new ronda de inventario module.

### Inventario · Ronda de inventario (issue #175, fases 0–6)
- Replaces the Verificación module, which in 25 days never counted a single product.
  Uriel dictates the count as a Telegram voice note; the system transcribes it, groups the
  scope by category, marks the findings, and routes them to David to explain and to
  Santiago to approve. **An approved adjustment now actually moves `productos` and
  `movimientos_inventario` in one transaction** — the loop the old module never closed.
  Web history at `/inventario/rondas`. (migrations 124–130, plus 131 and 132
  post-launch)
- Six post-launch fixes the same week: informal address, `ctx.telegramUser` in the replay,
  CA-4, scope by category, quantity reconfirmed (migration 132), and "cancelar" to release
  the correction loop.

### Aguacate · Clima
- The "days without material rain" streak stops breaking on a false gap: it went from
  reporting 5 days to the real 36. 31 mis-flagged historical days repaired against the
  Ecowitt History API.

### Hato Lechero
- Productivity tracker: total in bars, per-cow average as a line, projection with the herd
  frozen. (#186)

### Configuración
- Deleting a contratista or lote that RLS hides no longer says "eliminado" when nothing
  was deleted. (ESCO-46)

---

## 2026-08-28 — corrida viernes (primer drenaje)

First run of the Friday drain lane. Four findings drained: three code fixes to green PRs
and one security migration applied to production.

### Seguridad
- `contratistas` stops exposing cédula and teléfono to every authenticated session. No
  personal data was loaded yet — the door was closed before there was anything behind it.
  (migration 123, PR #182)
- Deleting from 8 monitoreo and producción tables now requires a role. All 8 carried
  `DELETE USING (true)` for any authenticated session and none of them is traced.
  (migration 120, ledger `20260828142056`, PR #176 — merged 08-24, applied today)

### Inventario · Clima (merged later)
- A purchase's unit price no longer stays stuck to the product after the purchase is
  deleted — a figure that feeds cost per kilo. (PR #180)
- Manual inventory adjustments record who made them. (PR #181)
- The daily clima retry cron stops rewriting a historical day with fewer readings than it
  already had. (PR #183)

---

## 2026-08-27 — corrida jueves

Edge function v221 deployed 2026-08-27T02:02:45Z, after the last commit of its tree.
Nothing left pending to deploy.

### Aguacate · Clima
- **The dashboard no longer says it rained when it did not, nor erases the figure when it
  did.** Daily rainfall stopped depending on a single cumulative counter; it is now checked
  against a second independent signal the station had been recording every 5 minutes (the
  per-event accumulator). Two identical drizzles in a row — 0,25 mm is *one tick* of the
  gauge, the most common non-zero value — used to read as "the counter froze" and the day
  was discarded. It happened on **31 of 159 days, one in five**. (migration 122)
- **The dry-spell streak stopped breaking at the first gap.** It counted 5 days when the
  real answer was 37. Days without data no longer cut the count; they are reported apart
  as "(N sin dato)".
- **History repaired, not just the rule.** The 36 suspicious days were re-fetched from the
  Ecowitt History API: `contador_congelado` went from 31 days to zero. What surfaced is not
  zeroes — 09-jun had 10,16 mm of real rain hidden; 10-jul dropped from 28,19 to 0,00 (it
  was the duplicate of 09-jul); 04-jul settled at 1,78 instead of 2,79.
- A day that was cut off mid-afternoon is no longer sealed as complete. (migration 115)
- The system now repairs itself: a daily cron at 06:00 Bogotá re-asks Ecowitt for any day
  in the last three weeks still without reliable data. (migration 121)

### Aguacate · Monitoreo
- 48 monitoreos carried the wrong severity label. The bulk import used a 15% threshold
  where the project's is 10%, so foci that should have shown amber showed green. The
  written data and the code that wrote it were both corrected. (migration 117, PR #151)

### Aguacate · Inventario
- Deleting a purchase no longer erases the trail. It used to revert the stock but drop the
  ledger entry, leaving orphan entries with no purchase behind them. (PR #157)
- The two entries the defect had already left were cleaned: the duplicate 8 kg Acondicionador
  sys `Entrada` (the balance was never doubled — the ledger lied, not the stock) and the
  orphan 8.000 kg Sulcamag `Entrada` that was really Silicalmag.
  (migrations 118 and 119)
  > Gerencia will see a number drop: the Inventario dashboard's Entradas total falls
  > $5.675.648 by stopping double-counting the same purchases. P&G and Flujo de Caja are
  > untouched — they do not read that table.

### Aguacate · Aplicaciones
- The closing report's labour cost is computed live instead of from a snapshot frozen at
  calculation time, so a later payroll change is reflected. (PR #165)

### Hato Lechero
- **The alert engine now records why it did NOT alert.** Every daily run stores, per alert
  type, how many animals were excluded and why. Without this there was no way to tell "there
  is nothing to alert" from "the rule is broken". (migration 116, PR #168)
  > First production data (3 runs): 179 animals evaluated, 176 with no breed registered,
  > 0 alerts generated.
- A pesaje photo that matches no cow in the roster is rejected with an explicit message
  instead of being accepted silently. (PR #164)
- The chequeo roster uses the calculated stage, not the raw column. (PR #159)

### Seguridad y trazabilidad
- Deleting GlobalGAP traceability data now requires Gerencia or Administrador — 7 tables
  whose delete policy had the predicate literally `true`. (migration 110, PR #167 chain)
- Deleting a contratista or a lote is no longer a free path either. The delete cascades
  into those same tables, and **child-table RLS is not evaluated during a cascade**.
  (migration 114, PR #166)
- Every browser edit or delete of GlobalGAP traceability is now recorded with the whole
  row before and after. (migration 113)
- `logs_auditoria` stopped accepting unauthenticated writes — an anonymous mailbox open
  from the internet, on the table the system believes is its audit log. (migration 111)
- The Telegram bot webhook demands its shared secret. The gate existed and a March
  regression had deleted it, so a deploy was enough; no secret was rotated. (P0, PR #150)
- Deleting an archived weekly report is reserved for Gerencia — the 49 reports that hold up
  the GlobalGAP certification. (migration 109, applied by hand from the Storage panel,
  which the migration lane cannot reach)
- Product edits are attributed to whoever made them. (migration 112, PR #162)

### Interno
- CI that detects edge-function deployment drift — the exact cause of the ESCO-1 security
  fix living four days merged and undeployed. (PR #152)
- Regression test against real production data for rainfall.
- The actions engine retries the rank-0 action once when the validator rejects it only for
  length. (PR #158)
- `CLAUDE.md` brought up to date with migrations 094–096 and 109–119. (PR #172, #173)

---

## 2026-08-24 — corrida lunes + tres sesiones de drenaje

The heaviest day of the operation: **ten migrations applied (110–119) and 22 PRs merged
(#150–#171)**, plus the Monday sweep's own merges and the documentation pair. The three
data surgeries each carried an explicit per-item go. Backlog 25 → 20 open.

Most of what shipped here is described in the 2026-08-27 section above, which is the run
that verified it live in production. What belongs to this date specifically:

### Labores
- The jornal divisor is 22 across all three trees. The app had been dividing by ~23,8 while
  Esco used 22. Labour cost per jornal moved from $105.316 to $114.004 and cost per kilo
  moved with it — the app had been under-valuing by 7,6%. (PR #144, owner decision of
  2026-08-20)

### Aguacate · Monitoreo
- Weekly grouping in the Monitoreos table uses ISO weeks in UTC and is no longer off by a
  day. (PR #145)

### Interno · operación
- The Telegram webhook P0 closed: deployed v215 → v216, an anonymous POST went from
  accepted to 401, and `/start` still answered. No secret rotated.
- The deployment-drift detector ran green for the first time with its
  `SUPABASE_ACCESS_TOKEN` in place, and now runs itself daily at 12:30 UTC.
- Migration 109 could not be applied by the migration lane at all: `ALTER POLICY` on
  `storage.objects` requires table ownership, and `apply_migration` runs as `postgres`,
  which is no longer the owner. **No future Storage policy change is applicable by this
  lane.**

---

## 2026-08-20 — corrida jueves

Two PRs merged during the run, then seven more at the 2026-08-21 close.

### Aguacate · Clima
- The Clima period cards have data again after ~4,5 months blank. The query hit PostgREST's
  1.000-row cap and silently lost 910 days. (PR #131, verified deployed by content probe)
- A day whose capture was partial is no longer sealed into permanent history as complete
  and reliable. (migration 103, applied 2026-08-21)

### Finanzas
- The gastos chart stops losing $1.444M. The two-year window truncated at 1.000 rows with
  no `.order()`, so the error scattered across every quarter without leaving a visible gap.
  (PR #135)

### Seguridad
- `verificaciones_inventario` and `verificaciones_detalle` stop accepting unauthenticated
  reads and writes through the browser's public key. (migration 104, PR #132)
- The five server routes that accepted anonymous writes from the internet were gated.
  (PR #133)

### Interno
- `main` stopped failing on a clean checkout — 8 tests failed in any fresh clone. (PR #130)
- A two-connector policy (read-only for diagnosis, write-capable for remediation) and a fix
  to migration 103's own guard, which compared against an absolute literal on a table a cron
  writes to daily and would have aborted against itself. (PR #138, #139)

---

## 2026-08-10 — corrida lunes

Ten migrations applied to production between 08-06 and 08-09 (083, 083b, 084, 085, 086,
089, 090, 091, 092, 093). The week belonged to the Hato Lechero.

### Hato Lechero
- **The herd inventory is current.** 21 animals were retired, 8 new records created and 8
  ear tags renumbered: 68 active animals over 179 historical records.
- **Each animal's category is computed by the system, and can be overridden by hand when
  it computes wrong.** The chip on the record and the grouping tab used to come from two
  different sources and could disagree; they now come from one. Calves are separated by
  feeding stage: Leche (0–3 months), Concentrado (3–12 months) and Sin dato de edad, which
  is its own deliberate bucket — a calf with no birth date is never forced into either.
- **The monthly pesaje sheet and the Pomar's fortnightly settlement can be uploaded as a
  photo.** The system reads the grid, shows a per-cow per-week diff, and writes nothing
  until someone approves. The photo is always stored even if the read fails — it is the
  evidence any later doubt is audited against. A cell the model cannot read enters blank
  and flagged, never guessed. The settlement stores the gross alongside the net (the 2,25%
  ICA withholding is an editable parameter, not written into the code).
- 12 June 2026 pesajes that were on the paper sheet and had never been entered were loaded
  (FABIOLA, FLACA, VICTORIA), transcribed and verified twice independently.
- **Hato alerts now reach Telegram.** Stale alerts hanging off the past were discarded —
  some were scheduled in 2019.
- **Every manual correction to the hato is recorded**: editing or deleting an event,
  pesaje, quincena, record or chequeo row stores what was there before and after.
  (migration 084)

### Interno · interfaz y rendimiento
- **The Tailwind compiler is on.** Until this week the project served a frozen 5.577-line
  CSS file maintained by hand; a screen using a class that was not in it simply did not
  render — which is how the hato selectors were found rendering as plain text. The entry
  file went from 5.577 lines to 3.
- A full mobile pass on top: dashboard KPIs no longer clip their text, the Inventario
  movements row becomes a card, Ganado's date filters separate, the Finanzas budget is
  legible, Aplicaciones actions are grouped into a menu, the menu button is a real 44×44 px,
  and the active sidebar item scrolls into view.
- **Finance reports and large queries got faster.** The 97 remaining permission rules
  evaluated their condition once per row; now once per query. Measured in production:
  counting confirmed gastos went from **126 ms to 3 ms**, and over monitoreos from
  **155 ms to 3 ms**. (migration 093, PR #104 renumbered)

---

## 2026-08-06 — corrida jueves

Migrations 077–082 applied; PRs #98 and #99 merged 2026-08-03 in the required order.

### Finanzas · captura de gastos e ingresos
- A gasto or ingreso captured after 7 pm is no longer stored with tomorrow's date, and no
  longer vanishes from the historial the moment it is saved. (Verified against real data:
  15 gastos captured 2026-08-05 between 23:15 and 23:38 Bogotá, none with a future date.)
- Scrolling the mouse wheel over a numeric field no longer changes the value, anywhere in
  the app. (PR #98)

### Aguacate · Monitoreo
- Incidence traffic lights use the same cutoffs (10% / 30%) on every screen. They used to
  be written by hand in each one and had already diverged in one place (15%), so the same
  pest could read amber on one dashboard and red on another. (PR #100)
- Scouting priority now says how many sublotes of the current round were left unchecked,
  and which — instead of silently omitting them.

### Hato Lechero
- 33 births that cannot have happened were deleted (two births of the same cow less than
  270 days apart), across 31 animals: 333 → 300. Those cows are left empty on purpose;
  Martha re-registers the pregnancies by hand. No date was invented and no event merged.
  (migration 080)

### Interno · base de datos y seguridad
- Forensic backups left the public schema — anyone with the project URL could read or
  destroy them with the key that ships in the browser. (migration 081)
- An RPC that deleted `fin_gastos` rows without asking for authentication was closed,
  EXECUTE was revoked from 31 trigger functions and `search_path` pinned on 39: security
  linter warnings **51 → 11**. (migration 082)
- `kv_store`: 19 duplicate indexes → 2. (migration 078)
- The 2026-07-02 removal of the compra → gasto automatism was archived as migration 079.
- 28 unreachable modules left the repo (−8.449 lines). (PR #99)

---

## 2026-08-03 — corrida lunes (primera corrida programada)

Migrations 073–076 applied 2026-07-31.

### Configuración · Usuarios
- Creating, editing and deleting users now requires a real Gerencia session; those
  endpoints used to accept the app's public key. No user can change their own role.
  (Read-only forensic review: no evidence of exploitation; the 7 accounts keep their
  roles.) (migration 073, PR #97)

### Aguacate · Monitoreo
- The heat map shows a single "Beneficos" row again — there were two catalog entries, one
  with a trailing space, splitting one concept into two series. 78 duplicate observations
  from CSV re-imports were removed: the total drops from 4.233 to 4.155, a correction and
  not a loss. *58 groups are left unresolved on purpose*: duplicates with values that
  differ from each other, where no defensible automatic rule exists. (migrations 075, 076)

### Trazabilidad
- Monitoreos and registros de trabajo now record who captured them (previously 0 of 4.233
  and 0 of 2.500). Forward-only; rows from the Telegram bot still have no user because it
  writes with a service credential. (migration 074)

---

## 2026-07-31 — ensayo en seco

**Nothing shipped.** The operation's first run was a dry run of the Monday runbook: zero
rows in Notion, zero PRs, zero pushes, zero DDL/DML against production. It is the start
date of the operation, not a release.
