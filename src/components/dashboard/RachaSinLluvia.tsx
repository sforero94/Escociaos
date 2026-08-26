import { Umbrella } from 'lucide-react';
import type { RachaSinLluvia as RachaSinLluviaDatos } from '@/utils/calculosClima';
import { formatearMm } from './FranjaLluvia';
import { formatearFechaCorta } from '@/utils/fechas';

interface RachaSinLluviaProps {
  racha: RachaSinLluviaDatos;
  umbralMm: number;
}

/**
 * Racha de días sin lluvia material (umbral configurable, `UMBRAL_LLUVIA_MATERIAL_MM`
 * en `calculosClima.ts`). Cuenta hacia atrás desde ayer -- nunca "hoy", cuyo
 * resumen todavía no existe. Si un día sin dato confiable corta el conteo
 * (contador congelado, cobertura parcial, o ninguna fila), lo dice
 * explícitamente en vez de mostrar un número que asumió en silencio que ese
 * día no llovió -- mismo principio que `FranjaLluvia`.
 */
export function RachaSinLluvia({ racha, umbralMm }: RachaSinLluviaProps) {
  if (racha.dias === 0 && !racha.ultimaLluviaFecha && !racha.cortadaPorFaltaDeDato) return null;

  return (
    <div className="pt-3 border-t border-gray-100 flex items-start gap-2">
      <Umbrella className="w-3.5 h-3.5 text-brand-brown/40 shrink-0 mt-0.5" aria-hidden="true" />
      <div className="text-xs">
        <p className="text-foreground">
          <span className="font-medium">{racha.dias}</span> días sin lluvia ≥{formatearMm(umbralMm)}
          {racha.ultimaLluviaFecha && racha.ultimaLluviaMm !== null && (
            <span className="text-brand-brown/60">
              {' '}· última: {formatearMm(racha.ultimaLluviaMm)} el {formatearFechaCorta(racha.ultimaLluviaFecha)}
            </span>
          )}
        </p>
        {racha.cortadaPorFaltaDeDato && (
          <p className="text-amber-600 mt-0.5">
            No se puede confirmar más atrás del {racha.fechaFaltaDeDato ? formatearFechaCorta(racha.fechaFaltaDeDato) : 'último día'} — falta dato confiable de lluvia ese día
          </p>
        )}
      </div>
    </div>
  );
}
