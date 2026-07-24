// ARCHIVO: __tests__/hatoAlertasTablero.test.ts
// DESCRIPCIÓN: TDD de la derivación de señales del "Tablero de alertas" del
// Dashboard (`utils/hatoAlertasTablero.ts`, Figma alignment spec §7). NO es
// el motor S6 (ese es `utils/hatoAlertas.ts`, con su propio test): esto solo
// cubre el resumen derivado client-side que consume `HatoDashboard.tsx` --
// las 4 señales, el aplanado en filas, la identidad nombre-primero para
// chapetas provisionales, y el contrato de las 4 claves de meta/pill.

import { describe, it, expect } from 'vitest';
import {
  derivarAlertasTablero,
  nombreAnimalTablero,
  ALERTA_META_TABLERO,
  PILL_ALERTA_TABLERO,
} from '../utils/hatoAlertasTablero';
import type { AnimalHatoDerivado } from '../components/hato/hooks/useHatoAnimales';
import type { EstadoReproductivoDerivado } from '../utils/calculosHato';

function derivado(overrides: Partial<EstadoReproductivoDerivado> = {}): EstadoReproductivoDerivado {
  return {
    estado: 'servida',
    fecha_secar: null,
    fecha_probable_parto: null,
    dias_abiertos: null,
    proxima_a_reemplazo: false,
    vacia_es_problema: null,
    alertas: { secado_due: false, rechequeo_due: false, servicio_sin_confirmacion: false, parto_proximo: false },
    ...overrides,
  };
}

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
    derivado: derivado(),
    categoria: 'hato',
    ...overrides,
  };
}

describe('derivarAlertasTablero', () => {
  it('clasifica próxima a secar por la alerta explícita o por el estado proxima_a_secar', () => {
    const a = animal({ animalId: 'a', derivado: derivado({ alertas: { ...derivado().alertas, secado_due: true } }) });
    const b = animal({ animalId: 'b', derivado: derivado({ estado: 'proxima_a_secar' }) });
    const c = animal({ animalId: 'c' }); // servida, sin ninguna alerta -- no debe aparecer
    const resultado = derivarAlertasTablero([a, b, c]);
    expect(resultado.proximasASecar.map((x) => x.animalId).sort()).toEqual(['a', 'b']);
  });

  it('clasifica próxima a parir solo por alertas.parto_proximo', () => {
    const a = animal({ animalId: 'a', derivado: derivado({ alertas: { ...derivado().alertas, parto_proximo: true } }) });
    const b = animal({ animalId: 'b' });
    expect(derivarAlertasTablero([a, b]).proximasAParir.map((x) => x.animalId)).toEqual(['a']);
  });

  it('clasifica rechequeo pendiente solo por alertas.rechequeo_due', () => {
    const a = animal({ animalId: 'a', derivado: derivado({ alertas: { ...derivado().alertas, rechequeo_due: true } }) });
    const b = animal({ animalId: 'b' });
    expect(derivarAlertasTablero([a, b]).rechequeoPendiente.map((x) => x.animalId)).toEqual(['a']);
  });

  it('vacías por servir se calcula SOLO sobre el hato en ordeño (categoria === "hato")', () => {
    const enOrdeno = animal({ animalId: 'a', categoria: 'hato', derivado: derivado({ estado: 'vacia_por_servir' }) });
    const horro = animal({ animalId: 'b', categoria: 'horro', derivado: derivado({ estado: 'vacia_por_servir' }) });
    expect(derivarAlertasTablero([enOrdeno, horro]).vaciasPorServir.map((x) => x.animalId)).toEqual(['a']);
  });

  it('aplana las 4 listas en el orden secado→parto→rechequeo→servir', () => {
    const secado = animal({ animalId: 'secado', derivado: derivado({ estado: 'proxima_a_secar' }) });
    const parto = animal({ animalId: 'parto', derivado: derivado({ alertas: { ...derivado().alertas, parto_proximo: true } }) });
    const rechequeo = animal({ animalId: 'rechequeo', derivado: derivado({ alertas: { ...derivado().alertas, rechequeo_due: true } }) });
    const servir = animal({ animalId: 'servir', categoria: 'hato', derivado: derivado({ estado: 'vacia_por_servir' }) });
    expect(derivarAlertasTablero([servir, rechequeo, parto, secado]).filas.map((f) => f.tipo)).toEqual([
      'secado', 'parto', 'rechequeo', 'servir',
    ]);
  });

  it('un animal sin ninguna señal activa no genera ninguna fila', () => {
    expect(derivarAlertasTablero([animal({ animalId: 'quieto' })]).filas).toEqual([]);
  });
});

describe('nombreAnimalTablero', () => {
  it('lidera con el número cuando la chapeta NO es provisional', () => {
    expect(nombreAnimalTablero(animal({ numero: 47, numeroEsProvisional: false, nombre: 'Estrella' }))).toEqual({
      principal: '#47', secundario: 'Estrella',
    });
  });

  it('lidera con el nombre cuando la chapeta ES provisional (800-999)', () => {
    expect(nombreAnimalTablero(animal({ numero: 947, numeroEsProvisional: true, nombre: 'Estrella' }))).toEqual({
      principal: 'Estrella', secundario: '#947',
    });
  });

  it('lidera con el nombre cuando no hay número, y sin secundario', () => {
    expect(nombreAnimalTablero(animal({ numero: null, nombre: 'Estrella' }))).toEqual({
      principal: 'Estrella', secundario: null,
    });
  });

  it('usa "Sin nombre" cuando falta el nombre y la chapeta es provisional', () => {
    expect(nombreAnimalTablero(animal({ numero: 900, numeroEsProvisional: true, nombre: null }))).toEqual({
      principal: 'Sin nombre', secundario: '#900',
    });
  });
});

describe('ALERTA_META_TABLERO / PILL_ALERTA_TABLERO -- contrato de las 4 claves', () => {
  it('cubre exactamente los 4 tipos de alerta', () => {
    expect(Object.keys(ALERTA_META_TABLERO).sort()).toEqual(['parto', 'rechequeo', 'secado', 'servir']);
    expect(Object.keys(PILL_ALERTA_TABLERO).sort()).toEqual(['parto', 'rechequeo', 'secado', 'servir']);
  });

  it('el pill de secado es "Vencido" cuando ya pasó la fecha', () => {
    const a = animal({ derivado: derivado({ fecha_secar: '2026-01-01' }) });
    expect(PILL_ALERTA_TABLERO.secado(a, '2026-07-24').label).toBe('Vencido');
  });
});
