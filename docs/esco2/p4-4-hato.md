# P4-4: ficha y reproducción actual del hato

Fecha: 2026-11-05 (Bogotá). Implementación del [contrato P4](p4-source-contract.md),
apilada sobre P4-3 final. La validación descrita es sintética y no acredita permisos
JWT productivos ni la aceptación completa de M5.

## Operación, identidad y lectura

`consultar_hato` admite listas de `animal_ids`, `nombres` exactos o `chapetas`
enteras, con una sola clase de selector. Sin selector pide precisar. Nombres o
chapetas repetidos requieren aclaración; el ejecutor no elige la ficha activa,
la más reciente ni una coincidencia aproximada. Las relaciones usan IDs.
La consulta describe el estado actual al día de referencia inyectado en Bogotá;
no admite un período para reconstruir un estado histórico.

El manejador conserva la puerta de Gerencia y el cliente JWT del solicitante.
Los lectores usan proyecciones cerradas y paginación con conteo exacto:

| Relación | Alcance y clave de orden |
| --- | --- |
| `hato_animales` | Las 17 columnas de ficha del contrato, por `id`. |
| `hato_toros` | Solo `id,nombre`, por `id`. |
| `v_hato_estado_actual` | Las 16 columnas de hechos del contrato, por `animal_id`. |
| `hato_config` | Solo `clave,valor`, por `clave`. |

La vista mantiene las restricciones de sus dependencias mediante
`security_invoker`. Sus filas se intersectan con fichas visibles por ID.
Madre, padre del hato y toro padre conservan estados separados para vínculo
NULL, referencia no leída, padre no legible y padre visible. Las etiquetas
salen únicamente de padres visibles. Los números provisionales reutilizan
`esNumeroProvisional`; no crean otra identidad.

Un fallo, truncamiento o identidad de transporte repetida no se trata como
una población vacía. El catálogo de toros, la vista y la configuración pueden
fallar sin borrar una ficha válida. No se leen notas, fotos, tratamientos,
historial libre, producción ni datos financieros.

## Motor y disponibilidad

La reproducción reutiliza `construirHatoConfigDesdeFilas`,
`construirUmbralesCategoriaHatoDesdeFilas` y `clasificarAnimalHato`, que resuelve
la etapa efectiva antes de llamar a `derivarEstadoReproductivo`.
`calculosHato.ts` y las copias de los servidores conservan su contenido.
Los cambios en los módulos puros de configuración, categorías y tipos se
limitan a imports relativos con extensión `.ts`.

La configuración debe estar completa, bien tipada y sin claves repetidas;
no hay valores de negocio por defecto añadidos por Esco. Antes del motor se
comprueban todos los campos requeridos de la vista, fechas calendario,
contadores enteros finitos y concordancia de los atributos compartidos con
la ficha. Los hechos posteriores al corte no acreditan un estado actual.
La fecha de nacimiento futura conserva el fallback explícito del motor;
las fechas probables derivadas pueden ser futuras.

`num_partos` conserva solo un número explícito válido. Su disponibilidad se
publica como `valor`, `null_registrado`, `no_leido`, `sin_fila` o
`no_calculable`; ninguna ausencia produce cero. La falta de fila en una vista
completamente leída se distingue de un fallo de lectura. Nombre NULL y nombre
no leído también reciben textos distintos.

## Hechos registrados y respuesta humana

`reproduccion.hechos` conserva las fechas registradas de último parto,
servicio, marca de preñez, secado real, aborto, chequeo y evento, además del
método de la marca de preñez y el estado del último chequeo. Todos proceden de
la proyección existente de la vista. Un NULL sigue siendo NULL y un campo no
leído no se completa con una fecha de servicio, una fecha probable o un cero.
Los hechos legibles permanecen disponibles aunque falle la configuración.

El texto muestra estos hechos separados del estado y las fechas probables
calculadas. Método NULL no acredita palpación; presunción y palpación se
rotulan por separado. La etiqueta del motor para `parida_reciente` se conserva
y recibe el calificador humano «posparto; parida reciente». Ese calificador
solo depende de ese estado; no se añade a la vacía por aborto y no cambia el
estado JSON, las cifras, las señales de revisión ni la disposición de cobertura.

El renderer conserva categoría, etapa forzada, fechas probables y señal de
revisión del motor. No transforma estos datos en recomendaciones, nuevas
alertas, tratamientos, captura ni correcciones.

## QA y comprobaciones

QA independiente congeló 45 controles antes del runtime: 43 fallaron por la
operación ausente y dos controles SQL/JWT/RLS y de Gerencia ya aprobaban.
Los suplementos conservaron esos oráculos e incorporaron disponibilidad,
visibilidad, discrepancias y configuración estricta. Dos contraejemplos de
hechos futuros quedaron rojos antes de la guarda temporal; seis fallos de
disponibilidad precedieron a la distinción explícita de NULL y no leído.

La revisión de preguntas operativas sin ejecutar el conjunto de desarrollo
reabrió la presentación de hechos existentes: seis controles de fechas y
método fallaron antes del parche, con un control de capacidades ya verde.
Otro control quedó rojo por el calificador posparto omitido y un control de
aborto ya aprobaba. Los 77 controles anteriores permanecieron intactos;
los nueve controles nuevos no sustituyen ni debilitan sus expectativas.

Tras apilar sobre clima final, las pruebas acotadas P4-1/P4-2/P4-3/P4-4
aprobaron **320/320**, incluidos **86 controles QA de hato**. El detector
aprobó **47/47** y su expectativa exacta contiene tanto las dependencias
climáticas como las de hato. Un plan mixto verifica conjuntamente monitoreo,
CE, clima y hato con cobertura obligatoria y estado recuperable. El recorrido
estático del grafo exige imports relativos `.ts` y cobertura de deriva para
cada dependencia local.

`tsc --noEmit` y `git diff --check` aprobaron. ESLint sobre los archivos
afectados en `src` cerró con cero errores y cero avisos. La evidencia detallada y los hashes de los freezes
permanecen fuera de Git. No se ejecutan modelos, producción, held-out,
migraciones, merge ni deploy en esta entrega.
