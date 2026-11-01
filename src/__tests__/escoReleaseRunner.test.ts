// Run the closed Node controls in ordinary PR CI; no CLI, secrets or network.
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { it } from 'vitest';

it.each(['release-faithfulness-once.checks.mjs','release-application-facts-once.checks.mjs','release-application-routing-once.checks.mjs','release-application-month-identity-once.checks.mjs','release-application-date-cohort-once.checks.mjs','release-application-cohort-kv-schema-once.checks.mjs'])('passes %s without credentials', (checks) => {
  execFileSync(process.execPath, ['--test', resolve('scripts',checks)], {
    cwd: process.cwd(), encoding: 'utf8', timeout: 90_000,
    env: { PATH: process.env.PATH ?? '', PROOF_TYPESCRIPT: resolve('node_modules/typescript/lib/typescript.js') },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}, 95_000);
