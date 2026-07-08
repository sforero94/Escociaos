# Diseño — Priorización de Monitoreo (Scout Prioritization)

**Status:** proposed · **Owner-decision gate:** approval required before any implementation ·
**Executor:** Claude Code goal loop (Fable 5 orchestrator + Sonnet 5 workers) · **Touches
production:** YES — real DB migration + real UI, gated behind explicit owner approval of this doc

> Written for autonomous Claude Code agents, contract-driven like `docs/POC_PREDICCION_PLAGAS.md`:
> every stage has an explicit input/output artifact and acceptance check. Unlike the POC, this is
> a real feature request, not an isolated analysis — so it also follows every rule in the root
> `CLAUDE.md` (migrations, RLS, dialog sizing, number formatting, mobile layout, etc.). **Do not
> start S0 until the owner has approved this document.**

---

## 0. One-paragraph purpose

Turn the pest-forecast POC's actual finding — *persistence (today's reading) and seasonal
climatology carry real signal; weather does not, at this granularity* — into a real feature:
a **ranked weekly "scout this first" list per lote/sublote × pest**, so the agronomist and
monitoring team know where to send people before the next monitoring round, not just where things
already went wrong last round (which is what today's `insightsAutomaticos.ts` alert feed already
does, retrospectively). This is a transparent, rule-based ranking — **not** a machine-learning
model. The POC already tested the ML route at this granularity and it did not beat the simple
signals; building another model here would repeat a result we already have.

## 1. The decision this serves

**Primary:** scout prioritization — a ranked list telling the monitoring team which lote/sublote ×
pest combinations most deserve a visit in the coming week, and why (rising trend, entering
historical high season, currently elevated, etc.).

**Explicitly not the target for this iteration:** spray/treatment timing (would need validated
economic action thresholds, which section 3 explains we don't reliably have) and pure dashboard
awareness (too passive — the point is to change where the monitoring team physically goes next).

## 2. What the POC established, and how it constrains this design

From `docs/POC_PREDICCION_PLAGAS.md` and its final `reports/go-no-go.md` (NO-GO on ML at 2-4wk
horizon, lote-level, weather-driven):

- **The autoregressive/current-state feature (today's incidence + tier) was the single strongest
  predictor in all 4 independently-built models.** This justifies leading the ranking with
  persistence, not de-emphasizing it in favor of a fancier signal.
- **Seasonal climatology was competitive or the best baseline** for monalonion and thrips —
  pest-specific "is this the historical high season" context is worth computing and surfacing.
- **Weather features added comparatively little even with clean station data.** This design does
  not attempt to wire in live weather at all — not because it's unavailable (the station feed is
  live and complete going forward), but because the POC specifically tested whether it helps
  prediction at this granularity and found it mostly doesn't. Revisit only if a future POC with
  more years of data reverses that finding.
- **Trend as its own explicit signal was not modeled in the POC** (only raw trailing autoregressive
  value) but is cheap, already partially implemented (`calcularTendencia` in
  `src/utils/calculosMonitoreo.ts`), and interpretable — a natural addition here.
- **Intervention/spray-recency data is now complete** (see `docs/POC_PREDICCION_PLAGAS.md`'s
  companion fix: the 2025 Excel export closed a 6-month spray-log gap) — usable as *context*
  ("last sprayed N days ago"), not necessarily as a ranking driver, since the POC never found it
  to be a strong direct predictor either.

### Agronomic thresholds — superseded by an owner-provided industry table

An initial research pass (web search, this session) tried to find Colombia-specific economic
thresholds for the 3 pests with the strongest **persistence** signal in the POC and came back weak:
count-based (traps/leaf, not % incidence), inconsistent across sources, and in 2 of 3 cases not
Colombia-specific at all. That research is preserved in git history but is **no longer the basis
for this design** — the owner has since provided a real **umbral económico** table, sourced from
**Cartama** (recorded here for citation — use this name, not "a market leader," in the migration's
`source_label` and anywhere else this is referenced), in **the same unit this farm already
records** (% incidencia):

| Plaga (owner's table) | Umbral económico | Resolved to catalog pest(s) | Pooling |
|---|---|---|---|
| Thrips | 1% | `Thrips` | independent |
| Ácaro | 33% | `Ácaro` + `Ácaro Cristalino` + `Huevos de acaro` + `H-acaro  Cristalino` | **pooled — MAX reading across all 4 that round** (owner confirmed: broad mite-complex scope, same 4 entries the POC pooled as "acaros") |
| Monalonion | 26% | `Monalonion` | independent |
| Marceño | 36% | `Cucarron marceño` | independent |
| Phytophthora | 10% | `Phytophtora` (catalog spelling lacks the 2nd "h" — same pest, name-normalize, don't exact-match) | independent |
| Antracnosis | 10% | `Antracnosis fruto` **and** `Antracnosis ramas` | **NOT pooled — owner confirmed both, independently**: two separate Tier A lines, each gated at 10% on its own reading |

This resolves to **7 independently-ranked Tier A lines** (Thrips, Ácaro-complex, Monalonion,
Marceño, Phytophtora, Antracnosis fruto, Antracnosis ramas), mapping to **9 real catalog pest
ids** (the Ácaro line alone covers 4). `pest_umbral_economico` (P0b) needs a `grupo_key` column so
the 4 Ácaro-complex rows share one virtual ranking line while everything else is one-row-per-line —
see P0b's revised acceptance check.

**This changes the design materially — these 7 lines are now the PRIMARY tier/action signal**, not
a reference annotation. Crossing the threshold is the strongest single ranking driver; trend and
seasonality (§6) become modifiers on top of it, not substitutes for it. The old data-driven tertile
method (`clasificarGravedad` / POC-style per-pest tertiles) becomes the **fallback** for any catalog
pest *outside* these 9 ids (e.g. mosca del ovario, Colletotrichum, Cladosporium — pests the POC
tracked but that have no owner-provided economic threshold).

**Two assumptions still open (not blocking — reasonable defaults chosen, revisit if Cartama's
methodology turns out to differ):**

1. **Unit match** — assumed Cartama's "% incidencia" means the same thing as this farm's
   `incidencia_pct` (% of monitored trees/leaves affected in a round). Flag for review if Cartama's
   own protocol differs (e.g. % of leaves per affected tree rather than % of trees affected).
2. **Comparison basis** — assumed to be the single latest monitoring round's `incidencia`, not a
   rolling average, matching how `clasificarGravedad`'s fixed cutoffs are already used elsewhere in
   the app.

## 3. Scope & non-goals

**In scope:**
- Sublote-level ranking (finer than the POC's lote-only scope — the POC's lote-only decision was
  specific to that ML analysis; this app's live `monitoreos` table is already sublote-level and a
  scout is dispatched to a specific sublote, so there's no reason to throw that resolution away
  here).
- Per-individual-pest ranking (not the POC's biology-pooled `pest_group`s — pooling was a
  statistical-power device for a data-hungry ML tournament; a rule-based ranking has no such need
  and the agronomist already thinks in terms of individual catalog pests). This also happens to be
  exactly what's needed to use the owner's threshold table directly: Phytophthora and Antracnosis
  each get their own threshold, where the POC had pooled Antracnosis into a multi-pest "fungoso"
  group — no structural conflict, since this design was already going to unpool.
- **Two-tier pest coverage**, driven directly by which pests have an owner-provided economic
  threshold (§2):
  - **Tier A — threshold-driven (primary path):** the 7 lines resolved in §2 (Thrips, Ácaro-complex
    [pooled, max of 4 catalog entries], Monalonion, Marceño, Phytophtora, Antracnosis fruto,
    Antracnosis ramas). Ranking leads with "crossed the economic threshold," modified by
    trend/seasonality.
  - **Tier B — statistical-tier fallback:** every other catalogued pest (mosca del ovario,
    Colletotrichum, Cladosporium, etc.) — ranked via the existing `clasificarGravedad` fixed cuts
    or POC-style tertiles, exactly as originally designed in the pre-threshold-table version of
    this doc. Still useful (mosca del ovario had real persistence signal in the POC), just weaker
    footing without a validated economic number.
- A one-time import of the POC's already-verified `monitoreo_lote.parquet` (2023-2026,
  lote-level) into a lightweight **seasonal reference table** — not into the live `monitoreos`
  operational table (different grain: lote-only vs sublote-level, would corrupt assumptions other
  queries make about `sublote_id`). This buys 4 years of seasonal-calendar signal instead of the
  ~1.5 years currently in `monitoreos`, reusing harmonization work that has already been
  independently verified twice (S1 builder+verifier pairs).
- New UI surface: a ranked view (new component under `src/components/monitoreo/`) plus optional
  top-N entries surfaced in `AlertList` ("Pulso de Gestión").

**Non-goals:**
- No weather integration (see §2).
- No ML model (see §0, §2).
- No automatic spray/treatment triggering — this ranks where to *look*, not what to *do*; the
  agronomist stays in the loop for any action decision, even for Tier A pests with a real economic
  threshold — the tool flags "over threshold," it does not prescribe or auto-trigger a spray.
- No change to the existing `insightsAutomaticos.ts` alert feed's *retrospective* behavior — this
  is an additive, *prospective* ranking, not a replacement. (Whether to eventually consolidate them
  is a follow-up decision, not part of this build.)

## 4. Data inputs

| Source | Content | Use |
|---|---|---|
| DB `monitoreos` (2025→) | sublote-level incidence, live | current reading, recent trend (last 2-4 rounds) |
| DB `lotes`, `sublotes` | hierarchy, active status | scoping which lotes/sublotes are live |
| DB `plagas_enfermedades_catalogo` | canonical pest names/types | display, one row per real pest (not pooled) |
| DB `movimientos_diarios` / `aplicaciones_lotes` | spray execution dates per lote | "days since last spray" context |
| **New:** `analysis/pest-forecast-poc/data/processed/monitoreo_lote.parquet` (POC-frozen, verified) | 2023-2026 lote-level incidence, already harmonized/normalized | one-time seed for the seasonal reference table (§6) — reuses verified work, not re-derived |
| **New:** owner-provided umbral económico table (§2) | 6 pests, % incidencia threshold | **primary Tier A scoring input** — seeded as a small static config/table, not derived from data |

## 5. Where this lives in the app

- **New utility** `src/utils/priorizacionMonitoreo.ts` — the ranking engine (§6). Pure functions,
  unit-testable like `calculosMonitoreo.ts`/`insightsAutomaticos.ts`, which it imports from and
  extends (reuse `calcularTendencia`, `formatearCambio`; do not reimplement).
- **New component** `src/components/monitoreo/PriorizacionScouting.tsx` — the ranked list view,
  following the `InsightCard`/`VistaRapidaCard` visual patterns already established. Added as a new
  tab/section in `DashboardMonitoreoV3.tsx` (the current, live dashboard — not the stale
  `MonitoreoDashboard.tsx` referenced by the old `PLAN_REFINAMIENTO_MONITOREO.md`).
- **Optional, follow-up decision (not in this build):** surface the top 1-2 entries in
  `AlertList.tsx`'s "Pulso de Gestión" cross-module feed once the standalone view has been used for
  a few weeks and is trusted.
- **New migration** `src/sql/migrations/047_create_pest_seasonal_profile.sql` (or next free number —
  check `src/sql/migrations/` for the actual next sequential number before writing it) — creates
  the seasonal reference table and seeds it from the POC parquet (§6).

## 6. Ranking logic (transparent, rule-based — no black box)

For each (sublote, pest) with at least 2 historical rounds, branch by tier (§3):

**Tier A — the 7 resolved lines from §2 (Thrips, Ácaro-complex, Monalonion, Marceño, Phytophtora,
Antracnosis fruto, Antracnosis ramas) — threshold-led:**

1. **Threshold status (primary driver)** — latest `incidencia` reading vs. Cartama's umbral
   económico (§2 table). For the Ácaro-complex line specifically: take the **max** `incidencia`
   among the 4 pooled catalog pests observed that round before comparing to 33% (not each entry
   compared separately — that would produce 4 partial signals instead of 1 clear one). For
   Antracnosis fruto/ramas: compare each independently to its own 10% — these are 2 separate
   ranking lines, not pooled. Three states, not just binary: *over threshold* (strongest signal),
   *approaching* (e.g. within some margin below it — the builder should pick a sensible margin,
   such as 80% of the threshold, and justify it in the report), *under*. This replaces
   `clasificarGravedad`'s fixed 10%/30% cuts for these 7 lines specifically — don't run both and
   pick whichever looks better; the economic threshold is the more meaningful number where we have
   it, full stop.
2. **Trend** — `calcularTendencia` over the last 3-4 rounds (already implemented, reused as-is).
   Rising + approaching/over threshold is the clearest "go scout this" signal; rising + well-under
   threshold is a weaker but still worth-surfacing secondary signal.
3. **Seasonal context** — from the new `pest_seasonal_profile` table (built for all catalogued
   pests, not just Tier A — see P0): is the current ISO week-of-year within this pest's historical
   top-tertile window? Modifier only here, since threshold status already carries the primary
   signal for Tier A.
4. **Spray recency (context only, not scored)** — days since last spray at that lote, shown
   alongside the ranking entry so the agronomist can immediately tell "this is elevated 3 days
   after treatment" vs "this is elevated with no recent intervention."

**Tier B pests (everything else — mosca del ovario, Colletotrichum, Cladosporium, etc.) —
statistical-tier-led, unchanged from the original design:**

1. **Current level & tier** — latest `incidencia` reading, tiered via the existing
   `clasificarGravedad` (fixed 10%/30% cuts) **or** a refreshed per-pest tertile (POC method) —
   **pick one and document the choice explicitly in the builder's PR/commit, don't silently mix
   both**.
2. **Trend** — same as Tier A.
3. **Seasonal context** — same mechanism as Tier A, same caveat about lote-level 2023-2024 history.
4. **Spray recency** — same, context only.

**Priority score:** Tier A entries that are *over threshold* rank above all Tier B entries and all
non-over-threshold Tier A entries by construction (an owner-validated economic breach is a
stronger claim than any statistical percentile) — then within each tier, rank by
threshold-margin/statistical-tier + trend + seasonal modifiers. Surface a one-line "why" per entry
built from whichever components fired (mirrors the existing `Insight.descripcion` pattern), and
**always show which tier/logic produced the ranking** (e.g. "36% > 26% umbral económico Marceño,
subiendo" vs. "Tercil histórico Alto para Mosca del ovario, sin umbral económico validado") so nothing
is presented with more authority than it has. Exact weights beyond the tier-A-over-threshold-first
rule are a tuning decision for the builder agent to propose and justify in its report — keep it
cheap and inspectable, adjust after the monitoring team uses it for a couple of weeks.

## 7. Pipeline stages (contract + acceptance check per stage)

**P0 — Migration.** Write and apply the `pest_seasonal_profile` migration (columns: `pest_id`,
`lote_id`, `week_of_year`, `historical_tier`, `n_years_observed`, `source` = 'poc_2023_2026_import'
vs future live recomputation). Seed it from `monitoreo_lote.parquet`, mapping `pest_key`/`lote_key`
back to real `plagas_enfermedades_catalogo.id`/`lotes.id` (the POC's `normalize.py` mapping is the
source of truth for this join — reuse it, don't re-derive). *Accept:* row count matches
distinct (lote,pest,week) combinations in the parquet; every mapped lote/pest id resolves to a
real, current catalog row (no orphaned foreign keys); RLS mirrors other reference tables (read-all
authenticated, per existing conventions in `docs/supabase_tablas.md`).

**P0b — Umbral económico table.** A small, separate, hand-seeded table/config
(`pest_umbral_economico`: `pest_id`, `grupo_key` [nullable — shared only by the 4 Ácaro-complex
rows, e.g. `'acaro_complex'`], `umbral_pct`, `source_label`, `updated_at`) — NOT derived from any
data pipeline, just §2's resolved table. Small enough to be a plain seed migration, not a script.
*Accept:* exactly **9 rows** (Thrips=1, Ácaro-complex=4 sharing `grupo_key='acaro_complex'` +
`umbral_pct=33`, Monalonion=1, Marceño=1, Phytophtora=1, Antracnosis fruto=1, Antracnosis ramas=1),
every `pest_id` resolved against a live catalog query (not assumed from this doc's cached names —
catalog names can drift), `source_label='Cartama'` on every row.

**P1 — Ranking engine.** `priorizacionMonitoreo.ts` implementing §6. *Accept:* unit tests
(Vitest, `src/__tests__/`) covering: a Tier A pest over threshold + rising (must rank at the top),
a Tier A pest under threshold + rising (must rank below any over-threshold entry regardless of
trend), a Tier B rising-trend case, a Tier B falling-trend case, a seasonal-boost case, a sublote
with insufficient history (< 2 rounds — must be excluded, not crash), and the lote→sublote
seasonal-profile inheritance fallback.

**P2 — UI.** `PriorizacionScouting.tsx` + wiring into `DashboardMonitoreoV3.tsx`. *Accept:*
loads on both desktop and mobile viewport (per CLAUDE.md's responsive rules — sidebar-collapsed
check required before considering this done); ranked list is legible, "why" text is present for
every entry and states which logic produced it (umbral económico vs. tercil histórico — see §6);
Tier A over-threshold entries are visually distinguishable from Tier B statistical-tier entries at
a glance, not just in the tooltip text.

**P3 — Verification.** Manual pass (or the `/verify` skill) against real current DB data: do the
top-ranked entries make agronomic sense to a human reviewer? Cross-check at least 3 entries by
hand against raw `monitoreos` rows.

## 8. Multi-agent execution model

Lighter than the POC's — this is a scoped feature build, not a research tournament.

- **P0 (migration) and P1 (ranking engine) get a builder → independent verifier pair**, same shape
  as the POC's Workflow 1: one Sonnet worker builds, a second audits the migration's join
  correctness and the ranking engine's edge cases before either is considered done. This is the
  highest-leverage place for adversarial checking here too — a wrong lote/pest id mapping in P0
  would silently corrupt every seasonal-context row downstream, the same class of risk the POC's
  S1 stage carried.
- **P2 (UI) does not need a verifier pair** — visual/manual review (P3) covers it; don't
  over-orchestrate a straightforward component build.
- **No modeling tournament** — there is no modeling in this design (see §0). If the owner later
  wants to revisit whether the seasonal/trend rule-based weights in §6 could be learned rather than
  hand-set, that would be a new, separate, small POC — not part of this build.

## 9. Known limitations (carry forward, don't hide)

1. **Unit-match and comparison-basis assumptions are unverified against Cartama's own methodology**
   (§2) — the design assumes their % incidencia means the same thing as this farm's
   `incidencia_pct` (% trees/leaves affected in a round, single latest round, not a rolling
   average). If their protocol differs, the numbers need a documented conversion, not a silent
   as-is application. Not blocking this build; worth a direct confirmation with Cartama if the
   ranking's Tier A behavior looks off in practice.
2. **Tier B pests still lack any real economic threshold** — mosca del ovario (real persistence
   signal in the POC) and the fungal pests not on Cartama's list (Colletotrichum, Cladosporium)
   fall back to statistical tiers, a strictly weaker basis than Tier A's validated numbers. Worth
   asking Cartama whether thresholds exist for these too, as a cheap follow-up — not blocking.
3. **Seasonal profile for 2023-2024 is lote-level, inherited down to sublote** — real sublote-level
   seasonal history only starts in 2025. Label this in the UI, don't imply false precision.
4. **This is descriptive/rule-based, not causal or predictive in the ML sense** — it will not
   catch a genuinely novel outbreak pattern the historical seasonal profile has never seen. That's
   an accepted tradeoff given the POC's own evidence that a fancier model didn't do better here.

## 10. Deliverables & effort envelope

Two migrations (seasonal profile + umbral económico seed), ranking utility + tests, one new
component, one dashboard wiring change. Bounded: a few days of agent time (builder/verifier pair on
P0+P0b+P1, solo build on P2, manual verification on P3) — smaller than the POC, since there's no
tournament and no red-team stage.

## 11. Verification checklist (how the owner confirms this was done right)

1. Both migrations applied cleanly against a dev/staging check first (per CLAUDE.md's migration
   caution rules) — never hand-edit an already-applied migration file.
2. `pest_seasonal_profile` row count and a spot-check of 3 (lote,pest,week) rows match the POC
   parquet by hand.
3. `pest_umbral_economico` has exactly 9 rows (4 sharing `grupo_key='acaro_complex'`, 5
   independent), every `pest_id` verified against a live catalog query (not assumed), and
   `source_label='Cartama'` throughout.
4. Ranking engine unit tests pass, including the Tier A over-threshold ranks first regardless of
   trend/seasonality case; edge cases (insufficient history, missing seasonal data) don't crash,
   they exclude gracefully and are logged.
5. UI reviewed on both desktop and mobile (sidebar collapsed) before calling this done.
6. At least 3 top-ranked entries manually sanity-checked against raw `monitoreos` data by a human —
   including at least one Tier A over-threshold entry and one Tier B entry.
7. Tier A (umbral económico) and Tier B (tercil histórico) entries are visually and textually
   distinct — confirm a reader can immediately tell which logic produced any given entry.

---

**This document requires explicit owner approval before any of P0-P3 begins.**
