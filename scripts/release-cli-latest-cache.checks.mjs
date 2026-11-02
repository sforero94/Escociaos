// Synthetic cache bytes only. No network, subprocess, credentials or live capture.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdtemp,mkdir,writeFile,readFile,rm,symlink} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {latestCacheEntry,readLatestCache,validateRawInventory,OMITTED} from './release-application-date-cohort-capture.mjs';
import {classifyRaw,inspectRawCapture} from './diagnose-application-consumption-classifier.mjs';
import {safeFailure} from './diagnose-application-consumption-once.mjs';
import {TARGET} from './release-faithfulness-proof.mjs';
const sha=value=>createHash('sha256').update(value).digest('hex');
const path='supabase/.temp/cli-latest';
function fixture(content=Buffer.from('v3.0.0')) {
 const config=Buffer.from('synthetic config');
 const git={fileCount:85,entries:[...Array.from({length:83},(_,i)=>({path:i?'file-'+i+'.ts':'index.ts',type:'file',bytes:1,sha256:sha('x')})),...Object.entries(OMITTED).map(([path,sha256])=>({path,type:'file',bytes:10,sha256}))]};
 const raw={entries:[...['supabase','supabase/functions',`supabase/functions/${TARGET}`,'supabase/.temp'].map(path=>({path,type:'directory'})),{path:'supabase/config.toml',type:'file',bytes:config.length,sha256:sha(config)},...git.entries.filter(e=>!Object.hasOwn(OMITTED,e.path)).map(e=>({...e,path:`supabase/functions/${TARGET}/`+e.path})),latestCacheEntry(content),{path:'supabase/.temp/linked-project.json',type:'file',bytes:134,sha256:'5afb37cef5be9eb93a709f9a1769352d325098f5dc58bdf706563d6a6110a302'}]};
 return {raw,git,config,content};
}
const validate=f=>validateRawInventory(f.raw,f.git,f.config,f.content);
for(const version of ['v2.122.0','v3.0.0','v0.0.0','v3.1.2-rc.1','v3.1.2-0','v3.1.2-abc-01+001.build','v1.2.3+'+'a'.repeat(121)])test('bounded canonical release tag '+version,()=>{
 const content=Buffer.from(version),f=fixture(content),before=JSON.stringify(f.raw);
 assert.ok(content.length<=128);validate(f);assert.equal(JSON.stringify(f.raw),before);
 assert.deepEqual(latestCacheEntry(content),{path,type:'file',bytes:content.length,sha256:sha(content)});
 assert.equal(classifyRaw(f.raw,f.git,f.config,content).category,'RAW_MATCH');
 const events=[];inspectRawCapture(f.raw,f.git,f.config,e=>events.push(e),content);assert.equal(events.length,1);
 assert.ok(!JSON.stringify(events).includes(version));
});
for(const value of ['', 'v1.2','1.2.3','V1.2.3','v01.2.3','v1.02.3','v1.2.03','v1.2.3-01','v1.2.3-a..b','v1.2.3+','v1.2.3+.', ' v1.2.3','v1.2.3 ', 'v1.2.3\n','v1.2.3\r\n','v1.2.3\t','v1.2.3\0','v1.2.3-ñ','v1.2.3+'+'a'.repeat(122)])test('reject malformed or oversized cache '+JSON.stringify(value),()=>{
 assert.throws(()=>latestCacheEntry(Buffer.from(value)),{message:'Raw download differs from exact observed source/cache layout'});
});
test('reject non-ASCII bytes before decoding and nonbuffer values',()=>{for(const bytes of [Buffer.from([0xf6,0x31,0x2e,0x32,0x2e,0x33]),'v1.2.3',null,{},new Uint8Array([1])])assert.throws(()=>latestCacheEntry(bytes));});
test('dynamic bytes must match observed size/hash; absent byte proof preserves old strict snapshot',()=>{
 const f=fixture();assert.throws(()=>validateRawInventory(f.raw,f.git,f.config));
 for(const value of ['v4.0.0','v30.0.0'])assert.throws(()=>validateRawInventory(f.raw,f.git,f.config,Buffer.from(value)));
 f.raw.entries.find(e=>e.path===path).bytes++;assert.throws(()=>validate(f));
});
for(const change of ['source','config','linked-cache','missing-cache','extra-cache','wrapper','symlink-cache','directory-cache','duplicate-cache','cache-extra-key','restored-type-present','type-omission-changed'])test('valid release cache cannot hide '+change,()=>{
 const f=fixture(),cache=f.raw.entries.find(e=>e.path===path);
 if(change==='source')f.raw.entries.find(e=>e.path.endsWith('/index.ts')).sha256=sha('changed');
 if(change==='config')f.raw.entries.find(e=>e.path==='supabase/config.toml').sha256=sha('changed');
 if(change==='linked-cache')f.raw.entries.find(e=>e.path.endsWith('/linked-project.json')).sha256=sha('changed');
 if(change==='missing-cache')f.raw.entries=f.raw.entries.filter(e=>e!==cache);
 if(change==='extra-cache')f.raw.entries.push({path:'supabase/.temp/unknown',type:'file',bytes:0,sha256:sha('')});
 if(change==='wrapper')f.raw.entries.find(e=>e.path==='supabase/functions').type='symlink';
 if(change==='symlink-cache')cache.type='symlink';
 if(change==='directory-cache')cache.type='directory';
 if(change==='duplicate-cache')f.raw.entries.push({...cache});
 if(change==='cache-extra-key')cache.unexpected=true;
 if(change==='restored-type-present')f.raw.entries.push({...f.git.entries.at(-1),path:`supabase/functions/${TARGET}/telegram/types.ts`});
 if(change==='type-omission-changed')f.raw.entries=f.raw.entries.filter(e=>!e.path.endsWith('/file-82.ts'));
 assert.throws(()=>validate(f));assert.throws(()=>inspectRawCapture(f.raw,f.git,f.config,()=>true,f.content));
});
test('two captures each validate their own cache bytes without changing source/config',()=>{
 const a=fixture(Buffer.from('v3.0.0')),b=fixture(Buffer.from('v3.0.1'));validate(a);validate(b);
 assert.deepEqual(a.git,b.git);assert.deepEqual(a.config,b.config);
 assert.throws(()=>validateRawInventory(b.raw,b.git,b.config,a.content));
});
async function withRaw(run){const raw=await mkdtemp(join(tmpdir(),'esco-cache-test-'));try{await mkdir(join(raw,'supabase/.temp'),{recursive:true});await run(raw,join(raw,path));}finally{await rm(raw,{recursive:true,force:true});}}
test('bounded filesystem reader preserves raw bytes and binds them to inventory',async()=>withRaw(async(raw,file)=>{
 const content=Buffer.from('v3.0.0-rc.1+test');await writeFile(file,content);
 const observed=await readLatestCache(raw);assert.deepEqual(observed,content);assert.deepEqual(await readFile(file),content);
 validate(fixture(observed));
}));
for(const shape of ['missing','directory','symlink','parent-symlink','oversized','empty','malformed'])test('filesystem reader rejects '+shape+' with fixed safe error',async()=>withRaw(async(raw,file)=>{
 if(shape==='directory')await mkdir(file);
 else if(shape==='symlink'){await writeFile(join(raw,'outside'),'v3.0.0');await symlink(join(raw,'outside'),file);}
 else if(shape==='parent-symlink'){await rm(join(raw,'supabase/.temp'),{recursive:true});await mkdir(join(raw,'outside'));await writeFile(join(raw,'outside/cli-latest'),'v3.0.0');await symlink(join(raw,'outside'),join(raw,'supabase/.temp'));}
 else if(shape!=='missing')await writeFile(file,shape==='oversized'?'x'.repeat(1024*1024):shape==='empty'?'':'private-token\n');
 await assert.rejects(readLatestCache(raw),e=>{assert.deepEqual(safeFailure('first_proof',e),{stage:'first_proof',event:'failed',code:'RAW_LAYOUT_REJECTED'});assert.ok(!String(e).includes('private-token'));return true;});
}));
test('release and diagnosis both read cache bytes before unchanged full reconstruction',async()=>{
 const capture=await readFile(new URL('./release-application-date-cohort-capture.mjs',import.meta.url),'utf8');
 assert.match(capture,/validateRawInventory\(rawInventory, gitInventory, config, await readLatestCache\(raw\)\)/);
 assert.ok(capture.indexOf('const typeProof = await proveTypeOnly')>capture.indexOf('validateRawInventory(rawInventory'));
 assert.match(capture,/const reconstructed = await reconstructSource/);assert.match(capture,/const native = await fingerprint/);
 const diagnose=await readFile(new URL('./diagnose-application-consumption-once.mjs',import.meta.url),'utf8');
 assert.match(diagnose,/inspectRawCapture\(rawInventory,gitInventory,config,emit,await readLatestCache\(raw\)\)/);
 assert.match(diagnose,/return reconstructCapture\(raw,recovery/);
});
