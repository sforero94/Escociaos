# Memoria — Usage Analytics

Escrita solo por el orquestador (ver `README.md`). Inyectada completa en el
prompt del agente en cada corrida.

## Estados aceptados
- Pesajes de leche: junio 2026 tiene un hueco documentado y aceptado sobre CUANTAS
  vacas por sesion. Distinto del hallazgo abierto de que no hay NINGUNA sesion desde
  el 24-jun. [corrida: 2026-08-03-lunes]
- Filas creadas por el bot de Telegram llevan `created_by = NULL` (service role) —
  "Sin usuario" es el bot, no un bug de atribucion.
- Las correcciones pre-aprobacion del chequeo (ventana B0) NO dejan rastro en la DB:
  el commit borra e inserta fresco. La tasa de correccion NO es medible por SQL.
  No volver a buscarla. [corrida: 2026-08-03-lunes]
- Cadencia de chequeos del hato: ~65-71 dias (2026: 02-25 → 04-29 → 07-09). Proximo
  esperado ~2026-09-08 ± 1 semana. **Antes de esa fecha, cero chequeos nuevos NO es
  senal de abandono.** [corrida: 2026-08-03-lunes]
- **El escalamiento de alertas a 48h NO es un defecto todavia.** Los envios fueron el
  2026-08-01 05:45 y el umbral se cumple exactamente en el tick del 2026-08-03 05:45;
  la logica de `decidirAccionEscalamiento` (hatoAlertas.ts:447-460) es correcta.
  Confirmar el resultado del tick siguiente antes de tratarlo como bug.
  [corrida: 2026-08-03-lunes]
- **`hato_correcciones` (mig 084) con 0 filas NO es un defecto.** Los 5 triggers estan instalados y habilitados y `fn_hato_registrar_correccion` arranca con `IF auth.uid() IS NULL THEN RETURN`; las unicas escrituras desde su instalacion fueron migraciones (service role). Cero es el comportamiento contratado. Consecuencia a recordar: **un "0 correcciones" ahi NO es evidencia de que no hubo ninguna.** [corrida: 2026-08-10-lunes]
- Cadencia de chequeos: ultimo 2026-07-09, sin chequeos nuevos, que es lo ESPERADO (cadencia 65-71 dias, proximo ~2026-09-08). No reportar como abandono antes de esa fecha. [corrida: 2026-08-10-lunes]

## Refutaciones
| Fingerprint | Afirmacion | Por que murio | Corrida |
|---|---|---|---|
| usage-analytics/monitoreo/colapso-y-vista-ciega | El monitoreo colapso y la priorizacion quedo ciega | Refutada por tres errores: (a) jun+jul son UNA ronda partida por calendario — agrupar por `ronda_id`, NUNCA por `fecha_monitoreo`; (b) el baseline 2025 es importacion masiva, no captura viva; (c) jun-ago son los 3 meses MAS BAJOS de 2025. Y la vista NO esta ciega. Sobrevivio una version menor: la cobertura cayo y los sublotes no visitados desaparecen sin indicador de "no revisado". | 2026-07-31-dryrun-lunes |
| usage-analytics/hato/martha-sin-cuenta-telegram | "El rol de campo del hato no tiene cuenta en el bot, asi que `/pesaje` y `/produccion` son inalcanzables para quien esta en el ordeño" | **REFUTADO en cuatro frentes.** (a) `/produccion` NO EXISTE: se retiro a proposito (bot.ts:21-25, SOW 3, decision 5 del dueño — la quincena pasa por `fin_ingreso_id NOT NULL` y el bot escribe con service_role). (b) "0 mensajes entrantes" es una TAUTOLOGIA: el unico INSERT a `telegram_mensajes` esta en `telegram/enviar.ts:73-76` con `direccion:'saliente'` hardcodeado — el bot nunca registra entrantes. (c) Existe ruta WEB desplegada y alcanzable: `/hato-lechero/produccion` bajo ModuleGuard hato_lechero, con foto y captura a mano; el bucket y la edge function estan en produccion desde 2026-08-06. (d) El dueño diseño Telegram FUERA del ordeño: `src/components/hato/CLAUDE.md:163` dice que la vista web "es el unico punto de entrada" y D-4 registra que **no hay internet en la finca**. Ademas la persona señalada nunca ha capturado NADA en ningun modulo — el operador real del hato es Santiago, por web. **Aprovisionarla resolveria un problema que nadie tiene.** | 2026-08-10-lunes |
| usage-analytics/hato/7-ciclos-pesaje-perdidos | "El pesaje semanal lleva 7 ciclos consecutivos sin producir filas; ~480 observaciones irrecuperables" | **REFUTADO como esta formulado**; el hueco de datos es real pero la cadencia, la magnitud y la irrecuperabilidad son falsas. (a) NINGUNA fila fue capturada en vivo jamas: las 376 llevan `fuente='importacion_leche_2026'`, cargadas de una sola vez el 2026-07-24 desde planilla de papel. No hay "sistema que se detuvo". (b) La superficie de captura NO EXISTIA durante la mayoria del hueco: `PesajeSemanalGrid` nacio el 2026-07-22 y la ruta foto/manual el 07-28/08-06. Miercoles perdidos CON superficie viva: **3, no 6/7**. (c) "Irrecuperable" es falso: la migracion `083b` recupero junio desde una foto de la planilla, transcripcion verificada dos veces. (d) ~480 esta inflado ~2,7x: el roster de ordeño es **35 vacas activas, no 68**. (e) El ciclo de entrada real es **una planilla MENSUAL por foto**, no 7 entradas semanales -> julio = 1 planilla pendiente. Severidad honesta: **P3**. | 2026-08-10-lunes |

## Navegacion
- `usuarios.last_login` es NULL en las 7 filas — inutil como senal de adopcion; usar
  `created_by` + `created_at` de las tablas de dominio. Hay dos cuentas 'Consuelito'.
- El campo `monitor` de `monitoreos` es senal de DOTACION: 'Clara, Daniela' hasta abril
  2026, 'Clara' sola desde mayo — explica la caida de cobertura mejor que cualquier
  hipotesis de software.
- **La migracion 074 FUNCIONA**: filas del 2026-07-28/29/31 tienen `registrado_por`
  NULL, y las del 2026-08-01 tienen 18/18 atribuidas. **Al leer atribucion, cortar
  siempre por `created_at >= 2026-07-31`**; antes de esa fecha el NULL es esperado y
  no es el bot. [corrida: 2026-08-03-lunes]
- **El rezago de captura de `fin_gastos` NO es senal util sin excluir marzo 2026**:
  ese mes tiene 4.046 filas de importacion historica con rezago mediano de 618 dias
  que domina cualquier promedio. Medianas reales: abr 14, may 12, jun 9, jul 16 dias.
  No volver a reportar "el rezago esta creciendo" sin filtrar marzo.
  [corrida: 2026-08-03-lunes]
- **`hato_toros` NO es tabla muerta**: 62 filas y 232 de 412 servicios (56%) con
  toro_id. Lo vacio es `hato_animales.padre_toro_id` (171/171 NULL), que es el padre
  de la vaca — campo distinto y menos urgente. No confundirlos.
  [corrida: 2026-08-03-lunes]
- **Censo de tablas vacias (count(*) explicito)**. CERO REAL: focos, focos_productos,
  cosechas, preselecciones, despachos, gan_pesos_historico, tareas_lotes, esco_memorias,
  logs_auditoria, hato_protocolos, hato_tratamientos, hato_tratamiento_pasos,
  hato_pajillas, hato_pajillas_uso. **NO estan vacias**: plagas_enfermedades_catalogo=32,
  fin_negocios=7, fin_regiones=7, clientes=4. Clasificacion: `hato_pajillas` tiene ruta
  UI viva = lanzada y nunca estrenada; `hato_protocolos`/`tratamientos` NO tienen ruta =
  nunca lanzadas. [corrida: 2026-08-03-lunes]
- **Antes de leer un pico del hato como adopcion, revisar `datos->>'origen_migracion'` y si todas las filas comparten el microsegundo de `created_at`.** El pico del 2026-08-06 (+21 eventos, +12 pesajes, +8 animales) era la migracion `083`, no uso. `fuente='web'`/`created_by=Santiago` los pone el script, no un navegador. [corrida: 2026-08-10-lunes]
- **La adopcion de la captura por foto se mide en `storage.objects` por bucket, no en las tablas de dominio**: chequeos-fotos 0 · hato-pesajes-fotos 0 · hato-liquidaciones-fotos 4. Ambas rutas de campo estan desplegadas — verificado por contenido en el bundle vivo (`ProduccionView-*.js` contiene `pesaje/commit`, `ChequeosList-*.js` contiene `chequeo/foto`). No re-diagnosticar como problema de despliegue. [corrida: 2026-08-10-lunes]
- **Al medir adopcion del bot, mirar `telegram_usuarios` ANTES que `telegram_mensajes`**: esta ultima arranca el 2026-08-01 y es el log del despachador de alertas, no la historia del bot, y solo registra salientes. [corrida: 2026-08-10-lunes]
- **Señal que SI vale la pena vigilar y que nadie vigilaba: `hato_produccion_quincenal`.** Es la unica serie del hato atada a dinero (`fin_ingreso_id NOT NULL`, $11M-$27M por quincena) y va ~1 ciclo atrasada. Es un indicador mas fuerte que el pesaje por vaca. Medirla cada lunes. [corrida: 2026-08-10-lunes]

## Baselines
| Metrica | Valor | Corrida |
|---|---|---|
| Pulso semanal | registros_trabajo 62/sem (avg4w 56,3) · fin_gastos 25/sem (avg4w 27,0) · monitoreos 21 (Ronda 29 ABIERTA) · chat Esco 18 msgs/28d, 1 usuario · **telegram_mensajes 48 (TODAS salientes, 0 entrantes historicos)** · hato captura viva = 0 · clima sano | 2026-08-03-lunes |
| Monitoreo por ronda | R24=129 combos/18 sublotes/6 lotes · R26=103/19/7 · R27=55/12/4 · R28=44/12/4 · R29=21/6/2 (EN CURSO, **no comparable hasta que cierre**). R24 bajo de 134 a 129 por las migraciones 075/076, no por cambio de uso | 2026-08-03-lunes |
| Hato alertas y completitud | 46 enviada / 14 descartada / 1 respondida / 1 expirada / **0 pendiente** · destinatario = 8505349717 (Santiago) en los 5 tipos · **tasa de respuesta 1/47 = 2%** · 0 escaladas · activas 80: 80 sin raza, 19 sin fecha_nacimiento, 28 sin madre, 8 provisionales, **0 fichas completas** (sin cambio en 3 dias) | 2026-08-03-lunes |
| Quien escribe (28d) | David Garcia 45 · Consuelito 94 · Efrain 22 · Santiago 22 · **Martha Vega 0** · sin usuario 206 (previas al trigger 074) | 2026-08-03-lunes |
| Pulso semanal | registros_trabajo 61/sem (avg4w 56,0) · fin_gastos 38/sem (avg4w 28,8, **rezago mediano 14 -> 6 dias, el mejor en 6 semanas**) · monitoreos 24 (Ronda 29 ABIERTA) · movimientos_inventario 18 (12 = ajustes del arreglo de stock, 6 = entradas) · chat Esco 0 esta semana (rango historico 4-12/sem = RUIDO, no cliff) · telegram_mensajes 96 acumuladas, todas salientes · **captura viva del hato = 0 por 4a corrida** · clima sano (7/7 dias) | 2026-08-10-lunes |
| Quien escribe (7d) | David Garcia 87 (61 registros_trabajo + 24 monitoreos + 2 tareas) · Consuelito 38 (fin_gastos) · Santiago 22 (21 = migracion 083, 1 fin_ingreso real) · el rol de campo del hato 0 — **4a corrida en cero** · Efrain 0 · Maria Paula 0. Escriben **3 de 7 cuentas** en una semana tipica | 2026-08-10-lunes |
| Hato alertas y completitud | 62 descartada / 2 enviada / 0 pendiente · 45 escaladas · **tasa de respuesta 1/64 = 1,6%** (era 1/47) · destinatario = Santiago en los 5 tipos, que es la **decision D-14 del dueño** (mig 091, "las alertas van a Santiago mientras prueba") y NO debe revertirse · auto-descarte funciona (42 el 08-06 al salir 21 vacas) · activas **68**: 68 sin raza, 26 sin fecha_nacimiento, 35 sin madre, **0 provisionales** (eran 8), **0 fichas completas** | 2026-08-10-lunes |
| Pesajes de leche | mar 4 sesiones/80 filas · abr 4/80 · may 4/94 · jun 4/122 · **jul 0 · ago 0**. Ultimo dato 2026-06-24. **Las 376 filas son importacion, ninguna captura viva.** Miercoles perdidos con superficie viva: 3 | 2026-08-10-lunes |
| Monitoreo por ronda | R24=153 obs/18 sublotes · R26=137/19 · R27=55/12 · R28=44/12 · R29=45/12 (**ABIERTA**, monitor Clara). El nivel 12 sublotes/4 lotes es el NUEVO normal desde la salida de Daniela, no una caida en curso | 2026-08-10-lunes |


## Corrida 2026-08-24-lunes
- **SE ROMPIO LA RACHA DE CERO**: el rol de campo del hato paso de 0 (4 corridas seguidas) a 174 filas en 28
  dias. 169 pesajes con fuente='foto' en 6 sesiones, insertadas el 2026-08-11 y 08-12. Las 549 filas de
  hato_pesajes_leche ya NO son todas importacion: 376 importacion + 173 foto.
- hato_correcciones tiene sus primeras 10 filas (7 update a hato_animales, 2 delete y 1 update a hato_eventos),
  2 personas. La tabla ya NO esta vacia: a partir de ahora SI sirve como senal de revision humana.
- **REGLA NUEVA AL MEDIR ADOPCION POR FOTO: cotejar SIEMPRE objetos del bucket contra filas producidas.** Un
  objeto sin filas es un intento FALLIDO, no un exito. El 2026-08-19 entro a hato-pesajes-fotos un objeto de
  3.324.012 bytes byte-identico en tamano al que 57 s despues entro a hato-liquidaciones-fotos; el pesaje no
  produjo ninguna fila, la liquidacion si.
- chequeos-fotos sigue en 0 objetos y los 33 hato_chequeos se escribieron TODOS el 2026-07-23 (backfill).
  Ningun chequeo se ha capturado nunca en vivo. Proximo esperado ~2026-09-08 (cadencia 65-71 dias).
- Completitud del hato movida por primera vez: activas 68->65, sin raza 68->62, sin fecha_nacimiento 26->20,
  sin madre 35->32, fichas completas 0->1.
- **CORRECCION AL CLAUDE.md RAIZ: movimientos_diarios SI tiene created_by y esta poblada en 157/157 filas**,
  desde 2026-01-06. El contrato dice que 'aplicaciones y movimientos_diarios* no tienen columna de capturador';
  es falso para movimientos_diarios (si es cierto para aplicaciones y para movimientos_diarios_productos).
- **fin_gastos: la caida a 1 fila en la semana no es abandono, es RUIDO.** La captura es por lotes y el rezago
  mediano en agosto es 0 dias — el mejor de 2026 (abr 14, may 12, jun 9, jul 16). No reportar como abandono.
- **Monitoreo: 16 dias sin observaciones NO es abandono.** Cadencia de apertura de ronda R26 04-25, R27 05-20,
  R28 06-24, R29 07-29 -> proxima ~2026-09-01. R29 sigue abierta con 45 obs / 12 sublotes.
- Esco chat: 85 conversaciones / 350 mensajes, 0 vacias, 44 de un solo turno. Semana del 08-10: pico de 60
  mensajes y SEGUNDO usuario de la historia. esco_memorias 0 -> 1: la memoria de largo plazo se estreno.
- telegram_usuarios = 4 (2 gerencia, 2 campo), 2 altas nuevas el 08-11 y 08-12.
- SUPERFICIE NUEVA a vigilar cada lunes — acciones_recomendadas: nace 2026-08-17, 9 corridas, 63 acciones,
  acciones_silencios = 2 (descartes humanos reales de Gerencia).

## Archivo
(vacio)
