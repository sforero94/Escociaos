# Lote transversal de evidencia — candidato local

Estado: revisión local, sin publicación, integración remota ni despliegue. Base de trabajo: `76f9b77686248f48bee263ee2c53f90c62e46563`. El baseline online reportado por el coordinador es v290; este ejecutor no volvió a consultar producción.

## Garantías y superficies

El contrato v1 y su registro cerrado distinguen métrica, población, identidad canónica, período/base/reloj, unidad/denominador, origen registrado/planeado/derivado, cobertura de población y de valores, y consistencia observada. Un envelope no concede permisos. Solo los puertos del servidor construyen pruebas; argumentos y metadatos del modelo no las crean.

Las lecturas paginadas usan conteos exactos estables, orden único, páginas de 200 y techo de 20.000 filas. Duplicados, páginas inconsistentes o conteos ausentes no se convierten en totales. Esto no es una transacción ni un snapshot atómico: una mutación concurrente con igual conteo puede pasar inadvertida.

El compositor ignora prosa factual del modelo, tanto en retorno normal como en fallback. Conserva partes verificadas cuando falla otra fuente y no completa desconocidos con cero, estimaciones o texto anterior. Conflictos actuales de un mismo hecho se muestran como no verificables. El detalle visible tiene un máximo explícito de 200 hechos; no se anuncia como exhaustivo al omitir filas.

| Familia | Cobertura del lote | Límites explícitos |
| --- | --- | --- |
| Trabajo | Jornales y costo histórico registrado por lote; fracciones y costo ya registrado, sin prorratear el promedio global | No calcula remuneración actual ni vuelve a multiplicar un costo histórico ya fraccionado. Filtros no soportados no se ignoran. |
| Inventario | Productos activos, identidad y unidad por producto, saldo/mínimo y conteo del universo filtrado | No suma unidades incompatibles ni interpreta un saldo como recepción física. Detalle y conteo tienen cobertura independiente. |
| Lluvia | Lluvia observada verificable y días sin observación por estación y período | Ausencia no significa día seco. No suma estaciones como si fueran una, ni certifica captura física completa, causalidad o pronóstico. |
| Aplicaciones | Estado/fechas registrados, comparación literal de fechas y cohorte validada; conserva el renderer previo de consumos/trabajo/estimación explícita | No infiere satisfacción, retrasos, causas, cumplimiento físico o equivalencia entre dosis y consumo. Gramática y selección siguen acotadas; no hay garantía de comprensión general. |
| Leche | Conteo, suma exacta de litros fuente y media por pesaje observado, global y por UUID | No reconstruye volumen desde medias redondeadas. Media no representable exactamente queda desconocida. Conserva hasta cuatro perfiles, ordenados por media exacta conocida; la omisión y posibles empates restantes son explícitos. No sustituye producción quincenal vendida por observaciones de pesaje. |
| Finanzas | Montos COP registrados de gastos Confirmados e ingresos, separados; filtro de negocio canónico cuando es resoluble | No acredita cobro/pago, caja, recepción, utilidad ni conciliación. Ganado, búsqueda por descripción y contabilidad integral no se reinterpretan como estos dos ledgers. |

Los filtros de producto, lote, negocio e individuo deben concordar con selectores actuales y catálogos autorizados; referencias individuales no se heredan desde prosa del asistente. Períodos relativos usan el timestamp del usuario previo únicamente cuando está ligado al mensaje del servidor. Una coincidencia de texto repetido no identifica el turno actual. La hora de referencia del turno queda fijada al inicio en Bogotá.

## Minimización y acceso

- Antes del primer envío y de cada envío posterior se construyen sistema fresco y pregunta actual. No se reconstruyen memorias, respuestas, resultados ni metadata histórica como contexto del modelo. El servidor puede conservar preguntas previas para resolver un alcance y un handle opaco de cohorte para reconsulta.
- Antes de leer datos agregados se seleccionan columnas mínimas: sin empleados, salarios, observaciones ni detalle individual. `get_employee_activity` no figura en el catálogo agregado y una propuesta del modelo no lo habilita.
- Una consulta individual exige selector literal actual, categoría explícita y coincidencia canónica única. Pedir salario no consulta actividad, lotes ni costos. Los comandos explícitos de memoria propia se mantienen aislados; olvidar confirma estado/conteo sin reenviar contenido almacenado.
- Persistencia, eventos y tool results se reconstruyen mediante listas positivas. No se borra historia almacenada ni se modifican registros de negocio. Los gráficos, búsquedas externas y scripts no reciben contexto personal por una propuesta del modelo.

| Canal | Gates existentes conservados | Evidencia local y límite |
| --- | --- | --- |
| Web | JWT de Auth, usuario con rol Gerencia y propiedad de conversación antes de acceder a datos | Pruebas cerradas del handler para denegaciones. El gate preexistente no revalida `usuarios.activo`; no se añadió política nueva. |
| Telegram | Cuenta Telegram activa, módulo consultas y vínculo de usuario antes del loop | Inspección de código/AST y loop compartido con transporte cerrado. No se simuló el webhook completo ni se añadió revalidación de rol/activo del usuario vinculado. |

La operación comparte fincas como ubicaciones; este lote no crea tenancy. Las consultas usan el cliente administrativo existente detrás de los gates: no se afirma que service role herede RLS del usuario.

## Exclusiones que requieren disposición antes de activar

Las rutas legacy sin adaptador o proyección positiva aprobados se detienen **antes del I/O**. No se permite que un error habilite prosa factual libre. Esto evita leer datos personales innecesarios, pero reduce temporalmente la superficie de Esco: monitoreo/informes, producción y despachos agrícolas, compras/movimientos/conciliaciones, tareas detalladas, ganado, P&G/presupuestos y otros lectores no enumerados arriba no quedan certificados por este lote. El catálogo de herramientas legado aún contiene esos nombres; su presencia no prueba que la ruta esté habilitada.

Esta es una exclusión de cobertura material para revisión del coordinador, no una aceptación de regresión funcional ni una afirmación de Faithfulness completo. Antes de activar hay que aceptar explícitamente el lote acotado o completar las proyecciones de las operaciones necesarias. Las preguntas mixtas conservan las partes cubiertas efectivamente consultadas; una parte omitida por la selección semántica del modelo todavía puede fallar utilidad.

## Validación y límites de evidencia

Se preservan controles sintéticos de costos desiguales con iguales jornales, fracciones, nulos/ceros, vacío verificado, detalle parcial, tercera página, duplicados, homónimos/UUID, unidades, períodos contradictorios, partes mixtas, permisos, fallback, memoria y payloads completos. Los casos de producción no se copiaron a fixtures.

El replay HTTP sigue rechazando URL/método/query/body/header no coincidentes, escritura, redirects y destinos no listados. Ejecuta ambos finalizadores y conserva fallos sticky; los hashes de request se actualizaron para el protocolo revisado de una sola generación de planificación y respuestas deterministas. Un control de contradicción usa una fuente sintética equivocada; una prosa equivocada descartada no se presenta como aceptación de calidad del modelo.

Los checks locales de TypeScript corresponden a la configuración del repositorio; Vitest importa el runtime real con HTTP cerrado. No se ejecutó Supabase CLI/Deno typecheck, Auth/PostgREST real nuevo, bot real, modelo externo ni campaña online. La revisión de permisos no amplía acceso existente. Las pruebas sintéticas no acreditan mejora factual online, snapshot, verdad física ni calibración. Los anchors combinados del harness existente tampoco prueban por sí solos atribución por entidad ni todas las restricciones must/must_not; este lote usa aserciones directas por identidad, valor, unidad, período y procedencia, sin cambiar etiquetas históricas ni medición v1.1.

Los controles one-shot de release, sus pins y guards no fueron repineados para aceptar este runtime. Un eventual despliegue necesita su procedimiento revisado y ventana coordinada. No hay autoridad de publicación o despliegue en esta entrega local.

## Propiedad de archivos

- Integrador: `escoEvidencia`, `escoDispatcherVerificado`, `escoTurnoVerificado`, `escoRespuesta`, `escoProyeccionLegada`, `chat.tsx`, builders de canal, script de sync y espejos.
- A: `escoHechosTrabajo`, ampliación de `escoAplicacionHechos`, `escoSolicitudIndividual` y pruebas de acceso/aplicaciones.
- B: `escoHechosInventario`, `escoPoliticaDatos`, `escoHechosRegistros` y pruebas de inventario/leche/registros.
- C: `escoAlcance`, `escoCobertura`, `escoHechosClima`, `escoClimaCalidad` y pruebas de tiempo/contexto/privacidad.
- Revisión independiente: probes de wiring, estado, identidad, minimización y partes financieras; sin cambios de runtime por el revisor.
