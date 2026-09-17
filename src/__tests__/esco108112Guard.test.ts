import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

const MIGRATIONS = join(__dirname, '../sql/migrations');

function readMig(name: string): string {
  const full = join(MIGRATIONS, name);
  expect(existsSync(full), `${name} debe existir`).toBe(true);
  return readFileSync(full, 'utf8');
}

describe('ESCO-112 — migración 147 ejecutable', () => {
  const sql = readMig('147_fn_ronda_resolver_con_captura_cantidad_confirmada.sql');

  it('el cuerpo CA-8 escribe "Ajuste" entre comillas dobles', () => {
    expect(sql).toMatch(/nunca "Ajuste"/);
  });

  it('la post-condición busca las mismas comillas dobles, no simples', () => {
    expect(sql).toMatch(/v_def NOT ILIKE '%"Ajuste"%'/);
    expect(sql).not.toMatch(/v_def NOT ILIKE '%''Ajuste''%'/);
  });

  it('la cabecera documenta que editar el fichero aplicado es intencional', () => {
    expect(sql).toMatch(/INTENCIONAL/);
    expect(sql).toMatch(/20260916154436/);
  });
});

describe('ESCO-108 — migración 158 no edita la 151', () => {
  const sql = readMig('158_clima_horas_sol_cobertura_parcial.sql');
  const sql151 = readMig('151_clima_horas_sol_duracion.sql');

  it('pinea el md5 del prosrc vivo de la 151', () => {
    expect(sql).toContain('8ca02e657033b4fd273fdb06d52edb0f');
  });

  it('el CASE del sol tiene el brazo COUNT(*) < v_min_lecturas', () => {
    expect(sql).toMatch(/WHEN COUNT\(\*\) < v_min_lecturas THEN NULL/);
  });

  it('la 151 original NO tiene ese brazo — no se editó in-place', () => {
    expect(sql151).not.toMatch(/WHEN COUNT\(\*\) < v_min_lecturas THEN NULL/);
  });

  it('declara radiacion_wm2_avg / uv_index_max fuera de alcance', () => {
    expect(sql).toMatch(/FUERA DE ALCANCE/);
  });
});

describe('ESCO-112 — archivo de registro 157', () => {
  const sql = readMig('157_limpieza_chequeo_prueba_qa.sql');

  it('es archivo de registro, no para aplicar', () => {
    expect(sql).toMatch(/ARCHIVO DE REGISTRO/);
    expect(sql).toMatch(/NO APLICAR/);
  });

  it('documenta version, name y chequeo_id del ledger', () => {
    expect(sql).toContain('20260916022812');
    expect(sql).toContain('limpieza_chequeo_prueba_qa_2020_01_15');
    expect(sql).toContain('da0220b2-24af-4f77-a175-e9c27bb966ee');
  });
});
