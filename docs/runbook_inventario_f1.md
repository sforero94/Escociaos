# F1 — Guardado atómico de inventario

Base del cambio: `551fcb893a532f36a3ab08281b5cd5e935142df1`.
Alcance: movimiento manual, compra completa y reversión de compra. No incluye
PR324, rediseño de roles, correcciones históricas, Telegram ni cierre de aplicaciones.

## Contrato

- La migración candidata `185_inventario_guardado_atomico.sql` agrega un RPC
  `SECURITY INVOKER` y una tabla de recibos con RLS por usuario y rol activo.
  No modifica políticas ni permisos de tablas existentes. La autorización
  conserva Gerencia/Administrador; Verificador, Monitor, anon e inactivos no escriben.
- Una llamada guarda todo o nada. El saldo se calcula dentro de PostgreSQL
  sobre productos bloqueados. Una compra bloquea sus productos por UUID ordenado.
  Un ajuste absoluto exige el saldo mostrado: si cambió, el usuario vuelve a seleccionarlo.
- Cada intento tiene una clave duradera, separada por usuario y tipo de operación.
  El navegador la guarda antes de enviar. Un reintento devuelve el recibo de la
  operación original; no vuelve a mover inventario. Un error de red conserva el
  intento y bloquea otros datos hasta verificarlo. No existe fallback a escrituras sueltas.
- Los recibos se conservan; no caducarlos ni borrarlos durante el periodo de reintento.
  La eliminación de la cuenta de Auth elimina sus recibos por cascada, sin tocar
  los movimientos de dominio, para no agregar un bloqueo a la baja de usuarios.
  La tabla conserva datos operativos ya autorizados al usuario; no contiene tokens.
  El acceso directo del mismo usuario a sus recibos existe por el contrato INVOKER:
  esta entrega evita duplicados accidentales, no rediseña clientes hostiles que ya
  tienen escritura directa sobre el inventario.
- El responsable se obtiene del JWT. Una compra conserva su costo y trazabilidad;
  borrar conserva la Entrada y agrega una compensación, restaura el precio de la
  compra sobreviviente o NULL y ejecuta el cleanup existente dentro de la transacción.
  Se conserva el convenio histórico de cantidad positiva en la compensación.
- Storage queda fuera de la transacción. La limpieza existente solo se intenta
  después de confirmar el borrado. Si se perdió la respuesta o falla Storage,
  puede quedar el documento conservado; nunca se repite la reversión para limpiarlo.

## Validación local

`python scripts/tests/inventario-f1-postgres.py` ejecuta la migración completa en
PostgreSQL 17 desechable, sin red ni puertos, con usuarios y datos sintéticos.
Requiere Docker y `postgres:17-alpine` disponible; el script usa `--pull=never`.
Cubre concurrencia, idempotencia, rollback por fallos, roles, ajustes obsoletos,
compras de varias líneas y repetidas, reversión y restauración del precio.
El contenedor se elimina al terminar. No acepta una conexión externa.

El fixture es una prueba rápida independiente. Para esta publicación también se
probó la migración en desarrollo con PostgreSQL 17, GoTrue v2.197.0 y PostgREST
v16.5, aislados de internet y sin puertos públicos. Se reconstruyeron desde catálogo
85 columnas de inventario con tipos, precisión y defaults reales, sus constraints,
14 políticas relevantes y 4 triggers. Las dependencias auxiliares usan datos
sintéticos; no es un clon completo de producción. GoTrue emitió una sesión local
y PostgREST confirmó el mismo recibo en dos peticiones, con un solo cambio de
stock; rechazó el mismo token después de bajar el rol y rechazó al anónimo.

La precisión real es NUMERIC(12,2). El RPC redondea cantidades y costos antes de
calcular saldos, para que una salida fraccionaria no redondee distinto del ledger.
La prueba local cubre específicamente este caso.

Validación de publicación: 17 grupos PostgreSQL; 210 archivos / 4646 tests Vitest
en Node 20.20.2 (la versión de CI); typecheck y build correctos; lint sin errores
(avisos existentes). Chromium pasó recuperación tras error de red y recarga a
1280px y 390px, con los mismos datos e identificador y sin desbordamiento horizontal.
Un test existente de entrada sobredimensionada del hook dio EPIPE intermitente en
Node 24; el archivo y la suite completa pasaron en el runtime de CI. No se modificó
el hook ni sus pruebas como parte de F1.
Los tests Vitest de guardado cubren la pérdida de respuesta, recarga, aislamiento
de claves por usuario, datos editados y respuestas tardías. Las guardas anteriores
de orden de peticiones se actualizaron porque ya no existen escrituras parciales.

## Orden de publicación — requiere autorización de publicación

1. Registrar SHA y despliegue productivos actuales. Verificar en catálogo, sin
   consultar datos de negocio, columnas, enums, políticas, triggers y permisos de
   `productos`, `compras`, `movimientos_inventario` y el cleanup de compras.
   Confirmar que el número 185 sigue libre y contrastar el ledger de migraciones.
2. Revisar especialmente los triggers que pueden omitir escrituras y la política
   de cleanup de gastos. Confirmar en desarrollo que un fallo revierte la llamada completa.
3. Aplicar solamente la migración nueva, en una transacción. El frontend anterior
   continúa funcionando. No ejecutar el histórico de migraciones ni backfills.
4. Verificar por catálogo INVOKER, search_path, RLS del recibo y ausencia de EXECUTE
   para anon; publicar después el frontend revisado. No requiere desplegar edge functions.
5. Verificar interfaz móvil y el aviso «Verificar guardado pendiente» en desarrollo
   sin cuentas reales. La aceptación productiva de una escritura requiere permiso
   explícito; no crear operaciones de prueba sobre registros de la finca.

La aplicación productiva y su versión del ledger se registran solo después de
confirmar la ejecución. El despliegue previo observado para rollback es
`dpl_3D5xWNdzXZY9zLaAN6aMXBCAEwZN`, SHA
`551fcb893a532f36a3ab08281b5cd5e935142df1`.

## Reversión

Si falla la migración, su transacción no deja objetos parciales. No publicar el cliente.
Si falla el frontend, pausar capturas y volver al despliegue exacto registrado en
el paso 1. Conservar el RPC, la tabla y todos los recibos: son aditivos y pueden
ser necesarios para confirmar solicitudes previas. Conservar también los intentos
pendientes del navegador. No volver a capturar una operación incierta con el
cliente anterior: resolver su recibo antes para evitar duplicarla.

Volver al frontend anterior reintroduce el riesgo F1; sirve para recuperar
disponibilidad, no para declarar el defecto resuelto. No revertir saldos, compras
ni movimientos automáticamente. No borrar recibos ni aplicar un backfill como rollback.

Tras publicar, recargar las pestañas abiertas antes de capturar inventario. Las
pestañas con el bundle anterior pueden conservar el escritor antiguo hasta la recarga.

## Registro de publicación

Migración 185 aplicada a `ywhtjwawnkeqlwxbvgup` el 2026-10-27
(America/New_York), desde el contenido literal del PR #353, commit
`8f85a445d917ef5ebbb175a548a758ccbe73f8ad`, blob
`5b34669dad37a67662bb3890ec0d29da24ff72fc`. Ledger verificado:
`20261028014545`, nombre `185_inventario_guardado_atomico`.
El catálogo confirmó INVOKER, search_path fijo, EXECUTE authenticated y sin
EXECUTE anon, recibos con RLS por usuario/rol activo y sin DELETE authenticated.
Políticas, helpers y cuatro triggers existentes coinciden con el preestado.
No se consultaron ni modificaron datos de negocio para validar.
Frontend pendiente de merge y verificación del alias productivo al registrar
esta entrada; la aplicación de la base no demuestra el despliegue del cliente.
