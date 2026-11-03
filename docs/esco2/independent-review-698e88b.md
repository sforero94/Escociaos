# E2-02 — revisión independiente de 698e88b y cierre

Fecha: 2026-11-03. Rama local aislada: `codex/esco2-evaluation-prep`.
Commit revisado: `698e88b2a4e3749782a87a02ea965f3e2262290b`.
Evaluador: agente separado `/root/independent_synthetic_review`, iniciado sin
historia previa de implementación. No es una revisión humana.

## Alcance e independencia

El segundo evaluador recibió únicamente el objetivo y la lista permitida de
archivos: scorer, rúbrica, fixtures SQL/JSON, tests, script de mutación y el
informe sintético v0.3.1. Trabajó en modo lectura; no editó fuentes. Se prohibió
abrir el directorio privado, Library, golden, reserva/held-out, otros datos,
red, proveedores o producción. Reportó respetar esas restricciones en ambas
pasadas. No se ejecutó el producto ni se usaron preguntas reales.

Primera pasada: 26/26 tests pasaron y 8/8 mutaciones existentes fueron detectadas,
pero el evaluador confirmó tres defectos P2 (severidad media). No encontró
defectos adicionales confirmados en denominador fijo, referencias inconclusas,
intentos predefinidos, imprescindibles o carril separado de guardas.

## Hallazgos confirmados y correcciones

| ID | Defecto en 698e88b | Reproducción sintética | Corrección y evidencia |
| --- | --- | --- | --- |
| IR-01 | `rubric.py` comprobaba lote/período antes de la fuga de una guarda | Guarda con partes numéricas y scope correcto: crítico; cambiando solo el lote: parcial/no crítico | Detectar partes devueltas bajo guarda antes de comprobar scope. Regresión para lote y período incorrectos; mutación que elimina la prioridad detectada por aserción |
| IR-02 | El oráculo SQL verificaba el total y constantes locales, pero no todos los subgrupos del fixture | Cambiar grupos a 100 y -98.25 conservando total 1.75 permitía que los 26 tests pasaran y la rúbrica aceptara esas partes | Contrastar cada subgrupo declarado con el resultado agrupado de SQL separado. Nueva mutación de cifras compensadas detectada por aserción |
| IR-03 | `scope.lote.kind` se usaba en un set antes de comprobar su tipo | Una lista o diccionario JSON causaba TypeError y abortaba al llamador | Validar string antes de pertenencia. Listas/diccionarios malformados devuelven failed/crítico, sin lanzar excepción |

Antes del fix, las dos regresiones ejecutadas produjeron dos fallos de aserción
(lote/período) y cuatro errores TypeError. El segundo evaluador había demostrado
por separado que la corrupción compensada de subgrupos superaba la batería
anterior. No se cambiaron cifras del fixture válido ni el scorer en este cierre.

Solo se modificaron `rubric.py`, `test_rubric.py` y `mutation_review.py`, además
de documentación. No se incorporaron mejoras opcionales ni cambios al runtime.

## Segunda pasada independiente

Tras corregir, el mismo evaluador revisó el diff completo de esos tres archivos
contra 698e88b, repitió las reproducciones originales y volvió a ejecutar:

```sh
python3 -m unittest discover -s scripts/esco2-evaluation -p 'test_*.py' -v
python3 scripts/esco2-evaluation/mutation_review.py
```

Resultado repetido por integrador y evaluador: **28/28 tests aprobados y 10/10
mutaciones detectadas por aserciones, sin errores de importación/ejecución**.
El evaluador confirmó el cierre de IR-01, IR-02 e IR-03 y no identificó defectos
remanentes en el diff. La revisión de otro agente solicitada queda completada.

## Límites y siguiente paso

- La asignación de grupos SQL a partes está especializada al fixture actual.
  Generalizarla es opcional y no se hizo en esta corrección.
- El scorer comprueba etiquetas de linaje; no descubre conexiones semánticas.
  La construcción correcta de los componentes sigue siendo trabajo del inventario.
- Campos prohibidos se validan estructuralmente, sin garantizar detección de
  datos sensibles en cualquier texto permitido. No acredita RLS/JWT o permisos.
- Continuidad verifica fixtures por turno; no prueba memoria ni planificación real.
- Revisión de controles sintéticos no equivale a aceptación de Esco. El scorer
  mantiene `product_accepted=False`.
- Original no materializado y snapshot bloqueado por aislamiento/retención
  siguen impidiendo cerrar E2-02/E2-18. No se reintentó ninguna transferencia.

No hay datos reales, cambios productivos, PR, push, despliegue ni nueva carga de
código en proveedores. El tracker recibe únicamente resumen de revisión y límites.
