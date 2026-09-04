// ARCHIVO: utils/rondaInventario/interpretarNota.ts
// DESCRIPCIÓN: Etapa (2) del pipeline de voz de la ronda de inventario --
// §5 del brief técnico. Toma el TRANSCRITO (texto, ya producido por la
// etapa (1) de STT, que es I/O y vive fuera de este módulo) y lo convierte
// en hallazgos estructurados: producto identificado (o no), físico
// (dictado o derivado), causa propuesta y vía.
//
// Puro, cero I/O, cero `Date.now()` -- todo lo que depende del reloj o de la
// red lo inyecta el llamador (mismo contrato que ocrChequeo.ts). Este
// archivo NO llama al modelo: `construirPromptInterprete`/`esquemaJsonHallazgos`
// arman lo que hay que mandarle, y `parsearRespuestaModelo` interpreta lo
// que ya volvió, des-serializado.
//
// LAS TRES REGLAS QUE ESTE ARCHIVO SOSTIENE, LITERALES DEL BRIEF TÉCNICO:
//
//   D-T7 (§5.4) -- `resolverProducto` es coincidencia normalizada EXACTA,
//   NUNCA distancia de edición. 'Silicalmag'->'Sulcamag' está a distancia 4
//   (los dos productos de la migración 119); un umbral que atrape
//   'Silicalmag'->'Silicio' (distancia 5, el propio ejemplo del dueño)
//   mapea también el par peligroso. Cualquier cosa que no calce exacto
//   -> `no_identificado`, y lo elige un humano (R-20/CA-32).
//
//   R-19/CA-31 -- `derivarFisico` nunca usa el número que Uriel dijo como
//   teórico (el esquema de salida del modelo NI SIQUIERA tiene esa ranura,
//   D-T8): el físico sale de lo dictado o se DERIVA de "faltan N" sobre el
//   teórico que el SERVIDOR ya conoce (la foto congelada de R-5), nunca al
//   revés.
//
//   R-18/CA-33/CA-34 -- `derivarVia` nunca pregunta al modelo qué vía
//   corresponde (el esquema tampoco tiene esa ranura): la deriva del
//   catálogo de `causasRaiz.ts`, y ante CUALQUIER duda -- confianza no
//   `alta`, clave vacía, o clave que no existe en el catálogo -- cae a
//   `aprobacion_gerencia`. El sesgo es asimétrico a propósito: nunca se
//   equivoca pidiendo MENOS control.

import { CAUSAS_RAIZ, type CausaRaiz, type ViaExcepcion } from './causasRaiz';

// ---------------------------------------------------------------------------
// 1. Vocabulario de confianza -- mismo patrón que ocrChequeo.ts
// ---------------------------------------------------------------------------

/** Confianza que el modelo declara para un dato que intentó resolver
 * (producto o causa). `ninguna` es explícita -- el modelo declara que no
 * pudo, en vez de forzar un valor. */
export type ConfianzaInterprete = 'alta' | 'baja' | 'ninguna';

// ---------------------------------------------------------------------------
// 2. Lo que el modelo devuelve (D-T8) -- ya des-serializado y tolerado
// ---------------------------------------------------------------------------

export interface HallazgoCrudo {
  /** LITERAL, tal como sonó. El modelo NUNCA lo normaliza ni lo resuelve
   * contra un catálogo -- eso es `resolverProducto`, del lado del servidor. */
  productoMencionado: string;
  productoConfianza: ConfianzaInterprete;
  /** El trozo del transcrito de donde sale este hallazgo -- para que el
   * preview pueda mostrar contexto y para poder auditar después. */
  fragmentoLiteral: string;
  cantidadFisicaPresente: boolean;
  cantidadFisica: number;
  cantidadFaltantePresente: boolean;
  cantidadFaltante: number;
  /** Clave del catálogo de `causasRaiz.ts`, o `''` si el modelo no la
   * determina. NUNCA se inventa una clave fuera del catálogo -- si el
   * modelo devuelve una que no existe, `derivarVia` la trata como R-18. */
  causaClave: string;
  causaConfianza: ConfianzaInterprete;
  /** `''` si el audio no le atribuye ninguna explicación a David. Si no es
   * vacío, es una CITA de Uriel -- nunca la palabra de David hasta que él
   * la confirme o la corrija (R-6/CA-38, resuelto en la capa de excepciones,
   * no acá). */
  explicacionDavidCitada: string;
}

export interface RespuestaModeloInterprete {
  hallazgos: HallazgoCrudo[];
  /** A-7/R-16/CA-14: un producto que no está en el catálogo se reporta como
   * observación libre, nunca como un hallazgo forzado. */
  observacionesLibres: string[];
  /** Avisos de forma que el parser detectó al degradar (nunca corregidos en
   * silencio -- mismo criterio que `parsearRespuestaModeloOcr`). */
  avisos: string[];
}

// ---------------------------------------------------------------------------
// 3. El esquema JSON de salida (D-T8) -- misma disciplina que esquemaJsonOcr()
// ---------------------------------------------------------------------------

/**
 * Esquema `json_schema` para la etapa de interpretación. Literal de §5.5 del
 * brief técnico. Las ausencias son deliberadas y sostienen reglas del brief
 * de producto -- ver la cabecera del archivo y la tabla de §5.5:
 *
 *   - Sin `cantidad_teorica`: el modelo no tiene dónde poner un teórico
 *     (R-19). El servidor lo lee de la foto congelada después de resolver
 *     el producto.
 *   - Sin `via`: la vía sale del catálogo, nunca del modelo (CA-34).
 *   - Sin `producto_id`: el modelo nunca ve ids ni elige uno (R-20).
 *   - Sin campo de confirmación: confirmar es un botón de Telegram, jamás
 *     una interpretación de tono (CA-29).
 *   - `cantidad_*_presente` en vez de valores `null`: los conversores de
 *     `json_schema` de los proveedores son quisquillosos con
 *     `type: ["number","null"]` -- mismo motivo que `esquemaJsonOcr()`.
 */
export function esquemaJsonHallazgos(): Record<string, unknown> {
  return {
    type: 'object',
    required: ['hallazgos', 'observaciones_libres', 'avisos'],
    additionalProperties: false,
    properties: {
      hallazgos: {
        type: 'array',
        description: 'Un hallazgo por cada producto sobre el que Uriel reportó una diferencia u observación.',
        items: {
          type: 'object',
          required: [
            'producto_mencionado',
            'producto_confianza',
            'fragmento_literal',
            'cantidad_fisica_presente',
            'cantidad_fisica',
            'cantidad_faltante_presente',
            'cantidad_faltante',
            'causa_clave',
            'causa_confianza',
            'explicacion_david_citada',
          ],
          additionalProperties: false,
          properties: {
            producto_mencionado: {
              type: 'string',
              description: 'El nombre del producto TAL COMO SONÓ en el audio. Nunca lo corrijas ni lo normalices.',
            },
            producto_confianza: { type: 'string', enum: ['alta', 'baja', 'ninguna'] },
            fragmento_literal: {
              type: 'string',
              description: 'El trozo del transcrito del que sale este hallazgo, literal.',
            },
            cantidad_fisica_presente: {
              type: 'boolean',
              description: 'true si Uriel dictó la cantidad física directamente (p. ej. "hay 90").',
            },
            cantidad_fisica: { type: 'number', description: 'Válido sólo si cantidad_fisica_presente es true.' },
            cantidad_faltante_presente: {
              type: 'boolean',
              description: 'true si Uriel dijo cuánto falta o sobra (p. ej. "faltan 3") en vez de la cifra final.',
            },
            cantidad_faltante: {
              type: 'number',
              description: 'Válido sólo si cantidad_faltante_presente es true. Siempre positivo; el signo (falta vs. sobra) no se codifica acá -- ver fragmento_literal.',
            },
            causa_clave: {
              type: 'string',
              description:
                'Una de las claves del catálogo de causas si el audio la deja clara con confianza alta; cadena vacía si no.',
            },
            causa_confianza: { type: 'string', enum: ['alta', 'baja', 'ninguna'] },
            explicacion_david_citada: {
              type: 'string',
              description: 'Lo que el audio atribuye a David sobre este hallazgo, literal. Cadena vacía si no le atribuye nada.',
            },
          },
        },
      },
      observaciones_libres: {
        type: 'array',
        items: { type: 'string' },
        description: 'Hallazgos sobre productos que NO están en el catálogo -- nunca se fuerzan como hallazgo.',
      },
      avisos: {
        type: 'array',
        items: { type: 'string' },
        description: 'Cualquier ambigüedad o duda del propio modelo sobre el audio, en texto llano.',
      },
    },
  };
}

/**
 * Prompt de interpretación (etapa 2, D-T6). Trabaja sobre TEXTO -- el
 * transcrito de la etapa 1 -- nunca sobre audio: es lo que hace testeable
 * este archivo con fixtures de cadenas planas, para siempre.
 *
 * Deliberadamente NO incluye el catálogo de productos (mismo argumento que
 * `construirPromptOcr` en ocrChequeo.ts: dárselo convertiría la resolución
 * de producto en un espejo -- el modelo copiaría un nombre del catálogo en
 * vez de transcribir lo que oyó, y `resolverProducto` dejaría de validar
 * nada). El modelo transcribe lo que entendió; el servidor resuelve contra
 * el alcance congelado de la ronda.
 */
export function construirPromptInterprete(catalogoCausas: readonly CausaRaiz[] = CAUSAS_RAIZ): string {
  const causasTexto = catalogoCausas.length > 0
    ? catalogoCausas
        .filter((c) => c.activo)
        .map((c) => `- ${c.clave}: ${c.etiqueta}`)
        .join('\n')
    : '(catálogo no disponible)';

  return [
    'Eres un asistente que interpreta el reporte de voz de un verificador de inventario agrícola en Colombia, tras recorrer una bodega de insumos.',
    '',
    'Recibes la TRANSCRIPCIÓN LITERAL de una o varias notas de voz (no el audio). Tu trabajo es extraer, de ese texto, un hallazgo estructurado por cada producto sobre el que el verificador reportó una diferencia, una pérdida, o cualquier observación -- nunca inventar hallazgos sobre productos que no se mencionaron.',
    '',
    'REGLAS DURAS:',
    '1. NO conoces la cantidad teórica de ningún producto y NO debes inventarla ni repetirla como si la supieras. Si el verificador dice "deberían haber 100 y hay 90", tu trabajo es registrar el FÍSICO (90, cantidad_fisica_presente=true) y el fragmento literal -- el sistema compara contra su propio dato, no contra lo que tú creas haber entendido.',
    '2. "producto_mencionado" es el nombre TAL COMO SONÓ, sin corregirlo ni normalizarlo -- ni siquiera si te parece un error de pronunciación de un producto conocido. La resolución contra el catálogo real la hace otro sistema, no tú.',
    '3. Si el verificador da la cantidad física directamente ("hay 90 kilos"), usa cantidad_fisica_presente=true. Si en cambio dice cuánto falta o sobra ("faltan 3", "sobran 2"), usa cantidad_faltante_presente=true con un número siempre positivo -- deja que el fragmento_literal aclare si es falta o sobra.',
    '4. Si el verificador menciona una cantidad de EMPAQUES (bultos, sacos, bolsas, canecas, cajas, costales) y el contenido de cada uno ("tres bultos de 50 kilos", "dos canecas de 20 litros"), calcula el TOTAL -- cantidad de empaques × contenido de cada uno -- y reporta ESE total como cantidad_fisica (o cantidad_faltante), nunca el número de empaques solo. Ejemplo literal: "tres bultos de 50 kilos" -> cantidad_fisica=150, NUNCA 3. Si el verificador ya dio el total directamente ("hay 150 kilos"), usa ese número tal cual, no lo dividas.',
    '5. Clasifica la causa SOLO si el audio la deja clara. Usa una de estas claves del catálogo (o cadena vacía si no aplica ninguna con confianza):',
    causasTexto,
    '6. causa_confianza=\'alta\' únicamente si el verificador fue explícito sobre la causa. Ante cualquier duda usa \'baja\' o \'ninguna\' -- nunca fuerces \'alta\' para parecer útil.',
    '7. Si el audio cita lo que David dijo sobre ese hallazgo ("David dice que...", "según David..."), transcribe esa cita literal en explicacion_david_citada. Es una CITA de lo que el verificador reporta que David dijo -- no es la confirmación de David, y el sistema la trata así.',
    '8. Un producto mencionado que no reconoces del rubro de insumos agrícolas de la finca igual se reporta como hallazgo -- no lo descartes ni lo muevas a observaciones_libres por tu cuenta: esa decisión la toma el servidor comparando contra el catálogo real, no tú.',
    '9. "observaciones_libres" es SOLO para comentarios generales de la ronda que no se refieren a un producto específico (por ejemplo, sobre el estado de la bodega). No dupliques ahí un hallazgo que ya reportaste en "hallazgos".',
    '10. Si algo del audio es ambiguo o no estás seguro de haberlo entendido bien, dilo en "avisos" en vez de adivinar.',
    '',
    'Responde ÚNICAMENTE con el JSON del esquema pedido. Sin explicaciones, sin markdown.',
  ].join('\n');
}

// ---------------------------------------------------------------------------
// 4. Parseo tolerante de la respuesta del modelo -- mismo criterio que
//    parsearRespuestaModeloOcr: una fila mal formada nunca aborta el resto,
//    pero una respuesta sin forma de objeto/arreglo sí es fatal (no hay nada
//    que rescatar).
// ---------------------------------------------------------------------------

function textoPlano(valor: unknown): string {
  if (valor === null || valor === undefined) return '';
  if (typeof valor === 'string') return valor.trim();
  if (typeof valor === 'number' || typeof valor === 'boolean') return String(valor);
  return '';
}

function numeroPlano(valor: unknown): number {
  if (typeof valor === 'number' && Number.isFinite(valor)) return valor;
  if (typeof valor === 'string') {
    const n = Number(valor);
    if (Number.isFinite(n)) return n;
  }
  return 0;
}

function booleanoPlano(valor: unknown): boolean {
  return valor === true;
}

/** Degrada SIEMPRE hacia lo cauteloso (mismo criterio que
 * `normalizarConfianza` de ocrChequeo.ts): una confianza que no reconocemos
 * nunca puede colarse como si fuera buena. */
function normalizarConfianzaInterprete(valor: unknown, avisos: string[], contexto: string): ConfianzaInterprete {
  if (valor === 'alta' || valor === 'baja' || valor === 'ninguna') return valor;
  avisos.push(`${contexto}: confianza '${String(valor)}' no reconocida -- se degradó a 'ninguna'`);
  return 'ninguna';
}

/**
 * Convierte el JSON crudo que devolvió el modelo (ya des-serializado) en
 * `RespuestaModeloInterprete`. Tolerante: un hallazgo mal formado se
 * conserva con lo que se pueda leer (nunca se descarta en silencio, nunca
 * aborta a los demás). Fatal únicamente si `hallazgos` no es un arreglo --
 * ahí no hay nada que rescatar, y devolver "0 hallazgos" en silencio se
 * leería como "Uriel no reportó nada", que puede ser mentira.
 */
export function parsearRespuestaModelo(bruto: unknown): RespuestaModeloInterprete {
  const avisos: string[] = [];
  if (bruto === null || typeof bruto !== 'object') {
    throw new Error('La respuesta del modelo intérprete no es un objeto JSON.');
  }
  const raiz = bruto as Record<string, unknown>;
  const hallazgosBrutos = raiz.hallazgos;
  if (!Array.isArray(hallazgosBrutos)) {
    throw new Error('La respuesta del modelo intérprete no trae el arreglo "hallazgos".');
  }

  const hallazgos: HallazgoCrudo[] = hallazgosBrutos.map((bruto, i) => {
    const contexto = `hallazgo ${i + 1}`;
    if (bruto === null || typeof bruto !== 'object') {
      avisos.push(`${contexto}: no es un objeto -- se descarta su contenido`);
      return {
        productoMencionado: '',
        productoConfianza: 'ninguna',
        fragmentoLiteral: '',
        cantidadFisicaPresente: false,
        cantidadFisica: 0,
        cantidadFaltantePresente: false,
        cantidadFaltante: 0,
        causaClave: '',
        causaConfianza: 'ninguna',
        explicacionDavidCitada: '',
      };
    }
    const h = bruto as Record<string, unknown>;
    return {
      productoMencionado: textoPlano(h.producto_mencionado),
      productoConfianza: normalizarConfianzaInterprete(h.producto_confianza, avisos, `${contexto}, producto_confianza`),
      fragmentoLiteral: textoPlano(h.fragmento_literal),
      cantidadFisicaPresente: booleanoPlano(h.cantidad_fisica_presente),
      cantidadFisica: numeroPlano(h.cantidad_fisica),
      cantidadFaltantePresente: booleanoPlano(h.cantidad_faltante_presente),
      cantidadFaltante: numeroPlano(h.cantidad_faltante),
      causaClave: textoPlano(h.causa_clave),
      causaConfianza: normalizarConfianzaInterprete(h.causa_confianza, avisos, `${contexto}, causa_confianza`),
      explicacionDavidCitada: textoPlano(h.explicacion_david_citada),
    };
  });

  const observacionesBrutas = raiz.observaciones_libres;
  const observacionesLibres = Array.isArray(observacionesBrutas)
    ? observacionesBrutas.map((o) => textoPlano(o)).filter((o) => o !== '')
    : [];

  const avisosBrutos = raiz.avisos;
  const avisosModelo = Array.isArray(avisosBrutos) ? avisosBrutos.map((a) => textoPlano(a)).filter((a) => a !== '') : [];

  return { hallazgos, observacionesLibres, avisos: [...avisos, ...avisosModelo] };
}

// ---------------------------------------------------------------------------
// 5. Resolución de producto -- D-T7: coincidencia normalizada EXACTA, NUNCA
//    distancia de edición.
// ---------------------------------------------------------------------------

export interface ProductoEnAlcance {
  productoId: string;
  nombre: string;
}

export type OrigenResolucion = 'alcance' | 'fuera_de_alcance';

export type ResolucionProducto =
  | { estado: 'identificado'; productoId: string; nombreProducto: string; origen: OrigenResolucion }
  | { estado: 'no_identificado' };

/** Normaliza un nombre de producto para comparar: minúsculas, sin tildes,
 * espacios colapsados. NUNCA se usa para escribir nada -- sólo para
 * decidir si dos cadenas son "la misma", nunca "parecidas" (D-T7). */
export function normalizarNombreProducto(nombre: string): string {
  return nombre
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Resuelve `productoMencionado` contra el alcance congelado de la ronda
 * (la foto de R-5, `rondas_inventario_alcance`) por coincidencia
 * normalizada EXACTA. Nunca por distancia de edición: `'Silicalmag'` está a
 * distancia 4 de `'Sulcamag'` y a distancia 5 de `'Silicio'` -- los dos
 * productos de la migración 119 y el propio error de Santiago en §11.1 del
 * brief de producto. Cualquier umbral lo bastante flojo para atrapar uno
 * atrapa el otro. `no_identificado` y lo elige un humano de una lista
 * (R-20/CA-32) es la única política segura.
 *
 * Si dos productos del alcance normalizan al mismo nombre (caso degenerado,
 * no debería ocurrir con nombres reales de catálogo, pero un dato sucio
 * puede producirlo), tampoco se adjudica solo -- mismo criterio que
 * `validarAnclaFila` sobre chapetas ambiguas en ocrChequeo.ts.
 *
 * `fueraDeAlcance` (opcional, hallazgo real de Santiago probando en vivo
 * 2026-08-28) -- CA-4, literal: "los productos en cero no entran solos;
 * Uriel puede reportar uno igual si lo encuentra". Un producto que SÍ existe
 * en el catálogo pero estaba en 0 (o inactivo) al abrir la ronda queda fuera
 * de `rondas_inventario_alcance` por diseño (`fn_ronda_abrir` sólo congela
 * `cantidad_actual > 0`) -- así que sin esta segunda lista, ese producto es
 * estructuralmente imposible de identificar por más veces que Uriel lo
 * corrija por texto. Se prueba SÓLO si no hay ningún match (ni único ni
 * ambiguo) en el alcance congelado -- el alcance real de la ronda manda
 * siempre primero; nunca se usa para desambiguar un empate ahí (esa
 * ambigüedad sigue siendo `no_identificado`, R-20). El llamador (Fase 3,
 * `resolverHallazgos.ts`) es responsable de tratar `origen: 'fuera_de_alcance'`
 * como teórico=0 y de agregar el producto al alcance congelado de la ronda
 * al confirmar (`fn_ronda_confirmar_hallazgos`, migración 131) -- este
 * módulo no toca ninguna tabla, sólo resuelve el nombre.
 */
export function resolverProducto(
  productoMencionado: string,
  alcance: readonly ProductoEnAlcance[],
  fueraDeAlcance: readonly ProductoEnAlcance[] = [],
): ResolucionProducto {
  const buscado = normalizarNombreProducto(productoMencionado);
  if (buscado === '') return { estado: 'no_identificado' };

  const enAlcance = alcance.filter((p) => normalizarNombreProducto(p.nombre) === buscado);
  if (enAlcance.length === 1) {
    return { estado: 'identificado', productoId: enAlcance[0].productoId, nombreProducto: enAlcance[0].nombre, origen: 'alcance' };
  }
  if (enAlcance.length > 1) return { estado: 'no_identificado' };

  // enAlcance.length === 0 -- recién acá se prueba fuera del alcance.
  const fuera = fueraDeAlcance.filter((p) => normalizarNombreProducto(p.nombre) === buscado);
  if (fuera.length !== 1) return { estado: 'no_identificado' };
  return { estado: 'identificado', productoId: fuera[0].productoId, nombreProducto: fuera[0].nombre, origen: 'fuera_de_alcance' };
}

// ---------------------------------------------------------------------------
// 6. Físico dictado vs. derivado (R-19/CA-31)
// ---------------------------------------------------------------------------

export type FisicoOrigen = 'dictado' | 'derivado';

export type ResolucionFisico =
  | { estado: 'resuelto'; fisico: number; origen: FisicoOrigen }
  | { estado: 'incompleto' };

/**
 * Deriva el físico de un hallazgo. Orden literal de §5.5 del brief técnico:
 *
 *   1. `cantidadFisicaPresente` -> fisico = cantidadFisica, origen = 'dictado'.
 *   2. si no, `cantidadFaltantePresente` -> fisico = teoricoFoto - cantidadFaltante,
 *      origen = 'derivado'. El preview lo rotula "derivado" -- nunca se
 *      presenta como si Uriel lo hubiera dictado (CA-31). **Sólo si la resta
 *      no cruza el cero**: una existencia física negativa no existe, así que
 *      un faltante mayor que el teórico significa que la lectura está mal, no
 *      que haya menos que nada.
 *   3. si no -> el hallazgo queda incompleto y NO se puede confirmar hasta
 *      que Uriel dé la cifra (no se adivina un físico).
 *
 * `teoricoFoto` es el de `rondas_inventario_alcance` (la foto congelada de
 * R-5), nunca un número que el modelo haya dicho -- el esquema de salida ni
 * siquiera tiene esa ranura (D-T8).
 *
 * POR QUÉ `incompleto` Y NO UN RECORTE A 0. Un 0 recortado es una cifra
 * plausible: se confirma sin fricción y entra como excepción a un registro de
 * trazabilidad que Gerencia firma, escondiendo que el intérprete leyó mal.
 * `incompleto` reusa el camino que ya existe (fila con `fisico: null` ->
 * `previewConfirmable` en falso -> «Falta identificar o completar algún
 * hallazgo antes de poder confirmar») y obliga a corregir, que es el sesgo
 * hacia la vía más controlada del módulo (R-18). Caso real que lo motivó:
 * «Tres bultos de 50 kilos de 15-15-15» sobre un teórico de 0 produjo
 * `fisico: -150`, con el signo invertido -- lo narrado era un sobrante.
 */
export function derivarFisico(hallazgo: HallazgoCrudo, teoricoFoto: number): ResolucionFisico {
  if (hallazgo.cantidadFisicaPresente) {
    return { estado: 'resuelto', fisico: hallazgo.cantidadFisica, origen: 'dictado' };
  }
  if (hallazgo.cantidadFaltantePresente) {
    const derivado = teoricoFoto - hallazgo.cantidadFaltante;
    if (derivado < 0) return { estado: 'incompleto' };
    return { estado: 'resuelto', fisico: derivado, origen: 'derivado' };
  }
  return { estado: 'incompleto' };
}

// ---------------------------------------------------------------------------
// 7. Vía derivada del catálogo, NUNCA del modelo (CA-34, R-18)
// ---------------------------------------------------------------------------

/**
 * Deriva la vía de un hallazgo contra el catálogo de causa raíz. Literal de
 * §5.5 del brief técnico, sin excepción: cualquier duda del modelo --
 * confianza que no sea `alta`, clave vacía, o clave que no existe en el
 * catálogo (o que existe pero está `activo=false`) -- cae a
 * `aprobacion_gerencia` (R-18). `error_de_conteo` cae en `ninguna` porque
 * así está sembrada esa causa, no por un caso especial acá.
 *
 * El RPC de una fase posterior (`fn_ronda_confirmar_hallazgos`) vuelve a
 * derivar esto contra la TABLA viva, ignorando lo que mande el cliente --
 * dos sitios, una regla, con un test de paridad que los compara
 * (precedente `reportesFinancierosParidad.test.ts`).
 */
export function derivarVia(
  hallazgo: Pick<HallazgoCrudo, 'causaClave' | 'causaConfianza'>,
  catalogo: readonly CausaRaiz[] = CAUSAS_RAIZ,
): ViaExcepcion {
  if (hallazgo.causaConfianza !== 'alta') return 'aprobacion_gerencia';
  if (!hallazgo.causaClave) return 'aprobacion_gerencia';

  const causa = catalogo.find((c) => c.clave === hallazgo.causaClave && c.activo);
  if (!causa) return 'aprobacion_gerencia';

  return causa.via;
}
