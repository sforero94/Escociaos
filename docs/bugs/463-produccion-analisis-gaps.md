# #463 — Causa y límites del tablero de Producción

Lectura de solo lectura del 2026-11-09 sobre el proyecto `ywhtjwawnkeqlwxbvgup`.
Sin escrituras, sin importar el Excel ni el tracker.

## Por qué Principal 2027 no se veía

Había dos capas, y solo la primera estaba en el código.

1. **Filtro.** Antes del #465, `ANOS_DISPONIBLES` era `[2023, 2024, 2025, 2026]` y
   `COSECHAS_ORDEN` terminaba en `P26`. La consulta era `produccion.ano IN (años
   elegidos)`. El control «año» era el año guardado en `produccion.ano`, que es
   el nombre de la campaña, no la fecha del movimiento. Una fila `ano = 2027`
   no se podía elegir. El #465 hizo el catálogo dinámico, pero el año seguía
   asociado por una regla (Principal N «cabe» en el año N−1) y, al no coincidir,
   **escondía** la cosecha o la reemplazaba por otra.

2. **Datos.** En `produccion` no hay filas con `ano = 2027`. Las campañas con
   kilo son Principal y Traviesa de 2023 a 2026. `kg_exportacion` y
   `kg_nacional` están vacíos en todas las filas. La tabla no tiene fecha.
   `cosechas`, `despachos` y `despachos_trazabilidad` existen y tienen fecha,
   y están en **0 filas**. `cosechas` tampoco guarda la identidad Principal /
   Traviesa, así que no se le puede poner la etiqueta Principal 2027 a partir
   de la fecha (esa regla de ventanas quedó obsoleta en la migración 184).

La etiqueta «Principal 2027» sí aparece en ingresos de Aguacate Hass: 9 filas
con fecha en 2026. Eso es finanzas, no entrada de cosecha, y este tablero no
lo lee.

## Qué hace el tablero con eso

- La cosecha se elige por identidad (`Principal 2027`). El año, cuando hay
  fecha, es el año de esa fecha. Un movimiento de Principal 2027 fechado en
  2026 sale al filtrar 2026.
- Si no hay fecha, el año no recorta kilos y no esconde la cosecha. El corte
  dice «total registrado».
- Una cosecha que no está en los datos se nombra. No se cambia por otra.
- Producción = `kg_totales`. Clasificado y despachado quedan en «Sin dato».
  La diferencia no se calcula y no se llama merma.
- kg/árbol y t/ha salen solo si todos los lotes con kilo de ese corte tienen
  denominador. Si falta uno, «Sin dato».
- La evolución semanal (semana desde el inicio, o calendario ISO) se calcula
  cuando hay fecha. No dibuja ceros en huecos ni después del último movimiento.
  Abierta/cerrada no está en el registro.

## Etapas por lote (migración 196, sin aplicar)

`produccion_etapas_lote` guarda clasificado o despachado por lote y cosecha,
con su `fecha_corte`. No trae datos y no se aplica sola. El tablero la lee;
si la tabla todavía no existe, esas columnas quedan en «Sin dato».

El clasificado son canastas × 20 kg. Una diferencia contra la entrada o contra
el despacho no es necesariamente merma y no se suma a la producción. Cada
etapa muestra su propio corte. Para Principal 2027 la entrada cargada corta
el 23 oct 2026 (16.203,28 kg); ese día no está en `produccion`. Clasificado
y despachado llevan el corte en la fila (23 oct y 27 oct cuando se carguen).

## Qué sigue fuera

Sin registro manual, sin importar el Excel, sin aplicar la migración, sin usar
ingresos como si fueran despacho, y sin inventar el vínculo con las tablas
vacías `cosechas` y `despachos`. La carga de etapas la hace Escocia Bot
después de que Santiago aplique la 193.
