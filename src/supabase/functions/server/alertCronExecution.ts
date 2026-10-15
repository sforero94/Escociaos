import {postReservedAlertCron,type CronRun} from './alertCronJob.ts';
import {analyzeAlertCron,cronRows,cronObject} from './alertCronPlan.ts';
import {sameAlertResponse} from './telegram/alertResponseProtocol.ts';
import {dispatchCronDelivery,type CronRpc} from './telegram/alertCronDelivery.ts';
import {enviarMensajeTelegram} from './telegram/enviar.ts';
/** Original reserved execution only; no HTTP/DB result can allocate another job. */
export async function executeReservedAlertCron(service:CronRpc,run:CronRun){
 const receipt=await postReservedAlertCron(service,run),outcomes=[];
 const {coverage}=analyzeAlertCron(run.source,run.reference_at);
 let coverageRecorded=false;
 try{
  const result=await service.rpc('fn_alert_cron_record_metrics',{p_run:run.id,p_source:run.source,p_coverage:coverage});
  coverageRecorded=!result.error&&cronObject(result.data)&&result.data.run_id===run.id&&sameAlertResponse(result.data.coverage,coverage)&&typeof result.data.source_digest==='string'&&/^[0-9a-f]{32}$/.test(result.data.source_digest)&&typeof result.data.recorded_at==='string'&&Number.isFinite(Date.parse(result.data.recorded_at));
 }catch{/* Coverage remains explicitly unverified; repeat recording uses only this original job. */}
 for(const d of cronRows(receipt.deliveries)){
  try{const result=await dispatchCronDelivery(service,String(d.id),options=>enviarMensajeTelegram(service as never,options),d);outcomes.push({id:d.id,state:result.delivery.state});}
  catch{outcomes.push({id:d.id,state:'unverified'});}
 }
 const held=outcomes.some(d=>!['sent','rejected','not_attempted','canceled'].includes(String(d.state)));
 return {success:!held,runId:run.id,state:'committed' as const,generated:(receipt.plan as {generate:unknown[]}).generate.length,deliveries:outcomes,held,coverageRecorded};
}
