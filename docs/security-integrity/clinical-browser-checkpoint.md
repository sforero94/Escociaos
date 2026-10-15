# Prepared browser clinical step confirmation

AlertasView now prepares a clinical confirmation before showing a separate target/date preview and explicit post action. The legacy alert hook refuses clinical “sí” before any alert claim; nonclinical claims bind the loaded alert type. Dates use Bogotá time. Only a strictly validated committed receipt causes the clinical success reload.

The protocol receiver checks exact result/actor/intent/control shapes, original animal/header/sibling steps/alerts, selected step changes, header completion, untouched fields and server-recorded alert timestamps (including microseconds). Nullable legacy creation fields remain nullable; no provenance is invented. Native private-action receiver helpers are tested, but actual Telegram caller integration is still pending.

The browser persists an owner-bound UUID and intent before prepare, serializes tabs with Web Locks, and rechecks the authenticated owner before and after RPC. Prepare never posts. Post requires the reviewed original; replacement tab attempts, corrupt storage, unavailable locking/storage and owner changes fail closed. Lost responses retain the original key. Independent status recovery and cancellation use that same durable attempt; only an explicitly acknowledged terminal attempt may be cleared. Closing the dialog preserves recovery.

## Validation

Five new application test files add56cases covering the protocol, persistence/concurrency/owner boundaries, actual hook/dialog, actual alert view callback and legacy-hook refusal. Full application suite:255files/5,319tests PASS. Lint PASS (0errors/876existing warnings), typecheck PASS,29Python tests PASS; Node syntax and diff whitespace checks PASS. Logs: /tmp/escocia-clinical-web-tests-final.log, /tmp/escocia-clinical-web-lint-final.log, /tmp/escocia-clinical-web-typecheck-verified.log, /tmp/escocia-clinical-web-python.log.

clinical-browser-native-replay.json records33aggregate assertions (31combined base mutations plus two SDK scenarios) and12nested SDK assertions. The actual installed Supabase SDK and current browser protocol/attempt sources call a private local PG17.6 replay through mocked HTTP transport and synthetic Auth. One scenario commits natively, drops the post response, recovers the same receipt and independently checks audit/domain rows. Another changes the session owner after SDK builder creation and proves native refusal with complete domain/control/audit state unchanged. Source digests match the current files; temporary database shutdown/removal is verified. This does not certify hosted JWT verification or deployed clients.

Reproduce using the existing pinned local runtime/client:

```sh
python3 scripts/security/clinical-browser-native-replay.py /workspace/escociaos-security-control/schema-evidence --runtime /tmp/escocia-pg17-runtime/package/native --client /tmp/escocia-pg-client/node_modules/pg/lib/index.js --output docs/security-integrity/clinical-browser-native-replay.json --private-diagnostics /tmp/escocia-clinical-browser-private-diagnostics
```

Only the four authorized local private metadata exports are read; none are published. Telegram alert/native-conversation caller cutover, direct clinical UPDATE/old177 retirement, other clinical/alert lifecycle writers, inactive/missing-profile readers and ordinary-role/runtime/global writer review remain open. No production access, merge, deployment or live migration was performed.
