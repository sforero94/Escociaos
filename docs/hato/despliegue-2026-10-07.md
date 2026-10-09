# Despliegue del 7 de octubre de 2026

Autorización explícita del dueño: mezclar y desplegar los cinco PR revisados.
Se mezclaron en orden #305, #306, #307, #308 y #309. Código publicado:
`1537042b6f62bfe685437207d911769e9257dfc3`.

| Componente | Evidencia verificada |
| --- | --- |
| Integración | Typecheck y build correctos; 200 archivos y 4072 pruebas pasan. CI de main: [37626738730](https://github.com/sforero94/Escociaos/actions/runs/37626738730). |
| Navegador local | Chromium repitió #253/#255/#257 contra el código integrado; se inspeccionaron capturas de escritorio/móvil. |
| Frontend | Vercel producción READY, commit `1537042`, deployment `dpl_4MQiduPJ7pTTVd17Dw1PC1i7SmmD`; [aplicación](https://escociaos.vercel.app). |
| Migración 177 | Ledger `20261007132155`; md5 de función `10ba388b86c82d8bec5aa73ac10af595`. INVOKER, search_path fijo, EXECUTE solo service_role. Conteos 27 tratamientos / 6 pasos / 126 alertas sin cambios. |
| Edge | `make-server-1ccce916` v269 ACTIVE, `verify_jwt=false`, hash `22ccd2772867190d442b6c826b8997a2ca78f0aed8edeeeb1886e1beb5d47e5a`. GET health devuelve `{"status":"ok"}`. |

La tabla conserva la evidencia **al publicar el release original**, no afirma
que aquella versión siga siendo la última. Las actualizaciones y la deriva
observada después se registran abajo.

## Publicación y recuperación

La migración se aplicó una vez, con guarda de ausencia de RPC/ledger 177 y clave
de idempotencia, antes de publicar el edge. No se ejecutó la RPC sobre registros
reales ni se repitieron las migraciones 147/153/176.

Se publicaron los 77 archivos del árbol edge del commit indicado, agrupados en
un solo módulo ESM con esbuild 0.25.12. Los imports `npm:`, `jsr:`, `https:` y
`node:` se conservaron externos para Deno. SHA256 del módulo fuente:
`ab72ae8980a5f235b03b58b3ff94917bde39c124f2c79dcc635ee1e037a8c7e0`.
La validación bundle-only terminó correctamente; una lectura posterior confirmó
que producción todavía era v268 antes de publicar. El conector de publicación
activa JWT por defecto; se restauró inmediatamente el valor previo false por la
API de configuración y se releyó antes de verificar health. La autenticación del
webhook sigue en su secreto interno. No se agregó un workflow de despliegue.

Para recuperar el código anterior, el árbol edge del commit
`08830c31d2409189be421bd40d5b4c1ce1a34759` está conservado en git y en un archivo
de recuperación; no tiene diferencias con el árbol anterior al release. Publicar
ese árbol mediante CLI o con el mismo empaquetado y conservar `verify_jwt=false`;
comprobar metadata y health después. La RPC 177 es aditiva y puede permanecer con
el código viejo. Su DROP documentado es opcional tras retirar los llamantes;
no deshace confirmaciones reales realizadas después del despliegue.

## Actualizaciones posteriores

El PR #310 registró este despliegue. El PR #313 se mezcló como
`d2dd49dc8dfe92fdfc6e2d5583cc342e44e56579`; su CI de main
[37640083110](https://github.com/sforero94/Escociaos/actions/runs/37640083110)
pasó. La migración 178, ledger `20261007144321`, concilió PACHA #202 (antes
#5202, Supata) y retiró la ficha espuria MOROCHA con dos filas completas
respaldadas. Conservó UUID/genealogía y todos los otros campos de PACHA;
180 fichas totales, 68 activas, cero descartadas. No cambió código de aplicación
ni necesitó otra publicación del edge. [Evidencia y recuperación de datos](conciliacion-pacha-202.md).

**Deriva observada después, 2026-10-07:** dos lecturas independientes de metadata
muestran v271 ACTIVE, actualizada a las **15:02:50 UTC**, hash
`7ecfd539cbac8319fb288c31d189a0ffce673643c8ffba5caf3d1fa5439dde7c`,
`verify_jwt=true`. Un GET de `/health` devuelve **401**
(`UNAUTHORIZED_NO_AUTH_HEADER`), frente al resultado OK del release v269.
Estas lecturas no identifican al responsable ni verifican que el código v271
contenga todos los cambios originales. No se adopta este hash como baseline,
ni se revierten publicaciones o permisos sin establecer propiedad y alcance
de aquel despliegue. El registro versionado conserva el release verificado.

**Recuperación, 2026-10-07 (ESCO-148):** **v272**, publicada a las
**15:10:31 UTC**, restauró `verify_jwt=false` y `/health` volvió a 200. Es el
código del commit `abadada` (#311, mezclado a las 15:06:12 UTC); la corrida del
detector de las 19:02 UTC registró ese commit con hash
`ed115fab0b35188f598ac6a02e73c936127b681d53ab106843e4eb708060caa7`
(`scripts/deploy-drift-state/make-server-1ccce916.json`). Los logs muestran
errores de arranque del worker a las 15:01 UTC y después 401 del gateway en
`/clima/sync` y `/health` hasta v272: unos 16 minutos con producción caída y
3 lecturas de clima perdidas. El detector de deriva no podía ver ninguno de los
dos modos; desde ESCO-148 falla si `verify_jwt` no es `false` o si el GET
anónimo a `/health` no devuelve 200.

## Límites pendientes

No se afirma una prueba de Telegram real: falta el bot de pruebas configurado.
El navegador validó componentes y un simulador local, sin modificar producción.
La auditoría #258 sigue abierta por la lista y causa originales del descarte
del 11 de agosto. **PACHA/MOROCHA ya está conciliada por la 178**; no falta nueva
evidencia de esa identidad. La deriva v271 quedó cerrada por v272 (arriba).
Los 42 casos históricos de labores
mantienen la aceptación anterior. Este despliegue no modifica esos registros.
