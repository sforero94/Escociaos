/**
 * Tests de `aplicarDedupe` (Extract, S3) -- incluye la regresión de F/U 5
 * (CLAUDE.md "Known follow-ups" #1 / docs/hato/runbook-load-historico.md):
 * dos hojas de archivos DISTINTOS que resuelven a la MISMA fecha y son
 * casi idénticas (salvo 1-2 filas) ya no duplican la hoja COMPLETA -- solo
 * las filas que realmente difieren o son exclusivas de una de las dos.
 */

import { describe, it, expect } from 'vitest';
import { aplicarDedupe, type ProcesadaChequeo } from '@/utils/importHato/dedupe';
import type { CrudoFilaChequeo, FilaChequeoNormalizada, ManifiestoHoja } from '@/utils/importHato/tipos';

const RAW_VACIO: CrudoFilaChequeo = {
  pl: null, np: null, ultimaCria: null, sx: null, fechaServicio: null,
  toro: null, estadoRegistrado: null, tp: null, estado: null, secar: null, pp: null, ttto: null,
};

function fila(overrides: Partial<FilaChequeoNormalizada> = {}): FilaChequeoNormalizada {
  return {
    archivo: 'archivo-a.xlsx',
    hoja: 'CHEQUEO JUNIO 9 2020',
    fila: 3,
    generacionEncabezado: 3,
    numero: 99,
    nombre: 'COQUETA',
    chequeoFecha: '2020-06-09',
    chequeoFechaConfianza: 'exacta',
    raw: { ...RAW_VACIO },
    pl: 10,
    numPartos: 2,
    fechasServicio: [],
    sx: null,
    estado: 'vacia_apta',
    fechaSecar: null,
    fechaProbableParto: null,
    toroNombre: null,
    tipoServicio: null,
    estadoRegistrado: null,
    issues: [],
    ...overrides,
  };
}

function manifest(overrides: Partial<ManifiestoHoja> = {}): ManifiestoHoja {
  return {
    archivo: 'archivo-a.xlsx',
    hoja: 'CHEQUEO JUNIO 9 2020',
    chequeoFecha: '2020-06-09',
    chequeoFechaConfianza: 'exacta',
    generacionEncabezado: 3,
    filaEncabezado: 1,
    offsetColumnas: null,
    colmap: {} as ManifiestoHoja['colmap'],
    filasTotales: 1,
    filasAnimal: 1,
    filasDescartadas: 0,
    descartesPorMotivo: {},
    duplicadaDe: null,
    issues: [],
    ...overrides,
  };
}

function procesada(archivo: string, hoja: string, fecha: string, filas: FilaChequeoNormalizada[]): ProcesadaChequeo {
  return {
    archivo,
    hoja,
    manifest: manifest({ archivo, hoja, chequeoFecha: fecha, filasTotales: filas.length, filasAnimal: filas.length }),
    filas,
    subtablas: [],
  };
}

describe('aplicarDedupe', () => {
  it('primera hoja de una fecha nunca se marca duplicada', () => {
    const p = procesada('archivo-a.xlsx', 'CHEQUEO JUNIO 9 2020', '2020-06-09', [fila()]);
    const r = aplicarDedupe([p]);
    expect(r.hojas[0].duplicadaDe).toBeNull();
    expect(r.chequeos).toHaveLength(1);
  });

  it('hoja duplicada byte-idéntica (ignorando TP) entre dos archivos: sus filas no se emiten de nuevo', () => {
    const filasA = [
      fila({ archivo: 'archivo-a.xlsx', numero: 99, nombre: 'COQUETA', raw: { ...RAW_VACIO, pl: '10' } }),
      fila({ archivo: 'archivo-a.xlsx', fila: 4, numero: 100, nombre: 'VIGOROSA', raw: { ...RAW_VACIO, pl: '8' } }),
    ];
    // Misma hoja, otro archivo, TP distinto (fórmula TODAY() congelada -- se
    // ignora a propósito, ver CAMPOS_RAW_COMPARABLES) pero todo lo demás igual.
    const filasB = [
      fila({ archivo: 'archivo-b.xlsx', numero: 99, nombre: 'COQUETA', raw: { ...RAW_VACIO, pl: '10', tp: '99' } }),
      fila({ archivo: 'archivo-b.xlsx', fila: 4, numero: 100, nombre: 'VIGOROSA', raw: { ...RAW_VACIO, pl: '8', tp: '99' } }),
    ];
    const a = procesada('archivo-a.xlsx', 'CHEQUEO JUNIO 9 2020', '2020-06-09', filasA);
    const b = procesada('archivo-b.xlsx', 'CHEQUEO JUNIO 9 2020', '2020-06-09', filasB);
    const r = aplicarDedupe([a, b]);

    expect(r.chequeos).toHaveLength(2); // solo las de la hoja survivor (archivo-a)
    expect(r.chequeos.every((f) => f.archivo === 'archivo-a.xlsx')).toBe(true);
    const hojaB = r.hojas.find((h) => h.archivo === 'archivo-b.xlsx')!;
    expect(hojaB.duplicadaDe).toBe('archivo-a.xlsx::CHEQUEO JUNIO 9 2020');
  });

  // ==========================================================================
  // F/U 5 -- la regresión real: 1 fila distinta (COQUETA) entre dos archivos
  // NO debe duplicar las otras ~44 filas idénticas de la hoja.
  // ==========================================================================
  it('1 fila distinta entre archivos duplicados: SOLO esa fila se conserva de ambas versiones, el resto no se duplica', () => {
    const otrasIdenticas = (archivo: string) => [
      fila({ archivo, fila: 4, numero: 100, nombre: 'VIGOROSA', raw: { ...RAW_VACIO, pl: '8' } }),
      fila({ archivo, fila: 5, numero: 101, nombre: 'MARIMBA', raw: { ...RAW_VACIO, pl: '6' } }),
      fila({ archivo, fila: 6, numero: 102, nombre: 'CUCA', raw: { ...RAW_VACIO, pl: '11' } }),
    ];

    const filasA = [
      fila({ archivo: 'archivo-a.xlsx', numero: 99, nombre: 'COQUETA', raw: { ...RAW_VACIO, pl: '10', ultimaCria: '1/1/2020' } }),
      ...otrasIdenticas('archivo-a.xlsx'),
    ];
    // archivo-b (el "ACTUALIZADO"): COQUETA difiere (pl y última cría distintos,
    // caso real documentado en la cabecera del archivo); el resto es idéntico.
    const filasB = [
      fila({ archivo: 'archivo-b.xlsx', numero: 99, nombre: 'COQUETA', raw: { ...RAW_VACIO, pl: '12', ultimaCria: '15/6/2020' } }),
      ...otrasIdenticas('archivo-b.xlsx'),
    ];

    const a = procesada('archivo-a.xlsx', 'CHEQUEO JUNIO 9 2020', '2020-06-09', filasA);
    const b = procesada('archivo-b.xlsx', 'CHEQUEO JUNIO 9 2020', '2020-06-09', filasB);
    const r = aplicarDedupe([a, b]);

    // 4 filas de archivo-a (todas, es la survivor) + 1 fila de archivo-b
    // (solo COQUETA, que difiere) -- NUNCA las 8 que produciría duplicar la
    // hoja b completa.
    expect(r.chequeos).toHaveLength(5);
    const deB = r.chequeos.filter((f) => f.archivo === 'archivo-b.xlsx');
    expect(deB).toHaveLength(1);
    expect(deB[0].nombre).toBe('COQUETA');
    expect(deB[0].raw.pl).toBe('12');

    // Las otras 3 de la hoja B (idénticas a la survivor) no aparecen dos veces.
    expect(r.chequeos.filter((f) => f.numero === 100)).toHaveLength(1);
    expect(r.chequeos.filter((f) => f.numero === 101)).toHaveLength(1);
    expect(r.chequeos.filter((f) => f.numero === 102)).toHaveLength(1);

    const hojaB = r.hojas.find((h) => h.archivo === 'archivo-b.xlsx')!;
    expect(hojaB.duplicadaDe).toBe('archivo-a.xlsx::CHEQUEO JUNIO 9 2020');
    expect(hojaB.issues.some((i) => /duplicado exacto/.test(i.motivo) && /difieren o son exclusivas/.test(i.motivo))).toBe(true);
    expect(hojaB.issues.some((i) => /COQUETA/.test(i.motivo))).toBe(true);
  });

  it('una fila exclusiva de la hoja candidata (animal nuevo, no está en la survivor) se agrega igual', () => {
    const filasA = [fila({ archivo: 'archivo-a.xlsx', numero: 99, nombre: 'COQUETA' })];
    const filasB = [
      fila({ archivo: 'archivo-b.xlsx', numero: 99, nombre: 'COQUETA' }), // idéntica -- duplicado real
      fila({ archivo: 'archivo-b.xlsx', fila: 4, numero: 200, nombre: 'NUEVA' }), // solo en B
    ];
    const a = procesada('archivo-a.xlsx', 'CHEQUEO JUNIO 9 2020', '2020-06-09', filasA);
    const b = procesada('archivo-b.xlsx', 'CHEQUEO JUNIO 9 2020', '2020-06-09', filasB);
    const r = aplicarDedupe([a, b]);

    expect(r.chequeos).toHaveLength(2);
    expect(r.chequeos.some((f) => f.nombre === 'NUEVA' && f.archivo === 'archivo-b.xlsx')).toBe(true);
    expect(r.chequeos.filter((f) => f.nombre === 'COQUETA')).toHaveLength(1); // no duplicada
  });

  it('con una colisión de chapeta DENTRO de la propia hoja (identidad repetida), cae al fallback conservador (compara hoja completa)', () => {
    // Ambas hojas traen numero=175 con dos nombres distintos (MONA/MARGARITA)
    // -- identidad repetida en cada hoja, no se puede alinear con confianza
    // por (numero, nombre) porque el PAR se repite dentro de sí misma en un
    // sentido más amplio (aquí forzamos el caso más simple: mismo numero Y
    // nombre repetido dos veces en la propia hoja).
    const filasA = [
      fila({ archivo: 'archivo-a.xlsx', numero: 175, nombre: 'MONA', raw: { ...RAW_VACIO, pl: '9' } }),
      fila({ archivo: 'archivo-a.xlsx', fila: 4, numero: 175, nombre: 'MONA', raw: { ...RAW_VACIO, pl: '9' } }),
    ];
    const filasB = [
      fila({ archivo: 'archivo-b.xlsx', numero: 175, nombre: 'MONA', raw: { ...RAW_VACIO, pl: '9' } }),
      fila({ archivo: 'archivo-b.xlsx', fila: 4, numero: 175, nombre: 'MONA', raw: { ...RAW_VACIO, pl: '7' } }), // difiere
    ];
    const a = procesada('archivo-a.xlsx', 'CHEQUEO JUNIO 9 2020', '2020-06-09', filasA);
    const b = procesada('archivo-b.xlsx', 'CHEQUEO JUNIO 9 2020', '2020-06-09', filasB);
    const r = aplicarDedupe([a, b]);

    // Fallback conservador: como el contenido difiere (comparación por
    // posición) y no se puede alinear por identidad, se conservan las filas
    // de AMBAS hojas completas -- nunca se elige una versión.
    expect(r.chequeos).toHaveLength(4);
    const hojaB = r.hojas.find((h) => h.archivo === 'archivo-b.xlsx')!;
    expect(hojaB.issues.some((i) => /no se pudo reconciliar fila a fila/.test(i.motivo))).toBe(true);
  });

  it('hojas sin fecha resuelta con contenido idéntico se deduplican por firma de contenido (comportamiento sin cambios)', () => {
    const filasA = [fila({ archivo: 'archivo-a.xlsx', chequeoFecha: null, chequeoFechaConfianza: 'desconocida' })];
    const filasB = [fila({ archivo: 'archivo-b.xlsx', chequeoFecha: null, chequeoFechaConfianza: 'desconocida' })];
    const a = procesada('archivo-a.xlsx', 'CHEQUEO_MARZO_2019', 'SIN_FECHA', filasA);
    const b = procesada('archivo-b.xlsx', 'CHEQUEO_MARZO_2019', 'SIN_FECHA', filasB);
    // manifest.chequeoFecha debe ser null para tomar esa ruta, no el string 'SIN_FECHA' de arriba.
    a.manifest.chequeoFecha = null;
    b.manifest.chequeoFecha = null;
    const r = aplicarDedupe([a, b]);
    expect(r.chequeos).toHaveLength(1);
    expect(r.hojas.find((h) => h.archivo === 'archivo-b.xlsx')!.duplicadaDe).not.toBeNull();
  });
});
