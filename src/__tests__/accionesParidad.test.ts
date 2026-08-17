/**
 * ARCHIVO: __tests__/accionesParidad.test.ts
 * DESCRIPCIÓN: Guardián de los espejos del motor de acciones recomendadas.
 *
 * `src/utils/acciones*.ts` es la fuente. Las copias de
 * `src/supabase/functions/server/` y `supabase/functions/make-server-1ccce916/`
 * son artefactos generados por `docs/acciones/regenerar-copias-acciones.sh`.
 *
 * Este test es TEXTUAL, no de comportamiento, y esa elección es deliberada.
 * Los tests de paridad que ya existen en el repo (`reportesFinancierosParidad`,
 * `priorizacionScoutingParidad`) comparan resultados porque allí las dos
 * implementaciones se escribieron a mano por separado. Aquí no: la copia se
 * genera, así que la única divergencia posible es que alguien la haya editado
 * a mano -- exactamente lo que el CLAUDE.md raíz prohíbe ("nunca se edita a
 * mano una copia para callar una falla de paridad: se regenera"). Comparar el
 * texto atrapa eso siempre; comparar comportamiento sólo lo atraparía si el
 * caso editado estuviera cubierto por una fixture.
 *
 * Si este test falla, la corrección NO es tocar la copia:
 *
 *     bash docs/acciones/regenerar-copias-acciones.sh
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const RAIZ = resolve(__dirname, '../..');
const FUENTE = resolve(RAIZ, 'src/utils');
const SERVER = resolve(RAIZ, 'src/supabase/functions/server');
const ESPEJO = resolve(RAIZ, 'supabase/functions/make-server-1ccce916');

/** Los módulos que el generador conoce. `accionesHechos` todavía no existe
 *  (Fase 1, segunda ola); el test lo salta en vez de fallar, para no bloquear
 *  la entrega parcial -- pero en cuanto exista queda cubierto sin tocar nada. */
const MODULOS = [
  'accionesTipos',
  'accionesValidador',
  'accionesOrden',
  'accionesRender',
  'accionesHechos',
] as const;

function kebab(modulo: string): string {
  return modulo.replace(/^acciones/, 'acciones-').toLowerCase();
}

/** Reproduce exactamente la transformación del generador: reescribe los
 *  imports relativos entre módulos del motor a kebab-case con extensión
 *  `.ts`, que es lo único que Deno necesita distinto. */
function aDeno(fuente: string): string {
  let salida = fuente;
  for (const otro of MODULOS) {
    salida = salida
      .split(`from './${otro}'`)
      .join(`from './${kebab(otro)}.ts'`)
      .split(`from "./${otro}"`)
      .join(`from "./${kebab(otro)}.ts"`);
  }
  return salida;
}

describe('espejos del motor de acciones', () => {
  for (const modulo of MODULOS) {
    const rutaFuente = resolve(FUENTE, `${modulo}.ts`);
    const rutaServer = resolve(SERVER, `${kebab(modulo)}.ts`);
    const rutaEspejo = resolve(ESPEJO, `${kebab(modulo)}.ts`);

    const existe = existsSync(rutaFuente);
    const pruebaOSalta = existe ? it : it.skip;

    pruebaOSalta(`${modulo}.ts → ${kebab(modulo)}.ts: la copia del server es la generada`, () => {
      expect(existsSync(rutaServer)).toBe(true);
      const esperado = aDeno(readFileSync(rutaFuente, 'utf8'));
      const real = readFileSync(rutaServer, 'utf8');
      expect(real).toBe(esperado);
    });

    pruebaOSalta(`${kebab(modulo)}.ts: el espejo del edge function es byte-idéntico al server`, () => {
      expect(existsSync(rutaEspejo)).toBe(true);
      expect(readFileSync(rutaEspejo, 'utf8')).toBe(readFileSync(rutaServer, 'utf8'));
    });

    pruebaOSalta(`${kebab(modulo)}.ts: los imports del motor llevan extensión .ts (Deno)`, () => {
      const real = readFileSync(rutaServer, 'utf8');
      // Ningún import relativo a otro módulo del motor puede quedar sin `.ts`:
      // Deno lo rechaza en tiempo de carga y el fallo aparecería en el deploy,
      // no aquí.
      for (const otro of MODULOS) {
        expect(real).not.toContain(`from './${otro}'`);
        expect(real).not.toContain(`from "./${otro}"`);
      }
    });
  }

  it('el generador cubre todos los módulos del motor que existen', () => {
    // Si alguien añade `accionesX.ts` y olvida meterlo en el generador, la
    // copia nunca se crea y nadie se entera hasta el deploy. Este test lo
    // convierte en una falla local e inmediata.
    const guionado = readFileSync(
      resolve(RAIZ, 'docs/acciones/regenerar-copias-acciones.sh'),
      'utf8',
    );
    const enDisco = MODULOS.filter((m) => existsSync(resolve(FUENTE, `${m}.ts`)));
    expect(enDisco.length).toBeGreaterThan(0);
    for (const modulo of enDisco) {
      expect(guionado).toContain(modulo);
    }
  });
});
