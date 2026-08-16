# Plan — Facelift de Esco

Rediseño de la experiencia del asistente Esco en la web (`src/components/chat/`).
Auditoría hecha el **2026-08-16** midiendo en vivo contra producción, no leyendo código.

**Estado**: fase 1 implementada y desplegada. Fases 2 y 3 pendientes.

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
| 01 | Silencio de 27 s durante la consulta | **✅ fase 1** | ThinkingState · ToolChips |
| 02 | La burbuja es el contenedor equivocado para un informe de 1.400 chars | pendiente · fase 2 | StreamingText · InsightCards |
| 03 | Gráficas ilegibles en teléfono (226 px, leyenda «value») | pendiente · fase 2 | — (cambia el contenedor, Recharts se queda) |
| 04 | «Guarda esto» no hace nada en la web — **función rota** | pendiente · fase 3 | ApprovalCard |
| 05 | Sin trazabilidad: una cifra aparece sin de dónde salió | pendiente · fase 3 | ContextCards |
| 06 | La respuesta es un callejón sin salida (no copiar/reintentar/detener) | pendiente · fase 2 | StreamingText |
| 07 | El panel no es un diálogo real (Escape no cierra, sin trampa de foco) | pendiente · fase 3 | Radix `Sheet` — **no** Beautiful UI |
| 08 | Estado vacío descentrado y ciego a la ruta | **✅ fase 1** | — |

Los primitivos vienen de [Beautiful UI](https://beautiful-ui-five.vercel.app/) (Turbo),
disponibles offline en el skill `beautiful-ui`.

### Detalle de los puntos pendientes

- **02 / 03** — La respuesta del asistente deja de ser burbuja y pasa a documento a ancho
  completo. La cifra titular sube a tarjeta antes del párrafo que la explica. Las gráficas
  salen de la burbuja y toman el ancho del panel; bajo 640 px, barras **horizontales** (el
  nombre de la categoría es texto largo en español). La leyenda toma el título de la serie,
  nunca la llave cruda del JSON.
- **04** — `chat.tsx:1835` documenta el flujo: *«el cliente renderiza botones de confirmación
  en línea con el token»*. Telegram los renderiza (`telegram/bot.ts:475` inserta en
  `esco_memorias`); la web no tiene una sola línea. Le pedís a Esco que recuerde algo desde
  el navegador, contesta que sí, y la fila nunca se inserta. `ApprovalCard` conectada a
  `propose_memory_save` → `commit_memory_save` con el token que ya viaja.
- **05** — `result_summary` (500 chars por herramienta) ya se persiste en
  `chat_messages.metadata.tool_interactions` y se relee en el turno siguiente. Falta
  mostrarlo: `ContextCards` colapsadas bajo la respuesta. Esto además hace que la traza
  sobreviva al recargar una conversación vieja, cosa que la fase 1 **no** hace.
- **06** — Barra de acciones al pie (copiar, reintentar, exportar gráfica) más
  seguimientos sugeridos. Detener = `AbortController` en `sendChatMessage`.
- **07** — Migrar a Radix `Sheet`, que ya está en `src/components/ui/`. Aquí la guía del
  propio skill manda: cualquier cosa con forma de overlay va con Radix y se le aplican los
  tokens encima, porque la trampa de foco y la capa de descarte son la parte cara de
  rehacer y la fácil de equivocar.

---

## 3. Lo que entregó la fase 1

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

---

## 4. Reglas al vendorizar más primitivos

Vigentes para las fases 2 y 3.

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
