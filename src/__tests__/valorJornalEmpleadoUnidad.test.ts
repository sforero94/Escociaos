// ARCHIVO: __tests__/valorJornalEmpleadoUnidad.test.ts
// DESCRIPCIÓN: Cierra el hallazgo #45 de la operación de mantenimiento.
// registros_trabajo.valor_jornal_empleado guardaba dos cosas incompatibles: en
// 2.489 filas el salario MENSUAL crudo, en 120 el valor de UN jornal (la tarifa,
// no la fracción trabajada). Decisión de Santiago (2026-09-13): la columna es
// el valor de un jornal, derivado del salario mensual — "en un mes hay 22
// jornales" — el mismo DIAS_LABORALES_MES que ya rige costo_jornal
// (jornalDivisorContract.test.ts).
//
// Este guard es por FORMA de código, no por importar los cuatro escritores:
// dos son componentes de React (jsdom pesado para una asignación de una línea)
// y dos son árboles Deno que no se pueden importar desde Vitest. Mismo patrón
// que jornalDivisorContract.test.ts.
//
// Lo que NO hace: no toca las 2.489 filas históricas. Esa es una reparación de
// datos aparte, con su propia migración y respaldo — normalizar el dato antes
// de cerrar los escritores lo ensuciaría de nuevo en días.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DIAS_LABORALES_MES, calculateLaborCost } from '@/utils/laborCosts';

const RAIZ = join(__dirname, '..', '..');
const leer = (rel: string) => readFileSync(join(RAIZ, rel), 'utf-8');

const JORNALERO = { salario: 1_750_905, prestaciones: 508_148, auxilios: 249_045 };

describe('valor_jornal_empleado — la tarifa de un jornal, nunca el salario mensual crudo', () => {
  it('la tarifa de un jornal es el salario mensual total dividido por 22, no el salario crudo', () => {
    const { dailyCost } = calculateLaborCost({
      salary: JORNALERO.salario,
      benefits: JORNALERO.prestaciones,
      allowances: JORNALERO.auxilios,
      fractionWorked: 1,
    });
    const total = JORNALERO.salario + JORNALERO.prestaciones + JORNALERO.auxilios;
    expect(dailyCost).toBeCloseTo(total / DIAS_LABORALES_MES, 2);
    expect(dailyCost).not.toBe(JORNALERO.salario);
  });

  it('dailyCost no depende de la fracción trabajada ese día', () => {
    const base = {
      salary: JORNALERO.salario,
      benefits: JORNALERO.prestaciones,
      allowances: JORNALERO.auxilios,
    };
    const completo = calculateLaborCost({ ...base, fractionWorked: 1 }).dailyCost;
    const medio = calculateLaborCost({ ...base, fractionWorked: 0.5 }).dailyCost;
    expect(completo).toBe(medio);
  });
});

describe('guard estático — ningún escritor guarda el salario crudo en valor_jornal_empleado', () => {
  it('RegistrarTrabajoDialog.tsx usa la tarifa derivada, no trabajador.data.salario', () => {
    const contenido = leer('src/components/labores/RegistrarTrabajoDialog.tsx');
    expect(contenido).not.toMatch(/valor_jornal_empleado\s*=\s*trabajador\.data\.salario/);
    expect(contenido).toMatch(/calcularValorJornalEmpleado/);
  });

  it('EditarRegistroDialog.tsx usa la tarifa derivada, no empleado.salario', () => {
    const contenido = leer('src/components/labores/EditarRegistroDialog.tsx');
    expect(contenido).not.toMatch(/valorJornalEmpleado\s*=\s*empleado\.salario/);
    expect(contenido).toMatch(/valorJornalEmpleado\s*=\s*laborCost\.dailyCost/);
  });

  it.each([
    'src/supabase/functions/server/telegram/conversations/jornal.ts',
    'supabase/functions/make-server-1ccce916/telegram/conversations/jornal.ts',
  ])('%s usa calcValorJornalEmpleado, no w.salario crudo', (rel) => {
    const contenido = leer(rel);
    expect(contenido).not.toMatch(/valor_jornal_empleado:\s*isEmp\s*\?\s*\(?w\.salario/);
    expect((contenido.match(/calcValorJornalEmpleado\(/g) || []).length).toBe(3); // 1 declaración + 2 usos
  });

  it('las dos copias del bot siguen calculando exactamente igual (precedente jornalDivisorContract)', () => {
    const sinCabecera = (rel: string) => leer(rel).split('\n').slice(1).join('\n').replace(/\s+/g, ' ');
    expect(sinCabecera('src/supabase/functions/server/telegram/conversations/jornal.ts')).toBe(
      sinCabecera('supabase/functions/make-server-1ccce916/telegram/conversations/jornal.ts'),
    );
  });
});
