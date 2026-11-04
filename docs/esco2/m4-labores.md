# Esco 2.0 M4: alcance de labores

Fecha: 2026-11-03 (Bogotá). Rama `claude/esco2-m4-labores`, sobre `main` (PR #412; reemplaza a #411).
Estado: código y pruebas listos. **Sin despliegue, sin migración.** `esco-consultas` importa
este núcleo, así que el próximo `functions deploy` lo publica.

## Qué cambió

| Brecha | Registro (`registro.ts`) | Ejecutor (`ejecutor.ts`, `fuente.ts`) |
|---|---|---|
| 1. Fechas de tarea | `incluir_estado_tarea` ahora también entrega fechas. Si falta `agrupar_por: tarea`, el validador la agrega; sin espacio, rechaza el plan. | Fila por tarea: `fechas_tarea` (planeada y real, inicio y fin). `null` = sin fecha. Si la fuente no leyó las columnas, el campo no existe. `tareas` lee 4 columnas más. |
| 2. Agrupación | `dia` y `tipo_tarea` (enum de `agrupar_por`). | Mismas reglas: «(sin lote)» propio, «(sin tipo)», costo nulo sigue nulo. |
| 3. Razones | `jornales_por_arbol`, `jornales_por_hectarea`, `costo_por_jornal` (enum de `metricas`). | Las calcula el código. Base: `lotes.total_arboles` / `area_hectareas`. Por lote en las filas; en el total, solo si se nombran lotes. Sin base, sin costo o sin jornales: `null` y `notas` dice por qué. Nunca 0. |
| 4. Aplicación | Sin argumento nuevo. | Fila por tarea: `aplicacion` (`aplicaciones.tarea_id`, 1:1) o `null`. Catálogo lee `aplicaciones` (5 columnas, paginada). |
| 5. Scorer | — | Ver abajo. |
| 6. Cifras faltantes | — | Ver abajo. |

Sin cambio en `chat.tsx`, `src/supabase/functions/server/`, el bot ni la base de datos.

## Decisiones de Santiago (2026-11-03)

- **D30.** Toda consulta que filtra por categoría de tarea lleva `estimados` (total) y
  `jornales_estimados` por fila cuando la fila es la tarea, el tipo o la categoría. Es el plan completo
  de esas tareas, no el del período. El compositor siempre los rotula aparte de los registrados
  (regla 13); la guarda obliga a decirlos. Con filtro de lote, solo cuentan las tareas con registros en
  esos lotes. Las tareas sin estimado se cuentan (`tareas_sin_estimado`), no se vuelven 0.
- **D29.** «Cosecha» sola se resuelve con la pregunta D26; la cifra llega en el seguimiento.
  La evaluación de desarrollo usa el modo `aclaracion_d26`: turno 1 debe ser esa pregunta, las anclas se puntúan en el
  último turno. Las anclas y el período heredado permanecen en los archivos privados de desarrollo.
  La rúbrica anterior usaba un período distinto del de sus anclas; la referencia privada corrige esa diferencia.

## Scorer exacto (`evaluacion.ts`, `fechasTexto.ts`)

- Ancla `fecha`: exacta. Ancla nueva `conjunto` (fechas ISO o nombres): todos los miembros, y ninguno de más.
- Una **fecha de más** en la respuesta hace fallar toda ancla de fecha o conjunto. Cuentan como
  aceptadas: las del ancla, `permitidas`, hoy y los límites del período consultado.
- Nombres de más: lista `universo` del ancla.
- Antes, un conjunto de fechas equivocado pasaba si los números sueltos aparecían. Re-puntuar las
  120 corridas guardadas (M2.5 y M3) no cambió ningún resultado: esas respuestas no tenían fechas de más.
  La regla se probó con pruebas sintéticas.
- Límite: el extractor no reconoce «mayo 22» ni «10-12» (evita falsos positivos).

## Guarda de cifras obligatorias (`guardaNumerica.ts`)

La guarda atrapaba cifras de más. Ahora también las de menos: de cada parte `ok` exige el total de
jornales y cada métrica del total con valor (costo, razones, días, primer y último registro), y los
estimados D30. No exige `null` ni 0. Si falta una, se recompone con el mensaje de cifras faltantes;
si falla otra vez, sale la respuesta determinista, que ya dice todo (propiedad probada).
Costo: ninguna llamada nueva; el tope de tres llamadas no cambia.

## Evidencia

- PR #412, head `4629b033`: 293 archivos, 7.153 pruebas verdes; lint sin errores.
  `esco2M4Labores.test.ts`: 52 pruebas sintéticas.
- Runner `m25.ts`, config `m3`, 10 casos × 3 repeticiones, snapshot congelado: **selección 29/30 (97 %),
  respuesta 29/30**, 0 cifras fuera de evidencia, 0 recomposiciones. El único fallo fue una aclaración
  innecesaria del planificador. Las dos corridas previas del núcleo M3 dieron 23/30 y 24/30 con rúbricas
  distintas; estos totales no demuestran una mejora pareada bajo la misma rúbrica.
- `scripts/esco2/m4-sintetico.ts` (datos sintéticos, planificador real): 8 preguntas × 3 = 24/24 con el
  argumento nuevo correcto y la respuesta con las cifras y fechas esperadas.
- Gasto total: USD 0,065 de 0,50.

## Para el despliegue

- Cada turno lee una tabla más (`aplicaciones`). RLS: solo Administrador y Gerencia la leen; la función
  ya exige Gerencia. Un Verificador vería `aplicacion: null` aunque exista (no aplica hoy).
- Los datos nuevos solo salen si el planificador pide `incluir_estado_tarea`; los snapshots viejos
  no los traen y el campo simplemente no aparece.
- El snapshot congelado no tiene fechas, aplicaciones ni árboles: las capacidades nuevas se prueban con
  datos sintéticos, no con ese snapshot.

## Revisión local — 2026-11-04

Revisión del head `4629b033` de PR #412, fusionado en `main` como `b075fea`.
La rama de correcciones parte de ese `main`. Sin cambios en producción.

- **Fechas:** el scorer usaba parsers distintos para presencia y fechas de más. Rechazaba rangos
  correctos dentro del mismo mes y podía acreditar rangos de cantidades como fechas. Ahora usa
  `extraerFechas` para ambas comprobaciones, reconoce guiones tipográficos y toma el año del contexto
  explícito, nunca del reloj del evaluador.
- **D30 sin registros:** la guarda omitía el estimado de categoría y la respuesta determinista lo
  descartaba. Ahora la guarda, el prompt y la respuesta determinista conservan el estimado del plan
  completo aunque no haya registros de trabajo en el período.
- **Custodia:** este documento y la descripción pública de PR #412 contenían valores de referencia
  de desarrollo por caso. Las versiones actuales conservan solo agregados; esta corrección no borra
  los valores ya publicados en el historial de Git.
- **Evidencia:** las 12 pruebas sintéticas de `esco2LaborReview.test.ts` fallaron antes de las
  correcciones y pasaron después. Suite final: 294 archivos, 7.165 pruebas; `npm run lint`: 0 errores,
  907 advertencias preexistentes (idénticas al head revisado); `npm run typecheck`: correcto.
- **Límites:** sin llamadas a modelos, lecturas de producción ni prueba web/JWT real. No se abrió ni
  ejecutó el held-out. Tras un despliegue autorizado, el evaluador independiente debe repetir los
  mismos 50 escenarios (D31) y comunicar solo agregados. Esta revisión no autoriza merge ni deploy.
