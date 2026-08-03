# Memoria — Code Quality

Escrita solo por el orquestador (ver `README.md`). Inyectada completa en el
prompt del agente en cada corrida. **Solo corre el primer lunes de cada mes.**

## Estados aceptados
- Varias clases Tailwind escritas en JSX no existen en el build congelado de
  `src/index.css` y silenciosamente no hacen nada. Deuda conocida — proponer limpieza
  solo si un fix la toca de paso.
- **Paridad de archivos espejo VERIFICADA LIMPIA; no re-auditarla desde cero cada
  mes.** Los 3 generadores de `docs/hato/` pasan (`regenerar-copias-importhato.py
  --check` = "OK: 24 copias al dia"; `regenerar-copias-hato-alertas.py --check` = "OK:
  2 copias"; **`regenerar-copias-servidor.py` NO tiene modo `--check`, reescribe** —
  correrlo y luego `git status`, un arbol limpio es la prueba). Ambos arboles edge
  coinciden bajo `tail -n +2` + `diff -w`, incluidos los subdirectorios `importHato/`,
  `telegram/` y `telegram/conversations/`, que hay que recorrer explicitamente porque
  el diff de nivel superior solo los lista como ONLY-IN. [corrida: 2026-08-03-lunes]
- **Deuda difusa medida y DESCARTADA a proposito; no re-reportar sin razon nueva**:
  171 formateos numericos inline en `src/components` (toFixed/toLocaleString) que
  deberian pasar por `src/utils/format.ts` — coste cosmetico y equivalente en pantalla,
  no justifica un PR en un producto de 5 usuarios. Menor: `docs/README.md` no indexa 4
  archivos que si estan en `docs/`. Y el CLAUDE.md raiz dice "(001-064)" cuando la
  ultima migracion es 076 — cae dentro del hallazgo abierto de deriva del ledger.
  [corrida: 2026-08-03-lunes]

## Refutaciones
| Fingerprint | Afirmacion | Por que murio | Corrida |
|---|---|---|---|
| code-quality/hato/useRegistrarSalidaHato-muerto | `useRegistrarSalidaHato.ts` esta muerto entero (lo insinuaba el CLAUDE.md del hato) | `registrarMuerte` sigue vivo via `MuerteAnimalDialog.tsx` y el helper puro `construirEventoVentaHato` sigue cubierto por `hatoSalida.test.ts`. Solo el metodo `registrarVenta` esta huerfano. El PR #99 borra unicamente el componente `VentaAnimalDialog.tsx` y corrige esa linea del CLAUDE.md. | 2026-08-03-lunes |

## Navegacion
- **Metodo para probar codigo muerto en este repo** (las rutas son `React.lazy` y hay
  imports dinamicos, asi que grep solo no basta): correr
  `VITE_SUPABASE_URL=x VITE_SUPABASE_ANON_KEY=x npx vite build --sourcemap` y extraer
  las fuentes con `cat build/assets/*.map | grep -oE '\.\./\.\./src/[A-Za-z0-9_./-]+\.(ts|tsx)'`.
  Da el grafo real de modulos (367 archivos al 2026-08-03). **TRAMPA CONOCIDA: los
  barrels de solo re-exports los elide rollup, asi que NO aparecen en el sourcemap
  aunque esten vivos** (p. ej. `src/components/dashboard/index.ts`, que `Dashboard.tsx:14`
  si importa). La ausencia del bundle no prueba nada para barrels; confirmar con `tsc`
  despues de borrar. Los huerfanos bajo `src/utils/importHato/` y `hatoAlertas.ts`
  tampoco son muertos: corren del lado servidor. [corrida: 2026-08-03-lunes]
- **`registros_trabajo.fraccion_jornal` es un ENUM de Postgres** ('0.25','0.5','0.75','1.0'),
  no un numeric — cualquier consulta que lo sume necesita `(fraccion_jornal::text)::numeric`.
  El casteo directo falla. [corrida: 2026-08-03-lunes]
- **Motores puros vivos SIN ningun test**, ordenados por lo que cuestan si fallan:
  `laborCosts.ts` (286 lineas, 7 importadores, DINERO — ver el hallazgo del divisor),
  `calculosAplicaciones.ts` (345, 2), `calculosReporteAplicacion.ts` (241, 6),
  `fetchDatosReporteCierre.ts` (210, 3), `reportesFinancierosComun.ts` (135, 2).
  `calculosMonitoreo.ts` salio de esta lista con el PR #100. Comprobacion:
  `grep -rlE "from ['\"].*/<modulo>['\"]" src/__tests__/`. [corrida: 2026-08-03-lunes]

## Baselines
| Metrica | Valor | Corrida |
|---|---|---|
| Salud del repo | npm test 72 archivos / 1.725 tests · lint 0 errores / 1.031 warnings (715 no-explicit-any, 195 no-unused-vars, 86 exhaustive-deps, 35 react-compiler) · tsc limpio · vite build: grafo de **367 archivos src/**. **Identico al 2026-07-31 — el baseline NO se esta degradando** | 2026-08-03-lunes |
| Dependencias | `npm audit` 18 vulnerabilidades (1 low, 1 moderate, 13 high, 3 critical). Runtime directas: jspdf, jspdf-autotable, xlsx 0.18.5 (**sin fix disponible**), react-router-dom. Solo desarrollo: vitest, vite, ws. ~40 paquetes atrasados, 24 Radix menores, @supabase/supabase-js 2.86.0 vs 2.112.0. **NO TOCAR Tailwind: congelado y fuera del build a proposito** | 2026-08-03-lunes |
| Asimetria de tipos | `@types/react` 19.2.14 con `react` 18.3.1. Probado: codigo exclusivo de React 19 (`<Ctx value={}>` como provider) pasa `tsc --noEmit` sin un error. Nada roto hoy, pero la red de seguridad no esta | 2026-08-03-lunes |

## Archivo
(vacio)
