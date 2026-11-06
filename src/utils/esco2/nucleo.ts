import { ejecutarClima } from './clima.ts';
import type { FuenteClima, ResumenDiarioClima } from './climaTipos.ts';
import { ejecutarConductividad } from './conductividad.ts';
import type { CatalogoConductividad, FuenteConductividad, RegistroConductividad } from './conductividadTipos.ts';
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
import { ejecutarMonitoreo } from './monitoreo.ts';
import type { CatalogoMonitoreo, FuenteMonitoreo, ObservacionMonitoreo } from './monitoreoTipos.ts';
import type { DatosInventarioAplicaciones, FuenteAplicaciones } from './aplicacionesTipos.ts';
import { construirCoberturaFinal, coberturaNoCertificada, validarCoberturaFinal, type CoberturaTurno, type ModoCobertura } from './cobertura.ts';
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
    cobertura: CoberturaTurno;
    estado?: EstadoTurno;
    opcionesAclaracion?: {
        id: string;
        etiqueta: string;
    }[];
    /** Etapa que produjo la respuesta publicada. */
    origen: 'compositor' | 'recomposicion' | 'determinista' | 'aclaracion' | 'fuera_de_alcance' | 'error_plan' | 'error_llm' | 'error_datos';
    plan: Plan | null;
    errorPlan: string | null;
    /** Closed reason code of a rejected plan (diagnostic only; never user text). */
    motivoPlan?: string;
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
/** Closed retry instructions, one per rejection reason. No model or user text enters here. */
export const INSTRUCCION_REINTENTO: Record<string, string> = {
    sin_cobertura: 'La primera llamada debe llevar cobertura con todas las subpartes.',
    inventario_forma: 'cobertura lleva solo version:1 y partes, una lista de una a ocho partes.',
    carrier: 'fuera_de_alcance o pedir_aclaracion van solos, con parte_ids vacío; usa pedir_aclaracion solo si alguna parte tiene disposicion aclarar.',
    carrier_extra: 'No combines fuera_de_alcance ni pedir_aclaracion con consultas; declara esas partes solo en cobertura.',
    texto_no_literal: 'Cada texto de cobertura debe copiar un fragmento de la pregunta actual.',
    parte_forma: 'Cada parte lleva solo id, texto, capacidad y disposicion, con id s1, s2... en orden.',
    fuera_de_contrato_inconsistente: 'Solo una parte con capacidad fuera_de_contrato lleva disposicion fuera_de_contrato.',
    parte_consultar_sin_operacion: 'Cada parte con disposicion consultar necesita una llamada que la cite en parte_ids. Si ninguna herramienta la responde, declárala fuera_de_contrato.',
    vinculo_a_parte_no_consultar: 'parte_ids solo puede citar partes con disposicion consultar.',
    capacidad_no_coincide: 'La capacidad de cada parte citada debe ser la de la herramienta que la cita.',
    parte_id_inexistente: 'parte_ids solo puede citar ids declarados en cobertura.',
    parte_ids_forma: 'Cada llamada ejecutable lleva parte_ids, una lista no vacía sin repetidos.',
    portadora_con_operaciones: 'No combines fuera_de_alcance ni pedir_aclaracion con consultas; declara esas partes solo en cobertura.',
    cobertura_contradictoria: 'Declara un único inventario de cobertura.',
    limite: 'Usa como máximo cuatro llamadas.',
    argumentos_no_validos: 'Usa solo los argumentos registrados de cada herramienta.',
};
/** Maps an ErrorPlan message to a closed reason code. */
export function motivoRechazoPlan(mensaje: string): string {
    if (mensaje.startsWith('cobertura_no_valida:')) {
        const codigo = mensaje.slice('cobertura_no_valida:'.length);
        return /^[a-z_]+$/.test(codigo) ? codigo : 'cobertura_no_valida';
    }
    return 'argumentos_no_validos';
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
    fuenteMonitoreo?: FuenteMonitoreo;
    fuenteClima?: FuenteClima;
    fuenteConductividad?: FuenteConductividad;
    /** Solo integración interna: el recorrido real exige cobertura por defecto. */
    modoCobertura?: ModoCobertura;
}
/** Wrapper puro de compatibilidad de motores: sin manifest no certifica cobertura. */
export function responderTurno(args: ArgsTurno & {
    datos: DatosLabores;
}): Promise<ResultadoTurno> {
    return responderTurnoDesdeFuente({ ...args, modoCobertura: args.modoCobertura ?? 'legado_sin_certificar', fuente: fuenteEnMemoria(args.datos) });
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
    const exigirCobertura = args.modoCobertura !== 'legado_sin_certificar';
    // Client history helps the planner interpret a follow-up (the period, lots or tasks
    // already under discussion). It never proves a clarification choice or grants scope:
    // the D26 rule below ignores it in code, choices come only from the server-side
    // estadoToken, and every plan still passes validarPlan and the caller's RLS.
    const historial: MensajeLLM[] = [
        ...args.historial.slice(-MAX_HISTORIAL_PLANIFICADOR).map((m): MensajeLLM => ({ role: m.rol === 'assistant' ? 'assistant' : 'user', content: m.texto })),
        ...(args.estado?.plan ? [{ role: 'system' as const, content: `Contexto aceptado por el servidor: ${JSON.stringify(args.estado.plan)}` }] : []),
    ];
    const llamadas: RegistroLlamada[] = [];
    const salida = (o: Omit<ResultadoTurno, 'llamadas' | 'ms' | 'cobertura'> & { cobertura?: CoberturaTurno }): ResultadoTurno => ({ cobertura: coberturaNoCertificada(), ...o, llamadas, ms: Date.now() - inicio });
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
    let catalogoMonitoreo: CatalogoMonitoreo = {};
    let catalogoConductividad: CatalogoConductividad = {};
    if (!args.estado?.pendiente) {
        // El catálogo laboral excluye aplicaciones sin tarea: leer el catálogo propio,
        // con el mismo lector fijo/JWT, antes de planear. Fallo conserva no leído.
        try { inventarioPlaneado = await args.fuenteAplicaciones?.leer('fecha_inicio_planeada'); } catch { /* El dominio no leído no bloquea los otros. */ }
        try { catalogoMonitoreo = await args.fuenteMonitoreo?.catalogo() ?? {}; } catch { /* No leído, no vacío. */ }
        try { catalogoConductividad = await args.fuenteConductividad?.catalogo() ?? {}; } catch { /* Dominio independiente. */ }
    }
    if (!catalogoDisponible && !args.estado?.pendiente) {
        if (!args.fuenteClima && !Array.isArray(inventarioPlaneado?.aplicaciones) && !Array.isArray(catalogoMonitoreo.rondas) && !Array.isArray(catalogoConductividad.lotes))
            return salida({ ...base, respuesta: mensajeDisposicion('error_datos'), origen: 'error_datos', errorPlan: 'catalogo_no_disponible' });
    }
    let plan: Plan;
    const pendiente = args.estado?.pendiente;
    const decisiones = pendiente ? { ...args.estado?.decisiones } : {};
    if (pendiente) {
        const saved = structuredClone(args.estado!.plan);
        if (exigirCobertura && !saved.cobertura) return salida({ ...base, respuesta: mensajeDisposicion('error_plan'), origen: 'error_plan', errorPlan: 'estado_sin_cobertura' });
        const operaciones = operacionesDelPlan(saved);
        const operacion = operaciones[pendiente.indice];
        if (pendiente.tipo === 'fecha_aplicaciones') {
            if (operacion?.tipo !== 'aplicaciones') return salida({ ...base, respuesta: mensajeDisposicion('error_plan'), origen: 'error_plan', errorPlan: 'estado_no_valido' });
            const choice = pendiente.opciones.find(o => o.id === args.respuestaAclaracion);
            if (!choice) {
                const resultado = ejecutarInventarioAplicaciones(operacion.consulta, {}, `p${pendiente.indice + 1}`, hoy);
                resultado.requiere_eleccion = true;
                if (!saved.cobertura) return salida({ ...base, plan: saved, resultados: [resultado], respuesta: renderMensaje([resultado], undefined, saved.parcialFueraDeAlcance), origen: 'aclaracion', estado: args.estado, opcionesAclaracion: pendiente.opciones });
            }
            if (choice) operacion.consulta.base_fecha = choice.base_fecha;
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
            if (!saved.cobertura) return salida({ ...base, plan: saved, resultados, respuesta: renderMensaje(resultados, undefined, saved.parcialFueraDeAlcance), origen: 'aclaracion', estado: args.estado, opcionesAclaracion: pendiente.opciones });
        }
        if (choice) {
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
        }
        plan = saved;
        }
    }
    else {
        const mensajes: MensajeLLM[] = [{ role: 'system', content: promptPlanificador(hoy, { ...resumenCatalogo({ ...catalogo, registros: [] }, inventarioPlaneado?.aplicaciones), monitoreo: catalogoMonitoreo, conductividad: catalogoConductividad }) }, ...historial, { role: 'user', content: pregunta }];
        // A follow-up («y la de octubre?») inherits subparts from the user's earlier messages
        // that the planner received, so a part may quote them. Assistant text never counts.
        const textoCitable = [...historial.filter(m => m.role === 'user').map(m => m.content), pregunta].join(' | ');
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
                validado = validarPlan(rPlan.llamadas, exigirCobertura ? { pregunta: textoCitable, exigirCobertura: true } : undefined);
                break;
            }
            catch (e) {
                const motivo = e instanceof ErrorPlan ? motivoRechazoPlan(e.message) : 'plan_error';
                if (!(e instanceof ErrorPlan) || intento === 1)
                    return salida({ ...base, respuesta: mensajeDisposicion('error_plan'), origen: 'error_plan', errorPlan: e instanceof ErrorPlan ? 'plan_no_valido' : 'plan_error', motivoPlan: motivo });
                // The rejected output is never promoted into context. Only a fixed instruction,
                // chosen by our own closed reason code, tells the planner what to correct.
                mensajes.push({ role: 'system', content: `El plan anterior no cumple el esquema. ${INSTRUCCION_REINTENTO[motivo] ?? ''} Reintenta una sola vez la pregunta original con las herramientas y argumentos registrados.`.replace(/\s+/g, ' ') });
            }
        }
        plan = validado!;
    }
    if (plan.tipo === 'fuera_de_alcance' || plan.tipo === 'aclaracion') {
        const cobertura = construirCoberturaFinal(plan, [], hoy);
        const respuesta = cobertura.estado === 'declarada_validada' ? renderMensaje([], undefined, undefined, cobertura) : mensajeDisposicion(plan.tipo);
        return salida({ ...base, plan, cobertura, respuesta, origen: plan.tipo });
    }
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
    let registrosDisponibles = catalogoDisponible && (!original.cobertura || rango !== null || laborales.every(({ o }) => o.consulta.cohorte === 'tarea_programada'));
    try {
        if (catalogoDisponible && rango) datos.registros = await fuente.registros(rango.desde, rango.hasta);
    }
    catch {
        registrosDisponibles = false;
    }
    if (!original.cobertura && !registrosDisponibles && !estado.pendiente && operaciones.every(o => o.tipo === 'labores' && o.consulta.cohorte !== 'tarea_programada'))
        return salida({ ...base, plan, respuesta: mensajeDisposicion('error_datos'), origen: 'error_datos', errorPlan: catalogoDisponible ? 'registros_no_disponibles' : 'catalogo_no_disponible' });
    const resultados: ResultadoConsulta[] = [];
    for (let i = 0; i < operaciones.length; i++) {
        const o = operaciones[i], id = `p${i + 1}`;
        if (o.tipo === 'conductividad') {
            let registros: RegistroConductividad[] | undefined;
            if (args.estado?.pendiente) try { catalogoConductividad = await args.fuenteConductividad?.catalogo() ?? {}; } catch { /* Fuente independiente. */ }
            // Una solicitud sin fecha pide precisar sin recorrer toda la historia CE.
            if (o.consulta.desde && o.consulta.hasta) try { registros = await args.fuenteConductividad?.leerRegistros(); } catch { /* No leído, nunca vacío. */ }
            resultados.push(ejecutarConductividad(o.consulta, { ...catalogoConductividad, registros }, id, hoy));
            continue;
        }
        if (o.tipo === 'clima') {
            let resumen: ResumenDiarioClima[] | undefined;
            const hasta = o.consulta.hasta > hoy ? hoy : o.consulta.hasta;
            if (o.consulta.desde <= hasta) try { resumen = await args.fuenteClima?.leerResumen({ ...o.consulta, hasta }); } catch { /* No leído, nunca vacío. */ }
            resultados.push(ejecutarClima(o.consulta, resumen, id, hoy));
        } else if (o.tipo === 'monitoreo') {
            let observaciones: ObservacionMonitoreo[] | undefined;
            // Un estado pendiente de otro dominio no convierte este catálogo en vacío.
            if (args.estado?.pendiente) try { catalogoMonitoreo = await args.fuenteMonitoreo?.catalogo() ?? {}; } catch { /* Fuente independiente. */ }
            try { observaciones = await args.fuenteMonitoreo?.leerObservaciones(); } catch { /* No leído, no cero. */ }
            resultados.push(ejecutarMonitoreo(o.consulta, { ...catalogoMonitoreo, observaciones }, id, hoy));
        } else if (o.tipo === 'costos_aplicacion') {
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
    const operacionesEfectivas = original.cobertura ? operaciones.map((o, i) => o.tipo === 'labores' && !blocked.has(i) ? { ...o, consulta: consultasLabor.get(i) ?? o.consulta } : o) : operaciones;
    const planFinal = planDeOperaciones(operacionesEfectivas, original.parcialFueraDeAlcance, original.cobertura);
    if (original.cobertura) estado.plan = planFinal;
    let cobertura: CoberturaTurno;
    try { cobertura = construirCoberturaFinal(planFinal, resultados, hoy); }
    catch { return salida({ ...base, plan: planFinal, resultados: [], respuesta: mensajeDisposicion('error_datos'), origen: 'error_datos', errorPlan: 'correspondencia_no_valida' }); }
    const respuesta = renderMensaje(resultados, undefined, original.parcialFueraDeAlcance, cobertura);
    if (!validarCoberturaFinal(cobertura, planFinal, resultados, hoy) || !validarMensajeFinal(respuesta, resultados, undefined, original.parcialFueraDeAlcance, cobertura))
        return salida({ ...base, plan: executionPlan, resultados: [], respuesta: mensajeDisposicion('error_datos'), origen: 'error_datos', errorPlan: 'mensaje_no_valido' });
    return salida({ ...base, plan: planFinal, cobertura, resultados, respuesta, origen: estado.pendiente ? 'aclaracion' : 'determinista', estado, opcionesAclaracion: opciones });
}
export { SIN_LOTE_ETIQUETA };
