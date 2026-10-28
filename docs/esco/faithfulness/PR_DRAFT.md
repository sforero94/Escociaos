# Proposed I03-a draft — publication approval pending

Title: test(esco): aislar validación y selección de entradas offline
Base: main
Head: codex/esco-faithfulness-eval-input
Requested state: draft only after explicit publication approval

I03 requiere separar el input puro del runner y sus dependencias de runtime.
Este alcance integra solo el adaptador JSONL: validación de forma/campos anidados,
selección y variantes; y conversión de fecha explícita de evidencia en Bogotá.
No incorpora CLI, lectura de archivos/entorno/credenciales, runner, proveedor,
mensajes de canal, fixture pack ni runtime. El adaptador recibe texto del llamador.

Base: merge I02 `6a2dd50bea966f733d6ef42b15bf1346ca77d6dc` (PR #358).
Fuente preservada: `3d3e65454d8d2f78971593f1fe90a0514ce22301`.
Head candidato y checks finales: ver handoff exacto; no se presume un check pendiente.
I01/I02 están merged: CI exactos 40759015461 y 40765357918 en success.
Esos resultados son históricos, no validación de I03-a.

La validación no omite filas defectuosas ni corrige/promueve etiquetas. Rechaza
fechas imposibles, campos anidados incompletos, flags coercibles y filtros inválidos;
conserva null explícito, respuestas originales vacías y estado histórico desconocido.
Una selección sin coincidencias queda vacía: no hay fallback al conjunto completo.
La forma válida no demuestra verdad, autenticidad ni autorización de datos.

Proveniencia: lógica del adaptador fuente y seis tests de fábrica sintética;
se excluyen tests que leen JSONL privado, sus imports I/O y el scenario pack.
Los nuevos controles usan solo `casoBase` sintético. No lectura de archivos privados.
Las regresiones reprodujeron 22 fallos antes de corregirlos. Antes del commit:
53 tests de input / 145 tests conjuntos del evaluador pasan, cero skips.
El check existente `eval:esco:check` cubre estos módulos; no cambia el guard de fechas.

Puntaje v1.1 y adjudicación hash-gated permanecen intactos; no comparar v1/v1.1
sin recomputar bajo el mismo contrato. El runner y el cálculo de hash de entrada
se diseñarán en otro alcance; este PR no afirma tener un runner funcional.

Recomendación: revisión independiente y autorización explícita antes de publicar,
CI antes de considerar merge. Rollback: revert normal, sin esquema/datos/tráfico.
No producción, QA vivo, proveedores, gasto, telemetría, migración 186 ni despliegue.
I03 restante, I04 y P1-02 permanecen fuera de este trabajo.
