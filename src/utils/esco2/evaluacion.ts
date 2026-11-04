// Puntuación determinista de M2.5. Separa dos etapas:
//  - selección: ¿el plan + ejecutor produjeron las cifras de referencia? (operación y argumentos)
//  - respuesta: ¿el texto publicado afirma esas cifras?
// El juicio de "must"/"must_not" que no es numérico se revisa a mano y se registra aparte.

import { extraerNumeros, fechaPresente, numeroCerca } from '../escoEvals/numeros.ts';
import type { ResultadoTurno } from './nucleo.ts';

export interface Ancla {
  claim: string;
  valor: number | string;
  tol: number | null;
  tipo: 'numero' | 'fecha';
}

export interface PuntajeIntento {
  anclasEnResultados: boolean[];
  anclasEnRespuesta: boolean[];
  seleccionCorrecta: boolean;
  respuestaCorrecta: boolean;
}

function numerosYFechas(valor: unknown, numeros: number[], textos: string[]): void {
  if (typeof valor === 'number') numeros.push(valor);
  else if (typeof valor === 'string') textos.push(valor);
  else if (Array.isArray(valor)) for (const v of valor) numerosYFechas(v, numeros, textos);
  else if (valor && typeof valor === 'object') for (const v of Object.values(valor)) numerosYFechas(v, numeros, textos);
}

export function puntuarIntento(turno: ResultadoTurno, anclas: Ancla[], esperaAclaracion = false): PuntajeIntento {
  const numeros: number[] = [];
  const textos: string[] = [];
  numerosYFechas(turno.resultados, numeros, textos);
  const enResultados = anclas.map((a) => (a.tipo === 'fecha' ? textos.includes(String(a.valor)) : numeroCerca(Number(a.valor), a.tol, numeros)));
  const numsRespuesta = extraerNumeros(turno.respuesta);
  const enRespuesta = anclas.map((a) => (a.tipo === 'fecha' ? fechaPresente(String(a.valor), turno.respuesta) : numeroCerca(Number(a.valor), a.tol, numsRespuesta)));

  if (esperaAclaracion) {
    // Caso de alias inexistente: correcto si pidió aclaración o si el ejecutor reportó el nombre como no resuelto.
    const declaro = turno.origen === 'aclaracion' || turno.resultados.some((r) => r.estado === 'no_resuelto');
    return { anclasEnResultados: [], anclasEnRespuesta: [], seleccionCorrecta: declaro, respuestaCorrecta: declaro };
  }
  return {
    anclasEnResultados: enResultados,
    anclasEnRespuesta: enRespuesta,
    seleccionCorrecta: enResultados.every(Boolean),
    respuestaCorrecta: enRespuesta.every(Boolean),
  };
}
