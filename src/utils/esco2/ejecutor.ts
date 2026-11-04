// Ejecutor determinista de `consultar_labores`. Todas las cifras se calculan aquí.
// Reglas de datos:
//  - Un registro sin lote nunca se reparte ni se descarta en silencio: forma su propio grupo.
//  - Un filtro que no resuelve deja la parte en `no_resuelto` y sin cifras. Ignorar el
//    filtro y sumar todo sería responder otra pregunta.
//  - `hasta` se recorta a "hoy": el núcleo no ve registros posteriores a la pregunta.
//  - Costo nulo ≠ costo cero: si algún registro del grupo no tiene costo, el costo del grupo es null.

import { resolverCategorias, resolverLotes, resolverTareas } from './catalogo.ts';
import { lunesDe } from './fechaCalendario.ts';
import type {
  Agrupacion,
  ConsultaLabores,
  DatosLabores,
  FilaResultado,
  RegistroTrabajo,
  ResultadoParte,
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
    return { id, proposito: c.proposito, estado: 'no_resuelto', alcance, no_resueltos: noResueltos, filas: [], total: {}, cobertura: vacio };
  }

  const tareaPorId = new Map(datos.tareas.map((t) => [t.id, t]));
  const loteNombre = new Map(datos.lotes.map((l) => [l.id, l.nombre]));
  const categoriaDeTipo = new Map(datos.tiposTareas.map((t) => [t.id, t.categoria]));
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
      case 'mes':
        return r.fecha_trabajo.slice(0, 7);
      case 'semana':
        return `semana del ${lunesDe(r.fecha_trabajo)}`;
    }
  };

  const total = metricas(filtrados);
  const grupos = new Map<string, { grupo: Partial<Record<Agrupacion, string>>; registros: RegistroTrabajo[]; tareaId?: string }>();
  if (c.agrupar_por.length > 0) {
    for (const r of filtrados) {
      const grupo: Partial<Record<Agrupacion, string>> = {};
      for (const g of c.agrupar_por) grupo[g] = etiqueta(r, g);
      const clave = JSON.stringify(grupo) + (c.agrupar_por.includes('tarea') ? `|${r.tarea_id}` : '');
      const actual = grupos.get(clave) ?? { grupo, registros: [], tareaId: r.tarea_id };
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

  const totalJ = total.jornales ?? 0;
  let filas: FilaResultado[] = [...grupos.values()].map(({ grupo, registros, tareaId }) => {
    const v = metricas(registros);
    const fila: FilaResultado = { grupo, ...proyectar(v, c) };
    fila.porcentaje_jornales = totalJ > 0 ? Math.round(((v.jornales ?? 0) / totalJ) * 1000) / 10 : 0;
    if (c.incluir_estado_tarea && c.agrupar_por.includes('tarea') && tareaId) {
      const t = tareaPorId.get(tareaId);
      fila.estado_tarea = t?.estado ?? null;
      fila.jornales_estimados = t?.jornales_estimados ?? null;
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
    total: proyectar(total, c),
    cobertura: {
      registros: filtrados.length,
      registros_sin_lote: filtrados.filter((r) => r.lote_id === null).length,
      registros_sin_costo: filtrados.filter((r) => r.costo_jornal === null).length,
      grupos_totales: gruposTotales,
      grupos_mostrados: filas.length,
    },
  };
}
