// ARCHIVO TEMPORAL — placeholder del torneo de diseño. Un agente constructor
// reemplaza el contenido de este archivo. Se elimina junto con
// src/components/monitoreo/tournament/ al cerrar el torneo.
//
// CONCEPTO D — Acordeón agrupado por lote.
// Un scout recorre lotes físicamente, no plagas sueltas, así que la unidad de
// navegación es el lote. Cada lote es un <AccordionItem>: el header (cerrado)
// muestra un resumen escaneable en <2s — puntos de severidad + una insignia de
// conteo crítico — y al expandir se ve el detalle por sublote/plaga, con el
// "why" completo accesible vía Popover (no Tooltip, para que funcione con touch).
//
// Tier A (umbral económico validado por Cartama) siempre se pinta SÓLIDO
// (relleno de color). Tier B (tercil estadístico interno de esta finca, sin
// validación externa) siempre se pinta con contorno/hueco (nunca relleno),
// tanto en los puntos del header como en las insignias del detalle — esta
// regla de "sólido = validado externamente, hueco = referencia interna" es
// la única señal de autoridad visual que se repite en todo el componente, para
// que Tier A y Tier B nunca se confundan de un vistazo.
import { useMemo, useState } from 'react';
import {
  Info,
  TrendingUp,
  TrendingDown,
  Minus,
  ShieldCheck,
  BarChart3,
  CalendarClock,
  SprayCan,
  ListChecks,
} from 'lucide-react';
import type { PriorizacionEntry } from '../../../utils/priorizacionMonitoreo';
import { formatPercentage } from '../../../utils/format';
import { Badge } from '../../ui/badge';
import { Card } from '../../ui/card';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '../../ui/accordion';
import { Popover, PopoverContent, PopoverTrigger } from '../../ui/popover';
import { Button } from '../../ui/button';

// ============================================================================
// Agregación por lote
// ============================================================================

interface GrupoLote {
  lote_id: string;
  lote_nombre: string;
  entries: PriorizacionEntry[];
  minBracket: number;
  countOver: number;
  countApproaching: number;
  countTierBAlta: number;
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
        countOver: 0,
        countApproaching: 0,
        countTierBAlta: 0,
      };
      mapa.set(entry.lote_id, grupo);
    }
    grupo.entries.push(entry);
    grupo.minBracket = Math.min(grupo.minBracket, entry.bracket);
    if (entry.tier === 'A' && entry.estadoUmbral === 'over') grupo.countOver += 1;
    if (entry.tier === 'A' && entry.estadoUmbral === 'approaching') grupo.countApproaching += 1;
    if (entry.tier === 'B' && entry.gravedad?.texto === 'Alta') grupo.countTierBAlta += 1;
  }
  // Ya vienen ordenadas globalmente por bracket ascendente (más urgente primero);
  // ordenar los grupos por el bracket mínimo de cada uno preserva esa urgencia a
  // nivel de lote sin necesitar una segunda definición de "crítico".
  return Array.from(mapa.values()).sort((a, b) => a.minBracket - b.minBracket);
}

// ============================================================================
// Estilos por severidad — la regla sólido (Tier A) vs. hueco (Tier B) vive aquí
// ============================================================================

function colorSeveridad(entry: PriorizacionEntry): string {
  if (entry.tier === 'A') {
    if (entry.estadoUmbral === 'over') return '#dc2626'; // rojo — evidencia fuerte, sobre umbral
    if (entry.estadoUmbral === 'approaching') return '#d97706'; // ámbar
    return '#16a34a'; // verde — bajo umbral
  }
  if (entry.gravedad?.texto === 'Alta') return '#ea580c'; // naranja, distinto matiz del rojo Tier A
  if (entry.gravedad?.texto === 'Media') return '#ca8a04';
  return '#6b7280'; // gris — baja gravedad histórica
}

/** Punto de severidad reutilizado en el header del acordeón y en cada fila.
 * Tier A = relleno sólido. Tier B = sólo contorno (hueco). Esta diferencia de
 * "relleno vs. hueco" es intencionalmente la misma en todas partes del
 * componente para que la autoridad de la evidencia nunca sea ambigua. */
function PuntoSeveridad({ entry, size = 9 }: { entry: PriorizacionEntry; size?: number }) {
  const color = colorSeveridad(entry);
  const esTierA = entry.tier === 'A';
  return (
    <span
      className="inline-block shrink-0 rounded-full"
      style={{
        width: size,
        height: size,
        backgroundColor: esTierA ? color : 'transparent',
        border: esTierA ? 'none' : `2px solid ${color}`,
      }}
      aria-hidden="true"
    />
  );
}

function TierBadge({ entry }: { entry: PriorizacionEntry }) {
  if (entry.tier === 'A') {
    const label =
      entry.estadoUmbral === 'over'
        ? 'Sobre umbral'
        : entry.estadoUmbral === 'approaching'
          ? 'Acercándose'
          : 'Bajo umbral';
    const color = colorSeveridad(entry);
    return (
      <Badge
        className="gap-1 border-transparent text-white"
        style={{ backgroundColor: color }}
        title={`Tier A: umbral económico validado por ${entry.umbralSourceLabel ?? 'Cartama'}`}
      >
        <ShieldCheck className="size-3" />
        {label} · {entry.umbralSourceLabel ?? 'Cartama'}
      </Badge>
    );
  }
  const color = colorSeveridad(entry);
  return (
    <Badge
      variant="outline"
      className="gap-1 bg-transparent"
      style={{ borderColor: color, color }}
      title="Tier B: tercil estadístico histórico de esta finca, sin umbral económico validado"
    >
      <BarChart3 className="size-3" />
      Gravedad {entry.gravedad?.texto ?? '—'} · histórico finca
    </Badge>
  );
}

function TendenciaIcono({ tendencia }: { tendencia: PriorizacionEntry['tendencia'] }) {
  if (tendencia === 'subiendo') {
    return <TrendingUp className="size-3.5 text-red-600" aria-label="subiendo" />;
  }
  if (tendencia === 'bajando') {
    return <TrendingDown className="size-3.5 text-emerald-600" aria-label="bajando" />;
  }
  return <Minus className="size-3.5 text-muted-foreground" aria-label="estable" />;
}

// ============================================================================
// Popover de detalle por combinación (sublote × plaga)
// ============================================================================

function DetalleEntryPopover({ entry }: { entry: PriorizacionEntry }) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 gap-1 px-2 text-xs text-muted-foreground hover:text-foreground"
        >
          <Info className="size-3.5" />
          Detalle
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 max-w-[calc(100vw-2rem)] text-sm">
        <div className="space-y-3">
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="font-medium leading-tight">{entry.pest_nombre}</p>
              <p className="text-xs text-muted-foreground">
                {entry.sublote_nombre ?? 'Sublote sin nombre'} · {entry.lote_nombre ?? entry.lote_id}
              </p>
            </div>
            <TierBadge entry={entry} />
          </div>

          <p className="rounded-md bg-muted p-2 text-xs leading-relaxed text-foreground">
            {entry.why}
          </p>

          <dl className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs">
            <dt className="text-muted-foreground">Incidencia actual</dt>
            <dd className="text-right font-medium">{formatPercentage(entry.incidenciaActual)}</dd>
            <dt className="text-muted-foreground">Ronda anterior</dt>
            <dd className="text-right font-medium">{formatPercentage(entry.incidenciaAnterior)}</dd>
            <dt className="text-muted-foreground">Cambio</dt>
            <dd className="flex items-center justify-end gap-1 text-right font-medium">
              <TendenciaIcono tendencia={entry.tendencia} />
              {entry.cambioFormateado}
            </dd>
            <dt className="text-muted-foreground">Rondas que respaldan</dt>
            <dd className="text-right font-medium">{entry.numRondas}</dd>
          </dl>

          <div className="flex flex-col gap-1.5 border-t pt-2 text-xs text-muted-foreground">
            <div className="flex items-center gap-1.5">
              <SprayCan className="size-3.5 shrink-0" />
              {entry.diasDesdeUltimaFumigacion === null
                ? 'Sin registro de fumigación reciente en este lote'
                : `Última fumigación del lote: hace ${entry.diasDesdeUltimaFumigacion} día${entry.diasDesdeUltimaFumigacion === 1 ? '' : 's'}`}
            </div>
            {entry.temporadaAlta && (
              <div className="flex items-center gap-1.5">
                <CalendarClock className="size-3.5 shrink-0" />
                Temporada históricamente alta para esta plaga (semana {entry.weekOfYear})
              </div>
            )}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

// ============================================================================
// Fila de detalle (dentro del acordeón expandido)
// ============================================================================

function FilaEntry({ entry }: { entry: PriorizacionEntry }) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-md border border-border/60 px-3 py-2">
      <PuntoSeveridad entry={entry} size={10} />
      <div className="min-w-0 flex-1 basis-40">
        <p className="truncate text-sm font-medium">{entry.pest_nombre}</p>
        <p className="truncate text-xs text-muted-foreground">
          {entry.sublote_nombre ?? 'Sin sublote'}
        </p>
      </div>
      <div className="flex items-center gap-1 text-sm font-semibold tabular-nums">
        {formatPercentage(entry.incidenciaActual)}
        <TendenciaIcono tendencia={entry.tendencia} />
      </div>
      <div className="order-last w-full sm:order-none sm:w-auto">
        <TierBadge entry={entry} />
      </div>
      <DetalleEntryPopover entry={entry} />
    </div>
  );
}

// ============================================================================
// Header del acordeón (resumen escaneable del lote, cerrado)
// ============================================================================

function ResumenLoteHeader({ grupo }: { grupo: GrupoLote }) {
  const hayCritico = grupo.countOver > 0;
  const hayAcercando = grupo.countApproaching > 0;
  const hayAltaHistorica = grupo.countTierBAlta > 0;

  let insignia: { texto: string; className: string } | null = null;
  if (hayCritico) {
    insignia = {
      texto: `${grupo.countOver} sobre umbral`,
      className: 'bg-red-600 text-white border-transparent',
    };
  } else if (hayAcercando) {
    insignia = {
      texto: `${grupo.countApproaching} acercándose`,
      className: 'bg-amber-500 text-white border-transparent',
    };
  } else if (hayAltaHistorica) {
    insignia = {
      texto: `${grupo.countTierBAlta} alerta histórica`,
      className: 'border-orange-500 text-orange-600 bg-transparent',
    };
  }

  return (
    <div className="flex w-full flex-wrap items-center justify-between gap-2 pr-1">
      <div className="min-w-0 text-left">
        <p className="truncate font-medium">{grupo.lote_nombre}</p>
        <p className="text-xs text-muted-foreground">
          {grupo.entries.length} combinación{grupo.entries.length === 1 ? '' : 'es'} monitoreada
          {grupo.entries.length === 1 ? '' : 's'}
        </p>
      </div>
      <div className="flex items-center gap-2">
        <div className="flex items-center gap-0.5" aria-hidden="true">
          {grupo.entries.slice(0, 8).map((entry, i) => (
            <PuntoSeveridad key={`${entry.sublote_id}-${entry.pest_id}-${i}`} entry={entry} />
          ))}
        </div>
        {insignia ? (
          <Badge className={insignia.className}>{insignia.texto}</Badge>
        ) : (
          <Badge variant="outline" className="text-muted-foreground">
            Sin alertas
          </Badge>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// Popover explicativo general (Tier A vs Tier B, para primera vez)
// ============================================================================

function ExplicacionGeneralPopover() {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="size-7 text-muted-foreground"
          aria-label="¿Cómo leer este panel?"
        >
          <Info className="size-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80 max-w-[calc(100vw-2rem)] text-sm">
        <div className="space-y-2.5">
          <p className="font-medium">¿Qué es esto?</p>
          <p className="text-xs leading-relaxed text-muted-foreground">
            Esta lista prioriza qué lote revisar primero esta semana, según tus rondas de
            monitoreo. No es una recomendación de tratamiento, sólo indica dónde mirar primero.
          </p>
          <div className="flex items-start gap-2 rounded-md bg-muted p-2">
            <ShieldCheck className="mt-0.5 size-4 shrink-0 text-foreground" />
            <p className="text-xs leading-relaxed">
              <span className="font-medium">Relleno sólido (Tier A):</span> existe un umbral
              económico validado externamente (Cartama) para esa plaga. Si la incidencia ya lo
              superó o se acerca, es evidencia fuerte de que hay que actuar.
            </p>
          </div>
          <div className="flex items-start gap-2 rounded-md bg-muted p-2">
            <BarChart3 className="mt-0.5 size-4 shrink-0 text-foreground" />
            <p className="text-xs leading-relaxed">
              <span className="font-medium">Contorno hueco (Tier B):</span> no hay umbral validado
              para esa plaga todavía, así que se compara contra el histórico de esta misma finca
              (Baja/Media/Alta). Es una referencia útil, pero más débil que un umbral validado.
            </p>
          </div>
          <p className="text-xs text-muted-foreground">
            Toca <Info className="inline size-3 align-text-bottom" /> Detalle en cualquier fila
            para ver el porcentaje exacto, la tendencia y el razonamiento completo.
          </p>
        </div>
      </PopoverContent>
    </Popover>
  );
}

// ============================================================================
// Componente principal
// ============================================================================

export function ConceptD({ entries }: { entries: PriorizacionEntry[] }) {
  const grupos = useMemo(() => agruparPorLote(entries), [entries]);

  const totales = useMemo(() => {
    let over = 0;
    let approaching = 0;
    let tierBAlta = 0;
    for (const e of entries) {
      if (e.tier === 'A' && e.estadoUmbral === 'over') over += 1;
      if (e.tier === 'A' && e.estadoUmbral === 'approaching') approaching += 1;
      if (e.tier === 'B' && e.gravedad?.texto === 'Alta') tierBAlta += 1;
    }
    return { over, approaching, tierBAlta };
  }, [entries]);

  const [abiertos, setAbiertos] = useState<string[]>(() =>
    grupos.length > 0 && grupos[0].countOver + grupos[0].countApproaching > 0
      ? [grupos[0].lote_id]
      : []
  );

  if (entries.length === 0) {
    return (
      <Card className="p-6 text-sm text-muted-foreground">
        Sin datos de monitoreo para priorizar esta semana.
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="flex items-center gap-1">
            <h3 className="font-medium">Priorización de monitoreo</h3>
            <ExplicacionGeneralPopover />
          </div>
          <p className="text-xs text-muted-foreground">
            Agrupado por lote — {grupos.length} lote{grupos.length === 1 ? '' : 's'},{' '}
            {entries.length} combinación{entries.length === 1 ? '' : 'es'} sublote × plaga
          </p>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <Badge className="gap-1 border-transparent bg-red-600 text-white">
          <ShieldCheck className="size-3" />
          {totales.over} sobre umbral
        </Badge>
        <Badge className="gap-1 border-transparent bg-amber-500 text-white">
          <ShieldCheck className="size-3" />
          {totales.approaching} acercándose
        </Badge>
        <Badge variant="outline" className="gap-1 border-orange-500 bg-transparent text-orange-600">
          <BarChart3 className="size-3" />
          {totales.tierBAlta} alerta histórica alta
        </Badge>
        <Badge variant="outline" className="gap-1 text-muted-foreground">
          <ListChecks className="size-3" />
          {entries.length} en total
        </Badge>
      </div>

      <Card className="p-1 sm:p-2">
        <Accordion type="multiple" value={abiertos} onValueChange={setAbiertos} className="w-full">
          {grupos.map((grupo) => (
            <AccordionItem key={grupo.lote_id} value={grupo.lote_id} className="px-2">
              <AccordionTrigger className="hover:no-underline">
                <ResumenLoteHeader grupo={grupo} />
              </AccordionTrigger>
              <AccordionContent>
                <div className="flex flex-col gap-1.5">
                  {grupo.entries.map((entry, i) => (
                    <FilaEntry key={`${entry.sublote_id}-${entry.pest_id}-${i}`} entry={entry} />
                  ))}
                </div>
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </Card>
    </div>
  );
}

export default ConceptD;
