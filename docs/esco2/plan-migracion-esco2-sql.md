# Esco 2.0 — migration plan to the SQL engine on web and Telegram

Status: **approved** (2026-11-09). Santiago approved the 7 recommended decisions D1–D7 in chat. Owner: Santiago. Each deploy, migration and secret
change in this plan needs Santiago's explicit approval at the time it runs.

## 1. Goal

Esco 2.0 is the only Q&A engine for Gerencia, on the web and on Telegram, with visuals on both.

- **One engine:** the SQL loop in `src/utils/escoSql/` (one tool `consultar_sql`, maximum 4 queries,
  RPC `esco_sql_lectura`, views `v_esco_*`, migration 192). It runs in `esco-consultas`.
- **Two channels:** the web chat and the Telegram bot. Both show the same answer for the same question.
- **Visuals on both channels:** tables, charts, KPI cards, and question chips.
- **Telegram capture does not change:** `/jornal`, `/monitoreo`, `/ingreso`, `/pesaje`, `/evento`, the
  inventory round (`/ronda`, voice notes, `/explicar`, `/proponer`, `/aprobar`, `/cerrarronda`) and the
  alert buttons keep their code and their behavior.
- **Esco 1.0 Q&A is retired** at the end: the `llmToolLoop` path in `chat.tsx` and the planner engine
  (`motor: 'actual'`) in `esco-consultas`.

Out of scope: Q&A for roles other than Gerencia (see D7), voice questions to Esco, write actions from Esco.

## 2. Current state (verified on `main` and in production, 2026-11-09)

| Part | Today |
|---|---|
| Web Esco 1.0 | `ChatFAB` (Gerencia only) → `make-server-1ccce916` `/chat` (SSE). Persists in `chat_conversations` / `chat_messages`. Renders markdown, charts from ```` ```chart ```` JSON blocks in the text (`ChatMessage.tsx` → `ChatChart.tsx`, recharts), starter chips (`ChatEmptyState.tsx`), live trace (`EscoTraza.tsx`), memory card, "Exportar informe". |
| Web Esco 2.0 | `EscoSqlFAB` (Gerencia only) → `esco-consultas` with `motor: 'sql'`. One JSON reply, no stream. History only in component state (lost on reload). Shows "Consultas usadas". No charts, no chips. |
| Telegram capture | Grammy conversations and handlers in `telegram/bot.ts` (2.7k lines). Voice notes go only to the inventory round. |
| Telegram Q&A | Last `bot.on("message:text")` fallback → `llmToolLoop` (Esco 1.0). Gate: `modulos_permitidos` contains `consultas`. Today 2 linked accounts have it, both active Gerencia; the 3 field accounts do not. Charts go out as images from `quickchart.io`, **with the figures in the image URL** (a third party sees them). Memory buttons `mem_save` / `mem_cancel`. |
| Engine quality | Baseline 80.1 % correct on 366 runs (`docs/esco2/esco-sql-baseline-2026-11-08.md`). Weak modules: hato 51 %, monitoreo 53 %, ingresos 48 %. Known causes: the model guesses category values, views are missing (hato events, individual milk weighings, fortnightly production, cattle sales), and income totals leave out cattle sales without a warning. |
| Production eval (2026-11-09) | 26 cases asked through the "Esco SQL (beta)" button in production, checked against the module screens and base tables: 10 correct, 3 correct "sin dato", 8 partial, 5 incorrect, 1 not evaluable. 42 of 52 checked figures matched. The failures are listed in §8.1. The full report stays outside the repo (it has real figures). |
| `esco-consultas` | Two engines: `actual` (planner, M6 was a No-Go) and `sql`. `verify_jwt = true`. Access gate: active Gerencia, read with the caller's JWT. |

Correction to an earlier chat note: Esco 1.0 on the web is **Gerencia only** too (`ChatFAB` checks
`hasRole(['Gerencia'])`). No other role loses Q&A in this migration.

## 3. Target architecture

```
 Web ChatPanel ──SSE──┐                       ┌── esco_sql_lectura(sql)            ← user JWT (web)
                      ├─► esco-consultas ─────┤
 Telegram bot ──HTTP──┘   (SQL loop +         └── esco_sql_lectura_actor(id, sql)  ← service door (Telegram)
 (make-server)            block builder)
        ▲                         │
        └──── channel adapters ◄──┘  one answer contract (§4), rendered per channel (§5, §6)
```

Rules:

1. **One engine, one deploy unit.** Only `esco-consultas` runs the loop. The bot calls it over HTTP. It
   does not import the engine (D1).
2. **Security stays in Postgres.** Telegram reads run as the linked user, with RLS and the Gerencia check
   in the RPC, never as raw service role (D2).
3. **Data in a visual comes only from query rows.** The model picks the visual type and the columns. The
   server fills the values from the rows of that query. The model never writes a number into a block.
4. **Channels render, they do not decide.** Same answer contract for web and Telegram. Only the drawing
   differs.

## 4. Answer contract v1

`esco-consultas` returns (and streams, §5) one object:

```ts
interface RespuestaEsco {
  texto: string;                 // markdown, no chart JSON inside
  bloques: Bloque[];             // 0..4 visuals, in order
  sugerencias: string[];         // 0..3 follow-up questions (chips)
  aclaracion?: { pregunta: string; opciones: string[] };  // when the question is ambiguous
  consultas: ConsultaSql[];      // trace: sql, proposito, n_filas, truncado, error, ms
  ms: number;
}

type Bloque =
  | { tipo: 'tabla';   titulo: string; consulta: number; columnas: Columna[]; filas: Fila[]; total_filas: number }
  | { tipo: 'grafica'; titulo: string; consulta: number; forma: 'bar' | 'line' | 'pie' | 'area';
      x: string; y: string[]; formato: Formato; datos: Fila[] }
  | { tipo: 'tarjeta'; consulta: number; items: { etiqueta: string; columna: string; formato: Formato; valor: number | string | null }[] };

type Formato = 'moneda' | 'numero' | 'porcentaje' | 'kg' | 'litros' | 'mm' | 'fecha' | 'texto';
```

How the blocks are made:

- A second tool, `mostrar_visual`, lets the model ask for a block. It sends only the **spec**: type,
  query number, column names, title, format. No values.
- `src/utils/escoSql/bloques.ts` (pure, tested) builds the block from the **full rows** of that query.
  The loop keeps the full rows server-side (today it keeps a 20-row sample), up to the 500-row cap.
- The builder rejects a spec when the query does not exist, a column does not exist, a `y` column is not
  numeric, or the chart has more than 60 points. A rejected spec is dropped and logged. It is never
  repaired with guessed data.
- Limits: tables 50 rows on the web, 15 on Telegram (the rest goes in a CSV file, §6). A truncated query
  shows the warning in the block.
- Formatting uses one shared function per `formato` with the Colombian rules of `src/utils/format.ts`
  (dots for thousands, `$95M`, no `COP`, no decimals on money). Both channels call the same function.
- `sugerencias` and `aclaracion.opciones` are short text, never figures.
- Old clients keep working: `respuesta` stays in the JSON until the web panel and the bot use `texto`.

Optional guard (P2 in §8): reuse the numeric guard of `src/utils/esco2/guardaNumerica.ts` to check that
each figure in `texto` appears in a query result. A failure marks the answer, it does not block it.

## 5. Web channel

- **Stream.** `esco-consultas` adds SSE for the web: `consulta_inicio {proposito}`, `consulta_fin {ms, ok, n_filas}`,
  `texto`, `bloques`, `sugerencias`, `done`, `error`. `responderPregunta` gets an optional `onEvento`
  callback, the same pattern as `llmToolLoop`'s `onEvent`. Telegram keeps the plain JSON reply.
- **One chat screen.** `ChatPanel` gets an engine adapter. Behind a flag, Gerencia talks to 2.0 in the
  same panel, with the same conversation list. The trace (`EscoTraza`) shows each query's purpose.
- **Rendering.** `ChatMessage` renders `bloques`: a new `BloqueTabla`, the existing `ChatChart` (fed
  from the block, not parsed from text), and a new `TarjetaKpi`. Chips go under the last answer. A click
  sends the chip as the next question. "Consultas usadas" stays as a collapsible section.
- **Persistence.** Each turn goes to `chat_conversations` / `chat_messages`. The assistant row stores
  `metadata = { motor: 'sql', consultas (SQL and counts, no rows), bloques (with their data) }`, so a
  reopened conversation draws the same visuals without new queries. The data is a snapshot of the time of
  the question, and the UI says so.
- **Export.** `ExportarInformeDialog` reads the blocks instead of the chart JSON.
- **Cleanup.** After cutover, remove `EscoSqlFAB`, `EscoSqlBeta` and the `/esco-sql` route.

## 6. Telegram channel

### 6.1 Routing

- Only the **last** free-text fallback changes. All the earlier `bot.on("message:text")` handlers
  (round corrections, explanations, physical counts) and every conversation keep their order and code.
  `telegramChat.test.ts` finds the Esco handler by position, so the test changes with the handler.
- The gate stays: `modulos_permitidos` contains `consultas` **and** the linked user is active Gerencia.
  The engine checks it again (§6.2).
- Kill switch: the edge secret `ESCO_MOTOR_TELEGRAM = sql | legacy`. `legacy` sends the question back to
  `llmToolLoop` until the retirement phase. Unset means `legacy` during the transition.

### 6.2 Access path (D1, D2)

- New migration: `esco_sql_lectura_actor(p_usuario uuid, p_sql text)`. EXECUTE for `service_role` only.
  Inside one transaction it sets `request.jwt.claims` with `sub = p_usuario` and `role = authenticated`,
  runs `SET LOCAL ROLE authenticated`, and calls `esco_sql_lectura`. Then RLS, `get_user_role()` and the
  Gerencia check run as that user. An inactive or non-Gerencia user gets 42501, as on the web.
  First prove with `po_sonda` that `service_role` can do `SET LOCAL ROLE authenticated` there.
- `esco-consultas` gets a second door: a service-role JWT, the header `x-esco-telegram-secret`, and
  `usuario_id` in the body. The handler checks the secret first. If the secret is unset, it answers 503
  and runs nothing (same fail-closed rule as the tick secrets). Then it reads the user with service role
  (active and Gerencia) and runs the loop with the actor executor.
- The bot sends `usuario_id` from `resolverUsuarioTelegram`, never from the message.

### 6.3 Rendering

| Element | Telegram output |
|---|---|
| `texto` | HTML `parse_mode`, with escaping (more robust than legacy Markdown). Plain text if Telegram rejects it. Split at 4096 characters. |
| `tabla` | Up to 15 rows and 4 columns: aligned monospace `<pre>`. More: the first 15 rows plus a `.csv` file of the whole block (`InputFile`, already used for the round scope file). |
| `grafica` | A PNG image (D3). |
| `tarjeta` | Bold lines: `<b>Gasto del mes:</b> $95M`. |
| `sugerencias`, `aclaracion` | Inline keyboard buttons. `callback_data` carries only a short id (64-byte limit). The text lives in the bot session, keyed by message. A tap sends the text as the next question. |
| `consultas` | A "Ver consultas" button that sends the SQL and counts on demand. Typing action while the engine works. |

- Persistence: the existing Telegram conversation in `chat_messages`, same metadata as the web.
- The memory buttons stop for 2.0 answers (D4).

## 7. Decisions (approved 2026-11-09)

Santiago approved the recommendation column for D1–D7. The alternatives stay as fallbacks only.

| # | Decision | Approved | Alternative |
|---|---|---|---|
| D1 | How the bot reaches the engine | HTTP call to `esco-consultas`: one engine in one deploy unit | Import `src/utils/escoSql` into `make-server-1ccce916`: one less hop, but two deploy units carry the engine |
| D2 | How Telegram reads as the user | Actor RPC with `SET LOCAL ROLE authenticated` (§6.2) | Mint a short user JWT with the project's JWT secret: more secret handling, and may not work with asymmetric keys |
| D3 | Telegram charts | Draw the PNG inside the function (SVG + `resvg-wasm`), after a one-day spike on cold start and bundle size | QuickChart by POST: works now, but the figures still go to a third party |
| D4 | Memory (`esco_memorias`) | Leave it out of v1. Keep the table. Decide later whether to load memories into the SQL prompt | Port the save/forget flow now |
| D5 | Esco 1.0 code at the end | Delete it and keep it in git history (project default) | Move it to `archive/` like the recommended-actions engine |
| D6 | Acceptance gate | ≥ 90 % correct on the `dev` split, no module under 80 %, `held` run once at the gate | Other thresholds |
| D7 | Roles | Gerencia only, as today on both channels | Open Q&A to Administrador: needs a per-role view list and a new security review |

## 8. Phases

Each phase is one PR, unless it says otherwise. P1 and P2 can run in parallel. P4 can run in parallel
with P2 and P3.

| Phase | Work | Depends on | Approval needed |
|---|---|---|---|
| **P0** | Decide D1–D7 — **done 2026-11-09** | — | Santiago |
| **P1 — Engine fixes** | The fixes of §8.1. Run by Claude in the "Esco SQL: prototipo" session, not by Codex. Re-run the eval on `dev` only. | — | Migration 193 (views; reserved 2026-11-09, free on all remote branches and in the ledger) |
| **P2 — Answer contract** | `mostrar_visual` tool, `bloques.ts` builder, `sugerencias`, `aclaracion`, full rows kept server-side, shared formatter, contract tests (a block value always exists in its query rows). Keep `respuesta` for old clients. | — | `esco-consultas` deploy |
| **P3 — Web** | SSE in `esco-consultas`; `ChatPanel` adapter behind a flag; block, card and chip rendering; persistence; export; trace. Santiago uses it for real. Then remove the second floating button. | P2 | `esco-consultas` deploy |
| **P4 — Telegram door** | Migration with `esco_sql_lectura_actor`, rehearsed with `po_sonda`; service door in `esco-consultas`; secret `ESCO_TELEGRAM_SECRET` in both functions; drift detector watches it. | D1, D2 | Migration 194 (reserved 2026-11-09), secret, `esco-consultas` deploy |
| **P5 — Telegram adapter** | Free-text fallback → `esco-consultas` behind `ESCO_MOTOR_TELEGRAM`; renderers of §6.3; chart PNG (D3); button session; tests for routing order and rendering. Sync both edge-function trees. | P2, P4 | `make-server-1ccce916` deploy |
| **P6 — Shadow and cutover** | Two weeks of real use on both channels. Weekly smoke set of 20 questions, sent on web and Telegram: same text, same blocks. Watch latency, cost and errors in the logs. Switch the defaults to 2.0. | P3, P5 | Flags |
| **P7 — Retirement** | Delete the Esco 1.0 Q&A path (`/chat` route, `llmToolLoop` call, 1.0 tools that nothing else uses), the planner engine `motor: 'actual'` and the `src/utils/esco2/` modules that only it uses, with their tests. Update CLAUDE.md (Esco section, ledger), drift detector and `docs/README.md`. | P6 + D5 | `make-server-1ccce916` and `esco-consultas` deploys |

Deploy order for P4–P5 (lesson of migration 105): migration → `esco-consultas` deploy → secret in both
functions → `make-server-1ccce916` deploy with `ESCO_MOTOR_TELEGRAM` unset (= legacy) → turn on `sql`.

Deploy commands stay as in CLAUDE.md: `npx supabase functions deploy make-server-1ccce916` (reads
`verify_jwt = false`) and the pinned CLI command for `esco-consultas` (`verify_jwt = true`). Never a
connector publish path.

### 8.1 Engine fixes for P1

Sources: the baseline (§2) and the production eval of 2026-11-09. Each item names the cause, not a case.

| # | Failure | Fix |
|---|---|---|
| F1 | Money in full pesos (for example `$95.343.110`) instead of the Colombian M format (`$95M`) | A deterministic formatter for money in the answer text, plus a prompt rule. Same rules as `src/utils/format.ts`. |
| F2 | "Ventas" answered with all income: rents and other non-sale concepts counted as sales, and cattle sales (`fin_transacciones_ganado`, `es_hato = false`) left out | `v_esco_ingresos` exposes the category and an `es_venta` flag, and a union or a separate view brings cattle sales in. The prompt says what "ventas" and "ingresos" mean. |
| F3 | Application cost differs from the application report: the view reads the stored `aplicaciones.costo_total`, the report computes insumos + mano de obra | `v_esco_aplicaciones` computes the cost the same way the report does. Add a test against the report's calculation. |
| F4 | Application close date one day early | The view reads the date in `America/Bogota`, or reads `aplicaciones_cierre.fecha_cierre`. Check every date column of every `v_esco_*` view for the same UTC shift. |
| F5 | A loose pest filter (`ILIKE '%ácaro%'`) mixes several catalog categories, and the pooled number is presented as one pest's incidence | The prompt lists the catalog values. Match a pest by its exact name; when a word matches more than one category, show each one apart or ask. Also covers the guessed `estado` / `etapa` / `tipo` values of the baseline. |
| F6 | A question with no period ("¿Cuánto gastamos?") is answered for a period the model picked | A prompt rule: no period → ask a short clarification question. Never pick one. |
| F7 | A cross join between two tables multiplies counts and amounts (count of the product, then product again) | A prompt rule: aggregate each side by the join key first, then join. Never sum or count over a raw many-to-many join. |
| F8 | A row count that no query returned (a stated number of shown rows) | A prompt rule: every count in the answer comes from a query. When a result is truncated, run a `COUNT(*)` before stating a total. |
| F9 | "kg por árbol" for a year divides by trees summed over both harvests | The production view or the prompt states that trees are per harvest. A yearly figure uses distinct trees, or the answer says it is per harvest. |
| F10 | Rain coverage: a calendar day with no row is not counted as "sin dato", and the quality criterion is not explained | The climate view generates every calendar day of the range. The answer explains the coverage rule in one line. |
| F11 | "Próximos 60 días" covers 61 dates | A prompt rule for ranges: half-open `[hoy, hoy + N días)`. |
| F12 | The RPC rejects a `;` inside a string literal as a second statement | Low priority: the model recovered. Prefer a prompt rule. A change to `esco_sql_lectura` is a security change and needs its own review. |
| F13 | The prompt-injection case (asking for passwords) was not evaluable: the test tool blocked it before it reached Esco | Run it by hand once. No code change expected. |

Gate for P1: the `dev` split improves on every module listed above and no fix lowers another module. The
`held` split stays closed until the D6 gate.

### 8.2 Who runs each phase

- **P1:** Claude, in the "Esco SQL: prototipo" session. It ends in a PR, and migration 193 is applied only
  with Santiago's approval.
- **P2 to P7:** Codex, after P1 is merged. Codex follows this plan phase by phase, one PR per phase, and
  stops at each "Approval needed" cell for Santiago. P4 does not touch the prompt, so it may start before
  P1 merges if Santiago says so.
- Codex reads the repo rules first: `CLAUDE.md` (the migration ledger rules, the deploy commands, the
  two edge-function trees, "public repo: aggregates only") and the module contracts it touches.

## 9. Acceptance

The migration is done when all of these are true:

1. **Accuracy:** the D6 gate passes.
2. **No invented figures in visuals:** contract tests show that every block value comes from its query
   rows. A rejected spec never reaches the user.
3. **Parity:** on the smoke set, web and Telegram show the same text and the same blocks.
4. **Security:**
   - a Telegram account without `consultas`, or not active Gerencia, gets no answer;
   - the actor RPC rejects a non-Gerencia user and an inactive user (rehearsed with `po_sonda`);
   - an unset secret gives 503;
   - an anonymous call gives 401;
   - `verify_jwt` stays `true` on `esco-consultas` and `false` on `make-server-1ccce916`.
5. **Capture flows:** all existing Telegram tests pass, and one manual pass runs each capture command
   once in production with Santiago.
6. **Visual check:** the orchestrator sends real screenshots of the worst cases: a long table, a
   truncated query, a pie chart with many slices, a chart on a phone, the Telegram CSV file.
7. **Latency:** p95 under 25 s for a full answer, measured from the logs during P6.
8. **Retirement:** Esco 1.0 Q&A and the planner engine are gone, and CLAUDE.md describes only the SQL engine.

## 10. Risks

| Risk | Control |
|---|---|
| The model asks for a visual that does not fit the data | The builder rejects it. The text answer still goes out. |
| Telegram buttons go stale after a deploy | The session lookup fails closed: "Esa sugerencia ya no está disponible, escribe la pregunta." |
| `SET LOCAL ROLE` does not work from `service_role` | P4 starts with the `po_sonda` proof. If it fails, D2 falls back to the minted JWT and comes back to Santiago. |
| A capture flow breaks because the handler order changes | Only the last fallback changes. The routing-order test runs in P5. |
| Chart PNG makes the edge function slow or too big | One-day spike in P5. QuickChart by POST is the fallback, with Santiago's approval. |
| Cost grows with the visual tool | `UsoSql` logs tokens per turn. Watch it weekly in P6. |
