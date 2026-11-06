import { describe, expect, it } from 'vitest';
import { ejecutarMonitoreo } from '../utils/esco2/monitoreo.ts';
import { fuenteMonitoreoSupabase } from '../utils/esco2/monitoreoFuente.ts';
import type { ConsultaMonitoreo, DatosMonitoreo } from '../utils/esco2/monitoreoTipos.ts';
import { clientePostgrestFalso } from './esco2PostgrestFalso.ts';

const ids = Array.from({ length: 8 }, (_, n) => `ca000000-0000-4000-8000-${String(n + 1).padStart(12, '0')}`);
const [ronda, lote, sublote, plaga, o1, o2] = ids;
const consulta: ConsultaMonitoreo = { ronda_ids: [ronda], rondas: [], lote_ids: [lote], lotes: [], sublote_ids: [], sublotes: [], plaga_ids: [plaga], plagas: [], agrupar_por: [] };
const datos = (): DatosMonitoreo => ({
  rondas: [{ id: ronda, nombre: 'Ronda de laboratorio', fecha_inicio: '2026-10-01', fecha_fin: '2026-10-03' }],
  lotes: [{ id: lote, nombre: 'Lote de laboratorio' }], sublotes: [{ id: sublote, lote_id: lote, nombre: 'Sublote de laboratorio' }], plagas: [{ id: plaga, nombre: 'Plaga de laboratorio' }],
  observaciones: [
    { id: o1, ronda_id: ronda, lote_id: lote, sublote_id: sublote, plaga_enfermedad_id: plaga, fecha_monitoreo: '2026-10-01', arboles_afectados: 1, arboles_monitoreados: 10 },
    { id: o2, ronda_id: ronda, lote_id: lote, sublote_id: sublote, plaga_enfermedad_id: plaga, fecha_monitoreo: '2026-10-03', arboles_afectados: 9, arboles_monitoreados: 90 },
  ],
});
describe('P4-1 backend suma validada y disponibilidad', () => {
  it('pondera las observaciones, con fechas operativas y motor compartido', () => {
    const r = ejecutarMonitoreo(consulta, datos(), 'p1', '2026-11-05');
    expect(r.estado).toBe('ok');
    expect(r.filas).toHaveLength(1);
    expect(r.filas[0]).toMatchObject({ afectados: 10, muestreados: 100, observaciones: 2, incidencia: 10, gravedad: 'Media', fechas: ['2026-10-01', '2026-10-03'] });
  });
  it.each([0, null, Number.NaN, -1])('un denominador %s no acredita cero por ciento', n => {
    const d = datos(); d.observaciones![0].arboles_monitoreados = n;
    const r = ejecutarMonitoreo(consulta, d, 'p1', '2026-11-05');
    expect(r.estado).toBe('parcial');
    expect(r.filas[0]).toMatchObject({ estado: 'no_calculable', incidencia: null, gravedad: null });
  });
  it('una observación omitida en transporte deja la lectura no disponible', () => {
    const d = datos(); delete d.observaciones![0].arboles_monitoreados;
    expect(ejecutarMonitoreo(consulta, d, 'p1', '2026-11-05').estado).toBe('no_disponible');
  });
  it('una PK repetida no se suma ni se deduplica silenciosamente', () => {
    const d = datos(); d.observaciones!.push({ ...d.observaciones![0] });
    expect(ejecutarMonitoreo(consulta, d, 'p1', '2026-11-05').estado).toBe('no_disponible');
  });
  it('la misma PK UUID con otra caja sigue siendo repetida', () => {
    const d = datos(); d.observaciones!.push({ ...d.observaciones![0], id: d.observaciones![0].id.toUpperCase() });
    expect(ejecutarMonitoreo(consulta, d, 'p1', '2026-11-05').estado).toBe('no_disponible');
  });
  it('el lector conserva la paginación exacta y proyecciones fijas', async () => {
    const d = datos();
    const tablas = { rondas_monitoreo: d.rondas!, lotes: d.lotes!, sublotes: d.sublotes!, plagas_enfermedades_catalogo: d.plagas!, monitoreos: d.observaciones! };
    const cliente = clientePostgrestFalso(Object.fromEntries(Object.entries(tablas).map(([nombre, filas]) => [nombre, filas.map(f => ({ ...f }))])), { maxFilas: 1 });
    const fuente = fuenteMonitoreoSupabase(cliente);
    const catalogo = await fuente.catalogo();
    const observaciones = await fuente.leerObservaciones();
    expect(catalogo.rondas).toHaveLength(1);
    expect(observaciones).toHaveLength(2);
    expect(cliente.llamadas.filter(l => l.tabla === 'monitoreos').map(l => l.rango?.[0])).toEqual([0, 1]);
    expect(cliente.llamadas.every(l => !l.columnas.includes('*'))).toBe(true);
  });
});
