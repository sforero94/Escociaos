# Memoria — Bug Triage

Escrita solo por el orquestador (ver `README.md`). Inyectada completa en el
prompt del agente en cada corrida.

## Estados aceptados
- **El guard `onWheel` de los inputs numericos ya esta enforced** por
  `src/__tests__/numberInputWheelContract.test.ts` (PR #98): el primitivo
  `components/ui/input.tsx` lo aplica cuando `type === 'number'` y los `<input>`
  nativos lo llevan en el tag. Si reaparece un input numerico sin guard, el test
  falla — no hace falta re-auditar a mano. **Falso positivo conocido**:
  `hato/components/ChequeoDiffReview.tsx:151` tiene la cadena `type="number"` dentro
  de un comentario que explica que la evitaron a proposito; el test strippea
  comentarios. [corrida: 2026-08-03-lunes]
- **`fn_clima_rollup_diario` (068) escribe `lluvia_total_mm = NULL` cuando marca
  `contador_congelado`**, a diferencia del backfill historico que conserva el valor.
  Consecuencia: un dia marcado NO se puede auditar despues de que `clima_lecturas`
  se pode a las 24h. Si hay que investigar uno, capturar
  `lluvia_diaria_actualizada_en` EN VIVO. [corrida: 2026-08-03-lunes]

## Refutaciones
| Fingerprint | Afirmacion | Por que murio | Corrida |
|---|---|---|---|
| bug-triage/tailwind/min-h-0-muerto | `min-h-0` esta muerta en el build congelado de Tailwind | Refutada: `globals.css:281` la define y esa hoja carga despues de index.css. El comentario del test quedo desactualizado. | 2026-07-31-dryrun-lunes |
| bug-triage/inputs/wheel-guard-es-P1 | El guard `onWheel` ausente es P1 porque los usuarios estan guardando numeros equivocados | El DEFECTO sobrevive pero la SEVERIDAD murio (P1→P2). Cero rastro de que haya ocurrido nunca: 0 de 4.176 monitoreos violan afectados<=monitoreados, y `arboles_monitoreados` es valor de protocolo fijo 35 en 3.969 de 4.176 filas **sin un solo 34 ni 36** — es el unico campo donde una deriva de ±1 seria legible. Los denominadores raros (9, 12) tienen todos `created_at` = el instante exacto de la importacion masiva del 2025-11-25. Ademas la narrativa estaba inflada: `DailyMovementForm` NO esta en un dialogo (es pagina completa), y el evento wheel apunta al elemento bajo el CURSOR, no al enfocado, asi que solo dispara si el puntero sigue sobre el campo recien digitado. Conteo real 91 de 120, no 92 de 121. | 2026-08-03-lunes |

## Navegacion
- **`BUG_REPORT.md` fue re-verificado y REESCRITO (PR #101).** Estado del archivo:
  issues 1/2/4/5 cerrados y 6 no reproducible, todos con evidencia embebida. Lo unico
  abierto es el **issue 3b** (inventario consumido valorado en $0,
  `fetchDatosReporteSemanal.ts:511-522`) — requiere decision del dueno. **NO
  re-verificar 1/2/4/5/6 desde cero**; la evidencia esta en el propio archivo. El
  issue 3 original ("costo_estimado NULL") quedo cerrado con datos: corte limpio, 0
  filas malas en aplicaciones creadas desde 2026-04. [corrida: 2026-08-03-lunes]
- Los logs de postgres durante una corrida contienen los ERROR de las consultas
  exploratorias fallidas de los propios agentes del barrido. Cotejar timestamps
  contra la ventana de la corrida antes de reportar errores de BD como errores de la app.
- **`npm ci` puede adelantarse al filesystem**: un `npm test` inmediatamente despues
  fallo con ENOENT en `node_modules/picomatch/index.js`. Re-ejecutar, no diagnosticar.
  [corrida: 2026-08-03-lunes]

## Baselines
| Metrica | Valor | Corrida |
|---|---|---|
| main@7c232f6 verde | npm test 72 archivos / 1.725 tests · lint 0 errores (1.031 warnings preexistentes: 715 no-explicit-any, 195 no-unused-vars, 86 exhaustive-deps, 35 react-compiler) · tsc --noEmit limpio | 2026-08-03-lunes |
| Efecto de los PRs abiertos | Si mergea #99: lint baja a 943 warnings. Si mergea #100: tests suben a 73 archivos / 1.742. Si mergea #98: 73 / 1.728 | 2026-08-03-lunes |

## Archivo
(vacio)
