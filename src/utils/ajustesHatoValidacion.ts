// ARCHIVO: utils/ajustesHatoValidacion.ts
// DESCRIPCIÓN: Capa pura entre el formulario de `AjustesHato` (Configuración
// → Hato, Épica H, S10) y `hato_config`. Dos responsabilidades, sin I/O:
//
//   1. `serializarAjustesHato` — traduce el estado del formulario a las
//      filas `{ clave, valor }` EXACTAS que la tabla espera, en las mismas
//      formas que sembraron las migraciones 058/062/064.
//   2. `validarAjustesHatoParaMotor` — antes de guardar, hace pasar esas
//      filas por el lector estricto del motor (`construirHatoConfigDesdeFilas`,
//      el mismo que usan los hooks de S4/S5) para detectar en el cliente,
//      con un mensaje en español, cualquier forma que rompería el motor --
//      nunca dejar que la UI de Ajustes escriba algo que el motor no pueda
//      volver a leer.
//
// `dia_pesaje_semanal` y `retencion_ica_leche` se serializan como filas más
// de `hato_config` pero se EXCLUYEN de la validación contra el motor:
// `construirHatoConfigDesdeFilas` no las conoce a propósito (ver cabecera de
// `hatoConfigDesdeTabla.ts` -- `dia_pesaje_semanal` sirve al backfill de
// leche/S5, `retencion_ica_leche` sirve a `fn_hato_guardar_quincena_venta`
// migración 085, D-11 -- ninguna de las dos al motor de fechas). Validarlas
// ahí haría fallar el guardado por una clave que el motor nunca reclama.
//
// Regla dura heredada de `hatoConfigDesdeTabla.ts`: ninguna clave faltante o
// mal tipada se guarda en silencio -- `validarAjustesHatoParaMotor` relanza el
// mismo error que el motor lanzaría en producción, para que el problema
// aparezca en el formulario, no en el tablero de otro usuario.

import { construirHatoConfigDesdeFilas, type FilaHatoConfig } from './hatoConfigDesdeTabla';
import type { HatoConfig } from './calculosHato';

/** `hato_config.dia_pesaje_semanal` (migración 064) -- 1=lunes … 7=domingo
 * (ISO-8601), más el nombre en español para que la UI no tenga que mapear. */
export interface DiaPesajeSemanal {
  iso: number;
  nombre: string;
}

/** Estado del formulario de Ajustes -- ya en los tipos "de negocio" (números,
 * no strings de un `<input>`); la conversión desde el estado bruto de los
 * campos de texto vive en el componente, igual que `EditarAnimalDialog`. */
export interface AjustesHatoForm {
  razas: string[];
  /** Debe incluir `_default` -- lo exige `construirHatoConfigDesdeFilas`. */
  mesesSecadoPorRaza: Record<string, number>;
  mesesGestacionDefault: number;
  umbralPartosReemplazo: number;
  ventanaProximaSecarDias: number;
  ventanaProximoParirDias: number;
  diasPartoProximoAlerta: number;
  diasServicioSinConfirmacion: number;
  diasRechequeoDue: number;
  diasEsperaVoluntariaPostParto: number;
  diaPesajeSemanal: DiaPesajeSemanal;
  /** Retención de ICA sobre la venta de leche (D-11, migración 085),
   * expresada como PORCENTAJE (2.25, no 0.0225) -- más legible en el
   * formulario. `serializarAjustesHato` la convierte a fracción antes de
   * guardar en `hato_config` (donde `fn_hato_guardar_quincena_venta` la
   * lee como fracción). */
  retencionIcaLechePorcentaje: number;
}

/** Clave reservada para `dia_pesaje_semanal` -- ninguna de las dos fila
 * serializadas de esta constante y `CLAVE_RETENCION_ICA_LECHE` participa en
 * `validarAjustesHatoParaMotor` (ver cabecera del archivo). */
export const CLAVE_DIA_PESAJE_SEMANAL = 'dia_pesaje_semanal' as const;
export const CLAVE_RETENCION_ICA_LECHE = 'retencion_ica_leche' as const;

/**
 * Traduce `AjustesHatoForm` a las 12 filas `{clave, valor}` que se persisten
 * en `hato_config` (UPDATE-por-clave, nunca upsert -- ver
 * `useAjustesHato.ts`). El orden no importa para el guardado, pero se
 * mantiene el mismo orden de las migraciones 058/062/064/085 por
 * legibilidad.
 */
export function serializarAjustesHato(form: AjustesHatoForm): FilaHatoConfig[] {
  return [
    { clave: 'razas', valor: form.razas },
    { clave: 'meses_secado_por_raza', valor: form.mesesSecadoPorRaza },
    { clave: 'meses_gestacion_default', valor: form.mesesGestacionDefault },
    { clave: 'umbral_partos_reemplazo', valor: form.umbralPartosReemplazo },
    { clave: 'ventana_proxima_secar_dias', valor: form.ventanaProximaSecarDias },
    { clave: 'ventana_proximo_parir_dias', valor: form.ventanaProximoParirDias },
    { clave: 'dias_parto_proximo_alerta', valor: form.diasPartoProximoAlerta },
    { clave: 'dias_servicio_sin_confirmacion', valor: form.diasServicioSinConfirmacion },
    { clave: 'dias_rechequeo_due', valor: form.diasRechequeoDue },
    { clave: 'dias_espera_voluntaria_post_parto', valor: form.diasEsperaVoluntariaPostParto },
    { clave: CLAVE_DIA_PESAJE_SEMANAL, valor: form.diaPesajeSemanal },
    { clave: CLAVE_RETENCION_ICA_LECHE, valor: form.retencionIcaLechePorcentaje / 100 },
  ];
}

/**
 * Round-trip contra el lector estricto del motor (`construirHatoConfigDesdeFilas`,
 * la misma función que usan los hooks del hato en producción). Excluye
 * `dia_pesaje_semanal` a propósito (ver cabecera). Lanza si alguna fila no
 * satisface el contrato -- el caller (hook de guardado) debe abortar el
 * guardado y mostrar el mensaje, nunca persistir de todas formas.
 */
export function validarAjustesHatoParaMotor(filas: FilaHatoConfig[]): HatoConfig {
  const filasParaMotor = filas.filter(
    (f) => f.clave !== CLAVE_DIA_PESAJE_SEMANAL && f.clave !== CLAVE_RETENCION_ICA_LECHE,
  );
  return construirHatoConfigDesdeFilas(filasParaMotor);
}

/**
 * Construye `AjustesHatoForm` desde las filas crudas de `hato_config`
 * (inverso parcial de `serializarAjustesHato`, usado por `useAjustesHato.ts`
 * para poblar el formulario al abrir la pantalla). A diferencia del lector
 * estricto del motor, esto NO lanza por una clave faltante -- el formulario
 * debe poder abrir y mostrar un campo vacío/editable aunque una clave nueva
 * (H3) todavía no tenga fila en la tabla; el guardado sí queda protegido por
 * `validarAjustesHatoParaMotor`.
 */
export function formularioDesdeFilas(filas: FilaHatoConfig[]): AjustesHatoForm {
  const porClave = new Map<string, unknown>(filas.map((f) => [f.clave, f.valor]));

  const numero = (clave: string, porDefecto: number): number => {
    const v = porClave.get(clave);
    return typeof v === 'number' && Number.isFinite(v) ? v : porDefecto;
  };

  const razasValor = porClave.get('razas');
  const razas = Array.isArray(razasValor) && razasValor.every((r) => typeof r === 'string')
    ? (razasValor as string[])
    : [];

  const mesesValor = porClave.get('meses_secado_por_raza');
  const mesesSecadoPorRaza =
    typeof mesesValor === 'object' && mesesValor !== null && !Array.isArray(mesesValor)
      ? Object.fromEntries(
          Object.entries(mesesValor as Record<string, unknown>).filter(
            (entry): entry is [string, number] => typeof entry[1] === 'number',
          ),
        )
      : { _default: 2 };
  if (!('_default' in mesesSecadoPorRaza)) mesesSecadoPorRaza._default = 2;

  const diaPesajeValor = porClave.get(CLAVE_DIA_PESAJE_SEMANAL) as { iso?: unknown; nombre?: unknown } | undefined;
  const diaPesajeSemanal: DiaPesajeSemanal =
    diaPesajeValor && typeof diaPesajeValor.iso === 'number'
      ? { iso: diaPesajeValor.iso, nombre: typeof diaPesajeValor.nombre === 'string' ? diaPesajeValor.nombre : '' }
      : { iso: 3, nombre: 'miercoles' };

  const retencionIcaValor = porClave.get(CLAVE_RETENCION_ICA_LECHE);
  // Guardada como fracción (0.0225); el formulario la muestra como
  // porcentaje (2.25) -- default 2.25% si la clave no existe todavía en
  // este entorno (migración 085 no aplicada).
  const retencionIcaLechePorcentaje =
    typeof retencionIcaValor === 'number' && Number.isFinite(retencionIcaValor) ? retencionIcaValor * 100 : 2.25;

  return {
    razas,
    mesesSecadoPorRaza,
    mesesGestacionDefault: numero('meses_gestacion_default', 9),
    umbralPartosReemplazo: numero('umbral_partos_reemplazo', 9),
    ventanaProximaSecarDias: numero('ventana_proxima_secar_dias', 30),
    ventanaProximoParirDias: numero('ventana_proximo_parir_dias', 30),
    diasPartoProximoAlerta: numero('dias_parto_proximo_alerta', 14),
    diasServicioSinConfirmacion: numero('dias_servicio_sin_confirmacion', 45),
    diasRechequeoDue: numero('dias_rechequeo_due', 60),
    diasEsperaVoluntariaPostParto: numero('dias_espera_voluntaria_post_parto', 60),
    diaPesajeSemanal,
    retencionIcaLechePorcentaje,
  };
}
