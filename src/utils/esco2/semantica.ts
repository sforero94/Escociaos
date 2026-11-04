// Preconditions for the bounded labor operations. Validate dimensions before filters
// so unread fields cannot silently remove members from the visible population.
import { esFechaCalendario } from './fechaCalendario.ts';
import type { ConsultaLabores, DatosLabores, ResultadoParte, Tarea, FilaResultado } from './tipos.ts';
const own = (r: object, k: string) => Object.prototype.hasOwnProperty.call(r, k) && (r as Record<string, unknown>)[k] !== undefined;
export function falloFuente(c: ConsultaLabores, d: DatosLabores): string | null {
    const scheduled = c.cohorte === 'tarea_programada';
    for (const k of ['tareas', 'lotes', 'tiposTareas'] as const) {
        const rows = d[k];
        if (!Array.isArray(rows) || rows.some(r => !r || typeof r !== 'object' || typeof r.id !== 'string' || !r.id.trim() || typeof r.nombre !== 'string') || new Set(rows.map(r => r.id)).size !== rows.length)
            return 'identidad_catalogo_no_disponible';
    }
    if (c.tarea_ids?.some(id => !d.tareas.some(t => t.id === id)) || c.lote_ids?.some(id => !d.lotes.some(l => l.id === id)))
        return 'id_no_disponible';
    const taskFields = ['id', 'nombre', ...(c.tareas.length || c.categorias.length || c.agrupar_por.some(g => g === 'tipo_tarea' || g === 'categoria') ? ['tipo_tarea_id'] : [])];
    if (d.tiposTareas.some(t => t.categoria !== undefined && t.categoria !== null && typeof t.categoria !== 'string'))
        return 'categoria_no_disponible';
    if (d.tareas.some(t => taskFields.some(f => !own(t, f))))
        return 'campo_tarea_no_disponible';
    if (c.tareas.length || c.categorias.length || c.agrupar_por.some(g => g === 'tipo_tarea' || g === 'categoria')) {
        if (d.tareas.some(t => t.tipo_tarea_id !== null && !d.tiposTareas.some(x => x.id === t.tipo_tarea_id)))
            return 'referencia_tipo_no_disponible';
        if ((c.categorias.length || c.agrupar_por.includes('categoria')) && d.tiposTareas.some(t => !own(t, 'categoria')))
            return 'categoria_no_disponible';
    }
    if (scheduled) {
        if (d.tareas.some(t => !own(t, 'fecha_estimada_inicio') || t.fecha_estimada_inicio !== null && !esFechaCalendario(t.fecha_estimada_inicio)))
            return 'fecha_programada_no_disponible';
        if (c.lotes.length || c.lote_ids?.length || c.sin_lote !== 'incluir') {
            if (d.tareas.some(t => !Array.isArray(t.lote_ids)))
                return 'asignacion_programada_no_disponible';
            if (d.tareas.some(t => new Set(t.lote_ids!).size !== t.lote_ids!.length || t.lote_ids!.some(id => typeof id !== 'string' || !d.lotes.some(l => l.id === id))))
                return 'referencia_asignacion_no_disponible';
        }
    }
    else {
        if (!Array.isArray(d.registros) || d.registros.some(r=>!r||typeof r!=='object'||typeof r.id!=='string'||!r.id.trim()) || new Set(d.registros.map(r => r.id)).size !== d.registros.length)
            return 'identidad_registro_no_disponible';
        const fields = ['id', 'tarea_id', 'lote_id', 'fecha_trabajo', 'fraccion_jornal', ...(c.metricas.some(m => m === 'costo' || m === 'costo_por_jornal') || c.ranking?.metrica === 'costo' ? ['costo_jornal'] : [])];
        if (d.registros.some(r => fields.some(f => !own(r, f))))
            return 'campo_registro_no_disponible';
        if (d.registros.some(r => typeof r.id !== 'string' || !esFechaCalendario(r.fecha_trabajo) || ![.25, .5, .75, 1].includes(r.fraccion_jornal) || !d.tareas.some(t => t.id === r.tarea_id) || r.lote_id !== null && !d.lotes.some(l => l.id === r.lote_id) || fields.includes('costo_jornal') && r.costo_jornal !== null && (!Number.isFinite(r.costo_jornal) || r.costo_jornal! < 0)))
            return 'referencia_o_valor_registro_no_disponible';
    }
    const needed = ['tareas.id', 'tareas.nombre', 'lotes.id', 'lotes.nombre', 'tiposTareas.id', 'tiposTareas.nombre', ...(!scheduled ? ['registros.id'] : []), ...(c.tareas.length || c.agrupar_por.includes('tipo_tarea') || c.agrupar_por.includes('categoria') ? ['tareas.tipo_tarea_id'] : []), ...(c.agrupar_por.includes('categoria') ? ['tiposTareas.categoria'] : []), ...(scheduled && (c.lotes.length || c.lote_ids?.length || c.sin_lote !== 'incluir') ? ['tareas.lote_ids'] : []), ...(c.metricas.includes('jornales_por_arbol') ? ['lotes.total_arboles'] : []), ...(c.metricas.includes('jornales_por_hectarea') ? ['lotes.area_hectareas'] : []), ...(scheduled ? ['tareas.fecha_estimada_inicio'] : ['registros.fecha_trabajo', 'registros.fraccion_jornal', 'registros.tarea_id', 'registros.lote_id']), ...(c.categorias.length ? ['tareas.tipo_tarea_id', 'tiposTareas.categoria'] : []), ...(c.metricas.some(m => m === 'costo' || m === 'costo_por_jornal') ? ['registros.costo_jornal'] : [])];
    if (needed.some(f => d.fuente?.camposNoDisponibles?.includes(f)))
        return 'campo_declarado_no_disponible';
    return null;
}
export function metadatosTarea(t: Tarea, d: DatosLabores): Partial<FilaResultado> {
    const hidden = d.fuente?.camposNoDisponibles ?? [];
    const missing: string[] = [];
    const out: Partial<FilaResultado> = {};
    if (own(t, 'estado') && !hidden.includes('tareas.estado') && (t.estado === null || typeof t.estado === 'string'))
        out.estado_tarea = t.estado;
    else
        missing.push('estado_actual');
    if (own(t, 'jornales_estimados') && !hidden.includes('tareas.jornales_estimados') && (t.jornales_estimados === null || Number.isFinite(t.jornales_estimados) && t.jornales_estimados >= 0))
        out.jornales_estimados = t.jornales_estimados;
    else
        missing.push('jornales_estimados');
    const fields = ['fecha_estimada_inicio', 'fecha_estimada_fin', 'fecha_inicio_real', 'fecha_fin_real'] as const;
    const dates: NonNullable<FilaResultado['fechas_tarea']> = {};
    const keys = ['estimada_inicio', 'estimada_fin', 'real_inicio', 'real_fin'] as const;
    for (let i = 0; i < fields.length; i++) {
        const field = fields[i];
        if (own(t, field) && !hidden.includes(`tareas.${field}`) && (t[field] === null || esFechaCalendario(t[field])))
            dates[keys[i]] = t[field];
        else
            missing.push(field);
    }
    if (Object.keys(dates).length)
        out.fechas_tarea = dates;
    const apps = d.aplicaciones;
    const fieldsApp = ['id', 'tarea_id', 'codigo_aplicacion', 'nombre_aplicacion', 'estado'];
    const available = apps !== undefined && !d.fuente?.camposNoDisponibles?.some(f => f.startsWith('aplicaciones.')) && apps.every(a => a && typeof a === 'object' && fieldsApp.every(f => own(a, f)) && typeof a.id === 'string' && !!a.id.trim() && typeof a.tarea_id === 'string' && d.tareas.some(t => t.id === a.tarea_id)) && new Set(apps.map(a => a.id)).size === apps.length;
    out.asociaciones = { estado: !available ? 'no_disponible' : apps!.some(a => a.tarea_id === t.id) ? 'conocido' : 'vacio_verificado', aplicaciones: available ? apps!.filter(a => a.tarea_id === t.id).sort((a, b) => a.id.localeCompare(b.id)).map(a => ({ id: a.id, codigo: a.codigo_aplicacion, nombre: a.nombre_aplicacion, estado: a.estado })) : [] };
    if (available && out.asociaciones.aplicaciones.length <= 1) {
        const a = out.asociaciones.aplicaciones[0];
        out.aplicacion = a ? { codigo: a.codigo, nombre: a.nombre, estado: a.estado } : null;
    }
    if (!available)
        missing.push('asociaciones');
    out.campos_no_disponibles = missing;
    return out;
}
export function semantica(c: ConsultaLabores, ids: string[], fuentes: string[]): NonNullable<ResultadoParte['semantica']> { return { cohorte: c.cohorte ?? 'trabajo_registrado', base_fecha: c.cohorte === 'tarea_programada' ? 'fecha_estimada_inicio' : 'fecha_trabajo', disposicion: 'respondida', miembros: [...new Set(ids)].sort(), fuentes: fuentes.length ? [...new Set(fuentes)].sort() : [`alcance_visible:${c.cohorte ?? 'trabajo_registrado'}:${c.desde}:${c.hasta}`], calificadores: ['alcance_visible', c.cohorte === 'tarea_programada' ? 'asignacion_registrada_actual_no_historica' : 'trabajo_registrado', 'lecturas_sin_garantia_de_snapshot_conjunto'] }; }
