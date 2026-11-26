/**
 * ESCO-186 — borrar un parto desde la app también borra la ficha automática
 * de la ternera (ESCO-135) cuando sigue intacta; si no, la conserva y avisa.
 *
 * Caso real que lo motivó: VENUS #151. Se borró el parto desde la Hoja de
 * Vida y la ficha automática de la ternera quedó viva y huérfana.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it, expect, vi } from 'vitest';
import {
  eliminarEventoHato,
  REFERENCIAS_CRIA,
  sumarReferencias,
  type CriaLeida,
  type DependenciasEliminarEvento,
} from '@/utils/hato/eliminarPartoConCria';
import { NOMBRE_CRIA_SIN_NOMBRE, ORIGEN_CRIA_AUTOMATICA } from '@/utils/hato/criaAutomatica';

const MADRE = 'madre-venus';
const CRIA = 'cria-1';

const parto = { id: 'parto-1', tipo: 'parto', animal_id: MADRE, cria_id: CRIA };

function criaIntacta(extra: Partial<CriaLeida> = {}): CriaLeida {
  return {
    id: CRIA,
    numero: 216,
    madre_id: MADRE,
    nombre: NOMBRE_CRIA_SIN_NOMBRE,
    estado: 'activa',
    import_meta: { origen: ORIGEN_CRIA_AUTOMATICA },
    ...extra,
  };
}

function deps(over: Partial<DependenciasEliminarEvento> = {}) {
  const orden: string[] = [];
  const d: DependenciasEliminarEvento = {
    leerCria: vi.fn(async () => ({ cria: criaIntacta(), error: null })),
    contarReferencias: vi.fn(async () => 0),
    borrarEvento: vi.fn(async (id: string) => {
      orden.push(`evento:${id}`);
      return null;
    }),
    borrarCria: vi.fn(async (id: string) => {
      orden.push(`cria:${id}`);
      return null;
    }),
    ...over,
  };
  return { d, orden };
}

describe('eliminarEventoHato', () => {
  it('un evento que no es parto solo borra el evento', async () => {
    const { d, orden } = deps();
    const r = await eliminarEventoHato({ ...parto, tipo: 'servicio' }, d);
    expect(r).toEqual({ ok: true });
    expect(orden).toEqual(['evento:parto-1']);
    expect(d.leerCria).not.toHaveBeenCalled();
  });

  it('un parto sin cria_id solo borra el evento', async () => {
    const { d, orden } = deps();
    const r = await eliminarEventoHato({ ...parto, cria_id: null }, d);
    expect(r).toEqual({ ok: true });
    expect(orden).toEqual(['evento:parto-1']);
    expect(d.leerCria).not.toHaveBeenCalled();
  });

  it('ficha intacta: borra el parto y DESPUÉS la ficha', async () => {
    const { d, orden } = deps();
    const r = await eliminarEventoHato(parto, d);
    expect(r).toEqual({ ok: true, criaBorrada: { numero: 216 } });
    // El orden es forzoso: hato_eventos.cria_id referencia la ficha.
    expect(orden).toEqual(['evento:parto-1', 'cria:cria-1']);
    expect(d.contarReferencias).toHaveBeenCalledWith(CRIA, 'parto-1');
  });

  it('ficha con otros registros: borra el parto, conserva la ficha y avisa', async () => {
    const { d, orden } = deps({ contarReferencias: vi.fn(async () => 1) });
    const r = await eliminarEventoHato(parto, d);
    expect(r.ok).toBe(true);
    expect(r.criaBorrada).toBeUndefined();
    expect(r.avisoCria).toContain('#216');
    expect(r.avisoCria).toContain('se conservó');
    expect(orden).toEqual(['evento:parto-1']);
  });

  it('ficha con nombre: la conserva (alguien ya trabajó en ella)', async () => {
    const { d, orden } = deps({
      leerCria: vi.fn(async () => ({ cria: criaIntacta({ nombre: 'LUNA' }), error: null })),
    });
    const r = await eliminarEventoHato(parto, d);
    expect(r.avisoCria).toContain('LUNA');
    expect(orden).toEqual(['evento:parto-1']);
  });

  it('ficha que no creó el flujo automático: la conserva', async () => {
    const { d, orden } = deps({
      leerCria: vi.fn(async () => ({ cria: criaIntacta({ import_meta: null }), error: null })),
    });
    const r = await eliminarEventoHato(parto, d);
    expect(r.ok).toBe(true);
    expect(r.avisoCria).toBeDefined();
    expect(orden).toEqual(['evento:parto-1']);
  });

  it('ficha de otra madre: la conserva', async () => {
    const { d, orden } = deps({
      leerCria: vi.fn(async () => ({ cria: criaIntacta({ madre_id: 'otra' }), error: null })),
    });
    const r = await eliminarEventoHato(parto, d);
    expect(r.avisoCria).toBeDefined();
    expect(orden).toEqual(['evento:parto-1']);
  });

  it('ficha muerta (caso VENUS): la conserva', async () => {
    const { d, orden } = deps({
      leerCria: vi.fn(async () => ({ cria: criaIntacta({ estado: 'muerta' }), error: null })),
    });
    const r = await eliminarEventoHato(parto, d);
    expect(r.avisoCria).toBeDefined();
    expect(orden).toEqual(['evento:parto-1']);
  });

  it('cria_id apunta a una ficha que ya no existe: borra el parto', async () => {
    const { d, orden } = deps({ leerCria: vi.fn(async () => ({ cria: null, error: null })) });
    const r = await eliminarEventoHato(parto, d);
    expect(r).toEqual({ ok: true });
    expect(orden).toEqual(['evento:parto-1']);
    expect(d.contarReferencias).not.toHaveBeenCalled();
  });

  it('si no se puede leer la ficha, no borra nada', async () => {
    const { d, orden } = deps({ leerCria: vi.fn(async () => ({ cria: null, error: 'timeout' })) });
    const r = await eliminarEventoHato(parto, d);
    expect(r.ok).toBe(false);
    expect(r.error).toContain('no se borró nada');
    expect(orden).toEqual([]);
  });

  it('si falla el borrado del parto, no toca la ficha', async () => {
    const { d } = deps({ borrarEvento: vi.fn(async () => 'permission denied') });
    const r = await eliminarEventoHato(parto, d);
    expect(r).toEqual({ ok: false, error: 'permission denied' });
    expect(d.borrarCria).not.toHaveBeenCalled();
  });

  it('si falla el borrado de la ficha, el parto queda borrado y lo dice', async () => {
    const { d } = deps({ borrarCria: vi.fn(async () => 'violates foreign key constraint') });
    const r = await eliminarEventoHato(parto, d);
    expect(r.ok).toBe(true);
    expect(r.criaBorrada).toBeUndefined();
    expect(r.avisoCria).toContain('no se pudo borrar');
    expect(r.avisoCria).toContain('violates foreign key constraint');
  });
});

describe('sumarReferencias', () => {
  it('suma los conteos', () => {
    expect(sumarReferencias([{ count: 0, error: null }, { count: 2, error: null }])).toBe(2);
  });

  it('falla cerrado: un error o un conteo nulo cuentan como referencia', () => {
    expect(sumarReferencias([{ count: 0, error: { message: 'x' } }])).toBe(1);
    expect(sumarReferencias([{ count: null, error: null }])).toBe(1);
    expect(sumarReferencias([{ count: 0, error: null }])).toBe(0);
  });
});

describe('REFERENCIAS_CRIA = las mismas que cuenta el Deshacer de Telegram', () => {
  const arboles = [
    'src/supabase/functions/server/telegram/bot.ts',
    'supabase/functions/make-server-1ccce916/telegram/bot.ts',
  ];

  for (const ruta of arboles) {
    it(ruta, () => {
      const fuente = readFileSync(resolve(process.cwd(), ruta), 'utf8');
      const inicio = fuente.indexOf('bot.callbackQuery(/^hato_ev_undo:/');
      expect(inicio).toBeGreaterThan(-1);
      const fin = fuente.indexOf('.delete()', inicio);
      const bloque = fuente.slice(inicio, fin);

      // Misma cantidad de conteos de un lado y del otro.
      const conteos = bloque.match(/count: "exact", head: true/g) ?? [];
      expect(conteos.length).toBe(REFERENCIAS_CRIA.length);

      for (const ref of REFERENCIAS_CRIA) {
        const patron = new RegExp(
          `from\\("${ref.tabla}"\\)[\\s\\S]{0,160}?\\.eq\\("${ref.columna}", criaId\\)`,
        );
        expect(bloque, `${ref.tabla}.${ref.columna}`).toMatch(patron);
      }
    });
  }
});
