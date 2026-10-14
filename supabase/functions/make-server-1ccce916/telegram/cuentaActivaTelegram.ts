// Fresh service-role admission; never trust cached bot roles for authority.
interface Consulta extends PromiseLike<{ data: unknown; error: unknown }> {
  eq(column: string, value: string | number | boolean): Consulta;
  limit(count: number): Consulta;
}
interface Cliente { from(table: string): { select(columns: string): Consulta } }
export async function cuentaActivaTelegram(
  cliente: { from: (table: string) => unknown },
  sender: number | undefined,
  modulo?: string,
): Promise<{ usuarioId: string; rol: string } | null> {
  if (!Number.isSafeInteger(sender) || !sender || sender <= 0) return null;
  try {
    const sb = cliente as Cliente;
    const registration = await sb.from('telegram_usuarios').select('usuario_id,activo,modulos_permitidos')
      .eq('telegram_id', sender).eq('activo', true).limit(2);
    if (registration.error || !Array.isArray(registration.data) || registration.data.length !== 1) return null;
    const linked = registration.data[0];
    if (linked?.activo !== true || typeof linked.usuario_id !== 'string' || !linked.usuario_id.trim()) return null;
    if (modulo && (!Array.isArray(linked.modulos_permitidos) || !linked.modulos_permitidos.includes(modulo))) return null;
    const result = await sb.from('usuarios').select('id,activo,rol').eq('id', linked.usuario_id).limit(2);
    if (result.error || !Array.isArray(result.data) || result.data.length !== 1) return null;
    const profile = result.data[0];
    if (profile?.id !== linked.usuario_id || profile.activo !== true || typeof profile.rol !== 'string') return null;
    return { usuarioId: profile.id, rol: profile.rol };
  } catch { return null; }
}
export async function autorizarDeshacerHato(cliente: { from: (table: string) => unknown }, sender: number | undefined) {
  return (await cuentaActivaTelegram(cliente, sender))?.rol === 'Gerencia';
}
