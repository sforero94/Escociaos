# Runbook — Carga histórica del Hato (Load)

Cómo poblar `hato_animales` + chequeos + eventos con el histórico real.

## ✅ Estado: EJECUTADO en producción (2026-07-23)

`Extract → Normalize → Resolve → Load` corrió completo contra el histórico real
(7 archivos `.xlsx`, 2019–2026). Resultado final en producción:

- **68** toros sembrados/reutilizados
- **168** animales cargados (**102** activas, **66** vendidas/cierres presuntos)
- **33** lecturas de chequeo cargadas (2 sin fecha resoluble, omitidas por diseño)
- **1.479** filas de `hato_chequeo_vacas`
- **2.005** eventos derivados en `hato_eventos`
- **23** animales con número provisional (rango 800–999) — las colisiones de
  chapeta desempatadas por `overridesChapeta.ts`, incluidas las 2 vigentes en el
  hato actual (ESMERALDA/VITROLA #162, MONA/MARGARITA #175)

`Load` es un backfill de una sola vez: **no se vuelve a correr**. Las correcciones
de aquí en adelante (incl. la renumeración cuando Martha retaguee) son ediciones en
vivo desde la UI (`EditarAnimalDialog`) — ver "Identity model & renumeración" en
CLAUDE.md. Esta sección queda como referencia de cómo se corrió, para el caso
(excepcional) de necesitar reconstruir el entorno desde cero antes de que exista
captura en vivo.

## Dos bugs adicionales encontrados y corregidos EN VIVO durante esta corrida

Más allá de los dos bugs ya conocidos (`origen` fantasma en `hato_toros`,
`fila.estado?.tipo` siempre-undefined — corregidos antes de intentar el Load), la
corrida real destapó dos problemas que ningún test unitario había cubierto porque
solo aparecen con el corpus completo:

1. **Pérdida silenciosa de historial para los animales en colisión.**
   `animales.csv` guarda `numero` = número de trabajo (999, 998...) y
   `numero_observado` = la chapeta cruda de la planilla (162...) para los pares
   desempatados por `overridesChapeta.ts`. `load.ts` nunca leía esa segunda
   columna: al resolver una fila cruda de chequeo (que siempre trae el numero
   OBSERVADO, ej. 162), buscaba directo en el mapa `numero -> id` construido con
   el numero YA REASIGNADO — no encontraba nada, y la fila se descartaba sin
   ningún warning. Efecto real: los ~22 animales en colisión histórica cargaban
   con ficha pero **cero** filas de chequeo y **cero** eventos. Corregido con un
   segundo índice `numero_observado + nombre -> id` (mismo criterio que
   `buscarOverride` en `overridesChapeta.ts`) y una función `resolverAnimalId`
   que primero intenta el numero directo y cae a este índice.
2. **Filas físicas duplicadas dentro de una misma lectura.** El corpus real trae
   ~42 casos de dos filas resolviendo al mismo (fecha, numero, nombre) — la
   mayoría por dos ARCHIVOS distintos (`chequeo 21 y 22.xlsx` y `CHEQUEO
   ACTUALIZADO ENERO 2020.xlsx`) conteniendo una hoja "CHEQUEO JUNIO 9 2020"
   casi idéntica; un caso aislado (CARLA #156) de una fila repetida dentro de la
   MISMA hoja. Sin manejo, esto revienta el `UNIQUE(chequeo_id, animal_id)` de
   `hato_chequeo_vacas` (así fue como se encontró: el primer intento de Load
   abortó a mitad de camino). Corregido con `deduplicarPorChequeoYAnimal`:
   conserva la fila con más campos crudos no-nulos (más completa), descarta la
   otra con un `console.warn` completo (archivo/hoja/fila de ambas) — nunca un
   descarte silencioso.

Ambos fixes viven en `scripts/import-hato/load.ts` (capa I/O, sin tocar los
módulos puros parity-protegidos). **Seguimiento pendiente, no bloqueante:** el
caso #2 revela que `dedupe.ts` (Extract) no detecta hojas duplicadas **entre
archivos distintos** — solo se verificó/documentó el caso dentro de un mismo
archivo. Vale la pena investigarlo como tarea de tooling aparte; el fix de Load
ya lo neutraliza de forma segura y auditable (log completo arriba), así que no
bloquea nada hoy.

## Cómo se corrió (referencia)

Los `.xlsx` del histórico real NO viven en este worktree (gitignored, copiados
temporalmente desde otro worktree para esta corrida y borrados al terminar).
Si hace falta reconstruir el entorno desde cero:

1. **El/los `.xlsx` del histórico** (las ~45 planillas de chequeo 2019–2026).
   Ponerlos en la **raíz del worktree** (extract.ts los lee desde ahí; excluye
   solo `GASTOS FOV*` y las hojas de leche por su cuenta).
2. **`SUPABASE_SERVICE_ROLE_KEY`** — Supabase Dashboard → Project Settings → API →
   `service_role` (secret). Se pasa como variable de entorno; **no** se pega en
   ningún archivo ni se commitea. La anon key NO sirve (RLS de escritura exige
   Administrador/Gerencia; el script corre fuera de sesión).

## Pasos (referencia — ya ejecutados, no repetir salvo reconstrucción total)

Desde la raíz del worktree. Si `node_modules` no existe en el worktree, enlazarlo
del repo principal primero (`ln -s ../../node_modules node_modules` o equivalente).

```bash
# 1. Extract + Normalize  → scripts/import-hato/out/normalizado.json
node --import ./scripts/import-hato/register-alias.mjs scripts/import-hato/extract.ts

# 2. Resolve  → out/animales.csv + out/resolution-report.md
#    Debe imprimir "Load puede correr: no queda ninguna colisión vigente sin desempatar."
node --import ./scripts/import-hato/register-alias.mjs scripts/import-hato/resolve.ts

# 3. Load  (aquí sí van las credenciales de servicio)
SUPABASE_URL="https://ywhtjwawnkeqlwxbvgup.supabase.co" \
SUPABASE_SERVICE_ROLE_KEY="<pegar-la-service-role-key-en-el-entorno>" \
  npx tsx scripts/import-hato/load.ts
```

`scripts/import-hato/verify.ts` **no existe** (el `console.log` final de `load.ts`
lo menciona pero nunca se escribió) — la verificación de esta corrida se hizo a
mano por SQL directo contra `hato_animales`/`hato_chequeo_vacas`/`hato_eventos`.
Escribirlo es un follow-up de tooling, no bloqueante.

Notas:
- `resolve.ts` aplica solo los provisionales de `overridesChapeta.ts`. Si alguna
  colisión NO estuviera cubierta imprimiría "Load NO puede correr" y hay que
  revisar `resolution-report.md` §1 antes de seguir. En esta corrida las 12
  estaban cubiertas.
- El Load es **idempotente** sobre `origen='importacion_historica'`: si algo falla a
  mitad, se vuelve a correr y limpia lo de la corrida anterior primero (así se
  recuperó del primer intento, que abortó por el bug #2 de arriba). Esto vale
  **solo mientras no haya capturas en vivo** (chequeos/pesajes web) — ver abajo.

## Después de cargar

- Abrir `/hato-lechero/hato` y revisar el roster. **Pendiente de revisión con
  Martha:** el registro cargó 168 animales de los 7 años de histórico, de los
  cuales 102 quedaron `estado='activa'` (sin cierre presunto detectado, D5) — más
  de los ~45 animales que se estima hay hoy en el hato real. La diferencia es
  esperable (el heurístico de cierre presunto de 365 días sin aparecer no
  necesariamente capturó cada baja real) pero **no se filtró ni se corrigió
  automáticamente** — es exactamente el tipo de ajuste que le corresponde a
  Martha, vía la UI, no al pipeline. Las vacas en colisión llevan un número
  **provisional** (badge "provisional", banda 900–999) — eso sí es esperado por
  diseño.
- **Corregir desde la UI**, no re-corriendo el pipeline: botón **Editar** en la
  Hoja de Vida de cada animal (`EditarAnimalDialog`) para ajustar caravana, nombre,
  etapa, estado. Es el mismo camino con el que Martha renumerará el hato cuando
  lleguen las caravanas nuevas.
- **A partir de la primera captura en vivo, el Load queda cerrado para siempre.**
  `load.ts` borra `origen='importacion_historica'` y las tablas hijas no tienen
  `ON DELETE CASCADE` — re-correrlo sobre datos vivos rompería por FK o dejaría
  historia huérfana. El retag masivo se hace con un `UPDATE ... FROM (VALUES ...)`
  indexado por `id`, en una transacción.

## Barandas del período provisional (mientras no se retagee)

- Acceso al módulo `hato_lechero`: solo Gerencia (Santiago) + Martha (Administrador).
  Papá / lectura todavía no.
- Las caravanas nuevas que compre Martha deben quedar **por debajo de 800** para no
  chocar con la banda provisional (800–999).
- Cuando S6 (alertas) entre: para vacas con número provisional, la alerta a Fernando
  lidera con el **nombre**, no con el número (él lee la caravana física en el corral).

## Seguimiento pendiente

- `dedupe.ts` (Extract) no detecta hojas duplicadas **entre archivos distintos**
  (ver bug #2 arriba) — investigar como tarea de tooling aparte.
- `src/types/database.ts` está desactualizado (predata 044) — regenerarlo quitaría
  los `as any` de los hooks de hato/ganado.
- `scripts/import-hato/verify.ts` referenciado por `load.ts` pero nunca escrito.
- `load.ts` no llena `hato_chequeo_vacas.meses_prenez` (ni el commit path). Menor.
- 102 animales quedaron `estado='activa'` vs. los ~45 que se estima hay hoy en el
  hato real — revisar con Martha (ver "Después de cargar" arriba), corrección vía
  UI, no vía re-Load.
