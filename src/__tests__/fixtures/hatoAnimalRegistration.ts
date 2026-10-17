import {OWNER,KEY,ANIMAL} from './hatoDeath';
import {expectedAnimalRegistration,type AnimalRegistrationIntent,type AnimalRegistrationResult} from '@/utils/hato/hatoAnimalRegistrationProtocol';
export {OWNER,OTHER,KEY,ANIMAL} from './hatoDeath';
export const intent:AnimalRegistrationIntent={version:1,input:{numero:null,nombre:'Reviewed animal',etapa:'ternera',raza:null,fecha_nacimiento:null,origen:'compra'}};
export function prepared(p=intent,key=KEY):AnimalRegistrationResult{return {version:1,requestKey:key,owner:OWNER,state:'pending',intent:structuredClone(p),original:{animals:[]},plan:expectedAnimalRegistration(p,OWNER,ANIMAL),effectiveDate:'2026-10-17',receipt:null,acknowledged:false};}
export function committed(r=prepared()):AnimalRegistrationResult{const q=structuredClone(r),time='2026-10-17T12:00:00.123456+00:00';q.state='committed';q.receipt={version:1,requestKey:q.requestKey,owner:q.owner,intent:q.intent!,original:q.original!,plan:q.plan!,effectiveDate:q.effectiveDate!,actor:{origin:'web',profileId:q.owner},recordedAt:time,before:null,after:{...q.plan!,created_at:time},footprints:{before:'a'.repeat(64),after:'b'.repeat(64)}};return q;}
