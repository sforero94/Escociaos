import {prepared as deathPrepared,OWNER,KEY,ANIMAL} from './hatoDeath';
import type {AnimalEditIntent,AnimalEditResult} from '@/utils/hato/hatoAnimalEditProtocol';
export {OWNER,OTHER,KEY,ANIMAL} from './hatoDeath';
export const intent:AnimalEditIntent={version:1,animalId:ANIMAL,observedAnimal:deathPrepared().original!.animal,changes:{numero:2,nombre:'Reviewed synthetic name',etapa:'vaca',raza:null,fecha_nacimiento:null,etapa_forzada:false,madre_id:null,padre_toro_id:null}};
export function prepared(key=KEY,p=intent):AnimalEditResult{
 const original={...deathPrepared().original!,animal:structuredClone(p.observedAnimal),refs:{mother:null,toro:null}};
 return {version:1,requestKey:key,owner:OWNER,state:'pending',intent:structuredClone(p),effectiveDate:'2026-10-16',original,receipt:null};
}
export function committed(r=prepared()):AnimalEditResult{
 const result=structuredClone(r),p=result.intent!,b=result.original!,t='2026-10-16T13:00:00.123456+00:00',animal={...b.animal,...p.changes};
 result.state='committed';result.receipt={version:1,requestKey:r.requestKey,owner:OWNER,intent:structuredClone(p),original:structuredClone(b),effectiveDate:r.effectiveDate!,actor:{origin:'web',profileId:OWNER},recordedAt:t,after:{...structuredClone(b),animal},correction:{id:'70000000-0000-4000-8000-000000000023',tabla:'hato_animales',fila_id:p.animalId,operacion:'update',datos_anteriores:structuredClone(b.animal),datos_nuevos:animal,animal_id:p.animalId,corregido_por:OWNER,corregido_en:t,motivo:null}};return result;
}
