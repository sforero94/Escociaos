# Correction-audit storage and remaining lifecycle inventory

The nonnumbered correction-audit-integrity.sql follows all13 coordinated candidates through clinical-update-retirement.sql. It protects prospective storage in hato_correcciones/globalgap_correcciones. It does not certify historical entries, add missing historical audit or authorize production application.

The current private metadata replay exposed service-role INSERT/UPDATE/DELETE on both correction tables; rolled-back synthetic probes reproduce those rights. The refreshed805-file lifecycle inventory finds53literal mutation sites and10dynamic sites, including mirrors. No application writes either correction table directly. Existing legitimate correction writers are the two postgres-owned definer triggers, attached to14reviewed source tables. Direct clinical header/step writes and old177 remain retired. Alert response/manual edit/bulk closure/cron, event edit/delete/creation, animal edit/reactivation/sale/death and photo/milk writers remain separate work.

Admission pins the exact two audit relation metadata fingerprints, source function body hashes/owner/search_path/definer mode and all14source trigger bindings. Installation locks the audited source tables and audit tables. All ordinary/service table/column mutation/maintenance grants and source trigger-function EXECUTE are revoked. Existing SELECT grants and audit rows are preserved. New invoker guards accept only nested postgres-trigger INSERTs; direct service/owner INSERT, UPDATE, DELETE and TRUNCATE refuse. No production data or private definition is copied.

Plan deletion previously rejected every trigger on globalgap_correcciones. The exact repository-owned assert_graph function is pinned and adapted to require the complete reviewed audit guard/grant boundary, while preserving its request-trigger and all reference/policy/retention checks. Extra, disabled or changed audit guards refuse; no name-only exception is introduced.

Native evidence is correction-audit-replay.json. The runner co-installs all preceding candidates, proves prior service bypass only in rolled-back synthetic transactions, tests admission drift/catalog rollback, then runs all31combined mutations with the audit candidate installed. It checks effective writer denials, actual three-role DML/TRUNCATE refusals, preserved trusted human actor/before/after correction rows, immutable proof, restored-grant refusal, plan compatibility/drift and late audit failure with full domain/control/audit rollback. Source hashes and private database cleanup are checked. Validation totals and logs are recorded in execution-status.md.

Reproduce with the existing pinned local runtime/client:

```sh
python3 scripts/security/correction-audit-replay.py /workspace/escociaos-security-control/schema-evidence --runtime /tmp/escocia-pg17-runtime/package/native --client /tmp/escocia-pg-client/node_modules/pg/lib/index.js --output docs/security-integrity/correction-audit-replay.json --private-diagnostics /tmp/escocia-correction-audit-final-private-diagnostics
```

The legacy correction functions deliberately skip service writes with NULL UID; a rolled-back local source UPDATE remains an explicit counterexample. Storage immutability does not make those writes audited, protect every lifecycle CAS/retry or certify every source-trigger suppression case. Their prospective trusted source readbacks/caller cutover remain open. logs_auditoria, inactive/missing-profile readers, ordinary-role/runtime/global reachability, retention/capacity and real recovery also remain open. Backup063 provenance remains unknown. No production query/change, historical/expense repair, merge/deployment/live migration or usage-limit bypass occurred.
