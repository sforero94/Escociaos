// ARCHIVO: __tests__/useAnimalesParaPlanillaChequeoRoster.test.ts
// DESCRIPCIÓN: Finding #23 (P2, Data Integrity, mantenimiento 2026-08-24).
// `esCandidataAPlanilla` (`useAnimalesParaPlanillaChequeo.ts`) decidía el
// roster de la planilla de chequeo comparando contra `fila.etapa` CRUDA --
// el campo manual de `hato_animales` -- que nadie mantiene desde que las
// migraciones 089/092 volvieron la categoría CALCULADA (`num_partos` /
// `fecha_nacimiento`, con `etapa_forzada` como override explícito). Una
// novilla recién parida es 'vaca' para el resto del sistema apenas se
// registra el parto (`num_partos >= 1` siempre gana, ver
// `hatoCategorias.test.ts`), pero seguía sin aparecer en esta planilla
// porque `hato_animales.etapa` no se actualiza sola.
//
// Este archivo prueba SOLO la función de roster, no el hook completo (no
// hay patrón de `renderHook` en este repo, y `esCandidataAPlanilla` ya es
// pura una vez que recibe los umbrales y la fecha de referencia) -- debe
// FALLAR si alguien vuelve a comparar contra `fila.etapa` sin pasar antes
// por `calcularEtapaHato`.

import { describe, it, expect } from 'vitest';
import { esCandidataAPlanilla } from '@/components/hato/hooks/useAnimalesParaPlanillaChequeo';
import type { UmbralesCategoriaHato } from '@/utils/hatoCategorias';
import type { EstadoActualHatoViewRow } from '@/types/hato';

const UMBRALES: UmbralesCategoriaHato = { meses_ternera_leche_max: 3, meses_ternera_max: 12 };
const HOY = '2026-08-24';

function filaBase(overrides: Partial<EstadoActualHatoViewRow> = {}): EstadoActualHatoViewRow {
  return {
    animal_id: 'animal-1',
    numero: 200,
    nombre: 'PRUEBA',
    etapa: 'novilla',
    raza: 'jersey',
    estado: 'activa',
    ultimo_chequeo_vaca_id: null,
    ultimo_chequeo_fecha: null,
    pl: null,
    meses_prenez: null,
    fecha_secar: null,
    fecha_probable_parto: null,
    ultimo_servicio_fecha: null,
    ultimo_servicio_toro_id: null,
    ultimo_tipo_servicio: null,
    ultimo_parto_fecha: null,
    num_partos: 0,
    ultimo_secado_real_fecha: null,
    ultima_confirmacion_prenez_fecha: null,
    ultimo_evento_fecha: null,
    ultimo_estado_chequeo: null,
    fecha_nacimiento: null,
    etapa_forzada: false,
    ultima_confirmacion_prenez_metodo: null,
    ultimo_aborto_fecha: null,
    ...overrides,
  };
}

describe('esCandidataAPlanilla (roster de la planilla de chequeo, finding #23)', () => {
  it('una novilla que YA parió (num_partos >= 1) es candidata aunque `etapa` siga sin corregir a mano -- caso central del finding', () => {
    const fila = filaBase({ etapa: 'novilla', etapa_forzada: false, num_partos: 1, estado: 'activa' });
    expect(esCandidataAPlanilla(fila, UMBRALES, HOY)).toBe(true);
  });

  it('una novilla real (sin partos) NO es candidata -- el fix no debe empezar a incluir novillas de verdad', () => {
    const fila = filaBase({ etapa: 'novilla', etapa_forzada: false, num_partos: 0, estado: 'activa' });
    expect(esCandidataAPlanilla(fila, UMBRALES, HOY)).toBe(false);
  });

  it('una vaca ya marcada como tal (etapa cruda "vaca") sigue siendo candidata -- caso ya cubierto antes del fix', () => {
    const fila = filaBase({ etapa: 'vaca', etapa_forzada: false, num_partos: 3, estado: 'activa' });
    expect(esCandidataAPlanilla(fila, UMBRALES, HOY)).toBe(true);
  });

  it('etapa_forzada=true (override manual) gana SIEMPRE, incluso con num_partos >= 1: si Martha forzó "novilla" a mano, no entra a la planilla', () => {
    const fila = filaBase({ etapa: 'novilla', etapa_forzada: true, num_partos: 2, estado: 'activa' });
    expect(esCandidataAPlanilla(fila, UMBRALES, HOY)).toBe(false);
  });

  it('una vaca (calculada) pero ya vendida/muerta no entra al roster -- `estado` sigue siendo el segundo filtro', () => {
    const fila = filaBase({ etapa: 'novilla', etapa_forzada: false, num_partos: 1, estado: 'vendida' });
    expect(esCandidataAPlanilla(fila, UMBRALES, HOY)).toBe(false);
  });
});
