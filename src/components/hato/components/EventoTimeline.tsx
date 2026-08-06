// ARCHIVO: components/hato/components/EventoTimeline.tsx
// DESCRIPCIÓN: Componente canónico nuevo del plan §7.6 -- línea de tiempo
// vertical de eventos reproductivos/de vida de un animal (A3). Debe mostrar
// TODOS los intentos de servicio, incluidos los que no cuajaron (V7): cada
// `hato_eventos` de tipo `servicio` es su propia entrada, en orden
// DESCENDENTE (más reciente primero) -- ver nota más abajo, "orden y ventana
// visible" --, con toro y tipo (monta/inseminación) cuando existen.
//
// Punto sólido = evento pasado (ya ocurrió); punto hueco = evento
// proyectado (fecha_secar/parto_probable derivadas, que NO son filas de
// `hato_eventos` -- ver nota en calculosHato.ts, "secado_planificado/
// parto_probable NO son eventos"). Entrada "HOY" resaltable cuando cae
// dentro del rango visible.
//
// Orden y ventana visible: entradas ordenadas DESCENDENTE por fecha (más
// reciente arriba). Por defecto solo se muestran los últimos
// `MESES_VISIBLES_TIMELINE` meses relativos a `fechaHoy` (prop, NUNCA
// `Date.now()` -- mismo patrón que el resto del engine de hato: la fecha de
// referencia siempre entra como parámetro para que el componente quede puro
// y testeable). Las entradas más antiguas no se descartan -- quedan detrás
// de un `Collapsible` "Ver eventos anteriores (N)" que las revela en el
// mismo orden descendente. Los proyectados (`proyectados`) son fechas
// futuras relativas a `fechaHoy`, así que caen naturalmente dentro de la
// ventana visible y nunca quedan escondidos detrás del colapsable.
//
// T4b (S3, docs/plan_hato_ciclo_manual_override.md §4.4/§5.5) agrega, por
// evento REAL: el chip "Del chequeo del {fecha}" cuando `chequeo_vaca_id`
// no es nulo (una corrección sobre ese evento caduca si Martha vuelve a
// aprobar ese chequeo -- 065 lo borra y re-inserta) y, si `puedeEditar`, el
// enlace "Corregir" que abre `EditarEventoDialog` (gateado por el caller a
// Administrador/Gerencia, mismo criterio que el resto de ediciones del
// módulo). El chip no requiere una query nueva: `chequeoFechaPorId` lo arma
// el caller a partir de `detalle.chequeos`, que ya trae `hato_chequeos.fecha`.

import { useState } from 'react';
import {
  Syringe, HeartPulse, Baby, Skull, ArrowRightLeft, ShoppingCart,
  Stethoscope, RefreshCcw, CircleDot, Circle, ChevronDown, ChevronUp,
} from 'lucide-react';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { formatShortDate } from '@/utils/format';
import type { HatoEventoRow, TipoEventoHato } from '@/types/hato';

/** Ventana visible por defecto del timeline, en meses relativos a `fechaHoy`. */
const MESES_VISIBLES_TIMELINE = 12;

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

type EntradaTimeline =
  | { tipo: 'real'; fecha: string; evento: HatoEventoRow }
  | { tipo: 'proyectado'; fecha: string; proyectado: EventoProyectado };

/** Fecha de corte (`YYYY-MM-DD`) de la ventana visible: `MESES_VISIBLES_TIMELINE`
 * meses antes de `fechaHoy`. Puramente derivada del parámetro -- nunca lee el
 * reloj -- para que el componente siga siendo testeable con una fecha fija. */
function fechaCorteTimeline(fechaHoy: string): string {
  const corte = new Date(`${fechaHoy}T00:00:00Z`);
  corte.setUTCMonth(corte.getUTCMonth() - MESES_VISIBLES_TIMELINE);
  return corte.toISOString().slice(0, 10);
}

function EntradaItem({
  entrada,
  nombresToroPorId,
  fechaHoy,
  chequeoFechaPorId,
  puedeEditar,
  onEditar,
}: {
  entrada: EntradaTimeline;
  nombresToroPorId: Record<string, string>;
  fechaHoy: string;
  chequeoFechaPorId: Record<string, string>;
  puedeEditar: boolean;
  onEditar: (evento: HatoEventoRow) => void;
}) {
  const esHoy = entrada.fecha === fechaHoy;

  if (entrada.tipo === 'proyectado') {
    const label = entrada.proyectado.tipo === 'secar' ? 'Secado proyectado' : 'Parto probable (proyectado)';
    return (
      <li className="relative">
        {/* `border-amber-500` no existe en el build congelado (solo
            `border-amber-200`) -- clase muerta preexistente, corregida
            aquí porque T4b tocó este componente a fondo. */}
        <span className="absolute -left-4 top-1 flex items-center justify-center w-3 h-3 rounded-full border-2 border-amber-200 bg-white">
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
  const chequeoFecha = evento.chequeo_vaca_id ? chequeoFechaPorId[evento.chequeo_vaca_id] ?? null : null;

  return (
    <li className="relative">
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
        {evento.chequeo_vaca_id && (
          <span
            className="inline-flex items-center rounded-full bg-gray-100 text-gray-500 border border-gray-200 text-xs font-medium px-2 py-0.5"
            title="Este evento viene de un chequeo -- se puede regenerar si ese chequeo se vuelve a aprobar"
          >
            {chequeoFecha ? `Del chequeo del ${formatShortDate(chequeoFecha)}` : 'Viene de un chequeo'}
          </span>
        )}
        {puedeEditar && (
          <button
            type="button"
            onClick={() => onEditar(evento)}
            className="text-xs text-primary hover:underline ml-auto"
          >
            Corregir
          </button>
        )}
      </div>
      <p className="text-xs text-gray-500">{formatShortDate(evento.fecha)}{descripcion ? ` — ${descripcion}` : ''}</p>
    </li>
  );
}

export function EventoTimeline({
  eventos,
  nombresToroPorId,
  proyectados = [],
  fechaHoy,
  chequeoFechaPorId,
  puedeEditar,
  onEditar,
}: {
  eventos: HatoEventoRow[];
  nombresToroPorId: Record<string, string>;
  proyectados?: EventoProyectado[];
  fechaHoy: string;
  /** `chequeo_vaca_id -> hato_chequeos.fecha`, construido por el caller a
   * partir de `detalle.chequeos` (T4b) -- sin esto, el chip cae al genérico
   * "Viene de un chequeo" sin fecha. */
  chequeoFechaPorId: Record<string, string>;
  /** T4b (S3): gateado por el caller a Administrador/Gerencia (mismo
   * criterio que el resto de ediciones del módulo). */
  puedeEditar: boolean;
  onEditar: (evento: HatoEventoRow) => void;
}) {
  const [expandido, setExpandido] = useState(false);

  const entradas: EntradaTimeline[] = [
    ...eventos.map((evento): EntradaTimeline => ({ tipo: 'real', fecha: evento.fecha, evento })),
    ...proyectados.map((proyectado): EntradaTimeline => ({ tipo: 'proyectado', fecha: proyectado.fecha, proyectado })),
  ].sort((a, b) => b.fecha.localeCompare(a.fecha));

  if (entradas.length === 0) {
    return <p className="text-sm text-gray-500">Sin eventos registrados todavía.</p>;
  }

  const corte = fechaCorteTimeline(fechaHoy);
  // Los proyectados son fechas futuras relativas a `fechaHoy` (>= hoy > corte),
  // así que siempre caen aquí -- nunca detrás del colapsable.
  const visibles = entradas.filter((entrada) => entrada.fecha >= corte);
  const antiguas = entradas.filter((entrada) => entrada.fecha < corte);

  return (
    <div>
      {visibles.length > 0 && (
        <ol className="relative border-l-4 border-gray-200 space-y-6 pl-8">
          {visibles.map((entrada, i) => (
            <EntradaItem
              key={entrada.tipo === 'real' ? entrada.evento.id : `proj-${i}`}
              entrada={entrada}
              nombresToroPorId={nombresToroPorId}
              fechaHoy={fechaHoy}
              chequeoFechaPorId={chequeoFechaPorId}
              puedeEditar={puedeEditar}
              onEditar={onEditar}
            />
          ))}
        </ol>
      )}

      {antiguas.length > 0 && (
        <Collapsible open={expandido} onOpenChange={setExpandido} className="mt-4">
          <CollapsibleTrigger asChild>
            <button className="w-full text-xs text-gray-500 hover:text-gray-900 py-2 flex items-center justify-center gap-1 transition-colors">
              {expandido ? (
                <>
                  <ChevronUp className="w-3 h-3" />
                  Ocultar
                </>
              ) : (
                <>
                  <ChevronDown className="w-3 h-3" />
                  Ver eventos anteriores ({antiguas.length})
                </>
              )}
            </button>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <ol className="relative border-l-4 border-gray-200 space-y-6 pl-8 mt-4">
              {antiguas.map((entrada, i) => (
                <EntradaItem
                  key={entrada.tipo === 'real' ? entrada.evento.id : `proj-antigua-${i}`}
                  entrada={entrada}
                  nombresToroPorId={nombresToroPorId}
                  fechaHoy={fechaHoy}
                  chequeoFechaPorId={chequeoFechaPorId}
                  puedeEditar={puedeEditar}
                  onEditar={onEditar}
                />
              ))}
            </ol>
          </CollapsibleContent>
        </Collapsible>
      )}
    </div>
  );
}
