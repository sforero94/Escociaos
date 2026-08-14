// ARCHIVO: supabase/functions/make-server-1ccce916/importHato/ocrPesajeCorreccion.ts
// GENERADO por docs/hato/regenerar-copias-importhato.py -- NUNCA edites este
// archivo a mano. Editá `src/utils/importHato/ocrPesajeCorreccion.ts` y volvé a correr el script.
//
// POR QUÉ EXISTE ESTE DUPLICADO: el endpoint B0/V10 (`POST
// .../hato/chequeo/preview`, `hato-chequeo-preview.ts`) corre en el árbol de
// despliegue de la edge function y no puede importar desde `src/utils/` --
// cruzaría la frontera del árbol de despliegue de Deno. Misma restricción
// que ya produjo `priorizacion-scouting.ts` y `calculos-hato.ts`.
//
// Contenido idéntico al original salvo los especificadores de import
// (reescritos para Deno: `@/utils/calculosHato` -> `../calculos-hato.ts`,
// `./xxx` -> `./xxx.ts`). `src/__tests__/importHatoParidadServidor.test.ts`
// corre este mismo script en modo `--check` y falla si alguien hand-editó
// una copia en vez de regenerarla.

// ARCHIVO: utils/importHato/ocrPesajeCorreccion.ts
// DESCRIPCIÓN: N12 de `docs/plan_hato_telegram_estados_agosto_2026.md` --
// decisión D-C del dueño: el bot de Telegram muestra en texto plano la
// lectura de la planilla de pesaje (`ocrPesaje.ts`), Fernando responde en
// LENGUAJE NATURAL ("MONZA sem 2 AM son 6.5 y BONITA no se pesó"), un modelo
// traduce esa frase a celdas concretas y el bot vuelve a mostrar el resumen
// YA CORREGIDO -- solo se persiste tras un "ok" explícito.
//
// LA MISMA SEPARACIÓN que el resto del módulo (`ocrChequeo.ts`,
// `ocrPesaje.ts`): el modelo SOLO extrae entidades del texto (qué vaca, qué
// semana, qué sub-celda, qué valor o "sin dato"); este archivo es quien
// VALIDA esas entidades contra el roster y la grilla de semanas del mes --
// nunca al revés. La llamada HTTP al modelo vive en el árbol Deno
// (`hato-pesaje-pipeline.ts`); acá no hay I/O ni `Date.now()`.
//
// REGLA DURA (idéntica a la del ancla por foto): un ítem que el modelo no
// logre anclar a UNA vaca del roster, a UNA semana válida de la grilla o a
// UN valor de litros interpretable NUNCA se aplica -- se reporta como no
// entendido para que Fernando lo aclare. Nunca se adivina.
//
// El cotejo de nombre reusa `resolverNombreEnRosterPesaje` de `./ocrPesaje`
// -- el MISMO algoritmo que ancla la foto, para que un nombre se resuelva
// igual sin importar si vino impreso o hablado. Los litros se interpretan
// con `parseValorNumerico` (`calculosHato.ts`), el único parser numérico.
//
// Puro, cero I/O, cero Date.now().

import { parseValorNumerico } from '../calculos-hato.ts';
import {
  resolverNombreEnRosterPesaje,
  SEMANAS_PESAJE,
  type CeldaDiffPesaje,
  type ClasificacionCeldaPesaje,
  type RosterPesaje,
  type SemanaPesaje,
} from './ocrPesaje.ts';

// ---------------------------------------------------------------------------
// 1. Lo que el modelo devuelve -- entidades extraídas del texto, SIN validar.
// ---------------------------------------------------------------------------

export type SubceldaCorreccionPesaje = 'am' | 'pm' | 'ambos';

export interface ItemCorreccionModeloPesaje {
  /** El nombre de vaca tal como el usuario lo escribió, verbatim -- para
   * poder reportar "no encontré a X" con el texto real, nunca el
   * normalizado. */
  nombreMencionado: string;
  /** Semana 1-5 mencionada en el texto, o `null` si el texto no la
   * especifica. Nunca se infiere -- una corrección sin semana se reporta
   * como no entendida (mismo criterio que un nombre sin ancla). */
  semana: number | null;
  /** Qué sub-celda(s) afecta. `'ambos'` cuando el texto habla de la vaca sin
   * distinguir AM/PM (p. ej. "no se pesó"). `null` si el texto no lo dice. */
  subcelda: SubceldaCorreccionPesaje | null;
  /** `true` cuando el texto dice explícitamente que la vaca no se pesó / no
   * hay dato para esa celda -- el valor resultante es `null`, nunca 0. */
  sinDato: boolean;
  /** Texto crudo del valor de litros, tal como lo dijo el usuario (puede
   * traer coma, fracción, etc. -- se interpreta con `parseValorNumerico`).
   * Vacío o ausente cuando `sinDato` es `true`. */
  valorTexto: string | null;
}

function textoPlano(valor: unknown): string {
  if (valor === null || valor === undefined) return '';
  if (typeof valor === 'string') return valor.trim();
  if (typeof valor === 'number' || typeof valor === 'boolean') return String(valor);
  return '';
}

function semanaPlana(valor: unknown): number | null {
  if (typeof valor === 'number' && Number.isInteger(valor)) return valor;
  if (typeof valor === 'string' && valor.trim() !== '') {
    const n = Number(valor.trim());
    if (Number.isInteger(n)) return n;
  }
  return null;
}

function subceldaPlana(valor: unknown): SubceldaCorreccionPesaje | null {
  return valor === 'am' || valor === 'pm' || valor === 'ambos' ? valor : null;
}

/**
 * Convierte el JSON crudo que devolvió el modelo (ya des-serializado) en una
 * lista de `ItemCorreccionModeloPesaje`. Tolerante por diseño, mismo
 * criterio que `parsearRespuestaModeloOcrPesaje`: un ítem mal formado NUNCA
 * aborta el resto -- se conserva con lo que se pueda leer (y lo demás en
 * `null`, que `interpretarCorreccionPesaje` reportará como no entendido en
 * vez de fallar en silencio). Solo `items` ausente/no-arreglo es fatal: ahí
 * no hay nada que rescatar.
 */
export function parsearRespuestaModeloCorreccionPesaje(bruto: unknown): {
  items: ItemCorreccionModeloPesaje[];
  avisos: string[];
} {
  const avisos: string[] = [];
  if (bruto === null || typeof bruto !== 'object') {
    throw new Error('La respuesta del modelo de corrección no es un objeto JSON.');
  }
  const raiz = bruto as Record<string, unknown>;
  const itemsBrutos = raiz.items;
  if (!Array.isArray(itemsBrutos)) {
    throw new Error("La respuesta del modelo de corrección no trae el arreglo 'items'.");
  }

  const items: ItemCorreccionModeloPesaje[] = itemsBrutos.map((itemBruto, i) => {
    if (itemBruto === null || typeof itemBruto !== 'object') {
      avisos.push(`ítem ${i + 1}: no es un objeto -- se descarta su contenido, queda como no entendido`);
      return { nombreMencionado: '', semana: null, subcelda: null, sinDato: false, valorTexto: null };
    }
    const item = itemBruto as Record<string, unknown>;
    return {
      nombreMencionado: textoPlano(item.nombre_mencionado),
      semana: semanaPlana(item.semana),
      subcelda: subceldaPlana(item.subcelda),
      sinDato: item.sin_dato === true,
      valorTexto: item.sin_dato === true ? null : textoPlano(item.valor_texto) || null,
    };
  });

  return { items, avisos };
}

// ---------------------------------------------------------------------------
// 2. Validación: entidades del modelo -> celdas concretas, o "no entendida".
// ---------------------------------------------------------------------------

export interface CorreccionPesajeAplicable {
  animalId: string;
  nombre: string;
  semana: SemanaPesaje;
  fecha: string;
  subcelda: 'am' | 'pm';
  /** `null` = limpia la celda ("no se pesó"), nunca 0. */
  valor: number | null;
}

export interface CorreccionPesajeNoEntendida {
  nombreMencionado: string;
  semana: number | null;
  detalle: string;
}

export interface ResultadoInterpretacionCorreccionPesaje {
  aplicables: CorreccionPesajeAplicable[];
  noEntendidas: CorreccionPesajeNoEntendida[];
}

/**
 * Valida cada ítem que el modelo extrajo del texto libre contra el roster
 * (nombre) y la grilla de semanas del mes (`fechasPorSemana`, la MISMA que
 * ya resolvió `fechasPesajeMensuales` para la lectura por foto -- nunca se
 * vuelve a derivar). Un ítem que falle CUALQUIERA de las tres anclas (vaca,
 * semana, valor) va a `noEntendidas` -- nunca se aplica a medias ni se
 * adivina la parte que falta.
 */
export function interpretarCorreccionPesaje(
  items: readonly ItemCorreccionModeloPesaje[],
  roster: RosterPesaje,
  fechasPorSemana: Readonly<Record<SemanaPesaje, string | null>>,
): ResultadoInterpretacionCorreccionPesaje {
  const aplicables: CorreccionPesajeAplicable[] = [];
  const noEntendidas: CorreccionPesajeNoEntendida[] = [];

  for (const item of items) {
    const ancla = resolverNombreEnRosterPesaje(item.nombreMencionado, roster);
    if (!ancla.ok) {
      noEntendidas.push({ nombreMencionado: item.nombreMencionado, semana: item.semana, detalle: ancla.detalle });
      continue;
    }
    const nombre = ancla.entrada.nombre;

    if (item.semana === null || !(SEMANAS_PESAJE as readonly number[]).includes(item.semana)) {
      noEntendidas.push({
        nombreMencionado: item.nombreMencionado,
        semana: item.semana,
        detalle: `no especifica una semana válida (1 a 5) para ${nombre} -- dila explícita, p. ej. "semana 2"`,
      });
      continue;
    }
    const semana = item.semana as SemanaPesaje;

    const fecha = fechasPorSemana[semana];
    if (fecha === null) {
      noEntendidas.push({
        nombreMencionado: item.nombreMencionado,
        semana,
        detalle: `la semana ${semana} no existe en la planilla de este mes`,
      });
      continue;
    }

    // "no se pesó" sin AM/PM explícito limpia AMBAS -- ninguno de los dos
    // ordeños pasó esa semana. Con valor (no sinDato) sí hace falta que el
    // texto diga cuál de los dos: escribir el mismo número en AM y PM sin que
    // el usuario lo haya dicho sería adivinar.
    const subceldas: Array<'am' | 'pm'> =
      item.subcelda === 'ambos' || (item.sinDato && item.subcelda === null)
        ? ['am', 'pm']
        : item.subcelda === 'am' || item.subcelda === 'pm'
          ? [item.subcelda]
          : [];

    if (subceldas.length === 0) {
      noEntendidas.push({
        nombreMencionado: item.nombreMencionado,
        semana,
        detalle: `no especifica si es AM, PM o ambos para ${nombre} semana ${semana}`,
      });
      continue;
    }

    if (item.sinDato) {
      for (const sub of subceldas) {
        aplicables.push({ animalId: ancla.entrada.id, nombre, semana, fecha, subcelda: sub, valor: null });
      }
      continue;
    }

    const parseado = item.valorTexto ? parseValorNumerico(item.valorTexto, { fracciones: true }) : null;
    if (!item.valorTexto || !parseado || parseado.valor === null) {
      noEntendidas.push({
        nombreMencionado: item.nombreMencionado,
        semana,
        detalle: `no pude interpretar '${item.valorTexto ?? ''}' como litros para ${nombre} semana ${semana}`,
      });
      continue;
    }
    for (const sub of subceldas) {
      aplicables.push({ animalId: ancla.entrada.id, nombre, semana, fecha, subcelda: sub, valor: parseado.valor });
    }
  }

  return { aplicables, noEntendidas };
}

// ---------------------------------------------------------------------------
// 3. Aplicar correcciones YA validadas sobre el diff en memoria.
// ---------------------------------------------------------------------------

/**
 * Aplica correcciones validadas sobre el diff que ya se le mostró al
 * usuario -- SIEMPRE en memoria, nunca contra la base de datos: el
 * commit (N13) es un paso posterior y separado, gateado por el "ok"
 * explícito. Una corrección que no toca una celda del diff (animal/semana
 * que no vino en la lectura original) la agrega -- puede ser una vaca que
 * el OCR no leyó y que Fernando corrige a mano en el mismo mensaje.
 *
 * `clasificacion` se recalcula con la MISMA regla que `construirDiffPesaje`
 * (litrosTotal null -> 'sin_dato'; sin fila existente -> 'nuevo'; con fila
 * existente -> 'cambio' -- nunca hace falta distinguir 'cambio' de
 * 'sin_cambio' después de una corrección humana, ambas son escribibles por
 * igual). `noConfiable` pasa a `false`: un humano confirmó la celda, ya no
 * es "el modelo dudó".
 */
export function aplicarCorreccionesADiff(
  diff: readonly CeldaDiffPesaje[],
  aplicables: readonly CorreccionPesajeAplicable[],
): CeldaDiffPesaje[] {
  if (aplicables.length === 0) return [...diff];

  type Cambio = { am?: number | null; pm?: number | null };
  const porCelda = new Map<string, Cambio>();
  for (const correccion of aplicables) {
    const clave = `${correccion.animalId}|${correccion.semana}`;
    const actual = porCelda.get(clave) ?? {};
    if (correccion.subcelda === 'am') actual.am = correccion.valor;
    else actual.pm = correccion.valor;
    porCelda.set(clave, actual);
  }

  const resultado = diff.map((celda): CeldaDiffPesaje => {
    const clave = `${celda.animalId}|${celda.semana}`;
    const cambio = porCelda.get(clave);
    if (!cambio) return celda;
    porCelda.delete(clave); // lo que sobrevive al final son celdas NUEVAS (ver abajo)

    const litrosAm = 'am' in cambio ? (cambio.am as number | null) : celda.litrosAm;
    const litrosPm = 'pm' in cambio ? (cambio.pm as number | null) : celda.litrosPm;
    return recalcularCelda({ ...celda, litrosAm, litrosPm });
  });

  // Correcciones que no calzaron con ninguna celda ya presente en el diff
  // (p. ej. una vaca que la foto no leyó y que Fernando agrega a mano en la
  // misma corrección) -- se agregan como celdas nuevas, nunca se descartan.
  for (const [clave, cambio] of porCelda) {
    const [animalId, semanaTexto] = clave.split('|');
    const semana = Number(semanaTexto) as SemanaPesaje;
    const nombre = aplicables.find((a) => a.animalId === animalId && a.semana === semana)?.nombre ?? '';
    const fecha = aplicables.find((a) => a.animalId === animalId && a.semana === semana)?.fecha ?? '';
    resultado.push(
      recalcularCelda({
        animalId,
        nombre,
        semana,
        fecha,
        litrosAm: 'am' in cambio ? (cambio.am as number | null) : null,
        litrosPm: 'pm' in cambio ? (cambio.pm as number | null) : null,
        litrosTotal: null,
        soloUnOrdeno: false,
        existenteId: null,
        clasificacion: 'sin_dato',
        noConfiable: false,
      }),
    );
  }

  return resultado;
}

function recalcularCelda(celda: CeldaDiffPesaje): CeldaDiffPesaje {
  const litrosTotal = celda.litrosAm === null && celda.litrosPm === null ? null : (celda.litrosAm ?? 0) + (celda.litrosPm ?? 0);
  const clasificacion: ClasificacionCeldaPesaje =
    litrosTotal === null ? 'sin_dato' : celda.existenteId ? 'cambio' : 'nuevo';
  return {
    ...celda,
    litrosTotal,
    soloUnOrdeno: (celda.litrosAm === null) !== (celda.litrosPm === null),
    clasificacion,
    noConfiable: false,
  };
}

// ---------------------------------------------------------------------------
// 4. Prompt y esquema de salida del modelo de interpretación.
// ---------------------------------------------------------------------------

/** Esquema JSON estricto -- mismo criterio que `esquemaJsonOcrPesaje`: sin
 * uniones de tipo abiertas donde se pueda evitar, ausencia = `null`. */
export function esquemaJsonCorreccionPesaje(): Record<string, unknown> {
  return {
    type: 'object',
    properties: {
      items: {
        type: 'array',
        description: 'Una entrada por cada corrección/aclaración que el texto menciona.',
        items: {
          type: 'object',
          properties: {
            nombre_mencionado: {
              type: 'string',
              description: 'El nombre de la vaca tal como aparece en el texto, verbatim.',
            },
            semana: {
              type: ['integer', 'null'],
              description: 'Número de semana (1 a 5) que el texto menciona explícitamente. null si no lo dice.',
            },
            subcelda: {
              type: ['string', 'null'],
              enum: ['am', 'pm', 'ambos', null],
              description:
                "'am' u 'pm' si el texto distingue el ordeño; 'ambos' cuando habla de la vaca sin distinguir (p. ej. 'no se pesó'); null si no se puede determinar.",
            },
            sin_dato: {
              type: 'boolean',
              description: "true cuando el texto dice que la vaca NO se pesó / no hay dato para esa celda.",
            },
            valor_texto: {
              type: ['string', 'null'],
              description:
                'El valor de litros tal como lo escribió el usuario (puede traer coma o fracción). null cuando sin_dato es true.',
            },
          },
          required: ['nombre_mencionado', 'semana', 'subcelda', 'sin_dato', 'valor_texto'],
          additionalProperties: false,
        },
      },
    },
    required: ['items'],
    additionalProperties: false,
  };
}

/**
 * Prompt de interpretación. Deliberadamente NO incluye el roster de vacas
 * activas (mismo criterio que `construirPromptOcrPesaje`): el modelo solo
 * EXTRAE entidades del texto -- el nombre exacto que Fernando escribió, tal
 * cual -- y es `interpretarCorreccionPesaje` quien lo valida contra el
 * roster real. Pasarle el roster al modelo volvería la extracción un espejo
 * de sí misma en vez de una lectura honesta del texto.
 */
export function construirPromptCorreccionPesaje(): string {
  return [
    'Eres un asistente que interpreta correcciones en español, dichas en lenguaje natural, sobre una planilla de pesaje de leche de un hato lechero en Colombia.',
    '',
    'El usuario acaba de ver un resumen de lo que se leyó de una foto de la planilla (vaca, semana, litros AM/PM) y ahora escribe correcciones o aclaraciones en texto libre. Tu único trabajo es EXTRAER, para cada corrección que menciona, estos datos: el nombre de la vaca (tal como lo escribió, sin corregirlo ni normalizarlo), la semana (1 a 5) si la menciona, si habla de AM, PM o de la vaca en general, si dice que la vaca NO se pesó, y el valor de litros si da uno.',
    '',
    'EJEMPLOS (los nombres son solo ilustrativos, no una lista real):',
    '- "LUNA sem 2 AM son 6.5" -> {nombre_mencionado: "LUNA", semana: 2, subcelda: "am", sin_dato: false, valor_texto: "6.5"}',
    '- "PRINCESA no se pesó" -> {nombre_mencionado: "PRINCESA", semana: null, subcelda: null, sin_dato: true, valor_texto: null} (semana null porque el texto no la menciona -- NO la adivines)',
    '- "la vaca REINA semana 3 no se pesó" -> {nombre_mencionado: "REINA", semana: 3, subcelda: "ambos", sin_dato: true, valor_texto: null}',
    '',
    'REGLAS DURAS:',
    '1. NUNCA inventes una semana, un AM/PM o un valor que el texto no diga explícita o inequívocamente. Si no está claro, deja ese campo en null (o sin_dato en false con valor_texto null) -- es preferible reportar que no se entendió a adivinar.',
    '2. Copia el nombre EXACTAMENTE como aparece en el texto, sin corregir ortografía ni completar el nombre real de una vaca -- eso lo hace otro paso, no tú.',
    '3. El valor de litros se copia tal cual está escrito (puede traer coma, punto o fracción como "6 1/2"); no lo conviertas ni lo redondees.',
    '4. Una sola frase puede traer varias correcciones (una por vaca) -- devuelve un ítem por cada una.',
    '',
    'Responde ÚNICAMENTE con el JSON del esquema pedido. Sin explicaciones, sin markdown.',
  ].join('\n');
}
