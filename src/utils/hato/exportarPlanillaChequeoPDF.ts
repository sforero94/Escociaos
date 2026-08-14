// ARCHIVO: utils/hato/exportarPlanillaChequeoPDF.ts
// DESCRIPCIÓN: Fase 2 de `docs/plan_chequeo_captura_foto.md` -- la planilla
// del próximo chequeo como PDF IMPRIMIBLE.
//
// POR QUÉ EXISTE UN SEGUNDO EXPORTADOR (y no un solo archivo): son DOS
// artefactos con DOS trabajos distintos, decisión de arquitectura ya tomada
// en el plan (§3, §6 y el recuadro de §2):
//
//   - `exportarPlanillaChequeo.ts` (.xlsx) = artefacto de MÁQUINA. Conserva
//     los códigos CRUDOS (`A 206`, `Toro Nitro`, `ok`) para que
//     `importHato/` lo vuelva a parsear sin aprender ningún alias nuevo. NO
//     se toca desde acá: este archivo solo IMPORTA su tipo de fila y su
//     lista de encabezados.
//   - este archivo (.pdf) = artefacto HUMANO. Se imprime, se lee en el
//     corral y se ESCRIBE ENCIMA. Nunca se re-parsea, así que aquí sí van
//     etiquetas legibles ("Hembra (retenida #206)" en vez de `A 206`) --
//     petición explícita del dueño (decisión D-E, "limpiar esa información
//     para que sea más clara a la hora de leer").
//
// El `.xlsx` que produce SheetJS Community NO es imprimible de forma decente:
// esa librería no escribe estilos de celda ni `pageSetup` (verificado y
// documentado en el archivo hermano), así que sale un grid plano, sin bordes,
// sin negrilla y sin control de orientación. `jspdf` + `jspdf-autotable` --
// AMBAS ya dependencias del repo, no se agrega ninguna -- sí controlan
// orientación, alto de fila, bordes por celda y repetición del encabezado.
//
// ÚNICA FUENTE DE VERDAD DE LAS COLUMNAS: `ENCABEZADOS_PLANILLA_CHEQUEO` y
// `FilaPlanillaChequeo` del archivo hermano. Ni el orden ni la lista se
// repiten aquí -- si mañana se agrega una columna al template, el `Set` de
// clasificación de abajo falla en el test antes de que el PDF salga mal.
//
// Arquitectura PURO/IO, igual que el hermano: todo es puro salvo
// `descargarPlanillaChequeoPDF`, que hace el `await import()` dinámico (para
// no meter jsPDF en el bundle inicial, mismo patrón de
// `generarPDFListaCompras.ts`) y dispara `doc.save`. El constructor del
// documento recibe las librerías YA cargadas por el llamador, así que los
// tests pueden armar el PDF real en memoria y medirlo.

import { parseSX, type CriaDestino, type SexoCria } from '@/utils/calculosHato';
import { esNumeroProvisional } from '@/utils/importHato/overridesChapeta';
import {
  ENCABEZADOS_PLANILLA_CHEQUEO,
  type FilaPlanillaChequeo,
} from '@/utils/hato/exportarPlanillaChequeo';

// ----------------------------------------------------------------------------
// 1. Etiqueta legible de `Sexo cría` (D-E del plan)
// ----------------------------------------------------------------------------

/** Lo que se sabe del último parto de una vaca, tal como ya lo expone
 * `useAnimalesParaPlanillaChequeo` -- NADA se vuelve a derivar aquí:
 * `sexoCria` ya viene de `derivarSexoCria` (motor puro) y `criaDestino` es la
 * columna real `hato_eventos.cria_destino`. `sexoCriaRaw` se usa solo para
 * sacar la CHAPETA de la cría a través de `parseSX`, el único intérprete del
 * código SX en todo el repo (regla dura del módulo). */
export interface InputEtiquetaSexoCria {
  sexoCria: SexoCria | null;
  criaDestino: CriaDestino | null;
  /** `hato_eventos.sx_raw` del MISMO parto del que salen los dos de arriba. */
  sexoCriaRaw: string | null;
}

/** `'M'`/`'H'` -- el sexo ya derivado por el motor, nunca inferido acá.
 *
 * POR QUÉ LA INICIAL Y NO LA PALABRA COMPLETA (decisión del dueño 2026-07-29):
 * el ancho de la planilla estaba asignado al revés de lo que Martha realmente
 * escribe. Medido sobre el histórico de `hato_chequeo_vacas`: en la celda SX
 * escribe **3 caracteres en promedio** (máx. 11), mientras en `Tratamiento`
 * escribe **12 en promedio y hasta 54** (p. ej. "gestar/estr y 7 dias
 * cefalexina lavadorepetir fertagil"). Con `Hembra (retenida #206)` la columna
 * `Sexo cría` se llevaba 44mm -- la más ancha de la hoja -- y `Tratamiento`
 * quedaba con 21mm, la más angosta de las que se diligencian.
 *
 * La tabla ya consumía 254,5 de los 259,4mm útiles, así que ensanchar
 * `Tratamiento` obligaba a quitar de algún lado. `M`/`H` sigue siendo lenguaje
 * legible (no el código crudo `OV`/`A 206`, que es lo que D-E prohíbe
 * imprimir) y libera el ancho sin tocar ninguno de los tres requisitos duros:
 * 11pt en los datos, 2 páginas, y nada de códigos en el PDF. La columna se
 * titula "Sexo cría", así que la inicial no es ambigua en su contexto. */
function textoSexo(sexo: SexoCria | null): string | null {
  if (sexo === 'macho') return 'M';
  if (sexo === 'hembra') return 'H';
  return null;
}

/**
 * Frase del DESTINO de la cría, en lenguaje claro. Se arma desde
 * `cria_destino` (columna real y poblada: 179 `macho_vendido` · 103
 * `retenida` · 27 `hembra_vendida` · 23 `muerta` · 1 null sobre 333 partos en
 * producción, verificado el 2026-07-29), más el número de chapeta cuando la
 * celda SX lo trae (`A 206` -> `#206`).
 *
 * `'aborto'` devuelve `null` a propósito: no hay cría que describir, así que
 * la celda queda vacía en vez de decir algo que suene a dato.
 */
function textoDestino(destino: CriaDestino | null, numeroCria: number | null): string | null {
  switch (destino) {
    case 'retenida':
      // El número es la chapeta de la cría (regla del dueño, plan §8.1). Si
      // la celda SX no lo trae (código `A` a secas), se omite -- jamás se
      // inventa una chapeta.
      return numeroCria === null ? 'retenida' : `retenida #${numeroCria}`;
    case 'macho_vendido':
      return 'vendido';
    case 'hembra_vendida':
      return 'vendida';
    case 'muerta':
      return 'murió';
    // Un aborto no tiene cría: no hay destino que imprimir.
    case 'aborto':
    case null:
      return null;
    default: {
      const _exhaustivo: never = destino;
      void _exhaustivo;
      return null;
    }
  }
}

/**
 * Etiqueta legible de la columna `Sexo cría` para el PDF -- exclusiva de este
 * artefacto: el `.xlsx` sigue emitiendo el `sx_raw` verbatim porque es
 * re-parseable, y esta etiqueta NO lo es (ni tiene que serlo, el PDF nunca se
 * vuelve a leer con un parser).
 *
 * Tabla de decisión (sexo y destino son ejes INDEPENDIENTES -- se conoce uno,
 * el otro, ambos o ninguno):
 *
 * | sexo | destino | etiqueta |
 * |---|---|---|
 * | Macho | vendido | `M vendido` |
 * | Hembra | retenida + chapeta | `H retenida #206` |
 * | Hembra | vendida | `H vendida` |
 * | Hembra | murió | `H murió` |
 * | Macho/Hembra | — | `Macho` / `Hembra` (sin destino que lo acompañe, la
 * |   |   | inicial sola sería críptica: aquí sí va la palabra completa) |
 * | — | murió | `Cría murió` (es el caso real: `cria_destino='muerta'` NO
 * |   |   | determina el sexo, viene tanto de `A+` como de `O+`) |
 * | — | retenida/vendida | `Cría retenida #206` / `Cría vendida` |
 * | — | (SX = `gem+`) | `Parto gemelar` (la planilla no dice el sexo de cada
 * |   |   | gemelo, así que no hay sexo que imprimir -- pero el hecho sí es
 * |   |   | dato y perderlo sería descartar en silencio) |
 * | — | — | `null` -> **celda vacía** |
 *
 * REGLA DURA: sin sexo Y sin destino la celda va VACÍA. Nunca "N/D", nunca
 * "—" dentro del texto, nunca un valor por defecto -- mismo contrato de "sin
 * dato, nunca 0" del resto del módulo.
 */
export function etiquetaSexoCria(input: InputEtiquetaSexoCria): string | null {
  const sx = input.sexoCriaRaw ? parseSX(input.sexoCriaRaw) : null;
  const numeroCria = sx?.numeroCria ?? null;

  const sexo = textoSexo(input.sexoCria);
  const destino = textoDestino(input.criaDestino, numeroCria);

  // Sin paréntesis: con el sexo abreviado a inicial, `H retenida #206` se lee
  // igual de claro que `Hembra (retenida #206)` y ahorra dos caracteres más.
  if (sexo && destino) return `${sexo} ${destino}`;
  if (sexo) return sexo === 'M' ? 'Macho' : 'Hembra';
  if (destino === 'murió') return 'Cría murió';
  if (destino) return `Cría ${destino}`;
  // Parto gemelar: no hay sexo (son dos crías) ni destino registrado, pero el
  // código SX sí dice que fue gemelar -- dato real, leído por el único parser
  // de SX del repo.
  if (sx?.tipo === 'gemelar') return 'Parto gemelar';
  return null;
}

// ----------------------------------------------------------------------------
// 2. Armado de la matriz de celdas
// ----------------------------------------------------------------------------

/** Columnas que Martha DILIGENCIA en el corral -- las que pueden cambiar en
 * un chequeo. Van en blanco y con borde marcado. Ojo: "en blanco" es el
 * FONDO, no el contenido: desde la Fase 1 estas columnas también salen
 * pre-llenadas con el último valor conocido (planilla incremental), y el
 * fondo blanco es la señal de "aquí sí se puede escribir/corregir". El texto
 * se alinea ARRIBA en estas celdas para dejar el espacio de abajo libre para
 * la escritura a mano. */
export const COLUMNAS_A_DILIGENCIAR: ReadonlySet<string> = new Set([
  'PL',
  'Sexo cría',
  'Fecha Servicio',
  'Toro',
  'Estado',
  'Tratamiento',
]);

/** Columnas de identidad/referencia: el sistema las calcula y Martha no las
 * escribe. Van en gris tenue. Se derivan por complemento de
 * `COLUMNAS_A_DILIGENCIAR` sobre `ENCABEZADOS_PLANILLA_CHEQUEO`, así que una
 * columna nueva en el template NO puede quedar sin clasificar en silencio
 * (hay un test que lo verifica). */
export const COLUMNAS_PRELLENADAS: readonly string[] = ENCABEZADOS_PLANILLA_CHEQUEO.filter(
  (h) => !COLUMNAS_A_DILIGENCIAR.has(h),
);

/** Índices (0-based) de las columnas a diligenciar, en el orden real del
 * template -- lo que consume `columnStyles` de autoTable. */
export const INDICES_COLUMNAS_A_DILIGENCIAR: readonly number[] = ENCABEZADOS_PLANILLA_CHEQUEO.reduce<number[]>(
  (acc, h, i) => (COLUMNAS_A_DILIGENCIAR.has(h) ? [...acc, i] : acc),
  [],
);

/**
 * Convierte una fila del template a celdas de texto, en el MISMO orden de
 * `ENCABEZADOS_PLANILLA_CHEQUEO`. `null` -> `''` (celda visualmente vacía,
 * con su recuadro): nunca `0`, nunca "N/D".
 *
 * Recibe la fila del template YA armada (`FilaPlanillaChequeo`), con
 * `sexoCria` conteniendo la etiqueta legible de `etiquetaSexoCria` -- el
 * llamador es quien decide qué artefacto está produciendo, igual que decide
 * escribir el `sx_raw` crudo cuando lo que arma es el `.xlsx`.
 */
/** Marca que acompaña a un número provisional (banda 800-999) en la columna
 * `#`. Ver `textoCeldaNumero`. */
export const MARCA_NUMERO_PROVISIONAL = '*';

/** Nota al pie que explica la marca. Solo se imprime si la planilla LLEVA al
 * menos una fila provisional -- una nota sobre algo que no aparece es ruido. */
export const NOTA_NUMEROS_PROVISIONALES =
  '* Número provisional: NO es la caravana física. Identifique ese animal por su NOMBRE.';

/**
 * Texto de la celda `#`. Un número de la banda provisional (800-999) sale
 * marcado con un asterisco.
 *
 * POR QUÉ: esos números son de TRABAJO, no caravanas físicas -- se asignaron
 * durante la importación histórica para desempatar chapetas repetidas
 * (`overridesChapeta.ts`, cuyo propio docstring dice "para que nadie salga a
 * buscar la caravana 999 en el potrero"). Una planilla impresa es exactamente
 * ese caso: quien la lleva al corral buscaría una caravana que no existe. El
 * módulo ya aplica esta regla en las alertas de Telegram (S6, que lideran con
 * el NOMBRE para animales de número provisional); el papel la necesita igual o
 * más, porque ahí no hay tooltip que aclare.
 *
 * El número se CONSERVA junto a la marca, no se reemplaza: sigue siendo el
 * ancla de fila con la que el OCR de la Fase 3 cotejará contra el roster.
 */
export function textoCeldaNumero(numero: number | null): string {
  if (numero === null) return '';
  return esNumeroProvisional(numero) ? `${numero}${MARCA_NUMERO_PROVISIONAL}` : String(numero);
}

/** `true` si alguna fila lleva número provisional -- decide si se imprime la
 * nota al pie. */
export function hayNumerosProvisionales(filas: readonly FilaPlanillaChequeo[]): boolean {
  return filas.some((f) => esNumeroProvisional(f.numero));
}

export function construirFilasPlanillaPDF(filas: readonly FilaPlanillaChequeo[]): string[][] {
  return filas.map((f) => {
    const celdas: (string | number | null | undefined)[] = [
      textoCeldaNumero(f.numero),
      f.nombre,
      f.pl,
      f.numPartos,
      f.ultimaCria,
      f.sexoCria,
      f.fechaServicio,
      f.toro,
      f.estadoRegistrado,
      f.estado,
      f.secar,
      f.partoProbable,
      f.tratamiento,
    ];
    return celdas.map((c) => (c === null || c === undefined ? '' : String(c)));
  });
}

// ----------------------------------------------------------------------------
// 3. Layout de la página
// ----------------------------------------------------------------------------

/**
 * Anchos de columna en MILÍMETROS. Presupuesto real de carta HORIZONTAL:
 * 279,4mm de ancho − 8mm de margen a cada lado = **263,4mm útiles**. El
 * margen bajó de 10 a 8mm en D-E/N22 (docs/plan_hato_telegram_estados_agosto_2026.md)
 * para financiar la columna 13 ("Estado registrado") sin comerse la del
 * resto -- 8mm sigue siendo un margen imprimible normal en cualquier
 * impresora de oficina.
 *
 * El reparto NO es uniforme y no se eligió a ojo: cada ancho se midió con
 * `doc.getTextWidth` contra el contenido REAL más largo de esa columna a
 * 11pt (datos) O la palabra más larga del encabezado a 9pt bold (lo que sea
 * mayor) más 3mm de padding horizontal. Las celdas de DATOS nunca se
 * envuelven a dos líneas (requisito duro); un encabezado de dos palabras SÍ
 * puede partirse en dos líneas entre palabras (p. ej. "Fecha" / "Servicio"),
 * pero ninguna palabra individual se parte a la mitad -- por eso el piso de
 * cada columna es el MAYOR de los dos:
 * - Fechas (`Última Cría`, `Fecha Servicio`, `Secar`, `Parto Probable`):
 *   `22/12/2026` mide 19,25mm -> 22,5mm de columna.
 * - `Nombre`: `BRILLANTINA` (el nombre más largo del hato) mide 24,87mm -> 28mm.
 * - `Toro`: `Ins Holstein` (raza-como-nombre-de-toro, el caso más largo) mide
 *   20,18mm -> 23,4mm.
 * - `Sexo cría` lleva una FRASE, no un dato corto: `H retenida #206` (el caso
 *   real más largo) mide 27,40mm -> 30,6mm de columna.
 * - `Estado registrado` (D-E, B5.4, N22): la etiqueta más larga del
 *   vocabulario de 5 estados es `Confirmada` (19,91mm de dato) -- pero la
 *   palabra suelta del encabezado, `registrado`, mide 15,46mm a 9pt bold, así
 *   que el dato manda -> 23,4mm de columna.
 * - `Estado`/`PL`/`# Partos` son códigos cortos (`ok`/`rech`, números de 1-2
 *   dígitos), pero cada uno respeta el piso de su propia palabra de
 *   encabezado ("Estado" 10,51mm, "Partos" 9,81mm) para no partirla:
 *   `Estado` -> 13,7mm, `PL` -> 7,5mm, `# Partos` -> 13mm.
 * - `Tratamiento` es la columna donde Martha MÁS escribe y por eso sigue
 *   recibiendo el resto del presupuesto disponible -- 22,5mm, medido contra
 *   el histórico de `hato_chequeo_vacas` (2026-07-29): SX promedia 3
 *   caracteres escritos a mano y TTTO promedia 12 (máx. 54). Encogió frente
 *   a la versión anterior (35mm) para financiar la columna 13; sigue
 *   cubriendo con holgura el caso promedio, no el máximo histórico extremo.
 * - Las de referencia pura (`#`) lleva lo justo para su contenido conocido:
 *   nadie escribe ahí.
 *
 * El total queda en 263,1mm de los 263,4 útiles: 0,3mm de holgura --
 * deliberadamente angosta (cada columna ya trae su propio colchón de
 * redondeo, ver el test que mide contra `doc.getTextWidth` real) para poder
 * financiar la columna 13 sin ir a tamaño oficio ni sacrificar el requisito
 * de letra ≥11pt. Cualquier columna nueva o más ancha exige quitar de otra o
 * aceptar una página más -- no hay margen escondido.
 */
export const ANCHOS_COLUMNAS_PDF_MM: readonly number[] = [
  11.1, // # (cabe `999*`: la marca de provisional suma un carácter)
  28, // Nombre
  7.5, // PL
  13, // # Partos
  22.5, // Última Cría
  30.6, // Sexo cría
  22.5, // Fecha Servicio
  23.4, // Toro
  23.4, // Estado registrado
  13.7, // Estado
  22.5, // Secar
  22.5, // Parto Probable
  22.5, // Tratamiento
];

/** Ancho total de la tabla = suma exacta de los anchos de columna. Se le pasa
 * a `tableWidth` como NÚMERO a propósito: con el default (`'auto'`)
 * autoTable intenta estirar la tabla hasta el ancho útil de la página y, al no
 * quedar ninguna columna redimensionable (todas tienen `cellWidth` fijo),
 * emite un `console.warn` engañoso ("N units width could not fit page") en
 * cada export -- la tabla no se desborda, le SOBRA página. Declarar el ancho
 * elimina ese ruido sin cambiar un milímetro del layout. */
export const ANCHO_TABLA_PDF_MM = ANCHOS_COLUMNAS_PDF_MM.reduce((a, b) => a + b, 0);

/** Márgenes de la página, en mm. `top` reserva la banda del título, que se
 * redibuja en CADA página (ver `dibujarEncabezadoPagina`); `bottom` reserva la
 * banda del pie (nota operativa + "Página i de N"). `right`/`left` bajaron de
 * 10 a 8mm en D-E/N22 para financiar la columna 13 ("Estado registrado") --
 * ver la nota de `ANCHOS_COLUMNAS_PDF_MM`. */
export const MARGENES_PDF_MM = { top: 20, right: 8, bottom: 12, left: 8 } as const;

/** Ancho útil de una hoja carta horizontal con estos márgenes. Constante
 * explícita para que el test de presupuesto de ancho no repita la aritmética. */
export const ANCHO_UTIL_CARTA_HORIZONTAL_MM = 279.4 - MARGENES_PDF_MM.left - MARGENES_PDF_MM.right;

/** Tamaño de letra de las celdas de DATOS. Requisito duro del dueño (plan §6
 * y §8.3): **≥11pt** es lo que hace legible la planilla en papel. Si el
 * layout no cupiera, la salida son más páginas -- NUNCA letra más chica. */
export const FUENTE_DATOS_PT = 11;

/** El encabezado va más pequeño que los datos, y es una decisión de
 * presupuesto, no un descuido: el requisito de ≥11pt es sobre las CELDAS DE
 * DATOS (lo que se lee y se escribe en el corral). El encabezado es texto
 * impreso, fijo y en negrilla, y bajarlo a 9pt es lo que permite que
 * `Tratamiento` (17,85mm a 9pt bold) y `# Partos` quepan en su columna sin
 * partir la palabra a mitad. A 10pt no caben. */
export const FUENTE_ENCABEZADO_PT = 9;

/** Alto mínimo de fila en mm -- espacio real para escribir a mano DENTRO del
 * recuadro (una línea de 11pt ocupa ~3,9mm, así que quedan ~5mm libres). */
export const ALTO_MINIMO_FILA_MM = 9;

const COLOR_PRIMARIO: [number, number, number] = [115, 153, 28]; // #73991C
const COLOR_GRIS_PRELLENADO: [number, number, number] = [240, 240, 240];
const COLOR_BLANCO: [number, number, number] = [255, 255, 255];
const COLOR_BORDE: [number, number, number] = [90, 90, 90];
const COLOR_TEXTO: [number, number, number] = [30, 30, 30];
const COLOR_TEXTO_TENUE: [number, number, number] = [110, 110, 110];

/** Regla operativa impresa en el pie (plan §6): sin ella la gente escribe
 * comillas de repetición y la celda queda sin dato propio -- ilegible para el
 * OCR de la Fase 3 y ambigua para quien transcriba. */
export const NOTA_OPERATIVA_PLANILLA =
  'Escriba cada celda completa: nunca comillas de repetición ni "igual". Celda sin dato: déjela vacía.';

// ----------------------------------------------------------------------------
// 4. Construcción del documento
// ----------------------------------------------------------------------------

export type JsPDFConstructor = typeof import('jspdf').default;
export type AutoTableFn = typeof import('jspdf-autotable').default;

/** Las dos librerías ya cargadas por el llamador -- NUNCA un `import`
 * estático acá (mismo patrón de inyección que `XLSXModule` en el archivo
 * hermano): así el bundle inicial no las arrastra y los tests pueden armar el
 * PDF real en memoria. */
export interface LibreriasPDFPlanilla {
  jsPDF: JsPDFConstructor;
  autoTable: AutoTableFn;
}

export interface OpcionesPlanillaChequeoPDF {
  /** Título del documento -- se construye con `construirTituloHojaChequeo`
   * del archivo hermano ("CHEQUEO 22 JULIO 2026"), para que el PDF y el
   * `.xlsx` NUNCA muestren fechas distintas del mismo chequeo. */
  tituloDocumento: string;
  /** Subtítulo opcional (contexto de una línea, p. ej. cuántas vacas lista). */
  subtitulo?: string | null;
  filas: readonly FilaPlanillaChequeo[];
}

/** jsPDF no expone un tipo público para el documento sin importar la librería
 * de forma estática; se modela con lo mínimo que este archivo usa. */
type DocumentoPDF = InstanceType<JsPDFConstructor>;

function dibujarEncabezadoPagina(doc: DocumentoPDF, opciones: OpcionesPlanillaChequeoPDF): void {
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.setTextColor(...COLOR_PRIMARIO);
  doc.text(opciones.tituloDocumento, MARGENES_PDF_MM.left, 10);

  if (opciones.subtitulo) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(...COLOR_TEXTO_TENUE);
    doc.text(opciones.subtitulo, MARGENES_PDF_MM.left, 15.5);
  }
}

/**
 * Estampa el pie de CADA página: la nota operativa a la izquierda y
 * "Página i de N" a la derecha. Va después de `autoTable` porque el total de
 * páginas solo se conoce cuando la tabla ya se dibujó (mismo patrón que
 * `generarPDFListaCompras.ts`).
 */
function estamparPiesDePagina(doc: DocumentoPDF, conNumerosProvisionales: boolean): void {
  const total = doc.getNumberOfPages();
  const altoPagina = doc.internal.pageSize.getHeight();
  const anchoPagina = doc.internal.pageSize.getWidth();
  const y = altoPagina - 5;

  for (let i = 1; i <= total; i++) {
    doc.setPage(i);
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(8);
    doc.setTextColor(...COLOR_TEXTO_TENUE);
    doc.text(NOTA_OPERATIVA_PLANILLA, MARGENES_PDF_MM.left, y);
    // La nota de provisionales va ENCIMA de la operativa y solo si aplica: es
    // una advertencia de identificación en el corral, no decoración.
    if (conNumerosProvisionales) {
      doc.text(NOTA_NUMEROS_PROVISIONALES, MARGENES_PDF_MM.left, y - 4);
    }
    doc.setFont('helvetica', 'normal');
    doc.text(`Página ${i} de ${total}`, anchoPagina - MARGENES_PDF_MM.right, y, { align: 'right' });
  }
}

/**
 * Arma el documento completo y lo devuelve SIN guardarlo (el llamador decide
 * si lo descarga o lo mide). Decisiones de layout, todas requisitos del
 * dueño (plan §6):
 *
 * - **Carta HORIZONTAL**: las 12 columnas necesitan ~253mm y una carta
 *   horizontal ofrece 259,4mm útiles. Vertical no cabe (196mm útiles).
 * - **`theme: 'grid'`**: recuadro visible en TODAS las celdas. No es
 *   estética: el recuadro es lo que ancla la celda para el OCR de la Fase 3.
 *   Por lo mismo NO se usan filas alternadas (`alternateRowStyles`): el único
 *   contraste de fondo que debe leerse es gris = referencia / blanco = se
 *   escribe.
 * - **`showHead: 'everyPage'`**: el encabezado se repite en cada página de
 *   forma nativa. Una planilla de 2 páginas sin encabezado en la segunda es
 *   inservible en el corral.
 * - **`rowPageBreak: 'avoid'`**: una fila de vaca nunca se corta entre dos
 *   páginas.
 */
export function construirDocumentoPlanillaChequeoPDF(
  libs: LibreriasPDFPlanilla,
  opciones: OpcionesPlanillaChequeoPDF,
): DocumentoPDF {
  const doc = new libs.jsPDF({ orientation: 'landscape', unit: 'mm', format: 'letter' });

  interface EstiloColumna {
    cellWidth: number;
    fillColor: [number, number, number];
    lineWidth: number;
    valign: 'top' | 'middle';
  }
  const estilosPorColumna: Record<string, EstiloColumna> = {};
  ENCABEZADOS_PLANILLA_CHEQUEO.forEach((encabezado, i) => {
    const seDiligencia = COLUMNAS_A_DILIGENCIAR.has(encabezado);
    estilosPorColumna[String(i)] = {
      cellWidth: ANCHOS_COLUMNAS_PDF_MM[i],
      fillColor: seDiligencia ? COLOR_BLANCO : COLOR_GRIS_PRELLENADO,
      // Borde más marcado en lo que se diligencia: el recuadro invita a
      // escribir dentro y delimita la celda para el OCR.
      lineWidth: seDiligencia ? 0.45 : 0.2,
      // Texto arriba en las celdas escribibles -> el espacio libre queda
      // abajo, donde Martha escribe. En las de referencia, centrado.
      valign: seDiligencia ? 'top' : 'middle',
    };
  });

  libs.autoTable(doc, {
    head: [[...ENCABEZADOS_PLANILLA_CHEQUEO]],
    body: construirFilasPlanillaPDF(opciones.filas),
    theme: 'grid',
    showHead: 'everyPage',
    rowPageBreak: 'avoid',
    margin: MARGENES_PDF_MM,
    tableWidth: ANCHO_TABLA_PDF_MM,
    styles: {
      font: 'helvetica',
      fontSize: FUENTE_DATOS_PT,
      textColor: COLOR_TEXTO,
      lineColor: COLOR_BORDE,
      lineWidth: 0.2,
      cellPadding: { top: 1.2, right: 1.5, bottom: 1.2, left: 1.5 },
      minCellHeight: ALTO_MINIMO_FILA_MM,
      overflow: 'linebreak',
      valign: 'middle',
    },
    headStyles: {
      fillColor: COLOR_PRIMARIO,
      textColor: COLOR_BLANCO,
      fontStyle: 'bold',
      fontSize: FUENTE_ENCABEZADO_PT,
      halign: 'center',
      valign: 'middle',
      minCellHeight: 8,
      lineWidth: 0.2,
    },
    columnStyles: estilosPorColumna,
    // El título va en CADA página: una hoja suelta del corral tiene que decir
    // de qué chequeo es.
    didDrawPage: () => dibujarEncabezadoPagina(doc, opciones),
  });

  estamparPiesDePagina(doc, hayNumerosProvisionales(opciones.filas));
  return doc;
}

/**
 * Construye el PDF y dispara la descarga. Única función de este archivo que
 * hace I/O: `await import()` dinámico de las dos librerías (no van en el
 * bundle inicial) y `doc.save`.
 */
export async function descargarPlanillaChequeoPDF(
  opciones: OpcionesPlanillaChequeoPDF,
  nombreArchivo: string,
): Promise<void> {
  const [{ default: jsPDF }, { default: autoTable }] = await Promise.all([
    import('jspdf'),
    import('jspdf-autotable'),
  ]);
  const doc = construirDocumentoPlanillaChequeoPDF({ jsPDF, autoTable }, opciones);
  doc.save(nombreArchivo);
}
