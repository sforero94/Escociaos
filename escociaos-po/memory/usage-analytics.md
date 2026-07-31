# Memoria — Usage Analytics

Escrita solo por el orquestador (ver `README.md`). Inyectada completa en el
prompt del agente en cada corrida.

## Estados aceptados
- Cobertura de pesajes de leche: junio 2026 tiene un hueco documentado y aceptado — excluirlo de las metricas de adopcion o marcarlo, nunca contarlo como caida de uso. [seed 2026-07-31]
- Filas creadas por el bot de Telegram llevan `created_by = NULL` (service role, sin `auth.uid()`) — 'Sin usuario' en gastos/ingresos post-triggers es el bot, no un bug de atribucion. [seed 2026-07-31]
- Las correcciones pre-aprobacion del chequeo (ventana B0) NO dejan rastro en la DB — el commit borra e inserta fresco. La tasa de correccion no es medible por SQL; requeriria instrumentar el endpoint de preview. No volver a buscarla en las tablas. [corrida: 2026-07-31-dryrun-lunes]
- Cadencia de chequeos del hato: intervalo historico ~65-71 dias (2026: 02-25 -> 04-29 -> 07-09). Proximo chequeo real esperado ~2026-09-08 +/- 1 semana. Antes de esa fecha, cero chequeos nuevos NO es senal de abandono. [corrida: 2026-07-31-dryrun-lunes]


## Refutaciones
| Fingerprint | Afirmacion | Por que murio | Corrida |
|---|---|---|---|
| usage-analytics/monitoreo/colapso-y-vista-ciega | El monitoreo colapso (jun 29 / jul 15 obs) y la priorizacion de scouting quedo ciega | Refutada por tres errores: (a) jun+jul son UNA ronda partida por calendario (Ronda 28, 44 filas, 12 sublotes) — agrupar por ronda_id, nunca por fecha_monitoreo; (b) el baseline 2025 es importacion masiva (created_at 2025-11-25 en todas), no captura viva; (c) jun-ago son los 3 meses MAS BAJOS de 2025 — se cito el minimo anual como prueba de no-estacionalidad. Y la vista NO esta ciega: usePriorizacionMonitoreo.ts toma la ronda mas reciente sin corte por antiguedad. Sobrevivio una version menor: cobertura cayo ~60% en mayo (Ronda 24=134 combos/18 sublotes -> Ronda 28=44/12) y los sublotes no visitados desaparecen sin indicador de 'no revisado'. | 2026-07-31-dryrun-lunes |


## Navegacion

- `usuarios.last_login` es NULL en las 7 filas — NO sirve como senal de adopcion; usar `created_by` + `created_at` de las tablas de dominio. Hay dos cuentas 'Consuelito' (Gerencia) y la atribucion de gastos se parte entre ellas. [corrida: 2026-07-31-dryrun-lunes]
- El campo `monitor` de `monitoreos` es senal de dotacion: 'Clara, Daniela' hasta abril 2026, 'Clara' sola desde mayo — explica la caida de cobertura mejor que cualquier hipotesis de software. [corrida: 2026-07-31-dryrun-lunes]


## Baselines
| Metrica | Valor | Corrida |
|---|---|---|
| Pulso semanal (primera medicion) | hato backfill completo, captura viva = 0 filas · monitoreos jul=15 · registros_trabajo 76/sem · fin_gastos 26/sem (avg4w 28,8) · chat Esco 18 msgs/28d | 2026-07-31-dryrun-lunes |
| Monitoreo por ronda | Ronda 24 = 134 combos/18 sublotes/6 lotes · Ronda 26 = 103/19/7 · Ronda 27 = 55/12/4 · Ronda 28 = 44/12/4 | 2026-07-31-dryrun-lunes |
| Hato alertas y completitud | 48 pendiente / 14 descartada · destinatario_telegram_id NULL en los 5 tipos · telegram_mensajes 0 · hato_animales 100% sin raza, 19/80 sin fecha_nacimiento, 8/80 chapetas provisionales | 2026-07-31-dryrun-lunes |


## Archivo
(vacio)
