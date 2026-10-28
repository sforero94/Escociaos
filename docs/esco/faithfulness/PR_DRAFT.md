# Proposed I02 draft — publication not yet authorized

Title: test(esco): aislar puntaje, medición e informes offline
Base: main
Head: codex/esco-faithfulness-eval-scoring
Requested state: draft, only after explicit publication approval

El evaluador acumulado mezcla lógica de puntaje con transportes y runtime.
Este alcance integra solo contratos tipados, puntaje determinista, prompt/parser
puro del juez, combinación de veredictos, medición/informes y adjudicación inmutable.
No importa runner, proveedor, fixtures de replay, runtime ni datos privados.

Base: merge I01 `23d607648c35e0848c138efec6f976ad7e1dfdad` (PR #357).
Fuente preservada: `3d3e65454d8d2f78971593f1fe90a0514ce22301`.
Candidato: consultar HEAD de esta rama; el handoff registra el SHA exacto y los
checks finales. Los resultados históricos de I01 no son validación de I02.

La revisión reprodujo y corrigió veredictos coercibles, capas ausentes/malformadas,
revisión sin atribución, afirmaciones sin soporte que podían contar como éxito,
y adjudicación sin hash, con evidencia mutable compartida o sin snapshot esperado.
Los grupos del informe también cuentan correctamente etiquetas con nombres heredados de Object.
Medición v1.1 conserva denominadores y distingue los nuevos controles de v1.
No cambia etiquetas originales ni decisiones D01. La extracción numérica/de fechas
conserva las correcciones I01; presencia de un token no demuestra soporte factual.

Validación enfocada previa al commit: 77 pruebas sintéticas pasan, cero skips.
Checks del head final: ver respuesta de handoff; no se presume un check no ejecutado.
Los dos tests HTTP de `llamarJuez` permanecen fuera del alcance junto con esa función.
No se leyó JSONL privado ni se llamó a proveedores. CI requiere publicar el PR.

Recomendación: revisar I02 por separado; publicar solo con autorización explícita,
y considerar merge después de CI y revisión. Rollback: revert normal, sin datos,
esquema ni tráfico afectados. No despliegue, migración 186, activación ni QA vivo;
los cambios futuros del runtime requieren QA autorizado Web/Telegram y alertas/F1.
P1-02 y el siguiente alcance permanecen fuera de este trabajo.
