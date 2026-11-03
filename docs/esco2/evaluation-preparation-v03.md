# Preparación E2-02 y E2-18 — v0.3

Fecha: 2026-11-03. Baseline local: `a635a05` (rama aislada
`codex/esco2-evaluation-prep`). Alcance: preparación de evaluación y fixtures
sintéticos; sin cambios de runtime, Telegram, motor v295, permisos o producción.

Fuentes vigentes:

- [Master plan v0.3](https://app.notion.com/p/40d67755ed6881dba866f9775fca997e)
- [PRD v0.3](https://app.notion.com/p/40d67755ed68803e8c37e928d0b31860)
- [E2-02](https://app.notion.com/p/40d67755ed6881e6b55dc3253afee1be)
- [E2-18](https://app.notion.com/p/40d67755ed6881088cb7f9719603cbf7)

## Evidencia y límites del inventario

Library permitió leer las 59 líneas del golden privado (357093 bytes declarados).
El helper oficial de materialización devolvió `download failed`, también con
ejecución fuera del sandbox; no instaló el original. No hay SHA-256 de sus bytes
ni se afirma que exista una copia legible local. El inventario derivado permanece
fuera del repositorio en `/workspace/esco-evaluation-private/development-inventory.json`.
No contiene preguntas, respuestas, SQL real, nombres ni UUID de conversaciones.
No sustituye el original ni sus referencias. No se abrió la reserva sellada ni
el held-out nuevo. No se reconstruyó el original desde la lectura.

Recuento comprobado: 59 casos, 56 incluidos históricamente y 3 en cuarentena;
52 conversaciones, 28 componentes conectados; 17 incluidos no reproducibles
as-of. Los componentes son un límite inferior, no 28 escenarios independientes:
falta revisión semántica. Las etiquetas de los cinco dominios contienen 45 casos,
43 incluidos históricamente. Esto no es un denominador aprobado de fase 1.
La aprobación histórica y `replayable_as_of` no validan por sí solos un oráculo.

Revisión pendiente antes de congelar:

- Conservar cuarentena incluso si cambió el alcance del dominio.
- Revisar etiquetas contra contenido: hay cruces de monitoreo bajo labores y de
  conductividad/aplicaciones bajo meta; contar cada escenario una sola vez.
- Completar referencias que solo tienen una nota o remiten a otro caso; no usar
  cifras de respuestas anteriores como evidencia independiente.
- Ratificar el veredicto humano inferido señalado en el plan.
- Guionizar continuaciones de aclaraciones, con identidad, período y población.
- Separar solicitudes de tres negocios, informes de visita, prescripción y
  memoria persistente según el alcance aprobado; no recortar preguntas para
  hacer que pasen. Resolver su elegibilidad prospectivamente con producto.

## Custodia y registro de campañas

Todo el adjunto expuesto es desarrollo. Todas las variantes, turnos y entidades
del mismo escenario permanecen en una partición. El implementador recibe entradas
y contratos, nunca referencias, etiquetas, anclas ni respuestas del evaluador.
Los 12 reservados siguen sellados. Santiago escribe al menos 6 escenarios nuevos
por dominio; Dotor los ejecuta en otra sesión sin contexto de implementación.
Si se revela un reservado, pasa a desarrollo y se reemplaza.

Antes de correr se firma un manifest privado: SHA-256 original y versión Library,
commit, catálogo, modelos solicitados/servidos, ruteo/esfuerzo, snapshot_id,
as_of y America/Bogota, manifest de tablas, oráculo SQL independiente y su hash,
rúbrica, grupos y partición, clasificación de respondibilidad, imprescindibles,
subconjunto/índices de repeticiones y límites. El sistema evaluado recibe solo
las entradas necesarias. Las referencias incompletas bloquean aceptación.

`scripts/esco2-evaluation/score.py` demuestra la puntuación fija con datos
sintéticos. No reemplaza el harness existente ni adjudica respuestas por sí mismo.
Requiere resultados adjudicados de forma independiente. Cada intento predefinido
cuenta, incluidos faltantes, bloqueados, abandonos y parciales. Guardas y
aclaraciones tienen carril separado. Se informa Wilson 95%, muestra, todos los
intentos y resultados por dominio; repetir no crea escenarios independientes.
Una referencia inconclusa conserva el denominador y bloquea aceptación. No se
recalcula un porcentaje favorable tras conocer resultados. Críticos y todas las
tareas imprescindibles son gates excluyentes; 90% se exige por partición.

El scorer previo `src/utils/escoEvals/medicion.ts` divide éxitos entre resultados
presentes y mezcla tipos de éxito; no se reutiliza como gate v0.3 sin adaptación.
`escoEvals/fixtures.ts` reproduce respuestas en la frontera de herramientas:
sirve para contratos, no demuestra selección del planificador real.
`escoEvals/numeros.ts` es candidato para trazabilidad numérica, pero coincidencia
numérica sola no prueba período, unidad, población ni completitud.

## Snapshot mínimo propuesto (pendiente de autorización de copia)

Propuesta: Postgres local restringido, sin conexión de salida desde el evaluador,
fuera del repositorio. No requiere rama de Supabase, proveedores ni credenciales
nuevas. El entorno concreto, retención, custodio y proyección se aprueban antes
de extraer. No se ha copiado producción ni llamado a OpenAI u otro proveedor.
D18 autoriza evaluación OpenAI sobre snapshot de fase 1; E2-06 aún debe verificar
la configuración del proyecto. No autoriza producción ni otros destinos.

Esta lista se deriva de código/migraciones locales, no del catálogo vivo. Es
candidata: reconciliar esquema real antes de exportar y registrar faltantes;
no inventar columnas ni convertir un tipo local desactualizado en autoridad.

| Dominio | Fuentes candidatas | Proyección y reglas |
| --- | --- | --- |
| Común | lotes, sublotes, tipos_tareas | IDs, nombres y solo atributos necesarios para población/unidades; conservar claves y lotes nulos |
| Labores M2.5 | registros_trabajo, tareas | fecha_trabajo, tarea/lote, fraccion_jornal, costo_jornal registrado; fechas/estado/tipo de tarea y relaciones requeridas; excluir identidad y nómina individual |
| Aplicaciones | aplicaciones, aplicaciones_calculos, aplicaciones_productos, aplicaciones_mezclas, aplicaciones_lotes, aplicaciones_lotes_planificado, movimientos_diarios, movimientos_diarios_productos, productos | IDs/FK, fechas planeadas/ejecutadas, estado/tipo, cantidades/unidades y costos congelados requeridos; validar qué relaciones existen. aplicaciones_compras y aplicaciones_cierre solo si respaldan un imprescindible; no valoración histórica con precio actual |
| Monitoreo | monitoreos, rondas_monitoreo, plagas_enfermedades_catalogo, mon_conductividad | lote/sublote, ronda/fecha, muestreados/afectados/individuos, incidencia/severidad, CE/pH/unidad; preservar ausencia y denominadores compatibles |
| Clima | clima_resumen_diario, clima_lecturas solo para casos de día abierto | station_id, fecha/timestamp, variables, unidades y marcas de calidad/frescura; histórico diario, huecos explícitos y acumuladores congelados |
| Hato | hato_animales, hato_eventos, hato_chequeo_vacas, hato_chequeos, hato_config, v_hato_estado_actual | identidad UUID, chapeta no única, ficha mínima y hechos reproductivos con fechas/confianza; congelar configuración y código del motor existente; vista materializada o definición reproducible contra el mismo corte, nunca contra tablas vivas |
| Leche | hato_pesajes_leche, hato_produccion_quincenal, proyección de fin_ingresos | pesajes por animal/fecha AM/PM/total; quincena/origen/fechas/fin_ingreso_id. Del ingreso solo id/cantidad y las columnas indispensables de vínculo; únicamente filas vinculadas a las quincenas seleccionadas, sin dinero ni otros negocios |

Mínimo para M2.5: registros_trabajo + tareas + lotes; tipos_tareas solo si el
caso lo requiere. Exportar todos los grupos del período autorizado, incluido
lote nulo; no seleccionar solo registros que pasan. Costo registrado no equivale
a costo recalculado con salarios actuales. Si costo_jornal falta, informar cobertura
y subtotal conocido, no cero ni total completo. Insumos: documentar costo de
cierre/registrado frente a estimación; aprobar la base antes de comparar.

El corte debe ser transaccional consistente (lectura REPEATABLE READ READ ONLY
en origen, o export aprobado equivalente), con UTC de extracción, zona operativa,
fecha de negocio y disponibilidad histórica distinguidas. Un snapshot actual
NO reconstruye automáticamente el estado que existía al preguntar meses atrás:
si faltan historial de captura/cambios, rebasar y versionar la pregunta y referencia
al corte actual para ambas versiones, sin afirmar replay histórico exacto.

Conservar schema hash, columnas/tipos, filas, PK duplicadas, FK rotas, nulos,
rangos/estación, bytes/hashes por tabla, filtros y motivos de proyección. Guardar
original restringido inmutable y referencias SQL separadas. Recalcular cada
referencia con SQL independiente del lector implementado y documentar diff contra
la histórica; reconciliar subtotales/total, unidades, fechas y población. Los
casos sin referencia verificable bloquean el cierre, no desaparecen.

## Fixtures e imprescindibles propuestos

El SQL sintético local cubre jornales fraccionarios, lote nulo, costo faltante,
fecha límite, agrupación reconciliada, plan/consumo sin duplicar volumen ni sumar
unidades incompatibles, incidencia ponderada, lluvia ausente y
pesaje faltante frente a cero, chapeta repetida y litros vinculados sin dinero.
No es export de producción ni fixture de la ruta A; no anticipa su gate E2-17.
SQLite es un control aritmético local, no prueba de Postgres, JWT/RLS o Data API.

| Dominio | Imprescindibles a aprobar con Santiago |
| --- | --- |
| Labores | jornales y costo registrado por lote/período, lote nulo, estado/fecha de tarea, seguimiento con cambio de lote/período |
| Aplicaciones | plan/ejecución por producto/unidad/lote, costos con base explícita, todas las partes de cruces con labores, ambigüedad |
| Monitoreo | incidencia/severidad con población comparable, ausencia distinta de cero, CE por lote/fecha y cruces sin causalidad inventada |
| Clima | observaciones con unidades y cobertura por variable, huecos, acumuladores congelados, día abierto y zona horaria |
| Hato | ficha por UUID, estado reproductivo con motor existente, presunta distinta de confirmada, pesajes sin convertir faltantes a cero, litros quincenales vía ingreso vinculado |

Seguridad sintética: gerencia/propiedad, denegación antes de leer contexto,
inyección en datos, límites de volumen/rondas y fallo de fuente/reintentos. No
hay simulación que pueda acreditarse como permiso efectivo de un servicio real.

## Handoff y gates pendientes

Preparación E2-02/E2-18 entregable; ambos frentes permanecen abiertos. Falta
materializar original y hash, revisión semántica/scope y veredicto inferido,
ratificar imprescindibles, autorizar entorno/proyección/copia del snapshot,
congelarlo y recalcular referencias. Santiago conserva escritura del held-out;
Dotor custodia y evalúa por separado. M2/M2.5 y E2-06 conservan sus gates.
No hay corrida de modelos, comparación contra v295, PR, publicación ni despliegue.
