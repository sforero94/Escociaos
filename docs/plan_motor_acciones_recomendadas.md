# Motor de acciones recomendadas — definición de producto

**Bloque 4 del Tablero General** · 2026-08-16 · CPO
Documento hermano: [`docs/plan_dashboard_centro_control.md`](plan_dashboard_centro_control.md)
(§4 contrato del bloque, §9.2 maquetado aprobado, §11 preguntas abiertas)

> Esta pasada cierra §11. El documento anterior definió **qué se ve**; éste define **qué se
> publica, de dónde sale, en qué orden, y con qué se apaga**. La superficie visual no se
> toca: frase + evidencia + un botón + "No es útil", máximo 3 por negocio, sin lenguaje de
> alerta. El bloque se maqueta ya y **se libera en la Ola 3**.

**Contexto nuevo desde el documento anterior.** La base de Notion se leyó directamente el
2026-08-16. Todo lo que dice §4 sobre ella se corrigió aquí (§4.1) y tres de las siete
barreras cambian de redacción (§4.2). El caso que ordena el diseño entero es real y está
en §4.3.

> **Revisión 2 — 2026-08-17, tras el set de referencia.** Santiago llenó las 10 acciones de
> la decisión D-4 ([`docs/set_referencia_acciones.md`](set_referencia_acciones.md)) y el
> resultado obliga a tres cambios, todos incorporados. **(1)** Sus cinco molestas mueren por
> reglas mecánicas, pero **dos de esas reglas no existían** — se añaden como criterios de
> admisión **A-7** (¿es del lector y nadie más la va a mover?) y **A-8** (¿aporta algo que no
> esté ya en pantalla?) (§2.2). **(2)** Dos de sus cinco buenas **no las produce ninguno de
> los siete orígenes**: su disparador es el tiempo transcurrido desde la última vez que se
> miró. Entra un octavo origen, **O-8 revisión periódica pendiente**, a la v1 y con tres
> guardas propias (§3.4). **(3)** **Cero de sus cinco buenas son irrecuperables** y tres son
> explícitamente cosas atascadas, así que el orden de §5 estaba mal calibrado y se reescribe.
> Ni el alcance de la v1 ni la superficie visual cambian.

---

## 1. Qué decide este documento

**Decide:** qué es una acción y qué no (§2) · de dónde puede salir y qué entra en la v1
(§3) · cómo entra el comité sin contaminar y quién gana cuando contradice al sistema (§4) ·
qué las ordena (§5) · qué se guarda al descartar y al ejecutar (§6) · cómo se valida antes
de soltarla y con qué umbral se apaga (§7).

**No decide:** dónde corre, con qué modelo, a qué hora, con qué caché, contra qué tabla, ni
con qué prompt. Eso es del CTO. §9 lista lo que este documento le exige y nada más.

---

## 2. Qué es una acción recomendada

### 2.1 La definición

> Una **acción recomendada** es una frase imperativa dirigida a un negocio, que propone un
> cambio en el trabajo de los próximos siete días, **sostenida por al menos un hecho del
> sistema con su cifra y su fecha**, **resoluble en una pantalla que ya existe**, y que
> **hoy no tiene dueño asignado en ninguna parte de la app**.

Las cuatro cláusulas no son adorno: cada una elimina una familia entera de basura. "Dirigida
a un negocio" mata la personalización. "Hecho con cifra y fecha" mata el consejo agronómico
genérico. "Resoluble en una pantalla" mata lo que sólo se puede hacer en campo y no se
registra. "Sin dueño asignado" mata la duplicación con el bloque 1.

### 2.2 El criterio de admisión — ocho preguntas binarias

Todas tienen que dar **sí**. Un solo **no** y la candidata no se publica; la última columna
dice a dónde va en su lugar. Dos personas aplicando esta tabla al mismo hecho llegan al
mismo resultado — ése es el estándar, y si alguna pregunta admite interpretación hay que
reescribirla, no discutirla caso por caso.

| # | Pregunta | Pasa | No pasa | Si no pasa, va a |
|---|---|---|---|---|
| **A-1** | ¿Tiene **verbo** y un **objeto nombrable**? | "Revisar las 11 vacas vacías con más de 90 días" | "Mejorar el desempeño reproductivo" | se descarta |
| **A-2** | ¿El conjunto afectado es **enumerable hoy**, con N y con nombres? | 11 vacas con chapeta y nombre · 2 aplicaciones con id | "hay problemas de acaro en varios lotes" | se descarta |
| **A-3** | ¿Su premisa es un **hecho del data layer** con cifra, fuente y fecha? | `v_hato_estado_actual`, hoy | una frase de un acta, sola | evidencia de comité (§4), nunca premisa |
| **A-4** | ¿Se resuelve en una **pantalla, filtro o diálogo que existe**? | `/hato-lechero` con el filtro puesto | "hablar con el veterinario" | se descarta |
| **A-5** | ¿Cambia lo que alguien hace en los **próximos 7 días**? | la enmienda arranca en 2 días | "el costo/kg del año va alto" | KPI (bloque 3) o `/finanzas/reportes` |
| **A-6** | ¿Es **falsable**? ¿Se puede escribir la condición observable bajo la cual deja de valer? | "cuando las 11 dejen de estar vacías o pasen a preñadas" | "cuando mejore la gestión" | se descarta |
| **A-7** | ¿Es **del lector**, y **nadie más la está moviendo ya**? Dos mitades: **(i)** no hay un trabajo abierto en el sistema atendiendo ese mismo hecho, y **(ii)** la regla está declarada como **de escritorio**, no de campo ni dependiente de un tercero | "confirmar el faltante de insumo" | "cerrar la aplicación" (campo) · "el ácaro pasó el 15%" cuando hay dos fumigaciones en curso | se descarta |
| **A-8** | ¿Aporta algo **que no esté ya visible en el tablero**? | el faltante de 4.694 kg, que no está en ninguna tarjeta | "revisar la producción del hato: 15,4 L/vaca" — es el titular del pulso | se descarta |

**A-7 y A-8 salen del set de referencia y no existían antes.** Ninguna se puede derivar de
las seis primeras: la molesta *"cerrar las aplicaciones abiertas"* cumple A-1 a A-6 sin
despeinarse y aun así es mala, porque el trabajo es de campo. La declaración
**escritorio / campo** es una propiedad de la **regla**, fijada una vez por el dueño, no algo
que se infiera por instancia — y es la que más basura elimina por unidad de esfuerzo.

### 2.2 bis · Las cinco molestas mueren solas

Es la mejor prueba disponible de que los criterios sirven: **las cinco mueren por regla
mecánica, sin juicio de nadie**, y dos de las reglas se escribieron *porque* él las escribió.

| Molesta escrita por Santiago | Su razón | Muere por |
|---|---|---|
| "Cerrar las aplicaciones abiertas" | *"están en curso, no es de escritorio sino de campo"* | **A-7 (ii)** |
| "Revisar la producción del hato: está en 15,4 L/vaca" | *"es info que está arriba"* | **A-8** |
| "Atención: el ácaro superó el 15% de incidencia" | *"hay fumigaciones en curso para atenderlo"* | **A-7 (i)** |
| "Normalizar el nombre de la finca santimp" | *"es cierto, pero no cambia ninguna decisión esta semana"* | **A-5** |
| "Pedirle a la agrónoma el informe mensual" | *"no está en el sistema, no tiene botón, depende de un tercero"* | **A-4** y **A-7 (ii)** |

Dos lecturas que conviene no perder. **A-5 se ganó su sitio:** "santimp" es un dato sucio
real, señalado en el documento del tablero, verdadero, y aun así molesta — la verdad no es
criterio suficiente. Y **A-7 (i) es mecánico, no una opinión:** que haya dos aplicaciones en
ejecución contra el ácaro es un hecho consultable, así que "la respuesta ya está en marcha"
se comprueba, no se juzga.

**A-6 es la más importante y la que más se va a querer saltar.** Si no se puede escribir la
condición de muerte de una acción, tampoco se puede hacer que desaparezca sola cuando el
hecho cambia, ni medir si sirvió (§6), ni cotejarla al pintar (§4.2). Una acción sin
condición de muerte es un post-it: se queda pegada hasta que alguien lo despega, y nadie lo
despega. Ése es el mecanismo exacto por el que `hato_alertas` llegó a 63 descartes de 64.

**Y una regla de redacción que se comprueba sola:** *la frase de una acción no nombra
personas.* Nombra la vaca, el lote, la aplicación o el registro. "Revisar las 11 vacías",
no "pedirle a Martha que revise". El tablero lo leen todos los Gerencia y una frase con
nombre propio convierte una recomendación en un encargo ajeno — es la misma razón por la
que se eliminó la agenda por interlocutor (§3 del documento anterior). Excepción única: un
nombre puede aparecer **dentro de una cita textual de un acta**, porque ahí es fuente, no
redacción.

### 2.3 Los tres vecinos: alerta, KPI y compromiso

La distinción de fondo, en una línea: **una alerta es absoluta, un KPI es continuo, un
compromiso es humano, y una acción recomendada es comparativa.** La alerta salta porque se
cruzó un umbral; la acción aparece porque **le ganó a las otras candidatas**. De ahí salen
tres consecuencias de diseño que ya estaban en el maquetado y ahora tienen su porqué: por
eso hay un máximo de 3, por eso el estado vacío honesto es posible y obligatorio, y por eso
el bloque nunca lleva ropa de alerta.

| | **Alerta** (bloque 1 · `hato_alertas`) | **KPI** (bloque 3) | **Compromiso** (comité) | **Acción recomendada** (bloque 4) |
|---|---|---|---|---|
| Contesta | ¿qué tengo que resolver yo, ya? | ¿cómo va? | ¿qué dije que iba a hacer? | ¿qué conviene empujar esta semana? |
| Dueño | el lector | nadie | quien se comprometió | **nadie todavía** — propone, no asigna |
| Umbral | binario y duro | ninguno | ninguno | **relativo**: es la mejor de N |
| Estado | persistente | ninguno | vive en Notion | **efímera**: se regenera y muere sola |
| Se cierra con | un botón | mirarlo | una conversación | ir a la pantalla y trabajar |
| Si se ignora | se acumula y cuesta plata o trazabilidad | nada | se cae | nada: desaparece cuando el hecho cambia |
| Cuántas caben | las que haya | fijo | las que haya | **3 por negocio, tope duro** |

**El mismo hecho puede ser las tres cosas, y lo que decide es la clausurabilidad.** "Faltan
tres quincenas de leche" con un botón que abre el diálogo es **alerta** (bloque 1.2). Sin
botón, es acción. Como serie de litros por quincena, es KPI. La prueba práctica: *¿hay un
botón que lo cierre desde el tablero?* Si sí, es bloque 1 y el bloque 4 tiene prohibido
mencionarlo.

**Y la promoción es automática y de una sola dirección.** Si una acción del bloque 4 cruza
el umbral que la convierte en fila del bloque 1 —el chequeo veterinario a los 75 días, por
ejemplo— **sale del bloque 4 en la misma corrida**. Un hecho, una superficie, y el bloque 1
siempre gana. Esto cierra la pregunta 9 de §11 (¿qué pasa si el motor y el bloque 1 se
contradicen?): estructuralmente no pueden, siempre que ambos lean el mismo data layer en el
mismo instante de render. Es un requisito para el CTO (§9), no un ruego en el prompt.

### 2.4 Los cinco estados de una acción

Sin este vocabulario no hay métrica que interpretar en §6.

| Estado | Qué significa | Quién lo produce |
|---|---|---|
| `candidata` | el data layer la generó y cruzó su umbral | data layer |
| `publicada` | el motor la conservó y se pintó | motor + render |
| `resuelta` | el hecho que la sostenía dejó de ser cierto | el mundo |
| `descartada` | un Gerencia pulsó "No es útil" | el lector |
| `caducada` | una corrida posterior no la incluyó, sin que nadie hiciera nada | el motor |

**`caducada` es el estado mayoritario y silencioso, y no es un fracaso.** Que la mayoría de
las acciones desaparezcan sin drama es exactamente lo que se espera de un bloque efímero. Lo
que hay que vigilar no es la caducidad: es la indiferencia (§7, K-2).

**Identidad.** Una acción tiene una **clave estable = regla + negocio** (`hato.vacias_90d`,
`aguacate.aplicacion_colgada`), y los objetos afectados son su carga, no su identidad. Es lo
que permite que sobreviva a la regeneración diaria: sin clave estable no hay silencio tras
un descarte, no hay medición de resolución, y "No es útil" se pierde cada madrugada. Que la
identidad sobreviva a la regeneración es **requisito de producto**; cómo se persiste es del
CTO.

---

## 3. De dónde sale una acción

### 3.1 Los siete orígenes

| | Origen | Qué es | Ejemplo real de hoy | v1 |
|---|---|---|---|---|
| **O-1** | **Señal del sistema** | un umbral cruzado en el data layer | 11 vacías con >90 d desde el parto · 2 aplicaciones en ejecución hace 12 d · la enmienda arranca en 2 d | **sí** |
| **O-2** | **Hueco de captura** | el sistema no sabe algo que debería saber | 7 de 34 sin pesar el 12-ago · 3 de 10 días de lluvia en `contador_congelado` · 6 fincas sin hectáreas · agosto sin ingresos | **sí** |
| **O-3** | **Compromiso del comité sin cerrar** | un `to_do` sin marcar en el acta, con su antigüedad | "Terminar Drench en Australia" — comité del 10-ago | no |
| **O-4** | **Cruce comité × sistema** | un compromiso cuyo cumplimiento el sistema puede verificar y no registra | "se comprometió a fumigar X y 6 días después no hay aplicación registrada" | **no — v1.1** |
| **O-5** | **Contradicción comité × sistema** | el acta afirma una cifra que el sistema contradice | "48 jornales / $4.400.000" contra 45,0 | **no — v1.1** |
| **O-6** | **Tendencia** | el número se mueve en una dirección durante N períodos | litros/vaca 15,9 → 13,5 → 15,4 | no |
| **O-7** | **Conocimiento agronómico externo** | recomendación de manejo traída de fuera | "para monalonion conviene…" | **nunca** |
| **O-8** | **Revisión periódica pendiente** | no cruzó ningún umbral: **venció el reloj desde la última vez que se miró** | revisar la ejecución presupuestal de julio · correr el análisis de productividad del hato | **sí — con las cuatro guardas de §3.4** |

### 3.2 La v1 son O-1, O-2 y O-8.

**O-8 se justifica aparte, en §3.4**, porque entró después del set de referencia y trae
cuatro guardas propias. Aquí van los otros.

**Por qué O-2 tiene rango propio y no es un caso de O-1.** Es el origen de mayor precisión
del sistema: un hueco es un hueco y no admite interpretación, mientras que un umbral cruzado
siempre admite discusión sobre dónde estaba el umbral. Es además el único origen cuya acción
se ejecuta **dentro de la app** ("completar el pesaje de las 7 vacas que faltaron"), así que
A-4 se cumple siempre y la resolución es observable a los pocos días. Y es la inversión del
mayor riesgo del bloque: R-7 existe para que el motor no lea un hueco como una caída;
convertir el hueco en el origen más seguro es aprovechar la barrera en vez de sólo
defenderse de ella.

**Por qué O-6 se queda fuera.** Una tendencia exige serie, línea base y un juicio de
significancia, y sobre datos con huecos (7 de 34 sin pesar) la caída aparente y la caída real
son indistinguibles. Es el origen con más probabilidad de producir la alucinación que R-7
prohíbe, y la que peor suena: *"la producción cayó"*, dicha con seguridad, sobre un hueco de
captura. Vuelve cuando la cobertura de pesaje sea estable, no antes.

**Por qué O-7 no vuelve nunca.** Ése es el trabajo de Esco, con sus citas y su conversación,
donde el lector puede repreguntar. En una tarjeta de tres líneas sin posibilidad de
repregunta, una recomendación agronómica sin fuente verificable es exactamente el tipo de
autoridad prestada que este tablero está construido para no dar.

### 3.3 O-4 es el premio, y por eso no se improvisa

El valor real está en *"el comité se comprometió a fumigar San Fernando y seis días después
el sistema no registra la aplicación"*. Eso es lo que ninguna otra pantalla puede decir. Y
es también el fallo más caro posible del bloque: **una acusación falsa de incumplimiento,
leída por todos los usuarios de Gerencia.** Un descarte cuesta atención; un "no se hizo"
sobre algo que sí se hizo cuesta la confianza en la pantalla entera y, peor, la de la gente
que sale nombrada en ella.

Dos condiciones tienen que cumplirse para que un compromiso pueda cruzarse con el sistema, y
hoy **ninguna de las dos está resuelta**:

**(1) El objeto del compromiso tiene que resolver a una entidad que el sistema conozca.**
Se verificó contra el repositorio y contra los datos: los lotes son *Piedra Paula, Salto
Tequendama, Australia, La Vega, Pedregal, La Unión, Irlanda, Acueducto*. El comité del
10-ago habla de **"El Salto"** (que es *Salto Tequendama* — se resuelve, pero por parecido,
no por igualdad) y de **"San Fernando"**, que **no existe en ninguna parte de este sistema**:
ni en `lotes`, ni en las fincas de ganado (Escocia, santimp, Carrizal, Mochuelos, Andalucía,
Maryland), ni en el repositorio entero. El vocabulario del comité **no es** el vocabulario
del sistema, y esto no se arregla con un `ILIKE`.

**(2) El cumplimiento tiene que tener un evento inequívoco en el sistema.** "Terminar el
Drench en Australia" ¿es la aplicación pasando a cerrada? ¿un `movimiento_diario` en ese
lote? ¿los dos? Un verbo mal mapeado produce un incumplimiento inventado.

**Recomendación:** O-4 y O-5 entran como **v1.1**, y sólo sobre el subconjunto de
compromisos cuyo objeto **resuelve sin ambigüedad** —contra un diccionario de alias
confirmado por Santiago, no adivinado— y cuyo verbo tiene un evento declarado. Todo lo
demás sigue siendo contexto que puede **reordenar** acciones existentes, nunca crearlas.
Ésa es la extensión operativa de R-6: **el comité mueve de puesto; no publica.**

**Y O-3 solo —el compromiso sin verificación— no entra ni en la v1 ni en la v1.1.** El
comité del 10-ago trae **12 elementos de acción**; a razón de 3 por negocio, un solo acta
llena el bloque entero y lo convierte en un espejo de la lista de Notion. Un espejo no
prioriza, no aporta nada que el acta no tenga, y hereda entera la calidad de una fuente sin
esquema. El tablero no es un visor de Notion.

### 3.4 O-8 · La revisión periódica pendiente — el origen que faltaba

**Dos de las cinco acciones que el dueño más quiere no las produce ninguno de los siete
orígenes.** "Revisar la ejecución presupuestal de julio" y "correr el análisis de
productividad del hato" no responden a que algo cruzara un umbral ni a que falte un dato:
responden a *"debemos estar constantemente revisando"*. Su disparador es **el tiempo
transcurrido desde la última vez que se miró**. Una taxonomía que no puede producir el 40%
de lo que el dueño pidió no está completa, y ése es motivo suficiente.

Y es barato: la señal es un `MAX(fecha)` contra una cadencia declarada — exactamente la
forma que el bloque 6 (Salud de los datos) ya calcula para otra cosa. No hay dato nuevo que
capturar.

Es además el **único origen que sirve "¿qué se me está quedando atrás?" sin que nada haya
salido mal**. Todos los demás necesitan un problema. Éste sólo necesita un calendario, y por
eso cubre el hueco entre "todo está en orden" y "no he mirado esto en dos meses" — que es
justo donde vive el trabajo de gerencia.

**Es también el más fácil de degradar**, porque *"revisar X"* es literalmente la forma de dos
de sus molestas. Cuatro guardas, y las cuatro son duras:

**G-1 · La cadencia la declara el dueño. Nunca se infiere del histórico.** Sin cadencia
declarada, la revisión no existe y no genera nada. Inferirla del pasado es el error que el
tablero ya tiene documentado: el chequeo veterinario lleva 38 días sobre una cadencia real de
65–71, y leer eso como abandono es exactamente lo que la operación de mantenimiento prohibió.
Consecuencia práctica: O-8 arranca con la lista corta de revisiones que Santiago declare, no
con todas las tablas del sistema.

**G-2 · Su producto tiene que ser algo que hoy no existe** — un reporte que hay que correr,
una decisión que hay que tomar. **Nunca "mirar un número que ya está en el tablero".** Es la
línea exacta entre su buena #4 (*"correr un reporte con Esco sobre el presupuesto"* — el
reporte no existe hasta que alguien lo corre) y su molesta #2 (*"revisar la producción del
hato: 15,4 L/vaca"* — el número está 200 píxeles más arriba). Es A-8 con más filo, porque
O-8 es el origen que más va a rozarla.

**G-3 · El reloj se reinicia con el clic del botón primario.** La superficie está congelada
en un botón + "No es útil", así que no hay sitio para un tercer control de "ya la hice". No
hace falta: en este origen **la acción *es* mirar**, así que el clic no es la promesa de un
trabajo futuro — es el trabajo. "Ver la ejecución de julio" navega al reporte y pone el reloj
a cero. Si además existe un evento observable que sirva de reinicio (un `hato_chequeos`
nuevo, una fila de presupuesto tocada), ése manda sobre el clic.

**G-4 · Máximo una revisión periódica publicada por negocio y por día.** O-8 es un generador
infinito: siempre hay algo que hace rato no se mira. Sin tope, tres revisiones vencidas
desplazan a las tres señales duras del negocio y el bloque se convierte en una lista de
tareas de escritorio — que es un producto distinto y peor.

### 3.5 Las cinco buenas contra la taxonomía

| # | Lo que escribió Santiago | Origen | ¿La produce la v1? |
|---|---|---|---|
| 1 | Confirmar insumos para la aplicación de la enmienda | **O-1** | **Sí — y es la mejor acción disponible hoy.** Pero el hecho **no está en el catálogo del paquete** (§9) |
| 2 | Completar la asignación de lotes para las compras de ganado | **O-2** | **No, y está bien:** el bloque 1 ya lo sirve mejor |
| 3 | Programar Hércules y microbiología con contratistas | **O-1**, desde `tareas` | Sí — **200 días** de atraso, sin tocar Notion |
| 4 | Revisar la ejecución presupuestal de julio | **O-8** | Sí, en cuanto se declare la cadencia (G-1) |
| 5 | Correr el análisis de productividad del hato | **O-8** | Sí — destino verificado, falta la cadencia |

**#1 es la prueba de fuego y hoy la pasa entera.** "Aplicacion Enmienda" está **Calculada**,
arranca el **18 de agosto**, necesita **12.694 kg de Silicalmag** y `productos.cantidad_actual`
marca **8.000** → **faltan 4.694 kg**. Es O-1 puro, tiene fecha encima, es de escritorio, el
conjunto es enumerable (un producto, un número), y no aparece en ninguna otra pantalla del
tablero: **pasa las ocho preguntas**. Hay tres faltantes menores más en las aplicaciones en
curso (Acondicionador sys, Magister, Proxam). El hecho sale de `aplicaciones` →
`aplicaciones_mezclas` → `aplicaciones_productos.cantidad_total_necesaria` contra
`productos.cantidad_actual`, y **hoy no está en el catálogo de hechos de aguacate** que
consume el motor. Es lo primero que hay que añadirle (§9).

**#2 no debe salir del motor, y eso confirma el diseño en vez de romperlo.** Son los 2
`gan_movimientos` pendientes, que el tablero ya sirve en el **bloque 1.1, con un diálogo que
los cierra en sitio**. Por la regla de §2.3 —si hay un botón que lo cierra, es bloque 1 y el
bloque 4 tiene prohibido mencionarlo— el motor no puede producirla. El dueño nombró una
necesidad real y la respuesta correcta del producto es una fila del bloque 1, no una
recomendación. **El set de referencia está validando el tablero entero, no sólo el motor**, y
tiene una consecuencia numérica en §7: el motor se mide contra **cuatro** de las cinco
buenas, y la quinta se verifica en el bloque 1.

---

## 4. El contexto del comité

### 4.1 Lo que la base es de verdad

Leída directamente el 2026-08-16. Corrige y amplía §4.4 del documento anterior.

| | |
|---|---|
| **Qué es** | Base de Notion "Llamadas Escocia" (`31167755-ed68-8097-9793-000bf228d61f`; el mismo id que `fetchResumenesNotion()` lleva embebido sin guiones). **82 filas**, del **2025-04-08** al **2026-08-10** |
| **Esquema** | `Name` (título) · `Date` (datetime) · `Created by` · `Tag` (select) · `Attendees` (multi-select) · `Link` (url). **No hay propiedad de negocio, ni de finca, ni de estado** |
| **No es una base de la finca** | Las opciones de `Tag` incluyen **Quantis, think SID bizdev, Visa, Personal, Kaffeto, Cartama, Networking**. Hoy: 69 con `Escocia`, **12 sin Tag**, 1 `Networking` |
| **La trampa** | **Las 12 filas más recientes (desde 2026-06-29) no tienen Tag**, y entre ellas están **todos** los comités recientes: 08-10, 08-03, 07-27, 07-21, 07-06, 06-29. Filtrar por `Tag='Escocia'` pierde exactamente lo más fresco. El etiquetado se dejó de aplicar a finales de junio |
| **Cadencia** | "Comité semanal Escocia Hass", lunes 11:00 GMT-5, **con huecos reales**: entre 2026-05-04 y 2026-06-09 pasaron **cinco semanas** sin comité. El último es del **2026-08-10** |
| **El cuerpo es lo valioso** | Notas generadas por Notion AI: un `### Elementos de Acción` como checklist sin marcar, más secciones temáticas (Resumen Semanal de Trabajo, Manejo de Plagas, Clima, Personal, Ganadería, Próximas Semanas) |
| **Los lotes aparecen por nombre** | El Salto, Australia, La Vega, Piedra Paula, San Fernando — con las salvedades de §3.3 |

Esto responde la pregunta 1 de §11: **la cadencia es semanal con huecos de hasta cinco
semanas, y el etiquetado es poco fiable y está abandonado.** Todo lo que sigue está
construido sobre esos dos hechos.

### 4.2 Revisión de las barreras

**R-1 · El motor redacta. Ya no prioriza — se amplía.** Todo número entra al motor ya
computado y sale a pantalla desde el mismo objeto tipado. **Cambio respecto de §4.1 del
documento anterior:** el orden **no** lo produce el motor, lo produce el data layer (§5). El
motor puede **descartar** candidatas y **redactar** las que conserva; no puede permutarlas.
Motivo: el orden es justo lo que estamos tratando de evaluar, y un orden no determinista no
se puede someter a prueba de regresión ni explicar en una frase al usuario.

**R-2 · Ningún dígito puede originarse en el modelo — con dos procedencias admisibles.**
La redacción original prohibía todo dígito que no viniera del data layer. Con citas del acta
eso es inaplicable, porque la cita **contiene** cifras ("48 jornales, $4.400.000"). Nueva
redacción, que es la que hay que implementar:

> Todo dígito visible en el bloque tiene exactamente una de dos procedencias: **(a) una
> ranura tipada del data layer**, o **(b) una cita textual de un documento fuente,
> entrecomillada y atribuida a su fecha**. En el caso (b), la cita tiene que ser una
> **subcadena literal** del texto que el recolector trajo de la fuente. Si no lo es, la
> acción no se publica.

"Subcadena literal" es la propiedad clave: es comprobable mecánicamente, no depende del
prompt, y convierte "el modelo no debe inventar citas" en una condición binaria.

**R-3 · Sin evidencia no se publica — y ahora la evidencia lleva procedencia.** Cada línea
de evidencia se marca `sistema` o `comité`. Una línea de comité se pinta entrecomillada, con
el nombre y la fecha de la reunión, y **nunca con el mismo peso visual que una línea de
sistema**. En la v1, **ninguna acción puede sostenerse sólo con evidencia de comité**.

**R-4 · Sin destino no se publica.** Sin cambios. Es ahora el criterio de admisión A-4.

**R-5 · El motor no consulta nada — y eso incluye Notion.** El motor recibe un paquete
cerrado. **El recolector que arma el paquete no es el motor**: la selección de páginas, el
recorte y el truncado ocurren antes y con reglas fijas (R-8). Si el motor pudiera pedir más
contexto, "sin herramientas" sería una ficción.

**R-6 · El comité prioriza; no publica.** Redacción operativa: en la v1 el contexto del
comité **sólo puede mover de puesto una acción que O-1 u O-2 ya generaron**, aportando una
línea de evidencia citada. No puede crear ninguna. En v1.1, puede crear sólo dentro del
subconjunto resuelto de §3.3.

**R-7 · Sin dato sigue siendo sin dato.** Sin cambios, y ahora reforzada por el hecho de que
los huecos son un origen de primera clase (O-2) y no un caso borde.

**R-8 · Ninguna página de Notion entra al paquete por defecto — nueva.** El criterio de
inclusión tiene que ser **positivo y robusto a que el etiquetado se haya abandonado**:

> Una página entra si su `Name` coincide con el patrón del comité (contiene "Comité" y
> "Escocia") **o** si su `Tag` es `Escocia`. **Nunca por recencia sola.** Si no hay páginas
> que cumplan dentro de la ventana, el paquete va sin contexto de comité; no hay repliegue a
> "las últimas N, sean las que sean".

**R-9 · La ventana es "el último comité, con su fecha" — nunca "esta semana" — nueva.**
Con huecos de cinco semanas, cualquier frase que insinúe cadencia semanal ("como se acordó
esta semana") es falsa a la primera. Toda evidencia de comité lleva la fecha literal y la
edad: *"Comité del 10 de agosto, hace 6 días"*. Y pasada una **ventana de vejez (propuesta:
21 días)**, el contexto de comité **no entra al paquete**: un compromiso de hace seis semanas
no está pendiente, está abandonado, y presentarlo como pendiente es la vía más corta a que
el bloque pierda credibilidad.

**R-10 · La cifra que se muestra es siempre la del sistema — nueva.** §4.3 completa.

**Cotejo al pintar.** Sin cambios y ahora con un requisito explícito: la revalidación del
bloque 4 tiene que leer **el mismo data layer, en el mismo instante**, que el bloque 1 y el
pulso. Dos consultas distintas reintroducen la contradicción que §2.3 acaba de cerrar por
estructura.

### 4.3 Comité contra sistema: quién gana

**La cifra que se muestra es siempre la del sistema. Sin excepciones.** El comité no es una
fuente de datos: es un registro de lo que se dijo en una conversación.

Pero *la contradicción en sí* sí puede ser una acción recomendada, y de las mejores — sólo
que antes hay que descartar tres explicaciones inocentes, **en este orden**. Si alguna es
posible, **no hay contradicción y no hay acción**:

1. **Los períodos no son el mismo.**
2. **El dato del sistema todavía se está capturando.**
3. **Las unidades o el alcance no son el mismo.**

**El caso que motiva la regla, verificado.** El comité del 10-ago dice *"se trabajaron 48
jornales en la semana, con un costo total de $4.400.000"*. El sistema dice **48,0 la semana
anterior** y **45,0 la actual**. Un motor ingenuo publica *"el comité reporta 48 jornales, el
sistema registra 45"* el primer día de vida del bloque. **Y estaría equivocado:** es el caso
(1). El comité es del lunes 10 y habla de la semana que acababa de cerrar (04–10), que el
sistema tiene en **48,0 — idénticos**. El tablero muestra la semana en curso. **No hay
discrepancia alguna; hay dos ventanas distintas.**

Un solo caso como ése, publicado, y el bloque queda marcado como "el que se equivoca". Por
eso los tres filtros son obligatorios y por eso O-5 no está en la v1.

**Cuando una contradicción sobrevive a los tres filtros** (v1.1), esto es lo que se ve:

- la **cifra del sistema** ocupa el lugar del número, en peso normal;
- la **cifra del comité** aparece **sólo** dentro de la cita atribuida, en la evidencia;
- la acción es *"Confirmar la cifra de X con quien la reportó"*, y su destino es la pantalla
  donde vive el número del sistema, para que el lector pueda mirarlo él mismo;
- **el bloque no arbitra.** No dice "el sistema está bien". Puede perfectamente ser el
  comité el que tenga razón y el sistema el que tenga filas sin capturar — que es, de hecho,
  el escenario más probable en esta finca. Presenta las dos con su fuente y pide una
  resolución humana.

### 4.4 Hallazgo colateral: el reporte semanal ya lee páginas que no son de la finca

No es parte de este feature, pero se encontró revisándolo y afecta a algo que ya está en
producción. `fetchResumenesNotion()` toma **las 4 páginas más recientes por fecha, sin
ningún filtro** de tag ni de título, y concatena su contenido al prompt del Reporte Semanal
bajo el encabezado "LLAMADAS CON PROPIETARIO — ÚLTIMAS 4 SEMANAS". En una base donde
conviven Quantis, Visa, Kaffeto, Cartama y **Personal**, eso significa que el contenido de
una llamada que no tiene nada que ver con la finca puede haber entrado —y con 82 filas en 16
meses, casi con certeza ha entrado— al prompt del reporte de la finca.

Son dos problemas a la vez: contaminación del contexto y contenido privado atravesando un
sistema donde no pinta nada. **R-8 lo resuelve para el motor, y el mismo criterio debería
aplicarse al recolector del reporte semanal.** Es una corrección pequeña y anterior a este
feature; se levanta aquí para que no se pierda.

---

## 5. El modelo de priorización

**No hay score.** Un score ponderado es indefendible ante la única pregunta que importa
—"¿por qué ésta primero?"— porque la respuesta honesta es "porque 0,73 > 0,68". Se usa un
**orden lexicográfico**: tres criterios aplicados en secuencia, cada uno desempatando al
anterior.

> **Este orden se reescribió el 2026-08-17 y conviene decir por qué.** La versión anterior
> ponía primero *"lo que no se puede recuperar"*. **Cero de las cinco buenas del dueño son
> irrecuperables**, y tres son explícitamente cosas atascadas: *"sigue abierta la tarea"*,
> *"lleva bloqueada varios meses"*, *"tener todo listo a tiempo"*. El error no fue el orden
> sino el umbral: **"irrecuperable" es casi vacío en este bloque, porque el bloque 1 ya se
> llevó lo irrecuperable por construcción** — la quincena de leche, el secado vencido, todo
> lo que tiene un botón que lo cierra. Lo que le queda al bloque 4 es precisamente lo que
> **no** tiene botón, y eso es lo atascado. El criterio correcto no es catastrofista, es
> **fechado**.

| | Criterio | Qué es | Por qué va ahí |
|---|---|---|---|
| **1º** | **Lo que tiene fecha encima** | hay una fecha declarada dentro de los próximos 7 días, o ya vencida. Se ordena por cercanía o por atraso de esa fecha | Es el único caso donde un día más de espera cuesta algo concreto. *La enmienda arranca el 18 y faltan 4.694 kg de Silicalmag* — un día tarde y la aplicación arranca sin producto |
| **2º** | **Lo que lleva más tiempo esperando sin que nadie lo mueva** | antigüedad del bloqueo, en días | Es donde vive el 60% de lo que el dueño pidió, con sus propias palabras. Es objetivo, ya está en el dato (toda evidencia lleva fecha por R-3) y sirve directo al Momento B. *Hércules y microbiología: 200 días* |
| **3º** | **El tamaño del conjunto** | N objetos afectados, **normalizado dentro del negocio** | 11 vacas pesan más que 5 vacas. Comparar 11 vacas contra 2 aplicaciones no significa nada, y por eso no se compara entre negocios |

**Antes del orden va un filtro, y hace más trabajo que el orden entero:** A-7. Si la respuesta
ya está en marcha, o si cerrarla no depende del lector, la candidata no llega a ordenarse. Eso
elimina tres de las cinco molestas antes de que ninguna comparación ocurra. **La calidad de
este bloque se decide más en la admisión que en la priorización**, y conviene tenerlo presente
cuando alguien proponga afinar pesos.

**La frase que el lector recibe si pregunta**, y que puede ir literal en pantalla:

> **"Primero lo que tiene fecha; después, lo que lleva más tiempo esperando sin que nadie lo mueva."**

**Contraste contra el set de referencia.** Aplicado a sus cuatro buenas producibles, el orden
da: **la enmienda** (fecha, 1 día) → **la ejecución presupuestal de julio** (revisión vencida,
con fecha de cierre de mes) → **Hércules y microbiología** (200 días) → **la productividad del
hato** (revisión, sin fecha dura). Es un orden que se puede leer en voz alta y defender sin
consultar una fórmula, que es todo el requisito.

**Quién aplica el orden.** El data layer, de forma determinista y con prueba unitaria. **El
motor no ordena.** Sí puede **descartar** candidatas —juzgar que un hecho cierto no merece la
atención del lector es exactamente lo que un modelo hace mejor que un umbral— y los
supervivientes conservan su orden relativo. Descartar es un filtro; no es una permutación.

**El motor en una línea, cuatro etapas y el modelo sólo en la tercera:**

> el data layer **genera** candidatas con umbrales del dueño → las **ordena** lexicográficamente →
> el motor **filtra y redacta** → el render **coteja** contra datos frescos y publica.

**Cupos.** Hasta **6 candidatas por negocio** llegan al motor; se publican **hasta 3**. El
tope de entrada acota el trabajo del modelo y deja un conjunto de descartadas analizable —
que además es el grupo de control de §7, K-3.

**Si un negocio no tiene ninguna candidata sobre umbral, el motor no se llama para ese
negocio.** El estado "vacío honesto" queda garantizado por estructura y no por prompt, y es
la defensa más barata contra la contra-métrica de §7 del documento anterior ("si el bloque
siempre tiene 3, alguien está rellenando").

---

## 6. El bucle de retroalimentación

### 6.1 Qué se guarda al pulsar "No es útil"

La clave estable de la acción (§2.4), los hechos que la sostenían, quién y cuándo. **Y una
razón, elegida entre cuatro chips que aparecen justo después del toque** y se pueden
ignorar:

| Chip | Qué falló de verdad | A quién le llega |
|---|---|---|
| **"Ya está hecho"** | frescura, o falta un evento en el sistema | datos / captura — **no es fallo del motor** |
| **"No es prioridad ahora"** | el orden o el umbral | producto (§5) |
| **"El dato está mal"** | el data layer | ingeniería — **el más valioso: el motor encontró un bug** |
| **"No entiendo qué me pide"** | la redacción | el motor |

Sin esos cuatro chips, la tasa de descarte es un número que no dice qué arreglar: un 40% de
descarte por "ya está hecho" significa que el motor funciona y los datos van atrasados,
mientras que un 40% por "no es prioridad" significa lo contrario. **Un toque de más convierte
una métrica inútil en cuatro accionables.** Es lo que `hato_alertas` no tuvo, y por eso hoy
sabemos que 63 de 64 se descartaron y no sabemos por qué.

### 6.2 Qué se guarda cuando se ejecuta

**"Ejecutada" no es observable** — el botón navega y lo que pasa después ocurre en otra
pantalla, o en el campo. Lo que sí es observable son dos cosas distintas:

- **Clic en el botón primario** = intención. Indicador adelantado, y se puede inflar sin
  querer.
- **Resolución** = *el hecho que sostenía la acción dejó de ser cierto dentro de los 7 días
  siguientes a su publicación*. Es el resultado.

La resolución es medible sin instrumentar ninguna pantalla de destino, no se puede simular
haciendo clic, y es la definición honesta de que el bloque funcionó. Se apoya enteramente en
A-6: la condición de muerte de cada acción **es** su condición de resolución. Sin A-6 no hay
esta métrica.

**Excepción única, y es a favor: O-8.** En una revisión periódica la acción *es* mirar, así
que el clic no es intención — **es** el trabajo, y reinicia el reloj (G-3). Es el único origen
donde clic y resolución coinciden, y por eso el único que se puede medir el mismo día. Con la
contrapartida honesta de que ahí la métrica sí se puede inflar haciendo clic sin leer; se
acepta, porque la cadencia vuelve a traer la revisión en el período siguiente de todos modos.

### 6.3 En la v1 se mide y se silencia. No se aprende.

**Posición explícita: la v1 no realimenta.** Tres razones:

1. **No hay volumen.** Máximo 9 acciones al día y un puñado de lectores Gerencia. En seis
   semanas de evaluación cualquier adaptación estaría ajustando ruido.
2. **La adaptación silenciosa hace indepurable el bloque** justo en la ventana en la que hay
   que decidir si vive. Si el motor cambia solo, no se sabe si mejoró él o cambió la finca.
3. **Lo que sí hace falta no es aprendizaje, es respeto:** una acción descartada **no vuelve
   durante 14 días**, salvo que su hecho cambie materialmente (el conjunto crece de forma
   apreciable, o su antigüedad cruza un umbral más duro). Es un silencio determinista, no una
   adaptación. Sin él, el bloque re-propone mañana lo que se rechazó hoy, que es la forma más
   rápida de enseñarle a alguien a ignorar una sección.

**Qué tendría que ser cierto para añadir aprendizaje (v2, no antes):** al menos **100
descartes con razón** acumulados, y el set de referencia de Santiago (§7) reservado como
conjunto de validación que el aprendizaje no haya visto. Sin las dos cosas, "aprender" es
sobreajustar a las últimas tres semanas.

### 6.4 Se guarda cada generación, y no es opcional

La pregunta 8 de §11 queda cerrada en **sí, obligatorio desde el primer día**, y el motivo
no es auditoría: **es que sin eso el bloque no se puede evaluar.**

- Los cuatro chips de descarte son ininterpretables si no se sabe con qué hechos se generó
  la acción: *"el dato está mal"* — ¿el que se ve ahora, o el de la corrida de hace seis
  horas?
- K-3 (§7) compara publicadas contra no publicadas. **Si las candidatas descartadas por el
  motor no se guardan, el grupo de control no existe** y el criterio de muerte más fuerte se
  vuelve inaplicable.

Se guardan los hechos de entrada, las candidatas descartadas y el texto de salida. Cómo, es
del CTO. Un bloque que no se puede evaluar no debería liberarse, así que esto es
prerrequisito, no mejora.

---

## 7. Cómo se valida antes de soltarlo, y con qué se apaga

### 7.1 La prueba del sobre cerrado — cuatro rondas, antes de liberar

**Ronda 0 · El set de referencia — ✅ HECHA (2026-08-17).** Está en
[`docs/set_referencia_acciones.md`](set_referencia_acciones.md) y ya rindió antes de que se
escribiera una línea de motor: dos criterios de admisión nuevos (A-7, A-8), un origen nuevo
(O-8) y el orden de §5 reescrito. **Ese es el retorno de veinte minutos de escritura del
dueño**, y conviene registrarlo para la próxima vez que alguien proponga saltarse este paso.

**Ronda 1 · Prueba ciega de utilidad (Santiago, 10 minutos, en el celular).** El motor corre
contra una foto congelada de un día real. Sus ~9 salidas se **mezclan** con las buenas y las
molestas del set de referencia, se les quita toda marca de origen, se barajan, y se le
presentan como una lista plana. Él marca cada una: **la haría / no la haría**. Aceptación:

- **≥ 6 de las 9 del motor marcadas "la haría"**, y
- **ninguna de las del motor por debajo de sus propias "molestas"** — si el motor produce lo
  que él mismo identificó como molesto, no está listo.

Es la única evaluación de este plan que no se autocalifica.

**Ajuste al denominador, tras procesar el set:** el motor se mide contra **cuatro** de las
cinco buenas, no cinco. La #2 (asignación de lotes de las compras de ganado) la sirve el
**bloque 1** con un botón que la cierra, y por la regla de §2.3 el motor tiene prohibido
producirla (§3.5). Se verifica aparte, en el bloque 1, y no cuenta contra el motor en ninguna
dirección.

### 7.1 bis · Lo que este método NO puede validar

**La prueba ciega no detecta R-7, y hay evidencia directa de ello.** Al armar el set se le
ofrecieron a Santiago varias molestas candidatas, entre ellas la que este documento había
marcado como **el fallo más peligroso de todos**: *"La producción del hato bajó: 416,5 L el 12
de agosto frente a 493 L en junio"* — un hueco de captura (7 de 34 vacas sin pesar) leído como
una caída. **No la escogió.**

Y es perfectamente coherente: **esa frase no suena molesta, suena alarmante.** Pasa el filtro
humano precisamente por ser una buena mentira. Un juicio humano no puede validar una barrera
que existe para atrapar algo que se ve bien; se necesitaría que el lector recordara, en ese
momento, cuántas vacas se pesaron ese día — que es exactamente el trabajo que el tablero está
para ahorrarle.

**Consecuencia, y es una restricción sobre el método que yo mismo propuse:** R-7 queda cubierta
**enteramente por mecanismo** —el validador de sin-dato-mal-usado y el denominador visible
obligatorio ("27 de 34 vacas pesadas", regla R-4 del módulo de hato)— y por la **Ronda 2**, que
es cotejo mecánico contra el data layer y no juicio de nadie. **Ninguna cantidad de rondas
ciegas sustituye ese validador**, y si alguna vez hay que elegir entre ampliar la Ronda 1 y
mantener la Ronda 2, se mantiene la Ronda 2.

Generalizando, porque no es un caso aislado: **el set de referencia valida la *utilidad*, no la
*veracidad*.** Son dos ejes independientes y el dueño sólo puede juzgar el primero. La
veracidad es cotejo, y el cotejo no se delega en una persona.

**Ronda 2 · La prueba del día feo (equipo, bloqueante).** Corrida contra los datos reales de
hoy, con todos los casos sucios vivos: 7 vacas sin pesar · 3 de 10 días de lluvia congelada ·
agosto sin ingresos · 6 fincas sin hectáreas · "santimp" sin normalizar · el 48-contra-45 del
comité. Cotejo manual de **cada dígito visible** contra el data layer. **Bloqueo de release**
si ocurre cualquiera de estas seis:

1. un dígito no rastreable a una ranura tipada o a una cita literal (R-2);
2. un hueco renderizado como `0` o leído como caída (R-7);
3. una acción sin destino (A-4);
4. una acción que duplica una fila del bloque 1;
5. una cita de comité que no sea subcadena literal de la fuente (R-2b);
6. una discrepancia comité-sistema publicada sin haber descartado los tres inocentes (§4.3).

**Ronda 3 · Prueba de repetición.** Tres corridas sobre la misma foto congelada. Aceptación:
**el conjunto de hechos elegidos es idéntico las tres veces** y ninguna acción cambia de
significado entre corridas. Variación de redacción, permitida; variación de significado,
prohibida. Un bloque compartido que dice cosas distintas a dos lectores el mismo día no es
un centro de control.

### 7.2 Los tres umbrales de muerte

Se revisa **a las 6 semanas de liberado, en una fecha puesta en el calendario el día del
release**. La decisión es *seguir o retirar*; "démosle otro mes" no es una opción admisible
sin evidencia nueva. Que nadie hubiera puesto esa fecha es la razón por la que `hato_alertas`
llegó a 63 de 64 sin que nadie lo declarara.

| | Criterio | Umbral | Por qué |
|---|---|---|---|
| **K-1** | **Descarte** | descartes ÷ (descartes + clics) **> 50%** → **se retira** | Ya acordado en §7 del documento anterior. La referencia está en casa: `hato_alertas`, 63 de 64 |
| **K-2** | **Indiferencia** | **> 70%** de las publicadas sin clic **y** sin descarte → **se retira** | El modo de muerte más probable y el que ninguna métrica actual detecta. Un descarte es interacción; el scroll no. Un bloque que se salta con el pulgar ya perdió, aunque su tasa de descarte sea 0% |
| **K-3** | **Resolución sin efecto** | la tasa de resolución de las **publicadas** no supera la de las **no publicadas** (candidatas en posición 4+) → **se retira** | Es un cuasi-experimento con grupo de control gratis: esas candidatas ya se calculan y ya se guardan (§6.4). Si lo que se publica no se resuelve más que lo que no se publica, el bloque no cambió nada — sólo ocupó pantalla |

**Retirar, no afinar.** Es la regla del documento anterior y se mantiene literal: afinar un
bloque que ya perdió la confianza del lector es la trampa exacta en la que cayó el motor de
alertas del hato.

---

## 8. Decisiones para Santiago

> **RESUELTAS — Santiago respondió el 2026-08-17.** Escogió la opción recomendada en las
> cuatro que se le plantearon: **D-1 (a)** sistema + huecos de captura, sin comités en la v1;
> **D-2 (a)** manda el sistema, la cifra del comité entrecomillada y la acción es confirmar;
> **D-4 (a)** escribe él mismo el set de referencia de 10 acciones **antes** de que se
> construya; **D-5 (a)** el bloque sí puede señalar un compromiso incumplido, en tono neutro
> y sin nombrar personas — así que la v1.1 existe y el cruce comité×sistema es el objetivo.
>
> **D-3 (ritmo) no se le preguntó**: se toma (a) *cada mañana*, que es lo que el brief
> técnico ya asume (`pg_cron` 05:50 Bogotá) y lo que la interfaz ya promete con el chip
> "Sugerido". Si eso resulta molesto, es un cambio de una línea de cron.
>
> El texto de abajo se conserva como el registro de las alternativas que se descartaron y de
> por qué. No lo edites para reflejar la respuesta: el valor está en que se vea qué se dejó
> de hacer.

Cinco. Todas se responden marcando una opción.

---

**D-1 · ¿Qué entra en la primera versión?**

- **(a) Señales del sistema + huecos de captura.** El comité sólo mueve de puesto lo que ya
  salió del sistema. ← *recomendada*
- (b) Lo de (a) **y además** compromisos del comité sin cerrar desde el día 1.
- (c) Sólo señales del sistema, sin los huecos de captura.

*Por qué (a):* el cruce comité×sistema es el premio, pero hoy "San Fernando" no existe en el
sistema y "El Salto" sólo se parece a "Salto Tequendama". Acusar de un incumplimiento que sí
se cumplió cuesta la confianza en toda la pantalla, y eso no se recupera. (b) además llena el
bloque con los 12 pendientes de un solo acta.

---

**D-2 · Cuando el comité afirma una cifra que el sistema contradice** (y ya se descartó que
sean semanas distintas):

- **(a) Manda el sistema en el número que se ve; la cifra del comité aparece entrecomillada
  en la evidencia, y la discrepancia genera una acción de "confirmar la cifra". El tablero no
  dice cuál es la correcta.** ← *recomendada*
- (b) Manda el sistema y la cifra del comité no aparece nunca en pantalla.
- (c) Se muestran las dos con el mismo peso y decide el lector.

*Por qué (a):* la cifra del comité puede ser la correcta y el sistema el que tiene filas sin
capturar — en esta finca ése es el escenario más probable. (b) esconde información real; (c)
convierte cada duda en un empate que nadie resuelve.

---

**D-3 · ¿Cada cuánto cambian las acciones?**

- **(a) Se regeneran cada mañana temprano**, antes del barrido de las 6:00. ← *recomendada*
- (b) Una vez por semana (domingo en la noche) y quedan fijas toda la semana.
- (c) Cada mañana, pero si nada cambió de forma apreciable se quedan congeladas hasta el
  lunes.

*Por qué (a):* el Momento A es diario y el bloque tiene que estar cotejado contra datos de
esta madrugada. El riesgo de agotamiento que motivaba (b) ya está cubierto por otras dos
reglas: un descarte silencia esa acción 14 días, y el estado vacío honesto es obligatorio.

---

**D-4 · El set de referencia para poder evaluar el motor.** — ✅ **RESPONDIDA (a), 2026-08-17.**

Está en [`docs/set_referencia_acciones.md`](set_referencia_acciones.md). Se procesó y forzó
tres cambios en este documento antes de escribir una línea de motor: A-7 y A-8 (§2.2), O-8
(§3.4) y el orden de §5. **Queda una tarea derivada, pequeña:** declarar la **cadencia** de
las revisiones periódicas que él quiere (G-1) — al menos las dos que nombró, presupuesto y
productividad del hato. Sin cadencia declarada, O-8 no produce nada.

---

**D-5 · ¿Puede el bloque señalar un compromiso incumplido, sabiendo que lo leen todos los
usuarios de Gerencia?** (Aplica sólo si algún día entra el cruce comité×sistema.)

- **(a) Sí, pero en modo neutro: la frase nombra el trabajo y el lote, nunca a la persona, y
  el compromiso va como cita del acta.** ← *recomendada*
- (b) Sí, sin restricción: si alguien se comprometió, que aparezca.
- (c) No. Los compromisos del comité no se cruzan con el sistema en una pantalla compartida.

*Por qué importa:* determina si el cruce comité×sistema —la parte de más valor de esta idea—
tiene sentido construirlo. Si la respuesta es (c), la v1.1 no existe y hay que decirlo ahora.

---

**Decisiones que tomo yo y quedan revisables** (no ocupan chip):

- La ventana de vejez del contexto del comité es de **21 días**; pasado eso no entra al
  paquete (R-9).
- El descarte sigue siendo **compartido y atribuido**, como quedó en §4.2 del documento
  anterior. Si genera roces entre usuarios de Gerencia, se revisa.
- El silencio tras un descarte es de **14 días**, salvo cambio material del hecho.

---

## 9. Lo que este documento le exige al CTO

Restricciones de producto, no soluciones. El cómo es suyo.

**0. Falta un hecho en el catálogo del paquete, y es el que produce la mejor acción de hoy.**
El **faltante de insumo contra una aplicación programada** —`aplicaciones` →
`aplicaciones_mezclas` → `aplicaciones_productos.cantidad_total_necesaria` contra
`productos.cantidad_actual`— no está entre los hechos de aguacate que el paquete recoge. Con
él, hoy se produce: *"Aplicacion Enmienda arranca el 18 de agosto y faltan 4.694 kg de
Silicalmag (necesita 12.694, hay 8.000)"*, que es literalmente la primera acción de la lista
del dueño y la única que pasa las ocho preguntas de admisión con margen. Hay tres faltantes
menores más en las aplicaciones en curso (Acondicionador sys, Magister, Proxam). **Es lo
primero que hay que añadir al catálogo**; sin él, la v1 no puede reproducir la mejor acción
disponible.

**0 bis. O-8 necesita dos cosas del sistema:** el `MAX(fecha)` por revisión (que el bloque 6
ya calcula para otras señales) y **la cadencia declarada por el dueño** (G-1), que es
configuración, no código — mismo precedente que `hato_config`. El destino de la revisión de
productividad del hato **existe y está verificado**: `RankingVacas` (`/hato-lechero`,
`rendimientoPorVaca`), así que A-4 se cumple sin construir pantalla nueva.

1. **El paquete de hechos y las candidatas descartadas se guardan en cada corrida.** Sin
   eso, K-3 es inaplicable y los chips de descarte son ininterpretables (§6.4). Es
   prerrequisito de release, no mejora.
2. **Una acción tiene identidad estable que sobrevive a la regeneración** (§2.4). Sin ella
   no hay silencio tras descarte, ni medición de resolución.
3. **La revalidación al pintar lee el mismo data layer, en el mismo instante, que el bloque
   1 y el pulso** (§4.2). Dos consultas distintas reabren la contradicción que §2.3 cierra
   por estructura.
4. **El orden es determinista y probado con prueba unitaria** (§5). El modelo no permuta.
5. **R-2 necesita las dos comprobaciones**: ranura tipada para las cifras del sistema, y
   **subcadena literal** para las citas del acta.
6. **La selección de páginas de Notion es positiva y no depende del `Tag`** (R-8) — y el
   mismo criterio debería aplicarse al recolector del Reporte Semanal, que hoy no filtra
   nada (§4.4).
7. **Si el motor necesita el contexto de Notion, corre en el servidor**: el `NOTION_TOKEN` no
   puede viajar en el bundle. Ya estaba en §10 del documento anterior; se repite porque D-1
   la activa o la desactiva.
8. **Fuera del camino crítico, sin skeleton, sin acceso a la base ni a las herramientas de
   Esco.** Sin cambios respecto de §4.1 y §10 del documento anterior.

---

## 10. Los cinco hechos que resumen este documento

- **48 contra 45** no era una discrepancia: era la semana cerrada contra la semana en curso.
  El motor que no descarte eso primero se estrena equivocándose.
- **"San Fernando" no existe** en `lotes`, ni en las fincas de ganado, ni en el repositorio.
  El vocabulario del comité no es el del sistema, y ahí es donde el cruce se rompe.
- **12 de las 12 filas más recientes de Notion no tienen `Tag`**, y son justamente todos los
  comités recientes. Cualquier filtro que dependa del etiquetado se queda con lo viejo.
- **Cero de las cinco acciones que el dueño más quiere son irrecuperables**, y tres son cosas
  atascadas. El bloque 4 no es la bandeja de lo urgente — el bloque 1 ya se llevó eso. Es la
  bandeja de lo que lleva meses esperando a que alguien lo desbloquee.
- **4.694 kg de Silicalmag** faltan para una aplicación que arranca en un día, y **ningún
  hecho del paquete lo sabe todavía**. Es la mejor acción disponible hoy y hay que ir a
  buscarla.
