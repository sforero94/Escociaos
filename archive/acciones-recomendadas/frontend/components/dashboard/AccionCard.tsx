import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import type { NegocioAccion } from '@/utils/accionesTipos';
import type { AccionParaMostrar } from '@/types/acciones';

/**
 * Tarjeta de un negocio dentro del bloque "Acciones recomendadas"
 * (`docs/plan_dashboard_centro_control.md` §9.2, "Tarjeta de negocio").
 *
 * Diseño ya aprobado y maquetado por el dueño -- no se rediseña aquí. Lo que
 * NO puede tener, y es la parte que más se equivoca: sin punto de color de
 * prioridad, sin borde de alerta, sin fondo teñido. Ese lenguaje pertenece
 * al bloque "Requiere tu decisión"; teñir una sugerencia igual borra la
 * distinción que el tablero entero intenta construir. La frase manda y la
 * evidencia susurra.
 */

const ETIQUETA_NEGOCIO_VACIO: Record<NegocioAccion, string> = {
  hato_lechero: 'el hato',
  aguacate: 'aguacate',
  ganado: 'ganado',
};

/** Envuelve las cifras de una línea de evidencia en `font-medium` para que
 *  se distingan del texto que las rodea (§9.2: "la cifra en font-medium").
 *  Sólo estilo -- el texto en sí ya salió íntegro del data layer
 *  (`hecho.texto`, nunca tocado por el modelo, R-2). Split puro, sin
 *  `dangerouslySetInnerHTML`: React escapa cada fragmento igual que
 *  cualquier otro texto. */
function resaltarCifras(texto: string): React.ReactNode[] {
  const partes = texto.split(/(\$?\d[\d.,]*\s?%?)/g);
  return partes.map((parte, i) =>
    /^\$?\d/.test(parte) ? (
      <span key={i} className="font-medium text-foreground">
        {parte}
      </span>
    ) : (
      <span key={i}>{parte}</span>
    ),
  );
}

interface AccionItemProps {
  accion: AccionParaMostrar;
  conBorde: boolean;
  onDescartar: (accion: AccionParaMostrar) => void | Promise<void>;
}

function AccionItem({ accion, conBorde, onDescartar }: AccionItemProps) {
  const navigate = useNavigate();
  const [evidenciaExpandida, setEvidenciaExpandida] = useState(false);
  const [descartando, setDescartando] = useState(false);

  const handleDescartar = async () => {
    setDescartando(true);
    try {
      await onDescartar(accion);
      // Si `onDescartar` resuelve, el padre ya quitó esta acción de la lista
      // (optimista) -- este componente se desmonta y no hace falta más
      // estado local.
    } catch {
      setDescartando(false);
    }
  };

  return (
    <div className={`py-3 ${conBorde ? 'border-t border-gray-100' : ''} ${descartando ? 'opacity-40' : ''}`}>
      {/* Frase: una sola línea en escritorio (§4.2 del plan: "si no cabe, se
          acorta la frase, no se envuelve"). Verbo primero. */}
      <p className="text-base lg:text-sm font-medium text-foreground lg:truncate">{accion.frase}</p>

      {accion.evidencia.length > 0 && (
        <div className="mt-1 space-y-0.5">
          {accion.evidencia.map((linea, i) => (
            <p
              key={i}
              className={`text-xs text-brand-brown/70 ${i > 0 && !evidenciaExpandida ? 'hidden lg:block' : ''}`}
            >
              · {resaltarCifras(linea)}
            </p>
          ))}
          {accion.evidencia.length > 1 && (
            <button
              type="button"
              onClick={() => setEvidenciaExpandida((v) => !v)}
              className="lg:hidden text-xs text-primary underline underline-offset-2"
            >
              {evidenciaExpandida ? 'ocultar evidencia' : 'ver evidencia'}
            </button>
          )}
        </div>
      )}

      <div className="mt-2 flex flex-col-reverse lg:flex-row lg:items-center lg:justify-end gap-2">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={handleDescartar}
          disabled={descartando}
          className="self-start text-xs text-brand-brown/60 hover:text-brand-brown"
        >
          No es útil
        </Button>
        <Button type="button" size="sm" onClick={() => navigate(accion.boton.ruta)} className="w-full lg:w-auto">
          {accion.boton.etiqueta}
        </Button>
      </div>
    </div>
  );
}

export interface AccionCardProps {
  negocio: NegocioAccion;
  /** Etiqueta visible -- idéntica a la de la tarjeta de pulso correspondiente
   *  (§9.2: "idéntica a la de la tarjeta de pulso correspondiente"). */
  etiqueta: string;
  /** 0 a 3 acciones, ya cotejadas y en el orden que fijó `ordenarAcciones`
   *  (la interfaz nunca reordena). */
  acciones: AccionParaMostrar[];
  onDescartar: (accion: AccionParaMostrar) => void | Promise<void>;
}

export function AccionCard({ negocio, etiqueta, acciones, onDescartar }: AccionCardProps) {
  return (
    <div className="rounded-xl border border-primary/10 bg-white p-4 lg:p-5 shadow-sm">
      <p className="text-xs uppercase tracking-wide text-brand-brown/60">{etiqueta}</p>
      {acciones.length === 0 ? (
        // Vacío honesto (§4.3 del plan): la tarjeta se conserva -- su ausencia
        // se leería como que el negocio se dejó de mirar. Prohibido rellenar
        // con genéricos.
        <p className="mt-2 text-sm text-brand-brown/60">
          Sin acciones recomendadas para {ETIQUETA_NEGOCIO_VACIO[negocio]} hoy.
        </p>
      ) : (
        <div>
          {acciones.map((accion, i) => (
            <AccionItem key={accion.id} accion={accion} conBorde={i > 0} onDescartar={onDescartar} />
          ))}
        </div>
      )}
    </div>
  );
}
