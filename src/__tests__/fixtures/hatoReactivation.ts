import {prepared as deathPrepared,OWNER,KEY,ANIMAL} from './hatoDeath';
import {construirNotaReactivacion} from '@/utils/hato/reactivacionAnimal';
import type {ReactivationIntent,ReactivationResult} from '@/utils/hato/hatoReactivationProtocol';
export {OWNER,OTHER,KEY,ANIMAL} from './hatoDeath';
export const candidate={id:ANIMAL,numero:1,nombre:'Synthetic animal',estado:'muerta'};
export const intent:ReactivationIntent={version:1,animalId:ANIMAL,fechaChequeo:'2026-10-14',motivo:'Synthetic observed return',observedCandidate:candidate};
export function prepared(key=KEY,p=intent):ReactivationResult{
 const original=deathPrepared().original!;Object.assign(original.animal,{...p.observedCandidate,notas:'  Original notes  \n',fecha_estado:'2026-10-13'});
 return {version:1,requestKey:key,owner:OWNER,state:'pending',intent:structuredClone(p),effectiveDate:'2026-10-16',original,receipt:null};
}
export function committed(r=prepared()):ReactivationResult{
 const result=structuredClone(r),p=result.intent!,b=result.original!,t='2026-10-16T13:00:00.123456+00:00',animal={...b.animal,estado:'activa',fecha_estado:r.effectiveDate,notas:construirNotaReactivacion({notasPrevias:b.animal.notas as string|null,estadoAnterior:String(b.animal.estado),fechaEstadoAnterior:b.animal.fecha_estado as string|null,fechaHoy:r.effectiveDate!,fechaChequeo:p.fechaChequeo,motivo:p.motivo})};
 result.state='committed';result.receipt={version:1,requestKey:r.requestKey,owner:OWNER,intent:structuredClone(p),original:structuredClone(b),effectiveDate:r.effectiveDate!,actor:{origin:'web',profileId:OWNER},recordedAt:t,after:{...structuredClone(b),animal},correction:{id:'70000000-0000-4000-8000-000000000023',tabla:'hato_animales',fila_id:p.animalId,operacion:'update',datos_anteriores:structuredClone(b.animal),datos_nuevos:animal,animal_id:p.animalId,corregido_por:OWNER,corregido_en:t,motivo:null}};return result;
}
