# Esco SQL — P4: ejecutor compartido (candidato local)

Santiago aprobó el 2026-11-09 revisar D2 y ampliar P4 a implementación y pruebas
locales del ejecutor compartido, con QA separado. [Contrato aprobado](esco-sql-p4-revision-d2.md).
Este candidato continúa el [PR #476](https://github.com/sforero94/Escociaos/pull/476)
y depende de P2/P3. **La migración 194 está escrita y sin aplicar. No hay despliegue.**

## Qué cambia

La herramienta del modelo conserva `consultar_sql({sql, proposito})`. El servidor
convierte SQL a una representación relacional limitada; PostgreSQL valida y compila
esa representación por sí mismo. Solo el SQL generado por ese compilador llega a
EXECUTE. Los valores viajan enlazados mediante el array de parámetros JSON, nunca
concatenados como código. No hay fallback a `esco_sql_lectura(text)`.

| Pieza | Comportamiento |
|---|---|
| Parser | `pgsql-ast-parser@12.0.2`, MIT; mapeo determinista, sin otro modelo ni planificador. |
| Catálogo | 14 vistas y 174 columnas, con tipos incorporados; un JSON genera el catálogo SQL. |
| RPC web | `esco_sql_consultar_v1(p_consulta jsonb)`, JWT del usuario, Gerencia activa y RLS. |
| RPC de actor | `esco_sql_consultar_actor_v1(p_usuario uuid, p_consulta jsonb)`, EXECUTE solo service_role; contexto del actor y mismo compilador. |
| Puerta de servicio | Credencial de servicio exacta y `x-esco-telegram-secret`; actor en el cuerpo solo para esa puerta. Secreto ausente → 503, credencial/secreto inválido → 401, actor inactivo/no Gerencia → 403. |
| Compatibilidad | Web JSON/SSE y respuesta P2 conservados; servicio devuelve JSON. El bot y su captura no se modifican en P4. |
| Cierre anterior | La misma transacción de la 194 revoca EXECUTE de la RPC arbitraria a los roles de aplicación. |

Todas las RPC/helpers nuevos son SECURITY INVOKER. El esquema privado es nuevo y
su creación falla si ya existe, sin adoptar funciones ajenas. Antes de usar una
vista se comprueba security_invoker y el tipo incorporado de sus columnas.
El cambio de rol del actor no es la frontera por sí solo: ninguna estructura
admitida por el compilador permite elegir funciones, tipos u operaciones arbitrarias.

El subconjunto admite SELECT, DISTINCT, CTE no recursivas, subconsultas relacionales,
INNER/LEFT JOIN, filtros, agrupación, HAVING, orden, paginación, UNION ALL y el
catálogo de expresiones/funciones del contrato aprobado. Se rechazan nodos y campos
no registrados antes de ejecutar. Una consulta rechazada consume su intento y el
modelo puede reformular dentro del límite de cuatro consultas.

Los números se extraen del token original, evitando el redondeo del AST JavaScript.
Fechas y UUID se infieren desde el ámbito conocido. Se añadió el tipo incorporado
`timestamp` sin zona porque la aritmética DATE + INTERVAL lo devuelve nativamente;
no se fuerza a date ni timestamptz para hacerlo encajar. Para mostrar una fecha de
calendario, el modelo debe seleccionar un CAST explícito a date.

Límites compartidos: SQL de 12.000 caracteres, IR de 64 KiB, 256 objetos estructurales,
profundidad 12, cuatro CTE, ocho relaciones, 32 columnas de salida, 200 parámetros,
texto por parámetro 4.000 caracteres y salida 500 filas (se lee una adicional para
marcar truncado). Se conserva el timeout real del rol; no se afirma reducir el
plazo de una sentencia ya iniciada.

## Dependencias y deriva

El lock npm fija las dependencias del repo. `supabase/functions/esco-consultas/deno.lock`
formato 4 fija además las dependencias de la función, incluidas las transitivas.
El mismo lock se comprueba congelado en Deno 2.1.4 y Deno 2.9.6. Esto valida imports y
tipos localmente; no acredita el gateway ni el despliegue productivo.

El detector vigila la presencia de `ESCO_TELEGRAM_SECRET` sin devolver, imprimir
ni guardar su valor. La primera ausencia se informa como configuración pendiente;
una retirada después de haberlo observado produce fallo y conserva esa marca.
Antes de liberar hay que comprobar que el token del detector tenga el permiso
Management API `edge_functions_secrets_read`; una rotación o cambio de secreto
necesita su aprobación. Esta sesión no leyó secretos ni cambió tokens.

## Reproducir la verificación local

```sh
npm ci
npm test
npm run typecheck
npm run lint
npm run build
node scripts/esco-sql/generar-catalogo-194.mjs --check
deno check --frozen --config supabase/functions/esco-consultas/deno.json supabase/functions/esco-consultas/index.ts
```

QA independiente recorre HTTP → parser → RPC y compilador reales en PGlite/Postgres
con actores, perfiles y filas sintéticos. Incluye controles positivos de consultas
útiles, límites, NULL, precisión, RLS, ACL, fallos de credencial/secreto y rechazo de
IR llamada directamente sin parser. El coordinador repite sus pruebas y las
regresiones del repo. El histórico de la 192 y las migraciones 193/195 no se editan.

Resultado sobre el candidato: **422 archivos y 8.842 pruebas verdes**, incluidas
60 de QA independiente del contrato/HTTP y 51 del detector de deriva.
`typecheck`, build, generación del catálogo y los dos checks Deno congelados pasan.
`npm run lint`: cero errores y 873 advertencias existentes.

SHA-256 del archivo 194:
`df6c2137487a53b9d4cdee20b92b8094aabbc868d575f4462227d23b6cd93566`.
SHA-256 de `deno.lock`:
`a11d5b254e32cef23e77918205f1401c441cade2eb139f7d5b378cf8def8f234`.

No se hicieron llamadas de modelos, campañas dev ni held, ensayos productivos,
aplicaciones de migración o cambios de flags. El evaluador Composio anterior no
recorre la nueva RPC/compilador: [límite documentado](../../scripts/esco-sql-eval/README.md).
No se atribuye a este candidato la tasa de P1 ni aceptación D6.

## Puertas de liberación pendientes

1. Revisar el PR y congelar su SHA. Antes de aplicar, repetir el preflight de ramas,
   ledger, esquema privado/respaldos, catálogo y permisos; confirmar que el esquema
   privado no esté expuesto por PostgREST. El barrido previo a escribir194 cubrió
   294 ramas y confirmó reserva libre, ledger sin194 y respaldos sin194.
2. Antes de aplicar, ensayar el candidato con `po_sonda`, siempre deshecho, dentro
   del alcance autorizado. Las pruebas de esta entrega fueron solo locales.
3. Aprobar por separado la migración exacta, el despliegue del SHA revisado y la
   interrupción controlada de consultas SQL entre ambos pasos.
4. Aplicar la 194 y después desplegar `esco-consultas` con verify_jwt=true y la CLI
   fijada. Verificar salud, acceso, consultas útiles y cierre de la RPC anterior.
5. Autorizar configurar `ESCO_TELEGRAM_SECRET` para ambas funciones. P5 conecta
   el adaptador; despliegue de make-server y activación de flags se aprueban aparte.

```sh
npx supabase@2.117.0 functions deploy esco-consultas --project-ref ywhtjwawnkeqlwxbvgup --use-api
```

Si falla el despliegue, las consultas SQL permanecen cerradas; la reversión segura
no vuelve a conceder EXECUTE a la RPC arbitraria. Captura y alertas heredadas
permanecen en su código actual. La aprobación local de D2 no autoriza esos pasos.
La ampliación de prueba detenida previamente por el filtro automático no se retomó.
