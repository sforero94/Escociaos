import { describe, it, expect } from 'vitest';
import { convertirSerialFechaATexto, valorCeldaATexto, valorFechaATexto, esVacio } from '@/utils/importHato/celdas';

describe('convertirSerialFechaATexto', () => {
  it('convierte un serial de Excel real (verificado contra la planilla) a D/M/AAAA', () => {
    // CARMIÑA, CHEQUEO VETE 2024.xlsx::CHEQUEO AGOSTO 2024::r9 -- Ultima
    // Cria=45273 (verificado como 13-dic-2023 vía la librería xlsx con
    // cellDates:true durante la exploración de S3).
    expect(convertirSerialFechaATexto(45273)).toBe('13/12/2023');
  });

  it('TURMALINA -- ESTADO/OBS con fecha heredada de Gen1 (QA §2.10), serial 43613', () => {
    // CHEQUEO_JULIO__2019::r47, columnas OBS y "parto real" ambas = 43613.
    // El doc QA cita el valor esperado como 2019-05-28.
    expect(convertirSerialFechaATexto(43613)).toBe('28/5/2019');
  });

  it('no usa la hora local -- aritmética puramente UTC', () => {
    // Serial 0 = 1899-12-30 (época de Excel).
    expect(convertirSerialFechaATexto(0)).toBe('30/12/1899');
  });
});

describe('valorCeldaATexto', () => {
  it('null/undefined -> null', () => {
    expect(valorCeldaATexto(null)).toBeNull();
    expect(valorCeldaATexto(undefined)).toBeNull();
  });
  it('string vacía o solo espacios -> null', () => {
    expect(valorCeldaATexto('')).toBeNull();
    expect(valorCeldaATexto('   ')).toBeNull();
  });
  it('recorta espacios de un texto real', () => {
    expect(valorCeldaATexto('  BRIGIDA  ')).toBe('BRIGIDA');
  });
  it('NUNCA interpreta un número como fecha -- lo deja como texto plano', () => {
    expect(valorCeldaATexto(45273)).toBe('45273');
    expect(valorCeldaATexto(38)).toBe('38');
  });
});

describe('valorFechaATexto', () => {
  it('null/undefined -> null', () => {
    expect(valorFechaATexto(null)).toBeNull();
    expect(valorFechaATexto(undefined)).toBeNull();
  });
  it('número finito -> convierte como serial de Excel', () => {
    expect(valorFechaATexto(45273)).toBe('13/12/2023');
  });
  it('número no finito -> null, nunca NaN visible', () => {
    expect(valorFechaATexto(NaN)).toBeNull();
    expect(valorFechaATexto(Infinity)).toBeNull();
  });
  it('texto roto/multi-fecha se conserva verbatim, nunca se reinterpreta como serial', () => {
    // Evidencia real doc S2 §4 -- estas SON el texto de la celda tal cual,
    // Excel las tipó como texto (no como fecha) porque no son fechas válidas.
    expect(valorFechaATexto('18/04/2024/ 8 /05/24 21/06/240')).toBe('18/04/2024/ 8 /05/24 21/06/240');
  });
  it('texto de código de error de fórmula se conserva verbatim (nunca se convierte)', () => {
    expect(valorFechaATexto('#VALUE!')).toBe('#VALUE!');
  });
});

describe('esVacio', () => {
  it('null/undefined/espacios -> true', () => {
    expect(esVacio(null)).toBe(true);
    expect(esVacio(undefined)).toBe(true);
    expect(esVacio('   ')).toBe(true);
    expect(esVacio('')).toBe(true);
  });
  it('0 numérico NO es vacío -- es un dato real (ej. PL=0)', () => {
    expect(esVacio(0)).toBe(false);
  });
  it('texto con contenido no es vacío', () => {
    expect(esVacio('ok')).toBe(false);
  });
});
