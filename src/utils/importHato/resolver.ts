// ARCHIVO: utils/importHato/resolver.ts
// DESCRIPCIÓN: Motor puro de resolución de identidad -- la etapa "Resolve"
// del pipeline de importación histórica (plan docs/plan_hato_lechero_module.md
// §7.4, paso 3; ver también docs/hato/s3-contrato-pipeline.md y
// docs/hato/s2-matriz-qa.md). Consume `SalidaNormalizado` (la frontera de
// `./tipos.ts`, ya normalizada a nivel de celda por Extract+Normalize -- ver
// `src/utils/calculosHato.ts`) y produce el registro de animales
// (`animales.csv`) más toda la evidencia que necesita `reporte.ts` para
// construir `resolution-report.md`.
//
// Módulo PURO: cero I/O, cero import de Supabase, mismo régimen que
// `calculosHato.ts`/`calculosPyG.ts`. `resolverIdentidadHato` recibe
// `generadoEn` como parámetro (nunca `Date.now()` dentro de lógica pura).
//
// Regla dura heredada de `calculosHato.ts` y del contrato de tipos: NINGÚN
// dato ambiguo se resuelve en silencio. `numero` es la llave fuerte y
// `nombre` es validación (plan §7.4), pero la evidencia real (docs/hato/
// s2-matriz-qa.md §1, §2.9, §3; docs/hato/s3-verificacion-independiente.md)
// muestra que ni uno ni otro son estables por sí solos:
//   - Al menos 9 números de chapeta están duplicados de forma CONCURRENTE
//     entre dos animales activos en la MISMA lectura -- 2 de ellos siguen
//     vigentes en el chequeo más reciente del hato. Esos casos NUNCA se
//     resuelven aquí: van al reporte con confianza='baja' para que Martha
//     decida (`detectarColisionesCorpus`).
//   - Un mismo nombre puede aparecer bajo más de un número (FABIOLA:
//     #176/#116; CHAMPAÑA: #151/#183) -- un modo de falla DISTINTO al
//     anterior, que Martha resuelve de otra forma (`detectarNombresBajoVariosNumeros`).
//   - TERNERAS renombra crías al madurar (campera->COPITA, etc, doc S2 §3) --
//     eso SÍ se resuelve automáticamente, prefiriendo siempre el nombre más
//     reciente, sin jamás presentárselo a Martha como una contradicción
//     (`resolverTerneras`, `resolverRenombres`).
//
// Toda la aritmética de fechas (comparación lexicográfica ISO) sigue el
// mismo truco que ya usa `calculosHato.ts`/`priorizacionMonitoreo.ts`.

import { detectarColisionesChapeta, type AnimalEnChequeo } from '@/utils/calculosHato';
import type {
  SalidaNormalizado,
  FilaChequeoNormalizada,
  FilaTerneraNormalizada,
  FilaSubtablaNormalizada,
  ManifiestoHoja,
  ConfianzaFecha,
} from './tipos';
import { buscarOverride, motivoOverride, OVERRIDES_CHAPETA, type OverrideChapeta } from './overridesChapeta';
import { esCodigoEstadoEnColumnaToro } from './parseToro';
import { VENTAS_INFERIDAS, type VentaInferida } from './ventasInferidas';

// ============================================================================
// Tipos compartidos
// ============================================================================

export type ConfianzaResolucion = 'alta' | 'media' | 'baja';

/** Referencia mínima a una lectura física (hoja de chequeo escaneada). */
export interface EvidenciaLectura {
  archivo: string;
  hoja: string;
  fecha: string | null;
}

// ============================================================================
// BLOQUE 1 — Agrupación de `chequeos` por lectura real
// ============================================================================

/**
 * Clave de agrupación de una fila de chequeo a su LECTURA (visita real del
 * veterinario). Se agrupa por `chequeoFecha` -- dos hojas físicas duplicadas
 * que Extract dedupe ya no deberían coexistir en `chequeos`, pero si dos
 * hojas físicas DISTINTAS comparten fecha resuelta (mismo día real), es
 * correcto tratarlas como la MISMA lectura para detectar colisiones
 * concurrentes (ver docs/hato/s2-matriz-qa.md §2.9: "misma hoja/fecha").
 * Cuando la fecha no se pudo resolver (`null`), se usa `archivo::hoja` como
 * respaldo -- nunca se fusionan dos hojas de fecha desconocida entre sí,
 * eso sería inventar una coincidencia que no está en la evidencia.
 */
function claveLectura(fila: FilaChequeoNormalizada): string {
  return fila.chequeoFecha ?? `SIN_FECHA::${fila.archivo}::${fila.hoja}`;
}

interface LecturaAgrupada {
  clave: string;
  fecha: string | null;
  archivo: string;
  hoja: string;
  filas: FilaChequeoNormalizada[];
}

function agruparPorLectura(chequeos: FilaChequeoNormalizada[]): LecturaAgrupada[] {
  const mapa = new Map<string, LecturaAgrupada>();
  for (const fila of chequeos) {
    const clave = claveLectura(fila);
    if (!mapa.has(clave)) {
      mapa.set(clave, { clave, fecha: fila.chequeoFecha, archivo: fila.archivo, hoja: fila.hoja, filas: [] });
    }
    mapa.get(clave)!.filas.push(fila);
  }
  return [...mapa.values()];
}

/** Fecha resuelta más reciente de TODO el corpus de chequeos -- ancla de
 * "hato actual" (el chequeo más reciente, target de la Épica F1). `null` si
 * ninguna fecha se pudo resolver -- nunca se asume una. */
function calcularFechaMasReciente(chequeos: FilaChequeoNormalizada[]): string | null {
  let max: string | null = null;
  for (const f of chequeos) {
    if (f.chequeoFecha !== null && (max === null || f.chequeoFecha > max)) max = f.chequeoFecha;
  }
  return max;
}

// ============================================================================
// BLOQUE 2 — Similitud de nombres (agrupación visual, NUNCA resolución)
// ============================================================================

function distanciaEdicion(a: string, b: string): number {
  const x = a.trim().toUpperCase();
  const y = b.trim().toUpperCase();
  const m = x.length;
  const n = y.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array<number>(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const costo = x[i - 1] === y[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + costo);
    }
  }
  return dp[m][n];
}

/**
 * `true` cuando dos nombres distan a lo sumo 1 carácter -- evidencia real:
 * `#175` trae MONA/MARGARITA/NONA (MONA<->NONA, distancia 1) y `#182` trae
 * FLACA/FRESA/FRESIA (FRESA<->FRESIA, distancia 1) -- hallazgo del barrido
 * independiente del coordinador S3 (docs/hato/s3-verificacion-independiente.md
 * §3.1). Umbral DELIBERADAMENTE conservador (1, no 2): el objetivo es
 * agrupar solo lo evidentemente relacionado para que el reporte le ahorre a
 * Martha separar "posible error de digitación" de "dos animales reales" --
 * nunca decide identidad por sí sola, ni siquiera con distancia 1.
 */
export function esVarianteOrtografica(a: string, b: string): boolean {
  const x = a.trim().toUpperCase();
  const y = b.trim().toUpperCase();
  if (x === y) return false; // idénticos no son "variantes", son el mismo texto
  return distanciaEdicion(x, y) <= 1;
}

/** Partición de una lista de nombres en clústeres de variantes de escritura
 * (agrupación transitiva simple, suficiente para grupos pequeños como los de
 * una colisión de chapeta). Un clúster con 1 solo elemento es, con más
 * probabilidad, un animal genuinamente distinto; un clúster con 2+ es una
 * posible variante de grafía del mismo nombre -- el reporte muestra ambos
 * casos por separado, nunca los fusiona en un solo nombre. */
function agruparPorSimilitud(nombres: string[]): string[][] {
  const grupos: string[][] = [];
  for (const nombre of nombres) {
    const grupo = grupos.find((g) => g.some((n) => esVarianteOrtografica(n, nombre)));
    if (grupo) grupo.push(nombre);
    else grupos.push([nombre]);
  }
  return grupos;
}

// ============================================================================
// BLOQUE 3 — Colisiones de chapeta (un `numero`, dos+ animales)
// ============================================================================

export interface ColisionChapetaCorpus {
  numero: number;
  /** Nombres distintos vistos coexistiendo (misma lectura) bajo este numero. */
  nombres: string[];
  /** Una entrada por lectura donde 2+ de esos nombres coexisten. */
  evidencia: EvidenciaLectura[];
  /** = evidencia.length -- la señal de mayor fuerza para adjudicar (34 hojas
   * sostenidas 7 años = casi con certeza dos animales reales; 1 hoja = con
   * más probabilidad un error de digitación puntual. Ver
   * docs/hato/s3-verificacion-independiente.md §3.2). */
  numeroHojas: number;
  /** `true` si la colisión sigue viva en la lectura MÁS RECIENTE de todo el
   * corpus -- bloquea `Load` de inmediato (el UNIQUE(numero) rechazaría la
   * segunda fila). */
  vigente: boolean;
  /** Partición de `nombres` en clústeres de variantes de escritura (ver
   * `agruparPorSimilitud`) -- NUNCA decide la identidad, solo agrupa para
   * que el reporte distinga "posible typo" de "dos animales reales". */
  gruposOrtograficos: string[][];
  confianza: 'baja';
}

/**
 * Detecta números de chapeta con 2+ nombres coexistiendo dentro de la MISMA
 * lectura, en todo el corpus -- reusa `detectarColisionesChapeta` de
 * `calculosHato.ts` (no reimplementa el parser, plan §7.4) aplicada
 * lectura-por-lectura, y agrega el resultado. NUNCA decide cuál animal
 * conserva el número (esa es la decisión de Martha, plan §7.4 "Resolve").
 */
export function detectarColisionesCorpus(chequeos: FilaChequeoNormalizada[]): ColisionChapetaCorpus[] {
  const lecturas = agruparPorLectura(chequeos);
  const fechaMasReciente = calcularFechaMasReciente(chequeos);

  const porNumero = new Map<number, { nombres: Set<string>; evidencia: EvidenciaLectura[] }>();

  for (const lectura of lecturas) {
    const animales: AnimalEnChequeo[] = lectura.filas
      .filter((f): f is FilaChequeoNormalizada & { numero: number } => f.numero !== null)
      .map((f) => ({ numero: f.numero, nombre: (f.nombre ?? '').trim() }))
      .filter((a) => a.nombre !== '');
    const colisionesLectura = detectarColisionesChapeta(animales);
    for (const c of colisionesLectura) {
      if (!porNumero.has(c.numero)) porNumero.set(c.numero, { nombres: new Set(), evidencia: [] });
      const entrada = porNumero.get(c.numero)!;
      for (const n of c.nombres) entrada.nombres.add(n);
      entrada.evidencia.push({ archivo: lectura.archivo, hoja: lectura.hoja, fecha: lectura.fecha });
    }
  }

  const resultado: ColisionChapetaCorpus[] = [];
  for (const [numero, { nombres, evidencia }] of porNumero) {
    const nombresOrdenados = [...nombres].sort();
    resultado.push({
      numero,
      nombres: nombresOrdenados,
      evidencia,
      numeroHojas: evidencia.length,
      vigente: fechaMasReciente !== null && evidencia.some((e) => e.fecha === fechaMasReciente),
      gruposOrtograficos: agruparPorSimilitud(nombresOrdenados),
      confianza: 'baja',
    });
  }
  // Ordenado por fuerza de evidencia (más hojas primero) -- es literalmente
  // el orden que hace corta la sesión con Martha (hallazgo del coordinador).
  return resultado.sort((a, b) => b.numeroHojas - a.numeroHojas || a.numero - b.numero);
}

/**
 * Chequea, para cada colisión VIGENTE, si `overridesChapeta.ts` (decisión
 * humana explícita -- ver ese archivo, NUNCA se edita desde aquí) cubre a
 * TODOS los nombres del par. Una colisión con OVERRIDE PARCIAL (cubre un
 * nombre pero no el otro) cuenta como NO cubierta -- cargar solo el lado que
 * sí tiene número es exactamente "cargar la parte que encaja", el
 * comportamiento que el pipeline prohíbe explícitamente: es peor que no
 * cargar nada, porque un hato a medias se ve completo.
 *
 * Se usa en dos puntos independientes (redundancia deliberada, no
 * duplicación accidental): aquí en `resolverIdentidadHato` para decidir cómo
 * construir cada fila de `animales.csv`, y de nuevo en el runner
 * `scripts/import-hato/load.ts`, que la vuelve a calcular desde
 * `normalizado.json` en vez de confiar en el CSV (que pudo haberse editado a
 * mano) -- así el bloqueo lo dice el código en los dos lugares, no una
 * persona que tiene que acordarse de revisar el CSV primero.
 */
export function verificarOverridesCubrenColisiones(colisionesVigentes: ColisionChapetaCorpus[]): {
  colisionesNoCubiertas: ColisionChapetaCorpus[];
} {
  const colisionesNoCubiertas = colisionesVigentes.filter(
    (c) => !c.nombres.every((nombre) => buscarOverride(c.numero, nombre) !== null),
  );
  return { colisionesNoCubiertas };
}

// ============================================================================
// BLOQUE 4 — Un mismo nombre bajo más de un número (modo de falla inverso)
// ============================================================================

export interface NombreEnVariosNumeros {
  nombre: string;
  numeros: number[];
  evidencia: EvidenciaLectura[];
}

/**
 * Detecta nombres que aparecen bajo más de un `numero` en todo el corpus --
 * el modo de falla INVERSO a `detectarColisionesCorpus` (evidencia real:
 * FABIOLA bajo #176 y #116; CHAMPAÑA bajo #151 y #183 -- docs/hato/
 * s3-verificacion-independiente.md §3.1). Martha lo resuelve distinto: no es
 * "¿cuál de las dos vacas conserva el número?", es "¿son la misma vaca mal
 * numerada en algún punto, o dos vacas distintas que comparten nombre?".
 */
export function detectarNombresBajoVariosNumeros(chequeos: FilaChequeoNormalizada[]): NombreEnVariosNumeros[] {
  const porNombre = new Map<string, { numeros: Set<number>; evidencia: EvidenciaLectura[] }>();
  for (const fila of chequeos) {
    if (fila.numero === null) continue;
    const nombre = fila.nombre?.trim();
    if (!nombre) continue;
    if (!porNombre.has(nombre)) porNombre.set(nombre, { numeros: new Set(), evidencia: [] });
    const entrada = porNombre.get(nombre)!;
    entrada.numeros.add(fila.numero);
    entrada.evidencia.push({ archivo: fila.archivo, hoja: fila.hoja, fecha: fila.chequeoFecha });
  }
  const resultado: NombreEnVariosNumeros[] = [];
  for (const [nombre, { numeros, evidencia }] of porNombre) {
    if (numeros.size > 1) {
      resultado.push({ nombre, numeros: [...numeros].sort((a, b) => a - b), evidencia });
    }
  }
  return resultado.sort((a, b) => a.nombre.localeCompare(b.nombre));
}

// ============================================================================
// BLOQUE 5 — Renombres resueltos automáticamente (numeros SIN colisión vigente)
// ============================================================================

export interface RenombreResuelto {
  numero: number;
  nombreVigente: string;
  nombresObsoletos: string[];
  /** `true` si en ALGUNA lectura histórica los nombres coexistieron (colisión
   * ya resuelta por convergencia, no bloqueante) -- distinto de un simple
   * renombre secuencial que nunca coexistió (ej. TERNERAS cría->adulta). */
  fueColisionHistorica: boolean;
  confianza: ConfianzaResolucion;
}

/**
 * Para cada `numero` SIN colisión vigente que aún así tiene más de un nombre
 * distinto en el corpus (renombre secuencial, o colisión histórica ya
 * convergida a un solo nombre por la lectura más reciente), elige el nombre
 * más reciente por fecha resuelta -- regla §4.4 de docs/hato/s2-matriz-qa.md:
 * "preferir SIEMPRE el nombre más reciente observado para cada #, nunca
 * alertar esto como error a Martha". Nunca decide sin fecha: si ninguna
 * aparición tiene fecha resuelta, el resultado es determinista (primer
 * nombre visto) pero se marca `confianza='baja'` -- no es una decisión de
 * identidad para Martha, es una incertidumbre de METADATA que el reporte
 * separa de las colisiones reales.
 */
export function resolverRenombres(
  chequeos: FilaChequeoNormalizada[],
  colisiones: ColisionChapetaCorpus[],
): RenombreResuelto[] {
  // Se excluye TODO numero que alguna vez tuvo una colisión CONCURRENTE, no
  // solo los vigentes en la lectura más reciente. `detectarColisionesCorpus`
  // solo registra colisiones dentro de UNA misma hoja, así que estar en esa
  // lista significa que dos nombres coexistieron en un mismo chequeo -- y una
  // vaca no puede llamarse de dos formas el mismo día. Eso es dos animales,
  // no un renombre, por antigua que sea la lectura.
  //
  // Filtrar por `vigente` (lo que hacía antes) degradaba a "renombre resuelto"
  // 9 colisiones concurrentes reales, entre ellas #43 CUÑA/MONTAÑA, que
  // coexisten en 25 hojas a lo largo de 7 años. El efecto era fusionar en
  // silencio los dos animales de cada par y perder uno -- justo lo que
  // docs/hato/s2-matriz-qa.md §2.9 advierte que NO se haga con #43, y lo que
  // el contrato de este pipeline prohíbe. Detectado corriendo sobre los datos
  // reales (coordinador, 2026-07-22).
  const numerosConHistoriaColision = new Set(colisiones.map((c) => c.numero));

  const porNumero = new Map<number, Array<{ nombre: string; fecha: string | null }>>();
  for (const fila of chequeos) {
    if (fila.numero === null || numerosConHistoriaColision.has(fila.numero)) continue;
    const nombre = fila.nombre?.trim();
    if (!nombre) continue;
    if (!porNumero.has(fila.numero)) porNumero.set(fila.numero, []);
    porNumero.get(fila.numero)!.push({ nombre, fecha: fila.chequeoFecha });
  }

  const resultado: RenombreResuelto[] = [];
  for (const [numero, apariciones] of porNumero) {
    const nombresDistintos = [...new Set(apariciones.map((a) => a.nombre))];
    if (nombresDistintos.length <= 1) continue; // sin ambigüedad -- no necesita entrada aparte

    const conFecha = apariciones.filter((a): a is { nombre: string; fecha: string } => a.fecha !== null);
    let nombreVigente: string;
    let ordenIncierto = false;
    if (conFecha.length > 0) {
      const maxFecha = conFecha.reduce((m, a) => (a.fecha > m ? a.fecha : m), conFecha[0].fecha);
      nombreVigente = conFecha
        .filter((a) => a.fecha === maxFecha)
        .map((a) => a.nombre)
        .sort()[0];
    } else {
      nombreVigente = nombresDistintos[0];
      ordenIncierto = true;
    }

    const nombresObsoletos = nombresDistintos.filter((n) => n !== nombreVigente);
    const fueColisionHistorica = numerosConHistoriaColision.has(numero);
    resultado.push({
      numero,
      nombreVigente,
      nombresObsoletos,
      fueColisionHistorica,
      confianza: ordenIncierto ? 'baja' : fueColisionHistorica ? 'media' : 'alta',
    });
  }
  return resultado.sort((a, b) => a.numero - b.numero);
}

// ============================================================================
// BLOQUE 6 — Cierres presuntos (D5: +365 días sin aparecer)
// ============================================================================

export interface CierrePresunto {
  numero: number;
  nombre: string;
  ultimaFechaVista: string;
  /** Fecha aproximada del cierre -- D5 (decisión del dueño, 2026-07-22): es
   * la ÚLTIMA VEZ VISTO, no una lectura futura estimada (regla anterior de
   * S3). "La mayoría de estas vacas pueden ya no estar en el hato... si
   * duran más de un año sin aparecer, ya no están en el hato." */
  fechaCierrePresunta: string;
  confianza: 'media';
}

/** D5 (decisión del dueño, 2026-07-22, resolution-report.md §5): "Si duran
 * más de un año sin aparecer, ya no están en el hato." Reemplaza la regla
 * original de S3 ("ausente en las ≥2 últimas lecturas del corpus") -- esa
 * regla dependía de qué tan seguido se hicieron las visitas (podía disparar
 * o no disparar sin que el TIEMPO real transcurrido cambiara), mientras que
 * "más de un año" es una medida de tiempo real, la que el dueño pidió. No es
 * un umbral de negocio configurable vía `HatoConfig` (058) -- es una
 * decisión puntual de esta sesión, documentada acá con su procedencia igual
 * que el resto del pipeline. */
const UMBRAL_DIAS_CIERRE_PRESUNTO = 365;

/** Diferencia en días calendario entre dos fechas ISO (`desde` -> `hasta`,
 * puede ser negativa). Duplicado local deliberado: `calculosHato.ts` ya
 * calcula esto (`diferenciaDias`), pero NO lo exporta y ese archivo está
 * fuera de alcance en esta sesión (cambio concurrente del coordinador sobre
 * `parseSX`/gem+/Mv, ver informe de la sesión que introdujo D5) -- no se
 * puede importar una función no exportada. Candidato a unificar exportando
 * `diferenciaDias` desde `calculosHato.ts` en una sesión futura que sí tenga
 * ese archivo en alcance. */
function diferenciaDiasLocal(desde: string, hasta: string): number {
  const [ay, am, ad] = desde.split('-').map(Number);
  const [by, bm, bd] = hasta.split('-').map(Number);
  const ta = Date.UTC(ay, am - 1, ad);
  const tb = Date.UTC(by, bm - 1, bd);
  return Math.round((tb - ta) / 86400000);
}

/**
 * Un `numero` cuya última aparición fechada queda a más de
 * `UMBRAL_DIAS_CIERRE_PRESUNTO` días de la lectura MÁS RECIENTE de todo el
 * corpus -> cierre presunto (`vendida`, fecha aproximada = última vez
 * visto, confianza='media') -- D5. Nunca un borrado: el animal sigue en
 * `animales.csv`, solo con `estadoPresunto='vendida'`. Sin ningún
 * "tratamiento especial" adicional (D5, palabras del dueño) -- se resuelve
 * solo, nunca aparece como pregunta abierta en el reporte (ver
 * `renderSeccionResumenAutomatico` en `reporte.ts`).
 *
 * Deliberadamente EXCLUYE numeros con colisión vigente (`numerosVigentesBloqueados`):
 * si dos animales físicos comparten el numero, "el numero desapareció" no
 * tiene un sujeto único al que atribuirle el cierre -- resolver esa
 * ambigüedad es exactamente lo que se le pide al dueño primero.
 */
export function detectarCierresPresuntos(
  chequeos: FilaChequeoNormalizada[],
  numerosVigentesBloqueados: Set<number>,
): CierrePresunto[] {
  const fechaMasReciente = calcularFechaMasReciente(chequeos);
  // Sin ninguna fecha resuelta en todo el corpus no hay ancla temporal desde
  // la que contar "más de un año sin aparecer".
  if (fechaMasReciente === null) return [];

  const porNumero = new Map<number, { nombre: string; ultimaFecha: string }>();
  for (const fila of chequeos) {
    if (fila.numero === null || numerosVigentesBloqueados.has(fila.numero)) continue;
    if (fila.chequeoFecha === null) continue;
    const nombre = fila.nombre?.trim();
    if (!nombre) continue;
    const actual = porNumero.get(fila.numero);
    if (!actual || fila.chequeoFecha > actual.ultimaFecha) {
      porNumero.set(fila.numero, { nombre, ultimaFecha: fila.chequeoFecha });
    }
  }

  const cierres: CierrePresunto[] = [];
  for (const [numero, { nombre, ultimaFecha }] of porNumero) {
    if (ultimaFecha === fechaMasReciente) continue; // sigue en el hato actual
    const diasSinAparecer = diferenciaDiasLocal(ultimaFecha, fechaMasReciente);
    if (diasSinAparecer > UMBRAL_DIAS_CIERRE_PRESUNTO) {
      cierres.push({ numero, nombre, ultimaFechaVista: ultimaFecha, fechaCierrePresunta: ultimaFecha, confianza: 'media' });
    }
  }
  return cierres.sort((a, b) => a.numero - b.numero);
}

// ============================================================================
// BLOQUE 7 — Catálogo de toros (siembra de `hato_toros`)
// ============================================================================

export interface EntradaCatalogoToro {
  /** trim + lowercase -- misma unicidad case-insensitive del índice
   * `hato_toros_nombre_unique` (migración 053). Para un candidato confiable
   * (`sospechosoNoEsToro=false`) esta clave es el NOMBRE CANÓNICO ya
   * resuelto por `parseToro.ts` (D6), no el string crudo de la celda -- así
   * 'hol'/'hols'/'HOLST'/'toro holst'/'hins' colapsan en una sola entrada
   * ("Holstein"), en vez de generar una entrada por cada grafía. */
  nombreNormalizado: string;
  /** Nombre visible: el canónico (D6) para un candidato confiable, o el
   * crudo tal cual lo escribió el chequeo para un sospechoso. */
  nombreVisible: string;
  apariciones: number;
  ejemplos: EvidenciaLectura[];
  /** `true` cuando `parseToro.ts` (Normalize) NO pudo resolver un nombre
   * para esta celda (anotación de texto libre, duración, doble señal
   * ambigua, resto vacío/demasiado corto...) -- la fuente de verdad es la
   * clasificación de Normalize, no una heurística de forma re-calculada acá
   * (evita duplicar la lógica de `parseToro.ts`). Los códigos de ESTADO
   * filtrados a esta columna (`ok`/`INOOK`/`rech`/... -- D6) NUNCA llegan
   * siquiera hasta acá: se excluyen del catálogo por completo, ni
   * confiables ni sospechosos (owner: "NO entry for INOOK"). */
  sospechosoNoEsToro: boolean;
}

const MAX_EJEMPLOS_TORO = 3;

/**
 * Construye el catálogo candidato de `hato_toros` a partir de la columna
 * `Toro` de TODO el corpus de chequeos (101+ valores crudos distintos, doc
 * S2 §0/§1). Agrupa por la identidad YA RESUELTA por Normalize
 * (`fila.toroNombre`, `parseToro.ts`) en vez de por el string crudo -- D6
 * (decisión del dueño, 2026-07-22, resolution-report.md §6):
 *   - un código de ESTADO filtrado por error de columna (`ok`/`INOOK`/
 *     `rech`/...) NUNCA es candidato a toro -- se excluye del todo, ni
 *     siquiera como sospechoso;
 *   - una raza pura (`hol`/`jers`/`nor`/`gir`/`TJ`/`h t`/`hins`...) ahora SÍ
 *     es un candidato válido (la raza-como-nombre), agrupado bajo su nombre
 *     canónico (Holstein/Jersey/Normando/Gyr) -- nunca una entrada por cada
 *     grafía cruda;
 *   - `FABA` se agrupa junto a cualquier aparición de "Fabace" (mismo toro,
 *     ver `ALIAS_TORO` en `parseToro.ts` y D7 en `clasificarPadreTernera`).
 * Lo que Normalize NO pudo resolver (anotación libre, duración, doble
 * señal, resto vacío/corto) sigue mostrándose agrupado por el string crudo,
 * marcado `sospechosoNoEsToro=true` -- transparencia (nada se descarta),
 * pero ya no cuenta como candidato de toro.
 */
export function construirCatalogoToros(chequeos: FilaChequeoNormalizada[]): EntradaCatalogoToro[] {
  const mapa = new Map<string, EntradaCatalogoToro>();
  for (const fila of chequeos) {
    const crudo = fila.raw.toro?.trim();
    if (!crudo) continue;
    if (esCodigoEstadoEnColumnaToro(crudo)) continue; // D6: nunca un candidato a toro.

    const esConfiable = fila.toroNombre !== null;
    const clave = esConfiable ? fila.toroNombre!.trim().toLowerCase() : crudo.toLowerCase();
    if (!mapa.has(clave)) {
      mapa.set(clave, {
        nombreNormalizado: clave,
        nombreVisible: esConfiable ? fila.toroNombre! : crudo,
        apariciones: 0,
        ejemplos: [],
        sospechosoNoEsToro: !esConfiable,
      });
    }
    const entrada = mapa.get(clave)!;
    entrada.apariciones += 1;
    if (entrada.ejemplos.length < MAX_EJEMPLOS_TORO) {
      entrada.ejemplos.push({ archivo: fila.archivo, hoja: fila.hoja, fecha: fila.chequeoFecha });
    }
  }
  return [...mapa.values()].sort(
    (a, b) => b.apariciones - a.apariciones || a.nombreNormalizado.localeCompare(b.nombreNormalizado),
  );
}

// ============================================================================
// BLOQUE 8 — Clasificación de `PADRE` en TERNERAS
// ============================================================================

export type TipoClasificacionPadre = 'raza' | 'toro_confirmado' | 'toro_no_confirmado' | 'vacio';

export interface ClasificacionPadreTernera {
  archivo: string;
  hoja: string;
  fila: number;
  numero: number | null;
  padreRaw: string | null;
  clasificacion: TipoClasificacionPadre;
  razaDetectada?: string;
  /** Nombre canónico del toro cuando `clasificacion === 'toro_confirmado'`
   * (D7: 'yaguen'/'fabace' son nombres de toro reales, no razas -- 'fabace'
   * es el MISMO toro que 'FABA' en la columna Toro de los chequeos, ver
   * `ALIAS_TORO` en `parseToro.ts` / D6). */
  toroNombre?: string;
  /** Nota de procedencia cuando la clasificación viene de una decisión del
   * dueño y no de una regla determinista sobre el dato crudo (D7: la raza de
   * 'yaguen'/'fabace' se ASUME jersey, no está confirmada en la planilla). */
  nota?: string;
}

/**
 * Variantes de grafía de raza observadas en el corpus real (doc S2 §3;
 * confirmado y ampliado por el barrido independiente del coordinador,
 * docs/hato/s3-verificacion-independiente.md §3.4). Vocabulario CERRADO por
 * evidencia -- mismo criterio que las familias de `parseSX` en
 * `calculosHato.ts` (no son un umbral de negocio editable, son literales de
 * texto reconocidos).
 *
 * TRAMPA documentada por el coordinador: `hato_config.razas` (migración 058)
 * siembra los nombres CANÓNICOS completos (`jersey`, `holstein`, `normanda`).
 * NINGUNA celda de la planilla escribe una raza así -- todas son abreviaturas
 * (`hol`, `jers`, `gir`...). Un match literal contra `HatoConfig.razas` no
 * encontraría nada y dejaría pasar cada abreviatura como "posible nombre de
 * toro", sembrando `hato_toros` con toros falsos (`hato_toros.nombre` es
 * NOT NULL, nada lo frenaría). Por eso este mapa vive aparte, en el nivel de
 * GRAFÍA CRUDA, no de catálogo de negocio.
 *
 * `gyr`/`gir` (~101 apariciones, coordinador §3.4) NO está en
 * `HatoConfig.razas` -- `parseSX` de `calculosHato.ts` ya lo reconoce
 * (`/gu?ir/i -> 'gyr'`), así que hay precedente en el motor, pero la
 * decisión de si Gyr entra al catálogo de razas del hato es del dueño (se
 * deja como pregunta abierta en el reporte, nunca se agrega aquí en
 * silencio).
 */
const VARIANTES_RAZA: Record<string, string> = {
  holstein: 'holstein',
  holst: 'holstein',
  hols: 'holstein',
  hol: 'holstein',
  jersey: 'jersey',
  jers: 'jersey',
  jer: 'jersey',
  normando: 'normanda',
  normanda: 'normanda',
  norman: 'normanda',
  gir: 'gyr',
  gyr: 'gyr',
};

/** `yaguen`/`fabace` (doc S2 §3) -- D7, decisión del dueño 2026-07-22
 * (resolution-report.md §7): "son nombres de toro reales, no razas; asumir
 * raza jersey." Ya NO es una pregunta abierta -- 'fabace' es además el MISMO
 * toro que 'FABA' en la columna Toro de los chequeos (`ALIAS_TORO`,
 * `parseToro.ts`, D6), un solo catálogo, no dos. La raza se marca ASUMIDA
 * (no confirmada en la planilla) vía `nota`, para no perder que es una
 * decisión del dueño y no un dato leído directamente. */
const TOROS_CONFIRMADOS_PADRE: Readonly<Record<string, { nombre: string; raza: string }>> = {
  yaguen: { nombre: 'Yaguen', raza: 'jersey' },
  fabace: { nombre: 'Fabace', raza: 'jersey' },
};

export function clasificarPadreTernera(fila: FilaTerneraNormalizada): ClasificacionPadreTernera {
  const base = {
    archivo: fila.archivo,
    hoja: fila.hoja,
    fila: fila.fila,
    numero: fila.numero,
    padreRaw: fila.padreRaw,
  };
  const crudo = fila.padreRaw?.trim();
  if (!crudo) return { ...base, clasificacion: 'vacio' };
  const clave = crudo.toLowerCase();
  const toroConfirmado = TOROS_CONFIRMADOS_PADRE[clave];
  if (toroConfirmado) {
    return {
      ...base,
      clasificacion: 'toro_confirmado',
      toroNombre: toroConfirmado.nombre,
      razaDetectada: toroConfirmado.raza,
      nota: `'${crudo}' es el toro ${toroConfirmado.nombre} -- raza ${toroConfirmado.raza} ASUMIDA por decisión del dueño (2026-07-22, resolution-report.md §7), no confirmada en la planilla.`,
    };
  }
  if (VARIANTES_RAZA[clave]) return { ...base, clasificacion: 'raza', razaDetectada: VARIANTES_RAZA[clave] };
  return { ...base, clasificacion: 'toro_no_confirmado' };
}

// ============================================================================
// BLOQUE 9 — Sub-tablas embebidas ("Deben entrar a servicio estas terneras")
// ============================================================================

export interface SubtablaResuelta {
  archivo: string;
  hoja: string;
  fila: number;
  indice: number | null;
  numero: number | null;
  nombre: string | null;
  madreRaw: string | null;
  /** `true` si el `numero` de esta fila coincide con un animal ya visto en
   * TERNERAS o en algún chequeo -- señal de que la sub-tabla referencia un
   * animal real del hato (doc S2 §2.6), no ruido. Nunca decide por sí sola
   * si la fila entra a `hato_animales`. */
  coincideConAnimalConocido: boolean;
}

/** D9 (decisión del dueño, 2026-07-22, resolution-report.md §9): "Son
 * observaciones de 2024, que deben estar resueltas en los siguientes
 * chequeos en 2025. Intentar resolver y si no, ignorar." Una fila de
 * sub-tabla SIN numero ni nombre pero con un fragmento reconocible en
 * `madreRaw` (evidencia real: `CHEQUEO VETE 2024.xlsx :: CHEQUEO AGOSTO
 * 2024, fila 64`, `madreRaw=', verita'`) se intenta resolver contra los
 * NOMBRES vistos en algún chequeo fechado en este umbral o después -- si no
 * aparece ahí, la fila se OMITE de `subtablasResueltas` (el dueño dijo
 * "ignorar" explícitamente; esto no es el descarte-silencioso que el resto
 * del pipeline prohíbe, es una instrucción humana con procedencia
 * documentada acá). */
const UMBRAL_FECHA_RESOLUCION_SUBTABLA = '2025-01-01';

/** Quita puntuación/espacio inicial de un fragmento de `madreRaw` (ej.
 * ', verita' -> 'verita') antes de compararlo contra un nombre conocido. */
function limpiarFragmentoNombreSubtabla(texto: string): string {
  return texto.replace(/^[\s,;.]+/, '').trim();
}

export function resolverSubtablas(
  subtablas: FilaSubtablaNormalizada[],
  terneras: FilaTerneraNormalizada[],
  chequeos: FilaChequeoNormalizada[],
): SubtablaResuelta[] {
  const numerosConocidos = new Set<number>();
  for (const t of terneras) if (t.numero !== null) numerosConocidos.add(t.numero);
  for (const c of chequeos) if (c.numero !== null) numerosConocidos.add(c.numero);

  // D9: nombre -> numero representativo, SOLO de chequeos 2025-01-01 en
  // adelante -- el umbral que fija la propia decisión del dueño ("resueltas
  // en los siguientes chequeos en 2025").
  const numeroPorNombreDesde2025 = new Map<string, number | null>();
  for (const c of chequeos) {
    if (c.chequeoFecha === null || c.chequeoFecha < UMBRAL_FECHA_RESOLUCION_SUBTABLA) continue;
    const nombre = c.nombre?.trim().toUpperCase();
    if (!nombre) continue;
    if (!numeroPorNombreDesde2025.has(nombre)) numeroPorNombreDesde2025.set(nombre, c.numero);
  }

  const resultado: SubtablaResuelta[] = [];
  for (const s of subtablas) {
    if (s.numero !== null || s.nombre !== null) {
      resultado.push({
        archivo: s.archivo,
        hoja: s.hoja,
        fila: s.fila,
        indice: s.indice,
        numero: s.numero,
        nombre: s.nombre,
        madreRaw: s.madreRaw,
        coincideConAnimalConocido: s.numero !== null && numerosConocidos.has(s.numero),
      });
      continue;
    }
    // Sin numero ni nombre (D9): intentar resolver el fragmento de
    // `madreRaw` contra un chequeo 2025+; si no resuelve, se omite del todo.
    const fragmento = s.madreRaw ? limpiarFragmentoNombreSubtabla(s.madreRaw).toUpperCase() : '';
    if (fragmento && numeroPorNombreDesde2025.has(fragmento)) {
      resultado.push({
        archivo: s.archivo,
        hoja: s.hoja,
        fila: s.fila,
        indice: s.indice,
        numero: numeroPorNombreDesde2025.get(fragmento) ?? null,
        nombre: fragmento,
        madreRaw: s.madreRaw,
        coincideConAnimalConocido: true,
      });
    }
    // si no resuelve, se ignora (D9) -- no se agrega ninguna entrada.
  }
  return resultado;
}

// ============================================================================
// BLOQUE 10 — Identidad TERNERAS (nacimientos/genealogía, plan §7.4 F3)
// ============================================================================

/** Busca la fecha resuelta de la hoja (archivo, hoja) en el manifiesto de
 * Extract -- se usa como proxy de "cuándo se tomó esta lectura de TERNERAS"
 * para poder elegir el nombre MÁS RECIENTE cuando el mismo numero aparece en
 * más de una hoja con nombres distintos (§4.4 de la matriz QA). */
function fechaDeHoja(hojas: ManifiestoHoja[], archivo: string, hoja: string): string | null {
  const m = hojas.find((h) => h.archivo === archivo && h.hoja === hoja);
  return m?.chequeoFecha ?? null;
}

export interface TerneraResuelta {
  numero: number;
  /** `null` = ningún registro trae nombre todavía (cría recién nacida sin
   * bautizar, ej. #187-189 en CHEQUEO VETE 2024 -- doc S2 §3). Se preserva
   * como animal existente, nunca se descarta por falta de nombre. */
  nombreVigente: string | null;
  nombresObsoletos: string[];
  fechaNacimiento: string | null;
  fechaNacimientoConfianza: ConfianzaFecha;
  madreRaw: string | null;
  /** No se pudo determinar cronológicamente cuál nombre es más reciente
   * (ninguna hoja involucrada tiene fecha resuelta en el manifiesto) -- el
   * resultado es determinista (primer nombre visto) pero de baja confianza. */
  ordenIncierto: boolean;
  /** Dos filas, MISMA hoja física, mismo numero, nombres distintos -- un
   * animal no puede tener dos nombres en la MISMA lectura; esto no es un
   * renombre, es evidencia de una posible colisión real (como las de
   * chequeos) y debe revisarse aparte, nunca resolverse en silencio. */
  colisionEnMismaHoja: boolean;
}

/**
 * Resuelve identidad dentro de TERNERAS: agrupa por `numero`, prefiere
 * SIEMPRE el nombre más reciente (§4.4 -- nunca se alerta como contradicción
 * a Martha salvo que colisionen dentro de la MISMA hoja), y conserva
 * fecha de nacimiento + madre. El esquema es único en las 7 hojas físicas
 * confirmadas por doc S2 §3 (`índice, #, NOMBRE, F NACIMIENTO, PADRE, MADRE`).
 */
export function resolverTerneras(terneras: FilaTerneraNormalizada[], hojas: ManifiestoHoja[]): TerneraResuelta[] {
  const porNumero = new Map<number, FilaTerneraNormalizada[]>();
  for (const t of terneras) {
    if (t.numero === null) continue;
    if (!porNumero.has(t.numero)) porNumero.set(t.numero, []);
    porNumero.get(t.numero)!.push(t);
  }

  const resultado: TerneraResuelta[] = [];
  for (const [numero, filas] of porNumero) {
    const porHoja = new Map<string, Set<string>>();
    for (const f of filas) {
      const nombre = f.nombre?.trim();
      if (!nombre) continue;
      const clave = `${f.archivo}::${f.hoja}`;
      if (!porHoja.has(clave)) porHoja.set(clave, new Set());
      porHoja.get(clave)!.add(nombre);
    }
    const colisionEnMismaHoja = [...porHoja.values()].some((s) => s.size > 1);

    const conFecha = filas
      .filter((f) => !!f.nombre?.trim())
      .map((f) => ({ nombre: f.nombre!.trim(), fecha: fechaDeHoja(hojas, f.archivo, f.hoja) }))
      .filter((x): x is { nombre: string; fecha: string } => x.fecha !== null);

    const nombresDistintos = [...new Set(filas.map((f) => f.nombre?.trim()).filter((n): n is string => !!n))];

    let nombreVigente: string | null = null;
    let ordenIncierto = false;
    if (conFecha.length > 0) {
      const maxFecha = conFecha.reduce((m, x) => (x.fecha > m ? x.fecha : m), conFecha[0].fecha);
      nombreVigente = conFecha
        .filter((x) => x.fecha === maxFecha)
        .map((x) => x.nombre)
        .sort()[0];
    } else if (nombresDistintos.length > 0) {
      nombreVigente = nombresDistintos[0];
      ordenIncierto = nombresDistintos.length > 1;
    }

    const nombresObsoletos = nombresDistintos.filter((n) => n !== nombreVigente);

    // Fecha de nacimiento: se prefiere la de mayor confianza declarada; a
    // igual confianza, la primera vista (el nacimiento no debería variar
    // entre hojas -- a diferencia del nombre, una discrepancia real aquí es
    // señal de revisar, no de preferir la más nueva).
    const ordenConfianza: Record<ConfianzaFecha, number> = { exacta: 3, aproximada: 2, desconocida: 1 };
    let fechaNacimiento: string | null = null;
    let fechaNacimientoConfianza: ConfianzaFecha = 'desconocida';
    for (const f of filas) {
      if (f.fechaNacimiento === null) continue;
      if (fechaNacimiento === null || ordenConfianza[f.fechaNacimientoConfianza] > ordenConfianza[fechaNacimientoConfianza]) {
        fechaNacimiento = f.fechaNacimiento;
        fechaNacimientoConfianza = f.fechaNacimientoConfianza;
      }
    }

    const madreRaw = filas.map((f) => f.madreRaw?.trim()).find((m): m is string => !!m) ?? null;

    resultado.push({
      numero,
      nombreVigente,
      nombresObsoletos,
      fechaNacimiento,
      fechaNacimientoConfianza,
      madreRaw,
      ordenIncierto,
      colisionEnMismaHoja,
    });
  }
  return resultado.sort((a, b) => a.numero - b.numero);
}

// ============================================================================
// BLOQUE 11 — Ventas inferidas de una fila-comentario (D8)
// ============================================================================

export interface VentaInferidaAplicada {
  venta: VentaInferida;
  /** Numero final sobre el que quedó la venta -- el YA EXISTENTE del animal
   * (DACOTA/INDIRA) o el de trabajo nuevo asignado (CHISPA). */
  numeroFinal: number;
  /** `true` si se creó un animal NUEVO con un numero de trabajo (800-899);
   * `false` si se marcó `vendida` sobre un animal YA EXISTENTE del registro
   * (ver la nota de "DESVIACIÓN" en `ventasInferidas.ts`). */
  huboNumeroNuevo: boolean;
}

export interface ResultadoVentasInferidas {
  animales: AnimalResuelto[];
  aplicadas: VentaInferidaAplicada[];
  /** Ventas cuyo nombre debía resolver a un animal YA EXISTENTE
   * (`numeroAsignado === null`) pero el registro no tiene EXACTAMENTE un
   * animal con ese nombre (0 -> no se encontró; 2+ -> ambiguo) -- nunca se
   * aplica en silencio sobre una base ambigua, se reporta como pendiente. */
  sinAplicar: VentaInferida[];
}

/**
 * Aplica `VENTAS_INFERIDAS` (D8, `ventasInferidas.ts`) al registro YA
 * CONSTRUIDO de animales -- última pasada del orquestador, después de que
 * colisiones/renombres/cierres ya decidieron el registro base. Dos casos por
 * entrada:
 *   - `numeroAsignado !== null` (CHISPA): agrega una fila NUEVA -- esta
 *     identidad nunca existió como fila de animal en `chequeos`/`terneras`,
 *     la venta la origina un comentario suelto.
 *   - `numeroAsignado === null` (DACOTA, INDIRA): busca por NOMBRE
 *     (case-insensitive) un animal YA EXISTENTE en `animales` y lo marca
 *     `vendida` sobre SU número -- nunca mintea uno nuevo (evitaría duplicar
 *     la misma vaca, ver `ventasInferidas.ts`). Si el nombre no resuelve a
 *     EXACTAMENTE un animal, la venta queda en `sinAplicar` -- nunca se
 *     adivina cuál de varios homónimos es.
 */
export function aplicarVentasInferidas(
  animalesBase: AnimalResuelto[],
  ventas: VentaInferida[],
): ResultadoVentasInferidas {
  const animales = animalesBase.map((a) => ({ ...a, notas: [...a.notas], nombresObsoletos: [...a.nombresObsoletos] }));
  const aplicadas: VentaInferidaAplicada[] = [];
  const sinAplicar: VentaInferida[] = [];

  for (const venta of ventas) {
    const notaVenta = `Venta inferida de una fila-comentario (decisión del dueño, ${venta.fecha}): "${venta.comentarioOrigen}" (${venta.archivo} :: ${venta.hoja}, fila ${venta.fila}).`;

    if (venta.numeroAsignado !== null) {
      animales.push({
        numero: venta.numeroAsignado,
        numeroObservado: null,
        nombre: venta.nombre,
        etapaPresunta: 'vaca',
        origen: 'importacion_historica',
        estadoPresunto: 'vendida',
        fechaEstadoPresunta: null,
        fechaNacimiento: null,
        fechaNacimientoConfianza: 'desconocida',
        madreRaw: null,
        confianza: 'baja',
        bloqueadoPorColision: false,
        nombresObsoletos: [],
        notas: [
          `Número de trabajo PROVISIONAL ${venta.numeroAsignado} -- NO es una chapeta física. Identidad ambigua entre varios animales históricos (D8), se numera aparte para no fusionar en silencio -- decisión del dueño, ${venta.fecha}.`,
          notaVenta,
        ],
      });
      aplicadas.push({ venta, numeroFinal: venta.numeroAsignado, huboNumeroNuevo: true });
      continue;
    }

    const candidatos = animales.filter((a) => a.nombre?.trim().toUpperCase() === venta.nombre.trim().toUpperCase());
    if (candidatos.length !== 1) {
      sinAplicar.push(venta);
      continue;
    }
    const animal = candidatos[0];
    animal.estadoPresunto = 'vendida';
    animal.notas.push(notaVenta);
    aplicadas.push({ venta, numeroFinal: animal.numero, huboNumeroNuevo: false });
  }

  return { animales, aplicadas, sinAplicar };
}

// ============================================================================
// BLOQUE 12 — Orquestador: registro de animales (`animales.csv`)
// ============================================================================

export interface AnimalResuelto {
  numero: number;
  /** La chapeta que trae la planilla, SOLO cuando difiere de `numero` porque
   * un `OverrideChapeta` (`overridesChapeta.ts`) reasignó un número de
   * trabajo provisional -- `null` en cualquier otro caso. Un override nunca
   * borra evidencia: `numero` es el de trabajo, `numeroObservado` es lo que
   * dice el Excel, y ambos quedan en `animales.csv`/`import_meta`. */
  numeroObservado: number | null;
  nombre: string | null;
  /** Heurística provisional: 'vaca' si el numero aparece en algún chequeo
   * reproductivo (solo hembras en ciclo entran a esas hojas); 'cria' si solo
   * existe en TERNERAS. Load/UI puede refinar ternera/novilla/vaca con edad
   * + `hato_config` -- eso está fuera del alcance de Resolve. */
  etapaPresunta: 'vaca' | 'cria';
  origen: 'importacion_historica';
  estadoPresunto: 'activa' | 'vendida';
  fechaEstadoPresunta: string | null;
  fechaNacimiento: string | null;
  fechaNacimientoConfianza: ConfianzaFecha;
  madreRaw: string | null;
  confianza: ConfianzaResolucion;
  /** `true` = ESTA FILA NO DEBE CARGARSE hasta que Martha adjudique la
   * colisión vigente sobre este numero. `Load` debe leer este campo y
   * abortar si encuentra CUALQUIER fila con `bloqueadoPorColision=true`. */
  bloqueadoPorColision: boolean;
  nombresObsoletos: string[];
  notas: string[];
}

export interface ResultadoResolucion {
  generadoEn: string;
  totales: {
    lecturasChequeo: number;
    filasChequeo: number;
    filasTerneras: number;
    filasSubtabla: number;
    numerosDistintosChequeo: number;
    numerosDistintosTerneras: number;
  };
  colisiones: ColisionChapetaCorpus[];
  /** Colisiones vigentes que `overridesChapeta.ts` NO cubre por completo --
   * esto es lo único que sigue bloqueando `Load` (ver `verificarOverridesCubrenColisiones`). */
  colisionesSinCubrir: ColisionChapetaCorpus[];
  /** Entradas de `overridesChapeta.ts` que NO le correspondieron a ninguna
   * colisión detectada en esta corrida -- un número de trabajo reservado para
   * un desempate que el pipeline no necesitó hacer. No es un error (puede ser
   * un override escrito a partir de un conteo manual más laxo, o una colisión
   * que dejó de detectarse al mejorar el parser), pero el reporte NO puede
   * presentarlo como un desempate aplicado: eso sería afirmar algo que no
   * ocurrió. Se listan para que se corrijan o se borren. */
  overridesSinUsar: OverrideChapeta[];
  /** Chapetas observadas que tenían una colisión vigente y quedaron
   * COMPLETAMENTE cubiertas por overrides -- ningún animal las usa ya
   * (ambos lados recibieron un número de trabajo distinto). Solo
   * informativo: Martha debe saber que la chapeta física sigue existiendo en
   * el potrero aunque el sistema ya no la use para nadie. */
  numerosLiberadosPorOverride: number[];
  nombresEnVariosNumeros: NombreEnVariosNumeros[];
  renombresResueltos: RenombreResuelto[];
  cierresPresuntos: CierrePresunto[];
  filasSinNumero: Array<{ archivo: string; hoja: string; fila: number; nombre: string | null }>;
  filasSinNombre: Array<{ archivo: string; hoja: string; fila: number; numero: number }>;
  animales: AnimalResuelto[];
  catalogoToros: EntradaCatalogoToro[];
  clasificacionPadresTerneras: ClasificacionPadreTernera[];
  subtablasResueltas: SubtablaResuelta[];
  /** D8: ventas inferidas de una fila-comentario (`ventasInferidas.ts`) ya
   * aplicadas al registro -- informativo, nunca pregunta abierta (la
   * decisión ya se tomó). */
  ventasInferidasAplicadas: VentaInferidaAplicada[];
  /** D8: ventas que NO se pudieron aplicar (nombre ambiguo o no encontrado
   * en el registro) -- a diferencia de `ventasInferidasAplicadas`, esto SÍ
   * necesita revisión humana si llega a aparecer. */
  ventasInferidasSinAplicar: VentaInferida[];
}

/**
 * Orquestador de `Resolve` (plan §7.4 paso 3). Combina todos los bloques
 * anteriores en el registro final de animales + toda la evidencia que
 * `reporte.ts` necesita para `resolution-report.md`. `generadoEn` lo inyecta
 * el caller (nunca `Date.now()` dentro de lógica pura).
 */
export function resolverIdentidadHato(entrada: SalidaNormalizado, generadoEn: string): ResultadoResolucion {
  const { chequeos, terneras, subtablas, hojas } = entrada;

  const colisiones = detectarColisionesCorpus(chequeos);
  // TODA colisión concurrente bloquea el camino de "un solo animal por
  // numero", no solo la que sigue viva en la última lectura -- ver la nota
  // extensa en `resolverRenombres`. El campo `vigente` se conserva porque el
  // reporte lo usa para PRIORIZAR (lo vigente primero), pero no para decidir
  // si un numero tiene uno o dos animales detrás.
  const numerosVigentesBloqueados = new Set(colisiones.map((c) => c.numero));
  const nombresEnVariosNumeros = detectarNombresBajoVariosNumeros(chequeos);
  const renombresResueltos = resolverRenombres(chequeos, colisiones);
  const cierresPresuntos = detectarCierresPresuntos(chequeos, numerosVigentesBloqueados);
  const terneresResueltas = resolverTerneras(terneras, hojas);
  const catalogoToros = construirCatalogoToros(chequeos);
  const clasificacionPadresTerneras = terneras.map(clasificarPadreTernera);
  const subtablasResueltas = resolverSubtablas(subtablas, terneras, chequeos);

  const filasSinNumero = chequeos
    .filter((f) => f.numero === null)
    .map((f) => ({ archivo: f.archivo, hoja: f.hoja, fila: f.fila, nombre: f.nombre }));
  const filasSinNombre = chequeos
    .filter((f): f is FilaChequeoNormalizada & { numero: number } => f.numero !== null && !f.nombre?.trim())
    .map((f) => ({ archivo: f.archivo, hoja: f.hoja, fila: f.fila, numero: f.numero }));

  const renombrePorNumero = new Map(renombresResueltos.map((r) => [r.numero, r]));
  const cierrePorNumero = new Map(cierresPresuntos.map((c) => [c.numero, c]));
  const terneraPorNumero = new Map(terneresResueltas.map((t) => [t.numero, t]));

  const numerosDeChequeo = new Set<number>();
  for (const f of chequeos) if (f.numero !== null) numerosDeChequeo.add(f.numero);

  // numeros de chequeo con UN solo nombre en todo el corpus (sin colisión ni renombre).
  const nombreUnicoPorNumero = new Map<number, string>();
  for (const fila of chequeos) {
    if (fila.numero === null) continue;
    if (numerosVigentesBloqueados.has(fila.numero)) continue;
    if (renombrePorNumero.has(fila.numero)) continue;
    const nombre = fila.nombre?.trim();
    if (!nombre) continue;
    nombreUnicoPorNumero.set(fila.numero, nombre);
  }

  // Se piden overrides para TODAS las colisiones concurrentes, no solo las
  // vigentes: cada una son dos animales reales que necesitan dos numeros
  // distintos para poder existir bajo `hato_animales.numero UNIQUE`.
  const { colisionesNoCubiertas } = verificarOverridesCubrenColisiones(colisiones);
  const numerosNoCubiertos = new Set(colisionesNoCubiertas.map((c) => c.numero));
  const numerosLiberadosPorOverride = colisiones
    .filter((c) => !numerosNoCubiertos.has(c.numero))
    .map((c) => c.numero);

  // Overrides escritos a mano que no le tocaron a ninguna colisión detectada.
  // Se reportan en vez de ignorarse: un número de trabajo listado como
  // "aplicado" cuando no lo fue es exactamente el tipo de afirmación falsa que
  // este pipeline no puede permitirse.
  const paresDetectados = new Set<string>();
  for (const c of colisiones) {
    for (const n of c.nombres) paresDetectados.add(`${c.numero}::${n.trim().toUpperCase()}`);
  }
  const overridesSinUsar = OVERRIDES_CHAPETA.filter(
    (o) => !paresDetectados.has(`${o.numeroObservado}::${o.nombre.trim().toUpperCase()}`),
  );

  const animales: AnimalResuelto[] = [];

  // 1) Numeros con colisión VIGENTE. Dos desenlaces por par, decididos por
  // `verificarOverridesCubrenColisiones` -- NUNCA parcial (todo el par
  // cubierto por overrides, o todo el par bloqueado; jamás "cargar el que sí
  // tiene número" -- ver el comentario de esa función):
  //   (a) TODOS los nombres tienen un override -> cada uno se carga con el
  //       número de TRABAJO asignado, confianza='baja', numeroObservado
  //       preservado -- ya no bloquea Load.
  //   (b) Cualquier nombre sin cubrir -> el par ENTERO sigue bloqueado con
  //       el numero observado, exactamente como antes.
  for (const colision of colisiones) {
    const cubierta = !numerosNoCubiertos.has(colision.numero);
    for (const nombre of colision.nombres) {
      const ternera = terneraPorNumero.get(colision.numero);
      const override = cubierta ? buscarOverride(colision.numero, nombre) : null;
      animales.push({
        numero: override ? override.numeroAsignado : colision.numero,
        numeroObservado: override ? colision.numero : null,
        nombre,
        etapaPresunta: 'vaca',
        origen: 'importacion_historica',
        estadoPresunto: 'activa',
        fechaEstadoPresunta: null,
        fechaNacimiento: ternera?.fechaNacimiento ?? null,
        fechaNacimientoConfianza: ternera?.fechaNacimientoConfianza ?? 'desconocida',
        madreRaw: ternera?.madreRaw ?? null,
        confianza: 'baja',
        bloqueadoPorColision: !override,
        nombresObsoletos: [],
        notas: override
          ? [
              `Número de trabajo PROVISIONAL ${override.numeroAsignado} -- NO es una chapeta física. La planilla dice numero ${colision.numero}. Decidido por ${override.decididoPor} el ${override.fecha}: ${motivoOverride(override)}`,
            ]
          : [
              `Colisión de chapeta VIGENTE (numero ${colision.numero}) -- NO cargar hasta que Martha adjudique cuál animal conserva el número (ver resolution-report.md).`,
            ],
      });
    }
  }

  // 2) Numeros con renombre resuelto (histórico o secuencial, ya no vigente).
  for (const renombre of renombresResueltos) {
    const ternera = terneraPorNumero.get(renombre.numero);
    animales.push({
      numero: renombre.numero,
      numeroObservado: null,
      nombre: renombre.nombreVigente,
      etapaPresunta: numerosDeChequeo.has(renombre.numero) ? 'vaca' : 'cria',
      origen: 'importacion_historica',
      estadoPresunto: cierrePorNumero.has(renombre.numero) ? 'vendida' : 'activa',
      fechaEstadoPresunta: cierrePorNumero.get(renombre.numero)?.fechaCierrePresunta ?? null,
      fechaNacimiento: ternera?.fechaNacimiento ?? null,
      fechaNacimientoConfianza: ternera?.fechaNacimientoConfianza ?? 'desconocida',
      madreRaw: ternera?.madreRaw ?? null,
      confianza: renombre.confianza,
      bloqueadoPorColision: false,
      nombresObsoletos: renombre.nombresObsoletos,
      notas: renombre.fueColisionHistorica
        ? [
            `Nombre '${renombre.nombreVigente}' preferido por ser el más reciente -- este numero coexistió con otro nombre en una lectura anterior, ya convergida (no vigente).`,
          ]
        : [],
    });
  }

  // 3) Numeros de chequeo sin ninguna ambigüedad de nombre.
  for (const [numero, nombre] of nombreUnicoPorNumero) {
    const ternera = terneraPorNumero.get(numero);
    animales.push({
      numero,
      numeroObservado: null,
      nombre,
      etapaPresunta: 'vaca',
      origen: 'importacion_historica',
      estadoPresunto: cierrePorNumero.has(numero) ? 'vendida' : 'activa',
      fechaEstadoPresunta: cierrePorNumero.get(numero)?.fechaCierrePresunta ?? null,
      fechaNacimiento: ternera?.fechaNacimiento ?? null,
      fechaNacimientoConfianza: ternera?.fechaNacimientoConfianza ?? 'desconocida',
      madreRaw: ternera?.madreRaw ?? null,
      confianza: 'alta',
      bloqueadoPorColision: false,
      nombresObsoletos: [],
      notas: [],
    });
  }

  // 4) Numeros que SOLO existen en TERNERAS (crías nunca vistas en chequeo).
  for (const ternera of terneresResueltas) {
    if (numerosDeChequeo.has(ternera.numero)) continue; // ya cubierto arriba
    const notas: string[] = [];
    if (ternera.colisionEnMismaHoja) {
      notas.push(
        `TERNERAS registra dos nombres distintos para el numero ${ternera.numero} DENTRO DE LA MISMA hoja -- no puede ser un simple renombre, revisar con Martha.`,
      );
    }
    if (ternera.ordenIncierto) {
      notas.push(
        `No se pudo determinar cronológicamente cuál nombre es más reciente para el numero ${ternera.numero} (fecha de hoja desconocida) -- se usó '${ternera.nombreVigente}' por orden de aparición, confirmar.`,
      );
    }
    animales.push({
      numero: ternera.numero,
      numeroObservado: null,
      nombre: ternera.nombreVigente,
      etapaPresunta: 'cria',
      origen: 'importacion_historica',
      estadoPresunto: 'activa',
      fechaEstadoPresunta: null,
      fechaNacimiento: ternera.fechaNacimiento,
      fechaNacimientoConfianza: ternera.fechaNacimientoConfianza,
      madreRaw: ternera.madreRaw,
      confianza: ternera.colisionEnMismaHoja || ternera.ordenIncierto ? 'baja' : 'alta',
      bloqueadoPorColision: ternera.colisionEnMismaHoja,
      nombresObsoletos: ternera.nombresObsoletos,
      notas,
    });
  }

  // D8: última pasada -- aplica las ventas inferidas de una fila-comentario
  // sobre el registro YA CONSTRUIDO (necesita que colisiones/renombres/
  // cierres hayan decidido primero, para poder buscar DACOTA/INDIRA por
  // nombre entre animales YA resueltos).
  const { animales: animalesConVentas, aplicadas: ventasInferidasAplicadas, sinAplicar: ventasInferidasSinAplicar } =
    aplicarVentasInferidas(animales, VENTAS_INFERIDAS);

  return {
    generadoEn,
    totales: {
      lecturasChequeo: agruparPorLectura(chequeos).length,
      filasChequeo: chequeos.length,
      filasTerneras: terneras.length,
      filasSubtabla: subtablas.length,
      numerosDistintosChequeo: numerosDeChequeo.size,
      numerosDistintosTerneras: new Set(terneras.map((t) => t.numero).filter((n): n is number => n !== null)).size,
    },
    colisiones,
    colisionesSinCubrir: colisionesNoCubiertas,
    overridesSinUsar,
    numerosLiberadosPorOverride,
    nombresEnVariosNumeros,
    renombresResueltos,
    cierresPresuntos,
    filasSinNumero,
    filasSinNombre,
    animales: animalesConVentas.sort((a, b) => a.numero - b.numero || (a.nombre ?? '').localeCompare(b.nombre ?? '')),
    catalogoToros,
    clasificacionPadresTerneras,
    subtablasResueltas,
    ventasInferidasAplicadas,
    ventasInferidasSinAplicar,
  };
}

// ============================================================================
// BLOQUE 13 — `animales.csv`
// ============================================================================

const COLUMNAS_CSV = [
  'numero',
  'numero_observado',
  'nombre',
  'etapa_presunta',
  'origen',
  'estado_presunto',
  'fecha_estado_presunta',
  'fecha_nacimiento',
  'fecha_nacimiento_confianza',
  'madre_raw',
  'confianza',
  'bloqueado_por_colision',
  'nombres_obsoletos',
  'notas',
] as const;

function csvEscape(valor: string): string {
  if (/[",\n]/.test(valor)) {
    return `"${valor.replace(/"/g, '""')}"`;
  }
  return valor;
}

/**
 * Serializa el registro resuelto a CSV -- el deliverable `animales.csv` del
 * runner `scripts/import-hato/resolve.ts`. Puede contener MÁS DE UNA fila
 * con el mismo `numero` a propósito (los pares con colisión vigente SIN
 * override que la cubra, `bloqueadoPorColision=true`) -- eso preserva la
 * evidencia de ambos animales hasta que Martha adjudique un numero nuevo (o
 * hasta que se agregue un override en `overridesChapeta.ts`). `Load` DEBE
 * rechazar cualquier fila con `bloqueado_por_colision=true`, nunca
 * insertarla. Cuando un override SÍ cubre el par, `numero` es el número de
 * TRABAJO provisional y `numero_observado` conserva la chapeta real de la
 * planilla -- nunca se pierde cuál dato vino de dónde.
 */
export function animalesACsv(animales: AnimalResuelto[]): string {
  const filas = [COLUMNAS_CSV.join(',')];
  for (const a of animales) {
    filas.push(
      [
        String(a.numero),
        a.numeroObservado !== null ? String(a.numeroObservado) : '',
        a.nombre ?? '',
        a.etapaPresunta,
        a.origen,
        a.estadoPresunto,
        a.fechaEstadoPresunta ?? '',
        a.fechaNacimiento ?? '',
        a.fechaNacimientoConfianza,
        a.madreRaw ?? '',
        a.confianza,
        a.bloqueadoPorColision ? 'true' : 'false',
        a.nombresObsoletos.join(' | '),
        a.notas.join(' | '),
      ]
        .map(csvEscape)
        .join(','),
    );
  }
  return filas.join('\n') + '\n';
}
