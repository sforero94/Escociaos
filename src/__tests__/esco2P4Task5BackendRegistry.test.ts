import { describe, expect, it } from 'vitest';
import { validarPlan, herramientasPlanificador } from '../utils/esco2/registro.ts';
const llamada = (nombre: string, args: object) => ({ nombre, argumentos: JSON.stringify(args) });
describe('P4-5 registro cerrado', () => {
  it('registra pesajes y quincenas como operaciones separadas', () => {
    expect(JSON.stringify(herramientasPlanificador())).toContain('consultar_pesajes_leche');
    expect(validarPlan([llamada('consultar_litros_quincenales', { desde: '2026-01-01', hasta: '2026-01-31' })]).tipo).toBe('operaciones');
  });
  it.each([{ desde: '2026-02-30', hasta: '2026-03-15' }, { desde: '2026-01-01', hasta: '2026-01-31', precio: true }, { desde: '2026-01-01', hasta: '2026-01-31', litros_por_vaca: true }])('rechaza otros cálculos y fechas %#', args => {
    expect(() => validarPlan([llamada('consultar_litros_quincenales', args)])).toThrow();
  });
});
