// ARCHIVO TEMPORAL — placeholder del torneo de diseño. Un agente constructor
// reemplaza el contenido de este archivo. Se elimina junto con
// src/components/monitoreo/tournament/ al cerrar el torneo.
//
// CONCEPTO C — "Command Deck": titulares + tabla.
// Arriba, una fila de tarjetas grandes con las combinaciones MÁS urgentes
// (bracket más bajo, ya viene así ordenado desde el motor). Cada titular
// muestra sólo el dato que importa para decidir dónde ir primero (el %, el
// estado frente al umbral/gravedad, la tendencia) y esconde el resto (frase
// "why", días desde fumigación, rondas) detrás de un Popover — accesible con
// un toque, no sólo con hover, para que funcione igual de bien en el celular
// del dueño de la finca que en el escritorio.
//
// Debajo, el resto de las entradas vive en una tabla compacta, filtrable por
// tier y ordenable por lote/plaga/tier, con chips de color en vez de texto
// largo. Tier A (umbral económico validado por Cartama) siempre se pinta
// sólido; Tier B (tercil estadístico interno) siempre lleva borde punteado —
// esa distinción se repite en TODAS las superficies (titulares, chips de
// tabla, popovers) para que nunca compitan con la misma autoridad visual.
import { useMemo, useState } from 'react';
import {
  Info,
  ArrowUp,
  ArrowDown,
  Minus,
  Flame,
  ShieldCheck,
  FlaskConical,
  ChevronRight,
  Search,
} from 'lucide-react';
import type {
  PriorizacionEntry,
  TierPriorizacion,
  Tendencia,
} from '../../../utils/priorizacionMonitoreo';
import { formatPercentage } from '../../../utils/format';
import { Badge } from '../../ui/badge';
import { Button } from '../../ui/button';
import { Input } from '../../ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '../../ui/popover';
import { ToggleGroup, ToggleGroupItem } from '../../ui/toggle-group';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../../ui/table';

// ============================================================================
// Cuántos titulares mostrar arriba (hipótesis: 3-5). Es sólo el "top of mind":
// las entradas restantes NO desaparecen, bajan a la tabla completa.
// ============================================================================
const MAX_TITULARES = 4;

type OrdenTabla = 'prioridad' | 'lote' | 'plaga' | 'tier';
type FiltroTier = 'todos' | 'A' | 'B';

// ============================================================================
// Severidad → color/etiqueta, compartido entre titulares, chips y popovers.
// Tier B SIEMPRE lleva borde punteado y una saturación menor que su
// equivalente en Tier A — es una regla dura del diseño, no un detalle.
// ============================================================================
interface EstiloSeveridad {
  className: string;
  etiqueta: string;
}

function estiloSeveridad(e: PriorizacionEntry): EstiloSeveridad {
  if (e.tier === 'A') {
    switch (e.estadoUmbral) {
      case 'over':
        return {
          className: 'bg-red-600 text-white border-red-700 dark:bg-red-700 dark:border-red-800',
          etiqueta: 'Sobre umbral',
        };
      case 'approaching':
        return {
          className:
            'bg-amber-500 text-white border-amber-600 dark:bg-amber-600 dark:border-amber-700',
          etiqueta: 'Acercándose',
        };
      default:
        return {
          className:
            'bg-emerald-100 text-emerald-900 border-emerald-300 dark:bg-emerald-950 dark:text-emerald-200 dark:border-emerald-800',
          etiqueta: 'Bajo umbral',
        };
    }
  }
  switch (e.gravedad?.texto) {
    case 'Alta':
      return {
        className:
          'bg-orange-100 text-orange-900 border-orange-300 border-dashed dark:bg-orange-950/60 dark:text-orange-200 dark:border-orange-800',
        etiqueta: 'Gravedad Alta',
      };
    case 'Media':
      return {
        className:
          'bg-yellow-50 text-yellow-900 border-yellow-300 border-dashed dark:bg-yellow-950/40 dark:text-yellow-200 dark:border-yellow-800',
        etiqueta: 'Gravedad Media',
      };
    default:
      return {
        className:
          'bg-slate-50 text-slate-600 border-slate-200 border-dashed dark:bg-slate-900/40 dark:text-slate-400 dark:border-slate-700',
        etiqueta: 'Gravedad Baja',
      };
  }
}

/** Rango numérico de severidad para ordenar por "tier" en la tabla: Tier A
 * primero (por estado, over > approaching > under), luego Tier B (por
 * gravedad). Menor = más urgente. */
function rangoSeveridad(e: PriorizacionEntry): number {
  if (e.tier === 'A') {
    if (e.estadoUmbral === 'over') return 0;
    if (e.estadoUmbral === 'approaching') return 1;
    return 2;
  }
  const n = e.gravedad?.numerica ?? 1;
  return 3 + (3 - n); // Alta=3, Media=2, Baja=4
}

function IconoTendencia({ tendencia }: { tendencia: Tendencia }) {
  if (tendencia === 'subiendo') return <ArrowUp className="size-3" aria-label="subiendo" />;
  if (tendencia === 'bajando') return <ArrowDown className="size-3" aria-label="bajando" />;
  return <Minus className="size-3" aria-label="estable" />;
}

/** Insignia compacta A/B — reutilizada en titulares, tabla y popover. */
function InsigniaTier({ tier }: { tier: TierPriorizacion }) {
  if (tier === 'A') {
    return (
      <span
        className="inline-flex shrink-0 items-center gap-0.5 rounded-sm bg-black/15 px-1 py-0.5 text-[9px] font-bold leading-none"
        title="Tier A — umbral económico validado externamente"
      >
        <ShieldCheck className="size-2.5" /> A
      </span>
    );
  }
  return (
    <span
      className="inline-flex shrink-0 items-center gap-0.5 rounded-sm border border-dashed border-current px-1 py-0.5 text-[9px] font-bold leading-none opacity-80"
      title="Tier B — tercil estadístico interno, sin umbral validado"
    >
      <FlaskConical className="size-2.5" /> B
    </span>
  );
}

// ============================================================================
// Contenido de detalle compartido (titular y fila de tabla usan el mismo).
// ============================================================================
function DetalleEntradaContenido({ entrada }: { entrada: PriorizacionEntry }) {
  return (
    <div className="space-y-2 text-sm">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate font-semibold leading-tight">{entrada.pest_nombre}</div>
          <div className="truncate text-xs text-muted-foreground">
            {entrada.lote_nombre}
            {entrada.sublote_nombre ? ` · ${entrada.sublote_nombre}` : ''}
          </div>
        </div>
        {entrada.tier === 'A' ? (
          <Badge className="shrink-0 bg-black/80 text-white">
            <ShieldCheck className="size-3" /> Tier A · {entrada.umbralSourceLabel}
          </Badge>
        ) : (
          <Badge variant="outline" className="shrink-0 border-dashed">
            <FlaskConical className="size-3" /> Tier B · interno
          </Badge>
        )}
      </div>

      <p className="rounded-md bg-muted p-2 text-xs leading-snug text-foreground">{entrada.why}</p>

      <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
        <div>
          <span className="text-muted-foreground">Incidencia actual: </span>
          <span className="font-medium">{formatPercentage(entrada.incidenciaActual)}</span>
        </div>
        <div>
          <span className="text-muted-foreground">Ronda anterior: </span>
          <span className="font-medium">{formatPercentage(entrada.incidenciaAnterior)}</span>
        </div>
        <div className="flex items-center gap-1">
          <span className="text-muted-foreground">Cambio: </span>
          <span className="inline-flex items-center gap-0.5 font-medium">
            <IconoTendencia tendencia={entrada.tendencia} />
            {entrada.cambioFormateado}
          </span>
        </div>
        <div>
          <span className="text-muted-foreground">Rondas: </span>
          <span className="font-medium">{entrada.numRondas}</span>
        </div>
        {entrada.tier === 'A' && entrada.umbralPct !== undefined && (
          <div>
            <span className="text-muted-foreground">Umbral ({entrada.umbralSourceLabel}): </span>
            <span className="font-medium">{formatPercentage(entrada.umbralPct)}</span>
          </div>
        )}
        {entrada.tier === 'B' && entrada.gravedad && (
          <div>
            <span className="text-muted-foreground">Gravedad histórica: </span>
            <span className="font-medium">{entrada.gravedad.texto}</span>
          </div>
        )}
        <div>
          <span className="text-muted-foreground">Última fumigación: </span>
          <span className="font-medium">
            {entrada.diasDesdeUltimaFumigacion === null
              ? 'sin datos'
              : `hace ${entrada.diasDesdeUltimaFumigacion} días`}
          </span>
        </div>
        {entrada.temporadaAlta && (
          <div className="flex items-center gap-1 text-orange-700 dark:text-orange-400">
            <Flame className="size-3" />
            <span className="font-medium">Temporada alta histórica</span>
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// Titular (tarjeta grande de la fila superior)
// ============================================================================
function TarjetaTitular({ entrada, rango }: { entrada: PriorizacionEntry; rango: number }) {
  const estilo = estiloSeveridad(entrada);
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="group flex w-full flex-col gap-2 rounded-xl border-2 p-3 text-left shadow-sm transition-transform hover:scale-[1.015] hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:p-4"
        >
          <div className={`-m-3 mb-0 flex items-center justify-between gap-2 rounded-t-lg border-b-2 px-3 py-1.5 sm:-m-4 sm:mb-0 sm:px-4 ${estilo.className}`}>
            <span className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide opacity-90">
              #{rango + 1} · {estilo.etiqueta}
            </span>
            <InsigniaTier tier={entrada.tier} />
          </div>

          <div className="mt-2 flex items-end justify-between gap-2">
            <span className="text-3xl font-bold leading-none tabular-nums text-foreground sm:text-4xl">
              {formatPercentage(entrada.incidenciaActual, 0)}
            </span>
            <span className="flex items-center gap-1 pb-1 text-xs font-medium text-muted-foreground">
              <IconoTendencia tendencia={entrada.tendencia} />
              {entrada.cambioFormateado}
            </span>
          </div>

          <div className="min-w-0">
            <div className="truncate text-sm font-semibold leading-tight text-foreground">
              {entrada.pest_nombre}
            </div>
            <div className="truncate text-xs text-muted-foreground">
              {entrada.lote_nombre}
              {entrada.sublote_nombre ? ` · ${entrada.sublote_nombre}` : ''}
            </div>
          </div>

          <div className="flex items-center gap-2 border-t pt-2 text-[11px] text-muted-foreground">
            {entrada.temporadaAlta && (
              <span className="inline-flex items-center gap-0.5 text-orange-700 dark:text-orange-400">
                <Flame className="size-3" /> temporada alta
              </span>
            )}
            <span className="ml-auto inline-flex items-center gap-0.5 opacity-70 group-hover:opacity-100">
              Ver detalle <ChevronRight className="size-3" />
            </span>
          </div>
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-80" align="start">
        <DetalleEntradaContenido entrada={entrada} />
      </PopoverContent>
    </Popover>
  );
}

// ============================================================================
// Fila de la tabla compacta
// ============================================================================
function FilaTabla({ entrada, rango }: { entrada: PriorizacionEntry; rango: number }) {
  const estilo = estiloSeveridad(entrada);
  return (
    <TableRow>
      <TableCell className="w-8 whitespace-nowrap text-xs text-muted-foreground">
        {rango + 1}
      </TableCell>
      <TableCell className="max-w-0 whitespace-normal">
        <div className="flex items-center gap-1.5">
          <InsigniaTier tier={entrada.tier} />
          <span className="truncate text-sm font-medium leading-tight">{entrada.pest_nombre}</span>
        </div>
        <div className="truncate text-xs text-muted-foreground">
          {entrada.lote_nombre}
          {entrada.sublote_nombre ? ` · ${entrada.sublote_nombre}` : ''}
        </div>
      </TableCell>
      <TableCell className="whitespace-nowrap">
        <span
          className={`inline-flex items-center rounded-md border px-1.5 py-0.5 text-[10px] font-semibold leading-none ${estilo.className}`}
        >
          {estilo.etiqueta}
        </span>
      </TableCell>
      <TableCell className="whitespace-nowrap text-right">
        <div className="flex flex-col items-end">
          <span className="text-sm font-semibold tabular-nums">
            {formatPercentage(entrada.incidenciaActual, 0)}
          </span>
          <span className="flex items-center gap-0.5 text-[10px] text-muted-foreground">
            <IconoTendencia tendencia={entrada.tendencia} />
            {entrada.cambioFormateado}
          </span>
        </div>
      </TableCell>
      <TableCell className="w-9 whitespace-nowrap p-1 text-right">
        <Popover>
          <PopoverTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-8"
              aria-label={`Detalle de ${entrada.pest_nombre} en ${entrada.lote_nombre}`}
            >
              <ChevronRight className="size-4" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-80" align="end">
            <DetalleEntradaContenido entrada={entrada} />
          </PopoverContent>
        </Popover>
      </TableCell>
    </TableRow>
  );
}

// ============================================================================
// Explicador general — primer contacto con Tier A / Tier B para alguien que
// nunca vio el dashboard.
// ============================================================================
function ExplicadorGeneral() {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="size-7 shrink-0"
          aria-label="¿Qué es esto y cómo lo uso?"
        >
          <Info className="size-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 space-y-2 text-sm" align="start">
        <p className="font-semibold">¿Qué es esto?</p>
        <p className="text-xs leading-snug text-muted-foreground">
          Prioriza <em>dónde mirar primero</em> esta semana — no indica qué tratamiento aplicar. Las
          tarjetas grandes de arriba son las combinaciones plaga × lote más urgentes; la tabla de
          abajo tiene el resto.
        </p>
        <div className="space-y-1.5 text-xs">
          <div className="flex items-center gap-2">
            <span className="inline-flex size-5 shrink-0 items-center justify-center rounded-sm border border-red-700 bg-red-600 text-white">
              <ShieldCheck className="size-3" />
            </span>
            <span>
              <strong>Tier A</strong> (sólido): comparado contra un umbral económico validado por un
              líder de la industria (Cartama). Rojo = ya lo superó, ámbar = se acerca.
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="inline-flex size-5 shrink-0 items-center justify-center rounded-sm border border-dashed border-orange-400 bg-orange-100 text-orange-900">
              <FlaskConical className="size-3" />
            </span>
            <span>
              <strong>Tier B</strong> (borde punteado): sin umbral validado aún para esa plaga — se
              usa un tercil estadístico histórico de esta finca. Evidencia más débil, nunca se
              muestra con la misma fuerza que Tier A.
            </span>
          </div>
        </div>
        <p className="border-t pt-2 text-xs text-muted-foreground">
          Toca cualquier tarjeta o fila para ver el detalle completo (% real, umbral, tendencia,
          días desde la última fumigación).
        </p>
      </PopoverContent>
    </Popover>
  );
}

// ============================================================================
// Componente principal
// ============================================================================
export function ConceptC({ entries }: { entries: PriorizacionEntry[] }) {
  const [filtroTier, setFiltroTier] = useState<FiltroTier>('todos');
  const [orden, setOrden] = useState<OrdenTabla>('prioridad');
  const [busqueda, setBusqueda] = useState('');

  const titulares = entries.slice(0, Math.min(MAX_TITULARES, entries.length));
  const resto = entries.slice(titulares.length);

  const resumen = useMemo(() => {
    let sobreUmbral = 0;
    let acercandose = 0;
    let gravedadAlta = 0;
    let enTemporadaAlta = 0;
    for (const e of entries) {
      if (e.tier === 'A' && e.estadoUmbral === 'over') sobreUmbral++;
      if (e.tier === 'A' && e.estadoUmbral === 'approaching') acercandose++;
      if (e.tier === 'B' && e.gravedad?.texto === 'Alta') gravedadAlta++;
      if (e.temporadaAlta) enTemporadaAlta++;
    }
    return { sobreUmbral, acercandose, gravedadAlta, enTemporadaAlta };
  }, [entries]);

  const filasTabla = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    const filtradas = resto.filter((e) => {
      if (filtroTier !== 'todos' && e.tier !== filtroTier) return false;
      if (!q) return true;
      const haystack = `${e.pest_nombre} ${e.lote_nombre ?? ''} ${e.sublote_nombre ?? ''}`.toLowerCase();
      return haystack.includes(q);
    });

    // Guardamos el bracket original de cada entrada como "rango de prioridad"
    // antes de reordenar, para que el número de la primera columna siga
    // reflejando la posición real de urgencia aunque la vista esté ordenada
    // por otro criterio.
    const conRango = filtradas.map((e) => ({ entrada: e, rangoOriginal: entries.indexOf(e) }));

    if (orden === 'lote') {
      conRango.sort((a, b) => (a.entrada.lote_nombre ?? '').localeCompare(b.entrada.lote_nombre ?? ''));
    } else if (orden === 'plaga') {
      conRango.sort((a, b) => a.entrada.pest_nombre.localeCompare(b.entrada.pest_nombre));
    } else if (orden === 'tier') {
      conRango.sort((a, b) => rangoSeveridad(a.entrada) - rangoSeveridad(b.entrada));
    }
    // 'prioridad' => se deja el orden ya calculado por el motor (bracket asc).

    return conRango;
  }, [resto, filtroTier, busqueda, orden, entries]);

  if (entries.length === 0) {
    return (
      <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
        No hay entradas priorizadas para mostrar.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Encabezado + explicador general */}
      <div className="flex items-start justify-between gap-2">
        <div>
          <h2 className="text-base font-semibold leading-tight">Priorización de monitoreo</h2>
          <p className="text-xs text-muted-foreground">
            Dónde mirar primero esta semana — no es un diagnóstico ni una prescripción.
          </p>
        </div>
        <ExplicadorGeneral />
      </div>

      {/* Resumen ejecutivo — legible en menos de 2 segundos */}
      <div className="flex flex-wrap items-center gap-1.5">
        {resumen.sobreUmbral > 0 && (
          <Badge className="bg-red-600 text-white hover:bg-red-600">
            {resumen.sobreUmbral} sobre umbral (Tier A)
          </Badge>
        )}
        {resumen.acercandose > 0 && (
          <Badge className="bg-amber-500 text-white hover:bg-amber-500">
            {resumen.acercandose} acercándose (Tier A)
          </Badge>
        )}
        {resumen.gravedadAlta > 0 && (
          <Badge variant="outline" className="border-dashed border-orange-400 text-orange-800 dark:text-orange-300">
            {resumen.gravedadAlta} gravedad alta (Tier B)
          </Badge>
        )}
        {resumen.enTemporadaAlta > 0 && (
          <Badge variant="outline" className="gap-1">
            <Flame className="size-3 text-orange-600" /> {resumen.enTemporadaAlta} en temporada alta
          </Badge>
        )}
        <span className="ml-auto text-xs text-muted-foreground">{entries.length} combinaciones priorizadas</span>
      </div>

      {/* Titulares — la fila de tarjetas grandes con lo más urgente */}
      <div>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Prioridad de esta semana
        </h3>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {titulares.map((e, i) => (
            <TarjetaTitular key={`${e.sublote_id}-${e.pest_id}-${i}`} entrada={e} rango={i} />
          ))}
        </div>
      </div>

      {/* Tabla compacta con el resto */}
      {resto.length > 0 && (
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Resto de combinaciones ({resto.length})
            </h3>
            <div className="ml-auto flex flex-wrap items-center gap-2">
              <div className="relative">
                <Search className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={busqueda}
                  onChange={(ev) => setBusqueda(ev.target.value)}
                  placeholder="Buscar lote o plaga..."
                  className="h-8 w-40 pl-7 text-xs sm:w-48"
                />
              </div>
              <ToggleGroup
                type="single"
                size="sm"
                value={filtroTier}
                onValueChange={(v) => v && setFiltroTier(v as FiltroTier)}
                className="rounded-md border"
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
          </div>

          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <span>Ordenar por:</span>
            <ToggleGroup
              type="single"
              size="sm"
              value={orden}
              onValueChange={(v) => v && setOrden(v as OrdenTabla)}
              className="rounded-md border"
            >
              <ToggleGroupItem value="prioridad" className="text-xs">Prioridad</ToggleGroupItem>
              <ToggleGroupItem value="lote" className="text-xs">Lote</ToggleGroupItem>
              <ToggleGroupItem value="plaga" className="text-xs">Plaga</ToggleGroupItem>
              <ToggleGroupItem value="tier" className="text-xs">Tier</ToggleGroupItem>
            </ToggleGroup>
          </div>

          <div className="rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-8">#</TableHead>
                  <TableHead>Plaga / Lote</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead className="text-right">%</TableHead>
                  <TableHead className="w-9" aria-label="Detalle" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {filasTabla.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="py-6 text-center text-xs text-muted-foreground">
                      Ninguna combinación coincide con el filtro/búsqueda actual.
                    </TableCell>
                  </TableRow>
                ) : (
                  filasTabla.map(({ entrada, rangoOriginal }) => (
                    <FilaTabla
                      key={`${entrada.sublote_id}-${entrada.pest_id}`}
                      entrada={entrada}
                      rango={rangoOriginal}
                    />
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </div>
      )}
    </div>
  );
}

export default ConceptC;
