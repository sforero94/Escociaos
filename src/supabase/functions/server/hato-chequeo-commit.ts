// hato-chequeo-commit.ts — endpoint B0/V10 del plan (§7.4 "Import recurrente
// por chequeo"): `POST /make-server-1ccce916/hato/chequeo/commit`.
//
// El paso "Aprobar" que sigue al diff de `hato-chequeo-preview.ts` (ese
// endpoint NUNCA comete un INSERT/UPDATE). Este SÍ escribe -- es el único
// camino de escritura del commit de un chequeo.
//
// Contrato ("nunca re-parsea el .xlsx en este paso"): el cliente manda las
// filas YA normalizadas (`filasNormalizadas` de la respuesta de preview,
// filtradas a las clasificaciones `sin_cambio`/`cambio` que el usuario
// aprobó), nunca el archivo. Ese diff pudo generarse minutos u horas antes
// -- el hato puede haber cambiado entre tanto (otro commit, una edición de
// ficha). Por eso este handler NUNCA confía en la clasificación que vio el
// cliente: vuelve a construir el estado actual (`hato_animales` +
// `hato_chequeo_vacas` más reciente) y vuelve a correr `construirDiffChequeo`
// -- exactamente el mismo motor que preview -- para revalidar CADA fila
// antes de escribir una sola. Si alguna fila degradó a una clasificación no
// escribible (`nuevo`, `no_reconocido` -- incluye número provisional y
// colisión de chapeta), el commit entero se rechaza con 409 y no escribe
// NADA: no hay escritura parcial "las que sí, las que no" desde este
// handler (la atomicidad real de la escritura vive en la RPC, migración
// 065 -- ver esa migración).
//
// Regla dura de alcance (nunca se relaja, ver `commitChequeo.ts`): SOLO
// filas `sin_cambio`/`cambio` se escriben. `nuevo` (la chapeta no tiene
// ficha en `hato_animales` todavía) y `no_reconocido` (sin número, número
// provisional 900-999, o colisión de chapeta dentro de la hoja) NUNCA se
// escriben desde este endpoint -- alguien tiene que crear la ficha o
// desempatar la colisión primero, por otro camino.
//
// I/O puro en este archivo: parseo del body JSON, las consultas a Supabase
// (config, animales, histórico, resolución de toros) y la llamada a la RPC.
// Toda la lógica de negocio (revalidación de diff, forma insertable,
// derivación de eventos, ensamblado del payload) vive en módulos puros con
// Vitest -- `./importHato/diffChequeo.ts` y `./importHato/commitChequeo.ts`
// (copias GENERADAS de `src/utils/importHato/`, ver
// docs/hato/regenerar-copias-importhato.py) -- y `descomponerSX` en
// `./calculos-hato.ts`.

import { Context } from 'npm:hono';
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { construirDiffChequeo } from './importHato/diffChequeo.ts';
import type { AnimalHatoActual, FilaChequeoVacaHistorico } from './importHato/diffChequeo.ts';
import { seleccionarUltimoChequeoPorAnimal } from './importHato/diffChequeo.ts';
import type { FilaChequeoNormalizada } from './importHato/tipos.ts';
import {
  validarFilasCommit,
  construirFilasVacas,
  derivarEventosDeChequeo,
  construirPayloadCommit,
} from './importHato/commitChequeo.ts';
import { construirHatoConfigDesdeFilas, type FilaHatoConfig } from './hato-config-desde-tabla.ts';

const ROLES_PERMITIDOS = new Set(['Administrador', 'Gerencia']); // mismo patrón de escritura que el resto de hato_* (migración 053), igual que preview.

function respuestaError(c: Context, status: 400 | 401 | 403 | 409 | 500, body: Record<string, unknown>) {
  return c.json({ success: false, ...body }, status);
}

// ---------------------------------------------------------------------------
// Auth: idéntico a `hato-chequeo-preview.ts` -- ver ese archivo para el
// razonamiento completo. Repetido en vez de importado: cada endpoint de
// hato-* es autocontenido en su propio I/O, mismo patrón que ya usan los
// otros handlers de `src/supabase/functions/server/`.
// ---------------------------------------------------------------------------
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
// Body esperado
// ---------------------------------------------------------------------------
interface BodyCommitChequeo {
  archivo?: string;
  generadoEn?: string;
  chequeo?: { fecha?: string; veterinario?: string | null };
  filas?: FilaChequeoNormalizada[];
}

function validarBody(body: unknown): { chequeo: { fecha: string; veterinario: string | null }; filas: FilaChequeoNormalizada[] } | { error: string } {
  if (typeof body !== 'object' || body === null) {
    return { error: 'El cuerpo de la solicitud debe ser un objeto JSON.' };
  }
  const b = body as BodyCommitChequeo;

  const fecha = b.chequeo?.fecha;
  if (typeof fecha !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
    return { error: "chequeo.fecha es requerido y debe tener formato ISO 'yyyy-mm-dd'." };
  }

  if (!Array.isArray(b.filas) || b.filas.length === 0) {
    return { error: "filas debe ser un arreglo no vacío -- no hay nada que aprobar." };
  }
  for (const fila of b.filas) {
    if (typeof fila !== 'object' || fila === null || typeof (fila as FilaChequeoNormalizada).fila !== 'number') {
      return { error: 'Cada elemento de filas debe ser una fila normalizada completa (con el campo numérico "fila").' };
    }
  }

  return {
    chequeo: { fecha, veterinario: b.chequeo?.veterinario ?? null },
    filas: b.filas,
  };
}

// ---------------------------------------------------------------------------
// Resolución de toro: SELECT-o-INSERT contra hato_toros (índice único
// `lower(nombre)`, migración 053) -- NUNCA `.upsert()` de PostgREST, ese
// índice es una expresión y `on_conflict` no puede referenciarla (mismo
// motivo documentado en `scripts/import-hato/load.ts` y en CLAUDE.md,
// migración 052). Solo se llama para los nombres que SÍ aparecen en algún
// evento derivado -- nunca para `fila.toroNombre` a secas, que puede traer
// nombres de filas rechazadas.
// ---------------------------------------------------------------------------
async function resolverToroId(
  supabase: ReturnType<typeof createClient>,
  nombre: string,
  cache: Map<string, string>,
  userId: string,
): Promise<{ id: string; creado: boolean }> {
  const clave = nombre.trim().toLowerCase();
  const idCacheado = cache.get(clave);
  if (idCacheado) return { id: idCacheado, creado: false };

  const { data: existente, error: errorSelect } = await supabase
    .from('hato_toros')
    .select('id')
    .ilike('nombre', nombre.trim())
    .maybeSingle();
  if (errorSelect) throw new Error(`No se pudo consultar hato_toros: ${errorSelect.message}`);
  if (existente) {
    cache.set(clave, existente.id as string);
    return { id: existente.id as string, creado: false };
  }

  const { data: creado, error: errorInsert } = await supabase
    .from('hato_toros')
    .insert({ nombre: nombre.trim(), created_by: userId })
    .select('id')
    .single();
  if (errorInsert) throw new Error(`No se pudo crear el toro '${nombre}' en hato_toros: ${errorInsert.message}`);
  cache.set(clave, creado.id as string);
  return { id: creado.id as string, creado: true };
}

// ---------------------------------------------------------------------------
// Handler principal
// ---------------------------------------------------------------------------
export async function handleHatoChequeoCommit(c: Context): Promise<Response> {
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
  if ('error' in validado) {
    return respuestaError(c, 400, { error: validado.error });
  }
  const { chequeo, filas } = validado;

  // --- 2. hato_config -- puerta de consistencia del entorno, igual que en
  //    preview. Ninguna función de este handler consume `HatoConfig`
  //    directamente (las filas ya vienen con fecha_secar/fecha_probable_parto
  //    calculadas por el módulo TS en el momento de la vista previa, y
  //    `descomponerSX` no la necesita) -- pero si las migraciones 058/062 no
  //    están aplicadas en este entorno, esto falla explícito ANTES de
  //    escribir nada, en vez de dejar que un commit corra sobre un esquema
  //    incompleto sin que nadie lo note. --------------------------------
  const { data: filasConfig, error: errorConfig } = await supabase
    .from('hato_config')
    .select('clave, valor');
  if (errorConfig) {
    return respuestaError(c, 500, { error: `No se pudo leer hato_config: ${errorConfig.message}` });
  }
  try {
    construirHatoConfigDesdeFilas((filasConfig ?? []) as FilaHatoConfig[]);
  } catch (err) {
    return respuestaError(c, 500, { error: err instanceof Error ? err.message : String(err) });
  }

  // --- 3. Estado FRESCO del hato -- nunca el diff que vio el cliente ---
  const numerosEnvidados = [...new Set(filas.map((f) => f.numero).filter((n): n is number => n !== null))];

  let animales: AnimalHatoActual[] = [];
  if (numerosEnvidados.length > 0) {
    const { data, error } = await supabase
      .from('hato_animales')
      .select('id, numero, nombre, etapa, estado')
      .in('numero', numerosEnvidados);
    if (error) return respuestaError(c, 500, { error: `No se pudo leer hato_animales: ${error.message}` });
    animales = (data ?? []) as AnimalHatoActual[];
  }

  const animalIds = animales.map((a) => a.id);
  let historico: FilaChequeoVacaHistorico[] = [];
  if (animalIds.length > 0) {
    const { data, error } = await supabase
      .from('hato_chequeo_vacas')
      .select('animal_id, pl, num_partos, fecha_servicio, toro, tipo_servicio, fecha_secar, fecha_probable_parto, estado, created_at, hato_chequeos(fecha)')
      .in('animal_id', animalIds);
    if (error) return respuestaError(c, 500, { error: `No se pudo leer hato_chequeo_vacas: ${error.message}` });
    historico = (data ?? []).map((fila: Record<string, unknown>) => {
      const chequeoRow = fila.hato_chequeos as { fecha: string } | { fecha: string }[] | null;
      const fecha = Array.isArray(chequeoRow) ? chequeoRow[0]?.fecha : chequeoRow?.fecha;
      return {
        animalId: fila.animal_id as string,
        chequeoFecha: fecha ?? '',
        createdAt: fila.created_at as string,
        pl: fila.pl as number | null,
        numPartos: fila.num_partos as number | null,
        fechaServicio: fila.fecha_servicio as string | null,
        toro: fila.toro as string | null,
        tipoServicio: fila.tipo_servicio as 'monta' | 'inseminacion' | null,
        fechaSecar: fila.fecha_secar as string | null,
        fechaProbableParto: fila.fecha_probable_parto as string | null,
        estado: fila.estado as FilaChequeoVacaHistorico['estado'],
      };
    });
  }

  const ultimosChequeos = seleccionarUltimoChequeoPorAnimal(historico);
  const diffFresco = construirDiffChequeo(filas, animales, ultimosChequeos);

  // --- 4. Revalidar el ALCANCE contra el diff fresco --------------------
  const { aceptadas, rechazadas } = validarFilasCommit(filas, diffFresco);
  if (rechazadas.length > 0) {
    return respuestaError(c, 409, {
      error: `${rechazadas.length} fila(s) ya no se pueden aprobar tal como llegaron -- el hato cambió desde la vista previa. No se escribió nada.`,
      filasRechazadas: rechazadas,
    });
  }

  // --- 5. Derivar eventos + resolver toro_id (I/O: SELECT-o-INSERT) ----
  const vacas = construirFilasVacas(aceptadas);
  const { eventos } = derivarEventosDeChequeo(aceptadas);

  const nombresToro = [...new Set(eventos.map((e) => e.toro_nombre).filter((n): n is string => !!n && n.trim() !== ''))];
  const toroCache = new Map<string, string>();
  let torosCreados = 0;
  try {
    for (const nombre of nombresToro) {
      const { creado } = await resolverToroId(supabase, nombre, toroCache, acceso.userId);
      if (creado) torosCreados += 1;
    }
  } catch (err) {
    return respuestaError(c, 500, { error: err instanceof Error ? err.message : String(err) });
  }

  const payload = construirPayloadCommit(chequeo, vacas, eventos, toroCache);

  // --- 6. Una sola llamada, una sola transacción ------------------------
  const { data: resultadoRpc, error: errorRpc } = await supabase.rpc('fn_hato_commit_chequeo', {
    payload,
    p_created_by: acceso.userId,
  });
  if (errorRpc) {
    return respuestaError(c, 500, { error: `No se pudo comprometer el chequeo: ${errorRpc.message}` });
  }

  const resultado = resultadoRpc as { chequeoId: string; filasEscritas: number; eventosEscritos: number };
  return c.json({
    success: true,
    chequeoId: resultado.chequeoId,
    filasEscritas: resultado.filasEscritas,
    eventosEscritos: resultado.eventosEscritos,
    torosCreados,
  });
}
