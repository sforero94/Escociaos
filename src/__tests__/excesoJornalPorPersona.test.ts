import { describe, it, expect } from 'vitest';
import { calcularExcesoJornalPorPersona } from '@/utils/laborCosts';

// Hallazgo ESCO-70: 42 casos reales de una persona sumando más de un jornal
// el mismo día, repartida entre varios lotes -- hasta 2,25 jornales. Decisión
// de Santiago: es error de captura masiva, y la guarda BLOQUEA.
describe('calcularExcesoJornalPorPersona', () => {
  it('no marca a nadie cuando el total del día es exactamente 1.0', () => {
    const excesos = calcularExcesoJornalPorPersona(
      [{ personaId: 'p1', fraccion: 0.5 }],
      [{ personaId: 'p1', fraccion: 0.5 }],
    );
    expect(excesos).toEqual([]);
  });

  it('no marca a nadie por debajo de 1.0', () => {
    const excesos = calcularExcesoJornalPorPersona(
      [{ personaId: 'p1', fraccion: 0.25 }],
      [{ personaId: 'p1', fraccion: 0.5 }],
    );
    expect(excesos).toEqual([]);
  });

  it('marca a la persona cuando lo ya existente más lo nuevo supera 1.0', () => {
    const excesos = calcularExcesoJornalPorPersona(
      [{ personaId: 'p1', fraccion: 0.5 }],
      [{ personaId: 'p1', fraccion: 0.75 }],
    );
    expect(excesos).toEqual([{ personaId: 'p1', totalJornales: 1.25 }]);
  });

  it('detecta el exceso DENTRO de un mismo envío repartido en varios lotes (sin nada previo)', () => {
    // El caso real: una sola operación reparte a la misma persona entre dos
    // lotes en el mismo instante, sin que exista ningún registro previo.
    const excesos = calcularExcesoJornalPorPersona(
      [],
      [
        { personaId: 'p1', fraccion: 0.75 },
        { personaId: 'p1', fraccion: 0.75 },
      ],
    );
    expect(excesos).toEqual([{ personaId: 'p1', totalJornales: 1.5 }]);
  });

  it('tolera el redondeo de punto flotante en 1.0 exacto', () => {
    const excesos = calcularExcesoJornalPorPersona(
      [{ personaId: 'p1', fraccion: 0.1 + 0.2 }], // 0.30000000000000004
      [{ personaId: 'p1', fraccion: 0.7 }],
    );
    expect(excesos).toEqual([]);
  });

  it('no cruza los totales de dos personas distintas', () => {
    const excesos = calcularExcesoJornalPorPersona(
      [{ personaId: 'p1', fraccion: 0.5 }, { personaId: 'p2', fraccion: 0.5 }],
      [{ personaId: 'p1', fraccion: 0.25 }, { personaId: 'p2', fraccion: 0.75 }],
    );
    expect(excesos).toEqual([{ personaId: 'p2', totalJornales: 1.25 }]);
  });

  it('reproduce el caso real: 0.5 + 0.5 + 0.5 = 1.5 jornales en un día', () => {
    const excesos = calcularExcesoJornalPorPersona(
      [{ personaId: 'de7e9c3b', fraccion: 0.5 }],
      [
        { personaId: 'de7e9c3b', fraccion: 0.5 },
        { personaId: 'de7e9c3b', fraccion: 0.5 },
      ],
    );
    expect(excesos).toEqual([{ personaId: 'de7e9c3b', totalJornales: 1.5 }]);
  });
});
