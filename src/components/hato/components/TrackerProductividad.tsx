// ARCHIVO: components/hato/components/TrackerProductividad.tsx
// DESCRIPCIÓN: Bloque 1 del tablero de Producción -- "Tracker de
// productividad" (decisión 13 del dueño, plan
// `docs/plan_hato_produccion_rework.md` §4.2c/§4.3, SOW 5): últimas 4
// semanas MEDIDAS + 2 semanas PROYECTADAS bottom-up, en LITROS/DÍA DEL
// HATO -- nunca litros/quincena (trampa de unidades, riesgo R-4: ver la
// cabecera de `hatoProduccion.ts`, el mismo motor que hace TODA la
// aritmética de este componente vía `proyectarHato`/`curvaLactanciaHato`/
// `vejezPesajes`). Este archivo solo consulta (vía props, ya resueltas por
// `useDatosProduccionPorVaca`) y renderiza.
//
// DOS SERIES, DOS PREGUNTAS (rediseño 2026-08-29, pedido del dueño):
//   - BARRA = litros/día TOTALES del hato ("cuánta leche voy a tener").
//   - LÍNEA superpuesta = litros/día POR VACA ("con cuántas vacas lo
//     logramos" / qué tan bien produce cada una), eje derecho propio.
// Antes solo se graficaba el total, y como el número de vacas pesadas se
// mueve de semana a semana (20 en marzo 2026, 28 en junio) el componente
// tenía que colgar una advertencia ámbar diciendo que las semanas no eran
// comparables 1:1. La línea de promedio ES la normalización que faltaba:
// resuelve el problema en vez de advertirlo, y conserva los dos datos, que
// son ambos importantes. La cobertura exacta de cada semana sigue estando
// en el tooltip, que es donde se contesta "¿cuántas vacas?" para un punto
// concreto.
//
// Medido vs proyectado se distingue por RELLENO en las barras (sólido vs
// claro, misma convención que `GraficoLitrosQuincenal`) y por trazo
// punteado en la línea -- nunca solo por el color.
//
// Sin banda de confianza (riesgo R-6, decisión 13): no hay base
// estadística para dibujarla. El tooltip declara cuántas vacas se
// proyectaron PLANAS por falta de curva de referencia -- nunca se oculta
// esa incertidumbre.
//
// Vejez del dato (decisión 17, riesgo R-7): con backlog, el eje X de las
// semanas MEDIDAS se rotula con FECHAS ABSOLUTAS en vez de "hace N
// semanas" cuando `vejez.nivel === 'critico'` -- de lo contrario "últimas 4
// semanas" mostraría datos de hace más de un mes como si fueran de esta
// semana.

import { useMemo } from 'react';
import {
  Bar,
  Cell,
  ComposedChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import { Loader2, TrendingUp } from 'lucide-react';
import { formatNumber, formatShortDate } from '@/utils/format';
import {
  curvaLactanciaHato,
  promedioLitrosPorVaca,
  proyectarHato,
  type PesajeLecheVaca,
  type EstadoReproductivoProyeccion,
  type VejezPesajes,
} from '@/utils/hatoProduccion';

// #73991C == --primary (medido), #BFD97D == --secondary (proyectado):
// misma pareja que `GraficoLitrosQuincenal` usa para medido/derivado, para
// que "claro = dato que no se midió" signifique lo mismo en las dos
// gráficas del tablero. #172E08 == --foreground: la línea de promedio va
// en el color de texto del repo para que se lea ENCIMA de las dos barras
// verdes. Hex directos: son atributos `fill`/`stroke` de SVG dentro del
// canvas de Recharts (CLAUDE.md R4).
const COLOR_MEDIDO = '#73991C';
const COLOR_PROYECTADO = '#BFD97D';
const COLOR_PROMEDIO = '#172E08';
const HORIZONTE_SEMANAS = 2;
const VENTANA_MEDIDA_SEMANAS = 4;

const CLAVE_TOTAL = 'litrosTotal';
const CLAVE_PROMEDIO_MEDIDO = 'promedioMedido';
const CLAVE_PROMEDIO_PROYECTADO = 'promedioProyectado';

const ETIQUETAS_SERIE: Record<string, string> = {
  [CLAVE_TOTAL]: 'Litros/día del hato',
  [CLAVE_PROMEDIO_MEDIDO]: 'Promedio L/vaca',
  [CLAVE_PROMEDIO_PROYECTADO]: 'Promedio proyectado',
};

interface PuntoTrackerGrafico {
  semana: number;
  etiqueta: string;
  tipo: 'medido' | 'proyectado';
  /** Total del hato -- una sola serie de barras para medido y proyectado
   * (se distinguen por relleno vía `<Cell>`), porque una barra por serie
   * dejaría un hueco de media columna en cada categoría. */
  litrosTotal: number | null;
  /** `null` cuando esta semana es proyectada (o viceversa) -- así cada
   * serie de Recharts solo dibuja su tramo, con `connectNulls={false}`
   * para no fabricar una conexión sobre una semana medida sin dato
   * (backlog, riesgo R-7). La semana 0 (última medida) se repite en AMBAS
   * columnas para que el tramo punteado arranque exactamente donde termina
   * el sólido, sin salto visual. */
  promedioMedido: number | null;
  promedioProyectado: number | null;
  vacasEntran: string[];
  vacasSalen: string[];
  planas: string[];
  /** Cuántas vacas aportaron a ESTA semana: las efectivamente pesadas si es
   * medida, las que realmente contribuyeron litros al pronóstico si es
   * proyectada. Es el denominador exacto del promedio graficado -- nunca
   * `vacasBase.length`, que en una semana proyectada es la lista completa
   * del horizonte (ver `SemanaProyeccion.vacasAportantes`). `0` cuando la
   * semana no tiene dato; el tooltip nunca lo muestra como "0 vacas". */
  nVacas: number;
}

/** Fecha calendario (ISO) de una semana desplazada `semanaOffset` semanas
 * respecto a `fechaReferencia` -- SOLO para rotular el eje X en fechas
 * absolutas (decisión 17), no es parte de la aritmética del motor (que
 * trabaja en offsets de semana, nunca en fechas calendario). Duplica la
 * fórmula de `sumarDias` (privada en `hatoProduccion.ts`, nunca exportada)
 * -- mismo criterio que `hatoUi.ts` documenta para `diasHastaFecha`. */
function fechaDeSemana(fechaReferencia: string, semanaOffset: number): string {
  const [anio, mes, dia] = fechaReferencia.split('-').map(Number);
  const d = new Date(Date.UTC(anio, mes - 1, dia));
  d.setUTCDate(d.getUTCDate() + semanaOffset * 7);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}

function TrackerTooltip({ active, payload }: { active?: boolean; payload?: Array<{ payload: PuntoTrackerGrafico }> }) {
  if (!active || !payload || payload.length === 0) return null;
  const punto = payload[0].payload;
  const promedio = punto.tipo === 'medido' ? punto.promedioMedido : punto.promedioProyectado;
  return (
    <div className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs shadow-sm max-w-xs">
      <p className="font-semibold text-gray-900 mb-1">
        {punto.etiqueta} · {punto.tipo === 'medido' ? 'Medido' : 'Proyectado'}
      </p>
      <p className="text-gray-700">
        {punto.litrosTotal != null ? `${formatNumber(punto.litrosTotal)} L/día del hato` : 'Sin dato'}
      </p>
      {promedio != null && (
        <p className="text-gray-700">
          {formatNumber(promedio, 1)} L/vaca/día
          {punto.nVacas > 0 && ` · ${punto.nVacas} vaca(s)`}
        </p>
      )}
      {punto.tipo === 'proyectado' && (punto.vacasEntran.length > 0 || punto.vacasSalen.length > 0 || punto.planas.length > 0) && (
        <div className="mt-1 pt-2 border-t border-gray-100 space-y-1 text-gray-500">
          {punto.vacasEntran.length > 0 && <p>+{punto.vacasEntran.length} vaca(s) entran (parto proyectado)</p>}
          {punto.vacasSalen.length > 0 && <p>−{punto.vacasSalen.length} vaca(s) salen (secado proyectado)</p>}
          {punto.planas.length > 0 && (
            <p>{punto.planas.length} vaca(s) proyectadas planas -- sin curva de referencia para su semana de lactancia</p>
          )}
        </div>
      )}
    </div>
  );
}

interface TrackerProductividadProps {
  pesajes: PesajeLecheVaca[];
  partos: Map<string, string>;
  estadosReproductivos: EstadoReproductivoProyeccion[];
  /** Ancla de las ventanas de cálculo (FIX 3, `docs/hato/qa-produccion-rework.md`)
   * -- el pesaje MÁS RECIENTE, `fechaAnclaProduccion`, NUNCA "hoy" literal.
   * `ProduccionView.tsx` es el único responsable de esa distinción. */
  fechaReferencia: string;
  /** Vejez del dato, calculada por el caller contra "hoy" REAL -- nunca se
   * recalcula aquí contra `fechaReferencia` (que ahora es el ancla, no
   * "hoy": comparar el último pesaje contra sí mismo siempre daría
   * `nivel: 'ok'`, perdiendo la señal de backlog que este chip existe para
   * comunicar). */
  vejez: VejezPesajes;
  loading: boolean;
  error: string | null;
}

export function TrackerProductividad({
  pesajes,
  partos,
  estadosReproductivos,
  fechaReferencia,
  vejez,
  loading,
  error,
}: TrackerProductividadProps) {
  const proyeccion = useMemo(() => {
    const curvaHato = curvaLactanciaHato(pesajes, partos);
    return proyectarHato({
      pesajes,
      partos,
      estadosReproductivos,
      curvaHato,
      fechaReferencia,
      horizonteSemanas: HORIZONTE_SEMANAS,
      ventanaMedidaSemanas: VENTANA_MEDIDA_SEMANAS,
    });
  }, [pesajes, partos, estadosReproductivos, fechaReferencia]);

  const puntos = useMemo<PuntoTrackerGrafico[]>(() => {
    return proyeccion.map((s) => {
      let etiqueta: string;
      if (s.tipo === 'medido') {
        etiqueta =
          vejez.nivel === 'critico'
            ? formatShortDate(fechaDeSemana(fechaReferencia, s.semana))
            : s.semana === 0
              ? 'Esta semana'
              : `${s.semana} sem`;
      } else {
        etiqueta = `+${s.semana} sem`;
      }
      const promedio = promedioLitrosPorVaca(s);
      return {
        semana: s.semana,
        etiqueta,
        tipo: s.tipo,
        litrosTotal: s.litrosDia,
        promedioMedido: s.tipo === 'medido' ? promedio : null,
        // La semana 0 alimenta TAMBIÉN la columna `promedioProyectado` --
        // es el punto de anclaje visual donde arranca el tramo punteado,
        // nunca un dato inventado (sigue siendo el mismo promedio medido).
        promedioProyectado: s.tipo === 'proyectado' ? promedio : s.semana === 0 ? promedio : null,
        vacasEntran: s.vacasEntran,
        vacasSalen: s.vacasSalen,
        planas: s.planas,
        nVacas: s.vacasAportantes.length,
      };
    });
  }, [proyeccion, vejez.nivel, fechaReferencia]);

  const hayDatos = puntos.some((p) => p.litrosTotal != null);

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className="mb-1">
        <h3 className="text-sm font-semibold text-gray-900">Tracker de productividad</h3>
        <p className="text-xs text-gray-500">
          Barras: litros/día del hato · Línea: promedio por vaca · {VENTANA_MEDIDA_SEMANAS} semanas medidas +{' '}
          {HORIZONTE_SEMANAS} proyectadas
        </p>
      </div>

      {loading ? (
        <div className="flex items-center py-8 text-sm text-gray-400">
          <Loader2 className="w-4 h-4 animate-spin mr-2" /> Cargando pesajes…
        </div>
      ) : error ? (
        <p className="text-sm text-red-600 py-4">{error}</p>
      ) : !hayDatos ? (
        <div className="text-center py-8">
          <TrendingUp className="w-8 h-8 text-gray-300 mx-auto mb-2" />
          <p className="text-sm text-gray-400">Sin pesajes suficientes para trazar el tracker.</p>
        </div>
      ) : (
        <div style={{ height: 260 }}>
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={puntos} margin={{ top: 8, right: 4, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
              <XAxis dataKey="etiqueta" tick={{ fontSize: 11 }} stroke="#9ca3af" />
              {/* Dos escalas obligatorias: el total del hato vive en cientos
                  de litros y el promedio por vaca en decenas -- en un solo
                  eje la línea quedaría aplastada contra el cero. */}
              <YAxis
                yAxisId="total"
                tick={{ fontSize: 11 }}
                stroke="#9ca3af"
                width={44}
                tickFormatter={(v: number) => formatNumber(v)}
              />
              <YAxis
                yAxisId="promedio"
                orientation="right"
                tick={{ fontSize: 11 }}
                stroke="#9ca3af"
                width={36}
                tickFormatter={(v: number) => formatNumber(v)}
              />
              <Tooltip content={<TrackerTooltip />} cursor={{ fill: 'rgba(115, 153, 28, 0.06)' }} />
              <Legend formatter={(value: string) => ETIQUETAS_SERIE[value] ?? value} wrapperStyle={{ fontSize: 11 }} />
              {/* `fill` en la <Bar> (además del de cada <Cell>) es lo que
                  pinta el cuadrito de la LEYENDA: sin él Recharts no tiene
                  color de serie y lo dibuja negro. Los <Cell> siguen
                  mandando en cada barra. */}
              <Bar
                yAxisId="total"
                dataKey={CLAVE_TOTAL}
                name={CLAVE_TOTAL}
                fill={COLOR_MEDIDO}
                radius={[4, 4, 0, 0]}
                isAnimationActive={false}
              >
                {puntos.map((p) => (
                  <Cell
                    key={p.semana}
                    fill={p.tipo === 'medido' ? COLOR_MEDIDO : COLOR_PROYECTADO}
                    stroke={p.tipo === 'proyectado' ? COLOR_MEDIDO : undefined}
                    strokeDasharray={p.tipo === 'proyectado' ? '4 3' : undefined}
                  />
                ))}
              </Bar>
              <Line
                yAxisId="promedio"
                type="monotone"
                dataKey={CLAVE_PROMEDIO_MEDIDO}
                name={CLAVE_PROMEDIO_MEDIDO}
                stroke={COLOR_PROMEDIO}
                strokeWidth={2}
                dot={{ r: 3 }}
                connectNulls={false}
                isAnimationActive={false}
              />
              <Line
                yAxisId="promedio"
                type="monotone"
                dataKey={CLAVE_PROMEDIO_PROYECTADO}
                name={CLAVE_PROMEDIO_PROYECTADO}
                stroke={COLOR_PROMEDIO}
                strokeWidth={2}
                strokeDasharray="5 4"
                dot={{ r: 3 }}
                connectNulls={false}
                isAnimationActive={false}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
