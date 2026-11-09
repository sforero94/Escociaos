# P4 — puerta de Telegram: bloqueo del diseño de actor

Fecha: 2026-11-09. Base inspeccionada: `main` `5839ff62` (P1, PR #472).
Alcance: §6.2 y P4 del [plan aprobado, PR #471](https://github.com/sforero94/Escociaos/blob/7425dc3828ec1937f9f710950e95bf94cfe65df6/docs/esco2/plan-migracion-esco2-sql.md).

**P4 no está implementada ni aceptada.** La prueba previa refutó el aislamiento
que D2 esperaba obtener mediante una RPC `SECURITY INVOKER` que ejecuta
`SET LOCAL ROLE authenticated` y luego `esco_sql_lectura`. La migración 194 sigue
reservada y no se ha escrito ni aplicado. El runtime, los secretos y los flags
siguen sin cambios de P4.

## Resultado comprobado

El cambio de rol baja correctamente a `authenticated`, pero no cambia
`session_user`. La sesión de PostgREST (`authenticator`) puede asumir tanto
`authenticated` como `service_role`. Un SELECT puede llamar `set_config` para
recuperar `service_role`, incluso dentro de la transacción de solo lectura de
`esco_sql_lectura`.

La RPC 192 comprueba Gerencia y exige SELECT/WITH, una sola sentencia y modo de
solo lectura. Esas condiciones no impiden un cambio de rol mediante una función
llamada desde SELECT. No basta con añadir otro `SET LOCAL ROLE` a su alrededor.
Tampoco basta un filtro textual que solo busque el nombre de una función: existen
consultas anidadas y otras maneras de expresar SQL.

No se leyó contenido de dominio para comprobar este resultado en producción.
La consulta de prueba devolvió únicamente el nombre del rol efectivo. No se
probaron accesos a secretos ni se afirma una explotación de producción.

## Evidencia

| Control | Resultado |
|---|---|
| Barrido remoto completo | 292 ramas actuales; ningún archivo con prefijo `194_`. Un SHA recién publicado sin objeto local se comprobó mediante su árbol remoto completo. |
| Ledger vivo, consulta de solo lectura | Entradas 193 y 195 presentes; ninguna entrada 194 ni RPC de actor. |
| Catálogo de `respaldos`, consulta de solo lectura | Ningún objeto con 194. |
| Catálogo de roles | `authenticator` puede asumir `authenticated`; `service_role` no es miembro de `authenticated`. La pertenencia de `authenticator` a ambos roles se reproduce en QA. |
| `po_sonda`: bajar de `service_role` a `authenticated` | Pasa; `deshecho: true`. La sesión del ejecutor administrativo es `postgres`. |
| `po_sonda`: wrapper temporal propuesto → RPC 192 real → SELECT sintético de cambio de rol | Devuelve `service_role`; `deshecho: true`, sin error. Las claims de un perfil Gerencia activo se fijaron internamente sin devolver su identidad. |
| Intento de reproducir `session_user = authenticator` en la sonda administrativa | Rechazado con 42501. No se evadió ni se confundió con una prueba de sesión PostgREST. |
| QA independiente: Postgres local con sesión `authenticator`, grants equivalentes y RPC 192 extraída del archivo real | Tres controles pasan: el rol baja, la RLS oculta una fila sintética ajena, y el SELECT adversarial recupera `service_role` y puede leer esa misma fila sintética mediante SQL anidado. |
| Implementador repite QA | 3/3 controles reproducidos, sin red. |

Las lecturas administrativas usaron Composio `SUPABASE_RUN_READ_ONLY_QUERY`,
cuenta `escocia-os`. Los únicos ensayos usaron llamadas exactas
`SELECT public.po_sonda(...)` mediante el ejecutor de SQL; la sonda siempre
revirtió la preparación, las funciones temporales y los cambios de rol/claims.
Las respuestas originales y el detalle de preparación permanecen fuera del repo.

## Reproducción sintética

```sh
node_modules/.bin/vitest run src/__tests__/escoSqlP4QaRoles.test.ts
```

La prueba es una **refutación del diseño propuesto**, no una prueba de aceptación
ni una migración candidata. Extrae la RPC interior del archivo 192, sin copiar su
implementación. Usa `authenticator NOINHERIT` con permisos para asumir ambos roles,
`service_role BYPASSRLS`, una tabla sintética protegida por RLS y un actor sintético.
El control positivo distingue el aislamiento real de un bloqueo total.

## Decisión pendiente

La [revisión técnica de D2](esco-sql-p4-revision-d2.md) concluye que no basta
con cambiar la envoltura o emitir un JWT delegado. Recomienda que Santiago apruebe
ampliar P4 al ejecutor compartido: validación estructural positiva y compilación
determinista de la consulta, cerrando también la ruta SQL arbitraria anterior.
Es una propuesta de alcance, no una implementación ni una aceptación. La identidad
basada en claims requiere controles adicionales; no se presenta una hipótesis como
arreglo probado. Ningún efecto productivo queda autorizado por estos documentos.

Tras resolver D2: escribir la migración 194, ensayarla con `po_sonda` incluyendo
RLS y usuarios inactivos/no Gerencia, completar las pruebas de la puerta HTTP y
el detector de deriva, y presentar un PR funcional. Luego solicitar las puertas
separadas del plan: aplicar migración, desplegar `esco-consultas`, crear el secreto
`ESCO_TELEGRAM_SECRET` y, en fases posteriores, desplegar el adaptador o activar flags.
