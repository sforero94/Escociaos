# Plan de Diseño e Implementación — Módulo Hato Lechero

**Fecha:** 2026-07-17 · **Estado:** Aprobación de diseño (pre-implementación) · **Detalle visual:** fuera de alcance (paso posterior)

Fuentes: entrevista con Martha (administradora, llamada 2026-07-17, Notion "Vaquitas Lecheras"), análisis de los 5 archivos Excel entregados (chequeos 2019–2026, terneras 2017+, promedio leche 2025, gastos FOV 2026), y revisión del código/esquema existente de Escocia OS.

---

## 1. Resumen ejecutivo

El hato lechero de Subachoque (~40–45 vacas en ordeño + levante) se administra hoy en Excel con buena disciplina de captura pero **cero lazo de seguimiento**: las fechas de secado se calculan y no se ejecutan, los tratamientos del veterinario se olvidan, y las inseminaciones ocurren (o no) sin quedar registradas. El módulo convierte ese flujo en un **motor de seguimiento reproductivo con lazo cerrado**: chequeo → fechas calculadas → alerta por Telegram a Fernando → confirmación sí/no → ficha actualizada → siguiente fecha.

Tres capítulos funcionales (los mismos de la entrevista):

1. **Control de animales** — ficha individual (hoja de vida) + captura del chequeo veterinario bimestral.
2. **Ordeño** — pesaje semanal por vaca + litros diarios al camión → PL calculado, proyecciones.
3. **Ingresos y gastos** — ya cubierto por Finanzas (negocio "Hato Lechero"); este módulo lo consume, no lo duplica.

Capacidad estrella: **alertas proactivas por Telegram** (secado, tratamientos multi-paso, servicios sin confirmar, rechequeos, partos próximos), sobre la infraestructura de bot ya validada con David.

**Principio rector no negociable: cero carga nueva para Martha.** Todo lo que hoy no se registra lo captura el sistema preguntándole a quien está en el ordeño — no agregando columnas al trabajo de Martha.

---

## 2. Diagnóstico de datos (qué tenemos, qué falta)

### Tenemos

| Fuente | Cobertura | Calidad |
|---|---|---|
| Chequeos veterinarios | **29 hojas**, 2019→jul 2026, ~bimestrales, formato consistente 7 años (#, Nombre, PL, #P, Última Cría, SX, F Servicio, Toro, TP, Estado, Secar, PP, TTTO) | Media: celdas multi-fecha ("20/04/2026/3/06/26"), `#VALUE!`, notas mezcladas en columnas |
| Registro de terneras | **90 registros únicos** (números 106–215) desde 2017; 88 con fecha de nacimiento; madre casi siempre presente | Buena para fechas/madre; **padre solo en 36/90 (40%)** |
| Vacas distintas en el histórico | **132 nombres** a lo largo de los chequeos | Salidas (venta/muerte) solo implícitas: la vaca "desaparece" |
| Promedio de leche | Solo abril y junio 2025 (matriz vaca × pesaje AM/PM) | Fechas de columna corruptas en Excel; archivo abandonado |
| Gastos FOV 2026 | Matriz P&G mensual (ingresos leche/terneras/vacas arriba, gastos por sección abajo) | Mezcla Subachoque (hato) con Villeta y Bogotá casa (NO hato) |

### Falta (huecos confirmados)

- **Padre de la cría** en 60% de las terneras → limita el análisis genético que quiere hacer el papá.
- **20 números ausentes** en el rango 106–196 (probablemente machos vendidos nunca registrados).
- **Archivo de flujo de leche** diario (Martha quedó de enviarlo).
- **Registro explícito de ventas/muertes** de vacas — hoy se infiere por desaparición.
- **Celos e inseminaciones ejecutadas entre chequeos** — el hueco central que motivan las alertas.
- **Nómina abr–jun 2026** en Finanzas (Excel de Consuelito saturado) — pendiente de Finanzas, NO de este módulo.
- Edad de vacas anteriores a 2017 (cuadernos de Nathalie) — se marca "sin fecha de nacimiento", nunca se inventa.

---

## 3. Decisiones ya tomadas (Santiago, 2026-07-17)

| # | Decisión | Implicación de diseño |
|---|---|---|
| D1 | **El # de vaca es chapeta permanente, nunca se recicla** | `numero` es llave de identidad fuerte: `UNIQUE(numero)` global en `hato_animales`. La importación usa numero como llave primaria de resolución y el nombre como validación; cualquier contradicción en el histórico se marca para revisión (no se asume reciclaje). |
| D2 | **Fernando tiene Telegram y puede recibir/responder en Subachoque** | El lazo cerrado va dirigido a Fernando como respondiente primario; escalamiento a Martha a las 48h sin respuesta. |
| D3 | **Alcance: vacas + terneras/novillas retenidas.** Machos vendidos (OV) quedan solo como eventos de parto, sin ficha propia | Ficha individual para todo animal hembra retenido (base de genealogía y levante). Menos fabricación de registros en la importación. |
| D4 | **Las alertas deben estar funcionando ANTES de la visita (6 de agosto)** | El motor de alertas (W6) se adelanta al tramo pre-visita. Prerequisito duro: sesión remota de validación de datos con Martha antes del encendido (una alerta con datos malos quema la confianza de Fernando). Encendido escalonado: primero en "modo sombra" hacia Martha/Santiago, luego a Fernando. |

---

## 4. Visión de producto y actores

### Jobs-to-be-done

| Quién | Job | Resultado |
|---|---|---|
| **Martha** | Pasar la planilla del chequeo al sistema una sola vez y que las fechas se calculen y vigilen solas | Deja de ser la memoria y el policía del hato |
| **Fernando** | Recibir "la vaca 47 se debe secar hoy — ¿ya se secó?" y responder con un botón | Ejecuta sin depender de que Martha se acuerde |
| **Papá (dueño)** | Ver números del negocio y genealogía para decidir toros | Decisiones con datos, no con memoria |
| **Santiago** | Todo el negocio lechero en Escocia OS, sobreviviendo a la salida de Consuelito | Un sistema, un login, Esco responde del hato |

### Mapa de actores y permisos

| Actor | Canal | Permisos |
|---|---|---|
| Martha | Web + Telegram (resúmenes) | Escritura total (rol Administrador) |
| Fernando | **Solo Telegram** | Escritura vía bot (confirmaciones, litros, pesajes) |
| Ordeñadores (Dina et al.) | Telegram (por definir en visita) | Pesaje vía bot |
| Papá | Web solo lectura + Esco | Lectura |
| Consuelito | Finanzas existente | **Sin rol nuevo** — el diseño asume su ausencia |
| Veterinario | Papel (planilla, idealmente pre-llenada) | Ninguno |

---

## 5. Alcance

### Dentro
1. Ficha por animal (hoja de vida): identidad, estado, historial reproductivo, tratamientos, producción, genealogía.
2. Captura del chequeo bimestral (grilla planilla → app, pre-llenada con el chequeo anterior).
3. Motor de fechas + alertas Telegram con lazo cerrado (secado, tratamientos multi-paso, servicios, rechequeos, partos).
4. Control de ordeño: pesaje semanal por vaca + litros diarios al camión; PL calculado.
5. Tablero: KPIs de producción y reproducción + listas de acción.
6. Importación histórica 2017–2026 (asistida, con reporte de calidad y sesión de revisión con Martha).
7. Genealogía para selección de toros.
8. Integración de lectura con Finanzas ("Hato Lechero": $/litro, margen).

### Fuera (explícito)
- Rehacer Finanzas (gastos/ingresos/presupuesto ya existen; la leche sigue entrando por `fin_ingresos`).
- Recuperar nómina abr–jun 2026 (tarea de datos de Finanzas, se gestiona aparte).
- Gastos de Villeta y Bogotá casa del Excel FOV (no son del hato; no se importan).
- Calendario sanitario preventivo completo (solo lo que aparece en el chequeo, por ahora).
- Reemplazar la planilla de papel (el sistema la asiste; a futuro la genera pre-llenada).
- Diseño visual detallado (paso siguiente).

### Relación con el módulo Ganado existente (`/ganado`, tablas `gan_*`)
Son dominios distintos: `gan_inventario` es **conteo por cabezas** para ceba (novillos/toros por potrero) y no puede representar vacas/terneras sin cambio de esquema. El hato lechero es **registro individual**. Decisión: módulo nuevo con prefijo `hato_`, excluido de `gan_inventario`. Puntos de contacto deliberados: reutiliza `gan_fincas` (Subachoque ya existe) y las ventas/compras siguen pasando por `fin_transacciones_ganado` con un vínculo nuevo a la ficha individual (ver §7.2). Conteos del hato vía vista derivada, nunca copiados a `gan_inventario`.

---

## 6. Épicas y requisitos (P0 = pre-visita · P1 = sept–oct · P2 = explorar)

### Épica A — Fichas individuales
- **A1 (P0)** Lista del hato (número, nombre, estado, PL, próximo evento).
- **A2 (P0)** Ficha completa por vaca: identidad, partos, servicio vigente, toro, TP, fechas proyectadas, tratamientos, notas.
- **A3 (P1)** Línea de tiempo reproductiva por vaca.
- **A4 (P0)** Registro de eventos de ciclo de vida (parto con destino de cría, venta, muerte, cambio de etapa).
- **A5 (P1)** Árbol genealógico (madre/padre/crías desde TERNERAS).
- **A6 (P2)** Advertencia de consanguinidad al proponer toro.

Criterios clave: máquina de estados estructurada (`novilla → servida → preñada → próxima a secar → seca → parida…` + terminales `vendida`/`muerta`); las abreviaturas del dominio (OV, AV, A+, O+, A{n}, TJ, ins {toro}, OK, Rech) se mapean a eventos estructurados pero la UI habla el vocabulario de Martha; ningún animal se elimina jamás; el # es la llave visible en todo el módulo.

### Épica B — Chequeo veterinario
- **B1 (P0)** Grilla "nuevo chequeo" pre-llenada con el chequeo anterior; Martha solo digita lo que cambió.
- **B2 (P0)** Cálculo automático de SECAR (servicio + 7 meses) y PP (servicio + 9 meses), sin `#VALUE!`.
- **B3 (P0)** TTTO estructurado con pasos y fechas (ej. estrumate día 0 → servir día 7) + nota libre siempre disponible.
- **B4 (P0)** Borrador persistente (transcribe ~45 vacas; no puede perder avance).
- **B5 (P1)** Planilla pre-llenada imprimible para llevar al chequeo.
- **B6 (P2)** Foto de planilla → OCR propone cambios sobre la misma grilla; nunca aplica sin revisión.

Criterios clave: el chequeo es un evento con identidad (patrón `rondas_monitoreo`); vaca sin novedad = cero digitación; una fecha por campo con validación dura; al cerrar, resumen de acciones generadas ("7 tareas, 3 secados en ventana, 2 rechequeos") para validación final.

### Épica C — Alertas Telegram con lazo cerrado (capacidad estrella)
- **C1 (P0)** "Vaca 47 (Estrella) se debe secar hoy. ¿Ya se secó?" [Sí / Todavía no / Otra cosa] → registra `secado_real`.
- **C2 (P0)** Recordatorio de pasos de tratamiento el día que tocan, con confirmación.
- **C3 (P0)** Seguimiento de "servir al próximo celo": pregunta periódica "¿ya se sirvió la 15? ¿qué día y con qué toro?".
- **C4 (P0)** Resumen a Martha de confirmado/pendiente/vencido (supervisión por excepción).
- **C5 (P1)** Aviso de rechequeos pendientes antes del próximo chequeo.
- **C6 (P1)** Configuración de destinatarios y horarios por tipo de alerta sin tocar código.
- **C7 (P1)** Reporte espontáneo de eventos ("la 22 parió anoche, macho") con conversación guiada.

Criterios clave: toda alerta es accionable y cerrable con botones; "No" repregunta motivo y reagenda; sin respuesta → reintento +1 día, escalamiento a Martha a las 48h — **nada se pierde en silencio**; número + nombre siempre juntos; anti-fatiga: mensajes agregados por franja, nunca ráfagas; toda respuesta escribe evento auditado (quién, cuándo, qué).

### Épica D — Control de ordeño
- **D1 (P0)** Pesaje semanal por vaca (AM/PM) — grilla web + conversación Telegram.
- **D2 (P0)** Litros diarios al camión (un número/día por Telegram, con recordatorio si no llega).
- **D3 (P0)** Curva de producción y PL vigente por vaca (PL pasa a ser **calculado**, no digitado).
- **D4 (P1)** Proyección mensual/anual de litros.
- **D5 (P1)** Conciliación litros producidos vs litros pagados (`fin_ingresos`).
- **D6 (P1)** Importar archivo "promedio leche" (abr 2025+).

Criterio clave: vaca no pesada = sin dato (—), **nunca 0** (misma regla del módulo de monitoreo).

### Épica E — Tablero e indicadores
- **E1 (P0)** Listas de acción: próximas a secar (30d), próximas a parir (30d), rechequeo, vacías/por servir.
- **E2 (P0)** KPIs: vacas por estado, litros/día del hato, litros/vaca en leche, PL promedio.
- **E3 (P1)** Indicadores reproductivos: días abiertos, intervalo entre partos, % preñez, días en leche.
- **E4 (P1)** Cruce con Finanzas: ingreso leche, gastos del negocio, margen, costo/litro.
- **E5 (P1)** Herramientas Esco: `get_hato_animal`, `get_hato_reproduccion`, `get_hato_leche` (web + Telegram automático vía `llmToolLoop`).
- **E6 (P2)** Sección hato en el reporte semanal.

Criterio clave: KPIs reproductivos apagados hasta que la importación esté validada — mejor "sin dato" que un número falso.

### Épica F — Importación histórica
- **F1 (P0)** Hato actual (chequeo jul 2026 + cruce TERNERAS) con revisión asistida.
- **F2 (P1)** Histórico de chequeos 2019–2026 (reconstrucción reproductiva).
- **F3 (P0)** TERNERAS 2017+ completo (genealogía y edades).
- **F4 (P0)** Reporte de calidad: celdas no interpretables, contradicciones de identidad, vacas sin nacimiento.

Regla de oro: **ningún dato ambiguo se importa en silencio** — lo limpio entra, lo ambiguo va a lista de revisión con Martha.

---

## 7. Arquitectura técnica

### 7.1 Modelo de datos (prefijo `hato_`, migraciones 049+)

**Diseño en tres capas** (recomendado sobre snapshot puro):
1. **Capa cruda** — `hato_chequeo_vacas` conserva los valores de la planilla textuales (`*_raw text`). La procedencia sobrevive a errores de normalización.
2. **Capa de eventos** — `hato_eventos` es la fuente de verdad append-only del ciclo de vida.
3. **Capa derivada** — estado actual por vaca como vista SQL (`v_hato_estado_actual`) + motor puro TS (`calculosHato.ts`) con el mismo cálculo. Sin tabla de estado materializada (hato ~60 animales; la vista es trivial). Espejo del patrón ya probado `gan_movimientos → gan_inventario` y `rondas_monitoreo → observaciones` (ausencia de fila = "no visto", nunca 0).

**Tablas:**

- **`hato_animales`** — un registro por animal, para siempre. `id uuid PK`, `numero integer UNIQUE` (chapeta permanente, D1; nullable para animales históricos sin número), `nombre`, `sexo`, `etapa` (`ternera|novilla|vaca|toro`), `estado` (`activa|vendida|muerta|descartada`), `fecha_estado`, `fecha_nacimiento` + `fecha_nacimiento_confianza` (`exacta|aproximada|desconocida`), `madre_id` (self-FK), `padre_nombre` (texto — pajillas externas), `padre_id` (solo si es animal propio), `finca_id → gan_fincas`, `origen` (`nacimiento|compra|importacion_historica`), `confianza` (`alta|media|baja`), `import_meta jsonb`, `notas`. Índices: `(estado, etapa)`, `madre_id`.
- **`hato_chequeos`** — cabecera de ronda: `fecha`, `veterinario`, `estado` (`borrador|cerrado`), `fuente` (`web|importacion`), `sheet_ref`.
- **`hato_chequeo_vacas`** — una fila por vaca por chequeo, `UNIQUE(chequeo_id, animal_id)`. Columnas raw (`pl_raw`, `sx_raw`, `fecha_servicio_raw`, `ttto_raw`, …) + normalizadas nullable (`pl numeric`, `fecha_servicio date`, `toro`, `tipo_servicio`, `meses_prenez`, `fecha_secar`, `fecha_probable_parto`, `normalizacion_issues jsonb`).
- **`hato_eventos`** — log reproductivo/ciclo de vida: `animal_id`, `tipo` (`servicio|celo|confirmacion_prenez|parto|aborto|secado_real|venta|muerte|compra|cambio_etapa|rechequeo`), `fecha` + `fecha_confianza`, `toro`, `tipo_servicio`, `cria_id`, `cria_destino` (`retenida|macho_vendido|hembra_vendida|muerta|aborto`), `sx_raw`, procedencia (`chequeo_vaca_id`, `alerta_id`, `fuente`, `transaccion_ganado_id`), `datos jsonb`. Nota: `secado_planificado`/`parto_probable` NO son eventos — son fechas derivadas (una sola fuente de verdad). Índices: `(animal_id, fecha)`, `(tipo, fecha)`, parcial sobre `tipo='servicio'`.
- **`hato_tratamientos`** + **`hato_tratamiento_pasos`** — prescripción del chequeo con pasos programados (`paso_num`, `offset_dias`, `fecha_programada`, `fecha_ejecutada`, `requiere_confirmacion`). Catálogo **`hato_protocolos`** (ej. "Estrumate": día 0 aplicar → día 7 servir → día 9 verificar celo) para que Martha elija en vez de digitar.
- **`hato_pesajes_leche`** — `UNIQUE(animal_id, fecha)`, `litros_am`, `litros_pm`, `litros_total GENERATED`. Sin cabecera de ronda (la fecha ES la ronda; no existe el problema multi-fecha de monitoreo).
- **`hato_litros_diarios`** — `fecha UNIQUE`, `litros`, `litros_consumo_finca` opcional. Columna vertebral de conciliación: pesaje semanal (por vaca) + litros diarios (volumen real) + `fin_ingresos` (volumen facturado) = tres series que se cruzan, nunca se mezclan.
- **`hato_alertas`** — cola de tareas salientes: `tipo` (`secado_due|tratamiento_paso|rechequeo_due|servicio_sin_confirmacion|parto_proximo`), `animal_id`, `regla_clave UNIQUE` (idempotencia), `fecha_programada`, `estado` (`pendiente|enviada|respondida|confirmada|descartada|escalada|expirada`), `destinatario_telegram_id`, `intentos`, `respuesta`, `respondida_por`, `escalada_at`. + **`hato_alertas_config`** (tipo → destinatario, horas de escalamiento).

**Descomposición de códigos SX** (mismo parser para importación y captura en vivo):

| SX | Eventos |
|---|---|
| `OV` | `parto` con `cria_destino='macho_vendido'`, sin ficha de cría (D3) |
| `AV` | `parto` + `cria_destino='hembra_vendida'`; ficha solo si TERNERAS la nombra (entonces `estado='vendida'`) |
| `A{n}` | `parto` + `cria_destino='retenida'` + alta/match de `hato_animales` (numero=n, madre, fecha nacimiento), reconciliado contra TERNERAS |
| `A+`/`O+` | `parto` con `cria_destino='muerta'`; `O+` sin parto → `aborto` |

**RLS:** patrón de la migración 044 — SELECT para `authenticated`, escritura Administrador + Gerencia; `hato_alertas` con escritura service-role para cron/bot.

### 7.2 Integraciones

- **`gan_inventario`: excluido** (firme). Sus columnas son `novillos`/`toros`; el conteo lechero sale de `COUNT(*)` sobre `hato_animales` vía vista `v_hato_conteo`.
- **`fin_transacciones_ganado`** — un conflicto real a resolver: el trigger 044 `fn_crear_movimiento_pendiente_ganado` dispara con CADA insert, generando un pendiente de ceba espurio al vender una vaca lechera. Migración `053`: agregar `es_hato boolean DEFAULT false` + `hato_animal_id uuid FK`, y `IF NEW.es_hato THEN RETURN NEW` en el trigger. Flujo: marcar `vendida`/`muerta` en la UI del hato abre el `TransaccionGanadoForm` existente pre-llenado; al guardar se crea el `hato_eventos` de venta con el vínculo financiero. Extender RLS de `fin_transacciones_ganado` (hoy solo Gerencia, migración 023) a Administrador, en línea con 037/039.
- **Finanzas**: cero trabajo de esquema. La leche sigue por `fin_ingresos` (parsing de litros ya existe, migración 042).
- **Esco**: 3 herramientas nuevas en `chat.tsx` (`get_hato_animal`, `get_hato_reproduccion`, `get_hato_leche`); lógica de agregación en módulo puro `hato-aggregation.ts` (patrón `cost-aggregation.ts`) testeable con Vitest. Actualizar descripción de `get_ganado_inventory` (excluye hato). Telegram hereda automático vía `llmToolLoop`.
- **Conversaciones Telegram nuevas**: `pesajeLeche` (itera vacas en ordeño, acepta "8.5 7", salteable, reanudable) y `litrosCamion` (una pregunta, UPSERT por fecha). Respuestas de alertas NO son conversaciones: son handlers `callbackQuery(/^hato_alerta:(.+):(si|no|otro)$/)` — el patrón `mem_save:` existente. Nuevos valores de `modulos_permitidos`: `hato_leche`, `hato_alertas`.
- **pg_cron** (migración 054): tick diario 05:45 Bogotá → `net.http_post` a `/make-server-1ccce916/hato/alertas/tick` (patrón 030), protegido con header de secreto compartido (dispara mensajes salientes).
- **Reporte semanal**: sección Hato Lechero aditiva en `fetchDatosReporteSemanal.ts` (P2).

### 7.3 Motor de alertas

**Reglas** (funciones puras sobre `v_hato_estado_actual` + pasos de tratamiento):

| Tipo | Dispara cuando | `regla_clave` (idempotencia) |
|---|---|---|
| `secado_due` | `fecha_secar <= hoy` y sin `secado_real` posterior al servicio | `secado:{animal}:{fecha_servicio}` |
| `tratamiento_paso` | `fecha_programada <= hoy` y sin ejecutar | `ttto:{paso_id}` |
| `rechequeo_due` | `rechq` en último chequeo, o >60 días desde el último chequeo (nivel hato) | `rechq:{animal}:{chequeo}` |
| `servicio_sin_confirmacion` | servicio ≥45 días sin confirmación/celo/aborto/parto posterior | `servconf:{animal}:{fecha_servicio}` |
| `parto_proximo` | `fecha_probable_parto - hoy <= 14 días` | `parto:{animal}:{fecha_servicio}` |

`INSERT ... ON CONFLICT (regla_clave) DO NOTHING` → regeneración idempotente por construcción.

**Tick diario en la edge function** (no SQL puro): 3 fases — generar (motor puro), despachar (Telegram `sendMessage` + `InlineKeyboard`; **hoy el bot no tiene ruta saliente** — hay que agregar el helper con log a `telegram_mensajes`), escalar/expirar (48h sin respuesta → resumen a Martha; >14 días → expirada). El motor de fechas vive duplicado frontend/servidor con **test de paridad byte-idéntica** (`calculosHatoParidad.test.ts`), replicando el patrón `priorizacionMonitoreo` ⇄ `priorizacion-scouting`.

**Anti-spam**: `UNIQUE(regla_clave)`; reenvío solo si pasaron ≥48h y `intentos < 3`; agrupación por destinatario por franja; tick seguro de correr dos veces. Ojo técnico: Telegram no permite `editMessageText` >48h — el escalamiento envía mensaje nuevo.

### 7.4 Importación histórica

**Pipeline offline asistido por Claude → CSVs revisados → carga única.** NO edge function (proceso de minutos, human-in-the-loop, one-shot). Vive en `scripts/import-hato/` (Node/TS, dependencia `xlsx` ya presente), corre local con service-role key.

1. **Extract** — cada Excel → CSV por hoja, celdas como texto crudo (preserva `#VALUE!`, multi-fechas) + manifiesto (hoja → fecha de chequeo inferida, mapa de headers con alias por deriva de columnas).
2. **Normalize** — usa las MISMAS funciones de parsing de `calculosHato.ts` (un parser para importación y captura = un solo set de tests). Celda no interpretable → `normalizacion_issues`, nunca fila descartada.
3. **Resolve** — resolución de identidad con `numero` como llave fuerte (D1) y nombre como validación; contradicción numero↔nombre en el histórico → lista de revisión (`confianza='baja'`), no se asume nada. Desaparición ≥2 chequeos → cierre presunto (`vendida`, fecha aproximada, `confianza='media'`). TERNERAS 2017+ es la columna vertebral de nacimientos/madres; la convención de primera letra se usa solo como heurística de validación. Salida: `animales.csv` + `resolution-report.md` para adjudicar con Martha.
4. **Load** — orden de dependencias, transaccional, idempotente (re-corrida limpia `origen='importacion_historica'` primero). UPDATE-by-id + INSERT, nunca upsert PostgREST con claves NULL (lección de `CapturaCosechaGrid`).
5. **Verify** — invariantes: cada A{n} tiene animal o flag; conteo de partos ≈ `#P` máximo; hato activo ≈ ~45; dos activas jamás comparten numero.

La matriz P&G de gastos queda **fuera del pipeline** (Finanzas ya es dueña del dinero del hato; backfill histórico opcional se decide aparte).

### 7.5 Frontend

Rutas lazy nuevas (entrada "Hato Lechero" en el sidebar):

| Ruta | Componente |
|---|---|
| `/hato` | `HatoDashboard` — KPIs + tablero de alertas |
| `/hato/animales` | `AnimalesList` |
| `/hato/animales/:id` | `HojaDeVida` — timeline + chequeos + curva PL + genealogía |
| `/hato/chequeos` | `ChequeosList` |
| `/hato/chequeos/:id` | `ChequeoCapturaGrid` (borrador → cerrado) |
| `/hato/leche` | `LecheView` — pesajes + litros diarios |
| `/hato/alertas` | `AlertasView` — cola con estados y respuestas |

```
src/components/hato/            # espejo de src/components/ganado/
├── HatoDashboard.tsx, HatoSubNav.tsx, AnimalesList.tsx, HojaDeVida.tsx,
│   ChequeosList.tsx, ChequeoCapturaGrid.tsx, LecheView.tsx, AlertasView.tsx
├── components/                 # VentaAnimalDialog, PartoDialog, TratamientoDialog,
│                               # PesajeSemanalGrid, LitrosDiariosForm, EventoTimeline
└── hooks/                      # useHatoAnimales, useChequeoCaptura, usePesajesLeche,
                                # useHatoAlertas, useEstadoReproductivo
src/utils/calculosHato.ts       # puro: motor de fechas, parser SX/planilla, PL, proyecciones
src/types/hato.ts
src/__tests__/calculosHato.test.ts
src/__tests__/calculosHatoParidad.test.ts
src/__tests__/hatoAlertas.test.ts
```

**Captura del chequeo: grilla, no formulario por vaca** — la planilla ES una grilla y el patrón está validado en `CapturaCosechaGrid`: todas las vacas activas pre-pobladas, valores del chequeo anterior en fantasma por celda, entrada raw con preview de normalización en vivo, borrador con `useFormPersistence`, y "cerrar chequeo" ejecuta la descomposición de eventos con diálogo de confirmación. Diálogos por vaca solo para eventos fuera de ciclo (parto, venta, tratamiento).

**Foto-OCR (B6, Fase 2)**: viable — OpenRouter ya integrado, Gemini 3 Flash acepta imágenes. Foto → endpoint `/hato/chequeos/ocr` → JSON estricto → **pre-llena la misma grilla como borrador para revisión humana, nunca commit directo**. Se pospone: la grilla debe existir primero y el prompt se afina con fotos reales recolectadas en la visita de agosto.

Convenciones obligatorias: `format.ts` para números (formato colombiano), `onWheel` blur en cada input numérico (grilla de 45×10 celdas = máxima exposición al bug de scroll), Dialog con `size` + `DialogBody`, RoleGuard + RLS Administrador/Gerencia.

---

## 8. Plan de implementación

**Ventana: hoy (jul 17) → visita 6–21 de agosto (~3 semanas).** Por decisión D4, las alertas se encienden ANTES de la visita, con validación remota de datos como prerequisito.

| # | Workstream | Tamaño | Depende de | Fecha objetivo |
|---|---|---|---|---|
| W1 | Migraciones **049** `create_hato_core`, **050** `create_hato_leche`, **051** `create_hato_tratamientos`, **052** `create_hato_alertas`, **053** `fin_transacciones_ganado_hato_link`, **054** `hato_alertas_cron` + vista `v_hato_estado_actual`. Actualizar `docs/supabase_tablas.md` y CLAUDE.md | M | — | Semana 1 (jul 20–24) |
| W2 | Lógica pura `calculosHato.ts` (parsers, SX, motor de fechas, derivación de estado, proyecciones) + copia servidor + test de paridad + fixtures de planillas reales | M | — (paralelo) | Semana 1 |
| W3 | Pipeline de importación `scripts/import-hato/` + **sesión remota de revisión con Martha** + carga a producción | L | W1, W2 | Semanas 1–2 · **sesión con Martha ~jul 27–29 (agendar YA — es el riesgo de cronograma)** |
| W4 | Frontend core: rutas, AnimalesList, HojaDeVida, ChequeoCapturaGrid, dashboard | L | W1, W2 (contra datos de W3) | Semanas 2–3 |
| W5 | Captura de leche: LecheView + conversaciones Telegram `pesajeLeche`/`litrosCamion` + onboarding `telegram_usuarios` de Fernando | M | W1 | Semana 2 |
| W6 | **Motor de alertas** (adelantado por D4): tick endpoint (generar/despachar/escalar), helper de envío saliente + log, callbacks con efectos de dominio, AlertasView, cron 054 | L | W1, W2, W5 | Semana 3 · **modo sombra ~ago 1 (alertas a Martha/Santiago), Fernando ~ago 3–5 solo con tipos validados (`secado_due`, `tratamiento_paso`)** |
| W7 | Herramientas Esco + `hato-aggregation.ts` | M | W1, W3 | Durante la visita |
| W8 | Foto-OCR (endpoint + prefill de grilla, afinado con fotos reales) | M | W4 | Fase 2 (post-visita) |
| W9 | Flujo venta/muerte ↔ `TransaccionGanadoForm` (`es_hato`) | S/M | W1, W3 | Durante la visita (ventas son infrecuentes) |

**Encendido escalonado de alertas (mitigación del riesgo de confianza):**
1. ~Ago 1: modo sombra — el tick corre y envía solo a Martha/Santiago; se verifica cada alerta contra la realidad.
2. ~Ago 3–5: Fernando recibe solo `secado_due` y `tratamiento_paso` (los tipos cuyos datos quedaron validados en la sesión W3).
3. Durante la visita: se calibran redacción/horarios con Fernando en persona y se activan `servicio_sin_confirmacion` y `parto_proximo`.

**Regla de recorte pre-acordada** si el cronograma aprieta: caen primero D1-grilla-web (el pesaje puede seguir 2 semanas en papel) y E-avanzados; **nunca** caen fichas + chequeo + importación validada + alertas de secado/tratamiento.

**Definición de éxito al cierre de la visita (ago 21):** (1) hato completo en el sistema y un chequeo real capturado en la app; (2) Fernando respondió alertas reales ≥1 semana; (3) litros del carro llegan a diario; (4) ≥1 pesaje semanal capturado; (5) Martha no abrió el Excel de chequeos para nada nuevo.

**Transversal:** cada cambio de edge function se despliega con `npx supabase functions deploy make-server-1ccce916` y se sincroniza en ambas copias; migraciones 049–054 coordinadas en un solo PR (ya hubo colisiones de numeración); toda la lógica de negocio en módulos puros con Vitest (los fixtures de planillas reales son los tests de mayor ROI: multi-fechas, `#VALUE!`, cada variante de SX).

### Fases posteriores
- **Fase 2 (sept–oct):** A3, A5, B5 (planilla pre-llenada — primera reducción neta de trabajo de Martha, lista para el chequeo de ~octubre), C5–C7, D4–D6, E3–E5, F2 (histórico completo de chequeos), W8 (OCR), W9 si no quedó.
- **Fase 3:** A6 (consanguinidad), E6 (reporte semanal), convergencia eventual con módulo Ganado.

---

## 9. Riesgos

| Riesgo | Prob. | Impacto | Mitigación |
|---|---|---|---|
| **Alertas con datos malos queman la confianza de Fernando** (agravado por D4: encendido remoto) | Alta | Crítico | Encendido escalonado (sombra → tipos validados → resto en visita); sesión de validación W3 como prerequisito duro; botón "esto está mal" en toda alerta |
| Sesión de revisión con Martha se atrasa → todo el cronograma D4 se corre | Media | Alto | Agendar ya (~jul 27–29); el pipeline W3 etapas 1–2 corre contra los 5 archivos en semana 1 para que las sorpresas salgan temprano |
| Doble carga transitoria (Excel + app) mata la adopción | Media | Alto | Corte tajante en la visita: el Excel de chequeos se congela como archivo histórico |
| Fatiga/rechazo del bot (mensajes a deshora, percepción de vigilancia) | Media | Alto | Agregación 1 mensaje/franja; horarios acordados con Fernando en persona; tono de ayuda, no de auditoría; el precedente de David juega a favor |
| Calidad del histórico peor que la muestra | Alta | Medio | Regla "ambiguo → revisión, nunca importación silenciosa"; F2 es P1 y no bloquea el MVP; KPIs reproductivos apagados hasta validar |
| Conectividad intermitente en el ordeño | Media | Alto | Confirmaciones que no expiran (respondibles horas después); verificar en visita |
| Punto único: Martha | Media | Medio | Entrenar a Fernando (bot) y papá (lectura); Esco como interfaz de consulta sin curva de aprendizaje |
| Cadencia bimestral: si el lazo falla, el sistema queda 2 meses desactualizado | Media | Medio | C4 (escalamiento de vencidos) es P0; el tablero marca la fecha del último dato por vaca |

---

## 10. Preguntas abiertas restantes

**Para Martha (agendar en la sesión de validación de datos, ~jul 27–29):**
1. ¿Quién pesa la leche semanal y cómo nace el dato (papel en el ordeño → quién transcribe)? Define la forma final de D1.
2. ¿Quién reporta los litros diarios del camión — Fernando por Telegram a diario, o Martha semanal contra el recibo? Define el alcance de `litrosCamion`.
3. Regla de secado: ¿la fecha calculada (servicio+7m) la ajusta el veterinario según condición/producción? ¿Quién tiene la última palabra? → fecha calculada-editable y por quién.
4. Semántica exacta de "OK" (¿vacía apta esperando celo?) y cómo distingue una vacía-problema de una vacía normal post-parto → afina la máquina de estados y el KPI de días abiertos.
5. Catálogo de toros: ¿cuántos propios, qué pajillas se usan, cómo los identifica en la planilla? → catálogo para genealogía/consanguinidad.
6. ¿Fecha del próximo chequeo veterinario? (si cae en la visita, el primer chequeo en la app se captura en vivo — mejor sesión de entrenamiento posible).
7. Adjudicación del `resolution-report.md` (identidades con confianza media/baja del histórico).

**Decisiones por defecto ya tomadas en este plan (objetar si algo no cuadra):**
- Machos vendidos (OV) sin ficha propia — solo eventos (confirmado en D3).
- RLS de `fin_transacciones_ganado` se extiende a Administrador (migración 053).
- Rechequeo a nivel hato por "60 días desde el último chequeo" (no fecha planificada).
- Matriz P&G histórica NO se importa a `fin_gastos` por este módulo (decisión aparte de Finanzas).
- Conteos del hato jamás se copian a `gan_inventario`.

**Pendientes externos (no bloquean el diseño):**
- Martha envía el archivo de flujo de leche y los chequeos que falten.
- Recuperación de nómina abr–jun 2026 en Finanzas (tarea de datos aparte).
- Avisar a Consuelito que los datos de vacas están al día hasta julio.
