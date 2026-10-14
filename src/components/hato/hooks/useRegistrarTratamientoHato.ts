// Browser treatment protocol; existing legacy/direct writers require coordinated release.
import {useState,useCallback,useRef,useEffect,useLayoutEffect} from 'react';
import {getSupabase} from '@/utils/supabase/client';
import {useAuth} from '@/contexts/AuthContext';
import {runBrowserTreatment,type BrowserTreatmentClient} from '@/utils/hato/hatoTreatmentBrowserAttempt';
import {type TreatmentProposal,type TreatmentResult} from '@/utils/hato/hatoTreatmentCreation';
export type InputRegistrarTratamiento=Omit<TreatmentProposal,'version'>;
export interface ResultadoRegistrarTratamiento {ok:boolean;error?:string;result?:TreatmentResult|null}
export function useRegistrarTratamientoHato(){
 const {user}=useAuth();const [guardando,setGuardando]=useState(false);const generation=useRef({owner:user?.id,number:0,mounted:true});
 useLayoutEffect(()=>{generation.current={owner:user?.id,number:generation.current.number+1,mounted:true};return()=>{generation.current.mounted=false;generation.current.number++;};},[user?.id]);
 useEffect(()=>{setGuardando(false);},[user?.id]);
 const registrar=useCallback(async(input:InputRegistrarTratamiento,mode:'post'|'retry'|'status'|'resolve'|'new'='post',dialogCurrent:()=>boolean=()=>true):Promise<ResultadoRegistrarTratamiento>=>{
  const owner=user?.id,n=generation.current.number;const current=()=>generation.current.mounted&&generation.current.owner===owner&&generation.current.number===n&&dialogCurrent();
  if(!owner||!current())return {ok:false,error:'La sesión cambió. Conserve el intento original.'};setGuardando(true);
  try{const c=getSupabase() as unknown as BrowserTreatmentClient;
   const result=await runBrowserTreatment(c,owner,input.animalId,mode==='post'?{version:1,...input}:null,mode,current);
   if(!current())return {ok:false,error:'La sesión o el formulario cambió.'};return {ok:result?.state==='committed',result};
  }catch(error){return {ok:false,error:error instanceof Error?error.message:'Resultado desconocido. Verifique el intento original.'};}
  finally{if(generation.current.mounted&&generation.current.owner===owner&&generation.current.number===n)setGuardando(false);}
 },[user?.id]);
 return {registrar,guardando};
}
