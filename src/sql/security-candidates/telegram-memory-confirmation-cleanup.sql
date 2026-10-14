-- REVIEW CANDIDATE ONLY. Apply only after telegram-memory-confirmation.sql.
-- Requires existing pg_cron; do not install an extension or schedule a live job
-- as part of local verification. Inspect cron.job and recent cron.job_run_details
-- during the separately approved release before claiming enforced retention.
BEGIN;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_extension WHERE extname = 'pg_cron') THEN
    RAISE EXCEPTION 'Memory receipt retention requires existing pg_cron';
  END IF;
  IF to_regprocedure('public.esco_purge_memory_confirmation_payloads()') IS NULL THEN
    RAISE EXCEPTION 'Apply the memory confirmation candidate first';
  END IF;
END $$;
-- Named scheduling updates the existing job of this name for its owner, making
-- repeat deployment idempotent. Run as the authorized database maintenance role.
SELECT cron.schedule(
  'esco-memory-confirmation-purge',
  '* * * * *',
  $job$SELECT public.esco_purge_memory_confirmation_payloads();$job$
);
COMMIT;
