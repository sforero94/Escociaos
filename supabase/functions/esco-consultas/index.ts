// esco-consultas — Esco 2.0 (M3). Punto de entrada Deno.
// Una sola fuente: el núcleo vive en src/utils/esco2/ y se importa con rutas relativas;
// la CLI de Supabase (3.x) sube todo archivo importado dentro de la raíz del repo git.
// No importa chat.tsx y nada del bot de Telegram la importa (D27).
// Publicar SOLO con:  npx supabase functions deploy esco-consultas
// (lee verify_jwt = true de supabase/config.toml).

import { createClient } from 'npm:@supabase/supabase-js@2.49.8';
import { manejar, type ClienteUsuario } from './manejador.ts';

function claveAnonima(): string {
  const anon = Deno.env.get('SUPABASE_ANON_KEY');
  if (anon) return anon;
  try {
    return (JSON.parse(Deno.env.get('SUPABASE_PUBLISHABLE_KEYS') ?? '{}') as Record<string, string>).default ?? '';
  } catch {
    return '';
  }
}

Deno.serve((req) =>
  manejar(req, {
    env: (nombre) => Deno.env.get(nombre),
    crearClienteUsuario: (jwt) =>
      createClient(Deno.env.get('SUPABASE_URL') ?? '', claveAnonima(), {
        global: { headers: { Authorization: `Bearer ${jwt}` } },
        auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      }) as unknown as ClienteUsuario,
    crearClienteServicio: () =>
      createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '', {
        auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      }) as unknown as ClienteUsuario,
    registrar: (evento) => console.log(JSON.stringify(evento)),
  }),
);
