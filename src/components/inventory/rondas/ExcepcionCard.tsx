// ARCHIVO: components/inventory/rondas/ExcepcionCard.tsx
// DESCRIPCIÓN: Una excepción reportada en una ronda, con su trazabilidad
// completa (R-8/CA-12): quién reportó, quién explicó (y si fue una cita
// precargada del audio de Uriel o la palabra directa de David, R-6/CA-38),
// quién capturó / propuso / decidió / aplicó, y con qué causa. Presentacional
// puro -- toda la resolución de nombres y de la vía la hace el hook/pantalla
// que lo llama; este componente sólo renderiza.
//
// R-15/CA-13: el valor de la diferencia SOLO se muestra si `mostrarValor` es
// true -- la pantalla que lo compone decide eso con `hasRole(['Gerencia'])`,
// nunca este componente por su cuenta (para que quede en un solo lugar
// auditable el gateo de valor de todo el módulo).

import { DesenlaceBadge } from './DesenlaceBadge';
import { formatCurrency, formatNumber, formatShortDate } from '@/utils/format';
import { resolverActor, type ActorResuelto } from '@/utils/rondaInventarioUi';
import type { RondaExcepcionRow } from '@/types/rondaInventario';

interface ExcepcionCardProps {
  excepcion: RondaExcepcionRow;
  nombreProducto: string;
  unidad: string;
  precioUnitario: number | null;
  causasPorClave: ReadonlyMap<string, string>;
  usuariosPorId: ReadonlyMap<string, string>;
  telegramPorId: ReadonlyMap<string, string>;
  mostrarValor: boolean;
}

function TrailStep({
  etiqueta,
  actor,
  fecha,
  nota,
}: {
  etiqueta: string;
  actor: ActorResuelto | null;
  fecha: string | null;
  nota?: string | null;
}) {
  if (!actor) return null;
  return (
    <div className="text-xs text-brand-brown/60 flex flex-wrap items-baseline gap-x-1.5">
      <span className="font-medium text-brand-brown/80">{etiqueta}:</span>
      <span>{actor.nombre}</span>
      {actor.canal === 'telegram' && <span className="text-brand-brown/40">(Telegram)</span>}
      {fecha && <span>· {formatShortDate(fecha)}</span>}
      {nota && <span className="italic">— {nota}</span>}
    </div>
  );
}

export function ExcepcionCard({
  excepcion: e,
  nombreProducto,
  unidad,
  precioUnitario,
  causasPorClave,
  usuariosPorId,
  telegramPorId,
  mostrarValor,
}: ExcepcionCardProps) {
  const resolver = (usuarioId: string | null, telegramId: string | null) =>
    resolverActor(usuarioId, telegramId, usuariosPorId, telegramPorId);

  const diferencia = e.cantidad_fisica - e.teorico_conteo;
  const valorDiferencia = precioUnitario != null ? Math.abs(diferencia) * precioUnitario : null;

  const causaSugeridaEtiqueta = e.causa_sugerida ? causasPorClave.get(e.causa_sugerida) ?? e.causa_sugerida : null;
  const causaDecisionEtiqueta = e.decision_causa ? causasPorClave.get(e.decision_causa) ?? e.decision_causa : null;
  const causaPropuestaEtiqueta = e.propuesta_causa ? causasPorClave.get(e.propuesta_causa) ?? e.propuesta_causa : null;

  return (
    <div className="bg-white rounded-xl border border-primary/10 p-4 space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h4 className="text-foreground">{nombreProducto}</h4>
          <p className="text-sm text-brand-brown/60">
            Teórico {formatNumber(e.teorico_conteo, 1)} {unidad} · Físico {formatNumber(e.cantidad_fisica, 1)}{' '}
            {unidad}
            {e.fisico_origen === 'derivado' && (
              <span className="text-brand-brown/40 italic"> (derivado de lo narrado)</span>
            )}
            {' · Diferencia '}
            <span className={diferencia < 0 ? 'text-red-600' : diferencia > 0 ? 'text-blue-600' : ''}>
              {diferencia > 0 ? '+' : ''}
              {formatNumber(diferencia, 1)} {unidad}
            </span>
            {mostrarValor && valorDiferencia != null && (
              <span className="text-brand-brown/50"> ({formatCurrency(valorDiferencia)})</span>
            )}
          </p>
        </div>
        <DesenlaceBadge estado={e.estado} />
      </div>

      {e.observacion_uriel && (
        <p className="text-sm text-brand-brown/70">
          <span className="font-medium">Observación de Uriel:</span> {e.observacion_uriel}
        </p>
      )}

      <div className="space-y-1 pt-2 border-t border-primary/10">
        <TrailStep etiqueta="Reportada por" actor={resolver(e.reportada_por_usuario, e.reportada_por_telegram)} fecha={e.reportada_en} />

        {e.explicacion_citada && !e.explicacion_david_en && (
          <p className="text-xs text-amber-700 italic">
            Cita de Uriel (aún no confirmada por David): «{e.explicacion_citada}»
          </p>
        )}

        {e.explicacion_david && (
          <TrailStep
            etiqueta={
              e.explicacion_david_accion === 'confirmo_cita'
                ? 'David confirmó'
                : e.explicacion_david_accion === 'corrigio_cita'
                  ? 'David corrigió'
                  : 'David explicó'
            }
            actor={resolver(e.explicacion_david_usuario, e.explicacion_david_telegram)}
            fecha={e.explicacion_david_en}
            nota={e.explicacion_david}
          />
        )}

        {e.captura_movimiento_id && (
          <TrailStep
            etiqueta="Capturado por"
            actor={resolver(e.captura_por_usuario, e.captura_por_telegram)}
            fecha={e.captura_en}
          />
        )}

        {e.propuesta_delta != null && (
          <TrailStep
            etiqueta="Ajuste propuesto por"
            actor={resolver(e.propuesta_por_usuario, e.propuesta_por_telegram)}
            fecha={e.propuesta_en}
            nota={causaPropuestaEtiqueta ? `causa sugerida: ${causaPropuestaEtiqueta}` : e.propuesta_nota}
          />
        )}

        {e.decision_causa && (
          <TrailStep
            etiqueta={e.estado === 'ajuste_desestimado' ? 'Desestimado por' : 'Aprobado por'}
            actor={resolver(e.decision_por_usuario, e.decision_por_telegram)}
            fecha={e.decision_en}
            nota={causaDecisionEtiqueta ? `causa: ${causaDecisionEtiqueta}` : e.decision_nota}
          />
        )}

        {e.aplicacion_movimiento_id && (
          <TrailStep
            etiqueta="Aplicado por"
            actor={resolver(e.aplicacion_por_usuario, e.aplicacion_por_telegram)}
            fecha={e.aplicacion_en}
          />
        )}

        {!e.decision_causa && causaSugeridaEtiqueta && (
          <p className="text-xs text-brand-brown/50">Causa sugerida por el intérprete: {causaSugeridaEtiqueta}</p>
        )}
      </div>
    </div>
  );
}
