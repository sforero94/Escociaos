# Esco 2.0 — Resultado de la prueba de núcleo M2.5 (labores)

Fecha: 2026-11-03 (Bogotá). Código congelado: `f3b87f6a` en la rama `claude/esco2-m25`.
Respuestas completas, planes y trazas por etapa: archivos privados en `docs/Esco 2.0/m25/`
(fuera de git). Este documento solo trae cifras agregadas.

## Veredicto

**M2.5 superado.** Se cumplen los tres criterios de corte del master plan v0.3:

| Criterio | Umbral | Luna | Todo Sol |
|---|---|---|---|
| Selección correcta de operación y argumentos | ≥ 80 % | **90 %** (27/30) | **97 %** (29/30) |
| Mejor que v295 en los mismos casos | estrictamente mejor | sí (ver límites) | sí |
| Fallos críticos (cifra inventada, estado afirmado sin evidencia, permiso) | 0 | 0 | 0 |

## Condiciones

- 10 casos de labores del golden (L01–L09, W01), 3 repeticiones por configuración, 60 intentos.
- Datos: snapshot congelado de producción (3.127 registros de 2026), solo lectura.
  SHA256 `ed574bc8…e1ae1`. Referencias recalculadas con el SQL del golden, con suma de
  control idéntica antes y después.
- Luna: `openai/gpt-6-luna`, esfuerzo none. Todo Sol: `openai/gpt-6-sol`, esfuerzo low.
- Una sola corrección local antes de congelar (regla general del compositor: decir siempre el
  total de jornales de cada parte). No hubo ajustes después de ver la campaña.

## Resultados por etapa

| Métrica | Luna | Todo Sol |
|---|---|---|
| Cifras de referencia presentes en los resultados (selección) | 27/30 | 29/30 |
| Cifras de referencia afirmadas en la respuesta | 27/30 | 29/30 |
| Rúbrica completa (cifras + requisitos no numéricos) | 24/30 (80 %) | 26/30 (87 %) |
| Casos correctos en la mayoría de repeticiones | 9/10 | 10/10 |
| Respuestas que necesitaron recomposición por la guarda numérica | 0 | 0 |
| Latencia por turno, mediana / máxima | 3,0 s / 4,5 s | 4,0 s / 5,3 s |
| Costo de los 30 turnos | USD 0,008 | USD 0,235 |
| Costo estimado por 1.000 turnos | ≈ USD 0,26 | ≈ USD 7,8 |

Gasto total de la intervención (microprueba, humo y campaña): **USD 0,25** de USD 5 autorizados.

## Fallos observados

| Caso | Config. | Intentos | Causa | Gravedad |
|---|---|---|---|---|
| L07 | Luna | 2/3 | El planificador pidió aclaración sobre «últimas rondas» en vez de usar el período por defecto. | Segura (no afirma nada falso) |
| L03 | Luna | 1/3 | Para un «resumen» pidió solo el total y omitió el desglose por tarea. | Segura (respuesta incompleta) |
| L04 | Sol | 1/3 | Interpretó «cosecha» como la categoría Cosecha, que incluye una tarea de clasificación sin lote. La respuesta lo muestra aparte y rotulado. | Segura (lectura defendible, distinta de la referencia) |
| L06 | ambas | 6/6 | La cifra es correcta, pero no distingue jornales registrados de estimados, como pide la rúbrica. La pregunta no pide estimados. | Rúbrica |

Ningún intento afirmó una cifra fuera de la evidencia, repartió registros sin lote entre
lotes ni dijo que una tarea terminó sin el estado registrado. El caso del alias inexistente
(«Grinch») se resolvió bien en 6/6: pregunta o declara que no está en el sistema.

## Comparación con v295 y límites

- **No hay resultados por caso de v295** en Notion ni en el repositorio. La comparación usa:
  (a) el agregado publicado de v295: 2 respuestas completas de 24 casos (≈ 8 %), y
  (b) los veredictos originales del golden para estos 10 casos (versiones anteriores del motor):
  2 correctos, 2 mixtos, 2 parciales, 4 incorrectos.
  El núcleo nuevo queda muy por encima de ambos, pero no es una comparación pareada.
- La muestra es chica (10 casos de una familia). No es una tasa general de precisión.
- Las respuestas de los casos multiturno usan el historial original de Esco como contexto.
- M2.5 no prueba web, autorización de gerencia, RLS con JWT de usuario ni regresión de
  Telegram. Eso es M3.
- El held-out nuevo (≈ 30 escenarios de Santiago) sigue pendiente y no se tocó.

## Recomendación para M3

1. Mantener Luna como ruta habitual. Todo Sol mejora poco (2 intentos) a ≈ 30 veces el costo;
   el ruteo a Sol debe justificarse con casos de varias partes o dominios, como dice el plan.
2. Los dos fallos de Luna son del planificador y son seguros. Atacarlos con casos nuevos de
   desarrollo (períodos implícitos, resúmenes), no con reglas para estos casos.
3. Decidir con Santiago si «cosecha» como categoría o como nombre de tarea, y si los estimados
   se muestran por defecto cuando se pregunta por una categoría.
4. Conectar el ejecutor a Supabase con el JWT del usuario en una función nueva y separada,
   sin tocar `chat.tsx` ni el bot.
