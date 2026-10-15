import type {Context} from 'npm:hono';
import {createClient} from 'jsr:@supabase/supabase-js@2';
import {validateOps,opsSame,opsUuid} from './alertCronOperationsProtocol.ts';
import {verifyCronRun} from './alertCronJob.ts';
import {cronObject} from './alertCronPlan.ts';
import {executeReservedAlertCron} from './alertCronExecution.ts';
/** Only an existing committed replan operation owned by the current JWT may execute its linked job. */
export async function handleAlertCronOperatorExecution(c:Context){
 const header=c.req.header('Authorization');if(!header?.startsWith('Bearer '))return c.json({error:'Inicie sesión.'},401);
 const key=c.req.header('Idempotency-Key');if(!opsUuid(key))return c.json({error:'Conserve la operación original.'},400);
 const service=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
 const {data:identity,error}=await service.auth.getUser(header.slice(7));if(error||!identity.user)return c.json({error:'Sesión no verificada.'},401);
 const owner=identity.user.id;
 const human=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{global:{headers:{Authorization:header}},auth:{persistSession:false,autoRefreshToken:false}});
 try{
  const response=await human.rpc('fn_alert_cron_operator',{p_action:'execute',p_request_key:key,p_intent:null,p_expected_owner:owner});
  if(response.error||!cronObject(response.data)||Object.keys(response.data).sort().join('|')!=='operation|run')throw Error('Original execution unavailable');
  const op=validateOps(response.data.operation,owner,key);
  if(op.state!=='committed'||op.intent?.kind!=='replan_run'||!op.receipt||!cronObject(op.receipt.replacement))throw Error('Original replan required');
  const replacement=op.receipt.replacement;
  if(!cronObject(replacement.actor))throw Error('Original actor required');
  const run=verifyCronRun(response.data.run,{id:String(replacement.id),slot:String(replacement.slot),actor:replacement.actor});
  if(run.reference_at!==replacement.referenceAt||!opsSame(run.actor,replacement.actor))throw Error('Original reference changed');
  const result=await executeReservedAlertCron(service,run);
  return c.json({owner,requestKey:key,...result},result.held?202:200);
 }catch{return c.json({owner,requestKey:key,error:'Ejecución original no verificada. Consérvela; no cree otra reserva ni reenvíe.'},503);}
}
