// ARCHIVO: components/hato/components/EventoTimeline.tsx
// DESCRIPCIÓN: Componente canónico nuevo del plan §7.6 -- línea de tiempo
// vertical de eventos reproductivos/de vida de un animal (A3). Debe mostrar
// TODOS los intentos de servicio, incluidos los que no cuajaron (V7): cada
// `hato_eventos` de tipo `servicio` es su propia entrada, en orden
// cronológico, con toro y tipo (monta/inseminación) cuando existen.
//
// Punto sólido = evento pasado (ya ocurrió); punto hueco = evento
// proyectado (fecha_secar/parto_probable derivadas, que NO son filas de
// `hato_eventos` -- ver nota en calculosHato.ts, "secado_planificado/
// parto_probable NO son eventos"). Entrada "HOY" resaltable cuando cae
// dentro del rango visible.

import {
  Syringe, HeartPulse, Baby, Skull, ArrowRightLeft, ShoppingCart,
  Stethoscope, RefreshCcw, CircleDot, Circle,
} from 'lucide-react';
import { formatShortDate } from '@/utils/format';
import type { HatoEventoRow, TipoEventoHato } from '@/types/hato';

const ICONO_POR_TIPO: Record<TipoEventoHato, typeof Syringe> = {
  servicio: Syringe,
  celo: HeartPulse,
  confirmacion_prenez: Stethoscope,
  parto: Baby,
  aborto: HeartPulse,
  secado_real: Circle,
  venta: ArrowRightLeft,
  muerte: Skull,
  compra: ShoppingCart,
  cambio_etapa: RefreshCcw,
  rechequeo: Stethoscope,
};

const LABEL_POR_TIPO: Record<TipoEventoHato, string> = {
  servicio: 'Servicio',
  celo: 'Celo (retorno)',
  confirmacion_prenez: 'Confirmación de preñez',
  parto: 'Parto',
  aborto: 'Aborto',
  secado_real: 'Secado real',
  venta: 'Venta',
  muerte: 'Muerte',
  compra: 'Compra',
  cambio_etapa: 'Cambio de etapa',
  rechequeo: 'Rechequeo',
};

function descripcionEvento(evento: HatoEventoRow, nombreToro: string | null): string | null {
  if (evento.tipo === 'servicio') {
    const tipo = evento.tipo_servicio === 'monta' ? 'monta' : evento.tipo_servicio === 'inseminacion' ? 'inseminación' : null;
    const partes = [tipo, nombreToro].filter(Boolean);
    return partes.length > 0 ? partes.join(' — ') : null;
  }
  if (evento.tipo === 'parto' && evento.cria_destino) {
    const destinos: Record<string, string> = {
      retenida: 'cría retenida',
      macho_vendido: 'macho vendido',
      hembra_vendida: 'hembra vendida',
      muerta: 'cría muerta',
      aborto: 'aborto',
    };
    return destinos[evento.cria_destino] ?? null;
  }
  return null;
}

interface EventoProyectado {
  tipo: 'secar' | 'parto_probable';
  fecha: string;
}

export function EventoTimeline({
  eventos,
  nombresToroPorId,
  proyectados = [],
  fechaHoy,
}: {
  eventos: HatoEventoRow[];
  nombresToroPorId: Record<string, string>;
  proyectados?: EventoProyectado[];
  fechaHoy: string;
}) {
  type EntradaTimeline =
    | { tipo: 'real'; fecha: string; evento: HatoEventoRow }
    | { tipo: 'proyectado'; fecha: string; proyectado: EventoProyectado };

  const entradas: EntradaTimeline[] = [
    ...eventos.map((evento): EntradaTimeline => ({ tipo: 'real', fecha: evento.fecha, evento })),
    ...proyectados.map((proyectado): EntradaTimeline => ({ tipo: 'proyectado', fecha: proyectado.fecha, proyectado })),
  ].sort((a, b) => a.fecha.localeCompare(b.fecha));

  if (entradas.length === 0) {
    return <p className="text-sm text-gray-500">Sin eventos registrados todavía.</p>;
  }

  return (
    <ol className="relative border-l-4 border-gray-200 space-y-6 pl-8">
      {entradas.map((entrada, i) => {
        const esHoy = entrada.fecha === fechaHoy;
        if (entrada.tipo === 'proyectado') {
          const label = entrada.proyectado.tipo === 'secar' ? 'Secado proyectado' : 'Parto probable (proyectado)';
          return (
            <li key={`proj-${i}`} className="relative">
              <span className="absolute -left-4 top-1 flex items-center justify-center w-3 h-3 rounded-full border-2 border-amber-500 bg-white">
                <Circle className="w-2 h-2 text-amber-500" />
              </span>
              <p className="text-sm font-medium text-amber-700">{label}</p>
              <p className="text-xs text-gray-500">{formatShortDate(entrada.fecha)} — proyectado, aún no ocurre</p>
            </li>
          );
        }

        const evento = entrada.evento;
        const Icono = ICONO_POR_TIPO[evento.tipo] ?? CircleDot;
        const nombreToro = evento.toro_id ? nombresToroPorId[evento.toro_id] ?? null : null;
        const descripcion = descripcionEvento(evento, nombreToro);

        return (
          <li key={evento.id} className="relative">
            <span className="absolute -left-4 top-1 flex items-center justify-center w-3 h-3 rounded-full bg-primary">
              <Icono className="w-2 h-2 text-white" />
            </span>
            <div className="flex items-center gap-2 flex-wrap">
              <p className="text-sm font-medium text-gray-900">{LABEL_POR_TIPO[evento.tipo]}</p>
              {esHoy && (
                <span className="inline-flex items-center rounded-full bg-green-50 text-green-700 border border-green-200 text-xs font-medium px-2 py-0.5">
                  HOY
                </span>
              )}
              {evento.fecha_confianza === 'aproximada' && (
                <span className="text-xs text-gray-400">(fecha aproximada)</span>
              )}
            </div>
            <p className="text-xs text-gray-500">{formatShortDate(evento.fecha)}{descripcion ? ` — ${descripcion}` : ''}</p>
          </li>
        );
      })}
    </ol>
  );
}
