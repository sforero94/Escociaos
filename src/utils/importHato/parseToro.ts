// ARCHIVO: utils/importHato/parseToro.ts
// DESCRIPCIÓN: Parser de la celda `Toro` de las hojas de chequeo.
//
// Por qué vive aquí y no en `calculosHato.ts`: la columna `Toro` no está
// entre los parsers de celda que S2 dejó listos (`parseFechasServicio`,
// `parseSX`, `parseFechaChequeo`, `parseValorNumerico`, `parseEstado`) --
// `descomponerSX` en `calculosHato.ts` recibe `toroNombre`/`tipoServicio`
// como INPUT ya resuelto por el llamador (`InputDescomposicionSX`), nunca
// los deriva de la celda cruda. Interpretar esa celda es trabajo nuevo, no
// una segunda implementación de algo que ya existe -- por eso no viola la
// regla "no escribas un segundo parser de celdas" del contrato S3. Se marca
// en el reporte de S3 como candidato a mudarse a `calculosHato.ts` cuando
// V10 (subir un chequeo nuevo desde la app) necesite la misma lógica.
//
// Evidencia (barrido independiente del coordinador sobre las 8 planillas
// reales + doc S2 §7 "Toro y ESTADO traen datos de otras columnas"): la
// celda `Toro` mezcla tres tipos de dato en una sola columna de texto libre:
//   1. RAZA (hol/hols/holst/jers/jer/jersey/norm/gir...), NUNCA un toro
//      -- **REVERTIDO por decisión del dueño, ver D6 más abajo**.
//   2. Nombre real de toro (inook->NO, ver D6; nitro, steem, FABA, TJ->NO,
//      ver D6; laredo, marquez).
//   3. Ni una cosa ni la otra: tipo de servicio filtrado a esta columna
//      ('ins'->inseminación, 'T'/'Toro'->monta) o un código de ESTADO
//      filtrado por error ('ok'/'rech'/'rec'), o una anotación de texto
//      libre completa ('6 mes', '7', 'recomendación, dar sal...').
//
// ============================================================================
// D6 -- homologación de la columna Toro (decisión del dueño, 2026-07-22,
// resolution-report.md §6). Dos reglas nuevas, AMBAS ya vigentes acá:
//
// 1. "Está bien dejar la raza del toro como nombre también, no todos los
//    toros tienen nombre." Esto REVIERTE la regla dura original de S3 ("una
//    raza JAMÁS aterriza en `toroNombre`") -- una celda que SOLO trae una
//    raza ahora SÍ resuelve `toroNombre` al nombre canónico de esa raza (un
//    toro llamado "Holstein", raza holstein). NO "arreglar" esto de vuelta:
//    es una decisión de negocio explícita, no un bug. `hato_toros.nombre` es
//    NOT NULL igual que antes, pero ahora la raza-como-nombre es un valor
//    válido para esa columna, sembrado a propósito.
// 2. `ok`/`0k`/`INOOK`/`inook` y `rech`/`rechq`/`rec`/`r` NUNCA son un toro
//    ni una raza, sin importar mayúsculas/minúsculas -- son códigos de
//    ESTADO (columna real: `estado`/`TipoEstado` de `calculosHato.ts`)
//    filtrados por error de columna. `INOOK` en particular NO es un nombre
//    de toro real (contradice la lectura original de S3, que lo trataba
//    como nombre real) -- significa "la vaca está ok". Se distinguen dos
//    marcadores (`estadoMarcador`) con el MISMO vocabulario que `TipoEstado`
//    para que se puedan cruzar sin reinventar semántica: `vacia_apta` (ok) /
//    `vacia_problema` (rechequeo).
//
// Regla dura que SÍ sigue vigente: una celda de Toro nunca inventa una
// separación que no puede sostener (doble señal, anotación libre) y siempre
// conserva `crudo` intacto.

import type { HatoConfig, ParseIssue } from '@/utils/calculosHato';
import { valorCeldaATexto } from './celdas';

export interface ResultadoToro {
  crudo: string;
  toroNombre: string | null;
  tipoServicio: 'monta' | 'inseminacion' | null;
  /** Cuando la celda Toro trae un código de ESTADO filtrado por error de
   * columna en vez de un nombre de toro -- mismo vocabulario que
   * `TipoEstado` de `calculosHato.ts` (D6, decisión del dueño 2026-07-22):
   * `vacia_apta` = "la vaca está ok" (ok/0k/INOOK), `vacia_problema` =
   * "necesita rechequeo" (rech/rechq/rec/r). `null` en cualquier otro caso.
   * NUNCA implica un toro ni una raza. */
  estadoMarcador: 'vacia_apta' | 'vacia_problema' | null;
  issues: ParseIssue[];
}

/** Patrones de raza reconocidos en la columna Toro (texto libre, sin acento,
 * mayús/minús mezcladas en los datos reales). Mismo estilo de reconocimiento
 * por patrón que ya usa `parseSX` en `calculosHato.ts` (`/gu?ir/i` -> 'gyr',
 * `/hlt|hol/i` -> 'holstein') -- no es una tabla de constantes de negocio
 * (no gobierna ningún umbral/cálculo), es reconocimiento de abreviaturas de
 * texto libre, igual que ese precedente.
 *
 * `canonico` es el valor que se compara contra `HatoConfig.razas` (058:
 * jersey/holstein/normanda, minúsculas); `nombreVisible` es el nombre
 * CANÓNICO del toro cuando D6 aplica la raza-como-nombre -- Título, y
 * deliberadamente distinto de `canonico` para 'normanda': "Normando" es la
 * forma masculina correcta cuando nombra un TORO (owner's canonical table,
 * D6), aunque la raza en `HatoConfig.razas`/la vaca sigan siendo
 * "normanda". `h t`/`hins` (Holstein) y `TJ` (Jersey) son alias adicionales
 * del owner's canonical table de D6 que la grafía fonética original no
 * cubría.
 */
const PATRONES_RAZA: ReadonlyArray<{ regex: RegExp; canonico: string; nombreVisible: string }> = [
  { regex: /^hols?t?(ein)?$/i, canonico: 'holstein', nombreVisible: 'Holstein' },
  { regex: /^h\s+t$/i, canonico: 'holstein', nombreVisible: 'Holstein' }, // 'h t' (D6)
  { regex: /^hins$/i, canonico: 'holstein', nombreVisible: 'Holstein' }, // 'hins' (D6)
  { regex: /^jers?e?y?$/i, canonico: 'jersey', nombreVisible: 'Jersey' },
  { regex: /^tj$/i, canonico: 'jersey', nombreVisible: 'Jersey' }, // 'TJ' (D6)
  { regex: /^nor(m(an)?(d[oa])?)?$/i, canonico: 'normanda', nombreVisible: 'Normando' },
  { regex: /^gu?ir$/i, canonico: 'gyr', nombreVisible: 'Gyr' },
];

/** Alias de identidad de un toro NOMBRADO (no una raza) -- D6, decisión del
 * dueño 2026-07-22: 'FABA' es abreviatura del mismo toro 'Fabace' que
 * también aparece completo en la columna PADRE de TERNERAS (D7,
 * `clasificarPadreTernera` en resolver.ts) -- se resuelve al mismo nombre
 * canónico para que `construirCatalogoToros` (resolver.ts) nunca lo cuente
 * como dos toros distintos. */
const ALIAS_TORO: Readonly<Record<string, string>> = {
  faba: 'Fabace',
};

/** 'ok'/'0k'/'INOOK'/'inook' -> "la vaca está ok" (D6). `INOOK` estaba antes
 * en la lista de "nombres reales de toro" de S3 -- corregido por decisión
 * explícita del dueño: NUNCA fue un toro. */
const CODIGOS_VACA_OK = new Set(['ok', '0k', 'inook']);
/** 'rech'/'rechq'/'rec'/'r' -> "necesita rechequeo" (D6). */
const CODIGOS_RECHEQUEO = new Set(['rech', 'rechq', 'rec', 'r']);

/** `true` si `crudo` (celda cruda, sin normalizar) es uno de los códigos de
 * ESTADO filtrados a la columna Toro por error de columna (D6) -- exportado
 * para que `construirCatalogoToros` (resolver.ts) excluya estos valores del
 * catálogo candidato de toros sin reimplementar la lista acá dos veces. */
export function esCodigoEstadoEnColumnaToro(crudo: string): boolean {
  const clave = crudo.trim().toLowerCase().replace(/\s+/g, '');
  return CODIGOS_VACA_OK.has(clave) || CODIGOS_RECHEQUEO.has(clave);
}

function detectarRaza(token: string, config: HatoConfig): { canonico: string; nombreVisible: string; enConfig: boolean } | null {
  const limpio = token.trim();
  if (limpio === '') return null;
  for (const p of PATRONES_RAZA) {
    if (p.regex.test(limpio)) return { canonico: p.canonico, nombreVisible: p.nombreVisible, enConfig: config.razas.includes(p.canonico) };
  }
  return null;
}

/** '6 mes', '2 mes', '7' -- duración/anotación filtrada a esta columna
 * (evidencia doc S2 §7: "también trae no-toros: ok, rech, 6 mes, 2 mes, 7"). */
function esNumeroOAnotacionDuracion(token: string): boolean {
  return /^\d+$/.test(token) || /^\d+\s*mes(es)?$/i.test(token);
}

/** Heurística de "esto es una anotación de texto libre, no un nombre de
 * toro": más de 3 palabras o más de 40 caracteres. Cubre tanto la oración
 * completa documentada ("recomendación, dar sal en comida para mejorar
 * ovarios", 6 apariciones) como los compuestos más garabateados observados
 * en el barrido del coordinador ('toro jer-insem corone/otra vez', 'ins
 * jers/ins j corone /Toro') -- demasiado ambiguos para descomponer con
 * certeza en tipo_servicio + nombre, mejor preservarlos íntegros con un
 * issue que adivinar una separación. */
function pareceAnotacionLibre(token: string): boolean {
  const palabras = token.trim().split(/\s+/).filter(Boolean);
  return palabras.length > 3 || token.length > 40;
}

function limpiarSeparadoresIniciales(s: string): string {
  return s.replace(/^[\s/\-.,]+/, '');
}

/**
 * Parser de la celda `Toro`. Nunca inventa: si no puede separar con
 * confianza tipo_servicio de nombre, o el resto no parece un nombre de toro
 * plausible, deja `toroNombre: null` con un issue -- pero SIEMPRE conserva
 * `crudo` intacto, y nunca deja que un código de ESTADO (D6) aterrice en
 * `toroNombre`. Una raza pura SÍ puede aterrizar en `toroNombre` desde D6
 * (ver cabecera del archivo) -- ya no es una regla dura, es el
 * comportamiento esperado.
 */
export function parseToro(raw: unknown, config: HatoConfig): ResultadoToro {
  const crudo = valorCeldaATexto(raw) ?? '';
  if (crudo === '') return { crudo, toroNombre: null, tipoServicio: null, estadoMarcador: null, issues: [] };

  const issues: ParseIssue[] = [];
  const lower = crudo.toLowerCase();
  const loweSinEspacios = lower.replace(/\s+/g, '');

  if (esNumeroOAnotacionDuracion(crudo)) {
    issues.push({
      crudo,
      motivo: 'columna Toro no es un nombre de toro -- parece una duración/observación filtrada a esta columna, revisar',
    });
    return { crudo, toroNombre: null, tipoServicio: null, estadoMarcador: null, issues };
  }

  if (pareceAnotacionLibre(crudo)) {
    issues.push({
      crudo,
      motivo: 'columna Toro trae una anotación de texto libre, no un nombre de toro -- no se intenta separar tipo de servicio/nombre con certeza, revisar',
    });
    return { crudo, toroNombre: null, tipoServicio: null, estadoMarcador: null, issues };
  }

  if (CODIGOS_VACA_OK.has(loweSinEspacios)) {
    issues.push({
      crudo,
      motivo: `columna Toro trae un código de ESTADO filtrado por error de columna ('${crudo}' -> "vaca ok") -- NUNCA un toro, revisar (decisión del dueño, 2026-07-22)`,
    });
    return { crudo, toroNombre: null, tipoServicio: null, estadoMarcador: 'vacia_apta', issues };
  }
  if (CODIGOS_RECHEQUEO.has(loweSinEspacios)) {
    issues.push({
      crudo,
      motivo: `columna Toro trae un código de ESTADO filtrado por error de columna ('${crudo}' -> "rechequeo") -- NUNCA un toro, revisar (decisión del dueño, 2026-07-22)`,
    });
    return { crudo, toroNombre: null, tipoServicio: null, estadoMarcador: 'vacia_problema', issues };
  }

  let tipoServicio: 'monta' | 'inseminacion' | null = null;
  let resto = crudo;

  if (lower.startsWith('ins')) {
    tipoServicio = 'inseminacion';
    resto = limpiarSeparadoresIniciales(crudo.slice(3));
  } else if (lower === 't' || lower.startsWith('toro')) {
    tipoServicio = 'monta';
    resto = lower === 't' ? '' : limpiarSeparadoresIniciales(crudo.slice(4));
  }

  // Señal doble: tras quitar un prefijo, lo que queda empieza con el OTRO
  // marcador (evidencia real: 'ins /toro hol'). No se adivina cuál prevalece.
  let dobleSenial = false;
  if (tipoServicio === 'inseminacion' && /^toro\b/i.test(resto)) {
    dobleSenial = true;
    resto = limpiarSeparadoresIniciales(resto.slice(4));
  } else if (tipoServicio === 'monta' && /^ins/i.test(resto)) {
    dobleSenial = true;
    resto = limpiarSeparadoresIniciales(resto.slice(3));
  }
  if (dobleSenial) {
    issues.push({
      crudo,
      motivo: 'columna Toro trae señales de inseminación Y monta a la vez -- no se puede determinar tipo_servicio con certeza, revisar',
    });
    tipoServicio = null;
  }

  if (resto === '') {
    return { crudo, toroNombre: null, tipoServicio, estadoMarcador: null, issues };
  }

  const alias = ALIAS_TORO[resto.trim().toLowerCase()];
  if (alias) {
    return { crudo, toroNombre: alias, tipoServicio, estadoMarcador: null, issues };
  }

  const raza = detectarRaza(resto, config);
  if (raza) {
    // D6: la raza-como-nombre es válida. Si esa raza todavía no está
    // sembrada en `HatoConfig.razas` (058: jersey/holstein/normanda -- gyr
    // no), se deja constancia igual (el dueño ya decidió agregarla, pero la
    // migración es responsabilidad de otra sesión) sin bloquear `toroNombre`.
    if (!raza.enConfig) {
      issues.push({
        crudo,
        motivo: `columna Toro nombra un toro de raza '${raza.canonico}' (${raza.nombreVisible}) -- raza fuera del catálogo configurado en HatoConfig.razas (migración 058: ${config.razas.join('/')}); el dueño ya decidió agregarla (revisión 2026-07-22), pendiente de que la migración correspondiente se aplique.`,
      });
    }
    return { crudo, toroNombre: raza.nombreVisible, tipoServicio, estadoMarcador: null, issues };
  }

  if (resto.length <= 1) {
    issues.push({
      crudo,
      motivo: `resto '${resto}' tras separar tipo de servicio es demasiado corto/ambiguo para confiar como nombre de toro, revisar`,
    });
  }

  return { crudo, toroNombre: resto, tipoServicio, estadoMarcador: null, issues };
}
