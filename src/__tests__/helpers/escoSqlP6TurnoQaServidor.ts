// Independent integration harness: actual HTTP handler, SQL loop/parser and provider adapter.
// Only Auth/profile/RPC and the provider HTTP transport are synthetic, closed boundaries.
import { expect } from "vitest";
import {
  type ClienteUsuario,
  type Dependencias,
  manejar,
} from "../../../supabase/functions/esco-consultas/manejador.ts";
import { crearClienteOpenRouter } from "../../utils/esco2/llm.ts";
export type P6Obj = Record<string, unknown>;
export const P6ACTOR = "11111111-1111-4111-8111-111111111111";
export const P6OTHER = "22222222-2222-4222-8222-222222222222";
export const P6PRIVATE = "SYN_P6_PRIVATE_PROVIDER_DETAIL";
export interface PlanProveedorP6 {
  costes?: unknown[];
  failAt?: number;
  usageAt?: Record<number, unknown>;
  holdAt?: number;
}
export function servidorP6(
  options: {
    planes?: Record<string, PlanProveedorP6>;
    denied?: boolean;
    invalidJwt?: boolean;
    rpcDenied?: boolean;
  } = {},
) {
  const logs: P6Obj[] = [],
    providerRequests: Array<{ pregunta: string; body: P6Obj }> = [],
    rpcCalls: P6Obj[] = [],
    rejected: string[] = [];
  const steps = new Map<string, number>(),
    releases = new Map<string, () => void>();
  const pending = new Map<string, Promise<void>>();
  function release(question: string) {
    releases.get(question)?.();
  }
  function lastQuestion(body: P6Obj) {
    const messages = body.messages as P6Obj[];
    return String(
      [...messages].reverse().find((m) => m.role === "user")?.content,
    );
  }
  const providerFetch: typeof fetch = async (input, init) => {
    const request = new Request(input, { ...init, signal: undefined });
    if (
      request.url !== "https://openrouter.ai/api/v1/chat/completions" ||
      request.method !== "POST"
    ) {
      rejected.push(request.url);
      throw Error("P6_CLOSED_PROVIDER");
    }
    const body = await request.json() as P6Obj, pregunta = lastQuestion(body);
    providerRequests.push({ pregunta, body });
    const step = steps.get(pregunta) ?? 0;
    steps.set(pregunta, step + 1);
    const plan = options.planes?.[pregunta] ?? {};
    if (plan.holdAt === step) {
      const wait = new Promise<void>((resolve) =>
        releases.set(pregunta, resolve)
      );
      pending.set(pregunta, wait);
      await wait;
    }
    if (plan.failAt === step) {
      return Response.json({ error: { message: P6PRIVATE } }, { status: 502 });
    }
    const tools = step === 0
      ? [{
        id: "query",
        type: "function",
        function: {
          name: "consultar_sql",
          arguments: JSON.stringify({
            sql: "SELECT 7 AS total",
            proposito: "Control sintético",
          }),
        },
      }]
      : step === 1
      ? [{
        id: "visual",
        type: "function",
        function: {
          name: "mostrar_visual",
          arguments: JSON.stringify({
            tipo: "tarjeta",
            consulta: 1,
            items: [{ columna: "total", etiqueta: "Total", formato: "numero" }],
          }),
        },
      }]
      : [];
    const usage = Object.prototype.hasOwnProperty.call(plan.usageAt ?? {}, step)
      ? plan.usageAt![step]
      : {
        prompt_tokens: 2,
        completion_tokens: 3,
        completion_tokens_details: { reasoning_tokens: 0 },
        cost: (plan.costes ?? [0, 0, 0])[step],
      };
    return Response.json({
      model: "synthetic-model",
      choices: [{
        finish_reason: tools.length ? "tool_calls" : "stop",
        message: {
          role: "assistant",
          content: tools.length ? null : JSON.stringify({
            texto: "Respuesta sintética verificada",
            sugerencias: ["Ver detalle"],
          }),
          ...(tools.length ? { tool_calls: tools } : {}),
        },
      }],
      ...(usage === undefined ? {} : { usage }),
    });
  };
  function client(actor: string): ClienteUsuario {
    return {
      auth: {
        getUser: async () =>
          options.invalidJwt
            ? { data: { user: null }, error: {} }
            : { data: { user: { id: actor } }, error: null },
      },
      from: (table: string) => {
        expect(table).toBe("usuarios");
        let id = actor;
        const result = () => ({
          data: [{
            id,
            rol: options.denied ? "Administrador" : "Gerencia",
            activo: true,
          }],
          error: null,
        });
        const chain = {
          select: () => chain,
          eq: (_name: string, value: unknown) => {
            id = String(value);
            return chain;
          },
          then: (
            resolve: (value: ReturnType<typeof result>) => unknown,
            reject?: (error: unknown) => unknown,
          ) => Promise.resolve(result()).then(resolve, reject),
        };
        return chain;
      },
      rpc: async (name: string, args: P6Obj) => {
        rpcCalls.push({ name, args });
        return options.rpcDenied
          ? { data: null, error: { code: "42501", message: P6PRIVATE } }
          : {
            data: { filas: [{ total: 7 }], n_filas: 1, truncado: false },
            error: null,
          };
      },
    } as unknown as ClienteUsuario;
  }
  const env = {
    OPENROUTER_API_KEY: "synthetic-provider-key",
    SUPABASE_URL: "https://synthetic.invalid",
    SUPABASE_ANON_KEY: "synthetic-anon",
    SUPABASE_SERVICE_ROLE_KEY: "synthetic-service",
    ESCO_TELEGRAM_SECRET: "synthetic-telegram-secret",
  };
  const deps = {
    env: (name: string) => env[name as keyof typeof env],
    crearClienteUsuario: (jwt: string) =>
      client(jwt === "web-other" ? P6OTHER : P6ACTOR),
    crearClienteServicio: () => client(P6ACTOR),
    crearLLM: () =>
      crearClienteOpenRouter(
        "synthetic-provider-key",
        providerFetch,
        "P6 fixture",
      ),
    registrar: (entry: P6Obj) => logs.push(structuredClone(entry)),
    ahora: () => new Date("2020-01-02T12:00:00.000Z"),
  } as unknown as Dependencias;
  function request(
    body: P6Obj,
    mode: "json" | "sse" | "telegram" = "json",
    extra: Record<string, string> = {},
  ) {
    return manejar(
      new Request("https://synthetic.invalid/functions/v1/esco-consultas", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: mode === "telegram"
            ? "Bearer synthetic-service"
            : "Bearer web-actor",
          ...(mode === "sse" ? { Accept: "text/event-stream" } : {}),
          ...(mode === "telegram"
            ? { "x-esco-telegram-secret": "synthetic-telegram-secret" }
            : {}),
          ...extra,
        },
        body: JSON.stringify({
          motor: "sql",
          pregunta: "Control P6",
          historial: [],
          ...(mode === "telegram" ? { usuario_id: P6ACTOR } : {}),
          ...body,
        }),
      }),
      deps,
    );
  }
  const json = async (
    body: P6Obj = {},
    mode: "json" | "telegram" = "json",
    extra: Record<string, string> = {},
  ) => {
    const response = await request(body, mode, extra);
    return { status: response.status, body: await response.json() as P6Obj };
  };
  return {
    handle: (request: Request) => manejar(request, deps),
    request,
    json,
    logs,
    providerRequests,
    rpcCalls,
    rejected,
    pending,
    release,
  };
}
export async function framesP6(response: Response): Promise<P6Obj[]> {
  const raw = await response.text();
  return raw.replace(/\r\n/g, "\n").split("\n\n").filter((s) =>
    s.includes("data:")
  ).map((s) =>
    JSON.parse(
      s.split("\n").filter((l) => l.startsWith("data:")).map((l) =>
        l.slice(5).trim()
      ).join("\n"),
    )
  ) as P6Obj[];
}
