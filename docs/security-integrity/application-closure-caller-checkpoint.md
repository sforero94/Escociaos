# SI13 caller protocol — incremental design checkpoint

Ownership: `src/components/aplicaciones/CierreAplicacion.tsx`, new `src/utils/applicationClosureIntegrity.ts`, new associated SDK/React tests, `src/sql/security-candidates/application-closure.sql`, `scripts/security/application-closure-postgres.py`, and this checkpoint. Root approved extending the candidate. Purchase/manual workers own separate callers/protocols. Existing calculation utility, labor helper, types, hooks and numbered migrations remain outside this slice.

## Reviewed contract

- `fn_application_closure_snapshot(p_aplicacion_id uuid)` returns `{aplicacion_id, expected}`. `expected` is an opaque JSON object of actual persisted, deterministically ordered source rows: application, linked task, scoped work/daily movements/products, linked lots/tree counts, relevant products/prices/stock, worker rates and planned rows read for review. Caller financial totals are not authoritative versions. The snapshot brackets the current UI reads; unequal before/after snapshots refuse the mixed load. Restored drafts retain their original `expected`, never adopt a fresh one.
- `fn_application_close(p_request_key uuid, p_payload jsonb, p_expected jsonb)` returns `{request_key, receipt}`. Receipt has the legacy application/closure IDs and actual work/product counters. Current authenticated active Administrador/Gerencia is derived server-side. The stable key binds the exact expected snapshot and payload to that actor. A completed identical replay returns the stored receipt only after fresh authorization; changed expected/payload or a cancelled key refuses. Original-source CAS precedes writes and transactions bind business state to the receipt.
- `fn_application_closure_status(p_request_key uuid, p_payload jsonb, p_expected jsonb)` returns either `{state:"committed", request_key, receipt}` or `{state:"cancelled", request_key}`. It serializes on the identical actor/key advisory lock. An absent request is durably fenced as cancelled; a delayed close with that key cannot post later. It never resubmits. Exact originals are required. Unknown/malformed/error results retain browser evidence and edits.

Root chose a **whole security-definer wrapper with explicit live policy-equivalent authorization**, rather than public lifecycle helpers capable of minting receipts. It will retire ordinary/service execution on the old unversioned closure RPC. This deliberately changes the privileged boundary and must not be described as invoker RLS enforcement. Installation must fail on captured policy/grant/prerequisite drift. The implemented boundary compares the captured fifteen-table policy set, actual authenticated grants, RLS state and active-role helper. The sole optional addition is the exact reviewed restrictive `productos.active_account_required` policy. Other drift refuses installation or runtime admission. Captured private catalogs remain excluded from commits.

Deterministic, bounded `SHARE ROW EXCLUSIVE` table locks over the dependency set are implemented for complete source/set CAS, including inserted/deleted children. Their farm-wide write serialization and lock timeout require release rehearsal. The definitive snapshot reads one consistent SQL snapshot. Private request/receipt rows are prospective closure proofs; retention/cleanup is a release gate separate from the seven-day memory-confirmation decision. No universal retention is inferred.

Browser attempts are saved under owner/application-scoped storage and Web Locks before RPC with immutable actor/key/expected/payload. Unknown outcomes retain those originals without changing key. Explicit resolution can recover a committed receipt or cancelled-key fence; new edits are never represented as the committed original. Account changes invalidate in-flight success paths. Drafts store the original snapshot alongside edits. No legacy/direct write fallback is allowed if the new RPCs are unavailable.

Earlier 84-assertion PostgreSQL evidence covered only the pre-extension candidate. Current certification follows below. No production action is authorized by this local checkpoint.


## October 12 finish checkpoint

The final owned scope includes the SQL candidate, synthetic harness, caller, protocol utility, two SDK/React tests, SI13 issue and this checkpoint. The public protocol uses whole SECURITY DEFINER with explicit captured-policy equivalence; internal legacy execution is retired for ordinary/service users. Caller work enrichment errors fail closed; TypeScript narrowing and its SDK fixture were corrected. Exact original snapshot CAS, actor/key/payload/expected receipt replay, cancelled-key fencing and fresh active admission are covered. The actual React caller durably saves later unsent edits after an earlier original commits.

Final current-source verification:

- `APPLICATION_CLOSURE_PROTOCOL_ONLY=1 python scripts/security/application-closure-postgres.py`: exit 0; **56 synthetic assertions plus cleanup (57 total)**. Log: `/tmp/application-closure-protocol-current-oct12.log`. Includes active Gerencia, nullable profile refusal, permissive policy lookalike refusal and exact private application binding rewrite rollback.
- `python scripts/security/application-closure-postgres.py`: exit 0; **137 synthetic assertions plus cleanup (138 total)**. Log: `/tmp/application-closure-postgres-final-oct12.log`. This broader run preceded the final private application-ID binding checks; the current protocol-only run above certifies that subsequent SQL change. The legacy validation/persistence body did not change between these runs. These are distinct scopes, not a claim of a final 138-assertion full run.
- `npx vitest run src/__tests__/applicationClosureIntegrity.test.ts src/__tests__/CierreAplicacionIntegrity.test.tsx`: exit 0; **26 tests in 2 files**. Log: `/tmp/application-closure-sdk-react-final-oct12.log`.
- `npm run typecheck`: exit 0. Log: `/tmp/application-closure-typecheck-final-oct12.log`. Root owns subsequent whole-tree integration verification after all slices hand back.
- `python -m py_compile scripts/security/application-closure-postgres.py` and owned-file `git diff --check`: exit 0.

The final private-proof checks verify persisted actor/key/application/payload/expected and receipt/actual binding on INSERT/UPDATE. All checks ran locally. No production SQL, merge, deployment, spend, alert or external metadata export occurred. SQL remains unapplied; private catalogs remain outside commits. All owned paths are returned to root for release-graph review; no workers or owned test processes remain.

Reviewed final source SHA256 values:


- `src/sql/security-candidates/application-closure.sql`: `3f7e70019660aab40715c6572c556f6956163d1c05e81f4f7ef0a13ca6a677bf`.
- `scripts/security/application-closure-postgres.py`: `848fff937ab054352b2d976f20bb100a1e03647b297abc261c2fb2fe8bf17b2b`.
- `src/components/aplicaciones/CierreAplicacion.tsx`: `325d003086df81abde7bb7b7737e3ebb87ac57d32c86488c028c897896380010`.
- `src/utils/applicationClosureIntegrity.ts`: `5e238a0194922ce5f294733c1ef571a530b1410bc01f5b2a8868c9d480c59fc6`.
- `src/__tests__/applicationClosureIntegrity.test.ts`: `3d64a17a2395cb0d6d01fe6e56f8503a3a360b89f72b5dec2e94e104d9b216d5`.
- `src/__tests__/CierreAplicacionIntegrity.test.tsx`: `09a1718765a4cf0d7d6ffe9653276da388e3f8439d5749c968eddb2234306cda`.
- `docs/security-integrity/issues/SI-13-application-closure-candidate.md`: `09c261c188c3614b8a9f57b71f467eb8266d71ae415d697aee082826e036108c`.
