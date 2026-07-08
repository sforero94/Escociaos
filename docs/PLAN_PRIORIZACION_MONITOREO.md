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

### Agronomic threshold research (this round, not part of the original POC)

A research pass for the 3 pests with the strongest **persistence** signal in the POC (cucarrón
marceño, ácaros, mosca del ovario — ranked by persistence-baseline balanced accuracy in
`data/processed/baselines.parquet`) found:

| Pest | Best available threshold | Unit | Confidence |
|---|---|---|---|
| Cucarrón marceño (*Astaena pygidialis*) | 1–2 adults/trap = detection trigger (no economic threshold found) | trap count | LOW — Colombian literature itself says this threshold doesn't exist yet |
| Ácaros (*Oligonychus* spp.) | ≤5 mobile mites/leaf (Chile INIA, same species, NOT Colombia-specific) | mites/leaf | LOW-MEDIUM — sources disagree by 20-100x; UC IPM says no validated threshold exists at all |
| Mosca del ovario (*Bruggmanniella perseae*) | ≥1 adult/trap (single weak Colombian university source) | trap count | LOW |

**Critical implication: none of these use the same measurement unit as this farm's data.** This
farm records **incidencia** — % of monitored trees/leaves affected per round. Every threshold found
is a **raw count per trap or per leaf**, a different sampling protocol entirely. They cannot be
substituted in as literal cutoffs for the existing `incidencia_pct` scale without a fabricated,
unjustified unit conversion. **Decision: keep the existing data-driven tiering approach
(`clasificarGravedad` in `calculosMonitoreo.ts`, or the POC's per-pest tertile method — see §6) as
the only tier logic that drives ranking.** The researched thresholds are surfaced as a **read-only
reference annotation** (tooltip/footnote, clearly labeled "reference only, different measurement
method, not Colombia-validated in 2 of 3 cases") — informative context for the agronomist, never a
silent gate. This is a limitation worth carrying forward, not a solved problem — see §9.

## 3. Scope & non-goals

**In scope:**
- Sublote-level ranking (finer than the POC's lote-only scope — the POC's lote-only decision was
  specific to that ML analysis; this app's live `monitoreos` table is already sublote-level and a
  scout is dispatched to a specific sublote, so there's no reason to throw that resolution away
  here).
- Per-individual-pest ranking (not the POC's biology-pooled `pest_group`s — pooling was a
  statistical-power device for a data-hungry ML tournament; a rule-based ranking has no such need
  and the agronomist already thinks in terms of individual catalog pests).
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
- No hard economic-threshold gating (see §2's unit-mismatch finding) — reference-only annotations.
- No automatic spray/treatment triggering — this ranks where to *look*, not what to *do*; the
  agronomist stays in the loop for any action decision.
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
| Research findings (§2 table) | reference-only threshold annotations | tooltip context, never a scoring input |

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

For each (sublote, pest) with at least 2 historical rounds:

1. **Current level & tier** — latest `incidencia` reading, tiered via the existing
   `clasificarGravedad` (fixed 10%/30% cuts) **or** a refreshed per-pest tertile (POC method) if
   the seasonal-profile import (below) makes per-pest tiers available — **pick one and document
   the choice explicitly in the builder's PR/commit, don't silently mix both**.
2. **Trend** — `calcularTendencia` over the last 3-4 rounds (already implemented, reused as-is).
3. **Seasonal context** — from the new `pest_seasonal_profile` table: is the current
   ISO week-of-year within this pest's historical top-tertile window (computed once from the
   POC's 2023-2026 `monitoreo_lote.parquet`, refreshed periodically as more DB-native years
   accumulate)? Sublotes inherit their parent lote's historical profile for the 2023-2024 portion
   (that data only exists at lote granularity) — document this inherited-resolution caveat in the
   UI copy, don't present it as sublote-precise history it isn't.
4. **Spray recency (context only, not scored)** — days since last spray at that lote, shown
   alongside the ranking entry so the agronomist can immediately tell "this is elevated 3 days
   after treatment" vs "this is elevated with no recent intervention."
5. **Reference threshold annotation (context only, not scored)** — for the 3 researched pests,
   show the §2 table's number with its confidence label and unit caveat, nothing else.

**Priority score** = a simple, explainable weighted combination of (1)+(2)+(3) only — e.g. current
tier (0/1/2) + trend bonus (rising=+1, stable=0, falling=-1) + seasonal bonus (in high-season
window=+1). Rank descending; surface a one-line "why" per entry built from whichever components
fired (mirrors the existing `Insight.descripcion` pattern). Exact weights are a tuning decision for
the builder agent to propose and justify in its report — not frozen in this doc, since the POC's
own effort-envelope philosophy applies: keep this cheap and inspectable, adjust after the
monitoring team uses it for a couple of weeks rather than over-designing weights up front.

## 7. Pipeline stages (contract + acceptance check per stage)

**P0 — Migration.** Write and apply the `pest_seasonal_profile` migration (columns: `pest_id`,
`lote_id`, `week_of_year`, `historical_tier`, `n_years_observed`, `source` = 'poc_2023_2026_import'
vs future live recomputation). Seed it from `monitoreo_lote.parquet`, mapping `pest_key`/`lote_key`
back to real `plagas_enfermedades_catalogo.id`/`lotes.id` (the POC's `normalize.py` mapping is the
source of truth for this join — reuse it, don't re-derive). *Accept:* row count matches
distinct (lote,pest,week) combinations in the parquet; every mapped lote/pest id resolves to a
real, current catalog row (no orphaned foreign keys); RLS mirrors other reference tables (read-all
authenticated, per existing conventions in `docs/supabase_tablas.md`).

**P1 — Ranking engine.** `priorizacionMonitoreo.ts` implementing §6. *Accept:* unit tests
(Vitest, `src/__tests__/`) covering: a rising-trend case, a falling-trend case, a
seasonal-boost case, a sublote with insufficient history (< 2 rounds — must be excluded, not
crash), and the lote→sublote seasonal-profile inheritance fallback.

**P2 — UI.** `PriorizacionScouting.tsx` + wiring into `DashboardMonitoreoV3.tsx`. *Accept:*
loads on both desktop and mobile viewport (per CLAUDE.md's responsive rules — sidebar-collapsed
check required before considering this done); ranked list is legible, "why" text is present for
every entry, reference-threshold tooltip is visually distinct from the primary score (never
implies it's an official economic threshold).

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

1. **Reference thresholds are weak and unit-incompatible** (§2) — presented as context only. A
   real fix would mean sourcing/translating the Agrosavia Hass-avocado IPM guide (the research
   agent found it referenced but couldn't fetch the PDF in this sandbox) or running a parallel
   trap-count monitoring protocol for these 3 pests — out of scope here.
2. **Seasonal profile for 2023-2024 is lote-level, inherited down to sublote** — real sublote-level
   seasonal history only starts in 2025. Label this in the UI, don't imply false precision.
3. **This is descriptive/rule-based, not causal or predictive in the ML sense** — it will not
   catch a genuinely novel outbreak pattern the historical seasonal profile has never seen. That's
   an accepted tradeoff given the POC's own evidence that a fancier model didn't do better here.

## 10. Deliverables & effort envelope

Migration + seed script, ranking utility + tests, one new component, one dashboard wiring change.
Bounded: a few days of agent time (builder/verifier pair on P0+P1, solo build on P2, manual
verification on P3) — smaller than the POC, since there's no tournament and no red-team stage.

## 11. Verification checklist (how the owner confirms this was done right)

1. Migration applied cleanly against a dev/staging check first (per CLAUDE.md's migration caution
   rules) — never hand-edit an already-applied migration file.
2. `pest_seasonal_profile` row count and a spot-check of 3 (lote,pest,week) rows match the POC
   parquet by hand.
3. Ranking engine unit tests pass; edge cases (insufficient history, missing seasonal data) don't
   crash, they exclude gracefully and are logged.
4. UI reviewed on both desktop and mobile (sidebar collapsed) before calling this done.
5. At least 3 top-ranked entries manually sanity-checked against raw `monitoreos` data by a human.
6. Reference-threshold tooltips are visually and textually distinct from the primary ranking —
   confirm a reader can't mistake them for validated economic action thresholds.

---

**This document requires explicit owner approval before any of P0-P3 begins.**
