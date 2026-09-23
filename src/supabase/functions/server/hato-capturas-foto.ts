// hato-capturas-foto.ts — registro de cada INTENTO de carga por foto del
// Hato Lechero (hallazgo ESCO-76, migración 146).
//
// POR QUÉ EXISTE: las dos rutas de foto del módulo (`/hato/pesaje/foto` y
// `/hato/chequeo/foto`) guardaban la foto en Storage y devolvían un diff,
// sin dejar NINGÚN rastro de qué pasó después. Una carga sin filas de
// dominio al lado podía ser "el OCR no leyó nada", "el usuario no aprobó",
// "el servidor falló" o "sí escribió, en otro mes" -- las cuatro idénticas
// desde afuera. Medido contra producción el 2026-09-13: 9 cargas de pesaje
// en Storage y ningún pesaje escrito después del 2026-08-29.
//
// MISMO PATRÓN QUE LA MIGRACIÓN 116 (`hato_alertas_tick_runs`,
// instrumentación del tick de alertas), que es el precedente que el
// hallazgo manda replicar. De ahí se hereda la regla más importante:
// **el registro NUNCA aborta ni cambia el flujo que instrumenta.** Si el
// INSERT falla, se registra en consola y la carga sigue -- perder la
// traza es malo, perder el pesaje de Martha es peor.
//
// ORDEN OBLIGATORIO, y es el punto entero del hallazgo:
//   1. subir las fotos a Storage (capa cruda),
//   2. `registrarCapturaFoto` -> fila `pendiente`,
//   3. recién entonces llamar al modelo de visión.
// Registrar después del OCR dejaría invisible justo el caso que motivó
// todo esto (el modelo falla y nadie se entera).
//
// Este archivo es I/O puro contra una sola tabla; no hay lógica de negocio
// que testear desde Vitest. La guarda de que el orden se respeta vive en
// `src/__tests__/hatoCapturasFoto.test.ts` (estática, sobre los dos
// árboles de edge function).

import { createClient } from 'jsr:@supabase/supabase-js@2';

type SupabaseAdmin = ReturnType<typeof createClient>;

const TABLA = 'hato_capturas_foto';

// `liquidacion` entró con la migración 160 (hallazgo ESCO-115): la
// liquidación quincenal de leche de El Pomar es la tercera ruta de foto
// del módulo, y era la única sin registro de intentos.
export type TipoCapturaFoto = 'pesaje' | 'chequeo' | 'liquidacion';
export type OrigenCapturaFoto = 'web' | 'telegram';
/** `abandonado` existe en el CHECK de la 146 pero hoy no lo escribe nadie:
 * una carga que el usuario nunca aprueba se queda en `pendiente`, que ya
 * es la señal accionable. Ver la cabecera de la migración. */
export type DesenlaceCapturaFoto = 'pendiente' | 'ok' | 'ocr_fallo' | 'abandonado' | 'error';

export interface EntradaRegistroCapturaFoto {
  supabase: SupabaseAdmin;
  tipo: TipoCapturaFoto;
  origen: OrigenCapturaFoto;
  /** Usuario verificado de la sesión (o `telegram_usuarios.usuario_id`).
   * Los dos caminos escriben con `service_role`, donde `auth.uid()` es
   * NULL y ningún trigger de atribución dispara. */
  createdBy: string | null;
  storage: {
    bucket: string;
    prefijo: string;
    /** Una entrada por foto: la ruta, o `null` si ese upload falló. */
    rutas: ReadonlyArray<string | null>;
    errores: ReadonlyArray<string>;
  };
  fotosRecibidas: number;
  modelo: string;
  anio?: number | null;
  mes?: number | null;
  fecha?: string | null;
}

export interface EntradaCierreCapturaFoto {
  supabase: SupabaseAdmin;
  /** `null` cuando el INSERT inicial falló -- el cierre entonces no hace
   * nada, sin ruido: el flujo que instrumenta ya siguió su curso. */
  capturaId: string | null;
  desenlace: DesenlaceCapturaFoto;
  celdasLeidasOcr?: number | null;
  celdasConfirmadas?: number | null;
  filasEscritas?: number | null;
  detalle?: string | null;
}

/**
 * Inserta la fila `pendiente` de una carga por foto y devuelve su id.
 *
 * Devuelve `null` si el INSERT falla (tabla ausente porque la 146 todavía
 * no se aplicó, red, RLS…): el llamador sigue igual y el `null` viaja
 * hasta `cerrarCapturaFoto`, que entonces no hace nada. NUNCA lanza.
 */
export async function registrarCapturaFoto(entrada: EntradaRegistroCapturaFoto): Promise<string | null> {
  const { supabase, storage } = entrada;
  try {
    const { data, error } = await supabase
      .from(TABLA)
      .insert({
        tipo: entrada.tipo,
        origen: entrada.origen,
        desenlace: 'pendiente',
        anio: entrada.anio ?? null,
        mes: entrada.mes ?? null,
        fecha: entrada.fecha ?? null,
        storage_bucket: storage.bucket,
        storage_prefijo: storage.prefijo,
        storage_rutas: storage.rutas.filter((r): r is string => typeof r === 'string'),
        storage_ok: storage.errores.length === 0,
        fotos_recibidas: entrada.fotosRecibidas,
        modelo: entrada.modelo,
        detalle: storage.errores.length > 0 ? `Storage: ${storage.errores.join(' | ')}` : null,
        created_by: entrada.createdBy,
      })
      .select('id')
      .single();

    if (error) {
      console.error('[hato_capturas_foto] no se pudo registrar la captura', error.message);
      return null;
    }
    return (data as { id: string }).id;
  } catch (err) {
    console.error('[hato_capturas_foto] excepción registrando la captura', err instanceof Error ? err.message : String(err));
    return null;
  }
}

/**
 * Cierra una captura con su desenlace real. Idempotente en la práctica: la
 * última llamada gana. NUNCA lanza y nunca aborta el flujo que instrumenta
 * (misma regla que el INSERT de instrumentación del tick, migración 116).
 */
export async function cerrarCapturaFoto(entrada: EntradaCierreCapturaFoto): Promise<void> {
  const { supabase, capturaId } = entrada;
  if (!capturaId) return;

  // Solo se mandan los conteos que el llamador conoce: `undefined` no
  // pisa lo que ya había, y `null` sigue significando "no se sabe" (la
  // diferencia entre "sin dato" y "midió cero" que la UI necesita).
  const parche: Record<string, unknown> = {
    desenlace: entrada.desenlace,
    actualizado_en: new Date().toISOString(),
  };
  if (entrada.celdasLeidasOcr !== undefined) parche.celdas_leidas_ocr = entrada.celdasLeidasOcr;
  if (entrada.celdasConfirmadas !== undefined) parche.celdas_confirmadas = entrada.celdasConfirmadas;
  if (entrada.filasEscritas !== undefined) parche.filas_escritas = entrada.filasEscritas;
  if (entrada.detalle !== undefined) parche.detalle = entrada.detalle;

  try {
    const { error } = await supabase.from(TABLA).update(parche).eq('id', capturaId);
    if (error) {
      console.error('[hato_capturas_foto] no se pudo cerrar la captura', capturaId, error.message);
    }
  } catch (err) {
    console.error(
      '[hato_capturas_foto] excepción cerrando la captura',
      capturaId,
      err instanceof Error ? err.message : String(err),
    );
  }
}
