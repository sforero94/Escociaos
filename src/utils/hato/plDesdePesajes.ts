// ARCHIVO: utils/hato/plDesdePesajes.ts
// DESCRIPCIÓN: la columna `PL` de la planilla de chequeo deja de ser el número
// que el veterinario estimó y pasa a ser el promedio MEDIDO de
// `hato_pesajes_leche`. Decisión del dueño, 2026-09-09.
//
// POR QUÉ. `v_hato_estado_actual.pl` es el PL de la última fila de
// `hato_chequeo_vacas`, o sea lo que alguien escribió a mano en la planilla
// anterior y se viene arrastrando. Contrastado contra los pesajes reales el
// 2026-09-09, las dos cifras no se parecen: ELECTRA #117 figuraba con 28 y
// medía 9,6; RICARENA #88 con 25 y medía 12,4; MAGNIFICA #103 con 30 y medía
// 17,9; MARIPOSA #120 al revés, 20 contra 28,3 reales. Y todos los PL de
// chequeo son números redondos (25, 22, 30) -- son estimaciones, no
// mediciones. El pesaje semanal existe justamente para responder esto con un
// dato.
//
// LAS DOS REGLAS SON DEL DUEÑO Y NO SON INTERCAMBIABLES:
//
//   1. VENTANA de 8 semanas. Es el proxy de "desde el último chequeo" -- el
//      chequeo es bimensual, así que ocho semanas cubren el período que la
//      planilla nueva viene a resumir. No se usa `ultimo_chequeo_fecha` real:
//      varía por vaca y una comprada trae otra fecha, con lo que dos filas
//      vecinas promediarían períodos distintos sin que nada lo diga.
//
//   2. VENCIMIENTO de 4 semanas. Si la vaca no tiene NINGUNA lectura en las
//      últimas cuatro semanas, la celda va VACÍA -- aunque tenga lecturas
//      dentro de la ventana de ocho. Son dos preguntas distintas: la ventana
//      dice cuánto promediar, el vencimiento dice si el promedio todavía
//      describe a la vaca de hoy. Sin la segunda, una vaca secada hace mes y
//      medio seguiría imprimiendo los litros de cuando ordeñaba.
//
// Medido contra producción el 2026-09-09: 27 de las 35 vacas de la planilla
// traen promedio; las 8 restantes dejaron de pesarse entre mayo y julio y
// están preñadas -- o sea secas. Vacío es la respuesta correcta para ellas, y
// es información: dice "no está en ordeño", no "dio 0 litros".
//
// Módulo PURO. No vive en `calculosHato.ts` (trío de paridad espejado a los
// dos árboles de edge function) porque ningún camino de servidor lo necesita,
// mismo criterio que `servicioVigente.ts`. Y NO es `rendimientoPorVaca`
// (`hatoProduccion.ts`), que contesta otra pregunta -- actual contra potencial
// para el ranking del tablero, con ventana de 4 semanas y sin vencimiento.

/** Ventana que se promedia: 8 semanas (regla 1). */
export const VENTANA_PL_DIAS = 56;

/** A partir de acá el promedio deja de describir a la vaca de hoy y la celda
 * va vacía (regla 2): sin lecturas en 4 semanas, no hay PL que imprimir. */
export const VENCIMIENTO_PL_DIAS = 28;

/** Lo mínimo de una fila de `hato_pesajes_leche`. `litros_total` es NOT NULL
 * desde la migración 061. */
export interface PesajeParaPL {
  animal_id: string;
  fecha: string;
  litros_total: number;
}

/** Diferencia en días entre dos fechas ISO `AAAA-MM-DD`, en UTC para que un
 * cambio de horario no mueva el resultado. Local a este módulo a propósito:
 * el `diferenciaDias` de `calculosHato.ts` es privado, y exportarlo obligaría
 * a regenerar las dos copias espejo de ese archivo para nada. */
function diasEntre(desde: string, hasta: string): number {
  const [ad, am, aa] = [desde.slice(0, 4), desde.slice(5, 7), desde.slice(8, 10)];
  const [bd, bm, ba] = [hasta.slice(0, 4), hasta.slice(5, 7), hasta.slice(8, 10)];
  const ta = Date.UTC(Number(ad), Number(am) - 1, Number(aa));
  const tb = Date.UTC(Number(bd), Number(bm) - 1, Number(ba));
  return Math.round((tb - ta) / 86400000);
}

/** Un decimal (decisión del dueño). `9.6`, no `9.55` ni `10`. */
function redondearUnDecimal(valor: number): number {
  return Math.round(valor * 10) / 10;
}

/**
 * `animal_id` -> PL medido, o ausente cuando no hay PL que imprimir.
 *
 * Se devuelve un `Map` y NO un objeto con `null` porque "ausente" y "vacío"
 * son la misma cosa acá: el llamador hace `mapa.get(id) ?? null` y la celda
 * queda en blanco. Nunca `0` -- un 0 diría que la vaca dio cero litros, que
 * es exactamente lo contrario de "no se midió" (regla del módulo).
 *
 * Un pesaje POSTERIOR a `fechaReferencia` se ignora por completo, igual que en
 * `rendimientoPorVaca`: la planilla no mira al futuro ni siquiera si alguien
 * capturó con una fecha adelantada.
 */
export function plMedidoPorAnimal(
  pesajes: readonly PesajeParaPL[],
  fechaReferencia: string,
): Map<string, number> {
  const porAnimal = new Map<string, PesajeParaPL[]>();
  for (const p of pesajes) {
    if (p.fecha > fechaReferencia) continue;
    const previos = porAnimal.get(p.animal_id);
    if (previos) previos.push(p);
    else porAnimal.set(p.animal_id, [p]);
  }

  const resultado = new Map<string, number>();
  for (const [animalId, filas] of porAnimal) {
    // Regla 2 primero: si el dato más fresco de ESTA vaca ya venció, no se
    // promedia nada. Se evalúa antes que la ventana porque una lectura de
    // hace 5 semanas cae dentro de las 8 y aun así está vencida.
    const masReciente = filas.reduce((max, f) => (f.fecha > max ? f.fecha : max), filas[0].fecha);
    if (diasEntre(masReciente, fechaReferencia) >= VENCIMIENTO_PL_DIAS) continue;

    const enVentana = filas.filter((f) => diasEntre(f.fecha, fechaReferencia) <= VENTANA_PL_DIAS);
    if (enVentana.length === 0) continue;

    // Promedio sobre las filas PRESENTES: una semana sin pesar no entra como
    // 0, entra como una semana que no existe.
    const suma = enVentana.reduce((acc, f) => acc + f.litros_total, 0);
    resultado.set(animalId, redondearUnDecimal(suma / enVentana.length));
  }
  return resultado;
}

/** Primera fecha que la consulta necesita traer: `fechaReferencia` menos la
 * ventana. Es exacta, no un margen de seguridad -- una vaca cuya última
 * lectura sea anterior a este corte está vencida por la regla 2, así que
 * traerla no cambiaría ningún resultado.
 *
 * La aritmética se hace sobre un instante armado con `Date.UTC` a partir de
 * una fecha calendario EXPLÍCITA, y el resultado se formatea leyendo los
 * componentes UTC de vuelta -- nunca `toISOString().slice(0, 10)` sobre el
 * reloj. La diferencia importa: `fechaReferencia` ya viene de
 * `obtenerFechaHoy()` (local, Bogotá), así que acá UTC es solo el sistema de
 * coordenadas del cálculo y no puede correr el día. Ver la zona de cuidado
 * «"Hoy" siempre se toma en hora LOCAL» del CLAUDE.md raíz. */
export function fechaDesdeParaPL(fechaReferencia: string): string {
  const anio = Number(fechaReferencia.slice(0, 4));
  const mes = Number(fechaReferencia.slice(5, 7));
  const dia = Number(fechaReferencia.slice(8, 10));
  const corte = new Date(Date.UTC(anio, mes - 1, dia) - VENTANA_PL_DIAS * 86400000);
  const mm = String(corte.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(corte.getUTCDate()).padStart(2, '0');
  return `${corte.getUTCFullYear()}-${mm}-${dd}`;
}
