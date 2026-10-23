# Revisión previa de la prueba de corrección de ventas

23 de octubre de 2026. Registro de la revisión offline previa: durante esa revisión no se ejecutó otro replay ni se inició PostgreSQL. Después se ejecutó una única continuación con las fuentes revisadas y pasó la validación local completa. El resultado posterior está en `financial-sale-correction-handoff.md` y `financial-sale-correction-replay.json`.

## Qué se corrigió

- La expresión que extrae el ingreso JSONB se agrupa antes de restar claves. El parser detecta la resta incorrecta en la versión anterior y acepta la corrección.
- Cinco comprobaciones de éxito usan `IS DISTINCT FROM`: un estado, monto o actor ausente ahora hace fallar la prueba en lugar de producir un NULL que PL/pgSQL podría aceptar.
- El fixture modifica los ocho campos financieros autorizados, con referencias sintéticas activas y coherentes. La prueba compara tanto el plan como una lectura independiente de la fila con los ocho valores deseados. Conserva la comprobación de todos los demás campos. Antes, seis omisiones podían pasar porque esos valores no cambiaban.
- El runner nativo atiende rechazos antes de esperar el bloqueo, registra cada cliente antes de conectar e intenta cerrar todos los clientes aunque otro falle. Conserva los errores originales y los de limpieza. Las carreras reales siguen pendientes.
- El informe final ya no hereda la afirmación de que candidatos y permisos no cambiaron: diferencia la incorporación del candidato62 de la conservación de las fuentes de aplicación y permisos de tabla/columna existentes.
- El ejecutor externo conserva el arreglo del registro concurrente y sus marcadores de intento único. El límite de 120s sigue restringido al cliente SQL de este replay; los demás límites siguen iguales.

## Qué se verificó

Implementador, QA independiente y agente principal ejecutaron las comprobaciones en serie. El agente principal repitió la versión final:

| Control | Resultado |
| --- | --- |
| Ocho scripts offline consolidados | PASS |
| Gramática SQL y expresiones PL/pgSQL de probe, candidato y fixture nativo | PASS |
| Detección de las ocho omisiones de escritura y ocho omisiones del plan en modelo AST | PASS |
| Cinco comprobaciones de éxito estrictas ante campos faltantes | PASS |
| Coordinación del runner real con SQL y proceso nativo simulados | PASS |
| Informe real con ejecución heredada simulada | PASS |
| Cliente nativo real con cliente pg falso: éxito y cinco fallos de conexión, transporte, observación de bloqueo o cierre | PASS |
| Registro de 16 consultas idénticas concurrentes simuladas | PASS |
| Generador completo reproduce exactamente el candidato, sin escribirlo | PASS |
| Sintaxis Node y preflight de rutas/versiones en macOS | PASS |
| Las 539 fuentes anteriores y los 6 snapshots aprobados conservan sus hashes | PASS |
| Candidato y generador conservan los bytes del paquete | PASS |
| Sin directorios de PostgreSQL temporal; dos marcadores anteriores conservados | PASS |

Las huellas de los cinco archivos están en `financial-sale-correction-preflight.json`. El log del agente principal está fuera de Git en `/private/tmp/escocia-handoff-control/root-sale-offline-audit.log`. La reproducción local de las ocho comprobaciones es `python3 /private/tmp/escocia-handoff-control/run-sale-offline-audit.py`; requiere los scripts auxiliares y pglast 7.18 preparados en este Mac. Es una revisión auxiliar local, no una suite portable ni una certificación del protocolo.

## Qué sigue sin demostrar

El parser no resuelve tipos ni permisos del catálogo real. Para analizar la gramática se sustituyeron declaraciones de tipos compuestos por `record` solo en una copia en memoria. Los modelos y mocks no ejecutan escrituras, triggers, RLS ni bloqueos reales.

Sigue pendiente el replay completo del grafo 62 con las fuentes congeladas y, tras su éxito, lint, typecheck, Python y App en serie. No se certificó producción ni se cerraron los frentes de llamadores SDK/navegador, retiro de escritores, finanzas generales/compartidas o ganado acoplado.

La revisión elimina fallos concretos y comprueba que las pruebas pueden detectar ciertas implementaciones incorrectas. No garantiza que la integración real pase. Los dos intentos autorizados ya se consumieron y no se inició uno nuevo durante esta revisión.
