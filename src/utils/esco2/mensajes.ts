import { renderPesajesLeche,renderLitrosQuincenales } from './leche.ts';
import { renderClima } from './clima.ts';
import { renderHato } from './hato.ts';
import { renderConductividad } from './conductividad.ts';
import { renderMonitoreo } from './monitoreo.ts';
// Canonical human Spanish for computed labor results. No model text is composed here.
import { formatLongDate } from '../formatPuro.ts';
import { dineroConDetalleMensaje as dineroMensaje, numeroMensaje as numero } from './formatoMensaje.ts';
import { validarFormaCoberturaFinal, type CoberturaTurno } from './cobertura.ts';
import { esFechaCalendario } from './fechaCalendario.ts';
import { esResultadoPesajesLeche, esResultadoLitrosQuincenales, esResultadoClima, esResultadoHato, esResultadoConductividad, esResultadoMonitoreo, esResultadoAplicaciones, esResultadoCantidades, esResultadoCostos, esResultadoFaltantesAplicacion, esResultadoLaborAplicacion, type Agrupacion, type FilaResultado, type ResultadoConsulta, type ResultadoParte, type ValoresMetricas } from './tipos.ts';
import { renderAplicaciones } from './aplicaciones.ts';
import { renderLaborAplicacion } from './laborAplicacion.ts';
import { renderCantidadesAplicacion } from './cantidades.ts';
import { renderCostosAplicacion } from './costos.ts';
import { renderFaltantesAplicacion } from './faltantes.ts';
export type AvisoMensaje = 'contexto_no_disponible' | 'contexto_demasiado_amplio';
const avisos: Record<AvisoMensaje, string> = { contexto_no_disponible: 'No pude recuperar el contexto anterior. Repite tu consulta completa.', contexto_demasiado_amplio: 'La selección es demasiado amplia para conservarla. Reduce las tareas seleccionadas y repite la consulta.' };
const metricas = {
    jornales: 'jornales registrados', costo: 'costo de mano de obra', dias_con_registro: 'días con registro', primer_registro: 'primer registro', ultimo_registro: 'último registro', jornales_por_arbol: 'jornales por árbol', jornales_por_hectarea: 'jornales por hectárea', costo_por_jornal: 'costo por jornal',
} as const;
const campos: Record<string, string> = { estado_actual: 'el estado actual', jornales_estimados: 'los jornales estimados', fechas_tarea: 'las fechas de la tarea', fecha_estimada_inicio: 'la fecha de inicio planeada', fecha_estimada_fin: 'la fecha de fin planeada', fecha_inicio_real: 'la fecha de inicio real', fecha_fin_real: 'la fecha de fin real', asociaciones: 'las aplicaciones asociadas' };
const fecha = (value: string) => formatLongDate(value);
const jornal = (n: number, registrado = false) => `${numero(n)} ${n === 1 ? 'jornal' : 'jornales'}${registrado ? n === 1 ? ' registrado' : ' registrados' : ''}`;
const dinero = dineroMensaje;
function nombre(text: string | undefined, base = 'Labor'): string {
    const result = (text ?? '').replace(/\s+/g, ' ').trim().replace(/[\\`*_[\]|<>]/g, '\\$&');
    return result || base;
}
/** Cita de la solicitud, separada de los hechos; conserva cifras, fechas y nombres. */
function solicitudCitada(texto: string): string {
    const sinIdentificadores = texto.replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '[identificador de la solicitud]');
    return nombre(sinIdentificadores);
}
export function mensajeAclaracion(categoria: string, tareas: string[] = [categoria]): string {
    const shown = tareas.slice(0, 6).map(t => `«${nombre(t, 'la labor indicada')}»`);
    const choices = shown.length < 2 ? shown[0] : shown.slice(0, -1).join(', ') + ' y ' + shown[shown.length - 1];
    const tail = tareas.length > 6 ? ` y ${numero(tareas.length - 6)} tareas más` : '';
    return `¿Quieres consultar ${tareas.length === 1 ? 'la tarea' : 'las tareas'} ${choices}${tail} o toda la categoría «${nombre(categoria, 'la categoría indicada')}»?`;
}
export function mensajeDisposicion(tipo: 'fuera_de_alcance' | 'aclaracion' | 'error_plan' | 'error_llm' | 'error_datos'): string {
    const textos = { fuera_de_alcance: 'Esa consulta todavía no está disponible. Puedo consultar labores y aplicaciones: jornales, tareas programadas, fechas y estado actual, cantidades de productos, costos de una aplicación, labor vinculada y faltantes vigentes de insumos.', aclaracion: 'Necesito precisar tu consulta. Indica la entidad o el alcance que falta para poder responder.', error_plan: 'No pude entender tu consulta. ¿Qué período de labores quieres revisar?', error_llm: 'No pude procesar tu consulta en este momento. Inténtalo de nuevo.', error_datos: 'No pude leer los datos de labores en este momento. Inténtalo de nuevo.' };
    return textos[tipo];
}
function periodo(r: ResultadoParte): string { return `Del ${fecha(r.alcance.desde)} al ${fecha(r.alcance.hasta)}, ambas fechas incluidas.`; }
function descripcionGrupo(g: Agrupacion, value: string): string {
    if (g === 'dia' && esFechaCalendario(value))
        return fecha(value);
    if (g === 'semana') {
        const d = value.match(/\d{4}-\d{2}-\d{2}/)?.[0];
        if (d && esFechaCalendario(d))
            return `semana del ${fecha(d)}`;
    }
    if (g === 'mes' && /^\d{4}-\d{2}$/.test(value))
        return formatLongDate(`${value}-01`).replace(/^1 de /, '');
    return nombre(value);
}
function etiqueta(f: FilaResultado): string { return Object.entries(f.grupo).map(([g, v]) => descripcionGrupo(g as Agrupacion, v)).join(' · ') || 'Labor'; }
function etiquetaEnParte(f: FilaResultado, r: ResultadoParte): string {
    const base = etiqueta(f);
    if (r.filas.filter(x => etiqueta(x) === base).length < 2)
        return base;
    const d = f.fechas_tarea?.estimada_inicio;
    if (d)
        return `${base} (inicio planeado: ${fecha(d)})`;
    if (f.estado_tarea)
        return `${base} (estado actual: ${nombre(f.estado_tarea)})`;
    return base;
}
function valores(v: ValoresMetricas): string[] {
    const out: string[] = [];
    if (v.jornales !== undefined)
        out.push(jornal(v.jornales, true));
    if (v.costo !== undefined && v.costo !== null)
        out.push(`costo de mano de obra: ${dinero(v.costo)}`);
    if (v.costo === null)
        out.push('costo de mano de obra incompleto');
    for (const key of ['dias_con_registro', 'primer_registro', 'ultimo_registro', 'jornales_por_arbol', 'jornales_por_hectarea', 'costo_por_jornal'] as const) {
        const value = v[key];
        if (value === undefined)
            continue;
        const rendered = value === null ? 'sin dato' : typeof value === 'string' ? fecha(value) : key === 'costo_por_jornal' ? dinero(value) : numero(value);
        out.push(`${metricas[key]}: ${rendered}`);
    }
    return out;
}
function metadatos(f: FilaResultado): string[] {
    const out: string[] = [];
    if (f.jornales_por_arbol === null)
        out.push('No pude calcular los jornales por árbol porque no hay una base válida de árboles para este grupo');
    if (f.jornales_por_hectarea === null)
        out.push('No pude calcular los jornales por hectárea porque no hay una base válida de área para este grupo');
    if (f.costo_por_jornal === null)
        out.push(f.costo === null ? 'No pude calcular el costo por jornal porque faltan costos registrados' : 'No pude calcular el costo por jornal porque no hay una base válida de jornales para este grupo');
    if (f.estado_tarea !== undefined)
        out.push(`estado actual registrado: ${f.estado_tarea === null ? 'sin dato' : nombre(f.estado_tarea)}`);
    if (f.jornales_estimados !== undefined)
        out.push(f.jornales_estimados === null ? 'sin estimado registrado' : `plan completo de la tarea: ${jornal(f.jornales_estimados)} estimados`);
    const labels = { estimada_inicio: 'inicio planeado', estimada_fin: 'fin planeado', real_inicio: 'inicio real', real_fin: 'fin real' };
    for (const [key, value] of Object.entries(f.fechas_tarea ?? {}))
        out.push(`${labels[key as keyof typeof labels]}: ${value === null ? 'sin fecha registrada' : fecha(value!)}`);
    const missing = f.campos_no_disponibles?.filter(k => k !== 'asociaciones').map(k => campos[k]).filter(Boolean) ?? [];
    if (missing.length)
        out.push(`No pude leer ${missing.join(', ')}`);
    return out;
}
function asociaciones(f: FilaResultado, r: ResultadoParte): string[] {
    const entity = etiquetaEnParte(f, r), a = f.asociaciones;
    const lista = (xs: string[]) => xs.length < 2 ? xs.join('') : xs.slice(0, -1).join(', ') + ' y ' + xs[xs.length - 1];
    if (a?.estado === 'no_disponible')
        return [`No pude comprobar las aplicaciones asociadas a ${entity} porque esos datos no están disponibles.`];
    if (a?.estado === 'vacio_verificado')
        return [`${entity} no tiene aplicaciones asociadas entre las que puedes ver.`];
    if (a?.estado === 'conocido') {
        const names = a.aplicaciones.map(app => nombre(app.nombre ?? undefined, 'una aplicación sin nombre registrado'));
        const states = a.aplicaciones.filter(app => app.estado !== null).map(app => `${nombre(app.nombre ?? undefined, 'aplicación sin nombre registrado')}: ${nombre(app.estado!)}`);
        return [`Aplicaciones asociadas a ${entity}: ${lista(names)}.`, ...(states.length ? [`Estados actuales registrados de esas aplicaciones: ${states.join('; ')}.`] : [])];
    }
    if (f.aplicacion !== undefined)
        return [f.aplicacion ? `Aplicación asociada a ${entity}: ${nombre(f.aplicacion.nombre ?? undefined, 'una aplicación sin nombre registrado')}.` : `${entity} no tiene aplicaciones asociadas entre las que puedes ver.`];
    return [];
}
function filas(r: ResultadoParte, scheduled: boolean): string[] {
    const labels = r.filas.map(etiqueta);
    const out: string[] = [];
    if (new Set(labels).size < labels.length)
        out.push('Hay nombres repetidos; las filas se mantienen separadas.');
    if (r.filas.length <= 5)
        return [...out, ...r.filas.map(f => `- ${etiquetaEnParte(f, r)}: ${[...(scheduled ? [] : valores(f)), ...metadatos(f)].join('; ') || 'sin otros datos disponibles'}.`)];
    const keys = (Object.keys(metricas) as Array<keyof typeof metricas>).filter(k => !scheduled && r.filas.some(f => f[k] !== undefined));
    const detail = r.filas.some(f => metadatos(f).length > 0);
    const headers = ['Grupo', ...keys.map(k => k === 'jornales' ? 'Jornales registrados' : k === 'costo' ? 'Costo de mano de obra' : metricas[k][0].toUpperCase() + metricas[k].slice(1)), ...(detail ? ['Detalle'] : [])];
    out.push(`| ${headers.join(' | ')} |`, `| ${headers.map(() => '---').join(' | ')} |`);
    for (const f of r.filas) {
        const values = keys.map(k => {
            const value = f[k];
            if (value === undefined)
                return 'No disponible';
            if (value === null)
                return k === 'costo' ? 'Costo incompleto' : 'Sin dato';
            return typeof value === 'string' ? fecha(value) : k === 'costo' || k === 'costo_por_jornal' ? dinero(value) : numero(value);
        });
        out.push(`| ${[etiquetaEnParte(f, r), ...values, ...(detail ? [metadatos(f).join('; ')] : [])].join(' | ')} |`);
    }
    return out;
}
function fuenteNoDisponible(r: ResultadoParte): string {
    const m = r.semantica?.motivo;
    if (m === 'asignacion_programada_no_disponible' || m === 'referencia_asignacion_no_disponible')
        return 'No tengo ese dato: no pude verificar los lotes asignados a las tareas programadas. Revisa sus asignaciones antes de consultar por lote.';
    if (m === 'fecha_programada_no_disponible')
        return 'No tengo ese dato: no pude leer todas las fechas de inicio planeadas. No puedo confirmar qué tareas corresponden al período.';
    if (m === 'ranking_con_valor_nulo')
        return 'No tengo ese dato: falta un valor necesario para ordenar todas las labores por la métrica solicitada.';
    if (['identidad_catalogo_no_disponible', 'referencia_tipo_no_disponible', 'campo_tarea_no_disponible', 'categoria_no_disponible'].includes(m ?? ''))
        return 'No tengo ese dato: no pude verificar los datos necesarios de las tareas y los lotes.';
    if (m === 'id_no_disponible')
        return 'No tengo ese dato: no pude verificar la tarea o el lote seleccionado entre los datos que puedes ver.';
    if (['campo_registro_no_disponible', 'referencia_o_valor_registro_no_disponible', 'identidad_registro_no_disponible'].includes(m ?? ''))
        return 'No tengo ese dato: no pude leer los datos de los registros de trabajo necesarios para responder.';
    return 'No tengo ese dato: no pude leer los datos necesarios para responder esta parte.';
}
function conciliacion(r: ResultadoParte): string[] {
    if (!r.particiones || r.semantica?.cohorte === 'tarea_programada' || r.semantica?.base_fecha === 'fecha_estimada_inicio')
        return [];
    const out: string[] = [];
    const p = r.particiones;
    if (typeof p.con_lote.jornales === 'number' && typeof p.sin_lote.jornales === 'number' && typeof r.total.jornales === 'number') {
        const a = p.con_lote.jornales, b = p.sin_lote.jornales, t = r.total.jornales;
        out.push(`Con lote: ${jornal(a)}; sin lote: ${jornal(b)}.${Math.abs(a + b - t) < 1e-8 ? ` Suman los ${jornal(t)} del total.` : ''}`);
        const close = Math.abs(p.con_lote.jornales + p.sin_lote.jornales - r.total.jornales) < 1e-8;
        out.push(`La separación entre registros con lote y sin lote ${close ? 'cuadra' : 'no cuadra'} con el total de jornales.`);
    }
    else
        out.push('No pude verificar la separación de jornales con lote y sin lote porque falta una de esas cifras.');
    if (r.total.costo !== undefined) {
        if (typeof r.total.costo === 'number' && typeof p.con_lote.costo === 'number' && typeof p.sin_lote.costo === 'number') {
            const a = p.con_lote.costo, b = p.sin_lote.costo, t = r.total.costo, close = Math.abs(a + b - t) < 1e-8;
            const exact = [a, b, t].every(v => Number.isInteger(v) && (Math.abs(v) < 1000000 || v % 1000000 === 0));
            out.push(`Con lote: ${dinero(a)}; sin lote: ${dinero(b)}.${close && exact ? ` Suman los ${dinero(t)} de costo total.` : ''}`);
            out.push(close ? exact ? 'También cuadra el costo de mano de obra.' : 'El costo de esa separación cuadra antes de redondear; los importes en millones son aproximados.' : 'El costo de mano de obra no cuadra con esa separación.');
        }
        else
            out.push('No pude conciliar el costo de esa separación porque hay costos sin dato.');
    }
    return out;
}
function renderParte(r: ResultadoParte): string {
    const scheduled = r.semantica?.cohorte === 'tarea_programada';
    if (r.semantica?.disposicion === 'no_soportada')
        return 'Esa consulta todavía no está disponible. Por ahora puedo responder sobre labores registradas y tareas programadas.';
    if (r.semantica?.disposicion === 'aclaracion')
        return r.aclaracion?.tipo === 'categoria_o_tareas' ? mensajeAclaracion(r.aclaracion.categoria, r.aclaracion.tareas) + (r.aclaracion.requiere_eleccion ? '\nElige una de las dos opciones para continuar.' : '') : 'Esta parte necesita que elijas entre la categoría y las tareas con ese nombre.';
    if (r.estado === 'no_disponible')
        return `${fuenteNoDisponible(r)}\n${periodo(r)}`;
    if (r.estado === 'no_resuelto') {
        const first = r.no_resueltos[0];
        return first ? `No pude identificar ${first.tipo === 'lote' ? 'el lote' : first.tipo === 'tarea' ? 'la tarea' : 'la categoría'} que quieres consultar. ${first.sugerencias.length ? `¿Te refieres a ${first.sugerencias.map(s => nombre(s)).join(' o ')}?` : '¿Qué nombre aparece en la app?'}` : 'No pude identificar la labor. ¿Qué nombre aparece en la app?';
    }
    const out: string[] = [];
    if (scheduled) {
        const n = r.semantica?.miembros.length ?? r.filas.length;
        out.push(n === 0 ? 'No hay tareas programadas registradas con inicio planeado en el período consultado entre las que puedes ver.' : `${n === 1 ? 'Hay una tarea programada' : `Hay ${numero(n)} tareas programadas`} con inicio planeado en el período consultado.`);
    }
    else if (r.estado === 'sin_registros') {
        out.push('No hay registros de trabajo en el período consultado.');
        if (r.total.jornales !== undefined)
            out.push(`${r.total.jornales === 1 ? 'Se registró' : 'Se registraron'} ${jornal(r.total.jornales)}${typeof r.total.costo === 'number' ? `; costo de mano de obra: ${dinero(r.total.costo)}` : ''}.`);
        else if (typeof r.total.costo === 'number')
            out.push(`Costo de mano de obra registrado: ${dinero(r.total.costo)}.`);
    }
    else if (r.total.jornales === undefined)
        out.push('No pude leer el total de jornales de esta parte.');
    else {
        const n = r.total.jornales;
        out.push(`${n === 1 ? 'Se registró' : 'Se registraron'} ${jornal(n)}${typeof r.total.costo === 'number' ? `; costo de mano de obra: ${dinero(r.total.costo)}` : ''}.`);
    }
    out.push(periodo(r));
    if (r.total.jornales_por_arbol === null)
        out.push('No pude calcular los jornales por árbol porque falta una base válida de árboles para el alcance consultado.');
    if (r.total.jornales_por_hectarea === null)
        out.push('No pude calcular los jornales por hectárea porque falta una base válida de área para el alcance consultado.');
    if (r.total.costo_por_jornal === null)
        out.push(r.total.costo === null ? 'No pude calcular el costo por jornal porque faltan costos.' : 'No pude calcular el costo por jornal porque no hay una base válida de jornales para ese cálculo.');
    if (r.total.costo === null)
        out.push('El costo no está completo: hay registros sin costo registrado.');
    const extras = valores({ ...r.total, jornales: undefined, costo: undefined });
    if (extras.length)
        out.push(`${extras.join('; ')}.`);
    out.push(...filas(r, scheduled));
    for (const f of r.filas)
        out.push(...asociaciones(f, r));
    if (r.estimados) {
        const e = r.estimados;
        out.push(`Jornales estimados para el plan completo de esas tareas: ${numero(e.jornales_estimados)}.`);
        if (e.tareas_sin_estimado && e.tareas_estimado_no_disponible)
            out.push(`Es un subtotal conocido: ${numero(e.tareas_sin_estimado)} ${e.tareas_sin_estimado === 1 ? 'tarea no tiene' : 'tareas no tienen'} estimado y el estimado de ${numero(e.tareas_estimado_no_disponible)} ${e.tareas_estimado_no_disponible === 1 ? 'tarea no se pudo leer' : 'tareas no se pudo leer'}.`);
        else if (e.tareas_sin_estimado || e.tareas_estimado_no_disponible)
            out.push('Es un subtotal conocido; faltan estimados.');
        out.push('Es el plan completo de las tareas; no corresponde solo al período consultado.');
        if (e.tareas_sin_estimado && !e.tareas_estimado_no_disponible)
            out.push(`Falta el estimado de ${numero(e.tareas_sin_estimado)} ${e.tareas_sin_estimado === 1 ? 'tarea' : 'tareas'}.`);
        if (e.tareas_estimado_no_disponible && !e.tareas_sin_estimado)
            out.push(`No pude leer el estimado de ${numero(e.tareas_estimado_no_disponible)} ${e.tareas_estimado_no_disponible === 1 ? 'tarea' : 'tareas'}.`);
        if (e.base === 'tareas_con_registros_en_los_lotes')
            out.push('Se incluyen solo tareas con trabajo registrado en los lotes seleccionados durante el período.');
        if (scheduled)
            out.push('Se incluyen solo las tareas con inicio planeado en el período.');
    }
    out.push(...conciliacion(r));
    if (r.cobertura.grupos_mostrados < r.cobertura.grupos_totales || r.semantica?.calificadores.some(q => q.startsWith('ranking:')))
        out.push(`Se muestran ${numero(r.cobertura.grupos_mostrados)} de ${numero(r.cobertura.grupos_totales)} grupos. El total incluye también los grupos no mostrados.`, `Quedan ${numero(r.cobertura.grupos_totales - r.cobertura.grupos_mostrados)} grupos fuera de la lista.`);
    const rank = r.semantica?.calificadores.find(q => q.startsWith('ranking:'));
    if (rank) {
        const [, metric, dir, tie] = rank.split(':');
        const label = metricas[metric as keyof typeof metricas];
        if (label)
            out.push(`Ordenados por ${label}, de ${dir === 'asc' ? 'menor a mayor' : 'mayor a menor'}. ${tie === 'incluir' ? 'Se incluyen los empates en el corte' : 'En los empates se conserva un orden estable entre las labores'}.`);
    }
    out.push('Se consultaron las labores que puedes ver.');
    for (const [field, label] of [['lotes', 'Lotes'], ['tareas', 'Tareas'], ['categorias', 'Categorías']] as const) {
        const selected = r.alcance[field];
        if (Array.isArray(selected) && selected.length)
            out.push(`${label}: ${selected.map(s => nombre(s)).join(', ')}.`);
    }
    const sujeto = scheduled ? 'tareas sin lote asignado' : 'registros sin lote';
    out.push(r.alcance.sin_lote === 'solo' ? `Se incluyen solo ${sujeto}.` : r.alcance.sin_lote === 'excluir' ? `Se excluyen ${sujeto}.` : `Se incluyen ${sujeto}.`);
    if (r.alcance.hasta_recortado_a_hoy)
        out.push('El trabajo registrado se cuenta solo hasta hoy.');
    if (r.filas.some(f => f.estado_tarea !== undefined) || scheduled)
        out.push('Los estados y las asignaciones son los que están registrados ahora; no describen cómo estaban en una fecha pasada.');
    if (r.semantica?.calificadores.includes('lecturas_sin_garantia_de_snapshot_conjunto'))
        out.push('No verifiqué que las tareas y sus aplicaciones correspondan al mismo momento.');
    return out.join('\n');
}
export function renderMensaje(resultados: ResultadoConsulta[], aviso?: AvisoMensaje, parcialFueraDeAlcance?: true, cobertura?: CoberturaTurno): string {
    if (aviso !== undefined && (typeof aviso !== 'string' || !Object.prototype.hasOwnProperty.call(avisos, aviso)))
        throw new Error('aviso_no_registrado');
    if (parcialFueraDeAlcance !== undefined && parcialFueraDeAlcance !== true)
        throw new Error('disposicion_parcial_no_valida');
    if (cobertura) validarFormaCoberturaFinal(cobertura, resultados);
    const parts = resultados.map((r, i) => {
        const text = esResultadoPesajesLeche(r) ? renderPesajesLeche(r) : esResultadoLitrosQuincenales(r) ? renderLitrosQuincenales(r) : esResultadoHato(r) ? renderHato(r) : esResultadoClima(r) ? renderClima(r) : esResultadoConductividad(r) ? renderConductividad(r) : esResultadoMonitoreo(r) ? renderMonitoreo(r) : esResultadoFaltantesAplicacion(r) ? renderFaltantesAplicacion(r) : esResultadoLaborAplicacion(r) ? renderLaborAplicacion(r) : esResultadoCostos(r) ? renderCostosAplicacion(r) : esResultadoCantidades(r) ? renderCantidadesAplicacion(r) : esResultadoAplicaciones(r) ? renderAplicaciones(r) : renderParte(r);
        if (resultados.length === 1)
            return text;
        const heading = `**Parte ${Number(r.id.slice(1)) || i + 1}: ${esResultadoPesajesLeche(r) ? 'Pesajes de leche' : esResultadoLitrosQuincenales(r) ? 'Litros quincenales' : esResultadoHato(r) ? 'Ficha y reproducción del hato' : esResultadoClima(r) ? 'Clima histórico observado' : esResultadoConductividad(r) ? 'Conductividad eléctrica del suelo' : esResultadoMonitoreo(r) ? 'Monitoreo por ronda' : esResultadoFaltantesAplicacion(r) ? 'Faltantes vigentes' : esResultadoLaborAplicacion(r) ? 'Labor vinculada a aplicaciones' : esResultadoCostos(r) ? 'Costos de la aplicación' : esResultadoCantidades(r) ? 'Cantidades de la aplicación' : esResultadoAplicaciones(r) ? 'Aplicaciones' : r.semantica?.cohorte === 'tarea_programada' ? 'Tareas programadas' : 'Labores registradas'}**`;
        return `${heading}\n${text}`;
    });
    if (cobertura?.estado === 'declarada_validada') {
        const disposiciones = { respondida: 'Respondida con los resultados vinculados.', fuente_no_disponible: 'No tengo todos los datos necesarios para responder esta parte.', aclarar: 'Necesito que precises la entidad o el alcance de esta parte.', fuera_de_contrato: 'Esta parte está fuera del alcance actual; no hago ese cálculo.' };
        const inventario = cobertura.partes.map((p, i) => `- Parte ${i + 1}, solicitud del usuario: «${solicitudCitada(p.texto)}». ${disposiciones[p.disposicion]}${p.parcial ? ' Conservo los datos parciales sustentados.' : ''}`);
        parts.unshift(`Subpartes de tu solicitud:\n${inventario.join('\n')}`);
    }
    if (parcialFueraDeAlcance || cobertura?.partes.some(p => p.disposicion !== 'respondida'))
        parts.push('Respuesta parcial: hay partes de tu solicitud que no están disponibles en el alcance actual. Los datos mostrados corresponden únicamente a las partes sustentadas.');
    if (aviso)
        parts.push(avisos[aviso]);
    return parts.join('\n\n');
}
/** Exact canonical regeneration preserves entity, metric, period and qualifier bindings. */
export function validarMensajeFinal(texto: string, resultados: ResultadoConsulta[], aviso?: AvisoMensaje, parcialFueraDeAlcance?: true, cobertura?: CoberturaTurno): boolean {
    try {
        return texto === renderMensaje(resultados, aviso, parcialFueraDeAlcance, cobertura);
    }
    catch {
        return false;
    }
}
