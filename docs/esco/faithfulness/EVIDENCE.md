# Evidence envelope contract — P1-01-a

This is a local implementation contract, not a production activation or a reviewed
historical fixture. `src/utils/escoEvidencia.ts` is canonical; the sync script
copies it as `esco-evidencia.ts` into both edge trees.

## Version 1 metadata

`adaptarEvidenciaLegada` projects the existing `_evidencia` into `EvidenciaEscoV1`.
It copies no tool payload, raw error, argument object, credential or header object.
The adapter is for trusted tool metadata, not a general secret-redaction boundary.

- `outcome`: `success`, `complete-empty`, `partial`, `unavailable`, `stale`, or
  `unknown`. Presence of an `error` key wins even when its value is falsy.
- `complete`: completeness of the delivered evidence, not merely the database
  retrieval. True requires both legacy query and detail completeness flags.
  Context truncation, pagination, failure or explicit staleness prevent true.
- `retrieval_complete` and `detail_complete`: separate tri-state facts. A complete
  query with a paginated detail is partial delivered evidence. Aggregates may
  still be useful, but claim validation is a later task.
- `period`: validated calendar dates from legacy `rango.desde/hasta` only.
  `timezone` stays null: the generic legacy adapter cannot infer each tool's
  calendar semantics from its name.
- `coverage`: nonnegative integer record counts with table-shaped keys. These
  counts do not establish observation coverage or authorized source references.
- `retrieved_on`: the legacy consultation date, without inventing a timestamp.
  `retrieved_at` and `observed_at` remain null. Historical dates do not establish
  staleness; callers must explicitly supply known staleness.
- `scope.entity_ids`, `units`, and `source_refs`: null until a scoped tool can
  establish them. No table name, user-supplied UUID, URL or arbitrary string is
  promoted into a source reference or an authorization claim.
- `total_facts` and `truncation`: validated count and separate context/detail
  truncation indicators. Null always means unknown, never zero or false.

An explicit complete query and complete detail with zero facts is `complete-empty`.
An absent result is `unavailable`; a valid object without completeness metadata is
`unknown`. Legacy incomplete queries are `partial`, not complete-empty. This
adapter does not validate payload counts against detail arrays; scoped producers
and consumers remain responsible for their contracts in P1-01-b.

## Context compatibility

Short results remain byte-identical. For results above the existing 24,000-character
threshold, `resumirContexto` retains `resumen`, legacy metadata, and the re-query
instruction. It adds `_evidencia_v1` and downgrades legacy `consulta_completa` and
`detalle_completo` to false. Typed metadata retains original retrieval completeness
while declaring delivered context incomplete. An error remains an error using a
fixed message; the context adapter does not copy a long raw error.

Malformed JSON or primitives produce unavailable typed metadata when truncated.
The threshold remains a trigger, not an output size guarantee: a large `resumen`
can still exceed it. Bounded context storage is unfinished work, not a new promise.
Existing persisted history is not rewritten. The immediate model tool response
remains intact. `toolResultOk`, the birth guard and history readers have no typed
consumer yet; the birth guard now conservatively rejects truncated completeness.

## Migration inventory and remaining slice

- Migrated boundary: shared `resumirContexto`, used by `llmToolLoop` to produce
  `toolInteractions.result_summary`. Both edge trees are synchronized.
- Available pure adapter: legacy success, empty, missing, error, pagination,
  explicit stale and truncated metadata. Synthetic tests exercise these states.
- Unmigrated producers: all `HERRAMIENTAS_CONSULTA` tools still emit their original
  `_evidencia` from `ejecutarConsultaEsco.finish`; all legacy `get_*` tools still
  receive the conservative metadata in `executeTool`. Search/forecast and memory
  actions retain their current shapes. No business query or calculation changed.
- Unmigrated consumers: `toolResultOk`, `evidenciaPartosSuficiente`, immediate loop
  evidence validation, and web/Telegram history construction. No typed result is
  yet emitted consistently for short or successful tool results.

P1-01-b must select and migrate scoped producers, provide known entities/calendar/
units/source identities at the authorized query boundary, handle failed tools
without promoting them to empty success, preserve metadata through immediate and
persisted contexts, and verify both channels. Validate any source references
against evidence actually retrieved under the existing access rules. Keep all
parent acceptance criteria in PLAN.md; P1-01 remains in progress.
