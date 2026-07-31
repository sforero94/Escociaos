# Memoria del Product Owner — disciplina de escritura

One file per agent + `_compartida.md` for cross-agent facts. This layer is what
makes the operation compound instead of accumulate: run N must be smarter than
run N−1 because of what is written here.

## The write discipline

1. **Agents never write these files.** Each agent returns a `memoria_deltas`
   array in its output:

   ```json
   {
     "memoria_deltas": [
       {"seccion": "estados_aceptados | refutaciones | navegacion | baselines",
        "operacion": "agregar | confirmar | corregir | retirar",
        "contenido": "one entry, self-contained",
        "fingerprint": "especialidad/area/afirmacion-corta"}
     ]
   }
   ```

2. **The orchestrator validates, then writes** — in the single Phase 5 memory
   commit (`chore(po): memoria corrida <run-id>`), the only direct write to
   `main` the operation is allowed, touching only `escociaos-po/memory/**` and
   `escociaos-po/reports/**`. Validation rejects: secrets or tokens in any
   form, product facts that belong in the repo's `CLAUDE.md`/docs (memory is
   for *operational* knowledge), deltas aimed at another agent's file, and
   restatements of an entry that already exists (use `confirmar` instead —
   it updates the entry's run id without duplicating it).

3. **`confirmar` is not bureaucracy** — it is the pruning signal. An entry's
   trailing `[corrida: <run-id>]` is the last run that relied on it.

## Sections in every agent file

- **Estados aceptados** — things that look like findings but are known-accepted.
  Never re-file one; `confirmar` it if re-observed.
- **Refutaciones** — the ledger of killed claims. Highest-value section: check
  it *before* investigating anything that pattern-matches an entry. Each row:
  fingerprint · claim · why it died · run id.
- **Navegación** — queries that worked, join shapes, tool quirks. Cheap to keep,
  saves the most wall-clock.
- **Baselines** — numbers the next run compares against (row counts, error
  rates, adoption metrics), each with the run id that measured it.
- **Archivo** — cold storage (see pruning).

## Pruning — applied by the orchestrator at Phase 5

- Any entry in a hot section whose `[corrida:]` is **10 runs or older** moves to
  `## Archivo` (dated).
- Archivo entries **older than 6 months** are deleted in the same commit.
- A hot section that exceeds ~40 entries must be consolidated (merge near-
  duplicates) before anything new is added — the whole file gets injected into
  the agent's prompt, so bloat here is prompt bloat there.

## Seeds

Entries marked `[seed 2026-07-31]` were provided by Santiago at setup from the
prototype runs. Treat them as accepted but **verify the exact artifact names on
first contact** (e.g. table names) and `corregir` them if the prototype's
wording was imprecise.
