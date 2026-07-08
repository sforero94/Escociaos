// ARCHIVO TEMPORAL — placeholder del torneo de diseño. Un agente constructor
// reemplaza el contenido de este archivo. Se elimina junto con
// src/components/monitoreo/tournament/ al cerrar el torneo.
//
// CONCEPTO A — Matriz / mapa de calor de priorización de monitoreo.
// Filas = plaga, columnas = lote (expandibles in-place a sublote). Cada celda es
// la peor entrada (bracket más bajo) de esa combinación, coloreada por severidad.
// Tier A (umbral económico validado por Cartama) se pinta sólida y saturada;
// Tier B (tercil estadístico interno, evidencia más débil) se pinta con textura
// rayada + borde punteado, para que nunca se vea con la misma autoridad visual.
import { useMemo, useState, type CSSProperties } from 'react';
import {
  Info,
  ChevronDown,
  ChevronRight,
  ArrowUp,
  ArrowDown,
  Minus,
  Flame,
  ShieldCheck,
  FlaskConical,
} from 'lucide-react';
import type { PriorizacionEntry, TierPriorizacion } from '../../../utils/priorizacionMonitoreo';
import { formatPercentage } from '../../../utils/format';
import { Badge } from '../../ui/badge';
import { Popover, PopoverContent, PopoverTrigger } from '../../ui/popover';
import { Button } from '../../ui/button';

// ============================================================================
// Tipos internos de agregación
// ============================================================================

interface ColumnaLote {
  lote_id: string;
  lote_nombre: string;
  /** Sublotes vistos para este lote, en orden de primera aparición. */
  sublotes: { sublote_id: string; sublote_nombre: string }[];
}

interface FilaPlaga {
  pest_nombre: string;
  /** true si CUALQUIER entrada de esta fila está en temporada alta histórica. */
  temporadaAltaEnAlguna: boolean;
}

/** Clave compuesta "idUbicacion__pestNombre" (lote o sublote como id de ubicación). */
function claveCelda(idUbicacion: string, pestNombre: string): string {
  return `${idUbicacion}__${pestNombre}`;
}

/** Entre varias entradas para la misma celda (p.ej. varios sublotes agregados a
 * nivel de lote), la "peor" es la de bracket más bajo (más urgente). */
function peorEntrada(entradas: PriorizacionEntry[]): PriorizacionEntry {
  return entradas.reduce((peor, actual) => (actual.bracket < peor.bracket ? actual : peor));
}

// ============================================================================
// Estilos de celda por severidad/tier
// ============================================================================

interface EstiloCelda {
  className: string;
  /** Estilo inline para el patrón rayado de Tier B (evidencia más débil). */
  style?: CSSProperties;
  etiquetaSeveridad: string;
}

const RAYADO_TIER_B: CSSProperties = {
  backgroundImage:
    'repeating-linear-gradient(135deg, currentColor 0, currentColor 1.5px, transparent 1.5px, transparent 7px)',
  backgroundBlendMode: 'overlay',
};

function estiloParaEntrada(e: PriorizacionEntry): EstiloCelda {
  if (e.tier === 'A') {
    switch (e.estadoUmbral) {
      case 'over':
        return {
          className: 'bg-red-600 text-white border-red-700 dark:bg-red-700 dark:border-red-800',
          etiquetaSeveridad: 'Sobre umbral',
        };
      case 'approaching':
        return {
          className:
            'bg-amber-500 text-white border-amber-600 dark:bg-amber-600 dark:border-amber-700',
          etiquetaSeveridad: 'Acercándose al umbral',
        };
      default:
        return {
          className:
            'bg-emerald-100 text-emerald-900 border-emerald-300 dark:bg-emerald-950 dark:text-emerald-200 dark:border-emerald-800',
          etiquetaSeveridad: 'Bajo el umbral',
        };
    }
  }
  // Tier B: SIEMPRE con textura rayada + borde punteado, y saturación menor que
  // cualquier caso Tier A equivalente — nunca debe leerse con la misma autoridad
  // visual que un umbral validado, sin importar la gravedad estadística interna.
  switch (e.gravedad?.texto) {
    case 'Alta':
      return {
        className:
          'bg-orange-100 text-orange-900 border-orange-300 border-dashed dark:bg-orange-950/60 dark:text-orange-200 dark:border-orange-800',
        style: RAYADO_TIER_B,
        etiquetaSeveridad: 'Gravedad Alta (sin umbral validado)',
      };
    case 'Media':
      return {
        className:
          'bg-yellow-50 text-yellow-900 border-yellow-300 border-dashed dark:bg-yellow-950/40 dark:text-yellow-200 dark:border-yellow-800',
        style: RAYADO_TIER_B,
        etiquetaSeveridad: 'Gravedad Media (sin umbral validado)',
      };
    default:
      return {
        className:
          'bg-slate-50 text-slate-600 border-slate-200 border-dashed dark:bg-slate-900/40 dark:text-slate-400 dark:border-slate-700',
        style: RAYADO_TIER_B,
        etiquetaSeveridad: 'Gravedad Baja (sin umbral validado)',
      };
  }
}

function IconoTendencia({ tendencia }: { tendencia: PriorizacionEntry['tendencia'] }) {
  if (tendencia === 'subiendo') return <ArrowUp className="size-3" aria-label="subiendo" />;
  if (tendencia === 'bajando') return <ArrowDown className="size-3" aria-label="bajando" />;
  return <Minus className="size-3" aria-label="estable" />;
}

function InsigniaTier({ tier }: { tier: TierPriorizacion }) {
  if (tier === 'A') {
    return (
      <span
        className="inline-flex items-center gap-0.5 rounded-sm bg-black/15 px-1 text-[9px] font-bold leading-tight"
        title="Tier A — umbral económico validado"
      >
        <ShieldCheck className="size-2.5" /> A
      </span>
    );
  }
  return (
    <span
      className="inline-flex items-center gap-0.5 rounded-sm border border-dashed border-current px-1 text-[9px] font-bold leading-tight opacity-80"
      title="Tier B — tercil estadístico interno, sin umbral validado"
    >
      <FlaskConical className="size-2.5" /> B
    </span>
  );
}

// ============================================================================
// Contenido del popover de detalle por celda
// ============================================================================

function DetalleCeldaContenido({ entrada }: { entrada: PriorizacionEntry }) {
  return (
    <div className="space-y-2 text-sm">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="font-semibold leading-tight">{entrada.pest_nombre}</div>
          <div className="text-xs text-muted-foreground">
            {entrada.lote_nombre}
            {entrada.sublote_nombre ? ` · ${entrada.sublote_nombre}` : ''}
          </div>
        </div>
        {entrada.tier === 'A' ? (
          <Badge
            className="shrink-0 bg-black/80 text-white"
            title="Umbral económico validado externamente"
          >
            <ShieldCheck className="size-3" /> Tier A · {entrada.umbralSourceLabel}
          </Badge>
        ) : (
          <Badge
            variant="outline"
            className="shrink-0 border-dashed"
            title="Sin umbral validado para esta plaga en esta finca"
          >
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
// Celda de la matriz
// ============================================================================

function CeldaMatriz({ entradas }: { entradas: PriorizacionEntry[] | undefined }) {
  if (!entradas || entradas.length === 0) {
    return (
      <div className="flex h-14 w-full min-w-[4.5rem] items-center justify-center rounded-md border border-dashed border-border bg-muted/40 text-xs text-muted-foreground">
        —
      </div>
    );
  }
  const peor = peorEntrada(entradas);
  const estilo = estiloParaEntrada(peor);
  const otras = entradas.length - 1;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          style={estilo.style}
          className={`relative flex h-14 w-full min-w-[4.5rem] flex-col items-center justify-center gap-0.5 rounded-md border px-1 py-1 text-xs font-semibold transition-transform hover:scale-[1.03] hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${estilo.className}`}
          aria-label={`${peor.pest_nombre} — ${peor.lote_nombre}${peor.sublote_nombre ? ' ' + peor.sublote_nombre : ''}: ${formatPercentage(peor.incidenciaActual)}, ${estilo.etiquetaSeveridad}`}
        >
          <span className="absolute left-1 top-1">
            <InsigniaTier tier={peor.tier} />
          </span>
          {peor.temporadaAlta && (
            <span className="absolute right-1 top-1" title="Temporada alta histórica">
              <Flame className="size-3" />
            </span>
          )}
          <span className="mt-2 text-sm leading-none tabular-nums">
            {formatPercentage(peor.incidenciaActual, 0)}
          </span>
          <span className="flex items-center gap-0.5 text-[10px] font-normal leading-none opacity-90">
            <IconoTendencia tendencia={peor.tendencia} />
            {peor.cambioFormateado}
          </span>
          {otras > 0 && (
            <span
              className="absolute -bottom-1 -right-1 flex size-4 items-center justify-center rounded-full bg-background text-[9px] font-bold text-foreground shadow ring-1 ring-border"
              title={`${otras} sublote(s) adicional(es) priorizados`}
            >
              +{otras}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-80" align="start">
        <DetalleCeldaContenido entrada={peor} />
        {otras > 0 && (
          <p className="mt-2 border-t pt-2 text-[11px] text-muted-foreground">
            Mostrando el sublote más urgente. Expande la columna del lote para ver los {otras}{' '}
            sublote(s) restantes por separado.
          </p>
        )}
      </PopoverContent>
    </Popover>
  );
}

// ============================================================================
// Explicador general (info del dashboard completo)
// ============================================================================

function ExplicadorGeneral() {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="size-7 shrink-0"
          aria-label="¿Cómo leer esta matriz?"
        >
          <Info className="size-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 space-y-2 text-sm" align="start">
        <p className="font-semibold">¿Qué es esto?</p>
        <p className="text-xs leading-snug text-muted-foreground">
          Prioriza <em>dónde mirar primero</em> esta semana — no indica qué tratamiento aplicar.
          Cada celda es la combinación plaga × lote más urgente encontrada en el monitoreo
          reciente.
        </p>
        <div className="space-y-1.5 text-xs">
          <div className="flex items-center gap-2">
            <span className="inline-block size-4 shrink-0 rounded-sm border border-red-700 bg-red-600" />
            <span>
              <strong>Tier A</strong> (sólido): comparado contra un umbral económico validado por
              un líder de la industria (Cartama). Rojo = ya lo superó, ámbar = se acerca.
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span
              className="inline-block size-4 shrink-0 rounded-sm border border-dashed border-orange-400 bg-orange-100"
              style={RAYADO_TIER_B}
            />
            <span>
              <strong>Tier B</strong> (rayado, borde punteado): sin umbral validado aún para esa
              plaga — se usa un tercil estadístico histórico de esta finca. Evidencia más débil.
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="inline-block size-4 shrink-0 rounded-sm border border-dashed border-border bg-muted/40" />
            <span>
              Gris = sin combinación priorizada para esa plaga/lote (no significa &quot;sin
              monitorear&quot;).
            </span>
          </div>
        </div>
        <p className="border-t pt-2 text-xs text-muted-foreground">
          Toca cualquier celda para ver el detalle completo (% real, umbral, tendencia, días desde
          la última fumigación). Usa la flecha junto al nombre del lote para desglosarlo por
          sublote.
        </p>
      </PopoverContent>
    </Popover>
  );
}

// ============================================================================
// Componente principal
// ============================================================================

export function ConceptA({ entries }: { entries: PriorizacionEntry[] }) {
  const [lotesExpandidos, setLotesExpandidos] = useState<Set<string>>(new Set());

  const { filas, columnas, mapaCeldas, resumen } = useMemo(() => {
    const filasMap = new Map<string, FilaPlaga>();
    const columnasMap = new Map<string, ColumnaLote>();
    const mapa = new Map<string, PriorizacionEntry[]>();
    let sobreUmbral = 0;
    let acercandose = 0;
    let gravedadAlta = 0;
    let enTemporadaAlta = 0;

    for (const e of entries) {
      if (!filasMap.has(e.pest_nombre)) {
        filasMap.set(e.pest_nombre, { pest_nombre: e.pest_nombre, temporadaAltaEnAlguna: false });
      }
      const fila = filasMap.get(e.pest_nombre)!;
      if (e.temporadaAlta) fila.temporadaAltaEnAlguna = true;

      if (!columnasMap.has(e.lote_id)) {
        columnasMap.set(e.lote_id, {
          lote_id: e.lote_id,
          lote_nombre: e.lote_nombre ?? e.lote_id,
          sublotes: [],
        });
      }
      const columna = columnasMap.get(e.lote_id)!;
      if (!columna.sublotes.some((s) => s.sublote_id === e.sublote_id)) {
        columna.sublotes.push({
          sublote_id: e.sublote_id,
          sublote_nombre: e.sublote_nombre ?? e.sublote_id,
        });
      }

      // Celda a nivel de lote (agrega todos los sublotes de ese lote para esa plaga).
      const claveLote = claveCelda(e.lote_id, e.pest_nombre);
      if (!mapa.has(claveLote)) mapa.set(claveLote, []);
      mapa.get(claveLote)!.push(e);

      // Celda a nivel de sublote (usada cuando el lote está expandido).
      const claveSublote = claveCelda(e.sublote_id, e.pest_nombre);
      if (!mapa.has(claveSublote)) mapa.set(claveSublote, []);
      mapa.get(claveSublote)!.push(e);

      if (e.tier === 'A' && e.estadoUmbral === 'over') sobreUmbral++;
      if (e.tier === 'A' && e.estadoUmbral === 'approaching') acercandose++;
      if (e.tier === 'B' && e.gravedad?.texto === 'Alta') gravedadAlta++;
      if (e.temporadaAlta) enTemporadaAlta++;
    }

    return {
      filas: Array.from(filasMap.values()),
      columnas: Array.from(columnasMap.values()),
      mapaCeldas: mapa,
      resumen: { sobreUmbral, acercandose, gravedadAlta, enTemporadaAlta, total: entries.length },
    };
  }, [entries]);

  function toggleLote(loteId: string) {
    setLotesExpandidos((prev) => {
      const next = new Set(prev);
      if (next.has(loteId)) next.delete(loteId);
      else next.add(loteId);
      return next;
    });
  }

  if (entries.length === 0) {
    return (
      <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
        No hay entradas priorizadas para mostrar.
      </div>
    );
  }

  return (
    <div className="space-y-3">
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

      {/* Resumen ejecutivo — la jerarquía debe verse en menos de 2 segundos */}
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
          <Badge
            variant="outline"
            className="border-dashed border-orange-400 text-orange-800 dark:text-orange-300"
          >
            {resumen.gravedadAlta} gravedad alta (Tier B)
          </Badge>
        )}
        {resumen.enTemporadaAlta > 0 && (
          <Badge variant="outline" className="gap-1">
            <Flame className="size-3 text-orange-600" /> {resumen.enTemporadaAlta} en temporada
            alta
          </Badge>
        )}
        <span className="ml-auto text-xs text-muted-foreground">
          {resumen.total} combinaciones priorizadas
        </span>
      </div>

      {/* Matriz — scroll horizontal en móvil, primera columna fija */}
      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr>
              <th className="sticky left-0 z-10 min-w-[7.5rem] border-b border-r bg-background p-2 text-left align-bottom text-xs font-medium text-muted-foreground">
                Plaga \ Lote
              </th>
              {columnas.map((col) => {
                const expandido = lotesExpandidos.has(col.lote_id);
                if (expandido && col.sublotes.length > 1) {
                  return col.sublotes.map((sub, i) => (
                    <th
                      key={sub.sublote_id}
                      className="border-b border-l p-1.5 text-center align-bottom text-[11px] font-medium text-muted-foreground"
                    >
                      <div className="flex flex-col items-center gap-0.5">
                        {i === 0 && (
                          <button
                            type="button"
                            onClick={() => toggleLote(col.lote_id)}
                            className="mb-0.5 flex items-center gap-0.5 rounded px-1 text-[10px] font-semibold text-foreground hover:bg-muted"
                            title="Colapsar de vuelta a nivel de lote"
                          >
                            <ChevronDown className="size-3" />
                            {col.lote_nombre}
                          </button>
                        )}
                        <span>{sub.sublote_nombre}</span>
                      </div>
                    </th>
                  ));
                }
                return (
                  <th
                    key={col.lote_id}
                    className="border-b border-l p-1.5 text-center align-bottom text-xs font-medium text-muted-foreground"
                  >
                    <button
                      type="button"
                      onClick={() => toggleLote(col.lote_id)}
                      disabled={col.sublotes.length <= 1}
                      className="flex w-full items-center justify-center gap-0.5 rounded px-1 py-0.5 text-foreground hover:bg-muted disabled:cursor-default disabled:hover:bg-transparent"
                      title={
                        col.sublotes.length > 1
                          ? 'Desglosar por sublote'
                          : 'Sólo un sublote priorizado para este lote'
                      }
                    >
                      {col.sublotes.length > 1 && <ChevronRight className="size-3 shrink-0" />}
                      <span className="truncate">{col.lote_nombre}</span>
                    </button>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {filas.map((fila) => (
              <tr key={fila.pest_nombre}>
                <th
                  scope="row"
                  className="sticky left-0 z-10 border-b border-r bg-background p-2 text-left align-middle text-xs font-medium"
                >
                  <span className="flex items-center gap-1">
                    {fila.temporadaAltaEnAlguna && (
                      <Flame className="size-3 shrink-0 text-orange-600" aria-label="temporada alta" />
                    )}
                    <span className="leading-tight">{fila.pest_nombre}</span>
                  </span>
                </th>
                {columnas.map((col) => {
                  const expandido = lotesExpandidos.has(col.lote_id);
                  if (expandido && col.sublotes.length > 1) {
                    return col.sublotes.map((sub) => (
                      <td key={sub.sublote_id} className="border-b border-l p-1">
                        <CeldaMatriz
                          entradas={mapaCeldas.get(claveCelda(sub.sublote_id, fila.pest_nombre))}
                        />
                      </td>
                    ));
                  }
                  return (
                    <td key={col.lote_id} className="border-b border-l p-1">
                      <CeldaMatriz
                        entradas={mapaCeldas.get(claveCelda(col.lote_id, fila.pest_nombre))}
                      />
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default ConceptA;
