# Confirmar un paso desde /tratamiento (#257)

Al elegir un animal, el bot ofrece sus pasos sin ejecutar de tratamientos activos.
Cada paso muestra el medicamento y la fecha programada. Confirmar pide la fecha
real (Bogotá, con año y desambiguación cuando corresponde) y una segunda aceptación.
Solo se confirma el paso elegido. Registrar un tratamiento nuevo sigue disponible
incluso si falla la consulta o la confirmación. Terminar no crea un tratamiento.

La RPC hermana `fn_hato_confirmar_paso_tratamiento` actualiza el paso y sus alertas
abiertas en una transacción. Verifica animal, tratamiento no cancelado y fecha;
no sobrescribe una confirmación con otra fecha. Repetir la misma fecha es seguro.
El tratamiento pasa a completado cuando ya no tiene pasos sin ejecutar. No cambia
el motor de alertas ni `fn_hato_registrar_tratamiento`. El bot vuelve a consultar
la cuenta vinculada de Telegram en el momento de escribir. Después intenta retirar
los botones de las alertas ya enviadas; un fallo de Telegram no revierte el dato.

## Responder una alerta

El handler existente de «Sí» intenta marcar `fecha_ejecutada` con el día UTC del
servidor. El cierre de alerta y la actualización del paso son escrituras separadas:
si falla la segunda, puede quedar un paso pendiente con alerta ya cerrada. «No» y
«Otro» no ejecutan el paso y quedan para revisión de gerencia. Este PR documenta
esa semántica; no cambia el handler general de alertas. La confirmación nueva usa
Bogotá y es atómica en la base de datos.

## Despliegue

La migración 177 está **aplicada desde el 2026-10-07**, ledger
`20261007132155`, antes del release edge v269. La instalación no modificó
registros existentes (27 tratamientos / 6 pasos / 126 alertas, sin cambios).
La función es INVOKER, con search_path fijo y ejecución solo para service_role;
anon/authenticated no pueden ejecutarla. No reaplicar por la cabecera histórica
«NO APLICADA» del archivo. El rollback retira la función después de retirar sus
llamantes, sin borrar hechos reales. Ver el [registro de publicación y deriva
posterior](despliegue-2026-10-07.md) para el estado del edge.

La validación local cubre pendientes, sin pendientes, nuevos siempre disponibles,
cancelación, fechas, múltiples pasos, paginación y conflictos. El simulador usa
el flujo real y transporte controlado; no sustituye una prueba en un bot Telegram
de prueba. No hay credenciales de dicho bot configuradas en el entorno cloud.
