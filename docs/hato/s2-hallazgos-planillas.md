# S2 — Hallazgos reales de las 8 planillas del hato (evidencia, no supuestos)

Extraídos con openpyxl de los 8 `.xlsx` en la raíz del worktree
`/Users/santiagoforero/Codigo/Escociaos/.claude/worktrees/pr76-migrations-s1-75d1fe/`.
**No commitear los .xlsx** (datos reales del hato). Están untracked; usar rutas
explícitas al hacer `git add`, nunca `git add -A`.

Scripts de exploración ya escritos (reutilizables):
`<scratchpad>/dump.py`, `dump2.py`, `dump3.py`.

---

## 1. Inventario de hojas

~40 hojas de chequeo entre 2019 y 2026, repartidas así:

| Archivo | Hojas de chequeo | Notas |
|---|---|---|
| `CHEQUEO ACTUALIZADO ENERO 2020.xlsx` | 2019-01 → 2020-06 (9) | + `TERNERAS_` |
| `chequeo 21 y 22.xlsx` | **superset**: repite las 9 anteriores + 2020-08 → 2022-12 (12) | + `TERNERAS` |
| `CHEQUEO 2023 Y TERNERAS.xlsx` | 2023 (4) | + `TERNERAS`, `20230terneras`, `HISTORICO TERNERAS` |
| `CHEQUEO VETE 2024.xlsx` | 2024 (4) | + `TERNERAS` |
| `CHEO VETE 2026.xlsx` | 2024-12 → 2026-07 (8) | + `TERNERAS` + 3 hojas de leche |

⚠️ **Las 9 hojas de 2019–2020 están duplicadas** entre los dos primeros archivos.
La importación debe deduplicar por fecha de chequeo resuelta, no por nombre de hoja.

---

## 2. Tres generaciones de encabezado (la deriva es real pero acotada)

**Gen 1 — 2019 a abr-2021** (14-15 cols)
```
# | Nombre | PL | #P2 | UC | SX | F Servicio | T | [I] | TP | OBS | F Secar | SEC REAL··/··parto real | F parto | TTTO
```
- La columna 13 se llama `SEC REAL` en ene/mar-2019 y **`parto real` desde may-2019**.
  Misma posición, semántica distinta. Es la trampa más peligrosa del set.
- `I` sólo existe en ene/mar-2019.

**Gen 2 — jun-2021 a ago-2023** (13 cols)
```
# | Nombre | PL | #P2 | Ultima Cria | SX | F Servicio | Toro | TP | OBS | F Secar | F parto | TTTO
```
- Desaparece la columna `SEC REAL`/`parto real`.

**Gen 3 — oct-2023 a jul-2026** (13 cols)
```
# | Nombre | PL | #P2 | Ultima Cria | SX | F Servicio | Toro | TP | ESTADO | SECAR | PP | TTTO
```
- `OBS`→`ESTADO`, `F Secar`→`SECAR`, `F parto`→`PP`.

**Ruido de encabezado a tolerar** (matching por prefijo/fuzzy, nunca igualdad):
- Rangos de Excel filtrados a la celda: `TPI2:L28A1I2:L26`, `#+B2:N29B2:N50`,
  `A3:N46A1A3:N45`, `CHE+A1:M34QUEO VETE AGOSTO1 2023`.
- `AGOSTI 1 2023` tiene **cuatro columnas llamadas `TP`** → hace falta fallback posicional.
- Fila de encabezado en r1, r2 **o** r3 según hoja.
- Hay hojas **sin** encabezado (`CHEQUEO ABRIL 3 2020`, `CHEQUEO JUNIO 9 2020`,
  `CHEQUEO AGOS 13`, `CHEQUEO DIC 21-22`): los datos arrancan directo.
- El encabezado **se repite a mitad de hoja** (ej. `CHEQUEO AGOSTO 2024` r19) →
  hay que saltarlo, no parsearlo como animal.

---

## 3. Fecha del chequeo: el título de r1 manda, no el nombre de la hoja

El nombre de hoja miente con frecuencia; el título de la primera fila es la fuente buena.
Casos verificados:

| Hoja | Título r1 | Lectura |
|---|---|---|
| `CHEQUEO ASEPT 2025` | `CHEQUEO SEPTIEMBRE 23 de 2025` | "ASEPT" era SEPT |
| `Cheq jun 15-21` | `CHEQUEO:AGOSTO 11 DE 2021` | nombre y título **no coinciden** |
| `diciembre 20224 ` | `CHEQUEO Marzo 31 de 2025` | hoja copiada, título duplicado de `CHEQ MAZO 2025` |
| `ENERO 2024` | `CHEQUEO VETE ENERO 1702024` | garbled → ene 17 2024 |
| `Chequeo feb 2021` | `CHEQUEO:FEBRERO 9 DE 2021 20 DE 2020` | **dos** fechas en el título |
| `CHEQUEO MAYO 20 2024` | `CHEQUEO VETE MAYO   2024` | sin día → caer al día del nombre de hoja |

Regla propuesta: parsear título → si falta día, completar con el nombre de hoja →
si discrepan mes/año, marcar `normalizacion_issues` y exigir revisión humana (S3).

---

## 4. `F Servicio`: fechas múltiples y tipografía rota (Épica V7)

58 celdas de `F Servicio` no son fechas. Separadores observados: `/`, `//`, `-`,
espacio, y **ninguno** (concatenadas). Hasta **tres** servicios en una celda.

Valores reales, verbatim:
```
20/04/2026/3/06/26
15/05/2025//7/06/2025
30/05/202520/07/2025          <- concatenadas, sin separador
18/04/2024/ 8 /05/24 21/06/240
14/03/2024-18/04/24/1/6/24
24/02/2024/2/7/2024
23/04/2024/23/06/24
8/05/2024/29/05/24
14/05/240 11/07/2024
24/02/2021/22/09/21
20/06/2021/5/01/2022
21/06/2021/5/1/2022 ?
 21/06/24
```
Años tipeados mal: `7/09/230`, `13/05/019`, `22/08/20220`, `14/05/240`,
`21/06/240`, `15/015/2025` (mes `015`).

Texto que **no** es fecha en esa columna: `ok`, `OK`, `0k`, `RECH`, `no serv`,
`vacia`, `o+`, `A169`, `PREÑADA 70%. CRIA 16%. RETRASO 14%`.

### El hallazgo central: `#VALUE!` es **derivado**, no ruido
Cuando `F Servicio` trae texto multi-fecha, las fórmulas de Excel de `TP`, `SECAR`
y `PP` colapsan a `#VALUE!` en cascada. Verificado en `CHEQUEO AGOSTO 2024` r7/r8/r11/
r15/r16 y `CHEQUEO JULIO 2026` r6.

⇒ El motor **no debe** propagar `#VALUE!`: debe recuperar la(s) fecha(s) del texto y
**re-derivar** SECAR y PP él mismo. Ahí está justamente el valor de S2.

---

## 5. `SX`: 143 valores distintos (el plan documenta 5)

Frecuencias principales: `OV` 458, `ov` 319, `AV` 82, `O+` 28, `o+` 22, `av` 22,
`o v` 19, `A` 19, `Mv` 16, `A136` 16, `a+` 15, `A+` 13, `abort` 11.

Familias a reconocer:
- **`A{n}`** con o sin espacio, mayús/minús: `A210`, `A 209`, `a178`, `a 177`.
  Caso raro: `A148**151` (dos números).
- **`OV` / `AV`** con variantes: `o v`, `Av`, `av`.
- **`A+` / `O+` / `a+` / `o+`** — cría muerta / aborto.
- **Aborto explícito**: `abort`, `ABORT`, `aborto`, `ABORTO`, `AB`, `abort 27/09`.
- **Sufijo de raza pegado al código**: `AV guir`, `avgir`, `a gir`, `A V GIR`,
  `AGIR`, `ov gir`, `OV GIR`, `oc gir`, `gir`, `ov hlt`, `ov hol`, `OV HOL`.
  → "gir"=Gyr, "hol"=Holstein. **Es información de raza dentro del código SX.**
- **Marcadores de incertidumbre**: `?`, `A?`, `A ?`, `AV ?`, `ao?`.
- **`Mv`** (16) y **`gem+`** (4) — sin definir en el plan. **Pregunta abierta.**
- **Estado, no evento**: `vacia`, `vendida`, `0`.
- **Nombres de vaca en la columna SX** (error de digitación):
  `RICARENA`, `BRISA`, `VIKINGA`, `MAGNIFICA`, `, verita`.

Regla dura: lo no interpretable va a `normalizacion_issues` con el crudo intacto.
**Jamás se descarta una fila.**

---

## 6. `TP` NO es confiable — hay que re-derivarlo

Distribución: `#VALUE!` 38, y luego 91, 87, 18, 93, 63, 94, 90, 81, 17, 86, 84,
80, 30, 56, 46, 35, 96, 92, 11, 95, 89… (rango 0–97).

Dos lecturas incompatibles verificadas:
- `CHEQUEO JULIO 2026` ALINA: servicio 2026-04-23, chequeo 2026-07-09, `TP=2` →
  parece **meses** de preñez.
- `CHEQUEO AGOSTO 2024` AMAPOLA: servicio 2024-05-14, chequeo 2024-08-09, `TP=26`,
  PP 2025-02-14 → 26 **semanas** restantes al parto.

⇒ Guardar `tp_raw` y **derivar** los meses de preñez desde `F Servicio` + fecha de
chequeo. No confiar en la columna. (Encaja con el diseño de tres capas de S1.)

Confirmado en cambio que las fórmulas de PP/SECAR sí son consistentes:
**PP = F Servicio + 9 meses** y **SECAR = PP − 2 meses** (Jersey/Holstein).
Coincide con los defaults sembrados en `hato_config`.

---

## 7. `Toro` y `ESTADO` traen datos de otras columnas

`Toro` (texto libre): `ins laredo`, `ins marquez`, `ins hack`, `jers`, `hols`, `TJ`,
`YJ`, `HOL`, `jjerico`, `htoro`, `hins`, `toro jer-insem coro`, `ins /toro hol`, `gir`.
- Prefijo `ins` ⇒ `tipo_servicio='inseminacion'`; nombre pelado ⇒ `'monta'`.
- **Pero también trae no-toros**: `ok`, `rech`, `6 mes`, `2 mes`, `7` → no inventar un toro.

`ESTADO`/`OBS`: `ok` 82, `rech` 41, `0k` 30, `r` 13, `rec` 7, `3m` 4, `momia` 3,
`rechq` 2, `ok rech` 2, `r?` 3.
- ⚠️ **Y fechas**: `2021-10-08`, `2019-09-09`, `2025-09-23`, `**9/09/2019`,
  `30/06//19`, `5/10/19 sec`. Es el `SEC REAL`/`parto real` de Gen 1 filtrándose.
  Una fecha en ESTADO probablemente es un **secado real**; marcar como issue y
  no asumir.

---

## 8. Hojas de leche

**Pesaje por vaca** (`PROMEDIO DE LECHE DESDE AÑO 2026.xlsx`: MZO/ABRIL/MAYO/JUNIO/
JULIO 2026; y `PROM LECHE ABR 2025`, `PROME`, `promed leche jun 2025` dentro de
`CHEO VETE 2026.xlsx`):
- Formato nuevo: `NOMBRE` + 8 columnas agrupadas `SEMANA 1..4` × 2 sub-columnas.
- Formato viejo: `NOMBRE` + 8 columnas de día-del-mes **corrompidas a fechas por
  Excel** (`2008-04-01` = día 8, `2009-04-01` = día 9, `1930-04-01` = día 30,
  y una literal `may 28`) + `SUMA`.
  Los pares son días consecutivos: (8,9) (15,16) (22,23) (29,30) → 2 días por semana.
- **Identidad sólo por NOMBRE** (no hay `#`) → resolución por nombre, riesgo alto.
- Vaca sin ordeño = **fila en blanco** ⇒ confirma la regla "sin dato (—), nunca 0".

⚠️ **Choque con el esquema de S1**: `hato_pesajes_leche.litros_total` es
`GENERATED ALWAYS AS (COALESCE(litros_am,0)+COALESCE(litros_pm,0))`, pero el
histórico trae **el total del día**, no el desglose AM/PM. Meter el total en
`litros_am` sería mentir; dejar ambos NULL da `litros_total=0`, que viola la regla
de "nunca 0". **Requiere decisión del dueño** (posible migración 061). No parchear
en silencio: S1 ya está en producción.

**Volumen al camión** (`FLUJO LECHE AÑOS 23-26.xlsx`): litros **mensuales**
(12541, 12946, 11700, 9812, 12567, 13781…), no quincenales como
`hato_produccion_quincenal`. Hay un outlier evidente: febrero `9872000`.

---

## 9. Preguntas abiertas para el dueño (no resolver inventando)

1. ¿Qué significan `Mv` (16 casos) y `gem+` (4)?
2. Una fecha en `ESTADO`/`OBS` ¿es siempre secado real, o a veces parto real?
   (La columna Gen 1 cambió de nombre a mitad de 2019.)
3. `hato_pesajes_leche`: ¿cómo cargar totales diarios sin desglose AM/PM?
4. `TP`: ¿confirmado que se ignora y se re-deriva?
5. `FLUJO LECHE` es mensual y la tabla es quincenal — ¿se carga como quincena 1
   con el total del mes, o se deja fuera del backfill?
