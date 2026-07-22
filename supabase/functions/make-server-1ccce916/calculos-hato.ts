// ARCHIVO: supabase/functions/server/calculos-hato.ts
// DESCRIPCIÓN: Copia Deno-side, mantenida a mano, de `src/utils/calculosHato.ts`.
//
// POR QUÉ EXISTE ESTE DUPLICADO: `chat.tsx` (y el tick de alertas de S6) no
// pueden importar desde `src/utils/` — cruzarían la frontera del árbol de
// despliegue de la edge function. Es exactamente la misma restricción que
// produjo `priorizacion-scouting.ts` como copia de `priorizacionMonitoreo.ts`.
//
// CONTRATO DE PARIDAD — `src/__tests__/calculosHatoParidad.test.ts` exige que
// TODO lo que va debajo del marcador "Tipos compartidos" sea BYTE-IDÉNTICO al
// archivo del frontend, y además corre ambas implementaciones contra los
// mismos fixtures. El motor es puro (cero imports), así que no hay ninguna
// razón legítima para que los cuerpos difieran: si necesitas cambiar la lógica
// del hato, cambia AMBOS archivos en el MISMO commit o el test falla. Eso es
// intencional — es el único mecanismo que impide que el P&G del hato que ve
// Esco/Telegram se desincronice del que ve la app.
//
// NO edites este archivo a mano para "arreglar" una falla de paridad: edita
// `src/utils/calculosHato.ts` y regenera la copia.

// ============================================================================
// Tipos compartidos
// ============================================================================

/** Un valor crudo que no se pudo interpretar limpiamente. `crudo` conserva el
 * valor tal cual venía en la planilla (nunca se descarta), `motivo` explica
 * en español qué falló o qué heurística de recuperación se aplicó. */
export interface ParseIssue {
  crudo: string;
  motivo: string;
}

/** Espejo 1:1 de las 9 claves sembradas en `hato_config`
 * (058_create_hato_config.sql). El motor de fechas y la derivación de estado
 * NUNCA usan un valor de negocio que no venga de aquí. */
export interface HatoConfig {
  /** Catálogo de razas conocidas (V6/H1). Informativo -- `meses_secado_por_raza`
   * es la tabla que realmente gobierna el cálculo. */
  razas: string[];
  /** Meses de secado antes del parto por raza (clave en minúsculas). Debe
   * incluir `_default`, usado cuando la raza del animal es desconocida o no
   * está en el catálogo. */
  meses_secado_por_raza: Record<string, number>;
  /** PP = fecha de servicio + este número de meses (B2). */
  meses_gestacion_default: number;
  /** Umbral de partos para el indicador "próxima a reemplazo" (A7/V9/H2). */
  umbral_partos_reemplazo: number;
  /** Ventana en días de la lista "próximas a secar" del tablero (E1). */
  ventana_proxima_secar_dias: number;
  /** Ventana en días de la lista "próximas a parir" del tablero (E1). */
  ventana_proximo_parir_dias: number;
  /** Ventana en días de la alerta `parto_proximo` (§7.3, distinta de la del tablero). */
  dias_parto_proximo_alerta: number;
  /** Días desde el servicio sin confirmación para disparar `servicio_sin_confirmacion` (§7.3). */
  dias_servicio_sin_confirmacion: number;
  /** Días desde el último chequeo para disparar `rechequeo_due` a nivel hato (§7.3). */
  dias_rechequeo_due: number;
  /** Días tras el parto durante los cuales una vaca vacía es NORMAL (período
   * de espera voluntario), no un problema (D-2, migración 062). Concepto
   * distinto de `dias_servicio_sin_confirmacion`: ese cuenta desde el
   * SERVICIO, este desde el PARTO. Tenerlos separados evita que cambiar uno
   * mueva en silencio la clasificación del otro. */
  dias_espera_voluntaria_post_parto: number;
}

// ============================================================================
// Utilidades compartidas de fecha (ISO yyyy-mm-dd, comparables como texto)
// ============================================================================

/** Años plausibles para este hato -- el archivo más viejo es de 2019, el más
 * nuevo julio 2026. Usado para rechazar años estructuralmente "recuperables"
 * (2 o 3 dígitos) que igual caen fuera de cualquier rango razonable. */
const ANIO_MIN = 2015;
const ANIO_MAX = 2035;

function parsearIso(fechaIso: string): { anio: number; mes: number; dia: number } {
  const [anio, mes, dia] = fechaIso.split('-').map(Number);
  return { anio, mes, dia };
}

/** Suma (o resta, con `meses` negativo) meses calendario a una fecha ISO,
 * CLAMPANDO al último día del mes destino cuando este es más corto que el
 * día de origen (ej. 30 de mayo + 9 meses -> 28 de febrero, nunca rueda a
 * marzo). Esto replica el comportamiento de Excel/`EDATE` -- verificado
 * contra 1.124 filas reales con `F Servicio` y `PP` ambos presentes: un
 * `new Date(Date.UTC(...))` sin clamp (que hace roll-over, ej. 30/feb ->
 * 2/marzo) diverge del histórico real en exactamente los casos de fin de
 * mes (evidencia: CAPELA, `F Servicio=2020-05-30` -> `PP` real en la
 * planilla es `2021-02-28`, no `2021-03-02`). Sin este clamp, encadenar
 * `calcularFechaSecar` sobre un `PP` ya mal calculado compondría el error. */
function sumarMeses(fechaIso: string, meses: number): string {
  const { anio, mes, dia } = parsearIso(fechaIso);
  const totalMeses = mes - 1 + meses;
  const anioDestino = anio + Math.floor(totalMeses / 12);
  const mesDestino = ((totalMeses % 12) + 12) % 12; // 0-11
  const ultimoDiaMesDestino = new Date(Date.UTC(anioDestino, mesDestino + 1, 0)).getUTCDate();
  const diaClamped = Math.min(dia, ultimoDiaMesDestino);
  return `${anioDestino}-${String(mesDestino + 1).padStart(2, '0')}-${String(diaClamped).padStart(2, '0')}`;
}

/** Diferencia en días (hasta - desde). Las fechas ISO yyyy-mm-dd también se
 * pueden comparar como texto (`<`/`>`/`localeCompare`) para saber orden
 * cronológico sin parsear -- se usa esa propiedad en varios puntos de este
 * archivo (mismo truco que `ordenarPorFecha` en priorizacionMonitoreo.ts). */
function diferenciaDias(desde: string, hasta: string): number {
  const a = parsearIso(desde);
  const b = parsearIso(hasta);
  const ta = Date.UTC(a.anio, a.mes - 1, a.dia);
  const tb = Date.UTC(b.anio, b.mes - 1, b.dia);
  return Math.round((tb - ta) / 86400000);
}

/** Normaliza un año crudo de 2, 3 o 4 dígitos a un año de 4 dígitos.
 * Devuelve `anio: null` cuando la longitud no permite ninguna heurística
 * razonable -- mejor una fecha no reconocida (issue) que una inventada.
 * Cuando SÍ aplica una corrección, `nota` documenta qué se asumió: nunca se
 * aplica en silencio (evidencia real: `7/09/230`, `13/05/019`, `14/05/240`,
 * `21/06/240` en F Servicio -- doc S2 §4). */
function normalizarAnio(yStr: string): { anio: number | null; nota?: string } {
  if (yStr.length === 4) {
    return { anio: parseInt(yStr, 10) };
  }
  if (yStr.length === 2) {
    return { anio: 2000 + parseInt(yStr, 10) };
  }
  if (yStr.length === 3) {
    if (yStr.startsWith('0')) {
      // ej. '019' -> probablemente '2019' con el '2' inicial perdido.
      const corregido = 2000 + parseInt(yStr, 10);
      return {
        anio: corregido,
        nota: `año '${yStr}' interpretado como ${corregido} (posible dígito '2' inicial perdido) -- revisar`,
      };
    }
    if (yStr.endsWith('0')) {
      // ej. '230'/'240' -> probablemente '23'/'24' con un cero de más al final.
      const base = parseInt(yStr.slice(0, 2), 10);
      const corregido = 2000 + base;
      return {
        anio: corregido,
        nota: `año '${yStr}' interpretado como ${corregido} (posible cero de más al final) -- revisar`,
      };
    }
    return { anio: null };
  }
  return { anio: null };
}

function anioEnRango(anio: number | null): anio is number {
  return anio !== null && anio >= ANIO_MIN && anio <= ANIO_MAX;
}

function convertirRawATexto(raw: unknown): string {
  if (typeof raw === 'string') return raw.trim();
  if (raw === null || raw === undefined) return '';
  return String(raw).trim();
}

// ============================================================================
// BLOQUE 1 — Parsers de planilla
// ============================================================================

// ----------------------------------------------------------------------------
// 1.a `parseFechasServicio` -- celda `F Servicio`: hasta 3 fechas, separadores
// `/`, `//`, `-`, espacio o ninguno (concatenadas), años rotos, meses
// inválidos, o texto que no es fecha en absoluto (evidencia: doc S2 §4).
// ----------------------------------------------------------------------------

export interface ResultadoFechasServicio {
  fechas: string[];
  issues: ParseIssue[];
}

/** Divide corridas de dígitos de 5-6 caracteres en año(4) + resto -- caso de
 * fechas concatenadas SIN separador donde el año de una fecha queda pegado
 * al día de la siguiente (ej. '30/05/202520/07/2025' -> runs ['30','05',
 * '202520','07','2025'] -> '202520' es '2025'+'20'). También recupera años
 * de 5 dígitos con un cero de más pegado al final (ej. '22/08/20220' ->
 * '2022'+'0', el '0' sobrante queda como resto sin fecha completa). */
function dividirCorridaLarga(numeros: string[]): string[] {
  const resultado: string[] = [];
  for (const n of numeros) {
    if (n.length === 5 || n.length === 6) {
      resultado.push(n.slice(0, 4), n.slice(4));
    } else {
      resultado.push(n);
    }
  }
  return resultado;
}

function normalizarFechaDDMMYYYY(
  dStr: string,
  mStr: string,
  yStr: string,
): { fecha: string | null; nota?: string } {
  if (mStr.length > 2) {
    return { fecha: null, nota: `mes fuera de rango (1-12): '${mStr}'` };
  }
  const mes = parseInt(mStr, 10);
  if (!(mes >= 1 && mes <= 12)) {
    return { fecha: null, nota: `mes fuera de rango (1-12): '${mStr}'` };
  }
  const dia = parseInt(dStr, 10);
  if (!(dia >= 1 && dia <= 31)) {
    return { fecha: null, nota: `día fuera de rango (1-31): '${dStr}'` };
  }
  const { anio, nota } = normalizarAnio(yStr);
  if (!anioEnRango(anio)) {
    return { fecha: null, nota: `año no reconocible: '${yStr}'` };
  }
  return {
    fecha: `${anio}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`,
    nota,
  };
}

/**
 * Parser de la celda `F Servicio`. Extrae TODAS las fechas día/mes/año que
 * pueda reconocer en el texto crudo, sin importar separador ni cantidad
 * (hasta 3 servicios reales observados). Un fragmento no interpretable
 * (mes inválido, año irrecuperable, texto que no es fecha en absoluto) va a
 * `issues` con el crudo intacto -- nunca se descarta la celda completa por
 * un fragmento roto.
 */
export function parseFechasServicio(raw: unknown): ResultadoFechasServicio {
  const crudo = convertirRawATexto(raw);
  if (crudo === '') return { fechas: [], issues: [] };

  // 'no serv'/'no servicio' es una AFIRMACIÓN EXPLÍCITA de ausencia (evidencia
  // QA: NONA, dos hojas distintas) -- a diferencia de 'ok'/'vacia'/'RECH' (un
  // código de OTRA columna filtrado por error, que sí amerita issue más
  // abajo), esto no es un dato ambiguo: no hubo servicio, punto. No se genera
  // issue, igual que una celda vacía.
  if (/^no\s*serv/i.test(crudo)) {
    return { fechas: [], issues: [] };
  }

  const numerosOriginales = crudo.match(/\d+/g);
  if (!numerosOriginales) {
    // Texto libre sin ningún dígito: 'ok', 'RECH', 'vacia', 'o+',
    // 'PREÑADA 70%...' cae aquí solo si además no tuviera dígitos -- los que
    // sí tienen dígitos (ver abajo) se manejan por la vía numérica.
    return { fechas: [], issues: [{ crudo, motivo: 'no contiene una fecha reconocible' }] };
  }

  const fragmentos = dividirCorridaLarga(numerosOriginales);
  const fechas: string[] = [];
  const issues: ParseIssue[] = [];

  let i = 0;
  while (i + 3 <= fragmentos.length) {
    const [d, m, y] = fragmentos.slice(i, i + 3);
    i += 3;
    const { fecha, nota } = normalizarFechaDDMMYYYY(d, m, y);
    if (fecha) {
      fechas.push(fecha);
      if (nota) issues.push({ crudo, motivo: nota });
    } else if (nota) {
      issues.push({ crudo, motivo: nota });
    }
  }
  if (i < fragmentos.length) {
    issues.push({
      crudo,
      motivo: `resto numérico sin fecha completa: ${fragmentos.slice(i).join('/')}`,
    });
  }
  if (crudo.includes('?')) {
    issues.push({ crudo, motivo: "contiene marcador de incertidumbre '?'" });
  }

  return { fechas, issues };
}

// ----------------------------------------------------------------------------
// 1.b `parseSX` -- 143 valores distintos observados, el plan documenta 5
// familias (doc S2 §5). Nunca inventa semántica para lo no definido (Mv,
// gem+, nombres de vaca mal digitados): esos van a `tipo: 'desconocido'`.
// ----------------------------------------------------------------------------

export type TipoSX =
  | 'ov' // parto, cria_destino='macho_vendido'
  | 'av' // parto, cria_destino='hembra_vendida'
  | 'a_n' // parto, cria_destino='retenida', numeroCria si se pudo leer
  | 'a_mas' // parto, cria_destino='muerta'
  | 'o_mas' // parto cria_destino='muerta', O 'sin parto -> aborto' (ambiguo, ver descomponerSX)
  | 'aborto' // aborto explícito (abort/aborto/ABORTO/AB)
  | 'vacia' // estado, no evento
  | 'vendida' // estado, no evento (la venta se registra por otro flujo)
  | 'cero' // '0' -- significado no definido en el plan, agrupado como estado
  | 'gemelar' // 'gem+' = parto GEMELAR (confirmado por el dueño, 2026-07-22)
  | 'mv' // 'Mv' = "vacas de Martha" -- sin significado para el sistema (dueño, 2026-07-22)
  | 'desconocido' // código no reconocido (nombres de vaca, basura)
  | 'vacio'; // celda vacía -- no se checó/no aplica esta ronda, nunca "0"

export interface ResultadoSX {
  crudo: string;
  tipo: TipoSX;
  numeroCria?: number;
  raza?: string;
  incierto: boolean;
  issues: ParseIssue[];
}

/**
 * Parser de la celda `SX`. Reconoce las familias documentadas (OV/AV/A{n}/
 * A+/O+/aborto/vacia/vendida), los códigos definidos por el dueño en la
 * segunda ronda de decisiones 2026-07-22 (`gem+` = parto gemelar, `Mv` =
 * marca personal de Martha sin significado para el sistema), sufijos de raza
 * pegados al código (gir/hol/hlt) y marcadores de incertidumbre (`?`). Todo
 * lo demás (nombres de vaca mal digitados en la columna, basura) se preserva
 * como `tipo: 'desconocido'` con el crudo intacto -- nada se adivina.
 */
export function parseSX(raw: unknown): ResultadoSX {
  const crudo = convertirRawATexto(raw);
  if (crudo === '') {
    return { crudo, tipo: 'vacio', incierto: false, issues: [] };
  }

  const incierto = crudo.includes('?');
  let working = incierto ? crudo.replace(/\?/g, '').trim() : crudo;

  let raza: string | undefined;
  if (/gu?ir/i.test(working)) {
    raza = 'gyr';
    working = working.replace(/gu?ir/i, '').trim();
  } else if (/hlt|hol/i.test(working)) {
    raza = 'holstein';
    working = working.replace(/hlt|hol/i, '').trim();
  }

  const key = working.replace(/\s+/g, '').toLowerCase();
  const issues: ParseIssue[] = [];

  if (key === '') {
    // Solo quedaba la raza y/o el marcador de incertidumbre -- ningún código
    // de evento reconocible (ej. 'gir' solo).
    issues.push({
      crudo,
      motivo: `SX solo indica raza/incertidumbre sin código de evento reconocible${
        raza ? ` (raza detectada: ${raza})` : ''
      } -- revisar`,
    });
    return { crudo, tipo: 'desconocido', raza, incierto, issues };
  }

  // 'ov'/'oc' (typo de teclado adyacente v/c) / 'o v' (ya sin espacios aquí)
  if (/^o[vc]$/.test(key)) {
    return { crudo, tipo: 'ov', raza, incierto, issues };
  }
  if (key === 'av') {
    return { crudo, tipo: 'av', raza, incierto, issues };
  }
  if (key === 'a+') {
    return { crudo, tipo: 'a_mas', raza, incierto, issues };
  }
  if (key === 'o+') {
    return { crudo, tipo: 'o_mas', raza, incierto, issues };
  }
  if (key === 'a') {
    issues.push({ crudo, motivo: "código 'A' (retenida) sin número de cría especificado -- revisar" });
    return { crudo, tipo: 'a_n', raza, incierto, issues };
  }
  const matchNumero = /^a(\d+)/.exec(key);
  if (matchNumero) {
    const numeroCria = parseInt(matchNumero[1], 10);
    const resto = key.slice(matchNumero[0].length);
    if (resto !== '') {
      const extra = /(\d+)/.exec(resto);
      if (extra) {
        issues.push({
          crudo,
          motivo: `se encontró un segundo número ('${extra[1]}') además del principal (${numeroCria}) -- posible ambigüedad de identidad de la cría, revisar`,
        });
      } else {
        issues.push({ crudo, motivo: `texto adicional sin interpretar tras el número de cría: '${resto}'` });
      }
    }
    return { crudo, tipo: 'a_n', numeroCria, raza, incierto, issues };
  }
  const matchAborto = /^(aborto|abort|ab)/.exec(key);
  if (matchAborto) {
    const resto = key.slice(matchAborto[0].length);
    if (resto !== '') {
      issues.push({
        crudo,
        motivo: `texto adicional tras 'abort': '${resto}' -- no se interpreta como fecha en este parser, revisar`,
      });
    }
    return { crudo, tipo: 'aborto', raza, incierto, issues };
  }
  if (key === 'vacia') {
    return { crudo, tipo: 'vacia', raza, incierto, issues };
  }
  if (key === 'vendida') {
    return { crudo, tipo: 'vendida', raza, incierto, issues };
  }
  if (key === '0') {
    issues.push({
      crudo,
      motivo: "SX='0' -- significado no definido en el diseño (plan §7.1 solo lo agrupa como 'estado, no evento'), revisar",
    });
    return { crudo, tipo: 'cero', raza, incierto, issues };
  }
  // 'Mv' y 'gem+' dejaron de ser preguntas abiertas: el dueño los definió el
  // 2026-07-22 (segunda ronda de decisiones, ver plan §8).
  if (key === 'mv') {
    // "Vacas de Martha" -- una marca personal de la dueña sin significado
    // para el sistema. Se reconoce (no cae al genérico 'desconocido' con
    // issue de revisión) y se ignora: ni evento ni estado. El crudo queda
    // intacto, como siempre.
    return { crudo, tipo: 'mv', raza, incierto, issues };
  }
  if (key === 'gem+') {
    // Parto GEMELAR, confirmado por el dueño. `descomponerSX` genera el
    // evento de parto con `datos.gemelar = true`.
    return { crudo, tipo: 'gemelar', raza, incierto, issues };
  }

  issues.push({ crudo, motivo: `código SX no reconocido: '${crudo}' -- no se inventa semántica, queda para revisión` });
  return { crudo, tipo: 'desconocido', raza, incierto, issues };
}

// ----------------------------------------------------------------------------
// 1.c `parseFechaChequeo` -- el título de la fila 1 manda, el nombre de hoja
// es respaldo/validación (regla de doc S2 §3).
// ----------------------------------------------------------------------------

const MESES: ReadonlyArray<{ nombre: string; num: number }> = [
  { nombre: 'enero', num: 1 },
  { nombre: 'febrero', num: 2 },
  { nombre: 'marzo', num: 3 },
  { nombre: 'abril', num: 4 },
  { nombre: 'mayo', num: 5 },
  { nombre: 'junio', num: 6 },
  { nombre: 'julio', num: 7 },
  { nombre: 'agosto', num: 8 },
  { nombre: 'septiembre', num: 9 },
  { nombre: 'octubre', num: 10 },
  { nombre: 'noviembre', num: 11 },
  { nombre: 'diciembre', num: 12 },
];

function normalizarTexto(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
}

/** Busca un nombre de mes en español dentro del texto, tolerando prefijos
 * garabateados (ej. 'ASEPT' contiene 'sep', abreviatura de septiembre) y
 * abreviaturas de 3 letras (ej. 'jun' para junio). Solo substring, sin
 * `\b`: un garabato como 'ASEPT' no tiene frontera de palabra antes de
 * 'sep', así que exigir `\b` perdería el caso real que motiva esta regla
 * (doc S2 §3). */
function encontrarMes(texto: string): { num: number; nombre: string } | null {
  const norm = normalizarTexto(texto);
  for (const { nombre, num } of MESES) {
    const abrev = nombre.slice(0, 3);
    if (norm.includes(nombre) || norm.includes(abrev)) {
      return { num, nombre };
    }
  }
  return null;
}

function clasificarNumero(
  tok: string,
): { tipo: 'dia'; valor: number } | { tipo: 'anio'; valor: number; nota?: string } | null {
  if (tok.length <= 2) {
    const v = parseInt(tok, 10);
    if (v >= 1 && v <= 31) return { tipo: 'dia', valor: v };
    return null;
  }
  const r = normalizarAnio(tok);
  if (anioEnRango(r.anio)) {
    return { tipo: 'anio', valor: r.anio, nota: r.nota };
  }
  return null;
}

/** Busca la primera ventana de 4 dígitos consecutivos dentro de `texto` cuyo
 * valor cae en el rango de años plausible -- tolera basura intermedia (ej.
 * un dígito de más) entre el día y el año de un bloque pegado. */
function buscarAnioValido(texto: string): number | null {
  for (let i = 0; i + 4 <= texto.length; i++) {
    const anio = parseInt(texto.slice(i, i + 4), 10);
    if (anio >= ANIO_MIN && anio <= ANIO_MAX) return anio;
  }
  return null;
}

/** Intenta separar un bloque numérico pegado "día+año" (con basura suelta
 * entremedio, típicamente un carácter perdido) en un título garabateado, ej.
 * 'ENERO 1702024' -> día 17, año 2024 (evidencia real: `CHEQUEO VETE ENERO
 * 1702024`, doc S2 §3). Prueba día de 2 dígitos y de 1 dígito al inicio del
 * bloque y busca un año válido en lo que queda. */
function partirBloqueDiaAnio(bloque: string): { dia: number; anio: number } | null {
  for (const largoDia of [2, 1]) {
    const diaTxt = bloque.slice(0, largoDia);
    const dia = parseInt(diaTxt, 10);
    if (!(dia >= 1 && dia <= 31)) continue;
    const anio = buscarAnioValido(bloque.slice(largoDia));
    if (anio !== null) return { dia, anio };
  }
  return null;
}

function elegirDiaYAnio(tokens: string[]): {
  dia: number | null;
  anio: number | null;
  notaAnio?: string;
  extra: string[];
  bloquesPartidos: string[];
} {
  let dia: number | null = null;
  let anio: number | null = null;
  let notaAnio: string | undefined;
  const extra: string[] = [];
  const bloquesPartidos: string[] = [];

  for (const tok of tokens) {
    const c = clasificarNumero(tok);
    if (c?.tipo === 'dia') {
      if (dia === null) dia = c.valor;
      else extra.push(tok);
      continue;
    }
    if (c?.tipo === 'anio') {
      if (anio === null) {
        anio = c.valor;
        notaAnio = c.nota;
      } else extra.push(tok);
      continue;
    }
    if (tok.length >= 5) {
      const partido = partirBloqueDiaAnio(tok);
      if (partido && dia === null && anio === null) {
        dia = partido.dia;
        anio = partido.anio;
        bloquesPartidos.push(tok);
        continue;
      }
    }
    extra.push(tok);
  }

  return { dia, anio, notaAnio, extra, bloquesPartidos };
}

function extraerCandidata(texto: string): {
  mes: { num: number; nombre: string } | null;
  dia: number | null;
  anio: number | null;
  notaAnio?: string;
  extra: string[];
  bloquesPartidos: string[];
} {
  const mes = encontrarMes(texto);
  const numeros = texto.match(/\d+/g) ?? [];
  const { dia, anio, notaAnio, extra, bloquesPartidos } = elegirDiaYAnio(numeros);
  return { mes, dia, anio, notaAnio, extra, bloquesPartidos };
}

function construirIso(anio: number, mes: number, dia: number): string {
  return `${anio}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
}

export interface ResultadoFechaChequeo {
  fecha: string | null;
  confianza: 'alta' | 'media' | 'baja';
  issues: ParseIssue[];
}

/**
 * Resuelve la fecha real de un chequeo a partir del título de su fila 1 y
 * del nombre de la hoja de Excel. Regla (doc S2 §3): el título manda; si le
 * falta el día, se completa con el nombre de hoja; si título y hoja
 * discrepan en mes o año, se marca un issue y se degrada la confianza --
 * pero el valor final siempre sale del título cuando este lo tiene completo.
 */
export function parseFechaChequeo(tituloR1: string, nombreHoja: string): ResultadoFechaChequeo {
  const issues: ParseIssue[] = [];
  const titulo = convertirRawATexto(tituloR1);
  const hoja = convertirRawATexto(nombreHoja);

  const t = extraerCandidata(titulo);
  const h = extraerCandidata(hoja);

  if (t.extra.length > 0) {
    issues.push({
      crudo: titulo,
      motivo: `valores numéricos adicionales sin usar en el título: ${t.extra.join(', ')} -- posible segunda fecha embebida, revisar`,
    });
  }
  if (t.notaAnio) {
    issues.push({ crudo: titulo, motivo: t.notaAnio });
  }

  let confianza: 'alta' | 'media' | 'baja' = 'alta';
  if (t.bloquesPartidos.length > 0) {
    for (const b of t.bloquesPartidos) {
      issues.push({
        crudo: titulo,
        motivo: `bloque numérico '${b}' sin separador se interpretó como día+año (posible carácter perdido) -- revisar`,
      });
    }
    confianza = 'media';
  }

  if (!t.mes) {
    // El título no tiene mes reconocible -- último recurso: nombre de hoja
    // completo (mejor que devolver null si la hoja SÍ es interpretable).
    if (h.mes && h.dia !== null && h.anio !== null) {
      issues.push({
        crudo: `${titulo} / ${hoja}`,
        motivo: 'el título no tiene mes reconocible; se usó el nombre de hoja completo -- revisar',
      });
      return { fecha: construirIso(h.anio, h.mes.num, h.dia), confianza: 'baja', issues };
    }
    issues.push({
      crudo: `${titulo} / ${hoja}`,
      motivo: 'no se pudo reconocer un mes ni en el título ni en el nombre de hoja',
    });
    return { fecha: null, confianza: 'baja', issues };
  }

  let dia = t.dia;
  let anio = t.anio;

  if (dia === null && h.dia !== null) {
    dia = h.dia;
    issues.push({
      crudo: `${titulo} / ${hoja}`,
      motivo: `día tomado del nombre de hoja (${h.dia}) -- el título no lo incluía`,
    });
    confianza = confianza === 'alta' ? 'media' : confianza;
  }
  if (anio === null && h.anio !== null) {
    anio = h.anio;
    issues.push({
      crudo: `${titulo} / ${hoja}`,
      motivo: `año tomado del nombre de hoja (${h.anio}) -- el título no lo incluía`,
    });
    confianza = confianza === 'alta' ? 'media' : confianza;
  }

  // Discrepancia mes/año entre título y hoja -- señal de hoja copiada/
  // duplicada, se marca aun si el título ya era autosuficiente (doc S2 §3).
  if (h.mes && h.mes.num !== t.mes.num) {
    issues.push({
      crudo: `${titulo} / ${hoja}`,
      motivo: `el nombre de hoja sugiere el mes ${h.mes.nombre} pero el título indica ${t.mes.nombre} -- revisar`,
    });
    confianza = 'baja';
  }
  if (h.anio !== null && anio !== null && h.anio !== anio) {
    issues.push({
      crudo: `${titulo} / ${hoja}`,
      motivo: `el nombre de hoja sugiere el año ${h.anio} pero la fecha resuelta usa ${anio} -- revisar`,
    });
    confianza = 'baja';
  }

  if (dia === null || anio === null) {
    issues.push({
      crudo: `${titulo} / ${hoja}`,
      motivo: 'no se pudo determinar día y/o año de chequeo, ni en el título ni en el nombre de hoja',
    });
    return { fecha: null, confianza: 'baja', issues };
  }

  return { fecha: construirIso(anio, t.mes.num, dia), confianza, issues };
}

// ----------------------------------------------------------------------------
// 1.d `parseValorNumerico` -- PL / #P2, tolerando `#VALUE!` y texto.
// ----------------------------------------------------------------------------

export interface ResultadoValorNumerico {
  valor: number | null;
  issues: ParseIssue[];
}

/** Parser genérico para celdas numéricas de la planilla (`PL`, `#P2`).
 * Nunca lanza: un error de fórmula de Excel (`#VALUE!`, `#N/A`, `#DIV/0!`) o
 * texto no numérico produce `valor: null` + issue, nunca `NaN` ni `0`. */
export function parseValorNumerico(raw: unknown): ResultadoValorNumerico {
  if (raw === null || raw === undefined) return { valor: null, issues: [] };
  if (typeof raw === 'number') {
    if (Number.isFinite(raw)) return { valor: raw, issues: [] };
    return { valor: null, issues: [{ crudo: String(raw), motivo: 'valor numérico no finito' }] };
  }
  const crudo = String(raw).trim();
  if (crudo === '') return { valor: null, issues: [] };
  if (/^#(VALUE|N\/A|DIV\/0)!?$/i.test(crudo)) {
    return { valor: null, issues: [{ crudo, motivo: 'error de fórmula de Excel propagado (no se reinterpreta aquí)' }] };
  }
  const normalizado = crudo.replace(',', '.');
  if (/^-?\d+(\.\d+)?$/.test(normalizado)) {
    return { valor: Number(normalizado), issues: [] };
  }
  return { valor: null, issues: [{ crudo, motivo: 'texto no numérico' }] };
}

// ----------------------------------------------------------------------------
// 1.e `parseEstado` -- celda `ESTADO`/`OBS`. Distingue "vacía normal" de
// "vacía problema" (decisión confirmada por el dueño, V14) y preserva la
// fecha heredada de Gen 1 cuando esta columna trae `SEC REAL`/`parto real`
// en vez de un código (doc S2 §2/§7, QA §2.10).
// ----------------------------------------------------------------------------

export type TipoEstado =
  | 'vacia_apta' // ok/0k -- vacía NORMAL y sana, esperando celo (V14, confirmado por el dueño)
  | 'vacia_problema' // rech/rechq/rec/r -- requiere rechequeo/revisión veterinaria
  | 'fecha_heredada' // el valor es una fecha -- residuo de SEC REAL/parto real de Gen 1
  | 'desconocido' // código no reconocido (ej. 'momia', '3m') -- no se inventa semántica
  | 'vacio'; // celda vacía -- no se checó, nunca "0"

export interface ResultadoEstado {
  crudo: string;
  tipo: TipoEstado;
  /** Solo presente cuando `tipo === 'fecha_heredada'`. */
  fecha?: string;
  incierto: boolean;
  issues: ParseIssue[];
}

/** Intenta leer `texto` como una fecha completa (día/mes/año, cualquier
 * separador, reutilizando la misma extracción numérica que `F Servicio`; o
 * ISO directo `yyyy-mm-dd`, forma en que a veces llega si el extractor de
 * origen ya serializó la celda como fecha). `null` si no hay ninguna fecha
 * completa reconocible -- nunca lanza. */
function intentarExtraerFechaHeredada(texto: string): string | null {
  const isoDirecto = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(texto);
  if (isoDirecto) {
    const anio = parseInt(isoDirecto[1], 10);
    const mes = parseInt(isoDirecto[2], 10);
    const dia = parseInt(isoDirecto[3], 10);
    if (anioEnRango(anio) && mes >= 1 && mes <= 12 && dia >= 1 && dia <= 31) {
      return construirIso(anio, mes, dia);
    }
    return null;
  }
  const numeros = texto.match(/\d+/g);
  if (!numeros) return null;
  const fragmentos = dividirCorridaLarga(numeros);
  if (fragmentos.length < 3) return null;
  const { fecha } = normalizarFechaDDMMYYYY(fragmentos[0], fragmentos[1], fragmentos[2]);
  return fecha;
}

/**
 * Parser de la celda `ESTADO`/`OBS`. `ok`/`0k` (y variantes) es un estado
 * SANO -- vacía normal esperando celo, NUNCA se trata como un problema; a
 * diferencia de `rech`/`rechq`/`rec`/`r` (a veces con `?`), que sí indica
 * que la vaca necesita rechequeo/revisión (V14, confirmado por el dueño).
 * `'ok rech'` (2 casos reales, ambas señales en una sola celda) resuelve a
 * `'vacia_problema'`: ante la duda, prevalece la señal más cautelosa, nunca
 * se oculta un "necesita revisión" detrás de un "ok".
 *
 * Esta es la MISMA posición de columna que en Gen 1 traía `SEC REAL`/
 * `parto real` (doc S2 §2) -- a veces el valor es una fecha en vez de un
 * código. Esa fecha documenta un evento de un ciclo reproductivo ANTERIOR:
 * la correspondencia con el SECAR/PP de la fila NO es consistente ni
 * siquiera dentro de una sola hoja (QA §2.10, 57%/43% de split contra ambas
 * proyecciones) -- se preserva como `tipo: 'fecha_heredada'` con un issue,
 * nunca se usa aquí para invalidar o confirmar el ciclo reproductivo vigente.
 */
export function parseEstado(raw: unknown): ResultadoEstado {
  const crudo = convertirRawATexto(raw);
  if (crudo === '') return { crudo, tipo: 'vacio', incierto: false, issues: [] };

  const incierto = crudo.includes('?');
  const sinIncertidumbre = incierto ? crudo.replace(/\?/g, '').trim() : crudo;

  const fechaHeredada = intentarExtraerFechaHeredada(sinIncertidumbre);
  if (fechaHeredada) {
    return {
      crudo,
      tipo: 'fecha_heredada',
      fecha: fechaHeredada,
      incierto,
      issues: [
        {
          crudo,
          motivo:
            'ESTADO/OBS trae una fecha en vez de un código -- residuo de la columna SEC REAL/parto real de Gen 1; documenta un ciclo reproductivo ANTERIOR, no se usa para validar el ciclo actual, revisar',
        },
      ],
    };
  }

  const key = sinIncertidumbre.replace(/\s+/g, '').toLowerCase();

  // 'rech' se revisa ANTES que 'ok': 'ok rech' combina ambas señales -- la
  // más cautelosa prevalece.
  if (/rech|^rec$|^r$/.test(key)) {
    return { crudo, tipo: 'vacia_problema', incierto, issues: [] };
  }
  if (key === 'ok' || key === '0k') {
    return { crudo, tipo: 'vacia_apta', incierto, issues: [] };
  }

  return {
    crudo,
    tipo: 'desconocido',
    incierto,
    issues: [
      { crudo, motivo: `código de ESTADO/OBS no reconocido: '${crudo}' -- no se inventa semántica, queda para revisión` },
    ],
  };
}

// ============================================================================
// BLOQUE 2 — Motor de fechas (todo parametrizado desde HatoConfig)
// ============================================================================

/** PP = fecha de servicio + meses de gestación (B2, plan §7.1). Verificado
 * contra 1.124 filas reales con `F Servicio` y `PP` ambos presentes: exacto
 * en 1.123/1.124 (99,9%). */
export function calcularPartoProbable(fechaServicio: string, config: HatoConfig): string {
  return sumarMeses(fechaServicio, config.meses_gestacion_default);
}

/** SECAR = fecha de servicio + (meses de gestación − meses de secado según
 * raza), en UN SOLO PASO desde `fechaServicio` -- NUNCA encadenando
 * `calcularFechaSecar(calcularPartoProbable(...))`. Un segundo barrido
 * cuantitativo sobre 1.156 filas reales (QA, corrige el análisis inicial de
 * S2) confirmó que la fuente deriva `SECAR` de forma INDEPENDIENTE de `PP`:
 * `F Servicio + 7 meses` acierta 1.149/1.156 (99,4%) contra 1.094/1.156
 * (94,6%) de encadenar "PP − 2 meses". Ambas fórmulas son algebraicamente
 * iguales ((Serv+9)−2 = Serv+7) SALVO cuando `F Servicio` cae en día 29-31:
 * `PP` (que sí es +9 meses) clampa al último día de su mes destino, y restar
 * 2 meses desde ese `PP` ya clampado pierde 1-6 días frente a derivar
 * directo (evidencia real: CAPELA, `F Servicio=2020-05-30` -> `SECAR` real
 * en la planilla es `2020-12-30`; encadenar vía `PP=2021-02-28` daría
 * `2020-12-28`, dos días antes). Usa `_default` cuando la raza es
 * desconocida o no está en `meses_secado_por_raza` (Jersey/Holstein=2,
 * Normanda=3 confirmado contra el histórico real). */
export function calcularFechaSecar(
  fechaServicio: string,
  raza: string | null | undefined,
  config: HatoConfig,
): string {
  const clave = raza?.trim().toLowerCase();
  const mesesSecado =
    clave && config.meses_secado_por_raza[clave] !== undefined
      ? config.meses_secado_por_raza[clave]
      : config.meses_secado_por_raza._default;
  return sumarMeses(fechaServicio, config.meses_gestacion_default - mesesSecado);
}

/** Meses de preñez transcurridos entre el servicio y una fecha de
 * referencia (típicamente la del chequeo), calculados por calendario
 * (meses completos, no aproximación por días/30). DELIBERADAMENTE no lee la
 * columna `TP` de la planilla, NI SIQUIERA COMO VALIDACIÓN CRUZADA: un
 * segundo barrido sobre las 45 hojas reconstruyendo
 * `F_Servicio + TP×30.44 días` mostró que TP converge, en 40+ de las 45
 * hojas (incluidas las de 2019), a la ventana 2026-06-17..2026-07-18 --
 * exactamente la fecha del último guardado del archivo (mtime). No es un
 * problema de unidad (meses vs. semanas, como sugería un análisis inicial
 * de S2): TP es una fórmula `TODAY()` de Excel congelada en el guardado más
 * reciente, sin relación con la fila ni con el chequeo que describe. */
export function calcularMesesPrenez(fechaServicio: string, fechaReferencia: string): number {
  const s = parsearIso(fechaServicio);
  const r = parsearIso(fechaReferencia);
  let meses = (r.anio - s.anio) * 12 + (r.mes - s.mes);
  if (r.dia < s.dia) meses -= 1;
  return Math.max(0, meses);
}

// ============================================================================
// BLOQUE 3 — Descomposición SX -> eventos (hato_eventos), plan §7.1
// ============================================================================

export type TipoEventoHato =
  | 'servicio'
  | 'celo'
  | 'confirmacion_prenez'
  | 'parto'
  | 'aborto'
  | 'secado_real'
  | 'venta'
  | 'muerte'
  | 'compra'
  | 'cambio_etapa'
  | 'rechequeo';

export type CriaDestino = 'retenida' | 'macho_vendido' | 'hembra_vendida' | 'muerta' | 'aborto';

/** Forma insertable en `hato_eventos` (sin `id`/`animal_id`/`created_at`,
 * que agrega el caller con acceso a la base). `toro_nombre` es texto libre:
 * resolverlo a `hato_toros.id` es responsabilidad del caller, este motor no
 * tiene acceso a la base para hacer ese lookup. `procedencia` documenta de
 * qué campo crudo salió el evento, para trazabilidad en el diff de revisión
 * (B0/V10). */
export interface EventoDerivado {
  tipo: TipoEventoHato;
  fecha: string;
  fecha_confianza: 'exacta' | 'aproximada' | 'desconocida';
  tipo_servicio?: 'monta' | 'inseminacion';
  toro_nombre?: string;
  cria_destino?: CriaDestino;
  datos?: Record<string, unknown>;
  sx_raw?: string;
  procedencia: string;
}

export interface InputDescomposicionSX {
  /** Fecha del chequeo -- ancla temporal para eventos SX sin fecha propia
   * (parto/aborto reportado en este chequeo, sin fecha exacta conocida). */
  chequeoFecha: string;
  /** Resultado de `parseSX` sobre la celda cruda de esta vaca en este chequeo. */
  sx: ResultadoSX;
  /** Fechas de servicio ya parseadas (`parseFechasServicio(...).fechas`), en
   * orden cronológico. Puede venir vacío. Soporta V7: cuando trae más de
   * una fecha, cada una se emite como su propio evento `servicio` en orden
   * -- es la representación real de "servicio que no cuajó -> re-servicio".
   * No se inventa un evento `celo` intermedio con una fecha que no viene en
   * la planilla; la cadena de servicios ya deja visible el patrón en la
   * timeline (A3). */
  fechasServicio: string[];
  /** Fecha de parto real, si la planilla la trae explícita (columna `F
   * parto`/`SEC REAL` de Gen 1 -- Gen 2/3 no siempre la tienen, ver doc S2 §2). */
  fechaPartoReal?: string;
  toroNombre?: string;
  tipoServicio?: 'monta' | 'inseminacion';
  /**
   * Desambigua `o_mas` (plan §7.1: "O+ sin parto -> aborto"). El código SX
   * por sí solo no permite distinguir "parió y la cría murió" de "abortó
   * sin parto real" -- ambos se escriben igual en la planilla. Si el caller
   * no lo sabe (`undefined`), se asume parto (lectura mayoritaria de la
   * tabla del plan) pero SIEMPRE se deja un issue para revisión humana --
   * la ambigüedad nunca se resuelve en silencio.
   */
  huboPartoConfirmado?: boolean;
}

export interface ResultadoDescomposicionSX {
  eventos: EventoDerivado[];
  issues: ParseIssue[];
}

/**
 * Descompone el resultado de `parseSX` + las fechas de servicio de una
 * vaca en un chequeo dado en la lista de `hato_eventos` que corresponde
 * insertar, según la tabla de descomposición del plan §7.1. Devuelve los
 * eventos ordenados cronológicamente, cada uno con su `procedencia`.
 */
export function descomponerSX(input: InputDescomposicionSX): ResultadoDescomposicionSX {
  const eventos: EventoDerivado[] = [];
  const issues: ParseIssue[] = [...input.sx.issues];

  input.fechasServicio.forEach((fecha, i) => {
    eventos.push({
      tipo: 'servicio',
      fecha,
      fecha_confianza: 'exacta',
      tipo_servicio: input.tipoServicio,
      toro_nombre: input.toroNombre,
      sx_raw: input.sx.crudo,
      procedencia: `fecha_servicio_raw[${i}]`,
    });
  });

  const fechaEvento = input.fechaPartoReal ?? input.chequeoFecha;
  const confianzaEvento: 'exacta' | 'aproximada' = input.fechaPartoReal ? 'exacta' : 'aproximada';

  switch (input.sx.tipo) {
    case 'ov':
      eventos.push({
        tipo: 'parto',
        fecha: fechaEvento,
        fecha_confianza: confianzaEvento,
        cria_destino: 'macho_vendido',
        sx_raw: input.sx.crudo,
        procedencia: 'sx_raw',
      });
      break;
    case 'av':
      eventos.push({
        tipo: 'parto',
        fecha: fechaEvento,
        fecha_confianza: confianzaEvento,
        cria_destino: 'hembra_vendida',
        sx_raw: input.sx.crudo,
        procedencia: 'sx_raw',
      });
      break;
    case 'a_n':
      if (input.sx.numeroCria === undefined) {
        issues.push({
          crudo: input.sx.crudo,
          motivo: "código 'A' (retenida) sin número de cría -- no se puede dar de alta/emparejar el animal, revisar",
        });
      }
      eventos.push({
        tipo: 'parto',
        fecha: fechaEvento,
        fecha_confianza: confianzaEvento,
        cria_destino: 'retenida',
        datos: input.sx.numeroCria !== undefined ? { numero_cria: input.sx.numeroCria } : undefined,
        sx_raw: input.sx.crudo,
        procedencia: 'sx_raw',
      });
      break;
    case 'a_mas':
      eventos.push({
        tipo: 'parto',
        fecha: fechaEvento,
        fecha_confianza: confianzaEvento,
        cria_destino: 'muerta',
        sx_raw: input.sx.crudo,
        procedencia: 'sx_raw',
      });
      break;
    case 'o_mas':
      if (input.huboPartoConfirmado === false) {
        eventos.push({
          tipo: 'aborto',
          fecha: fechaEvento,
          fecha_confianza: confianzaEvento,
          sx_raw: input.sx.crudo,
          procedencia: 'sx_raw',
        });
      } else {
        if (input.huboPartoConfirmado === undefined) {
          issues.push({
            crudo: input.sx.crudo,
            motivo:
              "'O+'/'A+' es ambiguo entre parto con cría muerta y aborto sin parto (plan §7.1) -- se asumió parto por ser la lectura mayoritaria; confirmar con Martha si corresponde registrar aborto en su lugar",
          });
        }
        eventos.push({
          tipo: 'parto',
          fecha: fechaEvento,
          fecha_confianza: confianzaEvento,
          cria_destino: 'muerta',
          sx_raw: input.sx.crudo,
          procedencia: 'sx_raw',
        });
      }
      break;
    case 'aborto':
      eventos.push({
        tipo: 'aborto',
        fecha: fechaEvento,
        fecha_confianza: confianzaEvento,
        sx_raw: input.sx.crudo,
        procedencia: 'sx_raw',
      });
      break;
    case 'vendida':
      issues.push({
        crudo: input.sx.crudo,
        motivo: "SX indica 'vendida' -- no se genera evento aquí (la venta se registra por el flujo de TransaccionGanadoForm/migración 059); confirmar que exista",
      });
      break;
    case 'gemelar':
      // Parto gemelar (decisión del dueño, 2026-07-22). Se emite UN evento de
      // parto con la marca `gemelar` en `datos`. El destino de las crías no
      // está registrado en la planilla (TERNERAS solo registra hembras, y no
      // hay filas para este parto) -- se documenta como issue en vez de
      // inventar `cria_destino`.
      eventos.push({
        tipo: 'parto',
        fecha: fechaEvento,
        fecha_confianza: confianzaEvento,
        datos: { gemelar: true },
        sx_raw: input.sx.crudo,
        procedencia: 'sx_raw',
      });
      issues.push({
        crudo: input.sx.crudo,
        motivo:
          'parto GEMELAR (gem+, confirmado por el dueño 2026-07-22) -- el destino de las crías no quedó registrado en la planilla, no se asume',
      });
      break;
    case 'vacia':
    case 'cero':
    case 'mv':
    case 'desconocido':
    case 'vacio':
      // Estado, no evento (plan §7.1) -- o SX vacío/no reconocido/marca
      // personal ('Mv', sin significado para el sistema): no se inventa un
      // evento reproductivo sin evidencia real.
      break;
    default: {
      const _exhaustivo: never = input.sx.tipo;
      void _exhaustivo;
    }
  }

  eventos.sort((a, b) => a.fecha.localeCompare(b.fecha));

  return { eventos, issues };
}

// ============================================================================
// BLOQUE 4 — Derivación de estado reproductivo (v_hato_estado_actual + config)
// ============================================================================

/** Subconjunto de columnas de `v_hato_estado_actual` (migración 056) que
 * este motor consume. La vista expone solo hechos -- todo el cálculo de
 * fechas/umbrales vive aquí, nunca en la vista (plan §7.1, brief S1 Decisión 3). */
export interface EstadoActualHatoRow {
  etapa: 'ternera' | 'novilla' | 'vaca' | 'toro';
  raza: string | null;
  estado: 'activa' | 'vendida' | 'muerta' | 'descartada';
  num_partos: number;
  ultimo_chequeo_fecha: string | null;
  ultimo_servicio_fecha: string | null;
  ultimo_parto_fecha: string | null;
  ultimo_secado_real_fecha: string | null;
  ultima_confirmacion_prenez_fecha: string | null;
  /** MAX(fecha) sobre TODO `hato_eventos` para este animal, cualquier tipo
   * (columna de la vista). Se usa solo como salvaguarda: si hay un evento
   * más reciente que los 4 que este motor sabe clasificar por separado
   * (servicio/confirmación/secado_real/parto), típicamente un aborto, venta
   * o muerte, no se proyecta un ciclo de preñez activo con datos que ese
   * evento puede haber invalidado -- ver `derivarEstadoReproductivo`. */
  ultimo_evento_fecha: string | null;
  /** `tipo` de `parseEstado` sobre el `ESTADO`/`OBS` del último chequeo
   * cerrado (`'vacia_apta' | 'vacia_problema' | 'fecha_heredada' |
   * 'desconocido' | 'vacio'`), o `null` si no hay ninguna señal disponible
   * -- hoy `hato_chequeo_vacas` no tiene una columna normalizada para esto
   * (ver nota en `derivarEstadoReproductivo`), así que en la práctica este
   * campo llega `null` hasta que exista esa columna. Requerido (no
   * opcional) para que cada caller decida explícitamente "no tengo esta
   * señal" en vez de omitirlo por accidente. */
  ultimo_estado_chequeo: TipoEstado | null;
}

export type EstadoReproductivo =
  | 'cria'
  | 'novilla'
  | 'servida'
  | 'preñada'
  | 'proxima_a_secar'
  | 'seca'
  | 'parida_reciente'
  | 'vacia_por_servir'
  /** Hay un evento posterior al último que este motor sabe clasificar
   * (servicio/confirmación/secado_real/parto) -- probablemente aborto, venta
   * o muerte, pero `v_hato_estado_actual` no lo tipifica en una columna
   * propia. No se proyecta preñez con datos que ese evento pudo invalidar. */
  | 'indeterminado'
  | 'vendida'
  | 'muerta'
  | 'descartada';

export interface AlertasReproductivas {
  secado_due: boolean;
  rechequeo_due: boolean;
  servicio_sin_confirmacion: boolean;
  parto_proximo: boolean;
}

export interface EstadoReproductivoDerivado {
  estado: EstadoReproductivo;
  fecha_secar: string | null;
  fecha_probable_parto: string | null;
  dias_abiertos: number | null;
  proxima_a_reemplazo: boolean;
  /**
   * Discriminador "¿esta vaca vacía es normal o es un problema?" (V14,
   * confirmado por el dueño). Solo tiene sentido para los estados
   * efectivamente "vacía" (`vacia_por_servir`, `parida_reciente`) -- en
   * cualquier otro estado (preñez activa, cría, terminal, indeterminado)
   * es `null` porque la pregunta no aplica. Dentro de esos dos estados:
   * `true`/`false` cuando hay señal (`ultimo_estado_chequeo`, o el tiempo
   * transcurrido sin nuevo servicio supera `dias_servicio_sin_confirmacion`
   * como proxy -- ver comentario en el cuerpo de la función); `null` cuando
   * no hay ninguna señal disponible -- nunca se adivina.
   */
  vacia_es_problema: boolean | null;
  alertas: AlertasReproductivas;
}

const SIN_ALERTAS: AlertasReproductivas = {
  secado_due: false,
  rechequeo_due: false,
  servicio_sin_confirmacion: false,
  parto_proximo: false,
};

function calcularRechequeoDue(fila: EstadoActualHatoRow, config: HatoConfig, fechaReferencia: string): boolean {
  if (!fila.ultimo_chequeo_fecha) return false;
  return diferenciaDias(fila.ultimo_chequeo_fecha, fechaReferencia) >= config.dias_rechequeo_due;
}

/** Discrimina "vacía normal" (apta, esperando celo) de "vacía problema"
 * (V14, confirmado por el dueño): primero por la señal explícita de
 * `ultimo_estado_chequeo` (`vacia_apta` -> normal, `vacia_problema` ->
 * problema); si no hay señal, cae a `dias_espera_voluntaria_post_parto`
 * sobre `diasSinProgreso` (días desde el último parto sin un nuevo
 * servicio): dentro del período de espera voluntario una vaca vacía es
 * NORMAL, pasado ese punto es un problema.
 *
 * Ese umbral tiene clave propia en `hato_config` desde la migración 062. La
 * primera versión de este motor reutilizaba `dias_servicio_sin_confirmacion`
 * como proxy, lo cual acoplaba dos conceptos distintos: cambiar el umbral de
 * "servicio sin confirmar" movía en silencio la clasificación de vacías.
 * Separarlos es justamente el punto de la clave nueva.
 *
 * Sin `ultimo_estado_chequeo` NI `diasSinProgreso` (nunca hubo parto que
 * ancle la cuenta), devuelve `null` -- nunca se adivina sin ninguna señal. */
function clasificarVaciaProblema(
  ultimoEstadoChequeo: TipoEstado | null,
  diasSinProgreso: number | null,
  config: HatoConfig,
): boolean | null {
  if (ultimoEstadoChequeo === 'vacia_problema') return true;
  if (ultimoEstadoChequeo === 'vacia_apta') return false;
  if (diasSinProgreso !== null) {
    return diasSinProgreso >= config.dias_espera_voluntaria_post_parto;
  }
  return null;
}

/**
 * Deriva el estado reproductivo actual de un animal y las 4 alertas de
 * §7.3 (secado_due, rechequeo_due, servicio_sin_confirmacion, parto_proximo)
 * a partir de los hechos de `v_hato_estado_actual` + `HatoConfig`. Todos los
 * umbrales (ventanas, días, partos de reemplazo) salen de `config` -- ninguno
 * vive hardcodeado aquí.
 *
 * `vacia_es_problema` (V14, confirmado por el dueño): las vacías se
 * distinguen entre normales (aptas, esperando celo) y problema (necesitan
 * rechequeo) sin multiplicar los valores de `estado` -- ver el campo en
 * `EstadoReproductivoDerivado`.
 *
 * Nota de brecha real encontrada: la regla de `rechequeo_due` del plan §7.3
 * es "`rechq` en el último chequeo, O >60 días desde el último chequeo" --
 * pero `v_hato_estado_actual` (migración 056) no expone ninguna columna que
 * indique si el último chequeo pidió rechequeo explícito; solo trae
 * `ultimo_chequeo_fecha`. Esta función solo puede evaluar la segunda mitad
 * de la regla (días desde el último chequeo); la primera mitad ("rechq" en
 * el chequeo) requiere un campo normalizado que hoy no existe en la vista
 * (el mismo campo que necesitaría `ultimo_estado_chequeo` para dejar de
 * llegar `null` siempre, ver su comentario en `EstadoActualHatoRow`).
 */
export function derivarEstadoReproductivo(
  fila: EstadoActualHatoRow,
  config: HatoConfig,
  fechaReferencia: string,
): EstadoReproductivoDerivado {
  const proximaAReemplazo = fila.estado === 'activa' && fila.num_partos >= config.umbral_partos_reemplazo;

  if (fila.estado !== 'activa') {
    return {
      estado: fila.estado,
      fecha_secar: null,
      fecha_probable_parto: null,
      dias_abiertos: null,
      proxima_a_reemplazo: false,
      vacia_es_problema: null,
      alertas: SIN_ALERTAS,
    };
  }

  const rechequeoDue = calcularRechequeoDue(fila, config, fechaReferencia);

  if (fila.etapa === 'ternera') {
    return {
      estado: 'cria',
      fecha_secar: null,
      fecha_probable_parto: null,
      dias_abiertos: null,
      proxima_a_reemplazo: proximaAReemplazo,
      vacia_es_problema: null,
      alertas: { ...SIN_ALERTAS, rechequeo_due: rechequeoDue },
    };
  }

  // Se construyen los candidatos de "evento más reciente del ciclo" ANTES de
  // decidir si hay o no un servicio activo -- una vaca puede haber parido sin
  // que este motor conozca un servicio previo (importación incompleta, o
  // simplemente el primer parto de su vida productiva) y sigue siendo
  // "parida_reciente", no "vacía por servir" genérico, solo porque le falta
  // el dato de servicio. Antes esta función bifurcaba primero por
  // `!ultimo_servicio_fecha` y perdía ese caso -- corregido.
  type EventoCiclo = 'servicio' | 'confirmacion' | 'secado_real' | 'parto';
  const candidatos: Array<{ tipo: EventoCiclo; fecha: string }> = [];
  if (fila.ultimo_servicio_fecha) {
    candidatos.push({ tipo: 'servicio', fecha: fila.ultimo_servicio_fecha });
  }
  if (fila.ultima_confirmacion_prenez_fecha) {
    candidatos.push({ tipo: 'confirmacion', fecha: fila.ultima_confirmacion_prenez_fecha });
  }
  if (fila.ultimo_secado_real_fecha) {
    candidatos.push({ tipo: 'secado_real', fecha: fila.ultimo_secado_real_fecha });
  }
  if (fila.ultimo_parto_fecha) {
    candidatos.push({ tipo: 'parto', fecha: fila.ultimo_parto_fecha });
  }

  if (candidatos.length === 0) {
    // Nunca tuvo servicio, parto, secado real ni confirmación registrados.
    const esNovilla = fila.etapa === 'novilla';
    const estado: EstadoReproductivo = esNovilla ? 'novilla' : 'vacia_por_servir';
    return {
      estado,
      fecha_secar: null,
      fecha_probable_parto: null,
      dias_abiertos: null,
      proxima_a_reemplazo: proximaAReemplazo,
      // Sin parto conocido no hay ancla de tiempo (`diasSinProgreso`) --
      // solo la señal explícita de `ultimo_estado_chequeo` puede decidir.
      // Una novilla nunca ha entrado al ciclo reproductivo: la pregunta
      // "¿normal o problema?" no aplica todavía.
      vacia_es_problema: esNovilla ? null : clasificarVaciaProblema(fila.ultimo_estado_chequeo, null, config),
      alertas: { ...SIN_ALERTAS, rechequeo_due: rechequeoDue },
    };
  }

  candidatos.sort((a, b) => (a.fecha === b.fecha ? 0 : a.fecha < b.fecha ? 1 : -1));
  const masReciente = candidatos[0].tipo;

  // Salvaguarda: `v_hato_estado_actual` no expone una columna dedicada de
  // "último aborto" (a diferencia de parto/secado_real/confirmación), pero sí
  // `ultimo_evento_fecha` (MAX sobre TODO `hato_eventos`, cualquier tipo). Si
  // hay un evento más reciente que el más nuevo de los 4 que sí sabemos
  // clasificar, algo pasó que este motor no puede tipificar aquí -- casi
  // siempre un aborto, venta o muerte -- y proyectar SECAR/PP desde el
  // servicio viejo sería exactamente el error real encontrado (QA, MONA:
  // SX='aborto' con SECAR/PP de la fila cruda todavía "vigentes" en la
  // planilla). Nunca se asume que el ciclo sigue activo cuando hay una señal
  // de que no es así, aunque no se sepa de qué tipo es.
  if (fila.ultimo_evento_fecha && fila.ultimo_evento_fecha > candidatos[0].fecha) {
    return {
      estado: 'indeterminado',
      fecha_secar: null,
      fecha_probable_parto: null,
      dias_abiertos: null,
      proxima_a_reemplazo: proximaAReemplazo,
      vacia_es_problema: null,
      alertas: { ...SIN_ALERTAS, rechequeo_due: rechequeoDue },
    };
  }

  if (masReciente === 'parto') {
    // V14: "días abiertos" desde el último parto hasta hoy (sigue vacía) --
    // el mismo valor sirve de ancla temporal para `vacia_es_problema` cuando
    // no hay señal de `ultimo_estado_chequeo` (proxy: demasiado tiempo vacía
    // sin nuevo servicio).
    const diasAbiertos = diferenciaDias(fila.ultimo_parto_fecha as string, fechaReferencia);
    return {
      estado: 'parida_reciente',
      fecha_secar: null,
      fecha_probable_parto: null,
      dias_abiertos: diasAbiertos,
      proxima_a_reemplazo: proximaAReemplazo,
      vacia_es_problema: clasificarVaciaProblema(fila.ultimo_estado_chequeo, diasAbiertos, config),
      alertas: { ...SIN_ALERTAS, rechequeo_due: rechequeoDue },
    };
  }

  if (!fila.ultimo_servicio_fecha) {
    // `masReciente` es 'confirmacion' o 'secado_real' sin ningún
    // `ultimo_servicio_fecha` que los ancle -- dato incompleto (no debería
    // ocurrir en la práctica: confirmación/secado real siempre derivan de un
    // servicio), pero no hay desde dónde proyectar PP/Secar sin inventar una
    // fecha ancla. Se marca indeterminado en vez de asumir.
    return {
      estado: 'indeterminado',
      fecha_secar: null,
      fecha_probable_parto: null,
      dias_abiertos: null,
      proxima_a_reemplazo: proximaAReemplazo,
      vacia_es_problema: null,
      alertas: { ...SIN_ALERTAS, rechequeo_due: rechequeoDue },
    };
  }

  // 'servicio', 'confirmacion' o 'secado_real': ciclo de preñez activo,
  // proyectado siempre desde el ÚLTIMO servicio (el cálculo de PP/Secar
  // depende de raza+config, nunca se lee de la vista -- plan §7.1). SECAR se
  // deriva directo de `ultimo_servicio_fecha`, NUNCA encadenando sobre
  // `fechaProbableParto` -- ver el comentario de `calcularFechaSecar`.
  const fechaProbableParto = calcularPartoProbable(fila.ultimo_servicio_fecha, config);
  const fechaSecar = calcularFechaSecar(fila.ultimo_servicio_fecha, fila.raza, config);

  const diasHastaSecar = diferenciaDias(fechaReferencia, fechaSecar);
  const dentroVentanaSecar = diasHastaSecar <= config.ventana_proxima_secar_dias;
  const secadoDue = masReciente !== 'secado_real' && fechaReferencia >= fechaSecar;

  const diasHastaParto = diferenciaDias(fechaReferencia, fechaProbableParto);
  const partoProximo = diasHastaParto <= config.dias_parto_proximo_alerta;

  const diasDesdeServicio = diferenciaDias(fila.ultimo_servicio_fecha, fechaReferencia);
  const servicioSinConfirmacion =
    masReciente === 'servicio' && diasDesdeServicio >= config.dias_servicio_sin_confirmacion;

  let estado: EstadoReproductivo;
  if (masReciente === 'secado_real') {
    estado = 'seca';
  } else if (dentroVentanaSecar || secadoDue) {
    estado = 'proxima_a_secar';
  } else if (masReciente === 'confirmacion') {
    estado = 'preñada';
  } else {
    estado = 'servida';
  }

  // V14 (confirmado por el dueño): días abiertos = días desde el último
  // parto hasta LA CONCEPCIÓN (el servicio que resultó en preñez), nunca
  // `null` solo porque hay una preñez activa -- antes esta rama devolvía
  // `null` incondicionalmente, lo cual perdía el dato justo en el caso en
  // que ya se conoce (servicio posterior al parto registrado). Solo se
  // ancla al `ultimo_servicio_fecha` cuando este es efectivamente POSTERIOR
  // al último parto conocido -- si el único servicio que la vista reporta
  // es anterior a ese parto (o no hay parto), no hay con qué anclar el
  // cierre del período abierto con los datos de esta fila (queda `null`,
  // nunca `0`).
  const diasAbiertos =
    fila.ultimo_parto_fecha && fila.ultimo_parto_fecha < fila.ultimo_servicio_fecha
      ? diferenciaDias(fila.ultimo_parto_fecha, fila.ultimo_servicio_fecha)
      : null;

  return {
    estado,
    fecha_secar: fechaSecar,
    fecha_probable_parto: fechaProbableParto,
    dias_abiertos: diasAbiertos,
    proxima_a_reemplazo: proximaAReemplazo,
    // Preñez activa (confirmada o no) no es un estado "vacía" -- la
    // pregunta "¿normal o problema?" de V14 no aplica aquí; el riesgo de
    // "servicios repetidos sin concepción" ya lo cubre la alerta
    // `servicio_sin_confirmacion` de arriba, sin necesidad de duplicarlo.
    vacia_es_problema: null,
    alertas: {
      secado_due: secadoDue,
      rechequeo_due: rechequeoDue,
      servicio_sin_confirmacion: servicioSinConfirmacion,
      parto_proximo: partoProximo,
    },
  };
}

// ============================================================================
// BLOQUE 5 — PL / productividad
// ============================================================================

/** Productividad del hato = litros totales de la quincena / vacas en
 * ordeño (D4/V4). Nunca `0` ni `NaN` cuando falta un dato -- `null` explícito
 * (mismo contrato de "ausencia de dato" que rige todo el módulo). */
export function calcularProductividad(
  litrosTotal: number | null | undefined,
  numVacasOrdeno: number | null | undefined,
): number | null {
  if (litrosTotal == null || numVacasOrdeno == null || numVacasOrdeno <= 0) return null;
  return litrosTotal / numVacasOrdeno;
}

// ============================================================================
// BLOQUE 6 — Detección de colisión de chapeta (soporte a S3 "Resolve")
// ============================================================================

export interface AnimalEnChequeo {
  numero: number;
  nombre: string;
}

export interface ColisionChapeta {
  numero: number;
  /** Nombres distintos vistos para este `numero`, ordenados alfabéticamente. */
  nombres: string[];
}

/**
 * Detecta números de chapeta (`numero`) que aparecen más de una vez con
 * NOMBRES DISTINTOS dentro del mismo chequeo -- NUNCA decide cuál de los dos
 * animales conserva el número: esa es una decisión de Martha (plan §7.4,
 * S3 "Resolve"), este motor solo detecta y reporta.
 *
 * Evidencia real (QA, segundo barrido sobre las 45 hojas completas): al
 * menos 9 números de chapeta están duplicados de forma CONCURRENTE entre dos
 * vacas activas en el mismo chequeo, y esto no es solo histórico -- `#162`
 * (ESMERALDA/VITROLA) y `#175` (MONA/MARGARITA) siguen duplicados en el
 * chequeo más reciente del hato (`CHEQUEO JULIO 2026`), el que la Épica F1
 * usará como "hato actual". El `UNIQUE(numero)` de `hato_animales` rechazará
 * la segunda fila de cada par si no se resuelve antes de cargar -- por eso
 * S3 necesita esta detección ANTES de poder ejecutar F1, no como un chequeo
 * posterior a un `INSERT` que ya falló.
 */
export function detectarColisionesChapeta(animales: AnimalEnChequeo[]): ColisionChapeta[] {
  const porNumero = new Map<number, Set<string>>();
  for (const a of animales) {
    const nombreNormalizado = a.nombre.trim();
    if (nombreNormalizado === '') continue;
    if (!porNumero.has(a.numero)) porNumero.set(a.numero, new Set());
    porNumero.get(a.numero)!.add(nombreNormalizado);
  }
  const colisiones: ColisionChapeta[] = [];
  for (const [numero, nombres] of porNumero) {
    if (nombres.size > 1) {
      colisiones.push({ numero, nombres: [...nombres].sort() });
    }
  }
  return colisiones.sort((a, b) => a.numero - b.numero);
}
