// Synthetic/local only. Never invokes main, CLI, fetch, secrets or production.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
// CI installs the proof compiler outside the checkout, before credentials.
// An explicit path must resolve or fail; never fall back after a bad CI path.
const ts=(await import(Object.hasOwn(process.env,'PROOF_TYPESCRIPT')
  ? pathToFileURL(resolve(process.env.PROOF_TYPESCRIPT)).href
  : 'typescript')).default;
import {APPROVED,ROLLBACK,BASELINE,requireBaseline,release,supervisedRollback,invocation,healthProbe} from './release-evidence-families-once.mjs';
import {validateRawInventory,proveTypeOnly,OMITTED} from './release-evidence-families-capture.mjs';
import {fingerprint,diagnosticInventory,DEPLOY_CONFIG,TARGET,PROJECT} from './release-faithfulness-proof.mjs';
const hash=b=>createHash('sha256').update(b).digest('hex');
const baseline={...BASELINE,hash:'a'.repeat(64),updatedAt:100};
const meta=(v=293,changes={})=>({slug:TARGET,name:TARGET,id:'9defb252-5ea2-463b-b91b-497e0a7fe582',version:v,status:'ACTIVE',verify_jwt:false,import_map:false,ezbr_sha256:v===293?baseline.hash:'b'.repeat(64),updated_at:v===293?100:101,
 entrypoint_path:`file:///tmp/user_fn_${PROJECT}_9defb252-5ea2-463b-b91b-497e0a7fe582_${v}/source/supabase/functions/${TARGET}/index.ts`,...changes});
function evidence(kind,omissions=2){const count=kind==='rollback'?109:112,h=kind==='rollback'?ROLLBACK.full:APPROVED.fingerprint;return {fingerprint:{count,hash:h},evidence:{native:{count:count-omissions,hash:kind==='rollback'?ROLLBACK.native.hash:omissions===0?h:'c'.repeat(64)},reconstructed:{count,hash:h,restoredFromGit:Object.keys(OMITTED).slice(0,omissions)},typeProof:{typeScriptVersion:'5.9.3',emitsOnlyEmptyModules:true}}};}
function fixture(seq=[meta(),meta(),meta(),meta(294),meta(294)]){const calls=[];return {calls,ops:{metadata:async()=>{calls.push('metadata');assert.ok(seq.length);return seq.shift();},verifySource:async()=>calls.push('verify'),capture:async(name,kind)=>{calls.push('capture:'+name);return evidence(kind);},deploy:async kind=>calls.push('deploy:'+kind),health:async()=>true}};}
test('unbound expected baseline blocks before any I/O; live metadata cannot supply it',async()=>{const unbound={...BASELINE,hash:null,updatedAt:null};assert.throws(()=>requireBaseline(unbound));const f=fixture();await assert.rejects(release(f.ops,APPROVED,unbound),/not bound/);assert.deepEqual(f.calls,[]);requireBaseline();});
test('112 candidate and109 rollback require two equal fresh captures and postdeploy source proof',async()=>{const f=fixture();assert.equal((await release(f.ops,APPROVED,baseline)).state,'released');assert.deepEqual(f.calls.filter(x=>x.startsWith('capture:')),['capture:first','capture:second','capture:deployed']);assert.deepEqual(f.calls.filter(x=>x.startsWith('deploy:')),['deploy:release']);});
for(const omitted of [0,1,2])test(`native evidence with ${omitted} proven type omissions remains distinct from full source`,async()=>{const f=fixture();f.ops.capture=async(_,kind)=>evidence(kind,kind==='rollback'?2:omitted);assert.equal((await release(f.ops,APPROVED,baseline)).state,'released');});
for(const defect of ['candidate109','unknown-omission','duplicate-omission','count','source','type-proof','native-diff'])test(`proof rejects ${defect}`,async()=>{const f=fixture();f.ops.capture=async(name,kind)=>{const p=evidence(kind);if(defect==='candidate109'&&kind==='release')p.fingerprint.count=109;if(defect==='unknown-omission')p.evidence.reconstructed.restoredFromGit[0]='other.ts';if(defect==='duplicate-omission')p.evidence.reconstructed.restoredFromGit[1]=p.evidence.reconstructed.restoredFromGit[0];if(defect==='count')p.evidence.native.count--;if(defect==='source')p.fingerprint.hash='0'.repeat(64);if(defect==='type-proof')p.evidence.typeProof.emitsOnlyEmptyModules=false;if(defect==='native-diff'&&name==='second')p.evidence.native.hash='0'.repeat(64);return p;};await assert.rejects(release(f.ops,APPROVED,baseline));assert.ok(!f.calls.includes('deploy:rollback'));if(defect!=='candidate109')assert.ok(!f.calls.includes('deploy:release'));});
test('baseline drift and source change prevent mutation',async()=>{for(const m of [meta(294),meta(293,{verify_jwt:true}),meta(293,{import_map:true}),meta(293,{updated_at:102})]){const f=fixture([m]);await assert.rejects(release(f.ops,APPROVED,baseline));assert.ok(!f.calls.includes('deploy:release'));}const f=fixture();f.ops.verifySource=async()=>{throw Error('dirty');};await assert.rejects(release(f.ops,APPROVED,baseline));assert.ok(!f.calls.includes('deploy:release'));});
test('uncertain deploy is never retried or rolled back',async()=>{const f=fixture();f.ops.deploy=async k=>{f.calls.push('deploy:'+k);throw Error('unknown');};await assert.rejects(release(f.ops,APPROVED,baseline));assert.deepEqual(f.calls.filter(x=>x.startsWith('deploy:')),['deploy:release']);});
test('verified failed health permits one owned rollback with109 source recovery',async()=>{const restored=meta(295,{updated_at:102});const f=fixture([meta(),meta(),meta(),meta(294),meta(294),restored,restored]);let n=0;f.ops.health=async()=>++n>1;assert.equal((await release(f.ops,APPROVED,baseline)).state,'rolled-back');assert.deepEqual(f.calls.filter(x=>x.startsWith('deploy:')),['deploy:release','deploy:rollback']);});
test('ownership loss prevents rollback',async()=>{const f=fixture([meta(),meta(),meta(),meta(294),meta(295,{updated_at:102})]);f.ops.health=async()=>false;await assert.rejects(release(f.ops,APPROVED,baseline));assert.ok(!f.calls.includes('deploy:rollback'));});
test('health network uncertainty is not rollback permission',async()=>{await assert.rejects(healthProbe(async()=>{throw Error('network');},async()=>{}));});
const root='supabase/functions/'+TARGET;
test('actual candidate fingerprint and type-only/import reference proof match pins',async()=>{assert.deepEqual(await fingerprint(root),{count:112,hash:APPROVED.fingerprint});assert.equal((await proveTypeOnly(root,ts)).emitsOnlyEmptyModules,true);});
function raw(git,omitted){return {entries:[...['supabase','supabase/functions',root,'supabase/.temp'].map(path=>({path,type:'directory'})),{path:'supabase/config.toml',type:'file',bytes:Buffer.byteLength(DEPLOY_CONFIG),sha256:hash(DEPLOY_CONFIG)},...git.entries.filter(e=>!omitted.includes(e.path)).map(e=>({...e,path:root+'/'+e.path})),{path:'supabase/.temp/cli-latest',type:'file',bytes:8,sha256:hash('v2.122.0')},{path:'supabase/.temp/linked-project.json',type:'file',bytes:134,sha256:'5afb37cef5be9eb93a709f9a1769352d325098f5dc58bdf706563d6a6110a302'}]};}
test('full actual112 source and only proved missing modules validate independently of native count assumptions',async()=>{const git=await diagnosticInventory(root);for(const omitted of [[],[Object.keys(OMITTED)[0]],Object.keys(OMITTED)])validateRawInventory(raw(git,omitted),git,Buffer.from(DEPLOY_CONFIG),Buffer.from('v2.122.0'));});
for(const defect of ['changed-source','extra','missing-runtime','symlink','wrapper','config','cache'])test(`raw inventory rejects ${defect}`,async()=>{const git=await diagnosticInventory(root),r=raw(git,Object.keys(OMITTED));const index=r.entries.find(e=>e.path===root+'/index.ts');if(defect==='changed-source')index.sha256='0'.repeat(64);if(defect==='extra')r.entries.push({path:'unexpected',type:'file',bytes:0,sha256:hash('')});if(defect==='missing-runtime')r.entries=r.entries.filter(e=>e!==index);if(defect==='symlink')index.type='symlink';if(defect==='wrapper')r.entries.find(e=>e.path==='supabase').type='symlink';if(defect==='config')r.entries.find(e=>e.path==='supabase/config.toml').sha256='0'.repeat(64);if(defect==='cache')r.entries.find(e=>e.path.endsWith('linked-project.json')).bytes++;assert.throws(()=>validateRawInventory(r,git,Buffer.from(DEPLOY_CONFIG),Buffer.from('v2.122.0')));});
test('manual main/window,new confirmation,step-only management secret and read-only contents',async()=>{const w=await readFile('.github/workflows/release-evidence-families-once.yml','utf8');assert.match(w,/contents: read/);assert.equal((w.match(/secrets\.SUPABASE_ACCESS_TOKEN/g)||[]).length,1);assert.ok(w.indexOf('secrets.SUPABASE_ACCESS_TOKEN')>w.indexOf('Capture, deploy once'));for(const s of ['actions: read','contents: write','push:','schedule:','pull_request:','github.token'])assert.ok(!w.includes(s));const env={GITHUB_REPOSITORY:'sforero94/Escociaos',GITHUB_REF:'refs/heads/main',GITHUB_EVENT_NAME:'workflow_dispatch',GITHUB_RUN_ATTEMPT:'1',GITHUB_SHA:'a'.repeat(40),GITHUB_RUN_ID:'1',EXCLUSIVE_BACKEND_WINDOW:'true',RELEASE_CONFIRMATION:'DEPLOY_EVIDENCE_FAMILIES_WITH_V293_SOURCE_ROLLBACK'};invocation(env);for(const c of [{GITHUB_RUN_ATTEMPT:'2'},{GITHUB_REF:'refs/heads/other'},{EXCLUSIVE_BACKEND_WINDOW:'false'},{RELEASE_CONFIRMATION:'DEPLOY_APPROVED_APPLICATION_STATUS_AND_PESAJE_WITH_V289_ROLLBACK'}])assert.throws(()=>invocation({...env,...c}));});

test('supervised functional rollback requires exact current owned receipt and two candidate captures',async()=>{
 const receipt={version:294,status:'ACTIVE',verifyJwt:false,hash:'b'.repeat(64),updatedAt:101};
 const restored=meta(295,{updated_at:102});const f=fixture([meta(294),meta(294),restored,restored]);
 f.ops.verifyRecovery=async()=>f.calls.push('verifyRecovery');
 assert.equal((await supervisedRollback(f.ops,receipt,baseline)).state,'supervised-rolled-back');
 assert.deepEqual(f.calls.filter(c=>c.startsWith('capture:')),['capture:functional-first','capture:functional-second','capture:functional-restored']);
 assert.deepEqual(f.calls.filter(c=>c.startsWith('deploy:')),['deploy:supervised-rollback']);
 assert.ok(f.calls.indexOf('verifyRecovery')<f.calls.indexOf('deploy:supervised-rollback'));
});
for(const defect of ['wrong-receipt','competing-operator','changed-source','uncertain-deploy'])test(`supervised recovery stops on ${defect} without retry`,async()=>{
 const receipt={version:294,status:'ACTIVE',verifyJwt:false,hash:'b'.repeat(64),updatedAt:101};const f=fixture([meta(294),meta(294)]);f.ops.verifyRecovery=async()=>{};
 if(defect==='wrong-receipt')receipt.hash='d'.repeat(64);
 if(defect==='competing-operator')f.ops.metadata=async()=>meta(295,{updated_at:102});
 if(defect==='changed-source')f.ops.verifySource=async()=>{throw Error('changed');};
 if(defect==='uncertain-deploy')f.ops.deploy=async k=>{f.calls.push('deploy:'+k);throw Error('unknown');};
 await assert.rejects(supervisedRollback(f.ops,receipt,baseline));
 assert.equal(f.calls.filter(c=>c.startsWith('deploy:')).length,defect==='uncertain-deploy'?1:0);
});

test('consumed prior release confirmation and prior baseline cannot authorize reactivation',async()=>{
 const env={GITHUB_REPOSITORY:'sforero94/Escociaos',GITHUB_REF:'refs/heads/main',GITHUB_EVENT_NAME:'workflow_dispatch',GITHUB_RUN_ATTEMPT:'1',GITHUB_SHA:'a'.repeat(40),GITHUB_RUN_ID:'1',EXCLUSIVE_BACKEND_WINDOW:'true',RELEASE_MODE:'release',RELEASE_CONFIRMATION:'DEPLOY_REVIEWED_SELECTED_CORE_WITH_V290_SOURCE_ROLLBACK'};
 assert.throws(()=>invocation(env));assert.throws(()=>requireBaseline({...BASELINE,version:290}));
 const f=fixture([meta(290)]);await assert.rejects(release(f.ops,APPROVED,baseline));assert.ok(!f.calls.includes('deploy:release'));
});

test('recovery capture is bound to the observed native107 hash, not a guessed full-source count',async()=>{
 for(const defect of ['hash','count','missing-list']){
  const f=fixture();f.ops.capture=async(_name,kind)=>{const p=evidence(kind);if(kind==='rollback'){if(defect==='hash')p.evidence.native.hash='f'.repeat(64);if(defect==='count'){p.evidence.native.count=109;p.evidence.native.hash=ROLLBACK.full;p.evidence.reconstructed.restoredFromGit=[];}if(defect==='missing-list')p.evidence.reconstructed.restoredFromGit=['telegram/types.ts'];}return p;};
  await assert.rejects(release(f.ops,APPROVED,baseline),/Source\/configuration proof mismatch/);assert.ok(!f.calls.includes('deploy:release'));
 }
 assert.deepEqual(ROLLBACK.native,{count:107,hash:'bd22e3f697aa8a31c7e13df8e5d145ec89a80691a00ae0ebfcf00d663f5192b8'});
});
test('a full native candidate must itself equal the pinned full fingerprint',async()=>{
 const f=fixture();f.ops.capture=async(_name,kind)=>{const p=evidence(kind,kind==='rollback'?2:0);if(kind==='release')p.evidence.native.hash='f'.repeat(64);return p;};await assert.rejects(release(f.ops,APPROVED,baseline));assert.deepEqual(f.calls.filter(x=>x.startsWith('deploy:')),['deploy:release']);
});
test('both immediately consumed confirmation strings and the v292 baseline are rejected',()=>{
 const env={GITHUB_REPOSITORY:'sforero94/Escociaos',GITHUB_REF:'refs/heads/main',GITHUB_EVENT_NAME:'workflow_dispatch',GITHUB_RUN_ATTEMPT:'1',GITHUB_SHA:'a'.repeat(40),GITHUB_RUN_ID:'1',EXCLUSIVE_BACKEND_WINDOW:'true'};
 for(const [mode,confirmation]of [['release','REACTIVATE_REVIEWED_SELECTED_CORE_WITH_V292_SOURCE_ROLLBACK'],['rollback','ROLLBACK_REACTIVATED_SELECTED_CORE_TO_V292_SOURCE']])assert.throws(()=>invocation({...env,RELEASE_MODE:mode,RELEASE_CONFIRMATION:confirmation}));
 assert.throws(()=>requireBaseline({...BASELINE,version:292}));
 invocation({...env,RELEASE_MODE:'rollback',RELEASE_CONFIRMATION:'ROLLBACK_EVIDENCE_FAMILIES_TO_V293_SOURCE'});
});
test('workflow preserves pinned tools/checkouts, compiler injection, shared lock and step-only credential placement',async()=>{
 const w=await readFile('.github/workflows/release-evidence-families-once.yml','utf8');
 assert.equal((w.match(/actions\/checkout@11bd71901bbe5b1630ceea73d27597364c9af683/g)||[]).length,3);
 for(const literal of ['supabase@2.122.0','typescript@5.9.3','PROOF_TYPESCRIPT: ${{ runner.temp }}/faithfulness-proof/node_modules/typescript/lib/typescript.js','group: escocia-backend-release','cancel-in-progress: false','timeout-minutes: 20','github.run_attempt == 1',ROLLBACK.source,'RELEASE_TEST_BASELINE: ${{ github.workspace }}/rollback-source/supabase/functions/make-server-1ccce916'])assert.ok(w.includes(literal),literal);
 assert.ok(w.indexOf('Synthetic negative controls')<w.indexOf('secrets.SUPABASE_ACCESS_TOKEN'));
 assert.ok(w.indexOf('Reject unfrozen source before credentials')<w.indexOf('Checkout fixed reviewed candidate'));
});
test('configured recovery checkout has the pinned full source and independent type-only proof',async()=>{
 assert.ok(process.env.RELEASE_TEST_BASELINE,'RELEASE_TEST_BASELINE must point to the independently checked-out recovery runtime');
 const path=resolve(process.env.RELEASE_TEST_BASELINE),git=await diagnosticInventory(path);
 assert.deepEqual(await fingerprint(path),{count:109,hash:ROLLBACK.full});assert.equal((await proveTypeOnly(path,ts)).emitsOnlyEmptyModules,true);
 // Independent local consistency check against an already observed native pin;
 // this calculation does not claim a new deployment download or observation.
 const entries=git.entries.filter(e=>!Object.hasOwn(OMITTED,e.path));
 const subset={count:entries.filter(e=>e.type==='file').length,hash:hash(entries.map(e=>`${e.path}${e.type==='directory'?'/':''}\0${e.type==='directory'?'directory':e.sha256}\n`).join(''))};
 assert.deepEqual(subset,ROLLBACK.native);
 for(const omitted of [[],[Object.keys(OMITTED)[0]],Object.keys(OMITTED)])validateRawInventory(raw(git,omitted),git,Buffer.from(DEPLOY_CONFIG),Buffer.from('v2.122.0'));
});
