import {canonicalTreatmentProposal,prepareWebTreatment,queryWebTreatment,resolveWebTreatmentKey,validateTreatmentResult,type TreatmentClient,type TreatmentProposal,type TreatmentResult} from './hatoTreatmentCreation';
export interface BrowserTreatmentClient extends TreatmentClient {auth:{getUser():PromiseLike<{data:{user:{id:string}|null};error:unknown}>}}
export interface BrowserTreatmentAttempt {owner:string;key:string;payload:TreatmentProposal;result:TreatmentResult|null}
const uuid=(s:unknown):s is string=>typeof s==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
export const treatmentCanonical=(v:unknown):string=>JSON.stringify(v,(_k,x)=>x&&typeof x==='object'&&!Array.isArray(x)?Object.fromEntries(Object.entries(x).sort(([a],[b])=>a.localeCompare(b))):x);
const slot=(owner:string,animal:string)=>`hato_treatment_attempt_v1:${owner}:${animal}`;
const fail=():never=>{throw new Error('Conserve el intento original y verifique su resultado antes de registrar otro tratamiento.');};
export function pendingBrowserTreatment(owner:string,animal:string):BrowserTreatmentAttempt|null {
 if(!uuid(owner)||!uuid(animal))return fail();const raw=localStorage.getItem(slot(owner,animal));if(raw===null)return null;
 try{const a=JSON.parse(raw) as BrowserTreatmentAttempt;
  if(!a||Object.keys(a).sort().join('|')!=='key|owner|payload|result'||a.owner!==owner||!uuid(a.key)||a.payload.animalId!==animal||treatmentCanonical(canonicalTreatmentProposal(a.payload))!==treatmentCanonical(a.payload))return fail();
  if(a.result!==null)validateTreatmentResult(a.result,owner,a.payload,null,a.key);return a;
 }catch{return fail();}
}
async function authorize(c:BrowserTreatmentClient,owner:string,current:()=>boolean){const r=await c.auth.getUser();if(r.error||r.data.user?.id!==owner||!current())throw new Error('La sesión o el formulario cambió. Conserve el intento pendiente.');}
/** Keep terminal proof until explicit new-treatment review, fencing duplicate tabs/submits. */
export async function runBrowserTreatment(c:BrowserTreatmentClient,owner:string,animal:string,proposal:TreatmentProposal|null,mode:'post'|'retry'|'status'|'resolve'|'new',current:()=>boolean):Promise<TreatmentResult|null>{
 if(!uuid(owner)||!uuid(animal)||!['post','retry','status','resolve','new'].includes(mode)||!globalThis.navigator?.locks)throw new Error('Use un navegador actualizado con HTTPS para registrar el tratamiento.');
 return navigator.locks.request(slot(owner,animal),{mode:'exclusive'},async()=>{
  await authorize(c,owner,current);let a=pendingBrowserTreatment(owner,animal);
  if(!a){if(mode!=='post'||!proposal)return fail();const p=canonicalTreatmentProposal(proposal);if(p.animalId!==animal)return fail();
   a={owner,key:crypto.randomUUID(),payload:p,result:null};localStorage.setItem(slot(owner,animal),JSON.stringify(a));
   if(treatmentCanonical(pendingBrowserTreatment(owner,animal))!==treatmentCanonical(a))return fail();
  }else if(mode==='post'&&proposal&&treatmentCanonical(a.payload)!==treatmentCanonical(canonicalTreatmentProposal(proposal)))return fail();
  await authorize(c,owner,current);
  let result:TreatmentResult;
  if(mode==='post'||mode==='retry'){
   const prepared=await prepareWebTreatment(c,owner,a.key,a.payload);await authorize(c,owner,current);
   result=prepared.state==='pending'?await queryWebTreatment(c,owner,prepared,'post'):prepared;
  }else result=await resolveWebTreatmentKey(c,owner,a.key,a.payload,mode==='resolve'?'resolve':'status');
  await authorize(c,owner,current);
  if(treatmentCanonical(pendingBrowserTreatment(owner,animal))!==treatmentCanonical(a))return fail();
  if(mode==='new'){
   if(result.state!=='committed'&&result.state!=='canceled')return fail();localStorage.removeItem(slot(owner,animal));return result;
  }
  localStorage.setItem(slot(owner,animal),JSON.stringify({...a,result}));return result;
 });
}
