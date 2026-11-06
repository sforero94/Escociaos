import type { ConsultaPesajesLeche, ConsultaLitrosQuincenales } from './lecheTipos.ts';
import type { ConsultaHato } from './hatoTipos.ts';
import type { ConsultaConductividad } from './conductividadTipos.ts';
// Registro único de operaciones. De aquí salen el esquema que ve el modelo y el
// validador que corre antes de ejecutar: no hay una lista paralela que se desincronice.
import { esFechaCalendario } from './fechaCalendario.ts';
import { BASES_FECHA_APLICACIONES, ESTADOS_APLICACION, esUuid, type ConsultaAplicaciones } from './aplicacionesTipos.ts';
import type { ConsultaCostosAplicacion } from './costosTipos.ts';
import type { ConsultaLaborAplicacion } from './laborAplicacionTipos.ts';
import type { ConsultaFaltantesAplicacion } from './faltantesTipos.ts';
import type { ConsultaCantidadesAplicacion } from './cantidadesTipos.ts';
import { VARIABLES_CLIMA, VARIABLES_CLIMA_DEFAULT, type ConsultaClima } from './climaTipos.ts';
import type { ConsultaMonitoreo } from './monitoreoTipos.ts';
import type { Agrupacion, ConsultaLabores, Metrica, Plan, SinLote } from './tipos.ts';
import { operacionesDelPlan } from './tipos.ts';
import { ESQUEMA_COBERTURA, ESQUEMA_PARTE_IDS, normalizarTextoParte, validarInventarioDeclarado, validarCorrespondenciaPlan, type CoberturaPlan } from './cobertura.ts';
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
export const HERRAMIENTA_LABOR_APLICACION = 'consultar_labor_aplicacion';
export const HERRAMIENTA_CANTIDADES = 'consultar_cantidades_aplicacion';
export const HERRAMIENTA_COSTOS = 'consultar_costos_aplicacion';
export const HERRAMIENTA_FALTANTES = 'consultar_faltantes_aplicacion';
export const HERRAMIENTA_HATO = 'consultar_hato';
export const HERRAMIENTA_PESAJES_LECHE = 'consultar_pesajes_leche';
export const HERRAMIENTA_LITROS_QUINCENALES = 'consultar_litros_quincenales';
export const HERRAMIENTA_CONDUCTIVIDAD = 'consultar_conductividad';
export const HERRAMIENTA_MONITOREO = 'consultar_monitoreo';
export const HERRAMIENTA_CLIMA = 'consultar_clima';
export const HERRAMIENTA_ACLARAR = 'pedir_aclaracion';
export const HERRAMIENTA_FUERA = 'fuera_de_alcance';
/** Herramientas en formato OpenAI/OpenRouter. */
export function herramientasPlanificador(): unknown[] {
    const herramientas = [
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
            description: 'Costo de UNA aplicación (insumos, mano de obra y total), solo si el usuario pide dinero. Cerrada: costo congelado al cierre operativo verificado, aplicación completa. Abierta: subtotal de insumos ejecutados a precio de hoy; nunca costo histórico ni costo total. incluir_plan=true solo si pide valorizar también el plan completo guardado, siempre separado. Selector ID o nombre/código; desde/hasta juntos solo filtran ejecución. No costo por lote ni por árbol, ni sumar bases congeladas y actuales.',
            parameters: { type: 'object', additionalProperties: false, properties: {
                aplicacion_id: { type: 'string', format: 'uuid' }, aplicacion: { type: 'string' },
                desde: { type: 'string', description: 'Inicio inclusivo solo de ejecución; exige hasta.' }, hasta: { type: 'string', description: 'Fin inclusivo solo de ejecución; exige desde.' },
                incluir_plan: { type: 'boolean', description: 'Solo si el usuario pide valorización del plan; se presenta aparte.' },
            } },
        } },
        { type: 'function', function: {
            name: HERRAMIENTA_LABOR_APLICACION,
            description: 'Jornales y costo laboral registrados de tareas vinculadas por ID a aplicaciones explícitas. Úsala solo si piden jornales o trabajo registrado; el costo de mano de obra de una aplicación al cierre sale de consultar_costos_aplicacion. Un selector aplicacion_ids o aplicaciones obligatorio. desde/hasta opcionales y juntos filtran fecha_trabajo; sin ellos usa vida completa. Sin tarea no significa cero; tareas compartidas se cuentan una vez y son costo común, nunca exclusivo ni costo congelado.',
            parameters: { type: 'object', additionalProperties: false, properties: {
                aplicacion_ids: { type: 'array', minItems: 1, items: { type: 'string', format: 'uuid' } },
                aplicaciones: { type: 'array', minItems: 1, items: { type: 'string' } },
                desde: { type: 'string' }, hasta: { type: 'string' },
            } },
        } },
        { type: 'function', function: {
            name: HERRAMIENTA_FALTANTES,
            description: 'Faltantes vigentes de insumos para aplicaciones seleccionadas explícitamente. Un selector aplicacion_ids o aplicaciones obligatorio; nunca incluir cerradas implícitamente. Suma cantidades guardadas de todas las mezclas y resta inventario registrado hoy una vez por producto. No descuenta ejecución ni usa compras congeladas. No stock histórico ni reserva garantizada.',
            parameters: { type: 'object', additionalProperties: false, properties: {
                aplicacion_ids: { type: 'array', minItems: 1, items: { type: 'string', format: 'uuid' } },
                aplicaciones: { type: 'array', minItems: 1, items: { type: 'string' } },
            } },
        } },
        { type:'function', function:{
            name:HERRAMIENTA_PESAJES_LECHE,
            description:'Pesajes fechados de leche por animal visible y desde/hasta inclusivos. Selecciona animal_ids, nombres o chapetas, una clase de selector; sin selector pide precisar. Conserva AM/PM y NULL: son condiciones admitidas de la misma consulta. Suma muestras completas o históricas de solo total y promedia solo días pesados, sin turnos NULL convertidos a cero ni extrapolación. Pedir no proyectar respeta este contrato. No ventas, proyección ni litros por vaca del hato.',
            parameters:{type:'object',additionalProperties:false,required:['desde','hasta'],properties:{
                desde:{type:'string'},hasta:{type:'string'},animal_ids:{type:'array',uniqueItems:true,items:{type:'string',format:'uuid'}},nombres:{type:'array',uniqueItems:true,items:{type:'string'}},chapetas:{type:'array',uniqueItems:true,items:{type:'integer',minimum:1}},
            }},
        }},
        { type:'function', function:{
            name:HERRAMIENTA_LITROS_QUINCENALES,
            description:'Litros quincenales de leche medidos y derivados, separados por origen. desde/hasta deben abarcar quincenas calendario completas: inicio 1/16, fin 15/último del mes; pide aclaración si el rango es parcial. No prorratea, no suma muestras con ventas ni reconstruye vacas. Los medidos requieren cantidad del ingreso vinculado; los derivados usan la partición local. Abiertas separadas de cerradas. Sin dinero ni precios.',
            parameters:{type:'object',additionalProperties:false,required:['desde','hasta'],properties:{desde:{type:'string'},hasta:{type:'string'}}},
        }},
        { type: 'function', function: {
            name: HERRAMIENTA_HATO,
            description: 'Ficha y estado reproductivo ACTUAL del hato lechero al corte Bogotá del servidor. Selección explícita de animales por animal_ids, nombres exactos o chapetas enteras, una sola clase de selector. Sin selector pide precisar; homónimos o chapetas repetidas exigen aclaración, nunca elegir por actividad o similitud. Ficha/parentescos por ID separados de reproducción calculada con vista y configuración estrictas. No notas, historial libre, producción, dinero, estado histórico, recomendaciones ni captura.',
            parameters: { type: 'object', additionalProperties: false, properties: {
                animal_ids: { type: 'array', uniqueItems: true, items: { type: 'string', format: 'uuid' } },
                nombres: { type: 'array', uniqueItems: true, items: { type: 'string' } },
                chapetas: { type: 'array', uniqueItems: true, items: { type: 'integer', minimum: 1 } },
            } },
        } },
        { type: 'function', function: {
            name: HERRAMIENTA_CONDUCTIVIDAD,
            description: 'Conductividad eléctrica de suelo por fecha operativa desde/hasta inclusivas y lote, sección propia. Por registro entrega separados promedio CE guardado (dS/m), distribución nativa por árbol en bandas baja/en rango/alta con porcentajes y promedio de medias alta/baja disponibles, y pH. Esa distribución es parte permitida de esta consulta; no usa agrupaciones laborales. Sin fecha pide precisar. Nunca selecciona ni infiere ronda, promedia promedios de registros, acredita completitud por num_arboles, prescribe o captura. Lotes por IDs o nombres exactos; nombres repetidos exigen aclarar.',
            parameters: { type: 'object', additionalProperties: false, properties: {
                desde: { type: 'string' }, hasta: { type: 'string' },
                lote_ids: { type: 'array', uniqueItems: true, items: { type: 'string', format: 'uuid' } },
                lotes: { type: 'array', uniqueItems: true, items: { type: 'string' } },
            } },
        } },
        { type: 'function', function: {
            name: HERRAMIENTA_CLIMA,
            description: 'Historia climática observada del resumen diario, desde/hasta inclusivos. Variables cerradas y estación opcional por ID; ignora espacios exteriores solo si identifica una única estación raw. Una colisión necesita aclaración. Sin pronósticos, prescripciones ni lecturas en vivo. Devuelve cobertura por variable, cotas de lluvia separadas y procedencia; estaciones solapadas requieren aclaración.',
            parameters: { type: 'object', additionalProperties: false, required: ['desde','hasta'], properties: {
                desde: {type:'string'}, hasta: {type:'string'}, station_id: {type:'string',minLength:1},
                variables: {type:'array',minItems:1,uniqueItems:true,items:{type:'string',enum:[...VARIABLES_CLIMA]}},
            } },
        } },
        { type: 'function', function: {
            name: HERRAMIENTA_MONITOREO,
            description: 'Incidencia y gravedad por ronda real de monitoreo, siempre separadas por plaga. Selecciona rondas por ID, nombre exacto o desde/hasta inclusivos sobre su fecha de inicio (conserva la ronda completa, aunque abarque varias fechas). ultima_global elige la ronda global visible más reciente, nunca la última lectura por combinación. Sin selector pide precisar. Filtros lote/sublote/plaga por ID o nombre exacto. Agrupa por lote/sublote solo si se pide. Cada observación suma una vez sus afectados y muestreados; sin fila significa no revisado. No severidad, densidad, árboles únicos, recomendaciones ni CE.',
            parameters: { type: 'object', additionalProperties: false, properties: {
                ronda_ids: { type: 'array', uniqueItems: true, items: { type: 'string', format: 'uuid' } }, rondas: { type: 'array', uniqueItems: true, items: { type: 'string' } },
                lote_ids: { type: 'array', uniqueItems: true, items: { type: 'string', format: 'uuid' } }, lotes: { type: 'array', uniqueItems: true, items: { type: 'string' } },
                sublote_ids: { type: 'array', uniqueItems: true, items: { type: 'string', format: 'uuid' } }, sublotes: { type: 'array', uniqueItems: true, items: { type: 'string' } },
                plaga_ids: { type: 'array', uniqueItems: true, items: { type: 'string', format: 'uuid' } }, plagas: { type: 'array', uniqueItems: true, items: { type: 'string' } },
                desde: { type: 'string' }, hasta: { type: 'string' }, seleccion_ronda: { type: 'string', enum: ['todas', 'ultima_global'] },
                agrupar_por: { type: 'array', uniqueItems: true, maxItems: 2, items: { type: 'string', enum: ['lote', 'sublote'] } },
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
                description: 'Portadora única cuando todas las partes de cobertura están fuera del contrato. Si alguna requiere aclarar, usa pedir_aclaracion. En solicitudes mixtas ejecuta solo las consultas sustentadas y declara las partes excluidas en cobertura, sin llamar esta portadora junto a consultas. Conservar NULL/AM/PM o pedir no proyectar son condiciones de una consulta admitida, no capacidades excluidas. El motivo no se publica ni autoriza cálculos nuevos.',
                parameters: {
                    type: 'object',
                    additionalProperties: false,
                    required: ['motivo'],
                    properties: { motivo: { type: 'string' } },
                },
            },
        },
    ];
    return herramientas.map(h => ({ ...h, function: { ...h.function, parameters: { ...h.function.parameters, properties: { ...h.function.parameters.properties, cobertura: ESQUEMA_COBERTURA, parte_ids: ESQUEMA_PARTE_IDS } } } }));
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
function selectorAplicaciones(a: Record<string, unknown>, que: string): { aplicacion_ids: string[]; aplicaciones: string[] } {
    const ids = listaTextos(a.aplicacion_ids, 'aplicacion_ids'), nombres = listaTextos(a.aplicaciones, 'aplicaciones');
    if ((!ids.length && !nombres.length) || (ids.length && nombres.length) || ids.some(id => !esUuid(id)) || new Set(ids).size !== ids.length || new Set(nombres).size !== nombres.length) throw new ErrorPlan(`selector de aplicaciones inválido para ${que}`);
    return { aplicacion_ids: ids.map(id => id.toLowerCase()), aplicaciones: nombres };
}
function validarConsultaLaborAplicacion(a: Record<string, unknown>): ConsultaLaborAplicacion {
    if (Object.keys(a).some(k => !['aplicacion_ids', 'aplicaciones', 'desde', 'hasta'].includes(k))) throw new ErrorPlan('argumento laboral de aplicación no registrado');
    const selector = selectorAplicaciones(a, 'labor');
    const periodo = a.desde !== undefined || a.hasta !== undefined;
    if (periodo && (!esFechaCalendario(a.desde) || !esFechaCalendario(a.hasta) || a.desde > a.hasta)) throw new ErrorPlan('período laboral de aplicación inválido');
    return { ...selector, ...(periodo ? { desde: a.desde as string, hasta: a.hasta as string } : {}) };
}
function validarConsultaFaltantesAplicacion(a: Record<string, unknown>): ConsultaFaltantesAplicacion {
    if (Object.keys(a).some(k => !['aplicacion_ids', 'aplicaciones'].includes(k))) throw new ErrorPlan('argumento de faltantes no registrado');
    return selectorAplicaciones(a, 'faltantes');
}
function validarPeriodoLeche(a: Record<string, unknown>): ConsultaLitrosQuincenales {
    if (!esFechaCalendario(a.desde) || !esFechaCalendario(a.hasta) || a.desde>a.hasta) throw new ErrorPlan('período de leche inválido');
    return {desde:a.desde,hasta:a.hasta};
}
function validarConsultaPesajesLeche(a: Record<string, unknown>): ConsultaPesajesLeche {
    const {desde,hasta,...selector}=a;
    return {...validarPeriodoLeche({desde,hasta}),...validarConsultaHato(selector)};
}
function validarConsultaLitrosQuincenales(a: Record<string, unknown>): ConsultaLitrosQuincenales {
    if (Object.keys(a).some(k=>!['desde','hasta'].includes(k))) throw new ErrorPlan('argumento quincenal no registrado');
    return validarPeriodoLeche(a);
}
function validarConsultaHato(a: Record<string, unknown>): ConsultaHato {
    if (Object.keys(a).some(k => !['animal_ids', 'nombres', 'chapetas'].includes(k))) throw new ErrorPlan('argumento de hato no registrado');
    const filtros: Record<string, string[]> = {};
    for (const campo of ['animal_ids', 'nombres']) {
        if (a[campo] !== undefined && (!Array.isArray(a[campo]) || (a[campo] as unknown[]).some(v => typeof v !== 'string' || !v.trim()))) throw new ErrorPlan('selector de hato inválido');
        const valores = listaTextos(a[campo], campo).map(v => campo === 'animal_ids' ? v.toLowerCase() : v);
        if (new Set(valores).size !== valores.length || campo === 'animal_ids' && valores.some(v => !esUuid(v))) throw new ErrorPlan('selector de hato inválido');
        filtros[campo] = valores;
    }
    if (a.chapetas !== undefined && (!Array.isArray(a.chapetas) || a.chapetas.some(v => typeof v !== 'number' || !Number.isSafeInteger(v) || v < 1))) throw new ErrorPlan('chapeta inválida');
    const chapetas = (a.chapetas ?? []) as number[];
    if (new Set(chapetas).size !== chapetas.length || [filtros.animal_ids, filtros.nombres, chapetas].filter(v => v.length).length > 1) throw new ErrorPlan('selector de hato ambiguo');
    return { animal_ids: filtros.animal_ids, nombres: filtros.nombres, chapetas };
}
function validarConsultaConductividad(a: Record<string, unknown>): ConsultaConductividad {
    if (Object.keys(a).some(k => !['desde', 'hasta', 'lote_ids', 'lotes'].includes(k))) throw new ErrorPlan('argumento de conductividad no registrado');
    const filtros: Record<string, string[]> = {};
    for (const campo of ['lote_ids', 'lotes']) {
        if (a[campo] !== undefined && (!Array.isArray(a[campo]) || (a[campo] as unknown[]).some(v => typeof v !== 'string' || !v.trim()))) throw new ErrorPlan('selector de conductividad inválido');
        const valores = listaTextos(a[campo], campo).map(v => campo === 'lote_ids' ? v.toLowerCase() : v);
        if (new Set(valores).size !== valores.length || campo === 'lote_ids' && valores.some(v => !esUuid(v))) throw new ErrorPlan('selector de conductividad inválido');
        filtros[campo] = valores;
    }
    if (filtros.lote_ids.length && filtros.lotes.length) throw new ErrorPlan('selector de conductividad ambiguo');
    const periodo = a.desde !== undefined || a.hasta !== undefined;
    if (periodo && (!esFechaCalendario(a.desde) || !esFechaCalendario(a.hasta) || a.desde > a.hasta)) throw new ErrorPlan('período de conductividad inválido');
    return { lote_ids: filtros.lote_ids, lotes: filtros.lotes, ...(periodo ? { desde: a.desde as string, hasta: a.hasta as string } : {}) };
}
function validarConsultaClima(a: Record<string, unknown>): ConsultaClima {
    if (Object.keys(a).some(k => !['desde','hasta','station_id','variables'].includes(k))) throw new ErrorPlan('argumento de clima no registrado');
    if (!esFechaCalendario(a.desde) || !esFechaCalendario(a.hasta) || a.desde>a.hasta) throw new ErrorPlan('período climático inválido');
    if (a.station_id !== undefined && (typeof a.station_id !== 'string' || !a.station_id.trim())) throw new ErrorPlan('estación inválida');
    if (a.variables !== undefined && (!Array.isArray(a.variables) || !a.variables.length || new Set(a.variables).size!==a.variables.length || a.variables.some(v=>!VARIABLES_CLIMA.includes(v)))) throw new ErrorPlan('variable climática no registrada');
    return { desde:a.desde, hasta:a.hasta, variables:a.variables===undefined ? [...VARIABLES_CLIMA_DEFAULT] : a.variables as ConsultaClima['variables'], ...(a.station_id!==undefined ? {station_id:(a.station_id as string).trim()} : {}) };
}
function validarConsultaMonitoreo(a: Record<string, unknown>): ConsultaMonitoreo {
    if (Object.keys(a).some(k => !['ronda_ids', 'rondas', 'lote_ids', 'lotes', 'sublote_ids', 'sublotes', 'plaga_ids', 'plagas', 'agrupar_por', 'desde', 'hasta', 'seleccion_ronda'].includes(k))) throw new ErrorPlan('argumento de monitoreo no registrado');
    const filtros: Record<string, string[]> = {};
    for (const [ids, nombres] of [['ronda_ids', 'rondas'], ['lote_ids', 'lotes'], ['sublote_ids', 'sublotes'], ['plaga_ids', 'plagas']]) {
        for (const campo of [ids, nombres]) {
            if (a[campo] !== undefined && (!Array.isArray(a[campo]) || (a[campo] as unknown[]).some(v => typeof v !== 'string' || !v.trim()))) throw new ErrorPlan('selector de monitoreo inválido');
            const valores = listaTextos(a[campo], campo).map(v => campo === ids ? v.toLowerCase() : v);
            if (new Set(valores).size !== valores.length || campo === ids && valores.some(v => !esUuid(v))) throw new ErrorPlan('selector de monitoreo inválido');
            filtros[campo] = valores;
        }
        if (filtros[ids].length && filtros[nombres].length) throw new ErrorPlan('selector de monitoreo ambiguo');
    }
    if (a.agrupar_por !== undefined && (!Array.isArray(a.agrupar_por) || a.agrupar_por.some(g => typeof g !== 'string' || !g.trim()))) throw new ErrorPlan('agrupación de monitoreo inválida');
    const agrupaciones = listaTextos(a.agrupar_por, 'agrupar_por');
    if (agrupaciones.length > 2 || new Set(agrupaciones).size !== agrupaciones.length || agrupaciones.some(g => g !== 'lote' && g !== 'sublote') || a.agrupar_por === null) throw new ErrorPlan('agrupación de monitoreo inválida');
    const periodo = a.desde !== undefined || a.hasta !== undefined;
    if (periodo && (!esFechaCalendario(a.desde) || !esFechaCalendario(a.hasta) || a.desde > a.hasta)) throw new ErrorPlan('período de rondas inválido');
    if (a.seleccion_ronda !== undefined && (typeof a.seleccion_ronda !== 'string' || !['todas', 'ultima_global'].includes(a.seleccion_ronda) || filtros.ronda_ids.length || filtros.rondas.length)) throw new ErrorPlan('selección de ronda inválida');
    return { ronda_ids: filtros.ronda_ids, rondas: filtros.rondas, lote_ids: filtros.lote_ids, lotes: filtros.lotes, sublote_ids: filtros.sublote_ids, sublotes: filtros.sublotes, plaga_ids: filtros.plaga_ids, plagas: filtros.plagas, agrupar_por: agrupaciones as ConsultaMonitoreo['agrupar_por'], ...(periodo ? { desde: a.desde as string, hasta: a.hasta as string } : {}), ...(a.seleccion_ronda !== undefined ? { seleccion_ronda: a.seleccion_ronda as ConsultaMonitoreo['seleccion_ronda'] } : {}) };
}
/** Ordena claves para comparar inventarios repetidos sin transformar valores. */
const canonicoCobertura = (v: unknown): string => JSON.stringify(v, (_k, x) => x !== null && typeof x === 'object' && !Array.isArray(x) ? Object.fromEntries(Object.keys(x).sort().map(k => [k, (x as Record<string, unknown>)[k]])) : x);
const CAPACIDAD_DE_HERRAMIENTA: Record<string, string> = {
    [HERRAMIENTA_CONSULTAR]: 'labores', [HERRAMIENTA_APLICACIONES]: 'aplicaciones', [HERRAMIENTA_CANTIDADES]: 'cantidades_aplicacion',
    [HERRAMIENTA_COSTOS]: 'costos_aplicacion', [HERRAMIENTA_LABOR_APLICACION]: 'labor_aplicacion', [HERRAMIENTA_FALTANTES]: 'faltantes_aplicacion',
    [HERRAMIENTA_MONITOREO]: 'monitoreo', [HERRAMIENTA_CLIMA]: 'clima', [HERRAMIENTA_HATO]: 'hato', [HERRAMIENTA_PESAJES_LECHE]: 'pesajes_leche', [HERRAMIENTA_LITROS_QUINCENALES]: 'litros_quincenales', [HERRAMIENTA_CONDUCTIVIDAD]: 'conductividad',
};
type ParteBruta = { id?: unknown; capacidad?: unknown; disposicion?: unknown };
/** Une inventarios parciales que el modelo repartió entre llamadas (s1 en una, s2 en otra). */
function fusionarInventarios(inventarios: unknown[]): unknown {
    // La fusión solo puede eliminar repetición entre llamadas, nunca una forma inválida
    // dentro de un inventario ni propiedades que el esquema cerrado no reconoce.
    for (const inv of inventarios) {
        const partes = (inv as { partes?: unknown } | null)?.partes;
        if (!inv || typeof inv !== 'object' || Array.isArray(inv) || Object.keys(inv).some(k => !['version', 'partes'].includes(k)) || (inv as { version?: unknown }).version !== 1 || !Array.isArray(partes) || !partes.length || partes.length > 8) throw new Error('inventario_forma');
        const ids = new Set<string>();
        for (const parte of partes as ParteBruta[]) {
            if (!parte || typeof parte !== 'object' || Array.isArray(parte) || typeof parte.id !== 'string' || !/^s[1-8]$/.test(parte.id) || ids.has(parte.id)) throw new Error('parte_forma');
            ids.add(parte.id);
        }
    }
    if (new Set(inventarios.map(canonicoCobertura)).size === 1) return inventarios[0];
    const porId = new Map<string, unknown>();
    for (const inv of inventarios) {
        const partes = (inv as { version?: unknown; partes?: unknown } | null)?.partes;
        if (!inv || typeof inv !== 'object' || (inv as { version?: unknown }).version !== 1 || !Array.isArray(partes)) throw new Error('cobertura_contradictoria');
        for (const parte of partes as ParteBruta[]) {
            if (typeof parte?.id !== 'string') throw new Error('cobertura_contradictoria');
            const previa = porId.get(parte.id);
            if (previa !== undefined && canonicoCobertura(previa) !== canonicoCobertura(parte)) throw new Error('cobertura_contradictoria');
            porId.set(parte.id, parte);
        }
    }
    const ids = [...porId.keys()].sort((a, b) => Number(a.slice(1)) - Number(b.slice(1)));
    if (ids.some((id, i) => id !== `s${i + 1}`)) throw new Error('cobertura_contradictoria');
    return { version: 1, partes: ids.map(id => porId.get(id)) };
}
/**
 * Repara variantes de FORMA del contrato de cobertura sin cambiar lo que el modelo declaró.
 * Medido 2026-11-05 con el planificador real sobre 36 planes: 25 % se rechazaba solo por
 * forma, y los usuarios veían «No pude entender tu consulta». Reparaciones, todas cerradas:
 * (1) un inventario repetido o movido a otra llamada se conserva una vez en la primera;
 * (2) inventarios parciales con ids disjuntos y consecutivos (s1 en una llamada, s2 en otra)
 *     se unen; un mismo id con contenido distinto sigue siendo un rechazo;
 * (3) una portadora (fuera_de_alcance/pedir_aclaracion) junto a operaciones se descarta solo
 *     si el inventario ya registra una parte no ejecutable;
 * (4) una parte `consultar` sin vínculo se enlaza a la ÚNICA llamada de su misma capacidad.
 *     Con cero o con varias candidatas no se adivina: sigue siendo un rechazo.
 */
export function normalizarLlamadasCobertura(llamadas: LlamadaHerramienta[]): { llamadas: LlamadaHerramienta[]; reparaciones: string[] } {
    let argumentos: Record<string, unknown>[];
    try {
        argumentos = llamadas.map(l => JSON.parse(l.argumentos) as Record<string, unknown>);
    } catch { return { llamadas, reparaciones: [] }; }
    if (argumentos.some(a => !a || typeof a !== 'object' || Array.isArray(a))) return { llamadas, reparaciones: [] };
    const reparaciones: string[] = [];
    const inventarios = argumentos.filter(a => Object.prototype.hasOwnProperty.call(a, 'cobertura')).map(a => a.cobertura);
    const inventario = inventarios.length ? fusionarInventarios(inventarios) : undefined;
    if (inventarios.length > 1 && new Set(inventarios.map(canonicoCobertura)).size > 1) reparaciones.push('cobertura_fusionada');
    let pares = llamadas.map((l, i) => ({ nombre: l.nombre, args: { ...argumentos[i] } }));
    const portadora = (n: string) => n === HERRAMIENTA_FUERA || n === HERRAMIENTA_ACLARAR;
    const partes = (inventario as { partes?: ParteBruta[] } | undefined)?.partes;
    if (pares.some(p => portadora(p.nombre)) && pares.some(p => !portadora(p.nombre))) {
        if (!Array.isArray(partes) || !partes.some(p => p?.disposicion === 'fuera_de_contrato' || p?.disposicion === 'aclarar')) throw new Error('portadora_con_operaciones');
        for (const p of pares.filter(p => portadora(p.nombre))) {
            if (p.args.parte_ids !== undefined && (!Array.isArray(p.args.parte_ids) || p.args.parte_ids.length)) throw new Error('carrier');
            const { cobertura: _cobertura, parte_ids: _partes, ...dominio } = p.args;
            const permitidos = p.nombre === HERRAMIENTA_ACLARAR ? ['pregunta', 'motivo'] : ['motivo'];
            if (Object.keys(dominio).some(k => !permitidos.includes(k)) || typeof dominio.motivo !== 'string' || p.nombre === HERRAMIENTA_ACLARAR && (typeof dominio.pregunta !== 'string' || !dominio.pregunta.trim())) throw new Error('argumentos_no_validos');
        }
        pares = pares.filter(p => !portadora(p.nombre));
        reparaciones.push('portadora_descartada');
    }
    if (inventario !== undefined && (inventarios.length > 1 || !Object.prototype.hasOwnProperty.call(pares[0].args, 'cobertura'))) reparaciones.push('cobertura_unificada');
    if (Array.isArray(partes)) {
        for (const parte of partes) {
            if (parte?.disposicion !== 'consultar' || typeof parte.id !== 'string') continue;
            const vinculada = pares.some(p => Array.isArray(p.args.parte_ids) && (p.args.parte_ids as unknown[]).includes(parte.id));
            if (vinculada) continue;
            const candidatas = pares.filter(p => CAPACIDAD_DE_HERRAMIENTA[p.nombre] === parte.capacidad);
            if (candidatas.length !== 1) continue;
            // A malformed (non-list) parte_ids is not a forgotten link: keep the rejection.
            if (candidatas[0].args.parte_ids !== undefined && !Array.isArray(candidatas[0].args.parte_ids)) continue;
            const actuales = (candidatas[0].args.parte_ids ?? []) as unknown[];
            candidatas[0].args.parte_ids = [...actuales, parte.id];
            reparaciones.push('vinculo_unico_agregado');
        }
    }
    pares = pares.map((p, i) => {
        const { cobertura: _c, ...resto } = p.args;
        return { nombre: p.nombre, args: i === 0 && inventario !== undefined ? { cobertura: inventario, ...resto } : resto };
    });
    if (!reparaciones.length) return { llamadas, reparaciones };
    return { llamadas: pares.map(p => ({ nombre: p.nombre, argumentos: JSON.stringify(p.args) })), reparaciones };
}
/** Historial citable no sustituye el inventario del turno actual. No interpreta el lenguaje. */
function validarAnclaActual(cobertura: CoberturaPlan, preguntaActual: string): void {
    const actual = normalizarTextoParte(preguntaActual);
    if (!actual || !cobertura.partes.some(p => actual.includes(normalizarTextoParte(p.texto)))) throw new Error('turno_actual_sin_ancla');
}
// Gramática cerrada de intervalo: dos fechas aisladas también pueden describir hechos.
const FECHA_ISO_PATRON = '\\d{4}-\\d{2}-\\d{2}';
const INTERVALO_ISO_PATRON = new RegExp(`\\b(?:desde ${FECHA_ISO_PATRON} hasta ${FECHA_ISO_PATRON}|del ${FECHA_ISO_PATRON} al ${FECHA_ISO_PATRON}|(?:periodo|intervalo|rango)(?: (?:desde|del|de|al|entre))? ${FECHA_ISO_PATRON} (?:hasta|al|a|y) ${FECHA_ISO_PATRON})\\b`);
/** Solo contrasta un intervalo ISO explícito citado del actual y una única operación vinculada.
 * Varias operaciones pueden comparar días o períodos: no se infiere un intervalo común.
 * Las fechas nunca se corrigen ni se extraen de palabras, aritmética o mensajes antiguos.
 */
function validarPeriodoActual(cobertura: CoberturaPlan, operaciones: ReturnType<typeof operacionesDelPlan>, preguntaActual: string): void {
    const actual = normalizarTextoParte(preguntaActual);
    for (const parte of cobertura.partes) {
        const texto = normalizarTextoParte(parte.texto);
        if (parte.disposicion !== 'consultar' || !actual.includes(texto) || !INTERVALO_ISO_PATRON.test(texto)) continue;
        const fechas = parte.texto.match(/\b\d{4}-\d{2}-\d{2}\b/g) ?? [];
        if (fechas.length !== 2 || !fechas.every(esFechaCalendario) || fechas[0] > fechas[1]) continue;
        const vinculadas = operaciones.filter(o => o.parte_ids?.includes(parte.id));
        if (vinculadas.length !== 1) continue;
        const operacion = vinculadas[0];
        if (operacion.tipo === 'hato' || operacion.tipo === 'faltantes_aplicacion') continue; // No ofrecen un filtro de período.
        // La identidad de ronda conserva todas sus observaciones; sus fechas descriptivas
        // no se convierten aquí en un filtro por fecha_inicio de ronda.
        if (operacion.tipo === 'monitoreo' && (operacion.consulta.ronda_ids.length || operacion.consulta.rondas.length || operacion.consulta.seleccion_ronda !== undefined)) continue;
        const consulta = operacion.consulta;
        if (consulta.desde !== fechas[0] || consulta.hasta !== fechas[1]) throw new Error('periodo_actual_no_coincide');
    }
}
/** Convierte las llamadas del modelo en un plan validado, o lanza ErrorPlan.
 * preguntaActual solo se aporta al planear un nuevo turno; los estados D26 se validan
 * contra su pregunta guardada, sin reinterpretar la elección como una nueva consulta.
 */
export function validarPlan(llamadas: LlamadaHerramienta[], contexto?: { pregunta: string; preguntaActual?: string; exigirCobertura: true }): Plan {
    if (contexto?.exigirCobertura) {
        try {
            if (!llamadas.length) throw new Error('sin_llamadas');
            if (llamadas.length > MAX_CONSULTAS_POR_TURNO) throw new Error('limite');
            llamadas = normalizarLlamadasCobertura(llamadas).llamadas;
            if (llamadas.length > MAX_CONSULTAS_POR_TURNO) throw new Error('limite');
            const argumentos = llamadas.map(l => JSON.parse(l.argumentos) as Record<string, unknown>);
            if (argumentos.some(a => !a || typeof a !== 'object' || Array.isArray(a)) || argumentos.slice(1).some(a => Object.prototype.hasOwnProperty.call(a, 'cobertura'))) throw new Error('metadato');
            if (argumentos[0].cobertura === undefined) throw new Error('sin_cobertura');
            const cobertura = validarInventarioDeclarado(argumentos[0].cobertura, contexto.pregunta);
            if (contexto.preguntaActual !== undefined) validarAnclaActual(cobertura, contexto.preguntaActual);
            const limpias = llamadas.map((l, i) => {
                const { cobertura: _cobertura, parte_ids: _partes, ...consulta } = argumentos[i];
                return { nombre: l.nombre, argumentos: JSON.stringify(consulta) };
            });
            const base = (() => { try { return validarPlan(limpias); } catch (e) { throw new Error(e instanceof ErrorPlan ? 'argumentos_no_validos' : 'plan_error'); } })();
            const sinOperaciones = base.tipo === 'aclaracion' || base.tipo === 'fuera_de_alcance';
            if (sinOperaciones) {
                if (llamadas.length !== 1 || argumentos[0].parte_ids !== undefined && (!Array.isArray(argumentos[0].parte_ids) || argumentos[0].parte_ids.length)) throw new Error('carrier');
                validarCorrespondenciaPlan(cobertura, []);
                if ((base.tipo === 'aclaracion') !== cobertura.partes.some(p => p.disposicion === 'aclarar')) throw new Error('carrier');
                // Los motivos libres no se conservan como evidencia de las subpartes.
                return base.tipo === 'aclaracion' ? { tipo: 'aclaracion', aclaracion: { pregunta: '', motivo: '' }, cobertura } : { tipo: 'fuera_de_alcance', motivo: '', cobertura };
            }
            if (llamadas.some(l => l.nombre === HERRAMIENTA_FUERA || l.nombre === HERRAMIENTA_ACLARAR)) throw new Error('carrier_extra');
            const operaciones = operacionesDelPlan(base).map((o, i) => ({ ...o, parte_ids: argumentos[i].parte_ids as string[] }));
            validarCorrespondenciaPlan(cobertura, operaciones);
            if (contexto.preguntaActual !== undefined) validarPeriodoActual(cobertura, operaciones, contexto.preguntaActual);
            return { tipo: 'operaciones', operaciones, cobertura };
        } catch (e) { throw new ErrorPlan(`cobertura_no_valida:${e instanceof Error ? e.message : 'desconocido'}`); }
    }
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
        if (![HERRAMIENTA_CONSULTAR, HERRAMIENTA_APLICACIONES, HERRAMIENTA_CANTIDADES, HERRAMIENTA_COSTOS, HERRAMIENTA_LABOR_APLICACION, HERRAMIENTA_FALTANTES, HERRAMIENTA_MONITOREO, HERRAMIENTA_CONDUCTIVIDAD, HERRAMIENTA_CLIMA, HERRAMIENTA_HATO, HERRAMIENTA_PESAJES_LECHE, HERRAMIENTA_LITROS_QUINCENALES, HERRAMIENTA_ACLARAR, HERRAMIENTA_FUERA].includes(n))
            throw new ErrorPlan(`herramienta no registrada: ${n}`);
    }
    if (nombres.has(HERRAMIENTA_ACLARAR) && llamadas.length !== 1)
        throw new ErrorPlan('aclaración exige una operación exclusiva');
    if (nombres.has(HERRAMIENTA_ACLARAR)) {
        const a = parsear(llamadas.find((l) => l.nombre === HERRAMIENTA_ACLARAR)!);
        if (Object.keys(a).some(k => !['pregunta', 'motivo'].includes(k)))
            throw new ErrorPlan('argumento no registrado');
        if (typeof a.pregunta !== 'string' || !a.pregunta.trim())
            throw new ErrorPlan('aclaración sin pregunta');
        return { tipo: 'aclaracion', aclaracion: { pregunta: a.pregunta.trim(), motivo: String(a.motivo ?? '') } };
    }
    const fuera = llamadas.filter(l => l.nombre === HERRAMIENTA_FUERA);
    if (fuera.length > 1) throw new ErrorPlan('fuera de alcance repetido');
    if (fuera.length) {
        const a = parsear(fuera[0]);
        if (Object.keys(a).some(k => k !== 'motivo') || typeof a.motivo !== 'string')
            throw new ErrorPlan('argumento no registrado');
        if (llamadas.length === 1) return { tipo: 'fuera_de_alcance', motivo: a.motivo };
    }
    const ejecutables = llamadas.filter(l => l.nombre !== HERRAMIENTA_FUERA);
    const parcial = fuera.length ? { parcialFueraDeAlcance: true as const } : {};
    if ([HERRAMIENTA_APLICACIONES, HERRAMIENTA_CANTIDADES, HERRAMIENTA_COSTOS, HERRAMIENTA_LABOR_APLICACION, HERRAMIENTA_FALTANTES, HERRAMIENTA_MONITOREO, HERRAMIENTA_CONDUCTIVIDAD, HERRAMIENTA_CLIMA, HERRAMIENTA_HATO, HERRAMIENTA_PESAJES_LECHE, HERRAMIENTA_LITROS_QUINCENALES].some(h => nombres.has(h))) return { tipo: 'operaciones', ...parcial, operaciones: ejecutables.map(l => l.nombre === HERRAMIENTA_PESAJES_LECHE ? {tipo:'pesajes_leche',consulta:validarConsultaPesajesLeche(parsear(l))} : l.nombre === HERRAMIENTA_LITROS_QUINCENALES ? {tipo:'litros_quincenales',consulta:validarConsultaLitrosQuincenales(parsear(l))} : l.nombre === HERRAMIENTA_HATO ? { tipo: 'hato', consulta: validarConsultaHato(parsear(l)) } : l.nombre === HERRAMIENTA_CLIMA ? { tipo: 'clima', consulta: validarConsultaClima(parsear(l)) } : l.nombre === HERRAMIENTA_CONDUCTIVIDAD ? { tipo: 'conductividad', consulta: validarConsultaConductividad(parsear(l)) } : l.nombre === HERRAMIENTA_MONITOREO ? { tipo: 'monitoreo', consulta: validarConsultaMonitoreo(parsear(l)) } : l.nombre === HERRAMIENTA_FALTANTES ? { tipo: 'faltantes_aplicacion', consulta: validarConsultaFaltantesAplicacion(parsear(l)) } : l.nombre === HERRAMIENTA_LABOR_APLICACION ? { tipo: 'labor_aplicacion', consulta: validarConsultaLaborAplicacion(parsear(l)) } : l.nombre === HERRAMIENTA_COSTOS ? { tipo: 'costos_aplicacion', consulta: validarConsultaCostos(parsear(l)) } : l.nombre === HERRAMIENTA_APLICACIONES ? { tipo: 'aplicaciones', consulta: validarConsultaAplicaciones(parsear(l)) } : l.nombre === HERRAMIENTA_CANTIDADES ? { tipo: 'cantidades_aplicacion', consulta: validarConsultaCantidades(parsear(l)) } : { tipo: 'labores', consulta: validarConsulta(parsear(l)) }) };
    return { tipo: 'consultas', ...parcial, consultas: ejecutables.map((l) => validarConsulta(parsear(l))) };
}
