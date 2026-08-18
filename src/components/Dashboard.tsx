/**
 * Tablero General — el Centro de Control.
 *
 * `docs/plan_dashboard_centro_control.md`. El orden vertical NO es estético:
 * va de lo que espera una decisión a lo que sólo informa, y por eso el dinero
 * queda de penúltimo y la salud de los datos de último.
 *
 *   barra de estado · requiere tu decisión · hoy en la finca ·
 *   pulso por negocio · acciones recomendadas · dinero · salud de los datos
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
import { obtenerFechaHoy } from '@/utils/fechas';
import type { NegocioAccion } from '@/utils/accionesTipos';
import type { EntradaSelectores } from '@/utils/accionesHechos';
import {
  EstadoHeader,
  ClimaCard,
  RequiereDecision,
  useRequiereDecision,
  PulsoNegocio,
  AccionesRecomendadas,
  Dinero,
  SaludDatos,
} from './dashboard/index';
import { useGanadoParaAcciones } from './dashboard/hooks/useGanadoParaAcciones';

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

  const ganadoParaAcciones = useGanadoParaAcciones(hasModulo('ganado'));

  /** Entrada del cotejo al pintar (§6.2 del brief del motor). El pulso de
   *  hato y aguacate consulta por dentro de sus tarjetas y no expone su
   *  derivado, así que aquí van `null` — que el cotejo trata como
   *  indeterminado (la acción se muestra), nunca como "caducada". Es la
   *  respuesta honesta de "ese negocio no cargó aquí". */
  const entradaAcciones = useMemo<EntradaSelectores>(
    () => ({
      animalesHato: null,
      priorizacion: null,
      ganado: ganadoParaAcciones,
      config: null,
      hoy: obtenerFechaHoy(),
    }),
    [ganadoParaAcciones],
  );

  return (
    <div className="space-y-5">
      <EstadoHeader
        conteoDecision={decision.cargando ? null : decision.totalFilas}
        nombreUsuario={profile?.nombre ?? null}
      />

      <RequiereDecision resultado={decision} />

      <ClimaCard />

      <PulsoNegocio negocios={negocios} />

      <AccionesRecomendadas
        negocios={negocios}
        entrada={entradaAcciones}
        esGerencia={esGerencia}
        userId={profile?.id ?? null}
      />

      <Dinero />

      <SaludDatos />
    </div>
  );
}
