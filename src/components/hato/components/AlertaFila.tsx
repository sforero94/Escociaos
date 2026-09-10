// ARCHIVO: components/hato/components/AlertaFila.tsx
// DESCRIPCIÓN: Una fila de la cola de alertas (`AlertasView.tsx`, S6/V11 +
// issue #217). Muestra tipo + animal + fecha + estado + respuesta/intentos.
// Acciones: Sí / Todavía no / Otra cosa (parity Telegram) en estados
// abiertos; Confirmar en revisión semanal; Editar (cola only) y Descartar.
// El padre decide el gating (`canWrite`).

import { Loader2, Droplet, Syringe, Repeat, HelpCircle, Baby } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { EstadoChip } from './EstadoChip';
import { chipEstadoAlerta } from '@/utils/hatoUi';
import {
  LABEL_TIPO_ALERTA_HATO,
  chipRespuestaAlerta,
  etiquetaAlcanceHato,
} from '@/utils/hatoAlertasUi';
import type { AlertaHatoEnriquecida } from '../hooks/useHatoAlertas';
import { accionesAlertaFila } from '@/utils/hatoAlertasGestor';
import type { RespuestaAlertaHato, TipoAlertaHato } from '@/utils/hatoAlertas';
import { formatearFecha } from '@/utils/fechas';

/** Ícono por tipo de alerta (JSX -- vive en el componente, no en la lógica
 * pura de `hatoAlertasUi.ts`). Mismo set de íconos que `HatoDashboard.tsx`
 * para mantener el lenguaje visual del módulo. */
const ICONO_TIPO_ALERTA: Record<TipoAlertaHato, typeof Droplet> = {
  secado_due: Droplet,
  tratamiento_paso: Syringe,
  rechequeo_due: Repeat,
  servicio_sin_confirmacion: HelpCircle,
  parto_proximo: Baby,
};

function identidadAnimal(alerta: AlertaHatoEnriquecida): string {
  const { animalNumero, animalNombre, animalNumeroEsProvisional } = alerta;

  // Alerta DE HATO (`rechequeo_due` desde 2026-09-08): no cuelga de un animal,
  // así que "sin caravana" sería falso -- el alcance ES el grupo.
  if (alerta.animal_id === null) {
    const vacas = (alerta.datos as { vacas_count?: unknown } | null)?.vacas_count;
    return etiquetaAlcanceHato(typeof vacas === 'number' ? vacas : null);
  }

  if (animalNumero == null && !animalNombre) return 'sin caravana';

  const numeroTexto = animalNumero != null
    ? (animalNumeroEsProvisional ? `#${animalNumero} (provisional)` : `#${animalNumero}`)
    : 'sin caravana';

  if (animalNumeroEsProvisional || animalNumero == null) {
    // Nombre primero: el número no es (o no existe como) caravana física.
    return animalNombre ? `${animalNombre} · ${numeroTexto}` : numeroTexto;
  }
  return animalNombre ? `${numeroTexto} ${animalNombre}` : numeroTexto;
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
  onConfirmarRevision?: (id: string) => void;
  onEditar?: (alerta: AlertaHatoEnriquecida) => void;
  onDescartar?: (id: string) => void;
  /** T3a -- descarte masivo. Los tres vienen juntos: sin `onToggleSeleccion`
   * no se renderiza checkbox, ni siquiera si `seleccionable` es `true`. */
  seleccionable?: boolean;
  seleccionada?: boolean;
  onToggleSeleccion?: (id: string) => void;
}

export function AlertaFila({
  alerta,
  canWrite,
  actuando,
  onResponder,
  onConfirmarRevision,
  onEditar,
  onDescartar,
  seleccionable = false,
  seleccionada = false,
  onToggleSeleccion,
}: AlertaFilaProps) {
  const chipRespuesta = chipRespuestaAlerta(alerta.respuesta);
  const IconoTipo = ICONO_TIPO_ALERTA[alerta.tipo];
  const mostrarCheckbox = seleccionable && canWrite && !!onToggleSeleccion;
  const acciones = accionesAlertaFila(alerta.estado, canWrite);
  const nota = notaDeAlerta(alerta);
  const esManual = (alerta.datos as { origen?: unknown } | null)?.origen === 'manual';

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-start gap-3 min-w-0">
        {mostrarCheckbox && (
          <Checkbox
            checked={seleccionada}
            onCheckedChange={() => onToggleSeleccion?.(alerta.id)}
            aria-label={`Seleccionar alerta de ${identidadAnimal(alerta)}`}
            className="mt-1 flex-shrink-0"
          />
        )}
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2 mb-1">
            <IconoTipo className="w-4 h-4 text-gray-400 flex-shrink-0" aria-hidden="true" />
            <span className="text-sm font-semibold text-gray-900">{LABEL_TIPO_ALERTA_HATO[alerta.tipo]}</span>
            <EstadoChip chip={chipEstadoAlerta(alerta.estado)} />
            {chipRespuesta && <EstadoChip chip={chipRespuesta} />}
            {esManual && (
              <span className="text-[11px] uppercase tracking-wide text-gray-500 border border-gray-200 rounded px-1.5 py-0.5">
                Manual
              </span>
            )}
          </div>
          <p className="text-sm text-gray-600 truncate">{identidadAnimal(alerta)}</p>
          <p className="text-xs text-gray-500 mt-1">
            Programada: {formatearFecha(alerta.fecha_programada)}
            {alerta.intentos > 0 && ` · Intentos: ${alerta.intentos}`}
            {alerta.respondida_por && ` · Resuelta por: ${alerta.respondida_por}`}
          </p>
          {nota && <p className="text-xs text-gray-600 mt-1">Nota: {nota}</p>}
        </div>
      </div>

      {(acciones.responder || acciones.confirmarRevision || acciones.editar || acciones.descartar) && (
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
          {acciones.confirmarRevision && onConfirmarRevision && (
            <Button size="sm" disabled={actuando} onClick={() => onConfirmarRevision(alerta.id)}>
              {actuando ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Confirmar'}
            </Button>
          )}
          {acciones.editar && onEditar && (
            <Button size="sm" variant="outline" disabled={actuando} onClick={() => onEditar(alerta)}>
              Editar
            </Button>
          )}
          {acciones.descartar && onDescartar && (
            <Button size="sm" variant="outline" disabled={actuando} onClick={() => onDescartar(alerta.id)}>
              Descartar
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
