/**
 * ESCO-172, opción A — una lectura cuya fecha cae dentro de la ventana
 * [fecha_inicio, fecha_fin] de la ronda más reciente se adjunta a esa ronda
 * aunque ya esté cerrada. Nunca se reutiliza una ronda cerrada para una fecha
 * posterior a su cierre. GAP_DIAS_NUEVA_RONDA sigue en 5.
 *
 * Caso real: R33 (2026-10-28 → 2026-11-04, cerrada) y la planilla de Salto S1
 * del 2026-10-28 tecleada después del cierre — antes creaba R34.
 */
import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { SupabaseClient } from '@supabase/supabase-js';
import { asignarRonda, fechaDentroDeRondaCerrada } from '@/utils/calculosMonitoreoV2';

interface Ronda { id: string; fecha_inicio: string; fecha_fin: string | null }

function crearSupabaseMock(ultimaRonda: Ronda | null, ultimoRegistro: string | null = null) {
  const insert = vi.fn(() => ({
    select: () => ({ single: async () => ({ data: { id: 'nueva' }, error: null }) }),
  }));
  const from = vi.fn((tabla: string) => {
    if (tabla === 'rondas_monitoreo') {
      return {
        select: (_cols: string, opts?: { head?: boolean }) => {
          if (opts?.head) return Promise.resolve({ count: 33 });
          return {
            order: () => ({ limit: () => ({ single: async () => ({ data: ultimaRonda }) }) }),
          };
        },
        insert,
      };
    }
    // monitoreos
    return {
      select: () => ({
        eq: () => ({
          order: () => ({
            limit: () => ({
              single: async () => ({
                data: ultimoRegistro ? { fecha_monitoreo: ultimoRegistro } : null,
              }),
            }),
          }),
        }),
      }),
    };
  });
  return { cliente: { from } as unknown as SupabaseClient, insert };
}

const R33: Ronda = { id: 'r33', fecha_inicio: '2026-10-28', fecha_fin: '2026-11-04' };

describe('fechaDentroDeRondaCerrada', () => {
  it('es verdadero dentro de la ventana, extremos incluidos', () => {
    expect(fechaDentroDeRondaCerrada('2026-10-28', R33)).toBe(true);
    expect(fechaDentroDeRondaCerrada('2026-11-01', R33)).toBe(true);
    expect(fechaDentroDeRondaCerrada('2026-11-04', R33)).toBe(true);
  });
  it('es falso antes del inicio o después del cierre', () => {
    expect(fechaDentroDeRondaCerrada('2026-10-27', R33)).toBe(false);
    expect(fechaDentroDeRondaCerrada('2026-11-05', R33)).toBe(false);
  });
  it('es falso para una ronda abierta', () => {
    expect(fechaDentroDeRondaCerrada('2026-10-28', { ...R33, fecha_fin: null })).toBe(false);
  });
  it('acepta fecha_fin con hora (timestamptz)', () => {
    expect(
      fechaDentroDeRondaCerrada('2026-11-04', { ...R33, fecha_fin: '2026-11-04T15:00:00+00:00' }),
    ).toBe(true);
  });
});

describe('asignarRonda — ronda más reciente cerrada', () => {
  it('una lectura del 10-28 guardada tras cerrar R33 recibe el id de R33', async () => {
    const { cliente, insert } = crearSupabaseMock(R33);
    await expect(asignarRonda(cliente, '2026-10-28')).resolves.toBe('r33');
    expect(insert).not.toHaveBeenCalled();
  });

  it('una lectura posterior al cierre crea una ronda nueva, como hoy', async () => {
    const { cliente, insert } = crearSupabaseMock(R33);
    await expect(asignarRonda(cliente, '2026-11-05')).resolves.toBe('nueva');
    expect(insert).toHaveBeenCalledWith({ fecha_inicio: '2026-11-05', nombre: 'Ronda 34' });
  });

  it('una lectura anterior al inicio de la ronda cerrada crea una ronda nueva, como hoy', async () => {
    const { cliente, insert } = crearSupabaseMock(R33);
    await expect(asignarRonda(cliente, '2026-10-26')).resolves.toBe('nueva');
    expect(insert).toHaveBeenCalledTimes(1);
  });
});

describe('asignarRonda — ronda más reciente abierta (sin cambio)', () => {
  const abierta: Ronda = { id: 'r35', fecha_inicio: '2026-11-05', fecha_fin: null };

  it('reutiliza dentro de 5 días del inicio', async () => {
    const { cliente, insert } = crearSupabaseMock(abierta);
    await expect(asignarRonda(cliente, '2026-11-08')).resolves.toBe('r35');
    expect(insert).not.toHaveBeenCalled();
  });

  it('reutiliza dentro de 5 días del último registro', async () => {
    const { cliente } = crearSupabaseMock(abierta, '2026-11-09');
    await expect(asignarRonda(cliente, '2026-11-13')).resolves.toBe('r35');
  });

  it('crea una ronda nueva más allá de 5 días', async () => {
    const { cliente, insert } = crearSupabaseMock(abierta, '2026-11-06');
    await expect(asignarRonda(cliente, '2026-11-20')).resolves.toBe('nueva');
    expect(insert).toHaveBeenCalledTimes(1);
  });
});

describe('copia de Telegram — misma regla en los dos árboles', () => {
  const rutas = [
    'src/supabase/functions/server/telegram/conversations/monitoreo.ts',
    'supabase/functions/make-server-1ccce916/telegram/conversations/monitoreo.ts',
  ];
  const fuentes = rutas.map((r) => readFileSync(resolve(process.cwd(), r), 'utf8'));

  it('las dos copias son idénticas', () => {
    expect(fuentes[0]).toBe(fuentes[1]);
  });

  it('reutiliza la ronda cerrada cuando la fecha cae dentro de su ventana', () => {
    expect(fuentes[0]).toMatch(
      /ultimaRonda\.fecha_fin\s*&&\s*fechaMonitoreo\s*>=\s*String\(ultimaRonda\.fecha_inicio\)\.slice\(0, 10\)\s*&&\s*fechaMonitoreo\s*<=\s*String\(ultimaRonda\.fecha_fin\)\.slice\(0, 10\)/,
    );
  });

  it('conserva GAP_DIAS = 5', () => {
    expect(fuentes[0]).toMatch(/const GAP_DIAS = 5;/);
  });
});
