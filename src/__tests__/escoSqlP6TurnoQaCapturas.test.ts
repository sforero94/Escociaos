// Independent QA: actual handler receipts, terminal logs and snapshots → P6 comparator.
// Entire campaign is synthetic and offline; passing structure grants no D6/activation.
import { beforeAll, describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { resolve } from "node:path";
const { cargar } = createRequire(import.meta.url)(
  resolve("scripts/esco-sql-p6/cargar.mjs"),
) as {
  cargar: () => {
    analizarCapturas: (input: unknown, now?: Date) => Record<string, unknown>;
  };
};
const { analizarCapturas } = cargar();
import { type P6Obj, servidorP6 } from "./helpers/escoSqlP6TurnoQaServidor";
const hash = (v: string) => createHash("sha256").update(v).digest("hex");
type Capture = {
  week: number;
  case_id: string;
  channel: string;
  context: Record<string, string>;
  generation_id: string;
  outcome: string;
  observed_at: string;
  metrics: P6Obj;
  response: P6Obj;
  snapshot: P6Obj;
  execution_log: P6Obj;
  format_observations: unknown[];
};
type Input = {
  schema_version: number;
  mode: string;
  period: P6Obj;
  captures: Capture[];
};
let frozen: Input;
beforeAll(async () => {
  const captures: Capture[] = [];
  for (const week of [1, 2]) {
    for (let id = 0; id < 20; id++) {
      for (const channel of ["web", "telegram"]) {
        const s = servidorP6();
        const result = await s.json(
          {},
          channel === "web" ? "json" : "telegram",
        );
        expect(result.status).toBe(200);
        expect(s.rejected).toEqual([]);
        const response = result.body,
          t = response.recibo as P6Obj,
          observed_at = `2020-01-${week === 1 ? "02" : "09"}T12:00:00.000Z`;
        expect(t).toBeDefined();
        const context = Object.fromEntries(
          [
            "actor",
            "question",
            "history",
            "scope",
            "data_cut",
            "engine",
            "config",
          ].map((k) => [
            k + "_sha256",
            k === "history"
              ? String(t.historial_sha256)
              : hash(k === "question" ? k + id : k),
          ]),
        );
        captures.push({
          week,
          case_id: "SYN_PRIVATE_CASE_" + id,
          channel,
          context,
          generation_id: String(t.turno_id),
          outcome: "success",
          observed_at,
          metrics: {
            latency_scope: "end_to_end",
            latency_ms: 100,
            cost_source: "observed",
            cost_usd: 0,
          },
          response,
          snapshot: { ...structuredClone(response), snapshot_at: observed_at },
          execution_log: s.logs.find((l) => l.evento === "turno_sql")!,
          format_observations: [{
            block: 0,
            row: null,
            column: "total",
            display: "7",
          }],
        });
      }
    }
  }
  frozen = {
    schema_version: 2,
    mode: "paired_live",
    period: {
      started_at: "2020-01-01T00:00:00.000Z",
      ended_at: "2020-01-15T00:00:00.000Z",
    },
    captures,
  };
});
const run = (input: Input) =>
  analizarCapturas(input, new Date("2026-11-09T00:00:00.000Z"));
const changed = (fn: (c: Capture, e: Input) => void) => {
  const e = structuredClone(frozen);
  fn(e.captures[0], e);
  return e;
};
describe("QA P6 — importación v2 ligada a recibos reales sintéticos", () => {
  it("Given80ejecuciones sintéticas distintas, When importa respuestas/logs/snapshots, Then conserva vínculo de coste cero sin aceptarD6 ni activar", () => {
    const report = run(frozen);
    expect(report).toMatchObject({
      protocol_pass: true,
      p6_live_protocol_pass: true,
      d6_accepted: false,
      activation_authorized: false,
      counts: {
        captures: 80,
        receipt_linked_captures: 80,
        independent_generation_pairs: 40,
      },
      cost: { total: 0, observed_count: 80, unknown_count: 0 },
    });
    const raw = JSON.stringify(report);
    for (const c of frozen.captures.slice(0, 2)) {
      for (
        const privateValue of [
          c.case_id,
          c.generation_id,
          c.context.history_sha256,
          c.response.texto,
        ]
      ) expect(raw).not.toContain(String(privateValue));
    }
  });
  it.each(
    [
      "generation",
      "channel",
      "history",
      "response-use",
      "snapshot-id",
      "snapshot-use",
      "log-id",
      "log-channel",
      "log-cost",
      "log-use",
      "log-private",
      "metric-cost",
      "missing-log",
      "missing-receipt",
      "reused-id",
    ] as const,
  )(
    "Given evidencia alterada %s, When compara, Then no concede protocolo vivo",
    (mode) => {
      const e = changed((c, all) => {
        if (mode === "generation") {
          c.generation_id = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
        }
        if (mode === "channel") (c.response.recibo as P6Obj).canal = "telegram";
        if (mode === "history") {
          c.context.history_sha256 = hash(
            "different-history",
          );
        }
        if (mode === "response-use") {
          c.response.uso = {
            llamadas: 3,
            entrada: 6,
            salida: 9,
            costoUsd: 0.5,
          };
        }
        if (mode === "snapshot-id") {
          (c.snapshot.recibo as P6Obj).turno_id =
            "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
        }
        if (mode === "snapshot-use") c.snapshot.uso = null;
        if (mode === "log-id") {
          c.execution_log.turno_id = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
        }
        if (mode === "log-channel") c.execution_log.canal = "telegram";
        if (mode === "log-cost") {
          (c.execution_log.coste as P6Obj).observadoUsd = 0.25;
        }
        if (mode === "log-use") c.execution_log.uso = null;
        if (mode === "log-private") c.execution_log.actor = "SYN_PRIVATE_ACTOR";
        if (mode === "metric-cost") c.metrics.cost_usd = 0.25;
        if (mode === "missing-log") c.execution_log = {};
        if (mode === "missing-receipt") delete c.response.recibo;
        if (mode === "reused-id") {
          const other = all.captures[2];
          other.generation_id = c.generation_id;
          (other.response.recibo as P6Obj).turno_id = c.generation_id;
          (other.snapshot.recibo as P6Obj).turno_id = c.generation_id;
          other.execution_log.turno_id = c.generation_id;
        }
      });
      expect(run(e)).toMatchObject({
        protocol_pass: false,
        p6_live_protocol_pass: false,
        d6_accepted: false,
        activation_authorized: false,
      });
    },
  );
  it.each(["canal", "estado", "coste.estado"] as const)(
    "Given enum arraycoercible %s, When importa recibo, Then rechaza en vez de normalizarlo",
    (field) => {
      const e = changed((c) => {
        const t = c.response.recibo as P6Obj;
        if (field === "coste.estado") (t.coste as P6Obj).estado = ["completo"];
        else t[field] = [t[field]];
      });
      expect(run(e)).toMatchObject({
        protocol_pass: false,
        p6_live_protocol_pass: false,
      });
    },
  );
  it("Given capturasv1 con métricas correctas, When omite recibosv2, Then solo conserva compatibilidadoffline", () => {
    const e = structuredClone(frozen);
    e.schema_version = 1;
    for (const c of e.captures) {
      delete c.response.recibo;
      delete c.response.uso;
      delete c.snapshot.recibo;
      delete c.snapshot.uso;
    }
    expect(run(e)).toMatchObject({
      protocol_pass: true,
      p6_live_protocol_pass: false,
      evidence_schema_version: 1,
    });
  });
  it("Given subtotalparcial observado con respuesta útil, When importa coste desconocido, Then conserva subtotal y no lo suma como total", async () => {
    const s = servidorP6({ planes: { Parcial: { costes: [0.1, null, 0.2] } } });
    const r = await s.json({ pregunta: "Parcial" });
    expect(r.status).toBe(200);
    const e = changed((c) => {
      c.response = r.body;
      c.snapshot = { ...structuredClone(r.body), snapshot_at: c.observed_at };
      c.execution_log = s.logs.find((l) => l.evento === "turno_sql")!;
      c.generation_id = String((r.body.recibo as P6Obj).turno_id);
      c.metrics.cost_source = "unknown";
      c.metrics.cost_usd = null;
    });
    expect(run(e)).toMatchObject({
      protocol_pass: false,
      p6_live_protocol_pass: false,
      cost: {
        total: null,
        observed_count: 79,
        unknown_count: 1,
        partial_receipt_count: 1,
      },
    });
    expect((run(e).cost as P6Obj).partial_observed_subtotal).toBeCloseTo(0.3);
  });
});
