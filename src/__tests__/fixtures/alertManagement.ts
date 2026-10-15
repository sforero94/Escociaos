import type {AlertManagementIntent,AlertManagementResult,AlertManagementSnapshot} from '@/utils/hato/alertManagementProtocol';
import {prepared as response,OWNER,KEY,ANIMAL,ALERT} from './alertResponse';
export {OWNER,OTHER,KEY,ANIMAL,ALERT} from './alertResponse';
export const intent:Extract<AlertManagementIntent,{kind:'create'}>={version:1,kind:'create',tipo:'secado_due',animalId:ANIMAL,pasoId:null,fechaProgramada:'2026-10-14',nota:'Synthetic manual note'};
export function prepared(key=KEY,p:AlertManagementIntent=intent):AlertManagementResult{
 const base=response().original!;
 const original:AlertManagementSnapshot=p.kind==='create'?{targetId:ALERT,targets:[],animal:structuredClone(base.animal),clinical:null,events:[]}:{targetId:null,targets:p.alerts.map(a=>({...structuredClone(base),alert:structuredClone(a)})),animal:null,clinical:null,events:[]};
 return {version:1,requestKey:key,actor:{origin:'web',profileId:OWNER},intent:structuredClone(p),original,action:null,state:'pending',receipt:null};
}
export function committed(p=prepared()):AlertManagementResult{
 const r=structuredClone(p),after=structuredClone(p.original!),i=p.intent!,t='2026-10-14T13:00:00.123456+00:00';
 if(i.kind==='create'){
  const alert={id:after.targetId,tipo:i.tipo,animal_id:i.animalId,paso_id:i.pasoId,regla_clave:`manual:${i.tipo}:${i.animalId??'hato'}:${i.fechaProgramada}:${p.requestKey}`,fecha_programada:i.fechaProgramada,estado:'pendiente',intentos:0,destinatario_telegram_id:null,respuesta:null,respondida_por:null,datos:{origen:'manual',...(i.nota?{nota:i.nota}:{})},escalada_at:null,created_at:t,updated_at:t,created_by:p.actor.profileId};
  after.targets=[{alert,animal:after.animal,events:after.events,clinical:after.clinical}];
 }else for(const target of after.targets){target.alert.updated_at=t;if(i.kind==='edit'){const datos={...(target.alert.datos as Record<string,unknown>??{})};delete datos.nota_gestor;if(i.nota)datos.nota_gestor=i.nota;Object.assign(target.alert,{fecha_programada:i.fechaProgramada,datos});}else Object.assign(target.alert,{estado:'descartada',respondida_por:'synthetic@invalid.test'});}
 r.state='committed';r.receipt={version:1,recordedAt:t,requestKey:p.requestKey,actor:structuredClone(p.actor),intent:structuredClone(i),original:structuredClone(p.original!),action:null,before:structuredClone(p.original!),after};return r;
}
