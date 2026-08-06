# Auditoría de infraestructura alrededor del Tailwind congelado (F0)

Fecha: 2026-08-06. Alcance: solo lectura/análisis de archivos (`Read`/`Grep`/`Bash`), **ningún
archivo del proyecto fue modificado**. Referencia: `docs/plan_tailwind_pipeline.md` §3.

Verificación de línea base antes de auditar: `npm test -- --run` → **83 archivos, 1.993 tests, todos
en verde** (incluidas las 4 guardas de Tailwind). Esto confirma que hoy, con el pipeline apagado, no
hay nada roto que la auditoría deba explicar — el punto de partida es limpio.

---

## Hallazgo previo, transversal a los 4 entregables

**`src/index.css` no es un artefacto de compilación intacto — ya fue editado a mano al menos dos
veces**, a pesar de que `CLAUDE.md` lo describe como "no editar manualmente" y el propio archivo lo
trata como salida congelada. Esto no estaba en el alcance original del plan (que asume que solo
`globals.css` tiene reglas a mano) y cambia el riesgo de F1:

1. **Líneas ~5006–5158**: una **copia casi duplicada** de `globals.css` — los mismos 5 `@font-face`
   de Visby CF, un bloque `:root`/`.dark` con los mismos tokens (le falta `--success-alt`, presente en
   la copia viva de `globals.css`), `html { font-size: var(--font-size) }`, `.scrollbar-hide` y
   `@keyframes fadeIn`/`.animate-fadeIn` — **apéndice sin `@layer`**, insertado en medio de lo que sí
   es salida real de Tailwind (los bloques `@property --tw-translate-x` etc. que le siguen a partir de
   la línea 5160 son legítimos).
2. **Líneas 5548–5577** (el final del archivo): una sección con encabezado `/* Custom utility classes
   for Escocia OS */` que redefine **16 clases con `!important`**: `.bg-brand-brown`,
   `.hover\:bg-brand-brown`, `.text-brand-brown`, `.border-brand-brown`, `.from-brand-brown`,
   `.to-brand-brown\/80`, `.bg-gradient-to-r`, `.from-primary`, `.to-primary-dark`, `.text-white`,
   `.bg-primary`, `.hover\:bg-primary-dark`, `.bg-background`, `.to-secondary`, `.to-secondary-dark`,
   `.hover\:from-primary-dark`, `.hover\:to-secondary-dark`.

**Esto es exactamente lo mismo que motivó las ~116 reglas de `globals.css` (una clase Tailwind
ausente del build), solo que resuelto directamente dentro del archivo que se supone intocable, y con
`!important` en vez de con reglas normales.** Uso en vivo confirmado por grep:

| Clase | Archivos `.tsx` que la usan |
|---|---|
| `text-brand-brown` | **100** |
| `hover:bg-primary-dark` | 38 |
| `bg-gradient-to-r` | 28 |
| `hover:from-primary-dark` | 17 |
| `to-secondary-dark` | 13 |
| `to-primary-dark` | 10 |
| `bg-brand-brown` | 6 |
| `border-brand-brown` | 3 |
| `from-brand-brown` | 2 |
| `to-brand-brown/80` | 1 |

Esto también reconcilia un número del propio plan: la tabla de "clases muertas" de §1 lista
`text-brand-brown/*` con **~640 apariciones muertas**. Ese asterisco importa — es casi con toda
seguridad el patrón **con modificador de opacidad** (`text-brand-brown/70`, etc.), que sí está
muerto porque la regla `!important` de arriba no cubre variantes con `/NN`. La forma **sin**
modificador (`text-brand-brown` a secas, la mayoría de esas 100 apariciones) está **viva hoy**,
justamente por este hack no documentado.

**Consecuencia para F1, no solo para esta auditoría:** el plan instruye borrar el cuerpo entero de
`index.css` y dejarlo como `@import "tailwindcss"; @import "./styles/globals.css";`. Eso es correcto
y es exactamente lo que hay que hacer — pero también **borra estos dos apéndices sin que nadie lo
haya decidido explícitamente**. La buena noticia: `brand-brown`, `primary-dark` y `secondary-dark` ya
están registrados como tokens de color en el `@theme inline` de `globals.css` (líneas 155-157), así
que una vez que el compilador lea ese bloque de verdad, Tailwind **debería regenerar el mismo set de
utilidades solo, y con soporte de opacidad que hoy no existe** (`text-brand-brown/70` empezaría a
funcionar). Pero esto es una hipótesis a verificar en el navegador, no un hecho probado por análisis
estático — es exactamente el tipo de cambio de alto impacto (100 archivos) que la pasada
ANTES/DESPUÉS de F0 tiene que capturar explícitamente. Se lo marco al operador de F0 como punto de
atención obligatorio si no lo estaba ya.

---

## Entregable 1 — Las reglas escritas a mano en `src/styles/globals.css`

**Conteo de reglas**: el archivo tiene 142 llaves de apertura. Contando cada selector (agrupados como
una sola regla, repeticiones dentro de `@media` como reglas aparte) llego a un número en el rango
**100–115**, dependiendo de si se cuentan los selectores agrupados (`.chat-markdown h1, h2, h3, h4`)
como una regla o cuatro. Es consistente con el "~116" del plan — no hay una discrepancia real, solo
una definición de "regla" ligeramente distinta. No vale la pena perseguir el número exacto; lo que
importa es la clasificación de abajo.

### Mecanismo de riesgo, más preciso que "pelea de cascada"

El plan dice que Tailwind activo y las reglas a mano "pueden pelear por especificidad y orden de
cascada" — y que quién gana "puede ser cualquiera de los dos". **Verifiqué esto contra el CSS
congelado real y es más determinista de lo que el plan supone, no menos.**

`src/index.css` ya usa **CSS Cascade Layers nativas** (`@layer properties; @layer theme; @layer base;
@layer utilities;` — confirmado en las líneas 2, 75, 198, 516). Cuando `@tailwindcss/vite` compile de
verdad, el resultado tendrá la misma estructura: **toda utilidad generada por Tailwind vive dentro de
`@layer utilities`**. Las ~116 reglas de `globals.css`, en cambio, **no están envueltas en ningún
`@layer`** (las únicas dos excepciones son los dos bloques `@layer base { ... }` explícitos, que sí
son intencionales).

Por especificación CSS, una regla **sin capa siempre gana sobre cualquier regla dentro de una capa
nombrada**, sin importar especificidad ni orden de aparición en el archivo. Esto significa que, para
cada clase de tipo (A) de abajo, el resultado **no es una moneda al aire**: la regla a mano de
`globals.css` va a ganarle a la utilidad real de Tailwind **siempre**, mientras `globals.css` no esté
también envuelta en `@layer utilities`. Si F1 borra la regla duplicada (que es lo que el plan ya
propone), esto es irrelevante. Pero si alguna sesión futura decide "dejar unas pocas por las dudas",
hay que envolverlas en `@layer utilities { }` explícitamente o van a bloquear la utilidad real de
Tailwind para siempre, en silencio.

### Clasificación

**(B) — CSS legítimo, se queda** (mayoría del archivo): `@custom-variant dark`, los 5 `@font-face` de
Visby CF, `:root`/`.dark` (tokens de color), `@theme inline` (mapeo de tokens — cobra vida con el
compilador, no se toca), el bloque `@layer base { * {...} body {...} }` (ver nota H-1 abajo), `html {
font-size }`, las reglas de spinner de `input[type=number]`, `.h-screen-safe`/`.min-h-screen-safe`/
`.max-h-screen-safe`, `.dialog-viewport-cap`/`.dialog-sm/md/lg/xl`, `.touch-target`, `.safe-bottom`,
`.scrollbar-hide`, `@keyframes fadeIn`/`.animate-fadeIn`, `.chat-markdown` y todos sus descendientes,
`.nav-item-active`, `.filtros-toggle`/`.gasto-meta-movil`/`.gasto-nombre`/`.filtros-colapsables`,
`.lista-financiera > :first-child/:last-child`, **todo el bloque de tablas financieras**
(`.tabla-scroll`, `.tabla-financiera`, `.celda-num`, `.col-etiqueta`, `.col-periodo`, `.col-total`,
`.tabla-flujo`, `.fila-*`, `.sangria-*`, `.valor-negativo`, `.toggle-concepto`), y **todo el bloque de
la tabla de Labores** (`.tareas-*`, 11 reglas). Ninguna de estas colisiona con un nombre de utilidad
Tailwind — son selectores propios del dominio (prefijados o compuestos), así que no hay pelea de
cascada posible. Quedan intactas por diseño.

**(C) — Dudosa**:

1. **El segundo bloque `@layer base` (líneas 192–245), tipografía por defecto de `h1`–`h4`/`p`/
   `label`/`button`/`input`.** Usa `var(--text-2xl)`, `var(--text-xl)`, `var(--text-lg)`,
   `var(--text-base)` — variables que **no existen en ningún `:root` de este proyecto** (ni en
   `globals.css` ni en el `@theme inline`). Hoy, sin compilador, `var()` sin variable definida invalida
   toda la declaración y el navegador la ignora — así que este bloque es 100% inerte hoy. Pero
   `--text-2xl`/`--text-xl`/etc. **sí son variables del tema por defecto de Tailwind v4** (se generan
   automáticamente al hacer `@import "tailwindcss"`, sin que el proyecto tenga que declararlas), así
   que en cuanto F1 encienda el compilador, **este bloque empieza a aplicar tipografía por defecto a
   TODO `h1`/`h2`/`h3`/`h4`/`p`/`label`/`button`/`input` de la app que no tenga ya una clase `text-*`
   heredada** — no es una regresión de un módulo, es un cambio de alcance app-wide, del mismo tamaño
   que el H-1 que el plan ya identificó para `* { @apply border-border }`/`body { @apply bg-background
   text-foreground }`. **El plan no menciona este segundo bloque.** F0 debe verlo también, no solo el
   primero.
2. **El bloque de animación de `Sheet`/`Drawer` (líneas 342–368)**: `.data-\[state\=closed\]\:slide-
   out-to-right`, `-left`, `-bottom`, y sus pares `slide-in-from-*`, escriben `--tw-exit-translate-x`/
   `--tw-enter-translate-x` a mano. **Confirmé que el build congelado YA incluye un motor de animación
   completo** (`.animate-in { animation: enter var(--tw-duration, .15s) var(--tw-ease, ease); }`,
   `@keyframes enter`/`exit` que leen `translate3d(var(--tw-enter-translate-x, 0), ...)`, en
   `index.css:1332` y `5534-5548`) — esto es el patrón del plugin `tw-animate-css` (el sucesor de
   `tailwindcss-animate` para v4), **no Tailwind core**. `package.json` no tiene ese paquete ni ningún
   otro plugin de Tailwind. Si F1 instala solo `tailwindcss@4` + `@tailwindcss/vite` (que es todo lo
   que el plan menciona instalar), **este motor de animación no se regenera** — los diálogos y el
   `Sheet` perderían las transiciones de apertura/cierre otra vez, ahora sin ningún hand-rule que las
   tape. Confirmé además que las clases **sin sufijo numérico** que `sheet.tsx` usa
   (`slide-in-from-right`, `slide-out-to-right`, etc.) **nunca estuvieron compiladas** en el build
   congelado — solo existen las variantes `-2` atadas a `data-side` que usan Popover/Tooltip/Select
   (`index.css:4491-4518`). Por eso alguien las escribió a mano. **Recomendación: F1 debe decidir
   explícitamente si instala `tw-animate-css` (o el plugin que sea) antes de borrar este bloque** — no
   es una limpieza automática, es una dependencia que falta identificar primero.

**(A) — Duplica una utilidad de Tailwind**, con verificación de si el resultado es el mismo o
distinto:

*Mismo resultado visual* (redundantes una vez el compilador esté vivo, seguras de borrar):
`.min-h-0`, `.overscroll-contain`, `.inset-y-0`, `.inset-x-0`, `.bg-transparent`,
`.data-\[state\=on\]\:bg-accent`, `.data-\[state\=on\]\:text-accent-foreground`,
`.data-\[variant\=outline\]\:border-l-0`, `.data-\[variant\=outline\]\:first\:border-l`,
`.first\:rounded-l-md`, `.last\:rounded-r-md`, `.focus\:z-10`, `.focus-visible\:z-10`,
`.rounded-none`, `.min-w-8`, `.min-w-9`, `.min-w-10`, `.px-1\.5`, `.w-auto`. Verifiqué valor por
valor contra `index.css` donde la utilidad ya existía compilada en otro contexto (p.ej.
`min-w-8`/`min-w-9`/`min-w-10`/`px-1.5` no están compiladas hoy porque nada las usaba, pero su
fórmula (`2rem`/`2.25rem`/`2.5rem`/`0.375rem`) es la fórmula estándar de la escala de Tailwind, no
un valor inventado).

*Resultado distinto — las dos bombas reales de esta lista*:

- **`.shadow-none { box-shadow: none; }`** (usada en `ToggleGroupItem`, siempre presente). La
  utilidad real de Tailwind v4 no escribe `box-shadow: none` — escribe `--tw-shadow: 0 0 #0000;` y
  compone la propiedad final como `box-shadow: var(--tw-inset-shadow), var(--tw-inset-ring-shadow),
  var(--tw-ring-offset-shadow), var(--tw-ring-shadow), var(--tw-shadow);` (mismo patrón en
  `index.css:3385-3401` para `shadow-md`, `shadow-2xl`, etc.). Esa composición es **exactamente lo
  que le permite a un anillo de foco (`focus-visible:ring-[3px]`, que SÍ está compilado hoy en
  `index.css:4382-4384`) seguir viéndose aunque el elemento también tenga `shadow-none`** — el
  anillo vive en `--tw-ring-shadow`, una capa separada de `--tw-shadow`. La regla a mano de
  `globals.css`, al escribir el valor final `none` directamente (y sin capa, según el mecanismo de
  arriba), **apaga las cuatro capas a la vez, incluido el anillo de foco**, sin importar
  especificidad. Verifiqué el caso concreto: hoy mismo, `Toggle` ya trae `focus-visible:ring-[3px]
  focus-visible:ring-ring/50` en sus clases base (`ui/toggle.tsx`) y esas dos SÍ están compiladas —
  así que en cuanto se borre `.shadow-none` de `globals.css` sin instalar nada más, el foco por
  teclado en cada `ToggleGroupItem` **empieza a pintar** (mejora, no regresión). Pero si en cambio
  se decide **conservar** `.shadow-none` por algún motivo, hay que saber que sigue anulando el
  anillo de foco para siempre — exactamente la categoría de bug de accesibilidad que la tabla de
  costos del plan ya identificó como la más grave (`focus:ring-primary`, ~155 apariciones).
- **`.data-\[variant\=outline\]\:shadow-xs[data-variant="outline"] { box-shadow: 0 1px 2px 0
  rgba(0, 0, 0, 0.05); }`** (en `ToggleGroup`, el contenedor). Mismo defecto de fondo que la
  anterior — valor final no compuesto — pero hoy no se manifiesta como bug visible porque
  `ToggleGroup` no combina esta clase con ningún `ring-*`/`focus:` en el código actual. Sigue siendo
  una bomba latente: el primer componente que le pase `className="focus:ring-2"` a un
  `<ToggleGroup variant="outline">` va a perder el anillo, y el motivo real (capas de cascada, no
  especificidad) no es intuitivo — vale la pena que quien limpie esto sepa que el patrón es el
  mismo que el de arriba, no un caso aislado.

Ambas comparten la causa: son las únicas dos reglas de la lista que reescriben una propiedad
**compuesta a partir de variables `--tw-*` que otras utilidades también escriben** en vez de una
propiedad simple e independiente (`min-height`, `background-color`, `border-radius`, `width`,
`z-index`). Ninguna otra regla de tipo (A) tiene esta forma, así que no hay más bombas de esta clase
en el archivo — las revisé todas.

---

## Entregable 2 — Destino de las 4 guardas estáticas

Las 4 son técnicamente equivalentes: extraen cada `className` literal de una lista fija de archivos
y verifican que exista (como substring, con la forma escapada) en `index.css` (2 de ellas también en
`globals.css`). Todas están en verde hoy.

### 1. ¿Retirar o reconvertir?

**Retirar, no reconvertir — con una guarda de reemplazo de naturaleza distinta, no una variante de la
misma.** Motivo: su premisa (que "clase presente en el CSS servido" == "clase válida y con efecto")
solo tiene sentido cuando el CSS servido es un archivo estático congelado que puede tener huecos. Con
el compilador vivo, **toda clase de Tailwind sintácticamente válida que aparece en el JSX se genera**
— el conjunto "clases usadas" y "clases servidas" convergen por construcción, así que "¿existe en el
CSS?" deja de ser una pregunta que valga la pena automatizar; sería un test que siempre pasa,
verificando el compilador en vez del código.

Lo que sí sigue teniendo valor, y es un test **distinto**, no una adaptación del actual:

- **Un guard de typos**, no de ausencia: Tailwind JIT no falla ante una clase mal escrita
  (`bg-primry`) — la ignora en silencio, exactamente el mismo modo de fallo que hoy, solo que la
  causa cambia de "no está en el build congelado" a "no es un nombre de utilidad válido". Ese guard
  necesitaría la lista real de utilidades que Tailwind puede generar (se puede sacar del CSS
  compilado en cada build, o de un diccionario de patrones), no de un `index.css` estático a mano.
  Es más caro de mantener que el actual y probablemente **no vale la pena como test unitario** — es
  el tipo de cosa que un plugin de ESLint (`eslint-plugin-tailwindcss`) resuelve mejor, señalando en
  el editor en vez de en CI.
- **Un guard de "el CSS compilado contiene lo que el JSX pide"** (la lectura literal de la propuesta
  del enunciado) tiene el problema de que necesitaría ejecutar el build de Tailwind primero (o
  importar su motor) para tener un `index.css` fresco contra el cual comparar — Vitest no compila
  CSS. Viable solo como test de integración post-build (`npm run build && node scripts/verify-css.js`),
  no como parte de la suite de Vitest actual. Dado que el valor marginal es bajo (ver arriba), no lo
  recomendaría como reemplazo 1:1; lo dejaría para `qa` decidir si vale la pena en F1 como paso de
  build, no como test.

### 2. ¿Qué protección real se pierde, y hay algo que deba cubrirla?

Se pierde la única red que hoy atrapa: *"esta clase de Tailwind que escribí no existe en el build
congelado y no va a hacer nada."* Con el compilador encendido esa categoría de bug **deja de poder
ocurrir por construcción** (cualquier clase válida se genera) — no es que la protección se pierda sin
reemplazo, es que el problema que protegía deja de existir. Lo que la reemplaza, según el propio plan
(§5, fila de riesgo "F1 funciona pero los tokens siguen muertos"), es la verificación manual en
navegador de que `--color-primary` resuelve — eso ya está cubierto por el protocolo F0/F1 del plan
(paso 2b), no hace falta un test nuevo para eso.

Lo único que **no** queda cubierto por nada, ni antes ni después, es la clase de bug que estos guards
nunca atraparon porque no es su contrato: valores **compuestos** dando un resultado visual distinto
al pretendido (la categoría "bomba" del Entregable 1). Eso no es detectable por análisis estático de
texto — solo por inspección visual (F0/F2/F4 con `usertest`/`qa` mirando pantallas), que es
exactamente el mecanismo que el plan ya tiene previsto.

### 3. Otras guardas dependientes del CSS congelado — búsqueda dedicada

Encontré **una quinta guarda no listada en el plan**, aunque con un contrato distinto y que **no
necesita retirarse**:

**`src/__tests__/dialogScrollContract.test.ts`** — referencia `globals.css` (en un comentario, no lo
lee) y usa `min-h-0` como parte de su segunda aserción (`<form>` debe llevar `flex-1` y `min-h-0`
literalmente en su `className`). A diferencia de las 4 anteriores, **no comprueba existencia de
clases contra el CSS compilado** — es un guard estructural (¿todo `<DialogContent>` con contenido usa
`<DialogBody>` o tiene su propio scroll?, ¿todo `<form>` que envuelve `<DialogBody>` puede encogerse?)
que opera sobre patrones de JSX, no sobre el CSS servido. **Sigue siendo válido después de F1 sin
tocarlo**: la clase `min-h-0` seguirá siendo el token correcto a exigir en el `className` — de hecho
mejora, porque hoy exige un token que está muerto en el build congelado (la regla a mano de
`globals.css:281-283` lo mantiene vivo por ahora) y después de F1 ese mismo token por fin significará
algo real, sin ningún cambio de contrato en el test.

Búsqueda exhaustiva realizada (no solo grep de "index.css"): grep de `globals.css`, de
`congelado`/`FROZEN`/`frozen` case-insensitive, y de patrones `className=` combinados con lectura de
archivo CSS, sobre las 83 suites de `src/__tests__/`. Los otros dos archivos que mencionan "frozen"
(`calculosClima.test.ts`, `reporteSemanalClimaLluvia.test.ts`) son sobre el bug **no relacionado** del
contador de lluvia congelado de Ecowitt (migración 068) — verificado leyendo el contexto, no
homónimos peligrosos.

**No encontré ninguna guarda oculta adicional que verifique clases contra CSS.** Las 4 conocidas + la
1 estructural de `dialogScrollContract` son el universo completo en `src/__tests__/`. Tampoco hay
`.github/workflows/` en este repo (no hay CI configurado) ni scripts en `package.json`/`scripts/` que
hagan una verificación equivalente fuera de Vitest — confirmado por búsqueda de `index.css` en todo
el árbol fuera de `__tests__` y `src/index.css` mismo.

---

## Entregable 3 — Las menciones a la caution zone

**El número real es 12 archivos** que citan explícitamente la caution zone "Tailwind classes are
FROZEN" / "Tailwind congelado" / "frozen-Tailwind" (contando el propio `CLAUDE.md` raíz, que es la
fuente). Descontando el `CLAUDE.md` raíz, son **11 documentos más** — más cerca de "~11" que de
"~10", pero dentro del margen de un barrido aproximado; no hay una discrepancia que amerite
replantear el plan.

| # | Archivo | Líneas |
|---|---|---|
| — | `CLAUDE.md` (raíz) — la fuente, sección a reescribir | 443–445 en adelante |
| 1 | `src/guidelines/Guidelines.md` | 7 |
| 2 | `src/components/hato/CLAUDE.md` | 52, 122, 142 |
| 3 | `src/components/finanzas/CLAUDE.md` | 16, 39, 41 |
| 4 | `docs/bugs/2026-07-21-dialog-sin-scroll-usuarios.md` | 114 |
| 5 | `docs/plan_hato_ciclo_manual_override.md` | 38, 638, 654 |
| 6 | `docs/plan_hato_produccion_rework.md` | 45, 589, 652 |
| 7 | `docs/plan_hato_ronda_agosto_2026.md` | 352 |
| 8 | `escociaos-po/memory/bug-triage.md` | 38 |
| 9 | `escociaos-po/memory/code-quality.md` | 7, 56 |
| 10 | `escociaos-po/reports/2026-07-31-dryrun-lunes.md` | 348 |
| 11 | `.claude/agents/code-quality.md` | 14, 23, 74 |

No listado arriba porque no es un documento sino la fuente misma del análisis:
`docs/plan_tailwind_pipeline.md` (se retira junto con la rama del spike, no se "corrige").

**Más allá de documentos — 4 archivos de test citan "Caution Zones" en comentarios** (ya cubiertos en
el Entregable 2: las 4 guardas de Tailwind + `hatoSchemaContract.test.ts`, pero este último cita la
**otra** caution zone del `CLAUDE.md`, la de migraciones SQL — no la de Tailwind, verificado leyendo
el contexto).

**Y hallazgo adicional no pedido explícitamente pero relevante**: hay **7 archivos de código fuente**
(no tests, no docs) con comentarios en línea que citan el razonamiento de "build congelado" para
justificar una decisión de estilo puntual — quedarán desactualizados en cuanto el pipeline se
encienda, aunque no rompen nada si no se tocan:

- `src/utils/hatoUi.ts:13-15`
- `src/components/Dashboard.tsx:597`
- `src/components/hato/components/FranjaEstadisticas.tsx:66-67`
- `src/components/hato/components/HatoReproCard.tsx:10`
- `src/components/hato/components/HatoKpiCard.tsx:7-9`
- `src/components/hato/components/CapturaArchivo.tsx:81-82`
- `src/components/monitoreo/PriorizacionScoutingView.tsx:62-63, 656-658`

Ninguno de estos amerita una pasada dedicada — son comentarios explicativos, no lógica — pero si F2
toca cualquiera de estos archivos por otro motivo, vale la pena limpiar el comentario en el mismo
commit en vez de dejarlo mintiendo sobre por qué el código es como es.

---

## Entregable 4 — El orden de importación

**Estado actual confirmado, verbatim (`src/main.tsx`)**:
```tsx
import App from "./App.tsx";
import "./index.css";
import "./styles/globals.css";
```
Dos entradas de CSS separadas, ambas vía JavaScript, en ese orden — coincide exactamente con lo que
el plan describe. `index.html` no referencia CSS directamente (Vite lo inyecta a través de
`main.tsx`), así que no hay una tercera vía por ahí.

**Reencadenamiento que hace falta** (ya lo dice el plan, lo confirmo sin matices adicionales):
`index.css` pasa a ser código fuente —
```css
@import "tailwindcss";
@import "./styles/globals.css";
```
— y `main.tsx` deja de importar `globals.css` por separado (solo `import "./index.css";`).

**Tercera entrada de CSS que nadie había señalado**: `src/components/finanzas/dashboard/components/
dashboardTables.css`, importado por **4 componentes**:

- `PivotTableGastos.tsx`
- `DetalleGastosExpandible.tsx`
- `GrupoIngresosTable.tsx`
- `DataTable.tsx`

La leí completa. **No usa ninguna directiva de Tailwind** (`@theme`, `@apply`, `@layer`, `@import
"tailwindcss"`) — es CSS plano con media queries reales y referencias a `var(--border)`/
`var(--foreground)`, las mismas custom properties que define `globals.css:root`. Su propio comentario
de cabecera explica por qué existe (mismo motivo que toda la infraestructura de este audit: Tailwind
sin JIT no genera `grid-cols` arbitrarios). **No cae en la trampa del punto 4 del plan** — no tiene
`@theme` que dependa de la cadena de imports de Tailwind para cobrar vida, así que no importa si se
importa antes, después o en paralelo a la cadena `index.css`→`globals.css`; sus `var()` se resuelven
por herencia/cascada normal en cuanto `:root` exista en el DOM, sin importar el archivo de origen ni
el orden de cadena. **No requiere ningún cambio para F1.** Queda mencionado aquí porque el enunciado
pedía explícitamente encontrar entradas de CSS no recordadas, y esta lo es — nadie en el plan ni en
`CLAUDE.md` la menciona.

No hay más archivos `.css` en `src/` (confirmado con `find src -name "*.css"`): solo `index.css`,
`styles/globals.css` y este `dashboardTables.css`.

---

## Qué no pude determinar

- **Tamaño real del CSS compilado tras F1.** Es explícitamente un entregable de F1 ("verificar que
  `npm run build` produce un CSS de tamaño razonable"), no de esta auditoría — no corrí ningún build
  de Tailwind (no está instalado, y la regla dura de esta tarea es no correr `npm install`).
- **Si Tailwind v4 core realmente no trae `animate-in`/`slide-in-from-*` sin plugin**, o si son parte
  del core desde alguna versión reciente que no verifiqué contra la documentación oficial en vivo
  (no tengo acceso a navegador en este hilo). Mi conclusión se apoya en evidencia indirecta fuerte
  (el patrón `--tw-enter-*`/`--tw-exit-*` + `@keyframes enter/exit` es el que usa el paquete
  `tw-animate-css`, y no hay estas utilidades en ningún build de Tailwind v4 "vanilla" que yo conozca
  sin plugin) pero no la puedo confirmar con el navegador desde este hilo — F1 debe verificarlo antes
  de dar por buena la sección C.2 de arriba.
- **Si el apéndice `!important` de `index.css` (líneas 5548-5577) sobrevive intacto visualmente una
  vez que `@theme` regenere `brand-brown`/`primary-dark`/`secondary-dark` de verdad.** Mi hipótesis
  (sí, porque los tokens ya están registrados en `@theme inline`) es razonable pero no la verifiqué en
  pantalla — es exactamente lo que la pasada ANTES/DESPUÉS de F0 tiene que confirmar, y se lo señalo
  como punto de atención explícito dado que toca 100 archivos.
