# QA — SOW 6: verificación adversarial del rework de Producción (Hato Lechero)

**Ruta bajo prueba:** `/hato-lechero/produccion` · **Contrato:** `docs/plan_hato_produccion_rework.md`
**Escrito:** 2026-07-28, **antes** de que aterrice SOW 0/1/2 — estos criterios son el objetivo de TDD
para los tres agentes backend, no una reconstrucción de lo que construyeron.
**Inputs leídos:** `CLAUDE.md` (raíz), `src/components/hato/CLAUDE.md`, `src/components/finanzas/CLAUDE.md`,
`docs/plan_hato_produccion_rework.md` completo (605 líneas), código real de `calculosPyG.ts`,
`reportes-financieros.ts`, `calculosFlujoCaja.ts`, `RoleGuard.tsx`, `calculosHato.ts` (quincenas),
`054_create_hato_leche.sql`, `useProduccionHato.ts`, `resolver.ts`/`load.ts` (import pipeline),
`docs/hato/inventario-mev-2026-07-24.md`.

**Baseline verificado antes de escribir esto:** `npx vitest run reportesFinancierosParidad hatoSchemaContract
calculosHatoParidad` → **111/111 verde** (2026-07-28). Cualquier regresión detectada después de que
SOW 0/1 aterricen es atribuible a este trabajo, no a un estado roto preexistente.

---

## 0. Ambigüedades detectadas — bandera antes de escribir criterios de más

Estas cinco no están resueltas por el brief con precisión suficiente para escribir un Given/When/Then
sin adivinar. Escribo el criterio con mi mejor interpretación (marcada `[ASUNCIÓN]`) para no bloquear a
los implementadores, pero cada una necesita confirmación del CTO/dueño antes de que SOW 6 pueda dar un
veredicto real sobre esa área. Reaparecen con más detalle en la sección adversarial (§9).

1. **¿Dónde vive "cabezas" quando `fn_hato_registrar_venta_animales` no enlaza ningún animal (N=0)?**
   Decisión 6 dice "cabezas + valor obligatorios; vínculo de animal opcional", pero §3.2 nunca dice en
   qué columna de `fin_ingresos` aterriza la cifra de cabezas cuando no hay eventos que la impliquen.
   `[ASUNCIÓN]`: aterriza en `fin_ingresos.cantidad` (unidad "cabezas"), igual patrón que litros para leche.
2. **¿Qué pasa cuando `fecha` de un ingreso ligado (medido) cruza una frontera de quincena o de mes?**
   El trigger de §3.3 se declara `AFTER UPDATE OF cantidad, valor, fecha` pero su cuerpo solo escribe
   `litros_total` — nunca `anio`/`mes`/`quincena`/`fecha_inicio`/`fecha_fin`. No está especificado si la
   quincena debe re-anclarse o si el edit debe rechazarse. `[ASUNCIÓN]`: para escribir el criterio asumo
   que el comportamiento CORRECTO es que la quincena se mueva; si el implementador decide lo contrario
   (bloquear el edit), el criterio 3.4 abajo debe reescribirse, pero **el estado actual del diseño no
   hace ninguna de las dos cosas — ver §9.1**.
3. **Mensaje del `23503` para un ingreso mensual histórico (backfill).** §2.1 da un solo mensaje ("Elimínala
   desde Producción"), pero Producción marca las filas derivadas "sin acciones" — no hay ningún lugar
   desde el que borrarlas. `[ASUNCIÓN]`: el mensaje debe distinguir el caso derivado del caso medido.
4. **Granularidad del abort en `--apply` del backfill** cuando el estado vivo divergió del plan (§5.3 paso 3):
   ¿aborta la corrida completa, o salta solo las filas divergentes y aplica el resto? `[ASUNCIÓN]`: para
   escribir 6.4 asumo abort total (más seguro, consistente con "cero SQL ad hoc" / "HUMAN CHECKPOINT").
5. **"4 periodos" en el ítem 5 de §6** — interpreto como las 4 columnas acumuladas de `periodosReporte.ts`
   (`Q1`, `Q1–Q2`, `Q1–Q3`, `Año`), confirmado en código. No es ambiguo en el código, pero el brief no lo
   nombra explícitamente — lo dejo aquí para que quede trazado.

---

## 1. Atomicidad de los 3 RPCs

### 1.1 `fn_hato_guardar_quincena_venta` — happy path
```
Given una sesión Gerencia autenticada y ninguna fila en (anio=2026, mes=7, quincena=1)
When se llama fn_hato_guardar_quincena_venta con un payload válido
  (litros=9500, valor=14000000, comprador y medio_pago_id existentes)
Then existe exactamente 1 fila nueva en fin_ingresos (negocio Hato Lechero,
  categoría leche, cantidad=9500, precio_unitario=valor/litros calculado)
  Y exactamente 1 fila nueva en hato_produccion_quincenal con
  fin_ingreso_id apuntando a esa fila, origen_dato='medido'
```

### 1.2 `fn_hato_guardar_quincena_venta` — actualizar una fila medida existente
```
Given una quincena medida ya guardada con litros=9500
When Gerencia reenvía el mismo (anio, mes, quincena) con litros=9800
Then la MISMA fila de hato_produccion_quincenal se actualiza (no se crea una segunda)
  Y la MISMA fila de fin_ingresos se actualiza (no se crea un segundo ingreso)
  Y el índice único parcial (fin_ingreso_id WHERE origen_dato='medido') sigue satisfecho
```

### 1.3 `fn_hato_guardar_quincena_venta` — fallo forzado en el segundo paso, nada persiste
```
Given una sesión Gerencia y un payload donde el primer sub-paso (insertar/actualizar
  fin_ingresos) tendría éxito pero el segundo (insertar/actualizar hato_produccion_quincenal)
  violaría un CHECK — p. ej. litros=0 o litros negativo, o quincena fuera de {1,2}
When se llama la RPC
Then la llamada retorna error Y no existe NINGUNA fila nueva en fin_ingresos
  Y no existe NINGUNA fila nueva en hato_produccion_quincenal
  (verificar con un COUNT(*) antes/después sobre ambas tablas, no solo "no truena")
```

### 1.4 `fn_hato_guardar_quincena_venta` — fallo forzado en el PRIMER paso, nada persiste
```
Given una sesión Gerencia y un payload con valor=0 (viola fin_ingresos CHECK (valor > 0))
When se llama la RPC
Then la llamada retorna error Y NO existe una fila huérfana en hato_produccion_quincenal
  (este es el caso que R-1 del brief señala como el peligroso: con fin_ingreso_id NOT NULL
  el orden obligado es ingreso-primero, así que el fallo del ingreso nunca debería dejar
  litros huérfanos — pero hay que probarlo, no asumirlo por el orden del pseudocódigo)
```

### 1.5 Escribir sobre una quincena `derivado_mensual` — rechazo explícito, atómico
```
Given una quincena con origen_dato='derivado_mensual' (post-backfill)
When Gerencia llama fn_hato_guardar_quincena_venta apuntando a ese (anio, mes, quincena)
Then la RPC lanza una excepción explícita (no un error genérico de constraint)
  Y ni la fila derivada ni su ingreso mensual cambian
  Y el ingreso mensual sigue teniendo 2 quincenas derivadas apuntándole (conteo antes == después)
```

### 1.6 `fn_hato_eliminar_quincena_venta` — happy path
```
Given una quincena medida con su ingreso enlazado
When Gerencia llama fn_hato_eliminar_quincena_venta(id)
Then la fila de hato_produccion_quincenal desaparece
  Y la fila de fin_ingresos correspondiente desaparece
  Y ningún hato_eventos queda con fin_ingreso_id apuntando a un id inexistente
    (no aplica a esta RPC directamente, pero es la comprobación de integridad referencial
    que debe correr después de cada escenario de DELETE en este documento)
```

### 1.7 `fn_hato_eliminar_quincena_venta` — condición de carrera, nada parcial
```
Given una quincena medida cuyo id se le pasa a la RPC
When, ENTRE la lectura inicial de la RPC y su UPDATE/DELETE, otra transacción ya borró esa
  misma fila (simular con dos llamadas concurrentes al mismo id, o borrando manualmente
  justo antes)
Then la segunda llamada falla con "no encontrado" y NO borra el ingreso
  (el ingreso de la primera llamada, ya borrado, no cuenta como fallo del segundo intento —
  el punto es que el segundo intento no debe borrar NADA adicional ni lanzar un error que
  oculte que ya no hay nada que hacer)
```

### 1.8 `fn_hato_eliminar_quincena_venta` — rechazo sobre fila derivada
```
Given una quincena con origen_dato='derivado_mensual'
When se llama la RPC sobre su id
Then excepción explícita, la fila derivada y su ingreso mensual siguen intactos,
  y la OTRA quincena derivada del mismo ingreso mensual (la hermana) también sigue intacta
```

### 1.9 `fn_hato_registrar_venta_animales` — happy path con animales enlazados
```
Given una sesión Gerencia, 2 animales activos, payload {tipo: 'ternero', cabezas: 2,
  valor: 900000, animal_ids: [A, B]}
When se llama la RPC
Then existe 1 fila fin_ingresos (categoría terneros, negocio Hato Lechero)
  Y existen 2 hato_eventos tipo 'venta', cada uno con fin_ingreso_id = esa fila
  Y hato_animales A y B tienen estado='vendida' y fecha_estado poblada
```

### 1.10 `fn_hato_registrar_venta_animales` — fallo a mitad de la cadena de eventos, todo o nada
```
Given un payload con 3 animal_ids donde el SEGUNDO id no existe (o ya está 'vendida' y el
  motor lo rechaza)
When se llama la RPC
Then NO existe la fila de fin_ingresos, NO existen eventos para NINGUNO de los 3 animales
  (ni siquiera para el primero, que era válido) Y ningún hato_animales cambió de estado
  — este es el caso más fácil de violar por accidente: un loop plpgsql con INSERT por
  animal necesita estar dentro de la MISMA transacción implícita de la función, no confiar
  en que "solo falló uno" es aceptable
```

### 1.11 `fn_hato_registrar_venta_animales` — N=0, sin vínculo de animal
```
Given payload {tipo: 'descarte', cabezas: 3, valor: 2100000, animal_ids: []}
When se llama la RPC
Then existe 1 fila fin_ingresos, 0 filas hato_eventos, 0 hato_animales tocados
  Y el valor de "cabezas" queda recuperable desde algún lugar de la fila creada
  (ver ambigüedad §0.1 — este criterio no puede cerrarse sin que el implementador declare
  dónde vive esa cifra; QA debe rechazar cualquier PR donde "cabezas" se pierda en silencio)
```

---

## 2. Frontera de RLS (sesión Administrador)

### 2.1 El RPC quincenal falla a nivel de base de datos, no solo de UI
```
Given una sesión autenticada con rol Administrador (JWT real, no simulado en el cliente)
When se invoca fn_hato_guardar_quincena_venta directamente (bypaseando la UI, p. ej. vía
  supabase-js .rpc() desde un script de prueba con ese JWT)
Then la llamada falla por violación de política RLS sobre fin_ingresos (INSERT/UPDATE
  Gerencia-only) — el error debe ser el de Postgres/PostgREST, no un 200 con éxito parcial
  Y no queda ninguna fila nueva en fin_ingresos NI en hato_produccion_quincenal
  (repite la garantía de atomicidad de §1, pero cruzada con RLS real — SECURITY INVOKER
  significa que no hay defensa adicional dentro de la función, así que esta prueba es la
  que realmente certifica que "no hace falta política nueva" del §2.1 del brief es cierto)
```

### 2.2 La vista de Producción carga completa para Administrador
```
Given una sesión Administrador con el módulo hato_lechero habilitado
When navega a /hato-lechero/produccion
Then la página carga sin crash y sin pantalla en blanco:
  header + chip de vejez, tracker de productividad y ranking por vaca se renderizan
  con datos reales (estas tres secciones son "todos los roles" — no dependen de fin_ingresos)
  Y no hay errores en la consola del navegador
```

### 2.3 El bloque de ventas se reemplaza por la tarjeta de permisos, nunca por una lista vacía
```
Given la misma sesión Administrador
When la sección 2 (Ventas) se renderiza
Then aparece la tarjeta "Las ventas del Hato requieren permisos de Gerencia"
  Y NO aparecen 0 barras, ni un gráfico vacío, ni un KPI en $0 — la ausencia de datos
  visibles debe ser indistinguible de "sección bloqueada", nunca de "no hubo ventas"
  Y el gate se decide por profile.rol (RoleGuard), no por el resultado (longitud) de
  ninguna query — verificar inspeccionando el código: no debe existir un
  `if (ventas.length === 0)` que produzca el mismo texto por casualidad
```

### 2.4 Ventana de carga de auth — la sección de ventas no debe "parpadear" en blanco
```
Given una sesión Administrador cuyo profile aún no resolvió (useAuth().isLoading === true,
  ventana de ~2s documentada en CLAUDE.md raíz)
When la página de Producción monta
Then durante esa ventana la sección 2 muestra un estado de carga explícito (skeleton/spinner),
  NUNCA el bloque en blanco que produce RoleGuard por defecto cuando isLoading es true
  (RoleGuard.tsx retorna `null` mientras carga — verificado en código; sin un wrapper que
  cubra esa ventana, un Administrador que recarga la página ve un hueco vacío por ~2s antes
  de que aparezca la tarjeta de "requiere Gerencia" — exactamente el "blanco silencioso"
  que la decisión 5 prohíbe, aunque sea transitorio)
```

### 2.5 `hato_produccion_quincenal` no expone dinero — ni por columna, ni por query lateral
```
Given una sesión Administrador
When se hace SELECT * sobre hato_produccion_quincenal (cualquier fila)
Then el resultado no contiene ninguna columna de dinero (no `valor`, no `precio_unitario`,
  no `comprador`, no `medio_pago`) — verificar contra el DDL real de la migración 070, no
  contra la intención del brief
  Y ADEMÁS: cualquier hook del frontend que renderice la sección de Producción para
  Administrador NO debe emitir una request de red separada a fin_ingresos para
  "reconstruir" un precio (p. ej. uniendo litros_total con un fin_ingreso_id leído del
  lado servidor) — si existe tal request, debe fallar por RLS (0 filas) y el componente
  debe manejar ese 0-filas sin intentar dividir por una cifra ausente
```

---

## 3. Bidireccionalidad

### 3.1 Editar `cantidad` en IngresoForm mueve la quincena
```
Given una quincena medida con litros_total=9500 enlazada a un ingreso con cantidad=9500
When Gerencia edita ese ingreso desde IngresoForm y cambia cantidad a 9800, guarda
Then hato_produccion_quincenal.litros_total pasa a 9800 automáticamente (sin tocar
  Producción), updated_at se actualiza, updated_by = el uid de quien editó el ingreso
  (no el creador original de la quincena)
```

### 3.2 Editar litros en Producción mueve el ingreso
```
Given la misma quincena medida
When Gerencia edita los litros desde ProduccionQuincenalForm (vía la RPC), guarda
Then fin_ingresos.cantidad y precio_unitario (recalculado) reflejan el nuevo valor
  Y IngresoForm, si se reabre esa fila, muestra la cantidad nueva sin refrescar manualmente
  ninguna caché adicional
```

### 3.3 La fila derivada del backfill NO se mueve por ninguno de los dos caminos
```
Given una quincena origen_dato='derivado_mensual' enlazada (muchos-a-uno) a un ingreso
  mensual histórico
When (a) alguien edita cantidad/valor/fecha de ese ingreso mensual desde IngresoForm
  Y (b) alguien intenta editar esa quincena desde la UI de Producción
Then en (a): el trigger corre (WHERE incluye ese fin_ingreso_id) pero su condición
  `origen_dato = 'medido'` excluye la fila derivada — litros_total de AMBAS quincenas
  derivadas de ese mensual permanece sin cambios
  Y en (b): la UI no ofrece ninguna acción de edición sobre una fila derivada (chip
  "derivado de mensual", "sin acciones" per §4.3) — y si se fuerza la RPC igual, el
  rechazo explícito de §1.5 aplica
```

### 3.4 [ASUNCIÓN §0.2] Editar `fecha` de un ingreso ligado, cruzando frontera de quincena
```
Given una quincena medida (anio=2026, mes=7, quincena=1, fecha_inicio=2026-07-01,
  fecha_fin=2026-07-15) enlazada a un ingreso con fecha=2026-07-10
When Gerencia edita la fecha del ingreso a 2026-07-20 (misma mes, cruza a quincena 2) o a
  2026-08-02 (cruza de mes)
Then el sistema hace UNA de dos cosas explícitas — nunca la tercera:
  (A) hato_produccion_quincenal.(anio, mes, quincena, fecha_inicio, fecha_fin) se re-ancla
      para seguir siendo coherente con la nueva fecha del ingreso, o
  (B) la edición de fecha sobre un ingreso enlazado se bloquea con un mensaje explícito
      ("este ingreso pertenece a una quincena del Hato; edita la fecha desde Producción")
  (C) [PROHIBIDO] litros_total se sincroniza pero anio/mes/quincena quedan apuntando al
      periodo viejo mientras fin_ingresos.fecha ya dice julio 20 — esto es exactamente la
      "divergencia" que la decisión 3 prohíbe, y es el comportamiento que el trigger tal
      como está redactado en §3.3 del brief produce hoy (ver hallazgo §9.1)
```

---

## 4. DELETE en ambos sentidos

### 4.1 Borrar la quincena desde Producción borra el ingreso
```
Given una quincena medida
When Gerencia la borra desde la UI de Producción
Then desaparece de /hato-lechero/produccion (gráfico y listado)
  Y desaparece de /finanzas/ingresos (historial)
  Y una nueva consulta a ambas tablas confirma 0 filas restantes con ese vínculo
```

### 4.2 Borrar el ingreso desde Finanzas — bloqueado, mensaje humano
```
Given el mismo ingreso enlazado (medido)
When Gerencia intenta borrarlo desde IngresosList
Then Postgres retorna 23503 (foreign_key_violation) sobre fin_ingreso_id ON DELETE RESTRICT
  Y IngresosList captura error.code === '23503' (mismo patrón que 23505 en
  useHatoToros.ts/useActualizarHatoAnimal.ts) y muestra el mensaje humano del §2.1 —
  nunca el texto crudo de Postgres, nunca un toast genérico "Error al eliminar"
```

### 4.3 [ASUNCIÓN §0.3] Borrar un ingreso mensual histórico — también bloqueado, mensaje coherente
```
Given uno de los 44 ingresos mensuales históricos, con sus 2 quincenas derivadas apuntándole
When Gerencia intenta borrarlo desde IngresosList
Then también 23503 (las 2 filas derivadas lo referencian)
  Y el mensaje mostrado NO puede decir "elimínalo desde Producción" sin calificarlo —
  Producción no ofrece ninguna acción de borrado sobre una fila derivada. El mensaje debe
  distinguir este caso (p. ej. "vinculado a quincenas derivadas de un backfill histórico;
  no se puede eliminar") o el usuario queda con instrucciones que no puede seguir
```

### 4.4 Borrar un ingreso con eventos de venta de animales — permitido, SET NULL
```
Given un ingreso de venta de terneros/descarte con 2 hato_eventos.fin_ingreso_id apuntándole
When se borra ese ingreso desde IngresosList (sin ninguna quincena involucrada, así que no
  hay RESTRICT en este camino)
Then el DELETE tiene éxito (a diferencia de 4.2/4.3 — asimetría real a probar explícitamente)
  Y los 2 hato_eventos sobreviven con fin_ingreso_id = NULL
  Y los animales enlazados SIGUEN con estado='vendida' — el borrado del registro contable
  no revive al animal en el hato
```

### 4.5 Verificación de integridad post-DELETE (corre después de cada escenario de arriba)
```
Given cualquiera de los 4 escenarios de borrado ejecutados
When se hace un barrido de integridad
Then no existe ninguna fila de hato_produccion_quincenal con fin_ingreso_id apuntando a
  un id de fin_ingresos inexistente (el FK ya lo garantiza a nivel de motor, pero se
  verifica el conteo antes/después como evidencia, no solo la ausencia de excepción)
```

---

## 5. Regresión financiera (migración 071)

### 5.1 Totales P&G idénticos, las 4 vistas × los 4 periodos
```
Given el estado de /finanzas/reportes ANTES de aplicar 071 (snapshot de
  totales.ingresos / .costos_directos / .margen_contribucion / .gastos_indirectos /
  .utilidad_operativa para Global, Aguacate Hass, Ganado, Hato Lechero × Q1, Q1–Q2,
  Q1–Q3, Año)
When se aplica 071 y se vuelve a generar el mismo reporte
Then los 5 arrays de totales son byte-idénticos en las 16 combinaciones (4 vistas × 4
  periodos) — no "aproximadamente iguales", idénticos, porque 071 no debe mover ni un peso
```

### 5.2 La línea de detalle se mueve, la suma de las dos líneas viejas = la línea nueva
```
Given la vista Hato Lechero, cualquier periodo con al menos 1 de las 6 filas "Otro"
When se compara el reporte antes/después de 071
Then la línea `ing_<categoria Otro>` pierde exactamente el valor de las filas recategorizadas
  Y aparece una línea nueva `ing_<categoria Venta de Vacas de Descarte>` con exactamente
  ese valor Y el total de la vista Hato Lechero para ese periodo no cambia
```

### 5.3 El denominador $/litro no se mueve
```
Given la vista Hato Lechero, el indicador "precio neto promedio" ($/L, calculosPyG.ts:539
  equivalente / indicadores)
When se compara antes/después de 071
Then el valor es idéntico en las 4 columnas — construir un caso de prueba donde, si alguien
  en el futuro renombra "Venta de Vacas de Descarte" a algo que matchee /leche/i por
  accidente, el test de regresión (no solo esta corrida manual) debe fallar. Este es un
  guard permanente, no una verificación de un solo uso: agregar un assert en
  reportesFinancierosParidad.test.ts (o un test nuevo) que falle si
  fin_categorias_ingresos contiene una categoría del Hato distinta de la de leche cuyo
  nombre matchea /leche/i
```

### 5.4 Flujo de Caja — mismo total, MISMA verificación de línea (no "no aplica")
```
Given que calculosFlujoCaja.ts SÍ lee categoria_id/categoria_nombre para construir el id y
  la etiqueta de la línea de entrada (verificado en código, líneas ~76-80 — contradice la
  premisa del brief §2.2 de que "el Flujo de Caja ni siquiera lee la categoría", ver §9.3)
When se compara el Flujo de Caja (12 meses calendario) de Hato Lechero antes/después de 071
Then el total de `entradas` por mes es idéntico (la suma es incondicional a la categoría,
  eso SÍ es cierto) Y la línea de detalle correspondiente se mueve de "Otro" a "Venta de
  Vacas de Descarte" en los meses donde aplica — este movimiento de línea debe verificarse
  explícitamente, no darse por sentado como "no aplica" solo porque el total no cambia
```

### 5.5 Puerto Deno — misma paridad
```
Given get_pyg_flujo_caja (chat.tsx / reportes-financieros.ts) sobre el mismo negocio/periodo
When se compara contra el resultado del frontend para el mismo request
Then reportesFinancierosParidad.test.ts sigue verde (16/16, línea base ya confirmada) Y se
  agrega un fixture con la categoría "Venta de Vacas de Descarte" pobladas para que la
  paridad cubra el caso nuevo explícitamente, no solo el catálogo preexistente
```

### 5.6 Regresión negativa — ninguna OTRA vista se mueve
```
Given que 071 solo toca filas del negocio Hato Lechero
When se corre el mismo snapshot de 5.1 para Aguacate Hass y Ganado
Then son idénticos byte a byte también — un cambio de categoría del Hato no debe tocar
  ninguna línea de otro negocio ni siquiera en la vista Global (donde la etiqueta cambia
  pero el total del negocio Hato Lechero dentro de Global tampoco se mueve)
```

---

## 6. Idempotencia del backfill

### 6.1 Primera corrida — 88 filas, cobertura reportada
```
Given las 44 filas mensuales de fin_ingresos (Hato Lechero) y el estado vivo de hato_*
When se corre el runner en modo plan y luego --apply
Then se crean 88 filas (44 × 2 quincenas) con origen_dato='derivado_mensual',
  fin_ingreso_id apuntando al mensual correspondiente (compartido entre las 2), y
  Σ litros(q1, q2) == cantidad(mensual) exacto para las 44 — incluidos los meses de
  28/29/30/31 días
```

### 6.2 Segunda corrida sobre el mismo estado — 0 escrituras
```
Given el estado post-6.1
When se corre el runner de nuevo (mismo plan o uno regenerado desde el mismo estado vivo)
Then 0 INSERT, 0 UPDATE — verificar con un diff de updated_at/id, no solo "no truena" ni
  "el conteo de filas sigue en 88" (88 filas podría ser cierto incluso si se reescribieron)
```

### 6.3 Una quincena medida ya ocupa un periodo que el backfill quiere escribir — el dato real gana
```
Given que antes de correr el backfill, Gerencia ya capturó en vivo la quincena
  (2026-05, quincena 1) con litros=8000 vía la RPC (origen_dato='medido')
  Y la fila mensual de mayo 2026 en fin_ingresos también existe con cantidad=15600
When se corre el backfill (plan + apply)
Then la quincena 1 de mayo NO se toca (sigue litros_total=8000, origen_dato='medido')
  Y el reporte del backfill lista ese periodo como "respetado, no sobrescrito"
  Y la quincena 2 de mayo (si no existe una medida ahí) SÍ se crea derivada normalmente
```

### 6.4 [ASUNCIÓN §0.4] Estado vivo divergió entre plan y apply
```
Given un artefacto de plan generado en el momento T0
When, antes de correr --apply, alguien borra o edita uno de los 44 ingresos mensuales
  (T1 > T0)
Then --apply aborta (no escribe NADA de esa corrida) y lista explícitamente qué fila
  divergió y cómo — el criterio asume abort total; si el implementador decide "aplica el
  resto y salta solo la fila divergente", ese comportamiento debe documentarse
  explícitamente en el propio artefacto de salida, y este criterio se re-escribe
```

### 6.5 Mensual sin `cantidad` — 0 filas, 1 entrada de reporte, nunca una estimación
```
Given una de las 44 filas con cantidad IS NULL (si existe alguna; si no, se construye un
  fixture sintético para el runner en modo dry-run)
When se corre el backfill
Then 0 filas de hato_produccion_quincenal se crean para ese mes
  Y el reporte del plan lista esa fila como omitida con la razón exacta
  Y en ningún punto se deriva un litraje a partir de `valor` (nunca "estimar litros
  dividiendo valor por un precio promedio") — verificar que el código ni siquiera tiene
  ese camino, no solo que no se ejecutó en este caso
```

### 6.6 `num_vacas_ordeno` derivado — NULL cuando la cobertura es insuficiente, nunca 0
```
Given un periodo del backfill donde `contarVacasEnOrdenoAFecha` reporta
  cobertura.sinFecha > un umbral que el motor considera insuficiente
When se escribe la fila derivada correspondiente
Then num_vacas_ordeno queda NULL (no 0, no un número con baja confianza silenciada) Y
  num_vacas_ordeno_origen queda NULL también (el CHECK
  hato_prod_quincenal_vacas_origen_coherente lo exige: NULL implica NULL) Y notas contiene
  la cobertura real (conFecha vs sinFecha) para auditoría
```

---

## 7. "Sin dato, nunca 0" — barrido

### 7.1 Ventana de pesajes vacía → `actual = null`, render `—`
```
Given una vaca activa sin ningún hato_pesajes_leche dentro de la ventana móvil (4 semanas
  por defecto)
When se renderiza su fila en RankingVacas
Then la columna "actual" muestra `—`, nunca `0` ni una celda vacía sin marcar
  Y en el ordenamiento por esa columna (asc y desc) esa fila queda al final en AMBOS sentidos
```

### 7.2 Vaca sin parto usable → visible, curva en modo calendario, excluida del promedio del hato
```
Given una vaca activa con pesajes pero sin ningún evento 'parto' interpretable
When se renderiza su curva en la Hoja de Vida
Then aparece en modo eje-calendario con el rótulo "sin parto de referencia"
  Y NO contribuye a curvaLactanciaHato (verificar que su litros_total no aparece sumado
  en ningún bucket de semanas-desde-parto)
  Y NUNCA se le imputa una fecha de parto de relleno para poder graficarla en el eje normal
```

### 7.3 Bucket de curva del hato con menos de 3 vacas → litros = null
```
Given una semana-desde-parto con exactamente 2 vacas contribuyendo
When se calcula curvaLactanciaHato
Then ese bucket retorna litros: null (no el promedio de esas 2 vacas) — el umbral es < 3,
  así que también probar el caso límite de EXACTAMENTE 3 (debe SÍ promediar) para no dejar
  el ">=" vs ">" del código sin cubrir
```

### 7.4 Proyección con curva incompleta → plana, marcada, nunca extrapolada
```
Given una vaca cuya curva del hato en semana+1 o semana+2 es null (dato insuficiente en
  ese bucket)
When se calcula proyectarHato para su horizonte de 2 semanas
Then esa vaca se proyecta plana al nivel actual (no una forma inventada) Y aparece
  listada en `planas` del resultado Y el tooltip del gráfico la menciona explícitamente
  como plana por falta de curva, no en silencio
```

### 7.5 Vejez de pesajes — nunca gráfico vacío, nunca "hace NaN semanas"
```
Given hato_pesajes_leche completamente vacía (instalación nueva, o corte de datos)
When se calcula vejezPesajes
Then el resultado no truena (ultimaFecha=null manejado explícitamente) Y el chip muestra
  un estado "sin datos aún" distinto de 'ok'/'atrasado'/'critico' — o, si el contrato
  fuerza uno de esos tres, 'critico' con un texto que NO sea una interpolación de una
  fecha nula (nunca "hace NaN semanas" ni "hace Invalid Date semanas")
```

### 7.6 KPI de reparto — el caso donde 0 SÍ es el número correcto (matiz, no violación)
```
Given un periodo real donde hubo ventas de leche y terneros pero CERO ventas de descarte
  (el negocio Hato Lechero sí tuvo actividad ese periodo, solo que ninguna fue descarte)
When se renderiza KpisVentaHato
Then el bucket "descarte" SÍ muestra $0 (no `—`) — porque es un agregado sobre un conjunto
  de datos completo y real (se consultaron TODOS los ingresos del periodo; simplemente
  ninguno cayó en esa categoría), a diferencia de un pesaje individual ausente, que es una
  MEDICIÓN que nunca se tomó. Este criterio existe para que nadie "corrija" el KPI a `—`
  por aplicar la regla de módulo sin el matiz: sin-dato aplica a mediciones ausentes, no a
  sumas verdaderamente vacías sobre un universo completo
```

### 7.7 Chip "derivado de mensual" nunca se confunde con dato medido
```
Given el gráfico de litros por quincena (GraficoLitrosQuincenal) mostrando una mezcla de
  barras medidas y derivadas en el mismo rango visible
When se renderiza
Then las barras derivadas llevan el chip/patrón visual distintivo en TODAS las instancias
  (no solo al pasar el mouse) — un usuario que solo mira la pantalla, sin interactuar, debe
  poder distinguir medido de derivado sin necesidad de hover
```

### 7.8 R-9 — dataset sintético > 1.000 filas de pesajes no se trunca en silencio
```
Given un fixture sintético con > 1.000 filas de hato_pesajes_leche (multi-año, la escala
  que R-9 del brief predice a partir de ~2 años de operación)
When cualquier consulta del tablero que agregue pesajes multi-año corre contra ese fixture
Then el resultado incluye las > 1.000 filas (verificar que la ruta usa fetchAll o
  paginación explícita) — un test que compare "filas devueltas" contra "filas esperadas"
  con un mock de PostgREST que trunca a 1.000, replicando exactamente la trampa que ya
  mordió a execPygFlujoCaja
```

---

## 8. Infraestructura de test requerida — bandera al CTO

Los §1, §2, §4 y §6 de este documento **no se pueden verificar con la suite actual de Vitest**, que
mockea el cliente de Supabase (`CLAUDE.md` raíz, sección Testing). Atomicidad de una función
`plpgsql`, aplicación real de RLS por rol, y el código de error `23503` de una FK real son propiedades
del motor de Postgres — un mock nunca puede probarlas de verdad, y mockearlas "hasta que pasen" sería
exactamente el antipatrón que mi rol prohíbe (ver Constraints: "no mockear tan agresivamente que las
pruebas de integración dejen de reflejar comportamiento real").

**Recomendación concreta:** estos escenarios necesitan una de dos cosas antes de poder cerrarse con
evidencia real, no solo con lectura de código:
1. Un stack local de Supabase (`supabase start`) con las migraciones 070/071 aplicadas y dos usuarios
   de prueba reales (uno Administrador, uno Gerencia) para obtener JWTs reales; o
2. Un proyecto Supabase de desarrollo/staging dedicado (no producción) con el mismo esquema, accesible
   con `SUPABASE_SERVICE_ROLE_KEY` para sembrar/limpiar estado entre corridas.

Sin uno de los dos, SOW 6 solo puede certificar estos escenarios por **inspección del código y del DDL**
(lo que este documento ya hizo para las secciones marcadas como "verificado en código" en §9), no por
ejecución. Eso es una verificación más débil que la que el brief pide ("forzar el fallo... y probar que
nada quedó escrito") y debe quedar explícito como tal en el veredicto final de SOW 6, no disfrazado de
cobertura real.

---

## 9. Sección adversarial — supuestos del brief que creo que pueden estar mal

Ordenados por convicción y por el tamaño del daño si estoy en lo cierto.

### 9.1 — MÁS ALTA CONVICCIÓN: el trigger inverso no sincroniza el periodo, solo el litraje
El SQL del §3.3 declara `AFTER UPDATE OF cantidad, valor, fecha ON fin_ingresos`, pero el cuerpo de
`fn_hato_sync_quincena_desde_ingreso` solo escribe `litros_total` (vía `COALESCE(NEW.cantidad, ...)`).
Nunca lee `NEW.fecha`, y nunca toca `anio`/`mes`/`quincena`/`fecha_inicio`/`fecha_fin` de la fila
`hato_produccion_quincenal` enlazada. **Consecuencia concreta:** si Gerencia corrige la fecha de un
ingreso enlazado y esa corrección cruza una frontera de quincena o de mes (un caso realista — corregir
"se me pasó registrar esto en la fecha correcta" es exactamente el tipo de edición que un formulario
financiero existe para permitir), el ingreso queda fechado en el periodo nuevo mientras la fila
`hato_produccion_quincenal` sigue anclada al periodo viejo — divergencia silenciosa entre las dos
mitades de "un solo registro", que es precisamente lo que la decisión 3 del dueño prohíbe. El trigger
declara que reacciona a `fecha` pero no actúa sobre ella; o falta lógica en el cuerpo, o la columna
`fecha` sobra en la cláusula `OF` (falso positivo de intención). **Esto no es un bug hipotético — está
en el SQL literal que el brief pega como "la decisión".** SOW 1 debe resolver esto explícitamente
(re-anclar el periodo, o rechazar la edición de fecha sobre un ingreso enlazado) antes de que el criterio
3.4 de este documento pueda cerrarse.

### 9.2 — ALTA CONVICCIÓN: el `fecha_estado` de los 91 animales `vendida` probablemente está NULL para
la mayoría, no solo para "algunos" — el riesgo R-2 del brief lo subestima en severidad práctica
Rastreé el pipeline real: `resolver.ts` solo popula `fechaEstadoPresunta` para el caso "cierre presunto"
(regla de >365 días de ausencia, línea 1156/1181) y la deja explícitamente `null` para "ventas
inferidas" (línea 925, el caso de las filas-comentario DACOTA/INDIRA/CHISPA). Los 25 animales que la
corrección MEV del 2026-07-24 pasó de `activa` a `vendida` (`docs/hato/inventario-mev-2026-07-24.md`)
se tocaron con un `UPDATE … WHERE id` que la propia nota documenta como limitado a `estado` — **no**
menciona `fecha_estado` en la tabla de cambios. Si ese `UPDATE` no seteó `fecha_estado`, esos 25 quedan
NULL. Sumado a los animales de `estado_presunto='vendida'` del Load original cuyo camino no pasó por
"cierre presunto", la fracción de los 91 `vendida` con `fecha_estado` realmente utilizable podría ser
una minoría, no la excepción marginal que el texto de §4.2e sugiere ("si `fecha_estado` también es NULL,
se excluye"). El mecanismo de fallback en sí es correcto (excluir y sumar a `cobertura.sinFecha` respeta
"sin dato, nunca 0"), pero la **utilidad práctica** de `num_vacas_ordeno` derivado para periodos
históricos podría terminar siendo `NULL` para la mayoría de los 33 chequeos, no un dato "impreciso pero
usable" como implica la severidad "Alta pero mitigada" de R-2. **No pude confirmarlo con una consulta
real** (sin acceso a Supabase MCP/CLI en esta sesión) — dejo como acción explícita para SOW 4: correr
`SELECT COUNT(*) FILTER (WHERE fecha_estado IS NOT NULL) FROM hato_animales WHERE estado='vendida'`
ANTES de escribir el backfill, y si la cobertura real es baja, escalar al dueño si `num_vacas_ordeno`
derivado vale la pena mostrar en absoluto para los periodos más antiguos.

### 9.3 — MEDIA-ALTA CONVICCIÓN: la justificación de "el Flujo de Caja ni siquiera lee la categoría" es
factualmente incorrecta en el código actual, aunque la conclusión (total intacto) sigue siendo cierta
`calculosFlujoCaja.ts` líneas ~76-80 SÍ usa `ing.categoria_id`/`ing.categoria_nombre` para construir el
`id` y la `etiqueta` de la línea de entrada detallada (`id: \`ent_${categoria_id}\``, mismo patrón que
`calculosPyG.ts`). El brief (§2.2) afirma lo contrario como parte del argumento de "impacto cero
demostrable". La conclusión práctica no cambia — la suma (`entradas[mes] += ing.valor`) es incondicional
a la categoría, igual que en el P&G, así que el total sigue intacto — pero la RAZÓN declarada es la
equivocada, y eso importa porque significa que **el criterio 5.4 de este documento (verificar que la
línea de detalle del Flujo de Caja también se mueve de "Otro" a la categoría nueva) es necesario, no
opcional como el brief implícitamente sugiere** al decir que ese motor "ni siquiera lee la categoría".
Si alguien lee el brief literalmente y decide que el Flujo de Caja no necesita verificación de línea
porque "no lee categoría", se salta exactamente el caso que sí puede romperse.

### 9.4 — MEDIA CONVICCIÓN: la partición 15/N días asume que `fin_ingresos.fecha` de las 44 filas
mensuales está anclada al mes calendario — no verificado contra los datos reales
La aritmética `q1 = round(litrosMes × 15 / diasDelMes)`, `q2 = litrosMes − q1` es correcta y garantiza
la suma exacta contra el mensual, independientemente de meses de 28/29/30/31 días — verifiqué
`rangoQuincena()` en `calculosHato.ts` y confirma que la quincena 1 siempre tiene 15 días exactos
(1–15), así que la fracción `15/diasDelMes` sí corresponde a la longitud real de la quincena 1. **Lo que
el brief no verifica es la premisa anterior**: que `EXTRACT(YEAR/MONTH FROM fecha)` de cada una de las
44 filas efectivamente identifica el mes calendario que la leche se produjo, y no un ciclo de
facturación distinto (p. ej. si el Pomar factura del día 26 al 25, o si `fecha` en algunas filas
históricas es la fecha de PAGO/registro contable en vez de la fecha de producción — un patrón común en
`fin_gastos`/`fin_ingresos` de este mismo repo, donde `fecha` a veces es la fecha de captura, no la del
hecho económico). Si la convención real difiere entre filas (algunas con `fecha` = día 1, otras = día 28,
otras = fecha de pago del mes siguiente), `dividirMensualEnQuincenas({anio, mes, ...})` derivado por
`EXTRACT` desde `fecha` asignaría litros al mes equivocado para esas filas, silenciosamente — la suma
seguiría siendo exacta (esa propiedad es de la aritmética, no de la fecha), pero el mes/quincena
etiquetado estaría mal. **Acción concreta para SOW 4 antes de escribir el runner:** listar las 44 fechas
reales (`fecha`, `nombre`, `cantidad`) y confirmar contra el dueño/Martha que el día del mes no importa
para la asignación mensual (o que sí hay una convención consistente que hay que replicar). No pude
verificarlo yo mismo — requiere una consulta de solo-lectura contra el proyecto real
(`ywhtjwawnkeqlwxbvgup`), que no tuve disponible en esta sesión.

### 9.5 — MEDIA CONVICCIÓN: "cabezas" no tiene una columna declarada en el contrato de la RPC de venta
de animales (§0.1, repetido aquí porque cambia el criterio 1.11 de "puede escribirse" a "genuinamente
incierto")
Decisión 6 hace "cabezas" un campo obligatorio de captura, independiente del vínculo opcional a
animales específicos. Pero `fin_ingresos` (R5) no tiene una columna semánticamente llamada "cabezas" —
el candidato obvio es `cantidad` (ya usado para litros en leche, y para kg en Aguacate), pero el brief
nunca lo dice para este RPC, y reusar `cantidad` con una unidad distinta por fila (litros vs. cabezas)
en la MISMA columna sin un campo de unidad es el mismo tipo de ambigüedad que ya generó el bug de
`calculosCostoKg.ts:41` (comparar contra un nombre de categoría distinto del real) — aquí sería peor,
porque `cantidad` alimenta el denominador `unidades[idx]` en `calculosPyG.ts` para CIERTAS vistas. Ya
verifiqué que el filtro `/leche/i` sobre `categoria_nombre` evita que "cabezas" contamine el $/litro del
Hato — pero nada evita que contamine, por ejemplo, un futuro indicador "$/cabeza" mal etiquetado si
alguien reusa esa columna sin declarar la unidad. Pedir al implementador de SOW 1 que declare
explícitamente en el DDL o en un comentario dónde vive "cabezas" antes de escribir la RPC.

---

## 10. Conteo de criterios

- §1 Atomicidad: 11
- §2 RLS: 5
- §3 Bidireccionalidad: 4
- §4 DELETE: 5
- §5 Regresión financiera: 6
- §6 Backfill: 6
- §7 Sin dato: 8
- **Total: 45 criterios Given/When/Then**, más 5 ambigüedades bandeadas (§0), más 1 nota de
  infraestructura de test (§8), más 5 hallazgos adversariales (§9).
