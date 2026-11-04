// Turno P2: catálogo → planificador validado (un reintento si inválido) → D26 con estado del servidor
// → lectores fijos → cálculo y render factual deterministas. Sin composición factual LLM.
import { aplicarReglaDoble, terminoDoble } from './ambiguedad.ts';
import { resumenCatalogo, normalizar, resolverTareas } from './catalogo.ts';
import { renderMensaje, validarMensajeFinal, mensajeAclaracion, mensajeDisposicion } from './mensajes.ts';
import { ejecutarConsulta, SIN_LOTE_ETIQUETA } from './ejecutor.ts';
import type { EstadoTurno } from './estado.ts';
import type { ClienteLLM, Esfuerzo, MensajeLLM, RespuestaLLM } from './llm.ts';
import { promptPlanificador } from './prompts.ts';
import { fuenteEnMemoria, type FuenteLabores } from './fuente.ts';
import { ErrorPlan, herramientasPlanificador, validarPlan } from './registro.ts';
import { type ModeloEtapa, type Ruta } from './ruteo.ts';
import type { ConsultaLabores, DatosLabores, MensajeHistorial, Plan, ResultadoParte } from './tipos.ts';
export interface ConfigModelos {
    nombre: string;
    planificador: {
        modelo: string;
        esfuerzo: Esfuerzo;
    };
    compositor: {
        modelo: string;
        esfuerzo: Esfuerzo;
    };
    /** D25: compositor para planes de varias partes o varios dominios. Sin él, siempre el habitual. */
    compositorReforzado?: ModeloEtapa;
}
export interface RegistroLlamada {
    etapa: 'planificador' | 'compositor' | 'recomposicion';
    modelo: string;
    ms: number;
    entrada: number;
    salida: number;
    razonamiento: number;
    costoUsd: number | null;
}
export interface ResultadoTurno {
    respuesta: string;
    estado?: EstadoTurno;
    opcionesAclaracion?: {
        id: string;
        etiqueta: string;
    }[];
    /** Etapa que produjo la respuesta publicada. */
    origen: 'compositor' | 'recomposicion' | 'determinista' | 'aclaracion' | 'fuera_de_alcance' | 'error_plan' | 'error_llm' | 'error_datos';
    plan: Plan | null;
    errorPlan: string | null;
    /** D25: ruta del compositor. null si el turno no llegó a componer. */
    ruta: Ruta | null;
    /** Cambios deterministas aplicados al plan (D26). */
    ajustes: string[];
    resultados: ResultadoParte[];
    guarda: {
        primera: string[] | null;
        segunda: string[] | null;
    };
    llamadas: RegistroLlamada[];
    ms: number;
}
function registrar(etapa: RegistroLlamada['etapa'], r: RespuestaLLM): RegistroLlamada {
    return { etapa, modelo: r.modelo, ms: r.ms, ...r.uso };
}
/** Compatibility entrypoint for the canonical human message. */
export function renderDeterminista(resultados: ResultadoParte[]): string { return renderMensaje(resultados); }
function resultadoPendiente(c: ConsultaLabores, id: string, aclaracion?: ResultadoParte['aclaracion']): ResultadoParte {
    return { id, proposito: 'Consulta de labores', aclaracion, estado: 'no_resuelto', alcance: { desde: c.desde, hasta: c.hasta, hasta_recortado_a_hoy: false, lotes: 'todos', tareas: 'todas', categorias: 'todas', sin_lote: c.sin_lote, agrupar_por: c.agrupar_por }, no_resueltos: [], filas: [], total: {}, notas: [], cobertura: { registros: 0, registros_sin_lote: 0, registros_sin_costo: 0, grupos_totales: 0, grupos_mostrados: 0 }, semantica: { cohorte: c.cohorte ?? 'trabajo_registrado', base_fecha: c.cohorte === 'tarea_programada' ? 'fecha_estimada_inicio' : 'fecha_trabajo', disposicion: 'aclaracion', miembros: [], fuentes: [], calificadores: [] } };
}
interface ArgsTurno {
    pregunta: string;
    historial: MensajeHistorial[];
    hoy: string;
    llm: ClienteLLM;
    config: ConfigModelos;
    estado?: EstadoTurno;
    respuestaAclaracion?: string;
}
/** Turno sobre datos ya cargados (snapshot congelado, pruebas). */
export function responderTurno(args: ArgsTurno & {
    datos: DatosLabores;
}): Promise<ResultadoTurno> {
    return responderTurnoDesdeFuente({ ...args, fuente: fuenteEnMemoria(args.datos) });
}
/** Rango mínimo que cubre todas las partes del plan, recortado a hoy. */
export function rangoDelPlan(plan: Plan, hoy: string): {
    desde: string;
    hasta: string;
} | null {
    if (plan.tipo !== 'consultas' || plan.consultas.length === 0)
        return null;
    const consultas = plan.consultas.filter(c => c.cohorte !== 'tarea_programada');
    if (!consultas.length)
        return null;
    const desde = consultas.map((c) => c.desde).sort()[0];
    const hasta = consultas.map((c) => (c.hasta > hoy ? hoy : c.hasta)).sort().reverse()[0];
    return desde > hasta ? null : { desde, hasta };
}
/** Turno que lee de una fuente: catálogo antes de planear, registros después. */
export async function responderTurnoDesdeFuente(args: ArgsTurno & {
    fuente: FuenteLabores;
}): Promise<ResultadoTurno> {
    const inicio = Date.now();
    const { pregunta, hoy, fuente, llm, config } = args;
    // Client history never proves an accepted clarification or inherited scope.
    const historial: MensajeLLM[] = args.estado?.plan ? [{ role: 'system', content: `Contexto aceptado por el servidor: ${JSON.stringify(args.estado.plan)}` }] : [];
    const llamadas: RegistroLlamada[] = [];
    const salida = (o: Omit<ResultadoTurno, 'llamadas' | 'ms'>): ResultadoTurno => ({ ...o, llamadas, ms: Date.now() - inicio });
    const base: Pick<ResultadoTurno, 'plan' | 'errorPlan' | 'resultados' | 'guarda' | 'ruta' | 'ajustes'> = {
        plan: null,
        errorPlan: null,
        resultados: [],
        guarda: { primera: null, segunda: null },
        ruta: null,
        ajustes: [],
    };
    const sinDatos = mensajeDisposicion('error_datos');
    // 0. Catálogo (nombres de lotes, tareas, tipos y categorías)
    let catalogo: Awaited<ReturnType<FuenteLabores['catalogo']>>;
    try {
        catalogo = await fuente.catalogo();
        for (const rows of [catalogo.tareas, catalogo.lotes, catalogo.tiposTareas])
            if (!Array.isArray(rows) || rows.some(r => typeof r.id !== 'string' || !r.id.trim() || typeof r.nombre !== 'string'))
                throw new Error('catalogo_no_valido');
        if (catalogo.tiposTareas.some(t => t.categoria !== undefined && t.categoria !== null && typeof t.categoria !== 'string'))
            throw new Error('catalogo_no_valido');
    }
    catch {
        return salida({ ...base, respuesta: sinDatos, origen: 'error_datos', errorPlan: 'catalogo_no_disponible' });
    }
    let plan: Plan;
    const pendiente = args.estado?.pendiente;
    const decisiones = pendiente ? { ...args.estado?.decisiones } : {};
    if (pendiente) {
        const choice = pendiente.opciones.find(o => o.id === args.respuestaAclaracion);
        if (!choice) {
            const ids = pendiente.opciones.find(o => o.tipo === 'tarea')?.tarea_ids ?? [];
            const categoria = pendiente.opciones.find(o => o.tipo === 'categoria')?.categorias?.[0];
            const nombres = ids.map(id => catalogo.tareas.find(t => t.id === id)?.nombre);
            if (!categoria || nombres.some(n => n === undefined) || !catalogo.tiposTareas.some(t => t.categoria === categoria))
                return salida({ ...base, respuesta: 'Las opciones anteriores ya no están disponibles. Repite la consulta para revisar las tareas actuales.', origen: 'aclaracion' });
            const resultados = [resultadoPendiente(args.estado!.plan.consultas[pendiente.indice], `p${pendiente.indice + 1}`, { tipo: 'categoria_o_tareas', categoria, tareas: nombres as string[], requiere_eleccion: true })];
            return salida({ ...base, resultados, respuesta: renderMensaje(resultados), origen: 'aclaracion', estado: args.estado, opcionesAclaracion: pendiente.opciones });
        }
        decisiones[`${pendiente.indice}:${normalizar(pendiente.termino)}`] = choice.tipo;
        const saved = structuredClone(args.estado!.plan);
        const c = saved.consultas[pendiente.indice];
        c.tareas = c.tareas.filter(t => t !== pendiente.termino);
        c.categorias = c.categorias.filter(t => t !== pendiente.termino);
        if (choice.tipo === 'tarea') {
            const ids = choice.tarea_ids!;
            c.tarea_ids = c.tarea_ids?.length ? c.tarea_ids.filter(id => ids.includes(id)) : ids;
            if (!c.tarea_ids.length)
                return salida({ ...base, plan: saved, respuesta: 'La opción elegida no tiene tareas dentro del alcance original. Repite la consulta indicando la tarea.', origen: 'error_plan', errorPlan: 'seleccion_sin_interseccion' });
        }
        else
            c.categorias.push(...choice.categorias!);
        plan = saved;
    }
    else {
        const mensajes: MensajeLLM[] = [{ role: 'system', content: promptPlanificador(hoy, resumenCatalogo({ ...catalogo, registros: [] })) }, ...historial, { role: 'user', content: pregunta }];
        let validado: Plan | undefined;
        for (let intento = 0; intento < 2; intento++) {
            let rPlan: RespuestaLLM;
            try {
                rPlan = await llm.completar({ modelo: config.planificador.modelo, esfuerzo: config.planificador.esfuerzo, mensajes, herramientas: herramientasPlanificador(), toolChoice: 'required', maxTokens: 1500 });
                llamadas.push(registrar('planificador', rPlan));
            }
            catch {
                return salida({ ...base, respuesta: mensajeDisposicion('error_llm'), origen: 'error_llm', errorPlan: 'planificador_no_disponible' });
            }
            try {
                validado = validarPlan(rPlan.llamadas);
                break;
            }
            catch (e) {
                if (!(e instanceof ErrorPlan) || intento === 1)
                    return salida({ ...base, respuesta: mensajeDisposicion('error_plan'), origen: 'error_plan', errorPlan: e instanceof ErrorPlan ? 'plan_no_valido' : 'plan_error' });
                // Do not promote the rejected output or its error text into context.
                mensajes.push({ role: 'system', content: 'El plan anterior no cumple el esquema. Reintenta una sola vez la pregunta original con las herramientas y argumentos registrados.' });
            }
        }
        plan = validado!;
    }
    if (plan.tipo === 'fuera_de_alcance')
        return salida({ ...base, plan, respuesta: mensajeDisposicion('fuera_de_alcance'), origen: 'fuera_de_alcance' });
    if (plan.tipo === 'aclaracion')
        return salida({ ...base, plan, respuesta: mensajeDisposicion('aclaracion'), origen: 'aclaracion' });
    const original = structuredClone(plan);
    const d26 = aplicarReglaDoble(plan, catalogo, [], decisiones);
    base.ajustes = d26.ajustes;
    let estado: EstadoTurno = { version: 1, plan: original, decisiones };
    let opciones: {
        id: string;
        etiqueta: string;
    }[] | undefined;
    const preguntas = new Map<number, NonNullable<ResultadoParte['aclaracion']>>();
    let consultas = plan.consultas;
    const blocked = new Set<number>();
    if (d26.plan.tipo === 'consultas')
        consultas = d26.plan.consultas;
    else {
        for (let i = 0; i < consultas.length; i++) {
            const c = consultas[i];
            const d = [...c.tareas, ...c.categorias].filter(t => !decisiones[`${i}:${normalizar(t)}`]).map(t => terminoDoble(t, catalogo)).find(x => x !== null);
            if (!d)
                continue;
            blocked.add(i);
            if (!estado.pendiente) {
                const opcionesPendientes = [{ id: 'tarea', etiqueta: 'Tareas con ese nombre', tipo: 'tarea' as const, tarea_ids: [...resolverTareas([d.texto], catalogo.tareas, catalogo.tiposTareas).ids] }, { id: 'categoria', etiqueta: 'Categoría completa', tipo: 'categoria' as const, categorias: [d.categoria] }];
                estado = { ...estado, pendiente: { indice: i, termino: d.texto, pregunta: mensajeAclaracion(d.categoria, d.tareas), opciones: opcionesPendientes } };
                opciones = opcionesPendientes;
                preguntas.set(i, { tipo: 'categoria_o_tareas', categoria: d.categoria, tareas: opcionesPendientes[0].tarea_ids!.map(id => catalogo.tareas.find(t => t.id === id)!.nombre) });
            }
        }
        consultas = consultas.filter((_, i) => !blocked.has(i));
    }
    const executionPlan: Plan = { tipo: 'consultas', consultas };
    const rango = rangoDelPlan(executionPlan, hoy);
    let datos: DatosLabores;
    try {
        datos = { ...catalogo, registros: rango ? await fuente.registros(rango.desde, rango.hasta) : [] };
    }
    catch {
        return salida({ ...base, plan, respuesta: sinDatos, origen: 'error_datos', errorPlan: 'registros_no_disponibles' });
    }
    const resultados = original.consultas.map((c, i) => blocked.has(i) ? resultadoPendiente(c, `p${i + 1}`, preguntas.get(i)) : ejecutarConsulta(d26.plan.tipo === 'consultas' ? d26.plan.consultas[i] : c, datos, hoy, `p${i + 1}`));
    const respuesta = renderMensaje(resultados);
    if (!validarMensajeFinal(respuesta, resultados))
        return salida({ ...base, plan: executionPlan, resultados: [], respuesta: mensajeDisposicion('error_datos'), origen: 'error_datos', errorPlan: 'mensaje_no_valido' });
    return salida({ ...base, plan: { tipo: 'consultas', consultas: original.consultas }, resultados, respuesta, origen: estado.pendiente ? 'aclaracion' : 'determinista', estado, opcionesAclaracion: opciones });
}
export { SIN_LOTE_ETIQUETA };
