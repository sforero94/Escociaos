import {it,expect,vi,beforeEach,afterEach} from 'vitest';
import {deathIntent,validateDeathResult,type DeathResult} from '@/utils/hato/hatoDeathProtocol';
import {runDeathBrowser,pendingDeathBrowser} from '@/utils/hato/hatoDeathBrowserAttempt';
import {prepared,committed,intent,OWNER,KEY,OTHER} from './fixtures/hatoDeath';
const validate=(r:DeathResult)=>validateDeathResult(r,OWNER,KEY,intent);
beforeEach(()=>{const store=new Map<string,string>();vi.stubGlobal('localStorage',{getItem:(k:string)=>store.get(k)??null,setItem:(k:string,v:string)=>store.set(k,v),removeItem:(k:string)=>store.delete(k)});vi.stubGlobal('navigator',{locks:{request:async(_k:unknown,_o:unknown,fn:()=>unknown)=>fn()}});});
afterEach(()=>vi.unstubAllGlobals());
it('accepts exact prospective proof with preserved related records',()=>{expect(validate(prepared()).state).toBe('pending');expect(validate(committed()).state).toBe('committed');});
it.each(['actor','date','animal','event','audit','history','reserved-id','time','financial'])('rejects %s proof drift',field=>{const r=committed(),q=r.receipt!;if(field==='actor')q.actor.profileId=OTHER;if(field==='date')q.after.animal.fecha_estado='2026-10-13';if(field==='animal')q.after.animal.nombre='Different animal';if(field==='event')q.after.events[0].created_by=OTHER;if(field==='audit')q.correction.corregido_por=OTHER;if(field==='history')q.after.headers.push({id:OTHER,animal_id:intent.animalId});if(field==='reserved-id')q.after.events[0].id=OTHER;if(field==='time')q.recordedAt='not a time';if(field==='financial')q.after.events[0].fin_ingreso_id=OTHER;expect(()=>validate(r)).toThrow('original');});
it.each([{...intent,date:'2026-02-30'},{...intent,cause:' untrimmed '},{...intent,cause:'x'.repeat(4001)},{...intent,animalId:OTHER},{...intent,observedAnimal:{...intent.observedAnimal,estado:'muerta'}}])('rejects invalid intent %j',p=>expect(()=>deathIntent(p)).toThrow());
it('retains original key after lost committed response and verifies it before clearing',async()=>{
 let saved:DeathResult|null=null;const calls:string[]=[];let lose=true;
 const c={auth:{getUser:vi.fn(async()=>({data:{user:{id:OWNER}},error:null}))},rpc:vi.fn(async(_n:string,a:Record<string,unknown>)=>{calls.push(String(a.p_action));if(a.p_action==='prepare')saved=prepared(String(a.p_request_key));if(a.p_action==='post'){saved=committed(saved!);if(lose){lose=false;throw Error('lost response');}}return {data:saved,error:null};})};
 const p=await runDeathBrowser(c,OWNER,intent,'prepare',()=>true);expect(calls).toEqual(['prepare']);await expect(runDeathBrowser(c,OWNER,null,'post',()=>true,p)).rejects.toThrow();expect(pendingDeathBrowser(OWNER)?.key).toBe(p!.key);
 const recovered=await runDeathBrowser(c,OWNER,null,'status',()=>true);expect(recovered?.result?.state).toBe('committed');await runDeathBrowser(c,OWNER,null,'new',()=>true,recovered);expect(pendingDeathBrowser(OWNER)).toBeNull();expect(calls).toEqual(['prepare','post','status','status']);
});
it('refuses post without reviewed preparation, account changes and corrupt storage without replacing key',async()=>{
 const c={auth:{getUser:vi.fn(async()=>({data:{user:{id:OWNER}},error:null}))},rpc:vi.fn(async(_n:string,a:Record<string,unknown>)=>({data:prepared(String(a.p_request_key)),error:null}))};
 const p=await runDeathBrowser(c,OWNER,intent,'prepare',()=>true);await expect(runDeathBrowser(c,OWNER,null,'post',()=>true)).rejects.toThrow();expect(c.rpc).toHaveBeenCalledTimes(1);
 c.auth.getUser.mockResolvedValue({data:{user:{id:OTHER}},error:null});await expect(runDeathBrowser(c,OWNER,null,'status',()=>true)).rejects.toThrow();expect(pendingDeathBrowser(OWNER)?.key).toBe(p!.key);
 localStorage.setItem(`hato_death_v1:${OWNER}`,'{bad');expect(()=>pendingDeathBrowser(OWNER)).toThrow();expect(localStorage.getItem(`hato_death_v1:${OWNER}`)).toBe('{bad');
});
