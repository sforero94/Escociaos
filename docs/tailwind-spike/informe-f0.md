# Informe F0 — spike medido del pipeline de Tailwind

Ejecutado 2026-08-06. Rama descartable `spike/tailwind-medicion` (no se mergea).
Decisión que lo ordenó: T-1 (medir antes de comprometerse) y T-4 (ejecutar ya).

---

## Veredicto en una frase

**Encender el compilador es mucho menos destructivo de lo que el plan anticipaba: la app sigue
usable en todas las pantallas medidas, no hay una sola pantalla `ROTO`, y el daño se concentra en un
puñado de regresiones concretas y arreglables.**

La razón de fondo la descubrió el propio spike, al retractar H-1: `index.css` **es** la compilación de
una versión anterior de `globals.css`. Encender el pipeline no estrena la hoja de estilos —
**la pone al día**. Por eso la mayor parte de la app no se mueve.

---

## 1. El pipeline funciona

`tailwindcss@4.3.3` + `@tailwindcss/vite`. `index.css` pasa de 5.577 líneas compiladas a 2 líneas
fuente; `globals.css` entra por `@import`; `main.tsx` deja de importarlo por separado.

| | raw | gzip |
|---|---|---|
| Build viejo real (sin plugin) | 121 KB | 19,3 KB |
| **Build nuevo, compilando** | **174 KB** | **25,6 KB** |

Tests: **1.975 verdes / 18 rojos**, y los 18 son exactamente las 4 guardas estáticas que debían
fallar. Ninguna otra suite se rompió. `typecheck` limpio, `lint` sin errores nuevos.

### Bug real encontrado de paso

`globals.css:686` contenía la secuencia `*/` dentro de un comentario en prosa
(`bg-*/border-*/text-*,`), que cerraba el comentario a mitad de frase y dejaba el resto
parseándose como CSS. **El navegador se venía recuperando en silencio; Lightning CSS no, y bloqueaba
el 100% del build.** Llevaba ahí sin que nadie lo viera. Arreglado con el cambio mínimo (reescribir
la prosa), y se verificó que es la única ocurrencia del patrón en el archivo.

---

## 2. Qué cambia de verdad — medido en pantalla, no inferido

Comparación con el servidor sano en **ambos** estados:

| Sonda | Congelado | Compilado | ¿Cambió? |
|---|---|---|---|
| `bg-primary` | `rgb(115,153,28)` | `rgb(115,153,28)` | **No** — ya vivía por el hack `!important` |
| fondo del `body` | `#F8FAF5` | `#F8FAF5` | **No** |
| `h1` | 24px / 500 | 24px / 500 | **No** |
| `text-brand-brown/70` | `rgb(23,46,8)` (hereda) | `oklab(… / 0.7)` café real | **Sí** |
| `tabular-nums` | `normal` | `tabular-nums` | **Sí** |
| `--color-primary` | vacía | `#73991C` | **Sí** |

Lo que se gana es concreto: **las 650 apariciones de texto de marca con opacidad** (hoy heredan el
verde oscuro del padre en vez de ser café) y la **alineación numérica en tablas financieras**.

---

## 3. Desbordamiento horizontal en móvil — la métrica objetiva

45 rutas, viewport 375×812 emulado, antes y después:

- **Ninguna ruta nueva empezó a desbordar.**
- 7 de las 8 que ya desbordaban quedaron **idénticas** (`/finanzas/presupuesto` 861px,
  `/hato-lechero/hato` 537px, los dashboards de Hato y Agrícola 469px, etc.).
- **Una sola empeoró**: `/monitoreo`, de 390px a 446px.

Es el resultado más tranquilizador del spike, y no depende del criterio de nadie.

---

## 4. Juicio de usabilidad (evaluación a ciegas, sin leer código)

| Par | Veredicto | ¿Impide trabajar? |
|---|---|---|
| `dashboard--desktop` | IGUAL | No |
| `monitoreo--desktop` | IGUAL | No |
| `dashboard--mobile` | PEOR | No — la fila de pronóstico queda descuadrada |
| `labores--mobile` | PEOR | No, pero el área táctil del selector de estado cae a ~40% |
| `monitoreo--mobile` | PEOR | No — la píldora "Ronda abierta" queda casi ilegible |
| `dlg-tarea-detalle--desktop` | PEOR | No — ver abajo |

**Ninguna pantalla resultó `ROTO`.**

### Las tres regresiones que sí hay que arreglar

1. **`truncate` cobró vida y corta el nombre del responsable.** En el diálogo de detalle de tarea,
   "DAVID JOVANY GARCIA MANCERA" pasa a "DAVID JOVANY GARCIA MANC…". La clase estaba muerta y ahora
   funciona: es exactamente el patrón que F2 tiene que buscar — no "se rompió", sino *"empezó a hacer
   lo que decía, y lo que decía estaba mal"*.
2. **El selector de estado en `/labores` móvil** pasó de píldora de ancho completo (~680px) a ~264px.
   Es la acción que más toca Martha en campo, con dedos y al sol.
3. **`/monitoreo` móvil empeoró su desborde** (390→446px) y empuja contenido real fuera de pantalla.

### Daño preexistente que el spike destapó (no es culpa del cambio)

- La píldora "Ronda abierta" de `/monitoreo` móvil **ya salía cortada** antes.
- `/finanzas/presupuesto` mide **861px en pantallas de 375px**, antes y después.

### Patrón transversal

El texto secundario e inactivo se ve consistentemente **más gris** en varias pantallas. Nada ilegible,
pero es la misma dirección repitiéndose: si alguien revisa contraste, ahí está el patrón.

---

## 5. Errores de método cometidos y corregidos — para que F1/F2 no los repitan

Se documentan porque cada uno habría envenenado el resultado en silencio.

1. **H-1 del plan era falso.** Se afirmó que `@apply` sobre `*` y `body` estaba muerto. Esas reglas ya
   estaban compiladas en `index.css:449-465`. Retractado.
2. **Las cifras originales (~845 clases / ~4.400 apariciones) estaban infladas** por comparar
   pertenencia por substring. Las reales: **608 clases / 2.895 apariciones**. `space-y-*` pasó de
   "~380 muertas" a ~13: `space-y-1` … `space-y-8` **sí existían**.
3. **`resize_page 375` miente**: en macOS Chrome no baja de ~500px de ancho de ventana. Hay que usar
   emulación de dispositivo (`375x812x3,mobile,touch`).
4. **Las capturas ANTES de escritorio eran DPR 2 y las primeras DESPUÉS salieron DPR 1.** Un diff
   visual habría medido la resolución, no Tailwind. Los 11 pares finales son dimensionalmente
   idénticos.
5. **Sondas medidas contra un servidor roto.** La primera verificación del paso 2b se tomó cuando el
   dev server no había cargado la nueva config: reportó "`bg-primary` transparente → verde" como
   prueba de éxito, y era un artefacto. Rehecha contra el servidor sano en ambos estados.
6. **Un par contaminado por el operador.** La captura ANTES de `dlg-tarea-detalle` se tomó con el
   panel de chat de Esco abierto y la DESPUÉS con él cerrado. La evaluadora lo detectó y lo marcó como
   pregunta abierta en vez de atribuirlo al compilador; se retomó correctamente.

**Falsa alarma descartada:** `/finanzas/dashboard/ganado` parecía perder el 81% de su contenido; era
el barrido capturándola a medio cargar.

---

## 6. Lo que F1 tiene que hacer distinto por lo que se descubrió aquí

1. **`index.css` no es un artefacto intacto** — tiene 16 clases `!important` escritas a mano al final
   (`text-brand-brown`, `bg-primary`, `text-white`…), y `text-brand-brown` a secas se usa en 98
   archivos y **hoy funciona solo por ese hack**. El spike confirmó que el compilador las regenera,
   pero es el punto de verificación número uno. Evidencia preservada en
   `apendice-important-original.css`.
2. **La cascada es determinista, no ambigua.** `index.css` usa capas nativas; las ~116 reglas a mano
   de `globals.css` no están en ninguna capa y por lo tanto **ganan siempre**. Dos son bombas:
   `.shadow-none` y `.data-[variant=outline]:shadow-xs` anulan cualquier `focus-visible:ring-*`.
3. **La tipografía base ya está viva** (`@layer` es CSS nativo). El `h1` computa 24px/500 hoy. F1 debe
   **conservarla** (T-5), no estrenarla.
4. **Las 4 guardas se retiran, no se reconvierten.** Con el compilador activo su premisa desaparece y
   un reemplazo con la misma forma sería un test que siempre pasa.
5. **`tw-animate-css` no se instaló.** Las animaciones de entrada/salida de `Sheet`/`Drawer` son un
   punto abierto que F1 debe resolver explícitamente.
6. **`ui/sidebar.tsx` no lo importa nadie** — es código inalcanzable con el mayor conteo bruto de
   clases muertas del repo. No se toca en F2; se borra.

---

## 7. El número para T-6

**F2 es pequeño.** Sobre la evidencia:

- 0 pantallas rotas de 11 pares evaluados.
- 2 de 6 pares de escritorio: cambio nulo a efectos de trabajo.
- 1 sola regresión de desborde en 45 rutas.
- 3 regresiones concretas identificadas, todas con arreglo evidente.

Estimación: **2 a 3 sesiones**, no las "N sesiones" abiertas del plan original. El trabajo real de F2
no es reparar destrozos — es **buscar el patrón de la regresión #1**: clases que estaban muertas,
ahora funcionan, y lo que dicen está mal (`truncate` es el caso testigo). Ese barrido es
mayoritariamente estático y se puede delegar.

**Lo que queda sin medir y hay que declarar:** solo se capturaron 11 pares de las ~53 pantallas.
La muestra se eligió por riesgo (ranking de clases muertas + desborde medido), no al azar, así que
está sesgada **hacia** lo peor — lo cual sostiene el veredicto de "poco daño", pero no permite afirmar
que las 42 pantallas restantes estén intactas. Los diálogos, salvo uno, quedaron sin capturar.
