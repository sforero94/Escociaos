# Conciliación de PACHA #202 (#258)

Santiago confirmó el **2026-10-07** que #202 es PACHA, registrada como #5202 por
su procedencia de Supata. MOROCHA no representa un segundo animal.

La migración **178** conserva la ficha original de PACHA y cambia solamente
`numero` de 5202 a 202. Elimina la ficha espuria MOROCHA, previamente descartada
el 11 de agosto, después de guardar ambas filas completas en
`respaldos.backup_178_pacha_morocha`. PACHA sigue activa; su fecha de nacimiento,
madre, UUID y demás campos se conservan.

## Estado

**Preparada y ensayada localmente; pendiente de aplicación y verificación.**

| Comprobación | Valor esperado |
| --- | --- |
| Ficha canónica | Una PACHA activa, #202; sin #5202 ni MOROCHA |
| Operaciones | Un UPDATE de número y un DELETE de ficha espuria |
| Conteo total | 181 → 180 |
| Animales activos | 68 → 68 |
| Animales descartados | 1 → 0 |
| Respaldo recuperable | Dos filas completas, RLS, sin permisos públicos |
| Filas ajenas | 179 fichas intactas; sin cambio en historia operacional |

## Guardas y recuperación

La migración bloquea escrituras concurrentes durante la transacción, verifica los
UUID y huellas de las filas completas, exige los conteos previos y descarta
colisiones de identidad. Comprueba todas las FK entrantes, incluidas finanzas
con `ON DELETE SET NULL`, y el historial de correcciones que no tiene FK. Una
referencia nueva a MOROCHA aborta la operación, sin borrar ni desenlazar historia.
Las postcondiciones comparan todos los campos de PACHA contra el respaldo salvo
el número y verifican que ninguna otra ficha cambió. Un respaldo previo impide
reaplicar la migración.

El [rollback manual](rollback-conciliacion-pacha-202.sql) restaura ambas fichas con
los UUID originales y todos sus valores. Aborta si PACHA cambió posteriormente
o apareció una identidad conflictiva. Los respaldos se conservan en producción,
fuera de la API pública; no se publican sus filas en GitHub.

## Validación

Ensayo local en PostgreSQL (PGlite): éxito y restauración exacta; rechazo ante
filas cambiadas, colisión, referencia nueva incluso con CASCADE, finanzas con
SET NULL e historial sin FK; fallo tras renumerar deshace toda la transacción;
reaplicación y rollback sobre cambios posteriores rechazados. Los dos respaldos
quedan con RLS y sin SELECT para anon/authenticated.

Esta evidencia resuelve la identidad de #202. **No certifica la totalidad ni la
causa original del lote de descartes del 11 de agosto.** #177/#178 ya corregidos,
las migraciones 147/153/176 y las 42 discrepancias laborales aceptadas se
conservan. La prueba de Telegram con un bot real sigue pendiente de configuración.
