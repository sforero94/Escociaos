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

## Refutaciones
| Fingerprint | Afirmacion | Por que murio | Corrida |
|---|---|---|---|
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

## Baselines
| Metrica | Valor | Corrida |
|---|---|---|
| Conteos de dominio | hato_animales 171 (80 activas, 8 provisionales) · eventos 768 (servicio 412 · parto 333 · aborto 23 · secado_real 0) · chequeos 33 / chequeo_vacas 1.479 · pesajes 364 (ULTIMO 2026-06-24, 0 en 30 dias) · quincenal 79 · alertas 62 · monitoreos 4.176 / 29 rondas · mov_inventario 137 (104 salidas + 33 entradas) · compras 26 · aplicaciones 18 · movimientos_diarios 132 / 661 productos · productos activos 223 · fin_gastos 4.426 · logs_auditoria 0 | 2026-08-03-lunes |
| Integridad referencial | 0 huerfanos en TODAS las relaciones probadas (chequeo_vacas→chequeos/animales, eventos→animales, pesajes→animales, movimientos_diarios→aplicaciones, mdp→md/productos, monitoreos→rondas). 0 chapetas duplicadas entre activas, 0 eventos post-salida, 0 modulos_acceso invalidos | 2026-08-03-lunes |
| Clima | ultima lectura <1 min · 0 duplicados (station,timestamp) · resumen_diario 90/90 dias sin huecos · `lluvia_confianza='contador_congelado'` en **17 de 90 dias (~19%)** vs 16/90 la corrida anterior — PLANO, no escalando. Si sube claramente por encima de ~20%, escalar a Infra como revision FISICA del sensor | 2026-08-03-lunes |
| Migraciones | 073/074/075/076 confirmadas aplicadas (20260731172047/172108/172121/172231) | 2026-08-03-lunes |

## Archivo
(vacio)
