#!/usr/bin/env node
// Emits invented captures only. Does not read a question bank or any environment.
import { cargar } from './cargar.mjs';
const { huella }=cargar();
const captures=[];
for(let week=1;week<=2;week++) for(let id=1;id<=20;id++) for(const channel of ['web','telegram']) {
  const response={motor:'sql',texto:'Valores sintéticos: cero y sin dato.',sugerencias:['Ver detalle'],consultas:[{sql:'SELECT 0 AS cero, NULL AS ausente',proposito:'Fixture inventado',n_filas:1,truncado:false,error:null,ms:1}],ms:2,bloques:[{tipo:'tarjeta',consulta:1,truncado:false,items:[{columna:'cero',etiqueta:'Cero',formato:'numero',valor:0},{columna:'ausente',etiqueta:'Sin dato',formato:'numero',valor:null}]}]};
  const observed_at=`2026-10-${week===1?'02':'09'}T12:00:00.000Z`;
  captures.push({week,case_id:'synthetic-'+id,channel,context:Object.fromEntries(['actor','question','history','scope','data_cut','engine','config'].map(k=>[k+'_sha256',huella(k==='question'?['synthetic',id]:k)])),generation_id:'synthetic-'+week+'-'+id,outcome:'success',observed_at,metrics:{latency_scope:'end_to_end',latency_ms:100,cost_source:'unknown',cost_usd:null},response,snapshot:{...response,snapshot_at:observed_at},format_observations:[{block:0,row:null,column:'cero',display:'0'},{block:0,row:null,column:'ausente',display:'Sin dato'}]});
}
process.stdout.write(JSON.stringify({schema_version:1,mode:'shared_response_replay',period:{started_at:'2026-10-01T00:00:00.000Z',ended_at:'2026-10-15T00:00:00.000Z'},captures},null,2)+'\n');
