// ARCHIVO: components/hato/components/CurvaProduccionLeche.tsx
// DESCRIPCIÓN: Card "Curva de producción de leche (PL)" de la Hoja de Vida
// (Figma alignment spec §3). Usa la serie de PL que YA trae
// `detalle.chequeos` (`useHatoAnimal.ts`, cada item tiene `pl` +
// `chequeoFecha`) -- no dispara una consulta nueva. Rotulado honesto: es
// PL POR CHEQUEO (bimestral, irregular), no "últimas 10 semanas" como
// decía el mock de Figma -- el hato no se pesa cada semana por vaca fuera
// del pesaje quincenal del camión (S5). Con menos de 2 puntos no hay curva
// que trazar -- "Sin datos suficientes", nunca un gráfico vacío o con un
// solo punto engañoso.

import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { formatShortDate, formatNumber } from '@/utils/format';
import type { ChequeoHistorialItem } from '../hooks/useHatoAnimal';

interface PuntoPL {
  fecha: string;
  pl: number;
}

export function CurvaProduccionLeche({ chequeos }: { chequeos: ChequeoHistorialItem[] }) {
  const puntos: PuntoPL[] = chequeos
    .filter((c): c is ChequeoHistorialItem & { pl: number; chequeoFecha: string } => c.pl != null && !!c.chequeoFecha)
    .map((c) => ({ fecha: c.chequeoFecha, pl: c.pl }))
    .sort((a, b) => a.fecha.localeCompare(b.fecha));

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <h2 className="text-sm font-semibold text-gray-900 mb-1">Curva de producción de leche (PL)</h2>
      <p className="text-xs text-gray-500 mb-4">Por chequeo -- no es un promedio semanal</p>
      {puntos.length < 2 ? (
        <p className="text-sm text-gray-500">Sin datos suficientes.</p>
      ) : (
        // `h-[220px]` no está compilado en el build congelado de Tailwind
        // (verificado -- solo existen arbitrarios ya usados en otras
        // pantallas, como `h-[400px]`) -- se usa `style` directo en vez de
        // sumar un valor arbitrario más al build, ver CLAUDE.md "Caution
        // Zones".
        <div style={{ height: 220 }}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={puntos} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
              <XAxis dataKey="fecha" tickFormatter={(f: string) => formatShortDate(f)} tick={{ fontSize: 11 }} stroke="#9ca3af" />
              <YAxis tick={{ fontSize: 11 }} stroke="#9ca3af" width={36} />
              <Tooltip
                contentStyle={{ backgroundColor: '#fff', border: '1px solid #e5e7eb', borderRadius: '0.5rem' }}
                labelFormatter={(f) => formatShortDate(String(f))}
                formatter={(value: number) => [`${formatNumber(value, 1)} L`, 'PL']}
              />
              {/* #73991C == --chart-1 / --primary en globals.css -- ver spec §0/1. */}
              <Line type="monotone" dataKey="pl" stroke="#73991C" strokeWidth={2} dot={{ r: 3 }} activeDot={{ r: 5 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
