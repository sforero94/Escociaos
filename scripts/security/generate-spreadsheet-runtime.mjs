#!/usr/bin/env node
// Build only genuine upstream source. The generated ESM is shared by browser/Deno.
import { createRequire } from 'node:module';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { resolve, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { build } from 'vite';
import inject from '@rollup/plugin-inject';
const root = fileURLToPath(new URL('../../', import.meta.url));
const req = createRequire(resolve(root, 'package.json'));
const lockBytes = readFileSync(resolve(root, 'package-lock.json'));
const lock = JSON.parse(lockBytes);
const hash = data => createHash('sha256').update(data).digest('hex');
if (lock.packages['node_modules/exceljs'].version !== '4.4.0' || lock.packages['node_modules/uuid'].version !== '11.1.1' || JSON.parse(readFileSync(resolve(root,'package.json'))).overrides.exceljs.uuid !== '11.1.1') throw Error('Exact scoped ExcelJS/UUID graph required');
for (const [name,integrity] of [
  ['exceljs','sha512-XctvKaEMaj1Ii9oDOqbW/6e1gXknSY4g/aLCDicOXqBE4M0nRWkUu0PTp++UPNzoFY12BNHMfs/VadKIS6llvg=='],
  ['uuid','sha512-vIYxrBCC/N/K+Js3qSN88go7kIfNPssr/hHCesKCQNAjmgvYS2oqr69kIufEG+O4+PfezOH4EbIeHCfFov8ZgQ=='],
]) {
  const pkg=lock.packages[`node_modules/${name}`];
  if(pkg.integrity!==integrity||pkg.resolved!==`https://registry.npmjs.org/${name}/-/${name}-${pkg.version}.tgz`)throw Error(`Genuine pinned registry artifact required: ${name}`);
}
const out = resolve(root, 'src/vendor/spreadsheet'); mkdirSync(out, {recursive:true});
const graph = [];
const entry = resolve(root, 'scripts/security/spreadsheet-runtime-entry.mjs');
await build({ configFile:false, root, publicDir:false,
  resolve:{alias:{'core-js':dirname(req.resolve('core-js')), 'regenerator-runtime':dirname(req.resolve('regenerator-runtime/runtime')), stream:req.resolve('stream-browserify'), events:req.resolve('events/'), buffer:req.resolve('buffer/'), process:req.resolve('process/browser')}},
  plugins:[
    {...inject({Buffer:['buffer','Buffer'],process:'process'}),enforce:'post'},
    {name:'spreadsheet-provenance',generateBundle(){graph.push(...this.getModuleIds());}}],
  build:{outDir:out,emptyOutDir:false,lib:{entry,formats:['es'],fileName:()=> 'exceljs-runtime.mjs'},minify:false}
});
const ids = graph.filter(id=>!id.startsWith('\0') && id.startsWith(root)).map(id=>relative(root,id).replaceAll('\\','/')).sort();
if (!ids.includes('node_modules/uuid/dist/cjs-browser/v4.js') || ids.filter(id=>/(^|\/)node_modules\/uuid\//.test(id)).some(id=>!id.startsWith('node_modules/uuid/')) || ids.some(id=>/^node_modules\/exceljs\/dist\//.test(id))) throw Error('Source-only patched graph not established');
const packages = new Map();
for (const id of ids) {
  let dir = dirname(resolve(root,id));
  while (dir.startsWith(root) && (!existsSync(resolve(dir,'package.json'))||!lock.packages[relative(root,dir)])) dir=dirname(dir);
  if (!dir.includes('node_modules')) continue;
  const info=JSON.parse(readFileSync(resolve(dir,'package.json'))); packages.set(relative(root,dir),info);
}
let licenses = '# Runtime third-party license notices\n\nGenerated from the exact source graph.\n';
const sources=ids.map(path=>({path,sha256:hash(readFileSync(resolve(root,path)))}));
const evidence=[];
for(const [path,info] of [...packages].sort(([a],[b])=>a.localeCompare(b))) {
  const record=lock.packages[path]; if(!record || record.version!==info.version) throw Error(`Lock mismatch ${path}`);
  evidence.push({path,name:info.name,version:info.version,resolved:record.resolved,integrity:record.integrity});
  const filename=['LICENSE','LICENSE.md','LICENSE.txt','license','license.md','LICENSE-MIT','LICENSE.markdown','LICENCE','COPYING'].find(name=>existsSync(resolve(root,path,name)));
  const licensePath=filename?resolve(root,path,filename):info.name==='saxes'&&info.version==='5.0.1'?resolve(out,'saxes-LICENSE.txt'):null;
  if(!licensePath) throw Error(`Missing license text for ${path}`);
  licenses+=`\n## ${info.name}@${info.version} (${info.license ?? 'see text'})\n\n${readFileSync(licensePath,'utf8')}\n`;
}
writeFileSync(resolve(out,'LICENSES.md'),licenses);
const manifest={schema:1,exceljs:'4.4.0',scopedUuid:'11.1.1',generator:'scripts/security/generate-spreadsheet-runtime.mjs',generatorSHA256:hash(readFileSync(fileURLToPath(import.meta.url))),lockSHA256:hash(lockBytes),node:process.version,vite:req('vite/package.json').version,artifact:'exceljs-runtime.mjs',artifactSHA256:hash(readFileSync(resolve(out,'exceljs-runtime.mjs'))),licensesSHA256:hash(licenses),extraLicenseSources:[{package:'saxes@5.0.1',url:'https://raw.githubusercontent.com/lddubeau/saxes/v5.0.1/LICENSE',file:'saxes-LICENSE.txt',sha256:hash(readFileSync(resolve(out,'saxes-LICENSE.txt')))}],packages:evidence,sources};
writeFileSync(resolve(out,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');
console.log(JSON.stringify({artifactSHA256:manifest.artifactSHA256,sourceModules:sources.length,packages:evidence.length}));
