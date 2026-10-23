import { describe, it, expect } from 'vitest';
import {
  esNegocioAguacate,
  esEtiquetaCosecha,
  normalizarEtiquetaCosecha,
  opcionesCosecha,
  opcionesCosechaConActual,
} from '@/utils/cosechaAguacate';

describe('cosechaAguacate (ESCO-160)', () => {
  it('reconoce el negocio de aguacate', () => {
    expect(esNegocioAguacate('Aguacate Hass')).toBe(true);
    expect(esNegocioAguacate('Hato Lechero')).toBe(false);
    expect(esNegocioAguacate(undefined)).toBe(false);
  });

  it('acepta solo etiquetas canónicas', () => {
    expect(esEtiquetaCosecha('Principal 2027')).toBe(true);
    expect(esEtiquetaCosecha('Traviesa 2026')).toBe(true);
    expect(esEtiquetaCosecha('principal 2027')).toBe(false);
    expect(esEtiquetaCosecha('Principal')).toBe(false);
    expect(esEtiquetaCosecha('')).toBe(false);
    expect(esEtiquetaCosecha(null)).toBe(false);
  });

  it('normaliza lo tecleado sin inventar año ni tipo', () => {
    expect(normalizarEtiquetaCosecha('  principal   2027 ')).toBe('Principal 2027');
    expect(normalizarEtiquetaCosecha('TRAVIESA 2026')).toBe('Traviesa 2026');
    expect(normalizarEtiquetaCosecha('Principal')).toBeNull();
    expect(normalizarEtiquetaCosecha('2027')).toBeNull();
    expect(normalizarEtiquetaCosecha('')).toBeNull();
    expect(normalizarEtiquetaCosecha(undefined)).toBeNull();
  });

  it('ofrece la Principal siguiente para una venta de septiembre (ventana nueva)', () => {
    // El caso real: ventas del 2026-09-12 se registraron como «Principal 2027».
    expect(opcionesCosecha('2026-09-12')).toEqual(['Principal 2026', 'Traviesa 2026', 'Principal 2027']);
  });

  it('usa el año de respaldo cuando la fecha no es válida', () => {
    expect(opcionesCosecha('', 2030)).toEqual(['Principal 2030', 'Traviesa 2030', 'Principal 2031']);
  });

  it('conserva la etiqueta guardada al editar aunque no esté sugerida', () => {
    expect(opcionesCosechaConActual('2026-09-12', 'Traviesa 2025')[0]).toBe('Traviesa 2025');
    expect(opcionesCosechaConActual('2026-09-12', 'Principal 2027')).toEqual(opcionesCosecha('2026-09-12'));
    expect(opcionesCosechaConActual('2026-09-12', 'basura')).toEqual(opcionesCosecha('2026-09-12'));
  });
});
