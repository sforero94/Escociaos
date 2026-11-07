// Closed transformations over typed, visible results. Never evaluates model expressions.
import type { ResultadoConsulta } from './tipos.ts';
import type { AnalisisConsulta, FilaAnalisis, MedidaAnalisis, ResultadoAnalisis } from './analiticaTipos.ts';
import { VARIABLES_CLIMA } from './climaTipos.ts';
import { aFechaUTC, deFechaUTC, lunesDe } from './fechaCalendario.ts';
import { esCotaInferior } from '../escoClimaCalidad.ts';
import { numeroMensaje, dineroConDetalleMensaje } from './formatoMensaje.ts';
export type { AnalisisConsulta, ResultadoAnalisis } from './analiticaTipos.ts';
const UNIDADES_LABORES: Record<string, string> = { jornales: 'jornales', costo: 'pesos', dias_con_registro: 'dias', jornales_por_arbol: 'jornales/arbol', jornales_por_hectarea: 'jornales/ha', costo_por_jornal: 'pesos/jornal' };
export const AGRUPACIONES_ANALITICAS_POR_DOMINIO: Record<string, readonly string[]> = { labores: ['dia', 'semana', 'mes', 'lote'], conductividad: ['lote'], pesajes_leche: ['animal'], monitoreo: ['lote', 'sublote', 'plaga'], clima: ['dia', 'semana', 'mes'] };
export const METRICAS_ANALITICAS: Record<string, Record<string, string>> = {
    labores: UNIDADES_LABORES, conductividad: { valor_ce: 'dS/m', ph: 'pH' }, pesajes_leche: { litros_usable: 'L' },
    monitoreo: { incidencia: '%', afectados: 'observaciones', muestreados: 'observaciones' },
    clima: Object.fromEntries(VARIABLES_CLIMA.filter(v => v !== 'viento_dir_predominante').map(v => [v, v.startsWith('temp_') ? '°C' : v.startsWith('humedad_') ? '%' : v.includes('kmh') ? 'km/h' : v === 'lluvia_total_mm' ? 'mm' : v === 'horas_sol_duracion' ? 'h' : v === 'energia_kwh_m2' ? 'kWh/m²' : v.includes('wm2') ? 'W/m²' : 'indice'])),
};
export function claveAnalisis(dominio: string, identidad: Record<string, string>, desde: string, hasta: string): string {
    return JSON.stringify([dominio, Object.entries(identidad).sort(([a], [b]) => a.localeCompare(b)), desde, hasta]);
}
const medida = (v: number | null | undefined, unidad: string, base: string, completo = true, esperados = 1, usables = v == null ? 0 : 1): MedidaAnalisis => ({ valor: completo && v != null && Number.isFinite(v) ? v : null, observado: v != null && Number.isFinite(v) ? v : null, unidad, base, estado: v == null ? 'sin_dato' : !Number.isFinite(v) ? 'parcial' : completo ? 'completo' : 'parcial', esperados, usables });
function fechaGrupo(fecha: string, grupo: string): string { return grupo === 'mes' ? fecha.slice(0, 7) : grupo === 'semana' ? lunesDe(fecha) : fecha; }
function ultimas<T>(filas: T[], entidad: (f: T) => string, fecha: (f: T) => string): T[] {
    const max = new Map<string, string>();
    for (const f of filas) {
        const k = entidad(f), d = fecha(f);
        if (!max.has(k) || d > max.get(k)!)
            max.set(k, d);
    }
    return filas.filter(f => fecha(f) === max.get(entidad(f)));
}
function fila(clave: string, etiqueta: string, miembros: string[], desde: string, hasta: string, metricas: Record<string, MedidaAnalisis>): FilaAnalisis { return { clave, etiqueta, miembros, periodo: { desde, hasta }, metricas, seleccion: 'seleccionado' }; }
function calcularFilas(a: AnalisisConsulta, r: ResultadoConsulta): FilaAnalisis[] {
    const tipo = 'tipo' in r ? r.tipo : 'labores';
    const grupos = a.agrupar_por ?? [];
    if (tipo === 'clima' && 'tipo' in r && r.tipo === 'clima') {
        if (a.ultima_por_entidad || grupos.length > 1 || grupos.some(g => !['dia', 'semana', 'mes'].includes(g)))
            throw Error('agrupacion_no_soportada');
        if (!r.estaciones.length)
            throw Error('poblacion_estaciones_sin_observaciones');
        if ((aFechaUTC(r.alcance.hasta).getTime() - aFechaUTC(r.alcance.desde).getTime()) / 86400000 > 3660)
            throw Error('limite_calendario_excedido');
        const grupo = grupos[0] ?? 'dia', out: FilaAnalisis[] = [];
        for (const station of r.estaciones) {
            const dias = new Map<string, string[]>();
            for (let d = aFechaUTC(r.alcance.desde); deFechaUTC(d) <= r.alcance.hasta; d = new Date(d.getTime() + 86400000)) {
                const fecha = deFechaUTC(d), k = fechaGrupo(fecha, grupo);
                dias.set(k, [...(dias.get(k) ?? []), fecha]);
            }
            for (const [k, fechas] of dias) {
                const observadas = r.filas.filter(f => f.station_id === station && fechas.includes(f.fecha));
                const metricas: Record<string, MedidaAnalisis> = {};
                for (const variable of r.consulta.variables) {
                    if (variable === 'viento_dir_predominante')
                        continue;
                    const presentes = observadas.filter(f => typeof f.valores[variable] === 'number');
                    const valores = presentes.map(f => f.valores[variable]!);
                    const completo = presentes.length === fechas.length && presentes.every(f => f.cobertura_temporal === 'completa' && (variable !== 'lluvia_total_mm' || !esCotaInferior(f.raw) && ['ok', 'reconstruido'].includes(f.lluvia_confianza)));
                    const valor = !valores.length ? null : variable.endsWith('_min') ? Math.min(...valores) : variable.endsWith('_max') ? Math.max(...valores) : valores.reduce((s, v) => s + v, 0) / (variable.endsWith('_avg') ? valores.length : 1);
                    metricas[variable] = medida(valor, METRICAS_ANALITICAS.clima[variable], `diarios/${station}/${variable}/${grupo}`, completo, fechas.length, presentes.length);
                }
                out.push(fila(claveAnalisis('clima', { estacion: station, [grupo]: k }, fechas[0], fechas.at(-1)!), `${station} · ${k}`, observadas.map(f => `${f.station_id}/${f.fecha}`), fechas[0], fechas.at(-1)!, metricas));
            }
        }
        return out;
    }
    if (!('tipo' in r)) {
        if (a.ultima_por_entidad || grupos.some(g => !r.alcance.agrupar_por.includes(g as never)))
            throw Error('agrupacion_no_soportada');
        if (r.cobertura.grupos_totales !== r.cobertura.grupos_mostrados)
            throw Error('detalle_fuente_limitado');
        return r.filas.map(f => {
            const metricas = Object.fromEntries(Object.entries(UNIDADES_LABORES).filter(([m]) => m in f).map(([m, u]) => [m, medida((f as unknown as Record<string, number | null>)[m], u, `labores/${r.semantica?.cohorte ?? 'trabajo_registrado'}/${r.semantica?.base_fecha ?? 'fecha_trabajo'}/${m}`)]));
            const identidad = Object.fromEntries(Object.entries(f.grupo).map(([k, v]) => [k, f.grupo_ids?.[k as keyof typeof f.grupo_ids] ?? (k === 'dia' || k === 'semana' ? v : 'sin_asignacion')]));
            return fila(claveAnalisis('labores', identidad, r.alcance.desde, r.alcance.hasta), Object.values(f.grupo).join(' · ') || 'Total seleccionado', f.fuentes ?? [], r.alcance.desde, r.alcance.hasta, metricas);
        });
    }
    if (r.tipo === 'pesajes_leche') {
        if (grupos.some(g => g !== 'animal'))
            throw Error('agrupacion_no_soportada');
        const filas = a.ultima_por_entidad ? ultimas(r.filas, f => f.animal_id, f => f.fecha) : r.filas;
        return filas.map(f => fila(claveAnalisis(r.tipo, { animal: f.animal_id, registro: f.id }, f.fecha, f.fecha), `${r.resumen.find(s => s.animal_id === f.animal_id)?.nombre ?? 'Animal sin nombre'} · ${f.fecha}`, [f.id], f.fecha, f.fecha, { litros_usable: medida(f.litros_usable, 'L', 'muestras_fechadas', f.estado === 'completo' || f.estado === 'historico_total') }));
    }
    if (r.tipo === 'conductividad') {
        if (grupos.some(g => g !== 'lote'))
            throw Error('agrupacion_no_soportada');
        const filas = a.ultima_por_entidad ? ultimas(r.filas, f => f.lote_id, f => f.fecha_monitoreo) : r.filas;
        return filas.map(f => fila(claveAnalisis(r.tipo, { lote: f.lote_id, registro: f.id }, f.fecha_monitoreo, f.fecha_monitoreo), `${f.lote} · ${f.fecha_monitoreo}`, [f.id], f.fecha_monitoreo, f.fecha_monitoreo, { valor_ce: medida(f.valor_ce, 'dS/m', 'promedio_guardado_por_registro'), ph: medida(f.ph, 'pH', 'ph_guardado_por_registro') }));
    }
    if (r.tipo === 'monitoreo') {
        if (r.detalle?.limitado)
            throw Error('detalle_fuente_limitado');
        if (grupos.some(g => !['lote', 'sublote', 'plaga'].includes(g)))
            throw Error('agrupacion_no_soportada');
        if (a.ultima_por_entidad && !r.consulta.agrupar_por.includes('sublote'))
            throw Error('ultima_requiere_sublote');
        const entidad = (f: typeof r.filas[number]) => JSON.stringify([f.lote_id, f.sublote_id, f.plaga_id]);
        // A generated no_revisado combination is not a newer recorded measurement.
        // Keep a real latest observation even when its denominator is invalid.
        const observadas = r.filas.filter(f => f.observaciones > 0);
        const entidadesObservadas = new Set(observadas.map(entidad));
        const nuncaObservadas = r.filas.filter(f => !entidadesObservadas.has(entidad(f)));
        const filas = a.ultima_por_entidad
            ? [...ultimas(observadas, entidad, f => f.ronda_inicio), ...ultimas(nuncaObservadas, entidad, f => f.ronda_inicio)]
            : r.filas;
        return filas.map(f => fila(claveAnalisis(r.tipo, { lote: f.lote_id ?? 'sin_lote', sublote: f.sublote_id ?? 'sin_sublote', plaga: f.plaga_id, ronda: f.ronda_id }, f.ronda_inicio, f.ronda_fin ?? f.ronda_inicio), `${f.lote ?? ''} · ${f.sublote ?? ''} · ${f.plaga} · ${f.ronda}`, [], f.ronda_inicio, f.ronda_fin ?? f.ronda_inicio, {
            incidencia: medida(f.incidencia, '%', 'incidencia_observaciones_muestreadas', f.estado === 'ok'), afectados: medida(f.afectados, 'observaciones', 'observaciones_afectadas', f.estado === 'ok'), muestreados: medida(f.muestreados, 'observaciones', 'observaciones_muestreadas', f.estado === 'ok'),
        }));
    }
    throw Error('dominio_no_soportado');
}
/** Validator and execution use the same closed metric registry. Invalid combinations fail explicitly. */
export function validarAnalisis(a: unknown, dominio: string): a is AnalisisConsulta {
    if (!a || typeof a !== 'object' || Array.isArray(a))
        return false;
    const v = a as AnalisisConsulta;
    const keys = Object.keys(v);
    if (!keys.length || keys.some(k => !['agrupar_por', 'ultima_por_entidad', 'condiciones', 'comparacion'].includes(k)) || !METRICAS_ANALITICAS[dominio])
        return false;
    if (v.ultima_por_entidad !== undefined && (v.ultima_por_entidad !== true || !['conductividad', 'pesajes_leche', 'monitoreo'].includes(dominio)))
        return false;
    if (v.agrupar_por !== undefined && (!Array.isArray(v.agrupar_por) || v.agrupar_por.length > 2 || new Set(v.agrupar_por).size !== v.agrupar_por.length || v.agrupar_por.some(g => !AGRUPACIONES_ANALITICAS_POR_DOMINIO[dominio]?.includes(g)) || dominio === 'clima' && v.agrupar_por.length > 1))
        return false;
    if (v.condiciones !== undefined && (!Array.isArray(v.condiciones) || !v.condiciones.length || v.condiciones.length > 4 || v.condiciones.some(c => !c || typeof c !== 'object' || Object.keys(c).some(k => !['metrica', 'operador', 'valor', 'unidad'].includes(k)) || !Object.prototype.hasOwnProperty.call(METRICAS_ANALITICAS[dominio], c.metrica) || METRICAS_ANALITICAS[dominio][c.metrica] !== c.unidad || !['gt', 'gte', 'lt', 'lte', 'eq'].includes(c.operador) || !Number.isFinite(c.valor))))
        return false;
    if (v.comparacion !== undefined) {
        const c = v.comparacion;
        if (!c || typeof c !== 'object' || Object.keys(c).some(k => !['metrica', 'izquierda', 'derecha'].includes(k)) || !Object.prototype.hasOwnProperty.call(METRICAS_ANALITICAS[dominio], c.metrica) || typeof c.izquierda !== 'string' || typeof c.derecha !== 'string' || c.izquierda === c.derecha || c.izquierda.length > 2000 || c.derecha.length > 2000)
            return false;
    }
    return true;
}
export function ejecutarAnalisis(a: AnalisisConsulta, r: ResultadoConsulta): ResultadoAnalisis {
    const tipo = 'tipo' in r ? r.tipo : 'labores';
    const out: ResultadoAnalisis = { resultado_id: r.id, estado: 'no_soportado', filas: [], detalle: { filas_totales: 0, filas_mostradas: 0, limitado: false }, avisos: [] };
    if (!validarAnalisis(a, tipo))
        return { ...out, avisos: ['analisis_fuera_del_contrato'] };
    if (!['ok', 'parcial', 'sin_registros', 'vacio_verificado'].includes(r.estado))
        return { ...out, estado: 'no_disponible', avisos: ['fuente_no_disponible'] };
    try {
        out.filas = calcularFilas(a, r);
    }
    catch (e) {
        return { ...out, avisos: [e instanceof Error ? e.message : 'analisis_no_soportado'] };
    }
    if (new Set(out.filas.map(f => f.clave)).size !== out.filas.length)
        return { ...out, filas: [], avisos: ['identidad_de_grupo_no_acreditada'] };
    for (const f of out.filas) {
        const estados = (a.condiciones ?? []).map(c => {
            const m = f.metricas[c.metrica];
            if (!m || m.estado !== 'completo' || m.valor === null)
                return 'indeterminado';
            const v = m.valor, t = c.valor;
            return (c.operador === 'gt' ? v > t : c.operador === 'gte' ? v >= t : c.operador === 'lt' ? v < t : c.operador === 'lte' ? v <= t : v === t) ? 'seleccionado' : 'excluido';
        });
        f.seleccion = estados.includes('excluido') ? 'excluido' : estados.includes('indeterminado') ? 'indeterminado' : 'seleccionado';
    }
    if (a.comparacion) {
        const c = a.comparacion, l = out.filas.find(f => f.clave === c.izquierda)?.metricas[c.metrica], d = out.filas.find(f => f.clave === c.derecha)?.metricas[c.metrica];
        const comparables = l && d && l.estado === 'completo' && d.estado === 'completo' && l.valor !== null && d.valor !== null && l.unidad === d.unidad && l.base === d.base;
        const delta = comparables ? d.valor! - l.valor! : null;
        out.comparacion = { ...c, delta: delta !== null && Number.isFinite(delta) ? delta : null, porcentaje: comparables && l.valor! > 0 && c.metrica !== 'incidencia' && Number.isFinite(100 * delta! / l.valor!) ? 100 * delta! / l.valor! : null, unidad: c.metrica === 'incidencia' ? 'puntos porcentuales' : METRICAS_ANALITICAS[tipo][c.metrica], ...(!comparables ? { motivo: 'bases_incompletas_o_incompatibles' } : {}) };
    }
    out.detalle = { filas_totales: out.filas.length, filas_mostradas: Math.min(30, out.filas.length), limitado: out.filas.length > 30 };
    if (out.filas.length > 2000)
        return { ...out, estado: 'no_disponible', filas: [], avisos: ['limite_analitico_excedido'], detalle: { ...out.detalle, filas_mostradas: 0, limitado: true } };
    out.estado = out.filas.some(f => f.seleccion === 'indeterminado' || Object.values(f.metricas).some(m => m.estado !== 'completo')) || out.comparacion?.delta === null ? 'parcial' : 'ok';
    return out;
}
export function renderAnalisis(r: ResultadoAnalisis): string {
    if (r.estado === 'no_soportado' || r.estado === 'no_disponible')
        return 'La transformación solicitada no tiene una base completa o compatible. No representa un cero.';
    const out = ['Análisis determinista sobre la selección y el período indicados:'];
    for (const f of r.filas.slice(0, 30)) {
        const valores = Object.entries(f.metricas).map(([k, m]) => `${k}: ${m.valor === null ? 'sin dato completo' : m.unidad === 'pesos' ? dineroConDetalleMensaje(m.valor) : numeroMensaje(m.valor) + ' ' + m.unidad}${m.estado !== 'completo' ? ` (subtotal/observado ${m.observado === null ? 'sin dato' : numeroMensaje(m.observado)}, ${m.usables}/${m.esperados} valores usables)` : ''}`);
        out.push(`${f.etiqueta.replace(/[\\`*_[\]|<>]/g, '\\$&')}: ${valores.join('; ')}; ${f.seleccion}.`);
    }
    if (r.comparacion) {
        const c = r.comparacion;
        out.push(`Cambio derecha menos izquierda: ${c.delta === null ? 'no calculable' : numeroMensaje(c.delta) + ' ' + c.unidad}; cambio relativo: ${c.porcentaje === null ? 'no calculable' : numeroMensaje(c.porcentaje) + ' %'}.`);
    }
    if (r.detalle.limitado)
        out.push(`Detalle parcial: ${r.detalle.filas_mostradas} de ${r.detalle.filas_totales} filas. No es una lista exhaustiva.`);
    out.push('Los valores indeterminados conservan su estado; no cuentan como cero ni como incumplimiento de un umbral.');
    return out.join('\n');
}
