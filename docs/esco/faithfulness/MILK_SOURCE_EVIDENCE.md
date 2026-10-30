# Milk source evidence — bounded remediation candidate

Baseline main `0aa3710f2e01173ba1dd8f5b495d63de9bf6c3c3` includes externally completed PR373/374/375 without chat-runtime overlap. This package is independent of draft376's terminal guard; it does not deploy either change. Preserve SQL188, security/access settings, source history and the v282 production baseline. The parent owns release review and the prospective online acceptance campaign.

## Discriminating evidence

| Mechanism | Synthetic observation before correction | Correction / boundary |
|---|---|---|
| Upstream record loss | A later high observation after the first2000 was absent from `get_hato_produccion` input to generation. A generic legacy-incompleteness warning already existed; it did not recover missing records or averages. | Read all weights through the existing bounded pager, with stable date/UUID ordering. At most20000 weights; exceeding the bound errors instead of publishing a partial average. |
| Wrong entity aggregation | Two historical UUIDs with the same recycled number/name became one average. Migration066 explicitly permits recycled labels;054 makes `(animal_id,fecha)` unique. | Select and group by permanent `animal_id`. Number lookups retain all matching UUIDs separately and expose ambiguity instead of selecting the first. |
| Raw component loss | AM/PM were selected but discarded before generation. | Preserve AM/PM alongside canonical `litros_total`; do not recompute total from optional components (migration061). |
| Numeric history loss | `resumirContexto` reduced a large legacy milk result to `resumen:null`. | Supply a compact summary with scoped values, observation counts/dates and server-computed extrema. Saved raw detail remains explicitly truncated/incomplete. |
| Unknown coverage promoted to complete (review finding) | A short page without exact count metadata could stop pagination and acquire the new trusted envelope. Six local negative tests failed before correction. | Milk-only opt-in validation requires exact, stable counts and consistent page ranges for weights, number resolution and quincenas. Missing/wildcard/malformed/changing counts fail closed. Other tools keep their conservative behavior. |

Initial new-test run:13 failures /1 passing control. The separate first-UUID filter probe then reproduced1 failure /16 passes. These counts include new contract assertions, not13 distinct production incidents. None establishes the cause of a particular private Web answer or Q03.

## What is enforced

The existing rounded per-animal mean and observation-weighted overall mean are unchanged. Server ranking sorts that same rounded metric; equal displayed values share competition ranks. A real zero remains zero; absent/invalid canonical measurements or missing permanent identity are not silently imputed. Animals without observations are not invented. Small counts and each identity/value/unit/period are checked directly in tests, without relying on combined-turn anchor presence.

Compact extrema include at most five rows per end, with explicit incomplete-slice and omitted-tie warnings. They describe **L/pesaje observado**, not accumulated production, all animals in the herd, or volume sold. Quincenas retain their existing independent latest-N selection; they are not silently reinterpreted as the weights' date range.

## Bounded provider projection — supersedes the unbounded local proposal

Local proposal6fb7eba retained all observations in the immediate payload. A synthetic profile measured about1.39MB before the final envelope/escaping; an isolated actual-loop regression measured1,704,827 bytes for the provider content value with20,000 observations. That is not accepted as release-ready. The same current integration assertions fail2 tests /pass24 on that unbounded proposal.

The provider DTO now has a hard **20,000 UTF-8 byte bound on the JSON-serialized content string**, including its escaping. This is a bound for this tool's evidence value, not the whole request, system prompt, other tools or conversation history. Internal aggregation still uses all verified observations. The transport uses a fixed domain projection, not a generic output framework:

- Complete global counts, weighted mean and global top/bottom-five extrema remain unchanged and are never dropped to meet the budget.
- At most50 aggregate profiles: all when they fit, otherwise the high/low extrema by the same mean. Profiles carry exact UUIDs, counts, observed dates and ranks, but no nested raw history.
- At most20 recent raw observations,6 selected quincenas and20 number-resolution UUIDs. Raw AM/PM and canonical total remain separate; a null component stays null.
- Names are at most64 UTF-8 bytes, notes120; text cuts have explicit flags. Permanent IDs and dates are never shortened: malformed/oversized immutable identity fails instead of becoming another identity.
- If escaping or long text still exceeds the budget, optional samples/profiles/quincenas/lookup-list entries shrink deterministically. Every omission count and completeness flag is rebuilt. If indispensable aggregates cannot fit, the tool returns an error, not a false complete result.

`consulta_completa` attests retrieval within the declared source scopes. `agregados_completos` attests calculations over those observations. `detalle_completo`, per-block flags and `recortes` separately disclose every bounded/omitted detail. Missing raw detail must not become absence or fabricated observations; it also must not prevent useful answers from the complete aggregates. A narrower existing date/animal query can supply a smaller detailed set. The compact projection is below the saved-context threshold, so saved and immediate evidence stay identical with their scope flags intact.

Synthetic50-animal profile (before the final wording-only correction):200/2,000/20,000 observations used18,495/18,528/18,474 escaped-content bytes; all50 aggregate profiles and20 recent observations remained visible. The global counts/rankings stayed complete while180/1,980/19,980 raw observations were explicitly omitted. These are byte-size checks, not provider cost/quality/latency acceptance. Final receipts belong to the local checkpoint/handoff.

The trusted milk envelope follows only successful reads with verified counts and valid weights. All other legacy tools retain their incomplete-envelope policy. Exact count consistency is not a transactional database snapshot or proof of real-world truth. More than2000 requested observations can require additional bounded reads; the provider projection remains byte-bounded independently of observation count. No additional model request or retry is introduced. This preparation performs no real provider call, production query, migration or deployment.

## Prompt guidance and remaining limits

The system prompt now prioritizes source/entity/unit/period fidelity, tool-computed aggregates/rankings, answerable subparts and explicit inferential limits over completing a chart or narrative. Proxy observations and temporal association must not be presented as direct physical measurements or confirmed causes. This is semantic guidance, **not a deterministic prose validator, keyword ban or model-quality guarantee**. Valid observed physical facts and supported derived calculations remain allowed.

A model may still alter a supplied value, misinterpret a scope or ignore an error. The actual-loop tests use scripted model messages and verify what evidence reaches generation; they do not establish factual correctness of fresh model answers. General combined-turn anchors remain insufficient for claim attribution. History anchoring, conflicting UTC/Bogotá instructions, Q03 and other domains remain separate work. No original historical answer label changes.

Before activation: independent review, exact-candidate CI, parent-specific merge/release approval, a separately reviewed CLI release/recovery procedure (one-time jobs were retired), then comparable online acceptance under the parent's frozen operational sample gates. A passing replay or source/health check cannot substitute for that acceptance.
