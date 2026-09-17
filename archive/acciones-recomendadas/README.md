# Archivo: motor "Acciones recomendadas" (retirado 2026-09-17)

Este directorio conserva, tal cual, el código del bloque "Acciones
recomendadas" del Tablero General -- retirado por el issue #266 y
reemplazado por "Novedades". **Nada aquí corre ni se compila**: excluido de
`tsc` (fuera de `tsconfig.json`'s `include`), de ESLint (`eslint.config.js`)
y de Vitest (`vite.config.ts`'s `test.exclude`).

**No editar estos archivos en el lugar.** Si algún día hace falta restaurar
el motor, es una tarea de mover el código de vuelta y actualizarlo contra el
estado actual del repo -- no de mantenerlo sincronizado mientras vive acá.

Contexto completo, incluida la sentencia exacta para recrear el `pg_cron`
que alimentaba este motor:
[`docs/archive/implementation/motor_acciones_recomendadas_retiro.md`](../../docs/archive/implementation/motor_acciones_recomendadas_retiro.md).

## Estructura

- `frontend/` — componentes, hooks y utils de `src/`, mismas rutas relativas.
- `edge-functions/server/` y `edge-functions/make-server-1ccce916/` — las
  9 funciones de cada árbol, antes en `src/supabase/functions/server/` y
  `supabase/functions/make-server-1ccce916/` respectivamente.
- `tests/` — los 11 tests + el fixture compartido.
- `scripts/` — el generador que mantenía los dos árboles de edge functions
  en paridad.
