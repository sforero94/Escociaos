// Development-runner guard. A per-call reservation is an explicit operator bound,
// not a provider-enforced spending limit. Unknown receipts stop all later calls.
import type { ClienteLLM } from './llm.ts';

interface OpcionesPresupuesto {
  limiteUsd: number;
  gastoPrevioUsd: number;
  reservaPorLlamadaUsd: number;
}
type MotivoDetencion = 'presupuesto_agotado' | 'costo_no_disponible' | 'reserva_excedida' | 'llamada_incierta';
export function limitarPresupuestoDesarrollo(llm: ClienteLLM, opciones: OpcionesPresupuesto) {
  const { limiteUsd, gastoPrevioUsd, reservaPorLlamadaUsd } = opciones;
  if (![limiteUsd, gastoPrevioUsd, reservaPorLlamadaUsd].every(Number.isFinite)
    || limiteUsd <= 0 || gastoPrevioUsd < 0 || gastoPrevioUsd > limiteUsd || reservaPorLlamadaUsd <= 0)
    throw new Error('presupuesto_no_valido');
  let gastoConocidoUsd = 0;
  let llamadas = 0;
  let motivoDetencion: MotivoDetencion | undefined;
  const estado = () => ({
    gastoConocidoUsd,
    gastoUsd: motivoDetencion === 'costo_no_disponible' || motivoDetencion === 'llamada_incierta' ? null : gastoConocidoUsd,
    llamadas,
    motivoDetencion,
  });
  const cliente: ClienteLLM = {
    async completar(solicitud) {
      if (motivoDetencion) throw new Error(motivoDetencion);
      if (gastoPrevioUsd + gastoConocidoUsd + reservaPorLlamadaUsd > limiteUsd + 1e-12) {
        motivoDetencion = 'presupuesto_agotado';
        throw new Error(motivoDetencion);
      }
      llamadas++;
      let respuesta;
      try {
        respuesta = await llm.completar(solicitud);
      } catch {
        motivoDetencion = 'llamada_incierta';
        throw new Error(motivoDetencion);
      }
      const costo = respuesta.uso.costoUsd;
      if (typeof costo !== 'number' || !Number.isFinite(costo) || costo < 0) {
        motivoDetencion = 'costo_no_disponible';
      } else {
        gastoConocidoUsd += costo;
        if (costo > reservaPorLlamadaUsd) motivoDetencion = 'reserva_excedida';
      }
      return respuesta;
    },
  };
  return { cliente, estado };
}
