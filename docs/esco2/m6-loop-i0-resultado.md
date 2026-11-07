# Esco 2.0 · Iteración 0 del loop M6

Fecha: 2026-11-07. Base `c85ce43b` de #451; rama apilada `codex/m6-loop-iteracion-0`. Candidato de desarrollo para revisión. No hay una nueva aceptación M6 ni un resultado SOMBRA/HO pagado.

## Cambios y límites

| Hallazgo | Corrección del candidato | Evidencia requerida |
|---|---|---|
| F1 | Normalización local de intención y plan contra catálogos visibles; nombres e IDs equivalentes, aclaración ante identidad incierta | Positivos HTTP, ambigüedad, catálogo no leído, filtros contradictorios y D26 |
| F2 | Un reintento del extractor por código cerrado; dos extracciones y dos planes como máximo | Reparación positiva, segundo fallo, transporte incierto y recibos registrados |
| F3 | Se retira la afirmación de sustento semántico de una cita por sus offsets | Intervalo formalmente válido no acredita significado |
| F4 | Cortes de historial en espacios seguros; cifras Unicode y pares UTF-16 completos | RED de cabeza/cola y positivos HTTP con separadores Unicode |
| F5 | Seguimientos con población efectiva previa, token y nueva validación de visibilidad | Misma selección con token; aclaración sin token/vencido/parcial; expansión rechazada |
| F6 | Guardas de despliegue para ambas ramas de revisión | Justificación expresa en PR; publicación no autoriza deploy |
| F7 | Medición real queda a cargo de B en primera campaña | Costo/turno y p50/p95 pendientes; no se infieren desde tests |

Los cambios visibles al modelo son candidatos pendientes de comparación pareada por B contra `c85ce43b`: tres repeticiones DEV y muestra SOMBRA. Las pruebas simuladas no prueban una mejora del modelo real.

## Verificación del coordinador

El coordinador repitió sobre el runtime final:

| Verificación | Resultado |
|---|---|
| Suite completa | 8.630/8.630 pruebas, 417 archivos; incluye regresiones M4/M5/M6 |
| Controles nuevos de I0 | 54/54 en ocho archivos: backend 19, QA 31 y coordinador cuatro |
| Tipos | `npm run typecheck`, aprobado |
| Lint | Cero errores; 907 avisos existentes, sin avisos nuevos |
| Build | `npm run build`, aprobado |
| Replay DEV HTTP | 22 escenarios, 72 slots; 72/72 HTTP 200, cero excepciones, cero inferencias nuevas |
| Igualdad del replay con histórico | 63/72 resultados, 69/72 coberturas y 60/72 textos; no es tasa de acierto |
| Integridad de cambios | `git diff --check`, aprobado |

Huella del grafo público de runtime, 73 archivos:
`46dbcb70ad617bb9ac26fffd38f023e990db836cd9400c4e516e49a093839eb2`.
El arnés usa Node 24.14.1 con `--experimental-transform-types`; el modo de solo
eliminación de tipos falló al cargar una propiedad de constructor TypeScript antes
de ejecutar turnos. Se corrigió la configuración del arnés, no un dato ni un oráculo.

El replay HTTP utiliza únicamente el DEV autorizado, captura fija y respuestas históricas. Su modo de intención es legado explícitamente no certificado: no inventa una extracción a partir de la referencia. Comparar con el histórico mide identidad del replay, no tasa de acierto, exactitud del extractor nuevo ni aceptación.

## Custodia, campaña y presupuesto

B construye SOMBRA en un chat independiente, sin acceder al HO; A no abre sus casos, referencias ni trazas. Agregados comunicados durante construcción: 50 escenarios, diez por dominio; 162 turnos-intento para tres repeticiones; mezcla 43 respondibles, cuatro parciales, dos aclaraciones y un rechazo. Captura privada mediante SELECT con Composio, 28 relaciones y 204 columnas. Esos conteos no significan que la campaña se haya ejecutado ni puntuado.

La primera consulta de esquema fue rechazada por la revisión automática al faltar la cuenta explícita. No se ejecutó aquella lectura. B corrigió el parámetro por la misma vía D-L2 autorizada.

La cota completa excede el límite D-L1 de USD 0,40 por iteración. B debe presentar el importe verificable y detener la inferencia hasta la decisión de Santiago. Costo nuevo de inferencia: **USD 0**. El presupuesto total aprobado sigue siendo USD 3,00; la puerta final requiere aprobación aparte. D-L3 solo bloquea la aceptación final.

El protocolo y los criterios congelados están en [m6-loop-protocolo.md](m6-loop-protocolo.md); los contratos técnicos, en [m6-loop-arquitectura.md](m6-loop-arquitectura.md); los oráculos y la pista independiente de QA de implementación, en [m6-loop-i0-qa.md](m6-loop-i0-qa.md).

Sin fusión, deploy, migraciones, cambios de secretos ni escrituras productivas. No se modifica legado ni Telegram; M7 y piloto siguen fuera de alcance.
