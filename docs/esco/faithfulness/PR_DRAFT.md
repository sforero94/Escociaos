# Proposed I03-b draft

Title: test(esco): reproducir mensajes Web y Telegram en evaluaciones offline
Base: main
Head: codex/esco-faithfulness-eval-messages
State: draft, morning queue only; no merge tonight

El adaptador fuente alteraba datos ausentes y no respetaba las ventanas reales
por canal. Este alcance construye mensajes desde filas cronológicas explícitas:
Web últimos 20; Telegram primeros 20, antes de expandir el contexto de herramientas.
Así el futuro evaluador no verá una historia distinta de la que recibe el agente.
No cambia el comportamiento de la app ni corrige la ventana actual de Telegram.

Base main: `6a2dd50bea966f733d6ef42b15bf1346ca77d6dc`.
Fuente preservada: `3d3e65454d8d2f78971593f1fe90a0514ce22301`.
Independiente de #359: usa solo tipos I02 ya merged; no importa su fecha/input.
Head exacto y checks finales: ver handoff/PR al publicar, no asumir checks pendientes.

Tres regresiones iniciales reprodujeron formato ausente en ambos canales y canal
inválido. Un reviewer QA/code-quality independiente detectó historia sin límite;
corregida mediante API de filas persistidas. Re-review: 23 tests pasan, sin nuevos
hallazgos. Cobertura sintética: 19/20/21 filas, evidencia excluida, expansión >20
mensajes, historial independiente, errores/desconocidos/truncación y protocolo inválido.
Los tests estáticos leen ambas copias locales; no ejecutan handlers ni hacen QA vivo.

El llamador mantiene filas crudas y aporta prompt base/orden de base de datos.
El futuro runner debe adaptarse a esta API, sin reconstruir metadata desde mensajes
LLM. No runner, CLI, proveedor, env/credenciales, fixtures privados, runtime,
producción, mensajes de bot, Notion, migración o despliegue. v1.1/adjudicación intactos;
no comparar contratos distintos sin recalcular.

Cola: #359 primero, luego este PR. No dependencia de código ni retarget; después de
merge #359, reconciliar los tres docs compartidos y repetir checks/CI del nuevo
head antes de merge. No force-push. #360 seguridad es independiente y no se toca.
Rollback: revert normal sin cambios de esquema/datos/tráfico.

One-liner: hace que las futuras pruebas offline reciban la misma ventana de
conversación que Web/Telegram, sin cambiar al agente en producción.
