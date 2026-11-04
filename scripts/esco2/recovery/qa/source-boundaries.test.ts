// Supplemental discoveries against the already frozen source matrix. Not new members
// of the 16-scenario denominator and no mutation of frozen references.
import { describe, expect, it } from 'vitest';
import { runVariant } from '../shared.ts';
import { escenarios } from './scenarios.ts';

describe('supplemental P0 source-guarantee integration controls', () => {
  for (const variant of ['repair','redesign'] as const) {
    it(`${variant}: complete record population with dangling task reference cannot assert a subtotal`, async () => {
      const input = structuredClone(escenarios.find(s=>s.id==='S05')!.entrada);
      input.datos.registros.push({id:'dangling',tarea_id:'missing-task',lote_id:'l1',fecha_trabajo:'2026-10-27',fraccion_jornal:1,costo_jornal:0});
      const output=await runVariant(input,variant);
      expect(output.resultados[0].disposicion).toBe('fuente_no_disponible');
      expect(output.resultados[0].afirmaciones).toEqual([]);
    });
    it(`${variant}: missing category relation cannot silently exclude a task`, async () => {
      const input = structuredClone(escenarios.find(s=>s.id==='S12')!.entrada);
      input.datos.tareas.find(t=>t.id==='t2')!.tipo_tarea_id='missing-type';
      const output=await runVariant(input,variant);
      expect(output.resultados[0].disposicion).toBe('fuente_no_disponible');
      expect(output.resultados[0].afirmaciones).toEqual([]);
    });
    it(`${variant}: unread category field cannot become executable filter evidence`, async () => {
      const input = structuredClone(escenarios.find(s=>s.id==='S12')!.entrada);
      input.fuente.camposNoDisponibles.push('tiposTareas.categoria');
      const output=await runVariant(input,variant);
      expect(output.resultados[0].disposicion).toBe('fuente_no_disponible');
      expect(output.resultados[0].afirmaciones).toEqual([]);
    });
    it(`${variant}: independent table reads cannot certify strict grouped reconciliation`, async () => {
      const input = structuredClone(escenarios.find(s=>s.id==='S11')!.entrada);
      input.fuente.consistencia='lecturas_independientes';
      const output=await runVariant(input,variant);
      expect(output.resultados[0].disposicion).toBe('fuente_no_disponible');
      expect(output.resultados[0].afirmaciones).toEqual([]);
    });
  }
});
