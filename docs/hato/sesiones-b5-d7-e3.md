# Sesiones de trabajo — B5 (export planilla) · E3 (duraciones + card) · D7 (backfill leche) + follow-ups

**Fecha:** 2026-07-24 · **Estado:** COMPLETADO — [PR #89](https://github.com/sforero94/Escociaos/pull/89) abierto contra `main`
**Origen:** cierre del módulo Hato Lechero (plan `docs/plan_hato_lechero_module.md`, §6 B5/E3/D7 + "Known follow-ups").

> **Estado de ejecución final (2026-07-24):** todo entregado en la rama `claude/hato-lechero-completion-ec3048` (suite **1357/1357 verde**, typecheck+lint limpios). Se mergeó `origin/main` (UI Figma alignment + S6/S9/S10) primero; las vistas visibles se rediseñaron **sobre** esa UI, sin 3-way merge.
> - **Session A HECHO**: E3.1 motor (`tiempo_prenez_dias`/`tiempo_secada_dias` en `EstadoReproductivoDerivado`, `null` fuera de su estado, 3 copias con paridad; `tiempo_vacia` = `dias_abiertos`); E3.2 KPI de duración dinámico por estado en la Hoja de Vida (`hatoDuracion.ts`); **E3.3 card "Vacas por estado" de 3 ejes** (`VacasPorEstadoCard` — Producción Ordeño↔Horro, Reproducción Preñadas↔Por servir nominales; Etapa Vacas·Novillas·Terneras totaliza inventario; **colores 100% de la paleta del app**: `--primary`/`--secondary` verdes, `--brand-brown` cafés, `--foreground`/`--warning`/`--brand-brown` etapa — sin hex hardcodeado); F/U4 chip provisional/nulo unificado; **B5 export** (planilla pre-llenada + record-keeping + test de round-trip verde, `grilla.ts` aprende los headers del formato propio).
> - **Session B HECHO + APLICADO A PROD** (vía connector, verificado):
>   - Migración **069** aplicada (`fn_hato_commit_chequeo` persiste `meses_prenez`; EXECUTE solo `postgres`+`service_role`).
>   - Backfill `meses_prenez`: **926 filas** (fiel a `calcularMesesPrenez`; 553 quedan NULL = sin fecha de servicio).
>   - **Backfill de leche EJECUTADO**: **364 lecturas / 31 vacas** (Mar–Jun 2026), corrido con el parser vetado (`procesarHojaLeche`/`resolverIdentidadLeche`) → connector (patrón JSON-in/JSON-out, **nunca SQL ad-hoc** — lección del incidente de partos). Verificado exacto (Σ `litros_total`=5972.50, 31 animales, rango 2026-03-04→2026-06-24, `fuente='importacion_leche_2026'` → reversible).
>     - **Sin resolver — 57 lecturas, para Martha (no se adivina)**: DACOTA/FLACA/VICTORIA (tienen datos pero no son vacas activas — vendidas/reclasificadas), FABIOLA (2 activas comparten el nombre, #984/#993), VALENCIANA (fila duplicada dentro de la hoja).
>     - **1 outlier excluido**: VENUS 2026-05-13 `am=505 L` (typo de transcripción en el Excel; no se inventa el valor correcto — se corrige en la fuente y se re-sube).
>   - Baseline de invariantes sano: 0 chapetas activas duplicadas, 80 activas, 171 total, 333 partos, 33 chequeos.
> - **Pendientes humanos (fuera del código):**
>   1. **Redeploy** `make-server-1ccce916` (auth CLI) — activa en prod el parseo de planillas B5 en el endpoint de preview, la escritura de `meses_prenez` en el commit path y el fix de `dedupe`. 069 es forward-compatible: nada se rompe hasta el redeploy.
>   2. Las **57 lecturas sin resolver + el outlier de VENUS** esperan la revisión de Martha.
>   3. `database.ts` regen — diferido (bajo valor sin el refactor de los ~6 casts `as any`, un trabajo aparte).

Todas las decisiones de diseño están cerradas con el dueño (Santiago) en esta sesión. Este doc es el
brief que ejecuta el equipo de agentes; los ports de paridad y la verificación final se quedan en el
main loop.

---

## Decisiones cerradas (2026-07-24)

| # | Decisión |
|---|---|
| **Split** | **Dos sesiones por superficie**: S-A = B5 + E3 (todo lo visible: export UI, card, KPIs de ficha); S-B = D7 backfill + follow-ups (data/backend, sin UI). |
| **B5 template** | Mismas 13 columnas de la planilla actual, en el mismo orden, pero **con las abreviaturas escritas completas** (`SX`→`Sexo cría`, `TTTO`→`Tratamiento`, `PP`→`Parto Probable`, `#P`→`# Partos`, `F Servicio`→`Fecha Servicio`, etc.). `TP` se elimina (fórmula `TODAY()` congelada, ruido que el motor nunca lee). El parser de subida aprende los headers en palabra completa (mapa de alias) para que el round-trip siga cerrando. |
| **Card "Vacas por estado"** | Tres barras. Las dos primeras son **nominales** (no suman el hato): **Ordeño ↔ Horro** y **Preñadas ↔ Por servir**. La tercera (**Vacas · Novillas · Terneras**) **sí totaliza el inventario**. Número por fuera de cada extremo, label por fuera del número. Se elimina la banda "no aplica". |
| **E3 duraciones** | Tres contadores dinámicos según el estado actual de la vaca: **Tiempo de preñez** (preñadas), **Tiempo vacía** (= `dias_abiertos` existente), **Tiempo secada** (secas). |
| **D7 alcance** | Solo pesajes por vaca (`hato_pesajes_leche`). El total quincenal del camión (`hato_produccion_quincenal`) queda fuera. |
| **D7 litros** | Las dos columnas por SEMANA son **AM y PM de un mismo día de pesaje** → `litros_total = am + pm`; se guardan `litros_am`/`litros_pm` como detalle. Una fila por vaca por fecha de pesaje (miércoles de esa semana, `hato_config.dia_pesaje_semanal`). **Reconcilia D-1**: la captura futura sigue siendo "un total", pero este archivo histórico trae el desglose y el esquema lo soporta (054/061). |

---

## Hallazgos del archivo `PROMEDIO DE LECHE DESDE AÑO 2026.xlsx` (inspeccionado 2026-07-24)

- **5 hojas, una por mes**: `MZO 2026`, `ABRIL 2026`, `MAYO 2026`, `JUNIO 2026`, `JULIO 2026`.
- Layout por hoja: fila 0 título; fila 2 `NOMBRE` + mes repetido; fila 3 `SEMANA 1..4` en columnas `B/D/F/H`.
- Filas de datos (r4+): **columna A = NOMBRE de la vaca, sin número de chapeta**; luego **8 columnas de datos = 4 semanas × 2 columnas (AM/PM)** (`B/C`=S1, `D/E`=S2, `F/G`=S3, `H/I`=S4). Columna `J` es basura/vacía (1–2 celdas sueltas por hoja — ignorar/flag).
- **Sin fechas** — solo "SEMANA N". La fecha real se deriva de mes + semana + `dia_pesaje_semanal` (miércoles, migración 064: la clave se agregó exactamente para esto).
- **JULIO 2026 solo tiene nombres, cero lecturas** → el backfill cubre **MZO–JUNIO** (4 meses), ~23–32 vacas/mes.
- Nombres duplicados (**VALENCIANA ×2, MONZA ×2**) y sin número → la identidad se resuelve **por nombre** contra el hato activo, con lista de revisión para duplicados/no-emparejados; nunca se adivina (misma regla que `Load`).

---

## Session A — B5 export + E3 duraciones y card *(frontend + motor; agente frontend, ports de motor en main loop)*

### B5.1 — Export planilla de próximo chequeo (pre-llenada)
- `.xlsx` con las 13 columnas canónicas, headers en palabra completa (ver decisión).
- Identidad + último estado conocido **arrastrados** del chequeo anterior; columnas que el veterinario actualiza (Sexo cría, Fecha Servicio, Toro, Estado, Tratamiento) en blanco.
- **Paginado para impresión** vía print areas / page-breaks + header congelado. **Nunca repetir la fila de header por página** (rompe la extracción del parser de subida).
- La app pre-computa Secar / Parto Probable como referencia de solo-lectura.

### B5.2 — Export de un chequeo existente (record-keeping)
- `.xlsx` totalmente poblado, mismo template. Botón de descarga en `ChequeosList` / detalle de chequeo.

### B5.3 — Round-trip verificable (requisito D-4)
- El parser de subida aprende los headers en palabra completa (mapa de alias en `importHato`).
- Test: generar B5.2 → volver a subir sin cambios → **diff vacío**. Vive en `src/__tests__/`.

### E3.1 — Motor (`calculosHato.ts`, las 3 copias con paridad)
- Agregar a `EstadoReproductivoDerivado`: `tiempo_prenez_dias` (solo `preñada`/`proxima_a_secar`), `tiempo_secada_dias` (solo `seca`). `tiempo_vacia` reutiliza el `dias_abiertos` ya existente.
- Cada duración es `null` fuera de su estado (nunca 0). **Los ports de servidor los hace el main loop** tras el cambio del agente.

### E3.2 — Hoja de vida
- KPI de duración dinámico según el estado actual (muestra el que aplica).

### E3.3 — Card "Vacas por estado" (rediseño, ver ASCII abajo)
Mapa estado → segmento (consistente con la regla de 4 categorías de `hatoCategorias.ts`):

| Eje | Segmento | Estados (`EstadoReproductivo`) |
|---|---|---|
| Producción (nominal) | Ordeño | `servida`, `preñada`, `proxima_a_secar`, `vacia_por_servir`, `parida_reciente` |
| | Horro | `seca` |
| Reproducción (nominal) | Preñadas | `preñada`, `proxima_a_secar` |
| | Por servir | `vacia_por_servir`, `parida_reciente` |
| Etapa (totaliza inventario) | Vacas | todas las adultas (ordeño + horro) |
| | Novillas | `novilla` |
| | Terneras | `cria` |

- `servida` (servida, sin confirmación) queda fuera de las dos barras nominales por diseño (no es "preñada" ni "por servir todavía") — confirmar con datos reales si se ve raro; bajo riesgo porque las barras son nominales.
- Número por fuera de cada extremo, label por fuera del número.

```
  VACAS POR ESTADO
  ──────────────────────────────────────────────────────────────
  Ordeño     33  ███████████████████        ███████   8  Horro      ← nominal
  Preñadas   22  ████████████        ████████████████ 19  Por servir ← nominal
  ──────────────────────────────────────────────────────────────
  Etapa   [ Vacas 49 ·········| Novillas 20 ·····| Terneras 17 ]  = 86  ← totaliza
```

### Aceptación S-A
- Export de planilla imprime bien (páginas) y, re-subida sin cambios, produce diff vacío.
- Las 3 duraciones aparecen dinámicamente en la ficha; `—` cuando no aplican.
- Los conteos de la card cuadran con la regla de 4 categorías (Vacas = hato + horro).
- Suite verde, typecheck y lint limpios; paridad del motor intacta.

---

## Session B — D7 backfill de leche + follow-ups *(backend/data; agente backend)*

### D7 — Backfill de pesajes
- Extractor nuevo para ESTE formato (hojas por mes, SEMANA×2 AM/PM, filas por nombre) **reusando los parsers de celda de `importHato`** — nunca un segundo parser.
- Lógica pura en `src/utils/importHato/pesajesLeche.ts` + tests en `src/__tests__/`; runner de I/O en `scripts/import-hato/backfill-leche.ts`.
- Fecha = mes + SEMANA n + `dia_pesaje_semanal` (miércoles).
- `litros_total = AM + PM`; guardar `litros_am`/`litros_pm`; una fila por vaca por fecha.
- Identidad **por nombre** contra hato activo → lista de revisión para VALENCIANA/MONZA duplicadas y cualquier no-emparejado (overrides si hace falta, nunca adivinar).
- Carga idempotente en `hato_pesajes_leche` (`UNIQUE(animal_id, fecha)`, UPDATE-by-id luego INSERT, **nunca upsert PostgREST**; fila faltante = se salta, nunca 0). JULIO vacío → nada de julio.
- El archivo tiene datos reales del hato: **gitignored, nunca commitear** (mismo trato que los `.xlsx` del import histórico).

### Follow-ups (del plan §"Known follow-ups")
1. **`verify.ts`** — escribir el script faltante que `load.ts` ya referencia (invariantes de plan §7.4 paso 5).
2. **`meses_prenez`** — poblarlo en el commit path (`commitChequeo.ts` + `fn_hato_commit_chequeo`) + backfill de filas existentes. *(El toque al árbol de edge/RPC lo cierra el main loop por paridad.)*
3. **`database.ts`** — regenerar (`supabase gen types typescript`) para quitar los `as any` de los hooks de hato/ganado. **Necesita el connector de Supabase autenticado → lo corre el main loop.**
4. **`chipNumeroProvisional`** — unificar el render de `numero` nulo/provisional en `HatoDashboard`/`GenealogiaArbol`/`ChequeoDiffReview`.
5. **`dedupe.ts`** — atrapar hojas duplicadas entre archivos fuente distintos (caso cross-file documentado en el runbook de Load).

### Aceptación S-B
- `hato_pesajes_leche` poblado para MZO–JUNIO, con `litros_am`/`pm`/`total` coherentes; reporte de no-emparejados/duplicados a mano para adjudicar.
- `verify.ts` corre y reporta invariantes; `meses_prenez` poblado; `database.ts` regenerado; chips unificados; dedupe cross-file cubierto con test.
- Suite verde, typecheck y lint limpios.

---

## Ownership / main loop
- **Ports de paridad** (`calculos-hato.ts` ×2, árbol de edge/RPC para `meses_prenez`), **regeneración de `database.ts`** (connector) y **verificación final** se quedan en el main loop.
- Todo lo demás va a los agentes frontend (S-A) y backend (S-B).
