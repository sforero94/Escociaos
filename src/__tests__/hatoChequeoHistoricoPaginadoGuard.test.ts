import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { paginarSelect } from '../supabase/functions/server/paginar-select';

/**
 * Guarda de la lectura del histórico de `hato_chequeo_vacas` en los TRES
 * endpoints de chequeo (`preview`, `commit`, `foto`), en los DOS árboles de
 * edge function.
 *
 * **El defecto.** Los tres leían el histórico completo con
 * `.select(...).in('animal_id', animalIds)` — sin `.range(...)` y sin
 * `order by`. PostgREST corta en 1.000 filas por página y **no avisa**:
 * devuelve `error: null` y un arreglo corto. Verificado contra producción el
 * 2026-09-07: `hato_chequeo_vacas` tiene **1.479 filas** en 32 chequeos, de
 * las cuales **711** pertenecen a las 35 vacas del roster actual
 * (`etapa='vaca' AND estado='activa'`). Todavía por debajo del tope — el
 * defecto es LATENTE — pero cada chequeo suma ~35 filas del roster, así que
 * el margen es de unos ocho chequeos.
 *
 * **Por qué no es cosmético.** Ese histórico alimenta los tres mapas de
 * deduplicación del commit:
 *
 *   - `seleccionarUltimoChequeoPorAnimal`  → la línea base del diff
 *   - `seleccionarUltimaCriaAnteriorPorAnimal` → dedupe del `parto`
 *   - `seleccionarFechasServicioConocidasPorAnimal` → dedupe del `servicio`
 *
 * Si el corte se traga la fila que ya registraba ese parto o ese servicio, el
 * commit emite un SEGUNDO evento para el mismo hecho: exactamente la clase de
 * duplicado que costó las migraciones 075, 076 y 080. Y como la consulta no
 * lleva `order by`, qué 1.000 filas llegan lo decide el orden físico del heap
 * — el fallo no deja hueco visible y ni siquiera es determinista.
 *
 * Las dos reglas que fija esta prueba:
 *  1. Los seis ficheros leen `hato_chequeo_vacas` por `paginarSelect` + `.range`.
 *  2. `paginarSelect` recupera de verdad más de 1.000 filas.
 */

const FICHEROS = [
  'src/supabase/functions/server/hato-chequeo-commit.ts',
  'src/supabase/functions/server/hato-chequeo-preview.ts',
  'src/supabase/functions/server/hato-chequeo-foto.ts',
  'supabase/functions/make-server-1ccce916/hato-chequeo-commit.ts',
  'supabase/functions/make-server-1ccce916/hato-chequeo-preview.ts',
  'supabase/functions/make-server-1ccce916/hato-chequeo-foto.ts',
];

describe('endpoints de chequeo — histórico de hato_chequeo_vacas paginado', () => {
  it.each(FICHEROS)('%s pagina la lectura del histórico', (ruta) => {
    const fuente = readFileSync(resolve(__dirname, '../..', ruta), 'utf-8');

    expect(fuente).toContain("import { paginarSelect } from './paginar-select.ts';");

    // Cada bloque `.from('hato_chequeo_vacas')` tiene que cerrar en `.range(`.
    const bloques = [...fuente.matchAll(/\.from\('hato_chequeo_vacas'\)[\s\S]{0,600}?;/g)];
    expect(bloques.length).toBeGreaterThan(0);
    for (const [bloque] of bloques) {
      expect(bloque).toContain('.range(desde, hasta)');
    }
  });

  it('paginarSelect recupera las 1.479 filas reales, no las primeras 1.000', async () => {
    // Reproducción del corte: un backend que nunca devuelve más de 1.000
    // filas por llamada, como PostgREST.
    const TOTAL = 1479;
    const todas = Array.from({ length: TOTAL }, (_, i) => ({ fila: i }));
    const { filas, error } = await paginarSelect<{ fila: number }>((desde, hasta) =>
      Promise.resolve({ data: todas.slice(desde, Math.min(hasta + 1, desde + 1000)), error: null }),
    );
    expect(error).toBeNull();
    expect(filas).toHaveLength(TOTAL);
    // La consulta vieja se habría quedado acá, en la fila 1.000.
    expect(filas[filas.length - 1].fila).toBe(TOTAL - 1);
  });

  it('paginarSelect propaga el error del backend sin devolver filas a medias', async () => {
    const { filas, error } = await paginarSelect<{ fila: number }>(() =>
      Promise.resolve({ data: null, error: { message: 'boom' } }),
    );
    expect(error?.message).toBe('boom');
    expect(filas).toHaveLength(0);
  });

  it('paginarSelect denuncia el tope de páginas en vez de entregar una lectura incompleta', async () => {
    // Un backend que siempre devuelve una página llena: nunca hay página corta.
    const { error } = await paginarSelect<{ fila: number }>((desde) =>
      Promise.resolve({ data: Array.from({ length: 1000 }, (_, i) => ({ fila: desde + i })), error: null }),
    );
    expect(error?.message).toMatch(/tope de 20 páginas/);
  });
});
