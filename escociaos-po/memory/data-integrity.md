# Memoria — Data Integrity

Escrita solo por el orquestador (ver `README.md`). Inyectada completa en el
prompt del agente en cada corrida.

## Estados aceptados
- `logs_auditoria` (el CLAUDE.md raiz la llama mal `audit_log`; `audit_log` NO
  existe). Causa determinada: genuinamente vacia (n_tup_ins=0 historico), sin
  ningun camino de escritura. NO es RLS. Ya archivada como P2. No re-investigar.
  [corrida: 2026-08-03-lunes]
- Brecha documentada de cobertura de pesajes de leche en junio 2026 — conocida y
  aceptada por el owner. OJO: es sobre CUANTAS vacas por sesion, distinto del
  hallazgo abierto de que no hay ninguna sesion desde el 24-jun. [corrida: 2026-08-03-lunes]
- Los 30 grupos de eventos `servicio` duplicados mismo-dia son el balde
  `conflictosToroDistinto`, dejado intacto para revision de Martha. El unico par
  de partos <60 dias (RICARENA #88) es artefacto aceptado. Conteos re-verificados
  30 / 1. [corrida: 2026-08-03-lunes]
- 1 header de chequeo vacio en `hato_chequeos` (2024-01-17, id 210a470b) — sigue
  siendo exactamente 1, no aparecieron mas por el camino B0 en vivo.
  [corrida: 2026-08-03-lunes]
- **Las 26 filas de `compras` NO tienen fila enlazada en `fin_gastos`
  (`compra_id` NULL en las 4.426). Es ESPERADO**: la migracion
  `drop_compra_a_gasto_trigger` (2026-07-02) elimino el trigger y los gastos de
  compras se capturan a mano (verificado: la compra factura 4379 de $5.359.680
  tiene su gasto manual de $5.320.286). No re-investigar. **Ademas la tabla
  `compras_productos` que documenta el CLAUDE.md raiz NO EXISTE**: `compras` es
  una fila por producto. [corrida: 2026-08-03-lunes]
- Postura de backup/PITR: NO verificable con las herramientas de esta especialidad
  (el MCP no expone estado de backups ni restauraciones). Dicho una vez el
  2026-08-03 — **NO re-archivar cada corrida**. Pertenece a Infra con acceso al
  dashboard. [corrida: 2026-08-03-lunes]
- 47 intervalos parto-a-parto <270 dias en 31 animales (eran 46/31; la diferencia
  de 1 es el umbral usado, no datos nuevos — 0 partos creados desde entonces).
  Hallazgo ya abierto, no re-archivar. [corrida: 2026-08-03-lunes]
  **CERRADO por la migracion 080**: los partos bajaron de 333 a 300 y el hallazgo
  ya no aplica. [corrida: 2026-08-06-jueves]
- **Stock negativo RESUELTO — cerrar, no re-archivar.** El P2 abierto del lunes
  ("12 quimicos con stock negativo, −$2,4M") ya no aplica:
  `select count(*) from productos where cantidad_actual < 0` => **0**. Corregido el
  2026-08-03 22:05 UTC por sforero94@gmail.com con 12 movimientos `Ajuste` que
  llevaron cada saldo a 0.00. Proyeccion al cierre de las 2 aplicaciones abiertas:
  los 8 productos consumidos quedan positivos. [corrida: 2026-08-06-jueves]
- **Migraciones 077–082 verificadas contra el catalogo VIVO** (no el ledger): 0
  policies con `auth.uid()` desnudo · kv_store con 2 indices · 300 partos · 0 tablas
  `backup_*` en `public` y `anon` sin SELECT sobre `respaldos.backup_080_*` · `anon`
  sin EXECUTE en `fn_cleanup_compra_dependencies` · 0 funciones sin `search_path`.
  **No re-verificar cada corrida.** [corrida: 2026-08-06-jueves]
- Los 2 partos post-venta (ROCHELA #33, OMA #54) son del backfill del 2026-07-23,
  NO una regresion. La baseline previa decia "0 eventos post-salida" — era incorrecta
  o usaba otra definicion. Hallazgo P3 abierto, esperando a Martha (puede estar mal
  la fecha de venta y no el parto). [corrida: 2026-08-06-jueves]
- **Los 148 productos con stock y sin ninguna fila en `movimientos_inventario` son
  saldos de apertura, NO un defecto.** Los dos caminos de creacion (`ProductForm`
  insert y el importador CSV, que solo hace INSERT) siembran `cantidad_actual` sin
  movimiento por diseno. No citarlos como exposicion de ningun hallazgo.
  [corrida: 2026-08-06-jueves]
- **Migracion 083 (`hato_inventario_definitivo_agosto_2026`) aplicada el 2026-08-06 — VERIFICADA, no re-auditar.** Dejo el hato en 68 activas: 21 bajas `tipo='venta'` + 8 fichas nuevas + 8 renumeraciones + 1 reactivacion + 1 correccion de etapa, en una sola transaccion. Las 3 postcondiciones se cumplen (68 activas, 0 chapetas duplicadas entre activas, `respaldos.backup_083` intacto con 31 filas). **Las 21 ventas SIN contraparte en Finanzas son la decision D-4 del dueño** y `fecha_estado` NULL en las 21 es deliberado. NO reportar nada de esto. [corrida: 2026-08-10-lunes]
- **`hato_correcciones` (mig 084) con 0 filas es correcto**: los 5 triggers estan instalados (`prosecdef=true`, verificado en pg_trigger) pero `fn_hato_registrar_correccion` hace `RETURN` cuando `auth.uid()` es NULL, y las escrituras de 083/083b fueron service role. Ademas 083b fueron INSERTs y el trigger es solo AFTER UPDATE OR DELETE. **Consecuencia: la correccion mas grande de la historia del modulo no dejo rastro en la tabla que existe para rastrear correcciones.** [corrida: 2026-08-10-lunes]

## Refutaciones
| Fingerprint | Afirmacion | Por que murio | Corrida |
|---|---|---|---|
| data-integrity/inventario/productform-valor-rancio-P1 | Editar un producto sobrescribe `cantidad_actual` con un valor RANCIO, y eso es P1 con exposicion de 7 ediciones + 148 productos | El MECANISMO sobrevivio (el campo es editable, `dataToSave` lleva `cantidad_actual`, no hay trigger ni gate de rol, RLS deja pasar a Administrador y Gerencia) pero **el encuadre y la severidad murieron**. "Rancio" = 0 instancias: de las 7 ediciones post-movimiento, 4 reescribieron el MISMO valor (delta 0.00) — el formulario recarga de la BD al abrir. Las 2 escrituras daninas fueron cambios deliberados que ademas dejaron el stock FISICAMENTE CORRECTO (Naturboro: el usuario precargo 20 L al crear y la factura 68444 sumo los mismos 20 L; volver a 20 era la respuesta correcta). Sulcamag NO es este bug: su `precio_unitario` (669,96) no coincide con el derivado (996,00) y ProductForm siempre reescribe el derivado — fue un UPDATE a pelo del 2026-07-24. Los 148 sin ledger son saldos de apertura. **Radio real: 2 de 341, no 7 ni 148.** Ningun reporte consume `cantidad_actual` (las finanzas leen `fin_gastos`/`fin_ingresos`; costo/kg lee `movimientos_diarios_productos`). Baja a **P2**: a diferencia del caso del `onWheel`, este SI disparo — dos veces — y deja dos huecos permanentes sin explicacion en el libro. | 2026-08-06-jueves |
| data-integrity/globalgap/productos-escala-severidad | `productos`/`movimientos_inventario` heredan la escalada de severidad de GlobalGAP | Refutada por regla: §5 escala solo `aplicaciones*` y `movimientos_diarios*`. Ninguna de las dos tablas pertenece a esas familias. Hay un argumento sustantivo de trazabilidad de insumos, pero la regla tal como esta escrita no lo cubre — no escalar. | 2026-08-06-jueves |
| data-integrity/monitoreo/plagas-sin-umbral-omitidas | Las plagas sin fila en `pest_umbral_economico` se omiten de la priorizacion | Refutada leyendo el motor: `priorizacionMonitoreo.ts` construirSeries() les crea serie propia con grupo_key null y cae al tercil estadistico. Las 14 plagas activas sin umbral SI aparecen. | 2026-07-31-dryrun-lunes |
| data-integrity/hato/quincenal-julio-medido-sin-pesajes | La quincena 2026-07 Q1 marcada `origen_dato='medido'` con 34 vacas pero 0 pesajes en su ventana afirma una procedencia que no tiene | Refutada leyendo la migracion 070 (lineas 134-139): `num_vacas_ordeno_origen='medido'` significa **"lo digita Gerencia"**, en oposicion a `'derivado_chequeos'`. NO significa "derivado de pesajes por vaca". La fila es correcta por diseño: `litros_total` NULL (un CHECK lo exige para filas `medido`), los litros viven en `fin_ingresos.cantidad` leidos por el FK | 2026-08-10-lunes |
| data-integrity/aplicaciones/md-duplicado-mismo-dia | Los 2 `movimientos_diarios` de "Fumigacion control monalonion agosto" fechados ambos 2026-08-06 son un doble registro | Refutada: lotes distintos (`1. Piedra Paula` vs `2. Salto de Tequendama`) y cantidades distintas. El modelo es una fila por lote por dia. A escala: 0 duplicados sobre (aplicacion_id, lote_id, fecha_movimiento) en las 140 filas. **La clave de duplicado correcta es (aplicacion_id, lote_id, fecha_movimiento), nunca (aplicacion_id, fecha_movimiento)** | 2026-08-10-lunes |
| data-integrity/inventario/reconciliacion-por-suma-firmada | Sumar `movimientos_inventario` con signo (entrada +, salida -, ajuste +) desde cero identifica los productos cuyo saldo nadie explica | **REFUTADO, y es una trampa cara: casi provoca una correccion que habria inventado $5,36M de fertilizante.** El libro NO esta encadenado (72 de 84 filas encadenan, 12 rompen): `saldo_anterior` se re-lee de `productos.cantidad_actual` al escribir (NuevoMovimientoModal.tsx:106). Y 270 de 341 productos no tienen libro, porque el saldo de apertura se siembra al crear el producto sin movimiento. Resultado: la suma marca **62 de 71** productos con libro y da **52 sumas negativas**, todas artefacto. Identidad que lo prueba: `gap_suma = saldo_apertura + gap_ultimo`, exacta en los 6 productos examinados. **El comparador correcto es el ULTIMO `saldo_nuevo` ordenado por `created_at`** (marca 3 de 71), porque todo camino de escritura fija `productos.cantidad_actual = saldo_nuevo` en la misma operacion | 2026-08-10-lunes |

## Navegacion
- Los cuerpos SQL de migraciones aplicadas se recuperan con
  `select version, name, statements from supabase_migrations.schema_migrations`.
- **El ledger de migraciones NO es fuente de verdad, y falla en las dos
  direcciones**: 035/036/046 estan aplicadas (los objetos existen) pero NO figuran;
  `hato_registrar_salida` (20260724181919) SI figura pero la funcion no existe y no
  tiene archivo (la 070 la sustituyo). Comparar repo vs ledger por NOMBRE, nunca por
  numero. **Verificar siempre contra el objeto vivo del catalogo.**
  [corrida: 2026-08-03-lunes]
- **`movimientos_inventario` NO es un libro append-only fiable**: `saldo_anterior`
  se re-lee de `productos.cantidad_actual` al escribir, no se encadena. 0 filas
  fallan su propia aritmetica, pero 12 filas en 8 productos tienen
  `saldo_anterior != saldo_nuevo` del movimiento previo. **NO reconciliar sumando
  `sum(entradas - salidas)`** — da 62 de 68 productos "desalineados", artefacto de
  que los saldos iniciales de enero 2026 nunca se cargaron como Entrada. La prueba
  autoritativa es comparar el ULTIMO `saldo_nuevo` por producto contra
  `productos.cantidad_actual`: solo 2 discrepan. El enum `tipo_movimiento` tiene 4
  valores: Entrada | Salida por Aplicación | Salida Otros | Ajuste.
  [corrida: 2026-08-03-lunes]
- Columnas que rompen queries escritas de memoria: `monitoreos` usa
  `plaga_enfermedad_id` (NO plaga_id) y `fecha_monitoreo`; `rondas_monitoreo` NO
  tiene columna `estado`. **`monitoreos.ronda_id` es NULLABLE y nada lo obliga**
  (RegistroMonitoreo.tsx:270 lo envia pero no hay constraint); todos los
  consumidores filtran por ronda_id, asi que un NULL desaparece en silencio.
  [corrida: 2026-08-03-lunes]

- **`productos.cantidad_actual` se puede escribir SIN fila en `movimientos_inventario`**:
  `src/components/inventory/ProductForm.tsx` hace `.update({...formData})` con el objeto
  entero en modo edicion. Al reconciliar, un delta ledger-vs-stock puede venir de una
  edicion del producto, no de un movimiento perdido — cruzar siempre `productos.updated_at`
  contra el `created_at` del ultimo movimiento. **Huella para atribuir**: ProductForm
  recalcula y guarda `precio_unitario = precio_por_presentacion / presentacion_kg_l`; si el
  `precio_unitario` de una fila NO coincide con ese derivado, la escritura NO fue de
  ProductForm (fue SQL a pelo). [corrida: 2026-08-06-jueves]
- El ledger solo cubre **71 de 341 productos**. No asumir que cubre el catalogo.
  `productos.updated_by` es NULL en las 341 filas — inutil para atribuir.
  [corrida: 2026-08-06-jueves]
- Nombres de columna que rompen queries escritas de memoria: `movimientos_inventario` y
  `movimientos_diarios` **no tienen `fecha`** — es `fecha_movimiento`. `aplicaciones` no
  tiene `nombre`/`fecha_inicio`/`fecha_fin`: son `nombre_aplicacion` /
  `fecha_inicio_ejecucion` / `fecha_fin_ejecucion`. `hato_eventos` **no tiene `notas`**
  (`hato_animales` si). [corrida: 2026-08-06-jueves]
- **Las migraciones 083, 083b, 084, 085, 086, 089, 090, 091, 092 y 093 se aplicaron a produccion entre el 2026-08-06 y el 08-09 SIN fila en el ledger** (`supabase_migrations.schema_migrations` se quedo en 082). Verificadas una a una contra el objeto vivo. Regla de siempre, reconfirmada: verificar contra el catalogo, nunca contra `list_migrations`. [corrida: 2026-08-10-lunes]
- **La prueba autoritativa de libro-vs-stock es el ULTIMO `saldo_nuevo` por producto ordenado por `created_at`, NUNCA por `fecha_movimiento` ni por suma firmada** (ver refutacion). Ordenando por `fecha_movimiento` salen 5 y las 2 extra son artefacto de movimientos retro-fechados. [corrida: 2026-08-10-lunes]
- Columnas que rompen queries escritas de memoria: `hato_animales` no tiene `updated_at`; `hato_alertas` no tiene `enviada_at`; `hato_chequeo_vacas` no tiene `numero_raw`; `verificaciones_inventario` usa `fecha_inicio`/`fecha_completada`/`fecha_revision` y su detalle `cantidad_teorica`/`cantidad_fisica`; `movimientos_inventario` no tiene `motivo` **ni `compra_id`**; `clima_resumen_diario` usa `temp_c_min`/`humedad_pct_avg`/`radiacion_wm2_max`. Estados reales de `hato_alertas`: descartada | enviada. Enum `tipo_movimiento`: Entrada | Salida por Aplicacion | Salida Otros | Ajuste (`Salida Otros` con 0 filas). [corrida: 2026-08-10-lunes]

## Baselines
| Metrica | Valor | Corrida |
|---|---|---|
| Deltas 72h | hato_* **0 escrituras** en TODAS sus tablas · monitoreos 0 · rondas 0 · fin_ingresos 0 · gan_movimientos 0 · movimientos_inventario +18 (137→155) · compras +6 (26→32) · movimientos_diarios +4 (132→136) · mdp +16 (661→677) · aplicaciones +2 (18→20) · fin_gastos +38 (4.426→4.464) | 2026-08-06-jueves |
| Conteos de dominio | hato_animales 171 (8 chapetas provisionales activas; el roster de chequeo es `etapa='vaca' AND estado='activa'` = **35**, no las 80 `activa`) · **hato_eventos 735** (era 768; −33 = migracion 080) · partos **300** · chequeos 33 / chequeo_vacas 1.479 · pesajes 364 (ULTIMO 2026-06-24, sin cambio) · ultimo chequeo 2026-07-09 · alertas 62, 0 abiertas · monitoreos 4.176 / 29 rondas (ultimo 2026-07-29) · productos 341 (226 activos, **0 con stock negativo**) · verificaciones_inventario 1 · fin_gastos 4.464 · logs_auditoria 0 | 2026-08-06-jueves |
| Integridad referencial | **0 huerfanos en TODAS las relaciones probadas.** 0 md sin lote · 0 incoherencias de unidad en compras y mdp · 0 chapetas duplicadas entre activas · 0 modulos_acceso invalidos · 0 gan_movimientos pendientes · 86 monitoreos con ronda_id NULL (sin cambio) · **2 eventos post-salida** (corrige el "0" de la baseline anterior) | 2026-08-06-jueves |
| Ledger vs stock | 3 divergencias de 71 productos con ledger: Sulcamag −8.000 (UPDATE a pelo del 2026-07-24, NO ProductForm) · Naturboro −20 (ProductForm, 2026-08-05) · TecniFeed Boro +18,69 (ProductForm, feb-2026) | 2026-08-06-jueves |
| fin_gastos 72h | 38 filas, todas Confirmado, **0 con fecha futura** (el bug UTC no reaparecio), 0 sin created_by, 0 sin negocio, 0 con valor invalido | 2026-08-06-jueves |
| Clima | Sync SANO: ultima lectura 0,1h · 0 duplicados (station,timestamp) · 90/90 dias con resumen · `contador_congelado` **16 de 90 (~18%)** — bajo de 17, PLANO. Umbral de escalamiento a Infra sigue en ~20% | 2026-08-06-jueves |
| Migraciones | 073–082 confirmadas aplicadas contra el catalogo vivo | 2026-08-06-jueves |
| Conteos de dominio | hato_animales 179 (68 activa / 111 vendida; roster chequeo 35; 27 novillas, 6 terneras; **chapetas provisionales activas 0**, eran 8) · hato_eventos 756 · partos 300 · chequeos 33 / chequeo_vacas 1.479 (ultimo 2026-07-09) · pesajes 376 (**ultimo 2026-06-24**) · quincenal 80 (**falta 2026-07 Q2 y todo agosto**) · alertas 64 · hato_correcciones 0 · monitoreos 4.200 / 29 rondas · productos 341 (0 negativos) · movimientos_inventario 155 · movimientos_diarios 140 / mdp 693 · aplicaciones 20 (2 abiertas) · compras 32 · fin_gastos 4.464 · fin_ingresos 230 · logs_auditoria 0 | 2026-08-10-lunes |
| Integridad referencial | **0 huerfanos en TODAS las relaciones probadas.** 0 FK y 0 CHECK sin validar en `public`. 0 tablas en public sin RLS. 0 gan_movimientos pendientes. 0 chapetas duplicadas entre activas. 0 duplicados en pesajes. Sin cambio: 86 monitoreos con ronda_id NULL · 30 grupos de servicio duplicados mismo-dia · 2 eventos post-salida · 0 partos con intervalo <270 dias. **Nuevo: 1 movimiento_diario fuera de la ventana de su aplicacion** (filado) | 2026-08-10-lunes |
| Clima | Sync SANO: ultima lectura 0,04h · 363 lecturas en 24h · 0 duplicados · 89/90 dias con resumen · 0 valores fisicamente imposibles en 90 dias · `contador_congelado` **17 de 90 (~19%)**, subio de 16 — SEGUNDA subida consecutiva; si llega a 18+ escalar a Infra | 2026-08-10-lunes |
| Inventario | Libro vs stock: **3 divergencias por el metodo correcto** (Sulcamag -8.000, Naturboro -20, TecniFeed Boro +18,69) — y en las 3 el que esta mal es el LIBRO, no el saldo. 0 productos con stock negativo. Proyeccion al cierre de las 2 aplicaciones abiertas: los 8 productos quedan POSITIVOS. La unica `verificaciones_inventario` (desde 2026-07-30) sigue ABANDONADA: 223 filas de detalle, **0 contadas** | 2026-08-10-lunes |


## Corrida 2026-08-24-lunes
- Baseline: hato_animales 179 (65 activa) · hato_eventos 766 (SIN CAMBIO desde 08-20) · partos 300 ·
  chequeos 33 / chequeo_vacas 1.479 (ultimo 2026-07-09) · pesajes 549 · quincenal 82 · alertas 65 ·
  hato_correcciones 10 · monitoreos 4.200 / 29 rondas (ultima 2026-07-29) · productos 341 (0 negativos) ·
  movimientos_inventario **155, congelado desde 2026-08-05 19:29** (NO desde el 08-10: correccion del
  verificador) · movimientos_diarios 157 / mdp 761 · aplicaciones 20 · compras 32 · fin_gastos 4.475 ·
  gan_movimientos 53 / 369 cabezas · logs_auditoria 0.
- Integridad referencial: 0 huerfanos en todas las relaciones probadas. Ganado concilia perfecto otra vez
  (369 = 369 en los 34 potreros; agrupar por coalesce(potrero_destino_id, potrero_origen_id)).
- METODO NUEVO: la proyeccion de inventario al cierre se calcula EXACTAMENTE como el payload —
  sum(mdp.cantidad_utilizada) por producto, filtrando SOLO por movimientos_diarios.aplicacion_id de UNA
  aplicacion. Nunca usar aplicaciones_productos (capa planeada). La conversion cc/g -> /1000 de
  calculosCierreAplicacion.ts es CODIGO MUERTO: enum unidad_medida solo tiene Kilos, Litros, Unidades.
- METODO NUEVO: aplicaciones.costo_total_mano_obra es un SNAPSHOT congelado al cierre, nunca re-derivado
  (fetchDatosReporteCierre.ts:133). Para detectar divergencia: comparar contra sum(registros_trabajo.costo_jornal)
  por a.tarea_id. Son 17 cerradas, 15 cuadran al centavo.
- REFUTADO ESTA CORRIDA (no re-investigar): 'los registros de mano de obra se crearon DESPUES del cierre'.
  Falso — `fecha_cierre` es una fecha TECLEADA por el usuario, no cuando corrio el cierre. La hora real esta
  en aplicaciones_cierre.created_at. Los 199 registros existian y estaban finales antes del cierre, por 23 y
  2 dias, y 0 tienen updated_at posterior. La causa real es que el operador tecleo $50.000 a mano.
- REFUTADO ESTA CORRIDA: 'costo_jornal es una tarifa por jornal'. Es un TOTAL POR REGISTRO — laborCosts.ts:171
  recupera la tarifa como costo_jornal/fraccion_jornal, y sum(costo_jornal*fraccion) no cuadra con ninguna
  aplicacion cerrada.
- REFUTADO ESTA CORRIDA: 'el cierre es el UNICO camino a movimientos_inventario'. Hay 39 Entrada y 12 Ajuste,
  con tres escritores fuera del cierre (NuevoMovimientoModal.tsx:135, PurchaseHistory.tsx:385, NewPurchase.tsx:405).
  El cierre es el unico escritor de 'Salida por Aplicacion'.
- La normalizacion de responsables de la 107 SE SOSTIENE: exactamente 6 grafias, 0 rastro de 'Libardo'.
- CLIMA recuperado: 288/288 el 08-22 y 08-23, contador_congelado 17/90 (bajo desde 19/90). La 103 opero por
  primera vez sobre un incidente real (08-19 y 08-20 marcados cobertura_parcial).

## Corrida 2026-08-24-drenaje-continuacion
- **La firma de escritura de `NewPurchase.tsx` es una herramienta forense, no un detalle.**
  Escribe siempre `compras` → `productos` → `movimientos_inventario` con **~0,5 s** entre la
  primera y la ultima (verificado en las 4 compras de la tabla: 0,67 s / 0,71 s / 0,62 s /
  0,45 s). Ante dos movimientos gemelos, **el que cae dentro de ese medio segundo del INSERT
  de la compra es el documentado; el otro es huerfano**. Asi se corrigio la migracion 118.
  `movimientos_inventario` **no tiene ninguna FK que lo referencie** (comprobado en
  `pg_constraint`), asi que borrar el huerfano no arrastra nada. [corrida: 2026-08-24-drenaje-continuacion]
- **REFUTACION — `registros_trabajo.costo_jornal` YA INCLUYE la fraccion de jornal.**
  Calcular `sum(costo_jornal * fraccion_jornal)` **infla ~40%** y hace parecer que 16
  aplicaciones tienen el costo de mano de obra mal. El calculo correcto es
  `sum(costo_jornal)` a secas, y cuadra al centavo con el snapshot en las 16. No re-abrir
  esto como hallazgo. [corrida: 2026-08-24-drenaje-continuacion]
- **El modulo de Verificacion de inventario NUNCA ha contado nada — es estado conocido, ya
  filado.** `verificaciones_inventario` tiene **1 fila en toda la historia** (`4a595f8c`,
  2026-07-30, «En proceso»), con 223 detalles y `contado = false` en los 223;
  `select count(*) from verificaciones_detalle where contado` es **0 en toda la tabla**.
  Los conteos fisicos que si ocurren entran como movimientos `Ajuste` manuales — y son **los
  unicos 3 de los 160 movimientos con `responsable` NULL**. Esta filado como decision de
  producto; **no volver a reportarlo como hallazgo de datos.** [corrida: 2026-08-24-drenaje-continuacion]
- **Migraciones 110-119 aplicadas y verificadas contra el catalogo vivo el 2026-08-24**
  (ledger `20260824200409` … `20260824222137`). La **109** sigue sin aplicar por el carril:
  `storage.objects` exige propiedad. No re-auditar ninguna. [corrida: 2026-08-24-drenaje-continuacion]

## Corrida 2026-08-27-jueves

### Estados aceptados
- **La reparacion del clima de la migracion 122 SE SOSTIENE — verificada, no re-auditar cada corrida.**
  Distribucion de la estacion Ecowitt al 2026-08-27: **135 `ok` / 25 `cobertura_parcial` / 0
  `contador_congelado`**. CLAUDE.md dice 134/25/0; el +1 es el dia nuevo que el rollup agrega cada
  noche — **usar linea base relativa, nunca el literal**. `reconstruido` no se ha disparado nunca.
  0 valores imposibles en 180 dias, 0 duplicados (station,timestamp), 0 dias sin resumen en 90.
- **Los 100 dias con `lluvia_mm_evento IS NULL` NO son el modo de fallo del backfill en paralelo.**
  Son todos anteriores a la 122: el mas nuevo es 2026-08-25, escrito por el rollup el 08-26 05:15 UTC.
  Ninguno pertenece al conjunto de 36 dias reparados. **La prueba de un backfill sigue siendo
  `lluvia_mm_evento IS NOT NULL`, pero hay que acotarla a los dias efectivamente disparados** — sobre
  la tabla entera marca 100 falsos positivos.
- **Los 4 dias que la 115 dejo sin re-evaluar (2026-08-21/249, 07-09/268, 06-23/272, 08-06/279)
  siguen sellados `ok` y ESO ES CORRECTO.** La posicion del hueco es irrecuperable y un contador
  truncado da cota inferior, no total. **No refilar.**
- **La cobertura del tick del hato (mig 116) NO indica un motor ciego.** `sin_ciclo_reproductivo: 45`
  y `sin_chequeo: 29` sobre 179 asustan, pero por etapa las **35 vacas activas estan al 100%** en
  ambas; los huecos son 24 novillas y 6 terneras, que la regla debe omitir. **Desglosar por `etapa`
  SIEMPRE antes de leer un contador de cobertura como defecto.**
- **El TIMEOUT de `pg_net` a los 5.000 ms no prueba que el endpoint fallo.** Corolario del hecho ya
  ledgereado de que `succeeded` no prueba nada: **`timeout` tampoco prueba lo contrario. La unica
  prueba es el efecto en los datos.**
- **La migracion 119 CERRO la divergencia de Sulcamag.** Quedan **2**, no 3: Naturboro -20,00 y
  TecniFeed Boro +18,69.
- **La migracion 113 (`globalgap_correcciones`) funciona end-to-end con actividad humana real.**
  38 filas, `corregido_por` no nulo en las 38. Caso 2026-08-26 20:37: borrado de 3 `movimientos_diarios`
  + 12 mdp + 23 trabajadores de «Drench agosto», recapturados 20:41-20:51. **Recaptura, no perdida.**
- **La migracion 117 se sostiene**: fronteras limpias (Baja max 9,09 · Media 10,00-28,57 · Alta min 30,00),
  0 mal etiquetadas en 4.200.

### Navegacion
- Columnas que rompen queries escritas de memoria: **`clima_resumen_diario` NO tiene `updated_at`** —
  no hay forma por SQL de saber si un backfill reescribio una fila; usar `lluvia_mm_evento` de testigo.
  `registros_trabajo` usa **`fecha_trabajo`**. `monitoreos` no tiene `gravedad`: son **`gravedad_texto`**
  (ENUM, castear a `::text`) y `gravedad_numerica`. `globalgap_correcciones` usa **`corregido_en`/
  `corregido_por`**. **`v_hato_estado_actual` se une por `animal_id`, NO por `id`.** El ENUM
  `estado_aplicacion` es **`'Cerrada'`**, no `'Cerrado'` — comparar con el literal malo aborta con 22P02.
- **Firma forense del cierre de aplicacion**: `fn_cerrar_aplicacion` (106) escribe todas las
  `Salida por Aplicacion` y la fila de `aplicaciones_cierre` con **el mismo `created_at` al microsegundo**.
  Permite emparejar un cierre con sus movimientos sin ninguna FK.
- **`NuevoMovimientoModal.tsx` no escribe `responsable` ni `factura`** (lineas 134-145). Por eso
  `responsable IS NULL` identifica exactamente las filas de ese modal. **En modo `Ajuste` la cantidad
  tecleada ES el saldo deseado, no el delta** (lineas 126-129).
- **`cron.job` tiene 5 jobs activos** (era 4): 1 clima-sync-wu (*/5) · 2 clima-daily-rollup (15 5) ·
  4 hato-alertas-tick (45 10) · 6 acciones-recomendadas-tick (50 10) · **8 clima-reintento-sin-dato (0 11)**.

### Baselines
| Que | Valor | Corrida |
|---|---|---|
| Deltas 72h | registros_trabajo +38 · mdp +16 · movimientos_inventario +7 (153->160) · movimientos_diarios +4 · fin_gastos +2 · hato_eventos +1 · hato_alertas +1 · **0 en monitoreos, rondas, aplicaciones, compras, productos, fin_ingresos, gan_movimientos y TODAS las hato_ de captura** | 2026-08-27-jueves |
| Dominio | hato_animales 179 (**65 activa**: 35 vaca/24 novilla/6 ternera) · eventos 767 · chequeos 33 / chequeo_vacas 1.479 (ultimo 2026-07-09, **49 dias**) · pesajes 549 (**ultimo 2026-08-12**) · alertas 65 · globalgap_correcciones **38** (eran 0) · monitoreos 4.200/29 rondas · productos 341 · mov_inventario 160 · mov_diarios 161/mdp 777 · aplicaciones 20 (**1 abierta**) · fin_gastos 4.477 · fin_ingresos 232 · gan 369 cabezas · clima_resumen_diario 1.917 · logs_auditoria 0 | 2026-08-27-jueves |
| Integridad | **0 huerfanos en TODAS las relaciones probadas** · 0 duplicados (aplicacion_id,lote_id,fecha) · 0 chapetas duplicadas · 0 provisionales · 0 pesajes duplicados · 0 modulos_acceso invalidos · 0 pendientes de ganado · 0 stock negativo. Sin cambio: 86 monitoreos con ronda_id NULL. Ganado 369 = 369 | 2026-08-27-jueves |
| Inventario | Libro vs stock: **2 divergencias** (Naturboro -20,00 · TecniFeed Boro +18,69). Sulcamag CERRADO. 3 de 160 sin `responsable`. Proyeccion al cierre de la unica aplicacion abierta: los 4 productos POSITIVOS | 2026-08-27-jueves |
| **VIGILAR** | **`hato_pesajes_leche` clavado en 2026-08-12.** Faltan 07-29, 08-19 y 08-26 (miercoles = `dia_pesaje_semanal`): **3 de las ultimas 6 sesiones**. No filado por ser de 1 dia. **Si el 09-02 tampoco entra, son 3 semanas seguidas y merece hallazgo propio** | 2026-08-27-jueves |

### Refutaciones
| Fingerprint | Afirmacion | Por que murio | Corrida |
|---|---|---|---|
| data-integrity/hato/motor-alertas-cobertura-ciega | Los contadores de `hato_alertas_tick_runs` prueban que el motor del hato esta ciego sobre la mayoria del hato | Desglosado por `etapa`: **vaca 35 -> 0 sin chequeo, 0 sin ciclo**. Novillas y terneras aportan el 100% de los huecos, correctamente. Lo unico que sobrevive es `raza`, por otra via, y se filo aparte como P3 | 2026-08-27-jueves |
| data-integrity/clima/evento-null-backfill-fallido | Los dias con `lluvia_mm_evento IS NULL` son el modo de fallo silencioso del backfill en paralelo | Los 100 NULL son anteriores a la 122; ninguno estaba en el conjunto de 36 reparados | 2026-08-27-jueves |
| data-integrity/inventario/ajustes-fabrican-stock | Los 3 `Ajuste` del 08-24 son stock inventado para burlar la guarda de la 106 | **Parcialmente refutada: el mecanismo es real, la acusacion no.** Las 3 traen razon declarada y dejan sobrante (0,76/0,18/0,18), no el minimo justo. **Regla reconfirmada: si la prueba de que una fila es mala sale de la misma fila o de su vecindad temporal, no es prueba.** Se reescribio a lo demostrable: falta `responsable` | 2026-08-27-jueves |

## Archivo
(vacio)


## Estados aceptados (corrida 2026-08-20-jueves)
- **El ganado concilia perfecto y NO hay doble conteo.** `gan_inventario` vs libro de
  `gan_movimientos` confirmados: **0 divergencias en los 34 potreros**, total 369 = 369.
  OJO CON EL METODO: hay que agrupar por `coalesce(potrero_destino_id, potrero_origen_id)` —
  los `traslado_salida` usan SOLO `potrero_origen_id` (11 filas) y agrupar solo por destino
  marca 3 falsos positivos de 131 cabezas en los potreros "General". Linea de tiempo verificada:
  131 (08-10) → 163 (compras) → 401 (conteo fisico de 238 el 08-16) → 369 (08-17, +11 compra
  −43 de la migracion huerfana `ganado_revertir_duplicado_carga_inicial`). Las 131 cabezas de los
  3 "General" son santimp (67) y Supata (19+45), fincas distintas de Escocia — no son duplicados.
  [corrida: 2026-08-20-jueves]
- **El motor de alertas del hato NO esta muerto pese a 11 dias sin generar nada.** Ultima alerta
  creada 2026-08-09; el tick responde `generadas: 0` a diario. Verificado que es correcto:
  `select ... from v_hato_estado_actual where estado='activa' and (fecha_probable_parto between
  current_date-30 and current_date+14 or fecha_secar <= current_date ...)` => **0 filas**. No
  re-investigar salvo que aparezcan vacas en ventana y siga en 0. [corrida: 2026-08-20-jueves]
- **El motor de acciones recomendadas (101/102) esta sano.** 5 corridas, todas por cron a las
  10:50 UTC, la de hoy `estado='ok'` con 9 acciones y 0 rechazos; las anteriores `parcial` con
  1-2 rechazos (el validador anti-invento operando, no un fallo). Las 9 acciones publicadas hoy
  son todas de plantilla+ranuras ligadas a `hecho_id` — 0 texto libre. [corrida: 2026-08-20-jueves]
- **Los 2 huecos de quincenal del hallazgo #26 se llenaron**: `hato_produccion_quincenal` tiene
  2026-07 Q2 (5.938 L) y 2026-08 Q1 (5.564 L), ambas `medido` con `litros_total` NULL como manda
  el CHECK de la 070. 2026-08 Q2 aun no vence. → **UPDATE #26, no refilar.**
  [corrida: 2026-08-20-jueves]
- **Las filas `derivado_mensual` de quincenal COMPARTEN un `fin_ingreso_id` entre Q1 y Q2 del
  mismo mes, y eso es correcto**: son el backfill mensual partido en dos, y `sum(litros_total)`
  de las dos cierra EXACTO contra `fin_ingresos.cantidad` en los 10 meses probados. No es doble
  conteo. Lo seria sumar `fin_ingresos.cantidad` a traves del FK; sumar `litros_total` es lo
  correcto. [corrida: 2026-08-20-jueves]
- **Migraciones 093, 097 y 100 ESTAN aplicadas a produccion.** El root CLAUDE.md dice lo
  contrario, con la advertencia de 097 invertida. Verificado contra el catalogo vivo por
  triangulacion (Data Integrity, Infra, Release + el orquestador): 0 llamadas desnudas a
  es_usuario_gerencia/get_user_role en 82 policies; las 2 RPC multi de 097 existen SECURITY
  INVOKER; 48/53 gan_movimientos con grupo_id. NO re-investigar. [corrida: 2026-08-20-jueves]

## Navegacion (corrida 2026-08-20-jueves)
- **El ref local `main` puede estar RANCIO frente a `origin/main`.** El 2026-08-20 estaba 29
  commits atras (cfae769 vs 8306dbf) y `git show main:<path>` devolvia codigo de 9 dias antes,
  sin fallar. **Regla: arrancar toda corrida con `git rev-parse HEAD main origin/main` y leer por
  `git show HEAD:<path>` si no coinciden.** [corrida: 2026-08-20-jueves]
- Columnas que rompen queries escritas de memoria: `gan_movimientos` **no tiene `potrero_id`** —
  son `potrero_origen_id`/`potrero_destino_id`, y los ajustes y compras usan `potrero_destino_id`
  incluso con delta negativo. `movimientos_diarios_productos` usa **`cantidad_utilizada`** (no
  `cantidad_usada`). `hato_eventos` no tiene `origen` (es `fuente`; `hato_animales` si tiene
  `origen`). `hato_alertas` usa `fecha_programada` (no `fecha_generada`). `hato_correcciones` y
  `acciones_corridas` **no tienen `created_at`** (`acciones_corridas` usa `generado_at`).
  [corrida: 2026-08-20-jueves]
- **El ledger `supabase_migrations.schema_migrations` gano 5 filas el 2026-08-17** (097-100 mas
  `ganado_revertir_duplicado_carga_inicial`, sin archivo). 083-096 y 101-102 siguen aplicadas SIN
  fila. La regla de comparar por NOMBRE y verificar contra el catalogo vivo se confirma otra vez.
  [corrida: 2026-08-20-jueves]
- `cron.job` tiene 4 jobs activos: 1 `clima-sync-wu` (*/5), 2 `clima-daily-rollup` (15 5 * * *),
  4 `hato-alertas-tick` (45 10), 6 `acciones-recomendadas-tick` (50 10). Un `succeeded` en
  `cron.job_run_details` NO prueba que el endpoint hizo algo: el 2026-08-20 las 360 corridas del
  clima fueron `succeeded` y las 71 ultimas devolvieron `{"message":"No data available"}`. La
  prueba real esta en `net._http_response.content`. [corrida: 2026-08-20-jueves]

## Baselines (corrida 2026-08-20-jueves)
| Deltas 10 dias (08-10 → 08-20) | hato_pesajes_leche **+173** (376→549, backfill de jul + 08-05 y 08-12) · gan_movimientos +27 (26→53) · movimientos_diarios +16 (140→154) · mdp +64 (693→749) · hato_eventos +10 (756→766) · fin_gastos +10 (4.464→4.474) · fin_ingresos +2 (230→232) · quincenal +2 (80→82) · **monitoreos 0, rondas 0, chequeos 0, movimientos_inventario 0, compras 0, aplicaciones 0** | 2026-08-20-jueves |
| Integridad referencial | **0 huerfanos en todas las relaciones probadas** (md↔aplicaciones, mdp↔md, mdp↔productos, md↔lotes). 0 mdp con cantidad invalida · 0 md con fecha futura · 0 gastos futuros (bug UTC no reaparecio) · 0 gastos/ingresos nuevos sin `created_by` · 0 gastos en estado != Confirmado · 0 productos con stock negativo · 0 movimientos ganado pendientes. Sin cambio: 86 monitoreos con ronda_id NULL (#7) · 1 md fuera de ventana (#24) · 3 divergencias libro-vs-stock, identicas (#29: Sulcamag −8.000, Naturboro −20, TecniFeed Boro +18,69) · 2 eventos post-salida · verificacion de inventario del 2026-07-30 sigue abandonada, 223 detalles / 0 contados | 2026-08-20-jueves |
| Clima | **Sync CAIDO al momento del barrido**: ultima lectura 9,1 h (2026-08-19 21:05 Bogota), 71/71 respuestas `No data available` en 12 h, cron OK. Ayer 164/288 lecturas (57%) con hueco de 7 h. `contador_congelado` **19/90 (21,1%) y 8/30** — la memoria de Infra lo tiene como «plano 5/30 (17%), no refilar»; **subio, conviene que Infra lo re-mida** | 2026-08-20-jueves |
| Conteos de dominio | hato_animales 179 · hato_eventos 766 · partos 300 · chequeos 33 / chequeo_vacas 1.479 (ultimo 2026-07-09, 42 dias — dentro del intervalo normal, no es hallazgo) · pesajes 549 (ultimo 2026-08-12; falta la semana del 07-29 y la del 08-19) · quincenal 82 · alertas 64 (ultima creada 08-09) · hato_correcciones 10 (eran 0) · monitoreos 4.200 / 29 rondas (ultima 2026-07-29, 22 dias — ambar en SaludDatos, rojo a los 28) · productos 341 · movimientos_inventario 155 · movimientos_diarios 154 / mdp 749 · gan_movimientos 53 / gan_inventario 34 potreros / **369 cabezas** · acciones_corridas 5 / acciones_recomendadas 38 | 2026-08-20-jueves |
