The memory confirmation SQL and cleanup schedule are review candidates. Neither
has been applied to production. Deploying the callers requires applying both
candidates first, verifying the existing `pg_cron` extension, inspecting the named
job `esco-memory-confirmation-purge`, and checking successful scheduled runs. The
standard cached PostgreSQL image used by local tests does not contain `pg_cron`;
the actual scheduler remains a release gate.

A trusted server caller registers the authenticated owner's exact proposal and
generates the token with a base36 issuance timestamp and random UUID. SQL accepts
issuance less than 30 minutes old, with at most 60 seconds of future clock skew.
Expiry is issuance plus 30 minutes. Accepted future skew can produce at most
31 minutes of lifetime on the database clock; the token TTL stays 30 minutes on
its issuance clock. Registration and purge use the same issuance boundary. Model-supplied owner IDs, tokens, and final-content overrides are ignored.

Only the actual Telegram button callback can consume a proposal. SQL rechecks the
unique active Telegram link, owner, Gerencia role, and current `consultas` grant
within the same transaction, then writes the exact memory, marks the proposal
consumed, and stores the receipt atomically. Repeating the same owner/sender/token
returns the original receipt for less than 168 hours without writing another
memory. Replay still requires current permission.

Receipt expiry is separate from proposal expiry and from the saved memory's
long-term lifetime. Consumed proposals immediately lose their content and reason;
their owner/token/hash remains only while the 168-hour receipt exists. Cleanup
deletes expired receipts and expired proposals with no receipt, including all
spent-token metadata. There are no permanent tombstones. Historical tokens cannot
be re-registered after deletion because their embedded issuance has expired.

The candidate schedules cleanup every minute, including quiet periods. Logical
replay stops at 168 hours; physical deletion follows on the next successful
cleanup run, normally within one minute. A disabled or failing scheduler means
physical retention is not enforced and must block the release claim. Caller
cleanup is supplemental and does not replace the scheduled job.

The web client currently has no human memory-confirmation route or controls. The
model's `commit_memory_save` tool returns an error and cannot write, even if it
claims that the user approved. Legacy in-process proposal tokens cannot be
confirmed through the new contract; users must request a fresh proposal.

Run `python3 scripts/security/telegram-memory-postgres.py` for isolated synthetic
PostgreSQL 17.6 checks. It uses the cached digest with pull disabled, networking
disabled, tmpfs storage, no published ports or bind mounts, and verified container
cleanup. Receipt-aging tests age both the encoded issuance timestamp and stored
timestamps in the synthetic fixture; they do not change production data or the
machine clock. SDK/caller tests intercept every HTTP request.
