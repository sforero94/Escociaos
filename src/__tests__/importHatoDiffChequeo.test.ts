// ARCHIVO: __tests__/importHatoDiffChequeo.test.ts
// DESCRIPCIÓN: TDD del diff de B0/V10 (subir Excel de un chequeo nuevo,
// plan §7.4 "Import recurrente por chequeo"). `diffChequeo.ts` es puro: no
// toca Supabase ni el archivo -- recibe filas ya normalizadas por
// `normalizarHojas` (S3, ya probado en importHatoNormalizar.test.ts) más el
// estado ACTUAL de la base (dos arreglos planos que arma el handler del
// endpoint) y devuelve la clasificación para que Martha apruebe antes de que
// CUALQUIER cosa se comprometa.

import { describe, it, expect } from 'vitest';
import {
  construirDiffChequeo,
  seleccionarUltimoChequeoPorAnimal,
  type AnimalHatoActual,
  type UltimoChequeoVacaActual,
  type FilaChequeoVacaHistorico,
} from '@/utils/importHato/diffChequeo';
import type { FilaChequeoNormalizada, ParseIssue } from '@/utils/importHato/tipos';

const ARCHIVO = 'CHEQUEO AGOSTO 2026.xlsx';
const HOJA = 'CHEQUEO AGOSTO 2026';

function fila(datos: Partial<FilaChequeoNormalizada> & { fila: number; numero: number | null }): FilaChequeoNormalizada {
  return {
    archivo: ARCHIVO,
    hoja: HOJA,
    fila: datos.fila,
    generacionEncabezado: 3,
    numero: datos.numero,
    nombre: datos.nombre ?? null,
    chequeoFecha: '2026-08-10',
    chequeoFechaConfianza: 'exacta',
    raw: {
      pl: null,
      np: null,
      ultimaCria: null,
      sx: null,
      fechaServicio: null,
      toro: null,
      tp: null,
      estado: null,
      secar: null,
      pp: null,
      ttto: null,
    },
    pl: datos.pl ?? null,
    numPartos: datos.numPartos ?? null,
    fechasServicio: datos.fechasServicio ?? [],
    sx: datos.sx ?? null,
    estado: datos.estado ?? 'vacio',
    fechaSecar: datos.fechaSecar ?? null,
    fechaProbableParto: datos.fechaProbableParto ?? null,
    toroNombre: datos.toroNombre ?? null,
    tipoServicio: datos.tipoServicio ?? null,
    issues: datos.issues ?? [],
  };
}

function animal(datos: Partial<AnimalHatoActual> & { id: string; numero: number }): AnimalHatoActual {
  return {
    id: datos.id,
    numero: datos.numero,
    nombre: datos.nombre ?? null,
    etapa: datos.etapa ?? 'vaca',
    estado: datos.estado ?? 'activa',
  };
}

function ultimo(datos: Partial<UltimoChequeoVacaActual> & { animalId: string }): UltimoChequeoVacaActual {
  return {
    animalId: datos.animalId,
    chequeoFecha: datos.chequeoFecha ?? '2026-06-10',
    pl: datos.pl ?? null,
    numPartos: datos.numPartos ?? null,
    fechaServicio: datos.fechaServicio ?? null,
    toro: datos.toro ?? null,
    tipoServicio: datos.tipoServicio ?? null,
    fechaSecar: datos.fechaSecar ?? null,
    fechaProbableParto: datos.fechaProbableParto ?? null,
    estado: datos.estado ?? null,
  };
}

describe('construirDiffChequeo — clasificación de filas', () => {
  it('clasifica como "nuevo" una chapeta que no está en hato_animales', () => {
    const filas = [fila({ fila: 2, numero: 500, nombre: 'CONCHA', pl: 12 })];
    const resultado = construirDiffChequeo(filas, [], []);

    expect(resultado.filas).toHaveLength(1);
    expect(resultado.filas[0]).toMatchObject({
      clasificacion: 'nuevo',
      numero: 500,
      animalId: null,
      diferencias: [],
    });
    expect(resultado.resumen).toMatchObject({ totalFilas: 1, nuevos: 1, sinCambio: 0, cambios: 0, noReconocidos: 0 });
  });

  it('clasifica como "sin_cambio" cuando ningún campo diffable cambió', () => {
    const animales = [animal({ id: 'a1', numero: 201, nombre: 'CAMPESINA' })];
    const historico = [
      ultimo({ animalId: 'a1', pl: 16, numPartos: 3, fechaServicio: '2026-05-01', toro: 'inook', tipoServicio: 'inseminacion', estado: 'vacia_apta' }),
    ];
    const filas = [
      fila({
        fila: 3,
        numero: 201,
        nombre: 'CAMPESINA',
        pl: 16,
        numPartos: 3,
        fechasServicio: ['2026-05-01'],
        toroNombre: 'inook',
        tipoServicio: 'inseminacion',
        estado: 'vacia_apta',
      }),
    ];

    const resultado = construirDiffChequeo(filas, animales, historico);

    expect(resultado.filas[0].clasificacion).toBe('sin_cambio');
    expect(resultado.filas[0].diferencias).toEqual([]);
    expect(resultado.filas[0].animalId).toBe('a1');
    expect(resultado.resumen.sinCambio).toBe(1);
  });

  it('clasifica como "cambio" y reporta cada campo que difiere, con antes/después', () => {
    const animales = [animal({ id: 'a1', numero: 201, nombre: 'CAMPESINA' })];
    const historico = [ultimo({ animalId: 'a1', pl: 16, estado: 'vacia_apta' })];
    const filas = [fila({ fila: 3, numero: 201, nombre: 'CAMPESINA', pl: 20, estado: 'vacia_problema' })];

    const resultado = construirDiffChequeo(filas, animales, historico);

    expect(resultado.filas[0].clasificacion).toBe('cambio');
    expect(resultado.filas[0].diferencias).toEqual(
      expect.arrayContaining([
        { campo: 'PL', anterior: 16, nuevo: 20 },
        { campo: 'estado', anterior: 'vacia_apta', nuevo: 'vacia_problema' },
      ]),
    );
    expect(resultado.resumen.cambios).toBe(1);
  });

  it('incluye un cambio de nombre en planilla vs. sistema como diferencia', () => {
    const animales = [animal({ id: 'a1', numero: 201, nombre: 'CAMPESINA' })];
    const filas = [fila({ fila: 3, numero: 201, nombre: 'CAMPESINA VIEJA' })];

    const resultado = construirDiffChequeo(filas, animales, []);

    expect(resultado.filas[0].clasificacion).toBe('cambio');
    expect(resultado.filas[0].diferencias).toContainEqual({
      campo: 'nombre (planilla vs. sistema)',
      anterior: 'CAMPESINA',
      nuevo: 'CAMPESINA VIEJA',
    });
  });

  it('un animal sin chequeo previo se trata como "cambio" contra una base nula, nunca "sin_cambio" falso', () => {
    const animales = [animal({ id: 'a1', numero: 201, nombre: 'CAMPESINA' })];
    const filas = [fila({ fila: 3, numero: 201, nombre: 'CAMPESINA', pl: 14 })];

    const resultado = construirDiffChequeo(filas, animales, []);

    expect(resultado.filas[0].clasificacion).toBe('cambio');
    expect(resultado.filas[0].diferencias).toContainEqual({ campo: 'PL', anterior: null, nuevo: 14 });
  });

  it('un animal sin chequeo previo y una fila completamente vacía es "sin_cambio" (nada que reportar)', () => {
    const animales = [animal({ id: 'a1', numero: 201, nombre: 'CAMPESINA' })];
    const filas = [fila({ fila: 3, numero: 201, nombre: 'CAMPESINA' })];

    const resultado = construirDiffChequeo(filas, animales, []);

    expect(resultado.filas[0].clasificacion).toBe('sin_cambio');
  });

  it('"vacio" (celda de ESTADO en blanco) se trata igual que NULL, nunca como valor real', () => {
    const animales = [animal({ id: 'a1', numero: 201, nombre: 'CAMPESINA' })];
    // Chequeo previo con ESTADO en blanco (NULL en la BD) -- la fila nueva
    // tampoco trae ESTADO (`'vacio'` por default del parser). No debe
    // aparecer como diferencia.
    const historico = [ultimo({ animalId: 'a1', estado: null })];
    const filas = [fila({ fila: 3, numero: 201, nombre: 'CAMPESINA', estado: 'vacio' })];

    const resultado = construirDiffChequeo(filas, animales, historico);
    expect(resultado.filas[0].clasificacion).toBe('sin_cambio');
  });

  it('una fila sin número es "no_reconocido" -- nunca se adivina la identidad por nombre', () => {
    const filas = [fila({ fila: 6, numero: null, nombre: 'VENDIDAS CORNELIA Y COQUETA' })];
    const resultado = construirDiffChequeo(filas, [], []);

    expect(resultado.filas[0].clasificacion).toBe('no_reconocido');
    expect(resultado.filas[0].motivoNoReconocido).toMatch(/número de chapeta/i);
    expect(resultado.resumen.noReconocidos).toBe(1);
  });

  it('un número en el rango provisional (900-999) nunca se presenta como chapeta real', () => {
    const filas = [fila({ fila: 4, numero: 950, nombre: 'X' })];
    const resultado = construirDiffChequeo(filas, [], []);

    expect(resultado.filas[0].clasificacion).toBe('no_reconocido');
    expect(resultado.filas[0].numeroEsProvisional).toBe(true);
    expect(resultado.filas[0].motivoNoReconocido).toMatch(/provisional/i);
  });

  it('chapetas repetidas en la MISMA hoja subida con nombres distintos son "no_reconocido" para ambas filas', () => {
    const filas = [
      fila({ fila: 2, numero: 175, nombre: 'MARGARITA' }),
      fila({ fila: 3, numero: 175, nombre: 'MONA' }),
    ];
    const resultado = construirDiffChequeo(filas, [], []);

    expect(resultado.filas.every((f) => f.clasificacion === 'no_reconocido')).toBe(true);
    expect(resultado.filas[0].motivoNoReconocido).toMatch(/más de una vez en esta hoja/i);
    expect(resultado.colisionesEnHoja).toEqual([{ numero: 175, nombres: ['MARGARITA', 'MONA'] }]);
  });

  it('conserva issues[] de la fila normalizada sin importar la clasificación', () => {
    const issues: ParseIssue[] = [{ crudo: '#VALUE!', motivo: 'no interpretable' }];
    const filas = [fila({ fila: 2, numero: 500, nombre: 'CONCHA', issues })];
    const resultado = construirDiffChequeo(filas, [], []);

    expect(resultado.filas[0].issues).toEqual(issues);
    expect(resultado.resumen.conIssues).toBe(1);
  });

  it('el resumen cuenta correctamente cada clasificación en una hoja mixta', () => {
    const animales = [animal({ id: 'a1', numero: 201, nombre: 'CAMPESINA' })];
    const historico = [ultimo({ animalId: 'a1', pl: 16 })];
    const filas = [
      fila({ fila: 2, numero: 500, nombre: 'NUEVA' }), // nuevo
      fila({ fila: 3, numero: 201, nombre: 'CAMPESINA', pl: 16 }), // sin_cambio
      fila({ fila: 4, numero: 202, nombre: 'X' }), // nuevo (numero 202 no existe)
      fila({ fila: 5, numero: null, nombre: 'SIN NUMERO' }), // no_reconocido
    ];

    const resultado = construirDiffChequeo(filas, animales, historico);
    expect(resultado.resumen).toEqual({
      totalFilas: 4,
      nuevos: 2,
      sinCambio: 1,
      cambios: 0,
      noReconocidos: 1,
      conIssues: 0,
    });
  });
});

describe('seleccionarUltimoChequeoPorAnimal — reducción a la fila más reciente por animal', () => {
  function historico(datos: Partial<FilaChequeoVacaHistorico> & { animalId: string; chequeoFecha: string; createdAt: string }): FilaChequeoVacaHistorico {
    return {
      animalId: datos.animalId,
      chequeoFecha: datos.chequeoFecha,
      createdAt: datos.createdAt,
      pl: datos.pl ?? null,
      numPartos: datos.numPartos ?? null,
      fechaServicio: datos.fechaServicio ?? null,
      toro: datos.toro ?? null,
      tipoServicio: datos.tipoServicio ?? null,
      fechaSecar: datos.fechaSecar ?? null,
      fechaProbableParto: datos.fechaProbableParto ?? null,
      estado: datos.estado ?? null,
    };
  }

  it('elige la fecha de chequeo más reciente por animal_id', () => {
    const filas = [
      historico({ animalId: 'a1', chequeoFecha: '2026-01-10', createdAt: '2026-01-10T10:00:00Z', pl: 10 }),
      historico({ animalId: 'a1', chequeoFecha: '2026-06-10', createdAt: '2026-06-10T10:00:00Z', pl: 18 }),
      historico({ animalId: 'a2', chequeoFecha: '2026-03-10', createdAt: '2026-03-10T10:00:00Z', pl: 12 }),
    ];

    const resultado = seleccionarUltimoChequeoPorAnimal(filas);
    const porAnimal = new Map(resultado.map((r) => [r.animalId, r]));

    expect(porAnimal.get('a1')).toMatchObject({ chequeoFecha: '2026-06-10', pl: 18 });
    expect(porAnimal.get('a2')).toMatchObject({ chequeoFecha: '2026-03-10', pl: 12 });
    expect(resultado).toHaveLength(2);
  });

  it('usa created_at como desempate cuando dos chequeos resuelven a la misma fecha', () => {
    const filas = [
      historico({ animalId: 'a1', chequeoFecha: '2026-06-10', createdAt: '2026-06-10T09:00:00Z', pl: 10 }),
      historico({ animalId: 'a1', chequeoFecha: '2026-06-10', createdAt: '2026-06-10T15:00:00Z', pl: 22 }),
    ];

    const resultado = seleccionarUltimoChequeoPorAnimal(filas);
    expect(resultado).toHaveLength(1);
    expect(resultado[0].pl).toBe(22);
  });

  it('arreglo vacío devuelve arreglo vacío', () => {
    expect(seleccionarUltimoChequeoPorAnimal([])).toEqual([]);
  });
});
