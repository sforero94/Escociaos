# Auditoría de recorte de texto — medida, no inferida

Ejecutada 2026-08-06 sobre `feat/tailwind-pipeline` con el pipeline encendido (F1) y el arreglo del
sidebar aplicado (F2.1). Viewport 1280×800.

**Por qué existe este documento.** Dos barridos estáticos buenos —y tres atribuciones equivocadas del
mismo defecto, una de ellas del orquestador— demostraron que el análisis de código **no puede
decidir** si un texto se recorta: eso depende del ancho real en pantalla. Esta auditoría no adivina,
**mide**. Y sustituye la cacería caso por caso por un barrido repetible.

---

## El método (reproducible — esto es lo importante, más que los números de hoy)

Se recorre cada ruta y, sobre el DOM ya renderizado, se marca todo elemento **hoja** (sin hijos) que
cumpla:

```js
el.scrollWidth > el.clientWidth + 1          // el contenido no cabe
&& (textOverflow === 'ellipsis' || overflow === 'hidden')   // y está siendo ocultado
```

Detalles que hacen la diferencia entre medir y engañarse:

- **Esperar a que la vista se estabilice.** El router es `React.lazy` + `Suspense` y los datos vienen
  de Supabase. Se espera a que no haya `.animate-spin` y a que el largo del texto deje de cambiar.
- **Exigir contenido real** (`innerText.length > 400`) antes de dar por buena una ruta. ⚠️ **Sin esta
  guarda la auditoría miente**: en la primera corrida el dev server se había caído y las 21 rutas
  devolvieron **0 recortes**. Un resultado limpio y completamente falso. Si una ruta reporta 0,
  confirma que cargó.
- **Excluir `sr-only`**: son textos para lectores de pantalla, deliberadamente ocultos.
- **Excluir `nav`/`aside`**: el sidebar tiene su propio tratamiento (F2.1).
- **Validar el detector contra un caso conocido** antes de confiar en un cero.

---

## Resultado: 219 textos recortados, concentrados en 4 de 29 rutas

| Ruta | Recortados | Peor caso | Clase responsable |
|---|---|---|---|
| `/finanzas/gastos` | **169** | faltan **418 px** — "GRUPO MONTEVERDE. CONSULTORIA, VR. 30…" | `gasto-nombre` + utilidades |
| `/labores` | **27** | faltan **136 px** — "2. Salto de Tequendama" | `tareas-lote-pill` |
| `/inventario/movimientos` | **20** | faltan **1.173 px** — "Ajuste a cero: error en la carga inici…" | `truncate max-w-[200px]` |
| `/` | 3 | faltan 97 px — "Mayor: Mano de Obra y Asistencia Técni…" | `truncate` |
| **Las otras 25 rutas** | **0** | — | — |

Más, fuera de rutas: **1 en el diálogo de detalle de tarea** ("DAVID JOVANY GARCIA MANCERA", faltan
16 px). Los diálogos no se recorren automáticamente — hay que abrirlos.

---

## La distinción que ordena el trabajo: regresión de F1 vs. deuda vieja

No todo lo que la auditoría encuentra lo causó encender Tailwind. Separarlo cambia quién lo arregla y
con qué urgencia.

### Regresión real de F1 — `/inventario/movimientos`, 20 casos

`truncate max-w-[200px]`. **`max-w-[200px]` da 0 apariciones en el `index.css` congelado**: era una
clase de *valor arbitrario*, y el `CLAUDE.md` viejo ya advertía que los valores arbitrarios no existían
en el build congelado. Estaba muerta; el texto se mostraba completo. Al encender el compilador, la
columna quedó fijada a 200 px y **se perdieron 1.173 px de observación** — casi seis veces el ancho
visible. Es, con diferencia, el recorte más severo de toda la app.

### Deuda preexistente que la auditoría destapó — `/labores`, 27 casos

`.tareas-lote-pill` está escrita a mano en `globals.css` con `overflow: hidden; text-overflow:
ellipsis; white-space: nowrap`. **Verificado byte a byte: es idéntica antes y después de F1.** Los
nombres de lote se vienen recortando desde siempre; nadie lo había reportado. "2. Salto de
Tequendama" pierde 136 px.

### Pendiente de atribuir — `/finanzas/gastos`, 169 casos

`.gasto-nombre` es idéntica antes y después de F1, **pero vive dentro de `@media (max-width: 639px)`**
y esta auditoría corrió a 1280 px, así que **no es la causa del recorte de escritorio**. La causa está
en alguna otra clase de la lista de ese elemento y **queda sin determinar**. No se afirma que sea
regresión ni que sea deuda vieja hasta medirlo.

Es la ruta con más daño de la app y la que Consuelo y Efraín usan a diario, así que es el siguiente
caso a resolver.

---

## Lo que esta auditoría NO cubre — declararlo es parte del entregable

- **Solo escritorio (1280 px).** En móvil las reglas de `@media` cambian el juego por completo — es
  justo donde vive `.gasto-nombre`.
- **Solo rutas, no diálogos.** Buena parte de la UI de esta app vive en `Dialog`, y ahí ya se
  encontró un caso. Abrirlos exige interacción por pantalla, uno por uno.
- **Solo el primer estado de cada vista.** Filtros aplicados, pestañas secundarias, tablas paginadas y
  estados de error no se visitan.
- **Solo el recorte, no el reflujo.** Un texto que ahora envuelve a dos líneas y descuadra una fila no
  dispara `scrollWidth > clientWidth` y esta auditoría no lo ve.
- **Depende de los datos reales de hoy.** Un nombre más largo mañana recorta donde hoy no. Los
  números son un piso, no un techo.
