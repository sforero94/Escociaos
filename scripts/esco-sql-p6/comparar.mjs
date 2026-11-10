#!/usr/bin/env node
// Node 20+; the fixed loader transpiles only trusted local sources in memory.
import { readFile } from 'node:fs/promises';
import { realpathSync } from 'node:fs';
import { dirname, relative, resolve, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';
import { cargar } from './cargar.mjs';
try {
  const { analizarCapturas }=cargar();
  if (process.argv.length!==4 || process.argv[2]!=='--input') throw Error('usage');
  const repo=realpathSync(resolve(dirname(fileURLToPath(import.meta.url)),'../..'));
  const file=realpathSync(resolve(process.argv[3]));
  const rel=relative(repo,file);
  if(rel==='' || (!rel.startsWith('../')&&!rel.startsWith('..\\')&&!isAbsolute(rel))) throw Error('private_input_in_repo');
  const report=analizarCapturas(JSON.parse(await readFile(file,'utf8')));
  process.stdout.write(JSON.stringify(report,null,2)+'\n');
  process.exitCode=report.protocol_pass?0:1;
} catch {
  process.stderr.write('P6_INPUT_REJECTED: use --input with valid JSON outside the repository. No input details were printed.\n');
  process.exitCode=2;
}
