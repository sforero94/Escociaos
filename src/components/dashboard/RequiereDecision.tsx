import { CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ConfirmarPendienteDialog } from '@/components/ganado/components/ConfirmarPendienteDialog';
import type { FilaRequiereDecision, UseRequiereDecisionResultado } from './hooks/useRequiereDecision';

/**
 * Bloque "Requiere tu decisión" del Tablero General (bloque 1 del Centro de
 * Control, `docs/plan_dashboard_centro_control.md` §4/§9.2). Va primero en
 * la pantalla porque es lo único irreemplazable: lo único que espera una
 * decisión del lector.
 *
 * Tarjeta blanca con filas -- cada fila lleva una barra vertical de
 * severidad a la izquierda (roja = crítica, ámbar = atención), un título en
 * negrita, una línea de contexto en gris, y a la derecha uno o dos botones.
 * Vacía, colapsa a una sola línea verde con check (mismo tratamiento que el
 * bloque "Acciones recomendadas" cuando no hay nada -- §9.2).
 *
 * Recibe el resultado de `useRequiereDecision` YA calculado por el llamador
 * (nunca llama al hook aquí adentro): la barra de estado (bloque 0) necesita
 * el mismo `totalFilas` por prop, y si cada bloque llamara al hook por su
 * cuenta se duplicaría la consulta.
 */

export interface RequiereDecisionProps {
  resultado: UseRequiereDecisionResultado;
}

const BARRA_SEVERIDAD: Record<FilaRequiereDecision['severidad'], string> = {
  alta: 'border-l-4 border-destructive',
  media: 'border-l-4 border-warning',
};

function FilaDecisionRow({ fila }: { fila: FilaRequiereDecision }) {
  const tieneBotones = !!(fila.botonPrimario || fila.botonSecundario);

  return (
    <div className={`flex flex-col gap-3 bg-white p-4 lg:flex-row lg:items-center lg:justify-between ${BARRA_SEVERIDAD[fila.severidad]}`}>
      <div className="min-w-0 flex-1">
        <p className="text-base font-bold text-foreground lg:text-sm">{fila.titulo}</p>
        <p className="mt-0.5 text-sm text-brand-brown/60">{fila.contexto}</p>
      </div>
      {tieneBotones && (
        <div className="flex flex-col-reverse gap-2 lg:flex-shrink-0 lg:flex-row lg:items-center">
          {fila.botonSecundario && (
            <Button type="button" size="sm" variant="ghost" onClick={fila.botonSecundario.onClick} className="w-full lg:w-auto">
              {fila.botonSecundario.etiqueta}
            </Button>
          )}
          {fila.botonPrimario && (
            <Button type="button" size="sm" onClick={fila.botonPrimario.onClick} className="w-full lg:w-auto">
              {fila.botonPrimario.etiqueta}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

export function RequiereDecision({ resultado }: RequiereDecisionProps) {
  const { cargando, filas, errores, dialogoGanado, cerrarDialogoGanado, recargar } = resultado;

  // Cargando (primera vuelta, sin nada todavía): skeleton del tamaño final
  // de una fila -- nunca un spinner de pantalla completa (§9.1). El bloque 1
  // es el que tiene que pintar primero; reservar su forma evita el salto de
  // layout cuando llegue el dato real.
  if (cargando && filas.length === 0 && errores.length === 0) {
    return (
      <section className="space-y-3">
        <h2 className="text-xl text-foreground">Requiere tu decisión</h2>
        <div className="animate-pulse rounded-xl border border-primary/10 bg-white p-4 shadow-sm">
          <div className="h-4 w-2/3 rounded bg-gray-200" />
          <div className="mt-2 h-3 w-1/2 rounded bg-gray-100" />
        </div>
      </section>
    );
  }

  const vacio = filas.length === 0 && errores.length === 0;

  return (
    <section className="space-y-3">
      <h2 className="text-xl text-foreground">Requiere tu decisión</h2>

      {vacio ? (
        <p className="flex items-center gap-2 text-sm text-primary">
          <CheckCircle2 className="w-4 h-4 flex-shrink-0" aria-hidden="true" />
          Nada pendiente de ti
        </p>
      ) : (
        <div className="divide-y divide-gray-100 overflow-hidden rounded-xl border border-primary/10 bg-white shadow-sm">
          {filas.map((fila) => (
            <FilaDecisionRow key={fila.id} fila={fila} />
          ))}
          {errores.map((error) => (
            <div key={error.fuente} className="p-4 text-sm text-brand-brown/60">
              {error.mensaje}
            </div>
          ))}
        </div>
      )}

      <ConfirmarPendienteDialog
        open={!!dialogoGanado}
        onOpenChange={(open) => {
          if (!open) cerrarDialogoGanado();
        }}
        movimiento={dialogoGanado?.movimiento ?? null}
        fincas={dialogoGanado?.fincas ?? []}
        potreros={dialogoGanado?.potreros ?? []}
        onSuccess={recargar}
      />
    </section>
  );
}
