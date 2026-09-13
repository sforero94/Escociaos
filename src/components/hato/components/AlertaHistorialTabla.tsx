// ARCHIVO: components/hato/components/AlertaHistorialTabla.tsx
// DESCRIPCIÓN: Tabla compacta de alertas Completadas, mismo lenguaje
// visual que el Snapshot de monitoreo (fila densa, overflow-x, sin cards).

import { LABEL_TIPO_ALERTA_HATO, etiquetaIdentidadAlerta } from '@/utils/hatoAlertasUi';
import { etiquetaResultadoHistorial } from '@/utils/hatoAlertasGestor';
import { formatearFecha } from '@/utils/fechas';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
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
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Fecha</TableHead>
          <TableHead>Tipo</TableHead>
          <TableHead>Animal</TableHead>
          <TableHead>Resultado</TableHead>
          <TableHead>Por</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody striped>
        {alertas.map((alerta) => (
          <TableRow key={alerta.id}>
            <TableCell className="whitespace-nowrap">{formatearFecha(alerta.fecha_programada)}</TableCell>
            <TableCell>{LABEL_TIPO_ALERTA_HATO[alerta.tipo]}</TableCell>
            <TableCell>{identidad(alerta)}</TableCell>
            <TableCell>{etiquetaResultadoHistorial(alerta)}</TableCell>
            <TableCell className="text-gray-600">{alerta.respondida_por || '—'}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
