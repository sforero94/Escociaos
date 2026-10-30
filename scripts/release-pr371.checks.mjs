import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {BASELINE,FULL,NATIVE_ROLLBACK,SOURCE,EDGE_TREE,ROLLBACK_SOURCE,ROLLBACK_TREE,TARGET,context,mode,proof,receipt,checkReceipt,diagnose,release,reviewedDiagnostic,healthProbe} from './release-pr371.mjs';
import {OMITTED} from './release-pr367-capture.mjs';
import {fingerprint} from './release-pr367.mjs';
const run={runId:'200',controlSha:'c'.repeat(40)}, prior={...run,runId:'100'};
const meta=(version=281,patch={})=>({slug:TARGET,name:TARGET,id:'9defb252-5ea2-463b-b91b-497e0a7fe582',import_map:false,entrypoint_path:`file:///tmp/user_fn_ywhtjwawnkeqlwxbvgup_9defb252-5ea2-463b-b91b-497e0a7fe582_${version}/source/supabase/functions/${TARGET}/index.ts`,version,status:'ACTIVE',verify_jwt:false,ezbr_sha256:version===281?BASELINE.hash:(version===282?'a':'b').repeat(64),updated_at:BASELINE.updatedAt+version-281,...patch});
const capture=(kind='rollback')=>({fingerprint:{count:82,hash:FULL[kind]},evidence:{native:{count:80,hash:kind==='rollback'?NATIVE_ROLLBACK:'d'.repeat(64)},reconstructed:{count:82,hash:FULL[kind],restoredFromGit:Object.keys(OMITTED)},typeProof:{typeScriptVersion:'5.9.3',emitsOnlyEmptyModules:true}}});
const approved=()=>receipt(capture(),prior);
function harness({metadata=[meta(),meta(),meta(),meta(282),meta(282)],health=[true],mutate,deploy}={}){
  const calls=[];let i=0,h=0;
  return {calls,ops:{metadata:async()=>{calls.push('metadata');assert.ok(i<metadata.length);return metadata[i++];},verifySource:async()=>{calls.push('source');},capture:async(name,kind)=>{calls.push(`capture:${name}`);const p=capture(kind);if(mutate)mutate(p,name);return p;},deploy:async kind=>{calls.push(`deploy:${kind}`);if(deploy)await deploy(kind);},health:async()=>{calls.push('health');assert.ok(h<health.length);const value=health[h++];if(value instanceof Error)throw value;return value;}}};
}
test('pinned runtime and rollback identity are separate from old PR367 release',async()=>{
  assert.equal(SOURCE,'e7a5545bc8d87ad0502caf009d0201cae67fc772');assert.equal(ROLLBACK_SOURCE,'634580480c72b27c7ccd2d8c006af520d0ca1058');
  assert.equal(EDGE_TREE,'6e9969d49f652989ef2c1679ff24be0f976410e7');assert.equal(ROLLBACK_TREE,'99ba3737577f064e27112e4e99a8dd24739c6422');
  assert.equal((await fingerprint(`supabase/functions/${TARGET}`)).hash,FULL.release);
});
test('manual main-only context and distinct confirmations',()=>{
  const env={GITHUB_REPOSITORY:'sforero94/Escociaos',GITHUB_REF:'refs/heads/main',GITHUB_EVENT_NAME:'workflow_dispatch',GITHUB_RUN_ATTEMPT:'1',GITHUB_SHA:run.controlSha,GITHUB_RUN_ID:run.runId};
  assert.deepEqual(context(env),run);
  for(const patch of [{GITHUB_RUN_ATTEMPT:'2'},{GITHUB_RUN_ATTEMPT:undefined},{GITHUB_REF:'refs/heads/other'},{GITHUB_REPOSITORY:'other/repo'},{GITHUB_EVENT_NAME:'pull_request'},{GITHUB_SHA:'x'},{GITHUB_RUN_ID:'../../x'}])assert.throws(()=>context({...env,...patch}));
  assert.equal(mode('diagnose','DIAGNOSE_PR371_V281_ONLY'),'diagnose');assert.equal(mode('release','DEPLOY_PR371_WITH_REVIEWED_V281_ROLLBACK'),'release');
  for(const args of [['release','DIAGNOSE_PR371_V281_ONLY'],['diagnose','DEPLOY_PR371_WITH_REVIEWED_V281_ROLLBACK'],['release','DEPLOY_PR367_WITH_VERIFIED_GIT_ROLLBACK'],['other','']])assert.throws(()=>mode(...args));
});
test('diagnosis observes capture before emitting receipt and has no deployment capability',async()=>{
  const {calls,ops}=harness({metadata:[meta(),meta()]});
  const result=await diagnose({metadata:ops.metadata,verifySource:ops.verifySource,capture:ops.capture},prior);
  assert.deepEqual(calls,['metadata','source','capture:diagnostic','metadata']);assert.equal(result.deploymentAttempted,false);assert.deepEqual(result.receipt,approved());
});
test('expected Git hashes alone do not provide a release receipt',async()=>{
  const {calls,ops}=harness();await assert.rejects(release(ops,null,run));assert.deepEqual(calls,[]);
  assert.throws(()=>checkReceipt({...approved(),runId:'200'},run));assert.throws(()=>checkReceipt({...approved(),controlSha:'a'.repeat(40)},run));
});
for(const patch of [{version:282},{verify_jwt:true},{import_map:true},{status:'FAILED'},{updated_at:BASELINE.updatedAt+1},{ezbr_sha256:'e'.repeat(64)},{slug:'another'}])test(`baseline mismatch stops before source/capture ${JSON.stringify(patch)}`,async()=>{const {calls,ops}=harness({metadata:[meta(281,patch)]});await assert.rejects(release(ops,approved(),run));assert.deepEqual(calls,['metadata']);});
for(const kind of ['native-count','native-hash','full-count','full-hash','restored-path','runtime-type','ts-version'])test(`invalid observed proof fails closed ${kind}`,async()=>{
  const p=capture();if(kind==='native-count')p.evidence.native.count=82;if(kind==='native-hash')p.evidence.native.hash='a'.repeat(64);if(kind==='full-count')p.fingerprint.count=80;if(kind==='full-hash')p.evidence.reconstructed.hash='e'.repeat(64);if(kind==='restored-path')p.evidence.reconstructed.restoredFromGit.push('runtime.ts');if(kind==='runtime-type')p.evidence.typeProof.emitsOnlyEmptyModules=false;if(kind==='ts-version')p.evidence.typeProof.typeScriptVersion='other';assert.throws(()=>proof(p));
});
test('one release follows two current reviewed captures and verifies deployed source',async()=>{
  const {calls,ops}=harness();assert.equal((await release(ops,approved(),run)).state,'released');
  assert.deepEqual(calls,['metadata','source','capture:first','capture:second','metadata','source','metadata','deploy:release','metadata','health','capture:deployed','metadata']);
});
test('changed current capture cannot borrow a prior valid diagnostic',async()=>{const {calls,ops}=harness({mutate:(p,name)=>{if(name==='second')p.evidence.native.hash='f'.repeat(64);}});await assert.rejects(release(ops,approved(),run));assert.ok(!calls.includes('deploy:release'));});
test('baseline change during capture cannot deploy',async()=>{const {calls,ops}=harness({metadata:[meta(),meta(282)]});await assert.rejects(release(ops,approved(),run));assert.ok(!calls.includes('deploy:release'));});
test('CLI uncertain outcome never retries or blindly rolls back',async()=>{const {calls,ops}=harness({deploy:()=>{throw Error('synthetic uncertainty');}});await assert.rejects(release(ops,approved(),run));assert.equal(calls.filter(c=>c.startsWith('deploy:')).length,1);});
for(const patch of [{version:284},{ezbr_sha256:BASELINE.hash},{status:'DEPLOYING'}])test(`unknown postdeploy ownership/status stops without rollback ${JSON.stringify(patch)}`,async()=>{const {calls,ops}=harness({metadata:[meta(),meta(),meta(),meta(282,patch)]});await assert.rejects(release(ops,approved(),run));assert.ok(!calls.includes('deploy:rollback'));});
test('unknown health is not rollback permission',async()=>{const {calls,ops}=harness({health:[Error('network unavailable')]});await assert.rejects(release(ops,approved(),run));assert.ok(!calls.includes('deploy:rollback'));});
test('unknown postdeploy source layout stops without blind rollback',async()=>{const {calls,ops}=harness({mutate:(_,name)=>{if(name==='deployed')throw Error('unknown layout');}});await assert.rejects(release(ops,approved(),run));assert.ok(!calls.includes('deploy:rollback'));});
test('confirmed health failure rolls back only stable owned release and verifies restored source',async()=>{
  const {calls,ops}=harness({metadata:[meta(),meta(),meta(),meta(282),meta(282),meta(283),meta(283)],health:[false,true]});assert.equal((await release(ops,approved(),run)).state,'rolled-back');assert.ok(calls.includes('capture:restored'));
});
test('concurrent deployment blocks rollback',async()=>{const {calls,ops}=harness({metadata:[meta(),meta(),meta(),meta(282),meta(283)],health:[false]});await assert.rejects(release(ops,approved(),run));assert.ok(!calls.includes('deploy:rollback'));});
test('rollback CLI uncertainty never retries',async()=>{const {calls,ops}=harness({metadata:[meta(),meta(),meta(),meta(282),meta(282)],health:[false],deploy:kind=>{if(kind==='rollback')throw Error('uncertain rollback');}});await assert.rejects(release(ops,approved(),run));assert.deepEqual(calls.filter(c=>c.startsWith('deploy:')),['deploy:release','deploy:rollback']);});
function authenticatedEvidence({infoPatch={},jobsPatch={},log,location='https://synthetic.blob.core.windows.net/log',deny=false}={}){
  const raw=JSON.stringify(approved());const digest=createHash('sha256').update(raw).digest('hex');const calls=[];
  const request=async(url,options)=>{
    calls.push({url,options});
    assert.equal(options.headers?.Authorization,url.startsWith('https://api.github.com/repos/sforero94/Escociaos/actions/')?'Bearer synthetic-actions-read':undefined);
    if(deny)return new Response('',{status:403});
    if(url.endsWith('/runs/100'))return Response.json({id:100,path:'.github/workflows/release-pr371-once.yml',event:'workflow_dispatch',head_branch:'main',head_sha:run.controlSha,status:'completed',conclusion:'success',run_attempt:1,...infoPatch});
    if(url.includes('/runs/100/jobs?'))return Response.json({total_count:1,jobs:[{id:300,name:'release',status:'completed',conclusion:'success'}],...jobsPatch});
    if(url.endsWith('/jobs/300/logs'))return new Response(null,{status:302,headers:{location}});
    if(url===location)return new Response(log??`2031-05-01T00:00:00.000Z PR371_DIAGNOSTIC_RECEIPT ${raw}\n`);
    throw Error('Unexpected synthetic request');
  };return {request,calls,raw,digest};
}
test('observed prior receipt requires matching successful authenticated run/job/log and exact reviewed digest',async()=>{const h=authenticatedEvidence();assert.deepEqual(await reviewedDiagnostic('100',h.digest,run,'synthetic-actions-read',h.request),approved());assert.equal(h.calls.length,4);assert.equal(h.calls[2].options.redirect,'manual');});
for(const infoPatch of [{path:'.github/workflows/other.yml'},{head_sha:'a'.repeat(40)},{head_branch:'other'},{event:'pull_request'},{conclusion:'failure'},{status:'in_progress'},{run_attempt:2},{id:101}])test(`rejects other/failed/retried diagnostic ${JSON.stringify(infoPatch)}`,async()=>{const h=authenticatedEvidence({infoPatch});await assert.rejects(reviewedDiagnostic('100',h.digest,run,'synthetic-actions-read',h.request));assert.equal(h.calls.length,1);});
for(const location of ['http://synthetic.blob.core.windows.net/log','https://evil.example/log','https://user:pass@synthetic.blob.core.windows.net/log','https://synthetic.blob.core.windows.net:444/log'])test(`unknown signed log route rejected ${location}`,async()=>{const h=authenticatedEvidence({location});await assert.rejects(reviewedDiagnostic('100',h.digest,run,'synthetic-actions-read',h.request));assert.equal(h.calls.length,3);});
test('authenticated evidence denial has no anonymous fallback or retry',async()=>{const h=authenticatedEvidence({deny:true});await assert.rejects(reviewedDiagnostic('100',h.digest,run,'synthetic-actions-read',h.request));assert.equal(h.calls.length,1);});
test('missing, duplicate, malformed or oversized diagnostic logs reject',async()=>{
  const first=authenticatedEvidence();for(const log of ['',`PR371_DIAGNOSTIC_RECEIPT ${first.raw}\nPR371_DIAGNOSTIC_RECEIPT ${first.raw}\n`,'x'.repeat(2*1024*1024+1)]){const h=authenticatedEvidence({log});await assert.rejects(reviewedDiagnostic('100',h.digest,run,'synthetic-actions-read',h.request));}
  const h=authenticatedEvidence();await assert.rejects(reviewedDiagnostic('100','0'.repeat(64),run,'synthetic-actions-read',h.request));
});
test('workflow is manual main-only, shares concurrency and exposes management identity only after authenticated verification',async()=>{
  const yaml=await readFile('.github/workflows/release-pr371-once.yml','utf8');assert.match(yaml,/permissions:\n  contents: read\n/);assert.match(yaml,/group: escocia-pr367-edge-release/);assert.match(yaml,/github.run_attempt == 1/);assert.match(yaml,/github.ref == 'refs\/heads\/main'/);assert.match(yaml,/actions: read/);assert.equal((yaml.match(/github\.token/g)||[]).length,1);assert.equal((yaml.match(/secrets\./g)||[]).length,1);assert.ok(yaml.indexOf('--verify-diagnostic')<yaml.indexOf('SUPABASE_ACCESS_TOKEN:'));assert.ok(!/pull_request:|push:|schedule:|contents: write|actions: write/.test(yaml));assert.match(yaml,new RegExp(SOURCE));assert.match(yaml,new RegExp(ROLLBACK_SOURCE));
});

test('health separates confirmed unhealthy responses from transport/body uncertainty',async()=>{
  let count=0;const pause=async()=>{};
  assert.equal(await healthProbe(async()=>{count++;return Response.json({status:'ok'});},pause),true);assert.equal(count,1);
  for(const response of [()=>new Response('',{status:503}),()=>new Response('malformed')]){count=0;assert.equal(await healthProbe(async()=>{count++;return response();},pause),false);assert.equal(count,3);}
  for(const response of [()=>{throw Error('network');},()=>new Response(new ReadableStream({start(controller){controller.error(Error('truncated transport'));}}))]){count=0;await assert.rejects(healthProbe(async()=>{count++;return response();},pause));assert.equal(count,3);}
});

test('missing or malformed Actions identity stops before any evidence request',async()=>{
  for(const token of [undefined,'','  ','synthetic\r\nheader']){const h=authenticatedEvidence();await assert.rejects(reviewedDiagnostic('100',h.digest,run,token,h.request));assert.equal(h.calls.length,0);}
});
test('Azure redirects never forward the GitHub identity or follow unknown destinations',async()=>{
  const h=authenticatedEvidence();await reviewedDiagnostic('100',h.digest,run,'synthetic-actions-read',h.request);
  assert.equal(h.calls[3].options.headers,undefined);assert.equal(h.calls[3].options.redirect,'error');
  assert.equal(h.calls.filter(x=>x.options.headers?.Authorization).length,3);
});
test('workflow scopes explicit GitHub token to verification step and excludes it from management environment',async()=>{
  const yaml=await readFile('.github/workflows/release-pr371-once.yml','utf8');
  const verify=yaml.split('- name: Verify selected mode')[1].split('- name: Run authorized')[0];
  const management=yaml.split('- name: Run authorized')[1].split('- name: Remove non-secret')[0];
  assert.match(verify,/DIAGNOSTIC_GITHUB_TOKEN: \$\{\{ github.token \}\}/);assert.ok(!verify.includes('SUPABASE_ACCESS_TOKEN'));
  assert.ok(!management.includes('DIAGNOSTIC_GITHUB_TOKEN'));assert.ok(!management.includes('github.token'));
});
