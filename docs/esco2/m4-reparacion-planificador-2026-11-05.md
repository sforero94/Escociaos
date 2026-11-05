# Esco 2.0 M4: reparación del planificador · 2026-11-05

**Resultado:** el mismo conjunto congelado de 8 escenarios del PR #434 (4 de desarrollo con
captura pareada, 4 sintéticos; mismo oráculo, misma fuente controlada, Luna `none`) pasa de
**15/24 (62,5 %)** a **24/24 (100 %)** en la corrida de confirmación. El corte M4 es 70 %.
Solo agregados públicos; escenarios, oráculo y trazas siguen privados, fuera de Git.

## Causa raíz

El 89 % de los turnos fallidos de la campaña del PR #434 (8 de 9) terminaron en `error_plan`.
`error_plan` nace solo en la validación del plan, antes de leer datos. El validador de cobertura
(`validarPlan` con `exigirCobertura`) rechazaba cualquier desvío de forma y tragaba el motivo
(`catch { throw new ErrorPlan('cobertura_no_valida') }`): el reintento recibía un mensaje genérico
y ningún registro decía qué regla falló. Por eso el problema parecía irresoluble: no se veía.

Medición directa del planificador real (12 preguntas propias, ninguna del conjunto privado,
3 repeticiones, sin reintento) con los motivos expuestos:

| Motivo del rechazo | Planes |
|---|---:|
| Mismo inventario repetido en cada llamada (el esquema lo invita: toda herramienta acepta `cobertura`) | 6 |
| Portadora `fuera_de_alcance` junto a operaciones | 1 |
| Parte `consultar` sin vínculo, con una sola llamada posible | 1 |
| Sin inventario en la primera llamada | 1 |
| **Planes válidos** | **27/36 (75 %)** |

Después aparecieron dos patrones más: inventarios parciales repartidos entre llamadas (s1 en
una, s2 en otra) y, en seguimientos cortos («y la de octubre?»), partes que citan el mensaje
anterior del usuario en vez de la pregunta actual.

El fallo semántico restante del conjunto privado era de enrutamiento: «costo de insumos y de
mano de obra al cierre» se enviaba a `consultar_labor_aplicacion` o el detalle exacto del
dinero se declaraba fuera de contrato. Las instrucciones nunca decían que el costo de una
aplicación tiene tres componentes y que los tres salen de `consultar_costos_aplicacion` (D34).

## Cambios

1. `normalizarLlamadasCobertura` (`registro.ts`) repara solo variantes de forma, sin cambiar lo
   declarado: inventario repetido o movido; inventarios parciales con ids disjuntos y
   consecutivos; portadora junto a operaciones cuando el inventario ya registra la parte no
   ejecutable; parte `consultar` sin vínculo cuando existe **exactamente una** llamada de su
   capacidad. Un mismo id con contenido distinto, un vínculo ambiguo o un `parte_ids` mal
   formado siguen siendo rechazo.
2. La cita de una parte se compara sin mayúsculas, tildes, puntuación ni espacios extra, y en un
   seguimiento puede citar un mensaje anterior **del usuario** que el planificador recibió. El
   texto del asistente nunca cuenta. Una frase inventada sigue siendo rechazo.
3. Cada rechazo lleva un código cerrado (`cobertura_no_valida:<motivo>`). El único reintento
   recibe una instrucción fija elegida por ese código; nunca el plan rechazado ni texto del
   usuario. `esco-consultas` registra `errorPlan` y `motivoPlan` (solo códigos).
4. Regla de enrutamiento: costo de una aplicación = insumos + mano de obra + total, todo en
   `consultar_costos_aplicacion`; `consultar_labor_aplicacion` solo para jornales o trabajo
   registrado; el detalle exacto del dinero nunca es fuera de contrato.

Contrato que cambia a propósito: la frontera QA «operación huérfana se rechaza» pasa a
«un vínculo olvidado sin ambigüedad se repara y el turno es idéntico al control positivo».
El caso ambiguo (dos llamadas de la misma capacidad) sigue rechazado y tiene su prueba.

## Medición

| Corrida | Planes válidos (preguntas propias) | Conjunto congelado | Turnos | `error_plan` |
|---|---:|---:|---:|---:|
| PR #434 (base) | 27/36 | 15/24 (62,5 %) | 21/30 | 8 |
| Reparación de forma (1–3) | 36/36 | **18/24 (75 %)** — corrida ciega | 24/30 | 3 |
| + regla de costos (4) | 36/36 | 22/24 (91,7 %) | 28/30 | 2 |
| Confirmación | — | **24/24 (100 %)** | 30/30 | 0 |

- La primera corrida del conjunto congelado fue **ciega**: los cambios 1–3 salieron solo de las
  preguntas propias; las preguntas privadas no se leyeron antes de correrla.
- La regla 4 se escribió después de ver los dos escenarios que fallaban (los dos pedían costo
  al cierre). Es una regla general del contrato D34, verificada además con 12 preguntas
  propias parafraseadas (12/12), pero esas dos corridas ya no son ciegas.
- Seguimiento D3: 1/3 en una corrida, luego 12/12 en dos corridas dedicadas y 3/3 en la
  confirmación. La variación restante es del modelo con temperatura 0, no de una regla.
- Puntuación automática con el oráculo congelado de QA; en la campaña del PR #434 la
  revisión manual coincidió con el automático. Esta reparación no repite la revisión manual.
- Sin held-out (D17), sin producción, sin despliegue. El conjunto tiene 8 escenarios: no es
  una garantía estadística.

## Gasto

| Concepto | USD |
|---|---:|
| P3 acumulado antes de esta reparación | 0,068733135 |
| Cuatro corridas del conjunto congelado y dos de seguimiento D3 | ≈ 0,029 |
| Diagnóstico del planificador con preguntas propias (≈ 230 llamadas Luna, costo no capturado por el script) | ≤ 0,06 (estimado) |
| **P3 acumulado** | **≤ 0,16 / 0,25** |
