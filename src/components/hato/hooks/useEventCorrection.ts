import {useCallback,useLayoutEffect,useRef,useState} from 'react';
import {useAuth} from '@/contexts/AuthContext';
import {getSupabase} from '@/utils/supabase/client';
import {pendingEventCorrectionBrowser,runEventCorrectionBrowser,type EventCorrectionBrowserAttempt,type EventCorrectionBrowserClient} from '@/utils/hato/hatoEventCorrectionBrowserAttempt';
import type {EventCorrectionIntent} from '@/utils/hato/hatoEventCorrectionProtocol';
export function useEventCorrection(eventId:string){
 const {user}=useAuth();const generation=useRef({owner:user?.id,number:0,mounted:true});
 const [attempt,setAttempt]=useState<EventCorrectionBrowserAttempt|null>(null),[busy,setBusy]=useState(false),[open,setOpen]=useState(false),[error,setError]=useState<string|null>(null);
 useLayoutEffect(()=>{generation.current={owner:user?.id,number:generation.current.number+1,mounted:true};setAttempt(null);setBusy(false);setOpen(false);setError(null);return()=>{generation.current.mounted=false;generation.current.number++;};},[user?.id]);
 const run=useCallback(async(mode:'prepare'|'post'|'status'|'resolve'|'new',intent:EventCorrectionIntent|null=null)=>{
  const owner=user?.id,n=generation.current.number;const current=()=>generation.current.mounted&&generation.current.owner===owner&&generation.current.number===n;
  if(!owner||!current())throw Error('La sesión cambió.');setOpen(true);setBusy(true);setError(null);
  try{const result=await runEventCorrectionBrowser(getSupabase() as unknown as EventCorrectionBrowserClient,owner,intent,mode,current,attempt);if(!current())throw Error('La sesión o el formulario cambió. Conserve el intento original.');if(result&&result.intent.eventId!==eventId)throw Error('El intento original corresponde al evento '+result.intent.eventId+'. Abra ese evento para recuperarlo.');setAttempt(result);if(mode==='new')setOpen(false);return result;}
  catch(e){if(current()){try{const original=pendingEventCorrectionBrowser(owner);if(!original||original.intent.eventId===eventId)setAttempt(original);}catch{/* Keep the corrupt original in storage; never create a replacement. */}setError(e instanceof Error?e.message:'Resultado desconocido. Verifique el intento original.');}throw e;}
  finally{if(current())setBusy(false);}
 },[user?.id,attempt,eventId]);
 const recover=useCallback(()=>run('status'),[run]);
 return {attempt,busy,open,error,run,recover,close:()=>{if(!busy)setOpen(false);}};
}
