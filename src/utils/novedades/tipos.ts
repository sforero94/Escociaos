/**
 * Tipos del bloque "Novedades" del Tablero General (issue #266, reemplaza
 * "Acciones recomendadas" -- ver `docs/plan_novedades.md`, CPO, y
 * `docs/plan_novedades_implementacion.md`, CTO).
 *
 * Este módulo es PURO -- sin red, sin Supabase, sin React -- y es el
 * contrato entre los cargadores por fuente (`src/utils/novedades/fuentes/`)
 * y el agrupador (`src/utils/novedades/agrupar.ts`). `NovedadCruda` es la
 * forma que cada fuente nueva tiene que producir para entrar al catálogo:
 * sumar una fuente es un archivo más, nunca un cambio a este archivo
 * (§2.3 del brief).
 *
 * `NovedadCruda` está tomada literalmente de
 * `docs/plan_novedades_implementacion.md` §6 -- no se reordena ni se
 * renombra un campo sin volver a ese documento primero.
 */

/**
 * Las 8 fuentes *Must* del catálogo v1 (§2.3 del brief). Una unión cerrada,
 * no `string`: el guard estático de §13.5 del plan técnico
 * (`novedadesFuentesAdmitidasGuard.test.ts`, fase F2) depende de que
 * cualquier tabla fuera de esta lista sea un error de TIPO, no sólo de
 * comportamiento -- es lo que hace mecánico N-1 ("nada que produzca un
 * cron entra al feed": `hato_alertas`, `acciones_*`, `clima_*` y
 * `logs_auditoria` no pueden colarse aquí por accidente).
 */
export type FuenteNovedad =
  | 'hato_eventos'
  | 'hato_pesajes_leche'
  | 'hato_tratamientos'
  | 'hato_chequeos'
  | 'registros_trabajo'
  | 'monitoreos'
  | 'movimientos_diarios'
  | 'fin_gastos';

/**
 * Los cuatro módulos que gobiernan la visibilidad del feed (§5 del brief).
 * Coincide a propósito con las claves de `modulos_acceso`
 * (`src/utils/modulosAcceso.ts`) -- el gate de rol se decide con
 * `puedeAccederModulo`, nunca reimplementado acá.
 */
export type ModuloNovedad = 'hato_lechero' | 'aguacate' | 'finanzas' | 'ganado';

/**
 * Canal de captura. Sólo las 4 fuentes del hato tienen una columna de la que
 * derivarlo (§5 del plan técnico) -- en las demás, `canal` es `null` y ESO
 * es correcto: un canal inferido ("autor presente ⇒ web") es cierto hoy por
 * accidente y deja de serlo el día que Telegram empiece a atribuir sus
 * propias capturas (F5 del plan). Nunca se inventa un canal.
 */
export type CanalNovedad = 'web' | 'telegram' | 'importacion' | 'alerta' | 'chequeo';

/**
 * La forma que cada cargador de fuente (`src/utils/novedades/fuentes/*.ts`)
 * produce por CADA FILA cruda leída de su tabla, antes de agrupar. El
 * agrupador (`agrupar.ts`) consume únicamente esta forma -- nunca conoce
 * Supabase ni el nombre de una columna real.
 *
 * Verbatim de `docs/plan_novedades_implementacion.md` §6.
 */
export interface NovedadCruda {
  fuente: FuenteNovedad;
  modulo: ModuloNovedad; // 'hato_lechero' | 'aguacate' | 'finanzas' | 'ganado'
  tipoHecho: string; // 'servicio', 'parto', 'jornal', 'gasto'…
  claveGrano: string; // §4.1 — la declara la fuente, no el agrupador
  autorId: string | null; // uuid. NUNCA un nombre
  autorTextoLibre: string | null; // sólo movimientos_inventario
  canal: CanalNovedad | null; // null = la fuente no tiene de dónde saberlo
  capturadoEn: string; // created_at, ISO con huso
  fechaHecho: string | null; // 'AAAA-MM-DD'; null = la fuente no tiene fecha del hecho
  objetoNombre: string | null; // 'ELECTRA (#117)'
  tamano: { filas: number; objetos?: number; denominador?: number; personas?: number; montoTotal?: number };
  ruta: string | null; // destino de la navegación
}

/**
 * El tamaño declarado de una sesión de captura o de la unidad de un módulo
 * (§4.4 del brief: "52 de 65 vacas", "8 jornales de 8 personas", "66 filas").
 * Mismo tipo que `NovedadCruda.tamano` -- una `Novedad` agrupada hereda el
 * tamaño de la sesión que la produjo, no lo recalcula (§12.12 del brief:
 * "ninguna cifra se recalcula acá").
 */
export interface TamanoNovedad {
  filas: number;
  objetos?: number;
  denominador?: number;
  /** Conteo DISTINTO de personas (empleado/contratista) en la sesión --
   *  independiente de `objetos`, que en `registros_trabajo` ahora cuenta
   *  labores (ver `Novedad.objetosNombre`), no personas. Sólo lo puebla
   *  `registrosTrabajo.ts` (§4.1 del brief, "8 jornales... de 8 personas";
   *  guardrail 2026-09-17: Santiago pidió que la línea nombre la labor Y
   *  cuente las personas -- dos dimensiones que no caben en un solo campo
   *  acoplado a `objetosNombre`). */
  personas?: number;
  /** Suma de dinero de la sesión (sólo `fin_gastos`, COP). Guardrail
   *  2026-09-17: "Consuelito registró 15 gastos" no dice por cuánto -- una
   *  cifra sin su total no se puede leer sola. */
  montoTotal?: number;
}

/**
 * Una línea del feed, ya agrupada por `agrupar.ts` según la regla de grano
 * de §4.1 del brief (una sesión de captura, o la unidad propia del módulo
 * cuando la tiene: ronda, chequeo, quincena). `frases.ts` consume esta forma
 * para producir el texto que se pinta -- nunca al revés.
 */
export interface Novedad {
  /** `claveGrano` de las `NovedadCruda` que se fundieron en esta línea.
   *  Identifica la línea de forma estable entre renders. */
  id: string;
  fuente: FuenteNovedad;
  modulo: ModuloNovedad;
  tipoHecho: string;
  /** uuid del autor, o `null` si la fuente no tiene de dónde tomarlo o el
   *  RPC de autores (`fn_novedades_autores`) no encontró la fila -- nunca se
   *  fabrica un nombre (§12.7 del brief). */
  autorId: string | null;
  /** Nombre resuelto por `fn_novedades_autores`. `null` cuando `autorId` es
   *  `null` o no resolvió -- la línea debe leer "sin autor registrado"
   *  (§4.3 del brief), nunca "Sistema" ni un nombre inventado. */
  autorNombre: string | null;
  /** Sólo poblado para `movimientos_inventario` (fuente *Should*, fuera de
   *  las 8 *Must* de esta fase): el texto libre de `responsable` cuando no
   *  resuelve contra `usuarios.email`. Se pinta tal cual, nunca normalizado
   *  ni adivinado (§4.3 del brief). */
  autorTextoLibre: string | null;
  canal: CanalNovedad | null;
  /** El más reciente `capturadoEn` del grupo -- es la clave de orden del
   *  feed entero (§4.2 del brief: "el feed se ordena por fecha de CAPTURA,
   *  descendente"). */
  capturadoEn: string;
  /** Todas las fechas del hecho presentes en el grupo, en el orden en que
   *  llegaron de la fuente. Vacío cuando la fuente no tiene fecha del hecho.
   *  `frases.ts` decide, a partir de esta lista, si imprime un rango
   *  completo y si el año difiere del de `capturadoEn` (§4.2 del brief). */
  fechasHecho: string[];
  /** `true` si alguna `fechaHecho` del grupo es posterior a hoy (Bogotá).
   *  Marca binaria, nunca un umbral (§4.2 del brief). */
  conFechaFutura: boolean;
  /** Hasta 3 nombres propios del hecho (una vaca, una persona con nombre
   *  propio). `frases.ts` decide el corte a 3 + "y N más" -- acá sólo se
   *  preservan en el orden en que llegaron. */
  objetosNombre: string[];
  tamano: TamanoNovedad;
  /** Destino de navegación al hacer clic en la línea entera, o `null` si esa
   *  fuente todavía no tiene una ruta que filtrar (§17.4 del plan técnico). */
  ruta: string | null;
}

/**
 * Un encabezado de día del feed (§4.4 del brief: "Hoy", "Ayer — lunes 15 de
 * septiembre", agrupado en día calendario Bogotá vía `diaBogota()`). El
 * orden de `novedades` dentro del grupo hereda el orden global del feed
 * (`capturadoEn` descendente) -- un `GrupoDia` nunca reordena por su cuenta.
 */
export interface GrupoDia {
  /** "Hoy" | "Ayer — lunes 15 de septiembre" | "sábado 13 de septiembre" -- el
   *  texto ya resuelto, listo para pintar. */
  encabezado: string;
  /** Día calendario Bogotá (`AAAA-MM-DD`) que agrupa esta sección -- la clave
   *  con la que `agrupar.ts` decidió qué línea entra aquí. */
  fecha: string;
  novedades: Novedad[];
}

/**
 * Una fuente que falló al cargar (§4.4 del brief, quinto estado: "Una fuente
 * falla"). Degradación por MÓDULO, no por tabla individual -- un cargador de
 * módulo (`cargarHato()`, `cargarAguacate()`, `cargarFinanzas()`) es la
 * unidad que puede rechazarse entera vía `Promise.allSettled` (§2.2 del plan
 * técnico), así que `modulo` es el campo que importa para la línea gris
 * ("No se pudo leer el hato.").
 */
export interface ErrorModulo {
  modulo: ModuloNovedad;
  /** Mensaje ya listo para pintar, p. ej. "No se pudo leer el hato." --
   *  la redacción literal de §4.4 del brief. */
  mensaje: string;
}
