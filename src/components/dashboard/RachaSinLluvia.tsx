import { Umbrella } from 'lucide-react';
import type { RachaSinLluvia as RachaSinLluviaDatos } from '@/utils/calculosClima';
import { formatearMm } from './FranjaLluvia';
import { formatearFechaCorta } from '@/utils/fechas';

interface RachaSinLluviaProps {
  racha: RachaSinLluviaDatos;
  umbralMm: number;
}

/**
 * Racha de días sin lluvia material (umbral en `UMBRAL_LLUVIA_MATERIAL_MM`,
 * `calculosClima.ts`).
 *
 * El conteo NO se corta ante un día sin dato — ver la decisión documentada en
 * `calcularRachaSinLluvia`. Si el tramo contiene días sin valor confiable se
 * dice, pero en gris y chico: es una nota al pie del número, no una alarma.
 * La versión anterior ponía un párrafo naranja que competía visualmente con el
 * dato y además reportaba un número 7 veces menor al real.
 */
export function RachaSinLluvia({ racha, umbralMm }: RachaSinLluviaProps) {
  if (racha.dias === 0 && !racha.ultimaLluviaFecha) return null;

  return (
    <div className="pt-3 border-t border-gray-100 flex items-baseline gap-2">
      <Umbrella className="w-3.5 h-3.5 text-brand-brown/40 shrink-0 self-center" aria-hidden="true" />
      <p className="text-xs text-foreground">
        <span className="font-medium">{racha.dias}</span> días sin lluvia ≥{formatearMm(umbralMm)}
        {racha.ultimaLluviaFecha && racha.ultimaLluviaMm !== null && (
          <span className="text-brand-brown/60">
            {' '}· última: {formatearMm(racha.ultimaLluviaMm)} el {formatearFechaCorta(racha.ultimaLluviaFecha)}
          </span>
        )}
        {racha.diasSinConfirmar > 0 && (
          <span className="text-brand-brown/40">
            {' '}({racha.diasSinConfirmar} sin dato)
          </span>
        )}
      </p>
    </div>
  );
}
