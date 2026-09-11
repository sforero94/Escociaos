// ARCHIVO: components/hato/components/AlertaFila.tsx
// DESCRIPCIÓN: Una fila accionable de Alertas activas (issue #217).
// Tipo va en el subtítulo del padre. Rechequeo / parto próximo NO usan
// esta fila: son grupos informativos. Cinco botones en secado,
// tratamiento y servicio sin confirmar: Sí / Todavía no / Otra cosa /
// Editar / Descartar (rojo).

import { Loader2, Droplet, Syringe, Repeat, HelpCircle, Baby } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { etiquetaIdentidadAlerta } from '@/utils/hatoAlertasUi';
import type { AlertaHatoEnriquecida } from '../hooks/useHatoAlertas';
import { accionesAlertaFila } from '@/utils/hatoAlertasGestor';
import type { RespuestaAlertaHato, TipoAlertaHato } from '@/utils/hatoAlertas';
import { formatearFecha } from '@/utils/fechas';

const ICONO_TIPO_ALERTA: Record<TipoAlertaHato, typeof Droplet> = {
  secado_due: Droplet,
  tratamiento_paso: Syringe,
  rechequeo_due: Repeat,
  servicio_sin_confirmacion: HelpCircle,
  parto_proximo: Baby,
};

function identidadAnimal(alerta: AlertaHatoEnriquecida): string {
  const vacas = (alerta.datos as { vacas_count?: unknown } | null)?.vacas_count;
  return etiquetaIdentidadAlerta({
    animal_id: alerta.animal_id,
    animalNumero: alerta.animalNumero,
    animalNombre: alerta.animalNombre,
    animalNumeroEsProvisional: alerta.animalNumeroEsProvisional,
    vacasCount: typeof vacas === 'number' ? vacas : null,
  });
}

function notaDeAlerta(alerta: AlertaHatoEnriquecida): string | null {
  const datos = alerta.datos;
  if (!datos) return null;
  const gestor = datos.nota_gestor;
  const manual = datos.nota;
  if (typeof gestor === 'string' && gestor.trim()) return gestor.trim();
  if (typeof manual === 'string' && manual.trim()) return manual.trim();
  return null;
}

export interface AlertaFilaProps {
  alerta: AlertaHatoEnriquecida;
  canWrite: boolean;
  actuando: boolean;
  onResponder?: (id: string, respuesta: RespuestaAlertaHato) => void;
  onEditar?: (alerta: AlertaHatoEnriquecida) => void;
  onDescartar?: (id: string) => void;
}

export function AlertaFila({
  alerta,
  canWrite,
  actuando,
  onResponder,
  onEditar,
  onDescartar,
}: AlertaFilaProps) {
  const IconoTipo = ICONO_TIPO_ALERTA[alerta.tipo];
  const acciones = accionesAlertaFila(alerta.estado, canWrite, alerta.tipo);
  const nota = notaDeAlerta(alerta);
  const esManual = (alerta.datos as { origen?: unknown } | null)?.origen === 'manual';

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-start gap-3 min-w-0">
        <IconoTipo className="w-4 h-4 text-gray-400 flex-shrink-0 mt-0.5" aria-hidden="true" />
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2 mb-1">
            <p className="text-sm font-semibold text-gray-900">{identidadAnimal(alerta)}</p>
            {esManual && (
              <span className="text-[11px] uppercase tracking-wide text-gray-500 border border-gray-200 rounded px-1.5 py-0.5">
                Manual
              </span>
            )}
          </div>
          <p className="text-xs text-gray-500">
            Programada: {formatearFecha(alerta.fecha_programada)}
            {alerta.intentos > 0 && ` · Intentos: ${alerta.intentos}`}
          </p>
          {nota && <p className="text-xs text-gray-600 mt-1">Nota: {nota}</p>}
        </div>
      </div>

      {(acciones.responder || acciones.editar || acciones.descartar) && (
        <div className="flex flex-wrap gap-2 flex-shrink-0">
          {acciones.responder && onResponder && (
            <>
              <Button size="sm" disabled={actuando} onClick={() => onResponder(alerta.id, 'si')}>
                {actuando ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Sí'}
              </Button>
              <Button size="sm" variant="outline" disabled={actuando} onClick={() => onResponder(alerta.id, 'no')}>
                Todavía no
              </Button>
              <Button size="sm" variant="outline" disabled={actuando} onClick={() => onResponder(alerta.id, 'otro')}>
                Otra cosa
              </Button>
            </>
          )}
          {acciones.editar && onEditar && (
            <Button size="sm" variant="outline" disabled={actuando} onClick={() => onEditar(alerta)}>
              Editar
            </Button>
          )}
          {acciones.descartar && onDescartar && (
            <Button size="sm" variant="destructive" disabled={actuando} onClick={() => onDescartar(alerta.id)}>
              Descartar
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
