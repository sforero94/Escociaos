// ARCHIVO: __tests__/rondaBorradorVentanaCorreccion.test.ts
// DESCRIPCIÓN: Regresión de ESCO-62 — un borrador `preview_pendiente` de la
// ronda de inventario se tragaba TODO mensaje de texto posterior de ese
// usuario de Telegram, SIN NINGÚN LÍMITE DE EDAD.
//
// Evidencia viva (`rondas_transcritos`, id 98e62e81-…, consultada
// 2026-09-04, la fila sigue igual):
//
//   created_at 2026-08-28T23:29:21.471Z   estado sin_confirmar   intentos 4
//   correcciones[0] 2026-08-28T23:29:51.043Z  «Si, es 15 15 15, un fertilizante»
//   correcciones[1] 2026-08-29T02:15:11.797Z  «Cuéntame qué pasó esta semana …»
//   correcciones[2] 2026-08-29T02:15:39.394Z  «Cómo nos fue esta semana …»
//
// Las dos últimas son preguntas para Esco, no correcciones de inventario:
// llegaron 2 h 45 min DESPUÉS de la nota de voz y el bucle de preview las
// consumió igual (`bot.ts` nunca llama `next()` cuando hay un pendiente).
// Agotaron `MAX_INTENTOS_PREVIEW` y el hallazgo narrado terminó
// `sin_confirmar` — la línea «1 hallazgo(s) narrado(s) sin confirmar» del
// reporte de cierre de esa ronda ES esa pérdida.
//
// El arreglo acota la consulta de `obtenerTranscritoPendienteMasReciente`
// con una ventana de `MINUTOS_VENTANA_CORRECCION_TEXTO`. NO muta la fila
// (CA-37: un borrador sin confirmar sobrevive a un redespliegue y sigue
// contando como hallazgo narrado sin confirmar; nunca expira solo) — deja
// de CAPTURAR texto, nada más.
//
// Este archivo tiene dos mitades:
//   1. Unit sobre los helpers puros de `@/utils/rondaInventario/preview`.
//   2. Guard estático sobre los DOS árboles de edge function: ni
//      `ronda-helpers.ts` ni `bot.ts` se pueden importar desde vitest
//      (importan `jsr:@supabase/supabase-js@2` y `grammy`), así que la
//      protección contra una regresión ahí es textual.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  MINUTOS_VENTANA_CORRECCION_TEXTO,
  limiteVentanaCorreccionTexto,
  correccionPorTextoVigente,
  horaBogota,
} from '@/utils/rondaInventario/preview';

/** La fila real de la traza, en UTC. */
const CREADO_EN = '2026-08-28T23:29:21.471Z';
const CORRECCION_LEGITIMA = '2026-08-28T23:29:51.043Z'; // +30 s
const PREGUNTA_A_ESCO_1 = '2026-08-29T02:15:11.797Z'; // +2 h 45 min 50 s
const PREGUNTA_A_ESCO_2 = '2026-08-29T02:15:39.394Z'; // +2 h 46 min 18 s

describe('ESCO-62 — ventana de vigencia del borrador para correcciones por texto', () => {
  it('la ventana es de 30 minutos', () => {
    expect(MINUTOS_VENTANA_CORRECCION_TEXTO).toBe(30);
  });

  it('la corrección legítima de la traza (+30 s) SÍ cae dentro de la ventana', () => {
    expect(correccionPorTextoVigente(CREADO_EN, new Date(CORRECCION_LEGITIMA))).toBe(true);
  });

  it('las dos preguntas a Esco de la traza (+2 h 45 min) quedan FUERA de la ventana', () => {
    expect(correccionPorTextoVigente(CREADO_EN, new Date(PREGUNTA_A_ESCO_1))).toBe(false);
    expect(correccionPorTextoVigente(CREADO_EN, new Date(PREGUNTA_A_ESCO_2))).toBe(false);
  });

  it('el borde es inclusivo a los 30 min exactos y excluyente un milisegundo después', () => {
    const creado = new Date(CREADO_EN).getTime();
    const treintaMin = MINUTOS_VENTANA_CORRECCION_TEXTO * 60 * 1000;
    expect(correccionPorTextoVigente(CREADO_EN, new Date(creado + treintaMin))).toBe(true);
    expect(correccionPorTextoVigente(CREADO_EN, new Date(creado + treintaMin + 1))).toBe(false);
  });

  it('limiteVentanaCorreccionTexto devuelve el instante ISO desde el que un borrador sigue capturando texto', () => {
    const ahora = new Date('2026-08-29T02:15:11.797Z');
    expect(limiteVentanaCorreccionTexto(ahora)).toBe('2026-08-29T01:45:11.797Z');
    // Y el borrador de la traza queda por debajo de ese corte, que es
    // exactamente lo que hace que el `.gte('created_at', …)` no lo devuelva.
    expect(CREADO_EN < limiteVentanaCorreccionTexto(ahora)).toBe(true);
  });

  it('horaBogota convierte el instante UTC de la nota a la hora de pared del verificador', () => {
    // 23:29 UTC = 18:29 en Bogotá (UTC-5, sin horario de verano).
    expect(horaBogota(CREADO_EN)).toBe('18:29');
    // Cruce de día hacia atrás: 02:15 UTC del 29 son las 21:15 del 28.
    expect(horaBogota(PREGUNTA_A_ESCO_1)).toBe('21:15');
  });
});

// ---------------------------------------------------------------------------
// Guard estático sobre los dos árboles de edge function
// ---------------------------------------------------------------------------

const ARBOLES_EDGE = [
  'src/supabase/functions/server',
  'supabase/functions/make-server-1ccce916',
];

function leer(arbol: string, relativo: string): string {
  return readFileSync(join(process.cwd(), arbol, relativo), 'utf8');
}

/** Cuerpo de `obtenerTranscritoPendienteMasReciente` — desde su declaración
 * hasta el siguiente `export ` del archivo. */
function cuerpoDelHelper(fuente: string): string {
  const inicio = fuente.indexOf('export async function obtenerTranscritoPendienteMasReciente');
  expect(inicio).toBeGreaterThan(-1);
  const siguiente = fuente.indexOf('\nexport ', inicio + 1);
  return fuente.slice(inicio, siguiente === -1 ? undefined : siguiente);
}

describe('ESCO-62 — guard estático: la consulta del borrador pendiente está acotada en el tiempo', () => {
  for (const arbol of ARBOLES_EDGE) {
    it(`${arbol}/telegram/ronda-helpers.ts acota por created_at con la constante compartida`, () => {
      const cuerpo = cuerpoDelHelper(leer(arbol, 'telegram/ronda-helpers.ts'));
      // Sin este predicado, un borrador de hace tres horas (o tres días)
      // sigue interceptando cada mensaje de texto del verificador.
      expect(cuerpo).toContain(".gte('created_at'");
      expect(cuerpo).toContain('limiteVentanaCorreccionTexto()');
      // El `created_at` tiene que venir en el SELECT: el aviso de
      // intercepción le dice a Uriel de qué nota se trata.
      expect(cuerpo).toContain('actor_telegram_id, created_at');
    });

    it(`${arbol}/telegram/ronda-helpers.ts importa la ventana del módulo puro, no la redefine`, () => {
      const fuente = leer(arbol, 'telegram/ronda-helpers.ts');
      expect(fuente).toContain('limiteVentanaCorreccionTexto');
      expect(fuente).toContain("from '../rondaInventario/preview.ts'");
    });

    it(`${arbol}/telegram/bot.ts avisa que está tomando el texto como corrección`, () => {
      const fuente = leer(arbol, 'telegram/bot.ts');
      // La intercepción nunca es silenciosa mientras sigue vigente: el
      // mensaje nombra la hora de la nota y la salida ("cancelar").
      expect(fuente).toContain('como corrección de tu nota de las');
      expect(fuente).toContain('horaBogota(');
    });
  }
});
