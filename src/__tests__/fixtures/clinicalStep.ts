import type {ClinicalResult,ClinicalIntent,ClinicalSnapshot} from '@/utils/hato/clinicalStepConfirmationProtocol';
export const OWNER='10000000-0000-4000-8000-000000000001',OTHER='10000000-0000-4000-8000-000000000002';
export const KEY='20000000-0000-4000-8000-000000000001',STEP='30000000-0000-4000-8000-000000000001',ANIMAL='40000000-0000-4000-8000-000000000001',HEADER='50000000-0000-4000-8000-000000000001',ALERT='60000000-0000-4000-8000-000000000001';
export const intent:ClinicalIntent={version:1,stepId:STEP,fechaEjecutada:'2026-10-14',alertId:ALERT};
const t0='2026-10-14T12:00:00+00:00',t1='2026-10-14T13:00:00.123456+00:00';
export function prepared(key=KEY,p=intent):ClinicalResult{
 const original:ClinicalSnapshot={animal:{id:ANIMAL,numero:1,nombre:'Synthetic animal'},header:{id:HEADER,animal_id:ANIMAL,chequeo_id:null,protocolo_id:null,nombre:'Synthetic treatment',fecha_inicio:'2026-10-14',estado:'activo',nota:null,created_at:null,created_by:OWNER,fuente:null},steps:[{id:p.stepId,tratamiento_id:HEADER,paso_num:1,descripcion:'Synthetic step',offset_dias:0,fecha_programada:'2026-10-14',fecha_ejecutada:null,requiere_confirmacion:true,created_at:null}],alerts:[{id:ALERT,tipo:'tratamiento_paso',animal_id:ANIMAL,regla_clave:'synthetic',fecha_programada:'2026-10-14',estado:'enviada',destinatario_telegram_id:null,intentos:0,respuesta:null,respondida_por:null,paso_id:p.stepId,datos:['legacy JSONB preserved'],escalada_at:null,created_at:null,updated_at:t0,created_by:null}]};
 return {version:1,requestKey:key,actor:{origin:'web',profileId:OWNER},intent:structuredClone(p),original,action:null,state:'pending',receipt:null};
}
export function committed(p=prepared()):ClinicalResult{
 const result=structuredClone(p),after=structuredClone(p.original!);after.header.estado='completado';after.steps[0].fecha_ejecutada=p.intent!.fechaEjecutada;Object.assign(after.alerts[0],{estado:'confirmada',respuesta:'si',respondida_por:'synthetic@invalid.test',updated_at:t1});
 result.state='committed';result.receipt={version:1,recordedAt:t1,requestKey:p.requestKey!,actor:structuredClone(p.actor),intent:structuredClone(p.intent!),original:structuredClone(p.original!),action:structuredClone(p.action),before:structuredClone(p.original!),after};return result;
}
