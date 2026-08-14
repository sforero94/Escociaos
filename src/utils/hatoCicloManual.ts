// ARCHIVO: utils/hatoCicloManual.ts
// DESCRIPCIÓN: T4a (S3, docs/plan_hato_ciclo_manual_override.md §3) -- lógica
// pura de las 4 marcas manuales del ciclo reproductivo: preñada · confirmada
// · seca · parida. Vive FUERA de calculosHato.ts a propósito (mismo criterio
// que hatoCategorias.ts): es lógica de producto, no entra al trío protegido
// por paridad, así que cambiar una etiqueta o un umbral visual aquí no
// obliga a regenerar las copias del servidor. Cero imports de Supabase ni de
// React.
//
// D-20 (dueño, 2026-08-06): "preñada" y "confirmada" son el MISMO
// `EstadoReproductivo` (`preñada`), distinguidas solo por `datos.metodo`
// ('presuncion' / 'palpacion'). No se agrega un tipo nuevo a `hato_eventos`:
// `ultimo_evento_fecha` es MAX(fecha) sobre TODA la tabla, así que un tipo
// que `derivarEstadoReproductivo` no sepa clasificar tira al animal a
// `indeterminado` -- la trampa que documenta calculosHato.ts §1.2 del
// diseño. Las cuatro marcas mapean a tipos YA existentes en el CHECK de
// `hato_eventos.tipo`: confirmacion_prenez, secado_real, parto.

import {
  derivarEstadoReproductivo,
  type CriaDestino,
  type EstadoActualHatoRow,
  type EstadoReproductivo,
  type HatoConfig,
} from '@/utils/calculosHato';

export type MarcaCiclo = 'preñada' | 'confirmada' | 'seca' | 'parida';

/** D-20: la evidencia detrás de una marca "preñada"/"confirmada" -- nunca un
 * segundo valor de `EstadoReproductivo`. */
export type MetodoPrenez = 'presuncion' | 'palpacion';

/** §3.3 del diseño: cuando la vaca no tiene un `ultimo_servicio_fecha`
 * utilizable como ancla (`necesitaAnclaServicio`), el diálogo ofrece tres
 * salidas, en este orden de preferencia. Nunca se inventa una fecha ancla. */
export type ModoAnclaServicio = 'fecha_conocida' | 'meses_prenez' | 'ninguna';

export interface AnclaServicioInput {
  modo: ModoAnclaServicio;
  /** Solo cuando `modo === 'fecha_conocida'`. */
  fechaServicio?: string;
  /** Solo cuando `modo === 'meses_prenez'` -- lo que dice el veterinario. */
  mesesPrenez?: number;
}

export interface InputMarcaCiclo {
  marca: MarcaCiclo;
  /** Fecha del hecho que se marca (parto/secado/confirmación), YYYY-MM-DD. */
  fecha: string;
  /** Columna común de las 4 marcas -- nunca 'desconocida': Martha siempre
   * aporta al menos una fecha aproximada al marcar a mano. */
  fechaConfianza: 'exacta' | 'aproximada';
  /** Solo relevante para `marca === 'parida'`. */
  criaDestino?: CriaDestino;
  nota?: string;
  /** Solo relevante para `marca === 'preñada' | 'confirmada'`. */
  ancla?: AnclaServicioInput;
}

/** Payload insertable en `hato_eventos` (sin `id`/`animal_id`/`created_at`/
 * `created_by`, que agrega el hook con acceso a la sesión -- mismo contrato
 * que `EventoDerivado` de calculosHato.ts). */
export interface EventoMarcaCicloPayload {
  tipo: 'servicio' | 'confirmacion_prenez' | 'secado_real' | 'parto';
  fecha: string;
  fecha_confianza: 'exacta' | 'aproximada';
  cria_destino?: CriaDestino;
  datos: Record<string, unknown>;
  fuente: 'web';
}

// ============================================================================
// Aritmética de fecha local -- duplica la FÓRMULA de calculosHato.ts, nunca
// su responsabilidad (ninguna de sus funciones internas de fecha está
// exportada; mismo criterio que ya aplica hatoUi.ts con `diasHastaFecha`).
// ============================================================================

function parsearIso(fechaIso: string): { anio: number; mes: number; dia: number } {
  const [anio, mes, dia] = fechaIso.split('-').map(Number);
  return { anio, mes, dia };
}

function formatearIso(anio: number, mes: number, dia: number): string {
  return `${anio}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
}

/** `fecha_marca − meses × 30.44` días, redondeado al día -- la misma
 * aritmética que `calcularMesesPrenez` (calculosHato.ts) invertida (diseño
 * §3.3, caso 2 "Meses de preñez (lo que dice el veterinario)"). Días, NUNCA
 * meses calendario (`sumarMeses` de calculosHato.ts, no exportada): es la
 * misma convención que ya usa `TP` en la planilla real, no una nueva. */
export function derivarFechaServicioDesdeMesesPrenez(fechaMarca: string, mesesPrenez: number): string {
  const { anio, mes, dia } = parsearIso(fechaMarca);
  const dias = Math.round(mesesPrenez * 30.44);
  const fechaMs = Date.UTC(anio, mes - 1, dia) - dias * 86400000;
  const d = new Date(fechaMs);
  return formatearIso(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
}

/** Diferencia en días (hasta − desde), ambas ISO. */
function diferenciaDiasIso(desde: string, hasta: string): number {
  const a = parsearIso(desde);
  const b = parsearIso(hasta);
  const ta = Date.UTC(a.anio, a.mes - 1, a.dia);
  const tb = Date.UTC(b.anio, b.mes - 1, b.dia);
  return Math.round((tb - ta) / 86400000);
}

// ============================================================================
// §3.1 -- construcción de eventos
// ============================================================================

const ORIGEN_MARCA_MANUAL = 'marca_manual';

function datosBase(nota?: string): Record<string, unknown> {
  const notaLimpia = nota?.trim();
  return notaLimpia ? { origen: ORIGEN_MARCA_MANUAL, nota: notaLimpia } : { origen: ORIGEN_MARCA_MANUAL };
}

/**
 * Construye 1 o 2 eventos insertables en `hato_eventos` a partir de una
 * marca manual. El caller (`useMarcarCicloHato`) los inserta en un ÚNICO
 * `.insert([...])` -- una sentencia, una transacción (§3.3: nunca dos
 * llamadas sueltas para esto, a diferencia de S9, que sí las necesita
 * porque ahí las dos escrituras van a tablas distintas).
 *
 * Orden del arreglo cuando hay dos elementos: el `servicio` (evidencia más
 * antigua) primero, la `confirmacion_prenez` (la marca en sí) después --
 * refleja el orden cronológico real de los hechos.
 */
export function construirEventosMarcaCiclo(input: InputMarcaCiclo): EventoMarcaCicloPayload[] {
  switch (input.marca) {
    case 'parida':
      return [
        {
          tipo: 'parto',
          fecha: input.fecha,
          fecha_confianza: input.fechaConfianza,
          cria_destino: input.criaDestino,
          datos: datosBase(input.nota),
          fuente: 'web',
        },
      ];

    case 'seca':
      return [
        {
          tipo: 'secado_real',
          fecha: input.fecha,
          fecha_confianza: input.fechaConfianza,
          datos: datosBase(input.nota),
          fuente: 'web',
        },
      ];

    case 'preñada':
    case 'confirmada': {
      const metodo: MetodoPrenez = input.marca === 'preñada' ? 'presuncion' : 'palpacion';
      const confirmacion: EventoMarcaCicloPayload = {
        tipo: 'confirmacion_prenez',
        fecha: input.fecha,
        fecha_confianza: input.fechaConfianza,
        datos: { ...datosBase(input.nota), metodo },
        fuente: 'web',
      };

      const eventos: EventoMarcaCicloPayload[] = [];
      if (input.ancla?.modo === 'fecha_conocida' && input.ancla.fechaServicio) {
        eventos.push({
          tipo: 'servicio',
          fecha: input.ancla.fechaServicio,
          fecha_confianza: 'exacta',
          datos: datosBase(),
          fuente: 'web',
        });
      } else if (input.ancla?.modo === 'meses_prenez' && input.ancla.mesesPrenez != null) {
        eventos.push({
          tipo: 'servicio',
          fecha: derivarFechaServicioDesdeMesesPrenez(input.fecha, input.ancla.mesesPrenez),
          fecha_confianza: 'aproximada',
          datos: datosBase(),
          fuente: 'web',
        });
      }
      eventos.push(confirmacion);
      return eventos;
    }

    default: {
      const _exhaustivo: never = input.marca;
      throw new Error(`Marca de ciclo no reconocida: ${String(_exhaustivo)}`);
    }
  }
}

// ============================================================================
// §3.2/§3.3 -- validación (bloqueos vs. advertencias)
// ============================================================================

/** `true` cuando la vaca NO tiene un `ultimo_servicio_fecha` utilizable como
 * ancla para proyectar SECAR/parto probable: o no tiene ninguno, o el que
 * tiene es de ANTES de su último parto (un servicio de un ciclo YA CERRADO,
 * no del vigente) -- diseño §3.3. Determina si el diálogo debe ofrecer el
 * paso de "¿desde cuándo está servida?". */
export function necesitaAnclaServicio(fila: EstadoActualHatoRow): boolean {
  if (!fila.ultimo_servicio_fecha) return true;
  if (fila.ultimo_parto_fecha && fila.ultimo_servicio_fecha <= fila.ultimo_parto_fecha) return true;
  return false;
}

/** `true` si la vaca tiene una señal de preñez (servicio o confirmación)
 * ESTRICTAMENTE posterior a su último parto -- usada por A2 ("marcar seca
 * sin preñez registrada"). Sin parto conocido, cualquier servicio/
 * confirmación cuenta como señal. */
function tieneSenalDePrenezPosteriorAUltimoParto(fila: EstadoActualHatoRow): boolean {
  const anclaParto = fila.ultimo_parto_fecha;
  const servicioValido = Boolean(
    fila.ultimo_servicio_fecha && (!anclaParto || fila.ultimo_servicio_fecha > anclaParto),
  );
  const confirmacionValida = Boolean(
    fila.ultima_confirmacion_prenez_fecha && (!anclaParto || fila.ultima_confirmacion_prenez_fecha > anclaParto),
  );
  return servicioValido || confirmacionValida;
}

type TipoEventoCiclo = 'servicio' | 'confirmacion_prenez' | 'secado_real' | 'parto';

/** Prioridad de avance del ciclo -- SOLO para desempatar cuando dos
 * candidatos del evento-posterior-a-la-marca (A3) comparten fecha. Réplica
 * local de `PRIORIDAD_EMPATE_CICLO` (calculosHato.ts, no exportada) -- se
 * duplica la FÓRMULA, no la responsabilidad. */
const PRIORIDAD_CICLO: Record<TipoEventoCiclo, number> = {
  servicio: 0,
  confirmacion_prenez: 1,
  secado_real: 2,
  parto: 3,
};

const LABEL_TIPO_EVENTO_CICLO: Record<TipoEventoCiclo | 'evento', string> = {
  servicio: 'servicio',
  confirmacion_prenez: 'confirmación de preñez',
  secado_real: 'secado',
  parto: 'parto',
  evento: 'evento',
};

interface EventoPosterior {
  tipo: TipoEventoCiclo | 'evento';
  fecha: string;
}

/** Para A3: el evento MÁS RECIENTE de `fila` que sea estrictamente posterior
 * a `fechaMarca`, o `null` si no hay ninguno. Cuando `ultimo_evento_fecha`
 * (MAX sobre TODO `hato_eventos`, cualquier tipo -- típicamente un aborto/
 * venta/muerte que este motor no clasifica) es más reciente que cualquiera
 * de los 4 candidatos conocidos, se reporta genérico como 'evento' en vez de
 * inventar un tipo. */
function eventoPosteriorMasReciente(fila: EstadoActualHatoRow, fechaMarca: string): EventoPosterior | null {
  const candidatos: EventoPosterior[] = [];
  if (fila.ultimo_servicio_fecha) candidatos.push({ tipo: 'servicio', fecha: fila.ultimo_servicio_fecha });
  if (fila.ultima_confirmacion_prenez_fecha) {
    candidatos.push({ tipo: 'confirmacion_prenez', fecha: fila.ultima_confirmacion_prenez_fecha });
  }
  if (fila.ultimo_secado_real_fecha) candidatos.push({ tipo: 'secado_real', fecha: fila.ultimo_secado_real_fecha });
  if (fila.ultimo_parto_fecha) candidatos.push({ tipo: 'parto', fecha: fila.ultimo_parto_fecha });

  const posteriores = candidatos.filter((c) => c.fecha > fechaMarca);
  posteriores.sort((a, b) => {
    if (a.fecha !== b.fecha) return a.fecha < b.fecha ? 1 : -1;
    return PRIORIDAD_CICLO[b.tipo as TipoEventoCiclo] - PRIORIDAD_CICLO[a.tipo as TipoEventoCiclo];
  });
  const masReciente = posteriores[0] ?? null;

  if (fila.ultimo_evento_fecha && fila.ultimo_evento_fecha > fechaMarca) {
    if (!masReciente || fila.ultimo_evento_fecha > masReciente.fecha) {
      return { tipo: 'evento', fecha: fila.ultimo_evento_fecha };
    }
  }
  return masReciente;
}

export interface ContextoValidacionMarca {
  /** `profile.rol` de la sesión -- B3/D-7. */
  rol: string;
  /** `obtenerFechaHoy()`, NUNCA `new Date().toISOString().slice(0,10)` -- B1. */
  hoy: string;
}

export interface ResultadoValidacionMarca {
  /** No vacío -> el botón Guardar queda deshabilitado. */
  bloqueos: string[];
  /** Se muestran, se confirman, se guarda igual -- NUNCA bloquean (regla
   * general del módulo: advertir, no bloquear). */
  advertencias: string[];
}

/**
 * §3.2 del diseño. B1-B3 bloquean; A1-A4 solo advierten.
 */
export function validarMarcaCiclo(
  input: InputMarcaCiclo,
  fila: EstadoActualHatoRow,
  config: HatoConfig,
  contexto: ContextoValidacionMarca,
): ResultadoValidacionMarca {
  const bloqueos: string[] = [];
  const advertencias: string[] = [];

  // B1 -- no se registran hechos futuros.
  if (input.fecha > contexto.hoy) {
    bloqueos.push('No se registran hechos futuros.');
  }
  // B2 -- un animal vendido/muerto/descartado no tiene ciclo.
  if (fila.estado !== 'activa') {
    bloqueos.push('Un animal vendido/muerto no tiene ciclo.');
  }
  // B3 -- D-7, solo Gerencia.
  if (contexto.rol !== 'Gerencia') {
    bloqueos.push('Solo Gerencia puede marcar el ciclo reproductivo.');
  }

  // A1 -- marca 'parida' y ya existe un parto muy cercano.
  if (input.marca === 'parida' && fila.ultimo_parto_fecha) {
    const umbralDias = Math.round(config.meses_gestacion_default * 30.44);
    const distanciaDias = Math.abs(diferenciaDiasIso(fila.ultimo_parto_fecha, input.fecha));
    if (distanciaDias < umbralDias) {
      advertencias.push(
        `Ya hay un parto registrado el ${fila.ultimo_parto_fecha}. Dos partos en menos de ${config.meses_gestacion_default} meses no son biológicamente posibles — ¿es una corrección?`,
      );
    }
  }

  // A2 -- marca 'seca' sin ninguna señal de preñez posterior al último parto.
  if (input.marca === 'seca' && !tieneSenalDePrenezPosteriorAUltimoParto(fila)) {
    advertencias.push('No hay preñez registrada para esta vaca. Se marcará como seca de todos modos.');
  }

  // A3 -- hay un evento posterior a la fecha de la marca: la marca no
  // tendrá efecto visible en el estado derivado.
  const posterior = eventoPosteriorMasReciente(fila, input.fecha);
  if (posterior) {
    advertencias.push(
      `Hay un ${LABEL_TIPO_EVENTO_CICLO[posterior.tipo]} registrado el ${posterior.fecha}, posterior a esta marca. Ese evento seguirá siendo el más reciente.`,
    );
  }

  // A4 -- preñada/confirmada sin ancla de servicio y sin que Martha aporte una.
  if (
    (input.marca === 'preñada' || input.marca === 'confirmada') &&
    necesitaAnclaServicio(fila) &&
    (!input.ancla || input.ancla.modo === 'ninguna')
  ) {
    advertencias.push(
      'Sin fecha de servicio no se puede calcular fecha probable de parto ni de secado. La vaca quedará como preñada, sin fechas.',
    );
  }

  return { bloqueos, advertencias };
}

// ============================================================================
// §3.1 -- proyección "Estado actual → quedará"
// ============================================================================

function fechaMasReciente(actual: string | null, nueva: string): string {
  return actual && actual > nueva ? actual : nueva;
}

/** Construye una `EstadoActualHatoRow` HIPOTÉTICA aplicando la marca -- nunca
 * reimplementa la máquina de estados, solo actualiza los hechos que
 * `derivarEstadoReproductivo` consume. Cada `ultimo_X_fecha` es un MAX
 * sobre `hato_eventos` (vista `v_hato_estado_actual`), así que se toma el
 * máximo entre el valor actual y la nueva marca, nunca un reemplazo directo
 * -- una marca con fecha más antigua que un evento ya existente no cambia
 * el hecho agregado (consistente con A3). */
function aplicarMarcaAFilaHipotetica(
  fila: EstadoActualHatoRow,
  marca: MarcaCiclo,
  fecha: string,
): EstadoActualHatoRow {
  const siguiente: EstadoActualHatoRow = {
    ...fila,
    ultimo_evento_fecha: fechaMasReciente(fila.ultimo_evento_fecha, fecha),
  };

  switch (marca) {
    case 'preñada':
    case 'confirmada': {
      const anterior = fila.ultima_confirmacion_prenez_fecha;
      siguiente.ultima_confirmacion_prenez_fecha = fechaMasReciente(anterior, fecha);
      // D-D (2026-08-13): el MÉTODO viaja con la fecha, no aparte. Desde que
      // `estadoDeConfirmacion` (calculosHato.ts) decide "servida" vs
      // "preñada" leyendo este campo, proyectar la fecha sin el método haría
      // que el diálogo prometiera un estado que la marca no produce -- la
      // marca "confirmada" se vería como "servida" en el "quedará".
      // Solo se pisa el método cuando la marca es efectivamente la
      // confirmación más reciente: una marca con fecha anterior a una
      // confirmación ya registrada no cambia el hecho agregado (igual que
      // la fecha, y consistente con la advertencia A3).
      if (!anterior || fecha >= anterior) {
        siguiente.ultima_confirmacion_prenez_metodo = marca === 'confirmada' ? 'palpacion' : 'presuncion';
      }
      break;
    }
    case 'seca':
      siguiente.ultimo_secado_real_fecha = fechaMasReciente(fila.ultimo_secado_real_fecha, fecha);
      break;
    case 'parida':
      siguiente.ultimo_parto_fecha = fechaMasReciente(fila.ultimo_parto_fecha, fecha);
      siguiente.num_partos = fila.num_partos + 1;
      break;
  }
  return siguiente;
}

/**
 * "Estado actual → quedará" del diálogo (§3.5): pasa la fila real y la fila
 * hipotética (con la marca ya aplicada) por el MISMO `derivarEstadoReproductivo`
 * -- nunca reimplementa la máquina de estados. `fechaReferencia` es "hoy"
 * (`obtenerFechaHoy()`), nunca literal `Date.now()`.
 */
export function proyectarEstadoTrasMarca(
  fila: EstadoActualHatoRow,
  marca: MarcaCiclo,
  fecha: string,
  config: HatoConfig,
  fechaReferencia: string,
): { antes: EstadoReproductivo; despues: EstadoReproductivo } {
  const antes = derivarEstadoReproductivo(fila, config, fechaReferencia).estado;
  const filaHipotetica = aplicarMarcaAFilaHipotetica(fila, marca, fecha);
  const despues = derivarEstadoReproductivo(filaHipotetica, config, fechaReferencia).estado;
  return { antes, despues };
}
