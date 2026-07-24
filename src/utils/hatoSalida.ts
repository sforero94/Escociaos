// ARCHIVO: utils/hatoSalida.ts
// DESCRIPCIÓN: Lógica pura del flujo venta/muerte de un animal del hato
// (S9, plan docs/plan_hato_lechero_module.md §7.2/§8). Construye el payload
// de `hato_eventos` (capa append-only, migración 053) para los dos tipos de
// salida y el `estado` (`hato_animales`, migración 053) al que el animal
// pasa en cada caso. Cero imports de Supabase -- la escritura vive en
// `hooks/useRegistrarSalidaHato.ts`.
//
// `tipo` usa EXACTAMENTE los valores del CHECK de `hato_eventos.tipo`
// (migración 053): 'venta' | 'muerte' (entre otros). `estado` usa
// EXACTAMENTE los valores del CHECK de `hato_animales.estado`: 'vendida' |
// 'muerta' (entre otros).

import type { EstadoAnimalHato } from '@/types/hato';

export type TipoSalidaHato = 'venta' | 'muerte';

/** Payload para `INSERT INTO hato_eventos` -- solo las columnas que este
 * flujo llena; `created_by` se agrega en el hook (necesita el usuario
 * autenticado, que no es lógica pura). */
export interface EventoSalidaHatoPayload {
  animal_id: string;
  tipo: TipoSalidaHato;
  fecha: string;
  fecha_confianza: 'exacta';
  transaccion_ganado_id: string | null;
  datos: Record<string, unknown> | null;
  fuente: 'web';
}

/** Mapa único `tipo de salida -> estado resultante`, en línea con el CHECK
 * de `hato_animales.estado` (migración 053). Nunca se toca `numero` -- la
 * migración 066 ya libera la caravana al cambiar `estado` fuera de
 * `'activa'` vía el índice único parcial. */
const ESTADO_TRAS_SALIDA: Record<TipoSalidaHato, EstadoAnimalHato> = {
  venta: 'vendida',
  muerte: 'muerta',
};

export function estadoTrasSalida(tipo: TipoSalidaHato): EstadoAnimalHato {
  return ESTADO_TRAS_SALIDA[tipo];
}

/** Evento `venta`: la fecha y el vínculo financiero vienen de la
 * transacción ya guardada en `fin_transacciones_ganado` (nunca se re-digita
 * la fecha -- una sola fuente de verdad para "cuándo se vendió"). */
export function construirEventoVentaHato(
  animalId: string,
  fechaTransaccion: string,
  transaccionGanadoId: string,
): EventoSalidaHatoPayload {
  return {
    animal_id: animalId,
    tipo: 'venta',
    fecha: fechaTransaccion,
    fecha_confianza: 'exacta',
    transaccion_ganado_id: transaccionGanadoId,
    datos: null,
    fuente: 'web',
  };
}

/** Evento `muerte`: no hay transacción financiera -- la fecha y la causa
 * (opcional) se capturan directo en el diálogo. `causa` vacía o solo
 * espacios se guarda como `datos: null`, no como `{ causa: '' }`. */
export function construirEventoMuerteHato(
  animalId: string,
  fecha: string,
  causa?: string,
): EventoSalidaHatoPayload {
  const causaLimpia = causa?.trim();
  return {
    animal_id: animalId,
    tipo: 'muerte',
    fecha,
    fecha_confianza: 'exacta',
    transaccion_ganado_id: null,
    datos: causaLimpia ? { causa: causaLimpia } : null,
    fuente: 'web',
  };
}

/** `true` si `fecha` es posterior a `fechaReferencia` (ambas `YYYY-MM-DD` --
 * la comparación lexicográfica de ISO date-only es válida y evita el
 * desfase de timezone de `new Date(fecha)`). Usada para bloquear una fecha
 * de muerte futura en `MuerteAnimalDialog`. */
export function esFechaFutura(fecha: string, fechaReferencia: string): boolean {
  return fecha > fechaReferencia;
}
