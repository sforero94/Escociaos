import { useNavigate } from 'react-router-dom';
import { formatNumber } from '@/utils/format';
import { diferenciaEnDias, obtenerFechaHoy } from '@/utils/fechas';
import { Sparkline } from './Sparkline';
import { PulsoChipFrescura } from './PulsoChipFrescura';
import { PulsoFilaAccion } from './PulsoFilaAccion';
import { PulsoCardSkeleton } from './PulsoCardSkeleton';
import { usePulsoHato, type UsoPulsoHato } from './hooks/usePulsoHato';
import { formatearFechaSinAnio, formatearDiasTranscurridos, denominadorHatoInvalido } from './pulsoNegocioCalculos';

const RUTA_HATO = '/hato-lechero';

export interface PulsoHatoCardViewProps extends UsoPulsoHato {
  onNavigate: () => void;
}

/**
 * PulsoHatoCardView - presentación pura de la tarjeta "Hato Lechero"
 * (docs/plan_dashboard_centro_control.md §3.1), separada de `PulsoHatoCard`
 * (el contenedor que hace I/O vía `usePulsoHato`) para poder testear el
 * contrato de render -- denominador SIEMPRE visible en ámbar, "sin dato"
 * nunca en 0, etc. -- con fixtures estáticas, sin mockear Supabase.
 *
 * Dato principal: L/vaca del pesaje más reciente, con su denominador
 * SIEMPRE visible (R-4 del módulo: "el total del hato nunca se muestra sin
 * decir sobre cuántas vacas se midió") -- nunca en tooltip, en ámbar.
 * Debajo, separada por línea, la fila de revisión (vacías >90d + secado
 * vencido) -- los conteos ya vienen calculados por `usePulsoHato` vía
 * `vaciasMasDeNDias`/`derivarAlertasTablero`; esta vista sólo los pinta.
 */
export function PulsoHatoCardView({ cargando, error, datos, vejez, revision, onNavigate }: PulsoHatoCardViewProps) {
  if (cargando) return <PulsoCardSkeleton />;

  const hoy = obtenerFechaHoy();
  const diasVejez = vejez?.ultimaFecha ? diferenciaEnDias(vejez.ultimaFecha, hoy) : null;
  const chipAmbar = vejez !== null && vejez.nivel !== 'ok';
  const chipLabel = diasVejez === null ? 'Sin pesajes' : formatearDiasTranscurridos(diasVejez);

  const totalPorRevisar = revision ? revision.vacias + revision.secadoVencido : 0;

  return (
    <div className="rounded-xl border border-primary/10 bg-white p-4 lg:p-5 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs uppercase tracking-wide text-brand-brown/60">Hato Lechero</p>
        <PulsoChipFrescura label={chipLabel} ambar={chipAmbar} />
      </div>

      {error ? (
        <p className="mt-3 text-sm text-brand-brown/60">No se pudo cargar el hato.</p>
      ) : datos === null ? (
        <div className="mt-3">
          <p className="text-2xl font-bold text-brand-brown/40">—</p>
          <p className="text-sm text-brand-brown/60 mt-1">Sin pesaje registrado</p>
        </div>
      ) : (
        <div className="mt-3">
          <div className="flex items-end justify-between gap-2">
            <p className="text-2xl font-bold text-foreground">
              {formatNumber(datos.litrosPorVacaHoy, 1)}
              <span className="text-sm font-normal text-brand-brown/60 ml-1">L/vaca</span>
            </p>
            <Sparkline data={datos.serieLitrosPorVaca} />
          </div>
          <p className="text-sm text-brand-brown/60 mt-1">
            {formatNumber(datos.litrosTotalHoy, 1)} L el {formatearFechaSinAnio(datos.fechaUltimoPesaje)}
          </p>
          {/* Denominador contractual (§3.1 del plan, R-4): SIEMPRE visible,
              nunca en tooltip. Ámbar a propósito -- es la regla, no un
              estado de alerta. EXCEPTO cuando el denominador es imposible
              (numerador > denominador, `denominadorHatoInvalido`): una
              cifra que no puede ser cierta ("27 de 26 vacas pesadas") es
              peor que no mostrar la línea -- se omite entera en vez de
              mentir. */}
          {!denominadorHatoInvalido(datos) && (
            <p className="text-sm font-medium text-amber-700 mt-2">
              {datos.vacasPesadasHoy} de {datos.vacasTotalEnOrdeno} vacas pesadas
            </p>
          )}
        </div>
      )}

      {!error && revision && (
        <PulsoFilaAccion onClick={onNavigate}>
          {totalPorRevisar > 0 ? (
            <>
              <p className="text-sm font-medium text-foreground">
                {totalPorRevisar} vaca{totalPorRevisar === 1 ? '' : 's'} por revisar
              </p>
              <p className="text-xs text-brand-brown/60">
                {revision.vacias} vacía{revision.vacias === 1 ? '' : 's'} hace más de {revision.umbralDias} d ·{' '}
                {revision.secadoVencido} con secado vencido
              </p>
            </>
          ) : (
            <p className="text-sm text-brand-brown/60">Nada por revisar</p>
          )}
        </PulsoFilaAccion>
      )}
    </div>
  );
}

/** PulsoHatoCard - contenedor: I/O (`usePulsoHato`) + navegación, pintado
 *  por `PulsoHatoCardView`. Es lo único que monta el resto del tablero. */
export function PulsoHatoCard() {
  const navigate = useNavigate();
  const resultado = usePulsoHato();
  return <PulsoHatoCardView {...resultado} onNavigate={() => navigate(RUTA_HATO)} />;
}
