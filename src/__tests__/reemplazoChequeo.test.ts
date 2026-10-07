import { beforeEach, describe, expect, it, vi } from 'vitest';
import { verificarReemplazoChequeo, ErrorConfirmacionReemplazoChequeo } from '@/utils/hato/reemplazoChequeo';

const db = vi.hoisted(() => ({
  existente: { data: null, error: null } as { data: { id: string } | null; error: { message: string } | null },
  conteo: { count: 35, error: null } as { count: number | null; error: { message: string } | null },
}));
vi.mock('@/utils/supabase/client', () => ({ getSupabase: () => ({
  from: (tabla: string) => ({ select: () => ({ eq: () => tabla === 'hato_chequeos'
    ? { maybeSingle: async () => db.existente } : Promise.resolve(db.conteo) }) }),
}) }));

describe('confirmación antes del reemplazo de un chequeo', () => {
  beforeEach(() => {
    db.existente = { data: { id: 'existente' }, error: null };
    db.conteo = { count: 35, error: null };
  });
  it('permite una fecha nueva sin confirmación', async () => {
    db.existente.data = null;
    await expect(verificarReemplazoChequeo('2026-09-08')).resolves.toBeUndefined();
  });
  it('exige confirmar las 35 filas existentes incluso si el import tiene menos filas', async () => {
    const error = await verificarReemplazoChequeo('2026-09-08').catch(e => e);
    expect(error).toBeInstanceOf(ErrorConfirmacionReemplazoChequeo);
    expect(error.chequeo).toEqual({ id: 'existente', fecha: '2026-09-08', filas: 35 });
  });
  it('permite solo la confirmación para la fecha, identidad y conteo actuales', async () => {
    await expect(verificarReemplazoChequeo('2026-09-08', { id: 'existente', fecha: '2026-09-08', filas: 35 })).resolves.toBeUndefined();
    for (const confirmado of [
      { id: 'otro', fecha: '2026-09-08', filas: 35 },
      { id: 'existente', fecha: '2026-09-09', filas: 35 },
      { id: 'existente', fecha: '2026-09-08', filas: 19 },
    ]) await expect(verificarReemplazoChequeo('2026-09-08', confirmado)).rejects.toBeInstanceOf(ErrorConfirmacionReemplazoChequeo);
  });
  it('vuelve a pedir confirmación si cambió el conteo después del primer intento', async () => {
    const pendiente = await verificarReemplazoChequeo('2026-09-08').catch(e => e);
    db.conteo.count = 36;
    await expect(verificarReemplazoChequeo('2026-09-08', pendiente.chequeo)).rejects.toMatchObject({ chequeo: { filas: 36 } });
  });
  it('no interpreta un error de lectura como una fecha vacía', async () => {
    db.existente.error = { message: 'sin conexión' };
    await expect(verificarReemplazoChequeo('2026-09-08')).rejects.toThrow('sin conexión');
  });
  it('bloquea si el conteo falla o no existe', async () => {
    db.conteo.error = { message: 'sin permiso' };
    await expect(verificarReemplazoChequeo('2026-09-08')).rejects.toThrow('sin permiso');
    db.conteo = { count: null, error: null };
    await expect(verificarReemplazoChequeo('2026-09-08')).rejects.toThrow('sin conteo');
  });
});
