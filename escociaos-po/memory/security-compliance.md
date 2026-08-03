# Memoria — Security Compliance

Escrita solo por el orquestador (ver `README.md`). Inyectada completa en el
prompt del agente en cada corrida.

## Estados aceptados
- `puedeAccederModulo` falla ABIERTO por diseno (profile null o rol '' → true).
  Documentado en el CLAUDE.md raiz. No es un hallazgo.
- El control de modulos (`modulos_acceso`) es visibilidad de navegacion, NO un data
  boundary. Reportar solo si un dato Gerencia-only queda expuesto por otra via.
- Las 4 tablas con `rls_enabled_no_policy` (kv_store_1ccce916, telegram_conversations,
  telegram_mensajes, telegram_sessions) son deny-all por diseno. Lo que SI hay que
  revisar cada corrida: que ninguna tabla NUEVA aparezca en esa lista y que
  `telegram_usuarios` conserve su politica Gerencia-only. [corrida: 2026-08-03-lunes]
- Las 13 tablas `fin_*` estan correctamente cerradas a Gerencia. Excepciones
  verificadas: `fin_proveedores` (mig 037), `fin_transacciones_ganado` (mig 059).
  Sin tablas `fin_*` nuevas. [corrida: 2026-08-03-lunes]
- Los 3 endpoints hato (chequeo preview/commit/foto) SI validan autorizacion:
  `verificarAcceso()` en hato-chequeo-commit.ts:69-98. Patron de referencia del repo.
  [corrida: 2026-08-03-lunes]
- `.env`/`.env.local` en .gitignore y nunca commiteados. Ninguna service role key
  literal en src/ (las 10 coincidencias son `Deno.env.get(...)`). El unico token
  commiteado es el anon key esperado en `src/utils/supabase/info.tsx:4`.
  [corrida: 2026-08-03-lunes]
- **PR #97 + migraciones 073-076: CIERRE VERIFICADO en produccion. No re-investigar.**
  Bundle v197 lleva `verificarAccesoGerencia` invocada antes de toda mutacion en
  crear/editar/eliminar; index.ts:72-82 pasa el Context; `UsuariosConfig.tsx:54-58`
  manda el JWT de sesion. 073 verificado por catalogo: 0 grants de UPDATE sobre
  `usuarios` para anon/authenticated, politica eliminada, las 3 funciones SECURITY
  DEFINER muertas ya no existen, `search_path` fijado en las dos funciones de
  autorizacion. [corrida: 2026-08-03-lunes]
- **Vinculacion Telegram: el binding SI es correcto y no es hallazgo** —
  `bot.ts:190-215` exige `codigo_vinculacion` emitido por admin, con expiracion y
  `telegram_id IS NULL`; el middleware rechaza todo chat id no vinculado salvo
  `/start`. Lo abierto es la falta de validacion del `X-Telegram-Bot-Api-Secret-Token`
  en `handleWebhook` (bot.ts:957) — hallazgo aparte. No re-investigar el binding.
  [corrida: 2026-08-03-lunes]
- **`npm audit` — todas filtradas como ruido para esta app; no re-reportar sin un
  cambio de uso.** ws (via realtime-js) son fallos de servidor, el navegador usa
  WebSocket nativo. lodash (via recharts) son `_.template`/`_.unset`, rutas que
  recharts nunca llama. dompurify (via jspdf) solo aplica en `jspdf.html()` sobre
  markup no confiable. react-router-dom: los highs son de SSR/framework mode, la app
  es SPA sin SSR. jspdf: el LFI es la ruta Node de `addImage`. **`xlsx@0.18.5` es
  directo, high y SIN fix en npm (SheetJS salio de npm)**: el parseo solo aplica a
  archivos que suben Gerencia/Administrador autenticados — nota permanente, no
  hallazgo. [corrida: 2026-08-03-lunes]
- **Brecha LATENTE, no reportable hoy**: `contratistas` tiene las 4 politicas con
  expresion `true` para `authenticated`, asimetrico con `empleados`, que si esta
  scopeado por rol. Expone cedula y telefono de 7 contratistas. NO explotable hoy
  porque el padron es 5 Gerencia + 2 Administrador. **Se convierte en hallazgo el dia
  que exista una cuenta Verificador o Monitor — revisar el padron por rol cada
  corrida antes de descartarlo.** [corrida: 2026-08-03-lunes]

## Refutaciones
| Fingerprint | Afirmacion | Por que murio | Corrida |
|---|---|---|---|
| security/backups/392-filas-globalgap | Las tablas `backup_07*` sin RLS exponen 392 filas de observaciones GlobalGAP y son la unica evidencia de rollback de las 78 borradas | El MECANISMO sobrevivio (y bajo a P2), pero el impacto murio: `backup_075_beneficos_merge` (314 de 392 = 80%) tiene solo 2 columnas de UUID, cero contenido agronomico. Solo 78 filas son observaciones, y un join de tupla completa contra `monitoreos` vivo muestra que 63 de esas 78 tienen gemelo identico vivo. Payload unico real: **15 filas**. Ademas ningun codigo lee esas tablas, asi que filas forjadas serian inertes. Y los grants a anon son el ALTER DEFAULT PRIVILEGES estandar de Supabase heredado por las 91 tablas, NO algo que otorgaran 075/076: lo que faltó fue `ENABLE ROW LEVEL SECURITY`. | 2026-08-03-lunes |

## Navegacion
- `get_advisors('security')` ~111k chars y `('performance')` ~614k revientan el
  limite. Resumir con python (Counter sobre (name, level)).
- **El arbol REALMENTE desplegado es `supabase/functions/make-server-1ccce916/`**
  (confirmado por `entrypoint_path`), NO `src/supabase/functions/server/`. Auditar
  SIEMPRE esa copia. `get_edge_function` descarga el bundle (999k chars en v197):
  guardar a archivo con python y leer por partes. Los numeros de linea del bundle
  coinciden 1:1 con el repo. **OJO: `src/supabase/functions/server/index.ts` NO
  existe** — el arbol espejo no tiene index.ts, las rutas solo estan registradas en
  el arbol desplegado. [corrida: 2026-08-03-lunes]

## Baselines
| Metrica | Valor | Corrida |
|---|---|---|
| Advisors | security 112 (57 rls_policy_always_true, 31 function_search_path_mutable, 8+8 security_definer_executable, 4 rls_enabled_no_policy, **3 rls_disabled_in_public ERROR = los backup_07***, 1 leaked_password) | 2026-08-03-lunes |
| RLS y cuentas | **91 tablas en public, 88 con RLS** (las 3 sin RLS son los backup_07*) · **9 funciones SECURITY DEFINER** (eran 10: 073 borro 3, 074 agrego 2) · usuarios: 5 Gerencia + 2 Administrador, todos activos, **sin Verificador ni Monitor** · `fn_hato_commit_chequeo` conserva EXECUTE solo para service_role · logs_auditoria 0 filas · **edge function v197**, verify_jwt=false | 2026-08-03-lunes |

## Archivo
(vacio)
