# Combined schema rehearsal checkpoint — October 13

Preparation only; candidates remain unapplied. All input is owner-provided local structure-only evidence outside git. No production connection, query, domain rows or secrets were used.

The patched supplement closes the three minimum preflight omissions. All2,041base-table columns join without overlapping structural conflicts; sequence configuration and32role privilege records/22membership records are present. Input digests and the exporter no-change attestation are recorded in combined-schema-preflight.json. Migration-tip equality alone cannot rule out manual DDL.

## Local installation probes

combined-schema-gate-rehearsal.json records actual PostgreSQL17.6 entry-gate execution on an empty temporary structural projection. The runner loads the observed11target column/type layouts, public enums, target RLS flags,15user trigger definitions and their captured functions, plus the purchase expense FK and referenced purchase PK. Captured functions are created with body checks disabled and never invoked. Other constraints/defaults/indexes/policies, effective role inheritance and external Auth/Storage are outside this projection. No candidate protected schema or mutation protocol executes.

| Candidate | Selected entry-gate result | Meaning |
|---|---|---|
| Purchase | Passed projected numeric/FK gate | Does not certify posting/reversal or retained-expense behavior on the complete graph |
| Manual stock | Passed projected enum/numeric gate | Does not certify mutations, permissions or competing writers |
| Product catalog | Refused current user triggers | Actual baseline has three product triggers; zero-trigger admission is incompatible |
| CSV opening stock | Refused current user triggers | Same product trigger conflict |
| Treatment creation | Refused target/identity triggers | Animal correction and Telegram timestamp triggers violate the historical zero-trigger gate |

For each refusing candidate, the unmodified trigger gate also refuses independently. A positive control removes triggers only inside a transaction in the empty local database, passes that isolated gate and rolls back. All15trigger identities are restored afterward. No production trigger was changed and these controls are not proposed release steps. The full treatment fingerprint gate remains unevaluated after its earlier trigger refusal.

The local runtime has no TCP listener and a0700temporary Unix socket. The transport specifies that socket, database/user and empty password explicitly, without database environment selectors. PostgreSQL17.6/binary digest is recorded; runtime distribution provenance remains the verified cached embedded-postgres17.6 artifact documented in the treatment checkpoint. Server stop and temporary database/socket removal were verified. This is local transport containment, not network-namespace isolation or a backup restore certificate.

Reproduce using the already verified temporary runtime/client paths:

```sh
python3 scripts/security/combined-schema-gate-rehearsal.py \
  /workspace/escociaos-security-control/schema-evidence \
  --runtime /tmp/escocia-pg17-runtime/package/native \
  --client /tmp/escocia-pg-client/node_modules/pg/lib/index.js \
  --output docs/security-integrity/combined-schema-gate-rehearsal.json
python3 -m unittest discover -s scripts/security/tests
```

## Remaining admission work

Preserve the failing gates until the observed triggers and dependencies have a reviewed compatible contract. Do not simply whitelist names, suppress triggers, substitute a new fingerprint or retire direct grants before all writers/callers participate. Current application/closure/deletion/Ronda/Hato-undo/financial/audit behavior still requires the complete combined installation and adversarial mutation rehearsal.

The authorized21:24:24CT addendum resolves the index-state, constraint-flag and rewrite-rule omissions. All357index identities/definitions and510constraint identities/types reconcile; the rule inventory is explicitly empty. This and rolbypassrls are resolved and must not be re-requested. Reconciliation72481e7 is pushed.

The existing SECURITY DEFINER expense-cleanup function remains a separately identified legacy writer; its candidate retirement is unapplied. No historical repair, expense deletion, merge, deploy, live migration, settings/jobs or keys operation occurred.

## Full domain catalog replay — October 14 continuation

`schema-replay.py` replaces the narrow projection for further combined work. Four external input digests bind `combined-schema-replay.json`. It reconstructs170public/respaldos tables with2,026columns,508constraints,353indexes,78triggers,314policies,72functions,7views and23enums, plus32role flags/22memberships and249object/3column/2schema/6default-ACL checks. The sole telemetry identity table public.clima_lecturas is explicitly excluded: identity generation mode is not exported and that table is outside these stock/cattle/financial/audit protocols. No claim of a complete platform clone is made.

Exported properties are verified before installation probes. Active column positions preserve observed dropped-column gaps using temporary placeholders that are dropped before constraints/triggers are installed. PostgreSQL literally parses each exported constraint DDL; the initial canonical form is captured before probes and binds subsequent constraint drift checks (two source cast/array renderings canonicalize). Supplemental per-key index display labels differ in two cases; complete CREATE INDEX text, expressions, predicates, key/include counts and every state flag remain strict. These representation differences are counted in the report rather than silently described as byte equality. Function bodies/owner/config/volatility/definer state, view definitions/options, enums, RLS, trigger state/definitions and semantic grants/options/grantors are checked too.

The disposable cluster uses supabase_admin as bootstrap identity because PostgreSQL17 records superuser role grants under that identity; this preserves the exported membership grantors. After reconstruction postgres is restored to its actual exported non-superuser attributes, not left as a test superuser. Auth.users/id and uid/role/jwt are explicit synthetic helpers, and uuid-ossp comes from the cached local distribution. Hosted Auth/Storage, extension version parity, event triggers, sequence ownership/state, telemetry and restore containment are not certified. No production rows, jobs, passwords or external connections are loaded. Private diagnostics, if needed, are0600files under /tmp; generated private SQL never enters git.

Seven adversarial catalog changes (numeric precision, trigger state, index removal, RLS, function body, grant option and expense FK removal) are detected. Each exists only inside local rolled-back transactions; a fresh parity check confirms restoration. Nine complete candidate sources are attempted independently with only their outer transaction wrapper replaced by a rolled-back local transaction. Purchase, manual, closure, Ronda and Hato undo install in isolation; catalog/CSV reject product triggers, plan deletion rejects the purchase-plan policy/grant baseline, treatment rejects animal/identity triggers. Passing isolated DDL is not mutation or concurrency evidence.

The ordered coordinated package refuses at catalog's current-trigger gate. Connection termination rolls back the failed transaction; the harness verifies complete base-schema parity, zero remaining protected schemas and zero domain rows. Full protocol mutations and concurrent stock/cattle/financial/audit verification remain **unadmitted**, not passed. Candidate gates and implementations are unchanged by this replay unit. Next implementation front must review exact observed trigger/dependency contracts and update compatible candidates with drift/atomicity proofs; never suppress triggers or skip the installation checks to obtain a passing run.

Private-source product-trigger review identifies two invoker timestamp triggers using the same body (body MD5 `06bcf30ac3d0a7f279a54cbf228a7bec`) and one invoker updated-by trigger (body MD5 `624e45577efa9efef341d0c7549201c5`). The actor helper uses trusted auth.uid() before the existing updated_by fallback; the three helpers contain no ordinary static domain DML. Catalog/CSV already set explicit trusted actor/current transaction timestamps, but compatibility still needs exact trigger/function/config/grant binding plus actual mutation/readback tests. A name-only allowlist or removal of the zero-trigger check is insufficient. Animal correction, Telegram timestamp and purchase-plan policy/grant incompatibilities remain separate review contracts.

Reproduce using the cached paths above:

```sh
python3 scripts/security/schema-replay.py \
  /workspace/escociaos-security-control/schema-evidence \
  --runtime /tmp/escocia-pg17-runtime/package/native \
  --client /tmp/escocia-pg-client/node_modules/pg/lib/index.js \
  --private-diagnostics /tmp/escocia-schema-replay-diagnostics-private.txt \
  --output docs/security-integrity/combined-schema-replay.json
```

October14 dependency reconciliation: product/CSV1840649, plan deletiond3044b3 and the reviewed treatment baseline supersede the three refusal checkpoints above. The current full report passes all nine isolated candidate installs and the ordered coordinated package, then restores full exported-property parity, zero candidate schemas and zero domain rows. Gates remain exact and observed triggers remain enabled. This report admits the next combined mutation/adversarial rehearsal; it does not itself execute protocol mutations or certify global writer retirement. Treatment-native proofs are separate in treatment-trigger-replay.json.
