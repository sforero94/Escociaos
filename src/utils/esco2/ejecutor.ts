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
import { falloFuente, metadatosTarea, semantica } from './semantica.ts';
import { lunesDe } from './fechaCalendario.ts';
import type { Agrupacion, ConsultaLabores, DatosLabores, EstimadosCategoria, FilaResultado, Lote, RegistroTrabajo, ResultadoParte, Tarea, ValoresMetricas, } from './tipos.ts';
export const SIN_LOTE_ETIQUETA = '(sin lote)';
/** Redondeo a 2 decimales sin arrastre binario (las fracciones son múltiplos de 0,25). */
function r2(n: number): number {
    return Math.round(n * 100) / 100;
}
export function metricas(registros: RegistroTrabajo[]): ValoresMetricas {
    const fechas = registros.map((r) => r.fecha_trabajo).sort();
    const sinCosto = registros.some((r) => r.costo_jornal === null);
    return {
        jornales: r2(registros.reduce((s, r) => s + r.fraccion_jornal, 0)),
        costo: sinCosto ? null : registros.reduce((s, r) => s + (r.costo_jornal ?? 0), 0),
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
        }
        else if (jornales <= 0) {
            salida.costo_por_jornal = null;
            notas.add(`costo_por_jornal (${etiqueta}): sin jornales`);
        }
        else {
            salida.costo_por_jornal = Math.round(v.costo / jornales);
        }
    }
    const porBase = (metrica: 'jornales_por_arbol' | 'jornales_por_hectarea', campo: 'total_arboles' | 'area_hectareas', decimales: number) => {
        if (!c.metricas.includes(metrica))
            return;
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
        const sinBase = base.filter((l) => !(Number.isFinite(l[campo]) && (l[campo] ?? 0) > 0));
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
        if (m === 'jornales')
            continue;
        (salida as Record<string, unknown>)[m] = v[m];
    }
    return salida;
}
export function ejecutarConsulta(c: ConsultaLabores, datos: DatosLabores, hoy: string, id: string): ResultadoParte {
    const hasta = c.cohorte === 'tarea_programada' ? c.hasta : c.hasta > hoy ? hoy : c.hasta;
    const falloPrevio = falloFuente(c, datos);
    if (falloPrevio)
        return { id, proposito: 'Consulta de labores', estado: 'no_disponible', alcance: { desde: c.desde, hasta, hasta_recortado_a_hoy: hasta !== c.hasta, lotes: 'todos', tareas: 'todas', categorias: 'todas', sin_lote: c.sin_lote, agrupar_por: c.agrupar_por }, no_resueltos: [], filas: [], total: {}, notas: [], cobertura: { registros: 0, registros_sin_lote: 0, registros_sin_costo: 0, grupos_totales: 0, grupos_mostrados: 0 }, semantica: { ...semantica(c, [], []), disposicion: 'fuente_no_disponible', motivo: falloPrevio } };
    const lotes = resolverLotes(c.lotes, datos.lotes);
    const tareas = resolverTareas(c.tareas, datos.tareas, datos.tiposTareas);
    const categorias = resolverCategorias(c.categorias, datos);
    if (c.lote_ids?.length) {
        lotes.ids = new Set([...lotes.ids].filter(id => c.lote_ids!.includes(id)));
        if (!c.lotes.length)
            lotes.ids = new Set(c.lote_ids);
        lotes.nombres = datos.lotes.filter(l => lotes.ids.has(l.id)).map(l => l.nombre);
    }
    if (c.tarea_ids?.length) {
        tareas.ids = new Set([...tareas.ids].filter(id => c.tarea_ids!.includes(id)));
        if (!c.tareas.length)
            tareas.ids = new Set(c.tarea_ids);
        tareas.nombres = datos.tareas.filter(t => tareas.ids.has(t.id)).map(t => t.nombre);
    }
    const tieneLotes = c.lotes.length > 0 || !!c.lote_ids?.length;
    const tieneTareas = c.tareas.length > 0 || !!c.tarea_ids?.length;
    const noResueltos = [...lotes.noResueltos, ...tareas.noResueltos, ...categorias.noResueltos];
    const alcance: ResultadoParte['alcance'] = {
        desde: c.desde,
        hasta,
        lote_ids: tieneLotes ? [...lotes.ids].sort() : undefined,
        tarea_ids: tieneTareas ? [...tareas.ids].sort() : undefined,
        hasta_recortado_a_hoy: hasta !== c.hasta,
        lotes: tieneLotes ? lotes.nombres : 'todos',
        tareas: tieneTareas ? tareas.nombres : 'todas',
        categorias: c.categorias.length ? categorias.nombres : 'todas',
        sin_lote: tieneLotes ? 'excluir' : c.sin_lote,
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
    const categoriaDeTarea = (tareaId: string): string | null => {
        const t = tareaPorId.get(tareaId);
        return t?.tipo_tarea_id ? (categoriaDeTipo.get(t.tipo_tarea_id) ?? null) : null;
    };
    // Tareas que pasan los filtros de tarea y categoría (la intersección, si hay ambos).
    const tareaPasa = (tareaId: string): boolean => {
        if (tieneTareas && !tareas.ids.has(tareaId))
            return false;
        if (c.categorias.length) {
            const t = tareaPorId.get(tareaId);
            if (!t?.tipo_tarea_id || !categorias.tipoIds.has(t.tipo_tarea_id))
                return false;
        }
        return true;
    };
    if (c.cohorte === 'tarea_programada') {
        const selected = datos.tareas.filter(t => tareaPasa(t.id) && t.fecha_estimada_inicio !== null && t.fecha_estimada_inicio! >= c.desde && t.fecha_estimada_inicio! <= hasta && (!tieneLotes || t.lote_ids!.some(id => lotes.ids.has(id))) && (tieneLotes || c.sin_lote === 'incluir' || (c.sin_lote === 'solo' ? t.lote_ids!.length === 0 : t.lote_ids!.length > 0)));
        const filas: FilaResultado[] = selected.sort((a, b) => a.id.localeCompare(b.id)).map(t => ({ grupo: { tarea: t.nombre }, grupo_ids: { tarea: t.id }, fuentes: [t.id], ...metadatosTarea(t, datos) }));
        const sin = selected.filter(t => t.jornales_estimados === null).length;
        const desconocidos = selected.filter(t => t.jornales_estimados !== null && (!Number.isFinite(t.jornales_estimados) || t.jornales_estimados! < 0) || datos.fuente?.camposNoDisponibles?.includes('tareas.jornales_estimados')).length;
        return { id, proposito: 'Tareas programadas', estado: filas.length ? 'ok' : 'sin_registros', alcance, no_resueltos: [], filas, total: {}, notas: [], cobertura: { ...vacio, grupos_totales: filas.length, grupos_mostrados: filas.length }, semantica: semantica(c, selected.map(t => t.id), selected.map(t => t.id)), ...(c.categorias.length ? { estimados: { jornales_estimados: r2(selected.reduce((n, t) => n + (Number.isFinite(t.jornales_estimados) && t.jornales_estimados! >= 0 && !datos.fuente?.camposNoDisponibles?.includes('tareas.jornales_estimados') ? t.jornales_estimados! : 0), 0)), tareas_en_alcance: selected.length, tareas_sin_estimado: sin, tareas_estimado_no_disponible: desconocidos, base: 'toda_la_categoria' as const } } : {}) };
    }
    const filtrados = datos.registros.filter((r) => {
        if (r.fecha_trabajo < c.desde || r.fecha_trabajo > hasta)
            return false;
        if (!tareaPasa(r.tarea_id))
            return false;
        if (tieneLotes)
            return r.lote_id !== null && lotes.ids.has(r.lote_id);
        if (c.sin_lote === 'excluir')
            return r.lote_id !== null;
        if (c.sin_lote === 'solo')
            return r.lote_id === null;
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
    const lotesNombrados: Lote[] = tieneLotes ? datos.lotes.filter((l) => lotes.ids.has(l.id)) : [];
    const grupos = new Map<string, {
        grupo: Partial<Record<Agrupacion, string>>;
        grupoIds: Partial<Record<Agrupacion, string>>;
        registros: RegistroTrabajo[];
        tareaId?: string;
        loteId?: string | null;
    }>();
    if (c.agrupar_por.length > 0) {
        for (const r of filtrados) {
            const grupo: Partial<Record<Agrupacion, string>> = {};
            for (const g of c.agrupar_por)
                grupo[g] = etiqueta(r, g);
            const grupoIds: Partial<Record<Agrupacion, string>> = {};
            for (const g of c.agrupar_por)
                grupoIds[g] = g === 'lote' ? r.lote_id ?? 'sin_lote' : g === 'tarea' ? r.tarea_id : g === 'tipo_tarea' ? tareaPorId.get(r.tarea_id)?.tipo_tarea_id ?? 'sin_tipo' : grupo[g];
            const clave = JSON.stringify(grupoIds);
            const actual = grupos.get(clave) ?? { grupo, grupoIds, registros: [], tareaId: r.tarea_id, loteId: r.lote_id };
            actual.registros.push(r);
            grupos.set(clave, actual);
        }
        // Tareas filtradas sin registros: solo cuando se pidió su estado y se agrupa únicamente por tarea.
        if (c.incluir_estado_tarea && c.agrupar_por.length === 1 && c.agrupar_por[0] === 'tarea' && (tieneTareas || c.categorias.length)) {
            for (const t of datos.tareas) {
                if (!tareaPasa(t.id) || tieneLotes && !filtrados.some(r => r.tarea_id === t.id))
                    continue;
                const clave = JSON.stringify({ tarea: t.id });
                if (!grupos.has(clave))
                    grupos.set(clave, { grupo: { tarea: t.nombre.trim() }, grupoIds: { tarea: t.id }, registros: [], tareaId: t.id });
            }
        }
    }
    // D30: los estimados viajan siempre que se filtra por categoría de tarea.
    const conEstimados = c.categorias.length > 0;
    const tareasConRegistro = new Set(filtrados.map((r) => r.tarea_id));
    const tareasEstimadas: Tarea[] = conEstimados
        ? datos.tareas.filter((t) => tareaPasa(t.id) && (!tieneLotes || tareasConRegistro.has(t.id)))
        : [];
    const sumaEstimados = (ts: Tarea[]): number | null => {
        const con = ts.filter((t) => t.jornales_estimados !== null && Number.isFinite(t.jornales_estimados) && t.jornales_estimados! >= 0 && !datos.fuente?.camposNoDisponibles?.includes('tareas.jornales_estimados'));
        if (con.length < ts.length)
            notas.add('jornales_estimados: las tareas sin estimado no suman');
        return con.length === 0 ? null : r2(con.reduce((s2, t) => s2 + (Number.isFinite(t.jornales_estimados) && t.jornales_estimados! >= 0 && !datos.fuente?.camposNoDisponibles?.includes('tareas.jornales_estimados') ? t.jornales_estimados! : 0), 0));
    };
    const estimados: EstimadosCategoria | undefined = conEstimados
        ? {
            jornales_estimados: r2(tareasEstimadas.reduce((s2, t) => s2 + (Number.isFinite(t.jornales_estimados) && t.jornales_estimados! >= 0 && !datos.fuente?.camposNoDisponibles?.includes('tareas.jornales_estimados') ? t.jornales_estimados! : 0), 0)),
            tareas_en_alcance: tareasEstimadas.length,
            tareas_sin_estimado: tareasEstimadas.filter(t => t.jornales_estimados === null).length,
            tareas_estimado_no_disponible: tareasEstimadas.filter(t => t.jornales_estimados !== null && (!Number.isFinite(t.jornales_estimados) || t.jornales_estimados! < 0) || datos.fuente?.camposNoDisponibles?.includes('tareas.jornales_estimados')).length,
            base: tieneLotes ? 'tareas_con_registros_en_los_lotes' : 'toda_la_categoria',
        }
        : undefined;
    const estimadoDeFila = (grupo: Partial<Record<Agrupacion, string>>, tareaId: string | undefined, grupoIds: Partial<Record<Agrupacion, string>>): number | null | undefined => {
        // Un estimado por fila solo tiene sentido cuando la fila ES la tarea, el tipo o la categoría.
        if (soloAgrupacion === 'tarea') {
            const t = tareaId ? tareaPorId.get(tareaId) : undefined;
            if (!t || t.jornales_estimados !== null && (!Number.isFinite(t.jornales_estimados) || t.jornales_estimados < 0) || datos.fuente?.camposNoDisponibles?.includes('tareas.jornales_estimados'))
                return undefined;
            return c.incluir_estado_tarea || conEstimados ? t.jornales_estimados : undefined;
        }
        if (!conEstimados)
            return undefined;
        if (soloAgrupacion === 'categoria')
            return sumaEstimados(tareasEstimadas.filter((t) => (categoriaDeTarea(t.id) ?? '(sin categoría)') === grupo.categoria));
        if (soloAgrupacion === 'tipo_tarea')
            return sumaEstimados(tareasEstimadas.filter((t) => (t.tipo_tarea_id ?? 'sin_tipo') === grupoIds.tipo_tarea));
        return undefined;
    };
    const baseDeFila = (loteId: string | null | undefined): BaseLotes => {
        if (agrupaLote) {
            if (!loteId)
                return [];
            const l = datos.lotes.find((x) => x.id === loteId);
            return l ? [l] : [];
        }
        return lotesNombrados.length ? lotesNombrados : null;
    };
    const totalJ = total.jornales ?? 0;
    let filas: FilaResultado[] = [...grupos.values()].map(({ grupo, grupoIds, registros, tareaId, loteId }) => {
        const v = metricas(registros);
        const etiquetaFila = Object.values(grupo).join(' · ');
        const fila: FilaResultado = { grupo, grupo_ids: grupoIds, fuentes: registros.map(r => r.id).sort(), ...proyectar({ ...v, ...razones(v, baseDeFila(loteId), c, etiquetaFila, notas) }, c) };
        fila.porcentaje_jornales = totalJ > 0 ? Math.round(((v.jornales ?? 0) / totalJ) * 1000) / 10 : 0;
        const est = estimadoDeFila(grupo, tareaId, grupoIds);
        if (est !== undefined)
            fila.jornales_estimados = est;
        if (c.incluir_estado_tarea && c.agrupar_por.includes('tarea') && tareaId) {
            const t = tareaPorId.get(tareaId);
            if (t)
                Object.assign(fila, metadatosTarea(t, datos));
        }
        return fila;
    });
    const rank = c.ranking ?? { metrica: 'jornales' as const, direccion: 'desc' as const, n: c.limite ?? filas.length, empates: 'exactamente_n_por_id' as const };
    if (c.ranking && filas.some(f => typeof f[rank.metrica] !== 'number'))
        return { id, proposito: 'Consulta de labores', estado: 'no_disponible', alcance, no_resueltos: [], filas: [], total: {}, notas: [], cobertura: vacio, semantica: { ...semantica(c, [], []), disposicion: 'fuente_no_disponible', motivo: 'ranking_con_valor_nulo' } };
    filas.sort((a, b) => ((Number(a[rank.metrica] ?? 0) - Number(b[rank.metrica] ?? 0)) * (rank.direccion === 'asc' ? 1 : -1)) || JSON.stringify(a.grupo_ids).localeCompare(JSON.stringify(b.grupo_ids)));
    const gruposTotales = filas.length;
    const corte = filas[rank.n - 1]?.[rank.metrica];
    filas = rank.empates === 'incluir' ? filas.filter((f, i) => i < rank.n || f[rank.metrica] === corte) : filas.slice(0, rank.n);
    const sem = semantica(c, [...new Set(filtrados.map(r => r.tarea_id))], filtrados.map(r => r.id));
    sem.calificadores.push(`sin_lote:${alcance.sin_lote}`);
    if (c.ranking || c.limite !== null)
        sem.calificadores.push(`ranking:${rank.metrica}:${rank.direccion}:${rank.empates}`, `grupos:${gruposTotales}:mostrados:${filas.length}`);
    return {
        id,
        proposito: 'Consulta de labores',
        semantica: sem,
        poblacion: { universo: 'seleccion_efectiva', miembros: filtrados.map(r => r.id).sort(), con_lote: { estado: alcance.sin_lote === 'solo' ? 'excluido' : filtrados.some(r => r.lote_id !== null) ? 'seleccionado' : 'vacio_verificado', registros: alcance.sin_lote === 'solo' ? null : filtrados.filter(r => r.lote_id !== null).length }, sin_lote: { estado: alcance.sin_lote === 'excluir' ? 'excluido' : filtrados.some(r => r.lote_id === null) ? 'seleccionado' : 'vacio_verificado', registros: alcance.sin_lote === 'excluir' ? null : filtrados.filter(r => r.lote_id === null).length } },
        particiones: { con_lote: alcance.sin_lote === 'solo' ? {} : proyectar(metricas(filtrados.filter(r => r.lote_id !== null)), c), sin_lote: alcance.sin_lote === 'excluir' ? {} : proyectar(metricas(filtrados.filter(r => r.lote_id === null)), c) },
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
