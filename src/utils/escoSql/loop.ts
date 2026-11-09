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

export const MAX_CONSULTAS = 4;
export const MAX_HISTORIAL_SQL = 10;
/** Tope de caracteres de filas que se le muestran al modelo por consulta (el resto se avisa). */
export const MAX_CARACTERES_RESULTADO = 12000;
/** Filas que se conservan para mostrar en la pantalla de prueba. */
export const FILAS_MUESTRA = 20;
const MAX_TOKENS = 1500;
const MAX_TEXTO_HISTORIAL = 4000;

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
  /** Primeras filas, para que la pantalla de prueba las muestre. */
  filas_muestra: Record<string, unknown>[];
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
  consultas: ConsultaSql[];
  uso: UsoSql;
  ms: number;
}

export interface EntradaPregunta {
  pregunta: string;
  historial?: MensajeHistorialSql[];
  llm: ClienteLLM;
  ejecutarSql: (sql: string) => Promise<ResultadoSql>;
  /** Fecha de hoy en Bogotá, AAAA-MM-DD. */
  hoy: string;
  config?: { modelo: string; esfuerzo: Esfuerzo };
  ahora?: () => number;
}

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
  let cuerpo = JSON.stringify(r.filas);
  let aviso = '';
  if (cuerpo.length > MAX_CARACTERES_RESULTADO) {
    // Recorta por filas completas para no entregar JSON cortado a la mitad.
    let acumulado = 1;
    let usadas = 0;
    for (const fila of r.filas) {
      const largo = JSON.stringify(fila).length + 1;
      if (acumulado + largo > MAX_CARACTERES_RESULTADO) break;
      acumulado += largo;
      usadas++;
    }
    cuerpo = JSON.stringify(r.filas.slice(0, usadas));
    aviso = ` Solo ves las primeras ${usadas} filas porque el resultado es largo; agrega la consulta (SUM/COUNT/GROUP BY) si necesitas el total.`;
  }
  const trunc = r.truncado ? ' El resultado fue TRUNCADO a 500 filas: no es el conjunto completo.' : '';
  return `Resultado de la consulta ${n}: ${r.n_filas} fila(s).${trunc}${aviso}\n${cuerpo}`;
}

export async function responderPregunta(entrada: EntradaPregunta): Promise<ResultadoPregunta> {
  const reloj = entrada.ahora ?? Date.now;
  const inicio = reloj();
  const config = entrada.config ?? CONFIG_SQL;
  const uso: UsoSql = { llamadas: 0, entrada: 0, salida: 0, costoUsd: 0 };
  const consultas: ConsultaSql[] = [];

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
  const terminar = (respuesta: string): ResultadoPregunta => ({
    respuesta: abreviarDineroEnTexto(respuesta.trim()) || 'No pude armar una respuesta. Intenta reformular la pregunta.',
    consultas,
    uso,
    ms: reloj() - inicio,
  });

  while (true) {
    const puedeConsultar = consultas.length < MAX_CONSULTAS;
    const r = await entrada.llm.completar({
      modelo: config.modelo,
      esfuerzo: config.esfuerzo,
      mensajes,
      herramientas: puedeConsultar ? [HERRAMIENTA_CONSULTAR_SQL] : undefined,
      toolChoice: puedeConsultar ? 'auto' : undefined,
      maxTokens: MAX_TOKENS,
    });
    registrarUso(r.uso);

    const llamadas = r.llamadas.filter((l) => l.nombre === 'consultar_sql');
    if (!llamadas.length || !puedeConsultar) return terminar(r.texto);

    // Protocolo de herramientas de OpenAI: el turno del asistente lleva sus llamadas y cada una
    // recibe su mensaje 'tool'. Todas las llamadas deben quedar respondidas, aunque no se ejecuten.
    const ids = llamadas.map((_, i) => `call_${consultas.length + i + 1}`);
    mensajes.push({
      role: 'assistant',
      content: r.texto ?? '',
      tool_calls: llamadas.map((l, i) => ({ id: ids[i], type: 'function' as const, function: { name: 'consultar_sql', arguments: l.argumentos } })),
    });
    for (const [i, llamada] of llamadas.entries()) {
      const responder = (content: string) => mensajes.push({ role: 'tool', tool_call_id: ids[i], content });
      if (consultas.length >= MAX_CONSULTAS) {
        responder(`No ejecutada: ya usaste las ${MAX_CONSULTAS} consultas permitidas.`);
        continue;
      }
      const n = consultas.length + 1;
      const args = leerArgumentos(llamada.argumentos);
      if (!args) {
        consultas.push({ sql: llamada.argumentos.slice(0, 500), proposito: '', n_filas: null, truncado: false, error: 'argumentos inválidos', filas_muestra: [] });
        responder('Error: la llamada a consultar_sql no traía {sql, proposito} válidos. Vuelve a intentar.');
        continue;
      }
      try {
        const res = await entrada.ejecutarSql(args.sql);
        consultas.push({ sql: args.sql, proposito: args.proposito, n_filas: res.n_filas, truncado: res.truncado, error: null, filas_muestra: res.filas.slice(0, FILAS_MUESTRA) });
        responder(textoResultado(n, res));
      } catch (e) {
        // Sin permiso (42501) o un error de PostgREST (PGRST*: la función no existe, etc.) no son
        // errores de la consulta: el modelo no puede arreglarlos, así que no se le muestran.
        if (e instanceof ErrorAccesoSql || (e instanceof ErrorSql && (e.codigo === '42501' || e.codigo?.startsWith('PGRST')))) throw e;
        const mensaje = e instanceof Error ? e.message : String(e);
        consultas.push({ sql: args.sql, proposito: args.proposito, n_filas: null, truncado: false, error: mensaje, filas_muestra: [] });
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
