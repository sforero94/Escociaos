# Manifiesto de captura — F0 spike Tailwind

**Contrato:** los tres agentes de captura (ANTES, DESPUÉS) recorren **exactamente esta lista, en este
orden, con estos nombres de archivo**. Si "antes" y "después" no coinciden nombre por nombre, el diff
no se puede hacer.

- Base: `http://localhost:3100`
- Viewports: `desktop` = 1280×800 · `mobile` = 375×812
- Nombre de archivo: `<slug>--<viewport>.png`
- Destino ANTES: `docs/tailwind-spike/antes/`
- Destino DESPUÉS: `docs/tailwind-spike/despues/`
- Captura: `take_screenshot` con `filePath` absoluto y `fullPage: true`

## Reglas de captura

1. Navegar, **esperar a que cargue** (el router es `React.lazy` + `Suspense`; una captura del spinner
   no sirve). Verificar con `list_console_messages` o esperando a que aparezca contenido real.
2. Si una ruta queda vacía o da error, **capturar igual** y anotarlo en el inventario. Un módulo que
   ya estaba roto antes no cuenta como regresión después.
3. **No editar ningún archivo del proyecto.** Estos agentes solo navegan y capturan.
4. Anotar en el inventario de salida cualquier ruta que no se pudo capturar y por qué.

## A · Rutas estáticas (45)

| # | slug | ruta |
|---|---|---|
| 01 | `dashboard` | `/` |
| 02 | `inventario` | `/inventario` |
| 03 | `inventario-dashboard` | `/inventario/dashboard` |
| 04 | `inventario-compras` | `/inventario/compras` |
| 05 | `inventario-movimientos` | `/inventario/movimientos` |
| 06 | `inventario-importar` | `/inventario/importar` |
| 07 | `inventario-verificaciones` | `/inventario/verificaciones` |
| 08 | `inventario-verificaciones-nueva` | `/inventario/verificaciones/nueva` |
| 09 | `aplicaciones` | `/aplicaciones` |
| 10 | `aplicaciones-calculadora` | `/aplicaciones/calculadora` |
| 11 | `monitoreo` | `/monitoreo` |
| 12 | `monitoreo-registros` | `/monitoreo/registros` |
| 13 | `monitoreo-carga-masiva` | `/monitoreo/carga-masiva` |
| 14 | `monitoreo-catalogo` | `/monitoreo/catalogo` |
| 15 | `monitoreo-apiarios` | `/monitoreo/apiarios` |
| 16 | `clima` | `/clima` |
| 17 | `clima-historico` | `/clima/historico` |
| 18 | `labores` | `/labores` |
| 19 | `labores-empleados` | `/labores/empleados` |
| 20 | `labores-contratistas` | `/labores/contratistas` |
| 21 | `produccion` | `/produccion` |
| 22 | `reportes` | `/reportes` |
| 23 | `reportes-generar` | `/reportes/generar` |
| 24 | `hato` | `/hato-lechero` |
| 25 | `hato-produccion` | `/hato-lechero/produccion` |
| 26 | `hato-animales` | `/hato-lechero/hato` |
| 27 | `hato-chequeos` | `/hato-lechero/chequeos` |
| 28 | `hato-alertas` | `/hato-lechero/alertas` |
| 29 | `hato-pajillas` | `/hato-lechero/pajillas` |
| 30 | `ganado` | `/ganado` |
| 31 | `ganado-movimientos` | `/ganado/movimientos` |
| 32 | `finanzas` | `/finanzas` |
| 33 | `finanzas-aguacate` | `/finanzas/dashboard/aguacate` |
| 34 | `finanzas-hato` | `/finanzas/dashboard/hato` |
| 35 | `finanzas-ganado` | `/finanzas/dashboard/ganado` |
| 36 | `finanzas-caballos` | `/finanzas/dashboard/caballos` |
| 37 | `finanzas-agricola` | `/finanzas/dashboard/agricola` |
| 38 | `finanzas-gastos` | `/finanzas/gastos` |
| 39 | `finanzas-ingresos` | `/finanzas/ingresos` |
| 40 | `finanzas-reportes` | `/finanzas/reportes` |
| 41 | `finanzas-presupuesto` | `/finanzas/presupuesto` |
| 42 | `finanzas-configuracion` | `/finanzas/configuracion` |
| 43 | `configuracion` | `/configuracion` |
| 44 | `ventas-comingsoon` | `/ventas` |
| 45 | `lotes-comingsoon` | `/lotes` |

## B · Rutas dinámicas (8) — resolver el `:id` navegando desde el listado

No inventar ids. Entrar al listado correspondiente y hacer clic en la **primera fila**. Anotar en el
inventario el id que se usó, para que la corrida DESPUÉS use **el mismo**.

| # | slug | cómo llegar |
|---|---|---|
| 46 | `inventario-producto-detalle` | `/inventario` → primera fila |
| 47 | `inventario-verificacion-detalle` | `/inventario/verificaciones` → primera fila |
| 48 | `aplicaciones-movimientos` | `/aplicaciones` → primera aplicación → Movimientos |
| 49 | `aplicaciones-cierre` | misma aplicación → Cierre |
| 50 | `aplicaciones-reporte` | misma aplicación → Reporte |
| 51 | `aplicaciones-calculadora-edicion` | `/aplicaciones` → editar la primera |
| 52 | `hato-hoja-de-vida` | `/hato-lechero/hato` → primer animal |
| 53 | `hato-chequeo-detalle` | `/hato-lechero/chequeos` → primer chequeo |

## C · Diálogos (H-3) — donde está concentrado el daño conocido

**Esta pasada es la más importante del spike.** Los dos bugs del 2026-08-06 (`ui/button.tsx` sin
`forwardRef`, `Toggle`/`ToggleGroup` como texto plano) estaban aquí, no en el layout de las páginas.
Capturar **solo desktop** para no duplicar el esfuerzo; el móvil de diálogos se mira en F2.

| # | slug | cómo abrirlo |
|---|---|---|
| D1 | `dlg-gasto-nuevo` | `/finanzas/gastos` → botón de registrar gasto |
| D2 | `dlg-ingreso-nuevo` | `/finanzas/ingresos` → botón de registrar ingreso |
| D3 | `dlg-labor-nueva` | `/labores` → registrar labor |
| D4 | `dlg-monitoreo-priorizacion` | `/monitoreo` → vista de priorización de scouting (control hecho a mano por este mismo problema) |
| D5 | `dlg-hato-animal` | `/hato-lechero/hato` → registrar/editar animal |
| D6 | `dlg-hato-ciclo` | `/hato-lechero/hato` → primer animal → marcar ciclo |
| D7 | `dlg-hato-chequeo-foto` | `/hato-lechero/chequeos` → carga por foto (los 3 desplegables del bug de `forwardRef`) |
| D8 | `dlg-ganado-movimiento` | `/ganado/movimientos` → registrar movimiento |
| D9 | `dlg-inventario-compra` | `/inventario/compras` → nueva compra |
| D10 | `dlg-configuracion-usuario` | `/configuracion` → Usuarios → editar |

Si un diálogo no existe o cambió de nombre, **anotarlo y seguir** — no buscarlo por código, este
agente no lee código.

## D · Estados de foco (la familia de 155 apariciones muertas)

En **una** pantalla con formulario (`/finanzas/gastos` → D1), recorrer el formulario con `Tab` y
capturar 3 pasos. Es la única forma de ver si `focus:ring-primary` empezó a existir.

Slugs: `foco-01`, `foco-02`, `foco-03`.
