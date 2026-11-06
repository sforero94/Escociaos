# P4-1: incidencia y gravedad por ronda

Fecha: 2026-11-05. Base: `main` `d6a67cc`, posterior a `5367e060`.
Primera entrega runtime del [contrato P4](p4-source-contract.md). Este documento
recoge evidencia agregada de implementación; no propone aceptar M5.

## Alcance

Consulta cerrada de incidencia y gravedad por ronda, con identidad por ID de ronda,
lote, sublote y plaga. Se reutilizan `calcularIncidencia` y `clasificarGravedad`:
la razón es ponderada por observaciones de árboles muestreados, no un conteo de
árboles únicos. No mezcla plagas ni atribuye rondas por fecha. Severidad y densidad
permanecen fuera del alcance, conforme a D38; D42 conserva cada observación válida.

Backend y QA trabajan por separado. QA construye sus referencias sintéticas con SQL
independiente del ejecutor. No se consultan fuentes productivas en esta entrega.

## RED antes del parche

QA congeló dos archivos de pruebas antes de modificar runtime. Su primera ejecución
tuvo **34 fallos y dos controles aprobados, sobre 36 pruebas**: la operación aún no
estaba registrada. Los controles de SQL independiente y denegación a Administrador
ya pasaban. El coordinador reprodujo el mismo RED antes de liberar el parche.

| Archivo QA congelado | SHA-256 |
| --- | --- |
| `esco2P4Task1QaHarness.ts` | `a97191e8f464baa63a18bcfa5032e7b32c63d95083519151f1e7eee34732a322` |
| `esco2P4Task1QaIntegration.test.ts` | `0e192812ea452f9e0a9bd9db937443a49282f22ce8f6a1f24371a2f13c60dd0c` |

También hubo RED backend: dos fallos de registro y módulos todavía ausentes; los
negativos del registro ya rechazaban la propuesta no soportada. Los logs de trabajo
se conservan fuera de Git; aquí solo se publican agregados y huellas de tests sintéticos.

La revisión del oráculo no exige agrupaciones de lote/sublote si no se solicitan.
Las pruebas distinguen agrupación explícita y resultado agregado por ronda/plaga.

En la primera pasada integrada, un control de porcentaje usaba igualdad exacta de
punto flotante. El motor compartido devuelve un residuo IEEE754 en el valor matemático
esperado; QA cambió únicamente el comparador a precisión de diez decimales, con revisión
del coordinador. No cambió la referencia matemática, la gravedad ni el motor. La copia
original y su huella permanecen fuera de Git. La huella del test revisado es
`c445f11b338ac27b8c475ab35a663f3f33a5740f571db7eca8b634259831eab5`.
El coordinador repitió ese test revisado sobre una copia limpia de main sin P4:
**34 fallos y dos controles aprobados**, igual que antes. No hubo campaña ni gasto.

La revisión integrada añadió diez controles separados del conjunto original. Se
reprodujeron antes de corregirlos seis fallos de validación/vínculos: selectores de
ronda con tipo incorrecto, agrupaciones vacías normalizadas y un padre de sublote
no legible presentado como ausencia. Los controles adicionales también comprueban
etiquetas de filtros sin agrupar, selecciones lote/sublote incompatibles y un positivo
en el modo de cobertura obligatoria que usa el servidor por defecto.

## Cobertura de QA

Recorrido: intención aprobada → manejador HTTP real → lectores fijos con JWT/RLS
sintético → respuesta determinista, sin red ni modelos. Cubre ronda multifecha y dos
rondas con la misma fecha; varias observaciones del mismo grupo sin MAX ni deduplicación
heurística; ausencia frente a cero registrado; denominadores/numeradores inválidos;
sublote ajeno; PK repetida en transporte; límites de gravedad 10/30; padres ocultos;
lecturas fallidas y truncadas; última ronda global frente a última observación disponible;
proyección explícita, nombres visibles y denegación antes de planificar para Administrador.

## Verificación final

El coordinador repitió la verificación del árbol final:

| Comprobación | Resultado |
| --- | --- |
| Backend P4-1 | 22/22 |
| QA independiente por HTTP/SQL/RLS controlado | 46/46 |
| Suite completa, `npm test -- --maxWorkers=4` | 8.034/8.034, 356 archivos |
| `npm run typecheck` | Aprobado |
| `npm run lint` | 0 errores, 907 avisos existentes |
| `npm run build` | Aprobado |
| Grafo local desde `esco-consultas/index.ts` | 43 módulos, sin rutas faltantes, alias incompatibles ni dependencias fuera de vigilancia |
| `git diff --check` | Limpio |

La primera suite global detectó una expectativa exacta del detector de deriva que no
incluía la nueva dependencia `calculosMonitoreo.ts`: 8.033/8.034 aprobadas. Se sincronizó
esa única ruta en el test; QA comprobó que conserva el resto de rutas, JWT y health.
Sus 47 pruebas pasaron por separado y la segunda suite global aprobó completa.
La adaptación de tipos del evaluador no cambia rúbrica ni tolerancias históricas.

La huella final del test suplementario es
`e715a696df10fd97e271459f9873414abc9e7eb2151979535f02c969e7eb2e0b`.
El PR enlaza el resultado de CI `verificacion` sobre su SHA final. Los recibos locales
de RED, revisión y verificación permanecen fuera de Git; no contienen una campaña M5.

## Dimensionamiento y puertas siguientes

El paso 0 está guardado en el [§10 del master plan](https://www.notion.so/40d67755ed6881dba866f9775fca997e).
Estima 22–39 jornadas tradicionales equivalentes pendientes para M5–M7 y mantenimiento
inicial, 26,4–46,8 con reserva del 20 %, sin atribuir horas históricas no registradas.
La proyección de modelo del piloto es USD 0,48–2,61/mes para 1.100–6.000 tareas factuales
completas, manteniendo la mezcla de M4; no constituye un presupuesto autorizado del piloto.

Santiago confirmó el corte M5: desarrollo ≥70 % por dominio tras máximo dos ciclos de
corrección, imprescindibles aprobados y cero fallos críticos observados. Tope conjunto
P4/M5: USD 0,25. Gasto nuevo de modelo en esta entrega: **USD 0**.

Claude Code revisa y fusiona. P4-2 parte de main cuando integre P4-1; las demás tareas
siguen la secuencia de PR autorizada. La campaña M5 espera P4-6 fusionado, congelamiento
previo y revisión del oráculo por un segundo revisor; QA manual en otra sesión y automático
intacto. M6 espera aceptación explícita de M5.

Sin held-out, despliegue, migraciones, secretos ni escrituras productivas. No se modifica
`chat.tsx`, Telegram ni los servidores heredados. Esta QA con fuente controlada no acredita
permisos JWT productivos, calidad de planificación con modelo real ni aceptación funcional.
