import type {AlertResponseResult,AlertResponseIntent,AlertResponseSnapshot} from '@/utils/hato/alertResponseProtocol';
import {prepared as clinicalPrepared,OWNER,KEY,ANIMAL,ALERT} from './clinicalStep';
export {OWNER,OTHER,KEY,ANIMAL,ALERT} from './clinicalStep';
export const intent:AlertResponseIntent={version:1,alertId:ALERT,respuesta:'si',fecha:'2026-10-14'};
export function prepared(key=KEY,p=intent):AlertResponseResult{
 const c=clinicalPrepared(),animal=Object.fromEntries(['id','numero','nombre','sexo','etapa','raza','estado','fecha_estado','fecha_nacimiento','fecha_nacimiento_confianza','madre_id','padre_toro_id','padre_id','finca_id','origen','confianza','import_meta','notas','created_at','created_by','etapa_forzada'].map(k=>[k,null]));Object.assign(animal,{id:ANIMAL,numero:1,nombre:'Synthetic animal',sexo:'hembra',etapa:'vaca',estado:'activa',etapa_forzada:false});
 const original:AlertResponseSnapshot={animal,alert:{...c.original!.alerts[0],id:p.alertId,tipo:'secado_due',paso_id:null},events:[],clinical:null};
 return {version:1,requestKey:key,actor:{origin:'web',profileId:OWNER},intent:structuredClone(p),original,action:null,state:'pending',receipt:null};
}
export function committed(p=prepared()):AlertResponseResult{
 const result=structuredClone(p),after=structuredClone(p.original!),t='2026-10-14T13:00:00.123456+00:00';
 Object.assign(after.alert,{estado:p.intent!.respuesta==='si'?'confirmada':'respondida',respuesta:p.intent!.respuesta,respondida_por:p.actor.origin==='telegram'?(p.actor.displayName??`Telegram ${p.actor.sender}`):'synthetic@invalid.test',updated_at:t});
 if(p.intent!.respuesta==='si'&&after.alert.tipo==='secado_due'){const e=Object.fromEntries(['id','animal_id','tipo','fecha','fecha_confianza','toro_id','tipo_servicio','cria_id','cria_destino','sx_raw','chequeo_vaca_id','alerta_id','transaccion_ganado_id','fuente','datos','created_at','created_by','fin_ingreso_id'].map(k=>[k,null]));Object.assign(e,{id:'70000000-0000-4000-8000-000000000001',animal_id:ANIMAL,tipo:'secado_real',fecha:p.intent!.fecha,fecha_confianza:'aproximada',alerta_id:p.intent!.alertId,fuente:'alerta',created_at:t,created_by:p.actor.profileId});after.events.push(e);}
 if(after.clinical)after.clinical.alerts=after.clinical.alerts.map(a=>a.id===p.intent!.alertId?after.alert:a);
 result.state='committed';result.receipt={version:1,recordedAt:t,requestKey:p.requestKey!,actor:structuredClone(p.actor),intent:structuredClone(p.intent!),original:structuredClone(p.original!),action:structuredClone(p.action),before:structuredClone(p.original!),after};return result;
}
