# F0 — Inventario estático de clases Tailwind muertas

Medición 100% de archivos (Read/Bash/Grep, sin navegador) contra `src/index.css` +
`src/styles/globals.css`. Ningún archivo del proyecto fue modificado — los scripts de
extracción viven en el scratchpad de esta sesión, no en el repo.

---

## 1. Método

### 1.1 Fuente de verdad del CSS (evitando la trampa de substring)

Construí un **set exacto de selectores vivos** parseando `index.css` + `globals.css` con
`/\.((?:\\.|[A-Za-z0-9_-])+)/g` — el token empieza justo después de un `.` y consume
caracteres normales o pares escapados (`\X`), deteniéndose en el primer carácter sin escapar
que no pertenece al nombre de clase (espacio, `{`, `,`, `:` de pseudo-clase, `)`…). Cada
captura se desescapa (`\X` → `X`) y se guarda en un `Set`.

**Por qué no usé `CSS.includes('.' + escapado)`** (el método de los 4 tests
`hato*Tailwind.test.ts` existentes): es exactamente la trampa de substring que la consigna
advierte. Lo verifiqué en este mismo repo antes de escribir nada:

```
$ grep -n '\.sm\\:flex' src/index.css
4675:    .sm\:flex-row {
```

`sm:flex` **no existe** como selector propio — solo `sm:flex-row`. Pero
`CSS.includes('.sm\\:flex')` devuelve `true` porque `.sm\:flex-row` lo contiene como
prefijo. Con el método de substring, `sm:flex` se habría marcado **vivo** por error. Mi
comprobación es por pertenencia exacta a un `Set` de selectores reales, no por substring —
no hereda ese bug.

### 1.2 Extracción de clases usadas (`src/**/*.tsx`, 300 archivos)

Patrones cubiertos, con balanceo real de `{}`/`()` (no regex de una sola línea):

1. `className="literal"` / `className='literal'` (estático).
2. `className={...}` — extracción balanceada de llaves, tomando **todos** los literales
   string/template dentro del bloque (cubre `cn(...)`, ternarios, arrays, objetos clsx
   `{ 'clase': bool }`, sin importar cuán anidado esté).
3. `classNames={{...}}` — el prop **plural** de `react-day-picker`, único uso en el repo
   (`src/components/ui/calendar.tsx`). Se descubrió mirando por qué ese archivo salía con
   cero clases muertas pese a tener `sm:flex-row`, `gap-2`, etc. en un objeto `classNames={{`;
   mi regex original solo buscaba `className=` (singular) y `classNames=` no matchea por el
   límite de "=" en la posición 10. Corregido: `/\bclassNames?=\{/g`.
4. `cva(...)` — definiciones de variantes de `class-variance-authority` (6 archivos:
   `button`, `badge`, `toggle`, `alert`, `navigation-menu`, `sidebar`), que viven fuera de
   cualquier `className=` literal.

Cada match se tokeniza por espacio y se valida contra
`/^[a-zA-Z0-9][a-zA-Z0-9:./\[\]%#_*!-]*$/` + al menos una letra, **y** se descarta si termina
en `-` desnudo (ver 1.3).

### 1.3 Un artefacto de extracción encontrado y corregido

`button.tsx` (y 8 archivos `ui/` más) usan el selector arbitrario
`` [&_svg:not([class*='size-'])]:size-4 ``. La comilla simple interna `'size-'` es una
cadena de atributo CSS, no una clase — pero mi regex de "todo literal entre comillas" la
capturaba igual, produciendo tokens fantasma `size-`, `text-`, `dtbl-head--` (25 apariciones
en 9 archivos, todas clasificadas BAJO). Ninguna utilidad real de Tailwind termina en `-`
desnudo, así que agregué ese filtro y las 25 desaparecieron del conteo. Documentado en el
script, no oculto.

### 1.4 Qué NO pude extraer limpiamente (declarado, no escondido)

Hice una pasada heurística separada (no integrada al conteo principal) buscando literales de
2+ tokens fuera de `className=`/`classNames=`/`cva(` que *parecen* listas de clases Tailwind
(prefijos reconocidos `bg-`, `text-`, `border-`, `flex`, `gap-`, etc. en ≥50% de los tokens).
Resultado: **115 apariciones candidatas en 33 archivos** — mapas de color por estado/badge
que viven en objetos `const` y se indexan dinámicamente
(`ESTADO_COLORS[estado]`, `className={cn(mapa[x])}` donde `mapa` no es literal en el punto
de uso). Estas **no están en el inventario ni en el ranking** de abajo porque no pude
verificar con la misma confianza que son 100% clases y no texto suelto. Los más grandes:

| Archivo | candidatos |
|---|---|
| `monitoreo/PriorizacionScoutingView.tsx` | 15 |
| `aplicaciones/report/HeroKPICards.tsx` | 8 |
| `ganado/GanadoMovimientos.tsx` | 7 |
| `inventory/InventoryMovements.tsx` | 6 |
| `inventory/VerificacionesList.tsx` | 6 |
| `configuracion/UsuariosConfig.tsx` | 5 |
| `finanzas/presupuesto/EjecucionBadge.tsx` | 5 |
| `hato/components/HatoKpiCard.tsx` | 5 |
| `labores/TareaDetalleDialog.tsx` | 4 |
| `monitoreo/DashboardMonitoreoV3.tsx` | 4 |

Ejemplos reales (`GanadoMovimientos.tsx`): `"bg-green-100 text-green-800"`,
`"bg-purple-100 text-purple-700"` — mapas de badge por tipo de movimiento. La mayoría son
colores/bordes (BAJO por naturaleza), pero **`PriorizacionScoutingView.tsx`** —
explícitamente citado en el plan como uno de los dos módulos que ya se estrelló con este
mismo problema (Toggle/ToggleGroup) — tiene el mayor número de candidatos, así que lo
mantengo en la recomendación final igual, con esta nota.

**Otros límites declarados:**
- Alcance estrictamente `src/**/*.tsx` (instrucción explícita). Strings de clase en `.ts`
  (hooks, utils) quedan fuera por diseño — no encontré ninguno relevante al revisar
  `calculosHato.ts`/`calculosMonitoreo.ts`, pero no hice un barrido exhaustivo de `.ts`.
- Concatenación dinámica de clase (`` `bg-${color}-500` ``): grep dirigido no encontró ningún
  caso real en el repo. Si existiera, mi filtro anti-`size-` lo dejaría invisible (ni vivo ni
  muerto) en vez de mostrarlo truncado — lo declaro como punto ciego teórico, sin evidencia
  de que aplique hoy.
- No hice AST real (Babel/TS compiler) — es regex con balanceo de llaves/paréntesis, no
  parsing completo. Funciona porque el código no anida `{`/`}` dentro de literales de forma
  que rompa el balanceo, pero no es una garantía formal.

### 1.5 Clasificación de riesgo

- **ALTO**: prefijos de layout (`flex`, `grid`, `space-y-/x-`, `gap-`, `w-/h-/min-/max-`,
  `p-/m-` + todas sus direcciones, `absolute/relative/fixed/sticky`, `hidden/block/inline*`,
  `overflow-`, `z-`, `top-/bottom-/left-/right-/inset-`, `order-`, `col-/row-`, `justify-
  /items-/self-/place-`, `basis-/grow/shrink`, `aspect-`, `divide-x/y`) **y cualquier clase
  con variante responsive** (`sm:`/`md:`/`lg:`/`xl:`/`2xl:`), sin importar la utilidad base —
  siguiendo la lista explícita de la consigna.
- **MEDIO**: `hover:`, `focus:`, `focus-visible:`, `disabled:`, `active:`, `group-*`,
  `peer-*`, `data-[state...]`, `aria-`, `has-[`.
- **BAJO**: todo lo demás (color, tipografía, `rounded-*`, `shadow-*`, `tabular-nums`, etc.).
- **`dark:` es un caso aparte, no ALTO/MEDIO/BAJO**: verificado que **nada en el código
  aplica la clase `.dark`** a ningún ancestro (`grep` de `classList`/`toggleDarkMode`/
  `prefers-color-scheme` → cero resultados). `@custom-variant dark (&:is(.dark *))` en
  `globals.css:1` está declarado pero no tiene disparador. Conclusión: **cero clases
  `dark:` se usan en el código** (verificado, no solo asumido) — el caso no aplicó ni una
  vez, así que el bucket quedó vacío pero la regla está documentada por si aparece en F2/F3.

---

## 2. Totales

| Métrica | Valor medido |
|---|---|
| Archivos `.tsx` escaneados | 300 |
| Ocurrencias totales de clases (`className`/`classNames`/`cva`) | 32.791 |
| Clases distintas usadas | 1.284 |
| **Ocurrencias de clases muertas** | **2.895** |
| **Clases distintas muertas** | **608** |
| Nivel ALTO — ocurrencias / distintas | 530 / 191 |
| Nivel MEDIO — ocurrencias / distintas | 492 / 102 |
| Nivel BAJO — ocurrencias / distintas | 1.873 / 315 |
| `dark:` — ocurrencias | 0 (verificado, no solo bucket vacío por definición) |

### Mis números vs. los del plan (~845 distintas / ~4.400 apariciones) — difieren, y sé por qué en parte

Reproduje la comparación familia por familia citada en el plan:

| Familia | Plan | Medido aquí | Nota |
|---|---|---|---|
| `text-brand-brown/*` | ~640 | **651** | consistente |
| `focus:ring-primary` + `focus:border-primary` | ~155 | **182** | consistente (mayor) |
| `tabular-nums` | 71 | **73** | consistente |
| `border-primary/*` + `border-secondary/*` | ~260 | **450** | mayor — el plan subestimó esta |
| `space-y-*` | ~380 | **13** | **muy inferior — ver explicación abajo** |

**`space-y-*` explica gran parte de la brecha total.** Verifiqué directamente en el CSS:

```
$ grep -oE '\.space-y-[0-9.]+ ' src/index.css | sort -u
.space-y-1  .space-y-2  .space-y-3  .space-y-4  .space-y-5  .space-y-6  .space-y-8
```

Los valores **1, 2, 3, 4, 5, 6, 8 ya están vivos** hoy (forma `:where(.space-y-N >
:not(:last-child))`, generada así por Tailwind desde siempre — no es un hallazgo nuevo de
F0). Un grep aproximado de uso en código da ~517 apariciones de `space-y-N`, de las cuales
solo `space-y-0` (7 apariciones) y algún valor raro no listado están realmente muertos —
total real 13, no ~380. La cifra del plan (~380) coincide en orden de magnitud con el **total
de apariciones de la familia**, no con las muertas — mi hipótesis, no confirmada porque no
tengo el script del barrido previo, es que ese barrido no verificó el sufijo numérico
individual contra el CSS y marcó toda la familia como muerta por el prefijo. Si ese mismo
patrón se repitió en otras familias parcialmente vivas (`gap-*`, `p-*`/`m-*`, `rounded-*`),
explicaría el resto de la brecha (2.895 vs. ~4.400) sin que ninguno de los dos números sea
"incorrecto" en el sentido de estar mal ejecutado — son metodologías distintas. **Uso mi
cifra (2.895 / 608) como la vigente para el ranking de abajo**, por ser reproducible y con
el método documentado en §1.

---

## 3. Top 25 clases muertas por apariciones

| Clase | Apariciones |
|---|---|
| `text-brand-brown/70` | 307 |
| `text-brand-brown/60` | 184 |
| `border-primary/10` | 157 |
| `border-primary/20` | 105 |
| `text-brand-brown/50` | 104 |
| `focus:ring-primary` | 103 |
| `tabular-nums` | 73 |
| `focus:border-primary` | 52 |
| `text-brand-brown/40` | 46 |
| `border-primary` | 43 |
| `w-3.5` | 39 |
| `h-3.5` | 39 |
| `text-[10px]` | 37 |
| `hover:bg-muted/50` | 33 |
| `bg-primary/5` | 30 |
| `bg-primary/10` | 29 |
| `border-secondary/30` | 27 |
| `font-mono` | 26 |
| `hover:bg-primary/10` | 23 |
| `pb-2` | 23 |
| `focus:ring-primary/20` | 22 |
| `hover:bg-primary/5` | 22 |
| `border-primary/5` | 20 |
| `from-primary/10` | 20 |
| `border-primary/30` | 20 |

Confirma el diagnóstico del plan: **foco de teclado (`focus:ring-primary`/`focus:border-
primary`, 155 apariciones combinadas) está muerto en el 100% de los casos revisados** — hoy
no hay ningún indicio visual de foco en los formularios de esta app.

---

## 4. Hallazgo que el ranking por ruta NO puede capturar: el chrome global

Dos archivos están presentes en **todas** las pantallas autenticadas pero no aparecen en
ninguna fila del ranking de §5 porque son **ancestros** de las rutas (`App.tsx` los monta
fuera de `LayoutRoutes`), no descendientes de ningún componente de ruta — mi barrido de
imports solo camina hacia abajo desde cada componente de ruta, nunca hacia arriba:

| Archivo | ALTO | MEDIO | BAJO | Rol |
|---|---|---|---|---|
| `src/components/Layout.tsx` | 10 | 14 | 19 | sidebar + header, en las 53 pantallas |
| `src/components/chat/ChatPanel.tsx` (vía `ChatFAB`) | **25** | 2 | 1 | panel de Esco, flotante en las 53 pantallas |

`ChatPanel.tsx` es el **segundo archivo con más clases ALTO muertas de todo el repo** —
detrás solo de `TareaDetalleDialog.tsx` (49) — y es invisible al ranking por ruta porque
`App.tsx` monta `<ChatFAB />` como hermano de `<AppContent />`, no dentro de una ruta. Sus
clases ALTO muertas son casi todas variantes `lg:` (`lg:h-8`, `lg:w-8`, `lg:h-4`, `lg:w-4`,
`lg:px-4`) — el panel de chat probablemente se ve con el tamaño de icono/padding de **mobile
en desktop** hoy, y cambiará de tamaño en cuanto el compilador encienda. **Recomiendo abrir
el chat una vez, en cualquier pantalla, como parte de la captura DESPUÉS** — no hace falta
repetirlo por ruta porque el archivo es el mismo en las 53.

(`src/components/ui/sidebar.tsx` tiene el conteo más alto de todo el repo — ALTO=23,
MEDIO=26, BAJO=45 — pero verifiqué que **no lo importa ningún archivo del proyecto**:
`Layout.tsx` implementa su propio sidebar a mano, no usa esta primitiva shadcn. Es código
muerto en el sentido literal — nunca se renderiza — así que sus clases muertas no importan
para F0. Lo excluí correctamente de toda tabla de abajo.)

---

## 5. Ranking de pantallas por riesgo (53 rutas: 45 estáticas + 8 dinámicas)

Metodología: `App.tsx` → componente de ruta → BFS de imports locales (`./`, `../`, `@/`)
hasta profundidad 2 (nivel 0 = el propio componente, nivel 1 = sus imports directos, nivel 2
= imports de esos imports), sumando las clases muertas de cada archivo del subárbol por su
propio nivel de riesgo. Verificado con un caso real (`/labores`): el 49-ALTO de
`TareaDetalleDialog.tsx` (nivel 1) y el 14-ALTO de `TrabajadorMultiSelect.tsx` (nivel 2, vía
`CrearEditarTareaDialog.tsx`) sí se agregan — el BFS por niveles funciona como se esperaba,
no solo cuenta el archivo raíz.

**Notas de mapeo:**
- Las 6 rutas de `/finanzas/dashboard/*` comparten el mismo componente
  (`FinanzasDashboard.tsx` con distinto prop `tab`) — mismos números por diseño, no por error.
- `labores` usa el componente **índice** de la ruta anidada (`Labores.tsx`), no el layout
  wrapper (`LaboresLayout.tsx`, que solo renderiza `<Outlet/>` y no importa `Labores`
  directamente vía `import` estático) — es el contenido real que se ve en pantalla.
- `#47 inventario-verificacion-detalle` — **mapeo incierto, lo marco explícitamente**: el
  código de `VerificacionesList.tsx` arma el link de "primera fila" con **tres** destinos
  posibles según estado (`conteo/:id`, `revisar/:id`, o `:id` plano), y solo el primero y el
  tercero tienen ruta declarada en `App.tsx` — `revisar/:id` **no existe como ruta** (cae al
  catch-all `*` → redirect a `/`). No pude determinar sin navegador cuál toma la "primera
  fila" real. La fila de abajo usa `:id` → `ComingSoon.tsx` (placeholder, bajo riesgo); si en
  la práctica cae en `conteo/:id` → `ConteoFisico.tsx`, el riesgo real es MEDIO (7 MEDIO, 31
  BAJO, 0 ALTO) en vez de BAJO trivial. Esto es un hallazgo de ruteo, no de Tailwind — lo
  reporto porque afecta directamente qué va a ver el agente de captura al hacer clic.

| # | slug | ruta | archivos subárbol | ALTO | MEDIO | BAJO | total | veredicto |
|---|---|---|---|---|---|---|---|---|
| 18 | `labores` | `/labores` | 41 | **86** | 16 | 72 | 174 | ALTO — layout probablemente se rompe, capturar sí o sí |
| 32 | `finanzas` | `/finanzas` | 30 | 31 | 6 | 144 | 181 | ALTO — capturar sí o sí |
| 33 | `finanzas-aguacate` | `/finanzas/dashboard/aguacate` | 30 | 31 | 6 | 144 | 181 | ALTO — capturar sí o sí |
| 34 | `finanzas-hato` | `/finanzas/dashboard/hato` | 30 | 31 | 6 | 144 | 181 | ALTO — capturar sí o sí |
| 35 | `finanzas-ganado` | `/finanzas/dashboard/ganado` | 30 | 31 | 6 | 144 | 181 | ALTO — capturar sí o sí |
| 36 | `finanzas-caballos` | `/finanzas/dashboard/caballos` | 30 | 31 | 6 | 144 | 181 | ALTO — capturar sí o sí |
| 37 | `finanzas-agricola` | `/finanzas/dashboard/agricola` | 30 | 31 | 6 | 144 | 181 | ALTO — capturar sí o sí |
| 11 | `monitoreo` | `/monitoreo` | 22 | 27 | 46 | 82 | 155 | ALTO — capturar sí o sí |
| 21 | `produccion` | `/produccion` | 25 | 26 | 19 | 50 | 95 | ALTO — capturar sí o sí |
| 38 | `finanzas-gastos` | `/finanzas/gastos` | 32 | 26 | 19 | 47 | 92 | ALTO — capturar sí o sí |
| 43 | `configuracion` | `/configuracion` | 34 | 21 | 23 | 107 | 151 | ALTO — capturar sí o sí |
| 39 | `finanzas-ingresos` | `/finanzas/ingresos` | 31 | 19 | 17 | 44 | 80 | ALTO — capturar sí o sí |
| 41 | `finanzas-presupuesto` | `/finanzas/presupuesto` | 13 | 16 | 4 | 39 | 59 | ALTO — capturar sí o sí (**+ ya desborda +486px hoy, ver §6**) |
| 23 | `reportes-generar` | `/reportes/generar` | 21 | 14 | 20 | 35 | 69 | ALTO moderado |
| 03 | `inventario-dashboard` | `/inventario/dashboard` | 14 | 13 | 3 | 107 | 123 | ALTO moderado |
| 12 | `monitoreo-registros` | `/monitoreo/registros` | 23 | 12 | 38 | 61 | 111 | ALTO moderado (**+ ya desborda +23px hoy**) |
| 19 | `labores-empleados` | `/labores/empleados` | 20 | 12 | 4 | 16 | 32 | ALTO moderado |
| 30 | `ganado` | `/ganado` | 18 | 12 | 2 | 35 | 49 | ALTO moderado |
| 16 | `clima` | `/clima` | 14 | 11 | 1 | 7 | 19 | ALTO moderado |
| 17 | `clima-historico` | `/clima/historico` | 14 | 11 | 1 | 4 | 16 | ALTO moderado |
| 50 | `aplicaciones-reporte` | `/aplicaciones/:id/reporte` | 10 | 9 | 4 | 22 | 35 | ALTO moderado |
| 31 | `ganado-movimientos` | `/ganado/movimientos` | 18 | 9 | 1 | 17 | 27 | ALTO moderado (**+ ya desborda +13px hoy**) |
| 09 | `aplicaciones` | `/aplicaciones` | 13 | 8 | 17 | 76 | 101 | ALTO moderado |
| 27 | `hato-chequeos` | `/hato-lechero/chequeos` | 31 | 7 | 1 | 5 | 13 | ALTO moderado |
| 04 | `inventario-compras` | `/inventario/compras` | 20 | 6 | 21 | 133 | 160 | ALTO moderado |
| 49 | `aplicaciones-cierre` | `/aplicaciones/:id/cierre` | 8 | 6 | 20 | 93 | 119 | ALTO moderado |
| 20 | `labores-contratistas` | `/labores/contratistas` | 21 | 6 | 4 | 18 | 28 | ALTO moderado (**+ ya desborda +15px hoy**) |
| 22 | `reportes` | `/reportes` | 10 | 6 | 1 | 8 | 15 | ALTO moderado |
| 13 | `monitoreo-carga-masiva` | `/monitoreo/carga-masiva` | 7 | 5 | 4 | 29 | 38 | ALTO moderado |
| 42 | `finanzas-configuracion` | `/finanzas/configuracion` | 20 | 5 | 0 | 15 | 20 | ALTO moderado |
| 02 | `inventario` | `/inventario` | 15 | 4 | 66 | 83 | 153 | MEDIO — foco/hover invisibles hoy |
| 05 | `inventario-movimientos` | `/inventario/movimientos` | 12 | 4 | 22 | 63 | 89 | MEDIO |
| 06 | `inventario-importar` | `/inventario/importar` | 7 | 4 | 5 | 24 | 33 | BAJO acumulado |
| 46 | `inventario-producto-detalle` | `/inventario/producto/:id` | 7 | 4 | 5 | 23 | 32 | BAJO acumulado |
| 07 | `inventario-verificaciones` | `/inventario/verificaciones` | 7 | 4 | 4 | 28 | 36 | BAJO acumulado |
| 15 | `monitoreo-apiarios` | `/monitoreo/apiarios` | 14 | 4 | 2 | 14 | 20 | BAJO |
| 52 | `hato-hoja-de-vida` | `/hato-lechero/hato/:id` | 59 | 4 | 1 | 15 | 20 | BAJO |
| 29 | `hato-pajillas` | `/hato-lechero/pajillas` | 31 | 4 | 0 | 6 | 10 | BAJO |
| 26 | `hato-animales` | `/hato-lechero/hato` | 40 | 3 | 2 | 12 | 17 | BAJO (**+ ya desborda +162px hoy** — la única discrepancia notable con el desborde medido, ver §6) |
| 28 | `hato-alertas` | `/hato-lechero/alertas` | 19 | 2 | 0 | 9 | 11 | BAJO |
| 25 | `hato-produccion` | `/hato-lechero/produccion` | 50 | 1 | 0 | 16 | 17 | BAJO |
| 24 | `hato` | `/hato-lechero` | 24 | 1 | 0 | 1 | 2 | BAJO |
| 10 | `aplicaciones-calculadora` | `/aplicaciones/calculadora` | 17 | 0 | 38 | 104 | 142 | MEDIO |
| 51 | `aplicaciones-calculadora-edicion` | `/aplicaciones/calculadora/:id` | 17 | 0 | 38 | 104 | 142 | MEDIO |
| 48 | `aplicaciones-movimientos` | `/aplicaciones/:id/movimientos` | 10 | 0 | 18 | 95 | 113 | MEDIO |
| 14 | `monitoreo-catalogo` | `/monitoreo/catalogo` | 6 | 0 | 7 | 7 | 14 | BAJO |
| 08 | `inventario-verificaciones-nueva` | `/inventario/verificaciones/nueva` | 7 | 0 | 3 | 30 | 33 | BAJO acumulado |
| 53 | `hato-chequeo-detalle` | `/hato-lechero/chequeos/:id` | 20 | 0 | 2 | 4 | 6 | BAJO |
| 40 | `finanzas-reportes` | `/finanzas/reportes` | 22 | 0 | 0 | 13 | 13 | BAJO |
| 44 | `ventas-comingsoon` | `/ventas` | 3 | 0 | 0 | 6 | 6 | BAJO |
| 45 | `lotes-comingsoon` | `/lotes` | 3 | 0 | 0 | 6 | 6 | BAJO |
| 47 | `inventario-verificacion-detalle` | `/inventario/verificaciones/:id` | 3 | 0 | 0 | 6 | 6 | BAJO — **mapeo incierto, ver nota arriba** |
| 01 | `dashboard` | `/` | 10 | 0 | 0 | 2 | 2 | BAJO |

*(53 filas — dataset completo también en JSON dentro del scratchpad de esta sesión;
reproducible con el método de §1 si hace falta regenerarlo.)*

---

## 6. Corroboración independiente: el desborde horizontal ya medido en `baseline-antes.md`

El loop principal ya midió (con navegador real, `scrollWidth` en viewport móvil 375px) que
**8 de 45 rutas desbordan horizontalmente HOY**, con Tailwind apagado. Cruce con mi ranking
estático:

| Ruta que desborda hoy | exceso medido | ALTO estático (aquí) | ¿coincide? |
|---|---|---|---|
| `/finanzas/presupuesto` | +486px (crítico) | 16 | sí — ranking alto |
| `/hato-lechero/hato` | +162px | 3 | **no** — mi ranking la pone BAJO |
| `/finanzas/dashboard/hato` | +94px | 31 | sí — ranking alto |
| `/finanzas/dashboard/agricola` | +94px | 31 | sí — ranking alto |
| `/monitoreo/registros` | +23px | 12 | sí — ranking alto-moderado |
| `/monitoreo` | +15px | 27 | sí — ranking alto |
| `/labores/contratistas` | +15px | 6 | parcial — ranking moderado |
| `/ganado/movimientos` | +13px | 9 | parcial — ranking moderado |

6 de 8 coinciden razonablemente. La excepción real es `/hato-lechero/hato`
(`AnimalesList.tsx`): desborda **162px** en móvil hoy pero mi barrido de subárbol (profundidad
2) solo le encuentra 3 ALTO. Dos lecturas posibles, no puedo distinguir cuál sin navegador:
(a) el desborde viene de contenido no-Tailwind (una tabla ancha con muchas columnas, que
desborda por contenido real, no por una clase muerta), o (b) viene de una clase muerta en un
archivo fuera de mi profundidad-2 (nivel 3+) o en el patrón de "mapa de clase" no capturado
(§1.4). **Por esto lo incluyo igual en las 12 pantallas recomendadas** — el desacuerdo entre
dos métodos independientes es en sí mismo una señal de que hay que mirarlo.

---

## 7. Las 12 pantallas que hay que mirar sí o sí

1. **`/labores` + abrir el diálogo "Ver detalle" de una tarea** — el archivo con más clases
   ALTO muertas de todo el ranking de rutas (86 agregado; `TareaDetalleDialog.tsx` solo tiene
   49, el peor archivo individual del repo). Sin abrir el diálogo, la ruta en sí casi no
   muestra el daño real.
2. **`/finanzas/presupuesto`** — ALTO=16 en el ranking **y** el peor desborde horizontal
   medido hoy (861px de ancho en un viewport de 375px, +486px). Es la única ruta donde dos
   métodos independientes (clases muertas + `scrollWidth` real) apuntan al mismo lugar con la
   máxima severidad.
3. **`/finanzas/gastos`, botón "Registrar" (D1)** — ALTO=26 en el ranking, uso diario de
   Consuelo/Efrain, y es la pantalla donde `baseline-antes.md` ya documentó que el botón
   "Registrar" necesita clic real (no sintético) — probablemente por los mismos estados
   `data-[state]`/Radix que dependen de clases hoy muertas.
4. **`/monitoreo` + vista de Priorización de Scouting (D4)** — ALTO=27 en la ruta base;
   `PriorizacionScoutingView.tsx` es el archivo con más candidatos del hueco de medición
   heurístico (§1.4, 15) y el módulo explícitamente citado en el plan como ya afectado por el
   bug de Toggle/ToggleGroup (mitigado a mano, pero hay que confirmar que sigue mitigado tras
   F1 retire esos parches).
5. **`/hato-lechero/hato` (AnimalesList) + diálogo "Marcar ciclo" (D5/D6)** — la única
   discrepancia real entre mi ranking estático y el desborde medido en vivo (+162px hoy, ver
   §6). Hay que verla para saber si el desborde es de Tailwind o de contenido.
6. **Panel de chat de Esco (`ChatFAB`/`ChatPanel`), abierto una vez** — segundo archivo con
   más ALTO de todo el repo (25, casi todo `lg:*`) y **no aparece en ninguna ruta** porque es
   chrome global montado fuera de las rutas (§4). Basta con una captura, en cualquier
   pantalla.
7. **`/configuracion` + editar un usuario (D10)** — ALTO=21 en la ruta, y
   `UsuariosConfig.tsx` está en el hueco heurístico de mapas de color (5 candidatos, badges de
   rol).
8. **`/hato-lechero/chequeos` + carga por foto (D7)** — bajo en el conteo directo de la
   ruta (ALTO=7), pero es el flujo donde vive el bug real ya encontrado de `ui/button.tsx`
   sin `forwardRef` (los 3 desplegables de `CapturaArchivo`) — un bug de React, no de CSS,
   pero que solo se ve abriendo el diálogo.
9. **`/inventario/dashboard`** — total=123 con MEDIO+BAJO altísimos concentrados en pocos
   archivos (107 no-ALTO); vale la pena confirmar que no es puro ruido cosmético.
10. **`/produccion`** — ALTO=26, ranking alto, módulo Gerencia-only con tablas de costo/kg
    densas (`tabular-nums` está en el top de clases muertas, 73 apariciones — esta pantalla es
    candidata directa a beneficiarse o romperse con esa clase).
11. **`/finanzas/dashboard/aguacate`** (representando a los 6 dashboards de Finanzas, todos
    idénticos en clases muertas: ALTO=31, total=181) — el mayor total agregado del ranking
    completo. Con capturar uno de los 6 alcanza para el diff del F0; los otros 5 son
    estructuralmente el mismo componente.
12. **`/ganado/movimientos` + diálogo "Registrar movimiento" (D8)** — ALTO=9 en la ruta,
    desborde medido hoy (+13px), y `MovimientoFormDialog.tsx` está en el hueco heurístico de
    §1.4 (mapa de clase para inputs con foco: `focus:ring-primary/20` dentro de un string no
    capturado por el conteo principal, adicional al que sí quedó contado).

---

## 8. Resumen de qué no pude medir (recapitulando, para que no quede disperso)

1. **Mapas de clase indexados dinámicamente** (`const MAPA = {...}` + `mapa[key]` fuera de
   `className=`/`cva(`): 115 apariciones candidatas en 33 archivos, no incluidas en el
   inventario ni en el ranking (§1.4). El de mayor volumen es
   `PriorizacionScoutingView.tsx` (15) — igual está en las 12 pantallas recomendadas.
2. **Archivos `.ts` (no `.tsx`)** fuera de alcance por instrucción explícita de la tarea.
3. **Concatenación de clase totalmente dinámica** (`` `bg-${x}-500` ``): sin evidencia de que
   exista en el repo (grep dirigido, cero resultados), pero si existiera quedaría invisible a
   este método en vez de mostrarse como artefacto — punto ciego teórico, no confirmado.
4. **La discrepancia de `/hato-lechero/hato`** entre desborde medido (+162px) y mi ranking
   estático (ALTO=3) — no puedo resolverla sin navegador; la dejo abierta y recomiendo
   capturarla (§6, ítem 5 de §7).
5. **No hice AST real** — es regex con balanceo de `{}`/`()`, no un parser. Funciona para
   este código base porque lo verifiqué en varios casos reales (`TareaDetalleDialog`,
   `alert-dialog.tsx`, `calendar.tsx`), pero no es una garantía formal para cualquier sintaxis
   TS/JSX futura.
6. **El barrido previo citado en el plan (~845/~4.400) no es reproducible por mí** — no
   tengo su script. Expliqué con evidencia concreta (`space-y-*`) una hipótesis fundamentada
   de por qué diverge de mi número, pero es hipótesis, no una auditoría de su código.
