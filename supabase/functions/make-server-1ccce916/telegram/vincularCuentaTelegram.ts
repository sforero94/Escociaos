// Registration admission only. Workflow authority still needs its fresh action guard.
interface Cliente {
  rpc(name: string, args: Record<string, unknown>): PromiseLike<{ data: unknown; error: unknown }>;
}
export interface RegistroVinculado {
  id: string;
  telegram_id: number;
  telegram_username: string | null;
  usuario_id: string | null;
  empleado_id: string | null;
  contratista_id: string | null;
  nombre_display: string;
  rol_bot: 'campo' | 'admin' | 'gerencia' | 'monitor';
  modulos_permitidos: string[];
  activo: true;
  codigo_vinculacion: null;
  codigo_expira_at: null;
}
const rolesBot = new Set(['campo','admin','gerencia','monitor']);
const rolesApp = new Set(['Gerencia','Administrador','Monitor','Verificador']);
function esRegistro(value: unknown, sender: number, username: string | null): value is RegistroVinculado {
  if (!value || typeof value !== 'object') return false;
  const row = value as Record<string, unknown>;
  return typeof row.id === 'string' && !!row.id && row.telegram_id === sender && row.telegram_username === username &&
    (row.usuario_id === null || (typeof row.usuario_id === 'string' && !!row.usuario_id)) &&
    (row.empleado_id === null || typeof row.empleado_id === 'string') &&
    (row.contratista_id === null || typeof row.contratista_id === 'string') &&
    typeof row.nombre_display === 'string' && typeof row.rol_bot === 'string' && rolesBot.has(row.rol_bot) &&
    Array.isArray(row.modulos_permitidos) && row.modulos_permitidos.every(module => typeof module === 'string') &&
    row.activo === true && row.codigo_vinculacion === null && row.codigo_expira_at === null;
}
export async function vincularCuentaTelegram(
  client: Cliente, code: string, sender: number | undefined, username?: string,
): Promise<RegistroVinculado | null> {
  if (!/^[A-Z0-9]{8}$/.test(code) || !Number.isSafeInteger(sender) || !sender || sender <= 0 ||
      (username !== undefined && (typeof username !== 'string' || username.length > 64))) return null;
  try {
    const { data, error } = await client.rpc('telegram_consume_binding_code', {
      p_code: code, p_telegram_id: sender, p_username: username ?? null,
    });
    if (error || !data || typeof data !== 'object') return null;
    const result = data as Record<string, unknown>;
    const raw = result.registration;
    const registration = raw && typeof raw === 'object'
      ? { ...raw as Record<string, unknown>, modulos_permitidos: (raw as Record<string, unknown>).modulos_permitidos === null ? [] : (raw as Record<string, unknown>).modulos_permitidos } : null;
    if (!esRegistro(registration, sender, username ?? null)) return null;
    if (registration.usuario_id === null) {
      if (result.linked_profile !== null) return null;
    } else {
      if (!result.linked_profile || typeof result.linked_profile !== 'object') return null;
      const profile = result.linked_profile as Record<string, unknown>;
      if (profile.id !== registration.usuario_id || profile.activo !== true ||
          typeof profile.rol !== 'string' || !rolesApp.has(profile.rol)) return null;
    }
    return registration;
  } catch { return null; }
}
