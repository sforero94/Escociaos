# Set de referencia — 10 acciones, escritas por Santiago

**Para llenar antes de que se construya el motor.** ~20 minutos. Decisión D-4 (a), 2026-08-17.

Esto no es una encuesta: es el criterio objetivo contra el que se mide el motor. Sin él, "¿está
bueno?" se resuelve por opinión el día del release, que es cuando peor se decide. Con él, hay una
respuesta antes de escribir la primera línea.

---

## Cómo llenarlo

Escribe **5 acciones que te habrían servido** y **5 que te habrían molestado**, como si el tablero
te las hubiera mostrado esta semana. Escríbelas con tus palabras, en una frase. No te preocupes por
el formato ni por si el dato existe — de eso me encargo yo al procesarlas.

Las molestas son tan importantes como las buenas, y son más difíciles de escribir. Piensa en lo que
te haría cerrar la pantalla: lo obvio, lo que ya sabías, lo que no puedes resolver hoy, lo que suena
a que el sistema no entiende cómo funciona la finca.

Si se te ocurre por qué molesta, escríbelo en la línea de abajo. Una frase basta. Si no, déjala.

---

## Las 5 que me habrían servido

**1.** Confirmar insumos para aplicación de la enmienda
> *Por qué:* recordatorio para tener todo listo a tiempo antes de una aplicación

**2.** Completar la asignación de lotes para las compras de ganado
> *Por qué:* porque sigue abierta la tarea

**3.** Programar tarea de Hércules y micro biología con contratistas
> *Por qué:* lleva bloqueada varios meses y tiene impacto directo en productividad

**4.** Revisar ejecución presupuestal para mes de Julio
> *Por qué:* Recordatorio para correr un reporte con Esco sobre el presupuesto

**5.** Correr análisis de productividad del hato
> *Por qué:* Porque debemos estar constantemente revisando qué vacas mantener o no

---

## Las 5 que me habrían molestado

**1.** Cerrar las aplicaciones abiertas
> *Por qué molesta:* están en curso, no es un tema de escritorio sino de campo

**2.** Revisar la producción del hato: está en 15,4 L/vaca.
> *Por qué molesta:* es info que está arriba

**3.** Atención: el ácaro superó el 15 % de incidencia.
> *Por qué molesta:* hay fumigaciones en curso para atenderlo

**4.** Normalizar el nombre de la finca "santimp".
> *Por qué molesta:* Es cierto, pero no cambia ninguna decisión esta semana

**5.** Pedirle a la agrónoma el informe mensual.
> *Por qué molesta:* No está en el sistema, no tiene botón, y depende de un tercero. El tablero no puede cerrarla.

---

## Dos ejemplos, sólo para que veas la forma

No los copies — son míos, no tuyos, y el valor está en que sean tuyos.

**Serviría:** «Secar las 5 vacas que ya pasaron su fecha; la más atrasada lleva 23 días.»
> *Por qué:* es un conjunto cerrado, sé exactamente qué hacer, y cada día que pasa cuesta plata.

**Molestaría:** «Revisa el gasto de agosto, va en $66,5M.»
> *Por qué molesta:* eso ya lo veo en la tarjeta de arriba, no me dice qué hacer, y "revisar"
> no es una acción.

---

## Cadencias declaradas

Santiago, 2026-08-17. Requisito de la guarda **G-1** del origen O-8: la cadencia la declara el
dueño, **nunca se infiere**. Estas dos filas son lo único que hace falta para que O-8 produzca
las acciones #4 y #5 de arriba — no hay código detrás, son configuración.

| Revisión | Cadencia | Se dispara |
|---|---|---|
| Ejecución presupuestal | **mensual** | al cerrar el mes, por negocio |
| Productividad del hato — qué vacas mantener | **con cada chequeo veterinario** (~60 días) | cuando el chequeo entra, con información reproductiva fresca para cruzar con producción |

La segunda se engancha al ritmo real del hato en vez de a un calendario: la decisión de descarte
llega cuando hay dato nuevo con qué tomarla, no cuando toca por almanaque.

---

## Qué pasa después

Las 10 se convierten en el corpus de oro de `accionesAntiInvento.test.ts`. El motor tiene que
producir algo parecido a tus 5 buenas y **no producir** nada parecido a tus 5 molestas. Si al
construirlo resulta que no distingue unas de otras, eso es la señal de parar — y sale antes de
soltarlo, no seis semanas después.

Documentos hermanos:
[`plan_motor_acciones_recomendadas.md`](plan_motor_acciones_recomendadas.md) §7 (cómo se valida y
con qué se apaga) · [`brief_tecnico_motor_acciones.md`](brief_tecnico_motor_acciones.md) (el test).
