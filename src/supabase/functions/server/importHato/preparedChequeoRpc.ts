// ARCHIVO: src/supabase/functions/server/importHato/preparedChequeoRpc.ts
// GENERADO por docs/hato/regenerar-copias-importhato.py -- NUNCA edites este
// archivo a mano. Editá `src/utils/importHato/preparedChequeoRpc.ts` y volvé a correr el script.
//
// POR QUÉ EXISTE ESTE DUPLICADO: el endpoint B0/V10 (`POST
// .../hato/chequeo/preview`, `hato-chequeo-preview.ts`) corre en el árbol de
// despliegue de la edge function y no puede importar desde `src/utils/` --
// cruzaría la frontera del árbol de despliegue de Deno. Misma restricción
// que ya produjo `priorizacion-scouting.ts` y `calculos-hato.ts`.
//
// Contenido idéntico al original salvo los especificadores de import
// (reescritos para Deno: `@/utils/calculosHato` -> `../calculos-hato.ts`,
// `./xxx` -> `./xxx.ts`). `src/__tests__/importHatoParidadServidor.test.ts`
// corre este mismo script en modo `--check` y falla si alguien hand-editó
// una copia en vez de regenerarla.

import {sameChequeo,chequeoIntent,chequeoSource,chequeoUuid,buildPreparedChequeo,validateChequeoResult,type ChequeoIntent,type ChequeoResult} from './preparedChequeo.ts';
import {construirHatoConfigDesdeFilas,type FilaHatoConfig} from '../hato-config-desde-tabla.ts';
export interface ChequeoRpcClient {rpc(name:string,args:Record<string,unknown>):PromiseLike<{data:unknown;error:unknown}>}
export async function prepareTrustedChequeo(client:ChequeoRpcClient,owner:string,key:string,input:ChequeoIntent):Promise<ChequeoResult>{
 chequeoIntent(input);if(!chequeoUuid(owner)||!chequeoUuid(key))throw Error('Original chequeo owner/key required');
 const args={p_expected_owner:owner,p_request_key:key,p_intent:input,p_original:null,p_payload:null};
 const probe=await client.rpc('fn_hato_chequeo_prepare_service',args);if(probe.error)throw Error('Conserve y recupere el chequeo original.');if(probe.data!==null)return validateChequeoResult(probe.data,owner,key,input);
 const observed=await client.rpc('fn_hato_chequeo_source_service',{p_expected_owner:owner});if(observed.error)throw Error('No se pudo capturar el origen del chequeo.');const source=chequeoSource(observed.data);construirHatoConfigDesdeFilas(source.config as unknown as FilaHatoConfig[]);
 const prepared=await client.rpc('fn_hato_chequeo_prepare_service',{...args,p_original:source,p_payload:buildPreparedChequeo(input,source)});if(prepared.error)throw Error('No se pudo preparar. Conserve y recupere el chequeo original.');return validateChequeoResult(prepared.data,owner,key,input);
}
export async function chequeoWeb(client:ChequeoRpcClient,owner:string,key:string,action:'post'|'status'|'resolve'|'acknowledge',expected?:ChequeoResult){const r=await client.rpc('fn_hato_chequeo_web',{p_action:action,p_request_key:key,p_expected_owner:owner});if(r.error)throw Error('Resultado desconocido. Verifique el chequeo original.');const value=validateChequeoResult(r.data,owner,key,expected?.intent??undefined);if(expected&&expected.state!=='unknown'&&(!sameChequeo(value.plan,expected.plan)||!sameChequeo(value.original,expected.original)))throw Error('La prueba original cambió.');return value;}
export async function recoverChequeoWeb(client:ChequeoRpcClient,owner:string):Promise<ChequeoResult|null>{const r=await client.rpc('fn_hato_chequeo_recover_web',{p_expected_owner:owner});if(r.error)throw Error('Recupere el chequeo original antes de continuar.');if(r.data===null)return null;const raw=r.data as ChequeoResult;const value=validateChequeoResult(raw,owner,raw.requestKey);if(value.acknowledged||!['pending','committed'].includes(value.state))throw Error('No pude verificar el chequeo original.');return value;}
