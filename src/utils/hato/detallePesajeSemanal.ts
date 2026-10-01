// ARCHIVO: utils/hato/detallePesajeSemanal.ts
// DESCRIPCIÓN: detalle de un pesaje al abrir una barra medida del tracker
// (issue #297). Puro, sin I/O.
//
// La barra NO es un pesaje. `proyectarHato` suma `litros_total` de una
// ventana de 7 días (semana 0 = [ancla-6, ancla]). En la planilla esa
// ventana suele contener UNA fecha (`dia_pesaje_semanal`) con DOS pesajes:
// mañana y tarde. Si la ventana trae varias fechas, se listan todas. Si
// ninguna fila de la fecha tiene mañana ni tarde (migración 061, un solo
// número del día), hay UN pesaje "jornada": el total no se esconde detrás
// de dos turnos vacíos.
//
// La foto no es 1:1 con el pesaje. Una captura es la planilla del mes
// (1–6 imágenes, muchas semanas). No hay FK. Se liga solo si el alta de
// la captura cae a ±36 h de la mediana de `created_at` de estas filas.
// Si no, se muestran las fotos del mes con la etiqueta de que no está
// probado que hayan producido estas filas. Borrar el pesaje no borra
// el objeto de Storage: es el respaldo para volver a cargar.

export const VENTANA_CAPTURA_MS = 36 * 60 * 60 * 1000;

const DESENLACES_LIGABLES = new Set(['ok', 'pendiente', 'ocr_fallo']);

export type TurnoPesaje = 'am' | 'pm';

export interface FilaPesajeSemana {
  id: string;
  animal_id: string;
  fecha: string;
  litros_total: number;
  litros_am: number | null;
  litros_pm: number | null;
  fuente: string | null;
  created_at: string;
  created_by: string | null;
}

export interface PesajeEnSemana {
  /** `${fecha}|am`, `${fecha}|pm` o `${fecha}|jornada`. */
  clave: string;
  fecha: string;
  turno: TurnoPesaje | null;
  etiqueta: 'Mañana' | 'Tarde' | 'Pesaje';
}

export interface CapturaPesajeCandidata {
  id: string;
  anio: number;
  mes: number;
  storageBucket: string;
  storageRutas: string[];
  storageOk: boolean;
  createdBy: string | null;
  creadoEn: string;
  origen: string;
  desenlace: string;
}

export interface FotosDelPesaje {
  ligada: CapturaPesajeCandidata | null;
  /** Otras fotos del mismo mes, con archivo. No produjeron estas filas
   * de forma demostrable. */
  delMes: CapturaPesajeCandidata[];
}

export interface BorradorFila {
  id: string;
  litros_am: string;
  litros_pm: string;
  litros_total: string;
}

export interface ActualizacionPesaje {
  id: string;
  litros_am: number | null;
  litros_pm: number | null;
  litros_total: number;
}

export interface PlanEscrituraPesaje {
  actualizaciones: ActualizacionPesaje[];
  borrarIds: string[];
}

export type EfectoFila =
  | { tipo: 'igual' }
  | { tipo: 'actualizar'; actualizacion: ActualizacionPesaje }
  | { tipo: 'borrar' }
  | { tipo: 'error'; error: string };

export type ResultadoPlan =
  | { ok: true; plan: PlanEscrituraPesaje }
  | { ok: false; error: string };

export type ResultadoLitros = { ok: true; valor: number | null } | { ok: false; error: string };

function sumarDias(fechaIso: string, dias: number): string {
  const [anio, mes, dia] = fechaIso.split('-').map(Number);
  const d = new Date(Date.UTC(anio, mes - 1, dia));
  d.setUTCDate(d.getUTCDate() + dias);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}

/** Ventana inclusiva que `proyectarHato` usa para la semana medida
 * `semana` (`0` = ancla, negativa = hacia atrás). Una semana proyectada
 * (`> 0`) no tiene pesaje que abrir. */
export function rangoSemanaMedida(fechaReferencia: string, semana: number): { inicio: string; fin: string } {
  if (!Number.isInteger(semana) || semana > 0) {
    throw new Error(`semana medida inválida: ${semana}`);
  }
  const i = -semana;
  return {
    inicio: sumarDias(fechaReferencia, -(i * 7 + 6)),
    fin: sumarDias(fechaReferencia, -(i * 7)),
  };
}

export function mesesDelRango(inicio: string, fin: string): Array<{ anio: number; mes: number }> {
  const [ai, mi] = inicio.split('-').map(Number);
  const [af, mf] = fin.split('-').map(Number);
  const salida: Array<{ anio: number; mes: number }> = [];
  let anio = ai;
  let mes = mi;
  while (anio < af || (anio === af && mes <= mf)) {
    salida.push({ anio, mes });
    mes += 1;
    if (mes > 12) {
      mes = 1;
      anio += 1;
    }
  }
  return salida;
}

function tieneTurno(fila: FilaPesajeSemana): boolean {
  return fila.litros_am != null || fila.litros_pm != null;
}

/** Mañana y tarde cuando alguna fila de la fecha trae turno. Una jornada
 * cuando todas guardan solo el total. Fechas ascendentes; dentro de una
 * fecha, mañana antes que tarde. */
export function listarPesajesDeSemana(filas: readonly FilaPesajeSemana[]): PesajeEnSemana[] {
  const porFecha = new Map<string, FilaPesajeSemana[]>();
  for (const fila of filas) {
    const grupo = porFecha.get(fila.fecha);
    if (grupo) grupo.push(fila);
    else porFecha.set(fila.fecha, [fila]);
  }
  const salida: PesajeEnSemana[] = [];
  for (const fecha of [...porFecha.keys()].sort()) {
    const grupo = porFecha.get(fecha) ?? [];
    if (grupo.some(tieneTurno)) {
      salida.push({ clave: `${fecha}|am`, fecha, turno: 'am', etiqueta: 'Mañana' });
      salida.push({ clave: `${fecha}|pm`, fecha, turno: 'pm', etiqueta: 'Tarde' });
    } else {
      salida.push({ clave: `${fecha}|jornada`, fecha, turno: null, etiqueta: 'Pesaje' });
    }
  }
  return salida;
}

export function filasDelPesaje(
  filas: readonly FilaPesajeSemana[],
  pesaje: PesajeEnSemana,
): FilaPesajeSemana[] {
  return filas.filter((fila) => {
    if (fila.fecha !== pesaje.fecha) return false;
    if (pesaje.turno === 'am') return fila.litros_am != null;
    if (pesaje.turno === 'pm') return fila.litros_pm != null;
    return true;
  });
}

export function litrosDelPesaje(filas: readonly FilaPesajeSemana[], pesaje: PesajeEnSemana): number {
  return filasDelPesaje(filas, pesaje).reduce((acc, fila) => {
    if (pesaje.turno === 'am') return acc + (fila.litros_am ?? 0);
    if (pesaje.turno === 'pm') return acc + (fila.litros_pm ?? 0);
    return acc + fila.litros_total;
  }, 0);
}

export function ordenarFilasPesaje<T extends { animal_id: string }>(
  filas: readonly T[],
  numeroDe: (animalId: string) => number | null,
): T[] {
  return [...filas].sort((a, b) => {
    const na = numeroDe(a.animal_id);
    const nb = numeroDe(b.animal_id);
    if (na == null && nb == null) return a.animal_id.localeCompare(b.animal_id);
    if (na == null) return 1;
    if (nb == null) return -1;
    if (na !== nb) return na - nb;
    return a.animal_id.localeCompare(b.animal_id);
  });
}

function medianaMs(filas: readonly { created_at: string }[]): number | null {
  const marcas = filas
    .map((fila) => Date.parse(fila.created_at))
    .filter((ms) => !Number.isNaN(ms))
    .sort((a, b) => a - b);
  if (marcas.length === 0) return null;
  const medio = Math.floor(marcas.length / 2);
  if (marcas.length % 2 === 1) return marcas[medio];
  return (marcas[medio - 1] + marcas[medio]) / 2;
}

export function autorMayoritario(filas: readonly { created_by: string | null }[]): string | null {
  const conteo = new Map<string, number>();
  for (const fila of filas) {
    if (!fila.created_by) continue;
    conteo.set(fila.created_by, (conteo.get(fila.created_by) ?? 0) + 1);
  }
  let mejor: string | null = null;
  let cantidad = 0;
  for (const [id, n] of conteo) {
    if (n > cantidad) {
      mejor = id;
      cantidad = n;
    }
  }
  return mejor;
}

function enMeses(captura: CapturaPesajeCandidata, meses: readonly { anio: number; mes: number }[]): boolean {
  return meses.some((m) => m.anio === captura.anio && m.mes === captura.mes);
}

function tieneArchivo(captura: CapturaPesajeCandidata): boolean {
  return captura.storageOk && captura.storageRutas.length > 0 && captura.storageBucket.length > 0;
}

/** Liga una captura a estas filas, o deja solo las fotos del mes. */
export function elegirCaptura(
  capturas: readonly CapturaPesajeCandidata[],
  filas: readonly { created_at: string; created_by: string | null }[],
  meses: readonly { anio: number; mes: number }[],
): FotosDelPesaje {
  const delMesTodas = capturas
    .filter((captura) => enMeses(captura, meses) && tieneArchivo(captura))
    .sort((a, b) => (a.creadoEn < b.creadoEn ? 1 : a.creadoEn > b.creadoEn ? -1 : a.id.localeCompare(b.id)));

  const mediana = medianaMs(filas);
  const autor = autorMayoritario(filas);
  if (mediana == null) return { ligada: null, delMes: delMesTodas };

  const ligables = delMesTodas.filter((captura) => {
    if (!DESENLACES_LIGABLES.has(captura.desenlace)) return false;
    const marca = Date.parse(captura.creadoEn);
    if (Number.isNaN(marca)) return false;
    return Math.abs(marca - mediana) <= VENTANA_CAPTURA_MS;
  });

  ligables.sort((a, b) => {
    const okA = a.desenlace === 'ok' ? 0 : 1;
    const okB = b.desenlace === 'ok' ? 0 : 1;
    if (okA !== okB) return okA - okB;
    const autorA = autor != null && a.createdBy === autor ? 0 : 1;
    const autorB = autor != null && b.createdBy === autor ? 0 : 1;
    if (autorA !== autorB) return autorA - autorB;
    const distA = Math.abs(Date.parse(a.creadoEn) - mediana);
    const distB = Math.abs(Date.parse(b.creadoEn) - mediana);
    if (distA !== distB) return distA - distB;
    return a.id.localeCompare(b.id);
  });

  const ligada = ligables[0] ?? null;
  return {
    ligada,
    delMes: delMesTodas.filter((captura) => captura.id !== ligada?.id),
  };
}

/** Autor que se muestra: el de la captura ligada, si no el de la mayoría
 * de las filas. Nunca se edita. */
export function idAutorVisible(
  ligada: CapturaPesajeCandidata | null,
  filas: readonly { created_by: string | null }[],
): string | null {
  if (ligada?.createdBy) return ligada.createdBy;
  return autorMayoritario(filas);
}

/** Vacío es ausencia (`null`), no cero. El cero es una medición. */
export function parseLitrosCampo(texto: string): ResultadoLitros {
  const limpio = texto.trim();
  if (limpio === '') return { ok: true, valor: null };
  const tieneComa = limpio.includes(',');
  const tienePunto = limpio.includes('.');
  if (tieneComa && tienePunto) {
    return { ok: false, error: 'Escribe un número de litros.' };
  }
  const normalizado = tieneComa ? limpio.replace(',', '.') : limpio;
  if (!/^\d+(\.\d+)?$/.test(normalizado)) {
    return { ok: false, error: 'Escribe un número de litros.' };
  }
  const valor = Number(normalizado);
  if (!Number.isFinite(valor) || valor < 0) {
    return { ok: false, error: 'Los litros no pueden ser negativos.' };
  }
  return { ok: true, valor };
}

export function textoLitros(valor: number | null): string {
  if (valor == null) return '';
  const redondeado = Math.round(valor * 1000) / 1000;
  return String(redondeado).replace('.', ',');
}

export function borradorInicial(fila: FilaPesajeSemana): BorradorFila {
  return {
    id: fila.id,
    litros_am: textoLitros(fila.litros_am),
    litros_pm: textoLitros(fila.litros_pm),
    litros_total: textoLitros(fila.litros_total),
  };
}

function sumaTurnos(am: number | null, pm: number | null): number {
  return Math.round(((am ?? 0) + (pm ?? 0)) * 1000) / 1000;
}

function casiIgual(a: number | null, b: number | null): boolean {
  if (a == null || b == null) return a === b;
  return Math.abs(a - b) < 0.0005;
}

export function efectoFila(original: FilaPesajeSemana, borrador: BorradorFila, turno: TurnoPesaje | null): EfectoFila {
  if (turno === 'am' || turno === 'pm') {
    const texto = turno === 'am' ? borrador.litros_am : borrador.litros_pm;
    const leido = parseLitrosCampo(texto);
    if (!leido.ok) return { tipo: 'error', error: leido.error };
    const am = turno === 'am' ? leido.valor : original.litros_am;
    const pm = turno === 'pm' ? leido.valor : original.litros_pm;
    if (am == null && pm == null) return { tipo: 'borrar' };
    const litros_total = sumaTurnos(am, pm);
    if (casiIgual(am, original.litros_am) && casiIgual(pm, original.litros_pm) && casiIgual(litros_total, original.litros_total)) {
      return { tipo: 'igual' };
    }
    return { tipo: 'actualizar', actualizacion: { id: original.id, litros_am: am, litros_pm: pm, litros_total } };
  }

  const leido = parseLitrosCampo(borrador.litros_total);
  if (!leido.ok) return { tipo: 'error', error: leido.error };
  if (leido.valor == null) {
    return { tipo: 'error', error: 'Escribe los litros. El cero es válido; vacío no.' };
  }
  if (
    casiIgual(leido.valor, original.litros_total) &&
    original.litros_am == null &&
    original.litros_pm == null
  ) {
    return { tipo: 'igual' };
  }
  return {
    tipo: 'actualizar',
    actualizacion: {
      id: original.id,
      litros_am: null,
      litros_pm: null,
      litros_total: leido.valor,
    },
  };
}

export function planGuardarBorrador(
  filas: readonly FilaPesajeSemana[],
  borradores: readonly BorradorFila[],
  turno: TurnoPesaje | null,
): ResultadoPlan {
  const porId = new Map(borradores.map((b) => [b.id, b]));
  const plan: PlanEscrituraPesaje = { actualizaciones: [], borrarIds: [] };
  for (const fila of filas) {
    const borrador = porId.get(fila.id);
    if (!borrador) continue;
    const efecto = efectoFila(fila, borrador, turno);
    if (efecto.tipo === 'error') return { ok: false, error: efecto.error };
    if (efecto.tipo === 'actualizar') plan.actualizaciones.push(efecto.actualizacion);
    if (efecto.tipo === 'borrar') plan.borrarIds.push(fila.id);
  }
  return { ok: true, plan };
}

/** Borra UN pesaje (un turno, o la jornada entera). No toca Storage.
 * Mañana con tarde todavía presente: deja la tarde y recalcula el total.
 * Mañana sin tarde: borra la fila. No escribe un cero fabricado. */
export function planBorrarPesaje(
  filasFecha: readonly FilaPesajeSemana[],
  turno: TurnoPesaje | null,
): PlanEscrituraPesaje {
  if (turno == null) {
    return { actualizaciones: [], borrarIds: filasFecha.map((fila) => fila.id) };
  }
  const plan: PlanEscrituraPesaje = { actualizaciones: [], borrarIds: [] };
  for (const fila of filasFecha) {
    const propio = turno === 'am' ? fila.litros_am : fila.litros_pm;
    if (propio == null) continue;
    const am = turno === 'am' ? null : fila.litros_am;
    const pm = turno === 'pm' ? null : fila.litros_pm;
    if (am == null && pm == null) {
      plan.borrarIds.push(fila.id);
      continue;
    }
    plan.actualizaciones.push({
      id: fila.id,
      litros_am: am,
      litros_pm: pm,
      litros_total: sumaTurnos(am, pm),
    });
  }
  return plan;
}
