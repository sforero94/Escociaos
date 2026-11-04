# Esco 2.0 M3: the `esco-consultas` edge function (labor family)

Date: 2026-11-03 (Bogotá). Branch `claude/esco2-m3-d73c73`, cut from `claude/esco2-m25`.
Status: **built and tested locally. Not deployed.** Nothing in production changed.
RLS evidence: [`m3-rls.md`](m3-rls.md).

## What a turn does

```
POST /functions/v1/esco-consultas  { pregunta, historial? }
  gateway: verify_jwt = true (no valid JWT → 401 before the worker starts)
  1. OPENROUTER_API_KEY, SUPABASE_URL or the anon key missing → 503, nothing read
  2. no "Authorization: Bearer" → 401; body not { pregunta, historial } → 400
  3. Supabase client created WITH THE CALLER'S JWT; auth.getUser → 401 if invalid
  4. own usuarios row: rol = 'Gerencia' AND activo = true, else 403
  5. catalog (tareas, tipos_tareas, lotes) → planner (Luna)
  6. validarPlan → D26 rule → registros_trabajo for the plan's date range
  7. executor → composer (Luna; Sol only by the D25 rule) → numeric guard
  → 200 { respuesta, origen, hoy, ruta, ajustes, plan, resultados, llamadas, ms }
```

Every read in steps 4–6 uses the client of step 3, so RLS applies to each one.
Step 4 is the access control, not a second layer: RLS on `registros_trabajo` and `lotes`
lets any authenticated session read (see the finding in `m3-rls.md`).

## Files

| File | Role |
|---|---|
| `supabase/functions/esco-consultas/index.ts` | Deno entry point: `Deno.serve` + `supabase-js` client with the user's JWT. ~30 lines. |
| `supabase/functions/esco-consultas/manejador.ts` | HTTP handler with injected dependencies. No Deno or npm imports, so Vitest tests it as is. |
| `src/utils/esco2/fuente.ts` | `FuenteLabores`: catalog before planning, registros after. Supabase source: fixed columns, paginated by rows received, fails unless it reads exactly the exact count. |
| `src/utils/esco2/ruteo.ts` | D25 rule. |
| `src/utils/esco2/ambiguedad.ts` | D26 rule. |
| `supabase/config.toml` | `[functions.esco-consultas] verify_jwt = true`. |
| `.github/workflows/deteccion-deriva-despliegue.yml` | New matrix entry: `verify_jwt` true, anonymous `/health` must be 401, watched paths include `src/utils/esco2` and `src/utils/escoEvals/numeros.ts`. |

### Single source tree

The function imports the core with relative paths (`../../../src/utils/esco2/*.ts`).
Supabase CLI 3.x (`apps/cli/src/shared/functions/deploy.ts`, read on 2026-11-03) uploads
every locally imported file that is inside the git root (`walkImportPaths`, allowed root =
git root). So no copy and no generator are needed. **This was verified by reading the CLI
source, not by a deploy.** If the first deploy reports "Skipping import path outside source
root", the fallback is a generated copy under `supabase/functions/esco-consultas/_nucleo/`
plus a parity test — the pattern `importHato` already uses.

## Decisions implemented

**D25 (route).** The planner always runs on Luna, because the number of parts is known only
after planning. When the validated plan has 2 or more parts, or 2 or more domains, the
composer (and its one recomposition) run on Sol (`openai/gpt-6-sol`, effort low). The model
never chooses its model. The cap of three model calls does not change.
Cost effect: the planner rule "resumen → total + by task" always gives 2 parts, so every
summary composes on Sol (about USD 0.003 per turn against 0.0002 on Luna).

**D26 (cosecha and similar).** In code, after validation. A term is "double" when it
resolves to exactly one category and also to at least one task. Signals come from the whole
plan of the turn: other task terms → task filter; other category terms → category filter;
none or both → a clarification question that names the category and the matching tasks.
If the previous assistant message was that question for the same term, the planner's
placement is kept: the user answered.

## Conversation and ownership (minimal, partly deferred)

- The server keeps no state. The client sends the recent history of its own conversation
  (max 12 messages, 4,000 characters each). Ownership is true by construction: the history
  arrives in the same authenticated request.
- Deferred: server-side conversations (a table with `owner = auth.uid()` and RLS, retention
  rules). It needs a migration, so it needs Santiago's approval.
- Log line per turn: origin, route, number of parts, D26 adjustments, error class, latency,
  cost. Never the question, the answer or row ids.

## Tests

| Test | Proves |
|---|---|
| `esco2M3Planificador.test.ts` (18) | D25 and D26 at rule and turn level; paginated source (3 pages, server cap below page size, rows lost mid-read → error, missing count → error); `error_datos` stops before the composer. The turn-level tests fail when the rules are removed from `nucleo.ts` (checked). |
| `esco2EscoConsultas.test.ts` (15) | Handler over real Postgres (PGlite) with the production SELECT policies copied verbatim and synthetic data. Gerencia: 200, totals equal to Postgres' own sum, 2,300 rows read in pages of 1,000/1,000/300 as `authenticated`. Administrador, Verificador, deactivated Gerencia, profile-less session: 403 after reading only `usuarios`, and the model is never called. 401 without/invalid token, 503 without the OpenRouter key. D27 isolation guard. The 403 tests fail when the `activo` or the profile check is removed (checked). |
| `scripts/check-deploy-drift.test.mjs` (+5) | The detector's per-function expectations. |
| `scripts/esco2/e2e-local.ts` | Same harness with the real models. Run on 2026-11-03: 403/403; Luna single part with the figure equal to the Postgres oracle; summary composed on Sol; D26 question, answer respected, task reading. Spend about USD 0.005. |

Not covered locally: JWT signature validation (Auth and the gateway do it), the real
PostgREST, CORS preflight through the gateway, and the Deno compile of `index.ts`
(no Deno or Docker on this machine; `supabase/` is outside `tsc` and ESLint).

## What needs Santiago's approval

1. **Deploy**: `npx supabase functions deploy esco-consultas --project-ref ywhtjwawnkeqlwxbvgup`
   from the repo root (reads `verify_jwt = true` from `supabase/config.toml`). Never through a
   connector (ESCO-148).
2. **Secrets: none new.** Edge function secrets are per project, so `OPENROUTER_API_KEY`
   (already set for `make-server-1ccce916`) is visible to the new function on deploy. Without
   it the function answers 503.
3. **Order**: deploy first, then merge the drift-detector change to `main`. Until the
   function exists, its matrix job fails daily with "no existe en el proyecto" and sends a
   Telegram alert.
4. **After deploy, check**: anonymous `GET …/esco-consultas/health` → 401; a Gerencia
   session → 200 with figures; an Administrador session → 403; the function logs show one
   `turno` line without question text.

## Open risks

1. **RLS finding** (`m3-rls.md`): `USING (true)` SELECT policies on `registros_trabajo` and
   `lotes`. Not created by Esco; not fixed here (no migration).
2. **Name collision**: the old tree already has a local module `esco-consultas.ts` (the
   #311 query engine inside `make-server-1ccce916`). The new function slug has the same name.
   Imports do not cross (guard test), and the detector path is the directory, but logs and
   conversations can confuse the two.
3. **No per-user spend cap or rate limit** in the function. Exposure is limited to the six
   active Gerencia accounts.
4. **Offset pagination** over a table that receives inserts: a read can fail with
   "lectura incompleta" if a row lands between pages. The turn then answers `error_datos`
   (never partial figures). Expected to be rare; a retry fixes it.
5. **D26 relies on client history** to know the user already answered. A forged history only
   changes the caller's own interpretation; it cannot widen access.
6. **Bundling** verified from CLI source only (see above).

## Regression check on the frozen M2.5 snapshot (2026-11-03)

Config `m3` (Luna; Sol composes plans of 2+ parts), 10 cases × 3. Spend USD 0.058 in total.

| | M2.5 Luna | M3 |
|---|---|---|
| Selection correct | 27/30 | 25/30 |
| L04 («cosecha» alone) | 3/3 | 0/3 — D26 asks, by design |
| L01 | 3/3 | 1/3 — **model drift**: the unchanged M2.5 code (`f3b87f6a`) also fails 3/3 today |
| L07 | 1/3 | 2/3 |
| Without L04 | 24/27 | 25/27 |

A first M3 run added one D26 line to the planner prompt; it made L01 plan one part instead of
two (0/3). The line was removed (D26 runs in code, so it was not needed); the planner prompt
is now byte-identical to M2.5. L04's reference assumes the task reading; under D26 the
golden reference for L04 needs Santiago's decision (ask, or accept the follow-up turn).
