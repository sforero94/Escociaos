# Sistema visual — escala tipográfica y densidad

Decidido por Santiago el 2026-08-07 (decisiones D-1 y D-2 de
`docs/tailwind-spike/f4-decisiones.md`). **Este documento es la regla**: si una pantalla nueva no
sabe qué tamaño o qué densidad usar, la respuesta está aquí, no en lo que hizo la pantalla de al
lado.

Existe porque la app creció módulo por módulo sin una escala escrita, y el resultado medido fue: la
misma "fila de lista" medía **45 px en Gastos, 53 en Hato, 65 en Inventario y 87 en Labores**, y el
cuerpo de texto era **14 px en tres módulos y 16 en Inventario**. Ninguna de esas diferencias
respondía a una decisión.

---

## 1. Escala tipográfica

**Cinco escalones. No hay más.** Si necesitas un sexto, es que el diseño está pidiendo otra cosa.

| Rol | Escritorio | Móvil (<640 px) | Para qué |
|---|---|---|---|
| **Metadato** | `text-xs` 12 px | `text-sm` **14 px** | Fecha, categoría, unidad, "hace 3 días". Información que acompaña, nunca la que se busca |
| **Cuerpo** | `text-sm` 14 px | `text-base` **16 px** | El dato principal de una fila o tarjeta: el nombre del gasto, el número de la vaca, el nombre del lote |
| **Énfasis** | `text-base` 16 px | `text-base` 16 px | Campos de formulario, valores que hay que leer sin buscarlos, botones |
| **Subtítulo** | `text-xl` 20 px | `text-xl` 20 px | Encabezado de sección dentro de una pantalla |
| **Título** | `text-2xl` 24 px | `text-2xl` 24 px | Título de la pantalla. Uno por vista |

### En móvil se arranca un escalón arriba — y es una decisión de campo, no estética

Martha y Consuelo capturan con el celular **en el lote, a pleno sol**. A 12 px ahí no se lee.

Por eso en móvil **el escalón de 12 px no se usa**: lo que en escritorio es metadato sube a 14, y lo
que es cuerpo sube a 16.

**Los tres escalones de arriba NO crecen.** Un título de 24 px ya ocupa mucho en una pantalla de
375 px; agrandarlo solo quita espacio al contenido. La decisión fue *"arrancar un escalón arriba y
ajustar"*, y ajustar significa exactamente esto: subir donde la legibilidad lo exige, no en toda la
escala.

---

## 2. Densidad de listas

**Dos densidades, y se elige por lo que lleva la fila — no por el módulo.**

| Densidad | Alto de fila (escritorio) | Cuándo |
|---|---|---|
| **Lista larga** | **~45 px** | La fila lleva **un dato principal y su valor**. Se recorren cientos de filas buscando una. Ej.: Gastos (596 filas), Inventario, Hato |
| **Tarjeta** | **~80 px** | La fila lleva **varios datos de distinta naturaleza** y acciones. Se leen una por una, no se recorren. Ej.: Labores (lote, estado, responsable, acciones) |

### Por qué NO se unificaron

Es la pregunta obvia y la respuesta importa: **la diferencia entre Labores y Gastos no era un error**.
Una fila de labor lleva lote, estado, responsable y acciones; una de gasto lleva nombre y monto.
Forzarlas a la misma altura empeora una de las dos: o Labores queda apretada e ilegible, o Gastos
desperdicia dos tercios de la pantalla en una lista de 596 elementos.

**Lo que faltaba no era uniformidad: era que la elección fuera deliberada y estuviera escrita.**

### Los objetivos de alto son de ESCRITORIO

En móvil **las filas son más altas, y debe ser así**, por dos razones que se suman:

1. El cuerpo sube de 14 a 16 px (sección 1), y el texto más grande necesita más caja.
2. Una fila que se toca con el dedo **no baja de 44 px**, nunca.

Si una densidad de escritorio y un mínimo táctil de móvil entran en conflicto, **gana el mínimo
táctil**.

---

## 3. Cómo aplicar esto a una pantalla nueva

1. **¿Qué es cada texto?** Metadato, cuerpo, énfasis, subtítulo o título. Ese es su tamaño; no se
   elige por cómo se ve.
2. **¿La fila lleva un dato o varios?** Eso decide la densidad.
3. **¿Se toca con el dedo?** Entonces mínimo 44 px de alto en móvil, por encima de cualquier otra
   consideración.
4. **Usa la utilidad de Tailwind.** Todas funcionan — el compilador corre desde F1. **No escribas CSS
   a mano** para conseguir un tamaño: hay un test que detecta cuando una regla a mano tapa una
   utilidad (`globalsCssTailwindCollisionGuard.test.ts`), porque así fue como se anularon los anillos
   de foco de toda la app.

---

## 3-bis. Móvil: dos patrones obligatorios

Decidido por Santiago el 2026-08-07, después de recorrer la app en un teléfono. Los dos salen de la
misma observación: **en móvil, desplazarse en horizontal es una falla, no una solución.**

### Patrón A · Una tabla no se muestra como tabla en móvil

> **Debajo de 640 px, una tabla de datos se presenta como lista de tarjetas, no como tabla con scroll
> horizontal.**

Una tabla obliga a desplazarse en dos ejes a la vez, esconde el encabezado al desplazar, y en una
mano no se puede comparar una fila con otra. **La app ya resuelve esto bien en dos sitios** — no hay
que inventar nada, hay que generalizarlo:

- `src/components/labores/TareaMobileCard.tsx` — la tabla de tareas se vuelve tarjeta en móvil.
- `.gasto-meta-movil` en Gastos/Ingresos — la fila apila su metadato bajo el nombre.

La forma de la tarjeta: **el dato que identifica arriba** (nombre, número, chapeta), **el valor que se
busca destacado**, y el resto como línea de metadatos secundaria. Las acciones, al pie.

**Excepción declarada:** una matriz de verdad —donde el valor solo significa algo en el cruce de fila
y columna, como el mapa de calor de plagas por lote— no se puede aplanar en tarjetas. Ahí el scroll
horizontal es legítimo, pero **la columna que identifica la fila va congelada** (`position: sticky`) y
ocupa lo mínimo, no 250 px.

### Patrón B · Los filtros y las pestañas se colapsan en un desplegable

> **Si una fila de chips, pestañas o filtros no cabe en una sola línea a 375 px, en móvil se convierte
> en un `<Select>`.**

Envolver a dos filas descuadra el layout y desperdicia alto; desplazar en horizontal esconde opciones
que el usuario no sabe que existen. Un desplegable muestra **cuál está activo** y da acceso a todos
sin ocupar espacio.

Regla práctica: **a lo sumo 2 controles visibles en una fila**; el resto va al desplegable. Aplica a
selectores de negocio, ventanas de tiempo, pestañas de configuración y filtros de vista.

En escritorio se quedan como están: ahí sí caben y se ven de un vistazo.

---

## 3-ter. La tabla es UN recurso, no 46

Pregunta del dueño el 2026-08-07, mirando Presupuesto y Monitoreo: *"tienen un formato diferente
—encabezados de otros colores, líneas rectas y no curvas— ¿qué podemos hacer para que el recurso
tabla sea el mismo siempre?"*

**Lo medido:**

| | |
|---|---|
| `src/components/ui/table.tsx` (el primitivo compartido) | **existe**, 116 líneas |
| Archivos que lo importan | **0** |
| Archivos con `<table>` escrito a mano | **46** |
| Sistemas de estilo conviviendo | `.tabla-financiera`, `.tabla-scroll`, y 46 tablas independientes |

**El primitivo ya está construido y nadie lo usa.** Es el mismo patrón que `.touch-target` (regla
correcta, cero consumidores) y que el apéndice `!important` de `index.css`: alguien resolvió el
problema y la solución quedó invisible. Por eso no hay "un formato de tabla" — hay 46, y cada una se
ve como el día en que se escribió.

### La regla

> **`src/components/ui/table.tsx` es el recurso tabla. Una tabla nueva lo usa. Una tabla que se toque
> a fondo migra a él.**

Trae `Table` / `TableHeader` / `TableBody` / `TableRow` / `TableHead` / `TableCell` / `TableFooter`,
y ya envuelve en `overflow-x-auto`. Lo que hay que añadirle —una vez, ahí— es el comportamiento móvil
del **Patrón A**: la variante de matriz con columna identificadora congelada.

### Cómo se migra sin romper nada

**No se migran las 46 de golpe.** El orden:

1. **El primitivo primero**: que soporte los dos casos reales (lista simple y matriz con columna
   fija) antes de mover ninguna pantalla.
2. **Las que el dueño señaló**: Presupuesto y Monitoreo, que son las que se ven distintas.
3. **Trinquete**: una guarda que impida `<table>` crudo **nuevo**, sin exigir migrar los existentes.
   Así el número deja de crecer aunque la migración tarde.
4. El resto, cuando se toquen por otra razón.

**Lo que NO se toca al migrar**: `.tabla-financiera`/`.col-etiqueta` resuelven la columna congelada de
P&G y Flujo de Caja y **funcionan**; `src/components/finanzas/CLAUDE.md` las documenta como decisión
deliberada. Migrarlas es trabajo aparte, no un efecto colateral.

---

## 5. La trampa: el tamaño va en el elemento de texto, no en su contenedor

**Poner `text-sm` en un `<td>` o un `<div>` NO dimensiona el `<p>` que lleva adentro.**

`globals.css` tiene un bloque `@layer base` que fija un tamaño a los elementos semánticos
(`p`, `h1`–`h4`, `label`, `button`, `input`). Trae un guardián que *pretende* excluir a los que ya
viven bajo una clase de texto, pero **ese selector está mal formado y no excluye nada** (comprobado
2026-08-07):

| Caso | Resultado |
|---|---|
| `<span>` dentro de `.text-sm` | **14 px** — hereda, correcto |
| `<p>` dentro de `.text-sm` | **16 px** — la regla base gana |

No es un bug del navegador: **una regla directa siempre gana sobre un valor heredado**, sin importar
la especificidad. El `<p>` tiene su propia regla; el `text-sm` del padre solo se hereda.

**Es el origen medido de la inconsistencia que motivó D-2**: el cuerpo de `/inventario` renderizaba a
16 px con 1.024 elementos afectados. Nadie lo eligió — se lo impuso esta regla.

### La regla

> **Si un texto necesita un tamaño, la clase va en el elemento que contiene el texto.** Ponerla en un
> ancestro funciona con `<span>` y `<div>`, y falla en silencio con `<p>`, `<h1>`–`<h4>`, `<label>`,
> `<button>` e `<input>`.

**Deuda conocida**: hay ~169 `<p>` en `src/components` sin clase de tamaño propia. No todos están mal
—muchos deben ser 16 px— pero cualquiera que esté dentro de un contenedor con `text-sm`/`text-xs`
está renderizando más grande de lo que su autor creía. Barrerlos es trabajo aparte; esta regla evita
que el número siga creciendo.

---

## 4. Lo que este documento NO decide

- **Color.** La paleta no cambia (T-5). Los tokens viven en `src/styles/globals.css`.
- **Espaciado entre secciones y tarjetas**, que hoy sigue suelto entre módulos. Es trabajo pendiente
  de F4.
- **Radios de borde**, que hoy mezclan `rounded-lg`, `rounded-xl` y `rounded-md` sin criterio.
