import type {RunSummary,OpsIntent,OpsResult,OpsMonitor,DeliverySummary} from '../../utils/hato/alertCronOperationsProtocol';
export const OWNER='10000000-0000-4000-8000-000000000001',KEY='10000000-0000-4000-8000-000000000002',CHILD='10000000-0000-4000-8000-000000000003';
export function opsFixture(){
 const run:RunSummary={id:KEY,slot:'cron:2026-10-15',actor:{origin:'cron',principal:'service_role',job:'hato_alertas_tick'},referenceAt:'2026-10-15T12:00:00Z',state:'prepared',revision:'0'.repeat(32),sourceChanged:true,generated:0,changed:0,replacementId:null};
 const intent:OpsIntent={kind:'replan_run',targetId:KEY,observed:run,reason:'Reviewed changed source'};
 const result:OpsResult={version:1,requestKey:KEY,owner:OWNER,state:'pending',intent,original:run,receipt:null};
 const replacement:RunSummary={...run,id:CHILD,slot:'replan:'+KEY,referenceAt:'2026-10-15T13:00:00Z',sourceChanged:false};
 const committed:OpsResult={...result,state:'committed',receipt:{version:1,requestKey:KEY,owner:OWNER,intent,original:run,after:{...run,state:'canceled',sourceChanged:false,revision:'1'.repeat(32),replacementId:CHILD},replacement,recordedAt:replacement.referenceAt}};
 const monitor:OpsMonitor={version:1,owner:OWNER,observedAt:'2026-10-15T13:00:00Z',runs:[run],metrics:[],selectedRun:null,deliveries:[],audit:[],auditMore:false,operations:[],more:false,before:{at:run.referenceAt,id:run.id}};
 const delivery:DeliverySummary={id:KEY,runId:KEY,alertId:KEY,registrationId:KEY,recipient:789,phase:'delivery',round:1,state:'unknown',claimedAt:'2026-10-15T12:00:00Z',revision:'0'.repeat(32),evidence:null,acknowledged:false};
 return {run,intent,result,committed,monitor,delivery};
}
