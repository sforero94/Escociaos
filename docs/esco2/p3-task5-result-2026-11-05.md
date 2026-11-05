# P3 Task 5: labor vinculada a aplicaciones (D36)

Rama `codex/esco2-p3-task5`, independiente desde `main` `19bbc6ca`.
Operación cerrada `consultar_labor_aplicacion`. Revisión y merge corresponden a Santiago
o Claude Code. Este trabajo no despliega ni certifica autorización productiva.

## Resultado

Se conserva cada aplicación seleccionada, incluso sin tarea. El único vínculo es
`aplicaciones.tarea_id = tareas.id = registros_trabajo.tarea_id`; los nombres solo presentan
identidad. Se reutiliza `metricas` de P2 mediante una exportación, sin cambiar su aritmética.
No se suman tablas de cuadrilla. Una tarea compartida se detecta entre todos los padres
visibles, se rotula como costo común y contribuye una vez al agregado.

Sin tarea, vínculo no leído, tarea no disponible, registros no leídos y lectura válida vacía
permanecen distintos. Costo NULL conserva jornales y subtotal conocido, sin total completo.
Una población no verificada no produce subtotal cero. Sin-lote se muestra aparte.
La vida completa y los intervalos inclusivos no sufren recorte silencioso a hoy.
La labor viva no cambia un costo congelado al cierre.

Lectores caller-JWT con proyecciones fijas, conteo exacto, bloques `in` de 100 y validación de
pertenencia. Nombres primero; UUID completo ante nombre ausente o colisión. El renderer
limpia las sumas y la presentación a 12 cifras significativas, sin modificar el motor P2.
Registro, núcleo, estado de conversación y renderer integran la operación de forma aditiva.

## Verificación independiente y del coordinador

QA fijó oráculos literales/SQL con fixtures sintéticas antes del runtime y usa el handler
real con SQL/RLS local y red prohibida. Sus 18 comprobaciones cubren join por ID frente a
texto, tarea compartida incluso fuera de selección, costo NULL frente a cero, sin-lote,
aplicación sin vínculo frente a tarea válida vacía, lectura incompleta, padre invisible,
lector hijo con pertenencia inválida, nombres repetidos y períodos inclusivos. Cada fallo
adversarial tiene un control legítimo. No son casos de desarrollo ni evidencia de P5.

| Check del coordinador | Resultado |
|---|---|
| `npm test` | 7.672 aprobadas, 327 archivos |
| Nuevas pruebas | 32: 14 backend y 18 QA |
| `npx tsc --noEmit` | Aprobado |
| `npm run lint` | 0 errores, 907 avisos existentes |
| Grafo desde `supabase/functions/esco-consultas/index.ts` | 30 módulos locales resueltos sin Deno; imports `.ts`, sin alias ni entorno de navegador |
| Detector de deriva | Tres módulos nuevos listados en workflow y regex |
| Fuentes durante verificaciones | 36/36 huellas estables |
| `git diff --check` | Aprobado |

Simulación determinista local de solo lectura sobre las 24 aplicaciones reales del snapshot
del **2026-11-03**, solo para medir salida: líneas mediana **9**, máximo **12**;
caracteres mediana **732**, máximo **1.003**; respuestas con UUID **0**.
No mide datos vigentes, exactitud del planificador ni aceptación funcional. No se publican
filas, preguntas, respuestas, identificadores ni trazas del snapshot.

## Gasto y pendientes

Cero llamadas pagadas; gasto incremental **USD 0**. Acumulado publicado P3 recibido para
esta tarea: **USD 0,0433 / 0,25**. Sin lectura productiva, escritura productiva, deploy,
migración, secretos, held-out ni runner final de aplicaciones. Pantalla v5 local preparada;
prueba autenticada Gerencia 200 / Administrador 403 pendiente por navegador del agente
deshabilitado y falta de sesión. No hay una pregunta semántica esencial abierta para D36.
El PR reportará `verificacion` en su SHA exacto. Tasks 4 y 6 son PRs separados;
el cierre de P3 espera confirmación de su integración en main.
