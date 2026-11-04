// Registro único de operaciones. De aquí salen el esquema que ve el modelo y el
// validador que corre antes de ejecutar: no hay una lista paralela que se desincronice.

import type { Agrupacion, ConsultaLabores, Metrica, Plan, SinLote } from './tipos.ts';

export const AGRUPACIONES: readonly Agrupacion[] = ['lote', 'tarea', 'categoria', 'mes', 'semana'];
export const METRICAS: readonly Metrica[] = ['jornales', 'costo', 'dias_con_registro', 'primer_registro', 'ultimo_registro'];
export const SIN_LOTE: readonly SinLote[] = ['incluir', 'excluir', 'solo'];
export const MAX_CONSULTAS_POR_TURNO = 4;
export const MAX_AGRUPACIONES = 2;

export const HERRAMIENTA_CONSULTAR = 'consultar_labores';
export const HERRAMIENTA_ACLARAR = 'pedir_aclaracion';
export const HERRAMIENTA_FUERA = 'fuera_de_alcance';

/** Herramientas en formato OpenAI/OpenRouter. */
export function herramientasPlanificador(): unknown[] {
  return [
    {
      type: 'function',
      function: {
        name: HERRAMIENTA_CONSULTAR,
        description:
          'Suma jornales y costo de mano de obra registrados (registros_trabajo) en un período, con filtros opcionales por lote, tarea o categoría de tarea, y agrupación opcional. Llámala una vez por cada parte de la pregunta (máximo 4).',
        parameters: {
          type: 'object',
          additionalProperties: false,
          required: ['proposito', 'desde', 'hasta', 'agrupar_por', 'metricas'],
          properties: {
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
            agrupar_por: { type: 'array', items: { type: 'string', enum: [...AGRUPACIONES] }, maxItems: MAX_AGRUPACIONES },
            metricas: { type: 'array', items: { type: 'string', enum: [...METRICAS] }, minItems: 1 },
            incluir_estado_tarea: {
              type: 'boolean',
              description: 'Al agrupar por tarea, incluye el estado registrado de la tarea y sus jornales estimados, y las tareas filtradas sin registros.',
            },
            limite: { type: 'integer', minimum: 1, maximum: 50, description: 'Mostrar solo los N grupos con más jornales.' },
          },
        },
      },
    },
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
        description: 'La pregunta no es sobre labores (jornales o costo de mano de obra registrados).',
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

export class ErrorPlan extends Error {}

const ISO = /^\d{4}-\d{2}-\d{2}$/;

function esFechaValida(s: unknown): s is string {
  if (typeof s !== 'string' || !ISO.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

function listaTextos(v: unknown, campo: string): string[] {
  if (v === undefined || v === null) return [];
  if (!Array.isArray(v) || v.some((x) => typeof x !== 'string')) throw new ErrorPlan(`${campo} debe ser una lista de textos`);
  return (v as string[]).map((x) => x.trim()).filter((x) => x.length > 0);
}

function validarConsulta(a: Record<string, unknown>): ConsultaLabores {
  const permitidos = new Set(['proposito', 'desde', 'hasta', 'lotes', 'tareas', 'categorias', 'sin_lote', 'agrupar_por', 'metricas', 'incluir_estado_tarea', 'limite']);
  for (const k of Object.keys(a)) if (!permitidos.has(k)) throw new ErrorPlan(`argumento no registrado: ${k}`);
  if (!esFechaValida(a.desde) || !esFechaValida(a.hasta)) throw new ErrorPlan('desde/hasta deben ser fechas AAAA-MM-DD válidas');
  if (a.desde > a.hasta) throw new ErrorPlan('desde es posterior a hasta');
  const agrupar = listaTextos(a.agrupar_por, 'agrupar_por');
  if (agrupar.some((g) => !AGRUPACIONES.includes(g as Agrupacion))) throw new ErrorPlan('agrupación no registrada');
  if (new Set(agrupar).size !== agrupar.length || agrupar.length > MAX_AGRUPACIONES) throw new ErrorPlan('agrupar_por repetido o demasiado largo');
  const metricas = listaTextos(a.metricas, 'metricas');
  if (metricas.length === 0 || metricas.some((m) => !METRICAS.includes(m as Metrica))) throw new ErrorPlan('métricas vacías o no registradas');
  const sinLote = a.sin_lote ?? 'incluir';
  if (!SIN_LOTE.includes(sinLote as SinLote)) throw new ErrorPlan('sin_lote no registrado');
  let limite: number | null = null;
  if (a.limite !== undefined && a.limite !== null) {
    if (typeof a.limite !== 'number' || !Number.isInteger(a.limite) || a.limite < 1 || a.limite > 50) throw new ErrorPlan('limite inválido');
    limite = a.limite;
  }
  if (a.incluir_estado_tarea !== undefined && typeof a.incluir_estado_tarea !== 'boolean') throw new ErrorPlan('incluir_estado_tarea debe ser booleano');
  return {
    proposito: typeof a.proposito === 'string' && a.proposito.trim() ? a.proposito.trim() : 'consulta',
    desde: a.desde,
    hasta: a.hasta,
    lotes: listaTextos(a.lotes, 'lotes'),
    tareas: listaTextos(a.tareas, 'tareas'),
    categorias: listaTextos(a.categorias, 'categorias'),
    sin_lote: sinLote as SinLote,
    agrupar_por: [...new Set(agrupar)] as Agrupacion[],
    metricas: [...new Set(metricas)] as Metrica[],
    incluir_estado_tarea: a.incluir_estado_tarea === true,
    limite,
  };
}

/** Convierte las llamadas del modelo en un plan validado, o lanza ErrorPlan. */
export function validarPlan(llamadas: LlamadaHerramienta[]): Plan {
  if (llamadas.length === 0) throw new ErrorPlan('el planificador no llamó ninguna herramienta');
  const parsear = (l: LlamadaHerramienta): Record<string, unknown> => {
    try {
      const v = JSON.parse(l.argumentos || '{}');
      if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new Error('no es objeto');
      return v as Record<string, unknown>;
    } catch {
      throw new ErrorPlan(`argumentos no son JSON válido en ${l.nombre}`);
    }
  };
  const nombres = new Set(llamadas.map((l) => l.nombre));
  for (const n of nombres) {
    if (![HERRAMIENTA_CONSULTAR, HERRAMIENTA_ACLARAR, HERRAMIENTA_FUERA].includes(n)) throw new ErrorPlan(`herramienta no registrada: ${n}`);
  }
  if (nombres.has(HERRAMIENTA_ACLARAR)) {
    const a = parsear(llamadas.find((l) => l.nombre === HERRAMIENTA_ACLARAR)!);
    if (typeof a.pregunta !== 'string' || !a.pregunta.trim()) throw new ErrorPlan('aclaración sin pregunta');
    return { tipo: 'aclaracion', aclaracion: { pregunta: a.pregunta.trim(), motivo: String(a.motivo ?? '') } };
  }
  if (nombres.has(HERRAMIENTA_FUERA)) {
    const a = parsear(llamadas.find((l) => l.nombre === HERRAMIENTA_FUERA)!);
    return { tipo: 'fuera_de_alcance', motivo: String(a.motivo ?? '') };
  }
  if (llamadas.length > MAX_CONSULTAS_POR_TURNO) throw new ErrorPlan(`más de ${MAX_CONSULTAS_POR_TURNO} consultas en un turno`);
  return { tipo: 'consultas', consultas: llamadas.map((l) => validarConsulta(parsear(l))) };
}
