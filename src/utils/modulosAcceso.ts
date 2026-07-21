// Per-user application module access (navigation/visibility only; NOT an RLS boundary).
// Single source of truth for the `puedeAccederModulo` rule, shared by the sidebar
// filter (Layout.tsx) and the route-level guard (ModuleGuard in App.tsx).

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ModuloAcceso {
  key: string;
  label: string;
}

export interface ProfileParaModulos {
  rol: string;
  modulos: string[];
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const MODULOS: ModuloAcceso[] = [
  { key: 'aguacate', label: 'Aguacate' },
  { key: 'hato_lechero', label: 'Hato Lechero' },
  { key: 'ganado', label: 'Ganado' },
  { key: 'finanzas', label: 'Finanzas' },
];

export const MODULO_KEYS = MODULOS.map((m) => m.key);

// ---------------------------------------------------------------------------
// Functions
// ---------------------------------------------------------------------------

export function puedeAccederModulo(
  profile: ProfileParaModulos | null | undefined,
  moduloKey: string,
): boolean {
  if (!profile) return true; // nothing loaded → fail open
  if (profile.rol === '') return true; // temporal/unconfirmed → fail open
  if (profile.rol === 'Gerencia') return true;
  return profile.modulos.includes(moduloKey);
}

export function toggleModulo(current: string[], key: string): string[] {
  return current.includes(key)
    ? current.filter((m) => m !== key)
    : [...current, key];
}
