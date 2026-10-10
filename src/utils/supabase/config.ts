// A single configured destination for SDK and edge requests; no production fallback.
export function validarConfiguracionSupabase(url: unknown, anonKey: unknown) {
  if (typeof url !== 'string' || typeof anonKey !== 'string' || !anonKey.trim()) {
    throw new Error('Falta la configuración de Supabase.');
  }
  let parsed: URL;
  try { parsed = new URL(url); } catch { throw new Error('URL de Supabase inválida.'); }
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(parsed.hostname);
  if ((parsed.protocol !== 'https:' && !(local && parsed.protocol === 'http:'))
    || parsed.username || parsed.password || parsed.search || parsed.hash
    || (parsed.pathname !== '/' && parsed.pathname !== '')) {
    throw new Error('URL de Supabase inválida.');
  }
  return { url: parsed.origin, anonKey: anonKey.trim() };
}
export function getSupabaseConfig() {
  return validarConfiguracionSupabase(import.meta.env.VITE_SUPABASE_URL, import.meta.env.VITE_SUPABASE_ANON_KEY);
}
