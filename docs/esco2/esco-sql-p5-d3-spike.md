# P5 · D3: PNG local mediante SVG y resvg-wasm

Fecha: 2026-11-09. Alcance: investigación y ensayos locales sintéticos, sin
producción, consultas del banco, mensajes de Telegram, modelos ni secretos.
Requisitos: §6.3/D3 del [plan aprobado](https://github.com/sforero94/Escociaos/blob/7425dc3828ec1937f9f710950e95bf94cfe65df6/docs/esco2/plan-migracion-esco2-sql.md).
No hay briefs generales/técnicos nuevos en este checkout; este cambio acotado usa
el plan aprobado y los contratos P2/P4 existentes como sus requisitos.

## Decisión y alternativas

| Opción | Ventaja | Coste/límite |
|---|---|---|
| SVG generado localmente + `@resvg/resvg-wasm@2.6.2` y assets empaquetados | No envía cifras a un tercero. Biblioteca fijada y PNG real. | Añade Wasm, fuente y coste de inicialización; memoria del worker real pendiente. |
| QuickChart por POST | Integración sencilla; no pone cifras en una URL. | Sigue enviando cifras a un tercero; requiere aprobación separada. No implementado ni usado. |
| Archivos estáticos Wasm/TTF con lectura local en runtime | Reduce tamaño de TypeScript y usa bytes originales. | Requiere empaquetado `static_files`; la documentación de Supabase excluye `--use-api` para ese mecanismo. |

Se adopta la primera opción para el candidato local. Wasm y fuente se representan
como constantes base64 TypeScript empaquetadas: no hay descarga de Wasm/fuentes,
lectura de archivos, QuickChart ni `fetch` durante el dibujo. El wrapper npm está
fijado en 2.6.2; la inicialización recibe bytes, nunca una URL ni su valor por defecto.
La carga del módulo es diferida hasta una gráfica SQL; la promesa de inicialización
se reutiliza y los dibujos se serializan por worker para acotar concurrencia.

La conversión base64 debe usar `atob`, un `Uint8Array` del tamaño exacto y un bucle
`charCodeAt`. El experimento inicial con `Uint8Array.from(atob, callback)` elevaba
innecesariamente el heap y el tiempo de inicialización; no se recomienda.
Después de `asPng()`, liberar siempre `RenderedImage` y `Resvg` en `finally`.

## Contrato y reglas de dibujo

```ts
type BloqueGrafica = Extract<Bloque, { tipo: 'grafica' }>;
renderizarGraficaPng(bloque: BloqueGrafica): Promise<Uint8Array>;
```

El adaptador recibe el bloque ya construido con filas de consulta, no una
especificación del modelo ni un URL. El PNG usa el mismo formateador P2, llamado
mediante el alias `@esco-sql/formato.ts`. El alias tiene configuración por raíz,
para mantener idénticos los módulos de los dos árboles de la función:

- Canónico `src/supabase/functions/server/deno.json`: `@esco-sql/` → `../../../utils/escoSql/`.
- Espejo `supabase/functions/make-server-1ccce916/deno.json`: `@esco-sql/` → `../../../src/utils/escoSql/`.

Escapar XML, normalizar etiquetas a NFC y limitar dimensiones/nodos. NULL no se
convierte en cero: las líneas/áreas se parten en ese punto y los textos indican
«Sin dato». No eliminar series sin aviso si la forma solicitada no permite
representarlas: el fallo conserva texto y datos mediante la alternativa de tabla/CSV.
Los tests del renderer productivo, separados de este microbenchmark, deben cubrir
bar/line/area/pie, negativos/ceros/NULL, etiquetas extensas y los límites del bloque.

## Assets y licencias

| Artefacto | Bytes | SHA-256 |
|---|---:|---|
| resvg 2.6.2 `index_bg.wasm` original | 2.478.606 | `22bf6e9f9a100d972da0411a69c5ba504367fc1fa87b3b64e3f35e53926d2d70` |
| Noto Sans Regular original, entrada del generador | 569.208 | `b85c38ecea8a7cfb39c24e395a4007474fa5a4fc864f6ee33309eb4948d232d5` |
| Esco Sans Subset Regular derivada | 62.532 | `41fe94278a67320534dcac66d540d1fcdb5856e79ebe6f79ae2dc2dd8550764c` |

resvg usa MPL-2.0; conservar su licencia/notices y referencia a la fuente v2.6.2.
La fuente usa SIL OFL 1.1. El subset conserva licencia/copyright y cambia los
nombres de familia/PostScript a **Esco Sans Subset**. No se recomienda presentarlo
como el Noto Sans original. La licencia de la fuente no cubre las imágenes creadas.

El generador `scripts/esco-sql-p5/preparar-fuente.py` requiere `fonttools==4.60.1`,
verifica el hash de entrada, conserva el timestamp del archivo y produce bytes
idénticos en ejecuciones repetidas. Conserva U+0020–U+00FF, U+2000–U+206F y €→≠−.
Esto cubre el texto español normalizado y símbolos comunes, no todo Unicode ni
emoji/CJK. Una etiqueta sin glifo no debe convertirse silenciosamente en blanco;
el adaptador conserva su texto completo y un fallback explícito.

Fuentes primarias:
[paquete/API 2.6.2](https://github.com/thx/resvg-js/blob/v2.6.2/wasm/index.d.ts),
[licencia resvg](https://github.com/thx/resvg-js/blob/v2.6.2/LICENSE),
[fuente original](https://github.com/googlefonts/noto-fonts/blob/main/hinted/ttf/NotoSans/NotoSans-Regular.ttf),
[OFL](https://github.com/googlefonts/noto-fonts/blob/main/LICENSE).

## Experimento reproducible

`medir-png.mjs` verifica los tres hashes, bloquea `fetch`, inicializa con bytes y
renderiza un SVG fijo de **720 × 480, 60 categorías y seis series sintéticas**.
Instrumenta únicamente una copia temporal del wrapper para observar el tamaño de
memoria lineal Wasm; el wrapper productivo no se modifica. Cada proceso dibuja una
vez y luego cuarenta veces más, liberando los objetos. Se ejecutaron **15 procesos
nuevos y 600 dibujos warm** en Deno 2.1.4, `aarch64-apple-darwin`.

Con los assets públicos identificados arriba en una carpeta local:

```sh
python3 -m venv /tmp/esco-fonttools
/tmp/esco-fonttools/bin/pip install fonttools==4.60.1
/tmp/esco-fonttools/bin/python scripts/esco-sql-p5/preparar-fuente.py \
  --source /tmp/esco-assets/NotoSans-Regular.ttf \
  --output /tmp/esco-assets/EscoSansSubset-Regular.ttf
deno run --no-prompt --allow-read=/tmp/esco-assets \
  scripts/esco-sql-p5/medir-png.mjs /tmp/esco-assets
```

La carpeta también necesita el wrapper npm `index.mjs` y `index_bg.wasm` originales
de `npm pack @resvg/resvg-wasm@2.6.2`. No pasar datos del producto al experimento.

| Medida local | Mediana | p95 observado |
|---|---:|---:|
| Inicialización Wasm (incluye decodificación) | 5,76 ms | 12,65 ms |
| Primer dibujo | 58,80 ms | 62,94 ms |
| Dibujo warm | 22,21 ms | 23,82 ms |
| Proceso completo: inicio, setup y 41 dibujos | 1.046 ms | 1.113 ms |

PNG resultante: 29.175 bytes. Cero llamadas `fetch`. Assets binarios: 2.541.138
bytes; constantes base64: 3.388.184 caracteres, sin contar wrapper/código del bot.
Memoria lineal Wasm máxima: 4.915.200 bytes, estable en los dibujos warm.
`heapUsed + external` máximo observado: 27.878.865 bytes. RSS del proceso completo:
primer dibujo hasta 202.768.384; cuarto dibujo hasta 249.184.256; pico global hasta
291.618.816 bytes. RSS incluye overhead, código y cachés del proceso Deno; no se
identifica con la contabilidad del isolate de Supabase.

## Segundo ensayo: user isolate real local

Después del microbenchmark se inició Docker Desktop local, sin solicitar login,
licencia, contraseña ni cambiar ajustes. La imagen oficial elegida se contrastó
con el [docker-compose publicado por Supabase](https://github.com/supabase/supabase/blob/master/docker/docker-compose.yml)
y se ejecutó fijada por digest:

`supabase/edge-runtime@sha256:6b850a2ccf0bf50ecac9accff8098095cd191c389c2a53c59b857aa0f53a8343`

Tag: `v1.77.9`; versión que imprime: `edge-runtime 0.1.0`, Deno 2.1.4,
`aarch64-unknown-linux-gnu`. No se identifica esa versión con la producción alojada.

El proxy temporal crea un **user worker**, no ejecuta la gráfica en el main runtime,
con `memoryLimitMb: 256`, CPU hard limit de 2.000 ms, `envVars: []`, 150 s de plazo
y política `per_request`. El contenedor completo tiene una cota distinta de 1 GB;
no se confunde esa cota con los 256 MB del user isolate. La red del contenedor es
`none`; las peticiones del proxy usan solamente su propio HTTP loopback.

Se copió únicamente el renderer PNG productivo, el formateador compartido y los
assets públicos a un directorio temporal de solo lectura. Solo se reescribieron
los dos import specifiers para resolver esas copias locales; el código del PNG no
cambió. No se montó el repositorio, `.env`, credenciales ni datos del producto.
El wrapper público de resvg se verificó por hash. El fixture y sus fuentes tienen
manifiesto SHA-256.

**Corrida final: 45 peticiones y 180 PNG correctos**, cada petición con las cuatro
formas al máximo del contrato. Hubo tres peticiones frías, cuarenta warm y dos
concurrentes. El pool reutilizó workers: no se afirma que las cuarenta warm
ocurrieron en un único isolate. Todos los HTTP fueron 200, sin retiros/fallos de
cuota y sin `fetch` del renderer. Bar/line/area: 720 × 480; pie: 720 × 997 con las
sesenta leyendas. NULL, valores negativos cartesianos y aviso de truncado estaban
presentes en los datos sintéticos.

- Peticiones frías, cuatro PNG cada una: 396,05 / 138,82 / 120,49 ms.
- Peticiones warm, cuatro PNG cada una: mediana 91,34 ms; p95 observado 96,40 ms.
- `heapUsed + external` máximo devuelto: 31.585.906 bytes.
- La API de ese worker devolvió `rss=0`: **no acredita un pico RSS medido**.
- Cero llamadas de red del renderer y ninguna variable de entorno entregada al worker.

Un primer arranque del proxy falló antes de dibujar porque la petición construida
manualmente no tenía el contexto HTTP interno de Supabase. Se corrigió solo el
proxy temporal para enviar peticiones HTTP loopback reales y se repitió el fixture.
El fallo inicial no se contabiliza como petición PNG correcta.

La cuota configurada del **renderer aislado local** pasa este ensayo. El resultado
no acredita el grafo completo de make-server, el consumo total de un turno HTTP,
arranque de Telegram, un día entero de observación ni aceptación productiva P6.
El microbenchmark Deno anterior conserva su límite: su RSS no era una medida del
isolate y no es la base de esta comprobación.

## Reproducir el isolate local

Con las dependencias del lock instaladas (`npm ci`) y Docker local disponible,
`scripts/esco-sql-p5/preparar-isolate.py` copia una lista cerrada de archivos públicos
desde este repo y genera el mismo proxy/fixture/manifiesto. Rechaza destinos dentro
del repo o directorios de salida no vacíos; no inicia Docker ni accede a producción.
Los tres archivos main/worker/renderer generados se contrastaron byte a byte con
la corrida final. No se añaden otros assets binarios al repositorio.

```sh
esco_d3_dir="$(mktemp -d /tmp/esco-p5-d3.XXXXXX)"
python3 scripts/esco-sql-p5/preparar-isolate.py --out "$esco_d3_dir"
docker run --name esco-p5-d3-repro --detach --network none --memory 1g --cpus 2 \
  --mount "type=bind,source=$esco_d3_dir,target=/fixtures,readonly" \
  supabase/edge-runtime@sha256:6b850a2ccf0bf50ecac9accff8098095cd191c389c2a53c59b857aa0f53a8343 \
  start --main-service /fixtures/main --policy per_request
docker logs --follow esco-p5-d3-repro
# Tras D3_COMPLETE o D3_FAILED, salir del seguimiento y retirar solo este contenedor:
docker rm --force esco-p5-d3-repro
```

Aceptar únicamente `D3_COMPLETE` con 45 filas, cuatro PNG por fila, firma/dimensiones
correctas y cero `fetch`; un `D3_FAILED`, cancelación o falta de datos conserva el
gate abierto. Comparar también versión/digest y los hashes del manifiesto.
`per_worker` es el valor por defecto del upstream: no mide lo mismo que la cuota
CPU por petición. `oneshot` tampoco prueba reutilización warm. Antes de usar otra
versión, contrastar `start --help` y las opciones de su user worker.

Se eliminó el contenedor del ensayo. Docker Desktop quedó encendido al encontrar
otras cargas activas; no se detuvo ninguna. La imagen pública puede quedar en caché.

## Gate pendiente de la función completa

Antes de activar SQL, comprobar el candidato de make-server con **su grafo entero**
y carga sintética máxima, dentro del alcance autorizado, además de los controles
operativos de despliegue. No se puede cerrar ese gate con el positivo del renderer
por separado. Si el conjunto excede las cuotas, volver con una solución local más
pequeña o pedir aprobación de la alternativa; no enviar cifras a QuickChart
automáticamente.

Fuentes primarias: [arquitectura del user runtime](https://github.com/supabase/edge-runtime),
[proxy de ejemplo](https://github.com/supabase/edge-runtime/blob/main/examples/main/index.ts),
[CLI y políticas](https://github.com/supabase/edge-runtime/blob/main/cli/src/flags.rs),
[supervisor](https://github.com/supabase/edge-runtime/blob/main/crates/base/src/worker/pool.rs),
[límites alojados](https://supabase.com/docs/guides/functions/limits) y
[guía Wasm](https://supabase.com/docs/guides/functions/wasm).
