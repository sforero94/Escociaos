# Esco SQL — baseline del eval (2026-11-08)

Primera medición del motor SQL de Esco (PR #464, migración 192, `esco-consultas` v12) sobre 122 preguntas,
3 repeticiones cada una (366 corridas). Este documento trae **solo agregados**: el banco de preguntas, la verdad
y las respuestas viven fuera del repo (el repo es público; ver `scripts/esco-sql-eval/README.md`).

## Cómo se midió

- Motor real (`responderPregunta`, mismo prompt y modelo que producción), temperatura 0.
- Base de producción en **solo lectura** vía Composio, contra las vistas `v_esco_*` reales.
  Ese rol **no ejercita la RLS ni la RPC `esco_sql_lectura`** (eso lo cubren `escoSqlMigracion.test.ts` y `po_sonda`).
- Verdad escrita a mano en SQL contra las **tablas base**, no contra las vistas.
- Juez LLM (`openai/gpt-6-sol`) con la verdad y un criterio por pregunta. **Auditoría del juez:** se revisaron a mano
  28 veredictos CORRECTA (los 14 de comportamiento más 14 de cifras al azar): 0 desacuerdos. Un PARCIAL (pronóstico de
  lluvia) es más estricto de lo que yo habría sido. El juez no se audita en los INCORRECTA/PARCIAL más allá de leer sus razones.
- Split `dev` (65 preguntas) y `held` (57). **No se afinó nada**: es un baseline puro. `dev` y `held` dan prácticamente lo mismo
  (81,5 % y 78,4 %), señal de que no hay sobreajuste que descontar todavía.
- Tres preguntas tuvieron mal la expectativa del banco (un seguimiento que apuntaba al turno equivocado y dos de monitoreo):
  se corrigieron y se volvieron a correr. Los números de abajo son los corregidos.

## Resultado global

| | corridas | correcta | parcial | incorrecta |
|---|---|---|---|---|
| Total | 366 | **80,1 %** | 6,6 % | 13,4 % |
| dev | 195 | 81,5 % | 6,2 % | 12,3 % |
| held | 171 | 78,4 % | 7,0 % | 14,6 % |

89 de 122 preguntas salen correctas en las 3 repeticiones; 18 dan resultados distintos entre repeticiones.

## Por módulo

| módulo | preguntas | correcta | parcial | incorrecta |
|---|---|---|---|---|
| aplicaciones | 13 | 100 % | 0 % | 0 % |
| inventario | 7 | 100 % | 0 % | 0 % |
| producción | 9 | 100 % | 0 % | 0 % |
| gastos | 15 | 91,1 % | 2,2 % | 6,7 % |
| jornales | 21 | 90,5 % | 3,2 % | 6,3 % |
| clima | 12 | 80,6 % | 16,7 % | 2,8 % |
| comportamiento | 13 | 76,9 % | 2,6 % | 20,5 % |
| monitoreo | 10 | 53,3 % | 0 % | 46,7 % |
| hato | 13 | 51,3 % | 7,7 % | 41,0 % |
| ingresos | 9 | 48,1 % | 40,7 % | 11,1 % |

Lo que va bien: las vistas con una regla de negocio clara (jornales por fracción, gastos confirmados, plan vs real,
producción consolidada, lluvia con días sin dato) rinden 90–100 %. Las preguntas «sin dato» (período sin registros, nombre
inexistente, año futuro) salen bien el 95 %: Esco no convierte la ausencia en 0. El formato colombiano está bien en el 100 %.

## Dónde falla, por causa (no por pregunta)

1. **Adivina los valores de las columnas de categoría.** Filtró `estado ILIKE 'activo'` cuando el valor real es `activa` y
   concluyó «no hay animales activos». El prompt no lista los valores válidos de `estado`, `etapa`, `tipo`…
   Es la mayor parte del 41 % de error del hato.
2. **Faltan vistas para datos que sí existen**: eventos del hato (partos, servicios), pesajes individuales de leche,
   producción quincenal, y **ventas de ganado de ceba** (`fin_transacciones_ganado`). Sin vista, Esco consulta la tabla
   equivocada (jornales, ingresos) o dice que no puede.
3. **Los totales de ingresos omiten el ganado sin avisar.** Las ventas de ganado de ceba no están en `fin_ingresos`:
   «¿cuánto vendimos?» sale con una cifra que parece total y no lo es (PARCIAL en las 3 repeticiones de 3 preguntas).
   «¿Cuánto ingresó por venta de ganado?» responde «no hay registros» (INCORRECTA 3 de 3).
4. **Regla de agregación incumplida en monitoreo**: promedia porcentajes en vez de ponderar Σafectados/Σmonitoreados;
   a veces responde «no hay registros» sobre una consulta que sí tenía datos. Es el módulo más inconsistente entre repeticiones.
5. **Comportamiento**: ante una orden de escritura disfrazada («Actualiza el inventario de X a 100») responde con una cifra
   en vez de negarse (3 de 3); ante «¿Cuánto gastamos?» sin período contesta una cifra sin aclarar el supuesto (2 de 3);
   ante «muéstrame todos los gastos» (cientos de filas) sus consultas fallan y no ofrece resumen (3 de 3).
6. **Criterio de filtro**: filtra por nombre de tarea cuando la pregunta es por tipo de tarea (113 contra 142,75 jornales
   de poda), y una categoría por coincidencia amplia de texto trae gastos de más.
7. **PARCIAL en clima**: da la cifra correcta pero no dice cuántos días tuvieron dato sobre el total o no señala los
   meses con huecos.

## Operación

- 1,09 consultas por pregunta (máximo 4); 1,9 % de las corridas vieron un error de Postgres.
- Latencia mediana 4,3 s; p90 5,9 s.
- Costo del motor: USD 0,058 por las 366 corridas (≈ USD 0,00016 por pregunta). El juez costó USD 0,95: es el 94 % del gasto del eval.
- 8,7 % de las corridas tocaron una tabla cruda además de las vistas (las vistas guían, no son la frontera de seguridad).

## Qué se haría con esto (no se hizo: es el baseline)

| cambio | ataca | costo |
|---|---|---|
| Listar en `prompt.ts` los valores válidos de las columnas de categoría de cada vista | causa 1 | prompt, sin migración |
| Vista de ventas de ganado de ceba + aclaración en ingresos | causas 2 y 3 | migración nueva |
| Vistas de eventos del hato, pesajes y producción quincenal | causa 2 | migración nueva |
| Reglas explícitas en el prompt: rechazar órdenes de escritura con cualquier verbo, resumir listas largas, promedio ponderado | causas 4, 5 | prompt |
| Aclaración sobre `tipo_tarea` vs `tarea` en la descripción de `v_esco_jornales` | causa 6 | prompt |

Las dos primeras filas cambian lo que Esco puede ver; las demás, lo que hace con lo que ve. Para no mezclar medición con
mejora: cualquier cambio se evalúa mirando `dev`, y `held` se corre al final, una vez, para confirmar.
