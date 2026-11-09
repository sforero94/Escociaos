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

| H1 | Hato sin vistas de eventos, pesajes ni producción quincenal; estado reproductivo no calculable | Migración 195: `v_esco_hato_eventos`, `v_esco_hato_pesajes`, `v_esco_hato_produccion_quincenal` (sin dinero) y el estado reproductivo derivado en `v_esco_hato` (`estado_reproductivo`, `estado_pantalla`, fechas de secar y parto desde el último servicio). Paridad con TypeScript. | migración 195 + prompt | `escoSqlMigracion195` |
| M1 | «Última ronda» devolvía «no hay registros»; promedio de porcentajes; conteo de filas en vez de observaciones | Migración 195: `ronda_orden` / `es_ultima_ronda` (las 86 observaciones sin ronda ordenaban primero con `DESC`) y `v_esco_monitoreo_ronda_plaga` (incidencia ponderada de todos los lotes). Reglas de prompt. | migración 195 + prompt | `escoSqlMigracion195` |

Dos ajustes salieron de mirar los fallos de `dev` (se permite afinar sobre `dev`): la regla 6 había hecho que Esco dejara de
nombrar productos cuando preguntaban «cuáles» (regresión en inventario), y la regla 13 dejaba «hasta hoy» sin hoy.

## Estado de las migraciones

**195 — aplicada a producción el 2026-11-09** (ledger `20261109190817`, con la aprobación de Santiago) y `esco-consultas` redesplegada como v14
(vistas de hato y monitoreo; 194 queda reservada para P4). Antes se ensayó con `po_sonda`: guardas pasan, `deshecho: true`, y la vista de hato
da los mismos conteos por estado que el motor de TypeScript sobre los datos vivos. Verificado en vivo: 14 vistas con `security_invoker`, `anon`
sin acceso, `/health` anónimo 401. Orden usado: migración primero, deploy después. Las fechas probable de parto y de secar de `v_esco_hato` ya se
calculan desde el último servicio.

### 193

**Aplicada a producción el 2026-11-09** (ledger `20261109182850`, con la aprobación de Santiago) y `esco-consultas` redesplegada como v13.
Antes se ensayó con `po_sonda` contra producción (corre los pasos y siempre deshace): las guardas pasan, `deshecho: true`, y las
cifras de la vista nueva coinciden con las pantallas (ingresos 2026 = `fin_ingresos` + ventas de ganado; el costo de las
aplicaciones cerradas en octubre igual al del reporte; octubre con 31 días de clima, uno sin fila). Orden usado: migración
primero, deploy después. Verificado en vivo: 10 vistas con `security_invoker`, `anon` sin acceso, `/health` anónimo 401.
Pendiente: una prueba real de Santiago en el botón «Esco SQL (beta)» (hato y monitoreo incluidos).

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

Medición final, con el prompt y las vistas 193 (en producción) y 195 (inyectadas como CTE).
Antes: base2,antes,antes2,antes3. Después: p3. Por pregunta se toma el último tag que la contiene.

| grupo | preguntas | correcta antes | correcta después | cambio (pp) |
|---|---|---|---|---|
| **Total** | 75 | 66.2 % | 91.1 % | +24.9 |
| verdad intacta (comparación estricta) | 52 | 84.6 % | 93.6 % | +9.0 |
| verdad cambiada o pregunta nueva | 23 | 24.6 % | 85.5 % | +60.9 |

### Por módulo (todas las preguntas)

| módulo | preguntas | antes | después | cambio (pp) |
|---|---|---|---|---|
| aplicaciones | 8 | 70.8 % | 95.8 % | +25.0 |
| clima | 6 | 55.6 % | 88.9 % | +33.3 |
| comportamiento | 9 | 81.5 % | 81.5 % | +0.0 |
| gastos | 8 | 83.3 % | 100.0 % | +16.7 |
| hato | 10 | 16.7 % | 93.3 % | +76.6 |
| ingresos | 5 | 40.0 % | 100.0 % | +60.0 |
| inventario | 4 | 100.0 % | 100.0 % | +0.0 |
| jornales | 11 | 100.0 % | 97.0 % | -3.0 |
| monitoreo | 8 | 37.5 % | 66.7 % | +29.2 |
| produccion | 6 | 83.3 % | 94.4 % | +11.1 |

### Por módulo (solo verdad intacta)

| módulo | preguntas | antes | después | cambio (pp) |
|---|---|---|---|---|
| aplicaciones | 3 | 100.0 % | 100.0 % | +0.0 |
| clima | 2 | 100.0 % | 100.0 % | +0.0 |
| comportamiento | 7 | 90.5 % | 85.7 % | -4.8 |
| gastos | 8 | 83.3 % | 100.0 % | +16.7 |
| hato | 5 | 26.7 % | 100.0 % | +73.3 |
| ingresos | 2 | 100.0 % | 100.0 % | +0.0 |
| inventario | 4 | 100.0 % | 100.0 % | +0.0 |
| jornales | 11 | 100.0 % | 97.0 % | -3.0 |
| monitoreo | 5 | 53.3 % | 60.0 % | +6.7 |
| produccion | 5 | 100.0 % | 100.0 % | +0.0 |

Preguntas que mejoran: 28; empeoran: 3; igual: 44.
Empeoran por módulo: {'jornales': 1, 'monitoreo': 1, 'comportamiento': 1}.

### Tipos de fallo (corridas no correctas)

| tipo | antes | después |
|---|---|---|
| cifra_mal | 39 | 6 |
| consulta_fallida | 5 | 0 |
| faltante | 19 | 6 |
| invento | 1 | 2 |
| no_aclaro | 2 | 3 |
| otro | 7 | 3 |
| periodo_mal | 3 | 0 |

## Lectura

- **Dev total: 66,2 % → 91,1 %** (+24,9 pp). Con la verdad intacta (52 preguntas, comparación estricta): 84,6 % → 93,6 %.
  Mejoran 28 preguntas, empeoran 3 (jornales, monitoreo, comportamiento: una repetición de tres cada una, sin causa en una corrección).
- **Todos los módulos quedan en 80 % o más salvo monitoreo (66,7 %)**, que subió desde 37,5 %. Lo que falla ahí es una pregunta
  de incidencia anual cuya cifra difiere en 0,3 pp de la verdad, un juez estricto con el método de un conteo correcto y otro con
  los umbrales de atención (10 %/30 %, que sí están en el prompt). No hay una causa de motor pendiente demostrada.
- **Dos artefactos del eval, no de Esco, se corrigieron en el runner:** (1) las vistas sombra no resolvían a otras sombras
  (`v_esco_monitoreo_ronda_plaga` leía la vista vieja); (2) cuando Composio guarda un resultado grande en un archivo, el runner no
  lo leía, así que las preguntas de listas largas «fallaban» también en el baseline. El «antes» de esas preguntas se repitió con
  el runner corregido.
- **El estado derivado del hato ya está en SQL**, con una prueba de paridad contra `derivarEstadoReproductivo()` sobre más de
  2.500 filas (incluye los bordes de la ventana de secar; se comprobó que un error de `<` frente a `<=` hace fallar la prueba).
  Sobre los datos vivos la vista y el motor de TypeScript dan los mismos conteos por estado.
- **Pendiente para el gate D6** (≥ 90 % total, ningún módulo bajo 80 %, `held` una sola vez): monitoreo, y la pregunta de kg por
  árbol anual, que sigue dividiendo entre árboles-cosecha. El `held` sigue cerrado y sus verdades hay que actualizar antes con las
  mismas definiciones nuevas (ventas, costo como el reporte, fecha de cierre real, días calendario, rangos semiabiertos).
- Gasto del eval completo de P1 y de la 195: unos USD 4.
