import {useCallback,useLayoutEffect,useRef,useState} from 'react';
import {useAuth} from '@/contexts/AuthContext';
import {getSupabase} from '@/utils/supabase/client';
import {pendingGeneralCorrectionBrowser,runGeneralCorrectionBrowser,type GeneralCorrectionBrowserAttempt,type GeneralCorrectionBrowserClient} from '@/utils/hato/financialGeneralCorrectionBrowserAttempt';
import {generalCorrectionDraft,type GeneralCorrectionDraft} from '@/utils/hato/financialGeneralCorrectionProtocol';
export function useGeneralCorrectionConfirmation(enabled=true,contextKey=''){
 const {user,hasRole}=useAuth(),allowed=enabled&&hasRole(['Gerencia']),generation=useRef({owner:user?.id,number:0,mounted:allowed});
 const [attempt,setAttempt]=useState<GeneralCorrectionBrowserAttempt|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState<string|null>(null);
 useLayoutEffect(()=>{generation.current={owner:user?.id,number:generation.current.number+1,mounted:allowed};setAttempt(null);setBusy(false);setError(null);return()=>{generation.current.mounted=false;generation.current.number++;};},[user?.id,allowed,contextKey]);
 const run=useCallback(async(mode:'prepare'|'post'|'status'|'resolve'|'new',draft:GeneralCorrectionDraft|null=null)=>{
  const owner=user?.id,n=generation.current.number,current=()=>generation.current.mounted&&generation.current.owner===owner&&generation.current.number===n;
  if(!owner||!current())throw Error('La sesión o el formulario cambió.');setBusy(true);setError(null);
  try{const result=await runGeneralCorrectionBrowser(getSupabase() as unknown as GeneralCorrectionBrowserClient,owner,draft,mode,current,attempt);if(!current())throw Error('La sesión o el formulario cambió. Conserva el intento original.');setAttempt(result);return result;}
  catch(e){if(current()){try{setAttempt(pendingGeneralCorrectionBrowser(owner));}catch{/* Preserve corrupt or inaccessible storage; never replace the original. */}setError(e instanceof Error?e.message:'Resultado desconocido. Consulta el intento original.');}throw e;}
  finally{if(current())setBusy(false);}
 },[user?.id,attempt]);
 const prepare=useCallback((draft:GeneralCorrectionDraft)=>run('prepare',generalCorrectionDraft(draft)),[run]);
 return {attempt,busy,error,run,prepare,recover:()=>run('status')};
}
