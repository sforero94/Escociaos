import type { LecturaClima, ResumenClima, ResumenDiario, LecturaClimaAgregada, DatoAnualOverlay, SerieAnual } from '@/types/clima';
import { fechaAISODate } from '@/utils/fechas';
import { formatNumber } from '@/utils/format';

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function avg(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

function safeMax(values: number[]): number {
  return values.reduce((max, v) => (v > max ? v : max), -Infinity);
}

function safeMin(values: number[]): number {
  return values.reduce((min, v) => (v < min ? v : min), Infinity);
}

// ============================================================================
// Lluvia confiable (migración 068)
// ============================================================================

// El backfill historico de la 068 solo marca lluvia_confianza y deja el valor
// crudo intacto (a proposito, para auditoria). Por eso TODO consumidor de
// clima_resumen_diario debe pasar por aqui: sumar lluvia_total_mm directo
// revive el duplicado que la migracion detecto. "Sin dato" es NULL, nunca 0.
//
// MIGRACIÓN 122 — `cobertura_parcial` SALE de este conjunto.
// Desde la 122 esa etiqueta dejó de significar "sin dato" y pasa a significar
// "el valor es una COTA INFERIOR real": el rollup reconstruye la lluvia del día
// desde `lluvia_evento_mm` (acumulador por evento, independiente del contador
// diario) y guarda lo que efectivamente se midió en las horas capturadas. Las
// filas históricas de `cobertura_parcial` traen `lluvia_total_mm = NULL` y se
// siguen leyendo como sin dato — el NULL habla solo, no hace falta la etiqueta.
//
// `contador_congelado` SE QUEDA, y por una razón concreta: 24 de las 31 filas
// marcadas así conservan un valor que ES el duplicado falso que la 068 detectó
// (verificado 2026-08-27: las 24 tienen hoy_mm = ayer_mm exacto). Hasta que el
// backfill de Ecowitt las reconstruya, ese número no se puede usar. El rollup
// ya no escribe esta etiqueta salvo cuando no hay señal independiente.
const CONFIANZAS_SIN_DATO = new Set(['contador_congelado']);

export function lluviaConfiableDeResumen(
  fila: { lluvia_total_mm: number | null; lluvia_confianza?: string | null }
): number | null {
  if (fila.lluvia_confianza != null && CONFIANZAS_SIN_DATO.has(fila.lluvia_confianza)) return null;
  return fila.lluvia_total_mm;
}

/**
 * `true` cuando el valor del día es una COTA INFERIOR y no un total: sólo se
 * capturó parte de la jornada (migraciones 103/115), así que lo medido es "al
 * menos esto", nunca "esto fue todo".
 *
 * La distinción importa y no es cosmética. Una cota inferior de 0 mm no informa
 * NADA — "no llovió durante las horas que miramos" no es "no llovió" — mientras
 * que una cota inferior de 8 mm sí es un hecho: llovió al menos 8 mm. Por eso
 * los consumidores tratan distinto los dos casos en vez de meterlos en la misma
 * bolsa.
 */
export function esCotaInferior(
  fila: { lluvia_confianza?: string | null }
): boolean {
  return fila.lluvia_confianza === 'cobertura_parcial';
}

// ============================================================================
// Franja de lluvia de N días (tablero, "Hoy en la finca" — Bloque 2)
// ============================================================================

export type EstadoDiaLluvia = 'lluvia' | 'seco' | 'sin_dato';

export interface DiaFranjaLluvia {
  /** YYYY-MM-DD, hora local */
  fecha: string;
  estado: EstadoDiaLluvia;
  /** mm confiables — SIEMPRE null cuando estado es 'sin_dato', nunca 0 */
  mm: number | null;
  /** Sólo relevante cuando estado es 'sin_dato' */
  causa: 'contador_congelado' | 'cobertura_parcial' | 'sin_registro' | null;
  /** El valor salió de las lecturas de 5 min en vivo, no de clima_resumen_diario:
   *  el rollup nocturno todavía no corrió para ese día. Ver `lluviaDeLecturasVivas`. */
  enVivo?: boolean;
}

/** Lectura mínima que necesita `lluviaDeLecturasVivas` — un subconjunto de
 *  `LecturaClima`, para que la función sirva también en tests sin construir la
 *  fila entera. */
export interface LecturaLluviaViva {
  timestamp: string;
  lluvia_evento_mm: number | null;
}

/**
 * Lluvia caída en `fechaISO` reconstruida desde las lecturas de 5 minutos en
 * vivo (`clima_lecturas`), sumando los deltas POSITIVOS del acumulador por
 * evento — exactamente el mismo método que `fn_clima_rollup_diario` usa desde
 * la migración 122, para que la pantalla y la base nunca contesten distinto.
 *
 * Existe porque el rollup corre a las 00:15 y escribe el resumen de AYER: el
 * día en curso no tiene fila en `clima_resumen_diario` hasta la madrugada
 * siguiente, y la franja lo pintaba como "sin dato" toda la tarde y toda la
 * noche aunque las lecturas estuvieran ahí.
 *
 * Devuelve `null` — nunca 0 — si no hay ni una lectura de ese día: "no vimos
 * el día" y "no llovió" son cosas distintas.
 *
 * Sólo cuenta deltas dentro del día pero arrastra la línea base desde la última
 * lectura anterior, así que una lluvia que empezó antes de medianoche no se
 * cuenta de nuevo hoy.
 */
export function lluviaDeLecturasVivas(
  lecturas: LecturaLluviaViva[],
  fechaISO: string,
): number | null {
  if (lecturas.length === 0) return null;

  const ordenadas = [...lecturas].sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  let previo: number | null = null;
  let total = 0;
  let vioElDia = false;

  for (const lectura of ordenadas) {
    const fechaLectura = fechaAISODate(new Date(lectura.timestamp));
    const valor = lectura.lluvia_evento_mm;

    if (fechaLectura === fechaISO) {
      vioElDia = true;
      // Sólo deltas positivos: el acumulador se reinicia entre eventos y un
      // delta negativo es ese reinicio, no lluvia negativa.
      if (previo !== null && valor !== null && valor > previo) total += valor - previo;
    }
    if (valor !== null) previo = valor;
  }

  return vioElDia ? round2(total) : null;
}

// Arma la franja de los últimos `dias` días terminando en `hastaISO`
// (inclusive), a partir de clima_resumen_diario. Un día sin fila en absoluto
// (la estación no llegó a sincronizar, el rollup no corrió) y un día cuyo
// lluviaConfiableDeResumen() da null (contador congelado, migración 068) se
// tratan igual en el estado ('sin_dato') pero se distinguen por `causa`, para
// que el pie de la tarjeta pueda nombrar la causa real cuando la conoce. Un
// 0mm real (`estado: 'seco'`) nunca se confunde con lo anterior — es
// exactamente el bug que esta franja existe para hacer visible.
export function construirFranjaLluvia(
  resumenes: ResumenDiario[],
  dias: number,
  hastaISO: string,
  /** Lecturas de 5 min en vivo (`clima_lecturas`). Cubren el día en curso, que
   *  todavía no tiene fila en `clima_resumen_diario` porque el rollup corre a
   *  las 00:15. Sin esto la última barra sale "sin dato" toda la tarde. */
  lecturasVivas?: LecturaLluviaViva[],
): DiaFranjaLluvia[] {
  const porFecha = new Map(resumenes.map((r) => [r.fecha, r]));
  const [anio, mes, dia] = hastaISO.split('-').map(Number);

  const resultado: DiaFranjaLluvia[] = [];
  for (let i = dias - 1; i >= 0; i--) {
    const fechaDia = new Date(anio, mes - 1, dia - i);
    const fechaStr = fechaAISODate(fechaDia);
    const fila = porFecha.get(fechaStr);

    if (!fila) {
      // Sin fila agregada todavía: si las lecturas en vivo cubren el día, se
      // usa esa reconstrucción en vez de declarar "sin dato". Es el caso del
      // día en curso, que antes salía rayado hasta la madrugada siguiente.
      const mmVivo = lecturasVivas ? lluviaDeLecturasVivas(lecturasVivas, fechaStr) : null;
      if (mmVivo !== null) {
        resultado.push({
          fecha: fechaStr,
          estado: mmVivo > 0 ? 'lluvia' : 'seco',
          mm: mmVivo,
          causa: null,
          enVivo: true,
        });
        continue;
      }
      resultado.push({ fecha: fechaStr, estado: 'sin_dato', mm: null, causa: 'sin_registro' });
      continue;
    }

    const mm = lluviaConfiableDeResumen(fila);
    // Una COTA INFERIOR de 0 mm no informa nada: "no llovió durante las horas
    // que miramos" no es "no llovió". Se pinta sin dato, JAMÁS como un cero
    // real — es el bug que la 103 existe para impedir. Una cota inferior > 0 sí
    // es un hecho (llovió al menos eso) y se pinta como lluvia.
    if (mm === null || (esCotaInferior(fila) && mm === 0)) {
      const causa: DiaFranjaLluvia['causa'] =
        fila.lluvia_confianza === 'contador_congelado' ? 'contador_congelado'
        : fila.lluvia_confianza === 'cobertura_parcial' ? 'cobertura_parcial'
        : 'sin_registro';
      resultado.push({ fecha: fechaStr, estado: 'sin_dato', mm: null, causa });
    } else if (mm > 0) {
      resultado.push({ fecha: fechaStr, estado: 'lluvia', mm, causa: null });
    } else {
      resultado.push({ fecha: fechaStr, estado: 'seco', mm: 0, causa: null });
    }
  }

  return resultado;
}

// ============================================================================
// Racha de días sin lluvia material (2026-08-26, pedido de Santiago)
// ============================================================================

/** Umbral por debajo del cual un día NO cuenta como "lluvia" para la racha
 *  — una llovizna de 1-2mm no rompe una racha seca. Es una decisión de
 *  producto, no una constante agronómica fija: ajustar acá si el umbral
 *  cambia, nunca duplicarlo inline en el componente. */
export const UMBRAL_LLUVIA_MATERIAL_MM = 10;

export interface RachaSinLluvia {
  /** Días consecutivos con lluvia < umbral, contados hacia atrás desde AYER
   *  (el rollup nocturno recién escribe el resumen de hoy en la madrugada;
   *  para el día en curso se usan las lecturas vivas). */
  dias: number;
  /** Día más antiguo y más reciente que entran en la racha — null si dias=0. */
  desdeFecha: string | null;
  hastaFecha: string | null;
  /** Si la racha terminó porque hubo lluvia material, acá queda esa lluvia. */
  ultimaLluviaFecha: string | null;
  ultimaLluviaMm: number | null;
  /** Cuántos días DENTRO del tramo no tienen un valor confiable. 0 = racha
   *  enteramente confirmada. Se reporta al lado del número, en gris y chico:
   *  el conteo no se corta por un hueco, pero tampoco se esconde que lo hubo. */
  diasSinConfirmar: number;
}

/**
 * Cuenta hacia atrás desde `hastaISO` los días consecutivos con lluvia por
 * debajo de `umbralMm`, empezando en AYER.
 *
 * DECISIÓN DE PRODUCTO (Santiago, 2026-08-27): **el conteo NO se detiene en un
 * día sin dato.** La versión anterior cortaba en el primer hueco, y con ~20% de
 * los días marcados sin dato eso hacía el indicador inservible: reportaba "5
 * días" cuando la última lluvia ≥10 mm confirmada había sido 36 días antes. Un
 * hueco de dato no es evidencia de que llovió; detenerse ahí trataba la
 * ignorancia como si fuera una lluvia.
 *
 * Lo que SÍ corta el conteo es un día con lluvia confirmada ≥ umbral. Los días
 * sin dato se cuentan dentro del tramo y se reportan aparte en
 * `diasSinConfirmar`, para que el número siga siendo auditable sin volverse
 * inútil.
 *
 * Se detiene también al quedarse sin historia (fecha anterior al resumen más
 * viejo), para no inventar días secos donde simplemente no hay registro.
 */
export function calcularRachaSinLluvia(
  resumenes: ResumenDiario[],
  hastaISO: string,
  umbralMm: number = UMBRAL_LLUVIA_MATERIAL_MM,
  /** Lecturas de 5 min en vivo, para poder evaluar el día en curso — que aún
   *  no tiene fila en `clima_resumen_diario`. */
  lecturasVivas?: LecturaLluviaViva[],
): RachaSinLluvia {
  const porFecha = new Map(resumenes.map((r) => [r.fecha, r]));
  const [anio, mes, dia] = hastaISO.split('-').map(Number);

  // Piso de la historia: más atrás de esto no hay con qué contestar, y contar
  // días "secos" ahí sería inventarlos. Se toma el más viejo entre los
  // resúmenes y las lecturas vivas — sin ninguna de las dos fuentes no hay
  // racha que calcular y se devuelve 0, nunca los 366 del tope de seguridad.
  const masViejoResumen = resumenes.reduce<string | null>(
    (min, r) => (min === null || r.fecha < min ? r.fecha : min),
    null,
  );
  const masViejaLectura = (lecturasVivas ?? []).reduce<string | null>(
    (min, l) => {
      const f = fechaAISODate(new Date(l.timestamp));
      return min === null || f < min ? f : min;
    },
    null,
  );
  const fechaMasVieja =
    masViejoResumen !== null && masViejaLectura !== null
      ? (masViejoResumen < masViejaLectura ? masViejoResumen : masViejaLectura)
      : (masViejoResumen ?? masViejaLectura);

  if (fechaMasVieja === null) {
    return { dias: 0, desdeFecha: null, hastaFecha: null, ultimaLluviaFecha: null, ultimaLluviaMm: null, diasSinConfirmar: 0 };
  }

  let dias = 0;
  let diasSinConfirmar = 0;
  let desdeFecha: string | null = null;
  let hastaFecha: string | null = null;

  // Tope de un año: red de seguridad, no una regla de negocio.
  for (let i = 1; i <= 366; i++) {
    const fechaDia = new Date(anio, mes - 1, dia - i);
    const fechaStr = fechaAISODate(fechaDia);

    if (fechaStr < fechaMasVieja) break;

    const fila = porFecha.get(fechaStr);
    const mm = fila
      ? lluviaConfiableDeResumen(fila)
      : (lecturasVivas ? lluviaDeLecturasVivas(lecturasVivas, fechaStr) : null);
    // Una cota inferior no es un total: aunque diga 2 mm, ese día pudo haber
    // llegado a 12. Cuenta dentro del tramo pero no como día confirmado.
    const esCota = fila ? esCotaInferior(fila) : false;

    // Corta la racha sólo una lluvia por encima del umbral. Con una cota
    // inferior también corta: si ya sabemos que cayeron >= umbral mm, que
    // hayan sido más no cambia la respuesta.
    if (mm !== null && mm >= umbralMm) {
      return { dias, desdeFecha, hastaFecha, ultimaLluviaFecha: fechaStr, ultimaLluviaMm: mm, diasSinConfirmar };
    }

    dias++;
    if (mm === null || esCota) diasSinConfirmar++;
    hastaFecha = hastaFecha ?? fechaStr;
    desdeFecha = fechaStr;
  }

  return { dias, desdeFecha, hastaFecha, ultimaLluviaFecha: null, ultimaLluviaMm: null, diasSinConfirmar };
}

// Cardinal direction from degrees (0-360)
const CARDINALS = ['N', 'NE', 'E', 'SE', 'S', 'SO', 'O', 'NO'] as const;

export function degreesToCardinal(deg: number): string {
  const normalized = ((deg % 360) + 360) % 360;
  const index = Math.round(normalized / 45) % 8;
  return CARDINALS[index];
}

// Most recent 5-min reading (for live KPI cards)
export function lecturaActual(rows: LecturaClima[]): LecturaClima | null {
  if (rows.length === 0) return null;
  return rows.reduce((latest, row) =>
    new Date(row.timestamp) > new Date(latest.timestamp) ? row : latest
  );
}

// ============================================================================
// Frescura de la lectura en vivo (corte de luz en la finca, ESCO-31)
// ============================================================================

/**
 * UMBRALES DE FRESCURA — ÚNICO LUGAR DONDE SE TOCAN.
 *
 * La estación envía una lectura cada 5 minutos, así que cualquier hueco de
 * más de media hora ya no es jitter de la sincronización: es la estación
 * callada (corte de luz en la finca, internet caído, Ecowitt respondiendo
 * `{"message":"No data available"}` con HTTP 200 — que es exactamente lo que
 * pasó el 2026-08-19/20, 14 h sin una sola lectura).
 *
 * Los dos números gobiernan a la vez la tarjeta del Tablero, la de `/clima`
 * y la señal "Estación" de Salud de los datos: cambiarlos acá los cambia en
 * los tres sitios. Son criterio de FRESCURA de captura, no una regla
 * agronómica — mismo estatus que los umbrales de `calculosSaludDatos.ts`.
 */
export const UMBRAL_FRESCURA_LECTURA = {
  /** Hasta acá la lectura se presenta como "Ahora", sin atenuar. */
  frescaMinutos: 30,
  /** Entre `frescaMinutos` y acá se muestra atenuada y rotulada "hace N h".
   *  Por encima no se muestra ningún valor: estado explícito "sin dato
   *  reciente" — un número viejo presentado como actual es peor que ninguno,
   *  porque contra él se planean aplicaciones e irrigación. */
  demoradaMinutos: 180,
} as const;

/** `obsoleta` incluye el caso "no hay ninguna lectura": el cron de la
 *  migración 036 poda `clima_lecturas` a 24 h, así que una estación muda
 *  desde hace más de un día deja la tabla vacía. Eso NO es "todo bien", y
 *  nunca puede volver a hacer desaparecer la tarjeta en silencio. */
export type FrescuraLectura = 'fresca' | 'demorada' | 'obsoleta';

/** Edad de la lectura en minutos (redondeada hacia abajo). `null` cuando no
 *  hay lectura o su `timestamp` no es parseable — nunca 0, que significaría
 *  "recién llegada". Aritmética de instantes sobre `timestamptz`: no hay
 *  trampa de huso horario acá (a diferencia de las fechas `YYYY-MM-DD`). */
export function minutosDesdeLectura(
  lectura: { timestamp: string } | null | undefined,
  ahora: Date = new Date(),
): number | null {
  if (!lectura?.timestamp) return null;
  const ms = new Date(lectura.timestamp).getTime();
  if (Number.isNaN(ms)) return null;
  return Math.max(0, Math.floor((ahora.getTime() - ms) / 60000));
}

/** ¿La lectura sirve para presentarse como condiciones actuales? Sin lectura
 *  la respuesta es `false`, nunca `true` por omisión. */
export function lecturaEsReciente(
  lectura: { timestamp: string } | null | undefined,
  maxMinutos: number = UMBRAL_FRESCURA_LECTURA.frescaMinutos,
  ahora: Date = new Date(),
): boolean {
  const minutos = minutosDesdeLectura(lectura, ahora);
  return minutos !== null && minutos <= maxMinutos;
}

export function clasificarFrescuraLectura(
  lectura: { timestamp: string } | null | undefined,
  ahora: Date = new Date(),
): FrescuraLectura {
  const minutos = minutosDesdeLectura(lectura, ahora);
  if (minutos === null) return 'obsoleta';
  if (minutos <= UMBRAL_FRESCURA_LECTURA.frescaMinutos) return 'fresca';
  if (minutos <= UMBRAL_FRESCURA_LECTURA.demoradaMinutos) return 'demorada';
  return 'obsoleta';
}

/** "hace 45 min" · "hace 14 h" · "hace 3 d" · "sin lecturas" (null). Nunca
 *  "hace 0 min": por debajo del minuto se dice "hace instantes". */
export function etiquetaEdadLectura(minutos: number | null): string {
  if (minutos === null) return 'sin lecturas';
  if (minutos < 1) return 'hace instantes';
  if (minutos < 60) return `hace ${formatNumber(minutos, 0)} min`;
  const horas = Math.floor(minutos / 60);
  if (horas < 48) return `hace ${formatNumber(horas, 0)} h`;
  return `hace ${formatNumber(Math.floor(horas / 24), 0)} d`;
}

// ============================================================================
// Period summaries from pre-aggregated daily data (clima_resumen_diario)
// ============================================================================

export function calcularResumenPeriodoDiario(rows: ResumenDiario[], dias: number): ResumenClima {
  const cutoff = new Date(Date.now() - dias * 24 * 60 * 60 * 1000);
  const cutoffStr = fechaAISODate(cutoff);
  const filtered = rows.filter(r => r.fecha >= cutoffStr);
  return buildResumenFromDaily(filtered);
}

export function calcularResumenAnioALaFechaDiario(rows: ResumenDiario[]): ResumenClima {
  const jan1 = `${new Date().getFullYear()}-01-01`;
  const filtered = rows.filter(r => r.fecha >= jan1);
  return buildResumenFromDaily(filtered);
}

function buildResumenFromDaily(rows: ResumenDiario[]): ResumenClima {
  if (rows.length === 0) {
    return {
      lluvia_total_mm: null,
      temp_promedio_c: null,
      temp_max_c: null,
      temp_min_c: null,
      humedad_promedio_pct: null,
      viento_promedio_kmh: null,
      rafaga_max_kmh: null,
      radiacion_promedio_wm2: null,
    };
  }

  const temps = rows.map(r => r.temp_c_avg).filter((v): v is number => v !== null);
  const tempMaxes = rows.map(r => r.temp_c_max).filter((v): v is number => v !== null);
  const tempMins = rows.map(r => r.temp_c_min).filter((v): v is number => v !== null);
  const humedad = rows.map(r => r.humedad_pct_avg).filter((v): v is number => v !== null);
  const viento = rows.map(r => r.viento_kmh_avg).filter((v): v is number => v !== null);
  const rafaga = rows.map(r => r.rafaga_kmh_max).filter((v): v is number => v !== null);
  const radiacion = rows.map(r => r.radiacion_wm2_avg).filter((v): v is number => v !== null);
  const lluvia = rows.map(lluviaConfiableDeResumen).filter((v): v is number => v !== null);

  return {
    lluvia_total_mm: lluvia.length > 0 ? round2(lluvia.reduce((s, v) => s + v, 0)) : null,
    temp_promedio_c: temps.length > 0 ? round2(avg(temps)) : null,
    temp_max_c: tempMaxes.length > 0 ? round2(safeMax(tempMaxes)) : null,
    temp_min_c: tempMins.length > 0 ? round2(safeMin(tempMins)) : null,
    humedad_promedio_pct: humedad.length > 0 ? round2(avg(humedad)) : null,
    viento_promedio_kmh: viento.length > 0 ? round2(avg(viento)) : null,
    rafaga_max_kmh: rafaga.length > 0 ? round2(safeMax(rafaga)) : null,
    radiacion_promedio_wm2: radiacion.length > 0 ? round2(avg(radiacion)) : null,
  };
}

// ============================================================================
// 24h summary from live 5-min readings (for KPI cards secondary values)
// ============================================================================

// Bogotá timezone formatter for consistent day boundaries
const bogotaDateFmt = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Bogota',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

function getBogotaDateKey(ts: string): string {
  return bogotaDateFmt.format(new Date(ts));
}

function nonNull(rows: LecturaClima[], field: keyof LecturaClima): number[] {
  return rows
    .map(r => r[field])
    .filter((v): v is number => v !== null && typeof v === 'number');
}

function masReciente(rows: LecturaClima[]): LecturaClima {
  return rows.reduce((latest, r) => (new Date(r.timestamp) > new Date(latest.timestamp) ? r : latest));
}

// El acumulado diario de Ecowitt (lluvia_diaria_mm) es un contador que se
// supone se reinicia a medianoche. Si el sensor no lo reinicia, el valor se
// congela en el total de días anteriores — mismo bug que corrige la
// migración 068 en el rollup nocturno. Aquí aplicamos el mismo criterio a
// lecturas en vivo: solo confiamos en el acumulado de un bucket (día u hora)
// si Ecowitt reporta haberlo actualizado dentro de ese mismo día calendario,
// o si no tenemos esa señal en absoluto (lecturas previas a esta corrección
// — mismo comportamiento que antes, no podemos hacerlo mejor sin el dato).
function lluviaConfiableDelBucket(lecturas: LecturaClima[], diaKey: string): number | null {
  const conLluvia = lecturas.filter(r => r.lluvia_diaria_mm !== null);
  if (conLluvia.length === 0) return null;
  const ultima = masReciente(conLluvia);
  const sinSenalDeFrescura = ultima.lluvia_diaria_actualizada_en == null;
  const actualizadaHoy = !sinSenalDeFrescura && getBogotaDateKey(ultima.lluvia_diaria_actualizada_en!) === diaKey;
  if (!sinSenalDeFrescura && !actualizadaHoy) return null; // contador sin renovar — no confiable
  return round2(ultima.lluvia_diaria_mm!);
}

function calcularLluviaPorPeriodo(rows: LecturaClima[]): number | null {
  const lluviaRows = rows.filter(r => r.lluvia_diaria_mm !== null);
  if (lluviaRows.length === 0) return null;
  const porDia = new Map<string, LecturaClima[]>();
  for (const row of lluviaRows) {
    const dayKey = getBogotaDateKey(row.timestamp);
    const bucket = porDia.get(dayKey) ?? [];
    bucket.push(row);
    porDia.set(dayKey, bucket);
  }
  let total = 0;
  let huboDatoConfiable = false;
  for (const [dayKey, lecturas] of porDia) {
    const confiable = lluviaConfiableDelBucket(lecturas, dayKey);
    if (confiable !== null) {
      total += confiable;
      huboDatoConfiable = true;
    }
  }
  return huboDatoConfiable ? round2(total) : null;
}

export function calcularResumen24h(rows: LecturaClima[]): ResumenClima {
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const filtered = rows.filter(r => new Date(r.timestamp) >= cutoff);
  if (filtered.length === 0) {
    return {
      lluvia_total_mm: null, temp_promedio_c: null, temp_max_c: null, temp_min_c: null,
      humedad_promedio_pct: null, viento_promedio_kmh: null, rafaga_max_kmh: null,
      radiacion_promedio_wm2: null,
    };
  }
  const temps = nonNull(filtered, 'temp_c');
  const humedad = nonNull(filtered, 'humedad_pct');
  const viento = nonNull(filtered, 'viento_kmh');
  const rafaga = nonNull(filtered, 'rafaga_kmh');
  const radiacion = nonNull(filtered, 'radiacion_wm2');
  return {
    lluvia_total_mm: calcularLluviaPorPeriodo(filtered),
    temp_promedio_c: temps.length > 0 ? round2(avg(temps)) : null,
    temp_max_c: temps.length > 0 ? round2(safeMax(temps)) : null,
    temp_min_c: temps.length > 0 ? round2(safeMin(temps)) : null,
    humedad_promedio_pct: humedad.length > 0 ? round2(avg(humedad)) : null,
    viento_promedio_kmh: viento.length > 0 ? round2(avg(viento)) : null,
    rafaga_max_kmh: rafaga.length > 0 ? round2(safeMax(rafaga)) : null,
    radiacion_promedio_wm2: radiacion.length > 0 ? round2(avg(radiacion)) : null,
  };
}

// ============================================================================
// Chart series from pre-aggregated daily data
// ============================================================================

export function resumenDiarioToAgregada(rows: ResumenDiario[], desde: string, hasta: string): LecturaClimaAgregada[] {
  return rows
    .filter(r => r.fecha >= desde && r.fecha <= hasta)
    .map(r => ({
      fecha: r.fecha,
      temp_c_promedio: r.temp_c_avg,
      temp_c_max: r.temp_c_max,
      temp_c_min: r.temp_c_min,
      humedad_pct_promedio: r.humedad_pct_avg,
      viento_kmh_promedio: r.viento_kmh_avg,
      rafaga_kmh_max: r.rafaga_kmh_max,
      lluvia_diaria_mm: lluviaConfiableDeResumen(r),
      lluvia_confianza: r.lluvia_confianza,
      radiacion_wm2_promedio: r.radiacion_wm2_avg,
    }))
    .sort((a, b) => a.fecha.localeCompare(b.fecha));
}

// Monthly aggregation of daily summaries (for ranges > 365 days)
export function resumenDiarioToMensual(rows: ResumenDiario[], desde: string, hasta: string): LecturaClimaAgregada[] {
  const filtered = rows.filter(r => r.fecha >= desde && r.fecha <= hasta);
  if (filtered.length === 0) return [];

  const buckets = new Map<string, ResumenDiario[]>();
  for (const r of filtered) {
    const monthKey = r.fecha.slice(0, 7); // YYYY-MM
    const bucket = buckets.get(monthKey) ?? [];
    bucket.push(r);
    buckets.set(monthKey, bucket);
  }

  const result: LecturaClimaAgregada[] = [];
  for (const [fecha, dias] of buckets) {
    const temps = dias.map(d => d.temp_c_avg).filter((v): v is number => v !== null);
    const tempMaxes = dias.map(d => d.temp_c_max).filter((v): v is number => v !== null);
    const tempMins = dias.map(d => d.temp_c_min).filter((v): v is number => v !== null);
    const humedad = dias.map(d => d.humedad_pct_avg).filter((v): v is number => v !== null);
    const viento = dias.map(d => d.viento_kmh_avg).filter((v): v is number => v !== null);
    const rafaga = dias.map(d => d.rafaga_kmh_max).filter((v): v is number => v !== null);
    const lluvia = dias.map(lluviaConfiableDeResumen).filter((v): v is number => v !== null);
    const radiacion = dias.map(d => d.radiacion_wm2_avg).filter((v): v is number => v !== null);

    result.push({
      fecha,
      temp_c_promedio: temps.length > 0 ? round2(avg(temps)) : null,
      temp_c_max: tempMaxes.length > 0 ? round2(safeMax(tempMaxes)) : null,
      temp_c_min: tempMins.length > 0 ? round2(safeMin(tempMins)) : null,
      humedad_pct_promedio: humedad.length > 0 ? round2(avg(humedad)) : null,
      viento_kmh_promedio: viento.length > 0 ? round2(avg(viento)) : null,
      rafaga_kmh_max: rafaga.length > 0 ? round2(safeMax(rafaga)) : null,
      lluvia_diaria_mm: lluvia.length > 0 ? round2(lluvia.reduce((s, v) => s + v, 0)) : null,
      radiacion_wm2_promedio: radiacion.length > 0 ? round2(avg(radiacion)) : null,
    });
  }

  return result.sort((a, b) => a.fecha.localeCompare(b.fecha));
}

// Hourly aggregation of live 5-min readings (for 24h chart)
export function lecturas24hToHorario(rows: LecturaClima[]): LecturaClimaAgregada[] {
  const bogotaHourFmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Bogota',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', hour12: false,
  });

  const getBogotaHourKey = (ts: string): string => {
    const parts = bogotaHourFmt.formatToParts(new Date(ts));
    const year = parts.find(p => p.type === 'year')?.value;
    const month = parts.find(p => p.type === 'month')?.value;
    const day = parts.find(p => p.type === 'day')?.value;
    const hour = parts.find(p => p.type === 'hour')?.value;
    return `${year}-${month}-${day} ${hour}:00`;
  };

  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const filtered = rows.filter(r => new Date(r.timestamp) >= cutoff);
  if (filtered.length === 0) return [];

  const buckets = new Map<string, LecturaClima[]>();
  for (const row of filtered) {
    const key = getBogotaHourKey(row.timestamp);
    const bucket = buckets.get(key) ?? [];
    bucket.push(row);
    buckets.set(key, bucket);
  }

  const result: LecturaClimaAgregada[] = [];
  for (const [fecha, lecturas] of buckets) {
    const temps = nonNull(lecturas, 'temp_c');
    const humedad = nonNull(lecturas, 'humedad_pct');
    const viento = nonNull(lecturas, 'viento_kmh');
    const rafaga = nonNull(lecturas, 'rafaga_kmh');
    const radiacion = nonNull(lecturas, 'radiacion_wm2');

    result.push({
      fecha,
      temp_c_promedio: temps.length > 0 ? round2(avg(temps)) : null,
      temp_c_max: temps.length > 0 ? round2(safeMax(temps)) : null,
      temp_c_min: temps.length > 0 ? round2(safeMin(temps)) : null,
      humedad_pct_promedio: humedad.length > 0 ? round2(avg(humedad)) : null,
      viento_kmh_promedio: viento.length > 0 ? round2(avg(viento)) : null,
      rafaga_kmh_max: rafaga.length > 0 ? round2(safeMax(rafaga)) : null,
      lluvia_diaria_mm: lluviaConfiableDelBucket(lecturas, fecha.slice(0, 10)),
      radiacion_wm2_promedio: radiacion.length > 0 ? round2(avg(radiacion)) : null,
    });
  }

  return result.sort((a, b) => a.fecha.localeCompare(b.fecha));
}

// ============================================================================
// Year-overlay chart from daily summaries (months on X, one series per year)
// ============================================================================

const MESES_NOMBRES = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];

export function resumenDiarioToAnual(rows: ResumenDiario[], desde: string, hasta: string): SerieAnual {
  const filtered = rows.filter(r => r.fecha >= desde && r.fecha <= hasta);
  if (filtered.length === 0) return { datos: [], años: [] };

  // Group by YYYY-MM
  const monthBuckets = new Map<string, ResumenDiario[]>();
  for (const row of filtered) {
    const key = row.fecha.slice(0, 7);
    const bucket = monthBuckets.get(key) ?? [];
    bucket.push(row);
    monthBuckets.set(key, bucket);
  }

  const añosSet = new Set<number>();
  const aggregated = new Map<string, { temp: number | null; lluvia: number | null; humedad: number | null; viento: number | null }>();

  for (const [yearMonth, dias] of monthBuckets) {
    const [yearStr, monthStr] = yearMonth.split('-');
    const year = parseInt(yearStr, 10);
    const month = parseInt(monthStr, 10);
    añosSet.add(year);
    const key = `${year}-${month}`;

    const temps = dias.map(d => d.temp_c_avg).filter((v): v is number => v !== null);
    const humedad = dias.map(d => d.humedad_pct_avg).filter((v): v is number => v !== null);
    const viento = dias.map(d => d.viento_kmh_avg).filter((v): v is number => v !== null);
    const lluvia = dias.map(lluviaConfiableDeResumen).filter((v): v is number => v !== null);

    aggregated.set(key, {
      temp: temps.length > 0 ? round2(avg(temps)) : null,
      lluvia: lluvia.length > 0 ? round2(lluvia.reduce((s, v) => s + v, 0)) : null,
      humedad: humedad.length > 0 ? round2(avg(humedad)) : null,
      viento: viento.length > 0 ? round2(avg(viento)) : null,
    });
  }

  const años = [...añosSet].sort();

  const datos: DatoAnualOverlay[] = [];
  for (let m = 1; m <= 12; m++) {
    const row: DatoAnualOverlay = { mes: MESES_NOMBRES[m - 1], mesNum: m };
    for (const year of años) {
      const agg = aggregated.get(`${year}-${m}`);
      row[`temp_${year}`] = agg?.temp ?? null;
      row[`lluvia_${year}`] = agg?.lluvia ?? null;
      row[`humedad_${year}`] = agg?.humedad ?? null;
      row[`viento_${year}`] = agg?.viento ?? null;
    }
    datos.push(row);
  }

  return { datos, años };
}
