# Esco 2.0 — M1 de los dominios restantes de fase 1

Fecha: 2026-11-03 (Bogotá). Dominios: aplicaciones, monitoreo (con conductividad), clima observado
y hato lechero. Mismo método que labores (M1 de M2.5).

Los snapshots, las referencias y los casos son privados (`docs/Esco 2.0/`, fuera de git). Este
documento trae solo cifras agregadas: ningún valor de referencia por caso, ninguna fila y ningún
nombre de persona.

## Método

- Lectura de producción solo por la ruta de solo lectura de Composio
  (`SUPABASE_RUN_READ_ONLY_QUERY`). Las filas van a archivo, nunca al chat.
- Un snapshot por dominio, con su SHA256 y el SQL exacto que lo produjo.
- Referencias recalculadas con el SQL del golden. Suma de control idéntica antes y después en los
  cuatro dominios, y la suma de control del snapshot coincide con la de producción.
- Cuando la pregunta depende de qué estaba cargado a esa hora, la referencia se calcula también con
  `created_at <= as_of` y la diferencia queda anotada en el caso.
- El held-out no se abrió.
- Costo de modelo y de API: cero. Todo es SQL y motores puros ejecutados en local.

| Dominio | Tablas | Filas | Casos usables | Anclas | Excluidos |
|---|---|---|---|---|---|
| Aplicaciones | 12 | 2.101 | 7 | 35 | 1 |
| Monitoreo | 8 | 5.453 | 8 | 31 | 3 |
| Clima | 1 | 1.983 | 6 | 14 | 2 |
| Hato lechero | 9 | 3.609 | 9 | 19 | 4 |
| **Total** | | | **30** | **99** | **10** |

## Clasificación de los 39 casos revisados

| Clasificación | Casos |
|---|---|
| Usable sin cambio | A01, A03, A05, A06, M01, M03, M05, L10, X06, C01, C02, C03, C05, C06, H01, H02, H03, H04, H05, H06, H09, H10, H11 |
| Usable con referencia o nota corregida | A02 (R1), A04 (carga posterior), A07 (anclas nuevas), M02 (agrupar por ronda), M04 (motor reproducido), X05 (dato cambiado y must en disputa), C04 (día sin fila) |
| Incompleto o no verificable | H07 y H12 (el golden ya los excluye), H08 (necesita un fixture sintético) |
| Fuera de fase 1 | C07 y C08 (pronóstico), M06 (informes de visita), X04 (búsqueda web), P01 (producción), H13 (varios negocios) |

Casos con el dominio mal etiquetado en el golden: L10 es monitoreo, no labores. X05 y X06 son
conductividad (monitoreo), no meta. C08 tiene una mitad de aplicaciones.

## Hallazgos que cambian una referencia

1. **A04 — carga posterior.** El valor del golden cuenta movimientos registrados después de la
   pregunta. A la hora de la pregunta estaba cargado cerca del 75 % de esas canecas. El caso usa la
   fecha del movimiento (lo que ve el ejecutor sobre el snapshot) y anota la cifra cargada.
2. **M02 — agrupar por ronda.** El golden agrupa por fecha. Con `ronda_id` (contrato del módulo),
   la primera ronda de dos lotes junta dos fechas y su porcentaje de cuaje baja unos 6 a 7 puntos.
   Las últimas rondas no cambian.
3. **C04 — día sin fila.** El golden dice que octubre no tiene días sin dato. El 2026-10-09 no tiene
   fila en `clima_resumen_diario`, así que las dos ventanas del caso tienen un día sin dato. Sin fila
   también: 2026-03-28, 2026-03-29 y 2026-08-28.
4. **X05 — dato cambiado.** El promedio de conductividad de junio cambió desde que se congeló el
   golden. No es ancla.
5. **M04 y A07** no tenían cifra. M04 usa ahora la salida de `priorizarMonitoreo` reproducida sobre
   el snapshot a la fecha de la pregunta. A07 usa el SQL de mano de obra del golden.

## R1 — costo de insumos de aplicaciones

**El costo histórico existe, pero solo congelado al cierre, y una parte está subvalorada.**

- `aplicaciones.costo_total_insumos` se congela al cerrar, con `productos.precio_unitario` de ese
  día (`CierreAplicacion.tsx` → `construirPayloadCierreAplicacion`). Es igual, al peso, a la suma de
  `movimientos_inventario.valor_movimiento` de las salidas por aplicación (22 de 22 cerradas).
- `productos.precio_unitario` no guarda historia. Los lectores de costo por lote
  (`get_cost_by_lote` y `get_application_cost_by_lote` en `chat.tsx`, `useCostoKg`,
  `aplicacionesReales.ts`) multiplican por el precio de hoy. Sobre las 22 aplicaciones cerradas eso
  da **+37 %** frente a lo congelado. 8 de 22 difieren más de 1 %, y una 41 veces.
- La causa son cuatro fertilizantes comprados el 2026-04-25 con un costo unitario capturado unas 50
  veces bajo (la presentación es de 50 kg). El precio en `productos` se corrigió el 2026-10-19,
  después de los tres cierres de fertilización afectados. `compras` conserva el mismo error.
  Solo 27 de los 81 productos usados tienen alguna compra.

**Qué se puede prometer:**

| Caso | Promesa honesta |
|---|---|
| A02 | Costo de consumo por tipo según aplicaciones cerradas, rotulado «precio vigente al cierre», con aviso de que tres cierres de fertilización están subvalorados por un error de captura de precio. La variante por compras es finanzas: fuera de fase 1. |
| A03 | Cualquiera de las dos cifras, rotulada: en esta aplicación difieren 0,2 %. El agua no se registra. |
| A07 | Mano de obra por lote es histórica. Insumos por lote solo existen a precio de hoy: se rotulan «valorizado a precio actual», nunca como costo histórico. |

## Reuso (R4)

| Calculador | Uso | Veredicto | Evidencia |
|---|---|---|---|
| `lluviaConfiableDeResumen`, `esCotaInferior` (`escoClimaCalidad.ts`) | toda lectura de lluvia | Reusar | Sumas por ventana iguales a la referencia en C03, C04 y M05. |
| `resumenDiarioToAgregada` (`calculosClima.ts`) | lluvia y clima por rango | Reusar | Mismas filas y mismos totales que el SQL. |
| `calcularRachaSinLluvia` | días sin lluvia | Reusar con cuidado | Umbral por defecto 10 mm: pasar umbral explícito. No cuenta el día de corte (C02 da un día menos que el golden). |
| `wm2ToEnergiaDiaria`, `calcularTiempoSolHoras` (`calculosRadiacion.ts`) | energía y horas de sol | Reusar | C06 reproduce la energía de mayo. |
| `calcularIncidencia`, `clasificarGravedad` (`calculosMonitoreo.ts`) | incidencia ponderada, 10/30 | Reusar | M01 reproduce. |
| `priorizarMonitoreo`, `calcularCoberturaRonda` | prioridades | Reusar el motor, no el hook | El motor es puro y reproducible con `fechaReferencia`. El hook `usePriorizacionMonitoreo` pasa todos los movimientos diarios (también fertilización y drench) como «fumigación», no pasa `fechaReferencia` y usa los lotes activos de hoy. |
| `calcularEstadoCE` (`calculosMonitoreoV2.ts`) | semáforo de conductividad | Bloqueado: decisión del dueño | La app llama «bajo» a CE < 0,5 (en rango 0,5–1,5) y marca rojo la última ronda del caso X06. El golden pide «< 0,5 verde». |
| `derivarSexoCria` (`calculosHato.ts`) | sexo de la cría | Reusar en vez del SQL del golden | Lee primero `sx_raw`: deja 2 partos sin sexo contra 21 del SQL. El primer lugar de H01 no cambia, pero otro conteo sí. |
| `derivarEstadoReproductivo` | estado reproductivo | Reusar, con límite | Recibe una fila de `v_hato_estado_actual`, que es solo de hoy. No hay réplica as-of sin reconstruir esa fila desde eventos y chequeos. |
| `aggregateInsumosPorLote` (`cost-aggregation.ts`) | insumos por lote | Bloqueado por R1 | Precio de hoy, sin conversión de unidades (hoy solo hay Kilos y Litros, así que es latente). |

## Contratos de datos aplicados

- Clima: historia en `clima_resumen_diario`, nunca `clima_lecturas`. Estación Ecowitt por
  `station_id not like 'wunder%'`: su `station_id` termina con un espacio.
- Monitoreo: agrupar por `ronda_id`. Sin fila = no revisado, nunca 0 %. `mon_conductividad.ronda_id`
  es NULL en las 147 filas, así que en conductividad la ronda es la fecha.
- Hato: identidad por ficha (`hato_animales.id`), no por chapeta. Pesaje ausente = sin dato. Ventas
  y dinero del hato fuera del snapshot.
- Aplicaciones: `aplicaciones_lotes_planificado` está vacía (0 filas) y no entra.
  `aplicaciones_compras` es una foto congelada y no entra.
- Datos personales excluidos: responsables, monitores, veterinario, correos, notas y observaciones.
  Única excepción: el texto de la causa de muerte de un animal (un evento), que el caso H09 necesita.

## Brechas de datos

| Brecha | Dueño |
|---|---|
| Precio de cuatro fertilizantes en las compras del 2026-04-25 y tres cierres subvalorados | Dueño / inventario (clase datos) |
| Semáforo de conductividad: la app y el golden dicen cosas opuestas | Dueño con la agrónoma |
| El must de X05 sobre «4 mediciones por lote y por mes» no lo sostienen los datos (cada fila trae 30 árboles) | Dueño (revisar el must) |
| Rondas con cuaje 0 explícito: ¿floración no capturada o cero real? | Captura de monitoreo |
| Cuatro días sin fila de resumen de clima | Clima (backfill) |
| Una vaca con parto probable 10 días vencido y sin parto registrado al 2026-11-03 | Hato |
| Un movimiento de la aplicación con dron dice equipo «Fumiducto» | Aplicaciones |

## Límites

- El golden es conjunto de desarrollo, no held-out.
- Los snapshots son de producción al 2026-11-04 01:21–01:31 UTC. Las referencias as-of se apoyan en
  `created_at`; no hay historial de cambios, así que una fila editada después no se puede devolver a
  su valor de entonces.
- El perfil estacional que usa M04 no es as-of.
