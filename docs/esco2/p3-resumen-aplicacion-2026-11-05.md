# P3 · resumen de cantidades de una aplicación

Fecha: 2026-11-05. Base: main `1dabf041`. Corrección A2 dentro del
[contrato P3](p3-source-contract.md), sección 2; no añade operaciones, filtros ni semántica de
calibración, avance porcentual o costo por lote/árbol.

## Problema y comportamiento

Al pedir cantidades de una aplicación, el resultado conservaba los desgloses por lote y mezcla,
pero no todos los totales de aplicación. El plan guardado y la ejecución incorporan ahora su
propio resumen determinista, con productos, recipientes y magnitud guardada de mezcla separados.
Se mantienen detalle, procedencia y conciliación.

- Producto planeado: sumar cada total guardado de mezcla una vez por producto/unidad, antes de
  cualquier unión con lotes. No sumar otra vez los desgloses reconstruidos.
- Producto ejecutado: acumular las filas ya verificadas por ID/producto/unidad; conservar el
  período de ejecución elegido y el plan completo por separado.
- Recipientes y L/kg de mezcla: acumular sus propias fuentes. No convertir canecas ejecutadas
  en litros de mezcla o agua ni mezclar unidades incompatibles.
- Una contribución NULL, omitida o incompatible impide declarar completo su total. Se conserva
  el subtotal conocido rotulado y el estado. El total guardado de un plan que no concilia sigue
  visible como guardado, con aviso de discrepancia; nunca como reconstrucción exacta.

El renderer añade dos líneas de resumen y conserva los desgloses. Los nombres preceden a los
identificadores. No modifica `dineroMensaje`, el puntuador, anclas ni tolerancias.

## Verificación independiente

QA congeló pruebas de integración sintéticas antes de leer la implementación: 13 fallaban por
la ausencia de resumen y una confirmaba el rechazo de Administrador. La versión final incluye
15 pruebas QA y 8 unitarias, con disponibilidad por campo, ausencia frente a vacío, cero/NULL,
mezclas múltiples, unidades incompatibles, discrepancia, período, padres e hijos y autorización.
No hay preguntas, valores ni respuestas del dev-set en los tests públicos.

El coordinador repitió `npm test`: **7.800/7.800**, 337 archivos; `npx tsc --noEmit` aprobado;
`npm run lint`: **0 errores / 907 avisos** existentes. `git diff --check` limpio.
Grafo desde `supabase/functions/esco-consultas/index.ts`: **38 módulos**, imports locales
resueltos con `.ts`, sin `@/`. El archivo nuevo está en `src/utils/esco2`, ya cubierto por el
workflow de deriva; no necesita otra ruta. Los 38 hashes de runtime permanecieron iguales entre
verificación y la corrida corregida.

## Tamaño sobre las 25 aplicaciones reales

Una lectura administrativa de solo lectura por Composio `SUPABASE_RUN_READ_ONLY_QUERY`, cuenta
`escocia-os`, capturó las columnas fijas de cantidades. Se comparó baseline y corrección sobre
la misma captura, con lectores reales y cliente PostgREST local. Esa simulación no prueba RLS
con un JWT de usuario. Filas y resultados permanecen locales e ignorados por Git.

| Medida | Antes | Después |
|---|---:|---:|
| Líneas, mediana / máximo | 24 / 89 | 26 / 91 |
| Caracteres, mediana / máximo | 1.883 / 6.604 | 2.187 / 7.495 |
| Respuestas con UUID | 0 | 0 |
| Estados ok / parcial | 17 / 8 | 17 / 8 |
| Discrepancias conservadas | 9 | 9 |
| Columnas no leídas en esta captura | 0 | 0 |

## Desarrollo con referencia vigente

Se contrastaron las cinco anclas de la única familia cubierta con una fuente viva emparejada:
cero valores cambiados. Pregunta, historial, anclas, tolerancias y puntuador originales intactos.
El contexto «hoy» del replay usa Bogotá del corte vivo; el as-of original queda como procedencia,
sin rotular un precio actual con una fecha histórica. Las otras seis familias parciales/fuera
siguen sin puntuarse; no se cambia el denominador original de siete entradas.

| Corrida, tres repeticiones | Selección original | Respuesta original |
|---|---:|---:|
| Baseline vivo | 0 / 3 | 0 / 3 |
| Corrección local | 2 / 3 | 0 / 3 |

En dos intentos corregidos, resultados contienen 5/5 anclas y el texto 4/5; el restante pidió
aclaración y conserva su fallo, sin operaciones. Persiste una ancla monetaria incompatible con
el redondeo abreviado obligatorio. No se altera formato ni oráculo para hacerla pasar en este PR.
QA independiente no observó afirmaciones factuales críticas sin soporte en los tres turnos,
pero registró dos omisiones de subparte y una aclaración no pertinente. Los dos turnos
sustantivos concuerdan con la fuente pareada; eso no elimina esas obligaciones incompletas.
Cero UUID no equivale a aceptación funcional ni a certificar todo el dominio. El informe de
cierre conserva el resultado original y las limitaciones de esta única familia cubierta.

Gasto de modelo de esta corrección: USD **0,000398410**; acumulado P3 USD **0,052052470**
de USD 0,25 (incluye A0, diagnóstico inicial y baseline vivo). No más llamadas en esta entrega.
Una sola corrección de runtime; no se cuentan diagnósticos como ciclos para forzar el corte M4.
P3 continúa no aceptado. La regla de dinero solicitada después por Santiago se revisa en otro PR
independiente; este PR no la incluye ni despliega runtime.

CI `verificacion` debe comprobarse sobre el SHA publicado y registrarse en el PR. Claude Code
revisa y decide merge. Sin merge, deploy manual, migración, secretos ni escritura productiva;
`esco-consultas` v6 y `make-server-1ccce916` v295 permanecen sin modificación por esta entrega.
