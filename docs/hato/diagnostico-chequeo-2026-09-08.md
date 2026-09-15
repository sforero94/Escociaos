# Chequeo 8 septiembre 2026 by photo — diagnosis and correction plan

Written 2026-09-15 from production (DB, Storage, edge-function logs) and the 4 photos
Santiago attached. Times are Bogotá (UTC-5). Ids are production uuids, ready for a migration.

Decisions from Santiago (2026-09-15): the chequeo record dated 2026-09-08 is a **test**;
MARIPOSA served **29 June**; COMETA 12/08/26 confirmed, bull **Laredo**; MAGNIFICA 9/3/2026
bull **Jericó**; PAZ, NORMA, GALLETA served **1 Sept**; #178 is COMINA ("Comuna" was a typo);
#177 is renamed **MOTONETA** (MORA was a duplicate name; MORA stays #212 ternera), served
**3 Sept**; FABIOLA's July row becomes "Prostal y servir"; recapture from the attached photos.
**No open questions remain.**

Assumption: the vet visit date is 2026-09-08 (planilla title). The test record carries that
same date, so the recapture replaces it in place (065 find-or-create by fecha).

## 1. What the photos are

The 4 photos are the **4 uploads of Sept 9, 10:34–10:40** (C, D, E, F): page 1 and page 2
of the **re-printed** planilla, each photographed twice (landscape + rotated). It is the
B5.2 print of the test chequeo: gray columns pre-filled from the DB as of the night of
Sept 8 (AMAPOLA/MONZA already show `8/9/2026 Ins Hypnotic`; BRIGIDA `rech`, CAMILA `ok`
come from the test commit). Martha transcribed the vet's notes onto it by hand and added
9 novilla rows at the bottom of page 2. **None of the 4 previews was committed.**

The photo behind the test commit (Sept 8, 17:24) is a different, earlier print. Not attached.

## 2. Timeline of Martha's actions

| When | Channel | What | Result |
|---|---|---|---|
| 09-08 16:00–16:21 | Telegram `/evento` | ELECTRA serv 08-11, COPITA secado 08-12, ESMERALDA 04-09, FLACA 05-09, FUERZA 04-09, MAGNIFICA 03-09 (all "Jersey monta") | ELECTRA/FLACA duplicates removed by 138/139. ESMERALDA/FUERZA already had the date from July (accepted pair). MAGNIFICA: planilla says **Jericó**, Telegram row says Jersey. |
| 09-08 17:21 / 17:24 | Web photo A, B (1 photo each) | preview 200 ×2 | B committed 17:25:28 → **test chequeo `0f7c743d`, 19 rows, 0 events** (correct: all 14 service dates already known). |
| 09-08 17:41–17:54 | Web (Santiago) | COMETA: delete Telegram serv 08-12, secado 06-30→08-12. PAULA parto → 2026-05-22 | Traced. |
| 09-08 18:07 / 18:50 | Telegram | MONZA, AMAPOLA insem Hypnotic 09-08 | OK, pajillas linked. |
| 09-08 19:43–19:59 | Telegram `/tratamiento` | 9 treatments dated 2026-07-09 | Backfill of the **July** TTTO column (8/9 match July raw; FABIOLA "Tonificar" has no July source — July's was ESMERALDA). CUCA/CUÑA pasos overdue → alerts 09-09, confirmed by Santiago 09-11, `fecha_ejecutada` still null. |
| 09-09 10:34–10:40 | Web photos C–F | 4 previews 200, **0 commits** | The attached photos. Nothing written. |
| 09-09 10:44–10:59 | Telegram `/tratamiento` | MOCA, CAMILA, CAPERUZA, CARLA, ELECTRA (+paso 11-09), FABIOLA (+paso 09-11), JASPEADA | OK. |
| 09-09 13:16 | Web | COMETA July-import serv **04-14 → 08-12** (event `f5109dbf`) | History overwritten; bull stays Laredo. |
| 09-09 13:40–15:28 | Web Hoja de Vida | 12 "treatments" | Free-text transcription of page 2 notes. 2 duplicates, 1 wrong cow, 2 junk. |
| 09-09 15:04–15:26 | Telegram `/evento` | MARIPOSA 06-09, PIRINOLA 08-01, 6 novillas (dates typed MM/DD) | Novilla dates wrong. MOTONETA/COMINA not registered. |
| 09-11 → 09-15 | Alerts | FABIOLA paso 09-11 → Fernando registered "Se le aplicó prostal" (09-12) as a new treatment | Paso never confirmed → escalated 09-15 (#251 noise). |

## 3. Per-cow map: planilla (photos) vs system

Page 1 (the 19 test rows). Handwriting only where noted.

| Cow | Handwritten on planilla | In system | Gap |
|---|---|---|---|
| CAMILA 154 | Ttto: Prostal y insem. Hypnotic | Telegram ttto ✓ + web duplicate `7414eb85` | delete duplicate |
| CAPERUZA 98 | Ttto: Prostal y servir toro | ✓ | — |
| CARLA 156 | Ttto: Quiste operado ovario derecho | ✓ | — |
| COMETA 124 | Fecha servicio struck, **12/08/26** handwritten; toro left printed "Ins laredo" | serv 08-12 exists only because the April row was edited | restore 04-14, add 08-12 |
| CUÑA 43 | Ttto: **6 meses** | recorded on **CUCA** (`937d799b`, "preñada de 6 meses") | wrong cow |
| ELECTRA 117 | Ttto: Rechequeo | Telegram ✓ (paso 11-09) + web duplicate `609681e6` | delete duplicate |
| FABIOLA 176 | Ttto: Prostal y servir | Telegram ✓ (paso 09-11), Fernando executed 09-12 | confirm paso, close alert |
| JASPEADA 160 | Toro **Ins Márquez** for the 25/6 service; Ttto: Inseminar Márquez | ttto ✓; service `ac22a446` has `toro_id` null | set toro = Márquez |
| other 11 | nothing handwritten | test rows | replaced by recapture |

Page 2 (16 cows, no chequeo row exists for any of them).

| Cow | Handwritten | In system | Gap |
|---|---|---|---|
| MAGNIFICA 103 | Toro: **Jericó** (for 9/3/2026) | Telegram row `2feb80b5` says Jersey monta | bull conflict → Martha |
| MARIMBA 169 | Estado: rech; Ttto: Purga fasciola, 40 hoy y 40 en 21 días | ttto ✓ (paso 09-30) | "rech" only via recapture |
| MARIPOSA 120 | Fecha servicio **29/06**, toro Jersey; Ttto: secar en 3 meses | serv `b509c8fb` = 06-09 ✗; ttto ✓ | fix date → 06-29 |
| MONA 175 | Ttto: Gestar 5 ml y servir | **missing** (Fernando inseminated her 09-13, Márquez) | add ttto |
| PAULA 152 | Estado: ok; Ttto: Gestar 5 ml servir | ttto ✓ (dated 09-11) | "ok" only via recapture |
| PIRINOLA 139 | Fecha servicio **1/08** | serv 08-01 ✓; web ttto "servicio" `1678e5e4` is junk | delete junk |
| VEGA 121 | Ttto: OK | web "ok lista para servir" ✓ | — |
| VICTORIA 180 | Ttto: Servir toro | ✓ | — |
| VIGOROSA 100 | Estado: **Rechequeo** | web "hay duda rechequeo" (no paso) ✓ | ok |
| VITROLA 162 | Ttto: Inseminar Márquez | ✓ | — |
| MONZA, PACIENCIA, RICARENA, VALENCIANA, VENUS, VERONICA | nothing | — | recapture |

Bottom rows (handwritten, blue). Dates are MM/DD on paper (`9/2/26` = Sept 2).

| # | Name on paper | Date on paper | In system | Gap |
|---|---|---|---|---|
| 178 | COMINA ("Comuna" in the message was a typo) | 9/2/26 Jersey | animal exists, **`descartada` 2026-08-11**, no service | reactivate + service 09-02 |
| 177 | MORA on paper → renamed **MOTONETA** (MORA was a duplicate name; MORA stays #212 ternera) | 9/3/26 Jersey | #177 row is MOCA, **`descartada` 2026-08-11** | reactivate, rename, service 09-03 |
| 179 | ESPERANZA | 9/2/26 | `945449bb` = 02-09 | → 09-02 |
| 181 | BRILLANTINA | 9/2/26 | `7333a0d9` = 02-09; web ttto `4a934df1` "preñada toro jersey" dated 02-09 | → 09-02; delete ttto |
| 183 | MOCA | Ttto: Tonificar | ✓ | — |
| 184 | PAZ | 9/03/26 | `62752808` = 01-09 | → 09-01 (Santiago) |
| 185 | MARTHA | 9/02/26 | `2b8bc08f` = 02-09 | → 09-02 |
| 182 | NORMA | 9/01/26 | `55acb180` = 04-09 | → 09-01 |
| 192 | GALLETA | 9/01/26 | `f0f55d40` = 04-09 | → 09-01 |

The 2026-08-11 inventory cleanup discarded #177 and #178; both are in the herd and were
served in September. That cleanup needs a look, out of scope here.

## 4. What worked / what did not

Worked: photo preview (6/6), one commit with intact raw layer, event dedupe, Telegram and
web capture, duplicate guard, overdue-paso alerts.

Did not:

| # | Problem | Cause |
|---|---|---|
| P1 | Page 2 never entered; only the 19 test rows exist | 4 previews, no commit. A same-date commit **wipes and replaces** the prior rows, so both pages must go in one submission. The chequeo dialog picks one image per tap (`SubirChequeoExcel` lacks `multipleArchivo`); accumulation exists but is invisible. |
| P2 | Novilla rows cannot enter by photo | OCR roster = `hato_ordeno` + `horro` (`hato-chequeo-foto.ts:446`). |
| P3 | Novilla service dates 4–8 months early | MM/DD typed into a DD/MM parser. |
| P4 | #177/#178 unregisterable | Discarded 08-11. |
| P5 | COMETA April service lost | Edit instead of add. |
| P6 | Treatment table polluted | duplicates, wrong cow, junk, executions as new rows, unconfirmed pasos. |
| P7 | 35/35 rows will show an SX warning on recapture | PDF pre-prints "Hembra/Macho"; `parseSX` only knows codes. Services still derive (emitted before the SX switch). Noise, not blocking. |

## 5. Correction plan

Order: A (data) → B (animals) → C (recapture) → D (code). A before C so the recapture
dedupes against corrected dates and creates nothing new.

### A. Data migration (`clase datos`, backup in `respaldos`, pattern 081; `hato_eventos`
and `hato_animales` are traced by 084 only for browser sessions, so the backup is the trace)

| Step | Statement (intent) | Depends on |
|---|---|---|
| A1 | `hato_eventos` fechas: `b509c8fb` MARIPOSA → 2026-06-29; `945449bb` ESPERANZA, `7333a0d9` BRILLANTINA, `2b8bc08f` MARTHA → 2026-09-02; `62752808` PAZ, `55acb180` NORMA, `f0f55d40` GALLETA → 2026-09-01 | — |
| A2 | COMETA: `f5109dbf` fecha back to 2026-04-14 (toro laredo, as imported); INSERT servicio 2026-08-12, `fecha_confianza='exacta'`, `fuente='web'`, `tipo_servicio='inseminacion'`, `toro_id` = laredo `9a0959fd`, `datos.origen='correccion 2026-09-15'` | — |
| A3 | MAGNIFICA `2feb80b5`: `toro_id = Jericó 55944494`, `tipo_servicio='inseminacion'` | — |
| A4 | JASPEADA `ac22a446`: `toro_id = Márquez 98dc7115`, `tipo_servicio='inseminacion'` | — |
| A5 | `hato_tratamientos`: DELETE `7414eb85` (CAMILA dup), `609681e6` (ELECTRA dup), `1678e5e4` (PIRINOLA "servicio"), `4a934df1` (BRILLANTINA "preñada"); UPDATE `937d799b` → `animal_id` = CUÑA `52fa4f19`; INSERT MONA `58f8421b` "Gestar 5 ml y servir", fecha_inicio 2026-09-09, estado completado, fuente web, created_by Martha `5aee1e1b` | — |
| A6 | FABIOLA paso `07b6c1e0` `fecha_ejecutada=2026-09-12`; alert `da543f33` → `confirmada`, `respondida_por='Fernando Jimenez'`; treatment `3d643a34` → completado | — |
| A7 | CUCA paso `a032c1a5`, CUÑA paso `ae973433`: `fecha_ejecutada = fecha_programada` (July, day unknown — say so in `datos`); treatments `feb558b3`, `fc22d350` → completado | — |
| A8 | FABIOLA July row `fcc86ded`: `nombre = 'Prostal y servir'` (Santiago, per Martha's note). The Sept row `3d643a34` already says the same; both stay. | — |

Rows not touched on purpose: ESMERALDA/FUERZA Telegram+import pairs (accepted, 139);
the 10 remaining free-text web treatments (they are the only record until C lands, and
they stay valid notes after).

### B. Animals (`hato_animales`, same migration or app UI)

| Step | Action |
|---|---|
| B1 | #178 COMINA: `estado='activa'`, `fecha_estado=2026-09-15`, `notas` += "reactivada 2026-09-15: servida 2026-09-02 (chequeo sep-2026)". Then INSERT servicio 2026-09-02, Jersey `27d8768d`, monta, `fuente='web'`, `created_by` Martha `5aee1e1b`. |
| B2 | #177: `estado='activa'`, `fecha_estado=2026-09-15`, `nombre='MOTONETA'` (renamed by Martha: MORA was a duplicate of #212), `notas` += "antes MOCA/MORA; renombrada 2026-09 por homónima". INSERT servicio 2026-09-03, Jersey, monta, same attribution. |

Both rows exist with their real chapetas (177, 178); no provisional 900-range number is needed.
The 139 unique index does not fire: neither animal has any event.

### C. Recapture the full planilla (after A and B)

1. Deploy the edge function first so 146 traces the attempt (`hato_capturas_foto` is
   empty; confirm the deployed bundle includes `hato-capturas-foto.ts`).
2. Chequeo → Cargar por foto. Add **page 1, then page 2** (the two landscape photos) in
   the same dialog, one tap each. Press "Subir y revisar" **once**.
3. Fecha: 2026-09-08. Approve all 35 anchored rows (expect 35 SX warnings, P7, harmless).
   The 9 blue rows come back "no leída" (P2) — expected; their data is in `hato_eventos`
   after A1/B.
4. Commit. It replaces the 19 test rows with 35. Events created: **0** expected
   (every date is known after A). If the commit reports any `eventosEscritos > 0`, inspect.
5. Verify: `hato_chequeo_vacas` count = 35 for chequeo `0f7c743d`; `estado_raw` = rech for
   BRIGIDA, MARIMBA; ok for CAMILA, PAULA; RECHEQUEO for VIGOROSA; `ttto_raw` populated
   for the 16 cows with notes.

The photos can be re-submitted by Santiago from the UI, or by an agent driving the
logged-in browser. The originals are in Storage under
`chequeo-foto/2026-09-09T15-34-47-333Z-0a7e2ed2/` (page 1) and
`…T15-35-55-807Z-e587f4cd/` (page 2), plus the two rotated duplicates at 15:38 and 15:40.

Fallback: transcribe into the exported `.xlsx` of chequeo 2026-09-08 and upload it.

### D. Code / product tickets (CTO, separate PRs, not blocking)

| # | Gap | Proposal |
|---|---|---|
| D1 | Same-date commit silently replaces; one image per pick | `multipleArchivo` in `SubirChequeoExcel`; confirm "replaces N rows" on commit, or merge per animal (changes 065). |
| D2 | Novillas absent from OCR roster | Decide if first-service novillas belong on the planilla; if yes, roster + PDF together. |
| D3 | PDF pre-prints "Hembra/Macho" into `Sexo cría` | Print the raw code, or alias labels in `parseSX`, or suppress the issue when label == known calf sex. |
| D4 | Telegram date ambiguity | Echo the parsed date in words before saving; warn on a novilla first service > 60 days old. Optional (Santiago: not the code's fault). |
| D5 | `/tratamiento` on a cow with a pending paso | Offer "confirmar paso" first. |
| D6 | 2026-08-11 cleanup discarded 2 living novillas | Review that cleanup's list against the herd. |

## 6. Resolved questions (Santiago, 2026-09-15)

- PAZ, NORMA, GALLETA: 1 Sept 2026.
- COMETA 12/08: Laredo.
- MAGNIFICA 9/3/2026: Jericó.
- FABIOLA July row: rename to "Prostal y servir".
- #177: MOTONETA, served 3 Sept 2026. #178: COMINA, served 2 Sept 2026.

## 7. Execution order for the agents

1. `backend`: write migration 153 (next free number — verify against `origin/*` branches,
   the ledger and `respaldos` first) with sections A and B, backup in `respaldos`, guards
   on every id above. Apply with the write connector.
2. Deploy the edge function (146 trace), then run section C from the logged-in UI.
3. `qa`: run the section C.5 checks plus `v_hato_estado_actual` for the 9 novillas,
   MARIPOSA, COMETA, MAGNIFICA.
4. `cto`: file D1–D6 as issues.
