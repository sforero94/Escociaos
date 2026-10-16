import {prepared as alertPrepared,OWNER,KEY,ANIMAL} from './alertResponse';
import type {DeathIntent,DeathResult} from '@/utils/hato/hatoDeathProtocol';
export {OWNER,OTHER,KEY,ANIMAL} from './alertResponse';
export const EVENT='70000000-0000-4000-8000-000000000021';
export const intent:DeathIntent={version:1,animalId:ANIMAL,date:'2026-10-14',cause:'Synthetic observed cause',observedAnimal:alertPrepared().original!.animal!};
export function prepared(key=KEY,p=intent):DeathResult{return {version:1,requestKey:key,owner:OWNER,state:'pending',intent:structuredClone(p),eventId:EVENT,original:{animal:structuredClone(p.observedAnimal),events:[],headers:[],steps:[],alerts:[],checks:[],checkHeaders:[]},receipt:null};}
export function committed(r=prepared()):DeathResult{
 const result=structuredClone(r),p=result.intent!,b=result.original!,t='2026-10-14T13:00:00.123456+00:00',animal={...b.animal,estado:'muerta',fecha_estado:p.date};
 const event=Object.fromEntries(['id','animal_id','tipo','fecha','fecha_confianza','toro_id','tipo_servicio','cria_id','cria_destino','sx_raw','chequeo_vaca_id','alerta_id','transaccion_ganado_id','fuente','datos','created_at','created_by','fin_ingreso_id'].map(k=>[k,null]));Object.assign(event,{id:r.eventId,animal_id:p.animalId,tipo:'muerte',fecha:p.date,fecha_confianza:'exacta',fuente:'web',datos:p.cause?{causa:p.cause}:null,created_by:OWNER,created_at:t});
 result.state='committed';result.receipt={version:1,requestKey:r.requestKey,owner:OWNER,intent:structuredClone(p),original:structuredClone(b),eventId:r.eventId!,actor:{origin:'web',profileId:OWNER},recordedAt:t,after:{...structuredClone(b),animal,events:[...b.events,event].sort((a,b)=>String(a.id).localeCompare(String(b.id)))},correction:{id:'70000000-0000-4000-8000-000000000022',tabla:'hato_animales',fila_id:p.animalId,operacion:'update',datos_anteriores:structuredClone(b.animal),datos_nuevos:animal,animal_id:p.animalId,corregido_por:OWNER,corregido_en:t,motivo:null}};return result;
}
