// ARCHIVO: __tests__/hatoCorrecciones.test.ts
// DESCRIPCIÓN: TDD de T4b (S3, docs/plan_hato_ciclo_manual_override.md §5) --
// resumen de la traza `hato_correcciones` para `HistorialCorreccionesCard`.

import { describe, it, expect } from 'vitest';
import { LABEL_TABLA_CORRECCION, resumirCambiosCorreccion } from '@/utils/hatoCorrecciones';

describe('resumirCambiosCorreccion', () => {
  it('delete -> una línea fija, sin comparar nada', () => {
    expect(
      resumirCambiosCorreccion({ operacion: 'delete', datos_anteriores: { fecha: '2026-01-01' }, datos_nuevos: null }),
    ).toEqual(['Fila eliminada']);
  });

  it('update -> lista los campos que efectivamente cambiaron', () => {
    const lineas = resumirCambiosCorreccion({
      operacion: 'update',
      datos_anteriores: { fecha: '2026-01-01', fecha_confianza: 'aproximada', toro_id: null },
      datos_nuevos: { fecha: '2026-01-05', fecha_confianza: 'exacta', toro_id: null },
    });
    expect(lineas).toContain('fecha: 2026-01-01 → 2026-01-05');
    expect(lineas).toContain('fecha_confianza: aproximada → exacta');
    expect(lineas.some((l) => l.startsWith('toro_id'))).toBe(false);
  });

  it('ignora columnas de sistema (id, created_at, updated_at, updated_by)', () => {
    const lineas = resumirCambiosCorreccion({
      operacion: 'update',
      datos_anteriores: { id: 'a', created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z', pl: 10 },
      datos_nuevos: { id: 'a', created_at: '2026-01-01T00:00:00Z', updated_at: '2026-02-01T00:00:00Z', pl: 12 },
    });
    expect(lineas).toEqual(['pl: 10 → 12']);
  });

  it('un valor null se muestra como "—", nunca como la palabra "null"', () => {
    const lineas = resumirCambiosCorreccion({
      operacion: 'update',
      datos_anteriores: { toro_id: null },
      datos_nuevos: { toro_id: 'toro-1' },
    });
    expect(lineas).toEqual(['toro_id: — → toro-1']);
  });

  it('sin ningún campo cambiado -> mensaje explícito, nunca una lista vacía silenciosa', () => {
    const lineas = resumirCambiosCorreccion({
      operacion: 'update',
      datos_anteriores: { id: 'a', updated_at: '2026-01-01T00:00:00Z' },
      datos_nuevos: { id: 'a', updated_at: '2026-02-01T00:00:00Z' },
    });
    expect(lineas).toEqual(['Sin cambios detectables en los campos capturados']);
  });

  it('un objeto/jsonb se compara estructuralmente y se muestra serializado', () => {
    const lineas = resumirCambiosCorreccion({
      operacion: 'update',
      datos_anteriores: { datos: { origen: 'marca_manual' } },
      datos_nuevos: { datos: { origen: 'marca_manual', nota: 'corregido' } },
    });
    expect(lineas).toEqual(['datos: {"origen":"marca_manual"} → {"origen":"marca_manual","nota":"corregido"}']);
  });
});

describe('LABEL_TABLA_CORRECCION', () => {
  it('cubre exactamente las 5 tablas del trigger de la migración 084', () => {
    expect(Object.keys(LABEL_TABLA_CORRECCION).sort()).toEqual(
      ['hato_animales', 'hato_chequeo_vacas', 'hato_eventos', 'hato_pesajes_leche', 'hato_produccion_quincenal'].sort(),
    );
  });
});
