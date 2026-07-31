# Memoria — Bug Triage

Escrita solo por el orquestador (ver `README.md`). Inyectada completa en el
prompt del agente en cada corrida.

## Estados aceptados
(vacio)

## Refutaciones
| Fingerprint | Afirmacion | Por que murio | Corrida |
|---|---|---|---|
| bug-triage/tailwind/min-h-0-muerto | `min-h-0` esta muerta en el build congelado de Tailwind (comentario en hatoCorreccionChequeoTailwind.test.ts, 17 usos) | Refutada: `globals.css:281` la define y esa hoja carga despues de index.css — la clase funciona. El comentario del test quedo desactualizado. | 2026-07-31-dryrun-lunes |


## Navegacion
- `BUG_REPORT.md` en la raiz del repo es el tracker activo — leerlo antes de reportar; algo ya listado ahi se actualiza, no se re-descubre. [seed 2026-07-31]
- `BUG_REPORT.md` re-verificado contra main@3dfe87e: issues 1/2/4/5 FIXED con evidencia (generar-reporte-semanal.tsx:382-391, :932-944, :2085; pg_policies reportes_semanales; vista_tareas_resumen poblada; reportes guardados hasta S30). Issue 3 (costos apps planificadas) SIGUE sin verificar — requiere generar un reporte end-to-end. No re-verificar 1/2/4/5 desde cero. [corrida: 2026-07-31-dryrun-lunes]
- Los logs de postgres durante una corrida contienen los ERROR de las consultas exploratorias fallidas de los propios agentes del barrido. Cotejar timestamps contra la ventana de la corrida antes de reportar errores de BD como errores de la app. [corrida: 2026-07-31-dryrun-lunes]


## Baselines
| Metrica | Valor | Corrida |
|---|---|---|
| main@3dfe87e verde | npm test 72 archivos / 1.725 tests · lint 0 errores (1.031 warnings preexistentes, casi todos no-explicit-any) · tsc --noEmit limpio | 2026-07-31-dryrun-lunes |


## Archivo
(vacio)
