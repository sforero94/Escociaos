// ARCHIVO: __tests__/jornalDivisorContract.test.ts
// DESCRIPCIÓN: El costo de un jornal de empleado se deriva del salario MENSUAL
// dividido por 22 días laborales. **22 es una decisión del dueño (Santiago,
// 2026-08-20), no una fórmula legal** — cierra la ambigüedad del hallazgo #3
// de la operación de mantenimiento.
//
// El defecto que cierra este contrato: la app dividía por
// `horas_semanales * 4.33 / 8`. Con las 44 horas semanales que tiene TODA la
// nómina de Escocia (20 de 21 empleados; el 21.º no tiene salario), eso da un
// divisor de 23,815 y subvalúa cada jornal un 7,6 %:
//
//   Jornalero tipo (1.750.905 + 508.148 + 249.045 = 2.508.098):
//     antes  2.508.098 / 23,815 = $105.316
//     ahora  2.508.098 / 22     = $114.004   (+$8.688 por jornal, +8,25 %)
//
// Esco (`chat.tsx`) ya dividía por 22, así que la app y el asistente daban
// cifras distintas para el mismo trabajo. Este guard existe para que no vuelvan
// a divergir: hay UN divisor y vive en tres árboles que no pueden importarse
// entre sí (navegador, edge function `src/supabase/...`, copia desplegada
// `supabase/functions/make-server-1ccce916/...`).
//
// Lo que este guard NO hace: no toca la historia. `registros_trabajo.costo_jornal`
// guarda el costo vigente al momento de registrar y sigue siendo el histórico
// correcto (2.550 filas, $160M). El cambio aplica solo a jornales nuevos.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  DIAS_LABORALES_MES,
  calculateLaborCost,
  calculateContractorCost,
} from '@/utils/laborCosts';

const RAIZ = join(__dirname, '..', '..');
const leer = (rel: string) => readFileSync(join(RAIZ, rel), 'utf-8');

/** Nómina real de Escocia a 2026-08 (jornalero tipo, 44 h semanales). */
const JORNALERO = { salario: 1_750_905, prestaciones: 508_148, auxilios: 249_045 };
const TOTAL_MENSUAL = JORNALERO.salario + JORNALERO.prestaciones + JORNALERO.auxilios;

describe('divisor del jornal — decisión del dueño: 22', () => {
  it('DIAS_LABORALES_MES es exactamente 22', () => {
    expect(DIAS_LABORALES_MES).toBe(22);
  });

  it('un jornal completo es salario mensual / 22', () => {
    const { totalCost, dailyCost } = calculateLaborCost({
      salary: JORNALERO.salario,
      benefits: JORNALERO.prestaciones,
      allowances: JORNALERO.auxilios,
      weeklyHours: 44,
      fractionWorked: 1,
    });
    expect(dailyCost).toBeCloseTo(TOTAL_MENSUAL / 22, 2);
    expect(Math.round(totalCost)).toBe(114_004);
  });

  it('ya NO devuelve la cifra vieja del divisor 23,815 (44 h × 4,33 / 8)', () => {
    const { totalCost } = calculateLaborCost({
      salary: JORNALERO.salario,
      benefits: JORNALERO.prestaciones,
      allowances: JORNALERO.auxilios,
      weeklyHours: 44,
      fractionWorked: 1,
    });
    expect(Math.round(totalCost)).not.toBe(105_316);
  });

  it('horas_semanales NO cambia el costo del jornal', () => {
    const base = { salary: JORNALERO.salario, benefits: JORNALERO.prestaciones, allowances: JORNALERO.auxilios, fractionWorked: 1 };
    const h44 = calculateLaborCost({ ...base, weeklyHours: 44 }).totalCost;
    const h48 = calculateLaborCost({ ...base, weeklyHours: 48 }).totalCost;
    const sinDato = calculateLaborCost({ ...base }).totalCost;
    expect(h44).toBe(h48);
    expect(h44).toBe(sinDato);
  });

  it('las fracciones son proporcionales al jornal completo', () => {
    const base = { salary: JORNALERO.salario, benefits: JORNALERO.prestaciones, allowances: JORNALERO.auxilios, weeklyHours: 44 };
    const completo = calculateLaborCost({ ...base, fractionWorked: 1 }).totalCost;
    for (const f of [0.25, 0.5, 0.75]) {
      expect(calculateLaborCost({ ...base, fractionWorked: f }).totalCost).toBeCloseTo(completo * f, 1);
    }
  });

  it('el contratista sigue cobrando su tarifa_jornal plana, sin divisor', () => {
    expect(calculateContractorCost(90_000, 1).totalCost).toBe(90_000);
    expect(calculateContractorCost(90_000, 0.5).totalCost).toBe(45_000);
  });
});

describe('guard estático — un solo divisor, en los tres árboles', () => {
  /** Ficheros que calculan el costo de un jornal de empleado. */
  const FICHEROS_COSTO_JORNAL = [
    'src/utils/laborCosts.ts',
    'src/supabase/functions/server/chat.tsx',
    'src/supabase/functions/server/telegram/conversations/jornal.ts',
    'supabase/functions/make-server-1ccce916/chat.tsx',
    'supabase/functions/make-server-1ccce916/telegram/conversations/jornal.ts',
  ];

  it.each(FICHEROS_COSTO_JORNAL)('%s no reintroduce el divisor por horas semanales', (rel) => {
    const contenido = leer(rel);
    expect(contenido, `${rel} volvió a usar 4.33 semanas/mes para el jornal`).not.toMatch(/4\.33/);
    expect(contenido, `${rel} volvió a declarar WEEKS_PER_MONTH`).not.toMatch(/WEEKS_PER_MONTH/);
  });

  it.each(FICHEROS_COSTO_JORNAL)('%s declara el divisor 22 y ningún otro', (rel) => {
    const contenido = leer(rel);
    const declaraciones = [...contenido.matchAll(/DIAS_LABORALES_MES\s*(?::\s*number\s*)?=\s*([0-9.]+)/g)];
    expect(declaraciones.length, `${rel} no declara DIAS_LABORALES_MES`).toBeGreaterThan(0);
    for (const d of declaraciones) {
      expect(d[1], `${rel} declara un divisor distinto de 22`).toBe('22');
    }
  });

  it('las dos copias del árbol de edge function calculan igual', () => {
    const sinCabecera = (rel: string) => leer(rel).split('\n').slice(1).join('\n').replace(/\s+/g, ' ');
    expect(sinCabecera('src/supabase/functions/server/telegram/conversations/jornal.ts')).toBe(
      sinCabecera('supabase/functions/make-server-1ccce916/telegram/conversations/jornal.ts'),
    );
  });
});
