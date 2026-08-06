// ARCHIVO: supabase/functions/server/hato-liquidacion-pomar.ts
// DESCRIPCION: Copia Deno-side, GENERADA, de `src/utils/hatoLiquidacionPomar.ts`.
// Regenerar con `python3 docs/hato/regenerar-copias-liquidacion-pomar.py`
// (docs/hato/regenerar-copias-liquidacion-pomar.py) -- NUNCA editar a mano.
//
// POR QUE EXISTE ESTE DUPLICADO: `hato-produccion-quincena-foto.ts` corre en
// el árbol de despliegue de la edge function y no puede importar desde
// `src/utils/` -- misma restriccion que produjo `calculos-hato.ts` y
// `hato-alertas.ts` como copias.
//
// El motor es puro (cero imports), asi que las copias son byte-identicas al
// original debajo de este encabezado. Cambiar la logica exige editar
// `src/utils/hatoLiquidacionPomar.ts` y regenerar -- nunca tocar esta copia.

// ARCHIVO: utils/hatoLiquidacionPomar.ts
// DESCRIPCIÓN: OCR de la liquidación quincenal de El Pomar -- S4 de
// `docs/plan_hato_ronda_agosto_2026.md` (D-8). Gemelo, en miniatura, de
// `importHato/ocrChequeo.ts`: el modelo de visión transcribe, este módulo
// interpreta -- nunca al revés (misma regla dura, CLAUDE.md "Hato Lechero"
// y el brief de S4: "el modelo produce la lectura cruda; el parser la
// interpreta. Nunca un segundo parser.").
//
// A diferencia del chequeo (una grilla de ~35 filas por vaca, con roster y
// anti-row-drift), la liquidación es UN documento de una sola fila de
// datos -- no hay filas que desplazar entre sí, así que no hace falta
// roster ni cotejo de ancla. La defensa que SÍ aplica, igual que en
// ocrChequeo.ts, es "sin dato, nunca 0" aplicada a la lectura: un CAMPO que
// el modelo marca `baja`/`ilegible` entra vacío + una marca explícita,
// jamás una adivinanza -- y un campo que dos fotos leen distinto tampoco se
// adjudica solo (mismo espíritu que `lectura_repetida_divergente` en
// ocrChequeo.ts, aplicado a campo en vez de a fila).
//
// Solo hay UN ejemplar real de esta liquidación al escribir este archivo
// (julio, quincena 02) -- el parser se diseña contra la ESTRUCTURA del
// documento ("CALCULO DE LIQUIDACION" + 3 líneas de título + tabla de una
// fila: PROVEEDOR/NIT/SUCURSAL/PROM PRECIO/CANTIDAD/SUB-TOTAL), no contra
// sus valores concretos, para que un segundo ejemplar (quincena 01, en
// camino) no obligue a reescribirlo.
//
// Por qué NO se reutiliza `parseFechaChequeo`/`MESES` de `calculosHato.ts`:
// ese archivo está protegido por paridad byte-a-byte con dos árboles de
// servidor (`calculosHatoParidad.test.ts`) y su parser de fecha exige
// día+mes+año EMBEBIDOS en el mismo texto (el título de un chequeo); la
// liquidación trae el mes SOLO ("MES: JULIO") y el periodo con rango de
// días aparte ("DEL 16 AL 31 DE JULIO 2026") -- una forma genuinamente
// distinta. Duplicar ~15 líneas de mapa de meses es más barato que abrir
// ese archivo protegido por paridad a exportar un helper que solo esta
// ruta necesita (mismo criterio ya documentado en la cabecera de
// `hatoProduccion.ts`).
//
// Puro, cero I/O, cero `Date.now()`.

// ---------------------------------------------------------------------------
// 1. Lo que el modelo devuelve
// ---------------------------------------------------------------------------

export type ConfianzaCampoOcrLiquidacion = 'alta' | 'baja' | 'ilegible';

export interface CampoOcrLiquidacion {
  /** Transcripción VERBATIM de lo que el modelo ve. Nunca interpretada acá. */
  texto: string;
  confianza: ConfianzaCampoOcrLiquidacion;
}

/** Los 8 campos que el documento trae, en el orden en que aparecen impresos
 * (título de 3 líneas, luego la tabla de una fila). */
export const CAMPOS_OCR_LIQUIDACION = [
  'proveedor',
  'nit',
  'mes',
  'quincena',
  'periodo',
  'precioPromedio',
  'cantidad',
  'subtotal',
] as const;

export type CampoLiquidacionOcr = (typeof CAMPOS_OCR_LIQUIDACION)[number];

export interface LecturaOcrLiquidacion {
  /** 1-based: cuál de las fotos subidas. Lo pone el servidor (una llamada
   * por foto), no el modelo. */
  pagina: number;
  campos: Record<CampoLiquidacionOcr, CampoOcrLiquidacion>;
  /** Avisos de FORMA detectados al parsear la respuesta del modelo (campos
   * faltantes, confianzas inválidas) -- nunca se corrigen en silencio. */
  avisos: string[];
}

function campoIlegible(): CampoOcrLiquidacion {
  return { texto: '', confianza: 'ilegible' };
}

function textoPlano(valor: unknown): string {
  if (valor === null || valor === undefined) return '';
  if (typeof valor === 'string') return valor.trim();
  if (typeof valor === 'number' || typeof valor === 'boolean') return String(valor);
  return '';
}

function normalizarConfianza(valor: unknown, avisos: string[], contexto: string): ConfianzaCampoOcrLiquidacion {
  if (valor === 'alta' || valor === 'baja' || valor === 'ilegible') return valor;
  // Degradar SIEMPRE hacia lo cauteloso: una confianza que no entendemos no
  // puede convertirse en un valor que entra al pipeline como si fuera bueno.
  avisos.push(`${contexto}: confianza '${String(valor)}' no reconocida -- se degradó a 'ilegible'`);
  return 'ilegible';
}

/**
 * Convierte el JSON crudo que devolvió el modelo (ya des-serializado) en una
 * `LecturaOcrLiquidacion`. Un campo mal formado o ausente NUNCA aborta la
 * lectura entera -- se conserva `ilegible`, que es exactamente lo que la
 * ventana de corrección espera ver. Lo único fatal es que la raíz no sea un
 * objeto JSON: ahí no hay nada que rescatar.
 */
export function parsearRespuestaModeloOcrLiquidacion(bruto: unknown, pagina: number): LecturaOcrLiquidacion {
  const avisos: string[] = [];
  if (bruto === null || typeof bruto !== 'object') {
    throw new Error(`La respuesta del modelo para la foto ${pagina} no es un objeto JSON.`);
  }
  const raiz = bruto as Record<string, unknown>;
  const camposBrutos = (raiz.campos ?? {}) as Record<string, unknown>;
  const campos = {} as Record<CampoLiquidacionOcr, CampoOcrLiquidacion>;
  for (const campo of CAMPOS_OCR_LIQUIDACION) {
    const campoBruto = camposBrutos[campo];
    if (campoBruto === null || campoBruto === undefined || typeof campoBruto !== 'object') {
      // Campo ausente en la respuesta: NO es "campo vacío en el papel", es
      // "el modelo no reportó nada". Se marca ilegible para que el humano
      // decida, nunca se asume en blanco.
      campos[campo] = campoIlegible();
      continue;
    }
    const objeto = campoBruto as Record<string, unknown>;
    campos[campo] = {
      texto: textoPlano(objeto.texto),
      confianza: normalizarConfianza(objeto.confianza, avisos, `foto ${pagina}, campo '${campo}'`),
    };
  }
  return { pagina, campos, avisos };
}

// ---------------------------------------------------------------------------
// 2. Parsers deterministas -- los únicos intérpretes de cada campo
// ---------------------------------------------------------------------------

/** Solo la confianza `alta` pasa al parser. `baja`/`ilegible` entran como
 * texto vacío: "sin dato, nunca 0" aplicado a la lectura. */
function textoParaInterpretar(campo: CampoOcrLiquidacion): string {
  return campo.confianza === 'alta' ? campo.texto : '';
}

function normalizarTexto(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim();
}

/**
 * Parsea un valor monetario/numérico en formato colombiano: '.' agrupa
 * miles, ',' separa decimales -- nunca al revés (misma convención que
 * `formatNumber`/`formatCurrency`, en sentido inverso). Tolera un símbolo
 * '$' y espacios alrededor. Cualquier carácter que no sea dígito, '.', ','
 * o '$' hace que el texto no sea un valor monetario reconocible -> `null`
 * (nunca una adivinanza parcial).
 */
export function parseMonedaColombiana(textoBruto: string): number | null {
  const texto = textoBruto.trim();
  if (texto === '') return null;
  if (!/^\$?\s*[\d.,]+$/.test(texto)) return null;
  const sinSimbolo = texto.replace(/\$/g, '').trim();
  if (sinSimbolo === '') return null;
  const sinMiles = sinSimbolo.replace(/\./g, '');
  const normalizado = sinMiles.replace(',', '.');
  const valor = Number(normalizado);
  return Number.isFinite(valor) ? valor : null;
}

const MESES_LIQUIDACION: ReadonlyArray<{ nombre: string; num: number }> = [
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

export interface MesLiquidacion {
  num: number;
  /** Nombre canónico (sin tildes, minúscula) -- para mostrar/comparar, nunca
   * para volver a escribir sobre el texto leído. */
  nombre: string;
}

/** Busca un nombre de mes en español dentro del texto, tolerando
 * abreviaturas de 3 letras (ej. 'jul' para julio) -- mismo criterio de
 * tolerancia que `encontrarMes` en `calculosHato.ts`, reimplementado acá
 * (ver nota de cabecera). */
export function parseMesLiquidacion(textoBruto: string): MesLiquidacion | null {
  const norm = normalizarTexto(textoBruto);
  if (norm === '') return null;
  for (const { nombre, num } of MESES_LIQUIDACION) {
    if (norm.includes(nombre) || norm.includes(nombre.slice(0, 3))) return { num, nombre };
  }
  return null;
}

/** Extrae 1 o 2 del texto de la quincena (tolera '01'/'1'/'02'/'2'). Ningún
 * otro valor es una quincena válida -- el módulo solo conoce 1ª y 2ª. */
export function parseQuincenaLiquidacion(textoBruto: string): 1 | 2 | null {
  const match = textoBruto.match(/\d+/);
  if (!match) return null;
  const n = parseInt(match[0], 10);
  return n === 1 ? 1 : n === 2 ? 2 : null;
}

/** NIT: solo dígitos, longitud plausible (6-15). Nunca valida dígito de
 * verificación -- eso pertenece a un catálogo (`fin_proveedores`), no a
 * este parser, y el documento no lo necesita para nada operativo (ver
 * cabecera del módulo: el proveedor/NIT del documento es metadato de
 * auditoría, no se resuelve contra ningún catálogo). */
export function parseNitLiquidacion(textoBruto: string): string | null {
  const digitos = textoBruto.replace(/\D/g, '');
  return digitos.length >= 6 && digitos.length <= 15 ? digitos : null;
}

export interface PeriodoLiquidacion {
  /** ISO `YYYY-MM-DD`. */
  inicio: string | null;
  fin: string | null;
}

const REGEX_PERIODO = /del\s+(\d{1,2})\s+al\s+(\d{1,2})\s+de\s+([a-zñ]+)\s+(?:de\s+)?(\d{4})/i;

/**
 * Parsea "PERIODO COMPRENDIDO DEL 16 AL 31 DE JULIO 2026" -> fechas ISO. Si
 * el patrón no calza, o el mes no se reconoce, o los días no son días
 * plausibles: `{ inicio: null, fin: null }`, nunca una fecha inventada a
 * medias.
 */
export function parsePeriodoLiquidacion(textoBruto: string): PeriodoLiquidacion {
  const NULO: PeriodoLiquidacion = { inicio: null, fin: null };
  const match = normalizarTexto(textoBruto).match(REGEX_PERIODO);
  if (!match) return NULO;
  const [, diaInicioTxt, diaFinTxt, mesTxt, anioTxt] = match;
  const mes = parseMesLiquidacion(mesTxt);
  if (!mes) return NULO;
  const diaInicio = parseInt(diaInicioTxt, 10);
  const diaFin = parseInt(diaFinTxt, 10);
  if (diaInicio < 1 || diaInicio > 31 || diaFin < 1 || diaFin > 31) return NULO;
  const anio = parseInt(anioTxt, 10);
  const iso = (dia: number) => `${anio}-${String(mes.num).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
  return { inicio: iso(diaInicio), fin: iso(diaFin) };
}

// ---------------------------------------------------------------------------
// 3. Interpretación de una lectura (una foto) y combinación de varias
// ---------------------------------------------------------------------------

export interface LiquidacionInterpretada {
  proveedor: string | null;
  nit: string | null;
  /** 1-12. */
  mes: number | null;
  /** Nombre canónico del mes leído (sin tildes, minúscula) -- solo para
   * mostrar junto al número, nunca la fuente de verdad (esa es `mes`). */
  mesNombre: string | null;
  quincena: 1 | 2 | null;
  periodoInicio: string | null;
  periodoFin: string | null;
  precioPromedioLitro: number | null;
  cantidadLitros: number | null;
  subtotal: number | null;
  /** Campos que el modelo marcó `baja`/`ilegible` -- entraron vacíos, hay
   * que revisarlos a mano antes de guardar. */
  camposNoConfiables: CampoLiquidacionOcr[];
  /** Avisos de parseo (un campo con confianza alta que aun así no se pudo
   * interpretar) -- nunca se descartan en silencio. */
  advertencias: string[];
}

function agregarAdvertenciaSiNoParsea(
  advertencias: string[],
  campoTexto: string,
  campoNombre: string,
  parseoOk: boolean,
): void {
  if (campoTexto !== '' && !parseoOk) {
    advertencias.push(`el campo '${campoNombre}' se leyó como '${campoTexto}' pero no se pudo interpretar -- revisar a mano`);
  }
}

/**
 * Interpreta UNA lectura (una foto) del documento. Cada campo pasa por su
 * parser determinista; un campo `baja`/`ilegible` entra vacío y por tanto
 * `null` en el resultado (nunca una adivinanza).
 */
export function interpretarLecturaLiquidacion(lectura: LecturaOcrLiquidacion): LiquidacionInterpretada {
  const camposNoConfiables = CAMPOS_OCR_LIQUIDACION.filter((c) => lectura.campos[c].confianza !== 'alta');
  const advertencias: string[] = [];

  const proveedorTexto = textoParaInterpretar(lectura.campos.proveedor);
  const nitTexto = textoParaInterpretar(lectura.campos.nit);
  const mesTexto = textoParaInterpretar(lectura.campos.mes);
  const quincenaTexto = textoParaInterpretar(lectura.campos.quincena);
  const periodoTexto = textoParaInterpretar(lectura.campos.periodo);
  const precioTexto = textoParaInterpretar(lectura.campos.precioPromedio);
  const cantidadTexto = textoParaInterpretar(lectura.campos.cantidad);
  const subtotalTexto = textoParaInterpretar(lectura.campos.subtotal);

  const mes = mesTexto ? parseMesLiquidacion(mesTexto) : null;
  agregarAdvertenciaSiNoParsea(advertencias, mesTexto, 'mes', mes !== null);

  const quincena = quincenaTexto ? parseQuincenaLiquidacion(quincenaTexto) : null;
  agregarAdvertenciaSiNoParsea(advertencias, quincenaTexto, 'quincena', quincena !== null);

  const periodo = periodoTexto ? parsePeriodoLiquidacion(periodoTexto) : { inicio: null, fin: null };
  agregarAdvertenciaSiNoParsea(advertencias, periodoTexto, 'periodo', periodo.inicio !== null);

  const nit = nitTexto ? parseNitLiquidacion(nitTexto) : null;
  agregarAdvertenciaSiNoParsea(advertencias, nitTexto, 'nit', nit !== null);

  const precioPromedioLitro = precioTexto ? parseMonedaColombiana(precioTexto) : null;
  agregarAdvertenciaSiNoParsea(advertencias, precioTexto, 'precio promedio', precioPromedioLitro !== null);

  const cantidadLitros = cantidadTexto ? parseMonedaColombiana(cantidadTexto) : null;
  agregarAdvertenciaSiNoParsea(advertencias, cantidadTexto, 'cantidad', cantidadLitros !== null);

  const subtotal = subtotalTexto ? parseMonedaColombiana(subtotalTexto) : null;
  agregarAdvertenciaSiNoParsea(advertencias, subtotalTexto, 'subtotal', subtotal !== null);

  return {
    proveedor: proveedorTexto || null,
    nit,
    mes: mes?.num ?? null,
    mesNombre: mes?.nombre ?? null,
    quincena,
    periodoInicio: periodo.inicio,
    periodoFin: periodo.fin,
    precioPromedioLitro,
    cantidadLitros,
    subtotal,
    camposNoConfiables: [...camposNoConfiables],
    advertencias,
  };
}

function unicoValor<T>(valores: readonly (T | null)[]): { valor: T | null; divergente: boolean } {
  const presentes = valores.filter((v): v is T => v !== null);
  if (presentes.length === 0) return { valor: null, divergente: false };
  const primero = presentes[0];
  const divergente = presentes.some((v) => v !== primero);
  return { valor: divergente ? null : primero, divergente };
}

export interface ResultadoCombinacionLiquidacion {
  resultado: LiquidacionInterpretada;
  /** Una interpretación por foto recibida, en el orden dado -- para que la
   * UI pueda mostrar "la foto 2 decía X" si hace falta. */
  interpretadas: LiquidacionInterpretada[];
}

/**
 * Combina 1..N lecturas (una por foto) del MISMO documento. Con una sola
 * foto, se devuelve tal cual. Con varias: por cada campo, si todas las
 * fotos que sí leyeron algo coinciden, se usa ese valor; si DIVERGEN, el
 * campo queda `null` (nunca se adjudica solo) y se agrega una advertencia
 * nombrando los campos en conflicto -- mismo espíritu que
 * `lectura_repetida_divergente` en `ocrChequeo.ts`, aplicado a campo en vez
 * de a fila (acá no hay filas que anclar, solo un documento).
 */
export function combinarLecturasLiquidacion(
  lecturas: readonly LecturaOcrLiquidacion[],
): ResultadoCombinacionLiquidacion {
  if (lecturas.length === 0) {
    throw new Error('combinarLecturasLiquidacion: se requiere al menos una lectura -- error del llamador, no del OCR.');
  }
  const interpretadas = lecturas.map(interpretarLecturaLiquidacion);
  if (interpretadas.length === 1) {
    return { resultado: interpretadas[0], interpretadas };
  }

  const camposNoConfiables = [...new Set(interpretadas.flatMap((i) => i.camposNoConfiables))] as CampoLiquidacionOcr[];
  const advertencias = [...new Set(interpretadas.flatMap((i) => i.advertencias))];

  const proveedor = unicoValor(interpretadas.map((i) => i.proveedor));
  const nit = unicoValor(interpretadas.map((i) => i.nit));
  const mes = unicoValor(interpretadas.map((i) => i.mes));
  const mesNombre = unicoValor(interpretadas.map((i) => i.mesNombre));
  const quincena = unicoValor(interpretadas.map((i) => i.quincena));
  const periodoInicio = unicoValor(interpretadas.map((i) => i.periodoInicio));
  const periodoFin = unicoValor(interpretadas.map((i) => i.periodoFin));
  const precioPromedioLitro = unicoValor(interpretadas.map((i) => i.precioPromedioLitro));
  const cantidadLitros = unicoValor(interpretadas.map((i) => i.cantidadLitros));
  const subtotal = unicoValor(interpretadas.map((i) => i.subtotal));

  const divergentes: string[] = [];
  const marcar = (nombre: string, r: { divergente: boolean }) => {
    if (r.divergente) divergentes.push(nombre);
  };
  marcar('proveedor', proveedor);
  marcar('nit', nit);
  marcar('mes', mes);
  marcar('quincena', quincena);
  marcar('periodo', periodoInicio.divergente || periodoFin.divergente ? { divergente: true } : { divergente: false });
  marcar('precio promedio', precioPromedioLitro);
  marcar('cantidad', cantidadLitros);
  marcar('subtotal', subtotal);

  if (divergentes.length > 0) {
    advertencias.push(
      `las fotos no coinciden en: ${divergentes.join(', ')} -- ningún valor se adjudicó solo, revisar a mano`,
    );
  }

  return {
    resultado: {
      proveedor: proveedor.valor,
      nit: nit.valor,
      mes: mes.valor,
      mesNombre: mesNombre.valor,
      quincena: quincena.valor,
      periodoInicio: periodoInicio.valor,
      periodoFin: periodoFin.valor,
      precioPromedioLitro: precioPromedioLitro.valor,
      cantidadLitros: cantidadLitros.valor,
      subtotal: subtotal.valor,
      camposNoConfiables,
      advertencias,
    },
    interpretadas,
  };
}

// ---------------------------------------------------------------------------
// 4. Coherencia interna -- avisa, nunca corrige
// ---------------------------------------------------------------------------

/** Tolerancia en pesos para precio_promedio × cantidad vs. subtotal --
 * redondeo de la planilla/OCR, nunca una licencia para "casi coincide". */
const TOLERANCIA_COHERENCIA_SUBTOTAL_PESOS = 1;

/**
 * Si los tres valores están presentes, avisa cuando `precioPromedioLitro ×
 * cantidadLitros` no coincide con `subtotal` leído -- señal de que uno de
 * los tres se leyó mal. Nunca decide cuál está bien ni corrige nada: el
 * humano revisa los tres antes de guardar (mismo "sin dato, nunca 0"
 * aplicado a la coherencia, no solo a la ausencia).
 */
export function validarCoherenciaLiquidacion(liq: LiquidacionInterpretada): string | null {
  const { precioPromedioLitro, cantidadLitros, subtotal } = liq;
  if (precioPromedioLitro == null || cantidadLitros == null || subtotal == null) return null;
  const esperado = precioPromedioLitro * cantidadLitros;
  if (Math.abs(esperado - subtotal) > TOLERANCIA_COHERENCIA_SUBTOTAL_PESOS) {
    return `precio promedio × cantidad (${esperado.toLocaleString('es-CO')}) no coincide con el subtotal leído (${subtotal.toLocaleString('es-CO')}) -- revisa los tres valores antes de guardar`;
  }
  return null;
}

// ---------------------------------------------------------------------------
// 5. Prompt y esquema de salida del modelo de visión
// ---------------------------------------------------------------------------

/**
 * Esquema JSON estricto de la respuesta del modelo. Mismo criterio que
 * `esquemaJsonOcr` (`importHato/ocrChequeo.ts`): sin uniones de tipo, todas
 * las propiedades requeridas -- la ausencia se expresa con texto vacío +
 * `confianza: 'ilegible'`.
 */
export function esquemaJsonOcrLiquidacion(): Record<string, unknown> {
  const campo = {
    type: 'object',
    properties: {
      texto: {
        type: 'string',
        description: 'Transcripción literal del campo. Cadena vacía si está en blanco o no se puede leer.',
      },
      confianza: {
        type: 'string',
        enum: ['alta', 'baja', 'ilegible'],
        description:
          "'alta' solo si estás seguro de cada carácter. Si dudas usa 'baja'. Si no se puede leer usa 'ilegible' y deja texto vacío.",
      },
    },
    required: ['texto', 'confianza'],
    additionalProperties: false,
  };

  const propiedadesCampos: Record<string, unknown> = {};
  for (const c of CAMPOS_OCR_LIQUIDACION) propiedadesCampos[c] = { ...campo };

  return {
    type: 'object',
    properties: {
      campos: {
        type: 'object',
        properties: propiedadesCampos,
        required: [...CAMPOS_OCR_LIQUIDACION],
        additionalProperties: false,
      },
    },
    required: ['campos'],
    additionalProperties: false,
  };
}

/**
 * Prompt de transcripción del documento de liquidación. Deliberadamente NO
 * incluye ningún valor esperado (a diferencia del vocabulario cerrado del
 * chequeo, que orienta pero no restringe): este documento no tiene un
 * vocabulario cerrado que ayude, es texto/números libres.
 */
export function construirPromptOcrLiquidacion(): string {
  return [
    'Eres un transcriptor de documentos de liquidación de leche de un hato lechero en Colombia. Tu único trabajo es TRANSCRIBIR lo que ves, no interpretarlo.',
    '',
    'El documento es una tabla titulada "CALCULO DE LIQUIDACION", con un título de 2-3 líneas (mes, quincena, periodo) arriba de una tabla con una fila de datos y estas columnas: PROVEEDOR, NIT, SUCURSAL, PROM PRECIO, CANTIDAD, SUB-TOTAL.',
    '',
    'Transcribe estos 8 campos EXACTAMENTE como aparecen impresos:',
    "1. 'proveedor': el nombre en la columna PROVEEDOR.",
    "2. 'nit': el número en la columna NIT.",
    "3. 'mes': el nombre del mes, de la línea 'MES: ...'.",
    "4. 'quincena': el número de quincena (01 o 02), de la línea 'QUINCENA: ...'.",
    "5. 'periodo': la línea completa 'PERIODO COMPRENDIDO DEL ... AL ... DE ... DE ...', tal cual.",
    "6. 'precioPromedio': el valor de la columna PROM PRECIO, con el símbolo $ y los puntos/comas tal como aparecen.",
    "7. 'cantidad': el valor de la columna CANTIDAD, igual de literal.",
    "8. 'subtotal': el valor de la columna SUB-TOTAL, igual de literal.",
    '',
    'REGLAS DURAS:',
    '1. NO interpretes, NO corrijas y NO conviertas formatos: transcribe el texto exactamente como aparece, símbolos de moneda y separadores incluidos.',
    "2. Confianza obligatoria por campo: 'alta' solo si estás seguro de cada carácter; 'baja' si dudas; 'ilegible' si no se puede leer. En 'baja'/'ilegible' deja el texto vacío o lo poco que veas, pero NUNCA adivines un valor plausible. Un campo mal adivinado es peor que un campo vacío.",
    '3. Si la tabla tiene más de una fila de datos, transcribe SOLO la primera.',
    '',
    'Responde ÚNICAMENTE con el JSON del esquema pedido. Sin explicaciones, sin markdown.',
  ].join('\n');
}
