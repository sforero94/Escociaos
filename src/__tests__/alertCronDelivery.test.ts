import {afterEach,it,expect,vi} from 'vitest';
import {dispatchCronDelivery} from '../supabase/functions/server/telegram/alertCronDelivery';
import {readFileSync} from 'node:fs';
const id='10000000-0000-4000-8000-000000000001',key='10000000-0000-4000-8000-000000000002';
afterEach(()=>vi.restoreAllMocks());
function harness(){
 vi.spyOn(crypto,'randomUUID').mockReturnValue(key);let state='queued',result:unknown=null,claims=0,lostClaim=false,lostSettle=false,failBeforeSettle=false;
 const delivery=()=>({id,run_id:id,registration_id:id,alert_id:id,recipient:789,phase:'delivery',round:1,body:{text:'Frozen synthetic alert',callbackToken:id},context:{recipient:{id,telegramId:789},alert:{id,tipo:'secado_due'}},state,claim_key:state==='queued'?null:key,claimed_at:state==='queued'?null:'2026-10-15T13:00:00Z',result});
 const client={rpc:vi.fn(async(_name:string,args:Record<string,unknown>)=>{
  let permission=false;
  if(args.p_action==='claim'&&state==='queued'){state='sending';claims++;permission=true;if(lostClaim)throw Error('Lost claim');}
  if(args.p_action==='settle'){
   if(failBeforeSettle){failBeforeSettle=false;throw Error('Before settle');}
   result=(args.p_payload as Record<string,unknown>).outcome;state=(result as {outcome:string}).outcome;
   if(lostSettle){lostSettle=false;throw Error('Lost settle');}
  }
  return {data:{version:1,sendPermission:permission,delivery:delivery()},error:null};
 })};
 return {client,claims:()=>claims,setLostClaim:()=>{lostClaim=true;},setLostSettle:()=>{lostSettle=true;},setFailBeforeSettle:()=>{failBeforeSettle=true;}};
}
it('sends the frozen body once and records the original accepted message ID',async()=>{const h=harness(),send=vi.fn(async()=>({outcome:'sent',ok:true,telegramMessageId:91}));expect((await dispatchCronDelivery(h.client,id,send)).delivery.state).toBe('sent');expect(send).toHaveBeenCalledWith(expect.objectContaining({telegramId:'789',texto:'Frozen synthetic alert',botones:[{texto:'Sí',callbackData:`hjd:${id}:si`},{texto:'Todavía no',callbackData:`hjd:${id}:no`},{texto:'Otra cosa',callbackData:`hjd:${id}:otro`}]}));await dispatchCronDelivery(h.client,id,send);expect(send).toHaveBeenCalledOnce();});
it('a lost permission response cannot silently reacquire or send',async()=>{const h=harness(),send=vi.fn();h.setLostClaim();await expect(dispatchCronDelivery(h.client,id,send)).rejects.toThrow();await dispatchCronDelivery(h.client,id,send);expect(send).not.toHaveBeenCalled();expect(h.claims()).toBe(1);});
it.each(['after','before'])('lost settlement %s commit recovers only through the database',async when=>{const h=harness(),send=vi.fn(async()=>({outcome:'sent',ok:true,telegramMessageId:91}));if(when==='after')h.setLostSettle();else h.setFailBeforeSettle();expect((await dispatchCronDelivery(h.client,id,send)).delivery.state).toBe('sent');expect(send).toHaveBeenCalledOnce();expect(h.client.rpc.mock.calls.map(c=>c[1].p_action)).toContain('delivery_status');});
it('a thrown send result remains unknown without a second HTTP attempt',async()=>{const h=harness(),send=vi.fn(async()=>{throw Error('Lost external result');});expect((await dispatchCronDelivery(h.client,id,send)).delivery.state).toBe('unknown');await dispatchCronDelivery(h.client,id,send);expect(send).toHaveBeenCalledOnce();});
it('malformed permission proof cannot trigger a physical send',async()=>{const h=harness(),send=vi.fn();h.client.rpc.mockResolvedValueOnce({data:{version:1,sendPermission:true,delivery:{id}},error:null} as never);await expect(dispatchCronDelivery(h.client,id,send)).rejects.toThrow();expect(send).not.toHaveBeenCalled();});
it('both edge roots share the dispatcher',()=>expect(readFileSync('src/supabase/functions/server/telegram/alertCronDelivery.ts','utf8')).toBe(readFileSync('supabase/functions/make-server-1ccce916/telegram/alertCronDelivery.ts','utf8')));
