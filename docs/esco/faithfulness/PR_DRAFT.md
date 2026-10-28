# Proposed draft PR — publication blocked

Title: test(esco): aislar controles numéricos y de fechas sin runtime
Base: main
Head: codex/esco-faithfulness-eval-anchors
State requested: draft

Automatic approval review denied PR publication. This file is review text only.

El arnés de Faithfulness está mezclado con cambios del runtime y su rama quedó 37 commits detrás de main. Este primer alcance extrae únicamente el lector numérico/de fechas y sus 13 pruebas sintéticas, idénticos a la fuente. Permite revisar los controles de formato antes del resto del evaluador. No tiene importadores de producción ni conexiones externas.

Base: `ad5455ffa371d847191f92c7f7dbdc3404628046` (PR #356).
Fuente preservada: `3d3e65454d8d2f78971593f1fe90a0514ce22301`, `codex/esco-faithfulness-plan`.
Commit candidato: `16e95e342620b7412d6614493c9e66ddc00c8f6a`.

Incluye comando `eval:esco:check`, tracker conservado con estados históricos delimitados e integración por alcances en `docs/esco/faithfulness/INTEGRATION.md`. Los helpers comprueban presencia de números/fechas; no validan soporte de afirmaciones ni calidad del modelo.

Validación previa al commit: 13 pruebas sintéticas; 232 regresiones de alertas/F1/paridad; tipos, lint (0 errores, 907 advertencias en archivos sin cambios), build y diff whitespace pasan. Verificación del commit final `16e95e342620b7412d6614493c9e66ddc00c8f6a`: `npm run eval:esco:check` pasó (tipos, lint enfocado, 13 tests); `npm run lint` pasó (0 errores, 907 advertencias); `npm run build` pasó; `npm test` pasó (212 archivos, 4678 pruebas, cero skips). `git diff --check HEAD^ HEAD` pasó. CI pendiente. No pruebas privadas ni llamadas pagadas.

Recomendación: revisar y mezclar solo este alcance después de verificar el commit final y CI. Revertir este PR basta para rollback; no cambia esquemas, historial almacenado ni tráfico. Detener aquí para revisión; P1-02 y el siguiente alcance no comenzaron.

Sin despliegue, migración, telemetry ni activación. PR #356 informa migración 186 sin aplicar y despliegue edge pendiente; este PR no los ejecuta ni afirma que estén activos. QA vivo Web/Telegram no aplica al helper; antes de un futuro release del runtime requiere verificación autorizada de ambos canales y de alertas/F1. Calibración privada bloqueada por autorización de divulgación a OpenRouter; el presupuesto de $1 no la sustituye.
