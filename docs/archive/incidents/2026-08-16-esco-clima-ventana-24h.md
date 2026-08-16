# Bug: Esco inventa datos climáticos porque lee la tabla podada
**Fecha:** 2026-08-16
**Severidad:** Crítica — cifras fabricadas sobre las que se toman decisiones de riego
**Estado:** Corregido y desplegado

---

## Síntoma reportado

Santiago le preguntó a Esco desde el celular *«Hace cuanto no llueve en Escocia»* y recibió:

> No pude generar una respuesta.

## Lo que el síntoma escondía

El mensaje de error es el desenlace **bueno**. En otras corridas la misma pregunta produjo una respuesta con aire de autoridad y completamente inventada:

| | Esco dijo | Realidad (`clima_resumen_diario`) |
|---|---|---|
| Última lluvia | 1 de julio de 2026 | **12 de agosto de 2026** (0,25 mm) |
| Días sin lluvia | **47** | **4** |

Y encima construyó recomendaciones agronómicas sobre esa premisa: «estrés hídrico», «es vital monitorear la humedad del suelo», «ventana de aplicación ideal». En una finca de aguacate ese número mueve decisiones de riego y de aplicación.

## Camino de reproducción

1. Preguntarle a Esco cualquier cosa climática que no sea de las últimas 24 h.
2. `execClimateData()` (`chat.tsx`) consulta **`clima_lecturas`** con el rango pedido.
3. `clima_lecturas` es una ventana rodante de ~24 h que un cron poda a diario (migración 036). El día de la incidencia tenía 491 filas: del 15 al 16 de agosto.
4. La consulta vuelve vacía → `{ message: 'No hay datos climáticos para el período seleccionado' }`.
5. El modelo, sin datos, se pone a **buscar a tientas**: pide otro rango, y otro, caminando hacia atrás.
6. `llmToolLoop` tiene `maxRounds = 3`. Se agotan siempre en el paso 5.
7. La llamada de fallback devuelve vacío y el código la enmascara con `|| 'No pude generar una respuesta.'`.

Reproducido **4 de 4 veces** antes del arreglo, siempre con exactamente 3 llamadas a `get_climate_data` con rangos decrecientes.

## Hipótesis evaluadas

| Hipótesis | Estado | Evidencia |
|---|---|---|
| Lo introdujo la traza en vivo de la fase 1 (PR #121) | Descartada | La traza solo emite eventos; el fallo está en `execClimateData`, intacta desde antes. La traza fue lo que lo hizo **visible**. |
| Tabla equivocada (`clima_lecturas` en vez de `clima_resumen_diario`) | **Causa raíz** | `clima_lecturas`: 491 filas, 2026-08-15 → 08-16. `clima_resumen_diario`: 1.906 filas, 2020-07-01 → 2026-08-15. |
| `maxRounds = 3` demasiado bajo | Secundaria | Real, pero es consecuencia: sin datos el modelo *tiene* que buscar. Con la tabla correcta la pregunta se resuelve en 1 ronda. |
| El fallback devuelve vacío | **Segunda causa, independiente** | Mandaba el historial con `tool_calls` y mensajes `role: 'tool'` pero **sin** `tools` — petición malformada según el contrato compatible-con-OpenAI de OpenRouter. |

## Causa raíz

Dos defectos que se componen:

1. **`execClimateData()` leía únicamente `clima_lecturas`.** Toda la historia climática de la finca (seis años) vive en `clima_resumen_diario` y esa herramienta nunca la tocaba.
2. **El fallback del tool-loop enmascaraba su propio fallo.** Al agotarse las rondas, omitía `tools` de la petición final y tapaba la respuesta vacía con un string sin salida, sin log ni error.

## Esto ya había pasado

Es **la segunda vez que el mismo bug sale en un consumidor distinto**:

- **2026-04-16** — `fetchClimaResumenSemanal()` en el reporte semanal leía `clima_lecturas`; un informe de una semana pasada mostraba un solo día. Ver `2026-04-16-clima-wrong-table-and-incidencia-avg.md`.

Y hay un agravante. En julio de 2026, al aplicar la compuerta de la migración 068, alguien pasó por esta misma función y dejó anotado en el `CLAUDE.md` que era *«a 4th vulnerable site found during this fix, querying `clima_lecturas` directly»*. Se arregló la compuerta de lluvia. No se arregló la tabla. La pista quedó escrita y sobrevivió cuatro meses.

Por eso el arreglo incluye una **prueba estática**, no un comentario más.

## Arreglo

**`src/supabase/functions/server/chat.tsx`** (y su espejo en `supabase/functions/make-server-1ccce916/`):

- `execClimateData()` reparte fuentes: `clima_resumen_diario` para la serie histórica del rango pedido, `clima_lecturas` **solo** para condiciones actuales y el día en curso (que el rollup de las 00:15 aún no produjo).
- Bloque `lluvia` con `ultima_lluvia_fecha`, `ultima_lluvia_mm` y `dias_sin_lluvia`, calculado sobre **todo** el historial con una consulta propia, deliberadamente independiente del rango pedido: «hace cuánto no llueve» no puede depender de que el modelo acierte la ventana.
- Compuerta de confianza de la 068 replicada (`lluviaConfiable()`): un día con el contador congelado vale **null (sin dato)**, nunca 0, y se cuenta en `dias_sin_dato_en_ese_lapso` para que la respuesta diga «es un máximo» en vez de afirmar una certeza.
- `hoyBogota()`: el edge function corre en UTC y `toISOString()` ya es *mañana* desde las 19:00 locales, lo que corría «días sin lluvia» un día.
- Rango de más de 120 días se entrega agregado por mes: seis años en grano diario son ~2.200 filas que ahogan al modelo.
- Descripción de la herramienta reescrita: le dice al modelo que hay historia desde 2020-07-01 y que para «hace cuánto no llueve» basta **una** llamada sin parámetros.
- Fallback del loop: mantiene `tools` con `tool_choice: 'none'`, agrega una instrucción de sistema que prohíbe inventar cifras, y si aun así vuelve vacío **lanza** en vez de devolver el string sin salida — el cliente lo pinta como error con su reintento.

**`src/__tests__/climaTablaCorrectaGuard.test.ts`** (nuevo): lista blanca de los sitios a los que la ventana de 24 h les sirve de verdad. Cualquier archivo nuevo que lea `clima_lecturas` sin justificarlo pone la prueba en rojo. También verifica que los dos árboles del edge function estén sincronizados.

## Verificación

Contra producción, misma pregunta, después del despliegue:

| | Antes | Después |
|---|---|---|
| Corridas correctas | **0 / 4** | **4 / 4** |
| Rondas del tool-loop | 3 (agotadas) | **1** |
| Respuesta | «No pude generar una respuesta.» | «La última lluvia fue el 12 de agosto de 2026 (hace 4 días), 0,25 mm» |

Además, las cuatro corridas señalan por su cuenta el día con el contador congelado, o sea que ahora Esco reporta la incertidumbre en vez de fabricar certeza.

Suite completa: 2.254 pruebas en 94 archivos, todas verdes.

## Pendiente relacionado (no corregido acá)

El barrido de las 33 herramientas de Esco no encontró otra que lea una tabla podada. Sí encontró **truncamiento silencioso** en tres, que degradan quedándose con lo más reciente en vez de fabricar:

| Herramienta | Tabla | `limit` | Filas reales |
|---|---|---|---|
| `get_monitoring_data` | `monitoreos` | 3.000 | 4.200 — y **sin filtro de fecha por defecto** |
| `get_financial_summary` | `fin_gastos` | 2.000 | 4.474 |
| `get_labor_summary` | `registros_trabajo` | 2.000 | 2.633 |

Ninguna avisa cuando corta. El arreglo proporcionado no es paginar (infla el payload del modelo) sino **hacer visible el corte**: devolver `truncado: true` con el total disponible, para que Esco diga «estoy viendo los 3.000 más recientes de 4.200» en vez de calcular un total equivocado en silencio.
