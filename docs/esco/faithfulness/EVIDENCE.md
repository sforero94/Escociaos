# Evidence envelope contract — P1-01

This is a local implementation contract, not a production activation or a reviewed
historical fixture. `src/utils/escoEvidencia.ts` is canonical; the sync script
copies it as `esco-evidencia.ts` into both edge trees.

## Version 1 metadata

`adaptarEvidenciaLegada` projects the existing `_evidencia` into `EvidenciaEscoV1`.
It copies no tool payload, raw error, argument object, credential or header object.
The adapter and reader consume trusted tool metadata, not arbitrary user content;
they are not general secret-redaction or authorization boundaries.

- `outcome`: `success`, `complete-empty`, `partial`, `unavailable`, `stale`, or
  `unknown`. Presence of an `error` key wins even when its value is falsy.
- `complete`: completeness of the delivered evidence, not merely the database
  retrieval. True requires both query and detail completeness flags.
  Context truncation, pagination, failure or explicit staleness prevent true.
- `retrieval_complete` and `detail_complete`: separate tri-state facts. A complete
  query with a paginated detail is partial delivered evidence. Aggregates may
  still be useful, but fact validation is P1-03.
- `period`: validated calendar dates. The generic adapter keeps `timezone` null;
  scoped birth and animal producers set the shared `America/Bogota` identifier.
  Birth periods filter event dates; animal periods filter birth dates. A null
  boundary means no filter on that side, not a guessed reporting interval.
- `coverage`: nonnegative integer counts of retrieved records. These counts do
  not establish observation coverage, measurement freshness or row authorization.
- `retrieved_on`: legacy consultation date without invented time precision.
  Scoped birth and animal producers add `retrieved_at` at query completion;
  `observed_at` remains null. Historical event dates are not observation timestamps.
  Staleness requires explicit caller knowledge, not merely a historical period.
- `scope.entity_ids`: actual animal IDs represented in the delivered page for
  scoped tools, not a resolved interpretation of every requested name or alias.
  Empty scoped evidence has `[]`; generic unknown scope is null. The adapter does
  not invent identity from arguments or join keys without a returned animal row.
- `units`: scoped counts use `resumen.total_eventos: eventos` or
  `resumen.total_animales: animales`. Other units stay null.
- `source_refs`: scoped primary rows in the delivered page only: `hato_eventos`
  for births, `hato_animales` for animals. These come from query results, never
  caller arguments. They do not claim to identify every nested join, every
  aggregate contributor, or all rows in other pages. Empty scoped results have
  `[]`; generic unknown provenance is null.
- `total_facts` and `truncation`: validated count and separate context/detail
  truncation indicators. Null always means unknown, never zero or false.

An explicit complete query and complete detail with zero facts is `complete-empty`.
An absent result is `unavailable`; a valid object without completeness metadata is
`unknown`. Incomplete queries are `partial`, not complete-empty. The generic
adapter trusts legacy counts; it does not independently recalculate payload totals.

## Producers and execution compatibility

All `HERRAMIENTAS_CONSULTA` tools retain original `_evidencia`, `resumen`, and
`detalle` and now add `_evidencia_v1` in `ejecutarConsultaEsco.finish`. Only
`get_hato_partos` and `get_hato_animales` establish scoped identities, calendar,
units, retrieval timestamps and primary source references in this task.

`executeTool` attaches typed metadata to other `get_*` JSON results, including
caught errors. Existing conservative legacy flags remain incomplete. Malformed
read results become an explicit unavailable error, never an empty success. Memory
actions and `web_search_agronomic` retain their existing contracts. Duplicate-call
errors retain the legacy error shape and remain readable by the generic adapter.
The in-process frozen transport preserves captured payloads without rewriting
fixture bytes; production retrieval correctness is a separate integration task.

References are identifiers for rows returned under the existing query boundary;
they grant no access and provide no new fetch endpoint. `ConsultaPagina` remains
responsible for returning authorized rows. Production uses the existing
`supabaseQuery` and channel access checks; this task changes no permissions,
service-role policy, filters or query calculations. Controlled database/RLS
integration remains P3-02; synthetic tests establish projection, not live access.

## Consumers and context compatibility

`leerEvidencia` validates version, field shapes, dates, counts and completeness
invariants, then projects known fields. A present invalid envelope is unavailable;
it cannot fall back to a contradictory legacy success. Errors override typed
success. Version 1 currently accepts the scoped Bogotá calendar or unknown/null;
other calendars require an explicit compatible contract update.

`toolResultOk` treats typed unavailable/invalid evidence as execution failure.
Partial and stale describe evidence quality, not a failed tool invocation.
`evidenciaPartosSuficiente` accepts complete retrieval with valid period metadata
and rejects failed/stale/invalid/context-truncated evidence. It deliberately keeps
the existing distinction between complete aggregate retrieval and paginated
detail: this guard alone does not validate a narrative or a complete detail list.
It still supports legacy results; cross-turn period matching belongs to P1-04.

Short `resumirContexto` results remain byte-identical, including typed producer
metadata. Above the existing 24,000-character threshold, it retains `resumen`,
legacy metadata and the re-query instruction; `recortarEvidencia` preserves validated
scope/calendar/units/source/timestamp fields while downgrading completeness and
retaining unavailable/stale outcomes. Legacy completeness flags also become false.
An error remains an error with a fixed message instead of a long raw error.

Malformed JSON or primitives produce unavailable typed metadata when truncated.
The threshold remains a trigger, not an output size guarantee: a large `resumen`
can still exceed it. Existing persisted history is not rewritten. The immediate
model tool response retains full detail; only the persisted summary is truncated.
Web and Telegram continue to embed the whole `result_summary` string in history.
Synthetic channel-format tests check metadata survival; these are not live
Telegram delivery or full HTTP persistence tests.

## Migration inventory and deferred work

- Scoped migration: `get_hato_partos` and `get_hato_animales`.
- Generic typed adapters: the other `HERRAMIENTAS_CONSULTA` tools and legacy
  `get_*` results/errors; unknown fields stay null.
- Migrated consumers: shared immediate result/event boundary, birth guard and
  summary truncation; both generated edge trees match canonical sources.
- Deferred: additional domain-specific scope/units/freshness/reference migration
  in P2 tasks, fact/reference validation in P1-03, scoped cross-turn state in
  P1-04, hard context bounds in execution/state tasks, and controlled retrieval
  integration in P3-02. No generic row reference proves a numeric or causal claim.

P1-01 establishes the envelope and first scoped adapters. It does not complete
P1-02/P1-03, adjudicate historical disputes, measure real-model quality, or authorize
production deployment, telemetry, migrations, paid schedules or rollout.
