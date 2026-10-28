import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { adaptarEvidenciaLegada } from '@/utils/escoEvidencia';
import { resumirContexto } from '@/utils/escoConsultas';

// Explicitly synthetic controls; no reviewed historical truth or model scoring.
const complete = (total = 0) => ({
  _evidencia: { herramienta: 'get_hato_partos', consulta_completa: true,
    detalle_completo: true, total_hechos: total, rango: { desde: '2026-09-01', hasta: '2026-09-30' },
    consultado_en: '2026-10-07', cobertura_registros: { hato_eventos: total } },
  resumen: { total }, detalle: [],
});

describe('typed legacy evidence adapter (synthetic)', () => {
  it('distinguishes complete-empty, successful, missing, failure and stale', () => {
    expect(adaptarEvidenciaLegada(complete())).toMatchObject({ outcome: 'complete-empty', complete: true });
    expect(adaptarEvidenciaLegada(complete(2)).outcome).toBe('success');
    expect(adaptarEvidenciaLegada({}).outcome).toBe('unknown');
    expect(adaptarEvidenciaLegada(null).outcome).toBe('unavailable');
    for (const error of ['', null, false, '503']) {
      expect(adaptarEvidenciaLegada({ ...complete(), error })).toMatchObject({ outcome: 'unavailable', complete: false });
    }
    expect(adaptarEvidenciaLegada(complete(), { stale: true })).toMatchObject({ outcome: 'stale', complete: false });
  });
  it('does not equate complete retrieval with complete delivered detail', () => {
    const result = complete(101);
    result._evidencia.detalle_completo = false;
    expect(adaptarEvidenciaLegada(result)).toMatchObject({ outcome: 'partial', complete: false,
      retrieval_complete: true, detail_complete: false, truncation: { detail: true } });
    expect(adaptarEvidenciaLegada({ _evidencia: { consulta_completa: true } }).complete).toBeNull();
    expect(adaptarEvidenciaLegada({ _evidencia: { consulta_completa: 'true', detalle_completo: true } }).complete).toBeNull();
  });
  it('keeps unknown scope, time precision, freshness, units and references unknown', () => {
    expect(adaptarEvidenciaLegada(complete())).toMatchObject({
      scope: { entity_ids: null }, period: { from: '2026-09-01', to: '2026-09-30', timezone: null },
      retrieved_on: '2026-10-07', retrieved_at: null, observed_at: null, units: null, source_refs: null,
    });
    expect(adaptarEvidenciaLegada({ _evidencia: { consultado_en: '2026-02-30' } }).retrieved_on).toBeNull();
  });
  it('projects known metadata instead of copying headers, secrets or raw payload', () => {
    const result = { ...complete(), headers: { Authorization: 'synthetic-secret' }, error_detail: 'synthetic-secret' };
    Object.assign(result._evidencia, { api_key: 'synthetic-secret', fuentes: ['not-authorized'],
      cobertura_registros: { hato_eventos: 0, Authorization: 'synthetic-secret', invalid: -1 } });
    const adapted = adaptarEvidenciaLegada(result);
    expect(adapted.coverage).toEqual({ hato_eventos: 0 });
    expect(JSON.stringify(adapted)).not.toContain('synthetic-secret');
    expect(adapted.source_refs).toBeNull();
  });
  it('never calls truncated context complete, including explicit empty results', () => {
    for (const result of [complete(), complete(2), { ...complete(), error: 'synthetic failure' }]) {
      const persisted = JSON.parse(resumirContexto(JSON.stringify(result), 1));
      expect(persisted._evidencia_v1.complete).toBe(false);
      expect(persisted._evidencia_v1.truncation.context).toBe(true);
      expect(persisted._evidencia.consulta_completa).toBe(false);
      expect(persisted._evidencia.detalle_completo).toBe(false);
      expect(persisted._evidencia_v1.period.from).toBe('2026-09-01');
      expect(persisted.resumen).toEqual(result.resumen);
    }
    const failed = JSON.parse(resumirContexto(JSON.stringify({ ...complete(), error: 'x'.repeat(100) }), 1));
    expect(failed.error).toBeTruthy();
    expect(failed._evidencia_v1.outcome).toBe('unavailable');
  });
  it('leaves short results byte-identical and handles invalid JSON and primitives', () => {
    const short = JSON.stringify(complete());
    expect(resumirContexto(short)).toBe(short);
    for (const text of ['broken-json', 'null', '42', '[]', '"text"']) {
      const persisted = JSON.parse(resumirContexto(text, 1));
      expect(persisted._evidencia_v1).toMatchObject({ outcome: 'unavailable', complete: false });
    }
  });
  it('keeps the shared evidence module identical in both generated edge trees', () => {
    for (const tree of ['src/supabase/functions/server', 'supabase/functions/make-server-1ccce916']) {
      expect(readFileSync(`${tree}/esco-evidencia.ts`, 'utf8')).toBe(readFileSync('src/utils/escoEvidencia.ts', 'utf8'));
    }
  });
});

describe('typed producer metadata consumers (synthetic)', () => {
  it('preserves known metadata through truncation without accepting a contradictory complete flag', async () => {
    const { leerEvidencia, recortarEvidencia } = await import('@/utils/escoEvidencia');
    const typed = { ...adaptarEvidenciaLegada(complete(1)), period: { from: '2026-09-01', to: '2026-09-30', timezone: 'America/Bogota' },
      retrieved_at: '2026-10-07T12:00:00.000Z', units: { 'resumen.total_eventos': 'eventos' },
      scope: { entity_ids: ['synthetic-animal'] }, source_refs: [{ table: 'hato_eventos', id: 'synthetic-event' }] };
    const result = { ...complete(1), _evidencia_v1: typed };
    expect(leerEvidencia(result)).toEqual(typed);
    const persisted = JSON.parse(resumirContexto(JSON.stringify(result), 1));
    expect(persisted._evidencia_v1).toMatchObject({ complete: false, outcome: 'partial',
      retrieved_at: typed.retrieved_at, units: typed.units, scope: typed.scope, source_refs: typed.source_refs, period: typed.period });
    expect(leerEvidencia(persisted).outcome).toBe('partial');
    expect(recortarEvidencia({ ...result, _evidencia_v1: { ...typed, outcome: 'stale', complete: false } }).outcome).toBe('stale');
    for (const mutation of [
      { version: 2 }, { period: { ...typed.period, from: '2026-02-30' } },
      { period: { ...typed.period, from: '2026-10-01' } },
      { truncation: { context: true, detail: false } }, { detail_complete: false },
      { outcome: 'unavailable' }, { outcome: 'stale' }, { outcome: 'complete-empty' },
      { observed_at: '2026-02-30T12:00:00.000Z' }, { coverage: { hato_eventos: -1 } },
      { source_refs: [{ table: 'hato_eventos', id: 'https://not-a-row.test' }] },
    ]) expect(leerEvidencia({ ...result, _evidencia_v1: { ...typed, ...mutation } })).toMatchObject({ outcome: 'unavailable', complete: false });
    expect(leerEvidencia({ ...result, error: '' }).outcome).toBe('unavailable');
    expect(leerEvidencia({ ...result, _evidencia_v1: null }).outcome).toBe('unavailable');
  });
  it('adapts legacy reads and failures without inventing precision or accepting invalid JSON', async () => {
    const { adjuntarEvidencia } = await import('@/utils/escoEvidencia');
    const legacy = { _evidencia: { consulta_completa: false }, total_registros: 0 };
    const adapted = JSON.parse(adjuntarEvidencia(JSON.stringify(legacy), 'get_inventory_status'));
    expect(adapted._evidencia_v1).toMatchObject({ outcome: 'partial', complete: false, tool: 'get_inventory_status', source_refs: null });
    expect(adapted.total_registros).toBe(0);
    for (const result of ['not-json', 'null', '[]', '{"error":null}', '{"error":"503"}']) {
      expect(JSON.parse(adjuntarEvidencia(result, 'get_hato_partos'))._evidencia_v1).toMatchObject({ outcome: 'unavailable', complete: false });
    }
  });
});
