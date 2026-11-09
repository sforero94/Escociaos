# Esco SQL — correcciones P1 y medición sobre `dev` (2026-11-09)

Fase P1 del plan de migración Esco 2.0 (`docs/esco2/plan-migracion-esco2-sql.md`, §8.1). Corrige los fallos de la
evaluación en producción del 2026-11-09 y del baseline del 2026-11-08 (`esco-sql-baseline-2026-11-08.md`). Este
documento trae **solo agregados**: el banco, la verdad y las respuestas siguen fuera del repo (repo público).

## Qué se corrigió

| # | Fallo | Corrección | Dónde | Prueba |
|---|---|---|---|---|
| F1 | Dinero en pesos completos en lugar de formato M | El modelo escribe pesos completos y un formateador determinista abrevia (`abreviarDineroEnTexto`, regla `dineroMensaje`). Antes el modelo abreviaba y redondeaba mal (`$153M` por `$153,6M`). | código | `escoSqlCorreccionesP1` |
| F2 | «Ventas» = todos los ingresos; ventas de ganado de ceba ausentes | `v_esco_ingresos` hace `UNION ALL` con `fin_transacciones_ganado` (`venta`, `es_hato = false`) y agrega `es_venta` y `origen`. Las ventas de animales del hato no se unen: ya están en `fin_ingresos` (070). Regla 11 del prompt. | migración 193 + prompt | `escoSqlMigracion193` |
| F3 | Costo de aplicación distinto del reporte | `v_esco_aplicaciones` calcula insumos y mano de obra como el reporte. La regla es una sola función (`calcularCostoAplicacionReal`) que el reporte ya usa; la prueba compara la vista contra ella. | migración 193 + hook | `escoSqlMigracion193` |
| F4 | Fecha de cierre un día antes | `aplicaciones.fecha_cierre` es `timestamptz` a las 00:00 UTC; convertirlo a Bogotá restaba un día. Se lee `aplicaciones_cierre.fecha_cierre` (`date`) con respaldo en la fecha UTC. Se revisaron las 24 columnas de fecha de las 10 vistas: las otras 23 son `date` de origen. | migración 193 | `escoSqlMigracion193` |
| F5 | Valores de categoría adivinados; filtro suelto de plagas | Lista de valores exactos de las columnas de categoría y de los nombres del catálogo de plagas; regla 10 (igualdad exacta, separar o preguntar si una palabra cubre varias); aclaración `tipo_tarea` frente a `tarea`. | prompt | `escoSqlCorreccionesP1` |
| F6 | Pregunta sin período respondida con un período elegido | Regla 4: preguntar el período; el seguimiento hereda el del turno anterior. | prompt | `escoSqlCorreccionesP1` |
| F7 | Cruce que multiplica conteos | Regla 12: agregar cada lado a la llave antes de unir. | prompt | `escoSqlCorreccionesP1` |
| F8 | Conteo que ninguna consulta devolvió | Regla 1: todo conteo sale de `COUNT(*)` o `n_filas`; con truncado, `COUNT(*)` antes del total. | prompt | `escoSqlCorreccionesP1` |
| F9 | kg por árbol anual con árboles repetidos por cosecha | La vista de producción dice que los árboles son por cosecha; un año usa árboles distintos y la respuesta dice cuál calculó. | prompt | `escoSqlCorreccionesP1` |
| F10 | Día sin fila de clima no contado como «sin dato» | `v_esco_clima_diario` genera cada día calendario hasta ayer; `tiene_fila`. La respuesta explica la regla en una línea (regla 8). | migración 193 + prompt | `escoSqlMigracion193` |
| F11 | «Próximos 60 días» = 61 fechas | Regla 13: rangos semiabiertos; «hasta hoy» incluye hoy (`< hoy + 1`). | prompt | `escoSqlCorreccionesP1` |
| F12 | La RPC rechaza `;` dentro de un literal | Solo regla 14 del prompt. `esco_sql_lectura` no se toca (un cambio ahí es un cambio de seguridad); una prueba lo fija. | prompt | `escoSqlCorreccionesP1` |
| F13 | Prueba de inyección no evaluable en producción | Corrida por el motor (no por la pantalla): Esco se negó en 3 de 3 corridas, antes y después. Sin cambio de código. | — | corrida manual |

Dos ajustes salieron de mirar los fallos de `dev` (se permite afinar sobre `dev`): la regla 6 había hecho que Esco dejara de
nombrar productos cuando preguntaban «cuáles» (regresión en inventario), y la regla 13 dejaba «hasta hoy» sin hoy.

## Estado de la migración 193

Escrita y **sin aplicar**. Ensayada el 2026-11-09 con `po_sonda` contra producción (corre los pasos y siempre deshace):
las guardas previas y posteriores pasan, `deshecho: true`, y las cifras de la vista nueva coinciden con las pantallas
(ingresos 2026 = `fin_ingresos` + ventas de ganado; el costo de las aplicaciones cerradas en octubre igual al del reporte;
octubre con 31 días de clima, uno sin fila). Orden al aplicar: migración primero, `esco-consultas` después. Aplicar y
desplegar necesitan la aprobación de Santiago en ese momento.

## Cómo se midió

- Solo el split `dev` (el `held` sigue cerrado). El runner ejecuta además 3 preguntas de `held` como antecesoras de seguimientos de
  `dev` (para armar el contexto); sus resultados quedan fuera de todos los agregados y no se examinaron.
- Como la 193 no está aplicada, el runner inyecta sus vistas como CTE delante de la consulta del modelo (`run.mts --sombra`).
  Solo lectura: no se crea nada en la base. Igual que el baseline, ese rol no ejercita la RLS ni la RPC.
- **La verdad de 12 preguntas cambió** porque la definición cambió por decisión del plan (ventas frente a ingresos, costo como el
  reporte, fecha de cierre real, días calendario de lluvia, rango semiabierto) y se agregaron **5 preguntas nuevas** con los casos
  de la evaluación en producción (inyección, ácaros por lote, cierres de octubre, cruce trabajo × gastos, kg por árbol). Esas 17
  se re-corrieron con el motor viejo (`antes`) para no comparar dos varas distintas. La comparación **estricta** es la de las 53
  preguntas con verdad intacta.
- Al juez se le agregó una nota sobre las vistas nuevas en las aplicaciones: leía `costo_total` y suponía el valor guardado.
  Solo afecta a la columna «después» de ese módulo; el «antes» se juzgó con las vistas viejas, donde esa suposición era cierta.
- 3 repeticiones por pregunta, juez `openai/gpt-6-sol`, temperatura 0, fecha fija 2026-11-08.

## Antes y después (split `dev`)
Antes: base2,antes. Después: p1c,p1d. Por pregunta se toma el último tag que la contiene.

| grupo | preguntas | correcta antes | correcta después | cambio (pp) |
|---|---|---|---|---|
| **Total** | 70 | 71.0 % | 82.9 % | +11.9 |
| verdad intacta (comparación estricta) | 53 | 83.0 % | 83.0 % | +0.0 |
| verdad cambiada o pregunta nueva | 17 | 33.3 % | 82.4 % | +49.1 |

### Por módulo (todas las preguntas)

| módulo | preguntas | antes | después | cambio (pp) |
|---|---|---|---|---|
| aplicaciones | 8 | 70.8 % | 87.5 % | +16.7 |
| clima | 6 | 55.6 % | 100.0 % | +44.4 |
| comportamiento | 9 | 70.4 % | 66.7 % | -3.7 |
| gastos | 8 | 83.3 % | 95.8 % | +12.5 |
| hato | 7 | 38.1 % | 42.9 % | +4.8 |
| ingresos | 5 | 40.0 % | 80.0 % | +40.0 |
| inventario | 4 | 100.0 % | 100.0 % | +0.0 |
| jornales | 11 | 100.0 % | 100.0 % | +0.0 |
| monitoreo | 6 | 50.0 % | 55.6 % | +5.6 |
| produccion | 6 | 83.3 % | 100.0 % | +16.7 |

### Por módulo (solo verdad intacta)

| módulo | preguntas | antes | después | cambio (pp) |
|---|---|---|---|---|
| aplicaciones | 3 | 100.0 % | 77.8 % | -22.2 |
| clima | 2 | 100.0 % | 100.0 % | +0.0 |
| comportamiento | 7 | 76.2 % | 71.4 % | -4.8 |
| gastos | 8 | 83.3 % | 95.8 % | +12.5 |
| hato | 6 | 38.9 % | 33.3 % | -5.6 |
| ingresos | 2 | 100.0 % | 100.0 % | +0.0 |
| inventario | 4 | 100.0 % | 100.0 % | +0.0 |
| jornales | 11 | 100.0 % | 100.0 % | +0.0 |
| monitoreo | 5 | 53.3 % | 60.0 % | +6.7 |
| produccion | 5 | 100.0 % | 100.0 % | +0.0 |

Preguntas que mejoran: 17; empeoran: 5; igual: 48.
Empeoran por módulo: {'aplicaciones': 1, 'monitoreo': 1, 'hato': 2, 'comportamiento': 1}.

### Tipos de fallo (corridas no correctas)

| tipo | antes | después |
|---|---|---|
| cifra_mal | 31 | 11 |
| consulta_fallida | 7 | 1 |
| faltante | 12 | 10 |
| formato | 0 | 1 |
| invento | 1 | 2 |
| no_aclaro | 2 | 2 |
| otro | 5 | 9 |
| periodo_mal | 3 | 0 |

## Lectura

- Mejoran 17 preguntas y empeoran 5. De las 5, ninguna se puede atribuir a una corrección: son hato (2), monitoreo (1),
  comportamiento (1) y aplicaciones (1), con diferencias de una o dos repeticiones sobre tres. Ninguna de esas cinco preguntas
  usa una vista o una regla que cambió, salvo la de aplicaciones (estados), cuyo conteo sigue siendo correcto y solo varía cómo lo nombra. Aun así **no se cumple al pie de la letra** «ningún módulo baja»: comportamiento (−3,7 pp) y, en la
  comparación estricta, aplicaciones, hato y comportamiento caen dentro de ese ruido. Con 3 repeticiones, una pregunta que cambia
  de 3/3 a 2/3 mueve un módulo de 3 preguntas 22 pp.
- El gasto del eval completo de P1 fue de unos USD 1,6 (juez ≈ 90 %).
- **Fuera del alcance de F1–F13 y siguen bajos** (candidatos para una fase propia):
  1. Hato (43 %): faltan vistas de eventos (partos, servicios), pesajes individuales y producción quincenal; Esco consulta ingresos por «pesar».
  2. Monitoreo (56 %): promedia porcentajes en vez de ponderar, y en la «última ronda» responde que no hay registros.
  3. Lista larga («todos los gastos»): el resumen que pide la regla 6 no siempre sale.
  4. El cruce de F7 se agrega bien, pero Esco no siempre reconoce el volumen ni ofrece filtrar.
