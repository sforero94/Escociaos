// Source-bound tick. Existing schedule and secret stay unchanged.
// Protected job/audit is authoritative; no direct domain write or external-send retry.
import type { Context } from 'npm:hono';
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { perfilAplicacionActivo } from './perfilAplicacionActivo.ts';
import { conReintento, esErrorPostgrestReintentable } from './reintento.ts';
import { verifyCronRun } from './alertCronJob.ts';
import { cronUuid } from './alertCronPlan.ts';
import {executeReservedAlertCron} from './alertCronExecution.ts';
type Client=ReturnType<typeof createClient>;
const ROLES_DISPARO_MANUAL=new Set(['Gerencia']);
const INTENTOS_TICK=3;
async function verificarAuth(c:Context,supabase:Client):Promise<{disparo:'cron'}|{disparo:'manual';owner:string;token:string;key:string}|Response>{
  const configured=Deno.env.get('HATO_ALERTAS_TICK_SECRET');
  const received=c.req.header('x-hato-tick-secret');
  if(configured&&received===configured)return {disparo:'cron'};
  const header=c.req.header('Authorization');
  if(header?.startsWith('Bearer ')){
    const token=header.slice(7),{data,error}=await supabase.auth.getUser(token);
    if(error||!data?.user)return c.json({success:false,error:'Token inválido o expirado.'},401);
    const result=await conReintento(()=>supabase.from('usuarios').select('id,rol,activo').eq('id',data.user.id).maybeSingle(),{intentos:INTENTOS_TICK,esValorReintentable:r=>esErrorPostgrestReintentable(r.error)});
    if(result.error)return c.json({success:false,error:'No pude verificar el perfil actual.'},500);
    if(!perfilAplicacionActivo(result.data?[result.data]:[],data.user.id,[...ROLES_DISPARO_MANUAL]))return c.json({success:false,error:'El disparo manual está restringido a Gerencia.'},403);
    const key=c.req.header('Idempotency-Key');
    if(!cronUuid(key))return c.json({success:false,error:'Conserve y envíe el UUID original en Idempotency-Key para el disparo manual.'},400);
    return {disparo:'manual',owner:data.user.id,token,key};
  }
  return c.json({success:false,error:configured?'Secreto inválido y no hay JWT de Gerencia.':'HATO_ALERTAS_TICK_SECRET no configurado y no hay JWT de Gerencia.'},configured?401:503);
}
export async function handleHatoAlertasTick(c:Context):Promise<Response>{
  const url=Deno.env.get('SUPABASE_URL')!,apiKey=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const service=createClient(url,apiKey),auth=await verificarAuth(c,service);
  if(auth instanceof Response)return auth;
  let originalId:string|null=null;
  try{
    // Manual reservation uses the actual initiating JWT, never a service-supplied profile claim.
    const manual=auth.disparo==='manual'?createClient(url,apiKey,{global:{headers:{Authorization:'Bearer '+auth.token}},auth:{persistSession:false,autoRefreshToken:false}}):null;
    let reserved:unknown;
    for(let attempt=0;attempt<2;attempt++){
      try{
        const result=auth.disparo==='cron'?await service.rpc('fn_alert_cron_service',{p_action:'prepare',p_key:null,p_payload:null}):await manual!.rpc('fn_alert_cron_web',{p_action:'prepare',p_request_key:auth.key,p_expected_owner:auth.owner});
        if(result.error)throw Error('Original reservation unavailable.');reserved=result.data;break;
      }catch{if(attempt===1)throw Error('Original reservation unknown; retry with the same job key.');}
    }
    const actor=auth.disparo==='cron'?{origin:'cron',principal:'service_role',job:'hato_alertas_tick'}:{origin:'manual',profileId:auth.owner};
    const run=verifyCronRun(reserved,{actor,...(auth.disparo==='manual'?{slot:`manual:${auth.owner}:${auth.key}`}:{})});
    originalId=run.id;
    if(auth.disparo==='cron'){
      const day=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Bogota',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(run.reference_at));
      if(run.slot!=='cron:'+day)throw Error('Original scheduled slot could not be verified.');
    }
    const result=await executeReservedAlertCron(service,run);
    return c.json(result,result.held?202:200);
  }catch{
    return c.json({success:false,runId:originalId,error:'Resultado original no verificado o fuente cambiada. Conserve la reserva; no reenvíe ni cree un reemplazo.'},503);
  }
}
