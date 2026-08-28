// ARCHIVO: types/rondaInventario.ts
// DESCRIPCIÓN: Tipos del módulo "ronda de inventario" (decisión de producto
// 9.9 -- docs/plan_verificacion_inventario.md, docs/brief_tecnico_verificacion_inventario.md
// §4). Reflejan literalmente el esquema creado por la migración
// `125_ronda_inventario_esquema.sql`. Sólo lectura desde la web en esta fase
// (Fase 6 -- historial): los RPC de escritura (`fn_ronda_*`, Fase 2) no se
// invocan desde ningún archivo de este módulo todavía.
//
// `src/types/database.ts` (generado) no incluye las tablas `rondas_*` --
// mismo hueco documentado para `hato_*`/`gan_*` en sus respectivos módulos.
// Los hooks de este módulo castean `getSupabase() as any` en el call site,
// el mismo workaround que ya usan `useGanadoInventario.ts` y los hooks de
// `src/components/hato/hooks/`.

/** §4.1 del brief técnico. */
export type EstadoRondaInventario = 'programada' | 'en_curso' | 'cerrada' | 'omitida';

/** §4.4 del brief técnico -- CA-38 modelado como estado, no como texto. */
export type EstadoExcepcionInventario =
  | 'reportada'
  | 'explicacion_precargada'
  | 'explicada'
  | 'cerrada_sin_ajuste'
  | 'resuelta_con_captura'
  | 'ajuste_propuesto'
  | 'ajuste_aprobado'
  | 'ajuste_desestimado'
  | 'ajuste_aplicado';

/** §4.2 del brief técnico -- catálogo de causa raíz + mapeo causa->vía en la misma fila. */
export type ViaCausaRaiz = 'captura_david' | 'aprobacion_gerencia' | 'ninguna';

export interface RondaInventarioRow {
  id: string;
  periodo: string; // DATE -- primer día del mes, 'YYYY-MM-DD'
  estado: EstadoRondaInventario;
  es_linea_base: boolean;
  abierta_en: string | null;
  abierta_por_usuario: string | null;
  abierta_por_telegram: string | null;
  cerrada_en: string | null;
  cerrada_por_usuario: string | null;
  cerrada_por_telegram: string | null;
  alcance_declarado: 'completo' | 'parcial' | null;
  alcance_nota: string | null;
  observaciones_libres: unknown; // JSONB array -- forma libre (R-16/CA-14)
  created_at: string;
  updated_at: string;
}

export interface RondaInventarioAlcanceRow {
  ronda_id: string;
  producto_id: string;
  cantidad_teorica: number;
  unidad: string;
  precio_unitario: number | null;
  nombre_producto: string;
}

export interface InventarioCausaRaizRow {
  clave: string;
  etiqueta: string;
  via: ViaCausaRaiz;
  mueve_inventario: boolean;
  exige_nota: boolean;
  orden: number;
  activo: boolean;
}

export interface RondaExcepcionRow {
  id: string;
  ronda_id: string;
  transcrito_id: string | null;
  producto_id: string;
  estado: EstadoExcepcionInventario;

  cantidad_fisica: number;
  fisico_origen: 'dictado' | 'derivado';
  teorico_conteo: number;
  observacion_uriel: string | null;
  reportada_en: string;
  reportada_por_usuario: string | null;
  reportada_por_telegram: string | null;

  explicacion_citada: string | null;
  explicacion_david: string | null;
  explicacion_david_accion: 'confirmo_cita' | 'corrigio_cita' | 'explico_directo' | null;
  explicacion_david_en: string | null;
  explicacion_david_usuario: string | null;
  explicacion_david_telegram: string | null;

  captura_movimiento_id: string | null;
  captura_en: string | null;
  captura_por_usuario: string | null;
  captura_por_telegram: string | null;

  propuesta_delta: number | null;
  propuesta_causa: string | null;
  propuesta_nota: string | null;
  propuesta_en: string | null;
  propuesta_por_usuario: string | null;
  propuesta_por_telegram: string | null;

  decision_causa: string | null;
  decision_nota: string | null;
  decision_en: string | null;
  decision_por_usuario: string | null;
  decision_por_telegram: string | null;

  aplicacion_movimiento_id: string | null;
  aplicacion_en: string | null;
  aplicacion_por_usuario: string | null;
  aplicacion_por_telegram: string | null;

  via_propuesta: ViaCausaRaiz;
  causa_sugerida: string | null;
  interprete_confianza: 'alta' | 'baja' | 'ninguna';

  created_at: string;
  updated_at: string;
}
