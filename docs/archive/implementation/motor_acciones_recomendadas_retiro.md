# Retiro del motor "Acciones recomendadas" (issue #266)

**Fecha:** 2026-09-17 · **Decisión:** Santiago · **Reemplazado por:** "Novedades" (`docs/plan_novedades.md`, `docs/plan_novedades_implementacion.md`)

## Qué pasó

El bloque 4 del Tablero General ("Acciones recomendadas") se retiró del
producto. En 30 días de producción publicó 120 acciones, recibió 8
descartes (todos en la primera semana, cero desde entonces) y no tenía
registro de clics, así que el umbral de indiferencia que su propio contrato
fijó (`plan_motor_acciones_recomendadas.md` §7.2) nunca se pudo medir. El
issue #266 lo reemplaza por "Novedades": un feed de lo que cada persona
capturó, sin recomendación ni modelo.

**Decisión explícita del dueño: el código NO se borra.** Se archiva
íntegro, tal cual estaba el 2026-09-17, para poder traerlo de vuelta sin
depender de arqueología de `git log`.

## Qué se movió, y a dónde

Todo con `git mv` (historia preservada). Nada se editó salvo lo que se
detalla en "Qué cambió en el código activo" más abajo.

| Qué | De | A |
|---|---|---|
| Componentes/hooks del dashboard | `src/components/dashboard/{AccionesRecomendadas,AccionCard}.tsx`, `src/components/dashboard/hooks/{useAccionesRecomendadas,useGanadoParaAcciones}.ts` | `archive/acciones-recomendadas/frontend/components/dashboard/...` |
| Lógica pura | `src/utils/acciones{Cotejo,Hechos,Orden,RecomendadasEstado,Render,Tipos,Validador}.ts` | `archive/acciones-recomendadas/frontend/utils/...` |
| Tipos | `src/types/acciones.ts` | `archive/acciones-recomendadas/frontend/types/acciones.ts` |
| Edge functions (árbol local) | `src/supabase/functions/server/acciones-{hechos,motor,orden,paquete,paquete-io,render,tick,tipos,validador}.ts` (9) | `archive/acciones-recomendadas/edge-functions/server/...` |
| Edge functions (árbol espejo) | `supabase/functions/make-server-1ccce916/acciones-*.ts` (los mismos 9) | `archive/acciones-recomendadas/edge-functions/make-server-1ccce916/...` |
| Tests (11) | `src/__tests__/acciones{RecomendadasComponentes,Orden,Validador,Hechos,Paquete,RecomendadasEstado,AntiInvento,RecomendadasSeccion,Motor,Cotejo,Paridad}.test.ts(x)` | `archive/acciones-recomendadas/tests/...` |
| Fixture compartido | `src/__tests__/fixtures/acciones.fixture.ts` | `archive/acciones-recomendadas/tests/fixtures/acciones.fixture.ts` |
| Script de paridad | `docs/acciones/regenerar-copias-acciones.sh` | `archive/acciones-recomendadas/scripts/regenerar-copias-acciones.sh` |
| Planes/briefs (3) | `docs/{plan_motor_acciones_recomendadas,brief_tecnico_motor_acciones,set_referencia_acciones}.md` | `docs/archive/implementation/...` (misma convención que el resto de este directorio) |

`NegocioAccion` (el tipo `'hato_lechero' \| 'aguacate' \| 'ganado'`) **no**
se archivó con el resto: `PulsoNegocio.tsx` y `Dashboard.tsx` lo consumen y
siguen vivos, así que se extrajo antes del retiro a
`src/utils/negociosTablero.ts` (fase F1 de Novedades, 2026-09-17).

## Qué cambió en el código activo (no archivado)

- **`src/components/Dashboard.tsx`** — ya no monta `<AccionesRecomendadas>`
  ni llama a `useGanadoParaAcciones`; monta `<Novedades profile={profile} />`
  en su lugar (misma ranura, ahora arriba de Clima -- decisión del dueño
  2026-09-17 tras probar el bloque en vivo).
- **`src/components/dashboard/index.ts`** — el barrel ya no exporta
  `AccionesRecomendadas`/`AccionCard`; exporta `Novedades`.
- **`src/supabase/functions/server/index.tsx` y
  `supabase/functions/make-server-1ccce916/index.ts`** — se quitó el
  `import { handleAccionesTick } from "./acciones-tick.ts"` y el
  registro de la ruta `POST /make-server-1ccce916/acciones/tick`. La ruta
  **ya no existe** en el servidor desplegado.
- **`src/supabase/functions/server/hato-aggregation.ts` y su espejo** — dos
  comentarios JSDoc que citaban `acciones-paquete.ts` como consumidor activo
  se corrigieron para decir que ese consumidor está retirado y archivado
  (las funciones `EtapaEfectivaHato`/`categorizarAnimal` siguen exportadas,
  sin cambio de comportamiento).
- **`eslint.config.js`** y **`vite.config.ts`** — `archive/` se excluyó de
  lint y de la recolección de tests de Vitest (sus imports apuntan a rutas
  que ya no existen bajo `src/`; nunca se relintea ni se retipa el código
  archivado). `tsconfig.json` no necesitó cambio: su `include` ya es
  `["src"]`, así que `archive/` queda fuera por construcción.
- **Migración `156_retirar_acciones_recomendadas.sql`** — desprogramó el
  cron (ver abajo). Las 4 tablas del motor (`acciones_corridas`,
  `acciones_recomendadas`, `acciones_silencios`, `revisiones_periodicas`,
  todas de la migración 101) **se conservan sin tocar una fila**, sólo con
  un `COMMENT ON TABLE` que fecha el retiro.

## El cron: qué se apagó y cómo recrearlo

La migración 102 (`acciones_cron`) programó un `pg_cron` diario que llamaba
al endpoint retirado. La migración 156 lo desprogramó **por nombre**
(`cron.unschedule('acciones-recomendadas-tick')`), nunca por el `jobid`
memorizado (jobid **6** en el momento del retiro, pero un número copiado de
un documento puede no ser el vivo -- la misma lección que ya costó las
migraciones 103 y 120).

**Verificado contra producción el 2026-09-17, justo antes de aplicar la
156** (`cron.job`, conector de sólo lectura):

| Campo | Valor |
|---|---|
| `jobid` | 6 |
| `jobname` | `acciones-recomendadas-tick` |
| `schedule` | `50 10 * * *` (05:50 Bogotá) |
| `active` | `true` |

`command` exacto:

```sql
SELECT net.http_post(
  url := 'https://ywhtjwawnkeqlwxbvgup.supabase.co/functions/v1/make-server-1ccce916/acciones/tick',
  headers := jsonb_build_object(
    'Content-Type', 'application/json',
    'x-acciones-tick-secret',
      (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'acciones_tick_secret')
  ),
  body := '{}'::jsonb,
  timeout_milliseconds := 30000
);
```

### Para recrear el cron (si algún día hace falta)

**Orden obligatorio -- el cron nunca debe existir antes que la ruta que
llama, o el tick falla contra un 404:**

1. **Restaurar el código** desde `archive/acciones-recomendadas/`: mover de
   vuelta los componentes/hooks/utils/tipos a sus rutas originales bajo
   `src/`, las 9 edge functions a **ambos** árboles
   (`src/supabase/functions/server/` y
   `supabase/functions/make-server-1ccce916/`), y los 11 tests + el fixture
   a `src/__tests__/`.
2. **Re-registrar la ruta** en `index.tsx`/`index.ts` (ambos árboles):
   el `import { handleAccionesTick } from "./acciones-tick.ts"` y el
   `app.post("/make-server-1ccce916/acciones/tick", ...)` que esta
   migración quitó (ver el diff de la migración 156 o el historial de git
   de esos dos archivos).
3. **Volver a montar el bloque** en `Dashboard.tsx` si también se quiere en
   pantalla (no sólo el cron) -- decisión de producto aparte, no asumida
   acá.
4. **Confirmar el secreto**: `ACCIONES_TICK_SECRET` en los secretos de la
   edge function y `acciones_tick_secret` en Vault -- verificar que sigan
   provisionados (no se tocaron en el retiro) antes de reactivar el cron.
5. **Desplegar** la edge function: `npx supabase functions deploy make-server-1ccce916`.
6. **Sólo entonces**, recrear el job con la sentencia exacta (idéntica al
   ROLLBACK de la migración 156):

   ```sql
   SELECT cron.schedule(
     'acciones-recomendadas-tick',
     '50 10 * * *',
     $job$
       SELECT net.http_post(
         url := 'https://ywhtjwawnkeqlwxbvgup.supabase.co/functions/v1/make-server-1ccce916/acciones/tick',
         headers := jsonb_build_object(
           'Content-Type', 'application/json',
           'x-acciones-tick-secret',
             (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'acciones_tick_secret')
         ),
         body := '{}'::jsonb,
         timeout_milliseconds := 30000
       );
     $job$
   );
   ```

   Verificar antes de aplicar que ningún otro job ya se llame
   `acciones-recomendadas-tick` y que el `jobid` que resulte sea el que se
   documenta en el `CLAUDE.md` raíz, no el `6` de este documento -- un
   `jobid` no se conserva entre `unschedule`/`schedule`.
7. **Actualizar el `CLAUDE.md` raíz**: quitar la tachadura de
   `ACCIONES_TICK_SECRET` y anotar la migración que reprogramó el cron,
   siguiendo el mismo criterio que documenta cada migración de este
   proyecto.

### Lo que NO hay que hacer

- No reactivar el cron sin haber restaurado el código primero (paso 1) --
  un tick contra una ruta inexistente responde 404 sin escribir nada, y
  fallando en silencio salvo por los logs de `cron.job_run_details`.
- No usar el `jobid` 6 como si fuera estable -- `cron.schedule` asigna uno
  nuevo cada vez.
- No editar la migración 156 ni la 101 para "revertir" -- si se restaura el
  motor, es una migración NUEVA la que lo hace, con su propio número.

## Qué se conserva intacto en la base

- `acciones_corridas`, `acciones_recomendadas`, `acciones_silencios`,
  `revisiones_periodicas` -- las 4 tablas de la migración 101. Cero filas
  tocadas por la 156, sólo un `COMMENT ON TABLE` con la fecha de retiro.
  Son la única evidencia de las 32 corridas / 120 acciones / 8 descartes
  históricos.
- `revisiones_periodicas` en particular queda como el huérfano O-8 que el
  brief de Novedades declara (`docs/plan_novedades.md` §7): su destino
  futuro es trasladarse a "Salud de los datos", en una pasada posterior,
  no en ésta.

## Referencias

- Issue #266 (GitHub) -- decisión y contexto completo.
- `docs/plan_novedades.md` (CPO) y `docs/plan_novedades_implementacion.md`
  (CTO) -- el reemplazo.
- `docs/archive/implementation/plan_motor_acciones_recomendadas.md`,
  `brief_tecnico_motor_acciones.md`, `set_referencia_acciones.md` -- el
  diseño original del motor retirado.
- `src/sql/migrations/156_retirar_acciones_recomendadas.sql` -- la
  migración que ejecuta el retiro del cron.
