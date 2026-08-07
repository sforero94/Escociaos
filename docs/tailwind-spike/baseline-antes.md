# Baseline ANTES — medición cuantitativa

Tomada 2026-08-06 con el pipeline de Tailwind **apagado** (estado actual de `main`).
Sirve como punto de comparación exacto para la pasada DESPUÉS.

## Método (reproducir idéntico en la pasada DESPUÉS)

- Dev server: `http://localhost:3100` (worktree `s3-hato-lechero-9eec53`)
- Sesión: Santiago Forero / Gerencia (los 4 módulos visibles)
- Navegación: SPA vía `history.pushState` + `PopStateEvent`, esperando a que el texto se
  estabilice y no haya `.animate-spin`
- **Móvil: emulación de dispositivo real** — `emulate` con `375x812x3,mobile,touch`.
  ⚠️ NO usar `resize_page`: en macOS Chrome no baja de ~500px de ancho de ventana, así que
  `resize_page 375` produce un viewport de 500px y la medición no es comparable.
- Escritorio: 1280×800
- Capturas: viewport (no `fullPage` — varias vistas superan los 24.000px de alto y los PNG
  resultan ilegibles para el análisis y desproporcionados en disco)

## Desbordamiento horizontal en móvil (375px)

`scrollWidth > clientWidth` significa que la usuaria tiene que desplazarse en horizontal.
**8 de 45 rutas ya desbordan HOY**, con el pipeline apagado. Este es daño preexistente, no
una regresión futura — y es la línea base contra la que se juzgará si encender Tailwind lo
mejora o lo empeora.

| Ruta | scrollWidth | exceso | gravedad |
|---|---|---|---|
| `/finanzas/presupuesto` | 861 px | **+486** | crítico — más del doble del ancho de pantalla |
| `/hato-lechero/hato` | 537 px | +162 | alto |
| `/finanzas/dashboard/hato` | 469 px | +94 | medio |
| `/finanzas/dashboard/agricola` | 469 px | +94 | medio |
| `/monitoreo/registros` | 398 px | +23 | leve |
| `/monitoreo` | 390 px | +15 | leve |
| `/labores/contratistas` | 390 px | +15 | leve |
| `/ganado/movimientos` | 388 px | +13 | leve |

Las otras 37 rutas miden exactamente 375 px: sin desbordamiento.

**Por qué importa para el spike:** las familias de clases muertas incluyen `w-*`, `max-w-*`,
`overflow-*`, `hidden` y las variantes responsive (`sm:`, `md:`, `lg:`). Todas gobiernan
exactamente este comportamiento. Al encender el compilador, estas 8 rutas pueden corregirse
solas (si el código ya traía la clase correcta y no hacía nada) o empeorar. Es la métrica más
objetiva del spike: no depende del criterio de nadie.

## Volumen de contenido por ruta (móvil)

Sirve para detectar en la pasada DESPUÉS si alguna vista dejó de renderizar contenido.
Un desplome del conteo de caracteres = la pantalla se rompió.

| Ruta | caracteres |
|---|---|
| `/finanzas/gastos` | 64.766 |
| `/inventario` | 18.636 |
| `/finanzas/dashboard/aguacate` | 12.531 |
| `/inventario/verificaciones/nueva` | 11.378 |
| `/inventario/movimientos` | 8.953 |
| `/finanzas/dashboard/hato` | 8.726 |
| `/hato-lechero/alertas` | 6.436 |
| `/finanzas/dashboard/agricola` | 6.457 |
| `/finanzas/dashboard/caballos` | 6.417 |
| `/finanzas/dashboard/ganado` | 5.622 |
| `/monitoreo/registros` | 4.241 |
| `/hato-lechero/hato` | 4.058 |
| `/finanzas/ingresos` | 3.891 |
| `/inventario/dashboard` | 3.867 |
| `/inventario/compras` | 3.595 |
| `/hato-lechero/produccion` | 2.757 |
| `/finanzas/reportes` | 2.525 |
| `/hato-lechero/chequeos` | 2.364 |
| `/finanzas/configuracion` | 2.419 |
| `/labores/empleados` | 2.163 |
| `/ganado/movimientos` | 2.101 |
| `/aplicaciones` | 2.996 |
| `/monitoreo/catalogo` | 1.941 |
| `/hato-lechero/pajillas` | 1.924 |
| `/labores` | 1.923 |
| `/monitoreo` | 1.792 |
| `/ganado` | 1.529 |
| `/produccion` | 1.518 |
| `/hato-lechero` | 1.442 |
| `/clima` | 1.285 |
| `/finanzas/presupuesto` | 1.277 |
| `/monitoreo/carga-masiva` | 1.275 |
| `/` | 1.170 |
| `/inventario/importar` | 1.150 |
| `/reportes` | 1.078 |
| `/reportes/generar` | 1.036 |
| `/labores/contratistas` | 1.017 |
| `/aplicaciones/calculadora` | 957 |
| `/clima/historico` | 833 |
| `/configuracion` | 694 |
| `/inventario/verificaciones` | 671 |
| `/monitoreo/apiarios` | 644 |
| `/finanzas` | 537 |
| `/ventas` | 437 |
| `/lotes` | 435 |

Ninguna ruta quedó vacía ni en spinner: las 45 renderizaron contenido real.

## Capturas tomadas

Escritorio (1280×800), en `antes/`: `dashboard`, `finanzas-gastos`, `finanzas-ingresos`,
`finanzas-reportes`, `monitoreo`, `labores`, `hato`, `hato-animales`, `hato-produccion`,
`inventario`, `aplicaciones`, `produccion`, `ganado`, `configuracion` — 14.

Móvil (375×812 DPR 3), en `antes/`: `dashboard`, `labores`, `finanzas-gastos`, `monitoreo`,
`hato-animales` — 5.

Pendiente: completar la muestra visual con las pantallas que señale
`analisis-clases-muertas.md`, y la pasada de diálogos.

## Nota sobre los diálogos

El botón "Registrar" de `/finanzas/gastos` es una pestaña Radix que **no responde a `.click()`
sintético** — necesita eventos de puntero reales (herramienta `click` con uid de snapshot).
Cualquier pasada de diálogos tiene que contar con ese costo extra por pantalla.
