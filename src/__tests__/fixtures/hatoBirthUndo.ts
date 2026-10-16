import {committed as birthCommitted,actor as creationActor,KEY,OTHER,OWNER} from './hatoBirthTelegram';
import type {BirthUndoResult} from '@/utils/hato/hatoBirthUndoProtocol';
export {KEY,OTHER,OWNER};
export const action={sender:789,chatId:789,messageId:601};
export function prepared():BirthUndoResult{
 const creation=birthCommitted(),q=creation.receipt!,calf=q.calf!,snapshot={...structuredClone(creation.original!),graph:structuredClone(q.after),animals:[...structuredClone(creation.original!.animals),structuredClone(calf)].sort((a,b)=>String(a.id).localeCompare(String(b.id)))},event=q.after.events.find(e=>e.id===creation.plan!.events[0].id)!;
 return {version:1,requestKey:OTHER,actor:{...structuredClone(creationActor),profileId:OWNER,displayName:'Actual Gerencia'},action:structuredClone(action),eventId:String(event.id),original:{creation,snapshot,event:structuredClone(event),calf:structuredClone(calf)},effectiveDate:'2026-10-16',state:'pending',receipt:null};
}
export function committed():BirthUndoResult{
 const p=prepared(),o=p.original!,time='2026-10-16T18:00:00.123456+00:00';p.state='committed';p.receipt={version:1,requestKey:p.requestKey!,actor:structuredClone(p.actor),action:structuredClone(action),eventId:p.eventId!,original:structuredClone(o),effectiveDate:p.effectiveDate!,recordedAt:time,after:{event:null,calf:null,graph:{...structuredClone(o.snapshot.graph),events:o.snapshot.graph.events.filter(e=>e.id!==p.eventId)},animals:structuredClone(o.snapshot.animals.filter(a=>a.id!==o.calf.id))},corrections:[o.event,o.calf].map((row,index)=>({id:index===0?KEY:'70000000-0000-4000-8000-000000000099',tabla:index===0?'hato_eventos':'hato_animales',fila_id:row.id,operacion:'delete',datos_anteriores:structuredClone(row),datos_nuevos:null,animal_id:index===0?o.event.animal_id:o.calf.id,corregido_por:p.actor.profileId,corregido_en:time,motivo:null})),footprints:{before:'a'.repeat(64),after:'b'.repeat(64)}};return p;
}
