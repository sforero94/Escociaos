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

## Refutaciones
| Fingerprint | Afirmacion | Por que murio | Corrida |
|---|---|---|---|
| data-integrity/inventario/productform-valor-rancio-P1 | Editar un producto sobrescribe `cantidad_actual` con un valor RANCIO, y eso es P1 con exposicion de 7 ediciones + 148 productos | El MECANISMO sobrevivio (el campo es editable, `dataToSave` lleva `cantidad_actual`, no hay trigger ni gate de rol, RLS deja pasar a Administrador y Gerencia) pero **el encuadre y la severidad murieron**. "Rancio" = 0 instancias: de las 7 ediciones post-movimiento, 4 reescribieron el MISMO valor (delta 0.00) — el formulario recarga de la BD al abrir. Las 2 escrituras daninas fueron cambios deliberados que ademas dejaron el stock FISICAMENTE CORRECTO (Naturboro: el usuario precargo 20 L al crear y la factura 68444 sumo los mismos 20 L; volver a 20 era la respuesta correcta). Sulcamag NO es este bug: su `precio_unitario` (669,96) no coincide con el derivado (996,00) y ProductForm siempre reescribe el derivado — fue un UPDATE a pelo del 2026-07-24. Los 148 sin ledger son saldos de apertura. **Radio real: 2 de 341, no 7 ni 148.** Ningun reporte consume `cantidad_actual` (las finanzas leen `fin_gastos`/`fin_ingresos`; costo/kg lee `movimientos_diarios_productos`). Baja a **P2**: a diferencia del caso del `onWheel`, este SI disparo — dos veces — y deja dos huecos permanentes sin explicacion en el libro. | 2026-08-06-jueves |
| data-integrity/globalgap/productos-escala-severidad | `productos`/`movimientos_inventario` heredan la escalada de severidad de GlobalGAP | Refutada por regla: §5 escala solo `aplicaciones*` y `movimientos_diarios*`. Ninguna de las dos tablas pertenece a esas familias. Hay un argumento sustantivo de trazabilidad de insumos, pero la regla tal como esta escrita no lo cubre — no escalar. | 2026-08-06-jueves |
| data-integrity/monitoreo/plagas-sin-umbral-omitidas | Las plagas sin fila en `pest_umbral_economico` se omiten de la priorizacion | Refutada leyendo el motor: `priorizacionMonitoreo.ts` construirSeries() les crea serie propia con grupo_key null y cae al tercil estadistico. Las 14 plagas activas sin umbral SI aparecen. | 2026-07-31-dryrun-lunes |

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

## Archivo
(vacio)
