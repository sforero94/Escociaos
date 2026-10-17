import {expectedCatalogCreation,type CatalogCreationIntent,type CatalogCreationResult} from '@/utils/hato/hatoCatalogCreationProtocol';
import {OWNER,OTHER,KEY,ANIMAL} from './hatoDeath';
export {OWNER,OTHER,KEY,ANIMAL};
export const bull={id:OTHER,nombre:'Captured active bull',tipo:'inseminacion' as const,raza:'Captured breed',activo:true,created_at:null,created_by:null};
export const lotIntent:CatalogCreationIntent={version:1,kind:'lot',input:{toro_id:OTHER,cantidad_inicial:0}};
export const toroIntent:CatalogCreationIntent={version:1,kind:'toro',input:{nombre:'Captured new bull',tipo:null,raza:null,activo:false}};
export function prepared(p=lotIntent,key=KEY):CatalogCreationResult{return {version:1,requestKey:key,owner:OWNER,state:'pending',intent:structuredClone(p),original:{toros:[structuredClone(bull)],lots:[],uses:[]},plan:expectedCatalogCreation(p,OWNER,ANIMAL),effectiveDate:'2026-10-17',receipt:null,acknowledged:false};}
export function committed(r=prepared()):CatalogCreationResult{const q=structuredClone(r),time='2026-10-17T12:00:00.123456+00:00';q.state='committed';q.receipt={version:1,requestKey:q.requestKey,owner:q.owner,intent:q.intent!,original:q.original!,plan:q.plan!,effectiveDate:q.effectiveDate!,actor:{origin:'web',profileId:q.owner},recordedAt:time,before:null,after:{...q.plan!.row,created_at:time},footprints:{before:'a'.repeat(64),after:'b'.repeat(64)}};return q;}
