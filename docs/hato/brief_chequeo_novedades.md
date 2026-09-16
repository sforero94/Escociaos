# Brief — Novelties in a chequeo: what the planilla could not anticipate

**Written** 2026-09-15 · **Author** CPO · **Origin** `docs/hato/diagnostico-chequeo-2026-09-08.md`
**Companion issues** #253, #254, #255 (mechanical fixes for three symptoms of this same round)

---

## 1. The problem

The printed planilla lists a **snapshot of a category** — `hato_ordeno` + `horro`, 35 adult cows
(decision D-A, 2026-07-29). The vet's round is an **event over whatever is in the corral**, and on
2026-09-08 that included **9 novillas in first service** that the sheet never listed. Martha did the
right thing: she wrote all 9 by hand at the foot of page 2. The system had nowhere to put them —
the OCR roster cannot anchor a row it did not print, so the rows die in `filasNoLeidas`, shown
read-only and never committable.

What that cost, measured: **8 of the 9 rows ended wrong in the system.** Six got service dates
**4–8 months early** (MM/DD typed into a DD/MM Telegram parser); two named animals an inventory
cleanup had discarded on 2026-08-11 and could not be registered at all. The page-2 treatment notes
went in as **12 free-text "treatments", 5 of them defective** (2 duplicates, 1 on the wrong cow,
2 junk). And page 2 itself — all 16 printed cows — **was never committed**: 4 previews on 2026-09-09,
0 commits.

The general shape, not the novilla instance: **the sheet's roster is frozen at print time and the
round is not.** Novillas are this round's novelty; the next one is a bought-in cow, a re-tagged
chapeta, a dry cow checked out of turn. Every time, the paper captures it correctly and the digital
boundary loses it into a side channel that corrupts it.

---

## 2. The one structural fact that decides the options

Verified against the code, not assumed:

- **The commit does not use the printed roster.** `hato-chequeo-commit.ts` resolves rows against
  `hato_animales` by `numero`, with **no etapa filter**. The roster (`hato_ordeno`/`horro`) governs
  only two things: what the **PDF prints**, and what the **OCR is allowed to anchor**.
- **The correction window already edits identity.** `numero` is a correctable field
  (`hatoCorreccionChequeo.ts`), and `useRevisionChequeo.ts` already loads **every `estado='activa'`
  animal** into the client and re-diffs live on each keystroke.
- **The block is one hop wide.** An unanchored row's cells are read, then discarded at
  `procesarLecturaOcr` and rendered as a read-only list (`SubirChequeoExcel.tsx:361`).
- **The module already built this exact affordance once.** The pesaje photo flow turned its
  equivalent read-only "no se pudieron identificar" list into an action ("Agregar vaca",
  2026-08-11, `revisionPesaje.ts`) — same problem, same shape, already solved next door.

So the fix is not schema, not the RPC, and not a second capture channel. It is: **stop treating
"the anchor rejected this row" as terminal.**

---

## 3. Options

| # | Option | Build cost | Assumes about Martha | Generalizes past novillas? |
|---|---|---|---|---|
| **A** | Unanchored-but-legible rows are **promoted into the editable review queue** — a human assigns identity, the existing diff/commit takes it from there | **Low–medium.** Pure logic in `ocrChequeo.ts` (×3 mirrors) + the foto handler response + surfacing `filasNoLeidas` as editable rows. Reuses the correction window, the client-side re-diff, `CrearAnimalDialog` and the commit as-is | Only that she writes the animal's number **and** name somewhere on the sheet — which she already does | **Yes.** It does not care *why* the row was unanchored |
| **B** | **Print K blank slack rows** at the end, with a printed slot id and a printed instruction | **Low.** PDF layout + prompt + accepting a 3rd sheet (35 rows = exactly 2 pages today; ~4 free slots remain on page 2) | That a ruled box with a printed instruction beats free handwriting in the margin — very likely true, and it is where the process fix lives | **Yes**, but only up to K rows; beyond K it degrades to the margin again |
| **C** | **Put novillas on the planilla** (widen the roster) — this is #254 | Low, mechanical | Nothing new | **No.** Fixes novillas; the next uncovered category is one round away. Costs ~42 mostly-blank rows → ~4 pages, and revives the homónimas problem the pesaje roster hit (two active MOCAs) |
| **D** | **Auto-enroll novillas "due for first service"** into the roster | Low | — | **No, and it is refuted by evidence.** The pesaje roster tried exactly this filter on 2026-08-11 and printed **zero** novillas: no novilla has a `servicio` event, because registering that first service is what this flow is supposed to do. Circular by construction |
| **E** | **Process only** — a convention ("note any animal not on this sheet here") with no software change | Zero | — | **No.** The paper process already worked this round. The loss happened at the digital boundary, downstream of it |
| **F** | **Telegram as the novelty channel** (status quo) | Zero | — | **Measured failure.** 6 of 6 novilla dates wrong, 2 unregisterable, 5 of 12 note transcriptions defective |

### How each interacts with the module's no-guessing discipline

- **A preserves it exactly, with one hard scoping rule.** Promote **only** rows rejected as
  `numero_fuera_del_roster` or `numero_ilegible` — "this row claims an identity the sheet never
  printed", i.e. a novelty. **Never** promote `nombre_no_corresponde` or `chapeta_ambigua_en_roster`:
  those are the literal signature of row drift (a number the sheet *did* print, sitting next to the
  wrong name), and they must stay terminal. Promoted rows enter with `numero = null`, which already
  classifies them `no_reconocido` with an explicit motive; a human — never a fuzzy name match —
  supplies the identity, the raw layer is untouched, and the existing `CORRECCIÓN MANUAL` issue
  stamps the decision. Nothing is auto-adjudicated at any point.
- **B strengthens it**: a printed slot id gives the model a positional anchor it does not have for a
  scribble in the margin, and it removes the model's judgement call about whether out-of-table
  handwriting is even a row.
- **C and D weaken nothing but solve the wrong problem** — they try to predict the novelty instead of
  handling it.
- **E and F bypass the pipeline entirely.** That is what produced 5 defective rows out of 12 this
  round.

---

## 4. Recommendation

> **Status 2026-09-15 — accepted, with two changes from what is written below.**
> (a) **Phase 0 no longer gates anything.** It said *"do not build before this look"*. Santiago
> ordered both phases regardless of what the recapture shows, so the measurement is now a
> confirmation to record, not a decision point. (b) **Phase 2 is unconditional and K = 10**, on an
> always-present extra sheet with its own repeated header — so the planilla's default page count
> becomes 3, and Phase 2 is no longer "an ergonomic nicety" contingent on the Phase 0 answer.
> Build plan: [`plan_chequeo_novedades_implementacion.md`](./plan_chequeo_novedades_implementacion.md).

**Phase 0 — measure, for free, on work already scheduled.** The correction plan (§5.C of the
diagnosis) already re-submits the 4 photos from Storage. When it runs, record **what the model
returned for the 9 handwritten rows**: reported with a garbage anchor, or silently omitted? We do
not know today — `hato_capturas_foto` is empty, but only because no photo upload has happened since
the tracking went live: the edge function bundle was redeployed 2026-09-14 (confirmed against the
live function, version 253, `updated_at` 2026-09-14T02:13Z — one day after #236 merged, and it
already includes the tracking code), so the recapture in §5.C **will** leave a row this time. The
2026-09-09 previews predate that deploy and left no server-side trace, which is why they are silent
today. This costs one extra look at the preview response once Santiago runs the recapture, and it
decides the sequencing below. **Do not build before this look.**

**Phase 1 — Option A. Promotion of unanchored rows.** Ship this regardless of the Phase 0 answer;
it is the piece that makes any novelty representable. Scope, verbatim:
- Promote only `numero_fuera_del_roster` / `numero_ilegible`. Everything else stays terminal.
- A promoted row arrives with its read cells, `numero = null`, and an explicit label ("fila escrita a
  mano, sin identificar").
- The human assigns identity by editing the caravana in the window that already exists. If the animal
  has no ficha, `CrearAnimalDialog` is already wired there.
- The commit path does not change.

**Phase 2 — Option B. Slack rows on the paper.** Print K blank rows plus the instruction. If Phase 0
shows the model omits margin handwriting, **Phase 2 becomes a prerequisite, not an ergonomic
nicety** — say so out loud when the measurement lands.

**Why this order.** Phase 1 without Phase 2 still captures whatever the model reports (this round's
sheet would have worked, if the model saw the rows). Phase 2 without Phase 1 is useless — the rows
would be read and still not committable. Neither is a cliff: with both shipped, a round with 15
novelties puts 10 in slots and 5 in the margin, and Phase 1 handles all 15 identically.

### What this recommendation does NOT solve

- **It does not make page 2 arrive.** A novelty row lives at the foot of the last page; if both pages
  do not enter in one submission, it is lost anyway. **#253 is a hard prerequisite, sequence it
  first.** Shipping Phase 1 before #253 delivers zero user-visible value.
- ~~**It does not decide whether novillas belong on the printed sheet.**~~ **Decided on 2026-09-15
  (question 3): they do not.** *"It may happen, neither routine nor exceptional."* The printed and
  OCR rosters are **not** widened — not to novillas, not to any other category. Slack rows plus row
  promotion is the standing answer for every animal the sheet did not anticipate. #254 is closed as
  re-scoped, not left open as a print-economics question.
- ~~**It does not reactivate discarded animals.** Two of the 9 rows named animals marked `descartada`
  on 2026-08-11. The review window will let a human assign identity or create a ficha; it will
  **not** offer "reactivate this discarded animal" — that is an inventory decision, not a chequeo
  decision (this is D6 of the diagnosis).~~
  **Reversed on 2026-09-15 (question 4). The review window DOES reactivate.** Santiago's words:
  *"if a cow is sold between chequeos and not reported via telegram, this is our gate."* The chequeo
  capture flow becomes the deliberate backstop for an unreported sale, death or discard between
  visits — it is the one moment when somebody looks at every animal. A row whose written number
  resolves to a `descartada`/`vendida` animal gets its own rejection motive
  (`numero_animal_inactivo`), is surfaced **distinctly** — never silently rejected, never silently
  accepted — and a person resolves it explicitly: either the animal is back (reactivated from the
  review, writing `estado`/`fecha_estado`/`notas` and nothing else, with the venta/muerte event left
  intact) or the number was misread and the row is reassigned. The two sentences above are struck
  rather than deleted because this brief is the record of decisions, including the ones that
  changed. Full design: `docs/hato/plan_chequeo_novedades_implementacion.md` §4.6.
- **It does not improve handwriting accuracy.** A novelty row is 100% handwritten, identity included.
  That is precisely why identity is assigned by a person and never by the model.
- **It does not touch Telegram date parsing** (P3/D4), the SX pre-print noise (P7), the treatment
  table hygiene (P6), or the 2026-08-11 cleanup review (D6).

---

## 5. Relation to the filed issues

| Issue | Relation |
|---|---|
| **#253** (P1 — both pages in one submission; same-date commit replaces) | **Prerequisite.** Not subsumed, not duplicated. Phase 1 is worthless until a full sheet can be submitted |
| **#254** (P2 — novillas absent from the OCR roster) | ~~Partially subsumed, re-scope it to "should novillas be printed routinely?"~~ → **CLOSED as re-scoped (2026-09-15).** Question 3 answered it: the roster is not widened, for novillas or anything else. Its own "Listo cuando" opened with *"hay una decisión escrita"*; that decision now exists and is **no**, which makes its remaining items moot. Closed with a comment carrying the decision forward, not as "fixed" |
| **#255** (P7 — the `Sexo cría` pre-print vs `parseSX`) | **Orthogonal.** No interaction in either direction |

*(Issue numbers mapped from the D-table of the diagnosis; #254 is confirmed as the roster gap. If
#253/#255 are the other way round, the relations follow the described content, not the number.)*

---

## 6. User stories

**Goal — capture an animal the sheet did not anticipate**
- **Must** · As Martha, I want to write an animal that is not on the planilla and have the system
  offer it to me for identification when I upload the photo, so that the round's real findings do not
  have to be retyped into another channel.
- **Must** · As Martha, I want to tell the system which animal a handwritten row is, choosing from
  the herd, so that the system never guesses an identity from my handwriting.
- **Should** · As Martha, I want the planilla to arrive with blank rows and a printed instruction for
  this exact case, so that I write in a ruled box instead of the margin.
- **Could** · As Martha, I want to create the ficha of an animal that has none, without leaving the
  review, so that a brand-new animal is not a dead end. *(Already built — carried here only because
  the promoted rows must reach it.)*

**Goal — never lose a round to a silent discard**
- **Must** · As Santiago, I want a row that the system could not identify to be visible and
  actionable, not merely listed, so that "the system did not understand it" and "the data was
  thrown away" stop being the same outcome.
- **Should** · As Santiago, I want to know whether a photo upload ended in a commit, so that a lost
  planilla is visible the same week. *(Migration 146 already does this; it needs the deploy.)*

**Goal — protect what already works**
- **Must** · As Santiago, I want a row whose printed number and printed name disagree to keep being
  rejected outright, so that promoting novelties never opens the row-drift door.

---

## 7. Questions for Santiago

> **ALL FOUR ANSWERED, 2026-09-15. Do not re-open them.** Answers, in order: (1) **10 rows, third
> sheet accepted** — and the third sheet is unconditional, not "only if needed". (2) **The full
> 13-column row**, and the slack sheet repeats the column header at its own top. (3) *"It may
> happen, neither routine nor exceptional"* → **the roster is not widened**; slack rows plus row
> promotion is the standing answer for any animal the sheet did not anticipate, novillas included;
> #254 is closed as re-scoped. (4) **Yes** — *"if a cow is sold between chequeos and not reported
> via telegram, this is our gate"*; this reverses the third bullet of §4's "does NOT solve" list.
> The questions are kept below as the record of what was asked.

1. **How many slack rows, and is a third sheet acceptable?** 35 rows are exactly 2 pages today with
   ~4 free slots on page 2. Ten slack rows push the planilla to 3 sheets. My recommendation: **10
   rows and accept the third sheet** — Martha leaves a packet of planillas at a farm with no internet
   and no way to reprint; a spare row is a blank box, a missing row has no fix until the next round
   (the pesaje module's own reasoning). Confirm or cap it at 4 and keep 2 pages.
2. **What does a slack row ask for?** The full 13 columns, or a reduced set (chapeta + name + service
   date + bull + treatment)? This is a corral-ergonomics call about what Martha will actually write
   standing up. My default: **the full row**, so the paper stays uniform and the OCR reads one grid.
3. **Are first-service novillas part of the routine round, or was September exceptional?** If routine,
   #254 (print them) is worth doing on top of this brief. If exceptional, the slack rows are the
   right and cheaper answer, and #254 should be closed as re-scoped.
4. **Should a handwritten row be allowed to name a `descartada`/`vendida` animal?** Two of the nine
   did. Today the answer is no and it needs a manual step outside the chequeo. Reactivating an animal
   from a chequeo review is an inventory decision with real consequences — your call whether it
   belongs in this flow at all.
