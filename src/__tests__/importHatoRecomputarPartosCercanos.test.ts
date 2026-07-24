/**
 * Tests de `recomputarPartosCercanos` -- el recompute batch (offline, sin
 * Supabase) del colapso de partos cercanos (owner decision 2026-07-23, ver
 * CLAUDE.md sección Hato Lechero). Puro, cero I/O -- mismo patrón que
 * `importHatoCommitChequeo.test.ts`.
 */

import { describe, it, expect } from 'vitest';
import {
  recomputarPartosCercanos,
  type EntradaRecomputePartosCercanos,
  type FilaChequeoVacaRecompute,
  type EventoPartoRecompute,
} from '@/utils/importHato/recomputarPartosCercanos';

function chequeoVaca(overrides: Partial<FilaChequeoVacaRecompute> = {}): FilaChequeoVacaRecompute {
  return {
    id: 'cv-1',
    animal_id: 'a1',
    chequeo_fecha: '2025-11-25',
    sx_raw: 'OV',
    ultima_cria_raw: '2/12/2025',
    ...overrides,
  };
}

function evento(overrides: Partial<EventoPartoRecompute> = {}): EventoPartoRecompute {
  return {
    id: 'ev-1',
    animal_id: 'a1',
    chequeo_vaca_id: 'cv-1',
    fecha: '2025-12-02',
    fecha_confianza: 'exacta',
    ...overrides,
  };
}

describe('recomputarPartosCercanos', () => {
  it('sin ningún cluster con colapso -- reporte vacío', () => {
    const entrada: EntradaRecomputePartosCercanos = {
      chequeoVacas: [chequeoVaca()],
      eventosParto: [evento()],
    };
    const r = recomputarPartosCercanos(entrada);
    expect(r.clustersConColapso).toBe(0);
    expect(r.eliminar).toEqual([]);
    expect(r.actualizar).toEqual([]);
    expect(r.advertencias).toEqual([]);
  });

  it('caso real GALLEGA #148: 2 chequeos cercanos (31 días), cada uno con su propio evento actual -- ELIMINA el más antiguo y ACTUALIZA el más reciente a su propia fecha', () => {
    const entrada: EntradaRecomputePartosCercanos = {
      chequeoVacas: [
        chequeoVaca({ id: 'cv-1', chequeo_fecha: '2025-11-25', ultima_cria_raw: '2/12/2025' }), // -> 2025-12-02
        chequeoVaca({ id: 'cv-2', chequeo_fecha: '2026-02-25', ultima_cria_raw: '1/11/2025' }), // -> 2025-11-01
      ],
      eventosParto: [
        evento({ id: 'ev-1', chequeo_vaca_id: 'cv-1', fecha: '2025-12-02', fecha_confianza: 'exacta' }),
        evento({ id: 'ev-2', chequeo_vaca_id: 'cv-2', fecha: '2025-11-01', fecha_confianza: 'exacta' }),
      ],
    };
    const r = recomputarPartosCercanos(entrada);

    expect(r.clustersConColapso).toBe(1);
    expect(r.eliminar).toEqual([expect.objectContaining({ id: 'ev-1', animalId: 'a1' })]);
    // El sobreviviente es cv-2 (último miembro del cluster) -- su evento
    // (ev-2) YA está fechado correctamente ('2025-11-01' = cluster.fechaEvento),
    // así que NO requiere actualización, solo la eliminación del duplicado.
    expect(r.actualizar).toEqual([]);
    expect(r.advertencias).toEqual([]);
  });

  it('el evento sobreviviente tiene una fecha DESACTUALIZADA (aún no convergió) -- se genera una decisión de ACTUALIZAR con la fecha correcta, id sin cambios', () => {
    const entrada: EntradaRecomputePartosCercanos = {
      chequeoVacas: [
        chequeoVaca({ id: 'cv-1', chequeo_fecha: '2025-11-25', ultima_cria_raw: '2/12/2025' }), // -> 2025-12-02
        chequeoVaca({ id: 'cv-2', chequeo_fecha: '2026-02-25', ultima_cria_raw: '1/11/2025' }), // -> 2025-11-01
      ],
      eventosParto: [
        evento({ id: 'ev-1', chequeo_vaca_id: 'cv-1', fecha: '2025-12-02', fecha_confianza: 'exacta' }),
        // El evento de cv-2 (el sobreviviente correcto) quedó, por lo que
        // sea, con una fecha vieja -- el recompute debe corregirla.
        evento({ id: 'ev-2', chequeo_vaca_id: 'cv-2', fecha: '2025-10-01', fecha_confianza: 'aproximada' }),
      ],
    };
    const r = recomputarPartosCercanos(entrada);

    expect(r.eliminar).toEqual([expect.objectContaining({ id: 'ev-1' })]);
    expect(r.actualizar).toEqual([
      expect.objectContaining({ id: 'ev-2', fechaActual: '2025-10-01', fechaNueva: '2025-11-01', fechaConfianzaNueva: 'exacta' }),
    ]);
  });

  it('cluster de 3 miembros (oscilación A -> B -> A) con 3 eventos actuales -- elimina 2, conserva y actualiza el del último miembro', () => {
    const entrada: EntradaRecomputePartosCercanos = {
      chequeoVacas: [
        chequeoVaca({ id: 'cv-1', chequeo_fecha: '2024-01-05', ultima_cria_raw: '1/1/2024' }),
        chequeoVaca({ id: 'cv-2', chequeo_fecha: '2024-03-01', ultima_cria_raw: '15/2/2024' }),
        chequeoVaca({ id: 'cv-3', chequeo_fecha: '2024-05-01', ultima_cria_raw: '1/1/2024' }),
      ],
      eventosParto: [
        evento({ id: 'ev-1', chequeo_vaca_id: 'cv-1', fecha: '2024-01-01' }),
        evento({ id: 'ev-2', chequeo_vaca_id: 'cv-2', fecha: '2024-02-15' }),
        evento({ id: 'ev-3', chequeo_vaca_id: 'cv-3', fecha: '2024-01-01' }),
      ],
    };
    const r = recomputarPartosCercanos(entrada);

    expect(r.clustersConColapso).toBe(1);
    expect(r.eliminar.map((e) => e.id).sort()).toEqual(['ev-1', 'ev-2']);
    expect(r.actualizar).toEqual([]); // ev-3 ya está fechado a '2024-01-01', que es fechaEvento del cluster
    expect(r.advertencias).toEqual([]);
  });

  it('dos clusters genuinamente distintos (brecha > 60 días) -- ningún colapso, sin decisiones', () => {
    const entrada: EntradaRecomputePartosCercanos = {
      chequeoVacas: [
        chequeoVaca({ id: 'cv-1', chequeo_fecha: '2024-01-05', ultima_cria_raw: '1/1/2024' }),
        chequeoVaca({ id: 'cv-2', chequeo_fecha: '2024-06-01', ultima_cria_raw: '15/5/2024' }), // > 60 días de distancia
      ],
      eventosParto: [
        evento({ id: 'ev-1', chequeo_vaca_id: 'cv-1', fecha: '2024-01-01' }),
        evento({ id: 'ev-2', chequeo_vaca_id: 'cv-2', fecha: '2024-05-15' }),
      ],
    };
    const r = recomputarPartosCercanos(entrada);
    expect(r.clustersConColapso).toBe(0);
    expect(r.eliminar).toEqual([]);
    expect(r.actualizar).toEqual([]);
  });

  it('cluster con colapso pero SIN ningún hato_eventos existente -- advertencia, nunca inventa una decisión', () => {
    const entrada: EntradaRecomputePartosCercanos = {
      chequeoVacas: [
        chequeoVaca({ id: 'cv-1', chequeo_fecha: '2025-11-25', ultima_cria_raw: '2/12/2025' }),
        chequeoVaca({ id: 'cv-2', chequeo_fecha: '2026-02-25', ultima_cria_raw: '1/11/2025' }),
      ],
      eventosParto: [], // ningún evento cargado todavía para este animal
    };
    const r = recomputarPartosCercanos(entrada);
    expect(r.eliminar).toEqual([]);
    expect(r.actualizar).toEqual([]);
    expect(r.advertencias).toHaveLength(1);
    expect(r.advertencias[0]).toMatchObject({ animalId: 'a1', fechaEventoEsperada: '2025-11-01' });
    expect(r.advertencias[0].lecturasColapsadas).toHaveLength(2);
  });

  it('el último miembro del cluster no tiene evento propio, pero otro miembro sí -- promueve ese evento como sobreviviente y advierte', () => {
    const entrada: EntradaRecomputePartosCercanos = {
      chequeoVacas: [
        chequeoVaca({ id: 'cv-1', chequeo_fecha: '2025-11-25', ultima_cria_raw: '2/12/2025' }),
        chequeoVaca({ id: 'cv-2', chequeo_fecha: '2026-02-25', ultima_cria_raw: '1/11/2025' }), // último miembro, SIN evento propio
      ],
      eventosParto: [evento({ id: 'ev-1', chequeo_vaca_id: 'cv-1', fecha: '2025-12-02' })],
    };
    const r = recomputarPartosCercanos(entrada);
    expect(r.eliminar).toEqual([]); // solo hay un evento en el cluster, no hay nada más que borrar
    expect(r.actualizar).toEqual([
      expect.objectContaining({ id: 'ev-1', fechaNueva: '2025-11-01', fechaConfianzaNueva: 'exacta' }),
    ]);
    expect(r.advertencias).toHaveLength(1);
    expect(r.advertencias[0].motivo).toMatch(/no tiene un hato_eventos propio/);
  });

  it('filas con sx_raw no interpretable como parto (aborto/vendida) se excluyen del clustering, sin afectar el resto del animal', () => {
    const entrada: EntradaRecomputePartosCercanos = {
      chequeoVacas: [
        chequeoVaca({ id: 'cv-1', chequeo_fecha: '2025-11-25', ultima_cria_raw: '2/12/2025', sx_raw: 'OV' }),
        chequeoVaca({ id: 'cv-2', chequeo_fecha: '2026-01-10', ultima_cria_raw: null, sx_raw: 'vacia' }),
      ],
      eventosParto: [evento({ id: 'ev-1', chequeo_vaca_id: 'cv-1', fecha: '2025-12-02' })],
    };
    const r = recomputarPartosCercanos(entrada);
    expect(r.clustersConColapso).toBe(0);
    expect(r.eliminar).toEqual([]);
    expect(r.actualizar).toEqual([]);
  });

  it('varios animales -- las decisiones de uno no contaminan al otro', () => {
    const entrada: EntradaRecomputePartosCercanos = {
      chequeoVacas: [
        chequeoVaca({ id: 'cv-a1-1', animal_id: 'a1', chequeo_fecha: '2025-11-25', ultima_cria_raw: '2/12/2025' }),
        chequeoVaca({ id: 'cv-a1-2', animal_id: 'a1', chequeo_fecha: '2026-02-25', ultima_cria_raw: '1/11/2025' }),
        chequeoVaca({ id: 'cv-a2-1', animal_id: 'a2', chequeo_fecha: '2025-06-01', ultima_cria_raw: '1/6/2025' }),
      ],
      eventosParto: [
        evento({ id: 'ev-a1-1', animal_id: 'a1', chequeo_vaca_id: 'cv-a1-1', fecha: '2025-12-02' }),
        evento({ id: 'ev-a1-2', animal_id: 'a1', chequeo_vaca_id: 'cv-a1-2', fecha: '2025-11-01' }),
        evento({ id: 'ev-a2-1', animal_id: 'a2', chequeo_vaca_id: 'cv-a2-1', fecha: '2025-06-01' }),
      ],
    };
    const r = recomputarPartosCercanos(entrada);
    expect(r.clustersConColapso).toBe(1);
    expect(r.eliminar).toEqual([expect.objectContaining({ id: 'ev-a1-1', animalId: 'a1' })]);
    expect(r.actualizar).toEqual([]);
  });

  it('umbralDias del reporte refleja la constante del motor (DIAS_MINIMOS_ENTRE_PARTOS)', () => {
    const r = recomputarPartosCercanos({ chequeoVacas: [], eventosParto: [] });
    expect(r.umbralDias).toBe(60);
  });
});
