import { describe, expect, it } from 'vitest';
import { COLUMNAS_APLICACIONES, fuenteAplicacionesSupabase } from '@/utils/esco2/aplicacionesFuente';
import type { ClienteDatos, FiltroPostgrest } from '@/utils/esco2/fuente';

const A = '00000000-0000-4000-8000-000000000001', H = '00000000-0000-4000-8000-000000000002';
const M = '00000000-0000-4000-8000-000000000011';
function cliente(tablas: Record<string, Record<string, unknown>[]>, fallar?: string, conteoExtra = 0) {
  const traza: { tabla: string; columnas: string }[] = [];
  const datos: ClienteDatos = { from(tabla) { return { select(columnas) {
    traza.push({ tabla, columnas });
    let desde = 0, hasta = 999;
    const query: FiltroPostgrest = {
      eq: () => query, gte: () => query, lte: () => query, order: () => query,
      range(a: number, b: number) { desde = a; hasta = b; return query; },
      then(resolve, reject) {
        const rows = tablas[tabla] ?? [];
        return Promise.resolve({ data: tabla === fallar ? null : rows.slice(desde, hasta + 1), error: tabla === fallar ? { message: 'synthetic unavailable' } : null, count: rows.length + conteoExtra }).then(resolve, reject);
      },
    };
    return query;
  } }; } };
  return { datos, traza };
}
describe('P3 Task 2 fixed source units', () => {
  it('reads exact fixed projections, retains unlinked parents and intersects child visibility', async () => {
    const c = cliente({ aplicaciones: [{ id: A, tarea_id: null, estado: null, fecha_inicio_planeada: '2026-11-01' }], movimientos_diarios: [{ id: M, aplicacion_id: A, fecha_movimiento: '2026-11-02' }, { id: H, aplicacion_id: H, fecha_movimiento: '2026-11-02' }] });
    const d = await fuenteAplicacionesSupabase(c.datos, { tamanoPagina: 1 }).leer('fecha_movimiento');
    expect(d.aplicaciones?.[0].tarea_id).toBeNull();
    expect(d.aplicaciones?.[0].nombre_aplicacion).toBeUndefined();
    expect(d.movimientos?.map(m => m.id)).toEqual([M]);
    expect(c.traza.every(t => t.columnas === COLUMNAS_APLICACIONES[t.tabla as keyof typeof COLUMNAS_APLICACIONES])).toBe(true);
    expect(c.traza.every(t => !t.columnas.includes('*'))).toBe(true);
    expect(c.traza.some(t => t.tabla === 'tareas' || t.tabla === 'productos')).toBe(false);
  });
  it('does not read unrelated children for planned-start selection', async () => {
    const c = cliente({ aplicaciones: [{ id: A, tarea_id: null }] });
    await fuenteAplicacionesSupabase(c.datos).leer('fecha_inicio_planeada');
    expect(c.traza.map(t => t.tabla)).toEqual(['aplicaciones']);
  });
  it('preserves a failed child table as unread while retaining visible parents', async () => {
    const c = cliente({ aplicaciones: [{ id: A, tarea_id: null }] }, 'aplicaciones_cierre');
    const d = await fuenteAplicacionesSupabase(c.datos).leer('fecha_cierre_operativo');
    expect(d.aplicaciones).toHaveLength(1); expect(d.cierres).toBeUndefined();
  });
  it('does not describe an incomplete table read as verified empty', async () => {
    const c = cliente({ aplicaciones: [] }, undefined, 1);
    expect((await fuenteAplicacionesSupabase(c.datos).leer('fecha_inicio_planeada')).aplicaciones).toBeUndefined();
  });
  it('rejects duplicate or non-UUID parent identities', async () => {
    for (const rows of [[{ id: 'not-an-id' }], [{ id: A }, { id: A }]]) {
      const c = cliente({ aplicaciones: rows });
      expect((await fuenteAplicacionesSupabase(c.datos).leer('fecha_inicio_planeada')).aplicaciones).toBeUndefined();
    }
  });
});
