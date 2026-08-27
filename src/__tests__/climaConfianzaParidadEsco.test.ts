import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

/**
 * Paridad de la puerta de confianza de la lluvia: frontend ⇄ Esco.
 *
 * `src/utils/calculosClima.ts` (`lluviaConfiableDeResumen` + `esCotaInferior`) y
 * `chat.tsx` (`lluviaConfiable`) contestan la MISMA pregunta — "¿cuántos mm
 * puedo afirmar de este día?" — sobre la MISMA tabla. El comentario de
 * `chat.tsx` se declara explícitamente "espejo" del primero. No pueden
 * importarse entre sí: `chat.tsx` vive en el árbol de despliegue de la edge
 * function, con imports de Deno. Misma restricción que ya produjo
 * `priorizacion-scouting.ts` y `reportes-financieros.ts`.
 *
 * **Un espejo declarado que nadie vigila deja de ser un espejo.** El PR #178
 * (migración 122) movió el original y no el espejo, y durante ese lapso Esco
 * descartó 25 días con 90,63 mm de lluvia medida que la pantalla sí mostraba:
 * abril de 2026 daba 514,35 mm por Esco contra 588,50 mm en la vista de Clima.
 * Es la misma clase de defecto del incidente del 2026-08-16, donde Esco
 * reportó "47 días sin lluvia" habiendo llovido 4 días antes.
 *
 * Por eso esto es una prueba y no un comentario.
 */

const RAIZ = resolve(__dirname, '../..');

const COPIAS_ESCO = [
  'src/supabase/functions/server/chat.tsx',
  'supabase/functions/make-server-1ccce916/chat.tsx',
];

function leer(rel: string): string {
  return readFileSync(resolve(RAIZ, rel), 'utf-8');
}

/** Cuerpo de `lluviaConfiable(...)` en una copia de `chat.tsx`. */
function cuerpoLluviaConfiable(fuente: string): string {
  const inicio = fuente.indexOf('function lluviaConfiable(');
  expect(inicio, 'chat.tsx debe seguir declarando lluviaConfiable()').toBeGreaterThan(-1);
  const fin = fuente.indexOf('\n}', inicio);
  return fuente.slice(inicio, fin);
}

/** Línea de la consulta PostgREST de "última lluvia" en `chat.tsx`. */
function consultaUltimaLluvia(fuente: string): string {
  const linea = fuente
    .split('\n')
    .find((l) => l.includes('lluvia_total_mm=gt.0') && l.includes('order=fecha.desc'));
  expect(linea, 'chat.tsx debe seguir teniendo la consulta de última lluvia').toBeDefined();
  return linea as string;
}

describe('paridad de la puerta de confianza de lluvia (frontend ⇄ Esco)', () => {
  it('el frontend descarta EXACTAMENTE `contador_congelado` — si esto cambia, hay que mover el espejo', () => {
    const fuente = leer('src/utils/calculosClima.ts');
    const m = fuente.match(/const CONFIANZAS_SIN_DATO = new Set\(\[([^\]]*)\]\)/);
    expect(m, 'calculosClima.ts debe seguir declarando CONFIANZAS_SIN_DATO').not.toBeNull();
    const etiquetas = (m as RegExpMatchArray)[1]
      .split(',')
      .map((s) => s.trim().replace(/^['"]|['"]$/g, ''))
      .filter(Boolean);
    expect(etiquetas).toEqual(['contador_congelado']);
  });

  it.each(COPIAS_ESCO)('%s: `lluviaConfiable` descarta `contador_congelado`', (rel) => {
    expect(cuerpoLluviaConfiable(leer(rel))).toContain("=== 'contador_congelado'");
  });

  it.each(COPIAS_ESCO)(
    '%s: `lluviaConfiable` NO descarta `cobertura_parcial` en bloque — sólo la cota inferior de 0 mm (migración 122)',
    (rel) => {
      const cuerpo = cuerpoLluviaConfiable(leer(rel));
      // El descarte en bloque es exactamente lo que el PR #178 dejó atrás.
      expect(cuerpo).not.toMatch(/if \(fila\.lluvia_confianza === 'cobertura_parcial'\) return null;/);
      // Y la cota inferior de 0 mm sí tiene que seguir valiendo "sin dato".
      expect(cuerpo).toMatch(/esCotaInferior\(fila\)[\s\S]*lluvia_total_mm === 0[\s\S]*return null/);
    },
  );

  it.each(COPIAS_ESCO)(
    '%s: la última lluvia no se busca con `eq.ok` — eso se salta `reconstruido` y `cobertura_parcial`',
    (rel) => {
      const linea = consultaUltimaLluvia(leer(rel));
      expect(linea).not.toContain('lluvia_confianza=eq.ok');
      // `reconstruido` es un valor de plena confianza desde la 122: si la
      // consulta no lo admite, un día de lluvia reconstruida es invisible y la
      // racha seca que reporta Esco se alarga sola.
      expect(linea).toContain('reconstruido');
    },
  );

  it.each(COPIAS_ESCO)(
    '%s: el conteo de días sin dato pasa por `lluviaConfiable`, no por la etiqueta cruda',
    (rel) => {
      const fuente = leer(rel);
      expect(fuente).toContain('diasSinDatoDesdeEntonces = (desdeRaw ?? []).filter((d) => lluviaConfiable(d) === null).length');
    },
  );

  it('las dos copias de `chat.tsx` dicen lo mismo sobre la lluvia', () => {
    const [a, b] = COPIAS_ESCO.map(leer);
    expect(cuerpoLluviaConfiable(b)).toBe(cuerpoLluviaConfiable(a));
    expect(consultaUltimaLluvia(b)).toBe(consultaUltimaLluvia(a));
  });
});
