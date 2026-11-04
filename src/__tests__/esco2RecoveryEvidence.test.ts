import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

// Execute the real teardown callback in isolation. Its filesystem functions are
// spies, so even the explicit-write positive control cannot alter P1 evidence.
function teardown(file: string): string {
  const code = readFileSync(file, 'utf8');
  const source = ts.createSourceFile(file, code, ts.ScriptTarget.Latest, true);
  for (const statement of source.statements) {
    if (!ts.isExpressionStatement(statement) || !ts.isCallExpression(statement.expression)) continue;
    const call = statement.expression;
    if (call.expression.getText(source) === 'afterAll') {
      return ts.transpileModule(`(${call.arguments[0].getText(source)})()`, {
        compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.ESNext },
      }).outputText;
    }
  }
  throw new Error(`Missing teardown in ${file}`);
}

describe('P1 evidence writes require exact explicit opt-in', () => {
  for (const name of ['experiment', 'rls']) {
    const path = `scripts/esco2/recovery/qa/${name}.test.ts`;
    it.each([undefined, '', '0', 'true', '1'])(`${name}: ESCO2_RECOVERY_WRITE=%s`, async value => {
      const writes: Array<{ path: string; content: string }> = [];
      const directories: string[] = [];
      const actual = runInNewContext(teardown(path), {
        expect: () => ({ not: { toHaveBeenCalled() {} }, toEqual() {} }),
        fetch() {}, vi: { unstubAllGlobals() {} },
        db: { async close() {} },
        hashes: () => ({}), implementationHashes: () => ({}), implementationBefore: {},
        runId: 'synthetic-readonly-control', escenarios: [], controlesExtra: [],
        rows: [], mutationRows: [], variants: [], evidence: [],
        process: { env: { ESCO2_RECOVERY_WRITE: value }, stdout: { write() {} } },
        mkdirSync: (directory: string) => directories.push(directory),
        writeFileSync: (destination: string, content: string) => writes.push({ path: destination, content }),
      });
      await actual;
      if (value !== '1') {
        expect(writes).toEqual([]);
        expect(directories).toEqual([]);
      } else {
        expect(directories).toEqual(['scripts/esco2/recovery/qa/iterations']);
        expect(writes.map(write => write.path)).toEqual([
          `scripts/esco2/recovery/qa/iterations/${name === 'rls' ? 'rls-' : ''}synthetic-readonly-control.json`,
          `scripts/esco2/recovery/qa/${name === 'rls' ? 'rls-results' : 'results'}.json`,
        ]);
        expect(writes.every(write => JSON.parse(write.content).runId === 'synthetic-readonly-control')).toBe(true);
      }
    });
  }
});
