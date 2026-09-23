# Drenaje del ledger — proyecto de una sola pasada

**Fecha**: 2026-09-21 · **Pedido de Santiago**: «quiero limpiar el ledger de Notion
completo … trátalo como un solo proyecto de varias fases y no como tareas acumuladas».
**Modo**: autónomo, con punteo sólo cuando haga falta.

## Decisiones que abrieron el trabajo

Santiago contestó las 8 preguntas de arranque. Las que cambiaron el alcance:

| # | Pregunta | Respuesta | Consecuencia |
|---|---|---|---|
| 2 | ¿Ruta de escritura? | «Actualiza la ruta a composio, donde hay escritura» | PR #278 |
| 3 | ¿ESCO-117? | «Aparte por ahora, quíta el flujo de gastos» | PR #282 + migración 162 |
| 6 | ¿Cuenta Grok Bot? | «Deja la cuenta … hay que monitorearlo igual» | ESCO-122 **cerrado** |
| 7 | ¿Foto del pesaje? | «No puedo ahora, deja ese pendiente» | ESCO-124 queda abierto |
| 8 | ¿Cadencia? | «Autónomo y me punteas solo si me necesitas» | sin punteos intermedios |

## Estado del ledger

Entró con **10 fichas** sin cerrar. Al momento de este informe: **1 cerrada**, **8 en
curso con PR**, **1 aplazada por Santiago**.

| Ficha | Sev | Clase | PR | Estado |
|---|---|---|---|---|
| ESCO-114 | P1 | decision | #278 | En curso — la mitad de las Rutinas la hace Santiago |
| ESCO-115 | P2 | ddl_aditivo | #280 | En curso — migración 160 |
| ESCO-116 | P2 | datos | #279 | En curso — migración 159 |
| ESCO-117 | P2 | decision | #282 | En curso — migración 162 |
| ESCO-119 | P2 | ddl_aditivo | #281 | En curso — migración 161 |
| ESCO-120 | P3 | codigo | #278 | En curso |
| ESCO-121 | P2 | decision | #279 | En curso — migración 159 + backfill |
| ESCO-122 | P3 | decision | — | **Done** — regla escrita, cero código |
| ESCO-123 | P2 | codigo | #283 | En curso — falta identificar la foto (Santiago) |
| ESCO-124 | P3 | datos | — | Aplazada por Santiago |

## Dos causas raíz que se fusionaron

**ESCO-116 y ESCO-121 son el mismo defecto**: `fn_clima_rollup_diario` cuenta lecturas
en vez de medir cobertura temporal. Una sola migración (159) cierra las dos.

El arreglo ingenuo —anular los 29 días que el umbral llama «parciales»— habría
**destruido 19 días de radiación válida y 11 días de lluvia medida**. Los 19 días
gruesos de marzo–mayo tienen 48 lecturas porque Ecowitt sólo sirve 30 minutos más allá
de ~90 días: son días **completos** muestreados grueso, no truncados. El umbral por
conteo no los distingue; el de hueco temporal sí.

## Lo que la revisión adversarial encontró

Las cuatro migraciones pasaron por revisión adversarial con veredicto obligatorio.

- **159 → `SAFE WITH CORRECTIONS`.** Tres correcciones, todas aplicadas y empujadas.
  La sustantiva: el `CASE` que encaja la cadencia aceptaba 15–45 min como 30, mientras
  el comentario de arriba prometía «cualquier otra → NULL». Un día cuyo sync de 5
  minutos se degrade a uno cada 15 pasa la prueba de cobertura como completo y luego
  calcula el sol **al doble de la verdad**, en la misma columna donde la 151 ya embarcó
  una magnitud mal rotulada y la 158 tuvo que anular un `0,00` fabricado.
  La revisión también encontró un caso que el diagnóstico no tenía: **2026-08-27 con
  288 lecturas** —conteo completo— pero cerrando a las 15:50. Ningún umbral por conteo
  lo encuentra. La población pasó de 10 a **11 días**.
- **161 → `SAFE`.** 45 de 45 transcripciones verificadas contra el catálogo vivo, cero
  vectores de ampliación. Cerró además un agujero que el autor no había cubierto: si
  algún rol careciera de `SELECT` sobre `usuarios`, el `EXISTS` en línea daría error hoy
  y el helper `SECURITY DEFINER` tendría éxito mañana — un ensanchamiento de
  *error → permitido*. Medido: `anon` y `authenticated` ya tienen ese `SELECT`, así que
  el vector no existe.

## Un informe de agente que se refutó antes de convertirse en PR

El agente de ESCO-123 reportó que `hato_capturas_foto` no persiste el período y propuso
«un cambio de una línea en la edge function». **Producción lo refuta**: `anio` y `mes`
están poblados en las 3 filas de pesaje, y el NULL de `fecha` es el contrato del módulo
—una fecha leída de una imagen nunca se persiste—, no un hueco. La nota de memoria que
lo indujo estaba mal escrita y quedó corregida.

El hueco real es otro y no es una línea: falta el enlace entre la carga y la fila de
dominio que escribió. No se filó — la 146 tiene 8 días y hay 5 filas. Condición de
disparo anotada.

## Veredictos finales de las cuatro migraciones

| Mig. | Ficha | Veredicto | Correcciones | Filas de dominio |
|---|---|---|---|---|
| 159 | ESCO-116 + 121 | `SAFE WITH CORRECTIONS` | 3, aplicadas | UPDATE sobre **11** |
| 160 | ESCO-115 | `SAFE WITH CORRECTIONS` | 3, aplicadas | **cero** |
| 161 | ESCO-119 | `SAFE` | ninguna | **cero** |
| 162 | ESCO-117 | `SAFE WITH CORRECTIONS` | 7, aplicadas | UPDATE sobre **3** |

La 162 fue la más cargada, y por una razón que vale guardar: **reintrodujo el literal de
padrón que 103, 120 y 133 ya habían prohibido** — tres guardas comparando por igualdad
contra una población que Gerencia escribe desde Configuración → Telegram. La
pre-condición se negaba a correr si no había exactamente 3 filas con la llave, o sea
justo cuando hay **más** que limpiar. Es el veredicto de la 120 al pie de la letra, y es
la cuarta vez que el mismo error entra por la puerta.

Su otra corrección sustantiva **refutó una evidencia del encabezado**: justificaba el
costo cero por `created_by`, y eso no prueba nada porque el insert borrado sí ponía
autor. La evidencia que sostiene la conclusión es otra — las **4.534 de 4.534** filas de
`fin_gastos` están en `Confirmado` y el flujo borrado escribía `Pendiente` fijo.
Verificado en vivo.

## Orden de aplicación — NO es uniforme

Las cuatro migraciones son independientes entre sí, pero **dos tienen orden opuesto
frente al despliegue**:

- **160 → migración PRIMERO, deploy después.** El PR sí embarca un productor de
  `tipo='liquidacion'`. Al revés, el INSERT viola el CHECK, y `registrarCapturaFoto`
  devuelve `null` sin lanzar: la carga perdería en silencio justo la instrumentación
  que la migración agrega.
- **162 → también migración PRIMERO.** El borrador recomendaba deploy-primero y la
  revisión lo dio vuelta; se verificó y es correcto invertirlo. Las dos ventanas son
  inofensivas —ningún camino escribe—, así que el desempate es otro: la llave **es** la
  autorización, y desplegar primero la deja **imposible de quitar desde la interfaz y
  reescribiéndose sola**, porque el formulario se siembra desde la fila, las casillas
  salen de `TELEGRAM_MODULES` y `handleSubmit` reescribe el arreglo entero.

## Pendiente de Santiago

1. **El `go`** para aplicar las cuatro migraciones (propuesta aparte, con SQL, conteo de
   filas y rollback de cada una).
2. **Editar las tres Rutinas** para la ruta de escritura por Composio — el clasificador
   de modo automático no deja que un agente se modifique a sí mismo.
3. **Las 23 políticas de `storage.objects`** (`docs/rls_activo_storage_objects.sql`):
   no hay carril de migración que las pueda aplicar; `apply_migration` corre como
   `postgres`, que no es dueño de esa tabla (precedente 109). Van por el panel.
4. **Identificar las dos fotos** de ESCO-123.

---

## Aplicación a producción — 2026-09-21

Santiago dio el `go` y pidió **un solo `functions deploy` al final**, no varios. Eso
encaja: las cuatro migraciones van primero de todos modos, y el deploy sólo lo necesitan
la 160 y la 162.

Orden elegido: **cero filas de dominio primero**, para validar el carril de escritura por
Composio antes de tocar datos.

| Orden | Mig. | Ledger | Filas de dominio | Verificación independiente |
|---|---|---|---|---|
| 1 | **160** | `20260921152648` | 0 | CHECK admite `liquidacion`, `periodo_pesaje` intacto, 10 CHECK, 5 filas, privilegios sin cambio |
| 2 | **162** | `20260921152928` | 3 | 0 con llave `gastos`, `ingresos` intacto en 2, respaldo de 5 filas con RLS y sin grants |
| 3 | **159** | `20260921153155` | 11 | respaldo de 11, 09-17 y 08-27 en NULL, **19 días gruesos conservan radiación y lluvia**, wunderground 1.757 intacto |
| 4 | **161** | `20260921153529` | 0 | reparto de roles **idéntico** a la base previa: 24 / 6 / 15, cero sin helper |

**`get_advisors` sin hallazgos nuevos.** Los 42 `rls_enabled_no_policy` son todos de
`respaldos.backup_*` —incluidos los dos nuevos—, que es el estado final buscado de la 081.
Los dos `anon_security_definer` sobre los helpers son el accept permanente de la 082.

### La verificación que más valió

Transferir 50 KB de SQL a mano tiene riesgo de transcripción, y el peligro no es un error
de sintaxis —eso aborta y revierte— sino un predicado **válido pero distinto**, que
ampliaría o recortaría accesos en silencio. Por eso, **antes** de aplicar la 161 capturé
el reparto por roles de las 45 políticas. Después de aplicar, el reparto es exactamente el
mismo: **24 admin+gerencia · 6 sólo Administrador · 15 sólo Gerencia**, cero sin helper.
Eso prueba que `fin_proveedores` siguió siendo sólo Administrador y que ninguna política
de un solo rol se fusionó.

Lo mismo para la 159, donde lo que decide bien o mal son constantes: verifiqué en el
cuerpo vivo el umbral de hueco **45**, el de sol **120**, las tolerancias **0,5** y
**10 %**, y las bandas de cadencia **4–7** y **25–35**.

### Lo que sigue sin poder hacerse desde acá

**El backfill de ESCO-121 no lo puedo disparar**: `/clima/backfill` exige el secreto
compartido `CLIMA_SYNC_SECRET` o un JWT de Gerencia, y no manejo secretos. **Pero una
parte se drena sola**: el cron `clima-reintento-sin-dato` (migración 121, jobid 8, activo,
06:00 Bogotá) le vuelve a preguntar a Ecowitt por los días de los últimos 21 que sigan sin
dato confiable. La cola reciente se recupera sin intervención; los días más viejos, dentro
de la ventana de 90 días de Ecowitt, necesitan un disparo manual.

---

## Cierre — 2026-09-23

**Los seis PR fusionados** (#278–#283). `main` en `af9640a`, suite verde (186 ficheros /
3.873 pruebas), `typecheck` limpio, los dos árboles de edge function **sin una sola
divergencia** ignorando la línea de cabecera generada, y cero marcadores de conflicto en
todo el repo.

### Un conflicto que me tocó a mí provocar

Las entradas de CLAUDE.md de la 159, 160 y 161 las inserté las tres **en el mismo punto de
anclaje**, antes de la línea de la 158. En cuanto se fusionó la primera, las otras dos
chocaron — y encima el orden quedó mal: la 159 aterrizó **entre la 157 y la 158**,
rompiendo la secuencia ascendente. Se resolvió dejando 158 → 159 → 160 → 161 → 162 en
orden, y hoy el fichero está correcto.

**La lección: cuando varios PR abiertos agregan a la misma lista, el conflicto no es
posible, es seguro.** Conviene anclar cada entrada a su vecino inmediato (la anterior por
número) en vez de a un punto común, o aceptar de entrada que habrá que re-resolver en cada
merge.

### Lo que falta, y es de Santiago

**El `functions deploy` NO ha ocurrido.** Verificado contra la API: la edge function corre
la **v264, desplegada el 2026-09-19 15:43 UTC**, cuatro días antes de estos merges. Hasta
que se despliegue:

- **ESCO-115** — la instrumentación de la liquidación está dormida: el CHECK ya admite
  `tipo='liquidacion'` pero el código que lo escribe no está en producción. Inofensivo.
- **ESCO-117** — el comando `/gasto` sigue registrado en la función desplegada, pero
  **falla cerrado**: la llave ya no está en la base y el gate contesta «No tienes acceso a
  este módulo». La casilla de Configuración → Telegram **sí** desapareció, porque eso viaja
  por Vercel y se desplegó al fusionar — o sea que la ventana de re-otorgamiento que
  documenté ya está cerrada.

### Ledger

**3 cerradas** (ESCO-116, ESCO-120, ESCO-122), **6 en curso**, **1 aplazada** (ESCO-124).
De las 6 en curso: dos esperan el deploy (115, 117), una espera el backfill (121), una
espera las políticas de `storage.objects` (119), una espera las Rutinas (114) y una espera
que Santiago identifique las dos fotos (123).
