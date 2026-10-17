import {CatalogCreationDialog} from './CatalogCreationDialog';
import type {HatoToroRow} from '@/types/hato';
/** Retained callback props support stale parents; creation uses only the prepared protocol. */
export function PajillaCompraDialog(props:{open:boolean;onOpenChange:(open:boolean)=>void;toros:HatoToroRow[];registrarCompra:(toroId:string,cantidadInicial:number)=>Promise<{ok:boolean;error?:string}>;guardando:boolean;onGuardado:()=>void}){
 return <CatalogCreationDialog open={props.open} kind="lot" toros={props.toros} onOpenChange={props.onOpenChange} onGuardado={props.onGuardado}/>;
}
