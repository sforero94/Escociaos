# Auditoría de descartes del 2026-08-11 (#258)

Lectura de producción: **2026-10-07 UTC**. Resultado parcial: hay tres animales
recuperables con esa fecha; dos falsos descartes ya corregidos y un caso pendiente
de evidencia. **No se modificó producción. #258 sigue abierto.**

| Chapeta | Identidad | Veredicto | Estado actual y evidencia | Acción |
| --- | --- | --- | --- | --- |
| 177 | MOCA → MOTONETA | Falso descarte confirmado anteriormente | Activa desde 2026-09-15; servicio 2026-09-03. El respaldo 153 conserva `descartada`, 2026-08-11. | Excluida de cualquier corrección nueva. |
| 178 | COMINA | Falso descarte confirmado anteriormente | Activa desde 2026-09-15; servicio 2026-09-02. El respaldo 153 conserva `descartada`, 2026-08-11. | Excluida de cualquier corrección nueva. |
| 202 | MOROCHA | **Sin determinar** | Sigue descartada desde 2026-08-11, sin nota. No tiene eventos, chequeos, pesajes de leche ni tratamientos; no hay otra ficha actual con nombre MOROCHA o chapeta 202. | No reactivar sin inventario/evidencia de campo. |

Los dos servicios confirmados y los valores actuales concuerdan con la migración
153 y el [diagnóstico de septiembre](diagnostico-chequeo-2026-09-08.md). Su ledger
vivo es `20260915183535`, `correccion_chequeo_2026_09_08`: la fecha de aplicación
fue **15 de septiembre**, aunque el chequeo se tomó el día 8.

## Alcance de la lista

No es demostrable que estos tres sean todo el lote original. El catálogo actual
solo conserva un animal con `fecha_estado = 2026-08-11`; los otros dos se recuperan
del respaldo 153. Una ficha que hubiera cambiado de estado/fecha después de la
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
en las trazas consultadas. El trigger 084 omite sesiones con `auth.uid() IS NULL`;
esto explica una posible ausencia de auditoría, pero **no identifica al ejecutor**.
La causa precisa de aquella depuración sigue sin corroborar.

## Bloqueo y siguiente acción

Hace falta confirmar si MOROCHA #202 salió, seguía en la finca o era una ficha
duplicada, con evidencia y fecha. También falta la lista/instrucción original de
la depuración para certificar la totalidad del lote. Se solicitó esa información
al dueño; se continúa con #263 según la política de documentar bloqueos.

Si se confirma un falso descarte nuevo: volver a leer la ficha por UUID, respaldar
la fila completa en `respaldos` con RLS sin acceso público, verificar ausencia de
colisión de chapeta activa, actualizar exclusivamente ese UUID con guardas de
estado/fecha esperados, agregar nota con evidencia y fecha de corrección y verificar
después. No se proporciona un UPDATE ejecutable mientras falta el veredicto.

## Validación

La consulta [auditoria-descartes-2026-08-11.sql](auditoria-descartes-2026-08-11.sql)
es de solo lectura y se ejecutó contra producción. La comprobación visual del
informe se realiza después de crear el PR en Chromium, con una copia local de los
resultados. No demuestra un cambio en la aplicación desplegada; no hubo cambios
de datos ni del flujo de descarte.
