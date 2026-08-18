import type { NegocioAccion } from '@/utils/accionesTipos';
import { PulsoHatoCard } from './PulsoHatoCard';
import { PulsoAguacateCard } from './PulsoAguacateCard';
import { PulsoGanadoCard } from './PulsoGanadoCard';

export interface PulsoNegocioProps {
  /** Negocios cuyo módulo el usuario tiene habilitado
   *  (`puedeAccederModulo`, ya filtrado por el llamador -- mismo contrato
   *  que `AccionesRecomendadas`, §8 del plan: "un bloque sin módulo no se
   *  renderiza y no se consulta"). Cada tarjeta sólo se MONTA (y por tanto
   *  sólo consulta) cuando su negocio está en esta lista -- el gate vive en
   *  qué se renderiza, no en un flag interno de sus hooks. */
  negocios: NegocioAccion[];
}

/**
 * PulsoNegocio - bloque "Pulso por negocio" del Tablero General
 * (`docs/plan_dashboard_centro_control.md` §4 Bloque 3 / §9.2). Tres
 * tarjetas -- Hato Lechero, Aguacate Hass, Ganado de ceba -- que
 * reemplazan las cuatro fichas de KPI sueltas de hoy.
 *
 * ⚠️ Una sola columna por debajo de `lg` (§9.2: "a media celda de 375px eso
 * se rompe -- es el mismo desbordamiento ya medido en las tarjetas del
 * hato"). Nunca `sm:grid-cols-2`.
 *
 * Sin ningún negocio habilitado, la sección entera desaparece -- nunca un
 * mensaje de "sin permisos" (mismo criterio que `AccionesRecomendadas`).
 */
export function PulsoNegocio({ negocios }: PulsoNegocioProps) {
  if (negocios.length === 0) return null;

  return (
    <section className="space-y-3">
      <h2 className="text-xl text-foreground">Pulso por negocio</h2>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {negocios.includes('hato_lechero') && <PulsoHatoCard />}
        {negocios.includes('aguacate') && <PulsoAguacateCard />}
        {negocios.includes('ganado') && <PulsoGanadoCard />}
      </div>
    </section>
  );
}
