# SI-07: bounded active-account RLS candidate

Status: review candidate only. The SQL is nonnumbered and has not been applied to production. Preparation used existing private read-only metadata captures dated 2026-10-10; the harness makes no live calls.

## Proposed change

[active-account-rls.sql](../../../src/sql/security-candidates/active-account-rls.sql) adds eight `AS RESTRICTIVE FOR ALL TO authenticated` policies. Seven cover `public.chat_conversations`, `chat_messages`, `esco_memorias`, `productos`, `compras`, `fin_gastos`, and `monitoreos`. One covers `storage.objects` for `facturas`, `reportes-semanales`, `chequeos-fotos`, `hato-liquidaciones-fotos`, `hato-pesajes-fotos`, and `informes-visita` only.

Each addition requires `public.get_user_role() IS NOT NULL` for both visible existing rows and proposed inserted/updated rows. The captured helper is SECURITY DEFINER, uses the fixed `public, pg_temp` search path, and reads only the caller's `usuarios` row where `activo = true`. Missing, inactive, and NULL-active accounts produce NULL. A profile with NULL role also fails closed.

Original permissive policies remain unchanged. They still decide business roles, conversation ownership, memory ownership, allowed operations, and object readers. Thus active Monitor/Verificador accounts retain existing product/monitoring reads and their own memory access; this proposal does not grant them financial edits or Gerencia conversation access. Storage predicates that currently allow active report/informe readers to see other owners' files stay intact. Unknown buckets retain their original policy behavior; the restrictive predicate grants no object permission.

The candidate does not change `usuarios` policies. Its existing self-profile SELECT remains available to inactive accounts so the application can show a confirmed inactive-account screen. The helper bypasses that table's RLS under its trusted existing owner, avoiding a recursive policy dependency. No grant, permissive policy, role default, helper replacement, bucket creation, or account reactivation is proposed.

## Application prerequisites and rollback boundary

The transaction checks the captured helper body, SECURITY DEFINER setting, fixed search path, existing authenticated EXECUTE privilege, and a helper owner that can safely bypass profile RLS. It requires RLS already enabled on all eight target relations and requires the six bucket rows to exist. A missing bucket or changed helper aborts before policy creation. An existing candidate policy name causes transactional refusal rather than replacing any policy. Before any real release, recapture definitions, helper ownership/RLS bypass privileges, policy roles/predicates, table RLS flags, grants, and bucket rows; review differences instead of relaxing the preflight.

The eight policy additions are the complete candidate boundary. Removal of these named additions would restore the prior permissive-policy behavior; that restoration would also restore the exposures this candidate closes. Production application or rollback is a separate owner-reviewed release step.

## Synthetic verification

Run `python3 scripts/security/active-account-rls-postgres.py` from the repository. The completed local run passed 977 synthetic assertions plus verified container/tmpfs cleanup on PostgreSQL 17.6. The standalone harness embeds all 54 captured policy records and the exact two helper definitions, so it does not require the private evidence files at runtime. It creates minimal synthetic supporting schemas, `auth.uid()`, an explicitly SECURITY INVOKER probe, fixture-only grants, and fabricated accounts/rows. The supporting table columns model the captured predicates, not the full live schema.

The harness uses the cached PostgreSQL 17.6 image pinned to digest `00bc86618629af00d2937fdc5a5d63db3ff8450acf52f0636ec813c7f4902929`, clears Docker endpoint/context/TLS selectors, and selects the local Unix socket explicitly. The container has network disabled, no ports, no bind mounts, read-only root, tmpfs database/socket/temp paths, resource limits, and `--pull=never`. It removes the container and tmpfs in `finally` and verifies removal even if a test fails.

Ordinary `authenticated` SQL roles exercise SELECT/INSERT/UPDATE/DELETE under fabricated active Gerencia, Administrador, Monitor, and Verificador identities; the same four inactive roles, missing/NULL-active profiles, and empty identity; own and foreign rows; and every listed bucket plus an unknown bucket. Baseline and candidate results must match exactly for active accounts, while inactive/missing identities must gain no access. The harness reproduces the captured inactive-memory, missing-profile product read, and inactive-storage-reader gaps before adding the restrictive gates. It checks self-profile access, unchanged original permissive policies, missing-bucket/helper-body/search-path/ownership and disabled-RLS refusal, duplicate application refusal, anonymous denial, refused owner transfer, and refused object moves to unknown buckets.

## Required release regression gates and limits

Before release, test the actual deployed PostgREST/Storage paths with nonprivileged session tokens in an owner-approved isolated project. Confirm same-user token refresh, inactive profile retrieval, role-specific reads/writes, owned and foreign conversation/memory access, bucket reads/uploads/replacements/deletes, and post-login owner remount behavior. Verify actual table/function privileges and every live policy, including any added after the captured snapshot. Existing object readers must not disappear for active accounts, and broader business-role access must not appear.

This harness verifies PostgreSQL policy composition for the captured predicates. It does not certify real JWT verification, the complete Supabase Auth/Storage service, signed URLs, already-downloaded files, public bucket HTTP access, other tables/buckets, triggers, views, security-definer RPC authorization, table owners, BYPASSRLS/service-role paths, or all application workflows. Restrictive RLS does not revoke already-issued signed URLs or protect a security-definer function that bypasses RLS; those require separate review. A full authentication or service-role certification claim is unsupported.
