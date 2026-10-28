# Proposed draft PR — I01 only

Title: test(esco): aislar controles numéricos y de fechas sin runtime
Base: main
Head: codex/esco-faithfulness-eval-anchors
State requested: draft

## Problema y alcance

La rama acumulada de Faithfulness mezcla evaluación con cambios del runtime y
quedó 37 commits detrás de main. Este primer alcance extrae únicamente el lector
numérico/de fechas y sus pruebas sintéticas. Permite revisar los controles de
formato antes del resto del evaluador. No tiene importadores de producción ni
conexiones externas. Incluye comando `eval:esco:check`, tracker conservado con
estados históricos delimitados y plan de integración por alcances.

La revisión independiente detectó y reprodujo dos defectos: `-$87,25` perdía el
signo y `12-ago-2025` coincidía con un ancla de 2026. El arreglo conserva el signo
monetario y exige coincidencia del año explícito con guion. Las 15 pruebas
sintéticas enfocadas pasan antes del commit. La extracción ambigua de `1.234`
conserva ambas interpretaciones; estos helpers comprueban presencia de tokens,
no soporte de afirmaciones, validez general del calendario ni calidad del modelo.

## Proveniencia y verificaciones

- Base main: `ad5455ffa371d847191f92c7f7dbdc3404628046` (PR #356).
- Fuente preservada: `3d3e65454d8d2f78971593f1fe90a0514ce22301`, rama `codex/esco-faithfulness-plan`.
- Implementación inicial: `16e95e342620b7412d6614493c9e66ddc00c8f6a`; handoff histórico: `f7ad0dae0df236771ddd7e18767f0e5343e0f8c5`. Ambos pasaron 13 pruebas enfocadas, 4678 pruebas completas, tipos, lint y build. Son resultados históricos anteriores al arreglo.
- Arreglo de los dos defectos y regresiones: `abb0ec5`. Reproducción: 2 fallos / 13 pases. Después del arreglo: 15 pases enfocados.
- Candidato de publicación: HEAD de esta rama después de este handoff documental. El cuerpo del PR registrará el SHA completo y los resultados ejecutados sobre ese head; este archivo no inventa verificaciones aún no ejecutadas.

## Revisión y rollback

Recomendación: mezclar solo I01 después de CI y revisión del padre/dueño. Revertir
este PR basta para rollback: no cambia esquemas, historial almacenado ni tráfico.
P1-02 y el siguiente alcance no comenzaron. QA vivo Web/Telegram no aplica al
helper; antes de un futuro release del runtime requiere verificación autorizada
de ambos canales y de alertas/F1.

No despliegue, migración, telemetría ni activación. PR #356 informa migración 186
sin aplicar y despliegue edge pendiente; este alcance no los ejecuta ni afirma
que estén activos. No datos privados ni llamadas pagadas. La calibración privada
sigue bloqueada por autorización de divulgación a OpenRouter.

La revisión automática rechazó antes crear el PR por falta de autorización de
publicación. El usuario autorizó abrir este draft el 2026-10-28 a las 19:55 UTC.
El padre transmitió esa autorización y pidió terminar estos arreglos antes de
publicar. Solo permite reintentar la creación del draft; no merge ni despliegue.
