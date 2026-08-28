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
- **El guard `hatoFechaLocalGuard.test.ts` ya no mira quien llama: prohibe el recorte de `toISOString()` en si** (PR #110), con `LISTA_BLANCA_UTC` **cerrada y contada** (archivo + numero de apariciones permitidas) y un segundo caso que falla si la lista se queda vieja. Los 23 sitios vivos migrados. Whitelisted a proposito: EventoTimeline.tsx (1), fetchDatosReporteSemanal.ts (3), TablaMonitoreos.tsx (2) — todos clase (c) UTC-coherente. **Ya no hace falta re-escanear a mano esta clase en codigo de navegador.** Sigue FUERA de alcance `src/supabase/functions/` (Deno en UTC, necesita conversion explicita a America/Bogota). [corrida: 2026-08-10-lunes]

## Refutaciones
| Fingerprint | Afirmacion | Por que murio | Corrida |
|---|---|---|---|
| bug-triage/finanzas/dashboard-omite-2026 | El tablero de Finanzas omite TODO 2026 por el tope de 1.000 filas de PostgREST | Refutada en el MECANISMO, confirmada en el defecto. Solo hay **594** gastos Confirmado de 2026 — por debajo del tope, asi que una consulta acotada a 2026 NO se trunca. Quien se trunca es la ventana de 2 anos de `getGastosPorTrimestreMultiSerie` (`useDashboardData.ts:145-155`, 1.750 filas): se pierden **229 de 2026 Y 521 de 2025**, repartidas por orden fisico del heap porque **no hay `.order()`** — asi que el error no deja hueco visible y ni siquiera es determinista. Impacto real **$1.444M de $3.239M (44,6%)**. **NO verificar el arreglo con "ya aparece 2026"** — verificar contra `sum(valor) = 3.238.535.771,87`. Re-confirmado por el orquestador con SQL directo. | 2026-08-06-jueves |
| bug-triage/tailwind/min-h-0-muerto | `min-h-0` esta muerta en el build congelado de Tailwind | Refutada: `globals.css:281` la define y esa hoja carga despues de index.css. El comentario del test quedo desactualizado. | 2026-07-31-dryrun-lunes |
| bug-triage/inputs/wheel-guard-es-P1 | El guard `onWheel` ausente es P1 porque los usuarios estan guardando numeros equivocados | El DEFECTO sobrevive pero la SEVERIDAD murio (P1→P2). Cero rastro de que haya ocurrido nunca: 0 de 4.176 monitoreos violan afectados<=monitoreados, y `arboles_monitoreados` es valor de protocolo fijo 35 en 3.969 de 4.176 filas **sin un solo 34 ni 36** — es el unico campo donde una deriva de ±1 seria legible. Los denominadores raros (9, 12) tienen todos `created_at` = el instante exacto de la importacion masiva del 2025-11-25. Ademas la narrativa estaba inflada: `DailyMovementForm` NO esta en un dialogo (es pagina completa), y el evento wheel apunta al elemento bajo el CURSOR, no al enfocado, asi que solo dispara si el puntero sigue sobre el campo recien digitado. Conteo real 91 de 120, no 92 de 121. | 2026-08-03-lunes |
| bug-triage/inventario/cinco-productos-saldo-sin-movimiento | "Cinco productos activos tienen un saldo que ningun movimiento explica (Sulcamag, Rafos, Borozinco, Integrador, TecniFeed Boro) y hay que repararlos con un Ajuste + UPDATE a productos" | **REFUTADO, y el remedio habria hecho daño real.** Los 5 son artefacto de reconciliar por suma firmada desde cero (ver la refutacion gemela en data-integrity). Rafos (+3.600), Borozinco (+320) e Integrador (+190) tienen `gap_ultimo` de exactamente 0,00: su "hueco" ES su saldo de apertura. El metodo ademas produce un FALSO NEGATIVO, Naturboro. La lista autoritativa es **3: Sulcamag, Naturboro, TecniFeed Boro**, y en los 3 `cantidad_actual` es CORRECTO y el libro es el huerfano. **Sulcamag es el caso critico invertido**: los 8.000 kg de la factura 4379 ya estan en inventario bajo **Silicalmag** (re-asignacion de producto del 2026-07-24, 2 minutos entre una operacion y otra), asi que el UPDATE propuesto habria fabricado **$5,36M de fertilizante inexistente** (~4% del valor del inventario). Ningun numero de inventario en pantalla esta mal hoy | 2026-08-10-lunes |

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
- **Al migrar fechas hay TRES clases, no dos.** (a) `new Date(y,m,d)` = medianoche LOCAL, cambio neutro en UTC-5. (b) las que arrastran hora de pared, que si cambian de valor. Y la tercera, la peligrosa: (c) **Dates parseadas en UTC** — `new Date('AAAA-MM-DD')` da medianoche UTC, y si la aritmetica y la lectura tambien son UTC el ida y vuelta se CANCELA: ahi `toISOString().slice(0,10)` es el lector CORRECTO y `fechaAISODate()` las corre un dia HACIA ATRAS. Sitios clase (c): `fetchDatosReporteSemanal.ts` (restarDias/enumerarFechas/histInicio), `EventoTimeline.tsx` (fechaCorteTimeline), `TablaMonitoreos.tsx`. **Verificar siempre como se construyo la Date antes de migrar.** [corrida: 2026-08-10-lunes]
- **Para auditar `productos.cantidad_actual` no sirve el desfase crudo ni la suma firmada**: 209 de 226 activos no cuadran, casi todos por saldo de apertura. Escritores legitimos del saldo (todos insertan su movimiento): NuevoMovimientoModal.tsx:154, NewPurchase.tsx:393, PurchaseHistory.tsx:344, CierreAplicacion.tsx:608 — ahora vigilados por `src/__tests__/productoStockSinMovimiento.test.ts`. [corrida: 2026-08-10-lunes]
- **El reporte semanal NO tiene cron**: `cron.job` solo lista `clima-sync-wu`, `clima-daily-rollup` y `hato-alertas-tick`. La migracion `019_auto_reporte_semanal.sql` solo agrega columnas. Una semana sin fila en `reportes_semanales` es cadencia humana, NO un defecto de infraestructura. [corrida: 2026-08-10-lunes]
- **`git -C <repo> worktree add ./ruta-relativa` crea el worktree DENTRO del checkout compartido** — `-C` cambia el directorio antes de resolver la ruta. Paso esta corrida y se detecto y borro antes de que nadie leyera mal. **Usar siempre ruta ABSOLUTA al scratchpad.** No hay `node_modules` en el checkout compartido: hace falta `npm ci` en el primer worktree (~2 min) y symlink desde el segundo. [corrida: 2026-08-10-lunes]

## Baselines
| Metrica | Valor | Corrida |
|---|---|---|
| main@d797b3f verde | npm test **74 archivos / 1.754 tests** · lint 0 errores / **943 warnings** · tsc --noEmit limpio. Coincide EXACTO con lo predicho el lunes para #98+#99+#100. Todos los guards de paridad en verde (reportesFinancieros, priorizacionScouting, hatoAlertasParidadServidor, dialogScrollContract, numberInputWheelContract) | 2026-08-06-jueves |
| main@7c232f6 (anterior) | npm test 72 archivos / 1.725 tests · lint 1.031 warnings · tsc limpio | 2026-08-03-lunes |
| main@b32585b verde | npm test **85 archivos / 2.030 tests** · lint 0 errores / 947 warnings · `tsc --noEmit` limpio. Con PR #110 sigue 85/2.030; con PR #111 sube a **86 / 2.036** y 946 warnings. Todos los guards de paridad en verde | 2026-08-10-lunes |


## Corrida 2026-08-24-lunes
- 2 PRs verdes abiertos: **#144** (divisor del jornal a 22, hallazgo #3) y **#145** (agrupacion semanal ISO en
  UTC, hallazgo #27). Baseline main@2d0006e: vitest 128 ficheros / 2.934 tests verdes, lint 0 errores /
  **904 warnings**, tsc limpio.
- Nomina 2026 verificada: 20 de 21 empleados con horas_semanales = 44 (el 21.º, EMILIANO GARCIA, salario NULL
  por diseno, mig 107). Divisor efectivo viejo = 44 × 4,33 / 8 = **23,815**. Jornalero tipo 2.508.098 ->
  **$105.316 viejo vs $114.004 con 22**, subvaluacion del 7,6%.
- Guard nuevo `src/__tests__/jornalDivisorContract.test.ts`. **Su lista FICHEROS_COSTO_JORNAL NO incluye
  calculosCierreAplicacion.ts, que sigue en 4.33** — hallazgo filado esta corrida, y su arreglo DEPENDE del
  merge de #144 (importa DIAS_LABORALES_MES).
- 0 de 2.720 registros_trabajo tienen costo_jornal en 0 o NULL: el hueco de EMILIANO GARCIA (salario NULL ->
  jornal $0 silencioso) es LATENTE, nunca se materializo. **No re-auditar.**
- Bug de agrupacion semanal cuantificado: 677 de 4.200 monitoreos (16,1%) caen en lunes sobre 14 fechas, y 13
  rondas quedaban partidas en dos grupos. La parte del 1-enero es latente (0 filas cruzan ano hoy).
- **registros_trabajo.valor_jornal_empleado guarda DOS UNIDADES INCOMPATIBLES**: 2.461 filas el salario mensual
  (1.423.500-1.800.000), 75 el valor de un jornal (47.450). Las 75 coinciden con costo_jornal/fraccion; ninguna
  de las 2.461 lo hace. Columna poblada al 100%, asi que un NULL no distingue. **Nunca tratarla como una sola
  unidad.**
- CERO firmas de error de runtime en la ventana de 24 h: function_logs 1.401 lineas sin error/exception/fail,
  postgres_logs 939 sin ERROR/FATAL/PANIC. Los unicos no-200 son las sondas del propio barrido — **cotejar
  siempre los no-200 contra la ventana horaria de la corrida antes de reportarlos.**
- `node_modules` NO existe en el checkout compartido: `npm ci` en el primer worktree (~2 min) y symlink desde el
  segundo funciono sin incidentes.

## Corrida 2026-08-24-drenaje-continuacion
- **`eliminarCompraConReversion` revierte `cantidad_actual` pero NO `precio_unitario`.**
  `NewPurchase.tsx:391-394` los escribe juntos en un solo UPDATE;
  `PurchaseHistory.tsx:112-117` devuelve solo la cantidad. Consecuencia: borrar una compra
  deja pegado al producto el precio de la compra borrada, **para siempre y sin rastro en el
  ledger**. Y `productos.precio_unitario` alimenta el costo de insumos de costo/kg por lote
  (`calculosCostoKg.ts`), asi que mueve una cifra financiera en silencio. Ya filado.
  [corrida: 2026-08-24-drenaje-continuacion]
- **CORRECCION AL PADRON DE MEMORIA: ya HAY CI en el repo.** La nota de 2026-08-20 decia
  «no hay CI (`.github/` no existe)». Desde el 2026-08-24 existe
  `.github/workflows/deteccion-deriva-despliegue.yml` — cron diario 12:30 UTC mas
  `workflow_dispatch`, corre `scripts/check-deploy-drift.mjs`. **Sigue sin haber CI de
  `npm test`/`lint`/`typecheck`**, que era el fondo de aquella nota: eso hay que correrlo a
  mano antes de abrir un PR. [corrida: 2026-08-24-drenaje-continuacion]
- **El ENUM `fraccion_jornal` tiene 4 etiquetas y JavaScript rompe una de ellas.**
  `(1.0).toString()` en JS es `"1"`, que el ENUM (`0.25`/`0.5`/`0.75`/`1.0`) rechaza — y es
  el valor por defecto de un registro nuevo. Era invisible porque el escritor no miraba
  `{ error }`. Cubierto por la 106 + `etiquetaFraccionJornal()`, que **lanza** ante cualquier
  valor fuera de las 4. Registrar horas extra (>1 jornal) **no se arregla devolviendo la
  opcion a la UI**: hay que agregar la etiqueta al ENUM con su propia migracion.
  [corrida: 2026-08-24-drenaje-continuacion]

## Corrida 2026-08-27-jueves

### Estados aceptados
- **`chat.tsx` tiene su PROPIA puerta de confianza de lluvia (`lluviaConfiable`, ~linea 2065),
  declarada como «espejo de `lluviaConfiableDeResumen()`», y no se puede importar** — vive en el arbol
  Deno. Nadie la vigilaba y el PR #178 la dejo atras en un dia. Ahora la vigila
  `src/__tests__/climaConfianzaParidadEsco.test.ts`, que ademas **PINEA `CONFIANZAS_SIN_DATO` a
  exactamente `['contador_congelado']`**: mover el original sin mover el espejo da test rojo.
  **Regla general: al tocar la logica de lluvia hay que contar CUATRO sitios, no uno** —
  `calculosClima.ts`, `chat.tsx` (x2 arboles) y `acciones-paquete*.ts`.

### Navegacion
- **`clima_resumen_diario.lluvia_confianza` tiene CINCO valores desde la 122, y HAY DOS ESTACIONES en
  esa tabla.** Estado 2026-08-27 **agrupando por `station_id`, que es la unica forma correcta de
  leerlo**: estacion Ecowitt `84:1F:E8:35:D8:73` -> `ok` 135 / `cobertura_parcial` 25 / **
  `contador_congelado` 0**; serie `wunderground-historico` -> `ok` 1.730 / **`contador_congelado` 27**
  (2020-10-14 a 2025-08-31, 29,18 mm). **CORRECCION A MI PROPIA NOTA DE ESTA CORRIDA: escribi que
  «el CLAUDE.md exagera la reparacion porque quedan 27». Es FALSO.** La 122 reparo la serie Ecowitt y
  la dejo en 0, exactamente como afirma. Los 27 son de la otra estacion, que Ecowitt no puede
  alcanzar. **Agrupar SIEMPRE por `station_id` antes de concluir cualquier cosa sobre confianza de
  lluvia** — es el mismo error que la migracion 103 tuvo que evitar con su filtro
  `station_id <> 'wunderground-historico'`. Lo que si es cierto de mi nota: las 25
  `cobertura_parcial` TIENEN valor no nulo, asi que el comentario de `calculosClima.ts:35` que afirma
  que traen `lluvia_total_mm = NULL` es falso contra produccion. Y `reconstruido` esta en 0 filas.
- **CORRECCION a la nota del 2026-08-24 sobre `valor_jornal_empleado`.** Decia «columna poblada al
  100%, asi que un NULL no distingue». Ya no: hay **149 NULL** de 2.758 filas (2.489 salario mensual /
  120 por jornal). El NULL si distingue hoy, pero no es senal limpia de unidad.
- **Un 401 en el log de una edge function NO prueba que el cron este roto — probar el disparo real
  primero.** El 401 de `/clima/reintentar-sin-dato` del 2026-08-26 19:50:43 era una sonda manual sin
  encabezado; el cron de verdad (jobid 8, 11:00 UTC) devolvio **200 en 5s**. Un 404 si habria probado
  «no desplegado»; un 401 prueba «la ruta existe». Cotejar el `timestamp` del log contra el `schedule`
  del `cron.job` antes de concluir.
- **El rewind del arbol compartido de esta corrida produjo un FALSO P1 y casi lo filo.** Un `npm test`
  corrido durante la ventana dio 2 ficheros / 10 tests rojos en `ClimaCard.tsx` — codigo de 7 dias
  antes. Re-corrido sobre el arbol correcto: 136/3.063 verde. **Regla: antes de reportar un test rojo
  en main, re-correrlo tras confirmar `git rev-parse HEAD origin/main`**; un rojo en un modulo que
  acaba de cambiar es exactamente el que mas convence y mas engana.

### Baselines
| Que | Valor | Corrida |
|---|---|---|
| main@d1627f6 verde | npm test **136 ficheros / 3.063 tests**, todo verde · lint 0 errores / **904 warnings** · `tsc --noEmit` limpio. Con PR #179: **137 / 3.073**, 908 warnings, tsc limpio | 2026-08-27-jueves |
| `registros_trabajo.valor_jornal_empleado` | total 2.758 · **mensual 2.489** (era 2.461 el 08-24, **+28**) · por jornal 120 · **NULL 149**. El hallazgo CRECE con cada captura | 2026-08-27-jueves |

### Refutaciones
| Fingerprint | Afirmacion | Por que murio | Corrida |
|---|---|---|---|
| bug-triage/clima/122-exagera-la-reparacion | Quedan 27 `contador_congelado`, luego CLAUDE.md exagera al decir que la 122 los dejo en 0 | Las 27 son **todas** de `wunderground-historico`; la estacion Ecowitt esta en 0, que es lo que la 122 declara. Mi cuadro agrupaba solo por `lluvia_confianza` y mezclaba dos series con proveniencia, epoca y semantica distintas. Confirmado por dos agentes independientes y por el verificador adversarial | 2026-08-27-jueves |
| bug-triage/main/test-rojo-climacard | `npm test` en main da 10 tests rojos en `ClimaCard.tsx`, luego la suite dejo de ser senal (P1) | Artefacto del rebobinado del arbol de trabajo durante el arranque de la corrida. Re-corrido sobre `d1627f6`: **136 ficheros / 3.063 tests, todo verde** | 2026-08-27-jueves |

## Archivo
(vacio)


## Estados aceptados (corrida 2026-08-20-jueves)
- **Migraciones 094, 095, 096, 097, 098, 099, 100, 101 y 102 estan APLICADAS a produccion**
  (verificado contra `pg_proc`/`pg_class`/`cron.job`, no contra `list_migrations`). La unica que
  sigue pendiente es la **093**. La nota "No aplicada aun" de 097/100 en el root `CLAUDE.md` es
  falsa. [corrida: 2026-08-20-jueves]
  **CORRECCION 2026-08-20 (el orquestador): 093 TAMBIEN esta aplicada** — verificado con
  `SELECT count(*) FILTER (WHERE qual ~ 'es_usuario_gerencia\(\)' AND qual !~ '\(\s*SELECT\s+es_usuario_gerencia') FROM pg_policies` = 0 desnudas, 82 envueltas. Bug Triage
  se equivoco en esta corrida; los otros tres agentes lo cotejaron bien.
- **El inventario de ganado cierra exacto**: `Σ (novillos_delta+toros_delta)` agrupado por
  `COALESCE(potrero_destino_id, potrero_origen_id)` contra `gan_inventario` da **0 potreros con
  diferencia** (53 movimientos, 34 potreros, 0 filas con ambos lados poblados, 0 pendientes).
  **No re-auditar esta reconciliacion.** [corrida: 2026-08-20-jueves]
- **Los dos arboles de edge function siguen sincronizados tras 39 commits**: con `tail -n +2` +
  `diff -w`, **0 archivos** difieren; la unica asimetria sigue siendo `index.tsx`/`index.ts`. No
  reportarlo. [corrida: 2026-08-20-jueves]
- **El motor de acciones funciona y su anti-invento rechaza de verdad**: corridas diarias
  `ok`/`parcial`, 0 errores. `NUMERAL_EN_LETRA` sobre `"la primera en …"` **no es un falso
  positivo**: los ordinales estan en `NUMERALES_ES` a proposito (`accionesValidador.ts:138-140`)
  porque son afirmaciones factuales que el modelo puede errar. **No filarlo como bug.**
  [corrida: 2026-08-20-jueves]
- **Las conversaciones nuevas de Telegram del hato (#117) SI convierten a Bogota** —
  `eventoHato.ts:57` y `pesajeLeche.ts:85` tienen `hoyBogota()` correcto. Los sitios UTC que
  quedan en el arbol Deno son los ya documentados (`jornal.ts`, `ingreso.ts`, `chat.tsx`,
  `generar-reporte-semanal.tsx`). [corrida: 2026-08-20-jueves]

## Navegacion (corrida 2026-08-20-jueves)
- **Nombres reales de las tablas de la 096**: `alertas_catalogo`,
  `telegram_alertas_suscripciones`, `hato_alertas_envios` — **no**
  `hato_alertas_catalogo`/`hato_alertas_suscripciones`. Consultar por el nombre equivocado
  devuelve 0 y parece una migracion sin aplicar; casi lo filo como P0. Usar `pg_class`, y ante
  un 0 confirmar el nombre antes de concluir. [corrida: 2026-08-20-jueves]
- **`clima_resumen_diario` tiene 1.910 filas y crece un dia por dia**: cualquier lector nuevo
  necesita `fetchAll`. `clima_lecturas` no (ventana de 24 h, ~288 filas).
  [corrida: 2026-08-20-jueves]
- **6 de los ultimos 21 dias tienen `lluvia_confianza='contador_congelado'`** (08-18, 08-13,
  08-10, 08-08, 08-02, 07-31), o sea ~29% de los dias sin lluvia utilizable. La guarda de la
  068 esta funcionando como se diseno; el numero alto es del sensor, no del codigo. No es un
  bug — anotado para que nadie lo "arregle". [corrida: 2026-08-20-jueves]
- **`src/hooks/` y `src/contexts/` NO estan en `RAICES_CUBIERTAS` de `hatoFechaLocalGuard.test.ts`.**
  El guard verde no cubre esas carpetas. Hay una violacion viva en `src/hooks/useClimaData.ts:43`.
  [corrida: 2026-08-20-jueves]
- **No hay CI en el repo** (`.github/` no existe), asi que `npm test` solo corre donde alguien
  lo corra, y una prueba que dependa de `.env.local` puede estar roja durante dias sin que nadie
  lo note. **Regla que se gana el sitio: en toda corrida, correr `npm test` sobre el HEAD antes
  de reportar hallazgos de test coverage.** [corrida: 2026-08-20-jueves]

## Baselines (corrida 2026-08-20-jueves)
| main@8306dbf | npm test **119 archivos / 2.818 tests con 8 EN ROJO** (`requiereDecisionSeccion.test.tsx`, entorno sin `.env.local`) · lint 0 errores · `tsc --noEmit` limpio. Con PR #130 queda 119/2.818 **todo verde**; con #130+#131, **120 / 2.821** | 2026-08-20-jueves |

## Drenaje del viernes (corrida 2026-08-28-viernes)
- **`movimientos_inventario` no tiene NINGUN trigger de atribucion** — verificado contra
  `pg_trigger` (0 no internos). El `responsable` lo estampa el escritor o no lo estampa nadie.
  Los 4 escritores son `NuevoMovimientoModal`, `NewPurchase`, `PurchaseHistory` (los 3 TS, ahora
  vigilados por `movimientoInventarioResponsable.test.ts`) y el RPC `fn_cerrar_aplicacion`
  (mig. 106, via `auth.jwt() ->> 'email'`). [corrida: 2026-08-28-viernes]
- **El formato de `movimientos_inventario.responsable` es EMAIL, confirmado contra los datos**:
  157 de 157 filas atribuidas. Un escritor nuevo que guarde un nombre parte la columna en dos
  sin que nada falle. Para auditar el hueco, agrupar por `tipo_movimiento`, no solo por
  `responsable`. [corrida: 2026-08-28-viernes]
- **Este repo NO tiene `@testing-library/react` ni jsdom** (solo vitest). Un defecto dentro de un
  componente se prueba con guard estatico o extrayendo un helper exportado. **No proponer un test
  de render.** [corrida: 2026-08-28-viernes]
- **Un test de orden con `indexOf(a) < indexOf(b)` PASA EN VACIO cuando `a` no esta** (`-1 < 0`).
  Detectado en vivo escribiendo el guard de #50, solo porque se esperaban 5 rojos y salieron 4.
  **Todo test de orden lleva un `toContain` delante.** [corrida: 2026-08-28-viernes]
- **`clima_resumen_diario.station_id` de la estacion Ecowitt lleva un ESPACIO AL FINAL**
  (`'84:1F:E8:35:D8:73 '`). Igualdad literal devuelve **0 filas** y parece "no hay datos".
  Consultar siempre con `like '84:1F:E8:35:D8:73%'`. [corrida: 2026-08-28-viernes]
- **En clima, una comprobacion DESPUES del rollup no puede reparar nada** — la fila anterior se
  apoyaba en lecturas ya podadas a 24 h. La guarda tiene que prevenir, no detectar. Es lo que
  hace `debeReagregarDia` (PR #183). [corrida: 2026-08-28-viernes]
- **Para un rojo-antes-del-verde honesto sobre codigo que no se puede importar** (`clima.tsx`,
  `chat.tsx` — usan `https://deno.land/x/hono` y `jsr:`, sin alias en `vite.config.ts`): crear un
  modulo puro Deno-free en el arbol de edge function (patron `ganado-inventario.ts`) como STUB que
  modela el comportamiento actual, correr el test, y recien ahi implementar.
  [corrida: 2026-08-28-viernes]
- **CORRIGE una entrada del 2026-08-20**: ya NO es cierto que "no hay CI en el repo". Existe
  `.github/workflows/deteccion-deriva-despliegue.yml`. **Sigue sin haber gate de PR** — no corre
  lint/typecheck/test sobre un PR — asi que la regla de correr `npm test` a mano antes de reportar
  cobertura se mantiene. [corrida: 2026-08-28-viernes]

## Baselines (corrida 2026-08-28-viernes)
| `main@f98f83a` | npm test **137 ficheros / 3.073 tests, todo verde** · lint **0 errores / 908 warnings** · `tsc --noEmit` limpio | 2026-08-28-viernes |
