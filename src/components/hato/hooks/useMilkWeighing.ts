import {useCallback,useLayoutEffect,useRef,useState} from 'react';
import {useAuth} from '@/contexts/AuthContext';
import {getSupabase} from '@/utils/supabase/client';
import {pendingMilkWeighingBrowser,runMilkWeighingBrowser,type MilkWeighingBrowserAttempt,type MilkWeighingBrowserClient} from '@/utils/hato/hatoMilkWeighingBrowserAttempt';
import {milkWeighingIntent,milkWeighingSource,type MilkWeighingCell,type MilkWeighingIntent} from '@/utils/hato/hatoMilkWeighingProtocol';
export function useMilkWeighing(enabled=true){
 const {user,hasRole}=useAuth();const allowed=enabled&&hasRole(['Administrador','Gerencia']);const generation=useRef({owner:user?.id,number:0,mounted:allowed});
 const [attempt,setAttempt]=useState<MilkWeighingBrowserAttempt|null>(null),[busy,setBusy]=useState(false),[open,setOpen]=useState(false),[error,setError]=useState<string|null>(null);
 useLayoutEffect(()=>{generation.current={owner:user?.id,number:generation.current.number+1,mounted:allowed};setAttempt(null);setBusy(false);setOpen(false);setError(null);return()=>{generation.current.mounted=false;generation.current.number++;};},[user?.id,allowed]);
 const run=useCallback(async(mode:'prepare'|'post'|'status'|'resolve'|'new',intent:MilkWeighingIntent|null=null)=>{
  const owner=user?.id,n=generation.current.number;const current=()=>generation.current.mounted&&generation.current.owner===owner&&generation.current.number===n;
  if(!owner||!current())throw Error('La sesión cambió.');setOpen(true);setBusy(true);setError(null);
  try{const result=await runMilkWeighingBrowser(getSupabase() as unknown as MilkWeighingBrowserClient,owner,intent,mode,current,attempt);if(!current())throw Error('La sesión o el formulario cambió. Conserve el intento original.');setAttempt(result);if(mode==='new')setOpen(false);return result;}
  catch(e){if(current()){try{setAttempt(pendingMilkWeighingBrowser(owner));}catch{/* Keep the corrupt original in storage; never create a replacement. */}setError(e instanceof Error?e.message:'Resultado desconocido. Verifique el intento original.');}throw e;}
  finally{if(current())setBusy(false);}
 },[user?.id,attempt]);
 const prepareCells=useCallback(async(cells:Omit<MilkWeighingCell,'observed'>[],year:number,month:number,captureId:string|null)=>{
  const owner=user?.id,n=generation.current.number;const current=()=>generation.current.mounted&&generation.current.owner===owner&&generation.current.number===n;if(!owner||!current())throw Error('La sesión cambió.');
  const provisional=milkWeighingIntent({version:1,year,month,captureId,cells:cells.map(c=>({...c,observed:null}))});
  const original=await run('status');if(!current())throw Error('Conserve el pesaje original.');
  if(original)return original.result?.state==='unknown'?run('prepare',original.intent):original;
  setBusy(true);try{const source=await milkWeighingSource(getSupabase() as unknown as MilkWeighingBrowserClient,owner);if(!current())throw Error('La sesión o el formulario cambió.');const intent=milkWeighingIntent({...provisional,cells:provisional.cells.map(c=>({...c,observed:source.rows.find(r=>r.animal_id===c.animalId&&r.fecha===c.date)??null}))});return await run('prepare',intent);}catch(e){if(current())setError(e instanceof Error?e.message:'Conserve el pesaje original.');throw e;}finally{if(current())setBusy(false);}
 },[user?.id,run]);
 const recover=useCallback(()=>run('status'),[run]);
 return {attempt,busy,open,error,run,prepareCells,recover,close:()=>{if(!busy)setOpen(false);}};
}
