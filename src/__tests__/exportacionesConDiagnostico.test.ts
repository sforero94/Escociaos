// Guarda estatica: toda pantalla que dispare una exportacion pesada tiene que
// poder decir POR QUE fallo.
//
// Origen (2026-09-08): las exportaciones tenian `catch {}` pelados con un
// toast fijo, asi que el modo de fallo mas comun -- un chunk retirado por un
// despliegue, con la pestania del usuario abierta desde antes -- era
// indistinguible de un error real. Sin esta guarda, el proximo boton de
// exportacion nace con el mismo `catch {}` y el problema vuelve en otra
// pantalla.
//
// POR QUE LA GUARDA MIRA AL LLAMADOR Y NO AL `import()`: el `import()` vive en
// `src/utils/` (el modulo de exportacion) y el `catch` vive en el componente,
// dos archivos distintos. Una guarda que exija las dos cosas en el MISMO
// archivo no encuentra nunca nada -- se probo, y pasaba en verde con un
// `catch {}` pelado recien puesto a mano.

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

function archivosFuente(dir: string, acc: string[] = []): string[] {
  for (const entrada of readdirSync(dir)) {
    const ruta = join(dir, entrada);
    if (statSync(ruta).isDirectory()) {
      // `src/supabase/` corre en Deno: no hay chunks ni navegador, asi que
      // esta clase de fallo no existe alli.
      if (entrada === 'supabase' || entrada === '__tests__') continue;
      archivosFuente(ruta, acc);
    } else if (/\.tsx?$/.test(entrada)) {
      acc.push(ruta);
    }
  }
  return acc;
}

/** Librerias que solo entran por `import()` dinamico, o sea en un chunk
 * aparte que un despliegue puede retirar. */
const IMPORT_DIFERIDO = /import\(\s*'(xlsx|jspdf|jspdf-autotable|html2canvas)'\s*\)/;

/** `export ... function nombre` / `export const nombre =` */
const EXPORTADAS = /export\s+(?:async\s+)?function\s+(\w+)|export\s+const\s+(\w+)\s*[:=]/g;

const HELPER = 'mensajeErrorCargaDiferida';

describe('diagnostico de exportaciones', () => {
  const fuentes = archivosFuente('src');

  /** Nombres exportados por modulos que SI hacen la carga diferida. Se
   * excluyen los `type`/`typeof import(...)`, que no ejecutan nada. */
  const puntosDeEntrada = new Set<string>();
  for (const ruta of fuentes) {
    const codigo = readFileSync(ruta, 'utf8');
    const lineasEjecutables = codigo
      .split('\n')
      .filter((l) => !/typeof\s+import\(/.test(l))
      .join('\n');
    if (!IMPORT_DIFERIDO.test(lineasEjecutables)) continue;
    // Se toma el cuerpo de CADA exportada, no el archivo entero: hay modulos
    // que mezclan un generador pesado con un ayudante puro. `descargarBlob`
    // (`reporteSemanalService.ts`) solo crea un enlace y hace clic -- no
    // carga nada -- asi que exigirle a su llamador el helper seria un falso
    // positivo, y un falso positivo en una guarda termina en que alguien la
    // borra.
    const marcas = [...codigo.matchAll(EXPORTADAS)];
    for (let i = 0; i < marcas.length; i++) {
      const nombre = marcas[i][1] ?? marcas[i][2];
      if (!/^(descargar|generarPDF|exportar)/.test(nombre)) continue;
      const desde = marcas[i].index ?? 0;
      const hasta = marcas[i + 1]?.index ?? codigo.length;
      if (IMPORT_DIFERIDO.test(codigo.slice(desde, hasta))) puntosDeEntrada.add(nombre);
    }
  }

  // UN SALTO de mas: una exportada que LLAMA a otra del mismo modulo hereda su
  // carga diferida. Es el caso real de `descargarReporteDesdeHTML`, que no
  // trae el `import()` pero llama a `convertirHTMLaPDF`, que si. Un salto
  // cubre lo que hay hoy; una cadena mas larga pediria un grafo de llamadas
  // completo, que es mas maquinaria de la que este defecto justifica.
  for (const ruta of fuentes) {
    const codigo = readFileSync(ruta, 'utf8');
    const marcas = [...codigo.matchAll(EXPORTADAS)];
    for (let i = 0; i < marcas.length; i++) {
      const nombre = marcas[i][1] ?? marcas[i][2];
      if (!/^(descargar|generarPDF|exportar)/.test(nombre)) continue;
      if (puntosDeEntrada.has(nombre)) continue;
      const cuerpo = codigo.slice(marcas[i].index ?? 0, marcas[i + 1]?.index ?? codigo.length);
      if ([...puntosDeEntrada].some((fn) => new RegExp(`\\b${fn}\\s*\\(`).test(cuerpo))) {
        puntosDeEntrada.add(nombre);
      }
      // Tambien vale si llama a una NO exportada del mismo modulo que si
      // carga en diferido (p. ej. `convertirHTMLaPDF`).
      for (const otra of marcas) {
        const nombreOtra = otra[1] ?? otra[2];
        const cuerpoOtra = codigo.slice(
          otra.index ?? 0,
          marcas[marcas.indexOf(otra) + 1]?.index ?? codigo.length,
        );
        if (
          IMPORT_DIFERIDO.test(cuerpoOtra) &&
          new RegExp(`\\b${nombreOtra}\\s*\\(`).test(cuerpo)
        ) {
          puntosDeEntrada.add(nombre);
        }
      }
    }
  }

  it('encuentra los puntos de entrada de exportacion (la guarda no esta vacia)', () => {
    // Si esto baja a 0, la guarda dejo de mirar nada y hay que arreglarla,
    // no borrarla.
    expect(puntosDeEntrada.size).toBeGreaterThanOrEqual(6);
  });

  it('todo llamador de una exportacion diferida sabe explicar el fallo', () => {
    const infractores: string[] = [];
    for (const ruta of fuentes) {
      const codigo = readFileSync(ruta, 'utf8');
      // El propio modulo de exportacion no necesita el helper: no atrapa, lanza.
      if (IMPORT_DIFERIDO.test(codigo.split('\n').filter((l) => !/typeof\s+import\(/.test(l)).join('\n'))) continue;
      const llama = [...puntosDeEntrada].some((fn) => new RegExp(`\\b${fn}\\s*\\(`).test(codigo));
      if (!llama) continue;
      if (!codigo.includes(HELPER)) infractores.push(ruta);
    }
    expect(
      infractores,
      `llaman una exportacion diferida sin ${HELPER}: ${infractores.join(', ')}`,
    ).toEqual([]);
  });

  it('la barrera de errores de ruta sigue montada en App.tsx', () => {
    // Sin ella, un chunk de ruta retirado deja la aplicacion en blanco.
    const app = readFileSync('src/App.tsx', 'utf8');
    expect(app).toContain('<RouteErrorBoundary>');
    // Import ESTATICO: una barrera cargada en diferido no puede atrapar el
    // fallo de una carga diferida.
    expect(app).toMatch(/^import \{ RouteErrorBoundary \}/m);
  });
});
