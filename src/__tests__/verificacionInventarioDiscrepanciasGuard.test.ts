// ARCHIVO: __tests__/verificacionInventarioDiscrepanciasGuard.test.ts
// DESCRIPCIÓN: Guarda estática para D-2 (docs/plan_verificacion_inventario.md,
// Épica D — "Que Esco deje de inventar discrepancias").
//
// `execInventoryMovements` en `chat.tsx` contaba como discrepancia cualquier
// renglón de `verificaciones_detalle` con `diferencia !== 0`. Un renglón NO
// contado tiene `diferencia = NULL` (nunca se calculó), y en JavaScript
// `null !== 0` es `true` — así que los 223 renglones sin contar de la única
// verificación real (la exploración del 2026-07-30, 0 contados) entraban
// como si fueran 223 faltantes de inventario reales. Esco reportaba ese
// número al usuario.
//
// El arreglo: solo cuenta como discrepancia un renglón que SÍ se contó
// (`contado === true`) y cuya `diferencia` no es NULL y es distinta de cero.
//
// `chat.tsx` es código Deno de la edge function — no se puede importar ni
// ejecutar desde Vitest (imports de `npm:`/`https://deno.land/...`). El
// patrón establecido en este repo para ese caso es un guard estático sobre
// el texto del archivo, no una prueba de comportamiento en tiempo de
// ejecución (ver `jornalDivisorContract.test.ts`, `climaTablaCorrectaGuard.test.ts`).
// Éste sigue el mismo molde.
//
// La lógica también se ejercita aisladamente aquí como una función JS pura
// (misma expresión, copiada literal desde el archivo fuente) para probar el
// comportamiento real ante los casos límite: NULL, 0, contado=false con
// diferencia no nula (el bug original) y contado=true con diferencia real.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const RAIZ = join(__dirname, '..', '..');
const leer = (rel: string) => readFileSync(join(RAIZ, rel), 'utf-8');

const ARBOLES = [
  'src/supabase/functions/server/chat.tsx',
  'supabase/functions/make-server-1ccce916/chat.tsx',
];

/**
 * Es una discrepancia si el renglón SE CONTÓ y su diferencia real, ya
 * calculada, es distinta de cero. Copia literal de la expresión que vive en
 * `execInventoryMovements` en los dos árboles — si el archivo fuente cambia
 * esta expresión, hay que actualizar esta copia también (mismo criterio que
 * `jornalDivisorContract.test.ts` para el divisor del jornal).
 */
function esDiscrepancia(d: { contado?: boolean | null; diferencia?: number | null }): boolean {
  return d.contado === true && d.diferencia != null && Number(d.diferencia) !== 0;
}

describe('D-2 — comportamiento real de la regla de discrepancias', () => {
  it('un renglón NO contado (diferencia NULL) nunca es discrepancia — el bug original', () => {
    expect(esDiscrepancia({ contado: false, diferencia: null })).toBe(false);
    expect(esDiscrepancia({ contado: null, diferencia: null })).toBe(false);
  });

  it('223 renglones sin contar (contado=false, diferencia=NULL) dan 0 discrepancias', () => {
    const renglones = Array.from({ length: 223 }, () => ({ contado: false, diferencia: null }));
    expect(renglones.filter(esDiscrepancia)).toHaveLength(0);
  });

  it('un renglón contado y en cero no es discrepancia', () => {
    expect(esDiscrepancia({ contado: true, diferencia: 0 })).toBe(false);
  });

  it('un renglón contado con diferencia real SÍ es discrepancia', () => {
    expect(esDiscrepancia({ contado: true, diferencia: -3.5 })).toBe(true);
    expect(esDiscrepancia({ contado: true, diferencia: 12 })).toBe(true);
  });

  it('una diferencia distinta de cero sobre un renglón NO contado no cuenta (dato inconsistente, pero contado manda)', () => {
    expect(esDiscrepancia({ contado: false, diferencia: 5 })).toBe(false);
  });
});

describe('D-2 — guard estático en los dos árboles de edge function', () => {
  it.each(ARBOLES)('%s ya no usa el chequeo viejo `(d.diferencia as number) !== 0)` sin contado', (rel) => {
    const contenido = leer(rel);
    expect(contenido, `${rel} reintrodujo el chequeo viejo que cuenta NULL como discrepancia`).not.toMatch(
      /if\s*\(\s*\(d\.diferencia as number\)\s*!==\s*0\s*\)\s*\{/,
    );
  });

  it.each(ARBOLES)('%s exige contado===true antes de mirar la diferencia', (rel) => {
    const contenido = leer(rel);
    expect(contenido, `${rel} no exige d.contado === true en el filtro de discrepancias`).toMatch(
      /d\.contado\s*===\s*true/,
    );
    expect(contenido, `${rel} no descarta explícitamente diferencia == null`).toMatch(
      /d\.diferencia\s*!=\s*null/,
    );
  });

  it.each(ARBOLES)('%s selecciona `contado` en el query de verificaciones_detalle', (rel) => {
    const contenido = leer(rel);
    // El select embebido de verificaciones_detalle tiene que traer `contado`,
    // o el filtro de arriba siempre ve `undefined` y nunca cuenta nada -- el
    // mismo tipo de defecto silencioso que costó el hallazgo de la 103/122
    // (mirar sólo una señal cuando hace falta otra para decidir).
    //
    // El select trae un paréntesis anidado (`producto:productos(nombre)`),
    // así que un `[^)]*` simple se detiene en el paréntesis equivocado; esta
    // versión tolera un nivel de anidamiento.
    const match = contenido.match(/verificaciones_detalle\(((?:[^()]|\([^()]*\))*)\)/);
    expect(match, `${rel} no tiene el select embebido de verificaciones_detalle`).not.toBeNull();
    expect(match![1], `${rel} no incluye \`contado\` en el select de verificaciones_detalle`).toMatch(
      /\bcontado\b/,
    );
  });

  it('las dos copias calculan la discrepancia de forma idéntica (mismo criterio que jornalDivisorContract)', () => {
    const bloque = (rel: string) => {
      const contenido = leer(rel);
      const inicio = contenido.indexOf('async function execInventoryMovements');
      const fin = contenido.indexOf('async function execApplicationDetails');
      expect(inicio, `${rel}: no se encontró execInventoryMovements`).toBeGreaterThan(-1);
      expect(fin, `${rel}: no se encontró execApplicationDetails`).toBeGreaterThan(-1);
      return contenido.slice(inicio, fin).replace(/\s+/g, ' ');
    };
    expect(bloque(ARBOLES[0])).toBe(bloque(ARBOLES[1]));
  });
});
