import { useNavigate } from 'react-router-dom';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { formatNumber } from '@/utils/format';
import { diferenciaEnDias, obtenerFechaHoy } from '@/utils/fechas';
import { PulsoChipFrescura } from './PulsoChipFrescura';
import { PulsoBarraHorizontal } from './PulsoBarraHorizontal';
import { PulsoFilaAccion } from './PulsoFilaAccion';
import { PulsoCardSkeleton } from './PulsoCardSkeleton';
import { usePulsoAguacate, type UsoPulsoAguacate } from './hooks/usePulsoAguacate';
import { formatearFechaSinAnio, formatearDiasTranscurridos, PLAGAS_VISIBLES_PULSO_AGUACATE } from './pulsoNegocioCalculos';

const RUTA_MONITOREO = '/monitoreo';

/** Ronda del plan §3.2: chip ámbar pasados 14 días sin nueva ronda. Umbral
 *  de PRESENTACIÓN (cuándo avisar que el dato envejeció), no de negocio --
 *  distinto de los `hato_config`, que sí gobiernan cálculo. Documentado
 *  aquí, en el único sitio que lo usa. */
const UMBRAL_RONDA_VIEJA_DIAS = 14;

/** Rojo=Alta / ámbar=Media / verde=Baja -- mismos cortes y mismo mapeo de
 *  color que `clasificarGravedad` usa en el resto del módulo de Monitoreo
 *  (`MapaCalorIncidencias.tsx::obtenerColorIncidencia`,
 *  `DashboardMonitoreoV3.tsx`) -- "un mismo % de incidencia debe verse
 *  igual de crítico en cualquier vista" (comentario original de esa
 *  función), nunca una paleta nueva para esta tarjeta. */
function colorGravedad(numerica: number): { texto: string; barra: string } {
  if (numerica === 3) return { texto: 'text-red-600', barra: 'bg-red-500' };
  if (numerica === 2) return { texto: 'text-amber-600', barra: 'bg-amber-500' };
  return { texto: 'text-green-600', barra: 'bg-green-500' };
}

export interface PulsoAguacateCardViewProps extends UsoPulsoAguacate {
  onNavigate: () => void;
}

/**
 * PulsoAguacateCardView - presentación pura de la tarjeta "Aguacate Hass"
 * (docs/plan_dashboard_centro_control.md §3.2), separada de
 * `PulsoAguacateCard` (el contenedor que hace I/O vía `usePulsoAguacate`)
 * para poder testear el contrato de render con fixtures estáticas.
 *
 * Dato principal: la plaga de mayor incidencia de la RONDA más reciente
 * (agrupada siempre por `ronda_id`, nunca por `fecha_monitoreo` -- ver
 * `usePulsoAguacate.ts`); debajo, las siguientes con barra + incidencia.
 * Semántica de color invertida (subir = rojo), igual que `PlagasKPICard`.
 */
export function PulsoAguacateCardView({ cargando, error, datos, onNavigate }: PulsoAguacateCardViewProps) {
  if (cargando) return <PulsoCardSkeleton />;

  const hoy = obtenerFechaHoy();
  const diasRonda = datos ? diferenciaEnDias(datos.fechaRonda, hoy) : null;
  const chipAmbar = diasRonda !== null && diasRonda > UMBRAL_RONDA_VIEJA_DIAS;
  const chipLabel = datos
    ? `Ronda del ${formatearFechaSinAnio(datos.fechaRonda)} · ${formatearDiasTranscurridos(diasRonda!)}`
    : 'Sin ronda';

  const principal = datos?.plagas[0] ?? null;
  const siguientes = datos ? datos.plagas.slice(1, PLAGAS_VISIBLES_PULSO_AGUACATE) : [];

  return (
    <div className="rounded-xl border border-primary/10 bg-white p-4 lg:p-5 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs uppercase tracking-wide text-brand-brown/60">Aguacate Hass</p>
        {!error && <PulsoChipFrescura label={chipLabel} ambar={chipAmbar} />}
      </div>

      {error ? (
        <p className="mt-3 text-sm text-brand-brown/60">No se pudo cargar el monitoreo.</p>
      ) : principal === null ? (
        <div className="mt-3">
          <p className="text-2xl font-bold text-brand-brown/40">—</p>
          <p className="text-sm text-brand-brown/60 mt-1">Sin monitoreo reciente</p>
        </div>
      ) : (
        <div className="mt-3">
          <div className="flex items-center gap-2">
            <p className={`text-2xl font-bold ${colorGravedad(principal.gravedad.numerica).texto}`}>
              {formatNumber(principal.incidencia, 1)}%
            </p>
            {principal.deltaPp !== null && principal.deltaPp !== 0 && (
              <span
                className={`flex items-center gap-0.5 text-xs font-medium ${
                  principal.deltaPp > 0 ? 'text-red-600' : 'text-green-600'
                }`}
              >
                {principal.deltaPp > 0 ? (
                  <TrendingUp className="w-3.5 h-3.5" aria-hidden="true" />
                ) : (
                  <TrendingDown className="w-3.5 h-3.5" aria-hidden="true" />
                )}
                {principal.deltaPp > 0 ? '+' : ''}
                {formatNumber(principal.deltaPp, 1)}pp
              </span>
            )}
            {principal.deltaPp === 0 && (
              <span className="flex items-center gap-0.5 text-xs font-medium text-brand-brown/50">
                <Minus className="w-3.5 h-3.5" aria-hidden="true" />
                0pp
              </span>
            )}
          </div>
          <p className="text-sm text-foreground mt-0.5">{principal.nombre}</p>
          <p className="text-sm text-brand-brown/60">
            {formatNumber(principal.arbolesAfectados)} de {formatNumber(principal.arbolesMonitoreados)} árboles
          </p>

          {siguientes.length > 0 && (
            <div className="mt-3 pt-3 border-t border-gray-100 space-y-2.5">
              {siguientes.map((p) => (
                <PulsoBarraHorizontal
                  key={p.nombre}
                  etiqueta={p.nombre}
                  valorTexto={`${formatNumber(p.incidencia, 1)}%`}
                  proporcion={p.incidencia / 100}
                  colorClassName={colorGravedad(p.gravedad.numerica).barra}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {!error && (
        <PulsoFilaAccion onClick={onNavigate}>
          <p className="text-sm text-brand-brown/60">Ver monitoreo</p>
        </PulsoFilaAccion>
      )}
    </div>
  );
}

/** PulsoAguacateCard - contenedor: I/O (`usePulsoAguacate`) + navegación,
 *  pintado por `PulsoAguacateCardView`. Es lo único que monta el resto del
 *  tablero. */
export function PulsoAguacateCard() {
  const navigate = useNavigate();
  const resultado = usePulsoAguacate();
  return <PulsoAguacateCardView {...resultado} onNavigate={() => navigate(RUTA_MONITOREO)} />;
}
