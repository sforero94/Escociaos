/**
 * ESCO-134 — retiro de alertas abiertas cuyo hecho ya está registrado.
 *
 * Antes de que las alertas de gerencia (`parto_proximo`,
 * `servicio_sin_confirmacion`) salgan por Telegram, el tick tiene que dejar
 * de sostener abiertas las alertas que ya se respondieron con un evento.
 * Caso vivo: ENIGMA #119 parió el 2026-09-20 y su `parto_proximo` (creada
 * 2026-09-16, programada 2026-09-30) seguía `pendiente`.
 */

import { describe, it, expect } from 'vitest';
import {
  alertasConHechoRegistrado,
  MOTIVO_DESCARTE_HECHO_REGISTRADO,
  type AlertaAbiertaConHecho,
  type EventoHatoParaRetiro,
} from '@/utils/hatoAlertas';

const AHORA = '2026-10-02T10:45:00.000Z';
const ENIGMA = 'animal-enigma';

function alerta(overrides: Partial<AlertaAbiertaConHecho> = {}): AlertaAbiertaConHecho {
  return {
    id: 'alerta-1',
    tipo: 'parto_proximo',
    estado: 'pendiente',
    regla_clave: `parto:${ENIGMA}:2025-12-24`,
    animal_id: ENIGMA,
    created_at: '2026-09-16T10:45:00.000Z',
    datos: { numero: 119, nombre: 'ENIGMA', fecha_servicio: '2025-12-24', fecha_probable_parto: '2026-09-30' },
    ...overrides,
  };
}

function evento(tipo: string, fecha: string, animal_id: string | null = ENIGMA): EventoHatoParaRetiro {
  return { animal_id, tipo, fecha };
}

describe('alertasConHechoRegistrado — parto_proximo', () => {
  it('ENIGMA: un parto posterior al servicio retira la alerta abierta', () => {
    const r = alertasConHechoRegistrado([alerta()], [evento('parto', '2026-09-20')], AHORA);
    expect(r).toHaveLength(1);
    expect(r[0].id).toBe('alerta-1');
    expect(r[0].datos.motivo_descarte).toBe(MOTIVO_DESCARTE_HECHO_REGISTRADO);
    expect(r[0].datos.motivo_descarte).toBe('hecho_registrado');
    expect(r[0].datos.descartada_en).toBe(AHORA);
    expect(r[0].datos.descartada_por).toBe('tick_hato_alertas');
    // No pisa el contenido previo de `datos`.
    expect(r[0].datos.nombre).toBe('ENIGMA');
    expect(r[0].datos.fecha_servicio).toBe('2025-12-24');
    expect(r[0].evento_tipo).toBe('parto');
    expect(r[0].evento_fecha).toBe('2026-09-20');
  });

  it('un parto ANTERIOR o igual al servicio que ancla la alerta no la retira (es el parto previo)', () => {
    expect(alertasConHechoRegistrado([alerta()], [evento('parto', '2025-03-01')], AHORA)).toEqual([]);
    expect(alertasConHechoRegistrado([alerta()], [evento('parto', '2025-12-24')], AHORA)).toEqual([]);
  });

  it('un parto de OTRO animal no la retira', () => {
    expect(alertasConHechoRegistrado([alerta()], [evento('parto', '2026-09-20', 'otro')], AHORA)).toEqual([]);
  });

  it('otros tipos de evento no retiran parto_proximo (solo parto)', () => {
    const eventos = ['servicio', 'confirmacion_prenez', 'secado_real', 'celo'].map((t) => evento(t, '2026-09-20'));
    expect(alertasConHechoRegistrado([alerta()], eventos, AHORA)).toEqual([]);
  });

  it('sin fecha_servicio en datos cae a la fecha de creación de la alerta (>=)', () => {
    const a = alerta({ datos: { numero: 119 } });
    expect(alertasConHechoRegistrado([a], [evento('parto', '2026-09-16')], AHORA)).toHaveLength(1);
    expect(alertasConHechoRegistrado([a], [evento('parto', '2026-09-15')], AHORA)).toEqual([]);
  });

  it('sin animal_id, o sin ninguna fecha ancla, NO retira (nunca inventa)', () => {
    expect(alertasConHechoRegistrado([alerta({ animal_id: null })], [evento('parto', '2026-09-20')], AHORA)).toEqual([]);
    const sinAncla = alerta({ datos: null, created_at: null });
    expect(alertasConHechoRegistrado([sinAncla], [evento('parto', '2026-09-20')], AHORA)).toEqual([]);
  });

  it('una fecha_servicio malformada en datos no se usa como ancla', () => {
    const a = alerta({ datos: { fecha_servicio: 'ayer' }, created_at: null });
    expect(alertasConHechoRegistrado([a], [evento('parto', '2026-09-20')], AHORA)).toEqual([]);
  });

  it('alertas manuales del gestor web no se tocan', () => {
    const a = alerta({ regla_clave: 'manual:xyz', datos: { origen: 'manual', fecha_servicio: '2025-12-24' } });
    expect(alertasConHechoRegistrado([a], [evento('parto', '2026-09-20')], AHORA)).toEqual([]);
  });

  it('solo alertas abiertas (pendiente/enviada/escalada)', () => {
    for (const estado of ['respondida', 'confirmada', 'descartada', 'expirada'] as const) {
      expect(alertasConHechoRegistrado([alerta({ estado })], [evento('parto', '2026-09-20')], AHORA)).toEqual([]);
    }
    for (const estado of ['pendiente', 'enviada', 'escalada'] as const) {
      expect(alertasConHechoRegistrado([alerta({ estado })], [evento('parto', '2026-09-20')], AHORA)).toHaveLength(1);
    }
  });
});

describe('alertasConHechoRegistrado — servicio_sin_confirmacion', () => {
  const base = (overrides: Partial<AlertaAbiertaConHecho> = {}) =>
    alerta({
      tipo: 'servicio_sin_confirmacion',
      regla_clave: `servconf:${ENIGMA}:2026-07-01`,
      datos: { numero: 119, nombre: 'ENIGMA', fecha_servicio: '2026-07-01' },
      created_at: '2026-08-15T10:45:00.000Z',
      ...overrides,
    });

  it.each(['confirmacion_prenez', 'parto', 'aborto', 'servicio'])(
    'un %s posterior al servicio retira la alerta',
    (tipo) => {
      const r = alertasConHechoRegistrado([base()], [evento(tipo, '2026-08-20')], AHORA);
      expect(r).toHaveLength(1);
      expect(r[0].tipo).toBe('servicio_sin_confirmacion');
      expect(r[0].evento_tipo).toBe(tipo);
    },
  );

  it('el propio servicio (misma fecha) no cuenta como un servicio NUEVO', () => {
    expect(alertasConHechoRegistrado([base()], [evento('servicio', '2026-07-01')], AHORA)).toEqual([]);
  });

  it('eventos anteriores al servicio no la retiran', () => {
    const eventos = ['confirmacion_prenez', 'parto', 'aborto', 'servicio'].map((t) => evento(t, '2026-06-01'));
    expect(alertasConHechoRegistrado([base()], eventos, AHORA)).toEqual([]);
  });

  it('celo / secado_real no confirman nada y no la retiran', () => {
    const eventos = ['celo', 'secado_real', 'rechequeo'].map((t) => evento(t, '2026-08-20'));
    expect(alertasConHechoRegistrado([base()], eventos, AHORA)).toEqual([]);
  });
});

describe('alertasConHechoRegistrado — tipos fuera de alcance', () => {
  it('secado_due, tratamiento_paso, rechequeo_due y tipos desconocidos nunca se retiran por este camino', () => {
    const eventos = ['parto', 'confirmacion_prenez', 'aborto', 'servicio', 'secado_real'].map((t) =>
      evento(t, '2026-09-20'),
    );
    for (const tipo of ['secado_due', 'tratamiento_paso', 'rechequeo_due', 'otro_modulo']) {
      expect(alertasConHechoRegistrado([alerta({ tipo })], eventos, AHORA)).toEqual([]);
    }
  });

  it('lista vacía de eventos -> nada que retirar', () => {
    expect(alertasConHechoRegistrado([alerta()], [], AHORA)).toEqual([]);
  });
});
