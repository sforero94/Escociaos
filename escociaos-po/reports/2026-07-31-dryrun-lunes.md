# Escocia OS — corrida `2026-07-31-dryrun-lunes` · modo: **dry run (solo lectura)**

Ensayo del runbook del lunes antes de la primera corrida programada (2026-08-03).
**No se escribió nada**: cero filas en Notion, cero PRs, cero push, cero DDL/DML en
producción. Todo lo de abajo es lo que la corrida *habría* archivado.

Auditado contra un clon limpio de `main` en `3dfe87e` — nunca contra el árbol de
trabajo de Santiago ni sus 13 worktrees.

---

## RESUMEN (ES)

Escocia OS tiene un agujero de seguridad grave y explotable hoy: **cualquier
persona en internet puede crearse una cuenta de Gerencia**, o cambiarle la
contraseña a una cuenta existente, porque el endpoint que administra usuarios no
verifica quién lo está llamando. No hay señales de que ya haya pasado — las 7
cuentas que existen son las conocidas — pero la puerta está abierta ahora mismo y
da acceso a toda la información financiera de la finca. Es lo único de esta
corrida que no puede esperar al lunes.

Debajo de eso hay dos problemas de permisos en la base de datos (un usuario
cualquiera puede ascenderse a Gerencia; una función vieja de inventario permite
cambiar el stock sin dejar rastro) y una cosa que ya está causando daño operativo
en silencio: **el motor de alertas del hato lleva 48 alertas acumuladas que nunca
se le enviaron a nadie**, porque falta configurar el destinatario de Telegram. La
primera alerta de secado se vence mañana sin que nadie la haya visto.

La maquinaria de verificación funcionó: de 17 hallazgos propuestos, uno se cayó
completo al refutarlo, dos se corrigieron y uno se redujo a un tercio de su
alcance. Eso es lo que hace creíbles a los demás.

| | |
|---|---|
| **P0** | 1 |
| **P1** | 3 |
| **P2** | 5 |
| **P3** | 3 |
| **Refutados / retirados** | 5 |
| **Cerrados** | 0 (la base de Notion arrancó vacía) |

---

## REQUIERE TU DECISIÓN

1. **P0 — cerrar el endpoint de usuarios.** Decidir si se parcha hoy mismo (el
   fix es copiar `verificarAcceso()` que ya existe en los endpoints del hato) o
   si se desactiva temporalmente la ruta. No es una decisión de diseño, es de
   cuándo.
2. **P1 — alertas del hato sin destinatario.** Falta un `chat_id` de Telegram.
   Un solo `UPDATE` de 5 filas, pero necesita que decidas *quién* recibe: Martha,
   tú, o ambos.
3. **P1 — revocar `UPDATE` sobre `usuarios`.** El verificador confirmó que
   ningún código del navegador escribe en esa tabla, así que revocar no rompe
   nada. Necesita tu aprobación porque es un cambio de permisos en producción.
4. **P2 — duplicados de monitoreo (268 filas) y de `Beneficos`.** Ambos traen SQL
   con rollback y conteo verificado. El de monitoreo asume "gana la importación
   más reciente" — esa regla es tuya, no del agente.
5. **P2 — 46 intervalos de parto imposibles en 31 vacas.** Requiere que Martha
   revise caso por caso; el agente dejó la consulta que genera la lista.
6. **P1 operacional — fusionar el PR #95** antes del lunes 11:00 UTC, o la
   primera corrida programada no encuentra sus instrucciones.
7. **Reconectar el conector de Vercel** a la cuenta correcta
   (`santiago-foreros-projects-da8a20e8`), o la mitad de infraestructura del
   barrido sigue ciega.

---

## P0 — Producción abierta

### 1. `/usuarios/crear|editar|eliminar` no valida autorización · **P0 · confianza Alta**

**Veredicto del verificador: CONFIRMADA**, atacada por seis ángulos distintos,
ninguno se sostuvo. El verificador descargó el bundle **realmente desplegado**
(41 archivos, versión 196) y lo comparó byte a byte contra el checkout: idéntico.

- `verify_jwt = false` confirmado en vivo (`list_edge_functions`, v196, ACTIVE).
- `index.ts` registra exactamente dos middlewares — `logger` y
  `cors({origin:'*'})`. No hay middleware de auth. Las rutas ni siquiera pasan el
  `Context` de Hono al handler, así que el handler **no puede** inspeccionar
  headers aunque quisiera.
- `usuarios.tsx`: cero ocurrencias de `getUser` / `Authorization` / `Bearer`.
  Valida que `rol` sea uno de los cuatro strings válidos y llama
  `supabase.auth.admin.createUser()` con la SERVICE_ROLE key.
- La anon key y el project ref están commiteados en `src/utils/supabase/info.tsx:4`
  y el repo es público (verificado con `gh repo view`).
- Sin triggers en `public.usuarios` ni `auth.users` que puedan rechazar un
  `rol = 'Gerencia'` autodeclarado.

**Peor de lo reportado inicialmente**: `/usuarios/editar` llama
`admin.updateUserById` con una contraseña suministrada por quien llama
(`usuarios.tsx:142-151`) — o sea, también permite **tomar control de una cuenta
Gerencia existente** reseteándole la clave, y degradar el rol de cualquiera.
`/usuarios/eliminar` borra primero la fila de `public.usuarios`, lo que despoja a
un usuario real de su rol aunque el borrado de `auth.users` después falle por FK.

**Forense (solo lectura): sin evidencia de uso previo.** Las 7 cuentas de
`auth.users` tienen su perfil correspondiente, sin huérfanos en ninguna
dirección, con fechas de creación repartidas entre 2025-11 y 2026-03 — cadencia
plausible de incorporación. Salvedad honesta: esto solo muestra cuentas que
*siguen existiendo*; un atacante que creara y borrara una cuenta, o que usara
`/editar` para cambiar una contraseña, no dejaría rastro aquí. Los logs de
peticiones del edge function no se revisaron y son el único lugar donde eso
aparecería.

**Acción**: no cambiar `verify_jwt` a `true` — el webhook de Telegram y los
pg_cron de clima/alertas dependen de que siga en `false`. En cambio, copiar
`verificarAcceso()` textual de `hato-chequeo-commit.ts:69-98` con
`ROLES_PERMITIDOS = {'Gerencia'}`, aplicarlo a los tres handlers, y cambiar los 3
`fetch` de `UsuariosConfig.tsx` para que manden el access token de la sesión en
vez de la anon key. Aplicar a **ambos** árboles del edge function y redesplegar.

---

## P1

### 2. Alertas del hato: 48 pendientes que nunca se enviaron · **P1 · confianza Alta**

**Veredicto: CONFIRMADA** (subida de P2 a P1), con una corrección.

- Los 5 tipos en `hato_alertas_config` tienen `destinatario_telegram_id = NULL`.
- 48 alertas `pendiente` acumuladas 2026-07-23 → 07-30, incluidas **4 de secado**
  (PACIENCIA 07-17, VENUS 07-20, GALLEGA 07-28, ENIGMA 07-30).
- `telegram_mensajes` = 0 filas. Y de forma independiente del log:
  `sum(intentos)` = 0 sobre las 62 alertas — nunca se intentó un envío.
- El cron sí corre: `cron.job_run_details` muestra éxito diario 07-23→07-31 y el
  log del edge function tiene `POST | 200 | /hato/alertas/tick`. El motor
  *genera* bien y *salta* el despacho en `hato-alertas-tick.ts:281`.

**Corrección al hallazgo original**: el agente leyó `created_at` como fecha de
triaje. Las 14 alertas `descartada` se crearon el 07-23/24 pero se descartaron el
**2026-07-29**, las 14 en 11 segundos, por Santiago Forero — un triaje humano en
la UI. Lo que sí es cierto: ese triaje limpió exactamente las 14 históricas
obsoletas y dejó las 48 actuales intactas. Ninguna alerta ha llegado nunca a
`confirmada`.

**Agravante con fecha**: `DIAS_EXPIRACION_ALERTA = 14` y `expirar` aplica también
a `pendiente`, así que la alerta de secado de PACIENCIA (07-17) **se marca
`expirada` en el tick del 2026-08-01** sin haber sido entregada jamás. Las demás
siguen detrás.

Además: ningún frontend escribe `hato_alertas_config` (la UI de Ajustes aún no
existe), así que esto **no se puede resolver desde la app** — necesita un write
directo a la base.

### 3. Cualquier usuario puede ascenderse a Gerencia · **P1 · confianza Alta**

**Veredicto: CONFIRMADA**, cinco vías de refutación cerradas.

- La política `Usuario actualiza su login` es `USING (id = auth.uid())` /
  `WITH CHECK (id = auth.uid())` — restringe **qué fila**, nunca **qué columnas**.
- Sin triggers en `usuarios` (`pg_trigger` → `[]`), sin reglas, sin políticas
  RESTRICTIVE.
- `authenticated` tiene UPDATE sobre las 8 columnas, incluidas `rol`, `activo` y
  `modulos_acceso`. Grant a nivel tabla, sin restricción por columna.
- `es_usuario_gerencia()` y `get_user_role()` leen exactamente esa columna — no
  hay claim de JWT ni metadata alterna. Las 13 tablas `fin_*` cuelgan de ahí.

**Matices del verificador** (ninguno debilita el hallazgo): el grant a `anon` es
inerte porque `auth.uid()` es NULL sin sesión — esto es escalada **vertical de
usuario autenticado**, no un write anónimo. Una cuenta desactivada se reactiva
con `{"rol":"Gerencia","activo":true}` en la misma petición. Y el radio es mayor
al reportado: al ascender, el usuario gana la política `Gerencia acceso total`
sobre `usuarios` mismo, o sea puede cambiarle el rol a los demás.

**El fix es más simple de lo propuesto**: el verificador revisó los 8 call sites
de `from('usuarios')` en el navegador y **los 8 son SELECT**. Nada escribe
`last_login` en ningún lado — la política protege un write que no existe. Basta
`REVOKE UPDATE ON public.usuarios FROM authenticated, anon;` y borrar la política.
`service_role` (que es quien hace las mutaciones reales desde el edge function)
no se ve afectado.

### 4. `actualizar_cantidad_producto` muta stock sin rastro · **P1 · confianza Alta**

**Veredicto: CONFIRMADA pero reducida** — el hallazgo original acusaba a tres
funciones; solo **una** es realmente explotable.

- `actualizar_cantidad_producto(uuid, numeric)`: SECURITY DEFINER de `postgres`
  (que tiene `rolbypassrls`), EXECUTE otorgado a PUBLIC/anon/authenticated,
  `proconfig` null. El cuerpo entero es un `UPDATE productos SET cantidad_actual
  = cantidad_actual + p_diferencia`. Cero chequeos, y **no escribe fila en
  `movimientos_inventario`**. Verificado que no hay trigger en `productos` que lo
  compense: solo los dos `set_updated_at`.
- `registrar_salida_inventario`: **NO explotable**. Recibe `p_producto_id integer`
  contra `productos.id uuid` — no existe operador `uuid = integer`, falla en su
  primer SELECT antes de escribir nada.
- `registrar_compra`: **NO explotable**. Referencia la tabla inexistente
  `detalles_compra` e inserta en columnas que `compras` no tiene. Aborta con
  rollback.

**Threat model recentrado**: `anon` puede *llamar* la función pero no puede
enumerar los uuid de productos (ninguna policy de SELECT le aplica). La vía
realista es un usuario autenticado de bajo privilegio (Monitor, Verificador) que
sí lee los 339 uuid y luego muta el stock de cualquiera saltándose las policies
de UPDATE, sin auditoría.

Las tres son código muerto (sin call site fuera de los tipos generados), así que
cerrarlas no cuesta nada. La referencia en `docs/supabase_tablas.md:1456` a un
trigger `actualizar_stock_producto` es documentación obsoleta: no existe en
producción.

### 5. PR #95 sin fusionar bloquea la primera corrida · **P1 · confianza Alta**

El bootstrapper del lunes clona `main` y busca `escociaos-po/`. Si el PR sigue
abierto a las 11:00 UTC del 2026-08-03, la corrida no encuentra ni la
constitución ni los briefs ni la memoria.

---

## P2

### 6. No hay historial de *ediciones* en las tablas de trazabilidad · **P2**

Encontrada **independientemente por dos especialistas** (Data Integrity la puso
P1, Security la puso P2). El verificador **refutó el encuadre de ambos** y la
dejó en P2. El hecho aislado se confirma; la conclusión no.

**Confirmado**: `logs_auditoria` tiene 0 filas y `pg_stat_user_tables.n_tup_ins
= 0` — nunca recibió un INSERT en toda su vida. Ninguna de las 55 funciones ni
triggers no-internos la referencia. Su política de INSERT es `WITH CHECK (true)`,
así que si algún día se usa, cualquiera puede falsificar entradas.

**Refutado — "no hay trazabilidad"**: la atribución del *acto* está completa en
las tablas GlobalGAP. `monitoreos.monitor` 4.233/4.233; `movimientos_diarios`
`responsable` 132/132, `created_by` 132/132, más equipo, hora de inicio/fin y
condiciones meteorológicas; `aplicaciones.agronomo_responsable` 18/18. El
registro operativo que un auditor revisa (fecha, lote, producto, dosis,
responsable, clima) está ahí.

**Refutado — el marco GlobalGAP**: ninguno de los dos especialistas citó un punto
de control concreto, y el verificador dijo honestamente que no puede verificar el
estándar desde aquí. Afirmar que exige un log de cambios fila por fila era
**especulación presentada como evidencia** — justo lo que el estándar de
evidencia de la constitución prohíbe. Las menciones a GlobalGAP en el propio repo
atribuyen la trazabilidad a `movimientos_diarios`, no a una tabla de auditoría.

**Refutado — P1**: nada lee `logs_auditoria`, así que ningún usuario está
bloqueado y ningún número sale mal. El síntoma nunca se disparó.

**Lo que los dos especialistas pasaron por alto y sí es el problema real**:
`monitoreos.user_id` está poblado en **0 de 4.233** filas y
`registros_trabajo.registrado_por` en **0 de 2.500** — columnas de atribución
declaradas que la app siempre inserta como NULL. Los triggers `created_by` de las
migraciones 040/050/063 cubren finanzas y labores, **nunca las tablas de
aguacate**. Y **17 de 18** filas de `aplicaciones` tienen `updated_at` posterior a
su creación: los registros sí se editan después, y no queda constancia de quién ni
de qué cambió.

**Acción, en orden de valor**: (1) poblar `monitoreos.user_id` y
`registros_trabajo.registrado_por` con el mismo patrón `COALESCE(NEW.col,
auth.uid())` de las migraciones 040/050/063 — barato y cierra el hueco de
inserción; (2) solo si documentas una necesidad real de auditoría, cablear
`logs_auditoria` por trigger. (3) Aparte: `CLAUDE.md:149` nombra `audit_log`, que
no existe, y el párrafo de apertura promete "full traceability and audit
logging" — corregir a trazabilidad operativa, porque audit logging la app no
hace.

### 7. 46 intervalos parto-a-parto biológicamente imposibles, 31 animales

Intervalos de 60–270 días donde el contrato del módulo dice que el mínimo real es
~270. Las limpiezas documentadas solo agruparon por debajo de 60 días, así que
estos pares quedaron fuera y **no se van a autocorregir** con chequeos futuros.
Distorsiona intervalo entre partos, días abiertos y el conteo de
`umbral_partos_reemplazo` en un módulo que Gerencia está mirando.

### 8. `Beneficos` duplicado en el catálogo (espacio final) parte 463 observaciones

`'Beneficos'` (314 obs, 2025-01→2026-04) y `'Beneficos '` (149 obs,
2025-11→2026-07) conviven activos. En el mapa de calor salen como dos plagas
distintas y la tendencia se ve rota. La migración `032_unify_beneficos.sql` del
repo apunta a la variante *acentuada*, que no existe en producción, y además
nunca se aplicó. SQL de merge listo con rollback y conteos verificados (314 filas
+ 1 borrado).

### 9. 268 filas duplicadas en `monitoreos` por re-importaciones de CSV

132 grupos, 71 con incidencias divergentes entre las copias (un caso: 2,86% vs
34,29% — la diferencia entre verde y rojo). Repartidos en 17 rondas de 2025-01 a
2026-04. Las 2 rondas posteriores están limpias, o sea **la captura en vivo no
los produce**. La priorización de scouting actual no se ve afectada (solo lee la
última ronda); lo que se corrompe es la vista histórica.

### 10. Cobertura de monitoreo cayó ~60% en mayo y hay un punto ciego parcial

*(Este es el hallazgo que sobrevivió **transformado** a la refutación — ver abajo.)*
Medido por ronda, que es la única unidad válida: Ronda 24 = 134 combinaciones /
18 sublotes, Ronda 26 = 103/19, Ronda 27 = 55/12, Ronda 28 = 44/12. Cayó en mayo y
se estabilizó ahí. Causa probable visible en los datos: el campo `monitor` pasa de
`'Clara, Daniela'` hasta abril a `'Clara'` sola desde mayo — un cambio de
personal, no una falla de software.

La consecuencia real para el usuario es un **punto ciego parcial**: como la
priorización descarta en silencio cualquier (sublote, plaga) sin lectura en la
ronda actual, los 12 de 24 sublotes no visitados en la Ronda 28 desaparecen de la
vista **sin ningún indicador de "no revisado"**. El operador no puede distinguir
"no hay presión de plaga ahí" de "nadie fue". Ese hueco entre ausencia y cero es
el hallazgo defendible.

---

## P3

11. **548 avisos de rendimiento en RLS** (485 `multiple_permissive_policies`, 63
    `auth_rls_initplan` con `auth.uid()` reevaluado por fila). Nada lento hoy —
    `pg_stat_statements` no muestra ninguna consulta de la app por encima de ~1s.
    Frágil, no roto.
12. **`kv_store_1ccce916` tiene 19 índices idénticos** sobre `key` en una tabla
    vacía: el bootstrap los recrea sin `IF NOT EXISTS` y se acumulan.
13. **`es_usuario_gerencia()` y `get_user_role()` sin `search_path` fijado**, más
    la protección de contraseñas filtradas desactivada en Auth. No explotable hoy
    (PostgREST no deja fijar `search_path` por petición) pero es la única
    predicado de autorización de la app.

Y dos de higiene que no cuentan como hallazgo de producto:

- **`BUG_REPORT.md` tiene 5 meses de atraso**: de los 6 bugs "críticos" del
  Reporte Semanal, 4 están verificablemente arreglados (con `file:line` y SQL de
  respaldo para cada uno). El 3 sigue sin verificar.
- **Deriva del libro de migraciones**: dos migraciones aplicadas en producción no
  tienen archivo en el repo (hueco del 067), `fn_hato_registrar_salida` se borró
  sin registro, y el `CLAUDE.md` sigue documentando como activo el trigger
  compra→gasto que se eliminó el 2026-07-02. Sin impacto en plata (verificado:
  las compras recientes tienen su gasto manual correspondiente), pero es
  exactamente el tipo de suposición que produce una regresión silenciosa después.

---

## REFUTADOS — lo que la verificación mató

Esta sección es la que hace creíble a las demás.

1. **"El monitoreo colapsó y la priorización está ciega"** → **REFUTADA**. Tres
   errores encadenados: (a) junio=29 y julio=15 no son dos meses cayendo, son
   **una sola ronda partida por el calendario** (Ronda 28, 44 filas, 12 sublotes)
   — el propio `CLAUDE.md` prohíbe agrupar por `fecha_monitoreo` en vez de
   `ronda_id`; (b) el baseline 2025 es incomparable: todas las filas de
   2025-01→10 tienen `created_at = 2025-11-25`, o sea una importación masiva de
   papel, no captura en vivo; (c) junio-agosto son los **tres meses más bajos** de
   2025 — el hallazgo citaba el mínimo anual como prueba de no-estacionalidad.
   Y lo más importante: la vista **no está ciega**. `usePriorizacionMonitoreo.ts`
   toma la ronda más reciente sin ningún corte por antigüedad, así que renderiza
   las 44 combinaciones de la Ronda 28 perfectamente. Sobrevivió una versión
   distinta y más pequeña del hallazgo (#10).
2. **"Las plagas sin umbral económico se omiten de la priorización"** →
   **REFUTADA por el propio agente** antes de archivarla, leyendo el motor:
   `priorizacionMonitoreo.ts` les crea su propia serie con `grupo_key` null y cae
   al tercil estadístico. Las 14 plagas activas sin umbral **sí** aparecen.
3. **"`min-h-0` está muerto en el build congelado de Tailwind"** → **REFUTADA por
   el propio agente**: `globals.css:281` la define y esa hoja carga después de
   `index.css`. El comentario del test quedó desactualizado.

Además, dos hallazgos se **corrigieron** en vez de morir (el triaje de alertas del
29-jul, y las 3 funciones de inventario reducidas a 1 explotable), y uno se
**subió** de severidad (alertas del hato, P2 → P1).

---

## NO CORRIÓ

- **Vercel — deploys, logs de runtime, analytics y bundle size.** El conector
  MCP autentica contra el team `Santiago's projects`
  (`team_Ov5b46sLrIUWwVlkuCfdCgdG`), que tiene **cero proyectos**. El proyecto
  real vive en `santiago-foreros-projects-da8a20e8`. Verificado tres veces de
  forma independiente. Release & Changelog pudo sustituirlo parcialmente con los
  commit statuses de GitHub (que prueban éxito/fallo por commit pero no exponen
  logs ni errores de runtime).
- **`feature-strategy` y `code-quality`** no corren en un lunes normal — entran el
  primer lunes de cada mes. No se lanzaron en este ensayo.

---

## Estado del despliegue (verificado)

Todo lo fusionado está en producción. Edge function `make-server-1ccce916` en
v196, desplegada 2026-07-30 02:07:55 UTC, **posterior** al último commit que tocó
su árbol (`9becb94`, 00:23 UTC) — nada pendiente de redespliegue manual. Los 3
pg_cron activos (clima cada 5 min, rollup diario, tick de alertas) corrieron con
éxito hoy. `clima_lecturas` con última lectura a menos de 2 minutos.

`main` está verde: 72 archivos de test / 1.725 tests, lint sin errores, `tsc`
limpio.

---

## Nota de método

Los 6 especialistas del roster semanal corrieron en paralelo contra el mismo clon
limpio. Sobre los hallazgos de mayor consecuencia se lanzaron **6 verificadores
independientes**, cada uno instruido a *refutar* y a asumir refutación ante la
duda, sin ver el razonamiento del que lo encontró y con prohibición explícita de
explotar nada (la verificación del P0 se hizo descargando el bundle desplegado y
leyéndolo, nunca enviando una petición al endpoint).

Resultado de esa pasada: **2 hallazgos refutados**, 1 corregido en su encuadre y
bajado de severidad, 1 corregido en un dato factual, 1 reducido de 3 funciones a
1, y 1 subido de P2 a P1. Además, 2 agentes se auto-refutaron antes de archivar.

Ese es el rendimiento que justifica la fase de verificación: sin ella se habrían
archivado 3 hallazgos falsos y 2 con severidad equivocada.
