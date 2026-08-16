# Plan — Facelift de Esco

Rediseño de la experiencia del asistente Esco en la web (`src/components/chat/`).
Auditoría hecha el **2026-08-16** midiendo en vivo contra producción, no leyendo código.

**Estado**: **completo**. Fases 1, 2 y 3 implementadas, verificadas contra producción y desplegadas.

---

## 1. Lo que se midió

Una pregunta real de finanzas («gastos por categoría de los últimos 3 meses»), sesión
Gerencia, datos de producción:

| Medición | Valor |
|---|---|
| Respuesta completa | **30,4 s** |
| De eso, spinner estático «Consultando datos…» | **~27 s** |
| Máquina de escribir simulada al final | 2,7 s (1.444 chars ÷ 8 por cada 15 ms) |
| Ancho real de una gráfica en un teléfono de 375 px | **226 px** |
| Herramientas de Esco | 33 |
| Acciones disponibles sobre una respuesta | 0 |

**Hallazgo que cambió el plan** (medido *después* de instrumentar la traza en la fase 1):
las herramientas tardan **24–229 ms**. Prácticamente toda la espera es round-trip del
LLM, no la base de datos. La fase 1 volvió la espera legible; **no la acortó**, y la
palanca real para acortarla es el modelo o el streaming de verdad, no las consultas.

---

## 2. Los ocho puntos

Ordenados por cuánto cambian la sensación de uso.

| # | Punto | Estado | Primitivo |
|---|---|---|---|
| 01 | Silencio de 27 s durante la consulta | ✅ fase 1 | ThinkingState · ToolChips |
| 02 | La burbuja es el contenedor equivocado para un informe de 1.400 chars | ✅ fase 2 | — (documento a ancho completo) |
| 03 | Gráficas ilegibles en teléfono (226 px, leyenda «value») | ✅ fase 2 | — (contenedor + barras horizontales) |
| 04 | «Guarda esto» no hace nada en la web — **función rota** | ✅ fase 3 | ApprovalCard |
| 05 | Sin trazabilidad: una cifra aparece sin de dónde salió | ✅ fase 3 | — (traza rehidratada) |
| 06 | La respuesta es un callejón sin salida (no copiar/reintentar/detener) | ✅ fase 2 | — |
| 07 | El panel no es un diálogo real (Escape no cierra, sin trampa de foco) | ✅ fase 3 | Radix `Sheet` — **no** Beautiful UI |
| 08 | Estado vacío descentrado y ciego a la ruta | ✅ fase 1 | — |

Los primitivos vienen de [Beautiful UI](https://beautiful-ui-five.vercel.app/) (Turbo),
disponibles offline en el skill `beautiful-ui`.

### Cómo quedó cada uno

- **02 / 03** — La respuesta del asistente dejó de ser burbuja: ocupa el ancho del panel y las
  gráficas salen del recuadro. `ChatChart` mide su **contenedor** con `ResizeObserver`
  (`useAnchoContenedor`), no el viewport: el panel es 50vw en escritorio, así que una media query
  mentiría sobre el espacio real. Bajo 460 px las barras giran a **horizontales**, con `key` para
  forzar el remonte — recharts no re-deriva los ejes al cambiar `layout` sobre una instancia viva,
  y sin eso la gráfica se quedaba vertical. La leyenda usa el título de la serie y desaparece
  cuando hay una sola: se acabaron los «value» y «total».
- **04** — `EscoMemoriaAprobacion` conectada a `guardarMemoria()`. La web **no** necesita el token
  ni el rol de servicio que usa Telegram: el contenido propuesto ya viaja en los `args` de
  `propose_memory_save` dentro de la traza, y la RLS de `esco_memorias` es `user_id = auth.uid()`
  en USING y en WITH CHECK. Antes de ofrecer la tarjeta se consulta `memoriaYaGuardada()`, porque
  al reabrir una conversación vieja la propuesta sigue en la metadata y aceptarla otra vez
  duplicaría la fila.
- **05** — `trazaDeMensaje()` prefiere `metadata.traza` (en vivo, con duraciones) y cae a
  `metadata.tool_interactions`, que el servidor ya persistía desde antes de este módulo y que
  nadie leía. Un paso sin `ms` en una traza asentada se pinta como terminado, no como girando.
- **06** — Barra de acciones (copiar, reintentar) al pie de cada respuesta, montada **fuera** del
  nodo `[data-role="assistant"]` para no contaminar el PDF exportado. Detener es un
  `AbortController`; abortar no se reporta como error, y cerrar el panel corta el stream.
- **07** — Radix `Sheet`. Verificado en vivo: `role="dialog"`, Escape cierra, el foco entra al
  campo de texto, Radix maneja el bloqueo de scroll y el contenido desmonta al cerrar. Se eliminó
  el hack de `document.body.style.position`.

---

## 3. Lo que entregó el módulo

- **Protocolo**: `llmToolLoop` acepta un tercer parámetro opcional `onEvent`; emite
  `tool_start` / `tool_done` con `tool`, `index`, `args`, `ms` y `ok`. Aditivo por contrato
  — Telegram llama sin `onEvent` y se comporta igual. Detalle en el `CLAUDE.md` raíz.
- **`src/utils/escoHerramientas.ts`**: mapa de las 33 herramientas a etiquetas en español,
  formateo del rango de fechas y de la duración. Vive en el cliente para no pagar el costo
  de sincronizar los dos árboles del edge function.
- **`src/components/chat/EscoTraza.tsx`**: adaptación de `ThinkingState`.
- **`src/__tests__/escoHerramientas.test.ts`**: guarda de paridad — lee los `case` de
  `executeTool` y falla si una herramienta ejecutable se queda sin etiqueta o si sobra una
  huérfana.
- **`src/components/chat/EscoMemoriaAprobacion.tsx`**: adaptación de `ApprovalCard`.
- **`src/hooks/useAnchoContenedor.ts`**: ancho real del contenedor vía `ResizeObserver`.
- **`src/__tests__/escoPanelContrato.test.ts`**: 21 guardas de los contratos que se rompen
  callados — que `data-role` no se trague la traza ni las acciones (irían al PDF), que la gráfica
  remonte al girar, que el panel siga siendo un diálogo, que todo control propio tenga anillo de
  foco. Quita comentarios antes de afirmar, para no castigar el documentar lo que se eliminó.

---

## 4. Reglas al vendorizar más primitivos

Vigentes para cualquier primitivo que se adopte de aquí en adelante.

- **El choque de `--accent`.** En Beautiful UI es el color de marca; en shadcn es la
  superficie de hover de los menús. Importar su `theme.css` tal cual pone **todos** los
  dropdowns de la app en azul de golpe. Se remapea al entrar y `--primary` sigue siendo
  `#73991C`. La fase 1 lo evitó escribiendo los componentes contra los tokens de Escocia
  directamente en vez de importar la capa de tokens de la librería — **seguir así**.
- **No copiar el bloque `.dark`.** Escocia OS borró su modo oscuro a propósito (F3,
  agosto 2026). El `theme.css` del skill lo trae.
- **Los primitivos son demo, no producción.** Medido sobre los 19: `focus-visible` en 1
  archivo, 5 matan el `outline` sin reponer nada, 43 animaciones en línea que ningún
  `prefers-reduced-motion` alcanza, botones de 28 px contra un piso táctil de 44. La fase 1
  cerró las tres cosas: animaciones como clases en `globals.css` (con su bloque de
  reduced-motion), anillo de foco explícito, y la clase `touch-target` que ya existía.
- **34 hex sueltos** sobreviven a cualquier remapeo de tokens. `InsightCards:110` trae
  `#3d9aff` hardcodeado, que además es el acento de modo oscuro. Hacer `grep '#'` al
  componente antes de asumir que el remapeo lo cubrió.
- **Telegram no se toca.** Comparte `llmToolLoop` y el system prompt: todo evento nuevo
  tiene que ser aditivo.
