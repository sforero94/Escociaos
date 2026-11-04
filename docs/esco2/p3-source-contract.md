# Esco 2.0 P3: contrato de fuentes de aplicaciones y vínculo laboral

Fecha: 2026-11-04. Alcance: contrato de P3, sin código ni cambios productivos.
Base: `main` `6e18ca1e` o posterior; P2-A `f58d36c8`, `esco-consultas` v3.
La autorización de Santiago del 4 nov 2026 permite implementación local y PRs por tarea;
merge solo tras aprobación de revisión de Santiago o Claude Code y `verificacion` verde.
No autoriza deploy, migración, secretos, escritura productiva, piloto ni P4–P6.
D17 permanece: no se abrió el held-out y este documento público solo contiene contratos,
esquema y agregados. No reproduce casos, respuestas, identificadores ni contenido de filas.

## Autoridad y verificación

D34–D37 de [decisiones P3](p2-v3-devcheck-y-decisiones-p3.md) son vinculantes.
**Precisión D34 confirmada por Santiago en este chat el 4 nov:**
`aplicaciones_cierre` no tiene columnas de costo. Leer los importes congelados de
`aplicaciones.costo_total_insumos`, `costo_total_mano_obra`, `costo_total` y comprobar
el cierre mediante `aplicaciones_cierre.aplicacion_id`. No reconstruirlos con precios actuales.
**Precisión del plan confirmada por Santiago en este chat:** «Plan exacto con dosis y árboles
guardados; sin dato si falta la base». No distribuir productos proporcionalmente por recipientes.

Todas las columnas y claves enumeradas aquí se contrastaron con el catálogo en vivo el
4 nov 2026, usando exclusivamente Composio `SUPABASE_RUN_READ_ONLY_QUERY`, cuenta
`escocia-os`. La fuente del esquema es `information_schema.columns`, `pg_constraint`,
`pg_enum` y `pg_policies`, nunca `src/types/database.ts` ni los inventarios de `CLAUDE.md`.
El código existente se inspeccionó para identificar cálculos reutilizables y sus límites,
no para atribuirle columnas que el catálogo no tiene.

Consulta reproducible de columnas:

```sql
SELECT table_name, column_name, data_type, udt_name, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND (table_name LIKE 'aplicaciones%' OR table_name LIKE 'movimientos_diarios%'
       OR table_name IN ('productos', 'tareas', 'registros_trabajo', 'lotes'))
ORDER BY table_name, ordinal_position;
```

Las claves se comprobaron con `pg_get_constraintdef(pg_constraint.oid)` uniendo
`pg_class` y `pg_namespace`, para las mismas tablas y tipos `p`, `u`, `f`.
Las políticas se comprobaron en `pg_policies` para `cmd IN ('SELECT','ALL')`.
Las unidades/estados/tipos/fracciones se comprobaron en `pg_enum` unido a `pg_type`.
Estas consultas solo leen metadatos; que el catálogo describa una columna no prueba que
un JWT concreto pueda leerla ni que todos sus valores sean completos.

Cobertura agregada observada (lectura administrativa de solo lectura, no población RLS de
un usuario ni garantía futura): 24 aplicaciones; 0 con vínculo tarea NULL; 0 con estado NULL;
0 con inicio planeado NULL; 1 con inicio de ejecución NULL. Las 22 cerradas tienen registro
de cierre y los tres importes congelados presentes. Hay 80 cálculos, 8 con `mezcla_id` NULL;
71 con `numero_bultos` NULL y 9 con `numero_canecas` NULL. Estos últimos campos corresponden
a tipos distintos y no se interpretan automáticamente como datos faltantes. Hay 204 movimientos,
ninguno con ambas cantidades de recipientes NULL. De 343 productos, 0 tienen stock NULL
y 3 precio NULL. Los NULL y vínculos ausentes siguen siendo estados obligatorios del contrato
aunque la cobertura observada hoy sea completa.

## Población visible, disponibilidad y fechas comunes

- Los lectores de ejecución usarán el JWT del solicitante y la puerta existente de Gerencia
  activa. Nunca service role ni resultados de la lectura administrativa para contestar al usuario.
  Una relación hija solo entra si su aplicación padre es visible y su ID pertenece al alcance
  aprobado; algunas políticas hijas permiten SELECT autenticado general y no prueban por sí solas
  la visibilidad del padre. No se modifica ninguna política en P3.
- Paginación con conteo exacto, IDs únicos y validación de referencias, usando el patrón fijo de
  `src/utils/esco2/fuente.ts`. Una lectura fallida, incompleta o sin campo requerido es **no leída**,
  nunca `[]`. Leer tablas por separado implica `lecturas_independientes`: no prometer snapshot
  transaccional ni conciliación atómica entre tablas.
- **NULL registrado:** el campo fue leído, pero no contiene el dato. **Vacío verificado:** lectura
  completa, autorizada y válida sin filas coincidentes. **Cero explícito:** número registrado o
  suma sobre una población completa que admite cero. **Sin vínculo:** `tarea_id` leído y NULL.
  **Vínculo no legible:** ID presente sin tarea autorizada/legible. Estos estados llevan textos
  distintos y nunca se intercambian. La falta de un metadato opcional no borra otra respuesta válida.
- Identidad por UUID de aplicación, mezcla, lote, producto y tarea. Nombres y códigos solo resuelven
  opciones contra el catálogo visible o se muestran; jamás son claves de join. Nombres repetidos
  permanecen separados. No se descartan aplicaciones sin tarea en el nuevo lector de aplicaciones.
- Intervalos inclusivos de fechas calendario. «Hoy» se inyecta en Bogotá y usa
  `src/utils/esco2/fechaCalendario.ts`. `date` no se desplaza de zona; `timestamptz` requiere
  conversión explícita a Bogotá si se presenta como fecha. No usar `created_at` para simular
  estado histórico ni para sustituir fecha operativa. El estado consultado es el **estado actual**.
- El plan y la ejecución siempre tienen encabezados, fechas y unidades separados. Nunca sumarlos.
  Un período de selección de aplicaciones no recorta silenciosamente sus totales de vida completa;
  una consulta de ejecución dentro del período filtra movimientos y lo dice. Un cierre expresa
  el costo completo de esa aplicación, no un gasto repartido al período.
- Unidades del catálogo: `Kilos`, `Litros`, `Unidades`; mostrar kg, L, unidades. No sumar kg con L
  ni mezclar unidades incompatibles del mismo producto. Canecas y bultos son recipientes de mezcla,
  distintos de kg/L de ingrediente y de presentaciones comerciales. Mostrar capacidad solo cuando
  se conoce; no convertir una caneca sin tamaño a 200 L ni un bulto de producto sin presentación
  a 50 kg. Los bultos de mezcla de la calculadora tienen su regla de 50 kg documentada en
  `calculosAplicaciones.ts`; esa regla no convierte cualquier presentación comercial en 50 kg.

## Preguntas esenciales y fuentes

### 1. Aplicaciones en un período y su estado

**Respuesta:** aplicaciones visibles seleccionadas por la fecha operativa pedida, con estado
actual. `Calculada` se presenta como **Planificada**; `En ejecución` y `Cerrada` conservan etiqueta.
No se afirma qué estado tenía una aplicación en una fecha histórica.

**Columnas fijas:** `aplicaciones.id,codigo_aplicacion,nombre_aplicacion,tipo_aplicacion,estado,
fecha_inicio_planeada,fecha_fin_planeada,fecha_inicio_ejecucion,fecha_fin_ejecucion,tarea_id`;
`aplicaciones_cierre.id,aplicacion_id,fecha_cierre`; para selección por trabajo ejecutado,
`movimientos_diarios.id,aplicacion_id,lote_id,fecha_movimiento`.

**Claves y población:** aplicaciones por `id`; cierre `aplicacion_id→aplicaciones.id` (UNIQUE);
movimientos `aplicacion_id→aplicaciones.id`. Deduplicar aplicaciones seleccionadas por varios
movimientos, nunca duplicar sus totales. No filtrar implícitamente aplicaciones cerradas ni
lotes actualmente activos. Unidad: número de aplicaciones y conjunto de IDs.

**Base de fecha:** inicio planeado para «planeadas para»; `fecha_movimiento` para «ejecutadas en»;
`aplicaciones_cierre.fecha_cierre` para el **cierre operativo registrado**. El constructor
`construirPayloadCierreAplicacion` manda `datosFinales.fechaFinReal` como `fecha_cierre`;
el RPC de la migración 106 persiste ese DATE tanto en `aplicaciones_cierre.fecha_cierre`
(DATE) como en `aplicaciones.fecha_cierre` (TIMESTAMPTZ). El tipo timestamp de la segunda
columna no la convierte en instante administrativo de cierre. Ninguna de esas dos columnas
prueba cuándo se hizo el trámite. «Cerradas en» sin distinguir el significado pide aclaración
y muestra la base operativa elegida; si se pide el instante administrativo, P3 declara que
no tiene esa evidencia. No se adopta por defecto inicio, final, solapamiento o fecha de creación.
No se agrega una interpretación general de intervalos. Inicio/fin de ejecución almacenados
pueden mostrarse como metadatos con su procedencia, no prueban movimientos dentro del intervalo.

**Estados:** base temporal no leída bloquea esa selección; base NULL se declara como sin fecha
registrada y se informa el excluido, no se imputa otra fecha. Estado NULL es «sin estado
registrado»; nombre/código NULL recibe etiqueta neutra sin perder identidad. Cero aplicaciones
solo tras selección completa sin coincidencias. La falta de tarea no afecta esta lista.

### 2. Productos y cantidades planeadas frente a ejecutadas por lote (D35)

**Columnas fijas del plan:**
`aplicaciones.id,tipo_aplicacion`; `aplicaciones_mezclas.id,aplicacion_id,numero_mezcla,nombre_mezcla`;
`aplicaciones_calculos.id,aplicacion_id,lote_id,mezcla_id,total_arboles,numero_canecas,litros_mezcla,
numero_bultos,kilos_totales`; `aplicaciones_productos.id,mezcla_id,producto_id,producto_nombre,
producto_unidad,cantidad_total_necesaria,dosis_por_caneca,unidad_dosis,dosis_grandes,
dosis_medianos,dosis_pequenos,dosis_clonales`; `lotes.id,nombre`.
Base guardada del cálculo exacto: `aplicaciones_lotes.id,aplicacion_id,lote_id,arboles_grandes,
arboles_medianos,arboles_pequenos,arboles_clonales,total_arboles,calibracion_litros_arbol,tamano_caneca`.
Las dosis y esta base de árboles/calibración/capacidad también se contrastaron con el catálogo
en vivo. No se sustituyen por los árboles actuales de `lotes`.

**Join:** producto→mezcla por `mezcla_id`; mezcla→aplicación por `aplicacion_id`;
cálculo→mezcla por `mezcla_id` y misma aplicación; cálculo→lote por `lote_id`.
El catálogo impone UNIQUE `(aplicacion_id,lote_id)` en cálculos y UNIQUE `(mezcla_id,producto_id)`
en productos. Un producto sí puede aparecer en varias mezclas. Cada fila fuente entra una vez.
El total de producto de una mezcla se suma una vez al total de aplicación, antes de cualquier
join a lotes. **Plan exacto por producto/lote, decisión confirmada:** reusar
`calcularFumigacion` (también Drench) o `calcularFertilizacion` de
`src/utils/calculosAplicaciones.ts`, con los árboles, calibración y tamaño guardados en
`aplicaciones_lotes` y las dosis de `aplicaciones_productos` de la mezcla que indica
`aplicaciones_calculos.mezcla_id`. No se prorratea el producto usando canecas o bultos del Reporte.

- Fumigación/Drench: árboles guardados × calibración guardada / capacidad guardada obtiene las
  canecas de la fórmula; cantidad de producto = esas canecas × dosis por caneca / 1.000,
  con unidad cc→L o g→kg validada. Usar la misma secuencia y redondeo hacia arriba a dos
  decimales del motor original, sin multiplicar la caneca ya redondeada almacenada.
- Fertilización: sumar árboles guardados por clase × su dosis guardada por clase / 1.000,
  producto por producto, usando el redondeo del motor original. Mezclas con productos/dosis
  distintos por clase no admiten reparto proporcional por bultos: inventaría presencia y
  cantidades de productos en lotes. Los bultos de mezcla redondeados a medios bultos son
  un resultado separado, no un peso para redistribuir cada ingrediente.
- Validar árboles, dosis y calibración finitos y no negativos, y capacidad de caneca finita
  y estrictamente positiva; también unidades, mapeo de mezcla y coherencia de totales antes de
  llamar a los motores. Ningún `|| 0`, capacidad 200 L por defecto, dosis nula convertida
  en cero o árbol de hoy puede completar una base faltante. Cero explícito permanece cero.
  Si falta la base requerida, mostrar **«sin dato para el plan exacto de este producto/lote»**.
  Las cantidades guardadas por lote o por mezcla que sí se leen permanecen disponibles.
- Reconciliar producto por producto, mezcla por mezcla, los resultados del mismo motor con
  `cantidad_total_necesaria` guardada, manteniendo la procedencia de cada uno. Si no coinciden,
  declarar discrepancia de fuente y no escalar ni repartir la diferencia para forzar igualdad.
  El total guardado de mezcla sigue identificado como tal; no se presenta el desglose
  reconstruido como conciliado. D37 conserva su base explícita en cantidades guardadas.

Acumular aportes de distintas mezclas por `(aplicacion_id,lote_id,producto_id,unidad)` sin
sobrescribir filas ni volver a sumar el total de mezcla en cada lote. No usar el bloque
`Planned Data Processing` de `useReporteAplicacion` como autoridad del plan exacto: además
prorratea por recipientes, usa fallback igualitario y puede sobrescribir producto/lote.

**Columnas fijas de ejecución:** `movimientos_diarios.id,aplicacion_id,lote_id,fecha_movimiento,
numero_canecas,numero_bultos`; `movimientos_diarios_productos.id,movimiento_diario_id,producto_id,
producto_nombre,cantidad_utilizada,unidad`; `lotes.id,nombre`.
Join hijo→movimiento por `movimiento_diario_id`; lote por el `lote_id` del movimiento.
No se cruza producto ejecutado con todas las mezclas planificadas: produciría fan-out.
Cada ID de hijo se suma una vez en su producto/lote/unidad. Mezcla líquida no es cantidad de
producto ni cantidad de agua: el agua no está registrada como un total de ingrediente inferible.

**Fecha y población:** plan completo vigente/guardado de la aplicación seleccionada; no historial
as-of del plan. Ejecución de vida completa o por `fecha_movimiento` en período explícito.
La unión de lotes con plan y/o movimientos muestra cada lado por separado; lote solo ejecutado
no recibe un plan fabricado, ni lote solo planeado acredita ejecución.

**Unidades/estados:** `usaCanecas` y `unidadAplicacion` distinguen Fumigación/Drench de
Fertilización, después de validar el tipo. Tipo NULL/no leído o `N/A` no autoriza a inferir una
unidad por el default del helper. NULL en la columna del otro tipo no es cero de esa unidad.
Se conservan litros/kilos planeados almacenados; producto usa su propia unidad. Capacidad NULL
permite mostrar canecas guardadas, pero no litros derivados ni cálculo exacto que requiere esa
capacidad. Sin cálculos, mezcla, árboles, dosis o calibración requerida leídos y válidos,
el producto/lote queda **sin dato de plan exacto**; puede sobrevivir el total guardado por
mezcla/aplicación y la cantidad guardada de recipiente del lote. No se calcula ningún reparto
igualitario o proporcional como respaldo. Un plan sin filas es «sin plan registrado», no un plan cero.
Movimientos vacíos verificados son «sin movimientos registrados»; un movimiento sin productos
es «sin productos registrados en esos movimientos», no prueba cero consumo real. Tabla hija
no leída significa «no pude leer los productos ejecutados». Producto con cantidad explícita
cero se presenta como cero registrado. No se lee `aplicaciones_lotes_planificado`.

### 3. Costo por aplicación (D34)

**Cerrada:** `aplicaciones.id,estado,costo_total_insumos,costo_total_mano_obra,costo_total`;
`aplicaciones_cierre.id,aplicacion_id,fecha_cierre`. Join por ID y cierre único verificado.
Mostrar los importes guardados como «costo congelado al cierre», fecha de cierre operativo
registrada (fin real enviado al cierre, no instante administrativo) y alcance
completo de aplicación. `aplicaciones_cierre.valor_jornal` no es el total de mano de obra.
No reemplazar importes congelados por `productos.precio_unitario` ni por registros laborales
editados después. M1 documenta cierres afectados por precios mal capturados: se conserva
advertencia de calidad de origen; P3 no corrige esos datos ni los convierte en una cifra nueva.

**Abierta:** cantidades ejecutadas de la sección 2. Si se pide dinero, mismos productos ejecutados
más `productos.id,unidad_medida,precio_unitario`; join por producto ID y unidades compatibles.
Cantidad × precio leído hoy, rotulado **«a precio de hoy»**, fecha de consulta Bogotá y subtotal
de insumos; no llamarlo costo histórico ni costo total si no incluye todo. Una valorización del
plan se rotula aparte como plan a precio de hoy. No es necesario producir dinero no solicitado.

**Población/fecha/unidad:** aplicación visible resuelta por ID; COP. Costo congelado completo
fechado por cierre; valorización actual por fecha de lectura, aunque el movimiento sea antiguo.
No sumar aplicaciones abiertas valorizadas hoy con cerradas congeladas en un total sin
separar bases y explicarlo. Preferir subtotales independientes y no inventar una serie histórica.

**Estados:** cerrada con cierre no leído, ausente o inconsistente no tiene costo de cierre
verificado. Importe NULL queda sin costo registrado, nunca cero. Componentes incompletos pueden
mostrarse individualmente sin afirmar total completo. Precio no leído/NULL impide valorizar ese
producto y el total; cero explícito es precio cero, con etiqueta. Producto no visible/unidad
incompatible es no valorizable, no gratis. Vacío de cantidades no certifica costo real cero.

### 4. Jornales y costo laboral vinculados a una aplicación (D36)

**Columnas fijas:** `aplicaciones.id,tarea_id`; `tareas.id,nombre`; `registros_trabajo.id,tarea_id,
lote_id,fecha_trabajo,fraccion_jornal,costo_jornal`; `lotes.id,nombre` si se desglosa.
**Join exclusivo:** `aplicaciones.tarea_id=tareas.id=registros_trabajo.tarea_id`.
Nunca nombres, códigos, descripción ni personal/responsable textual. Las tablas de cuadrilla
`movimientos_diarios_trabajadores` y `movimientos_diarios_empleados` no se suman además a
`registros_trabajo`: son otra capa de captura, no una segunda fuente acumulable de jornales.

**Población/fecha/unidad:** registros visibles de la tarea vinculada, de vida completa o filtrados
por `fecha_trabajo` en el período pedido. Jornales (enum 0.25, 0.5, 0.75, 1.0) y COP de
`costo_jornal` registrado, no tarifa actual ni estimado. Mostrar total y grupos del mismo conjunto
sin perder sin-lote. La cifra responde «labor registrada de la tarea vinculada», no cambia el
costo congelado de la sección 3. Si varias aplicaciones comparten tarea, el costo es común de esa
tarea: mostrar ese alcance y contar sus registros una vez en agregados; no afirmar atribución
exclusiva por aplicación ni distribuirlo sin evidencia.

**Estados:** tarea_id NULL = «aplicación sin tarea vinculada»; campo no leído = «vínculo no leído»;
ID con tarea no legible = «tarea vinculada no disponible». Ninguno dice cero jornales. Solo con
vínculo válido y lectura completa de registros vacía corresponde «sin jornales registrados».
NULL de costo conserva jornales pero impide total completo de costo; no reemplazar por cero ni
por promedio congelado. `lote_id` NULL entra en sin-lote. No se reparte ese costo a lotes conocidos.
El nuevo lector no puede reutilizar sin cambios un adaptador que omite aplicaciones sin tarea.

### 5. Faltantes de insumos vigentes (D37)

**Columnas fijas:** `aplicaciones.id,estado`; `aplicaciones_mezclas.id,aplicacion_id`;
`aplicaciones_productos.id,mezcla_id,producto_id,producto_nombre,producto_unidad,
cantidad_total_necesaria`; `productos.id,nombre,unidad_medida,cantidad_actual`.
`precio_unitario` y `presentacion_kg_l` solo si se pide valorización/presentación, con sus estados.

**Claves/población:** aplicaciones visibles explícitamente seleccionadas; producto→mezcla→aplicación
por ID. Agrupar necesidad por `producto_id` sumando las filas de todas sus mezclas una sola vez,
sin join a cálculos/lotes que multiplique cantidades. Cruzar stock por `productos.id` una vez.
Faltante = `max(0, necesidad - stock_actual)` en la misma unidad. Para un conjunto de aplicaciones,
sumar primero necesidades y restar stock una sola vez por producto; no sumar faltantes
individuales que reutilizan el mismo stock. No incluir todas las aplicaciones cerradas de forma
implícita en una lista de compra ni restar ejecución al plan: eso sería otra definición de
necesidad pendiente que D37 no aprobó.

**Fecha/unidad:** existencia vigente al leer, fecha de consulta Bogotá; no stock histórico ni
reserva garantizada. kg/L/unidades por producto, sin total físico mezclado. La unidad comercial
no cambia la cantidad necesaria en base. No se lee `aplicaciones_compras`, que es foto congelada.

**Estados:** plan no leído o sin productos registrados impide afirmar «no falta nada»; stock NULL
es stock sin dato; producto no visible/no encontrado es inventario no disponible. Unidad
incompatible impide la resta; cero stock explícito sí produce necesidad completa como faltante.
Faltante cero solo tras necesidad y stock completos compatibles; se expresa «alcanza el inventario
registrado hoy». Ninguna lectura garantiza que nadie consuma ese stock durante otras lecturas.

## Reutilización de motores existentes y límites auditados

| Motor existente | Reutilización P3 | Precondición / límite |
|---|---|---|
| `usaCanecas`, `unidadAplicacion` en `src/utils/calculosAplicaciones.ts` | Selección de columnas/unidad de recipiente | Validar Fumigación, Drench o Fertilización antes; no usar el default para N/A/desconocido. |
| `calcularTotalesGlobalesProductos` en ese mismo archivo | Consolidar un producto repetido entre mezclas (D37) | Validar IDs/unidades/números y construir mezclas solo una vez. Su redondeo hacia arriba a 2 decimales no puede alterar la suma exigida por D37: reutilizar solo si la entrada hace ese paso neutro; si no, extraer su fase de acumulación común sin redondeo y dejar el formato para el renderer. |
| `generarListaCompras` en ese mismo archivo | Fórmula existente de faltante sobre stock actual validado | No pasar NULL como stock; no aceptar que omita productos ausentes. Para faltante esencial basta su aritmética validada; extraer un helper puro común si sus campos de presentación/precio obligan a fabricar datos. No usar su salida persistida `aplicaciones_compras`. |
| `calcularFumigacion`, `calcularFertilizacion` en `src/utils/calculosAplicaciones.ts` | Plan exacto por producto/lote con dosis y árboles guardados, incluido Drench con lógica líquida | Base completa validada antes de invocar; preservar orden/redondeo original. Sin defaults que completen NULL. Mapeo por `calculos.mezcla_id`; discrepancia con total guardado se declara, nunca se reescala. |
| Reporte de Aplicación: `Planned Data Processing` en `src/hooks/useReporteAplicacion.ts` | Referencia de presentación de columnas separadas y auditoría del legado | No reusar su prorrateo para plan exacto. No importar el hook al servidor, ni copiar reparto igualitario, `|| 0` o sobrescritura de producto/lote. |
| `calcularCambio` en `src/utils/calculosReporteAplicacion.ts` | Porcentaje de cambio plan→ejecución, si se muestra | Solo ambos lados completos, misma unidad/base; sin base o base cero no hay porcentaje. No usar `calcularDesviacion` que fabrica 100 cuando plan=0. |
| `convertirCanecasALitros`, `convertirACanecas200LEquivalente`, `convertirBultosAKilos` en ese archivo | Conversión explícita cuando capacidad/peso están sustentados | Nunca alimentar capacidad/peso supuesto para tapar NULL. Equivalente 200 L lleva esa etiqueta; no es conteo original de recipientes. |
| `convertirUnidadBase` en `src/utils/aplicacionesReales.ts` | Normalizar una unidad reconocida cuando haga falta | Validar enum/unidad primero; el default del helper no certifica que una unidad desconocida sea una unidad física. No reusar su lector con errores/precios ausentes convertidos en cero. |
| `derivarFechasEjecucionReal` en `src/utils/calculosCierreAplicacion.ts` | Derivar primera/última fecha operativa cuando se pida | Solo entradas ya validadas y fuentes completas; declarar unión de movimientos y labor por vínculo ID. No confundir con fecha de cierre ni estado as-of. |
| `calcularKPIsLabores` / `agruparRegistrosPorLote` en ese archivo y agregación P2 en `src/utils/esco2/ejecutor.ts` | Reusar suma/grano laboral ya probado | Preferir el ejecutor P2 para propagación de costo NULL, sin-lote y garantías. El helper de cierre espera números completos y campos personales innecesarios para P3; no fabricarlos para invocarlo. |
| `construirPayloadCierreAplicacion` en ese archivo | Autoridad de procedencia de costos congelados y consolidación por producto | No invocarlo para recalcular un cierre histórico ni ejecutar su RPC. El lector consume valores congelados ya guardados bajo D34. |
| `calcularCostosVivosAplicacion` en ese archivo | No usar para el costo congelado D34 | Sustituye mano de obra congelada por registros vivos y usa fallback; ese objetivo del Reporte de Cierre no es la pregunta P3 de costo congelado. Labor viva va aparte bajo D36. |
| `mensajes.ts`, `formatPuro.ts`, `fechaCalendario.ts` | Formato español determinista, dinero, fechas y calendario de P2 | Figuras/cualificadores producidos por código. Sin compositor que escriba cifras ni títulos factuales libres del modelo. |

**Compatibilidad del servidor antes de reusar:** `aplicacionesReales.ts` importa en runtime
`supabase/client.ts`, que lee `import.meta.env` al cargar; no se importa ese módulo al edge
para acceder a una función pura. Extraer primero un helper compartido sin cliente, I/O ni reloj
y mantener el lector de navegador separado. El hook del Reporte también es de navegador.
`calculosCierreAplicacion.ts` usa alias `@/`, `fechasAplicacion` y `laborCosts`; este último
importa `SupabaseClient` solo como tipo y no importa el cliente de navegador en la revisión
inspeccionada. No atribuirle una dependencia de runtime que no existe. Aun así, auditar el
grafo resuelto y extraer la aritmética requerida a un módulo compartido independiente antes
de incorporarla al edge, con imports compatibles. `calculosAplicaciones.ts` tiene imports
de tipos, sin cliente de navegador; sus defaults de negocio requieren las precondiciones
anteriores. Prueba de importación y ejecución pura sin `import.meta.env`/red antes de integrar.

La extracción es reutilización de aritmética existente con un contrato de disponibilidad,
no un nuevo motor paralelo ni una rederivación desde resultados esperados.

## Puertas de implementación y división acotada

1. **Task 0, PR propio primero:** aclaración con botones/token/ID, instrucción al texto libre,
   máximo dos llamadas de planner y runner de labores con tres repeticiones; publicar agregados
   y costo. No desplegar el cambio; deriva esperada de `esco-consultas` queda pendiente de decisión.
2. **Task 1, este contrato en PR propio:** columnas verificadas y D34 preciso, sin código. Campos
   no legibles mantienen respuestas parciales honestas. La pregunta ambigua de fecha se aclara;
   no falta una decisión que obligue a escoger por Santiago una fecha implícita.
3. **Task 2:** tipos mínimos de fuente + lectores fijos caller-JWT + inventario de aplicaciones y
   fechas/estado; extender registro cerrado y renderer en la misma tarea, con QA de visibilidad,
   NULL/vacío, deduplicación por movimientos y bases de fecha operativa explícita.
4. **Task 3:** cantidades plan/ejecución por producto/lote, reutilización de los calculadores
   exactos con dosis y árboles guardados y helpers compartidos sin dependencias de navegador,
   conciliación por ID y unidad, sin-lote o mapeo no disponible. QA con oráculos de tablas.
5. **Task 4:** costos congelados/valorización actual, cruce laboral ID y faltante vigente como
   operaciones cerradas. Dividir en PRs menores si la revisión conjunta deja de ser acotada.
6. **Último:** runner equivalente para aplicaciones usando solo `docs/Esco 2.0/m1/`, después de
   congelar contrato/código/oráculos. Cap acumulado P3 USD 0,25 incluidas tres repeticiones de
   labores, reintentos y aclaraciones. Sin held-out, ni `scripts/esco2/e2e-local.ts`.

Cada PR sale de `main` vigente, contiene solo su tarea y reporta `npm test`, `tsc --noEmit`,
`npm run lint` con conteos, gasto y preguntas pendientes. No apilar implementación dependiente
sin integrar/revisar la anterior. CI `verificacion` debe quedar verde y el coordinador vuelve a
correr lo reportado por implementador/QA. Un PR abierto no autoriza su merge sin aprobación.

QA independiente usa fixtures sintéticos y oráculos literales/SQL ajenos al ejecutor. Debe
falsar al menos: join por texto en vez de ID; producto duplicado por fan-out de mezclas/lotes;
plan sumado a ejecución; precio actual rotulado histórico; aplicación sin vínculo presentada
como cero labor; `aplicaciones_compras` obsoleta usada como faltante actual. Cada mutación lleva
control positivo legítimo. Añadir controles de precio/stock NULL, bases de cálculo no legibles, unidades
incompatibles, tarea compartida y lector hijo con padre invisible. No afirmar aceptación P5 a
partir de fixtures o del conjunto de desarrollo.

Detenerse si una forma de pregunta exige más de dos casos especiales, si aparece necesidad de
lenguaje general de consultas o si queda un significado esencial sin decidir. Pedir entonces
2–3 opciones concretas a Santiago, sin inventar regla ni avanzar la implementación dependiente.

## Verificación de este PR documental

Coordinador: `npm test` **7.403/7.403 pruebas, 306 archivos**; `npx tsc --noEmit`
aprobado; `npm run lint` **0 errores, 907 advertencias existentes**; whitespace aprobado.
Esta rama sale de `main` `6e18ca1e` y cambia solo este contrato, por eso no contiene las
65 pruebas nuevas del PR separado [Task 0 #417](https://github.com/sforero94/Escociaos/pull/417).
CTO preparó el contrato y QA independiente contrastó columnas, claves, fórmulas, redondeos,
fechas, unidades y dependencias; el coordinador revisó las correcciones y corrió los checks.
No hay aceptación funcional ni certificado de JWT/RLS real.

Gasto incremental de este contrato: **USD 0**. Acumulado P3 tras las dos corridas de labores:
**USD 0,013768745 de USD 0,25**; saldo USD 0,236231255. No se ejecutó el conjunto de aplicaciones.
D34–D37 y las dos precisiones confirmadas están registrados una vez en el master plan de Notion.
No queda una decisión esencial de fuentes sin resolver. La revisión y el merge requieren
aprobación de Santiago o Claude Code; Task 2+ permanece pendiente y no se despliega nada.
