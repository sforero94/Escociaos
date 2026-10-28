// La atribución de los tres caminos web ahora ocurre en SQL, dentro del
// guardado atómico. El harness PostgreSQL prueba el valor real y la RLS.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const migracion = readFileSync('src/sql/migrations/185_inventario_guardado_atomico.sql', 'utf8');
describe('responsable de inventario', () => {
  it('el nuevo RPC toma el email del JWT, no de los datos enviados', () => {
    expect(migracion).toContain("auth.jwt() ->> 'email'");
    expect(migracion).not.toContain("p_datos ->> 'responsable'");
  });
  it('el cierre de aplicaciones conserva su atribución existente', () => {
    const fuente = readFileSync('src/sql/migrations/106_cierre_aplicacion_transaccional.sql', 'utf8');
    expect(fuente).toContain("auth.jwt() ->> 'email'");
    expect(/INSERT INTO movimientos_inventario[\s\S]{0,400}?responsable/i.test(fuente)).toBe(true);
  });
});
