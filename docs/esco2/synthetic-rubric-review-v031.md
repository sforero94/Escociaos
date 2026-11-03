# E2-02 — rúbrica sintética y revisión discriminante v0.3.1

Fecha: 2026-11-03. Base: `beb5151`. Cambios exclusivamente locales en
`scripts/esco2-evaluation/` y esta documentación. Sin importación al producto,
sin red, proveedores, datos reales, original reconstruido, reserva ni held-out.

## Trazabilidad y alcance

| Requisito v0.3 | Fixture/control | Evidencia discriminante |
| --- | --- | --- |
| Lote nulo incluido y total reconciliado | `SYN-NULL-GROUP`; `test_null_group_is_required_not_optional_detail` | Omitir el grupo sin lote falla aunque el total sea correcto; cambiar su asignación rompe el oráculo SQL |
| Sin lote distinto de todos los lotes | `test_unassigned_scope_cannot_mean_all_lots` | El mismo número con scope `all` no pasa una solicitud `unassigned` |
| Continuidad con cambio de entidad | `SYN-CONT-A-OCT` → `SYN-CONT-B-OCT` | Cambiar a B conserva octubre; contexto que arrastra A falla |
| Continuidad con cambio de período | `SYN-CONT-B-OCT` → `SYN-CONT-B-NOV` | Cambiar a noviembre conserva B; período o número anterior falla |
| Propiedad/contexto | `test_continuity_rejects_stale_entity_period_or_conversation` | ID de conversación distinto se marca crítico en esta rúbrica; no acredita el gate real del servidor |
| Campos prohibidos | `test_prohibited_fields_are_critical_at_every_level` | Campo de salario, trabajador, notas o credencial en raíz/scope/parte falla; el veredicto no reproduce su valor |
| Dependencia bloqueada | `SYN-DEPENDENCY`; `test_dependency_blocked_does_not_become_expected_guard` | La caída de fuente permanece como bloqueado, 0/1 respondibles, sin entrar al carril de guardas |
| Rechazo esperado | `SYN-FORBIDDEN-GUARD` | Requiere denegación con código previsto y sin datos; no aumenta el numerador de respondibles |
| Fidelidad completa | `test_exact_number_with_wrong_unit_or_incomplete_coverage_fails` | Número correcto con unidad equivocada o cobertura parcial no pasa |
| Denominador fijo | `test_missing_blocked_and_partial_remain_in_denominator` | Cuatro respondibles conservan denominador 4 aunque falte un resultado; bloqueados y parciales no suman |
| Referencia inconclusa | `test_inconclusive_reference_blocks_even_at_threshold_without_mandatory` | Incluso con 90% y sin imprescindible fallido, una referencia inconclusa bloquea el gate |
| Imprescindibles/repeticiones | Tests de promedio alto e intentos predefinidos | Un imprescindible fallido o un intento parcial no se oculta por promedio ni por mejor repetición |

`rubric-v03.json` contiene seis entradas inventadas. Los tres turnos de
continuidad comparten `SYN-GROUP-CONT`; no se presentan como tres escenarios
independientes. Es un control de conversación en el evaluador, no una prueba de
que el planificador o la memoria real produzcan ese contexto.

## Independencia de referencias y revisión

Los valores congelados de la rúbrica se comprueban con consultas SQLite
separadas sobre `synthetic.sql`; `rubric.py` compara respuestas estructuradas y
no llama al lector de producto ni calcula las referencias. `score.py` agrega
veredictos, conservando el denominador. Ninguno declara aceptación del producto.

La revisión encontró dos defectos en el scorer local previo:

1. Python trataba `true` y `1.0` como el intento entero 1 al buscar una tupla.
2. Los metadatos de adjudicación admitían espacios, listas, objetos o booleanos.

Antes de la corrección, las dos pruebas nuevas fallaron en seis subcasos.
Ahora se exige entero positivo estricto para el intento y texto no vacío para
revisor y versión. No se modificó el harness ni el runtime de Esco.

Se ejecutó también una revisión por mutación en directorios temporales: ocho
copias con defectos deliberados, una alteración por copia, sin modificar las
fuentes originales. La versión válida pasó; las ocho variantes fallaron por
aserciones, sin errores de importación o ejecución que falseen la detección:

- denominador basado solo en éxitos;
- escoger la mejor repetición;
- ignorar imprescindibles;
- ignorar referencias inconclusas;
- perder el grupo de lote nulo;
- aceptar entidad/período anteriores;
- permitir partes solicitadas ausentes;
- admitir campos prohibidos.

Esto es independencia de oráculos y defectos inyectados. No se presenta como
revisión realizada por otra persona/agente. Una revisión externa de código y
la adjudicación independiente de la campaña real siguen pendientes.

## Validación ejecutada

```sh
python3 -m unittest discover -s scripts/esco2-evaluation -p 'test_*.py' -v
python3 scripts/esco2-evaluation/mutation_review.py
```

Resultado: **26 tests aprobados; 8/8 defectos deliberados detectados**.
Los 13 controles iniciales están incluidos en los 26, no son una campaña adicional.
El recuento de tests no mide calidad funcional ni cobertura del golden real.

Seguimiento: se completó después una revisión por otro agente de 698e88b;
confirmó y cerró tres defectos adicionales, con 28 tests y 10 mutaciones.
Detalle y límites: [revisión independiente](independent-review-698e88b.md).

## Límites y entrega

La rúbrica cerrada valida campos/estructura y claims tipados de estas fixtures.
No detecta toda información personal posible dentro de cualquier texto libre,
ni sustituye revisión de nombres de tareas. No prueba autorización efectiva,
RLS/JWT, identidad de usuario, planificación real, llamadas de modelo, integración
web, Postgres ni regresión de captura. Un caso sintético que devuelve cero en
un universo vacío acreditado no autoriza convertir lluvia/leche faltante en cero.

E2-02 continúa bloqueado para su cierre por materialización del original y
recalificación de referencias sobre snapshot. E2-18 conserva su bloqueo de
aislamiento y retención. No se reemplaza el paquete adjunto previamente autorizado
ni se publican los cambios nuevos en un proveedor; el tracker recibe solo resumen
de evidencia y límites. No hay PR, push ni despliegue.
