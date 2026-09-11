// ARCHIVO: components/hato/components/AlertaGrupoInformativo.tsx
// DESCRIPCIÓN: Bloque informativo de Rechequeo o Parto próximo. Muestra
// el conteo y los nombres. Sin botones: el chequeo y el parto van en
// calendario, no piden Sí / Todavía no.

import {
  formatearNombreVacaAlerta,
  type GrupoInformativoAlerta,
} from '@/utils/hatoAlertasGestor';
import { etiquetaAlcanceHato } from '@/utils/hatoAlertasUi';
import { formatearFecha } from '@/utils/fechas';

export function AlertaGrupoInformativo({
  grupo,
}: {
  grupo: GrupoInformativoAlerta;
}) {
  const alcance = etiquetaAlcanceHato(grupo.nombres.length);

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4">
      <p className="text-sm font-semibold text-gray-900">{alcance}</p>
      <p className="text-xs text-gray-500 mt-0.5">
        {formatearFecha(grupo.fecha)}
        {grupo.detalle ? ` · ${grupo.detalle}` : ''}
      </p>
      {grupo.nombres.length === 0 ? (
        <p className="text-sm text-gray-500 mt-3">Sin nombres en esta alerta.</p>
      ) : (
        <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1">
          {grupo.nombres.map((vaca, i) => (
            <li key={vaca.animal_id ?? `${vaca.numero ?? 'x'}-${i}`} className="text-sm text-gray-700">
              {formatearNombreVacaAlerta(vaca)}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
