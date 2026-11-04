# Esco 2.0: v3 deploy, dev-set language check and P3 decisions

Date: 2026-11-04 (Bogotá). Public file: aggregates only. No question text, figure or
per-case answer from the development set or the held-out appears here.

## 1. P2 merged and deployed

- PR #415 (P2-A labor recovery and deterministic Spanish answers) was squash-merged as
  `f58d36c8`. Two review fixes went in before the merge:
  - Money under $10M keeps one decimal (`aprox. $1,4M`); from $10M, whole millions. With
    whole millions only, $1,449,000 was published as `aprox. $1M`, which loses up to 40 %.
  - The drift detector now watches `src/utils/formatPuro.ts`, a new import of `esco-consultas`.
- `esco-consultas` was redeployed as **version 3** from clean `main` `f58d36c8` with Santiago's
  approval. Live metadata: `ACTIVE`, `verify_jwt = true`; anonymous `GET /health` = 401.
  `make-server-1ccce916` is unchanged (v295; anonymous `/health` = 200).

## 2. Dev-set language check (real planner, not acceptance)

Purpose: P2 tests use scripted planner output. This check runs the real planner on the
development set to see whether the recovered core holds on natural language before P3.

- Runner: `node scripts/esco2/m25.ts --config m3 --reps 3 --tag p2-v3-devcheck --budget 0.50`,
  on `main` `f58d36c8`, against the frozen private snapshot. Development set only (10 cases,
  3 repetitions). The held-out was not opened (D17).
- Cost: USD 0.0076. One planner call per turn and no composer call. Median latency about
  1.6 s per turn.
- Result with the M2.5 scorer: **26 of 30 attempts pass.** Eight of ten cases pass in all three
  repetitions. The scorer over-credits date cases, so this is a direction signal, not a score.

Failures, by category:

| Category | Attempts | Cause |
|---|---|---|
| D26 clarification follow-up | 3 of 3 for that case | The answer asks the correct D26 question. The user's follow-up is free text, and P2 resolves a pending choice only from an exact option ID sent with `estadoToken`. The runner and the local test screen (`src/utils/esco2ClientePrueba.ts`) send neither, so the same question repeats. |
| Planner returned an invalid plan | 1 of 30 | `plan_no_valido` on the first turn. The follow-up that named the category was then classified out of scope, because client history no longer carries context. |

Conclusion: the planner reads the development questions correctly in 26 of 30 attempts.
The clarification round trip does not work for a real user yet. That gap is fixed before P3
code starts (P3 task 0 below). The D31 rejection still stands; only P5 can accept.

## 3. P3 decisions (Santiago, 2026-11-04)

Santiago approved these four recommendations in chat. The P3 source contract applies them;
it does not reopen them.

| ID | Decision |
|---|---|
| D34 | **Application cost.** For a closed application, use the cost frozen at close (`aplicaciones_cierre`). For an open application, show quantities; any money figure is computed at today's price and labeled «a precio de hoy». Never mix the two in one total without saying so. Today's price runs about 37 % above historical cost (M1 finding R1). |
| D35 | **Plan versus execution.** Plan: `aplicaciones_calculos`, `aplicaciones_productos`, `aplicaciones_mezclas`, with the mix→lote link in `aplicaciones_calculos.mezcla_id`. Execution: `movimientos_diarios` and its child tables. Never read `aplicaciones_lotes_planificado` (empty). Label plan and execution apart and never add them together. |
| D36 | **Labor↔application link.** Join only on `aplicaciones.tarea_id`. Never join by name or text. An application with no link, or a link that cannot be read, is stated as such, never as zero labor. |
| D37 | **Shortages.** Compute live: `aplicaciones_productos.cantidad_total_necesaria` summed by `producto_id` against `productos.cantidad_actual`. Never use the frozen `aplicaciones_compras` snapshot. |
