// POST /make-server-1ccce916/informes-visita/snippets/proponer
//
// El navegador extrae el .docx. Este endpoint llama a Gemini (OpenRouter)
// y devuelve snippets propuestos. NUNCA escribe en la base: el humano
// confirma / ignora / edita en el cliente antes de persistir.

import { Context } from 'npm:hono';
import { createClient } from 'jsr:@supabase/supabase-js@2';
import {
  construirPromptSnippets,
  esquemaJsonSnippets,
  extraerJsonModelo,
  parsearRespuestaSnippets,
} from './informes-visita-snippets.ts';

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
const MODELO = 'google/gemini-3-flash-preview';
const TIMEOUT_MODELO_MS = 120_000;
const ROLES_PERMITIDOS = new Set(['Administrador', 'Gerencia']);
const TEXTO_MAX = 40_000;
const FECHA_ISO = /^\d{4}-\d{2}-\d{2}$/;

function respuestaError(c: Context, status: 400 | 401 | 403 | 500 | 502 | 503, error: string) {
  return c.json({ error }, status);
}

async function verificarAcceso(
  c: Context,
  supabase: ReturnType<typeof createClient>,
): Promise<{ userId: string } | Response> {
  const authHeader = c.req.header('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return respuestaError(c, 401, 'No autorizado -- falta encabezado Authorization Bearer.');
  }
  const token = authHeader.slice(7);

  const { data: userData, error: userError } = await supabase.auth.getUser(token);
  if (userError || !userData?.user) {
    return respuestaError(c, 401, 'Token inválido o expirado.');
  }

  const { data: usuario, error: usuarioError } = await supabase
    .from('usuarios')
    .select('rol')
    .eq('id', userData.user.id)
    .maybeSingle();
  if (usuarioError) {
    return respuestaError(c, 500, `No se pudo verificar el rol del usuario: ${usuarioError.message}`);
  }
  if (!usuario || !ROLES_PERMITIDOS.has(usuario.rol)) {
    return respuestaError(
      c,
      403,
      'Acceso restringido a Administrador o Gerencia.',
    );
  }

  return { userId: userData.user.id };
}

export async function handleProponerSnippets(c: Context): Promise<Response> {
  const apiKey = Deno.env.get('OPENROUTER_API_KEY');
  if (!apiKey) {
    return respuestaError(
      c,
      503,
      'No se pueden proponer snippets: falta el secreto OPENROUTER_API_KEY en la edge function.',
    );
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  const acceso = await verificarAcceso(c, supabase);
  if (acceso instanceof Response) return acceso;

  let body: Record<string, unknown>;
  try {
    body = await c.req.json();
  } catch {
    return respuestaError(c, 400, 'El cuerpo tiene que ser JSON.');
  }

  const texto = typeof body.texto === 'string' ? body.texto : '';
  if (!texto.trim()) {
    return respuestaError(c, 400, 'Falta el texto extraído del Word.');
  }

  const piesDeFoto = Array.isArray(body.pies_de_foto)
    ? body.pies_de_foto.filter((p): p is string => typeof p === 'string')
    : [];
  const nFotos = typeof body.n_fotos === 'number' && Number.isInteger(body.n_fotos) && body.n_fotos >= 0
    ? body.n_fotos
    : piesDeFoto.length;
  const fechaFallback = typeof body.fecha_fallback === 'string' && FECHA_ISO.test(body.fecha_fallback)
    ? body.fecha_fallback
    : '';
  if (!fechaFallback) {
    return respuestaError(c, 400, 'fecha_fallback tiene que ser AAAA-MM-DD.');
  }

  const textoCorto = texto.slice(0, TEXTO_MAX);
  const prompt = construirPromptSnippets(textoCorto, piesDeFoto);
  const esquema = esquemaJsonSnippets();

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MODELO_MS);

  try {
    const respuesta = await fetch(OPENROUTER_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: MODELO,
        messages: [
          { role: 'system', content: prompt },
          { role: 'user', content: 'Propón los snippets. Devuelve solo el JSON del esquema.' },
        ],
        temperature: 0,
        max_tokens: 8000,
        response_format: {
          type: 'json_schema',
          json_schema: { name: 'snippets_informe_visita', strict: true, schema: esquema },
        },
      }),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (!respuesta.ok) {
      const detalle = await respuesta.text().catch(() => '');
      return respuestaError(
        c,
        502,
        `El modelo respondió ${respuesta.status}: ${detalle.slice(0, 300)}`,
      );
    }

    const resultado = await respuesta.json();
    const contenido = resultado?.choices?.[0]?.message?.content;
    if (typeof contenido !== 'string' || contenido.trim() === '') {
      return respuestaError(c, 502, 'El modelo devolvió una respuesta vacía.');
    }

    const bruto = extraerJsonModelo(contenido);
    const parsed = parsearRespuestaSnippets(bruto, textoCorto, nFotos, fechaFallback);
    return c.json({
      cabecera: parsed.cabecera,
      snippets: parsed.snippets,
      descartadosPorCita: parsed.descartadosPorCita,
    });
  } catch (err) {
    clearTimeout(timeoutId);
    const mensaje =
      err instanceof Error && err.name === 'AbortError'
        ? `La propuesta superó el tiempo máximo (${TIMEOUT_MODELO_MS / 1000}s).`
        : err instanceof Error
          ? err.message
          : String(err);
    return respuestaError(c, 502, mensaje);
  }
}
