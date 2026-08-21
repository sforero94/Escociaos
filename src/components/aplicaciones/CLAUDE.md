# CLAUDE.md — Módulo Aplicaciones

Contrato del módulo tras el rediseño de 2026-08-20. Acá va lo que **no** se deduce leyendo el
código: de dónde sale cada dato, qué comparación es legítima y cuál es un error de categoría, y qué
guardas te van a frenar. Lo obvio (qué archivo renderiza qué) se ve mejor con `ls` y `grep`.

## Los 5 workflows

Es una máquina de estados, no un conjunto de páginas. `aplicaciones.estado` decide qué pantalla es
alcanzable: `Calculada` → `En ejecución` → `Cerrada`.

| | Ruta | Archivos |
|---|---|---|
| Lista (hub) | `/aplicaciones` | `AplicacionesList` · `DetalleAplicacion` · `IniciarEjecucionModal` |
| Calculadora | `/aplicaciones/calculadora/:id?` | `CalculadoraAplicaciones` · `PasoConfiguracion` · `PasoMezcla` · `PasoListaCompras` |
| Movimientos | `/aplicaciones/:id/movimientos` | `DailyMovementsDashboard` · `DailyMovementForm` · `…Wrapper` |
| Cierre | `/aplicaciones/:id/cierre` | `CierreAplicacion` (orquestador) · `SeccionInsumosCierre` · `SeccionLaboresCierre` · `SeccionConfirmarCierre` · `AtencionRequeridaPanel` |
| Reporte | `/aplicaciones/:id/reporte` | `report/*` + `src/hooks/useReporteAplicacion.ts` |

Compartidos en `shared/`: `AplicacionShell`, `AplicacionStepper`, `EstadoAplicacionBadge`, `KPICard`.
Lógica pura y testeada: `src/utils/calculosCierreAplicacion.ts`, `calculadoraAplicacionesHelpers.ts`.

## El estado que se guarda NO es el que se muestra

`estado` guarda `Calculada`; la UI dice **"Planificada"**, y lo viene diciendo desde siempre.
`EstadoAplicacionBadge` hace la traducción; el filtro de la Lista escribe la etiqueta literal
(no puede delegarla porque tiene una opción "Todos" que el Badge no modela).
`src/__tests__/estadoAplicacionEtiquetas.test.ts` lo vigila. **No "corrijas" Planificada a Calculada**
— ya pasó dos veces en el rediseño, y ninguna herramienta lo detecta: no hay migración, no hay error
de tipos, solo cambia en silencio una palabra que la gente lleva meses leyendo.

## De dónde sale el PLAN — y de dónde no

**`aplicaciones_lotes_planificado` está vacía. 0 filas, siempre.** El plan real vive en
**`aplicaciones_calculos`** (67 filas, 16 de 20 aplicaciones): `numero_canecas`, `litros_mezcla`,
`kilos_totales`, `numero_bultos`, y el mapeo mezcla↔lote en `mezcla_id`. Los insumos planificados
están en `aplicaciones_productos.cantidad_total_necesaria`, que es un total **por mezcla** — si una
mezcla abarca varios lotes hay que repartirlo, no sumarlo en cada uno.

Este error ya se cometió tres veces en tres lugares distintos: la Calculadora perdiendo el mapeo
mezcla→lote al recargar (D6), el Reporte perdiendo la columna Plan entera, y `useReporteAplicacion`
trayendo `aplicaciones_calculos(*)` en el query y no usándolo. **Leer la tabla vacía no falla:
devuelve 0 y el consumidor cae a su respaldo sin que nadie se entere.** Es la trampa.

## Comparaciones legítimas y una que no lo es

- **Usa `calcularCambio()`, no `calcularDesviacion()`.** La segunda devuelve literalmente `100`
  cuando el planeado es 0 (`calculosReporteAplicacion.ts:15`) — no es un bug tipográfico, es su
  diseño. Con el plan estructuralmente en 0, eso pintaba `+100,0%` en las 4 tarjetas de TODAS las
  aplicaciones cerradas. `calcularCambio` devuelve `undefined` sin base, y `KPICard` omite el badge.
- **`costo_total` y `costo_por_arbol` NO llevan plan, a propósito.** El real es insumos + mano de
  obra; el único plan que existe es el de insumos. No hay plan de jornales guardado en ninguna parte.
  Compararlos daba "+138,1%" en una aplicación cuyos insumos se desviaron +0,4%. `costo_productos` sí
  conserva su plan: ahí sí se comparan insumos con insumos.
- **Jornales es la excepción**: su plan se *calcula* (`tareas.jornales_estimados` prorrateado, con
  respaldo `árboles/500`), no se guarda. Por eso nunca le faltó la columna cuando a las otras sí.

## Reglas de pantalla que ya costaron un defecto

- **Nunca un "100%" pelado cuando lo aplicado excede lo planeado.** 76,0 sobre 75,8 canecas redondea
  a 100% y esconde el exceso. Se muestra `Excedido +0,2` con el delta real, y por debajo del límite
  el porcentaje va con un decimal (99,7%), nunca redondeado a entero.
- **Los operandos y el resultado llevan los mismos decimales.** "76,0 − 75,8 = +0,17" no cierra y
  hace dudar del número; son 76,00 − 75,83.
- **Ausencia no es cero.** Sin dato → `—`. Nunca 0, nunca un porcentaje inventado, nunca una serie de
  gráfico dibujada en cero (se omite entera, leyenda incluida).
- **Un solo acento olivo.** La jerarquía la carga la intensidad, no el tono: `En ejecución` sólido,
  `Calculada` tinte, `Cerrada` contorno neutro. El módulo tenía cuatro paletas distintas peleando
  (badges, botones de fila, gradientes de `HeroKPICards`, azul/morado en `EconomicSection`).

## Guardas que te van a frenar

- `aplicacionesFixedInsetGuard.test.ts` — falla si aparece `fixed inset-0` en un `className` bajo
  este directorio. Los 5 modales a mano ya migraron y **la lista de excepciones está vacía**: si
  agregás una, estás yendo para atrás. Usá `Dialog`/`Sheet`/`Drawer`/`AlertDialog`.
- `dialogScrollContract.test.ts` — el scroll va en `DialogBody`, nunca en `DialogContent`.
- `tableCrudoTrinquete.test.ts` — trinquete de `<table>` crudas. Cuando migrás un archivo a `Table`,
  **hay que sacarlo de `DEUDA_TABLA_CRUDA` y ajustar el conteo**, o el test falla por deuda saldada.
- `estadoAplicacionEtiquetas.test.ts` — ver arriba.

## Datos que se capturan y no se veían

- **La cuadrilla vive en `movimientos_diarios_trabajadores`** (926 filas, ~6 por movimiento), con su
  lote, fracción de jornal y costo. `movimientos_diarios.responsable` es **texto libre** con el
  nombre del responsable — no es la cuadrilla, y está sucio ("Felipe García" / "Felipe Garcia").
  `movimientos_diarios.personal` es una columna muerta, NULL en todas las filas.
- **`sublotes_ids` ya no se escribe** (`aplicaciones_lotes`). Las 87 filas existentes guardan
  exactamente TODOS los sublotes de su lote — cero subconjuntos parciales — así que es derivable de
  `lote_id` y nadie lo lee. La columna se conserva; el campo opcional sigue en el tipo TS.

## Cierre transaccional (migración 106)

**`cerrarAplicacion()` ya no son 8 escrituras sueltas a Supabase.** Hasta la migración 106 eran
6+ llamadas sin transacción (`registros_trabajo` ×3 → `aplicaciones_cierre` → `aplicaciones` →
`tareas` → `productos` → `movimientos_inventario`); si fallaba a la mitad, el cierre quedaba
partido — inventario parcialmente descontado, tarea a medio completar. Ahora es un único
`.rpc('fn_cerrar_aplicacion', { payload })` (`src/sql/migrations/106_cierre_aplicacion_transaccional.sql`,
`SECURITY INVOKER`): las 8 escrituras corren en una sola transacción, mismo orden y mismos
valores que antes — la única propiedad nueva es que todas confirman o ninguna lo hace.

El payload lo arma `construirPayloadCierreAplicacion` (`src/utils/calculosCierreAplicacion.ts`,
pura y testeada) — toda la aritmética (costos, fechas, consolidación de insumos por producto)
sigue viviendo en TypeScript, no en SQL; el RPC solo persiste lo que ese objeto ya trae
calculado. Dos guardas nuevas que antes no existían: doble cierre imposible
(`aplicaciones.estado = 'Cerrada'` aborta) e inventario nunca en negativo (`productos.cantidad_actual`
no tiene CHECK >= 0, así que el RPC lo valida él mismo antes de escribir nada).

`fraccion_jornal` es un ENUM en BD (no numeric) — el payload lo manda como STRING
(`reg.fraccion_jornal.toString()`, igual que la versión no transaccional), y el RPC solo hace
`::fraccion_jornal` sobre ese texto sin reformatearlo.
