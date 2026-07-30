// ARCHIVO: utils/hatoCorreccionChequeo.ts
// DESCRIPCIÓN: Lógica PURA de la ventana de corrección del chequeo (Fase 3a de
// `docs/plan_chequeo_captura_foto.md`, decisión D-C del dueño 2026-07-29):
// quien revisa el diff puede corregir los valores NORMALIZADOS de una fila,
// fijar la fecha del chequeo y adjudicar identidades antes de aprobar.
//
// Por qué este archivo vive FUERA de `utils/importHato/`: esos módulos están
// ESPEJADOS en los dos árboles de edge functions por
// `docs/hato/regenerar-copias-importhato.py` y son el contrato del parser.
// Corregir a mano es una decisión de la REVISIÓN (frontend), no del parseo --
// no hay ningún camino de servidor que la necesite, así que no se toca ni un
// byte de los espejos. Lo que sí se reusa, sin duplicar nada:
//
//   * `construirDiffChequeo` (`importHato/diffChequeo.ts`) sigue siendo el
//     ÚNICO motor de comparación. Este módulo solo produce filas corregidas;
//     re-clasificarlas es trabajo de ese motor, en cliente y en el commit.
//   * los parsers de celda de `calculosHato.ts` (`parseValorNumerico`,
//     `parseSX`, `parseEstado` vía su vocabulario) y `parseToro` son los
//     ÚNICOS intérpretes: un valor tecleado por un humano se interpreta con el
//     MISMO parser que interpretó el archivo, nunca con un segundo criterio.
//   * `calcularFechaSecar`/`calcularPartoProbable` re-derivan SECAR/PP igual
//     que `importHato/chequeos.ts` (raza=null -> `_default` de `HatoConfig`,
//     porque tampoco acá se conoce la raza confirmada del animal).
//
// ============================================================================
// REGLA DURA -- la capa cruda NUNCA se sobreescribe.
// ============================================================================
// `construirFilasVacas` copia los `*_raw` VERBATIM del archivo. Si un humano
// corrige el valor normalizado, el crudo deja de coincidir: eso es CORRECTO y
// deseado (crudo = lo que decía el papel; normalizado = lo que resolvió el
// humano), pero no puede quedar invisible. Cada corrección emite un
// `ParseIssue` con el prefijo `CORRECCIÓN MANUAL [campo]` que viaja por el
// camino que YA existe -- `fila.issues` -> `hato_chequeo_vacas.normalizacion_issues`
// (jsonb) -- y queda en la base junto al crudo intacto.
//
// Por qué `normalizacion_issues` y no una columna/tabla nueva:
//   1. Es el ÚNICO canal que ya llega a la BD desde una fila del diff
//      (`construirFilasVacas`), sin migración, sin tocar la RPC 065 ni el
//      contrato del commit.
//   2. Su semántica ya es exactamente esta: "algo de esta celda necesita que un
//      humano lo sepa, con el crudo intacto al lado" -- una corrección manual
//      es el caso más fuerte de eso, no una excepción.
//   3. La UI ya muestra `issues[]` de cada fila sin filtrar, así que la
//      corrección es visible en la misma pantalla donde se hizo.
// `ParseIssue` es `{ crudo, motivo }` y vive en `calculosHato.ts`, que está
// espejado en TRES copias: agregarle campos estructurados obligaría a tocar
// los tres espejos por un dato de UI. Por eso la información estructurada se
// codifica en el texto con un prefijo estable y parseable
// (`PREFIJO_ISSUE_CORRECCION_MANUAL`), y `crudo` guarda lo que decía el
// archivo en esa celda.
//
// ============================================================================
// Campos corregibles -- y los dos que deliberadamente NO lo son.
// ============================================================================
// Corregibles: los que tienen capa NORMALIZADA propia, separada del crudo.
// `construirDiffChequeo` compara nombre, PL, # partos, fecha de servicio, toro,
// tipo de servicio, estado (y las derivadas SECAR/PP, que no se editan: se
// re-derivan). `numero` no se compara pero ES la identidad con la que se
// matchea el animal, así que corregirlo es la única forma humana de adjudicar
// una colisión de chapeta o una caravana mal leída. `sx` no entra al diff pero
// sí decide qué eventos se escriben (`descomponerSX`), así que se corrige.
//
// NO corregibles, por la regla dura de arriba:
//   * `Última Cría` y `Tratamiento` existen SOLO como crudo
//     (`raw.ultimaCria`, `raw.ttto`): `FilaChequeoNormalizada` no tiene
//     contraparte normalizada para ninguno de los dos (el commit deriva el
//     parto parseando `raw.ultimaCria` en el momento). Corregirlos exigiría
//     reescribir el crudo -- prohibido -- o agregarle un campo normalizado a
//     `importHato/tipos.ts`, que es archivo espejado y contrato del parser.
//     Se muestran de solo lectura y se dice por qué; corregir una Última Cría
//     mal leída se hace hoy registrando el parto en la ficha del animal.
//   * `TP` no se interpreta nunca (fórmula `TODAY()` congelada) -- ver
//     `calculosHato.ts`.

import {
  calcularFechaSecar,
  calcularPartoProbable,
  parseSX,
  parseValorNumerico,
  type HatoConfig,
  type ParseIssue,
  type TipoEstado,
} from '@/utils/calculosHato';
import { parseToro } from '@/utils/importHato/parseToro';
import type { FilaChequeoNormalizada } from '@/utils/importHato/tipos';
import type { ClasificacionFilaDiff, ResultadoDiffChequeo } from '@/utils/importHato/diffChequeo';

// ============================================================================
// 1. Catálogo de campos corregibles
// ============================================================================

export type CampoCorreccionChequeo =
  | 'numero'
  | 'nombre'
  | 'pl'
  | 'numPartos'
  | 'sx'
  | 'fechaServicio'
  | 'toro'
  | 'tipoServicio'
  | 'estado';

export type TipoEntradaCorreccion = 'numero' | 'texto' | 'fecha' | 'seleccion';

export interface OpcionCorreccion {
  valor: string;
  etiqueta: string;
}

export interface MetaCampoCorreccion {
  campo: CampoCorreccionChequeo;
  /** Rótulo en español, el mismo vocabulario que la planilla. */
  etiqueta: string;
  tipo: TipoEntradaCorreccion;
  /** Solo para `tipo === 'seleccion'`. La opción de valor `''` es "sin dato". */
  opciones?: OpcionCorreccion[];
  /** `true` si `construirDiffChequeo` compara este campo -- corregirlo puede
   * cambiar la clasificación de la fila en vivo. */
  entraEnDiff: boolean;
  ayuda: string;
}

/** Estados que un humano puede elegir. `fecha_heredada` queda FUERA a
 * propósito: es un residuo de la columna `SEC REAL` de las planillas Gen 1
 * (ver `parseEstado`), su significado vive en la fecha del crudo y nadie lo
 * escogería como estado real de una vaca hoy. */
const OPCIONES_ESTADO: OpcionCorreccion[] = [
  { valor: '', etiqueta: 'Sin dato' },
  { valor: 'vacia_apta', etiqueta: 'Vacía apta (ok)' },
  { valor: 'vacia_problema', etiqueta: 'Requiere rechequeo (rech)' },
  { valor: 'desconocido', etiqueta: 'Código no reconocido' },
];

const OPCIONES_TIPO_SERVICIO: OpcionCorreccion[] = [
  { valor: '', etiqueta: 'Sin dato' },
  { valor: 'monta', etiqueta: 'Monta' },
  { valor: 'inseminacion', etiqueta: 'Inseminación' },
];

/**
 * Orden CANÓNICO de los campos: es también el orden en que se APLICAN las
 * correcciones, y eso importa en un caso real -- `toro` se aplica ANTES que
 * `tipoServicio` porque `parseToro` puede deducir el tipo del prefijo
 * (`Ins `/`Toro `, lo que emite `textoCeldaToro` en la planilla), y una
 * selección explícita de tipo de servicio debe poder ganarle a esa deducción.
 */
export const CAMPOS_CORRECCION_CHEQUEO: readonly MetaCampoCorreccion[] = [
  {
    campo: 'numero',
    etiqueta: 'Caravana (#)',
    tipo: 'numero',
    entraEnDiff: false,
    ayuda:
      'Identidad con la que se matchea el animal. Corregirla es la forma de adjudicar una chapeta repetida en la hoja o una caravana mal leída — nada se adjudica solo.',
  },
  {
    campo: 'nombre',
    etiqueta: 'Nombre',
    tipo: 'texto',
    entraEnDiff: true,
    ayuda: 'El diff compara el nombre de la planilla contra el de la ficha; corregirlo no renombra al animal.',
  },
  {
    campo: 'pl',
    etiqueta: 'PL',
    tipo: 'numero',
    entraEnDiff: true,
    ayuda: 'Litros del chequeo. Vacío = sin dato, nunca 0.',
  },
  {
    campo: 'numPartos',
    etiqueta: '# Partos',
    tipo: 'numero',
    entraEnDiff: true,
    ayuda: 'Número entero de partos. Vacío = sin dato, nunca 0.',
  },
  {
    campo: 'sx',
    etiqueta: 'SX (cría)',
    tipo: 'texto',
    entraEnDiff: false,
    ayuda:
      'Código de la cría (OV / AV / A 206 / A+ / O+ / gem+). No entra al diff, pero decide qué eventos de parto se escriben; se interpreta con parseSX, el único intérprete del código SX.',
  },
  {
    campo: 'fechaServicio',
    etiqueta: 'Fecha de servicio',
    tipo: 'fecha',
    entraEnDiff: true,
    ayuda:
      'Reemplaza el servicio VIGENTE (el más reciente de la celda). SECAR y Parto probable se re-derivan solos: no se editan a mano.',
  },
  {
    campo: 'toro',
    etiqueta: 'Toro',
    tipo: 'texto',
    entraEnDiff: true,
    ayuda:
      'Se interpreta con parseToro (acepta el prefijo "Ins "/"Toro " de la planilla). Un toro que no exista en el catálogo se crea al aprobar — se avisa antes.',
  },
  {
    campo: 'tipoServicio',
    etiqueta: 'Tipo de servicio',
    tipo: 'seleccion',
    opciones: OPCIONES_TIPO_SERVICIO,
    entraEnDiff: true,
    ayuda: 'Gana sobre lo que deduzca el texto del toro.',
  },
  {
    campo: 'estado',
    etiqueta: 'Estado',
    tipo: 'seleccion',
    opciones: OPCIONES_ESTADO,
    entraEnDiff: true,
    ayuda: 'Vacío = la celda no se llenó ("no se checó"), nunca "vacía apta".',
  },
];

/** Campos que la ventana muestra de SOLO LECTURA con su razón -- ver la
 * cabecera del archivo. La UI los lista para que "no se puede corregir acá"
 * sea explícito y no un olvido aparente. */
export const CAMPOS_NO_CORREGIBLES: readonly { etiqueta: string; motivo: string }[] = [
  {
    etiqueta: 'Última Cría',
    motivo:
      'solo existe como valor crudo (ultima_cria_raw) y el crudo nunca se sobreescribe; el parto se corrige registrándolo en la ficha del animal.',
  },
  {
    etiqueta: 'Tratamiento',
    motivo: 'solo existe como valor crudo (ttto_raw); los tratamientos se gestionan en su propio flujo.',
  },
  {
    etiqueta: 'SECAR / Parto probable',
    motivo: 'son derivadas de la fecha de servicio — se recalculan solas al corregirla, nunca se teclean.',
  },
  {
    etiqueta: 'TP',
    motivo: 'nunca se interpreta: es una fórmula TODAY() congelada del Excel, no un dato del chequeo.',
  },
];

/** Prefijo ESTABLE del `motivo` de todo issue de corrección humana. Cualquier
 * consulta futura (`normalizacion_issues @> ...`, auditoría) debe buscar este
 * texto -- no se cambia sin migrar los datos ya escritos. */
export const PREFIJO_ISSUE_CORRECCION_MANUAL = 'CORRECCIÓN MANUAL';

/** Campo sintético del issue que registra la fecha del chequeo fijada a mano
 * (no es un `CampoCorreccionChequeo`: es un dato del chequeo, no de la fila). */
export const CAMPO_ISSUE_FECHA_CHEQUEO = 'fechaChequeo';

// ============================================================================
// 2. Forma de las correcciones (texto tecleado por el humano)
// ============================================================================

/** Lo que el humano escribió, por campo, TAL CUAL. Se guarda el texto y no el
 * valor ya interpretado para que (a) el input sea controlado sin pelearse con
 * el parser mientras se escribe, y (b) el issue de auditoría pueda citar
 * exactamente lo que se tecleó. `undefined` = ese campo no se tocó. */
export type CorreccionesFilaTexto = Partial<Record<CampoCorreccionChequeo, string>>;

/** Correcciones de toda la hoja, indexadas por `FilaChequeoNormalizada.fila`
 * (1-indexed como Excel) -- la MISMA llave con la que el diff y el commit
 * identifican una fila. */
export type CorreccionesPorFila = Record<number, CorreccionesFilaTexto>;

export interface ErrorCorreccionChequeo {
  fila: number;
  campo: CampoCorreccionChequeo;
  /** Lo que se tecleó, verbatim -- nunca se descarta, ni en el mensaje. */
  valorIngresado: string;
  mensaje: string;
}

export interface ResultadoCorreccionFila {
  fila: FilaChequeoNormalizada;
  camposCorregidos: CampoCorreccionChequeo[];
  errores: ErrorCorreccionChequeo[];
}

// ============================================================================
// 3. Representación textual de un valor normalizado (para prellenar el input)
// ============================================================================

/**
 * El texto que el input muestra para un campo cuando el humano no lo ha
 * tocado. Es también la referencia contra la que se decide si lo tecleado ES
 * una corrección: si coincide, no se registra nada (entrar y salir de un
 * campo sin cambiarlo no puede fabricar un issue de "corrección manual").
 */
export function valorParaEdicion(fila: FilaChequeoNormalizada, campo: CampoCorreccionChequeo): string {
  switch (campo) {
    case 'numero':
      return fila.numero != null ? String(fila.numero) : '';
    case 'nombre':
      return fila.nombre ?? '';
    case 'pl':
      return fila.pl != null ? String(fila.pl) : '';
    case 'numPartos':
      return fila.numPartos != null ? String(fila.numPartos) : '';
    case 'sx':
      // El crudo del código SX es la forma editable natural (`A 206`), no el
      // `tipo` interno del parser. `vacio` = celda sin código.
      return fila.sx && fila.sx.tipo !== 'vacio' ? fila.sx.crudo : '';
    case 'fechaServicio':
      // El VIGENTE es el último de la lista (V7: la celda puede traer varios
      // intentos; el vigente es siempre el más reciente).
      return fila.fechasServicio.at(-1) ?? '';
    case 'toro':
      return fila.toroNombre ?? '';
    case 'tipoServicio':
      return fila.tipoServicio ?? '';
    case 'estado':
      return fila.estado == null || fila.estado === 'vacio' ? '' : fila.estado;
    default: {
      const _exhaustivo: never = campo;
      return String(_exhaustivo);
    }
  }
}

/** El valor CRUDO del archivo para ese campo, o `null` si el campo no tiene
 * columna cruda (`numero`/`nombre` van impresos, no los escribe nadie a mano;
 * `tipoServicio` sale de la misma celda `Toro`). Es lo que se guarda en
 * `ParseIssue.crudo`: la corrección siempre cita lo que decía el papel. */
function crudoDelCampo(fila: FilaChequeoNormalizada, campo: CampoCorreccionChequeo): string | null {
  switch (campo) {
    case 'pl':
      return fila.raw.pl;
    case 'numPartos':
      return fila.raw.np;
    case 'sx':
      return fila.raw.sx;
    case 'fechaServicio':
      return fila.raw.fechaServicio;
    case 'toro':
    case 'tipoServicio':
      return fila.raw.toro;
    case 'estado':
      return fila.raw.estado;
    case 'numero':
    case 'nombre':
      return null;
    default: {
      const _exhaustivo: never = campo;
      return String(_exhaustivo);
    }
  }
}

// ============================================================================
// 4. Validación de fechas
// ============================================================================

/** `true` solo si el texto es `yyyy-mm-dd` Y esa fecha existe en el
 * calendario (rechaza 2026-02-30, 2026-13-01). Comparación por componentes,
 * nunca `new Date(texto)` -- eso interpreta UTC y corre el día en Bogotá
 * (bug ya corregido en `format.ts`). */
export function esFechaIsoReal(texto: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(texto);
  if (!m) return false;
  const anio = Number(m[1]);
  const mes = Number(m[2]);
  const dia = Number(m[3]);
  if (mes < 1 || mes > 12 || dia < 1) return false;
  const diasDelMes = [31, esBisiesto(anio) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][mes - 1];
  return dia <= diasDelMes;
}

function esBisiesto(anio: number): boolean {
  return (anio % 4 === 0 && anio % 100 !== 0) || anio % 400 === 0;
}

/** Año más antiguo aceptable para la fecha de un chequeo. El corpus histórico
 * arranca en 2019; se deja margen sin volverse permisivo con un año tecleado
 * mal (`2016` es plausible, `1926` no). */
const ANIO_MINIMO_CHEQUEO = 2015;

export interface ResultadoValidacionFechaChequeo {
  /** `null` cuando hay error -- nunca una fecha "arreglada" a la fuerza. */
  fecha: string | null;
  error: string | null;
}

/**
 * Valida la fecha del chequeo que se envía al commit. Existe porque la
 * planilla exportada usa la fecha de HOY como PLACEHOLDER en el título (ver
 * `ChequeosList.tsx`) y hasta ahora, si nadie la corregía en el Excel, el
 * chequeo entero se guardaba con una fecha equivocada sin red de seguridad.
 *
 * `hoy` se recibe como parámetro (pureza: nunca `new Date()` acá dentro).
 */
export function validarFechaChequeo(texto: string, hoy: string): ResultadoValidacionFechaChequeo {
  const valor = texto.trim();
  if (valor === '') {
    return {
      fecha: null,
      error: 'La fecha del chequeo es obligatoria — el archivo no la trajo o no se pudo leer, así que hay que fijarla a mano.',
    };
  }
  if (!esFechaIsoReal(valor)) {
    return { fecha: null, error: `«${valor}» no es una fecha real (formato aaaa-mm-dd).` };
  }
  if (Number(valor.slice(0, 4)) < ANIO_MINIMO_CHEQUEO) {
    return { fecha: null, error: `El año ${valor.slice(0, 4)} está fuera de rango: el hato no tiene chequeos anteriores a ${ANIO_MINIMO_CHEQUEO}.` };
  }
  if (valor > hoy) {
    return { fecha: null, error: 'La fecha del chequeo no puede estar en el futuro.' };
  }
  return { fecha: valor, error: null };
}

// ============================================================================
// 5. Aplicación de las correcciones a UNA fila
// ============================================================================

function issueCorreccion(
  campo: string,
  etiqueta: string,
  anterior: string,
  nuevo: string,
  crudo: string | null,
): ParseIssue {
  return {
    // El crudo del archivo, intacto. Cadena vacía cuando la columna no tiene
    // capa cruda -- nunca se rellena con el valor corregido, que sería
    // exactamente la confusión que este issue existe para evitar.
    crudo: crudo ?? '',
    motivo:
      `${PREFIJO_ISSUE_CORRECCION_MANUAL} [${campo}] ${etiqueta}: «${anterior === '' ? 'sin dato' : anterior}» → ` +
      `«${nuevo === '' ? 'sin dato' : nuevo}». Corregido por una persona en la ventana de revisión del chequeo; ` +
      'el valor crudo del archivo se conserva intacto en la capa *_raw.',
  };
}

function interpretarEntero(
  texto: string,
  { minimo }: { minimo: number },
): { valor: number | null; error: string | null } {
  const { valor, issues } = parseValorNumerico(texto);
  if (valor === null) {
    return { valor: null, error: issues[0]?.motivo ?? 'no se pudo leer como número' };
  }
  if (!Number.isInteger(valor)) return { valor: null, error: 'debe ser un número entero' };
  if (valor < minimo) return { valor: null, error: `no puede ser menor que ${minimo}` };
  return { valor, error: null };
}

/**
 * Aplica las correcciones de UNA fila y devuelve una fila NUEVA (nunca mutada)
 * con la capa normalizada corregida, la capa cruda intacta y un issue de
 * auditoría por cada campo corregido.
 *
 * Un valor que no se puede interpretar NO se aplica y NO se convierte en
 * `null` en silencio: sale en `errores` para que la UI lo señale y bloquee la
 * aprobación de esa fila. "Nada se descarta en silencio" también aplica a lo
 * que teclea un humano.
 */
export function aplicarCorreccionesFila(
  original: FilaChequeoNormalizada,
  correcciones: CorreccionesFilaTexto | undefined,
  config: HatoConfig,
): ResultadoCorreccionFila {
  const camposCorregidos: CampoCorreccionChequeo[] = [];
  const errores: ErrorCorreccionChequeo[] = [];

  if (!correcciones || Object.keys(correcciones).length === 0) {
    return { fila: original, camposCorregidos, errores };
  }

  const fila: FilaChequeoNormalizada = {
    ...original,
    // Copias defensivas: nadie que reciba el resultado debe poder mutar la
    // fila original (la de la respuesta del endpoint) por referencia.
    raw: { ...original.raw },
    fechasServicio: [...original.fechasServicio],
    issues: [...original.issues],
  };

  let servicioCambiado = false;

  for (const meta of CAMPOS_CORRECCION_CHEQUEO) {
    const tecleado = correcciones[meta.campo];
    if (tecleado === undefined) continue;

    const anterior = valorParaEdicion(original, meta.campo);
    const nuevo = tecleado.trim();
    if (nuevo === anterior) continue; // entrar y salir de un campo no es una corrección

    const crudo = crudoDelCampo(original, meta.campo);
    const registrar = () => {
      camposCorregidos.push(meta.campo);
      fila.issues.push(issueCorreccion(meta.campo, meta.etiqueta, anterior, nuevo, crudo));
    };
    const fallar = (mensaje: string) => {
      errores.push({ fila: original.fila, campo: meta.campo, valorIngresado: nuevo, mensaje });
    };

    switch (meta.campo) {
      case 'numero': {
        if (nuevo === '') {
          fila.numero = null; // queda `no_reconocido` por falta de identidad: explícito, no silencioso
          registrar();
          break;
        }
        const { valor, error } = interpretarEntero(nuevo, { minimo: 1 });
        if (error !== null) {
          fallar(`Caravana inválida: ${error}.`);
          break;
        }
        fila.numero = valor;
        registrar();
        break;
      }
      case 'nombre': {
        fila.nombre = nuevo === '' ? null : nuevo;
        registrar();
        break;
      }
      case 'pl': {
        if (nuevo === '') {
          fila.pl = null;
          registrar();
          break;
        }
        const { valor, issues } = parseValorNumerico(nuevo);
        if (valor === null) {
          fallar(`PL inválido: ${issues[0]?.motivo ?? 'no se pudo leer como número'}.`);
          break;
        }
        if (valor < 0) {
          fallar('PL inválido: no puede ser negativo.');
          break;
        }
        fila.pl = valor;
        registrar();
        break;
      }
      case 'numPartos': {
        if (nuevo === '') {
          fila.numPartos = null;
          registrar();
          break;
        }
        const { valor, error } = interpretarEntero(nuevo, { minimo: 0 });
        if (error !== null) {
          fallar(`# Partos inválido: ${error}.`);
          break;
        }
        fila.numPartos = valor;
        registrar();
        break;
      }
      case 'sx': {
        // `parseSX` es el ÚNICO intérprete del código SX en todo el repo
        // (regla dura del módulo) -- el texto corregido pasa por él igual que
        // el del archivo. Una celda vacía es `null` en la capa normalizada,
        // igual que en `derivarEventosDeChequeo` (fila sin SX -> sin evento).
        fila.sx = nuevo === '' ? null : parseSX(nuevo);
        registrar();
        break;
      }
      case 'fechaServicio': {
        if (nuevo === '') {
          // Sin servicio vigente. Las fechas anteriores viven en
          // `raw.fechaServicio` (intacto), así que no se pierde nada: lo que
          // se declara es "esta vaca no tiene servicio vigente".
          fila.fechasServicio = [];
          servicioCambiado = true;
          registrar();
          break;
        }
        if (!esFechaIsoReal(nuevo)) {
          fallar(`Fecha de servicio inválida: «${nuevo}» no es una fecha real (aaaa-mm-dd).`);
          break;
        }
        if (fila.fechasServicio.length === 0) fila.fechasServicio = [nuevo];
        else fila.fechasServicio[fila.fechasServicio.length - 1] = nuevo; // reemplaza el VIGENTE, conserva los intentos anteriores (V7)
        servicioCambiado = true;
        registrar();
        break;
      }
      case 'toro': {
        if (nuevo === '') {
          fila.toroNombre = null;
          registrar();
          break;
        }
        const resultado = parseToro(nuevo, config);
        if (resultado.toroNombre === null) {
          fallar(
            `Toro inválido: «${nuevo}» no se pudo leer como nombre de toro` +
              (resultado.estadoMarcador !== null
                ? ' (es un código de ESTADO, que nunca es un toro — corrige la columna Estado en su lugar).'
                : `${resultado.issues[0] ? ` (${resultado.issues[0].motivo})` : ''}.`),
          );
          break;
        }
        fila.toroNombre = resultado.toroNombre;
        if (resultado.tipoServicio !== null) fila.tipoServicio = resultado.tipoServicio;
        registrar();
        break;
      }
      case 'tipoServicio': {
        if (nuevo !== '' && nuevo !== 'monta' && nuevo !== 'inseminacion') {
          fallar(`Tipo de servicio inválido: «${nuevo}».`);
          break;
        }
        fila.tipoServicio = nuevo === '' ? null : (nuevo as 'monta' | 'inseminacion');
        registrar();
        break;
      }
      case 'estado': {
        const permitidos = OPCIONES_ESTADO.map((o) => o.valor);
        if (!permitidos.includes(nuevo)) {
          fallar(`Estado inválido: «${nuevo}».`);
          break;
        }
        // `''` -> `null` = "la celda no se llenó". NUNCA `vacia_apta`: esa es
        // la confusión que la migración 062 existe para impedir.
        fila.estado = nuevo === '' ? null : (nuevo as TipoEstado);
        registrar();
        break;
      }
      default: {
        const _exhaustivo: never = meta.campo;
        fallar(`Campo desconocido: ${String(_exhaustivo)}`);
      }
    }
  }

  if (servicioCambiado) {
    // MISMA derivación que `importHato/chequeos.ts`: en UN paso desde el
    // servicio vigente y con raza=null (acá tampoco se conoce la raza
    // confirmada del animal, cae al `_default` de `HatoConfig`). Nunca se
    // teclean SECAR/PP a mano ni se dejan con el valor del servicio viejo.
    const vigente = fila.fechasServicio.at(-1) ?? null;
    fila.fechaSecar = vigente ? calcularFechaSecar(vigente, null, config) : null;
    fila.fechaProbableParto = vigente ? calcularPartoProbable(vigente, config) : null;
  }

  return { fila, camposCorregidos, errores };
}

// ============================================================================
// 6. Aplicación a toda la hoja + fecha del chequeo
// ============================================================================

export interface ResumenCorrecciones {
  filasCorregidas: number;
  camposCorregidos: number;
  /** `true` si la fecha del chequeo que se va a comprometer NO es la que traía
   * el archivo. */
  fechaChequeoFijadaAMano: boolean;
}

export interface ResultadoCorreccionesHoja {
  /** Las filas ya corregidas, en el MISMO orden que entraron -- es lo que se
   * le pasa a `construirDiffChequeo` y lo que se envía al commit. */
  filas: FilaChequeoNormalizada[];
  errores: ErrorCorreccionChequeo[];
  /** Campos corregidos por `fila` -- para que la UI marque cada celda tocada. */
  camposPorFila: Record<number, CampoCorreccionChequeo[]>;
  resumen: ResumenCorrecciones;
}

/**
 * Aplica todas las correcciones de la hoja y, si se fijó una fecha de chequeo,
 * la propaga a TODAS las filas.
 *
 * Propagar es obligatorio y no cosmético: `chequeoFecha` de cada fila es la
 * que ancla los eventos derivados (`descomponerSX`) y `meses_prenez`
 * (`construirFilasVacas`), mientras `chequeo.fecha` del payload solo manda en
 * la cabecera `hato_chequeos`. Fijar una sin la otra dejaría el encabezado con
 * la fecha real y los eventos con la equivocada.
 */
export function aplicarCorreccionesHoja(
  filas: FilaChequeoNormalizada[],
  correccionesPorFila: CorreccionesPorFila,
  config: HatoConfig,
  fechaChequeoFijada?: string | null,
): ResultadoCorreccionesHoja {
  const salida: FilaChequeoNormalizada[] = [];
  const errores: ErrorCorreccionChequeo[] = [];
  const camposPorFila: Record<number, CampoCorreccionChequeo[]> = {};
  let filasCorregidas = 0;
  let camposCorregidos = 0;
  let fechaChequeoFijadaAMano = false;

  for (const original of filas) {
    const resultado = aplicarCorreccionesFila(original, correccionesPorFila[original.fila], config);
    let fila = resultado.fila;

    if (fechaChequeoFijada && fila.chequeoFecha !== fechaChequeoFijada) {
      fechaChequeoFijadaAMano = true;
      fila = {
        ...fila,
        raw: { ...fila.raw },
        fechasServicio: [...fila.fechasServicio],
        chequeoFecha: fechaChequeoFijada,
        // Una persona la fijó mirando la planilla: es exacta, no una
        // heurística del título de la hoja.
        chequeoFechaConfianza: 'exacta',
        issues: [
          ...fila.issues,
          issueCorreccion(
            CAMPO_ISSUE_FECHA_CHEQUEO,
            'Fecha del chequeo',
            original.chequeoFecha ?? '',
            fechaChequeoFijada,
            original.chequeoFecha,
          ),
        ],
      };
    }

    if (resultado.camposCorregidos.length > 0) {
      filasCorregidas += 1;
      camposCorregidos += resultado.camposCorregidos.length;
      camposPorFila[original.fila] = resultado.camposCorregidos;
    }
    errores.push(...resultado.errores);
    salida.push(fila);
  }

  return {
    filas: salida,
    errores,
    camposPorFila,
    resumen: { filasCorregidas, camposCorregidos, fechaChequeoFijadaAMano },
  };
}

// ============================================================================
// 7. Ayudas de la revisión (todas puras)
// ============================================================================

/** Clasificaciones que el commit SÍ acepta escribir -- espejo de
 * `CLASIFICACIONES_ESCRIBIBLES` de `commitChequeo.ts`, que es quien manda.
 * Acá solo se usa para decidir qué filas se envían y qué contador mostrar. */
const CLASIFICACIONES_APROBABLES: ReadonlySet<ClasificacionFilaDiff> = new Set(['sin_cambio', 'cambio']);

export function esClasificacionAprobable(clasificacion: ClasificacionFilaDiff): boolean {
  return CLASIFICACIONES_APROBABLES.has(clasificacion);
}

/**
 * Las filas corregidas que corresponden a las clasificaciones aprobables del
 * diff vigente -- exactamente lo que viaja al commit. Se emparejan por
 * `fila`, la misma llave que usa el servidor para revalidar.
 */
export function seleccionarFilasAprobables(
  filasCorregidas: FilaChequeoNormalizada[],
  diff: ResultadoDiffChequeo,
): FilaChequeoNormalizada[] {
  const porNumeroDeFila = new Map(filasCorregidas.map((f) => [f.fila, f]));
  const aprobables: FilaChequeoNormalizada[] = [];
  for (const filaDiff of diff.filas) {
    if (!esClasificacionAprobable(filaDiff.clasificacion)) continue;
    const fila = porNumeroDeFila.get(filaDiff.fila);
    if (fila) aprobables.push(fila);
  }
  return aprobables;
}

export interface CambioDeClasificacion {
  fila: number;
  numero: number | null;
  antes: ClasificacionFilaDiff;
  despues: ClasificacionFilaDiff;
}

/**
 * Filas cuya clasificación cambió entre dos diffs. Dos usos, ambos honestos:
 * comparar el diff del servidor contra el recalculado en cliente con el estado
 * FRESCO del hato (detecta "el hato cambió desde la vista previa" ANTES de que
 * el commit responda 409), y mostrarle a quien corrige qué logró su corrección.
 */
export function compararClasificaciones(
  antes: ResultadoDiffChequeo,
  despues: ResultadoDiffChequeo,
): CambioDeClasificacion[] {
  const antesPorFila = new Map(antes.filas.map((f) => [f.fila, f]));
  const cambios: CambioDeClasificacion[] = [];
  for (const filaDespues of despues.filas) {
    const filaAntes = antesPorFila.get(filaDespues.fila);
    if (!filaAntes) continue;
    if (filaAntes.clasificacion !== filaDespues.clasificacion) {
      cambios.push({
        fila: filaDespues.fila,
        numero: filaDespues.numero,
        antes: filaAntes.clasificacion,
        despues: filaDespues.clasificacion,
      });
    }
  }
  return cambios;
}

/**
 * Toros que se CREARÍAN en `hato_toros` al aprobar (el commit hace
 * SELECT-o-INSERT por nombre, índice único `lower(nombre)`). Se avisa antes
 * para que un alta de catálogo sea una decisión y no un efecto colateral de
 * una letra mal leída (riesgo declarado en el plan §7).
 *
 * Solo se consideran filas con al menos una fecha de servicio: el commit
 * resuelve el toro únicamente para los nombres que aparecen en un evento
 * derivado, y sin servicio no hay evento. Es una aproximación conservadora --
 * puede avisar de un toro que al final no se cree (si `descomponerSX`
 * deduplica ese servicio contra un chequeo anterior), nunca lo contrario.
 */
export function detectarTorosNuevos(filas: FilaChequeoNormalizada[], catalogo: string[]): string[] {
  const conocidos = new Set(catalogo.map((n) => n.trim().toLowerCase()));
  const nuevos = new Map<string, string>();
  for (const fila of filas) {
    const nombre = fila.toroNombre?.trim();
    if (!nombre) continue;
    if (fila.fechasServicio.length === 0) continue;
    const clave = nombre.toLowerCase();
    if (conocidos.has(clave) || nuevos.has(clave)) continue;
    nuevos.set(clave, nombre);
  }
  return [...nuevos.values()].sort((a, b) => a.localeCompare(b, 'es'));
}
