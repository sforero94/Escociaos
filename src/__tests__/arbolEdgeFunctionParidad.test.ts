/**
 * Guarda estructural: los DOS árboles de la edge function son el mismo árbol.
 *
 * `src/supabase/functions/server/` (donde se edita y donde apuntan los
 * imports de los tests) y `supabase/functions/make-server-1ccce916/` (lo que
 * `npx supabase functions deploy make-server-1ccce916` sube a producción) son
 * copias a mano una de la otra. El CLAUDE.md raíz lo dice desde siempre
 * ("both must stay in sync"), pero hasta acá esa regla la sostenían sólo dos
 * cosas frágiles: la memoria de quien edita, y `docs/hato/
 * regenerar-copias-servidor.py`, que **no tiene modo `--check`** -- reescribe
 * el árbol y la única forma de saber si había deriva era mirar `git status`
 * después.
 *
 * Las paridades que YA existen (`hatoAlertasParidadServidor`,
 * `importHatoParidadServidor`, `rondaInventarioParidadServidor`,
 * `calculosHatoParidad`, `accionesParidad`, `hatoLiquidacionPomarParidad`…)
 * cubren una FAMILIA de ficheros cada una, y hay que acordarse de agregar una
 * nueva cada vez que nace un módulo. Este test no cubre una familia: recorre
 * el árbol entero, así que un fichero nuevo queda cubierto sin que nadie haga
 * nada. Lo que verifica es más débil que esas paridades (compara texto, no
 * comportamiento) y por eso las complementa, no las reemplaza.
 *
 * Qué se considera "el mismo fichero":
 *  - Byte a byte, salvo dos diferencias legítimas y acotadas:
 *  - (a) la primera línea `// ARCHIVO: <ruta>` que estampan los generadores,
 *        que por construcción nombra la ruta de cada copia y por lo tanto
 *        DEBE diferir;
 *  - (b) el salto de línea final.
 *
 * El punto de entrada es la única excepción de nombre: `index.tsx` en el
 * árbol fuente, `index.ts` en el de despliegue.
 *
 * Si este test falla: NO edites una copia a mano para silenciarlo cuando la
 * deriva viene de un módulo generado -- editá el original en `src/utils/` y
 * corré su generador (`docs/hato/regenerar-copias-*.py`,
 * `docs/inventario/regenerar-copias-ronda-inventario.py`). Para los ficheros
 * que se escriben a mano en el árbol de la edge function, aplicá el mismo
 * cambio a las dos copias, que es lo que el CLAUDE.md raíz siempre pidió.
 */

import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

const RAIZ = resolve(__dirname, '../..');
const ARBOL_FUENTE = 'src/supabase/functions/server';
const ARBOL_DESPLIEGUE = 'supabase/functions/make-server-1ccce916';

/** Único par cuyo nombre difiere a propósito: el punto de entrada. */
const EXCEPCIONES_DE_NOMBRE: Record<string, string> = {
  'index.tsx': 'index.ts',
};

function listarModulos(raizAbsoluta: string, prefijo = ''): string[] {
  const salida: string[] = [];
  for (const entrada of readdirSync(join(raizAbsoluta, prefijo))) {
    const relativa = prefijo ? `${prefijo}/${entrada}` : entrada;
    if (statSync(join(raizAbsoluta, relativa)).isDirectory()) {
      salida.push(...listarModulos(raizAbsoluta, relativa));
    } else if (/\.tsx?$/.test(entrada)) {
      salida.push(relativa);
    }
  }
  return salida.sort();
}

/**
 * Normaliza para la comparación: quita la primera línea SÓLO si las dos
 * copias la tienen como banner `// ARCHIVO:` (nunca en otro caso, para que
 * una diferencia real en la línea 1 siga siendo una falla), y el salto final.
 */
function cuerpoComparable(fuente: string, despliegue: string): [string, string] {
  const esBanner = (texto: string) => texto.split('\n', 1)[0].startsWith('// ARCHIVO:');
  const sinBanner = (texto: string) => texto.slice(texto.indexOf('\n') + 1);
  const a = esBanner(fuente) && esBanner(despliegue) ? sinBanner(fuente) : fuente;
  const b = esBanner(fuente) && esBanner(despliegue) ? sinBanner(despliegue) : despliegue;
  return [a.replace(/\n+$/, ''), b.replace(/\n+$/, '')];
}

const modulosFuente = listarModulos(join(RAIZ, ARBOL_FUENTE));
const modulosDespliegue = listarModulos(join(RAIZ, ARBOL_DESPLIEGUE));

const equivalente = (relativa: string) => {
  const partes = relativa.split('/');
  const base = partes.pop() as string;
  const traducida = EXCEPCIONES_DE_NOMBRE[base] ?? base;
  return [...partes, traducida].join('/');
};

describe('paridad del árbol completo de la edge function', () => {
  it('el árbol fuente no está vacío (la guarda mide algo)', () => {
    expect(modulosFuente.length).toBeGreaterThan(50);
  });

  it('todo módulo del árbol fuente tiene su copia en el árbol de despliegue', () => {
    const faltantes = modulosFuente.filter(
      (relativa) => !modulosDespliegue.includes(equivalente(relativa)),
    );
    expect(faltantes).toEqual([]);
  });

  it('el árbol de despliegue no tiene módulos que el árbol fuente no tenga', () => {
    const equivalentesFuente = new Set(modulosFuente.map(equivalente));
    const sobrantes = modulosDespliegue.filter((relativa) => !equivalentesFuente.has(relativa));
    expect(sobrantes).toEqual([]);
  });

  it.each(modulosFuente)('%s es idéntico en los dos árboles', (relativa) => {
    const rutaDespliegue = join(RAIZ, ARBOL_DESPLIEGUE, equivalente(relativa));
    const fuente = readFileSync(join(RAIZ, ARBOL_FUENTE, relativa), 'utf8');
    const despliegue = readFileSync(rutaDespliegue, 'utf8');
    const [a, b] = cuerpoComparable(fuente, despliegue);
    expect(b).toBe(a);
  });
});
