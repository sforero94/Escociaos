# Esco 2.0: guía compartida de entrega para M5–M6

Actualizada: 2026-11-05. Aplica a cualquier sesión que trabaje en este frente.
El objetivo es entregar un resultado funcional y comprobado para confirmación,
sin trasladar a Santiago o Claude Code trabajo resoluble dentro del alcance autorizado.
Esta guía no concede presupuesto, acceso, despliegue ni un alcance nuevo.

## 1. Punto de partida y puerta del siguiente bloque

- M4 está aceptado: PR #436 fusionado como `5367e060`. No reabras esa aceptación
  ni repitas su campaña por rutina; conserva las pruebas y atiende regresiones nuevas.
- Lee el [master plan](https://www.notion.so/40d67755ed6881dba866f9775fca997e),
  el [tracker](https://www.notion.so/40d67755ed688000878bc6b5449fca14) y el contrato
  [P4 de fuentes](p4-source-contract.md). El pedido actual de Santiago prevalece.
- **Paso 0 de M5:** recalibra el dimensionamiento del §10 del master plan
  (estimación histórica de 70–120 días-persona): esfuerzo restante por entregable,
  horas de revisión de Santiago, reutilización, mantenimiento, supuestos y criterios.
  Añade costo y latencia del modelo; esas dos cifras no sustituyen el esfuerzo total.
- Antes de iniciar M5, Santiago confirma los valores de corte y el tope de gasto.
  No heredes automáticamente el 70 % de M4 ni sus presupuestos históricos.
- Registra entregable, dueño, dependencias, autorización y evidencia de cierre del
  bloque. Resuelve al principio una decisión esencial de fuente, alcance o permiso.
  Con esa puerta satisfecha, ejecuta sin volver a pedir aprobación de pasos rutinarios.

## 2. Implementar hasta obtener evidencia

- Divide trabajo por archivos y responsabilidad. Implementador y QA trabajan por
  separado; QA intenta refutar los supuestos, y solo el coordinador registra y publica.
- Reutiliza los comandos y runners existentes antes de crear infraestructura nueva.
  Una guía o framework adicional debe resolver una necesidad concreta del bloque.
- Escribe primero una prueba que discrimine el fallo y observa RED. Corrige lo mínimo;
  conserva controles positivos que demuestren respuestas sustantivas, no rechazo total.
- Valida antes de transformar: normalizar no debe borrar vínculos inválidos, propiedades
  no registradas, duplicados internos, límites excedidos o contradicciones para aceptar un plan.
  Unifica repeticiones equivalentes entre llamadas solo según el contrato, sin cambiar
  lo declarado. Rechazos con códigos cerrados permiten diagnosticar y reintentar sin texto libre.
- Cuando aparezca un defecto dentro del alcance, reprodúcelo, corrígelo y verifica el
  recorrido afectado. No conviertas esa reparación pendiente en un encargo para Claude.
- Continúa hasta el resultado autorizado completo. Si existe un corte explícito,
  riesgo irreversible, dato esencial ausente o permiso faltante, respétalo y presenta
  evidencia, causa y opciones concretas; no inventes una aceptación para poder cerrar.

## 3. Fuente, oráculo y campaña

- QA fija preguntas, obligaciones y referencias desde fuente pareada del mismo corte,
  con identidad, población, período, unidades y precisión definidos antes de medir.
  Nunca uses la respuesta anterior del modelo como verdad ni copies el ejecutor al oráculo.
- Distingue NULL, campo no leído, lectura fallida, ausencia de fila y vacío verificado.
  NULL, no leído y fallo no se vuelven cero ni ausencia comprobada. Un vacío verificado
  produce cero solo si el contrato lo define, con el alcance y ese origen rotulados.
- Conserva entidad, fechas operativas, agrupaciones, denominadores y conciliaciones.
  D43 y el detalle monetario exacto usan la misma base; una fila redondeada no acredita
  por sí sola igualdad exacta con el total. No mezcles plan, ejecución y costo congelado.
- Un conjunto que ya informó una corrección es desarrollo conocido. Separa corridas
  ciegas de no ciegas y valida mejoras con casos nuevos independientes cuando corresponda.
- Pasa primero intención aprobada → manejador real → fuente controlada → respuesta,
  sin modelos. Después prueba pregunta → modelo real → herramientas → misma fuente →
  respuesta. Pruebas verdes del lector no sustituyen este segundo recorrido.
- Antes de pagar, congela con huellas casos, oráculo, puntuador, fuente, configuración,
  runner y runtime. QA verifica controles positivos, mutaciones relevantes y el recibo.
  Durante la campaña no cambies nada congelado; conserva todos los intentos.
- Usa tag nuevo y registro persistente por llamada/turno: entrada privada minimizada,
  propuesta, resultado, origen, `errorPlan`/`motivoPlan`, reintentos, costo y latencia.
  Un costo desconocido o transporte incierto detiene llamadas posteriores; no reinicies
  automáticamente ni repitas una campaña sin la autorización que exija el protocolo.

## 4. Permisos y datos antes de la primera llamada

- Usa la autorización concreta vigente de la sesión y sus límites; Notion registra
  contexto y decisiones, pero no amplía permisos. No vuelvas a pedir lo ya autorizado.
- Si falta autorización de envío, concreta pronto destino/proveedor, categorías de datos,
  finalidad, modelo, número de campañas y presupuesto. Para OpenRouter, especifica si
  viajan preguntas, catálogos privados e historial; no supongas que «hacer pruebas» cubre
  cualquier payload o destino. Usa solo lo necesario para ese experimento.
- Si la revisión automática rechaza una acción, informa qué rechazó y por qué. Puedes
  aportar evidencia de una autorización existente; no evadas el rechazo con otra vía.
  Si sigue bloqueada, solicita la confirmación explícita concreta y continúa trabajo independiente.
- Servicios externos por CLI local de Composio, con cuenta explícita si hay varias; Notion
  por su MCP oficial. Conserva excepciones explícitas del usuario o por capacidad no disponible;
  un runner de modelo autorizado mantiene su ruta. No reintentes una escritura incierta
  por otra conexión. Lectura administrativa o fuente controlada no demuestra JWT/RLS del usuario.
- El repositorio es público: publica agregados y controles sintéticos. Guarda fuera de
  Git casos, referencias, capturas, respuestas, trazas y credenciales. Nunca imprimas claves.
  D17 conserva el held-out y su hoja fuera del alcance del implementador.
- No modifiques captura, Telegram, `chat.tsx` ni servidores heredados salvo autorización
  expresa. Merge, deploy, migraciones, secretos y escrituras productivas tienen sus puertas.

## 5. Medir y entregar para confirmación

- Fija antes de ejecutar qué cuenta como intento completo y qué es fallo crítico.
  Separa cobertura semántica, respuesta enteramente factual, parcial con fuente, exclusión
  y aclaración correcta. Un rechazo seguro o una aclaración no son precisión factual.
- Conserva denominadores completos, fallas y abortos. Reporta automático y adjudicación
  manual por separado; una discrepancia del puntuador no autoriza a cambiarlo retroactivamente.
  Revisa también afirmaciones y resultados adicionales que el automático no detecte.
- Tres repeticiones de un escenario no son tres escenarios independientes. Declara la
  unidad y el evento del intervalo; no presentes desarrollo diseñado como garantía productiva.
- Dimensiona costo por tarea factual completa con todo el gasto —fallas, aclaraciones,
  seguimientos y reintentos—. Expón otros denominadores por separado. Latencia p50/p95
  de todos los turnos y de los sustantivos, método fijado antes, con alcance de medición.
- El coordinador repite las verificaciones de los agentes. Para el PR ejecuta las pruebas
  pertinentes, `npm run typecheck` y `npm run lint` con cero errores; `npm run build`
  cuando corresponda al código cambiado. Conserva avisos preexistentes y limitaciones.
- Si archivos privados ignorados alteran una guarda, verifica además una copia limpia
  de los archivos publicables. No debilites guardas ni borres evidencia para conseguir verde.
- Entrega un PR revisable con problema resuelto, evidencia de recorrido completo,
  resultados, costo, latencia y límites; CI `verificacion` verde sobre el SHA exacto final.
  Claude Code recibe ese paquete para confirmar y fusionar, no para terminar las pruebas.
- Actualiza el master plan y los frentes existentes del tracker. En BL-64 agrega una línea
  de Progreso por entrega, sin reescribir historial; solo el coordinador escribe el registro.
  Distingue siempre propuesta del agente de aceptación explícita de Santiago.

## 6. Puertas de M6 y del piloto

- QA de implementación con contexto compartido ayuda a encontrar defectos, pero no
  equivale a aceptación independiente. M4 aceptó el alcance de cuatro casos de desarrollo
  y esa limitación de independencia; no extrapoles ese arreglo a M6.
- M6 exige evaluador realmente independiente en otra sesión, custodia D17 y autorización
  propia de ejecución/envío/gasto. El implementador recibe categorías de fallo, no el held-out.
- El piloto web espera la aceptación de M6 y la autorización de liberación, con acceso,
  observabilidad, límite de gasto y reversión comprobados. CI verde no abre esas puertas.

Checkpoint del 2026-11-05: `esco-consultas` v8 es el despliegue documentado; llevar la
corrección #436 a v9 necesita aprobación de despliegue. Quedan para antes del piloto dos
revisiones de redacción: citas que sustituyen números/fechas/nombres de lotes y un aviso
parcial que habla de costo completo en consultas que no son de costos. Regístralas y
compruébalas en su alcance; esta guía no las implementa ni reabre M4.
