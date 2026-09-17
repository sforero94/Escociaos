/**
 * Tipos del motor de acciones recomendadas (bloque 4 del Centro de Control).
 *
 * Fuente de verdad: `docs/brief_tecnico_motor_acciones.md` §3.2 (el paquete
 * cerrado), §3.5 (el catálogo de destinos) y §4.1 (el esquema de salida del
 * modelo). Este módulo es PURO -- sin red, sin Supabase, sin LLM -- y es la
 * base de la que dependen `accionesValidador.ts`, `accionesOrden.ts` y
 * `accionesRender.ts`.
 *
 * Espejado byte-idéntico en `src/supabase/functions/server/acciones-tipos.ts`
 * y `supabase/functions/make-server-1ccce916/acciones-tipos.ts`. Nunca se
 * edita a mano una copia para callar una falla de paridad -- se regenera.
 *
 * --------------------------------------------------------------------------
 * Dos puentes deliberados hacia partes del contrato que el brief referencia
 * pero no termina de cerrar en las secciones §3.2/§3.5. Sin ellos ninguno de
 * los módulos de esta ola compila o puede implementar §4.3 tal cual está
 * escrito. Detalle completo en el reporte de la sesión que creó este
 * archivo -- resumen aquí para quien lea el código primero:
 *
 *   1. `SelectorId` es un alias de `string`, no la unión cerrada que el
 *      brief describe en §6.2. Esa unión vive en `accionesHechos.ts`, que es
 *      la siguiente ola (depende de otra fase en curso en paralelo) y no se
 *      escribe en esta sesión por instrucción explícita. `CotejoSpec` (§6.3)
 *      necesita ALGÚN tipo para `selector` -- se amplía cuando ese módulo
 *      aterrice.
 *   2. `Hecho.verbos_permitidos` y `Destino.familia` NO están en el §3.2 /
 *      §3.5 del brief tal cual está redactado, pero §4.3 exige ambos para
 *      que `VERBO_NO_PERMITIDO_PARA_HECHO`, `SIN_DATO_MAL_USADO` y
 *      `PARCIAL_SIN_ANCLA` sean reglas MECÁNICAS (computadas sobre un campo
 *      tipado) en vez de heurísticas sobre el id del hecho o del destino.
 *      Es exactamente la filosofía que el propio brief defiende ("lo que se
 *      puede computar, se computa") -- por eso se resuelve así y no con un
 *      `if (destino.id === 'hato.pesaje' || ...)` esparcido en el validador.
 */

// ============================================================================
// §3.2 -- tipos base del paquete cerrado
// ============================================================================

export type NegocioAccion = 'hato_lechero' | 'aguacate' | 'ganado';

export type ConfianzaHecho =
  | 'ok' // el dato existe y es fresco
  | 'parcial' // el dato existe sobre un denominador incompleto (27 de 34 vacas pesadas)
  | 'sin_dato'; // el dato NO existe (agosto sin ingresos, lluvia congelada, vaca sin pesar)

/** Valor tipado. NUNCA se manda al modelo ya formateado como texto suelto:
 *  `crudo` es lo que se compara, `render` es lo que se pinta. */
export interface ValorHecho {
  crudo: number | string | null;
  render: string; // ya pasado por format.ts -- '11', '25,5%', '$11,6M', '13 días'
  unidad: string | null; // 'vacas' | '%' | 'días' | 'L/vaca' | 'cabezas' | null
}

/** Origen taxonómico (§3.1 del plan del CPO). La v1 son O-1, O-2 y O-8. */
export type OrigenHecho = 'O1_senal' | 'O2_hueco' | 'O8_revision';

/** Un trabajo abierto en el sistema que ya está atendiendo este mismo hecho.
 *  Es A-7(i), y es CONSULTABLE -- no una opinión (§3.2 bis del plan del CPO). */
export interface TrabajoAbierto {
  tipo: 'aplicacion' | 'tarea' | 'tratamiento' | 'compra' | 'movimiento_pendiente';
  referencia: string; // id de la fila
  etiqueta: string; // 'Fumigación control monalonion agosto'
  desde: string; // AAAA-MM-DD
}

/**
 * Selector nombrado (§6.2 del brief). La unión cerrada real
 * (`'hato.vacias_90d' | 'agu.insumo_faltante' | ...`) vive en
 * `accionesHechos.ts` -- puente 1 del header. Aquí es un alias abierto para
 * que `CotejoSpec` compile sin adelantarse a un módulo que no existe todavía.
 */
export type SelectorId = string;

/** Cómo se revalida un hecho al pintar (§6.3). El cotejo en sí -- comparar
 *  contra los derivados que el pulso ya cargó -- lo implementa el consumidor
 *  del navegador (Fase 4); aquí sólo vive la forma de la especificación. */
export type CotejoSpec =
  | { tipo: 'conteo_min'; selector: SelectorId; minimo: number } // "siguen habiendo al menos N"
  | { tipo: 'existe'; selector: SelectorId } // > 0
  | { tipo: 'sin_cotejo' }; // hecho estructural

export interface Hecho {
  /** id estable y legible. Es la clave del contrato: el modelo referencia esto. */
  id: string; // 'hato.vacias_90d', 'agu.plaga.huevos_de_acaro'
  negocio: NegocioAccion;
  origen: OrigenHecho;
  categoria: string; // 'reproduccion'|'produccion'|'sanidad'|'plagas'|'aplicaciones'|'insumos'|'labor'|'inventario'|'captura'|'revision'
  /** Frase de evidencia LISTA PARA PINTAR, producida por el data layer.
   *  Formato: "<afirmación con cifras> -- <fuente>, <fecha o edad>". */
  texto: string;
  /** Las cifras, direccionables por nombre de campo. Origen de TODA ranura. */
  valores: Record<string, ValorHecho>;
  fuente: string; // 'v_hato_estado_actual' | 'monitoreos (ronda_id)' | 'gan_inventario'
  fecha_dato: string | null; // AAAA-MM-DD del dato, no de la generación
  edad_dias: number | null;
  confianza: ConfianzaHecho;
  /** Destinos que resuelven este hecho. Si va vacío, el hecho es contexto y
   *  NO puede sostener una acción por sí solo (R-4). */
  destinos: DestinoId[];
  /** Cómo se revalida al pintar. Ver §6. */
  cotejo: CotejoSpec;

  // ---- Campos que hacen mecánicos A-7, A-8 y el orden (revisión 2) --------

  /** A-7(i): trabajos abiertos que ya atienden este hecho. Lista vacía = nadie
   *  lo está moviendo. Un hecho con la lista NO vacía **no puede ser el hecho
   *  que sostiene una acción** -- sí puede citarse como evidencia de apoyo. */
  atendido_por: TrabajoAbierto[];
  /** A-8: `true` si este hecho ES un titular del pulso (bloque 3) -- el número
   *  que ya se ve 200 píxeles más arriba. Una acción cuyo ÚNICO hecho es un
   *  titular se rechaza: no aporta nada que no esté en pantalla. */
  titular_pulso: boolean;
  /** Criterio 1º del orden (§4.6): fecha declarada dentro de los próximos 7
   *  días o ya vencida. `null` = este hecho no tiene fecha encima. */
  fecha_limite: string | null;
  /** Criterio 2º del orden: días que el bloqueo lleva esperando sin que nadie
   *  lo mueva. `null` = no aplica. */
  dias_esperando: number | null;
  /** Criterio 3º del orden: tamaño del conjunto afectado (N objetos). */
  tamano_conjunto: number | null;
  /** Deriva del destino: si el destino exige Gerencia, el hecho también.
   *  La fila persistida NUNCA contiene un importe (§3.4); esto sólo gobierna
   *  a quién se le pinta la acción. */
  visibilidad: 'todos' | 'gerencia';

  /**
   * Puente 2 del header (no está en el §3.2 del brief tal cual escrito).
   * Verbos con los que DEBE empezar cualquier plantilla cuyo PRIMER hecho
   * sea este -- ausente/`null`/`[]` = sin restricción. Hoy sólo lo declara
   * `agu.insumo_faltante`: `['Confirmar', 'Verificar']` (§3.3 bis, §4.3).
   */
  verbos_permitidos?: string[] | null;
}

export interface ExclusionBloque1 {
  destino_id: DestinoId;
  motivo: string; // 'ya está en Requiere tu decisión'
}

export interface ContextoComite {
  estado: 'ok' | 'sin_reuniones_recientes' | 'no_disponible';
  ventana_dias: number;
  /** SIN texto libre en v1. Ver §6.5. */
  senales: Array<{
    hecho_id: string; // el hecho al que apunta el compromiso
    fecha_reunion: string; // AAAA-MM-DD, de la propiedad Date de Notion
    tipo: 'compromiso_pendiente' | 'mencionado';
  }>;
}

export interface PaqueteAcciones {
  version: 1;
  generado_at: string; // ISO con offset -05:00
  fecha_referencia: string; // AAAA-MM-DD Bogotá, vía obtenerFechaHoy()
  negocios: NegocioAccion[]; // los que tienen datos suficientes esta corrida
  hechos: Hecho[];
  destinos: Destino[]; // catálogo cerrado, §3.5
  exclusiones: ExclusionBloque1[];
  contexto_comite: ContextoComite;
  /** Errores por negocio: un negocio caído no tumba a los otros. */
  incidencias: Array<{ negocio: NegocioAccion; error: string }>;
}

// ============================================================================
// §3.5 -- catálogo de destinos. Se incluye en este archivo (no en uno
// separado) porque `Hecho.destinos` y `PaqueteAcciones.destinos` dependen de
// él para compilar: es parte del mismo contrato cerrado que §3.2.
// ============================================================================

export type DestinoId =
  | 'hato.lista_vacias' | 'hato.lista_secado' | 'hato.lista_hato'
  | 'hato.chequeos' | 'hato.pesaje' | 'hato.produccion'
  | 'hato.ranking_vacas' // O-8: productividad del hato
  | 'agu.monitoreo' | 'agu.monitoreo_sublote' | 'agu.aplicacion_cierre'
  | 'agu.aplicacion_detalle' | 'agu.labores' | 'agu.clima'
  | 'agu.tarea_detalle' // tarea atascada
  | 'inv.producto' // insumo faltante -> ficha del producto
  | 'fin.presupuesto' // O-8: ejecución presupuestal (Gerencia)
  | 'gan.dashboard' | 'gan.movimientos' | 'gan.config_fincas';

export interface Destino {
  id: DestinoId;
  etiqueta_boton: string; // 'Ver las vacías', 'Ir al cierre' -- TEXTO FIJO, no lo escribe el modelo
  ruta: string; // '/hato-lechero/hato?filtro=vacias_90d'
  negocio: NegocioAccion;
  requiere_rol?: 'Gerencia';
  /** `true` si la pantalla de destino ya muestra este número como su titular.
   *  Propaga A-8 desde el destino al hecho (§3.3 ter, G-2). */
  es_titular_pulso?: boolean;

  /**
   * Puente 2 del header (no está en el §3.5 del brief tal cual escrito).
   * R-7 (`SIN_DATO_MAL_USADO`) y su variante suave (`PARCIAL_SIN_ANCLA`,
   * nota de §4.3) necesitan distinguir mecánicamente un destino que sirve
   * para CAPTURAR el dato faltante de uno que sólo lo CONSULTA -- el brief
   * los nombra por ejemplo ("destinos de la familia `captura`
   * (`hato.pesaje`, `agu.labores`, `gan.config_fincas`…)") pero nunca los
   * tipa. Ver el reporte de la sesión para la clasificación completa de los
   * 19 destinos y su justificación -- es una lectura razonable del brief,
   * no una decisión de producto, y el catálogo real de `Destino[]` lo
   * construye la Fase 2 (`acciones-paquete.ts`), que puede corregirla.
   */
  familia: 'captura' | 'consulta';
}

// ============================================================================
// §4.1 -- esquema de salida (lo que el modelo devuelve)
// ============================================================================

export interface RanuraRef {
  hecho_id: string; // debe estar en accion.hecho_ids
  campo: string; // debe existir en hecho.valores
}

export interface AccionGenerada {
  negocio: NegocioAccion;
  /** 1..3 hechos, TODOS del mismo negocio. El primero es el que sostiene la acción. */
  hecho_ids: string[];
  destino_id: DestinoId;
  /** Texto imperativo con ranuras `{nombre}`. SIN dígitos, sin %, sin $, sin
   *  numerales en letra. ≤ 90 caracteres una vez sustituidas las ranuras. */
  plantilla: string;
  /** Cada ranura es una REFERENCIA. El tipo no admite un número. */
  ranuras: Record<string, RanuraRef>;
}

export interface SalidaMotor {
  acciones: AccionGenerada[]; // ≤ 3 por negocio, ≤ 9 en total
}

// `orden` NO está en `AccionGenerada`/`SalidaMotor` a propósito: el §4.1 del
// brief (revisión 2) lo saca del esquema de salida del modelo. Lo calcula
// `ordenarAcciones` (accionesOrden.ts), nunca el modelo.
