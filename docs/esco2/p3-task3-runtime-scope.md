# P3 Task 3: cantidades planeadas y registradas por producto/lote

Fecha: 2026-11-04. Base: Task 2 `bd7f910f`, sobre `main` `cf1bfa77`.
Santiago autorizó continuar Task 3 y revisar Task 2/3 juntas: PR de Task 3 contra la rama de
Task 2 para mostrar solo este incremento; retarget a main tras integrar Task 2. No se fusiona
sin aprobación de revisión de Santiago o Claude Code y CI `verificacion` verde.
El contrato aprobado [p3-source-contract.md](p3-source-contract.md) manda. Su precisión de plan
exacto con dosis y árboles guardados, «sin dato» si falta la base, no se reabre.
No producción, deploy, migración, secretos, held-out, `e2e-local.ts` ni llamadas pagadas en esta
tarea. El chequeo de desarrollo espera al cierre completo de P3. Task 4 sigue fuera de alcance:
sin costos, agregados laborales, precios/stock ni faltantes.

## Interfaz cerrada y composición

Elegida una operación nueva, no métricas adicionales dentro del inventario de Task 2 ni un
lenguaje de relaciones entre partes:

```text
consultar_cantidades_aplicacion({
  aplicacion_id?: UUID,
  aplicacion?: string,
  desde?: YYYY-MM-DD,
  hasta?: YYYY-MM-DD
})
```

Exactamente un selector de aplicación, por ID o texto. El texto reutiliza la resolución de
Task 2: primero igualdad normalizada de nombre/código, después coincidencia parcial única;
no se eliminan cifras/puntuación del código. Sin coincidencia o con varias: `no_resuelto`,
pedir código/ID sin elegir por intuición. Sin selector, el planner pide aclarar la aplicación.
No se añade selección implícita de «todas», lote/producto como filtros, join textual, referencia
a otra parte del plan. El planner puede interpretar una referencia conversacional e heredar
el selector de aplicación o período explícito de ejecución; después el selector se resuelve
por igualdad/coincidencia única contra el catálogo visible del JWT. El historial no acredita
identidad factual, permisos ni una respuesta exacta a un pending tipado (se conserva #419).

`desde`/`hasta` aparecen juntos o ninguno; fechas calendario válidas e inclusivas. El período
filtra **solo ejecución por `movimientos_diarios.fecha_movimiento`**. Sin período se leen los
movimientos de vida completa de la aplicación. El **plan completo guardado** no se recorta por
ese período y siempre lo dice. Nunca heredar recorte laboral a hoy; fechas futuras se señalan
como registradas, sin asegurar que el trabajo ya ocurrió. No usar fecha de creación o cierre.

Añadir `cantidades_aplicacion` a la unión cerrada de operaciones/resultados de Task 2. Mantener
máximo cuatro partes globales, orden `pN`, validación única del registro, estado caller-bound,
D26 y elección de fecha del inventario. El validador de estado serializa esta operación con su
herramienta correcta. No incorpora otro pending ni cambio de transporte. Los últimos seis
mensajes siguen ayudando al planner bajo #419, sin autorizar elecciones ni cifras.

## Fuente fija y autorización

Método opcional específico de cantidades en la fuente de aplicaciones, compatible con adaptadores
Task 2 anteriores. Ausencia del método equivale a fuente no leída. Usar el mismo cliente de
JWT verificado por Gerencia activa. Primero resolver la aplicación contra los padres visibles;
solo después leer sus hijos. Una aplicación sin `tarea_id` sigue siendo consultable.

Columnas ya verificadas contra el catálogo en vivo durante Task 1; aquí no se hacen nuevas
lecturas productivas ni se usa `src/types/database.ts` como fuente de esquema:

- Padres: proyección mínima de inventario Task 2, con ID, nombre/código y tipo.
- `aplicaciones_calculos`: `id,aplicacion_id,lote_id,mezcla_id,total_arboles,numero_canecas,
  litros_mezcla,numero_bultos,kilos_totales`.
- `aplicaciones_lotes`: `id,aplicacion_id,lote_id,arboles_grandes,arboles_medianos,
  arboles_pequenos,arboles_clonales,total_arboles,calibracion_litros_arbol,tamano_caneca`.
- `aplicaciones_mezclas`: `id,aplicacion_id,numero_mezcla,nombre_mezcla`.
- `aplicaciones_productos`: `id,mezcla_id,producto_id,producto_nombre,producto_unidad,
  cantidad_total_necesaria,dosis_por_caneca,unidad_dosis,dosis_grandes,dosis_medianos,
  dosis_pequenos,dosis_clonales`.
- `movimientos_diarios`: `id,aplicacion_id,lote_id,fecha_movimiento,numero_canecas,numero_bultos`.
- `movimientos_diarios_productos`: `id,movimiento_diario_id,producto_id,producto_nombre,
  cantidad_utilizada,unidad`.
- `lotes.id,nombre` solo para etiquetas visibles. Un nombre no reemplaza un ID ni trae
  árboles actuales para completar la base de plan guardada.

Proyecciones literales, paginación/conteo exacto, IDs únicos y referencias válidas. Mezclas y
cálculos deben pertenecer a la misma aplicación; productos solo a mezclas autorizadas; hijos de
movimiento solo a movimientos autorizados. No leer `aplicaciones_lotes_planificado`,
`aplicaciones_compras`, cuadrillas, costos o productos de inventario. La política permisiva de
un hijo no revela su padre oculto. Datos leídos por separado conservan `lecturas_independientes`.

Cada relación conserva disponibilidad propia. Un error de plan no borra ejecución legible, ni
un error de movimientos/productos borra plan legible. Un error de cantidades no borra partes
independientes de inventario/labores. No convertir ausencia de método, error, campo omitido,
valor inválido o truncamiento en lista vacía o número cero.

## Reutilización exacta del cálculo original

`src/utils/calculosAplicaciones.ts` tiene solamente imports de tipos; una importación TypeScript
en Node y dos invocaciones sintéticas mínimas se verificaron sin entorno de navegador ni red.
Reutilizar sus funciones reales `calcularFumigacion` (también Drench) y `calcularFertilizacion`.
No importar el hook del Reporte ni `aplicacionesReales.ts` para alcanzar una función pura.

Las firmas originales exigen campos de UI que las fórmulas no leen (área, categoría, nombre/
orden de mezcla, etc.). Se autoriza en esta tarea un cambio **solo de tipos de parámetros** en
esas dos funciones, a interfaces/Picks estructurales de lo realmente consumido. Los cuerpos,
orden de operaciones, constantes y redondeos originales quedan intactos. Los objetos más
amplios de los consumidores existentes siguen siendo compatibles. No inventar esos metadatos,
no usar cast para fabricar una entrada completa y no copiar fórmulas a un motor paralelo.

Antes de invocar, validar base guardada completa, números finitos/no negativos y capacidad
positiva. Los defaults `|| 0` y 200 L del motor nunca completan NULL/ausente. Validar coherencia
de conteo guardado por clase/total y cálculo/lote; discrepancia no se sustituye por árboles de hoy.
La relación mezcla→lote es exclusivamente `aplicaciones_calculos.mezcla_id`. Si falta, mostrar
«sin dato para el plan exacto» del alcance afectado; conservar cantidad guardada por lote y
totales guardados de mezcla, sin inventar presencia de cada producto en ese lote.

- **Fumigación/Drench:** total guardado de árboles × calibración guardada / capacidad guardada,
  luego dosis guardada por caneca / 1.000. Unidad de dosis `cc` debe producir L y `gramos` kg,
  compatible con `producto_unidad`. Reutilizar el motor sin partir de canecas ya redondeadas.
  **Revisión 2026-11-05 (decisión de Santiago):** una dosis `cc` sobre un producto en kg, o
  `g`/`gramos` sobre uno en L, se calcula como la calculadora (1 cc = 1 g) y la respuesta lo
  declara con el nombre del producto (`plan.avisos`). En datos vivos, 14 de 15 de esos
  productos cuadran así con su total guardado. `Unidades` u otra unidad de dosis sigue
  incompatible.
- **Fertilización:** cada clase guardada de árboles × su dosis guardada / 1.000, por producto.
  `unidad_dosis` NULL es normal en esta rama; kg o L provienen de `producto_unidad` (dosis
  originales en gramos o cc respectivamente). `Unidades` no autoriza aplicar esa conversión.
  El motor redondea cantidades de producto hacia arriba a dos decimales; se conserva ese orden.
- **Unidades distintas:** no sumar kg con L ni con unidades. En particular, el motor de
  Fertilización suma productos sin comprobar dimensión para sus `kilos_totales`/bultos:
  reutilizar sus **salidas por producto**, nunca acreditar ese escalar como total físico de
  una mezcla de kg y L. Los recipientes/mezcla almacenados en `aplicaciones_calculos` van
  aparte, rotulados guardados; no necesitan rederivarse para contestar productos por lote.

No prorratear por canecas, bultos, árboles totales ni partes iguales. El dato de producto que
se repite en varias mezclas entra una vez por fila/mix; su aporte por lote se calcula solo
con la mezcla asignada. Acumular por ID de lote/producto/unidad, sin `Map.set` que sobrescriba
aportes ni join a todos los lotes que multiplique el total de mezcla.

## Resultado, conciliación y estados

Resultado distinto `tipo: 'cantidades_aplicacion'`, con consulta, aplicación resuelta, lados de
plan/ejecución con disponibilidad propia y listas de producto/lote/unidad. Cada cantidad lleva
número conocido o NULL y un estado/motivo cerrado. NULL registrado, campo no leído, base inválida,
mapeo ausente y conjunto sin filas no se confunden. Cero explícito válido permanece cero.
No fabricar `jornales: 0`, costo ni conteos laborales para reutilizar un envelope ajeno.

Plan tiene tres evidencias separadas: cantidades guardadas de mezcla, cantidades exactas
reconstruidas por producto/lote y conciliación por mezcla/producto/unidad. Una conciliación
completa suma las salidas del mismo motor de los lotes mapeados y las compara con
`cantidad_total_necesaria` guardada. Si difieren, mostrar ambas bases rotuladas y
**discrepancia**, sin escalar, recortar ni repartir la diferencia para forzar igualdad. Si falta
base, la conciliación queda no comprobable; una suma parcial nunca se rotula total completo.
Los totales guardados sobreviven como evidencia guardada, no como prueba de ese desglose.
La comparación no introduce tolerancia de negocio ni redondea el total guardado: igualdad
exacta decimal o margen de precisión flotante escalado a los operandos y número real de
aportes (p. ej. `Number.EPSILON * (n + 1) * max(abs(guardado), sum(abs(aportes)))`, con
operandos y suma finitos). Ese margen solo cubre residuos de aritmética binaria, como
`0.1 + 0.2` frente a `0.3`; no usar un umbral fijo como `1e-8` o `0.01` que ocultaría
una discrepancia registrada fina. Las cantidades guardadas permanecen sin redondeo añadido;
el formato visual no decide si las fuentes coinciden.

**Revisión 2026-11-05 — reemplaza el párrafo anterior en dos puntos.** (1) El margen es un paso
de redondeo de la calculadora, `0,01`, más el residuo flotante: el propio total guardado sale de
`Math.ceil(suma * 100) / 100`, y una suma binaria como 12,340000000000002 se guarda como 12,35.
En datos vivos, 10 de las 18 discrepancias eran exactamente ese paso. (2) Si una mezcla/producto
no cuadra, sus filas por lote **no se publican como plan exacto** (estado `no_concilia`): se
muestran el total guardado y el cálculo por lote, sin ajustar la diferencia. Caso que lo obliga:
una fertilización guardó la dosis en kg por árbol, el motor divide por 1.000 y cada lote salía
como plan exacto 1.000 veces menor.

Ejecución suma cada ID de hijo una sola vez por su producto/lote/unidad y período. No se une
con mezclas para agregar ni con el plan para sumar. Productos ejecutados sin plan y lotes con
solo una de las dos capas permanecen visibles por separado. Fecha no leída que pueda afectar
selección impide certificar la parte; fecha NULL registrada tiene exclusión explícita.

Estados de presentación mínimos:

- Sin filas de plan tras lectura completa: «sin plan registrado», nunca plan cero.
- Sin movimientos completos en el alcance: «sin movimientos registrados».
- Movimiento leído sin hijos de producto: «sin productos registrados en esos movimientos»;
  no afirmar cero consumo real. Conjunto de hijos no leído: «no pude leer los productos».
- Cantidad/dosis/árbol requerido NULL: «sin dato registrado»; omitido: «dato no leído».
- La misma distinción de estado se publica en totales guardados, recipientes y litros/kg de
  mezcla guardados; no se omite una cifra desconocida ni se usa «no disponible» para todos
  esos estados. Mapeo mezcla NULL, mapeo no leído y referencia no verificable llevan avisos
  distintos generados desde motivos cerrados, sin texto arbitrario del modelo o de errores.
- Unidad incompatible o base inválida: no presentar una cantidad calculada como válida.
- Lado parcial: mostrar solo las cifras conocidas con alcance parcial, sin total completo ni
  delta/porcentaje que necesite el lado desconocido. Error en un lado no elimina el otro.

Renderer español canónico, etiquetas/cifras generadas por código, escaping y formato existentes.
Mostrar plan completo guardado frente a ejecución de vida completa/período explícito, unidades,
estados y procedencia. Los lotes/productos con etiquetas visualmente repetidas se distinguen
por sus IDs en las filas publicadas, además de conservarse separados en el resultado estructurado.
No producir total plan+ejecución. Recipientes se rotulan como tales,
separados de kg/L por producto, sin convertir capacidad/peso no leído a un default.

## Puertas de QA y entrega

QA independiente prepara fixtures y oráculos de tablas antes del código, con positivas y
mutaciones: ID cambiado por nombre, repetición de producto entre mezclas, fan-out a lotes,
sobrescritura entre mezclas, prorrateo incorrecto por bultos, plan sumado a ejecución, fuente
parcial convertida a cero, mezcla kg/L sumada como kilos, inconsistencia entre total guardado y
reconstruido, NULL/unread, producto/lote solo ejecutado, padre invisible/hijo permisivo,
paginación, fechas inclusivas/Bogotá y Drench con unidades líquidas. Pruebas de importación y
paridad con los motores originales; separación de cualquier error de cantidades de una parte
laboral/inventario respondible. Las mutaciones monetarias/laborales/faltantes de P3 completo
siguen pendientes de Task 4, no se declaran cubiertas por esta tarea.

Coordinador vuelve a correr suites reportadas, `npm test`, `tsc --noEmit`, `npm run lint` y
reporta conteos, gasto USD 0 y dudas. PR apilado con diff solo de Task 3 por la autorización
expresa de Santiago, sin merge ni deploy. Detenerse si una forma de pregunta pide más de dos
casos especiales o un lenguaje general de consultas. No hay una nueva decisión de negocio
pendiente para este corte: las bases faltantes permanecen explícitamente sin dato.
