# Sesion de decisiones — 2026-09-09

**Tipo**: sesion interactiva con Santiago. No es una corrida de barrido.
**Escrituras a produccion**: ninguna.
**Hallazgos nuevos filados**: ninguno.
**Objeto**: recoger las decisiones que el backlog estaba esperando, para que el drenaje del
viernes pueda avanzar sin bloquearse en una pregunta.

---

## Resumen ejecutivo

Santiago pregunto si se podian atacar de una sola vez los puntos talla S del backlog. La respuesta
corta fue: si, pero no como un bloque de 21 arreglos. **De los 21 puntos talla S, solo 8 son
trabajo de codigo real.** El resto ya estaba hecho y esperando despliegue, o esperaba una decision
suya, o esperaba a una persona.

Decidio entonces algo mejor que una sesion larga: contestar las decisiones de una vez y dejar que
el viernes haga lo suyo. Esta sesion recogio **siete decisiones** y corrigio **dos clasificaciones
equivocadas** que le habrian costado una semana cada una al drenaje.

---

## El backlog, medido

27 hallazgos abiertos. 21 con `Esfuerzo = S`. Se reparten en cuatro grupos, no en uno.

| Grupo | Que es | Cuantos |
|---|---|---|
| A — ya arreglado, falta desplegar | El PR esta fusionado. No queda codigo por escribir | 6 |
| B — codigo puro, sin aprobacion | Un PR cada uno | 8 |
| C — necesitan decision de Santiago | Baratos una vez decididos | 5 |
| D — necesitan a otra persona | No cierran en sesion | 2 |

**El grafo tiene una sola raiz**: el hallazgo #82, la edge function sin desplegar, bloqueaba seis
arreglos ya fusionados.

---

## Las siete decisiones

### 1. Uriel sube a Administrador (#67)

Se descarta darle un predicado propio en las tablas `rondas_*`, y se descarta que Gerencia siga
corriendo la ronda sola. Consecuencia aceptada: Uriel gana escritura en todo lo que hoy tiene
Administrador, no solo en la ronda. Desbloquea ademas el hallazgo de las 20 tablas always-true.

### 2. GO para borrar la clave de recordatorio de septiembre (#73)

Una fila. La propuesta ya estaba filada con su sentencia, su rollback y su pre-chequeo, asi que el
go cumple §6. **El go no sobrevive a la sesion**: la proxima sesion en vivo necesita uno nuevo.

### 3. GO para subir el timeout de los tres pg_cron a 30 s (#55)

Alcance confirmado: los tres jobs, no solo el de clima. Cero filas afectadas.

### 4. El changelog se muda a `escociaos-po/reports/CHANGELOG.md` (#71)

Opcion (b) de las tres registradas. Es la unica que no debilita §6 ni agrega un PR por corrida.
**Cierra la contradiccion** que la memoria compartida llevaba abierta desde el 2026-08-27.

### 5. Las 35 vacas sin raza se dejan asi (#56)

Riesgo aceptado y documentado: si alguna es normanda, su alerta de secado sale un mes tarde y nadie
lo nota. **No volver a preguntarlo en corridas futuras.**

### 6. La politica de Storage la aplica Santiago a mano (#75)

Ningun agente puede: `ALTER POLICY` sobre `storage.objects` exige ser dueño de la tabla, y
`apply_migration` corre como `postgres`, que no lo es. Aborta con `42501`. La unica via es el panel
de Supabase. El riesgo se cierra solo cuando entre Uriel, porque la politica nueva incluye
Administrador.

### 7. El drenaje del viernes va agrupado, maximo 4 artefactos

Encaja exacto con el tope de la constitucion: 3 PR de codigo mas 1 migracion.

---

## Dos clasificaciones corregidas

El runbook del viernes dice que ante una clase equivocada la corrida «writes the value back, and
leaves it for next week». Cada clase mal puesta cuesta una semana. Se corrigieron en esta sesion:

- **#55: `ddl_aditivo` → `datos`.** El arreglo es `SELECT cron.alter_job(...)`, una llamada a
  funcion, y la lista blanca de la compuerta 1 exige que cada sentencia **empiece** por una forma
  DDL concreta.
- **#63: `codigo` → `ddl_aditivo`.** Es un `CREATE OR REPLACE FUNCTION`, que si esta en la lista
  blanca. Se dejo aviso para la compuerta 3: **cambia comportamiento vivo**, que es exactamente el
  caso que el revisor adversarial debe cazar.

---

## Plan del viernes, ya armado

- **PR A — documentacion**: #69 + #80. Los dos editan el `CLAUDE.md` raiz, asi que van juntos.
- **PR B — guardas**: #48 + #66.
- **PR C — despliegue**: #78 + #77.
- **Migracion** (unica ranura): #63.
- **Compite y puede desplazar**: #71, ahora que es `clase codigo`.
- **Sobrante consciente**: #61 parte A.

Los arboles espejo (#61, #63) nunca corren en paralelo: los toca el mismo script de regeneracion.

---

## Lo que el viernes NO puede tocar

- **#82** es P1. La piedra angular del grafo no es del viernes.
- **#60, #62, #64, #72, #83** estan `In progress`, y la elegibilidad exige `Not started`. Sus PR ya
  estan fusionados; lo unico pendiente es verificar el despliegue por contenido y cerrarlas.
- **#67, #73, #55, #56, #75, #85** son `datos` o `decision`.

**La edge function figura en v248, desplegada el 2026-09-09 a las 09:22:25Z**, posterior a los
merges del 04 y del 08. Eso no cierra nada por si solo: hay que verificar por contenido del bundle,
nunca por `updated_at`. Si carga los seis arreglos, se cierran #60, #62, #64, #72, #80 y #83.

---

## Pendiente de Santiago, en orden de valor

1. Aplicar las dos `ALTER POLICY` del bucket `reportes-semanales` en el panel de Supabase.
2. Dar un go nuevo, en una sesion en vivo, para las tres escrituras decididas (#73, #55, #67).
   Para #67 falta filar antes la sentencia exacta con su rollback.
3. Fusionar este commit de memoria a `main` antes del viernes, para que la corrida lo lea.
