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
P0: 0 · P1: 0 · P2: 2 · P3: 0   (nuevos)
```

Los dos hallazgos nuevos salieron de verificar la cirugía de datos, no de una
barrida: **la pantalla de Verificación de inventario nunca ha contado nada**
($117M teóricos, 0 de 223 productos, 25 días abierta) y **borrar una compra deja
pegado su precio unitario al producto para siempre**, que es una cifra que entra
al costo por kilo.

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
