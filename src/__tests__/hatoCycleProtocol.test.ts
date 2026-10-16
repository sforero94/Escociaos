import {it,expect,vi,beforeEach,afterEach} from 'vitest';
import {cycleIntent,validateCycleResult,type CycleResult} from '@/utils/hato/hatoCycleProtocol';
import {runCycleBrowser,pendingCycleBrowser} from '@/utils/hato/hatoCycleBrowserAttempt';
import {prepared,committed,intent,OWNER,KEY,OTHER} from './fixtures/hatoCycle';
const validate=(r:CycleResult)=>validateCycleResult(r,OWNER,KEY,intent);
beforeEach(()=>{const store=new Map<string,string>();vi.stubGlobal('localStorage',{getItem:(k:string)=>store.get(k)??null,setItem:(k:string,v:string)=>store.set(k,v),removeItem:(k:string)=>store.delete(k)});vi.stubGlobal('navigator',{locks:{request:async(_k:unknown,_o:unknown,fn:()=>unknown)=>fn()}});});
afterEach(()=>vi.unstubAllGlobals());
it.each(['seca','preñada','confirmada','parida'] as const)('validates exact %s event/calf effects while preserving mother and related records',marca=>{const p={...intent,input:{...intent.input,marca,criaDestino:marca==='parida'?'retenida' as const:null}};const q=committed(prepared(KEY,p));expect(validateCycleResult(q,OWNER,KEY,p).state).toBe('committed');expect(q.receipt!.after.animal).toEqual(p.observedAnimal);});
it.each(['actor','date','event','calf','mother','plan','time','graph','effective-date'])('rejects %s proof drift',field=>{const r=committed(),q=r.receipt!;if(field==='actor')q.actor.profileId=OTHER;if(field==='date')q.after.events[0].fecha='2026-10-13';if(field==='event')q.after.events[0].created_by=OTHER;if(field==='calf')q.calf!.numero=99;if(field==='mother')q.after.animal.notas='unreviewed';if(field==='plan')q.plan.events[0].id=OTHER;if(field==='time')q.recordedAt='not a time';if(field==='graph')q.after.headers.push({id:OTHER,animal_id:intent.animalId});if(field==='effective-date')q.effectiveDate='2026-10-15';expect(()=>validate(r)).toThrow('original');});
it.each([{...intent,input:{...intent.input,fecha:'2026-02-30'}},{...intent,input:{...intent.input,nota:' untrimmed '}},{...intent,input:{...intent.input,created_by:OTHER}},{...intent,animalId:OTHER},{...intent,input:{...intent.input,ancla:{modo:'ninguna',fechaServicio:'2026-01-01',mesesPrenez:null}}}])('rejects invalid prospective intent',p=>expect(()=>cycleIntent(p)).toThrow());
it('keeps original UUID after lost post and clears only verified terminal status',async()=>{
 let saved:CycleResult|null=null,lose=true;const calls:string[]=[];
 const c={auth:{getUser:vi.fn(async()=>({data:{user:{id:OWNER}},error:null}))},rpc:vi.fn(async(_n:string,a:Record<string,unknown>)=>{calls.push(String(a.p_action));if(a.p_action==='prepare')saved=prepared(String(a.p_request_key));if(a.p_action==='post'){saved=committed(saved!);if(lose){lose=false;throw Error('lost response');}}return {data:saved,error:null};})};
 const p=await runCycleBrowser(c,OWNER,intent,'prepare',()=>true);await expect(runCycleBrowser(c,OWNER,null,'post',()=>true,p)).rejects.toThrow();expect(pendingCycleBrowser(OWNER)?.key).toBe(p!.key);
 const recovered=await runCycleBrowser(c,OWNER,null,'status',()=>true);expect(recovered?.result?.state).toBe('committed');await runCycleBrowser(c,OWNER,null,'new',()=>true,recovered);expect(pendingCycleBrowser(OWNER)).toBeNull();expect(calls).toEqual(['prepare','post','status','status']);
});
it('refuses unreviewed posting/account switches and preserves corrupt original storage',async()=>{
 const c={auth:{getUser:vi.fn(async()=>({data:{user:{id:OWNER}},error:null}))},rpc:vi.fn(async(_n:string,a:Record<string,unknown>)=>({data:prepared(String(a.p_request_key)),error:null}))};
 const p=await runCycleBrowser(c,OWNER,intent,'prepare',()=>true);await expect(runCycleBrowser(c,OWNER,null,'post',()=>true)).rejects.toThrow();expect(c.rpc).toHaveBeenCalledTimes(1);c.auth.getUser.mockResolvedValue({data:{user:{id:OTHER}},error:null});await expect(runCycleBrowser(c,OWNER,null,'status',()=>true)).rejects.toThrow();expect(pendingCycleBrowser(OWNER)?.key).toBe(p!.key);
 localStorage.setItem(`hato_cycle_v1:${OWNER}`,'{bad');expect(()=>pendingCycleBrowser(OWNER)).toThrow();expect(localStorage.getItem(`hato_cycle_v1:${OWNER}`)).toBe('{bad');
});
