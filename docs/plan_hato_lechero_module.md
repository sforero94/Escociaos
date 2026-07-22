# Plan de Diseño e Implementación — Módulo Hato Lechero

**Fecha:** 2026-07-17 · act. 2026-07-21 tras validación del prototipo con Martha · **Estado:** Aprobación de diseño (pre-implementación) · **Detalle visual:** look-and-feel de referencia aprobado 2026-07-20 (§7.6); contenido/campos finales siguen siendo decisión de los agentes de implementación

> **Reconciliación con producción (2026-07-20, PR #70 mergeado a `main`)**: el sidebar agrupado con control de acceso por-usuario ya existe en producción. El módulo vive en la ruta base **`/hato-lechero`** (no `/hato`), con 5 sub-ítems ya fijados en el sidebar (**Tablero · Producción · Hato · Chequeos · Alertas**, hoy `ComingSoon`), la clave de acceso `hato_lechero` y su `ModuleGuard`. Este plan adopta esa nomenclatura y estructura de navegación tal cual; las pantallas de contenido siguen el sistema de diseño del mock de Figma (§7.6). **La migración base del hato ya no es 049 (tomada por el sidebar reorg) — arranca en 050.**

> **Reconciliación de numeración de migraciones (2026-07-22, ejecución de S1)**: las migraciones del hato, planeadas 050–057, se renumeraron **053–060** porque 050/051/052 ya están en producción (`gastos_created_by_tracking`, `add_clasificacion_costos`, `create_fin_parametros`) — la misma colisión que el plan advirtió. Mapeo: 053 `create_hato_core` · 054 `create_hato_leche` · 055 `create_hato_tratamientos` · 056 `create_hato_alertas` · 057 `create_hato_pajillas` · 058 `create_hato_config` · 059 `fin_transacciones_ganado_hato_link` · 060 `hato_alertas_cron`. Tres correcciones estructurales dentro del modelo de datos aprobado (no cambian alcance): (a) `hato_toros` se crea en 053 (core), no en 057, por dependencia de FK de `hato_animales.padre_toro_id`/`hato_eventos.toro_id` — por eso 057 se renombró `create_hato_pajillas`; (b) la vista `v_hato_estado_actual` vive en 056 (junto a su consumidor, el motor de alertas), no en el archivo de cron; (c) `hato_produccion_quincenal` agregó columna `mes` con `UNIQUE(anio, mes, quincena)` — el `UNIQUE(anio, quincena)` original con `quincena IN (1,2)` solo permitía 2 filas por año, imposible para un ciclo quincenal (24/año).

Fuentes: entrevista con Martha (administradora, llamada 2026-07-17, Notion "Vaquitas Lecheras"), análisis de los 5 archivos Excel entregados (chequeos 2019–2026, terneras 2017+, promedio leche 2025, gastos FOV 2026), y revisión del código/esquema existente de Escocia OS.

---

## 1. Resumen ejecutivo

El hato lechero de Subachoque (~40–45 vacas en ordeño + levante) se administra hoy en Excel con buena disciplina de captura pero **cero lazo de seguimiento**: las fechas de secado se calculan y no se ejecutan, los tratamientos del veterinario se olvidan, y las inseminaciones ocurren (o no) sin quedar registradas. El módulo convierte ese flujo en un **motor de seguimiento reproductivo con lazo cerrado**: chequeo → fechas calculadas → alerta por Telegram a Fernando → confirmación sí/no → ficha actualizada → siguiente fecha.

Tres capítulos funcionales (los mismos de la entrevista):

1. **Control de animales** — ficha individual (hoja de vida) + captura del chequeo veterinario bimestral.
2. **Producción** (antes "Ordeño"/"Leche") — pesaje semanal por vaca + litros al camión **por quincena** → PL calculado, productividad (litros/vaca), proyecciones.
3. **Ingresos y gastos** — ya cubierto por Finanzas (negocio "Hato Lechero"); este módulo lo consume, no lo duplica. La limpieza/backfill de gastos históricos fue una **tarea paralela independiente** ya ejecutada para ene–jun 2026 (ver [`archive/implementation/plan_hato_lechero_gastos_backfill.md`](./archive/implementation/plan_hato_lechero_gastos_backfill.md)).

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
- **Nómina abr–jun 2026** y homologación general de gastos del hato en Finanzas (Excel de Consuelito saturado) — cubierto por la tarea paralela archivada de backfill, NO por este módulo.
- Edad de vacas anteriores a 2017 (cuadernos de Nathalie) — se marca "sin fecha de nacimiento", nunca se inventa.

---

## 3. Decisiones ya tomadas (Santiago, 2026-07-17)

| # | Decisión | Implicación de diseño |
|---|---|---|
| D1 | **El # de vaca es chapeta permanente, nunca se recicla** | `numero` es llave de identidad fuerte: `UNIQUE(numero)` global en `hato_animales`. La importación usa numero como llave primaria de resolución y el nombre como validación; cualquier contradicción en el histórico se marca para revisión (no se asume reciclaje). |
| D2 | **Fernando tiene Telegram y puede recibir/responder en Subachoque** | El lazo cerrado va dirigido a Fernando como respondiente primario; escalamiento a Martha a las 48h sin respuesta. |
| D3 | **Alcance: vacas + terneras/novillas retenidas.** Machos vendidos (OV) quedan solo como eventos de parto, sin ficha propia | Ficha individual para todo animal hembra retenido (base de genealogía y levante). Menos fabricación de registros en la importación. |
| D4 | **Las alertas deben estar funcionando ANTES de la visita a la finca (6 de agosto)** | La sesión del motor de alertas (S6, §8) no espera a la visita para encenderse. Prerequisito duro: el checkpoint humano de la sesión de importación (S3) — validación de datos con Martha — debe cerrarse antes de que S6 pueda avanzar de "modo sombra" a habilitación real (una alerta con datos malos quema la confianza de Fernando). |

### 3.1 Decisiones de la validación del prototipo (Santiago + Martha, 2026-07-21)

Tras revisar el prototipo de Figma en vivo con Martha. Cada ítem `Vn` está trazado a lo largo del documento en su sección correspondiente.

| # | Decisión | Implicación de diseño |
|---|---|---|
| V1 | **Sistema de diseño**: las pantallas de contenido siguen el mock de Figma; el sidebar es el de producción (§7.6). Los componentes nuevos del mock (timeline, mini-árbol de genealogía, franja de stats, preview de cálculo, chips) se construyen **scoped al módulo hato**, sin editar las definiciones globales del sistema de diseño (`globals.css`, primitivos `ui/`). El módulo hato es la **referencia** para el futuro rediseño de UI de toda la app. | Componentes nuevos, no override de globales. Decisión abierta #1 de §7.6 resuelta por el sidebar de producción. |
| V2 | **"Leche" → "Producción"** (ya reflejado en el sidebar de producción: ruta `/hato-lechero/produccion`, label "Producción"; el listado de animales se llama "Hato" en `/hato-lechero/hato`). | §6 Épica D, §7.5. |
| V3 | **Producción de leche se registra por QUINCENA, no por día** (ciclo de la tarjeta del Pomar). La tarjeta diaria sigue en papel; el sistema registra la quincena. | `hato_produccion_quincenal` reemplaza `hato_litros_diarios`; §6 D2, §7.1, §7.2. |
| V4 | **KPI de productividad**: litros ÷ número de vacas en ordeño. | §6 D, §7.6 (KPI cards). |
| V5 | Conciliación **quincenal vs. confirmación del Pomar** (reclamo de discrepancias). | §6 D5. |
| V6 | **Secado dependiente de raza** (Jersey/Holstein: 2 meses antes del parto; Normanda: 3) **+ sub-módulo "Ajustes del Hato" en Configuración global** para editar las condicionales de las fórmulas (tiempo de secado por raza, catálogo de razas, umbrales). | `raza` en `hato_animales`, tabla `hato_config`; §7.1, §7.3, §6 Épica H, ubicación en Configuración. |
| V7 | **Timeline reproductiva muestra TODOS los intentos de servicio**, incluidos los fallidos (servicio → celo/no quedó → re-servicio), cada uno con inseminación-vs-toro y cuál toro. | §6 A3. |
| V8 | **Genealogía muestra padre Y madre** (el mock solo mostraba madre; padre está en ~40% → "sin registrar" cuando falta). | §6 A5, §7.6. |
| V9 | **Indicador "próxima a reemplazo"**: vacas cerca de 9 partos. | §6 A/E. |
| V10 | **Subir el Excel del chequeo es el flujo recomendado P0** (subir `.xlsx` → parsear → poblar); la grilla (B1) queda como camino manual y foto-OCR (B6) sigue P2. Razón: es lo que Martha ya hace + los datos quedan seguros en el Excel si el sistema falla. | §6 Épica B, §7.4, §7.5. |
| V11 | Alertas: **arrancar con revisión semanal de Martha en el sistema** (no diaria); escalamiento a 48h se mantiene; futuro opcional: notificar al dueño cuando Fernando completa una tarea. | §6 C4/C6. |
| V12 | **Catálogo de toros editable** (agregar toro nuevo fácil), unifica la referencia de toro para genealogía (padre) y pajillas/servicios. | §7.1 `hato_toros`, §6 Épica G. |
| — | **Pajillas** (Épica G) = 6º ítem del sidebar del hato: `/hato-lechero/pajillas`. | §7.5. |
| — | **V13–V15 diferidos** (potreros/pastos, definición de "días abiertos", correcciones de copy) — no se aplican en esta versión. | — |

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
4. Producción: pesaje semanal por vaca + litros al camión por quincena; PL calculado; productividad litros/vaca.
5. Tablero: KPIs de producción y reproducción + listas de acción.
6. Importación histórica 2017–2026 (asistida, con reporte de calidad y sesión de revisión con Martha).
7. Genealogía para selección de toros (madre **y** padre).
8. Integración de lectura con Finanzas ("Hato Lechero": $/litro, margen).
9. Seguimiento de pajillas de inseminación: inventario simple (nombre del toro, cantidad) + fecha de uso de cada pajilla.
10. Ajustes del Hato: sub-módulo en Configuración global para editar las condicionales de las fórmulas (tiempo de secado por raza, catálogo de razas, umbrales de alertas) sin tocar código.

### Fuera (explícito)
- Rehacer Finanzas (gastos/ingresos/presupuesto ya existen; la leche sigue entrando por `fin_ingresos`).
- **Homologación de gastos históricos del Excel GASTOS FOV contra `fin_gastos`** (incluye recuperar la nómina faltante abr–jun 2026) — fue una **tarea paralela e independiente**, documentada en el [registro archivado](./archive/implementation/plan_hato_lechero_gastos_backfill.md). No requiere las tablas `hato_*` ni las migraciones de este plan; vive fuera del grafo de sesiones (§8).
- Calendario sanitario preventivo completo (solo lo que aparece en el chequeo, por ahora).
- Reemplazar la planilla de papel (el sistema la asiste; a futuro la genera pre-llenada).
- Diseño visual detallado (paso siguiente).

### Relación con el módulo Ganado existente (`/ganado`, tablas `gan_*`)
Son dominios distintos: `gan_inventario` es **conteo por cabezas** para ceba (novillos/toros por potrero) y no puede representar vacas/terneras sin cambio de esquema. El hato lechero es **registro individual**. Decisión: módulo nuevo con prefijo `hato_`, excluido de `gan_inventario`. Puntos de contacto deliberados: reutiliza `gan_fincas` (Subachoque ya existe) y las ventas/compras siguen pasando por `fin_transacciones_ganado` con un vínculo nuevo a la ficha individual (ver §7.2). Conteos del hato vía vista derivada, nunca copiados a `gan_inventario`.

---

## 6. Épicas y requisitos (P0 = pre-visita · P1 = sept–oct · P2 = explorar)

### Épica A — Fichas individuales
- **A1 (P0)** Lista del hato (número, nombre, estado, PL, próximo evento).
- **A2 (P0)** Ficha completa por vaca: identidad, raza, partos, servicio vigente, toro, TP, fechas proyectadas, tratamientos, notas.
- **A3 (P1)** Línea de tiempo reproductiva por vaca. **(V7)** Debe mostrar **todos** los intentos de servicio del ciclo, incluidos los que no cuajaron: `servicio → celo/no quedó → re-servicio`, cada evento indicando si fue inseminación o monta y con cuál toro. El mock solo mostraba un servicio "exitoso" — la realidad tiene varios intentos y todos deben quedar visibles.
- **A4 (P0)** Registro de eventos de ciclo de vida (parto con destino de cría, venta, muerte, cambio de etapa).
- **A5 (P1)** Árbol genealógico (madre **y padre**/crías desde TERNERAS). **(V8)** El mock solo mostraba la madre; se muestran ambos progenitores. El padre está en ~40% de las terneras → cuando falta se renderiza "sin registrar", nunca en blanco (blanco no implica "sin padre").
- **A6 (P2)** Advertencia de consanguinidad al proponer toro.
- **A7 (P1) (V9)** Indicador **"próxima a reemplazo"**: vaca cercana a 9 partos se marca en lista y ficha — cerca de ese umbral las vacas empiezan a reemplazarse. Umbral configurable en Ajustes del Hato (Épica H).

Criterios clave: máquina de estados estructurada (`novilla → servida → preñada → próxima a secar → seca → parida…` + terminales `vendida`/`muerta`); las abreviaturas del dominio (OV, AV, A+, O+, A{n}, TJ, ins {toro}, OK, Rech) se mapean a eventos estructurados pero la UI habla el vocabulario de Martha; ningún animal se elimina jamás; el # es la llave visible en todo el módulo.

### Épica B — Chequeo veterinario
- **B0 (P0) (V10) — flujo recomendado para arrancar: subir el Excel del chequeo.** Martha sigue llenando su Excel de chequeo como siempre y, en vez de archivarlo, lo sube al sistema con un botón (`.xlsx` → el pipeline lo parsea, descompone SX→eventos y puebla el chequeo). Es el camino de menor fricción y de mayor seguridad: es lo que ella ya hace y, si el sistema falla, los datos siguen intactos en el Excel ("empalme gradual"). Reusa la lógica de S3 (§7.4) como import recurrente por chequeo, con la misma regla de "ambiguo → revisión, nunca en silencio". Al subir, muestra un diff para aprobar antes de comprometer.
- **B1 (P1)** Grilla "nuevo chequeo" pre-llenada con el chequeo anterior; Martha solo digita lo que cambió. Camino **manual/alternativo** a B0 (para ediciones puntuales o cuando no hay Excel a la mano). Baja de P0 a P1: con B0 funcionando, la grilla deja de ser crítica para el lanzamiento.
- **B2 (P0)** Cálculo automático de SECAR y PP. **(V6)** PP = servicio + 9 meses; SECAR = PP − periodo de secado **según raza** (Jersey/Holstein 2 meses, Normanda 3), sin `#VALUE!`. El periodo por raza se lee de Ajustes del Hato (Épica H), no se hardcodea.
- **B3 (P0)** TTTO estructurado con pasos y fechas (ej. estrumate día 0 → servir día 7) + nota libre siempre disponible.
- **B4 (P0)** Borrador persistente (para el camino manual B1; transcribe ~45 vacas, no puede perder avance).
- **B5 (P1)** Planilla pre-llenada imprimible para llevar al chequeo.
- **B6 (P2)** Foto de planilla → OCR propone cambios sobre la misma grilla; nunca aplica sin revisión.

Criterios clave: el chequeo es un evento con identidad (patrón `rondas_monitoreo`); una fecha por campo con validación dura; al cerrar, resumen de acciones generadas ("7 tareas, 3 secados en ventana, 2 rechequeos") para validación final. Tanto B0 (subida de Excel) como B1 (grilla) desembocan en el mismo chequeo estructurado y la misma descomposición de eventos.

### Épica C — Alertas Telegram con lazo cerrado (capacidad estrella)
- **C1 (P0)** "Vaca 47 (Estrella) se debe secar hoy. ¿Ya se secó?" [Sí / Todavía no / Otra cosa] → registra `secado_real`.
- **C2 (P0)** Recordatorio de pasos de tratamiento el día que tocan, con confirmación.
- **C3 (P0)** Seguimiento de "servir al próximo celo": pregunta periódica "¿ya se sirvió la 15? ¿qué día y con qué toro?".
- **C4 (P0)** Supervisión por excepción de Martha. **(V11)** Para arrancar, el control se revisa **una vez por semana** directamente en la Cola de alertas del sistema (Martha no necesita meterse a diario). El resumen a Martha se reserva para lo vencido/escalado. Futuro opcional: notificar al dueño cuando Fernando marca una tarea como completada, para que al revisar semanalmente esté todo al día.
- **C5 (P1)** Aviso de rechequeos pendientes antes del próximo chequeo.
- **C6 (P1)** Configuración de destinatarios y horarios por tipo de alerta sin tocar código.
- **C7 (P1)** Reporte espontáneo de eventos ("la 22 parió anoche, macho") con conversación guiada.

Criterios clave: toda alerta es accionable y cerrable con botones; "No" repregunta motivo y reagenda; sin respuesta → reintento +1 día, escalamiento a Martha a las 48h — **nada se pierde en silencio**; número + nombre siempre juntos; anti-fatiga: mensajes agregados por franja, nunca ráfagas; toda respuesta escribe evento auditado (quién, cuándo, qué). El espíritu es **recordatorio útil para Fernando, no supervisión presionante** (validado con Martha).

### Épica D — Producción de leche *(módulo "Producción" en el sidebar; antes "Control de ordeño"/"Leche", V2)*
- **D1 (P0)** Pesaje semanal por vaca (AM/PM) — grilla web + conversación Telegram. **Se mantiene tal cual** (Martha: "no cambiemos nada de cómo estamos operando"); alimenta el PL por vaca.
- **D2 (P0) (V3)** Litros al camión **por quincena**, no por día. El camión recoge a diario y Fernando anota en la tarjeta de papel; el sistema registra el **total quincenal** (el ciclo con que el Pomar liquida). El dato diario es demasiado granular y no se captura en el sistema.
- **D3 (P0)** Curva de producción y PL vigente por vaca (PL pasa a ser **calculado**, no digitado).
- **D4 (P0) (V4)** KPI de **productividad = litros ÷ número de vacas en ordeño** — la métrica que Martha quiere para juzgar si el hato rinde (varía con potrero/pasto).
- **D5 (P1)** Proyección mensual/anual de litros a partir de la serie quincenal.
- **D6 (P1) (V5)** Conciliación **quincenal vs. confirmación del Pomar**: el sistema muestra los litros registrados vs. los que el Pomar confirma; cuando hay diferencia (a veces quitan litros), queda el soporte para el reclamo. Complementa el cruce con `fin_ingresos`.
- **D7 (P1)** Importar archivo "promedio leche" (abr 2025+).

Criterio clave: vaca no pesada = sin dato (—), **nunca 0** (misma regla del módulo de monitoreo).

### Épica E — Tablero e indicadores
- **E1 (P0)** Listas de acción: próximas a secar (30d), próximas a parir (30d), rechequeo, vacías/por servir.
- **E2 (P0)** KPIs: vacas por estado, litros/quincena del hato, **litros/vaca en ordeño (productividad, V4)**, PL promedio.
- **E3 (P1)** Indicadores reproductivos: días abiertos, intervalo entre partos, % preñez, días en leche.
- **E4 (P1)** Cruce con Finanzas: ingreso leche, gastos del negocio, margen, costo/litro.
- **E5 (P1)** Herramientas Esco: `get_hato_animal`, `get_hato_reproduccion`, `get_hato_produccion` (web + Telegram automático vía `llmToolLoop`).
- **E6 (P2)** Sección hato en el reporte semanal.

Criterio clave: KPIs reproductivos apagados hasta que la importación esté validada — mejor "sin dato" que un número falso.

### Épica F — Importación histórica
- **F1 (P0)** Hato actual (chequeo jul 2026 + cruce TERNERAS) con revisión asistida.
- **F2 (P1)** Histórico de chequeos 2019–2026 (reconstrucción reproductiva).
- **F3 (P0)** TERNERAS 2017+ completo (genealogía y edades).
- **F4 (P0)** Reporte de calidad: celdas no interpretables, contradicciones de identidad, vacas sin nacimiento.

Regla de oro: **ningún dato ambiguo se importa en silencio** — lo limpio entra, lo ambiguo va a lista de revisión con Martha.

### Épica G — Seguimiento de pajillas (inventario de inseminación)

Funcionalidad secundaria: un inventario simple de las pajillas de inseminación, sin la complejidad del resto del módulo — deliberadamente mínimo, no un sistema de inventario general.

- **G1 (P1)** Catálogo de pajillas: registrar toro/pajilla con nombre y cantidad inicial en inventario.
- **G2 (P1)** Registrar el uso de una pajilla: fecha de uso y, si se conoce, la vaca servida.
- **G3 (P1)** Vista de inventario: cantidad actual por toro (inicial − usos registrados), para poder monitorear qué queda disponible.

- **G4 (P1) (V12)** Catálogo de toros editable: agregar un toro nuevo fácilmente. Es la fuente única del toro que alimenta la genealogía (padre) y las pajillas/servicios — la lista se sembró automáticamente desde los datos históricos, pero debe ser modificable.

Criterios clave: la pajilla solo guarda nombre del toro, cantidad en inventario y fecha de uso de cada pajilla — sin campos no solicitados (proveedor, costo; se agregan después si hace falta). El toro se referencia desde el catálogo de toros (G4), no como texto suelto. El vínculo opcional con la vaca servida en G2 no es obligatorio para registrar un uso (mejor registrar el uso sin la vaca que no registrarlo), pero cuando existe alimenta A5/A6 (genealogía y advertencia de consanguinidad) sin digitación adicional. Si el stock llega a 0, la UI advierte pero **no bloquea** registrar un uso nuevo — es más importante que quede el evento reproductivo que la exactitud del conteo.

Fuera de alcance de esta épica: vincular automáticamente cada `servicio` de `hato_eventos` a una pajilla (evitaría doble digitación pero acopla dos flujos que hoy son independientes) — se anota como mejora futura opcional, no como parte de G.

### Épica H — Ajustes del Hato *(sub-módulo dentro de Configuración global, V6)*

Panel de configuración de las condicionales que hoy irían hardcodeadas en el motor de fórmulas, para que Martha/Gerencia las editen sin tocar código.

- **H1 (P0)** Catálogo de razas + periodo de secado por raza (Jersey/Holstein: 2 meses antes del parto; Normanda: 3). Alimenta el cálculo de SECAR (B2/V6).
- **H2 (P1)** Umbrales de indicadores/alertas editables: umbral de "próxima a reemplazo" (partos, default 9, A7); ventanas de "próxima a secar/parir"; días para `servicio_sin_confirmacion` y `rechequeo_due`.
- **H3 (P2)** Otros parámetros que emerjan (ej. gestación por raza si hiciera falta).

Criterios clave: vive en **Configuración global** (no en el sidebar del hato), gateado a Gerencia; los valores son leídos por `calculosHato.ts`/el motor de alertas desde la tabla `hato_config`, nunca constantes en código. Defaults sensatos precargados para que el módulo funcione sin configuración previa.

---

## 7. Arquitectura técnica

### 7.1 Modelo de datos (prefijo `hato_`, migraciones **050+** — 049 la tomó el sidebar reorg)

**Diseño en tres capas** (recomendado sobre snapshot puro):
1. **Capa cruda** — `hato_chequeo_vacas` conserva los valores de la planilla textuales (`*_raw text`). La procedencia sobrevive a errores de normalización.
2. **Capa de eventos** — `hato_eventos` es la fuente de verdad append-only del ciclo de vida.
3. **Capa derivada** — estado actual por vaca como vista SQL (`v_hato_estado_actual`) + motor puro TS (`calculosHato.ts`) con el mismo cálculo. Sin tabla de estado materializada (hato ~60 animales; la vista es trivial). Espejo del patrón ya probado `gan_movimientos → gan_inventario` y `rondas_monitoreo → observaciones` (ausencia de fila = "no visto", nunca 0).

**Tablas:**

- **`hato_animales`** — un registro por animal, para siempre. `id uuid PK`, `numero integer UNIQUE` (chapeta permanente, D1; nullable para animales históricos sin número), `nombre`, `sexo`, `etapa` (`ternera|novilla|vaca|toro`), `raza text` (**V6** — `jersey|holstein|normanda|…`, FK lógica al catálogo de razas de `hato_config`; nullable, default al comportamiento Jersey/Holstein cuando no se conoce), `estado` (`activa|vendida|muerta|descartada`), `fecha_estado`, `fecha_nacimiento` + `fecha_nacimiento_confianza` (`exacta|aproximada|desconocida`), `madre_id` (self-FK), `padre_toro_id uuid REFERENCES hato_toros(id)` (**V8/V12** — progenitor desde el catálogo de toros; nullable, ~40% sin registrar), `padre_id` (solo si el padre es un animal propio del hato), `finca_id → gan_fincas`, `origen` (`nacimiento|compra|importacion_historica`), `confianza` (`alta|media|baja`), `import_meta jsonb`, `notas`. Índices: `(estado, etapa)`, `madre_id`.
- **`hato_chequeos`** — cabecera de ronda: `fecha`, `veterinario`, `estado` (`borrador|cerrado`), `fuente` (`web|importacion`), `sheet_ref`.
- **`hato_chequeo_vacas`** — una fila por vaca por chequeo, `UNIQUE(chequeo_id, animal_id)`. Columnas raw (`pl_raw`, `sx_raw`, `fecha_servicio_raw`, `ttto_raw`, …) + normalizadas nullable (`pl numeric`, `fecha_servicio date`, `toro`, `tipo_servicio`, `meses_prenez`, `fecha_secar`, `fecha_probable_parto`, `normalizacion_issues jsonb`).
- **`hato_eventos`** — log reproductivo/ciclo de vida: `animal_id`, `tipo` (`servicio|celo|confirmacion_prenez|parto|aborto|secado_real|venta|muerte|compra|cambio_etapa|rechequeo`), `fecha` + `fecha_confianza`, `toro_id uuid REFERENCES hato_toros(id)` (**V12** — antes texto `toro`), `tipo_servicio` (`monta|inseminacion`), `cria_id`, `cria_destino` (`retenida|macho_vendido|hembra_vendida|muerta|aborto`), `sx_raw`, procedencia (`chequeo_vaca_id`, `alerta_id`, `fuente`, `transaccion_ganado_id`), `datos jsonb`. Nota: `secado_planificado`/`parto_probable` NO son eventos — son fechas derivadas (una sola fuente de verdad). **(V7)** Un ciclo puede tener **varios `servicio`** encadenados: un `servicio` que no cuaja se sigue de un `celo` (retorno a celo) y luego otro `servicio` — todos quedan en el log y la timeline (A3) los muestra en orden con su toro/tipo. Índices: `(animal_id, fecha)`, `(tipo, fecha)`, parcial sobre `tipo='servicio'`.
- **`hato_tratamientos`** + **`hato_tratamiento_pasos`** — prescripción del chequeo con pasos programados (`paso_num`, `offset_dias`, `fecha_programada`, `fecha_ejecutada`, `requiere_confirmacion`). Catálogo **`hato_protocolos`** (ej. "Estrumate": día 0 aplicar → día 7 servir → día 9 verificar celo) para que Martha elija en vez de digitar.
- **`hato_pesajes_leche`** — `UNIQUE(animal_id, fecha)`, `litros_am`, `litros_pm`, `litros_total GENERATED`. Sin cabecera de ronda (la fecha ES la ronda; no existe el problema multi-fecha de monitoreo). Se mantiene semanal (V3 solo cambia el registro del camión, no el pesaje por vaca).
- **`hato_produccion_quincenal`** (**V3** — reemplaza `hato_litros_diarios`) — `id uuid PK`, `anio int`, `quincena int CHECK (quincena IN (1,2))` (o `fecha_inicio`/`fecha_fin date`), `UNIQUE(anio, quincena)`, `litros_total numeric NOT NULL`, `litros_pomar_confirmado numeric` (nullable — llega después del Pomar, **V5**), `num_vacas_ordeño int` (para la productividad de D4/V4), `notas`, `fuente`, `created_at`, `created_by`. Productividad = `litros_total / num_vacas_ordeño` (derivada, no almacenada). Columna vertebral de conciliación: pesaje semanal (por vaca) + producción quincenal (volumen real al camión) + confirmación del Pomar + `fin_ingresos` (volumen facturado) = series que se cruzan, nunca se mezclan. La tarjeta diaria de papel no entra al sistema.
- **`hato_alertas`** — cola de tareas salientes: `tipo` (`secado_due|tratamiento_paso|rechequeo_due|servicio_sin_confirmacion|parto_proximo`), `animal_id`, `regla_clave UNIQUE` (idempotencia), `fecha_programada`, `estado` (`pendiente|enviada|respondida|confirmada|descartada|escalada|expirada`), `destinatario_telegram_id`, `intentos`, `respuesta`, `respondida_por`, `escalada_at`. + **`hato_alertas_config`** (tipo → destinatario, horas de escalamiento).
- **`hato_toros`** (**V12**, Épica G4) — catálogo editable de toros/sementales: `id uuid PK`, `nombre text NOT NULL`, `tipo text` (`monta|inseminacion`), `raza text`, `activo boolean DEFAULT true`, `created_at`, `created_by`. Fuente única del progenitor referenciado por `hato_animales.padre_toro_id`, por los `servicio` de `hato_eventos` y por las pajillas. Sembrado desde los datos históricos, modificable en UI.
- **`hato_pajillas`** (Épica G) — inventario: `id uuid PK`, `toro_id uuid NOT NULL REFERENCES hato_toros(id)` (**V12** — ya no texto suelto), `cantidad_inicial integer NOT NULL CHECK (cantidad_inicial >= 0)`, `activa boolean DEFAULT true`, `created_at`, `created_by`. Deliberadamente mínima — sin proveedor/costo (no solicitados).
- **`hato_pajillas_uso`** (Épica G) — log de uso, append-only (mismo patrón capa-de-eventos que `hato_eventos`): `id uuid PK`, `pajilla_id uuid NOT NULL REFERENCES hato_pajillas(id)`, `fecha_uso date NOT NULL`, `animal_id uuid REFERENCES hato_animales(id)` (opcional — vaca servida, si se conoce). Vista derivada `v_hato_pajillas_stock`: `cantidad_actual = cantidad_inicial - COUNT(usos)` por pajilla, sin tabla de stock materializada (mismo razonamiento de §7.1 intro — volumen trivial).
- **`hato_config`** (**V6**, Épica H) — parámetros editables de las fórmulas, key-value tipado o filas por concepto: catálogo de razas + `meses_secado` por raza (Jersey/Holstein=2, Normanda=3), umbral de partos para "próxima a reemplazo" (default 9), ventanas de secado/parto próximos, días para `servicio_sin_confirmacion`/`rechequeo_due`. Leída por `calculosHato.ts` y el motor de alertas — **ninguna de estas constantes vive en código**. Defaults precargados en la migración. Escritura Gerencia.

**Descomposición de códigos SX** (mismo parser para importación y captura en vivo):

| SX | Eventos |
|---|---|
| `OV` | `parto` con `cria_destino='macho_vendido'`, sin ficha de cría (D3) |
| `AV` | `parto` + `cria_destino='hembra_vendida'`; ficha solo si TERNERAS la nombra (entonces `estado='vendida'`) |
| `A{n}` | `parto` + `cria_destino='retenida'` + alta/match de `hato_animales` (numero=n, madre, fecha nacimiento), reconciliado contra TERNERAS |
| `A+`/`O+` | `parto` con `cria_destino='muerta'`; `O+` sin parto → `aborto` |

**RLS:** patrón de la migración 044 — SELECT para `authenticated`, escritura Administrador + Gerencia; `hato_alertas` con escritura service-role para cron/bot; `hato_config` con escritura Gerencia. **Capa de visibilidad (producción, #70):** el módulo ya está gateado por `ModuleGuard modulo="hato_lechero"` + la columna `usuarios.modulos_acceso` (Gerencia ve todo; a Administrador/Verificador se les habilita por-usuario desde Configuración → Usuarios). Esto es visibilidad de navegación, NO un límite de datos — la RLS de tabla es la frontera real. Las rutas del hato viven bajo ese `ModuleGuard`.

### 7.2 Integraciones

> **Numeración de migraciones**: 049 la tomó el sidebar reorg (`049_add_usuarios_modulos_acceso.sql`). Las migraciones del hato arrancan en **050**: `050 create_hato_core`, `051 create_hato_leche` (incluye `hato_produccion_quincenal`), `052 create_hato_tratamientos`, `053 create_hato_alertas`, `054 create_hato_toros_pajillas` (Épica G), `055 create_hato_config` (Épica H), `056 fin_transacciones_ganado_hato_link`, `057 hato_alertas_cron`. Coordinar en un solo PR (ya hubo colisiones de numeración).

- **Sidebar / navegación (producción, #70)**: las 5 pantallas ya existen como `ComingSoon` en `/hato-lechero/{'',produccion,hato,chequeos,alertas}`; la implementación las reemplaza por las vistas reales. **Pajillas** se agrega como 6º ítem `/hato-lechero/pajillas` (requiere sumar una entrada al grupo Hato en `Layout.tsx`). **Ajustes del Hato** NO va al sidebar del hato — vive en Configuración global (`ConfiguracionDashboard`), gateado a Gerencia.
- **`gan_inventario`: excluido** (firme). Sus columnas son `novillos`/`toros`; el conteo lechero sale de `COUNT(*)` sobre `hato_animales` vía vista `v_hato_conteo`.
- **`fin_transacciones_ganado`** — un conflicto real a resolver: el trigger 044 `fn_crear_movimiento_pendiente_ganado` dispara con CADA insert, generando un pendiente de ceba espurio al vender una vaca lechera. Migración `056`: agregar `es_hato boolean DEFAULT false` + `hato_animal_id uuid FK`, y `IF NEW.es_hato THEN RETURN NEW` en el trigger. Flujo: marcar `vendida`/`muerta` en la UI del hato abre el `TransaccionGanadoForm` existente pre-llenado; al guardar se crea el `hato_eventos` de venta con el vínculo financiero. Extender RLS de `fin_transacciones_ganado` (hoy solo Gerencia, migración 023) a Administrador, en línea con 037/039.
- **Finanzas**: cero trabajo de esquema. La leche sigue por `fin_ingresos` (parsing de litros ya existe, migración 042).
- **Esco**: 3 herramientas nuevas en `chat.tsx` (`get_hato_animal`, `get_hato_reproduccion`, `get_hato_produccion`); lógica de agregación en módulo puro `hato-aggregation.ts` (patrón `cost-aggregation.ts`) testeable con Vitest. Actualizar descripción de `get_ganado_inventory` (excluye hato). Telegram hereda automático vía `llmToolLoop`.
- **Conversaciones Telegram nuevas**: `pesajeLeche` (itera vacas en ordeño, acepta "8.5 7", salteable, reanudable) y `produccionQuincenal` (**V3** — captura el total de litros de la quincena al cierre, UPSERT por `anio+quincena`; antes era `litrosCamion` diario). Respuestas de alertas NO son conversaciones: son handlers `callbackQuery(/^hato_alerta:(.+):(si|no|otro)$/)` — el patrón `mem_save:` existente. Nuevos valores de `modulos_permitidos`: `hato_produccion`, `hato_alertas`.
- **pg_cron** (migración 057): tick diario 05:45 Bogotá → `net.http_post` a `/make-server-1ccce916/hato/alertas/tick` (patrón 030), protegido con header de secreto compartido (dispara mensajes salientes).
- **Reporte semanal**: sección Hato Lechero aditiva en `fetchDatosReporteSemanal.ts` (P2).

### 7.3 Motor de alertas

**Reglas** (funciones puras sobre `v_hato_estado_actual` + pasos de tratamiento):

| Tipo | Dispara cuando | `regla_clave` (idempotencia) |
|---|---|---|
| `secado_due` | `fecha_secar <= hoy` y sin `secado_real` posterior al servicio. **(V6)** `fecha_secar` = `parto_probable − meses_secado(raza)`, con `meses_secado` leído de `hato_config` (Jersey/Holstein 2, Normanda 3) — no una constante | `secado:{animal}:{fecha_servicio}` |
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

La matriz P&G de gastos queda **fuera de este pipeline** — se homologó por separado, con el método de matching (concepto + fecha + monto, sin duplicar lo ya cargado) descrito en el [registro archivado](./archive/implementation/plan_hato_lechero_gastos_backfill.md).

**Import recurrente por chequeo (V10, flujo B0)** — la misma lógica de Extract→Normalize (etapas 1–2, que ya viven en `calculosHato.ts`) se expone como una **funcionalidad en la app**: Martha sube el `.xlsx` de un chequeo nuevo, el sistema lo parsea, descompone SX→eventos y muestra un **diff para aprobar** antes de comprometer (nunca commit directo). Difiere del pipeline histórico en tres cosas: (a) corre en la app (edge/endpoint), no offline; (b) es de una hoja/chequeo, no 40; (c) la resolución de identidad es trivial porque el hato ya está poblado (match por `numero`, alta confianza). Reusa el parser compartido → los mismos tests cubren ambos caminos. Es el flujo **recomendado para arrancar** (empalme gradual: el Excel sigue siendo la fuente segura).

### 7.5 Frontend

Rutas lazy bajo `/hato-lechero` — la estructura y los labels ya están fijados por el sidebar de producción (#70). Los 5 primeros existen como `ComingSoon`; la implementación los reemplaza. Pajillas es el 6º ítem a agregar; Ajustes vive en Configuración global.

| Ruta (producción) | Label sidebar | Componente |
|---|---|---|
| `/hato-lechero` | Tablero | `HatoDashboard` — KPIs + tablero de alertas |
| `/hato-lechero/produccion` | Producción | `ProduccionView` — pesaje semanal por vaca + producción quincenal + productividad (V2/V3/V4) |
| `/hato-lechero/hato` | Hato | `AnimalesList` |
| `/hato-lechero/hato/:id` | — | `HojaDeVida` — timeline (todos los servicios, V7) + chequeos + curva PL + genealogía madre+padre (V8) |
| `/hato-lechero/chequeos` | Chequeos | `ChequeosList` + subir Excel (B0/V10) |
| `/hato-lechero/chequeos/:id` | — | `ChequeoCapturaGrid` (camino manual B1, borrador → cerrado) |
| `/hato-lechero/alertas` | Alertas | `AlertasView` — cola con estados y respuestas |
| `/hato-lechero/pajillas` | Pajillas *(6º ítem nuevo)* | `PajillasView` — catálogo de toros + inventario (Épica G) |
| `/configuracion` → tab "Hato" | *(en Configuración global)* | `AjustesHato` — razas, secado, umbrales (Épica H) |

```
src/components/hato/            # espejo de src/components/ganado/
├── HatoDashboard.tsx, HatoSubNav.tsx, AnimalesList.tsx, HojaDeVida.tsx,
│   ChequeosList.tsx, ChequeoCapturaGrid.tsx, ProduccionView.tsx, AlertasView.tsx,
│   PajillasView.tsx
├── components/                 # VentaAnimalDialog, PartoDialog, TratamientoDialog,
│                               # PesajeSemanalGrid, ProduccionQuincenalForm, EventoTimeline,
│                               # GenealogiaArbol, RegistrarUsoPajillaDialog, SubirChequeoExcel
└── hooks/                      # useHatoAnimales, useChequeoCaptura, useProduccion,
                                # useHatoAlertas, useEstadoReproductivo, usePajillas
src/components/configuracion/AjustesHato.tsx   # Épica H — tab en ConfiguracionDashboard
src/utils/calculosHato.ts       # puro: motor de fechas (lee hato_config), parser SX/planilla, PL, proyecciones
src/types/hato.ts
src/__tests__/calculosHato.test.ts
src/__tests__/calculosHatoParidad.test.ts
src/__tests__/hatoAlertas.test.ts
```

**Captura del chequeo — dos caminos al mismo destino (V10):** el recomendado para arrancar es **subir el Excel** (`SubirChequeoExcel` → parse → diff → aprobar). La **grilla** (`ChequeoCapturaGrid`, patrón validado en `CapturaCosechaGrid`: vacas pre-pobladas, valores anteriores en fantasma, preview de normalización, borrador con `useFormPersistence`) queda como camino manual/alternativo. Ambos ejecutan la misma descomposición de eventos con diálogo de confirmación. Diálogos por vaca solo para eventos fuera de ciclo (parto, venta, tratamiento).

**Foto-OCR (B6, Fase 2)**: viable — OpenRouter ya integrado, Gemini 3 Flash acepta imágenes. Foto → endpoint `/hato-lechero/chequeos/ocr` → JSON estricto → **pre-llena la misma grilla como borrador para revisión humana, nunca commit directo**. Se pospone: la grilla debe existir primero y el prompt se afina con fotos reales recolectadas en la visita de agosto.

Convenciones obligatorias: `format.ts` para números (formato colombiano), `onWheel` blur en cada input numérico (grilla de 45×10 celdas = máxima exposición al bug de scroll), Dialog con `size` + `DialogBody`, RoleGuard + RLS Administrador/Gerencia, y el `ModuleGuard hato_lechero` de producción para la visibilidad del módulo.

### 7.6 Referencia visual (prototipo Figma)

**[Prototipo completo](https://www.figma.com/design/rtcPBS6WdZW0k063g8u9KH/Escocia-OS-—-Módulo-Hato-Lechero--Mockups-)** — 7 pantallas de referencia (17 jul 2026).

> **Regla de uso (V1, validado con Martha 2026-07-21 — el mock funcionó muy bien en la demo)**: el mock es el **sistema de diseño autoritativo** para las **pantallas de contenido** del módulo. No es solo "inspiración de look-and-feel": los componentes se construyen para coincidir con él (chips, tablas limpias, KPI cards, gráficas, timeline, mini-árbol, franja de stats). Dos límites firmes:
> - **El sidebar NO lo dicta el mock** — es el de producción (#70): grupo "Hato Lechero" con Tablero/Producción/Hato/Chequeos/Alertas + `ModuleGuard`. El render de sidebar de las capturas del mock se ignora.
> - **No se editan las definiciones globales del sistema de diseño** (`src/styles/globals.css`, comportamiento de los primitivos compartidos `src/components/ui/`). Los componentes nuevos del mock se construyen **scoped al módulo hato**. El rediseño de UI de toda la app es el **proyecto siguiente y separado**, y este módulo es su **referencia** — por eso los componentes nuevos deben quedar limpios y extraíbles.
>
> El *contenido* (datos, columnas, campos exactos) sigue gobernado por las épicas de §6, no por el mock — los agentes de frontend deciden el detalle final dentro de este lenguaje visual.

**Inventario de pantallas → épica/ruta correspondiente:**

| Pantalla Figma | Ruta producción (§7.5) | Épica (§6) |
|---|---|---|
| ① Dashboard | `/hato-lechero` (Tablero) | E — Tablero e indicadores |
| ② Lista del hato | `/hato-lechero/hato` | A1 |
| ③ Hoja de vida — #47 Estrella | `/hato-lechero/hato/:id` | A2, A3 (todos los servicios, V7), A5 (madre+padre, V8) |
| ④ Captura de chequeo | `/hato-lechero/chequeos/:id` | B0–B4 |
| ⑤ Control de ordeño → **Producción** | `/hato-lechero/produccion` | D (quincenal V3, productividad V4) |
| ⑥ Cola de alertas | `/hato-lechero/alertas` | C |
| ⑦ Telegram — lazo cerrado | (fuera de la app web) | C1–C4 |

> Nota sobre la pantalla ⑤: el mock muestra barras **diarias**; con V3 el dato se registra **por quincena**. Se conserva el estilo del gráfico de barras, cambia el eje a quincenas.

**Lenguaje visual — componentes canónicos del módulo** (construidos scoped al hato, sin tocar globales; quedan como referencia para el futuro rediseño de la app):

- **Chips/badges de estado semánticos** — todo estado (etapa de vaca, estado de alerta, resultado de chequeo) se pinta como un chip de color, nunca como texto plano. Paleta consistente: verde = saludable/confirmado/en leche, ámbar = requiere atención pronto (próxima a secar, escalada, próxima a reemplazo), azul = en progreso (servida, enviada), gris = neutro/inactivo (seca, pendiente), rojo = vencido/urgente/destructivo. Componente scoped que envuelve `src/components/ui/badge.tsx` sin alterarlo; helper único de color-por-estado en `calculosHato.ts` (precedente `clasificarGravedad` de `calculosMonitoreo.ts`) — una sola fuente de verdad, nunca color inline.
- **Tarjetas de KPI** (fila de 3–4 en Dashboard y Producción) — icono en círculo de color, label pequeño gris, número grande, delta/subtexto abajo. Coincidir con el mock; hay precedentes en el repo (`KPICardsProduccion.tsx`, `ClimaKPICards.tsx`, `DashboardKPICard.tsx`) que sirven de base pero el estilo final lo fija el mock.
- **Tablas limpias** (Lista del hato, grilla de Chequeo, Cola de alertas) — header gris claro en mayúsculas pequeñas, filas blancas con divisor sutil (sin grid pesado), sin zebra-striping, valores de estado siempre como chip. Sobre `src/components/ui/table.tsx`.
- **Barra de progreso horizontal por categoría** ("Vacas por estado" en el Dashboard) — sobre `src/components/ui/progress.tsx` o Recharts horizontal bar, con leyenda de puntos de color.
- **Gráficas** (curva de PL en la hoja de vida, producción quincenal en Producción) — Recharts, patrón de `produccion/components/Grafico*.tsx`: línea con marcadores + burbuja resaltando el último valor; barras con la barra actual resaltada en verde oscuro vs. el resto en verde claro.
- **Línea de tiempo vertical** (`EventoTimeline.tsx`) — **componente canónico nuevo**: punto sólido para eventos pasados, punto hueco para proyectados, entrada resaltable "HOY"; debe soportar **múltiples servicios encadenados** (V7).
- **Mini-árbol de genealogía** (`GenealogiaArbol.tsx`) — **componente canónico nuevo**: madre **y padre** → esta vaca → crías, cajas conectadas por líneas finas; "sin registrar" cuando falta el padre (V8).
- **Grilla de captura con preview de cálculo en vivo** — banner explicativo arriba; fila en edición muestra el auto-cálculo (Secar/PP) antes de guardar.
- **Franja de estadísticas compactas** (hoja de vida, bajo el header — PL, #Partos, Días en leche, Días abiertos, Secar, Parto probable en una fila) — **componente canónico nuevo**, denso; solo en vistas de detalle de un registro.
- **Chips de contexto persistente** (header: "Finca: Subachoque" + avatar) — reutilizar el header/breadcrumb de producción; no duplicar.

**Decisiones que el prototipo no resuelve:**

1. ~~Sub-navegación~~ — **resuelta por producción (#70)**: es el sidebar agrupado con `ModuleGuard`, no un `SubNav` horizontal ni el render del mock.
2. El chip **"Datos de demostración"** del Dashboard es artefacto del mock — no implica un "modo demo" real; se descarta salvo pedido explícito.
3. Las 7 pantallas son **desktop-only (1440px)**. Sigue vigente la regla de CLAUDE.md sobre sidebar colapsado; el responsive lo resuelve el agente de frontend.
4. El botón destructivo **"× Marcar vendida/muerta"** — usar la variante destructiva de `button.tsx`, sin estilo nuevo.

---

## 8. Plan de ejecución — sesiones de trabajo por agente

Este plan lo ejecuta el equipo global de agentes (CPO, CTO, backend, frontend, integraciones, QA), no una persona con calendario. Por eso la estructura no es temporal — **es un grafo de dependencias entre sesiones**, donde cada sesión es la unidad de trabajo que un agente puede tomar de principio a fin. Una sesión especifica: qué agente la ejecuta, qué insumos necesita (y de qué sesión salen), qué entrega, y a qué otras sesiones desbloquea. Dos sesiones sin dependencia entre sí pueden correr **en paralelo**, en la misma ventana o en agentes distintos.

La única referencia temporal real en todo el plan es un evento externo fijo — la visita de Santiago a la finca (6–21 de agosto) — que no es una fecha de cronograma interno sino un **checkpoint del mundo real**: la ventana en la que Fernando y Martha están presencialmente disponibles para entrenamiento y calibración en vivo. Las sesiones se ordenan para que el trabajo que *necesita* ese checkpoint (calibrar alertas con Fernando, capturar el primer chequeo en vivo si coincide la fecha) llegue con todo lo demás ya resuelto — no para llenar semanas.

**S0 — CPO + CTO: Diseño (completada)**
Este documento. Entrega: alcance, épicas priorizadas, modelo de datos, arquitectura de integraciones, motor de alertas, estrategia de importación, arquitectura de frontend, riesgos.

**S1 — CTO/Backend: Esquema y RLS (completada — aplicada a producción 2026-07-22)**
- Objetivo: migraciones **050** `create_hato_core` (incluye `raza`, `padre_toro_id`), **051** `create_hato_leche` (incluye `hato_produccion_quincenal`), **052** `create_hato_tratamientos`, **053** `create_hato_alertas`, **054** `create_hato_toros_pajillas` (Épica G), **055** `create_hato_config` (Épica H, con defaults precargados de razas/secado/umbrales), **056** `fin_transacciones_ganado_hato_link`, **057** `hato_alertas_cron` + vista `v_hato_estado_actual`. **Arranca en 050 — 049 la tomó el sidebar reorg.** Actualizar `docs/supabase_tablas.md` y CLAUDE.md.
- Insumos: §7.1–7.2 de este plan.
- Entregable: esquema aplicado (un solo PR, para evitar la colisión de numeración que ya ocurrió antes en el repo) + RLS verificada. `hato_config` con defaults hace que el motor de fechas funcione sin UI de Ajustes.
- Depende de: nada — sesión de arranque.
- Desbloquea: S3, S4, S6, S9, S10.
- **Cierre (2026-07-22)**: las 8 migraciones (renumeradas 053–060, ver nota al inicio del documento) se aplicaron a producción. Verificado en la base viva: 15 tablas con RLS habilitada + 32 políticas, 2 vistas con `security_invoker=true`, 9 defaults en `hato_config` y 5 filas en `hato_alertas_config`, el FK `hato_eventos.alerta_id` back-patcheado, la guarda `es_hato` presente en `fn_crear_movimiento_pendiente_ganado()` (cuyo cuerpo previo se confirmó byte-idéntico al de 044 antes de reemplazarlo), las columnas `es_hato`/`hato_animal_id` en `fin_transacciones_ganado` con sus 8 políticas (4 de 023 + 4 nuevas de Administrador), y el cron `hato-alertas-tick` activo en `45 10 * * *`. Los advisors de seguridad de Supabase no reportan ningún hallazgo nuevo sobre `hato_*`.
- **Pendiente fuera de banda (no bloquea S2)**: aprovisionar el secreto de Vault `hato_alertas_tick_secret` y su gemelo `HATO_ALERTAS_TICK_SECRET` en los secretos de la edge function. Hasta que S6 despliegue `/hato/alertas/tick`, el cron devuelve un 404 diario benigno.

**S2 — Backend: Motor de lógica pura (`calculosHato.ts`)**
- Objetivo: parsers de planilla (fechas multi-valor, `#VALUE!`), descomposición SX→eventos (incl. servicios múltiples/fallidos, V7), motor de fechas (SECAR **dependiente de raza leída de `hato_config`**, V6; PP), derivación de estado, cálculo de PL/proyecciones y productividad (V4).
- Insumos: §6 (criterios de aceptación por épica), §7.1 (tabla de descomposición SX, `hato_config`), los 5 archivos Excel como fixtures de test.
- Entregable: `src/utils/calculosHato.ts` + `calculosHato.test.ts`, copia en `src/supabase/functions/server/` + `calculosHatoParidad.test.ts`. Los parámetros (secado por raza, umbrales) se inyectan desde `hato_config`, nunca constantes — los tests cubren varias razas.
- Depende de: nada — sin dependencia real de esquema, corre en paralelo a S1.
- Desbloquea: S3, S4, S6, S7.

**S3 — Backend/Data: Pipeline de importación + endpoint de subida de chequeo (B0/V10)**
- Objetivo: `scripts/import-hato/` (extract → normalize → resolve → load → verify), que además **siembra `hato_toros`** desde los toros históricos e infiere `raza` donde el dato lo permita. Expone la etapa Extract→Normalize como **endpoint de subida de Excel por chequeo** (B0) que reusa el mismo parser de S2 y devuelve un diff para aprobar.
- Insumos: esquema de S1, parsers de S2, los 5 archivos Excel.
- Entregable: `animales.csv` + `resolution-report.md` + carga a producción + endpoint de subida recurrente.
- Depende de: S1, S2.
- **Checkpoint humano obligatorio** (no delegable a ningún agente): revisión de `resolution-report.md` con Martha antes de cargar a producción — el único gate de este plan que exige su tiempo, y el de mayor riesgo de cronograma real porque depende de su disponibilidad, no de capacidad de agentes. Agendarlo es la acción de mayor prioridad fuera de las sesiones mismas.
- Desbloquea: S4 (necesita datos reales para probarse contra el hato verdadero + el endpoint de subida), S6 (las alertas no se encienden sobre datos sin validar), S7, S9.

**S4 — Frontend: Núcleo del módulo**
- Objetivo: reemplazar los `ComingSoon` de producción por las vistas reales bajo `/hato-lechero`: `HatoDashboard` (Tablero), `AnimalesList` (Hato) + `HojaDeVida` (timeline con todos los servicios V7 + genealogía madre+padre V8 + `GenealogiaArbol`/`EventoTimeline`), `ChequeosList` + **`SubirChequeoExcel` (B0/V10, el flujo recomendado)** y `ChequeoCapturaGrid` (manual). Sigue el sistema de diseño del mock (§7.6), sin editar globales.
- Insumos: esquema de S1, motor de S2 (preview de normalización), datos + endpoint de subida de S3.
- Entregable: módulo navegable end-to-end para fichas + captura de chequeo (subida de Excel + grilla).
- Depende de: S1, S2. Puede empezar contra fixtures antes de que S3 cierre, pero su validación final (y B0) requiere S3.
- Desbloquea: nada aguas abajo (es hoja del grafo).

**S5 — Frontend/Integraciones: Producción (V2/V3/V4)**
- Objetivo: `ProduccionView` (pesaje semanal por vaca + producción **quincenal** + KPI de productividad litros/vaca) + conversaciones Telegram `pesajeLeche` + `produccionQuincenal` (reemplaza el `litrosCamion` diario) + alta de Fernando en `telegram_usuarios`.
- Insumos: esquema de S1 (`hato_pesajes_leche`, `hato_produccion_quincenal`).
- Depende de: S1.
- Desbloquea: S6 — no por los datos de producción en sí, sino porque S5 deja lista la plomería de bot y el onboarding de Fernando que el motor de alertas reutiliza para poder escribirle.

**S6 — Backend/Integraciones: Motor de alertas** *(capacidad estrella — máxima prioridad de secuenciación)*
- Objetivo: tick endpoint (generar/despachar/escalar), helper de envío saliente + log a `telegram_mensajes`, callbacks con efectos de dominio, `AlertasView` (con revisión semanal de Martha, V11), cron 057.
- Insumos: esquema S1, motor S2, datos **validados** de S3 (checkpoint humano cumplido), onboarding de Fernando de S5.
- Depende de: S1, S2, S3 (con su checkpoint humano cerrado), S5.
- **Dos checkpoints de confianza en cascada, no fechas** — cada uno gatea al siguiente por evidencia, no por calendario:
  1. *Modo sombra*: el tick corre en real pero notifica solo a Martha/Santiago; cada alerta generada se contrasta contra la realidad del hato antes de avanzar.
  2. *Habilitación a Fernando*: solo se activan para él los tipos de alerta (`secado_due`, `tratamiento_paso`) cuyos datos quedaron con confianza alta tras S3; el resto (`servicio_sin_confirmacion`, `parto_proximo`) se calibra en persona durante la visita a la finca, con Santiago presente para ajustar redacción y horarios con Fernando en vivo.
- Desbloquea: nada aguas abajo.

**S7 — Backend: Herramientas Esco**
- Objetivo: `get_hato_animal`, `get_hato_reproduccion`, `get_hato_produccion` + `hato-aggregation.ts`.
- Depende de: S1, S2, S3 (necesita datos reales para responder preguntas útiles).
- Prioridad de secuenciación baja: no bloquea el checkpoint de la visita a la finca, puede correr en cualquier ventana ociosa una vez S3 cierra.

**S8 — Frontend: Foto-OCR** *(no ejecutable todavía)*
- Depende de: S4 (la grilla debe existir para recibir el prefill) **y** de un insumo que hoy no existe — fotos reales de la planilla, que solo se recolectan durante la visita a la finca. Esta sesión queda fuera del grafo ejecutable hasta que ese insumo aparezca; no se agenda, se espera.

**S9 — Backend: Flujo venta/muerte ↔ `TransaccionGanadoForm`**
- Objetivo: marcar `vendida`/`muerta` en la ficha abre el formulario existente pre-llenado, vínculo `es_hato`/`hato_animal_id`.
- Depende de: S1, S3.
- Prioridad de secuenciación baja: las ventas son infrecuentes, no bloquea nada.

**S10 — Backend/Frontend: Pajillas + catálogo de toros + Ajustes del Hato (Épicas G y H)**
- Objetivo: `PajillasView` como **6º ítem del sidebar** (`/hato-lechero/pajillas`, requiere sumar la entrada en `Layout.tsx`) sobre `hato_toros`/`hato_pajillas`/`hato_pajillas_uso` + `v_hato_pajillas_stock`; catálogo de toros editable (G4/V12); y **`AjustesHato` como tab en Configuración global** (Épica H — editar razas, secado por raza, umbrales sobre `hato_config`, gateado a Gerencia).
- Insumos: esquema de S1 (tablas ya creadas ahí, incl. `hato_config` con defaults).
- Entregable: pajillas/toros navegables + panel de Ajustes funcional, independientes del resto del módulo.
- Depende de: S1 únicamente — no depende de S3 (catálogos propios; el motor ya funciona con los defaults de `hato_config`).
- Prioridad de secuenciación baja: funcionalidad secundaria, no bloquea el checkpoint de la visita; puede correr en cualquier ventana ociosa tras S1.

**Homologación de gastos e ingresos** ([registro archivado](./archive/implementation/plan_hato_lechero_gastos_backfill.md)) — fuera de este grafo por diseño: no consume ni produce insumos de ninguna sesión de arriba. **Ya ejecutada para ene–jun 2026**. Un eventual período adicional debe abrirse como una nueva tarea.

### Grafo de paralelismo

```
S1 ─┬─ S3 ─┬─ S4
S2 ─┘      ├─ S6 ← S5 ← S1
           ├─ S7
           └─ S9
S1 ─── S10 (directo, no pasa por S3 — catálogos propios + Ajustes; el motor usa los defaults de hato_config)
S8: bloqueada hasta visita a la finca (insumo externo)
Homologación gastos/ingresos: sin conexión al grafo, ejecutada para ene–jun 2026
```

S1 y S2 son las únicas sesiones sin dependencias — arrancan primero y en paralelo. Todo lo demás (salvo la homologación de gastos, que vive fuera del grafo) pasa por S3 y su checkpoint humano; **por eso agendar ese checkpoint con Martha es la acción crítica, no una fecha de sprint.**

**Regla de priorización si hay que recortar sesiones**: caen primero S5 (el pesaje puede seguir en papel mientras tanto) y S7/S8/S9/S10; **nunca** caen S1–S4 ni el "modo sombra" de S6 — fichas, chequeo, importación validada y las primeras alertas de secado/tratamiento son el núcleo no negociable.

**Definición de éxito antes del checkpoint de la visita a la finca:** (1) hato completo en el sistema, con al menos un chequeo real capturado en la app (vía subida de Excel B0 o grilla, S4); (2) Fernando respondiendo alertas reales de secado/tratamiento en modo habilitado, no sombra (S6); (3) la producción quincenal registrándose (S5); (4) al menos un pesaje semanal capturado (S5); (5) Martha sin necesidad de volver a abrir el Excel de chequeos para nada nuevo (o subiéndolo directo al sistema, B0).

**Transversal a todas las sesiones de backend/integraciones:** cada cambio de edge function se despliega con `npx supabase functions deploy make-server-1ccce916` y se sincroniza en ambas copias del código fuente; toda la lógica de negocio va en módulos puros con Vitest (los fixtures de planillas reales son los tests de mayor ROI: multi-fechas, `#VALUE!`, cada variante de SX).

### Sesiones futuras (habilitadas después del checkpoint de la visita)

Depende de que el checkpoint externo (visita a la finca) haya ocurrido y de que las sesiones S1–S7 estén cerradas:
- A3, A5, A7 (reemplazo), B5 (planilla pre-llenada), C5–C7, D5–D7, E3–E5, F2 (histórico completo de chequeos), Épica H completa (S10), S8 (Foto-OCR, una vez existan fotos reales), S9 si no se hizo antes.
- Más adelante: A6 (consanguinidad), E6 (reporte semanal), convergencia eventual con el módulo Ganado.
- **V13–V15 (diferidos en la validación 2026-07-21)**: gestión de potreros/pastos + inversión en pastos (montar primero el sistema actual; Daniel tiene registro por potrero de referencia); definición precisa de "días abiertos"; correcciones de copy del mock (ej. "ahorro"). No están en el alcance de esta versión.

---

## 9. Riesgos

| Riesgo | Prob. | Impacto | Mitigación |
|---|---|---|---|
| **Alertas con datos malos queman la confianza de Fernando** (agravado por D4: encendido antes de la visita) | Alta | Crítico | Encendido escalonado por checkpoints de confianza, no por fecha (sombra → tipos validados → resto calibrado en visita); el checkpoint humano de S3 es prerequisito duro de S6; botón "esto está mal" en toda alerta |
| El checkpoint humano de S3 (revisión con Martha) se atrasa → S6 no puede avanzar de modo sombra a habilitación real antes de la visita | Media | Alto | Agendarlo cuanto antes — es la acción crítica del plan; las etapas de extracción/normalización de S3 (que no requieren a Martha) arrancan de inmediato contra los 5 archivos para que las sorpresas salgan temprano, sin esperar su agenda |
| Doble carga transitoria (Excel + app) mata la adopción | Media | Alto | **V10 lo convierte de riesgo en estrategia**: Martha sigue con su Excel y lo *sube* al sistema (empalme gradual); no hay doble digitación. El corte a captura nativa (grilla) es opcional y posterior |
| Fatiga/rechazo del bot (mensajes a deshora, percepción de vigilancia) | Media | Alto | Agregación 1 mensaje/franja; horarios acordados con Fernando en persona; tono de ayuda, no de auditoría; el precedente de David juega a favor |
| Calidad del histórico peor que la muestra | Alta | Medio | Regla "ambiguo → revisión, nunca importación silenciosa"; F2 es P1 y no bloquea el MVP; KPIs reproductivos apagados hasta validar |
| Conectividad intermitente en el ordeño | Media | Alto | Confirmaciones que no expiran (respondibles horas después); verificar en visita |
| Punto único: Martha | Media | Medio | Entrenar a Fernando (bot) y papá (lectura); Esco como interfaz de consulta sin curva de aprendizaje |
| Cadencia bimestral: si el lazo falla, el sistema queda 2 meses desactualizado | Media | Medio | C4 (escalamiento de vencidos) es P0; el tablero marca la fecha del último dato por vaca |

---

## 10. Preguntas abiertas restantes

**Resueltas en la validación (2026-07-21):**
- ~~¿Diario o quincenal para el camión?~~ → **quincenal** (V3), ciclo del Pomar.
- ~~¿Regla de secado fija?~~ → **dependiente de raza, editable en Ajustes del Hato** (V6): Jersey/Holstein 2 meses antes del parto, Normanda 3.
- ~~¿Grilla o subir Excel para el chequeo?~~ → **subir Excel es el flujo recomendado** (V10); grilla como alternativa manual.

**Para Martha (agendar en el checkpoint humano de la sesión de importación, S3):**
1. ¿Quién pesa la leche semanal y cómo nace el dato (papel en el ordeño → quién transcribe)? Define la forma final de D1.
2. Semántica exacta de "OK" (¿vacía apta esperando celo?) y cómo distingue una vacía-problema de una vacía normal post-parto → afina la máquina de estados y el KPI de días abiertos (V14 diferido — confirmar definición de "días abiertos").
3. Catálogo de toros/razas: ¿cuántos toros propios, qué pajillas y con qué inventario inicial se siembran `hato_toros`/`hato_pajillas` (Épica G)? ¿Qué vacas son Normanda (secado a 3 meses, V6)? → alimenta G4, la `raza` de `hato_animales` y `hato_config`.
4. ¿Fecha del próximo chequeo veterinario? (si cae en la visita, el primer chequeo en la app se captura en vivo — mejor sesión de entrenamiento posible).
5. Adjudicación del `resolution-report.md` (identidades con confianza media/baja del histórico).

**Decisiones por defecto ya tomadas en este plan (objetar si algo no cuadra):**
- Machos vendidos (OV) sin ficha propia — solo eventos (confirmado en D3).
- RLS de `fin_transacciones_ganado` se extiende a Administrador (migración 056).
- Rechequeo a nivel hato por "60 días desde el último chequeo" (no fecha planificada).
- Conteos del hato jamás se copian a `gan_inventario`.
- Migraciones del hato en 050+ (049 la tomó el sidebar reorg); rutas bajo `/hato-lechero`; módulo gateado por `ModuleGuard hato_lechero` (producción).
- La homologación de gastos/ingresos (P&G/nómina/leche) fue una tarea paralela **ya ejecutada para ene–jun 2026**; ver el [registro archivado](./archive/implementation/plan_hato_lechero_gastos_backfill.md).

**Pendientes externos (no bloquean el diseño):**
- Martha envía el archivo de flujo de leche y los chequeos que falten.
- Avisar a Consuelito que los datos de vacas están al día hasta julio.
