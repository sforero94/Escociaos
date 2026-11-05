// Registro único de operaciones. De aquí salen el esquema que ve el modelo y el
// validador que corre antes de ejecutar: no hay una lista paralela que se desincronice.
import { esFechaCalendario } from './fechaCalendario.ts';
import { BASES_FECHA_APLICACIONES, ESTADOS_APLICACION, esUuid, type ConsultaAplicaciones } from './aplicacionesTipos.ts';
import type { ConsultaCostosAplicacion } from './costosTipos.ts';
import type { ConsultaCantidadesAplicacion } from './cantidadesTipos.ts';
import type { Agrupacion, ConsultaLabores, Metrica, Plan, SinLote } from './tipos.ts';
export const AGRUPACIONES: readonly Agrupacion[] = ['lote', 'tarea', 'categoria', 'tipo_tarea', 'dia', 'mes', 'semana'];
export const METRICAS: readonly Metrica[] = [
    'jornales',
    'costo',
    'dias_con_registro',
    'primer_registro',
    'ultimo_registro',
    'jornales_por_arbol',
    'jornales_por_hectarea',
    'costo_por_jornal',
];
export const SIN_LOTE: readonly SinLote[] = ['incluir', 'excluir', 'solo'];
export const MAX_CONSULTAS_POR_TURNO = 4;
export const MAX_AGRUPACIONES = 2;
export const HERRAMIENTA_CONSULTAR = 'consultar_labores';
export const HERRAMIENTA_APLICACIONES = 'consultar_aplicaciones';
export const HERRAMIENTA_CANTIDADES = 'consultar_cantidades_aplicacion';
export const HERRAMIENTA_COSTOS = 'consultar_costos_aplicacion';
export const HERRAMIENTA_ACLARAR = 'pedir_aclaracion';
export const HERRAMIENTA_FUERA = 'fuera_de_alcance';
/** Herramientas en formato OpenAI/OpenRouter. */
export function herramientasPlanificador(): unknown[] {
    return [
        {
            type: 'function',
            function: {
                name: HERRAMIENTA_CONSULTAR,
                description: 'Suma jornales y costo de mano de obra registrados (registros_trabajo) en un período, con filtros opcionales por lote, tarea o categoría de tarea, y agrupación opcional. También entrega razones calculadas por el sistema (jornales por árbol o por hectárea, costo por jornal) y, por tarea, estado, fechas planeadas y reales, jornales estimados y aplicación de origen. Llámala una vez por cada parte de la pregunta (máximo 4).',
                parameters: {
                    type: 'object',
                    additionalProperties: false,
                    required: ['proposito', 'desde', 'hasta', 'agrupar_por', 'metricas'],
                    properties: {
                        cohorte: { type: 'string', enum: ['trabajo_registrado', 'tarea_programada'] },
                        base_fecha: { type: 'string', enum: ['fecha_trabajo', 'fecha_estimada_inicio'] },
                        tarea_ids: { type: 'array', items: { type: 'string' } }, lote_ids: { type: 'array', items: { type: 'string' } },
                        ranking: { type: 'object', additionalProperties: false, required: ['metrica', 'direccion', 'n', 'empates'], properties: { metrica: { type: 'string', enum: [...METRICAS] }, direccion: { type: 'string', enum: ['asc', 'desc'] }, n: { type: 'integer', minimum: 1, maximum: 50 }, empates: { type: 'string', enum: ['incluir', 'exactamente_n_por_id'] } } },
                        proposito: { type: 'string', description: 'Qué parte de la pregunta responde esta consulta, en pocas palabras.' },
                        desde: { type: 'string', description: 'Fecha inicial inclusiva AAAA-MM-DD.' },
                        hasta: { type: 'string', description: 'Fecha final inclusiva AAAA-MM-DD.' },
                        lotes: { type: 'array', items: { type: 'string' }, description: 'Lotes tal como los nombró el usuario. Omitir = todos.' },
                        tareas: {
                            type: 'array',
                            items: { type: 'string' },
                            description: 'Fragmentos del nombre de tarea (ej. "cosecha", "microbiología"). Abarca todas las tareas que lo contengan. Omitir = todas.',
                        },
                        categorias: { type: 'array', items: { type: 'string' }, description: 'Categorías de tipo de tarea del catálogo. Omitir = todas.' },
                        sin_lote: {
                            type: 'string',
                            enum: [...SIN_LOTE],
                            description: 'Registros sin lote asignado: incluir (por defecto, se muestran aparte), excluir o solo.',
                        },
                        agrupar_por: {
                            type: 'array',
                            items: { type: 'string', enum: [...AGRUPACIONES] },
                            maxItems: MAX_AGRUPACIONES,
                            description: 'tipo_tarea = el tipo de la tarea (ej. Guadaña); categoria = la categoría de ese tipo; dia = cada fecha de trabajo.',
                        },
                        metricas: {
                            type: 'array',
                            items: { type: 'string', enum: [...METRICAS] },
                            minItems: 0,
                            description: 'jornales_por_arbol y jornales_por_hectarea se calculan por lote: agrupa por lote o nombra lotes. costo_por_jornal necesita costo. Nunca calcules razones tú.',
                        },
                        incluir_estado_tarea: {
                            type: 'boolean',
                            description: 'Al agrupar por tarea, incluye de cada tarea: estado registrado, jornales estimados, fechas planeadas y reales (inicio/fin), aplicación de origen si la hay, y las tareas filtradas sin registros. Úsalo para preguntas de estado, cuándo empezó o terminó una tarea, qué estaba planeado o de qué aplicación viene.',
                        },
                        limite: { type: 'integer', minimum: 1, maximum: 50, description: 'Mostrar solo los N grupos con más jornales.' },
                    },
                },
            },
        },
        { type: 'function', function: {
            name: HERRAMIENTA_APLICACIONES,
            description: 'Lista aplicaciones visibles en un período por inicio planeado, fecha de movimientos o cierre operativo registrado. Muestra su estado actual. Sin cantidades, costos, jornales ni faltantes de insumos. La fecha de cierre operativo no prueba cuándo se hizo el trámite administrativo. Si no está claro qué fecha pide el usuario, usa sin_precisar; si pide el trámite administrativo, cierre_administrativo. Máximo cuatro operaciones sumando aplicaciones y labores.',
            parameters: { type: 'object', additionalProperties: false, required: ['desde', 'hasta', 'base_fecha'], properties: {
                desde: { type: 'string', description: 'Fecha calendario inicial inclusiva AAAA-MM-DD.' }, hasta: { type: 'string', description: 'Fecha calendario final inclusiva AAAA-MM-DD.' },
                base_fecha: { type: 'string', enum: [...BASES_FECHA_APLICACIONES] },
                aplicacion_ids: { type: 'array', items: { type: 'string', format: 'uuid' } },
                aplicaciones: { type: 'array', items: { type: 'string' }, description: 'Nombres o códigos dichos por el usuario; el sistema resuelve contra aplicaciones visibles.' },
                estados: { type: 'array', items: { type: 'string', enum: [...ESTADOS_APLICACION] }, description: 'Estado actual: Calculada se muestra Planificada. Nunca estado histórico.' },
            } },
        } },
        { type: 'function', function: {
            name: HERRAMIENTA_CANTIDADES,
            description: 'Productos y cantidades del plan completo guardado frente a ejecución por lote de UNA aplicación. Exactamente un selector ID o nombre/código; sin selector pide aclarar. desde/hasta filtran solo ejecución por fecha de movimiento; sin ambos usa vida completa. No costos, jornales, stock ni faltantes. Nunca recorta el plan ni suma plan y ejecución.',
            parameters: { type: 'object', additionalProperties: false, properties: {
                aplicacion_id: { type: 'string', format: 'uuid' }, aplicacion: { type: 'string' },
                desde: { type: 'string', description: 'Fecha calendario inicial inclusiva solo para ejecución; exige hasta.' }, hasta: { type: 'string', description: 'Fecha calendario final inclusiva solo para ejecución; exige desde.' },
            } },
        } },
        { type: 'function', function: {
            name: HERRAMIENTA_COSTOS,
            description: 'Costo de UNA aplicación, solo si el usuario pide dinero. Cerrada: costo congelado al cierre operativo verificado, aplicación completa. Abierta: subtotal de insumos ejecutados a precio de hoy; nunca costo histórico ni costo total. incluir_plan=true solo si pide valorizar también el plan completo guardado, siempre separado. Selector ID o nombre/código; desde/hasta juntos solo filtran ejecución. No costo por lote ni por árbol, ni sumar bases congeladas y actuales.',
            parameters: { type: 'object', additionalProperties: false, properties: {
                aplicacion_id: { type: 'string', format: 'uuid' }, aplicacion: { type: 'string' },
                desde: { type: 'string', description: 'Inicio inclusivo solo de ejecución; exige hasta.' }, hasta: { type: 'string', description: 'Fin inclusivo solo de ejecución; exige desde.' },
                incluir_plan: { type: 'boolean', description: 'Solo si el usuario pide valorización del plan; se presenta aparte.' },
            } },
        } },
        {
            type: 'function',
            function: {
                name: HERRAMIENTA_ACLARAR,
                description: 'Pregunta al usuario cuando la solicitud no se puede convertir en consultas sin adivinar.',
                parameters: {
                    type: 'object',
                    additionalProperties: false,
                    required: ['pregunta', 'motivo'],
                    properties: { pregunta: { type: 'string' }, motivo: { type: 'string' } },
                },
            },
        },
        {
            type: 'function',
            function: {
                name: HERRAMIENTA_FUERA,
                description: 'La pregunta no corresponde a labores, inventario por fecha/estado, cantidades por producto/lote ni costo de aplicación. Cruces laborales y faltantes aún no están disponibles.',
                parameters: {
                    type: 'object',
                    additionalProperties: false,
                    required: ['motivo'],
                    properties: { motivo: { type: 'string' } },
                },
            },
        },
    ];
}
export interface LlamadaHerramienta {
    nombre: string;
    argumentos: string; // JSON crudo del modelo
}
export class ErrorPlan extends Error {
}
const esFechaValida = esFechaCalendario;
function listaTextos(v: unknown, campo: string): string[] {
    if (v === undefined || v === null)
        return [];
    if (!Array.isArray(v) || v.some((x) => typeof x !== 'string'))
        throw new ErrorPlan(`${campo} debe ser una lista de textos`);
    return (v as string[]).map((x) => x.trim()).filter((x) => x.length > 0);
}
function validarConsulta(a: Record<string, unknown>): ConsultaLabores {
    const permitidos = new Set(['proposito', 'desde', 'hasta', 'lotes', 'tareas', 'categorias', 'sin_lote', 'agrupar_por', 'metricas', 'incluir_estado_tarea', 'limite', 'cohorte', 'base_fecha', 'tarea_ids', 'lote_ids', 'ranking']);
    for (const k of Object.keys(a))
        if (!permitidos.has(k))
            throw new ErrorPlan(`argumento no registrado: ${k}`);
    if (!esFechaValida(a.desde) || !esFechaValida(a.hasta))
        throw new ErrorPlan('desde/hasta deben ser fechas AAAA-MM-DD válidas');
    if (a.desde > a.hasta)
        throw new ErrorPlan('desde es posterior a hasta');
    const agrupar = listaTextos(a.agrupar_por, 'agrupar_por');
    if (agrupar.some((g) => !AGRUPACIONES.includes(g as Agrupacion)))
        throw new ErrorPlan('agrupación no registrada');
    if (new Set(agrupar).size !== agrupar.length || agrupar.length > MAX_AGRUPACIONES)
        throw new ErrorPlan('agrupar_por repetido o demasiado largo');
    const metricas = listaTextos(a.metricas, 'metricas');
    if ((metricas.length === 0 && a.cohorte !== 'tarea_programada') || metricas.some((m) => !METRICAS.includes(m as Metrica)))
        throw new ErrorPlan('métricas vacías o no registradas');
    const sinLote = a.sin_lote ?? 'incluir';
    if (!SIN_LOTE.includes(sinLote as SinLote))
        throw new ErrorPlan('sin_lote no registrado');
    let limite: number | null = null;
    if (a.limite !== undefined && a.limite !== null) {
        if (typeof a.limite !== 'number' || !Number.isInteger(a.limite) || a.limite < 1 || a.limite > 50)
            throw new ErrorPlan('limite inválido');
        limite = a.limite;
    }
    if (a.incluir_estado_tarea !== undefined && typeof a.incluir_estado_tarea !== 'boolean')
        throw new ErrorPlan('incluir_estado_tarea debe ser booleano');
    // Los datos de tarea (estado, fechas, estimados, aplicación) cuelgan de filas por tarea. Si el
    // planificador pidió el estado y olvidó agrupar por tarea, se agrega aquí, en código; si ya no
    // hay espacio para otra agrupación, el plan no es ejecutable y se rechaza en vez de ignorar la bandera.
    const agrupacionesFinal = [...new Set(agrupar)] as Agrupacion[];
    if (a.incluir_estado_tarea === true && !agrupacionesFinal.includes('tarea')) {
        if (agrupacionesFinal.length >= MAX_AGRUPACIONES)
            throw new ErrorPlan('incluir_estado_tarea exige agrupar por tarea');
        agrupacionesFinal.push('tarea');
    }
    const cohorte = a.cohorte ?? 'trabajo_registrado';
    if (!['trabajo_registrado', 'tarea_programada'].includes(String(cohorte)))
        throw new ErrorPlan('cohorte inválida');
    const baseFecha = cohorte === 'tarea_programada' ? 'fecha_estimada_inicio' : 'fecha_trabajo';
    if (a.base_fecha !== undefined && a.base_fecha !== baseFecha)
        throw new ErrorPlan('base de fecha incompatible');
    if (sinLote === 'solo' && (listaTextos(a.lotes, 'lotes').length || listaTextos(a.lote_ids, 'lote_ids').length))
        throw new ErrorPlan('solo sin lote incompatible con lote seleccionado');
    let ranking: ConsultaLabores['ranking'];
    if (a.ranking !== undefined) {
        const r = a.ranking as Record<string, unknown>;
        if (!r || typeof r !== 'object' || Array.isArray(r) || Object.keys(r).some(k => !['metrica', 'direccion', 'n', 'empates'].includes(k)) || !['jornales', 'costo', 'dias_con_registro', 'jornales_por_arbol', 'jornales_por_hectarea', 'costo_por_jornal'].includes(String(r.metrica)) || !metricas.includes(String(r.metrica)) || !['asc', 'desc'].includes(String(r.direccion)) || !['incluir', 'exactamente_n_por_id'].includes(String(r.empates)) || typeof r.n !== 'number' || !Number.isInteger(r.n) || r.n < 1 || r.n > 50 || !agrupar.length || limite !== null)
            throw new ErrorPlan('ranking inválido');
        ranking = r as unknown as ConsultaLabores['ranking'];
    }
    if (cohorte === 'tarea_programada' && (metricas.length || agrupacionesFinal.some(g => g !== 'tarea') || ranking || limite !== null))
        throw new ErrorPlan('programadas admite miembros y metadatos por tarea, sin métricas de trabajo');
    return {
        cohorte: cohorte as ConsultaLabores['cohorte'], base_fecha: baseFecha,
        tarea_ids: listaTextos(a.tarea_ids, 'tarea_ids'), lote_ids: listaTextos(a.lote_ids, 'lote_ids'),
        ...(ranking ? { ranking } : {}),
        proposito: typeof a.proposito === 'string' && a.proposito.trim() ? a.proposito.trim() : 'consulta',
        desde: a.desde,
        hasta: a.hasta,
        lotes: listaTextos(a.lotes, 'lotes'),
        tareas: listaTextos(a.tareas, 'tareas'),
        categorias: listaTextos(a.categorias, 'categorias'),
        sin_lote: sinLote as SinLote,
        agrupar_por: agrupacionesFinal,
        metricas: [...new Set(metricas)] as Metrica[],
        incluir_estado_tarea: a.incluir_estado_tarea === true,
        limite,
    };
}
function validarConsultaAplicaciones(a: Record<string, unknown>): ConsultaAplicaciones {
    if (Object.keys(a).some(k => !['desde', 'hasta', 'base_fecha', 'aplicacion_ids', 'aplicaciones', 'estados'].includes(k))) throw new ErrorPlan('argumento no registrado');
    if (!esFechaCalendario(a.desde) || !esFechaCalendario(a.hasta) || a.desde > a.hasta) throw new ErrorPlan('período de aplicaciones inválido');
    if (!BASES_FECHA_APLICACIONES.includes(a.base_fecha as ConsultaAplicaciones['base_fecha'])) throw new ErrorPlan('base de aplicaciones no registrada');
    const ids = listaTextos(a.aplicacion_ids, 'aplicacion_ids');
    const estados = listaTextos(a.estados, 'estados');
    if (ids.some(id => !esUuid(id)) || estados.some(e => !ESTADOS_APLICACION.includes(e as typeof ESTADOS_APLICACION[number]))) throw new ErrorPlan('filtro de aplicaciones inválido');
    return { desde: a.desde, hasta: a.hasta, base_fecha: a.base_fecha as ConsultaAplicaciones['base_fecha'], aplicacion_ids: [...new Set(ids)], aplicaciones: listaTextos(a.aplicaciones, 'aplicaciones'), estados: [...new Set(estados)] as ConsultaAplicaciones['estados'] };
}
function validarConsultaCantidades(a: Record<string, unknown>): ConsultaCantidadesAplicacion {
    if (Object.keys(a).some(k => !['aplicacion_id', 'aplicacion', 'desde', 'hasta'].includes(k))) throw new ErrorPlan('argumento de cantidades no registrado');
    if ((a.aplicacion_id === undefined) === (a.aplicacion === undefined)) throw new ErrorPlan('cantidades exige un selector de aplicación');
    if (a.aplicacion_id !== undefined && !esUuid(a.aplicacion_id) || a.aplicacion !== undefined && (typeof a.aplicacion !== 'string' || !a.aplicacion.trim())) throw new ErrorPlan('selector de cantidades inválido');
    const periodo = a.desde !== undefined || a.hasta !== undefined;
    if (periodo && (!esFechaCalendario(a.desde) || !esFechaCalendario(a.hasta) || a.desde > a.hasta)) throw new ErrorPlan('período de ejecución inválido');
    return { ...(a.aplicacion_id !== undefined ? { aplicacion_id: (a.aplicacion_id as string).toLowerCase() } : { aplicacion: (a.aplicacion as string).trim() }), ...(periodo ? { desde: a.desde as string, hasta: a.hasta as string } : {}) };
}
function validarConsultaCostos(a: Record<string, unknown>): ConsultaCostosAplicacion {
    if (Object.keys(a).some(k => !['aplicacion_id', 'aplicacion', 'desde', 'hasta', 'incluir_plan'].includes(k))) throw new ErrorPlan('argumento de costos no registrado');
    if (a.incluir_plan !== undefined && typeof a.incluir_plan !== 'boolean') throw new ErrorPlan('incluir_plan debe ser booleano');
    const { incluir_plan, ...selector } = a;
    return { ...validarConsultaCantidades(selector), ...(incluir_plan !== undefined ? { incluir_plan: incluir_plan as boolean } : {}) };
}
/** Convierte las llamadas del modelo en un plan validado, o lanza ErrorPlan. */
export function validarPlan(llamadas: LlamadaHerramienta[]): Plan {
    if (llamadas.length === 0)
        throw new ErrorPlan('el planificador no llamó ninguna herramienta');
    const parsear = (l: LlamadaHerramienta): Record<string, unknown> => {
        try {
            const v = JSON.parse(l.argumentos || '{}');
            if (typeof v !== 'object' || v === null || Array.isArray(v))
                throw new Error('no es objeto');
            return v as Record<string, unknown>;
        }
        catch {
            throw new ErrorPlan(`argumentos no son JSON válido en ${l.nombre}`);
        }
    };
    if (llamadas.length > MAX_CONSULTAS_POR_TURNO)
        throw new ErrorPlan(`más de ${MAX_CONSULTAS_POR_TURNO} operaciones en un turno`);
    const nombres = new Set(llamadas.map((l) => l.nombre));
    for (const n of nombres) {
        if (![HERRAMIENTA_CONSULTAR, HERRAMIENTA_APLICACIONES, HERRAMIENTA_CANTIDADES, HERRAMIENTA_COSTOS, HERRAMIENTA_ACLARAR, HERRAMIENTA_FUERA].includes(n))
            throw new ErrorPlan(`herramienta no registrada: ${n}`);
    }
    if ((nombres.has(HERRAMIENTA_ACLARAR) || nombres.has(HERRAMIENTA_FUERA)) && llamadas.length !== 1)
        throw new ErrorPlan('aclaración o fuera de alcance exige una operación exclusiva');
    if (nombres.has(HERRAMIENTA_ACLARAR)) {
        const a = parsear(llamadas.find((l) => l.nombre === HERRAMIENTA_ACLARAR)!);
        if (Object.keys(a).some(k => !['pregunta', 'motivo'].includes(k)))
            throw new ErrorPlan('argumento no registrado');
        if (typeof a.pregunta !== 'string' || !a.pregunta.trim())
            throw new ErrorPlan('aclaración sin pregunta');
        return { tipo: 'aclaracion', aclaracion: { pregunta: a.pregunta.trim(), motivo: String(a.motivo ?? '') } };
    }
    if (nombres.has(HERRAMIENTA_FUERA)) {
        const a = parsear(llamadas.find((l) => l.nombre === HERRAMIENTA_FUERA)!);
        if (Object.keys(a).some(k => k !== 'motivo'))
            throw new ErrorPlan('argumento no registrado');
        return { tipo: 'fuera_de_alcance', motivo: String(a.motivo ?? '') };
    }
    if (llamadas.length > MAX_CONSULTAS_POR_TURNO)
        throw new ErrorPlan(`más de ${MAX_CONSULTAS_POR_TURNO} consultas en un turno`);
    if (nombres.has(HERRAMIENTA_APLICACIONES) || nombres.has(HERRAMIENTA_CANTIDADES) || nombres.has(HERRAMIENTA_COSTOS)) return { tipo: 'operaciones', operaciones: llamadas.map(l => l.nombre === HERRAMIENTA_COSTOS ? { tipo: 'costos_aplicacion', consulta: validarConsultaCostos(parsear(l)) } : l.nombre === HERRAMIENTA_APLICACIONES ? { tipo: 'aplicaciones', consulta: validarConsultaAplicaciones(parsear(l)) } : l.nombre === HERRAMIENTA_CANTIDADES ? { tipo: 'cantidades_aplicacion', consulta: validarConsultaCantidades(parsear(l)) } : { tipo: 'labores', consulta: validarConsulta(parsear(l)) }) };
    return { tipo: 'consultas', consultas: llamadas.map((l) => validarConsulta(parsear(l))) };
}
