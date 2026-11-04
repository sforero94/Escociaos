# Esco 2.0 — Diseño M2 y prueba de núcleo M2.5

Fecha: 2026-11-03. Responsable de la intervención: Claude Code (decisión D24 de Santiago).
Este documento reemplaza la preparación de las ramas `codex/esco2-*` como fuente de diseño.
Las cinco recomendaciones del memo M2 de esas ramas se conservan (todas opción A).

Los datos privados (golden set, snapshot, referencias y resultados de campaña) viven fuera
del repositorio, en `docs/Esco 2.0/`, excluida de git. El repositorio es público.

## Decisiones que rigen (master plan, sección 12)

| ID | Decisión |
|---|---|
| D19 | Ruta de datos B: Supabase directo con el JWT del usuario, registro cerrado de operaciones, sin SQL generado. E2-17 cerrado; la ruta A (Composio `SUPABASE_RUN_READ_ONLY_QUERY`) usa un rol con BYPASSRLS. |
| D20 | Snapshot de evaluación: corte congelado local, leído en solo lectura desde producción. |
| D21 | Filas de labores sin datos personales pueden ir a Luna/Sol (OpenRouter) durante la evaluación. |
| D22 | Tope de gasto de modelo para la campaña M2.5: USD 5. |
| D23 | Golden set original en la carpeta local privada, excluida de git. |

## Recorrido de un turno

```
pregunta ─▶ planificador (LLM, herramientas) ─▶ validarPlan (registro) ─▶ ejecutor (código)
        ─▶ compositor (LLM, solo cifras de RESULTADOS) ─▶ guarda numérica ─▶ respuesta
```

- **Máximo tres llamadas al modelo por turno**: planificador, compositor y una recomposición.
  Si la recomposición también falla la guarda, se publica un resumen determinista.
- **El modelo propone; el código decide.** Permisos, resolución de nombres, cálculos y reglas
  de datos están fuera del modelo.

Código: `src/utils/esco2/`. Una sola fuente, importable con extensión `.ts` desde Vitest,
Node (runner) y Deno (la edge function de M3).

| Archivo | Responsabilidad |
|---|---|
| `registro.ts` | Registro único: esquema de herramientas que ve el modelo y validador. Rechaza argumentos no registrados, fechas inválidas, agrupaciones o métricas desconocidas y más de 4 consultas. |
| `catalogo.ts` | Resolución de lotes (entidad: exactamente uno), tareas (filtro por fragmento; el tipo de tarea solo si ningún nombre coincide) y categorías. Sin coincidencia o ambiguo → `no_resuelto` con sugerencias. Nunca adivina. |
| `ejecutor.ts` | Agregación determinista. Sin lote = grupo propio. Costo nulo ≠ cero. Filtro no resuelto → sin cifras. `hasta` se recorta a hoy. Porcentajes calculados por código. |
| `guardaNumerica.ts` | Cada número y fecha ISO del texto debe existir en la evidencia (resultados, hoy, pregunta). Reutiliza el parser `escoEvals/numeros.ts`. |
| `nucleo.ts` | Orquesta el turno y registra etapa, tokens, costo y latencia de cada llamada. |
| `evaluacion.ts` | Puntuación por etapa: selección (las cifras de referencia están en los resultados) y respuesta (el texto las afirma). |

### Operación registrada: `consultar_labores`

Período (`desde`, `hasta`), filtros (`lotes`, `tareas`, `categorias`, `sin_lote`),
`agrupar_por` (lote, tarea, categoría, mes, semana; máximo 2), `metricas` (jornales, costo,
dias_con_registro, primer_registro, ultimo_registro), `incluir_estado_tarea` y `limite`.
Además: `pedir_aclaracion` y `fuera_de_alcance`.

### Resultado por parte

`estado` (`ok` | `sin_registros` | `no_resuelto`), `alcance` efectivo (fechas, entidades
resueltas, recorte a hoy), `no_resueltos` con sugerencias, `filas`, `total` y `cobertura`
(registros, sin lote, sin costo, grupos totales y mostrados). Es la única fuente de cifras.

## Seguridad (ruta B)

- M2.5 no lee producción en tiempo de ejecución: el ejecutor lee el snapshot congelado.
- M3 conecta el ejecutor a Supabase con un cliente creado con el JWT del usuario, de modo
  que la RLS aplica. Gerencia se verifica en el servidor antes de planificar. La función es
  nueva y separada; no se toca `chat.tsx` ni el bot de Telegram (R12).
- Sin SQL libre: el ejecutor solo hace lecturas fijas de cuatro tablas con columnas fijas.

## Evaluación M2.5

- Casos: 10 de labores del golden (L01–L09, W01). L10 se excluye: es de monitoreo.
- Referencias: el SQL del golden se volvió a correr el 2026-11-04 contra producción en solo
  lectura, con una suma de control idéntica antes y después a la del snapshot.
- Configuraciones: Luna (`openai/gpt-6-luna`, esfuerzo none) y techo todo Sol
  (`openai/gpt-6-sol`, esfuerzo low). Tres repeticiones cada una.
- Corte (v0.3): selección correcta de operación y argumentos ≥ 80 % y mejor que v295 en
  los mismos casos. Un caso sin una de sus cifras de referencia no cuenta como correcto.

## Qué se descartó de la preparación anterior

- Custodia del snapshot en Codex Cloud (reemplazado por D20).
- Prueba previa de cota para tres llamadas (reemplazado por `max_tokens` y D22).
- Prototipo Python y su suite: el diseño se implementó directo en TypeScript.
- Campaña adicional sobre la ruta A.

## Pendiente para M3 (no forma parte de M2.5)

- Edge function `esco-consultas` (una sola fuente, `verify_jwt` explícito, entra al detector
  de deriva), autorización de gerencia y propiedad de la conversación.
- Cliente Supabase con JWT de usuario detrás de la misma interfaz `DatosLabores` o una
  versión paginada por consulta.
- Held-out nuevo escrito por Santiago (≈ 30 escenarios). No bloquea M2.5.
