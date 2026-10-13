# Recovery acceptance

RPO<=24h coherent farm/financial/conversation history; operational by08:00 America/Bogota next working dayMon-Sat. Working window Sunday18:00–18:30, only after concrete production approval; no fabricated holiday or deadline.

Historical read-only evidence: encrypted daily GitHub Actions workflow in private thinksid/escocia-backups references BACKUP_PASSPHRASE. Secret metadata July22 only confirms configuration; GitHub cannot retrieve value. Setup says protected password-manager copy. Provider question remains unanswered; do not request secret in chat, invent a key or rotate. Existing RESTORE.md already specifies PBKDF2 iter200000; previous missing-iteration hypothesis was withdrawn and its empty task branch removed. No source fix required there.

Before production data enters local test environment: verify no network/ports/integration jobs, encrypted private inputs, restricted data access and zero additional spend. Backups include database AND Storage; verify coherent recovery point, schema/Auth dependency handling, row/object reconciliation and account permissions. Run timed restore with protected existing key, disable outbound endpoints/alerts, confirm normal operational workflows and clean test copy/container/archive/key on failure and success. Avoid logs containing personal/financial contents.

No actual production restore or current isolation certification has occurred. Synthetic database tests use generated data only and are not recovery certification.


October10 current-source verification: the actual historical repository thinksid/escocia-backups is accessible read-only via git; HEAD302761112b396ca6fa29611fc4767525d0184228 (September26). A filtered/no-checkout clone at /workspace/.escocia-backup-review fetched only code metadata; tree has seven workflow/script/documentation files, no encrypted backup artifacts. Workflow and RESTORE source were materialized privately under backup-source-private. The owner's approximate name sforero94/escociaos-backups was not the actual repository; its ls-remote failure is not evidence of absent backups or unavailable actual repo.

Current code still schedules06:00UTC daily; schema/data/roles are separate dump invocations and Storage is copied later, with no shared exported snapshot apparent in workflow. Coherence/Auth/Storage scope must be verified against actual pinned CLI behavior and an artifact; source comments are not certification. Current RESTORE command lacks psql ON_ERROR_STOP, so SQL errors may leave partial restoration without shell failure; fail-closed rehearsal procedure required. Existing -iter200000 is present in encryption, verification and documented decryption; no missing-iteration finding. Seven-day backup retention is unchanged and is distinct from memory receipt policy. Current job/artifact freshness, protected existing key and realcontained restore remain unverified; no artifact, secret, production rows, job dispatch, alert, paidoperation or livechange occurred.


October12 evidence placement: exact private backup workflow/RESTORE captures moved without modification to /workspace/.escocia-security-evidence/backup-source-private, outside the public repository. They contain owner-specific operational configuration; moving preserves evidence and prevents public-tree identifier guards or accidental commits from treating them as releasable source.


## October12 metadata verification and prepared correction requirements

Verified existing backup workflow active and latest successful backup Oct11 12:02:50–12:06:03UTC; available weekly encrypted artifact expiresOct18, size231110743bytes with providerSHA256. At verifiedOct12 13:34:59UTC the runstart/completion were25.536/25.482h old. Oct12 run listing showed cleanup only, no backup queued/running/completed. This is a visible freshness breach of the24hobjective, not proof of missing data or absence of other Supabase recovery options. Metadata/private captures contain exact identifiers; no archive downloaded.

Prepared offline evaluator committed ec97bb7;12 synthetic boundaries pass. Live operational correction must address missed/late starts, not equate schedule configuration or cleanup success with backup completion. Investigate GitHub scheduling delay/dispatch/admission with metadata first; use successful actualsnapshot time+verifiedartifact for acceptance. A daily schedule alone offers no delay/failure buffer for a strict24h maximum. Additional frequency may exceed existingfreequota/retention capacity; obtain verified capacity evidence before proposing a zero-spend schedule change. Preserve the newest known-good artifacts and currentowner retention; do not delete evidence merely to fit quota.

Concrete release package still needed: pinned reviewedCLI/actions; coherent DB/Auth/Storage recovery contract; isolated compatibility-tested fail-closed RESTORE procedure; independent watchdog capable of detecting a schedule that never starts; owner-only notification and explicit handling of unknown snapshot age. Watchdog/job/schedule changes are production changes and need owner approval; no additional spend is authorized. Metadata-only local script is not an installedmonitor or actualrepair. Protectedexistingkey and containedrealrestore remain missing acceptance evidence, with no invented credential/recoverydeadline.


## October13 metadata update

At verified2026-10-13T00:37:12Z, a new successfulOct12backup had started14:20:07Z/completed14:24:21Z; its availableunexpired134657409-byte artifact had a providerdigest. Conservative runstartage10.285h/completionage10.214h passedlocalfreshnessassessment. The precedingstart-to-startinterval26h17m still exceeded24h; no coherentarchive/decryption/actualrestore/RTOcertification or operationalmonitorinstallation occurred. Rawproviderresponses remainprivate local evidence.
