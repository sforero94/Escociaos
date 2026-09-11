// ARCHIVO: utils/hatoAlertasGestor.ts
// DESCRIPCIÓN: Lógica pura del gestor web de alertas (issue #217) —
// validar crear/editar, qué botones caben en cada fila, agrupación por
// tema, y la forma de `regla_clave` de una alerta manual. No decide
// umbrales clínicos ni a quién se le manda Telegram (eso sigue en
// hatoAlertas.ts + suscripciones).
//
// Superficie de producto: Activas / Completadas. Rechequeo y parto próximo
// son informativos (nombres, sin botones). Secado y tratamiento son por
// vaca. "Edit" = `fecha_programada` + nota en `datos`, nunca el animal.

import {
  TIPOS_ALERTA_TELEGRAM_CAMPO,
  puedeResponderAlerta,
  type EstadoAlertaHato,
  type TipoAlertaHato,
} from '@/utils/hatoAlertas';

export const TIPOS_ALERTA_MANUAL: readonly TipoAlertaHato[] = [
  'secado_due',
  'tratamiento_paso',
  'rechequeo_due',
  'servicio_sin_confirmacion',
  'parto_proximo',
];

/** `rechequeo_due` is the herd-level rule — animal is optional. Every other
 * manual type needs a cow, otherwise Fernando/Martha cannot act on it. */
export function tipoAlertaRequiereAnimal(tipo: TipoAlertaHato): boolean {
  return tipo !== 'rechequeo_due';
}

const FECHA_ISO = /^\d{4}-\d{2}-\d{2}$/;

export function esFechaIso(valor: string): boolean {
  return FECHA_ISO.test(valor);
}

export interface InputAlertaManual {
  tipo: TipoAlertaHato;
  animalId: string | null;
  fechaProgramada: string;
  nota: string;
  idUnico: string;
}

export interface FilaAlertaManual {
  tipo: TipoAlertaHato;
  animal_id: string | null;
  regla_clave: string;
  fecha_programada: string;
  estado: 'pendiente';
  datos: { origen: 'manual'; nota?: string };
}

export type ResultadoValidacionAlertaManual =
  | { ok: true; fila: FilaAlertaManual }
  | { ok: false; error: string };

export function construirReglaClaveManual(
  tipo: TipoAlertaHato,
  animalId: string | null,
  fechaProgramada: string,
  idUnico: string,
): string {
  return `manual:${tipo}:${animalId ?? 'hato'}:${fechaProgramada}:${idUnico}`;
}

export function validarAlertaManual(input: InputAlertaManual): ResultadoValidacionAlertaManual {
  if (!(TIPOS_ALERTA_MANUAL as readonly string[]).includes(input.tipo)) {
    return { ok: false, error: 'Elige un tipo de alerta.' };
  }
  if (!esFechaIso(input.fechaProgramada)) {
    return { ok: false, error: 'La fecha programada no es válida.' };
  }
  if (!input.idUnico.trim()) {
    return { ok: false, error: 'Falta el identificador de la alerta manual.' };
  }
  if (tipoAlertaRequiereAnimal(input.tipo) && !input.animalId) {
    return { ok: false, error: 'Elige la vaca de esta alerta.' };
  }
  const nota = input.nota.trim();
  return {
    ok: true,
    fila: {
      tipo: input.tipo,
      animal_id: tipoAlertaRequiereAnimal(input.tipo) ? input.animalId : null,
      regla_clave: construirReglaClaveManual(
        input.tipo,
        tipoAlertaRequiereAnimal(input.tipo) ? input.animalId : null,
        input.fechaProgramada,
        input.idUnico.trim(),
      ),
      fecha_programada: input.fechaProgramada,
      estado: 'pendiente',
      datos: nota ? { origen: 'manual', nota } : { origen: 'manual' },
    },
  };
}

export function puedeEditarAlerta(estado: EstadoAlertaHato): boolean {
  return esAlertaActiva(estado);
}

export function puedeDescartarAlerta(estado: EstadoAlertaHato): boolean {
  return esAlertaActiva(estado);
}

/** Product surface of the manager: two states only. The DB CHECK still has
 * seven values (the tick writes them); this mapping is UI-only. */
export type VistaEstadoAlerta = 'activa' | 'completada';

export function esAlertaActiva(estado: EstadoAlertaHato): boolean {
  return estado === 'pendiente' || estado === 'enviada' || estado === 'escalada';
}

export function esAlertaCompletada(estado: EstadoAlertaHato): boolean {
  return !esAlertaActiva(estado);
}

export function vistaEstadoAlerta(estado: EstadoAlertaHato): VistaEstadoAlerta {
  return esAlertaActiva(estado) ? 'activa' : 'completada';
}

/** Rechequeo and parto próximo are herd/schedule facts: inform, no Sí/No.
 * Treatment and drying are per-cow and need a field answer. */
export function tipoAlertaInformativa(tipo: TipoAlertaHato): boolean {
  return tipo === 'rechequeo_due' || tipo === 'parto_proximo';
}

export function tipoAlertaCampo(tipo: TipoAlertaHato): boolean {
  return (TIPOS_ALERTA_TELEGRAM_CAMPO as readonly string[]).includes(tipo);
}

export const TEMAS_ALERTA_GERENCIA: readonly TipoAlertaHato[] = [
  'rechequeo_due',
  'parto_proximo',
  'servicio_sin_confirmacion',
];

export const TEMAS_ALERTA_CAMPO: readonly TipoAlertaHato[] = [
  'secado_due',
  'tratamiento_paso',
];

export interface AccionesAlertaFila {
  responder: boolean;
  editar: boolean;
  descartar: boolean;
}

export function accionesAlertaFila(
  estado: EstadoAlertaHato,
  canWrite: boolean,
  tipo?: TipoAlertaHato,
): AccionesAlertaFila {
  const sinAccion: AccionesAlertaFila = { responder: false, editar: false, descartar: false };
  if (!canWrite) return sinAccion;
  if (tipo && tipoAlertaInformativa(tipo)) return sinAccion;
  if (!esAlertaActiva(estado)) return sinAccion;
  return {
    responder: puedeResponderAlerta(estado),
    editar: puedeEditarAlerta(estado),
    descartar: puedeDescartarAlerta(estado),
  };
}

export interface NombreVacaAlerta {
  animal_id: string | null;
  numero: number | null;
  nombre: string | null;
}

export function formatearNombreVacaAlerta(vaca: NombreVacaAlerta): string {
  if (vaca.numero == null && !vaca.nombre) return 'sin caravana';
  const numeroTexto = vaca.numero != null ? `#${vaca.numero}` : 'sin caravana';
  if (vaca.nombre) return `${numeroTexto} ${vaca.nombre}`;
  return numeroTexto;
}

export function nombresDesdeDatosAlerta(
  datos: Record<string, unknown> | null,
): NombreVacaAlerta[] {
  const raw = datos?.animales;
  if (!Array.isArray(raw)) return [];
  const nombres: NombreVacaAlerta[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const fila = item as Record<string, unknown>;
    const animalId = typeof fila.animal_id === 'string' ? fila.animal_id : null;
    const numero = typeof fila.numero === 'number' ? fila.numero : null;
    const nombre = typeof fila.nombre === 'string' ? fila.nombre : null;
    nombres.push({ animal_id: animalId, numero, nombre });
  }
  return nombres;
}

export interface AlertaParaAgrupar {
  id: string;
  tipo: TipoAlertaHato;
  animal_id: string | null;
  fecha_programada: string;
  datos: Record<string, unknown> | null;
  animalNumero?: number | null;
  animalNombre?: string | null;
}

export interface GrupoInformativoAlerta<T extends AlertaParaAgrupar = AlertaParaAgrupar> {
  clave: string;
  fecha: string;
  detalle: string | null;
  nombres: NombreVacaAlerta[];
  filas: T[];
}

function nombreDesdeFila<T extends AlertaParaAgrupar>(alerta: T): NombreVacaAlerta {
  return {
    animal_id: alerta.animal_id,
    numero: alerta.animalNumero ?? null,
    nombre: alerta.animalNombre ?? null,
  };
}

/** One visible group per herd-level rechequeo row (names in `datos.animales`);
 * leftover per-cow rows (pre-2026-09-08) fold into a single extra group. */
export function agruparRechequeoInformativo<T extends AlertaParaAgrupar>(alertas: readonly T[]): GrupoInformativoAlerta<T>[] {
  const delTipo = alertas.filter((a) => a.tipo === 'rechequeo_due');
  const grupos: GrupoInformativoAlerta<T>[] = [];
  const perCow: T[] = [];

  for (const alerta of delTipo) {
    if (alerta.animal_id === null) {
      const nombres = nombresDesdeDatosAlerta(alerta.datos);
      const ultimo = alerta.datos?.ultimo_chequeo_fecha;
      grupos.push({
        clave: alerta.id,
        fecha: alerta.fecha_programada,
        detalle: typeof ultimo === 'string' ? `Último chequeo: ${ultimo}` : null,
        nombres,
        filas: [alerta],
      });
    } else {
      perCow.push(alerta);
    }
  }

  if (perCow.length > 0) {
    grupos.push({
      clave: 'rechequeo-por-vaca',
      fecha: perCow[0].fecha_programada,
      detalle: null,
      nombres: perCow.map(nombreDesdeFila),
      filas: perCow,
    });
  }
  return grupos;
}

/** Parto próximo is informational: one group, names visible, no buttons. */
export function agruparPartoInformativo<T extends AlertaParaAgrupar>(alertas: readonly T[]): GrupoInformativoAlerta<T>[] {
  const delTipo = alertas.filter((a) => a.tipo === 'parto_proximo');
  if (delTipo.length === 0) return [];
  return [{
    clave: 'parto-proximo',
    fecha: delTipo[0].fecha_programada,
    detalle: null,
    nombres: delTipo.map(nombreDesdeFila),
    filas: [...delTipo],
  }];
}

export function particionarAlertasGestor<T extends { estado: EstadoAlertaHato; tipo: TipoAlertaHato }>(
  alertas: readonly T[],
): { activas: T[]; completadas: T[]; gerencia: T[]; campo: T[] } {
  const activas = alertas.filter((a) => esAlertaActiva(a.estado));
  const completadas = alertas.filter((a) => esAlertaCompletada(a.estado));
  return {
    activas,
    completadas,
    gerencia: activas.filter((a) => !tipoAlertaCampo(a.tipo)),
    campo: activas.filter((a) => tipoAlertaCampo(a.tipo)),
  };
}

export function ordenarAlertasHistorial<T extends { updated_at: string }>(alertas: readonly T[]): T[] {
  return [...alertas].sort((a, b) => b.updated_at.localeCompare(a.updated_at));
}

export function etiquetaResultadoHistorial(alerta: {
  estado: EstadoAlertaHato;
  respuesta: string | null;
}): string {
  if (alerta.estado === 'descartada') return 'Descartada';
  const r = alerta.respuesta?.trim().toLowerCase();
  if (r === 'si' || r === 'sí') return 'Sí';
  if (r === 'no' || r?.startsWith('todavía no') || r?.startsWith('todavia no')) return 'Todavía no';
  if (r === 'otro' || r === 'otra cosa') return 'Otra cosa';
  if (alerta.respuesta?.trim()) return alerta.respuesta.trim();
  return 'Completada';
}

export function tabAlertasDesdeParam(raw: string | null): 'activas' | 'historial' | 'configuracion' {
  if (raw === 'historial') return 'historial';
  if (raw === 'configuracion' || raw === 'quien' || raw === 'tipos') return 'configuracion';
  return 'activas';
}

export interface InputEditarAlerta {
  fechaProgramada: string;
  nota: string;
}

export type ResultadoEditarAlerta =
  | { ok: true; fecha_programada: string; nota: string | null }
  | { ok: false; error: string };

export function validarEdicionAlerta(input: InputEditarAlerta): ResultadoEditarAlerta {
  if (!esFechaIso(input.fechaProgramada)) {
    return { ok: false, error: 'La fecha programada no es válida.' };
  }
  const nota = input.nota.trim();
  return { ok: true, fecha_programada: input.fechaProgramada, nota: nota || null };
}

export function validarHorasEscalamiento(valor: number): string | null {
  if (!Number.isInteger(valor) || valor < 1 || valor > 336) {
    return 'Las horas de escalamiento van de 1 a 336 (14 días).';
  }
  return null;
}

export function etiquetaCanalAlerta(tipo: TipoAlertaHato): 'campo' | 'web' {
  return (TIPOS_ALERTA_TELEGRAM_CAMPO as readonly string[]).includes(tipo) ? 'campo' : 'web';
}

/** Merge a new note into `datos` without dropping mensaje/enviada_en. */
export function datosConNotaGestor(
  datos: Record<string, unknown> | null,
  nota: string | null,
): Record<string, unknown> {
  const base = { ...(datos ?? {}) };
  if (nota) base.nota_gestor = nota;
  else delete base.nota_gestor;
  return base;
}
