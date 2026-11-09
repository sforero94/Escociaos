// Se relee acceso en cada turno y callback: los botones no conservan permisos.
interface FiltroAcceso {
  eq: (columna: string, valor: string | number | boolean) => FiltroAcceso;
  maybeSingle: () => PromiseLike<{
    data: Record<string, unknown> | null;
    error: unknown;
  }>;
}
export interface ClienteAccesoEscoSql {
  from: (tabla: string) => {
    select: (columnas: string) => FiltroAcceso;
  };
}
export async function autorizarPerfilEscoSql(
  cliente: ClienteAccesoEscoSql,
  telegramId: number,
  usuarioId: string,
  filaVinculoId: string,
): Promise<boolean> {
  try {
    const vinculo = await cliente.from("telegram_usuarios").select(
      "id,usuario_id,modulos_permitidos,activo",
    ).eq("telegram_id", telegramId).eq("activo", true).maybeSingle();
    if (
      vinculo.error || !vinculo.data || vinculo.data.id !== filaVinculoId ||
      vinculo.data.usuario_id !== usuarioId || vinculo.data.activo !== true ||
      !Array.isArray(vinculo.data.modulos_permitidos) ||
      !vinculo.data.modulos_permitidos.includes("consultas")
    ) {
      return false;
    }
    const perfil = await cliente.from("usuarios").select("id,rol,activo").eq(
      "id",
      usuarioId,
    ).maybeSingle();
    return !perfil.error && perfil.data?.id === usuarioId &&
      perfil.data.rol === "Gerencia" && perfil.data.activo === true;
  } catch {
    return false;
  }
}

/** Normaliza el thenable del SDK sin cambiar el contrato de capturas compartido. */
export function adaptarIdentidadEscoSql(
  cliente: ClienteAccesoEscoSql,
): import("./resolverUsuarioTelegram.ts").ClienteConsultaTelegram {
  return {
    from: (tabla) => ({
      select: (columnas) => ({
        eq: (columna, valor) => ({
          eq: (otraColumna, otroValor) => ({
            maybeSingle: async () => {
              const { data, error } = await cliente.from(tabla).select(columnas)
                .eq(columna, valor).eq(otraColumna, otroValor).maybeSingle();
              if (error) {
                return {
                  data: null,
                  error: { message: "TELEGRAM_IDENTITY_LOOKUP_FAILED" },
                };
              }
              if (!data) return { data: null, error: null };
              if (
                typeof data.id !== "string" ||
                (data.usuario_id !== null && data.usuario_id !== undefined &&
                  typeof data.usuario_id !== "string") ||
                (data.nombre_display !== null &&
                  data.nombre_display !== undefined &&
                  typeof data.nombre_display !== "string")
              ) {
                return {
                  data: null,
                  error: { message: "TELEGRAM_IDENTITY_LOOKUP_FAILED" },
                };
              }
              return {
                data: {
                  id: data.id,
                  usuario_id: typeof data.usuario_id === "string"
                    ? data.usuario_id
                    : null,
                  nombre_display: typeof data.nombre_display === "string"
                    ? data.nombre_display
                    : null,
                },
                error: null,
              };
            },
          }),
        }),
      }),
    }),
  };
}
