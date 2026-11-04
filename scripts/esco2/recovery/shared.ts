// P1 offline-only shared arithmetic and native result. No deployed module imports this.
import { ejecutarConsulta } from '../../../src/utils/esco2/ejecutor.ts';
import { esFechaCalendario, lunesDe } from '../../../src/utils/esco2/fechaCalendario.ts';
import { validarPlan } from '../../../src/utils/esco2/registro.ts';
import type { DatosLabores, ResultadoParte, Agrupacion, FilaResultado, Tarea } from '../../../src/utils/esco2/tipos.ts';
import type { Afirmacion, EntradaExperimento, EstadoConversacion, Obligacion, ResultadoObligacion, SalidaExperimento, Variante } from './contracts.ts';
export interface FilaNativa {
    fila: FilaResultado;
    entidad: Afirmacion['entidad'];
    fuentes: string[];
}
export interface TareaNativa {
    id: string;
    nombre: string;
    estado: string | null;
    aplicaciones?: string[];
    asociacionDisponible: boolean;
}
/** A's minimal compatibility sidecar: facts absent from ResultadoParte, never duplicate metrics. */
export interface ResultadoNativo {
    obligacion: Obligacion;
    legado?: ResultadoParte;
    filas: FilaNativa[];
    disposicion: ResultadoObligacion['disposicion'];
    calificadores: string[];
    motivo?: string;
    miembros?: string[];
    tareas: TareaNativa[];
    estimado?: number | null;
    fuentesEstimado: string[];
    reconciliacion?: number;
    fuentes: string[];
}
const units: Record<string, string> = { jornales: 'jornales', costo: 'moneda', dias_con_registro: 'dias', primer_registro: 'fecha', ultimo_registro: 'fecha', miembros: 'ids', asociaciones: 'ids', estado_actual: 'estado', jornales_estimados: 'jornales', reconciliacion: 'jornales' };
export const TOTAL: Afirmacion['entidad'] = { tipo: 'total', id: 'total', nombre: 'Total' };
const uniq = (xs: string[]) => [...new Set(xs)].sort();
const round = (n: number) => Math.round(n * 100) / 100;
const own = (x: object, k: string) => Object.prototype.hasOwnProperty.call(x, k);
const allowed = (x: object, keys: string[]) => Object.keys(x).every(k => keys.includes(k));
export function permiso(e: EntradaExperimento): boolean { return e.actor.autenticado && e.actor.activo && e.actor.rol === 'Gerencia'; }
export function denegada(e: EntradaExperimento, variante: Variante): SalidaExperimento { return { variante, resultados: [], texto: 'Acceso denegado', seguridad: { permitido: false, lecturas: 0, propietario: e.actor.id } }; }
export function renderClaims(resultados: ResultadoObligacion[]): string {
    return resultados.map(r => [
        `${r.id}: ${r.disposicion}${r.motivo ? ` (${r.motivo})` : ''}`,
        ...r.afirmaciones.map(c => `${c.entidad.nombre} [${c.entidad.tipo}:${c.entidad.id}] ${c.metrica}: ${c.estado === 'conocido' || c.estado === 'vacio_verificado' ? JSON.stringify(c.valor) : c.estado}; unidad=${c.unidad}; cohorte=${c.cohorte}; fecha=${c.baseFecha}; ${c.desde} a ${c.hasta}; ${c.calificadores.join(', ')}`),
        `Alcance: ${r.calificadores.join(', ')}`,
    ].join('\n')).join('\n\n');
}
export function prepararEntrada(input: EntradaExperimento): {
    entrada: EntradaExperimento;
    estado: EstadoConversacion;
    bloqueadas: Set<string>;
} {
    const entrada = structuredClone(input);
    const estado: EstadoConversacion = input.estado?.propietario === input.actor.id && input.estado.version === 1 ? structuredClone(input.estado) : { version: 1, propietario: input.actor.id };
    const bloqueadas = new Set<string>();
    for (const o of entrada.obligaciones) {
        if (!o.aclaracion && estado.pendiente?.obligacionId !== o.id)
            continue;
        const pending = estado.pendiente?.obligacionId === o.id ? estado.pendiente : { obligacionId: o.id, ...o.aclaracion! };
        const choice = pending.alternativas.find(a => a.id === entrada.respuestaAclaracion);
        if (!choice) {
            bloqueadas.add(o.id);
            estado.pendiente = pending;
            continue;
        }
        o.tareaIds = choice.tareaIds;
        o.consulta.tareas = [];
        o.consulta.categorias = choice.categorias ?? [];
        delete o.aclaracion;
        delete estado.pendiente;
    }
    for (const o of entrada.obligaciones)
        if (o.consulta.categorias.length && !o.requeridos.includes('estimados'))
            o.requeridos.push('estimados');
    return { entrada, estado, bloqueadas };
}
function validateObligation(e: EntradaExperimento, o: Obligacion): string | null {
    if (!allowed(o, ['id', 'consulta', 'cohorte', 'baseFecha', 'tareaIds', 'loteIds', 'ranking', 'requeridos', 'noSoportada', 'aclaracion']))
        return 'argumento_no_registrado';
    try {
        validarPlan([{ nombre: 'consultar_labores', argumentos: JSON.stringify(o.consulta) }]);
    }
    catch {
        return 'consulta_invalida';
    }
    if (!['trabajo_registrado', 'tarea_programada'].includes(o.cohorte) || !['fecha_trabajo', 'fecha_estimada_inicio'].includes(o.baseFecha))
        return 'cohorte_invalida';
    if (e.obligaciones.length > 4)
        return 'limite_obligaciones';
    if (!o.requeridos.every(k => ['metricas', 'miembros', 'estado_actual', 'asociaciones', 'estimados', 'reconciliacion'].includes(k)))
        return 'capacidad_invalida';
    if (o.cohorte === 'trabajo_registrado' && o.baseFecha !== 'fecha_trabajo' || o.cohorte === 'tarea_programada' && o.baseFecha !== 'fecha_estimada_inicio')
        return 'base_fecha_incompatible';
    if (!esFechaCalendario(e.hoyBogota) || !o.id || e.obligaciones.filter(x => x.id === o.id).length !== 1)
        return 'identidad_o_fecha_invalida';
    if (o.tareaIds?.some(id => !e.datos.tareas.some(t => t.id === id)) || o.loteIds?.some(id => !e.datos.lotes.some(l => l.id === id)))
        return 'id_no_resuelto';
    if (o.ranking && (!allowed(o.ranking, ['metrica', 'direccion', 'n', 'empates']) || !['jornales', 'costo'].includes(o.ranking.metrica) || !['asc', 'desc'].includes(o.ranking.direccion) || !['incluir', 'exactamente_n_por_id'].includes(o.ranking.empates) || !Number.isInteger(o.ranking.n) || o.ranking.n < 1 || o.ranking.n > 50 || !o.consulta.agrupar_por.length))
        return 'ranking_invalido';
    return null;
}
function sourceFailure(e: EntradaExperimento, o: Obligacion, tasks: Tarea[]): string | null {
    const required = o.cohorte === 'trabajo_registrado' && (o.requeridos.includes('metricas') || o.requeridos.includes('reconciliacion') || o.requeridos.includes('miembros') && !o.tareaIds) ? ['registros', 'tareas', 'tiposTareas', 'lotes'] : ['tareas', 'tiposTareas', 'lotes'];
    if (required.some(t => !e.fuente.tablasCompletas.includes(t as 'tareas')))
        return 'poblacion_incompleta';
    for (const key of required) {
        const rows = e.datos[key as keyof DatosLabores];
        if (!rows || rows.some(r => typeof r.id !== 'string') || new Set(rows.map(r => r.id)).size !== rows.length)
            return 'identidades_fuente_invalidas';
    }
    if (o.cohorte === 'tarea_programada' && (e.fuente.camposNoDisponibles.includes('tareas.fecha_estimada_inicio') || tasks.some(t => !own(t, 'fecha_estimada_inicio') || t.fecha_estimada_inicio !== null && !esFechaCalendario(t.fecha_estimada_inicio))))
        return 'fecha_programada_no_disponible';
    if (o.cohorte === 'tarea_programada' && (o.loteIds?.length || o.consulta.lotes.length) && (!e.fuente.asignacionesCompletas || !e.fuente.asignacionesTareaLote))
        return 'asignacion_programada_no_disponible';
    const taskFields = ['id', 'nombre', 'tipo_tarea_id', ...(o.requeridos.includes('estado_actual') ? ['estado'] : []), ...(o.requeridos.includes('estimados') ? ['jornales_estimados'] : [])];
    if (taskFields.some(f => e.fuente.camposNoDisponibles.includes(`tareas.${f}`) || tasks.some(t => !own(t, f) || (t as unknown as Record<string, unknown>)[f] === undefined)))
        return 'campo_no_disponible';
    if (o.requeridos.includes('estimados') && tasks.some(t => t.jornales_estimados !== null && (!Number.isFinite(t.jornales_estimados) || t.jornales_estimados! < 0)))
        return 'estimado_invalido';
    if (o.requeridos.includes('reconciliacion') && e.fuente.consistencia !== 'snapshot_sintetico')
        return 'reconciliacion_sin_snapshot_coherente';
    if (required.includes('registros')) {
        // An unjoined task could belong to a category/name filter. It cannot be silently
        // removed from a supposedly complete visible population. Resolved ID filters can
        // safely exclude other IDs, including catalog-unavailable records outside them.
        if (e.datos.registros.some(r => (!o.tareaIds || o.tareaIds.includes(r.tarea_id)) && r.fecha_trabajo >= o.consulta.desde && r.fecha_trabajo <= (o.consulta.hasta < e.hoyBogota ? o.consulta.hasta : e.hoyBogota) && !e.datos.tareas.some(t => t.id === r.tarea_id)))
            return 'referencia_tarea_no_disponible';
        const relevant = e.datos.registros.filter(r => tasks.some(t => t.id === r.tarea_id));
        const fields = ['id', 'tarea_id', 'lote_id', 'fecha_trabajo', 'fraccion_jornal', ...(o.consulta.metricas.includes('costo') ? ['costo_jornal'] : [])];
        if (fields.some(f => e.fuente.camposNoDisponibles.includes(`registros.${f}`) || relevant.some(r => !own(r, f))))
            return 'campo_no_disponible';
        if (relevant.some(r => !esFechaCalendario(r.fecha_trabajo) || ![0.25, 0.5, 0.75, 1].includes(r.fraccion_jornal) || r.costo_jornal !== null && !Number.isFinite(r.costo_jornal) || r.lote_id !== null && !e.datos.lotes.some(l => l.id === r.lote_id)))
            return 'registro_invalido';
    }
    return null;
}
function groupEntity(g: Partial<Record<Agrupacion, string>>, o: Obligacion, e: EntradaExperimento): Afirmacion['entidad'] {
    const keys = o.consulta.agrupar_por.map(grain => [grain, g[grain] === '(sin lote)' ? 'sin_lote' : g[grain] ?? ''] as const);
    const type = keys.length === 1 ? keys[0][0] : o.consulta.agrupar_por[0] ?? 'total';
    const id = keys.length === 1 ? keys[0][1] : JSON.stringify(keys);
    const label = keys.map(([grain, key]) => grain === 'tarea' ? e.datos.tareas.find(t => t.id === key)?.nombre ?? key : grain === 'lote' ? key === 'sin_lote' ? '(sin lote)' : e.datos.lotes.find(l => l.id === key)?.nombre ?? key : grain === 'tipo_tarea' ? e.datos.tiposTareas.find(t => t.id === key)?.nombre ?? key : key).join(' · ');
    return { tipo: type, id, nombre: label };
}
export function calcularNativo(e: EntradaExperimento, o: Obligacion, blocked = false): ResultadoNativo {
    const out: ResultadoNativo = { obligacion: o, filas: [], disposicion: 'respondida', calificadores: ['alcance_visible'], tareas: [], fuentesEstimado: [], fuentes: [e.fuente.id] };
    const invalid = validateObligation(e, o);
    if (invalid)
        return { ...out, disposicion: 'error', motivo: invalid };
    if (blocked)
        return { ...out, disposicion: 'aclaracion', motivo: 'eleccion_pendiente' };
    if (o.noSoportada)
        return { ...out, disposicion: 'no_soportada', motivo: 'capacidad_fuera_de_slice' };
    // Scheduling metrics/lot grouping are outside this thin slice. Fake work rows below
    // serve only the existing grouping carrier and can never become recorded-work facts.
    if (o.cohorte === 'tarea_programada' && (o.requeridos.includes('metricas') || o.requeridos.includes('reconciliacion') || o.ranking || o.consulta.agrupar_por.some(g => g !== 'tarea')))
        return { ...out, disposicion: 'no_soportada', motivo: 'combinacion_programada_no_soportada' };
    if (o.consulta.metricas.some(m => !['jornales', 'costo'].includes(m)))
        return { ...out, disposicion: 'no_soportada', motivo: 'metrica_fuera_de_slice' };
    const namedLots = o.loteIds ?? e.datos.lotes.filter(l => o.consulta.lotes.includes(l.nombre)).map(l => l.id);
    if (o.consulta.lotes.some(n => !e.datos.lotes.some(l => l.nombre === n)))
        return { ...out, disposicion: 'error', motivo: 'lote_no_resuelto' };
    if (e.datos.tareas.some(t => typeof t.id !== 'string' || typeof t.nombre !== 'string') || e.datos.lotes.some(l => typeof l.id !== 'string' || typeof l.nombre !== 'string'))
        return { ...out, disposicion: 'fuente_no_disponible', motivo: 'catalogo_identidad_no_disponible' };
    const taskCandidates = e.datos.tareas.filter(t => (!o.tareaIds || o.tareaIds.includes(t.id)) && (!o.consulta.tareas.length || o.consulta.tareas.some(n => t.nombre.toLowerCase().includes(n.toLowerCase()))));
    if (o.consulta.categorias.length && (e.fuente.camposNoDisponibles.includes('tareas.tipo_tarea_id') || e.fuente.camposNoDisponibles.includes('tiposTareas.categoria') ||
        taskCandidates.some(t => !own(t, 'tipo_tarea_id') || t.tipo_tarea_id === undefined || t.tipo_tarea_id !== null && !e.datos.tiposTareas.some(tt => tt.id === t.tipo_tarea_id && own(tt, 'categoria') && tt.categoria !== undefined))))
        return { ...out, disposicion: 'fuente_no_disponible', motivo: 'categoria_no_disponible' };
    if (o.consulta.categorias.some(c => !e.datos.tiposTareas.some(t => t.categoria === c)))
        return { ...out, disposicion: 'error', motivo: 'categoria_no_resuelta' };
    if (o.consulta.tareas.some(n => !e.datos.tareas.some(t => t.nombre.toLowerCase().includes(n.toLowerCase()))))
        return { ...out, disposicion: 'error', motivo: 'tarea_no_resuelta' };
    const filtered = e.datos.tareas.filter(t => (!o.tareaIds || o.tareaIds.includes(t.id)) && (!o.consulta.tareas.length || o.consulta.tareas.some(n => t.nombre.toLowerCase().includes(n.toLowerCase()))) && (!o.consulta.categorias.length || o.consulta.categorias.includes(e.datos.tiposTareas.find(tt => tt.id === t.tipo_tarea_id)?.categoria ?? '')));
    const failure = sourceFailure(e, o, filtered);
    if (failure)
        return { ...out, disposicion: 'fuente_no_disponible', motivo: failure };
    const tasks = o.cohorte === 'tarea_programada' ? filtered.filter(t => !!t.fecha_estimada_inicio && t.fecha_estimada_inicio >= o.consulta.desde && t.fecha_estimada_inicio <= o.consulta.hasta && (!namedLots.length || e.fuente.asignacionesTareaLote!.some(a => a.tareaId === t.id && namedLots.includes(a.loteId)))) : filtered;
    const taskIds = new Set(tasks.map(t => t.id));
    const records = o.cohorte === 'tarea_programada' ? [] : e.datos.registros.filter(r => taskIds.has(r.tarea_id));
    const datos: DatosLabores = { ...e.datos, tareas: tasks.map(t => ({ ...t, nombre: t.id })), lotes: e.datos.lotes.map(l => ({ ...l, nombre: l.id })), tiposTareas: e.datos.tiposTareas.map(t => ({ ...t, nombre: t.id })), registros: records };
    const query = { ...o.consulta, proposito: o.id, tareas: [], lotes: namedLots, limite: null, incluir_estado_tarea: false };
    const legacy = ejecutarConsulta(query, datos, o.cohorte === 'tarea_programada' ? o.consulta.hasta : e.hoyBogota, o.id);
    out.legado = legacy;
    const scoped = records.filter(r => r.fecha_trabajo >= query.desde && r.fecha_trabajo <= legacy.alcance.hasta && (!namedLots.length || r.lote_id !== null && namedLots.includes(r.lote_id)) && (namedLots.length > 0 || query.sin_lote === 'incluir' || (query.sin_lote === 'solo' ? r.lote_id === null : r.lote_id !== null)));
    out.fuentes = uniq(scoped.map(r => r.id));
    if (!out.fuentes.length)
        out.fuentes = [e.fuente.id];
    const qualifier = out.calificadores;
    qualifier.push(query.sin_lote === 'excluir' || namedLots.length ? 'sin_lote_excluido' : query.sin_lote === 'solo' ? 'solo_sin_lote' : 'sin_lote_incluido');
    if (o.requeridos.includes('estado_actual'))
        qualifier.push('estado_actual');
    const keyFor = (r: DatosLabores['registros'][number], g: Agrupacion): string => {
        const task = e.datos.tareas.find(t => t.id === r.tarea_id);
        if (g === 'tarea')
            return r.tarea_id;
        if (g === 'lote')
            return r.lote_id ?? '(sin lote)';
        if (g === 'tipo_tarea')
            return task?.tipo_tarea_id ?? '(sin tipo)';
        if (g === 'categoria')
            return e.datos.tiposTareas.find(t => t.id === task?.tipo_tarea_id)?.categoria ?? '(sin categoría)';
        if (g === 'dia')
            return r.fecha_trabajo;
        if (g === 'mes')
            return r.fecha_trabajo.slice(0, 7);
        return `semana del ${lunesDe(r.fecha_trabajo)}`;
    };
    let rows = legacy.filas.map(fila => ({ fila, entidad: groupEntity(fila.grupo, o, e), fuentes: scoped.filter(r => o.consulta.agrupar_por.every(g => keyFor(r, g) === fila.grupo[g])).map(r => r.id) }));
    const allRows = [...rows];
    if (o.ranking) {
        const rank = o.ranking;
        const value = (r: FilaNativa) => r.fila[rank.metrica];
        if (rows.some(r => typeof value(r) !== 'number'))
            return { ...out, disposicion: 'fuente_no_disponible', motivo: 'ranking_con_valor_nulo' };
        rows.sort((a, b) => ((value(a) as number) - (value(b) as number)) * (rank.direccion === 'asc' ? 1 : -1) || a.entidad.id.localeCompare(b.entidad.id));
        if (rank.empates === 'incluir') {
            const cutoff = rows[rank.n - 1] && value(rows[rank.n - 1]);
            rows = cutoff === undefined ? rows : rows.filter((r, i) => i < rank.n || value(r) === cutoff);
        }
        else
            rows = rows.slice(0, rank.n);
        qualifier.push(`ranking:${rank.metrica}:${rank.direccion}:${rank.empates}`, `ranking_total:${allRows.length}`, `ranking_mostrados:${rows.length}`, `ranking_omitidos:${allRows.length - rows.length}`);
    }
    else if (o.consulta.limite !== null) {
        // A legacy limit means top-N jornales with a stable-ID deterministic tie break.
        rows.sort((a, b) => (b.fila.jornales ?? 0) - (a.fila.jornales ?? 0) || a.entidad.id.localeCompare(b.entidad.id));
        rows = rows.slice(0, o.consulta.limite);
        qualifier.push('ranking:jornales:desc:exactamente_n_por_id', `ranking_total:${allRows.length}`, `ranking_mostrados:${rows.length}`, `ranking_omitidos:${allRows.length - rows.length}`);
    }
    out.filas = rows;
    if (o.requeridos.includes('miembros'))
        out.miembros = o.cohorte === 'tarea_programada' ? tasks.map(t => t.id).sort() : o.consulta.agrupar_por.length ? rows.map(r => r.entidad.id) : uniq(scoped.map(r => r.tarea_id));
    const selectedTaskIds = o.cohorte === 'tarea_programada' ? tasks.map(t => t.id) : o.tareaIds && !o.requeridos.includes('metricas') ? tasks.map(t => t.id) : uniq(scoped.map(r => r.tarea_id));
    for (const id of o.requeridos.includes('asociaciones') || o.requeridos.includes('estado_actual') ? selectedTaskIds : []) {
        const t = e.datos.tareas.find(t => t.id === id)!;
        const associations = e.datos.aplicaciones;
        const appValid = associations !== undefined && e.fuente.aplicacionesCompletas && e.fuente.tablasCompletas.includes('aplicaciones') && !e.fuente.camposNoDisponibles.includes('aplicaciones.tarea_id') && associations.every(a => typeof a.id === 'string' && typeof a.tarea_id === 'string') && new Set(associations.map(a => a.id)).size === associations.length;
        out.tareas.push({ id, nombre: t.nombre, estado: t.estado, asociacionDisponible: appValid, aplicaciones: appValid ? associations!.filter(a => a.tarea_id === id).map(a => a.id).sort() : undefined });
        if (o.requeridos.includes('asociaciones') && !appValid)
            out.disposicion = 'fuente_no_disponible';
    }
    // D30 category obligations are expanded before execution so both native and
    // claim renderers publish the separate whole-task estimate and missing count.
    if (o.requeridos.includes('estimados') || o.consulta.categorias.length) {
        const estimated = o.cohorte === 'tarea_programada' ? tasks : namedLots.length ? tasks.filter(t => scoped.some(r => r.tarea_id === t.id)) : filtered;
        const missing = estimated.filter(t => t.jornales_estimados === null).length;
        out.estimado = estimated.length && missing === estimated.length ? null : round(estimated.reduce((n, t) => n + (t.jornales_estimados ?? 0), 0));
        out.fuentesEstimado = estimated.map(t => t.id);
        qualifier.push('estimado_tarea_completa', `estimados_faltantes:${missing}`);
        if (missing)
            qualifier.push('estimado_parcial');
    }
    if (o.requeridos.includes('reconciliacion')) {
        if (!o.consulta.agrupar_por.length)
            return { ...out, disposicion: 'error', motivo: 'reconciliacion_sin_particion' };
        const parts = round(allRows.reduce((n, r) => n + (r.fila.jornales ?? 0), 0));
        if (parts !== legacy.total.jornales)
            return { ...out, disposicion: 'error', motivo: 'particion_no_reconcilia' };
        out.reconciliacion = parts;
        qualifier.push(`reconciliacion_partes:${allRows.length}`);
        if (rows.length < allRows.length)
            qualifier.push('reconciliacion_incluye_omitidos');
    }
    out.calificadores = uniq(qualifier);
    return out;
}
/** The shared evaluation projection is not A's factual renderer. */
export function proyectarClaims(native: ResultadoNativo, e: EntradaExperimento): ResultadoObligacion {
    const o = native.obligacion;
    const out: ResultadoObligacion = { id: o.id, disposicion: native.disposicion, afirmaciones: [], calificadores: native.calificadores, ...(native.motivo ? { motivo: native.motivo } : {}) };
    const add = (entidad: Afirmacion['entidad'], metrica: Afirmacion['metrica'], valor: Afirmacion['valor'], fuentes = native.fuentes, estado?: Afirmacion['estado']) => out.afirmaciones.push({ id: `${o.id}:${entidad.tipo}:${entidad.id}:${metrica}`, obligacionId: o.id, entidad, metrica, unidad: units[metrica] ?? metrica, cohorte: o.cohorte, baseFecha: o.baseFecha, desde: o.consulta.desde, hasta: native.legado?.alcance.hasta ?? o.consulta.hasta, estado: estado ?? (valor === null ? 'nulo' : Array.isArray(valor) && !valor.length ? 'vacio_verificado' : 'conocido'), valor, calificadores: [...native.calificadores], fuentes: fuentes.length ? fuentes : [e.fuente.id] });
    if (!native.legado)
        return out;
    if (o.requeridos.includes('metricas')) {
        for (const m of o.consulta.metricas)
            add(TOTAL, m, native.legado.total[m] ?? null);
        for (const row of native.filas)
            for (const m of o.consulta.metricas)
                add(row.entidad, m, row.fila[m] ?? null, row.fuentes);
    }
    if (native.miembros !== undefined)
        add(TOTAL, 'miembros', native.miembros);
    for (const t of native.tareas) {
        const entity: Afirmacion['entidad'] = { tipo: 'tarea', id: t.id, nombre: t.nombre };
        if (o.requeridos.includes('estado_actual'))
            add(entity, 'estado_actual', t.estado, [t.id]);
        if (o.requeridos.includes('asociaciones'))
            add(entity, 'asociaciones', t.aplicaciones ?? null, t.aplicaciones?.length ? t.aplicaciones : [e.fuente.id], t.asociacionDisponible ? undefined : 'no_disponible');
    }
    if (o.requeridos.includes('estimados') && native.estimado !== undefined)
        add(TOTAL, 'jornales_estimados', native.estimado, native.fuentesEstimado);
    if (native.reconciliacion !== undefined)
        add(TOTAL, 'reconciliacion', native.reconciliacion);
    return out;
}
export function seguridad(e: EntradaExperimento, natives: ResultadoNativo[]): SalidaExperimento['seguridad'] { return { permitido: true, lecturas: natives.some(n => !!n.legado) ? 1 : 0, propietario: e.actor.id }; }
export async function runVariant(input: EntradaExperimento, variant: Variante): Promise<SalidaExperimento> {
    if (variant === 'baseline')
        return (await import('./baseline.ts')).runBaseline(input);
    if (variant === 'repair')
        return (await import('./repair.ts')).runRepair(input);
    return (await import('./redesign.ts')).runRedesign(input);
}
// ESM cycles are safe here: these functions execute only after modules initialize.
import { executeRepair } from './repair.ts';
import { executeRedesign } from './redesign.ts';
/** Validate at the publication boundary against source-derived facts and native rendering. */
export function validateCandidate(input: EntradaExperimento, candidate: SalidaExperimento): string[] {
    if (candidate.variante === 'baseline')
        return ['baseline_no_semantic_validator'];
    const expected = candidate.variante === 'repair' ? executeRepair(input) : executeRedesign(input);
    const errors: string[] = [];
    if (JSON.stringify(candidate.resultados) !== JSON.stringify(expected.resultados))
        errors.push('semantic_binding_or_coverage');
    if (candidate.texto !== expected.texto)
        errors.push('untrusted_factual_text');
    if (JSON.stringify(candidate.estado) !== JSON.stringify(expected.estado))
        errors.push('conversation_state');
    if (JSON.stringify(candidate.seguridad) !== JSON.stringify(expected.seguridad))
        errors.push('permission_scope');
    return errors;
}
