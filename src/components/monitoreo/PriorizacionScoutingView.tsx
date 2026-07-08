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
import { ToggleGroup, ToggleGroupItem } from '../ui/toggle-group';

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
}

function infoEstado(entry: PriorizacionEntry): InfoEstado {
  if (entry.tier === 'A') {
    const atribucion = entry.umbralSourceLabel ?? 'Cartama';
    if (entry.estadoUmbral === 'over') {
      return { etiqueta: 'Sobre umbral', atribucion, claseChip: 'bg-destructive text-white' };
    }
    if (entry.estadoUmbral === 'approaching') {
      return { etiqueta: 'Acercándose', atribucion, claseChip: 'bg-amber-500 text-white dark:bg-amber-600' };
    }
    return { etiqueta: 'Bajo umbral', atribucion, claseChip: 'border border-border text-muted-foreground' };
  }
  const gravedad = entry.gravedad?.texto ?? 'Baja';
  const claseChip =
    gravedad === 'Alta'
      ? 'border border-amber-500 text-amber-700 dark:text-amber-400'
      : gravedad === 'Media'
        ? 'border border-muted-foreground/40 text-muted-foreground'
        : 'border border-muted-foreground/25 text-muted-foreground/70';
  return { etiqueta: `Gravedad ${gravedad}`, atribucion: 'histórico finca', claseChip };
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
      <dd className="truncate font-medium text-foreground tabular-nums">{value}</dd>
    </div>
  );
}

/** Insignia completa (tier + estado + atribución) — sólo en el popover de
 * detalle. Ej: "Sobre umbral · Cartama" / "Gravedad Alta · histórico finca". */
function InsigniaEstadoCompleta({ entry, estado }: { entry: PriorizacionEntry; estado: InfoEstado }) {
  if (entry.tier === 'A') {
    return (
      <Badge className={`gap-1 border-transparent ${estado.claseChip}`}>
        <ShieldCheck className="size-3.5" />
        {estado.etiqueta} · {estado.atribucion}
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className={`gap-1 border-dashed ${estado.claseChip}`}>
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
        <div className="mt-1.5">
          <InsigniaEstadoCompleta entry={entry} estado={estado} />
        </div>
      </div>

      <p className="leading-snug text-foreground">{entry.why}</p>

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
        <div className="flex items-center gap-1.5 rounded-md bg-amber-50 px-2 py-1 text-xs text-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
          <Flame className="size-3.5 shrink-0" />
          Semana {entry.weekOfYear}: temporada históricamente alta para esta plaga.
        </div>
      ) : null}
    </div>
  );
}

// ============================================================================
// Fila compacta — rank + ícono tier + chip de estado (+ umbral/temporada en
// filas críticas) + % + tendencia. Popover al tocar/clic (no Tooltip: debe
// funcionar en pantallas táctiles, no sólo con hover de mouse).
// ============================================================================

function FilaEntrada({
  entry,
  rank,
  variante,
}: {
  entry: PriorizacionEntry;
  rank: number;
  variante: 'critico' | 'estandar';
}) {
  const estado = infoEstado(entry);
  const ubicacion = [entry.lote_nombre ?? entry.lote_id, entry.sublote_nombre].filter(Boolean).join(' · ');
  const mostrarUmbral = variante === 'critico' && entry.tier === 'A' && entry.umbralPct !== undefined;
  const mostrarTemporada = variante === 'critico' && entry.temporadaAlta;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="flex w-full flex-col gap-1 rounded-md border bg-card px-2.5 py-2 text-left transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          style={{ borderColor: 'var(--border)' }}
        >
          <div className="flex items-center gap-2">
            <span
              className="w-4 shrink-0 text-right font-medium tabular-nums text-muted-foreground"
              style={{ fontSize: '10px' }}
            >
              {rank}
            </span>
            <TierIcono tier={entry.tier} />
            <span
              className={`inline-flex shrink-0 items-center rounded-md py-0.5 font-semibold leading-none ${estado.claseChip}`}
              style={{ fontSize: '10px', paddingLeft: '0.375rem', paddingRight: '0.375rem' }}
            >
              {estado.etiqueta}
            </span>
            <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">{entry.pest_nombre}</span>
            <span className="flex shrink-0 flex-col items-end gap-0.5">
              <span className="text-sm font-semibold tabular-nums text-foreground">
                {formatPercentage(entry.incidenciaActual, 0)}
              </span>
              <TrendBadge tendencia={entry.tendencia} numRondas={entry.numRondas} />
            </span>
          </div>
          <div
            className="flex flex-wrap items-center text-xs text-muted-foreground"
            style={{ columnGap: '0.5rem', rowGap: '0.125rem', paddingLeft: '1.5rem' }}
          >
            <span className="truncate">{ubicacion}</span>
            {mostrarUmbral ? (
              <span className="shrink-0 tabular-nums">
                · {formatPercentage(entry.incidenciaActual, 0)} {entry.estadoUmbral === 'over' ? '≥' : '≈'} umbral{' '}
                {formatPercentage(entry.umbralPct as number, 0)}
              </span>
            ) : null}
            {mostrarTemporada ? (
              <span className="inline-flex shrink-0 items-center gap-0.5 text-orange-600 dark:text-orange-400">
                · <Flame className="size-3.5" /> temporada alta
              </span>
            ) : null}
          </div>
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80" style={{ maxWidth: 'calc(100vw - 2rem)' }}>
        <EntryDetail entry={entry} />
      </PopoverContent>
    </Popover>
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

const AMBAR_500 = '#f59e0b';

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
      clase: 'border text-amber-700 dark:text-amber-400',
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
      className={`flex flex-col items-start gap-1.5 rounded-lg border p-2.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
        seleccionado ? 'bg-muted' : 'bg-card hover:bg-muted/60'
      }`}
      style={{ borderColor: seleccionado ? 'var(--foreground)' : 'var(--border)' }}
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

const TONO_ESTILOS: Record<Tono, { borde: string; header: string; icono: string; contador: string }> = {
  critico: {
    borde: 'border-destructive',
    header: 'bg-destructive/10 text-destructive',
    icono: 'bg-destructive text-white',
    contador: 'bg-destructive text-white',
  },
  atencion: {
    borde: 'border-amber-400/40',
    header: 'bg-amber-50 text-amber-800 dark:bg-amber-950/30 dark:text-amber-300',
    icono: 'bg-amber-500 text-white',
    contador: 'bg-amber-500 text-white',
  },
  calma: {
    borde: 'border-border',
    header: 'bg-muted/50 text-foreground',
    icono: 'bg-muted-foreground/20 text-muted-foreground',
    contador: 'bg-muted text-muted-foreground',
  },
};

type FiltroTier = 'todos' | 'A' | 'B';

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
    <Collapsible open={open} onOpenChange={setOpen} className={`overflow-hidden rounded-lg border ${estilos.borde}`}>
      <CollapsibleTrigger asChild>
        <button type="button" className={`flex w-full items-start gap-3 px-3 py-2.5 text-left ${estilos.header}`}>
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
            <div className="flex flex-wrap items-center gap-2 pb-1">
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
              <ToggleGroup
                type="single"
                size="sm"
                value={filtroTier}
                onValueChange={(v) => v && setFiltroTier(v as FiltroTier)}
                className="shrink-0 rounded-md border"
              >
                <ToggleGroupItem value="todos" className="text-xs" aria-label="Mostrar todos los tiers">
                  Todos
                </ToggleGroupItem>
                <ToggleGroupItem value="A" className="text-xs" aria-label="Filtrar Tier A">
                  Tier A
                </ToggleGroupItem>
                <ToggleGroupItem value="B" className="text-xs" aria-label="Filtrar Tier B">
                  Tier B
                </ToggleGroupItem>
              </ToggleGroup>
            </div>
          ) : null}

          {entries.length === 0 ? (
            <p className="px-1 py-2 text-xs text-muted-foreground">{vacioTexto}</p>
          ) : entriesFiltradas.length === 0 ? (
            <p className="px-1 py-2 text-xs text-muted-foreground">Ninguna combinación coincide con el filtro/búsqueda actual.</p>
          ) : (
            <>
              {conFiltro && entriesFiltradas.length !== entries.length ? (
                <p className="px-1 text-[11px] text-muted-foreground">
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
      <PopoverContent align="end" className="w-80 text-sm" style={{ maxWidth: 'calc(100vw - 2rem)' }}>
        <div className="flex flex-col gap-2.5">
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
        <div className="mx-auto mb-3 h-8 w-8 animate-spin rounded-full border-4 border-solid border-primary border-r-transparent" />
        <p className="text-sm text-muted-foreground">Calculando priorización...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-4 dark:border-red-900/50 dark:bg-red-950/30">
        <AlertTriangle className="mt-0.5 size-4 shrink-0 text-red-600" />
        <div>
          <p className="text-sm font-medium text-red-900 dark:text-red-200">No se pudo calcular la priorización</p>
          <p className="mt-0.5 text-xs text-red-700 dark:text-red-400">{error}</p>
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
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-3 p-3 sm:p-4">
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
                    <p className="px-1 text-[11px] font-semibold uppercase tracking-wide text-destructive">
                      Sobre umbral ({sobre.length})
                    </p>
                    {sobre.map((entry) => (
                      <FilaEntrada key={entryKey(entry)} entry={entry} rank={rankPorClave.get(entryKey(entry)) ?? 0} variante="critico" />
                    ))}
                  </div>
                ) : null}
                {acercandose.length > 0 ? (
                  <div className="flex flex-col gap-1.5">
                    <p className="px-1 text-[11px] font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-400">
                      Acercándose ({acercandose.length})
                    </p>
                    {acercandose.map((entry) => (
                      <FilaEntrada key={entryKey(entry)} entry={entry} rank={rankPorClave.get(entryKey(entry)) ?? 0} variante="critico" />
                    ))}
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
          {(filtradas) => (
            <div className="flex flex-col gap-1.5">
              {filtradas.map((entry) => (
                <FilaEntrada key={entryKey(entry)} entry={entry} rank={rankPorClave.get(entryKey(entry)) ?? 0} variante="estandar" />
              ))}
            </div>
          )}
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
          {(filtradas) => (
            <div className="flex flex-col gap-1.5">
              {filtradas.map((entry) => (
                <FilaEntrada key={entryKey(entry)} entry={entry} rank={rankPorClave.get(entryKey(entry)) ?? 0} variante="estandar" />
              ))}
            </div>
          )}
        </ZoneSection>
      </div>
    </div>
  );
}

export default PriorizacionScoutingView;
