// ARCHIVO: utils/rondaInventario/reporteCierre.ts
// DESCRIPCIÓN: Ensamblado PURO del reporte de cierre de una ronda (C-1/CA-19,
// §8.3 del brief técnico) a partir de filas YA LEÍDAS de la base -- este
// archivo no hace ninguna consulta. Quien arma el input (el RPC
// `fn_ronda_emitir_reporte`, de una fase posterior) lee `rondas_excepciones`,
// `movimientos_inventario`, `rondas_transcritos`, etc., y le pasa a
// `construirReporteCierre` datos ya resueltos.
//
// R-10/CA-18: el resultado de este módulo es lo que se serializa UNA VEZ en
// `rondas_reportes.contenido`/`texto_telegram` y de ahí se lee siempre --
// nunca se vuelve a llamar a este archivo sobre datos vivos para "actualizar"
// un reporte ya emitido (misma lección que la migración 122).
//
// CA-10, literal: "Los tres desenlaces terminales... no se colapsan en la UI
// ni en el reporte." `clasificarDesenlace` mantiene los tres SEPARADOS
// (más un cuarto bucket, `ajuste_pendiente`, para CA-5: cerrar una ronda no
// exige que sus excepciones estén resueltas) -- nunca se funden en un solo
// conteo, aunque el render de §8.3 los agrupe bajo tres títulos.

import type { ViaExcepcion } from './causasRaiz';

// ---------------------------------------------------------------------------
// 1. Formato colombiano local -- mismo motivo que preview.ts: este módulo se
//    espeja a los dos árboles de edge function y no puede importar
//    `@/utils/format` (precedente `acciones-hechos.ts:formatearNumeroCO`).
// ---------------------------------------------------------------------------

export function formatearCantidadCO(valor: number): string {
  const decimales = Number.isInteger(valor) ? 0 : 1;
  return new Intl.NumberFormat('es-CO', { minimumFractionDigits: decimales, maximumFractionDigits: decimales }).format(valor);
}

/** Sin sufijo "COP" (regla de CLAUDE.md, la moneda es implícita), sin
 * decimales (R-13). */
export function formatearMonedaCO(valor: number): string {
  return `$${new Intl.NumberFormat('es-CO', { minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(valor)}`;
}

// ---------------------------------------------------------------------------
// 2. Estados que este módulo agrupa -- espejo de `estado_excepcion_inventario`
//    (migración 125), como cadenas: este archivo no importa el enum de SQL.
// ---------------------------------------------------------------------------

export type EstadoExcepcionRonda =
  | 'reportada'
  | 'explicacion_precargada'
  | 'explicada'
  | 'cerrada_sin_ajuste'
  | 'resuelta_con_captura'
  | 'ajuste_propuesto'
  | 'ajuste_aprobado'
  | 'ajuste_desestimado'
  | 'ajuste_aplicado';

/** Los CUATRO buckets del reporte. `ajuste_pendiente` agrupa todo estado que
 * no sea uno de los tres desenlaces terminales -- CA-5 permite cerrar con
 * excepciones abiertas, y el reporte las tiene que poder nombrar igual. */
export type DesenlaceReporte = 'cerrada_sin_ajuste' | 'resuelta_con_captura' | 'ajuste_aplicado' | 'ajuste_desestimado' | 'ajuste_pendiente';

/** CA-10: nunca se funden. Cada estado cae en EXACTAMENTE un bucket, y los
 * tres terminales (`cerrada_sin_ajuste`, `resuelta_con_captura`,
 * `ajuste_aplicado`/`ajuste_desestimado`) se mantienen separados entre sí --
 * `ajuste_pendiente` es el único bucket que agrupa varios estados de SQL,
 * y son todos NO terminales (CA-5), nunca dos terminales juntos. */
export function clasificarDesenlace(estado: EstadoExcepcionRonda): DesenlaceReporte {
  switch (estado) {
    case 'cerrada_sin_ajuste':
      return 'cerrada_sin_ajuste';
    case 'resuelta_con_captura':
      return 'resuelta_con_captura';
    case 'ajuste_aplicado':
      return 'ajuste_aplicado';
    case 'ajuste_desestimado':
      return 'ajuste_desestimado';
    case 'reportada':
    case 'explicacion_precargada':
    case 'explicada':
    case 'ajuste_propuesto':
    case 'ajuste_aprobado':
      return 'ajuste_pendiente';
  }
}

// ---------------------------------------------------------------------------
// 3. El input -- filas ya leídas, nada de I/O acá.
// ---------------------------------------------------------------------------

export interface CabeceraReporteCierre {
  periodo: string; // ISO 'AAAA-MM-DD', primer día del mes
  cerradaEn: string; // ISO
  cerradoPorNombre: string;
  alcanceDeclarado: 'completo' | 'parcial';
  alcanceNota: string | null;
  /** R-17/CA-22: la primera ronda se rotula como línea base, para que su
   * pico de excepciones no se lea como pérdida del mes. Lo calcula
   * `fn_ronda_abrir` (Fase 2); acá sólo se muestra. */
  esLineaBase: boolean;
}

export interface ValoracionReporteCierre {
  /** CA-20: espejo de `rondas_reportes.incluye_valoracion` /
   * `inventario_parametros.valoracion_publicable` al momento de emitir. Si
   * es `false`, NINGÚN otro campo de esta interfaz se muestra -- se emite
   * sin esas líneas, nunca con ellas mal (§8.3 punto 2, §11 del brief técnico). */
  incluyeValoracion: boolean;
  valorTotalActual: number | null;
  /** `null` si no hay ronda anterior cerrada -- CA-21: la variación se
   * muestra «—», nunca 0 ni 100 %. */
  valorTotalMesAnterior: number | null;
}

export interface ExcepcionReporteCierre {
  productoNombre: string;
  estado: EstadoExcepcionRonda;
  fisico: number | null;
  teorico: number | null;
  causaEtiqueta: string | null;
  via: ViaExcepcion | null;
}

/** R-9/CA-19: todo movimiento de inventario ocurrido con la ronda abierta,
 * de CUALQUIERA de los tres orígenes -- es la mitigación honesta contra usar
 * el camino (b) para esquivar a Santiago: no se bloquea, se hace visible. */
export type OrigenMovimientoRondaAbierta =
  | 'captura_excepcion'        // vía (a), CA-8 -- ligado a una excepción de esta ronda
  | 'ajuste_puntual'           // camino (b) de §5.1, NuevoMovimientoModal, sin relación con la ronda
  | 'entrada_fuera_de_alcance'; // P-3 (§15.3): producto que entró a existencia > 0 durante la ronda

export interface MovimientoReporteCierre {
  productoNombre: string;
  tipoMovimiento: string;
  cantidad: number;
  origen: OrigenMovimientoRondaAbierta;
  responsable: string | null;
}

export interface InputReporteCierre {
  cabecera: CabeceraReporteCierre;
  valoracion: ValoracionReporteCierre;
  excepciones: readonly ExcepcionReporteCierre[];
  movimientosRondaAbierta: readonly MovimientoReporteCierre[];
  /** A-7/R-16/CA-14, incluidas las de producto no catalogado. */
  observacionesLibres: readonly string[];
  /** CA-37: cuántos `rondas_transcritos` quedaron `sin_confirmar` al cerrar
   * (ya normalizados por `fn_ronda_cerrar`, Fase 2 -- acá sólo se cuenta). */
  hallazgosNarradosSinConfirmar: number;
}

// ---------------------------------------------------------------------------
// 4. La estructura ensamblada
// ---------------------------------------------------------------------------

export interface ReporteCierre {
  cabecera: CabeceraReporteCierre;
  valoracion: ValoracionReporteCierre;
  /** CA-10: las CUATRO listas quedan separadas -- nunca un conteo fundido. */
  excepcionesPorDesenlace: Record<DesenlaceReporte, ExcepcionReporteCierre[]>;
  movimientosRondaAbierta: MovimientoReporteCierre[];
  observacionesLibres: string[];
  hallazgosNarradosSinConfirmar: number;
}

const BUCKETS_VACIOS = (): Record<DesenlaceReporte, ExcepcionReporteCierre[]> => ({
  cerrada_sin_ajuste: [],
  resuelta_con_captura: [],
  ajuste_aplicado: [],
  ajuste_desestimado: [],
  ajuste_pendiente: [],
});

/** Ensamblado puro: agrupa las excepciones por desenlace (CA-10) y copia el
 * resto del input tal cual, para que el resultado se pueda serializar
 * directo a `rondas_reportes.contenido` (R-10). */
export function construirReporteCierre(input: InputReporteCierre): ReporteCierre {
  const excepcionesPorDesenlace = BUCKETS_VACIOS();
  for (const excepcion of input.excepciones) {
    excepcionesPorDesenlace[clasificarDesenlace(excepcion.estado)].push(excepcion);
  }

  return {
    cabecera: input.cabecera,
    valoracion: input.valoracion,
    excepcionesPorDesenlace,
    movimientosRondaAbierta: [...input.movimientosRondaAbierta],
    observacionesLibres: [...input.observacionesLibres],
    hallazgosNarradosSinConfirmar: input.hallazgosNarradosSinConfirmar,
  };
}

/** CA-37: "una ronda con borradores sin confirmar no se reporta como
 * limpia". Una ronda "limpia" es la que no tiene absolutamente nada que
 * revisar: cero excepciones de cualquier bucket y cero narrado sin
 * confirmar. */
export function reporteEsLimpio(reporte: ReporteCierre): boolean {
  const totalExcepciones = Object.values(reporte.excepcionesPorDesenlace).reduce((acc, lista) => acc + lista.length, 0);
  return totalExcepciones === 0 && reporte.hallazgosNarradosSinConfirmar === 0;
}

// ---------------------------------------------------------------------------
// 5. Render de texto para Telegram -- orden literal de §8.3 del brief técnico.
// ---------------------------------------------------------------------------

const TITULOS: Record<DesenlaceReporte, string> = {
  cerrada_sin_ajuste: 'Cerradas sin ajuste',
  resuelta_con_captura: 'Resueltas con captura',
  ajuste_aplicado: 'Ajustes aplicados',
  ajuste_desestimado: 'Ajustes desestimados',
  ajuste_pendiente: 'Ajustes pendientes',
};

function renderExcepcion(e: ExcepcionReporteCierre): string {
  const cifras = e.fisico !== null && e.teorico !== null
    ? `hay ${formatearCantidadCO(e.fisico)}, deberían haber ${formatearCantidadCO(e.teorico)}`
    : 'sin cifra completa';
  const causa = e.causaEtiqueta ? ` -- ${e.causaEtiqueta}` : '';
  return `- ${e.productoNombre}: ${cifras}${causa}`;
}

const ETIQUETA_ORIGEN_MOVIMIENTO: Record<OrigenMovimientoRondaAbierta, string> = {
  captura_excepcion: 'captura de excepción',
  ajuste_puntual: 'ajuste puntual',
  entrada_fuera_de_alcance: 'entrada fuera del alcance congelado',
};

function renderMovimiento(m: MovimientoReporteCierre): string {
  const responsable = m.responsable ? ` -- ${m.responsable}` : '';
  return `- ${m.productoNombre}: ${m.tipoMovimiento} de ${formatearCantidadCO(m.cantidad)} (${ETIQUETA_ORIGEN_MOVIMIENTO[m.origen]})${responsable}`;
}

/**
 * Texto completo del reporte de cierre, orden literal de §8.3:
 * 1) cabecera, 2) valoración (si CA-20 lo permite), 3) excepciones por
 * desenlace, 4) movimientos con la ronda abierta (R-9), 5) observaciones
 * libres, 6) borradores sin confirmar (CA-37).
 */
export function renderReporteCierreTelegram(reporte: ReporteCierre): string {
  const bloques: string[] = [];

  // 1. Cabecera
  bloques.push(`Reporte de cierre -- ronda ${reporte.cabecera.periodo}`);
  bloques.push(`Cerrada el ${reporte.cabecera.cerradaEn} por ${reporte.cabecera.cerradoPorNombre}.`);
  bloques.push(
    reporte.cabecera.alcanceDeclarado === 'completo'
      ? 'Alcance recorrido: completo.'
      : `Alcance recorrido: parcial${reporte.cabecera.alcanceNota ? ` -- ${reporte.cabecera.alcanceNota}` : ''}.`,
  );
  if (reporte.cabecera.esLineaBase) {
    bloques.push(
      'Esta es la RONDA DE LÍNEA BASE: compara por primera vez el inventario físico contra el sistema (antes se comparaba contra una planilla aparte). Su volumen de excepciones es deuda acumulada, no necesariamente pérdida del mes.',
    );
  }

  // 2. Valoración -- CA-20: se omite entera si no está publicable, nunca se
  //    muestra mal.
  if (reporte.valoracion.incluyeValoracion && reporte.valoracion.valorTotalActual !== null) {
    bloques.push('', `Valor total del inventario: ${formatearMonedaCO(reporte.valoracion.valorTotalActual)}`);
    if (reporte.valoracion.valorTotalMesAnterior === null) {
      bloques.push('Variación contra el mes anterior: —');
    } else {
      const delta = reporte.valoracion.valorTotalActual - reporte.valoracion.valorTotalMesAnterior;
      const signo = delta >= 0 ? '+' : '-';
      bloques.push(`Variación contra el mes anterior: ${signo}${formatearMonedaCO(Math.abs(delta))}`);
    }
  }

  // 3. Excepciones por desenlace -- los CUATRO buckets, cada uno con su
  //    título propio (CA-10: nunca fundidos), incluso cuando está vacío --
  //    "0" también es información sobre lo que pasó en la ronda.
  bloques.push('', 'Excepciones:');
  (['cerrada_sin_ajuste', 'resuelta_con_captura', 'ajuste_aplicado', 'ajuste_desestimado', 'ajuste_pendiente'] as const).forEach((bucket) => {
    const lista = reporte.excepcionesPorDesenlace[bucket];
    bloques.push(`${TITULOS[bucket]} (${lista.length}):`);
    if (lista.length === 0) {
      bloques.push('- (ninguna)');
    } else {
      bloques.push(...lista.map(renderExcepcion));
    }
  });

  // 4. Movimientos con la ronda abierta (R-9/CA-19, P-3)
  bloques.push('', `Movimientos de inventario ocurridos con la ronda abierta (${reporte.movimientosRondaAbierta.length}):`);
  bloques.push(
    reporte.movimientosRondaAbierta.length === 0
      ? '- (ninguno)'
      : reporte.movimientosRondaAbierta.map(renderMovimiento).join('\n'),
  );

  // 5. Observaciones libres (A-7/R-16/CA-14)
  if (reporte.observacionesLibres.length > 0) {
    bloques.push('', 'Observaciones de Uriel (no catalogadas):');
    bloques.push(...reporte.observacionesLibres.map((o) => `- ${o}`));
  }

  // 6. Borradores sin confirmar (CA-37) -- una ronda con borradores NUNCA se
  //    reporta como limpia.
  if (reporte.hallazgosNarradosSinConfirmar > 0) {
    bloques.push('', `${reporte.hallazgosNarradosSinConfirmar} hallazgo(s) narrado(s) sin confirmar.`);
  } else if (reporteEsLimpio(reporte)) {
    bloques.push('', 'Ronda limpia: sin excepciones ni borradores pendientes.');
  }

  return bloques.join('\n');
}
