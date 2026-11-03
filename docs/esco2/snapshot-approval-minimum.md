# E2-18 — autorización mínima propuesta para M2.5

Fecha: 2026-11-03. Estado: propuesta pendiente de autorización de copia.
Solo se inspeccionaron archivos locales; no se consultó producción ni se transfirió
información de negocio. Esta propuesta habilita preparar el primer snapshot de
labores; no completa por sí sola E2-18 para los cinco dominios.

## Decisión recomendada

Autorizar una exportación única de la proyección de labores descrita abajo,
incluidos costos operativos registrados por fila, desde el Supabase existente de
Escocia hacia un entorno local de evaluación con acceso restringido a Santiago y
Dotor/evaluación designada. Conservar como máximo 30 días desde la extracción,
sin copias externas ni envío automático a modelos. No autorizar nuevas
credenciales, ampliaciones de permisos, escrituras productivas ni otros dominios.

D18 permite evaluar con OpenAI sobre el snapshot de fase 1, pero la exportación
propuesta no ejecuta esa autorización: E2-06 y los gates de M2/M2.5 deben cumplirse
antes de cualquier envío. El held-out sigue fuera de este frente.

## Origen y corte

Origen: tablas del proyecto Supabase existente de Escocia. Lectura mediante un
mecanismo existente y autorizado, con la identidad comprobada; no usar un
privilegio mayor porque facilite exportar. La presencia de service_role en un
ejecutor no acredita autorización para una exportación genérica.

Corte propuesto de negocio: desde 2026-01-01 hasta la fecha de extracción,
inclusive, en America/Bogota. Fijar también el instante UTC de extracción T.
La fecha final exacta sale del día de ejecución autorizado; no simular un corte
pasado ni capturar fechas de trabajo futuras. Dentro del rango, incluir todos
los registros y todos los lotes, incluidos los nulos, sin muestreo por resultado.

Exportación consistente de todas las tablas en una misma lectura transaccional
READ ONLY / REPEATABLE READ, o un export autorizado equivalente que garantice el
mismo corte. La API paginada con lecturas separadas no acredita esa consistencia
por sí sola. Si las capacidades existentes no permiten el corte consistente,
detener la extracción y solicitar un export consistente al custodio de la base;
no abrir conexión ni crear credenciales nuevas.

Este snapshot refleja el estado al corte T. Si la base perdió historia, no
reconstruye qué se sabía en mayo u octubre: se rebasan y versionan preguntas y
referencias para ambas versiones comparadas; nunca se declara replay histórico
sin evidencia.

## Tablas y campos: lista cerrada inicial

| Fuente | Campos que se copiarían | Filas |
| --- | --- | --- |
| registros_trabajo | id, tarea_id, lote_id, fecha_trabajo, fraccion_jornal, costo_jornal | Todos los registros con fecha_trabajo en el rango aprobado existentes al corte T; conservar nulos y valores originales |
| tareas | id, nombre | Solo tareas referenciadas por esos registros; conservar referencia huérfana como fallo, no eliminar registros |
| lotes | id, nombre | Catálogo completo al corte T, incluidos inactivos, para distinguir lote sin registros de lote inexistente |

Los nombres de tareas se necesitan para preguntas por tarea y pueden contener
información personal incidental. Revisarlos localmente antes de habilitar acceso
al implementador o envío a modelo. Si aparece información personal, bloquear esa
publicación: producir una versión redactada, con pregunta y referencia adaptadas
de forma uniforme, y conservar la transformación del lado del evaluador. No
añadir una columna de observaciones para compensar información faltante.

Los seis campos de registros_trabajo están respaldados por los tipos locales;
costo_jornal y los campos de lote/fecha/fracción aparecen en la proyección
minimizada de src/utils/escoHechosTrabajo.ts. tarea_id se necesita para agrupar
por tarea. Los tipos locales no prueban el catálogo vivo: la autorización
comprende comprobar únicamente el esquema de esta lista antes de extraer.
Si hay diferencias, registrar el faltante y detener esa parte, sin SELECT *.

costo_jornal significa costo ya registrado de la fila; se suma sin multiplicarlo
otra vez por fraccion_jornal. Verificar esta semántica contra la definición
vigente al preparar el oráculo; si no se puede justificar, costo queda inconcluso.
No recalcularlo con salarios o tarifas actuales ni convertir NULL en cero.

Quedan fuera: empleados, contratistas y sus IDs; nombres de personas, salarios,
prestaciones, auxilios, tarifas, valor_jornal_empleado, registrado_por, created_by,
updated_by, responsables, usuarios, correos, teléfonos, Telegram/OCR, documentos,
observaciones, descripciones, notas, credenciales y conversaciones. También
finanzas, ingresos, cuentas, hato, clima, monitoreo, aplicaciones, compras,
inventario y tablas de autenticación. No copiar un dump general ni el esquema
completo. Otros campos y dominios requieren una proyección posterior justificada;
su preparación sintética puede continuar ahora.

## Destino, acceso y conservación

Destino lógico: snapshot local de evaluación aislado, fuera del repositorio.
Propuesta de carpeta: /workspace/esco-evaluation-private/snapshots/labores-T/.
Export original restringido e inmutable, manifest y oráculos separados.
Para SQL independiente, cargarlo en Postgres local sin endpoint público ni
conexión de salida. No usar rama de Supabase ni almacenamiento nuevo en proveedor.
La elección de empaquetado, CSV/JSON, versión de Postgres y hashes es técnica.

Acceso propuesto al original: Santiago y Dotor/evaluador designado que ejecute
esta sesión de desarrollo. El implementador recibe las proyecciones/contratos
necesarios, sin respuestas esperadas; los oráculos quedan separados. No se
concede automáticamente acceso a otros agentes ni se coloca el snapshot en
Notion, GitHub, Library o carpetas compartidas. Una entrega a otro ejecutor debe
quedar explícita dentro de la autorización de destino y acceso.

Antes de copiar, comprobar aislamiento efectivo. chmod 700/600 y solo lectura
protegen frente a otras cuentas, pero no frente a procesos/agentes con el mismo
UID o administradores del entorno. Si la sesión comparte ese acceso con agentes
no autorizados, no cargar datos: preparar un ejecutor dedicado o recibir el export
en un entorno que Santiago ya controle. No prometer exclusividad ni cifrado sin
verificarlos. No se afirma que el destino esté provisionado hoy.

Conservación propuesta: máximo 30 días naturales desde T; borrar antes si el
entorno se retira, la evaluación se cancela o Santiago lo pide. Sin backups
externos ni duplicados persistentes; archivos temporales solo en el mismo destino
restringido. Registrar fecha de expiración y responsable de borrado. Una extensión
o copia fuera del entorno requiere autorización explícita. Retener después solo
metadatos de integridad/resultados agregados que no permitan reconstruir filas;
la retención de trazas privadas se decide aparte.

## Clasificación y riesgos

| Clase | Ejemplos | Tratamiento |
| --- | --- | --- |
| Datos operativos internos ordinarios | fechas de labores, fracciones de jornal, nombres de lotes/tareas no personales, relaciones | No son públicos; acceso por finalidad, sin difusión ni logging de filas |
| Datos económicos de acceso restringido | costo_jornal por fila y totales | Incluirlos requiere autorización expresa: un grupo pequeño puede revelar una tarifa aunque se quite el trabajador |
| Datos personales incidentales o enlazables | nombre personal en tarea, UUID que alguien pueda relacionar con registros de trabajadores | No afirmar anonimización; revisión/redacción antes de compartir, IDs no conceden autoridad |
| Datos personales, de nómina o secretos excluidos | identidad del trabajador, salario/tarifa individual, contactos, credenciales | No seleccionar ni copiar; hallazgo inesperado detiene la transferencia de esa parte |

Esta clasificación es operativa, no una determinación jurídica de categorías
legales de datos sensibles. Quitar empleados no vuelve anónimos los costos.

Riesgos concretos: extracción con permisos excesivos, páginas de distintos
instantes, inferencia de tarifas, texto libre con personas, pérdida de lote nulo,
joins que dupliquen jornales, costo faltante convertido a cero, diferencia entre
estado actual e histórico y acceso de otros procesos del ejecutor.

## Verificación antes y después de una copia autorizada

1. Antes: aprobación registrada con origen, lista cerrada, costo por fila,
   destino/usuarios y retención; disponibilidad de corte consistente e identidad
   existente; aislamiento y esquema comprobados. Si una condición falla, parar.
2. Después: versión y SHA-256 de cada archivo, columnas/tipos, rango de fechas,
   filas totales, claves duplicadas, FK huérfanas, nulos, conteos y subtotales por
   fecha/lote/tarea, reconciliación con totales fuente del mismo corte. Sin
   limpieza silenciosa ni truncado por límite de página.
3. Separar número de filas con costo conocido y faltante; suma de fracciones y
   costo conocido deben reconciliar incluido lote nulo. Examinar identificadores
   personales/secretos/texto incidental sin imprimir valores en logs.
4. Recalcular referencias con SQL independiente sobre la copia, no contra el
   producto ni respuestas previas. Conservar todos los diffs y resolver
   inconclusas antes de aceptación. Registrar acceso, expiración y borrado.
5. Ni source SELECT ni carga local acreditan RLS/JWT del producto o permiten
   inferir aprobación de arquitectura. No abrir reservas/held-out.

## Qué necesita decidir Santiago y qué resolvemos aquí

Santiago decide si autoriza o rechaza esta copia concreta con costos por fila,
el destino restringido y sus custodios, y el máximo de 30 días. Una aprobación de
ese paquete no equivale a aprobar implementación, presupuesto o despliegue.

Alternativa si no desea copiar filas/costos: puede entregar un export consistente
de esta proyección desde su entorno ya autorizado. Si prefiere solo agregados o
datos sintéticos, podemos seguir controles/contratos locales, pero deberá quedar
explícito que eso todavía no sustituye el snapshot real ni permite cerrar M1/M2.5.

Podemos resolver localmente sin más datos: herramientas/versión de SQL, manifiesto,
hashes, cargador cerrado, controles de nulos/duplicados, scripts de reconciliación
y prueba de aislamiento con datos sintéticos. No necesita escoger Docker,
Postgres frente a archivos, comandos, nombres de carpetas ni esquema de tests.
No necesitamos credenciales nuevas para preparar esos entregables.

Texto de aprobación propuesto:
“Autorizo una exportación única de registros_trabajo (id, tarea_id, lote_id,
fecha_trabajo, fraccion_jornal y costo_jornal), tareas referenciadas (id, nombre)
y lotes (id, nombre), desde 2026-01-01 hasta el día de extracción, con corte
consistente, al entorno local de evaluación aislado descrito. Incluyo los costos
registrados por fila sin identidades de trabajadores. Solo Santiago y
Dotor/evaluación designada acceden al original, por máximo 30 días, sin nuevas
credenciales, otros destinos ni envío a modelos en esta acción.”

