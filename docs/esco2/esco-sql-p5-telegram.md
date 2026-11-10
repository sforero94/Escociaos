# P5 — adaptador Telegram, entrega local

Fecha: 2026-11-09. Rama `codex/esco-sql-p5`, basada en P4.
No se desplegó ninguna función, no se generaron valores secretos y no se activaron
flags. La 194 y esco-consultas v15 siguen siendo la base liberada por P4.

## Comportamiento

Solo el último fallback de texto libre selecciona el motor con
`ESCO_MOTOR_TELEGRAM`. Ausente, `legacy` o un valor distinto de `sql` conserva la
ruta anterior. La nueva rama llama por HTTP al único motor, esco-consultas; nunca
importa su loop ni lo ejecuta en el bot.

Antes de cada pregunta y callback se resuelven de nuevo la cuenta vinculada,
el módulo consultas y el perfil de Gerencia activa. El actor enviado sale del
resolver del servidor. La llamada lleva la credencial de servicio existente y
`x-esco-telegram-secret`; el destino P4 vuelve a autorizar al actor.
Un secreto ausente, credencial incorrecta o fallo HTTP/contrato termina en error
cerrado, sin reenviar al motor legacy. Límite de transporte: 4 MiB y 45 segundos;
se cancela la lectura al exceder el tamaño. No se imprimen cuerpos de error.

Las preguntas usan un ID durable derivado de actor/chat/mensaje de Telegram;
la PK de chat_messages evita repetir la llamada al motor ante reentrega o
concurrencia. Una respuesta perdida o un resultado incierto no se reintenta
silenciosamente. Los botones llevan un token corto, ligado al actor, chat y mensaje;
el texto/SQL vive en sesión, con TTL de 15 minutos y un máximo de ocho respuestas.
Las sugerencias consumen un turno una sola vez; el botón de consultas solo muestra
SQL/conteos sin llamar al modelo. Una reentrega concurrente de ese botón de lectura
puede duplicar la entrega de trazas, no consultas de modelo.

## Presentación y persistencia

- Texto HTML escapado, mensajes de hasta 4096 caracteres y fallback a texto plano
  exclusivamente ante el rechazo de entidades HTML de Telegram.
- Tablas: preview alineado de hasta 15 filas y 4 columnas. Un recorte de columnas,
  filas o texto añade CSV de todas las filas/columnas disponibles del bloque.
  Las celdas y encabezados de texto neutralizan fórmulas incluso tras espacios;
  los números negativos permanecen numéricos.
- Tarjetas: etiquetas en negrita y formateador común de P2.
- Gráficas bar/line/area/pie a PNG local. NULL corta las líneas y no se vuelve cero;
  una forma no representable o un glifo ausente conserva texto y datos por CSV.
  La paleta de sectores coincide con su leyenda. No se llama a QuickChart en SQL.
- Sugerencias/aclaraciones con botones; “Ver consultas” muestra SQL y conteos a
  demanda. Las respuestas SQL no crean botones de memoria.
- Snapshot completo de bloques en metadata de chat_messages, como la web. Las
  consultas guardan SQL/conteos, sin filas crudas adicionales. El historial enviado
  al motor contiene solo texto user/assistant SQL, nunca metadata, filas de bloques
  ni resultados de herramientas legacy.

Los 50 handlers anteriores de captura/alertas conservan su código y orden.
El archivo compartido telegram/types.ts conserva su hash P4 exacto; el tipo de
sesión SQL se añade solo al contexto local del adaptador. Esto evita cambiar los
contratos e inventarios históricos de captura.

## Archivos y reproducción

Código y assets del bot en ambos árboles, byte a byte. La única diferencia de
configuración por raíz es el alias relativo de deno.json hacia los módulos puros
compartidos. El lock Deno es común y congela también el grafo legado del servidor.
El detector de deriva vigila esos módulos compartidos y la presencia del secreto
para ambas funciones, sin guardar valores.

```sh
npm ci
npm test
npm run typecheck
npm run lint
npm run build
deno check --frozen --config supabase/functions/make-server-1ccce916/deno.json supabase/functions/make-server-1ccce916/telegram/escoSqlFlujo.ts supabase/functions/make-server-1ccce916/telegram/escoSqlPng.ts
deno cache --frozen --config supabase/functions/make-server-1ccce916/deno.json supabase/functions/make-server-1ccce916/index.ts
```

QA separado ejecuta grammY y los handlers reales con transporte cerrado y datos
sintéticos. Comprueba permisos, callbacks cruzados/expirados/repetidos, identidad,
snapshot/historial, HTML/CSV/PNG y el límite HTTP. El coordinador repite la suite
completa. Se añadieron regresiones de CSV con espacios iniciales y de colores pie;
las guardas históricas mantienen sus hashes y aserciones.

Resultado del candidato local: **431 archivos y 8.930 pruebas verdes**. `npm run
lint` termina con cero errores y 873 advertencias existentes; `typecheck` y build
pasan. Deno2.1.4 pasa los siete módulos nuevos y el grafo completo se resuelve con
lock congelado. Un check adicional del bot completo devuelve 53 diagnósticos de
tipos: la comparación con P4, usando exactamente el mismo lock/dependencias,
devuelve los mismos 53, sin nuevos ni retirados. No se presenta ese check legado
como verde ni se corrigen sus contratos ajenos en P5.

Se generaron y revisaron PNG sintéticos de 60 categorías por seis series, pie de
60 sectores, NULL/cero y negativos. Pueden reproducirse sin red con
`scripts/esco-sql-p5/vista-previa-png.ts` y un directorio temporal de salida.
No son capturas de Telegram real ni aceptación de P6.

## Gates pendientes

[D3: mediciones y límites](esco-sql-p5-d3-spike.md) registra 15 procesos y
600 dibujos warm, sin red. El RSS local no certifica el presupuesto de 256 MB de
un user worker de Supabase. En el primer corte no estaba disponible el daemon Docker. Después se ejecutaron
45 peticiones y 180 PNG en un user isolate real con cuota de 256 MB y CPU de 2 s,
sin red ni variables de entorno: pasaron frío, warm y concurrencia. Esto acredita
el renderer aislado, no todo el grafo de make-server. El gate del grafo completo
permanece pendiente antes de activar SQL.

[Configuración y textos de aprobación](esco-sql-p5-configuracion.md): crear el
secreto compartido, desplegar make-server desde el SHA revisado con el flag aún
ausente y, después de sus verificaciones, aprobar la activación `sql` aparte.
No se vuelve a pedir aplicar194 ni desplegar esco-consultas, ya completados en P4.

Sin usuarios reales, entrega Telegram real, llamadas de modelos, campañas dev/held,
escrituras productivas ni nuevas migraciones. El pase manual de capturas con
Santiago y las mediciones productivas siguen pendientes de la fase correspondiente.

## Compatibilidad del receptor QA en Node20

El transporte del fixture normaliza únicamente las cabeceras Content-Disposition
antes de usar el parser FormData de Node20. Este parser rechazaba la forma compacta
válida que genera grammY; Node24 y Deno2.1.4 aceptan los mismos bytes sin cambios.
Las pruebas verifican que no se modifica ningún byte de archivo, incluso con texto
parecido a cabeceras dentro del payload y bytes no UTF8. Un multipart incompleto
sigue rechazado. No se alteró el código productivo ni las aserciones de PNG/CSV.

## Liberación posterior autorizada

El candidato remoto `0a9883c227e550446230bcb8f18a9b5c8f2077b9` se desplegó
el 2026-11-09 como make-server v299, ACTIVE y `verify_jwt=false`.
Se creó el secreto compartido, pero el flag de Telegram sigue ausente (= legacy).
El [registro de configuración](esco-sql-p5-configuracion.md) distingue el candidato
que se desplegó de los commits posteriores de documentación/ensayo. Antes de
activar SQL se exige el resultado del grafo completo en [D3](esco-sql-p5-d3-spike.md).
