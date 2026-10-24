import {useCallback,useLayoutEffect,useMemo,useRef,useState} from 'react';
import {useAuth} from '@/contexts/AuthContext';
import {getSupabase} from '@/utils/supabase/client';
import {classifyFinancialIncome,type SaleCorrectionClient,type FinancialIncomeKind} from '@/utils/hato/financialSaleCorrectionProtocol';
export function useFinancialIncomeRoute(open:boolean,id:string|undefined){
 const {user}=useAuth(),generation=useRef({active:false});
 const context=useMemo(()=>({owner:user?.id,open,id}),[user?.id,open,id]);
 const kindNow=useCallback(async()=>{const owner=user?.id,n=generation.current;if(!owner||!open||!id||!n.active)throw Error('El destino o la sesión cambió.');const c=getSupabase(),before=await c.auth.getUser();if(before.error||before.data.user?.id!==owner||(!n.active||n!==generation.current))throw Error('La sesión cambió.');const value=await classifyFinancialIncome(c as unknown as SaleCorrectionClient,owner,id),after=await c.auth.getUser();if(after.error||after.data.user?.id!==owner||(!n.active||n!==generation.current))throw Error('La sesión o el destino cambió.');return value;},[user?.id,open,id]);
 const [status,setStatus]=useState<{context:typeof context;kind:FinancialIncomeKind|null;error:string|null}|null>(null);
 useLayoutEffect(()=>{const token={active:true};generation.current=token;let active=true;if(open&&id)void kindNow().then(v=>{if(active)setStatus({context,kind:v,error:v==='blocked'?'El ingreso tiene vínculos incompatibles y requiere revisión.':null});}).catch(e=>{if(active)setStatus({context,kind:null,error:e instanceof Error?e.message:'No se pudo verificar el ingreso.'});});return()=>{active=false;token.active=false;};},[kindNow,context,open,id]);
 const current=status?.context===context&&open;
 const kind=current?status.kind:null;
 const classifyNow=async()=>{const k=await kindNow();if(k==='blocked')throw Error('El ingreso tiene vínculos incompatibles; requiere revisión.');return k==='measured';};
 const saleNow=async()=>{const k=await kindNow();if(k==='blocked'||k==='measured')throw Error('La clasificación cambió; vuelve a revisar el ingreso.');return k==='sale';};
 return {kind,measured:kind==='measured'?true:kind==='sale'||kind==='general'?false:null,error:current?status.error:null,classifyNow,saleNow};
}
