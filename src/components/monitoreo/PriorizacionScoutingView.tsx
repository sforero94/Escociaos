// ARCHIVO: components/monitoreo/PriorizacionScoutingView.tsx
// DESCRIPCIÓN: Componente presentacional de "priorización de scouting" — versión
// de PRODUCCIÓN, ganadora del torneo de rediseño (Concepto B, ver
// src/components/monitoreo/tournament/ConceptB.tsx) con injertos de los otros
// 3 conceptos según el veredicto del panel de jueces. Puramente presentacional:
// no hace fetch, no conoce Supabase — recibe `entries` ya calculadas y
// ordenadas por `usePriorizacionMonitoreo()` / `priorizarMonitoreo`.
//
// Herencia del torneo:
// - Base: Concepto B — triage en 3 buckets colapsables (Crítico/Atención/En
//   orden), sólo Crítico abierto por defecto, filas de una línea con Popover
//   de detalle (no Tooltip — debe funcionar con toque en móvil).
// - De Concepto C: chip de texto "Sobre umbral"/"Acercándose" (no sólo color,
//   para daltonismo), filtro Tier + buscador en el bucket "En orden", diseño
//   de fila compacta (rank + ícono tier + chip estado + % + cambio).
// - De Concepto D: atribución de fuente inline ("Sobre umbral · Cartama",
//   "Gravedad Alta · histórico finca") en el popover de detalle y como sufijo
//   del subtítulo de cada bucket; rollup por lote (grilla de tarjetas 2x2
//   paginada, con punto de severidad + badge) como filtro rápido de "qué
//   lote reviso primero".
// - De Concepto A/C: indicador de temporada alta (llama) visible inline en
//   filas críticas.
//
// Regla dura (todo el archivo): Tier A y Tier B nunca comparten el mismo
// lenguaje visual. El ícono de tier (sólido = Tier A validado externamente,
// contorno = Tier B estadístico interno) es siempre neutro (blanco/negro) —
// la SEVERIDAD se comunica por separado, siempre en rojo/ámbar/neutro, NUNCA
// en verde (el verde de marca queda reservado para navegación/acentos, no
// para pills de severidad — ni siquiera para el estado "bueno").

import { useMemo, useState, type ReactNode } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  BarChart3,
  ChevronDown,
  CircleCheck,
  Flame,
  Info,
  Minus,
  Search,
  ShieldCheck,
  TrendingDown,
  TrendingUp,
} from 'lucide-react';

import type { PriorizacionEntry, Tendencia, TierPriorizacion } from '../../utils/priorizacionMonitoreo';
import { formatPercentage } from '../../utils/format';
import { Badge } from '../ui/badge';
import { Input } from '../ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '../ui/popover';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '../ui/collapsible';

// Colores directos (no vía clase Tailwind con modificador de opacidad, ej.
// `bg-amber-500/70` o `border-amber-400/40`): este proyecto sirve `index.css`
// como CSS ya compilado en vez de generarlo en cada build, así que cualquier
// combinación clase+opacidad que no se haya usado ya en otro componente
// puede no existir ahí todavía. Los valores fijos de abajo, y las variables
// CSS (`var(--destructive)`, etc.) usadas en estilos inline en todo el
// archivo, no dependen de ese compilado.
const AMBAR_500 = '#f59e0b';
const AMBAR_400 = '#fbbf24';
const AMBAR_700 = '#b45309';
const DESTRUCTIVE_TINT = 'rgba(220, 53, 69, 0.08)';
const AMBAR_TINT = 'rgba(245, 158, 11, 0.08)';

// ============================================================================
// Zonificación — deriva la zona directamente del `bracket` ya calculado por
// el motor de priorización (0-1 = Tier A over/approaching, 2 = Tier B Alta,
// 3-5 = resto). No se reordena ni se recalcula prioridad aquí.
// ============================================================================

type Zona = 'critico' | 'atencion' | 'orden';

function zonaDe(entry: PriorizacionEntry): Zona {
  if (entry.bracket <= 1) return 'critico';
  if (entry.bracket === 2) return 'atencion';
  return 'orden';
}

function entryKey(entry: PriorizacionEntry): string {
  return `${entry.sublote_id}|${entry.pest_id}|${entry.grupo_key ?? ''}`;
}

// ============================================================================
// Estado + atribución de fuente — la pieza central de los injertos 1, 2 y 4.
// Separa dos señales que antes vivían mezcladas en un solo badge de color:
//   1) el TIER (de dónde viene la autoridad del dato) → ícono sólido/contorno,
//      SIEMPRE neutro, nunca codificado por severidad.
//   2) el ESTADO (qué tan urgente es) → chip de TEXTO + color rojo/ámbar/
//      neutro, nunca verde, para que no dependa sólo del color (daltonismo).
// La atribución de fuente ("Cartama" / "histórico finca") se cuelga del
// estado, no del tier, porque es lo que explica de dónde sale ese estado.
// ============================================================================

interface InfoEstado {
  etiqueta: string;
  atribucion: string;
  claseChip: string;
  /** Color de borde/texto vía estilo inline — ver nota de AMBAR_500 más arriba:
   * las combinaciones borde+opacidad (`border-amber-500`, `border-muted-foreground/40`)
   * no están garantizadas en el CSS compilado. */
  estiloChip?: { borderColor?: string; color?: string };
}

function infoEstado(entry: PriorizacionEntry): InfoEstado {
  if (entry.tier === 'A') {
    const atribucion = entry.umbralSourceLabel ?? 'Cartama';
    if (entry.estadoUmbral === 'over') {
      return { etiqueta: 'Sobre umbral', atribucion, claseChip: 'bg-destructive text-white' };
    }
    if (entry.estadoUmbral === 'approaching') {
      return { etiqueta: 'Acercándose', atribucion, claseChip: 'bg-amber-500 text-white' };
    }
    return {
      etiqueta: 'Bajo umbral',
      atribucion,
      claseChip: 'border text-muted-foreground',
      estiloChip: { borderColor: 'var(--border)' },
    };
  }
  const gravedad = entry.gravedad?.texto ?? 'Baja';
  if (gravedad === 'Alta') {
    return {
      etiqueta: 'Gravedad Alta',
      atribucion: 'histórico finca',
      claseChip: 'border text-amber-700',
      estiloChip: { borderColor: AMBAR_500 },
    };
  }
  if (gravedad === 'Media') {
    return {
      etiqueta: 'Gravedad Media',
      atribucion: 'histórico finca',
      claseChip: 'border text-muted-foreground',
      estiloChip: { borderColor: 'rgba(156, 163, 175, 0.4)' },
    };
  }
  return {
    etiqueta: 'Gravedad Baja',
    atribucion: 'histórico finca',
    claseChip: 'border',
    estiloChip: { borderColor: 'rgba(156, 163, 175, 0.25)', color: 'rgba(156, 163, 175, 0.7)' },
  };
}

/** Ícono de tier — SIEMPRE neutro (relleno oscuro para A, contorno para B).
 * La severidad vive en el chip de estado, no aquí; así Tier A/B nunca se
 * confunde con "qué tan grave es", que es una pregunta distinta. */
function TierIcono({ tier }: { tier: TierPriorizacion }) {
  if (tier === 'A') {
    return (
      <span
        aria-label="Tier A — umbral económico validado externamente"
        title="Tier A — umbral económico validado externamente"
        className="inline-flex shrink-0 items-center justify-center rounded-sm bg-black p-0.5 text-white"
      >
        <ShieldCheck className="size-3.5" />
      </span>
    );
  }
  return (
    <span
      aria-label="Tier B — tercil estadístico histórico interno, sin umbral validado"
      title="Tier B — tercil estadístico histórico interno, sin umbral validado"
      className="inline-flex shrink-0 items-center justify-center rounded-sm border p-0.5 text-muted-foreground"
      style={{ borderColor: 'var(--muted-foreground)' }}
    >
      <BarChart3 className="size-3.5" />
    </span>
  );
}

function TrendBadge({ tendencia, numRondas }: { tendencia: Tendencia; numRondas: number }) {
  // Primera lectura de este (sublote, plaga): no hay ronda anterior con qué
  // comparar, así que no se muestra ninguna flecha (ni siquiera "estable").
  if (numRondas < 2) return null;
  if (tendencia === 'subiendo') {
    return (
      <span className="inline-flex items-center text-destructive">
        <TrendingUp className="size-3.5" />
      </span>
    );
  }
  if (tendencia === 'bajando') {
    return (
      <span className="inline-flex items-center text-primary">
        <TrendingDown className="size-3.5" />
      </span>
    );
  }
  return (
    <span className="inline-flex items-center text-muted-foreground">
      <Minus className="size-3.5" />
    </span>
  );
}

function DetailStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="truncate text-muted-foreground">{label}</dt>
      <dd className="truncate font-medium text-foreground" style={{ fontVariantNumeric: 'tabular-nums' }}>
        {value}
      </dd>
    </div>
  );
}

/** Insignia completa (tier + estado + atribución) — sólo en el popover de
 * detalle. Ej: "Sobre umbral · Cartama" / "Gravedad Alta · histórico finca". */
function InsigniaEstadoCompleta({ entry, estado }: { entry: PriorizacionEntry; estado: InfoEstado }) {
  if (entry.tier === 'A') {
    return (
      <Badge className={`gap-1 border-transparent ${estado.claseChip}`} style={estado.estiloChip}>
        <ShieldCheck className="size-3.5" />
        {estado.etiqueta} · {estado.atribucion}
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className={`gap-1 border-dashed ${estado.claseChip}`} style={estado.estiloChip}>
      <BarChart3 className="size-3.5" />
      {estado.etiqueta} · {estado.atribucion}
    </Badge>
  );
}

// ============================================================================
// Detalle completo de una entrada — vive dentro del Popover, no siempre
// visible, pero con todo lo que un agrónomo necesitaría (why, %, umbral,
// tendencia, días desde fumigación, rondas, temporada alta).
// ============================================================================

function EntryDetail({ entry }: { entry: PriorizacionEntry }) {
  const estado = infoEstado(entry);
  const ubicacion = [entry.lote_nombre ?? entry.lote_id, entry.sublote_nombre].filter(Boolean).join(' · ');

  return (
    <div className="flex flex-col gap-3 text-sm">
      <div>
        <div className="flex items-center gap-2">
          <TierIcono tier={entry.tier} />
          <span className="font-semibold text-foreground">{entry.pest_nombre}</span>
        </div>
        <div className="mt-0.5 text-xs text-muted-foreground">{ubicacion}</div>
        <div style={{ marginTop: '0.375rem' }}>
          <InsigniaEstadoCompleta entry={entry} estado={estado} />
        </div>
      </div>

      <p className="text-foreground" style={{ lineHeight: '1.375' }}>{entry.why}</p>

      <dl className="grid grid-cols-2 gap-3 text-xs">
        <DetailStat label="Incidencia actual" value={formatPercentage(entry.incidenciaActual)} />
        <DetailStat
          label="Ronda anterior"
          value={entry.numRondas < 2 ? 'Sin ronda previa' : formatPercentage(entry.incidenciaAnterior)}
        />
        {entry.tier === 'A' && entry.umbralPct !== undefined ? (
          <DetailStat label={`Umbral (${estado.atribucion})`} value={formatPercentage(entry.umbralPct)} />
        ) : null}
        {entry.tier === 'B' && entry.gravedad ? (
          <DetailStat label="Gravedad histórica" value={entry.gravedad.texto} />
        ) : null}
        <DetailStat
          label="Cambio vs. ronda anterior"
          value={entry.numRondas < 2 ? '—' : entry.cambioFormateado}
        />
        <DetailStat
          label="Última fumigación del lote"
          value={entry.diasDesdeUltimaFumigacion === null ? 'Sin dato' : `hace ${entry.diasDesdeUltimaFumigacion} días`}
        />
        <DetailStat label="Rondas de respaldo" value={`${entry.numRondas}`} />
      </dl>

      {entry.temporadaAlta ? (
        <div className="flex items-center gap-1.5 rounded-md bg-amber-50 px-2 py-1 text-xs text-amber-700">
          <Flame className="size-3.5 shrink-0" />
          Semana {entry.weekOfYear}: temporada históricamente alta para esta plaga.
        </div>
      ) : null}
    </div>
  );
}

// ============================================================================
// Jerarquía Plaga → Lote → Sublote — agrupa las entradas de una zona/bucket
// para responder "qué plaga reviso primero, en qué lote, en qué sublote" sin
// escanear una lista plana. Los sublotes de un mismo lote quedan colapsados
// detrás de un toggle (excepto cuando el lote tiene un único sublote: ahí no
// hay nada que ocultar, se aplana en una sola fila). El orden de agrupación
// respeta el `rank` global ya calculado por el motor de priorización — no
// inventa una prioridad nueva, sólo reorganiza la presentación.
// ============================================================================

interface LoteGrupoJerarquia {
  lote_id: string;
  lote_nombre: string;
  entries: PriorizacionEntry[]; // ordenadas por rank ascendente (más urgente primero)
  minRank: number;
}

interface PlagaGrupoJerarquia {
  key: string;
  pest_nombre: string;
  tier: TierPriorizacion;
  temporadaAlta: boolean; // true si CUALQUIER entrada del grupo está en temporada alta
  minRank: number;
  totalEntries: number;
  lotes: LoteGrupoJerarquia[]; // ordenados por minRank ascendente
}

function agruparPorPlagaLoteSublote(
  entries: PriorizacionEntry[],
  rankPorClave: Map<string, number>
): PlagaGrupoJerarquia[] {
  const rankDe = (entry: PriorizacionEntry) => rankPorClave.get(entryKey(entry)) ?? Number.MAX_SAFE_INTEGER;

  const plagas = new Map<
    string,
    { pest_nombre: string; tier: TierPriorizacion; temporadaAlta: boolean; lotes: Map<string, LoteGrupoJerarquia> }
  >();

  for (const entry of entries) {
    // Igual criterio que agruparPorLote/badges: grupo_key pooled (ej. acaro_complex)
    // identifica la plaga, no el pest_id individual que aportó el valor máximo.
    const plagaKey = entry.grupo_key ?? entry.pest_id;
    let plaga = plagas.get(plagaKey);
    if (!plaga) {
      plaga = { pest_nombre: entry.pest_nombre, tier: entry.tier, temporadaAlta: false, lotes: new Map() };
      plagas.set(plagaKey, plaga);
    }
    if (entry.temporadaAlta) plaga.temporadaAlta = true;

    let lote = plaga.lotes.get(entry.lote_id);
    if (!lote) {
      lote = { lote_id: entry.lote_id, lote_nombre: entry.lote_nombre ?? entry.lote_id, entries: [], minRank: rankDe(entry) };
      plaga.lotes.set(entry.lote_id, lote);
    }
    lote.entries.push(entry);
    lote.minRank = Math.min(lote.minRank, rankDe(entry));
  }

  const resultado: PlagaGrupoJerarquia[] = [];
  for (const [key, plaga] of plagas) {
    const lotes = Array.from(plaga.lotes.values())
      .map((lote) => ({ ...lote, entries: [...lote.entries].sort((a, b) => rankDe(a) - rankDe(b)) }))
      .sort((a, b) => a.minRank - b.minRank);
    const minRank = lotes.length > 0 ? lotes[0].minRank : Number.MAX_SAFE_INTEGER;
    const totalEntries = lotes.reduce((suma, lote) => suma + lote.entries.length, 0);
    resultado.push({ key, pest_nombre: plaga.pest_nombre, tier: plaga.tier, temporadaAlta: plaga.temporadaAlta, minRank, totalEntries, lotes });
  }

  return resultado.sort((a, b) => a.minRank - b.minRank);
}

/** Línea de detalle bajo el nombre principal de una fila: comparación contra
 * umbral (Tier A) o gravedad histórica (Tier B) — siempre visible, ya no sólo
 * en filas "críticas", porque agrupar por plaga/lote deja espacio de sobra. */
function fragmentosDetalle(entry: PriorizacionEntry): string[] {
  const frags: string[] = [];
  if (entry.tier === 'A' && entry.umbralPct !== undefined && entry.estadoUmbral) {
    const simbolo = entry.estadoUmbral === 'over' ? '≥' : entry.estadoUmbral === 'approaching' ? '≈' : '<';
    frags.push(`${formatPercentage(entry.incidenciaActual, 0)} ${simbolo} umbral ${formatPercentage(entry.umbralPct, 0)}`);
  } else if (entry.gravedad) {
    frags.push(`Gravedad ${entry.gravedad.texto}`);
  }
  return frags;
}

/** Fila hoja — un (sublote, plaga) individual. Reusada tanto para un lote de
 * un único sublote (aplanado, `mainLabel` = nombre de lote) como para cada
 * sublote revelado dentro de un lote expandible (`mainLabel` = nombre de
 * sublote, `indentado`). El chip de estado sólo se muestra cuando el estado
 * NO está ya anunciado por el encabezado de la zona/subsección (ej. "En
 * orden" mezcla "Bajo umbral" y "Gravedad Media/Baja" en un mismo grupo). */
function FilaFoco({
  entry,
  rank,
  mainLabel,
  subLabel,
  mostrarEstado,
  indentado,
}: {
  entry: PriorizacionEntry;
  rank: number;
  mainLabel: string;
  subLabel?: string;
  mostrarEstado: boolean;
  indentado: boolean;
}) {
  const estado = infoEstado(entry);
  const detalle = [subLabel, ...fragmentosDetalle(entry)].filter(Boolean).join(' · ');

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="flex w-full items-center gap-2 text-left transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          style={{
            padding: indentado ? '0.4rem 0.75rem 0.4rem 1.75rem' : '0.55rem 0.75rem',
            borderTop: '1px solid var(--border)',
          }}
        >
          <span
            className="shrink-0 text-right text-muted-foreground"
            style={{ width: '0.875rem', fontSize: '9px', fontVariantNumeric: 'tabular-nums' }}
          >
            {rank}
          </span>
          <span className="min-w-0 flex-1">
            <span className="flex flex-wrap items-center gap-1.5">
              {mostrarEstado ? (
                <span
                  className={`inline-flex shrink-0 items-center rounded-md py-0.5 font-semibold leading-none ${estado.claseChip}`}
                  style={{ fontSize: '9px', paddingLeft: '0.3rem', paddingRight: '0.3rem', ...estado.estiloChip }}
                >
                  {estado.etiqueta}
                </span>
              ) : null}
              <span className={`truncate font-medium text-foreground ${indentado ? 'text-xs' : 'text-sm'}`}>{mainLabel}</span>
            </span>
            <span
              className="mt-0.5 flex flex-wrap items-center text-muted-foreground"
              style={{ fontSize: '10.5px', columnGap: '0.375rem', rowGap: '0.125rem' }}
            >
              {detalle ? <span className="truncate">{detalle}</span> : null}
              {entry.temporadaAlta ? (
                <span className="inline-flex shrink-0 items-center text-orange-600" style={{ gap: '0.125rem' }}>
                  {detalle ? '· ' : ''}
                  <Flame className="size-3" /> temporada alta
                </span>
              ) : null}
            </span>
          </span>
          <span className="flex shrink-0 flex-col items-end gap-0.5">
            <span className="text-sm font-semibold tabular-nums text-foreground">
              {formatPercentage(entry.incidenciaActual, 0)}
            </span>
            <TrendBadge tendencia={entry.tendencia} numRondas={entry.numRondas} />
          </span>
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" style={{ width: '20rem', maxWidth: 'calc(100vw - 2rem)' }}>
        <EntryDetail entry={entry} />
      </PopoverContent>
    </Popover>
  );
}

/** Fila de lote con más de un sublote — resumen colapsado (peor % + tendencia
 * del sublote más urgente) con un toggle que revela cada `FilaFoco` de
 * sublote. Colapsada por defecto: el punto de este nivel es esconder detalle
 * que no siempre hace falta, no forzarlo a la vista. */
function FilaLoteExpandible({
  lote,
  rankPorClave,
  mostrarEstado,
}: {
  lote: LoteGrupoJerarquia;
  rankPorClave: Map<string, number>;
  mostrarEstado: boolean;
}) {
  const [open, setOpen] = useState(false);
  const peor = lote.entries[0]; // ya ordenado por rank asc — el primero es el más urgente

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger asChild>
        <button
          type="button"
          aria-label={`${lote.lote_nombre}, ${lote.entries.length} sublotes, ${open ? 'ocultar' : 'mostrar'} detalle`}
          className="flex w-full items-center gap-2 text-left transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          style={{ padding: '0.5rem 0.75rem 0.5rem 1.75rem', borderTop: '1px solid var(--border)' }}
        >
          <ChevronDown
            className="size-3 shrink-0 text-muted-foreground transition-transform"
            style={{ transform: open ? undefined : 'rotate(-90deg)' }}
          />
          <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">{lote.lote_nombre}</span>
          <span className="shrink-0 text-muted-foreground" style={{ fontSize: '10.5px' }}>
            {lote.entries.length} sublotes
          </span>
          <span className="flex shrink-0 flex-col items-end" style={{ gap: '0.125rem' }}>
            <span className="text-sm font-semibold text-foreground" style={{ fontVariantNumeric: 'tabular-nums' }}>
              {formatPercentage(peor.incidenciaActual, 0)}
            </span>
            <TrendBadge tendencia={peor.tendencia} numRondas={peor.numRondas} />
          </span>
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent>
        {lote.entries.map((entry) => (
          <FilaFoco
            key={entryKey(entry)}
            entry={entry}
            rank={rankPorClave.get(entryKey(entry)) ?? 0}
            mainLabel={entry.sublote_nombre ?? entry.sublote_id}
            mostrarEstado={mostrarEstado}
            indentado
          />
        ))}
      </CollapsibleContent>
    </Collapsible>
  );
}

/** Tarjeta de plaga — encabezado (tier + nombre + temporada alta + conteo de
 * focos) y, debajo, un lote por fila: aplanada si tiene un único sublote,
 * expandible si tiene varios. */
function TarjetaPlaga({
  grupo,
  rankPorClave,
  mostrarEstado,
}: {
  grupo: PlagaGrupoJerarquia;
  rankPorClave: Map<string, number>;
  mostrarEstado: boolean;
}) {
  return (
    <div className="overflow-hidden rounded-lg border" style={{ borderColor: 'var(--border)' }}>
      <div className="flex items-center gap-2" style={{ padding: '0.625rem 0.875rem' }}>
        <TierIcono tier={grupo.tier} />
        <span className="min-w-0 flex-1 truncate text-sm font-semibold text-foreground">{grupo.pest_nombre}</span>
        {grupo.temporadaAlta ? (
          <Flame className="size-3.5 shrink-0 text-orange-600" aria-label="Temporada alta" />
        ) : null}
        <span
          className="shrink-0 rounded-full font-semibold leading-none"
          style={{ fontSize: '10px', padding: '2px 8px', color: 'var(--destructive)', backgroundColor: DESTRUCTIVE_TINT }}
        >
          {grupo.totalEntries} {grupo.totalEntries === 1 ? 'foco' : 'focos'}
        </span>
      </div>
      <div className="flex flex-col">
        {grupo.lotes.map((lote) =>
          lote.entries.length === 1 ? (
            <FilaFoco
              key={lote.lote_id}
              entry={lote.entries[0]}
              rank={rankPorClave.get(entryKey(lote.entries[0])) ?? 0}
              mainLabel={lote.lote_nombre}
              subLabel={lote.entries[0].sublote_nombre}
              mostrarEstado={mostrarEstado}
              indentado={false}
            />
          ) : (
            <FilaLoteExpandible key={lote.lote_id} lote={lote} rankPorClave={rankPorClave} mostrarEstado={mostrarEstado} />
          )
        )}
      </div>
    </div>
  );
}

/** Punto de entrada de la jerarquía — agrupa y renderiza. Recibe ya filtradas
 * las entradas de una zona/subsección (ej. sólo "sobre umbral", o sólo "En
 * orden" tras el filtro de tier/búsqueda). */
function HierarquiaEntradas({
  entries,
  rankPorClave,
  mostrarEstado,
}: {
  entries: PriorizacionEntry[];
  rankPorClave: Map<string, number>;
  mostrarEstado: boolean;
}) {
  const grupos = useMemo(() => agruparPorPlagaLoteSublote(entries, rankPorClave), [entries, rankPorClave]);
  return (
    <div className="flex flex-col gap-2">
      {grupos.map((grupo) => (
        <TarjetaPlaga key={grupo.key} grupo={grupo} rankPorClave={rankPorClave} mostrarEstado={mostrarEstado} />
      ))}
    </div>
  );
}

// ============================================================================
// Rollup por lote — grilla de tarjetas 2x2 (paginada con puntos si hay más de
// 4 lotes). Cada tarjeta resume un lote de un vistazo: punto de severidad +
// badge de conteo. Responde "¿qué lote visito primero?" sin tener que sumar
// fila por fila. Un toque activa/desactiva el filtro de ese lote para las 3
// zonas; la tarjeta activa queda resaltada (no hay chip de filtro aparte).
// ============================================================================

interface GrupoLote {
  lote_id: string;
  lote_nombre: string;
  entries: PriorizacionEntry[];
  minBracket: number;
  sobreUmbral: number;
  acercandose: number;
  gravedadAlta: number;
}

function agruparPorLote(entries: PriorizacionEntry[]): GrupoLote[] {
  const mapa = new Map<string, GrupoLote>();
  for (const entry of entries) {
    let grupo = mapa.get(entry.lote_id);
    if (!grupo) {
      grupo = {
        lote_id: entry.lote_id,
        lote_nombre: entry.lote_nombre ?? entry.lote_id,
        entries: [],
        minBracket: entry.bracket,
        sobreUmbral: 0,
        acercandose: 0,
        gravedadAlta: 0,
      };
      mapa.set(entry.lote_id, grupo);
    }
    grupo.entries.push(entry);
    grupo.minBracket = Math.min(grupo.minBracket, entry.bracket);
    if (entry.tier === 'A' && entry.estadoUmbral === 'over') grupo.sobreUmbral += 1;
    if (entry.tier === 'A' && entry.estadoUmbral === 'approaching') grupo.acercandose += 1;
    if (entry.tier === 'B' && entry.gravedad?.texto === 'Alta') grupo.gravedadAlta += 1;
  }
  // Igual que en la lista global, los grupos se ordenan por el bracket mínimo
  // que contienen — preserva la urgencia ya calculada, no inventa una nueva.
  return Array.from(mapa.values()).sort((a, b) => a.minBracket - b.minBracket);
}

interface BadgeConteo {
  texto: string;
  clase: string;
  /** Color de borde vía variable CSS/valor directo — no vía clase Tailwind,
   * para no depender de combinaciones borde+color que puedan faltar en el
   * CSS compilado (ver nota en LoteCard más abajo). */
  estiloBorde?: string;
}

function badgeConteoDe(grupo: GrupoLote): BadgeConteo {
  if (grupo.sobreUmbral > 0) return { texto: `${grupo.sobreUmbral} sobre umbral`, clase: 'bg-destructive text-white' };
  if (grupo.acercandose > 0) return { texto: `${grupo.acercandose} acercándose`, clase: 'bg-amber-500 text-white' };
  if (grupo.gravedadAlta > 0) {
    return {
      texto: `${grupo.gravedadAlta} grav. alta`,
      clase: 'border text-amber-700',
      estiloBorde: AMBAR_500,
    };
  }
  return { texto: 'sin alertas', clase: 'border text-muted-foreground', estiloBorde: 'var(--border)' };
}

/** Punto de severidad agregado del lote — mismo criterio rojo/ámbar/neutro que
 * el resto del dashboard (nunca verde, ni para "sin alertas"). Color vía
 * estilo inline (no clases Tailwind con modificador de opacidad tipo
 * `bg-amber-500/70`): este proyecto sirve `index.css` como CSS ya compilado
 * en vez de generarlo en cada build (ver comentario de cabecera del
 * archivo), así que cualquier combinación clase+opacidad que no se haya
 * usado ya en otro componente puede no existir ahí todavía. Las variables
 * CSS (`var(--destructive)`, etc.) siempre están disponibles sin depender de
 * ese compilado. */
function puntoEstiloGrupo(grupo: GrupoLote): { backgroundColor: string; opacity?: number } {
  if (grupo.sobreUmbral > 0) return { backgroundColor: 'var(--destructive)' };
  if (grupo.acercandose > 0) return { backgroundColor: AMBAR_500 };
  if (grupo.gravedadAlta > 0) return { backgroundColor: AMBAR_500, opacity: 0.7 };
  return { backgroundColor: 'var(--muted-foreground)', opacity: 0.3 };
}

function LoteCard({
  grupo,
  seleccionado,
  onToggle,
}: {
  grupo: GrupoLote;
  seleccionado: boolean;
  onToggle: () => void;
}) {
  const badge = badgeConteoDe(grupo);

  return (
    <button
      type="button"
      aria-pressed={seleccionado}
      onClick={onToggle}
      className={`flex flex-col items-start gap-1.5 rounded-lg border text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
        seleccionado ? 'bg-muted' : 'bg-card hover:bg-muted/60'
      }`}
      style={{ padding: '0.625rem', borderColor: seleccionado ? 'var(--foreground)' : 'var(--border)' }}
    >
      <span className="flex w-full items-center gap-1.5">
        <span
          className="inline-block shrink-0 rounded-full"
          style={{ width: '0.625rem', height: '0.625rem', ...puntoEstiloGrupo(grupo) }}
          aria-hidden="true"
        />
        <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">{grupo.lote_nombre}</span>
      </span>
      <span
        className={`inline-flex items-center rounded-full py-0.5 font-semibold leading-none ${badge.clase}`}
        style={{
          fontSize: '10px',
          paddingLeft: '0.375rem',
          paddingRight: '0.375rem',
          borderColor: badge.estiloBorde,
        }}
      >
        {badge.texto}
      </span>
    </button>
  );
}

const LOTES_POR_PAGINA = 4; // grilla 2x2

function LotesGrid({
  entries,
  activo,
  onToggle,
}: {
  entries: PriorizacionEntry[];
  activo: string | null;
  onToggle: (loteId: string) => void;
}) {
  const grupos = useMemo(() => agruparPorLote(entries), [entries]);
  const [pagina, setPagina] = useState(0);

  const totalPaginas = Math.max(1, Math.ceil(grupos.length / LOTES_POR_PAGINA));
  const paginaSegura = Math.min(pagina, totalPaginas - 1);
  const grupoVisible = useMemo(
    () => grupos.slice(paginaSegura * LOTES_POR_PAGINA, paginaSegura * LOTES_POR_PAGINA + LOTES_POR_PAGINA),
    [grupos, paginaSegura]
  );

  if (grupos.length <= 1) return null; // con un solo lote, filtrar no aporta nada

  return (
    <div className="flex flex-col gap-2">
      <div className="grid grid-cols-2 gap-2">
        {grupoVisible.map((grupo) => (
          <LoteCard
            key={grupo.lote_id}
            grupo={grupo}
            seleccionado={activo === grupo.lote_id}
            onToggle={() => onToggle(grupo.lote_id)}
          />
        ))}
      </div>
      {totalPaginas > 1 ? (
        <div className="flex items-center justify-center gap-1" role="tablist" aria-label="Páginas de lotes">
          {Array.from({ length: totalPaginas }, (_, i) => i).map((i) => (
            <button
              key={i}
              type="button"
              role="tab"
              aria-selected={i === paginaSegura}
              aria-label={`Página ${i + 1} de ${totalPaginas}`}
              onClick={() => setPagina(i)}
              className="flex items-center justify-center rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              style={{ width: '1.75rem', height: '1.75rem' }}
            >
              <span
                className="rounded-full transition-colors"
                style={{
                  width: i === paginaSegura ? '1.125rem' : '0.5rem',
                  height: '0.5rem',
                  backgroundColor: i === paginaSegura ? 'var(--foreground)' : 'var(--muted-foreground)',
                  opacity: i === paginaSegura ? 1 : 0.5,
                }}
              />
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

// ============================================================================
// Sección de zona — Collapsible con header rotulado (icono + nombre + conteo
// + descripción con atribución de fuente) y cuerpo delegado a `children`
// (render prop) para que Crítico pueda partirse en sub-secciones "Sobre
// umbral" / "Acercándose" sin duplicar el resto de la lógica de la sección.
// ============================================================================

type Tono = 'critico' | 'atencion' | 'calma';

/** Colores por tono — vía variable CSS/valor directo (no clases Tailwind con
 * modificador de opacidad, ver nota de AMBAR_500 al inicio del archivo). Sólo
 * `icono`/`contador` quedan como clases porque son colores sólidos ya
 * confirmados en el CSS compilado (bg-destructive, bg-amber-500, bg-muted). */
interface EstiloTono {
  bordeColor: string;
  headerBg: string;
  headerColor: string;
  icono: string;
  contador: string;
}

const TONO_ESTILOS: Record<Tono, EstiloTono> = {
  critico: {
    bordeColor: 'var(--destructive)',
    headerBg: DESTRUCTIVE_TINT,
    headerColor: 'var(--destructive)',
    icono: 'bg-destructive text-white',
    contador: 'bg-destructive text-white',
  },
  atencion: {
    bordeColor: AMBAR_400,
    headerBg: AMBAR_TINT,
    headerColor: AMBAR_700,
    icono: 'bg-amber-500 text-white',
    contador: 'bg-amber-500 text-white',
  },
  calma: {
    bordeColor: 'var(--border)',
    headerBg: 'var(--muted)',
    headerColor: 'var(--foreground)',
    icono: 'bg-muted text-muted-foreground',
    contador: 'bg-muted text-muted-foreground',
  },
};

type FiltroTier = 'todos' | 'A' | 'B';

const OPCIONES_FILTRO_TIER: { valor: FiltroTier; etiqueta: string; ariaLabel: string }[] = [
  { valor: 'todos', etiqueta: 'Todos', ariaLabel: 'Mostrar todos los tiers' },
  { valor: 'A', etiqueta: 'Tier A', ariaLabel: 'Filtrar Tier A' },
  { valor: 'B', etiqueta: 'Tier B', ariaLabel: 'Filtrar Tier B' },
];

/** Segmentado Todos/Tier A/Tier B — reemplaza `ToggleGroup` de `ui/toggle-group.tsx`
 * en este único uso: ese componente compartido depende de varias clases
 * (`bg-transparent`, `bg-accent`, `px-1.5`, `rounded-l-md`/`rounded-r-md`) que
 * faltan en el CSS compilado, así que sus 3 opciones se renderizaban sin
 * padding ni separación (texto corrido). Editar `ui/toggle-group.tsx`
 * arreglaría esto en todos sus usos en la app pero excede el alcance de este
 * componente; en vez de eso, este control autocontenido no depende de esas
 * clases en absoluto. */
function FiltroTierSegmentado({ valor, onCambio }: { valor: FiltroTier; onCambio: (v: FiltroTier) => void }) {
  return (
    <div
      className="inline-flex shrink-0 overflow-hidden rounded-md border"
      style={{ borderColor: 'var(--border)' }}
      role="group"
      aria-label="Filtrar por tier"
    >
      {OPCIONES_FILTRO_TIER.map((opcion, i) => {
        const activo = valor === opcion.valor;
        return (
          <button
            key={opcion.valor}
            type="button"
            aria-pressed={activo}
            aria-label={opcion.ariaLabel}
            onClick={() => onCambio(opcion.valor)}
            className="text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            style={{
              padding: '0.25rem 0.5rem',
              borderLeft: i > 0 ? '1px solid var(--border)' : undefined,
              backgroundColor: activo ? 'var(--muted)' : 'transparent',
              color: activo ? 'var(--foreground)' : 'var(--muted-foreground)',
            }}
          >
            {opcion.etiqueta}
          </button>
        );
      })}
    </div>
  );
}

interface ZoneSectionProps {
  titulo: string;
  descripcion: string;
  icono: ReactNode;
  entries: PriorizacionEntry[];
  tono: Tono;
  defaultOpen: boolean;
  vacioTexto: string;
  /** Sólo el bucket "En orden" lo activa: filtro Tier A/B + buscador. */
  conFiltro?: boolean;
  children: (entriesFiltradas: PriorizacionEntry[]) => ReactNode;
}

function ZoneSection({ titulo, descripcion, icono, entries, tono, defaultOpen, vacioTexto, conFiltro, children }: ZoneSectionProps) {
  const [open, setOpen] = useState(defaultOpen);
  const [filtroTier, setFiltroTier] = useState<FiltroTier>('todos');
  const [busqueda, setBusqueda] = useState('');
  const estilos = TONO_ESTILOS[tono];

  const entriesFiltradas = useMemo(() => {
    if (!conFiltro) return entries;
    const q = busqueda.trim().toLowerCase();
    return entries.filter((entry) => {
      if (filtroTier !== 'todos' && entry.tier !== filtroTier) return false;
      if (!q) return true;
      const haystack = `${entry.pest_nombre} ${entry.lote_nombre ?? ''} ${entry.sublote_nombre ?? ''}`.toLowerCase();
      return haystack.includes(q);
    });
  }, [entries, conFiltro, filtroTier, busqueda]);

  const hint =
    !open && entries.length > 0
      ? ` — ${entries.length} combinaci${entries.length === 1 ? 'ón' : 'ones'}, toca para ver detalle`
      : '';

  return (
    <Collapsible
      open={open}
      onOpenChange={setOpen}
      className="overflow-hidden rounded-lg border"
      style={{ borderColor: estilos.bordeColor }}
    >
      <CollapsibleTrigger asChild>
        <button
          type="button"
          className="flex w-full items-start gap-3 text-left"
          style={{ padding: '0.625rem 0.75rem', backgroundColor: estilos.headerBg, color: estilos.headerColor }}
        >
          <span
            className={`mt-0.5 flex shrink-0 items-center justify-center rounded-full ${estilos.icono}`}
            style={{ width: '1.75rem', height: '1.75rem' }}
          >
            {icono}
          </span>
          <span className="min-w-0 flex-1">
            <span className="flex items-center gap-2">
              <span className="font-semibold">{titulo}</span>
              <span
                className={`inline-flex items-center justify-center rounded-full py-0.5 text-xs font-semibold leading-none ${estilos.contador}`}
                style={{ minWidth: '1.25rem', paddingLeft: '0.375rem', paddingRight: '0.375rem' }}
              >
                {entries.length}
              </span>
            </span>
            <span className="mt-0.5 block text-xs font-normal">
              {descripcion}
              {hint}
            </span>
          </span>
          <ChevronDown
            className="mt-1 size-4 shrink-0 transition-transform"
            style={{ transform: open ? 'rotate(180deg)' : undefined }}
          />
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="flex flex-col gap-1.5 bg-card p-2">
          {conFiltro && entries.length > 0 ? (
            <div className="flex flex-wrap items-center gap-2" style={{ paddingBottom: '0.25rem' }}>
              <div className="relative flex-1" style={{ minWidth: '10rem' }}>
                <Search
                  className="pointer-events-none absolute top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground"
                  style={{ left: '0.5rem' }}
                />
                <Input
                  value={busqueda}
                  onChange={(ev) => setBusqueda(ev.target.value)}
                  placeholder="Buscar lote o plaga..."
                  className="h-8 w-full text-xs"
                  style={{ paddingLeft: '1.75rem' }}
                />
              </div>
              <FiltroTierSegmentado valor={filtroTier} onCambio={setFiltroTier} />
            </div>
          ) : null}

          {entries.length === 0 ? (
            <p className="py-2 text-xs text-muted-foreground" style={{ paddingLeft: '0.25rem', paddingRight: '0.25rem' }}>
              {vacioTexto}
            </p>
          ) : entriesFiltradas.length === 0 ? (
            <p className="py-2 text-xs text-muted-foreground" style={{ paddingLeft: '0.25rem', paddingRight: '0.25rem' }}>
              Ninguna combinación coincide con el filtro/búsqueda actual.
            </p>
          ) : (
            <>
              {conFiltro && entriesFiltradas.length !== entries.length ? (
                <p className="text-muted-foreground" style={{ paddingLeft: '0.25rem', paddingRight: '0.25rem', fontSize: '11px' }}>
                  Mostrando {entriesFiltradas.length} de {entries.length}.
                </p>
              ) : null}
              {children(entriesFiltradas)}
            </>
          )}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

// ============================================================================
// Popover de ayuda general — explica Tier A/B y cómo usar el dashboard, para
// alguien que nunca lo vio. Popover en vez de Tooltip para que funcione con
// un toque en móvil, no sólo con hover.
// ============================================================================

function InfoGeneral() {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label="¿Qué es esto y cómo se usa?"
          className="flex shrink-0 items-center justify-center rounded-full border text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          style={{ width: '2rem', height: '2rem', borderColor: 'var(--border)' }}
        >
          <Info className="size-4" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="text-sm" style={{ width: '20rem', maxWidth: 'calc(100vw - 2rem)' }}>
        <div className="flex flex-col" style={{ gap: '0.625rem' }}>
          <p className="font-semibold text-foreground">¿Qué es esta lista?</p>
          <p className="text-muted-foreground">
            Prioriza qué lote/sublote revisar primero esta semana. No indica qué tratamiento aplicar —
            sólo dónde mirar antes.
          </p>
          <div className="flex items-start gap-2">
            <TierIcono tier="A" />
            <p className="text-muted-foreground">
              <span className="font-medium text-foreground">Ícono sólido (Tier A): </span>
              comparado contra un umbral económico validado por un líder de la industria (ej. Cartama).
              Evidencia fuerte. El color del chip de estado (rojo = sobre umbral, ámbar = acercándose) es
              independiente de este ícono.
            </p>
          </div>
          <div className="flex items-start gap-2">
            <TierIcono tier="B" />
            <p className="text-muted-foreground">
              <span className="font-medium text-foreground">Ícono de contorno (Tier B): </span>
              sin umbral validado para esa plaga; se usa un tercil histórico propio de esta finca.
              Evidencia más débil, nunca se muestra con la misma fuerza que Tier A.
            </p>
          </div>
          <p className="text-xs text-muted-foreground">
            Toca la tarjeta de un lote para enfocar la lista en ese lote (tócala de nuevo para quitar el
            filtro), y toca cualquier fila para ver el detalle completo (% real, umbral, tendencia, días
            desde la última fumigación).
          </p>
        </div>
      </PopoverContent>
    </Popover>
  );
}

// ============================================================================
// Componente principal
// ============================================================================

export interface PriorizacionScoutingViewProps {
  entries: PriorizacionEntry[];
  loading: boolean;
  error: string | null;
}

export function PriorizacionScoutingView({ entries, loading, error }: PriorizacionScoutingViewProps) {
  const [loteActivo, setLoteActivo] = useState<string | null>(null);

  const rankPorClave = useMemo(() => {
    const mapa = new Map<string, number>();
    entries.forEach((entry, i) => mapa.set(entryKey(entry), i + 1));
    return mapa;
  }, [entries]);

  const entriesVisibles = useMemo(
    () => (loteActivo ? entries.filter((entry) => entry.lote_id === loteActivo) : entries),
    [entries, loteActivo]
  );

  const { critico, atencion, orden } = useMemo(() => {
    const critico: PriorizacionEntry[] = [];
    const atencion: PriorizacionEntry[] = [];
    const orden: PriorizacionEntry[] = [];
    for (const entry of entriesVisibles) {
      const zona = zonaDe(entry);
      if (zona === 'critico') critico.push(entry);
      else if (zona === 'atencion') atencion.push(entry);
      else orden.push(entry);
    }
    return { critico, atencion, orden };
  }, [entriesVisibles]);

  const criticoTotal = useMemo(() => entries.filter((entry) => zonaDe(entry) === 'critico').length, [entries]);

  const fuentesCritico = useMemo(() => {
    const set = new Set<string>();
    for (const entry of entries) {
      if (zonaDe(entry) === 'critico' && entry.umbralSourceLabel) set.add(entry.umbralSourceLabel);
    }
    return Array.from(set);
  }, [entries]);

  const resumen =
    criticoTotal > 0
      ? `${criticoTotal} foco${criticoTotal === 1 ? '' : 's'} crítico${criticoTotal === 1 ? '' : 's'} de ${entries.length} combinaciones monitoreadas — empieza por ahí.`
      : `Ningún foco crítico esta semana, de ${entries.length} combinaciones monitoreadas.`;

  const descripcionCritico = `Sobre o acercándose al umbral económico validado · ${fuentesCritico.length > 0 ? fuentesCritico.join(' / ') : 'Cartama'}.`;

  const handleToggleLote = (loteId: string) => {
    setLoteActivo((actual) => (actual === loteId ? null : loteId));
  };

  if (loading) {
    return (
      <div className="py-12 text-center">
        <div
          className="mx-auto mb-3 h-8 w-8 animate-spin rounded-full border-4 border-solid border-r-transparent"
          style={{ borderColor: 'var(--primary)', borderRightColor: 'transparent' }}
        />
        <p className="text-sm text-muted-foreground">Calculando priorización...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-4">
        <AlertTriangle className="mt-0.5 size-4 shrink-0 text-red-600" />
        <div>
          <p className="text-sm font-medium text-red-900">No se pudo calcular la priorización</p>
          <p className="mt-0.5 text-xs text-red-700">{error}</p>
        </div>
      </div>
    );
  }

  if (entries.length === 0) {
    return (
      <div className="py-12 text-center text-sm text-muted-foreground">
        Ninguna combinación sublote/plaga tiene todavía una lectura de la ronda más reciente (o no hay
        suficiente historial de monitoreo en los últimos ~6 meses) para calcular una priorización.
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-3 p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-base font-semibold text-foreground">Priorización de monitoreo</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">{resumen}</p>
        </div>
        <InfoGeneral />
      </div>

      <LotesGrid entries={entries} activo={loteActivo} onToggle={handleToggleLote} />

      <div className="flex flex-col gap-3">
        <ZoneSection
          titulo="Crítico"
          descripcion={descripcionCritico}
          icono={<AlertTriangle className="size-4" />}
          entries={critico}
          tono="critico"
          defaultOpen
          vacioTexto="Ningún foco superó ni se acerca al umbral económico esta semana."
        >
          {(filtradas) => {
            const sobre = filtradas.filter((entry) => entry.estadoUmbral === 'over');
            const acercandose = filtradas.filter((entry) => entry.estadoUmbral === 'approaching');
            return (
              <>
                {sobre.length > 0 ? (
                  <div className="flex flex-col gap-1.5">
                    <p
                      className="font-semibold uppercase tracking-wide text-destructive"
                      style={{ paddingLeft: '0.25rem', paddingRight: '0.25rem', fontSize: '11px' }}
                    >
                      Sobre umbral ({sobre.length})
                    </p>
                    <HierarquiaEntradas entries={sobre} rankPorClave={rankPorClave} mostrarEstado={false} />
                  </div>
                ) : null}
                {acercandose.length > 0 ? (
                  <div className="flex flex-col gap-1.5">
                    <p
                      className="font-semibold uppercase tracking-wide text-amber-700"
                      style={{ paddingLeft: '0.25rem', paddingRight: '0.25rem', fontSize: '11px' }}
                    >
                      Acercándose ({acercandose.length})
                    </p>
                    <HierarquiaEntradas entries={acercandose} rankPorClave={rankPorClave} mostrarEstado={false} />
                  </div>
                ) : null}
              </>
            );
          }}
        </ZoneSection>

        <ZoneSection
          titulo="Atención"
          descripcion="Gravedad histórica Alta · histórico finca (sin umbral validado aún para esta plaga)."
          icono={<AlertCircle className="size-4" />}
          entries={atencion}
          tono="atencion"
          defaultOpen={false}
          vacioTexto="Sin combinaciones en gravedad Alta esta semana."
        >
          {(filtradas) => <HierarquiaEntradas entries={filtradas} rankPorClave={rankPorClave} mostrarEstado={false} />}
        </ZoneSection>

        <ZoneSection
          titulo="En orden"
          descripcion="Bajo el umbral validado (Cartama), o gravedad histórica Media/Baja (histórico finca)."
          icono={<CircleCheck className="size-4" />}
          entries={orden}
          tono="calma"
          defaultOpen={false}
          conFiltro
          vacioTexto="Sin combinaciones en esta categoría."
        >
          {(filtradas) => <HierarquiaEntradas entries={filtradas} rankPorClave={rankPorClave} mostrarEstado />}
        </ZoneSection>
      </div>
    </div>
  );
}

export default PriorizacionScoutingView;
