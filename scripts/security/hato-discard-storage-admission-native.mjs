// Installed SDK, synthetic in-memory transport only. No hosted requests.
import fs from 'node:fs';
import {createClient} from '@supabase/supabase-js';
const fixture=JSON.parse(fs.readFileSync('src/__tests__/fixtures/hatoPhotoPreview.json','utf8'));
const captured=structuredClone(fixture.upload.receipt.objects[0].row),path=captured.name;
const replacement={...captured,id:'10000000-0000-4000-8000-000000000099',version:'synthetic-replacement-version'};
const checks=[],requests=[];const check=(v,label)=>{if(!v)throw Error(label);checks.push(label);};
let current=structuredClone(captured),replaceBeforeDelete=true,loseReply=false,removed=[];
async function transport(url,init){
 const u=new URL(String(url));if(u.href!=='https://discard.invalid/storage/v1/object/hato-pesajes-fotos'||init.method!=='DELETE')throw Error('Hosted/unexpected access forbidden');
 const body=JSON.parse(String(init.body)),headers=Object.fromEntries(new Headers(init.headers));requests.push({body,headers});
 if(replaceBeforeDelete){current=structuredClone(replacement);replaceBeforeDelete=false;}
 removed=current&&body.prefixes.includes(current.name)?[current]:[];current=null;
 if(loseReply)throw Error('Synthetic reply lost after accepted deletion');
 return new Response(JSON.stringify(removed),{headers:{'Content-Type':'application/json'}});
}
const sdk=createClient('https://discard.invalid','synthetic-no-credentials',{global:{fetch:transport},auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});
const result=await sdk.storage.from('hato-pesajes-fotos').remove([path]);
check(!result.error&&requests.length===1,'actual installed SDK accepts successful path-only removal');
check(JSON.stringify(requests[0].body)===JSON.stringify({prefixes:[path]}),'request body contains only prefixes; no expected object UUID/version/hash');
check(!Object.keys(requests[0].headers).some(k=>['if-match','if-unmodified-since'].includes(k.toLowerCase())),'remove supplies no conditional object revision header');
check(removed.length===1&&removed[0].id!==captured.id&&removed[0].version!==captured.version,'replacement after source check is removed by same path request in synthetic race');
check(current===null&&result.data?.[0].id===replacement.id,'successful response/absent path can follow deletion of replacement identity');
current=structuredClone(captured);loseReply=true;let failed=false;try{const r=await sdk.storage.from('hato-pesajes-fotos').remove([path]);failed=!!r.error;}catch{failed=true;}
check(failed&&current===null&&requests.length===2,'accepted deletion with lost reply remains uncertain to caller; no retry performed');
check(fixture.preview.capture_after.filas_escritas===null,'verified photo/OCR proof retains unknown milk-write count; count cannot authorize row deletion');
process.stdout.write(JSON.stringify({assertions:checks.length,checks,conditional_identity_in_request:false,hosted_behavior_certified:false,scope:'Synthetic counterexample through actual installed SDK; not a production incident or hosted guarantee.'})+'\n');
