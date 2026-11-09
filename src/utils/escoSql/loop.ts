// Esco SQL — el loop. Sin extractor de intención, planificador, comparador ni cobertura.
//
// El modelo ve la pregunta, escribe un SELECT con la herramienta `consultar_sql`, la base
// lo ejecuta con la RLS del usuario (RPC esco_sql_lectura, migración 192) y el modelo
// responde con las filas devueltas. Si Postgres devuelve un error, el modelo lo ve y puede
// corregir. Máximo MAX_CONSULTAS consultas por pregunta.
//
// Puro y probable: el modelo (`llm`) y la base (`ejecutarSql`) llegan inyectados.
//
// Protocolo de herramientas estándar (assistant.tool_calls + mensajes role 'tool'). Se probó
// primero emular el intercambio con turnos de texto y el modelo repetía la misma consulta.

import type { ClienteLLM, Esfuerzo, MensajeLLM } from '../esco2/llm.ts';
import { abreviarDineroEnTexto } from './formatoDinero.ts';
import { construirPrompt } from './prompt.ts';
import { construirBloque, MAX_BLOQUES, MAX_FILAS_SQL, type Bloque, type FuenteVisual } from './bloques.ts';
import { FORMATOS } from './formato.ts';
import { leerRespuestaFinal, type Aclaracion } from './respuesta.ts';

export const MAX_CONSULTAS = 4;
export const MAX_HISTORIAL_SQL = 10;
/** Tope de caracteres de filas que se le muestran al modelo por consulta (el resto se avisa). */
export const MAX_CARACTERES_RESULTADO = 12000;
/** Muestra del contexto del modelo y de consumidores internos anteriores; la traza HTTP la omite. */
export const FILAS_MUESTRA = 20;
const MAX_TOKENS = 1500;
const MAX_TEXTO_HISTORIAL = 4000;
/** Un proveedor que repite herramientas inválidas tampoco puede abrir un loop infinito. */
export const MAX_RONDAS_SQL = 10;

/** Mismo modelo y misma ruta (habitual, sin razonamiento) que el planificador de esco-consultas. */
export const CONFIG_SQL: { modelo: string; esfuerzo: Esfuerzo } = { modelo: 'openai/gpt-6-luna', esfuerzo: 'none' };

export interface ResultadoSql {
  filas: Record<string, unknown>[];
  n_filas: number;
  truncado: boolean;
}

/** Error de la base. `codigo` es el SQLSTATE cuando se conoce (42501 = no es Gerencia). */
export class ErrorSql extends Error {
  constructor(mensaje: string, readonly codigo?: string) {
    super(mensaje);
    this.name = 'ErrorSql';
  }
}

/** La base rechazó el acceso: no se reintenta ni se le muestra al modelo. */
export class ErrorAccesoSql extends ErrorSql {
  constructor(mensaje: string) {
    super(mensaje, '42501');
    this.name = 'ErrorAccesoSql';
  }
}

export interface MensajeHistorialSql {
  rol: 'user' | 'assistant';
  texto: string;
}

export interface ConsultaSql {
  sql: string;
  proposito: string;
  n_filas: number | null;
  truncado: boolean;
  error: string | null;
  /** Compatibilidad interna del loop; manejarSql la excluye del contrato HTTP. */
  filas_muestra: Record<string, unknown>[];
  ms: number;
}

export interface UsoSql {
  llamadas: number;
  entrada: number;
  salida: number;
  /** null si algún proveedor no reportó costo. */
  costoUsd: number | null;
}

export interface ResultadoPregunta {
  respuesta: string;
  texto: string;
  bloques: Bloque[];
  sugerencias: string[];
  aclaracion?: Aclaracion;
  consultas: ConsultaSql[];
  uso: UsoSql;
  ms: number;
}

export type EventoProgresoSql =
  | { type: 'consulta_inicio'; consulta: number; proposito: string }
  | { type: 'consulta_fin'; consulta: number; ms: number; ok: boolean; n_filas: number | null };

export interface EntradaPregunta {
  pregunta: string;
  historial?: MensajeHistorialSql[];
  llm: ClienteLLM;
  ejecutarSql: (sql: string) => Promise<ResultadoSql>;
  /** Fecha de hoy en Bogotá, AAAA-MM-DD. */
  hoy: string;
  config?: { modelo: string; esfuerzo: Esfuerzo };
  ahora?: () => number;
  /** Solo códigos cerrados, nunca especificaciones ni datos de la finca. */
  registrarRechazoVisual?: (motivo: string) => void;
  onEvento?: (evento: EventoProgresoSql) => void;
  /** Best effort: never starts another model or SQL call after cancellation. */
  signal?: AbortSignal;
}

const columnaVisual = {
  type: 'object', additionalProperties: false,
  properties: { columna: { type: 'string' }, etiqueta: { type: 'string' }, formato: { type: 'string', enum: FORMATOS } },
  required: ['columna', 'etiqueta', 'formato'],
};
export const HERRAMIENTA_MOSTRAR_VISUAL = {
  type: 'function', function: {
    name: 'mostrar_visual',
    description: 'Pide un visual con columnas de una consulta previa (consulta desde 1). Solo especificación: jamás escribas filas, datos ni valores. Hasta 4 visuales. Tarjeta: consulta agregada de una sola fila. Gráfica: hasta 60 puntos.',
    parameters: {
      type: 'object',
      oneOf: [
        { type: 'object', additionalProperties: false, properties: { tipo: { const: 'tabla' }, consulta: { type: 'integer', minimum: 1 }, titulo: { type: 'string' }, columnas: { type: 'array', items: columnaVisual, minItems: 1, maxItems: 12 } }, required: ['tipo', 'consulta', 'titulo', 'columnas'] },
        { type: 'object', additionalProperties: false, properties: { tipo: { const: 'grafica' }, consulta: { type: 'integer', minimum: 1 }, titulo: { type: 'string' }, forma: { enum: ['bar', 'line', 'pie', 'area'] }, x: { type: 'string' }, y: { type: 'array', items: { type: 'string' }, minItems: 1, maxItems: 6 }, formato: { enum: FORMATOS } }, required: ['tipo', 'consulta', 'titulo', 'forma', 'x', 'y', 'formato'] },
        { type: 'object', additionalProperties: false, properties: { tipo: { const: 'tarjeta' }, consulta: { type: 'integer', minimum: 1 }, items: { type: 'array', items: columnaVisual, minItems: 1, maxItems: 8 } }, required: ['tipo', 'consulta', 'items'] },
      ],
    },
  },
} as const;

export const HERRAMIENTA_CONSULTAR_SQL = {
  type: 'function',
  function: {
    name: 'consultar_sql',
    description:
      'Ejecuta un SELECT (o WITH … SELECT) de PostgreSQL de solo lectura contra las vistas v_esco_*. Una sola sentencia. Devuelve máximo 500 filas o el error de Postgres.',
    parameters: {
      type: 'object',
      properties: {
        sql: { type: 'string', description: 'La consulta SQL, una sola sentencia.' },
        proposito: { type: 'string', description: 'En una frase corta: qué intentas averiguar con esta consulta.' },
      },
      required: ['sql', 'proposito'],
    },
  },
} as const;

/** Lo que se guarda como respuesta del asistente en el historial: el texto más el SQL usado. */
export function textoHistorialSql(respuesta: string, consultas: Pick<ConsultaSql, 'sql'>[]): string {
  if (!consultas.length) return respuesta.slice(0, MAX_TEXTO_HISTORIAL);
  const bloque = `\n\n[Consultas SQL que usé en este turno]\n${consultas.map((c) => c.sql).join('\n---\n')}`;
  const sobra = MAX_TEXTO_HISTORIAL - bloque.length;
  if (sobra < 200) return `${respuesta.slice(0, MAX_TEXTO_HISTORIAL - 200)}${bloque.slice(0, 200)}`;
  return `${respuesta.slice(0, sobra)}${bloque}`;
}

function leerArgumentos(bruto: string): { sql: string; proposito: string } | null {
  try {
    const a = JSON.parse(bruto) as { sql?: unknown; proposito?: unknown };
    if (typeof a.sql !== 'string' || !a.sql.trim()) return null;
    return { sql: a.sql, proposito: typeof a.proposito === 'string' ? a.proposito : '' };
  } catch {
    return null;
  }
}

function textoResultado(n: number, r: ResultadoSql): string {
  const muestra = r.filas.slice(0, FILAS_MUESTRA);
  let cuerpo = JSON.stringify(muestra);
  let aviso = r.filas.length > FILAS_MUESTRA ? ` Solo ves las primeras ${FILAS_MUESTRA} filas; el servidor conserva todas para mostrar_visual. Agrega con SUM/COUNT/GROUP BY si necesitas un total.` : '';
  if (cuerpo.length > MAX_CARACTERES_RESULTADO) {
    // Recorta por filas completas para no entregar JSON cortado a la mitad.
    let acumulado = 1;
    let usadas = 0;
    for (const fila of muestra) {
      const largo = JSON.stringify(fila).length + 1;
      if (acumulado + largo > MAX_CARACTERES_RESULTADO) break;
      acumulado += largo;
      usadas++;
    }
    cuerpo = JSON.stringify(muestra.slice(0, usadas));
    aviso = ` Solo ves las primeras ${usadas} filas porque el resultado es largo; agrega la consulta (SUM/COUNT/GROUP BY) si necesitas el total.`;
  }
  const trunc = r.truncado ? ' El resultado fue TRUNCADO a 500 filas: no es el conjunto completo.' : '';
  return `Resultado de la consulta ${n}: ${r.n_filas} fila(s).${trunc}${aviso}\n${cuerpo}`;
}

export async function responderPregunta(entrada: EntradaPregunta): Promise<ResultadoPregunta> {
  const reloj = entrada.ahora ?? Date.now;
  const inicio = reloj();
  const config = entrada.config ?? CONFIG_SQL;
  const comprobarCancelacion = () => {
    if (entrada.signal?.aborted) throw new DOMException('Solicitud cancelada', 'AbortError');
  };
  const uso: UsoSql = { llamadas: 0, entrada: 0, salida: 0, costoUsd: 0 };
  const consultas: ConsultaSql[] = [];
  const fuentes: FuenteVisual[] = [];
  const bloques: Bloque[] = [];
  let rondas = 0;
  let numeroLlamada = 0;

  const mensajes: MensajeLLM[] = [{ role: 'system', content: construirPrompt(entrada.hoy) }];
  for (const m of (entrada.historial ?? []).slice(-MAX_HISTORIAL_SQL)) {
    mensajes.push({ role: m.rol === 'assistant' ? 'assistant' : 'user', content: m.texto });
  }
  mensajes.push({ role: 'user', content: entrada.pregunta });

  const registrarUso = (u: { entrada: number; salida: number; costoUsd: number | null }) => {
    uso.llamadas++;
    uso.entrada += u.entrada;
    uso.salida += u.salida;
    uso.costoUsd = uso.costoUsd === null || u.costoUsd === null ? null : uso.costoUsd + u.costoUsd;
  };

  // F1: el dinero del texto sale siempre en formato colombiano abreviado, lo escriba así el modelo o no.
  const terminar = (bruto: string): ResultadoPregunta => {
    const final = leerRespuestaFinal(bruto);
    const texto = abreviarDineroEnTexto(final.texto) || 'No pude armar una respuesta. Intenta reformular la pregunta.';
    return { ...final, texto, respuesta: texto, bloques, consultas, uso, ms: reloj() - inicio };
  };

  while (true) {
    comprobarCancelacion();
    const puedeConsultar = consultas.length < MAX_CONSULTAS;
    const puedeUsarHerramientas = rondas < MAX_RONDAS_SQL;
    const herramientas: unknown[] = [];
    if (puedeUsarHerramientas) {
      if (puedeConsultar) herramientas.push(HERRAMIENTA_CONSULTAR_SQL);
      if (bloques.length < MAX_BLOQUES) herramientas.push(HERRAMIENTA_MOSTRAR_VISUAL);
    }
    const r = await entrada.llm.completar({
      modelo: config.modelo,
      esfuerzo: config.esfuerzo,
      mensajes,
      herramientas: herramientas.length ? herramientas : undefined,
      toolChoice: herramientas.length ? 'auto' : undefined,
      maxTokens: MAX_TOKENS,
    });
    registrarUso(r.uso);
    comprobarCancelacion();
    rondas++;

    const llamadas = r.llamadas;
    if (!llamadas.length || !puedeUsarHerramientas) return terminar(r.texto);

    // Protocolo de herramientas de OpenAI: el turno del asistente lleva sus llamadas y cada una
    // recibe su mensaje 'tool'. Todas las llamadas deben quedar respondidas, aunque no se ejecuten.
    const ids = llamadas.map(() => `call_${++numeroLlamada}`);
    mensajes.push({
      role: 'assistant',
      content: r.texto ?? '',
      tool_calls: llamadas.map((l, i) => ({ id: ids[i], type: 'function' as const, function: { name: l.nombre, arguments: l.argumentos } })),
    });
    for (const [i, llamada] of llamadas.entries()) {
      comprobarCancelacion();
      const responder = (content: string) => mensajes.push({ role: 'tool', tool_call_id: ids[i], content });
      if (llamada.nombre === 'mostrar_visual') {
        let resultado: ReturnType<typeof construirBloque>;
        try { resultado = construirBloque(JSON.parse(llamada.argumentos), fuentes); }
        catch { resultado = { error: 'especificacion_invalida' }; }
        const motivo = bloques.length >= MAX_BLOQUES ? 'limite_bloques' : 'error' in resultado ? resultado.error : null;
        if (motivo) {
          entrada.registrarRechazoVisual?.(motivo);
          responder(`Visual descartado: ${motivo}. Continúa con texto o una especificación válida.`);
        } else if ('bloque' in resultado) {
          bloques.push(resultado.bloque);
          responder(`Visual ${bloques.length} preparado desde las filas de la consulta ${resultado.bloque.consulta}.`);
        }
        continue;
      }
      if (llamada.nombre !== 'consultar_sql') { responder('Herramienta no admitida.'); continue; }
      if (consultas.length >= MAX_CONSULTAS) {
        responder(`No ejecutada: ya usaste las ${MAX_CONSULTAS} consultas permitidas.`);
        continue;
      }
      const n = consultas.length + 1;
      const args = leerArgumentos(llamada.argumentos);
      entrada.onEvento?.({ type: 'consulta_inicio', consulta: n, proposito: args?.proposito ?? '' });
      if (!args) {
        consultas.push({ sql: llamada.argumentos.slice(0, 500), proposito: '', n_filas: null, truncado: false, error: 'argumentos inválidos', filas_muestra: [], ms: 0 });
        fuentes.push({ filas: [], n_filas: null, truncado: false, error: 'argumentos_invalidos' });
        entrada.onEvento?.({ type: 'consulta_fin', consulta: n, ms: 0, ok: false, n_filas: null });
        responder('Error: la llamada a consultar_sql no traía {sql, proposito} válidos. Vuelve a intentar.');
        continue;
      }
      const inicioConsulta = reloj();
      try {
        const recibido = await entrada.ejecutarSql(args.sql);
        comprobarCancelacion();
        const res = { ...recibido, filas: recibido.filas.slice(0, MAX_FILAS_SQL), truncado: recibido.truncado || recibido.filas.length > MAX_FILAS_SQL };
        fuentes.push({ ...res });
        consultas.push({ sql: args.sql, proposito: args.proposito, n_filas: res.n_filas, truncado: res.truncado, error: null, filas_muestra: res.filas.slice(0, FILAS_MUESTRA), ms: reloj() - inicioConsulta });
        entrada.onEvento?.({ type: 'consulta_fin', consulta: n, ms: reloj() - inicioConsulta, ok: true, n_filas: res.n_filas });
        responder(textoResultado(n, res));
      } catch (e) {
        // Sin permiso (42501) o un error de PostgREST (PGRST*: la función no existe, etc.) no son
        // errores de la consulta: el modelo no puede arreglarlos, así que no se le muestran.
        comprobarCancelacion();
        entrada.onEvento?.({ type: 'consulta_fin', consulta: n, ms: reloj() - inicioConsulta, ok: false, n_filas: null });
        if (e instanceof ErrorAccesoSql || (e instanceof ErrorSql && (e.codigo === '42501' || e.codigo?.startsWith('PGRST')))) throw e;
        const mensaje = e instanceof Error ? e.message : String(e);
        fuentes.push({ filas: [], n_filas: null, truncado: false, error: 'consulta_fallida' });
        consultas.push({ sql: args.sql, proposito: args.proposito, n_filas: null, truncado: false, error: mensaje, filas_muestra: [], ms: reloj() - inicioConsulta });
        responder(`Error de Postgres en la consulta ${n}: ${mensaje}\nCorrige la consulta o, si no se puede, explica qué no pudiste averiguar.`);
      }
    }

    if (consultas.length >= MAX_CONSULTAS) {
      mensajes.push({
        role: 'user',
        content: `Ya usaste las ${MAX_CONSULTAS} consultas permitidas. Responde ahora con lo que obtuviste; si falta algo, dilo.`,
      });
    }
  }
}
