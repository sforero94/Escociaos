# Escocia OS — corrida `2026-08-24-drenaje-continuacion` · modo: full write

Tercera y última sesión del drenaje del 2026-08-24. Continúa
`2026-08-24-drenaje.md` y `2026-08-24-drenaje-cierre.md`. Autorizada en vivo por
Santiago con permisos permanentes de fusión, despliegue y aplicación de
migraciones aditivas, y **go por ítem** para la cirugía de datos.

## RESUMEN (ES)

Se aplicaron a producción **diez migraciones (110–119)** y se fusionaron **22
PRs (#150–#171)**, incluidas las tres cirugías de datos que necesitaban tu go
uno por uno. El P0 del webhook de Telegram quedó cerrado sin rotar ningún
secreto: la puerta existía y una regresión de marzo la había borrado, así que
bastó desplegar. Lo que más vale de la sesión no es el volumen sino **dos veces
que un verificador independiente me corrigió antes de escribir en producción**:
la migración 118 apuntaba a la fila equivocada, y el argumento central de la 119
era circular. Las dos se corrigieron y se aplicaron bien.

```
P0: 0 · P1: 0 · P2: 3 · P3: 0   (nuevos)  |  cerrados: 10
```

**Backlog 15 → 8 abiertos.** Los tres hallazgos nuevos salieron de *verificar* —
la cirugía de datos y los cierres— no de una barrida: **la pantalla de
Verificación de inventario nunca ha contado nada** ($117M teóricos, 0 de 223
productos, 25 días abierta), **borrar una compra deja pegado su precio unitario
al producto para siempre** (cifra que entra al costo por kilo), y **el residuo
real de #37 son 8 tablas más** de monitoreo y producción con borrado libre.

---

## Migraciones aplicadas a producción

Todas verificadas contra el catálogo vivo después de aplicar, y todas fusionadas
a `main`.

| # | Qué hace | Ledger | Hallazgo |
|---|---|---|---|
| 110 | DELETE de trazabilidad GlobalGAP sólo Gerencia/Administrador (7 tablas, no 4) | `20260824200409` | #37 |
| 111 | Cierra el INSERT sin autenticar en `logs_auditoria` | `20260824211507` | #19 |
| 112 | Trigger `updated_by` en `productos` | `20260824212954` | #16 |
| 113 | Traza de ediciones/borrados GlobalGAP fuera del hato | `20260824214747` | #19 |
| 114 | Cierra la cascada `contratistas`/`lotes` hacia GlobalGAP | `20260824214414` | #37 |
| 115 | Marca los días de clima cuya captura se cortó al final | `20260824214054` | #42 |
| 116 | `hato_alertas_tick_runs`: cobertura por razón del tick diario | `20260824215406` | #4 |
| 117 | Reetiqueta 48 monitoreos guardados bajo el umbral del proyecto | `20260824220921` | #12 |
| 118 | Borra la Entrada huérfana de 8 kg de Acondicionador sys | `20260824222017` | #43 |
| 119 | Borra la Entrada huérfana de 8.000 kg de Sulcamag ($5,36M) | `20260824222137` | #29 |

La **109** sigue siendo la excepción: se fusionó pero el carril no puede
aplicarla — `ALTER POLICY` sobre `storage.objects` exige ser dueño de la tabla y
`postgres` ya no lo es. La aplicaste a mano desde Storage → Policies.

---

## Las dos veces que el verificador independiente tenía razón

Esto es lo que hay que recordar de la sesión.

### La 118 apuntaba a la fila equivocada

La factura 65028 de Acondicionador sys tiene **dos** filas de `Entrada`
idénticas, creadas con quince minutos de diferencia (16:30 y 16:46). Mi borrador
razonó que eran intercambiables y apuntó a la de las 16:46. **Estaba al revés.**
La evidencia que decide no está en `movimientos_inventario` sino en `compras`:
la compra `727a8fec` nació a las **16:46:16.729827** con `updated_at` idéntico
—nunca se editó— y `NewPurchase.tsx` escribe siempre `compras → productos →
movimiento` con medio segundo de separación, firma que se repite en las cuatro
compras de la tabla. O sea que la de las 16:46 es la respaldada por el
documento y **la de las 16:30 era el huérfano**.

Verifiqué el hallazgo por mi cuenta antes de aceptarlo, invertí el objetivo y lo
apliqué así. Borrar la otra no habría cambiado ningún número, pero habría dejado
a 65028 como la única compra de la tabla cuyo movimiento de inventario es
anterior al documento que lo respalda. Es trazabilidad de agroquímicos, y cuesta
cero hacerlo bien.

### El argumento central de la 119 era circular

Yo sostenía que los 16 kg de saldo de Sulcamag son de fiar **porque son el
`saldo_anterior` que registra la propia fila que iba a borrar**. Eso es circular:
es la misma fila bajo sospecha.

El argumento que sí vale es externo a ella: `productos.updated_at` de Sulcamag es
**2026-07-24 20:05:47**, *dos minutos antes* de que existiera la compra de
Silicalmag (20:07:54). Los 16,00 no los tecleó nadie — son `8.016,00 − 8.000,00`
calculados por `eliminarCompraConReversion`. Y lo corrobora una tabla distinta y
anterior a toda esta revisión: `verificaciones_detalle` del 2026-07-30 ya
registraba Sulcamag en 16,00 y Silicalmag en 8.000,00.

La migración se reescribió con ese argumento antes de aplicarse.

---

## El P0 del webhook de Telegram

Cerrado sin rotar nada. La puerta (`TELEGRAM_WEBHOOK_SECRET` comparado contra el
encabezado `X-Telegram-Bot-Api-Secret-Token`) **existía y una regresión de marzo
la había borrado** (`e799142`). El registro del webhook contra Telegram seguía
vivo con su `secret_token`, así que Telegram ya estaba mandando el encabezado y
sólo faltaba que el código volviera a mirarlo.

Desplegado: v215 → v216. Un POST anónimo pasó de **aceptado** a **401**, y
confirmaste que `/start` sigue respondiendo. No hizo falta tocar el token, que
era exactamente el bloqueo que traía el runbook.

---

## Hallazgos nuevos (2)

Los dos salieron de **verificar la cirugía de datos**, no de una barrida. Ese es
el patrón que vale la pena notar: mirar de cerca una fila mala destapa el
mecanismo que la produjo.

### La pantalla de Verificación de inventario nunca ha contado nada · P2

`verificaciones_inventario` tiene **una sola fila en toda la historia**
(`4a595f8c`, abierta el 2026-07-30, estado «En proceso»), con **223 productos de
detalle y `contado = false` en los 223**. `select count(*) from
verificaciones_detalle where contado` devuelve **0** — cero, en toda la tabla,
desde siempre. Valor teórico sin verificar: **$117.292.158**. La línea más cara
es Silicalmag: 8.000 kg, `cantidad_fisica` NULL.

Y sin embargo **el 24 de agosto sí hubo conteo físico** — de tres productos, y
entró por la puerta de al lado, como movimientos `Ajuste` con la observación
«Ajusté por inventario físico». Esos tres son **los únicos 3 de los 160
movimientos de la tabla con `responsable` NULL**.

O sea: el módulo que existe para esto no se usa, y los conteos que sí ocurren no
tienen aprobación, no calculan diferencia y no dicen quién los hizo. Es decisión
de producto, no arreglo: o se usa el módulo, o se retira y el Ajuste manual pasa
a ser oficial — con `responsable` obligatorio, porque hoy acepta NULL.

### Borrar una compra deja pegado su precio unitario · P2

`NewPurchase.tsx:391-394` escribe `cantidad_actual` **y** `precio_unitario` en un
solo UPDATE. `eliminarCompraConReversion` (`PurchaseHistory.tsx:112-117`)
revierte **sólo** `cantidad_actual`. Probado en producción: Sulcamag carga hoy
`precio_unitario = 669,96`, byte a byte el de Silicalmag y exactamente
`33.498 ÷ 50` — el precio unitario de la factura 4379 que se cargó contra el
producto equivocado y se revirtió. El saldo volvió; el precio no.

En Sulcamag el daño está acotado a $10.719 del KPI porque el producto tiene
consumo cero. **El defecto es general**: `productos.precio_unitario` alimenta el
costo de insumos de costo/kg por lote (`calculosCostoKg.ts`), así que borrar una
compra de un producto que sí se consume mueve una cifra financiera en silencio.
La reversión del ledger registra la cantidad y no el precio, así que no queda
rastro.

Arreglo propuesto: restaurar `precio_unitario` desde la compra inmediatamente
anterior del mismo producto, y **NULL si no hay ninguna** — nunca conservar el de
la compra borrada, que es una afirmación falsa donde el sistema ya sabe
distinguir «sin dato» de cero.

---

## Lo que se dejó sin arreglar, a propósito

Escrito en la cabecera de la migración 119 y en la ficha de cierre de #29, para
que no se re-descubra:

1. **`Sulcamag.precio_unitario` sigue en 669,96.** Su valor anterior es
   irrecuperable e inventarlo sería peor. Aporta $10.719 al KPI de valor de
   inventario y nada al costo/kg (consumo cero). El defecto de código que lo
   produjo sí quedó filado arriba.
2. **El total de Entradas del tablero de Inventario baja $5.675.648**, de
   $51.034.387 a $45.358.739. Es la dirección correcta —hoy esas dos compras
   están contadas dos veces— pero es un número que ves y que se va a mover. P&G
   y Flujo de Caja **no se tocan**: nada en `src/utils/`,
   `src/components/finanzas/` ni `src/components/produccion/` lee
   `movimientos_inventario`.

---

## Errores míos de esta sesión

Los dejo escritos porque el patrón se repite y el remedio es el mismo: **verificar
el efecto, no el comando.**

- **BSD `sed` falló en silencio sobre un carácter multibyte.** `s/[Mm]igraci[oó]n
  113/…/g` — `sed` de BSD trata la expresión entre corchetes byte a byte, así que
  `[oó]` es el conjunto `{o, 0xC3, 0xB3}` y nunca coincide con «ó». Nueve citas
  sobrevivieron mientras mi `echo "corregido: $f"` incondicional informaba éxito,
  **y mi mensaje de commit afirmó falsamente que no quedaba ninguna**. Rehecho con
  Python y conteo explícito de reemplazos (4+4+1=9).
- **`git push -q` falló en silencio.** La rama local no coincidía con la de
  arriba; bajo `push.default=simple` el push se rechaza, y `-q` más `tail -1`
  escondieron el mensaje. Dos commits se quedaron locales. Desde entonces:
  refspec explícito (`origin HEAD:<rama>`) y comparación de SHA local contra
  remoto en la misma línea.
- **Mi verificación del hallazgo #39 estaba mal.** Calculé
  `sum(costo_jornal × fraccion_jornal)` y concluí que 16 aplicaciones estaban
  infladas 40%. **`costo_jornal` ya incluye la fracción**: `sum(costo_jornal)`
  cuadra al centavo con el snapshot en las 16. La cifra real del hallazgo es
  **$4.382.702**, no lo que reporté primero.
- **Una guarda que se disparó con su propio comentario.** Puse el patrón
  incorrecto dentro de un comentario del cuerpo de la función para explicar por
  qué estaba mal; la post-condición lo buscaba con `pg_get_functiondef(…) ILIKE`,
  **que devuelve los comentarios del cuerpo**. Reescrito para no contener el
  literal.
- **Un `apply_migration` que reescribí en vez de transferir.** Tras un 503 de la
  API de administración, reintenté con los comentarios condensados y los mensajes
  sin acentos, así que los bytes aplicados ≠ los bytes del archivo. Es una
  desviación de la quinta compuerta y queda registrada como tal.

---

## Cierres — verificados dos veces, por separado

Un agente independiente dictaminó cada hallazgo contra el catálogo vivo y contra
el *bundle servido*, no contra el estado de fusión. **Después re-corrí yo mismo
sus afirmaciones de base de datos** — las ocho coincidieron exactamente.

**Cerrados (8):**

| # | Resolución | Lo que lo prueba |
|---|---|---|
| 16 | Arreglado | `set_updated_by_productos` vivo, con el orden de `COALESCE` correcto |
| 19 | Arreglado | `logs_auditoria` INSERT exige Gerencia · `anon` sin permiso · 9 triggers `trg_globalgap_correccion` |
| 29 | Arreglado | migración 119 |
| 37 | Arreglado (alcance nombrado) | las 7 tablas de la 110 + `contratistas`/`lotes` de la 114 |
| 38 | **Obsoleto** | la fumigación **se cerró** el 24-ago 12:30 UTC; la guarda de la 106 no la bloqueó |
| 39 | Arreglado | bundle servido: el snapshot ya sólo es respaldo |
| 40 | Arreglado | `detectarRechazoLecturaPesaje` en ambos árboles + v219 + el texto del panel en el bundle |
| 41 | Arreglado | reintento por longitud en ambos árboles + v219 |
| 42 | Arreglado | `fn_clima_rollup_diario` viva con la reja de 30 min; conviven los 3 valores de confianza |
| 43 | Arreglado | migración 118 |

**#38 merece su párrafo, porque el hallazgo estaba equivocado y vos tenías razón
a medias.** Decía que la fumigación de agosto **no se podía cerrar** por la
guarda de inventario negativo de la 106. Se cerró — el 24 de agosto a las 12:30
UTC, con fecha de cierre 19-ago — y con ese cierre se acabó el hueco del libro:
entraron las 4 salidas por aplicación del 19-ago que faltaban desde el 31-jul. La
aplicación que sí sigue abierta es **otra**, el Drench de agosto, en ejecución
normal con movimientos hasta el 22. Eso reconcilia lo que dijiste con el dato.

**Quedan abiertos (5), ninguno tocado por los 22 PRs de esta tanda:**

- **#4** — lo que shipeó es **instrumentación, no el panel de control**, y así lo
  fijó tu propia decisión: *instrumentar primero, no tocar ningún umbral, regla ni
  destinatario hasta que el desglose responda la pregunta*. La tabla tiene 0 filas
  y **eso es correcto**: el tick de hoy corrió once horas antes de que existiera.
  **La primera fila real es la de mañana 05:45 Bogotá** — ese es el momento de
  retomarlo. Se registró además la refutación de mi propia hipótesis intermedia:
  el cuello **no es el despacho**.
- **#45** — las dos unidades siguen conviviendo (`RegistrarTrabajoDialog.tsx:174`
  y `telegram/conversations/jornal.ts` escriben salario **mensual**;
  `calculosCierreAplicacion.ts:461` divide por 22).
- **#46** — sin arreglar, **y la 114 lo ensanchó**: al acotar el DELETE de
  `contratistas` y `lotes` por rol, el camino de «no borró nada pero dice que sí»
  quedó alcanzable por roles que antes no lo alcanzaban.
- **#47** — `authenticated_select_contratistas` sigue con `qual = true` sobre una
  tabla con cédula y teléfono. La 114 sólo tocó el DELETE.
- **#48** — `calcularGravedad` sigue duplicada en el bot de Telegram. El PR #151
  arregló la copia de CargaMasiva, no ésta.

### Un hallazgo nuevo más: el residuo real de #37

El barrido **sin filtro de rol** (el filtro `roles LIKE '%public%'` es justamente
lo que hizo que #37 naciera diciendo «4 tablas» cuando eran 7) muestra que
**quedan 8**, todas `TO authenticated`: `apiarios`, `mon_colmenas`,
`mon_conductividad`, `monitoreos`, `plagas_enfermedades_catalogo`, `produccion`,
`rondas_monitoreo`, `sublotes`. Antes de la 110 eran **17**.

La cadena de aplicaciones quedó cerrada; la de **monitoreo y producción**, con la
misma anatomía, no — y `monitoreos` son 4.155 filas de la serie de plagas desde
2025, que `globalgap_correcciones` **no** traza. Latente hoy (8 cuentas, todas
Gerencia o Administrador, `anon` sin política); real el día que exista un
**Verificador**. Filado aparte en vez de dejar #37 abierto a medias.

---

## Documentación: dos PRs, y el segundo corrige al primero

- **PR #172** — las diez migraciones 110–119 no estaban en el `CLAUDE.md` raíz,
  el fichero que cada sesión carga. Añadidas, más el rango (001–108 → 001–119) y
  la ficha de `logs_auditoria`.
- **PR #173** — **corrige un error que introdujo el #172.** Quedaron **dos
  entradas numeradas 113**: la vieja de `hato_alertas_tick_runs`, anterior al
  renumerado a 116, decía además «SIN APLICAR». Y sus cuatro sub-viñetas **no
  eran sobre esa tabla**: son el muro de propiedad de `storage.objects`, lo más
  reutilizable del bloque, así que se movieron bajo la 109 en vez de perderse.
  De paso, la 109 pasó de «fusionada y SIN APLICAR» a **aplicada** — lo está,
  por el panel de Storage, que corre como el dueño y **no deja fila en el
  ledger**.

Que el segundo PR exista es el mismo patrón del día: **el error no estuvo en
hacer el trabajo, estuvo en no verificar su efecto.** Tres veces hoy.

---

## REQUIERE TU DECISIÓN

1. **La pantalla de Verificación de inventario** — ¿se usa o se retira? Nunca ha
   contado nada y los conteos reales entran por otra puerta, sin responsable.
2. **#4, mañana después de las 05:45** — la primera corrida instrumentada del tick
   contesta por fin si el motor de alertas no tiene nada que alertar o no puede.
3. **Las 8 tablas del residuo de #37** — misma migración que la 110, pero hay que
   comprobar antes si alguna pantalla borra-y-reinserta contra `monitoreos` o
   `produccion`, porque ahí acotar por rol rompe producción. Es exactamente la
   trampa que la 110 esquivó.
