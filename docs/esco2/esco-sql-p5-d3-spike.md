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

## Resultado y puerta pendiente D3

La ejecución PNG local es funcional y sin egreso. **No se acredita el límite de
256 MB del worker de Supabase**: el RSS local llegó a superarlo y no tenemos una
medición del isolate alojado. El heap y la memoria lineal se mantuvieron acotados,
pero eso no sustituye esa comprobación. Tampoco es un día completo de observación,
un arranque frío de Supabase ni el benchmark de la función entera con sus imports.

Antes de activar SQL en Telegram, medir el candidato desplegado con carga sintética
máxima (cuatro gráficas, reutilización warm y el resto de imports) bajo límites del
runtime, dentro de la autorización de despliegue y sin modelos/datos reales. Si no
cabe, volver con una solución local más pequeña o pedir aprobación de la alternativa;
no activar QuickChart ni enviar cifras a terceros automáticamente.

La [documentación de límites](https://supabase.com/docs/guides/functions/limits)
indica 256 MB, 2 s de CPU por petición y tamaños de bundle distintos según carril.
La [guía Wasm](https://supabase.com/docs/guides/functions/wasm) documenta el requisito
especial de empaquetado de archivos estáticos. La configuración productiva de
make-server mantiene `verify_jwt=false`; este trabajo no despliega ni activa flags.

### Siguiente ensayo local del isolate

Es posible ensayar esta cuota sin producción con el **user runtime** de
[Supabase Edge Runtime](https://github.com/supabase/edge-runtime), distinto del Deno
CLI. El proxy/main runtime no tiene esa cuota: ejecutar la gráfica solamente en
su proceso principal no verifica el límite. Un límite Docker de 256 MB tampoco
sustituye la cuota del user worker.

En este host existe Docker CLI y el contexto usa un socket local. La comprobación
real devolvió «Cannot connect to the Docker daemon»; no había un binario
`edge-runtime` en PATH. No se inició Docker ni se instaló/descargó una imagen y no
se pudo averiguar qué imágenes están presentes. Por tanto, **este ensayo no se
ha ejecutado** y no se atribuye ningún resultado al isolate.

Próximo paso concreto, antes de activar el flag:

1. Con Docker local funcionando, elegir la imagen oficial de Edge Runtime compatible
   con el carril CLI aprobado, fijarla por digest y registrar su versión. Inspeccionar
   `edge-runtime start --help` de esa imagen antes de crear el comando. Registrar
   también la política del supervisor: el upstream actual permite `--policy
   per_request` para cuota de CPU por petición y reutilización warm; `per_worker`
   es su valor por defecto y no equivale a esa medición. No usar `oneshot` para
   afirmar reutilización warm. Contrastar esto con la versión fijada.
2. Montar una copia de las fuentes/configs/locks congeladas, sin `.env`, credenciales
   ni banco de preguntas. Resolver/cachear solo dependencias públicas y después
   cerrar la red. El fixture no llama al bot, Telegram, Supabase ni un modelo.
3. En un main/proxy temporal, crear un **user worker** mediante
   `EdgeRuntime.userWorkers.create` con `memoryLimitMb: 256`,
   `cpuTimeHardLimitMs: 2000`, `workerTimeoutMs: 150000` y `envVars: []`.
   Usar los nombres de opciones de la versión elegida, contrastados con su ejemplo
   oficial. No heredar `Deno.env.toObject()` como hace el ejemplo genérico.
4. En ese user worker, cargar el mismo grafo del candidato sin inicializar el bot ni
   usar credenciales; si algún import produce I/O, cerrar y corregir ese fixture.
   Dibujar cuatro bloques sintéticos máximos por petición (60 categorías, seis
   series o 60 sectores, incluyendo la altura máxima de leyendas), primero en frío
   y después en 40 peticiones warm. Añadir dos peticiones concurrentes para verificar
   la cola de rasterización. Todos los PNG deben conservar firma/dimensiones.
5. Registrar digest, SHA del candidato, número de peticiones, CPU/memoria que exponga
   el runtime y cualquier retiro/cancelación del worker. Si hay overflow, retiro por
   memoria/CPU bajo la política declarada, OOM o falta de medición de cuota, el gate
   sigue abierto. No confundir el retiro normal por cuota acumulada de `per_worker`
   con un fallo de una petición de menos de dos segundos. La prueba del renderer
   aislado no acredita el grafo completo ni el presupuesto de CPU del turno HTTP.
6. QA independiente repite el fixture. Solo después se puede proponer activar SQL.

La [fuente oficial de ejemplo del proxy](https://github.com/supabase/edge-runtime/blob/main/examples/main/index.ts)
muestra las opciones del user worker. La [CLI del runtime](https://github.com/supabase/edge-runtime/blob/main/cli/src/flags.rs)
y su [supervisor](https://github.com/supabase/edge-runtime/blob/main/crates/base/src/worker/pool.rs)
definen las políticas descritas; verificar la versión fijada. Estas instrucciones definen un ensayo local
pendiente; no son una afirmación de que los límites de la plataforma ya pasaron.
