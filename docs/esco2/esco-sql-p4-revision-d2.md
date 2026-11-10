# P4 — propuesta de corrección del ejecutor compartido y revisión de D2

Fecha: 2026-11-09. Base revisada: `main` `5839ff62` y plan aprobado #471.
**Alcance aprobado por Santiago el 2026-11-09 para implementación y pruebas locales,
con QA separado. Este documento fija el contrato aprobado; no acredita una migración
aplicada, un despliegue ni la aceptación de un candidato.**

## Decisión propuesta

Conservar `consultar_sql({sql, proposito})` como herramienta del modelo. Un parser
convierte ese SQL a una representación relacional limitada y PostgreSQL la valida
y compila antes de ejecutarla. El texto SQL del modelo nunca llega a `EXECUTE`.
Las 14 vistas siguen siendo las dueñas de las reglas de negocio. El loop de cuatro
consultas y el contrato de respuesta v1 de P2 no cambian.

La conversión es sintáctica y determinista: no añade otro modelo, extractor de
intención, planificador de negocio ni segunda decisión sobre cómo responder.
Una construcción no admitida devuelve un error cerrado al loop para reformularla.
La ruta anterior de SQL arbitrario debe cerrarse en el mismo cambio autorizado.

## Por qué hay que revisar D2

Los tres controles existentes de QA y el ensayo ya registrado con `po_sonda`
refutan el aislamiento del wrapper `SECURITY INVOKER` con cambio local de rol:
la consulta pudo recuperar privilegios y superar RLS sintética. La revisión de
fuente identifica además que la RPC 192 es compartida por web y Telegram propuesto.
No se afirma aquí una explotación productiva de la ruta web.

Cambiar el rol efectivo no cambia los roles que el usuario de sesión puede asumir
más adelante. Una función `SECURITY DEFINER` puede cerrar esa vía concreta, pero
no demuestra por sí sola que las claims del actor permanezcan inalterables frente
a SQL arbitrario. El código real de la 137 usa `auth.uid()` para determinar el rol.
Un JWT delegado tampoco corrige por sí solo el ejecutor. No se recomienda adoptar
ninguna de esas envolturas como arreglo completo validado.

Fuentes primarias: [SET ROLE, PostgreSQL 16](https://www.postgresql.org/docs/16/sql-set-role.html),
[configuración transaccional de PostgREST](https://docs.postgrest.org/en/stable/references/transactions.html),
[funciones de configuración de PostgreSQL](https://www.postgresql.org/docs/16/functions-admin.html#FUNCTIONS-ADMIN-SET).
La mutabilidad de claims se registra como riesgo de fuente/documentación; esta
revisión no añadió una reproducción. No se reintentó la ampliación de pruebas que
la revisión automática rechazó.

## Opciones consideradas

| Opción | Ventaja | Límite |
|---|---|---|
| **A. Parser → representación relacional → compilador PostgreSQL — recomendada** | Conserva la herramienta SQL, las vistas y las dos puertas con un ejecutor común. PostgreSQL rechaza cualquier estructura fuera de su catálogo positivo. | Cambia el contrato interno y exige medir qué SQL de desarrollo cubre. Es un alcance adicional de seguridad. |
| B. Entorno de consulta aislado con identidad de sesión y políticas específicas | Puede separar realmente los privilegios y los datos disponibles para la consulta. | Añade infraestructura, credenciales/conexiones y revisión de políticas. No está validado ni es un cambio local de P4. |

A requiere aprobación de alcance y de la revisión de D2. No se presenta un cambio
de rol, un JWT nuevo o una lista negra textual como sustituto de esa corrección.

## API interna propuesta

| RPC | Entrada y autorización | Ejecución |
|---|---|---|
| `public.esco_sql_consultar_v1(p_consulta jsonb)` | Solo `authenticated`. Actor = `auth.uid()` del JWT, nunca un campo de la consulta. Exige Gerencia activa. | Valida/compila y ejecuta con el rol del usuario y sus políticas RLS. |
| `public.esco_sql_consultar_actor_v1(p_usuario uuid, p_consulta jsonb)` | Solo `service_role`; `PUBLIC`, `anon` y `authenticated` sin EXECUTE. El actor procede del vínculo de Telegram validado por el servidor. | Fija el contexto del actor, baja a `authenticated`, vuelve a comprobar Gerencia activa y usa exactamente el mismo validador/compilador. |
| Núcleo en esquema privado no expuesto por PostgREST | Funciones `SECURITY INVOKER` con permisos mínimos necesarios para las dos RPC. No recibe fragmentos de SQL. | Catálogo y compilación deterministas, con nombres y firmas fijados. |

Las RPC y el núcleo pertenecen al propietario administrativo de la migración,
pero son `SECURITY INVOKER`: no heredan los privilegios del propietario al ejecutar.
No se crea un rol nuevo ni se amplían pertenencias. El `search_path` se fija; el SQL
generado usa relaciones y funciones cualificadas desde el catálogo confiable.

El cambio local de rol de D2 solo puede reutilizarse **después de** demostrar que
el nuevo lenguaje no ofrece ninguna operación que altere el contexto del actor.
La seguridad proviene del contrato limitado y del compilador de base, no del cambio
de rol aislado. Si no pasa esa prueba, no se libera esta variante ni se degrada a
SQL arbitrario. Las claims siguen siendo configuración: la garantía exigida es que
ninguna entrada de consulta aceptada pueda modificarlas, ni directa ni indirectamente.

Formato de entrada: `{version: 1, query: QueryNode, params: Parametro[]}`. Los
parámetros son escalares tipados. El compilador enlaza el array como parámetro de
PostgreSQL y emite exclusivamente accesos y casts de tipos incorporados que él
controla; no interpola valores como código. No acepta propiedades desconocidas.

Salida: `{filas, n_filas, truncado}`, compatible con el ejecutor actual. Denegación
de acceso = SQLSTATE `42501`; contrato inválido = `22023`. El detalle de error usa
códigos cerrados (`version_no_admitida`, `nodo_no_admitido`, `relacion_no_admitida`,
`columna_no_admitida`, `tipo_no_admitido`, `limite_excedido`), sin datos de la finca.
No se expone una sobrecarga que acepte SQL en texto.

La puerta HTTP de Telegram exige la credencial de servicio conocida y
`x-esco-telegram-secret`, además del actor resuelto por el bot. No basta decodificar
una claim de rol sin verificar la credencial. Secreto ausente → 503 y cero consultas;
credencial/secreto incorrecto → 401; actor inactivo o no Gerencia → 403. La puerta
web conserva su validación Auth y no acepta un `usuario_id` elegido por el cliente.

## Subconjunto inicial y límites propuestos

Este catálogo es una propuesta concreta para el spike; cualquier ampliación se
revisa y prueba antes de admitirse. No se promete cobertura SQL universal.

| Familia | Admitido inicialmente |
|---|---|
| Relaciones | Las 14 vistas `public.v_esco_*` registradas en P1; CTE no recursivas ya validadas, sin referencias adelantadas. Columnas verificadas contra el catálogo de cada relación. |
| Consultas | SELECT; DISTINCT; CTE; subconsulta relacional validada; INNER/LEFT JOIN con predicado validado; WHERE; GROUP BY; HAVING; ORDER BY; LIMIT/OFFSET; UNION ALL. |
| Expresiones | Columna resuelta por ámbito, parámetro tipado, NULL, CASE, COALESCE, NULLIF; nodos de agregado y fecha del catálogo. Sin escapes de SQL libre. |
| Operadores | Igualdad/desigualdad y comparación, AND/OR/NOT, IS NULL/IS NOT NULL, IN con valores, LIKE/ILIKE, aritmética numérica y aritmética de fecha con intervalos tipados. Cada etiqueta se convierte a una operación incorporada de firma conocida. |
| Agregados | COUNT, SUM, AVG, MIN, MAX; DISTINCT y FILTER validados dentro del agregado. Solo tipos compatibles. |
| Funciones escalares | ABS, ROUND, LOWER, UPPER, BTRIM, DATE_TRUNC, EXTRACT; fechas e intervalos de precisión/unidad enumerada. Funciones cualificadas y firmas incorporadas fijadas. |
| Tipos de parámetros | boolean, integer, bigint, numeric finito y acotado, text, date válida, timestamptz con zona e intervalos estructurados. Ningún nombre de tipo o cast arbitrario. |
| Fuera del primer catálogo | SQL dinámico o anidado dentro de cadenas, llamadas arbitrarias a funciones, operadores/tipos propios, catálogos, tablas crudas, relaciones construidas por texto, DDL/DML, CTE recursivas, funciones de ventana y funciones que devuelven conjuntos. |

Límites: 4 consultas por turno, 500 filas devueltas (se lee una adicional para
marcar truncado), SQL de entrada 12.000 caracteres, IR 64 KiB, 256 nodos, profundidad
12, hasta 4 CTE, 8 relaciones, 32 expresiones de proyección, 200 parámetros y 4.000
caracteres por parámetro textual. Duración: conservar el timeout real documentado
del rol; no afirmar que una RPC puede acortar la sentencia que ya está ejecutándose.

Los operadores y casts no se resuelven por nombres enviados por el modelo. El
catálogo fija sus tipos y resolución. Se revisan también las dependencias confiables
de las vistas: la lista positiva pierde su garantía si una de ellas introduce una
función que evalúa texto o altera el contexto de autorización.

Un spike local elige y fija versión del parser tras comprobar compatibilidad Deno,
bundle, licencia y fidelidad PostgreSQL. Debe mapear únicamente los nodos anteriores
y rechazar los demás. No se elige ni se añade una biblioteca sin esa verificación.
Si el SQL conocido de desarrollo necesita una construcción excluida, se presenta
la ampliación concreta o su reformulación antes de congelar el catálogo. No se
abren held ni presupuestos históricos para resolver esa decisión.

## Archivos y dueños

| Dueño | Cambios previstos |
|---|---|
| CTO | Esta revisión de D2, catálogo, límites y secuencia; guía operativa en `CLAUDE.md` una vez implementada. |
| Backend | `src/utils/escoSql/consultaSegura.ts` (parser y mapeo a IR), `contratoConsulta.ts`, adaptación de `manejadorSql.ts`, puerta de servicio en `manejador.ts`/`index.ts`, migración nueva con RPC/compilador/cierre anterior. `loop.ts` y `prompt.ts` solo cambian para errores del subconjunto y mantienen la herramienta SQL. |
| Backend | Detector de deriva y su workflow: nuevas dependencias del ejecutor y secreto de Telegram, sin imprimir valores. Mismas reglas de despliegue de CLI. |
| QA independiente | Integraciones PostgreSQL/RLS, autorizaciones HTTP, contrato/identidad invariantes y paridad sintética; controles positivos que acrediten consultas útiles. |
| Coordinador | Repetir pruebas, tipos, lint/build, comprobar diff público y preparar PR/aprobaciones. |

P2/P3 conservan su contrato de respuesta. No se toca captura de Telegram ni se
reintroduce el motor de planificación retirado de la línea de trabajo. La conexión
y renderizado del bot siguen en P5. La 194 está reservada para P4; antes de crear
cualquier migración se repite el barrido de ramas, ledger y `respaldos`, y se decide
si una o más migraciones nuevas son necesarias. La 192 aplicada no se edita.

## Cierre de la ruta anterior y publicación

No hay una operación atómica que cambie simultáneamente PostgreSQL y una edge
function. Se propone una interrupción controlada de consultas SQL, que Santiago
debe aprobar al autorizar el candidato productivo concreto:

1. Preparar y probar todo localmente. Verificar consumidores y sobrecargas de la
   RPC antigua, tanto en repo como en catálogo. El nuevo código falla cerrado si
   no encuentra las RPC nuevas; nunca vuelve a la 192 como fallback.
2. Ensayar el candidato con `po_sonda`, siempre deshecho y solo dentro del alcance
   aprobado. No se aplica ninguna migración por hacer ese ensayo.
3. Pedir aprobación de la migración exacta, del SHA de deploy y de la interrupción
   esperada, como acciones explícitas separadas. **Esas aprobaciones no se piden ahora.**
4. En una transacción de migración: crear contrato/RPC nuevas y revocar EXECUTE de
   la RPC arbitraria anterior a `PUBLIC`, `anon`, `authenticated` y `service_role`.
   Las condiciones posteriores verifican que no quede ninguna entrada alternativa.
5. Desplegar inmediatamente `esco-consultas` desde el SHA autorizado con la CLI
   fijada y `verify_jwt = true`. Entre 4 y 5 los clientes antiguos pueden recibir
   indisponibilidad SQL. Captura y alertas de Telegram no cambian.
6. Comprobar salud, acceso, consultas útiles y cierre antiguo. Si el deploy falla,
   conservar la ruta arbitraria cerrada; no reabrirla automáticamente para recuperar
   disponibilidad. La reversión segura y el mensaje de mantenimiento deben formar
   parte del candidato antes de pedir aprobación.
7. Crear/configurar `ESCO_TELEGRAM_SECRET` en las dos funciones solo tras su
   aprobación separada. El adaptador de P5 se despliega después y el flag se activa
   únicamente con la aprobación correspondiente. No se cambia la puerta web a la
   credencial de servicio.

## Criterios de aceptación y decisión que falta

- Controles positivos: conteo, agregación por período, relación por claves, CTE,
  datos vacíos/NULL, caracteres especiales en parámetros y los casos sintéticos
  de negocio que cubren las vistas. Mismos resultados que referencias independientes.
- Contrato: parser y RPC rechazan nodos, tipos, relaciones y límites no registrados;
  la base no confía en que el parser de la edge function ya haya validado la entrada.
- Seguridad: actor y privilegios invariantes durante la consulta, RLS de identidad
  correcta, usuario inactivo/no Gerencia rechazado, secreto y credencial fallan
  cerrado, y RPC arbitraria anterior inaccesible desde los roles de aplicación.
- Paridad/regresión: ambas puertas usan el mismo compilador; P1/P2/P3, tipos,
  lint sin errores y build aprobados. QA y coordinador repiten sus verificaciones.
- Calidad: la cobertura del subconjunto se mide primero sin modelos sobre desarrollo
  conocido. Cualquier campaña dev real requiere autorización de envío y presupuesto
  nuevos y concretos. Held sigue cerrado hasta D6. No se heredan gastos ni aceptación.

**Aprobación literal de Santiago en esta sesión:**

> Apruebo revisar D2 y ampliar P4 para implementar y probar localmente el ejecutor compartido, con QA separado y cierre planificado de la RPC anterior.

Esta aprobación cubre el candidato local. Las acciones productivas, secretos,
flags, campañas pagadas y held conservan sus puertas separadas.

La ampliación de pruebas detenida por revisión automática no se reintenta por otra
vía; esa limitación no queda levantada por este texto de alcance. Si fuese esencial
retomarla, debe resolverse expresamente antes de ejecutar esa acción.

P4 tiene un candidato implementado y probado localmente. La [entrega y evidencia](esco-sql-p4-ejecutor-compartido.md)
registra sus verificaciones y límites; no acredita aceptación productiva.
