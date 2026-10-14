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

The evidence also lacks explicit index validity/readiness/live/immediacy flags, constraint validation/deferral flags and a user rewrite-rule inventory. Current gates inspect these catalog properties (including immediate valid Telegram/profile indexes, convalidated fingerprints and unsupported rewrite rules); textual CREATE INDEX/constraint/view definitions do not establish the full current catalog state. An exact replay must not invent these flags or assume no rules. Request only a private structure-only addendum for those properties, tied to the existing evidence and any intervening schema changes. rolbypassrls is resolved and must not be re-requested.

The existing SECURITY DEFINER expense-cleanup function remains a separately identified legacy writer; its candidate retirement is unapplied. No historical repair, expense deletion, merge, deploy, live migration, settings/jobs or keys operation occurred.
