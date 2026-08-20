import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { fetchAll } from '@/utils/supabase/fetchAll';

/**
 * Guarda del fetch de `clima_resumen_diario` en `useClimaData`.
 *
 * **El defecto.** `clima_resumen_diario` guarda UNA FILA POR DÍA desde
 * 2020-07-01. Verificado contra producción el 2026-08-20: **1.910 filas**.
 * El hook las pedía con `.select('*').order('fecha', { ascending: true })`
 * y sin paginar, así que PostgREST cortaba en 1.000 filas SIN AVISAR y el
 * navegador se quedaba con los 1.000 días más viejos:
 *
 *   fila 1000 → 2023-07-11   ·   fila 1001 → 2023-07-12   ·   perdidas: 910
 *
 * O sea: todo lo posterior al 2023-07-11 nunca llegaba. Y `resumenesDiarios`
 * alimenta las tarjetas de período (Semana/Mes/Trimestre/Año a la fecha/
 * Último año), las series históricas de 7d–365d, la vista mensual de >365d,
 * la superposición por año y `ContextoSolar`. Como todos filtran por una
 * fecha de corte reciente, se quedaban con CERO filas y
 * `buildResumenFromDaily([])` devuelve todo `null` → la tabla "Resumen
 * Acumulado" mostraba `—` en todo menos en "Día" (que se calcula aparte,
 * desde `clima_lecturas`).
 *
 * `clima_lecturas` NO necesita paginarse: la 036 la poda a una ventana
 * rodante de 24 h (~288 filas), muy por debajo del tope.
 *
 * Las dos reglas que fija esta prueba:
 *  1. `clima_resumen_diario` se pide por `fetchAll` con `.range(...)`.
 *  2. Nunca vuelve a existir un `select` de esa tabla sin paginación.
 */

const HOOK = resolve(__dirname, '../hooks/useClimaData.ts');
const fuente = readFileSync(HOOK, 'utf-8');

describe('useClimaData — clima_resumen_diario', () => {
  it('pide los resúmenes diarios por fetchAll, con range', () => {
    expect(fuente).toContain("import { fetchAll } from '@/utils/supabase/fetchAll';");
    expect(fuente).toMatch(
      /fetchAll<ResumenDiario>\(\(desde, hasta\) =>[\s\S]*?\.from\('clima_resumen_diario' as any\)[\s\S]*?\.range\(desde, hasta\)/,
    );
  });

  it('no queda ninguna lectura sin paginar de clima_resumen_diario', () => {
    // El bloque `.from('clima_resumen_diario')...` tiene que terminar en
    // `.range(`. Se recorta cada aparición hasta el primer `)` de cierre de
    // la cadena para no arrastrar el resto del archivo.
    const apariciones = [...fuente.matchAll(/\.from\('clima_resumen_diario'[\s\S]{0,300}/g)];
    expect(apariciones.length).toBeGreaterThan(0);
    for (const [bloque] of apariciones) {
      expect(bloque).toContain('.range(');
    }
  });

  it('fetchAll recupera las 1.910 filas reales, no las primeras 1.000', async () => {
    // Reproducción del corte: un backend que nunca devuelve más de 1.000
    // filas por llamada, como PostgREST.
    const TOTAL = 1910;
    const todas = Array.from({ length: TOTAL }, (_, i) => ({ fecha: i }));
    const { filas, truncado } = await fetchAll<{ fecha: number }>((desde, hasta) =>
      Promise.resolve({ data: todas.slice(desde, Math.min(hasta + 1, desde + 1000)), error: null }),
    );
    expect(truncado).toBe(false);
    expect(filas).toHaveLength(TOTAL);
    // La consulta vieja se habría quedado acá — el último día entregado era
    // 2023-07-11, la fila 1.000.
    expect(filas[filas.length - 1].fecha).toBe(TOTAL - 1);
  });
});
