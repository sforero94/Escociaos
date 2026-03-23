import { describe, it, expect, beforeAll } from 'vitest';

// Dynamic imports to match calculosClima.test.ts pattern
let TELEGRAM_MODULES: Array<{ key: string; label: string; description: string; sensitive?: boolean }>;
let ROLES_BOT: Array<{ key: string; label: string }>;
let generarCodigoVinculacion: () => string;
let calcularExpiracion: (dias?: number) => string;
let estaCodigoVigente: (fecha: string | null | undefined) => boolean;
let getEstadoVinculacion: (usuario: Record<string, unknown>) => string;
let validarNuevoUsuario: (data: { nombre_display: string; rol_bot: string; modulos_permitidos: string[] }) => { valid: boolean; error?: string };
let toggleModulo: (current: string[], modulo: string) => string[];

beforeAll(async () => {
  const mod = await import('@/utils/telegramUsuarios');
  TELEGRAM_MODULES = mod.TELEGRAM_MODULES;
  ROLES_BOT = mod.ROLES_BOT;
  generarCodigoVinculacion = mod.generarCodigoVinculacion;
  calcularExpiracion = mod.calcularExpiracion;
  estaCodigoVigente = mod.estaCodigoVigente;
  getEstadoVinculacion = mod.getEstadoVinculacion;
  validarNuevoUsuario = mod.validarNuevoUsuario;
  toggleModulo = mod.toggleModulo;
});

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

describe('TELEGRAM_MODULES', () => {
  it('exports exactly 5 modules', () => {
    expect(TELEGRAM_MODULES).toHaveLength(5);
  });

  it('contains the expected module keys', () => {
    const keys = TELEGRAM_MODULES.map((m) => m.key);
    expect(keys).toEqual(['labores', 'monitoreo', 'gastos', 'ingresos', 'consultas']);
  });

  it('each module has key, label, and description', () => {
    for (const mod of TELEGRAM_MODULES) {
      expect(typeof mod.key).toBe('string');
      expect(typeof mod.label).toBe('string');
      expect(typeof mod.description).toBe('string');
      expect(mod.key.length).toBeGreaterThan(0);
      expect(mod.label.length).toBeGreaterThan(0);
      expect(mod.description.length).toBeGreaterThan(0);
    }
  });

  it('marks consultas as sensitive', () => {
    const consultas = TELEGRAM_MODULES.find((m) => m.key === 'consultas');
    expect(consultas?.sensitive).toBe(true);
  });
});

describe('ROLES_BOT', () => {
  it('exports exactly 4 roles', () => {
    expect(ROLES_BOT).toHaveLength(4);
  });

  it('contains the expected role keys', () => {
    const keys = ROLES_BOT.map((r) => r.key);
    expect(keys).toEqual(['campo', 'admin', 'gerencia', 'monitor']);
  });

  it('each role has key and label', () => {
    for (const role of ROLES_BOT) {
      expect(typeof role.key).toBe('string');
      expect(typeof role.label).toBe('string');
    }
  });
});

// ---------------------------------------------------------------------------
// generarCodigoVinculacion
// ---------------------------------------------------------------------------

describe('generarCodigoVinculacion', () => {
  it('returns an 8-character string', () => {
    const code = generarCodigoVinculacion();
    expect(code).toHaveLength(8);
  });

  it('returns uppercase alphanumeric characters only', () => {
    const code = generarCodigoVinculacion();
    expect(code).toMatch(/^[A-Z0-9]{8}$/);
  });

  it('produces different values on consecutive calls', () => {
    const codes = new Set(Array.from({ length: 10 }, () => generarCodigoVinculacion()));
    expect(codes.size).toBeGreaterThan(1);
  });
});

// ---------------------------------------------------------------------------
// calcularExpiracion
// ---------------------------------------------------------------------------

describe('calcularExpiracion', () => {
  it('returns an ISO string 7 days in the future by default', () => {
    const result = calcularExpiracion();
    const expiry = new Date(result);
    const now = new Date();
    const diffDays = (expiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
    expect(diffDays).toBeGreaterThan(6.9);
    expect(diffDays).toBeLessThan(7.1);
  });

  it('accepts a custom days parameter', () => {
    const result = calcularExpiracion(3);
    const expiry = new Date(result);
    const now = new Date();
    const diffDays = (expiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
    expect(diffDays).toBeGreaterThan(2.9);
    expect(diffDays).toBeLessThan(3.1);
  });

  it('returns a valid ISO date string', () => {
    const result = calcularExpiracion();
    expect(new Date(result).toISOString()).toBe(result);
  });
});

// ---------------------------------------------------------------------------
// estaCodigoVigente
// ---------------------------------------------------------------------------

describe('estaCodigoVigente', () => {
  it('returns true for a date in the future', () => {
    const future = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    expect(estaCodigoVigente(future)).toBe(true);
  });

  it('returns false for a date in the past', () => {
    const past = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    expect(estaCodigoVigente(past)).toBe(false);
  });

  it('returns false for null', () => {
    expect(estaCodigoVigente(null)).toBe(false);
  });

  it('returns false for undefined', () => {
    expect(estaCodigoVigente(undefined)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// getEstadoVinculacion
// ---------------------------------------------------------------------------

describe('getEstadoVinculacion', () => {
  it('returns "vinculado" when telegram_id is present', () => {
    const user = { telegram_id: 123456, codigo_vinculacion: null, codigo_expira_at: null };
    expect(getEstadoVinculacion(user)).toBe('vinculado');
  });

  it('returns "pendiente" when codigo exists and is not expired', () => {
    const future = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    const user = { telegram_id: null, codigo_vinculacion: 'ABC123', codigo_expira_at: future };
    expect(getEstadoVinculacion(user)).toBe('pendiente');
  });

  it('returns "expirado" when codigo exists but is expired', () => {
    const past = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const user = { telegram_id: null, codigo_vinculacion: 'ABC123', codigo_expira_at: past };
    expect(getEstadoVinculacion(user)).toBe('expirado');
  });

  it('returns "sin_codigo" when no telegram_id and no codigo', () => {
    const user = { telegram_id: null, codigo_vinculacion: null, codigo_expira_at: null };
    expect(getEstadoVinculacion(user)).toBe('sin_codigo');
  });
});

// ---------------------------------------------------------------------------
// validarNuevoUsuario
// ---------------------------------------------------------------------------

describe('validarNuevoUsuario', () => {
  it('returns valid for complete input', () => {
    const result = validarNuevoUsuario({
      nombre_display: 'Carlos Mendoza',
      rol_bot: 'campo',
      modulos_permitidos: ['labores'],
    });
    expect(result.valid).toBe(true);
    expect(result.error).toBeUndefined();
  });

  it('returns error for empty nombre_display', () => {
    const result = validarNuevoUsuario({
      nombre_display: '',
      rol_bot: 'campo',
      modulos_permitidos: ['labores'],
    });
    expect(result.valid).toBe(false);
    expect(result.error).toBeDefined();
  });

  it('returns error for whitespace-only nombre_display', () => {
    const result = validarNuevoUsuario({
      nombre_display: '   ',
      rol_bot: 'campo',
      modulos_permitidos: ['labores'],
    });
    expect(result.valid).toBe(false);
  });

  it('returns error for empty modulos_permitidos array', () => {
    const result = validarNuevoUsuario({
      nombre_display: 'Carlos',
      rol_bot: 'campo',
      modulos_permitidos: [],
    });
    expect(result.valid).toBe(false);
    expect(result.error).toBeDefined();
  });

  it('returns error for invalid rol_bot value', () => {
    const result = validarNuevoUsuario({
      nombre_display: 'Carlos',
      rol_bot: 'superadmin',
      modulos_permitidos: ['labores'],
    });
    expect(result.valid).toBe(false);
    expect(result.error).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// toggleModulo
// ---------------------------------------------------------------------------

describe('toggleModulo', () => {
  it('adds a module if not present', () => {
    const result = toggleModulo(['labores'], 'monitoreo');
    expect(result).toEqual(['labores', 'monitoreo']);
  });

  it('removes a module if already present', () => {
    const result = toggleModulo(['labores', 'monitoreo'], 'monitoreo');
    expect(result).toEqual(['labores']);
  });

  it('returns a new array (immutability)', () => {
    const original = ['labores', 'monitoreo'];
    const result = toggleModulo(original, 'gastos');
    expect(result).not.toBe(original);
    expect(original).toEqual(['labores', 'monitoreo']);
  });
});
