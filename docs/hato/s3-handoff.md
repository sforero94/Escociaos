# S3 — Arranque en frío (Hato Lechero: importación histórica)

**Empieza por aquí.** Este documento existe para que una sesión nueva pueda
arrancar S3 sin reconstruir el contexto de S1/S2. Escrito 2026-07-22 al cerrar S2.

---

## 1. Dónde quedó todo

| Sesión | Estado |
|---|---|
| **S1** — Esquema y RLS | ✅ Completa. Migraciones **053–060 aplicadas a producción** (2026-07-22). PR #76 mergeado. |
| **S2** — Motor puro `calculosHato.ts` | ✅ Código completo y probado. Migraciones **061 y 062 también aplicadas**. Quedan preguntas abiertas para Martha (§4). |
| **S3** — Importación histórica | ✅ **Completa (2026-07-22).** Pipeline Extract→Normalize→Resolve corriendo sobre los datos reales, Load/Verify escritos, endpoint B0/V10 construido, y las DOS rondas de decisiones del dueño integradas (ver plan §8). `Load` no se ha ejecutado: espera la revisión de `resolution-report.md` (checkpoint humano). Ver también [`s3-verificacion-independiente.md`](./s3-verificacion-independiente.md). |

> ⚠️ Este documento fue el arranque en frío de S3 y se conserva como registro.
> Varias de sus afirmaciones fueron **corregidas al medir** (las 9 hojas
> duplicadas son 8, las fechas únicas son 35 y no 36, la pregunta del año de
> `FLUJO LECHE` sí era resoluble): el estado vigente está en el plan §8 y en
> `s3-verificacion-independiente.md`, no aquí.

Producción corre las migraciones **053–064** (la 063 la tomó `ingresos_created_by_tracking`, ajena al módulo). La base tiene 15 tablas `hato_*`
+ 2 vistas, todas vacías: **nunca se ha cargado un solo animal.**

Estado del código en la rama:
- `src/utils/calculosHato.ts` — motor puro, cero imports, determinista.
- `src/supabase/functions/server/calculos-hato.ts` y
  `supabase/functions/make-server-1ccce916/calculos-hato.ts` — copias
  byte-idénticas. Regenerar SIEMPRE con
  `python3 docs/hato/regenerar-copias-servidor.py`, nunca a mano.
- Suite completa: **773/773**, typecheck limpio, lint 0 errores.

---

## 2. Los datos fuente

Los **8 archivos `.xlsx`** están en la raíz del worktree y son **datos reales
del hato**.

> ⚠️ **Están untracked a propósito. NUNCA los commitees. NUNCA uses `git add -A`
> en este repo** — usa siempre rutas explícitas. Si no están, pídeselos a
> Santiago (los tiene en `~/Downloads`).

| Archivo | Contenido |
|---|---|
| `CHEQUEO ACTUALIZADO ENERO 2020.xlsx` | chequeos 2019-01 → 2020-06 (9 hojas) + TERNERAS |
| `chequeo 21 y 22.xlsx` | **superset**: repite esas 9 + 2020-08 → 2022-12 |
| `CHEQUEO 2023 Y TERNERAS.xlsx` | 4 chequeos de 2023 + 3 hojas de terneras |
| `CHEQUEO VETE 2024.xlsx` | 4 chequeos de 2024 + TERNERAS |
| `CHEO VETE 2026.xlsx` | 2024-12 → 2026-07 (8) + TERNERAS + 3 hojas de leche |
| `PROMEDIO DE LECHE DESDE AÑO 2026.xlsx` | pesaje por vaca, mzo–jul 2026 (backfill) |
| `FLUJO LECHE AÑOS 23-26.xlsx` | litros mensuales al camión |
| `GASTOS FOV ENERO 2026 (1).xlsx` | **fuera de alcance** — la matriz de P&G ya se homologó aparte |

`node_modules` está **vacío** y no hay que correr `npm install` (los tests
corren con `npx vitest`). Para explorar los `.xlsx` usa `python3` + `openpyxl`,
que sí está disponible.

---

## 3. Qué construir en S3

Pipeline del plan §7.4:

```
Extract → Normalize → Resolve → [CHECKPOINT MARTHA] → Load → Verify
└──────────── desbloqueado ────────────┘              └── bloqueado ──┘
```

**Load está bloqueado** hasta que Martha adjudique las colisiones de chapeta
(§4). Todo lo anterior se puede construir ya — de hecho el `resolution-report.md`
que ella revisa **es la salida de Resolve**, así que construirlo es lo que hace
productiva su sesión.

### Documentos que hay que leer antes de escribir código

1. [`s3-contrato-pipeline.md`](./s3-contrato-pipeline.md) — la frontera entre las
   dos mitades: el tipo `FilaChequeoNormalizada` y el JSON intermedio.
2. [`s2-matriz-qa.md`](./s2-matriz-qa.md) — barrido adversarial de las **45 hojas
   completas**, fila por fila. Los casos duros de estructura están en §2.5–2.8 y
   §3, cada uno con archivo::hoja::fila y valor verbatim.
3. [`s2-hallazgos-planillas.md`](./s2-hallazgos-planillas.md) — primer barrido:
   las 3 generaciones de encabezado y la regla de fecha por título.
4. `docs/plan_hato_lechero_module.md` §7.4, y §8-S2 para las decisiones D-1…D-4.

### División sugerida (dos agentes en paralelo)

Ya se probó este corte; el seam está definido en el contrato.

- **Agente A — Extract + Normalize**: resolución de la estructura 2D de cada
  hoja. Aquí viven los casos que S2 dejó explícitamente fuera: fallback
  posicional (una hoja tiene **cuatro** columnas llamadas `TP`), sub-tabla ajena
  embebida sin marcador, 225 filas fantasma en una sola hoja, offsets en hojas
  sin encabezado, y dedupe de las 9 hojas repetidas entre dos archivos.
- **Agente B — Resolve + `resolution-report.md` + Verify**: identidad de
  animales. Trabaja contra un fixture con la forma del contrato hasta que A
  aterrice.

**Regla para ambos**: importan los parsers de `src/utils/calculosHato.ts`; **no
escriben un segundo parser de celdas**. El plan §7.4 exige un solo parser para
importación y captura, y `calculosHatoParidad.test.ts` lo protege. S3 resuelve
el nivel de **grilla**, no el de celda.

---

## 4. Lo que bloquea (esperando a Martha)

Tabla completa en Notion → **[V1 Hato Lechero](https://app.notion.com/p/39867755ed6880e189b9e8fb78371f62)**

**Bloqueante duro de `Load`:** `hato_animales.numero` es `INTEGER UNIQUE` y hay
**9 chapetas compartidas por dos animales**. Verificado contra
`CHEQUEO JULIO 2026` (el hato actual): sólo **`162`** (ESMERALDA/VITROLA) y
**`175`** (MONA/MARGARITA) siguen vigentes hoy; las otras 7 (`43`, `113`, `151`,
`158`, `176`, `181`, `182`) ya tienen un solo nombre vigente y son limpieza
histórica. Con resolver esas dos filas se destraba la carga del hato actual.

**Preguntas de criterio abiertas** (no resolubles por regla): significado de
`Mv` y `gem+`; si una fecha en la columna OBS/ESTADO de 2019 es secado real o
parto real (se midió 57/43, ni siquiera es consistente dentro de una hoja); qué
día de la semana se pesa la leche (el formato nuevo sólo dice "SEMANA 1..4", sin
fecha, así que **no hay fecha que insertar** en `hato_pesajes_leche.fecha`); a
qué año corresponde cada uno de los 4 bloques de `FLUJO LECHE`; qué son
`yaguen`/`fabace` en la columna PADRE de TERNERAS.

**Pendientes de Santiago, no de Martha**: el **nombre del toro** (`hato_toros.nombre`
es NOT NULL y "Jersey" es la raza, no el nombre) y confirmar el default
**provisional de 60 días** de `dias_espera_voluntaria_post_parto`.

---

## 5. Trampas que ya costaron caro — no repetirlas

Cada una salió de medir sobre los datos reales, no de leer el plan:

1. **`TP` no se lee nunca.** Es una fórmula `TODAY()` congelada:
   `F_Servicio + TP×30,44` converge a la fecha de último guardado del archivo,
   sin importar el año de la hoja. No sirve ni para validación cruzada.
2. **`SECAR` se deriva en UN paso desde `F Servicio`**, no encadenando sobre
   `PP`: 99,4% vs 94,6% sobre 1.156 filas. Encadenar aplica doble clamping
   cuando el servicio cae en día 29-31.
3. **`#VALUE!` es derivado, no ruido.** Una celda `F Servicio` con multi-fecha
   hace colapsar en cascada las fórmulas de TP/SECAR/PP. El motor recupera las
   fechas y re-deriva.
4. **El título de r1 manda sobre el nombre de la hoja** para la fecha del
   chequeo. `CHEQUEO ASEPT 2025` es septiembre; `Cheq jun 15-21` es agosto;
   `diciembre 20224` es un duplicado de marzo 2025.
5. **Los "nombres de vaca en la columna SX"** (`RICARENA`, `VIKINGA`…) no son
   typos: son una sub-tabla ajena embebida al final de una hoja.
6. **Ninguna constante de negocio vive en código.** Todo umbral llega vía
   `HatoConfig` desde `hato_config` (10 claves sembradas).
7. **Una celda no interpretable jamás descarta la fila.** Va a
   `normalizacion_issues` con el crudo intacto. Ausencia de dato ≠ 0.

---

## 6. Verificación antes de dar nada por bueno

```bash
npx vitest run          # 773/773 al cierre de S2
npm run typecheck       # limpio
npm run lint            # 0 errores (1010 warnings preexistentes, ignorar)
```

Si tocas `calculosHato.ts`, regenera las copias y confirma la paridad:

```bash
python3 docs/hato/regenerar-copias-servidor.py && npx vitest run src/__tests__/calculosHatoParidad.test.ts
```
