// Run the closed Node controls in ordinary PR CI; no CLI, secrets or network.
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { it } from 'vitest';

it('passes the synthetic release safety controls without credentials', () => {
  execFileSync(process.execPath, ['--test', resolve('scripts/release-faithfulness-once.checks.mjs')], {
    cwd: process.cwd(), encoding: 'utf8', timeout: 90_000,
    env: { PATH: process.env.PATH ?? '', PROOF_TYPESCRIPT: resolve('node_modules/typescript/lib/typescript.js') },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}, 95_000);
