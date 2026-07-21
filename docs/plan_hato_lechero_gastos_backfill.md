# Homologación de Gastos e Ingresos — Negocio Hato Lechero (tarea paralela)

**Fecha:** 2026-07-17 · **Estado: Gastos e ingresos ejecutados para ene–jun 2026 — ver §13 y §14.** · **Relación con el módulo de diseño:** independiente. No bloquea ni es bloqueada por `docs/plan_hato_lechero_module.md`, ni consume ninguna de sus sesiones (§9 de ese documento). No requiere migraciones ni cambios de esquema — usa el modelo `fin_*` que ya existe.

> Este documento nació enfocado solo en gastos (§1–§12); tras ejecutar esa parte (§13), se amplió al mismo tratamiento para ingresos (§14), que originalmente estaba planteado como extensión futura opcional (antiguo §12, ahora ejecutado).

---

## 1. Por qué es una tarea separada

El plan de diseño del módulo Hato Lechero (fichas, chequeo, alertas, ordeño) es un **ejercicio de producto y arquitectura nueva**. Esto no lo es: es una **limpieza de datos** sobre una estructura financiera que ya funciona (`fin_gastos`, `fin_negocios`, `fin_categorias_gastos`, `fin_conceptos_gastos`). Mezclarlas en un solo plan diluye ambas. Se separan para que:

- El diseño del módulo animal/reproductivo pueda avanzar sin esperar la limpieza financiera.
- La homologación de gastos pueda hacerse en cualquier momento (incluso antes) por ser mecánica y acotada.
- El scope de "no rehacer Finanzas" del plan principal quede inequívoco: **este documento es la única pieza de trabajo financiero relacionada con el hato lechero**, y vive fuera del módulo nuevo.

## 2. Motivación (de la entrevista con Martha)

> "yo le puedo pedir al aparato éste que me ayude a completar la información automáticamente" — sobre el archivo GASTOS FOV con nómina de abril, mayo y junio 2026 faltante porque el Excel se saturó.

> "Ese yo se lo doy a este man y le digo: mira, acá hay unos nuevos ingresos que no tenemos y unos gastos que sí y otros que no. Ayúdeme a identificar cuáles sí, cuáles no, y créemelos en los datos."

> "Salario es marzo, pero no veo los salarios de abril ni de mayo ni de junio... Ella no debe haber alimentado mayo ni junio."

Lectura importante de la entrevista: el hueco **no está en el Excel de Martha** (ella lo mantiene con juicio) — está en lo que Consuelito alcanzó a transcribir a la app antes de que el archivo se saturara. Es decir, el Excel es más completo que Supabase para este período, exactamente el escenario que esta tarea resuelve: usar el Excel como fuente para rellenar lo que la app no tiene, sin tocar lo que ya está bien cargado.

## 3. Alcance

**Incluye:**
- Únicamente registros del negocio **Hato Lechero** (`fin_negocios.nombre = 'Hato Lechero'`).
- Únicamente la sección **SUBACHOQUE** del archivo P&G (`GASTOS_FOV_ENERO_2026_1.xlsx`, hoja `P Y G JUNIO FOVEMSA 2026`) — es la sección que corresponde a la operación del hato. Las secciones VILLETA y BOGOTA CASA **no son del hato lechero** y se excluyen explícitamente (ya excluidas en el plan de diseño principal).
- Ventana temporal: enero–junio 2026 (las columnas jul–dic del archivo están vacías; el nombre del archivo y el título de la hoja — "ENERO 2026" vs. "JUNIO FOVEMSA 2026" — indican que es la misma plantilla venida actualizándose mes a mes hasta junio).
- Gastos únicamente (`fin_gastos`). Ingresos (`fin_ingresos`) quedan fuera de esta tarea por instrucción explícita, aunque el archivo también los contiene arriba de la sección de gastos y el método aplicaría igual — se anota como extensión futura opcional (§10).

**No incluye:**
- Cambios de esquema, migraciones, o nuevas tablas.
- Corrección retroactiva de gastos ya cargados con errores (solo se identifican duplicados/faltantes; corregir un monto mal digitado por Consuelito es un problema distinto, fuera de esta tarea).
- Ingresos.
- Gastos de Villeta / Bogotá casa.
- Años anteriores a 2026 (ver §8 — solo si Martha entrega los archivos correspondientes).

## 4. Datos de origen (evidencia concreta)

La sección `SUBACHOQUE` del archivo (filas 12–46 de la hoja) es una matriz **categoría × concepto × mes**, un valor mensual agregado por fila — no transacciones individuales. Muestra representativa de lo ya inspeccionado:

| Categoría (Excel) | Concepto (texto libre) | Meses con valor | Patrón |
|---|---|---|---|
| Salarios | `NOMiNA SUBACHOQUE $1.825...` | Ene–Jun, **$3.380.000 los 6 meses** | Recurrente fijo — **candidato de mayor confianza para el hueco abr–jun que reportó Martha** |
| Combustible | `ACPM` | Ene–Jun, montos variables (250k–600k) | Recurrente variable |
| Combustible | `gasolina ordeño` | Ene–Jun, montos variables (300k–560k) | Recurrente variable |
| Administración | `Fondo` | Ene–Jun, montos variables (450k–660k) | Recurrente variable |
| Herramientas | `COLAGRA equipo ordeño/se...` | Solo abril, $894.501 | Puntual |
| Cesantías e Intereses | `cesantias intere/liquida...` | Solo junio, $1.690.000 | Puntual |
| Bonificaciones | `primas trabajadores` | Solo junio, $1.690.000 | Puntual |
| Vacaciones | `vacaciones fer, dina` | Solo enero, $540.000 | Puntual |
| Heno-Pasto-Silo | `jornal silo/ordeño` | Abril ($90.000), mayo ($150.000) | Puntual, dos meses |

Categorías completas presentes en la sección SUBACHOQUE (insumo para §6): Compra Maquinaria, Remedios-Vacunas-Purga, Cercas-Alambres-Postes, Abonos y Fertilizantes, Dotaciones, Herramientas, Químicos, Oficina Central, Inseminación y Servicios, Salarios, Combustible, Árboles, Cesantías e Intereses, Asistencia Técnica, Administración, Heno-Pasto-Silo, Peajes, Bonificaciones, Transporte-Ganado, Vacaciones.

**Consecuencia de diseño**: las filas recurrentes (Salarios, Combustible, Administración) son las de mayor confianza para detección de huecos — un patrón mensual roto es más fácil de interpretar que una fila puntual. Las filas puntuales de un solo mes tienen más riesgo de caer en "ambiguo" (§7.3) porque el texto del concepto es más variable y hay menos contexto para el match automático.

## 5. Regla de oro: no duplicar

Un gasto del Excel se considera **ya registrado** en `fin_gastos` si existe una fila (o suma de filas) con:

- `negocio_id` = Hato Lechero, **y**
- `concepto` equivalente (ver mapeo, §6), **y**
- `fecha` dentro del mismo mes/período que la celda del Excel, **y**
- `valor` igual — o la **suma** de varias filas de `fin_gastos` en ese concepto+mes iguala el valor de la celda (el Excel es una cifra mensual agregada; la app puede tener varias transacciones que suman lo mismo, p. ej. dos pagos parciales de nómina).

Solo lo que **no** encuentra coincidencia bajo esa regla se propone para inserción. Ante cualquier ambigüedad (coincidencia parcial, monto distinto, concepto dudoso), **no se inserta automáticamente** — se agrega al reporte de revisión para que Santiago/Martha decidan.

## 6. Mapeo de conceptos y categorías

> **Corrección tras la ejecución (§13)**: el catálogo real de `fin_categorias_gastos` **no** está organizado por sección del Excel — es un catálogo único, compartido entre todos los negocios de la finca (Aguacate, Ganado, Caballos, Hato Lechero, etc.), con categorías temáticas amplias (`Mano de Obra y Asistencia Técnica`, `Equipos y Herramientas`, `Alimentos y Fertilizantes`, `Control de Plagas`, `Gastos Generales`, …) que no coinciden 1:1 con las categorías de columna del Excel de Martha (`Salarios`, `Combustible`, `Administracion`, …). El mapeo correcto sale de leer el catálogo real (paso 1 abajo) y de mirar cómo Consuelito ya viene categorizando gastos equivalentes del mismo negocio en los meses que sí están bien cargados — no de asumir una correspondencia por nombre. El detalle completo del mapeo usado está en §13.2.

El Excel usa texto libre inconsistente (`"NOMiNA SUBACHOQUE $1.825..."`, `"MARE Hapadex/secamil (12...)"`, mezclando a veces nombre de proveedor y concepto en la misma celda — p. ej. `"AGROCAMPO"`, `"El Establo Villeta"` parecen proveedores, no conceptos); la app tiene un catálogo estructurado (`fin_categorias_gastos` → `fin_conceptos_gastos`). El mapeo se construye así, en este orden:

1. **Leer el catálogo real primero** — antes de proponer nada, la sesión de ejecución consulta `fin_categorias_gastos` y `fin_conceptos_gastos` tal como existen hoy en producción (este documento no asume su contenido porque no hay una lectura en vivo disponible al escribirlo).
2. **Match exacto/fuzzy** de cada categoría del Excel (lista de §4) contra `fin_categorias_gastos.nombre`; de cada concepto del Excel contra `fin_conceptos_gastos.nombre` dentro de la categoría ya resuelta.
3. **Proponer creación** solo para lo que no tiene equivalente — nunca forzar un concepto del Excel dentro de una categoría que no le corresponde.
4. **Separar proveedor de concepto donde sea evidente** (ej. `"AGROCAMPO"`, `"Silveragro Nit 8300067..."` tienen NIT o formato de razón social) — se resuelven contra `fin_proveedores` como campo opcional (`fin_gastos.proveedor_id` es nullable); donde no sea evidente, el texto completo queda como `nombre` del gasto y no se fuerza una separación.
5. El mapeo final (categoría Excel → `categoria_id`, concepto Excel → `concepto_id`, alias de proveedor → `proveedor_id`) queda en un **archivo de configuración versionado** (`scripts/reconcile-hato-gastos/mapping.json`), no hardcodeado en el script — auditable y reutilizable si Martha entrega archivos de años anteriores (§8).

## 7. Proceso técnico

### 7.1 Extraer ambos lados

- **Excel**: parsear la hoja `P Y G JUNIO FOVEMSA 2026`, sección `SUBACHOQUE` (entre el encabezado "SUBACHOQUE" y el "SUBTOTAL" siguiente a "VILLETA"). Cada fila → (categoría, concepto_texto, {mes: valor}), aplanada a una lista de (categoría, concepto_texto, mes, valor) — un registro por celda no vacía.
- **Supabase**: `SELECT fecha, nombre AS concepto, valor, categoria_id, concepto_id, estado FROM fin_gastos WHERE negocio_id = (SELECT id FROM fin_negocios WHERE nombre = 'Hato Lechero') AND fecha BETWEEN '2026-01-01' AND '2026-06-30'`.

### 7.2 Normalizar y mapear

Aplicar el mapeo de §6 a cada fila del Excel. Lo que no resuelve a un `concepto_id`/`categoria_id` existente ni tiene una propuesta de creación clara queda marcado `sin_mapear` y va directo a la lista de ambiguos (nunca se inventa una categoría).

### 7.3 Emparejar y clasificar

Para cada (categoría, concepto_texto, mes, valor) ya mapeado:

- **Coincide** (regla de §5) → no se toca. Se cuenta para el reporte.
- **No coincide, pero el mes/concepto tiene *algo* registrado con valor distinto** → **ambiguo**, va a revisión (puede ser un gasto parcial, un error de digitación, o dos gastos reales distintos).
- **No coincide y el mes/concepto no tiene nada registrado** → **faltante**, candidato a inserción. La nómina de Subachoque abr–jun 2026 (§4) debería caer aquí, confirmando el hueco ya conocido por la entrevista.
- **`sin_mapear`** (de §7.2) → ambiguo, con nota de que el bloqueo es de catálogo, no de coincidencia.

### 7.4 Resolver catálogos auxiliares obligatorios

`fin_gastos` exige `region_id` y `medio_pago_id NOT NULL`, que el Excel no provee directamente:

- **`region_id`**: `fin_regiones` es un catálogo propio de Finanzas, **sin relación** con `gan_ubicaciones`/`gan_fincas` del módulo Ganado — son esquemas independientes aunque ambos usen el nombre "Subachoque". Se busca/crea una región `fin_regiones` llamada "Subachoque" si no existe ya (es probable que ya exista, dado que Consuelito viene cargando gastos de este negocio).
- **`medio_pago_id`**: el Excel no distingue medio de pago. Se usa el `fin_medios_pago` existente más razonable (ej. "Transferencia" o el que ya predomine en los gastos de Hato Lechero ya cargados) — nunca se inventa un medio de pago nuevo solo para esta carga; si el catálogo no tiene una opción clara, la fila cae a ambiguo en vez de forzar un valor.

### 7.5 Insertar solo lo confirmado

Los "faltantes" aprobados (§9, checkpoint humano) se insertan en `fin_gastos` con: `negocio_id` = Hato Lechero, `region_id`/`medio_pago_id` resueltos en §7.4, `categoria_id`/`concepto_id` del mapeo (§6), `nombre` = texto original del Excel (trazabilidad), `valor` = el de la celda, `fecha` = primer día del mes correspondiente (el Excel es mensual, no tiene día — limitación documentada explícitamente en `observaciones`), `estado = 'Confirmado'` (coherente con que el dashboard de Finanzas solo cuenta confirmados), `observaciones` = `"Importado de GASTOS_FOV_ENERO_2026, sección SUBACHOQUE, homologación jul-2026"`.

**Idempotencia**: la inserción vuelve a correr la regla de §5 justo antes de escribir (no solo en el dry-run) — si algo cambió entre el reporte y la aprobación (p. ej. Consuelito cargó el dato mientras tanto), la fila se salta en vez de duplicar.

## 8. Sesiones de ejecución

Misma lógica que el plan del módulo (`docs/plan_hato_lechero_module.md`, §8): sesiones de agente con insumos/entregables explícitos, no fechas. Esta tarea es más corta — dos sesiones y un checkpoint humano, sin dependencia de las sesiones del módulo.

**Sesión A — Backend/Data: extracción y reporte (dry-run)**
- Objetivo: ejecutar §7.1–7.4 completos, producir el reporte de homologación (§9) sin escribir nada en `fin_gastos`.
- Insumos: `GASTOS_FOV_ENERO_2026_1.xlsx`, acceso de lectura a Supabase (catálogos `fin_*` + `fin_gastos` del negocio Hato Lechero).
- Entregable: `mapping.json` (propuesta de mapeo) + reporte de coincidencias/faltantes/ambiguos.
- Depende de: nada — puede tomarse en cualquier momento.

**Checkpoint humano — Santiago/Martha revisan el reporte**
- No delegable a ningún agente: aprobar cada fila "faltante" antes de insertarla, y resolver cada fila "ambigua" (¿es un gasto real no registrado, un duplicado con texto distinto, o un error del Excel?). Decide también las creaciones de catálogo propuestas en §6 (nuevos conceptos/categorías) y la resolución de `medio_pago_id`/`proveedor_id` donde §7.4 no encontró un valor claro.

**Sesión B — Backend/Data: carga aprobada**
- Objetivo: insertar únicamente lo aprobado en el checkpoint, con la revalidación de idempotencia de §7.5.
- Insumos: reporte aprobado de la Sesión A + decisiones del checkpoint humano.
- Entregable: filas insertadas en `fin_gastos` + registro de qué se insertó (para auditoría) + confirmación de que las cifras de negocio "Hato Lechero" en el dashboard de Finanzas reflejan el backfill.
- Depende de: Sesión A + checkpoint humano cerrado.

## 9. Entregable: reporte de homologación

Documento/CSV con tres secciones:

1. **Coincidencias** — cuántos $ y cuántas filas del Excel ya estaban en Supabase (confirma qué tan al día está la carga de Consuelito).
2. **Faltantes a insertar** — lista detallada (categoría, concepto, mes, valor, mapeo propuesto) lista para aprobación.
3. **Ambiguos** — casos que requieren ojo humano, con la evidencia de ambos lados (fila Excel + filas Supabase candidatas, o motivo de `sin_mapear`) para que Santiago/Martha decidan.

## 10. Riesgos y casos límite

| Riesgo | Mitigación |
|---|---|
| Filas puntuales de un solo mes (§4) tienen texto de concepto muy variable → alto ratio de "ambiguo" | Aceptable — es preferible un reporte con más ambiguos que una inserción duplicada o mal categorizada; el checkpoint humano existe justo para esto |
| Confundir proveedor con concepto en el texto del Excel (ej. "AGROCAMPO") | §6 paso 4 separa solo lo evidente; el resto queda como texto completo en `nombre`, sin forzar un `proveedor_id` incorrecto |
| `medio_pago_id`/`region_id` inventados solo para que la carga pase | Explícitamente prohibido (§7.4) — si no hay un catálogo claro, la fila se marca ambigua en vez de forzar un valor |
| Reconciliación corre contra un estado de `fin_gastos` que cambia entre el reporte y la aprobación | Revalidación de idempotencia justo antes de insertar (§7.5) |
| El Excel mismo tiene errores (Martha lo transcribe a mano) | Fuera de alcance corregir errores del Excel — esta tarea solo detecta huecos de carga app vs. Excel, no valida la exactitud del Excel en sí |

## 11. Dependencias y pendientes

- Requiere acceso de ejecución a Supabase (service role) — mismo patrón que el pipeline de importación de chequeos (`scripts/import-hato/`), pero un script independiente y más simple (sin entidades nuevas, sin resolución de identidad compleja).
- Si Martha entrega archivos GASTOS FOV de años anteriores a 2026 (mencionado como posible en la entrevista pero no confirmado), la misma Sesión A/B se puede correr por año adicional, reutilizando `mapping.json`.
- No depende de las migraciones `049`–`054` del módulo de diseño ni de ninguna tabla `hato_*`.

## 12. Extensión a ingresos — ejecutada (ver §14)

*(Esta sección describía originalmente la extensión a ingresos como opcional y futura. Se ejecutó el 17 de julio de 2026 — ver §14 para el detalle completo. El método fue el mismo: extraer → mapear → emparejar por concepto+fecha+monto → reporte de faltantes/ambiguos → checkpoint humano → carga, aplicado a `fin_ingresos` en vez de `fin_gastos`.)*

## 13. Resultado ejecutado — 17 de julio de 2026 (ene–jun 2026)

Sesión A y Sesión B (§8) se corrieron de punta a punta para la ventana ene–jun 2026. Registro de lo que realmente pasó, para que sirva de precedente si se corre para años anteriores (§11).

### 13.1 Sesión A — hallazgos del dry-run

Contra los 44 gastos de Hato Lechero ya cargados en ese rango, la sección SUBACHOQUE del Excel arrojó:

| | Filas | Monto |
|---|---|---|
| Coincidencias (ya cargado, no se tocó) | — | Ene–Mar razonablemente al día |
| Faltantes — alta confianza (concepto ya usado en meses previos para el mismo ítem) | 14 | $18.289.071 |
| Faltantes — ambiguos (sin match exacto de catálogo, requerían decisión humana) | 9 | $7.314.900 |
| Excluido del reporte (valor `2` en la celda de "Químicos/El Establo Villeta", enero — casi seguro un artefacto de digitación, no una cifra real) | 1 | — |

Hallazgo más relevante: **la nómina de Subachoque faltaba en enero, abril, mayo y junio** (no solo abr–jun como reportó Martha en la entrevista — enero también estaba sin cargar), y **el combustible (ACPM + gasolina) estaba en cero desde abril**, un hueco que la entrevista no había mencionado porque es menos visible que la nómina.

### 13.2 Checkpoint humano — decisiones de Santiago

| Ambiguo del reporte | Decisión | Resultado |
|---|---|---|
| `Administracion / Fondo`, 6 meses, $3.540.000 | "Son aportes al fondo de emergencias de Subachoque. Agregar." | Se insertó bajo `Gastos Generales → Administración Propiedades` (el concepto existente más cercano; el catálogo no tiene un concepto literal de "fondo de emergencias") |
| `Cesantías e Intereses` (junio, $1.690.000) + `Bonificaciones/primas trabajadores` (junio, $1.690.000) — dos filas separadas del Excel | "Son la misma prima extra salarial (prestaciones sociales) de los trabajadores. Unificar y agregar — valor total $1.690.000, no $3.380.000." | Se insertó **una sola fila** de $1.690.000 bajo `Mano de Obra y Asistencia Técnica → Primas` — la duplicación aparente en el Excel (misma cifra en dos filas) era la misma transacción anotada dos veces, no dos gastos reales |
| `Facturatech` (febrero, $394.900) | "Es el sistema contable de todo Fovemsa, no atribuible al negocio lechero. Excluir." | No se insertó — a pesar de que un gasto hermano de marzo (Fedepapa, mismo bloque "OFICINA CENTRAL" del Excel) sí resultó ser del hato, este no lo era; confirma que la categoría "OFICINA CENTRAL" del Excel de Martha no predice por sí sola si el gasto es o no del hato |
| Las 14 de alta confianza | "Se pueden agregar. Renombrar `NOMiNA SUBACHOQUE` → `Nomina Subachoque {{mes}}`." | Insertadas con el nombre ajustado |

### 13.3 Sesión B — carga

Antes de insertar se revalidó la idempotencia (§7.5): el conteo de gastos ya cargados subió de 43 a 44 filas entre la Sesión A y la Sesión B por actividad real y concurrente en la app — se re-verificó fila por fila que la nueva no chocaba con ningún candidato antes de escribir.

**21 filas insertadas**, `estado='Confirmado'`, `region='Subachoque'`, `medio_pago='N/A'` (el Excel no especifica cuenta por línea; se usó la opción ya existente para casos sin dato, en vez de inventar una cuenta — pendiente que Santiago/Martha reasignen medio de pago real donde lo sepan), `observaciones='Importado de GASTOS_FOV_ENERO_2026, sección SUBACHOQUE, homologación jul-2026'` en las 21:

| Fecha | Categoría → Concepto | Nombre | Valor |
|---|---|---|---|
| Ene | Mano de Obra → Salarios | Nomina Subachoque Enero | $3.380.000 |
| Abr | Mano de Obra → Salarios | Nomina Subachoque Abril | $3.380.000 |
| May | Mano de Obra → Salarios | Nomina Subachoque Mayo | $3.380.000 |
| Jun | Mano de Obra → Salarios | Nomina Subachoque Junio | $3.380.000 |
| Abr | Equipos y Herramientas → Combustible | ACPM Abril/26 | $500.000 |
| Abr | Equipos y Herramientas → Combustible | Gasolina ordeño Abril/26 | $560.000 |
| May | Equipos y Herramientas → Combustible | ACPM Mayo/26 | $600.000 |
| May | Equipos y Herramientas → Combustible | Gasolina ordeño Mayo/26 | $560.000 |
| Jun | Equipos y Herramientas → Combustible | ACPM Junio/26 | $530.000 |
| Jun | Equipos y Herramientas → Combustible | Gasolina ordeño Junio/26 | $560.000 |
| Abr | Alimentos y Fertilizantes → Heno-Pasto-Silo | Jornal silo/ordeño Abril/26 | $90.000 |
| May | Alimentos y Fertilizantes → Heno-Pasto-Silo | Jornal silo/ordeño Mayo/26 | $150.000 |
| Abr | Equipos y Herramientas → Herramientas | COLAGRA equipo ordeño/sellador/vacumetro mtto pezoneras | $894.501 |
| May | Control de Plagas → Remedios-Vacunas-Purgas | MARE Hapadex/secamil Mayo/26 | $324.570 |
| Ene | Gastos Generales → Administración Propiedades | Aporte fondo de emergencias Subachoque - Enero/26 | $450.000 |
| Feb | Gastos Generales → Administración Propiedades | Aporte fondo de emergencias Subachoque - Febrero/26 | $650.000 |
| Mar | Gastos Generales → Administración Propiedades | Aporte fondo de emergencias Subachoque - Marzo/26 | $630.000 |
| Abr | Gastos Generales → Administración Propiedades | Aporte fondo de emergencias Subachoque - Abril/26 | $520.000 |
| May | Gastos Generales → Administración Propiedades | Aporte fondo de emergencias Subachoque - Mayo/26 | $630.000 |
| Jun | Gastos Generales → Administración Propiedades | Aporte fondo de emergencias Subachoque - Junio/26 | $660.000 |
| Jun | Mano de Obra → Primas | Prima extra salarial trabajadores Subachoque - Junio/26 | $1.690.000 |

**Total insertado: $23.519.071** (Facturatech y la fila de valor `2` quedaron fuera, per §13.2).

### 13.4 Totales de Hato Lechero después del backfill

| Mes | Filas | Total |
|---|---|---|
| Enero | 11 | $16.219.956 |
| Febrero | 11 | $15.719.429 |
| Marzo | 12 | $19.374.273 |
| Abril | 14 | $17.063.092 |
| Mayo | 11 | $20.084.965 |
| Junio | 6 | $7.761.300 |
| **Total ene–jun 2026** | **65** | **$96.223.015** |

Junio sigue siendo el mes más delgado (6 filas) — no es un problema de homologación (no hay más nada que rescatar del Excel de Martha para junio), es un hueco de captura hacia adelante: junio probablemente todavía no está transcrito ni en el Excel ni en la app al día de este backfill.

### 13.5 Pendiente de esta ejecución

- Reasignar `medio_pago_id` real (hoy `N/A`) en las 21 filas donde Santiago/Martha conozcan la cuenta/efectivo real usado.
- Repetir Sesión A/B para años anteriores a 2026 si Martha entrega los archivos correspondientes (§11) — reutilizando el mapeo de categoría/concepto validado en §13.2 como punto de partida, no como verdad absoluta (cada año puede tener sus propias sorpresas de catálogo).
- La extensión a ingresos se ejecutó el mismo día — ver §14.

## 14. Resultado ejecutado — ingresos, 17 de julio de 2026 (ene–jun 2026)

Mismo tratamiento que §13 pero sobre `fin_ingresos`, con dos reglas explícitas de Santiago que no estaban en el diseño original del documento (§1–§12 solo cubrían gastos):

1. **Fecha**: último día calendario de cada mes (no el primer día como en gastos — el archivo de ingresos no tiene el mismo patrón mensual-agregado-sin-día que gastos, y así lo pidió Santiago).
2. **Leche**: usar el **valor neto** (fila "Ingreso Neto Leche ($) (-2,25%)" del Excel), no el bruto (fila "Ventas Leche ($)").

### 14.1 Punto de partida

`fin_ingresos` para Hato Lechero estaba en **cero para todo 2026** — sin ninguna fila cargada, confirmando textualmente lo que dijo Martha en la entrevista ("los ingresos acá aparecen en cero por lo que no hemos cargado"). A diferencia de gastos, no hubo que distinguir coincidencias de faltantes: **todo lo del Excel era faltante**.

El catálogo `fin_categorias_ingresos` de Hato Lechero (a diferencia de `fin_categorias_gastos`, este sí es específico por negocio) tiene dos entradas nunca usadas (`Venta de Leche`, `Venta de Vacas`) junto a las realmente usadas en 2023–2025 (`Venta Leche`, `Venta de Terneros`) — se detectó revisando el histórico real de uso, no por nombre. El precedente 2023–2025 (28 filas revisadas) fijó también comprador (`El Pomar`, 100% de las filas de leche) y medio de pago (`Cuenta Fovemsa`, 100% de las filas), que Santiago confirmó usar igual para 2026.

### 14.2 Filas insertadas

**Leche** — 6 filas, categoría `Venta Leche`, comprador `El Pomar`, medio de pago `Cuenta Fovemsa`, `nombre="{litros} L"`, `cantidad`/`precio_unitario` poblados:

| Mes | Fecha | Litros | Bruto (Excel) | Neto insertado | Precio/L |
|---|---|---|---|---|---|
| Enero | 2026-01-31 | 12.541 | $25.207.410 | $24.640.243,28 | $1.964,78 |
| Febrero | 2026-02-28 | 12.946 | $26.021.460 | $25.435.977,15 | $1.964,78 |
| Marzo | 2026-03-31 | 11.700 | $23.211.175 | $22.688.923,56 | $1.939,22 |
| Abril | 2026-04-30 | 9.812 | $19.624.000 | $19.182.460,00 | $1.955,00 |
| Mayo | 2026-05-31 | 12.567 | $25.134.000 | $24.568.485,00 | $1.955,00 |
| Junio | 2026-06-30 | 13.781 | $27.699.810 | $27.076.564,28 | $1.964,78 |

Total leche: **$143.592.653,27** — coincide casi exactamente con lo que Martha recordó de memoria en la llamada ("143.592 millones de ingresos"), validando que el neto era el número correcto a usar.

**Terneras** — 7 filas, categoría `Venta de Terneros`, sin comprador (precedente: siempre null), `nombre="1"` por venta (patrón histórico: una fila por ternera):

| Mes | Fecha | Filas | Valor c/u | Origen |
|---|---|---|---|---|
| Enero | 2026-01-31 | 1 | $120.000 | 🟢 Directo del Excel |
| Febrero | 2026-02-28 | 1 | $120.000 | 🟢 Directo del Excel |
| Marzo | 2026-03-31 | 1 | $120.000 | 🟢 Directo del Excel |
| Mayo | 2026-05-31 | **4** | $120.000 c/u | 🟡→✅ El Excel traía una sola celda de $480.000; Santiago confirmó que eran **4 terneras a $120.000 cada una**, no 1 a $480.000 — se insertaron como 4 filas separadas para mantener el patrón "una fila por venta" del histórico |

**Excluido** (igual que en el dry-run, §-anterior de este mismo apartado):
- `Venta Vacas ($)` — sin ningún valor en el Excel para ene–jun 2026, nada que insertar.
- `Ingreso Hato (Ingreso Neto leche + terneras + vacas)` — fila de total calculado por Martha, no una transacción; insertarla habría duplicado el ingreso de leche y terneras ya registrado por separado.

### 14.3 Totales de Hato Lechero después del backfill de ingresos

| Mes | Filas | Total |
|---|---|---|
| Enero | 2 | $24.760.243,28 |
| Febrero | 2 | $25.555.977,15 |
| Marzo | 2 | $22.808.923,56 |
| Abril | 1 | $19.182.460,00 |
| Mayo | 5 | $25.048.485,00 |
| Junio | 1 | $27.076.564,28 |
| **Total ene–jun 2026** | **13** | **$144.432.653,27** |

Con gastos (§13.4, $96.223.015) e ingresos (§14.3, $144.432.653,27) ya cargados para el mismo período, Hato Lechero queda con un margen ene–jun 2026 de **~$48,2M** en el sistema — cercano a lo que Martha estimó de memoria en la entrevista (ingresos ~143,5M, gastos ~74M *sin contar* lo que ella misma reconoció que le faltaba, que es justo lo que este backfill llenó).

### 14.4 Pendiente de esta ejecución

- Confirmar si el comprador de leche y la cuenta de cobro fueron realmente `El Pomar`/`Cuenta Fovemsa` en 2026 (se asumió por precedente 100% consistente 2023–2025, no por confirmación específica de 2026).
- Igual que en gastos (§13.5), repetir para años anteriores a 2026 si Martha entrega más archivos.
