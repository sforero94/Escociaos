# Homologación de Gastos — Negocio Hato Lechero (tarea paralela)

**Fecha:** 2026-07-17 · **Relación con el módulo de diseño:** independiente. No bloquea ni es bloqueada por `docs/plan_hato_lechero_module.md`. No requiere migraciones ni cambios de esquema — usa el modelo `fin_*` que ya existe.

---

## 1. Por qué es una tarea separada

El plan de diseño del módulo Hato Lechero (fichas, chequeo, alertas, ordeño) es un **ejercicio de producto y arquitectura nueva**. Esto no lo es: es una **limpieza de datos** sobre una estructura financiera que ya funciona (`fin_gastos`, `fin_negocios`, `fin_categorias_gastos`, `fin_conceptos_gastos`). Mezclarlas en un solo plan diluye ambas. Se separan para que:

- El diseño del módulo animal/reproductivo pueda avanzar sin esperar la limpieza financiera.
- La homologación de gastos pueda hacerse en cualquier momento (incluso antes) por ser mecánica y acotada.
- El scope de "no rehacer Finanzas" del plan principal quede inequívoco: **este documento es la única pieza de trabajo financiero relacionada con el hato lechero**, y vive fuera del módulo nuevo.

## 2. Motivación (de la entrevista con Martha)

> "yo le puedo pedir al aparato éste que me ayude a completar la información automáticamente" — sobre el archivo GASTOS FOV con nómina de abril, mayo y junio 2026 faltante porque el Excel se saturó.

> "Ese yo se lo doy a este man y le digo: mira, acá hay unos nuevos ingresos que no tenemos y unos gastos que sí y otros que no. Ayúdeme a identificar cuáles sí, cuáles no, y créemelos en los datos."

Consuelito ya viene cargando gastos en la app desde el Excel mensualmente, pero el proceso es manual y tuvo una falla conocida (nómina abr–jun 2026 nunca llegó a Consuelito por la saturación del archivo). Tenemos ahora el Excel completo (`GASTOS_FOV_ENERO_2026`) — es la oportunidad de reconciliar qué ya está en Supabase contra qué hay en el Excel, y cargar solo lo que falta.

## 3. Alcance

**Incluye:**
- Únicamente registros del negocio **Hato Lechero** (`fin_negocios.nombre = 'Hato Lechero'`).
- Únicamente la sección **SUBACHOQUE** del archivo P&G (`P Y G JUNIO FOVEMSA 2026`, hoja única) — es la sección que corresponde a la operación del hato. Las secciones VILLETA y BOGOTA CASA **no son del hato lechero** y se excluyen explícitamente (ya excluidas en el plan de diseño principal).
- Ventana temporal: la que cubra el archivo entregado (enero–junio 2026 con datos; columnas jul–dic vacías). Ampliable a años anteriores si Martha entrega más archivos GASTOS FOV históricos (pendiente, ver §7).
- Gastos únicamente (`fin_gastos`). Ingresos (`fin_ingresos`) quedan fuera de esta tarea por instrucción explícita, aunque el archivo también los contiene y el método aplicaría igual — se anota como extensión futura opcional (§8).

**No incluye:**
- Cambios de esquema, migraciones, o nuevas tablas.
- Corrección retroactiva de gastos ya cargados con errores (solo se identifican duplicados/faltantes; corregir un monto mal digitado por Consuelito es un problema distinto).
- Ingresos.
- Gastos de Villeta / Bogotá casa.

## 4. Regla de oro: no duplicar

Un gasto del Excel se considera **ya registrado** en `fin_gastos` si existe una fila con:

- `negocio_id` = Hato Lechero, **y**
- `concepto` equivalente (ver normalización, §5.2), **y**
- `fecha` dentro del mismo mes/período que la celda del Excel, **y**
- `valor` igual (o la suma de varias filas de `fin_gastos` en ese concepto+mes iguala el valor de la celda — el Excel es una cifra mensual agregada; la app puede tener varias transacciones que suman lo mismo).

Solo lo que **no** encuentra coincidencia bajo esa regla se propone para inserción. Ante cualquier ambigüedad (coincidencia parcial, monto distinto, concepto dudoso), **no se inserta automáticamente** — se agrega a un reporte de revisión para que Santiago/Martha decidan.

## 5. Proceso

### 5.1 Extraer ambos lados

- **Excel**: parsear la hoja `P Y G JUNIO FOVEMSA 2026`, sección `SUBACHOQUE` (filas entre el encabezado "SUBACHOQUE" y el "SUBTOTAL" siguiente) más las filas de la sección intermedia sin encabezado de sub-sección que son claramente del hato (combustible/salarios/vacaciones antes de "VILLETA"). Cada fila = (concepto_categoria, concepto_texto, {mes: valor}). Aplanar a una lista de (concepto_texto, mes, valor) — un valor por celda no vacía.
- **Supabase**: `SELECT fecha, nombre AS concepto, valor, categoria_id, concepto_id, estado FROM fin_gastos WHERE negocio_id = (SELECT id FROM fin_negocios WHERE nombre = 'Hato Lechero') AND fecha BETWEEN '2026-01-01' AND '2026-06-30'`.

### 5.2 Normalizar conceptos para poder comparar

El Excel usa texto libre inconsistente ("NOMiNA SUBACHOQUE $1.825...", "MARE Hapadex/secamil (12...)"); la app tiene un catálogo estructurado (`fin_categorias_gastos` → `fin_conceptos_gastos`). Se construye una tabla de mapeo **concepto Excel → concepto_id app**, semi-automática:

1. Match exacto/fuzzy de texto contra `fin_conceptos_gastos.nombre` existentes.
2. Para conceptos del Excel sin equivalente claro, proponer creación de un nuevo `fin_conceptos_gastos` bajo la categoría correspondiente (las categorías del Excel — Salarios, Remedios-Vacunas-Purga, Combustible, Cercas-Alambres-Postes, Heno-Pasto-Silo, Bonificaciones, Vacaciones, Cesantías e Intereses, Compra Maquinaria, Inseminación y Servicios, Herramientas, Químicos, Abonos y Fertilizantes, Dotaciones, Administración — se mapean 1:1 a `fin_categorias_gastos`, creando las que falten).
3. El mapeo final queda en un archivo de configuración versionado (no hardcodeado en el script) para que sea auditable y reutilizable en años futuros.

### 5.3 Emparejar y clasificar

Para cada (concepto_texto, mes, valor) del Excel:

- **Coincide** → no se toca. Se cuenta para el reporte.
- **No coincide, pero el mes/concepto tiene *algo* registrado con valor distinto** → **ambiguo**, va a revisión (puede ser un gasto parcial, un error de digitación, o dos gastos reales distintos).
- **No coincide y el mes/concepto no tiene nada registrado** → **faltante**, candidato a inserción. La nómina de Subachoque abr–jun 2026 debería caer aquí, confirmando el hueco ya conocido por la entrevista.

### 5.4 Insertar solo lo confirmado

Los "faltantes" se insertan en `fin_gastos` con: `negocio_id` = Hato Lechero, `region_id` = la región de Subachoque (crear/usar la existente), `categoria_id`/`concepto_id` del mapeo (§5.2), `nombre` = texto original del Excel (trazabilidad), `valor` = el de la celda, `fecha` = primer día del mes correspondiente (el Excel es mensual, no tiene día — se documenta esta limitación), `medio_pago_id` = un valor por defecto razonable o "Sin especificar" (crear si no existe), `estado = 'Confirmado'` (coherente con que el dashboard de Finanzas solo cuenta confirmados), `observaciones` = `"Importado de GASTOS_FOV_ENERO_2026, sección SUBACHOQUE, homologación jul-2026"`.

**Antes de insertar en producción**: correr en modo dry-run y presentar el reporte completo (§6) para aprobación — mismo principio de "nada ambiguo se importa en silencio" que gobierna la importación de chequeos veterinarios.

## 6. Entregable: reporte de homologación

Un documento/CSV con tres secciones:

1. **Coincidencias** — cuántos $ y cuántas filas del Excel ya estaban en Supabase (confirma qué tan al día está la carga de Consuelito).
2. **Faltantes a insertar** — lista detallada (concepto, mes, valor) lista para aprobación.
3. **Ambiguos** — casos que requieren ojo humano, con la evidencia de ambos lados (fila Excel + filas Supabase candidatas) para que Santiago/Martha decidan.

## 7. Dependencias y pendientes

- Requiere acceso de ejecución a Supabase (service role) — mismo patrón que el pipeline de importación de chequeos (`scripts/`), pero un script independiente y más simple (sin entidades nuevas, sin resolución de identidad compleja).
- Si Martha entrega archivos GASTOS FOV de años anteriores a 2026 (mencionado como posible en la entrevista pero no confirmado), la misma tarea se puede correr por año.
- No depende de las migraciones `049`–`054` del módulo de diseño ni de ninguna tabla `hato_*`.

## 8. Extensión futura opcional (fuera de esta tarea)

El mismo método (extraer → normalizar concepto → emparejar por concepto+fecha+monto → reporte de faltantes/ambiguos) aplica igual de bien a **ingresos** (`fin_ingresos`): el Excel ya trae ventas de leche, terneras y vacas mes a mes. Se deja anotado por si se decide ampliar el alcance más adelante, pero no forma parte de esta tarea.
