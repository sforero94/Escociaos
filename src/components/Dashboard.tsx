/**
 * Tablero General — el Centro de Control.
 *
 * `docs/plan_dashboard_centro_control.md`. El orden vertical NO es estético:
 * va de lo que espera una decisión a lo que sólo informa, y por eso el dinero
 * queda de penúltimo y la salud de los datos de último.
 *
 *   barra de estado · requiere tu decisión · novedades · hoy en la finca ·
 *   pulso por negocio · dinero · salud de los datos
 *
 * "Novedades" (issue #266) reemplazó a "Acciones recomendadas", que vivía
 * entre Pulso y Dinero. Movida arriba de Clima el 2026-09-17 por decisión
 * de Santiago tras probar el bloque en vivo -- el brief (§3) ya
 * pre-autorizaba invertir el orden con Pulso si la lectura real mostraba
 * que Novedades se lee primero; esto va más allá de ese único intercambio,
 * pero es la misma clase de ajuste post-lanzamiento, no una relectura del
 * diseño. Ver `docs/plan_novedades.md` / `docs/plan_novedades_implementacion.md`.
 *
 * Este archivo COMPONE y no calcula. Cada bloque trae su propio hook y sus
 * propias consultas; aquí sólo vive lo que dos bloques tienen que compartir,
 * que es exactamente una cosa: el resultado de `useRequiereDecision`, cuyo
 * conteo alimenta la barra de estado. Si la barra lo consultara por su
 * cuenta, los dos números podrían divergir y el de arriba mentiría.
 *
 * Lo que este archivo YA NO hace, y es el punto del rediseño: no arranca
 * ningún KPI en 0. El viejo `KPIS_VACIO` inicializaba jornales y gasto en
 * cero y los `catch` devolvían cero, así que "no se pudo leer" se veía
 * idéntico a "no hay". Ahora cada bloque declara su propio hueco.
 */

import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import type { NegocioAccion } from '@/utils/negociosTablero';
import {
  EstadoHeader,
  ClimaCard,
  RequiereDecision,
  useRequiereDecision,
  PulsoNegocio,
  Novedades,
  Dinero,
  SaludDatos,
} from './dashboard/index';

export function Dashboard() {
  const navigate = useNavigate();
  const { profile, hasModulo } = useAuth();

  const esGerencia = profile?.rol === 'Gerencia';

  /** Los negocios cuyo módulo tiene el usuario. Un bloque sin módulo no se
   *  renderiza NI consulta (§8 del plan): el gate vive en qué se monta. */
  const negocios = useMemo<NegocioAccion[]>(() => {
    const lista: NegocioAccion[] = [];
    if (hasModulo('hato_lechero')) lista.push('hato_lechero');
    if (hasModulo('aguacate')) lista.push('aguacate');
    if (hasModulo('ganado')) lista.push('ganado');
    return lista;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.modulos, profile?.rol]);

  /** Los gastos pendientes se cierran por ROL, no sólo por módulo: todas las
   *  tablas `fin_*` son Gerencia-only por RLS, así que un Administrador con
   *  el módulo concedido recibiría una lista vacía indistinguible de "no hay
   *  pendientes" — el bug que el CLAUDE.md ya documenta para
   *  `/finanzas/reportes`. */
  const puedeGastos = hasModulo('finanzas') && esGerencia;

  const decision = useRequiereDecision({
    puedeGanado: hasModulo('ganado'),
    puedeEscribirGanado: esGerencia || profile?.rol === 'Administrador',
    puedeAplicaciones: hasModulo('aguacate'),
    puedeGastos,
    navegar: navigate,
  });

  return (
    <div className="space-y-5">
      <EstadoHeader
        conteoDecision={decision.cargando ? null : decision.totalFilas}
        nombreUsuario={profile?.nombre ?? null}
      />

      <RequiereDecision resultado={decision} />

      <Novedades profile={profile} />

      <ClimaCard />

      <PulsoNegocio negocios={negocios} />

      <Dinero />

      <SaludDatos />
    </div>
  );
}
