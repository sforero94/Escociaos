# Plan de implementación — Reportes Financieros (P&G + Flujo de Caja)

**Ruta:** `/finanzas/reportes` · **Estado:** IMPLEMENTADO · **Fecha:** 2026-07-21

---

## 1. Qué vamos a construir

Dos reportes × cuatro vistas:

| | **Global** | **Aguacate Hass** | **Ganado** | **Hato Lechero** |
|---|---|---|---|---|
| **P&G** | ✅ | ✅ (+ modo cosecha) | ✅ (con costo de venta) | ✅ |
| **Flujo de Caja** | ✅ | ✅ | ✅ | ✅ |

- **Global** incluye *todos* los negocios, incluidos Caballos, Agrícola y cualquier otro que exista. Esos negocios menores **no tienen vista propia**: solo aparecen agregados dentro de Global, en una línea "Otros negocios".
- **P&G** = resultado del negocio, en **períodos acumulados**: Q1 · Q1–Q2 · Q1–Q3 · Año, del año que se seleccione. Para aguacate, además un modo **por cosecha** (Traviesa / Principal).
- **Flujo de Caja** = movimiento de la plata, **12 columnas mensuales + Total**.

Los dos responden preguntas distintas y por eso no dan el mismo número: el P&G dice *cuánto ganó el negocio*, el flujo dice *cómo se movió la caja*.

---

## 2. Reglas de negocio aprobadas

Estas seis reglas son el contrato del reporte. Cualquier cifra que no cuadre se explica con una de ellas.

**2.1 Solo cuentan los gastos confirmados.** Los que están en estado `Pendiente` no se suman en ninguna línea; se muestran aparte con su monto total y un enlace al listado, para que se sepa cuánto falta por revisar.

**2.2 Comprar un animal no es un gasto: es cambiar plata por un activo.**
- La compra de ganado **no aparece en el P&G**. Sí aparece como salida en el flujo de caja.
- Cuando se vende un animal, el P&G registra como costo el **costo promedio ponderado por cabeza**, recalculado cronológicamente con cada compra.
- La comida, sales, drogas y mano de obra del ganado son gasto del período; no se suman al valor del animal.
- **Consecuencia esperada y correcta:** un trimestre sin ventas de ganado muestra margen negativo. No es un error del reporte: es el costo de sostener el hato mientras engorda.

**2.3 El costo del inventario inicial de ganado es un dato que se carga, no que se adivina.** Mientras no se cargue (cabezas + costo por cabeza a una fecha de corte, desde Configuración), el reporte usa como estimado el promedio de las compras más antiguas y **lo advierte en pantalla**.

**2.4 Cada cosecha carga los gastos del semestre en que se trabajó esa fruta.**
- **Traviesa N** (ventas may–oct de N) ← gastos de **ene–jun de N**.
- **Principal N** (ventas nov de N−1 a abr de N) ← gastos de **jul–dic de N−1**. Ejemplo: Principal 2026 → gastos de jul–dic 2025.
- Así cada peso gastado se usa en exactamente una cosecha, sin huecos ni repeticiones. El encabezado de cada columna muestra literalmente el rango de fechas que sumó.

**2.5 No hay prorrateo entre negocios.** Cada gasto ya viene con su negocio asignado (`fin_gastos.negocio_id` es obligatorio). Los gastos indirectos de un negocio son solo los suyos. Lo que no pertenece a Aguacate, Ganado o Hato vive únicamente en la vista Global.

**2.6 Los Reportes son de Gerencia.** Otro rol con el módulo `finanzas` concedido ve un mensaje explícito — *"Este reporte requiere rol Gerencia"* — y no un P&G lleno de ceros.

---

## 3. Estructura del P&G

Cinco bloques, iguales para las cuatro vistas. Lo que cambia entre negocios es el contenido de las líneas de detalle y las métricas unitarias.

```
INGRESOS
  (detalle por categoría de ingreso; en Global, por negocio)
  ─────────────────────────────────────────────
  Total Ingresos

COSTOS DIRECTOS
  (detalle por categoría → concepto, expandible)
  + Costo de venta de ganado          ← solo Ganado y Global
  ─────────────────────────────────────────────
  Total Costos Directos

  ★ MARGEN DE CONTRIBUCIÓN            (valor y % sobre ingresos)

GASTOS INDIRECTOS
  (detalle por categoría → concepto)
  ─────────────────────────────────────────────
  Total Gastos Indirectos

  ★ UTILIDAD OPERATIVA                (valor y % sobre ingresos)

INDICADORES  (línea informativa, no suma)
```

**Indicadores por vista:**

| Vista | Indicadores |
|---|---|
| Aguacate | Kilos vendidos · Precio promedio por kilo · **Costo por kilo vendido** |
| Ganado | Cabezas vendidas · Precio promedio por kilo · **Margen por cabeza vendida** · Inventario de semovientes al cierre |
| Hato | Litros vendidos · Precio promedio por litro · **Costo por litro** |
| Global | Ingresos y utilidad operativa por negocio |

**Fuentes por vista** — la diferencia que más importa:

| Vista | Ingresos | Costos |
|---|---|---|
| Aguacate · Hato | `fin_ingresos` del negocio | `fin_gastos` del negocio, confirmados |
| **Ganado** | **`fin_transacciones_ganado` tipo `venta`** — *nunca* `fin_ingresos` | `fin_gastos` del negocio + línea de costo de venta calculada |
| Global | Ambas fuentes, todos los negocios | `fin_gastos` de todos los negocios + costo de venta de ganado |

> **Nota de nombres:** el módulo de Producción ya calcula un *costo por kilo por lote* (agronómico, sobre kilos cosechados). El del P&G es *costo por kilo vendido* (financiero). Van a dar números distintos y está bien — por eso llevan nombres distintos en pantalla. Si alguna vez se llaman igual, perdemos la confianza en ambos.

---

## 4. Estructura del Flujo de Caja

12 columnas (Ene–Dic) + Total, del año seleccionado. Base: **fecha de registro** del movimiento — el sistema no almacena fecha de pago, y la pantalla lo dice explícitamente: *"este reporte no es una conciliación bancaria"*.

```
ENTRADAS
  Venta de aguacate · Venta de leche · Venta de ganado · Otros ingresos
  Total Entradas

SALIDAS
  (una línea por categoría de gasto confirmado)
  Compra de ganado (inversión en inventario)      ← línea separada y rotulada
  Total Salidas

  Flujo neto del mes
  Flujo acumulado del período

INFORMATIVO
  Gastos pendientes por confirmar — no suma, solo avisa
```

La **asimetría** (la compra de ganado sale en el flujo pero no en el P&G) es lo que más se malinterpreta al leer el reporte. Por eso va en línea propia, rotulada, con una nota fija en la vista.

**Sin saldo bancario en esta entrega.** La fila se llama *"Flujo acumulado del período"* y arranca en cero. Cuando Gerencia cargue un saldo inicial en Configuración, la misma fila pasa a llamarse *"Saldo de caja"*. Mostrar un saldo que arranca en 0 cada enero e invita a conciliarlo contra el banco sería peor que no mostrarlo.

---

## 5. Arquitectura

Patrón ya probado en el repo: motor puro testeable + hook de fetching + componentes tontos. Copia el modelo de `calculosCostoKg.ts` / `useCostoKg.ts`.

```
Supabase ──► useReportesFinancierosData.ts ──► DatosCrudosReportes
                (solo fetch, con paginación)          │
                                    ┌─────────────────┴─────────────────┐
                                    ▼                                   ▼
                            calculosPyG.ts                     calculosFlujoCaja.ts
                            periodosReporte.ts                          │
                            clasificacionCostos.ts                      │
                            costoVentaGanado.ts                         │
                                    ▼                                   ▼
                              ReportePyG                        ReporteFlujoCaja
                                    └───────────┬───────────────────────┘
                                                ▼
                                    TablaPyG · TablaFlujoCaja · PDF · Excel
```

**Motor puro** (`src/utils/`, cero imports de Supabase, todo con Vitest):
`periodosReporte.ts` (trimestres acumulados y períodos de cosecha) · `clasificacionCostos.ts` (directo vs indirecto) · `costoVentaGanado.ts` (promedio ponderado móvil) · `calculosPyG.ts` · `calculosFlujoCaja.ts` · `supabase/fetchAll.ts` (paginación).

**Contrato de datos** (`src/types/reportesFinancieros.ts`, archivo nuevo): las líneas son un **array plano ordenado** con `nivel` + `padre_id`, no un árbol. Así la tabla, el PDF y el Excel recorren lo mismo sin reimplementar el layout. Los valores son **siempre positivos**; el signo lo lleva un flag (`esResta` / `signo`), lo que evita el clásico `-$-500` entre pantalla y PDF.

**Componentes** (`src/components/finanzas/reportes/`, carpeta nueva): `ReportesControls` (año + vista + modo) · `PyGView` · `TablaPyG` · `FlujoCajaView` · `TablaFlujoCaja` · `AdvertenciasReporte`.

**Se reemplaza, no se refactoriza:** `PyGReport.tsx` se borra. Su lógica útil (agrupar por categoría) es trivial de reescribir; todo lo demás está mal (no filtra confirmados, ignora ganado, no tiene períodos acumulados ni clasificación de costos).

**Advertencias como ciudadano de primera clase.** El reporte se autodefiende: gastos pendientes excluidos, gastos sin clasificar, ingresos sin etiqueta de cosecha, ventas de ganado que exceden el inventario registrado, posibles duplicados de ganado, consultas truncadas. Es lo que impide que una cifra silenciosamente incompleta pase por correcta.

---

## 6. Cambios en la base de datos

Dos migraciones, ambas idempotentes (el esquema en producción divergió del SQL versionado).

**`051_add_clasificacion_costos.sql`** — columna `tipo_costo` (`directo` | `indirecto`) en `fin_categorias_gastos`, más un override opcional en `fin_conceptos_gastos` para las excepciones. Default `indirecto`: lo no revisado cae *debajo* de la línea de margen y se reporta como advertencia, en vez de inflar el margen en silencio. Se edita desde Configuración → Finanzas, sin deploy.

> Clasificar mal un gasto solo mueve la línea entre Margen de Contribución y Utilidad Operativa — **nunca cambia la Utilidad Operativa**. Por eso es seguro estrenar con defaults imperfectos.

Semilla inicial propuesta (editable después):
- **Directos:** Mano de Obra · Insumos y fertilizantes · Combustibles · Transporte · alimentación · sanidad/veterinario · cosecha.
- **Indirectos:** Administrativos · Servicios Públicos · Mantenimiento.

**`052_create_fin_parametros.sql`** — tabla genérica de parámetros financieros (clave, año, negocio, valor) con RLS Gerencia. Resuelve dos necesidades con una migración: `costo_cabeza_inventario_inicial` + `fecha_corte_inventario_ganado` (regla 2.3) y `saldo_inicial_caja` (sección 4).

**No se toca:** no se agrega `fecha_pago`, ni `negocio_id` a `fin_transacciones_ganado` (esa tabla *es* el negocio Ganado), ni se regenera `src/types/database.ts`.

---

## 7. Plan por fases

Cuatro fases. Cada una entrega algo que se puede abrir y usar.

### Fase 0 — Verificación de datos · ✅ COMPLETADA

Ejecutada contra producción el 2026-07-21. Resultados:

| Verificación | Resultado |
|---|---|
| Duplicados de ganado en `fin_gastos`/`fin_ingresos` | **0**. La limpieza sí se corrió. La detección queda igual en el motor como defensa permanente. |
| Políticas RLS de las tablas `fin_*` | **Gerencia-only** vía `es_usuario_gerencia()`, en las 7 tablas. Confirma el RoleGuard de la regla 2.6. |
| Catálogo real de categorías de gasto | **14 categorías**, ninguna con el nombre del SQL versionado. Las reales: Mano de Obra y Asistencia Técnica · Alimentos y Fertilizantes · Impuestos · Gastos Generales · Equipos y Herramientas · Control de Plagas · Gastos Casa · Mantenimiento de Instalaciones · Transporte y Logística · Otros General · Proyectos Especiales · Caballos · Ganado · Siembra de Arboles. Por eso la semilla de la migración 051 usa `ILIKE`, no igualdad. |
| Gastos en estado `Pendiente` | **0**. El filtro `Confirmado` hoy no descarta nada. |
| Etiquetas de cosecha del aguacate | **6, todas válidas**; cero ingresos sin etiqueta. |
| Muertes de ganado confirmadas | **0**. Confirma que la mortalidad puede quedar fuera de esta entrega. |
| Ingresos de Ganado en `fin_ingresos` | **0 filas** — todo el ingreso de ganado vive en `fin_transacciones_ganado`. |
| Volumen | 4.371 gastos (~1.250/año) · 219 ingresos · 92 transacciones de ganado. **El tope de 1.000 filas de PostgREST sí muerde**: `fetchAll` es obligatorio. |

**Dos hallazgos que cambiaron el plan:**

1. **Existe «Oficina Central»**: $2.356M en gastos confirmados históricos y **cero ingresos**. Es administración compartida. Por la decisión de no prorratear, vive solo dentro de la vista Global — ver la nota al final de este documento.
2. **Se vendieron 801 cabezas y solo se compraron 571.** Había ganado antes del primer registro (ene-2023), así que el inventario inicial **no es opcional**: sin él, 230 cabezas se costean con un estimado. El reporte lo advierte en pantalla hasta que se cargue el dato.

### Fase 1 — Fundación + P&G trimestral · **L**

Las cuatro vistas del P&G con columnas Q1 / Q1–Q2 / Q1–Q3 / Año, categorías expandibles a concepto, banner de advertencias, RoleGuard de Gerencia, y la pestaña de clasificación de costos en Configuración.

**Prueba de aceptación que cierra el problema actual:** la Utilidad Operativa anual de Aguacate coincide exactamente con `ingresos − gastos confirmados` del dashboard de Finanzas. Hoy no coinciden.

*Tests:* `periodosReporte.test.ts` (acumulación y bordes de trimestre) · `clasificacionCostos.test.ts` (override concepto sobre categoría, default indirecto) · `calculosPyG.test.ts` (pendientes excluidos y reportados; suma de detalle = subtotal; `Ingresos − Directos − Indirectos = Utilidad Operativa` exacto; margen `null` y no 0% cuando no hay ingresos; **reclasificar una categoría cambia el margen pero no la utilidad operativa**).

### Fase 2 — Ganado y Flujo de Caja · **L**

Van juntas: comparten la migración 052 y son las dos caras de la misma regla (la compra de ganado sale del P&G y entra al flujo). Separarlas obliga a explicar el mismo concepto dos veces.

Entrega el costo de venta de ganado dentro de Costos Directos, las cuatro vistas de Flujo de Caja, y una pantalla mínima en Configuración para cargar el costo del inventario inicial y el saldo de caja.

*Tests:* `costoVentaGanado.test.ts` (promedio móvil con compras a precios distintos; venta que agota inventario; venta mayor al inventario → advertencia; con y sin parámetro inicial; **truncar el histórico cambia el costo — el cálculo depende de la serie completa**) · `calculosFlujoCaja.test.ts` (siempre 12 posiciones; acumulado = suma prefija; la compra de ganado está en el flujo y **ausente** del P&G del mismo período — test cruzado).

### Fase 3 — Modo cosecha + exportes · **M**

Toggle "Trimestres / Cosecha" en Aguacate (regla 2.4, con el desfase de año como una constante única y testeada), más PDF y Excel para ambos reportes. Los exportes van al final a propósito: consumen el contrato ya estabilizado; hacerlos antes es reescribirlos.

*Trampa a evitar:* los generadores de PDF del repo usan un formateador distinto al de la pantalla (`formatearMoneda` con símbolo COP vs `formatCurrency`). El PDF y la tabla deben usar **el mismo**, o las cifras se verán distintas.

---

## 8. Qué NO vamos a hacer (y por qué)

| No hacer | Razón |
|---|---|
| Agregar fecha de pago | Decisión tomada. El flujo se rotula "por fecha de registro". Un backfill de ~4.400 filas no tiene fuente de verdad. |
| Contar consumo de inventario (`movimientos_diarios_productos`) en el P&G | **Duplicaría el insumo**: ya se contó al comprarlo, vía el trigger compra→gasto. El P&G y el Flujo se alimentan *exclusivamente* de `fin_gastos`, `fin_ingresos` y `fin_transacciones_ganado`. El costeo por lote es otro universo. |
| Comparativo contra año anterior dentro del P&G | Los 4 períodos acumulados ya dan la tendencia del año, y el selector de año permite mirar el anterior. `/finanzas/presupuesto` ya entrega el YoY por concepto. |
| Comparativo contra presupuesto | Es literalmente lo que hace `/finanzas/presupuesto`. |
| Gráficas | Este reporte es una tabla que se lee, se imprime y se discute. La primera entrega gana o pierde por si los números cuadran. |
| Depreciación y activos fijos | Decisión tomada: estructura de margen de contribución, sin depreciación. |
| Baja por mortalidad en el costo de venta | Los datos de `gan_movimientos` son de jun-2026 y el volumen es mínimo; castigar el costo con un dato apenas poblado mete más error del que corrige. Se emite advertencia si hay muertes confirmadas. |
| Costo de venta por finca o FIFO por lote | `fin_transacciones_ganado.finca` es texto libre con mayúsculas inconsistentes y no hay trazabilidad animal por animal. Sería precisión falsa. |
| Vista propia para Caballos y Agrícola | Decisión tomada: solo entran en Global. |
| Abrir las políticas RLS de finanzas a otros roles | Cambio de frontera de seguridad ajeno a esta funcionalidad. Su propio ticket. |
| Drill-down a transacciones, Excel en Fase 1, saldo bancario | Fase 2 del producto. |

---

## 9. Riesgos conocidos

| Riesgo | Mitigación |
|---|---|
| **Ganado duplicado** en `fin_gastos`/`fin_ingresos` de una limpieza que quizá nunca corrió | Verificación en Fase 0 **y** detección permanente en el motor (misma fecha + diferencia de valor < $1 → se excluye y se advierte). Doble capa a propósito. |
| **Tope de 1.000 filas** de PostgREST — ningún hook de finanzas pagina hoy, y hay ~4.400 gastos | `fetchAll` obligatorio en toda consulta de reportes, más advertencia si algo se trunca. |
| **Clases de Tailwind congeladas**: `table-fixed`, `tabular-nums`, `border-collapse` y los anchos arbitrarios **no existen** en `index.css` y se ignoran en silencio | Los anchos, la alineación numérica y la columna congelada se definen como CSS real en `globals.css` (`.tabla-financiera`, `.celda-num`, `.col-etiqueta`). Copiar `PresupuestoTable.tsx` como plantilla propagaría el bug: ese archivo ya usa esas clases y no hacen nada. |
| **Datos de costo incompletos antes de 2026** (mano de obra desde oct-2025, insumos desde dic-2025) — la cosecha Principal 2026 tendrá el semestre jul–dic 2025 parcial | Advertencia visible en el modo cosecha. Se muestra, no se esconde. |
| **Calidad del etiquetado por negocio** en Hato y Ganado | Se dimensiona en Fase 0. Un reporte correcto sobre datos mal etiquetados es inútil. |
| **Zona horaria**: bucketear meses con `new Date()` corre las fechas | Bucketing por corte de string (`fecha.substring(5,7)`), que ya es la convención del repo. |

---

## 10. Documentos fuente

Brief de producto (CPO) y brief técnico (CTO) elaborados el 2026-07-21 sobre este mismo alcance. Decisiones del dueño registradas en las secciones 1 y 2 de este documento.

---

## 11. Resultado de la implementación (2026-07-21)

**Migraciones aplicadas a producción:** `051_add_clasificacion_costos` (7 categorías directas / 7 indirectas) y `052_create_fin_parametros`.

**Verificación:** typecheck limpio · ESLint 0 errores · 565 tests en verde (77 nuevos) · build de producción OK · motor contrastado contra los datos reales de producción, cuadrando **al peso** con el cálculo equivalente en SQL en las 4 vistas.

### Cifras reales al cerrar la implementación (año 2026, acumulado a julio)

| Vista | Ingresos | Costos directos | Margen contrib. | Utilidad operativa |
|---|---:|---:|---:|---:|
| Global | $668.192.362 | $1.016.935.926 | −$348.743.564 (−52,2%) | −$603.268.218 |
| Aguacate Hass | $68.857.500 | $409.986.870 | −$341.129.370 | −$360.603.305 |
| Ganado | $405.407.650 | $320.926.433 | $84.481.217 (20,8%) | $81.451.417 |
| Hato Lechero | $144.432.653 | $83.000.542 | $61.432.111 (42,5%) | $46.974.054 |

El aguacate aparece muy negativo porque la cosecha grande aún no se ha vendido: es exactamente la distorsión que corrige la vista por cosecha.

### Dos cosas que quedan sobre la mesa

1. **Oficina Central no se reparte.** En 2026 acumula $311M de gasto ($119M directos + $192M indirectos) sin ingreso alguno. Por la decisión de no prorratear, ninguna de las tres utilidades por negocio la carga: sumadas, las utilidades de Aguacate, Ganado y Hato son mejores que el resultado real de la finca. La diferencia es visible en la vista Global. Si en algún momento se quiere repartir, el punto de cambio es una sola función pura.
2. **Falta cargar el inventario inicial de ganado** (cabezas + costo por cabeza) en Configuración → Finanzas → Reportes. Mientras tanto, 230 cabezas se costean al promedio de compras ($2.953.620) y el reporte lo advierte.
