/**
 * Motor de agrupamiento de "Novedades" (issue #266) -- PURO: sin red, sin
 * Supabase, sin React, sin `new Date()` propio (`hoy` viaja como parámetro,
 * mismo patrón testable-clock que `calculosRequiereDecision.ts` y
 * `hatoAlertasTablero.ts`).
 *
 * Recibe `NovedadCruda[]` (una por fila cruda de cualquier fuente del
 * catálogo, ya con su `claveGrano` declarada -- §4.1 del plan técnico: "la
 * clave de agrupación la declara cada fuente, no la adivina el agrupador")
 * y produce las líneas del feed, agrupadas por día calendario Bogotá de
 * CAPTURA (nunca del hecho -- §4.2 del brief).
 *
 * Tres pasos, siempre en este orden: (1) fundir crudas que comparten
 * `claveGrano` en una `Novedad`; (2) ordenar por `capturadoEn` descendente,
 * sin excepciones; (3) recortar al tope duro de 20 y sólo entonces repartir
 * en encabezados de día.
 */

import type { GrupoDia, Novedad, NovedadCruda } from './tipos';
import { diaBogota } from '@/utils/fechas';

/** §4.4 del brief: "Tope duro de 20 líneas aun expandido; más allá, un pie
 *  'y N más en los últimos 7 días'." */
const TOPE_LINEAS = 20;

export interface ResultadoAgrupar {
  grupos: GrupoDia[];
  /** `null` si el total no superó el tope; si no, el texto del pie --
   *  responsabilidad del agrupador, no de cada consumidor, para que el
   *  número nunca diverja entre quien pinta y quien lo calculó. */
  notaPie: string | null;
}

/**
 * @param crudas   Todas las filas crudas ya cargadas (cualquier orden).
 * @param hoy      Día calendario Bogotá de HOY, `AAAA-MM-DD` -- el llamador
 *                 lo calcula con `obtenerFechaHoy()`, nunca esta función.
 * @param autores  Mapa id de usuario -> nombre para mostrar, ya resuelto
 *                 por `fn_novedades_autores` (F3). Un id ausente del mapa
 *                 se traduce a "sin autor registrado" por el consumidor de
 *                 `Novedad.autorNombre === null`, nunca acá con un nombre
 *                 inventado (§12.7 del plan técnico).
 */
export function agruparNovedades(
  crudas: readonly NovedadCruda[],
  hoy: string,
  autores: ReadonlyMap<string, string> = new Map(),
): ResultadoAgrupar {
  const porClave = new Map<string, NovedadCruda[]>();
  for (const cruda of crudas) {
    const lista = porClave.get(cruda.claveGrano);
    if (lista) lista.push(cruda);
    else porClave.set(cruda.claveGrano, [cruda]);
  }

  const novedades = [...porClave.values()]
    .map((grupo) => fusionarGrupo(grupo, hoy, autores))
    // Orden global del feed: SIEMPRE capturadoEn descendente (§4.2 del
    // brief). Los encabezados de día heredan este orden -- nunca reordenan
    // por su cuenta (docstring de `GrupoDia` en tipos.ts).
    .sort((a, b) => b.capturadoEn.localeCompare(a.capturadoEn));

  const visibles = novedades.slice(0, TOPE_LINEAS);
  const restantes = novedades.length - visibles.length;
  const notaPie = restantes > 0 ? `y ${restantes} más en los últimos 7 días` : null;

  return { grupos: agruparPorDiaBogota(visibles, hoy), notaPie };
}

/**
 * Funde todas las `NovedadCruda` de un mismo `claveGrano` en una `Novedad`.
 *
 * El ANCLA (la fila con `capturadoEn` más reciente del grupo) decide los
 * campos que deberían ser idénticos entre filas del mismo grupo por
 * construcción de `claveGrano` (`fuente`, `modulo`, `tipoHecho`, `autorId`,
 * `canal`, `ruta`) -- tomar el ancla es el criterio determinista para el
 * caso en que, por lo que sea, no coincidieran.
 */
function fusionarGrupo(grupo: NovedadCruda[], hoy: string, autores: ReadonlyMap<string, string>): Novedad {
  const ordenadoDesc = [...grupo].sort((a, b) => b.capturadoEn.localeCompare(a.capturadoEn));
  const ancla = ordenadoDesc[0];

  const fechasHecho = unicos(grupo.map((c) => c.fechaHecho)).sort();
  // Orden de "llegada" = el orden ya descendente por capturadoEn (más
  // reciente primero) -- `frases.ts` decide el corte a 3 + "y N más"
  // (tipos.ts, docstring de `Novedad.objetosNombre`).
  const objetosNombre = unicos(ordenadoDesc.map((c) => c.objetoNombre));

  // Regla genérica de `tamano.objetos` (ver `movimientosDiarios.ts` /
  // `registrosTrabajo.ts` para el porqué de cada rama): si el grupo trae
  // nombres propios, "objetos" es su conteo distinto -- un lote, una vaca,
  // no se cuentan dos veces por aparecer en dos filas. Si NO trae nombres
  // (a propósito, cuando el objeto no es nombrable en público --
  // `registros_trabajo`), "objetos" es la SUMA de la contribución MARGINAL
  // que cada cargador ya calculó por fila (1 sólo en la primera aparición
  // de cada identidad dentro de la sesión, `undefined` en las repeticiones)
  // -- nunca una suma ingenua de banderas por fila, que sobre-contaría.
  const objetos = objetosNombre.length > 0 ? objetosNombre.length : sumaOUndefined(grupo.map((c) => c.tamano.objetos));

  const denominador = grupo.map((c) => c.tamano.denominador).find((d) => d != null);
  // Suma genérica, mismo mecanismo que `objetos`: `personas` (sólo
  // registros_trabajo, contribución marginal por persona nueva) y
  // `montoTotal` (sólo fin_gastos, cada fila es un gasto distinto -- suma
  // llana, sin deduplicar nada).
  const personas = sumaOUndefined(grupo.map((c) => c.tamano.personas));
  const montoTotal = sumaOUndefined(grupo.map((c) => c.tamano.montoTotal));

  return {
    id: ancla.claveGrano,
    fuente: ancla.fuente,
    modulo: ancla.modulo,
    tipoHecho: ancla.tipoHecho,
    autorId: ancla.autorId,
    autorNombre: ancla.autorId ? (autores.get(ancla.autorId) ?? null) : null,
    autorTextoLibre: ancla.autorTextoLibre,
    canal: ancla.canal,
    capturadoEn: ancla.capturadoEn,
    fechasHecho,
    conFechaFutura: fechasHecho.some((f) => f > hoy),
    objetosNombre,
    tamano: {
      filas: grupo.reduce((acc, c) => acc + c.tamano.filas, 0),
      objetos,
      denominador,
      personas,
      montoTotal,
    },
    ruta: ancla.ruta,
  };
}

function unicos<T>(valores: (T | null)[]): T[] {
  return [...new Set(valores.filter((v): v is T => v != null))];
}

function sumaOUndefined(valores: (number | undefined)[]): number | undefined {
  const presentes = valores.filter((v): v is number => v != null);
  return presentes.length === 0 ? undefined : presentes.reduce((acc, v) => acc + v, 0);
}

/**
 * Reparte las novedades YA ordenadas (capturadoEn desc) en encabezados de
 * día calendario Bogotá -- vía `diaBogota()`, el único sitio autorizado a
 * nombrar el huso (`src/utils/fechas.ts`, guardado por
 * `hatoFechaLocalGuard.test.ts`). El orden de los grupos hereda el orden de
 * PRIMERA aparición de cada día en la lista de entrada, que ya es
 * descendente -- `Map` conserva orden de inserción.
 */
function agruparPorDiaBogota(novedades: Novedad[], hoy: string): GrupoDia[] {
  const porDia = new Map<string, Novedad[]>();
  for (const n of novedades) {
    const dia = diaBogota(n.capturadoEn);
    const lista = porDia.get(dia);
    if (lista) lista.push(n);
    else porDia.set(dia, [n]);
  }
  return [...porDia.entries()].map(([fecha, lista]) => ({
    encabezado: encabezadoDia(fecha, hoy),
    fecha,
    novedades: lista,
  }));
}

const DIAS_SEMANA = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const MESES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
];

/** Aritmética en UTC sobre los tres números del string -- mismo criterio
 *  que `semanaISO()` en `fechas.ts` (nunca `new Date(iso)` leído con
 *  getters locales, que en UTC-5 corre el día). */
function diaAnteriorA(fechaISO: string): string {
  const [anio, mes, dia] = fechaISO.split('-').map(Number);
  const fecha = new Date(Date.UTC(anio, mes - 1, dia));
  fecha.setUTCDate(fecha.getUTCDate() - 1);
  const a = fecha.getUTCFullYear();
  const m = String(fecha.getUTCMonth() + 1).padStart(2, '0');
  const d = String(fecha.getUTCDate()).padStart(2, '0');
  return `${a}-${m}-${d}`;
}

function nombreDiaLargo(fechaISO: string): string {
  const [anio, mes, dia] = fechaISO.split('-').map(Number);
  const fechaUTC = new Date(Date.UTC(anio, mes - 1, dia));
  return `${DIAS_SEMANA[fechaUTC.getUTCDay()]} ${dia} de ${MESES[mes - 1]}`;
}

/** "Hoy" · "Ayer — lunes 15 de septiembre" · "sábado 13 de septiembre"
 *  (§4.1/§4.4 del brief, mockup literal). */
function encabezadoDia(fechaISO: string, hoy: string): string {
  if (fechaISO === hoy) return 'Hoy';
  if (fechaISO === diaAnteriorA(hoy)) return `Ayer — ${nombreDiaLargo(fechaISO)}`;
  return nombreDiaLargo(fechaISO);
}
