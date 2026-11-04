// Recorrido de un turno: catálogo → planificar → validar → regla D26 → leer registros
// → ejecutar → elegir compositor (D25) → componer → verificar números.
// Máximo tres llamadas al modelo: planificador, compositor y una recomposición.
// Si la recomposición también falla la guarda, se publica un resumen determinista.

import { aplicarReglaDoble } from './ambiguedad.ts';
import { resumenCatalogo } from './catalogo.ts';
import { ejecutarConsulta, SIN_LOTE_ETIQUETA } from './ejecutor.ts';
import { evidenciaNumerica, verificarCifrasObligatorias, verificarNumeros } from './guardaNumerica.ts';
import type { ClienteLLM, Esfuerzo, MensajeLLM, RespuestaLLM } from './llm.ts';
import { mensajeCompositor, mensajeRecomposicion, PROMPT_COMPOSITOR, promptPlanificador } from './prompts.ts';
import { fuenteEnMemoria, type FuenteLabores } from './fuente.ts';
import { ErrorPlan, herramientasPlanificador, validarPlan } from './registro.ts';
import { elegirRuta, modeloCompositor, type ModeloEtapa, type Ruta } from './ruteo.ts';
import type { DatosLabores, MensajeHistorial, Plan, ResultadoParte, ValoresMetricas } from './tipos.ts';

export interface ConfigModelos {
  nombre: string;
  planificador: { modelo: string; esfuerzo: Esfuerzo };
  compositor: { modelo: string; esfuerzo: Esfuerzo };
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
  /** Etapa que produjo la respuesta publicada. */
  origen:
    | 'compositor'
    | 'recomposicion'
    | 'determinista'
    | 'aclaracion'
    | 'fuera_de_alcance'
    | 'error_plan'
    | 'error_llm'
    | 'error_datos';
  plan: Plan | null;
  errorPlan: string | null;
  /** D25: ruta del compositor. null si el turno no llegó a componer. */
  ruta: Ruta | null;
  /** Cambios deterministas aplicados al plan (D26). */
  ajustes: string[];
  resultados: ResultadoParte[];
  guarda: { primera: string[] | null; segunda: string[] | null };
  llamadas: RegistroLlamada[];
  ms: number;
}

const MAX_HISTORIAL = 6;

/** Las dos mitades de la guarda: nada de más (cifras sin evidencia) y nada de menos (cifras obligatorias). */
function verificarRespuesta(texto: string, evidencia: ReturnType<typeof evidenciaNumerica>, resultados: ResultadoParte[]) {
  const { noSoportados } = verificarNumeros(texto, evidencia);
  const faltantes = verificarCifrasObligatorias(texto, resultados);
  return { ok: noSoportados.length === 0 && faltantes.length === 0, noSoportados, faltantes, motivos: [...noSoportados, ...faltantes.map((f) => `falta: ${f}`)] };
}

function registrar(etapa: RegistroLlamada['etapa'], r: RespuestaLLM): RegistroLlamada {
  return { etapa, modelo: r.modelo, ms: r.ms, ...r.uso };
}

function fmtNum(n: number | null | undefined, dinero = false, decimales = 2): string {
  if (n === null || n === undefined) return 'sin dato';
  const s = n.toLocaleString('es-CO', { maximumFractionDigits: dinero ? 0 : decimales });
  return dinero ? `$${s}` : s;
}

function fmtFecha(f: string | null | undefined): string {
  return f ? f : 'sin fecha registrada';
}

function fmtRazones(v: ValoresMetricas): string {
  const p: string[] = [];
  if (v.jornales_por_arbol !== undefined) p.push(`${fmtNum(v.jornales_por_arbol, false, 4)} jornales por árbol`);
  if (v.jornales_por_hectarea !== undefined) p.push(`${fmtNum(v.jornales_por_hectarea, false, 3)} jornales por hectárea`);
  if (v.costo_por_jornal !== undefined) p.push(`${fmtNum(v.costo_por_jornal, true)} por jornal`);
  if (v.dias_con_registro !== undefined) p.push(`${v.dias_con_registro} días con registro`);
  if (v.primer_registro !== undefined) p.push(`primer registro ${fmtFecha(v.primer_registro)}`);
  if (v.ultimo_registro !== undefined) p.push(`último registro ${fmtFecha(v.ultimo_registro)}`);
  return p.length ? `; ${p.join('; ')}` : '';
}

/** Respuesta determinista a partir de los resultados. Solo cifras calculadas; dice todo lo obligatorio. */
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
    const lineas = [
      `${enc}: ${fmtNum(r.total.jornales)} jornales registrados` + (r.total.costo !== undefined ? `, ${fmtNum(r.total.costo, true)}` : '') + fmtRazones(r.total) + '.',
    ];
    if (r.estimados) {
      lineas.push(
        `Jornales estimados de esas tareas (plan completo, no solo el período): ${fmtNum(r.estimados.jornales_estimados)}` +
          (r.estimados.tareas_sin_estimado ? `; ${r.estimados.tareas_sin_estimado} tarea(s) sin estimado.` : '.'),
      );
    }
    for (const f of r.filas) {
      const nombre = Object.values(f.grupo).join(' · ');
      let linea = `- ${nombre}: ${fmtNum(f.jornales)} jornales registrados` + (f.costo !== undefined ? `, ${fmtNum(f.costo, true)}` : '') + fmtRazones(f);
      if (f.jornales_estimados !== undefined) linea += `; estimados ${fmtNum(f.jornales_estimados)}`;
      if (f.estado_tarea) linea += ` (estado: ${f.estado_tarea})`;
      if (f.fechas_tarea) {
        linea += `; planeada ${fmtFecha(f.fechas_tarea.estimada_inicio)} a ${fmtFecha(f.fechas_tarea.estimada_fin)}; real ${fmtFecha(f.fechas_tarea.real_inicio)} a ${fmtFecha(f.fechas_tarea.real_fin)}`;
      }
      if (f.aplicacion !== undefined) linea += f.aplicacion ? `; aplicación ${[f.aplicacion.nombre, f.aplicacion.codigo].filter(Boolean).join(' ')}` : '; sin aplicación asociada';
      lineas.push(linea);
    }
    for (const n of r.notas) lineas.push(`Nota: ${n}.`);
    partes.push(lineas.join('\n'));
  }
  return partes.join('\n\n');
}

interface ArgsTurno {
  pregunta: string;
  historial: MensajeHistorial[];
  hoy: string;
  llm: ClienteLLM;
  config: ConfigModelos;
}

/** Turno sobre datos ya cargados (snapshot congelado, pruebas). */
export function responderTurno(args: ArgsTurno & { datos: DatosLabores }): Promise<ResultadoTurno> {
  return responderTurnoDesdeFuente({ ...args, fuente: fuenteEnMemoria(args.datos) });
}

/** Rango mínimo que cubre todas las partes del plan, recortado a hoy. */
export function rangoDelPlan(plan: Plan, hoy: string): { desde: string; hasta: string } | null {
  if (plan.tipo !== 'consultas' || plan.consultas.length === 0) return null;
  const desde = plan.consultas.map((c) => c.desde).sort()[0];
  const hasta = plan.consultas.map((c) => (c.hasta > hoy ? hoy : c.hasta)).sort().reverse()[0];
  return desde > hasta ? null : { desde, hasta };
}

/** Turno que lee de una fuente: catálogo antes de planear, registros después. */
export async function responderTurnoDesdeFuente(args: ArgsTurno & { fuente: FuenteLabores }): Promise<ResultadoTurno> {
  const inicio = Date.now();
  const { pregunta, hoy, fuente, llm, config } = args;
  const historial: MensajeLLM[] = args.historial.slice(-MAX_HISTORIAL).map((m) => ({ role: m.rol, content: m.texto }));
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
  const sinDatos = 'No pude leer los datos de labores en este momento. No respondo sin datos completos.';

  // 0. Catálogo (nombres de lotes, tareas, tipos y categorías)
  let catalogo: Awaited<ReturnType<FuenteLabores['catalogo']>>;
  try {
    catalogo = await fuente.catalogo();
  } catch (e) {
    return salida({ ...base, respuesta: sinDatos, origen: 'error_datos', errorPlan: `catálogo: ${String(e)}` });
  }

  // 1. Planificar
  let rPlan: RespuestaLLM;
  try {
    rPlan = await llm.completar({
      modelo: config.planificador.modelo,
      esfuerzo: config.planificador.esfuerzo,
      mensajes: [
        { role: 'system', content: promptPlanificador(hoy, resumenCatalogo({ ...catalogo, registros: [] })) },
        ...historial,
        { role: 'user', content: pregunta },
      ],
      herramientas: herramientasPlanificador(),
      toolChoice: 'required',
      maxTokens: 1500,
    });
  } catch (e) {
    return salida({ ...base, respuesta: 'No pude procesar la consulta en este momento.', origen: 'error_llm', errorPlan: String(e) });
  }
  llamadas.push(registrar('planificador', rPlan));

  // 2. Validar y aplicar la regla D26 (palabras que son categoría y tarea a la vez)
  let plan: Plan;
  try {
    plan = validarPlan(rPlan.llamadas);
  } catch (e) {
    const msg = e instanceof ErrorPlan ? e.message : String(e);
    return salida({ ...base, respuesta: 'No pude interpretar la consulta. ¿Puedes reformularla indicando período, lote o tarea?', origen: 'error_plan', errorPlan: msg });
  }
  const d26 = aplicarReglaDoble(plan, catalogo, args.historial);
  plan = d26.plan;
  base.ajustes = d26.ajustes;
  if (plan.tipo === 'aclaracion') return salida({ ...base, plan, respuesta: plan.aclaracion.pregunta, origen: 'aclaracion' });
  if (plan.tipo === 'fuera_de_alcance') {
    return salida({ ...base, plan, respuesta: 'Por ahora solo respondo sobre labores: jornales y costo de mano de obra registrados.', origen: 'fuera_de_alcance' });
  }

  // 3. Leer registros del rango del plan y ejecutar
  const rango = rangoDelPlan(plan, hoy);
  let datos: DatosLabores;
  try {
    datos = { ...catalogo, registros: rango ? await fuente.registros(rango.desde, rango.hasta) : [] };
  } catch (e) {
    return salida({ ...base, plan, respuesta: sinDatos, origen: 'error_datos', errorPlan: `registros: ${String(e)}` });
  }
  const resultados = plan.consultas.map((c, i) => ejecutarConsulta(c, datos, hoy, `p${i + 1}`));
  const ruta = elegirRuta(plan);
  const compositor = modeloCompositor(ruta, config.compositor, config.compositorReforzado);
  base.ruta = ruta;

  // 4. Componer y 5. verificar
  const evidencia = evidenciaNumerica(resultados, hoy, pregunta);
  const msgsComp: MensajeLLM[] = [
    { role: 'system', content: PROMPT_COMPOSITOR },
    ...historial.slice(-2),
    { role: 'user', content: mensajeCompositor(pregunta, hoy, resultados) },
  ];
  let rComp: RespuestaLLM;
  try {
    rComp = await llm.completar({ modelo: compositor.modelo, esfuerzo: compositor.esfuerzo, mensajes: msgsComp, maxTokens: 1500 });
  } catch (e) {
    return salida({ ...base, plan, resultados, respuesta: renderDeterminista(resultados), origen: 'determinista', errorPlan: `compositor: ${String(e)}` });
  }
  llamadas.push(registrar('compositor', rComp));
  const g1 = verificarRespuesta(rComp.texto, evidencia, resultados);
  if (g1.ok && rComp.texto.trim()) {
    return salida({ ...base, plan, resultados, respuesta: rComp.texto, origen: 'compositor', guarda: { primera: [], segunda: null } });
  }

  let rRe: RespuestaLLM;
  try {
    rRe = await llm.completar({
      modelo: compositor.modelo,
      esfuerzo: compositor.esfuerzo,
      mensajes: [...msgsComp, { role: 'assistant', content: rComp.texto }, { role: 'user', content: mensajeRecomposicion(g1.noSoportados, g1.faltantes) }],
      maxTokens: 1500,
    });
  } catch {
    return salida({ ...base, plan, resultados, respuesta: renderDeterminista(resultados), origen: 'determinista', guarda: { primera: g1.motivos, segunda: null } });
  }
  llamadas.push(registrar('recomposicion', rRe));
  const g2 = verificarRespuesta(rRe.texto, evidencia, resultados);
  if (g2.ok && rRe.texto.trim()) {
    return salida({ ...base, plan, resultados, respuesta: rRe.texto, origen: 'recomposicion', guarda: { primera: g1.motivos, segunda: [] } });
  }
  return salida({
    ...base,
    plan,
    resultados,
    respuesta: renderDeterminista(resultados),
    origen: 'determinista',
    guarda: { primera: g1.motivos, segunda: g2.motivos },
  });
}

export { SIN_LOTE_ETIQUETA };
