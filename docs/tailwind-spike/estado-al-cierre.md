# Estado al cierre — F1, F2 y F3 aplicadas

Rama `feat/tailwind-pipeline`, rebasada sobre `main` (`ccacb2a`). **Nada se ha mergeado a `main`**
(T-2: la app sale a producción cuando el trabajo esté completo y verificado, no por partes).

Tests **1.993 verdes**, typecheck limpio, lint 0 errores (947 warnings preexistentes), guarda de
colisiones 7/7. CSS compilado: **174.294 B raw / 25.394 B gzip**.

---

## Lo que quedó hecho

### F1 — el pipeline corre
`tailwindcss@4.3.3` + `@tailwindcss/vite` + `tw-animate-css`. `index.css` pasó de 5.577 líneas
compiladas a tres `@import`. Se retiraron las 4 guardas estáticas, se borraron 22 reglas a mano y
`ui/sidebar.tsx`, y se reescribió la caution zone en 13 documentos.

### F2 — las regresiones, medidas y cerradas
| Qué | Estado |
|---|---|
| Sidebar: el ítem activo quedaba cortado | Arreglado — el nav se desplaza solo, sin saltar si ya está visible |
| `/inventario/movimientos`: `max-w-[200px]` revivida | Arreglado — de 1.173 px de faltante a usar todo el ancho |
| Gastos/Ingresos: el nombre perdía contra el breadcrumb | Arreglado — el nombre pasó de 34% a 54% de la fila |
| Diálogo de tarea: nombre del responsable cortado | Arreglado — envuelve a dos líneas |
| Gastos móvil: la ruta completa se comía el concepto | Arreglado — muestra `fecha · concepto` (decisión del dueño) |
| `/labores` móvil: chip de Estado de 108 px | Arreglado — 277 px de ancho, 44 px de alto |
| `/monitoreo` móvil: desbordaba a 446 px | Arreglado — 375 px, cero elementos fuera |
| `ChequeosList`: única tabla del Hato sin scroll | Arreglado — deuda preexistente |
| `use-mobile.ts` huérfano | Borrado |
| 15 comentarios que explicaban con una razón falsa | Limpiados |

### F3 — una sola fuente de verdad
Bloque `.dark` (35 variables) y 7 tokens `--sidebar-*` huérfanos borrados; literales convertidos a
tokens. **Verificado al píxel que nada cambió en pantalla.**

---

## Lo que queda abierto

### Para F4 — decisión del dueño
`docs/tailwind-spike/f4-decisiones.md`, 5 decisiones medidas. F3 sumó dos hallazgos más:
`--success` == `--primary` y `--accent` == `--secondary` (cuatro tokens, dos colores), y
`.valor-negativo` (#dc2626) es un rojo distinto a `--destructive` (#DC3545).

### Deuda declarada, no resuelta
- **~12 comentarios más en `globals.css`** justifican reglas a mano con "el build congelado no trae
  X". No se tocaron porque cada uno viene atado a una decisión de *conservar o reemplazar* la regla,
  que es trabajo propio y no un barrido de comentarios.
- **`/labores`: 27 nombres de lote recortados.** Deuda vieja, no regresión. El arreglo obvio ya se
  intentó y se revirtió a propósito (`globals.css:732`: envolver inflaba la fila a 117 px). Hay
  `title` con el nombre completo y móvil usa otro componente que no hereda el recorte.
- **Gastos escritorio**: el breadcrumb se recorta en 416 filas (mediana 62 px). La fila no da para
  ambos. Cerrarlo del todo es la decisión D-5.
- **Los diálogos no se barrieron sistemáticamente.** Solo se midió uno. Buena parte de la UI vive
  ahí, y es donde aparecieron los dos bugs que dispararon todo esto.

### Nota de historial
Dos agentes trabajaron en paralelo sobre el mismo worktree y uno usó `git rm` (que deja en el índice)
mientras el otro commiteaba. Resultado: el borrado de `use-mobile.ts` quedó dentro de
`c04799b`, y los 15 comentarios más el envoltorio de `ChequeosList` dentro de `5bf4225` — dos commits
cuyos mensajes hablan de otra cosa. **El código es correcto y está verificado en HEAD**; lo que quedó
mal es la atribución. No se reescribió la historia porque no compensa el riesgo.

**Lección operativa**: agentes en paralelo sobre el mismo worktree pueden mezclarse los commits
aunque toquen archivos disjuntos. O se les prohíbe commitear —commitea solo el orquestador— o cada
uno va en su propio worktree.

---

## Lo que cambió en cómo se trabaja aquí

Esto es lo que hace que sea un punto de quiebre y no un arreglo:

1. **El compilador corre.** Cualquier clase válida de Tailwind funciona; no hay lista cerrada.
2. **El incentivo que creó la deuda desapareció.** La caution zone que decía "si te falta una clase,
   escríbela a mano" ya no existe; en su lugar hay una regla que dice usar la utilidad, y envolver en
   `@layer` si de verdad hace falta CSS propio.
3. **Algo lo detecta solo.** `globalsCssTailwindCollisionGuard.test.ts` falla si alguien vuelve a
   escribir a mano una regla que tape una utilidad — el mecanismo exacto que anulaba los anillos de
   foco. No vigila un inventario (como las 4 guardas que se retiraron, y que caducaron cuando el
   mundo cambió): vigila una forma de escribir, así que sigue teniendo sentido dentro de un año.
4. **El daño visual se mide, no se caza.** `auditoria-recorte-medida.md` documenta un barrido
   repetible que recorre la app y reporta qué texto está recortado de verdad, con su método y sus
   límites declarados.

### Lo que costó aprender, y no debería repetirse

- **Tres veces el análisis estático dio una causa equivocada** del mismo defecto, una de ellas del
  orquestador. La causa real —una clase en el elemento **hermano**— solo apareció midiendo el DOM.
  El análisis estático prioriza dónde mirar; **no decide**.
- **Una auditoría devolvió "0 recortes en 21 rutas"** y era falso: el dev server estaba caído. Un
  resultado limpio es sospechoso hasta que el detector se valida contra un caso conocido.
- **Los subagentes no pueden manejar el navegador en esta sesión** (verificado dos veces). Toda
  verificación en pantalla vive en el loop principal.
