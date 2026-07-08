// ARCHIVO: components/monitoreo/PriorizacionScouting.tsx
// DESCRIPCIÓN: Vista de "priorización de scouting" — P2 de
// docs/PLAN_PRIORIZACION_MONITOREO.md. Lista rankeada de combinaciones
// lote/sublote × plaga que más ameritan una visita esta semana, con el motivo
// ("why") ya construido por el motor puro `priorizarMonitoreo`.
//
// Sigue el patrón visual de InsightCard.tsx / VistaRapidaCard.tsx (colores por
// severidad urgente/atención/bueno) pero con su propio esquema de 6 "brackets"
// (ver `bracket` en PriorizacionEntry). Requisito explícito del diseño (§6, §7
// P2): las entradas Tier A (umbral económico Cartama) deben distinguirse a
// simple vista de las Tier B (tercil histórico) — se usa una insignia
// independiente del color de urgencia para esto, de modo que nada se muestre
// con más autoridad de la que realmente tiene.

import { useEffect, useState, useCallback } from 'react';
import {
  AlertTriangle,
  ShieldAlert,
  BarChart3,
  TrendingUp,
  TrendingDown,
  Minus,
  Clock,
  Sparkles,
  ChevronDown,
  ChevronUp,
  RefreshCw,
} from 'lucide-react';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { usePriorizacionMonitoreo } from './hooks/usePriorizacionMonitoreo';
import { formatPercentage } from '../../utils/format';
import type { PriorizacionEntry, Tendencia } from '../../utils/priorizacionMonitoreo';

const ENTRADAS_INICIALES = 12;

// Estilo por `bracket` (0 = más urgente, 5 = menos urgente). Independiente de la
// insignia de Tier — el bracket comunica urgencia, la insignia comunica de dónde
// viene esa urgencia (umbral validado vs. estadístico).
const BRACKET_CONFIG: Record<number, { bg: string; border: string; text: string; dot: string; label: string }> = {
  0: { bg: 'bg-red-50', border: 'border-red-300', text: 'text-red-900', dot: 'bg-red-600', label: 'Sobre el umbral económico' },
  1: { bg: 'bg-orange-50', border: 'border-orange-300', text: 'text-orange-900', dot: 'bg-orange-500', label: 'Acercándose al umbral' },
  2: { bg: 'bg-amber-50', border: 'border-amber-300', text: 'text-amber-900', dot: 'bg-amber-500', label: 'Gravedad alta (histórico)' },
  3: { bg: 'bg-yellow-50', border: 'border-yellow-200', text: 'text-yellow-800', dot: 'bg-yellow-400', label: 'Bajo el umbral' },
  4: { bg: 'bg-blue-50', border: 'border-blue-200', text: 'text-blue-800', dot: 'bg-blue-400', label: 'Gravedad media (histórico)' },
  5: { bg: 'bg-gray-50', border: 'border-gray-200', text: 'text-gray-600', dot: 'bg-gray-400', label: 'Gravedad baja (histórico)' },
};

function TendenciaIcono({ tendencia }: { tendencia: Tendencia }) {
  if (tendencia === 'subiendo') {
    return <TrendingUp className="w-4 h-4 text-red-600 shrink-0" aria-label="Tendencia subiendo" />;
  }
  if (tendencia === 'bajando') {
    return <TrendingDown className="w-4 h-4 text-green-600 shrink-0" aria-label="Tendencia bajando" />;
  }
  return <Minus className="w-4 h-4 text-gray-400 shrink-0" aria-label="Tendencia estable" />;
}

function TierBadge({ entry }: { entry: PriorizacionEntry }) {
  if (entry.tier === 'A') {
    return (
      <Badge variant="outline" className="border-purple-300 bg-purple-50 text-purple-700 gap-1">
        <ShieldAlert className="w-3 h-3" />
        Umbral {entry.umbralSourceLabel ?? 'Cartama'}
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="border-slate-300 bg-slate-50 text-slate-600 gap-1">
      <BarChart3 className="w-3 h-3" />
      Tercil histórico
    </Badge>
  );
}

function EntradaPriorizacion({ entry }: { entry: PriorizacionEntry }) {
  const config = BRACKET_CONFIG[entry.bracket] ?? BRACKET_CONFIG[5];

  return (
    <div className={`${config.bg} ${config.border} border rounded-lg p-3`}>
      <div className="flex items-start gap-3">
        <div className={`w-2.5 h-2.5 rounded-full mt-1.5 shrink-0 ${config.dot}`} />

        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2 flex-wrap">
            <div className="min-w-0">
              <div className={`font-semibold text-sm ${config.text} truncate`}>
                {entry.pest_nombre}
              </div>
              <div className="text-xs text-brand-brown/70 truncate">
                {entry.lote_nombre ?? 'Lote sin nombre'}
                {entry.sublote_nombre ? ` · ${entry.sublote_nombre}` : ''}
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <TendenciaIcono tendencia={entry.tendencia} />
              <span className={`text-sm font-bold ${config.text}`}>
                {formatPercentage(entry.incidenciaActual, 1)}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap mt-1.5">
            <TierBadge entry={entry} />
            {entry.temporadaAlta && (
              <Badge variant="outline" className="border-fuchsia-300 bg-fuchsia-50 text-fuchsia-700 gap-1">
                <Sparkles className="w-3 h-3" />
                Temporada alta
              </Badge>
            )}
            {entry.diasDesdeUltimaFumigacion != null && (
              <Badge variant="outline" className="border-gray-300 bg-white text-gray-600 gap-1">
                <Clock className="w-3 h-3" />
                Fumigado hace {entry.diasDesdeUltimaFumigacion} {entry.diasDesdeUltimaFumigacion === 1 ? 'día' : 'días'}
              </Badge>
            )}
          </div>

          <p className={`text-xs mt-1.5 ${config.text} opacity-90`}>{entry.why}</p>
        </div>
      </div>
    </div>
  );
}

export function PriorizacionScouting() {
  const { loading, error, cargarPriorizacion } = usePriorizacionMonitoreo();
  const [entradas, setEntradas] = useState<PriorizacionEntry[]>([]);
  const [cargado, setCargado] = useState(false);
  const [mostrarTodas, setMostrarTodas] = useState(false);

  const recargar = useCallback(() => {
    cargarPriorizacion()
      .then((resultado) => {
        setEntradas(resultado);
        setCargado(true);
      })
      .catch(() => {
        setCargado(true);
      });
  }, [cargarPriorizacion]);

  useEffect(() => {
    recargar();
    // Sólo al montar — recargar es estable (useCallback sin deps externas).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const visibles = mostrarTodas ? entradas : entradas.slice(0, ENTRADAS_INICIALES);
  const hayMas = entradas.length > ENTRADAS_INICIALES;

  return (
    <div>
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <div>
          <h3 className="font-semibold text-foreground">Priorización de Scouting</h3>
          <p className="text-xs text-brand-brown/60">
            Ranking de lote/sublote × plaga — dónde revisar primero esta semana, y por qué.
            No prescribe tratamiento: sólo indica dónde mirar.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={recargar} disabled={loading} className="gap-1.5">
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          Actualizar
        </Button>
      </div>

      {loading && !cargado && (
        <div className="text-center py-12">
          <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-primary border-r-transparent mb-3" />
          <p className="text-brand-brown/70 text-sm">Calculando priorización...</p>
        </div>
      )}

      {!loading && error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-start gap-2">
          <AlertTriangle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm text-red-900 font-medium">No se pudo calcular la priorización</p>
            <p className="text-xs text-red-700 mt-0.5">{error}</p>
          </div>
        </div>
      )}

      {!loading && !error && cargado && entradas.length === 0 && (
        <div className="text-center py-12 text-brand-brown/50 text-sm">
          Sin suficiente historial de monitoreo (se necesitan al menos 2 rondas por
          sublote/plaga en los últimos ~6 meses) para calcular una priorización.
        </div>
      )}

      {!loading && !error && entradas.length > 0 && (
        <>
          <div className="space-y-2">
            {visibles.map((entry) => (
              <EntradaPriorizacion
                key={`${entry.sublote_id}|${entry.grupo_key ?? entry.pest_id}`}
                entry={entry}
              />
            ))}
          </div>

          {hayMas && (
            <div className="flex justify-center mt-3">
              <Button variant="ghost" size="sm" onClick={() => setMostrarTodas((v) => !v)} className="gap-1.5 text-xs">
                {mostrarTodas ? (
                  <>
                    <ChevronUp className="w-3.5 h-3.5" />
                    Ver menos
                  </>
                ) : (
                  <>
                    <ChevronDown className="w-3.5 h-3.5" />
                    Ver las {entradas.length - ENTRADAS_INICIALES} restantes
                  </>
                )}
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default PriorizacionScouting;
