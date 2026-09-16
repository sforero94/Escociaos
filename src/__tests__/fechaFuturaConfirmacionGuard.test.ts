/**
 * ESCO-91: a future-dated gasto/ingreso saves, then vanishes from the
 * historial (`fecha <= hoy`) until that day arrives. Soft confirm, never a
 * hard block. This guard pins the four capture surfaces to the shared helper
 * so a later edit cannot drop the warn+confirm on one of them in silence.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  esFechaFuturaSospechosa,
  mensajeConfirmacionFechaFutura,
  ETIQUETA_CONFIRMAR_FECHA_FUTURA,
  ETIQUETA_CORREGIR_FECHA_FUTURA,
} from '@/utils/fechas';

const RAIZ = resolve(__dirname, '../..');

const SUPERFICIES: { archivo: string; tipo: 'gasto' | 'ingreso' }[] = [
  { archivo: 'src/components/finanzas/components/GastoForm.tsx', tipo: 'gasto' },
  { archivo: 'src/components/finanzas/components/IngresoForm.tsx', tipo: 'ingreso' },
  { archivo: 'src/components/finanzas/components/GastosBatchTable.tsx', tipo: 'gasto' },
  { archivo: 'src/components/finanzas/components/IngresosBatchTable.tsx', tipo: 'ingreso' },
];

describe('ESCO-91: confirmación suave de fecha futura', () => {
  it.each(SUPERFICIES)('$archivo pide confirmación y no bloquea', ({ archivo }) => {
    const fuente = readFileSync(resolve(RAIZ, archivo), 'utf-8');
    expect(fuente).toContain('esFechaFuturaSospechosa');
    expect(fuente).toContain('mensajeConfirmacionFechaFutura');
    expect(fuente).toContain('ConfirmDialog');
    expect(fuente).toContain('ETIQUETA_CONFIRMAR_FECHA_FUTURA');
    expect(fuente).toContain('ETIQUETA_CORREGIR_FECHA_FUTURA');
    expect(fuente).not.toMatch(/throw new Error\([^)]*futur/i);
    expect(fuente).not.toMatch(/toast\.error\([^)]*futur/i);
  });

  it('el usuario puede confirmar y guardar (no es un bloqueo)', () => {
    expect(ETIQUETA_CONFIRMAR_FECHA_FUTURA).toBe('Guardar de todas formas');
    expect(ETIQUETA_CORREGIR_FECHA_FUTURA).toBe('Corregir fecha');
  });

  it('la copia nombra el registro y la fecha en dd/mm/aaaa', () => {
    expect(mensajeConfirmacionFechaFutura('gasto', ['2026-09-13'])).toContain('este gasto');
    expect(mensajeConfirmacionFechaFutura('gasto', ['2026-09-13'])).toContain('13/09/2026');
    expect(mensajeConfirmacionFechaFutura('ingreso', ['2026-09-13'])).toContain('este ingreso');
    expect(mensajeConfirmacionFechaFutura('gasto', ['2026-09-13', '2026-09-20'])).toContain('estos gastos');
    expect(esFechaFuturaSospechosa('2026-09-13', '2026-09-08')).toBe(true);
  });
});
