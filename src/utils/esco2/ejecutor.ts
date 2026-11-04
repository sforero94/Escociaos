// Ejecutor determinista de `consultar_labores`. Todas las cifras se calculan aquí.
// Reglas de datos:
//  - Un registro sin lote nunca se reparte ni se descarta en silencio: forma su propio grupo.
//  - Un filtro que no resuelve deja la parte en `no_resuelto` y sin cifras. Ignorar el
//    filtro y sumar todo sería responder otra pregunta.
//  - `hasta` se recorta a "hoy": el núcleo no ve registros posteriores a la pregunta.
//  - Costo nulo ≠ costo cero: si algún registro del grupo no tiene costo, el costo del grupo es null.
//  - Las razones (por árbol, por hectárea, costo por jornal) las calcula este código; sin base
//    en el catálogo, sin costo o sin jornales son null y `notas` dice por qué. Nunca 0.
//  - D30: toda consulta que filtra por categoría de tarea entrega, aparte de los jornales
//    registrados, los jornales estimados de esas tareas. Nunca se mezclan ni uno reemplaza al otro.

import { resolverCategorias, resolverLotes, resolverTareas } from './catalogo.ts';
import { lunesDe } from './fechaCalendario.ts';
import type {
  Agrupacion,
  ConsultaLabores,
  DatosLabores,
  EstimadosCategoria,
  FilaResultado,
  Lote,
  RegistroTrabajo,
  ResultadoParte,
  Tarea,
  ValoresMetricas,
} from './tipos.ts';

export const SIN_LOTE_ETIQUETA = '(sin lote)';

/** Redondeo a 2 decimales sin arrastre binario (las fracciones son múltiplos de 0,25). */
function r2(n: number): number {
  return Math.round(n * 100) / 100;
}

function metricas(registros: RegistroTrabajo[]): ValoresMetricas {
  const fechas = registros.map((r) => r.fecha_trabajo).sort();
  const sinCosto = registros.some((r) => r.costo_jornal === null);
  return {
    jornales: r2(registros.reduce((s, r) => s + r.fraccion_jornal, 0)),
    costo: sinCosto ? null : Math.round(registros.reduce((s, r) => s + (r.costo_jornal ?? 0), 0)),
    dias_con_registro: new Set(fechas).size,
    primer_registro: fechas[0] ?? null,
    ultimo_registro: fechas[fechas.length - 1] ?? null,
  };
}

/** Base de una razón: los lotes cuyo catálogo da el denominador. null = no hay lotes de referencia. */
type BaseLotes = Lote[] | null;

function razones(v: ValoresMetricas, base: BaseLotes, c: ConsultaLabores, etiqueta: string, notas: Set<string>): ValoresMetricas {
  const salida: ValoresMetricas = {};
  const jornales = v.jornales ?? 0;
  if (c.metricas.includes('costo_por_jornal')) {
    if (v.costo === null || v.costo === undefined) {
      salida.costo_por_jornal = null;
      notas.add(`costo_por_jornal (${etiqueta}): algún registro no tiene costo, no se calcula`);
    } else if (jornales <= 0) {
      salida.costo_por_jornal = null;
      notas.add(`costo_por_jornal (${etiqueta}): sin jornales`);
    } else {
      salida.costo_por_jornal = Math.round(v.costo / jornales);
    }
  }
  const porBase = (metrica: 'jornales_por_arbol' | 'jornales_por_hectarea', campo: 'total_arboles' | 'area_hectareas', decimales: number) => {
    if (!c.metricas.includes(metrica)) return;
    if (base === null) {
      salida[metrica] = null;
      notas.add(`${metrica} (${etiqueta}): sin lotes de referencia; la razón se calcula por lote (agrupa por lote o nombra lotes)`);
      return;
    }
    if (base.length === 0) {
      salida[metrica] = null;
      notas.add(`${metrica} (${etiqueta}): sin lote asignado, no hay árboles ni hectáreas de referencia`);
      return;
    }
    const sinBase = base.filter((l) => !((l[campo] ?? 0) > 0));
    if (sinBase.length > 0) {
      salida[metrica] = null;
      notas.add(`${metrica} (${etiqueta}): sin ${campo === 'total_arboles' ? 'árboles' : 'hectáreas'} registrados en el catálogo para ${sinBase.map((l) => l.nombre).join(', ')}`);
      return;
    }
    const denominador = base.reduce((s, l) => s + (l[campo] ?? 0), 0);
    const f = 10 ** decimales;
    salida[metrica] = Math.round((jornales / denominador) * f) / f;
  };
  porBase('jornales_por_arbol', 'total_arboles', 4);
  porBase('jornales_por_hectarea', 'area_hectareas', 3);
  return salida;
}

function proyectar(v: ValoresMetricas, c: ConsultaLabores): ValoresMetricas {
  const salida: ValoresMetricas = {};
  // jornales siempre viaja: es la base del orden, del límite y del porcentaje.
  salida.jornales = v.jornales;
  for (const m of c.metricas) {
    if (m === 'jornales') continue;
    (salida as Record<string, unknown>)[m] = v[m];
  }
  return salida;
}

export function ejecutarConsulta(c: ConsultaLabores, datos: DatosLabores, hoy: string, id: string): ResultadoParte {
  const hasta = c.hasta > hoy ? hoy : c.hasta;
  const lotes = resolverLotes(c.lotes, datos.lotes);
  const tareas = resolverTareas(c.tareas, datos.tareas, datos.tiposTareas);
  const categorias = resolverCategorias(c.categorias, datos);
  const noResueltos = [...lotes.noResueltos, ...tareas.noResueltos, ...categorias.noResueltos];

  const alcance: ResultadoParte['alcance'] = {
    desde: c.desde,
    hasta,
    hasta_recortado_a_hoy: hasta !== c.hasta,
    lotes: c.lotes.length ? lotes.nombres : 'todos',
    tareas: c.tareas.length ? tareas.nombres : 'todas',
    categorias: c.categorias.length ? categorias.nombres : 'todas',
    sin_lote: c.lotes.length ? 'excluir' : c.sin_lote,
    agrupar_por: c.agrupar_por,
  };
  const vacio = { registros: 0, registros_sin_lote: 0, registros_sin_costo: 0, grupos_totales: 0, grupos_mostrados: 0 };

  if (noResueltos.length > 0) {
    return { id, proposito: c.proposito, estado: 'no_resuelto', alcance, no_resueltos: noResueltos, filas: [], total: {}, notas: [], cobertura: vacio };
  }

  const tareaPorId = new Map(datos.tareas.map((t) => [t.id, t]));
  const loteNombre = new Map(datos.lotes.map((l) => [l.id, l.nombre]));
  const categoriaDeTipo = new Map(datos.tiposTareas.map((t) => [t.id, t.categoria]));
  const tipoNombre = new Map(datos.tiposTareas.map((t) => [t.id, t.nombre.trim()]));
  const tipoDeTarea = (tareaId: string): string | null => {
    const t = tareaPorId.get(tareaId);
    return t?.tipo_tarea_id ? (tipoNombre.get(t.tipo_tarea_id) ?? null) : null;
  };
  const aplicacionDeTarea = new Map((datos.aplicaciones ?? []).map((a) => [a.tarea_id, a]));
  const categoriaDeTarea = (tareaId: string): string | null => {
    const t = tareaPorId.get(tareaId);
    return t?.tipo_tarea_id ? (categoriaDeTipo.get(t.tipo_tarea_id) ?? null) : null;
  };

  // Tareas que pasan los filtros de tarea y categoría (la intersección, si hay ambos).
  const tareaPasa = (tareaId: string): boolean => {
    if (c.tareas.length && !tareas.ids.has(tareaId)) return false;
    if (c.categorias.length) {
      const t = tareaPorId.get(tareaId);
      if (!t?.tipo_tarea_id || !categorias.tipoIds.has(t.tipo_tarea_id)) return false;
    }
    return true;
  };

  const filtrados = datos.registros.filter((r) => {
    if (r.fecha_trabajo < c.desde || r.fecha_trabajo > hasta) return false;
    if (!tareaPasa(r.tarea_id)) return false;
    if (c.lotes.length) return r.lote_id !== null && lotes.ids.has(r.lote_id);
    if (c.sin_lote === 'excluir') return r.lote_id !== null;
    if (c.sin_lote === 'solo') return r.lote_id === null;
    return true;
  });

  const etiqueta = (r: RegistroTrabajo, g: Agrupacion): string => {
    switch (g) {
      case 'lote':
        return r.lote_id ? (loteNombre.get(r.lote_id) ?? r.lote_id) : SIN_LOTE_ETIQUETA;
      case 'tarea':
        return tareaPorId.get(r.tarea_id)?.nombre.trim() ?? r.tarea_id;
      case 'categoria':
        return categoriaDeTarea(r.tarea_id) ?? '(sin categoría)';
      case 'tipo_tarea':
        return tipoDeTarea(r.tarea_id) ?? '(sin tipo)';
      case 'dia':
        return r.fecha_trabajo;
      case 'mes':
        return r.fecha_trabajo.slice(0, 7);
      case 'semana':
        return `semana del ${lunesDe(r.fecha_trabajo)}`;
    }
  };

  const total = metricas(filtrados);
  const notas = new Set<string>();
  const agrupaLote = c.agrupar_por.includes('lote');
  const soloAgrupacion = c.agrupar_por.length === 1 ? c.agrupar_por[0] : null;
  // Lotes de referencia para las razones: el lote de la fila si se agrupa por lote; si no, los lotes nombrados.
  const lotesNombrados: Lote[] = c.lotes.length ? datos.lotes.filter((l) => lotes.ids.has(l.id)) : [];
  const grupos = new Map<string, { grupo: Partial<Record<Agrupacion, string>>; registros: RegistroTrabajo[]; tareaId?: string; loteId?: string | null }>();
  if (c.agrupar_por.length > 0) {
    for (const r of filtrados) {
      const grupo: Partial<Record<Agrupacion, string>> = {};
      for (const g of c.agrupar_por) grupo[g] = etiqueta(r, g);
      const clave = JSON.stringify(grupo) + (c.agrupar_por.includes('tarea') ? `|${r.tarea_id}` : '');
      const actual = grupos.get(clave) ?? { grupo, registros: [], tareaId: r.tarea_id, loteId: r.lote_id };
      actual.registros.push(r);
      grupos.set(clave, actual);
    }
    // Tareas filtradas sin registros: solo cuando se pidió su estado y se agrupa únicamente por tarea.
    if (c.incluir_estado_tarea && c.agrupar_por.length === 1 && c.agrupar_por[0] === 'tarea' && (c.tareas.length || c.categorias.length)) {
      for (const t of datos.tareas) {
        if (!tareaPasa(t.id)) continue;
        const clave = JSON.stringify({ tarea: t.nombre.trim() }) + `|${t.id}`;
        if (!grupos.has(clave)) grupos.set(clave, { grupo: { tarea: t.nombre.trim() }, registros: [], tareaId: t.id });
      }
    }
  }

  // D30: los estimados viajan siempre que se filtra por categoría de tarea.
  const conEstimados = c.categorias.length > 0;
  const tareasConRegistro = new Set(filtrados.map((r) => r.tarea_id));
  const tareasEstimadas: Tarea[] = conEstimados
    ? datos.tareas.filter((t) => tareaPasa(t.id) && (c.lotes.length === 0 || tareasConRegistro.has(t.id)))
    : [];
  const sumaEstimados = (ts: Tarea[]): number | null => {
    const con = ts.filter((t) => t.jornales_estimados !== null);
    if (con.length < ts.length) notas.add('jornales_estimados: las tareas sin estimado no suman');
    return con.length === 0 ? null : r2(con.reduce((s2, t) => s2 + (t.jornales_estimados ?? 0), 0));
  };
  const estimados: EstimadosCategoria | undefined = conEstimados
    ? {
        jornales_estimados: r2(tareasEstimadas.reduce((s2, t) => s2 + (t.jornales_estimados ?? 0), 0)),
        tareas_en_alcance: tareasEstimadas.length,
        tareas_sin_estimado: tareasEstimadas.filter((t) => t.jornales_estimados === null).length,
        base: c.lotes.length ? 'tareas_con_registros_en_los_lotes' : 'toda_la_categoria',
      }
    : undefined;
  const estimadoDeFila = (grupo: Partial<Record<Agrupacion, string>>, tareaId: string | undefined): number | null | undefined => {
    // Un estimado por fila solo tiene sentido cuando la fila ES la tarea, el tipo o la categoría.
    if (soloAgrupacion === 'tarea') {
      const t = tareaId ? tareaPorId.get(tareaId) : undefined;
      return c.incluir_estado_tarea || conEstimados ? (t?.jornales_estimados ?? null) : undefined;
    }
    if (!conEstimados) return undefined;
    if (soloAgrupacion === 'categoria') return sumaEstimados(tareasEstimadas.filter((t) => (categoriaDeTarea(t.id) ?? '(sin categoría)') === grupo.categoria));
    if (soloAgrupacion === 'tipo_tarea') return sumaEstimados(tareasEstimadas.filter((t) => (tipoDeTarea(t.id) ?? '(sin tipo)') === grupo.tipo_tarea));
    return undefined;
  };

  const baseDeFila = (loteId: string | null | undefined): BaseLotes => {
    if (agrupaLote) {
      if (!loteId) return [];
      const l = datos.lotes.find((x) => x.id === loteId);
      return l ? [l] : [];
    }
    return lotesNombrados.length ? lotesNombrados : null;
  };

  const totalJ = total.jornales ?? 0;
  let filas: FilaResultado[] = [...grupos.values()].map(({ grupo, registros, tareaId, loteId }) => {
    const v = metricas(registros);
    const etiquetaFila = Object.values(grupo).join(' · ');
    const fila: FilaResultado = { grupo, ...proyectar({ ...v, ...razones(v, baseDeFila(loteId), c, etiquetaFila, notas) }, c) };
    fila.porcentaje_jornales = totalJ > 0 ? Math.round(((v.jornales ?? 0) / totalJ) * 1000) / 10 : 0;
    const est = estimadoDeFila(grupo, tareaId);
    if (est !== undefined) fila.jornales_estimados = est;
    if (c.incluir_estado_tarea && c.agrupar_por.includes('tarea') && tareaId) {
      const t = tareaPorId.get(tareaId);
      fila.estado_tarea = t?.estado ?? null;
      // Fechas planeadas y reales: solo si la fuente las leyó (undefined = no cargadas, no "sin fecha").
      if (t && t.fecha_estimada_inicio !== undefined) {
        fila.fechas_tarea = {
          estimada_inicio: t.fecha_estimada_inicio ?? null,
          estimada_fin: t.fecha_estimada_fin ?? null,
          real_inicio: t.fecha_inicio_real ?? null,
          real_fin: t.fecha_fin_real ?? null,
        };
      }
      if (datos.aplicaciones !== undefined) {
        const a = aplicacionDeTarea.get(tareaId);
        fila.aplicacion = a ? { codigo: a.codigo_aplicacion, nombre: a.nombre_aplicacion, estado: a.estado } : null;
      }
    }
    return fila;
  });
  filas.sort((a, b) => (b.jornales ?? 0) - (a.jornales ?? 0) || JSON.stringify(a.grupo).localeCompare(JSON.stringify(b.grupo)));
  const gruposTotales = filas.length;
  if (c.limite !== null) filas = filas.slice(0, c.limite);

  return {
    id,
    proposito: c.proposito,
    estado: filtrados.length === 0 && filas.length === 0 ? 'sin_registros' : 'ok',
    alcance,
    no_resueltos: [],
    filas,
    total: proyectar({ ...total, ...razones(total, lotesNombrados.length ? lotesNombrados : null, c, 'total', notas) }, c),
    ...(estimados ? { estimados } : {}),
    notas: [...notas].sort(),
    cobertura: {
      registros: filtrados.length,
      registros_sin_lote: filtrados.filter((r) => r.lote_id === null).length,
      registros_sin_costo: filtrados.filter((r) => r.costo_jornal === null).length,
      grupos_totales: gruposTotales,
      grupos_mostrados: filas.length,
    },
  };
}
