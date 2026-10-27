# Runbook — Respuesta al reporte del sábado

**Who runs it**: a **new, ordinary cloud session** that Santiago opens from his
phone, on Saturday or later, by pasting the reply prompt from the Saturday push
plus his answer lines. **Attended**: he is present, so the guard hook asks
instead of denying. **One session per Saturday reply**: each reply has its own
trace, independent of every other run.

Created 2026-10-26, decision of Santiago (constitution §3). Why a separate
session and not the Routine itself: `run-sabado.md`.

**Where the authority comes from.** The pasted prompt was written by a Routine:
it only says which report to read, and authorises nothing. **Santiago's answer
lines are the "go"**, each one scoped to the one ID it names, answering a
proposal the Saturday report already carried (constitution §6, the go rule). A
line that names nothing in the report authorises nothing.

Answer forms:

| Line | Meaning |
|---|---|
| `ESCO-NNN A` (or `B`, `C`) | Picks an option of a `decision` |
| `ESCO-NNN aplicar` | Applies a prepared `datos` migration, or a `ddl_aditivo` that Friday prepared but could not apply |
| `ESCO-NNN si` / `ESCO-NNN no` | Answers a Thursday `propuesta` |
| `fusionar #N #M …` | Merges exactly those PRs |

---

## Protocol

**0 — Boot.** Run id `YYYY-MM-DD-sabado-respuesta`, with the date of the
Saturday report. Clone, read the root `CLAUDE.md`, the constitution,
`evals/rubrica-ruteo.md`, and the Saturday report named in the prompt
(`reports/YYYY-MM-DD-sabado.md`). Tool preflight (constitution §4), including
which write tool resolves. Record the `ATTENDED=` line.

**1 — Parse and echo back, before acting.** Show a table, in Spanish: each
line → ID, what will be done, and what will not. Mark `no entendido` any line
that does not match an item and a token of the report, or is ambiguous, and ask
about it: never guess (constitution §6, "ask which"). **Wait for his
confirmation before acting on anything.**

**2 — Act, item by item, only on what he confirmed.**

- **`decision` (`ESCO-NNN A`)** — record the decision on the ficha in Notion:
  his exact line as the quote, and the date. Then the follow-up ficha (filed
  apart under rubric R5; if none exists, file it in Mantenimiento and link
  both): if what remains is autonomous by the rubric, set it to `Ruta = VIERNES`
  with `preaprobado` (the quote and date). If it still needs him (data, an
  external action), it stays `FDS` with its type.
- **`datos` (`ESCO-NNN aplicar`)** — allowed here, and only here, because
  Santiago is present and approved that exact ID. In this order, stopping at the
  first failure:
  1. The migration file is in its PR and has no `TODO` left.
  2. Re-run its pre-state query: it must still match what the report showed.
  3. Re-run the `po_sonda` rehearsal: it must give the expected post-state.
  4. Apply the file verbatim, transferred by content from the PR (constitution
     §6), with `apply_migration` on `Supabase_Escritura` if it resolves,
     otherwise Composio `SUPABASE_APPLY_A_MIGRATION`, account
     `supabase_bitis-coward`. The hook asks; he answers.
  5. Run the post-state query; record pre and post in the ficha.
  If any check fails, apply nothing and say why. The same steps apply to a
  `ddl_aditivo` that Friday prepared but could not apply.
- **`propuesta si`** — set the ficha to `Ruta = VIERNES` with `preaprobado`
  (quote and date), for a future Friday. If the rubric still fails another
  criterion besides V7, keep it `FDS` and say which.
- **`propuesta no`** — `Estado = Done`, `Resolucion = Aceptado (no se arregla)`,
  `Motivo cierre` = his line and the date, **and a line in the finder's memory
  ledger**, so no future Thursday re-proposes it.
- **`fusionar #N #M`** — merge only the PRs he named, in the order the Saturday
  report listed. Before each merge, check that the PR is still open, green and
  mergeable; if not, skip it and say why. After merging, state every deploy
  still needed, with the command and its order against the migrations. **This
  session never deploys** (constitution §6, ESCO-148).

**3 — Record.** Write `reports/YYYY-MM-DD-sabado-respuesta.md`: the echo table,
what was done, pre- and post-states, merges, deploys still pending, and what
was refused and why. Commit it with the memory-ledger lines, under the
memory-commit rules (constitution §4 Phase 5: pre-commit check, allowed paths
only). Then update the Saturday Notion page with a `Respuesta` section.

**4 — Close.** End with a short summary in Spanish: hecho, no hecho y por qué,
deploy pendiente.

---

## Never, in this session

- Act on an ID or token the Saturday report did not carry, or extend one line
  to a neighbouring item.
- Compose SQL in the moment, or apply a migration whose file is not in a PR.
- Apply a `datos` migration with a `TODO`, or with a pre-state that no longer
  matches.
- Merge a PR he did not name, or deploy the edge function.
- Change a rule, cap, eligibility, guardrail, roster or cadence of the
  operation. If he asks for one, that is a change to the constitution, made
  through a PR.
