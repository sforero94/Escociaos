import {prepared as cyclePrepared} from './hatoCycle';
import {KEY,OTHER} from './hatoDeath';
import {expectedBirthPlan,type BirthActor,type BirthIntent,type BirthResult} from '@/utils/hato/hatoBirthTelegramProtocol';
export {KEY,OTHER,OWNER,ANIMAL} from './hatoDeath';
export const action={sender:789,chatId:789,messageId:91};
export const actor:BirthActor={origin:'telegram',registrationId:OTHER,profileId:null,sender:789,displayName:'Synthetic field worker'};
export const intent:BirthIntent={version:1,animalId:cyclePrepared().intent!.animalId,fecha:'2026-10-14',criaDestino:'retenida',observedAnimal:cyclePrepared().original!.graph.animal};
export function prepared(p=intent,a=actor):BirthResult{const original=cyclePrepared().original!;original.graph.animal=structuredClone(p.observedAnimal);original.animals=[original.graph.animal];return {version:1,requestKey:KEY,action,actor:a,state:'pending',intent:structuredClone(p),original,plan:expectedBirthPlan(p,original,{event:'70000000-0000-4000-8000-000000000081',calf:p.criaDestino==='retenida'?'70000000-0000-4000-8000-000000000082':null},a),effectiveDate:'2026-10-16',receipt:null};}
export function committed(r=prepared()):BirthResult{const q=structuredClone(r),time='2026-10-16T13:00:00.123456+00:00';q.state='committed';q.receipt={version:1,requestKey:q.requestKey!,actor:structuredClone(q.actor),action:structuredClone(q.action),intent:q.intent!,original:q.original!,plan:q.plan!,effectiveDate:q.effectiveDate!,recordedAt:time,after:{...structuredClone(q.original!.graph),events:[...q.original!.graph.events,...q.plan!.events.map((e):Record<string,unknown>=>({...e,created_at:time}))].sort((a,b)=>String(a.id).localeCompare(String(b.id)))},calf:q.plan!.calf?{...q.plan!.calf,created_at:time}:null};return q;}
