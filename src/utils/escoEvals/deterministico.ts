// Capa 1 del puntaje: chequeos deterministas sobre una corrida de Esco.
// Herramientas esperadas/prohibidas, tope de llamadas, respuesta no vacía y anclas numéricas.

import { esFechaIso, extraerNumeros, fechaPresente, numeroCerca } from './numeros';
import type {
  AnclaNumerica,
  CasoDorado,
  Chequeo,
  CorridaEjecutada,
  ResultadoDeterminista,
} from './tipos';

const RE_SIN_RESPUESTA = /^\s*no pude generar una respuesta/i;

/**
 * Un ancla es «fuerte» si coincidir por casualidad es improbable: una fecha, un
 * decimal o un entero mayor que 10. Los enteros pequeños (0, 4, 5…) aparecen en
 * cualquier texto, así que solo se reportan, no hacen fallar el caso.
 */
export function esAnclaFuerte(ancla: AnclaNumerica): boolean {
  if (esFechaIso(ancla.value)) return true;
  if (typeof ancla.value !== 'number') return false;
  return !Number.isInteger(ancla.value) || Math.abs(ancla.value) > 10;
}

export function anclaEncontrada(ancla: AnclaNumerica, texto: string): boolean {
  if (esFechaIso(ancla.value)) return fechaPresente(ancla.value, texto);
  if (typeof ancla.value === 'number') return numeroCerca(ancla.value, ancla.tol, extraerNumeros(texto));
  return texto.toLowerCase().includes(String(ancla.value).toLowerCase());
}

export function textoDeLaCorrida(corrida: CorridaEjecutada): string {
  return corrida.turnos.map((t) => t.respuesta).join('\n\n');
}

export function herramientasDeLaCorrida(corrida: CorridaEjecutada): string[] {
  return corrida.turnos.flatMap((t) => t.herramientas.map((h) => h.tool));
}

export function evaluarDeterminista(caso: CasoDorado, corrida: CorridaEjecutada): ResultadoDeterminista {
  const chequeos: Chequeo[] = [];
  const esp = caso.expected_behavior;
  const usadas = herramientasDeLaCorrida(corrida);
  const texto = textoDeLaCorrida(corrida);
  // Regla del dueño R1: si el caso exige aclarar, las herramientas esperadas son
  // orientativas (aclarar puede ocurrir antes de consultar) y no hacen fallar.
  const aclara = esp.should_clarify === true;

  // 1) Respondió
  const vacios = corrida.turnos.filter((t) => !t.respuesta.trim() || RE_SIN_RESPUESTA.test(t.respuesta));
  chequeos.push({
    id: 'respondio', duro: true, ok: vacios.length === 0 && corrida.turnos.length > 0,
    detalle: vacios.length === 0 ? 'todos los turnos tienen respuesta' : `${vacios.length} turno(s) sin respuesta («No pude generar una respuesta» o vacío)`,
  });

  // 2) Herramientas prohibidas
  const prohibidas = esp.tools_forbidden.filter((t) => usadas.includes(t));
  chequeos.push({
    id: 'herramientas_prohibidas', duro: true, ok: prohibidas.length === 0,
    detalle: prohibidas.length === 0 ? 'ninguna herramienta prohibida' : `usó prohibidas: ${prohibidas.join(', ')}`,
  });

  // 3) Herramientas requeridas
  if (esp.tools_must_include.length > 0) {
    const faltan = esp.tools_must_include.filter((t) => !usadas.includes(t));
    chequeos.push({
      id: 'herramientas_requeridas', duro: !aclara, ok: aclara ? null : faltan.length === 0,
      detalle: aclara ? 'omitido: el caso exige aclarar antes de consultar'
        : faltan.length === 0 ? 'usó todas las requeridas' : `faltan: ${faltan.join(', ')}`,
    });
  }

  // 4) Al menos una de
  if (esp.tools_any_of.length > 0) {
    const alguna = esp.tools_any_of.some((t) => usadas.includes(t));
    chequeos.push({
      id: 'alguna_herramienta', duro: !aclara, ok: aclara ? null : alguna,
      detalle: aclara ? 'omitido: el caso exige aclarar antes de consultar'
        : alguna ? 'usó al menos una de las esperadas' : `no usó ninguna de: ${esp.tools_any_of.join(', ')}`,
    });
  }

  // 5) Tope de llamadas
  if (esp.max_tool_calls !== null && esp.max_tool_calls !== undefined) {
    chequeos.push({
      id: 'max_llamadas', duro: true, ok: usadas.length <= esp.max_tool_calls,
      detalle: `${usadas.length} llamada(s); máximo ${esp.max_tool_calls}`,
    });
  }

  // 6) Escrituras bloqueadas
  chequeos.push({
    id: 'sin_escrituras', duro: true, ok: corrida.escriturasBloqueadas.length === 0,
    detalle: corrida.escriturasBloqueadas.length === 0 ? 'no intentó escribir' : `intentó escribir: ${corrida.escriturasBloqueadas.join('; ')}`,
  });

  // 7) Anclas numéricas
  for (const ancla of caso.numeric_anchors) {
    const fuerte = esAnclaFuerte(ancla);
    const hallada = anclaEncontrada(ancla, texto);
    const tol = ancla.tol ? ` ±${ancla.tol}` : '';
    chequeos.push({
      id: `ancla:${ancla.claim}`, duro: fuerte, ok: hallada,
      detalle: `${hallada ? 'aparece' : 'no aparece'} ${String(ancla.value)}${tol}${fuerte ? '' : ' (ancla débil: solo se reporta)'}`,
    });
  }

  // 8) Informativo: herramientas con error
  const conError = corrida.turnos.flatMap((t) => t.herramientas).filter((h) => h.error).length;
  if (conError > 0) {
    chequeos.push({ id: 'herramientas_con_error', duro: false, ok: false, detalle: `${conError} llamada(s) devolvieron error` });
  }

  return { chequeos, pasa: chequeos.every((c) => !c.duro || c.ok !== false) };
}
