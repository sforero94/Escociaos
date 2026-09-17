import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync, readdirSync, statSync } from 'fs';
import { resolve, relative } from 'path';

/**
 * Guarda estructural del bloque "Novedades" (issue #266) -- mecanismo
 * mecánico de N-1 ("nada que produzca un cron entra al feed", §2.2 del
 * brief): `hato_alertas`, cualquier `acciones_*`, cualquier `clima_*` y
 * `logs_auditoria` no pueden colarse por descuido en un `.from('<tabla>')`
 * de `src/utils/novedades/` ni de `useNovedades.ts` (F3, todavía no
 * existe -- el guard lo cubre igual, apuntando al archivo que se espera).
 *
 * Modelado sobre `climaTablaCorrectaGuard.test.ts`: lista blanca CERRADA Y
 * CONTADA (comentarios descartados antes de buscar, mismo `sinComentarios`
 * que ese guard y que `hatoFechaLocalGuard.test.ts` -- las tres copias
 * existen porque cada una vigila un patrón textual distinto y unificar el
 * mecanismo en un helper compartido no es parte de este cambio), y un
 * segundo test que exige que la lista blanca no tenga entradas muertas.
 *
 * `src/utils/novedades/catalogo.ts` declara las 8 fuentes *Must* del v1
 * (`FuenteNovedad` en `tipos.ts`) -- lo que este guard vigila es que ningún
 * `.from(...)` real, en NINGÚN archivo del directorio, nombre una tabla
 * fuera de ese catálogo (más `hato_animales`, la única tabla de apoyo que
 * un cargador consulta sin ser ella misma una fuente -- ver
 * `hatoPesajesLeche.ts`).
 */

const SRC = resolve(__dirname, '..');
const DIR_NOVEDADES = resolve(SRC, 'utils/novedades');
const ARCHIVO_HOOK_F3 = resolve(SRC, 'components/dashboard/hooks/useNovedades.ts');

/** Las 8 fuentes *Must* del catálogo v1 + `hato_animales` (tabla de apoyo,
 *  nunca una fuente por sí misma -- ver docstring de `hatoPesajesLeche.ts`).
 *  Lista CERRADA: sumar una fuente nueva al catálogo real exige sumarla
 *  ACÁ también, a propósito -- es la misma disciplina que
 *  `LISTA_BLANCA`/`LISTA_BLANCA_UTC`/`LISTA_BLANCA_BOGOTA` de los guards
 *  hermanos. */
const TABLAS_ADMITIDAS = new Set<string>([
  'hato_eventos',
  'hato_pesajes_leche',
  'hato_tratamientos',
  'hato_chequeos',
  'hato_animales', // denominador de pesajes -- `hatoPesajesLeche.ts`
  'registros_trabajo',
  'monitoreos',
  'movimientos_diarios',
  'fin_gastos',
  // `novedades_uso` (migración 155) NO es una fuente que el feed LEA -- es
  // la instrumentación M-4/M-5 (§9 del plan técnico) a la que
  // `useNovedades.ts` sólo ESCRIBE (INSERT, dispara y olvida). Admitida acá
  // a propósito: el guard vigila lecturas de dominio fuera del catálogo,
  // no el único INSERT que este bloque hace en toda su vida (§12.10 del
  // brief: "el feed no escribe en ninguna tabla de dominio -- lo único que
  // escribe es su propia señal de uso").
  'novedades_uso',
]);

// `hato_chequeo_vacas` NO aparece acá: `hatoChequeos.ts` sólo la toca vía el
// embed `hato_chequeos.select('..., hato_chequeo_vacas(count)')` --
// `.from('hato_chequeo_vacas')` nunca ocurre, así que un `.from()` literal
// para esa tabla SÍ debe seguir prohibido (fuera de este catálogo) hasta
// que alguna fuente la consulte de verdad.

/** Prefijos/nombres que N-1 prohíbe explícitamente (§2.2 del brief): nada
 *  que produzca un cron, y `logs_auditoria` (0 filas, nunca cableada --
 *  cablearla es una decisión de producto de otro documento, §6 del brief). */
const PROHIBIDAS = [/^hato_alertas/, /^acciones_/, /^clima_/, /^logs_auditoria$/];

/** Quita comentarios de bloque y de línea antes de buscar -- mismo criterio
 *  que `climaTablaCorrectaGuard.test.ts`: un comentario que EXPLIQUE por
 *  qué no se toca una tabla no debe contar como una consulta a esa tabla. */
function sinComentarios(contenido: string): string {
  return contenido
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((linea) => !/^\s*(\/\/|\*)/.test(linea))
    .join('\n');
}

function archivosTs(dir: string, acc: string[] = []): string[] {
  if (!existsSync(dir)) return acc;
  for (const entrada of readdirSync(dir)) {
    if (entrada === 'node_modules' || entrada === '__tests__') continue;
    const ruta = resolve(dir, entrada);
    if (statSync(ruta).isDirectory()) archivosTs(ruta, acc);
    else if (/\.tsx?$/.test(entrada)) acc.push(ruta);
  }
  return acc;
}

const PATRON_FROM = /\.from\(\s*['"]([a-zA-Z0-9_]+)['"]\s*\)/g;

function tablasReferenciadas(ruta: string): string[] {
  const fuente = sinComentarios(readFileSync(ruta, 'utf-8'));
  return [...fuente.matchAll(PATRON_FROM)].map((m) => m[1]);
}

function archivosCubiertos(): string[] {
  const archivos = archivosTs(DIR_NOVEDADES);
  if (existsSync(ARCHIVO_HOOK_F3)) archivos.push(ARCHIVO_HOOK_F3);
  return archivos;
}

describe('Novedades sólo lee las tablas de su catálogo (guard N-1)', () => {
  it('ningún .from(...) nombra una tabla prohibida (hato_alertas, acciones_*, clima_*, logs_auditoria)', () => {
    const infractores: string[] = [];
    for (const archivo of archivosCubiertos()) {
      const rel = relative(SRC, archivo).split('\\').join('/');
      for (const tabla of tablasReferenciadas(archivo)) {
        if (PROHIBIDAS.some((patron) => patron.test(tabla))) {
          infractores.push(`${rel}: .from('${tabla}')`);
        }
      }
    }
    expect(infractores).toEqual([]);
  });

  it('ningún .from(...) nombra una tabla fuera de TABLAS_ADMITIDAS', () => {
    const infractores: string[] = [];
    for (const archivo of archivosCubiertos()) {
      const rel = relative(SRC, archivo).split('\\').join('/');
      for (const tabla of tablasReferenciadas(archivo)) {
        if (!TABLAS_ADMITIDAS.has(tabla)) {
          infractores.push(`${rel}: .from('${tabla}')`);
        }
      }
    }
    expect(
      infractores,
      'Tabla nueva sin revisar: si de verdad hace falta, súmala a TABLAS_ADMITIDAS en este archivo ' +
        'a propósito -- nunca por descuido.',
    ).toEqual([]);
  });

  it('TABLAS_ADMITIDAS no tiene entradas muertas', () => {
    const todas = new Set(archivosCubiertos().flatMap(tablasReferenciadas));
    const muertas = [...TABLAS_ADMITIDAS].filter((t) => !todas.has(t));
    expect(muertas).toEqual([]);
  });
});
