// CONCEPTO B — Feed de triage por zonas de severidad.
//
// Hipótesis: en vez de una lista plana donde cada tarjeta compite por la misma
// atención visual, agrupamos las entradas en tres zonas rotuladas por urgencia
// (Crítico / Atención / En orden). Sólo la zona Crítico viene expandida por
// defecto; las otras dos arrancan colapsadas y resumidas ("N combinaciones,
// toca para ver detalle"). Dentro de cada zona, las filas son de una sola
// línea (plaga · lote/sublote · % · tendencia) — el detalle completo (la
// frase "why", umbral, días desde fumigación, temporada alta, etc.) vive en
// un Popover accesible con un toque, no en un Tooltip (que no responde bien
// en pantallas táctiles).
//
// Regla dura de todo el archivo: Tier A y Tier B NUNCA comparten el mismo
// lenguaje visual. Tier A (umbral económico validado por Cartama) siempre se
// pinta como una insignia SÓLIDA; Tier B (tercil estadístico interno, sin
// validación externa) siempre como insignia de SOLO BORDE. Esa distinción se
// mantiene igual dentro de cualquier zona, para que un usuario nunca lea más
// autoridad de la que realmente hay detrás del dato.

import { useMemo, useState, type ReactNode } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  BarChart3,
  ChevronDown,
  CircleCheck,
  Info,
  Minus,
  ShieldCheck,
  Sprout,
  TrendingDown,
  TrendingUp,
} from 'lucide-react';

import type { PriorizacionEntry, Tendencia } from '../../../utils/priorizacionMonitoreo';
import { formatPercentage } from '../../../utils/format';
import { Popover, PopoverContent, PopoverTrigger } from '../../ui/popover';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '../../ui/collapsible';

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
// Insignia de tier — sólida para A, sólo-borde para B. Esta diferencia de
// tratamiento (relleno vs. contorno) es la señal visual constante que separa
// "evidencia validada externamente" de "referencia estadística interna".
// ============================================================================

function TierBadge({ entry }: { entry: PriorizacionEntry }) {
  if (entry.tier === 'A') {
    const estado = entry.estadoUmbral ?? 'under';
    const claseColor =
      estado === 'over'
        ? 'bg-destructive text-destructive-foreground'
        : estado === 'approaching'
          ? 'bg-amber-500 text-white dark:bg-amber-600'
          : 'bg-primary/70 text-primary-foreground';
    return (
      <span
        title={`Tier A — umbral económico validado (${entry.umbralSourceLabel ?? 'Cartama'})`}
        className={`inline-flex shrink-0 items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-semibold leading-none ${claseColor}`}
      >
        <ShieldCheck className="size-3" />A
      </span>
    );
  }

  const gravedad = entry.gravedad?.texto ?? 'Baja';
  const claseColor =
    gravedad === 'Alta'
      ? 'border-amber-500 text-amber-700 dark:text-amber-400'
      : gravedad === 'Media'
        ? 'border-muted-foreground/50 text-muted-foreground'
        : 'border-muted-foreground/30 text-muted-foreground/70';
  return (
    <span
      title="Tier B — tercil estadístico histórico de esta finca (sin umbral validado)"
      className={`inline-flex shrink-0 items-center gap-1 rounded-md border bg-transparent px-1.5 py-0.5 text-[10px] font-semibold leading-none ${claseColor}`}
    >
      <BarChart3 className="size-3" />B
    </span>
  );
}

function TrendBadge({ tendencia }: { tendencia: Tendencia }) {
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

// ============================================================================
// Detalle completo de una entrada — vive dentro del Popover, no siempre
// visible, pero con todo lo que un agrónomo necesitaría (why, %, umbral,
// tendencia, días desde fumigación, rondas, temporada alta).
// ============================================================================

function EntryDetail({ entry }: { entry: PriorizacionEntry }) {
  const ubicacion = [entry.lote_nombre ?? entry.lote_id, entry.sublote_nombre].filter(Boolean).join(' · ');

  return (
    <div className="flex flex-col gap-3 text-sm">
      <div>
        <div className="flex items-center gap-2">
          <TierBadge entry={entry} />
          <span className="font-semibold text-foreground">{entry.pest_nombre}</span>
        </div>
        <div className="mt-0.5 text-xs text-muted-foreground">{ubicacion}</div>
      </div>

      <p className="leading-snug text-foreground">{entry.why}</p>

      <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-xs">
        <DetailStat label="Incidencia actual" value={formatPercentage(entry.incidenciaActual)} />
        <DetailStat label="Ronda anterior" value={formatPercentage(entry.incidenciaAnterior)} />
        {entry.tier === 'A' && entry.umbralPct !== undefined ? (
          <DetailStat label={`Umbral (${entry.umbralSourceLabel ?? 'validado'})`} value={formatPercentage(entry.umbralPct)} />
        ) : null}
        {entry.tier === 'B' && entry.gravedad ? (
          <DetailStat label="Gravedad histórica" value={entry.gravedad.texto} />
        ) : null}
        <DetailStat label="Cambio vs. ronda anterior" value={entry.cambioFormateado} />
        <DetailStat
          label="Última fumigación del lote"
          value={entry.diasDesdeUltimaFumigacion === null ? 'Sin dato' : `hace ${entry.diasDesdeUltimaFumigacion} días`}
        />
        <DetailStat label="Rondas de respaldo" value={`${entry.numRondas}`} />
      </dl>

      {entry.temporadaAlta ? (
        <div className="flex items-center gap-1.5 rounded-md bg-amber-50 px-2 py-1 text-xs text-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
          <Sprout className="size-3.5 shrink-0" />
          Semana {entry.weekOfYear}: temporada históricamente alta para esta plaga.
        </div>
      ) : null}
    </div>
  );
}

// ============================================================================
// Fila compacta — una línea, Popover al tocar/clic (no Tooltip: debe
// funcionar en pantallas táctiles, no sólo con hover de mouse).
// ============================================================================

function EntryRow({ entry }: { entry: PriorizacionEntry }) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="flex w-full items-center gap-2 rounded-md border border-border/60 bg-card px-2.5 py-2 text-left transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <TierBadge entry={entry} />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium text-foreground">{entry.pest_nombre}</span>
            <span className="block truncate text-xs text-muted-foreground">
              {entry.lote_nombre ?? entry.lote_id}
              {entry.sublote_nombre ? ` · ${entry.sublote_nombre}` : ''}
            </span>
          </span>
          <span className="flex shrink-0 flex-col items-end gap-0.5">
            <span className="text-sm font-semibold tabular-nums text-foreground">
              {formatPercentage(entry.incidenciaActual, 0)}
            </span>
            <TrendBadge tendencia={entry.tendencia} />
          </span>
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80 max-w-[calc(100vw-2rem)]">
        <EntryDetail entry={entry} />
      </PopoverContent>
    </Popover>
  );
}

// ============================================================================
// Sección de zona — Collapsible con header rotulado (icono + nombre + conteo
// + descripción corta) y lista de filas. Sólo "Crítico" viene expandida por
// defecto.
// ============================================================================

type Tono = 'critico' | 'atencion' | 'calma';

const TONO_ESTILOS: Record<Tono, { borde: string; header: string; icono: string; contador: string }> = {
  critico: {
    borde: 'border-destructive/30',
    header: 'bg-destructive/10 text-destructive',
    icono: 'bg-destructive text-destructive-foreground',
    contador: 'bg-destructive text-destructive-foreground',
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

interface ZoneSectionProps {
  titulo: string;
  descripcion: string;
  icono: ReactNode;
  entries: PriorizacionEntry[];
  tono: Tono;
  defaultOpen: boolean;
  vacioTexto: string;
}

function ZoneSection({ titulo, descripcion, icono, entries, tono, defaultOpen, vacioTexto }: ZoneSectionProps) {
  const [open, setOpen] = useState(defaultOpen);
  const estilos = TONO_ESTILOS[tono];
  const hint =
    !open && entries.length > 0
      ? ` — ${entries.length} combinaci${entries.length === 1 ? 'ón' : 'ones'}, toca para ver detalle`
      : '';

  return (
    <Collapsible open={open} onOpenChange={setOpen} className={`overflow-hidden rounded-lg border ${estilos.borde}`}>
      <CollapsibleTrigger asChild>
        <button type="button" className={`flex w-full items-start gap-3 px-3 py-2.5 text-left ${estilos.header}`}>
          <span className={`mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full ${estilos.icono}`}>
            {icono}
          </span>
          <span className="min-w-0 flex-1">
            <span className="flex items-center gap-2">
              <span className="font-semibold">{titulo}</span>
              <span
                className={`inline-flex min-w-5 items-center justify-center rounded-full px-1.5 py-0.5 text-xs font-semibold ${estilos.contador}`}
              >
                {entries.length}
              </span>
            </span>
            <span className="mt-0.5 block text-xs font-normal opacity-90">
              {descripcion}
              {hint}
            </span>
          </span>
          <ChevronDown className={`mt-1 size-4 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="flex flex-col gap-1.5 bg-card p-2">
          {entries.length === 0 ? (
            <p className="px-1 py-2 text-xs text-muted-foreground">{vacioTexto}</p>
          ) : (
            entries.map((entry) => <EntryRow key={entryKey(entry)} entry={entry} />)
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
          className="flex size-8 shrink-0 items-center justify-center rounded-full border border-border text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Info className="size-4" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 max-w-[calc(100vw-2rem)] text-sm">
        <div className="flex flex-col gap-2.5">
          <p className="font-semibold text-foreground">¿Qué es esta lista?</p>
          <p className="text-muted-foreground">
            Prioriza qué lote/sublote revisar primero esta semana. No indica qué tratamiento aplicar —
            sólo dónde mirar antes.
          </p>
          <div className="flex items-start gap-2">
            <span className="mt-0.5 inline-flex shrink-0 items-center gap-1 rounded-md bg-destructive px-1.5 py-0.5 text-[10px] font-semibold leading-none text-destructive-foreground">
              <ShieldCheck className="size-3" />A
            </span>
            <p className="text-muted-foreground">
              <span className="font-medium text-foreground">Umbral validado: </span>
              comparado contra un umbral económico validado por un líder de la industria (Cartama).
              Evidencia fuerte.
            </p>
          </div>
          <div className="flex items-start gap-2">
            <span className="mt-0.5 inline-flex shrink-0 items-center gap-1 rounded-md border border-muted-foreground/50 px-1.5 py-0.5 text-[10px] font-semibold leading-none text-muted-foreground">
              <BarChart3 className="size-3" />B
            </span>
            <p className="text-muted-foreground">
              <span className="font-medium text-foreground">Referencia estadística: </span>
              sin umbral validado para esa plaga; se usa un tercil histórico propio de esta finca.
              Evidencia más débil.
            </p>
          </div>
          <p className="text-xs text-muted-foreground">Toca cualquier fila para ver el detalle completo.</p>
        </div>
      </PopoverContent>
    </Popover>
  );
}

// ============================================================================
// Componente principal
// ============================================================================

export function ConceptB({ entries }: { entries: PriorizacionEntry[] }) {
  const { critico, atencion, orden } = useMemo(() => {
    const critico: PriorizacionEntry[] = [];
    const atencion: PriorizacionEntry[] = [];
    const orden: PriorizacionEntry[] = [];
    for (const entry of entries) {
      const zona = zonaDe(entry);
      if (zona === 'critico') critico.push(entry);
      else if (zona === 'atencion') atencion.push(entry);
      else orden.push(entry);
    }
    return { critico, atencion, orden };
  }, [entries]);

  const resumen =
    critico.length > 0
      ? `${critico.length} foco${critico.length === 1 ? '' : 's'} crítico${critico.length === 1 ? '' : 's'} de ${entries.length} combinaciones monitoreadas — empieza por ahí.`
      : `Ningún foco crítico esta semana, de ${entries.length} combinaciones monitoreadas.`;

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-4 p-3 sm:p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-base font-semibold text-foreground">Priorización de monitoreo</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">{resumen}</p>
        </div>
        <InfoGeneral />
      </div>

      <div className="flex flex-col gap-3">
        <ZoneSection
          titulo="Crítico"
          descripcion="Supera o se acerca al umbral económico validado (Cartama)."
          icono={<AlertTriangle className="size-4" />}
          entries={critico}
          tono="critico"
          defaultOpen
          vacioTexto="Ningún foco superó ni se acerca al umbral económico esta semana."
        />
        <ZoneSection
          titulo="Atención"
          descripcion="Gravedad histórica Alta de esta finca, sin umbral validado aún."
          icono={<AlertCircle className="size-4" />}
          entries={atencion}
          tono="atencion"
          defaultOpen={false}
          vacioTexto="Sin combinaciones en gravedad Alta esta semana."
        />
        <ZoneSection
          titulo="En orden"
          descripcion="Por debajo del umbral, o gravedad histórica Media/Baja."
          icono={<CircleCheck className="size-4" />}
          entries={orden}
          tono="calma"
          defaultOpen={false}
          vacioTexto="Sin combinaciones en esta categoría."
        />
      </div>
    </div>
  );
}

export default ConceptB;
