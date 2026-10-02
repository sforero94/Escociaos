// ARCHIVO: utils/hato/criaAutomatica.ts
// DESCRIPCIÓN: ESCO-135 -- ficha automática de la ternera retenida.
//
// Decisión del dueño (Santiago, 2026-10-02): cuando un parto se registra con
// `cria_destino = 'retenida'` (hembra que se queda), el sistema crea la ficha
// de la cría en `hato_animales` con `nombre = 'SIN NOMBRE'` y la chapeta
// siguiente de la serie («215, 216, etc»). Antes la ternera no existía en el
// sistema hasta que alguien la daba de alta a mano, y `hato_eventos.cria_id`
// no tenía ningún escritor.
//
// Módulo PURO con CERO imports: lo usan el navegador (`useMarcarCicloHato`)
// y el bot (`/evento` → Parto). Las dos copias Deno-side
// (`<server>/hato-cria-automatica.ts`) son GENERADAS por
// `docs/hato/regenerar-copias-cria-automatica.py` y deben ser byte-idénticas
// debajo del primer separador de sección
// (`src/__tests__/hatoCriaAutomaticaParidad.test.ts`). Nunca edites una copia
// a mano: edita este archivo y regenera.

// ----------------------------------------------------------------------------
// Constantes
// ----------------------------------------------------------------------------

export const NOMBRE_CRIA_SIN_NOMBRE = 'SIN NOMBRE';

/** 800-999 son números de trabajo PROVISIONALES (migración 066), no la serie
 * de caravanas físicas. Tampoco cuentan las atípicas 5xxx (FLACA #5182,
 * PACHA #5202): todo lo que esté en o por encima de este número queda fuera
 * del cálculo de la siguiente chapeta. */
export const CHAPETA_PROVISIONAL_DESDE = 800;

/** Marca en `hato_animales.import_meta.origen`. Es lo que permite al
 * Deshacer de Telegram reconocer una ficha que creó este flujo y no otra. */
export const ORIGEN_CRIA_AUTOMATICA = 'parto_automatico';

const TICKET = 'ESCO-135';

/** Ventana biológica de gestación bovina, en días antes del parto, para
 * reconocer el servicio que dio la cría. La gestación real ronda 279-292
 * días; la ventana es más ancha para tolerar fechas aproximadas, y lo que
 * cae fuera NO se adjudica: el padre queda en NULL antes que adivinarlo. */
const GESTACION_MIN_DIAS = 240;
const GESTACION_MAX_DIAS = 310;

// ----------------------------------------------------------------------------
// Tipos
// ----------------------------------------------------------------------------

export interface FilaChapeta {
  numero: number | null;
  estado: string;
}

export interface ServicioMadre {
  fecha: string;
  toro_id: string | null;
}

export type ConfianzaFechaCria = 'exacta' | 'aproximada' | 'desconocida';
export type FuenteCria = 'web' | 'telegram';

export interface InputFichaCria {
  numero: number;
  madreId: string;
  fincaId: string | null;
  fechaParto: string;
  fechaPartoConfianza: ConfianzaFechaCria;
  padreToroId: string | null;
  createdBy: string | null;
  fuente: FuenteCria;
}

/** Fila insertable en `hato_animales`. Sin `raza` a propósito: la de la
 * madre no es la de la cría, y una raza inventada no se distingue después
 * de una registrada. */
export interface FichaCriaInsert {
  numero: number;
  nombre: string;
  sexo: 'hembra';
  etapa: 'ternera';
  estado: 'activa';
  fecha_nacimiento: string;
  fecha_nacimiento_confianza: ConfianzaFechaCria;
  madre_id: string;
  padre_toro_id: string | null;
  finca_id: string | null;
  origen: 'nacimiento';
  import_meta: {
    origen: string;
    fuente: FuenteCria;
    madre_id: string;
    fecha_parto: string;
    ticket: string;
  };
  notas: string;
  created_by: string | null;
}

export type ResultadoInsertCria =
  | { id: string }
  | { error: { code?: string; message: string } };

export interface DependenciasCreacionCria {
  /** Animales con su `numero` y `estado`. Puede traer más de lo necesario:
   * el filtro de la serie lo aplica `calcularSiguienteChapetaCria`. */
  leerChapetasActivas: () => Promise<FilaChapeta[]>;
  insertar: (fila: FichaCriaInsert) => Promise<ResultadoInsertCria>;
}

export interface CriaParaDeshacer {
  id: string;
  madre_id: string | null;
  nombre: string | null;
  estado: string;
  import_meta: unknown;
}

export type DecisionDeshacerCria =
  | { accion: 'sin_cria' }
  | { accion: 'borrar'; criaId: string }
  | { accion: 'rechazar'; motivo: string };

// ----------------------------------------------------------------------------
// Reglas
// ----------------------------------------------------------------------------

/** Solo la hembra que se queda tiene ficha propia. */
export function debeCrearFichaCria(criaDestino: string | null | undefined): boolean {
  return criaDestino === 'retenida';
}

/**
 * Siguiente chapeta de la serie: (máximo `numero` entre animales ACTIVOS con
 * número menor que 800) + 1.
 *
 * Las vendidas/muertas no cuentan aunque tengan un número más alto (239, 251,
 * 442 están vendidas), y tampoco las provisionales ni las atípicas. Si no hay
 * ninguna activa en la serie, o la siguiente caería en el rango provisional,
 * falla en vez de inventar un número.
 */
export function calcularSiguienteChapetaCria(animales: FilaChapeta[]): number {
  let maximo: number | null = null;
  for (const a of animales) {
    if (a.estado !== 'activa') continue;
    if (a.numero == null || !Number.isInteger(a.numero)) continue;
    if (a.numero <= 0 || a.numero >= CHAPETA_PROVISIONAL_DESDE) continue;
    if (maximo === null || a.numero > maximo) maximo = a.numero;
  }
  if (maximo === null) {
    throw new Error(
      'No hay ninguna chapeta activa por debajo de 800 para continuar la serie. Asigna la chapeta de la ternera a mano.',
    );
  }
  const siguiente = maximo + 1;
  if (siguiente >= CHAPETA_PROVISIONAL_DESDE) {
    throw new Error(
      `La siguiente chapeta sería ${siguiente}, dentro del rango provisional (800-999). Asigna la chapeta de la ternera a mano.`,
    );
  }
  return siguiente;
}

function diasEntre(desde: string, hasta: string): number {
  const [a1, m1, d1] = desde.split('-').map(Number);
  const [a2, m2, d2] = hasta.split('-').map(Number);
  return Math.round((Date.UTC(a2, m2 - 1, d2) - Date.UTC(a1, m1 - 1, d1)) / 86400000);
}

/**
 * Toro del servicio que dio este parto, o `null` si no se puede saber sin
 * adivinar. Se consideran solo los servicios de la madre dentro de la
 * ventana de gestación antes del parto. Exactamente un toro distinto (y
 * ningún servicio sin toro) → ese toro. Cualquier otra forma → `null`.
 */
export function elegirToroDelServicio(
  servicios: ServicioMadre[],
  fechaParto: string,
): string | null {
  const enVentana = servicios.filter((s) => {
    const dias = diasEntre(s.fecha, fechaParto);
    return dias >= GESTACION_MIN_DIAS && dias <= GESTACION_MAX_DIAS;
  });
  if (enVentana.length === 0) return null;
  if (enVentana.some((s) => s.toro_id == null)) return null;
  const toros = new Set(enVentana.map((s) => s.toro_id as string));
  return toros.size === 1 ? [...toros][0] : null;
}

export function construirFichaCria(input: InputFichaCria): FichaCriaInsert {
  return {
    numero: input.numero,
    nombre: NOMBRE_CRIA_SIN_NOMBRE,
    sexo: 'hembra',
    etapa: 'ternera',
    estado: 'activa',
    fecha_nacimiento: input.fechaParto,
    fecha_nacimiento_confianza: input.fechaPartoConfianza,
    madre_id: input.madreId,
    padre_toro_id: input.padreToroId,
    finca_id: input.fincaId,
    origen: 'nacimiento',
    import_meta: {
      origen: ORIGEN_CRIA_AUTOMATICA,
      fuente: input.fuente,
      madre_id: input.madreId,
      fecha_parto: input.fechaParto,
      ticket: TICKET,
    },
    notas: `Ficha creada automáticamente al registrar el parto (${TICKET}). Falta ponerle nombre.`,
    created_by: input.createdBy,
  };
}

function esViolacionUnica(r: ResultadoInsertCria): boolean {
  return 'error' in r && r.error.code === '23505';
}

/**
 * Calcula la chapeta, inserta la ficha y, si otra escritura tomó la misma
 * chapeta entre la lectura y el INSERT (23505 sobre
 * `hato_animales_numero_activa_unique`, migración 066), recalcula y reintenta
 * UNA vez. Un segundo choque, o cualquier otro error, lanza.
 */
export async function crearFichaCriaConReintento(
  deps: DependenciasCreacionCria,
  input: Omit<InputFichaCria, 'numero'>,
): Promise<{ id: string; numero: number }> {
  for (let intento = 1; intento <= 2; intento++) {
    const numero = calcularSiguienteChapetaCria(await deps.leerChapetasActivas());
    const resultado = await deps.insertar(construirFichaCria({ ...input, numero }));
    if ('id' in resultado) return { id: resultado.id, numero };
    if (esViolacionUnica(resultado) && intento === 1) continue;
    if (esViolacionUnica(resultado)) {
      throw new Error(
        `La chapeta #${numero} ya la tiene otro animal activo (dos intentos). No se creó la ficha de la ternera.`,
      );
    }
    throw new Error(`No se pudo crear la ficha de la ternera: ${resultado.error.message}`);
  }
  // Inalcanzable: el bucle siempre retorna o lanza.
  throw new Error('No se pudo crear la ficha de la ternera.');
}

export function mensajeCriaCreada(numero: number): string {
  return `Ternera creada: #${numero} ${NOMBRE_CRIA_SIN_NOMBRE}`;
}

function origenDeImportMeta(importMeta: unknown): string | null {
  if (!importMeta || typeof importMeta !== 'object') return null;
  const origen = (importMeta as Record<string, unknown>).origen;
  return typeof origen === 'string' ? origen : null;
}

/**
 * ¿El Deshacer de un parto puede llevarse también la ficha de la cría?
 *
 * Solo si la ficha la creó este flujo para ESTA madre y sigue intacta: sin
 * nombre, activa y sin ningún registro propio (`referencias` = filas de
 * otras tablas que apuntan a la cría). Cualquier otra forma rechaza el
 * Deshacer completo: borrar el parto y dejar una ternera huérfana, o borrar
 * una ternera en la que alguien ya trabajó, es peor que no deshacer.
 */
export function decidirDeshacerCria(args: {
  cria: CriaParaDeshacer | null;
  madreId: string;
  referencias: number;
}): DecisionDeshacerCria {
  const { cria } = args;
  if (!cria) return { accion: 'sin_cria' };
  if (origenDeImportMeta(cria.import_meta) !== ORIGEN_CRIA_AUTOMATICA) {
    return { accion: 'rechazar', motivo: 'la ficha de la cría no la creó este registro' };
  }
  if (cria.madre_id !== args.madreId) {
    return { accion: 'rechazar', motivo: 'la cría está vinculada a otra madre' };
  }
  if (cria.nombre !== NOMBRE_CRIA_SIN_NOMBRE) {
    return { accion: 'rechazar', motivo: 'la cría ya tiene nombre' };
  }
  if (cria.estado !== 'activa') {
    return { accion: 'rechazar', motivo: 'la cría ya no está activa' };
  }
  if (args.referencias > 0) {
    return { accion: 'rechazar', motivo: 'la cría ya tiene registros propios' };
  }
  return { accion: 'borrar', criaId: cria.id };
}
