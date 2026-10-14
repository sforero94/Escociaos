#!/usr/bin/env node
// Portable, synthetic adapter proof. No SheetJS, records, DOM engine or network.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash,webcrypto} from 'node:crypto';
import vm from 'node:vm';
import {build} from 'vite';
import JSZip from 'jszip';
const root=fileURLToPath(new URL('../../',import.meta.url));
const scratch=resolve(process.argv[2]??resolve(root,'../.escocia-xlsx-review'),'adapter-proof');mkdirSync(scratch,{recursive:true});
const sha=data=>createHash('sha256').update(data).digest('hex');
const manifest=JSON.parse(readFileSync(resolve(root,'src/vendor/spreadsheet/manifest.json')));
assert.equal(sha(readFileSync(resolve(root,'src/vendor/spreadsheet/exceljs-runtime.mjs'))),manifest.artifactSHA256);
assert.equal(sha(readFileSync(resolve(root,'package-lock.json'))),manifest.lockSHA256);
assert(manifest.sources.some(s=>s.path==='node_modules/uuid/dist/cjs-browser/v4.js'));
assert(!manifest.sources.some(s=>s.path.startsWith('node_modules/exceljs/dist/')));
await build({configFile:false,root,publicDir:false,build:{outDir:scratch,emptyOutDir:false,minify:false,lib:{entry:resolve(root,'src/utils/spreadsheet/index.ts'),formats:['es'],fileName:()=> 'adapter.mjs'},rollupOptions:{output:{inlineDynamicImports:true}}}});
const ns='http://schemas.openxmlformats.org/spreadsheetml/2006/main',rel='http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const zip=new JSZip();
zip.file('xl/workbook.xml',`<workbook xmlns="${ns}" xmlns:r="${rel}"><workbookPr date1904="1"/><sheets><sheet name="Golden" sheetId="1" r:id="s1"/></sheets></workbook>`);
zip.file('xl/_rels/workbook.xml.rels',`<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="s1" Type="${rel}/worksheet" Target="worksheets/sheet1.xml"/></Relationships>`);
zip.file('xl/styles.xml',`<styleSheet xmlns="${ns}"><cellXfs count="2"><xf numFmtId="0"/><xf numFmtId="14"/></cellXfs></styleSheet>`);
zip.file('xl/worksheets/sheet1.xml',`<worksheet xmlns="${ns}"><dimension ref="C3:F5"/><sheetData><row r="3"><c r="C3" s="1"><v>44763.50000000001</v></c><c r="D3" t="e"><f>1+"bad"</f><v>#VALUE!</v></c><c r="E3" t="b"><v>1</v></c><c r="F3"><v>0</v></c></row></sheetData></worksheet>`);
const fixture=await zip.generateAsync({type:'uint8array',compression:'DEFLATE'});writeFileSync(resolve(scratch,'golden.xlsx'),fixture);
const source=readFileSync(resolve(scratch,'adapter.mjs'),'utf8');
const context=vm.createContext({console,setTimeout,clearTimeout,setInterval,clearInterval,queueMicrotask,TextEncoder,TextDecoder,crypto:webcrypto});context.self=context;
const module=new vm.SourceTextModule(source,{context});await module.link(specifier=>{throw Error(`Unexpected external import ${specifier}`);});await module.evaluate();
context.api=module.namespace;context.fixture=Array.from(fixture);
const result=JSON.parse(await vm.runInContext(`(async()=>{
 const original=await api.readXlsx(new Uint8Array(fixture));
 const bytes=await api.writeXlsx([{name:'Output',rows:[['Qty','Literal'],[-12.125,'=1+2'],[null,null]],widths:[24,13],formats:[{row:2,column:1,format:'#,##0.####'}],printTitlesRow:'2:2'}]);
 const again=await api.readXlsx(bytes);let refused=false;try{await api.readXlsx(new Uint8Array([0xd0,0xcf]));}catch(e){refused=e.message.includes('Convierta');}
 return JSON.stringify({original,again,refused,globals:[typeof process,typeof Buffer,typeof require,typeof module]});
})()`,context));
assert.deepEqual(result.original,{date1904:true,sheets:[{name:'Golden',range:{top:3,left:3,bottom:5,right:6},rows:[[46225.50000000001,'#VALUE!',true,0],[null,null,null,null],[null,null,null,null]]}]});
assert.deepEqual(result.again.sheets[0].rows,[['Qty','Literal'],[-12.125,'=1+2'],[null,null]]);assert(result.refused);assert.deepEqual(result.globals,['undefined','undefined','undefined','undefined']);
const report={assertions:8,adapterSHA256:sha(source),runtimeSHA256:manifest.artifactSHA256,note:'Web-API VM of actual typed adapter + same source artifact; not a DOM/download/browser-engine certificate'};
writeFileSync(resolve(scratch,'result.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
