# Remaining lifecycle writers after15 coordinated candidates

This diagnostic unit installs all15 current candidates before the combined mutation fixtures. It changes no application/SQL protocol. lifecycle-writer-replay.json records39native assertions: all31combined mutations, six rolled-back counterexamples, and two existing relationship/uniqueness guards. Source hashes and private-socket database cleanup are verified.

The remaining counterexamples are:

- Direct clinical alert UPDATE can mark a pending step's alert confirmed with a supplied attribution string, while the step remains pending and no clinical confirmation audit is created. The prepared application caller does not authorize this bypass.
- Secado alert claim can commit without its separate domain event.
- Death event INSERT can commit while the animal remains active.
- Human event INSERT accepts supplied created_by for another existing account.
- Sequential stale animal edits overwrite a newer value without an observed-original CAS. Human correction audit faithfully records both changes but does not prevent the lost update.
- NULL-UID service animal UPDATE still skips legacy correction audit.

Each witness uses synthetic rows inside an explicitly rolled-back local transaction; complete public/respaldos/protected/clinical request and audit state is compared afterward. No production incident, private domain data or historical provenance is inferred. This is a sequential stale-editor reproduction, not a newly observed competing-lock race.

Positive controls matter: hato_eventos_manual_unico rejects the exact duplicate event tuple, and the live treatment-to-animal FK blocks parent deletion. Both failures preserve the entire graph. The unique index does not itself supply actor-bound immutable request receipts or response-loss recovery; no duplicate-posting finding is claimed for the exact tuple.

## Next implementation contracts

1. Close phantom clinical alert confirmation without breaking negative responses, cron notification/escalation and closure of already executed legacy steps. Require a matching executed step/animal for prospective confirmed clinical alert writes; retain existing rows without repair. Rehearse all15 protocols plus actual browser/native confirmations and legacy cron-shaped updates.
2. Replace remaining alert response/manual/bulk and secado split effects with trusted current actor, original-row CAS, one transaction and durable original-key/native-action recovery before retiring their direct writers. Human review must identify the captured target/date.
3. Coordinate event creation/correction and sale/death/animal state, offspring and optional stock/financial associations. Preserve every already-posted financial record/expense; never retry by inventing a new key after uncertainty. Current direct actor fields and service attribution require trusted protocols, not invented profile linkage.
4. Give animal edits/reactivation observed-original CAS and exact transactional before/after proof; retain valid nullable/genealogy/provisional-number rules and actual uniqueness/FK constraints. Then retire remaining incompatible direct writers together.
5. Continue inactive/missing-profile ordinary readers, exposed functions, runtime/global writer coverage and recovery acceptance. No broad clinical/global closure is claimed here.

Full256files/5,338App cases PASS65.90s with maxWorkers=2; lint0errors/876existing warnings, typecheck and29Python checks PASS. Logs /tmp/escocia-lifecycle-{native,tests,lint,typecheck,python}.log. No assertion/deadline/committed runner configuration changed.

```sh
python3 scripts/security/lifecycle-writer-replay.py /workspace/escociaos-security-control/schema-evidence --runtime /tmp/escocia-pg17-runtime/package/native --client /tmp/escocia-pg-client/node_modules/pg/lib/index.js --output docs/security-integrity/lifecycle-writer-replay.json --private-diagnostics /tmp/escocia-lifecycle-private-diagnostics
```

Four private metadata exports remain external. No production query/change, merge/deploy/live migration, private publication, historical/expense repair or usage-limit bypass.
