# P4-5: pesajes y litros quincenales de leche

Fecha: 2026-11-06. Implementación del [contrato P4](p4-source-contract.md), §5 y
D40, apilada sobre P4-4 `28fd184`. Esta entrega conserva separadas las muestras fechadas y las quincenas por
origen; no acepta M5 ni acredita permisos JWT productivos.

## Operaciones y fuentes

`consultar_pesajes_leche` recibe fechas calendario inclusivas y una selección de
animales por ID, nombre o chapeta. La selección compartida se extrae de P4-4 sin
cambiar sus estados ni desempatar por actividad. Sin selector pide precisar;
los hechos se unen únicamente por `animal_id` visible. El corte usa hoy inyectado
en Bogotá. Cada detalle AM/PM queda vinculado a su nombre y número visible,
conservando el calificador de número provisional.

`hato_pesajes_leche` se lee con columnas explícitas, conteo exacto y paginación.
Se comprueban tanto la PK como la unicidad `(animal_id,fecha)`. Una jornada con
ambos turnos cuenta, incluso si el cero está registrado. Un solo turno queda
incompleto y no entra en la suma. Ambos turnos NULL conservan la jornada histórica
de total único. Se retienen los registros incompatibles y sus contadores; un campo
omitido en transporte no se convierte en NULL. El resultado mantiene suma de
muestras, promedio de días pesados y cobertura por animal. Los días calendario
sin fila no acreditan cero ni una frecuencia de captura incumplida.

`consultar_litros_quincenales` admite intervalos que abarcan quincenas calendario
completas: inicio 1/16, final 15/último día del mes. Un intervalo parcial pide
aclaración sin prorratear ni ampliar el período solicitado. Se reutiliza
`rangoQuincena`; las fechas registradas se conservan separadas. Una contradicción
entre esas fechas y año/mes/quincena queda no calculable. Las quincenas abiertas
conservan su período y dato observado, separados de los subtotales cerrados.
Una quincena faltante permanece sin fila y con litros NULL.

La proyección quincenal es cerrada sobre `hato_produccion_quincenal`. Del ingreso
vinculado se leen exclusivamente `fin_ingresos.id,cantidad`, filtrados por los IDs
medidos que requiere la selección. Se distinguen vínculo ausente, ingreso no
legible, cantidad NULL y relación no leída. Los medidos nunca usan un total local
como fallback. Los derivados usan su partición local y sobreviven a un fallo del
lector opcional de cantidades; compartir un ingreso mensual no lo suma otra vez
por cada quincena hija. La contradicción del vínculo único medido excluye ese
agregado. Los subtotales conservan el origen y nunca se mezclan con pesajes.

## Reutilización y límites

`resolverLitrosQuincenal` y `turnoIncompleto` se trasladan a módulos puros mínimos;
sus módulos anteriores los reexportan. Se conserva su comportamiento de NULL,
cero y origen, sin importar proyecciones ni cálculos monetarios al edge. Las
validaciones de lectura y la cobertura rodean esas funciones; no reimplementan
sus reglas. `calculosHato.ts` permanece intacto.

Los agregados verifican finitud después de sumar. Si un conjunto de números
finitos desborda, el agregado y su promedio quedan NULL, con causa explícita y
estado parcial; se conservan las filas y los otros orígenes válidos. No aparece
cero como consecuencia del desbordamiento. El total frente a AM+PM se contrasta
con tolerancia de representación de punto flotante, sin corregir el registro.

El manejador mantiene Gerencia activa y el JWT del solicitante en cada lectura.
No se añaden dinero, precios, compradores, medios de pago, litros por vaca,
reconstrucción del número de vacas, recomendaciones ni proyecciones.

## QA y evidencia

QA independiente congeló SQL sintético y referencias antes del runtime:
**34 fallos y 5 controles aprobados**, reproducidos por backend. Se conservan los 39 casos y sus referencias cuantitativas. Antes del primer
GREEN, QA documentó la corrección de dos comparadores negativos de texto: rechazaban
incluso disclaimers correctos sobre las magnitudes excluidas. No cambió cifras,
estados, cobertura ni fuentes. El hash y el log del RED original se conservan;
no hubo otra campaña sin runtime sobre los comparadores corregidos. La revisión adversarial añadió siete controles;
antes del parche hubo **2 fallos y 5 controles aprobados**, por detalles sin
identidad de animal y pérdida del calificador provisional. Un primer intento del
suplemento tenía un error de preparación de QA; se preservó el recibo, se corrigió
la preparación y se observó el RED sustantivo antes de reparar runtime.

| Archivo QA | SHA-256 |
| --- | --- |
| `esco2P4Task5QaHarness.ts` | `0eb6bd089e06eb9a1b3afe457ebdd6707a32c8d2501af9c697a09aeeb354214a` |
| Integración original del RED, recibo y hash preservados | `566e395f0d95ac40c90dc4ba3cd8e99a7b1493639dcfc3b6e8eeb672118c2781` |
| `esco2P4Task5QaIntegration.test.ts`, comparadores corregidos | `99ccb92888aff1e22e24f35aa53f3866a52941073b6bbb6af2adf87276c954cd` |
| `esco2P4Task5QaSupplemental.test.ts` | `b55e78822442484cc4238a602912c39fc58b6266fddfa0f610831f977de93936` |

La auditoría independiente reprodujo desbordamientos de sumas de valores finitos;
backend añadió dos controles en RED antes de la guarda. La auditoría repitió
sin cambios su reproducción después del parche y comprobó los agregados NULL con
causa explícita, filas conservadas y otros animales/orígenes válidos intactos. Otro control backend
comprobó en RED que no se publiquen propiedades libres ajenas a la proyección.
Las pruebas de paridad comprueban la reexportación de las funciones originales y
sus casos literales de NULL/cero/origen.

| Verificación local | Resultado |
| --- | --- |
| QA independiente HTTP/SQL/JWT/RLS sintético | 46/46 |
| Backend y registro P4-5 | 13/13 |
| Regresión inicial P4-4, producción, pesajes y detector de deriva | 320/320 |
| Integración final P4-1–5, motores de producción/pesajes y detector | 600/600 |
| Typecheck | Aprobado |
| Lint | 0 errores, 907 avisos existentes; delta sin avisos |
| Grafo desde `esco-consultas/index.ts` | 65 módulos, sin imports incompatibles ni rutas fuera del watcher |
| Diff de espacios | Limpio |

Al apilar sobre P4-4, el primer foco aprobó 599/600: el único fallo era la
expectativa exacta del registro cerrado del test operacional P4-4, que aún no
incluía las dos capacidades nuevas. El coordinador autorizó añadir exclusivamente
`pesajes_leche` y `litros_quincenales` al array esperado. Un segundo revisor comprobó
que los once elementos anteriores y todos los bytes ajenos a ese array permanecen
idénticos. El control conservó su igualdad exacta y aprobó 7/7; el foco integrado
posterior aprobó 600/600. La QA independiente P4-5 repitió 46/46 tras el rebase.

El workflow y su expectativa exacta incluyen los dos módulos puros nuevos; sus
47 controles pasan. El coordinador ejecuta la suite completa y la verificación
sobre el SHA publicado; CI queda pendiente. Los recibos, RED y huellas permanecen
fuera de Git. Las pruebas locales usan únicamente fuentes sintéticas controladas.
Gasto nuevo de modelo: USD 0.

Sin modelos, held-out, despliegues, migraciones, correcciones productivas ni RPCs.
No se modifican `chat.tsx`, Telegram ni los servidores legados.
