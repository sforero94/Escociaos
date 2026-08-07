# F2 punto 2 (rehecho) — Barrido de anchos y layout recién vivos

Ejecutado 2026-08-06 sobre `feat/tailwind-pipeline` (`59f3ce7`, post-F1 `2fe5bba` + F2.1 sidebar
`815428c`). Análisis 100% estático (Read/Bash/Grep/Node, sin navegador). Objetivo corregido: no
clases de recorte (`docs/tailwind-spike/barrido-recorte.md` ya cazó eso y descubrió que era el
lado equivocado) sino las **restricciones de ancho y reparto de espacio** — `max-w-*`, `w-*`,
`min-w-*`, `basis-*`, `flex-1`, `shrink-*`, `grid-cols-*`, `col-span-*` y sus variantes
responsive — que estaban muertas antes de F1 y ahora estrechan un contenedor con texto adentro.

---

## 0. Método

No repetí la reconstrucción del inventario de F0 (`analisis-clases-muertas.md`) porque esa fuente
no publica el listado crudo con archivo:línea, solo agregados por pantalla — filtrar su salida no
alcanzaba para el juicio caso-por-caso que pide esta tarea. En vez de eso hice una extracción
propia, metodológicamente equivalente pero **con dos verificaciones que F0 no tenía**:

1. **Extracción con número de línea** de todo `className=`/`classNames=`/`cva(...)` en
   `src/**/*.tsx` (299 archivos), con balanceo real de `{}`/`()`/strings — mismo método que F0
   §1.2, reimplementado en Node para poder anotar archivo+línea por cada token.
2. **Comparación contra DOS fuentes de CSS, no una:**
   - `git show 2fe5bba^:src/index.css` (el build congelado, pre-F1) — igual que F0/barrido-recorte.
   - **El CSS real que produce `npm run build` hoy** (`build/assets/index-BSQrS6od.css` +
     `FinanzasDashboard-*.css`, 175.981 + 5.499 bytes) — F0 y barrido-recorte asumieron que "usada
     en el código" implica "compila hoy"; yo lo comprobé corriendo el build real. Resultado:
     **0 de las clases de la familia ancho/layout quedaron "muertas y sin compilar"** — todo lo
     que el código pide, compila. Esto también resolvió con certeza casos ambiguos como
     `table-fixed` (no es `w-*`/`max-w-*` en sí, pero es la pieza que decide si un `w-[Npx]` en
     un `<col>` aprieta de verdad o es solo una sugerencia de layout automático — lo comprobé
     cuando hizo falta, ver §2).

Pertenencia a selector es **exacta**, no substring — mismo cuidado que F0 §1.1 (`\.sm\:flex` no
matchea `.sm\:flex-row`).

**Verificación por muestreo pedida en la consigna** (contra el CSS congelado, cuidando el formato
con salto de línea antes de `{`): hecha con `grep` directo además de la comprobación programática,
para `lg:grid-cols-5`, `md:grid-cols-3`, `max-w-full`, `w-44`, `min-w-[200px]`, `table-fixed` y
`w-full` — los siete coinciden con la clasificación automática. Detalle en la sección
correspondiente de cada hallazgo.

---

## 1. Cuántas de las 608 recién-vivas son de ancho/layout

Extraje **2.643 apariciones** (67+18+7+2+18+1 = 113 tokens distintos) que matchean las familias
pedidas, en 299 archivos. De esas:

| | Apariciones | Tokens distintos |
|---|---|---|
| Ya vivas antes de F1 (sin cambio) | 2.482 | — |
| **Recién vivas por F1** | **161** | **64** |
| Muertas antes de F1 y siguen sin compilar hoy | 0 | 0 |

Desglose de las 161 recién-vivas por familia:

| Familia | Apariciones | Tokens distintos |
|---|---|---|
| `w-*` | 124 | 38 |
| `min-w-*` | 16 | 10 |
| `max-w-*` | 8 | 5 |
| `grid-cols-*` | 6 | 6 |
| `col-span-*` | 4 | 2 |
| `grow`/`basis-*` | 3 | 3 |

**28 de las 161 llevan variante responsive** (`sm:`/`md:`/`lg:`/`xl:`/`2xl:`) — el resto son
literales sin variante (`w-44`, `w-3.5`, `max-w-full`…).

**Negativo importante y verificado, no asumido:** `min-w-0`, `flex-1`, `shrink-0` y
`flex-shrink-0` — el mecanismo "habilitador" que hace que un `truncate`/`line-clamp` dentro de un
flex/grid child pueda de verdad encogerse — **ya estaban vivos, los cuatro, antes de F1** (0
apariciones recién-vivas en cualquiera de los dos, sobre 192+239 apariciones totales en el repo).
Esto generaliza lo que `barrido-recorte.md` comprobó caso-por-caso (2.1/2.5/2.6): el habilitador
nunca es la pieza nueva. La pieza nueva siempre está en `max-w-*`/`w-*`/`grid-cols-*`/`col-span-*`
— el contenedor que de verdad decide cuánto espacio hay, no el que permite usarlo.

**Ruido a descontar antes de juzgar daño**: de las 161, **55 apariciones son tamaño de ícono o
primitiva de UI sin texto de dominio adentro** — `w-3.5`/`w-2.5` en íconos Lucide (repetido en
~25 archivos: `ChatPanel`, `ClimaCard`, `GastosList`/`IngresosList`, `DashboardKPICard`,
`KPIInventarioSection`…), `min-w-8/9/10` de `ui/toggle.tsx` (tamaño mínimo de botón, no texto),
`w-px`/`after:w-1` del handle de `ui/resizable.tsx`, `grow-0 basis-full` de `ui/carousel.tsx`,
`w-max`/`max-w-max` de `ui/navigation-menu.tsx` (componente sin importadores, código muerto —
mismo hallazgo de F0). Ninguna de estas 55 estrecha un contenedor de texto variable. Quedan
**106 apariciones candidatas reales** para el juicio de la sección 2.

---

## 2. Sospechosas ordenadas por daño

### Nivel 1 — mecanismo confirmado de recorte o reflujo

#### 2.1 — `PresupuestoTable.tsx` + `PresupuestoCategoriaRow.tsx`/`PresupuestoConceptoRow.tsx` — categoría/concepto de presupuesto

```
src/components/finanzas/presupuesto/PresupuestoTable.tsx:43      table-fixed          ← MUERTA pre-F1
src/components/finanzas/presupuesto/PresupuestoTable.tsx:46-57   <col className="w-7"/>, w-[108px]×3, w-[100px],
                                                                   w-[56px]×2, w-[76px]×2, w-[72px], w-[112px]  ← TODAS muertas pre-F1
src/components/finanzas/presupuesto/PresupuestoCategoriaRow.tsx:40  <td className="pl-2 pr-3 py-2.5 truncate">
                                                                       <span className="truncate">{categoria.categoria_nombre}</span>
```

`table-fixed` estaba **muerta** (verificado: 0 apariciones en el CSS congelado, comprobado
también con `grep '\.table-fixed'`). Con `table-fixed` muerta, los ~9 `<col>` con ancho en píxel
tampoco tenían efecto — el navegador usaba layout automático, y la única columna sin ancho
explícito (la de categoría/concepto, `<col />` en blanco, línea 47) se llevaba todo el espacio que
necesitara. **Ahora las dos cosas viven juntas**: `table-fixed` fuerza el algoritmo rígido, y los
~9 anchos en píxel (que suman bastante más de lo que cualquier fila individual necesita) reclaman
su espacio primero, dejando "lo que sobre" para la columna de nombre — que es la única sin tope.
El `root CLAUDE.md` documenta la categoría real de producción: **"Mano de Obra y Asistencia
Técnica"** (30 caracteres). `truncate` en ambos niveles (`<td>` y `<span>` interno).

**Desenlace esperado: RECORTE.** Es la explicación de mecanismo completa que
`barrido-recorte.md` §2.7 no tenía — ellos encontraron el `truncate`, no la causa.

#### 2.2 — `DetalleGastosExpandible.tsx` + `PivotTableGastos.tsx` — negocio/categoría en el pivote de Gastos

```
src/components/finanzas/dashboard/components/DetalleGastosExpandible.tsx:128  <table className="w-full text-sm table-fixed">
src/components/finanzas/dashboard/components/DetalleGastosExpandible.tsx:130-136  <col className="w-[16%]"/>, w-[14%]×2, w-[10%], w-[14%]×2, w-[10%]
src/components/finanzas/dashboard/components/DetalleGastosExpandible.tsx:184  <td className="px-3 py-2 font-medium text-foreground">{row.negocio}</td>
src/components/finanzas/dashboard/components/DetalleGastosExpandible.tsx:212  <td className="px-3 py-2 pl-10 text-brand-brown/70 text-sm">{cat.negocio}</td>
```

Mismo mecanismo exacto que 2.1 (`table-fixed` + `<colgroup>` en `%`, ambos muertos pre-F1,
verificado igual), en un archivo **no citado** por `barrido-recorte.md`. La columna de
negocio/categoría se queda fija en 16% del ancho de la tabla (antes: se ajustaba al contenido).
Las filas anidadas de categoría suman `pl-10` (40px) de indentación **dentro** de ese 16%, así que
la fila más profunda tiene menos espacio real que la de negocio. **A diferencia de 2.1, esta
columna NO lleva `truncate`/`whitespace-nowrap`** — no hay `<td>` con esas clases en ninguna de
las dos filas.

**Desenlace esperado: REFLUJO, no recorte.** El texto envuelve a 2 líneas en vez de cortarse; el
riesgo es que la fila crezca de alto y descuadre la alineación vertical con las columnas numéricas
`tabular-nums` de al lado. `PivotTableGastos.tsx` (la vista NO expandible/"Gastos Acumulados por
Negocio") tiene el mismo `<colgroup>` idéntico — mismo riesgo, menor (solo nombres de negocio,
más cortos que categoría/concepto).

#### 2.3 — `MapaCalorIncidencias.tsx` — nombre de lote en la cabecera del mapa de calor

```
src/components/monitoreo/MapaCalorIncidencias.tsx:515  <table className="... table-fixed" style={{minWidth: ...}}>   ← table-fixed MUERTA pre-F1
src/components/monitoreo/MapaCalorIncidencias.tsx:524  <th className="... w-[180px]" ...>                            ← MUERTA pre-F1
src/components/monitoreo/MapaCalorIncidencias.tsx:526  <div className="font-bold text-foreground text-sm truncate">{columna.loteNombre}</div>
src/components/monitoreo/MapaCalorIncidencias.tsx:518/537  <th className="... w-[200px]" ...>  (columna "Plaga / Lote", sin truncate)
```

`barrido-recorte.md` §2.5 ya había identificado el `truncate` de la línea 526 y el `w-[180px]` de
la 524 como sospechosos, pero sin verificar si `w-[180px]` mismo estaba muerto pre-F1. **Lo
estaba** (igual que `table-fixed` en la misma tabla) — confirmación directa, no solo
corroboración. `fila.plagaNombre` (línea 538, columna izquierda `w-[200px]`, también recién viva)
**no** lleva `truncate` — mismo patrón de dos desenlaces que 2.1/2.2 en la misma tabla: la columna
de lote recorta, la de plaga reordena su alto.

**Desenlace esperado: RECORTE** en `loteNombre` (columna de lotes), **REFLUJO** en `plagaNombre`
(columna izquierda). Confusión de dos lotes por prefijo compartido en un mapa de plagas tiene
consecuencia agronómica directa (tratar el lote equivocado) — mismo argumento que ya daba
`barrido-recorte.md`.

#### 2.4 — `TrabajadorMultiSelect.tsx` — grid de tarjetas de selección de mano de obra

```
src/components/shared/TrabajadorMultiSelect.tsx:212
<div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 xl:grid-cols-6 gap-2">
```

`grid-cols-2` y `md:grid-cols-3` **ya estaban vivas** pre-F1 (verificado). `lg:grid-cols-5` y
`xl:grid-cols-6` **estaban muertas**. Consecuencia: antes de F1, en CUALQUIER pantalla ≥768px la
rejilla se quedaba en 3 columnas (la última regla viva) — tarjetas relativamente anchas. Ahora, en
desktop grande (≥1024px) salta a 5 columnas, y en pantallas muy anchas (≥1280px) a 6 — tarjetas
más angostas exactamente donde antes había más aire. Dentro de cada tarjeta, sin ancestro nuevo
que cambie: `<p className="font-medium text-xs text-gray-900 pr-5 truncate">{empleado.nombre}</p>`
(línea 270) y `<p className="text-[10px] text-gray-500 mt-0.5 truncate">{empleado.cargo}</p>`
(línea 274), mismo patrón para contratistas en la línea 338.

**Desenlace esperado: RECORTE**, y es exactamente el mecanismo que `barrido-recorte.md` §2.2 no
pudo confirmar ("no hay `min-w-0` visible en la cadena que revisé" — no hacía falta, el
`min-w-0` no es el problema aquí, el ancho de columna de grid sí). Este es el archivo que F0
citaba con 14-ALTO en profundidad-2 vía `CrearEditarTareaDialog.tsx` — es una interfaz de
selección de personal para registrar jornales, no solo lectura: confundir dos nombres cortados
significa atribuir el jornal a la persona equivocada.

#### 2.5 — `DashboardMonitoreoV3.tsx` — selectores de ronda/floración/CE

```
src/components/monitoreo/DashboardMonitoreoV3.tsx:973   <SelectTrigger className="w-80">     ← MUERTA pre-F1 (selector de Ronda)
src/components/monitoreo/DashboardMonitoreoV3.tsx:1425  <SelectTrigger className="w-56">     ← MUERTA pre-F1 (selector de Ronda de floración)
src/components/monitoreo/DashboardMonitoreoV3.tsx:1529  <SelectTrigger className="w-56">     ← MUERTA pre-F1 (filtro de lote CE)
src/components/monitoreo/DashboardMonitoreoV3.tsx:1542  <SelectTrigger className="w-56">     ← MUERTA pre-F1 (filtro de fecha CE)
```

`ui/select.tsx:44` — el `SelectTrigger` base ya trae `flex w-full ... *:data-[slot=select-value]:
line-clamp-1` **desde siempre** (`w-full` y el `line-clamp-1` compuesto sobre `[data-slot=
select-value]` — verifiqué el selector compuesto exacto, `.\*\:data-\[slot\=select-value\]\:
line-clamp-1`, presente en el CSS congelado). Antes de F1, sin `w-80`/`w-56` vivas, el trigger se
quedaba en `w-full` — se estiraba al ancho del contenedor flex que lo envuelve (`flex items-center
gap-3`, sin tope), así que el `line-clamp-1` casi nunca tenía que recortar nada. Ahora el trigger
tiene un tope explícito (320px / 224px) y el mismo `line-clamp-1` — que nunca cambió — sí tiene
trabajo que hacer. El contenido es texto compuesto y largo: el selector de ronda arma
`{r.nombre || 'Sin nombre'} — {fecha inicio}{ a fecha fin | (abierta)}`, no solo un nombre corto.

**Desenlace esperado: RECORTE**, con un mecanismo estructuralmente idéntico al caso testigo del
plan (`truncate` no cambia, el contenedor sí) pero en una familia de componentes — `Select` — que
ningún barrido anterior había mirado. Es la misma pantalla (`/monitoreo`) que F0 ya midió como
degradada en móvil ("la píldora 'Ronda abierta' queda casi ilegible", desborde 390→446px) — este
hallazgo aporta un mecanismo adicional y distinto (no el mismo `Toggle`/`ToggleGroup` ya conocido)
en el mismo módulo.

### Nivel 2 — riesgo real pero menor, o mecanismo incierto

#### 2.6 — `TareaDetalleDialog.tsx:494-499` — cabecera de la tabla de empleados por día (dentro del Accordion)

```
:494  <TableHead className="min-w-[200px]">Empleado</TableHead>   ← MUERTA pre-F1
:495  <TableHead className="w-[140px]">Lote</TableHead>            ← MUERTA pre-F1
:496  <TableHead className="text-right w-[100px]">Jornal</TableHead>  ← MUERTA pre-F1
:497  <TableHead className="text-right w-[120px]">Costo</TableHead>   ← MUERTA pre-F1
:499  <TableHead className="w-[50px]"></TableHead>                    ← MUERTA pre-F1
:509  <span className="text-sm font-semibold text-gray-900 truncate">{empleado o contratista}</span>
```

Es el mismo archivo/módulo que `barrido-recorte.md` §2.4 cita como caso testigo, pero una fila
distinta (la tabla del historial diario dentro del `Accordion`, no el header del diálogo).
`ui/table.tsx` pone `whitespace-nowrap` por defecto en **todo** `<TableHead>`/`<TableCell>`
(línea 73/86) — eso ya vivía. Lo nuevo son los cinco anchos: `min-w-[200px]` en Empleado no
estrecha nada por sí sola (es un piso, no un techo), pero `w-[140px]`/`w-[100px]`/`w-[120px]`/
`w-[50px]` en las columnas hermanas sí reclaman 410px fijos que antes no reclamaban nada — en un
`<Table>` **sin** `table-fixed` (layout automático), eso empuja lo que le queda a la columna de
Empleado hacia abajo, potencialmente hasta su piso de 200px si el contenedor es angosto.

**Desenlace esperado: incierto entre RECORTE e INOCUO** — depende de si el ancho total disponible
alcanza para dar a Empleado más de sus 200px de piso. Es justo el caso que
`barrido-recorte.md` marcó "no puedo confirmar sin navegador" — esta es la explicación de
mecanismo que le faltaba, pero sigue sin poder resolverse sin medir el ancho real.

#### 2.7 — `TareaDetalleDialog.tsx:248` — el caso testigo del plan, revisitado con una duda genuina

```
:248  <div className="space-y-2 max-w-full md:max-w-[75%]">   ← max-w-full y md:max-w-[75%] MUERTAS pre-F1
```

Verifiqué qué envuelve exactamente este `div`: `DialogTitle` (`tarea.nombre`, el título de la
tarea — **no** un nombre de persona, y sin `truncate`), el `Badge` de código, el estado, y el tipo
de tarea (líneas 249-267). Ninguno de esos elementos lleva `truncate`. La sección "Responsable"
(líneas 384-393, donde vive el `truncate` sobre el nombre del empleado) está en una parte
**distinta** del diálogo — dentro de `DialogBody`, en la grilla "Detalles Generales"
(`grid grid-cols-1 md:grid-cols-3 gap-6`, línea 353). Verifiqué `grid-cols-3`, `md:grid-cols-3`,
`gap-6`, `p-6` y `min-w-0` uno por uno contra el CSS congelado: **los cinco ya estaban vivos antes
de F1.** El contenedor de página `max-w-[1120px] mx-auto w-full` (línea 279, también recién vivo)
tampoco cambia nada en la práctica: el diálogo `size="xl"` está topado en `.dialog-xl { max-width:
64rem }` (1024px, CSS real en `globals.css:287`, nunca dependió de Tailwind) — 1120px nunca se
alcanza, así que activar ese `max-w` es un no-op.

**No pude reconstruir, con solo análisis estático, qué ancestro de la fila Responsable/Lote
cambió de ancho por F1** — la grilla de 3 columnas que la contiene ya era de 3 columnas antes.
Esto **pone en duda la atribución causal específica** que hace `barrido-recorte.md` §0/§2.4 (citan
la línea 248 como "la causa real" del caso testigo con captura). Puede que la causa real esté en
un tercer factor que ninguno de los dos barridos ha mirado (tamaño de fuente — `text-base` en el
`<p>` del responsable no es de la familia ancho/layout, así que quedó fuera de mi alcance — o
altura/ancho real del diálogo en el viewport donde se tomó la captura). Lo dejo como pregunta
abierta explícita en vez de repetir la atribución sin poder sostenerla.

### Nivel 3 — bajo riesgo (reflujo con datos cortos, o resuelto como inocuo)

#### 2.8 — `GanadoDashboard.tsx:173` — tarjetas de cabezas/ha por ubicación

```
<div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
```
`sm:grid-cols-3` recién viva (`grid-cols-1` ya vivía). `KPICard` interno (línea 17-25) no tiene
`truncate`/`whitespace-nowrap` en `label`. **Desenlace: REFLUJO de bajo riesgo** — nombres de
ubicación de ganado son cortos por catálogo (migración 044 sembró solo 3 ubicaciones).

#### 2.9 — `RegistroMonitoreo.tsx:590` — grilla de floración

```
<div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
```
`sm:grid-cols-4` recién viva. Etiquetas cortas ("Sin flor", "Brotes", "Flor madura", "Cuaje" — los
4 campos `floracion_*` del `CLAUDE.md` raíz), sin `truncate`. **Desenlace: REFLUJO de bajo
riesgo**, "Flor madura" (11 caracteres) es la más larga y peor caso envuelve a 2 líneas en una
celda con espacio vertical de sobra.

#### 2.10 — `CapturaCosechaGrid.tsx` — tabla de captura de cosecha

```
:422  <table className="w-full text-sm border-collapse min-w-[700px]">   ← min-w-[700px] recién viva, pero NO table-fixed
:425/426  <th className="... w-[160px]">Lote</th>, w-[130px] Sublote     ← recién vivas
```
A diferencia de 2.1/2.2/2.3, esta tabla **nunca usa `table-fixed`** (solo `border-collapse`) —
verificado. En layout automático, un ancho de `<th>` es una sugerencia, no un tope; combinado con
`overflow-x-auto` en el contenedor padre (línea 421) y `min-w-[700px]` en la tabla, el patrón es
el mismo "escape de scroll" que `barrido-recorte.md` cita como correcto (`GanadoMovimientos.tsx`
nota positiva). `row.lote_nombre` (línea ~452) no lleva `truncate`. **Desenlace: INOCUO** — la
tabla se ensancha o hace scroll horizontal antes de cortar texto.

### Resueltos como INOCUO (falsas pistas cerradas, vale dejarlas explícitas)

- **`GastoForm.tsx:305` / `IngresoForm.tsx:349` — `md:col-span-3`** en el campo "Nombre del
  Gasto/Ingreso": antes de F1 el campo ocupaba 1 celda de grid (angosto); con la clase viva ahora
  ocupa 3 celdas — **ensancha**, no estrecha. Dirección opuesta a la que se esperaría de la
  familia `col-span`.
- **`Personal.tsx:592` (`md:w-32`, filtro Estado — 3 opciones fijas) y `:607` (`max-w-full`,
  envoltorio del input de búsqueda)** — ninguno envuelve el nombre del empleado mostrado en la
  lista; son controles de filtro/búsqueda, no celdas de datos.
- **`w-auto` en `ClimaHistorico.tsx:126`, `GanadoMovimientos.tsx:161/163`, `AlertasView.tsx:
  296/310`, `SubirPesajeFoto.tsx:233`** — en los cinco casos reemplaza el `w-full` por defecto de
  un `Select`/`Input` de filtro por un ancho que se ajusta al contenido — **relaja**, no estrecha.
- **`TareaDetalleDialog.tsx:279` (`max-w-[1120px]`)** — no-op, ver 2.7 arriba.
- **55 apariciones de tamaño de ícono/primitiva de UI** (§1) — sin texto de dominio adentro.

---

## 3. Cruce con las sospechosas del barrido anterior

`barrido-recorte.md` §2 lista 9 sitios. De ellos:

| Sospechosa anterior | ¿Explicada por una causa de esta lista? |
|---|---|
| 2.1 `AnimalLabel.tsx` | **No.** Sin clase de ancho/layout recién viva cerca; `min-w-0` ya vivía. Abre la pregunta: ¿esto no es una regresión de F1 en absoluto? |
| 2.2 `TrabajadorMultiSelect.tsx` | **Sí.** §2.4 arriba (`lg:grid-cols-5`/`xl:grid-cols-6`). |
| 2.3 `JornalFractionMatrix.tsx` | **No.** Sin clase de ancho/layout recién viva en el archivo. |
| 2.4 `TareaDetalleDialog.tsx` (3 sitios) | **Parcial.** El sitio :509 (tabla del Accordion) tiene una explicación de mecanismo nueva (§2.6), aunque el desenlace sigue incierto. Los sitios :372/:391 (Lote/Responsable) **no** quedan explicados por la causa que el barrido anterior atribuyó (línea 248) — ver la duda genuina en §2.7. |
| 2.5 `MapaCalorIncidencias.tsx` | **Sí, y reforzada.** §2.3 arriba — confirmé que `w-[180px]` (y `table-fixed`) estaban muertas, no solo que son sospechosas. |
| 2.6 `PriorizacionScoutingView.tsx` | **No.** Cero apariciones de la familia ancho/layout en ese archivo; sus citas eran todas `min-w-0 flex-1 truncate`, y las tres piezas de esa combinación ya vivían antes de F1 (§1). |
| 2.7 Presupuesto (`PresupuestoCategoriaRow`/`ConceptoRow`) | **Sí, y reforzada.** §2.1 arriba — mecanismo completo (`table-fixed` + colgroup), no solo el sitio del `truncate`. |
| 2.8 `GastosDetalleDialog.tsx` | **No.** Sin clase de ancho/layout recién viva en el archivo. |
| 2.9 Inventario (`InventoryMovements`, `MovementsDashboard`, `KPIInventarioSection`, `ConsumoAplicacionesTable`) | **No.** Solo apareció ruido de ícono (`w-3.5`) en `KPIInventarioSection.tsx`; los otros tres archivos no tienen ninguna aparición de la familia. |

**Resumen**: de 9 sospechosas, **3 quedan explicadas y reforzadas** (2.2, 2.5, 2.7), **1 queda
parcialmente explicada con una duda genuina sobre la atribución original** (2.4), y **5 no
quedan explicadas por ninguna causa de ancho/layout** (2.1, 2.3, 2.6, 2.8, 2.9) — lo que sugiere
que, si esos 5 sitios de verdad se ven mal hoy, la causa no está en la familia que cubre esta
tarea (podría ser tipografía, color, o simplemente ya se veían así antes de F1 y no son una
regresión nueva).

Esto es evidencia de que el mecanismo correcto (ancho de contenedor, no la clase de recorte en sí)
explica una fracción real pero minoritaria de las sospechosas previamente identificadas por
síntoma — confirma que había que rehacer el barrido apuntando al lado correcto, y también que no
todo lo que "se ve raro" en esas pantallas viene de Tailwind.

---

## 4. Lo que no puedo determinar sin pantalla — priorizado

1. **`PresupuestoTable.tsx`/`PresupuestoCategoriaRow.tsx` (§2.1)** — ¿cuántos caracteres de "Mano
   de Obra y Asistencia Técnica" quedan visibles antes del corte, en el ancho real que le toca a
   la columna flexible después de que las ~9 columnas fijas reclaman su espacio? Es la sospechosa
   #1 por severidad (Gerencia la usa para aprobar/marcar sobreejecución) y la que tengo mejor
   fundamentada — falta solo la medida final.
2. **`TareaDetalleDialog.tsx:248` vs. la grilla "Detalles Generales" (§2.7)** — esta es la
   pregunta más importante de todo el barrido: **¿la atribución causal del barrido anterior para
   el caso testigo del plan (DAVID JOVANY GARCIA MANCERA) es correcta?** Mi análisis dice que la
   grilla que contiene "Responsable" no cambió de ancho por F1. Pido explícitamente re-tomar la
   captura DESPUÉS con las herramientas de inspección abiertas sobre el `<p>` de la línea 391 (no
   solo mirar el resultado) para saber si de verdad cambió algo ahí o si la causa está en otro
   lado (tamaño de fuente, por ejemplo — fuera del alcance de este barrido).
3. **`TrabajadorMultiSelect.tsx` (§2.4)** — ancho real de cada tarjeta en 5-6 columnas a 1280px y
   1920px, y si un nombre colombiano típico de 2 nombres + 2 apellidos cabe o se corta.
4. **`DashboardMonitoreoV3.tsx` Select triggers (§2.5)** — ¿el `line-clamp-1` realmente recorta el
   texto compuesto "Nombre — fecha a fecha" dentro de 320px/224px, o el texto suele ser más corto
   de lo que asumo? Es la única sospechosa nueva de esta lista en una pantalla que F0 ya midió
   como degradada en móvil, así que vale la pena confirmar si es el mismo problema visto dos veces
   o dos problemas distintos apilados.
5. **`TareaDetalleDialog.tsx:494-499` (§2.6)** — ancho real disponible para la columna Empleado
   dentro del `Accordion` una vez que los 410px de columnas hermanas están reservados; decide si
   este sitio es RECORTE o INOCUO.
6. **`DetalleGastosExpandible.tsx`/`PivotTableGastos.tsx` (§2.2)** — ¿el reflujo a 2 líneas rompe
   la alineación vertical con las columnas `tabular-nums`, o el `line-height`/`py-2` da suficiente
   aire? Es reflujo, no recorte, así que la severidad real depende de cuánto se ve mal, no de si
   se pierde información.
7. **2.1/2.3/2.6/2.8/2.9 de §3 (las 5 no explicadas)** — si de verdad se ven mal en pantalla,
   confirmar si YA se veían mal antes de F1 (no es una regresión, es deuda preexistente) o si hay
   una causa fuera de mi alcance declarado (tipografía, mapas de color indexados dinámicamente —
   mismo punto ciego §1.4 de `analisis-clases-muertas.md`).

---

## 5. Verificación de base

`npm test` — **1.986 verdes, 81 archivos, sin rojos** — corrido tal cual al final de la sesión, sin
tocar `src/`. También corrí `npm run build` (comando estándar, no prohibido) para obtener el CSS
real compilado y comparar contra él en vez de asumir que "clase usada en el código" implica
"compila" — el `build/` resultante es `git`-ignorado (`build/` en `.gitignore`) y no aparece en
`git status`. Ningún archivo de `src/` fue editado.
