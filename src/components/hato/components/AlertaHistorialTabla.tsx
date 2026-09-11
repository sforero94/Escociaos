// ARCHIVO: components/hato/components/AlertaHistorialTabla.tsx
// DESCRIPCIÓN: Tabla compacta de alertas Completadas, mismo lenguaje
// visual que el Snapshot de monitoreo (fila densa, overflow-x, sin cards).

import { LABEL_TIPO_ALERTA_HATO, etiquetaIdentidadAlerta } from '@/utils/hatoAlertasUi';
import { etiquetaResultadoHistorial } from '@/utils/hatoAlertasGestor';
import { formatearFecha } from '@/utils/fechas';
import type { AlertaHatoEnriquecida } from '../hooks/useHatoAlertas';

function identidad(alerta: AlertaHatoEnriquecida): string {
  const vacas = (alerta.datos as { vacas_count?: unknown } | null)?.vacas_count;
  return etiquetaIdentidadAlerta({
    animal_id: alerta.animal_id,
    animalNumero: alerta.animalNumero,
    animalNombre: alerta.animalNombre,
    animalNumeroEsProvisional: alerta.animalNumeroEsProvisional,
    vacasCount: typeof vacas === 'number' ? vacas : null,
  });
}

export function AlertaHistorialTabla({ alertas }: { alertas: AlertaHatoEnriquecida[] }) {
  if (alertas.length === 0) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white px-4 py-8 text-center text-sm text-gray-500">
        Todavía no hay alertas completadas.
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-left text-brand-brown/60">
            <th className="py-2 px-3">Fecha</th>
            <th className="py-2 px-3">Tipo</th>
            <th className="py-2 px-3">Animal</th>
            <th className="py-2 px-3">Resultado</th>
            <th className="py-2 px-3">Por</th>
          </tr>
        </thead>
        <tbody>
          {alertas.map((alerta) => (
            <tr key={alerta.id} className="border-b hover:bg-muted/50">
              <td className="py-2 px-3 whitespace-nowrap">{formatearFecha(alerta.fecha_programada)}</td>
              <td className="py-2 px-3">{LABEL_TIPO_ALERTA_HATO[alerta.tipo]}</td>
              <td className="py-2 px-3">{identidad(alerta)}</td>
              <td className="py-2 px-3">{etiquetaResultadoHistorial(alerta)}</td>
              <td className="py-2 px-3 text-gray-600">{alerta.respondida_por || '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
