# Esco 2.0 · Loop posterior a M6

Mandato de Santiago del 2026-11-07, posterior a la revisión de #451 (`c85ce43b`). Rama de implementación `codex/m6-loop-iteracion-0`, apilada en #451 y #450. El orden de fusión lo decide Santiago. Este documento registra el protocolo, no acredita aceptación.

## Custodia y autorización

| Rol | Responsabilidad | Separación |
|---|---|---|
| A | Código, regresiones, publicaciones agregadas y Bot Log | No abre SOMBRA, HO ni sus trazas |
| B | SOMBRA, captura, referencias SQL independientes, runner, adjudicación y ledger | Chat independiente; no cambia código ni abre HO |
| C | Una aceptación final con custodia D17 | Chat diferente de A y B, después de confirmación |

DEV parte de 22 escenarios autorizados y suma los quemados. B construye unos 50 escenarios SOMBRA, diez por dominio, desde PRD, P4 y contrato hato; nunca desde HO o sus paráfrasis. Clasificación y referencias se sellan antes de inferir. La revisión manual de todas las afirmaciones se sella antes de consultar la puntuación automática.

D-L1 aprueba USD 0,40 por iteración y USD 3,00 por todo el loop. La aceptación final requiere presupuesto separado. Antes de pagar, B calcula la cota completa con tarifas verificadas, catálogos, historial, esquemas, herramientas y reintentos. El máximo normal actualizado es dos extractores y dos planes por turno. Si excede los topes, presenta un importe concreto antes de inferir; no recorta cobertura para encajar.

D-L2 aprueba un corte productivo SOMBRA y reposiciones del mismo propósito, mediante Composio local `SUPABASE_RUN_READ_ONLY_QUERY`, cuenta explícita `escocia-os`. Una consulta barata debe confirmar primero el proyecto `ywhtjwawnkeqlwxbvgup`. Solo SELECT, sin RPC con efectos. Los archivos de captura, casos, referencias, clasificación y trazas permanecen privados fuera del repositorio público, directorios 0700 y archivos 0600. Al repositorio y Notion llegan exclusivamente agregados.

D-L3 sigue pendiente: HO nuevo recomendado, o reserva reutilizada. Solo bloquea la puerta final, no la iteración 0 ni el loop.

## Freeze y ciclo

1. A entrega un SHA inmutable. B congela configuración de modelo (`openai/gpt-6-luna`, esfuerzo `none`, ruta M6), DEV, SOMBRA, referencias, rúbrica, runner y saldo.
2. B corre DEV y SOMBRA completos, tres repeticiones en orden fijo. Reenvía `estadoToken` en continuaciones normales; separa conversación y repetición. No fabrica extracción desde referencias.
3. El ledger durable reserva antes de **cada** envío, incluido un reintento dentro del turno. Recibo/costo desconocido, transporte incierto o deriva de freeze impiden cualquier llamada siguiente.
4. La puerta interna exige DEV ≥90 %, SOMBRA ≥95 %, imprescindibles binarios de los cinco dominios en ambas particiones, cero críticos y cero escenarios inestables. Un escenario solo pasa si pasan todos sus turnos en las tres repeticiones. Wilson95 se informa y no es puerta.
5. Si pasa, B confirma mediante otra campaña completa sobre el mismo SHA. Ambas campañas deben pasar antes de C.
6. Si falla, B entrega familias agregadas por dominio/capa, escenarios y turnos perdidos, conducta esperada y una reproducción sintética con entidades y cifras inventadas. Nunca revela preguntas, respuestas, referencias o trazas originales.
7. A reproduce RED, corrige de forma general y deja verdes suite completa, regresiones M4/M5/M6, tipos, lint, build y replay. Todo cambio de texto visible al modelo requiere comparación contra el SHA anterior, al menos tres repeticiones DEV y una muestra SOMBRA, antes de aceptarlo como mejora.
8. B quema la estructura revelada hacia DEV y repone privadamente un caso del mismo dominio y clase, sin reducir SOMBRA.

Un crítico detiene inmediatamente la campaña; se corrige primero y la siguiente corrida es completa. Dos iteraciones consecutivas sin mejora SOMBRA de al menos cinco puntos detienen el loop para decisión de alcance. El máximo es seis iteraciones o USD 3,00, lo primero que ocurra. Un fallo ordinario seguro se registra y permite continuar.

## Puerta final y registro

C corre DEV y HO una sola vez con tres repeticiones y puertas M6 sin cambios: ≥90 % de escenarios en ambas particiones, imprescindibles y guardas, cero críticos, cero referencias inconclusas y evidencia completa. Un No-Go gasta ese HO; otra aceptación necesita uno nuevo.

El coordinador registra en E2-14 una fila agregada por campaña: SHA; DEV y SOMBRA k/n; Wilson95; críticos; inestables; imprescindibles por dominio; error_plan por código, incluido extractor; llamadas/turno; latencias p50/p95; USD conocido/desconocido; familias y quemados. B suministra los agregados; solo A escribe Bot Log BL64.

Las pruebas sin proveedor no estiman exactitud, costo o latencia reales. F7 queda para la primera campaña pagada. La iteración 0 y sus límites se reportan por separado.

## Publicación sin despliegue

Se mantienen las exclusiones de despliegue de #451 y de esta rama en `vercel.json`. La descripción del PR debe justificar expresamente esas guardas: publicar para revisión no autoriza desplegar. Antes de una fusión autorizada se decide su retiro; no se cambian incidentalmente para habilitar un despliegue.

No hay autorización de fusión, deploy, migraciones, secretos ni escrituras productivas; un Go tampoco la concede. Se mantienen fuera de alcance `chat.tsx`, `src/supabase/functions/server/`, `make-server-1ccce916`, Telegram, M7 y piloto.
