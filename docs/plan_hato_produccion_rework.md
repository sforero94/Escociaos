# Brief técnico — Rework del submódulo Producción (Hato Lechero)

**Ruta:** `/hato-lechero/produccion` · **Estado:** aprobación de diseño (pre-implementación) · **Fecha:** 2026-07-28
**Autor:** CTO · **Contratos vinculantes leídos:** `CLAUDE.md` (raíz), `src/components/hato/CLAUDE.md`, `src/components/finanzas/CLAUDE.md`

Este documento es **el contrato** que siguen los agentes implementadores. Ninguna decisión de negocio aquí es reabrible: todas vienen del dueño. Lo que sí es mío (y por tanto discutible con argumentos técnicos) es el *cómo*: DDL, camino de escritura, ubicación de la lógica pura, secuenciación.

---

## 0. Decisiones del dueño — CERRADAS

Se transcriben para que ningún implementador tenga que ir a buscarlas.

**Grano y vínculo financiero**
1. La finca factura la leche **quincenalmente** al Pomar. Las 44 filas históricas de `fin_ingresos` son **mensuales** porque quien cargó 2023–2026 las consolidó. La historia mensual **no es autoritativa a nivel de quincena**.
2. Hacia adelante: quincenal punta a punta. `hato_produccion_quincenal` (hoy **0 filas**) es el registro del lado Producción.
3. **Vínculo duro bidireccional, un solo registro**: crear/editar una entrada quincenal escribe/actualiza la fila de `fin_ingresos` correspondiente, y viceversa. Sin divergencia. **Transaccional.**
4. **Backfill**: partir cada una de las 44 filas mensuales en dos quincenas. El vínculo 1:1 duro aplica **solo hacia adelante**; las quincenas del backfill quedan marcadas como *derivadas de mensual*, enlazan **muchos-a-uno** al ingreso mensual intacto y son **read-only** en la UI. `fin_ingresos` histórico **nunca se reescribe** (lo leen los motores de P&G y Flujo de Caja).
5. **La captura es Gerencia-only.** **Cero cambios de RLS en `fin_ingresos`.** Administrador (Martha) sigue haciendo solo pesajes, y debe ver un estado sensato — no un crash ni un blanco silencioso.
6. **Ventas de terneros: vínculo de animal opcional.** Cabezas + valor obligatorios; escoger `hato_animales` específicas es opcional. Cuando se enlaza: `hato_eventos` tipo `venta` + `hato_animales.estado='vendida'`.
7. **Las 6 filas "Otro" son ventas de vacas de descarte** (confirmado). El Hato tiene **tres** flujos de ingreso: **leche · terneros · descarte**. Las ventas de descarte **se quedan en `fin_ingresos`**, bajo el negocio Hato Lechero, donde ya están las 6 históricas.
8. `precio neto promedio` = `valor ÷ litros`. El `precio_unitario` histórico ya está derivado así y ya viene neto de ajustes de calidad.

**Producción por vaca**
9. `hato_pesajes_leche` (semanal) **sustituye** a `hato_chequeo_vacas.pl` como fuente de la curva de producción. La curva por chequeo se **aparca**: `CurvaProduccionLeche.tsx` y su ruta de datos **no se borran**, quedan disponibles y rotuladas como la estimación anterior.
10. Dos números por vaca: **actual** (promedio móvil de pesajes recientes) y **potencial** (pico de la lactancia actual). Ambos ordenables.
11. Eje X de la curva = **semanas desde el último parto**, sobre los 333 eventos `parto` ya limpios. Las vacas sin fecha de parto usable **igual deben ser visibles**.
12. Ranking por semana / mes / trimestre, mostrando punteras y rezagadas.

**Tablero**
13. Arriba: tracker de productividad — tendencia de las últimas 4 semanas + pronóstico de las próximas 2. El pronóstico es **bottom-up**: se proyecta cada vaca en ordeño sobre su propia curva de lactancia, se suman las que van a parir y se restan las que van a secarse, usando `derivarEstadoReproductivo` (`src/utils/calculosHato.ts:1638`). **No** es una línea de tendencia a nivel de hato.
14. Medio: gráfico de ventas — litros vendidos por quincena + KPIs (L/vaca promedio, precio neto promedio, reparto de ingresos leche / terneros / descarte).
15. Abajo: ranking por vaca.
16. `num_vacas_ordeno` de periodos históricos: **derivado del histórico de chequeos** (33 chequeos, 2019–2026) vía el motor reproductivo, y **marcado como derivado, no medido**.
17. El pesaje semanal está vigente pero con backlog (última fila 2026-06-24; hoy 2026-07-28). El tablero debe mostrar un indicador de vejez ("último pesaje: hace N semanas"), **nunca un gráfico vacío**.

---

## 1. Restricción técnica dura (restatement obligatorio)

| # | Restricción | Consecuencia operativa |
|---|---|---|
| R1 | **La siguiente migración libre es `070`.** El brief original decía 069; es incorrecto: `src/sql/migrations/069_fn_hato_commit_chequeo_meses_prenez.sql` ya existe (commit `1ed0dc9`). La secuencia en disco es …066, **068**, 069 (067 se eliminó deliberadamente, ver `src/components/hato/CLAUDE.md` "Merged onto S6/S9/S10"). Este trabajo usa **070** y **071**. | Antes de crear el archivo, `ls src/sql/migrations/ \| tail -5`. La colisión de numeración ya ocurrió 4 veces en este repo. |
| R2 | `src/utils/calculosHato.ts` está espejado en `src/supabase/functions/server/calculos-hato.ts` y `supabase/functions/make-server-1ccce916/calculos-hato.ts`, con paridad byte-a-byte forzada por `src/__tests__/calculosHatoParidad.test.ts`. | **Toda la lógica pura nueva de este rework vive fuera de ese archivo** (§5). Si algún día un consumidor de servidor la necesita, se mueve vía `docs/hato/regenerar-copias-servidor.py` — **nunca** se copia a mano. |
| R3 | **Tailwind congelado.** `src/index.css` es un build precompilado; una clase ausente no falla, simplemente no hace nada. | Verificar con `grep -cF` antes de usar cualquier utilidad nueva (y con la forma escapada `sm\:` para variantes). Estilos nuevos → `src/styles/globals.css`. Precedente en este mismo módulo: `.kpi-grid-hato`. |
| R4 | **Gráficos: recharts directo** (`^2.15.2`). `src/components/ui/chart.tsx` es **código muerto** — ningún gráfico del repo lo usa. | Copiar el patrón de `GraficoLitrosQuincenal.tsx`, `CurvaProduccionLeche.tsx`, `GastosPorCategoriaChart.tsx`. Altura por `style={{ height: N }}`, **no** por arbitrario de Tailwind (`CurvaProduccionLeche.tsx:40`). Colores de serie en hex literal (`#73991C` = `--primary`, `#BFD97D` = `--secondary`) porque son `fill` de SVG dentro del canvas. |
| R5 | `fin_ingresos` NOT NULL: `fecha, negocio_id, region_id, categoria_id, nombre, valor, medio_pago_id`; `CHECK (valor > 0)`. **Sin `estado`, sin `concepto`.** | No existe "ingreso pendiente". Un registro quincenal sin valor **no se puede guardar** — ver la consecuencia deliberada en §2.3. |
| R6 | Las tablas `hato_*` no están en `src/types/database.ts` (generado, anterior incluso a 044). | Los hooks nuevos usan `getSupabase() as any` con el mismo comentario que `useProduccionHato.ts:19-22`. **No** regenerar tipos en este trabajo. |
| R7 | Formato colombiano vía `src/utils/format.ts` (`formatNumber`, `formatCurrency`, `formatShortDate`, `formatLongDate`). Sin decimales en dinero, punto de miles, sin sufijo COP. | Nunca formatear inline. En recharts, `tickFormatter` y `formatter` siempre pasan por `formatNumber`. |
| R8 | Sistema de diálogos: `DialogContent size=` + `DialogBody` para scroll; `<form>` envolvente necesita `flex flex-col flex-1 min-h-0`. Verificado por `src/__tests__/dialogScrollContract.test.ts`. | Cualquier diálogo nuevo lo cumple o el test falla. |
| R9 | **"Sin dato, nunca 0"** es regla de módulo. | Una medición ausente renderiza `—`. Nunca una barra en 0, nunca un valor fabricado. Aplica a pesajes, a `num_vacas_ordeno`, a `lluvia`-style backfills y a las proyecciones. |
| R10 | Todas las consultas de reporte pasan por `fetchAll` (`src/utils/supabase/fetchAll.ts`) — PostgREST corta en 1.000 filas en silencio. | `hato_pesajes_leche` crece a ~45 vacas × 52 semanas ≈ 2.340 filas/año. **Cualquier consulta de pesajes multi-año usa `fetchAll` o paginación explícita.** Esta es la trampa que ya mordió a `execPygFlujoCaja`. |

---

## 2. Modelo de datos y migraciones

### 2.0 Principio de partición: los litros son del Hato, los pesos son de Finanzas

La decisión estructural de la que cuelga todo el diseño:

> **`hato_produccion_quincenal` no almacena dinero.** Guarda litros, fechas y vacas en ordeño. El valor, el precio unitario y el comprador viven donde ya viven: en `fin_ingresos`. El "registro único" del dueño es **un registro repartido en dos tablas por dueño de dato**, unido por FK y escrito atómicamente.

Tres razones, en orden de peso:

1. **Es una frontera de seguridad, no de estilo.** `hato_produccion_quincenal` tiene `SELECT` para todo `authenticated` (patrón 044, `054_create_hato_leche.sql`). `fin_ingresos` tiene `SELECT` **Gerencia-only** (`src/sql/create_finanzas_tables.sql:260`). Copiar `valor` a la fila quincenal le daría a Martha (Administrador) — y a cualquier usuario con el módulo `hato_lechero` — lectura de los ingresos del Hato. Eso es un cambio de frontera de datos que el dueño **no autorizó**; la decisión 5 dice explícitamente "cero cambios de RLS en `fin_ingresos`". Postgres no tiene RLS por columna, así que la única forma de respetar la frontera sin una tabla nueva es no duplicar la cifra.
2. **Un valor duplicado es un valor que diverge.** El único antídoto contra la divergencia sería un trigger que sincronice pesos en las dos direcciones — más maquinaria para sostener una copia que nadie necesita.
3. **P&G y Flujo de Caja quedan intactos por construcción.** La migración 070 **no toca `fin_ingresos`**: ni columna, ni política, ni fila. Los motores (`calculosPyG.ts`, `calculosFlujoCaja.ts`, `reportes-financieros.ts` y su test de paridad) no se enteran de que este trabajo existe.

**Consecuencia de UI que hay que diseñar, no descubrir:** el bloque de ventas del tablero (§4.2) solo tiene datos para Gerencia. Para Administrador, RLS devuelve `[]` **sin error** — indistinguible de "no hay ventas". Por eso el gate es el **rol**, leído de `useAuth().profile.rol`, y no el resultado de la consulta. Es exactamente la lección que el `CLAUDE.md` raíz ya documenta para `/finanzas/reportes` ("sin el guard, un usuario no-Gerencia vería un P&G lleno de ceros — indistinguible de 'no hay datos'").

### 2.1 Migración `070_hato_produccion_venta_link.sql`

```sql
-- 070: vínculo Producción (hato) <-> Finanzas para la venta quincenal de
-- leche y para las ventas de animales del hato (terneros / descarte).
--
-- NO toca fin_ingresos: ni columnas, ni RLS, ni filas. El P&G y el Flujo
-- de Caja leen esa tabla y quedan byte-idénticos.
-- Idempotente: seguro de re-ejecutar.

-- 1. hato_produccion_quincenal: enlace + procedencia del dato ------------

ALTER TABLE hato_produccion_quincenal
  ADD COLUMN IF NOT EXISTS fin_ingreso_id UUID
      REFERENCES fin_ingresos(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS origen_dato TEXT NOT NULL DEFAULT 'medido'
      CHECK (origen_dato IN ('medido', 'derivado_mensual')),
  ADD COLUMN IF NOT EXISTS num_vacas_ordeno_origen TEXT
      CHECK (num_vacas_ordeno_origen IN ('medido', 'derivado_chequeos')),
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS updated_by UUID REFERENCES auth.users(id);

-- La tabla está VACÍA hoy (0 filas, verificado). Por eso el NOT NULL se
-- puede poner de entrada y no queda una ventana de filas huérfanas.
-- Si en el momento de aplicar la migración la tabla NO estuviera vacía,
-- este statement falla ruidosamente -- que es lo correcto.
ALTER TABLE hato_produccion_quincenal
  ALTER COLUMN fin_ingreso_id SET NOT NULL;

-- 1:1 SOLO para las filas medidas (hacia adelante). Las derivadas del
-- backfill enlazan muchos-a-uno al mismo ingreso mensual, por eso el
-- índice es PARCIAL -- mismo mecanismo que 066 usó para la chapeta.
CREATE UNIQUE INDEX IF NOT EXISTS hato_prod_quincenal_ingreso_medido_unico
  ON hato_produccion_quincenal (fin_ingreso_id)
  WHERE origen_dato = 'medido';

-- Índice llano (no parcial): lo necesita la búsqueda inversa
-- ingreso -> quincenas y la verificación del FK ON DELETE RESTRICT,
-- que también recorre las filas derivadas.
CREATE INDEX IF NOT EXISTS idx_hato_prod_quincenal_ingreso
  ON hato_produccion_quincenal (fin_ingreso_id);

-- Una fila derivada declara CÓMO se derivó su num_vacas_ordeno, o lo deja
-- NULL. Nunca un número sin procedencia.
ALTER TABLE hato_produccion_quincenal
  DROP CONSTRAINT IF EXISTS hato_prod_quincenal_vacas_origen_coherente;
ALTER TABLE hato_produccion_quincenal
  ADD CONSTRAINT hato_prod_quincenal_vacas_origen_coherente
  CHECK (num_vacas_ordeno IS NULL OR num_vacas_ordeno_origen IS NOT NULL);

-- 2. hato_eventos: enlace al ingreso de una venta de animales -----------
--    N animales -> 1 fila de fin_ingresos. El evento es la capa "muchos".
--    ON DELETE SET NULL, exactamente como transaccion_ganado_id
--    (053_create_hato_core.sql:166): corregir el registro financiero no
--    borra el hecho de que el animal salió del hato.

ALTER TABLE hato_eventos
  ADD COLUMN IF NOT EXISTS fin_ingreso_id UUID
      REFERENCES fin_ingresos(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_hato_eventos_fin_ingreso
  ON hato_eventos (fin_ingreso_id) WHERE fin_ingreso_id IS NOT NULL;
```

**Justificación columna por columna, y `stored` vs `derived` explícito** (§R-trampa de la 061: `hato_pesajes_leche.litros_total` nació `GENERATED` bajo una suposición falsa sobre cómo mide la finca, y hubo que hacerle `DROP EXPRESSION`. **Este diseño no introduce ninguna columna `GENERATED`.**):

| Columna | Stored / Derived | Por qué existe · por qué NO es generada |
|---|---|---|
| `fin_ingreso_id` | **Stored** (FK) | Es el vínculo duro. No puede derivarse: nada en la fila quincenal identifica un ingreso. `NOT NULL` porque la decisión 3 dice "un solo registro" — una quincena sin su contraparte financiera *es* la divergencia que la decisión prohíbe. |
| `origen_dato` | **Stored** | El flag medido-vs-derivado. Sigue el precedente `clima_resumen_diario.lluvia_confianza` (068) y `hato_eventos.fecha_confianza` (053): un `TEXT` + `CHECK`, no un booleano, para que un tercer valor futuro sea una migración de un renglón. No derivable: `fuente` dice de dónde vino la fila (web/telegram/backfill), no si la cifra fue **medida**. Son dos preguntas distintas y ya nos costó caro confundirlas en clima. |
| `num_vacas_ordeno_origen` | **Stored** | `num_vacas_ordeno` ya existía (054) y sigue siendo *stored*. Lo que falta es su procedencia: en el backfill lo calcula el motor reproductivo a partir de chequeos bimestrales; hacia adelante lo digita Gerencia. Sin esta columna la UI no puede cumplir la decisión 16 ("marcado como derivado, no medido"). |
| `updated_at` / `updated_by` | **Stored** | La fila ahora es un registro financiero editable por dos caminos (Producción y Finanzas). Sin autoría de la última edición, un descuadre contra el Pomar es inauditable. `fin_ingresos` ya los tiene; esta tabla no. Se pueblan en el RPC, **no** por trigger genérico, para no depender del `update_updated_at_column()` de finanzas que esta tabla nunca instaló. |
| `hato_eventos.fin_ingreso_id` | **Stored** (FK) | Único punto de unión entre una venta de N terneras/vacas de descarte y su ingreso. Evita crear una tabla puente: los eventos ya son la capa append-only "muchos". |

**Lo que deliberadamente NO se agrega:**
- **Ninguna columna de dinero** en `hato_produccion_quincenal` (§2.0).
- **`precio_unitario`** — es `valor ÷ cantidad` en `fin_ingresos`, ya *stored* ahí (no generado) y calculado en el momento de escribir. En la UI de Producción se **deriva en el render**, nunca se guarda una segunda copia.
- **Productividad (L/vaca)** — `calcularProductividad()` (`src/utils/calculosHato.ts:1868`) ya la deriva y devuelve `null` (nunca 0) cuando falta un dato. Nunca se almacena.
- **Ningún reparto/porcentaje del backfill** — el método de partición es una constante de un backfill único; vive en el comentario de la migración, en `notas` de cada fila y en el módulo puro. Una columna para un valor constante es ruido.

**Semántica de DELETE — explícita en ambos sentidos:**

| Acción | Qué pasa | Por qué |
|---|---|---|
| Gerencia borra una **quincena medida** desde Producción | El RPC `fn_hato_eliminar_quincena_venta` borra la fila quincenal **y** su `fin_ingresos`, en una transacción. | Un solo registro se borra completo o no se borra. Dejar el ingreso huérfano lo deja contando en el P&G sin contraparte de litros. |
| Gerencia borra el **ingreso** desde `/finanzas/ingresos` | El FK `ON DELETE RESTRICT` lo **bloquea** (`23503`). `IngresosList.tsx` captura el código y muestra: *"Este ingreso está enlazado a una quincena del Hato. Elimínala desde Producción."* | El borrado tiene **un solo camino**. Un `ON DELETE SET NULL` dejaría una quincena que sigue afirmando estar enlazada — la peor variante: silenciosa. |
| Alguien intenta borrar un **ingreso mensual histórico** (backfill) | También bloqueado por `RESTRICT`: sus 2 quincenas derivadas lo referencian. Hay que borrar las derivadas primero. | Refuerza la decisión 4: la historia de `fin_ingresos` no se reescribe. El bloqueo es ruidoso, no silencioso. |
| Se borra un `fin_ingresos` que tenía eventos de venta de animales | `hato_eventos.fin_ingreso_id` → `SET NULL`. El evento y `estado='vendida'` **sobreviven**. | El animal salió del hato; eso es un hecho biológico independiente del registro contable. Consistente con `transaccion_ganado_id` (053:166). |
| Se borra un `hato_animales` | Fuera de alcance: el módulo no borra animales, los pasa a `estado='vendida'/'muerta'`. | Contrato existente del módulo. |

**RLS**: **ninguna política nueva.** `hato_produccion_quincenal` conserva las de 054 (SELECT authenticated / escritura Administrador+Gerencia); `fin_ingresos` conserva las de `create_finanzas_tables.sql` (Gerencia-only). La restricción efectiva "solo Gerencia captura quincenales" **emerge** de la intersección: el RPC escribe en las dos tablas, y un Administrador choca contra la RLS de `fin_ingresos`. No hace falta inventar una política nueva — hace falta **no** ejecutar el RPC como `SECURITY DEFINER` (§3).

### 2.2 Migración `071_fin_categoria_venta_descarte.sql`

**Recomendación: sí, crear la categoría y recategorizar las 6 filas.** Argumento:

- La decisión 7 convierte "Otro" en un flujo de ingreso **nombrado** (descarte). Una categoría llamada "Otro" que en realidad significa "venta de vacas de descarte" es exactamente la clase de dato que obliga a leer el `nombre` fila por fila para entender el P&G.
- **El impacto en los totales es cero y es demostrable.** `calculosPyG.ts:157-181` suma `ing.valor` a `totales.ingresos` sin mirar la categoría; la categoría solo define el **id y la etiqueta de la línea de detalle** (`ing_${categoria_id}`). Cambiar `categoria_id` en 6 filas mueve $ de una línea a otra línea con mejor nombre, y no altera ningún total, ni el Flujo de Caja (que ni siquiera lee la categoría), ni el port Deno `reportes-financieros.ts` (misma lógica, mismo test de paridad).
- **El denominador de $/litro queda intacto**, y esto hay que verificarlo, no suponerlo: `calculosPyG.ts:185-190` acumula `unidades` solo si `/leche/i.test(categoria_nombre)`. `"Otro"` no matchea y `"Venta de Vacas de Descarte"` tampoco. El precio por litro del Hato no se mueve ni un peso.
- Sin la categoría, el reparto del tablero (decisión 14) tendría que clasificar por `nombre` con heurísticas de texto — precisamente lo que el repo ya paga caro en `calculosCostoKg.ts:41` (compara contra `'Mano de Obra'` mientras el catálogo real dice `'Mano de Obra y Asistencia Técnica'`).

```sql
-- 071: categoría de ingreso "Venta de Vacas de Descarte" (Hato Lechero) y
-- recategorización de las 6 filas históricas hoy bajo "Otro".
-- NO cambia ningún `valor`, `fecha` ni `cantidad`: los totales del P&G y
-- del Flujo de Caja quedan idénticos; solo la ETIQUETA de la línea de
-- detalle cambia (calculosPyG.ts:157-181 agrupa por categoria_id).
-- El nombre se eligió SIN la subcadena "leche" a propósito: el
-- denominador de $/litro del Hato (calculosPyG.ts:185-190) filtra por
-- /leche/i y no debe capturarlo.
-- Idempotente.

INSERT INTO fin_categorias_ingresos (nombre, negocio_id, activo)
SELECT 'Venta de Vacas de Descarte', n.id, TRUE
FROM fin_negocios n
WHERE n.nombre = 'Hato Lechero'          -- resuelto por NOMBRE, nunca UUID
  AND NOT EXISTS (
    SELECT 1 FROM fin_categorias_ingresos c
    WHERE c.negocio_id = n.id AND lower(c.nombre) = 'venta de vacas de descarte'
  );

-- Recategorización acotada: SOLO las filas del negocio Hato Lechero, bajo
-- la categoría "Otro", que el dueño confirmó como descarte (2025).
-- El WHERE debe enumerarlas por id en el archivo final -- 6 ids
-- literales, obtenidos del SELECT de verificación que acompaña esta
-- migración. Un WHERE por categoría+negocio sin lista de ids
-- recategorizaría cualquier fila "Otro" que alguien agregue después.
-- UPDATE fin_ingresos SET categoria_id = (…) WHERE id IN (…6 uuid…);
```

> **Nota de ejecución para el implementador:** los 6 `id` se obtienen con un `SELECT` de verificación **antes** de escribir el `UPDATE`, y se pegan literales en el archivo. Nada de `WHERE categoria = 'Otro'` genérico. Este es el mismo tipo de precaución que faltó en la limpieza de partos por SQL ad hoc (§4 de `src/components/hato/CLAUDE.md`, "Incidente de corrupción").

### 2.3 Consecuencia deliberada de `fin_ingreso_id NOT NULL`

No se puede guardar una quincena sin valor. Es intencional: `fin_ingresos.valor` tiene `CHECK (valor > 0)` y la tabla no tiene `estado`, así que **no existe** un ingreso "pendiente" que sirva de placeholder. La decisión 3 dice que la entrada quincenal *es* el registro financiero; el DB es donde eso se hace cumplir, no una validación de formulario que tres caminos de escritura pueden esquivar.

**Efecto colateral que hay que atender, no descubrir en producción:** la conversación de Telegram `/produccion` (`src/supabase/functions/server/telegram/conversations/produccionQuincenal.ts:250-255` y su espejo) inserta en `hato_produccion_quincenal` **sin** ingreso. Con el `NOT NULL` falla con `23502`. **Se retira `/produccion` del bot** (SOW 3). Justificación: el registro quincenal pasó a ser un registro financiero, y el bot escribe con `service_role` donde `auth.uid()` es `NULL` (limitación conocida, documentada en la nota de la migración 063) — no se puede ni atribuir ni restringir a Gerencia, que es justo lo que la decisión 5 exige. `/pesaje` **se mantiene**: no toca dinero y es el camino de Fernando.

---

## 3. Camino de escritura transaccional

**Requisito:** una escritura atómica sobre `hato_produccion_quincenal` (RLS Administrador+Gerencia) y `fin_ingresos` (RLS Gerencia-only), en las **dos** direcciones, y a prueba de los cuatro caminos que hoy escriben `fin_ingresos`.

### 3.1 Opciones evaluadas

| Opción | Atómica | Respeta RLS | Costo | Veredicto |
|---|---|---|---|---|
| **A. Escrituras secuenciales en cliente** (`useProduccionHato` hace dos `.insert()`) | **No** | Sí | Nulo | **Rechazada.** Dos round-trips; un fallo entre ellos deja una quincena sin ingreso o un ingreso sin quincena — exactamente la divergencia que la decisión 3 prohíbe. Y con `fin_ingreso_id NOT NULL` el orden obligado (ingreso primero) hace que el fallo del segundo paso deje un ingreso fantasma contando en el P&G. |
| **B. Edge endpoint** (`POST /hato/produccion/quincena`) | Sí (si adentro usa un RPC) | **No por sí solo** | Alto | **Rechazada.** El edge corre con `service_role`, que **bypasea RLS**: habría que reimplementar el chequeo "es Gerencia" a mano y mantenerlo sincronizado con la política SQL. Además suma el costo permanente de mantener el par de archivos espejo (`src/supabase/functions/server/` ↔ `supabase/functions/make-server-1ccce916/`) y un redeploy en cada cambio. El precedente `fn_hato_commit_chequeo` (065) tiene endpoint porque su entrada es un `.xlsx` que hay que parsear — aquí la entrada es un formulario de 6 campos. |
| **C. RPC plpgsql `SECURITY DEFINER`** (imitando 065) | Sí | **No** — bypasea RLS | Medio | **Rechazada.** 065 es `DEFINER` porque su `EXECUTE` está `REVOKE`d de `authenticated` y solo concedido a `service_role`: el endpoint es la puerta de auth. Aquí el llamador **es el navegador de un usuario Gerencia autenticado**, así que exponer un `DEFINER` a `authenticated` obligaría a meter un `es_usuario_gerencia()` interno — reimplementar la política de RLS dentro de la función, con dos fuentes de verdad que pueden divergir. Escalación de privilegio sin necesidad. |
| **D. RPC plpgsql `SECURITY INVOKER` (default), `GRANT EXECUTE TO authenticated`** | **Sí** | **Sí** | Bajo | **ELEGIDA.** |

### 3.2 Decisión: RPC `SECURITY INVOKER`

```sql
-- (en 070) Un solo statement PostgREST = una sola transacción. El cuerpo
-- corre como el usuario llamante, así que la RLS de fin_ingresos SIGUE
-- aplicando: un Administrador que invoque este RPC recibe un error de
-- política, que es exactamente el comportamiento que pide la decisión 5.
-- NO lleva SECURITY DEFINER, y NO lleva chequeo de rol interno: la
-- política SQL existente ES el chequeo, y hay una sola.
CREATE OR REPLACE FUNCTION fn_hato_guardar_quincena_venta(payload JSONB)
RETURNS JSONB
LANGUAGE plpgsql          -- SECURITY INVOKER por defecto: a propósito
SET search_path = public
AS $$ … $$;

REVOKE EXECUTE ON FUNCTION fn_hato_guardar_quincena_venta(JSONB) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION fn_hato_guardar_quincena_venta(JSONB) TO authenticated;
```

Por qué funciona: PostgREST envuelve cada request en una transacción y el cuerpo de una función es atómico dentro de ella. `SECURITY INVOKER` mantiene `auth.uid()` y las políticas del llamante. **No hace falta privilegio extra porque Gerencia ya tiene escritura en las dos tablas** — lo único que faltaba era la atomicidad, y eso lo da la función, no el `DEFINER`. Es una decisión distinta a la de 065 por una razón concreta (modelo de auth distinto), no por inconsistencia.

Tres RPC, todas `SECURITY INVOKER`, todas en 070:

| RPC | Qué hace | Notas |
|---|---|---|
| `fn_hato_guardar_quincena_venta(payload jsonb)` | Find-or-create del `fin_ingresos` (negocio Hato Lechero, categoría leche, `cantidad = litros`, `precio_unitario = valor/litros`) + UPDATE-por-id-o-INSERT de la quincena, enlazadas. `origen_dato='medido'`. Rechaza con excepción explícita si la quincena objetivo es `derivado_mensual` (read-only). | **Nunca upsert de PostgREST**: patrón UPDATE-por-id-luego-INSERT, igual que `useProduccionHato.ts:163-172` y `CapturaCosechaGrid`. |
| `fn_hato_eliminar_quincena_venta(p_quincena_id uuid)` | Borra la quincena y luego su ingreso, en una transacción. Excepción si `origen_dato='derivado_mensual'`. | Único camino de borrado (§2.1). |
| `fn_hato_registrar_venta_animales(payload jsonb)` | Inserta `fin_ingresos` (categoría terneros **o** descarte según el payload) + N `hato_eventos` tipo `venta` con `fin_ingreso_id` + `UPDATE hato_animales SET estado='vendida', fecha_estado=…` para los enlazados. N puede ser 0 (venta sin vínculo de animal). | `created_by` explícito desde `auth.uid()` — ningún trigger cubre `hato_eventos` (precedente S9, `hatoSalida.ts`). |

### 3.3 La dirección inversa: trigger, no parche en cuatro formularios

`fin_ingresos` se escribe hoy desde **cuatro** lugares, tres de los cuales calculan `precio_unitario = valor/cantidad` inline:

- `src/components/finanzas/components/IngresoForm.tsx:95-98, 263-288`
- `src/components/finanzas/components/IngresosBatchTable.tsx:225-238`
- `src/components/finanzas/components/CargaMasivaIngresos.tsx:490-507`
- `src/supabase/functions/server/telegram/conversations/ingreso.ts:668-682` (**+ su espejo Deno**, del otro lado de la frontera de deploy: no puede importar de `src/utils/`)

**Decisión: la sincronización inversa se hace con un trigger de base de datos, y NO se extrae un util compartido de inserción de `fin_ingresos` como parte de este trabajo.** Explícito, porque el brief lo pidió explícito:

```sql
-- (en 070)
CREATE OR REPLACE FUNCTION fn_hato_sync_quincena_desde_ingreso()
RETURNS TRIGGER
SECURITY DEFINER            -- aquí SÍ: escribe hato_produccion_quincenal en
SET search_path = public    -- nombre de un usuario Gerencia que puede no
LANGUAGE plpgsql            -- tener por qué conocer esa tabla. Precedente
AS $$                       -- 038/039/044.
BEGIN
  -- Solo filas MEDIDAS: las derivadas del backfill son read-only y su
  -- ingreso mensual no representa una sola quincena.
  UPDATE hato_produccion_quincenal q
     SET litros_total = COALESCE(NEW.cantidad, q.litros_total),
         updated_at   = NOW(),
         updated_by   = auth.uid()
   WHERE q.fin_ingreso_id = NEW.id
     AND q.origen_dato = 'medido'
     AND q.litros_total IS DISTINCT FROM COALESCE(NEW.cantidad, q.litros_total);
  RETURN NEW;
END $$;

CREATE TRIGGER trg_hato_sync_quincena_desde_ingreso
AFTER UPDATE OF cantidad, valor, fecha ON fin_ingresos
FOR EACH ROW EXECUTE FUNCTION fn_hato_sync_quincena_desde_ingreso();
```

Razones:
1. **Cobertura total sin tocar código de finanzas.** Un trigger cubre los 4 caminos existentes y cualquier quinto que aparezca. Un util compartido cubre solo a quien se acuerde de usarlo — y uno de los cuatro caminos (Telegram/Deno) **no puede importarlo**, así que el util nunca sería completo.
2. **No hay recursión.** El trigger escribe en `hato_produccion_quincenal`, que no tiene trigger de vuelta hacia `fin_ingresos`. El `IS DISTINCT FROM` corta la escritura no-op cuando el RPC ya dejó los dos lados iguales.
3. **El refactor de los 4 formularios es riesgo sin retorno para este trabajo.** `IngresoForm` es el formulario financiero más usado de la app; tocarlo para extraer un util que este rework no necesita es una regresión buscada. La duplicación de `precio_unitario = valor/cantidad` en 3 sitios es un defecto **preexistente y real** — queda anotado como follow-up independiente (§7), no como prerequisito.

**Lo que sí toca del lado Finanzas (mínimo, quirúrgico):**
- `IngresosList.tsx` — capturar `23503` en el borrado y traducirlo a un mensaje humano (§2.1).
- `IngresoDetalleDialog` / fila del historial — chip "Quincena Hato" cuando el ingreso está enlazado, para que un usuario Gerencia sepa que esa fila tiene contraparte antes de editarla.

---

## 4. Lógica pura, tablero y motor de producción

### 4.1 Dónde vive la lógica nueva (regla, no preferencia)

> **Toda la lógica pura de este rework va a `src/utils/hatoProduccion.ts` y `src/utils/hatoProduccionBackfill.ts` — módulos frontend, NO espejados.** `src/utils/calculosHato.ts` **no se modifica**.

Motivo: `calculosHato.ts` está espejado en dos árboles de servidor con paridad byte-a-byte (`calculosHatoParidad.test.ts`). Cada función que se le agrega es deuda de mantenimiento en tres archivos, para siempre. Ninguna de las funciones nuevas tiene consumidor de servidor hoy: el runner de backfill es un script Node que **sí** puede importar de `src/utils/` (vía `scripts/import-hato/register-alias.mjs`), y el tablero es frontend. Se **importa** de `calculosHato.ts` (`derivarEstadoReproductivo`, `calcularProductividad`, `rangoQuincena`, `resolverQuincena`, `EstadoActualHatoRow`, `HatoConfig`) sin modificarlo.

Si algún día una herramienta de Esco necesita esta lógica, se **mueve** al conjunto espejado y se regenera con `docs/hato/regenerar-copias-servidor.py`. **Nunca** se copia a mano — la regla del módulo es "regenera, no edites el espejo para callar la paridad".

Igual criterio para `src/components/hato/utils/` (hoy inexistente): los helpers de UI que ya existen viven en `src/utils/` (`hatoCategorias.ts`, `hatoUi.ts`, `graficoLitrosQuincenal.ts`). Se sigue ese patrón.

### 4.2 Contratos del motor (`src/utils/hatoProduccion.ts`)

Todas las funciones son puras, sin imports de Supabase, y toda función que dependa de "hoy" recibe `fechaReferencia` — mismo contrato que `calculosHato.ts`.

**a) Rendimiento por vaca (decisión 10)**
```
rendimientoPorVaca(pesajes, partosPorAnimal, fechaReferencia, opciones)
  -> { animalId, actual, potencial, semanasDesdeParto, nPesajesVentana, lactanciaConocida }[]
```
- `actual` = promedio de los pesajes dentro de la ventana móvil (por defecto **4 semanas**, parametrizable). Promedio **sobre las filas presentes**; una semana sin pesar no cuenta como 0. Cero filas en la ventana → `actual = null` (`—`), **nunca 0**.
- `potencial` = `max(litros_total)` **desde el último parto** (pico de la lactancia actual). Sin parto usable → pico sobre todo el historial de la vaca, con `lactanciaConocida = false` para que la UI lo rotule.
- Ambas ordenables: el ranking ordena por la columna pedida y **manda las `null` al final en los dos sentidos** — una vaca sin dato no es una rezagada.

**b) Curva de lactancia (decisión 11)**
```
semanasDesdeParto(fechaPesaje, fechaParto) -> number        // floor(dias/7)
curvaVaca(pesajesVaca, fechaUltimoParto)   -> { semana, litros }[]
curvaLactanciaHato(pesajes, partos)        -> { semana, litros, nVacas }[]
```
- **Fallback obligatorio para vacas sin parto usable (decisión 11 exige que sigan visibles):** se grafican en modo **eje calendario** (`fecha` en X) dentro de la misma tarjeta, con rótulo explícito *"sin parto de referencia"*, y quedan **excluidas** de `curvaLactanciaHato`. **Nunca se imputa una fecha de parto.** Imputarla contaminaría el promedio del hato con una alineación inventada, que es el mismo error de clase que el contador de lluvia congelado de 068.
- Un bucket de `curvaLactanciaHato` con `nVacas < 3` devuelve `litros: null` (muestra insuficiente), no un promedio de una vaca.

**c) Pronóstico bottom-up (decisión 13)**
```
proyectarHato({ pesajes, partos, estadosReproductivos, curvaHato,
                fechaReferencia, horizonteSemanas: 2 })
  -> { semana, litrosDia, tipo: 'medido'|'proyectado',
       vacasBase, vacasEntran, vacasSalen, planas }[]
```
- Por vaca: `nivel` = su `actual`; `forma` = `curvaHato[semana+k] / curvaHato[semana]`. Si cualquiera de los dos buckets es `null` → se proyecta **plano** al nivel actual y la vaca entra en `planas` (visible en el tooltip). Nunca se extrapola con una forma que no se conoce.
- **Entran** las vacas con `fecha_probable_parto` dentro del horizonte (de `derivarEstadoReproductivo`), aportando el valor de la curva del hato en las semanas 0–2. **Salen** las que tienen `fecha_secar` dentro del horizonte. Las dos fechas ya las produce el motor existente; no se recalculan aquí.
- **Trampa de unidades — la más peligrosa de este tablero:** los pesajes son **litros por vaca por día de pesaje**; el quincenal del camión son **litros acumulados de ~15 días**. El tracker se expresa en **L/día del hato**; el gráfico de ventas en **L/quincena**. Son **dos gráficos con dos ejes** y no se mezclan jamás. Si se quiere mostrar el quincenal implícito, va como anotación secundaria rotulada "estimado", nunca como serie.
- El render distingue medido de proyectado con `strokeDasharray` + leyenda. Un punto proyectado **nunca** se pinta como medido.

**d) Vejez del dato (decisión 17)**
```
vejezPesajes(pesajes, fechaReferencia) -> { ultimaFecha, semanas, nivel: 'ok'|'atrasado'|'critico' }
```
`ok` ≤ 1 semana · `atrasado` 2–3 · `crítico` ≥ 4. El tablero muestra el chip **siempre**, no solo cuando está mal, y con datos viejos grafica lo que hay con la advertencia — **nunca** un gráfico vacío ni ceros de relleno.

**e) Reconstrucción de estado a una fecha pasada (decisión 16)**
```
reconstruirEstadoAFecha(animales, eventos, chequeoVacas, fechaCorte) -> EstadoActualHatoRow[]
contarVacasEnOrdenoAFecha(filas, config, fechaCorte)
  -> { conteo, anclaChequeo, cobertura: { conFecha, sinFecha } }
```
`v_hato_estado_actual` es una vista de estado **actual**; no sirve para un corte histórico. Esta función arma el mismo shape `EstadoActualHatoRow` (`calculosHato.ts:1488`) filtrando eventos con `fecha <= fechaCorte`, y luego reusa **`derivarEstadoReproductivo` + `clasificarCategoriaHato`** para contar. "En ordeño" = categoría `hato` (vaca activa que no está `seca`), que es la definición ya acordada con el dueño y compartida con `hato-aggregation.ts` de Esco. **No se inventa un criterio nuevo.**

> **Peligro que esta función debe declarar, no esconder:** los 91 animales en `estado='vendida'` **no tienen evento `venta`** (0 filas). Reconstruyendo solo con eventos, esos animales aparecerían "activos" para siempre y **inflarían** `num_vacas_ordeno` de todos los periodos históricos. Mitigación: usar `hato_animales.fecha_estado` como fecha de salida cuando no hay evento; si `fecha_estado` también es `NULL`, el animal se **excluye** del conteo y suma a `cobertura.sinFecha`. El backfill escribe la cobertura en `notas` y marca `num_vacas_ordeno_origen='derivado_chequeos'`; si la cobertura de un periodo es mala, se escribe `num_vacas_ordeno = NULL` — **`—`, nunca un número inventado**.

### 4.3 Estructura del tablero

```
/hato-lechero/produccion
├── Header + chip de vejez ("último pesaje: hace N semanas")     [todos los roles]
├── 1. Tracker de productividad                                  [todos los roles]
│    L/día del hato · 4 semanas medidas (línea sólida)
│    + 2 semanas proyectadas (línea punteada) · tooltip con entran/salen
├── 2. Ventas                                                    [GERENCIA]
│    Barras L/quincena (GraficoLitrosQuincenal, reusado)
│    KPIs: L/vaca prom · precio neto prom ($/L) · reparto leche/terneros/descarte
│    Filas derivadas del backfill con chip "derivado de mensual" y sin acciones
│    ── para Administrador: tarjeta "Requiere permisos de Gerencia" ──
├── 3. Ranking por vaca                                          [todos los roles]
│    Ventana semana|mes|trimestre · columnas actual / potencial (ordenables)
│    Punteras y rezagadas · `—` para sin dato, siempre al final del orden
└── Capturas
     PesajeSemanalGrid          [Administrador + Gerencia]  (existente, sin cambios)
     ProduccionQuincenalForm    [GERENCIA]  (reescrito sobre el RPC)
     VentaAnimalesHatoDialog    [GERENCIA]  (nuevo: terneros / descarte)
```

**Estado para Administrador (decisión 5):** el bloque 2 se reemplaza por una tarjeta explícita con candado — *"Las ventas del Hato requieren permisos de Gerencia"*. **El gate es el rol** (`useAuth().profile.rol`), **no** el resultado de la consulta: RLS devuelve `[]` sin error, así que una lista vacía es indistinguible de "no hubo ventas". Se envuelve con el `RoleGuard` existente (`src/components/auth/RoleGuard.tsx`) usando su prop `fallback`, no con un `if` a mano.

**El reparto de ingresos reconcilia por construcción:** se computa clasificando los `fin_ingresos` del negocio Hato Lechero en tres cubetas por `categoria_id` **resuelto por nombre** (nunca UUID hardcodeado — precedente `NEGOCIO_GANADO` en `IngresosList.tsx:117-128`), y **todo lo no reconocido cae en un cuarto bucket "Otros"** que se muestra aunque esté en cero-filas. Así la suma de las cubetas es siempre el total de Finanzas, y una categoría nueva aparece en pantalla en vez de desaparecer de la suma.

### 4.4 La curva por chequeo se aparca, no se borra (decisión 9)

`src/components/hato/components/CurvaProduccionLeche.tsx` y su fuente (`useHatoAnimal.ts` → `detalle.chequeos[].pl`) **quedan intactos**. En la Hoja de Vida:
- La curva **semanal** (nueva, desde `hato_pesajes_leche`) pasa a ser la principal, con eje "semanas desde el último parto".
- La curva por chequeo se conserva en una pestaña/acordeón secundario rotulado *"Estimación anterior — PL por chequeo (bimestral)"*. Su rótulo actual ya es honesto (`CurvaProduccionLeche.tsx:31`); solo se le antepone la jerarquía.

---

## 5. Backfill de quincenas históricas

### 5.1 Ubicación y forma

| Capa | Ruta | Por qué |
|---|---|---|
| Lógica pura | `src/utils/hatoProduccionBackfill.ts` | `tsconfig.json` es `"include": ["src"]` y el lint apunta a `src/` — lo que vive en `scripts/` no se typechequea, no se lintea, no se testea. Regla ya establecida en `src/components/hato/CLAUDE.md`, tabla del pipeline S3. |
| Tests | `src/__tests__/hatoProduccionBackfill.test.ts` | Patrón del repo. |
| Runner I/O | `scripts/import-hato/backfill-quincenas-leche.ts` | Única capa que abre el cliente de Supabase. Se ejecuta con `node --import ./scripts/import-hato/register-alias.mjs …`, igual que `extract.ts`/`load.ts`. |

### 5.2 Clasificación previa — CORRECCIÓN (2026-07-28, verificada contra producción)

> **El brief original asumía "44 filas mensuales → 88 quincenas". Es falso.** Una consulta directa a producción desmiente la premisa: la historia **no tiene un grano uniforme**. Partir cada fila en dos sería fabricar datos en los meses que ya vienen desagregados.

Distribución real de las 44 filas `Venta Leche`:

| Periodo | Filas/mes | Día | Litros | Lectura |
|---|---|---|---|---|
| 2023-01 | **2** | 3, 19 | 12.854 | ya quincenal |
| 2023-02 | **3** | 6, 20, 28 | 17.879 | ya sub-mensual (3 entradas) |
| 2023-03 | 1 | 21 | **6.291** | ≈ media mensual → **una sola quincena** |
| 2023-04 | **2** | 3, 21 | 12.941 | ya quincenal |
| 2023-05 → 2024-02 | 1 | 21 | ~11–14k | mensual consolidado |
| 2024-03 → 2025-10 | 1 | 28 | ~10–13k | mensual consolidado |
| 2026-01 → 2026-06 | 1 | fin de mes | ~10–14k | mensual consolidado |

Sólo **7 de 44** filas caen en un fin de mes real; 19 están en día 28 y 12 en día 21. **Las fechas son de pago/captura, no fronteras de periodo** — nunca se deben usar como límite de quincena.

Por tanto el backfill **clasifica antes de partir**, con esta cascada:

1. **Mes con más de una fila** → las filas ya son sub-mensuales. Cada una se asigna a su quincena de **producción** (ver el DESFASE de abajo — **no** `resolverQuincena(fecha)` a secas); **no se parte ninguna**. Si dos filas caen en la misma quincena, se **suman** y se reporta.

> ### ✅ DESFASE PAGO→PRODUCCIÓN — MEDIDO Y RESUELTO (2026-07-28): **desfase 0**
>
> Medición hecha contra la única ventana con las dos señales (2026-03 → 2026-06): serie diaria interpolada desde las 16 jornadas de pesaje vs. las 4 facturas mensuales, barriendo desfases candidatos de 0 a 30 días. **El desfase 0 minimiza el error y el error crece monótonamente con cada desfase mayor** — firma de "sin desfase". La `fecha` de `fin_ingresos` resulta ser la fecha de **cierre/factura del periodo**, no la del pago en banco (ambas cosas del dueño son ciertas: El Pomar sí paga después de cerrar, pero no es esa la fecha que se digita).
>
> **Decisión del dueño (2026-07-28): asumir desfase 0 en toda la historia.** Cada mes de UNA fila (día 21, día 28 o fin de mes) mapea a SU mes calendario y se parte 15/N. Justificación: todas esas filas traen volumen de mes completo (~11–14k L), igual que el patrón 2026 donde el desfase 0 está probado. Los meses multi-fila de inicios de 2023 siguen marcados para revisión humana (§5.2 caso 1).
>
> ### ⚠️ COBERTURA DE PESAJE INCOMPLETA — hallazgo nuevo, afecta SOW 2 y SOW 5
>
> El mismo análisis destapó algo más importante que el desfase: **el pesaje semanal NO fue un censo completo del hato en ordeño hasta junio 2026.**
>
> | Mes | Vacas pesadas | Producción est. vs. facturado |
> |---|---|---|
> | 2026-03 | 20 | −17,9% |
> | 2026-04 | 20 | −7,7% |
> | 2026-05 | 21 → 26 | −21,0% |
> | 2026-06 | **27 → 28** | **−0,1%** |
>
> Con cobertura completa (junio) el pesaje cuadra con la factura **al 0,1%**. Antes, subestima entre 8% y 21%.
>
> **Consecuencia obligatoria para el tracker de productividad (SOW 5, §4.3):** una serie de litros/día del HATO construida con pesajes crudos sube ~34% de marzo a junio, y buena parte de eso es que se pesaron más vacas — no que las vacas produzcan más. **Prohibido graficar totales de hato derivados de pesajes cuando el denominador se movió.** Las salidas válidas son: normalizar por vaca pesada (L/vaca), declarar la cobertura junto a la serie, o ambas. Un total crudo por periodo sería un artefacto de medición presentado como tendencia de negocio — exactamente la clase de gráfico convincente y falso que el riesgo R-4 ya prohíbe para las unidades.

> ### ~~DESFASE PAGO→PRODUCCIÓN — bloqueante de SOW 4, sin resolver~~ (histórico, resuelto arriba)
>
> **Decisión del dueño (2026-07-28): El Pomar paga DESPUÉS de que cierra la quincena.** Por tanto `fin_ingresos.fecha` es una fecha de **pago**, no de producción, y **asignar una fila a su quincena con `resolverQuincena(fecha)` es incorrecto**: una fila del 2023-01-19 probablemente paga los días 1–15 de enero, y una del 2023-01-03 probablemente paga la **segunda quincena de diciembre**. Toda la serie histórica puede estar corrida ~una quincena.
>
> Esto invalida también la premisa de que "el total del mes" es un mes de producción: con desfase, el mes calendario de pago mezcla producción de dos meses.
>
> **No se resuelve adivinando.** Se resuelve empíricamente antes de escribir el runner: **2026-03 → 2026-06 es la única ventana con las dos señales** — 16 fechas de pesaje semanal por vaca (producción real, fechada) y las facturas mensuales. Correlacionar el volumen facturado contra la producción derivada de pesajes, barriendo desfases candidatos, fija el desfase real (y revela si es constante o variable).
>
> Hasta que ese desfase esté medido y aprobado por el dueño, **SOW 4 no escribe nada**. Si resulta variable o no determinable, la salida honesta es cargar cada fila en la quincena que su desfase medido indique y **marcar la asignación como derivada**, o no cargar el periodo — nunca asumir desfase cero por conveniencia.
2. **Mes con una sola fila, volumen de mes completo** → se parte 15/N (regla de abajo).
3. **Mes con una sola fila, volumen ≈ medio mes** → se carga como **UNA** quincena (la que indique `resolverQuincena` sobre su fecha) y la otra queda **sin fila** = *sin dato*. **Decisión del dueño (2026-07-28) para 2023-03:** una quincena, la otra sin dato. Nunca se parte un medio mes en dos cuartos.
4. El umbral de "medio mes" es una **constante declarada y testeada** (fracción de la mediana de los meses vecinos), no un juicio caso por caso. **Todo mes que caiga cerca del umbral no se decide en automático: se reporta para revisión humana**, igual que el resto del pipeline.

### 5.2 bis Regla de partición (aplica sólo al caso 2)

```
dividirMensualEnQuincenas({ anio, mes, litrosMes })
  -> [{ quincena: 1, litros }, { quincena: 2, litros }]
```
- `q1 = round(litrosMes × 15 / diasDelMes)`, `q2 = litrosMes − q1`. **La resta garantiza que la suma sea exacta**, sin deriva de redondeo (mismo criterio de "no fabricar" que rige el módulo).
- `fecha_inicio`/`fecha_fin` salen de **`rangoQuincena(anio, mes, quincena)`** (`calculosHato.ts:1987`), que ya existe. **No se escribe una segunda aritmética de quincenas.**
- Los litros de origen son `fin_ingresos.cantidad` de la fila mensual (poblada por la migración 042 para Hato Lechero). Una fila mensual **sin** `cantidad` no se puede partir: se **omite** y se reporta, nunca se estima a partir del valor.
- **No se reparte el dinero.** Las quincenas derivadas no llevan pesos (§2.0); el valor sigue siendo el del ingreso mensual, que el reporte financiero lee como siempre.
- `origen_dato='derivado_mensual'`, `fin_ingreso_id` = el id del mensual (los dos apuntan al mismo — de ahí el índice único **parcial**), `fuente='backfill_mensual'`, `notas` con la regla y el ancla del chequeo usado para `num_vacas_ordeno`.

### 5.3 Dry-run, idempotencia y la lección del repo

**Dry-run por defecto. `--apply` obligatorio para escribir.** Y, tomando la lección que el módulo ya pagó dos veces:

> `src/components/hato/CLAUDE.md`, "Incidente de corrupción": la limpieza de partos se aplicó con **SQL ad hoc** en vez del parser TS ya vetado por tests; ese SQL aceptó años de 5 dígitos y **corrompió 2 filas** en producción. La ronda siguiente (`recompute-partos-cercanos.ts`) se rehízo JSON-in/JSON-out, con el script TS real.

Protocolo para este backfill, que combina los dos precedentes:
1. **Fase plan** (por defecto): el runner lee `fin_ingresos` (44 filas), `hato_chequeos`/`hato_chequeo_vacas`/`hato_eventos`/`hato_animales`, corre la lógica **pura** y escribe un artefacto JSON con las filas propuestas (**no son 88** — el número sale de la clasificación del §5.2, no de `44 × 2`), **la clasificación asignada a cada mes con su justificación**, la cobertura de `num_vacas_ordeno` por periodo, los mensuales omitidos y los meses marcados para revisión humana. **Cero escrituras.**
2. **Revisión humana** del artefacto (es el mismo "HUMAN CHECKPOINT" del pipeline S3).
3. **Fase apply** (`--apply <artefacto.json>`): **re-lee el estado vivo y verifica que siga coincidiendo con el plan** antes de escribir; si algo cambió, aborta listando las diferencias. Escribe vía SELECT-luego-UPDATE/INSERT sobre `(anio, mes, quincena)` — **nunca upsert de PostgREST**.
4. **Cero SQL ad hoc.** Si el runner no puede correr por falta de `SUPABASE_SERVICE_ROLE_KEY`, la respuesta correcta es conseguir la llave, no reescribir la lógica en SQL a mano.

**Idempotencia:** re-correr converge. La clave natural `(anio, mes, quincena)` es `UNIQUE` desde 054, y el runner solo toca filas con `origen_dato='derivado_mensual'` — **nunca** pisa una quincena `medido`. Una fila medida que ya ocupe un periodo que el backfill querría escribir se **respeta** y se reporta (el dato real gana sobre el derivado, siempre).

**Invariantes que el test debe forzar** (`hatoProduccionBackfill.test.ts`):
- `Σ litros(q1,q2) == cantidad(mensual)` para todos los meses **del caso 2**, incluidos febrero (28/29) y los de 31 días.
- **Un mes con >1 fila nunca se parte**: 2023-02 (3 filas) produce como máximo 2 quincenas, jamás 6. Fixture obligatorio con los datos reales de 2023-01/02/04.
- **Un mes de medio volumen produce UNA fila, no dos**: 2023-03 (6.291 L, día 21) → una quincena; la otra **no existe** (ausencia = sin dato, jamás una fila con litros estimados).
- La suma de litros de TODAS las filas derivadas de un mes es **exactamente** la suma de `cantidad` de las filas `fin_ingresos` de ese mes, en los tres casos de la clasificación.
- Ninguna fila derivada queda sin `fin_ingreso_id`.
- Re-correr sobre un estado ya aplicado produce **0 escrituras**.
- Un mensual sin `cantidad` produce **0 filas** y **1 entrada de reporte**.
- `num_vacas_ordeno` es `NULL` (no 0) cuando la cobertura del periodo es insuficiente.

---

## 6. Descomposición en SOW

Dependencias en orden topológico. `SOW 0` es un **bloqueante independiente** de este rework y puede (debe) arrancar de inmediato.

---

### SOW 0 — Corrección del filtro `es_hato` en la capa de finanzas · **backend** · **S**

**Este es un defecto latente preexistente, no parte del rework.** Se registra aquí porque este brief es donde corresponde dejarlo escrito y porque **debe cerrarse antes de que nadie use el camino de venta de S9.**

**Diagnóstico.** `es_hato` se **escribe** en exactamente un lugar — `src/components/finanzas/components/TransaccionGanadoForm.tsx:180` — y **no se filtra en ningún lado**. Está ausente de:
- `src/components/finanzas/hooks/useReportesFinancierosData.ts:154-158` (alimenta P&G, Flujo de Caja **y** `costoVentaGanado.ts`)
- `src/components/finanzas/hooks/useGanadoData.ts:49, 140, 174, 205, 232`
- `src/components/finanzas/components/IngresosList.tsx:181` y `GastosList.tsx:197`

**Consecuencia.** Una venta del hato enrutada por `VentaAnimalDialog` (S9) se contabiliza como venta de **Ganado** en el P&G — porque `resolverAlcance` (`src/utils/reportesFinancierosComun.ts:52-58`) define `incluyeGanado: vista === 'ganado'`, de modo que la vista **Hato** nunca ve `fin_transacciones_ganado`. Peor: esa fila entra a `costearVentasGanado` (`src/utils/costoVentaGanado.ts:87`), que costea cabezas vendidas al **promedio ponderado móvil de compra**. Una vaca del hato nació en la finca y **jamás se compró**: no tiene contraparte en esa serie, así que se le carga el costo promedio del hato de ceba, inflando el COGS y el conteo de cabezas vendidas de un negocio que nunca fue dueño del animal. **Solo no ha estallado porque hay 0 filas `es_hato=true` en producción.**

**Alcance.**
- Excluir `es_hato = true` de **todas** las lecturas de `fin_transacciones_ganado` de la capa financiera y de ganado (los 8 sitios listados).
- Test de regresión que falle si aparece un `.from('fin_transacciones_ganado')` sin el filtro (guard estático, patrón de `dialogScrollContract.test.ts` / `hatoSchemaContract.test.ts`).
- Extender el port Deno `src/supabase/functions/server/reportes-financieros.ts` **y su espejo** con el mismo filtro; `reportesFinancierosParidad.test.ts` debe seguir verde.
- **Qué pasa con `VentaAnimalDialog` de S9:** con las ventas de descarte enrutadas a `fin_ingresos` (decisión 7), ese diálogo **se queda sin destino correcto para una vaca de descarte**. Se **reapunta** a la nueva `VentaAnimalesHatoDialog` de SOW 3 (mismo botón en la Hoja de Vida, otro destino). El camino `fin_transacciones_ganado` + `es_hato` queda para **compras** de animales al hato y para el registro de `muerte` — que no es transacción financiera y ya usa su propio diálogo. La columna `es_hato` y el guard del trigger de 059 **se conservan**: siguen siendo la defensa correcta contra el `gan_movimientos` pendiente espurio.

**Files:** `useReportesFinancierosData.ts`, `useGanadoData.ts`, `IngresosList.tsx`, `GastosList.tsx`, `reportes-financieros.ts` (×2 espejos), `HojaDeVida.tsx` (reapuntar botón), `src/__tests__/` (guard nuevo).
**Puro vs UI:** 90% de acceso a datos, 10% UI (mensajes + botón).
**Dependencias:** ninguna. **Bloquea:** el uso en producción de cualquier venta del hato.

---

### SOW 1 — Migraciones 070/071, RPCs y trigger · **backend** · **M**

**Alcance.** Todo el §2 y el §3: `070_hato_produccion_venta_link.sql` (columnas, índices, CHECKs, 3 RPCs `SECURITY INVOKER`, 1 trigger `SECURITY DEFINER`), `071_fin_categoria_venta_descarte.sql` (categoría + recategorización de 6 filas por id literal), y los tipos de fila en `src/types/hato.ts`.

**Puro vs UI:** 100% SQL + tipos. Sin UI.
**Test surface:** extender `src/__tests__/hatoSchemaContract.test.ts` — ese test ya verifica el **texto SQL** de las migraciones del hato (ver sus aserciones sobre 059) y es el lugar natural para forzar: el índice único **parcial** (no global), el `ON DELETE RESTRICT` en `fin_ingreso_id` vs. `SET NULL` en `hato_eventos`, la **ausencia** de `SECURITY DEFINER` en los 3 RPCs, la **presencia** de `SECURITY DEFINER` en el trigger, y que 071 **no** contenga ningún `UPDATE` a `valor`/`fecha`/`cantidad` de `fin_ingresos`.
**Dependencias:** ninguna técnica. Conceptualmente se apoya en la decisión de SOW 0 sobre dónde viven las ventas de descarte.

---

### SOW 2 — Motor puro de producción · **backend** · **M**

**Alcance.** `src/utils/hatoProduccion.ts` completo (§4.2 a–e). Cero acceso a Supabase, cero cambios a `calculosHato.ts`.

**Puro vs UI:** 100% puro.
**Test surface:** `src/__tests__/hatoProduccion.test.ts`. Casos obligatorios: ventana sin pesajes → `null` y no 0 · vaca sin parto usable → visible, `lactanciaConocida=false`, excluida de la curva del hato · bucket con `nVacas<3` → `null` · proyección con curva incompleta → plana + flag · reconstrucción histórica con animal `vendida` sin evento `venta` (usa `fecha_estado`; sin ella, se excluye y suma a `cobertura.sinFecha`) · ordenamiento que manda `null` al final en asc **y** desc.
**Dependencias:** ninguna — puede arrancar en paralelo con SOW 0 y 1.

---

### SOW 3 — Captura: quincenal sobre RPC + venta de animales + retiro de `/produccion` · **frontend** (+ backend para el bot) · **M**

**Alcance.**
- `ProduccionQuincenalForm.tsx` reescrito sobre `fn_hato_guardar_quincena_venta`: agrega **valor**, comprador y medio de pago (campos NOT NULL de `fin_ingresos`), muestra el `precio_unitario` derivado en vivo, y queda envuelto en `RoleGuard allowedRoles={['Gerencia']}`.
- `useProduccionHato.ts`: `guardarQuincena` pasa de dos escrituras sueltas (`useProduccionHato.ts:137-173`) a **un `.rpc()`**; se agrega `eliminarQuincena`. Se conserva `getSupabase() as any` (R6).
- **`VentaAnimalesHatoDialog.tsx`** (nuevo): tipo (terneros | descarte), cabezas y valor **obligatorios**, selector **opcional** multi-animal de `hato_animales` activos; escribe vía `fn_hato_registrar_venta_animales`. Reemplaza el destino del botón "Registrar venta" de la Hoja de Vida (SOW 0).
- **Retirar el comando `/produccion`** del bot: `telegram/bot.ts` y `telegram/conversations/produccionQuincenal.ts`, **en los dos árboles espejo**, + redeploy (`npx supabase functions deploy make-server-1ccce916`). `/pesaje` intacto.
- `IngresosList.tsx`: traducir `23503` en el borrado + chip "Quincena Hato".

**Puro vs UI:** UI + hooks. La única lógica derivable (`precio_unitario`, validación de cabezas ≥ 1) va a helpers puros de `hatoProduccion.ts`, no inline en el componente.
**Test surface:** `dialogScrollContract.test.ts` cubre los diálogos nuevos automáticamente. Test de los helpers puros. Verificación manual del bot tras el redeploy.
**Dependencias:** SOW 1 (RPCs), SOW 0 (destino de la venta).

---

### SOW 4 — Backfill de las 44 mensuales · **backend** · **M**

**Alcance.** Todo el §5: `src/utils/hatoProduccionBackfill.ts`, `scripts/import-hato/backfill-quincenas-leche.ts`, artefacto JSON, protocolo plan → revisión → `--apply`.

**Puro vs UI:** lógica pura + runner I/O. Sin UI.
**Test surface:** `src/__tests__/hatoProduccionBackfill.test.ts` con los 5 invariantes del §5.3.
**Dependencias:** SOW 1 (las columnas deben existir), SOW 2 (`reconstruirEstadoAFecha` / `contarVacasEnOrdenoAFecha`).
**Nota de ejecución:** la fase `--apply` contra producción es una operación con dueño humano; no la ejecuta un agente sin confirmación explícita, igual que el `Load` histórico.

---

### SOW 5 — Tablero de Producción · **frontend** · **L**

**Alcance.** `ProduccionView.tsx` reestructurado según §4.3, más:
- `TrackerProductividad.tsx` (recharts `LineChart`, sólida + punteada, tooltip con entran/salen)
- `RankingVacas.tsx` (tabla ordenable, ventana semana/mes/trimestre, punteras/rezagadas, `—` al final)
- `KpisVentaHato.tsx` + reparto leche/terneros/descarte (`RoleGuard` Gerencia con `fallback`)
- `ChipVejezPesajes.tsx`
- `GraficoLitrosQuincenal.tsx` reusado, extendido con el chip "derivado de mensual" en las barras del backfill
- Hoja de Vida: curva semanal principal + curva por chequeo aparcada y rotulada (§4.4)
- CSS nuevo (si hace falta) en `src/styles/globals.css`, **nunca** en `index.css` (R3)

**Puro vs UI:** toda la aritmética viene de SOW 2; estos componentes solo consultan y renderizan.
**Test surface:** los componentes son delgados a propósito; la cobertura real está en SOW 2. Se agrega un guard estático de Tailwind congelado para las clases nuevas de este SOW.
**Dependencias:** SOW 1, 2, 3, 4.

---

### SOW 6 — QA: verificación adversarial · **qa** · **M**

**Alcance.**
1. **Atomicidad** de los 3 RPCs: forzar el fallo del segundo paso y probar que **nada** quedó escrito.
2. **Frontera de RLS:** con sesión Administrador, probar que (a) el RPC quincenal **falla**, (b) la vista de Producción **carga** y muestra el bloque de ventas bloqueado, no un blanco ni un crash, (c) `hato_produccion_quincenal` **no expone** ninguna cifra de dinero.
3. **Bidireccionalidad:** editar `cantidad` desde `IngresoForm` y verificar que la quincena se movió; editar desde Producción y verificar que el ingreso se movió; probar que la fila derivada del backfill **no** se mueve por ninguno de los dos caminos.
4. **DELETE en ambos sentidos** (§2.1), incluido el mensaje de `23503`.
5. **Regresión financiera:** correr `/finanzas/reportes` antes y después de 071 y probar que **todos los totales del P&G y del Flujo de Caja son idénticos** en las 4 vistas y los 4 periodos; `reportesFinancierosParidad.test.ts` verde.
6. **Idempotencia del backfill:** dos corridas → una escritura.
7. **"Sin dato, nunca 0"** como barrido: ninguna serie, KPI o celda del tablero renderiza `0` por ausencia.

**Dependencias:** todos. Corre como **track paralelo**, no como fase final: QA intenta falsificar los supuestos del implementador mientras se implementa.

---

### Secuencia

```
SOW 0 ──┐
SOW 1 ──┼──► SOW 3 ──┐
SOW 2 ──┴──► SOW 4 ──┴──► SOW 5
                 (SOW 6 en paralelo desde el día 1)
```

---

## 7. Lo que este trabajo NO hace (y por qué)

1. **No borra ni reemplaza `CurvaProduccionLeche.tsx` ni su ruta de datos.** Decisión 9: se aparca, rotulada. La serie `pl` por chequeo es el único historial de producción anterior a 2026.
2. **No modifica el esquema, la RLS ni las filas históricas de `fin_ingresos`** — con la única excepción de `categoria_id` en 6 filas (071), que no mueve ningún total. La migración 070 **no toca esa tabla en absoluto**.
3. **No reescribe la historia mensual a quincenal en `fin_ingresos`.** Decisión 4. Las quincenas derivadas viven del lado del Hato y apuntan al mensual intacto.
4. **No da a Administrador acceso a los ingresos del Hato.** Ni por RLS, ni por la puerta de atrás de copiar `valor` a una tabla de lectura más amplia.
5. **No regenera `src/types/database.ts`.** Seguiría siendo correcto hacerlo (removería los `as any` de hato **y** ganado), pero es una tarea de tooling transversal que no debe colarse en un rework funcional. Follow-up conocido #3 del módulo.
6. **No agrega funciones a `src/utils/calculosHato.ts`**, y por tanto no ejecuta `regenerar-copias-servidor.py` ni mueve la paridad. §4.1.
7. **No extrae un util compartido de inserción de `fin_ingresos`** ni refactoriza los 4 caminos de escritura. §3.3. La duplicación de `precio_unitario = valor/cantidad` en `IngresoForm.tsx:95-98`, `IngresosBatchTable.tsx:234` y `CargaMasivaIngresos.tsx` queda como **follow-up independiente**.
8. **No ajusta curvas de lactancia por vaca** (Wood ni similar). El pronóstico usa la forma promedio del hato escalada al nivel de cada vaca (§4.2c): explicable, auditable y suficiente para un horizonte de 2 semanas. Un ajuste estadístico por vaca con ~10 puntos de datos daría una precisión falsa.
9. **No agrega captura quincenal por Telegram** — al contrario, retira la existente. §2.3.
10. **No construye reporte de rentabilidad por vaca** (ingreso − costo por animal). El hato no tiene costos asignados por animal; construirlo requeriría una decisión de negocio que nadie ha tomado.
11. **No toca `hato_pesajes_leche`.** Su esquema quedó correcto tras la 061; el rework solo lo lee.

---

## 8. Riesgos

Ninguno de estos reabre una decisión. Son los costos que las decisiones tomadas traen consigo, y cómo se pagan.

| # | Riesgo | Severidad | Mitigación |
|---|---|---|---|
| R-1 | **`fin_ingreso_id NOT NULL` acopla la captura de litros a la de dinero.** Si el Pomar confirma litros antes que el valor, Gerencia no puede registrar la quincena. `fin_ingresos.valor` tiene `CHECK (valor > 0)` y no hay `estado`, así que no hay placeholder posible. | Media | Es la traducción literal de la decisión 3 ("un solo registro"). Se documenta en el formulario. Si la operación demuestra que el desfase es real, la salida limpia es un `estado`/`borrador` **del lado del hato** (una quincena `borrador` sin ingreso), no aflojar el NOT NULL — pero eso es una decisión del dueño, no del implementador. |
| R-2 | **El `num_vacas_ordeno` histórico derivado será impreciso**, y se verá igual de "oficial" que uno medido. 33 chequeos en 7 años ≈ uno cada 2 meses, y 91 animales `vendida` no tienen evento de salida. | **Alta** | `num_vacas_ordeno_origen='derivado_chequeos'` + chip visible en toda la UI + `notas` con el chequeo ancla y la cobertura. Cobertura insuficiente ⇒ **`NULL`, no un número**. El L/vaca de periodos derivados se muestra con la misma marca. Precedente exacto: `lluvia_confianza` de la 068. |
| R-3 | **La partición 15/N días es una convención, no un hecho.** La producción real no se reparte proporcional a los días del calendario. | Media | Por eso las filas son **read-only** y están marcadas `derivado_mensual`. Nunca se usan como base de un pronóstico ni de una comparación quincena-a-quincena reciente: el tracker se alimenta de `hato_pesajes_leche`, que sí es medido. La suma de las dos quincenas sí es exacta contra el mes, que es la única propiedad que la historia mensual garantiza. |
| R-4 | **Trampa de unidades:** L/día por vaca (pesajes) vs. L/quincena (camión). Mezclarlas en un eje produce un gráfico convincente y falso. | **Alta** | Dos gráficos, dos ejes, rótulo de unidad explícito en cada uno. Prohibido derivar uno del otro sin conversión rotulada como "estimado". Es un ítem del checklist de SOW 6. |
| R-5 | **El trigger de sincronización inversa es invisible.** Un desarrollador de Finanzas que edite `IngresoForm` no verá que su `UPDATE` mueve datos del Hato. | Media | Comentario SQL en la migración + entrada en `src/components/finanzas/CLAUDE.md` (contrato de la vista Ingresos) + chip "Quincena Hato" en la fila. El trigger es `AFTER UPDATE OF cantidad, valor, fecha`, alcance mínimo. |
| R-6 | **El pronóstico se leerá como una promesa.** Un dueño que ve "próximas 2 semanas: 620 L/día" lo trata como compromiso con el Pomar. | Media | Serie punteada + leyenda "proyección" + tooltip que declara cuántas vacas se proyectaron **planas** por falta de curva. Sin banda de confianza falsa: no hay base estadística para dibujarla. |
| R-7 | **El backlog de pesajes degrada el tracker en silencio.** Con 5 semanas sin subir, "últimas 4 semanas" muestra datos de junio como si fueran de julio. | Media | El chip de vejez es **permanente**, no condicional; en nivel `critico` el eje X se rotula con fechas absolutas, no con "hace N semanas". Decisión 17. |
| R-8 | **La categoría de descarte podría renombrarse y romper la clasificación del reparto.** | Baja | La clasificación resuelve por nombre pero **todo lo no reconocido cae en "Otros"**, así que un renombre degrada la etiqueta, nunca el total. Nunca un UUID hardcodeado. |
| R-9 | **`hato_pesajes_leche` crece a ~2.340 filas/año** y PostgREST corta en 1.000 sin avisar. El tablero pide historial multi-año para la curva del hato. | **Alta** | `fetchAll` (`src/utils/supabase/fetchAll.ts`) o paginación explícita en **toda** consulta de pesajes que no esté acotada por fecha. Es la misma trampa que ya mordió a `execPygFlujoCaja`; SOW 6 lo verifica con un dataset sintético > 1.000 filas. |
| R-10 | **Dos caminos de venta de animales conviven** (`fin_ingresos` para terneros/descarte; `fin_transacciones_ganado` para ceba), y alguien podría registrar la misma venta por los dos. | Media | `detectarDuplicadosGanado` (`reportesFinancierosComun.ts:79`) ya detecta el cruce por fecha+valor (<$1) y **excluye + advierte** en vez de duplicar en silencio. Esa defensa ya existe y sigue aplicando. SOW 0 elimina la fuente principal del error al reapuntar el botón de S9. |
| R-11 | **Tailwind congelado.** Clases nuevas del tablero (ejes, chips, grids) pueden no existir y fallar en silencio. | Media | `grep -cF` (y la forma escapada para variantes) antes de usar cualquier utilidad; alturas de gráfico por `style`; reglas nuevas en `globals.css`. Guard estático en SOW 5. |

---

## 9. Checklist de cierre (todo SOW)

1. `npm run lint` limpio sobre lo tocado en la sesión.
2. `npm test` verde — con atención especial a `hatoSchemaContract`, `calculosHatoParidad`, `reportesFinancierosParidad`, `dialogScrollContract`.
3. Viewport móvil verificado (sidebar colapsado) para SOW 3 y 5.
4. Inputs numéricos con `onWheel={(e) => e.currentTarget.blur()}` — sin excepción.
5. Si se tocó una edge function: **los dos árboles espejo** + `npx supabase functions deploy make-server-1ccce916`.
6. Actualización de memoria: hechos transversales → `CLAUDE.md` raíz (solo la numeración de migraciones y el trigger nuevo); detalle del módulo → `src/components/hato/CLAUDE.md`; contrato de la vista Ingresos → `src/components/finanzas/CLAUDE.md`. **No engordar el `CLAUDE.md` raíz con detalle de módulo.**
