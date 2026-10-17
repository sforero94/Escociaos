import {useCallback,useLayoutEffect,useRef,useState} from 'react';
import {useAuth} from '@/contexts/AuthContext';
import {getSupabase} from '@/utils/supabase/client';
import {pendingCatalogCreationBrowser,runCatalogCreationBrowser,type CatalogCreationBrowserAttempt,type CatalogCreationBrowserClient} from '@/utils/hato/hatoCatalogCreationBrowserAttempt';
import type {CatalogCreationIntent} from '@/utils/hato/hatoCatalogCreationProtocol';
export function useCatalogCreation(){
 const {user,hasRole}=useAuth();const allowed=hasRole(['Administrador','Gerencia']);const generation=useRef({owner:user?.id,number:0,mounted:allowed});
 const [attempt,setAttempt]=useState<CatalogCreationBrowserAttempt|null>(null),[busy,setBusy]=useState(false),[open,setOpen]=useState(false),[error,setError]=useState<string|null>(null);
 useLayoutEffect(()=>{generation.current={owner:user?.id,number:generation.current.number+1,mounted:allowed};setAttempt(null);setBusy(false);setOpen(false);setError(null);return()=>{generation.current.mounted=false;generation.current.number++;};},[user?.id,allowed]);
 const run=useCallback(async(mode:'prepare'|'post'|'status'|'resolve'|'new',intent:CatalogCreationIntent|null=null)=>{
  const owner=user?.id,n=generation.current.number;const current=()=>generation.current.mounted&&generation.current.owner===owner&&generation.current.number===n;
  if(!owner||!current())throw Error('La sesión cambió.');setOpen(true);setBusy(true);setError(null);
  try{const result=await runCatalogCreationBrowser(getSupabase() as unknown as CatalogCreationBrowserClient,owner,intent,mode,current,attempt);if(!current())throw Error('La sesión o el formulario cambió. Conserve el intento original.');setAttempt(result);if(mode==='new')setOpen(false);return result;}
  catch(e){if(current()){try{setAttempt(pendingCatalogCreationBrowser(owner));}catch{/* Keep the corrupt original in storage; never create a replacement. */}setError(e instanceof Error?e.message:'Resultado desconocido. Verifique el intento original.');}throw e;}
  finally{if(current())setBusy(false);}
 },[user?.id,attempt]);
 const recover=useCallback(()=>run('status'),[run]);
 return {attempt,busy,open,error,run,recover,close:()=>{if(!busy)setOpen(false);}};
}
