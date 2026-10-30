// Known CLI layout proof reused after rechecking v283 source hashes/reference inventory. No network on import.
import { createHash } from 'node:crypto';
import { readFile, cp, mkdir } from 'node:fs/promises';
import { join, dirname, resolve } from 'node:path';
import { diagnosticInventory, downloadedFingerprint, fingerprint, TARGET } from './release-faithfulness-proof.mjs';

export const OMITTED = Object.freeze({
  'importHato/tipos.ts': 'a737ed522a05bbe61dcafe5404cf2bbb6fb54356fe891617fa9c0d744b562ff1',
  'telegram/types.ts': '60cf9a3e52182f34d2411694c0cfd702f8fe17efe7cc7c1f0a64db78af534ed5',
});
const CACHE = Object.freeze({
  'cli-latest': [8, 'e259ceef24c76934bc3c6884c465e636c7f058e1b275e46de8d1e51a5dc8c4c4'],
  'linked-project.json': [134, '5afb37cef5be9eb93a709f9a1769352d325098f5dc58bdf706563d6a6110a302'],
});
function insist(ok, message) { if (!ok) throw new Error(message); }
const hash = (value) => createHash('sha256').update(value).digest('hex');
const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// Run against the pinned, clean Git checkout, not the downloaded source.
export async function proveTypeOnly(gitTree, ts) {
  insist(ts.version === '5.9.3', 'Wrong TypeScript proof version');
  const inventory = await diagnosticInventory(gitTree);
  insist(inventory.entries.every(e => e.type === 'file' || e.type === 'directory'), 'Unsafe Git source');
  const refs = Object.fromEntries(Object.keys(OMITTED).map(path => [path, []]));
  const statementKinds = {};
  for (const entry of inventory.entries.filter(e => e.type === 'file' && /\.tsx?$/.test(e.path))) {
    const text = await readFile(join(gitTree, entry.path), 'utf8');
    const ast = ts.createSourceFile(entry.path, text, ts.ScriptTarget.ES2022, true);
    insist(ast.parseDiagnostics.length === 0, 'Unparseable Git source');
    if (Object.hasOwn(OMITTED, entry.path)) {
      insist(entry.sha256 === OMITTED[entry.path], 'Omitted module hash changed');
      statementKinds[entry.path] = ast.statements.map(n => ts.SyntaxKind[n.kind]);
      insist(ast.statements.every(n => ts.isInterfaceDeclaration(n) || ts.isTypeAliasDeclaration(n) ||
        (ts.isImportDeclaration(n) && n.importClause) ||
        (ts.isExportDeclaration(n) && n.isTypeOnly)), 'Omitted module has runtime statements');
      const emitted = ts.transpileModule(text, { compilerOptions: {
        module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022, removeComments: true,
      } }).outputText.trim();
      insist(emitted === 'export {};', 'Omitted module emits runtime content');
    }
    function visit(node) {
      let specifier; let typeOnly = false;
      if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) {
        specifier = node.moduleSpecifier;
        typeOnly = ts.isImportDeclaration(node) ? node.importClause?.isTypeOnly === true : node.isTypeOnly === true;
      } else if (ts.isCallExpression(node) && (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
        (ts.isIdentifier(node.expression) && node.expression.text === 'require'))) specifier = node.arguments[0];
      if (specifier && ts.isStringLiteralLike(specifier) && specifier.text.startsWith('.')) {
        const destination = resolve(gitTree, dirname(entry.path), specifier.text);
        for (const omitted of Object.keys(OMITTED)) if (destination === resolve(gitTree, omitted)) {
          insist(typeOnly, 'Runtime reference to omitted module');
          refs[omitted].push(entry.path);
        }
      }
      ts.forEachChild(node, visit);
    }
    visit(ast);
  }
  insist(Object.keys(statementKinds).length === 2 && refs['importHato/tipos.ts'].length === 10 &&
    refs['telegram/types.ts'].length === 8, 'Unexpected type-only reference inventory');
  return { typeScriptVersion: ts.version, omitted: OMITTED, statementKinds, references: refs, emitsOnlyEmptyModules: true };
}

export function validateRawInventory(rawInventory, gitInventory, config) {
  const prefix = `supabase/functions/${TARGET}/`;
  insist([83,84].includes(gitInventory.fileCount) && gitInventory.entries.filter(e=>e.type==='file').length===gitInventory.fileCount, 'Unexpected approved Git inventory');
  const expected = [
    ...['supabase', 'supabase/functions', `supabase/functions/${TARGET}`].map(path => ({ path, type: 'directory' })),
    { path: 'supabase/config.toml', type: 'file', bytes: config.length, sha256: hash(config) },
    ...gitInventory.entries.filter(e => !Object.hasOwn(OMITTED, e.path)).map(e => ({ ...e, path: prefix + e.path })),
  ];
  const additions = [{ path: 'supabase/.temp', type: 'directory' }, ...Object.entries(CACHE).map(([name, [bytes, sha256]]) =>
    ({ path: `supabase/.temp/${name}`, type: 'file', bytes, sha256 }))];
  const sorted = (entries) => entries.slice().sort((a, b) => Buffer.compare(Buffer.from(a.path), Buffer.from(b.path)));
  insist(equal(sorted(rawInventory.entries), sorted([...expected, ...additions])), 'Raw download differs from exact observed source/cache layout');
}

// Raw capture stays untouched. Destination must not exist (mkdir, never recursive).
// All metadata/cache paths are exact, including their observed bytes and hashes.
export async function reconstructCapture(raw, gitRoot, clean, ts) {
  const rawInventory = await diagnosticInventory(raw);
  const gitTree = join(gitRoot, 'supabase/functions', TARGET);
  const gitInventory = await diagnosticInventory(gitTree);
  const config = await readFile(join(gitRoot, 'supabase/config.toml'));
  validateRawInventory(rawInventory, gitInventory, config);
  const typeProof = await proveTypeOnly(gitTree, ts);
  const reconstructed = await reconstructSource(raw, gitRoot, clean);
  const native = await fingerprint(join(raw, 'supabase/functions', TARGET));
  return { fingerprint: reconstructed, evidence: {
    native,
    reconstructed: { ...reconstructed, restoredFromGit: Object.keys(OMITTED) }, typeProof,
  } };
}

// File copying is separate from approval: production calls only after both proofs.
export async function reconstructSource(raw, gitRoot, clean) {
  const gitTree = join(gitRoot, 'supabase/functions', TARGET);
  const prefix = `supabase/functions/${TARGET}/`;
  await mkdir(clean);
  await mkdir(join(clean, 'supabase'));
  await cp(join(raw, 'supabase/config.toml'), join(clean, 'supabase/config.toml'), { errorOnExist: true, force: false });
  await cp(join(raw, 'supabase/functions'), join(clean, 'supabase/functions'), { recursive: true, errorOnExist: true, force: false });
  for (const path of Object.keys(OMITTED)) await cp(join(gitTree, path), join(clean, prefix, path), { errorOnExist: true, force: false });
  const reconstructed = await downloadedFingerprint(clean);
  const pinned = await fingerprint(gitTree);
  insist(equal(reconstructed, pinned) && reconstructed.count === pinned.count, 'Reconstructed source differs from complete pinned Git source');
  return reconstructed;
}
