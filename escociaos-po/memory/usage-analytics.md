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

## Refutaciones
| Fingerprint | Afirmacion | Por que murio | Corrida |
|---|---|---|---|
| usage-analytics/monitoreo/colapso-y-vista-ciega | El monitoreo colapso y la priorizacion quedo ciega | Refutada por tres errores: (a) jun+jul son UNA ronda partida por calendario — agrupar por `ronda_id`, NUNCA por `fecha_monitoreo`; (b) el baseline 2025 es importacion masiva, no captura viva; (c) jun-ago son los 3 meses MAS BAJOS de 2025. Y la vista NO esta ciega. Sobrevivio una version menor: la cobertura cayo y los sublotes no visitados desaparecen sin indicador de "no revisado". | 2026-07-31-dryrun-lunes |

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

## Baselines
| Metrica | Valor | Corrida |
|---|---|---|
| Pulso semanal | registros_trabajo 62/sem (avg4w 56,3) · fin_gastos 25/sem (avg4w 27,0) · monitoreos 21 (Ronda 29 ABIERTA) · chat Esco 18 msgs/28d, 1 usuario · **telegram_mensajes 48 (TODAS salientes, 0 entrantes historicos)** · hato captura viva = 0 · clima sano | 2026-08-03-lunes |
| Monitoreo por ronda | R24=129 combos/18 sublotes/6 lotes · R26=103/19/7 · R27=55/12/4 · R28=44/12/4 · R29=21/6/2 (EN CURSO, **no comparable hasta que cierre**). R24 bajo de 134 a 129 por las migraciones 075/076, no por cambio de uso | 2026-08-03-lunes |
| Hato alertas y completitud | 46 enviada / 14 descartada / 1 respondida / 1 expirada / **0 pendiente** · destinatario = 8505349717 (Santiago) en los 5 tipos · **tasa de respuesta 1/47 = 2%** · 0 escaladas · activas 80: 80 sin raza, 19 sin fecha_nacimiento, 28 sin madre, 8 provisionales, **0 fichas completas** (sin cambio en 3 dias) | 2026-08-03-lunes |
| Quien escribe (28d) | David Garcia 45 · Consuelito 94 · Efrain 22 · Santiago 22 · **Martha Vega 0** · sin usuario 206 (previas al trigger 074) | 2026-08-03-lunes |

## Archivo
(vacio)
