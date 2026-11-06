// Resolver compartido mínimo: conserva la semántica del módulo, sin dinero ni proyección.
import type { OrigenDatoProduccionQuincenal } from '../../types/hato.ts';

/** Fila cruda de `hato_produccion_quincenal` con el embed
 * `fin_ingreso:fin_ingresos(cantidad)` (migración 070, FK `fin_ingreso_id`)
 * -- el shape mínimo que necesita `resolverLitrosQuincenal`. Espejo (no
 * mirror byte-a-byte, archivo distinto) del mismo mecanismo del lado Esco
 * (`hato-aggregation.ts::resolverLitrosQuincenal`) -- ninguno de los dos
 * importa al otro, cruzan la frontera de despliegue. */
export interface FilaProduccionQuincenalCruda {
  litros_total: number | null;
  origen_dato: OrigenDatoProduccionQuincenal;
  /** Embed `fin_ingreso:fin_ingresos(cantidad)`. `null` si la consulta no
   * lo trajo (nunca debería pasar para una fila 'medido' real, dado que
   * `fin_ingreso_id` es NOT NULL) o si el join no encontró el ingreso. */
  fin_ingreso: { cantidad: number | null } | null;
}

/**
 * Litros reales de una quincena, sin importar `origen_dato` (migración
 * 070, `COMMENT ON COLUMN hato_produccion_quincenal.litros_total`):
 * 'medido' los lee del ingreso enlazado (`fin_ingresos.cantidad`, vía el
 * embed `fin_ingreso`) -- la columna `litros_total` es NULL a propósito
 * para esas filas. 'derivado_mensual' los lee de `litros_total` (la
 * partición del backfill, que no tiene otro lugar donde vivir). Ningún
 * consumidor del frontend debe leer `fila.litros_total` directo -- siempre
 * a través de esta función.
 */
export function resolverLitrosQuincenal(fila: FilaProduccionQuincenalCruda): number | null {
  return fila.origen_dato === 'medido' ? (fila.fin_ingreso?.cantidad ?? null) : fila.litros_total;
}

