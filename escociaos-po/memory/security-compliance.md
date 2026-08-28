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
- Los 3 endpoints hato NUEVOS de la v200 (`/hato/produccion/quincena/foto`, `/hato/pesaje/foto`, `/hato/pesaje/commit`) SI validan con el mismo `verificarAcceso()` de referencia: hato-produccion-quincena-foto.ts:91/267, hato-pesaje-foto.ts:91/257, hato-pesaje-commit.ts:59/160. **6 de 6 endpoints hato gateados.** No re-investigar salvo ruta nueva. [corrida: 2026-08-10-lunes]
- Los 7 buckets de Storage son `public=false`. Los 2 nuevos (`hato-liquidaciones-fotos`, `hato-pesajes-fotos`, 2026-08-06) traen las 4 politicas del patron 072. `photos` y `monitoreo-fotos` sin politicas = deny-all para el navegador, y esta bien (`monitoreo-fotos` solo lo escribe el bot con service role). Unica anomalia: `reportes-semanales`, ya filada. [corrida: 2026-08-10-lunes]
- Brecha LATENTE de `contratistas` re-verificada, SIGUE latente: padron 5 Gerencia + 2 Administrador, sin Verificador ni Monitor. **El bucket `reportes-semanales` pertenece a la MISMA clase latente — revisar los dos juntos contra el padron cada corrida.** [corrida: 2026-08-10-lunes]
- `npm audit --omit=dev`: mismo conjunto de 8 (2 criticas, 5 altas, 1 moderada), filtradas como ruido. Re-chequeada la critica de jspdf que parecia nueva (AcroForm -> ejecucion de JS): `grep -rn AcroForm src/` no devuelve nada, la app no construye formularios PDF. No re-reportar sin cambio de uso. [corrida: 2026-08-10-lunes]
- Unico token commiteado ademas del anon key esperado: `src/components/Layout.tsx:515`, una URL firmada de Storage para `photos/ehlogo.png` con exp 2035. Es un bearer de lectura de UN png de logo en un bucket privado — **nota permanente, no hallazgo**. [corrida: 2026-08-10-lunes]

## Refutaciones
| Fingerprint | Afirmacion | Por que murio | Corrida |
|---|---|---|---|
| security/backups/392-filas-globalgap | Las tablas `backup_07*` sin RLS exponen 392 filas de observaciones GlobalGAP y son la unica evidencia de rollback de las 78 borradas | El MECANISMO sobrevivio (y bajo a P2), pero el impacto murio: `backup_075_beneficos_merge` (314 de 392 = 80%) tiene solo 2 columnas de UUID, cero contenido agronomico. Solo 78 filas son observaciones, y un join de tupla completa contra `monitoreos` vivo muestra que 63 de esas 78 tienen gemelo identico vivo. Payload unico real: **15 filas**. Ademas ningun codigo lee esas tablas, asi que filas forjadas serian inertes. Y los grants a anon son el ALTER DEFAULT PRIVILEGES estandar de Supabase heredado por las 91 tablas, NO algo que otorgaran 075/076: lo que faltó fue `ENABLE ROW LEVEL SECURITY`. | 2026-08-03-lunes |
| security-compliance/advisors/rls-policy-always-true-retirado | "Los advisors bajaron de 112 a 13, luego las politicas always-true se arreglaron" | FALSO. El linter de Supabase **dejo de emitir la categoria `rls_policy_always_true`** (57 filas en la baseline del 2026-08-03, 0 hoy) y las 7 politicas siguen vivas. La bajada se debe a 081/082/093 MAS la retirada de la categoria. **Nunca leer una bajada de advisors como prueba de cierre.** Unico detector que queda, correrlo TODAS las corridas: `SELECT tablename, policyname, cmd, roles::text, coalesce(qual,with_check) FROM pg_policies WHERE schemaname='public' AND (roles::text LIKE '%public%' OR roles::text LIKE '%anon%') AND coalesce(qual,with_check) !~* '(auth\.uid\|get_user_role\|es_usuario_gerencia\|auth\.role\|auth\.jwt)'` | 2026-08-10-lunes |

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
- `get_advisors('security')` YA NO revienta el limite: 13 lints, se lee entero. `get_advisors('performance')` (~614k) sigue reventando — no llamarlo; reproducir por SQL y declararlo. **Para grants de tabla usar `aclexplode(pg_class.relacl)`, NUNCA `information_schema.role_table_grants`**: como rol `postgres` esa vista devuelve VACIO para tablas con grants a anon/authenticated y hace parecer que no hay permisos. [corrida: 2026-08-10-lunes]
- Para politicas, leer `pg_policy` crudo y no solo `pg_policies`: `polroles = {0}` es el pseudo-rol PUBLIC (incluye `anon`), y `polpermissive` es lo unico que dice si existe una politica RESTRICTIVE que cierre el hueco. Una politica UPDATE con `with_check` NULL **cae de vuelta a USING**. [corrida: 2026-08-10-lunes]

## Baselines
| Metrica | Valor | Corrida |
|---|---|---|
| Advisors | security 112 (57 rls_policy_always_true, 31 function_search_path_mutable, 8+8 security_definer_executable, 4 rls_enabled_no_policy, **3 rls_disabled_in_public ERROR = los backup_07***, 1 leaked_password) | 2026-08-03-lunes |
| RLS y cuentas | **91 tablas en public, 88 con RLS** (las 3 sin RLS son los backup_07*) · **9 funciones SECURITY DEFINER** (eran 10: 073 borro 3, 074 agrego 2) · usuarios: 5 Gerencia + 2 Administrador, todos activos, **sin Verificador ni Monitor** · `fn_hato_commit_chequeo` conserva EXECUTE solo para service_role · logs_auditoria 0 filas · **edge function v197**, verify_jwt=false | 2026-08-03-lunes |
| Advisors security | **112 -> 13**. 7 rls_enabled_no_policy (4 conocidas + respaldos.backup_080/083/090, que son el fin deseado); 4 *_security_definer_executable (es_usuario_gerencia + get_user_role = ACEPTE PERMANENTE, y fn_cleanup_compra_dependencies, que SI valida a su llamante — cuerpo verificado, RAISE 42501); 1 auth_leaked_password_protection. Categorias `rls_policy_always_true` y `function_search_path_mutable` desaparecieron del linter (ver refutacion) | 2026-08-10-lunes |
| RLS y cuentas | **89 tablas en public, 89 con RLS (100%), 267 politicas**. Delta vs 08-03 (91/88): -3 backups movidos a `respaldos`, +1 `hato_correcciones` (mig 084). **10 funciones SECURITY DEFINER** (+fn_hato_registrar_correccion), las 10 con `search_path` fijado; solo 3 alcanzables por roles de navegador. usuarios: 5 Gerencia + 2 Administrador. logs_auditoria 0 filas. hato_correcciones 0 filas, 5 triggers activos. `usuarios` sigue sin grant de UPDATE (073 se sostiene). **Edge function v197 -> v200**, verify_jwt=false. Storage: 7 buckets privados; reportes-semanales 43, facturas 5, hato-liquidaciones-fotos 4, photos 2, monitoreo-fotos 1, chequeos-fotos 0, hato-pesajes-fotos 0 | 2026-08-10-lunes |


## Corrida 2026-08-24-lunes
- Baseline: 97 tablas en public, 97 con RLS (100%), 280 politicas, 11 funciones SECURITY DEFINER (todas con
  search_path fijado). Delta vs 08-10 (89/89/267/10): +8 tablas y +1 secdef. Advisors security 13 -> 21 lints,
  sin categoria nueva — la subida es crecimiento de respaldos, no degradacion.
- **EL DETECTOR DE POLITICAS always-true TENIA UN HUECO Y YA COSTO UN HALLAZGO TARDIO.** Filtraba por
  `roles LIKE '%public%' OR '%anon%'`, asi que NO VE las politicas que apuntan solo a `{authenticated}`.
  Corriendolo tal cual daba 1 fila y parecia que estaban cerradas. En realidad quedan 4 DELETE con qual=true
  sobre aplicaciones_productos/calculos/lotes y movimientos_diarios_productos, mas UPDATE+DELETE sobre
  contratistas. **Consulta correcta: pg_policies en public donde coalesce(qual,with_check) no mencione
  auth.uid/get_user_role/es_usuario_gerencia/auth.role/auth.jwt, SIN condicionar el rol.**
- Esas 4 tablas NO tienen politica de Gerencia/Administrador: tienen exactamente 3 politicas cada una
  (select/insert/delete, todas true). La always-true no es redundante — es el UNICO camino de borrado, y es
  lo que hace funcionar el borrar-y-reinsertar de CalculadoraAplicaciones.tsx:492/501/505. Acotar por
  PROPIETARIO romperia ese flujo; hay que acotar por ROL.
- has_table_privilege('anon', ...,'DELETE') es true en esas 4 (trampa del ALTER DEFAULT PRIVILEGES, mig 081),
  pero anon no figura en ninguna politica. Estan a UNA politica 'TO public' de ser borrables anonimamente.
- **VERIFICADO Y ESCALADO A P0**: los 2 ids de Telegram del repo publico son REALES. Metodo para volver a
  comprobarlo sin exponerlos: extraer los literales de 9-12 digitos, md5 local, cotejar contra
  md5(telegram_id::text) de telegram_usuarios. Uno es Gerencia (con modulo 'consultas' = toolset completo de
  Esco, incluido el P&G), el otro Administrador. El webhook no valida nada en NINGUNO de los dos arboles
  (diff -q identicos) y llama bot.handleUpdate directo en vez de webhookCallback(...,{secretToken}), que es
  el unico sitio donde Grammy validaria. POST anonimo -> 200.
- Vault tiene 2 secretos: acciones_tick_secret y hato_alertas_tick_secret. **clima_sync_secret NO EXISTE** —
  o sea el paso 1 de los 4 de la 105 tampoco se hizo, no solo la migracion.
- La 104 se sostiene: 0 politicas TO public con predicado true en verificaciones_*, anon sin privilegios.
- Las 8 tablas nuevas nacieron bien cerradas (RLS por rol, GRANT por columna, cero anon). El patron
  073/081/101 ya se aplica solo.
- El contrato 'el paquete v1 de acciones no lleva cifras fin_*' SE VERIFICO y se cumple (9 corridas, 0 match
  contra gasto|ingreso|utilidad|margen|pyg|flujo_caja|precio).
- Brecha LATENTE de contratistas re-verificada por 3a corrida. Padron 2026-08-24 = 5 Gerencia + 3 Administrador,
  sigue sin Verificador ni Monitor. **Revisar contratistas, el bucket reportes-semanales y las 4 DELETE de
  aplicaciones JUNTAS cada corrida — son la MISMA clase latente y se activan todas el mismo dia.**

## Corrida 2026-08-24-drenaje-continuacion
- **LA CONSULTA CORRECTA DEL BARRIDO always-true, para no volver a estrenar el hueco.**
  `cmd IN ('DELETE','ALL') AND permissive='PERMISSIVE' AND btrim(qual)='true'` sobre
  `pg_policies` de `public`, **SIN filtro de rol**. El detector historico filtraba
  `roles LIKE '%public%'` y por eso no veia las `TO authenticated`, que son la mayoria.
  Descontar siempre `reportes_semanales`: es `TO service_role` y no es de esta clase.
- **Estado a 2026-08-24: quedan 8** (eran 17). La 110 cerro 7 tablas de la cadena GlobalGAP
  y la 114 cerro `contratistas` y `lotes`. Las 8 restantes son de monitoreo y produccion:
  `apiarios`, `mon_colmenas`, `mon_conductividad`, `monitoreos`,
  `plagas_enfermedades_catalogo`, `produccion`, `rondas_monitoreo`, `sublotes`. **Ya filadas
  como hallazgo propio** — no re-filar, y no volver a contar 17.
- **LA RLS DE LA TABLA HIJA NO SE EVALUA DURANTE UNA CASCADA.** Las acciones de integridad
  referencial de PostgreSQL corren como el dueno de la hija y con `SECURITY_NOFORCE_RLS`.
  Consecuencia operativa: endurecer una hija **no cierra la puerta** si el padre sigue siendo
  borrable por cualquiera. Es lo que obligo a la 114 despues de la 110. **Cada vez que se
  acote el DELETE de una tabla, revisar quien la referencia con `ON DELETE CASCADE`.**
- **Acotar por PROPIETARIO habria roto produccion en la 110, y esto se repite.** Esas tablas
  no tienen ninguna politica de Gerencia/Administrador, asi que la always-true era el UNICO
  camino de borrado — es lo que hace funcionar el borrar-y-reinsertar de
  `CalculadoraAplicaciones.tsx:492/501/505` — y ninguna tiene `created_by`. **Antes de acotar
  una always-true, buscar quien la usa para borrar-y-reinsertar.** Para las 8 que quedan los
  sospechosos son la carga masiva de monitoreo y la captura de cosecha.
- **La 109 SI esta aplicada, por el panel de Storage.** No deja fila en el ledger. Comprobar
  en `pg_policies` sobre `storage.objects`; hoy `Authenticated users can delete reports`
  lleva `u.rol = 'Gerencia'`. No re-abrir como pendiente.

## Archivo
(vacio)

## Corrida 2026-08-24-drenaje-cierre

- **CORRECCION AL PADRON: hoy son 5 Gerencia + 3 Administrador (8 activas, CERO
  inactivas).** La memoria decia 5+2 desde el 2026-08-10. Sigue sin existir
  ninguna cuenta Verificador, asi que las dos brechas latentes gemelas
  (`contratistas` y el bucket `reportes-semanales`) **siguen latentes**. Volver a
  contar el padron cada corrida antes de descartarlas.
- **`Monitor` NO es una etiqueta de `public.rol_usuario`.** Contra `pg_enum` el
  enum tiene exactamente tres: `{Administrador, Verificador, Gerencia}`. El
  `CLAUDE.md` raiz nombra cuatro roles e incluye Monitor; sea lo que sea ese rol
  (el bot de Telegram), **no vive en este enum**. Un hallazgo que diga «el dia que
  exista una cuenta Monitor» esta mal redactado: el disparador real es
  **Verificador**, y es el unico que queda.
- **Politicas de Storage: 7 buckets, solo 5 con politicas.** `monitoreo-fotos`
  (1 objeto) y `photos` (2) **no tienen ninguna** — son deny-all para el
  navegador, que NO es lo mismo que «reservan el borrado». No los cuentes entre
  los que aplican el patron 072.
- **El webhook de Telegram fue una REGRESION, no una omision.** `git show e799142`
  (2026-03-18) elimina cuatro lineas que ya validaban
  `X-Telegram-Bot-Api-Secret-Token` contra `TELEGRAM_WEBHOOK_SECRET` y devolvian
  401. Y `supabase secrets list` muestra que ese secreto se creo el 2026-03-18 a
  las 21:18, **cuatro minutos despues** de `TELEGRAM_BOT_TOKEN` (21:14) — la firma
  de un alta que si registro el webhook con `secret_token`. **Consecuencia
  operativa: es plausible que Telegram lleve desde marzo mandando el encabezado
  correcto, y que baste con desplegar.** No es demostrable sin el bot token
  (`getWebhookInfo` no revela si hay `secret_token`).
- **`supabase secrets list` devuelve nombres, `updated_at` y digests sha256 — nunca
  valores.** No vuelvas a intentar leer un secreto por ahi. Y los digests SI
  sirven: son la unica forma de fechar cuando se creo o roto cada secreto, que es
  como se dato la regresion de arriba.

[corrida: 2026-08-24-drenaje-cierre]

## Drenaje del viernes (corrida 2026-08-28-viernes)
- **Hallazgo #47 CERRADO por la migracion 123, APLICADA a produccion el 2026-08-28** por el carril
  `ddl_aditivo` desatendido (PR #182 sin fusionar). `authenticated_select_contratistas` pasa de
  `qual = true` a `((SELECT get_user_role()) = ANY (ARRAY['Gerencia','Administrador']))`, y `anon`
  pierde el GRANT de SELECT. **Cero filas tocadas** (7 antes y despues).
  [corrida: 2026-08-28-viernes]
- **`contratistas.cedula` y `.telefono` estan en NULL en las 7 filas** (verificado en vivo por el
  autor y re-verificado por el revisor). El dano material de HOY era **cero**; la exposicion era
  estructural, no una fuga en curso. Confirma P2 latente. **No re-reportar como fuga activa.**
  [corrida: 2026-08-28-viernes]
- **Al acotar una tabla por RLS hay que barrer TAMBIEN los caminos de ESCRITURA, no solo los
  `select()`.** La revision adversarial encontro 13 lectores contra los 10 del autor: los 3 extra son
  `Contratistas.tsx:147/158/207` (update/insert/delete), porque **`UPDATE` y `DELETE` reusan la
  politica de SELECT cuando la sentencia referencia una columna**. [corrida: 2026-08-28-viernes]
- **`calcular_costo_jornal()` es un lector de `contratistas` DENTRO de la base y es SECURITY
  INVOKER** (`prosecdef=false`), trigger BEFORE INSERT/UPDATE sobre `registros_trabajo`. Si el SELECT
  no encuentra fila, `costo_jornal` queda **NULL**, no 0. **Barrer siempre `pg_get_functiondef` y
  `pg_rewrite` ademas del repo antes de acotar una tabla.** [corrida: 2026-08-28-viernes]
- **Una vista sin columnas PII NO es salida en este esquema, y el motivo es general**: los tres roles
  de la app (Gerencia/Administrador/Verificador) comparten el MISMO rol de Postgres `authenticated`,
  asi que un `GRANT SELECT (col)` por columna no los distingue, y la RLS es por fila. Solo queda
  politica por rol, o vista + cambio de codigo (que ya no es `ddl_aditivo`).
  [corrida: 2026-08-28-viernes]
- **`Verificador` no tiene NINGUN `RoleGuard allowedRoles` en todo el repo**; su superficie disenada
  son las `verificaciones_*`. Eso justifica dejarlo fuera de los predicados de labores/aplicaciones.
  [corrida: 2026-08-28-viernes]
- **CLASE DE HALLAZGO SIN FILAR (el viernes no fila) — politicas `INSERT`/`UPDATE` con predicado
  `true`.** El barrido historico de always-true solo cubrio `cmd IN ('DELETE','ALL')`, asi que INSERT
  y UPDATE **nunca se barrieron en todo el esquema**. Confirmado en `contratistas` (2 politicas) y en
  `registros_trabajo` (`WITH CHECK (true)`). **Consulta para el lunes: `cmd IN ('INSERT','UPDATE')`
  sobre `pg_policies` de `public`, sin filtro de rol.** [corrida: 2026-08-28-viernes]
- **La migracion 120 sigue FUSIONADA Y SIN APLICAR.** Verificado hoy contra `pg_policies`: las 8
  tablas conservan `DELETE USING (true)`. Fusionada el 2026-08-25 (PR #176), asi que **el umbral de
  7 dias de la constitucion vence el 2026-08-31**. Su PR dice "Awaiting your go" y en esta sesion no
  hubo turno humano, asi que no se aplico. [corrida: 2026-08-28-viernes]
