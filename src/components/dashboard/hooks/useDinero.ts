// ARCHIVO: components/dashboard/hooks/useDinero.ts
// DESCRIPCIÓN: I/O del bloque "Dinero" del Tablero General
// (`docs/plan_dashboard_centro_control.md` §4 Bloque 5). Sólo consulta
// Supabase y le pasa lo crudo a la lógica PURA de `@/utils/calculosDinero`
// -- ningún cálculo vive aquí (mismo reparto que `useAccionesRecomendadas` /
// `accionesRecomendadasEstado.ts`).
//
// `habilitado` lo decide el componente ANTES de montar este hook con
// intención real: mientras `AuthContext` resuelve el perfil, o para un
// usuario sin el módulo `finanzas` o sin rol Gerencia, `habilitado` es
// `false` y el efecto de abajo NUNCA llama a Supabase (plan §8: "un bloque
// sin módulo no se renderiza y NO SE CONSULTA" -- Dinero además nunca debe
// consultar `fin_*` para un rol sin RLS, que volvería silenciosamente `[]`
// y se leería como "$0").

import { useEffect, useState } from 'react';
import { getSupabase } from '@/utils/supabase/client';
import { fetchAll } from '@/utils/supabase/fetchAll';
import { obtenerFechaHoy } from '@/utils/fechas';
import { useProduccionHato } from '@/components/hato/hooks/useProduccionHato';
import {
  agregarGastoDinero,
  gastoEjecutadoContraPresupuesto,
  type FilaGastoDinero,
  type FilaGastoParaPresupuesto,
  type FilaPresupuestoParaEjecucion,
  type QuincenaResuelta,
} from '@/utils/calculosDinero';

export type EstadoDinero = 'cargando' | 'error' | 'listo';

export interface DatosDinero {
  hoy: string;
  mesActual: number;
  trimestreActual: number;
  gastoMesActual: number;
  gastoMesAnterior: number;
  gastoAcumuladoAnio: number;
  porNegocioAnio: Array<{ nombre: string; total: number }>;
  /** Suma de `fin_presupuestos.monto_anual` del año -- 0 = sin presupuesto cargado. */
  presupuestoTotalAnual: number;
  /** Gasto `Confirmado` del año ESCOPADO a las combinaciones (negocio,
   *  categoría) que tienen fila en `fin_presupuestos` -- la línea "$X de $Y
   *  presupuestado al Q{n}" se calcula y se muestra con ESTE número, nunca
   *  con `gastoAcumuladoAnio` (que es TODO el gasto, incluido el de
   *  categorías sin presupuestar -- ver `gastoEjecutadoContraPresupuesto`). */
  gastoAcumuladoPresupuestado: number;
  ingresoMesActual: number;
  /** `false` = ninguna fila en `fin_ingresos` este mes -- el caso "sin
   *  ingresos" del plan (§5.2), distinto de "hubo filas que suman $0". */
  ingresoTieneFilas: boolean;
  /** `null` si el módulo hato_lechero no está habilitado, o si nunca se
   *  registró ninguna quincena. */
  ultimaQuincena: QuincenaResuelta | null;
  /** Valores brutos de las últimas quincenas medidas -- para el rango
   *  "~$11M a $27M" de la evidencia del caso "sin ingresos". `[]` si el
   *  módulo hato_lechero no está habilitado. */
  quincenaValores: number[];
}

interface FilaGastoRaw {
  id: string;
  valor: number;
  fecha: string;
  negocio_id: string;
  categoria_id: string | null;
}

interface FilaPresupuestoRaw {
  id: string;
  negocio_id: string;
  categoria_id: string;
  monto_anual: number;
}

export interface UseDineroParams {
  /** El componente ya decidió: `!authLoading && hasModulo('finanzas') &&
   *  profile?.rol === 'Gerencia'`. Este hook no reimplementa ese gate. */
  habilitado: boolean;
  /** Gobierna si se intenta leer `hato_produccion_quincenal` (evidencia del
   *  caso "sin ingresos" -- tabla de otro módulo, gate aparte). */
  hasModuloHato: boolean;
}

export function useDinero(params: UseDineroParams): { estado: EstadoDinero; datos: DatosDinero | null } {
  const { habilitado, hasModuloHato } = params;
  const [estado, setEstado] = useState<EstadoDinero>('cargando');
  const [datos, setDatos] = useState<DatosDinero | null>(null);
  const { fetchHistorialQuincenal } = useProduccionHato();

  useEffect(() => {
    if (!habilitado) return;
    let cancelado = false;

    async function cargar() {
      setEstado('cargando');
      try {
        const supabase = getSupabase();
        // fin_presupuestos no está en el `Database` generado (mismo caso
        // que `hato_*`/`gan_*` en otros hooks del repo) -- un solo cast,
        // igual que `loadPresupuestoAlertas` del tablero anterior.
        const supabaseSinTipos = supabase as any; // eslint-disable-line @typescript-eslint/no-explicit-any
        const hoy = obtenerFechaHoy();
        const [anio, mes] = hoy.split('-').map(Number);
        const trimestreActual = Math.floor((mes - 1) / 3) + 1;

        // Rango de fetch de fin_gastos: desde el 1 de enero del año actual,
        // salvo en enero, donde hay que retroceder hasta diciembre del año
        // anterior para que "gasto del mes anterior" tenga con qué comparar.
        const desdeAnio = mes === 1 ? anio - 1 : anio;
        const desdeMes = mes === 1 ? 12 : 1;
        const desde = `${desdeAnio}-${String(desdeMes).padStart(2, '0')}-01`;

        const [gastosRes, negociosRes, presupuestoRes, ingresoRes] = await Promise.all([
          fetchAll<FilaGastoRaw>((rangoDesde, rangoHasta) =>
            supabase
              .from('fin_gastos')
              .select('id, valor, fecha, negocio_id, categoria_id')
              .eq('estado', 'Confirmado')
              .gte('fecha', desde)
              .lte('fecha', hoy)
              .order('id')
              .range(rangoDesde, rangoHasta),
          ),
          supabase.from('fin_negocios').select('id, nombre'),
          fetchAll<FilaPresupuestoRaw>((rangoDesde, rangoHasta) =>
            supabaseSinTipos
              .from('fin_presupuestos')
              .select('id, negocio_id, categoria_id, monto_anual')
              .eq('anio', anio)
              .order('id')
              .range(rangoDesde, rangoHasta),
          ),
          supabase
            .from('fin_ingresos')
            .select('valor')
            .gte('fecha', `${anio}-${String(mes).padStart(2, '0')}-01`)
            .lte('fecha', hoy),
        ]);

        if (negociosRes.error) throw negociosRes.error;
        if (ingresoRes.error) throw ingresoRes.error;

        const negocioPorId = new Map<string, string>(
          (negociosRes.data ?? []).map((n: { id: string; nombre: string }) => [n.id, n.nombre]),
        );

        const filasGasto: FilaGastoDinero[] = gastosRes.filas.map((g) => ({
          valor: Number(g.valor) || 0,
          fecha: g.fecha,
          negocioNombre: negocioPorId.get(g.negocio_id) ?? null,
        }));

        const agregado = agregarGastoDinero(filasGasto, hoy);

        const presupuestoTotalAnual = presupuestoRes.filas.reduce(
          (suma, p) => suma + (Number(p.monto_anual) || 0),
          0,
        );

        // Gasto ESCOPADO a lo presupuestado (§5.1) -- nunca `gastoAcumuladoAnio`
        // crudo contra `presupuestoTotalAnual` crudo: `fin_presupuestos` sólo
        // cubre ALGUNAS combinaciones (negocio, categoría), así que sumar TODO
        // el gasto del año infla el % con gasto que ningún presupuesto cubre
        // (ver `gastoEjecutadoContraPresupuesto`).
        const filasGastoParaPresupuesto: FilaGastoParaPresupuesto[] = gastosRes.filas.map((g) => ({
          valor: Number(g.valor) || 0,
          fecha: g.fecha,
          negocioId: g.negocio_id ?? null,
          categoriaId: g.categoria_id ?? null,
        }));
        const presupuestosParaEjecucion: FilaPresupuestoParaEjecucion[] = presupuestoRes.filas.map((p) => ({
          negocioId: p.negocio_id,
          categoriaId: p.categoria_id,
          montoAnual: Number(p.monto_anual) || 0,
        }));
        const gastoAcumuladoPresupuestado = gastoEjecutadoContraPresupuesto(
          filasGastoParaPresupuesto,
          presupuestosParaEjecucion,
          hoy,
        );

        const ingresoMesActual = (ingresoRes.data ?? []).reduce(
          (suma: number, i: { valor: number }) => suma + (Number(i.valor) || 0),
          0,
        );
        const ingresoTieneFilas = (ingresoRes.data ?? []).length > 0;

        // Evidencia del caso "sin ingresos" (§5.2) -- sólo si el módulo
        // hato_lechero está habilitado; si no, ni se consulta.
        let ultimaQuincena: QuincenaResuelta | null = null;
        let quincenaValores: number[] = [];
        if (hasModuloHato) {
          const historial = await fetchHistorialQuincenal(8);
          const primera = historial[0];
          if (primera) ultimaQuincena = { anio: primera.anio, mes: primera.mes, quincena: primera.quincena };
          quincenaValores = historial
            .map((h) => h.finIngreso?.valor)
            .filter((v): v is number => typeof v === 'number');
        }

        if (cancelado) return;
        setDatos({
          hoy,
          mesActual: mes,
          trimestreActual,
          gastoMesActual: agregado.gastoMesActual,
          gastoMesAnterior: agregado.gastoMesAnterior,
          gastoAcumuladoAnio: agregado.gastoAcumuladoAnio,
          porNegocioAnio: agregado.porNegocioAnio,
          presupuestoTotalAnual,
          gastoAcumuladoPresupuestado,
          ingresoMesActual,
          ingresoTieneFilas,
          ultimaQuincena,
          quincenaValores,
        });
        setEstado('listo');
      } catch (err) {
        console.error('useDinero: error cargando datos financieros del tablero', err);
        if (!cancelado) {
          setDatos(null);
          setEstado('error');
        }
      }
    }

    cargar();
    return () => {
      cancelado = true;
    };
    // `fetchHistorialQuincenal` es estable (useCallback sin dependencias
    // externas cambiantes) -- listarlo re-dispararía el efecto en cada
    // render de `useProduccionHato`. `habilitado`/`hasModuloHato` son los
    // únicos disparadores reales.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [habilitado, hasModuloHato]);

  return { estado, datos };
}
