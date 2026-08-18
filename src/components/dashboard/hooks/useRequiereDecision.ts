import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { getSupabase } from '@/utils/supabase/client';
import { obtenerFechaHoy } from '@/utils/fechas';
import { useGanadoInventario } from '@/components/ganado/hooks/useGanadoInventario';
import { calcularKPIsInventario } from '@/utils/calculosGanado';
import {
  construirFilaAplicacionesArrancanPronto,
  construirFilaAplicacionesColgadas,
  construirFilaGanadoPendiente,
  construirFilaGastosPendientes,
  derivarAplicacionesParaDecision,
  type AplicacionParaDecision,
} from '@/utils/calculosRequiereDecision';
import type { GanFinca, GanMovimiento, GanPotrero } from '@/types/ganado';

/**
 * Hook de datos del bloque "Requiere tu decisión" (Bloque 1 del Centro de
 * Control, `docs/plan_dashboard_centro_control.md` §4/§9.2). Sólo hace I/O y
 * wirea el resultado a estado de React -- toda la redacción de título/
 * contexto vive en `calculosRequiereDecision.ts` (pura, testeada sin
 * Supabase, sin `new Date()`).
 *
 * El gate por módulo/rol NO se reimplementa aquí -- lo decide el llamador
 * con `puedeAccederModulo` (mismo criterio que `useAccionesRecomendadas`
 * recibe `negocios` ya filtrado). Un source sin su módulo ni se consulta.
 *
 * Regla dura de "sin dato": si una fuente falla, su fila NO se muestra con
 * un 0 -- se agrega un mensaje de error explícito a `errores`, y las demás
 * fuentes se siguen renderizando con normalidad (un fallo no tumba el
 * bloque entero).
 *
 * `totalFilas` se expone explícitamente (no sólo `filas.length`) porque la
 * barra de estado (bloque 0) lo recibe por prop desde la composición, que
 * llama a ESTE hook una sola vez y lo reparte -- nunca vuelve a consultar.
 */

export type TipoFilaRequiereDecision =
  | 'ganado_pendiente'
  | 'aplicaciones_colgadas'
  | 'aplicaciones_arrancan_pronto'
  | 'gastos_pendientes';

export type SeveridadFilaRequiereDecision = 'alta' | 'media';

export interface BotonFilaRequiereDecision {
  etiqueta: string;
  onClick: () => void;
}

export interface FilaRequiereDecision {
  id: string;
  tipo: TipoFilaRequiereDecision;
  severidad: SeveridadFilaRequiereDecision;
  titulo: string;
  contexto: string;
  /** Ausente cuando el usuario tiene el módulo pero no el rol de escritura
   *  (§8 del plan: "con el módulo pero sin escritura: se muestra
   *  informativa, sin botón") -- la fila igual se muestra. */
  botonPrimario?: BotonFilaRequiereDecision;
  /** Sólo 1.1 (ganado) lo usa hoy. */
  botonSecundario?: BotonFilaRequiereDecision;
}

export interface ErrorFuenteRequiereDecision {
  fuente: 'ganado' | 'aplicaciones' | 'gastos';
  mensaje: string;
}

export interface UseRequiereDecisionParams {
  /** `puedeAccederModulo(profile, 'ganado')`, ya resuelto por el llamador. */
  puedeGanado: boolean;
  /** `profile.rol === 'Administrador' || profile.rol === 'Gerencia'` --
   *  mismo corte que la RLS de escritura de `gan_movimientos` (§8). */
  puedeEscribirGanado: boolean;
  /** `puedeAccederModulo(profile, 'aguacate')`. */
  puedeAplicaciones: boolean;
  /** `puedeAccederModulo(profile, 'finanzas') && profile.rol === 'Gerencia'`.
   *  El plan (§8) sólo exige el módulo para 1.4, pero `fin_gastos` es
   *  Gerencia-only en RLS igual que el resto de `fin_*` (CLAUDE.md, "Every
   *  fin_* table is Gerencia-only at the RLS layer") -- sin este segundo
   *  filtro, un Administrador con el módulo vería 0 filas por RLS, idéntico
   *  a "no hay pendientes", que es exactamente el silencio que ese mismo
   *  párrafo de CLAUDE.md documenta como bug. Ver reporte de la sesión. */
  puedeGastos: boolean;
  /** Navegación -- inyectada por el llamador para no acoplar este hook a
   *  react-router-dom en su firma pública (facilita testear el estado puro
   *  con un stub). */
  navegar: (ruta: string) => void;
}

export interface UseRequiereDecisionResultado {
  cargando: boolean;
  filas: FilaRequiereDecision[];
  errores: ErrorFuenteRequiereDecision[];
  /** = `filas.length`, expuesto para que la barra de estado (bloque 0) no
   *  tenga que volver a consultar ni recibir la lista completa. */
  totalFilas: number;
  /** Estado del diálogo "Confirmar en inventario" (`ConfirmarPendienteDialog`,
   *  reutilizado tal cual desde `/ganado/movimientos` -- no se duplica). */
  dialogoGanado: { movimiento: GanMovimiento; fincas: GanFinca[]; potreros: GanPotrero[] } | null;
  cerrarDialogoGanado: () => void;
  /** Recarga las tres fuentes -- se llama tras confirmar/descartar un
   *  movimiento de ganado (`onSuccess` del diálogo). */
  recargar: () => void;
}

export function useRequiereDecision(params: UseRequiereDecisionParams): UseRequiereDecisionResultado {
  const { puedeGanado, puedeEscribirGanado, puedeAplicaciones, puedeGastos, navegar } = params;

  const { fetchPendientes, fetchEstructura, fetchInventario, descartarPendiente } = useGanadoInventario();

  const [cargando, setCargando] = useState(true);
  const [filas, setFilas] = useState<FilaRequiereDecision[]>([]);
  const [errores, setErrores] = useState<ErrorFuenteRequiereDecision[]>([]);
  const [recargaKey, setRecargaKey] = useState(0);

  // Estado crudo de ganado -- se conserva para poder abrir el diálogo de
  // confirmación con el movimiento y el potrero/finca correctos sin volver
  // a consultar.
  const [pendientesGanado, setPendientesGanado] = useState<GanMovimiento[]>([]);
  const [fincas, setFincas] = useState<GanFinca[]>([]);
  const [potreros, setPotreros] = useState<GanPotrero[]>([]);
  const [movimientoDialogoId, setMovimientoDialogoId] = useState<string | null>(null);

  const recargar = useCallback(() => setRecargaKey((k) => k + 1), []);
  const cerrarDialogoGanado = useCallback(() => setMovimientoDialogoId(null), []);

  const descartarGanado = useCallback(
    async (movimientoId: string) => {
      try {
        await descartarPendiente(movimientoId);
        toast.success('Movimiento pendiente descartado');
        recargar();
      } catch (error: unknown) {
        const mensaje = error instanceof Error ? error.message : 'Error desconocido';
        toast.error('Error descartando: ' + mensaje);
      }
    },
    [descartarPendiente, recargar],
  );

  useEffect(() => {
    let cancelado = false;

    async function cargar() {
      setCargando(true);
      const hoy = obtenerFechaHoy();
      const supabase = getSupabase();
      const nuevasFilas: FilaRequiereDecision[] = [];
      const nuevosErrores: ErrorFuenteRequiereDecision[] = [];

      // --- 1.1 · Ganado pendiente ------------------------------------------------
      if (puedeGanado) {
        try {
          const [pendientes, estructura] = await Promise.all([
            fetchPendientes(),
            puedeEscribirGanado ? fetchEstructura() : Promise.resolve(null),
          ]);

          let totalCabezas: number | null = null;
          if (pendientes.length > 0) {
            try {
              const inventario = await fetchInventario();
              totalCabezas = calcularKPIsInventario(inventario).totalCabezas;
            } catch {
              totalCabezas = null; // se degrada el texto, la fila se sigue mostrando
            }
          }

          const datos = construirFilaGanadoPendiente(
            pendientes.map((p) => ({ id: p.id, fecha: p.fecha })),
            hoy,
            totalCabezas,
          );

          if (datos) {
            if (!cancelado) {
              setPendientesGanado(pendientes);
              if (estructura) {
                setFincas(estructura.fincas);
                setPotreros(estructura.potreros);
              }
            }
            nuevasFilas.push({
              id: 'ganado-pendientes',
              tipo: 'ganado_pendiente',
              severidad: 'media',
              titulo: datos.titulo,
              contexto: datos.contexto,
              botonPrimario: puedeEscribirGanado
                ? { etiqueta: 'Confirmar aquí', onClick: () => setMovimientoDialogoId(datos.idMasViejo) }
                : undefined,
              botonSecundario: puedeEscribirGanado
                ? { etiqueta: 'Descartar', onClick: () => descartarGanado(datos.idMasViejo) }
                : undefined,
            });
          }
        } catch {
          nuevosErrores.push({ fuente: 'ganado', mensaje: 'No se pudo leer ganado' });
        }
      }

      // --- 1.3 · Aplicaciones colgadas o que arrancan ya -------------------------
      if (puedeAplicaciones) {
        try {
          const { data, error } = await supabase
            .from('aplicaciones')
            .select('id, nombre_aplicacion, estado, created_at, fecha_inicio_planeada')
            .in('estado', ['Calculada', 'En ejecución']);
          if (error) throw error;

          const normalizadas: AplicacionParaDecision[] = (data ?? [])
            .filter((a): a is typeof a & { estado: 'Calculada' | 'En ejecución' } => a.estado === 'Calculada' || a.estado === 'En ejecución')
            .map((a) => ({
              id: a.id,
              nombre: a.nombre_aplicacion || 'Aplicación sin nombre',
              estado: a.estado,
              created_at: a.created_at,
              fecha_inicio_planeada: a.fecha_inicio_planeada,
            }));

          const { colgadas, arrancanPronto } = derivarAplicacionesParaDecision(normalizadas, hoy);

          const filaColgadas = construirFilaAplicacionesColgadas(colgadas);
          if (filaColgadas) {
            nuevasFilas.push({
              id: 'aplicaciones-colgadas',
              tipo: 'aplicaciones_colgadas',
              severidad: 'alta',
              titulo: filaColgadas.titulo,
              contexto: filaColgadas.contexto,
              botonPrimario: {
                etiqueta: 'Ir al cierre',
                onClick: () => navegar(filaColgadas.aplicacionId ? `/aplicaciones/${filaColgadas.aplicacionId}/cierre` : '/aplicaciones'),
              },
            });
          }

          const filaArranca = construirFilaAplicacionesArrancanPronto(arrancanPronto);
          if (filaArranca) {
            nuevasFilas.push({
              id: 'aplicaciones-arrancan-pronto',
              tipo: 'aplicaciones_arrancan_pronto',
              severidad: 'media',
              titulo: filaArranca.titulo,
              contexto: filaArranca.contexto,
              botonPrimario: {
                etiqueta: 'Ver aplicación',
                onClick: () =>
                  navegar(filaArranca.aplicacionId ? `/aplicaciones/calculadora/${filaArranca.aplicacionId}` : '/aplicaciones'),
              },
            });
          }
        } catch {
          nuevosErrores.push({ fuente: 'aplicaciones', mensaje: 'No se pudo leer aplicaciones' });
        }
      }

      // --- 1.4 · Gastos pendientes de confirmar -----------------------------------
      if (puedeGastos) {
        try {
          const { data, error } = await supabase.from('fin_gastos').select('valor').eq('estado', 'Pendiente');
          if (error) throw error;

          const datos = construirFilaGastosPendientes((data ?? []).map((g) => ({ valor: Number(g.valor) || 0 })));
          if (datos) {
            nuevasFilas.push({
              id: 'gastos-pendientes',
              tipo: 'gastos_pendientes',
              severidad: 'media',
              titulo: datos.titulo,
              contexto: datos.contexto,
              botonPrimario: { etiqueta: 'Ver gastos pendientes', onClick: () => navegar('/finanzas/gastos?tab=historial') },
            });
          }
        } catch {
          nuevosErrores.push({ fuente: 'gastos', mensaje: 'No se pudo leer gastos' });
        }
      }

      if (!cancelado) {
        setFilas(nuevasFilas);
        setErrores(nuevosErrores);
        setCargando(false);
      }
    }

    cargar();
    return () => {
      cancelado = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [puedeGanado, puedeEscribirGanado, puedeAplicaciones, puedeGastos, recargaKey]);

  const movimientoDialogo = movimientoDialogoId ? (pendientesGanado.find((p) => p.id === movimientoDialogoId) ?? null) : null;

  return {
    cargando,
    filas,
    errores,
    totalFilas: filas.length,
    dialogoGanado: movimientoDialogo ? { movimiento: movimientoDialogo, fincas, potreros } : null,
    cerrarDialogoGanado,
    recargar,
  };
}
