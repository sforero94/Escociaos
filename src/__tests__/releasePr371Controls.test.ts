import {execFileSync} from 'node:child_process';
import {expect, it} from 'vitest';

it('runs synthetic one-time release/capture guards without inherited credentials or network', () => {
  const output=execFileSync(process.execPath,['--test','--test-reporter=tap','scripts/release-pr367.checks.mjs','scripts/release-pr367-capture.checks.mjs','scripts/release-pr371.checks.mjs'],{cwd:process.cwd(),encoding:'utf8',env:{},timeout:25000});
  expect(output).toContain('# fail 0');
  expect(output).not.toContain('# tests 0');
}, 30000);
