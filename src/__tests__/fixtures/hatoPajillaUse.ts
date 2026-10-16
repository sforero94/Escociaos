import {prepared as deathPrepared,OWNER,KEY,ANIMAL} from './hatoDeath';
import {expectedPajillaUse,type PajillaUseIntent,type PajillaUseResult} from '@/utils/hato/hatoPajillaUseProtocol';
export {OWNER,OTHER,KEY,ANIMAL} from './hatoDeath';
export const LOT='70000000-0000-4000-8000-000000000092',BULL='70000000-0000-4000-8000-000000000091',USE='70000000-0000-4000-8000-000000000081';
export const intent:PajillaUseIntent={version:1,pajillaId:LOT,fechaUso:'2026-10-14',animalId:null};
export function prepared(key=KEY,p=intent):PajillaUseResult{
 const original={lot:{id:LOT,toro_id:BULL,cantidad_inicial:0,activa:true,created_at:null,created_by:null},toro:{id:BULL,nombre:'Synthetic reviewed bull',tipo:'inseminacion',raza:null,activo:true,created_at:null,created_by:null},graph:p.animalId?{...deathPrepared().original!,animal:{...deathPrepared().original!.animal,id:p.animalId}}:null,uses:[],stock:{pajilla_id:LOT,toro_id:BULL,cantidad_inicial:0,usos:0,cantidad_actual:0}};
 return {version:1,requestKey:key,owner:OWNER,state:'pending',intent:structuredClone(p),original,plan:expectedPajillaUse(p,OWNER,USE),effectiveDate:'2026-10-16',receipt:null};
}
export function committed(r=prepared()):PajillaUseResult{const q=structuredClone(r),t='2026-10-16T13:00:00.123456+00:00',usage={...q.plan!,created_at:t};q.state='committed';q.receipt={version:1,requestKey:q.requestKey,owner:OWNER,intent:structuredClone(q.intent!),original:structuredClone(q.original!),plan:structuredClone(q.plan!),effectiveDate:q.effectiveDate!,actor:{origin:'web',profileId:OWNER},recordedAt:t,after:{...structuredClone(q.original!),uses:[usage],stock:{...q.original!.stock,usos:1,cantidad_actual:-1}},usage};return q;}
