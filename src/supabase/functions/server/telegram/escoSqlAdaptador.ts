import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { esObjetoSql } from "./escoSqlContrato.ts";
import type { ClienteAccesoEscoSql } from "./escoSqlAcceso.ts";
import type { ClienteContextoSql } from "./escoSqlContexto.ts";
import type { ClienteConversacionSql } from "./escoSqlConversacion.ts";
import type { ClienteConfirmacionSql } from "./escoSqlConfirmacion.ts";
/** Convierte builders del SDK en los puertos concretos del canal SQL. */
export function adaptarPersistenciaEscoSql(sb: SupabaseClient) {
  // Puertos finitos: la lógica recibe filas validadas, sin expandir builders recursivos.
  const leerFilaSql = async (
    consulta: PromiseLike<{ data: unknown; error: unknown }>,
  ) => {
    const { data, error } = await consulta;
    if (data !== null && !esObjetoSql(data)) {
      throw new Error("ESCO_SQL_ROW_INVALID");
    }
    return { data, error };
  };
  const seleccionarFilaSql = (
    tabla: string,
    columnas:
      | "id"
      | "session"
      | "id,conversation_id,role,content,metadata,created_at",
  ) => ({
    maybeSingle: () =>
      leerFilaSql(sb.from(tabla).select(columnas).maybeSingle()),
    eq: (columna: string, valor: string | number | boolean) => ({
      maybeSingle: () =>
        leerFilaSql(
          sb.from(tabla).select(columnas).eq(columna, valor).maybeSingle(),
        ),
      eq: (otraColumna: string, otroValor: string | number | boolean) => ({
        maybeSingle: () =>
          leerFilaSql(
            sb.from(tabla).select(columnas).eq(columna, valor).eq(
              otraColumna,
              otroValor,
            ).maybeSingle(),
          ),
      }),
    }),
  });
  type FiltroAccesoSql = ReturnType<
    ReturnType<ClienteAccesoEscoSql["from"]>["select"]
  >;
  const seleccionarAccesoSql = (
    tabla: string,
    columnas: string,
    filtros: Array<[string, string | number | boolean]> = [],
  ): FiltroAccesoSql => ({
    eq: (columna, valor) =>
      seleccionarAccesoSql(tabla, columnas, [...filtros, [columna, valor]]),
    maybeSingle: async () => {
      let consulta = sb.from(tabla).select(columnas);
      for (const [columna, valor] of filtros) {
        consulta = consulta.eq(columna, valor);
      }
      return await leerFilaSql(consulta.maybeSingle());
    },
  });
  const acceso: ClienteAccesoEscoSql = {
    from: (tabla) => ({
      select: (columnas) => seleccionarAccesoSql(tabla, columnas),
    }),
  };
  const contextoSql: ClienteContextoSql = {
    from: (tabla) => ({
      select: (columnas) => seleccionarFilaSql(tabla, columnas),
      insert: async (fila) => {
        const { error } = await sb.from(tabla).insert(fila);
        return { error };
      },
      upsert: async (fila, opciones) => {
        const { error } = await sb.from(tabla).upsert(fila, opciones);
        return { error };
      },
    }),
  };
  const conversacionesSql: ClienteConversacionSql = {
    from: (tabla) => ({
      select: (columnas) => seleccionarFilaSql(tabla, columnas),
      insert: (fila) => ({
        select: (columnas) => ({
          single: () =>
            leerFilaSql(sb.from(tabla).insert(fila).select(columnas).single()),
        }),
      }),
    }),
  };
  const confirmacionSql: ClienteConfirmacionSql = {
    from: (tabla) => ({
      select: (columnas) => seleccionarFilaSql(tabla, columnas),
      upsert: async (filas, opciones) => {
        const { error } = await sb.from(tabla).upsert(filas, opciones);
        return { error };
      },
    }),
  };
  return { acceso, contextoSql, conversacionesSql, confirmacionSql };
}
