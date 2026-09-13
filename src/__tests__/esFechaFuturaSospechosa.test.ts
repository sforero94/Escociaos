import { describe, it, expect } from 'vitest';
import { esFechaFuturaSospechosa } from '@/utils/fechas';

// Hallazgo ESCO-91: cuatro gastos capturados el 2026-09-08 con fecha
// 2026-09-13 quedaron invisibles en el historial (filtro `ytd`, tope hoy)
// durante cinco días. El guard es un margen de UN día, no cero: guardar a
// las 23:50 con la fecha de mañana no debe disparar una advertencia.
describe('esFechaFuturaSospechosa', () => {
  const HOY = '2026-09-08';

  it('no marca la fecha de hoy', () => {
    expect(esFechaFuturaSospechosa(HOY, HOY)).toBe(false);
  });

  it('no marca mañana (un día de margen)', () => {
    expect(esFechaFuturaSospechosa('2026-09-09', HOY)).toBe(false);
  });

  it('marca el caso real: cinco días en el futuro', () => {
    expect(esFechaFuturaSospechosa('2026-09-13', HOY)).toBe(true);
  });

  it('no marca una fecha pasada', () => {
    expect(esFechaFuturaSospechosa('2026-09-01', HOY)).toBe(false);
  });

  it('no marca una fecha inválida o vacía', () => {
    expect(esFechaFuturaSospechosa('', HOY)).toBe(false);
    expect(esFechaFuturaSospechosa('no-es-fecha', HOY)).toBe(false);
  });
});
