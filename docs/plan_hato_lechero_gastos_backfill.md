# Homologación de Gastos — Negocio Hato Lechero (tarea paralela)

**Fecha:** 2026-07-17 · **Relación con el módulo de diseño:** independiente. No bloquea ni es bloqueada por `docs/plan_hato_lechero_module.md`, ni consume ninguna de sus sesiones (§9 de ese documento). No requiere migraciones ni cambios de esquema — usa el modelo `fin_*` que ya existe.

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

## 12. Extensión futura opcional (fuera de esta tarea)

El mismo método (extraer → mapear → emparejar por concepto+fecha+monto → reporte de faltantes/ambiguos → checkpoint humano → carga) aplica igual de bien a **ingresos** (`fin_ingresos`): el Excel ya trae ventas de leche, terneras y vacas mes a mes, arriba de la sección de gastos en la misma hoja. Se deja anotado por si se decide ampliar el alcance más adelante, pero no forma parte de esta tarea.
