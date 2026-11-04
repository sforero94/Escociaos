# P2-A: bounded labor runtime and state contract

Date: 2026-11-04. Owner: CTO. Status: local P2-A runtime and API decisions finalized;
verification receipts belong in the [P2 result](p2-result-2026-11-04.md).
This document bounds the P2-A implementation
authorized by Santiago in the originating chat and passed to this fresh executor.
That dated authorization supersedes the older P0/P1-only status in the frozen
experiment documents. It authorizes local implementation and synthetic offline
verification only. It does not authorize P3, product acceptance, production reads,
paid inference, migration, new secrets, deployment, commit or push.

The [P1 result](p1-experiment-result-2026-11-04.md) selected A: keep
`ResultadoParte`, its correct pure calculations and a small semantic sidecar.
The [P0 semantics](p0-semantic-contract-2026-11-04.md) and
[QA rubric](p0-qa-rubric-2026-11-04.md) remain immutable experiment evidence.
P2 adds versioned tests rather than modifying their source tables or expectations.
The [D31 aggregate](d31-result-2026-11-04.md) still records rejected acceptance.

## Runtime boundary and ownership

The runtime is the existing single-source core in `src/utils/esco2/` and the real
HTTP handler `supabase/functions/esco-consultas/manejador.ts`. The latter imports
the former directly. Neither legacy server copy, legacy chat nor Telegram enters
this change. No general query language, framework, provider or runtime dependency
is needed. The existing package/lockfile pins remain authoritative.

| Owner | Files and responsibility |
|---|---|
| Backend | Core types, fixed readers, registry, executor, deterministic renderer, prompts, ambiguity/state helpers, actual `manejador.ts`, implementation unit tests |
| QA | New P2-only independent fixtures, table/SQL oracles, mutation and real-handler/RLS integration tests; report defects independently |
| CTO | This runtime/API/state decision document only; no runtime edits |
| Main coordinator | Rerun reported checks, inspect final diff, produce P2 result report and update existing Notion task/Bot Log once |

Each editor preserves concurrent edits. The existing P0/P1 uncommitted files,
unrelated `handoff-2026-11-04-local 2.md`, model configuration, applied migrations
and private evaluation artifacts remain outside ownership. D17 forbids opening
held-out inputs, evaluator traces/session logs or private build artifacts.

## Source authority found in tracked local code

P1's `asignacionesTareaLote` was a hypothetical fixture relation. P2 does not
promote that relation into an assumed production guarantee. Local tracked sources
identify an existing task-assignment field:

- `src/components/labores/CrearEditarTareaDialog.tsx` writes the complete selected
  array to `tareas.lote_ids`. Its `lote_id` write is only the first element for
  compatibility, so the scalar cannot represent multiple assignments.
- `src/components/labores/TareaDetalleDialog.tsx` reads task lot identities from
  that array. `src/types/database.ts` declares `lote_ids: string[] | null`.
- Migrations 021/022 explicitly replace the empty `tareas_lotes` junction with
  `UNNEST(t.lote_ids)`; migration 033's invoker view uses the same field.
- Migrations 005/008 deliberately stop syncing task lots after work exists;
  planned dates may still sync. Therefore task assignment is the recorded task
  assignment, not proof of historical assignment or current application targets.

Add `lote_ids` to the existing fixed task columns. Validate arrays and referenced
IDs before using them to exclude candidate tasks. An absent property is unread;
`null` is unknown; `[]` is explicitly no recorded task assignment. Never coalesce
these states. Historical `ARRAY_AGG` paths can produce null for an empty relation,
so local schema alone does not resolve that null into verified absence.

Scheduled lot answers may use complete, valid, caller-visible `lote_ids` arrays
with explicit source qualification. If any candidate's necessary assignment is
unread, null, malformed or references an unavailable lot, that obligation remains
unavailable. Work records do not repair it. No production read has verified current
field coverage, migration state or business completeness.

Every required field/relation is checked before filters that could hide missing
rows. Preserve unavailable optional metadata separately so an unread application
relation cannot erase a valid labor total. Explicit null `aplicaciones.tarea_id`
is an unlinked application; absent `tarea_id` cannot safely be dropped as null.
Application sets retain every matching ID, including duplicate display names.

Pagination counts and unique IDs establish bounded visible read completeness;
they do not establish one cross-table snapshot. The fixed reader's separate
catalog and work reads carry `lecturas_independientes`. A same-record partition
may show its derived arithmetic and exclusions, but it cannot certify atomic
cross-table reconciliation. A later consistent-read RPC/transaction needs its own
design and authorization; no migration belongs in P2.

## Closed intent and result contract

Extend the existing operation with closed optional fields while retaining old
recorded-work defaults. The concrete query fields are `cohorte`, `base_fecha`,
`tarea_ids`, `lote_ids`, and `ranking` (`metrica`, `direccion`, `n`, `empates`).
The supported cohorts are `trabajo_registrado` and `tarea_programada`. Couple
cohort and date basis: recorded work selects
`fecha_trabajo`; scheduled tasks selects `fecha_estimada_inicio`. Reject mixed or
unregistered bases. Scheduled means inclusive planned starts, not overlap,
completion, actual work or historical status. Keep Bogotá's handler date and the
shared Monday-based calendar utility. Future clipping applies only to recorded
work and must be disclosed.

Stable task, lot and type IDs are authoritative. Labels display those entities;
they cannot merge groups. Category uses its canonical value because the source
has no separate category ID. Compound group keys preserve requested grain order.
Resolve IDs against the caller-visible catalog; contradictory simultaneous ID and
name selectors are rejected or intersected explicitly, never silently preferred.

Ranking declares metric, direction, N and tie policy. Explicit ties include all
equal cutoff values or break by stable ID. Null cannot sort as zero. Show eligible,
shown and omitted counts; the full-scope total does not become a top-N subtotal.
Legacy N-only queries retain their documented descending-jornales behavior rather
than inventing an implicit new business default.

Retain existing supported ratios, first/last work date and days with records.
Audit their denominator/source requirements and add regression tests; P1 did not
certify them. An unavailable required denominator is not zero. D30 remains whole
task estimates, separately labeled from recorded work, with missing-task counts
and partial subtotal scope. Preserve its existing category/lot cohort rule.

Each part keeps its own disposition. Independent substantive work still executes
when another part is unavailable or ambiguous. Current task state is always
labeled current, never as-of the queried historical interval.

The small result sidecar carries identity, cohort/date basis, required qualifiers,
source/association availability and exact member sets alongside `ResultadoParte`.
Render factual headings, metric/entity/unit bindings, dates, sets and caveats
deterministically from that validated result. Arbitrary planner `proposito`,
rejection strings and history text are not factual headings. No free-form model
composer or numeric-membership certification remains in the recovered answer path.
The deployed model configuration itself is unchanged.

## Caller-bound clarification transport

Two alternatives were considered. Signed stateless state survives restarts but
requires a signing secret, rotation and replay design. An RLS persistence store
requires a database change. Neither is authorized or needed for local recovery.
Choose a bounded process-local opaque-token store for P2. It uses random tokens,
an explicit 15-minute TTL, a maximum of 200 entries and a 64 KiB UTF-8 serialized
state limit; it adds no secret or migration. Oversized state receives no token or
actionable follow-up options, retains independent answered results and asks for a
narrower selection. It is never silently truncated.

HTTP requests may supply an opaque conversation token and an exact offered choice
ID through optional `estadoToken` and `respuestaAclaracion`. Responses return
`estadoToken`, `opcionesAclaracion` and, when needed, `avisoEstado` alongside the
existing answer/results fields. They never accept authoritative owner, typed
scope, pending plan or state from the client.
Only `autorizarGerencia` determines owner identity. Load and save under that
authenticated identity; check version, expiry, bounded shape and current catalog
references before using any stored query. Never log tokens or raw state.

The store retains the typed original query plus exact validated alternatives.
D26/D29 options are deterministic. Only an offered ID resolves a pending choice;
an unrelated reply retains the pending state. Arbitrary assistant history cannot
trigger the old `yaPreguntado` bypass or choose a scope. A caller change cannot
recover another caller's state, and client-supplied history never grants access.

Unknown, expired, evicted or foreign tokens safely reset with a clear notice and
cannot execute a submitted choice against an untrusted scope. Multi-instance
routing, cold starts and process restart can lose this ephemeral state; tokens
provide no persistence guarantee. That explicit limitation is acceptable for the
bounded local implementation, not a pilot-readiness claim. A later durable
transport decision remains separate from implementing the safe P2 seam.
An orphaned `respuestaAclaracion` without a token is a malformed HTTP request;
it returns 400 before planning. An offered task choice stores exact task IDs.
Its intersection with the original selector cannot turn an empty selection into
an unrestricted population. Accepted ambiguity decisions belong to the pending
plan; a fresh planner turn cannot silently reuse them.

## Verification sequence and limits

1. Backend unit tests exercise new source/type/executor/renderer boundaries and
   all preserved ratio/date calculations.
2. Independent QA uses fresh literal table arithmetic or synthetic SQL, then
   mutates entity, unit, date basis, set, qualifier, unsupported number, missing
   obligation and unknown-to-empty disposition, with passing positive controls.
3. QA invokes the actual changed HTTP handler with scripted LLM output and the
   existing synthetic PGlite RLS harness. Cover active Gerencia, denied roles,
   inactive/profileless users, invalid synthetic JWT, caller changes, token
   tampering/expiry, forged history, fixed columns and network denial.
4. Main reruns these checks, existing focused labor suites, read-only P1 hash
   preservation checks, typecheck and scoped lint. Broaden checks once when
   integration is stable. Do not run the P1 experiment runners: they write the
   preserved `qa/results.json` and `qa/rls-results.json` and assert old baseline
   defects that P2 is repairing.

Reproducible existing commands from the repository root:

```sh
npm test -- src/__tests__/esco2P2Backend.test.ts src/__tests__/esco2P2Integration.test.ts src/__tests__/esco2P2Source.test.ts src/__tests__/esco2P2Security.test.ts src/__tests__/esco2P2Mutation.test.ts
npm test -- src/__tests__/esco2Nucleo.test.ts src/__tests__/esco2M3Planificador.test.ts src/__tests__/esco2M4Labores.test.ts src/__tests__/esco2LaborReview.test.ts src/__tests__/esco2EscoConsultas.test.ts
npm run typecheck
./node_modules/.bin/eslint src/utils/esco2 supabase/functions/esco-consultas
```

The P2 result report records final test counts, commands and read-only SHA-256
preservation results after main verification. P1's frozen files and generated
results remain untouched; new P2 tests have separate versioned paths. Do not run
`scripts/esco2/e2e-local.ts`: it calls a paid provider.
Local scripted checks do not prove natural-language planning, real JWT
cryptography, live source completeness, consistent concurrent reads, browser UX,
five-domain acceptance or deployment readiness. Stop at the P2 result and its
precise remaining source/transport decisions.

The eight copied-result mutation controls measure independent QA oracle
sensitivity. They do not establish a runtime validator accepting and rejecting
arbitrary result payloads; the HTTP API accepts no such payload. Runtime attacks
against the closed planner and deterministic publication path are separate
checks. A structurally valid but wrongly selected intent remains a later
language/acceptance concern.
