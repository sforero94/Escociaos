// esco-consultas — motor SQL (modo `motor: 'sql'`).
//
// Se ejecuta DESPUÉS de la puerta de acceso de manejador.ts (JWT válido + Gerencia activa).
// Un parser determinista convierte el SQL a IR. PostgreSQL valida y compila de nuevo
// esa estructura (migración 194); el texto del modelo nunca llega a EXECUTE.
// La puerta web usa JWT del usuario; Telegram usa la RPC de actor autorizada.
import {
  convertirSqlSeguro,
  ErrorConsultaSegura,
} from "../../../src/utils/escoSql/consultaSegura.ts";
import type { ClienteLLM, RespuestaLLM } from "../../../src/utils/esco2/llm.ts";
import { normalizarHistorialEfectivoSql } from "../../../src/utils/escoSql/historial.ts";
import {
  type ContextoTurnoSql,
  crearContextoTurnoSql,
  type ReciboTurnoSql,
} from "../../../src/utils/escoSql/turno.ts";
import {
  ErrorAccesoSql,
  ErrorSql,
  type EventoProgresoSql,
  type MensajeHistorialSql,
  responderPregunta,
  type ResultadoSql,
} from "../../../src/utils/escoSql/loop.ts";

/** Contabilidad request-local: los recibos incompletos nunca producen un total conocido. */
export function observarClienteSql(llm: ClienteLLM) {
  let llamadas = 0;
  let entrada = 0;
  let salida = 0;
  let observadoUsd = 0;
  let llamadasConCoste = 0;
  let llamadasSinCoste = 0;
  const cliente: ClienteLLM = {
    async completar(solicitud): Promise<RespuestaLLM> {
      let resultado: RespuestaLLM;
      try {
        resultado = await llm.completar(solicitud);
      } catch (error) {
        llamadasSinCoste++;
        throw error;
      }
      const u = resultado.uso;
      if (
        !u || !Number.isSafeInteger(u.entrada) || u.entrada < 0 ||
        !Number.isSafeInteger(u.salida) || u.salida < 0 ||
        !Number.isSafeInteger(entrada + u.entrada) ||
        !Number.isSafeInteger(salida + u.salida)
      ) {
        llamadasSinCoste++;
        throw new Error("USO_SQL_INVALIDO");
      }
      llamadas++;
      entrada += u.entrada;
      salida += u.salida;
      const costeValido = typeof u.costoUsd === "number" &&
        Number.isFinite(u.costoUsd) && u.costoUsd >= 0 &&
        Number.isFinite(observadoUsd + u.costoUsd);
      if (costeValido) {
        observadoUsd += u.costoUsd!;
        llamadasConCoste++;
      } else llamadasSinCoste++;
      return {
        ...resultado,
        uso: { ...u, costoUsd: costeValido ? u.costoUsd : null },
      };
    },
  };
  const uso = () =>
    llamadas
      ? {
        llamadas,
        entrada,
        salida,
        costoUsd: llamadasSinCoste ? null : observadoUsd,
      }
      : null;
  const coste = () => ({
    estado:
      (llamadasConCoste
        ? llamadasSinCoste ? "parcial" : "completo"
        : "desconocido") as "completo" | "parcial" | "desconocido",
    observadoUsd: llamadasConCoste ? observadoUsd : null,
    llamadasConCoste,
    llamadasSinCoste,
  });
  return { cliente, uso, coste };
}

/** Forma mínima de supabase-js que usa el motor SQL. */
export interface ClienteRpc {
  rpc(
    nombre: string,
    args: Record<string, unknown>,
  ): PromiseLike<
    { data: unknown; error: { code?: string; message?: string } | null }
  >;
}

export function tieneRpc(cliente: unknown): cliente is ClienteRpc {
  return typeof (cliente as { rpc?: unknown })?.rpc === "function";
}

/** Solo envía IR a la RPC segura. No existe fallback a la RPC de SQL arbitrario. */
export function ejecutorSqlSupabase(
  cliente: ClienteRpc,
  usuarioIdActor?: string,
): (sql: string) => Promise<ResultadoSql> {
  return async (sql) => {
    let consulta;
    try {
      consulta = convertirSqlSeguro(sql);
    } catch (e) {
      if (e instanceof ErrorConsultaSegura) {
        throw new ErrorSql(e.codigo, "22023");
      }
      throw new ErrorSql("sql_invalido", "22023");
    }
    const nombre = usuarioIdActor
      ? "esco_sql_consultar_actor_v1"
      : "esco_sql_consultar_v1";
    const args = usuarioIdActor
      ? { p_usuario: usuarioIdActor, p_consulta: consulta }
      : { p_consulta: consulta };
    const { data, error } = await cliente.rpc(nombre, args);
    if (error) {
      if (error.code === "42501") {
        throw new ErrorAccesoSql(error.message ?? "sin permiso");
      }
      const cerrados = [
        "sql_invalido",
        "version_no_admitida",
        "nodo_no_admitido",
        "relacion_no_admitida",
        "columna_no_admitida",
        "tipo_no_admitido",
        "limite_excedido",
      ];
      const motivo = error.code === "22023"
        ? (error.message && cerrados.includes(error.message)
          ? error.message
          : "consulta_no_admitida")
        : (error.message ?? "error de base de datos");
      throw new ErrorSql(motivo, error.code);
    }
    const d = data as
      | { filas?: unknown; n_filas?: unknown; truncado?: unknown }
      | null;
    if (!d || !Array.isArray(d.filas) || typeof d.n_filas !== "number") {
      throw new ErrorSql("respuesta inesperada del ejecutor seguro");
    }
    return {
      filas: d.filas as Record<string, unknown>[],
      n_filas: d.n_filas,
      truncado: d.truncado === true,
    };
  };
}

export interface SalidaSql {
  estado: number;
  cuerpo: Record<string, unknown>;
}

export async function manejarSql(entrada: {
  cliente: unknown;
  usuarioIdActor?: string;
  llm: ClienteLLM;
  pregunta: string;
  historial: MensajeHistorialSql[];
  hoy: string;
  contextoTurno?: ContextoTurnoSql;
  modelo?: { modelo: string; esfuerzo: "none" | "low" | "medium" };
  registrar?: (evento: Record<string, unknown>) => void;
  onEvento?: (evento: EventoProgresoSql) => void;
  signal?: AbortSignal;
}): Promise<SalidaSql> {
  // El handler público entrega el contexto creado después de autorizar la puerta.
  // La alternativa existe para llamantes internos/pruebas de este adaptador.
  const historial = normalizarHistorialEfectivoSql(entrada.historial);
  const contexto = entrada.contextoTurno ??
    await crearContextoTurnoSql(
      entrada.usuarioIdActor ? "telegram" : "web",
      historial,
    );
  const observacion = observarClienteSql(entrada.llm);
  const inicio = Date.now();
  let numeroConsultas = 0;
  let erroresConsultas = 0;
  const terminar = (
    estadoHttp: number,
    cuerpo: Record<string, unknown>,
    estado: ReciboTurnoSql["estado"],
  ): SalidaSql => {
    const usoObservado = observacion.uso();
    const costeObservado = observacion.coste();
    const uso = usoObservado;
    const coste = costeObservado;
    const recibo: ReciboTurnoSql = {
      version: 1,
      ...contexto,
      estado,
      uso,
      coste,
    };
    entrada.registrar?.({
      funcion: "esco-consultas",
      evento: "turno_sql",
      turno_id: recibo.turno_id,
      canal: recibo.canal,
      estado: recibo.estado,
      uso,
      coste: recibo.coste,
      consultas: numeroConsultas,
      errores: erroresConsultas,
      llamadas: uso?.llamadas ?? null,
      ms: Date.now() - inicio,
      costoUsd: uso?.costoUsd ?? null,
    });
    return { estado: estadoHttp, cuerpo: { ...cuerpo, uso, recibo } };
  };
  if (!tieneRpc(entrada.cliente)) {
    return terminar(503, {
      error: "El motor SQL no está disponible en este entorno",
    }, "error");
  }
  try {
    const r = await responderPregunta({
      pregunta: entrada.pregunta,
      historial,
      llm: observacion.cliente,
      ejecutarSql: ejecutorSqlSupabase(entrada.cliente, entrada.usuarioIdActor),
      hoy: entrada.hoy,
      config: entrada.modelo,
      onEvento: (evento) => {
        numeroConsultas = Math.max(numeroConsultas, evento.consulta);
        if (evento.type === "consulta_fin" && !evento.ok) erroresConsultas++;
        entrada.onEvento?.(evento);
      },
      signal: entrada.signal,
      registrarRechazoVisual: (motivo) =>
        entrada.registrar?.({
          funcion: "esco-consultas",
          evento: "visual_descartado",
          turno_id: contexto.turno_id,
          canal: contexto.canal,
          motivo,
        }),
    });
    numeroConsultas = r.consultas.length;
    erroresConsultas = r.consultas.filter((c) => c.error).length;
    const consultas = r.consultas.map((
      { filas_muestra: _muestra, ...consulta },
    ) => consulta);
    return terminar(200, {
      motor: "sql",
      texto: r.texto,
      respuesta: r.respuesta,
      bloques: r.bloques,
      sugerencias: r.sugerencias,
      ...(r.aclaracion ? { aclaracion: r.aclaracion } : {}),
      consultas,
      ms: r.ms,
      hoy: entrada.hoy,
    }, "completado");
  } catch (e) {
    const estado =
      entrada.signal?.aborted || (e instanceof Error && e.name === "AbortError")
        ? "cancelado"
        : "error";
    if (e instanceof ErrorAccesoSql) {
      erroresConsultas++;
      return terminar(
        403,
        { error: "Esco está disponible solo para gerencia" },
        estado,
      );
    }
    if (e instanceof ErrorSql && e.codigo === "PGRST202") {
      erroresConsultas++;
      return terminar(503, {
        error: "El motor SQL no está disponible: falta la migración 194",
      }, estado);
    }
    return terminar(502, {
      error: "No se pudo completar la consulta. Intenta de nuevo.",
    }, estado);
  }
}
