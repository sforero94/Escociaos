import {useCallback,useLayoutEffect,useRef,useState} from 'react';
import {useAuth} from '@/contexts/AuthContext';
import {getSupabase} from '@/utils/supabase/client';
import {pendingChequeoBrowser,runChequeoBrowser,type ChequeoBrowserAttempt,type ChequeoBrowserClient} from '@/utils/hato/hatoChequeoBrowserAttempt';
import {getSupabaseConfig} from '@/utils/supabase/config';
import type {ChequeoIntent} from '@/utils/importHato/preparedChequeo';
function browserClient():ChequeoBrowserClient{
 const sdk=getSupabase();return {auth:sdk.auth,rpc:(name,args)=>sdk.rpc(name as never,args as never),prepare:async(key,intent)=>{const session=await sdk.auth.getSession();if(!session.data.session?.access_token)throw Error('Sesión no válida.');const r=await fetch(getSupabaseConfig().url+'/functions/v1/make-server-1ccce916/hato/chequeo/commit',{method:'POST',headers:{Authorization:'Bearer '+session.data.session.access_token,'Content-Type':'application/json'},body:JSON.stringify({requestKey:key,intent})});const body=await r.json();if(!r.ok||body.success!==true)throw Error('Conserve y recupere el chequeo original.');return body.result;}};
}
export function useChequeo(){
 const {user,hasRole}=useAuth();const allowed=hasRole(['Administrador','Gerencia']);const generation=useRef({owner:user?.id,number:0,mounted:allowed});
 const [attempt,setAttempt]=useState<ChequeoBrowserAttempt|null>(null),[busy,setBusy]=useState(false),[open,setOpen]=useState(false),[error,setError]=useState<string|null>(null);
 useLayoutEffect(()=>{generation.current={owner:user?.id,number:generation.current.number+1,mounted:allowed};setAttempt(null);setBusy(false);setOpen(false);setError(null);return()=>{generation.current.mounted=false;generation.current.number++;};},[user?.id,allowed]);
 const run=useCallback(async(mode:'prepare'|'post'|'status'|'resolve'|'new',intent:ChequeoIntent|null=null)=>{
  const owner=user?.id,n=generation.current.number;const current=()=>generation.current.mounted&&generation.current.owner===owner&&generation.current.number===n;
  if(!owner||!current())throw Error('La sesión cambió.');setOpen(true);setBusy(true);setError(null);
  try{const result=await runChequeoBrowser(browserClient(),owner,intent,mode,current,attempt);if(!current())throw Error('La sesión o el formulario cambió. Conserve el intento original.');setAttempt(result);if(mode==='new')setOpen(false);return result;}
  catch(e){if(current()){try{setAttempt(pendingChequeoBrowser(owner));}catch{/* Keep the corrupt original in storage; never create a replacement. */}setError(e instanceof Error?e.message:'Resultado desconocido. Verifique el intento original.');}throw e;}
  finally{if(current())setBusy(false);}
 },[user?.id,attempt]);
 const recover=useCallback(()=>run('status'),[run]);
 return {attempt,busy,open,error,run,recover,close:()=>{if(!busy)setOpen(false);}};
}
