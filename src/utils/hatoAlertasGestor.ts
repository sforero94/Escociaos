// ARCHIVO: utils/hatoAlertasGestor.ts
// DESCRIPCIÓN: Lógica pura del gestor web de alertas (issue #217) —
// validar crear/editar, qué botones caben en cada fila, y la forma de
// `regla_clave` de una alerta manual. No decide umbrales clínicos ni a
// quién se le manda Telegram (eso sigue en hatoAlertas.ts + suscripciones).
//
// "Edit" = campos de la COLA (`fecha_programada` + nota en `datos`), nunca
// el animal ni un tratamiento de fondo. Corregir esos hechos es Hoja de Vida.

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
  return estado === 'pendiente' || estado === 'enviada' || estado === 'escalada' || estado === 'respondida';
}

export function puedeDescartarAlerta(estado: EstadoAlertaHato): boolean {
  return estado !== 'confirmada' && estado !== 'descartada';
}

/** Weekly-review close (Confirmar) — respondida/expirada, and escalada as
 * the leftover path when Sí is not the right verb. */
export function puedeConfirmarRevision(estado: EstadoAlertaHato): boolean {
  return estado === 'respondida' || estado === 'expirada';
}

export interface AccionesAlertaFila {
  responder: boolean;
  confirmarRevision: boolean;
  editar: boolean;
  descartar: boolean;
}

export function accionesAlertaFila(estado: EstadoAlertaHato, canWrite: boolean): AccionesAlertaFila {
  if (!canWrite) {
    return { responder: false, confirmarRevision: false, editar: false, descartar: false };
  }
  return {
    responder: puedeResponderAlerta(estado),
    confirmarRevision: puedeConfirmarRevision(estado),
    editar: puedeEditarAlerta(estado),
    descartar: puedeDescartarAlerta(estado),
  };
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
