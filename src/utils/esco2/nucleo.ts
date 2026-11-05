// Turno P2: catálogo → planificador validado (un reintento si inválido) → D26 con estado del servidor
// → lectores fijos → cálculo y render factual deterministas. Sin composición factual LLM.
import { aplicarReglaDoble, terminoDoble } from './ambiguedad.ts';
import { resumenCatalogo, normalizar, resolverTareas } from './catalogo.ts';
import { renderMensaje, validarMensajeFinal, mensajeAclaracion, mensajeDisposicion } from './mensajes.ts';
import { ejecutarConsulta, SIN_LOTE_ETIQUETA } from './ejecutor.ts';
import { OPCIONES_FECHA_APLICACIONES, type EstadoTurno } from './estado.ts';
import type { ClienteLLM, Esfuerzo, MensajeLLM, RespuestaLLM } from './llm.ts';
import { promptPlanificador } from './prompts.ts';
import { fuenteEnMemoria, type FuenteLabores } from './fuente.ts';
import { ErrorPlan, herramientasPlanificador, validarPlan } from './registro.ts';
import { type ModeloEtapa, type Ruta } from './ruteo.ts';
import { operacionesDelPlan, planDeOperaciones, type ConsultaLabores, type DatosLabores, type MensajeHistorial, type Plan, type ResultadoConsulta, type ResultadoParte } from './tipos.ts';
import { ejecutarInventarioAplicaciones } from './aplicaciones.ts';
import { ejecutarLaborAplicacion } from './laborAplicacion.ts';
import { ejecutarCantidadesAplicacion } from './cantidades.ts';
import { ejecutarCostosAplicacion } from './costos.ts';
import { ejecutarFaltantesAplicacion } from './faltantes.ts';
import type { DatosInventarioAplicaciones, FuenteAplicaciones } from './aplicacionesTipos.ts';
/** Last client messages the planner sees to interpret a follow-up (same cap as before P2). */
export const MAX_HISTORIAL_PLANIFICADOR = 6;
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
    resultados: ResultadoConsulta[];
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
export function renderDeterminista(resultados: ResultadoConsulta[]): string { return renderMensaje(resultados); }
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
    fuenteAplicaciones?: FuenteAplicaciones;
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
    if (plan.tipo !== 'consultas' && plan.tipo !== 'operaciones')
        return null;
    const consultas = operacionesDelPlan(plan).filter(o => o.tipo === 'labores').map(o => o.consulta).filter(c => c.cohorte !== 'tarea_programada');
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
    // Client history helps the planner interpret a follow-up (the period, lots or tasks
    // already under discussion). It never proves a clarification choice or grants scope:
    // the D26 rule below ignores it in code, choices come only from the server-side
    // estadoToken, and every plan still passes validarPlan and the caller's RLS.
    const historial: MensajeLLM[] = [
        ...args.historial.slice(-MAX_HISTORIAL_PLANIFICADOR).map((m): MensajeLLM => ({ role: m.rol === 'assistant' ? 'assistant' : 'user', content: m.texto })),
        ...(args.estado?.plan ? [{ role: 'system' as const, content: `Contexto aceptado por el servidor: ${JSON.stringify(args.estado.plan)}` }] : []),
    ];
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
    // 0. Catálogo (nombres de lotes, tareas, tipos y categorías)
    let catalogo: Awaited<ReturnType<FuenteLabores['catalogo']>> = { tareas: [], lotes: [], tiposTareas: [] };
    let catalogoDisponible = true;
    try {
        catalogo = await fuente.catalogo();
        for (const rows of [catalogo.tareas, catalogo.lotes, catalogo.tiposTareas])
            if (!Array.isArray(rows) || rows.some(r => typeof r.id !== 'string' || !r.id.trim() || typeof r.nombre !== 'string'))
                throw new Error('catalogo_no_valido');
        if (catalogo.tiposTareas.some(t => t.categoria !== undefined && t.categoria !== null && typeof t.categoria !== 'string'))
            throw new Error('catalogo_no_valido');
    }
    catch {
        // An empty planning-only catalog is not factual evidence for any executor.
        catalogoDisponible = false;
        catalogo = { tareas: [], lotes: [], tiposTareas: [] };
    }
    let inventarioPlaneado: DatosInventarioAplicaciones | undefined;
    if (!catalogoDisponible && !args.estado?.pendiente) {
        try { inventarioPlaneado = await args.fuenteAplicaciones?.leer('fecha_inicio_planeada'); } catch { /* Both unavailable is handled before planning. */ }
        if (!Array.isArray(inventarioPlaneado?.aplicaciones))
            return salida({ ...base, respuesta: mensajeDisposicion('error_datos'), origen: 'error_datos', errorPlan: 'catalogo_no_disponible' });
    }
    let plan: Plan;
    const pendiente = args.estado?.pendiente;
    const decisiones = pendiente ? { ...args.estado?.decisiones } : {};
    if (pendiente) {
        const saved = structuredClone(args.estado!.plan);
        const operaciones = operacionesDelPlan(saved);
        const operacion = operaciones[pendiente.indice];
        if (pendiente.tipo === 'fecha_aplicaciones') {
            if (operacion?.tipo !== 'aplicaciones') return salida({ ...base, respuesta: mensajeDisposicion('error_plan'), origen: 'error_plan', errorPlan: 'estado_no_valido' });
            const choice = pendiente.opciones.find(o => o.id === args.respuestaAclaracion);
            if (!choice) {
                const resultado = ejecutarInventarioAplicaciones(operacion.consulta, {}, `p${pendiente.indice + 1}`, hoy);
                resultado.requiere_eleccion = true;
                return salida({ ...base, resultados: [resultado], respuesta: renderMensaje([resultado]), origen: 'aclaracion', estado: args.estado, opcionesAclaracion: pendiente.opciones });
            }
            operacion.consulta.base_fecha = choice.base_fecha;
            plan = saved;
        } else {
          if (operacion?.tipo !== 'labores') return salida({ ...base, respuesta: mensajeDisposicion('error_plan'), origen: 'error_plan', errorPlan: 'estado_no_valido' });
          const choice = pendiente.opciones.find(o => o.id === args.respuestaAclaracion);
          if (!choice) {
            const ids = pendiente.opciones.find(o => o.tipo === 'tarea')?.tarea_ids ?? [];
            const categoria = pendiente.opciones.find(o => o.tipo === 'categoria')?.categorias?.[0];
            const nombres = ids.map(id => catalogo.tareas.find(t => t.id === id)?.nombre);
            if (!categoria || nombres.some(n => n === undefined) || !catalogo.tiposTareas.some(t => t.categoria === categoria))
                return salida({ ...base, respuesta: 'Las opciones anteriores ya no están disponibles. Repite la consulta para revisar las tareas actuales.', origen: 'aclaracion' });
            const resultados = [resultadoPendiente(operacion.consulta, `p${pendiente.indice + 1}`, { tipo: 'categoria_o_tareas', categoria, tareas: nombres as string[], requiere_eleccion: true })];
            return salida({ ...base, resultados, respuesta: renderMensaje(resultados), origen: 'aclaracion', estado: args.estado, opcionesAclaracion: pendiente.opciones });
        }
        decisiones[`${pendiente.indice}:${normalizar(pendiente.termino)}`] = choice.tipo;
        const c = operacion.consulta;
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
    const operaciones = operacionesDelPlan(original);
    const laborales = operaciones.map((o, i) => ({ o, i })).filter((x): x is { o: Extract<typeof x.o, { tipo: 'labores' }>; i: number } => x.o.tipo === 'labores');
    const decisionesLabor: Record<string, 'tarea' | 'categoria'> = {};
    laborales.forEach(({ i }, local) => {
        for (const [key, value] of Object.entries(decisiones)) if (key.startsWith(`${i}:`)) decisionesLabor[`${local}:${key.slice(key.indexOf(':') + 1)}`] = value;
    });
    const planLabor: Plan = { tipo: 'consultas', consultas: laborales.map(x => x.o.consulta) };
    const d26 = catalogoDisponible ? aplicarReglaDoble(planLabor, catalogo, [], decisionesLabor) : { plan: planLabor, ajustes: [] };
    base.ajustes = d26.ajustes;
    let estado: EstadoTurno = { version: 1, plan: original, decisiones };
    let opciones: {
        id: string;
        etiqueta: string;
    }[] | undefined;
    const preguntas = new Map<number, NonNullable<ResultadoParte['aclaracion']>>();
    const blocked = new Set<number>();
    const consultasLabor = new Map<number, ConsultaLabores>();
    if (d26.plan.tipo === 'consultas')
        laborales.forEach(({ i }, local) => consultasLabor.set(i, d26.plan.tipo === 'consultas' ? d26.plan.consultas[local] : laborales[local].o.consulta));
    else {
        for (const { o, i } of laborales) {
            const c = o.consulta;
            const d = [...c.tareas, ...c.categorias].filter(t => !decisiones[`${i}:${normalizar(t)}`]).map(t => terminoDoble(t, catalogo)).find(x => x !== null);
            if (!d)
                continue;
            blocked.add(i);
            if (!estado.pendiente) {
                const opcionesPendientes = [{ id: 'tarea', etiqueta: 'Tareas con ese nombre', tipo: 'tarea' as const, tarea_ids: [...resolverTareas([d.texto], catalogo.tareas, catalogo.tiposTareas).ids] }, { id: 'categoria', etiqueta: 'Categoría completa', tipo: 'categoria' as const, categorias: [d.categoria] }];
                estado = { ...estado, pendiente: { tipo: 'labores', indice: i, termino: d.texto, pregunta: mensajeAclaracion(d.categoria, d.tareas), opciones: opcionesPendientes } };
                opciones = opcionesPendientes;
                preguntas.set(i, { tipo: 'categoria_o_tareas', categoria: d.categoria, tareas: opcionesPendientes[0].tarea_ids!.map(id => catalogo.tareas.find(t => t.id === id)!.nombre) });
            }
        }
        laborales.filter(x => !blocked.has(x.i)).forEach(({ o, i }) => consultasLabor.set(i, o.consulta));
    }
    // Select the first unresolved obligation in its original global position.
    for (let i = 0; i < operaciones.length; i++) {
        const o = operaciones[i];
        if (o.tipo !== 'aplicaciones' || o.consulta.base_fecha !== 'sin_precisar') continue;
        if (!estado.pendiente || i < estado.pendiente.indice) {
            estado.pendiente = { tipo: 'fecha_aplicaciones', indice: i, pregunta: '¿Qué base de fecha quieres consultar?', opciones: structuredClone(OPCIONES_FECHA_APLICACIONES) };
            opciones = estado.pendiente.opciones;
        }
    }
    const executionPlan: Plan = { tipo: 'consultas', consultas: [...consultasLabor.values()] };
    const rango = rangoDelPlan(executionPlan, hoy);
    const datos: DatosLabores = { ...catalogo, registros: [] };
    let registrosDisponibles = catalogoDisponible;
    try {
        if (catalogoDisponible && rango) datos.registros = await fuente.registros(rango.desde, rango.hasta);
    }
    catch {
        registrosDisponibles = false;
    }
    if (!registrosDisponibles && !estado.pendiente && operaciones.every(o => o.tipo === 'labores' && o.consulta.cohorte !== 'tarea_programada'))
        return salida({ ...base, plan, respuesta: mensajeDisposicion('error_datos'), origen: 'error_datos', errorPlan: catalogoDisponible ? 'registros_no_disponibles' : 'catalogo_no_disponible' });
    const resultados: ResultadoConsulta[] = [];
    for (let i = 0; i < operaciones.length; i++) {
        const o = operaciones[i], id = `p${i + 1}`;
        if (o.tipo === 'costos_aplicacion') {
            let fuenteCostos;
            try { fuenteCostos = await args.fuenteAplicaciones?.leerCostos?.(o.consulta); } catch { /* Unread costs remain local to this operation. */ }
            resultados.push(ejecutarCostosAplicacion(o.consulta, fuenteCostos ?? { seleccion: 'no_leido' }, id, hoy));
        } else if (o.tipo === 'labor_aplicacion') {
            let datosLabor;
            try { datosLabor = await args.fuenteAplicaciones?.leerLaborAplicacion?.(o.consulta); } catch { /* Independent unavailable relation. */ }
            resultados.push(ejecutarLaborAplicacion(o.consulta, datosLabor ?? { seleccion: 'no_leido' }, id, hoy));
        } else if (o.tipo === 'faltantes_aplicacion') {
            let datosFaltantes;
            try { datosFaltantes = await args.fuenteAplicaciones?.leerFaltantes?.(o.consulta); } catch { /* Independent unavailable relation. */ }
            resultados.push(ejecutarFaltantesAplicacion(o.consulta, datosFaltantes ?? { seleccion: 'no_leido' }, id, hoy));
        } else if (o.tipo === 'cantidades_aplicacion') {
            let fuenteCantidades;
            try { fuenteCantidades = await args.fuenteAplicaciones?.leerCantidades?.(o.consulta); } catch { /* Typed unread quantity result; independent parts survive. */ }
            resultados.push(ejecutarCantidadesAplicacion(o.consulta, fuenteCantidades ?? { seleccion: 'no_leido' }, id, hoy));
        } else if (o.tipo === 'aplicaciones') {
            let fuenteApps = {};
            if (o.consulta.base_fecha !== 'sin_precisar' && o.consulta.base_fecha !== 'cierre_administrativo') {
                try { fuenteApps = o.consulta.base_fecha === 'fecha_inicio_planeada' && inventarioPlaneado ? inventarioPlaneado : await args.fuenteAplicaciones?.leer(o.consulta.base_fecha) ?? {}; } catch { /* Explicit unavailable result below. */ }
            }
            resultados.push(ejecutarInventarioAplicaciones(o.consulta, fuenteApps, id, hoy));
        } else if (!catalogoDisponible || !registrosDisponibles && o.consulta.cohorte !== 'tarea_programada') {
            const r = resultadoPendiente(o.consulta, id);
            r.estado = 'no_disponible';
            r.semantica = { ...r.semantica!, disposicion: 'fuente_no_disponible', motivo: catalogoDisponible ? 'campo_registro_no_disponible' : 'identidad_catalogo_no_disponible' };
            resultados.push(r);
        } else resultados.push(blocked.has(i) ? resultadoPendiente(o.consulta, id, preguntas.get(i)) : ejecutarConsulta(consultasLabor.get(i) ?? o.consulta, datos, hoy, id));
    }
    const respuesta = renderMensaje(resultados);
    if (!validarMensajeFinal(respuesta, resultados))
        return salida({ ...base, plan: executionPlan, resultados: [], respuesta: mensajeDisposicion('error_datos'), origen: 'error_datos', errorPlan: 'mensaje_no_valido' });
    return salida({ ...base, plan: planDeOperaciones(operaciones), resultados, respuesta, origen: estado.pendiente ? 'aclaracion' : 'determinista', estado, opcionesAclaracion: opciones });
}
export { SIN_LOTE_ETIQUETA };
