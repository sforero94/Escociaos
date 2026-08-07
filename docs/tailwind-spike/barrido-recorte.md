# F2.2 — Barrido de clases de recorte y contención

Ejecutado 2026-08-06 sobre `feat/tailwind-pipeline` (post-F1, `2fe5bba`). Análisis 100% estático
(Read/Bash/Grep, sin navegador) de `src/**/*.tsx`. `src/components/Layout.tsx` fue **leído e
incluido en el inventario por completitud, pero no está en ningún entregable de arreglo** — otro
agente lo está tocando ahora mismo (instrucción explícita).

---

## 0. Método, y un hallazgo metodológico que reordena la lectura del hallazgo del plan

Extraje **todos** los `className=`/`classNames=` de `src/**/*.tsx` (300 archivos) con balanceo real
de `{}`/`()` — mismo método que `docs/tailwind-spike/analisis-clases-muertas.md` §1.2 — y filtré los
tokens que matchean `truncate`, `line-clamp-*`, `overflow-hidden`, `whitespace-nowrap`, `max-w-*` y
`text-ellipsis` (incluidas sus variantes `sm:`/sin variante). Para cada token comprobé pertenencia
**exacta** (no substring) contra dos sets de selectores: el `index.css` congelado pre-F1 (`git show
2fe5bba^:src/index.css`) y el vigente — así distingo "ya vivía antes de F1" de "empezó a vivir con F1".

**Descubrí algo que contradice la lectura literal del caso testigo del plan.** `.truncate`,
`.overflow-hidden`, `.whitespace-nowrap` y `.line-clamp-1`/`.line-clamp-2` **ya existían, sin
excepción, en el `index.css` congelado pre-F1** — no son clases que "cobraron vida". Verifiqué el
caso exacto que cita la consigna (`TareaDetalleDialog.tsx`, nombre del responsable) y encontré la
causa real: la clase que SÍ estaba muerta y ahora vive no es `truncate`, es la que **acota el
ancho del contenedor que envuelve al texto**:

```
TareaDetalleDialog.tsx:248   space-y-2 max-w-full md:max-w-[75%]     ← max-w-full y md:max-w-[75%] estaban MUERTAS pre-F1
TareaDetalleDialog.tsx:519   ... rounded w-fit max-w-full truncate   ← max-w-full estaba MUERTA pre-F1
```

`.truncate` (`text-overflow:ellipsis; white-space:nowrap; overflow:hidden`) siempre corrió como
regla CSS. Lo que nunca corrió es la restricción de ancho que la obliga a activarse — sin un ancho
más angosto que el contenido, el texto simplemente no se corta, sin importar si `truncate` "vive" o
no. F1 revivió `max-w-full`/`md:max-w-[75%]` (y, en otras pantallas, otras clases de la familia
ALTO — `w-*`, `gap-*`, `flex-*`, anchos del sidebar, tiers de ancho de `Dialog`) y **eso** es lo que
hace que el mismo `truncate` de siempre, ahora, tenga algo que cortar.

**Consecuencia para este barrido**: "¿la clase de recorte estaba muerta antes de F1?" es la pregunta
equivocada para casi toda la familia — case-por-case, casi ninguna lo estaba. La pregunta correcta es
"¿algún ancestro que acota el ancho estaba muerto antes de F1?", y esa depende de la cadena completa
de layout hasta la raíz — no se puede responder de forma exhaustiva sin navegador. Lo dejo explícito
en la sección 4 en vez de fingir que el barrido estático la resuelve.

---

## 1. Conteo por familia

| Familia | Apariciones (`src/**/*.tsx`, 127 archivos) | De ellas, el TOKEN mismo estaba muerto pre-F1 |
|---|---|---|
| `truncate` | 74 | 0 |
| `line-clamp-*` | 3 | 0 |
| `overflow-hidden` | 95 | 0 |
| `whitespace-nowrap` | 145 | 0 |
| `max-w-*` | 72 | 8 (`max-w-full`×3, `md:max-w-[75%]`, `max-w-[1120px]`, `max-w-max`, `sm:max-w-sm`×2) |
| `text-ellipsis` | 0 | — (no se usa en el repo) |
| **Total** | **389** | **8** |

Las 8 excepciones vivas-solo-tras-F1 son casi todas de **contenedor**, no de texto: `sm:max-w-sm`×2
son el ancho del panel `Sheet`, `max-w-max` es `ui/navigation-menu.tsx` (no usado en ninguna ruta,
igual que `ui/sidebar.tsx` en el informe de F0 — verificar antes de gastar una sesión en arreglarlo),
`max-w-[1120px]` es el ancho de página de `TareaDetalleDialog`. Las dos que sí tocan texto
directamente son las citadas arriba: `TareaDetalleDialog.tsx:248` y `:519`.

**Combos explícitamente buscados y con resultado negativo**: cero apariciones de
`whitespace-nowrap` + `max-w-*` en el mismo string de clases (el patrón "ancho fijo + no-wrap" que
garantizaría corte sin scroll). No significa que no exista el problema — significa que, si existe, el
ancho limitante está en un ancestro, no en el mismo elemento, y eso este método no lo ve.

**`overflow-hidden` — reclasificado en bloque.** Revisé las 95 apariciones una por una: **ninguna
aplica directamente a texto**. Son, sin excepción, contenedores decorativos o estructurales —
esquinas redondeadas de tarjetas/diálogos (`rounded-xl ... overflow-hidden`), barras de progreso,
avatares, el `Accordion`/`Carousel`/`Dialog`/`Sheet`/`DropdownMenu` de shadcn, envoltorios de tabla
que SIEMPRE van seguidos de un `<div className="overflow-x-auto">`/`overflow-auto` interno (ver §3
para la única excepción real). Saco la familia completa del ranking de sospechosas — no aporta ni un
caso al patrón que pide la consigna.

---

## 2. Lista de sospechosas, ordenada por daño

### 2.1 — `AnimalLabel.tsx:20` — identidad de la vaca, usada en TODO el módulo Hato

```
src/components/hato/components/AnimalLabel.tsx:20
<span className="font-medium text-gray-900 truncate">{principal}</span>
```

Componente compartido (`HatoDashboard.tsx` y `AlertasView.tsx` lo importan explícitamente para "no
poder divergir en cómo identifican al mismo animal" — comentario propio del archivo). El contrato
documentado del módulo (`src/components/hato/CLAUDE.md`, S6) dice literalmente: *"alert text leads
with the cow's name when `numero` is provisional (800–999) or null... Fernando reads the physical
tag in the corral"*. Es decir: para exactamente el caso en que el nombre es el ÚNICO identificador
utilizable, este componente lo trunca — sin `title`, sin forma de expandir. `min-w-0` está presente
en el contenedor, así que el corte **sí se activa** cuando el espacio aprieta (a diferencia de otros
casos de este barrido donde no puedo confirmarlo). Un nombre cortado en una alerta de campo no es un
defecto cosmético: es la persona equivocada — o la vaca equivocada — recibiendo la acción.

### 2.2 — `TrabajadorMultiSelect.tsx:270,274,338` — selector de mano de obra

```
src/components/shared/TrabajadorMultiSelect.tsx:270  <p className="font-medium text-xs text-gray-900 pr-5 truncate">{empleado.nombre}</p>
src/components/shared/TrabajadorMultiSelect.tsx:274  <p className="text-[10px] text-gray-500 mt-0.5 truncate">{empleado.cargo}</p>
src/components/shared/TrabajadorMultiSelect.tsx:338  <p className="font-medium text-xs text-gray-900 pr-5 truncate">{contratista.nombre}</p>
```

Rejilla de tarjetas pequeñas (`text-xs`, 12px) para escoger QUIÉN trabajó en una tarea — se usa para
registrar jornales y calcular costo de labor. Nombres colombianos completos (2 nombres + 2 apellidos)
sobran de sobra en una tarjeta de ese tamaño. Este no es un caso de "se ve mal": es una interfaz de
**selección** — si dos personas comparten el primer nombre y apellido, truncar a "MARIA JOSE
GOMEZ…" las vuelve indistinguibles en la rejilla, y el resultado de elegir mal es un jornal
atribuido a la persona equivocada.

### 2.3 — `JornalFractionMatrix.tsx:172` — columna fija de nombre en la matriz de fracciones de jornal

```
src/components/shared/JornalFractionMatrix.tsx:172
<span className="text-sm font-medium text-foreground truncate">{trabajador.data.nombre}</span>
```

Columna izquierda **sticky** de una tabla que reparte fracciones de jornal (y costo, si
`showCostPreview`) entre trabajadores para una tarea. Misma familia de riesgo que 2.2: confundir la
fila es confundir a quién se le paga qué. La columna además comparte espacio con un `Badge`
("Contratista"/"Empleado"), lo que reduce aún más el ancho disponible para el nombre.

### 2.4 — `TareaDetalleDialog.tsx` — el caso testigo del plan, con las líneas exactas que lo causan

```
:372  Lote:        <p className="text-base font-medium text-gray-900 truncate">{tarea.lote?.nombre || 'Sin lote'}</p>
:391  Responsable:  <p className="text-base font-medium text-gray-900 truncate">{empleados.find(...)?.nombre || 'Sin asignar'}</p>
:509  Empleado (historial diario, dentro de un Accordion): <span className="text-sm font-semibold text-gray-900 truncate">{...nombre...}</span>
```

Confirmado con captura real en `docs/tailwind-spike/informe-f0.md` §4 ("DAVID JOVANY GARCIA
MANCERA" → "DAVID JOVANY GARCIA MANC…"). Lo que aporta este barrido que el informe de F0 no traía:
**cuáles clases nuevas lo causan** (§0 arriba) y que **el mismo patrón se repite tres veces en el
mismo archivo** (lote, responsable, y cada fila de empleado en el desglose diario) — arreglar solo
la línea que salió en la captura deja las otras dos intactas.

### 2.5 — `MapaCalorIncidencias.tsx:526` — nombre de lote en la cabecera del mapa de calor

```
src/components/monitoreo/MapaCalorIncidencias.tsx:526
<div className="font-bold text-foreground text-sm truncate">{columna.loteNombre}</div>
```

Columna de ancho fijo (`w-[180px]`, `table-fixed`), sin `title`. Esta tabla es la herramienta que
dice **dónde** hay un problema de plaga — confundir dos lotes con prefijo compartido por el nombre
cortado tiene consecuencia agronómica directa (tratar el lote equivocado). El envoltorio de la tabla
sí tiene `overflow-x-auto overflow-y-auto` para las COLUMNAS enteras, pero eso no ayuda al nombre
truncado DENTRO de una columna ya visible.

### 2.6 — `PriorizacionScoutingView.tsx` — nombres de lote/plaga/sublote en la vista de priorización de scouting

```
:209,430,489,533,697,1057,1117  varios `min-w-0 flex-1 truncate` sobre lote_nombre / pest_nombre / sublote_nombre
:481  aria-label={`${lote.lote_nombre}...`}  ← el nombre completo SÍ existe, pero solo para lector de pantalla
```

Mismo patrón que 2.5, mismo archivo que el propio plan cita dos veces como ya afectado por el bug de
`Toggle`/`ToggleGroup` en esta misma migración. `min-w-0` está presente en todos los casos citados
(el corte SÍ se activa bajo presión de espacio), y no hay ningún `title` visible para un usuario
vidente — el único texto alternativo completo que encontré es el `aria-label` de la línea 481, que no
ayuda a nadie mirando la pantalla.

### 2.7 — Presupuesto: nombre de categoría/concepto en la tabla de ejecución

```
src/components/finanzas/presupuesto/PresupuestoCategoriaRow.tsx:40,43   truncate en <td> Y en <span> interno
src/components/finanzas/presupuesto/PresupuestoConceptoRow.tsx:48       truncate en <td>
```

El propio `CLAUDE.md` raíz documenta que la categoría real en producción es **"Mano de Obra y
Asistencia Técnica"** (30 caracteres) — no un nombre corto de ejemplo. Es la tabla que Gerencia mira
para aprobar o marcar sobreejecución de presupuesto por categoría/concepto. Los montos (`$`) están a
salvo — viven en `<td>` separados con `tabular-nums`, nunca truncados (ver nota positiva en §2.9) —
pero el nombre de la categoría, que es la clave para saber DE QUÉ estamos hablando, sí se corta.

### 2.8 — `GastosDetalleDialog.tsx:145` — nombre de gasto truncado dentro de un diálogo de detalle

```
src/components/finanzas/dashboard/components/GastosDetalleDialog.tsx:145
<span className="text-sm font-medium text-gray-900 truncate">{gasto.nombre}</span>
```

Es una lista de gastos (drill-down desde el dashboard por categoría), no el detalle de un solo
gasto — pero está dentro de un componente cuyo nombre y propósito es "detalle". No encontré, en el
código que leí, un click-through desde esta fila a otra vista con el nombre completo — a diferencia
de `GastosList.tsx`/`IngresosList.tsx` (§2.9), donde la fila abre `GastoDetalleDialog`/
`IngresoDetalleDialog` con el nombre completo. Si este dialog es realmente terminal, es el peor caso
de "no hay otra forma de verlo en esta pantalla" de toda la lista.

### 2.9 — Inventario: nombre de producto en tableros

```
src/components/inventory/InventoryMovements.tsx:405        <h3 className="text-sm text-foreground truncate">{movement.producto?.nombre}</h3>
src/components/inventory/MovementsDashboard.tsx:688,740     <p className="text-foreground truncate">{...producto.nombre...}</p>
src/components/inventory/dashboard/components/KPIInventarioSection.tsx:74      <p className="font-medium text-foreground truncate">{item.producto_nombre}</p>
src/components/inventory/dashboard/components/ConsumoAplicacionesTable.tsx:99  <p className="font-medium text-foreground truncate">{app.nombre}</p>
```

Todos con `min-w-0` presente (se activan), sin `title`. Riesgo medio: son tableros de resumen, no la
lista principal de inventario (que probablemente sí muestra el nombre completo en su propia fila) —
pero nombres de insumos agrícolas suelen compartir prefijo largo entre presentaciones/concentraciones
distintas del mismo producto base, así que un resumen truncado puede leerse como el producto
equivocado.

---

### Nota positiva — la categoría "cifras y montos" que más preocupaba la consigna, vacía

Busqué específicamente algún `$`/monto con `truncate`/`line-clamp`/`overflow-hidden`+ancho en las 389
apariciones. **No encontré ni un solo caso.** Todos los montos que aparecen junto a una clase de
recorte están en un elemento **hermano** protegido con `flex-shrink-0`/`shrink-0` (`GastosList.tsx`,
`IngresosList.tsx`, `PresupuestoCategoriaRow.tsx`, `RankingVacas.tsx`) o en su propio `<td>`
`tabular-nums` no truncado. El escenario "`$1.310.505.255` truncado" que cita la consigna como el peor
caso posible no aparece en el código — vale decirlo explícitamente en vez de dejarlo implícito.

### Ejemplo ya mitigado, vale nombrarlo como referencia de patrón correcto

```
src/components/ganado/GanadoMovimientos.tsx:210
<td className="px-3 py-2.5 text-brand-brown/70 max-w-xs truncate" title={m.notas || undefined}>{m.notas || '-'}</td>
```

Recorta un campo de notas (texto libre, no un identificador) y compensa con `title` — exactamente el
patrón que recomiendo para los identificadores de arriba cuando quitar el `truncate` no sea viable.

---

## 3. Hallazgo aparte: una tabla del Hato sin escape de scroll (bug viejo, no de F1)

```
src/components/hato/ChequeosList.tsx:327-362
<div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
  <table className="w-full text-sm">          ← SIN envoltorio overflow-x-auto/overflow-auto
    ...
    <td className="px-3 py-2.5 whitespace-nowrap">{c.veterinario ?? '—'}</td>
    ...
```

Las **seis** tablas hermanas del mismo módulo (`ChequeoDetalle.tsx:280-281`,
`AnimalesList.tsx:140-141`, `HojaDeVida.tsx:287-288`, `PajillasView.tsx:149/164` (×2),
`GanadoDashboard.tsx:210-211`, `GanadoMovimientos.tsx:168-169`) envuelven su `<table>` en un
`overflow-x-auto`/`overflow-auto` interno, ADEMÁS del `overflow-hidden` decorativo de la tarjeta.
`ChequeosList.tsx` tiene el `overflow-hidden` de la tarjeta pero **no** el interno — la tabla es hija
directa. Si esa tabla de 6 columnas (Fecha/Veterinario/Fuente/Vacas/Estado/acción, tres de ellas
`whitespace-nowrap`) alguna vez excede el ancho del contenedor (móvil, o un nombre de veterinario
largo), el contenido sobrante queda recortado por el `overflow-hidden` de la tarjeta **sin ninguna
forma de hacer scroll para verlo** — a diferencia de sus seis hermanas.

**No es una regresión de F1**: `whitespace-nowrap` y `overflow-hidden` ya vivían antes del pipeline
(§1), así que si el desborde ocurre, ya ocurría. Lo reporto aparte, como pide la consigna, porque es
un defecto real y el patrón correcto para arreglarlo ya existe seis veces en el mismo directorio —
copiarlo es trivial.

---

## 4. Recomendación de arreglo para las 5 peores (argumentada, no un menú de opciones)

**1. `AnimalLabel.tsx` (2.1).** Quitar `truncate`, dejar que el `<span>` haga wrap normal. Es el
único de los cinco donde una tooltip (`title`) no sirve: el contrato del propio módulo dice que quien
lee esto es Fernando, en el corral, desde un teléfono — no hay hover en táctil. El contenedor ya usa
`flex-wrap` (línea 19), así que envolver a dos líneas no rompe el layout de la fila que lo consume; el
costo es unas pocas filas más altas en las listas de alerta, que es exactamente el precio correcto a
pagar por no equivocarse de vaca.

**2. `TrabajadorMultiSelect.tsx` (2.2).** Es una rejilla de **selección**, no de lectura pasiva:
recomiendo `line-clamp-2` en vez de `truncate` (el nombre cabe casi siempre en dos líneas dentro de
una tarjeta de `text-xs`) y agregar `title={empleado.nombre}` de todos modos — no cuesta nada y ayuda
en desktop con mouse. Alternativa más cara pero más robusta si dos líneas siguen sin alcanzar:
reducir columnas por fila (`grid-cols-N` más chico) para dar más ancho a cada tarjeta.

**3. `JornalFractionMatrix.tsx` (2.3).** Agregar `title={trabajador.data.nombre}` es el arreglo
inmediato de costo cero (la columna es `sticky`, ya tiene ancho fijo por diseño, así que ensancharla
compite con las columnas de fracción/costo que sí necesitan quedar visibles a la derecha). Como
mejora posterior, considerar mover el `Badge` de tipo de contrato debajo del nombre en vez de al lado
— hoy compite por el mismo ancho de línea.

**4. `TareaDetalleDialog.tsx` (2.4).** Ya está confirmado roto por F0 con evidencia visual, así que el
parche de menor riesgo es `title={...}` en las tres líneas (372/391/509) — cero riesgo de layout,
reversible en un commit. El arreglo real, si hay presupuesto para tocar layout: quitar `truncate` en
Lote y Responsable específicamente (son campos de un solo valor con espacio vertical de sobra en un
diálogo de detalle) y dejarlo únicamente en las etiquetas de métrica cortas ("Meta: X", "Jornales")
donde el valor es numérico y nunca se va a beneficiar de una segunda línea.

**5. `MapaCalorIncidencias.tsx` (2.5).** `title={columna.loteNombre}` como parche inmediato, pero es
el caso donde más recomiendo NO quedarse ahí: es una tabla con columnas `sticky` posicionadas para
verse en una pantalla ancha (probablemente tablet/desktop de oficina, dado el uso de `position:
sticky` con z-index para encabezados fijos), así que ensanchar `w-[180px]` a algo como `w-[220px]` o
permitir wrap a dos líneas en la cabecera (`whitespace-normal` + una altura de fila mayor) es viable
sin rehacer el componente, y evita depender de un hover que en campo (tablet táctil) no dispara.

---

## 5. Lo que NO pude determinar sin navegador — explícito, no implícito

1. **Si el `truncate` realmente se activa en cada sitio.** Confirmé `min-w-0` presente en los casos
   de 2.1, 2.5 y 2.6 (se activa bajo presión de espacio). **No pude confirmarlo** para
   `TareaDetalleDialog.tsx:509` (celda de tabla dentro de un `Accordion`, sin `min-w-0` visible en la
   cadena que leí — puede que la tabla nunca se angoste lo suficiente) ni para
   `PresupuestoCategoriaRow.tsx:40/43` o `GastosDetalleDialog.tsx:145` (ninguno de los tres confirma
   `table-layout: fixed` ni un ancestro `min-w-0` en el fragmento que revisé). Un `<td>` sin
   `table-fixed` normalmente deja crecer la columna en vez de cortar el texto — si es el caso aquí,
   estos tres podrían no estar cortando nada hoy, y solo el navegador lo dice con certeza.
2. **Longitud real de los datos.** No consulté la base de datos. "Mano de Obra y Asistencia Técnica"
   sale del propio `CLAUDE.md` (migración 051); el resto de mis afirmaciones sobre "nombres
   colombianos largos" y "nombres de insumo con prefijo compartido" son inferencias razonables del
   dominio, no una consulta a `hato_animales`/`empleados`/`productos`.
3. **`ChequeosList.tsx` (§3): si realmente desborda.** No tengo forma de medir el ancho real de la
   tabla contra el contenedor sin abrir la pantalla — recomiendo la misma metodología de F0
   (`scrollWidth` en 375×812 y en desktop) antes de priorizarlo.
4. **`PriorizacionScoutingView.tsx` (2.6): en qué viewport se usa en la práctica.** Si el equipo de
   monitoreo la mira desde un teléfono en el lote, el riesgo es mayor que si es una vista de oficina;
   no lo sé sin preguntar o sin verla.
5. **Las 115 apariciones candidatas de `analisis-clases-muertas.md` §1.4** (mapas de color/estado
   indexados dinámicamente — `PriorizacionScoutingView.tsx` de nuevo el mayor, con 15) quedan fuera de
   este barrido por la misma razón que quedaron fuera de aquel: mi extractor solo lee literales dentro
   de `className=`/`cva()`, no el contenido de un `const MAPA = {...}` indexado en tiempo de
   ejecución. Si alguna de esas 115 es una clase de recorte, es invisible a este método.
6. **Cualquier clase de recorte ensamblada en un `.ts`** (hook o util) y pasada como prop de estilo.
   Alcance explícito de la tarea fue `src/**/*.tsx`; no abrí `.ts`.
7. **`Layout.tsx` (7 apariciones de `truncate`, líneas 274/293/318/340/462/496)**: las leí e incluí en
   el conteo por completitud, pero no las evalúo ni recomiendo arreglo — otro agente lo está editando
   ahora. Señalo únicamente que la línea 496 (`<p className="... truncate">{profile?.nombre ||
   'Usuario'}</p>`) es el nombre propio del usuario en el pie del sidebar, misma familia de riesgo
   que el resto de esta lista, para que quien retome ese archivo lo tenga presente.

---

## 6. Verificación de base

`npm test` (comando estándar del proyecto) — **1.986 tests verdes, 81 archivos, sin rojos** — corrido
tal cual, sin tocar nada. Confirma que las 4 guardas estáticas de Tailwind ya fueron retiradas en F1 y
que este barrido no dejó el árbol en un estado distinto al que lo encontró (no se editó ningún
archivo de `src/`).
