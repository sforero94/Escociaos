import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { deleteDevolvioFilas } from '@/utils/supabase/deleteDevolvioFilas';

/**
 * ESCO-46: PostgREST DELETE + RLS. Sin `.select()`, un borrado filtrado
 * vuelve `{ error: null }` y la UI toasteaba éxito. Con `.select()`,
 * `data` vacío es la señal de que no se borró nada.
 *
 * Los componentes de Contratistas / Lotes / Sublotes no tienen harness de
 * render en este repo. Se prueba el helper y se guarda que esos tres
 * caminos lo usen después de `.delete().select()`.
 */

const SITIOS_DELETE = [
  'components/empleados/Contratistas.tsx',
  'components/configuracion/LotesConfig.tsx',
  'components/configuracion/SublotesConfig.tsx',
];

describe('deleteDevolvioFilas', () => {
  it('trata null/undefined/vacío como "no se borró nada"', () => {
    expect(deleteDevolvioFilas(null)).toBe(false);
    expect(deleteDevolvioFilas(undefined)).toBe(false);
    expect(deleteDevolvioFilas([])).toBe(false);
  });

  it('trata una fila devuelta como borrado real', () => {
    expect(deleteDevolvioFilas([{ id: '1' }])).toBe(true);
  });
});

describe('ESCO-46: delete de contratista/lote/sublote verifica filas', () => {
  it.each(SITIOS_DELETE)('%s llama .select() y deleteDevolvioFilas', (relativo) => {
    const fuente = readFileSync(resolve(__dirname, '..', relativo), 'utf8');
    expect(fuente).toContain('.delete()');
    expect(fuente).toContain('.select()');
    expect(fuente).toContain('deleteDevolvioFilas');
    expect(fuente).toMatch(/No tienes permisos para eliminar/);
  });
});
