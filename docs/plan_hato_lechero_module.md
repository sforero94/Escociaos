# Plan de Diseño e Implementación — Módulo Hato Lechero

**Fecha:** 2026-07-17 · **Estado:** Aprobación de diseño (pre-implementación) · **Detalle visual:** look-and-feel de referencia aprobado 2026-07-20 (§7.6); contenido/campos finales siguen siendo decisión de los agentes de implementación

Fuentes: entrevista con Martha (administradora, llamada 2026-07-17, Notion "Vaquitas Lecheras"), análisis de los 5 archivos Excel entregados (chequeos 2019–2026, terneras 2017+, promedio leche 2025, gastos FOV 2026), y revisión del código/esquema existente de Escocia OS.

---

## 1. Resumen ejecutivo

El hato lechero de Subachoque (~40–45 vacas en ordeño + levante) se administra hoy en Excel con buena disciplina de captura pero **cero lazo de seguimiento**: las fechas de secado se calculan y no se ejecutan, los tratamientos del veterinario se olvidan, y las inseminaciones ocurren (o no) sin quedar registradas. El módulo convierte ese flujo en un **motor de seguimiento reproductivo con lazo cerrado**: chequeo → fechas calculadas → alerta por Telegram a Fernando → confirmación sí/no → ficha actualizada → siguiente fecha.

Tres capítulos funcionales (los mismos de la entrevista):

1. **Control de animales** — ficha individual (hoja de vida) + captura del chequeo veterinario bimestral.
2. **Ordeño** — pesaje semanal por vaca + litros diarios al camión → PL calculado, proyecciones.
3. **Ingresos y gastos** — ya cubierto por Finanzas (negocio "Hato Lechero"); este módulo lo consume, no lo duplica. La limpieza/backfill de gastos históricos es una **tarea paralela independiente** (`docs/plan_hato_lechero_gastos_backfill.md`), no parte de este diseño.

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
- **Nómina abr–jun 2026** y homologación general de gastos del hato en Finanzas (Excel de Consuelito saturado) — cubierto por la tarea paralela `docs/plan_hato_lechero_gastos_backfill.md`, NO por este módulo.
- Edad de vacas anteriores a 2017 (cuadernos de Nathalie) — se marca "sin fecha de nacimiento", nunca se inventa.

---

## 3. Decisiones ya tomadas (Santiago, 2026-07-17)

| # | Decisión | Implicación de diseño |
|---|---|---|
| D1 | **El # de vaca es chapeta permanente, nunca se recicla** | `numero` es llave de identidad fuerte: `UNIQUE(numero)` global en `hato_animales`. La importación usa numero como llave primaria de resolución y el nombre como validación; cualquier contradicción en el histórico se marca para revisión (no se asume reciclaje). |
| D2 | **Fernando tiene Telegram y puede recibir/responder en Subachoque** | El lazo cerrado va dirigido a Fernando como respondiente primario; escalamiento a Martha a las 48h sin respuesta. |
| D3 | **Alcance: vacas + terneras/novillas retenidas.** Machos vendidos (OV) quedan solo como eventos de parto, sin ficha propia | Ficha individual para todo animal hembra retenido (base de genealogía y levante). Menos fabricación de registros en la importación. |
| D4 | **Las alertas deben estar funcionando ANTES de la visita a la finca (6 de agosto)** | La sesión del motor de alertas (S6, §8) no espera a la visita para encenderse. Prerequisito duro: el checkpoint humano de la sesión de importación (S3) — validación de datos con Martha — debe cerrarse antes de que S6 pueda avanzar de "modo sombra" a habilitación real (una alerta con datos malos quema la confianza de Fernando). |

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
- **Homologación de gastos históricos del Excel GASTOS FOV contra `fin_gastos`** (incluye recuperar la nómina faltante abr–jun 2026) — es una **tarea paralela e independiente**, documentada en `docs/plan_hato_lechero_gastos_backfill.md`. No requiere las tablas `hato_*` ni las migraciones de este plan; vive fuera del grafo de sesiones (§8) y puede tomarla cualquier agente disponible en cualquier momento.
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

La matriz P&G de gastos queda **fuera de este pipeline** — se homologa por separado, con el método de matching (concepto + fecha + monto, sin duplicar lo ya cargado) descrito en `docs/plan_hato_lechero_gastos_backfill.md`.

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

### 7.6 Referencia visual (prototipo Figma)

**[Prototipo completo](https://www.figma.com/design/rtcPBS6WdZW0k063g8u9KH/Escocia-OS-—-Módulo-Hato-Lechero--Mockups-)** — 7 pantallas de referencia (17 jul 2026).

> **Regla de uso**: estas pantallas fijan el *look and feel* (densidad de tabla, chips, tarjetas de KPI, gráficas, jerarquía visual) — no el contenido final. Los datos, columnas y campos específicos mostrados son ilustrativos; las épicas de §6 siguen siendo la autoridad sobre qué información se captura y se muestra. Los agentes de frontend deciden el detalle final de contenido dentro de este lenguaje visual.

**Inventario de pantallas → épica/ruta correspondiente:**

| Pantalla Figma | Ruta (§7.5) | Épica (§6) |
|---|---|---|
| ① Dashboard | `/hato` | E — Tablero e indicadores |
| ② Lista del hato | `/hato/animales` | A1 |
| ③ Hoja de vida — #47 Estrella | `/hato/animales/:id` | A2, A3, A5 |
| ④ Captura de chequeo | `/hato/chequeos/:id` | B1–B4 |
| ⑤ Control de ordeño | `/hato/leche` | D |
| ⑥ Cola de alertas | `/hato/alertas` | C |
| ⑦ Telegram — lazo cerrado | (fuera de la app web) | C1–C4 |

**Lenguaje visual a preservar** (mapeado a lo que ya existe en el repo, para reusar y no reinventar):

- **Chips/badges de estado semánticos** — todo estado (etapa de vaca, estado de alerta, resultado de chequeo) se pinta como un chip de color, nunca como texto plano. Paleta consistente en las 7 pantallas: verde = saludable/confirmado/en leche, ámbar = requiere atención pronto (próxima a secar, escalada), azul = en progreso (servida, enviada), gris = neutro/inactivo (seca, pendiente), rojo = vencido/urgente/destructivo. Construir sobre `src/components/ui/badge.tsx`; recomiendo un helper único de color-por-estado (`calculosHato.ts`) siguiendo el precedente de `clasificarGravedad` en `calculosMonitoreo.ts` — una sola fuente de verdad para el color, nunca derivarlo inline pantalla por pantalla.
- **Tarjetas de KPI** (fila de 3–4 en Dashboard y Leche) — icono en círculo de color, label pequeño gris, número grande, delta/subtexto abajo. Patrón ya establecido en el repo (`KPICardsProduccion.tsx`, `ClimaKPICards.tsx`, `DashboardKPICard.tsx`, `finanzas/components/KPICards.tsx`) — reusar ese patrón, no crear uno nuevo.
- **Tablas limpias** (Lista de animales, grilla de Chequeo, Cola de alertas) — header gris claro en mayúsculas pequeñas, filas blancas con divisor sutil (sin grid pesado), sin zebra-striping, valores de estado siempre como chip. Sobre `src/components/ui/table.tsx`.
- **Barra de progreso horizontal por categoría** ("Vacas por estado" en el Dashboard) — sobre `src/components/ui/progress.tsx` o Recharts horizontal bar, con leyenda de puntos de color.
- **Gráficas** (curva de PL en la hoja de vida, litros diarios en Leche) — Recharts, mismo patrón ya usado en `produccion/components/Grafico*.tsx`: línea con marcadores + burbuja resaltando el último valor; barras con la barra de "hoy" resaltada en verde oscuro vs. el resto en verde claro.
- **Línea de tiempo vertical** (hoja de vida — "Línea de tiempo reproductiva") — patrón nuevo, no existe hoy en el repo; construir como componente reusable (`EventoTimeline.tsx`, ya listado en §7.5) con punto sólido para eventos pasados, punto hueco para proyectados, y una entrada resaltable "HOY".
- **Vista de genealogía en mini-árbol** (madre → esta vaca → crías, cajas conectadas por líneas finas) — patrón nuevo, construir dentro de `HojaDeVida.tsx`.
- **Grilla de captura con preview de cálculo en vivo** (pantalla ④) — banner informativo arriba de la tabla explicando el pre-llenado; fila en edición muestra un banner inline debajo con el resultado del auto-cálculo (Secar/PP) antes de guardar. Este patrón de "explicar + previsualizar antes de comprometer" es nuevo pero encaja con el principio ya establecido de `ChequeoCapturaGrid` en §7.5.
- **Franja de estadísticas compactas** (hoja de vida, debajo del header — PL actual, #Partos, Días en leche, Días abiertos, Secar, Parto probable en una sola fila sin tarjetas) — patrón nuevo, más denso que las KPI cards; usar solo en vistas de detalle de un único registro, no en dashboards.
- **Chips de contexto persistente** (header: "Finca: Subachoque" + avatar de usuario) — verificar si ya existe un patrón equivalente en `Layout.tsx`/breadcrumb antes de construir uno nuevo.

**Decisiones abiertas que el prototipo no resuelve** (para que el agente de frontend las zanje explícitamente, no las herede en silencio):

1. **Sub-navegación del módulo**: el mockup muestra los 5 sub-ítems (Dashboard/Animales/Chequeos/Leche/Alertas) como árbol indentado *dentro* del sidebar bajo "Hato Lechero". El resto de la app usa un patrón distinto: un `SubNav` horizontal debajo del breadcrumb (`InventorySubNav`, `MonitoreoSubNav`, `EmpleadosSubNav`, `GanadoDashboard`). Decidir cuál seguir — recomiendo el patrón horizontal existente por consistencia, pero lo dejo para la sesión de frontend.
2. El chip **"Datos de demostración"** del Dashboard es un artefacto del mockup (deja claro que los números son ficticios) — no implica una funcionalidad de "modo demo" real; se descarta al implementar salvo que se pida explícitamente.
3. Las 7 pantallas son **desktop-only (1440px)** — ninguna cubre el comportamiento en móvil. Sigue vigente la regla de CLAUDE.md sobre sidebar colapsado y no ocultar contenido; el agente de frontend debe resolver el responsive, no está en el prototipo.
4. El botón destructivo **"× Marcar vendida/muerta"** (outline rojo) — confirmar que usa la variante destructiva ya existente de `button.tsx` en vez de un estilo nuevo.

---

## 8. Plan de ejecución — sesiones de trabajo por agente

Este plan lo ejecuta el equipo global de agentes (CPO, CTO, backend, frontend, integraciones, QA), no una persona con calendario. Por eso la estructura no es temporal — **es un grafo de dependencias entre sesiones**, donde cada sesión es la unidad de trabajo que un agente puede tomar de principio a fin. Una sesión especifica: qué agente la ejecuta, qué insumos necesita (y de qué sesión salen), qué entrega, y a qué otras sesiones desbloquea. Dos sesiones sin dependencia entre sí pueden correr **en paralelo**, en la misma ventana o en agentes distintos.

La única referencia temporal real en todo el plan es un evento externo fijo — la visita de Santiago a la finca (6–21 de agosto) — que no es una fecha de cronograma interno sino un **checkpoint del mundo real**: la ventana en la que Fernando y Martha están presencialmente disponibles para entrenamiento y calibración en vivo. Las sesiones se ordenan para que el trabajo que *necesita* ese checkpoint (calibrar alertas con Fernando, capturar el primer chequeo en vivo si coincide la fecha) llegue con todo lo demás ya resuelto — no para llenar semanas.

**S0 — CPO + CTO: Diseño (completada)**
Este documento. Entrega: alcance, épicas priorizadas, modelo de datos, arquitectura de integraciones, motor de alertas, estrategia de importación, arquitectura de frontend, riesgos.

**S1 — CTO/Backend: Esquema y RLS**
- Objetivo: migraciones **049** `create_hato_core`, **050** `create_hato_leche`, **051** `create_hato_tratamientos`, **052** `create_hato_alertas`, **053** `fin_transacciones_ganado_hato_link`, **054** `hato_alertas_cron` + vista `v_hato_estado_actual`. Actualizar `docs/supabase_tablas.md` y CLAUDE.md.
- Insumos: §7.1–7.2 de este plan.
- Entregable: esquema aplicado (un solo PR, para evitar la colisión de numeración que ya ocurrió antes en el repo) + RLS verificada.
- Depende de: nada — sesión de arranque.
- Desbloquea: S3, S4, S6, S9.

**S2 — Backend: Motor de lógica pura (`calculosHato.ts`)**
- Objetivo: parsers de planilla (fechas multi-valor, `#VALUE!`), descomposición SX→eventos, motor de fechas (SECAR/PP), derivación de estado, cálculo de PL/proyecciones.
- Insumos: §6 (criterios de aceptación por épica), §7.1 (tabla de descomposición SX), los 5 archivos Excel como fixtures de test.
- Entregable: `src/utils/calculosHato.ts` + `calculosHato.test.ts`, copia en `src/supabase/functions/server/` + `calculosHatoParidad.test.ts`.
- Depende de: nada — sin dependencia real de esquema, corre en paralelo a S1.
- Desbloquea: S3, S4, S6, S7.

**S3 — Backend/Data: Pipeline de importación**
- Objetivo: `scripts/import-hato/` (extract → normalize → resolve → load → verify).
- Insumos: esquema de S1, parsers de S2, los 5 archivos Excel.
- Entregable: `animales.csv` + `resolution-report.md` + carga a producción.
- Depende de: S1, S2.
- **Checkpoint humano obligatorio** (no delegable a ningún agente): revisión de `resolution-report.md` con Martha antes de cargar a producción — el único gate de este plan que exige su tiempo, y el de mayor riesgo de cronograma real porque depende de su disponibilidad, no de capacidad de agentes. Agendarlo es la acción de mayor prioridad fuera de las sesiones mismas.
- Desbloquea: S4 (necesita datos reales para probarse contra el hato verdadero), S6 (las alertas no se encienden sobre datos sin validar), S7, S9.

**S4 — Frontend: Núcleo del módulo**
- Objetivo: rutas, `AnimalesList`, `HojaDeVida`, `ChequeoCapturaGrid`, `HatoDashboard`.
- Insumos: esquema de S1, motor de S2 (preview de normalización en vivo en la grilla), datos de S3 para prueba contra el hato real.
- Entregable: módulo navegable end-to-end para fichas + captura de chequeo.
- Depende de: S1, S2. Puede empezar contra fixtures antes de que S3 cierre, pero su validación final requiere los datos reales de S3.
- Desbloquea: nada aguas abajo (es hoja del grafo).

**S5 — Frontend/Integraciones: Captura de leche**
- Objetivo: `LecheView` (pesajes + litros diarios) + conversaciones Telegram `pesajeLeche`/`litrosCamion` + alta de Fernando en `telegram_usuarios`.
- Insumos: esquema de S1 (`hato_pesajes_leche`, `hato_litros_diarios`).
- Depende de: S1.
- Desbloquea: S6 — no por los datos de leche en sí, sino porque S5 deja lista la plomería de bot y el onboarding de Fernando que el motor de alertas reutiliza para poder escribirle.

**S6 — Backend/Integraciones: Motor de alertas** *(capacidad estrella — máxima prioridad de secuenciación)*
- Objetivo: tick endpoint (generar/despachar/escalar), helper de envío saliente + log a `telegram_mensajes`, callbacks con efectos de dominio, `AlertasView`, cron 054.
- Insumos: esquema S1, motor S2, datos **validados** de S3 (checkpoint humano cumplido), onboarding de Fernando de S5.
- Depende de: S1, S2, S3 (con su checkpoint humano cerrado), S5.
- **Dos checkpoints de confianza en cascada, no fechas** — cada uno gatea al siguiente por evidencia, no por calendario:
  1. *Modo sombra*: el tick corre en real pero notifica solo a Martha/Santiago; cada alerta generada se contrasta contra la realidad del hato antes de avanzar.
  2. *Habilitación a Fernando*: solo se activan para él los tipos de alerta (`secado_due`, `tratamiento_paso`) cuyos datos quedaron con confianza alta tras S3; el resto (`servicio_sin_confirmacion`, `parto_proximo`) se calibra en persona durante la visita a la finca, con Santiago presente para ajustar redacción y horarios con Fernando en vivo.
- Desbloquea: nada aguas abajo.

**S7 — Backend: Herramientas Esco**
- Objetivo: `get_hato_animal`, `get_hato_reproduccion`, `get_hato_leche` + `hato-aggregation.ts`.
- Depende de: S1, S2, S3 (necesita datos reales para responder preguntas útiles).
- Prioridad de secuenciación baja: no bloquea el checkpoint de la visita a la finca, puede correr en cualquier ventana ociosa una vez S3 cierra.

**S8 — Frontend: Foto-OCR** *(no ejecutable todavía)*
- Depende de: S4 (la grilla debe existir para recibir el prefill) **y** de un insumo que hoy no existe — fotos reales de la planilla, que solo se recolectan durante la visita a la finca. Esta sesión queda fuera del grafo ejecutable hasta que ese insumo aparezca; no se agenda, se espera.

**S9 — Backend: Flujo venta/muerte ↔ `TransaccionGanadoForm`**
- Objetivo: marcar `vendida`/`muerta` en la ficha abre el formulario existente pre-llenado, vínculo `es_hato`/`hato_animal_id`.
- Depende de: S1, S3.
- Prioridad de secuenciación baja: las ventas son infrecuentes, no bloquea nada.

**Homologación de gastos** (`docs/plan_hato_lechero_gastos_backfill.md`) — fuera de este grafo por diseño: no consume ni produce insumos de ninguna sesión de arriba. Cualquier agente disponible puede tomarla en cualquier momento.

### Grafo de paralelismo

```
S1 ─┬─ S3 ─┬─ S4
S2 ─┘      ├─ S6 ← S5 ← S1
           ├─ S7
           └─ S9
S8: bloqueada hasta visita a la finca (insumo externo)
Homologación de gastos: sin conexión al grafo, ejecutable siempre
```

S1 y S2 son las únicas sesiones sin dependencias — arrancan primero y en paralelo. Todo lo demás (salvo la homologación de gastos, que vive fuera del grafo) pasa por S3 y su checkpoint humano; **por eso agendar ese checkpoint con Martha es la acción crítica, no una fecha de sprint.**

**Regla de priorización si hay que recortar sesiones**: caen primero S5 (el pesaje puede seguir en papel mientras tanto) y S7/S8/S9; **nunca** caen S1–S4 ni el "modo sombra" de S6 — fichas, chequeo, importación validada y las primeras alertas de secado/tratamiento son el núcleo no negociable.

**Definición de éxito antes del checkpoint de la visita a la finca:** (1) hato completo en el sistema, con al menos un chequeo real capturado en la app (S4); (2) Fernando respondiendo alertas reales de secado/tratamiento en modo habilitado, no sombra (S6); (3) litros del carro llegando a diario (S5); (4) al menos un pesaje semanal capturado (S5); (5) Martha sin necesidad de volver a abrir el Excel de chequeos para nada nuevo.

**Transversal a todas las sesiones de backend/integraciones:** cada cambio de edge function se despliega con `npx supabase functions deploy make-server-1ccce916` y se sincroniza en ambas copias del código fuente; toda la lógica de negocio va en módulos puros con Vitest (los fixtures de planillas reales son los tests de mayor ROI: multi-fechas, `#VALUE!`, cada variante de SX).

### Sesiones futuras (habilitadas después del checkpoint de la visita)

Depende de que el checkpoint externo (visita a la finca) haya ocurrido y de que las sesiones S1–S7 estén cerradas:
- A3, A5, B5 (planilla pre-llenada — primera reducción neta de trabajo de Martha, lista para el siguiente chequeo bimestral), C5–C7, D4–D6, E3–E5, F2 (histórico completo de chequeos), S8 (Foto-OCR, una vez existan fotos reales), S9 si no se hizo antes.
- Más adelante: A6 (consanguinidad), E6 (reporte semanal), convergencia eventual con el módulo Ganado.

---

## 9. Riesgos

| Riesgo | Prob. | Impacto | Mitigación |
|---|---|---|---|
| **Alertas con datos malos queman la confianza de Fernando** (agravado por D4: encendido antes de la visita) | Alta | Crítico | Encendido escalonado por checkpoints de confianza, no por fecha (sombra → tipos validados → resto calibrado en visita); el checkpoint humano de S3 es prerequisito duro de S6; botón "esto está mal" en toda alerta |
| El checkpoint humano de S3 (revisión con Martha) se atrasa → S6 no puede avanzar de modo sombra a habilitación real antes de la visita | Media | Alto | Agendarlo cuanto antes — es la acción crítica del plan; las etapas de extracción/normalización de S3 (que no requieren a Martha) arrancan de inmediato contra los 5 archivos para que las sorpresas salgan temprano, sin esperar su agenda |
| Doble carga transitoria (Excel + app) mata la adopción | Media | Alto | Corte tajante en la visita: el Excel de chequeos se congela como archivo histórico |
| Fatiga/rechazo del bot (mensajes a deshora, percepción de vigilancia) | Media | Alto | Agregación 1 mensaje/franja; horarios acordados con Fernando en persona; tono de ayuda, no de auditoría; el precedente de David juega a favor |
| Calidad del histórico peor que la muestra | Alta | Medio | Regla "ambiguo → revisión, nunca importación silenciosa"; F2 es P1 y no bloquea el MVP; KPIs reproductivos apagados hasta validar |
| Conectividad intermitente en el ordeño | Media | Alto | Confirmaciones que no expiran (respondibles horas después); verificar en visita |
| Punto único: Martha | Media | Medio | Entrenar a Fernando (bot) y papá (lectura); Esco como interfaz de consulta sin curva de aprendizaje |
| Cadencia bimestral: si el lazo falla, el sistema queda 2 meses desactualizado | Media | Medio | C4 (escalamiento de vencidos) es P0; el tablero marca la fecha del último dato por vaca |

---

## 10. Preguntas abiertas restantes

**Para Martha (agendar en el checkpoint humano de la sesión de importación, S3):**
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
- Conteos del hato jamás se copian a `gan_inventario`.
- La homologación de gastos (P&G/nómina) es tarea paralela e independiente — ver `docs/plan_hato_lechero_gastos_backfill.md`, no forma parte de este documento.

**Pendientes externos (no bloquean el diseño):**
- Martha envía el archivo de flujo de leche y los chequeos que falten.
- Avisar a Consuelito que los datos de vacas están al día hasta julio.
