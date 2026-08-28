/**
 * Paridad entre la constante TS `CAUSAS_RAIZ` (`src/utils/rondaInventario/causasRaiz.ts`)
 * y la semilla SQL de `inventario_causas_raiz` en
 * `src/sql/migrations/125_ronda_inventario_esquema.sql` -- §4.2 del brief
 * técnico (decisión D-T2).
 *
 * Lee las filas sembradas DIRECTO del archivo de migración (nunca de una
 * copia a mano de "lo que dice la migración"), para que si alguien agrega o
 * cambia una causa en un lado y no en el otro, esta suite se ponga roja --
 * es la mitigación que, según el propio brief técnico, le faltó al defecto
 * de `fraccion_jornal` (migración 106): la lista de opciones de la UI y el
 * conjunto aceptado por la base venían de sitios distintos, y el desfase se
 * tragaba en silencio.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { CAUSAS_RAIZ, CLAVES_CAUSA_RAIZ, type ViaExcepcion } from '@/utils/rondaInventario/causasRaiz';

const RUTA_MIGRACION = resolve(__dirname, '../sql/migrations/125_ronda_inventario_esquema.sql');

interface FilaSembradaSql {
  clave: string;
  etiqueta: string;
  via: ViaExcepcion;
  mueveInventario: boolean;
  exigeNota: boolean;
  orden: number;
}

/** Extrae las filas sembradas del `INSERT INTO inventario_causas_raiz`
 * literal del archivo de migración. No es un parser SQL general -- es a
 * propósito estricto sobre la forma exacta de ese INSERT (columnas en el
 * orden `clave, etiqueta, via, mueve_inventario, exige_nota, orden`), para
 * que un cambio de forma en la migración haga fallar el test en vez de
 * leerse mal en silencio. */
function leerFilasSembradasDeMigracion(): FilaSembradaSql[] {
  const contenido = readFileSync(RUTA_MIGRACION, 'utf-8');

  const inicio = contenido.indexOf('INSERT INTO inventario_causas_raiz');
  if (inicio === -1) {
    throw new Error('No se encontró "INSERT INTO inventario_causas_raiz" en 125_ronda_inventario_esquema.sql -- ¿cambió el nombre de la tabla o de la sentencia?');
  }
  const fin = contenido.indexOf(';', inicio);
  if (fin === -1) {
    throw new Error('El INSERT de inventario_causas_raiz no tiene ";" de cierre dentro del archivo -- revisar el parser.');
  }
  const bloque = contenido.slice(inicio, fin);

  const RE_FILA = /\(\s*'([^']+)'\s*,\s*'([^']+)'\s*,\s*'([^']+)'\s*,\s*(TRUE|FALSE)\s*,\s*(TRUE|FALSE)\s*,\s*(\d+)\s*\)/g;

  const filas: FilaSembradaSql[] = [];
  let match: RegExpExecArray | null;
  while ((match = RE_FILA.exec(bloque)) !== null) {
    const [, clave, etiqueta, via, mueveInventario, exigeNota, orden] = match;
    filas.push({
      clave,
      etiqueta,
      via: via as ViaExcepcion,
      mueveInventario: mueveInventario === 'TRUE',
      exigeNota: exigeNota === 'TRUE',
      orden: Number(orden),
    });
  }
  return filas;
}

describe('paridad causasRaiz.ts ⇄ migración 125 (semilla de inventario_causas_raiz)', () => {
  const filasSql = leerFilasSembradasDeMigracion();

  it('la migración sembró exactamente 7 filas', () => {
    // Guarda de que el parser de este test realmente está leyendo algo --
    // si esto falla, el problema puede ser el regex del test, no el catálogo.
    expect(filasSql).toHaveLength(7);
  });

  it('CAUSAS_RAIZ tiene exactamente las mismas 7 filas, en el mismo orden, que la semilla SQL', () => {
    const filasTs = CAUSAS_RAIZ.map((c) => ({
      clave: c.clave,
      etiqueta: c.etiqueta,
      via: c.via,
      mueveInventario: c.mueveInventario,
      exigeNota: c.exigeNota,
      orden: c.orden,
    }));
    expect(filasTs).toEqual(filasSql);
  });

  it('todas las causas de CAUSAS_RAIZ están activas (activo=true) -- la semilla no declara ninguna inactiva', () => {
    expect(CAUSAS_RAIZ.every((c) => c.activo)).toBe(true);
  });

  it('CLAVES_CAUSA_RAIZ coincide con las claves leídas de la migración, en el mismo orden', () => {
    expect(CLAVES_CAUSA_RAIZ).toEqual(filasSql.map((f) => f.clave));
  });

  it('el mapeo causa->vía coincide EXACTO con la tabla de §5.3 del brief de producto', () => {
    const mapeo = Object.fromEntries(CAUSAS_RAIZ.map((c) => [c.clave, c.via]));
    expect(mapeo).toEqual({
      movimiento_no_capturado: 'captura_david',
      consumo_no_registrado: 'captura_david',
      error_captura_previa: 'captura_david',
      perdida_o_dano: 'aprobacion_gerencia',
      sustraccion: 'aprobacion_gerencia',
      error_de_conteo: 'ninguna',
      otro: 'aprobacion_gerencia', // R-18, no una decisión propia de la causa
    });
  });

  it('sólo "error_de_conteo" no mueve inventario -- las otras 6 sí', () => {
    const sinMovimiento = CAUSAS_RAIZ.filter((c) => !c.mueveInventario).map((c) => c.clave);
    expect(sinMovimiento).toEqual(['error_de_conteo']);
  });

  it('sólo "otro" exige nota', () => {
    const exigenNota = CAUSAS_RAIZ.filter((c) => c.exigeNota).map((c) => c.clave);
    expect(exigenNota).toEqual(['otro']);
  });
});
