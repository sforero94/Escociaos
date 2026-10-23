# Owner decisions

Owner submitted 1A, 2B, 3A, 4A, 5C, 6A, 7A, 8A, 9B, Sunday 6pm. Saved interpretation from the October 9 checkpoint:

- Autonomous local fixes, tests, reviewable PRs and prepared releases. Ask before merge, deploy, live migrations/settings/jobs or other production changes. Preferred orchestrator/workers GPT-6.1 Sol medium. No usage-limit bypass.
- Preserve all expenses linked to reversed purchases for management review. No silent expense deletion or historical repair.
- Private and group Esco permitted subject to sensitive-output limits and user isolation. A group receives no permission to read a member's private history or financial information.
- Hato undo: fresh linked active Gerencia only.
- Backup key location unknown. Investigate existing protected copy; never invent, expose or rotate a key. GitHub secret metadata cannot reveal value.
- Recovery: <=24h lost work; operational by 08:00 America/Bogota next working day Monday–Saturday. No holiday exceptions inferred.
- Isolated restore allowed only with verified isolation, zero additional spend, protected credentials and cleanup. Current workspace is the proposed destination; isolation is not certified.
- Invoice acceptance JPG/PNG/GIF/PDF <=5MiB. Monitoring photos follow existing authorized record readers.
- Maintenance <=30min, preferred Sunday18:00–18:30 America/Bogota. Planning, not deployment approval.
- Test alerts only to owner. Confirmed exposed credential rotation still requires coordinated approval.
- Memory confirmation receipts:7days; not universal retention.
- Overnight hourly automation ended Oct8 at09:00 America/New_York and must remain expired. Later direct work remains authorized.

October14 clarification from Santiago: an otherwise eligible unused live application plan may be deleted when any of the five historical `respaldos` copies (063/107/118/119/150) reference its `aplicacion_id`. Preserve every backup row and its original identifier unchanged as historical reference. This exemption does not authorize any backup mutation or exempt a live FK. Backup063 provenance was not provided and remains **unknown**.

October15 clarification from Santiago (Option1): a new manual Hato alert of type `tratamiento_paso` must select an existing pending clinical step for the selected animal. Answering Sí executes that step through the prepared clinical confirmation protocol. Existing unlinked alerts stay unchanged; no historical rewrite or inferred execution is authorized.


October16 clarification from Santiago (Option1): Estado is read-only in the general Editar animal dialog. Real state changes use only the dedicated sale, death and reactivation flows. Historical state corrections require separate review with Santiago. No history rewrite, invented income or invented events is authorized. The general editor must omit estado from its write payload, including stale or extra runtime fields. Remaining database writer retirement and general-edit CAS/retry/audit remain separate required gates.

October16 clarification from Santiago (10:53 ET, Option1, `hato_quick_event_selected_pajilla_failure_policy`): a Telegram insemination with an explicitly selected pajilla lot commits its clinical event and pajilla usage all-or-nothing. A known usage/link failure rolls back both; the user can review and retry the same original action. Zero/negative stock is warning-only. Historical events/usages stay unchanged; no inferred historical association or repair is authorized. Unknown outcomes require recovery of the original action, never automatic replacement.


October17 clarification from Santiago (Option1, `hato_chequeo_linked_birth_replacement_policy`): on chequeo reapproval, an existing linked birth with identical birth facts keeps its original event UUID and `cria_id`; only its association to the replacement chequeo detail may change. If that linked birth changes or is missing, refuse the entire replacement for separate review with Santiago. Never delete, detach or recreate calves; no invented historical provenance or repair.


October19 clarification from Santiago (08:38 ET, Option1, `hato_upload_discard_raw_retention_policy`): protected upload discard retains original raw photos, capture and immutable proof as history and records disposition separately in trusted audit. Atomically remove only milk rows newly inserted by that unique protected upload and still unchanged. Legacy/ambiguous/changed rows, preexisting updates and unknown outcomes are never discarded. No physical Storage/capture deletion, inferred provenance or historical repair.

October20 clarification from Santiago (Option1, `financial_measured_quincena_correction_policy`): for income linked to a measured Hato milk quincena, corrections to date, business/category, description, region, payment, buyer, liters and money use ONLY the prepared Produccion flow, explicitly showing gross, ICA and net. Finanzas may edit only observations and invoice data through a protected path. Original receipts and shared derived monthly history/links stay intact; no inferred gross, historical rewrite or silent financial deletion.

October23 clarification from Santiago (07:16 ET, Option2, `financial_sale_income_correction_routing`): for income created by the protected Hato sale flow and linked to its sale event and animal, Finanzas may correct date, business/category, description, region, payment, buyer and money through a protected operation that also reviews the linked sale, event and animal source. Original receipts, audits and history stay intact. This does not authorize deleting anything, changing an animal's state, inferring provenance or repairing history.

October23 clarification from Santiago (10:07 ET, Option b, `financial_sale_correction_replay_timeout_2`): the local per-query deadline may be raised from 60s for this sale-correction/inherited measured-income replay ONLY, run strictly serially after checking load/memory, recording the new deadline and measured timings. The 60s deadline stays for everything else; no production access. If it still fails or hangs, stop with a new question; no retry loops.

Implementation of the10:07ET exception: this replay uses a120-second local SQL-client deadline (formerly60s), with per-call measured timing records. The override lives in its external launcher only and is restricted to the local-postgres-query.mjs command for this replay; the tracked shared runner and all other tests/production are unchanged.

October23 clarification from Santiago (11:10 ET, `financial_sale_correction_120s_executor_hang`): the box is healthy; one fresh strictly serial attempt of the sale-correction (Option 2) replay is authorized with the 120s per-SQL-call deadline for this replay only, after a load/memory check. No further deadline increase, no retry loops; if it hangs again, record timings and stop with a new question. No production access.
