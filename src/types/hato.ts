// ARCHIVO: types/hato.ts
// DESCRIPCIÓN: Formas de fila (Supabase) del módulo Hato Lechero. Espejo
// 1:1 de las columnas creadas en las migraciones 053-062
// (docs/plan_hato_lechero_module.md §7.1) -- NO redefine tipos de negocio
// que ya viven en `src/utils/calculosHato.ts` (HatoConfig,
// EstadoReproductivo, TipoEventoHato, TipoEstado, etc.), solo los reexporta
// donde hace falta para que los componentes tengan un único punto de import.
//
// Secciones: fichas/chequeos/eventos (S4) y producción (S5 — pesaje
// semanal + quincenal). Otras sesiones (S6, S10) añaden aquí sus propios
// tipos según lo necesiten.

import type { TipoEventoHato, CriaDestino, TipoEstado } from '@/utils/calculosHato';

export type { TipoEventoHato, CriaDestino, TipoEstado };

export type EtapaHato = 'ternera' | 'novilla' | 'vaca' | 'toro';
export type EstadoAnimalHato = 'activa' | 'vendida' | 'muerta' | 'descartada';
export type SexoHato = 'hembra' | 'macho';
export type ConfianzaFecha = 'exacta' | 'aproximada' | 'desconocida';
export type ConfianzaIdentidad = 'alta' | 'media' | 'baja';
export type TipoServicioHato = 'monta' | 'inseminacion';
export type OrigenAnimalHato = 'nacimiento' | 'compra' | 'importacion_historica';

/** `hato_animales` (migración 053, extendida por 092 con `etapa_forzada`). */
export interface HatoAnimalRow {
  id: string;
  numero: number | null;
  nombre: string | null;
  sexo: SexoHato;
  etapa: EtapaHato;
  raza: string | null;
  estado: EstadoAnimalHato;
  fecha_estado: string | null;
  fecha_nacimiento: string | null;
  fecha_nacimiento_confianza: ConfianzaFecha;
  madre_id: string | null;
  padre_toro_id: string | null;
  padre_id: string | null;
  finca_id: string | null;
  origen: OrigenAnimalHato | null;
  confianza: ConfianzaIdentidad;
  notas: string | null;
  /** Corrección de precedencia de las categorías calculadas (migración 092,
   * S6 D-13, 2026-08-06): cuando es `true`, `etapa` (fijada a mano desde
   * `EditarAnimalDialog`) GANA sobre el cálculo por
   * `fecha_nacimiento`/número de partos, incluso si el cálculo SÍ puede
   * resolver la edad. `false` por defecto -- el cálculo manda mientras
   * nadie fuerce la etapa explícitamente. Ver `calcularEtapaHato`
   * (`hatoCategorias.ts`). */
  etapa_forzada: boolean;
  created_at: string;
}

/** `hato_toros` (migración 053, catálogo V12). */
export interface HatoToroRow {
  id: string;
  nombre: string;
  tipo: TipoServicioHato | null;
  raza: string | null;
  activo: boolean;
}

/** `hato_eventos` (migración 053, extendida por 070 con `fin_ingreso_id`)
 * -- capa append-only, fuente de verdad del ciclo reproductivo/de vida
 * (A3/V7). */
export interface HatoEventoRow {
  id: string;
  animal_id: string;
  tipo: TipoEventoHato;
  fecha: string;
  fecha_confianza: ConfianzaFecha;
  toro_id: string | null;
  tipo_servicio: TipoServicioHato | null;
  cria_id: string | null;
  cria_destino: CriaDestino | null;
  sx_raw: string | null;
  /** `fin_ingreso_id` (migración 070) -- vínculo N:1 hacia la fila de
   * `fin_ingresos` de una venta de animales del hato (terneros/descarte).
   * `ON DELETE SET NULL`: corregir el registro financiero no borra el
   * hecho de que el animal salió del hato. `null` para todo evento que no
   * sea `venta`, o para una venta sin ingreso enlazado. */
  fin_ingreso_id: string | null;
  /** `chequeo_vaca_id` (migración 053) -- `NULL` para un evento manual
   * (marca de T4a, S9 venta/muerte); apunta a `hato_chequeo_vacas(id)`
   * cuando el evento lo derivó `fn_hato_commit_chequeo` (065) de UN
   * chequeo puntual. Ese vínculo es lo que hace que una corrección manual
   * sobre este evento CADUQUE si Martha vuelve a aprobar ese mismo
   * chequeo -- 065 borra y re-inserta solo los eventos de su propio
   * `chequeo_id` (S3 T4b, docs/plan_hato_ciclo_manual_override.md §4.4). */
  chequeo_vaca_id: string | null;
  datos: Record<string, unknown> | null;
  fuente: 'web' | 'telegram' | 'importacion' | 'alerta' | 'chequeo' | null;
  created_at: string;
}

/** Fila de `hato_correcciones` (migración 084, S3 T4b) -- traza append-only
 * de UPDATE/DELETE humanos sobre 5 tablas del módulo. Escrita
 * EXCLUSIVAMENTE por el trigger `fn_hato_registrar_correccion()`; esta app
 * solo la LEE (SELECT-only para `authenticated`, sin política de
 * escritura). `tabla` está acotado a las mismas 5 del CHECK de la
 * migración. */
export interface HatoCorreccionRow {
  id: string;
  tabla: 'hato_eventos' | 'hato_pesajes_leche' | 'hato_produccion_quincenal' | 'hato_animales' | 'hato_chequeo_vacas';
  fila_id: string;
  operacion: 'update' | 'delete';
  datos_anteriores: Record<string, unknown>;
  /** `NULL` en `operacion === 'delete'` -- no hay valor "nuevo" cuando la
   * fila desaparece. */
  datos_nuevos: Record<string, unknown> | null;
  animal_id: string | null;
  motivo: string | null;
  corregido_por: string | null;
  corregido_en: string;
}

/** `hato_chequeos` (migración 053) -- cabecera de ronda. */
export interface HatoChequeoRow {
  id: string;
  fecha: string;
  veterinario: string | null;
  estado: 'borrador' | 'cerrado';
  fuente: 'web' | 'importacion';
  sheet_ref: string | null;
  created_at: string;
}

/** `hato_chequeo_vacas` (migración 053 + `estado` de 062) -- una fila por
 * vaca por chequeo. Capa cruda (`*_raw`, texto verbatim de la planilla,
 * nunca se descarta un valor no interpretable) + capa normalizada
 * (nullable). Consumida por `useHatoAnimal.ts` (historial de la ficha) y
 * `useHatoChequeoDetalle.ts` (detalle de chequeo, §5 del Figma spec) --
 * algunas columnas (`sx_raw`, `tp_raw`, `ultima_cria_raw`) NO tienen
 * contraparte normalizada (nunca la tendrán: `sx_raw` se descompone en
 * eventos vía `descomponerSX`, `tp_raw` es una fórmula congelada que el
 * motor nunca lee -- ver nota "Pure engine" en CLAUDE.md), así que esas
 * celdas siempre muestran el dato crudo. */
export interface HatoChequeoVacaRow {
  id: string;
  chequeo_id: string;
  animal_id: string;
  // Capa cruda
  pl_raw: string | null;
  np_raw: string | null;
  ultima_cria_raw: string | null;
  sx_raw: string | null;
  fecha_servicio_raw: string | null;
  toro_raw: string | null;
  tp_raw: string | null;
  estado_raw: string | null;
  secar_raw: string | null;
  pp_raw: string | null;
  ttto_raw: string | null;
  // Capa normalizada
  pl: number | null;
  num_partos: number | null;
  fecha_servicio: string | null;
  toro: string | null;
  tipo_servicio: TipoServicioHato | null;
  meses_prenez: number | null;
  fecha_secar: string | null;
  fecha_probable_parto: string | null;
  estado: TipoEstado | null;
  created_at: string;
}

/** Fila de `v_hato_estado_actual` (migración 056, extendida por 062) tal
 * como llega de Supabase (snake_case) -- ver `EstadoActualHatoRow` en
 * calculosHato.ts para el subconjunto que el motor puro consume. Esta forma
 * agrega `animal_id`/`numero`/`nombre`, que la vista sí expone pero el motor
 * no necesita. */
export interface EstadoActualHatoViewRow {
  animal_id: string;
  numero: number | null;
  nombre: string | null;
  etapa: EtapaHato;
  raza: string | null;
  estado: EstadoAnimalHato;
  ultimo_chequeo_vaca_id: string | null;
  ultimo_chequeo_fecha: string | null;
  pl: number | null;
  meses_prenez: number | null;
  fecha_secar: string | null;
  fecha_probable_parto: string | null;
  ultimo_servicio_fecha: string | null;
  ultimo_servicio_toro_id: string | null;
  ultimo_tipo_servicio: TipoServicioHato | null;
  ultimo_parto_fecha: string | null;
  num_partos: number;
  ultimo_secado_real_fecha: string | null;
  ultima_confirmacion_prenez_fecha: string | null;
  ultimo_evento_fecha: string | null;
  ultimo_estado_chequeo: TipoEstado | null;
  /** `fecha_nacimiento` de `hato_animales` (migración 089, S6 D-13) --
   * columna nueva AL FINAL: `CREATE OR REPLACE VIEW` no admite reordenar ni
   * insertar en medio (mismo patrón que `ultimo_estado_chequeo`, 062).
   * Alimenta `calcularEtapaHato` (`hatoCategorias.ts`) para las categorías
   * calculadas -- `null` cuando el dato nunca se capturó. */
  fecha_nacimiento: string | null;
  /** `etapa_forzada` de `hato_animales` (migración 092, corrección de
   * precedencia D-13, 2026-08-06) -- columna nueva AL FINAL, después de
   * `fecha_nacimiento`. Cuando es `true`, `etapa` gana SIEMPRE sobre el
   * cálculo en `calcularEtapaHato`. */
  etapa_forzada: boolean;
}

// ============================================================================
// Producción (S5 — V2/V3/V4)
// ============================================================================

/** Vaca activa candidata a la grilla de pesaje semanal (D1/V2). Solo el
 * subconjunto de `hato_animales` que necesita esa grilla. */
export interface HatoVacaActiva {
  id: string;
  numero: number | null;
  nombre: string | null;
}

/** Fila de `hato_pesajes_leche` (migración 054, corregida por 061:
 * `litros_total` es el dato canónico -- una sola lectura por vaca por
 * jornada de pesaje, am+pm ya sumados). Ausencia de fila = "no pesada",
 * nunca 0 (regla D del plan §6). */
export interface HatoPesajeLeche {
  id: string;
  animal_id: string;
  fecha: string;
  litros_total: number;
  litros_am: number | null;
  litros_pm: number | null;
  fuente: string | null;
}

/** Origen del dato de una quincena (migración 070): `medido` -- capturada
 * quincena a quincena vía `fn_hato_guardar_quincena_venta`, editable y
 * enlazada 1:1 a su propio `fin_ingresos`; `derivado_mensual` -- partida
 * desde una de las 44 filas mensuales históricas por el backfill (SOW 4),
 * read-only en la UI, enlazada N:1 al ingreso mensual intacto. */
export type OrigenDatoProduccionQuincenal = 'medido' | 'derivado_mensual';

/** Procedencia de `num_vacas_ordeno` (migración 070): `medido` -- lo
 * digitó Gerencia al capturar la quincena; `derivado_chequeos` -- lo
 * calculó `reconstruirEstadoAFecha`/`contarVacasEnOrdenoAFecha` a partir
 * del histórico de chequeos bimestrales (SOW 2/4). `null` cuando
 * `num_vacas_ordeno` también es `null` (CHECK
 * `hato_prod_quincenal_vacas_origen_coherente`) -- nunca un número sin
 * procedencia declarada. */
export type OrigenNumVacasOrdeno = 'medido' | 'derivado_chequeos';

/** Fila de `hato_produccion_quincenal` (migración 054, extendida por 070
 * con el vínculo financiero + procedencia del dato): litros al camión por
 * quincena (V3/D2) — dato distinto y sin atribución cruzada con el pesaje
 * semanal por vaca (decisión del dueño, segunda ronda 2026-07-22:
 * "litros al camión mide producción del hato (venta); el pesaje por vaca
 * mide productividad individual"). NUNCA guarda dinero (plan
 * `docs/plan_hato_produccion_rework.md` §2.0) -- el valor/precio/comprador
 * viven en el `fin_ingresos` referenciado por `fin_ingreso_id`; esta tabla
 * tiene SELECT abierto a todo `authenticated`, `fin_ingresos` es
 * Gerencia-only, y Postgres no tiene RLS por columna. */
export interface HatoProduccionQuincenal {
  id: string;
  anio: number;
  mes: number;
  quincena: 1 | 2;
  fecha_inicio: string | null;
  fecha_fin: string | null;
  /** CAMBIA DE SIGNIFICADO según `origen_dato` (migración 070, decisión
   * del dueño sobre el trigger inverso retirado -- "un solo registro" es
   * ahora estructural, no sincronizado). `null` cuando
   * `origen_dato === 'medido'`: los litros reales viven en
   * `fin_ingresos.cantidad`, leídos a través de `fin_ingreso_id` -- NUNCA
   * una segunda copia que pueda divergir. NO-null (la partición del
   * backfill) cuando `origen_dato === 'derivado_mensual'`: esa fila
   * referencia un `fin_ingresos` MENSUAL sin contraparte de quincena
   * propia, así que su reparto debe guardarse aquí. CHECK
   * `hato_prod_quincenal_litros_origen_coherente` en la base impone
   * exactamente esta correspondencia. **Un consumidor que necesite "los
   * litros de esta quincena" para una fila `medido` debe leer a través
   * del FK (`fin_ingresos.cantidad`), nunca esta columna directamente.** */
  litros_total: number | null;
  litros_pomar_confirmado: number | null;
  num_vacas_ordeno: number | null;
  /** Precio bruto por litro de la liquidación de El Pomar, ANTES de la
   * retención de ICA (D-11/D-12, migración 085) -- `null` para toda fila
   * anterior a esa migración ("sin dato, nunca 0"). El precio NETO se
   * deriva en el render (`fin_ingreso.valor / litros`), igual que siempre;
   * este campo es la única forma de recuperar el bruto de una fila ya
   * guardada, para que la liquidación siga siendo auditable. */
  precio_bruto_litro: number | null;
  notas: string | null;
  fuente: string | null;
  /** `fin_ingreso_id` (070) -- vínculo duro, NOT NULL en la tabla. 1:1 con
   * `fin_ingresos` cuando `origen_dato='medido'` (índice único parcial
   * `hato_prod_quincenal_ingreso_medido_unico`); N:1 (varias quincenas al
   * mismo mensual) cuando `origen_dato='derivado_mensual'`. */
  fin_ingreso_id: string;
  origen_dato: OrigenDatoProduccionQuincenal;
  num_vacas_ordeno_origen: OrigenNumVacasOrdeno | null;
  updated_at: string | null;
  updated_by: string | null;
}

/** Payload editable del formulario de producción quincenal — subconjunto
 * de `HatoProduccionQuincenal` sin campos derivados/de sistema (`id`,
 * `fuente`, `fin_ingreso_id`, `origen_dato`, `updated_at`/`updated_by`),
 * más los campos financieros NOT NULL de `fin_ingresos` (R5) que el RPC
 * `fn_hato_guardar_quincena_venta` (070) requiere para el ingreso
 * enlazado -- ver `docs/plan_hato_produccion_rework.md` §3.2 para el
 * shape exacto del payload jsonb que el RPC espera. */
export interface ProduccionQuincenalFormData {
  anio: number;
  mes: number;
  quincena: 1 | 2;
  litros_total: number | undefined;
  litros_pomar_confirmado: number | undefined;
  num_vacas_ordeno: number | undefined;
  notas: string;
  fin_ingreso: {
    fecha: string;
    /** Bruto de la liquidación de El Pomar (D-11, migración 085) -- el RPC
     * calcula el neto (lo que se guarda en `fin_ingresos.valor`) y el ICA
     * a partir de este valor. Nunca el neto capturado a mano: eso era el
     * contrato anterior a la migración 085. */
    valor_bruto: number | undefined;
    region_id: string;
    medio_pago_id: string;
    comprador_id: string | null;
    nombre: string | null;
  };
}

/** Tipo de venta de animales del hato (decisión 7 del dueño, plan §0):
 * el Hato tiene TRES flujos de ingreso -- leche · terneros · descarte.
 * Ambos enrutan a `fin_ingresos` (nunca a `fin_transacciones_ganado`,
 * reservado a compras/muerte -- ver SOW 0) vía
 * `fn_hato_registrar_venta_animales` (070). */
export type TipoVentaAnimalesHato = 'terneros' | 'descarte';

/** Payload del diálogo de venta de animales del hato -- espejo del jsonb
 * que consume `fn_hato_registrar_venta_animales`. `animal_ids` es
 * OPCIONAL (decisión 6 del dueño): cabezas + valor son obligatorios,
 * enlazar animales específicos no. */
export interface VentaAnimalesHatoPayload {
  tipo: TipoVentaAnimalesHato;
  cabezas: number;
  valor: number;
  fecha: string;
  region_id: string;
  medio_pago_id: string;
  comprador_id: string | null;
  nombre: string | null;
  animal_ids: string[];
}

// ============================================================================
// Pajillas de inseminación (S10 — Épica G, `hato_toros`/`hato_pajillas`/
// `hato_pajillas_uso`, migraciones 053 + 057)
// ============================================================================

/** Fila de `v_hato_pajillas_stock` (migración 057) — una fila por lote de
 * pajillas (`hato_pajillas`), NUNCA agregada por toro: un mismo toro puede
 * tener varios lotes/compras. `cantidad_actual` puede ir a 0 o negativo —
 * la UI advierte, nunca bloquea registrar un uso (G3). */
export interface HatoPajillaStockRow {
  pajilla_id: string;
  toro_id: string;
  cantidad_inicial: number;
  usos: number;
  cantidad_actual: number;
}

/** Fila de `hato_pajillas_uso` (migración 057) — log append-only, `animal_id`
 * es opcional (G2: mejor registrar el uso sin la vaca que no registrarlo). */
export interface HatoPajillaUsoRow {
  id: string;
  pajilla_id: string;
  fecha_uso: string;
  animal_id: string | null;
  created_at: string;
}

/** Animal activo candidato al selector opcional de "vaca servida" (G2) —
 * mismo subconjunto mínimo que `HatoVacaActiva`, pero sin restringir por
 * etapa: una novilla también puede recibir un servicio. */
export interface HatoAnimalActivoPicker {
  id: string;
  numero: number | null;
  nombre: string | null;
}
