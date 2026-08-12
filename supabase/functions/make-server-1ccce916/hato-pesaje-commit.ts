// hato-pesaje-commit.ts — S5 de `docs/plan_hato_ronda_agosto_2026.md`: `POST
// /make-server-1ccce916/hato/pesaje/commit`.
//
// El paso "Aprobar" que sigue al diff de `hato-pesaje-foto.ts` (ese endpoint
// NUNCA comete un INSERT/UPDATE). Este SÍ escribe -- es el único camino de
// escritura del commit de un pesaje por foto.
//
// Contrato: el cliente manda las CELDAS que quiere guardar (`celdas`, la
// forma `CeldaDiffPesaje` que devolvió el preview -- posiblemente con
// `litrosAm`/`litrosPm` CORREGIDOS a mano, D-6). Nunca reenvía la foto ni
// pide que se vuelva a leer.
//
// REVALIDACIÓN CONTRA EL ESTADO FRESCO (mismo espíritu que
// `hato-chequeo-commit.ts`, adaptado a que acá cada celda es un HECHO
// INDEPENDIENTE, no partes de un mismo evento):
//   - `animal_id` debe seguir siendo una vaca en ordeño ACTIVA en este
//     instante -- si se vendió/murió entre la vista previa y la aprobación,
//     esa celda se rechaza, nunca se escribe contra una identidad caducada.
//   - `fecha` debe seguir siendo una ocurrencia real de
//     `hato_config.dia_pesaje_semanal` para (anio, mes) -- si el ajuste
//     cambió entre tanto, esa celda se rechaza en vez de escribir una fecha
//     que ya no es la que la planilla impresa mostraba.
//   - El `existenteId` (UPDATE vs INSERT) se RE-DERIVA de una consulta
//     fresca a `hato_pesajes_leche` -- nunca se confía en el id que trae el
//     cliente, que pudo quedar viejo si alguien más guardó ese mismo
//     (vaca, fecha) mientras tanto.
//
// A DIFERENCIA del commit de chequeo (una sola RPC, todo o nada: un chequeo
// es UN evento con varias filas relacionadas), acá cada celda es un hecho
// independiente (`UNIQUE(animal_id, fecha)`, sin relación entre vacas ni
// entre semanas) -- así que una celda inválida NO aborta las demás: se
// escriben las que validan y se reportan las que no, para que una vaca
// vendida entre medias no le cueste a Martha los otros 67 pesajes.
//
// Escritura vía UPDATE-por-id + INSERT (nunca upsert de PostgREST -- mismo
// patrón que `useProduccionHato.guardarPesajes`, el camino de escritura
// manual del grid semanal). `fuente: 'foto'` distingue esta vía de `'web'`
// (grid manual) y `'telegram'`. `created_by` se setea EXPLÍCITO desde la
// sesión verificada -- `hato_pesajes_leche` no tiene trigger de
// `created_by` (a diferencia de `tareas`/`fin_gastos`/…, migraciones
// 040/050/063/074) y este handler escribe con la service role
// (`auth.uid()` sería NULL), así que sin esto la autoría se perdería.
//
// I/O puro en este archivo. Toda la lógica de clasificación/armado vive en
// `./importHato/ocrPesaje.ts` (copia GENERADA, ver
// docs/hato/regenerar-copias-importhato.py).

import { Context } from 'npm:hono';
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { fechasPesajeMensuales } from './calculos-hato.ts';
import {
  esCandidataRosterPesaje,
  ETAPAS_ROSTER_PESAJE,
  type CeldaDiffPesaje,
} from './importHato/ocrPesaje.ts';

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
interface CeldaCommitPesaje {
  animalId: string;
  fecha: string;
  litrosAm: number | null;
  litrosPm: number | null;
}

interface BodyCommitPesaje {
  anio?: number;
  mes?: number;
  celdas?: Array<Partial<CeldaDiffPesaje>>;
}

function validarBody(body: unknown): { anio: number; mes: number; celdas: CeldaCommitPesaje[] } | { error: string } {
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

  const celdas: CeldaCommitPesaje[] = [];
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

interface CeldaRechazada {
  animalId: string;
  fecha: string;
  motivo: string;
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

  // --- 2. hato_config.dia_pesaje_semanal FRESCO -- recomputa las fechas
  //    válidas para (anio, mes) EN ESTE INSTANTE, nunca las que vio el
  //    cliente en la vista previa. --------------------------------------
  const { data: configData, error: configError } = await supabase
    .from('hato_config')
    .select('valor')
    .eq('clave', 'dia_pesaje_semanal')
    .maybeSingle();
  if (configError) return respuestaError(c, 500, { error: `No se pudo leer hato_config: ${configError.message}` });
  const configValor = configData?.valor as { iso?: unknown } | undefined;
  if (!configValor || typeof configValor.iso !== 'number' || configValor.iso < 1 || configValor.iso > 7) {
    return respuestaError(c, 500, {
      error: 'hato_config.dia_pesaje_semanal no está configurado o tiene un valor inválido (migración 064).',
    });
  }
  const fechasValidasHoy = new Set(fechasPesajeMensuales(anio, mes, configValor.iso as number));

  // --- 3. Roster FRESCO -- mismo criterio que imprimió la planilla y que usó
  //    el OCR (`esCandidataRosterPesaje`), nunca uno propio: si acá fuera más
  //    estrecho, los litros de una fila que Martha vio y aprobó se perderían
  //    en silencio. Es también lo que acota el "agregar vaca" manual de la
  //    grilla de revisión: se puede añadir cualquiera del roster, y nada más.
  const animalIds = [...new Set(celdas.map((c) => c.animalId))];
  const { data: animalesData, error: animalesError } = await supabase
    .from('hato_animales')
    .select('id, etapa, estado')
    .in('id', animalIds)
    .in('etapa', ETAPAS_ROSTER_PESAJE);
  if (animalesError) {
    return respuestaError(c, 500, { error: `No se pudo leer hato_animales: ${animalesError.message}` });
  }
  const activasAhora = new Set(
    ((animalesData ?? []) as Array<{ id: string; etapa: string | null; estado: string | null }>)
      .filter((a) => esCandidataRosterPesaje({ etapa: a.etapa, estado: a.estado }))
      .map((a) => a.id),
  );

  // --- 4. Filtrar: solo celdas cuya vaca sigue activa y cuya fecha sigue
  //    siendo una ocurrencia real del día de pesaje configurado. Cada celda
  //    es un hecho independiente -- una inválida no bota a las demás. -----
  const aceptadas: CeldaCommitPesaje[] = [];
  const rechazadas: CeldaRechazada[] = [];
  for (const celda of celdas) {
    if (!activasAhora.has(celda.animalId)) {
      rechazadas.push({ animalId: celda.animalId, fecha: celda.fecha, motivo: 'El animal ya no está en el roster de la planilla -- puede haberse vendido o cambiado de etapa desde la vista previa.' });
      continue;
    }
    if (!fechasValidasHoy.has(celda.fecha)) {
      rechazadas.push({ animalId: celda.animalId, fecha: celda.fecha, motivo: 'Esa fecha ya no corresponde a una semana de pesaje configurada para este mes.' });
      continue;
    }
    aceptadas.push(celda);
  }

  if (aceptadas.length === 0) {
    return respuestaError(c, 400, {
      error: 'Ninguna celda pasó la revalidación -- el hato cambió desde la vista previa. No se escribió nada.',
      celdasRechazadas: rechazadas,
    });
  }

  // --- 5. Existentes FRESCOS -- decide UPDATE-por-id vs INSERT; nunca se
  //    confía en el `existenteId` que trajo el cliente. -------------------
  const fechasEnLote = [...new Set(aceptadas.map((c) => c.fecha))];
  const { data: existentesData, error: existentesError } = await supabase
    .from('hato_pesajes_leche')
    .select('id, animal_id, fecha')
    .in('animal_id', [...new Set(aceptadas.map((c) => c.animalId))])
    .in('fecha', fechasEnLote);
  if (existentesError) return respuestaError(c, 500, { error: `No se pudo leer hato_pesajes_leche: ${existentesError.message}` });
  const idExistentePorClave = new Map<string, string>();
  for (const fila of (existentesData ?? []) as Array<{ id: string; animal_id: string; fecha: string }>) {
    idExistentePorClave.set(`${fila.animal_id}|${fila.fecha}`, fila.id);
  }

  // --- 6. Escritura: UPDATE-por-id + INSERT, nunca upsert de PostgREST
  //    (mismo patrón que `useProduccionHato.guardarPesajes`). -------------
  let actualizados = 0;
  let creados = 0;
  const nuevasFilas: Array<{ animal_id: string; fecha: string; litros_am: number | null; litros_pm: number | null; litros_total: number; fuente: string; created_by: string }> = [];

  for (const celda of aceptadas) {
    const total = (celda.litrosAm ?? 0) + (celda.litrosPm ?? 0);
    const existenteId = idExistentePorClave.get(`${celda.animalId}|${celda.fecha}`);
    if (existenteId) {
      const { error } = await supabase
        .from('hato_pesajes_leche')
        .update({ litros_am: celda.litrosAm, litros_pm: celda.litrosPm, litros_total: total, fuente: 'foto' })
        .eq('id', existenteId);
      if (error) return respuestaError(c, 500, { error: `No se pudo actualizar el pesaje de '${celda.animalId}' en ${celda.fecha}: ${error.message}` });
      actualizados += 1;
    } else {
      nuevasFilas.push({
        animal_id: celda.animalId,
        fecha: celda.fecha,
        litros_am: celda.litrosAm,
        litros_pm: celda.litrosPm,
        litros_total: total,
        fuente: 'foto',
        created_by: acceso.userId,
      });
    }
  }

  if (nuevasFilas.length > 0) {
    const { error } = await supabase.from('hato_pesajes_leche').insert(nuevasFilas);
    if (error) return respuestaError(c, 500, { error: `No se pudieron insertar los pesajes nuevos: ${error.message}` });
    creados = nuevasFilas.length;
  }

  return c.json({
    success: true,
    guardados: actualizados + creados,
    actualizados,
    creados,
    celdasRechazadas: rechazadas,
  });
}
