import { describe, it, expect } from 'vitest';
import { puedeAccederModulo, toggleModulo, MODULO_KEYS } from '../utils/modulosAcceso';

describe('puedeAccederModulo', () => {
  it('returns true when profile is null (nothing loaded yet, fail open)', () => {
    for (const key of MODULO_KEYS) {
      expect(puedeAccederModulo(null, key)).toBe(true);
    }
  });

  it('returns true when profile.rol is empty string (temporal/unconfirmed profile, fail open)', () => {
    const profile = { rol: '', modulos: [] };
    for (const key of MODULO_KEYS) {
      expect(puedeAccederModulo(profile, key)).toBe(true);
    }
  });

  it('returns true for every module when rol is Gerencia, regardless of modulos', () => {
    const profile = { rol: 'Gerencia', modulos: [] };
    for (const key of MODULO_KEYS) {
      expect(puedeAccederModulo(profile, key)).toBe(true);
    }
  });

  it('returns true only for modules explicitly listed in modulos for non-Gerencia roles', () => {
    const profile = { rol: 'Verificador', modulos: ['ganado'] };
    expect(puedeAccederModulo(profile, 'ganado')).toBe(true);
    expect(puedeAccederModulo(profile, 'aguacate')).toBe(false);
    expect(puedeAccederModulo(profile, 'hato_lechero')).toBe(false);
    expect(puedeAccederModulo(profile, 'finanzas')).toBe(false);
  });
});

describe('toggleModulo', () => {
  it('adds a key that is not present', () => {
    expect(toggleModulo([], 'ganado')).toEqual(['ganado']);
    expect(toggleModulo(['aguacate'], 'ganado')).toEqual(['aguacate', 'ganado']);
  });

  it('removes a key that is already present', () => {
    expect(toggleModulo(['ganado'], 'ganado')).toEqual([]);
    expect(toggleModulo(['aguacate', 'ganado'], 'ganado')).toEqual(['aguacate']);
  });
});
