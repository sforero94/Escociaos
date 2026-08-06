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
- **`hato_alertas_config.destinatario_telegram_id` YA NO esta en NULL**: los 5 tipos
  apuntan a un destinatario y `activo=true`, `horas_escalamiento=48`. El "LAZO
  ABIERTO" documentado en `src/components/hato/CLAUDE.md:105` quedo **obsoleto** —
  corregir esa nota cuando se toque el modulo. El motor genera y envia (39 escaladas
  + 1 respondida; el tick devolvio 200 hoy). Lo que queda es un hueco de
  MANTENIBILIDAD, no operativo: no hay UI (`grep hato_alertas_config` en
  `src/components/` = 0), se configuro por SQL contra produccion.
  [corrida: 2026-08-06-jueves]
- **Los dos arboles de edge function difieren SOLO en el comentario de cabecera con
  la ruta y en espacios** — con `tail -n +2` + `diff -w` la diferencia es CERO
  archivos. La unica diferencia estructural es el par de nombres `index.tsx` /
  `index.ts`, cuyos cuerpos son identicos byte a byte. **No reportarlo como
  desincronizacion.** [corrida: 2026-08-06-jueves]

## Refutaciones
| Fingerprint | Afirmacion | Por que murio | Corrida |
|---|---|---|---|
| bug-triage/finanzas/dashboard-omite-2026 | El tablero de Finanzas omite TODO 2026 por el tope de 1.000 filas de PostgREST | Refutada en el MECANISMO, confirmada en el defecto. Solo hay **594** gastos Confirmado de 2026 — por debajo del tope, asi que una consulta acotada a 2026 NO se trunca. Quien se trunca es la ventana de 2 anos de `getGastosPorTrimestreMultiSerie` (`useDashboardData.ts:145-155`, 1.750 filas): se pierden **229 de 2026 Y 521 de 2025**, repartidas por orden fisico del heap porque **no hay `.order()`** — asi que el error no deja hueco visible y ni siquiera es determinista. Impacto real **$1.444M de $3.239M (44,6%)**. **NO verificar el arreglo con "ya aparece 2026"** — verificar contra `sum(valor) = 3.238.535.771,87`. Re-confirmado por el orquestador con SQL directo. | 2026-08-06-jueves |
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

- **El guard `hatoFechaLocalGuard.test.ts` (PR #105) solo matchea el literal
  `new Date().toISOString()`; NO ve `now.toISOString()` con `const now = new Date()`.**
  Sale VERDE con 25 instancias vivas en 11 archivos. **Antes de dar por cerrado
  cualquier tema de fecha-local, reescanear admitiendo identificador ligado — no
  confiar en que el test este verde.** Es el segundo modo de falla del mismo guard
  (antes solo miraba `.slice(0,10)`). [corrida: 2026-08-06-jueves]
- `src/utils/fechas.ts` ya tiene los dos helpers: `obtenerFechaHoy()` para "hoy" y
  **`fechaAISODate(d)` (linea 69)** para cualquier Date derivada. No escribir uno
  nuevo. Ojo al migrar: una Date construida como `new Date(y, m, d)` es medianoche
  LOCAL y en UTC-5 ya da el dia correcto — ahi el cambio es neutro; las que arrastran
  hora de pared (`new Date()` ± N dias) son las que si cambian de valor.
  [corrida: 2026-08-06-jueves]
- **`registros_trabajo.costo_jornal` esta poblado 2.550/2.550** ($160.014.584, desde
  2025-10-16) y es el costo historico CORRECTO, consumido por `calculosCostoKg.ts` y
  `fetchDatosReporteSemanal.ts:337`. **`chat.tsx` lo IGNORA y recalcula con la nomina
  de hoy** (`chat.tsx:690` hace join en vivo, `:728` lo aplica sin mirar
  `fecha_trabajo`). Esa es la asimetria, no una diferencia de redondeo.
  [corrida: 2026-08-06-jueves]
- `supabase/config.toml` fija `verify_jwt = false` para TODA la funcion
  `make-server-1ccce916`: **cualquier ruta sin gate propio es realmente anonima.**
  [corrida: 2026-08-06-jueves]
- El roster del chequeo es `etapa='vaca' AND estado='activa'` = **35**, no las 80
  filas con `estado='activa'` (incluyen 36 novillas + 9 terneras). Un conteo de
  activas ~80 NO es senal de bug en la captura. [corrida: 2026-08-06-jueves]

## Baselines
| Metrica | Valor | Corrida |
|---|---|---|
| main@d797b3f verde | npm test **74 archivos / 1.754 tests** · lint 0 errores / **943 warnings** · tsc --noEmit limpio. Coincide EXACTO con lo predicho el lunes para #98+#99+#100. Todos los guards de paridad en verde (reportesFinancieros, priorizacionScouting, hatoAlertasParidadServidor, dialogScrollContract, numberInputWheelContract) | 2026-08-06-jueves |
| main@7c232f6 (anterior) | npm test 72 archivos / 1.725 tests · lint 1.031 warnings · tsc limpio | 2026-08-03-lunes |

## Archivo
(vacio)
