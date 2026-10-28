import { describe, expect, it } from 'vitest';
import { combinarVeredicto } from '@/utils/escoEvals/veredicto';
import { resumir } from '@/utils/escoEvals/reporte';
import { casoBase, corridaBase } from './escoEvalsFixtures';
import type { RevisionMedicion } from '@/utils/escoEvals/tipos';

function resultado() {
  return combinarVeredicto({ caso: casoBase(), corrida: corridaBase('Respuesta'), repeticion: 1, variante: 'principal', determinista: { pasa: true, chequeos: [] }, juez: { criterios: [], contradice_referencia: false, oculto_fallo_herramienta: null, comentario: '' }, juezEstado: 'ok' });
}
const revision: RevisionMedicion = { revisor: 'synthetic-reviewer', version: 'test-v1', resultado: 'aclaracion', apropiado: true, fallos: [], afirmaciones: [] };

describe('measurement contract v1', () => {
  it('accounts for all 56 selected IDs even when only one returns', () => {
    const ids = Array.from({ length: 56 }, (_, i) => `synthetic-${i}`);
    const r = { ...resultado(), caso_id: ids[0] };
    expect(resumir([r], ids).medicion).toMatchObject({ casos_esperados: 56, casos_presentes: [ids[0]], casos_faltantes: ids.slice(1), sin_revision: 1, exito_verificado: 0 });
  });
  it('keeps execution errors, unavailable judges and absent traces in the denominator', () => {
    const r = { ...resultado(), revision_medicion: revision };
    const error = { ...r, corrida: { ...r.corrida, error: 'timeout' } };
    const missing = { ...r, juez: null, juez_estado: 'error' as const };
    const empty = { ...r, corrida: { ...r.corrida, turnos: [] } };
    expect(resumir([error, missing, empty]).medicion).toMatchObject({ total: 3, ejecucion_fallida: 1, juez_no_disponible: 1, traza_ausente: 1, tasa_exito_verificado: 0 });
  });
  it('separates appropriate clarification, abstention and partial completion', () => {
    const r = { ...resultado(), revision_medicion: revision };
    const partial = { ...r, revision_medicion: { ...revision, resultado: 'respuesta_parcial' as const } };
    const abstention = { ...r, revision_medicion: { ...revision, resultado: 'abstencion' as const } };
    expect(resumir([r, partial, abstention]).medicion).toMatchObject({ aclaracion_apropiada: 1, abstencion_apropiada: 1, respuesta_parcial: 1, respuesta_completa: 0, exito_verificado: 3, tasa_soporte: null });
  });
  it('does not treat citations as support or deterministic-only passes as verified success', () => {
    const r = { ...resultado(), juez: null, juez_estado: 'omitido' as const, revision_medicion: { ...revision, afirmaciones: [{ id: '1', texto: 'Una cifra', soporte: 'ausente' as const, fuentes: ['source-1'], evidencia: 'source does not contain this fact' }], fallos: [{ categoria: 'afirmacion_sin_soporte' as const, severidad: 'critica' as const, evidencia: 'wrong attribution' }] } };
    expect(resumir([r]).medicion).toMatchObject({ exito_verificado: 0, juez_no_disponible: 1, tasa_soporte: 0, severidad: { critica: 1 } });
    expect(r.estado).toBe('pasa');
  });
});
