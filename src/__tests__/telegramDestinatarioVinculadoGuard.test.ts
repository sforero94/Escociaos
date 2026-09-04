/**
 * Guarda estatica: ningun resolvedor de destinatarios de Telegram puede
 * empujar el `telegram_id` de un usuario SIN VINCULAR.
 *
 * `telegram_usuarios.telegram_id` es NULL mientras la persona no canjea su
 * codigo de vinculacion. Una suscripcion en `telegram_alertas_suscripciones`
 * se puede crear antes de ese canje, asi que un suscrito puede estar
 * `activo = true` y con `telegram_id` en NULL a la vez. `String(null)` es la
 * cadena "null", que se cuela en la lista de destinatarios como si fuera un
 * chat real.
 *
 * El dano no es el envio fallido, es lo que ese fantasma tapa: los trabajos
 * del tick de la ronda reclaman su clave en `rondas_avisos` ANTES de enviar
 * (§8.1 del brief tecnico), y solo se saltan el reclamo cuando
 * `destinatarios.length === 0`. Un destinatario fantasma hace que ese guardia
 * nunca dispare, el aviso queda marcado como enviado y no se reintenta jamas.
 *
 * `obtenerDestinatariosModuloRonda` (telegram/ronda-helpers.ts) ya lo filtra
 * con `.not('telegram_id', 'is', null)` y entra en la lista como control
 * positivo: si algun dia se le quitara el filtro, este test tambien se pone
 * rojo.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const RAIZ = resolve(__dirname, '../..');

/** Cada entrada: fichero + la funcion que resuelve destinatarios en el. */
const RESOLVEDORES: ReadonlyArray<{ fichero: string; funcion: string }> = [
  { fichero: 'src/supabase/functions/server/ronda-inventario-tick.ts', funcion: 'resolverDestinatarios' },
  { fichero: 'supabase/functions/make-server-1ccce916/ronda-inventario-tick.ts', funcion: 'resolverDestinatarios' },
  { fichero: 'src/supabase/functions/server/hato-alertas-tick.ts', funcion: 'resolverFilasSuscripcion' },
  { fichero: 'supabase/functions/make-server-1ccce916/hato-alertas-tick.ts', funcion: 'resolverFilasSuscripcion' },
  { fichero: 'src/supabase/functions/server/telegram/ronda-helpers.ts', funcion: 'obtenerDestinatariosModuloRonda' },
  { fichero: 'supabase/functions/make-server-1ccce916/telegram/ronda-helpers.ts', funcion: 'obtenerDestinatariosModuloRonda' },
];

/** Quita comentarios de linea y de bloque para no aceptar una guarda que solo
 * existe dentro de un comentario que la explica. */
function sinComentarios(fuente: string): string {
  return fuente.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');
}

/** Cuerpo aproximado de la funcion: desde su declaracion hasta la siguiente
 * declaracion de nivel superior. Suficiente para una guarda estatica. */
function cuerpoDeFuncion(fuente: string, funcion: string): string | null {
  const inicio = fuente.search(new RegExp(`(async\\s+)?function\\s+${funcion}\\b`));
  if (inicio === -1) return null;
  const resto = fuente.slice(inicio);
  const siguiente = resto.slice(1).search(/^(export\s+)?(async\s+)?(function|const|interface|type)\s/m);
  return siguiente === -1 ? resto : resto.slice(0, siguiente + 1);
}

/** Una guarda valida: comparacion explicita contra null/undefined, o el
 * filtro de PostgREST `.not('...telegram_id', 'is', null)`. */
const GUARDA = /telegram_id\s*(?:===|==|!==|!=)\s*(?:null|undefined)|\.not\(\s*['"][\w.]*telegram_id['"]\s*,\s*['"]is['"]\s*,\s*null\s*\)/;

describe('destinatarios de Telegram: nunca un usuario sin vincular', () => {
  it('la lista de resolvedores no esta vacia', () => {
    expect(RESOLVEDORES.length).toBeGreaterThan(0);
  });

  for (const { fichero, funcion } of RESOLVEDORES) {
    it(`${fichero} :: ${funcion} filtra telegram_id nulo`, () => {
      const fuente = sinComentarios(readFileSync(resolve(RAIZ, fichero), 'utf-8'));

      // Non-vacuous: la funcion tiene que existir de verdad.
      expect(fuente).toContain(funcion);
      const cuerpo = cuerpoDeFuncion(fuente, funcion);
      expect(cuerpo, `no se encontro el cuerpo de ${funcion} en ${fichero}`).not.toBeNull();

      // Y tiene que mencionar telegram_id, o el cuerpo extraido no es el bueno.
      expect(cuerpo!).toContain('telegram_id');

      expect(
        GUARDA.test(cuerpo!),
        `${funcion} en ${fichero} empuja un telegram_id sin comprobar que no sea NULL. ` +
          'Un suscrito activo pero sin vincular entra como destinatario "null".',
      ).toBe(true);
    });
  }
});
