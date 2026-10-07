# Auditoría de descartes del 2026-08-11 (#258)

Lectura de producción: **2026-10-07 UTC**. Resultado parcial: hay tres animales
recuperables con esa fecha; dos falsos descartes ya corregidos y una identidad
conciliada por Santiago el 7 de octubre: **#202 es PACHA, antes #5202 por su
procedencia de Supata; MOROCHA era una ficha espuria**. La migración 178 aplicó
y verificó esa corrección (ledger `20261007144321`). **La totalidad y causa del lote original siguen pendientes;
#258 sigue abierto.**

| Chapeta | Identidad | Veredicto | Estado actual y evidencia | Acción |
| --- | --- | --- | --- | --- |
| 177 | MOCA → MOTONETA | Falso descarte confirmado anteriormente | Activa desde 2026-09-15; servicio 2026-09-03. El respaldo 153 conserva `descartada`, 2026-08-11. | Excluida de cualquier corrección nueva. |
| 178 | COMINA | Falso descarte confirmado anteriormente | Activa desde 2026-09-15; servicio 2026-09-02. El respaldo 153 conserva `descartada`, 2026-08-11. | Excluida de cualquier corrección nueva. |
| 202 | MOROCHA → PACHA | Identidad confirmada por Santiago, 2026-10-07 | PACHA activa #202; su procedencia de Supata explica el antiguo #5202. La ficha espuria MOROCHA no tenía referencias ni historia operacional. | Corregida por 178: UUID y genealogía de PACHA intactos; MOROCHA retirada con respaldo protegido. |

Los dos servicios confirmados y los valores actuales concuerdan con la migración
153 y el [diagnóstico de septiembre](diagnostico-chequeo-2026-09-08.md). Su ledger
vivo es `20260915183535`, `correccion_chequeo_2026_09_08`: la fecha de aplicación
fue **15 de septiembre**, aunque el chequeo se tomó el día 8.

## Alcance de la lista

No es demostrable que estos tres sean todo el lote original. El catálogo actual
conservaba un animal con `fecha_estado = 2026-08-11`; los otros dos se recuperan
del respaldo 153. Tras la conciliación, la ficha espuria se conserva en el
respaldo 178. Una ficha que hubiera cambiado de estado/fecha después de la
depuración podría no aparecer en ese filtro. La consulta adjunta incorpora también
estados anteriores/nuevos del historial, pero no puede reconstruir cambios ausentes.

Se verificó en producción:

- `hato_correcciones`: **cero** transiciones registradas hacia `descartada`.
  Las cinco correcciones de animales del día 11 son cambios de ficha, no descartes.
- `logs_auditoria`: **cero** filas.
- Ledger de migraciones: ninguna entrada con versión del 2026-08-11.
- No hay un respaldo del lote de descartes entre las tablas de `respaldos`.
  `backup_090_hato_alertas_pre_descarte` respalda **alertas**, no animales.

## Origen: qué se puede afirmar

La migración **083** creó MOROCHA #202 como una ficha nueva activa el **6 de agosto**,
tomada de `INVENTARIO_TIBAGOTA_DEF_2026_2.xlsx`, hoja «TAREA MEV». Esa conciliación
usaba nombre normalizado y el Excel de 68 animales; sus bajas administrativas eran
ventas, con fecha real desconocida. No es el mismo procedimiento que los descartes
del día 11 y no demuestra por qué se descartó MOROCHA cinco días después.

El diagnóstico de septiembre atribuye las bajas de #177/#178 a la limpieza del
día 11. Ni el ejecutor, ni la selección exacta, ni el motivo de MOROCHA quedaron
en las trazas consultadas. La confirmación del dueño resuelve la identidad de
#202, pero no identifica al ejecutor ni certifica el lote completo. El trigger
084 omite sesiones con `auth.uid() IS NULL`;
esto explica una posible ausencia de auditoría, pero **no identifica al ejecutor**.
La causa precisa de aquella depuración sigue sin corroborar.

## Bloqueo y siguiente acción

La evidencia de identidad de MOROCHA ya llegó. Falta la lista/instrucción original
de la depuración para certificar la totalidad y causa del lote.

La [conciliación de PACHA](conciliacion-pacha-202.md) conserva su UUID y todos sus
campos salvo el número. La migración 178 respalda ambas filas completas en
`respaldos`, exige sus valores actuales exactos, cuenta todas las referencias y
aborta ante cualquier divergencia. No reactiva MOROCHA ni toca #177/#178.

## Validación

La consulta [auditoria-descartes-2026-08-11.sql](auditoria-descartes-2026-08-11.sql)
es de solo lectura y se ejecutó contra producción. La comprobación visual del
informe se realizó después de crear el PR original en Chromium, con una copia
local de los resultados. La conciliación nueva lleva ensayo transaccional y
comprobación de la lista real de la aplicación mediante el navegador local;
su fuente de datos de prueba se distingue de la verificación SQL de producción.
