import { expect, it } from 'vitest';
import { construirPrompt } from '../utils/escoSql/prompt.ts';
it('el prompt describe la frontera positiva y deja las tablas crudas fuera del catálogo', () => {
  const p=construirPrompt('2026-11-09');
  expect(p).toContain('Solo puedes consultar las vistas v_esco_* registradas');
  expect(p).toContain('No uses tablas crudas ni catálogos del sistema');
  expect(p).toContain('nodo_no_admitido');
  expect(p).toContain('el texto viaja como parámetro');
});
