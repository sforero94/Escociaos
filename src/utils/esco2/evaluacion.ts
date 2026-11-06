// Puntuación determinista de M2.5. Separa dos etapas:
//  - selección: ¿el plan + ejecutor produjeron las cifras de referencia? (operación y argumentos)
//  - respuesta: ¿el texto publicado afirma esas cifras?
// El juicio de "must"/"must_not" que no es numérico se revisa a mano y se registra aparte.
//
// Tipos de ancla:
//  - numero: el número aparece (con tolerancia).
//  - fecha:  la fecha aparece EXACTA, y la respuesta no afirma otra fecha que no esté en la
//            referencia (ver «fecha de más»).
//  - conjunto: todos los miembros aparecen, y ninguno de más. Los miembros son fechas ISO o
//            nombres; para nombres, `universo` lista lo que cuenta como miembro de más.
// Fecha de más: una fecha que la respuesta afirma y que no es (a) del ancla, (b) de
// `permitidas` (otros hechos verdaderos que el caso acepta), ni (c) del contexto (hoy y los
// límites del período consultado). Sin esta regla, una respuesta con el conjunto de fechas
// equivocado pasaba mientras los números sueltos coincidieran.

import { extraerNumeros, numeroCerca } from '../escoEvals/numeros.ts';
import { MARCA } from './ambiguedad.ts';
import { extraerFechas } from './fechasTexto.ts';
import { normalizar } from './catalogo.ts';
import type { ResultadoTurno } from './nucleo.ts';
import { esResultadoMonitoreo, esResultadoAplicaciones, esResultadoCantidades, esResultadoCostos, esResultadoFaltantesAplicacion, esResultadoLaborAplicacion } from './tipos.ts';

export interface Ancla {
  claim: string;
  valor: number | string | string[];
  tol: number | null;
  tipo: 'numero' | 'fecha' | 'conjunto';
  /** fecha/conjunto: otras fechas ISO verdaderas que la respuesta puede decir sin fallar. */
  permitidas?: string[];
  /** conjunto de nombres: nombres del catálogo que, afirmados fuera del conjunto, cuentan como de más. */
  universo?: string[];
}

/**
 * - cifras: el caso se puntúa por sus anclas.
 * - alias_inexistente: correcto si pregunta o declara no resuelto el nombre (L09).
 * - aclaracion_d26 (D29): el primer turno debe ser la pregunta D26; las anclas se puntúan en el último turno.
 */
export type ModoCaso = 'cifras' | 'alias_inexistente' | 'aclaracion_d26';

export interface OpcionesPuntaje {
  modo?: ModoCaso;
  /** AAAA-MM-DD de la pregunta: se acepta como fecha de contexto y fija el año de «18 de mayo». */
  hoy?: string;
}

export interface PuntajeIntento {
  anclasEnResultados: boolean[];
  anclasEnRespuesta: boolean[];
  seleccionCorrecta: boolean;
  respuestaCorrecta: boolean;
  /** Fechas afirmadas que no están en ninguna ancla ni en el contexto (para el informe). */
  fechasDeMas: string[];
}

function numerosYFechas(valor: unknown, numeros: number[], textos: string[]): void {
  if (typeof valor === 'number') numeros.push(valor);
  else if (typeof valor === 'string') textos.push(valor);
  else if (Array.isArray(valor)) for (const v of valor) numerosYFechas(v, numeros, textos);
  else if (valor && typeof valor === 'object') for (const v of Object.values(valor)) numerosYFechas(v, numeros, textos);
}

const ES_ISO = /^\d{4}-\d{2}-\d{2}$/;

function miembros(a: Ancla): string[] {
  return Array.isArray(a.valor) ? a.valor : [String(a.valor)];
}

/** Fechas de contexto que la respuesta puede decir siempre: hoy y los límites de cada parte. */
function fechasDeContexto(turno: ResultadoTurno, hoy: string | undefined): Set<string> {
  const f = new Set<string>();
  if (hoy) f.add(hoy);
  for (const r of turno.resultados) {
    if (esResultadoFaltantesAplicacion(r)) { f.add(r.fecha_consulta); continue; }
    const periodo = esResultadoMonitoreo(r) || esResultadoAplicaciones(r) || esResultadoCantidades(r) || esResultadoCostos(r) || esResultadoLaborAplicacion(r) ? r.consulta : r.alcance;
    if (periodo.desde) f.add(periodo.desde);
    if (periodo.hasta) f.add(periodo.hasta);
  }
  return f;
}

/** Yearless dates need the supplied calendar context, never the evaluator's clock. */
function anioDeContexto(turno: ResultadoTurno, hoy: string | undefined): number {
  const first = turno.resultados[0];
  const hasta = first ? esResultadoFaltantesAplicacion(first) ? first.fecha_consulta : esResultadoMonitoreo(first) || esResultadoAplicaciones(first) || esResultadoCantidades(first) || esResultadoCostos(first) || esResultadoLaborAplicacion(first) ? first.consulta.hasta : first.alcance.hasta : '';
  return Number.parseInt((hoy ?? hasta ?? '').slice(0, 4), 10);
}

/** Fechas que la respuesta afirma y que ninguna ancla de fecha o conjunto cubre. */
export function fechasDeMas(respuesta: string, anclas: Ancla[], turno: ResultadoTurno, hoy: string | undefined): string[] {
  const anclasFecha = anclas.filter((a) => a.tipo === 'fecha' || a.tipo === 'conjunto');
  if (anclasFecha.length === 0) return [];
  const anio = anioDeContexto(turno, hoy);
  const aceptadas = fechasDeContexto(turno, hoy);
  for (const a of anclasFecha) {
    for (const m of miembros(a)) if (ES_ISO.test(m)) aceptadas.add(m);
    for (const p of a.permitidas ?? []) aceptadas.add(p);
  }
  return [...extraerFechas(respuesta, anio)].filter((f) => !aceptadas.has(f)).sort();
}

function nombrePresente(nombre: string, respuesta: string): boolean {
  return normalizar(respuesta).includes(normalizar(nombre));
}

export function puntuarIntento(turno: ResultadoTurno, anclas: Ancla[], opciones: OpcionesPuntaje = {}): PuntajeIntento {
  const modo = opciones.modo ?? 'cifras';
  const numeros: number[] = [];
  const textos: string[] = [];
  numerosYFechas(turno.resultados, numeros, textos);
  const enResultados = anclas.map((a) => {
    if (a.tipo === 'numero') return numeroCerca(Number(a.valor), a.tol, numeros);
    // Fecha y conjunto: igualdad exacta con una cadena del resultado (o con el nombre, normalizado).
    return miembros(a).every((m) => (ES_ISO.test(m) ? textos.includes(m) : textos.some((t) => normalizar(t) === normalizar(m))));
  });
  const numsRespuesta = extraerNumeros(turno.respuesta);
  // Presence and extra-date checks must interpret dates identically, including both
  // endpoints of a range. The numeric-anchor helper also accepts bare quantity ranges.
  const fechasRespuesta = extraerFechas(turno.respuesta, anioDeContexto(turno, opciones.hoy));
  const deMas = fechasDeMas(turno.respuesta, anclas, turno, opciones.hoy);
  const enRespuesta = anclas.map((a) => {
    if (a.tipo === 'numero') return numeroCerca(Number(a.valor), a.tol, numsRespuesta);
    const todos = miembros(a).every((m) => (ES_ISO.test(m) ? fechasRespuesta.has(m) : nombrePresente(m, turno.respuesta)));
    if (!todos) return false;
    if (a.tipo === 'conjunto' && a.universo) {
      const propios = new Set(miembros(a).map(normalizar));
      if (a.universo.some((n) => !propios.has(normalizar(n)) && nombrePresente(n, turno.respuesta))) return false;
    }
    // Una fecha de más hace fallar a toda ancla de fecha o conjunto: el conjunto afirmado no es el de la referencia.
    return deMas.length === 0;
  });

  if (modo === 'alias_inexistente') {
    // Caso de alias inexistente: correcto si pidió aclaración o si el ejecutor reportó el nombre como no resuelto.
    const declaro = turno.origen === 'aclaracion' || turno.resultados.some((r) => r.estado === 'no_resuelto');
    return { anclasEnResultados: [], anclasEnRespuesta: [], seleccionCorrecta: declaro, respuestaCorrecta: declaro, fechasDeMas: [] };
  }
  return {
    anclasEnResultados: enResultados,
    anclasEnRespuesta: enRespuesta,
    seleccionCorrecta: enResultados.every(Boolean),
    respuestaCorrecta: enRespuesta.every(Boolean),
    fechasDeMas: deMas,
  };
}

/** ¿Este turno es la pregunta D26 («puede ser la categoría … o las tareas …»)? */
export function esAclaracionD26(turno: ResultadoTurno): boolean {
  return turno.origen === 'aclaracion' && (turno.respuesta.includes(MARCA)||turno.respuesta.includes('¿Quieres consultar las tareas')||turno.respuesta.includes('¿Quieres consultar la tarea'));
}

/**
 * Puntúa un caso de varios turnos. Solo `aclaracion_d26` mira más de un turno:
 * el primero tiene que ser la pregunta D26 (D29: «cosecha» sola nunca se adivina) y las
 * anclas se puntúan en el último, que es la respuesta a esa pregunta.
 */
export function puntuarCaso(turnos: ResultadoTurno[], anclas: Ancla[], opciones: OpcionesPuntaje = {}): PuntajeIntento {
  if (opciones.modo !== 'aclaracion_d26') return puntuarIntento(turnos[0], anclas, opciones);
  const pregunto = esAclaracionD26(turnos[0]);
  const ultimo = turnos.length > 1 ? puntuarIntento(turnos[turnos.length - 1], anclas, { ...opciones, modo: 'cifras' }) : null;
  return {
    anclasEnResultados: ultimo?.anclasEnResultados ?? [],
    anclasEnRespuesta: ultimo?.anclasEnRespuesta ?? [],
    seleccionCorrecta: pregunto && ultimo !== null && ultimo.seleccionCorrecta,
    respuestaCorrecta: pregunto && ultimo !== null && ultimo.respuestaCorrecta,
    fechasDeMas: ultimo?.fechasDeMas ?? [],
  };
}
