// hato-pesaje-commit.ts — S5 de `docs/plan_hato_ronda_agosto_2026.md`: `POST
// /make-server-1ccce916/hato/pesaje/commit`.
//
// El paso "Aprobar" que sigue al diff de `hato-pesaje-foto.ts` (ese endpoint
// NUNCA comete un INSERT/UPDATE). Este SÍ escribe -- es uno de los dos
// caminos de escritura del commit de un pesaje por foto (el otro es el bot
// de Telegram, `telegram/conversations/pesajeLeche.ts`, N13 de
// `docs/plan_hato_telegram_estados_agosto_2026.md`, que llama a la MISMA
// función de orquestación).
//
// Contrato: el cliente manda las CELDAS que quiere guardar (`celdas`, la
// forma `CeldaDiffPesaje` que devolvió el preview -- posiblemente con
// `litrosAm`/`litrosPm` CORREGIDOS a mano, D-6). Nunca reenvía la foto ni
// pide que se vuelva a leer.
//
// REVALIDACIÓN CONTRA EL ESTADO FRESCO + escritura UPDATE-por-id/INSERT:
// toda esa orquestación vive en `./hato-pesaje-pipeline.ts`
// (`ejecutarCommitPesaje`), extraída para que el bot de Telegram reuse
// EXACTAMENTE la misma revalidación (N13 del plan: "Reusa la revalidación
// que ya existe en `hato-pesaje-commit.ts`") sin cambiar el comportamiento
// observable de este endpoint. Este archivo queda como I/O puro: auth,
// parseo/forma del body, y traducción del resultado a una respuesta HTTP.
//
// A DIFERENCIA del commit de chequeo (una sola RPC, todo o nada: un chequeo
// es UN evento con varias filas relacionadas), acá cada celda es un hecho
// independiente (`UNIQUE(animal_id, fecha)`, sin relación entre vacas ni
// entre semanas) -- así que una celda inválida NO aborta las demás.
//
// `fuente: 'foto'` distingue esta vía de `'web'` (grid manual) y
// `'telegram'` (bot). `created_by` se setea EXPLÍCITO desde la sesión
// verificada -- `hato_pesajes_leche` no tiene trigger de `created_by` (a
// diferencia de `tareas`/`fin_gastos`/…, migraciones 040/050/063/074) y
// este handler escribe con la service role (`auth.uid()` sería NULL), así
// que sin esto la autoría se perdería.

import { Context } from 'npm:hono';
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { ejecutarCommitPesaje, type CeldaCommitPesajeEntrada } from './hato-pesaje-pipeline.ts';
import type { CeldaDiffPesaje } from './importHato/ocrPesaje.ts';

const ROLES_PERMITIDOS = new Set(['Administrador', 'Gerencia']); // mismo patrón de escritura que el resto de hato_* (migración 053).

function respuestaError(c: Context, status: 400 | 401 | 403 | 500, body: Record<string, unknown>) {
  return c.json({ success: false, ...body }, status);
}

async function verificarAcceso(
  c: Context,
  supabase: ReturnType<typeof createClient>,
): Promise<{ userId: string } | Response> {
  const authHeader = c.req.header('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return respuestaError(c, 401, { error: 'No autorizado -- falta encabezado Authorization Bearer.' });
  }
  const token = authHeader.slice(7);

  const { data: userData, error: userError } = await supabase.auth.getUser(token);
  if (userError || !userData?.user) {
    return respuestaError(c, 401, { error: 'Token inválido o expirado.' });
  }

  const { data: usuario, error: usuarioError } = await supabase
    .from('usuarios')
    .select('rol')
    .eq('id', userData.user.id)
    .maybeSingle();
  if (usuarioError) {
    return respuestaError(c, 500, { error: `No se pudo verificar el rol del usuario: ${usuarioError.message}` });
  }
  if (!usuario || !ROLES_PERMITIDOS.has(usuario.rol)) {
    return respuestaError(c, 403, {
      error: 'Acceso restringido a Administrador o Gerencia (mismo permiso de escritura del módulo Hato Lechero).',
    });
  }

  return { userId: userData.user.id };
}

// ---------------------------------------------------------------------------
// Body esperado -- solo lo que el handler necesita para escribir; el resto
// de `CeldaDiffPesaje` (nombre, clasificación) se ignora, nunca se confía.
// ---------------------------------------------------------------------------
interface BodyCommitPesaje {
  anio?: number;
  mes?: number;
  celdas?: Array<Partial<CeldaDiffPesaje>>;
}

function validarBody(body: unknown): { anio: number; mes: number; celdas: CeldaCommitPesajeEntrada[] } | { error: string } {
  if (typeof body !== 'object' || body === null) {
    return { error: 'El cuerpo de la solicitud debe ser un objeto JSON.' };
  }
  const b = body as BodyCommitPesaje;

  if (!Number.isInteger(b.anio) || (b.anio as number) < 2020 || (b.anio as number) > 2100) {
    return { error: "'anio' es requerido y debe ser un año válido." };
  }
  if (!Number.isInteger(b.mes) || (b.mes as number) < 1 || (b.mes as number) > 12) {
    return { error: "'mes' es requerido y debe estar entre 1 y 12." };
  }
  if (!Array.isArray(b.celdas) || b.celdas.length === 0) {
    return { error: "'celdas' debe ser un arreglo no vacío -- no hay nada que aprobar." };
  }

  const celdas: CeldaCommitPesajeEntrada[] = [];
  for (const c of b.celdas) {
    if (typeof c !== 'object' || c === null || typeof c.animalId !== 'string' || typeof c.fecha !== 'string') {
      return { error: 'Cada celda debe traer animalId (string) y fecha (AAAA-MM-DD).' };
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(c.fecha)) {
      return { error: `La celda de '${c.animalId}' trae una fecha con formato inválido: '${c.fecha}'.` };
    }
    const litrosAm = c.litrosAm ?? null;
    const litrosPm = c.litrosPm ?? null;
    if (litrosAm === null && litrosPm === null) continue; // nada que escribir -- se omite, nunca litros_total = 0.
    celdas.push({ animalId: c.animalId, fecha: c.fecha, litrosAm, litrosPm });
  }

  if (celdas.length === 0) {
    return { error: 'Ninguna de las celdas enviadas trae AM o PM -- no hay litros que guardar.' };
  }

  return { anio: b.anio as number, mes: b.mes as number, celdas };
}

// ---------------------------------------------------------------------------
// Handler principal
// ---------------------------------------------------------------------------
export async function handleHatoPesajeCommit(c: Context): Promise<Response> {
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  const acceso = await verificarAcceso(c, supabase);
  if (acceso instanceof Response) return acceso;

  // --- 1. Body ---------------------------------------------------------
  let body: unknown;
  try {
    body = await c.req.json();
  } catch (err) {
    return respuestaError(c, 400, { error: `El cuerpo no es JSON válido: ${err instanceof Error ? err.message : String(err)}` });
  }
  const validado = validarBody(body);
  if ('error' in validado) return respuestaError(c, 400, { error: validado.error });
  const { anio, mes, celdas } = validado;

  // --- 2. Revalidación + escritura, compartida con el bot (N13) -------------
  const resultado = await ejecutarCommitPesaje({
    supabase,
    anio,
    mes,
    celdas,
    createdBy: acceso.userId,
    fuente: 'foto',
  });

  if (!resultado.ok) {
    if (resultado.status === 400) {
      return respuestaError(c, 400, { error: resultado.error, celdasRechazadas: resultado.celdasRechazadas });
    }
    return respuestaError(c, 500, { error: resultado.error });
  }

  return c.json({
    success: true,
    guardados: resultado.guardados,
    actualizados: resultado.actualizados,
    creados: resultado.creados,
    celdasRechazadas: resultado.celdasRechazadas,
  });
}
