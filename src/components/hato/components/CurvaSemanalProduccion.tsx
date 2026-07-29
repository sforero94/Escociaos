// ARCHIVO: components/hato/components/CurvaSemanalProduccion.tsx
// DESCRIPCIÓN: Curva SEMANAL de producción de UNA vaca -- reemplaza a
// `CurvaProduccionLeche.tsx` (PL por chequeo, bimestral) como curva
// PRINCIPAL de la Hoja de Vida (decisión 9 del dueño, plan
// `docs/plan_hato_produccion_rework.md` §4.4/§6 SOW 5): `hato_pesajes_leche`
// (semanal) sustituye a `hato_chequeo_vacas.pl` como fuente. Eje X =
// SEMANAS DESDE EL ÚLTIMO PARTO (decisión 11) -- `curvaVaca`
// (`hatoProduccion.ts`, SOW 2) hace TODA la aritmética; este componente
// solo consulta (vía props) y renderiza.
//
// Fallback OBLIGATORIO (decisión 11: "las vacas sin fecha de parto usable
// igual deben ser visibles"): sin parto conocido se grafica en eje
// CALENDARIO (fecha real), rotulado explícito "sin parto de referencia" --
// NUNCA se le imputa una fecha de parto a la vaca para poder alinearla
// (mismo error de clase que el contador de lluvia congelado, migración 068).

import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { formatNumber, formatShortDate } from '@/utils/format';
import { curvaVaca, type PesajeLecheVaca } from '@/utils/hatoProduccion';

const COLOR_LINEA = '#73991C'; // --primary -- hex directo, `stroke` de SVG dentro del canvas de Recharts (CLAUDE.md R4)

interface PuntoCurvaSemanal {
  eje: number | string;
  litros: number;
}

interface CurvaSemanalProduccionProps {
  pesajes: PesajeLecheVaca[];
  /** `null` cuando la vaca no tiene un parto usable -- fuerza el fallback
   * de eje calendario (decisión 11). NUNCA se sustituye por una fecha
   * inventada. */
  fechaUltimoParto: string | null;
}

export function CurvaSemanalProduccion({ pesajes, fechaUltimoParto }: CurvaSemanalProduccionProps) {
  const conParto = fechaUltimoParto != null;

  const puntos: PuntoCurvaSemanal[] = conParto
    ? curvaVaca(pesajes, fechaUltimoParto as string).map((p) => ({ eje: p.semana, litros: p.litros }))
    : [...pesajes]
        .sort((a, b) => (a.fecha > b.fecha ? 1 : a.fecha < b.fecha ? -1 : 0))
        .map((p) => ({ eje: p.fecha, litros: p.litros_total }));

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <h2 className="text-sm font-semibold text-gray-900 mb-1">Curva de producción (semanal)</h2>
      <p className="text-xs text-gray-500 mb-4">
        {conParto
          ? 'Semanas desde el último parto -- pesaje semanal'
          : 'Sin parto de referencia -- eje calendario (pesaje semanal)'}
      </p>
      {puntos.length < 2 ? (
        <p className="text-sm text-gray-500">Sin datos suficientes.</p>
      ) : (
        <div style={{ height: 220 }}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={puntos} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
              <XAxis
                dataKey="eje"
                tickFormatter={(v: number | string) => (conParto ? `S${v}` : formatShortDate(String(v)))}
                tick={{ fontSize: 11 }}
                stroke="#9ca3af"
              />
              <YAxis tick={{ fontSize: 11 }} stroke="#9ca3af" width={36} />
              <Tooltip
                contentStyle={{ backgroundColor: '#fff', border: '1px solid #e5e7eb', borderRadius: '0.5rem' }}
                labelFormatter={(v: number | string) => (conParto ? `Semana ${v}` : formatShortDate(String(v)))}
                formatter={(value: number) => [`${formatNumber(value, 1)} L`, 'Litros']}
              />
              <Line
                type="monotone"
                dataKey="litros"
                stroke={COLOR_LINEA}
                strokeWidth={2}
                dot={{ r: 3 }}
                activeDot={{ r: 5 }}
                connectNulls={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
