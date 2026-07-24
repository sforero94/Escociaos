// ARCHIVO: __tests__/hatoAlertas.test.ts
// DESCRIPCIÓN: TDD de la derivación COMPARTIDA de alertas del hato (Figma
// alignment spec Wave 2b, §7, `utils/hatoAlertas.ts`). Cubre el contrato
// que el Dashboard y la Cola de alertas dependen de que nunca diverja:
// las 4 señales, el aplanado en filas, la identidad nombre-primero para
// chapetas provisionales, y que "servir" nunca produce una fecha
// inventada.

import { describe, it, expect } from 'vitest';
import {
  derivarAlertasHato,
  nombreAnimalAlerta,
  fechaSenalAlerta,
  ALERTA_META,
  PILL_ALERTA,
  type AlertaHatoFila,
} from '../utils/hatoAlertas';
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

describe('derivarAlertasHato', () => {
  it('clasifica próxima a secar por la alerta explícita o por el estado proxima_a_secar', () => {
    const a = animal({ animalId: 'a', derivado: derivado({ alertas: { ...derivado().alertas, secado_due: true } }) });
    const b = animal({ animalId: 'b', derivado: derivado({ estado: 'proxima_a_secar' }) });
    const c = animal({ animalId: 'c' }); // servida, sin ninguna alerta -- no debe aparecer
    const resultado = derivarAlertasHato([a, b, c]);
    expect(resultado.proximasASecar.map((x) => x.animalId).sort()).toEqual(['a', 'b']);
  });

  it('clasifica próxima a parir solo por alertas.parto_proximo', () => {
    const a = animal({ animalId: 'a', derivado: derivado({ alertas: { ...derivado().alertas, parto_proximo: true } }) });
    const b = animal({ animalId: 'b' });
    const resultado = derivarAlertasHato([a, b]);
    expect(resultado.proximasAParir.map((x) => x.animalId)).toEqual(['a']);
  });

  it('clasifica rechequeo pendiente solo por alertas.rechequeo_due', () => {
    const a = animal({ animalId: 'a', derivado: derivado({ alertas: { ...derivado().alertas, rechequeo_due: true } }) });
    const b = animal({ animalId: 'b' });
    const resultado = derivarAlertasHato([a, b]);
    expect(resultado.rechequeoPendiente.map((x) => x.animalId)).toEqual(['a']);
  });

  it('vacías por servir se calcula SOLO sobre el hato en ordeño (categoria === "hato")', () => {
    const enOrdenoVacia = animal({ animalId: 'a', categoria: 'hato', derivado: derivado({ estado: 'vacia_por_servir' }) });
    const horroVacia = animal({ animalId: 'b', categoria: 'horro', derivado: derivado({ estado: 'vacia_por_servir' }) });
    const resultado = derivarAlertasHato([enOrdenoVacia, horroVacia]);
    expect(resultado.vaciasPorServir.map((x) => x.animalId)).toEqual(['a']);
  });

  it('aplana las 4 listas en el orden secado→parto→rechequeo→servir', () => {
    const secado = animal({ animalId: 'secado', derivado: derivado({ estado: 'proxima_a_secar' }) });
    const parto = animal({ animalId: 'parto', derivado: derivado({ alertas: { ...derivado().alertas, parto_proximo: true } }) });
    const rechequeo = animal({ animalId: 'rechequeo', derivado: derivado({ alertas: { ...derivado().alertas, rechequeo_due: true } }) });
    const servir = animal({ animalId: 'servir', categoria: 'hato', derivado: derivado({ estado: 'vacia_por_servir' }) });
    const resultado = derivarAlertasHato([servir, rechequeo, parto, secado]);
    expect(resultado.filas.map((f) => f.tipo)).toEqual(['secado', 'parto', 'rechequeo', 'servir']);
  });

  it('un animal sin ninguna señal activa no genera ninguna fila', () => {
    const resultado = derivarAlertasHato([animal({ animalId: 'quieto' })]);
    expect(resultado.filas).toEqual([]);
  });
});

describe('nombreAnimalAlerta', () => {
  it('lidera con el número cuando la chapeta NO es provisional', () => {
    const a = animal({ numero: 47, numeroEsProvisional: false, nombre: 'Estrella' });
    expect(nombreAnimalAlerta(a)).toEqual({ principal: '#47', secundario: 'Estrella' });
  });

  it('lidera con el nombre cuando la chapeta ES provisional (800-999)', () => {
    const a = animal({ numero: 947, numeroEsProvisional: true, nombre: 'Estrella' });
    expect(nombreAnimalAlerta(a)).toEqual({ principal: 'Estrella', secundario: '#947' });
  });

  it('lidera con el nombre cuando no hay número, y sin secundario', () => {
    const a = animal({ numero: null, nombre: 'Estrella' });
    expect(nombreAnimalAlerta(a)).toEqual({ principal: 'Estrella', secundario: null });
  });

  it('usa "Sin nombre" cuando falta el nombre y la chapeta es provisional', () => {
    const a = animal({ numero: 900, numeroEsProvisional: true, nombre: null });
    expect(nombreAnimalAlerta(a)).toEqual({ principal: 'Sin nombre', secundario: '#900' });
  });
});

describe('fechaSenalAlerta', () => {
  it('secado usa fecha_secar', () => {
    const fila: AlertaHatoFila = { tipo: 'secado', animal: animal({ derivado: derivado({ fecha_secar: '2026-08-01' }) }) };
    expect(fechaSenalAlerta(fila)).toBe('2026-08-01');
  });

  it('parto usa fecha_probable_parto', () => {
    const fila: AlertaHatoFila = { tipo: 'parto', animal: animal({ derivado: derivado({ fecha_probable_parto: '2026-09-01' }) }) };
    expect(fechaSenalAlerta(fila)).toBe('2026-09-01');
  });

  it('rechequeo usa ultimoChequeoFecha', () => {
    const fila: AlertaHatoFila = { tipo: 'rechequeo', animal: animal({ ultimoChequeoFecha: '2026-05-01' }) };
    expect(fechaSenalAlerta(fila)).toBe('2026-05-01');
  });

  it('servir NUNCA produce una fecha -- no hay fecha objetivo honesta para esa señal', () => {
    const fila: AlertaHatoFila = { tipo: 'servir', animal: animal({ ultimoChequeoFecha: '2026-05-01' }) };
    expect(fechaSenalAlerta(fila)).toBeNull();
  });
});

describe('ALERTA_META / PILL_ALERTA -- contrato de las 4 claves', () => {
  it('cubre exactamente los 4 tipos de alerta', () => {
    expect(Object.keys(ALERTA_META).sort()).toEqual(['parto', 'rechequeo', 'secado', 'servir']);
    expect(Object.keys(PILL_ALERTA).sort()).toEqual(['parto', 'rechequeo', 'secado', 'servir']);
  });

  it('el pill de secado es "Vencido" cuando ya pasó la fecha', () => {
    const a = animal({ derivado: derivado({ fecha_secar: '2026-01-01' }) });
    const chip = PILL_ALERTA.secado(a, '2026-07-24');
    expect(chip.label).toBe('Vencido');
  });
});
