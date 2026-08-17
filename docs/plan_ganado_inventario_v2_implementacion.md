# Plan de implementación — Ganado v2: lote, etapa, reorganización de fincas y movimientos legibles

**Autor:** CTO · **Fecha:** 2026-08-17 · **Estado:** diseño técnico aprobado, listo para ejecutar
**Brief de producto:** [`docs/plan_ganado_inventario_v2.md`](./plan_ganado_inventario_v2.md) (CPO)
**Rutas afectadas:** `/ganado`, `/ganado/movimientos`, `/configuracion` (pestaña Ganado), `/finanzas/dashboard` (franja de inventario), Esco (`get_ganado_inventory`)

> **Relación con el brief del CPO.** El brief se escribió **antes** de que el dueño redefiniera la
> estructura de fincas. Sus §3 (alcance) y §7 (modelado) quedan **superados por este documento** en
> todo lo que contradigan. Todo lo demás del brief —historias A-1…C-2, reglas R-1…R-12, métricas—
> **sigue vigente y es el contrato funcional**. Cuando aquí digo "R-6" me refiero a la tabla §6 del
> brief.
>
> Cambios concretos respecto al brief:
> - Su **Fase 0** (escalada al dueño por Maryland/Mochuelos, fincas basura, etapa) **ya está
>   resuelta**: las decisiones están cerradas y transcritas en §1 de este documento. Lo único que
>   queda de Fase 0 es un trabajo mecánico: producir y revisar el mapeo de los 34 potreros
>   (Apéndice A).
> - Su **§7** preguntaba "etapa como atributo del potrero vs fila de inventario". Decidido:
>   **atributo del potrero** (§3.2). Y se agrega un nivel que el brief no contemplaba: **lote**.
> - Su **C-1** ("Maryland y Mochuelos: reactivar o registrar salida") se resuelve por una **tercera
>   vía que no existía cuando se escribió**: los potreros se re-parentan a fincas activas, así que
>   las 41 cabezas no se reactivan ni salen — **no se mueven**. Ver §5.3.

---

## 0. Resumen ejecutivo

| | |
|---|---|
| **Migraciones** | `098` (aditiva), `099` (reorganización de datos), `100` (agrupación de traslados históricos) |
| **Tablas nuevas** | `gan_lotes` (1) |
| **Columnas nuevas** | `gan_potreros.lote_id`, `gan_potreros.etapa`, `gan_movimientos.grupo_id` (3) |
| **Archivos TS tocados** | 14 en `src/`, 4 en los dos árboles de edge functions |
| **Fases** | 6 (F0 mapeo → F1 esquema → F2 lógica pura → F3 hook → F4 pantallas ∥ F5 fuera del módulo → F6 cierre) |
| **Bloqueante duro** | Apéndice A (mapeo de 34 potreros) bloquea `099`, que bloquea las dos pantallas |
| **Punto de partida** | Migración **`097_ganado_reparto_multiple_potreros.sql` ya aplicada a producción** (PR #124, 2026-08-17) — ver §1-bis |

**Las seis decisiones técnicas de este plan**, con su justificación resumida:

1. **`lote` es una tabla (`gan_lotes`), no una columna de texto** — porque 24 nombres tecleados a
   mano se divergen, y este repo ya pagó esa factura con `'Beneficos '` (migración 075).
2. **`etapa` es `TEXT + CHECK` nullable en `gan_potreros`**, no ENUM ni tabla catálogo — es el patrón
   del proyecto (053) y NULL significa "sin clasificar", nunca un centinela.
3. **El agrupamiento de traslados es un `grupo_id uuid` compartido que estampa el RPC**, no la app:
   desde la 097 el cliente ya no construye las filas del traslado. **La 098** hace `CREATE OR REPLACE`
   de **una sola** RPC de la 097 (`fn_ganado_registrar_traslado_multi`) para que lo genere adentro —
   en la misma migración que crea la columna, para que no exista ni un día de ventana en que la
   columna esté y nadie la llene. El mismo mecanismo agrupa el ajuste masivo como "conteo físico" —
   ese sí desde el cliente, que ahí sigue construyendo las filas.
4. **Una compra/venta repartida NO usa `grupo_id`: se agrupa por `transaccion_ganado_id`**, la clave
   que ya existe, es una FK y sobre la que la 097 construyó su invariante anti-sobre-conteo. Una
   segunda clave redundante para lo mismo es una clave que se puede desincronizar.
5. **La historia se agrupa por dos reglas deterministas distintas, una por cada código que escribió
   las filas** — secuencia de `created_at` para lo anterior a la 097, `created_at` idéntico (= misma
   transacción de base) para lo posterior. Si la evidencia no es limpia, la migración **aborta y no
   agrupa nada**: filas sueltas es el estado de hoy, no una regresión.
6. **El "Último peso" se lee de `gan_pesos_historico`, no de `gan_inventario.peso_promedio_kg`** —
   sale gratis la fecha que pide A-4, y no hay que renombrar una columna que leen dos edge functions
   desplegadas.

---

## 1. Restricciones cerradas por el dueño (2026-08-17)

No son opciones. Cualquier implementador que crea que una de estas está mal, escala; no la cambia.

1. **Jerarquía: ubicación → finca → LOTE → potrero.** El lote existe hoy solo en los nombres de los
   potreros, con el patrón `<Lote> <Etapa>`.
2. **Etapa productiva** (`terneros` | `levante` | `ceba` | `repele` | sin clasificar) como dato real,
   sumable por lote y por finca. Es **atributo del potrero**. Consecuencia aceptada: **la etapa no
   tiene historia** (R-3).
3. **Reorganización de fincas: 9 → 4 (3 activas + Macondo inactiva).**
   - `Escocia` (ubicación San Francisco) absorbe los potreros de `Maryland` (1) y `Mochuelos` (2)
     → **20 potreros, 238 cabezas**. Maryland y Mochuelos pasan a ser **lotes** de Escocia.
   - `Supatá` — **finca nueva** en la ubicación Supata — recibe los potreros de `Carrizal` (5) y
     `Andalucia` (3) → **8 potreros, 64 cabezas**. Lotes: La Joya, Andalucía, **Carrizal**.
   - `santimp` (ubicación Supata) queda igual, **con ese nombre**. No renombrar.
   - `Macondo` queda como finca inactiva sin ganado.
   - `Escocia (lote)` y `aumento emilio` se **borran físicamente** (0 potreros, 0 movimientos).
   - Maryland, Mochuelos, Carrizal y Andalucía quedan sin potreros y se **desactivan**.
4. **El nivel `ubicación` se conserva**, aunque quede una finca "Supatá" dentro de una ubicación
   "Supata".
5. **Mapeo lote/etapa de los 34 potreros**: se deriva del nombre. Excepciones confirmadas:
   `Peña Blanca` y `Peña Blanca Repele` pertenecen al lote **Carrizal**, y `Peña Blanca` (sin
   sufijo) tiene etapa **ceba**. Quedan **sin etapa** 4 potreros con **56 cabezas**: Bosque 19,
   Quebradas 13, Colinas 12, Los Olivos 12. Los 4 potreros `General` están en 0 y se **desactivan**.
6. **Página Movimientos** muestra: traslado como UNA fila `Origen → Destino · N cabezas`; valor $ de
   compras/ventas desde `fin_transacciones_ganado` (**columna oculta por rol**, jamás en blanco);
   kilos y peso del evento; saldo del potrero después del evento; y el **ajuste masivo agrupado**
   como un evento "conteo físico" desplegable.
7. **Hectáreas solo por finca** (3 números). En potrero se muestra "—", nunca 0.
8. **Captura: solo Santiago hoy, David eventualmente.** Sin Telegram, sin diseño mobile-first en este
   alcance. Escritorio (el layout sigue siendo responsive porque el resto de la app lo es, pero no
   hay flujo de captura de campo).
9. En la UI el nivel más bajo se llama **"Potrero"**. Ahora existe además un nivel llamado **"Lote"**
   encima de él.

**Estado de producción verificado el 2026-08-17** (línea base de todas las guardas):
369 cabezas · 3 ubicaciones · 9 fincas · 34 potreros · 53 movimientos · 0 pendientes ·
94 transacciones en `fin_transacciones_ganado` · **todas las fincas con `hectareas = 0.00`**.
Por finca: Escocia 216 (17 potreros), santimp 67 (6), Carrizal 45 (5), Mochuelos 23 (2),
Andalucia 19 (3), Maryland 18 (1).
Movimientos: 24 ajustes, 11 `traslado_salida` + 11 `traslado_entrada` (todos el 2026-07-02),
1 compra confirmada (2026-08-06, 19 cabezas a Bosque, $49.461.500), 1 compra que estaba pendiente y se confirmó el 17-ago repartida en 2 potreros
(2026-07-17, 24 cabezas, $101.500.000), 1 venta descartada.

---

## 1-bis. La migración 097 ya cambió el terreno (PR #124, 2026-08-17)

Mientras se escribía este plan, otra sesión mergeó **«Ganado: repartir compras, ventas y traslados
entre varios potreros»** y **`097_ganado_reparto_multiple_potreros.sql` ya está aplicada a
producción** (verificado: las 3 funciones en `pg_proc`, el índice
`gan_movimientos_transaccion_confirmado_unique` eliminado, el trigger de validación instalado). Este
plan se re-basó encima. Lo que hay que saber para no diseñar contra un repo que ya no existe:

| Qué cambió la 097 | Consecuencia para este plan |
|---|---|
| **Se eliminó `gan_movimientos_transaccion_confirmado_unique`** (044) | Una transacción de finanzas ahora tiene **N movimientos confirmados**, no uno. Es lo que hace posible el reparto — y lo que crea un **tercer tipo de agrupación** que el diseño original no contemplaba (§3.3) |
| **Trigger `fn_gan_validar_cabezas_transaccion`** (`SECURITY DEFINER`, `search_path` pineado): Σ cabezas confirmadas ≤ `cantidad_cabezas` de la transacción | Invariante más fuerte que el índice viejo. **No se toca.** Y es la razón por la que `transaccion_ganado_id` —y no `grupo_id`— es la clave de agrupación de una compra/venta repartida |
| **RPC `fn_ganado_confirmar_pendiente_multi(uuid, jsonb)`** (`SECURITY INVOKER`) | `confirmarPendiente` ya no hace un `UPDATE`: llama al RPC con `p_filas` |
| **RPC `fn_ganado_registrar_traslado_multi(date, jsonb, jsonb, numeric, text)`** (`SECURITY INVOKER`) | **El cliente ya no construye las filas del traslado.** `construirMovimientosTraslado` **fue eliminada** de `calculosGanado.ts`, con un comentario explícito de que la construcción vive solo en el RPC "para no tener dos implementaciones del mismo reparto". Por eso el `grupo_id` tiene que salir de ahí adentro |
| **El traslado es N→M**, no 1→1 | §3.3 y el cálculo del saldo se rediseñan (una fila colapsada de traslado N→M no puede mostrar "dos saldos") |
| Nuevo componente `RepartoPotreros.tsx` (176 líneas) | Se reutiliza tal cual; solo gana los `<optgroup>` por lote (§6.6) |
| `calculosGanado.ts` 257 → 325 líneas; `useGanadoInventario.ts` +51 | §6.2 y §6.3 reescritas contra el código nuevo |

**Los números de §1 se re-basaron al estado post-#124**: **369 cabezas** (no 388), Escocia **238**
post-reorganización (no 257), **56** cabezas sin etapa (no 75), Bosque **19** (no 38),
**53 movimientos**, **0 pendientes**.

**Por qué cambiaron** — y esto es la validación empírica de que el puente Finanzas→Inventario
funciona: el 17-ago a las 10:20 y 10:24 (Bogotá) se confirmó desde la app, con las RPC nuevas, la
compra pendiente de 24 cabezas repartida en **13 → Quebradas (Escocia) + 11 → Mochuelos Repele
(Mochuelos)**, y después se revirtió con tres ajustes el doble conteo del conteo de Emiliano
(−19 Bosque, −13 Quebradas, −11 Mochuelos Repele). Integridad verificada: el snapshot de los 34
potreros cuadra exactamente con la suma de sus movimientos confirmados.

**La anomalía de Bosque ya está resuelta en los datos.** Su traza histórica completa
(0 → 19 → 38 → 19) sigue en el log y sigue siendo el mejor fixture que tenemos para la columna de
saldo: es una secuencia real con una compra, un doble conteo y su corrección.

---

## 2. Estado actual del código (auditado, no supuesto)

| Archivo | Líneas | Rol |
|---|---|---|
Post-#124. Cada línea leída, no heredada del plan anterior.

| Archivo | Líneas | Rol |
|---|---|---|
| `src/components/ganado/GanadoDashboard.tsx` | 279 | Página Inventario: tabla plana de 34 filas + 4 KPIs + 3 filtros — **#124 no la tocó** |
| `src/components/ganado/GanadoMovimientos.tsx` | 264 | Página Movimientos: log plano + banner de pendientes. #124 le agregó `fetchInventario` para pasar `existencias` a los diálogos |
| `src/components/ganado/GanadoSubNav.tsx` | 59 | Navegación entre las dos páginas — **no se toca** |
| `src/components/ganado/components/RepartoPotreros.tsx` | **176 (nuevo, #124)** | Lista editable «potrero + novillos + toros», con existencias por potrero y exclusión mutua de potreros. **Se reutiliza** |
| `src/components/ganado/components/AjusteMasivoDialog.tsx` | 178 | Grilla editable de conteos — **#124 no lo tocó** |
| `src/components/ganado/components/ConfirmarPendienteDialog.tsx` | **~200 (reescrito por #124)** | Confirmación repartida: `RepartoPotreros` + `validarRepartoConfirmacion` + `validarExistencias` |
| `src/components/ganado/components/InventarioInicialDialog.tsx` | 205 | Carga inicial por finca — **#124 no lo tocó** |
| `src/components/ganado/components/MovimientoFormDialog.tsx` | **~330 (reescrito por #124)** | Muerte / traslado N→M / ajuste; dos `RepartoPotreros` con totales en vivo |
| `src/components/ganado/hooks/useGanadoInventario.ts` | 292 | **Todo** el acceso a Supabase. `registrarTraslado` y `confirmarPendiente` ahora son `.rpc()` |
| `src/utils/calculosGanado.ts` | 325 | Lógica pura. **`construirMovimientosTraslado` y `validarSplitConfirmacion` ya no existen**; en su lugar hay 8 funciones de reparto |
| `src/types/ganado.ts` | 100 | Tipos del dominio — **#124 no lo tocó** |
| `src/components/configuracion/GanadoConfig.tsx` | 300 | CRUD ubicaciones/fincas/potreros — **#124 no lo tocó** |
| `src/__tests__/calculosGanado.test.ts` | 297 | 11 `describe`, 26 `it`. Cubre reparto, existencias y traslado N→M |

**Consumidores fuera de `src/components/ganado/`** (verificado con grep sobre `gan_ubicaciones|gan_fincas|gan_potreros|gan_inventario|gan_movimientos|gan_pesos_historico`, no supuesto):

| Archivo | Qué usa | Impacto |
|---|---|---|
| `src/components/finanzas/dashboard/components/InventarioGanadoKPIs.tsx` | `useGanadoInventario` + `calcularKPIsInventario` | Compila igual; hereda la corrección de `finca.activa` |
| `src/components/finanzas/components/TransaccionGanadoForm.tsx` | `gan_fincas` (dropdown + **inserta fincas nuevas**) | **Cambia de 6 a 3 opciones** e introduce un bug latente — ver §7.3 |
| `src/supabase/functions/server/ganado-inventario.ts` | agregación pura de Esco | Cambia (etapa, lote, traslados) |
| `supabase/functions/make-server-1ccce916/ganado-inventario.ts` | **copia byte-idéntica** (verificado con `diff`) | Debe cambiar en el mismo commit |
| `src/supabase/functions/server/chat.tsx` + su copia | `execGanadoInventory`, 6 queries `gan_*` | Cambian los `select=` y la descripción del tool |
| `src/__tests__/ganadoInventarioEsco.test.ts` | prueba la agregación + presencia del tool en ambos árboles | Se extiende |
| `src/components/hato/hooks/useHatoAnimales.ts` | solo un **comentario** que menciona `gan_inventario` | Ninguno |
| `src/__tests__/hatoSchemaContract.test.ts` | solo menciona `gan_*` en texto | Ninguno |
| `src/types/database.ts` | **no contiene las tablas `gan_*`** (verificado) | Ninguno — no hay que regenerar |

**Bugs confirmados que este plan repara** (todos verificados leyendo el código, no reportados de oídas):

Re-verificados **contra el código post-#124**, uno por uno.

| # | Bug | Estado | Ubicación | Efecto hoy |
|---|---|---|---|---|
| B-α | **Nada enlaza las filas de un traslado** | **VIGENTE, y agravado** | la 097 no agregó ninguna columna de agrupación (verificado en el archivo y en `information_schema`) | Antes eran 2 filas por traslado; ahora un traslado puede ser N+M filas sueltas |
| B-β | INSERT no atómicos en el traslado | **RESUELTO por #124** | `useGanadoInventario.ts:171-180` → `.rpc('fn_ganado_registrar_traslado_multi')` | Ya no hay salida fantasma: el RPC es una transacción y las salidas van antes que las entradas |
| B-γ | `calcularVariacion` cuenta traslados | **VIGENTE** | `calculosGanado.ts:73-86` (sin cambios en #124) | El KPI de 30 días infla entradas y salidas que nunca cruzaron una portera |
| B-δ | `fetchInventario` filtra `potrero.activo` pero no `finca.activa` | **VIGENTE** | `useGanadoInventario.ts:53` | Las cabezas de fincas inactivas siguen sumando al total. **Y ahora también contaminan las `existencias`** que #124 pasa a los diálogos de reparto |
| B-ε | `peso_promedio_kg` de `gan_inventario` no es un promedio | **VIGENTE** | migración 045 línea 35 (`COALESCE`) | Columna "Peso Prom." engañosa |
| B-ζ | `.limit(500)` en `fetchMovimientos` | **VIGENTE** | `useGanadoInventario.ts:100` | Techo silencioso; imposibilita un saldo correcto |
| B-η | `TransaccionGanadoForm` inserta fincas nuevas sin contemplar una homónima inactiva | **VIGENTE** — #124 no tocó el archivo | `TransaccionGanadoForm.tsx:191-197` | Tras la reorganización, teclear "Carrizal" viola `gan_fincas_nombre_unique` |

**Sobre la anomalía de Bosque:** ya está resuelta en los datos (§1-bis). Su traza histórica completa
—compra de 19 el 6-ago, doble conteo a 38 el 15-ago, corrección a 19 el 17-ago— **se conserva en el
log y es el fixture de referencia de la columna de saldo** (PU-14, VM-6). No se toca el log.

---

## 3. Diseño de esquema

### 3.1 `lote` — tabla, no columna de texto

**Opciones evaluadas:**

| | (a) `gan_potreros.lote text` | (b) tabla `gan_lotes` + FK | (c) derivar del nombre en lectura |
|---|---|---|---|
| Costo de implementación | 1 `ALTER` | 1 tabla + 1 FK + 1 sección de CRUD | 0 DDL |
| Renombrar un lote | N `UPDATE` (uno por potrero) | 1 `UPDATE` | imposible sin renombrar potreros |
| Clave de agregación | string tecleado | uuid | string derivado |
| Riesgo de partir un lote en dos | **alto** — `"Sierra Morena"` vs `"sierra morena"` vs `"Sierra Morena "` | nulo (FK) | alto — cualquier renombre de potrero reasigna el lote en silencio |
| Expresa "Peña Blanca ∈ Carrizal" | sí | sí | **no** (el nombre no lo dice) |
| Dropdown de lotes existentes | `SELECT DISTINCT` sobre texto libre | `SELECT` sobre el catálogo | — |

**Decisión: (b).** El argumento decisivo no es teórico, es un precedente de este repo: la migración
**075** existió porque `'Beneficos '` con un espacio final partió una serie de monitoreo en dos, el
mapa de calor renderizó dos filas y la tendencia se rompió en el límite donde cambió la captura.
Costó una migración de limpieza y un `UNIQUE (btrim(nombre))`. Aquí el escenario es idéntico: 24
nombres, tecleados en Configuración, usados como **clave de agregación de una fila de resumen que el
dueño va a mirar todos los días**. Un lote partido en dos se ve exactamente como dos lotes chicos —
no hay error, hay una respuesta equivocada.

**(c) queda descartada de raíz**: el propio dueño confirmó que `Peña Blanca` pertenece a Carrizal, y
eso no está en el nombre. El nombre es el **origen** del dato, no el dato.

Volumen: 24 lotes / 34 potreros. Una tabla de 24 filas con un CRUD de ~80 líneas es barata; el costo
recurrente real es una sección más en `GanadoConfig` y un join más en `fetchInventario`. Se acepta.

```sql
CREATE TABLE gan_lotes (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  finca_id   uuid NOT NULL REFERENCES gan_fincas(id),
  nombre     text NOT NULL CHECK (btrim(nombre) <> ''),
  activo     boolean NOT NULL DEFAULT true,
  created_at timestamptz DEFAULT now(),
  CONSTRAINT gan_lotes_id_finca_unique UNIQUE (id, finca_id)   -- destino del FK compuesto
);
CREATE UNIQUE INDEX gan_lotes_finca_nombre_unique
  ON gan_lotes (finca_id, lower(btrim(nombre)));
```

El índice único combina las dos lecciones del repo: `lower()` (como `gan_fincas_nombre_unique` de la
044) y `btrim()` (como el que agregó la 075). **Los dos, no uno.**

**El lote pertenece a una finca, y un potrero no puede colgar de un lote de otra finca.** Eso es una
restricción entre filas, así que no es un `CHECK` — es una **FK compuesta**, que Postgres verifica
sin triggers:

```sql
ALTER TABLE gan_potreros
  ADD COLUMN lote_id uuid,
  ADD CONSTRAINT gan_potreros_lote_misma_finca
    FOREIGN KEY (lote_id, finca_id) REFERENCES gan_lotes (id, finca_id);
```

Con `MATCH SIMPLE` (el default), si `lote_id` es NULL la restricción no se evalúa — que es
exactamente lo que queremos para un potrero sin lote. Y mover un potrero de finca obliga a corregir
su lote en el mismo `UPDATE`, que es correcto: un potrero no se lleva su lote a otra finca.

> **Alternativa considerada y rechazada:** un trigger `BEFORE INSERT OR UPDATE` que valide la
> coincidencia de finca. Hace lo mismo, pero agrega una función más al inventario de
> `SECURITY DEFINER`/`search_path` que la 082 acaba de ordenar, y falla en `UPDATE` masivos con un
> mensaje peor. La FK compuesta es declarativa y el planner la conoce.

### 3.2 `etapa` — `TEXT + CHECK`, nullable, en `gan_potreros`

**Qué patrón usa el resto del proyecto** (verificado antes de elegir): el único `ENUM` de Postgres en
la base es `rol_usuario`, que viene del esquema original generado por Figma. **Todo lo demás usa
`TEXT + CHECK`**: `hato_animales.etapa` (053: `CHECK (etapa IN ('ternera','novilla','vaca','toro'))`),
`hato_eventos.tipo`, `gan_movimientos.tipo` y `gan_movimientos.estado` (044),
`fin_transacciones_ganado.tipo` (023), `clima_resumen_diario.lluvia_confianza` (068).

| | ENUM | `TEXT + CHECK` | Tabla catálogo `gan_etapas` |
|---|---|---|---|
| Agregar un valor | `ALTER TYPE ADD VALUE` — no revertible, y con restricciones transaccionales | un `ALTER … DROP/ADD CONSTRAINT` en una migración | un `INSERT` |
| Quitar un valor | imposible | trivial | trivial (o `activo=false`) |
| Atributos por valor | no | no | sí — pero **no hay ninguno** que guardar |
| Coherencia con el repo | rompe el patrón | **es el patrón** | rompe el patrón |
| Orden de presentación | lo da el ENUM | vive en TS | columna `orden` |

**Decisión: `TEXT + CHECK`, nullable.** Los 4 valores son un dominio cerrado fijado por el dueño y no
tienen ningún atributo propio que justifique una tabla. El orden de presentación
(`terneros → levante → ceba → repele`) vive en TS como `ORDEN_ETAPAS`, junto a las etiquetas de UI:
es una decisión de presentación, no de datos.

```sql
ALTER TABLE gan_potreros
  ADD COLUMN etapa text CHECK (etapa IN ('terneros','levante','ceba','repele'));
```

**NULL = sin clasificar. Nunca un centinela `'sin_clasificar'`, nunca un `DEFAULT`.** Es la misma
regla que la migración 062 tomó para `hato_chequeo_vacas.estado` ("NULL = celda vacía, jamás
'apta' por omisión") y la misma familia de reglas que "sin dato se muestra en blanco, nunca 0"
(R-1). El bucket **"Sin clasificar"** existe solo en la capa de presentación:

```ts
type EtapaProductiva = 'terneros' | 'levante' | 'ceba' | 'repele';
type EtapaBucket = EtapaProductiva | 'sin_clasificar';   // solo UI — nunca se persiste
```

**Por qué la etapa va en el potrero y no en el lote:** los datos lo dictan. El lote `Carrizal` tiene
`Peña Blanca` (ceba) y `Peña Blanca Repele` (repele); el lote `Mochuelos` tiene `Mochuelos Ceba` y
`Mochuelos Repele`. Un lote abarca varias etapas. La etapa es propiedad del **potrero**.

### 3.3 Agrupación de movimientos — cómo se garantiza R-2 con traslados N→M

**El problema, post-097.** La 097 generalizó el traslado a **N potreros origen → M destinos** y la
compra/venta a **N potreros**, pero **no agregó ninguna columna de agrupación** (verificado en el
archivo de la migración y en el catálogo). Así que un solo hecho —«el 17-ago llegaron 24 cabezas,
13 a Quebradas y 11 a Mochuelos Repele»— son hoy N filas indistinguibles de N eventos separados. El
problema que este plan venía a resolver no desapareció con #124: **se agravó**, porque antes el
máximo eran 2 filas y ahora no hay techo.

#### Dos claves, no una

Hay **tres** cosas que agrupar, y una de ellas ya tiene clave:

| Hecho | Filas | Clave de agrupación | ¿Columna nueva? |
|---|---|---|---|
| Traslado N→M | N `traslado_salida` + M `traslado_entrada` | **`grupo_id`** | sí |
| Conteo físico / carga inicial | N `ajuste` | **`grupo_id`** | sí |
| Compra o venta repartida | N `compra` (o N `venta`) | **`transaccion_ganado_id`** | **no — ya existe** |

**Decisión: la compra/venta repartida NO lleva `grupo_id`.** Su clave ya existe, es una FK real, y la
097 construyó su invariante anti-sobre-conteo (`fn_gan_validar_cabezas_transaccion`) agrupando
justamente por ella. Estampar además un `grupo_id` sería una **segunda clave para el mismo hecho**,
que puede desincronizarse de la primera — el mismo argumento por el que más abajo se rechaza
`grupo_tipo`. Y `transaccion_ganado_id` nunca es NULL para una compra/venta: esas filas solo nacen
del trigger de finanzas (`MovimientoFormDialog` únicamente ofrece muerte / traslado / ajuste).

> Caso borde declarado: la FK de 044 es `ON DELETE SET NULL`. Si se borra la transacción de finanzas,
> las N filas quedan huérfanas y sin clave — y se muestran sueltas. Es la degradación correcta.

#### La columna `grupo_id`

| | (a) `grupo_id uuid` compartido | (b) auto-FK `par_id` | (c) tabla cabecera `gan_traslados` | (d) heurística en lectura |
|---|---|---|---|---|
| DDL | 1 columna | 1 columna + FK | 1 tabla + 2 FK | 0 |
| Soporta N→M | **sí** | no (es binaria por diseño) | sí | no |
| Escritura | el RPC ya está en una transacción: 1 `uuid` en un `DECLARE` | round-trips extra | 1 fila más + FK | — |
| Sirve también para el conteo físico | **sí** | no | no | no |
| Riesgo de inventar un traslado | nulo | nulo | nulo | **alto** |

**Decisión: (a), `gan_movimientos.grupo_id uuid`.** La opción (b) queda descartada de plano por la
097: un `par_id` no puede expresar 3 orígenes y 2 destinos.

```sql
ALTER TABLE gan_movimientos ADD COLUMN grupo_id uuid;
CREATE INDEX idx_gan_movimientos_grupo ON gan_movimientos(grupo_id) WHERE grupo_id IS NOT NULL;
```

**Por qué una sola columna y no `grupo_id` + `grupo_tipo`:** la naturaleza del grupo se deriva sin
ambigüedad de los `tipo` de sus miembros. Una columna que solo repite lo que ya se puede leer es una
columna que se puede desincronizar.

#### Quién lo estampa

**Ya no puede ser el cliente para el traslado.** `construirMovimientosTraslado` fue eliminada por
#124 y `calculosGanado.ts:219-222` deja escrito por qué: *"Las filas del traslado se envían tal cual
al RPC … La construcción vive solo en el RPC para no tener dos implementaciones del mismo reparto."*
Respetar esa decisión es lo correcto — así que el `grupo_id` sale de adentro del RPC.

| Escritor | Quién genera el `grupo_id` |
|---|---|
| `fn_ganado_registrar_traslado_multi` | **el RPC**, con un `gen_random_uuid()` en un `DECLARE`. `CREATE OR REPLACE` en la **098** (§5.1) |
| `ajusteMasivo` (`construirAjustesMasivos`) | **el cliente** — ahí sigue construyendo las filas e insertándolas directo |
| `cargarInventarioInicial` | **el cliente**, ídem |
| `fn_ganado_confirmar_pendiente_multi` | **nadie, y no se toca** — una compra/venta repartida agrupa por `transaccion_ganado_id` |

**La 098 y no la 099.** La columna y su escritor aterrizan juntos. Si el `CREATE OR REPLACE` fuera a
la 099, entre una migración y la otra habría una ventana en la que `grupo_id` existe y **nadie lo
llena**: todo traslado registrado en esos días nacería sin agrupar y engrosaría la población P2 de
§5.4, que es la más cara de resolver después. Poniéndolo en la 098 esa ventana es **cero**. Además la
099 mueve datos y puede necesitar revertirse; revertirla no tiene por qué desarmar el agrupamiento de
traslados, que no tiene nada que ver con la reorganización de fincas.

**Solo una de las dos RPC se reemplaza.** Es la consecuencia directa de la decisión de dos claves:
`fn_ganado_confirmar_pendiente_multi` no necesita `grupo_id` porque sus filas ya comparten
`transaccion_ganado_id`. Menos superficie tocada de una migración que ya está en producción.

**Se genera dentro del RPC y no se recibe por parámetro.** Tres razones: no cambia la firma (ningún
llamador rompe y el `.rpc()` del hook queda intacto), es imposible que el cliente se olvide de
mandarlo, y es imposible que dos llamadas compartan grupo por un bug del cliente.

> **`CREATE OR REPLACE` de una función de una migración ya aplicada NO es "editar una migración
> existente".** El archivo 097 no se toca; se escribe un cuerpo nuevo en una migración nueva. Es
> exactamente lo que hizo la **059** con `fn_crear_movimiento_pendiente_ganado()` de la 044, y la
> **068** con el rollup de la 036. El cuerpo nuevo debe reproducir el de la 097 **verbatim** salvo el
> `grupo_id` — igual que 059 reprodujo el de 044 salvo la guarda `es_hato` — y conservar
> `SECURITY INVOKER`, el `search_path` pineado y los mismos `GRANT`/`REVOKE`.

#### Contrato de agrupación

Se implementa en `agruparMovimientos` (§6.2) y es lo único que la UI puede asumir:

| Forma del grupo | Se renderiza como |
|---|---|
| Mismo `grupo_id`: ≥1 `traslado_salida` + ≥1 `traslado_entrada`, y **cierra por categoría** (Σ novillos y Σ toros iguales de los dos lados, por separado) | **Una** fila `Origen(es) → Destino(s) · N cabezas` |
| Mismo `grupo_id`: ≥2 miembros, **todos** `tipo = 'ajuste'` | **Una** fila "Conteo físico" desplegable, con los N miembros dentro |
| Mismo `transaccion_ganado_id`: ≥2 miembros, **todos** del mismo `tipo` ∈ {`compra`, `venta`}, todos `confirmado` | **Una** fila `Compra/Venta · N cabezas → M potreros`, desplegable |
| Cualquier otra forma: grupo de 1, tipos mezclados, un traslado que **no cierra** por categoría, `grupo_id IS NULL`, `transaccion_ganado_id IS NULL` | **Cada miembro como su propia fila**, sin agrupar |

El "cierra por categoría" reemplaza al viejo "deltas espejo exactos", que solo tenía sentido con 2
filas. Es la misma invariante que ya valida `fn_ganado_registrar_traslado_multi` antes de escribir,
así que un grupo que no cierra **no puede** haber salido del RPC — y si aparece uno, mostrarlo suelto
es exactamente lo que hay que hacer.

La última fila de la tabla es la que hace el contrato honesto por construcción: **degradar es siempre
mostrar más filas, nunca inventar una.** Cumple R-2 sin excepciones y sin heurísticas.

Nada en la base fuerza el número de miembros — a propósito. Un `CHECK` no puede contar filas
hermanas, y un trigger que lo intentara rechazaría el primer `INSERT` del grupo. La invariante vive
en el renderizador, donde su violación produce filas honestas en vez de un error.

### 3.4 `peso_promedio_kg` — no se renombra; se deja de leer

`gan_inventario.peso_promedio_kg` guarda el peso del **último movimiento que traía peso** (migración
045, `COALESCE(NEW.peso_promedio_kg, peso_promedio_kg)`), no un promedio de los animales del potrero.
El nombre miente.

| | (a) Renombrar la columna a `ultimo_peso_kg` | (b) Dejar de leerla; usar `gan_pesos_historico` |
|---|---|---|
| Archivos tocados | migración + 2 árboles de edge function + hook + tipos | hook + tipos |
| Ventana de caída | **sí** — la migración aterriza y las funciones desplegadas siguen pidiendo `peso_promedio_kg` por nombre → PostgREST 400 hasta el redeploy | ninguna |
| Da la **fecha** que pide A-4 | no | **sí** |
| Le da su primer lector a `gan_pesos_historico` (write-only desde 044) | no | sí |

**Decisión: (b).** El trigger 044/045 ya escribe una fila en `gan_pesos_historico (potrero_id, fecha,
peso_promedio_kg)` cada vez que un movimiento trae peso — es la **misma** fuente, más la fecha. La
columna de `gan_inventario` se queda donde está, con un `COMMENT` que dice exactamente qué es y que
no debe mostrarse como promedio.

**Ojo con la asimetría, es fácil invertirla:** `gan_movimientos.peso_promedio_kg` **sí** es un
promedio legítimo del evento (`kilos_pagados / cabezas`, migración 044 §4) y se muestra tal cual en
la columna "Peso del evento" de Movimientos. El que miente es únicamente el de `gan_inventario`.

### 3.5 Lo que NO cambia en el esquema

- `gan_inventario` conserva `UNIQUE (potrero_id)` y su clave. No se le agrega etapa (decisión §3.2 —
  y el análisis del CPO en su §7 sobre el costo de recapturar 369 cabezas sigue siendo el argumento).
- `fn_aplicar_movimiento_ganado()` (045) **no se toca**. Ya tuvo que reescribirse una vez por un bug
  de arbitraje de conflicto; nada en este plan necesita cambiarla.
- `fn_crear_movimiento_pendiente_ganado()` (044 + guarda `es_hato` de 059) **no se toca**.
- **`fn_gan_validar_cabezas_transaccion()` (097) no se toca.** Es la invariante anti-sobre-conteo que
  reemplazó al índice único, y es además la que hace de `transaccion_ganado_id` una clave de
  agrupación confiable (§3.3).
- **`fn_ganado_confirmar_pendiente_multi()` (097) no se toca** — consecuencia de la decisión de dos
  claves.
- `gan_movimientos_transaccion_pendiente_unique` (044) **no se toca**: una transacción sigue
  generando un solo pendiente a la vez. *(El de `confirmado` ya no existe — lo eliminó la 097.)*
- No se agrega ninguna función `SECURITY DEFINER` nueva. Si alguna fase futura la necesitara: debe
  chequear su propio caller y pinear `search_path = public, pg_temp` con `pg_temp` **al final**
  (082).

**Lo único de la 097 que sí se reemplaza** es el cuerpo de `fn_ganado_registrar_traslado_multi()`,
para que estampe el `grupo_id` (§3.3). Va en la 098, verbatim salvo esa línea.

---

## 4. Reglas del proyecto que gobiernan estas migraciones

Se transcriben porque las tres migraciones las tocan todas:

1. **Nunca editar una migración existente.** 044, 045, 077 no se abren.
2. **Siguiente número libre: 098.** El máximo del repo es `096_alertas_catalogo_y_suscripciones.sql`.
   `093` está escrita y **sin aplicar**; `083b` existe; `087`/`088` son huecos deliberados. **Correr
   `ls src/sql/migrations/ | tail -5` justo antes de crear el archivo** — la colisión de numeración
   ya pasó 4 veces en este repo (R-H del brief).
3. **El ledger de Supabase no es autoritativo.** Reconciliar contra el catálogo vivo (`pg_class`,
   `pg_proc`, `information_schema`), nunca contra `list_migrations`.
4. **Respaldos forenses en el esquema `respaldos`, JAMÁS en `public`** (081). Un
   `CREATE TABLE public.backup_* AS SELECT …` hereda el
   `ALTER DEFAULT PRIVILEGES … GRANT ALL TO anon` de Supabase y publica el respaldo en la API con la
   llave que viaja en el bundle del navegador. Habilitar RLS sin políticas igual.
5. **Guardas `RAISE EXCEPTION` con conteos antes y después** (075/080/081). El archivo se corre
   **completo de una vez** para que sea una sola transacción; los `RAISE` dependen de eso para
   deshacer todo. Sin `BEGIN`/`COMMIT` explícitos, igual que 075/076/077/080/081.
6. **Políticas RLS nuevas nacen envueltas**: `(SELECT auth.uid())`, nunca `auth.uid()` pelado (077),
   y `(SELECT es_usuario_gerencia())` si se usara (093). No es cosmético: medido en producción,
   126,3 ms → 3,2 ms en `fin_gastos`.
7. **Aplicar a producción vía el conector de claude.ai.** El CLI no tiene la contraseña de la base y
   el MCP del plugin de Supabase está sin autenticar.

---

## 5. Migraciones

### 5.1 `098_ganado_lotes_y_etapa.sql` — aditiva, riesgo nulo

**No mueve un solo dato.** Se puede aplicar el día que se escriba, antes de tener el Apéndice A.

Contenido:

1. `CREATE TABLE gan_lotes` con el `UNIQUE (finca_id, lower(btrim(nombre)))` y el
   `UNIQUE (id, finca_id)` de §3.1.
2. `ALTER TABLE gan_potreros ADD COLUMN lote_id uuid` + la FK compuesta
   `gan_potreros_lote_misma_finca`.
3. `ALTER TABLE gan_potreros ADD COLUMN etapa text CHECK (etapa IN (…))`.
4. `ALTER TABLE gan_movimientos ADD COLUMN grupo_id uuid`.
5. Índices: `idx_gan_potreros_lote`, `idx_gan_potreros_etapa` (parcial `WHERE etapa IS NOT NULL`),
   `idx_gan_movimientos_grupo` (parcial `WHERE grupo_id IS NOT NULL`).
6. **RLS sobre `gan_lotes`**, patrón 044 (SELECT `authenticated`; escritura Administrador+Gerencia
   vía `EXISTS (SELECT 1 FROM usuarios u WHERE u.id = (SELECT auth.uid()) AND u.rol IN
   ('Administrador'::rol_usuario,'Gerencia'::rol_usuario))`) — **con el `(SELECT auth.uid())`
   envuelto desde el nacimiento** (regla 6 de §4). Más `REVOKE ALL ON gan_lotes FROM anon`: las
   políticas son `TO authenticated`, así que `anon` ya está denegado, pero el grant heredado del
   `ALTER DEFAULT PRIVILEGES` de Supabase sobra y 082 estableció el precedente de quitarlo donde no
   hay call site.
7. `COMMENT ON`:
   - `gan_lotes` — qué es el nivel, y que el nombre solo es único **dentro** de su finca.
   - `gan_potreros.lote_id` — NULL = potrero sin lote; la FK compuesta impide cruzar de finca.
   - `gan_potreros.etapa` — los 4 valores; **NULL = sin clasificar, nunca un centinela, nunca un
     DEFAULT** (precedente 062).
   - `gan_movimientos.grupo_id` — las formas de grupo, quién lo estampa, y que una compra/venta
     repartida **no** lo usa porque agrupa por `transaccion_ganado_id` (§3.3).
   - **`gan_inventario.peso_promedio_kg`** — "peso del último movimiento que trajo peso, NO un
     promedio de los animales del potrero (COALESCE en `fn_aplicar_movimiento_ganado`, migración
     045). La UI lee el último peso y su fecha de `gan_pesos_historico`. No mostrar esta columna
     etiquetada como promedio."
8. **`CREATE OR REPLACE FUNCTION fn_ganado_registrar_traslado_multi(DATE, JSONB, JSONB, NUMERIC, TEXT)`**
   — el cuerpo de la 097 **verbatim**, con exactamente tres cambios:
   - un `v_grupo_id UUID := gen_random_uuid();` en el `DECLARE`;
   - `grupo_id` agregado a la lista de columnas y `v_grupo_id` a los `VALUES` de los **dos** bucles
     de `INSERT` (el de orígenes y el de destinos);
   - el `COMMENT ON FUNCTION` actualizado.

   Todo lo demás se conserva **idéntico**: `SECURITY INVOKER`, `SET search_path = public, pg_temp`,
   las validaciones de cierre por categoría, el orden salidas-antes-que-entradas (es lo que hace que
   el `CHECK` de `gan_inventario` aborte la transacción entera), y los mismos
   `REVOKE … FROM PUBLIC, anon` + `GRANT … TO authenticated`.

   > `CREATE OR REPLACE` **no conserva los grants automáticamente si la firma cambia** — por eso la
   > firma **no** cambia (el `grupo_id` se genera adentro, no se recibe). Aun así se re-emiten el
   > `REVOKE` y el `GRANT` explícitamente, para que la migración se lea como una afirmación de acceso
   > y no dependa de lo que Postgres haga por omisión (misma disciplina que 081 §1).

9. **Guardas de cierre** (`DO $$ … RAISE EXCEPTION`):
   - las 3 columnas nuevas existen con el tipo correcto y son nullables;
   - el `CHECK` de etapa existe y la FK compuesta existe;
   - `gan_lotes` tiene RLS activa con exactamente 2 políticas y `anon` tiene 0 privilegios;
   - los 3 índices existen;
   - **`fn_ganado_registrar_traslado_multi` sigue siendo `prosecdef = false`** (no se volvió DEFINER
     por accidente), **conserva el `search_path` pineado**, `authenticated` conserva `EXECUTE` y
     `anon` no lo tiene;
   - **`fn_ganado_confirmar_pendiente_multi` y `fn_gan_validar_cabezas_transaccion` están intactas**
     (`md5(prosrc)` distinto de nulo y la función presente) — la 098 no las toca, y la guarda lo
     afirma.

**ROLLBACK** al pie: `CREATE OR REPLACE` de `fn_ganado_registrar_traslado_multi` con el cuerpo
original de la 097 (que está en el repo, sin ambigüedad), y `DROP` de los índices, de la FK, de las 3
columnas y de la tabla, en ese orden. Sin pérdida de datos porque no hay datos — salvo los
`grupo_id` ya estampados, que se pierden con la columna y se pueden regenerar corriendo la 100.

### 5.2 `099_ganado_reorganizacion_fincas.sql` — mueve datos de producción

**Es la migración riesgosa.** Requiere el **Apéndice A completo y aprobado**. Debe ser abortable y
reversible.

> **Antes de escribirla, releer §1: los conteos de la guarda 1 son de 2026-08-17.** Si producción se
> movió entre hoy y el día de la aplicación, la migración **debe** abortar — eso es el diseño, no un
> obstáculo. Un humano revisa qué cambió y actualiza los conteos con evidencia.

**§0 — Respaldos en `respaldos`** (nunca en `public`, regla 4 de §4):

```sql
CREATE TABLE IF NOT EXISTS respaldos.backup_098_gan_potreros AS
  SELECT id, nombre, finca_id, activo, lote_id, etapa FROM gan_potreros;
CREATE TABLE IF NOT EXISTS respaldos.backup_098_gan_fincas AS
  SELECT id, nombre, ubicacion_id, hectareas, activa FROM gan_fincas;
CREATE TABLE IF NOT EXISTS respaldos.backup_098_gan_inventario AS
  SELECT potrero_id, novillos, toros, peso_promedio_kg FROM gan_inventario;
```
Las tres con `ENABLE ROW LEVEL SECURITY` y sin políticas. No hace falta `REVOKE`: `respaldos` no
tiene los DEFAULT PRIVILEGES de `public` (nota al pie de 081).

**§1 — Guardas previas.** Cada una con `RAISE EXCEPTION` y un mensaje que diga qué encontró:

- 3 ubicaciones, 9 fincas, 34 potreros, 49 movimientos.
- **369 cabezas totales.**
- Las 6 fincas con ganado tienen exactamente `(potreros, cabezas)`: Escocia (17, 216),
  santimp (6, 67), Carrizal (5, 45), Mochuelos (2, 23), Andalucia (3, 19), Maryland (1, 18).
- `Escocia (lote)`, `aumento emilio` y `Macondo` existen, con **0 potreros** cada una.
- `Escocia (lote)` y `aumento emilio` tienen **0 movimientos** asociados (por potrero — que es
  trivial si tienen 0 potreros, pero se verifica igual, explícito).
- **No existe** una finca cuyo `lower(nombre)` sea `'supatá'` ni `'supata'`.
- La lista literal del Apéndice A tiene **exactamente 34 entradas**, y cada `(finca_actual, nombre)`
  resuelve a **exactamente un** potrero. Ni 0 (nombre mal escrito) ni 2.
- **Sin colisiones de re-parentado**: para cada potrero que se mueve, no existe ya un potrero con el
  mismo `nombre` en la finca destino. `gan_potreros` tiene `UNIQUE (finca_id, nombre)`, y un error
  crudo de constraint a mitad del `UPDATE` es mucho peor que un mensaje que liste las colisiones.
- **Idempotencia**: si ya existe la finca `Supatá` **y** los 34 potreros ya tienen `lote_id`, emitir
  `RAISE NOTICE` y salir sin error.

**§2 — Crear la finca `Supatá`** en la ubicación `Supata` (resuelta por nombre, no por uuid literal),
`hectareas = 0`, `activa = true`.

**§3 — Re-parentar 11 potreros** (`UPDATE gan_potreros SET finca_id = …`), resolviendo los ids por
`(finca_actual, nombre)`:
- Maryland (1) + Mochuelos (2) → **Escocia**
- Carrizal (5) + Andalucia (3) → **Supatá**

Nada más se toca: los movimientos referencian **ids de potrero**, que no cambian, y
`gan_inventario.potrero_id` tampoco. **La reorganización no mueve ni un animal — solo cambia de quién
cuelga cada potrero.** Esa es la propiedad que la hace segura, y la guarda de cierre la verifica.

**§4 — Sembrar `gan_lotes`**: un `INSERT` por cada lote distinto del Apéndice A, con su
`finca_id` **posterior** al re-parentado (Maryland y Mochuelos son lotes de Escocia; Carrizal y
Andalucía son lotes de Supatá). ~24 filas.

**§5 — Asignar `lote_id` y `etapa` a los 34 potreros** con un `UPDATE … FROM (VALUES …)` alimentado
por la lista literal del Apéndice A.

> **Por qué una lista literal y no una expresión regular dentro del SQL.** Una regex que se equivoca
> en producción asigna una etapa mal **en silencio** y nadie se entera hasta que el desglose miente.
> La lista literal es auditable línea por línea y es lo que la guarda de cierre puede contar. La
> derivación por nombre **sí** se usa —pero afuera, en TS, con tests— para *generar* esa lista
> (§6.2, `derivarLoteEtapaDeNombre`), que después un humano revisa.

**§6 — Desactivar los 4 potreros `General`**, cada uno guardado con "0 cabezas" (`gan_inventario`
ausente o en 0/0). `lote_id` y `etapa` quedan NULL.

**§7 — Desactivar Maryland, Mochuelos, Carrizal y Andalucía**, cada una guardada con "0 potreros
restantes".

**§8 — `Macondo` a `activa = false`** (si no lo está ya).

**§9 — Borrar físicamente `Escocia (lote)` y `aumento emilio`.** Se re-verifica 0 potreros y 0
movimientos **inmediatamente antes** del `DELETE`, y se exige que borre **exactamente 2 filas**.
`RAISE NOTICE` con el conteo de filas de `fin_transacciones_ganado` cuyo texto libre `finca` coincida
con alguno de los dos nombres: **informativo, no bloqueante** — `fin_transacciones_ganado.finca` es
texto suelto sin FK, así que las transacciones históricas conservan su texto intacto; lo único que se
pierde es la opción en el dropdown de `TransaccionGanadoForm`.

> **Por migración y no agregando borrado a la UI.** `GanadoConfig.tsx:16` documenta que no hay
> borrado físico *por diseño*, para preservar el historial de movimientos, y ese diseño es correcto.
> Un botón de borrar sería una capacidad permanente cuya seguridad dependería de que el usuario
> revise las dependencias cada vez. Estas dos filas son huérfanas **demostrables**, la migración lo
> re-verifica, y el respaldo permite deshacerlo. Lo que **sí** gana la UI es un aviso al desactivar
> una finca que todavía tiene cabezas (§7.2).

**§10 — Guardas de cierre.** Todas dentro de la misma transacción, con `RAISE EXCEPTION`:

| # | Invariante | Valor esperado |
|---|---|---|
| C1 | Total de cabezas | **369** — idéntico al de la guarda previa |
| C2 | Potreros existentes | 34, con los mismos 34 `id` que el respaldo |
| C3 | Filas de `gan_movimientos` | 49 — la reorganización no toca el log |
| C4 | Fincas | 8 (9 − 2 borradas + 1 nueva); 3 activas, 5 inactivas |
| C5 | Cabezas por finca activa | Escocia 238 (20 potreros), Supatá 64 (8), santimp 67 (6) |
| C6 | **Cabezas en potreros de finca inactiva** | **0** — la invariante que habilita B-δ (§7.1) |
| C7 | Potreros activos sin `lote_id` | 0, salvo la lista blanca que declare el Apéndice A |
| C8 | Potreros cuyo lote pertenece a otra finca | 0 (redundante con la FK; documenta la invariante) |
| C9 | Distribución de etapas | igual a los conteos del Apéndice A |
| C10 | **Cabezas sin etapa** | **56** (Bosque 19 + Quebradas 13 + Colinas 12 + Los Olivos 12) |
| C11 | Potreros `General` activos | 0 |

**ROLLBACK** documentado al pie, ejecutable tal cual:
restaurar `finca_id`/`activo`/`lote_id`/`etapa` de los 34 potreros desde
`respaldos.backup_098_gan_potreros` con `UPDATE … FROM`; borrar los lotes sembrados; reactivar las 4
fincas; re-insertar las 2 borradas desde `respaldos.backup_098_gan_fincas` (**con su `id` original**,
para que nada quede colgando); borrar la finca `Supatá`.

### 5.3 Nota sobre C-1 del brief (Maryland y Mochuelos)

El brief planteaba una escalada binaria: reactivar las fincas **o** registrar un movimiento de salida
por las 41 cabezas, porque cualquier otra cosa violaría R-9 ("el snapshot es consecuencia del log").

La reorganización lo resuelve por una vía que no existía cuando se escribió: **los potreros se
re-parentan a fincas activas**. Las 41 cabezas siguen exactamente en los mismos 3 potreros, con los
mismos ids, y esos potreros ahora cuelgan de Escocia. **No entró ni salió un animal**, así que no hay
ningún movimiento que registrar y R-9 se cumple trivialmente. La guarda C1 (369 antes = 369 después)
es la prueba, y C6 (0 cabezas fuera de finca activa) es lo que hace seguro corregir B-δ después.

### 5.4 `100_ganado_grupos_historicos.sql` — inferencia sobre la historia

Independiente de la 099 (solo toca `gan_movimientos`), pero se aplica después por orden numérico y
para tener una sola ventana de verificación. **Requiere la 098 aplicada** (necesita la columna).

> **Renombrada respecto de la versión anterior de este plan** (`…_traslados_grupo_historico`): el
> alcance ya no son solo los traslados. Ver la población P3.

**El problema.** B-1 del brief pide que el 2026-07-02 muestre 11 filas y no 22. Las 22 comparten
fecha, así que emparejarlas por fecha + montos es exactamente la aproximación que R-2 prohíbe: entre
11 salidas y 11 entradas del mismo día, dos traslados de la misma cantidad de cabezas son
indistinguibles.

#### El hecho de Postgres del que cuelga todo

`gan_movimientos.created_at` es `TIMESTAMPTZ DEFAULT NOW()` (044, línea 81), y **`NOW()` en Postgres
es `transaction_timestamp()`: constante dentro de una transacción.** De ahí se deduce, sin adivinar
nada:

- Filas escritas por **una sola sentencia o una sola llamada a un RPC** comparten `created_at`
  **exacto, al microsegundo**.
- Filas escritas por llamadas separadas tienen `created_at` **distintos** (dos round-trips HTTP están
  a milisegundos como mínimo, y hay un solo capturador).

O sea que `created_at` no es un dato de auditoría cualquiera: es **la huella de la transacción**. Y
como cada camino de escritura del módulo tiene una forma transaccional distinta, el propio
`created_at` dice qué código escribió cada fila. La migración no tiene que suponerlo: lo lee.

#### Tres poblaciones, tres reglas — y son mutuamente excluyentes

| | Población | Cómo se escribió | Huella en `created_at` | Regla |
|---|---|---|---|---|
| **P1** | Traslados **anteriores a la 097** — las 11 parejas del 2026-07-02 | dos `.insert()` separados, cada uno con su `await` → **dos transacciones** | los 2 `created_at` **distintos**, salida antes que entrada | **secuencia** |
| **P2** | Traslados escritos por `fn_ganado_registrar_traslado_multi` **entre la 097 y la 098** | un RPC → **una transacción**, N+M filas | todas **idénticas** | **transacción** |
| **P3** | Ajustes masivos y cargas iniciales, **de cualquier fecha** | un `.insert(array)` → **una sentencia** | todas **idénticas**, y además misma `fecha` y misma `notas` | **transacción** |

**Son distinguibles sin ambigüedad**: si el `created_at` de una fila de traslado es **único** en el
conjunto, viene del código viejo (P1); si lo comparte con otras filas, viene del RPC (P2). La
migración decide la regla **por fila**, leyendo el dato, no presumiendo.

**P1 — regla de secuencia.** El código que escribió esas filas está en el repo y se puede citar:
`git show e4fa6d4:src/components/ganado/hooks/useGanadoInventario.ts`, líneas 167-175 — inserta la
salida, la espera, e inserta la entrada. Ordenadas por `created_at`, las 22 filas del día tienen que
formar `S,E,S,E,…`. No es una heurística de similitud: es una consecuencia del orden de escritura de
ese código. **Que ese código ya no exista no debilita el argumento** — lo que importa es el código
que escribió *esas* filas, y esas filas son de julio.

`ROW_NUMBER() OVER (ORDER BY created_at)`; las filas `2k−1` y `2k` forman par **si y solo si**: la
primera es `traslado_salida`, la segunda `traslado_entrada`, los deltas son **espejo exacto**
(`s.novillos_delta = -e.novillos_delta AND s.toros_delta = -e.toros_delta`),
`s.potrero_origen_id IS NOT NULL`, `e.potrero_destino_id IS NOT NULL`, y son potreros distintos.

**P2 — regla de transacción.** Todas las filas de traslado que comparten `created_at` exacto son un
solo evento, **si además** comparten `fecha` y el conjunto **cierra por categoría** (Σ novillos de
las salidas = Σ novillos de las entradas, y lo mismo con toros). Es la misma invariante que el RPC ya
valida antes de escribir, así que un conjunto que no cierra no puede haber salido de ahí.

> **P2 está vacía hoy** (no hay traslados desde el 2026-08-17; los movimientos de ese día fueron una
> confirmación de compra y tres ajustes). Puede dejar de estarlo si alguien registra un traslado
> entre hoy y la 098 — por eso la regla existe igual. Poner el `CREATE OR REPLACE` en la 098 y no en
> la 099 (§3.3) es precisamente lo que mantiene esta población en cero o casi.

**P3 — el hallazgo que agranda el alcance, para bien.** `ajusteMasivo` hace **un** `.insert(array)`
con las N filas (`useGanadoInventario.ts:243-250`), y `cargarInventarioInicial` lo mismo
(línea 238). Una sentencia = una transacción = **`created_at` idéntico en todas**. O sea que **los
conteos físicos históricos ya son agrupables con evidencia determinista**, sin haber previsto nada.
Eso le da al dueño el «21 filas → 1» de la decisión 6 **retroactivamente**, no solo para los conteos
futuros.

Regla: ≥2 filas `tipo='ajuste'` que comparten `created_at` exacto **y** `fecha` **y** `notas`. El
triple anclaje no es paranoia barata: `construirAjustesMasivos(filas, fecha, nota)` pone la misma
`fecha` y la misma `notas` en todas por construcción, así que las tres condiciones se cumplen juntas
o el conjunto no salió de ahí. Un `registrarAjuste` manual inserta **una** fila → grupo de 1 → no se
agrupa (contrato de §3.3).

> **P3 es separable a propósito.** Si QA o el dueño prefieren no tocar los ajustes históricos, se
> borra esa sección del archivo y las otras dos siguen funcionando. Que sea separable es un requisito
> del diseño, no una casualidad.

#### Pre-guardas (cualquiera que falle → `RAISE EXCEPTION`, no se agrupa nada)

Comunes:
- Todas las filas candidatas tienen `grupo_id IS NULL` (si ya están agrupadas: `RAISE NOTICE` y
  salir — idempotencia).
- El total de `gan_movimientos` es el esperado (**53** al 2026-08-17; ver §1) y ningún delta cambia.

P1:
- Exactamente **22** movimientos confirmados de tipo traslado con `fecha = '2026-07-02'`, 11 de cada
  tipo.
- Sus 22 `created_at` son **todos distintos**. Si dos comparten instante, la secuencia no está
  determinada y la evidencia no alcanza. *(Es el mismo criterio con el que la 075 decidió no tocar 72
  grupos de monitoreo: `created_at` idéntico ⇒ el orden no discrimina ⇒ no se adivina.)*
- Los **11** pares candidatos cumplen las 6 condiciones. Si uno solo falla, aborta.

P2:
- Cada conjunto de filas de traslado con `created_at` compartido tiene ≥1 salida **y** ≥1 entrada,
  una sola `fecha`, y **cierra por categoría**. Si alguno no cierra, aborta.
- Ninguna fila de traslado queda sin clasificar en P1 o P2 — o sea, ningún `created_at` de traslado
  es simultáneamente único y compartido (imposible por construcción, pero la guarda lo afirma).

P3:
- Cada conjunto de `ajuste` con `created_at` compartido tiene una sola `fecha` y una sola `notas`.
- Se reporta con `RAISE NOTICE` cuántos grupos y de qué tamaño se van a formar, **antes** de
  escribir. Los tres ajustes del 2026-08-17 caerán en un grupo o en tres según cómo se hayan
  capturado; la migración **reporta lo que encuentra, no presume** cuál fue.

#### Guardas de cierre

- **11** `grupo_id` distintos en P1, cada uno con exactamente 2 miembros, uno de cada tipo, deltas
  espejo.
- 0 filas de traslado con `grupo_id IS NULL`.
- Todo grupo de traslado (P1 o P2) **cierra por categoría**.
- Ningún `grupo_id` mezcla tipos de familias distintas (un grupo es todo-traslado o todo-ajuste).
- `count(*)` de `gan_movimientos` sin cambios y `sum(novillos_delta)`, `sum(toros_delta)` sin cambios
  — la 100 **solo** escribe `grupo_id`.
- **El inventario no se movió**: `gan_inventario` byte a byte igual que en el respaldo. Un `UPDATE`
  sobre `gan_movimientos` dispara `fn_aplicar_movimiento_ganado()` (045), cuyo `IF` solo actúa en la
  transición `pendiente → confirmado` — así que tocar `grupo_id` es inerte. **La guarda lo verifica
  igual**, porque "es inerte" es exactamente la clase de suposición que conviene tener probada.

#### Respaldo y rollback

`respaldos.backup_100_gan_movimientos_grupos` con las filas afectadas verbatim (incluido el
`grupo_id` NULL previo) más `gan_inventario` completo. ROLLBACK:
`UPDATE gan_movimientos SET grupo_id = NULL WHERE id IN (SELECT id FROM respaldos.backup_100_…)`.

> **Si la 100 aborta, NO se reintenta con una regla más laxa.** El resultado correcto es dejar las
> filas sueltas —que es el comportamiento de hoy, no una regresión— y llevarle la evidencia al dueño.
> Este es el riesgo R-E del brief y la regla es innegociable: *prefiero una página menos elegante que
> un movimiento inventado.*

#### Consulta de pre-verificación

Correr **antes** de escribir la migración: su resultado decide qué poblaciones existen y si la 100
tiene sentido.

```sql
-- Clasifica cada movimiento agrupable por la huella de su transacción.
WITH candidatos AS (
  SELECT id, tipo, fecha, created_at, novillos_delta, toros_delta, notas,
         potrero_origen_id, potrero_destino_id, grupo_id,
         count(*) OVER (PARTITION BY created_at) AS filas_mismo_instante
  FROM gan_movimientos
  WHERE estado = 'confirmado'
    AND tipo IN ('traslado_salida','traslado_entrada','ajuste')
)
SELECT CASE
         WHEN tipo LIKE 'traslado%' AND filas_mismo_instante = 1 THEN 'P1 secuencia (pre-097)'
         WHEN tipo LIKE 'traslado%'                             THEN 'P2 transaccion (RPC 097)'
         WHEN filas_mismo_instante > 1                          THEN 'P3 conteo fisico'
         ELSE 'suelto — no se agrupa'
       END                                   AS poblacion,
       count(*)                              AS filas,
       count(DISTINCT created_at)            AS instantes,
       count(*) FILTER (WHERE grupo_id IS NOT NULL) AS ya_agrupadas,
       min(fecha), max(fecha)
FROM candidatos
GROUP BY 1 ORDER BY 1;
```

**Cómo se lee el resultado**, sin margen de interpretación:

- `P1 … filas = 22` e `instantes = 22` → la regla de secuencia aplica; se esperan 11 pares.
- `P1 … instantes < filas` → **hay `created_at` repetidos donde no debería haberlos**: no se agrupa
  P1, se investiga.
- `P2 … filas = 0` → nadie registró traslados desde la 097 (lo esperado hoy).
- `P3 … filas ≈ 21+` → los conteos físicos históricos son agrupables.
- `ya_agrupadas > 0` → la 100 ya corrió; es idempotente y sale sin error.

#### Sobre marcar el agrupamiento como "inferido"

Se consideró una columna `grupo_origen text CHECK IN ('capturado','inferido_migracion')`. Rechazada:
si las guardas se cumplen, el agrupamiento **es** correcto y la columna solo agregaría un dato que
nada lee; si no se cumplen, no hay agrupamiento que marcar. La trazabilidad vive donde vive la de
075/076/080: en la tabla de respaldo, que conserva el estado previo y permite reconstruir exactamente
qué asignó la migración.

---

## 6. Cambios por archivo

Cada subsección abre con **qué de lo planeado ya lo hizo #124**, para que nadie reescriba algo que ya
está en `main`.

| Archivo | ¿Lo tocó #124? | Veredicto |
|---|---|---|
| `types/ganado.ts` | no | se escribe encima, sin colisión |
| `utils/calculosGanado.ts` | **sí, +170 líneas** | **colisiona**: 2 funciones que yo planeaba modificar ya no existen |
| `hooks/useGanadoInventario.ts` | **sí, +51** | **colisiona parcialmente**: 2 de mis cambios ya están hechos y mejor |
| `GanadoDashboard.tsx` | no | se escribe encima |
| `GanadoMovimientos.tsx` | sí, menor | se escribe encima; conservar lo que agregó |
| `RepartoPotreros.tsx` | **nuevo** | **se reutiliza**, cambio mínimo |
| `ConfirmarPendienteDialog` / `MovimientoFormDialog` | **sí, reescritos** | **cambio mínimo** — mucho de lo que yo planeaba ya está |
| `AjusteMasivoDialog` / `InventarioInicialDialog` | no | se escribe encima |
| `GanadoConfig.tsx` | no | se escribe encima |

### 6.1 `src/types/ganado.ts`

> **#124 no tocó este archivo.** Todo lo de abajo se escribe encima sin colisión. Nota: los tipos del
> reparto (`RepartoFila`, `TrasladoMultiParams`) viven en `calculosGanado.ts`, no acá — se respeta esa
> ubicación, no se mudan.

```ts
export type EtapaProductiva = 'terneros' | 'levante' | 'ceba' | 'repele';
/** Bucket de presentación. `sin_clasificar` NUNCA se persiste — en la base es NULL. */
export type EtapaBucket = EtapaProductiva | 'sin_clasificar';
export const ORDEN_ETAPAS: EtapaBucket[] = ['terneros','levante','ceba','repele','sin_clasificar'];
export const ETIQUETA_ETAPA: Record<EtapaBucket, string> = { … };  // "Terneros", …, "Sin clasificar"

export interface GanLote { id: string; finca_id: string; nombre: string; activo: boolean }
export type ResumenEtapas = Record<EtapaBucket, number>;
```

- `GanPotrero` += `lote_id: string | null`, `etapa: EtapaProductiva | null`.
- `GanMovimiento` += `grupo_id: string | null`.
- `InventarioPotreroRow`: += `lote_id: string | null`, `lote: string | null`,
  `etapa: EtapaProductiva | null`, `ultimo_peso_kg: number | null`,
  `ultimo_peso_fecha: string | null`; **se elimina `peso_promedio_kg`** (es el nombre engañoso;
  eliminarlo obliga al compilador a señalar cada lector).
- `KPIsInventarioGanado` += `porEtapa: ResumenEtapas`,
  `potrerosSinEtapa: { potreros: number; cabezas: number }`,
  `cabezasFueraDeFincaActiva: number`.
- `MovimientoConContexto` += `lote_origen`, `lote_destino`, `etapa_origen`, `etapa_destino`,
  `valor_total: number | null`, `kilos_pagados: number | null`, `cabezas_transaccion: number | null`.
- Nuevo, para el árbol de Inventario:
  ```ts
  export interface NodoPotrero { potrero_id; potrero; lote; etapa; novillos; toros; cabezas;
                                 ultimoPesoKg; ultimoPesoFecha }
  export interface NodoLote     { lote_id: string | null; lote: string; cabezas; novillos; toros;
                                  porEtapa: ResumenEtapas; potreros: NodoPotrero[] }
  export interface NodoFinca    { finca_id; finca; hectareas; cabezas; novillos; toros;
                                  cabezasPorHa: number | null; porEtapa: ResumenEtapas;
                                  lotes: NodoLote[] }
  export interface NodoUbicacion{ ubicacion_id; ubicacion; cabezas; hectareas;
                                  cabezasPorHa: number | null; porEtapa: ResumenEtapas;
                                  fincas: NodoFinca[] }
  ```
- Nuevo, para el log agrupado. Unión discriminada **con una variante por cada forma de §3.3**, para
  que el renderizador no pueda leer un saldo que no existe. Rediseñada para N→M:
  ```ts
  /** Una punta de un evento repartido: el potrero, sus cabezas y su saldo posterior. */
  export interface PuntaMovimiento {
    movimiento_id: string; potrero_id: string; potrero: string;
    lote: string | null; finca: string;
    novillos: number; toros: number;            // SIEMPRE positivos (R-8)
    saldo: number | null;                       // null = no calculable (R-1)
  }

  export type MovimientoAgrupado =
    | { clase: 'simple'; movimiento: MovimientoConContexto; saldo: number | null }
    | { clase: 'traslado'; grupo_id: string; fecha: string;
        origenes: PuntaMovimiento[]; destinos: PuntaMovimiento[];   // N y M, ambos ≥ 1
        cabezas: number; notas: string | null }
    | { clase: 'compra_venta'; transaccion_ganado_id: string; tipo: 'compra' | 'venta';
        fecha: string; puntas: PuntaMovimiento[]; cabezas: number;
        valor_total: number | null; kilos_pagados: number | null }
    | { clase: 'conteo_fisico'; grupo_id: string; fecha: string;
        miembros: MovimientoConContexto[]; puntas: PuntaMovimiento[];
        potrerosAfectados: number; deltaNeto: number; notas: string | null };
  ```

Tres decisiones dentro de ese tipo, todas consecuencia de la 097:

- **`saldoOrigen`/`saldoDestino` desaparecieron.** Solo tenían sentido con traslados 1→1. El saldo
  vive ahora **en cada punta**, que es donde el dato existe de verdad.
- **`PuntaMovimiento` se comparte** entre traslado, compra/venta y conteo físico: las tres son «un
  evento repartido en N potreros». Un solo tipo, un solo renderizador de punta, una sola forma de
  mostrar el saldo.
- **La variante `compra_venta` se discrimina por `transaccion_ganado_id`, no por `grupo_id`** — el
  tipo lo hace explícito para que sea imposible confundirse al implementar (§3.3).

`NodoLote.cabezasPorHa` **no existe**: decisión 7 (hectáreas solo por finca). No se declara un campo
que siempre sería `null` — un campo así se termina llenando.

### 6.2 `src/utils/calculosGanado.ts` — todo puro, todo testeado

> **#124 lo reescribió a medias: 257 → 325 líneas.** Es la colisión más grande del plan.

**Lo que #124 ya hizo, y que este plan da por bueno y NO rehace:**

| | |
|---|---|
| `construirMovimientosTraslado` | **eliminada.** La construcción de las filas vive ahora solo en el RPC. **No revivirla** — el comentario de `calculosGanado.ts:219-222` explica por qué, y tiene razón |
| `validarSplitConfirmacion` | **eliminada**, reemplazada por `validarRepartoConfirmacion` |
| `RepartoFila`, `filasConCabezas`, `totalCabezasReparto`, `totalNovillosReparto`, `totalTorosReparto` | primitivas del reparto, ya escritas y probadas |
| `validarFilasReparto` (privada), `validarRepartoConfirmacion`, `validarExistencias`, `validarTrasladoMulti`, `TrasladoMultiParams` | validación completa del reparto N→M, ya probada |

**Consecuencia directa sobre el plan original:** el ítem *"`construirMovimientosTraslado` gana
`grupoId`"* **queda anulado**. El `grupo_id` del traslado lo estampa el RPC (§3.3), así que del lado
de TypeScript **no hay nada que hacer** para los traslados. El cliente sigue estampándolo solo donde
sigue construyendo filas: `construirAjustesMasivos` y `construirMovimientosCargaInicial`.

**Se modifican (verificado que siguen existiendo tal cual):**

- `calcularVariacion(movs, fechaDesde)` — **excluye traslados** (B-γ, vigente: `calculosGanado.ts:73-86`
  sin cambios en #124). La firma gana `tipo` en el `Pick<>`. Regla:
  `if (m.tipo === 'traslado_entrada' || m.tipo === 'traslado_salida') return;` antes de sumar. Un
  traslado no es una entrada ni una salida del inventario: es un movimiento interno.
- `construirAjustesMasivos(filas, fecha, nota, grupoId)` — todas las filas comparten `grupoId`
  (**inyectado**, no generado adentro: la función tiene que seguir siendo pura y determinista).
- `construirMovimientosCargaInicial(…, grupoId)` — ídem.
- `calcularKPIsInventario(rows)` — agrega `porEtapa`, `potrerosSinEtapa` y
  `cabezasFueraDeFincaActiva`.

**Se agregan:**

| Función | Contrato |
|---|---|
| `derivarLoteEtapaDeNombre(nombre): { lote: string \| null; etapa: EtapaProductiva \| null }` | Sugiere lote y etapa desde el nombre del potrero. Ver la regla abajo. **No conoce ninguna excepción del dueño** — las excepciones se aplican encima, en el Apéndice A y en la UI |
| `construirArbolInventario(rows, filtros): NodoUbicacion[]` | Árbol ubicación → finca → lote → potrero con totales por nivel. Cada finca aparece aunque tenga 0 cabezas (A-1). Potreros sin lote van a un nodo `{ lote_id: null, lote: 'Sin lote' }` al final. `cabezasPorHa` solo en finca y ubicación; hectáreas contadas **una vez por finca** |
| `resumirEtapas(rows): ResumenEtapas` | Σ buckets = total. Los NULL van a `sin_clasificar`. **Nunca reparte ni infiere** (A-2) |
| `agruparMovimientos(movs, saldos): MovimientoAgrupado[]` | El contrato de §3.3, literal, con las **cuatro** formas (traslado N→M por `grupo_id`, conteo físico por `grupo_id`, compra/venta por `transaccion_ganado_id`, y suelto). Degrada a filas sueltas ante cualquier forma inesperada |
| `calcularSaldosPorPotrero(movsConfirmados, snapshot): Map<potreroId, Map<movId, number>> \| null por potrero` | Saldo corriente. Ver abajo |
| `cabezasFueraDeFincaActiva(rowsIncluyendoInactivas): { cabezas; fincas: {finca; cabezas}[] }` | Alimenta el aviso de §7.1 |
| `antiguedadEnDias(fechaISO, hoyISO): number` | B-5. `hoy` **se inyecta** (`obtenerFechaHoy()` en el llamador) — la función pura no lee el reloj |

**Regla de `derivarLoteEtapaDeNombre`** (normaliza plegando acentos y a minúsculas **solo para
comparar**; el `lote` devuelto conserva el casing y los acentos del original):

1. Tokenizar por espacios, colapsando espacios repetidos.
2. Si el **último** token es una etapa → `etapa` = esa, `lote` = el resto.
   `"Sierra Morena Ceba"` → `{ lote: "Sierra Morena", etapa: "ceba" }`
3. Si no, y el **primer** token es una etapa y hay al menos un token más → `etapa` = esa,
   `lote` = el resto. `"Terneros Cedral"` → `{ lote: "Cedral", etapa: "terneros" }`
4. Si no → `lote` = el nombre completo, `etapa` = `null`.
   `"Bosque"` → `{ lote: "Bosque", etapa: null }` · `"Peña Blanca"` → `{ lote: "Peña Blanca", etapa: null }`
5. Si el nombre es **solo** una palabra de etapa → `{ lote: null, etapa: esa }` y se marca para
   revisión humana.

La regla reproduce por sí sola la intención del dueño: `"Terneros Maryland"` → lote **Maryland**,
`"Mochuelos Ceba"` → lote **Mochuelos** — exactamente los lotes de Escocia que él nombró. Las dos
excepciones (`Peña Blanca*` → lote Carrizal, y `Peña Blanca` → etapa ceba) **no van dentro de la
función**: van en el Apéndice A, porque son conocimiento del dueño y no del nombre.

**Cómo se calcula el saldo (B-4 / R-6).** Dos formas de hacerlo:

- *Hacia adelante desde cero*: `saldo(k) = Σ deltas hasta k`. Correcto solo si la historia completa
  está presente **y** cierra contra el snapshot.
- *Hacia atrás desde el snapshot*: `saldo(k) = snapshot − Σ deltas posteriores a k`.

**Se implementa hacia atrás**, porque ancla en el número que la página de Inventario ya muestra: la
última fila de cada potrero coincide siempre con su inventario actual, y las dos pantallas no pueden
contradecirse. Además, la función calcula **también** la suma hacia adelante y, si
`Σ deltas ≠ snapshot` para un potrero, devuelve `null` para **todos** los saldos de ese potrero. La
UI renderiza `—` (R-1 y el último criterio de B-4: *"si la historia completa no se pudo cargar,
'—', nunca un saldo aproximado"*).

Orden determinista de los eventos: `(fecha, created_at, id)`. Empates de `created_at` se rompen por
`id`: arbitrario pero **estable**, y no afecta el saldo final del potrero.

**El saldo no depende de los filtros (R-6), por construcción**: se calcula sobre la historia
confirmada **completa** que trae el hook, y el filtrado ocurre después, sobre el arreglo ya
anotado. Hay un test dedicado a esto (§8, PU-11).

**El saldo con eventos N→M.** Un traslado repartido ya no tiene "dos saldos". Cada punta
(`PuntaMovimiento`) lleva el suyo, y la fila **colapsada** muestra un saldo único **solo** cuando el
evento tiene exactamente una punta de cada lado (1→1). En cualquier otro caso la celda colapsada dice
`—` y los saldos aparecen al desplegar, uno por punta. Misma regla para el conteo físico y para la
compra/venta repartida: **un evento que tocó 21 potreros no tiene un saldo, tiene 21**, y fabricar
uno solo sería exactamente lo que R-5 prohíbe.

### 6.3 `src/components/ganado/hooks/useGanadoInventario.ts`

> **#124 lo tocó: +51 líneas.** Dos de los cambios que este plan pedía **ya están hechos, y mejor de
> lo que yo los había planeado**.

**Lo que #124 ya resolvió, y que este plan da por bueno:**

| | |
|---|---|
| `registrarTraslado` | ya no hace dos `INSERT`: llama `.rpc('fn_ganado_registrar_traslado_multi')`. **B-β cerrado.** Mi propuesta de `insert([salida, entrada])` **queda anulada** — el RPC es estrictamente mejor: es una transacción de base de verdad, no una sentencia, y encima soporta N→M |
| `confirmarPendiente` | ya no hace `UPDATE`: llama `.rpc('fn_ganado_confirmar_pendiente_multi')` con `p_filas`. **No hay que tocarlo**: no pisa `grupo_id` (no lo escribe) y su agrupación es `transaccion_ganado_id` |

**Lo que sigue pendiente** (verificado línea por línea contra el archivo actual, 292 líneas):

| Función | Cambio | Estado en `main` |
|---|---|---|
| `fetchEstructura` | += `gan_lotes`; los potreros traen `lote_id, etapa` | sin hacer (líneas 26-41) |
| `fetchInventario` | += join a `gan_lotes`, columnas `lote_id/etapa`; **filtra `finca.activa`** (B-δ); último peso + fecha desde `gan_pesos_historico` | sin hacer (línea 53 sigue con solo `.eq('activo', true)`) |
| `fetchInventarioFincasInactivas` | **nueva** — la residual que alimenta el aviso de §7.1 | no existe |
| `fetchMovimientos` | **sin `.limit(500)`** — historia confirmada completa vía `fetchAll` (B-ζ); += `grupo_id`; embed condicional por rol de `fin_transacciones_ganado` | sin hacer (línea 100) |
| `fetchPendientes` | += embed de `fin_transacciones_ganado(valor_total, cantidad_cabezas, kilos_pagados)` cuando el rol lo permite (B-2, último criterio) | sin hacer |
| `registrarTraslado` | **sin cambios** — el `grupo_id` lo pone el RPC | ✅ hecho por #124 |
| `confirmarPendiente` | **sin cambios** | ✅ hecho por #124 |
| `ajusteMasivo` | un `grupo_id` compartido (`crypto.randomUUID()`) por el lote de ajustes → "conteo físico" | sin hacer (línea 243) |
| `cargarInventarioInicial` | ídem | sin hacer (línea 238) |
| `crearLote` / `actualizarLote` / `desactivarLote` | **nuevas** — CRUD de `gan_lotes` para Configuración | no existen |
| `actualizarPotrero` | **nueva** — nombre + finca + `lote_id` + `etapa` + `activo` en un solo `UPDATE` | no existe |

**El `grupo_id` del ajuste masivo sí va del lado del cliente**, y no es una inconsistencia con el
traslado: la línea divisoria es **quién construye las filas**. El traslado las construye el RPC
(entonces el RPC pone el `grupo_id`); el ajuste masivo las construye `construirAjustesMasivos` y las
inserta el hook (entonces el hook pone el `grupo_id`). Nadie estampa un `grupo_id` sobre filas que no
construyó.

> **No convertir el ajuste masivo a RPC "por consistencia".** Sería trabajo sin beneficio: ya es
> atómico (un solo `.insert(array)` = una sentencia), no cruza RLS de otro dominio, y no tiene ningún
> total que cerrar contra Finanzas. Los dos RPC de la 097 existen por atomicidad **entre** tablas y
> por la validación contra `fin_transacciones_ganado`; nada de eso aplica acá.

**Sobre el embed condicional de `fin_transacciones_ganado` (R-4).**

```ts
const { profile } = useAuth();
// Fail closed: durante la ventana de ~2 s en que AuthContext no tiene perfil, NO se pide la plata.
const puedeVerPlata = profile?.rol === 'Gerencia' || profile?.rol === 'Administrador';
```

Si `puedeVerPlata` es falso, **el embed no se pide** y la columna no se renderiza. Pedirlo y recibir
`null` es lo que R-4 prohíbe: un Verificador vería la columna vacía, indistinguible de "no hubo
plata" — la misma lección que el `CLAUDE.md` raíz documenta para `/finanzas/reportes`. Y se falla
**cerrado**: mostrar y después esconder le enseñaría datos a alguien que quizá no puede verlos.

> **Verificar antes de confiar:** que la RLS de `fin_transacciones_ganado` incluya Administrador para
> SELECT (la 059 lo extendió, precedente 037/039). Una consulta de una línea. Si no fuera así, la
> condición se reduce a `'Gerencia'` y punto — **no** se agrega una política nueva en este alcance.

**Sobre traer la historia completa.** 49 movimientos hoy. `fetchAll` (`src/utils/supabase/fetchAll.ts`)
pagina de a 1.000 con techo de 20.000. Una sola consulta alimenta la tabla **y** el saldo, así que no
pueden discrepar por haber leído la base en momentos distintos — el mismo argumento por el que
`useReportesFinancierosData` carga una vez y sirve las 4 vistas. Los filtros de fecha/tipo/finca/lote
/etapa pasan a ser **client-side** (el de finca ya lo era). Revisar este diseño si `gan_movimientos`
supera ~5.000 filas; a ~50 movimientos/año faltan décadas.

### 6.4 `src/components/ganado/GanadoDashboard.tsx` (+ componentes nuevos)

> **#124 no tocó este archivo.** Todo lo planeado sigue en pie sin colisión.

La página pasa a ser composición; la tabla sale a su propio archivo.

- **Nuevo** `components/InventarioArbol.tsx` — el árbol ubicación → finca → lote → potrero. Fila de
  finca **legible sin desplegar** (cabezas, novillos, toros, chips por etapa, ha, cabezas/ha).
  Lotes y potreros colapsables. **Usa `src/components/ui/table.tsx`**, no un `<table>` a mano: es una
  tabla nueva, y la regla de `docs/sistema-visual.md` §3-ter dice que una tabla nueva usa el
  primitivo y una tabla que se toca a fondo migra a él. Estas dos califican por partida doble.
- **Nuevo** `components/ChipsEtapa.tsx` — el desglose por etapa en `ORDEN_ETAPAS`, con
  "Sin clasificar" siempre visible cuando es > 0.
- **Nuevo** `components/AvisoDatosGanado.tsx` — dos avisos accionables:
  «N potreros sin etapa (M cabezas)» con enlace a Configuración (A-2, tercer criterio), y
  «N cabezas en fincas inactivas — no cuentan en el total» (§7.1). Tras la 099 el segundo no debería
  aparecer nunca; si aparece, alguien desactivó una finca con ganado y tiene que enterarse.
- Filtros: los 3 actuales **+ etapa + lote**. El de potrero se alimenta del árbol filtrado.
- Columna "Peso Prom." → **"Último peso"**, con la fecha debajo; `—` si nunca hubo (A-4). Se lee de
  `ultimo_peso_kg`/`ultimo_peso_fecha`, no de `gan_inventario`.
- `cabezas/ha`: `—` en filas de lote y de potrero (A-3, tercer criterio). No es el valor heredado de
  la finca, es un guion.
- Se conservan tal cual: banner de pendientes, Ajuste masivo, Inventario inicial, KPI de variación 30
  días (ya sin traslados).

### 6.5 `src/components/ganado/GanadoMovimientos.tsx` (+ componentes nuevos)

> **#124 lo tocó apenas** (+23 líneas): agregó `fetchInventario` y un `useMemo` que arma el
> `Record<potrero_id, {novillos, toros}>` de **existencias** que los dos diálogos de reparto
> necesitan. **Conservar eso** — y ojo con la interacción con B-δ, ver §7.1.

- **Nuevo** `components/MovimientosTabla.tsx` — consume `MovimientoAgrupado[]`. Columnas:
  Fecha · Tipo · Potrero(s) · Cabezas · **Valor** (condicional por rol) · **Kilos** · **Peso del
  evento** · **Saldo** · Notas.
  - **Traslado N→M** → **una** fila. Si es 1→1, `Origen → Destino` con los dos saldos inline. Si es
    N→M, `N potreros → M potreros · C cabezas`, desplegable, con una punta por línea y su saldo. La
    fila colapsada de un N→M muestra `—` en saldo.
  - **Compra/venta repartida** (agrupada por `transaccion_ganado_id`) → una fila
    «Compra · 24 cabezas → 2 potreros», desplegable. **Es la forma nueva que trajo la 097** y es
    exactamente el caso del 17-ago que hay que poder leer de un vistazo.
  - **Conteo físico** → fila desplegable «Conteo físico · N potreros · neto ±M», con los miembros
    dentro. La fila colapsada **no muestra saldo** ni valor: `—`. No fabricar (R-5).
  - Cabezas siempre **positivas**, con la dirección en el tipo/badge: nunca `-12` (R-8).
  - Kilos y peso: `—` si son NULL. **Jamás** `peso_promedio × cabezas` (R-5).
  - **El valor $ se muestra UNA vez por evento, no por punta.** Una compra de $49.461.500 repartida
    en 2 potreros son 2 filas de `gan_movimientos` que apuntan a **una** transacción: repetir el
    valor en cada punta lo duplicaría a la vista y dejaría al dueño sumando $98M que no existen. El
    valor vive en la fila del grupo; las puntas muestran cabezas y saldo.
- **Nuevo** `components/BannerPendientes.tsx` — antigüedad en días vía `antiguedadEnDias` con
  `obtenerFechaHoy()` (**nunca** `toISOString().split('T')[0]` — lo atrapa
  `hatoFechaLocalGuard.test.ts`, que desde el barrido de agosto cubre todo `src/components/` y
  `src/utils/`). Muestra el valor $ del pendiente cuando el rol lo permite (B-2).
- **Nuevo** `components/ContadorBrechaFinanzas.tsx` — «N transacciones de finanzas sin movimiento de
  inventario» contando **solo las posteriores al lanzamiento** (§3.2 del brief). Es a la vez
  mitigación de R-B y la métrica 8.3. **No incluye las 92 históricas** (R-10): no se backfillean, y
  contarlas convertiría el indicador en un número fijo que nadie puede bajar.
- Filtros: los actuales **+ lote + etapa** (B-6, `Could` — lo último que entra, lo primero que sale).

### 6.6 `src/components/ganado/components/*` (diálogos)

> **#124 reescribió dos de los cuatro y creó uno nuevo.** El alcance de este plan sobre los diálogos
> se **reduce mucho**: casi todo lo que yo iba a construir para el reparto ya está.

**Lo que #124 ya hizo, y que este plan da por bueno:**

- **`RepartoPotreros.tsx` (nuevo, 176 líneas)** — lista editable «potrero + novillos + toros», con
  `<optgroup>` por finca, exclusión de potreros ya usados (incluido el otro lado del traslado),
  existencias por potrero y resaltado en rojo cuando se excede. **Ya trae `onWheel={… blur()}`** en
  los dos inputs numéricos y `aria-label` en todos los controles. Se reutiliza tal cual.
- **`ConfirmarPendienteDialog`** — ya usa `RepartoPotreros` + `validarRepartoConfirmacion` +
  `validarExistencias`, ya subió a `DialogContent size="lg"`, ya muestra cabezas asignadas vs total.
- **`MovimientoFormDialog`** — ya tiene los dos `RepartoPotreros` (orígenes y destinos) con totales
  en vivo, `validarTrasladoMulti`, `validarExistencias` y `size` condicional (`lg` para traslado).

**Lo que queda por hacer, que es poco:**

| Diálogo | Cambio pendiente |
|---|---|
| **`RepartoPotreros`** | Los `<optgroup>` pasan de agrupar por **finca** a agrupar por **finca › lote** (línea 111), con la etapa como sufijo del nombre del potrero. Un solo cambio, que **los dos diálogos heredan** — que es la ventaja de que #124 lo haya extraído |
| `MovimientoFormDialog` | Nada más. El `grupo_id` del traslado lo pone el RPC (§3.3), así que el diálogo **no se entera** |
| `ConfirmarPendienteDialog` | Mostrar el valor $ de la transacción cuando el rol lo permite (B-2). Nada del reparto |
| `AjusteMasivoDialog` | Filas agrupadas por finca › lote, con columna de etapa. Sigue siendo **una fila por potrero** (34): **no** se abre por etapa — ese era el costo de la opción (b) que se descartó en §3.2 |
| `InventarioInicialDialog` | Sin cambios funcionales; hereda el `grupo_id` desde el hook |

Los cinco deben seguir cumpliendo `dialogScrollContract.test.ts` (`DialogContent size=` +
`DialogBody`; si un `<form>` envuelve, `flex flex-col flex-1 min-h-0`) y
`numberInputWheelContract.test.ts` (`onWheel={(e) => e.currentTarget.blur()}` en todo input
numérico). Son guardas estáticas: si se rompen, fallan en CI, no en producción.

> **Al agrupar por lote, `RepartoPotreros` no puede perder la exclusión de potreros ocupados**
> (`ocupados(index)`, líneas 71-75) ni el `if (disponibles.length === 0) return null` que evita
> `<optgroup>` vacíos. Es lo que impide repetir un potrero en el mismo reparto — la misma condición
> que el RPC rechaza con `RAISE EXCEPTION`. Con un nivel más de anidamiento es justo el detalle que
> se pierde en un refactor apurado.

### 6.7 `src/components/configuracion/GanadoConfig.tsx`

> **#124 no tocó este archivo.** Todo lo planeado sigue en pie sin colisión.

- **Nueva `LotesSection`** entre Fincas y Potreros: CRUD de `gan_lotes` agrupado por finca, con
  desactivación (no borrado). Solo lista fincas activas al crear.
- **`PotrerosSection`**: selectores de **lote** (filtrado a los lotes de la finca elegida — cambiar
  la finca **limpia** el lote, que es lo que exige la FK compuesta) y de **etapa** (5 opciones,
  incluida "Sin etapa" = NULL). Al **crear** un potrero, pre-rellena lote y etapa con
  `derivarLoteEtapaDeNombre(nombre)` como **sugerencia visible y editable** — nunca en silencio, y
  nunca al editar uno existente.
- **`FincasSection`**: se agrega el conteo de lotes/potreros/cabezas por finca, y una **confirmación
  al desactivar una finca con cabezas** («Esta finca tiene N cabezas en M potreros; al desactivarla
  dejan de contar en el total»). Las hectáreas ya son editables — ahí se cargan los 3 números.
- **No se agrega borrado físico.** El diseño de `GanadoConfig.tsx:16` se mantiene; las 2 fincas
  huérfanas se van por la 099 (§5.2 §9).
- Etapa y lote son **visibles para todos, editables solo por Gerencia/Administrador** (A-5, tercer
  criterio). Hoy el componente no gatea nada por rol: hay que agregar el gate, alineado con la RLS
  de escritura de 044.

---

## 7. Impacto fuera del módulo (verificado con grep, no supuesto)

### 7.1 La corrección de `finca.activa` (B-δ) y su orden

`fetchInventario` filtra `.eq('activo', true)` sobre el potrero pero **no** sobre `finca.activa`, así
que Maryland y Mochuelos suman 41 cabezas al total.

**Corregirlo hoy, solo, estaría prohibido**: restaría 41 cabezas sin ningún evento que lo justifique,
violando R-9 (el inventario dejaría de ser reconstruible desde su historia). Por eso:

1. **Primero la 099.** Después de la reorganización, esas 41 cabezas viven en potreros de Escocia. La
   guarda **C6** verifica en la base que no queda ni una cabeza fuera de una finca activa.
2. **Después el filtro**, que ya no puede restar nada. C6 es literalmente la precondición que lo hace
   seguro.
3. **Y además el aviso**: `fetchInventarioFincasInactivas` + `AvisoDatosGanado` muestran cualquier
   residuo futuro con nombre y número. Nada desaparece en silencio nunca más — se descarta del total
   **visiblemente y con motivo**, que es el espíritu de R-9 y de R-1.

Ese orden es **obligatorio**. Invertirlo produce exactamente el escenario que el brief prohíbe.

**Consecuencia nueva que introdujo #124, y que hay que mirar antes de tocar el filtro.**
`GanadoMovimientos` ahora usa el resultado de `fetchInventario` para armar las **`existencias`** que
alimentan `RepartoPotreros`. O sea que `fetchInventario` dejó de ser solo la fuente de una tabla de
lectura: **es la fuente de verdad de "cuántas cabezas puedo sacar de este potrero"** en los dos
diálogos de reparto. Dos efectos, en direcciones opuestas:

- **A favor:** hoy, con B-δ vivo, un potrero de finca inactiva aparece en el selector con existencias
  — y el usuario puede sacarle cabezas. Arreglar el filtro también cierra eso.
- **En contra, y hay que decirlo:** después del filtro, un potrero cuya finca esté inactiva
  **desaparece del selector de reparto**, no solo de la tabla. Post-099 eso no puede pasar (C6 = 0
  cabezas fuera de finca activa), pero si alguien desactiva una finca con ganado, sus potreros dejan
  de ser trasladables — y el usuario no vería por qué.

**Por eso el aviso del punto 3 no es decorativo**: es lo que convierte «el potrero no aparece» en
«Escocia está inactiva y tiene 18 cabezas». Y por eso la confirmación al desactivar una finca con
cabezas (§6.7) pasa de ser un detalle de UX a ser parte de la corrección.

### 7.2 Esco — `get_ganado_inventory` (2 árboles, sincronizados a mano)

`src/supabase/functions/server/ganado-inventario.ts` y
`supabase/functions/make-server-1ccce916/ganado-inventario.ts` son **byte-idénticos hoy** (verificado
con `diff -q`). Cambios, **en ambos, en el mismo commit**:

- `buildGanadoInventorySummary`: `por_finca[].lote` (nuevo nivel `por_lote`), `potreros[].etapa`,
  `por_etapa` en total / ubicación / finca (incluyendo `sin_clasificar`).
- **`variacion_30_dias` excluye traslados** — hoy suma todos los deltas y tiene el mismo B-γ que el
  frontend. Es el mismo número que el KPI de la pantalla: si divergen, Esco y la UI le dan al dueño
  dos respuestas distintas a la misma pregunta.
- `peso_promedio_kg` por potrero → `ultimo_peso_kg` + `ultimo_peso_fecha`, leídos de
  `gan_pesos_historico` (una consulta más en el `Promise.all` de `execGanadoInventory`) — **misma
  fuente que la UI**, para que no puedan discrepar.
- `renderMovimientosRecientes`: agrupa **con el mismo contrato de §3.3 que la UI** — traslados N→M y
  conteos físicos por `grupo_id`, compras/ventas repartidas por `transaccion_ganado_id` — y expone
  `grupo_id`.

> **Esta última no es cosmética, y #124 la volvió urgente.** Hoy `renderMovimientosRecientes`
> devuelve una fila por movimiento. Después de la 097, la compra del 17-ago llega al modelo como
> **dos** entradas de 13 y 11 cabezas, sin nada que diga que son la misma compra de 24. Si alguien le
> pregunta a Esco «¿cuántas compras hice en agosto?», la respuesta correcta es **una** y el modelo
> tiene con qué decir dos. Es exactamente la clase de cifra inventada que el incidente de clima del
> 2026-08-16 dejó documentada: el modelo no miente, repite fielmente un dato mal agrupado.

`chat.tsx` (**también en los dos árboles**):
- `select=` de `gan_potreros` += `lote_id,etapa`; nueva consulta a `gan_lotes`; nueva a
  `gan_pesos_historico`.
- Descripción del tool: mencionar etapa y lote para que el modelo sepa que puede responder «cuántos
  tengo en ceba». Mantener la frase que ya distingue este tool del Hato Lechero y de
  `get_financial_summary type=ganado`.
- `src/__tests__/escoHerramientas.test.ts` lee los `case` de `executeTool` y falla si una herramienta
  ejecutable queda sin etiqueta en `src/utils/escoHerramientas.ts`. No agregamos herramientas, así
  que no debería activarse — pero si el `case` cambia de nombre, sí.

**Redeploy obligatorio** al terminar:
`npx supabase functions deploy make-server-1ccce916 --project-ref ywhtjwawnkeqlwxbvgup`
(el `--project-ref` hace falta desde un worktree: el estado del `link` vive solo en el repo
principal).

### 7.3 `TransaccionGanadoForm.tsx` — cambio visible + bug latente (B-η)

> **#124 no tocó este archivo** (verificado contra `git show 9d33fb7 --stat`), así que todo lo de
> abajo sigue vigente con las mismas líneas. Lo que sí cambió es el **contexto**: la 097 hizo que la
> confirmación del pendiente que este formulario dispara ahora se reparta entre varios potreros — o
> sea que el puente Finanzas→Inventario que este formulario abre pasó de ser una promesa a algo que
> ya se usó en producción el 17-ago. La captura de acá adelante importa más, no menos.

Lee `gan_fincas … .eq('activa', true)` para su dropdown: **pasa de 6 opciones a 3** (Escocia, Supatá,
santimp). Las transacciones históricas conservan su `finca` en texto libre, así que ningún dato se
pierde ni cambia.

**El bug**: en `TransaccionGanadoForm.tsx:191-197`, si el usuario teclea una finca nueva, el
componente busca con `.ilike('nombre', …)` **sin filtrar por `activa`** y, si no encuentra, inserta.
Hoy funciona. Después de la 099, teclear "Carrizal" encuentra la fila inactiva y **no** inserta — o
sea que el `ilike` salva por accidente. Pero teclear una variante que el `ilike` no matchee
(`"carrizal "` con espacio, por ejemplo) sí intenta insertar y **viola
`gan_fincas_nombre_unique ON lower(nombre)`**, con un error crudo de Postgres en la cara del usuario.

**Corrección requerida** (chica, en este alcance): normalizar con `trim()` en la búsqueda **y**
manejar el caso "existe pero inactiva" con un mensaje explícito
(«La finca "Carrizal" existe pero está inactiva; reactivala desde Configuración → Ganado»), en vez de
insertar a ciegas. **No** reactivarla automáticamente: la desactivación fue una decisión del dueño y
un formulario de captura no la revierte sola.

### 7.4 `InventarioGanadoKPIs.tsx` (dashboard de Finanzas)

Consume `useGanadoInventario` + `calcularKPIsInventario`. Sigue compilando (los campos son
aditivos) y **hereda la corrección de B-δ**: sus 4 tarjetas pasan a mostrar el mismo total que
`/ganado`, que es el punto.

**Observación, fuera de alcance pero anotada:** su `catch { setKpis(null) }` (línea 26) traga
cualquier error y hace desaparecer la franja entera sin decir nada. El comentario dice que es por si
la migración 044 no está aplicada — ya lo está desde 2026-06-10. Si alguien la toca por otro motivo,
que la deje distinguiendo "módulo no desplegado" de "la consulta falló". **No** entra en esta
iteración.

---

## 8. Plan de pruebas

### 8.1 Lógica pura — `src/__tests__/calculosGanado.test.ts`

> **#124 lo llevó de 209 a 297 líneas: 11 `describe`, 26 `it`.** Se mantienen todos.

**Lo que #124 ya cubre, y que este plan NO vuelve a escribir:**

| `describe` de #124 | Cubre |
|---|---|
| `filasConCabezas / totalCabezasReparto` | filas vacías del formulario se ignoran |
| `validarRepartoConfirmacion` (7 `it`) | un potrero, varios potreros, suma que no cierra, potrero repetido, fila con cabezas y sin potrero, negativos y no enteros, reparto vacío |
| `validarExistencias` (3 `it`) | salida dentro de existencias, sacar de más nombrando el potrero, potrero sin inventario = cero |
| `validarTrasladoMulti` (4 `it`) | 1 origen → 2 destinos que cierra por categoría, sacar novillos y meter toros, mismo potrero en los dos lados, un lado vacío |

Eso **cubre por completo** la validación del reparto N→M. Mi caso original sobre
`validarSplitConfirmacion` **queda anulado**: esa función ya no existe.

**Dos `describe` que hay que ajustar, no reescribir:**

- `calcularVariacion` — el fixture actual no tiene traslados; se le agregan (PU-9).
- `construirAjustesMasivos` — la firma gana `grupoId` (PU-17).

**Casos a agregar:**

| # | Caso | Qué prueba |
|---|---|---|
| PU-1 | `derivarLoteEtapaDeNombre`: `"Sierra Morena Ceba"` → `{Sierra Morena, ceba}` | Patrón `<Lote> <Etapa>` |
| PU-2 | `"Terneros Cedral"` → `{Cedral, terneros}`, `"Terneros Maryland"` → `{Maryland, terneros}` | Patrón `<Etapa> <Lote>` |
| PU-3 | `"Bosque"` → `{Bosque, null}`; `"Peña Blanca"` → `{Peña Blanca, null}` | Sin etapa; y que la función **no** conoce la excepción Carrizal |
| PU-4 | `"ANDALUCÍA CEBA"`, `"andalucia  ceba"` → misma etapa; el `lote` conserva el original | Plegado de acentos/caso solo para comparar |
| PU-5 | `construirArbolInventario`: finca = Σ lotes = Σ potreros, en un fixture de 3 fincas × 2 lotes | Los totales de A-1 cierran |
| PU-6 | Una finca con 0 cabezas aparece igual, con 0 | A-1, cuarto criterio (aquí el 0 **es** el dato) |
| PU-7 | `cabezasPorHa` es `null` en lote y potrero, y numérico en finca | A-3, tercer criterio |
| PU-8 | `resumirEtapas`: Σ buckets = total; 4 potreros sin etapa → 56 en `sin_clasificar` | A-2, segundo criterio: nunca reparte |
| PU-9 | **`calcularVariacion` excluye traslados** — fixture con las 11 parejas del 2026-07-02 → entradas 0, salidas 0 | B-γ, regresión con datos reales |
| PU-10 | `agruparMovimientos`, **traslados**: 1→1 → 1 fila; **3→2 con el mismo `grupo_id` que cierra por categoría → 1 fila con 3 orígenes y 2 destinos**; un grupo que **no** cierra → todas sus filas sueltas; grupo con solo salidas → sueltas; `grupo_id` NULL → fila suelta | El contrato de §3.3 para N→M — **es la prueba de R-2** |
| PU-10b | `agruparMovimientos`, **compra/venta**: 2 filas `compra` con el mismo `transaccion_ganado_id` → 1 fila con 2 puntas; **fixture real del 17-ago (24 cabezas = 13 + 11)**; `transaccion_ganado_id` NULL → sueltas; una `compra` y una `venta` con la misma transacción (imposible, pero) → sueltas | La forma nueva que trajo la 097, y que agrupa por una clave distinta |
| PU-10c | `agruparMovimientos`, **conteo físico**: 21 ajustes con el mismo `grupo_id` → 1 grupo con 21 miembros; grupo de 1 ajuste → fila normal; `grupo_id` compartido entre un `ajuste` y un `traslado_salida` → **sueltas** (nunca se mezclan familias) | Decisión 6 y la degradación segura |
| PU-11 | `calcularSaldosPorPotrero`: el saldo de la última fila == snapshot; **calcular sobre la historia completa y filtrar después da los mismos números que sin filtrar** | R-6, el criterio que dice "el saldo no cambia con los filtros" |
| PU-12 | Un potrero cuyo Σ deltas ≠ snapshot → todos sus saldos `null` | B-4, último criterio: nunca un saldo aproximado |
| PU-13 | Un traslado 1→1 expone **dos** saldos inline; **un traslado 3→2 expone 5 saldos, uno por punta, y `null` en la fila colapsada** | B-4 segundo criterio, adaptado a N→M |
| PU-14 | **Fixture "Bosque" completo y real**: compra 19 (6-ago) → 19; ajuste +19 (15-ago) → 38; ajuste −19 (17-ago) → 19, que cierra contra el snapshot actual | La traza que el dueño va a mirar, incluida su corrección |
| PU-15 | `cabezasFueraDeFincaActiva` con fincas inactivas con cabezas → total y desglose por finca | §7.1 |
| PU-16 | `antiguedadEnDias('2026-08-05','2026-08-17')` → 12, con reloj fijo | B-5 |
| PU-17 | `construirAjustesMasivos` y `construirMovimientosCargaInicial` propagan el `grupoId` inyectado a **todas** las filas | Que el agrupamiento no dependa de que alguien se acuerde. **`construirMovimientosTraslado` NO está en la lista: ya no existe** (§6.2) |

### 8.2 Paridad de los árboles de edge function

- Extender `src/__tests__/ganadoInventarioEsco.test.ts`: etapa, lote, `por_etapa`, exclusión de
  traslados en `variacion_30_dias`, `ultimo_peso_kg`, y **el agrupamiento de
  `renderMovimientosRecientes`** con el fixture de la compra repartida del 17-ago (2 filas → 1
  evento). El test ya importa de `../supabase/functions/server/ganado-inventario`, así que el fixture
  es el mismo de PU-10b portado.
- **Agregar una guarda de paridad byte a byte** entre
  `src/supabase/functions/server/ganado-inventario.ts` y
  `supabase/functions/make-server-1ccce916/ganado-inventario.ts` (`readFileSync` ambos, `toBe`). Hoy
  son idénticos pero **nada lo verifica** — el test existente solo comprueba que `chat.tsx` mencione
  el tool en las dos copias. Es el patrón de `importHatoParidadServidor.test.ts` y cuesta 5 líneas.
  Es más barato y más estricto que un test de paridad de comportamiento, porque los dos archivos son
  copias, no ports (a diferencia de `reportes-financieros.ts`, que sí es un port y por eso necesita
  paridad **de resultados**).

### 8.3 Guardas estáticas existentes que van a intervenir

`dialogScrollContract.test.ts` · `numberInputWheelContract.test.ts` · `hatoFechaLocalGuard.test.ts`
(cubre todo `src/components/` y `src/utils/`: cualquier `toISOString().split('T')[0]` o `.slice(0,10)`
en el código nuevo falla) · `escoHerramientas.test.ts` · `uiTableCanonico.test.tsx` (no gatea
consumidores, pero §3-ter del sistema visual sí exige el primitivo en tablas nuevas).

### 8.4 Verificación manual (lo que ningún test puede probar)

Contra producción, después de aplicar cada migración:

| # | Verificación | Fase |
|---|---|---|
| VM-1 | Total en `/ganado` = **369**, igual que antes de la 099 | tras 099 |
| VM-2 | Escocia despliega 20 potreros que suman **238**; Supatá 8 / **64**; santimp 6 / **67** | tras 099 |
| VM-3 | Los selectores de finca (Inventario, Movimientos, Configuración, **y `TransaccionGanadoForm`**) muestran 3 fincas, sin las basura | tras 099 |
| VM-4 | El 2026-07-02 muestra **11 filas**, y cada una nombra origen y destino correctos contra el respaldo 100 | tras 100 |
| VM-5 | El conteo del 15-ago aparece como **un** "Conteo físico" desplegable con sus miembros | tras 100 + F4 |
| VM-6 | **Bosque**: la columna saldo muestra 0 → 19 (compra 6-ago) → 38 (conteo 15-ago) → 19 (corrección 17-ago), y el último saldo coincide con el inventario | tras F4 |
| VM-7 | Sesión de **Verificador**: la columna $ **no está en el DOM**, no está vacía | tras F4 |
| VM-8 | Cargar hectáreas de las 3 fincas activas → cabezas/ha deja de mostrar "—" en finca y ubicación, y **sigue** en "—" en lote y potrero | tras F4 |
| VM-9 | Cambiar la etapa de un potrero en Configuración → sus cabezas cambian de bucket en `/ganado` **sin** crear ningún `gan_movimientos` (A-5) | tras F4 |
| VM-10 | **Registrar un traslado 2→1 desde la app** → las 3 filas comparten `grupo_id` (verificar en SQL) y la pantalla muestra **una** fila. **Es la única verificación posible de que el `CREATE OR REPLACE` de la 098 funcionó** — el cuerpo del RPC es PL/pgSQL y ningún test de Vitest lo alcanza | tras 098 + F4 |
| VM-10b | Forzar un traslado que deja un potrero en negativo → **ninguna** fila queda escrita (el RPC aborta entero). Confirma que el `CREATE OR REPLACE` no rompió el orden salidas-antes-que-entradas | tras 098 |
| VM-10c | **Confirmar una compra repartida en 2 potreros** → 2 filas con el mismo `transaccion_ganado_id`, **`grupo_id` NULL en ambas**, y **una** fila en pantalla con el valor $ mostrado **una sola vez** | tras 098 + F4 |
| VM-11 | Viewport móvil: sidebar colapsado, el árbol scrollea, el cuerpo no queda debajo del sidebar | tras F4 |
| VM-12 | Esco: «¿cuántas cabezas tengo en ceba?» y «¿cuántas en Supatá?» responden con las cifras de la pantalla | tras F5 + deploy |
| VM-13 | Franja de inventario en `/finanzas/dashboard`: mismo total que `/ganado` | tras F5 |
| VM-14 | `RepartoPotreros` agrupa por **finca › lote** en los dos diálogos, y **sigue** sin ofrecer un potrero ya usado en otra fila ni en el otro lado del traslado | tras F4 |

> **El punto ciego del plan de pruebas, dicho en voz alta.** El `grupo_id` de los traslados lo escribe
> PL/pgSQL dentro de un RPC, y este repo **no tiene forma de correr pgTAP ni un Postgres de prueba en
> CI**: los tests son Vitest y mockean Supabase. O sea que la parte más delicada de la 098 —que el
> `CREATE OR REPLACE` reproduzca el cuerpo de la 097 sin perder una validación— **no la cubre ningún
> test automático**. Se cubre con tres cosas y hay que hacer las tres: las guardas de cierre de la 098
> (§5.1 punto 9), un `diff` manual del cuerpo viejo contra el nuevo antes de aplicar, y VM-10/VM-10b.

---

## 9. Fases, secuencia y paralelismo

```
F0  Mapeo (Apéndice A)  ──────┐
                              ▼
F1  098 ─────► 099 ─────► 100           (100 es técnicamente independiente de 099;
     │                                    se aplica después por orden numérico)
     │
     ├──► F2  Tipos + calculosGanado + tests        (puro: puede empezar con 098 solo escrita)
     │         │
     │         ▼
     └──► F3  useGanadoInventario                    (necesita 098 APLICADA)
               │
       ┌───────┼───────────────┬──────────────────┐
       ▼       ▼               ▼                  ▼
   F4a Inventario   F4b Movimientos   F4c Configuración      F5 Fuera del módulo
   (necesita 099)   (necesita 100
                     para VM-4)                              (Esco ×2 árboles,
                                                              TransaccionGanadoForm)
       └───────┴───────────────┴──────────────────┴──────────┘
                              ▼
                      F6  QA + deploy + cierre
```

| Fase | Entregable | Complejidad | Depende de | Paralelizable |
|---|---|---|---|---|
| **F0** | Apéndice A completo: 34 filas `(finca, potrero, lote, etapa)` + lista blanca de "sin lote" + conteos por etapa. Generado con `derivarLoteEtapaDeNombre`, revisado a mano, excepciones del dueño aplicadas | **S** | § 1.5 | — |
| **F1a** | `098_ganado_lotes_y_etapa.sql` escrita, aplicada, verificada contra el catálogo vivo. **Incluye el `CREATE OR REPLACE` de `fn_ganado_registrar_traslado_multi`** (§5.1 punto 8) — es lo que la sube de S a **M** | **M** | — | ∥ F0 |
| **F1b** | `099_ganado_reorganizacion_fincas.sql` | **L** | F0, F1a | no |
| **F1c** | `100_ganado_grupos_historicos.sql` (precedida por la consulta de pre-verificación de §5.4, que decide qué poblaciones existen) | **M** | **F1a aplicada** (necesita la columna `grupo_id`) | ∥ F1b |
| **F2** | `types/ganado.ts` + `calculosGanado.ts` + PU-1…PU-17 (incl. PU-10b y PU-10c) en verde | **L** | DDL de 098 acordado | ∥ F1b/F1c |
| **F3** | `useGanadoInventario.ts` completo | **M** | F1a aplicada, F2 | no (lo consumen las 3 pantallas) |
| **F4a** | Página Inventario + `InventarioArbol` + `ChipsEtapa` + `AvisoDatosGanado` | **L** | F3, F1b | ∥ F4b, F4c |
| **F4b** | Página Movimientos + `MovimientosTabla` + `BannerPendientes` + `ContadorBrechaFinanzas` | **L** | F3 (F1c para VM-4) | ∥ F4a, F4c |
| **F4c** | `GanadoConfig`: `LotesSection`, etapa/lote en potreros, gate por rol, aviso al desactivar | **M** | F3 | ∥ F4a, F4b |
| **F5** | Edge functions ×2 árboles + `chat.tsx` ×2 + tests de paridad + `TransaccionGanadoForm` (B-η) | **M** | F2 | ∥ F4 |
| **F6** | QA (VM-1…VM-14), `npm run lint`, deploy del edge function, actualizar `CLAUDE.md` raíz | **S** | todo | — |

**Hitos:**

- **M0 — Mapeo aprobado.** Las 34 filas del Apéndice A revisadas y los conteos por etapa cuadran con
  el "56 cabezas sin clasificar" que el dueño ya conoce. *Sin M0 no se escribe la 099.*
- **M1 — Esquema en producción.** 098/099/100 aplicadas y verificadas contra el catálogo vivo; C1–C11
  en verde; VM-1 a VM-4, VM-10 y VM-10b.
- **M2 — Lógica pura verde.** PU-1…PU-17 (incl. PU-10b y PU-10c) pasan; `npm test` completo sin regresiones.
- **M3 — Dos pantallas usables.** A-1…A-5 y B-1…B-5 demostrables contra producción.
- **M4 — Consumidores al día.** Esco desplegado y respondiendo por etapa (VM-12); franja de finanzas
  cuadrada (VM-13).
- **M5 — Entregado.** VM-1…VM-14 en verde, lint limpio, `CLAUDE.md` actualizado.

**Preguntas que hay que cerrar antes de cada fase:**

| Antes de | Pregunta | Quién |
|---|---|---|
| F0 | ¿Bosque, Quebradas, Colinas y Los Olivos son cada uno su propio lote, o van sin lote? (la regla de derivación asume "cada uno su propio lote") | Dueño — 1 chip |
| F1a | ¿Se registró algún traslado desde el 2026-08-17? Cada uno que entre **antes** de la 098 engorda la población P2 | Consulta, no pregunta |
| F1b | ¿Los conteos de §1 siguen vigentes el día de aplicar? | Consulta, no pregunta |
| F1c | ¿Los 22 `created_at` del 2026-07-02 son todos distintos, y hay filas en P2 y P3? | La consulta de §5.4 |
| F1c | ¿Se agrupan también los ajustes masivos históricos (P3), o solo los traslados? | **Dueño o QA — 1 chip.** La regla es igualmente determinista; es una decisión de alcance, y P3 está escrita para poder borrarse sin tocar el resto |
| F4a | Hectáreas de Escocia, Supatá y santimp (3 números) | Dueño — **no bloquea**: sin ellas el KPI muestra "—", que es correcto |
| F5 | ¿La RLS de `fin_transacciones_ganado` da SELECT a Administrador? (059) | Consulta, no pregunta |

---

## 10. Riesgos y rollback

| # | Riesgo | Prob. | Impacto | Mitigación |
|---|---|---|---|---|
| **T-1** | La 099 aborta a mitad y deja la reorganización parcial | Baja | Alto | El archivo se corre **completo, de una vez** = una transacción; cualquier `RAISE EXCEPTION` deshace todo. Es el patrón de 075/080/081, y el incidente de SQL ad-hoc del 2026-07-23 es la razón de que exista |
| **T-2** | Los conteos de producción cambiaron entre hoy y la aplicación | **Baja** — bajó: **ya no hay pendientes vivos** (el de 24 cabezas se confirmó el 17-ago) y el único capturador es Santiago | Medio | Las guardas previas abortan. **Es el diseño**: un humano revisa qué cambió y actualiza los conteos con evidencia |
| **T-3** | El Apéndice A tiene una etapa mal y el desglose miente en silencio | Media | Alto | Lista literal auditable (no regex en SQL) + guardas C9/C10 que cuentan la distribución + VM-2. Además el error es **barato de corregir**: cambiar la etapa de un potrero es un `UPDATE` desde Configuración, sin movimientos |
| **T-4** | La 100 agrupa mal y muestra un evento que nunca ocurrió | **Baja** (por diseño) | Alto — dato falso | Tres poblaciones con tres reglas, cada una anclada en la forma transaccional del código que escribió la fila (§5.4). P1: 6 condiciones por par + los 22 `created_at` distintos. P2/P3: `created_at` idéntico = misma transacción, más cierre por categoría (P2) o `fecha`+`notas` idénticas (P3). Si algo no cuadra: aborta y quedan filas sueltas. **Y no se reintenta con una regla más laxa** |
| **T-4b** | El `CREATE OR REPLACE` de la 098 pierde una validación del RPC de la 097 y rompe el traslado en producción | **Media** — es copiar un cuerpo de 100 líneas a mano | **Alto** | Es el mayor riesgo nuevo que introduce este plan, y **ningún test de Vitest lo alcanza** (§8.4). Tres capas: guardas de cierre de la 098 sobre `prosecdef`/`search_path`/grants, `diff` manual del cuerpo antes de aplicar, y VM-10 + VM-10b contra producción inmediatamente después. Si algo falla, el ROLLBACK es un `CREATE OR REPLACE` con el cuerpo de la 097, que está en el repo sin ambigüedad |
| **T-4c** | Alguien registra traslados entre la 097 y la 098 y quedan sin agrupar (población P2) | Baja | Bajo | La 100 los agrupa con la regla de transacción. Y el `CREATE OR REPLACE` está en la 098 y no en la 099 justamente para que esa ventana sea lo más corta posible (§3.3) |
| **T-5** | Colisión de numeración de migración (ya pasó 4 veces) | Media | Bajo | `ls src/sql/migrations/ \| tail -5` inmediatamente antes de crear el archivo; reconciliar contra el catálogo vivo, no contra `list_migrations` |
| **T-6** | Los dos árboles de edge function se desincronizan | **Media** — es un riesgo estructural del repo | Medio | Guarda de paridad byte a byte (§8.2). Hoy **nada** lo verifica |
| **T-7** | Se corrige B-δ antes de la 099 y el total cae 41 cabezas sin evento | Baja | Alto | Orden obligatorio de §7.1; C6 es la precondición verificada en base |
| **T-8** | El saldo expone descuadres y se lee como "el sistema está mal" | **Baja** — bajó: el descuadre más visible (Bosque) **ya se corrigió** el 17-ago, y la traza queda como ejemplo de una corrección bien hecha, no de un error abierto | Medio | Es el objetivo, no un efecto colateral (R-C). Las filas de `ajuste` se etiquetan como correcciones y la columna se titula «saldo según el sistema» |
| **T-9** | `TransaccionGanadoForm` revienta con el unique de `gan_fincas` tras la reorganización | Media | Bajo | §7.3, incluido en F5 |
| **T-10** | La etapa se congela porque nadie registra traslados y el desglose miente en silencio | Media | Medio | R-D del brief: métrica 8.5 la vigila; en Inventario se muestra la fecha del último movimiento del potrero para que un potrero estancado sea visible |
| **T-11** | Al dueño le importa el peso y descubre que casi no hay datos | Alta | Bajo | R-G: es información correcta reemplazando información engañosa. Decírselo al presentar, no dejar que lo descubra en pantalla |

**Rollback, por capas** (cada una independiente de las otras):

1. **100** → `UPDATE gan_movimientos SET grupo_id = NULL WHERE id IN (SELECT id FROM respaldos.backup_100_gan_movimientos_grupos)`. La UI vuelve a filas sueltas, que es el estado de hoy.
2. **099** → el bloque documentado al pie (§5.2). Restaura `finca_id`/`activo`/`lote_id`/`etapa` de los 34 potreros, borra los lotes sembrados, reactiva las 4 fincas, re-inserta las 2 borradas **con su id original**, borra Supatá. **Ningún animal se movió**, así que el rollback tampoco mueve ninguno.
3. **098** → `CREATE OR REPLACE` de `fn_ganado_registrar_traslado_multi` con el cuerpo de la 097, y `DROP` de índices, FK, 3 columnas y tabla. Sin pérdida de datos (revertir 099 y 100 primero). **Este es el único rollback que toca una función viva**: hacerlo mal deja el traslado roto, así que se verifica con VM-10 igual que la ida.
4. **Frontend** → revertir el commit. Las columnas nuevas quedan en la base sin lectores, lo cual es inerte.

**Las tres capas son independientes**: se puede revertir la 100 sin tocar la 099, y la 099 sin tocar
la 098. Eso fue un criterio de diseño al partir las migraciones, no una casualidad.

Los respaldos de 099 y 100 **se dejan en `respaldos`** (igual que `backup_075_*`, `backup_080_*`), y
se borran solo cuando el dueño confirme que las dos pantallas se ven bien.

---

## 11. Qué NO entra en esta iteración

Cada línea es una decisión, no un olvido:

| Fuera | Por qué |
|---|---|
| Trazabilidad por animal individual | No hay `gan_animales` ni la va a haber acá. El módulo cuenta cabezas por potrero |
| **Historia de la etapa** | Consecuencia aceptada del modelo (R-3). Un movimiento de marzo se lee con la etapa de hoy. «Cuántas cabezas tenía en ceba en marzo» es **falso** bajo este modelo y está **prohibido construirlo**. Si el dueño lo pide, esa es la señal para reconsiderar la opción (b) de §7 del brief |
| UI de captura de pesajes (`gan_pesos_historico`) | Sin UI desde 044. Acá solo se **lee**. Iteración aparte |
| Editar o borrar movimientos confirmados | El log es append-only por diseño; la corrección es un `ajuste` compensatorio |
| Registrar compra/venta desde `/ganado` | Deliberado: la plata nace en Finanzas y baja por el trigger. Un segundo punto de entrada reabre el doble conteo que la 044 cerró |
| Backfill de las 92 transacciones históricas sin movimiento | R-10. Crearía movimientos fantasma contra potreros que nadie puede asignar, y **doble conteo** con la carga inicial |
| Telegram / diseño mobile-first para captura | Decisión 8: solo Santiago hoy, escritorio |
| Renombrar "Potrero" a "Lote" en el nivel más bajo | Decisión 9: se llama Potrero, y ahora hay un "Lote" **encima** |
| Costo o rentabilidad por potrero | Vive en `/finanzas/reportes` con el promedio móvil por cabeza de `costoVentaGanado.ts`. Duplicarlo produciría dos cifras de utilidad distintas |
| Hectáreas por potrero o por lote | Decisión 7: solo por finca |
| **Tocar la traza histórica de Bosque** | Ya se corrigió con ajustes el 17-ago, como corresponde. El log es append-only: la secuencia 0 → 19 → 38 → 19 **se conserva entera** y se muestra tal cual. No se "limpia" |
| Convertir `ajusteMasivo` o `cargarInventarioInicial` a RPC "por consistencia" con la 097 | §6.3: ya son atómicos, no cruzan RLS de otro dominio y no tienen nada que cerrar contra Finanzas. Los dos RPC de la 097 existen por razones que acá no aplican |
| Estampar `grupo_id` en las compras/ventas repartidas | §3.3: ya agrupan por `transaccion_ganado_id`. Una segunda clave para el mismo hecho es una clave que se desincroniza |
| Tocar `fn_gan_validar_cabezas_transaccion` o `fn_ganado_confirmar_pendiente_multi` (097) | §3.5. Están bien y son recientes. Solo se reemplaza el cuerpo de `fn_ganado_registrar_traslado_multi`, y solo para el `grupo_id` |
| Volver a tener una función TS que construya las filas del traslado | #124 la eliminó a propósito para no tener dos implementaciones del mismo reparto (`calculosGanado.ts:219-222`). Tiene razón |
| Borrar físicamente Macondo o las 4 fincas desactivadas | Tienen (o tuvieron) potreros y movimientos. Desactivar es el camino correcto |
| Renombrar `gan_inventario.peso_promedio_kg` | §3.4: se deja de leer, se comenta, no se renombra |
| Renombrar la finca `santimp` | «Dejalo así por ahora» |
| Colapsar el nivel `ubicación` | «Dejalo así, no pasa nada» |
| Exportar CSV / PDF | *Could* sin demanda expresada |
| Quitar los grants redundantes de `anon` sobre las **otras** 6 tablas `gan_*` | Higiene al estilo 082, pero es una migración aparte con su propia verificación. La 098 solo lo hace para `gan_lotes`, que es nueva |
| Arreglar el `catch` silencioso de `InventarioGanadoKPIs` | §7.4. Anotado, no incluido |

---

## Apéndice A — Mapeo de los 34 potreros *(COMPLETO — 2026-08-17)*

> El Paso 4 quedó lleno con el volcado real de producción y las cuatro excepciones del dueño ya
> aplicadas. Lo que sigue pendiente de F0 no es el mapeo sino su **cotejo humano**: abrir la tabla
> al lado de la pantalla y confirmar potrero por potrero antes de correr la 099.

**Paso 1 — Volcar el estado real:**

```sql
SELECT f.nombre AS finca, p.nombre AS potrero, p.activo,
       COALESCE(i.novillos,0) + COALESCE(i.toros,0) AS cabezas
FROM gan_potreros p
JOIN gan_fincas f ON f.id = p.finca_id
LEFT JOIN gan_inventario i ON i.potrero_id = p.id
ORDER BY f.nombre, p.nombre;
```

**Paso 2 — Correr `derivarLoteEtapaDeNombre` sobre los 34 nombres** (una vez que F2 la tenga con sus
tests en verde) y volcar el resultado en la tabla de abajo.

**Paso 3 — Revisión humana**, aplicando encima:

| Excepción | Confirmada por |
|---|---|
| `Peña Blanca` → lote **Carrizal**, etapa **ceba** | Dueño, 2026-08-17 |
| `Peña Blanca Repele` → lote **Carrizal** (la derivación daría lote "Peña Blanca") | Dueño, 2026-08-17 |
| Los 4 `General` → `lote_id = NULL`, `etapa = NULL`, `activo = false` | Dueño (todos en 0) |
| `Bosque`, `Quebradas`, `Colinas`, `Los Olivos` → **etapa NULL** (56 cabezas) | Dueño, 2026-08-17 |

**Paso 4 — Completar y aprobar:**

Mapeo derivado del volcado real de producción del 2026-08-17, con las excepciones del Paso 3 ya
aplicadas encima. Los nombres de potrero están **literales como están en la base** (incluidas las
minúsculas de "Escocia ceba" y la falta de tilde en "Andalucia Repele"): la 099 los busca por
`id`, no por nombre, pero quien revise esta tabla la coteja contra la pantalla.

| # | Finca actual | Potrero | Finca destino | Lote | Etapa | Cabezas | Nota |
|---|---|---|---|---|---|---|---|
| 1 | Escocia | Bosque | Escocia | Bosque | — | 19 | Sin etapa en el nombre |
| 2 | Escocia | Escocia ceba | Escocia | Escocia | ceba | 12 | |
| 3 | Escocia | Escocia repele | Escocia | Escocia | repele | 10 | |
| 4 | Escocia | General | Escocia | — | — | 0 | `activo = false` |
| 5 | Escocia | La Molina Ceba | Escocia | La Molina | ceba | 11 | |
| 6 | Escocia | La Molina Repele | Escocia | La Molina | repele | 8 | |
| 7 | Escocia | Normandía Ceba | Escocia | Normandía | ceba | 10 | |
| 8 | Escocia | Normandía Repele | Escocia | Normandía | repele | 8 | |
| 9 | Escocia | Piedra Gorda Ceba | Escocia | Piedra Gorda | ceba | 11 | |
| 10 | Escocia | Piedra Gorda Repele | Escocia | Piedra Gorda | repele | 8 | |
| 11 | Escocia | Quebradas | Escocia | Quebradas | — | 13 | Sin etapa en el nombre |
| 12 | Escocia | Sierra Morena Ceba | Escocia | Sierra Morena | ceba | 10 | |
| 13 | Escocia | Sierra Morena Repele | Escocia | Sierra Morena | repele | 8 | |
| 14 | Escocia | Terneros Cedral | Escocia | Cedral | terneros | 23 | Patrón invertido `<Etapa> <Lote>` |
| 15 | Escocia | Terneros Pedregal | Escocia | Pedregal | terneros | 12 | Patrón invertido |
| 16 | Escocia | Terneros Rancho | Escocia | Rancho | terneros | 15 | Patrón invertido |
| 17 | Escocia | Terneros San Juan | Escocia | San Juan | terneros | 19 | Patrón invertido |
| 18 | **Maryland** | Terneros Maryland | Escocia | Maryland | terneros | 18 | Finca → lote |
| 19 | **Mochuelos** | Mochuelos Ceba | Escocia | Mochuelos | ceba | 12 | Finca → lote |
| 20 | **Mochuelos** | Mochuelos Repele | Escocia | Mochuelos | repele | 11 | Finca → lote |
| 21 | **Carrizal** | La Joya Ceba | Supatá | La Joya | ceba | 13 | Finca → lote |
| 22 | **Carrizal** | La Joya Repele | Supatá | La Joya | repele | 11 | Finca → lote |
| 23 | **Carrizal** | Peña Blanca | Supatá | Carrizal | ceba | 12 | Excepción del dueño |
| 24 | **Carrizal** | Peña Blanca Repele | Supatá | Carrizal | repele | 9 | Excepción del dueño |
| 25 | **Carrizal** | General | Supatá | — | — | 0 | **Renombrar** (ver colisión) · `activo = false` |
| 26 | **Andalucia** | Andalucía Ceba | Supatá | Andalucía | ceba | 12 | Finca → lote |
| 27 | **Andalucia** | Andalucia Repele | Supatá | Andalucía | repele | 7 | Finca → lote |
| 28 | **Andalucia** | General | Supatá | — | — | 0 | **Renombrar** (ver colisión) · `activo = false` |
| 29 | santimp | Colinas | santimp | Colinas | — | 12 | Sin etapa en el nombre |
| 30 | santimp | Cortijo Ceba | santimp | Cortijo | ceba | 12 | |
| 31 | santimp | Cortijo Repele | santimp | Cortijo | repele | 11 | |
| 32 | santimp | Encantado Levante | santimp | Encantado | levante | 20 | |
| 33 | santimp | General | santimp | — | — | 0 | `activo = false` |
| 34 | santimp | Los Olivos | santimp | Los Olivos | — | 12 | Sin etapa en el nombre |

**Colisión de nombre que la 099 tiene que resolver antes del `UPDATE`.** Carrizal y Andalucía
tienen cada una un potrero llamado `General` (filas 25 y 28) y ambas van a la misma finca destino.
`gan_potreros_finca_id_nombre_key` — verificado en producción, es un índice único sobre
`(finca_id, nombre)`, no una constraint, por eso no aparece en `pg_constraint` — rechaza el segundo
`UPDATE`. **`activo = false` no exime del índice único.** La 099 renombra ambos a
`General (Carrizal)` y `General (Andalucía)` **antes** de reasignarlos, en la misma transacción.
Es el único renombre de potrero de toda la migración y no toca ningún `id`, así que ni el
inventario ni los movimientos lo notan.

**Totales que la tabla arroja, y que las guardas C5/C9/C10 verifican en base:**

- Escocia **20** potreros / **238** cabezas · Supatá **8** / **64** · santimp **6** / **67** → **369**
- **20** lotes distintos — no ~24 como estimaba §0: Escocia 13, Supatá 3, santimp 4
- 4 potreros sin etapa con **56** cabezas (Bosque 19, Quebradas 13, Colinas 12, Los Olivos 12)
- 4 potreros `General` inactivos con **0** cabezas, 2 de ellos renombrados
- Lista blanca de potreros activos **sin lote**: **vacía**. Los 30 potreros activos tienen lote; los
  4 sin lote son exactamente los 4 `General`, y quedan inactivos. Si la guarda encuentra un potrero
  activo sin lote, algo salió mal y la migración aborta.

---

*Documento de implementación. El contrato funcional (historias, reglas de visualización, métricas)
es el del CPO en `docs/plan_ganado_inventario_v2.md`; este documento decide el **cómo** y supera su
§3 y su §7 donde contradigan las decisiones cerradas de §1.*
