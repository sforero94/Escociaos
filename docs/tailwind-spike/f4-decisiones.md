# F4 — decisiones para arrancar

> ## ✅ RESUELTAS por Santiago el 2026-08-07
>
> | # | Decisión | Qué implica |
> |---|---|---|
> | **D-1** | **Opción C** — dos densidades declaradas | "Lista larga" (~45 px) para Gastos, Inventario y Hato; "tarjeta" (~80 px) para Labores. Se **escribe la regla** de cuál usar y por qué. Inventario baja de 65 y Hato de 53. |
> | **D-2** | **Opción C** — escala tipográfica explícita, **y en móvil arranca un escalón arriba** | Escala 12/14/16/20/24 con regla de uso. En móvil el escalón más bajo **no se usa**: lo que en escritorio es 12 pasa a 14, y así hacia arriba. Consecuencia: Inventario baja su cuerpo de 16 a 14 (opción A, como derivada). |
> | **D-3** | **Opción C** — jerarquía en el menú | Hijos de 44 → 38 px; primer nivel se queda en 48. La jerarquía deja de comunicarse solo por sangría. |
> | **D-4** | **Opción A** — los 650 textos café se quedan | El código siempre pidió `brand-brown`. Si más adelante no convence, se ajusta el token en un solo sitio. |
> | **D-5** | **Opción A** — solo concepto, también en escritorio | *"pero luego evaluamos si debe regresar"* — se aplica ahora y queda **abierto a revisión** una vez se vea en uso. Negocio y categoría siguen siendo columnas filtrables. |
>
> **La justificación de D-2 en móvil es de campo**, no estética: Martha y Consuelo capturan con el
> celular al sol. 12 px ahí no se lee.


Preparado 2026-08-06 sobre `feat/tailwind-pipeline`, con F1 aplicada y F2 cerrada.
**Todo lo de aquí está medido en la app corriendo**, no estimado.

F4 es "pulir por módulo": espaciados, jerarquía tipográfica, densidad de tablas — **sin cambiar la
identidad visual** (T-5). Es el único tramo del plan donde el criterio de éxito es el gusto del dueño
y no una medición, así que se ejecuta con él disponible, no de madrugada.

Cada decisión trae: qué hay hoy (medido), las opciones, y una recomendación. **La idea es que se
resuelvan en una sola pasada de 10 minutos.**

---

## D-1 · La densidad de las listas es inconsistente entre módulos

**Lo medido — alto mediano de una fila de lista, a 1280 px:**

| Módulo | Alto de fila | Filas en pantalla |
|---|---|---|
| `/finanzas/gastos` | **45 px** | 596 |
| `/hato-lechero/hato` | **53 px** | 36 |
| `/inventario` | **65 px** | 342 |
| `/labores` | **87 px** | 11 |

La misma idea —una fila de lista— mide casi **el doble** en Labores que en Gastos. No responde a una
decisión: responde a que cada módulo se construyó por separado y nadie comparó.

**Opciones**
- **(a) Unificar en ~48 px** — la densidad de Gastos y Hato, que son las listas más largas y de uso
  diario. Labores e Inventario se compactan bastante.
- **(b) Unificar en ~56 px** — punto medio; nadie cambia mucho, nadie queda óptimo.
- **(c) Dos densidades declaradas**: "lista larga" (~45 px, para Gastos/Inventario/Hato) y "tarjeta"
  (~80 px, para Labores, cuyas filas llevan más información por fila). Se documenta cuál usar y por
  qué.

**Recomendación: (c).** La diferencia entre Labores y Gastos **no es un error**: una fila de labor
lleva lote, estado, responsable y acciones; una de gasto lleva nombre y monto. Forzarlas a la misma
altura empeora una de las dos. Lo que hoy falta no es uniformidad, es que la elección sea deliberada
y esté escrita.

---

## D-2 · El tamaño de letra base no es el mismo en todos los módulos

**Lo medido — cuántos elementos de texto hay de cada tamaño:**

| Módulo | Tamaño dominante | Reparto |
|---|---|---|
| `/inventario` | **16 px** | 1.024 de 16 px, 687 de 12, 11 de 14 |
| `/finanzas/gastos` | **14 px** | 1.198 de 14, 1.192 de 12 |
| `/hato-lechero/hato` | **14 px** | 251 de 14, 41 de 12 |
| `/labores` | **14 px** | 78 de 14, 77 de 12 |

**Inventario está una talla por encima del resto de la app.** Y en toda la app conviven solo tres
tamaños reales (12/14/16), con 24 px suelto para títulos: la "escala tipográfica" en la práctica no
existe.

**Opciones**
- **(a) Bajar Inventario a 14 px** para alinearlo con los otros tres módulos. Cambio localizado.
- **(b) Subir todo a 16 px.** Más legible en campo y con sol, pero **entra en conflicto directo con
  D-1**: menos filas por pantalla en listas de 596 elementos.
- **(c) Definir una escala explícita** (por ejemplo 12 / 14 / 16 / 20 / 24) con regla de uso — dato
  secundario, cuerpo, énfasis, subtítulo, título — y ajustar cada módulo a ella.

**Recomendación: (c), y (a) como consecuencia.** Es el trabajo que hace F4 duradero: hoy la elección
de tamaño es por hábito de quien escribió cada pantalla. Con la escala escrita, el siguiente módulo
ya nace bien.

⚠️ **Ojo con el móvil**: en campo, con sol y a pulso, 12 px es poco. Vale la pena decidir si la
escala móvil arranca un escalón arriba.

---

## D-3 · Los ítems del menú lateral miden 44–48 px

**Lo medido**: 25 ítems con los tres grupos abiertos, de 44 px (hijos) y 48 px (primer nivel);
el contenido llega a 1.236 px en un contenedor de 622.

F2 ya resolvió el problema **funcional** (el ítem activo se lleva a la vista, y el menú se desplaza).
Queda la pregunta estética.

**Opciones**
- **(a) Dejarlo.** El bug está resuelto; achicar es puramente cosmético.
- **(b) Bajar a ~40 px.** Caben ~3 ítems más sin desplazar. Sigue por encima del mínimo táctil.
- **(c) Bajar solo los hijos** (44 → 38) y dejar el primer nivel en 48, reforzando la jerarquía.

**Recomendación: (c).** Aprovecha el espacio donde más ítems hay y **de paso comunica la jerarquía
visualmente**, que hoy solo se distingue por la sangría.

---

## D-4 · Los 650 textos de marca ahora se ven café — confirmar

`text-brand-brown/<opacidad>` aparece **650 veces** y estaba muerta: esos textos heredaban el verde
oscuro de `--foreground`. Ahora aplican `#4D240F` de verdad.

**No es una regresión** — es la paleta aplicándose donde el código siempre la pidió. Pero es **el
cambio visual más extendido de todo el proyecto** y merece una mirada tuya.

**Opciones**
- **(a) Dejarlo.** El código pidió café; la paleta lo tiene declarado desde siempre.
- **(b) Ajustar el tono de `--brand-brown`.** Se cambia **en un solo sitio** y afecta las 650 a la
  vez. Esa es exactamente la capacidad que F1 habilitó.
- **(c) Revertir a heredar el color del padre.** Habría que quitar la clase en 650 sitios: caro y
  contradice la intención original del código.

**Recomendación: (a), con (b) a un token de distancia si al verlo no convence.**

---

## D-5 · En Gastos, el nombre y el breadcrumb no caben juntos — decisión ya tomada

Ya resuelta por el dueño el 2026-08-06: *"Concepto es suficiente en móvil, sin categoría"*, aplicada
en la línea meta móvil.

**Queda abierto el escritorio**: la fila mide 646 px, el nombre se lleva 347 y el breadcrumb 290, y
las columnas fijas (fecha 70, monto 90) no tienen holgura. Hoy el breadcrumb se recorta en 416 filas,
con una mediana de 62 px faltantes.

**Opciones**
- **(a) Aplicar también en escritorio** lo mismo que en móvil: solo concepto. Cierra el recorte del
  todo.
- **(b) Dejarlo.** El nombre —el dato principal— ya se lee; el breadcrumb pierde la cola.
- **(c) Breadcrumb en segunda línea** bajo el nombre. Cabe todo, pero la fila crece y son 596 filas
  (choca con D-1).

**Recomendación: (a).** Si el concepto basta en móvil, es difícil argumentar que en escritorio haga
falta la ruta completa — y negocio y categoría ya son columnas filtrables.

---

## Lo que NO es decisión: se ejecuta sin preguntar

- Unificar el espaciado entre tarjetas y secciones, que hoy va suelto entre módulos.
- Quitar el bloque `.dark` de `globals.css`: **35 variables de código muerto** — no hay interruptor de
  modo oscuro en ninguna parte de la app y `dark:` da **0 usos**. (Va en F3.)
- Alinear los radios de borde, que hoy mezclan `rounded-lg`, `rounded-xl` y `rounded-md` sin criterio.
