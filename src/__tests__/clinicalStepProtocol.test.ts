import {describe,it,expect,vi} from 'vitest';
import {clinicalIntent,clinicalAction,validateClinicalResult,queryClinicalWeb,queryClinicalTelegram,type ClinicalResult} from '@/utils/hato/clinicalStepConfirmationProtocol';
import {OWNER,OTHER,KEY,intent,prepared,committed} from './fixtures/clinicalStep';
describe('clinical confirmation proof',()=>{
 it('accepts exact prepared/committed evidence and preserves valid nullable legacy fields',()=>{const p=prepared(),r=committed(p);expect(validateClinicalResult(p,OWNER,null,KEY,intent)).toEqual(p);expect(validateClinicalResult(r,OWNER,null,KEY,intent)).toEqual(r);});
 it.each(['stepId','fechaEjecutada','alertId','version'])('requires intent field %s',key=>{const p={...intent};delete (p as unknown as Record<string,unknown>)[key];expect(()=>clinicalIntent(p)).toThrow();});
 it.each([{...intent,extra:true},{...intent,fechaEjecutada:'2026-02-30'},{...intent,stepId:'A0000000-0000-4000-8000-000000000001'},{...intent,alertId:42}])('refuses malformed original intent %#',p=>expect(()=>clinicalIntent(p)).toThrow());
 it.each([{sender:789,chatId:-789,messageId:1},{sender:789,chatId:789,messageId:0},{sender:789,chatId:789,messageId:1,extra:1}])('refuses nonprivate/invalid controls %#',a=>expect(()=>clinicalAction(a)).toThrow());
 const edits:Array<[string,(r:ClinicalResult)=>void]>=[
 ['invalid visible animal',r=>{r.original!.animal.numero={bad:true};}],['owner',r=>{r.actor={origin:'web',profileId:OTHER};}],['key',r=>{r.requestKey=OTHER;}],['missing receipt',r=>{r.receipt=null;}],
 ['actor proof',r=>{r.receipt!.actor={origin:'web',profileId:OTHER};}],['before',r=>{r.receipt!.before.header.nombre='Changed';}],
 ['clinical date',r=>{r.receipt!.after.steps[0].fecha_ejecutada='2026-10-13';}],['header',r=>{r.receipt!.after.header.nota='Changed';}],
 ['animal',r=>{r.receipt!.after.animal.nombre='Changed';}],['alert response',r=>{r.receipt!.after.alerts[0].respuesta='no';}],
 ['alert microseconds',r=>{r.receipt!.after.alerts[0].updated_at='2026-10-14T13:00:00.123457+00:00';}],
 ['sibling deletion',r=>{r.receipt!.after.steps=[];}],['duplicate original step',r=>{r.original!.steps.push({...r.original!.steps[0]});}],
 ['response extra',r=>{Object.assign(r,{success:true});}],['receipt extra',r=>{Object.assign(r.receipt!,{success:true});}],
 ];
 it.each(edits)('refuses forged %s',(_name,edit)=>{const r=committed();edit(r);expect(()=>validateClinicalResult(r,OWNER,null,KEY,intent)).toThrow();});
 it('accepts a durable cancellation fence without binding new intent',()=>{const r={...prepared(),intent:null,original:null,state:'canceled' as const};expect(validateClinicalResult(r,OWNER,null,KEY,intent)).toEqual(r);});
 it('requires committed evidence even if a server says success',async()=>{const client={rpc:vi.fn().mockResolvedValue({data:{success:true},error:null})};await expect(queryClinicalWeb(client,OWNER,prepared(),'post')).rejects.toThrow();expect(client.rpc).toHaveBeenCalledWith('fn_clinical_step_web',{p_action:'post',p_request_key:KEY,p_intent:null,p_expected_owner:OWNER});});
 it('binds private recovery to the original native action and actor',async()=>{const action={sender:789,chatId:789,messageId:91},p=prepared();p.actor={origin:'telegram',profileId:null,registrationId:OTHER,sender:789,displayName:null};p.action=action;const r=committed(p),client={rpc:vi.fn().mockResolvedValue({data:r,error:null})};expect(await queryClinicalTelegram(client,action,'status',p)).toEqual(r);r.actor={...p.actor,profileId:OWNER};await expect(queryClinicalTelegram(client,action,'status',p)).rejects.toThrow();});
});
