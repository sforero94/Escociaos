# P4-2: conductividad eléctrica por fecha operativa

Fecha: 2026-11-05. Depende de P4-1 (`789123ed`). Se entrega en un PR apilado;
la instrucción de completar M5 antes de revisión final permite verificar el conjunto
integrado sin fusiones intermedias por Codex.

La operación cerrada `consultar_conductividad` lee columnas explícitas de
`mon_conductividad`, lotes y rondas con el JWT del solicitante. Consulta por fecha
operativa inclusiva y lote; no infiere rondas. Conserva por separado el promedio
guardado, la distribución de mediciones individuales, pH y vínculo de ronda.
Una ronda no legible no elimina una medición de CE válida. Sin registro o mediciones
individuales usables no se fabrica una distribución en cero.

La función pura `calcularDistribucionCE` se extrajo y reexportó desde su módulo
original sin cambiar su cuerpo. QA comprobó paridad textual exacta. No cambió la
captura ni se agregaron recomendaciones agronómicas.

## Evidencia anterior y posterior al parche

Backend y QA independientes. QA congeló 34 controles antes del runtime y observó
32 fallos por operación ausente y dos controles aprobados. El coordinador repitió
ese RED. Los controles adicionales mantuvieron el conjunto original separado.
Una refutación encontró desbordamiento numérico en una distribución derivada de
entradas finitas; sus dos pruebas fallaron antes de agregar la guarda de salida,
sin cambiar la aritmética compartida. QA corrigió y documentó una envoltura de
parametrización de arrays, conservando datos y expectativas anteriores.

QA final: **57/57**, con SQL/RLS sintético, manejador HTTP real y positivo de
cobertura obligatoria sin el bypass histórico. Cubre NULL/cero, JSON inválido/vacío,
árbol repetido, campos no leídos, promedio guardado frente a mediciones, ronda sin
vínculo/oculta, unidades, pH, padres ocultos y transporte fallido/truncado/repetido.

El coordinador repitió **220/220** pruebas de CE, monitoreo, motor y detector de
deriva. Typecheck, build y lint aprobados: **0 errores, 907 avisos existentes**.
Backend repitió además 97 controles compartidos de HTTP, seguridad, cobertura,
seguimiento D26 y mensajes. El grafo de vigilancia incluye la extracción pura y
la expectativa exacta del detector; sus 47 pruebas pasan. El CI del SHA final se
enlaza en el PR.

Evidencia y logs de trabajo fuera de Git, solo agregados públicos. Gasto nuevo de
modelo **USD 0**, dentro del tope conjunto P4/M5 USD 0,25. Sin modelos, held-out,
producción, despliegue, migraciones ni secretos; servidores heredados y Telegram
intactos. No se declara aceptación M5 por esta entrega. La campaña espera código
integrado, oráculos revisados y congelamiento antes del pago.
