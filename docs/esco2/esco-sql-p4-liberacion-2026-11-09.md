# P4 — aplicación 194 y esco-consultas v15

Fecha: 2026-11-09. [PR #476](https://github.com/sforero94/Escociaos/pull/476).
Santiago aprobó explícitamente la 194 ensayada, el despliegue por CLI2.117.0
`--use-api` con verify_jwt=true y la pausa controlada de consultas SQL.
No autorizó cambios de secretos, flags ni despliegue de make-server.

## Artefacto liberado

- Candidato remoto: `8236c0eaed49a76e3423d22b1d3c5b11d1ec7e92`.
- Árbol remoto/local verificado: `96aca1091e6de9b0903555c85815d76307585598`.
  El commit local equivalente es `4a0bed40`; difiere la historia/metadatos de publicación API.
- Archivo194 SHA-256: `df6c2137487a53b9d4cdee20b92b8094aabbc868d575f4462227d23b6cd93566`.
- Consulta de ensayo SHA-256: `035ed3d647e76dc9969273d5daa2055d89bedff10f3f5473dfa8a2c904d7bac5`.
- Ledger: `20261109221735`, nombre `194_esco_sql_ejecutor_compartido`, una entrada.
- esco-consultas: **v15 ACTIVE**, verify_jwt=true.
- Bundle observado: `903db296ef4ecf9c77930dc32c3de936d78a16804a0de13c9c5d02e7711e6295`.

El archivo de migración aplicado no se editó. La publicación posterior de esta
nota es solo documentación y no sustituye el SHA desplegado.

## Ensayo y preflight

Barrido de294ramas:194solo en P4. Ledger/respaldos sin194; catálogo14vistas/174columnas.
La configuración leída expone `public, graphql_public`, fuera del esquema privado.
El paquete exacto, con solo BEGIN/COMMIT exteriores retirados para la sonda,
pasó29/29controles y devolvió deshecho=true, error/sqlstate nulos. QA separado
repitió el paquete local y reconcilió los objetos completos antes/después por RO:
ledger, defaultACL, rawRPC y vistas idénticos; esquema y RPC nuevas ausentes.
El preflight de aplicación volvió a coincidir con ese estado.

## Aplicación y despliegue

Se aplicó el archivo completo exacto por Composio, cuenta escocia-os, carril de
migraciones con ledger. Después, por el conector RO, se verificaron:

- Una194 y versiones193/195 intactas.
- Diez helpers y dos RPC SECURITY INVOKER, con search_path fijado.
- RPC web: EXECUTE para authenticated; actor: EXECUTE para service_role.
- RPC anterior: PUBLIC/anon/authenticated/service_role sin EXECUTE.
- Esquema privado sin USAGE PUBLIC/anon y funciones nuevas sin EXECUTE PUBLIC.
- Definición anterior sin cambios;14vistas y174columnas/tipos sin cambios.

Luego se ejecutó desde el árbol limpio aprobado:

```sh
npx supabase@2.117.0 functions deploy esco-consultas --project-ref ywhtjwawnkeqlwxbvgup --use-api
```

La lectura posterior confirma v15ACTIVE y verify_jwt=true. Gateway health sin JWT
→401; JWT inválido→401; JWT anon público existente→200 con ok=true y nombre de
función correcto: el worker nuevo arranca. La pausa SQL terminó tras esta comprobación.
make-server permanece v297, verify_jwt=false y bundlehash idéntico al preflight.
No se cambiaron secretos ni flags. No se desplegó frontend ni make-server.

La CLI publicó desde el árbol aprobado y el hash de bundle es nuevo. La descarga
adicional del body por el conector excedió su tamaño máximo; no se afirma una
comparación byte a byte entre el body descargado y las fuentes locales.

## Límites y siguiente paso

Los positivos completos HTTP→parser→RPC/compilador y RLS son de QA local sintética
(8.842tests y CI del candidato verdes; lint0errores). En producción se verificaron
instalación, ACL y arranque; no se consultaron perfiles/filas reales para una respuesta
útil ni se llamó al modelo. No hay tasa nueva de calidad o aceptación D6.

Puerta de Telegram/secreto compartido y P5 siguen pendientes; requieren su alcance y
aprobaciones correspondientes. La autorización actual no cubre secretos, flags ni
make-server. No se ejecutó dev pagado ni held. Si falla el ejecutor, SQL queda cerrado;
ninguna reversión reabre la RPC arbitraria.
