import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CheckCircle2 } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { formatRelativeTime } from '@/utils/format';
import type { NegocioAccion } from '@/utils/accionesTipos';
import type { EntradaSelectores } from '@/utils/accionesHechos';
import { negocioConMasAcciones } from '@/utils/accionesRecomendadasEstado';
import { useAccionesRecomendadas } from './hooks/useAccionesRecomendadas';
import { AccionCard } from './AccionCard';

/**
 * Bloque "Acciones recomendadas" del Tablero General (bloque 4 del Centro de
 * Control, `docs/plan_dashboard_centro_control.md` §4/§9.2, Fase 4 de
 * `docs/brief_tecnico_motor_acciones.md`). Diseño ya aprobado por el dueño
 * -- no se rediseña aquí.
 *
 * Tres tarjetas, una por negocio, en el mismo orden y ancho que el pulso.
 * Cuatro estados (§4.3 del plan): cargando (nada, sin skeleton), motor no
 * disponible (línea gris, sin alarma), todos vacíos (una línea verde con
 * check), con acciones (grilla en escritorio, `<Select>` + una tarjeta en
 * móvil -- Patrón B, docs/sistema-visual.md §3-bis).
 */

const NEGOCIO_ETIQUETA: Record<NegocioAccion, string> = {
  hato_lechero: 'Hato Lechero',
  aguacate: 'Aguacate Hass',
  ganado: 'Ganado',
};

/** Enlace de "motor no disponible" y ruta de la tarjeta móvil -- mismo hub
 *  que usa la tarjeta de pulso de cada negocio (plan §3.1/3.2/3.3). Aguacate
 *  no tiene una pantalla "de inicio" propia todavía (grupo de sidebar sin
 *  landing única); Monitoreo es la que más señales trae. */
const NEGOCIO_RUTA: Record<NegocioAccion, string> = {
  hato_lechero: '/hato-lechero',
  aguacate: '/monitoreo',
  ganado: '/ganado',
};

export interface AccionesRecomendadasProps {
  /** Negocios cuyo módulo el usuario tiene habilitado -- ya filtrado con
   *  `puedeAccederModulo` por el llamador (§8 del plan: "el mismo gate que
   *  su tarjeta de pulso"). Vacío ⇒ la sección entera desaparece. */
  negocios: NegocioAccion[];
  /** Lo que el pulso (bloque 3) ya cargó, para el cotejo al pintar (§6). */
  entrada: EntradaSelectores;
  esGerencia: boolean;
  userId: string | null;
}

export function AccionesRecomendadas({ negocios, entrada, esGerencia, userId }: AccionesRecomendadasProps) {
  const navigate = useNavigate();
  const { estado, generadoAt, porNegocio, descartar } = useAccionesRecomendadas({
    negocios,
    entrada,
    esGerencia,
    userId,
  });
  const [negocioMovilElegido, setNegocioMovilElegido] = useState<NegocioAccion | null>(null);

  // Sin ningún negocio habilitado, la sección entera desaparece (§8 del plan
  // del tablero) -- nunca un mensaje de "sin permisos", el usuario no pidió
  // ver esto.
  if (negocios.length === 0) return null;

  // Cargando: nada. Reservar hueco para algo que quizá no llegue es
  // prometer lo que no se sabe (§9.1, excepción deliberada del bloque 4).
  if (estado === 'cargando') return null;

  if (estado === 'no_disponible') {
    return (
      <section className="space-y-2">
        <h2 className="text-xl text-foreground">Acciones recomendadas</h2>
        <p className="text-sm text-brand-brown/60">
          Las acciones recomendadas no están disponibles ahora.{' '}
          {porNegocio.map(({ negocio }, i) => (
            <span key={negocio}>
              {i > 0 && ' · '}
              <button
                type="button"
                onClick={() => navigate(NEGOCIO_RUTA[negocio])}
                className="underline underline-offset-2 hover:text-foreground"
              >
                {NEGOCIO_ETIQUETA[negocio]}
              </button>
            </span>
          ))}
        </p>
      </section>
    );
  }

  if (estado === 'todos_vacios') {
    return (
      <section className="space-y-2">
        <h2 className="text-xl text-foreground">Acciones recomendadas</h2>
        <p className="flex items-center gap-2 text-sm text-primary">
          <CheckCircle2 className="w-4 h-4 flex-shrink-0" aria-hidden="true" />
          Nada recomendado hoy{generadoAt ? ` · última revisión ${formatRelativeTime(generadoAt)}` : ''}
        </p>
      </section>
    );
  }

  // con_acciones
  const negocioPorDefecto = negocioConMasAcciones(porNegocio) ?? porNegocio[0]?.negocio ?? null;
  const negocioMovilActivo = negocioMovilElegido ?? negocioPorDefecto;
  const grupoMovil = porNegocio.find((g) => g.negocio === negocioMovilActivo) ?? porNegocio[0];

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-xl text-foreground">Acciones recomendadas</h2>
        {generadoAt && (
          <span className="text-xs text-brand-brown/60 whitespace-nowrap">
            Sugerido · {formatRelativeTime(generadoAt)}
          </span>
        )}
      </div>

      {/* Móvil (<lg): Patrón B -- las tres tarjetas se colapsan en un
          <Select> de negocio con una sola lista debajo (docs/sistema-visual.md
          §3-bis; §9.2 del plan: tres tarjetas de tres acciones con su
          evidencia son 20+ filas de scroll para un momento de dos minutos). */}
      {grupoMovil && (
        <div className="lg:hidden space-y-3">
          <Select value={grupoMovil.negocio} onValueChange={(v) => setNegocioMovilElegido(v as NegocioAccion)}>
            <SelectTrigger className="w-full">
              <SelectValue>{NEGOCIO_ETIQUETA[grupoMovil.negocio]}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              {porNegocio.map(({ negocio }) => (
                <SelectItem key={negocio} value={negocio}>
                  {NEGOCIO_ETIQUETA[negocio]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <AccionCard
            negocio={grupoMovil.negocio}
            etiqueta={NEGOCIO_ETIQUETA[grupoMovil.negocio]}
            acciones={grupoMovil.acciones}
            onDescartar={descartar}
          />
        </div>
      )}

      {/* Escritorio: grilla alineada con el pulso -- una tarjeta por
          negocio, mismo orden y ancho (§9.2: "la columna del hato queda
          justo debajo de la del hato"). */}
      <div className="hidden lg:grid lg:grid-cols-3 gap-4">
        {porNegocio.map(({ negocio, acciones }) => (
          <AccionCard
            key={negocio}
            negocio={negocio}
            etiqueta={NEGOCIO_ETIQUETA[negocio]}
            acciones={acciones}
            onDescartar={descartar}
          />
        ))}
      </div>
    </section>
  );
}
