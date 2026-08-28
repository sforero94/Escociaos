// Utility module for Telegram bot user management
// Extracted from TelegramConfig.tsx for testability

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type RolBot = 'campo' | 'admin' | 'gerencia' | 'monitor';
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
  { key: 'hato_produccion', label: 'Producción Hato Lechero', description: 'Pesaje semanal de leche y producción quincenal (litros al camión)' },
  // Fase 3 de docs/brief_tecnico_verificacion_inventario.md (§3.2/§3.3): el
  // módulo de Uriel para la ronda mensual de inventario -- abrir/cerrar la
  // ronda, consultar el teórico (cantidad y unidad, NUNCA precio), mandar
  // notas de voz y confirmar el preview. Deliberadamente NO se marca
  // `sensitive`: no expone valoración por sí mismo (a diferencia de
  // `consultas`, que sí puede). Los otros dos módulos del mismo diseño --
  // `inventario_explicacion` (David) e `inventario_aprobacion` (Santiago) --
  // son de la Fase 4 (David y Santiago), fuera de esta pantalla todavía.
  { key: 'inventario_ronda', label: 'Ronda de inventario', description: 'Abrir/cerrar la ronda mensual de conteo, consultar existencias y reportar hallazgos por nota de voz' },
  // Fase 4 de docs/brief_tecnico_verificacion_inventario.md (§3.2/§7.2): los
  // dos módulos que cierran el ciclo de una excepción de la ronda, aparte del
  // de Uriel de arriba. Ninguno de los dos existía todavía cuando se escribió
  // el comentario de `inventario_ronda`.
  //
  // `inventario_explicacion` (David) confirma/explica cada discrepancia y
  // captura el movimiento cuando hay respaldo (B-1/B-2), y puede además
  // proponer un ajuste (B-5) -- no marcado `sensitive`: igual que
  // `inventario_ronda`, no expone valoración por sí mismo, sólo cantidades y
  // movimientos.
  { key: 'inventario_explicacion', label: 'Explicación de discrepancias (David)', description: 'Confirmar o explicar cada discrepancia de la ronda, capturar el movimiento cuando hay respaldo, y proponer el ajuste cuando no lo hay' },
  // `inventario_aprobacion` (Santiago) SÍ se marca `sensitive`: aunque el
  // mensaje de aprobación tampoco lleva precio ni valoración (R-15/CA-13
  // sigue valiendo para Telegram -- ver la cabecera de
  // `src/utils/rondaInventario/resolucion.ts`), sí expone la causa raíz y el
  // delta de cada discrepancia sin respaldo (pérdida, sustracción...), que es
  // información de control interno -- el mismo criterio de cautela que ya
  // usa `consultas`, aplicado a un dato más acotado. La guarda real vive en
  // el RPC (`fn_ronda_decidir_ajuste` exige el vínculo con
  // `usuarios.rol = 'Gerencia'`, migración 126, §6.1 del brief técnico); esta
  // marca es sólo la advertencia visual de la pantalla de configuración.
  { key: 'inventario_aprobacion', label: 'Aprobación de ajustes (Santiago)', description: 'Clasificar la causa raíz y aprobar o desestimar cada ajuste de inventario sin respaldo — exclusivo de Gerencia', sensitive: true },
  { key: 'consultas', label: 'Consultas IA', description: 'Acceso a Esco IA — solo para usuarios autorizados', sensitive: true },
];

export const ROLES_BOT: RolBotOption[] = [
  { key: 'campo', label: 'Campo' },
  { key: 'admin', label: 'Admin' },
  { key: 'gerencia', label: 'Gerencia' },
  { key: 'monitor', label: 'Monitor' },
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
