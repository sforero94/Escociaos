import {useCallback,useLayoutEffect,useMemo,useRef,useState} from 'react';
import {useAuth} from '@/contexts/AuthContext';
import {getSupabase} from '@/utils/supabase/client';
import {metadataClassify,type MetadataClient} from '@/utils/hato/hatoIncomeMetadataProtocol';
export function useIncomeMetadataRoute(open:boolean,id:string|undefined){
 const {user}=useAuth(),generation=useRef({active:false});
 const context=useMemo(()=>({owner:user?.id,open,id}),[user?.id,open,id]);
 const classifyNow=useCallback(async()=>{const owner=user?.id,n=generation.current;if(!owner||!open||!id||!n.active)throw Error('El destino o la sesión cambió.');const c=getSupabase(),before=await c.auth.getUser();if(before.error||before.data.user?.id!==owner||(!n.active||n!==generation.current))throw Error('La sesión cambió.');const value=await metadataClassify(c as unknown as MetadataClient,owner,id),after=await c.auth.getUser();if(after.error||after.data.user?.id!==owner||(!n.active||n!==generation.current))throw Error('La sesión o el destino cambió.');return value;},[user?.id,open,id]);
 const [status,setStatus]=useState<{context:typeof context;measured:boolean|null;error:string|null}|null>(null);
 useLayoutEffect(()=>{const token={active:true};generation.current=token;let active=true;if(open&&id)void classifyNow().then(v=>{if(active)setStatus({context,measured:v,error:null});}).catch(e=>{if(active)setStatus({context,measured:null,error:e instanceof Error?e.message:'No se pudo verificar el ingreso.'});});return()=>{active=false;token.active=false;};},[classifyNow,context,open,id]);
 const current=status?.context===context&&open;
 return {measured:current?status.measured:null,error:current?status.error:null,classifyNow};
}
