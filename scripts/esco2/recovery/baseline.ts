// Current production core, unmodified. Only expressible approved intent is translated
// to the legacy DSL. No association/source defect or semantic result is repaired.
import { resolverLotes, resolverTareas } from '../../../src/utils/esco2/catalogo.ts';
import { responderTurno } from '../../../src/utils/esco2/nucleo.ts';
import type { ClienteLLM } from '../../../src/utils/esco2/llm.ts';
import type { ConsultaLabores, ResultadoParte } from '../../../src/utils/esco2/tipos.ts';
import type { Afirmacion, EntradaExperimento, Obligacion, ResultadoObligacion, SalidaExperimento } from './contracts.ts';
function traducir(e: EntradaExperimento, o: Obligacion): {
    consulta?: ConsultaLabores;
    limite?: string;
} {
    const consulta = structuredClone(o.consulta);
    if (o.tareaIds) {
        const labels = [...new Set(e.datos.tareas.filter(t => o.tareaIds!.includes(t.id)).map(t => t.nombre))];
        const resolved = resolverTareas(labels, e.datos.tareas, e.datos.tiposTareas);
        const actual = [...resolved.ids].sort();
        if (resolved.noResueltos.length || JSON.stringify(actual) !== JSON.stringify([...o.tareaIds].sort()))
            return { limite: 'seleccion_id_no_representable' };
        consulta.tareas = labels;
    }
    if (o.loteIds) {
        const labels = e.datos.lotes.filter(l => o.loteIds!.includes(l.id)).map(l => l.nombre);
        const resolved = resolverLotes(labels, e.datos.lotes);
        if (resolved.noResueltos.length || resolved.ids.size !== o.loteIds.length)
            return { limite: 'seleccion_id_no_representable' };
        consulta.lotes = labels;
    }
    if (o.requeridos.includes('asociaciones') || o.requeridos.includes('estado_actual'))
        consulta.incluir_estado_tarea = true;
    return { consulta };
}
export async function runBaseline(input: EntradaExperimento): Promise<SalidaExperimento> {
    if (!input.actor.autenticado || !input.actor.activo || input.actor.rol !== 'Gerencia')
        return { variante: 'baseline', resultados: [], texto: 'Acceso denegado', seguridad: { permitido: false, lecturas: 0, propietario: input.actor.id } };
    const translated = input.obligaciones.map(o => traducir(input, o));
    const selected = input.obligaciones.map((o, i) => ({ o, translated: translated[i], index: i })).filter(x => !x.translated.limite);
    const llm: ClienteLLM = { async completar(s) {
            if (!s.herramientas)
                throw new Error('offline deterministic composition');
            const calls = selected.length ? selected.map(({ o, translated: t }) => o.aclaracion ? { nombre: 'pedir_aclaracion', argumentos: JSON.stringify({ pregunta: o.aclaracion.termino, motivo: 'ambigua' }) } : o.noSoportada ? { nombre: 'fuera_de_alcance', argumentos: JSON.stringify({ motivo: o.noSoportada }) } : { nombre: 'consultar_labores', argumentos: JSON.stringify(t.consulta) }) : [{ nombre: 'fuera_de_alcance', argumentos: JSON.stringify({ motivo: 'DSL no representa la identidad aprobada' }) }];
            return { texto: '', llamadas: calls, uso: { entrada: 0, salida: 0, razonamiento: 0, costoUsd: 0 }, ms: 0, modelo: s.modelo, finishReason: 'stop' };
        } };
    const turn = await responderTurno({ pregunta: input.pregunta, historial: [], hoy: input.hoyBogota, datos: input.datos, llm, config: { nombre: 'offline', planificador: { modelo: 'offline', esfuerzo: 'none' }, compositor: { modelo: 'offline', esfuerzo: 'none' }, compositorReforzado: { modelo: 'offline', esfuerzo: 'none' } } });
    const results: ResultadoObligacion[] = input.obligaciones.map((o, index) => {
        if (translated[index].limite)
            return { id: o.id, disposicion: 'no_soportada', afirmaciones: [], calificadores: [], motivo: translated[index].limite };
        const executionIndex = selected.findIndex(x => x.index === index);
        const legacy: ResultadoParte | undefined = turn.resultados[executionIndex];
        const claims: Afirmacion[] = [];
        // The unchanged deterministic fallback explicitly says whole-task plan and,
        // when nonzero, the number of tasks without an estimate. Preserve those
        // existing statements in this diagnostic projection; never add them to text.
        const estimateQualifiers = legacy?.estimados && turn.origen === 'determinista'
            ? ['estimado_tarea_completa', ...(legacy.estimados.tareas_sin_estimado > 0
                ? ['estimado_parcial', `estimados_faltantes:${legacy.estimados.tareas_sin_estimado}`]
                : [])]
            : [];
        const add = (entity: Afirmacion['entidad'], metric: Afirmacion['metrica'], value: Afirmacion['valor'], state?: Afirmacion['estado']) => claims.push({ id: `${o.id}:${entity.tipo}:${entity.id}:${metric}`, obligacionId: o.id, entidad: entity, metrica: metric, unidad: metric === 'costo' ? 'moneda' : metric === 'asociaciones' || metric === 'miembros' ? 'ids' : metric === 'estado_actual' ? 'estado' : 'jornales', cohorte: 'trabajo_registrado', baseFecha: 'fecha_trabajo', desde: legacy?.alcance.desde ?? o.consulta.desde, hasta: legacy?.alcance.hasta ?? o.consulta.hasta, estado: state ?? (value === null ? 'nulo' : Array.isArray(value) && !value.length ? 'vacio_verificado' : 'conocido'), valor: value, calificadores: metric === 'jornales_estimados' ? estimateQualifiers : [], fuentes: [input.fuente.id] });
        if (legacy) {
            const total: Afirmacion['entidad'] = { tipo: 'total', id: 'total', nombre: 'Total' };
            if (o.requeridos.includes('metricas'))
                for (const m of o.consulta.metricas)
                    add(total, m, legacy.total[m] ?? null);
            const members: string[] = [];
            let allIdentified = true;
            for (const row of legacy.filas) {
                const grain = (translated[index].consulta?.agrupar_por[0] ?? (translated[index].consulta?.incluir_estado_tarea ? 'tarea' : undefined)) ?? 'tarea';
                const name = row.grupo[grain] ?? '';
                const possible = grain === 'tarea' ? input.datos.tareas.filter(t => t.nombre === name) : grain === 'lote' ? input.datos.lotes.filter(l => l.nombre === name) : [];
                // The baseline result has no task ID. Duplicate display labels do not prove identity.
                const id = grain === 'lote' && name === '(sin lote)' ? 'sin_lote' : possible.length === 1 ? possible[0].id : ['dia', 'semana', 'mes', 'categoria', 'tipo_tarea'].includes(grain) ? name : null;
                if (id === null) {
                    allIdentified = false;
                    continue;
                }
                members.push(id);
                const entity: Afirmacion['entidad'] = { tipo: grain, id, nombre: name };
                if (o.requeridos.includes('metricas'))
                    for (const m of o.consulta.metricas)
                        add(entity, m, row[m] ?? null);
                if (o.requeridos.includes('asociaciones'))
                    add(entity, 'asociaciones', row.aplicacion ? input.datos.aplicaciones?.filter(a => a.tarea_id === id).map(a => a.id) ?? [] : [], row.aplicacion === undefined ? 'no_disponible' : undefined);
                if (o.requeridos.includes('estado_actual'))
                    add(entity, 'estado_actual', row.estado_tarea ?? null);
            }
            if (o.requeridos.includes('miembros') && allIdentified)
                add(total, 'miembros', members);
            if (o.requeridos.includes('estimados'))
                add(total, 'jornales_estimados', legacy.estimados?.jornales_estimados ?? null);
        }
        return { id: o.id, disposicion: turn.origen === 'aclaracion' ? 'aclaracion' : turn.origen === 'fuera_de_alcance' ? 'no_soportada' : legacy ? 'respondida' : 'error', afirmaciones: claims, calificadores: [] };
    });
    return { variante: 'baseline', resultados: results, texto: turn.respuesta, seguridad: { permitido: true, lecturas: 1, propietario: input.actor.id } };
}
