// ARCHIVO: utils/hato/exportarPlanillaChequeo.ts
// DESCRIPCIÓN: B5 (docs/hato/sesiones-b5-d7-e3.md, Session A). Construye el
// libro `.xlsx` de la planilla de chequeo -- MISMO template para las dos
// direcciones del round-trip de D-4 ("la app PRINTS a pre-filled planilla ->
// el vet la llena en papel -> alguien actualiza el .xlsx -> se sube -> se
// parsea/diffea/aprueba", el flujo B0/V10 ya existente):
//
//   B5.1 -- planilla del PRÓXIMO chequeo, pre-llenada con identidad +
//           último estado conocido; las columnas que el veterinario
//           actualiza quedan en blanco.
//   B5.2 -- planilla de un chequeo YA CARGADO, totalmente poblada
//           (record-keeping).
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
// Arquitectura: todo lo de este archivo es PURO salvo las dos funciones que
// reciben el módulo `xlsx` ya cargado por el llamador (`XLSXModule = typeof
// import('xlsx')`, NUNCA un `import` estático de la librería -- mismo patrón
// de inyección que `src/utils/exportarExcelReportes.ts`). Así:
//   - Los componentes (`ChequeosList.tsx`, `ChequeoDetalle.tsx`) hacen el
//     `await import('xlsx')` real y llaman `descargarPlanillaChequeo` (la
//     única función que además dispara la descarga vía `XLSX.writeFile`).
//   - El test de round-trip (B5.3, `src/__tests__/`) puede importar `xlsx`
//     directamente (no está sujeto a la restricción de tamaño de bundle del
//     navegador) y llamar `construirLibroPlanillaChequeo` para obtener los
//     bytes reales y volver a leerlos con el mismo lector celda-por-celda
//     que usa `extract.ts`/`hato-chequeo-preview.ts`.
//
// Nunca repite la fila de encabezado a mitad de hoja -- estructura fija:
// fila 0 = título (fecha del chequeo, la MISMA lógica que `parseFechaChequeo`
// espera leer), fila 1 = encabezado, fila 2+ = datos, una sola tabla
// continua (requisito duro de B5.1: "nunca repetir el header, rompe la
// extracción del parser de subida").

/** Las 12 columnas del template (13 históricas menos `TP`), en orden, con
 * las abreviaturas desarrolladas (decisión del dueño). Única fuente de
 * verdad del header -- tanto el armado del AOA como los tests la reutilizan,
 * nunca se repite el arreglo literal en dos sitios. */
export const ENCABEZADOS_PLANILLA_CHEQUEO = [
  '#',
  'Nombre',
  'PL',
  '# Partos',
  'Última Cría',
  'Sexo cría',
  'Fecha Servicio',
  'Toro',
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
    fila.estado,
    fila.secar,
    fila.partoProbable,
    fila.tratamiento,
  ];
}

/**
 * Arma la matriz completa (título + encabezado + filas de datos) que
 * consume `XLSX.utils.aoa_to_sheet`. Una sola tabla continua -- el
 * encabezado aparece EXACTAMENTE una vez (fila `FILA_ENCABEZADO_PLANILLA`).
 */
export function construirAOAPlanillaChequeo(tituloHoja: string, filas: FilaPlanillaChequeo[]): CeldaAOA[][] {
  return [[tituloHoja], [...ENCABEZADOS_PLANILLA_CHEQUEO], ...filas.map(filaAOA)];
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

/** Anchos de columna (`!cols`, caracteres) -- angostos a propósito: 12
 * columnas deben caber en el ANCHO de una página impresa tamaño carta/oficio
 * en orientación horizontal sin que Excel corte la tabla por la mitad al
 * paginar (ver nota de `construirLibroPlanillaChequeo` sobre las
 * limitaciones reales de paginación de esta librería). */
const ANCHOS_COLUMNAS_PLANILLA: readonly number[] = [6, 20, 6, 8, 11, 12, 13, 14, 9, 11, 13, 18];

export type XLSXModule = typeof import('xlsx');

export interface OpcionesLibroPlanillaChequeo {
  tituloHoja: string;
  nombreHoja: string;
  filas: FilaPlanillaChequeo[];
}

/**
 * Ensambla el `WorkBook` completo: hoja con el AOA de
 * `construirAOAPlanillaChequeo`, anchos de columna, márgenes de impresión
 * angostos y "Print Titles" (repetir la fila de encabezado en cada página
 * impresa).
 *
 * Paginado para impresión -- limitación real y verificada de la librería
 * `xlsx` (SheetJS Community Edition, la que usa este repo, `node_modules`):
 * NO soporta escribir paneles congelados de PANTALLA (`freeze panes`) ni
 * saltos de página manuales (`rowBreaks`/`colBreaks`/`pageSetup`) -- son
 * tokens reconocidos pero ignorados por su escritor (`case 'pane': break`,
 * `case 'orientation': break`, verificado contra `node_modules/xlsx/xlsx.js`
 * y confirmado escribiendo un libro de prueba y leyendo el XML resultante).
 * Lo que SÍ escribe, y es lo que de verdad gobierna "se ve bien impreso en
 * varias páginas" para una tabla de columnas fijas y muchas filas (pagina
 * SOLO verticalmente): "Print Titles" -- `wb.Workbook.Names` con
 * `_xlnm.Print_Titles` apuntando a la fila de encabezado, que Excel repite
 * en cada página al imprimir (verificado contra el XML real:
 * `<definedNames>` sale en `xl/workbook.xml`) -- más anchos de columna
 * angostos y márgenes reducidos para que Excel autopagine limpio sin
 * necesitar saltos manuales. Esto NUNCA duplica la fila de encabezado en
 * los DATOS de la hoja (sigue apareciendo una sola vez) -- es una
 * instrucción de impresión, no una fila adicional, así que no interfiere
 * con el parser de subida.
 */
export function construirLibroPlanillaChequeo(XLSX: XLSXModule, opciones: OpcionesLibroPlanillaChequeo) {
  const aoa = construirAOAPlanillaChequeo(opciones.tituloHoja, opciones.filas);
  const hoja = XLSX.utils.aoa_to_sheet(aoa);
  hoja['!cols'] = ANCHOS_COLUMNAS_PLANILLA.map((wch) => ({ wch }));
  hoja['!margins'] = { left: 0.4, right: 0.4, top: 0.5, bottom: 0.5, header: 0.2, footer: 0.2 };

  const libro = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(libro, hoja, opciones.nombreHoja);

  const filaExcelEncabezado = FILA_ENCABEZADO_PLANILLA + 1; // A1 es 1-indexado
  libro.Workbook = libro.Workbook ?? {};
  libro.Workbook.Names = [
    ...(libro.Workbook.Names ?? []),
    {
      Sheet: 0,
      Name: '_xlnm.Print_Titles',
      Ref: `'${opciones.nombreHoja}'!$${filaExcelEncabezado}:$${filaExcelEncabezado}`,
    },
  ];

  return libro;
}

/**
 * Construye el libro y dispara la descarga (`XLSX.writeFile`). Única
 * función de este archivo que hace I/O real -- `await import('xlsx')`
 * dinámico, mismo patrón que `exportarExcelReportes.ts`, para no meter la
 * librería en el bundle inicial. Los componentes (`ChequeosList.tsx`,
 * `ChequeoDetalle.tsx`) llaman esta función; el test de round-trip llama
 * `construirLibroPlanillaChequeo` directo (necesita los bytes en memoria,
 * no un archivo descargado por el navegador).
 */
export async function descargarPlanillaChequeo(
  opciones: OpcionesLibroPlanillaChequeo,
  nombreArchivo: string,
): Promise<void> {
  const XLSX = await import('xlsx');
  const libro = construirLibroPlanillaChequeo(XLSX, opciones);
  XLSX.writeFile(libro, nombreArchivo);
}
