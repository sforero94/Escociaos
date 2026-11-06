# P4-3: clima histórico observado

Fecha: 2026-11-06. Implementación del [contrato P4](p4-source-contract.md), D41,
sobre P4-1. Esta entrega no acepta M5 ni acredita permisos JWT productivos.

## Operación y fuente

`consultar_clima` admite `desde`/`hasta` inclusivos, `station_id` exacta opcional y
una lista cerrada de variables del resumen diario. El corte usa hoy inyectado en
Bogotá. No consulta fechas futuras ni rellena el resumen ausente de hoy.

La única relación climática es `clima_resumen_diario`, con proyección explícita,
conteo exacto, páginas ordenadas por `(fecha,station_id)` y validación de identidad.
El helper compartido conserva `id` como orden por defecto para los otros lectores.
Una PK repetida, campo omitido, fallo o truncamiento deja la fuente no leída.
NULL registrado y día sin fila conservan estados diferentes. El manejador mantiene
Gerencia activa y usa el cliente con el JWT del solicitante.

Cada estación mantiene sus propios agregados. Si hay fechas solapadas sin selección,
la operación pide precisar estación y no entrega un agregado combinado. Las estaciones
sin solapamiento también permanecen separadas.

## Cálculo y cobertura

La lluvia reutiliza `lluviaConfiableDeResumen` y `esCotaInferior` sin reimplementar
su motor. El contador congelado no aporta lluvia usable ni se sustituye por el
acumulador de evento. Se separan el subtotal de días con cobertura temporal conocida
completa, las cotas inferiores, las observaciones de calidad temporal desconocida y
las que contradicen una etiqueta de lluvia completa con un hueco temporal parcial.
Cero como cota no demuestra ausencia de precipitación. Las estadísticas genéricas
de lluvia son NULL para evitar mezclar cotas y totales.

La partición por variable contiene días usables, días con fila pero valor NULL/no
usable y días sin fila. Calidad desconocida es otra dimensión superpuesta, no un
cuarto sumando. Los promedios indican su denominador de días con dato y se rotulan
como observaciones disponibles. No se calcula una media lineal de direcciones
angulares: se conservan las direcciones diarias.

El umbral temporal vigente es un hueco máximo de 45 minutos, independiente del
número de muestras. El texto declara cobertura temporal completa/parcial/desconocida
y sus causas; el metadato global no promete completitud de cada sensor. La duración
solar contradictoria con un hueco mayor se retiene en el registro original y se
excluye del dato usable. La energía usa únicamente `wm2ToEnergiaDiaria`, para días
con cobertura temporal conocida completa, y conserva su unidad kWh/m² separada de
las horas de sol. No se importan clasificaciones agronómicas ni se usan lecturas
crudas para recalcular historia.

## QA y verificación

QA independiente congeló sus referencias sintéticas antes del runtime. El RED
original fue **23 fallos sustantivos y 7 controles aprobados**, reproducido también
por backend. Las referencias originales permanecen intactas:

| Archivo | SHA-256 |
| --- | --- |
| `esco2P4Task3QaHarness.ts` | `63ecfc72bbaeb11b271928b84338a4b7d48c46b6d917c7b775afb04f1b059b9a` |
| `esco2P4Task3QaIntegration.test.ts` | `63d85e97963909cd9bc86b612c0158ebe1e2cf74a9ff40538fba5b7137a972be` |
| `esco2P4Task3QaSupplemental.test.ts` | `468886078ba4a5df082955b5e7f0acdebac798608cacfcec84a33f38d832b2b9` |

La revisión adversarial añadió siete controles independientes: tres fallaron antes
del parche por causas temporales omitidas en el texto, lluvia temporalmente parcial
sin subtotal separado y promedio de lluvia mezclando cotas. Una expectativa de QA
confundía el estado del resultado vacío con la disposición del manifiesto; QA corrigió
solo esa expectativa, documentó la corrección y volvió a observar **3 fallos y 4
controles aprobados** antes de reparar runtime. Backend reprodujo ese RED corregido.
También comprobó en RED que dos direcciones angulares no admiten una media lineal.

| Verificación local | Resultado |
| --- | --- |
| QA HTTP/SQL/RLS sintético independiente | 37/37 |
| Backend y registro P4-3 | 16/16 |
| Regresión focalizada P4-1, núcleo, fuentes, cobertura y detector de deriva | 202/202 |
| Typecheck | Aprobado |
| Lint | 0 errores, 907 avisos existentes |
| Grafo desde `esco-consultas/index.ts` | 48 módulos, sin rutas faltantes, alias o imports sin `.ts` |
| Diff de espacios | Limpio |

El workflow de deriva y su expectativa exacta incorporan `escoClimaCalidad.ts` y
`calculosRadiacion.ts`; sus 47 controles pasan. El coordinador ejecuta la suite
completa y revisa la integración apilada. CI sobre el SHA publicado queda pendiente.
Los logs, huellas y recibos permanecen fuera de Git; no se consultaron fuentes
productivas para implementar o verificar esta entrega. Gasto nuevo de modelo: USD 0.

No se ejecutaron modelos, held-out, despliegues, migraciones, correcciones de datos,
llamadas a estación/proveedores ni RPCs. No se modificaron los servidores legados,
Telegram ni `chat.tsx`.
