// ARCHIVO: utils/calculosSaludDatos.ts
// DESCRIPCIÓN: Lógica PURA del bloque "Salud de los datos" del Tablero
// General (`docs/plan_dashboard_centro_control.md` §4 Bloque 6 / §9.2). Cero
// Supabase -- el I/O (los `MAX(fecha)` por tabla) vive en
// `src/components/dashboard/hooks/useSaludDatos.ts`, que sólo llama a estas
// funciones sobre lo que ya trajo.
//
// "Es lo que hace auditable todo lo que está más arriba" (plan §4 Bloque 6):
// cada señal es un `MAX(fecha)` contra su propia cadencia. Los umbrales
// ámbar/rojo de este archivo son un criterio PROPIO del tablero (no viven en
// `hato_config` ni en ningún catálogo de negocio, porque son sobre FRESCURA
// de captura, no sobre una regla agronómica o financiera) -- documentados uno
// por uno abajo, con la razón de cada número. Si algún día hace falta que el
// dueño los ajuste sin desplegar, es candidato a Ola 3 (ver plan §6).

import { diferenciaEnDias } from '@/utils/fechas';
import { etiquetaQuincena, type QuincenaResuelta } from '@/utils/calculosDinero';
import { rangoQuincena } from '@/utils/calculosHato';

export type NivelSaludDato = 'verde' | 'ambar' | 'rojo' | 'gris';

/** Días entre `fechaISO` (`YYYY-MM-DD`) y `hoy`. `null` si nunca hubo dato
 *  (la tabla no tiene ninguna fila) -- nunca 0, nunca `Infinity`. */
export function diasDesde(fechaISO: string | null, hoy: string): number | null {
  if (!fechaISO) return null;
  return diferenciaEnDias(fechaISO, hoy);
}

/** `gris` = sin dato (nunca se registró nada -- distinto de "rojo", que
 *  implica que SÍ hubo un dato, sólo que quedó viejo). Por debajo del umbral
 *  ámbar es verde (inclusive); entre los dos umbrales es ámbar (inclusive);
 *  por encima del umbral rojo es rojo. */
export function clasificarPorCadencia(dias: number | null, umbralAmbar: number, umbralRojo: number): NivelSaludDato {
  if (dias === null) return 'gris';
  if (dias <= umbralAmbar) return 'verde';
  if (dias <= umbralRojo) return 'ambar';
  return 'rojo';
}

// Ronda de monitoreo: el plan ya documenta 14 días como el umbral de
// "ámbar" en otros dos sitios de la misma pantalla (bloque 2.1 del clima y
// la tarjeta de pulso de aguacate, 3.2) -- se reusa el mismo número aquí en
// vez de inventar uno nuevo. El rojo (28 = el doble) sí es criterio propio
// de este bloque, no está documentado en otra parte.
export const UMBRAL_MONITOREO = { ambar: 14, rojo: 28 } as const;

// Chequeo veterinario: los intervalos REALES entre los últimos 8 chequeos
// (plan §4 Bloque 1, "corregido 2026-08-17 contra producción") son 71, 63,
// 92, 63, 105, 71, 234 y 81 días -- una mediana de ~71 con varianza enorme,
// y el propio plan fija 75 días como el punto EXACTO en que esto deja de
// ser "frescura" y sube a "Requiere tu decisión". El rojo de este bloque usa
// ese mismo 75 (para no contradecir esa regla en dos sitios de la misma
// pantalla); el ámbar (60) queda deliberadamente POR DEBAJO del mínimo
// intervalo real observado (63 días), así que un chequeo dentro del rango
// normal de la operación nunca se pinta ámbar -- sólo lo hace al acercarse
// de verdad al punto de escalamiento.
export const UMBRAL_CHEQUEO = { ambar: 60, rojo: 75 } as const;

// Pesaje semanal: calca los niveles de `vejezPesajes` (hatoProduccion.ts,
// decisión 17) -- `ok` <= 1 semana, `atrasado` 2-3 semanas, `crítico` > 3
// semanas -- expresados en días para que este archivo no dependa del tipo
// `PesajeLecheVaca` de ese módulo. Mismo criterio, dos representaciones.
export const UMBRAL_PESAJE = { ambar: 7, rojo: 21 } as const;

// Quincena de venta de leche: ciclo de ~15 días. Ámbar tras perder un ciclo
// completo (con margen), rojo tras perder dos o más -- criterio propio,
// ningún precedente documentado en otro módulo para esta cadencia.
export const UMBRAL_QUINCENA = { ambar: 20, rojo: 35 } as const;

/** `verde` si TODOS los días de la ventana son confiables, `ambar` si al
 *  menos la mitad lo son, `rojo` si menos de la mitad, `gris` sin ninguna
 *  lectura en absoluto (ventana vacía -- estación nunca sincronizó). */
export function clasificarClima(confiables: number, total: number): NivelSaludDato {
  if (total === 0) return 'gris';
  if (confiables === total) return 'verde';
  if (confiables >= total / 2) return 'ambar';
  return 'rojo';
}

// ---------------------------------------------------------------------------
// Ensamblado de las cinco señales, en el orden fijo del diseño
// ---------------------------------------------------------------------------

export interface SenalSaludDatos {
  clave: 'monitoreo' | 'chequeo' | 'pesaje' | 'quincena' | 'clima';
  etiqueta: string;
  /** "13 d" · "julio Q2" · "7 de 10 días confiables" · "nunca" */
  detalle: string;
  nivel: NivelSaludDato;
}

export interface InputSaludDatos {
  /** `YYYY-MM-DD`, de `obtenerFechaHoy()`. */
  hoy: string;
  /** `puedeAccederModulo(profile, 'aguacate')` -- gobierna monitoreo y clima. */
  hasAguacate: boolean;
  /** `puedeAccederModulo(profile, 'hato_lechero')` -- gobierna chequeo, pesaje y quincena. */
  hasHato: boolean;
  fechaUltimoMonitoreo: string | null;
  fechaUltimoChequeo: string | null;
  fechaUltimoPesaje: string | null;
  ultimaQuincena: QuincenaResuelta | null;
  /** `null` cuando no se consultó (p. ej. sin módulo aguacate) -- distinto
   *  de `0`, que sí sería "se consultó y no hay ninguna lectura". */
  climaConfiables: number | null;
  climaTotal: number | null;
}

/**
 * Arma las señales visibles del bloque "Salud de los datos", ya filtradas
 * por módulo (plan §8: "filtra sus filas por módulo -- sólo las señales de
 * sus módulos") y en el orden fijo del diseño: monitoreo, chequeo, pesaje,
 * quincena, clima. Sin ningún módulo habilitado, arreglo vacío -- el
 * componente decide qué hacer con eso (colapsar la sección entera, mismo
 * criterio que el resto del tablero).
 */
export function construirSenalesSaludDatos(input: InputSaludDatos): SenalSaludDatos[] {
  const senales: SenalSaludDatos[] = [];

  if (input.hasAguacate) {
    const dias = diasDesde(input.fechaUltimoMonitoreo, input.hoy);
    senales.push({
      clave: 'monitoreo',
      etiqueta: 'Monitoreo',
      detalle: dias === null ? 'nunca' : `${dias} d`,
      nivel: clasificarPorCadencia(dias, UMBRAL_MONITOREO.ambar, UMBRAL_MONITOREO.rojo),
    });
  }

  if (input.hasHato) {
    const diasChequeo = diasDesde(input.fechaUltimoChequeo, input.hoy);
    senales.push({
      clave: 'chequeo',
      etiqueta: 'Chequeo',
      detalle: diasChequeo === null ? 'nunca' : `${diasChequeo} d`,
      nivel: clasificarPorCadencia(diasChequeo, UMBRAL_CHEQUEO.ambar, UMBRAL_CHEQUEO.rojo),
    });

    const diasPesaje = diasDesde(input.fechaUltimoPesaje, input.hoy);
    senales.push({
      clave: 'pesaje',
      etiqueta: 'Pesaje',
      detalle: diasPesaje === null ? 'nunca' : `${diasPesaje} d`,
      nivel: clasificarPorCadencia(diasPesaje, UMBRAL_PESAJE.ambar, UMBRAL_PESAJE.rojo),
    });

    let diasQuincena: number | null = null;
    if (input.ultimaQuincena) {
      const { fechaFin } = rangoQuincena(input.ultimaQuincena.anio, input.ultimaQuincena.mes, input.ultimaQuincena.quincena);
      diasQuincena = diasDesde(fechaFin, input.hoy);
    }
    senales.push({
      clave: 'quincena',
      etiqueta: 'Quincena',
      detalle: input.ultimaQuincena ? etiquetaQuincena(input.ultimaQuincena) : 'nunca',
      nivel: clasificarPorCadencia(diasQuincena, UMBRAL_QUINCENA.ambar, UMBRAL_QUINCENA.rojo),
    });
  }

  if (input.hasAguacate) {
    const total = input.climaTotal ?? 0;
    const confiables = input.climaConfiables ?? 0;
    senales.push({
      clave: 'clima',
      etiqueta: 'Clima',
      detalle: total === 0 ? 'sin datos recientes' : `${confiables} de ${total} días confiables`,
      nivel: clasificarClima(confiables, total),
    });
  }

  return senales;
}
