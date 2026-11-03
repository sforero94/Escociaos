# E2-18 — preflight de aislamiento del snapshot mínimo

Fecha de comprobación: 2026-11-03. Resultado: BLOQUEADO ANTES DE EXTRACCIÓN.

## Autorización vigente

Santiago autorizó la copia mínima de labores desde 2026-01-01 hasta el corte:
registros_trabajo (id, tarea_id, lote_id, fecha_trabajo, fraccion_jornal,
costo_jornal), tareas referenciadas (id, nombre) y lotes (id, nombre).
Destino: Codex Cloud aislado, fuera de repositorio; acceso restringido a Santiago
y evaluación designada; conservación máxima 30 días. Excluye personas, nómina,
notas y credenciales. No autoriza modelos, proveedores adicionales ni otros
dominios. La autorización está concedida; no se solicita repetirla.

La comprobación del aislamiento y de la retención es condición previa, y no se
ha podido demostrar. No se hizo ninguna consulta ni transferencia de producción.
No hay snapshot real nuevo en este ejecutor.

## Evidencia observada, sin consultar datos de negocio

- environment_status informó entorno conectado, observaciones actuales y
  política de red aplicada. Su esquema no ofrece roster/ACL de acceso al
  ejecutor, vínculo entre sesiones y procesos, fecha de destrucción del disco ni
  TTL de los datos. Conectividad no acredita confidencialidad o retención.
- UID efectivo 1000. Dos procesos con nombre codex y otros procesos usan ese UID.
  No se inspeccionaron argumentos, entornos ni contenidos de esos procesos.
  El recuento no demuestra dos personas/agentes: no permite atribuirlos a
  custodios autorizados, ni probar exclusividad de evaluación.
- /workspace/esco-evaluation-private pertenece al UID 1000 y tiene modo 700.
  Eso no separa sesiones/procesos que comparten UID y permisos sobre el volumen.
- El socket de Docker está accesible al usuario actual. Un contenedor en este
  mismo ejecutor, con el mismo control del socket/volúmenes, no acredita por sí
  solo una nueva frontera de acceso. No se creó ni inspeccionó otro contenedor.
- crontab no está disponible y no hay runtime systemd activo. No se encontró
  mecanismo de borrado ya operativo para este snapshot. Un script o recordatorio
  ligado a una sesión activa no garantiza un máximo de 30 días si esa sesión
  termina; falta evidencia de caducidad en el plano de control y sus copias.

No se afirma que el proveedor carezca de estos controles: los controles no
están demostrados con las capacidades disponibles. No se crearon usuarios,
credenciales, reglas de acceso, contenedores ni tareas de borrado.

## Condición para reanudar

Antes de copiar se necesita evidencia verificable del plano de control de:

1. Ejecutor dedicado al snapshot mínimo y su evaluación; identidad y lista de
   custodios limitada a Santiago y evaluador designado; sin acceso de frentes de
   implementación ni otros agentes, incluido el volumen y sus snapshots/backups.
2. Caducidad automática del volumen y sus copias como máximo 30 días después de
   extraer, independiente de que una sesión siga viva; responsable y evidencia
   de borrado. No basta destruir el proceso o contenedor.
3. Transferencia con corte consistente e identidad existente autorizada, sin
   credenciales nuevas; después, evaluación local sin envío a proveedores.
4. Revisión local de los nombres de tareas antes de acceso adicional o envío.
   No se pudo hacer todavía porque deliberadamente no se extrajeron nombres.

Si no hay capacidad existente para el corte consistente, se solicita un export
consistente al custodio de la base, sin escalar permisos.

## Alternativa específica propuesta

Preparar un entorno Codex Cloud dedicado con controles de acceso y expiración
del volumen verificados en la administración de la plataforma, usando solo
identidades ya autorizadas. Necesita confirmación administrativa de los puntos
anteriores antes de mover un byte real. Una carpeta, un worktree, otra sesión o
un contenedor dentro del ejecutor actual no sustituyen esa comprobación.

Si la plataforma no permite demostrar ACL y borrado dentro del plazo, no usar
Codex Cloud para almacenar este snapshot. Santiago puede conservar y evaluar el
export en un entorno privado existente bajo su control; ese cambio de destino
requeriría autorización específica y la misma comprobación de retención. Aquí
continúan únicamente controles sintéticos y documentación, sin copia real.

## Estado y siguiente acción

E2-18 queda Bloqueado por controles técnicos no acreditados, no por falta de
autorización de copia. El siguiente paso es obtener evidencia administrativa
de acceso/TTL del destino dedicado; si no es posible, acordar otro destino.
No se contactó a terceros ni se modificó la configuración del entorno.
