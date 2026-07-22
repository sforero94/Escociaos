// ARCHIVO: supabase/functions/make-server-1ccce916/importHato/overridesChapeta.ts
// GENERADO por docs/hato/regenerar-copias-importhato.py -- NUNCA edites este
// archivo a mano. Editá `src/utils/importHato/overridesChapeta.ts` y volvé a correr el script.
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

// ARCHIVO: utils/importHato/overridesChapeta.ts
// DESCRIPCIÓN: Reasignaciones MANUALES de chapeta para desempatar colisiones,
// decididas por una persona y no por el pipeline.
//
// ⚠️ TODO NÚMERO DE ESTE ARCHIVO ES PROVISIONAL Y NO CORRESPONDE A UNA CHAPETA
// FÍSICA. Son números de trabajo para poder cargar el histórico mientras el
// dueño decide los definitivos. La chapeta real del animal sigue siendo la que
// lleva puesta en la oreja.
//
// Convención (decisión de Santiago, 2026-07-22): los provisionales se asignan
// **desde 999 hacia atrás**, para que se encuentren de un vistazo cuando entre
// la numeración correcta. Ningún animal real del corpus usa un número >= 500
// (el máximo observado en las 8 planillas 2019-2026 es 442), así que el rango
// 900-999 está libre y es inconfundible.
//
// Por qué existe: `hato_animales.numero` es `INTEGER UNIQUE` en producción
// (migración 053). 12 chapetas están compartidas por 2-3 animales distintos, y
// 2 de esas colisiones siguen vigentes en el hato de julio 2026 (`162`
// ESMERALDA/VITROLA y `175` MONA/MARGARITA). Sin desempatarlas, el `INSERT` de
// la segunda fila de cada par es rechazado por la base y `Load` no corre.
// Evidencia completa: `docs/hato/s3-verificacion-independiente.md` §3.2, §3.6.
//
// REGLA DE DISEÑO — por qué se le asigna número también a los que parecen
// errores de digitación: si `NONA` es un mal tecleo de `MONA`, Martha ve
// "985 NONA" en el reporte, lo reconoce y lo borra en un segundo. Si en cambio
// el pipeline los fusionara solo y `NONA` resultara ser un animal real, nadie
// se enteraría nunca. Fusionar es descartar, y descartar en silencio es
// exactamente lo que el contrato de este pipeline prohíbe. Por eso los
// candidatos a variante ortográfica se marcan (`esVarianteDe`) pero NO se
// fusionan: la fusión es decisión de Martha, no del código.
//
// Cómo cambiarlos después: se edita ESTE archivo y se vuelve a correr la
// importación. `Load` es idempotente sobre `origen='importacion_historica'`,
// así que una re-corrida reemplaza los números anteriores sin dejar huérfanos.
// No hay ningún otro lugar donde estos números estén escritos a mano.
//
// Regla que NO se puede romper: un override jamás borra la evidencia. El animal
// se carga con `confianza='baja'` y con la chapeta observada en la planilla
// guardada en `import_meta`, para que siempre se pueda reconstruir de dónde
// salió y volver atrás.

/** Una reasignación manual de chapeta. `numeroObservado` es lo que dice la
 * planilla; `numeroAsignado` es el número de trabajo que se le da a ESTE animal
 * para poder distinguirlo de los otros que comparten el mismo número. */
export interface OverrideChapeta {
  /** Chapeta tal como aparece en la planilla (la que está en conflicto). */
  numeroObservado: number;
  /** Nombre del animal, en mayúsculas, tal como se resuelve en el corpus.
   * Es lo que discrimina entre los animales que comparten `numeroObservado`. */
  nombre: string;
  /** Número de trabajo asignado. NO es una chapeta física. */
  numeroAsignado: number;
  /** En cuántas hojas de chequeo distintas (por fecha) aparece este nombre con
   * este número. Es la mejor señal de "animal real" vs "error de digitación":
   * 35 hojas a lo largo de 7 años es un animal; 1 sola hoja probablemente no. */
  hojasObservadas: number;
  /** Si el nombre está a ≤2 caracteres de otro nombre de la MISMA colisión,
   * aquí van esos nombres. Candidato a ser el mismo animal mal escrito —
   * **marcado, nunca fusionado automáticamente**. */
  esVarianteDe?: string[];
  /** `true` si este mismo nombre aparece en otra colisión con OTRO número.
   * Suele significar que el número fue mal tecleado una vez, no que existan
   * dos animales homónimos. */
  tambienEnOtraColision?: boolean;
  /** Quién lo decidió y cuándo — procedencia, no adorno. */
  decididoPor: string;
  fecha: string;
  /** Razón en prosa, solo cuando hay algo que decir que no se deduce de los
   * demás campos. Si falta, `motivoOverride()` compone uno con la evidencia
   * que sí está en la fila — así 26 entradas no cargan 26 textos casi iguales
   * que se desincronizan al primer cambio. */
  motivo?: string;
}

/** Texto legible del porqué de un override, para el reporte que revisa Martha
 * y para `import_meta`. Usa el `motivo` explícito si lo hay; si no, compone uno
 * con la evidencia de la propia fila. Nunca devuelve vacío: una reasignación
 * sin explicación es exactamente lo que este archivo existe para evitar. */
export function motivoOverride(o: OverrideChapeta): string {
  if (o.motivo) return o.motivo;
  const partes = [
    `Provisional para destrabar la carga histórica: la chapeta ${o.numeroObservado} está ` +
      `compartida por más de un animal y \`hato_animales.numero\` es UNIQUE.`,
    `Este nombre aparece en ${o.hojasObservadas} ${o.hojasObservadas === 1 ? 'hoja' : 'hojas'} de chequeo.`,
  ];
  if (o.hojasObservadas === 1) {
    partes.push('Una sola hoja: puede ser un error de digitación y no un animal distinto.');
  }
  if (o.esVarianteDe?.length) {
    partes.push(
      `Está a menos de 3 caracteres de ${o.esVarianteDe.join(', ')} — posiblemente el MISMO ` +
        'animal mal escrito. Se numera aparte a propósito: fusionarlos es decisión de Martha, ' +
        'no del pipeline.',
    );
  }
  if (o.tambienEnOtraColision) {
    partes.push(
      'Este mismo nombre aparece en otra colisión con otro número — probablemente el número ' +
        'se tecleó mal una vez, no que existan dos animales homónimos.',
    );
  }
  return partes.join(' ');
}

const DECIDIDO_POR = 'Santiago';
const FECHA = '2026-07-22';

/**
 * Overrides vigentes: 26 animales repartidos en 12 colisiones de chapeta,
 * numerados de 999 hacia atrás hasta 974.
 *
 * `162` (ESMERALDA/VITROLA) y `175` (MONA/MARGARITA) son las dos colisiones
 * **vigentes en el hato actual**; las otras 10 son limpieza histórica. Ninguno
 * de los animales conserva su número original — la decisión fue reasignar a
 * todos los involucrados, de modo que los 12 números originales quedan sin
 * dueño hasta que entre la numeración definitiva.
 */
export const OVERRIDES_CHAPETA: OverrideChapeta[] = [
  // --- Colisiones VIGENTES en CHEQUEO JULIO 2026 -----------------------------
  // Las dos que bloquean la carga del hato actual. Ambas están probadas como
  // dos animales reales: las dos vacas de cada par tienen fila propia en la
  // planilla de leche que Martha mantiene (doc §3.6).
  {
    numeroObservado: 162, nombre: 'ESMERALDA', numeroAsignado: 999, hojasObservadas: 19,
    decididoPor: DECIDIDO_POR, fecha: FECHA,
    motivo:
      'Colisión VIGENTE en el hato actual. ESMERALDA y VITROLA son dos animales reales ' +
      'distintos, no un error de digitación: ambas tienen fila propia en la planilla de leche ' +
      'de junio 2026 que mantiene Martha (ESMERALDA con litros, VITROLA seca). Ninguna de las ' +
      'dos conserva el 162 por ahora; cuál se queda con la chapeta física se decide con ella.',
  },
  {
    numeroObservado: 162, nombre: 'VITROLA', numeroAsignado: 998, hojasObservadas: 10,
    decididoPor: DECIDIDO_POR, fecha: FECHA,
    motivo: 'Colisión VIGENTE. Mismo par que ESMERALDA — ver el motivo de esa fila.',
  },
  {
    numeroObservado: 175, nombre: 'MARGARITA', numeroAsignado: 987, hojasObservadas: 5,
    decididoPor: DECIDIDO_POR, fecha: FECHA,
    motivo:
      'Colisión VIGENTE en el hato actual. MARGARITA es una de las 4 vacas del chequeo de ' +
      'julio 2026 que NO aparece en la planilla de leche (probablemente seca), mientras MONA ' +
      'sí produce — se comportan como dos animales distintos.',
  },
  { numeroObservado: 175, nombre: 'MONA', numeroAsignado: 986, hojasObservadas: 18, esVarianteDe: ['NONA'], decididoPor: DECIDIDO_POR, fecha: FECHA },
  { numeroObservado: 175, nombre: 'NONA', numeroAsignado: 985, hojasObservadas: 1, esVarianteDe: ['MONA'], decididoPor: DECIDIDO_POR, fecha: FECHA },

  // --- Colisiones históricas (no bloquean el hato actual) --------------------
  // #43 es el caso más fuerte del corpus: dos nombres conviviendo 7 años.
  { numeroObservado: 43, nombre: 'CUÑA', numeroAsignado: 997, hojasObservadas: 35, decididoPor: DECIDIDO_POR, fecha: FECHA },
  { numeroObservado: 43, nombre: 'MONTAÑA', numeroAsignado: 996, hojasObservadas: 25, decididoPor: DECIDIDO_POR, fecha: FECHA },

  { numeroObservado: 113, nombre: 'ALTANERA', numeroAsignado: 995, hojasObservadas: 14, decididoPor: DECIDIDO_POR, fecha: FECHA },
  { numeroObservado: 113, nombre: 'FLAUTA', numeroAsignado: 994, hojasObservadas: 7, decididoPor: DECIDIDO_POR, fecha: FECHA },

  { numeroObservado: 116, nombre: 'FABIOLA', numeroAsignado: 993, hojasObservadas: 1, tambienEnOtraColision: true, decididoPor: DECIDIDO_POR, fecha: FECHA },
  { numeroObservado: 116, nombre: 'NODRIZA', numeroAsignado: 992, hojasObservadas: 20, decididoPor: DECIDIDO_POR, fecha: FECHA },

  { numeroObservado: 151, nombre: 'CHAMPAÑA', numeroAsignado: 991, hojasObservadas: 4, tambienEnOtraColision: true, decididoPor: DECIDIDO_POR, fecha: FECHA },
  { numeroObservado: 151, nombre: 'VENUS', numeroAsignado: 990, hojasObservadas: 16, decididoPor: DECIDIDO_POR, fecha: FECHA },

  { numeroObservado: 158, nombre: 'CARMENZA', numeroAsignado: 989, hojasObservadas: 4, esVarianteDe: ['CARMIÑA'], decididoPor: DECIDIDO_POR, fecha: FECHA },
  { numeroObservado: 158, nombre: 'CARMIÑA', numeroAsignado: 988, hojasObservadas: 4, esVarianteDe: ['CARMENZA'], decididoPor: DECIDIDO_POR, fecha: FECHA },

  { numeroObservado: 176, nombre: 'FABIOLA', numeroAsignado: 984, hojasObservadas: 18, tambienEnOtraColision: true, decididoPor: DECIDIDO_POR, fecha: FECHA },
  { numeroObservado: 176, nombre: 'INDIRA', numeroAsignado: 983, hojasObservadas: 4, decididoPor: DECIDIDO_POR, fecha: FECHA },

  { numeroObservado: 179, nombre: 'FAUSTINA', numeroAsignado: 982, hojasObservadas: 3, decididoPor: DECIDIDO_POR, fecha: FECHA },
  { numeroObservado: 179, nombre: 'TANIA', numeroAsignado: 981, hojasObservadas: 1, decididoPor: DECIDIDO_POR, fecha: FECHA },

  { numeroObservado: 181, nombre: 'MARACA', numeroAsignado: 980, hojasObservadas: 10, decididoPor: DECIDIDO_POR, fecha: FECHA },
  { numeroObservado: 181, nombre: 'MARIBEL', numeroAsignado: 979, hojasObservadas: 3, decididoPor: DECIDIDO_POR, fecha: FECHA },

  { numeroObservado: 182, nombre: 'FLACA', numeroAsignado: 978, hojasObservadas: 17, decididoPor: DECIDIDO_POR, fecha: FECHA },
  { numeroObservado: 182, nombre: 'FRESA', numeroAsignado: 977, hojasObservadas: 2, esVarianteDe: ['FRESIA'], decididoPor: DECIDIDO_POR, fecha: FECHA },
  { numeroObservado: 182, nombre: 'FRESIA', numeroAsignado: 976, hojasObservadas: 1, esVarianteDe: ['FRESA'], decididoPor: DECIDIDO_POR, fecha: FECHA },

  { numeroObservado: 183, nombre: 'CHAMPAÑA', numeroAsignado: 975, hojasObservadas: 3, esVarianteDe: ['CHAMPETA'], tambienEnOtraColision: true, decididoPor: DECIDIDO_POR, fecha: FECHA },
  { numeroObservado: 183, nombre: 'CHAMPETA', numeroAsignado: 974, hojasObservadas: 1, esVarianteDe: ['CHAMPAÑA'], decididoPor: DECIDIDO_POR, fecha: FECHA },
];

/** Números de trabajo reservados para overrides/decisiones provisionales.
 * Ningún animal real del corpus usa un número en este rango: el máximo
 * observado en las 8 planillas (2019-2026) es 442.
 *
 * Dos sub-rangos, cada uno con su propio propósito (D8, decisión del dueño
 * 2026-07-22, resolution-report.md §8, extiende el rango original de este
 * archivo hacia abajo):
 *   - **900-999**: desempates de colisiones de chapeta (`OVERRIDES_CHAPETA`,
 *     arriba). Se verificó libre antes de asignarlo.
 *   - **800-899**: ventas inferidas de una fila-comentario / identidad
 *     ambigua sin chapeta propia (`ventasInferidas.ts`) -- ej. CHISPA (D8):
 *     un nombre que aparece en un comentario de venta pero no resuelve sin
 *     ambigüedad a ningún animal existente del registro. Mismo régimen que
 *     900-999: número de TRABAJO, nunca una chapeta física.
 */
export const RANGO_NUMEROS_PROVISIONALES = { min: 800, max: 999 } as const;

/** `true` si el número es de trabajo y no una chapeta física. La UI debe
 * marcarlos de forma visible (S4) para que nadie salga a buscar la caravana
 * 999 en el potrero. */
export function esNumeroProvisional(numero: number | null): boolean {
  if (numero === null) return false;
  return numero >= RANGO_NUMEROS_PROVISIONALES.min && numero <= RANGO_NUMEROS_PROVISIONALES.max;
}

/** Busca el override que aplica a un (numero, nombre) observado en la planilla.
 * Compara el nombre sin distinguir mayúsculas ni espacios sobrantes, que es
 * como vienen en la planilla. */
export function buscarOverride(
  numeroObservado: number | null,
  nombre: string | null,
): OverrideChapeta | null {
  if (numeroObservado === null || nombre === null) return null;
  const clave = nombre.trim().toUpperCase();
  return (
    OVERRIDES_CHAPETA.find(
      (o) => o.numeroObservado === numeroObservado && o.nombre.trim().toUpperCase() === clave,
    ) ?? null
  );
}

/** Chapetas observadas que este archivo desempata. `Load` la usa para
 * verificar que no queda ninguna colisión vigente sin cubrir antes de correr. */
export function chapetasConOverride(): Set<number> {
  return new Set(OVERRIDES_CHAPETA.map((o) => o.numeroObservado));
}
