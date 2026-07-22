// hato-chequeo-preview.ts — endpoint B0/V10 del plan (§7.4 "Import recurrente
// por chequeo"): `POST /make-server-1ccce916/hato/chequeo/preview`.
//
// Martha sube el .xlsx de UN chequeo nuevo (D-4, 2026-07-22: es el ÚNICO
// camino de entrada -- no hay internet en la finca, el chequeo nunca se
// captura en la app). Este endpoint lo parsea con la MISMA lógica de
// Extract+Normalize que ya corrió sobre las 45 hojas históricas (S3), lo
// compara contra el estado actual del hato, y devuelve un DIFF para que
// alguien apruebe. NUNCA comete un INSERT/UPDATE -- eso es un endpoint
// futuro y separado (plan: "muestra un diff para aprobar antes de
// comprometer... nunca commit directo").
//
// I/O puro en este archivo: parseo de multipart, lectura del .xlsx, consultas
// a Supabase. Toda la lógica de negocio (normalización, diff) vive en
// módulos puros con Vitest -- `./importHato/*.ts` (copia GENERADA de
// `src/utils/importHato/`, ver docs/hato/regenerar-copias-importhato.py) y
// `./hato-config-desde-tabla.ts`.
//
// Body esperado: `multipart/form-data` con un campo `archivo` (el .xlsx). Se
// eligió multipart sobre base64-en-JSON porque el archivo es binario y
// multipart evita el ~33% de overhead de base64; Hono lo soporta nativo vía
// `c.req.parseBody()`.

import { Context } from 'npm:hono';
import { createClient } from 'jsr:@supabase/supabase-js@2';
import * as XLSX from 'npm:xlsx@0.18.5';
import { normalizarHojas } from './importHato/normalizar.ts';
import { construirDiffChequeo, seleccionarUltimoChequeoPorAnimal } from './importHato/diffChequeo.ts';
import type {
  AnimalHatoActual,
  FilaChequeoVacaHistorico,
} from './importHato/diffChequeo.ts';
import type { HojaCruda } from './importHato/tipos.ts';
import { construirHatoConfigDesdeFilas, type FilaHatoConfig } from './hato-config-desde-tabla.ts';

const TAMANO_MAXIMO_BYTES = 20 * 1024 * 1024; // 20 MB -- una planilla real pesa unos pocos cientos de KB.
const ROLES_PERMITIDOS = new Set(['Administrador', 'Gerencia']); // mismo patrón de escritura que el resto de hato_* (migración 053).

function respuestaError(c: Context, status: 400 | 401 | 403 | 500, error: string) {
  return c.json({ success: false, error }, status);
}

// ---------------------------------------------------------------------------
// Auth: mismo patrón que `authenticateUser` en chat.tsx -- verifica el JWT
// contra Supabase Auth y exige que el rol en `usuarios` esté en el set de
// escritura del módulo. Este endpoint nunca escribe, pero expone el detalle
// completo del hato (nombres, PL, estado reproductivo) fila por fila, así
// que se gatea igual que el resto de hato_* en vez de dejarlo abierto a
// cualquier authenticated.
// ---------------------------------------------------------------------------
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
    return respuestaError(c, 403, 'Acceso restringido a Administrador o Gerencia (mismo permiso de escritura del módulo Hato Lechero).');
  }

  return { userId: userData.user.id };
}

// ---------------------------------------------------------------------------
// Lectura del .xlsx -- dos reglas NO cosméticas, copiadas de
// `scripts/import-hato/extract.ts` (mismo motivo, ver ahí el detalle):
//
// 1. `cellDates` queda en FALSE. Los parsers de `celdas.ts` esperan un
//    SERIAL de Excel para las fechas bien tipadas y lo convierten a texto
//    D/M/AAAA con aritmética UTC; `cellDates:true` entregaría objetos `Date`
//    construidos en la zona horaria del proceso, y una fecha a medianoche
//    puede correrse un día según dónde corra esto.
//
// 2. La grilla se arma celda por celda, NUNCA con `sheet_to_json`:
//    `sheet_to_json` con `raw:true` entrega el CÓDIGO NUMÉRICO de una celda
//    de error (`#VALUE!` -> 15), indistinguible de un dato numérico real. Y
//    `#VALUE!` es la señal más importante de este corpus (siempre deriva de
//    un `F Servicio` roto). Leyendo la celda directo se conserva el texto.
// ---------------------------------------------------------------------------
function hojaAMatriz(ws: XLSX.WorkSheet): unknown[][] {
  const ref = ws['!ref'];
  if (!ref) return [];
  const rango = XLSX.utils.decode_range(ref);
  const filas: unknown[][] = [];
  for (let r = rango.s.r; r <= rango.e.r; r++) {
    const fila: unknown[] = [];
    for (let c = rango.s.c; c <= rango.e.c; c++) {
      const celda = ws[XLSX.utils.encode_cell({ r, c })] as XLSX.CellObject | undefined;
      if (celda === undefined || celda.v === undefined || celda.v === null) {
        fila.push(null);
        continue;
      }
      // Celda de error de Excel: conservar el TEXTO (`#VALUE!`), nunca el
      // código numérico -- ver la regla 2 de arriba.
      if (celda.t === 'e') {
        fila.push(celda.w ?? '#VALUE!');
        continue;
      }
      fila.push(celda.v);
    }
    filas.push(fila);
  }
  return filas;
}

function leerHojasCrudas(bytes: Uint8Array, nombreArchivo: string): HojaCruda[] {
  const wb = XLSX.read(bytes, { type: 'array', cellDates: false });
  return wb.SheetNames.map((nombreHoja) => ({
    archivo: nombreArchivo,
    hoja: nombreHoja,
    filas: hojaAMatriz(wb.Sheets[nombreHoja]),
  }));
}

// ---------------------------------------------------------------------------
// Handler principal
// ---------------------------------------------------------------------------
export async function handleHatoChequeoPreview(c: Context): Promise<Response> {
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  const acceso = await verificarAcceso(c, supabase);
  if (acceso instanceof Response) return acceso;

  // --- 1. Leer el archivo subido -------------------------------------------
  let archivo: File;
  try {
    const body = await c.req.parseBody();
    const campo = body['archivo'];
    if (!(campo instanceof File)) {
      return respuestaError(c, 400, 'Falta el archivo .xlsx (multipart/form-data, campo "archivo").');
    }
    archivo = campo;
  } catch (err) {
    return respuestaError(c, 400, `No se pudo leer el cuerpo multipart: ${err instanceof Error ? err.message : String(err)}`);
  }

  if (archivo.size === 0) {
    return respuestaError(c, 400, 'El archivo subido está vacío.');
  }
  if (archivo.size > TAMANO_MAXIMO_BYTES) {
    return respuestaError(c, 400, `El archivo supera el tamaño máximo permitido (${TAMANO_MAXIMO_BYTES / 1024 / 1024} MB).`);
  }
  if (!/\.xlsx?$/i.test(archivo.name)) {
    return respuestaError(c, 400, `Extensión no soportada ('${archivo.name}') -- se espera .xlsx o .xls.`);
  }

  let hojas: HojaCruda[];
  try {
    const bytes = new Uint8Array(await archivo.arrayBuffer());
    hojas = leerHojasCrudas(bytes, archivo.name);
  } catch (err) {
    return respuestaError(c, 400, `No se pudo leer el archivo como Excel: ${err instanceof Error ? err.message : String(err)}`);
  }

  // --- 2. Config del motor, leída de hato_config (nunca hardcodeada) -------
  const { data: filasConfig, error: errorConfig } = await supabase
    .from('hato_config')
    .select('clave, valor');
  if (errorConfig) {
    return respuestaError(c, 500, `No se pudo leer hato_config: ${errorConfig.message}`);
  }
  let config;
  try {
    config = construirHatoConfigDesdeFilas((filasConfig ?? []) as FilaHatoConfig[]);
  } catch (err) {
    return respuestaError(c, 500, err instanceof Error ? err.message : String(err));
  }

  // --- 3. Extract + Normalize (motor compartido con el pipeline histórico) -
  const generadoEn = new Date().toISOString();
  const salida = normalizarHojas(hojas, generadoEn, config);

  // --- 4. Estado actual del hato para el diff -------------------------------
  const numerosEnHoja = [...new Set(salida.chequeos.map((f) => f.numero).filter((n): n is number => n !== null))];

  let animales: AnimalHatoActual[] = [];
  if (numerosEnHoja.length > 0) {
    const { data, error } = await supabase
      .from('hato_animales')
      .select('id, numero, nombre, etapa, estado')
      .in('numero', numerosEnHoja);
    if (error) return respuestaError(c, 500, `No se pudo leer hato_animales: ${error.message}`);
    animales = (data ?? []) as AnimalHatoActual[];
  }

  const animalIds = animales.map((a) => a.id);
  let historico: FilaChequeoVacaHistorico[] = [];
  if (animalIds.length > 0) {
    const { data, error } = await supabase
      .from('hato_chequeo_vacas')
      .select('animal_id, pl, num_partos, fecha_servicio, toro, tipo_servicio, fecha_secar, fecha_probable_parto, estado, created_at, hato_chequeos(fecha)')
      .in('animal_id', animalIds);
    if (error) return respuestaError(c, 500, `No se pudo leer hato_chequeo_vacas: ${error.message}`);
    historico = (data ?? []).map((fila: Record<string, unknown>) => {
      const chequeo = fila.hato_chequeos as { fecha: string } | { fecha: string }[] | null;
      const fecha = Array.isArray(chequeo) ? chequeo[0]?.fecha : chequeo?.fecha;
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
  const diffChequeos = construirDiffChequeo(salida.chequeos, animales, ultimosChequeos);

  // --- 5. Respuesta: SOLO diff, nunca un commit ----------------------------
  return c.json({
    success: true,
    archivo: archivo.name,
    generadoEn,
    hojas: salida.hojas,
    diffChequeos,
    // TERNERAS/sub-tablas: se parsean (mismo motor) pero no se diffean contra
    // la BD en este endpoint -- son un dato distinto (nacimientos, no un
    // estado reproductivo por vaca) fuera del alcance de B0/V10. Se
    // devuelven íntegras para que nadie pierda esa información en silencio.
    terneras: salida.terneras,
    subtablas: salida.subtablas,
  });
}
