// Independent code-audit regressions. Only invented rows; no campaign or model calls.
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { ejecutarClima, renderClima } from '../utils/esco2/clima.ts';
import { VARIABLES_CLIMA, type ResumenDiarioClima } from '../utils/esco2/climaTipos.ts';
import { ejecutarHato } from '../utils/esco2/hato.ts';
import { construirCoberturaFinal, validarFormaCoberturaFinal } from '../utils/esco2/cobertura.ts';
import { renderMensaje } from '../utils/esco2/mensajes.ts';
import { validarPlan, type LlamadaHerramienta } from '../utils/esco2/registro.ts';
import { manejar } from '../../supabase/functions/esco-consultas/manejador.ts';
import { dependencies, request } from './esco2P2Harness.ts';
import { hatoQaDb } from './esco2P4Task4QaHarness.ts';

const HOY = '2026-11-06';
function dia(fecha: string, cambios: Partial<ResumenDiarioClima>): ResumenDiarioClima {
  return {
    ...Object.fromEntries(VARIABLES_CLIMA.filter(k => k !== 'energia_kwh_m2').map(k => [k, null])),
    fecha, station_id: 'auditoria-sintetica', lluvia_confianza: 'ok', lecturas_count: 48,
    cobertura_hueco_max_min: 30, lluvia_mm_evento: null, ...cambios,
  } as ResumenDiarioClima;
}
function todosLosNumerosFinitos(valor: unknown): boolean {
  if (typeof valor === 'number') return Number.isFinite(valor);
  if (Array.isArray(valor)) return valor.every(todosLosNumerosFinitos);
  return valor === null || typeof valor !== 'object' || Object.values(valor).every(todosLosNumerosFinitos);
}
function llamadasHato(nombres: [string, string], pregunta: string): LlamadaHerramienta[] {
  return nombres.map((nombre, i) => ({
    nombre: 'consultar_hato',
    argumentos: JSON.stringify({ nombres: [nombre], parte_ids: ['s1'], ...(i === 0 ? {
      cobertura: { version: 1, partes: [{ id: 's1', texto: pregunta, capacidad: 'hato', disposicion: 'consultar' }] },
    } : {}) }),
  }));
}

afterEach(() => vi.unstubAllGlobals());

describe('P4-6 QA independiente: finitud posterior al cálculo climático', () => {
  it('una conversión de energía no finita conserva temperatura y no cuenta la energía como usable', () => {
    const r = ejecutarClima({ desde: '2026-10-01', hasta: '2026-10-01', variables: ['energia_kwh_m2', 'temp_c_avg'] },
      [dia('2026-10-01', { radiacion_wm2_avg: 1e308, temp_c_avg: 22 })], 'p1', HOY);
    expect(r.filas[0].valores.temp_c_avg).toBe(22);
    expect(r.filas[0].raw.radiacion_wm2_avg).toBe(1e308);
    expect(r.filas[0].valores.energia_kwh_m2).toBeNull();
    expect(r.filas[0].estados.energia_kwh_m2).toBe('no_usable');
    expect(r.resumen[0].variables.energia_kwh_m2?.cobertura.usables).toBe(0);
    expect(r.estado).toBe('parcial');
    expect(todosLosNumerosFinitos(r)).toBe(true);
    const texto = renderClima(r);
    expect(texto).not.toMatch(/∞|Infinity|NaN/);
    expect(texto).toMatch(/no calculable|no finito|desbord|incompatible/i);
  });

  it('un subtotal de lluvia desbordado conserva ambas observaciones y el promedio de temperatura', () => {
    const r = ejecutarClima({ desde: '2026-10-01', hasta: '2026-10-02', variables: ['lluvia_total_mm', 'temp_c_avg'] },
      [dia('2026-10-01', { lluvia_total_mm: 1e308, temp_c_avg: 22 }), dia('2026-10-02', { lluvia_total_mm: 1e308, temp_c_avg: 24 })], 'p1', HOY);
    expect(r.filas).toHaveLength(2);
    expect(r.filas.map(f => f.valores.lluvia_total_mm)).toEqual([1e308, 1e308]);
    expect(r.resumen[0].variables.temp_c_avg?.promedio).toBe(23);
    expect(r.resumen[0].lluvia.subtotal_dias_completos).toBeNull();
    expect(r.estado).toBe('parcial');
    expect(todosLosNumerosFinitos(r)).toBe(true);
    expect(renderClima(r)).not.toMatch(/∞|Infinity|NaN/);
    expect(renderClima(r)).toMatch(/no calculable|no finito|desbord|incompatible/i);
  });

  it('un promedio desbordado conserva la otra variable y no se serializa como un NULL sin causa', () => {
    const r = ejecutarClima({ desde: '2026-10-01', hasta: '2026-10-02', variables: ['temp_c_avg', 'humedad_pct_avg'] },
      [dia('2026-10-01', { temp_c_avg: 1e308, humedad_pct_avg: 60 }), dia('2026-10-02', { temp_c_avg: 1e308, humedad_pct_avg: 70 })], 'p1', HOY);
    expect(r.resumen[0].variables.humedad_pct_avg?.promedio).toBe(65);
    expect(r.resumen[0].variables.temp_c_avg?.promedio).toBeNull();
    expect(r.estado).toBe('parcial');
    expect(todosLosNumerosFinitos(r)).toBe(true);
    expect(JSON.parse(JSON.stringify(r)).resumen[0].variables.humedad_pct_avg.promedio).toBe(65);
    expect(renderClima(r)).toMatch(/no calculable|no finito|desbord|incompatible/i);
  });
});

describe('P4-6 QA independiente: varias operaciones para una parte', () => {
  it('una ficha parcial y un homónimo generan cobertura renderizable conservando ambos resultados', () => {
    const pregunta = 'Ficha de Clara y de Luna';
    const plan = validarPlan(llamadasHato(['Clara', 'Luna'], pregunta), { pregunta, exigirCobertura: true });
    if (plan.tipo !== 'operaciones') throw Error('El plan aceptado debe conservar las dos operaciones');
    const datos = { animales: [
      { id: 'ad600000-0000-4000-8000-000000000001', nombre: 'Clara', numero: 1 },
      { id: 'ad600000-0000-4000-8000-000000000002', nombre: 'Luna', numero: 2 },
      { id: 'ad600000-0000-4000-8000-000000000003', nombre: 'Luna', numero: 3 },
    ] };
    const resultados = plan.operaciones.map((o, i) => {
      if (o.tipo !== 'hato') throw Error('Sólo fichas de hato');
      return ejecutarHato(o.consulta, datos, `p${i + 1}`, HOY);
    });
    expect(resultados.map(r => r.estado)).toEqual(['parcial', 'no_resuelto']);
    const cobertura = construirCoberturaFinal(plan, resultados, HOY);
    expect(cobertura.partes[0].disposicion).toBe('aclarar');
    expect(cobertura.partes[0].resultado_ids).toEqual(['p1', 'p2']);
    expect(() => validarFormaCoberturaFinal(cobertura, resultados)).not.toThrow();
    const texto = renderMensaje(resultados, undefined, undefined, cobertura);
    expect(texto).toContain('Clara');
    expect(texto).toMatch(/repetid|única ficha/);
  });

  let db: PGlite;
  beforeAll(async () => { db = await hatoQaDb(); }, 30_000);
  afterAll(async () => { await db?.close(); });

  it('el manejador con SQL/JWT/RLS reales locales conserva ficha parcial y aclaración en HTTP 200', async () => {
    vi.stubGlobal('fetch', vi.fn(() => { throw Error('RED_PROHIBIDA_AUDITORIA'); }));
    const pregunta = 'Ficha de QA Lira y de QA Homónima';
    const h = dependencies(db, llamadasHato(['QA Lira', 'QA Homónima'], pregunta), {
      modoCobertura: 'obligatoria', ahora: () => new Date('2026-11-06T12:00:00Z'),
    });
    const response = await manejar(request({ pregunta }), h.deps);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.resultados.map((r: { estado: string }) => r.estado)).toEqual(['parcial', 'no_resuelto']);
    expect(body.resultados[0].filas[0].nombre).toBe('QA Lira');
    expect(body.cobertura.partes[0].disposicion).toBe('aclarar');
    expect(body.cobertura.partes[0].resultado_ids).toEqual(['p1', 'p2']);
    expect(body.cobertura.partes[0].parcial).toBeUndefined();
    expect(body.respuesta).toContain('QA Lira');
    expect(body.respuesta).toMatch(/repetid|única ficha/);
    expect(body.respuesta).not.toContain('NO PUBLICAR MADRE');
    expect(h.solicitudes).toHaveLength(1);
    expect(fetch).not.toHaveBeenCalled();
  });
});
