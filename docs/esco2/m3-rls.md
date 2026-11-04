# Esco 2.0 M3: RLS probe of the labor tables

Date: 2026-11-03 (Bogotá). Project `ywhtjwawnkeqlwxbvgup` (production).
Method: `public.po_sonda(...)` (migration 170). Each probe ran in a transaction that the
function always rolls back. Zero rows were changed. User ids are omitted from this public
file; they are real rows of `usuarios` (10 rows, all `activo = true` on the probe date).

## Why this probe exists

Decision D27: the `esco-consultas` function reads Supabase with the caller's JWT, so RLS
applies to every read. The plan (M3, first task) requires proof of what RLS returns for each
caller before the function is written.

## Columns that `DatosLabores` needs

| Table | Columns | Type notes |
|---|---|---|
| `registros_trabajo` | `id, tarea_id, lote_id, fecha_trabajo, fraccion_jornal, costo_jornal` | `fraccion_jornal` is ENUM `0.25 \| 0.5 \| 0.75 \| 1.0` (arrives as text); `costo_jornal` numeric, nullable |
| `tareas` | `id, nombre, estado, tipo_tarea_id, jornales_estimados` | `estado` ENUM `estado_tarea` |
| `tipos_tareas` | `id, nombre, categoria` | `categoria` ENUM `categoria_tarea` |
| `lotes` | `id, nombre, activo` | |

The function also reads `usuarios (id, rol, activo)` for the caller's own row.

## Grants

`anon` and `authenticated` both hold `SELECT` on all five tables
(`has_table_privilege`). So RLS alone decides what each caller sees.

## SELECT policies in force (2026-11-03)

| Table | Policy | Roles | Predicate |
|---|---|---|---|
| `registros_trabajo` | `authenticated_select_registros_trabajo` | authenticated | **`true`** |
| `registros_trabajo` | `Gerencia full access…`, `Administrador access…`, `Verificador read…` | authenticated | own `usuarios` row with that role and `activo = true` |
| `tareas` | `Gerencia full access…`, `Administrador read…`, `Verificador read…` | authenticated | role + `activo = true` |
| `tipos_tareas` | same three as `tareas` | authenticated | role + `activo = true` |
| `lotes` | `Usuarios autenticados pueden leer lotes` | authenticated | **`true`** |
| `lotes` | `Gerencia acceso total`, `Administrador lee lotes` | public | `get_user_role()` (filters `activo`, migration 137) |
| `usuarios` | `Usuario ve su perfil` | public | `id = auth.uid()` OR Gerencia |

## Results

Query per persona: row counts read through the exact column lists above.
`registros_trabajo` held 3,377 rows, all with `costo_jornal`.

| Persona | `get_user_role()` | registros | con costo | tareas | tipos | lotes | own `usuarios` row visible |
|---|---|---|---|---|---|---|---|
| (a) Gerencia, active | Gerencia | 3,377 | 3,377 | 75 | 43 | 9 | yes (sees all 10) |
| (b) Administrador, active | Administrador | 3,377 | 3,377 | 75 | 43 | 9 | yes (1) |
| (c1) Gerencia, deactivated (`activo=false`, simulated) | NULL | **3,377** | **3,377** | 0 | 0 | **9** | yes (1) |
| (c2) Verificador, active (simulated) | Verificador | 3,377 | 3,377 | 75 | 43 | 9 | yes (1) |
| (c3) authenticated, no `usuarios` row | NULL | **3,377** | **3,377** | 0 | 0 | **9** | no (0) |
| (d) `anon` | NULL | 0 | 0 | 0 | 0 | 0 | no (0) |

A `Monitor` persona could not be simulated: `rol_usuario` has only `Administrador`,
`Verificador`, `Gerencia`. The Monitor role referenced by `ProtectedRoute` does not exist in
the database enum.

## Verdict for the Esco path

1. **Gerencia is not blocked.** An active Gerencia user reads every column the core needs.
2. **`anon` reads nothing.**
3. **Finding (pre-existing, not created by Esco): RLS does not exclude deactivated or
   profile-less sessions from `registros_trabajo` or `lotes`.** The two `USING (true)`
   policies let any authenticated session read all labor rows, including `costo_jornal`
   (cost derived from salaries), and all lots. `tareas` and `tipos_tareas` do filter
   `activo`, so such a session gets labor rows without task names.
   The same exposure already exists today for any browser session through PostgREST.
4. **Consequence for `esco-consultas`:** RLS is not a sufficient gate for this function.
   The function's own check (`usuarios.rol = 'Gerencia' AND activo = true` on the caller's
   row, read with the caller's JWT, before any planning or data read) is the access
   control, not a second layer. The function fails closed when the row is missing, inactive
   or not Gerencia. The own-row read works for every persona above that has a row.
5. Administrador and Verificador read all labor data through RLS. The function still refuses
   them (403) because D27 scopes Esco 2.0 to Gerencia.

## What was not done

- No migration was written. Closing the two `USING (true)` policies is a separate decision:
  the browser app may depend on them (labor screens, Telegram flows that run as
  `authenticated`), and migration 133 deliberately left SELECT policies out of scope.
- Column-level privileges were not changed or tested beyond the column lists above.

## D28 follow-up (2026-11-03): migration 190, written and rehearsed, not applied

Santiago decided to close the two policies (D28). Migration
`src/sql/migrations/190_select_lotes_registros_trabajo_activo.sql` changes both predicates from
`true` to `(SELECT public.get_user_role()) IS NOT NULL` with `ALTER POLICY`. Since migration
137, `get_user_role()` is NULL for an inactive or profile-less session and the role for any
active one, so no role list is needed: Verificador, which reads `lotes` only through this
policy, keeps its access.

The browser-dependency risk noted above does not apply to this predicate: every active
account keeps exactly the access it had. Telegram runs as `service_role`, which bypasses RLS.

Rehearsal with `po_sonda` (all rolled back; live policies verified unchanged afterwards):

| Run | `lotes` | `registros_trabajo` | `get_user_role()` |
|---|---|---|---|
| Before, profile-less session | 9 | 3,377 | NULL |
| After, profile-less session | 0 | 0 | NULL |
| After, active Gerencia session | 9 | 3,377 | Gerencia |

Apply only with Santiago's approval. Order: migration only; no deploy is needed.

## Applied (2026-11-04)

Santiago approved the migration on 2026-11-04. It was applied to production with
`apply_migration`; live ledger version `20261104182847`. Before applying, the preconditions
were checked against the live catalog: both predicates still `true`, 12 policies on the two
tables, 10 accounts (6 Gerencia, 4 Administrador), all active, and no other migration
numbered 190 on any remote branch. The migration's own guards passed.

Verification after applying, with `po_sonda` (all rolled back):

| Persona | `get_user_role()` | `lotes` | `registros_trabajo` |
|---|---|---|---|
| Active Gerencia | Gerencia | 9 | 3,388 |
| Active Administrador | Administrador | 9 | 3,388 |
| Profile-less session | NULL | 0 | 0 |
| Administrador simulated as inactive | NULL | 0 | 0 |

Totals as `postgres`: 9 lotes and 3,388 registros. Both policies now read
`(SELECT get_user_role()) IS NOT NULL`, `TO authenticated`; still 12 policies.

## How to repeat

```sql
select public.po_sonda(
  $a$select public.get_user_role()::text, (select count(*) from public.registros_trabajo) …$a$,
  ARRAY[
    $b$select set_config('request.jwt.claims', '{"sub":"<usuarios.id>","role":"authenticated"}', true)$b$,
    $b$set local role authenticated$b$
  ]);
```

To simulate a deactivated user or another role, add a first step
`update public.usuarios set activo = false where id = '<id>'` (rolled back with the rest).
