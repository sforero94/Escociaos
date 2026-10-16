/** Retained stale callers refuse; EditarEventoDialog uses the prepared protocol. */
import type {ConfianzaFecha,CriaDestino,HatoEventoRow,TipoServicioHato} from '@/types/hato';
export interface EdicionEventoHato {
  fecha: string;
  fecha_confianza: ConfianzaFecha;
  tipo_servicio: TipoServicioHato | null;
  toro_id: string | null;
  cria_destino: CriaDestino | null;
  nota: string;
  /** Opcional -- si se da, se escribe en `datos.motivo_correccion` (único
   * canal que lee el trigger de la 084). Si no se da, se deja el motivo
   * previo intacto (nunca se borra uno ya existente sin uno nuevo). */
  motivo?: string;
}

export interface ResultadoCorreccionEventoHato {
  ok: boolean;
  error?: string;
}

export function useCorregirEventoHato(){
 const refused=async():Promise<ResultadoCorreccionEventoHato>=>({ok:false,error:'Abra la revisión preparada y conserve el intento original.'});
 return {editar:(_evento:HatoEventoRow,_edicion:EdicionEventoHato)=>refused(),eliminar:(_eventoId:string)=>refused(),guardando:false};
}
