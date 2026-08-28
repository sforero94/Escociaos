# Brief técnico — Ronda mensual de inventario

**CTO · 2026-08-28 · rev. 1 (cierre de §15) · rev. 2 (sincronización con `main`) · rev. 3 (Fase 0 aplicada)**
**Estado: diseño técnico CERRADO. Fase 0 APLICADA. Fases 1-6 en ejecución.**
Producto de referencia: [`docs/plan_verificacion_inventario.md`](plan_verificacion_inventario.md) — **entrada, no objeto de discusión**.
Contesta el §10.1 de ese documento y todos los puntos que marca «es del CTO» / «lo decide el brief técnico».

> **Alcance.** Diseño técnico y plan de entrega. Las reglas R-1…R-20, los criterios CA-1…CA-38, el mapeo
> causa→vía de §5.3 y las dieciséis decisiones del dueño de §9/§11 son **contrato de entrada**. Este brief
> las satisface; no las reinterpreta. Donde una de ellas resulta técnicamente cara, el costo queda escrito
> como costo — nunca como una propuesta de cambiarla.
>
> **Vocabulario.** El nombre del concepto es **«ronda de inventario»** (decisión 9.9). Ese es el nombre en
> el código, en las tablas y en la UI. El nombre de *este archivo* sigue al de su brief de producto para que
> los dos se encuentren juntos en `docs/`; es lo único que conserva la palabra «verificación».

---

## 0. Resumen ejecutivo — las once decisiones

| # | Decisión | Por qué, en una línea | §|
|---|---|---|---|
| **D-T1** | **Tablas nuevas** (`rondas_*`), no reutilizar `verificaciones_*`. Las viejas se **congelan y se rotulan**, no se borran | La tabla vieja es «una fila por producto del catálogo»; R-2/CA-15 exige exactamente lo contrario, y sus dos booleanos (`ajuste_realizado`, `aprobado`) colapsan los tres desenlaces que CA-10 prohíbe fundir | §4, §10 |
| **D-T2** | **Catálogo de causa raíz = tabla de referencia sembrada, sin política de escritura**, no ENUM | El mapeo causa→vía (§5.3) vive en la **misma fila** que la causa, así que el RPC, el cliente y el prompt no pueden discrepar. Un ENUM habría dejado el mapeo suelto en código — que es la forma del defecto de `fraccion_jornal` (106) | §4.2 |
| **D-T3** | **CA-38 se modela como dos columnas distintas + un `CHECK`**, no como un campo de texto con bandera | Una cita de Uriel y la palabra de David no comparten columna, así que la primera **no puede convertirse** en la segunda por sobrescritura. El `CHECK` es la única mitigación que sobrevive a un PR descuidado | §4.4 |
| **D-T4** | **El actor viaja explícito en el payload de todo RPC; jamás se deriva de `auth.uid()`/`auth.jwt()`** | El mismo RPC lo llaman un navegador y el bot con `service_role`. Derivarlo del JWT escribiría NULL justo en el camino que R-8 más necesita atribuido | §6.1 |
| **D-T5** | **`service_role` no falla por falta de `auth.uid()`: BYPASSEA la RLS.** Por eso cada RPC lleva su propia guarda de actor | Es la lección de la 082 parte 1 aplicada al revés: si RLS no está protegiendo la llamada, la función tiene que protegerse sola | §6.1 |
| **D-T6** | **Dos llamadas al modelo: transcribir, después interpretar** | CA-36 hace del transcrito la capa cruda. En una sola pasada el «crudo» sería un artefacto de la misma inferencia que lo interpreta, y no habría forma de distinguir un error de audición de uno de interpretación | §5.2 |
| **D-T7** | **La resolución de producto es por coincidencia normalizada EXACTA. Sin distancia de edición** | `Silicalmag`↔`Sulcamag` están a distancia 4; `Silicalmag`↔`Silicio` a 5. Un umbral que atrape el error de Santiago mapea al producto de la migración 119. R-20 no es cautela: es la única política segura acá | §5.4 |
| **D-T8** | **El esquema de salida del modelo NO tiene ranura para `teorico` ni para `via` ni para `producto_id`** | R-19 y CA-34 se sostienen porque el modelo **no tiene dónde poner** esos valores, no porque alguien los revise después | §5.3 |
| **D-T9** | **La ronda es estado de base de datos, no estado de conversación de Grammy.** El plugin se usa sólo en dos asistentes acotados | Una ronda vive días; una conversación de Grammy se traga todos los updates mientras está activa y vive en `telegram_conversations`. Además CA-37 exige que el borrador sin confirmar **sobreviva**, y un valor de sesión no sobrevive | §7 |
| **D-T10** | **El historial de C-3 es una pantalla web**, con una herramienta de Esco *adicional* y acotada | Auditar exige render determinista; CA-10 («nunca fundidos en la UI ni en el reporte») es un contrato que se puede probar en un test de componente y no se puede probar sobre un modelo que parafrasea | §9 |
| **D-T11** | **`ConteoFisico.tsx`, `NuevaVerificacion.tsx` y `aplicar_ajustes_verificacion` se borran** | Dos pantallas que escriben a una tabla retirada y un botón que reporta éxito sin ajustar nada (D-4). Y dejar una función rota de «aplicar ajustes» al lado de una que sí aplica ajustes es cómo alguien llama a la equivocada | §10 |

> ## Revisión 1 — 2026-08-28: las tres preguntas de §15, cerradas por el dueño
>
> Santiago aceptó las tres recomendaciones tal cual. **Ninguna cambia la arquitectura**; dos agregan
> superficie (un RPC y un bloque de mensaje) y una confirma una lectura que el diseño ya hacía.
>
> | # | Pregunta | Respuesta del dueño | Dónde vive ahora |
> |---|---|---|---|
> | **P-1** | ¿Uriel puede deshacer un hallazgo ya confirmado? | **Sí, opción (b): botón `Deshacer`**, precedente `hato_ev_undo` | §6.5 (RPC nuevo) · §7.4 · §4.3 · §15.1 |
> | **P-2** | ¿Alguien se entera de una excepción abierta hace >30 días? | **Sí, opción (b): línea extra en la revisión del día 15** | §8.1 (cuarto trabajo) · §8.3 · §3.4 · §15.2 |
> | **P-3** | ¿Un producto que entra a existencia durante una ronda abierta? | **Opción (a): queda fuera del alcance congelado y sale en «movimientos con la ronda abierta»** | §4.1 · §8.3 punto 4 · §15.3 |
>
> **Lo que P-1 destapó y no estaba escrito** (es la única consecuencia real de las tres): la ventana de
> deshacer necesita **dos** condiciones, no una. Que David no haya tocado la excepción es la obvia; la que
> faltaba es que **la ronda siga `en_curso`**, porque CA-5 permite cerrar con excepciones abiertas y CA-19
> emite el reporte al cerrar — así que borrar una excepción con el reporte ya emitido dejaría el reporte
> congelado nombrando N excepciones y la tabla con N−1. Detalle en §6.5.
>
> **Y una precisión que P-1 obliga a hacer en el reporte de cierre**: un transcrito devuelto a
> `preview_pendiente` por un Deshacer y abandonado ahí también es un borrador sin confirmar. `fn_ronda_cerrar`
> los normaliza a `sin_confirmar` al cerrar, para que CA-37 tenga un solo estado que contar (§4.3, §8.3).

> ## Revisión 2 — 2026-08-28: sincronización con `main` y cierre de §1.2
>
> `main` avanzó 12 commits mientras se cerraban los dos briefs (corrida de mantenimiento del viernes,
> `f98f83a..49d2206`). **Ninguna decisión de diseño cambia.** Cinco hechos sí, y tres de ellos hacían que este
> documento afirmara algo que ya no era cierto:
>
> | # | Hecho | Efecto acá |
> |---|---|---|
> | 1 | **El 123 ya está tomado**: `123_select_contratistas_por_rol.sql` (PR #182), sin relación con inventario. Máximo aplicado en el ledger = **123** | **Las cinco migraciones propuestas se renumeran 123→127 ⇒ 124→128** *(y otra vez a **125–129** en la revisión 3 — ver abajo).* Ver §4, §6, §8.2, §10, §11.2 y la tabla de fases |
> | 2 | **La pieza 3 del saneamiento ya está hecha** — `c842333` hace que `eliminarCompraConReversion` restaure `precio_unitario` desde la compra que sobrevive, o `NULL` si no queda ninguna | §11.1 y §11.2 reescritas. **§1.1 afirmaba lo contrario y estaba quedando falsa** |
> | 3 | **`NuevoMovimientoModal` ya estampa `responsable`** — `83e662f`, con test estático (`movimientoInventarioResponsable.test.ts`) | §14 riesgo 7 pasa de «sin mitigación» a **parcialmente mitigado**, con el residuo exacto |
> | 4 | **`vista_resumen_verificaciones` existe** y hace `JOIN` de las dos tablas retiradas | §10: se resuelve **dejarla viva**, con su razón. Ya no es un punto por verificar |
> | 5 | **Los otros tres puntos de §1.2 quedaron medidos** contra el catálogo vivo: la fila de prueba es como se supuso, Uriel no tiene ficha, y hay **3 productos con `precio_unitario` NULL y 8 en 0** de 226 activos | §1.2 se convierte en registro de verificación. §3.1 y §11.2 lo absorben |
>
> **Lo que el dato nuevo de precios NO dice, y es lo que importa para CA-20.** 3 NULL + 8 en cero son las
> fallas *detectables por conteo*. El caso que motivó el prerrequisito —Sulcamag en 669,96 (migración 119)— no
> es NULL ni cero: es un número **plausible y equivocado**, invisible para esa consulta. Así que la pieza 1 se
> achica pero no desaparece: lo que queda por medir es la **discrepancia contra la compra que la respalda**,
> no los nulos. Detalle en §11.2.

---

## 1. Verificación previa

### 1.1 Lo que se comprobó contra el código y contra la red

| Afirmación | Evidencia |
|---|---|
| `tipo_movimiento` es un ENUM de **4 etiquetas**: `Entrada`, `Salida por Aplicación`, `Salida Otros`, `Ajuste` | `src/types/database.ts`, `Enums.tipo_movimiento` |
| `estado_verificacion` es un ENUM de 5 etiquetas (`En proceso`…`Rechazada`) que **no** mapean a `Programada/En curso/Cerrada/Omitida` de §5.4 | `src/types/database.ts`, `Enums.estado_verificacion` |
| El ajuste manual escribe `movimientos_inventario` **y después** `productos.cantidad_actual`, en dos llamadas sueltas sin transacción, y el modo `Ajuste` **fija el saldo** (`nuevoSaldo = cantidadNum`) | `src/components/inventory/NuevoMovimientoModal.tsx:106-160` |
| `movimientos_inventario` **no tiene** ninguna columna de capturador (`created_by`/`registrado_por`); sólo `responsable text` libre — y desde `83e662f` (2026-08-28) el ajuste manual **sí lo estampa**, con el email del usuario | `src/types/database.ts`, `movimientos_inventario.Row`; `NuevoMovimientoModal.tsx:146-149`; guarda en `src/__tests__/movimientoInventarioResponsable.test.ts` |
| Cada compra **sobrescribe** `productos.precio_unitario` con el precio de esa compra | `src/components/inventory/NewPurchase.tsx:390-398` |
| ~~`eliminarCompraConReversion` revierte `cantidad_actual` y **no toca `precio_unitario`**~~ **— corregido en `main` el 2026-08-28 (`c842333`), ya no es cierto.** Hoy restaura el precio de la compra que **sobrevive** al borrado, o `NULL` si no queda ninguna | `src/components/inventory/PurchaseHistory.tsx:64-71` (el comentario que lo explica) y `:148` (`precio_unitario: precioARestaurar`) |
| `precio_unitario` significa **$/kg-L derivado**, nunca precio por bulto | `src/utils/calculosCompras.ts:13` |
| El tablero de inventario valoriza con `Σ cantidad_actual × precio_unitario` sin distinguir NULL de 0 | `src/components/inventory/MovementsDashboard.tsx:195-201` |
| D-7 confirmado: la comparación es contra `'Gerente'`, rol inexistente | `src/components/inventory/VerificacionesList.tsx:131` |
| D-8 confirmado: `if ((d.diferencia as number) !== 0)` cuenta los NULL como discrepancia, en **los dos** árboles | `src/supabase/functions/server/chat.tsx:1512` y `supabase/functions/make-server-1ccce916/chat.tsx:1510` |
| `telegram_usuarios.usuario_id` es **nullable** y referencia `auth.users(id)`; `nombre_display` es NOT NULL | `src/sql/migrations/026_telegram_bot_tables.sql:13-28`, `src/supabase/functions/server/telegram/types.ts:15-28` |
| El bot resuelve identidad en un middleware por `telegram_id` y gatea cada flujo por `modulos_permitidos`, nunca por nombre | `src/supabase/functions/server/telegram/bot.ts:108-131`, `:269-321` |
| El plugin de conversaciones **consume el update antes** que los `bot.command` globales — `/cancelar` no dispara con una conversación activa | `src/supabase/functions/server/telegram/conversations/pesajeLeche.ts:38-50` |
| Ya existe descarga de archivos de Telegram (`getFile` + `api.telegram.org/file/bot…`) | `pesajeLeche.ts:216-224` |
| `es_usuario_gerencia()` es `SECURITY DEFINER` y lee `usuarios.rol` para `auth.uid()`; con `auth.uid()` NULL devuelve falso | migración 073, líneas 22-34 y 100-101 |
| El modelo ya pinado en el repo, `google/gemini-3-flash-preview`, **acepta audio** | `https://openrouter.ai/api/v1/models`, consultado 2026-08-28: `architecture.input_modalities = ['text','image','file','audio','video']`. Es el mismo id de `hato-chequeo-foto.ts:79` |
| OpenRouter expone `ogg` entre los formatos de `input_audio` y tiene endpoint STT dedicado `/api/v1/audio/transcriptions` con **19 modelos** | `https://openrouter.ai/docs/guides/overview/multimodal/audio.md` §«Supported Audio Input Formats» y `.../stt.md`, consultados 2026-08-28 |

### 1.2 Lo que NO se pudo comprobar en esta sesión — y es obligatorio antes de escribir una migración

La redacción original de este brief **no tuvo conector de Supabase** y dejó cinco cosas por comprobar. **Las
cinco quedaron verificadas contra el catálogo vivo el 2026-08-28** (conector de solo lectura), y el resultado
cambió dos decisiones operativas. Se conserva la lista como registro de qué se comprobó y contra qué:

| # | Qué había que comprobar | Resultado (2026-08-28) | Efecto |
|---|---|---|---|
| 1 | **El número de migración libre real.** El `CLAUDE.md` avisa que el ledger no es autoritativo en ninguna dirección (067/079/108 corrieron sin archivo; 035-039/041/046/093 están aplicadas sin fila) | **123 ya está tomado** por `123_select_contratistas_por_rol.sql` (PR #182), y el máximo aplicado en `supabase_migrations.schema_migrations` **es 123** | **El primer hueco era el 124** — y lo tomó la Fase 0 (ver revisión 3). Las cinco propuestas quedan **125–129** |
| 2 | **Si `vista_resumen_verificaciones` existe** y qué lee | **Existe.** `JOIN verificaciones_inventario + verificaciones_detalle`, con `GROUP BY` | **No queda huérfana**, porque §10 congela las tablas en vez de borrarlas. Se resuelve dejarla viva — §10 |
| 3 | **Si Uriel ya existe** en `empleados` o en `contratistas` | **No existe en ninguna de las dos** | Confirma §3.1 tal cual: no hay ficha que reusar, y no se le inventa una |
| 4 | **El estado real de `productos.precio_unitario`** | De 226 activos: **3 en NULL, 8 en 0**; 193 con existencia > 0 | Achica la pieza 1 de §11.2, **pero no la elimina** — ver abajo |
| 5 | **Las cifras 226/33/193** | Vigentes | Siguen siendo orden de magnitud: el alcance se resuelve *al abrir la ronda* (CA-4), nunca contra una constante escrita |

> ## Revisión 3 — 2026-08-28: la Fase 0 se aplicó y volvió a correr la numeración
>
> El rótulo D-1 **terminó siendo su propio archivo de migración**, no una parte de la de retiro de legado como
> preveía este documento: **`124_rotular_verificacion_prueba.sql`, ya aplicada a producción** (commit
> `e2c0033`). Es la decisión correcta y por eso el número saltó: D-1 es `Must` e **independiente** del rediseño
> (§13, Fase 0), mientras que la de retiro depende de que exista `fn_ronda_aplicar_ajuste` para poder dropear
> su predecesora rota. Embebidas en un solo archivo, la higiene habría quedado rehén de la Fase 6.
>
> **Efecto: las cinco propuestas corren un número más, a 125–129.** Es la segunda renumeración en cuatro días
> — la primera porque `123` se ocupó mientras se cerraba el brief, ésta porque la Fase 0 gastó el `124`. La
> lección operativa, ya escrita en el cierre del documento: **el número se mira justo antes de crear el
> fichero**, nunca se hereda de un documento.
>
> **Y la 124 real hizo MÁS de lo que este documento le asignaba a la Fase 0.** Además del rótulo de tres marcas,
> ejecutó dos cosas que §10 tenía puestas en la migración de retiro: los `COMMENT ON TABLE` de las dos tablas
> y el `REVOKE INSERT, UPDATE, DELETE, TRUNCATE ... FROM authenticated, anon`. Con eso, **el alcance de la
> `128_retirar_verificaciones_legado.sql` se reduce a dos sentencias** (§10).
>
> **Una consecuencia viva que hay que mirar, y que no es teórica del todo** — detalle y recomendación en §10:
> el `REVOKE` de la 124 dejó a `NuevaVerificacion.tsx` y `ConteoFisico.tsx` **sin el GRANT que necesitan para
> escribir**, pero sus rutas y sus tres botones de entrada **siguen renderizándose**. Es decir: hoy «Nueva
> Verificación» lleva a un `permission denied`. La 124 lo anticipó y lo llamó costo teórico (nadie usa el
> módulo desde hace un año, D-1), y tiene razón sobre el impacto — pero **CA-27 es `Must`** y dice que un botón
> que no puede cumplir su promesa no se renderiza.

> **Cuidado con el nombre de la tabla de contratistas.** La migración 026 declara
> `contratista_id uuid REFERENCES terceros(id)`, pero la tabla viva —y la que tiene `src/types/database.ts`—
> se llama **`contratistas`**. Al escribir la FK de `telegram_usuarios` en §3.1, usar el nombre vivo. Es
> exactamente el tipo de trampa que el `CLAUDE.md` señala: verificar contra el catálogo, no contra el archivo
> de migración ni contra los tipos generados.

**Y una precaución que el punto 4 NO retira.** 3 NULL + 8 en cero son las fallas *detectables contando*. El
caso que motivó todo el prerrequisito —Sulcamag en 669,96— **no es NULL ni cero**: es un número plausible y
equivocado, que esa consulta no ve. Además, de esos 11 hay que quedarse con los que caen dentro de los 193 con
existencia: un precio malo sobre un producto en cero **no afecta la valoración**, porque su aporte es
`0 × precio = 0` de todos modos. Lo que falta medir es la **discrepancia contra la compra que respalda cada
precio** (§11.2 pieza 1).

---

## 2. Arquitectura general

```
   URIEL (sin usuario web)        DAVID (Administrador)      SANTIAGO (Gerencia)
        Telegram                   Telegram + web              Telegram + web
           │                            │                           │
           ▼                            ▼                           ▼
  ┌───────────────────────────────────────────────────────────────────────┐
  │  edge function make-server-1ccce916  (Hono, verify_jwt = false)        │
  │                                                                       │
  │  telegram/bot.ts ──┬── handlers de la ronda (voz, callbacks)          │
  │                    ├── conversations: cierreRonda · excepcionDavid    │
  │                    └── (los 6 flujos existentes, intactos)            │
  │                                                                       │
  │  ronda-voz-pipeline.ts   descarga → STT → interpretación → preview    │
  │  ronda-inventario-tick.ts  POST /inventario/ronda/tick  (x-…-secret)  │
  │                                                                       │
  │  ── I/O puro. CERO lógica de dominio. ──                              │
  └────────────────────────────────┬──────────────────────────────────────┘
                                   │ service_role (RLS bypass)
                                   │ actor SIEMPRE explícito en el payload
  ┌────────────────────────────────▼──────────────────────────────────────┐
  │  RPC plpgsql, SECURITY INVOKER, search_path pineado                   │
  │  fn_ronda_abrir · confirmar_hallazgos · explicacion_david ·           │
  │  resolver_con_captura · proponer_ajuste · decidir_ajuste ·            │
  │  aplicar_ajuste · cerrar · emitir_reporte                             │
  │      └─ todas pasan por fn_ronda_validar_actor()                      │
  └────────────────────────────────┬──────────────────────────────────────┘
                                   ▼
  rondas_inventario · rondas_inventario_alcance · rondas_transcritos
  rondas_excepciones · rondas_reportes · rondas_avisos
  inventario_causas_raiz · inventario_parametros
                                   │
                                   ▼          (sólo por RPC, nunca directo)
              productos.cantidad_actual  ·  movimientos_inventario

  Lógica PURA y testeable:  src/utils/rondaInventario/*.ts
    espejada a los DOS árboles de edge function por
    docs/inventario/regenerar-copias-ronda-inventario.py   (--check en Vitest)
```

Tres invariantes que gobiernan todo el diseño:

- **Nada escribe `productos.cantidad_actual` fuera de un RPC de este conjunto** (R-1/CA-1). El camino (b) de
  §5.1 — `NuevoMovimientoModal` — queda intacto por decisión de producto (CA-26) y es la **única** excepción;
  se le sigue el rastro por visibilidad, no por bloqueo (R-9).
- **El actor nunca se infiere.** Ni de `auth.uid()`, ni de `ctx.from.id` sin validar, ni del nombre.
- **Lo que un modelo produce no puede tener forma de dato de dominio hasta que un humano toca un botón.**

---

## 3. Identidad de Uriel en la capa de Telegram

### 3.1 El alta

Uriel **no obtiene usuario web** (§8.2, decisión del dueño). Su identidad es una fila de `telegram_usuarios`:

```sql
-- Propuesta (va sembrada en la migración de esquema, §4)
INSERT INTO telegram_usuarios (
  telegram_id,            -- NULL: lo llena el /start <code> que ya existe
  usuario_id,             -- NULL: no tiene fila en auth.users, y no la necesita
  empleado_id,            -- su fila de `empleados` si existe (verificar, §1.2 punto 3)
  nombre_display,         -- 'Uriel <apellido>' -- NOT NULL, es lo único obligatorio
  rol_bot,                -- 'campo': no es admin ni gerencia y `rol_bot` no gatea nada acá
  modulos_permitidos,     -- '{inventario_ronda}'  <-- y NADA más. Ver 3.3
  codigo_vinculacion,     -- código de un solo uso
  codigo_expira_at,
  activo                  -- true
) VALUES (…);
```

Después se le manda el deep link `https://t.me/escociaos_bot?start=<codigo>`. **Cero código nuevo**: el
handler de `/start <code>` ya vincula, valida expiración y recarga el contexto (`bot.ts:195-267`).

**Verificado el 2026-08-28 (§1.2 punto 3): Uriel no existe ni en `empleados` ni en `contratistas`.** Así que
`empleado_id` y `contratista_id` quedan **en NULL**, y eso es el estado final, no un pendiente. Esas dos FK
existen para atribución de costo de mano de obra, que acá no aplica; `nombre_display` basta para mostrar y
`telegram_usuarios.id` es la clave de atribución (§6.1). **No se le inventa una ficha** — el precedente de la
107 (crear `EMILIANO GARCIA`) aplica cuando la persona ya está en la nómina y le falta la ficha; Uriel es un
verificador independiente y no está en ninguna de las dos.

### 3.2 Cómo el bot distingue sus mensajes de los de cualquier otro

Igual que los seis flujos existentes: **por `modulos_permitidos`, nunca por nombre ni por `telegram_id`
literal.** El middleware de auth (`bot.ts:108-131`) ya resuelve `ctx.telegramUser` en cada update; cada
handler consulta el módulo. Tres claves nuevas:

| Clave | Quién | Qué habilita |
|---|---|---|
| `inventario_ronda` | Uriel | Abrir/cerrar ronda, consultar el teórico, mandar notas de voz, confirmar el preview |
| `inventario_explicacion` | David | Confirmar/corregir la cita, explicar de cero, capturar el movimiento de la vía (a), proponer ajuste |
| `inventario_aprobacion` | Santiago | Aprobar/desestimar con causa, recibir el reporte de cierre y la alerta del día 15 |

`modulos_permitidos` es `text[]` sin `CHECK` (migración 026), así que agregar claves es **dato, no DDL**. Un
mismo humano puede tener varias: Santiago tendrá `inventario_aprobacion` además de las que ya tiene.

### 3.3 Uriel NO recibe el módulo `consultas`, y eso es load-bearing

`consultas` habilita el fallback de texto libre a Esco (`bot.ts:852-860`), y Esco expone
`get_financial_summary`, `get_pyg_flujo_caja` y agregados de inventario **con valoración**. Dárselo a Uriel
rompe **R-15/CA-13 el primer día**, sin que ningún test lo note.

Consecuencia que hay que decir en voz alta: **Uriel no va a poder preguntarle nada a Esco.** Si algún día se
quiere que pueda, no alcanza con darle el módulo: hace falta redacción de precios por usuario dentro de Esco,
que es un trabajo mayor y de otra naturaleza. Queda anotado en §15 como consecuencia, no como pregunta.

### 3.4 A quién le llega cada mensaje saliente

Se reutiliza **`alertas_catalogo` + `telegram_alertas_suscripciones`** (migración 096). El `CLAUDE.md` lo dice
literal: *«Adding an alert for aguacate or ganado is an INSERT, not a code change»*. Tres filas nuevas:

| `clave` | `modulo` | `nombre` | Destino esperado |
|---|---|---|---|
| `inventario.ronda_recordatorio` | `inventario` | Recordatorio de la ronda mensual | Uriel |
| `inventario.revision_dia_15` | `inventario` | Revisión del día 15 — mes omitido y excepciones vencidas | Santiago |
| `inventario.reporte_cierre` | `inventario` | Reporte de cierre de ronda | Santiago |

> **Por qué `revision_dia_15` y no dos claves separadas** (`mes_omitido` + `excepciones_vencidas`). Tras P-2, el
> mensaje del día 15 lleva dos bloques. Partirlo en dos claves permitiría que alguien se suscriba a uno y no al
> otro desde la pantalla de configuración de Telegram — y para una alerta cuya función es hacer visible la
> **deuda de control**, poder apagar la mitad es un footgun, no una opción. Una clave, dos bloques, y cada
> bloque con su propia idempotencia mensual en `rondas_avisos` (§8.1).

**Doble condición para los dos mensajes que llevan cifras de valoración** (reporte de cierre y, si algún día
la lleva, la alerta): el destinatario debe estar suscrito **y** tener `inventario_aprobacion` en
`modulos_permitidos`. La suscripción sola es configurable desde la pantalla de Telegram, y una casilla mal
marcada mandaría el valor del inventario a Uriel. Dos condiciones ⇒ la pantalla de configuración no puede,
por sí sola, romper R-15.

No hace falta una tabla de envíos: `enviar.ts` ya audita todo saliente en `telegram_mensajes` (026). El
`hato_alertas_envios` existe para el cierre-por-el-primero del broadcast del hato, que acá no aplica.

---

## 4. Esquema de datos — propuesta de migración `125_ronda_inventario_esquema.sql`

### 4.0 Por qué tablas nuevas y no `verificaciones_*`

`verificaciones_*` tiene RLS correcta desde la 104, y ese es el único argumento a favor de reusarlas. En
contra, cuatro, y cada uno solo ya alcanza:

1. **La forma es la opuesta.** `verificaciones_detalle` es *una fila por producto del alcance* (223 filas para
   223 productos). R-2/CA-15 dice que un producto conforme **no** es un dato de conteo. Reusarla obliga a (a)
   guardar 193 filas por ronda que no significan nada — con `cantidad_fisica` NULL, que es literalmente la
   trampa de D-8 que CA-17 prohíbe — o (b) meter sólo excepciones en una tabla cuyo nombre y cuyos consumidores
   asumen lo contrario.
2. **Los estados no mapean.** `estado_verificacion` tiene 5 etiquetas que no son las 4 de §5.4. Extender un
   ENUM en sitio es exactamente el desajuste UI↔esquema de `fraccion_jornal`, con el agravante de que las
   etiquetas viejas sobrevivirían para siempre significando otra cosa.
3. **Los tres desenlaces no caben.** `verificaciones_detalle` los expresaría con `ajuste_realizado boolean` +
   `aprobado boolean`: dos booleanos que **funden** justamente lo que CA-10 prohíbe fundir.
4. **La atribución es texto libre** (`usuario_verificador text`, `revisada_por text`). La migración 107 midió
   qué pasa con eso: 19 grafías para 6 personas en `movimientos_diarios.responsable`. R-8/CA-12 necesita FK, y
   además necesita una FK que Uriel pueda satisfacer — y Uriel no tiene fila en `auth.users`.

### 4.1 La ronda y su foto congelada

```sql
-- PROPUESTA
CREATE TYPE estado_ronda_inventario AS ENUM ('programada','en_curso','cerrada','omitida');

CREATE TABLE rondas_inventario (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  periodo               DATE        NOT NULL,   -- primer día del mes que cubre. Una ronda = un mes
  estado                estado_ronda_inventario NOT NULL DEFAULT 'programada',
  es_linea_base         BOOLEAN     NOT NULL DEFAULT FALSE,  -- R-17/CA-22: lo CALCULA fn_ronda_abrir
  abierta_en            TIMESTAMPTZ,
  abierta_por_usuario   UUID,                    -- uuid pelado, SIN FK a auth.users (precedente 096)
  abierta_por_telegram  UUID REFERENCES telegram_usuarios(id),
  cerrada_en            TIMESTAMPTZ,
  cerrada_por_usuario   UUID,
  cerrada_por_telegram  UUID REFERENCES telegram_usuarios(id),
  alcance_declarado     TEXT CHECK (alcance_declarado IN ('completo','parcial')),  -- A-5/R-2
  alcance_nota          TEXT,                    -- qué NO se recorrió, en palabras de Uriel
  observaciones_libres  JSONB NOT NULL DEFAULT '[]'::jsonb,  -- A-7/R-16/CA-14
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT rondas_cierre_declara_alcance
    CHECK (estado <> 'cerrada' OR alcance_declarado IS NOT NULL)
);

-- UNA sola ronda en curso, garantizado por estructura y no por un read-then-write.
-- Un índice único sobre la columna, restringido a las filas 'en_curso', admite
-- como máximo una fila con ese valor.
CREATE UNIQUE INDEX rondas_inventario_una_en_curso
  ON rondas_inventario (estado) WHERE estado = 'en_curso';

CREATE UNIQUE INDEX rondas_inventario_periodo_unico
  ON rondas_inventario (periodo) WHERE estado <> 'omitida';
```

**La foto fechada de R-5**, que además es lo que hace computable el delta de R-4 y el aviso de CA-2:

```sql
CREATE TABLE rondas_inventario_alcance (
  ronda_id           UUID NOT NULL REFERENCES rondas_inventario(id) ON DELETE CASCADE,
  producto_id        UUID NOT NULL REFERENCES productos(id),
  cantidad_teorica   NUMERIC NOT NULL,   -- productos.cantidad_actual AL ABRIR. Es la foto, no un dato vivo
  unidad             unidad_medida NOT NULL,
  precio_unitario    NUMERIC,            -- congelado también: irrecuperable después (lección de la 119)
  nombre_producto    TEXT NOT NULL,      -- denormalizado a propósito: un rename posterior no debe
                                         -- reescribir lo que Uriel vio en campo
  PRIMARY KEY (ronda_id, producto_id)
);
```

> **Se rotula como foto, no se disfraza de dato vivo** (R-5). El precedente que la regla cita es
> `aplicaciones_compras`, cuyo problema no es guardar un snapshot sino que nadie sabe que lo es. Acá el nombre
> de la tabla, el comentario SQL y la pantalla de detalle dicen «teórico al abrir la ronda del N de mes».
> `precio_unitario` se congela aunque **no se publique** hasta §11: no congelarlo lo vuelve irrecuperable.

> **P-3, resuelta 2026-08-28: la foto no se re-abre.** Un producto que pasa a existencia > 0 **durante** una
> ronda abierta —una compra del día 3 sobre un producto que el día 1 estaba en cero— **no entra al alcance**.
> `fn_ronda_abrir` es el único escritor de esta tabla y no hay ningún camino que la amplíe después. El hallazgo
> no se pierde: la compra es un movimiento con la ronda abierta y sale como tal en el reporte de cierre (R-9,
> §8.3 punto 4). **No se crea ningún concepto nuevo** — ni «alcance ampliado», ni un tercer estado entre
> conforme y no verificado. Meterlo al alcance habría mutado una foto que R-5 declara congelada, y habría
> dejado un renglón con `cantidad_teorica` de un instante distinto al del resto de la tabla.

### 4.2 El catálogo de causa raíz — tabla, no ENUM

```sql
CREATE TABLE inventario_causas_raiz (
  clave            TEXT PRIMARY KEY,
  etiqueta         TEXT    NOT NULL,          -- lo que ve el humano
  via              TEXT    NOT NULL CHECK (via IN ('captura_david','aprobacion_gerencia','ninguna')),
  mueve_inventario BOOLEAN NOT NULL,
  exige_nota       BOOLEAN NOT NULL DEFAULT FALSE,
  orden            INTEGER NOT NULL,
  activo           BOOLEAN NOT NULL DEFAULT TRUE
);

-- Semilla EXACTA de R-7 + tabla de §5.3. Siete filas, ni una más.
INSERT INTO inventario_causas_raiz (clave, etiqueta, via, mueve_inventario, exige_nota, orden) VALUES
 ('movimiento_no_capturado','Movimiento no capturado','captura_david',       TRUE,  FALSE, 1),
 ('consumo_no_registrado',  'Consumo no registrado',  'captura_david',       TRUE,  FALSE, 2),
 ('error_captura_previa',   'Error de captura previa','captura_david',       TRUE,  FALSE, 3),
 ('perdida_o_dano',         'Pérdida o daño',         'aprobacion_gerencia', TRUE,  FALSE, 4),
 ('sustraccion',            'Sustracción',            'aprobacion_gerencia', TRUE,  FALSE, 5),
 ('error_de_conteo',        'Error de conteo',        'ninguna',             FALSE, FALSE, 6),
 ('otro',                   'Otro (con nota)',        'aprobacion_gerencia', TRUE,  TRUE,  7);
```

**Por qué tabla y no ENUM.** El defecto de `fraccion_jornal` (106) no fue «usaron un ENUM»: fue que la lista
de opciones de la UI y el conjunto aceptado por la base venían de sitios distintos, y el rechazo se tragaba en
silencio. Acá el riesgo equivalente es peor, porque además del conjunto hay un **mapeo** (causa→vía) que
gobierna si algo pasa o no por Gerencia. Con la tabla, ese mapeo vive **en la misma fila que la causa** y lo
leen los tres consumidores: el RPC (que lo re-deriva), el cliente y el prompt del intérprete. Con un ENUM, el
mapeo quedaría suelto en TypeScript y duplicado en plpgsql — dos copias de la regla que decide quién aprueba.

**Y no se puede editar desde la app**, que es lo que R-7 exige («la lista no se cambia a la ligera»): RLS
`SELECT` para `authenticated`, **ninguna** política de escritura, `REVOKE INSERT/UPDATE/DELETE` a
`anon`/`authenticated` (precedentes 081 y 084). Cambiarla es una migración.

**Guarda contra la desincronización**: `src/utils/rondaInventario/causasRaiz.ts` declara las 7 claves como
constante, y `src/__tests__/rondaInventarioCausasParidad.test.ts` compara esa constante contra las filas
sembradas leídas del **archivo de migración**. Si alguien agrega una causa en un lado y no en el otro, la
suite se pone roja — que es la mitigación que a `fraccion_jornal` le faltó.

### 4.3 Los transcritos — la capa cruda de este flujo (CA-36, A-10/CA-37)

```sql
CREATE TABLE rondas_transcritos (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ronda_id           UUID NOT NULL REFERENCES rondas_inventario(id) ON DELETE CASCADE,
  -- CAPA CRUDA. Literal, tal como lo devolvió el STT. Nunca se reescribe ni se
  -- "corrige": las correcciones de Uriel se acumulan aparte, en `correcciones`.
  transcrito         TEXT NOT NULL,
  correcciones       JSONB NOT NULL DEFAULT '[]'::jsonb,  -- [{texto, en}] en orden
  interpretacion     JSONB,        -- la última salida cruda del modelo intérprete
  preview            JSONB,        -- el preview exacto que se le mostró a Uriel
  intentos_preview   INTEGER NOT NULL DEFAULT 1,
  estado             TEXT NOT NULL DEFAULT 'preview_pendiente'
                     CHECK (estado IN ('preview_pendiente','confirmado','sin_confirmar','descartado')),
  confirmado_en      TIMESTAMPTZ,
  actor_usuario_id   UUID,
  actor_telegram_id  UUID REFERENCES telegram_usuarios(id),
  duracion_audio_seg INTEGER,      -- métrica, no evidencia
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT rondas_transcritos_actor
    CHECK (actor_usuario_id IS NOT NULL OR actor_telegram_id IS NOT NULL)
);
```

- **El audio no se guarda** (11.d/CA-36). No hay bucket, no hay migración de Storage, no hay política. Es la
  diferencia deliberada contra `hato-chequeo-foto.ts`, que sí guarda la foto (migración 072).
- **`estado = 'sin_confirmar'` ES A-10/CA-37**: agotados los intentos, la fila sobrevive con el transcrito
  íntegro, **no genera ninguna excepción**, no entra a las métricas de excepciones, y el reporte de cierre la
  cuenta («N hallazgos narrados sin confirmar»). Está en la base y no en `telegram_sessions` precisamente por
  esto: un valor de sesión no sobrevive a un `/cancelar`, a un timeout ni a un redespliegue.
- `descartado` es distinto de `sin_confirmar`: Uriel tocó «Descartar» a propósito.
- **Deshacer (P-1) devuelve la fila a `preview_pendiente`, no a un estado nuevo.** El ciclo de vida es
  `preview_pendiente ⇄ confirmado`, con `sin_confirmar` y `descartado` como terminales. `intentos_preview`
  **no se reinicia** con un Deshacer: si se reiniciara, deshacer sería un rodeo infinito alrededor de CA-35.
  Deshacer tampoco *consume* un intento — los intentos cuentan **correcciones**, no confirmaciones.
- **Y por eso `fn_ronda_cerrar` normaliza a `sin_confirmar` todo lo que quede en `preview_pendiente`.** Sin
  esa normalización, un transcrito deshecho y abandonado sería un borrador que CA-37 tiene que contar pero en
  un estado que el contador no mira. Después de cerrar, «narrado sin confirmar» es exactamente
  `estado = 'sin_confirmar'`, un solo predicado.

### 4.4 Las excepciones — y CA-38 como estado, no como texto

Este es el punto más delicado del documento de producto y el que más fácil se pierde al implementar. La
solución tiene **tres capas** y ninguna es un comentario.

```sql
CREATE TYPE estado_excepcion_inventario AS ENUM (
  'reportada',                -- confirmada por Uriel. No pasó por David
  'explicacion_precargada',   -- CA-38: hay una CITA del audio. NO es la palabra de David
  'explicada',                -- David tocó. Recién acá se puede tomar una vía
  'cerrada_sin_ajuste',       -- terminal 1
  'resuelta_con_captura',     -- terminal 2 (vía a)
  'ajuste_propuesto',
  'ajuste_aprobado',
  'ajuste_desestimado',       -- terminal 3-a
  'ajuste_aplicado'           -- terminal 3-b
);

CREATE TABLE rondas_excepciones (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ronda_id            UUID NOT NULL REFERENCES rondas_inventario(id) ON DELETE RESTRICT,
  transcrito_id       UUID REFERENCES rondas_transcritos(id),   -- de qué narración nació
  producto_id         UUID NOT NULL REFERENCES productos(id),   -- NOT NULL: CA-32 lo exige
  estado              estado_excepcion_inventario NOT NULL DEFAULT 'reportada',

  -- ── LO QUE URIEL REPORTÓ ────────────────────────────────────────────────
  cantidad_fisica     NUMERIC NOT NULL,
  fisico_origen       TEXT NOT NULL CHECK (fisico_origen IN ('dictado','derivado')),  -- R-19/CA-31
  teorico_conteo      NUMERIC NOT NULL,   -- copia de rondas_inventario_alcance. NUNCA de lo que dijo Uriel
  observacion_uriel   TEXT,
  reportada_en        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reportada_por_usuario  UUID,
  reportada_por_telegram UUID REFERENCES telegram_usuarios(id),

  -- ── CA-38: DOS COLUMNAS, NO UNA ─────────────────────────────────────────
  -- Lo que Uriel citó del audio. Es una CITA. Vive acá y no se mueve nunca.
  explicacion_citada        TEXT,
  -- Lo que David dijo. Vive en OTRA columna. Que la cita se convierta en la
  -- palabra de David no es una sobrescritura: es un INSERT en una columna
  -- distinta, hecho por un actor distinto, con su propio sello de tiempo.
  explicacion_david         TEXT,
  explicacion_david_accion  TEXT CHECK (explicacion_david_accion IN
                              ('confirmo_cita','corrigio_cita','explico_directo')),
  explicacion_david_en      TIMESTAMPTZ,
  explicacion_david_usuario UUID,
  explicacion_david_telegram UUID REFERENCES telegram_usuarios(id),

  -- ── VÍA (a): captura con respaldo — CA-8 ────────────────────────────────
  captura_movimiento_id UUID REFERENCES movimientos_inventario(id),
  captura_en            TIMESTAMPTZ,
  captura_por_usuario   UUID,
  captura_por_telegram  UUID REFERENCES telegram_usuarios(id),

  -- ── VÍA (b): propuesta / aprobación / aplicación — CA-9, CA-11, CA-12 ───
  propuesta_delta       NUMERIC,
  propuesta_causa       TEXT REFERENCES inventario_causas_raiz(clave),
  propuesta_nota        TEXT,
  propuesta_en          TIMESTAMPTZ,
  propuesta_por_usuario UUID,
  propuesta_por_telegram UUID REFERENCES telegram_usuarios(id),
  decision_causa        TEXT REFERENCES inventario_causas_raiz(clave),  -- CA-11: la de Santiago manda
  decision_nota         TEXT,
  decision_en           TIMESTAMPTZ,
  decision_por_usuario  UUID,
  decision_por_telegram UUID REFERENCES telegram_usuarios(id),
  aplicacion_movimiento_id UUID REFERENCES movimientos_inventario(id),
  aplicacion_en         TIMESTAMPTZ,
  aplicacion_por_usuario UUID,
  aplicacion_por_telegram UUID REFERENCES telegram_usuarios(id),

  -- ── vía derivada del catálogo, NUNCA del modelo (CA-34) ─────────────────
  via_propuesta         TEXT NOT NULL CHECK (via_propuesta IN
                          ('captura_david','aprobacion_gerencia','ninguna')),
  causa_sugerida        TEXT REFERENCES inventario_causas_raiz(clave),  -- del intérprete, sin valor de firma
  interprete_confianza  TEXT NOT NULL CHECK (interprete_confianza IN ('alta','baja','ninguna')),

  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- ═══ LAS TRES GUARDAS QUE SOSTIENEN EL CONTROL ═══════════════════════════

  -- (1) CA-38. Ningún estado más allá de `explicacion_precargada` es alcanzable
  --     sin que David haya tocado. La cita NO habilita ninguna vía.
  CONSTRAINT excepcion_avanza_solo_con_david CHECK (
    estado IN ('reportada','explicacion_precargada')
    OR explicacion_david_en IS NOT NULL
  ),

  -- (2) CA-9. Nada se aplica sin decisión, y ninguna decisión sin causa (CA-11).
  CONSTRAINT excepcion_aplicada_exige_decision CHECK (
    estado <> 'ajuste_aplicado'
    OR (decision_en IS NOT NULL AND decision_causa IS NOT NULL
        AND aplicacion_movimiento_id IS NOT NULL)
  ),
  CONSTRAINT excepcion_aprobada_exige_causa CHECK (
    estado NOT IN ('ajuste_aprobado','ajuste_aplicado') OR decision_causa IS NOT NULL
  ),

  -- (3) CA-8. La captura directa NO es un ajuste, y no es opaca.
  CONSTRAINT excepcion_captura_completa CHECK (
    estado <> 'resuelta_con_captura'
    OR (captura_movimiento_id IS NOT NULL AND captura_en IS NOT NULL
        AND (captura_por_usuario IS NOT NULL OR captura_por_telegram IS NOT NULL))
  ),

  -- CA-12: nunca sin actor, en ninguno de los dos caminos.
  CONSTRAINT excepcion_reportante CHECK (
    reportada_por_usuario IS NOT NULL OR reportada_por_telegram IS NOT NULL
  )
);
```

**Por qué esto responde a CA-38 y un `texto + bandera` no.** Con una sola columna `explicacion_david` que el
audio precarga, la afirmación «hasta que David toque, es una cita» sólo existe en la cabeza de quien lee el
documento: cualquier consulta, cualquier reporte y cualquier `SELECT explicacion_david` la lee como la palabra
de David. Con dos columnas, la pregunta «¿esto lo dijo David?» tiene una respuesta **verificable en SQL**
(`explicacion_david_en IS NOT NULL`), la cita y la palabra pueden **coexistir y compararse** — que es
exactamente lo que le da a David la oportunidad de §11.4 de corregir una transcripción antes de que se vuelva
la causa raíz de su propio inventario — y el `CHECK (1)` hace que **un estado más avanzado sea imposible de
escribir** sin ese sello. Que es lo que el brief de producto pide: un estado, no un texto suelto.

**Los tres desenlaces no se pueden fundir (CA-10)** porque son tres valores distintos del ENUM con tres
conjuntos de columnas obligatorias distintas. Un reporte que quisiera fundirlos tendría que hacerlo a
propósito; hoy los booleanos de `verificaciones_detalle` lo hacían por omisión.

### 4.5 Reporte congelado y avisos idempotentes

```sql
CREATE TABLE rondas_reportes (              -- R-10 / CA-18
  ronda_id       UUID PRIMARY KEY REFERENCES rondas_inventario(id) ON DELETE CASCADE,
  emitido_en     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  contenido      JSONB NOT NULL,   -- las cifras, ya resueltas. NO se recalcula jamás
  texto_telegram TEXT  NOT NULL,   -- lo que se envió, literal
  incluye_valoracion BOOLEAN NOT NULL   -- CA-20: si el saneamiento de §11 no está firmado, FALSE
);

CREATE TABLE rondas_avisos (                -- CA-24: una sola vez por mes omitido
  clave      TEXT PRIMARY KEY,     -- 'mes_omitido:2026-09' | 'recordatorio:2026-09'
  ronda_id   UUID REFERENCES rondas_inventario(id),
  enviado_en TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  detalle    JSONB
);

CREATE TABLE inventario_parametros (        -- precedente 052/058
  clave TEXT PRIMARY KEY,
  valor JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
INSERT INTO inventario_parametros (clave, valor)
VALUES ('valoracion_publicable', 'false'::jsonb);
```

`rondas_avisos.clave` con `INSERT … ON CONFLICT DO NOTHING` es el mismo mecanismo de idempotencia que
`hato_alertas.regla_clave` (056). Es lo que hace que el tick sea **seguro de correr dos veces**, y por lo tanto
que nadie tenga que razonar sobre reintentos de `pg_net`.

### 4.6 RLS

Patrón 044 en todas, con dos ajustes explicados:

| Tabla | SELECT | INSERT/UPDATE | DELETE |
|---|---|---|---|
| `rondas_inventario`, `_alcance`, `rondas_excepciones`, `rondas_transcritos` | `authenticated` | Administrador + Gerencia | **nadie** (ver abajo) |
| `rondas_reportes`, `rondas_avisos` | **Gerencia** (llevan valoración) | ninguna política — sólo `service_role` | nadie |
| `inventario_causas_raiz` | `authenticated` | ninguna política (§4.2) | nadie |
| `inventario_parametros` | `authenticated` | Gerencia | nadie |

- **DELETE sin política, a propósito.** Ninguna de estas tablas tiene historial de cambios: la 113
  (`globalgap_correcciones`) cubre `aplicaciones*`/`movimientos_diarios*`, la 084 el hato, y `logs_auditoria`
  nunca recibió una fila. Un borrado acá no dejaría rastro. Lo que la ronda registra es evidencia de un control
  interno; una excepción **ya explicada** que resultó equivocada se cierra como `error_de_conteo`, no se borra.
  Precedente directo: la 120 razona lo mismo para `monitoreos`.
  - **La única excepción es el Deshacer de P-1** (`fn_ronda_deshacer_confirmacion`, §6.5), que sí borra filas
    de `rondas_excepciones` dentro de una ventana muy acotada. **No lleva política DELETE igual**: el RPC es
    `SECURITY INVOKER` y sólo funciona por el camino de Telegram, donde `service_role` bypassa la RLS. Es
    deliberado y es el mismo alcance que `hato_ev_undo`, que también es Telegram-only. **Consecuencia que hay
    que saber: si alguna vez se quiere un Deshacer desde la web, no alcanza con llamar al RPC — hace falta
    agregarle a la tabla una política DELETE, y eso es una decisión aparte.**
- **`REVOKE ALL … FROM anon` en las ocho tablas.** No como segunda capa decorativa: la 081 midió que Supabase
  concede `ALL … TO anon` por defecto en `public`, y la 120 encontró `anon` con `DELETE` directo sobre ocho
  tablas de monitoreo. El `REVOKE` es la mitad que más pesa.
- `service_role` conserva todo por `rolbypassrls`; es el camino del bot y de los ticks.

---

## 5. El pipeline de voz (§11 del brief de producto)

### 5.1 Transporte: cómo llega el audio

Una nota de voz de Telegram llega como `message.voice`:
`{ file_id, file_unique_id, duration, mime_type: "audio/ogg", file_size }` — contenedor **OGG**, códec
**Opus**. Se descarga con el par `getFile` + `https://api.telegram.org/file/bot<token>/<path>`, que ya está
implementado en `pesajeLeche.ts:216-224` (`descargarBytesTelegram`) y se reutiliza tal cual. El límite de
descarga de la Bot API es 20 MB; una nota de voz de 3 minutos pesa ~250 KB, así que no es una restricción.

Se acepta también `message.audio` (un archivo de audio reenviado). Cualquier otra cosa se rechaza con un
mensaje explícito, con la misma forma que `TIPOS_ACEPTADOS_FOTO_PESAJE`.

### 5.2 D-T6 — dos llamadas al modelo, no una

```
  bytes OGG/Opus
        │
        ├─(1) STT ─────────► TRANSCRITO LITERAL  ──► se guarda en rondas_transcritos.transcrito
        │     POST /api/v1/audio/transcriptions        (CAPA CRUDA — CA-36)
        │     modelo: RONDA_STT_MODELO
        │
        └─(2) el TRANSCRITO (texto) ──► intérprete
              POST /api/v1/chat/completions
              google/gemini-3-flash-preview, response_format json_schema, temperature 0
                        │
                        ▼
              JSON validado por función PURA ──► preview ──► [Confirmar]
```

**Por qué no una sola pasada audio→hallazgos.** CA-36 declara que *«el transcrito es la capa cruda de este
flujo: se guarda literal, y los hallazgos estructurados se derivan de él — nunca al revés»*. En una sola
pasada, el «transcrito» sería un campo más que produjo la misma inferencia que produjo los hallazgos: si el
modelo oye «Silicio» donde dice «Silicalmag», el transcrito diría «Silicio» y el hallazgo diría «Silicio», y no
existiría forma de distinguir un error de audición de uno de interpretación. Partiéndolo, la etapa (1) es una
tarea de transcripción pura (temperatura 0, «no interpretes») y la etapa (2) trabaja sobre **texto**, lo que
la vuelve testeable desde Vitest con fixtures de cadenas planas, sin bytes de audio, para siempre. Esa última
propiedad es la que decide: el ejemplo literal de Santiago en §11.1 se convierte en el fixture #1.

Costo: dos llamadas en vez de una, ~2-4 s adicionales sobre un flujo que ya es asíncrono. Irrelevante frente a
la propiedad que compra.

### 5.3 Proveedor y modelos

**Mismo proveedor, mismo secreto: `OPENROUTER_API_KEY`.** Ningún vendor nuevo, ningún secreto nuevo.
Verificado en vivo el 2026-08-28 contra `https://openrouter.ai/api/v1/models`:
`google/gemini-3-flash-preview` — **el mismo id ya pinado en `hato-chequeo-foto.ts:79` y usado por Esco** —
declara `audio` entre sus `input_modalities`, y OpenRouter expone además un endpoint STT dedicado
`/api/v1/audio/transcriptions` con 19 modelos disponibles bajo la misma llave.

| Etapa | Endpoint | Modelo | Variable de entorno |
|---|---|---|---|
| (1) Transcripción | `POST /api/v1/audio/transcriptions` | por defecto `openai/whisper-large-v3-turbo` | `RONDA_STT_MODELO` (opcional, con default en código) |
| (2) Interpretación | `POST /api/v1/chat/completions` | `google/gemini-3-flash-preview` | `RONDA_INTERPRETE_MODELO` (opcional) |

**Por qué un ASR dedicado y no Gemini-audio para la etapa (1)**, sabiendo que Gemini también acepta audio: la
tarea es transcripción verbatim de español rural colombiano con nombres comerciales de agroinsumos. El modo de
falla de un ASR es una palabra mal oída; el de un LLM es una paráfrasis fluida, que es peor porque **se lee
bien**. Pero esto es una hipótesis, no una medición — ver el spike de §5.7.

Los dos modelos van en variables de entorno con default en código, precedente `ACCIONES_MODELO`: cambiar de
modelo no debe ser un despliegue.

**Falla cerrada.** Sin `OPENROUTER_API_KEY`, el handler de voz responde a Uriel *«la lectura por voz no está
disponible ahora mismo»* y no toca nada — copia literal de `pesajeLeche.ts:244-248`. **Nunca degrada a
registrar sin preview.**

### 5.4 D-T7 — la resolución de producto es exacta, sin distancia de edición

`ocrChequeo.ts` sí usa distancia de edición acotada (`validarAnclaFila` → `distanciaEdicionAcotada`), y hace
bien: la planilla del hato trae **dos** señales independientes por fila (el `#` impreso y el nombre impreso),
así que la distancia de edición desempata entre dos señales que se corroboran.

Una nota de voz trae **una sola** señal: el nombre, tal como sonó. Y el catálogo real tiene el peor par
posible:

| Par | Distancia de edición |
|---|---|
| `Silicalmag` → `Silicio` (el error del propio ejemplo de Santiago, §11.1) | 5 |
| `Silicalmag` → `Sulcamag` (**los dos productos de la migración 119**) | 4 |

Un umbral lo bastante flojo para atrapar el primero mapea el segundo — y el segundo ya causó una entrada
huérfana de 8.000 kg / $5.359.680 que costó una migración correctiva. **Por eso: coincidencia normalizada
exacta** (minúsculas, sin tildes, espacios colapsados) contra el alcance congelado de la ronda. Cualquier otra
cosa ⇒ `no_identificado` y lo elige Uriel de una lista (R-20/CA-32), y **un hallazgo no identificado no se
puede confirmar** (guarda en el RPC, no sólo en la UI).

Matiz que sí es legítimo: la distancia de edición se usa para **ordenar** la lista de candidatos que Uriel ve.
Ordenar una elección humana no es resolver una identidad.

### 5.5 D-T8 — el contrato de salida del intérprete

```jsonc
// PROPUESTA — esquema json_schema, misma disciplina que esquemaJsonOcr()
{
  "type": "object",
  "required": ["hallazgos", "observaciones_libres", "avisos"],
  "additionalProperties": false,
  "properties": {
    "hallazgos": { "type": "array", "items": {
      "type": "object",
      "required": ["producto_mencionado","producto_confianza","fragmento_literal",
                   "cantidad_fisica_presente","cantidad_fisica","cantidad_faltante_presente",
                   "cantidad_faltante","causa_clave","causa_confianza","explicacion_david_citada"],
      "additionalProperties": false,
      "properties": {
        "producto_mencionado":     {"type":"string"},   // LITERAL, tal como sonó. Sin normalizar
        "producto_confianza":      {"type":"string","enum":["alta","baja","ninguna"]},
        "fragmento_literal":       {"type":"string"},   // el trozo del transcrito de donde sale
        "cantidad_fisica_presente":{"type":"boolean"},
        "cantidad_fisica":         {"type":"number"},   // válido sólo si _presente
        "cantidad_faltante_presente":{"type":"boolean"},// "faltan 3"
        "cantidad_faltante":       {"type":"number"},
        "causa_clave":             {"type":"string"},   // clave del catálogo, o "" si no la determina
        "causa_confianza":         {"type":"string","enum":["alta","baja","ninguna"]},
        "explicacion_david_citada":{"type":"string"}    // "" si el audio no le atribuye nada a David
      }}},
    "observaciones_libres": {"type":"array","items":{"type":"string"}},  // A-7 / R-16 / CA-14
    "avisos":               {"type":"array","items":{"type":"string"}}
  }
}
```

**Lo que este esquema deliberadamente NO tiene, y por qué cada ausencia es una regla del brief:**

| Ausencia | Regla que sostiene |
|---|---|
| **No hay `cantidad_teorica`** | **R-19/CA-30.** El modelo no tiene dónde poner un teórico, así que no puede repetir el que oyó. El teórico lo resuelve el servidor leyendo `rondas_inventario_alcance.cantidad_teorica` — la foto de R-5 — después de identificar el producto. Y si Uriel dijo «deberían haber 100» y la foto dice 90, esa discrepancia queda en `fragmento_literal` y sale en el preview como observación, que es exactamente la información que R-19 quiere no perder |
| **No hay `via`** | **CA-34.** La vía sale de `inventario_causas_raiz.via`. El modelo no la propone; ni siquiera puede |
| **No hay `producto_id`** | **R-20/CA-32.** El modelo nunca ve ids ni elige uno. Emite la cadena que oyó; la resolución es §5.4 |
| **No hay campo de confirmación** | **CA-29.** Confirmar es un botón de Telegram, jamás una interpretación de tono |
| `cantidad_*_presente` en vez de `null` | Los conversores de `json_schema` de los proveedores son quisquillosos con `type:["number","null"]` — mismo motivo por el que `esquemaJsonOcr()` usa cadena vacía + confianza en vez de nulos |

**Físico dictado vs. derivado (R-19/CA-31).** La función pura decide, en este orden:

1. `cantidad_fisica_presente` ⇒ `fisico = cantidad_fisica`, `fisico_origen = 'dictado'`.
2. si no, `cantidad_faltante_presente` ⇒ `fisico = teorico_foto − cantidad_faltante`,
   `fisico_origen = 'derivado'`. El preview lo rotula: *«hay 5 (derivado de “faltan 3” sobre 8)»*.
3. si no ⇒ el hallazgo queda **incompleto** y no se puede confirmar hasta que Uriel dé la cifra.

**R-18 en el propio contrato, no en una revisión a ojo.** La función pura `derivarVia` aplica, en este orden y
sin excepción:

```ts
// PSEUDOCÓDIGO — src/utils/rondaInventario/interpretarNota.ts
function derivarVia(h: HallazgoCrudo, catalogo: CausaRaiz[]): Via {
  if (h.causa_confianza !== 'alta') return 'aprobacion_gerencia';   // R-18
  if (!h.causa_clave)               return 'aprobacion_gerencia';   // R-18
  const causa = catalogo.find(c => c.clave === h.causa_clave && c.activo);
  if (!causa)                       return 'aprobacion_gerencia';   // clave desconocida ⇒ cautela
  return causa.via;                                                 // incluye 'otro' ⇒ gerencia, y
}                                                                   // 'error_de_conteo' ⇒ 'ninguna'
```

Y **el RPC la vuelve a derivar** contra la misma tabla, ignorando lo que mande el cliente (§6.3). Dos sitios,
una regla, y un test de paridad que falla si divergen — precedente `reportesFinancierosParidad.test.ts`.

**Degradación cautelosa de la confianza**: cualquier valor de `*_confianza` que no sea uno de los tres se
degrada a `'ninguna'` y se apunta en `avisos`, copia literal de `normalizarConfianza`
(`ocrChequeo.ts:169-174`). Una confianza que no entendemos jamás puede entrar como si fuera buena.

### 5.6 Dónde vive la lógica pura

Directorio nuevo `src/utils/rondaInventario/`, espejado a los **dos** árboles de edge function por un generador
nuevo `docs/inventario/regenerar-copias-ronda-inventario.py`, clonado de
`docs/hato/regenerar-copias-importhato.py` (misma reescritura determinista de especificadores:
`@/utils/x` → `../x.ts`, `./y` → `./y.ts`), con `--check` cableado a
`src/__tests__/rondaInventarioParidadServidor.test.ts`. **Escribir ese generador es un entregable de la Fase 1,
no conocimiento tribal** — sin él, la primera edición a mano de una copia desincroniza en silencio, que es
exactamente lo que el `--check` de `importHato` existe para impedir.

| Módulo | Responsabilidad |
|---|---|
| `causasRaiz.ts` | Las 7 claves + el tipo `Via`. Cubierto por el test de paridad contra la semilla |
| `interpretarNota.ts` | `esquemaJsonHallazgos()`, `construirPromptInterprete()`, `parsearRespuestaModelo()` (tolerante, degrada), `resolverProducto()` (exacto), `derivarFisico()`, `derivarVia()` |
| `preview.ts` | `construirPreview()` (estructura) y `renderPreviewTelegram()` (texto, **sin precio ni valor** — R-15/CA-13), y `aplicarCorreccion()` |
| `reporteCierre.ts` | Ensamblado puro del reporte a partir de filas ya leídas — lo que permite congelarlo serializando una salida pura |

Tests con **fixtures de respuesta de modelo**, precedente `importHatoOcrChequeo.test.ts`:
`src/__tests__/rondaInventarioInterpretacion.test.ts`. El fixture #1 es la frase textual de §11.1 y la
aserción es el preview textual de §11.1 — el brief de producto escribió la salida esperada, así que el test se
escribe antes que el código sin negociar nada con nadie.

Casos adversarios obligatorios en esa suite: «Silicio» que no resuelve (⇒ `no_identificado`, no `Silicalmag` y
no `Sulcamag`); causa ausente (⇒ `aprobacion_gerencia`); causa `otro` (⇒ `aprobacion_gerencia`); `error de
conteo` (⇒ `ninguna`, no mueve inventario); «faltan 3» sin teórico presente (⇒ derivado, rotulado); un
producto que no está en el catálogo (⇒ `observaciones_libres`, no un hallazgo); un audio con la explicación de
David dentro (⇒ `explicacion_citada`, estado `explicacion_precargada`, **ninguna vía habilitada**).

### 5.7 El único riesgo abierto del pipeline, y cómo se retira barato

OpenRouter lista `ogg` entre los formatos de `input_audio`, pero lo describe como *«OGG Vorbis»*, y Telegram
manda **OGG/Opus**: mismo contenedor, códec distinto. No se puede afirmar desde la documentación que el par
funcione.

**Spike, primer día de la Fase 1, media jornada:** una nota de voz real de Uriel, `base64`, un `curl` a
`/api/v1/audio/transcriptions` con `format: "ogg"`. Tres resultados posibles:

1. **Funciona** ⇒ nada que hacer.
2. **Rechaza el formato** ⇒ probar `format: "oga"` y los otros modelos STT de la lista (19 disponibles bajo la
   misma llave). Whisper acepta `oga`/`ogg` en su API nativa, así que la probabilidad de que ninguno sirva es
   baja.
3. **Ningún modelo lo acepta** ⇒ **no se transcodifica**. Deno en edge no tiene `ffmpeg`, y meter un decodificador
   Opus en WASM es una dependencia que no vale este feature. La salida es la que el propio brief de producto ya
   dejó escrita: A-8 se degrada a reporte estructurado (`/hallazgo`, un asistente de 4 pasos), **A-9 se mantiene
   intacta** y el resto del diseño no se mueve un milímetro. Costo: una conversación de Grammy más, ~1 día.

Ese spike también mide lo que §5.3 sólo supone: **corpus fijo de 8-10 notas reales** con los nombres
comerciales del catálogo, los dos candidatos de STT, y la métrica es la tasa de error **sobre los nombres de
producto**, no sobre las palabras en general. Es el único número que decide, porque un nombre mal transcrito
es exactamente lo que R-20 convierte en fricción.

---

## 6. RPC y transaccionalidad — propuesta de migración `126_ronda_inventario_rpcs.sql`

### 6.1 D-T4 y D-T5 — el problema del `service_role`, resuelto explícitamente

El brief plantea la pregunta así: *«¿el bot escribe directo con service role, o llama RPCs SECURITY INVOKER que
fallarían porque no hay `auth.uid()`?»*. La premisa hay que corregirla, y la corrección es lo que gobierna el
diseño:

> **Un RPC `SECURITY INVOKER` llamado con la llave `service_role` NO falla. La RLS ni siquiera se evalúa**,
> porque `service_role` tiene `rolbypassrls`. Lo único que «falla» es cualquier expresión que *derive* un valor
> de `auth.uid()` / `auth.jwt()`: devuelve NULL, en silencio.

Dos consecuencias directas:

1. **Ningún RPC de este flujo puede derivar el actor del JWT.** La migración 106 sí lo hace
   (`cerrado_por := auth.jwt() ->> 'email'`) y está bien, porque su único llamante es un navegador. Acá el
   mismo RPC lo llaman un navegador **y** el bot, y derivar del JWT escribiría NULL exactamente en el camino
   que R-8/CA-12 más necesita atribuido. **El actor viaja en el payload, siempre, y el RPC lo valida.**
2. **Cada RPC lleva su propia guarda de actor.** Es la lección de la 082 parte 1
   (`fn_cleanup_compra_dependencies` era `DEFINER` sin chequeo de llamante) aplicada a la situación inversa:
   si RLS no está protegiendo la llamada, la función tiene que protegerse sola. Vale igual.

Se conserva `SECURITY INVOKER` (precedentes 070/106): para el navegador la RLS sigue siendo una capa real, y
un `DEFINER` la saltaría también para él y obligaría a reimplementar adentro políticas que ya existen.

El helper que centraliza la regla, para que no derive entre diez funciones:

```sql
-- PROPUESTA
CREATE OR REPLACE FUNCTION fn_ronda_validar_actor(
  p_usuario  UUID,          -- actor_usuario_id del payload
  p_telegram UUID,          -- actor_telegram_usuario_id del payload
  p_modulo   TEXT           -- 'inventario_ronda' | 'inventario_explicacion' | 'inventario_aprobacion'
) RETURNS VOID
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public, pg_temp AS $$
DECLARE v_ok BOOLEAN;
BEGIN
  IF (p_usuario IS NULL) = (p_telegram IS NULL) THEN
    RAISE EXCEPTION 'Actor inválido: debe venir exactamente uno de usuario/telegram.';
  END IF;

  IF auth.uid() IS NOT NULL THEN
    -- ── Rama NAVEGADOR ────────────────────────────────────────────────────
    -- Una sesión de navegador SÓLO puede ser ella misma, y NUNCA puede
    -- reclamar una identidad de Telegram. Esto cierra la suplantación por
    -- construcción, no por buena voluntad del llamante.
    IF p_telegram IS NOT NULL THEN
      RAISE EXCEPTION 'Una sesión autenticada no puede actuar como un usuario de Telegram.';
    END IF;
    IF p_usuario <> (SELECT auth.uid()) THEN
      RAISE EXCEPTION 'El actor declarado no coincide con la sesión.';
    END IF;
    RETURN;
  END IF;

  -- ── Rama SERVICE ROLE (bot / tick). auth.uid() es NULL ──────────────────
  IF p_telegram IS NULL THEN
    RAISE EXCEPTION 'Sin sesión autenticada, el actor debe ser un usuario de Telegram.';
  END IF;
  SELECT TRUE INTO v_ok FROM telegram_usuarios t
   WHERE t.id = p_telegram AND t.activo AND p_modulo = ANY(t.modulos_permitidos);
  IF NOT COALESCE(v_ok, FALSE) THEN
    RAISE EXCEPTION 'El usuario de Telegram no está activo o no tiene el módulo %.', p_modulo;
  END IF;
END $$;
```

La guarda de **Gerencia** (sólo para `fn_ronda_decidir_ajuste`) no puede usar `es_usuario_gerencia()`: esa
función es `SECURITY DEFINER` sobre `auth.uid()` y con `service_role` devuelve falso siempre, así que Santiago
respondiendo desde Telegram quedaría fuera. Se resuelve por el vínculo, que existe porque Santiago **sí** es
usuario web:

```sql
-- dentro de fn_ronda_decidir_ajuste, después de fn_ronda_validar_actor(...)
IF NOT EXISTS (
  SELECT 1 FROM usuarios u
   WHERE u.rol = 'Gerencia'
     AND u.id = COALESCE(p_usuario, (SELECT t.usuario_id FROM telegram_usuarios t WHERE t.id = p_telegram))
) THEN
  RAISE EXCEPTION 'Aprobar o desestimar un ajuste es exclusivo de Gerencia (R-14 vía b).';
END IF;
```

**Falla cerrada de la forma correcta:** si alguien le diera `inventario_aprobacion` a un usuario de Telegram
sin `usuario_id`, el `COALESCE` da NULL, no hay fila, y la excepción salta. La única forma de aprobar es ser
una cuenta Gerencia real. Ese es el punto donde el bypass de RLS podría haberse vuelto un agujero, y es el que
lleva su propio test adversarial (§12).

### 6.2 Los diez RPC

Todos: `SECURITY INVOKER`, `SET search_path = public, pg_temp` (con `pg_temp` **al final**, 082 parte 3),
payload `jsonb`, retorno `jsonb`, `EXECUTE` revocado a `anon`, y `fn_ronda_validar_actor` como primera línea.

| RPC | Módulo exigido | Qué escribe | Guardas propias |
|---|---|---|---|
| `fn_ronda_abrir` | `inventario_ronda` | `rondas_inventario` + `rondas_inventario_alcance` | El índice parcial impide dos en curso; `es_linea_base` se **calcula** (no existe ronda `cerrada` previa) |
| `fn_ronda_confirmar_hallazgos` | `inventario_ronda` | `rondas_transcritos` → `confirmado` + N `rondas_excepciones` | `FOR UPDATE` sobre el transcrito + estado ⇒ un doble toque no duplica; rechaza `producto_id NULL` (CA-32); **re-deriva `via` del catálogo**. Abre la ventana de deshacer de §6.5 |
| `fn_ronda_deshacer_confirmacion` **(nuevo, P-1)** | `inventario_ronda` | Borra las excepciones de ese transcrito y lo devuelve a `preview_pendiente` | Ver §6.5 — tres condiciones de ventana |
| `fn_ronda_explicacion_david` | `inventario_explicacion` | Las 5 columnas `explicacion_david_*`, estado → `explicada` | La excepción debe estar en `reportada`/`explicacion_precargada` |
| `fn_ronda_resolver_con_captura` | `inventario_explicacion` | `movimientos_inventario` + `productos` + excepción → `resuelta_con_captura` | Ver §6.3 |
| `fn_ronda_proponer_ajuste` | `inventario_explicacion` | Columnas `propuesta_*`, estado → `ajuste_propuesto` | Exige `explicacion_david_en IS NOT NULL`. **No toca inventario** |
| `fn_ronda_decidir_ajuste` | `inventario_aprobacion` **+ Gerencia** | Columnas `decision_*`, estado → `ajuste_aprobado`/`ajuste_desestimado` | `decision_causa` NOT NULL (CA-11) |
| `fn_ronda_aplicar_ajuste` | cualquiera de los tres | `movimientos_inventario` + `productos` + estado → `ajuste_aplicado` | Ver §6.4 |
| `fn_ronda_cerrar` | `inventario_ronda` | Estado → `cerrada`, `alcance_declarado` | **No exige excepciones resueltas** (CA-5) |
| `fn_ronda_emitir_reporte` | — (lo llama el tick) | `rondas_reportes` | Único por ronda; el contenido llega ya resuelto |

`fn_ronda_aplicar_ajuste` acepta los tres módulos porque B-7 nombra explícitamente a *«David, Uriel o
Santiago»*: aplicar es mecánico, y lo que CA-9 protege («ninguna ruta que permita a David o a Uriel aplicarla
**por su cuenta**») ya está protegido por la guarda `estado = 'ajuste_aprobado'`. Sin aprobación, ninguno de
los tres puede.

### 6.3 `fn_ronda_resolver_con_captura` — la vía (a) sin perder trazabilidad

Es el RPC donde CA-8 se gana o se pierde. Sigue el molde de la 106: **valida todo antes de escribir nada**,
`FOR UPDATE` temprano, una sola transacción.

```
1. fn_ronda_validar_actor(..., 'inventario_explicacion')
2. SELECT ... FROM rondas_excepciones WHERE id = ... FOR UPDATE
   ├─ estado debe ser 'explicada'                       -- CA-38: la cita no habilita nada
   └─ explicacion_david_en IS NOT NULL                  -- redundante con el CHECK, a propósito
3. tipo_movimiento <> 'Ajuste'                          -- CA-8 literal: "no se registra como «ajuste»"
   (los válidos son 'Entrada' | 'Salida por Aplicación' | 'Salida Otros')
4. SELECT cantidad_actual FROM productos WHERE id = ... FOR UPDATE
   └─ saldo resultante >= 0     -- productos.cantidad_actual NO tiene CHECK >= 0 (guarda (b) de la 106)
5. INSERT movimientos_inventario (fecha_movimiento REAL del movimiento, no hoy;
                                  saldo_anterior/saldo_nuevo; observaciones citando la ronda)
6. UPDATE productos SET cantidad_actual = <nuevo>
7. UPDATE rondas_excepciones SET estado='resuelta_con_captura',
     captura_movimiento_id=<id>, captura_en=now(), captura_por_*=<actor>
```

**`movimientos_inventario` no se altera.** No tiene columna de capturador y es una tabla caliente muy leída;
agregarle un FK a `rondas_excepciones` para un caso que ya es representable desde el otro lado sería trabajo y
riesgo sin ganancia. La trazabilidad de CA-12 vive en la excepción (`captura_movimiento_id` + `captura_por_*`),
que además es el lado por el que se consulta («¿qué movimiento resolvió esta excepción?»).

Una excepción resuelve **un** movimiento. Si un caso real necesitara dos, se parte en dos excepciones — es más
honesto que un movimiento cuya mitad se atribuye a otra cosa.

### 6.4 `fn_ronda_aplicar_ajuste` — delta, no fijación, y el aviso de CA-2

R-4/CA-2 son la parte más precisa del brief y merecen implementarse literal: **el ajuste aplica el delta
(físico − teórico del momento del conteo)** y **si el teórico cambió entre el conteo y la aplicación, el
sistema lo informa antes de aplicar y no aplica en silencio**.

```
delta := excepcion.cantidad_fisica - excepcion.teorico_conteo    -- ambos congelados al confirmar

SELECT cantidad_actual INTO v_vivo FROM productos WHERE id = ... FOR UPDATE

IF v_vivo <> excepcion.teorico_conteo AND NOT (payload->>'confirmar_cambio_teorico')::bool THEN
   RETURN jsonb_build_object(
     'aplicado', false,
     'motivo',  'teorico_cambio',
     'teorico_al_conteo', excepcion.teorico_conteo,
     'teorico_hoy',       v_vivo,
     'delta',             delta);         -- ← el llamante DEBE mostrárselo al humano
END IF;

nuevo := v_vivo + delta;                  -- DELTA sobre el saldo VIVO. Jamás `nuevo := fisico`
IF nuevo < 0 THEN RAISE EXCEPTION ... END IF;
INSERT movimientos_inventario (tipo_movimiento='Ajuste', cantidad=delta, saldo_anterior=v_vivo,
                               saldo_nuevo=nuevo, observaciones='Ronda <periodo> · <causa>')
UPDATE productos SET cantidad_actual = nuevo
UPDATE rondas_excepciones SET estado='ajuste_aplicado', aplicacion_* = ...
```

Los dos pasos (rechazo informativo → segunda llamada con `confirmar_cambio_teorico`) son la lectura literal de
CA-2: *informar antes*, no *aplicar y contar después*. Y son el contraste exacto contra el ajuste manual que
existe hoy, donde `nuevoSaldo = cantidadNum` **fija** el saldo (`NuevoMovimientoModal.tsx:126-129`) y borraría
en silencio cualquier movimiento legítimo ocurrido entre el conteo y la aplicación.

> **Costo declarado.** Este RPC no cambia `NuevoMovimientoModal`, que sigue fijando el saldo. Es lo correcto —
> CA-26 dice que el ajuste puntual sigue igual — pero deja **dos semánticas de «Ajuste» conviviendo** en
> `movimientos_inventario`: la del camino (b), que fija, y la de la ronda, que aplica delta. Ambas escriben el
> mismo `tipo_movimiento`. Se distinguen por `observaciones` y por el `aplicacion_movimiento_id` de la
> excepción; no es elegante, y es el precio de dejar el camino (b) intacto.

### 6.5 `fn_ronda_deshacer_confirmacion` — el Deshacer de P-1

**Sí borra filas, y eso es lo correcto acá.** No es un desenlace: es la anulación de un registro que existió
segundos y que **no tiene ninguna escritura aguas abajo que proteger**. La evidencia no se pierde, porque
sobrevive lo que importa: **el transcrito**, que es la capa cruda de este flujo (CA-36) y que conserva íntegro
lo que Uriel narró. Lo que se borra es la *derivación*, y se vuelve a derivar.

Se descartó modelarlo como un décimo estado `deshecha`: no es ninguno de los tres desenlaces de CA-10, y cada
consulta, cada conteo y cada reporte tendría que acordarse de excluirlo — que es exactamente cómo un valor
fantasma se cuela en un «N excepciones».

**La ventana son TRES condiciones, y la tercera es la que no estaba escrita:**

```
1. fn_ronda_validar_actor(..., 'inventario_ronda')

2. SELECT ... FROM rondas_transcritos WHERE id = ... FOR UPDATE
   └─ estado = 'confirmado'                      -- si no, no hay nada que deshacer

3. SELECT ... FROM rondas_inventario WHERE id = <ronda> FOR UPDATE
   └─ estado = 'en_curso'                        ◄── LA QUE FALTABA
      CA-5 permite cerrar con excepciones abiertas y CA-19 emite el reporte al
      cerrar. Con el reporte ya emitido, borrar una excepción dejaría el reporte
      CONGELADO nombrando N y la tabla con N-1 -- una divergencia que R-10/CA-18
      no puede arreglar, porque el reporte tiene prohibido recalcularse.

4. NOT EXISTS (SELECT 1 FROM rondas_excepciones
                WHERE transcrito_id = ... AND explicacion_david_en IS NOT NULL)
   └─ si David ya tocó UNA sola, no se deshace NINGUNA: la unidad de deshacer es
      el transcrito entero, igual que la unidad de confirmar (CA-35)

5. DELETE FROM rondas_excepciones WHERE transcrito_id = ...
6. UPDATE rondas_transcritos SET estado = 'preview_pendiente', confirmado_en = NULL
   -- intentos_preview NO se toca (§4.3)
```

**Por qué el paso 4 no necesita comprobar nada más.** En `reportada` / `explicacion_precargada` una excepción
no ha producido **ninguna** escritura fuera de sí misma: no hay `movimientos_inventario` (la vía (a) exige
`explicada`), no cambió `productos.cantidad_actual` (R-1/CA-1 lo prohíbe explícitamente al reportar), no hay
propuesta ni decisión, y los `CHECK` de §4.4 hacen **imposible** que haya llegado más lejos sin el sello de
David. Borrarla es un no-evento para el resto del sistema. Por eso **no hace falta ninguna columna nueva**: el
`explicacion_david_en IS NULL` que ya existe *es* el reloj de la ventana.

**Qué NO debilita.** CA-29 sigue intacta: confirmar sigue registrando. Deshacer es una segunda acción
deliberada, del mismo actor, dentro de una ventana que cierra la primera acción de otra persona. Y CA-10
tampoco se toca: una excepción deshecha nunca alcanzó un estado terminal, así que no hay desenlace que fundir.

> **Criterio de aceptación de diseño (para QA).** Una excepción sólo puede desaparecer de `rondas_excepciones`
> por este RPC, con la ronda `en_curso` y sin que David haya tocado ninguna del mismo transcrito. En cualquier
> otra condición el intento falla y **no borra nada**. Si el CPO quiere numerarlo como CA-39, es suyo: **este
> brief no crea criterios de producto**, sólo hace verificable el que P-1 decidió.

---

## 7. D-T9 — arquitectura de la conversación de Telegram

### 7.1 Por qué la ronda no es una conversación de Grammy

El patrón de `pesajeLeche` / los otros cinco flujos es correcto para lo que hacen: **un asistente acotado**, de
minutos, que empieza y termina en una sesión. La ronda no es eso:

- Vive **días** (E2 → E4). El estado de conversación vive en `telegram_conversations` y se reconstruye
  reejecutando la función desde el principio en cada webhook (cabecera de `pesajeLeche.ts:38-50`) — no está
  pensado para intermitencia de días.
- **Mientras una conversación está activa, el plugin se traga todos los updates**, incluidos los
  `bot.command` globales. Con la ronda como conversación, `/existencias` (A-2, que Uriel necesita **mientras
  cuenta**) nunca dispararía. Ese es el trade-off concreto, no una preferencia estética.
- **CA-37 exige que el borrador sin confirmar sobreviva.** Un valor de sesión no sobrevive a un `/cancelar`,
  a un `conversation.halt()` ni a un redespliegue. Tiene que estar en la base (§4.3).

Entonces: **la ronda es estado de base de datos**, y el plugin se usa exactamente donde encaja su grano.

### 7.2 El reparto

| Interacción | Mecanismo | Por qué |
|---|---|---|
| Recordatorio → `[Empezar]` / `[Posponer]` | `bot.callbackQuery(/^ronda_abrir:…$/)` | Un toque. Una conversación sería maquinaria para nada |
| `/existencias <texto>` (A-2) | `bot.command`, gateado por `inventario_ronda` | Devuelve hasta 10 coincidencias con **cantidad y unidad**, sin precio (R-15) |
| El alcance completo, al abrir | `replyWithDocument` con un `.txt` de las 193 líneas | **Es el reemplazo literal de la hoja impresa del Sheet de David** (§3.4/A-2): se scrollea sin señal y no cuesta 4 mensajes |
| Nota de voz | `bot.on('message:voice')` + `bot.on('message:audio')` | Fuera de toda conversación. Busca la ronda `en_curso` del autor; si no hay, lo dice |
| Preview → `[Confirmar]` / `[Corregir]` / `[Descartar]` | `bot.callbackQuery(/^ronda_prev:…$/)` + `bot.on('message:text')` cuando hay `preview_pendiente` | El estado del bucle está en `rondas_transcritos`, no en la sesión |
| `[Deshacer]` sobre un registro recién confirmado (P-1) | `bot.callbackQuery(/^ronda_undo:…$/)` | Precedente `hato_ev_undo`. La ventana se valida en el RPC, no en el botón — §6.5, §7.4 |
| Cerrar la ronda (A-5) | **conversación `cierreRonda`** | Asistente genuino: ¿completo o parcial? → si parcial, ¿qué faltó? → confirmar |
| David explica y resuelve (B-1/B-2/B-5) | **conversación `excepcionDavid`** | Asistente genuino: confirmar/corregir la cita → ¿hay respaldo? → tipo, cantidad, fecha, destino |
| Santiago aprueba (B-6) | `bot.callbackQuery` en dos pasos (`…:causa:<clave>` → `…:ok`) | **Deliberadamente NO una conversación**: Santiago es el usuario más pesado de Esco, y una conversación activa le bloquearía las consultas |

Las dos conversaciones son cortas y explícitamente rechazan una nota de voz mientras están activas («estás
cerrando la ronda; termina o escribe *cancelar*»), porque el plugin se la tragaría en silencio.

Registro en `bot.ts`, exactamente donde están las seis actuales (`bot.ts:141-146`):

```ts
bot.use(createConversation(cierreRondaConversation, "cierreRonda"));
bot.use(createConversation(excepcionDavidConversation, "excepcionDavid"));
```

Y `/ronda` en `setMyCommands` + en `buildMenuKeyboard` bajo `if (mods.includes("inventario_ronda"))`, siguiendo
el molde de `hato_produccion`.

### 7.3 El bucle de preview (A-9/CA-35)

```
voz → [transcribe] → [interpreta] → preview  (intentos_preview = 1)
                                       │
        ┌──────────────────────────────┼──────────────────────────────┐
        │                              │                              │
   [Confirmar]                   texto libre                    [Descartar]
        │                              │                              │
        ▼                              ▼                              ▼
 fn_ronda_confirmar_        se agrega a `correcciones`,        estado='descartado'
 hallazgos (transacción)    se re-interpreta el TRANSCRITO
        │                   + correcciones ⇒ preview ENTERO
   estado='confirmado'      (CA-35: se confirma completo,
                            no hallazgo por hallazgo)
                            intentos_preview += 1
                                       │
                            intentos_preview > 4 ⇒
                              estado='sin_confirmar'
                              el bot CEDE, ofrece /hallazgo,
                              y dice que lo narrado quedó guardado
```

`MAX_INTENTOS_PREVIEW = 4` (11.c dice 3-4; se toma el extremo generoso) vive en **una** constante de
`src/utils/rondaInventario/preview.ts`, usada por el handler y por el texto del mensaje, para que no puedan
decir cosas distintas.

**La corrección re-interpreta el transcrito original más el historial de correcciones**, nunca edita el
transcrito. Es lo que mantiene la capa cruda cruda (CA-36) y lo que permite, después, auditar por qué un
hallazgo quedó como quedó.

### 7.4 Deshacer — **parte del diseño** (P-1, resuelta 2026-08-28)

El mismo mecanismo que ya existe y está probado para `/evento` (`bot.ts:529-574`, `hato_ev_undo`): el mensaje
que confirma el registro trae un botón `Deshacer` con el id del transcrito en el `callback_data`
(`ronda_undo:<transcritoId>`), que llama a `fn_ronda_deshacer_confirmacion` (§6.5).

Cuatro detalles de comportamiento que se copian del precedente porque ya están resueltos ahí:

- **El botón se quita del mensaje al usarse** (`editMessageText`, `bot.ts:570-573`). Un segundo toque sobre un
  transcrito ya deshecho sólo diría «ya no existe», y deja al usuario dudando de si borró dos cosas.
- **Un `callback_data` se puede reenviar**, así que la autorización no está en el botón sino en el RPC: la
  ventana de §6.5 se comprueba server-side, siempre.
- **El mensaje posterior dice qué quedó**, literal: «↩️ Deshecho. Los N hallazgos no quedaron registrados. Lo
  que narraste sigue guardado — puedes corregirlo y confirmarlo de nuevo.» Esa segunda frase importa: sin ella
  Uriel cree que perdió el recorrido y lo repite.
- **Fuera de la ventana, el bot lo explica en vez de fallar**: «David ya revisó esos hallazgos» o «la ronda ya
  está cerrada», no un error genérico. Es lo que evita que Uriel escriba por WhatsApp preguntando qué pasó.

**Por qué esto no vuelve la ronda un estado de conversación** (D-T9): el botón vive en un `callbackQuery` y
todo el estado que necesita está en `rondas_transcritos` y `rondas_inventario`. Un Deshacer funciona días
después de la confirmación, y funciona igual si el bot se redesplegó en el medio.

---

## 8. Recordatorio, alerta del día 15 y reporte de cierre

### 8.1 Un solo endpoint, un solo cron

`POST /make-server-1ccce916/inventario/ronda/tick` (`ronda-inventario-tick.ts`), calcado de
`hato-alertas-tick.ts` y `acciones-tick.ts`:

- **Auth**: encabezado `x-inventario-tick-secret` comparado contra `Deno.env.get('INVENTARIO_TICK_SECRET')`.
  **Sin la variable ⇒ 503 y no hace nada.** Nunca corre abierto. Es el contrato que ya comparten
  `HATO_ALERTAS_TICK_SECRET`, `ACCIONES_TICK_SECRET`, `CLIMA_SYNC_SECRET` y `TELEGRAM_WEBHOOK_SECRET`.
- **Segunda puerta**: JWT + Gerencia, para corridas manuales (precedente `/acciones/tick`).
- Secreto en Vault como `inventario_tick_secret`, resuelto **en tiempo de disparo por nombre** — el valor
  nunca queda en un archivo versionado.

**Cuatro** trabajos, en una sola corrida diaria, cada uno con su clave idempotente en `rondas_avisos`:

| Trabajo | Condición | Clave |
|---|---|---|
| Recordatorio (A-1/CA-3) | día 1 del mes, o la fecha a la que Uriel pospuso (A-4), y no hay ronda `cerrada` del período | `recordatorio:AAAA-MM` (o `recordatorio:AAAA-MM:posp:N`) |
| Bloque «mes omitido» (R-11/CA-23/CA-24) | día ≥ 15 y no hay ronda `cerrada` del período | `mes_omitido:AAAA-MM` |
| **Bloque «excepciones vencidas» (P-2, M-4)** | **día 15 y existe ≥ 1 excepción sin desenlace terminal con más de 30 días desde `reportada_en`** | `excepciones_vencidas:AAAA-MM` |
| Emisión del reporte de cierre (C-1/CA-19) | hay ronda `cerrada` sin fila en `rondas_reportes` | — (la PK de `rondas_reportes` es la idempotencia) |

Los dos bloques del día 15 **se componen en un solo mensaje** si los dos aplican, y cada uno se emite si su
propia clave se reclamó. Tres consecuencias que conviene tener escritas:

- **El bloque de excepciones vencidas NO cuelga del de mes omitido.** Si colgara, sería silencioso exactamente
  en los meses buenos — los meses en que la ronda **sí** se hizo y quedó deuda abierta, que son los que M-4
  mide. Es un trabajo propio, con su condición propia.
- **Cadencia mensual, no diaria.** Una excepción que cruza los 30 días el día 20 espera al día 15 siguiente.
  Es deliberado: la alternativa es una notificación diaria que Santiago aprende a ignorar, y el seguimiento
  continuo ya tiene dueño — **C-5** («deuda de excepciones visible»), que es `Should` y vive en la pantalla de
  §9, no en una notificación.
- **CA-24 se respeta literal**: «una sola alerta por mes omitido» sigue siendo una sola, porque su clave sigue
  siendo `mes_omitido:AAAA-MM`. Agregarle un segundo bloque al mensaje no multiplica el aviso.

La política vive en el código, el cron sólo dispara — es el hábito del repo (`hato-alertas-tick` decide, la 060
sólo llama).

### 8.2 El horario: **07:00 Bogotá** = `'0 12 * * *'`

Los tres minutos vecinos están ocupados: 05:45 `hato-alertas-tick` (060), 05:50 `acciones-recomendadas-tick`
(102), 06:00 `clima-reintentar-sin-dato` (121). Tres razones para 07:00 y no para un hueco cualquiera:

1. Está libre y a una hora completa del vecino más cercano, así que un backfill de clima lento no compite.
2. **Este tick es el único de los cuatro cuya salida es un mensaje que un humano debe accionar ese mismo día.**
   Los otros tres son tareas de máquina y les da igual el amanecer; un recordatorio que llega a las 05:45 se
   pierde entre notificaciones nocturnas.
3. Bogotá es UTC-5 sin horario de verano (mismo cálculo de 030/036/060/102), así que 07:00 Bogotá = 12:00 UTC.

`cron.schedule` hace upsert por `jobname`, así que la migración `127_ronda_inventario_cron.sql` es idempotente
sin `unschedule` previo. Y es **segura de aplicar antes de que el endpoint exista**: hasta el despliegue el POST
devuelve 404, `pg_net` lo registra en `net._http_response` y no pasa nada (mismo argumento de 060 y 102).

> **La mina de la 105, que no se vuelve a armar.** El orden de puesta en marcha es obligatorio:
> (1) crear el secreto en Vault, (2) configurarlo como secreto de edge function, (3) aplicar la migración del
> cron, (4) desplegar. Los pasos 1-3 son inofensivos sin el 4. Y como el endpoint es nuevo — no un gate sobre
> uno existente — no hay ninguna versión desplegada que pueda activarse sola con un `functions deploy` de otra
> cosa. Esa es la diferencia estructural con la 105, y hay que mantenerla: **el gate y el endpoint nacen juntos**.

### 8.3 El reporte de cierre (C-1/CA-19/CA-20/CA-21/CA-22)

Contenido, en orden:

1. **Cabecera**: período, fechas, quién cerró, alcance declarado (`completo`/`parcial` + nota).
   Si `es_linea_base`, un párrafo que lo explica — **R-17/CA-22**, para que el pico no se lea como pérdida.
2. **Valor total del inventario** y **variación contra el mes anterior** — sólo si
   `inventario_parametros.valoracion_publicable = true`. Si no, **la línea no aparece** (CA-20: se emite sin
   ellas, nunca con ellas mal). Si es la primera ronda, la variación es `—`, nunca 0 ni 100 % (CA-21).
3. **Excepciones**, agrupadas por desenlace, **con los tres desenlaces nombrados distinto** (CA-10):
   «cerradas sin ajuste» · «resueltas con captura» · «ajustes aplicados / desestimados / pendientes».
4. **Movimientos ocurridos con la ronda abierta** (R-9/CA-19): las capturas de la vía (a), los ajustes
   puntuales del camino (b), **y las entradas de productos que no estaban en el alcance congelado** — que es
   dónde aterriza P-3 (§4.1). Es la mitigación honesta contra usar el atajo para saltarse el control, y de paso
   el sitio donde una compra a mitad de ronda queda visible sin inventar ningún concepto: se ve como lo que es,
   un movimiento con la ronda abierta, no como un producto «conforme» ni como uno «no verificado».
5. **Observaciones libres** de Uriel, incluidas las de producto no catalogado (CA-14).
6. **Borradores sin confirmar**: «N hallazgos narrados sin confirmar» (CA-37). Una ronda con borradores
   **no se reporta como limpia**. Después de `fn_ronda_cerrar` el predicado es uno solo —
   `rondas_transcritos.estado = 'sin_confirmar'` — porque el cierre normaliza ahí todo lo que hubiera quedado
   en `preview_pendiente`, incluido lo que un Deshacer devolvió y nadie retomó (§4.3).

Se ensambla con `reporteCierre.ts` (puro), se **serializa entero** a `rondas_reportes.contenido` +
`texto_telegram`, y **de ahí se lee siempre** (R-10/CA-18). Nunca se recalcula. Es la misma lección que la
migración 122, que agregó una columna sólo para poder auditar después por qué un día quedó como quedó.

Todo número pasa por `src/utils/format.ts` (R-13). Toda fecha por `obtenerFechaHoy()` — con la salvedad de que
**el tick corre en Deno, donde local = UTC**, así que la conversión a `America/Bogota` es explícita, igual que
`hoyBogota()` en `pesajeLeche.ts:82-86`. Es la excepción declarada del `CLAUDE.md`: las edge functions están
deliberadamente fuera del alcance de `obtenerFechaHoy()`.

### 8.4 El mensaje del día 15 (R-11/CA-23/CA-24 + P-2)

Un solo mensaje a Santiago, con uno o dos bloques según qué aplique. Si no aplica ninguno, **no se manda nada**
— un día 15 con la ronda hecha y sin deuda no genera ruido.

```
⚠️ Revisión del 15

[bloque A — sólo si no hay ronda cerrada del mes]
La ronda de <mes> no se ha cerrado.
Última ronda cerrada: <mes anterior>.

[bloque B — sólo si hay excepciones sin desenlace con más de 30 días]
Hay N excepciones abiertas hace más de 30 días:
  • <producto> — reportada el <fecha>, <estado> (<días> días)
  … hasta 5, y "y N más" si sobran

Ver el detalle en Inventario → Rondas.
```

Tres reglas de contenido, y las tres salen de contratos que ya existen:

- **El bloque B nombra el estado en el que está trabada cada excepción**, no sólo el conteo. «Esperando la
  explicación de David» y «esperando tu aprobación» requieren acciones de personas distintas, y fundirlas en
  «5 abiertas» le deja a Santiago el trabajo de averiguar a quién apurar. Es el mismo principio de CA-10 una
  vuelta más abajo.
- **Sin valoración.** El mensaje no lleva el valor de las diferencias: la valoración depende del saneamiento
  de §11 y CA-20 sólo la habilita en el reporte de cierre. Acá no hace falta para decidir a quién apurar.
- **`—` para lo que no hay**, nunca 0. Si no hay ronda anterior cerrada, «Última ronda cerrada: —».

---

## 9. D-T10 — dónde vive el historial (C-3)

**Pantalla web**, en el módulo que ya existe: `/inventario/rondas` (lista) y `/inventario/rondas/:id` (detalle).
La herramienta de Esco se agrega **además**, y acotada.

Tres razones, en orden de peso:

1. **Auditar exige render determinista.** CA-10 dice que los tres desenlaces «no se colapsan en la UI ni en el
   reporte». Sobre una pantalla eso es un contrato que se prueba con un test de componente. Sobre un modelo que
   parafrasea no se puede probar, y el repo ya tiene el recibo: el incidente del 2026-08-16 en que Esco reportó
   «47 días sin lluvia» cuando habían pasado 4 (`docs/archive/incidents/2026-08-16-esco-clima-ventana-24h.md`).
   El historial de un control interno es el último sitio donde uno quiere una cifra parafraseada.
2. **La ruta ya existe y hoy miente.** `/inventario/verificaciones/:id` cae en un `ComingSoon` y el botón
   `revisar/:id` cae en el catch-all y redirige al tablero en silencio (D-5). CA-27 obliga a quitarlos igual, así
   que construir la pantalla real y borrar el botón muerto son el mismo trabajo.
3. Es donde David y Santiago ya trabajan.

**La herramienta de Esco** `get_rondas_inventario` se agrega para las preguntas de patrón —
*«¿este producto ya falló antes?»*, C-4/M-7 — devolviendo **hechos agregados**, con la misma disciplina que el
resto de las herramientas. La pantalla es el registro de verdad; Esco es una lectura de conveniencia, y así se
describe en el prompt. Uriel no tiene ninguna de las dos (no tiene usuario web ni el módulo `consultas`, §3.3).

**C-4 y C-5 son `Should` y no entran en la primera entrega** — C-4 necesita tres rondas para decir algo y
construirlo antes es construir una pantalla vacía (§13, Fase 7).

---

## 10. D-T11 — qué pasa con el código muerto y con las tablas viejas

Propuesta de migración `128_retirar_verificaciones_legado.sql` + el borrado de componentes.

> **Alcance reducido tras la Fase 0 (rev. 3).** La migración **124, ya aplicada**, se llevó tres de las cinco
> cosas que esta sección le asignaba a la de retiro: el rótulo D-1, los `COMMENT ON TABLE` y el `REVOKE` de
> escritura. **A la `128` le quedan dos sentencias**: `DROP FUNCTION aplicar_ajustes_verificacion(integer, text)`
> y `COMMENT ON VIEW vista_resumen_verificaciones`. El borrado de las pantallas y de las rutas **no tiene
> contraparte SQL** — son ficheros React y líneas de `App.tsx`, nada de esquema.

| Artefacto | Destino | Motivo |
|---|---|---|
| `ConteoFisico.tsx` (~600 líneas) | **Borrar** | El conteo producto-por-producto está fuera de alcance (§8.2) y su «Completar Verificación» es D-4: sólo hace `update({estado:'Pendiente Aprobación'})`, nunca ajusta nada. CA-27 prohíbe botones que no pueden cumplir su promesa. No hay nada reutilizable: el flujo nuevo no tiene carrusel |
| `NuevaVerificacion.tsx` | **Borrar** | D-3: crea 226 renglones sin selección posible. La apertura nueva es un toque + `fn_ronda_abrir` |
| `VerificacionesList.tsx` | **Reescribir** como `RondasList.tsx` | D-7 (`'Gerente'`) muere con ella — pero D-7 es `Must` e independiente, así que **el string se corrige en la Fase 0** y la reescritura puede llegar después sin bloquear la higiene |
| `VerificacionesNav.tsx` | Absorber en la pantalla nueva | — |
| Rutas `verificaciones/nueva`, `conteo/:id`, `:id` (`ComingSoon`) y los 3 botones que llevan a ellas | **Borrar** de `App.tsx:93-98`, `VerificacionesList.tsx:186,254` y `VerificacionesNav.tsx:18` | CA-27. **Sube de la Fase 6 a la Fase 0** — ver «la consecuencia viva» abajo |
| `aplicar_ajustes_verificacion(integer, text)` | **`DROP FUNCTION`** | Cero call sites, firma rota (`integer` contra columna `uuid`) — y dejar una función muerta llamada «aplicar ajustes de verificación» al lado de una que **sí** aplica ajustes es exactamente cómo alguien llama a la equivocada. Se dropea en la misma migración que crea `fn_ronda_aplicar_ajuste` |
| `vista_resumen_verificaciones` | **Se deja viva.** No se dropea | Verificado 2026-08-28: existe y hace `JOIN verificaciones_inventario + verificaciones_detalle GROUP BY`. Ver abajo |
| `verificaciones_inventario` / `verificaciones_detalle` | **Conservar, congelar y rotular** — **HECHO** en la migración 124 (aplicada) | CA-25: la fila del 30 de julio y sus 223 renglones **no se borran ni se reescriben** |

**Cómo se rotuló la verificación histórica sin mentir (D-1/CA-25) — ejecutado en la migración 124.** Poner
`estado = 'Rechazada'` a secas habría sido peor que no hacer nada: se leería como *«una ronda real que se
rechazó»*, que es literalmente lo que D-1 quiere impedir. Se usaron tres marcas, ninguna destructiva (lo que
sigue es lo que este brief propuso; el fichero aplicado lo implementa con guardas `RAISE EXCEPTION` de pre y
post condición al estilo 080/081/099):

```sql
UPDATE verificaciones_inventario
   SET estado = 'Rechazada',
       motivo_rechazo = 'REGISTRO DE PRUEBA — no fue una ronda real. '
                        'Creada por una exploración el 2026-07-30, 0 de 223 renglones contados. '
                        'Ver docs/plan_verificacion_inventario.md D-1/CA-25.',
       observaciones_generales = '[PRUEBA] ' || COALESCE(observaciones_generales, '')
 WHERE id = '4a595f8c…';

COMMENT ON TABLE verificaciones_inventario IS
  'RETIRADA 2026-08-2x. Reemplazada por rondas_inventario (ronda de inventario, decisión 9.9). '
  'Conserva UNA fila, que es un registro de prueba, no una ronda real. Sólo lectura.';

-- El retiro estructural: nada puede volver a escribirlas.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON verificaciones_inventario, verificaciones_detalle
  FROM authenticated, anon;
```

El `REVOKE` es lo que de verdad las retira: un `GRANT` ausente le gana a cualquier política (lección de la
081), así que las políticas que la 104 dejó para Administrador/Gerencia/Verificador quedan inertes para
escritura y vivas para `SELECT`. `service_role` conserva acceso por `rolbypassrls`, que es lo que permite esta
misma migración.

### 10.1 La consecuencia viva del `REVOKE`, y por qué CA-27 sube a la Fase 0

**Estado real tras aplicar la 124** (verificado en el árbol el 2026-08-28):

| | |
|---|---|
| En la base | `authenticated` **ya no tiene** `INSERT`/`UPDATE` sobre las dos tablas |
| En la app | `App.tsx:93-98` conserva las rutas `nueva` y `conteo/:id`, y **tres sitios siguen renderizando el botón** que lleva a ellas (`VerificacionesList.tsx:186` y `:254`, `VerificacionesNav.tsx:18`) |

O sea: **hoy «Nueva Verificación» lleva a un `permission denied`.** La propia migración 124 lo anticipó y lo
calificó de costo teórico, y tiene razón sobre el *impacto* — D-1 probó que nadie usa el módulo desde hace un
año. Pero el *criterio* es otro: **CA-27 es `Must`** y dice que un botón que no puede cumplir su promesa no se
renderiza. Antes de la Fase 0 ese botón al menos creaba una fila; ahora falla. La higiene dejó el módulo
**menos** consistente con CA-27 que antes, no más.

**Decisión: quitar esas rutas y esos tres botones se mueve de la Fase 6 a la Fase 0**, como su tarea pendiente.
No depende de nada del rediseño: es borrar líneas. Y deliberadamente **no** arrastra el borrado de
`ConteoFisico.tsx` / `NuevaVerificacion.tsx` ni la reescritura de `VerificacionesList.tsx`, que sí esperan a la
Fase 6 — la lista puede seguir viva como lectura de la única fila ya rotulada, que es exactamente lo que la
124 dejó funcionando (`SELECT` intacto, a propósito).

Es la aplicación del mismo criterio con el que la 124 se separó de la 128: **lo que es higiene independiente se
entrega solo, y no espera a la fase que lo reemplaza.**

**`vista_resumen_verificaciones` se queda, y la razón es la decisión de congelar en vez de borrar.** Se
comprobó el 2026-08-28: existe y agrega las dos tablas retiradas con un `GROUP BY`. Como las tablas siguen
ahí, **la vista no queda huérfana ni se rompe**: sigue devolviendo el resumen de la única fila, que para
entonces está rotulada como prueba en sus dos columnas de texto. Dropearla no compra nada —lo que evita que
alguien la use por descuido no es su ausencia, sino que la fila que devuelve dice «REGISTRO DE PRUEBA» en el
`motivo_rechazo`— y sí cuesta: sería un objeto menos por el que auditar cómo quedó el módulo viejo. Lo que sí
se hace es **dejarla dicha**:

```sql
COMMENT ON VIEW vista_resumen_verificaciones IS
  'RETIRADA junto con sus dos tablas base (2026-08-2x). Lectura histórica solamente. '
  'El módulo vigente es la ronda de inventario: rondas_inventario / rondas_excepciones.';
```

Es el mismo criterio que las migraciones «archivo de registro, no aplicar» (067/079/108): lo que protege al
próximo lector es el rótulo, no la desaparición.

**D-2 (Esco) se arregla en la Fase 0, antes que todo lo demás**, porque corrige una respuesta falsa que Esco
está dando **hoy**. El cambio, en los **dos** árboles (`chat.tsx:1512` y `:1510`):

```ts
// antes:  if ((d.diferencia as number) !== 0)      // null !== 0 es true ⇒ 223 falsas
// después: sólo un renglón CONTADO con diferencia real es una discrepancia (CA-17/R-3)
if (d.contado === true && d.diferencia != null && Number(d.diferencia) !== 0)
```

Cuando existan las tablas nuevas, la herramienta apunta a `rondas_excepciones`, donde el problema no puede
reproducirse: **no hay renglones sin dato**, porque sólo se escribe la excepción.

---

## 11. Saneamiento de `productos.precio_unitario` (§8.1) — dimensionado

No es folclor: **bloquea las dos líneas valorizadas del reporte de cierre** (CA-20) y nada más. El flujo entero
—A-1 a A-10, B-1 a B-7, C-2, C-3— se entrega y se usa sin él.

### 11.1 Qué está roto, exactamente

`precio_unitario` significa **$/kg-L derivado**, no precio por bulto (`calculosCompras.ts:13`), y **cada compra
lo sobrescribe** con el precio de esa compra (`NewPurchase.tsx:390-398`). O sea: es «el precio unitario de la
última compra», no un promedio ponderado ni una base de valoración.

La corrupción tenía una causa identificada: `eliminarCompraConReversion` revertía `cantidad_actual` y **no
tocaba `precio_unitario`**, así que cada compra borrada dejaba pegado el precio de la compra borrada. El caso
testigo está en el `CLAUDE.md`: Sulcamag quedó en 669,96 y **el valor anterior es irrecuperable**.

> **Esa fuga ya está cerrada en `main` (`c842333`, 2026-08-28).** Hoy el borrado de una compra restaura el
> precio de la compra que **sobrevive**, y si no queda ninguna deja **`NULL`** —«sin dato»— en vez del precio
> borrado (`PurchaseHistory.tsx:64-71` y `:148`). El comentario del código razona igual que este brief: un
> precio viejo es *«una afirmación falsa»*, y el sistema distingue «sin dato» de cero.
>
> **Lo que ese arreglo NO hace, y hay que decirlo:** es hacia adelante. **No repara el daño ya acumulado.**
> Sulcamag sigue en 669,96. La fuga está tapada; el charco sigue ahí, y lo seca la pieza 2.

### 11.2 Las cuatro piezas de trabajo — **una ya está hecha**

| # | Pieza | Tamaño | Nota |
|---|---|---|---|
| **1** | **Medir — parcialmente hecho.** Ya se sabe (2026-08-28): de 226 activos, **3 en NULL y 8 en 0**. Falta la mitad que importa: de los **193 con existencia**, en cuántos el `precio_unitario` **discrepa** de su última `compras.costo_unitario` ÷ presentación, y cuántos **no tienen ninguna fila en `compras`** | **S** *(reducida)* | El conteo de nulos resultó chico y tranquilizador, pero **no es el que decide**: Sulcamag no es NULL ni cero. Y un precio malo sobre un producto en cero no afecta la valoración. Lo que queda por correr es la consulta de **discrepancia**, acotada a los 193 |
| **2** | **Reconstruir desde `compras`.** Migración `129_…` que recalcula `precio_unitario` desde la compra más reciente vigente, con la misma derivación que `ProductForm`, guardas al estilo 099 (conteos pre y post, `RAISE EXCEPTION`) y respaldo en el esquema **`respaldos`** (081, nunca en `public`) | **M** | Los productos **sin historia de compra no se reconstruyen**: quedan como están y se **listan**. Esa lista es el residuo manual, y es un dato, no una estimación |
| **3** | ~~**Cerrar la fuga.**~~ **YA ESTÁ HECHA** — `c842333` en `main`, con test (`eliminarCompraConReversion.test.ts`) | **0** | Queda **un residuo que el arreglo destapa**, y ahora es alcanzable de verdad: `MovementsDashboard.tsx:199-201` hace `(p.precio_unitario \|\| 0)`, así que un `NULL` —que antes casi no ocurría y ahora es el resultado **correcto** de borrar la última compra— entra al KPI de valor de inventario como **cero, en silencio**. Antes el KPI sobre-reportaba con un precio viejo; ahora sub-reporta con un cero. La dirección mejoró; el silencio no. Hay que pintar «sin dato», misma familia que `lluviaConfiableDeResumen`. **S** |
| **4** | **Firmar.** Gerencia pone `inventario_parametros.valoracion_publicable = true` | trivial | Hasta entonces **CA-20 se cumple por construcción**, no por disciplina |

**Total revisado: ~S-M**, contra el ~M original — la pieza 3 salió del alcance y la 1 se achicó a la mitad. El
camino crítico de la Fase 0b es ahora **la pieza 2**, que no se movió: la reparación retroactiva sigue entera,
porque `c842333` es hacia adelante.

Dos avisos que conviene dar antes y no después, igual que se avisó la baja de $5.675.648 de la migración 119:
el **residuo de la pieza 3** (el KPI de valor de inventario puede empezar a sub-reportar en silencio en cuanto
alguien borre la última compra de un producto) y el efecto de la **pieza 2** sobre ese mismo KPI cuando 
recalcule precios. Los dos son números que Gerencia mira.

---

## 12. Estándares de prueba

| Capa | Dueño | Mínimo exigido |
|---|---|---|
| **Unitaria** — `src/utils/rondaInventario/*` | quien implementa, **escrita antes** | Cobertura de rama completa de `derivarVia`, `derivarFisico` y `resolverProducto`. Fixtures de respuesta de modelo, precedente `importHatoOcrChequeo.test.ts` |
| **Paridad** | quien implementa | (a) copias Deno idénticas al original (`--check` del generador); (b) las 7 claves del catálogo TS == la semilla SQL; (c) `derivarVia` en TS == la derivación del RPC en SQL |
| **Contrato de esquema** | QA | Que los cuatro `CHECK` de `rondas_excepciones` **rechacen** de verdad: intentar `estado='resuelta_con_captura'` sin `explicacion_david_en`, `ajuste_aplicado` sin `decision_causa`, etc. Un `CHECK` sin test es una intención |
| **Adversarial de autorización** | QA | El conjunto explícito: navegador reclamando identidad de Telegram; Telegram sin el módulo; `inventario_aprobacion` sobre un `telegram_usuarios` con `usuario_id` NULL; doble confirmación del mismo transcrito; doble aplicación del mismo ajuste; aplicación con el teórico cambiado sin `confirmar_cambio_teorico` |
| **Ventana de Deshacer** (P-1) | QA | Las **tres** condiciones de §6.5, cada una por separado: con la ronda ya `cerrada` ⇒ falla; con una sola excepción del transcrito ya explicada por David ⇒ falla **y no borra ninguna**; reenviando el `callback_data` desde otra cuenta ⇒ falla. Más el camino feliz: deshacer, corregir, re-confirmar, y verificar que `intentos_preview` **no se reinició** |
| **Integración** | QA | El ciclo completo por los tres desenlaces, verificando que `productos.cantidad_actual` cambia **exactamente** en los dos casos que debe y en ningún otro (CA-1) |
| **Componente** | QA | Que los tres desenlaces se rendericen distinto en la pantalla de historial (CA-10) y que un producto fuera del alcance salga `—` y nunca 0 (CA-16) |

El test más valioso de todo el conjunto es barato: **el ejemplo de §11.1 del brief de producto como fixture, y
su preview de §11.1 como aserción.** El dueño escribió la salida esperada; se escribe el test antes que el
código y no hay nada que negociar.

---

## 13. Plan de implementación por fases

| Fase | Entregables | Criterio de aceptación | Tamaño | Depende de |
|---|---|---|---|---|
| **0 · Higiene** — **APLICADA salvo un pendiente** | ✅ D-1 (**migración 124**, aplicada: rótulo + `COMMENT ON TABLE` + `REVOKE`) · ✅ D-2 (Esco, **dos** árboles) · ✅ D-3 (`'Gerente'` → `'Gerencia'`) · ✅ D-4 verificado intacto · ⬜ **CA-27: quitar las rutas `nueva`/`conteo/:id`/`:id` y sus TRES botones** (§10.1) | Esco reporta **0** discrepancias, no 223. **Ninguna acción visible lleva a una ruta inexistente ni a un `permission denied`** | **S** | nada |
| **0b · Precios** (paralelo) | Las piezas **1 (reducida), 2 y 4** de §11.2 — la 3 ya la cerró `c842333` en `main` — más el residuo de «sin dato» en el KPI de valor de inventario | `valoracion_publicable = true` firmado por Gerencia | **S-M** (era M) | nada. Bloquea sólo CA-20 |
| **1 · Fundaciones** | **Spike de STT (día 1)** · migración 125 · `src/utils/rondaInventario/*` · el generador de copias + `--check` · los tests con fixtures | Los tests de §12 (unitaria + paridad) en verde. El spike responde sí/no sobre OGG/Opus | **L** | 0 |
| **2 · RPC** | Migración 126 · `fn_ronda_validar_actor` + los 10 RPC (incluido el `Deshacer` de P-1) · tests adversariales de autorización · la suite de la ventana de §6.5 | El conjunto adversarial completo en verde | **M** | 1 |
| **3 · Telegram — Uriel** | Alta de Uriel · `/ronda` · `/existencias` · el `.txt` del alcance · handler de voz · bucle de preview · **botón `Deshacer` (P-1)** · conversación `cierreRonda` | Uriel abre, narra, corrige, confirma, **deshace** y cierra una ronda de punta a punta, sin ver un solo precio | **L** | 1, 2 |
| **4 · Telegram — David y Santiago** | Conversación `excepcionDavid` · callbacks de aprobación · aplicación | Los tres desenlaces alcanzables y distinguibles. CA-38 sostenida: una cita no habilita ninguna vía | **M** | 2, 3 |
| **5 · Recordatorio, alerta y reporte** | Migración 127 · endpoint del tick con sus **cuatro** trabajos · 3 filas de `alertas_catalogo` · `reporteCierre.ts` · el mensaje del día 15 con sus dos bloques (P-2) | El reporte se emite congelado; el aviso de mes omitido sale **una** vez; el bloque de excepciones vencidas sale **también en un mes con la ronda hecha** | **M** | 3, 4 |
| **6 · Historial web** | `/inventario/rondas` + `:id` · borrado de `ConteoFisico`/`NuevaVerificacion` y reescritura de `VerificacionesList` · **migración 128, ya reducida a dos sentencias** (§10) · herramienta de Esco | Los tres desenlaces se ven distintos; un producto fuera del alcance sale `—` | **M** | 1 (puede correr en paralelo a 4 y 5) · el `DROP FUNCTION` exige que **2** ya haya creado `fn_ronda_aplicar_ajuste` |
| **7 · Patrones** (`Should`) | C-4 (M-7) y C-5 | Sólo tiene sentido con **tres rondas** cerradas | **S** | 6 + tres rondas reales |

**Hitos.** Fin de 0: el módulo deja de mentir — **falta sólo el pendiente de CA-27 de §10.1**, que es lo que
hoy impide darla por cerrada. Fin de 2: el motor existe y está probado sin ninguna UI. Fin de
3: **Uriel puede hacer la ronda de verdad** — es el hito que mueve M-1, la métrica madre. Fin de 5: el ciclo se
cierra solo, sin que nadie tenga que acordarse. Fin de 6: existe historial auditable.

**Si hay que recortar**, el orden es el del brief de producto: sale C-4, después C-5. **A-2, A-3, A-9 y B-6 no
se recortan.** Y si el spike de la Fase 1 sale mal, se degrada A-8 a reporte estructurado sin tocar nada más.

---

## 14. Riesgos, por gravedad

| # | Riesgo | Mitigación | Residual |
|---|---|---|---|
| **1** | **OGG/Opus rechazado por el STT.** Sin transcripción no hay A-8 | Spike el primer día; 19 modelos STT bajo la misma llave; degradación ya escrita a reporte estructurado, con A-9 intacta. **No se transcodifica** | Bajo. El peor caso cuesta ~1 día y no toca el resto del diseño |
| **2** | **Calidad de transcripción sobre nombres comerciales.** «Silicalmag» → «Silicio» | **El diseño ya es seguro**: sin coincidencia exacta, `no_identificado` y lo elige Uriel (D-T7). Un nombre mal oído produce **fricción, jamás un dato falso**. Se mide con M-8 | Medio en fricción, **nulo en corrección** |
| **3** | **`service_role` bypassa RLS** y el bot podría escribir cualquier cosa | `fn_ronda_validar_actor` + la guarda de Gerencia por vínculo `telegram_usuarios→usuarios` + su conjunto adversarial propio | Bajo, **si los tests adversariales existen**. Sin ellos es el riesgo más alto del documento |
| **4** | **CA-38 se erosiona al implementar** — alguien «simplifica» las dos columnas en una | El `CHECK excepcion_avanza_solo_con_david`. Es la única mitigación que sobrevive a un PR descuidado | Bajo |
| **5** | **Se publican las líneas valorizadas antes del saneamiento** | `inventario_parametros.valoracion_publicable`, en `false` desde la semilla. CA-20 se cumple por construcción | Bajo |
| **6** | **Dos semánticas de «Ajuste»** conviviendo en `movimientos_inventario` (fija vs. delta) | Es el precio declarado de CA-26. Se distinguen por `observaciones` y por `aplicacion_movimiento_id` | Medio, **aceptado** |
| **7** | **Un ajuste puntual (camino b) con atribución parcial.** `movimientos_inventario` sigue sin columna de capturador — sólo `responsable text` | **Mitigado a medias desde `83e662f` (2026-08-28), fuera de este alcance:** `NuevoMovimientoModal` ahora estampa `responsable: user?.email`, con test estático que lo garantiza. **El residuo exacto**: sigue siendo texto libre, no FK (o sea, expuesto a la deriva de grafías que midió la 107), y **el bot no pasa por ese modal**, así que un movimiento nacido en Telegram no lo hereda — por eso la atribución de la ronda vive en `rondas_excepciones` (§6.3) y no ahí | Bajo-medio. Bajó de «sin mitigación» a «mitigado para la web» sin que este brief hiciera nada |
| **8** | **Una conversación activa se traga una nota de voz** | Las dos conversaciones son cortas y rechazan la voz explícitamente | Bajo |
| **9** | **La primera ronda produce un pico de excepciones** y alguien lo lee como pérdida | R-17/CA-22: `es_linea_base` se calcula y el reporte lo explica en su cabecera | Bajo |
| **10** | **El Deshacer (P-1) se implementa sin la condición de ronda `en_curso`** y una excepción desaparece con el reporte de cierre ya emitido, dejándolo nombrando N contra N−1 en la tabla | La condición está en el RPC, no en la UI, y tiene su propio test en §12. R-10 prohíbe recalcular el reporte, así que la divergencia no tendría arreglo posterior | Bajo, **si el test existe** |

---

## 15. Decisiones resueltas — **no quedan preguntas abiertas**

Las tres preguntas que este brief abrió el 2026-08-28 **están cerradas ese mismo día**. Se conservan con su
razonamiento y su respuesta para que quede trazable por qué son así, con la misma disciplina que el CPO usó en
§9 y §11 de su documento: **este brief es también el registro de cómo se llegó hasta acá.**

Las tres respuestas fueron **las tres recomendaciones, tal cual**. Ninguna cambia la arquitectura; dos agregan
superficie y una confirma una lectura que el diseño ya hacía.

### 15.1 · P-1 — ¿Uriel puede deshacer un hallazgo que ya confirmó? **RESUELTA**

- **Por qué importaba.** CA-29 dice que `Confirmar` compromete el registro, y está bien. Pero si Uriel confirma
  y tres productos después se da cuenta de que dictó mal una cantidad, el único arreglo sería que la excepción
  siga su curso y termine cerrada como `error de conteo` — o sea, **el sistema fabricaría una causa raíz falsa
  para arreglar un error de tecleo**, y esa causa contamina M-3 y C-4, que son justamente lo que justifica todo
  el ejercicio.
- **Opciones.** (a) Sin deshacer: se cierra como `error de conteo`. (b) Un botón `Deshacer` en el mensaje de
  confirmación, que borra las excepciones recién creadas **mientras David no las haya tocado** — el precedente
  exacto y ya probado de `/evento` (`hato_ev_undo`, `bot.ts:529-574`).
- **Recomendación: (b).** El mecanismo ya existe, la ventana está acotada por la primera acción de David, y (a)
  ensucia con causas falsas la señal que C-4 y M-7 tienen que leer.
- **Respuesta del dueño (2026-08-28): (b), tal cual.**
- **Dónde vive ahora**: **§6.5** (`fn_ronda_deshacer_confirmacion`, el RPC nuevo y sus tres condiciones de
  ventana) · **§7.4** (el botón y su comportamiento) · **§7.2** (el `callbackQuery`) · **§4.3** (el transcrito
  vuelve a `preview_pendiente`, `intentos_preview` no se reinicia) · **§4.6** (la única excepción a
  «DELETE sin política») · **§12** (su suite de pruebas) · **§13** Fase 3 · **§14** riesgo 10.
- **Lo que abrió, y ya está cerrado.** La ventana necesitaba una condición que la pregunta no anticipaba:
  **la ronda tiene que seguir `en_curso`**. CA-5 permite cerrar con excepciones abiertas y CA-19 emite el
  reporte al cerrar, así que borrar una excepción con el reporte ya emitido dejaría el reporte congelado
  nombrando N y la tabla con N−1 — y R-10 prohíbe recalcularlo, o sea que no tendría arreglo posterior.
  Y obligó a una precisión en el cierre: `fn_ronda_cerrar` normaliza a `sin_confirmar` todo lo que quede en
  `preview_pendiente`, para que CA-37 tenga **un solo** predicado que contar.

### 15.2 · P-2 — Una excepción abierta hace más de 30 días, ¿molesta a alguien? **RESUELTA**

- **Por qué importaba.** CA-5 es clara: una excepción abierta no bloquea el cierre ni el recordatorio del mes
  siguiente. Pero M-4 fija «ninguna abierta > 30 días» y dice *«una excepción eterna es peor que no haberla
  reportado»*. Eso implica que **alguien tiene que enterarse**, y el documento de producto no decía quién ni
  cómo.
- **Opciones.** (a) Sólo métrica, visible en C-5, sin mensaje. (b) El tick del día 15 agrega una línea a la
  alerta de Santiago: «hay N excepciones abiertas hace más de 30 días».
- **Recomendación: (b).** Cuesta una línea en un mensaje que ya se manda, y sin ella M-4 mide algo que nadie ve
  — que es el mismo defecto que R-11 existe para arreglar.
- **Respuesta del dueño (2026-08-28): (b), tal cual.**
- **Dónde vive ahora**: **§8.1** (es un **cuarto trabajo** del tick, con clave idempotente propia) ·
  **§8.4** (el contenido del mensaje del día 15, con sus dos bloques) · **§3.4** (la clave de catálogo pasa a
  `inventario.revision_dia_15`) · **§13** Fase 5.
- **La decisión de diseño que obligó a tomar.** El bloque **no** puede colgar del de mes omitido: si colgara,
  sería silencioso justo en los meses en que la ronda **sí** se hizo y quedó deuda abierta, que son los que
  M-4 mide. Es un trabajo con su propia condición, que se compone en el mismo mensaje. Y la cadencia es
  mensual, no diaria — el seguimiento continuo ya tiene dueño en C-5, que es la pantalla, no la notificación.

### 15.3 · P-3 — Un producto que entra a existencia > 0 **durante** una ronda abierta **RESUELTA**

- **Por qué importaba.** El alcance se congela al abrir (CA-4/R-5). Si el día 3 llega una compra de un producto
  que el día 1 estaba en cero, ese producto no está en la foto: no es «conforme» ni es «no verificado» — no
  existía como existencia cuando se declaró el alcance. Sin una respuesta, cada implementador iba a elegir una
  distinta y en silencio.
- **Opciones.** (a) Queda fuera del alcance y el reporte lo nombra en la sección de «movimientos con la ronda
  abierta» (R-9), sin concepto nuevo. (b) Entra automáticamente al alcance.
- **Recomendación: (a).** Mi lectura es que **R-5 y R-9 ya la contestan** — (b) mutaría una foto que la regla
  declara congelada — pero preferí preguntarlo a dejar la contradicción implícita.
- **Respuesta del dueño (2026-08-28): (a), tal cual.**
- **Dónde vive ahora**: **§4.1** (`fn_ronda_abrir` es el único escritor del alcance y nada lo amplía después) ·
  **§8.3 punto 4** (aterriza en «movimientos ocurridos con la ronda abierta»).
- **Lo que explícitamente NO se crea**: ni un «alcance ampliado», ni un tercer estado entre conforme y no
  verificado. El hallazgo se ve como lo que es —un movimiento con la ronda abierta— y R-9 ya tenía el sitio.

### Consecuencia, no pregunta: Uriel no va a poder usar a Esco

Por §3.3: darle el módulo `consultas` le daría acceso a herramientas que devuelven precios y valoraciones, y
rompería R-15/CA-13 el primer día. La decisión está tomada (no se lo damos). **Si en algún momento se quiere
que Uriel pueda preguntarle cosas a Esco, no alcanza con darle el módulo**: hace falta redacción de precios por
usuario dentro de Esco, que es un trabajo mayor, de otra naturaleza, y con sus propios riesgos. Queda dicho
para que nadie lo descubra el día que Uriel pregunte por qué el bot no le contesta.

---

*Fuente: `docs/plan_verificacion_inventario.md` (brief de producto del CPO, cerrado 2026-08-28), las tres
decisiones del dueño del 2026-08-28 recogidas en §15, el código citado en §1.1 con archivo y línea, las
migraciones 026/060/070/072/073/077/081/082/084/093/096/099/102/104/105/106/107/113/119/120/121/122/123/124, las
consultas a la API y a la documentación de OpenRouter del 2026-08-28, y la verificación contra el catálogo vivo
del 2026-08-28 (§1.2). La revisión 2 sincroniza con `f98f83a..49d2206` de `main` — commits `c842333`
(`precio_unitario` en la reversión de compra), `83e662f` (`responsable` en el ajuste manual) y la migración
123.*

***No queda ninguna pregunta abierta ni ninguna decisión pendiente: lo que sigue es implementación.***
*La **Fase 0 ya se aplicó** (salvo el pendiente de CA-27 de §10.1) y las Fases 1-6 están en ejecución. Las
cinco migraciones propuestas son **125–129**: el `123` lo tomó `123_select_contratistas_por_rol.sql` y el
`124`, `124_rotular_verificacion_prueba.sql` — el rótulo D-1, que terminó siendo su propio archivo en vez de ir
embebido en la de retiro de legado, como este documento preveía.*

> **Dos renumeraciones en cuatro días, y las dos por la misma causa: el número se hereda de un documento en vez
> de mirarse.** El `123` se ocupó mientras el brief se cerraba; el `124`, mientras se implementaba su propia
> Fase 0. **Ningún número escrito acá es autoritativo en el momento en que alguien crea el fichero.** El
> `CLAUDE.md` ya advierte que el ledger y el repo no son superconjunto uno del otro; a eso hay que sumarle que
> **el trabajo en paralelo consume huecos**. La regla operativa, para el equipo que sigue: `ls src/sql/migrations/`
> y una consulta al ledger **inmediatamente antes** de nombrar el archivo, nunca al planificarlo.

***Ninguna decisión de producto de §3.4, §5.1, §5.2, §5.3, §8.1, §9 o §11 del brief de producto se reabre en
este documento.** Donde una resulta cara, el costo está escrito como costo — §14 riesgos 6 y 7.*
