// ARCHIVO: utils/hatoCategorias.ts
// DESCRIPCIÓN: Clasificación de un animal del hato en las TRES categorías
// que el dueño pidió explícitamente para la vista de inventario de S4
// (decisión del dueño, segunda ronda, 2026-07-22 -- plan
// docs/plan_hato_lechero_module.md §8: "El hato tiene tres categorías:
// terneras, hato (en ordeño) y horro (secas próximas a parir) -- el
// inventario y la vista de S4 deben mostrar esas tres").
//
// Puro: compone sobre `EstadoReproductivo`, que YA calcula
// `derivarEstadoReproductivo` en `calculosHato.ts` (motor protegido por
// paridad byte-idéntica con el servidor, S2) -- este archivo NO reimplementa
// ni reinterpreta ese cálculo, solo lo traduce a las 3 etiquetas de producto
// que pidió el dueño. Vive fuera de calculosHato.ts a propósito: agregar
// aquí una constante de negocio no requeriría tocar los 3 archivos
// protegidos por `calculosHatoParidad.test.ts` cada vez que cambie la
// definición de "horro" o "hato" a nivel de UI.
//
// REGLA CONFIRMADA POR EL DUEÑO (tercera ronda, 2026-07-22): CUATRO
// categorías, no tres -- terneras y novillas van separadas ("it was my
// oversight", palabras del dueño). Regla unificada con
// `hato-aggregation.ts` del servidor -- Esco y la UI deben dar siempre el
// mismo conteo:
//   - ternera  -- etapa 'ternera': cría.
//   - novilla  -- etapa 'novilla': en levante, aún no ha parido ni ha
//     estado en ordeño.
//   - horro    -- vaca cuyo estado reproductivo derivado sea 'seca'
//     (masReciente === 'secado_real', ver `derivarEstadoReproductivo`) --
//     es decir, YA se secó y espera parto. Un animal 'proxima_a_secar'
//     (todavía en ordeño, dentro de la ventana de aviso) se queda en
//     "hato" hasta que el secado se confirme -- lectura confirmada por el
//     dueño en la misma ronda.
//   - hato     -- toda otra vaca activa (servida, preñada, parida_reciente,
//     vacia_por_servir, indeterminado): sigue en ordeño.
//   - null     -- estados terminales (vendida/muerta/descartada): no
//     pertenecen a ninguna categoría del inventario vivo.
// Cambiar un límite exige tocar este archivo Y `categorizarAnimal` en
// ambas copias de `hato-aggregation.ts`.

import type { EtapaHato } from '@/types/hato';
import {
  derivarEstadoReproductivo,
  type EstadoActualHatoRow,
  type EstadoReproductivo,
  type EstadoReproductivoDerivado,
  type HatoConfig,
} from '@/utils/calculosHato';

export type CategoriaHato = 'ternera' | 'novilla' | 'hato' | 'horro';

export function clasificarCategoriaHato(
  etapa: EtapaHato,
  estadoReproductivo: EstadoReproductivo,
): CategoriaHato | null {
  if (
    estadoReproductivo === 'vendida' ||
    estadoReproductivo === 'muerta' ||
    estadoReproductivo === 'descartada'
  ) {
    return null;
  }
  if (etapa === 'ternera') return 'ternera';
  if (etapa === 'novilla') return 'novilla';
  if (estadoReproductivo === 'seca') return 'horro';
  return 'hato';
}

export const LABEL_CATEGORIA_HATO: Record<CategoriaHato, string> = {
  ternera: 'Terneras',
  novilla: 'Novillas',
  hato: 'Hato (en ordeño)',
  horro: 'Horro (secas)',
};

// ============================================================================
// S6 (D-13, docs/plan_hato_ronda_agosto_2026.md §0/§4) -- categorías
// CALCULADAS con override manual fácil.
//
// Hasta acá, `clasificarCategoriaHato` confiaba en `etapa` (campo manual de
// `hato_animales`, editable desde `EditarAnimalDialog`) como dato de
// entrada. D-13 pide que ternera/novilla/vaca se DERIVEN de
// `fecha_nacimiento` + `num_partos` -- `clasificarCategoriaHato` en sí NO
// cambia (sigue resolviendo hato/horro sobre una etapa YA resuelta, y ese
// contrato lo prueban los tests de arriba); lo que cambia es QUÉ etapa se le
// pasa. `calcularEtapaHato` (abajo) es ese paso previo, y `etapa` pasa de
// "la fuente" a "el override manual" -- exactamente la UI que ya existe
// (`EditarAnimalDialog`) sin construir nada nuevo.
//
// CORRECCIÓN DE PRECEDENCIA (2026-08-06, decisión del dueño tras revisar el
// resultado de S6, migración 092): la primera versión de esta función hacía
// que el cálculo mandara SIEMPRE que se pudiera calcular, y el override
// manual solo se usara cuando la edad no se podía resolver (fecha ausente o
// imposible). Eso deja sin arreglo el caso más probable de falla: una
// `fecha_nacimiento` PRESENTE pero mal digitada -- el cálculo la toma como
// buena y no hay forma de corregir la categoría, ni siquiera editando
// `etapa` desde `EditarAnimalDialog` (el cambio se guardaba y no tenía
// ningún efecto visible). Decisión del dueño: "calculado, pero editable por
// si algo falla, de fácil override" -- el valor manual, cuando se fija
// EXPLÍCITAMENTE (columna `etapa_forzada`, migración 092), GANA sobre el
// cálculo. Reglas (D-13, ya con la corrección):
//   - `etapaForzada === true`: gana SIEMPRE el override manual
//     (`etapaManual`), sin importar num_partos ni fecha_nacimiento -- es la
//     salida explícita que el dueño pidió para cuando el cálculo se
//     equivoca.
//   - `etapaForzada === false` y num_partos >= 1: SIEMPRE "vaca" -- las
//     vacas se definen por el 1er parto, nunca por edad (cobertura de
//     fecha_nacimiento en vacas: 20/35 en producción, D-13 documenta por
//     qué ese hueco no afecta esta regla).
//   - `etapaForzada === false`, sin partos, con fecha_nacimiento parseable
//     y no futura: ternera (< meses_ternera_max) o novilla. La ternera se
//     subdivide en dos GRUPOS CONTABLES separados (leche / concentrado,
//     corte meses_ternera_leche_max) -- para poder costear concentrado más
//     adelante (fuera de alcance de esta ronda construir esa herramienta).
//   - `etapaForzada === false`, sin partos y SIN fecha_nacimiento utilizable
//     (ausente o "mala" -- ej. una fecha futura): el cálculo no puede
//     resolver la edad, así que se cae al override manual (`etapaManual`) --
//     mismo comportamiento que antes de esta corrección. Nunca se inventa
//     una edad ni se asume un valor por defecto.
//
// Toca la misma regla en `categorizarAnimal` (hato-aggregation.ts, las DOS
// copias de Esco) EN EL MISMO COMMIT -- la UI y Esco nunca pueden discrepar
// en el mismo conteo. Esas copias implementan la MISMA lógica de forma
// independiente (nunca importan `hatoCategorias.ts`, cruzarían la frontera
// del árbol de despliegue de Deno -- mismo patrón que
// `hatoProduccion.ts::resolverLitrosQuincenal` / `hato-aggregation.ts` del
// mismo nombre).
// ============================================================================

/** Los dos grupos contables dentro de "ternera" (D-13): 0-3 meses = etapa de
 * leche, 3-12 meses = etapa de concentrado. Puramente informativo hoy --
 * ningún consumidor existente lo usa todavía (la herramienta de Esco para
 * proyectar consumo de concentrado está fuera de alcance de esta ronda). */
export type SubetapaTernera = 'leche' | 'concentrado';

/** Los 2 umbrales de edad (meses) que gobiernan D-13, sembrados por la
 * migración 089. Nunca una constante de código -- misma regla dura que
 * `HatoConfig` (`calculosHato.ts`). Vive FUERA de `HatoConfig` a propósito
 * (misma razón que este archivo entero vive fuera de `calculosHato.ts`,
 * ver cabecera del archivo): agregar una clave aquí no debe tocar los 3
 * archivos protegidos por `calculosHatoParidad.test.ts`. */
export interface UmbralesCategoriaHato {
  /** Techo (EXCLUSIVO) de meses para que una ternera cuente como "leche" en
   * vez de "concentrado". */
  meses_ternera_leche_max: number;
  /** Techo (EXCLUSIVO) de meses para que un animal sin partos siga siendo
   * "ternera" en vez de pasar a "novilla". */
  meses_ternera_max: number;
}

const CLAVES_UMBRALES_CATEGORIA: ReadonlyArray<keyof UmbralesCategoriaHato> = [
  'meses_ternera_leche_max',
  'meses_ternera_max',
];

/** Una fila cruda de `hato_config`: `clave text`, `valor jsonb`. Mismo
 * shape que `FilaHatoConfig` (`hatoConfigDesdeTabla.ts`) -- no se importa
 * ese tipo para no acoplar este lector, deliberadamente pequeño y fuera del
 * contrato de `HatoConfig`, al archivo que sí está protegido por paridad. */
export interface FilaConfigClaveValor {
  clave: string;
  valor: unknown;
}

/**
 * Construye `UmbralesCategoriaHato` a partir de las filas de `hato_config`.
 * Mismo contrato duro que `construirHatoConfigDesdeFilas`: lanza un único
 * `Error` listando TODAS las claves faltantes/mal tipadas de una vez, nunca
 * un default inventado en código.
 */
export function construirUmbralesCategoriaHatoDesdeFilas(
  filas: FilaConfigClaveValor[],
): UmbralesCategoriaHato {
  const porClave = new Map<string, unknown>(filas.map((f) => [f.clave, f.valor]));
  const errores: string[] = [];

  const clavesFaltantes = CLAVES_UMBRALES_CATEGORIA.filter((c) => !porClave.has(c));
  if (clavesFaltantes.length > 0) {
    throw new Error(
      `hato_config no trae ${clavesFaltantes.length} clave(s) requerida(s) para categorías calculadas (D-13): ${clavesFaltantes.join(', ')}. ` +
        'Verificar que la migración 089 se aplicó en este entorno -- el motor nunca usa un default inventado en código.',
    );
  }

  const resultado = {} as Record<(typeof CLAVES_UMBRALES_CATEGORIA)[number], number>;
  for (const clave of CLAVES_UMBRALES_CATEGORIA) {
    const valor = porClave.get(clave);
    if (typeof valor !== 'number' || !Number.isFinite(valor)) {
      errores.push(`hato_config.${clave} debería ser numérico, llegó: ${JSON.stringify(valor)}`);
      continue;
    }
    resultado[clave] = valor;
  }

  if (errores.length > 0) {
    throw new Error(`hato_config tiene valores inválidos:\n- ${errores.join('\n- ')}`);
  }

  return resultado as UmbralesCategoriaHato;
}

/**
 * Edad en meses COMPLETOS entre `fechaNacimiento` y `fechaReferencia`
 * (ambas `yyyy-mm-dd`, o un prefijo de timestamp). `null` si
 * `fechaNacimiento` está ausente, no se puede parsear, o es una fecha
 * FUTURA respecto a `fechaReferencia` (dato imposible -- "mala fecha de
 * nacimiento" en la letra de D-13). Nunca negativo, nunca inventa una edad.
 */
export function calcularEdadMeses(fechaNacimiento: string | null, fechaReferencia: string): number | null {
  if (!fechaNacimiento) return null;
  const nac = /^(\d{4})-(\d{2})-(\d{2})/.exec(fechaNacimiento);
  const ref = /^(\d{4})-(\d{2})-(\d{2})/.exec(fechaReferencia);
  if (!nac || !ref) return null;

  const anioNac = Number(nac[1]);
  const mesNac = Number(nac[2]);
  const diaNac = Number(nac[3]);
  const anioRef = Number(ref[1]);
  const mesRef = Number(ref[2]);
  const diaRef = Number(ref[3]);

  const nacUTC = Date.UTC(anioNac, mesNac - 1, diaNac);
  const refUTC = Date.UTC(anioRef, mesRef - 1, diaRef);
  if (Number.isNaN(nacUTC) || Number.isNaN(refUTC)) return null;
  if (nacUTC > refUTC) return null;

  let meses = (anioRef - anioNac) * 12 + (mesRef - mesNac);
  if (diaRef < diaNac) meses -= 1;
  return Math.max(0, meses);
}

/** Subgrupo contable de una ternera cuya edad SÍ se pudo calcular (D-13).
 * El corte es estrictamente menor que `meses_ternera_leche_max` -- al
 * cumplir el umbral ya cuenta como "concentrado". */
export function calcularSubetapaTernera(edadMeses: number, umbrales: UmbralesCategoriaHato): SubetapaTernera {
  return edadMeses < umbrales.meses_ternera_leche_max ? 'leche' : 'concentrado';
}

/** Resultado de resolver la etapa efectiva de un animal (D-13): la etapa
 * que de verdad gobierna su categoría, de dónde salió (`calculado` o
 * `override_manual` -- este último cubre TANTO el override forzado
 * explícitamente (`etapaForzada`) COMO el fallback de siempre cuando el
 * cálculo no puede resolver la edad; en ambos casos "lo decidió el campo
 * manual", que es lo único que un consumidor de este resultado necesita
 * saber. Si algún día un consumidor necesita distinguir CUÁL de los dos
 * casos ocurrió, la fuente de esa distinción es `etapaForzada` en el
 * animal, no este campo), y su subgrupo contable si aplica. */
export interface EtapaCalculada {
  etapa: EtapaHato;
  origen: 'calculado' | 'override_manual';
  subetapaTernera: SubetapaTernera | null;
}

/**
 * Resuelve la etapa EFECTIVA de un animal (D-13, corregida 2026-08-06 --
 * ver la nota de precedencia arriba en el archivo): si `etapaForzada` es
 * `true`, gana SIEMPRE `etapaManual` (el campo `etapa` de `hato_animales`,
 * fijado explícitamente desde `EditarAnimalDialog`); si no, se calcula de
 * `num_partos`/`fecha_nacimiento` cuando es posible, con `etapaManual` como
 * fallback cuando el cálculo no puede resolver la edad.
 *
 * El resultado alimenta `clasificarCategoriaHato(resultado.etapa, ...)` --
 * esa función no cambia, solo deja de recibir `fila.etapa` directo.
 */
export function calcularEtapaHato(
  etapaManual: EtapaHato,
  etapaForzada: boolean,
  numPartos: number,
  fechaNacimiento: string | null,
  umbrales: UmbralesCategoriaHato,
  fechaReferencia: string,
): EtapaCalculada {
  if (etapaForzada) {
    // Override explícito (migración 092): gana SIEMPRE, sin mirar
    // num_partos ni fecha_nacimiento -- es la salida que el dueño pidió
    // para cuando el cálculo se equivoca (típicamente una
    // fecha_nacimiento mal digitada que el cálculo no puede distinguir de
    // una buena).
    return { etapa: etapaManual, origen: 'override_manual', subetapaTernera: null };
  }

  if (numPartos >= 1) {
    return { etapa: 'vaca', origen: 'calculado', subetapaTernera: null };
  }

  const edadMeses = calcularEdadMeses(fechaNacimiento, fechaReferencia);
  if (edadMeses === null) {
    // El cálculo falló (D-13: "fecha de nacimiento ausente o mala") --
    // override manual fácil: se respeta la etapa ya editable hoy.
    return { etapa: etapaManual, origen: 'override_manual', subetapaTernera: null };
  }

  if (edadMeses < umbrales.meses_ternera_max) {
    return {
      etapa: 'ternera',
      origen: 'calculado',
      subetapaTernera: calcularSubetapaTernera(edadMeses, umbrales),
    };
  }

  return { etapa: 'novilla', origen: 'calculado', subetapaTernera: null };
}

// ============================================================================
// Bugfix (2026-08-06, reportado en /hato-lechero/hato) -- reconciliación
// chip/pestaña.
//
// Causa raíz verificada: `useHatoAnimales.ts` llamaba
// `derivarEstadoReproductivo` con la fila CRUDA de la vista (`fila.etapa`,
// el campo MANUAL) para decidir el chip de estado, pero recién DESPUÉS
// calculaba `calcularEtapaHato(...)` para decidir en qué pestaña
// (terneras/novillas/hato/horro) cae el animal. Como
// `derivarEstadoReproductivo` también lee `fila.etapa` en dos puntos (el
// corto-circuito "ternera" -> `cria`, y "sin candidatos" -> `novilla`), un
// animal con `etapa` manual todavía en "novilla" pero cuya edad calculada
// (D-13) ya lo pone en "ternera" mostraba el chip "Novilla" DENTRO de la
// pestaña "Terneras" -- seis animales así, verificados en producción.
//
// Arreglo: calcular la etapa EFECTIVA primero y alimentar el motor con
// ESA, nunca con la cruda -- `derivarEstadoReproductivo` en sí NO se toca
// (protegido por paridad byte-idéntica con el servidor, S2); lo único que
// cambia es qué etapa se le pasa, exactamente igual que ya hacía
// `clasificarCategoriaHato(etapaCalculada.etapa, ...)`.
//
// `clasificarAnimalHato` es el ÚNICO punto de entrada que
// `useHatoAnimales.ts` debe usar de ahora en adelante -- nunca llamar
// `derivarEstadoReproductivo` directo con una fila de
// `v_hato_estado_actual` sin pasar antes por acá. El mismo arreglo se
// replicó, independientemente (nunca el mismo import, cruzaría la
// frontera del árbol de despliegue de Deno), en `categorizarAnimal` /
// `buildReproduccionSummary` de las DOS copias de `hato-aggregation.ts`
// (Esco) -- la UI y Esco no pueden discrepar en el mismo conteo.
// ============================================================================

/** Fila de hechos que necesita `clasificarAnimalHato`: el subconjunto que
 * consume `derivarEstadoReproductivo` (`EstadoActualHatoRow`,
 * `calculosHato.ts`) más las dos columnas que gobiernan D-13
 * (`fecha_nacimiento`, `etapa_forzada`). `EstadoActualHatoViewRow` (la fila
 * cruda de `v_hato_estado_actual`, `types/hato.ts`) ya cumple esta forma
 * sin conversión -- se le puede pasar directo. */
export type FilaClasificacionHato = EstadoActualHatoRow & {
  fecha_nacimiento: string | null;
  etapa_forzada: boolean;
};

export interface AnimalHatoClasificado {
  /** Estado reproductivo derivado con la etapa YA EFECTIVA (D-13) -- nunca
   * con la etapa manual cruda. Es lo que alimenta el chip de estado. */
  derivado: EstadoReproductivoDerivado;
  /** Categoría de inventario (pestaña). Misma etapa efectiva que decidió
   * `derivado`, así que las dos NUNCA pueden discrepar. */
  categoria: CategoriaHato | null;
  categoriaOrigen: 'calculado' | 'override_manual' | null;
  subetapaTernera: SubetapaTernera | null;
}

/**
 * Reconciliación única chip/pestaña: resuelve la etapa EFECTIVA
 * (`calcularEtapaHato`) y alimenta `derivarEstadoReproductivo` con esa
 * misma etapa -- nunca con `fila.etapa` cruda. El estado reproductivo
 * (chip) y la categoría de inventario (pestaña) siempre salen de la misma
 * fuente, así que nunca pueden contradecirse.
 */
export function clasificarAnimalHato(
  fila: FilaClasificacionHato,
  config: HatoConfig,
  umbrales: UmbralesCategoriaHato,
  fechaReferencia: string,
): AnimalHatoClasificado {
  const etapaCalculada = calcularEtapaHato(
    fila.etapa,
    fila.etapa_forzada,
    fila.num_partos,
    fila.fecha_nacimiento,
    umbrales,
    fechaReferencia,
  );
  const derivado = derivarEstadoReproductivo({ ...fila, etapa: etapaCalculada.etapa }, config, fechaReferencia);
  const categoria = clasificarCategoriaHato(etapaCalculada.etapa, derivado.estado);
  return {
    derivado,
    categoria,
    categoriaOrigen: categoria === null ? null : etapaCalculada.origen,
    subetapaTernera: categoria === 'ternera' ? etapaCalculada.subetapaTernera : null,
  };
}
