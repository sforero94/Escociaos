# P3 Task 2: inventario de aplicaciones y fuentes de lectura

Fecha: 2026-11-04. Base verificada: `main` `095a5c50` (PR #419).
Autoridad: continuación P3 autorizada por Santiago; contrato aprobado en
[p3-source-contract.md](p3-source-contract.md). Este documento fija decisiones técnicas
para Task 2; no cambia D34–D37 ni amplía permisos. Otra sesión gestiona el redeploy de v4.
Esta tarea no consulta producción, no hace llamadas pagadas, no despliega y no abre held-out.

## Capacidad de esta tarea

Leer/listar aplicaciones visibles en un intervalo inclusivo por una base explícita y
mostrar su estado **actual**. Bases cerradas: inicio planeado, fecha de movimiento ejecutado
y fecha de cierre operativo registrada. Son las fuentes de la sección 1 del contrato aprobado.
Una solicitud sin base precisa recibe aclaración; cierre administrativo recibe disposición
no soportada, porque el contrato no aporta ese instante. No inferir estado histórico, períodos
de solapamiento ni fecha de creación. No usar inicio/fin de ejecución como sustituto de movimiento.
No heredar el recorte laboral a hoy: las tres bases seleccionan las fechas registradas dentro
del intervalo pedido, incluidas fechas futuras. Un movimiento fechado en el futuro se presenta
como un movimiento con esa fecha registrada, con aviso; no prueba que el trabajo ya ocurrió.
Las fechas futuras de inicio planeado permanecen. La fecha operativa de cierre y el estado
actual no prueban instante administrativo ni estado histórico.

Quedan para Task 3/4: cantidades de productos o recipientes, cálculo exacto del plan, costos,
agregados laborales, faltantes, y conversiones. No cargar esas columnas anticipadamente.
El registro del planner solo anuncia capacidades que esta tarea realmente ejecuta.

## Alternativas y elección de representación

1. Cambiar `Plan.consultas` de labores a una unión general obligaría a reinterpretar cada
   acceso laboral existente y cada estado guardado. Mezclar tipos sin discriminante también
   permitiría resolver una consulta de aplicaciones como si fuera labor.
2. Crear planes distintos para aplicaciones puras y consultas mixtas duplicaría caminos de
   orquestación, render y estado. La conducta de una misma consulta cambiaría al añadirle una parte.
3. **Elegida:** conservar `tipo: 'consultas'` y `consultas: ConsultaLabores[]` del plan exclusivamente
   laboral. Añadir una sola rama `tipo: 'operaciones'` con una lista ordenada y cerrada de
   `{tipo: 'labores', consulta: ConsultaLabores}` o
   `{tipo: 'aplicaciones', consulta: ConsultaAplicaciones}`. Todo plan que incluya aplicaciones
   usa esa rama, aun si es de una sola parte. Un helper pequeño normaliza/despacha operaciones;
   no admite tablas, SQL, joins, expresiones ni un lenguaje general de consultas.

El registro sigue siendo la fuente única del esquema y validador. La nueva herramienta
`consultar_aplicaciones` acepta únicamente período, base de fecha, filtros de IDs/textos de
aplicación y estados actuales cerrados; no incorpora métricas de Task 3/4. Argumentos concretos:
`{desde,hasta,base_fecha,estados?,aplicacion_ids?,aplicaciones?}`, donde base_fecha es uno de
`fecha_inicio_planeada|fecha_movimiento|fecha_cierre_operativo|sin_precisar|cierre_administrativo`,
estados solo acepta `Calculada|En ejecución|Cerrada`, `aplicacion_ids` contiene UUIDs visibles
y `aplicaciones` textos resueltos por código/nombre contra el catálogo autorizado. `sin_precisar` y
`cierre_administrativo` son intenciones tipadas, no bases ejecutables que puedan caer a un default.
Máximo cuatro obligaciones por turno, sumando todos los dominios. Cada una conserva su `pN`
y su posición original, incluida una parte que necesita aclaración o no puede leer su fuente.

El resultado de aplicación es un tipo propio discriminado, con estado/disposición, consulta,
miembros/filas por ID, conteo conocido o NULL, exclusiones y procedencia. No fabricar métricas,
filas ni cobertura de labor con cero para encajarlo en `ResultadoParte`. El resultado laboral
conserva su forma en runtime; los consumidores comunes estrechan la unión antes de tocar campos
de un dominio. Ajustes de tipos en pruebas no cambian sus expectativas de negocio.

## Lectores y disponibilidad independientes por dominio

Extender la fuente mediante métodos específicos de aplicaciones, opcionales para compatibilidad
con fixtures/adaptadores laborales anteriores. La ausencia de un método es **no leído**, no tabla
vacía. El catálogo de aplicaciones guarda todas sus filas autorizadas, incluidas `tarea_id: null`;
el adaptador laboral antiguo que omite aplicaciones sin tarea no es el inventario nuevo.

- Catálogo/inventario padre: columnas de aplicaciones de la sección 1 del contrato.
- Ejecución: únicamente `movimientos_diarios.id,aplicacion_id,lote_id,fecha_movimiento`.
- Cierre: únicamente `aplicaciones_cierre.id,aplicacion_id,fecha_cierre`.
- Mismo cliente creado con JWT verificado por `autorizarGerencia`. No cliente de navegador,
  service role, lectura administrativa, nueva RPC ni política.
- Columnas literales, orden estable por ID, paginación de conteo exacto, rechazo de duplicados
  e IDs malformados, referencias y fechas válidas. Un recorte o lectura fallida no acredita vacío.
- Filtrar/intersectar hijos con IDs de padres visibles antes de ejecutarlos o presentarlos.
  La política permisiva de una hija no autoriza a revelar un padre que el JWT no puede leer.
  Si se usa `in`, son IDs resueltos por código contra ese catálogo, nunca un fragmento del modelo.
- Una misma aplicación con varios movimientos en el período entra una sola vez. La fecha de
  movimiento selecciona membresía; no implica estado actual «En ejecución».

Las fuentes de labores y aplicaciones son independientes, con lectura de aplicaciones bajo demanda.
El núcleo intenta primero el catálogo laboral existente. Si está disponible, el planner recibe
ese catálogo y puede pasar los nombres/códigos de aplicación dichos por el usuario literalmente;
no necesita conocer previamente el catálogo de aplicaciones ni puede inventar IDs. El lector de
aplicaciones se invoca después del plan para la base solicitada y el ejecutor determinista
resuelve las identidades contra los padres visibles. No se hace una lectura nueva de inventario
por cada turno laboral únicamente para ampliar el contexto del modelo.

Si el catálogo laboral falla, una lectura de aplicaciones permite comprobar si queda un dominio
consultable antes de gastar una llamada de planner. Esa lectura se reutiliza cuando coincide
con la base solicitada. Que tareas/tipos/lotes no se puedan leer no impide listar aplicaciones;
que aplicaciones o sus hijos fallen no borra una respuesta laboral independiente. El catálogo
laboral vacío de reemplazo es solo contexto de planificación: su bandera no disponible bloquea
cualquier ejecución laboral factual. Cada obligación valida la disponibilidad de su propio
dominio antes de resolver filtros o computar miembros.

Validar selección antes de filtros que oculten un campo requerido no leído. Fecha NULL es una
exclusión contada «sin fecha registrada»; campo de fecha no leído impide acreditar la selección.
Cierre sin fila y relación de cierre no leída son estados distintos. Estado actual NULL se
muestra «sin estado registrado»; ausente se muestra como no leído. Metadatos opcionales
faltantes no borran membresía demostrada por otra base completa. `Calculada` se presenta como
«Planificada», conservando el enum como dato. No filtrar lotes activos ni aplicaciones cerradas
implícitamente. Fuente de tablas separadas: `lecturas_independientes`, sin garantía atómica.

## Conversación, multipart y formato

Preservar PR #419: últimos seis mensajes cliente llegan al planner para interpretar referencias
y mantener período/filtros al seguir una consulta. No son evidencia de datos, permiso ni respuesta
a una aclaración pendiente. Preservar máximo dos llamadas de planner solo ante plan inválido,
ningún reintento de error de transporte y cero compositor factual.

Extender el estado validado con una unión tipada de pendientes: D26 laboral y elección de base
de fecha de aplicación; identidad ambigua puede mantener `no_resuelto` con sugerencias cerradas,
sin añadir otro tipo de pendiente o aceptar elección por texto libre. Cada pendiente
conserva la consulta original, opciones exactas y posición global de obligación. No renumerar
`pN` al extraer consultas laborales para la regla D26. Mapear índices/decisiones al volver a la
lista original; una opción laboral no puede convertirse en opción de aplicación o viceversa.

El validador de estado ya no puede serializar todas las consultas como `consultar_labores`:
valida cada operación con su herramienta correcta en el registro cerrado. Tokens siguen opacos,
ligados al dueño, con los límites actuales de TTL/tamaño/capacidad. No se cambia secreto ni
persistencia. Solo un ID exacto ofrecido y guardado resuelve el pendiente; texto libre conserva
opciones y pide elegir, sin replanning. Referencias se revalidan al ejecutar. No aceptar estado
ni IDs fuera del catálogo por venir del historial. Error de fuente en una parte no borra otras.

El renderer canónico despacha por discriminante y conserva el orden de las obligaciones.
Las aplicaciones muestran cantidad de miembros solo cuando está conocida, fechas/base explícita,
estado actual, exclusiones y población visible. Conteo NULL en fuente no disponible, aclaración,
no soportada o identidad no resuelta; cero solo para conjunto verificado vacío. Con filtro
de estado, los NULL de estado que satisfacen el resto del alcance se cuentan como excluidos
«sin estado registrado»; no se omiten silenciosamente ni se acredita una población de estado
completa. Un estado no leído requerido por el filtro impide esa selección. Nombres/modelo
no son títulos factuales libres. El HTTP handler usa la misma regeneración/validación final
para resultados mixtos que para los laborales. Reutilizar formatos de fecha/dinero y escaping
existentes; aquí no se añaden cifras monetarias.

## Verificación de salida

Backend: validación de herramienta, tipos, lectores y ejecución puros escritos primero.
QA separada: tablas sintéticas/oráculos literales y handler real, red denegada. Cubrir las tres
bases, inclusividad/Bogotá, duplicación de movimientos, estado actual frente a pasado, NULL/
no leído/vacío/sin cierre, nombres repetidos e ID, aplicación sin tarea, padre invisible/hijo
visible, paginación completa y truncada, falla aislada por dominio y multipart con pendientes.
Probar D26 junto a aplicaciones sin perder posición, token/cambio de dueño, opciones exactas,
texto libre sin planner, y continuidad de historial #419. Repetir la suite laboral existente.

Coordinador ejecuta `npm test`, `tsc --noEmit`, `npm run lint`, informa conteos y gasto USD 0.
PR acotado contra main vigente y `verificacion` verde. Merge requiere aprobación de revisión
de Santiago o Claude Code. No hay significado esencial pendiente: bases ambiguas se aclaran,
y las fuentes/alcance faltantes mantienen su disposición. Si implementarlo empieza a requerir
más de dos casos especiales por forma de pregunta o un lenguaje general, detener y reportar.
