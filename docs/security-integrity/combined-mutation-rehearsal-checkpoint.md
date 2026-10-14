# Combined local mutation rehearsal — October14

All nine candidate sources are installed in one transaction on the verified public/respaldos replay before synthetic users or domain rows are added. This extends the DDL-only report; no production connection, rows, credentials or jobs are used. The same four private exports are read externally, and only hashes/derived outcomes are published. `combined-mutation-replay.json` binds each candidate and the runner source. The pinned local PG17.6 transport has no TCP listener and the temporary database/socket are stopped and removed.

`scripts/security/combined-mutation-replay.py` passes31assertions. Complete exported-property parity is checked before installation. Atomic-refusal and retry checks compare every public/respaldos table and every candidate's protected tables, including tables outside the protocol under test. They do not merely count the target rows.

- Catalog opening, manual entry and purchase posting operate on the same product with the captured actor/timestamp triggers enabled. Concurrent manual/purchase posting serializes without lost stock; a previously observed stock revision refuses afterward.
- Purchase reversal preserves both pending and confirmed expenses with every field unchanged except the FK detachment and trusted update stamps. Both durable associations survive. A late association CHECK failure rolls back purchase, stock, ledger, expenses and all protected proofs. The retired legacy cleanup refuses ordinary invocation.
- Trusted service-parser registration precedes human CSV posting; the exact opening and trusted actor are independently read from the database. Original-key retry changes no combined state.
- Application closure uses actual daily source quantities, current price and generated lot-tree totals, with no fabricated work. A late receipt CHECK failure rolls back the complete combined state; positive closure debits shared stock once, records the expected source costs, and retries without mutation. Closed execution and the committed closure proof prevent unused-plan deletion.
- Ronda adjustment supplies all actual required reporting/decision/provenance fields and respects its real CHECK/FK constraints. It posts once to the same product and replays the original exception proof without altering the prior ledger.
- A separate unused pre-linked plan is deleted while matching synthetic rows in all five owner-authorized historical copies retain every field and the original application ID. Backup063 provenance remains unknown. Neither live references nor real backup data are altered.
- A prospective Telegram treatment is created through the native action slot, then reviewed/delivered/confirmed for undo by a linked active Gerencia. Direct invocation of the retired undo core refuses. The exact header and pending step disappear through the compatible review API; immutable creation and undo receipts both recover without recreating clinical rows. Revoked Gerencia cannot disclose/replay them.

Fixture construction preserves actual constraints and generated columns. `lotes.total_arboles` is generated from four tree-count inputs; the harness supplies those inputs. Daily product rows supply the required category as well as the product label. Initial trials exposed these narrower-fixture assumptions and the retired raw undo API; the final successful report uses the current graph and actual review API without weakening either boundary. No captured private definition or row was copied into the repository.

The separate auto-task finding remains: when no existing `Aplicación Fitosanitaria` task type is available, the captured function's creation branch uses categoria_tarea literal `Aplicaciones`, absent from the captured enum. A schema-only export does not establish whether a live task-type row exists. This rehearsal uses valid pre-linked tasks with every trigger enabled and does not certify that fallback branch or repair existing types/tasks.

Fresh lint PASS (876existing warnings), typecheck PASS,250application test files/5,263cases PASS42.75s and29Python cases PASS. Logs: `/tmp/escocia-combined-mutation{,-lint,-typecheck,-tests,-python-tests}.log`. No merge, deploy, live migration, production query, expense deletion, historical repair, private input publication, key or settings operation occurred.

Next: extend source/edit and competing-writer races, ordinary-role/function reachability and direct-grant retirement across the release graph. Selected co-installed mutations and one shared-stock race are not an exhaustive concurrency, authorization, capacity, hosted Auth/Storage/runtime or recovery certificate. Legacy treatment RPC and broad direct DML remain release blockers. No numbered migrations or release approval are prepared by this unit.

Reproduce locally:

```sh
python3 scripts/security/combined-mutation-replay.py \
  /workspace/escociaos-security-control/schema-evidence \
  --runtime /tmp/escocia-pg17-runtime/package/native \
  --client /tmp/escocia-pg-client/node_modules/pg/lib/index.js \
  --private-diagnostics /tmp/escocia-combined-mutation-diagnostics-private.txt \
  --output docs/security-integrity/combined-mutation-replay.json
```
