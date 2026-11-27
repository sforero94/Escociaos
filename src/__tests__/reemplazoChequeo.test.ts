import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  verificarReemplazoChequeo,
  ErrorConfirmacionReemplazoChequeo,
  clasificarContraChequeoExistente,
  type AnimalChequeoExistente,
} from '@/utils/hato/reemplazoChequeo';
import type { FilaChequeoNormalizada } from '@/utils/importHato/tipos';

type FilaDb = { animal_id: string; hato_animales: { numero: number | null; nombre: string | null } | null };

function filasDb(n: number): FilaDb[] {
  return Array.from({ length: n }, (_, i) => ({
    animal_id: `a${i + 1}`,
    hato_animales: { numero: i + 1, nombre: `VACA ${i + 1}` },
  }));
}

const db = vi.hoisted(() => ({
  existente: { data: null, error: null } as { data: { id: string } | null; error: { message: string } | null },
  filas: { data: [], error: null } as { data: unknown[] | null; error: { message: string } | null },
}));
vi.mock('@/utils/supabase/client', () => ({ getSupabase: () => ({
  from: (tabla: string) => ({ select: () => ({ eq: () => tabla === 'hato_chequeos'
    ? { maybeSingle: async () => db.existente } : Promise.resolve(db.filas) }) }),
}) }));

describe('confirmación antes de escribir sobre un chequeo existente', () => {
  beforeEach(() => {
    db.existente = { data: { id: 'existente' }, error: null };
    db.filas = { data: filasDb(13), error: null };
  });

  it('permite una fecha nueva sin confirmación', async () => {
    db.existente.data = null;
    await expect(verificarReemplazoChequeo('2026-11-24')).resolves.toBeUndefined();
  });

  it('pide elegir y devuelve las vacas que ya tiene el chequeo', async () => {
    const error = await verificarReemplazoChequeo('2026-11-24').catch(e => e);
    expect(error).toBeInstanceOf(ErrorConfirmacionReemplazoChequeo);
    expect(error.chequeo).toMatchObject({ id: 'existente', fecha: '2026-11-24', filas: 13 });
    expect(error.chequeo.animales).toHaveLength(13);
    expect(error.chequeo.animales[0]).toEqual({ animalId: 'a1', numero: 1, nombre: 'VACA 1' });
  });

  it('acepta solo la confirmación con la misma fecha, id y vacas', async () => {
    const pendiente = await verificarReemplazoChequeo('2026-11-24').catch(e => e);
    await expect(verificarReemplazoChequeo('2026-11-24', pendiente.chequeo)).resolves.toBeUndefined();
    for (const cambio of [
      { id: 'otro' },
      { fecha: '2026-11-25' },
      { filas: 12 },
      { animales: pendiente.chequeo.animales.slice(1) },
      { animales: [...pendiente.chequeo.animales.slice(1), { animalId: 'zz', numero: 99, nombre: 'X' }] },
    ]) {
      await expect(verificarReemplazoChequeo('2026-11-24', { ...pendiente.chequeo, ...cambio }))
        .rejects.toBeInstanceOf(ErrorConfirmacionReemplazoChequeo);
    }
  });

  it('vuelve a preguntar si otra página se guardó después del primer intento', async () => {
    const pendiente = await verificarReemplazoChequeo('2026-11-24').catch(e => e);
    db.filas = { data: filasDb(32), error: null };
    await expect(verificarReemplazoChequeo('2026-11-24', pendiente.chequeo))
      .rejects.toMatchObject({ chequeo: { filas: 32 } });
  });

  it('no interpreta un error de lectura como una fecha vacía', async () => {
    db.existente.error = { message: 'sin conexión' };
    await expect(verificarReemplazoChequeo('2026-11-24')).rejects.toThrow('sin conexión');
  });

  it('bloquea si la lectura de las filas falla o no devuelve una lista', async () => {
    db.filas = { data: null, error: { message: 'sin permiso' } };
    await expect(verificarReemplazoChequeo('2026-11-24')).rejects.toThrow('sin permiso');
    db.filas = { data: null, error: null };
    await expect(verificarReemplazoChequeo('2026-11-24')).rejects.toThrow('sin filas');
  });

  it('una fila sin ficha de animal queda con chapeta y nombre vacíos, nunca se pierde', async () => {
    db.filas = { data: [{ animal_id: 'a9', hato_animales: null }], error: null };
    const error = await verificarReemplazoChequeo('2026-11-24').catch(e => e);
    expect(error.chequeo.animales).toEqual([{ animalId: 'a9', numero: null, nombre: null }]);
  });
});

describe('clasificarContraChequeoExistente', () => {
  const existentes: AnimalChequeoExistente[] = [
    { animalId: 'a1', numero: 1, nombre: 'UNO' },
    { animalId: 'a2', numero: 2, nombre: 'DOS' },
    { animalId: 'a3', numero: 3, nombre: 'TRES' },
  ];
  const fila = (numero: number | null) => ({ numero, nombre: `N${numero}` }) as FilaChequeoNormalizada;

  it('página 2 sin cruce: conserva todas las guardadas y todas las nuevas son nuevas', () => {
    const r = clasificarContraChequeoExistente(existentes, [fila(4), fila(5)]);
    expect(r.seConservan.map(a => a.numero)).toEqual([1, 2, 3]);
    expect(r.seActualizan).toEqual([]);
    expect(r.nuevas.map(f => f.numero)).toEqual([4, 5]);
  });

  it('con cruce: la vaca repetida se actualiza y no cuenta como nueva', () => {
    const r = clasificarContraChequeoExistente(existentes, [fila(2), fila(4)]);
    expect(r.seConservan.map(a => a.numero)).toEqual([1, 3]);
    expect(r.seActualizan.map(a => a.numero)).toEqual([2]);
    expect(r.nuevas.map(f => f.numero)).toEqual([4]);
  });

  it('una fila sin chapeta nunca empareja con otra sin chapeta', () => {
    const r = clasificarContraChequeoExistente(
      [...existentes, { animalId: 'a0', numero: null, nombre: null }],
      [fila(null)],
    );
    expect(r.seActualizan).toEqual([]);
    expect(r.seConservan).toHaveLength(4);
    expect(r.nuevas).toHaveLength(1);
  });

  it('las tres listas cuadran: guardadas = conservadas + actualizadas', () => {
    const r = clasificarContraChequeoExistente(existentes, [fila(1), fila(2), fila(3), fila(7)]);
    expect(r.seConservan.length + r.seActualizan.length).toBe(existentes.length);
    expect(r.seConservan).toEqual([]);
  });
});
