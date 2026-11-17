# P6 — liberación web y propuesta de activación

Estado: **preparación local; no autoriza cambios productivos**. Lecturas del
2026-11-09/10 (UTC), por Composio; los valores de secretos no se solicitaron ni
se guardaron. Se mantienen cerrados held, flags, fusiones y despliegues.

## Decisión recomendada

Los historiales comparables y el coste Telegram por turno están implementados y
probados **localmente en #478**. La producción descrita abajo conserva el runtime
anterior. Antes de activar SQL deben liberarse candidatos revisados del frontend,
esco-consultas y make-server, verificar su captura alojada y concretar exposición,
presupuesto y reversión. Las pruebas locales no inician el ensayo pareado.

## Qué está publicado y qué falta de P3

| Superficie | Evidencia actual | Pendiente |
|---|---|---|
| Vercel `escociaos` | Cuenta `escocia`, proyecto `prj_r9z59zKKLqZo64RgecbEB8lXyYCd`, equipo `team_hQ3EH5CL5DQFmWLo3VceWeE6`; GitHub `sforero94/Escociaos`, production branch `main` | Integrar la pila revisada y publicar un build que contenga P3 |
| Web producción | Deployment READY `dpl_2JbNMWH8qFUdYDm6btPjDK8mn77R`, SHA `bb5602743f768b2debac4c92e0844f46b0b91916`, alias `escociaos.vercel.app` | Su `ChatPanel` no contiene el adaptador ni `VITE_ESCO_MOTOR_WEB` |
| Variable web | Inventario con `decrypt=false`: solo las dos variables Supabase existentes; `VITE_ESCO_MOTOR_WEB` ausente en todos los targets | Crear exclusivamente el flag en el target aprobado; reconstruir el frontend |
| esco-consultas | v16 ACTIVE, JWT=true, bundle `903db296ef4ecf9c77930dc32c3de936d78a16804a0de13c9c5d02e7711e6295`; contrato P2/SSE P3/ejecutor P4 ya publicados | P6 sí modifica su runtime: nuevo candidato y aprobación de deploy; el pendiente histórico P3 no exige repetir el anterior |
| Telegram | make-server v299 ACTIVE, JWT=false, bundle `e2642bd441e6bffe84ad387c47829f66d3dd8bab7889f4e0a62acb9d44c939e2`; secreto compartido presente y flag ausente | La ruta SQL sigue apagada; eventual instrumentación tendría otro candidato y aprobación de deploy |

La lectura GitHub confirmó esta pila abierta, mergeable/clean **en ese momento**:

| PR | Head congelado | Base actual |
|---|---|---|
| [P2 #474](https://github.com/sforero94/Escociaos/pull/474) | `fcd2f1fe3d9c3a34b25272f3b30260aa89e44c0a` | main |
| [P3 #475](https://github.com/sforero94/Escociaos/pull/475) | `d254728defc8fd3986e91f240e8d4a8f721058c6` | codex/esco-sql-p2 |
| [P4 #476](https://github.com/sforero94/Escociaos/pull/476) | `c7b2f3dc825be6a79593eb50efda8a0797e52623` | codex/esco-sql-p3 |
| [P5 #477](https://github.com/sforero94/Escociaos/pull/477) | `6f2bfd2b993e1ccbf77bbe28a144e556deab83d7` | codex/esco-sql-p4 |

La base común con main es `5839ff62dd7dbee8b62362ed29eeaa97e8f36009`.
Los dos commits posteriores de main solo actualizan
`scripts/deploy-drift-state/{make-server-1ccce916,esco-consultas}.json`.
Se conservan al integrar; no se sustituyen por la copia más antigua de la rama.
Cada head/check/base se vuelve a comprobar antes de una futura escritura.

## Prueba local de publicación web

Se construyó una copia externa exacta de los 2.205 blobs del árbol
`5de44175b1bdbbb91283cbc402f31578e1c2e680` (cierre remoto P5 `6f2bfd2b`), sin
`.env`, con URL/anon ficticios, entorno permitido explícitamente y dependencias
ya instaladas. Los dos `npm run build` terminaron correctamente; cada uno genera
224 archivos. Un análisis AST del bundle comprueba la invocación real del selector:
`legacy` produce false y `sql` produce true; no quedan referencias sin resolver a
`VITE_ESCO_MOTOR_WEB`. Cuatro archivos/26 pruebas P3 también pasan.

| Build sintético | Huella del manifiesto de assets |
|---|---|
| legacy | `1ae193b279ead08983f762ef2f2019bf2436388b40880f2ae44c94cc116d9633` |
| sql | `82caa062ad05b4b217b6416133e029236147d94e4089b063353a823999eb6e8f` |

**Esos artefactos llevan credenciales ficticias y no se promueven a producción.**
Las huellas documentan el experimento, no el hash esperado de un futuro build con
la configuración real. La prueba local verifica wiring SSE, persistencia/reapertura
y conversión del export, no una sesión productiva de Santiago ni un PDF completo.
Quedan pendientes: sesión autenticada, stream por el gateway real, recarga del
snapshot, móvil/tabla larga y exportación PDF completa. El segundo FAB y `/esco-sql`
se conservan hasta ese checkpoint, como exige P3.

El flag web se sustituye al compilar, no al leer una petición. Cambiar la variable
no modifica el deployment anterior. Fuentes primarias:
[Vite: variables y modos](https://vite.dev/guide/env-and-mode),
[Vercel: Git y production branch](https://vercel.com/docs/git).

## Solución local y gates de liberación

El [contrato de turno](esco-sql-p6-contrato-turno.md) y la
[preparación](esco-sql-p6-preparacion.md) documentan la implementación compartida:
selección SQL persistida y acotada, contexto Telegram explícito, UUID/canal/huella
postautorización, recibo de coste por llamada conservado y comparación v2 enlazada.
QA separado usa handlers reales con transportes sintéticos y pruebas de concurrencia,
acceso revocado, coste desconocido, cancelación, snapshot y persistencia incierta.
No introduce migración, secreto ni permiso RLS adicional. No garantiza igualdad de
dos generaciones diferentes ni permite relajar el gate de historial por seguimiento.

El SHA de #478 debe congelarse tras CI. El diferencial Deno TS2589 adicional
(54 diagnósticos frente a53 del baseline, documentado en preparación) debe
resolverse antes de presentar un candidato desplegable. Para liberar ese candidato se requiere
aprobar explícitamente:

- Frontend con ambos modos compilados, manteniendo legacy al publicar.
- esco-consultas mediante `npx supabase@2.117.0 functions deploy esco-consultas --project-ref ywhtjwawnkeqlwxbvgup --use-api`, con verify_jwt=true.
- make-server mediante `npx supabase functions deploy make-server-1ccce916`, con verify_jwt=false, después de verificar recursos del servidor completo del nuevo candidato.

La autorización cumplida de `0a9883c2` no cubre P6. Las pruebas de recursos P5
acreditan aquel código; repetir la verificación pertinente para este candidato.
No ejecutar estos pasos ni activar flags por aprobar únicamente trabajo local.

Después de validar localmente esa solución, se propone un **piloto de un par/dos
turnos** con autorización y presupuesto explícitos, sin juez ni reintentos
automáticos. Primero congelar modelo/precio/límites y reservar el máximo por
petición; si el coste máximo o un resultado de red son desconocidos, no iniciar
otra llamada. STOP si actor/historial/corte/coste no son atestables o enlazables.
No se pide ni se consume presupuesto en esta preparación. Un piloto positivo
permitiría solicitar por separado las 80 capturas de las dos semanas; no las autoriza.

## Alcance real de los flags y del piloto

Ambos flags cambian el comportamiento de **todos los usuarios elegibles**; no son
un canary por usuario ni un límite de dos llamadas. La ausencia de mensajes
enviados por el agente no impide que otro usuario haga preguntas al activarlos.
La propuesta de piloto exige primero un mecanismo de exposición/captura acotado,
validado localmente, y aprobación de su publicación si cambia runtime. La otra
opción requiere que Santiago acepte expresamente la exposición global y el uso
ordinario con su alcance de coste; no se presenta como un piloto de dos llamadas.
No activar globalmente con la promesa de que estos payloads ya imponen ese límite.

## Orden de liberación propuesto (no ejecutado)

Esta preparación tiene un único PR P6 sobre P5 y se deja abierto. La instrumentación se incorporó en este mismo PR; congelar su candidato
runtime antes de pedir los despliegues. No dar por aceptada P6.

### A. Integrar y publicar P3 manteniendo legacy

Con aprobación de las fusiones/publicación: revisar heads anteriores y CI, integrar
#474, luego retarget #475 a main e integrar, seguido de #476 y #477 retarget a main
en ese orden. Conservar la deriva JSON actual y cualquier cambio concurrente
revisado; si aparece otro cambio de aplicación, detenerse y congelar otro candidato.
No borrar ramas. Que un PR esté clean hoy no aprueba su fusión.

Vercel publica automáticamente main; cada merge puede publicar un frontend.
Por eso esta autorización debe mencionar ese efecto. Mantener ambos flags ausentes
mientras se integra. Después, registrar SHA y deployment realmente servidos y
comprobar que el frontend contiene P3 y que su fuente coincide con el candidato
revisado. Integrar también P4/P5 mantiene main alineado con el backend ya liberado.
La fecha de un merge puede disparar el detector de deriva aunque el runtime ya se
publicara desde otra rama: verificar contenido/estado, no repetir migraciones ni
forzar un deploy adicional solo para apagar un aviso. Cualquier deploy extra se
propone y aprueba por separado según CLAUDE.md.

### B. Web SQL — solo después de viabilidad y aprobación

Cuenta Composio `escocia`, proyecto/equipo de la tabla anterior. Volver a leer
nombres/targets y detenerse ante configuración concurrente inesperada. Preparado:

```json
{
  "tool": "VERCEL_ADD_ENVIRONMENT_VARIABLE",
  "account": "escocia",
  "data": {
    "idOrName": "prj_r9z59zKKLqZo64RgecbEB8lXyYCd",
    "teamId": "team_hQ3EH5CL5DQFmWLo3VceWeE6",
    "key": "VITE_ESCO_MOTOR_WEB",
    "value": "sql",
    "type": "plain",
    "target": ["production"]
  }
}
```

No tocar preview/development ni las dos variables Supabase. Después crear un
**nuevo build/deployment** de producción mediante `VERCEL_CREATE_NEW_DEPLOYMENT`,
misma cuenta/proyecto/equipo, `name=escociaos`, `target=production`, y
`gitSource={"type":"github","repoId":"1093948895","ref":"main","sha":"SHA_CONGELADO_Y_VERIFICADO"}`.
El SHA futuro de integración no se inventa hoy: la aprobación condiciona ese paso
a que su fuente coincida con la revisada. No usar solo `ref=main` mutable ni promover
los builds sintéticos de esta preparación. Guardar ID de operación y deployment;
ante timeout reconciliar antes de enviar otra creación. Verificar READY,
SHA/alias, gate compilado y checkpoint web autorizado.

### C. Telegram SQL — aprobación separada

El secreto compartido ya está provisionado. Revalidar make-server/source/health y
que siga ausente el flag. Cambiar exclusivamente una entrada en Supabase:

```json
{
  "tool": "SUPABASE_CREATE_BULK_SECRETS",
  "account": "escocia-os",
  "data": {
    "ref": "ywhtjwawnkeqlwxbvgup",
    "secrets": [{"name":"ESCO_MOTOR_TELEGRAM","value":"sql"}]
  }
}
```

Esta escritura tiene efecto de ejecución; no necesita otro deploy del mismo
código. No rota `ESCO_TELEGRAM_SECRET` ni cambia JWT, webhook o credenciales.
La instrumentación nueva exige primero sus despliegues aprobados y SHA/hash
revisados; v299 no la contiene. Tras la activación, únicamente el piloto/uso real autorizado;
no enviar mensajes de prueba, abrir held ni iniciar campañas por la sola aprobación
del flag.

### D. Reversión expresamente incluida en una futura autorización

Proponer permiso acotado para volver Telegram a `legacy` y devolver el alias web al
último deployment legacy verificado (hoy `dpl_2JbNMWH8qFUdYDm6btPjDK8mn77R`), junto
con dejar el flag web en `legacy` para futuros builds. Revalidar el deployment antes
de actuar; la política de acceso y RPC antigua cerrada se conservan. No borrar ni
rotar secretos para apagar SQL. Una promoción del artefacto legacy actúa sobre el
alias; cambiar la variable web sola no revierte el bundle SQL ya publicado.
Sin autorización que incluya esa reversión, también requiere aprobación explícita.

## Textos de aprobación preparados

Estos textos describen el futuro alcance; **no son una solicitud de activación hoy**.
No ejecutarlos hasta cerrar sus condiciones y disponer del SHA candidato concreto.

**Integración/publicación web sin SQL:**

> Apruebo integrar los PR #474–#477 en main, en orden y con los heads/CI verificados
> del documento P6, retargetando las bases apiladas cuando corresponda y conservando
> los cambios actuales de main. Acepto los builds Vercel que provoca esa integración.
> Mantén ambos flags en legacy/ausentes. No apruebo migraciones, nuevos secretos,
> despliegues Supabase, held ni llamadas pagadas.

**Activación de ambos canales, cuando la medición sea viable:**

> Una vez verificados el candidato y la captura/instrumentación de P6, apruebo crear
> VITE_ESCO_MOTOR_WEB=sql únicamente en production del proyecto escociaos, construir
> y publicar el SHA integrado verificado, y crear ESCO_MOTOR_TELEGRAM=sql en
> ywhtjwawnkeqlwxbvgup. Acepto que ambos flags exponen SQL a todos los usuarios
> elegibles; esta aprobación no se interpreta como un piloto limitado a dos llamadas. No autoriza OTROS secretos ni rotaciones, cambios JWT, migraciones,
> otros despliegues Supabase, held ni campañas pagadas. El piloto y su presupuesto
> se aprueban aparte. Si cambia el código candidato, vuelve con su SHA y pruebas.

No se declara iniciado P6 por la preparación, la publicación legacy ni por una
activación aislada. El plan requiere dos semanas de uso real; el protocolo local
marca aceptación D6 siempre false. El resultado dev histórico 91,1 % global y
66,7 % monitoreo no satisface el mínimo 80 % por módulo y no mide el parser P4
actual. No se reejecutó dev ni held. El runner anterior puede visitar antecesores
held y no pasa por el ejecutor P4: no usarlo como atajo para este gate.
