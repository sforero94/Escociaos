// ARCHIVO: __tests__/ordenarAnimalesHato.test.ts
// DESCRIPCIÓN: TDD del ordenamiento A-Z de columnas de la lista de Animales
// (Figma alignment spec §4, `utils/ordenarAnimalesHato.ts`). Cubre la regla
// no negociable del spec: `—`/null SIEMPRE al final, cualquiera sea la
// dirección -- nunca se trata como "el más chico" en asc ni "el más
// grande" en desc.

import { describe, it, expect } from 'vitest';
import { ordenarAnimalesHato, ordenarPorValor } from '../utils/ordenarAnimalesHato';
import type { AnimalHatoDerivado } from '../components/hato/hooks/useHatoAnimales';
import type { EstadoReproductivoDerivado } from '../utils/calculosHato';

function derivado(overrides: Partial<EstadoReproductivoDerivado> = {}): EstadoReproductivoDerivado {
  return {
    estado: 'servida',
    fecha_secar: null,
    fecha_probable_parto: null,
    dias_abiertos: null,
    tiempo_prenez_dias: null,
    tiempo_secada_dias: null,
    proxima_a_reemplazo: false,
    vacia_es_problema: null,
    senal_revision: null,
    alertas: { secado_due: false, rechequeo_due: false, servicio_sin_confirmacion: false, parto_proximo: false },
    ...overrides,
  };
}

const HOY = '2026-08-13';

function animal(overrides: Partial<AnimalHatoDerivado> = {}): AnimalHatoDerivado {
  return {
    animalId: overrides.animalId ?? crypto.randomUUID(),
    numero: null,
    numeroEsProvisional: false,
    nombre: null,
    etapa: 'vaca',
    raza: null,
    estadoAnimal: 'activa',
    pl: null,
    numPartos: 0,
    ultimoChequeoFecha: null,
    ultimoPartoFecha: null,
    fechaNacimiento: null,
    derivado: derivado(),
    categoria: 'hato',
    categoriaOrigen: 'calculado',
    subetapaTernera: null,
    ...overrides,
  };
}

describe('ordenarAnimalesHato — columna numero', () => {
  it('ordena numéricamente ascendente', () => {
    const animales = [animal({ animalId: 'a', numero: 30 }), animal({ animalId: 'b', numero: 5 }), animal({ animalId: 'c', numero: 12 })];
    const resultado = ordenarAnimalesHato(animales, 'numero', 'asc', HOY).map((a) => a.numero);
    expect(resultado).toEqual([5, 12, 30]);
  });

  it('ordena numéricamente descendente', () => {
    const animales = [animal({ animalId: 'a', numero: 30 }), animal({ animalId: 'b', numero: 5 }), animal({ animalId: 'c', numero: 12 })];
    const resultado = ordenarAnimalesHato(animales, 'numero', 'desc', HOY).map((a) => a.numero);
    expect(resultado).toEqual([30, 12, 5]);
  });

  it('deja "sin caravana" (numero null) al final en asc', () => {
    const animales = [animal({ animalId: 'a', numero: null }), animal({ animalId: 'b', numero: 5 })];
    const resultado = ordenarAnimalesHato(animales, 'numero', 'asc', HOY).map((a) => a.numero);
    expect(resultado).toEqual([5, null]);
  });

  it('deja "sin caravana" (numero null) al final TAMBIÉN en desc -- nunca se trata como "el más grande"', () => {
    const animales = [animal({ animalId: 'a', numero: null }), animal({ animalId: 'b', numero: 5 })];
    const resultado = ordenarAnimalesHato(animales, 'numero', 'desc', HOY).map((a) => a.numero);
    expect(resultado).toEqual([5, null]);
  });

  it('no muta el arreglo original', () => {
    const animales = [animal({ animalId: 'a', numero: 30 }), animal({ animalId: 'b', numero: 5 })];
    ordenarAnimalesHato(animales, 'numero', 'asc', HOY);
    expect(animales.map((a) => a.numero)).toEqual([30, 5]);
  });
});

describe('ordenarAnimalesHato — columna nombre', () => {
  it('ordena alfabéticamente y deja los sin nombre al final en cualquier dirección', () => {
    const animales = [
      animal({ animalId: 'a', nombre: 'Zulema' }),
      animal({ animalId: 'b', nombre: null }),
      animal({ animalId: 'c', nombre: 'Estrella' }),
    ];
    expect(ordenarAnimalesHato(animales, 'nombre', 'asc', HOY).map((a) => a.nombre)).toEqual(['Estrella', 'Zulema', null]);
    expect(ordenarAnimalesHato(animales, 'nombre', 'desc', HOY).map((a) => a.nombre)).toEqual(['Zulema', 'Estrella', null]);
  });
});

describe('ordenarAnimalesHato — columna pl', () => {
  it('ordena numéricamente y deja las vacas sin PL al final', () => {
    const animales = [
      animal({ animalId: 'a', pl: 12.5 }),
      animal({ animalId: 'b', pl: null }),
      animal({ animalId: 'c', pl: 8.2 }),
    ];
    expect(ordenarAnimalesHato(animales, 'pl', 'asc', HOY).map((a) => a.pl)).toEqual([8.2, 12.5, null]);
    expect(ordenarAnimalesHato(animales, 'pl', 'desc', HOY).map((a) => a.pl)).toEqual([12.5, 8.2, null]);
  });
});

describe('ordenarAnimalesHato — columna estado', () => {
  it('ordena por el label visible del chip de estado, no por el valor interno', () => {
    // 'preñada' -> "Preñada", 'servida' -> "Servida" -- alfabéticamente
    // "Preñada" precede a "Servida".
    const animales = [
      animal({ animalId: 'a', derivado: derivado({ estado: 'servida' }) }),
      animal({ animalId: 'b', derivado: derivado({ estado: 'preñada' }) }),
    ];
    const resultado = ordenarAnimalesHato(animales, 'estado', 'asc', HOY).map((a) => a.animalId);
    expect(resultado).toEqual(['b', 'a']);
  });
});

describe('ordenarAnimalesHato — columna proximo', () => {
  it('ordena por fecha real (parto probable, o secar si no hay parto), nunca por el texto formateado', () => {
    const animales = [
      animal({ animalId: 'a', derivado: derivado({ fecha_probable_parto: '2026-09-01' }) }),
      animal({ animalId: 'b', derivado: derivado({ fecha_secar: '2026-08-01' }) }),
      animal({ animalId: 'c', derivado: derivado() }), // sin ninguna fecha
    ];
    const resultado = ordenarAnimalesHato(animales, 'proximo', 'asc', HOY).map((a) => a.animalId);
    expect(resultado).toEqual(['b', 'a', 'c']);
  });

  it('deja sin próximo evento al final también en desc', () => {
    const animales = [
      animal({ animalId: 'a', derivado: derivado() }),
      animal({ animalId: 'b', derivado: derivado({ fecha_probable_parto: '2026-09-01' }) }),
    ];
    const resultado = ordenarAnimalesHato(animales, 'proximo', 'desc', HOY).map((a) => a.animalId);
    expect(resultado).toEqual(['b', 'a']);
  });
});

// `ordenarPorValor` (S2, ronda agosto 2026): extracción genérica que
// reusan ChequeoDetalle/PesajeSemanalGrid/PajillaUsoDialog/RankingVacas/
// HojaDeVida/ChequeosList en vez de reimplementar el comparador cada uno.
describe('ordenarPorValor', () => {
  it('ordena texto alfabéticamente con locale español, insensible a mayúsculas', () => {
    const items = [{ nombre: 'zulema' }, { nombre: 'Abundantia' }, { nombre: 'estrella' }];
    const resultado = ordenarPorValor(items, (i) => i.nombre, 'asc').map((i) => i.nombre);
    expect(resultado).toEqual(['Abundantia', 'estrella', 'zulema']);
  });

  it('ordena correctamente nombres con tildes y Ñ (locale español, no orden binario)', () => {
    // En orden binario/ASCII "Ñ" cae después de "Z"; en español "Ñ" va
    // entre "N" y "O" -- y una vocal acentuada compara junto a su base
    // (verificado contra el motor real, no asumido).
    const items = [{ nombre: 'Ñata' }, { nombre: 'Nube' }, { nombre: 'Óscar' }, { nombre: 'Oveja' }];
    const resultado = ordenarPorValor(items, (i) => i.nombre, 'asc').map((i) => i.nombre);
    expect(resultado).toEqual(['Nube', 'Ñata', 'Óscar', 'Oveja']);
  });

  it('null y undefined van siempre al final, sea cual sea la dirección', () => {
    const items = [{ v: 'b' }, { v: undefined }, { v: 'a' }, { v: null }];
    expect(ordenarPorValor(items, (i) => i.v ?? null, 'asc').map((i) => i.v)).toEqual(['a', 'b', undefined, null]);
    expect(ordenarPorValor(items, (i) => i.v ?? null, 'desc').map((i) => i.v)).toEqual(['b', 'a', undefined, null]);
  });

  it('ordena numéricamente cuando el extractor devuelve números', () => {
    const items = [{ n: 30 }, { n: 5 }, { n: 12 }];
    expect(ordenarPorValor(items, (i) => i.n, 'asc').map((i) => i.n)).toEqual([5, 12, 30]);
  });

  it('no muta el arreglo original', () => {
    const items = [{ nombre: 'z' }, { nombre: 'a' }];
    const copia = [...items];
    ordenarPorValor(items, (i) => i.nombre, 'asc');
    expect(items).toEqual(copia);
  });
});
