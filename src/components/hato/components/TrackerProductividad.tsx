// ARCHIVO: components/hato/components/TrackerProductividad.tsx
// DESCRIPCIÓN: Bloque 1 del tablero de Producción -- "Tracker de
// productividad" (decisión 13 del dueño, plan
// `docs/plan_hato_produccion_rework.md` §4.2c/§4.3, SOW 5): últimas 4
// semanas MEDIDAS (línea sólida) + 2 semanas PROYECTADAS bottom-up (línea
// punteada), en LITROS/DÍA DEL HATO -- nunca litros/quincena (trampa de
// unidades, riesgo R-4: ver la cabecera de `hatoProduccion.ts`, el mismo
// motor que hace TODA la aritmética de este componente vía `proyectarHato`/
// `curvaLactanciaHato`/`vejezPesajes`). Este archivo solo consulta (vía
// props, ya resueltas por `useDatosProduccionPorVaca`) y renderiza.
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
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { Loader2, TrendingUp } from 'lucide-react';
import { formatNumber, formatShortDate } from '@/utils/format';
import {
  curvaLactanciaHato,
  proyectarHato,
  rangoVacasMedidas,
  type PesajeLecheVaca,
  type EstadoReproductivoProyeccion,
  type VejezPesajes,
} from '@/utils/hatoProduccion';

const COLOR_LINEA = '#73991C'; // --primary -- hex directo, es un `stroke` de SVG dentro del canvas de Recharts (CLAUDE.md R4)
const HORIZONTE_SEMANAS = 2;
const VENTANA_MEDIDA_SEMANAS = 4;

interface PuntoTrackerGrafico {
  semana: number;
  etiqueta: string;
  tipo: 'medido' | 'proyectado';
  /** `null` cuando esta semana es proyectada (o viceversa) -- así cada
   * serie de Recharts solo dibuja su tramo, con `connectNulls={false}`
   * para no fabricar una conexión sobre una semana medida sin dato
   * (backlog, riesgo R-7). La semana 0 (última medida) se repite en AMBAS
   * columnas para que la línea punteada arranque exactamente donde termina
   * la sólida, sin salto visual. */
  medido: number | null;
  proyectado: number | null;
  vacasEntran: string[];
  vacasSalen: string[];
  planas: string[];
  /** Cuántas vacas aportaron pesaje a ESTA semana medida (FIX 4, §5.2
   * "COBERTURA DE PESAJE INCOMPLETA") -- declara el denominador que el
   * total crudo del hato esconde, el mismo dato que ya se muestra para
   * las semanas proyectadas (entran/salen/planas). `0` en semanas
   * proyectadas -- no aplica, el tooltip solo lo muestra para `medido`. */
  nVacasMedido: number;
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
  const valor = punto.tipo === 'medido' ? punto.medido : punto.proyectado;
  return (
    <div className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs shadow-sm max-w-xs">
      <p className="font-semibold text-gray-900 mb-1">
        {punto.etiqueta} · {punto.tipo === 'medido' ? 'Medido' : 'Proyectado'}
      </p>
      <p className="text-gray-700">{valor != null ? `${formatNumber(valor)} L/día` : 'Sin dato'}</p>
      {punto.tipo === 'medido' && punto.nVacasMedido > 0 && (
        <p className="text-gray-500 mt-1">{punto.nVacasMedido} vaca(s) pesadas esta semana</p>
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
      return {
        semana: s.semana,
        etiqueta,
        tipo: s.tipo,
        medido: s.tipo === 'medido' ? s.litrosDia : null,
        // La semana 0 alimenta TAMBIÉN la columna `proyectado` -- es el
        // punto de anclaje visual donde arranca la línea punteada, nunca
        // un dato inventado (sigue siendo el mismo `litrosDia` medido).
        proyectado: s.tipo === 'proyectado' ? s.litrosDia : s.semana === 0 ? s.litrosDia : null,
        vacasEntran: s.vacasEntran,
        vacasSalen: s.vacasSalen,
        planas: s.planas,
        nVacasMedido: s.tipo === 'medido' ? s.vacasBase.length : 0,
      };
    });
  }, [proyeccion, vejez.nivel, fechaReferencia]);

  const hayDatos = puntos.some((p) => p.medido != null || p.proyectado != null);

  // FIX 4 (§5.2 "COBERTURA DE PESAJE INCOMPLETA"): el total crudo del hato
  // es consistente en unidades, pero esconde un denominador que se mueve
  // (20 vacas en marzo, 28 en junio 2026 -- ~34% del salto de la serie era
  // más vacas pesadas, no más leche por vaca). Solo se muestra un sub-label
  // VISIBLE cuando la cobertura VARÍA en la ventana visible -- una
  // cobertura constante no necesita advertencia.
  const rangoCobertura = useMemo(() => rangoVacasMedidas(proyeccion), [proyeccion]);
  const coberturaVaria = rangoCobertura !== null && rangoCobertura.min !== rangoCobertura.max;

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className="mb-1">
        <h3 className="text-sm font-semibold text-gray-900">Tracker de productividad</h3>
        <p className="text-xs text-gray-500">
          Litros/día del hato · {VENTANA_MEDIDA_SEMANAS} semanas medidas + {HORIZONTE_SEMANAS} proyectadas
        </p>
        {coberturaVaria && rangoCobertura && (
          <p className="text-xs text-amber-600 mt-0.5">
            {rangoCobertura.min}–{rangoCobertura.max} vacas pesadas en la ventana -- el total no es comparable 1:1 entre semanas
          </p>
        )}
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
            <LineChart data={puntos} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
              <XAxis dataKey="etiqueta" tick={{ fontSize: 11 }} stroke="#9ca3af" />
              <YAxis tick={{ fontSize: 11 }} stroke="#9ca3af" width={44} tickFormatter={(v: number) => formatNumber(v)} />
              <Tooltip content={<TrackerTooltip />} />
              <Legend
                formatter={(value: string) => (value === 'medido' ? 'Medido' : 'Proyectado')}
                wrapperStyle={{ fontSize: 11 }}
              />
              <Line
                type="monotone"
                dataKey="medido"
                name="medido"
                stroke={COLOR_LINEA}
                strokeWidth={2}
                dot={{ r: 3 }}
                connectNulls={false}
                isAnimationActive={false}
              />
              <Line
                type="monotone"
                dataKey="proyectado"
                name="proyectado"
                stroke={COLOR_LINEA}
                strokeWidth={2}
                strokeDasharray="5 4"
                dot={{ r: 3 }}
                connectNulls={false}
                isAnimationActive={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
