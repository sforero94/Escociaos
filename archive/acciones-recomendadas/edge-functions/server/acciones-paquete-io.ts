// acciones-paquete-io.ts — I/O real del ensamblador del motor de acciones
// recomendadas (Fase 2, docs/brief_tecnico_motor_acciones.md §3, §10 Fase 2).
//
// Separado de `acciones-paquete.ts` a propósito: ese archivo se importa
// desde `src/__tests__/accionesPaquete.test.ts` (Vitest, Node), y este
// repo tiene una regla estricta y ya establecida para los módulos de
// agregación del árbol `src/supabase/functions/server/` que SÍ se prueban
// con Vitest -- `hato-aggregation.ts`, `ganado-inventario.ts`,
// `priorizacion-scouting.ts`, `cost-aggregation.ts` -- todos declaran en su
// propia cabecera "sin imports de Deno/Supabase, para que sea testeable
// desde Vitest sin cruzar la frontera del árbol de despliegue". Este
// archivo SÍ importa `jsr:@supabase/supabase-js@2` (valor, no sólo tipo) y
// hace las consultas reales -- por eso vive aparte y `acciones-tick.ts` es
// el único que lo importa. Ningún test lo ejercita directamente (mismo
// criterio que `hato-alertas-tick.ts`/`hato-chequeo-commit.ts`: I/O puro,
// verificado por inspección, no por Vitest).
//
// Construye los `Datos*ParaPaquete` que `acciones-paquete.ts` consume --
// nunca arma un `Hecho`, nunca decide qué se emite. Ver ese archivo para
// las notas de verificación de cada tabla (`aplicaciones_productos.mezcla_id`,
// A-7(i) sin poblar, etc.).

import { createClient } from 'jsr:@supabase/supabase-js@2';
import type {
  DatosAguacateParaPaquete,
  DatosGanadoParaPaquete,
  DatosHatoParaPaquete,
  DependenciasEnsamblador,
  FilaAplicacionMezclaParaPaquete,
  FilaAplicacionParaPaquete,
  FilaAplicacionProductoParaPaquete,
  FilaClimaParaPaquete,
  FilaMonitoreoParaPaquete,
  FilaRegistroTrabajoParaPaquete,
  FilaTareaParaPaquete,
} from './acciones-paquete.ts';
import { sumarDiasISO } from './acciones-paquete.ts';
import type { RevisionPeriodicaFila } from './acciones-hechos.ts';
import type { DestinoId, NegocioAccion } from './acciones-tipos.ts';
import type { FilaHatoConfig } from './hato-config-desde-tabla.ts';
import type { HatoEstadoActualRow } from './hato-aggregation.ts';
import type { PerfilEstacional, SubloteEnAlcance, UmbralEconomico } from './priorizacion-scouting.ts';
import type { GanFincaRow, GanInventarioRow, GanMovimientoRow, GanPotreroRow, GanUbicacionRow } from './ganado-inventario.ts';

type ClienteSupabase = ReturnType<typeof createClient>;

const TAMANO_PAGINA = 1000;
const MAX_PAGINAS_SELECT = 20;

/** PostgREST/`supabase-js` corta en 1.000 filas por página y NO avisa --
 *  mismo bug ya documentado en este repo (`supabaseQueryAll`, `chat.tsx`;
 *  `fetchAll`, frontend). Toda consulta de este archivo que pueda devolver
 *  más de 1.000 filas usa este helper. */
async function paginar<T>(
  ejecutar: (desde: number, hasta: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
): Promise<T[]> {
  const filas: T[] = [];
  for (let pagina = 0; pagina < MAX_PAGINAS_SELECT; pagina += 1) {
    const desde = pagina * TAMANO_PAGINA;
    const hasta = desde + TAMANO_PAGINA - 1;
    const { data, error } = await ejecutar(desde, hasta);
    if (error) throw new Error(error.message);
    const lote = data ?? [];
    filas.push(...lote);
    if (lote.length < TAMANO_PAGINA) return filas;
  }
  console.warn('[acciones-paquete-io] tope de páginas de paginación alcanzado en una consulta');
  return filas;
}

async function cargarRevisionesPeriodicas(supabase: ClienteSupabase): Promise<RevisionPeriodicaFila[]> {
  interface FilaDb {
    clave: string;
    negocio: NegocioAccion;
    nombre: string;
    destino_id: string;
    activa: boolean;
    disparo: 'cada_n_dias' | 'al_cerrar_periodo' | 'al_ocurrir_evento';
    cadencia_dias: number | null;
    periodo: 'quincenal' | 'mensual' | 'trimestral' | null;
    dias_gracia: number;
    evento_selector: string | null;
    ultima_revision_at: string | null;
  }
  const filas = await paginar<FilaDb>((desde, hasta) =>
    supabase
      .from('revisiones_periodicas')
      .select('clave,negocio,nombre,destino_id,activa,disparo,cadencia_dias,periodo,dias_gracia,evento_selector,ultima_revision_at')
      .range(desde, hasta),
  );
  return filas.map((f) => ({
    clave: f.clave,
    negocio: f.negocio,
    nombre: f.nombre,
    destinoId: f.destino_id as DestinoId,
    activa: f.activa,
    disparo: f.disparo,
    cadenciaDias: f.cadencia_dias,
    periodo: f.periodo,
    diasGracia: f.dias_gracia,
    eventoSelector: f.evento_selector,
    ultimaRevisionAt: f.ultima_revision_at,
  }));
}

async function fetchDatosHato(supabase: ClienteSupabase, hoy: string): Promise<DatosHatoParaPaquete> {
  const [filasHatoConfig, filasEstadoActual, chequeoMasReciente, pesajesRecientes, eventosRecientes, sinRaza] = await Promise.all([
    paginar<FilaHatoConfig>((d, h) => supabase.from('hato_config').select('clave,valor').range(d, h)),
    paginar<HatoEstadoActualRow>((d, h) => supabase.from('v_hato_estado_actual').select('*').range(d, h)),
    supabase.from('hato_chequeos').select('fecha').order('fecha', { ascending: false }).limit(1),
    paginar<{ fecha: string; litros_total: number }>((d, h) =>
      supabase.from('hato_pesajes_leche').select('fecha,litros_total').gte('fecha', sumarDiasISO(hoy, -30)).range(d, h),
    ),
    paginar<{ tipo: string; fecha: string }>((d, h) =>
      supabase
        .from('hato_eventos')
        .select('tipo,fecha')
        .in('tipo', ['servicio', 'confirmacion_prenez'])
        .gte('fecha', sumarDiasISO(hoy, -90))
        .range(d, h),
    ),
    supabase.from('hato_animales').select('id', { count: 'exact', head: true }).eq('estado', 'activa').is('raza', null),
  ]);

  if (chequeoMasReciente.error) throw new Error(chequeoMasReciente.error.message);
  if (sinRaza.error) throw new Error(sinRaza.error.message);

  return {
    filasHatoConfig,
    filasEstadoActual,
    fechaUltimoChequeo: chequeoMasReciente.data?.[0]?.fecha ?? null,
    pesajesRecientes,
    eventosRecientes,
    cantidadSinRaza: sinRaza.count ?? 0,
    revisiones: [], // se completa en `crearDependenciasSupabase.fetchHato`
    hoy,
  };
}

const LOOKBACK_MONITOREOS_DIAS = 200; // igual que chat.tsx / usePriorizacionMonitoreo
const LOOKBACK_FUMIGACIONES_DIAS = 730;

async function fetchDatosAguacate(supabase: ClienteSupabase, hoy: string): Promise<DatosAguacateParaPaquete> {
  const desdeMonitoreos = sumarDiasISO(hoy, -LOOKBACK_MONITOREOS_DIAS);
  const desdeFumigaciones = sumarDiasISO(hoy, -LOOKBACK_FUMIGACIONES_DIAS);

  interface FilaMonitoreoDb {
    fecha_monitoreo: string;
    ronda_id: string;
    lote_id: string;
    sublote_id: string | null;
    plaga_enfermedad_id: string;
    arboles_monitoreados: number;
    arboles_afectados: number;
    incidencia: number;
    lote: { nombre: string } | { nombre: string }[] | null;
    sublote: { nombre: string } | { nombre: string }[] | null;
    plaga: { nombre: string } | { nombre: string }[] | null;
  }
  function primero<T>(v: T | T[] | null): T | undefined {
    if (v === null) return undefined;
    return Array.isArray(v) ? v[0] : v;
  }

  const [
    filasMonitoreoDb,
    umbrales,
    perfilesEstacionales,
    movimientos,
    rondaActualRows,
    sublotesRows,
    aplicacionesRows,
    tareasRows,
    registrosRows,
    climaRows,
  ] = await Promise.all([
    paginar<FilaMonitoreoDb>((d, h) =>
      supabase
        .from('monitoreos')
        .select(
          'fecha_monitoreo,ronda_id,lote_id,sublote_id,plaga_enfermedad_id,arboles_monitoreados,arboles_afectados,incidencia,lote:lotes(nombre),sublote:sublotes(nombre),plaga:plagas_enfermedades_catalogo(nombre)',
        )
        .gte('fecha_monitoreo', desdeMonitoreos)
        .range(d, h),
    ),
    paginar<UmbralEconomico>((d, h) => supabase.from('pest_umbral_economico').select('pest_id,grupo_key,umbral_pct,source_label').range(d, h)),
    paginar<PerfilEstacional>((d, h) =>
      supabase.from('pest_seasonal_profile').select('pest_id,lote_id,week_of_year,historical_tier,n_years_observed').range(d, h),
    ),
    paginar<{ lote_id: string; fecha_movimiento: string }>((d, h) =>
      supabase.from('movimientos_diarios').select('lote_id,fecha_movimiento').not('lote_id', 'is', null).gte('fecha_movimiento', desdeFumigaciones).range(d, h),
    ),
    supabase.from('rondas_monitoreo').select('id').order('fecha_inicio', { ascending: false }).limit(1),
    paginar<{ id: string; nombre: string; lote_id: string; lote: { nombre: string; activo: boolean | null } | { nombre: string; activo: boolean | null }[] | null }>(
      (d, h) => supabase.from('sublotes').select('id,nombre,lote_id,lote:lotes(nombre,activo)').range(d, h),
    ),
    paginar<{
      id: string;
      nombre_aplicacion: string | null;
      estado: 'Calculada' | 'En ejecución' | 'Cerrada' | null;
      fecha_inicio_planeada: string | null;
      created_at: string | null;
    }>((d, h) =>
      supabase
        .from('aplicaciones')
        .select('id,nombre_aplicacion,estado,fecha_inicio_planeada,created_at')
        .in('estado', ['Calculada', 'En ejecución'])
        .range(d, h),
    ),
    paginar<{ id: string; nombre: string; estado: string | null; fecha_estimada_inicio: string | null; created_at: string | null }>((d, h) =>
      supabase
        .from('tareas')
        .select('id,nombre,estado,fecha_estimada_inicio,created_at')
        .in('estado', ['Banco', 'Programada', 'En Proceso'])
        .range(d, h),
    ),
    paginar<{ fecha_trabajo: string; fraccion_jornal: number | string }>((d, h) =>
      supabase.from('registros_trabajo').select('fecha_trabajo,fraccion_jornal').gte('fecha_trabajo', sumarDiasISO(hoy, -13)).range(d, h),
    ),
    paginar<{ fecha: string; lluvia_confianza: 'ok' | 'contador_congelado' | 'sin_time_piezo' | null }>((d, h) =>
      supabase.from('clima_resumen_diario').select('fecha,lluvia_confianza').gte('fecha', sumarDiasISO(hoy, -10)).range(d, h),
    ),
  ]);

  if (rondaActualRows.error) throw new Error(rondaActualRows.error.message);

  const filasMonitoreo: FilaMonitoreoParaPaquete[] = filasMonitoreoDb.map((f) => ({
    fecha_monitoreo: f.fecha_monitoreo,
    ronda_id: f.ronda_id,
    lote_id: f.lote_id,
    sublote_id: f.sublote_id,
    plaga_enfermedad_id: f.plaga_enfermedad_id,
    arboles_monitoreados: f.arboles_monitoreados,
    arboles_afectados: f.arboles_afectados,
    incidencia: f.incidencia,
    lote_nombre: primero(f.lote)?.nombre,
    sublote_nombre: primero(f.sublote)?.nombre,
    pest_nombre: primero(f.plaga)?.nombre,
  }));

  const sublotesEnAlcance: SubloteEnAlcance[] = sublotesRows
    .filter((s) => primero(s.lote)?.activo === true)
    .map((s) => ({ sublote_id: s.id, sublote_nombre: s.nombre, lote_id: s.lote_id, lote_nombre: primero(s.lote)?.nombre }));

  const aplicaciones: FilaAplicacionParaPaquete[] = aplicacionesRows.map((a) => ({
    id: a.id,
    nombre: a.nombre_aplicacion ?? 'Aplicación sin nombre',
    estado: (a.estado ?? 'Calculada') as 'Calculada' | 'En ejecución' | 'Cerrada',
    fechaInicioPlaneada: a.fecha_inicio_planeada,
    createdAt: a.created_at ?? hoy,
  }));

  const idsAplicaciones = aplicaciones.map((a) => a.id);
  let aplicacionesMezclas: FilaAplicacionMezclaParaPaquete[] = [];
  let aplicacionesProductosCrudo: Array<{ mezcla_id: string; producto_id: string; producto_nombre: string; producto_unidad: string; cantidad_total_necesaria: number }> = [];
  let stockPorProducto = new Map<string, number | null>();

  if (idsAplicaciones.length > 0) {
    const filasMezclasDb = await paginar<{ id: string; aplicacion_id: string }>((d, h) =>
      supabase.from('aplicaciones_mezclas').select('id,aplicacion_id').in('aplicacion_id', idsAplicaciones).range(d, h),
    );
    aplicacionesMezclas = filasMezclasDb.map((m) => ({ id: m.id, aplicacionId: m.aplicacion_id }));

    const idsMezclas = aplicacionesMezclas.map((m) => m.id);
    if (idsMezclas.length > 0) {
      aplicacionesProductosCrudo = await paginar((d, h) =>
        supabase
          .from('aplicaciones_productos')
          .select('mezcla_id,producto_id,producto_nombre,producto_unidad,cantidad_total_necesaria')
          .in('mezcla_id', idsMezclas)
          .range(d, h),
      );
    }

    const idsProductos = [...new Set(aplicacionesProductosCrudo.map((p) => p.producto_id))];
    if (idsProductos.length > 0) {
      const filasStock = await paginar<{ id: string; cantidad_actual: number | null }>((d, h) =>
        supabase.from('productos').select('id,cantidad_actual').in('id', idsProductos).range(d, h),
      );
      stockPorProducto = new Map(filasStock.map((p) => [p.id, p.cantidad_actual]));
    }
  }

  const aplicacionesProductos: FilaAplicacionProductoParaPaquete[] = aplicacionesProductosCrudo.map((p) => ({
    mezclaId: p.mezcla_id,
    productoId: p.producto_id,
    productoNombre: p.producto_nombre,
    productoUnidad: p.producto_unidad,
    cantidadNecesaria: p.cantidad_total_necesaria,
  }));

  const stockProductos: DatosAguacateParaPaquete['stockProductos'] = Array.from(stockPorProducto.entries()).map(
    ([productoId, cantidadActual]) => ({ productoId, cantidadActual }),
  );

  const tareasAbiertas: FilaTareaParaPaquete[] = tareasRows.map((t) => ({
    id: t.id,
    nombre: t.nombre,
    estado: t.estado ?? 'Banco',
    fechaEstimadaInicio: t.fecha_estimada_inicio,
    createdAt: t.created_at ?? hoy,
  }));

  const registrosTrabajo: FilaRegistroTrabajoParaPaquete[] = registrosRows.map((r) => ({
    fecha: r.fecha_trabajo,
    fraccionJornal: parseFloat(String(r.fraccion_jornal)) || 0,
  }));

  const climaReciente: FilaClimaParaPaquete[] = climaRows.map((c) => ({ fecha: c.fecha, lluviaConfianza: c.lluvia_confianza }));

  return {
    filasMonitoreo,
    umbrales,
    perfilesEstacionales,
    ultimasFumigaciones: movimientos.map((m) => ({ lote_id: m.lote_id, fecha: m.fecha_movimiento })),
    rondaActualId: rondaActualRows.data?.[0]?.id ?? null,
    sublotesEnAlcance,
    aplicaciones,
    aplicacionesMezclas,
    aplicacionesProductos,
    stockProductos,
    tareasAbiertas,
    registrosTrabajo,
    climaReciente,
    revisiones: [],
    hoy,
  };
}

async function fetchDatosGanado(supabase: ClienteSupabase, hoy: string): Promise<DatosGanadoParaPaquete> {
  const hace30 = sumarDiasISO(hoy, -30);
  const [ubicaciones, fincas, potreros, inventario, movimientos30d, pendientes] = await Promise.all([
    paginar<GanUbicacionRow>((d, h) => supabase.from('gan_ubicaciones').select('id,nombre').range(d, h)),
    paginar<GanFincaRow>((d, h) => supabase.from('gan_fincas').select('id,nombre,ubicacion_id,hectareas,activa').range(d, h)),
    paginar<GanPotreroRow>((d, h) => supabase.from('gan_potreros').select('id,nombre,finca_id,activo').range(d, h)),
    paginar<GanInventarioRow>((d, h) => supabase.from('gan_inventario').select('potrero_id,novillos,toros,peso_promedio_kg,updated_at').range(d, h)),
    paginar<GanMovimientoRow>((d, h) =>
      supabase
        .from('gan_movimientos')
        .select('tipo,estado,fecha,novillos_delta,toros_delta,potrero_origen_id,potrero_destino_id,peso_promedio_kg,notas')
        .eq('estado', 'confirmado')
        .gte('fecha', hace30)
        .range(d, h),
    ),
    paginar<GanMovimientoRow>((d, h) =>
      supabase.from('gan_movimientos').select('id,tipo,fecha,novillos_delta,toros_delta,peso_promedio_kg,notas').eq('estado', 'pendiente').range(d, h),
    ),
  ]);

  return { ubicaciones, fincas, potreros, inventario, movimientos30d, pendientes, revisiones: [], hoy };
}

/** Único punto que conecta este módulo con un cliente de Supabase real --
 *  usado por `acciones-tick.ts`. Todo lo demás recibe dependencias
 *  inyectadas y es testeable sin abrir una conexión (`acciones-paquete.ts`). */
export function crearDependenciasSupabase(supabase: ClienteSupabase): DependenciasEnsamblador {
  return {
    async fetchHato(hoy, revisiones) {
      const datos = await fetchDatosHato(supabase, hoy);
      return { ...datos, revisiones };
    },
    async fetchAguacate(hoy, revisiones) {
      const datos = await fetchDatosAguacate(supabase, hoy);
      return { ...datos, revisiones };
    },
    async fetchGanado(hoy, revisiones) {
      const datos = await fetchDatosGanado(supabase, hoy);
      return { ...datos, revisiones };
    },
    fetchRevisiones: () => cargarRevisionesPeriodicas(supabase),
  };
}
