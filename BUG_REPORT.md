# Bug Report — Reporte Semanal

**Abierto:** 2026-02-24
**Re-verificado contra producción y `main@7c232f6`:** 2026-08-03
**Re-verificado contra producción y `main@1a97b2d`:** 2026-09-07 — sin cambio de veredicto; sólo se actualizan las cifras que habían quedado rancias
**Re-verificado contra producción y `main@a852d3e`:** 2026-10-12 — sin cambio de veredicto; cifras de reportes al día, 3b idéntico
**Re-verificado contra producción y `main@2947270`:** 2026-10-19 — 3b idéntico; cifras al día; **issue 7 nuevo** (dos consultas de aplicaciones planeadas en 400, PR #336)
**Estado:** 5 de los 6 problemas originales están cerrados. 1 sigue abierto, y no por la causa que decía este archivo. 1 problema nuevo (issue 7), con arreglo en PR #336.

> **Cómo leer este archivo.** Cada issue lleva su veredicto y **la evidencia con la que se comprobó** (archivo:línea, SQL con su resultado). Un issue sin evidencia no se cierra. Si vuelve a aparecer un síntoma listado aquí como cerrado, es un bug **nuevo** — no una reapertura — y merece su propia entrada.

---

## Resumen

| # | Problema original | Veredicto 2026-08-03 |
|---|---|---|
| 1 | Detalle de fallas/permisos no aparece en el PDF | ✅ **Corregido** |
| 2 | Labores Programadas muestra "—" en Tipo y Lotes | ✅ **Corregido** |
| 3 | Costos de aplicaciones mal calculados | ⚠️ **Parcial** — la parte reportada está corregida; queda un hueco distinto, ver abajo |
| 4 | Vista por sublote muestra 1 observación en vez de 3 | ✅ **Corregido** |
| 5 | Guardar el reporte falla con error de RLS | ✅ **Corregido** |
| 6 | La descarga del PDF no funciona | ✅ **No reproducible** |
| 7 | *(nuevo 2026-10-19)* Aplicaciones planeadas: blancos biológicos y mezclas siempre vacíos | 🔧 **Arreglo en PR #336** |

El módulo lleva **35 reportes generados y guardados**, con cadencia semanal hasta la **semana 42 de 2026 (generado 2026-10-19)**. La afirmación original de que "NADA funciona" dejó de ser cierta hace meses; este archivo simplemente no se actualizó.

```sql
-- verificado 2026-10-19
select count(*) total, count(url_storage) con_url,
       max(created_at)::date ultimo,
       max(numero_semana) filter (where ano = 2026) ultima_semana
from reportes_semanales;
-- total = 35 | con_url = 35 | ultimo = 2026-10-19 | ultima_semana = 42
```

> El reporte **no tiene cron**: `cron.job` sólo lista los seis trabajos de clima, hato, acciones y ronda de inventario. Una semana sin fila en `reportes_semanales` es cadencia humana, no un defecto.

---

## Issue 1 — Detalle de fallas/permisos en el PDF ✅ CORREGIDO

**Síntoma original:** el usuario capturaba nombres y motivos de fallas/permisos en el wizard y el PDF salía vacío o con "undefined".

**Evidencia de la corrección** — `src/supabase/functions/server/generar-reporte-semanal.tsx`:

- **Líneas 382-394** — `formatearDatosParaPrompt()` sí lee y serializa ambos arreglos:
  ```ts
  if (datos.personal.detalleFallas?.length > 0) {
    partes.push(`### DETALLE DE FALLAS`);
    datos.personal.detalleFallas.forEach((falla: any) => {
      partes.push(`- ${falla.empleado}${falla.razon ? `: ${falla.razon}` : ''}`);
    });
  }
  ```
- **Líneas 938-944** — el slide de personal los renderiza en HTML, con fallback explícito de nombre (`f.empleado || f.nombre || '—'`), que es justamente lo que producía el "undefined" reportado.

---

## Issue 2 — Labores Programadas: Tipo y Lotes en "—" ✅ CORREGIDO

**Síntoma original:** las columnas Tipo y Lotes salían vacías; se sospechaba que `vista_tareas_resumen` no devolvía los campos.

**Evidencia de la corrección** — la vista sí los devuelve, en el 100% de las filas:

```sql
select count(*) filas,
       count(*) filter (where tipo_tarea_nombre is not null) con_tipo,
       count(*) filter (where lote_nombres  is not null) con_lotes
from vista_tareas_resumen;
-- filas = 61 | con_tipo = 61 | con_lotes = 61
```

La hipótesis del archivo original ("LIKELY: la vista no está devolviendo estos campos") queda descartada con datos.

---

## Issue 3 — Costos de aplicaciones ⚠️ PARCIAL

Este issue mezclaba dos cosas distintas. Una está corregida; la otra sigue viva y **no** es la que describía el texto original.

### 3a. "Costo Est. muestra $0 en todos los items" — ✅ corregido para aplicaciones nuevas

El síntoma era real y se reprodujo exactamente en la aplicación que el reporte original citaba, *Fumigación N°2 (Floración)* (creada el 2026-02-24, el mismo día de este bug report):

```sql
select producto_nombre, unidades_a_comprar, costo_estimado
from aplicaciones_compras
where aplicacion_id = '22e2d0ba-16b0-48cc-ade6-e238f694c50c';
-- Sistoato 40EC          | 14 | NULL   (precio_por_presentacion del producto = 44.000)
-- Danadim progress 400EC |  2 | NULL   (precio_por_presentacion del producto = 60.400)
```

`costo_estimado` quedaba en NULL aun habiendo unidades a comprar y precio vigente en `productos`.

**Ya no ocurre.** Contando filas con `costo_estimado IS NULL` pese a `unidades_a_comprar > 0`, por aplicación y fecha de creación:

```sql
select a.nombre_aplicacion, a.created_at::date,
       count(*) filter (where c.costo_estimado is null
                          and coalesce(c.unidades_a_comprar,0) > 0) nulo_pese_a_comprar
from aplicaciones_compras c join aplicaciones a on a.id = c.aplicacion_id
group by 1,2 order by 2;
-- 2026-01-10  Fumigación refuerzo post cosecha diciembre  -> 16
-- 2026-02-09  Aplicación edáfica general - 01.            ->  1
-- 2026-02-24  Fumigación N°2 (Floración)                  ->  2
-- 2026-04-01 en adelante (10 aplicaciones)                ->  0  (salvo 1 producto sin precio)
```

El corte es limpio: **toda aplicación creada desde abril de 2026 escribe `costo_estimado` correctamente.** Las 19 filas mal escritas son datos históricos de 3 aplicaciones ya cerradas, no un defecto vivo. No se corrigen aquí: reescribir costos de aplicaciones cerradas es una decisión del dueño, no una limpieza.

### 3b. El inventario consumido se valora en $0 — ❌ SIGUE ABIERTO (causa distinta a la reportada)

`src/utils/fetchDatosReporteSemanal.ts:512-523` calcula el valor del inventario que la aplicación va a consumir derivando un precio unitario **a partir de lo que hay que comprar**:

```ts
const unitCost = item.costoEstimado > 0 && cantidadComprar > 0
  ? item.costoEstimado / cantidadComprar
  : 0;
```

Cuando el producto está **totalmente cubierto por inventario** — el caso normal — `cantidadComprar` es 0, así que `unitCost` es 0 y ese insumo aporta **cero** al costo. Si ninguna línea requiere compra, `costoTotal` (línea 526) es 0 y `costoPorLitroKg` / `costoPorArbol` salen en 0.

Al 2026-10-19 (sin cambio desde el 2026-09-07) eso aplica a **8 de las 22 aplicaciones** registradas — las que tienen lista de compras pero ninguna línea por comprar (`cantidad_faltante = 0` en todas): *Drench Enero 26*, *Fumigación 01*, *Foco Irlanda*, *Fumigación control monalonion y hongos - Mayo*, *Fertilizante mes de junio*, *Fumigacion Post cosecha junio*, *Fumigación control acaro - Julio* y *Drench agosto* (nueva desde el 2026-08-03).

```sql
-- verificado 2026-10-19 (mismo resultado que el 2026-09-07)
select a.nombre_aplicacion, a.estado, count(c.id) items,
       sum((coalesce(c.cantidad_faltante,0) > 0)::int) items_a_comprar
from aplicaciones a join aplicaciones_compras c on c.aplicacion_id = a.id
group by 1,2 having sum((coalesce(c.cantidad_faltante,0) > 0)::int) = 0;
-- 8 filas, TODAS en estado 'Cerrada' -> toda la lista cubierta por inventario -> costoTotal = 0
```

**Por qué no se corrige en este archivo:** existe una fuente de precio obvia (`productos.precio_unitario`, que es la que ya usa el motor de costo/kg en `calculosCostoKg.ts`), pero decidir **a qué precio se valora un insumo sacado de bodega** es una regla contable, no un bug de aritmética. Requiere aprobación del dueño antes de tocar un número que Gerencia lee.

**Impacto acotado, re-verificado 2026-10-19:** `fetchAplicacionesPlaneadas()` solo trae aplicaciones en estado `Calculada`. Sigue habiendo **una** (*Aplicacion Enmienda*) y sigue sin filas en `aplicaciones_compras`; las 8 afectadas están todas `Cerrada`. Así que la sección de planeadas del reporte sale vacía casi siempre. Es un error latente, no uno que esté ensuciando el reporte cada semana.

---

## Issue 4 — Vista por sublote: 1 observación en vez de 3 ✅ CORREGIDO

**Síntoma original:** la diapositiva de monitoreo por sublote mostraba una sola observación por celda. El archivo apuntaba a la línea exacta: `const vistasPorSublote = monitoreo?.detallePorLote || []` en vez de `monitoreo?.vistasPorSublote`.

**Evidencia de la corrección** — `generar-reporte-semanal.tsx:2085` ya lee la fuente correcta, y además filtra las vistas vacías:

```ts
const vistasPorSublote: any[] = (monitoreo?.vistasPorSublote || []).filter(
  (v: any) => v.sublotes && v.sublotes.length > 0 && !v.sinDatos
);
```

---

## Issue 5 — Error de RLS al guardar ✅ CORREGIDO

**Síntoma original:** `new row violates row-level security policy ... for table "reportes_semanales"` en el upsert.

**Evidencia de la corrección** — las políticas vivas en producción ya no tienen el `USING (generado_por = auth.uid())` que rompía el upsert:

```sql
select policyname, cmd, qual, with_check from pg_policies
where tablename = 'reportes_semanales';
-- Authenticated users can create reports | INSERT | -      | true
-- Authenticated users can view reports   | SELECT | true   | -
-- Authenticated users can update reports | UPDATE | true   | true
-- Users can update own reports           | UPDATE | true   | true
-- Users can delete own reports           | DELETE | (generado_por = auth.uid()) | -
-- Service role full access               | ALL    | true   | true
```

Confirmado además por el hecho de que hay 24 reportes guardados (ver Resumen).

**Deuda menor asociada (no es un bug):** quedaron **dos** políticas UPDATE redundantes con el mismo predicado (`Authenticated users can update reports` y `Users can update own reports`). No causa daño — PostgreSQL las combina con OR — pero la segunda ya no hace lo que su nombre dice. Limpiarla es cosmético y necesita migración propia.

---

## Issue 6 — Descarga del PDF rota ✅ NO REPRODUCIBLE

**Síntoma original:** el PDF no se descargaba tras generar el reporte; se sospechaba de RLS en el bucket o de archivos que nunca llegaban a Storage.

**Evidencia:** los 35 reportes tienen `url_storage` poblada. Un reporte que no llega a Storage no obtiene URL.

```sql
-- verificado 2026-10-19
select count(*) total, count(url_storage) con_url, max(created_at)::date ultimo
from reportes_semanales;
-- total = 35 | con_url = 35 | ultimo = 2026-10-19
```

Si vuelve a fallar una descarga, ábrase como bug nuevo con el error del navegador: el modo de falla de 2026-02 (archivo inexistente) ya no aplica.

---

## Lo que sigue

1. **Issue 3b** — llevar a decisión del dueño la regla de valoración del inventario consumido. Es lo único abierto de este archivo.
2. **Datos históricos** — 19 filas de `aplicaciones_compras` en 3 aplicaciones cerradas (enero–febrero 2026) tienen `costo_estimado` en NULL. Solo se tocan si el dueño quiere recalcular costos históricos.
3. **Cosmético** — la política UPDATE duplicada del Issue 5.

---

## Issue 7 — Aplicaciones planeadas: blancos y mezclas siempre vacíos 🔧 ARREGLO EN PR #336 (nuevo 2026-10-19)

**Síntoma:** cada generación del reporte hace dos consultas que PostgREST rechaza con **400**, ambas en `fetchAplicacionesPlaneadas()` (`src/utils/fetchDatosReporteSemanal.ts`). El error no se mira, así que el reporte sale sin blancos biológicos y el asistente muestra siempre «0 mezclas».

**Evidencia** — edge logs del reporte de la semana 42 (generado 2026-10-19 01:03Z):

```
GET /rest/v1/plagas_enfermedades_catalogo?select=id,nombre&id=in.([])  -> 400
    postgres: invalid input syntax for type uuid: "[]"
GET /rest/v1/aplicaciones_mezclas?select=id,nombre,numero_orden,...    -> 400
    postgres: column aplicaciones_mezclas.nombre does not exist
```

**Causa:** `aplicaciones.blanco_biologico` es `text` con un arreglo JSON serializado (22 de 22 filas empiezan con `[`) y el código lo pasaba entero como si fuera un id; `aplicaciones_mezclas` tiene `nombre_mezcla`/`numero_mezcla`, no `nombre`/`numero_orden`. Independiente del issue 3b.

