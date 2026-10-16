import {useCallback,useLayoutEffect,useRef,useState} from 'react';
import {useAuth} from '@/contexts/AuthContext';
import {getSupabase} from '@/utils/supabase/client';
import {pendingReactivationBrowser,runReactivationBrowser,type ReactivationBrowserAttempt,type ReactivationBrowserClient} from '@/utils/hato/hatoReactivationBrowserAttempt';
import type {ReactivationIntent} from '@/utils/hato/hatoReactivationProtocol';
export function useReactivation(){
 const {user}=useAuth();const generation=useRef({owner:user?.id,number:0,mounted:true});
 const [attempt,setAttempt]=useState<ReactivationBrowserAttempt|null>(null),[busy,setBusy]=useState(false),[open,setOpen]=useState(false),[error,setError]=useState<string|null>(null);
 useLayoutEffect(()=>{generation.current={owner:user?.id,number:generation.current.number+1,mounted:true};setAttempt(null);setBusy(false);setOpen(false);setError(null);return()=>{generation.current.mounted=false;generation.current.number++;};},[user?.id]);
 const run=useCallback(async(mode:'prepare'|'post'|'status'|'resolve'|'new',intent:ReactivationIntent|null=null)=>{
  const owner=user?.id,n=generation.current.number;const current=()=>generation.current.mounted&&generation.current.owner===owner&&generation.current.number===n;
  if(!owner||!current())throw Error('La sesión cambió.');setOpen(true);setBusy(true);setError(null);
  try{const result=await runReactivationBrowser(getSupabase() as unknown as ReactivationBrowserClient,owner,intent,mode,current,attempt);if(!current())return null;setAttempt(result);if(mode==='new')setOpen(false);return result;}
  catch(e){if(current()){try{setAttempt(pendingReactivationBrowser(owner));}catch{/* Keep the corrupt original in storage; never create a replacement. */}setError(e instanceof Error?e.message:'Resultado desconocido. Verifique el intento original.');}throw e;}
  finally{if(current())setBusy(false);}
 },[user?.id,attempt]);
 const recover=useCallback(()=>run('status'),[run]);
 return {attempt,busy,open,error,run,recover,close:()=>{if(!busy)setOpen(false);}};
}
