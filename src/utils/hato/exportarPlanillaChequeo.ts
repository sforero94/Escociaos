// ARCHIVO: utils/hato/exportarPlanillaChequeo.ts
// DESCRIPCIÓN: B5 (docs/hato/sesiones-b5-d7-e3.md, Session A). Construye el
// libro `.xlsx` de la planilla de chequeo -- MISMO template para las dos
// direcciones del round-trip de D-4 ("la app PRINTS a pre-filled planilla ->
// el vet la llena en papel -> alguien actualiza el .xlsx -> se sube -> se
// parsea/diffea/aprueba", el flujo B0/V10 ya existente):
//
//   B5.1 -- planilla del PRÓXIMO chequeo, pre-llenada con identidad +
//           último estado conocido. Desde la Fase 1 de
//           `docs/plan_chequeo_captura_foto.md` eso incluye Sexo cría,
//           Fecha Servicio, Toro y Estado -- ya NO quedan en blanco: la
//           planilla es INCREMENTAL, arrastra lo que el sistema sabe para
//           que Martha solo anote lo que cambió. La única columna que sigue
//           saliendo siempre vacía es `Tratamiento` (no hay de dónde
//           arrastrarla: los tratamientos viven en `hato_tratamientos`, otro
//           flujo). Una celda sin dato previo sale vacía, nunca con un valor
//           inventado.
//   B5.2 -- planilla de un chequeo YA CARGADO, totalmente poblada
//           (record-keeping).
//
// Las celdas pre-llenadas se escriben en la MISMA forma CRUDA que el parser
// de subida reconoce (`textoCeldaToro` reconstruye el prefijo `Toro `/`Ins `,
// `textoCeldaEstado` devuelve `ok`/`rech`, `Sexo cría` lleva el `sx_raw`
// verbatim): este `.xlsx` es el artefacto de MÁQUINA y debe seguir siendo
// re-parseable sin enseñarle alias nuevos a `importHato/`. Las etiquetas
// legibles ("Hembra (retenida #206)") son del PDF imprimible, otro artefacto
// y otra fase del plan.
//
// Las 13 columnas históricas menos `TP` (fórmula `TODAY()` congelada que el
// motor nunca lee, ver `calculosHato.ts`) -- decisión del dueño
// (docs/hato/sesiones-b5-d7-e3.md): las abreviaturas se escriben completas
// (`SX`->`Sexo cría`, `TTTO`->`Tratamiento`, `PP`->`Parto Probable`,
// `#P`->`# Partos`, `F Servicio`->`Fecha Servicio`; `Última Cría`/`Toro`/
// `Estado`/`Secar`/`Nombre`/`PL`/`#` quedan igual). El parser de subida
// (`importHato/grilla.ts`) aprende estos headers como alias adicionales de
// SU PROPIO formato (B5.3) sin tocar los alias de las 3 generaciones
// históricas -- ver la nota en ese archivo.
//
// El AOA es puro; el constructor async serializa con el adaptador compartido.
// La descarga espera los bytes y propaga errores a los componentes.
// Los tests verifican XML, lectura de bytes y normalización/diff de extremo a extremo.
//
// Nunca repite la fila de encabezado a mitad de hoja -- estructura fija:
// fila 0 = título (fecha del chequeo, la MISMA lógica que `parseFechaChequeo`
// espera leer), fila 1 = encabezado, fila 2+ = datos, una sola tabla
// continua (requisito duro de B5.1: "nunca repetir el header, rompe la
// extracción del parser de subida").

import { textoEstadoReproductivoConMeses, type EstadoReproductivo, type TipoEstado } from '@/utils/calculosHato';

/** Las 13 columnas del template (13 históricas menos `TP`, más "Estado
 * registrado" de B5.4 -- D-E, docs/plan_hato_telegram_estados_agosto_2026.md
 * N21-N22), en orden, con las abreviaturas desarrolladas (decisión del
 * dueño). Única fuente de verdad del header -- tanto el armado del AOA como
 * los tests la reutilizan, nunca se repite el arreglo literal en dos sitios.
 *
 * "Estado registrado" va ANTES de "Estado" a propósito: primero lo que el
 * sistema cree (referencia, gris), después la columna donde Martha lo
 * verifica (ok/rech/nota). Es el mecanismo de sincronía de D-E -- la monta
 * que Fernando registró por Telegram en agosto llega impresa al papel de la
 * vet en agosto, para que lo confirme o lo corrija en vez de transcribirlo
 * de memoria. */
export const ENCABEZADOS_PLANILLA_CHEQUEO = [
  '#',
  'Nombre',
  'PL',
  '# Partos',
  'Última Cría',
  'Sexo cría',
  'Fecha Servicio',
  'Toro',
  'Estado registrado',
  'Estado',
  'Secar',
  'Parto Probable',
  'Tratamiento',
] as const;

/** Índice 0-based de la fila de encabezado dentro del AOA que arma
 * `construirAOAPlanillaChequeo` -- SIEMPRE 1 (título en fila 0, datos desde
 * fila 2). Constante explícita para que Print Titles y cualquier otro
 * consumidor no hardcodeen el número mágico en más de un sitio. */
export const FILA_ENCABEZADO_PLANILLA = 1;

/** Filas en blanco de la hoja/sección de holgura del chequeo -- decisión del
 * dueño 2026-09-15 (`docs/hato/plan_chequeo_novedades_implementacion.md`
 * §0.1 y §7): el planilla imprime SIEMPRE estas 10 filas para cualquier
 * animal que el veterinario encuentre y no esté en el roster (novilla,
 * compra reciente, chapeta recién cambiada) -- nunca condicionado a "si
 * hace falta".
 *
 * Vive ACÁ, y no en `exportarPlanillaChequeoPDF.ts`, aunque el plan la lista
 * como constante de ese archivo: los dos artefactos (`.xlsx` y `.pdf`)
 * necesitan el MISMO número para no describir una cantidad distinta de
 * filas libres, y este archivo ya es la fuente de verdad del template
 * (`ENCABEZADOS_PLANILLA_CHEQUEO`/`FilaPlanillaChequeo`) del que el PDF
 * IMPORTA -- nunca al revés (ver el encabezado de ese archivo). Ponerla en
 * el PDF y hacer que este archivo la importara de vuelta crearía un ciclo
 * de imports entre los dos. El PDF la re-exporta desde acá. */
export const FILAS_LIBRES_PLANILLA_CHEQUEO = 10;

/** Una fila de la planilla, ya lista para volcarse a celdas -- agnóstica de
 * qué hook/vista la produjo (no depende de `useHatoAnimales`/
 * `useHatoChequeoDetalle`: esos viven en `components/hato/`, una capa por
 * encima de `utils/`, y son quienes mapean su forma de datos a esta). `null`
 * en cualquier campo se traduce a celda vacía (nunca `0` ni texto vacío
 * "silencioso") -- mismo contrato de "sin dato, nunca 0" del resto del
 * módulo. Los campos de fecha van en texto `D/M/AAAA` (el mismo formato que
 * escribe Martha a mano, ver `celdas.ts`), nunca como serial de Excel
 * armado a mano. */
export interface FilaPlanillaChequeo {
  numero: number | null;
  nombre: string | null;
  pl: number | string | null;
  numPartos: number | string | null;
  ultimaCria: string | null;
  sexoCria: string | null;
  fechaServicio: string | null;
  toro: string | null;
  /** "Estado registrado" (D-E, B5.4): la etiqueta de `EstadoReproductivo`
   * que el sistema creía cierta al exportar (`textoCeldaEstadoRegistrado`),
   * gris/de solo referencia -- Martha nunca escribe acá, `estado` (la
   * columna de al lado) es su verificación. OPCIONAL: el B5.2
   * record-keeping (`ChequeoDetalle.tsx`, un chequeo YA CARGADO) no la trae
   * -- esa columna no existía cuando ese chequeo se capturó, así que su
   * ausencia en el objeto se traduce a celda vacía igual que `null`, nunca
   * a un valor inventado retroactivamente. */
  estadoRegistrado?: string | null;
  estado: string | null;
  /** Referencia de solo-lectura calculada por la app -- el parser de
   * subida JAMÁS la lee de vuelta (Secar/PP siempre se RE-DERIVAN desde
   * `Fecha Servicio`, ver `chequeos.ts`), así que su formato es libre; se
   * usa el mismo `D/M/AAAA` por consistencia visual con el resto de la
   * hoja. */
  secar: string | null;
  /** Misma naturaleza de solo-referencia que `secar`. */
  partoProbable: string | null;
  tratamiento: string | null;
}

type CeldaAOA = string | number | null;

function filaAOA(fila: FilaPlanillaChequeo): CeldaAOA[] {
  return [
    fila.numero,
    fila.nombre,
    fila.pl,
    fila.numPartos,
    fila.ultimaCria,
    fila.sexoCria,
    fila.fechaServicio,
    fila.toro,
    fila.estadoRegistrado ?? null,
    fila.estado,
    fila.secar,
    fila.partoProbable,
    fila.tratamiento,
  ];
}

/**
 * `FILAS_LIBRES_PLANILLA_CHEQUEO` filas totalmente en blanco (las 13
 * columnas en `null`), para las últimas filas de la tabla continua del
 * `.xlsx` -- la "hoja de holgura" del `.pdf` no tiene contraparte de página
 * acá (el `.xlsx` no pagina), así que es simplemente MÁS filas de la MISMA
 * tabla. `esFilaVacia` (`importHato/grilla.ts`) las descarta como
 * `fantasma` al volver a subir mientras nadie las llene -- son celda vacía,
 * nunca `0` ni un valor inventado, mismo contrato del resto del módulo.
 */
function filasLibresAOA(): CeldaAOA[][] {
  const columnas = ENCABEZADOS_PLANILLA_CHEQUEO.length;
  return Array.from({ length: FILAS_LIBRES_PLANILLA_CHEQUEO }, () => new Array<CeldaAOA>(columnas).fill(null));
}

/**
 * Arma la matriz completa (título + encabezado + filas de datos + filas
 * libres) que consume `XLSX.utils.aoa_to_sheet`. Una sola tabla continua --
 * el encabezado aparece EXACTAMENTE una vez (fila `FILA_ENCABEZADO_PLANILLA`),
 * nunca repetido para las filas libres: ese requisito es del PDF (decisión
 * 2, hojas físicas separadas), no de este archivo (ver el encabezado del
 * archivo, "nunca repetir el header, rompe la extracción del parser").
 */
export function construirAOAPlanillaChequeo(tituloHoja: string, filas: FilaPlanillaChequeo[]): CeldaAOA[][] {
  return [[tituloHoja], [...ENCABEZADOS_PLANILLA_CHEQUEO], ...filas.map(filaAOA), ...filasLibresAOA()];
}

const MESES_TITULO = [
  'ENERO',
  'FEBRERO',
  'MARZO',
  'ABRIL',
  'MAYO',
  'JUNIO',
  'JULIO',
  'AGOSTO',
  'SEPTIEMBRE',
  'OCTUBRE',
  'NOVIEMBRE',
  'DICIEMBRE',
] as const;

function partesIso(fechaIso: string): { anio: number; mes: number; dia: number } {
  const [anio, mes, dia] = fechaIso.split('-').map((n) => parseInt(n, 10));
  return { anio, mes, dia };
}

/**
 * Construye el texto del título de la fila 1 (fila 0 del AOA) a partir de
 * una fecha ISO -- exactamente el formato que `parseFechaChequeo`
 * (`calculosHato.ts`) resuelve con `confianza: 'alta'` (día + mes + año, sin
 * dígitos sueltos adicionales): `"CHEQUEO <día> <MES> <año>"`.
 */
export function construirTituloHojaChequeo(fechaIso: string): string {
  const { anio, mes, dia } = partesIso(fechaIso);
  return `CHEQUEO ${dia} ${MESES_TITULO[mes - 1]} ${anio}`;
}

/** Límite duro de Excel para nombres de hoja: 31 caracteres, sin
 * `: \ / ? * [ ]`. Se deriva del mismo mes/año que el título para que el
 * nombre de hoja NUNCA contradiga el título (evita el issue de discrepancia
 * mes/año que degrada la confianza en `parseFechaChequeo`). */
export function construirNombreHojaChequeo(fechaIso: string): string {
  const { anio, mes } = partesIso(fechaIso);
  return `CHEQUEO ${MESES_TITULO[mes - 1]} ${anio}`.slice(0, 31);
}

/** Convierte una fecha ISO (`AAAA-MM-DD`) a texto `D/M/AAAA` -- el mismo
 * formato en que aparecen las fechas escritas a mano en las planillas
 * (`celdas.ts`). `null` -> `null` (celda vacía, nunca "01/01/1970"). */
export function isoATextoDDMMYYYY(fechaIso: string | null | undefined): string | null {
  if (!fechaIso) return null;
  const { anio, mes, dia } = partesIso(fechaIso);
  return `${dia}/${mes}/${anio}`;
}

/**
 * Reconstruye el texto de la celda `Toro` a partir del nombre YA resuelto y
 * el tipo de servicio -- inverso de `parseToro` (`importHato/parseToro.ts`):
 * antepone `Toro `/`Ins ` cuando se conoce el tipo de servicio, exactamente
 * el prefijo que ese parser reconoce, para que el round-trip conserve tanto
 * el nombre como el tipo de servicio. Sin tipo de servicio conocido, se deja
 * el nombre solo (¡nunca un prefijo inventado!).
 */
export function textoCeldaToro(nombre: string | null, tipoServicio: 'monta' | 'inseminacion' | null): string | null {
  if (!nombre) return null;
  if (tipoServicio === 'inseminacion') return `Ins ${nombre}`;
  if (tipoServicio === 'monta') return `Toro ${nombre}`;
  return nombre;
}

/**
 * Reconstruye el texto de la celda `Estado` a partir del `tipo` NORMALIZADO
 * que guarda `hato_chequeo_vacas.estado` (migración 062) y que
 * `v_hato_estado_actual` expone como `ultimo_estado_chequeo` -- inverso
 * PARCIAL de `parseEstado`, y el "parcial" es deliberado:
 *
 * - `vacia_apta` -> `'ok'` y `vacia_problema` -> `'rech'` vuelven a parsear
 *   exactamente a su mismo tipo, así que el round-trip es exacto.
 * - `fecha_heredada` NO se puede reconstruir: el tipo normalizado no guarda
 *   la fecha (vive solo en `estado_raw`, que la vista no expone). Escribir
 *   cualquier fecha acá sería inventarla.
 * - `desconocido` tampoco: por definición su significado está solo en el
 *   crudo, que aquí no está disponible. Cualquier texto que se escribiera
 *   volvería a parsear como `desconocido`, pero con un crudo FABRICADO --
 *   peor que la celda vacía, porque el diff lo leería como un cambio real.
 *
 * En esos dos casos se devuelve `null` (celda vacía). Es la misma regla de
 * "sin dato antes que dato inventado" del resto del módulo: Martha ve la
 * celda en blanco y la escribe, que es exactamente lo que la planilla espera
 * de una columna sin información previa.
 */
export function textoCeldaEstado(tipo: TipoEstado | null | undefined): string | null {
  if (tipo === 'vacia_apta') return 'ok';
  if (tipo === 'vacia_problema') return 'rech';
  return null;
}

/**
 * Texto de la celda "Estado registrado" (D-E, B5.4) -- la etiqueta de
 * `EstadoReproductivo` (`etiquetaEstadoReproductivo`, calculosHato.ts), la
 * MISMA que ve el resto de la app (`chipEstadoReproductivo`, `hatoUi.ts`).
 *
 * Issue #192: cuando hay fecha del evento que abre el estado, el texto es
 * `Estado (N)` con `N` = meses calendario cumplidos (piso) desde esa fecha
 * (`textoEstadoReproductivoConMeses`). Sin fecha, la etiqueta pelada --
 * nunca un `(N)` inventado. El diff (N23) compara la etiqueta SIN `(N)`
 * (`diffChequeo.ts`), así que imprimir los meses no fabrica un conflicto
 * el día que `N` sube entre la impresión y la subida.
 *
 * A diferencia de `textoCeldaToro`/`textoCeldaEstado` (que escriben códigos
 * CRUDOS re-parseables porque esas dos columnas son DILIGENCIADAS), esta
 * columna es de solo REFERENCIA -- nadie la vuelve a escribir a mano, así que
 * no hay razón para que el `.xlsx` y el PDF muestren textos distintos como sí
 * ocurre con `Sexo cría` (ver `exportarPlanillaChequeoPDF.ts`).
 *
 * `null` -> celda vacía, nunca un texto inventado: sin `EstadoReproductivo`
 * conocido (la fila no tiene animal resuelto, p. ej. B5.2 de un chequeo
 * histórico que no guardó este dato) no hay nada que imprimir.
 */
export function textoCeldaEstadoRegistrado(
  estado: EstadoReproductivo | null | undefined,
  fechaApertura: string | null = null,
  fechaReferencia: string | null = null,
): string | null {
  if (!estado) return null;
  return textoEstadoReproductivoConMeses(estado, fechaApertura, fechaReferencia);
}

/** Anchos de columna (`!cols`, caracteres) -- angostos a propósito: las 13
 * columnas deben caber en el ANCHO de una página impresa tamaño carta/oficio
 * en orientación horizontal sin que Excel corte la tabla por la mitad al
 * paginar (ver nota de `construirLibroPlanillaChequeo` sobre las
 * limitaciones reales de paginación de esta librería). El .xlsx es el
 * artefacto de MÁQUINA (nunca se imprime tal cual -- para eso está el PDF),
 * así que este ancho es cosmético para quien lo abra en Excel, no un
 * presupuesto físico como el de `exportarPlanillaChequeoPDF.ts`. */
const ANCHOS_COLUMNAS_PLANILLA: readonly number[] = [6, 20, 6, 8, 11, 12, 13, 14, 18, 9, 11, 13, 18];

export interface OpcionesLibroPlanillaChequeo {
  tituloHoja: string;
  nombreHoja: string;
  filas: FilaPlanillaChequeo[];
}

/** Serializa el AOA sin alterar códigos crudos, filas libres ni datos de impresión. */
export async function construirLibroPlanillaChequeo(opciones: OpcionesLibroPlanillaChequeo): Promise<Uint8Array> {
  const { writeXlsx } = await import('../spreadsheet');
  const filaExcelEncabezado = FILA_ENCABEZADO_PLANILLA + 1;
  return writeXlsx([{
    name: opciones.nombreHoja,
    rows: construirAOAPlanillaChequeo(opciones.tituloHoja, opciones.filas),
    widths: ANCHOS_COLUMNAS_PLANILLA,
    margins: { left: 0.4, right: 0.4, top: 0.5, bottom: 0.5, header: 0.2, footer: 0.2 },
    printTitlesRow: `${filaExcelEncabezado}:${filaExcelEncabezado}`,
  }]);
}

/** Espera la serialización antes de descargar y deja propagar los errores al llamador. */
export async function descargarPlanillaChequeo(
  opciones: OpcionesLibroPlanillaChequeo,
  nombreArchivo: string,
): Promise<void> {
  const { downloadXlsx } = await import('../spreadsheet');
  const bytes = await construirLibroPlanillaChequeo(opciones);
  downloadXlsx(bytes, nombreArchivo);
}
