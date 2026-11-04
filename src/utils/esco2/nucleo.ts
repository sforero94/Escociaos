// Recorrido de un turno: planificar → validar → ejecutar → componer → verificar números.
// Máximo tres llamadas al modelo: planificador, compositor y una recomposición.
// Si la recomposición también falla la guarda, se publica un resumen determinista.

import { resumenCatalogo } from './catalogo.ts';
import { ejecutarConsulta, SIN_LOTE_ETIQUETA } from './ejecutor.ts';
import { evidenciaNumerica, verificarNumeros } from './guardaNumerica.ts';
import type { ClienteLLM, Esfuerzo, MensajeLLM, RespuestaLLM } from './llm.ts';
import { mensajeCompositor, mensajeRecomposicion, PROMPT_COMPOSITOR, promptPlanificador } from './prompts.ts';
import { ErrorPlan, herramientasPlanificador, validarPlan } from './registro.ts';
import type { DatosLabores, MensajeHistorial, Plan, ResultadoParte } from './tipos.ts';

export interface ConfigModelos {
  nombre: string;
  planificador: { modelo: string; esfuerzo: Esfuerzo };
  compositor: { modelo: string; esfuerzo: Esfuerzo };
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
  /** Etapa que produjo la respuesta publicada. */
  origen: 'compositor' | 'recomposicion' | 'determinista' | 'aclaracion' | 'fuera_de_alcance' | 'error_plan' | 'error_llm';
  plan: Plan | null;
  errorPlan: string | null;
  resultados: ResultadoParte[];
  guarda: { primera: string[] | null; segunda: string[] | null };
  llamadas: RegistroLlamada[];
  ms: number;
}

const MAX_HISTORIAL = 6;

function registrar(etapa: RegistroLlamada['etapa'], r: RespuestaLLM): RegistroLlamada {
  return { etapa, modelo: r.modelo, ms: r.ms, ...r.uso };
}

function fmtNum(n: number | null | undefined, dinero = false): string {
  if (n === null || n === undefined) return 'sin dato';
  const s = n.toLocaleString('es-CO', { maximumFractionDigits: dinero ? 0 : 2 });
  return dinero ? `$${s}` : s;
}

/** Respuesta determinista a partir de los resultados. Solo cifras calculadas. */
export function renderDeterminista(resultados: ResultadoParte[]): string {
  const partes: string[] = [];
  for (const r of resultados) {
    const enc = `**${r.proposito}** (${r.alcance.desde} a ${r.alcance.hasta})`;
    if (r.estado === 'no_resuelto') {
      partes.push(
        `${enc}: no encontré en el sistema ${r.no_resueltos.map((n) => `«${n.texto}»`).join(', ')}.` +
          (r.no_resueltos.some((n) => n.sugerencias.length) ? ` Opciones: ${r.no_resueltos.flatMap((n) => n.sugerencias).join(', ')}.` : ''),
      );
      continue;
    }
    if (r.estado === 'sin_registros') {
      partes.push(`${enc}: no hay registros de trabajo en ese alcance.`);
      continue;
    }
    const lineas = [`${enc}: ${fmtNum(r.total.jornales)} jornales` + (r.total.costo !== undefined ? `, ${fmtNum(r.total.costo, true)}` : '') + '.'];
    for (const f of r.filas) {
      const nombre = Object.values(f.grupo).join(' · ');
      lineas.push(`- ${nombre}: ${fmtNum(f.jornales)} jornales` + (f.costo !== undefined ? `, ${fmtNum(f.costo, true)}` : '') + (f.estado_tarea ? ` (estado: ${f.estado_tarea})` : ''));
    }
    partes.push(lineas.join('\n'));
  }
  return partes.join('\n\n');
}

export async function responderTurno(args: {
  pregunta: string;
  historial: MensajeHistorial[];
  hoy: string;
  datos: DatosLabores;
  llm: ClienteLLM;
  config: ConfigModelos;
}): Promise<ResultadoTurno> {
  const inicio = Date.now();
  const { pregunta, hoy, datos, llm, config } = args;
  const historial: MensajeLLM[] = args.historial.slice(-MAX_HISTORIAL).map((m) => ({ role: m.rol, content: m.texto }));
  const llamadas: RegistroLlamada[] = [];
  const salida = (o: Omit<ResultadoTurno, 'llamadas' | 'ms'>): ResultadoTurno => ({ ...o, llamadas, ms: Date.now() - inicio });
  const base = { plan: null, errorPlan: null, resultados: [], guarda: { primera: null, segunda: null } };

  // 1. Planificar
  let rPlan: RespuestaLLM;
  try {
    rPlan = await llm.completar({
      modelo: config.planificador.modelo,
      esfuerzo: config.planificador.esfuerzo,
      mensajes: [{ role: 'system', content: promptPlanificador(hoy, resumenCatalogo(datos)) }, ...historial, { role: 'user', content: pregunta }],
      herramientas: herramientasPlanificador(),
      toolChoice: 'required',
      maxTokens: 1500,
    });
  } catch (e) {
    return salida({ ...base, respuesta: 'No pude procesar la consulta en este momento.', origen: 'error_llm', errorPlan: String(e) });
  }
  llamadas.push(registrar('planificador', rPlan));

  // 2. Validar
  let plan: Plan;
  try {
    plan = validarPlan(rPlan.llamadas);
  } catch (e) {
    const msg = e instanceof ErrorPlan ? e.message : String(e);
    return salida({ ...base, respuesta: 'No pude interpretar la consulta. ¿Puedes reformularla indicando período, lote o tarea?', origen: 'error_plan', errorPlan: msg });
  }
  if (plan.tipo === 'aclaracion') return salida({ ...base, plan, respuesta: plan.aclaracion.pregunta, origen: 'aclaracion' });
  if (plan.tipo === 'fuera_de_alcance') {
    return salida({ ...base, plan, respuesta: 'Por ahora solo respondo sobre labores: jornales y costo de mano de obra registrados.', origen: 'fuera_de_alcance' });
  }

  // 3. Ejecutar
  const resultados = plan.consultas.map((c, i) => ejecutarConsulta(c, datos, hoy, `p${i + 1}`));

  // 4. Componer y 5. verificar
  const evidencia = evidenciaNumerica(resultados, hoy, pregunta);
  const msgsComp: MensajeLLM[] = [
    { role: 'system', content: PROMPT_COMPOSITOR },
    ...historial.slice(-2),
    { role: 'user', content: mensajeCompositor(pregunta, hoy, resultados) },
  ];
  let rComp: RespuestaLLM;
  try {
    rComp = await llm.completar({ modelo: config.compositor.modelo, esfuerzo: config.compositor.esfuerzo, mensajes: msgsComp, maxTokens: 1500 });
  } catch (e) {
    return salida({ ...base, plan, resultados, respuesta: renderDeterminista(resultados), origen: 'determinista', errorPlan: `compositor: ${String(e)}` });
  }
  llamadas.push(registrar('compositor', rComp));
  const g1 = verificarNumeros(rComp.texto, evidencia);
  if (g1.ok && rComp.texto.trim()) {
    return salida({ ...base, plan, resultados, respuesta: rComp.texto, origen: 'compositor', guarda: { primera: [], segunda: null } });
  }

  let rRe: RespuestaLLM;
  try {
    rRe = await llm.completar({
      modelo: config.compositor.modelo,
      esfuerzo: config.compositor.esfuerzo,
      mensajes: [...msgsComp, { role: 'assistant', content: rComp.texto }, { role: 'user', content: mensajeRecomposicion(g1.noSoportados) }],
      maxTokens: 1500,
    });
  } catch {
    return salida({ ...base, plan, resultados, respuesta: renderDeterminista(resultados), origen: 'determinista', guarda: { primera: g1.noSoportados, segunda: null } });
  }
  llamadas.push(registrar('recomposicion', rRe));
  const g2 = verificarNumeros(rRe.texto, evidencia);
  if (g2.ok && rRe.texto.trim()) {
    return salida({ ...base, plan, resultados, respuesta: rRe.texto, origen: 'recomposicion', guarda: { primera: g1.noSoportados, segunda: [] } });
  }
  return salida({
    ...base,
    plan,
    resultados,
    respuesta: renderDeterminista(resultados),
    origen: 'determinista',
    guarda: { primera: g1.noSoportados, segunda: g2.noSoportados },
  });
}

export { SIN_LOTE_ETIQUETA };
