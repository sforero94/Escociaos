# Memoria — Security Compliance

Escrita solo por el orquestador (ver `README.md`). Inyectada completa en el
prompt del agente en cada corrida.

## Estados aceptados
- `puedeAccederModulo` falla ABIERTO por diseno (profile null o rol '' → true) — decision documentada en el CLAUDE.md raiz (Module Access Control) para no bloquear a Gerencia durante la ventana de 2s del perfil. No es un hallazgo. [seed 2026-07-31]
- El control de modulos (`modulos_acceso`) es visibilidad de navegacion, NO un data boundary — no hay RLS detras, por diseno documentado. Reportar solo si un dato Gerencia-only queda expuesto por otra via. [seed 2026-07-31]
- Las 4 tablas con `rls_enabled_no_policy` (kv_store_1ccce916, telegram_conversations, telegram_mensajes, telegram_sessions) son deny-all por diseno: solo las escribe el service role. No es hallazgo. Lo que SI hay que revisar cada corrida: que ninguna tabla NUEVA aparezca en esa lista y que `telegram_usuarios` conserve su politica Gerencia-only. [corrida: 2026-07-31-dryrun-lunes]
- Las 13 tablas `fin_*` estan correctamente cerradas a Gerencia via `es_usuario_gerencia()` o el EXISTS equivalente. Excepciones documentadas y verificadas: `fin_proveedores` SELECT+INSERT extra para Administrador (mig 037), `fin_transacciones_ganado` par admin/gerencia (mig 059). No re-reportar salvo que aparezca una tabla `fin_*` nueva sin el predicado. [corrida: 2026-07-31-dryrun-lunes]
- Los 3 endpoints hato del edge function (chequeo preview/commit/foto) SI validan autorizacion: `verificarAcceso()` en hato-chequeo-commit.ts:69-98 (Bearer -> auth.getUser -> rol in Administrador/Gerencia -> 401/403). Ese es el patron de referencia del repo. `fn_hato_commit_chequeo` mantiene EXECUTE solo para service_role. [corrida: 2026-07-31-dryrun-lunes]
- `.env`/`.env.local` en .gitignore y `git log --all --name-only -- '*.env*'` vacio: ningun archivo de entorno fue commiteado nunca. Ninguna service role key literal en src/ (las 10 coincidencias son `Deno.env.get(...)`). No re-reportar salvo cambio. [corrida: 2026-07-31-dryrun-lunes]


## Refutaciones
| Fingerprint | Afirmacion | Por que murio | Corrida |
|---|---|---|---|

## Navegacion

- `get_advisors('security')` devuelve ~111k chars y `('performance')` ~614k — ambos revientan el limite de tokens. Resumir con python (json.load + Counter sobre (name, level)) y detallar solo el subconjunto relevante. [corrida: 2026-07-31-dryrun-lunes]
- El arbol REALMENTE desplegado es `supabase/functions/make-server-1ccce916/` (confirmado por `entrypoint_path` de list_edge_functions), NO `src/supabase/functions/server/`. Auditar SIEMPRE esa copia. `get_edge_function` descarga el bundle desplegado para diff byte a byte — asi se verifico el P0. [corrida: 2026-07-31-dryrun-lunes]


## Baselines
| Metrica | Valor | Corrida |
|---|---|---|
| Advisors | security 116 avisos (57 rls_policy_always_true, 36 function_search_path_mutable, 9+9 security_definer_executable, 4 rls_enabled_no_policy, 1 leaked_password) · performance 701 | 2026-07-31-dryrun-lunes |
| RLS y cuentas | 88 tablas en public, TODAS con RLS habilitado · 10 funciones SECURITY DEFINER · auth.users 7 filas, todas con perfil (5 Gerencia + 2 Administrador), sin huerfanos · edge function v196, verify_jwt=false | 2026-07-31-dryrun-lunes |


## Archivo
(vacio)
