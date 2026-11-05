# P3 · regla de presentación del dinero confirmada el 5 de noviembre de 2026

Base: main `1dabf041`. Santiago sustituyó expresamente la regla monetaria anterior durante
el cierre de P3. Este PR se prepara desde main, separado del resumen de cantidades #430.
No cambia fuentes, aritmética financiera, operaciones del planner ni permisos.

## Regla vigente

La banda se selecciona con la magnitud absoluta del valor original. Se conservan símbolo `$`
y signo negativo; no se añade COP. Se usan los separadores de los ejemplos de Santiago:
coma de miles y punto decimal. Ejemplos sintéticos:

| Magnitud | Presentación |
|---|---|
| Menos de 1.000.000 | Entero sin decimales: `$3,245`, `$934,567` |
| Desde 1.000.000 hasta menos de 100.000.000 | Millones con exactamente un decimal: `$1.0M`, `$50.4M`, `$95.0M` |
| Desde 100.000.000 | Millones enteros: `$100M`, `$233M`, `$2,000M` |

`aprox.` aparece únicamente si se redondea el valor. El redondeo no reclasifica la banda del
valor original: por ejemplo, un valor justo inferior al millón puede mostrarse como entero
redondeado y uno justo inferior a cien millones como `100.0M`. No se inventa una cuarta regla.
La interpretación del corte incluye exactamente cien millones en la banda sin decimales.

`dineroMensaje` sirve tanto para mensajes laborales P2 como para costos de aplicaciones y
labor vinculada P3; esta última tenía llamadas directas al formato global y pasa al helper.
`numeroMensaje` de cantidades y `formatPuro.ts` permanecen idénticos. No cambia el formato del
resto de la aplicación ni se modifican servidores legados, Telegram o `chat.tsx`.

## Verificación

Backend: 21 controles nuevos, RED histórico 16 fallos / 5 controles, después GREEN.
QA independiente: 24 aceptaciones con oráculos literales y baseline exacto de main,
19 fallos / 5 controles, después 24/24 GREEN. Cubren umbrales, decimal obligatorio, signo,
redondeo, `aprox.`, costo congelado frente a precio actual, labor vinculada y validación factual.
Se actualizaron expectativas monetarias existentes sin eliminar pruebas ni mutaciones.

Coordinador: `npm test` **7.822/7.822** en 337 archivos; `npx tsc --noEmit` aprobado;
`npm run lint` **0 errores / 907 avisos** existentes. `git diff --check` limpio.
Grafo edge **37 módulos**, imports relativos `.ts` sin alias. Los dos archivos de runtime ya
están cubiertos por `src/utils/esco2` en el workflow de deriva; sin nuevas rutas.

No hubo llamadas a modelos. Gasto incremental USD **0**; P3 acumulado USD **0,052052470**
de USD 0,25. Puntuador, anclas y tolerancias originales permanecen intactos: la nueva
presentación no convierte por sí sola una referencia numérica estricta en compatible con el
redondeo. No se declara aceptación ni una nueva puntuación del dev-set por pruebas de formato.

CI `verificacion` debe registrarse sobre el SHA publicado en el PR. Claude Code revisa y decide
merge. Sin merge, deploy manual, migración ni escritura productiva.
