# P3 Task 6: faltantes vigentes (D37)

Rama `codex/esco2-p3-task6`, independiente desde `main` `19bbc6ca`.
Operación cerrada `consultar_faltantes_aplicacion` sobre aplicaciones explícitamente
seleccionadas. Revisión y merge corresponden a Santiago o Claude Code.

## Resultado

La necesidad suma cada fila producto/mezcla una sola vez por `producto_id`, entre todas
las aplicaciones seleccionadas; después resta el stock una sola vez por producto.
Sin joins a cálculos/lotes, compras congeladas ni descuento de ejecución. No añade cerradas
implícitamente. `max(0, necesidad-stock)` requiere unidad compatible y valores completos.

Se extrae la acumulación anterior al redondeo de `calcularTotalesGlobalesProductos` y la
fórmula de `generarListaCompras` a `calculosNecesidadProductos.ts`, compartida también por
los motores originales. Su comportamiento previo conserva redondeo y defaults; D37 valida
antes de invocar y evita fabricar NULL, presentación o precio. Una necesidad fraccionaria
no se redondea hacia arriba a 0,01. La limpieza a 12 cifras significativas elimina residuo
binario en acumulación y presentación.

Plan no leído o sin productos impide declarar suficiencia. Stock NULL conserva sin dato;
producto no visible conserva inventario no disponible; unidades incompatibles impiden la
resta y no se rotula el stock con la unidad equivocada del plan. Otro producto válido
conserva su resultado. Solo necesidad y stock completos compatibles permiten afirmar
que alcanza el inventario registrado hoy. Fecha de consulta Bogotá, sin reserva garantizada.

Lectores caller-JWT con columnas fijas, conteo exacto, bloques `in` de 100, IDs únicos y
pertenencia a los padres visibles. Nombres antes de UUID; una línea por producto.
Registro, estado conversacional, núcleo y renderer agregan la operación de forma acotada.

## Verificación

QA fijó oráculos SQL/literales sintéticos ajenos al ejecutor antes del runtime; integra
handler real y lectores con SQL/RLS local, con red prohibida. Cubre fan-out entre mezclas/lotes,
stock descontado una vez entre aplicaciones, compras obsoletas excluidas, ejecución sin
resta, stock NULL frente a cero, inventario invisible/duplicado, unidades incompatibles,
plan parcial, padre invisible y bloques de 101 mezclas. Cada mutación tiene control positivo.
El coordinador repitió la suite completa, incluidos los 30 tests del calculador original.

| Check | Resultado del coordinador |
|---|---|
| `npm test` | 7.678 aprobadas, 327 archivos |
| Nuevas pruebas | 38: 15 backend y 23 QA |
| `npx tsc --noEmit` | Aprobado |
| `npm run lint` | 0 errores, 907 avisos existentes |
| Grafo desde `supabase/functions/esco-consultas/index.ts` | 31 módulos locales resueltos sin Deno; imports `.ts`, sin alias ni entorno de navegador |
| Deriva | Tres módulos D37 y helper compartido listados en workflow y regex |
| Fuentes durante verificaciones | 38/38 huellas estables |
| Whitespace | Aprobado |

Simulación local sin red sobre 24 aplicaciones reales explícitamente seleccionadas del
snapshot del **2026-11-03**, solo para tamaño: líneas mediana **8**, máximo **22**;
caracteres mediana **603**, máximo **1.496**; **0 respuestas con UUID**.
El snapshot no contiene `cantidad_actual`: las 24 respuestas retienen el stock como no leído.
No se fabrica inventario ni se certifican faltantes actuales. Esta simulación no puntúa
casos/referencias ni constituye aceptación funcional. Solo se publican agregados.

## Gasto y pendientes

Cero llamadas pagadas y **USD 0** incremental; acumulado publicado recibido **USD 0,0433 / 0,25**.
Sin preguntas semánticas esenciales abiertas. Prueba v5 Gerencia 200 / Administrador 403
pendiente por navegador deshabilitado/sin sesión; ningún envío al modelo.
El PR reportará CI `verificacion` en el SHA exacto. Sin lecturas/escrituras productivas,
deploy, migración, secretos, held-out ni runner final P3. Chat, Telegram y servidor legado
intactos. Tasks 4 y 5 van en PRs independientes; cierre P3 espera confirmación de las tres
en main. No se amplía el contrato a calibración, porcentajes ni costos por árbol/lote.
