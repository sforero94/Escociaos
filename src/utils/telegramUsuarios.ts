// Utility module for Telegram bot user management
// Extracted from TelegramConfig.tsx for testability

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type RolBot = 'campo' | 'admin' | 'gerencia';
export type EstadoVinculacion = 'vinculado' | 'pendiente' | 'expirado' | 'sin_codigo';

export interface TelegramModulo {
  key: string;
  label: string;
  description: string;
  sensitive?: boolean;
}

export interface RolBotOption {
  key: RolBot;
  label: string;
}

export interface TelegramUsuarioRow {
  id: string;
  telegram_id: number | null;
  telegram_username: string | null;
  usuario_id: string | null;
  empleado_id: string | null;
  contratista_id: string | null;
  nombre_display: string;
  rol_bot: RolBot;
  modulos_permitidos: string[];
  activo: boolean;
  codigo_vinculacion: string | null;
  codigo_expira_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface ValidationResult {
  valid: boolean;
  error?: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const TELEGRAM_MODULES: TelegramModulo[] = [
  { key: 'labores', label: 'Labores', description: 'Registrar jornales de trabajo' },
  { key: 'monitoreo', label: 'Monitoreo', description: 'Registrar monitoreo de plagas' },
  { key: 'gastos', label: 'Gastos', description: 'Registrar gastos' },
  { key: 'ingresos', label: 'Ingresos', description: 'Registrar ingresos' },
  { key: 'consultas', label: 'Consultas IA', description: 'Acceso a Esco IA — solo para usuarios autorizados', sensitive: true },
];

export const ROLES_BOT: RolBotOption[] = [
  { key: 'campo', label: 'Campo' },
  { key: 'admin', label: 'Admin' },
  { key: 'gerencia', label: 'Gerencia' },
];

const VALID_ROLES = new Set<string>(ROLES_BOT.map((r) => r.key));

// ---------------------------------------------------------------------------
// Functions
// ---------------------------------------------------------------------------

export function generarCodigoVinculacion(): string {
  const array = new Uint8Array(6);
  crypto.getRandomValues(array);
  return Array.from(array, (b) => b.toString(36).padStart(2, '0'))
    .join('')
    .substring(0, 8)
    .toUpperCase();
}

export function calcularExpiracion(dias = 7): string {
  return new Date(Date.now() + dias * 24 * 60 * 60 * 1000).toISOString();
}

export function estaCodigoVigente(fecha: string | null | undefined): boolean {
  if (!fecha) return false;
  return new Date(fecha) > new Date();
}

export function getEstadoVinculacion(
  usuario: Pick<TelegramUsuarioRow, 'telegram_id' | 'codigo_vinculacion' | 'codigo_expira_at'> | Record<string, unknown>,
): EstadoVinculacion {
  if (usuario.telegram_id) return 'vinculado';
  if (usuario.codigo_vinculacion && estaCodigoVigente(usuario.codigo_expira_at as string | null)) return 'pendiente';
  if (usuario.codigo_vinculacion) return 'expirado';
  return 'sin_codigo';
}

export function validarNuevoUsuario(data: {
  nombre_display: string;
  rol_bot: string;
  modulos_permitidos: string[];
}): ValidationResult {
  if (!data.nombre_display.trim()) {
    return { valid: false, error: 'El nombre es requerido' };
  }
  if (!VALID_ROLES.has(data.rol_bot)) {
    return { valid: false, error: 'Rol inválido' };
  }
  if (data.modulos_permitidos.length === 0) {
    return { valid: false, error: 'Debe seleccionar al menos un módulo' };
  }
  return { valid: true };
}

export function toggleModulo(current: string[], modulo: string): string[] {
  return current.includes(modulo)
    ? current.filter((m) => m !== modulo)
    : [...current, modulo];
}
