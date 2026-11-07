# Esco 2.0 · Loop posterior a M6

Mandato de Santiago del 2026-11-07, posterior a la revisión de #451 (`c85ce43b`). Presupuesto y campaña escalonada actualizados el mismo día, tras la revisión de #452. Rama de implementación `codex/m6-loop-iteracion-0`, apilada en #451 y #450. El orden de fusión lo decide Santiago. Este documento registra el protocolo, no acredita aceptación.

## Custodia y autorización

| Rol | Responsabilidad | Separación |
|---|---|---|
| A | Código, regresiones, publicaciones agregadas y Bot Log | No abre SOMBRA, HO ni sus trazas |
| B | SOMBRA, captura, referencias SQL independientes, runner, adjudicación y ledger | Chat independiente; no cambia código ni abre HO |
| C | Una aceptación final con custodia D17 | Chat diferente de A y B, después de confirmación |

DEV parte de 22 escenarios autorizados y suma los quemados. B construye unos 50 escenarios SOMBRA, diez por dominio, desde PRD, P4 y contrato hato; nunca desde HO o sus paráfrasis. Clasificación y referencias se sellan antes de inferir. La revisión manual de todas las afirmaciones se sella antes de consultar la puntuación automática.

D-L1 aprueba USD 0,40 por iteración y USD 3,00 por todo el loop, medidos en **gasto real** según los recibos del proveedor. La confirmación del paso 5 cuenta como una iteración. La aceptación final requiere presupuesto separado. El máximo normal por turno es dos extractores y dos planes.

El tope se aplica por llamada, no por campaña:

- Antes de cada envío, incluido un reintento, B reserva el peor caso de **esa** llamada: tokens de entrada contados del mensaje real más `maxTokens` de salida, a la tarifa verificada. Al llegar el recibo libera la reserva y registra el costo real.
- Si `gasto real + reserva de la próxima llamada` supera el tope de la iteración o del loop, B no envía y para. El exceso máximo posible es una llamada.
- La primera iteración empieza por DEV repetición 1. Con esos recibos B mide el costo real por turno y proyecta la iteración. Si la proyección supera USD 0,40, para y presenta la cifra medida a Santiago antes de seguir.

Santiago autorizó además USD 4 por campaña y USD 12 en total como **respaldo**. No se usa como reserva: solo se activa si la proyección medida no cabe y Santiago da el visto bueno a esa cifra antes de la llamada que cruce USD 0,40 o USD 3,00. Nada de esto recorta cobertura: si no cabe, se para y se pregunta.

D-L2 aprueba un corte productivo SOMBRA y reposiciones del mismo propósito, mediante Composio local `SUPABASE_RUN_READ_ONLY_QUERY`, cuenta explícita `escocia-os`. Una consulta barata debe confirmar primero el proyecto `ywhtjwawnkeqlwxbvgup`. Solo SELECT, sin RPC con efectos. Los archivos de captura, casos, referencias, clasificación y trazas permanecen privados fuera del repositorio público, directorios 0700 y archivos 0600. Al repositorio y Notion llegan exclusivamente agregados.

D-L3 sigue pendiente: HO nuevo recomendado, o reserva reutilizada. Solo bloquea la puerta final, no la iteración 0 ni el loop.

## Freeze y ciclo

1. A entrega un SHA inmutable. B congela configuración de modelo (`openai/gpt-6-luna`, esfuerzo `none`, ruta M6), DEV, SOMBRA, referencias, rúbrica, runner y saldo.
2. **Comparación pareada.** El SHA base (`c85ce43b` en la iteración 1; después, el SHA anterior) corre una repetición de DEV y SOMBRA. Se compara escenario por escenario con la etapa 1 del candidato. Decide si el candidato no empeora; la estabilidad del candidato la miden sus propias repeticiones.
3. **Campaña escalonada del candidato**, en orden fijo. Reenvía `estadoToken` en continuaciones normales; separa conversación y repetición. No fabrica extracción desde referencias.
   - Etapa 1: repetición 1 de DEV y SOMBRA completas.
   - Etapa 2: si la puerta todavía se puede alcanzar (DEV: máximo 2 escenarios fallidos de 22; SOMBRA: máximo 2 de 50), repeticiones 2 y 3 de los escenarios que pasaron la etapa 1.
   - Etapa 2 corta: si la puerta ya no se puede alcanzar, solo la repetición 2 de los escenarios que pasaron, para medir inestabilidad, y se para.

   La regla no cambia ninguna puerta: un escenario que falló un turno en la etapa 1 ya falló, porque la puerta exige todos sus turnos en las tres repeticiones.
4. El ledger durable reserva antes de **cada** envío, incluido un reintento dentro del turno. Recibo/costo desconocido, transporte incierto o deriva de freeze impiden cualquier llamada siguiente.
5. La puerta interna exige DEV ≥90 %, SOMBRA ≥95 %, imprescindibles binarios de los cinco dominios en ambas particiones, cero críticos y cero escenarios inestables. Un escenario solo pasa si pasan todos sus turnos en las tres repeticiones. Wilson95 se informa y no es puerta.
6. Si pasa, B confirma mediante otra campaña completa sobre el mismo SHA, con las tres repeticiones de todos los escenarios. Ambas campañas deben pasar antes de C.
7. Si falla, B entrega familias agregadas por dominio/capa, escenarios y turnos perdidos, conducta esperada y una reproducción sintética con entidades y cifras inventadas. Nunca revela preguntas, respuestas, referencias o trazas originales.
8. A reproduce RED, corrige de forma general y deja verdes suite completa, regresiones M4/M5/M6, tipos, lint, build y replay. Todo cambio de texto visible al modelo se mide con la comparación pareada del paso 2 antes de aceptarlo como mejora.
9. B quema la estructura revelada hacia DEV y repone privadamente un caso del mismo dominio y clase, sin reducir SOMBRA.

Un crítico detiene inmediatamente la campaña; se corrige primero y la siguiente corrida es completa. Dos iteraciones consecutivas sin mejora SOMBRA de al menos cinco puntos detienen el loop para decisión de alcance. El máximo es seis iteraciones o USD 3,00, lo primero que ocurra. Un fallo ordinario seguro se registra y permite continuar.

## Puerta final y registro

C corre DEV y HO una sola vez con tres repeticiones y puertas M6 sin cambios: ≥90 % de escenarios en ambas particiones, imprescindibles y guardas, cero críticos, cero referencias inconclusas y evidencia completa. Un No-Go gasta ese HO; otra aceptación necesita uno nuevo.

El coordinador registra en E2-14 una fila agregada por campaña: SHA; DEV y SOMBRA k/n; Wilson95; críticos; inestables; imprescindibles por dominio; error_plan por código, incluido extractor; llamadas/turno; latencias p50/p95; USD conocido/desconocido; familias y quemados. B suministra los agregados; solo A escribe Bot Log BL64.

Las pruebas sin proveedor no estiman exactitud, costo o latencia reales. F7 queda para la primera campaña pagada. La iteración 0 y sus límites se reportan por separado.

## Publicación sin despliegue

Se mantienen las exclusiones de despliegue de #451 y de esta rama en `vercel.json`. La descripción del PR debe justificar expresamente esas guardas: publicar para revisión no autoriza desplegar. Antes de una fusión autorizada se decide su retiro; no se cambian incidentalmente para habilitar un despliegue.

No hay autorización de fusión, deploy, migraciones, secretos ni escrituras productivas; un Go tampoco la concede. Se mantienen fuera de alcance `chat.tsx`, `src/supabase/functions/server/`, `make-server-1ccce916`, Telegram, M7 y piloto.
