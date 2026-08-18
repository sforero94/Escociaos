/**
 * Validador del motor de acciones recomendadas -- el mecanismo anti-invento
 * (§4.3 de `docs/brief_tecnico_motor_acciones.md`).
 *
 * `validarSalidaMotor` es una función PURA: sin red, sin Supabase, sin LLM.
 * Recibe lo que el modelo devolvió (`SalidaMotor`) y el paquete cerrado que
 * se le dio (`PaqueteAcciones`), y decide qué acciones sobreviven. Nunca
 * lanza y nunca corrige -- una acción dudosa se descarta, no se arregla.
 *
 * Esto es la capa 2 de las cuatro que cierran R-1/R-2/R-5 (§0 del brief):
 * las ranuras tipadas (capa 1, generación) impiden escribir un dígito EN LA
 * RANURA; no impiden escribirlo en el texto libre de `plantilla`. Este
 * módulo cierra ese hueco -- incluidos los numerales y las fechas escritas
 * en letras, que ningún filtro de dígitos atrapa.
 *
 * Espejado byte-idéntico en
 * `src/supabase/functions/server/acciones-validador.ts` y
 * `supabase/functions/make-server-1ccce916/acciones-validador.ts`, guardado
 * por `accionesValidadorParidad.test.ts`. Nunca se edita a mano una copia
 * para callar una falla de paridad -- se regenera.
 */

import type {
  AccionGenerada,
  Destino,
  DestinoId,
  Hecho,
  NegocioAccion,
  PaqueteAcciones,
  RanuraRef,
  SalidaMotor,
} from './accionesTipos';

// ============================================================================
// Códigos de rechazo -- §4.3, en el orden en que aparecen en la tabla del
// brief. `PARCIAL_SIN_ANCLA` es el código de la "Nota sobre parcial" (misma
// sección) -- no está en la tabla principal pero es una regla de §4.3.
// ============================================================================

export type CodigoRechazo =
  | 'NEGOCIO_DESCONOCIDO'
  | 'HECHO_DESCONOCIDO'
  | 'HECHO_DE_OTRO_NEGOCIO'
  | 'SIN_EVIDENCIA'
  | 'DESTINO_DESCONOCIDO'
  | 'DESTINO_DE_OTRO_NEGOCIO'
  | 'DESTINO_NO_SOPORTADO_POR_HECHO'
  | 'DUPLICA_BLOQUE_1'
  | 'RANURA_HUERFANA'
  | 'CAMPO_INEXISTENTE'
  | 'RANURA_NO_USADA'
  | 'RANURA_FALTANTE'
  | 'CIFRA_LIBRE'
  | 'NUMERAL_EN_LETRA'
  | 'FECHA_EN_LETRA'
  | 'SIN_DATO_MAL_USADO'
  | 'PARCIAL_SIN_ANCLA'
  | 'A7_YA_ATENDIDO'
  | 'A8_YA_VISIBLE'
  | 'EXCEDE_CUPO_REVISION'
  | 'VERBO_NO_PERMITIDO_PARA_HECHO'
  | 'LONGITUD'
  | 'EXCEDE_CUPO'
  | 'DESTINO_REPETIDO';

export interface Rechazo {
  codigo: CodigoRechazo;
  accion_indice: number;
  detalle: string;
}

/** Una acción que sobrevivió TODAS las reglas de §4.3. Es lo que persiste
 *  `acciones_recomendadas` (menos `orden`, que calcula `accionesOrden.ts`,
 *  y menos `hechos_snapshot`, que arma la capa de persistencia, Fase 2). */
export interface AccionValidada {
  negocio: NegocioAccion;
  /**
   * Identidad estable (§5.2 del brief: "la clave es la del hecho que la
   * sostiene, no un hash de la frase ni del conjunto"). Se construye como
   * `<negocio completo>.<regla>`, tomando `regla` de `hecho_ids[0]` --
   * NUNCA el hecho_id crudo. Ver el reporte de la sesión para la evidencia:
   * el catálogo de hechos (§3.3) usa prefijos abreviados (`agu.`, `hato.`,
   * `gan.`), pero la migración 101 (aplicada como 097) -- ya aplicada por otra ola en
   * paralelo -- siembra `revisiones_periodicas.clave` con el negocio
   * COMPLETO ('aguacate.ejecucion_presupuestal', 'hato_lechero.productividad').
   * Esta función reproduce exactamente esas claves.
   */
  clave: string;
  origen: Hecho['origen'];
  visibilidad: 'todos' | 'gerencia';
  hecho_ids: string[];
  destino_id: DestinoId;
  plantilla: string;
  ranuras: Record<string, RanuraRef>;
}

export interface ResultadoValidacion {
  aceptadas: AccionValidada[];
  rechazos: Rechazo[];
}

// ============================================================================
// Léxicos -- §4.3. "Bloquear dígitos no bloquea 'las once vacas'."
// ============================================================================

/**
 * Léxico numérico en español. Excepción explícita y comentada: `un`, `una`,
 * `uno` se PERMITEN -- en español son artículo tanto como numeral
 * ("Registrar una quincena"), y bloquearlos rechazaría frases legítimas. El
 * riesgo residual (el modelo escribe "una vaca" en vez de `{n}` cuando n=1)
 * queda documentado como límite conocido, no como descuido (§4.3).
 *
 * Cobertura literal del brief: 'dos'..'quince', las decenas redondas
 * ('veinte'..'noventa'), 'cien(to)', 'mil', 'millón(es)', cuantificadores
 * ('docena', 'mitad', 'media', 'tercio', 'ambas/ambos', 'todas/todos') y los
 * ordinales femeninos 'primera'..'quinta'. El brief NO enumera los números
 * 16-19 ni los compuestos 21-99 ('dieciséis', 'veintidós', 'treinta y
 * cinco'...) ni los ordinales masculinos ('primero', 'segundo'...) -- es un
 * hueco real del léxico tal cual está especificado, señalado en el reporte
 * de la sesión, no una omisión silenciosa de esta implementación.
 */
export const NUMERALES_ES: readonly string[] = [
  'dos', 'tres', 'cuatro', 'cinco', 'seis', 'siete', 'ocho', 'nueve', 'diez',
  'once', 'doce', 'trece', 'catorce', 'quince',
  // 16-19 y los compuestos 21-29, que se escriben en una sola palabra. El
  // brief no los enumeraba: hueco real detectado al implementar, cerrado aquí.
  // Un modelo que escriba "dieciséis vacas" tiene que morir igual que uno que
  // escriba "once vacas", y la comparación es por palabra completa, así que
  // 'veintidós' NO matchea por contener 'dos' -- hay que listarlo.
  'dieciséis', 'dieciseis', 'diecisiete', 'dieciocho', 'diecinueve',
  'veintiuno', 'veintiuna', 'veintidós', 'veintidos', 'veintitrés', 'veintitres',
  'veinticuatro', 'veinticinco', 'veintiséis', 'veintiseis', 'veintisiete',
  'veintiocho', 'veintinueve',
  'veinte', 'treinta', 'cuarenta', 'cincuenta', 'sesenta', 'setenta', 'ochenta', 'noventa',
  'cien', 'ciento', 'mil', 'millón', 'millones',
  'docena', 'mitad', 'media', 'tercio',
  'ambas', 'ambos', 'todas', 'todos',
  // Ordinales en ambos géneros: el brief sólo traía los femeninos.
  'primera', 'segunda', 'tercera', 'cuarta', 'quinta',
  'primero', 'segundo', 'tercero', 'cuarto', 'quinto',
];

/**
 * Los compuestos 31-99 ("treinta y cinco") no caben en un léxico de palabras
 * sueltas: sus dos mitades ya están listadas ('treinta', 'cinco'), así que
 * `contieneToken` los atrapa por la primera mitad. Se documenta para que nadie
 * "optimice" quitando las decenas redondas creyéndolas redundantes: son
 * justamente lo que cubre ese rango.
 */

/**
 * Meses y días de la semana escritos en letra (§4.3, revisión 3). "julio" no
 * lleva dígitos, no está en `NUMERALES_ES`, y es una afirmación factual que
 * el modelo puede equivocar -- lo que R-2 protege no son "dígitos", son
 * afirmaciones cuya verdad depende del dato. El período correcto llega por
 * ranura (`valores.periodo.render`), como cualquier otra cifra.
 */
export const FECHAS_EN_LETRA: readonly string[] = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto',
  'septiembre', 'octubre', 'noviembre', 'diciembre',
  'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo',
];

/** Tokeniza `texto` en palabras (letras + tildes/eñe, sin puntuación) y
 *  comprueba si alguna, en minúscula, está en `lexico`. Comparación por
 *  palabra completa -- nunca subcadena -- para que 'veintidós' no matchee
 *  'dos' ni un nombre propio matchee un mes por accidente. */
function contieneToken(texto: string, lexico: readonly string[]): boolean {
  const palabras = texto.toLowerCase().match(/[a-záéíóúñü]+/g) ?? [];
  const set = new Set(lexico.map((p) => p.toLowerCase()));
  return palabras.some((p) => set.has(p));
}

/** `true` si `texto` contiene un numeral en letra (§4.3). Se usa tanto en
 *  el validador como en el test de propiedad de R-2 (§4.5, bloque 1). */
export function contieneNumeralEnLetra(texto: string): boolean {
  return contieneToken(texto, NUMERALES_ES);
}

/** `true` si `texto` contiene un mes o un día de la semana en letra (§4.3,
 *  revisión 3 -- el agujero que O-8 destapó). */
export function contieneFechaEnLetra(texto: string): boolean {
  return contieneToken(texto, FECHAS_EN_LETRA);
}

// ============================================================================
// Constantes nombradas -- cotas de §3.6 / §4.1 y §4.3, nunca mágicas.
// ============================================================================

export const MAX_HECHOS_POR_ACCION = 3;
export const MAX_ACCIONES_POR_NEGOCIO = 3;
export const MAX_ACCIONES_TOTAL = 9;
export const MAX_LONGITUD_PLANTILLA_RENDERIZADA = 90;

// ============================================================================
// Helpers de texto sobre la plantilla -- independientes de si las ranuras
// resuelven o no (CIFRA_LIBRE / NUMERAL_EN_LETRA / FECHA_EN_LETRA operan
// sobre la plantilla CRUDA tras borrar los `{...}`, nunca sobre el texto ya
// sustituido -- §4.3).
// ============================================================================

const REGEX_RANURA = /\{([^{}]+)\}/g;

function quitarRanuras(plantilla: string): string {
  return plantilla.replace(/\{[^{}]*\}/g, '');
}

function extraerTokensRanura(plantilla: string): string[] {
  const tokens: string[] = [];
  let m: RegExpExecArray | null;
  const regex = new RegExp(REGEX_RANURA);
  while ((m = regex.exec(plantilla)) !== null) {
    tokens.push(m[1]);
  }
  return tokens;
}

/** Sustituye las ranuras de `accion` por `hecho.valores[campo].render` para
 *  medir la LONGITUD de la plantilla renderizada. Devuelve `null` si alguna
 *  ranura no resuelve (esa acción ya está rechazada por otro código -- la
 *  longitud sobre un render roto no significa nada). */
function sustituirRanurasParaLongitud(
  accion: AccionGenerada,
  hechosById: Map<string, Hecho>,
): string | null {
  let resultado = '';
  let cursor = 0;
  let m: RegExpExecArray | null;
  const regex = new RegExp(REGEX_RANURA);
  while ((m = regex.exec(accion.plantilla)) !== null) {
    const [completo, token] = m;
    resultado += accion.plantilla.slice(cursor, m.index);
    cursor = m.index + completo.length;

    const ref = accion.ranuras[token];
    const hecho = ref ? hechosById.get(ref.hecho_id) : undefined;
    const valor = hecho ? hecho.valores[ref.campo] : undefined;
    if (!valor) return null;
    resultado += valor.render;
  }
  resultado += accion.plantilla.slice(cursor);
  return resultado;
}

/** `true` si `plantilla` empieza (tras quitar espacios) por alguno de
 *  `verbos`, respetando límite de palabra ("Confirmar" no matchea
 *  "Confirmara"). Comparación insensible a mayúsculas. */
function empiezaConVerboPermitido(plantilla: string, verbos: string[]): boolean {
  const texto = plantilla.trimStart();
  const textoMinuscula = texto.toLowerCase();
  return verbos.some((verbo) => {
    const verboMinuscula = verbo.toLowerCase();
    if (!textoMinuscula.startsWith(verboMinuscula)) return false;
    const siguiente = texto.charAt(verbo.length);
    return siguiente === '' || !/[a-záéíóúñ]/i.test(siguiente);
  });
}

/**
 * Deriva la clave estable de una acción a partir del hecho que la sostiene.
 * Ver el comentario de `AccionValidada.clave` para la justificación de por
 * qué NO es simplemente `hecho_ids[0]`.
 */
function derivarClave(accion: AccionGenerada): string {
  const idSustentador = accion.hecho_ids[0] ?? '';
  if (idSustentador.startsWith('rev.')) {
    // Hechos O-8: el propio id ya trae '<negocio completo>.<regla>' tras el
    // prefijo 'rev.' (así lo siembra la 097 en `revisiones_periodicas.clave`)
    // -- se usa tal cual, sin volver a anteponer el negocio.
    return idSustentador.slice('rev.'.length);
  }
  const primerPunto = idSustentador.indexOf('.');
  const regla = primerPunto >= 0 ? idSustentador.slice(primerPunto + 1) : idSustentador;
  return `${accion.negocio}.${regla}`;
}

// ============================================================================
// Validación por acción individual -- reglas que sólo miran ESA acción.
// No hay cortocircuito: se acumulan TODOS los códigos que apliquen (una
// acción puede fallar por más de una regla a la vez -- ver el caso "Comprar
// 4.694 kg de Silicalmag" del corpus adversario, §4.5 bloque 2).
// ============================================================================

interface EvaluacionIndividual {
  rechazos: Rechazo[];
  /** Presente sólo si la acción no tiene rechazos individuales -- es la
   *  info resuelta que las reglas cruzadas y `AccionValidada` necesitan. */
  info: {
    negocio: NegocioAccion;
    origen: Hecho['origen'];
    visibilidad: 'todos' | 'gerencia';
    clave: string;
  } | null;
}

function evaluarAccionIndividual(
  accion: AccionGenerada,
  indice: number,
  paquete: PaqueteAcciones,
  hechosById: Map<string, Hecho>,
  destinosPorId: Map<DestinoId, Destino[]>,
): EvaluacionIndividual {
  const rechazos: Rechazo[] = [];
  const empujar = (codigo: CodigoRechazo, detalle: string) =>
    rechazos.push({ codigo, accion_indice: indice, detalle });

  // -- negocio ---------------------------------------------------------
  if (!paquete.negocios.includes(accion.negocio)) {
    empujar('NEGOCIO_DESCONOCIDO', `'${accion.negocio}' no está entre los negocios de esta corrida.`);
  }

  // -- hechos citados ----------------------------------------------------
  if (accion.hecho_ids.length === 0 || accion.hecho_ids.length > MAX_HECHOS_POR_ACCION) {
    empujar('SIN_EVIDENCIA', `hecho_ids tiene ${accion.hecho_ids.length} elementos (esperado 1..${MAX_HECHOS_POR_ACCION}).`);
  }

  const hechosResueltos: Hecho[] = [];
  for (const id of accion.hecho_ids) {
    const hecho = hechosById.get(id);
    if (!hecho) {
      empujar('HECHO_DESCONOCIDO', `Hecho '${id}' no existe en el paquete.`);
      continue;
    }
    hechosResueltos.push(hecho);
    if (hecho.negocio !== accion.negocio) {
      empujar('HECHO_DE_OTRO_NEGOCIO', `Hecho '${id}' pertenece a '${hecho.negocio}', la acción es de '${accion.negocio}'.`);
    }
  }
  const hechoSustentador = accion.hecho_ids.length > 0 ? hechosById.get(accion.hecho_ids[0]) : undefined;

  // -- destino -------------------------------------------------------
  // Se resuelve por el PAR (id, negocio), no por id solo: `fin.presupuesto`
  // (§3.3 ter) es el mismo destino_id compartido por las tres tarjetas --
  // hato_lechero, aguacate y ganado tienen cada una su propia revisión de
  // ejecución presupuestal apuntando ahí (verificado contra la siembra real
  // de la migración 101, aplicada como 097). Si se indexara por id solo, un `Map` colapsaría
  // las tres filas en una y `DESTINO_DE_OTRO_NEGOCIO` dispararía falsos
  // positivos en dos de cada tres negocios. Ver el reporte de la sesión.
  const destinosConEseId = destinosPorId.get(accion.destino_id) ?? [];
  let destino: Destino | undefined;
  if (destinosConEseId.length === 0) {
    empujar('DESTINO_DESCONOCIDO', `Destino '${accion.destino_id}' no está en el catálogo del paquete.`);
  } else {
    destino = destinosConEseId.find((d) => d.negocio === accion.negocio);
    if (!destino) {
      empujar('DESTINO_DE_OTRO_NEGOCIO', `Destino '${accion.destino_id}' no existe para el negocio '${accion.negocio}' (sí para: ${destinosConEseId.map((d) => d.negocio).join(', ')}).`);
    } else if (!hechosResueltos.some((h) => h.destinos.includes(accion.destino_id))) {
      empujar('DESTINO_NO_SOPORTADO_POR_HECHO', `Ningún hecho citado declara '${accion.destino_id}' entre sus destinos.`);
    }
  }

  // -- duplica bloque 1 -------------------------------------------------
  if (paquete.exclusiones.some((e) => e.destino_id === accion.destino_id)) {
    empujar('DUPLICA_BLOQUE_1', `Destino '${accion.destino_id}' ya está excluido (§4.3 del plan de producto).`);
  }

  // -- ranuras -----------------------------------------------------------
  const tokens = extraerTokensRanura(accion.plantilla);
  const clavesRanuras = Object.keys(accion.ranuras);

  for (const [k, ref] of Object.entries(accion.ranuras)) {
    if (!accion.hecho_ids.includes(ref.hecho_id)) {
      empujar('RANURA_HUERFANA', `Ranura '{${k}}' referencia el hecho '${ref.hecho_id}', que no está en hecho_ids.`);
      continue;
    }
    const hechoRef = hechosById.get(ref.hecho_id);
    if (hechoRef && !(ref.campo in hechoRef.valores)) {
      empujar('CAMPO_INEXISTENTE', `Ranura '{${k}}' referencia el campo '${ref.campo}', que no existe en valores de '${ref.hecho_id}'.`);
    }
  }
  for (const token of tokens) {
    if (!clavesRanuras.includes(token)) {
      empujar('RANURA_FALTANTE', `La plantilla usa '{${token}}' pero no hay ranura declarada para esa clave.`);
    }
  }
  for (const k of clavesRanuras) {
    if (!tokens.includes(k)) {
      empujar('RANURA_NO_USADA', `La ranura '${k}' está declarada pero la plantilla no la usa.`);
    }
  }

  // -- contenido de la plantilla (independiente de si las ranuras resuelven) --
  const textoSinRanuras = quitarRanuras(accion.plantilla);
  if (/\d/.test(textoSinRanuras) || /[%$]/.test(textoSinRanuras)) {
    empujar('CIFRA_LIBRE', `La plantilla contiene un dígito, '%' o '$' fuera de una ranura: "${textoSinRanuras}".`);
  }
  if (contieneNumeralEnLetra(textoSinRanuras)) {
    empujar('NUMERAL_EN_LETRA', `La plantilla contiene un numeral escrito en letra: "${textoSinRanuras}".`);
  }
  if (contieneFechaEnLetra(textoSinRanuras)) {
    empujar('FECHA_EN_LETRA', `La plantilla contiene un mes o día de la semana en letra: "${textoSinRanuras}".`);
  }

  // -- R-7 mecanizada: sin_dato / parcial ---------------------------------
  if (destino) {
    const algunSinDato = hechosResueltos.some((h) => h.confianza === 'sin_dato');
    if (algunSinDato && destino.familia !== 'captura') {
      empujar('SIN_DATO_MAL_USADO', `Cita un hecho con confianza='sin_dato' y el destino '${accion.destino_id}' no es de captura.`);
    }

    if (hechoSustentador && hechoSustentador.confianza === 'parcial') {
      const otroOk = hechosResueltos.slice(1).some((h) => h.confianza === 'ok');
      if (!otroOk && destino.familia !== 'captura') {
        empujar('PARCIAL_SIN_ANCLA', `El primer hecho ('${hechoSustentador.id}') es 'parcial' y no hay un hecho 'ok' de apoyo ni destino de captura.`);
      }
    }
  }

  // -- A-7(i) mecánico: sólo sobre el hecho que sostiene la acción -------
  if (hechoSustentador && hechoSustentador.atendido_por.length > 0) {
    empujar('A7_YA_ATENDIDO', `El hecho que sostiene la acción ('${hechoSustentador.id}') ya está atendido por ${hechoSustentador.atendido_por.length} trabajo(s) abierto(s).`);
  }

  // -- A-8 mecánico: TODOS los hechos citados deben resolver y ser titulares --
  if (hechosResueltos.length > 0 && hechosResueltos.length === accion.hecho_ids.length) {
    if (hechosResueltos.every((h) => h.titular_pulso)) {
      empujar('A8_YA_VISIBLE', 'Todos los hechos citados ya son titulares del pulso (bloque 3).');
    }
  }

  // -- verbo fijado por el hecho ------------------------------------------
  if (hechoSustentador?.verbos_permitidos && hechoSustentador.verbos_permitidos.length > 0) {
    if (!empiezaConVerboPermitido(accion.plantilla, hechoSustentador.verbos_permitidos)) {
      empujar('VERBO_NO_PERMITIDO_PARA_HECHO', `El hecho '${hechoSustentador.id}' exige que la plantilla empiece por: ${hechoSustentador.verbos_permitidos.join(' | ')}.`);
    }
  }

  // -- longitud (sólo si la sustitución de ranuras es segura) ------------
  const bloqueaSustitucion = rechazos.some((r) =>
    (['HECHO_DESCONOCIDO', 'RANURA_HUERFANA', 'CAMPO_INEXISTENTE', 'RANURA_FALTANTE'] as CodigoRechazo[]).includes(r.codigo),
  );
  if (!bloqueaSustitucion) {
    const renderizada = sustituirRanurasParaLongitud(accion, hechosById);
    if (renderizada !== null && renderizada.length > MAX_LONGITUD_PLANTILLA_RENDERIZADA) {
      empujar('LONGITUD', `La plantilla renderizada mide ${renderizada.length} caracteres (máximo ${MAX_LONGITUD_PLANTILLA_RENDERIZADA}).`);
    }
  }

  if (rechazos.length > 0) {
    return { rechazos, info: null };
  }

  return {
    rechazos: [],
    info: {
      negocio: accion.negocio,
      origen: (hechoSustentador as Hecho).origen,
      visibilidad: destino && destino.requiere_rol === 'Gerencia' ? 'gerencia' : 'todos',
      clave: derivarClave(accion),
    },
  };
}

/** Agrupa `paquete.destinos` por `id` -- NO asume un único registro por id.
 *  Ver la nota de la resolución de destino en `evaluarAccionIndividual`
 *  sobre por qué `fin.presupuesto` puede aparecer una vez por negocio. */
function indexarDestinosPorId(paquete: PaqueteAcciones): Map<DestinoId, Destino[]> {
  const mapa = new Map<DestinoId, Destino[]>();
  for (const destino of paquete.destinos) {
    const lista = mapa.get(destino.id) ?? [];
    lista.push(destino);
    mapa.set(destino.id, lista);
  }
  return mapa;
}

// ============================================================================
// Validación cruzada -- reglas que comparan una acción contra las OTRAS
// acciones del mismo negocio (EXCEDE_CUPO, EXCEDE_CUPO_REVISION,
// DESTINO_REPETIDO). Se evalúan sólo sobre las candidatas que ya pasaron
// todas las reglas individuales, en el ORDEN en que el modelo las devolvió
// (la priorización todavía no ocurrió -- eso es `ordenarAcciones`, después).
// ============================================================================

export function validarSalidaMotor(salida: SalidaMotor, paquete: PaqueteAcciones): ResultadoValidacion {
  const hechosById = new Map(paquete.hechos.map((h) => [h.id, h] as const));
  const destinosPorId = indexarDestinosPorId(paquete);

  const rechazos: Rechazo[] = [];
  const candidatas: Array<{ indice: number; accion: AccionGenerada; info: NonNullable<EvaluacionIndividual['info']> }> = [];

  salida.acciones.forEach((accion, indice) => {
    const { rechazos: rechazosAccion, info } = evaluarAccionIndividual(accion, indice, paquete, hechosById, destinosPorId);
    if (rechazosAccion.length > 0) {
      rechazos.push(...rechazosAccion);
      return;
    }
    candidatas.push({ indice, accion, info: info as NonNullable<EvaluacionIndividual['info']> });
  });

  const aceptadas: AccionValidada[] = [];
  const porNegocioTotal = new Map<NegocioAccion, number>();
  const destinosVistos = new Set<string>(); // `${negocio}|${destino_id}`
  const negocioConO8 = new Set<NegocioAccion>();
  let totalAceptadas = 0;

  for (const { indice, accion, info } of candidatas) {
    const codigosCruzados: CodigoRechazo[] = [];
    const claveDestino = `${info.negocio}|${accion.destino_id}`;

    if (destinosVistos.has(claveDestino)) {
      codigosCruzados.push('DESTINO_REPETIDO');
    }
    if (info.origen === 'O8_revision' && negocioConO8.has(info.negocio)) {
      codigosCruzados.push('EXCEDE_CUPO_REVISION');
    }
    const yaEnNegocio = porNegocioTotal.get(info.negocio) ?? 0;
    if (yaEnNegocio >= MAX_ACCIONES_POR_NEGOCIO || totalAceptadas >= MAX_ACCIONES_TOTAL) {
      codigosCruzados.push('EXCEDE_CUPO');
    }

    if (codigosCruzados.length > 0) {
      for (const codigo of codigosCruzados) {
        rechazos.push({
          codigo,
          accion_indice: indice,
          detalle: `Regla cruzada por negocio '${info.negocio}' (código ${codigo}).`,
        });
      }
      continue;
    }

    destinosVistos.add(claveDestino);
    if (info.origen === 'O8_revision') negocioConO8.add(info.negocio);
    porNegocioTotal.set(info.negocio, yaEnNegocio + 1);
    totalAceptadas += 1;

    aceptadas.push({
      negocio: info.negocio,
      clave: info.clave,
      origen: info.origen,
      visibilidad: info.visibilidad,
      hecho_ids: accion.hecho_ids,
      destino_id: accion.destino_id,
      plantilla: accion.plantilla,
      ranuras: accion.ranuras,
    });
  }

  return { aceptadas, rechazos };
}
