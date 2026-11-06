// Tipos del ruteo de modelos (D25). Desde #415 (2026-11-04) no hay compositor LLM: el
// mensaje lo arma el render determinista y la única llamada al modelo es el planificador.
// La regla de ruta reforzada (`elegirRuta`) se retiró con el compositor (ESCO-173).
// `Ruta` sigue en la forma de la respuesta (`ResultadoTurno.ruta`, siempre null) porque
// la pantalla de prueba local la lee.

import type { Esfuerzo } from './llm.ts';

export interface ModeloEtapa {
  modelo: string;
  esfuerzo: Esfuerzo;
}

export type Ruta = 'habitual' | 'reforzada';
