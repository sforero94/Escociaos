// ARCHIVO: components/inventory/rondas/ResumenDesenlacesChips.tsx
// DESCRIPCIÓN: Fila de conteos por desenlace -- usada en la lista de rondas
// (RondasList.tsx) y en la cabecera de agrupación del detalle
// (RondaDetalle.tsx). CA-10: nunca funde "sin ajuste" con "captura" con
// "ajuste"; los tres sub-estados de la familia ajuste (pendiente/aplicado/
// desestimado) se muestran cada uno con su propio chip, nunca sumados en un
// solo "N ajustes" que borraría la diferencia entre "Gerencia todavía no
// decidió" y "Gerencia ya asumió el ajuste".
//
// Un chip con conteo 0 no se oculta: mostrar "0 sin ajuste" es honesto (la
// ronda no tuvo ninguna de ese tipo); ocultarlo dejaría la fila con largo
// variable según qué desenlaces aparecieron, que es peor para escanear una
// lista de varias rondas.

import { ESTADO_EXCEPCION_INFO } from '@/utils/rondaInventarioUi';
import type { ResumenDesenlaces } from '@/utils/rondaInventarioUi';

interface ChipProps {
  etiqueta: string;
  conteo: number;
  className: string;
}

function Chip({ etiqueta, conteo, className }: ChipProps) {
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-xs font-medium border ${className}`}>
      <span className="tabular-nums">{conteo}</span>
      <span>{etiqueta}</span>
    </span>
  );
}

interface ResumenDesenlacesChipsProps {
  resumen: ResumenDesenlaces;
  /** Oculta "en curso" cuando el consumidor sólo quiere ver desenlaces cerrados. */
  ocultarEnCurso?: boolean;
}

export function ResumenDesenlacesChips({ resumen, ocultarEnCurso }: ResumenDesenlacesChipsProps) {
  return (
    <div className="flex flex-wrap gap-1.5">
      <Chip
        etiqueta="cerradas sin ajuste"
        conteo={resumen.sinAjuste}
        className={ESTADO_EXCEPCION_INFO.cerrada_sin_ajuste.badgeClassName}
      />
      <Chip
        etiqueta="resueltas con captura"
        conteo={resumen.captura}
        className={ESTADO_EXCEPCION_INFO.resuelta_con_captura.badgeClassName}
      />
      <Chip
        etiqueta="ajuste aprobado, pendiente"
        conteo={resumen.ajustePendiente}
        className={ESTADO_EXCEPCION_INFO.ajuste_aprobado.badgeClassName}
      />
      <Chip
        etiqueta="ajuste aplicado"
        conteo={resumen.ajusteAplicado}
        className={ESTADO_EXCEPCION_INFO.ajuste_aplicado.badgeClassName}
      />
      <Chip
        etiqueta="ajuste desestimado"
        conteo={resumen.ajusteDesestimado}
        className={ESTADO_EXCEPCION_INFO.ajuste_desestimado.badgeClassName}
      />
      {!ocultarEnCurso && (
        <Chip etiqueta="en curso" conteo={resumen.enCurso} className="bg-gray-50 text-gray-500 border-gray-200" />
      )}
    </div>
  );
}
