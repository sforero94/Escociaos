// ARCHIVO: components/hato/components/VacasPorEstadoCard.tsx
// DESCRIPCIÓN: Card "Vacas por estado" del Tablero (E3.3, rediseño de 3 ejes
// -- docs/hato/sesiones-b5-d7-e3.md, decisión del dueño 2026-07-24).
// Reemplaza la versión vieja de 5 categorías (`bucketsEstado`, un solo
// bloque de barras apiladas) por TRES barras horizontales independientes:
//
//   - Producción (nominal): Ordeño <-> Horro.
//   - Reproducción (nominal): Preñadas <-> Por servir.
//   - Etapa (totaliza el inventario activo): Vacas · Novillas · Terneras.
//
// "Nominal" = las dos primeras barras NO tienen que sumar el hato completo
// (Producción excluye novillas/terneras; Reproducción además excluye
// `servida`, que a propósito no es "preñada" ni "por servir todavía" --
// sigue apareciendo en `HatoReproCard`, ver esa cabecera). La de Etapa SÍ
// suma el inventario activo completo -- a diferencia del panel viejo, que
// excluía terneras por completo.
//
// Puramente presentacional: recibe los conteos YA derivados de
// `categoria`/`derivado.estado` en `HatoDashboard.tsx` -- no filtra ni
// clasifica ningún animal aquí (mismo contrato que `HatoReproCard`). La
// aritmética de porcentajes vive en `utils/hatoVacasPorEstado.ts` (pura,
// tested) -- este archivo solo la compone con el layout.
//
// El ASCII del doc de diseño muestra un hueco entre los dos segmentos de
// cada barra nominal. Aquí se usa una barra continua de dos colores (sin
// hueco): el hueco del ASCII es ilustrativo, no un tercer valor de escala, y
// una barra continua es más calmada/legible (baseline de diseño, "tie-break
// hacia lo más calmado").
//
// Color: cada eje cuenta una historia DISTINTA, así que cada barra usa su
// propia familia de color para que se distingan de un vistazo (decisión del
// dueño 2026-07-24 -- revierte el alineamiento previo con la paleta de chips,
// que reusaba el mismo verde en las tres barras y las hacía ver como una sola
// historia):
//   - Producción (binaria): dos tonos de VERDE (ordeño / horro).
//   - Reproducción (binaria): dos tonos de CAFÉ (preñadas / por servir).
//   - Etapa (categórica, 3 grupos de ciclo de vida): tres tokens distintos --
//     verde oscuro / ámbar / café.
// TODOS los colores salen de la paleta del app (variables CSS de globals.css:
// --primary, --secondary, --brand-brown, --foreground, --warning) -- ningún
// hex hardcodeado. La paleta tiene un solo café, así que el segundo tono se
// deriva del MISMO token --brand-brown con color-mix: sigue siendo de la paleta.

import { formatNumber } from '@/utils/format';
import { calcularProporcionesDosValores, calcularProporcionesN } from '@/utils/hatoVacasPorEstado';

// Producción -- dos tonos de verde de la paleta
const ORDENO = 'var(--primary)';
const HORRO = 'var(--secondary)';
// Reproducción -- dos tonos de café (--brand-brown y una versión aclarada del mismo token)
const PRENADAS_COLOR = 'var(--brand-brown)';
const POR_SERVIR_COLOR = 'color-mix(in srgb, var(--brand-brown) 50%, white)';
// Etapa -- categórica: verde oscuro / ámbar / café (todos tokens de la paleta)
const ETAPA_VACAS = 'var(--foreground)';
const ETAPA_NOVILLAS = 'var(--warning)';
const ETAPA_TERNERAS = 'var(--brand-brown)';

interface BarraNominalProps {
  leftLabel: string;
  leftValue: number;
  leftColor: string;
  rightLabel: string;
  rightValue: number;
  rightColor: string;
}

function BarraNominal({ leftLabel, leftValue, leftColor, rightLabel, rightValue, rightColor }: BarraNominalProps) {
  const { pctA: pctLeft, pctB: pctRight } = calcularProporcionesDosValores(leftValue, rightValue);

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="min-w-[80px] flex-shrink-0 text-right text-xs font-medium text-gray-500">{leftLabel}</span>
      <span
        className="min-w-[2.5rem] flex-shrink-0 text-right text-sm font-semibold text-gray-900"
        style={{ fontVariantNumeric: 'tabular-nums' }}
      >
        {formatNumber(leftValue)}
      </span>
      <div className="h-2.5 min-w-[120px] flex-1 overflow-hidden rounded-full bg-gray-100">
        <div className="flex h-full">
          <div className="h-full" style={{ width: `${pctLeft}%`, backgroundColor: leftColor }} />
          <div className="h-full" style={{ width: `${pctRight}%`, backgroundColor: rightColor }} />
        </div>
      </div>
      <span
        className="min-w-[2.5rem] flex-shrink-0 text-sm font-semibold text-gray-900"
        style={{ fontVariantNumeric: 'tabular-nums' }}
      >
        {formatNumber(rightValue)}
      </span>
      <span className="min-w-[80px] flex-shrink-0 text-xs font-medium text-gray-500">{rightLabel}</span>
    </div>
  );
}

interface SegmentoEtapa {
  key: string;
  label: string;
  value: number;
  color: string;
}

function BarraEtapa({ vacas, novillas, terneras }: { vacas: number; novillas: number; terneras: number }) {
  const segmentos: SegmentoEtapa[] = [
    { key: 'vacas', label: 'Vacas', value: vacas, color: ETAPA_VACAS },
    { key: 'novillas', label: 'Novillas', value: novillas, color: ETAPA_NOVILLAS },
    { key: 'terneras', label: 'Terneras', value: terneras, color: ETAPA_TERNERAS },
  ];
  const pcts = calcularProporcionesN(segmentos.map((s) => s.value));
  const total = vacas + novillas + terneras;

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Etapa</p>
        <p className="text-xs text-gray-500">{formatNumber(total)} cabezas en total</p>
      </div>
      <div className="h-2.5 overflow-hidden rounded-full bg-gray-100">
        <div className="flex h-full">
          {segmentos.map((s, i) => (
            <div key={s.key} className="h-full" style={{ width: `${pcts[i]}%`, backgroundColor: s.color }} />
          ))}
        </div>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-4">
        {segmentos.map((s) => (
          <span key={s.key} className="inline-flex items-center gap-1.5 text-xs text-gray-600">
            <span className="h-2 w-2 flex-shrink-0 rounded-full" style={{ backgroundColor: s.color }} />
            {s.label}{' '}
            <span className="font-semibold text-gray-900" style={{ fontVariantNumeric: 'tabular-nums' }}>
              {formatNumber(s.value)}
            </span>
          </span>
        ))}
      </div>
    </div>
  );
}

export interface VacasPorEstadoCardProps {
  ordeno: number;
  horro: number;
  prenadas: number;
  porServir: number;
  vacas: number;
  novillas: number;
  terneras: number;
}

export function VacasPorEstadoCard({
  ordeno,
  horro,
  prenadas,
  porServir,
  vacas,
  novillas,
  terneras,
}: VacasPorEstadoCardProps) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <h3 className="mb-1 text-sm font-semibold text-gray-900">Vacas por estado</h3>
      <p className="mb-4 text-xs text-gray-500">
        Producción y reproducción son conteos puntuales (no suman el hato); Etapa sí totaliza el inventario activo.
      </p>
      <div className="space-y-3">
        <BarraNominal
          leftLabel="Ordeño"
          leftValue={ordeno}
          leftColor={ORDENO}
          rightLabel="Horro"
          rightValue={horro}
          rightColor={HORRO}
        />
        <BarraNominal
          leftLabel="Preñadas"
          leftValue={prenadas}
          leftColor={PRENADAS_COLOR}
          rightLabel="Por servir"
          rightValue={porServir}
          rightColor={POR_SERVIR_COLOR}
        />
      </div>
      <div className="mt-4 border-t border-gray-100 pt-4">
        <BarraEtapa vacas={vacas} novillas={novillas} terneras={terneras} />
      </div>
    </div>
  );
}
