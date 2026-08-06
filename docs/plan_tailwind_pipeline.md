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

### El costo medido (2026-08-06)

Barrido de todos los `className` de `src/**/*.tsx` contra `index.css` + `globals.css`:

- **1.448** clases distintas usadas en el código
- **~845** no existen en el build → **muertas**
- **~4.400** apariciones de clases muertas

Las familias que más duelen:

| Familia | Apariciones | Qué se pierde hoy |
|---|---|---|
| `text-brand-brown/*` | ~640 | Los textos de marca no toman su color; heredan el del padre |
| `space-y-*` | ~380 | Espaciado vertical entre elementos — por eso muchas pantallas se ven apretadas |
| `border-primary/*`, `border-secondary/*` | ~260 | Bordes sin color |
| `focus:ring-primary`, `focus:border-primary` | ~155 | **Estados de foco: navegación por teclado prácticamente a ciegas** |
| `tabular-nums` | 71 | Números que no alinean en las tablas |
| resto | ~2.900 | Separadores, tamaños, tipografías, variantes responsive |

**Dos bugs reales de esta misma familia, encontrados el 2026-08-06** — ninguno detectado por 1.993
tests, lint ni typecheck; los dos aparecieron mirando la pantalla:

1. `ui/button.tsx` sin `forwardRef` → los tres desplegables de carga por foto no abrían.
2. `Toggle`/`ToggleGroup` sin ~15 de sus clases → se renderizaban como texto plano. Otro módulo
   (`PriorizacionScoutingView`) ya se había estrellado con lo mismo y se hizo un control a mano.

### Tres hallazgos de la verificación del 2026-08-06 (no estaban en la versión original)

**H-1 · `@apply` también está muerto, y alcanza a `*` y `body`.**
`globals.css:179-186` declara `@layer base { * { @apply border-border outline-ring/50 } body { @apply
bg-background text-foreground } }`. Hoy **ninguna de las dos corre**. Encender el compilador cambia el
color de borde por defecto de *todo elemento de la app* y el fondo del `body` en la primera pantalla.
No es una regresión de un módulo: es el cambio de mayor alcance de todo F1, y hay que verlo primero.

**H-2 · Son ~53 pantallas, no ~25.**
`App.tsx` declara **45 rutas estáticas** y **8 dinámicas** (`:id` de producto, aplicación, animal,
chequeo, verificación). En escritorio + móvil eso son ~200 capturas por corrida, no 50.

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
   ⚠️ **Esto no es solo un tema de cascada — es la trampa técnica de F1.** En Tailwind v4, `@theme`
   solo lo procesa el compilador si el archivo entra por la cadena de `@import "tailwindcss"`. Si F1
   se limita a instalar el plugin sin reencadenar (`index.css` haciendo `@import "tailwindcss"` y
   luego `@import "./styles/globals.css"`, y `main.tsx` importando solo `index.css`), **los tokens
   siguen muertos y va a parecer que el pipeline funciona**. Es el modo de fallo silencioso más
   probable de toda la fase.

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

Rama larga `feat/tailwind-pipeline` (T-2: nada sale a producción hasta el final).

- `tailwindcss@4` + `@tailwindcss/vite` como devDependencies; plugin en `vite.config.ts`.
- `src/index.css` pasa de 5.577 líneas compiladas a un archivo fuente que importa `tailwindcss` y
  después `globals.css`; `main.tsx` deja de importar `globals.css` por separado.
- Auditar los tokens de `@theme inline`, que cobran vida por primera vez — **conservando los valores
  actuales** (T-5). Si un token estaba mal escrito y ahora sí aplica, se corrige al valor que la app
  muestra hoy, no a uno nuevo.
- Retirar los 4 guards estáticos y limpiar las ~116 reglas duplicadas de `globals.css`.
- Reescribir la caution zone del `CLAUDE.md` y las menciones en los 10 documentos.
- Verificar que `npm run build` produce un CSS de tamaño razonable (hoy son 136 KB congelados).
- **Verificar que `ui/button.tsx` conserva su `forwardRef`** tras cualquier limpieza.

### F2 · Contener la regresión — N sesiones, alcance según T-6

Módulo por módulo, con verificación visual obligatoria en cada uno. El orden y la profundidad los
decide el informe de F0, no la intuición.

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

### Reglas que aplican a todas las fases

1. **El navegador tiene un solo dueño a la vez.** `chrome-devtools` maneja una instancia de Chrome;
   dos agentes navegando en paralelo se pisan las páginas. Las tareas de navegación van en serie; el
   paralelismo se reserva para el análisis, que solo lee archivos del disco.
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
| 0 | Orquestador | Levanta el dev server; **Santiago inicia sesión a mano** (T-7). Verifica que hay sesión activa. | Server en `:3000` con sesión abierta |
| 1 | `frontend` #1 | **Captura ANTES.** Recorre las 45 rutas + la muestra dinámica + los diálogos de alto tráfico, en 1280×800 y 375×812. **No edita ni un archivo.** | PNGs en `docs/tailwind-spike/antes/` + inventario de lo capturado y lo que falló |
| 2 | `frontend` #2 | **Enciende el pipeline** en `spike/tailwind-medicion`: instala, cablea el plugin, reencadena los `@import`. **No toca ningún componente.** Verifica que `bg-primary` pinta verde antes de declarar éxito. | Pipeline vivo + diff de configuración |
| 3 | `frontend` #3 | **Captura DESPUÉS.** Exactamente el mismo recorrido, mismos viewports, mismos nombres de archivo. | PNGs en `docs/tailwind-spike/despues/` |
| 4a | `usertest` ×3 (paralelo) | Cada uno un grupo de módulos (Aguacate / Hato+Ganado / Finanzas+Config). Compara los pares antes/después **como usuaria**: ¿Martha puede seguir usando esta pantalla? Nada de leer código. | Informe por pantalla con veredicto de usabilidad |
| 4b | `qa` (paralelo con 4a) | Clasificación por severidad, checklist de regresión que F2 tendrá que pasar, y **destino de las 4 guardas estáticas** (retirar vs. reconvertir). | Matriz de severidad + checklist + recomendación sobre las guardas |
| 5 | Orquestador | Consolida todo en `docs/tailwind-spike/informe-f0.md` y da **el número de F2**. | El informe y la decisión de T-6 |

Los pasos 1→2→3 son estrictamente secuenciales (regla 1). El 4a y 4b sí corren en paralelo: a esa
altura nadie toca el navegador.

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
