# Application consumption: source versus generation

Local candidate based on the exact main `0aa3710f2e01173ba1dd8f5b495d63de9bf6c3c3` tree. This package does not depend on draft #376 or #377. No private case, production lookup, model invocation, merge or deployment was performed.

## Confirmed boundary

`ejecutarConsultaEsco` selects actual `cantidad_utilizada` and `unidad` from `movimientos_diarios_productos`, linked to selected movements. It exposes them under `detalle[].movimientos[].consumos[]`. Planned `dosis_por_caneca`, `unidad_dosis` and `cantidad_total_necesaria` remain separate under `productos_planeados`. The application plan spans the application; actual consumption spans movement dates and the requested lot. These are not interchangeable universes.

Closed synthetic tests execute the real `llmToolLoop` and real evidence query. The second intercepted model request contains the exact actual quantities, product IDs, units and movement dates, separately from the different planned dose and total. The fixture projects only selected columns, so omitting the quantity column is observable. A movement outside the requested period is excluded. The short persisted result is identical. Null stays null; a failed consumption read becomes an error, not complete evidence.

This rejects a quantity-parser or plan-substitution explanation for this **tested fresh-path mechanism**, not every possible application query or the original private cases. No production trace was re-read. A deliberately incorrect, nonempty mocked final answer still exits unchanged despite correct input evidence. That demonstrates absence of a deterministic final quantity validator; it does not reproduce a real model's causal behavior or establish an online error rate.

For long results, `resumirContexto` drops raw detail and retains scope/count metadata. It marks the context incomplete and instructs a fresh query. This is confirmed context loss with an existing safeguard, not proof it caused a particular wrong answer. No new aggregation, number parser, data calculation or context guard is introduced here.

Legacy `get_application_summary` exposes planned products and movement caneca/bulto counts without actual product-consumption quantities. `get_application_details` exposes plan calculations and costs. Neither substitutes for the evidence tool's recorded product quantities. Their existing conservative completeness envelopes remain unchanged.

## Narrow correction and evidence limit

Only the mirrored system prompt changes: identify exact actual/planned fields; preserve product, lot, movement date and unit; do not substitute planned doses/totals or costs for actual consumption; sum only compatible recorded quantities in scope; disclose missing quantities while answering verified subparts; re-query lost detail and correct stale history from current evidence.

This is generation policy, **not guaranteed validation**. It adds no programmatic refusal guard, keyword filter, output schema, retry or provider call. Explicitly requested theoretical calculations remain allowed as labelled plan/estimates with their formula, not recorded consumption. Semantic refusal effects remain untested online. The mocked wrong-answer probe intentionally remains a passing limitation test. Only a comparable independently graded online campaign can establish improved factual answers.

Initial source probes: five boundary/limitation controls passed; the policy-presence assertion failed. That failure proves absent explicit guidance, not that six production defects existed. Tests use only synthetic fixtures. Local check receipts and final candidate identity are supplied separately to the parent; remote CI is unrun because this package is local-only.

## Release preparation after #374

The one-time release workflows/controllers were retired. Do not dispatch or restore them unchanged. A subsequent approved release needs a separately reviewed procedure with a fixed combined source commit/tree and existing authorized management identity, using Supabase CLI only for `ywhtjwawnkeqlwxbvgup / make-server-1ccce916` and the repository configuration (`verify_jwt=false`). This workspace does not have a configured management token; do not create credentials or export the repository secret to it.

Before release, observe current metadata/configuration and source through approved access, freeze an exclusive backend window, and verify a recoverable current rollback source. Last accepted v282 source is `e7a5545bc8d87ad0502caf009d0201cae67fc772`; that is historical evidence, not a fresh observation. Retain native download versus reconstructed type-only source distinctions; unknown layouts or source/config differences stop execution. Require fresh reviewed capture evidence before one deployment attempt, then verify owned version, health and deployed source. Inspect uncertain outcomes before retry or rollback. Git recovery does not reproduce the exact ESZIP, floating dependencies, runtime or secrets. Migration 188 is already applied and is not part of this package.
