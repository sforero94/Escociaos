# Plan — reactivar el pipeline de Tailwind y actualizar la UI

Origen: decisión de Santiago (2026-08-06), tras descubrir en la auditoría de UI del Hato que las
primitivas de shadcn se renderizaban como texto plano porque el build congelado no traía sus clases.

Refinado 2026-08-06 con la segunda ronda de decisiones (T-4 … T-7) y el reparto por agentes.

---

## 1. El diagnóstico

**Esto no es una decisión de arquitectura. Es un proyecto de Tailwind v4 al que le falta el paso de
compilación.**

| Evidencia | Qué significa |
|---|---|
| `src/index.css` arranca con `/*! tailwindcss v4.1.3 \| MIT License */` | Es la **salida** de una compilación, guardada en el repo — no una fuente |
| `src/styles/globals.css` usa `@custom-variant dark` (l.1), `@theme inline` (l.130) y `@layer base` (l.179) | Está escrito para v4… y el navegador **ignora esas directivas enteras**. Los tokens que define ahí no existen en tiempo de ejecución |
| `package.json` no tiene `tailwindcss` ni `postcss` | El compilador no está instalado |
| `vite.config.ts` solo carga `react()` | No hay plugin que lo ejecute |

Viene del scaffold de Figma Make: exportó el CSS ya compilado y el pipeline nunca se cableó. Desde
entonces, **una clase que no esté en ese archivo no falla — no hace nada.** Sin error, sin aviso.

### El costo medido — **cifras corregidas 2026-08-06**

> ⚠️ **Las cifras originales de este plan (~845 clases / ~4.400 apariciones) estaban infladas por un
> error de método.** El barrido inicial comprobaba pertenencia por *substring*, así que daba por viva
> cualquier clase cuyo nombre fuera prefijo de otra, y por muerta a otras que sí existían. Se rehízo
> con comparación exacta contra el conjunto de selectores servidos. **Las cifras de abajo son las
> buenas.**

Barrido exacto de los `className` de los **300** archivos `.tsx` (incluye `cn()`, ternarios, arrays,
objetos clsx, `cva(...)` y el prop `classNames={{…}}` de `react-day-picker`) contra
`index.css` + `globals.css`:

- **608** clases distintas muertas
- **2.895** apariciones de clases muertas
- `dark:*` → **0**. No hay interruptor de modo oscuro en ninguna parte de la app; todo el bloque
  `.dark` de `globals.css` es código muerto.

| Familia | Apariciones muertas | Qué se pierde hoy |
|---|---|---|
| `text-brand-brown/<opacidad>` | **650** | La familia más dañada, y es real. `text-brand-brown` **a secas está viva** (43 usos) gracias al hack `!important` de H-4; lo que muere son las 650 variantes con opacidad (`/70` ×307, `/60` ×184, `/50` ×107, `/40` ×47…). Esos textos heredan el color del padre |
| ALTO — mueve layout | **530** (191 distintas) | Tamaños y posiciones. Es lo que puede romper una pantalla |
| MEDIO — interacción y estado | **492** (102 distintas) | `focus:*`, `hover:*`, `disabled:*`, `data-[state=*]`. Incluye la navegación por teclado |
| BAJO — cosmético | **1.873** (315 distintas) | Colores, tipografía, redondeos, sombras |
| ~~`space-y-*`~~ | ~~380~~ → **~13** | **Corregido.** `space-y-1` … `space-y-8` **sí existen** en el build congelado; la única muerta es `space-y-0`. El espaciado vertical NO está roto, al contrario de lo que decía la versión anterior de este plan |

**Tres focos que ningún ranking por ruta encuentra**, y que hay que mirar aparte:

- **`ChatPanel.tsx`** (el chat de Esco) es el segundo peor archivo del repo en clases ALTO (25, casi
  todas `lg:*`) y está montado **globalmente, fuera de cualquier ruta**: es ancestro, no descendiente,
  así que no aparece en ninguna tabla por pantalla.
- **`ui/sidebar.tsx`** tiene el mayor conteo bruto de clases muertas del repo y **no lo importa
  nadie** (verificado: cero importadores; `Layout.tsx` trae su propio sidebar a mano). Código
  inalcanzable — no se toca en F2, se borra cuando toque.
- **115 clases candidatas más en 33 archivos** viven dentro de mapas de color/estado indexados
  dinámicamente (peor caso: `PriorizacionScoutingView.tsx`, 15). Quedan fuera del conteo principal
  por ser de menor confianza — declaradas, no escondidas.

**Dos bugs reales de esta misma familia, encontrados el 2026-08-06** — ninguno detectado por 1.993
tests, lint ni typecheck; los dos aparecieron mirando la pantalla:

1. `ui/button.tsx` sin `forwardRef` → los tres desplegables de carga por foto no abrían.
2. `Toggle`/`ToggleGroup` sin ~15 de sus clases → se renderizaban como texto plano. Otro módulo
   (`PriorizacionScoutingView`) ya se había estrellado con lo mismo y se hizo un control a mano.

### Tres hallazgos de la verificación del 2026-08-06 (no estaban en la versión original)

**H-1 · ~~`@apply` está muerto y alcanza a `*` y `body`~~ — RETRACTADO. Era falso.**

La afirmación original decía que `globals.css:179-186` (`@layer base { * { @apply border-border … }
body { @apply bg-background … } }`) no corría, y que encender el compilador cambiaría el borde de
todo elemento y el fondo del `body`. **Verificado en pantalla el 2026-08-06: es falso.** Esas reglas
ya están compiladas dentro de `index.css:449-465`, literalmente:

```css
body { background-color: var(--background); color: var(--foreground) }
*    { border-color: var(--border); outline-color: var(--ring) }
```

El error de razonamiento: es cierto que el navegador ignora `@apply`, pero no se comprobó si la
**salida compilada ya contenía el resultado equivalente**. Sí lo contiene.

**Lo que sí se aprendió, y vale más que el hallazgo falso:** `index.css` es la compilación de una
versión ANTERIOR de `globals.css`. Casi todo lo que hoy está en `globals.css` ya quedó horneado ahí
—incluidos `@theme`, `@apply` y `@layer base`— porque en su momento sí pasaron por el compilador.

**Corolario, y es el que reordena el diagnóstico:** lo verdaderamente muerto no es "todo lo que use
directivas de Tailwind", sino la **diferencia** entre lo que se compiló entonces y lo que el código
usa ahora. Eso explica el apéndice `!important` del final de `index.css` (ver H-4): alguien necesitó
clases que el build viejo no traía y las escribió a mano ahí.

**H-1bis · Lo que sí es CSS nativo y sí corre hoy: `@layer`.**
`@layer` no es una directiva de Tailwind, es CSS estándar desde 2022, y el navegador la aplica. Por
eso el **segundo** bloque `@layer base` de `globals.css:192-245` (tipografía de `h1`–`h4`, `p`,
`label`, `button`, `input`) **está activo en producción hoy**. Comprobado en pantalla: `--text-2xl`
resuelve a `1.5rem` (definida en `index.css:165`, dentro de `@layer theme`) y el `h1` del Dashboard
computa exactamente `24px` con `font-weight: 500`.

Esto importa para F1: esa tipografía base **no es una novedad que vaya a aparecer**, es
comportamiento actual que hay que **conservar** (T-5). Si F1 borra el cuerpo de `index.css` sin
reponer esas variables, la jerarquía tipográfica de toda la app cambia de golpe.

**H-2 · Son ~53 pantallas, no ~25.**
`App.tsx` declara **45 rutas estáticas** y **8 dinámicas** (`:id` de producto, aplicación, animal,
chequeo, verificación). En escritorio + móvil eso son ~200 capturas por corrida, no 50.

**H-4 · `src/index.css` NO es un artefacto congelado intacto: ya fue editado a mano, dos veces.**
Contradice su propio contrato (`CLAUDE.md`: *"do not edit it manually"*). Verificado 2026-08-06:

1. **Líneas ~5006–5158** — una copia casi duplicada de `globals.css` (mismos `@font-face`,
   `:root`/`.dark`, `.scrollbar-hide`, `@keyframes fadeIn`), insertada sin `@layer` en medio de la
   salida real del compilador.
2. **Líneas 5548–5577** — un bloque `/* Custom utility classes for Escocia OS */` con **16 clases
   marcadas `!important`**: `.text-brand-brown`, `.bg-primary`, `.text-white`, `.bg-background`,
   `.bg-gradient-to-r`, `.hover\:bg-primary-dark`, `.to-secondary-dark`… `text-brand-brown` sola se
   usa en **98 archivos `.tsx`**.

**Consecuencia para F1, y es delicada:** el plan dice que `index.css` pasa de build compilado a
archivo fuente — o sea, se borra su cuerpo. Ese borrado se lleva por delante este apéndice. Los
tokens `brand-brown`, `primary-dark` y `secondary-dark` sí están declarados en el `@theme inline` de
`globals.css`, así que **en teoría** el compilador regenera el mismo juego de clases. Pero es una
hipótesis, no un hecho, y toca 98 archivos. Es el punto de verificación número uno de la pasada
ANTES/DESPUÉS.

**H-5 · La cascada no es ambigua: es determinista, y siempre gana la regla a mano.**
`index.css` usa **capas nativas** (`@layer properties/theme/base/utilities`). Las ~116 reglas
escritas a mano en `globals.css` **no están en ninguna capa**. Por especificación CSS, una regla sin
capa gana *siempre* sobre cualquier regla dentro de `@layer utilities`, sin importar especificidad ni
orden. No es "pueden pelear" como decía la versión anterior de §3.2 — es que la regla a mano gana
mientras no se borre o no se envuelva en `@layer utilities`.

Dos son bombas reales (mismo nombre que una utilidad, resultado distinto): `.shadow-none` y
`.data-[variant=outline]:shadow-xs`, ambas en `globals.css`. Escriben `box-shadow` de forma literal
en vez de por capas `--tw-*`, lo que **anula cualquier `focus-visible:ring-*` combinado** — la misma
categoría de daño de accesibilidad que ya señala la familia de 155 apariciones de `focus:*`.

**H-3 · Capturar solo rutas subestima el daño justo donde está concentrado.**
Los dos bugs de arriba estaban en **diálogos y controles**, no en layout de página. Buena parte de la
UI de esta app vive en `Dialog` (el `CLAUDE.md` raíz le dedica un sistema de tamaños entero), y ahí es
donde se acumulan `focus:ring-*`, las clases de `Toggle`/`ToggleGroup` y el contrato de scroll. F0
**tiene que abrir diálogos**, no solo navegar rutas.

---

## 2. Decisiones del dueño

### Primera ronda (2026-08-06)

| # | Decisión | Consecuencia |
|---|---|---|
| T-1 | **Medir antes de comprometerse.** Una sesión de spike en rama descartable que capture el antes/después de todas las pantallas. | Convierte "va a cambiar todo" en una lista concreta y priorizada, antes de gastar sesiones. |
| T-2 | **La app debe verse siempre presentable.** Martha y Consuelo la usan a diario. | Todo vive en rama y se despliega cuando está completo y verificado. Merge grande al final, no despliegues parciales. |
| ~~T-3~~ | ~~El alcance es rediseño visual: colores, tipografía, espaciados.~~ | **Revocada por T-5.** Ver abajo. |

### Segunda ronda (2026-08-06, tras verificar el diagnóstico)

| # | Decisión | Consecuencia |
|---|---|---|
| T-4 | **F0 se ejecuta ya**, en la misma sesión en que se aprueba este plan. | El número real de F2 existe hoy, no en otra sesión. |
| T-5 | **Se conserva la paleta actual** (verde `#73991C`, Visby CF, los tokens que ya están en `globals.css`). El trabajo es que *funcionen de verdad* y ordenar espaciados y tipografía. **Sin cambio de identidad.** | **Invierte la premisa de T-3.** T-3 decía que como los tokens se iban a redefinir igual, revivir `@theme` era el punto de partida del rediseño y no una regresión que contener. Con la paleta congelada eso deja de ser cierto: **sí hay regresión que contener**, y F4 deja de ser "rediseñar" para ser "pulir sobre lo que ya existe". |
| T-6 | **La profundidad de F2 se decide con el informe de F0**, no ahora. | Es exactamente para lo que existe F0. No se compromete alcance contra un número que todavía no existe. |
| T-7 | **Santiago inicia sesión una vez a mano** en el panel del navegador; los agentes reutilizan esa sesión. | Ni credenciales en el chat, ni bypass de auth en el código. Restringe F0 a un solo agente manejando el navegador a la vez (ver §6). |

---

## 3. Lo que hay que desmontar además del pipeline

Encender Tailwind no es solo instalar el compilador. Hay infraestructura construida **alrededor** de
la limitación que deja de tener sentido, y si no se retira, sabotea el trabajo nuevo.

1. **Cuatro tests estáticos verifican que cada clase exista en `index.css`**:
   `hatoCicloManualTailwind`, `hatoProduccionTableroTailwind`, `hatoCorreccionChequeoTailwind`,
   `hatoPesajeFotoTailwind`. Con Tailwind corriendo pasan de red de seguridad a **freno**: harían
   fallar clases perfectamente válidas. Hay que retirarlos o reconvertirlos en otra cosa.
2. **~116 reglas escritas a mano en `globals.css` duplican utilidades de Tailwind** — incluidas las
   que se agregaron el 2026-08-06 para revivir `ToggleGroup` (`.bg-transparent`, `.w-auto`,
   `.rounded-none`, `.first\:rounded-l-md`…). Con el compilador activo quedan redundantes y pueden
   pelear por especificidad y orden de cascada. Hay que limpiarlas.
3. **La caution zone "Tailwind classes are FROZEN" del `CLAUDE.md` raíz es la regla más citada del
   repo** — aparece en 10 documentos. Mientras siga escrita, cada sesión futura seguirá evitando
   clases válidas y agregando CSS a mano. Reescribirla es parte del trabajo, no un adorno.
4. **`main.tsx` importa `index.css` y después `globals.css` como dos entradas separadas.**
   ⚠️ **Esto no es solo un tema de cascada — es la trampa técnica de F1.**
   **Verificado contra la documentación oficial de Tailwind v4** (`tailwindcss.com/docs/theme`,
   consultada 2026-08-06), que lo dice sin ambigüedad: *Tailwind no genera clases de utilidad a
   partir de bloques `@theme` que estén en archivos importados únicamente por JavaScript.* Y eso es
   exactamente lo que hace `main.tsx` hoy con `globals.css`.

   La razón es que `@theme` no declara solo variables CSS: **le instruye al compilador que fabrique
   utilidades**. Si el archivo no entra por la cadena de `@import "tailwindcss"`, el compilador nunca
   lo lee. Lo mismo aplica a `@custom-variant dark` (l.1) y al `@layer base { @apply … }` (l.179).

   Estructura correcta, y criterio de aceptación de F1:
   ```css
   /* src/index.css */
   @import "tailwindcss";
   @import "./styles/globals.css";   /* aquí viven @theme, @custom-variant y @layer base */
   ```
   con `main.tsx` importando **solo** `index.css`.

   Si F1 se limita a instalar el plugin sin reencadenar, **los tokens siguen muertos y va a parecer
   que el pipeline funciona**: el build pasa, el CSS se genera, y `bg-primary` sigue sin pintar. Es
   el modo de fallo silencioso más probable de toda la fase.

---

## 4. Fases

```
F0 spike medido  ──>  F1 encender  ──>  F2 contener regresión  ──>  F3 tokens  ──>  F4 pulir
     (hoy)          (rama larga)        (alcance según F0)
```

### F0 · Spike medido — 1 sesión, rama descartable

Rama `spike/tailwind-medicion`, **no se mergea nunca**. Protocolo detallado en §6.

- Capturar las 45 rutas estáticas + una muestra de las dinámicas, en escritorio (1280×800) y móvil
  (375×812), **antes**.
- Capturar además **una pasada de diálogos** de alto tráfico (H-3): registro de gasto, registro de
  ingreso, captura de labor, diálogos del Hato, y cualquiera que use `Toggle`/`ToggleGroup`.
- Encender Tailwind (instalar, cablear el plugin, reencadenar los `@import` — punto 4 de §3).
- Capturar las mismas pantallas y los mismos diálogos **después**.
- Entregable: informe con el diff pantalla por pantalla, clasificado por severidad
  (layout roto > layout desplazado > color/tipografía > mejora), y una estimación real de F2.

**Este es el único entregable que importa de F0: un número.** Sin él, F2 es una apuesta.

### F1 · Encender el pipeline — 1 sesión

> **Listo para ejecutar.** F0 ya hizo este cambio completo en `spike/tailwind-medicion` y lo verificó.
> F1 lo repite sobre la rama larga y añade la limpieza que el spike deliberadamente NO hizo.
> Informe: `docs/tailwind-spike/informe-f0.md`.

Rama larga `feat/tailwind-pipeline`, **partiendo de un `main` al día** (T-2: nada sale a producción
hasta el final).

**Paso 0 — antes de nada, un `git rebase` sobre `main`.** F0 corrió sobre una base del 2026-08-06;
si hay trabajo mergeado después, la limpieza de `globals.css` puede chocar con clases nuevas.

**Lo ya validado por F0 (repetir tal cual, sin re-investigar):**

- `tailwindcss@4.3.3` + `@tailwindcss/vite@4.3.3` como devDependencies; `tailwindcss()` en
  `vite.config.ts` después de `react()`.
- `src/index.css` pasa a dos líneas: `@import "tailwindcss";` + `@import "./styles/globals.css";`
  y `main.tsx` deja de importar `globals.css` por separado. **Sin esto los tokens no compilan**
  (§3.4).
- **Arreglar `globals.css:686` primero**: la secuencia `*/` dentro del comentario en prosa
  (`bg-*/border-*/text-*,`) cierra el comentario a mitad de frase y **bloquea el 100% del build**
  con Lightning CSS. El navegador venía tolerándolo en silencio. Es la única ocurrencia del patrón
  en el archivo (verificado).
- **Reiniciar el dev server tras cambiar `vite.config.ts`.** Vite intenta recargar la config solo y
  puede quedar en un estado roto que sirve la app sin CSS. Si las sondas dan `bg-primary`
  transparente, el problema es el server, no el pipeline — reiniciar antes de diagnosticar nada.

**La limpieza que F0 NO hizo, y que es el trabajo propio de F1:**

- Retirar los 4 guards estáticos (**retirar, no reconvertir** — con el compilador activo su premisa
  desaparece y un reemplazo con la misma forma sería un test que siempre pasa).
  `dialogScrollContract.test.ts` es estructural y **se queda**.
- Limpiar las ~116 reglas a mano de `globals.css`, **empezando por las dos bombas**: `.shadow-none` y
  `.data-[variant=outline]:shadow-xs` anulan cualquier `focus-visible:ring-*`. Recordar que esas
  reglas están **fuera de toda capa** y por lo tanto **ganan siempre** sobre `@layer utilities`
  (H-5): borrarlas o envolverlas, no basta con cambiarlas.
- Reescribir la caution zone del `CLAUDE.md` raíz y las menciones en los **11 documentos** restantes
  (lista exacta con líneas en `auditoria-infraestructura.md`).
- Borrar `ui/sidebar.tsx` — no lo importa nadie y tiene el mayor conteo bruto de clases muertas del
  repo.
- **Decidir explícitamente `tw-animate-css`**: no se instaló en F0, así que las animaciones de
  entrada/salida de `Sheet`/`Drawer` son un punto abierto.

**Criterios de aceptación (medidos, no "se ve bien"):**

| Criterio | Valor de referencia de F0 |
|---|---|
| `--color-primary` resuelve en el navegador | `#73991C` |
| `text-brand-brown/70` aplica opacidad real | `oklab(… / 0.7)`, no el verde heredado |
| `tabular-nums` activo | `font-variant-numeric: tabular-nums` |
| `h1` conserva su tamaño | 24 px / peso 500 |
| `npm test` | 1.975 verdes; los 18 rojos desaparecen al retirar las guardas |
| CSS del build | ~174 KB raw / ~25,6 KB gzip |
| `ui/button.tsx` conserva `forwardRef` | sí |

### F2 · Contener la regresión — **2 a 3 sesiones** (T-6 resuelto por F0)

Orden fijado por la evidencia, no por intuición:

1. **El sidebar, primero y solo.** Su contenido crece de 622 px a 948 px y el pie tapa 18 px del ítem
   activo. Es una corrección única que beneficia **todas** las pantallas, y por eso va **antes** que
   la limpieza de F1 si hiciera falta priorizar.
2. **Barrido del recorte de texto.** ⚠️ **La formulación original de este punto era incorrecta y se
   corrigió el 2026-08-06 tras el primer barrido.**

   Decía: *"clases de recorte que estaban muertas y ahora funcionan"*. **Falso, verificado contra el
   `index.css` congelado**: `.truncate` (línea 1570) y `.whitespace-nowrap` **siempre estuvieron
   vivas**. Lo que estaba muerto eran las **restricciones de ancho** — `.max-w-full` y `.md:max-w-*`
   dan **0** apariciones en el build congelado.

   **El mecanismo real:** `truncate` no cambió. Cambió su contenedor. Al activarse las clases de
   ancho, el contenedor se estrechó y el `truncate` preexistente por fin tuvo algo que recortar. El
   caso testigo (`TareaDetalleDialog.tsx:248`, `max-w-full md:max-w-[75%]`) lo confirma.

   **Consecuencia para el barrido**: buscar clases de recorte encuentra los síntomas, no las causas, y
   **no predice dónde aparecerá recorte nuevo**. El objetivo correcto son las **restricciones de
   ancho y layout recién vivas** (`max-w-*`, `w-*`, `min-w-0`, `flex-1`, `grid-cols-*` y sus variantes
   responsive) que estrechen un contenedor con texto adentro.

   Sigue siendo análisis estático y delegable, pero **con un límite declarado**: la liveness del
   selector sola no basta, porque el daño depende del ancho real en pantalla. Los casos dudosos hay
   que verlos en el navegador.
3. Las 3 regresiones puntuales restantes: selector de estado en `/labores` móvil, desborde de
   `/monitoreo` móvil, color del subtítulo de `/finanzas/gastos`.
4. Lo cosmético, al final o directamente en F4.

### F3 · Consolidar los tokens — puede solaparse con F2

Con `@theme` funcionando, dejar **una sola** definición de colores, tipografía y escala de espaciados,
en vez de repartirlos entre `globals.css`, reglas a mano y clases sueltas. **No es un rediseño**
(T-5): es quitar las tres fuentes de verdad y dejar una.

### F4 · Pulir por módulo

Sobre un pipeline sano y tokens únicos. Espaciados, jerarquía tipográfica, densidad de tablas.
Identidad visual sin cambios.

---

## 5. Riesgos

| Riesgo | Mitigación |
|---|---|
| El diff de F0 resulta inmanejable | Es exactamente para eso que F0 existe y es descartable. Si el número asusta, se replantea el enfoque antes de gastar nada. |
| **F1 "funciona" pero los tokens siguen muertos** | Punto 4 de §3. Criterio de aceptación explícito de F1: comprobar en el navegador que `--color-primary` resuelve y que `bg-primary` pinta verde, no que el build no falle. |
| La rama larga de T-2 diverge de `main` | Rebase frecuente; evitar rondas de funcionalidad grandes en paralelo mientras F2 esté abierta. |
| Alguien "arregla" `globals.css` durante F2 sin saber que el pipeline cambió | La caution zone reescrita en F1 es la defensa. Va **antes** que F2, no después. |
| El CSS compilado crece mucho | Medir en F1; v4 hace tree-shaking por defecto sobre las clases realmente usadas. |
| Se pierde el `forwardRef` de `ui/button.tsx` en alguna limpieza | Ya documentado en el propio archivo y en memoria. Criterio de aceptación de F1. |
| Dos agentes navegando el mismo Chrome se pisan | §6: **un solo agente maneja el navegador a la vez**. El paralelismo se reserva para el análisis, que solo lee archivos. |

---

## 6. Reparto por agentes

### ⚠️ Restricción del entorno, verificada 2026-08-06 — **los subagentes NO pueden manejar el navegador**

Se comprobó en dos intentos, no se asumió:

1. El roster de `~/.claude/agents` declara `take_screenshot`, `navigate_page`, `click`, `fill` para
   `frontend`, `usertest` y `qa`. **Esa declaración no se materializa en ejecución**: el subagente
   recibe únicamente Read/Bash/Edit/Write.
2. En esta sesión las herramientas de `chrome-devtools` están **diferidas** (hay que cargarlas con
   `ToolSearch`), así que se probó esa vía. El subagente respondió textualmente
   *"No such tool available: ToolSearch. ToolSearch exists but is not enabled in this context."*
   Sin `ToolSearch` no hay forma de cargarlas.
3. El Chrome autenticado corre con `--remote-debugging-pipe`, **sin puerto TCP**, así que tampoco es
   alcanzable por CDP desde Bash.

**Consecuencia para el reparto:** todo lo que requiera navegador vive en el **loop principal**. Los
subagentes siguen siendo útiles — y siguen siendo la mayor parte del trabajo con criterio — porque
las capturas quedan **en disco** y `Read` renderiza imágenes: un subagente puede *analizar* las
pantallas aunque no pueda *producirlas*.

| Tipo de trabajo | Quién |
|---|---|
| Navegar, capturar, verificar en pantalla | **Solo el loop principal** |
| Editar código, instalar, correr tests y builds | `frontend`, `qa` |
| Leer los PNG del disco y juzgarlos | `usertest`, `qa` |
| Reescribir contratos y documentación | `cto` |

### Reglas que aplican a todas las fases

1. **El navegador tiene un solo dueño a la vez, y es el loop principal.** `chrome-devtools` maneja
   una sola instancia de Chrome. Ninguna tarea de navegación se delega.
2. **`usertest` no puede escribir archivos** (solo Read/Grep/Glob/Bash + navegador). Su salida vuelve
   como informe de texto y el orquestador la consolida. No se le pide que redacte documentos.
3. **Agentes en paralelo sobre la misma rama = directorios disjuntos.** Si dos tienen que tocar el
   mismo archivo, van en serie o cada uno en su worktree.
4. **La verificación se repite en el hilo principal.** No se da por buena la afirmación de un agente
   de que los tests pasan: se vuelven a correr (regla del `CLAUDE.md` de usuario).
5. **Las capturas se persisten a disco** (`take_screenshot` con `filePath`), nunca solo en el contexto
   del agente — si no, el "antes" muere cuando el agente termina.

### F0 — protocolo de ejecución

| Paso | Quién | Qué hace | Qué entrega |
|---|---|---|---|
| 0 | Loop principal | Levanta el dev server (`:3100`); **Santiago inicia sesión a mano** (T-7). Verifica sesión y rol Gerencia. | Server con sesión abierta |
| 1 | **Loop principal** | **Captura ANTES** según `rutas.md`. No se delega: requiere navegador. | PNGs en `docs/tailwind-spike/antes/` + inventario |
| 2 | `frontend` | **Enciende el pipeline** en `spike/tailwind-medicion`: instala `tailwindcss@4` + `@tailwindcss/vite`, cablea el plugin, reencadena los `@import`. **No toca ningún componente.** Es trabajo de archivos y npm: sí se delega. | Pipeline vivo + diff de configuración |
| 2b | **Loop principal** | Verifica en pantalla que los tokens resolvieron (`bg-primary` pinta verde, `--color-primary` existe). Sin esto, el paso 2 no se da por bueno — es la trampa de §3.4. | Confirmación visual |
| 3 | **Loop principal** | **Captura DESPUÉS.** Mismo recorrido, mismos viewports, mismos nombres. | PNGs en `docs/tailwind-spike/despues/` |
| 4a | `usertest` ×3 (paralelo) | Cada uno un grupo de módulos (Aguacate / Hato+Ganado / Finanzas+Config). **Lee los pares de PNG del disco con `Read`** y los juzga como usuaria: ¿Martha puede seguir usando esta pantalla? Nada de leer código. | Informe por pantalla con veredicto de usabilidad |
| 4b | `qa` (paralelo con 4a) | Clasificación por severidad, checklist de regresión que F2 tendrá que pasar, y **destino de las 4 guardas estáticas** (retirar vs. reconvertir). Lee PNGs y código. | Matriz de severidad + checklist + recomendación |
| 5 | Loop principal | Consolida en `docs/tailwind-spike/informe-f0.md` y da **el número de F2**. | El informe y la decisión de T-6 |

Los pasos 1→2→2b→3 son estrictamente secuenciales. El 4a y 4b sí corren en paralelo: a esa altura
nadie toca el navegador y todo el insumo está en disco.

### F1 — encender en la rama larga

- **`cto`** reescribe la caution zone del `CLAUDE.md` raíz y las menciones en los 10 documentos.
  Es autoría de contrato, no implementación — le corresponde por rol, y es lo que impide que la
  siguiente sesión siga evitando clases válidas.
- **`frontend`** aplica el cambio de pipeline ya validado en F0, retira las 4 guardas y limpia las
  ~116 reglas duplicadas de `globals.css`.
- **`qa`** verifica contra criterios, no contra "se ve bien": tokens resueltos en el navegador,
  `forwardRef` intacto, tamaño del CSS, suite completa en verde, build limpio.

### F2 / F4 — por módulo

Ciclo cerrado por módulo, un módulo a la vez para no pelear por el navegador:

1. **`frontend`** corrige el módulo.
2. **`usertest`** lo recorre como usuaria y dice si quedó usable.
3. **`qa`** pasa el checklist de regresión de F0 y confirma que no se rompió nada vecino.

`usertest` y `qa` son deliberadamente **pistas separadas**: `qa` verifica contra el checklist,
`usertest` intenta usar la pantalla sin saber qué se arregló. Si los dos dicen lo mismo, el módulo
está listo.

### F3 — tokens

Trabajo de una sola mano sobre `globals.css`; no se paraleliza. **`qa`** verifica después que ningún
módulo ya cerrado se movió.
