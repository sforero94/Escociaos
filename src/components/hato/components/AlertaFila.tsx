// ARCHIVO: components/hato/components/AlertaFila.tsx
// DESCRIPCIÓN: Una fila de la cola de alertas (`AlertasView.tsx`, S6/V11).
// Muestra tipo + animal + fecha + estado + respuesta/intentos, y expone
// acciones de cierre (confirmar/descartar) cuando `onConfirmar`/
// `onDescartar` vienen dados (gating de escritura decidido por el padre,
// mismo patrón que `GanadoMovimientos.tsx`).
//
// Regla de identidad (migración 066): el NOMBRE va primero cuando el número
// es provisional (800-999) o no existe -- Fernando lee la caravana física en
// el corral, y un número provisional no es esa caravana. Con número
// definitivo, número + nombre van juntos (plan §6 Épica C: "número +
// nombre siempre juntos").

import { Loader2, Droplet, Syringe, Repeat, HelpCircle, Baby } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { EstadoChip } from './EstadoChip';
import { chipEstadoAlerta } from '@/utils/hatoUi';
import {
  LABEL_TIPO_ALERTA_HATO,
  chipRespuestaAlerta,
  type EstadoAlertaHato,
  type TipoAlertaHato,
} from '@/utils/hatoAlertasUi';
import type { AlertaHatoEnriquecida } from '../hooks/useHatoAlertas';
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

export interface AlertaFilaProps {
  alerta: AlertaHatoEnriquecida;
  canWrite: boolean;
  actuando: boolean;
  onCambiarEstado?: (id: string, estado: EstadoAlertaHato) => void;
}

export function AlertaFila({ alerta, canWrite, actuando, onCambiarEstado }: AlertaFilaProps) {
  const chipRespuesta = chipRespuestaAlerta(alerta.respuesta);
  const puedeResolver = canWrite && (alerta.estado === 'respondida' || alerta.estado === 'escalada' || alerta.estado === 'expirada');
  const IconoTipo = ICONO_TIPO_ALERTA[alerta.tipo];

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2 mb-1">
          <IconoTipo className="w-4 h-4 text-gray-400 flex-shrink-0" aria-hidden="true" />
          <span className="text-sm font-semibold text-gray-900">{LABEL_TIPO_ALERTA_HATO[alerta.tipo]}</span>
          <EstadoChip chip={chipEstadoAlerta(alerta.estado)} />
          {chipRespuesta && <EstadoChip chip={chipRespuesta} />}
        </div>
        <p className="text-sm text-gray-600 truncate">{identidadAnimal(alerta)}</p>
        <p className="text-xs text-gray-500 mt-1">
          Programada: {formatearFecha(alerta.fecha_programada)}
          {alerta.intentos > 0 && ` · Intentos: ${alerta.intentos}`}
          {alerta.respondida_por && ` · Resuelta por: ${alerta.respondida_por}`}
        </p>
      </div>

      {puedeResolver && onCambiarEstado && (
        <div className="flex gap-2 flex-shrink-0">
          <Button
            size="sm"
            disabled={actuando}
            onClick={() => onCambiarEstado(alerta.id, 'confirmada')}
          >
            {actuando ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Confirmar'}
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={actuando}
            onClick={() => onCambiarEstado(alerta.id, 'descartada')}
          >
            Descartar
          </Button>
        </div>
      )}
    </div>
  );
}
