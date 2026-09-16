# Plan técnico — novedades en el chequeo (promoción de filas manuscritas + hoja de holgura)

**Written** 2026-09-15 · **Author** CTO · **Status** ready to build, no open product questions
**Product input** [`docs/hato/brief_chequeo_novedades.md`](./brief_chequeo_novedades.md) (CPO)
**Incident** [`docs/hato/diagnostico-chequeo-2026-09-08.md`](./diagnostico-chequeo-2026-09-08.md)
**Module contract** [`src/components/hato/CLAUDE.md`](../../src/components/hato/CLAUDE.md) · **Phase-3b plan** [`docs/plan_chequeo_captura_foto.md`](../plan_chequeo_captura_foto.md)

---

## 0. Owner decisions this plan implements (2026-09-15, final)

Santiago answered the brief's four questions. Quoted here so no implementer re-opens them:

| # | Question | Decision |
|---|---|---|
| 1 | Slack rows, and is a 3rd sheet acceptable? | **10 blank rows on an always-present extra sheet.** The planilla's default page count becomes **3, unconditionally** — not "a 3rd sheet only if needed". |
| 2 | What does a slack row ask for? | **The full 13-column grid**, same as an anchored row, and the slack sheet **repeats the column header at its own top** (it is a fresh page; Martha will not flip back). |
| 3 | Are first-service novillas routine? | *"It may happen, neither routine nor exceptional."* → **Do NOT widen the OCR/printed roster to include novillas.** Slack rows + row promotion is the standing answer for **any** animal not on the printed roster, novillas included. |
| 4 | May a handwritten row name a `descartada`/`vendida` animal? | **Yes — this reverses §4 of the brief.** *"If a cow is sold between chequeos and not reported via telegram, this is our gate."* The chequeo capture flow is now the deliberate backstop for an unreported sale/death/discard. It needs real design (§4 below), not just "allow it". |
| 5 | Does `estado = 'muerta'` get reactivation too? | **Yes — "muerta gets reactivation too, same as the others."** Overrides the CTO draft's Path-B-only placeholder for `muerta` (§4.6). Every non-active `estado` is treated identically; there is no special case. |

---

## 1. Scope

**In scope**

1. **Phase 0 — #259.** The chequeo commit creating a duplicate `hato_eventos` row for a fact already captured by Telegram/web on the day of the visit. Lands first, as its own PR (§3).
2. **Phase 1 — promotion (backend).** An unanchored-but-legible OCR row stops being terminal and enters the editable review queue. Pure logic + the photo handler.
3. **Phase 2 — promotion (frontend).** The review window surfaces promoted rows, and resolves the new inactive-animal case with an explicit human action.
4. **Phase 3 — paper.** The PDF gains a dedicated slack sheet (10 full-grid blank rows + its own header); the `.xlsx` gains the same 10 blank rows inside its single continuous table.
5. Doc updates (module contract, brief) and issue hygiene (#254).

**Explicitly out of scope** — each has its own ticket or its own reason:

- **#253** (several photos per submission; warn before a same-date commit replaces rows). Still open. See §8.2 — one line of it is folded into Phase 2 because it lives in the same file and Phase 1 is worth nothing without it; the rest stays under #253.
- **#255** (the `Sexo cría` "Hembra/Macho" pre-print vs `parseSX`). Orthogonal; touches the same PDF file, so §8.3 says how to avoid a collision.
- Telegram date parsing (P3/D4), treatment-table hygiene (P6), the 2026-08-11 inventory-cleanup review (D6).
- Widening the printed roster to novillas — **rejected by decision 3**, not deferred.
- Any change to `fn_hato_commit_chequeo` (migration 065). Nothing in this plan needs it.

---

## 2. The mirrored files — verified against the tree, not from memory

`src/utils/importHato/*.ts` is **generated** into two edge-function trees by
`docs/hato/regenerar-copias-importhato.py`. Verified 2026-09-15: the generator's `MODULOS`
list holds **14** modules and both destination directories hold exactly those 14 files.

| Original (edit here) | Generated copies (never hand-edit) |
|---|---|
| `src/utils/importHato/ocrChequeo.ts` | `src/supabase/functions/server/importHato/ocrChequeo.ts`<br>`supabase/functions/make-server-1ccce916/importHato/ocrChequeo.ts` |
| `src/utils/importHato/commitChequeo.ts` | same two dirs |
| `src/utils/importHato/diffChequeo.ts` | same two dirs |
| `src/utils/importHato/chequeos.ts` | same two dirs |
| `src/utils/importHato/grilla.ts`, `tipos.ts`, `celdas.ts`, `parseToro.ts`, `terneras.ts`, `dedupe.ts`, `normalizar.ts`, `overridesChapeta.ts`, `ocrPesaje.ts`, `ocrPesajeCorreccion.ts` | same two dirs |

```bash
python3 docs/hato/regenerar-copias-importhato.py          # regenerate
python3 docs/hato/regenerar-copias-importhato.py --check   # verify only (what the test runs)
```

`src/__tests__/importHatoParidadServidor.test.ts` runs `--check` plus a behavioural parity
check. **A hand-edited copy turns that test red — regenerate, never patch the copy.**

`src/utils/calculosHato.ts` is a **different** generator (`docs/hato/regenerar-copias-servidor.py`,
byte-identical copy → `calculos-hato.ts` in both trees), guarded by
`src/__tests__/calculosHatoParidad.test.ts`. Phase 0 touches it.

**Hand-synced pairs (no generator, no `--check` — a human keeps them equal):**

| File | Pair |
|---|---|
| `src/supabase/functions/server/hato-chequeo-foto.ts` | `supabase/functions/make-server-1ccce916/hato-chequeo-foto.ts` |
| `src/supabase/functions/server/hato-chequeo-commit.ts` | `supabase/functions/make-server-1ccce916/hato-chequeo-commit.ts` |
| `src/supabase/functions/server/hato-chequeo-preview.ts` | `supabase/functions/make-server-1ccce916/hato-chequeo-preview.ts` |

Verified byte-identical today (`diff -q`). Two existing tests read **both** trees and will catch a
half-applied edit: `src/__tests__/hatoCapturasFoto.test.ts` and
`src/__tests__/hatoChequeoHistoricoPaginadoGuard.test.ts`. Neither asserts full equality of the
pair, so **`diff -q` on the three pairs is a required step of every PR in this plan.**

Files with **no** mirror (frontend only): `src/utils/hatoCorreccionChequeo.ts`,
`src/utils/hato/exportarPlanillaChequeo.ts`, `src/utils/hato/exportarPlanillaChequeoPDF.ts`,
everything under `src/components/hato/`.

---

## 3. Phase 0 — issue #259 first, as its own PR

### 3.1 The issue's root-cause analysis is wrong, and the correction makes the fix cheap

#259 says `fn_hato_commit_chequeo` "does not check whether the cow already has an equivalent
event captured elsewhere" and proposes a check inside the RPC. **The RPC is the wrong layer and
the mechanism already exists.**

`src/utils/importHato/commitChequeo.ts` has `fusionarEventosManualesEnDedupe` — headed
*"N10 — el nodo que impide que el chequeo duplique lo que ya se registró a mano"* — written for
exactly this case, after the July-2026 cleanup of 385 duplicated `servicio` and 806 duplicated
`parto` rows. It merges manually-captured events (`chequeo_vaca_id IS NULL`) into the two dedupe
maps `derivarEventosDeChequeo` consumes.

It misses the 2026-09-08 case because of **one boundary condition, in two places**:

| Place | Code | Effect |
|---|---|---|
| `hato-chequeo-commit.ts` (both trees), the `hato_eventos` query | `.lt('fecha', chequeo.fecha)` | a same-day manual event is never even fetched |
| `commitChequeo.ts::fusionarEventosManualesEnDedupe` | `if (evento.fecha >= chequeoNuevoFecha) continue;` | and would be discarded if it were |

MONZA and AMAPOLA were inseminated with Hypnotic **on 2026-09-08**, the day of the visit. The
chequeo is dated 2026-09-08. `2026-09-08 >= 2026-09-08` → skipped → the commit derived a second
`servicio` for each. The in-code comment justifying the strict `<` reads *"Un evento manual del
mismo día o posterior no es 'lo ya conocido', es otro hecho."* **That reasoning is false for the
visit day**, which is precisely the day the corral captures things by Telegram before the planilla
is photographed and committed (here, a week later).

### 3.2 The fix

Change the boundary from strictly-before to **on-or-before**, for both `servicio` and `parto`:

- `hato-chequeo-commit.ts` (**both trees**): `.lt('fecha', chequeo.fecha)` → `.lte('fecha', chequeo.fecha)`.
- `commitChequeo.ts::fusionarEventosManualesEnDedupe`: `>=` → `>`; update the comment to say why
  the visit day is inside the window.

Why `parto` widens too, and why widening cannot lose a real event:

- `servicio`: the planilla can only carry service dates up to the visit day, so a date **after**
  the chequeo can never match anything in `fechasServicio` — including it is inert. A date **equal
  to** the chequeo is the measured bug.
- `parto`: `ultimaCriaAnterior` feeds `agruparPartosPorProximidad`, which already refuses to treat
  two births less than `DIAS_MINIMOS_ENTRE_PARTOS = 60` days apart as different births. A parto
  manually registered the same day as the visit is, by that rule, the same birth the Última Cría
  column reports. Moving the boundary by one day cannot suppress a genuinely different birth.

### 3.3 The half that keeps it honest: a suppressed service must not be silent

`descomponerSX` (`src/utils/calculosHato.ts` ~line 1369) drops a known service date with a bare
`return;` — no issue. That is tolerable for the chequeo-to-chequeo case (CAMILA #154: the same
F Servicio re-copied into four consecutive planillas; an issue there would fire on most rows of
every round and become noise). It is **not** tolerable for the manual-capture collision, because
that is exactly where planilla and Telegram can disagree on the bull: MAGNIFICA #103, 2026-09-03,
planilla says *Jericó / inseminación*, Telegram says *Jersey / monta*. Date-only dedupe means the
planilla's version is dropped, and today nobody is told.

Add an **optional, additive** input to `InputDescomposicionSX`:

```ts
/** Fechas de servicio del animal ya registradas A MANO (Telegram, ficha) antes
 * o el mismo día de este chequeo. Subconjunto de `fechasServicioConocidas`:
 * NO cambia qué se deduplica -- solo decide si la supresión deja un issue.
 * Vacío por defecto: llamadas existentes se comportan byte por byte igual. */
fechasServicioRegistradasAMano?: readonly string[];
```

When a service date is suppressed **and** it is in that set, push a `ParseIssue` naming the date
and what the planilla said (bull + tipo de servicio), so it lands in
`hato_chequeo_vacas.normalizacion_issues` and renders in the review window next to the row — the
same channel `CORRECCIÓN MANUAL` already uses. The handler populates it from the same
`eventosManuales` query it already runs.

### 3.4 Sequencing: #259 lands **before** Phase 1 backend, in its own PR

Reasoning, stated because the user asked for it rather than a punt:

1. **It is live today, independently of novelties.** Every chequeo commit where a cow was captured
   the same day duplicates her event. The visit day is the most likely day for that to happen. It
   does not need Phase 1 to be worth fixing.
2. **It is small and surgical** — two boundary conditions, one optional engine input, tests.
   Bundling it into Phase 1 would put "promotion" and "event dedupe" — two unrelated risks — in
   one review, on a module whose history is a list of duplicate-event cleanups.
3. **It removes a confound from Phase 1's acceptance test.** "The promoted row created a duplicate
   event" would be ambiguous between the two changes if they shipped together.
4. **File contention.** Both touch `commitChequeo.ts` (1 original + 2 generated copies) and
   `hato-chequeo-commit.ts` (2 hand-synced copies). Doing #259 first means Phase 1 rebases onto an
   already-regenerated mirror set. The reverse order means regenerating mirrors during a conflict
   resolution — the exact shape of the two renumbering/duplicate-prefix incidents this repo paid
   for in the last two weeks (migrations 140 and 144).

Phase 0 does **not** block Phase 3 (paper), which touches a disjoint file set and can run in
parallel.

**Phase 0 is not a hard blocker for Phase 1's correctness.** A first-service novilla's date is
normally a few days before the visit, where the existing `<` window already dedupes. Phase 0 is
sequenced first for the four reasons above, not because Phase 1 is unsafe without it.

---

## 4. Architecture decisions

### 4.1 Where promotion happens: in the pure OCR module, never in the handler

`procesarLecturaOcr` (`src/utils/importHato/ocrChequeo.ts`) already decides, per row, anchored vs.
rejected. Promotion is the same decision with a third outcome. Putting it there means:

- it is pure and testable from Vitest without crossing the Deno boundary;
- it reaches both edge-function trees through the existing generator;
- **the promoted row goes through `normalizarHojas` → `parseSX`/`parseToro`/`parseFechasServicio`/
  `parseUltimaCria` like every other row.** There is exactly one cell interpreter in this repo and
  this plan does not add a second. A promoted row is written into the same raw matrix; it is not a
  parallel object built by hand.

*Alternative considered and rejected:* return promoted rows as a separate structure and build
`FilaChequeoNormalizada` for them in the handler. Rejected — it would mean re-implementing cell
parsing outside `chequeos.ts`, which is the module's hardest rule.

### 4.2 `validarAnclaFila` is frozen. The new motive is decided outside it.

`validarAnclaFila` is the anti-row-drift core. It keeps its current signature, its current five
motives and its current behaviour, byte for byte. The refinement
`numero_fuera_del_roster → numero_animal_inactivo` happens in `procesarLecturaOcr`, on a row that
`validarAnclaFila` has **already rejected**, using a second index.

This is load-bearing: the second index can only ever **decorate a rejection**, never turn a
rejection into an acceptance. A bug in it cannot produce row drift.

### 4.3 The rejection-motive taxonomy

`MotivoNoLeida` gains exactly **one** member:

```ts
export type MotivoNoLeida =
  | 'numero_ilegible'              // promovible
  | 'numero_fuera_del_roster'      // promovible
  | 'numero_animal_inactivo'       // NUEVO -- promovible, resolución distinta
  | 'chapeta_ambigua_en_roster'    // TERMINAL, jamás promovible
  | 'nombre_no_corresponde'        // TERMINAL, jamás promovible
  | 'lectura_repetida_divergente'; // TERMINAL, jamás promovible
```

**Why `numero_animal_inactivo` is a motive of its own and not a flag on `numero_fuera_del_roster`:**
resolving it has an **irreversible side effect on `hato_animales.estado`**. It is an inventory
decision wearing a chequeo row's clothes. The other two promotable cases only assign identity to a
row. A shared motive would force the UI to branch on an undeclared sub-state, and the two cases
must not look the same on screen — one says "tell me who this is", the other says "this row claims
an animal the system believes is gone".

**The two terminal motives stay terminal. This is a safety property, not a UX preference.**
`nombre_no_corresponde` and `chapeta_ambigua_en_roster` are the literal signature of row drift — a
number the sheet **did** print, sitting next to the wrong name. Promoting either would let the
worst failure mode of this module (one cow's data on another cow's row) enter through the door
built to keep it out. `lectura_repetida_divergente` is terminal for the same family of reasons: two
photos disagree, and nothing in this module adjudicates a disagreement by itself.

A test must pin this. `src/__tests__/importHatoOcrChequeo.test.ts` gets a case asserting that the
promotable set is exactly those three and that each terminal motive produces
`promovible === false`, so adding a motive later cannot silently widen the door.

### 4.4 The promotability predicate

A rejected row is promoted **iff all three hold**:

1. its motive is `numero_ilegible`, `numero_fuera_del_roster` or `numero_animal_inactivo`; **and**
2. `normalizarNombreParaCotejo(fila.nombreImpreso) !== ''` — a name was written; **and**
3. at least one of the 11 data cells has non-empty `texto` (regardless of confidence).

Rows failing (2) or (3) stay in `filasNoLeidas` with their motive plus a new
`motivoNoPromovible: 'motivo_terminal' | 'sin_nombre_escrito' | 'sin_datos'`, and the UI says which.
**Nothing is dropped silently** — that remains the module's floor.

Why each condition earns its place:

- **(2) is not a formality, it is what keeps the row alive downstream.** A promoted row is written
  into the matrix with the `#` column **empty** (identity is never guessed) and the `Nombre` column
  carrying `nombreImpreso` **verbatim, as a label, never as a key**. `esFilaVacia` (`grilla.ts`)
  counts `nombre` among the columns that decide emptiness, so a promoted row with a name always
  survives; one without a name and with only low-confidence cells would be blanked by
  `textoParaPipeline` and then dropped as `fantasma` — a silent loss. Requiring the name closes
  that hole at the source instead of special-casing the filter. It also matches what the brief
  assumes Martha already does: she writes the number **and** the name.
- **(3)**: a row with a name and no data has nothing to write. Promoting it would put an empty row
  in front of a human for no reason.
- Carrying `nombreImpreso` in the `Nombre` column is safe even though the anti-drift rule says the
  identity columns are written with the **canonical roster value**. For a promoted row there is no
  roster entry, so there is no canonical value, and `numero` stays `null` — which means
  `construirDiffChequeo` classifies the row `no_reconocido` and
  `CLASIFICACIONES_ESCRIBIBLES` (`commitChequeo.ts`) refuses to write it. **A promoted row cannot
  reach the database until a human types a caravana.** No change to the commit is needed to enforce
  that; it already holds.

### 4.5 Promoted rows are deduplicated across photos

Confirmed rows are deduplicated by `numero` (`yaConfirmada`). Promoted rows have no `numero`, so a
slack sheet photographed twice — **exactly what happened on 2026-09-09**: four uploads, page 1 and
page 2 each shot landscape and rotated — would offer every handwritten row twice.

Apply the same rule confirmed rows already use, keyed on
`normalizarNombreParaCotejo(nombreImpreso) + '|' + numeroImpreso.trim()`:

- identical `firmaLectura` → keep one, push an `advertencia`;
- divergent → keep **neither**; both go to `filasNoLeidas` with `lectura_repetida_divergente`.

Same reasoning as the existing branch: if two photos contradict each other, neither is "the good
one" for having arrived first.

### 4.6 Resolving `numero_animal_inactivo` (decision 4)

**Both paths are offered. Neither is a default.**

The row is surfaced in the review window with a distinct treatment — an amber panel, not a normal
`no_reconocido` chip — reading, in substance:

> *La fila escrita a mano dice **#178 COMINA**. Ese número lo lleva un animal que el sistema tiene
> como **descartada desde el 2026-08-11**. Nadie puede aprobar esta fila hasta que decidas qué
> pasó.*

with two buttons and no third option:

**Path A — «El animal sigue en el hato» (reactivar).**
Opens `ReactivarAnimalDialog`. On confirm, and **from the browser session, never from the commit
endpoint** (see 4.7), it writes to `hato_animales`, for that `id` only:

| Column | Value |
|---|---|
| `estado` | `'activa'` |
| `fecha_estado` | `obtenerFechaHoy()` — local Bogotá, **never** `toISOString().slice(0,10)` |
| `notas` | previous `notas` + a dated paragraph built by `construirNotaReactivacion` (pure, §6.2) |

Nothing else. **`numero`, `nombre`, `etapa`, `raza`, genealogy and every `hato_eventos` row are
untouched.** In particular the `venta`/`muerte` event that closed the animal is **not deleted** —
it may be linked to a `fin_transacciones_ganado` row, and "the animal is back" and "the sale was
wrong" are two different claims. Correcting the sale is `EditarEventoDialog`, deliberately.
Renaming is `EditarAnimalDialog`, deliberately — migration 153 renamed #177 to MOTONETA, but that
was a separate owner decision, not part of "she is back".

This is the exact shape of `153_correccion_chequeo_2026_09_08.sql` §B, which is the precedent
Santiago pointed at. The whole point of this phase is that it stops being a migration.

On success the dialog also calls `revision.corregirCampo(fila, 'numero', String(numero))` and
`revision.recargarEstado()`, so the row re-classifies live and the adjudication is recorded as the
existing `CORRECCIÓN MANUAL [numero]` issue.

**Path B — «Me equivoqué de número» (reasignar).**
No new UI: the `numero` field of that row in `ChequeoDiffReview` is already editable and already
re-diffs on every keystroke. The panel just says so and focuses the field. If the corrected number
belongs to no animal, the row becomes `nuevo` and `CrearAnimalDialog` — already wired there — is
the exit.

**One hard edge, surfaced and never auto-resolved:**

> **Update 2026-09-15 — Santiago: "muerta gets reactivation too, same as the others."** The CTO
> draft below offered Path B only for `estado = 'muerta'`, as a placeholder for a case he had not
> named. He overruled it. **Path A and Path B are offered identically for every non-active
> `estado`** — `descartada`, `vendida`, `muerta`, anything else the herd can carry. The panel does
> not special-case any of them: `candidatosInactivos` (§5.1) is already estado-agnostic, so this
> removes a branch from the design rather than adding one. `ReactivarAnimalDialog` writes the same
> three columns (§4.6 Path A) regardless of which `estado` it is reactivating from.
- **Caravana collision.** `hato_animales_numero_activa_unique` (migration 066) is partial on
  `estado='activa'`. If an active animal already carries #178 — reachable, because an active
  **novilla** is not in the printed roster and so would not have anchored — the `UPDATE` raises
  `23505`. The dialog must pre-check against the already-loaded active herd and, if it collides,
  refuse with *«La caravana 178 la lleva hoy {NOMBRE} (activa). Renumera primero, o corrige el
  número de esta fila.»* — and still handle `23505` from the server as the real guard.
  **Never auto-assign a provisional 900-range number**: those are importation working numbers, and
  fabricating one to dodge a conflict is the kind of silent adjudication this module forbids.
- If **more than one** inactive animal carries the read number (possible: uniqueness is only among
  actives), the panel lists them all with their `estado`/`fecha_estado` and **pre-selects none**.

### 4.7 The reactivation is written by the browser, not by the endpoint — and that is why it is traced

`hato_correcciones` (migration 084) covers `hato_animales` but its trigger opens with
`IF auth.uid() IS NULL THEN RETURN`. The commit endpoint writes with `service_role`, where
`auth.uid()` is NULL. **A reactivation performed inside `hato-chequeo-commit.ts` would leave no
trace at all** — on the single most consequential write in this whole plan.

Performed from the browser with the user's session it is traced automatically, under the module's
existing RLS (Administrador + Gerencia), with `HistorialCorreccionesCard` on the ficha showing it
afterwards. That is the whole reason the reactivation is a pre-commit client action and not a field
in the commit payload, and it is the same shape `CrearAnimalDialog` already follows.

**Accepted limitation, stated rather than hidden:** appending to `notas` is a read-then-write, so
two people editing the same animal's notes within the same seconds could lose one edit. PostgREST
cannot express `notas = COALESCE(notas,'') || $1` and an RPC would need a migration for a race that
needs two simultaneous Gerencia editors on one animal, in a herd with one regular capturer. The
dialog re-reads `notas` immediately before writing. If this ever bites, the fix is an RPC, not a
retry loop.

### 4.8 No migration is needed. Here is the check, per surface.

| Surface | Verdict |
|---|---|
| `MotivoNoLeida`, `motivoNoPromovible`, `FilaOcrPromovida` | TypeScript unions and interfaces. They live **only in the HTTP response** (`ocr.filasNoLeidas` / `ocr.filasPromovidas`) and are never persisted. No column, no CHECK. |
| The promoted row itself | Travels as an ordinary `FilaChequeoNormalizada` with `numero = null`. Its provenance is a `ParseIssue` in `hato_chequeo_vacas.normalizacion_issues` — **`jsonb`, no schema change** — the same channel `CORRECCIÓN MANUAL` has used since Fase 3a. |
| Reactivation | `hato_animales.estado` / `fecha_estado` / `notas` all exist. `estado='activa'` is already in the CHECK. RLS unchanged. Trigger 084 already covers the table. |
| Slack rows (PDF + `.xlsx`) | Pure rendering. |
| #259 | Two query/comparison boundaries and one optional function parameter. |
| `hato_capturas_foto` (146) | Has **fixed columns**. Recording "N rows promoted" would need a migration for a diagnostic number. **Do not.** It travels in the HTTP response and the structured log line — the same call the module already made for `retiradas_regla_superada` (ESCO-93) against the fixed columns of migration 116. |

**Answer: no migration in any phase of this plan.** If an implementer believes otherwise, that is a
signal the design drifted — escalate, do not write the migration.

---

## 5. Phase 1 — backend

### 5.1 `src/utils/importHato/ocrChequeo.ts` (+ 2 generated copies)

New exported types:

```ts
export type MotivoNoPromovible = 'motivo_terminal' | 'sin_nombre_escrito' | 'sin_datos';

/** Un animal que NO está en el roster impreso pero que lleva el número que el
 * modelo leyó. SUGERENCIA para un humano, jamás una asignación. */
export interface AnimalFueraDelRoster {
  id: string;
  numero: number;
  nombre: string | null;
  estado: string;            // 'activa' | 'descartada' | 'vendida' | 'muerta' | ...
}

export interface FilaOcrPromovida {
  /** Join key contra `FilaChequeoNormalizada.fila`, igual que `filasConfirmadas`. */
  filaExcel: number;
  pagina: number;
  orden: number;
  /** Verbatim. NUNCA se escribe en la columna `#`. */
  numeroImpreso: string;
  /** Verbatim. Se escribe en `Nombre` como ETIQUETA, nunca como llave. */
  nombreImpreso: string;
  motivo: 'numero_ilegible' | 'numero_fuera_del_roster' | 'numero_animal_inactivo';
  detalle: string;
  celdas: Record<ColumnaOcr, CeldaOcr>;
  celdasNoConfiables: ColumnaOcr[];
  /** Solo `numero_animal_inactivo`. 1..N. Nunca se aplica solo. */
  candidatosInactivos: AnimalFueraDelRoster[];
  /** Solo `numero_fuera_del_roster` cuando el número resuelve a un animal
   * ACTIVO fuera del roster impreso (una novilla). Sugerencia. */
  sugerenciaActiva: AnimalFueraDelRoster | null;
}

/** Prefijo ESTABLE del issue de procedencia. Se busca por texto en la UI y en
 * cualquier consulta futura sobre `normalizacion_issues`. No se cambia sin
 * migrar los datos ya escritos -- misma regla que
 * `PREFIJO_ISSUE_CORRECCION_MANUAL`. */
export const PREFIJO_ISSUE_FILA_PROMOVIDA = 'FILA ESCRITA A MANO';
```

`FilaOcrNoLeida` gains `motivoNoPromovible: MotivoNoPromovible`.
`ResultadoOcrChequeo` gains `filasPromovidas: FilaOcrPromovida[]`.

New pure functions:

- `construirIndiceFueraDelRoster(animales: AnimalFueraDelRoster[], roster: RosterPlanilla): Map<number, AnimalFueraDelRoster[]>`
  — indexes by `numero` every animal **not** in the printed roster (active novillas/terneras and
  every non-active animal). Returns a **list** per number because uniqueness only holds among
  actives.
- `esFilaOcrEnBlanco(fila: FilaOcr): boolean` — true when no data cell has text. Used for
  condition (3).
- `clasificarPromocion(rechazo, fila, indiceFuera): { promovible: true, ... } | { promovible: false, motivoNoPromovible }`
  — the predicate of §4.4 plus the `numero_fuera_del_roster → numero_animal_inactivo` refinement.

`procesarLecturaOcr` gains an optional third argument on its options object
(`indiceFueraDelRoster?: Map<number, AnimalFueraDelRoster[]>`, default empty → today's behaviour
byte for byte) and:

1. routes each rejected row through `clasificarPromocion`;
2. deduplicates promoted rows per §4.5;
3. appends promoted rows to the raw matrix **after** the confirmed rows, with `#` empty and
   `Nombre` = `nombreImpreso`;
4. renumbers `filaExcel` across confirmed **and** promoted rows in matrix order — the existing
   renumber-after-filter step must cover both, or the confidence ↔ normalized-row join points at
   the wrong cow;
5. leaves `vacasSinLeer` untouched (a promoted row is not a roster cow).

**Prompt changes** (`construirPromptOcr`), three and no more:

- the assertion that `#` and `Nombre` are always printed becomes: *"en la última hoja esas dos
  columnas pueden venir escritas a mano"*;
- a new rule: *"No devuelvas filas completamente en blanco (sin número, sin nombre y sin ninguna
  celda escrita)."* — kills the 10 empty slack rows at the source; §4.4(3) is the belt-and-braces;
- **rule 2 is untouched**: a value is never moved to a neighbouring row.

`esquemaJsonOcr()` does not change.

### 5.2 `hato-chequeo-foto.ts` (both trees, hand-synced)

- The roster query is already `v_hato_estado_actual.select('*')` with **no** `estado` filter — the
  view has no `WHERE` on `estado` either (verified against migration 056), so **every animal in the
  herd is already in `filasRoster`, inactive ones included.** No new query. Build
  `indiceFueraDelRoster` from the rows the `categorizarAnimal` predicate rejects, and pass it to
  `procesarLecturaOcr`.
- After `normalizarHojas`, merge one `PREFIJO_ISSUE_FILA_PROMOVIDA` issue into each promoted row's
  `issues`, joined by `filaExcel` → `FilaChequeoNormalizada.fila`. The issue text names the motive
  and quotes `numeroImpreso`/`nombreImpreso` verbatim, so the provenance reaches
  `normalizacion_issues` and survives the commit.
- Response: add `ocr.filasPromovidas` and `ocr.resumen.filasPromovidas`; `filasNoLeidas` entries
  now carry `motivoNoPromovible`.
- `cerrarCapturaFoto({ desenlace: 'pendiente', celdasLeidasOcr })` currently passes
  `ocr.filasConfirmadas.length`. Make it `confirmadas + promovidas` — otherwise a photo of a sheet
  that is *all* handwritten reads as "the OCR read nothing", which is the exact ambiguity migration
  146 exists to remove. The existing `ocr_fallo` guard ("ninguna fila ancló") must likewise count
  promoted rows before declaring failure.
- **`hato-chequeo-preview.ts` (the `.xlsx` twin) is not touched.** It has no anchor step: a
  hand-typed row in the `.xlsx` already arrives as a normal row and is matched by number.

### 5.3 What Phase 1 deliberately does not touch

`hato-chequeo-commit.ts`, `fn_hato_commit_chequeo`, `construirDiffChequeo`,
`validarFilasCommit`, `CLASIFICACIONES_ESCRIBIBLES`. A promoted row is `no_reconocido` until a
human gives it a caravana, and the commit already refuses `no_reconocido`. The safety property is
inherited, not re-implemented.

---

## 6. Phase 2 — frontend

### 6.1 `src/components/hato/components/SubirChequeoExcel.tsx`

- The OCR quality panel gains a **«Filas escritas a mano ({n})»** block above the existing
  «Filas que no se pudieron identificar» list, explaining that those rows are now editable in the
  table below and that each needs a caravana before it can be approved.
- The existing `filasNoLeidas` list now prints `motivoNoPromovible` in plain Spanish, so
  "the system did not understand it" and "you cannot do anything about it" stop being the same
  sentence.
- `resumen` line: report `filasConfirmadas` **and** `filasPromovidas` — the current
  "N de M vacas reconocidas" would otherwise under-report a sheet full of novelties.
- **Fold in the one line of #253 that lives here** (see §8.2): pass `multipleArchivo` to the
  `CapturaArchivo` in this dialog. `agregarFotos` already accumulates; the gallery picker is capped
  at one image only because the prop defaults to `false`. `PesajeLecheCard.tsx` and
  `SubirPesajeFoto.tsx` already pass it. Phase 1 delivers **zero** user-visible value until page 3
  can travel in the same submission as pages 1–2.

### 6.2 New: `src/utils/hato/reactivacionAnimal.ts` (pure, tested)

```ts
export function construirNotaReactivacion(input: {
  notasPrevias: string | null;
  estadoAnterior: string;
  fechaEstadoAnterior: string | null;
  fechaHoy: string;          // obtenerFechaHoy(), local
  fechaChequeo: string | null;
  motivo: string | null;     // lo que escribió la persona, opcional
}): string;

export function detectarColisionCaravana(
  numero: number,
  activos: { id: string; numero: number | null; nombre: string | null }[],
  excluyendoId: string,
): { id: string; nombre: string | null } | null;
```

Text shape (Spanish, tuteo, matching migration 153 §B):

> `Reactivada 2026-09-15 desde el chequeo del 2026-09-08: apareció escrita a mano en la planilla (antes descartada desde 2026-08-11). {motivo}`

### 6.3 New: `src/components/hato/hooks/useReactivarHatoAnimal.ts`

A narrow write — `estado`, `fecha_estado`, `notas` only, by `id`. **Not** an extension of
`useActualizarHatoAnimal`, which takes all ten editable fields and would clobber whatever the
caller did not load. Reads `numero, nombre, estado, fecha_estado, notas` immediately before
writing; translates `23505` to the caravana-collision message the same way
`useActualizarHatoAnimal` does.

### 6.4 New: `src/components/hato/components/ReactivarAnimalDialog.tsx`

`Dialog` + `DialogContent size="sm"` + `DialogHeader` + `DialogBody` + `DialogFooter` — the
mandatory pattern; scrollable content goes in `DialogBody`, never on `DialogContent`
(`src/__tests__/dialogScrollContract.test.ts` enforces it).

Contents: the candidate list (`numero`, `nombre`, `estado`, `fecha_estado`), an optional free-text
`motivo`, an explicit statement of what will and will not change (the three columns; and that the
venta/muerte event stays), and the collision pre-check. Gated to Administrador + Gerencia, and
re-checked inside the dialog (`useAuth().isLoading` → skeleton, not a blank space — the FIX 5
pattern), same defense-in-depth as `MarcarCicloDialog`.

### 6.5 `src/components/hato/components/ChequeoDiffReview.tsx`

- A `no_reconocido` row whose `issues` carry `PREFIJO_ISSUE_FILA_PROMOVIDA` renders a
  **«escrita a mano»** chip and a one-line hint ("escribe la caravana para identificarla"),
  detected by issue prefix — the same mechanism already used for
  `PREFIJO_ISSUE_CORRECCION_MANUAL`, so no type change is needed.
- Rows whose `fila` appears in `ocr.filasPromovidas` with `motivo === 'numero_animal_inactivo'`
  render the amber resolution panel of §4.6, with its two buttons. The candidate list is joined
  from `ocr.filasPromovidas` by `fila` — response-only data, never from the DB row.
- For `motivo === 'numero_fuera_del_roster'` with a `sugerenciaActiva`, show it as a one-click
  **fill** of the `numero` field (which then goes through the normal correction path and leaves the
  normal `CORRECCIÓN MANUAL [numero]` issue). It pre-fills; it never approves.
- Nothing else changes. `nuevo` and `no_reconocido` remain unapprovable by any shortcut.

### 6.6 `src/components/hato/hooks/useSubirChequeoExcel.ts`

Extend `ReporteOcrChequeo` with `filasPromovidas` and the `motivoNoPromovible` field on
`filasNoLeidas`. Type-only; the hook's behaviour does not change.

---

## 7. Phase 3 — the paper

### 7.1 `src/utils/hato/exportarPlanillaChequeoPDF.ts`

New exported constants:

```ts
/** Filas en blanco de la hoja de holgura. Decisión del dueño 2026-09-15. */
export const FILAS_LIBRES_PLANILLA_CHEQUEO = 10;

/** Alto de fila de la hoja de holgura, mayor que el de la tabla del roster
 * (`ALTO_MINIMO_FILA_MM = 9`). No es una inconsistencia: la restricción de 9mm
 * viene de meter 35 filas en 2 páginas, y esta hoja lleva 10 filas en una
 * página entera. Además acá se escriben LAS TRECE columnas a mano, no seis. */
export const ALTO_FILA_HOJA_LIBRE_MM = 12;

export const TITULO_HOJA_LIBRE = 'Animales que no están en la lista';
export const INSTRUCCION_HOJA_LIBRE =
  'Escriba aquí cualquier animal que el veterinario revise y que no aparezca en las hojas anteriores. ' +
  'Anote SIEMPRE la caravana y el nombre: sin las dos no se puede identificar.';
```

`construirDocumentoPlanillaChequeoPDF` gains, after the existing `autoTable` call and before
`estamparPiesDePagina`:

1. `doc.addPage()`;
2. the `TITULO_HOJA_LIBRE` / `INSTRUCCION_HOJA_LIBRE` lines;
3. a **second** `autoTable` with `head: [[...ENCABEZADOS_PLANILLA_CHEQUEO]]` (decision 2 — the
   header repeats on its own sheet) and a body of `FILAS_LIBRES_PLANILLA_CHEQUEO` rows of 13 empty
   strings, sharing the same `ANCHOS_COLUMNAS_PDF_MM`, `tableWidth`, `margin` and `headStyles` so
   the two grids line up exactly;
4. **`columnStyles` for this table paints all 13 columns white with the thick
   `lineWidth: 0.45`** — on a slack row `#` and `Nombre` are handwritten too, so the gray
   "reference" treatment of `COLUMNAS_PRELLENADAS` would be a lie.

`didDrawPage` already stamps the page title on every page and will fire for the new one.
`estamparPiesDePagina` already iterates every page.

**Page-count invariant, expressed as a computation and not as a literal:** the slack sheet is
always the **last** page and always exists, so
`total = páginas del roster + 1`. With today's 35-row roster that is exactly **3**.
**Do not hardcode 3 anywhere except in a fixture-specific assertion** — a literal page count
measured against today's herd is the same mistake migration 103 made with `1910` and migration 120
made with `4000`, and the pesaje planilla already documents the right pattern
(`calcularMetricasFilaPesaje` computes the page count instead of asserting it).

### 7.2 `src/utils/hato/exportarPlanillaChequeo.ts` (`.xlsx`)

Append `FILAS_LIBRES_PLANILLA_CHEQUEO` fully-blank rows at the end of the **same continuous
table**, in `construirAOAPlanillaChequeo`.

**No repeated header row, ever.** The file's own contract says it twice ("nunca repetir el header,
rompe la extracción del parser de subida") and `esFilaEncabezadoRepetido` exists to defend it. The
`.xlsx` has no pages, so the repeat that decision 2 asks for on paper has no counterpart and no
excuse here.

An unfilled blank row is dropped by `esFilaVacia` as `fantasma`, with no issue — the existing,
correct behaviour. A filled one parses as a normal row. Export the constant from the PDF module (or
a shared spot) so the two artifacts cannot drift.

*Secondary to the PDF, but worth the one line:* the `.xlsx` is the fallback path, and the two
artifacts should describe the same planilla.

---

## 8. Issue hygiene

### 8.1 #254 — **close it, re-scoped**

#254's own "Listo cuando" opens with *"Hay una decisión escrita sobre si las novillas van en la
planilla."* That decision now exists and is **no** (decision 3). Items 2–4 are all conditional on
"si van", so they are moot; the data-loss consequence it documents is what this plan closes by a
different route. Re-scoping the title would leave an issue whose body argues a question that is
answered, so: **close, with a comment that carries the decision forward.**

```bash
gh issue comment 254 --body "$(cat <<'EOF'
Cerrada por decisión de producto, no por implementación.

Santiago respondió el 2026-09-15 la pregunta que este issue dejaba abierta ("¿la novilla de primer
servicio va en la planilla?"): **no**. Textual: *"It may happen, neither routine nor exceptional."*
El roster impreso y el roster del OCR **no** se amplían a novillas — ni a ninguna otra categoría.

La respuesta estándar para cualquier animal que no esté en el roster impreso —novilla, vaca
comprada, chapeta recién cambiada, vaca chequeada fuera de turno— pasa a ser el mecanismo general:
**10 filas en blanco en una hoja de holgura + promoción de la fila manuscrita a la ventana de
revisión**, donde una persona le asigna la identidad. Eso cubre el caso de este issue y el
siguiente, que hoy no conocemos.

Plan técnico: `docs/hato/plan_chequeo_novedades_implementacion.md`
Brief de producto: `docs/hato/brief_chequeo_novedades.md` (§7 pregunta 3)

El no-objetivo que este issue fijaba —"no cambiar la regla de anclaje ni el comportamiento
`no leída`"— se respeta: `validarAnclaFila` no se toca, y `nombre_no_corresponde` /
`chapeta_ambigua_en_roster` siguen siendo terminales. Lo que cambia es que una fila rechazada por
"este número no estaba impreso" deja de ser el final del camino.
EOF
)"

gh issue close 254 --reason "not planned"
```

### 8.2 #253 — stays open, one line of it moves into Phase 2

#253 is still OPEN and `SubirChequeoExcel.tsx` still does not pass `multipleArchivo`. The brief is
right that it is a hard prerequisite: a novelty row lives at the foot of the **last** page, and a
same-date commit **replaces** the previous rows, so page 3 must travel in the same submission as
pages 1–2 or the whole thing is lost anyway.

Fold only the `multipleArchivo` prop into Phase 2 — it is one line, in a file Phase 2 already
rewrites, and Phase 1 ships zero value without it. The rest of #253 (warn before a same-date commit
replaces N rows) stays under #253.

```bash
gh issue comment 253 --body "$(cat <<'EOF'
Nota de secuenciación (CTO, 2026-09-15).

La mitad de este issue —pasar `multipleArchivo` al `CapturaArchivo` de `SubirChequeoExcel.tsx`, una
línea— se incluye en la Fase 2 de `docs/hato/plan_chequeo_novedades_implementacion.md`, porque vive
en el mismo archivo que esa fase reescribe y porque la promoción de filas manuscritas no entrega
nada si la hoja 3 no puede viajar en el mismo envío que las hojas 1 y 2. `agregarFotos` ya acumula;
el único tapón es que la prop tiene `false` por defecto (mismo hallazgo que ya se cerró en
`PesajeLecheCard.tsx` y `SubirPesajeFoto.tsx` el 2026-08-11).

Este issue SIGUE ABIERTO por su otra mitad: avisar antes de que un commit de la misma fecha
reemplace las N filas del chequeo anterior.
EOF
)"
```

### 8.3 #255 — untouched, but flag the file collision

#255 (`Sexo cría` pre-printing "Hembra/Macho" vs `parseSX`) touches
`exportarPlanillaChequeoPDF.ts`, the same file as Phase 3. No interaction in either direction, but
whoever picks up #255 should rebase onto Phase 3 rather than the other way round — Phase 3 changes
the document's page structure, #255 changes one cell's text.

### 8.4 #259 — correct the root cause on the issue before anyone builds from it

```bash
gh issue comment 259 --body "$(cat <<'EOF'
Corrección del análisis de causa raíz, antes de que alguien implemente lo propuesto (CTO,
2026-09-15).

**La comprobación NO va en el RPC, y el mecanismo ya existe.** `commitChequeo.ts` tiene
`fusionarEventosManualesEnDedupe` —cabecera literal: *"N10 — el nodo que impide que el chequeo
duplique lo que ya se registró a mano"*— escrita justo para este caso después de la limpieza de
julio de 2026 (385 `servicio` y 806 `parto` duplicados). Funde los eventos con
`chequeo_vaca_id IS NULL` en los dos mapas de deduplicación que consume `derivarEventosDeChequeo`.

Falla por **una condición de frontera, en dos sitios**:

1. `hato-chequeo-commit.ts` (ambos árboles): la consulta usa `.lt('fecha', chequeo.fecha)`, así que
   un evento manual del MISMO día nunca se trae.
2. `commitChequeo.ts::fusionarEventosManualesEnDedupe`: `if (evento.fecha >= chequeoNuevoFecha) continue;`
   lo descartaría igual.

MONZA y AMAPOLA se inseminaron el **2026-09-08**, el día de la visita, y el chequeo es del
2026-09-08. `2026-09-08 >= 2026-09-08` → se salta → el commit derivó un segundo `servicio`. El
comentario que justifica el `<` estricto dice *"Un evento manual del mismo día o posterior no es 'lo
ya conocido', es otro hecho"* — falso justo para el día de la visita, que es el día en que el corral
captura por Telegram antes de que la planilla se fotografíe y se comitee (acá, una semana después).

Arreglo: `.lt` → `.lte` y `>=` → `>`, para `servicio` y `parto`. Widenar `parto` no puede perder un
parto real: `agruparPartosPorProximidad` ya se niega a tratar como nacimientos distintos dos
lecturas a menos de `DIAS_MINIMOS_ENTRE_PARTOS = 60` días.

Segunda mitad, para que la supresión no sea silenciosa: hoy `descomponerSX` descarta una fecha de
servicio ya conocida con un `return;` pelado. Eso es tolerable contra chequeos anteriores (CAMILA
#154, ruido en casi toda fila de una ronda) pero no contra una captura manual, que es donde
planilla y Telegram pueden discrepar del toro — MAGNIFICA #103, 2026-09-03, planilla dice
Jericó/inseminación y Telegram dice Jersey/monta. Se agrega una entrada OPCIONAL
`fechasServicioRegistradasAMano` a `InputDescomposicionSX` que **no cambia qué se deduplica**, solo
decide si la supresión deja un `ParseIssue`.

Plan y secuenciación (esto va primero, en PR propia, antes de la promoción de filas manuscritas):
`docs/hato/plan_chequeo_novedades_implementacion.md` §3.
EOF
)"
```

---

## 9. Testing standards

Unit tests are owned by the implementing engineer and written **before** the code. Integration and
e2e belong to QA. Minimum bar per layer, and the specific cases that must exist:

| Layer | File | Must cover |
|---|---|---|
| Pure — OCR | `src/__tests__/importHatoOcrChequeo.test.ts` | the promotable set is exactly the three motives, and each terminal motive yields `promovible === false` (§4.3); the three-condition predicate, each condition failing on its own; a promoted row lands in the matrix with `#` empty and `Nombre` = `nombreImpreso`; `filaExcel` renumbering is correct across confirmed **and** promoted rows; two photos of the same slack row → identical dedupes to one, divergent rejects both; a fully blank slack row never becomes a promoted row; `ENCABEZADO_POR_COLUMNA_OCR` still equals `ENCABEZADOS_PLANILLA_CHEQUEO` (existing case, must stay green after Phase 3) |
| Pure — parity | `src/__tests__/importHatoParidadServidor.test.ts` | runs the generator in `--check`. **Expected red until the copies are regenerated.** Never silence it by editing a copy |
| Pure — commit | `src/__tests__/importHatoCommitChequeo.test.ts` | a manual `servicio` dated **the same day** as the chequeo suppresses the derived one; one dated the day before still does; one dated after is inert; same three for `parto`; the suppression issue fires only when the date came from a manual event, not from a previous chequeo |
| Pure — engine | `src/__tests__/calculosHato.test.ts` + `calculosHatoParidad.test.ts` | `fechasServicioRegistradasAMano` absent ⇒ behaviour byte-identical to today; the three copies stay equal |
| Pure — reactivation | **new** `src/__tests__/hatoReactivacionAnimal.test.ts` | `construirNotaReactivacion` appends and never replaces; `null` notas; the date is the injected one (no `new Date()` inside); `detectarColisionCaravana` finds an active holder and excludes the animal itself |
| Pure — paper | `src/__tests__/exportarPlanillaChequeoPDF.test.ts` | the slack sheet is the **last** page; `total === páginasRoster + 1`; with the 35-row fixture `total === 3`; the slack table has 10 body rows × 13 columns; its header row is present; **all 13 of its columns are white with the thick border** |
| Pure — paper | `src/__tests__/exportarPlanillaChequeo.test.ts` | the AOA gains exactly 10 trailing all-null rows; the header still appears **exactly once** |
| Round-trip | `src/__tests__/exportarPlanillaChequeoRoundTrip.test.ts` | writing and re-reading the workbook yields the **same** parsed row count as before; the 10 blank rows come back as `descartesPorMotivo.fantasma`; filling one makes it parse as a normal row |
| Static guard | `src/__tests__/dialogScrollContract.test.ts` | `ReactivarAnimalDialog` uses `DialogBody` (automatic — the guard sweeps the codebase) |
| Manual, per PR | — | `diff -q` on the three hand-synced edge-function pairs (§2) |

**QA, end-to-end, after Phase 2 (owned by `qa`, not by the implementer):** re-submit the four
2026-09-09 photos from Storage against a non-production chequeo date, with the slack sheet added,
and verify (a) the 9 handwritten rows come back promoted, (b) #177/#178 come back as
`numero_animal_inactivo` with COMINA/MOTONETA as candidates, (c) approving them writes exactly one
`servicio` each and **zero** duplicates against the events migration 153 already created, and
(d) `hato_capturas_foto` closes `ok` with `celdas_confirmadas` matching what was approved.

Item (c) is the acceptance test that Phase 0 and Phase 1 were sequenced apart to keep unambiguous.

---

## 10. Documentation to update in the same work

Both are false the moment Phase 2 merges, and a stale doc that promises something the code no
longer does is worse than no doc.

1. **`docs/hato/brief_chequeo_novedades.md` §4, "What this recommendation does NOT solve".** The
   bullet *"It does not reactivate discarded animals… it will **not** offer 'reactivate this
   discarded animal' — that is an inventory decision, not a chequeo decision"* was **reversed by
   Santiago on 2026-09-15**. Replace it with the reversal, its reason (*"if a cow is sold between
   chequeos and not reported via telegram, this is our gate"*), and a pointer to §4.6 of this plan.
   Do not delete the original sentence silently — the brief is the record of a decision that
   changed.
2. **`docs/hato/brief_chequeo_novedades.md` §5** — the #254 row should say "closed as re-scoped",
   not "do not close".
3. **`src/components/hato/CLAUDE.md`** — one new paragraph in the chequeo-por-foto area covering:
   the three promotable motives and the two that are terminal **and why**; the promotability
   predicate and why the written name is load-bearing (`esFilaVacia`); that `validarAnclaFila` is
   frozen and the new motive is decided outside it; that reactivation is a browser-session write
   **because migration 084 does not trace `service_role`**; the 3-sheet planilla with its 10 slack
   rows; and the corrected #259 boundary. Keep it to the facts a future session would otherwise
   have to rediscover — that file is already large and every session pays to load it.

---

## 11. Work orders

Hand these verbatim. Each item names its files; mirrored files are marked.

### 11.A Backend build

**PR 1 — #259 (do this one first, alone)**

1. `src/utils/calculosHato.ts` — add the optional `fechasServicioRegistradasAMano` to
   `InputDescomposicionSX`; in `descomponerSX`, when a service date is suppressed **and** it is in
   that set, push an explicit `ParseIssue` naming the date, the bull and the tipo de servicio the
   planilla carried. Default empty ⇒ today's behaviour unchanged.
2. Run `python3 docs/hato/regenerar-copias-servidor.py`. **Never hand-edit `calculos-hato.ts`.**
3. `src/utils/importHato/commitChequeo.ts` — in `fusionarEventosManualesEnDedupe`, change
   `if (evento.fecha >= chequeoNuevoFecha) continue;` to `>`; rewrite the comment to state that the
   visit day is inside the window and why.
4. Run `python3 docs/hato/regenerar-copias-importhato.py`.
5. `src/supabase/functions/server/hato-chequeo-commit.ts` **and**
   `supabase/functions/make-server-1ccce916/hato-chequeo-commit.ts` — `.lt('fecha', chequeo.fecha)`
   → `.lte(...)`; build and pass `fechasServicioRegistradasAMano` from the same `eventosManuales`
   query (no extra query).
6. Tests per §9 rows 3 and 4.
7. `diff -q` the three hand-synced pairs. `npm test`, `npm run lint`, `tsc --noEmit`.
8. Deploy: `npx supabase functions deploy make-server-1ccce916` — this PR changes edge-function
   behaviour and is inert until deployed.

**PR 2 — promotion, backend**

1. `src/utils/importHato/ocrChequeo.ts` — everything in §5.1: the new motive, `MotivoNoPromovible`,
   `AnimalFueraDelRoster`, `FilaOcrPromovida`, `PREFIJO_ISSUE_FILA_PROMOVIDA`,
   `construirIndiceFueraDelRoster`, `esFilaOcrEnBlanco`, `clasificarPromocion`, the
   `procesarLecturaOcr` changes, the promoted-row dedupe, the `filaExcel` renumbering across both
   sets, and the three prompt edits. **`validarAnclaFila` must come out of this PR unchanged — diff
   it and confirm.**
2. Run `python3 docs/hato/regenerar-copias-importhato.py`.
3. `src/supabase/functions/server/hato-chequeo-foto.ts` **and**
   `supabase/functions/make-server-1ccce916/hato-chequeo-foto.ts` — §5.2: build the index from the
   rows `categorizarAnimal` rejects (no new query — the view already returns every animal), pass it
   in, merge the provenance issue by `filaExcel`, extend the response, and count promoted rows in
   both `celdasLeidasOcr` and the `ocr_fallo` guard.
4. Tests per §9 rows 1 and 2.
5. `diff -q`, `npm test`, `npm run lint`, `tsc --noEmit`, deploy.

### 11.B Frontend build

**PR 3 — review window** *(depends on PR 2 being deployed; the response fields must exist)*

1. `src/utils/hato/reactivacionAnimal.ts` — new, pure: `construirNotaReactivacion`,
   `detectarColisionCaravana` (§6.2). Tests first.
2. `src/components/hato/hooks/useReactivarHatoAnimal.ts` — new, narrow write (§6.3).
3. `src/components/hato/components/ReactivarAnimalDialog.tsx` — new (§6.4). `Dialog` +
   `DialogContent size="sm"` + `DialogBody`; role gate with a skeleton while `isLoading`.
4. `src/components/hato/hooks/useSubirChequeoExcel.ts` — extend `ReporteOcrChequeo` (§6.6).
5. `src/components/hato/components/ChequeoDiffReview.tsx` — the «escrita a mano» chip, the amber
   inactive-animal panel with its two buttons, the `sugerenciaActiva` one-click fill (§6.5).
6. `src/components/hato/components/SubirChequeoExcel.tsx` — the «Filas escritas a mano» block, the
   `motivoNoPromovible` text, the corrected summary line, **and the `multipleArchivo` prop**
   (§6.1 / §8.2).
7. Tests per §9 rows 5 and 8. Verify on a mobile viewport (sidebar collapsed) before calling it
   done.

**PR 4 — paper** *(independent of PRs 1–3; can run in parallel)*

1. `src/utils/hato/exportarPlanillaChequeoPDF.ts` — §7.1.
2. `src/utils/hato/exportarPlanillaChequeo.ts` — §7.2.
3. `src/components/hato/ChequeosList.tsx` — only if the subtitle needs to mention the slack sheet;
   the call sites otherwise do not change.
4. Tests per §9 rows 6 and 7.

**PR 5 — docs** *(can ride with PR 3)*

`docs/hato/brief_chequeo_novedades.md` §4 and §5,
`src/components/hato/CLAUDE.md` — per §10.

---

## 12. Key technical risks

| Risk | Mitigation |
|---|---|
| The model reports the 10 blank slack rows and floods the review with junk | Two layers: the prompt tells it not to return fully-blank rows, and §4.4's predicate drops them server-side. A prompt alone is not a guarantee |
| A promoted row is silently dropped by `esFilaVacia` after low-confidence blanking | The written-name condition (§4.4 (2)) guarantees a non-empty `Nombre`, which `esFilaVacia` counts. Pinned by a test |
| Someone later adds a motive to the promotable set and opens the row-drift door | §4.3's test asserts the promotable set exhaustively; adding a motive without touching the test turns it red |
| The reactivation writes from the endpoint and leaves no trace | §4.7. Stated in the module contract so a future session does not "simplify" it into the commit payload |
| A reactivation collides with an active caravana and fails with a raw Postgres error | Client-side pre-check **and** `23505` translation, both. Never a provisional 900-range fallback |
| Mirrored copies drift | `importHatoParidadServidor.test.ts` (`--check`) for the generated set; `diff -q` in the PR checklist for the three hand-synced pairs |
| A hardcoded page count breaks the day the herd grows | §7.1: the invariant is computed (`roster + 1`), and the literal 3 lives only in a fixture-bound assertion |
| Phase 1 ships and nothing changes for Martha because page 3 cannot be uploaded with pages 1–2 | The `multipleArchivo` line is inside PR 3, not left to #253 |
