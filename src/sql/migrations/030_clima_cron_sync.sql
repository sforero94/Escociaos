-- Migration 030: Schedule Weather Underground clima sync via pg_cron + pg_net
-- Calls the edge function /clima/sync every 5 minutes to pull weather data

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- Schedule: every 5 minutes, POST to the clima sync endpoint
-- No auth header needed: verify_jwt = false in supabase/config.toml
SELECT cron.schedule(
  'clima-sync-wu',
  '*/5 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://ywhtjwawnkeqlwxbvgup.supabase.co/functions/v1/make-server-1ccce916/clima/sync',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);
