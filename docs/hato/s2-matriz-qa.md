# S2 — Matriz adversarial de QA para el motor de importación del Hato Lechero

Segundo barrido sobre los `.xlsx` reales (los mismos 8 archivos en la raíz del worktree,
**no commiteados, solo lectura**). El primer barrido (`hato_s2_hallazgos.md`) miró una
muestra de hojas a fondo; este documento recorre **las 45 hojas de chequeo físicas
completas, fila por fila** (no una muestra), re-verifica cuantitativamente sus tres
afirmaciones centrales, y añade 4 fenómenos que no aparecían ahí. Scripts de extracción
reutilizables en `<scratchpad>/full_scan2.py`, `extract.py`, `analyze1..5_*.py`,
`terneras.py` (todos solo-lectura sobre los xlsx, con `pickle` intermedio en el mismo
scratchpad).

**Nomenclatura de citas**: `archivo.xlsx::HOJA::rN` — fila 1-indexada tal como la ve
Excel/openpyxl (incluye la(s) fila(s) de encabezado).

---

## 0. Resumen ejecutivo — los 8 hallazgos de mayor riesgo

1. **`TP` no es "semanas o meses de preñez" — es una fórmula `TODAY()` congelada en el
   último guardado del archivo.** Reconstruyendo `fecha_implícita = F_Servicio + TP×30.44
   días` para cada fila con # y fecha de servicio válidos, el resultado converge —
   **en prácticamente todas las 45 hojas, incluidas las de 2019** — a una ventana de
   **2026-06-17 a 2026-07-18** (spread de 23-30 días), exactamente la fecha en que estos
   archivos fueron guardados por última vez (mtime `Jul 17 2026`). No es una cuestión de
   unidades (semanas vs. meses); **el valor no tiene relación alguna con la fecha del
   chequeo de esa hoja.** Esto es más severo que "TP no es confiable" — es inservible
   incluso como aproximación, en todos los años. Ver §2.4.
2. **Al menos 9 números de chapeta están duplicados de forma concurrente y sostenida**
   entre dos vacas activas *al mismo tiempo, en el mismo chequeo*: `43` (CUÑA/MONTAÑA,
   concurrente en 34/45 hojas, 2019→2026), `162` (ESMERALDA/VITROLA, concurrente en 11
   hojas, **incluida la más reciente, `CHEQUEO JULIO 2026`**), `175` (MONA/MARGARITA,
   ídem, también en julio 2026), `113`, `151`, `158`, `176`, `181`, `182`. Esto viola
   directamente el invariante del plan §7.4 ("dos activas jamás comparten numero") **en
   el propio hato actual**, no solo en el histórico. Ver §1.
3. **`SECAR` no se deriva de `PP − 2 meses`; se deriva independientemente de `F Servicio
   + 7 meses`.** Verificado sobre 1.156 filas con ambas fechas: la hipótesis directa
   acierta 1.149/1.156 (99,4%) contra 1.094/1.156 (94,6%) de `PP−2mo`. La diferencia
   importa porque cuando `F Servicio` cae en día 29-31, `PP` (que sí es `+9 meses`)
   trunca al último día del mes destino, y derivar `SECAR` desde ese `PP` ya truncado
   pierde 1-6 días frente a derivarlo directo. Ver §2.2.
4. **Fallback posicional no es "recomendable", es obligatorio y ya falla de forma
   comprobada**: en `AGOSTI 1 2023` el encabezado repite `TP` en las 4 columnas donde
   deberían estar `TP`/`ESTADO`/`SECAR`/`PP`. Un parser por nombre de columna pierde en
   silencio fechas reales (`2023-09-07`, `2023-12-01`, `2024-02-01`…) en 5+ filas. Ver §2.5.
5. **Una sub-tabla con esquema ajeno puede estar embebida al final de una hoja de
   chequeo normal**, sin ningún marcador salvo un título en texto libre. En
   `CHEQUEO AGOSTO 2024::r54-58` hay un bloque "Deben entrar a servicio estas terneras"
   que reutiliza las mismas columnas pero con **otro desfase y otro significado**
   (`#P2`→índice 1-4, `Ultima Cria`→# real, `SX`→nombre de la madre). Un parser posicional
   ingenuo produce filas basura (`nombre=149`, `sx='RICARENA'`). No documentado en el
   primer barrido. Ver §2.6.
6. **Una columna de índice decorativo puede inflar una hoja de ~50 filas reales a 274
   filas físicas.** `chequeo 21 y 22.xlsx::CHEQUE MAYO 25` tiene 274 filas; 225 son
   "fantasma" (solo la columna de índice 1..274 rellena, todo lo demás vacío). Un filtro
   de fila-vacía que mire *cualquier celda* en vez de las columnas mapeadas genera 225
   registros vacíos. Ver §2.7.
7. **El offset de columnas en hojas sin encabezado NO es constante ni siquiera entre dos
   copias casi idénticas de la misma hoja.** `CHEQUEO ABRIL 3 2020` (mismo archivo,
   ambas copias) tiene una columna en blanco de más al inicio que `CHEQUEO JUNIO 9 2020`
   no tiene. Y `CHEQUEO DIC 21-22` usa una columna de índice secuencial (14, 45, 31…)
   como primera columna — que **no es la chapeta** — desplazando todo en +1 frente a
   las otras 3 hojas sin encabezado. Ver §2.8.
8. **TERNERAS demuestra que ni el nombre ni el número por sí solos son identidad
   estable**: al menos 6 chapetas (166-170, 175) tienen un **nombre de cría en la hoja
   más antigua** (`campera`, `flaca`, `champeta`, `maraca`, `vid`) **reemplazado por un
   nombre de adulta** en las hojas 2023+ (`COPITA`, `FUERZA`, `CHISPA`, `MARIMBA`,
   `VIVIAN`) — el mismo número, la vaca fue renombrada al madurar. Y al menos 3 filas de
   TERNERAS (`#187,188,189` en `CHEQUEO VETE 2024.xlsx::TERNERAS`) tienen # sin nombre
   (cría recién nacida, aún sin bautizar) que sí aparecen nombradas en la hoja de 2026.
   Ver §3.

---

## 1. Invariantes verificables sobre el corpus completo

Todos verificados por script contra las 45 hojas de chequeo físicas (36 fechas únicas —
las 9 hojas 2019-2020 de `CHEQUEO ACTUALIZADO ENERO 2020.xlsx` están duplicadas byte-a-byte
en `chequeo 21 y 22.xlsx`, confirmando el hallazgo previo de deduplicar por fecha, no por
nombre de hoja).

| Invariante | Valor exacto |
|---|---|
| Hojas de chequeo físicas escaneadas | 45 (36 fechas únicas tras dedup) |
| Filas totales extraídas (bruto, incl. fantasma) | 2.436 |
| Filas "fantasma" (columna índice decorativa, sin # ni nombre) | 269, concentradas 225 en una sola hoja (`CHEQUE MAYO 25`) |
| Filas animal-candidatas reales | 2.167 |
| Filas con **nombre pero sin #** | 35 (28 son animales reales sin numerar; 7 son comentarios/anotaciones multi-nombre mal alineados, p.ej. `"VENDIDAS CORNELIA Y COQUETA"`) |
| Filas con **# pero sin nombre** | 4 (2 instancias únicas, duplicadas entre los 2 archivos con las hojas 2019-2020: la nota `"chequeo Actualizado el mismo dia del chequeo"` cayó en la columna `#`) |
| Números de chapeta con colisión **persistente** (mismo # ligado a 2 nombres distintos, cada nombre visto en ≥2 hojas) | 17 |
| …de los cuales, colisión **concurrente confirmada** (ambos nombres en la MISMA hoja/fecha) | 9: `43,113,151,158,162,175,176,181,182` |
| …de los cuales, presentes en la hoja MÁS RECIENTE (`CHEQUEO JULIO 2026`) | 2: `162` (ESMERALDA/VITROLA), `175` (MONA/MARGARITA) |
| `#` distintos en `CHEQUEO JULIO 2026` (el target de F1 "hato actual") | 37 números, 41 nombres (incl. 2 filas de comentario mal capturadas), 2 números duplicados dentro de la propia hoja |
| `PP = F Servicio + 9 meses`, filas verificables (ambas fechas reales) | 1.124 → 1.123 exactas (99,9%), 1 excepción real |
| `SECAR = F Servicio + 7 meses` (hipótesis directa), filas verificables | 1.156 → 1.149 exactas (99,4%) |
| `SECAR = PP − 2 meses` (hipótesis del primer barrido), mismas filas | 1.156 → 1.094 exactas (94,6%) — **peor ajuste, no usar** |
| Filas donde NINGUNA de las dos hipótesis de SECAR cuadra | 6 (anomalías genuinas — ver §2.2) |
| Celdas `#VALUE!` en TP/SECAR/PP cuyo `F Servicio` NO es texto multi-fecha (huérfanas) | **0 de 69** — confirma 100% que `#VALUE!` siempre es derivado de un `F Servicio` roto, nunca aparece solo |
| Celdas ESTADO/OBS que contienen una fecha en vez de un código de estado | 165 |
| Valores distintos en la columna `Toro` (texto libre) | 99, incluida una oración completa (`"recomendación, dar sal en comida para mejorar ovarios"`, 6 apariciones) |
| Hojas TERNERAS físicas | **7** (no 5): `TERNERAS_` (2020), `TERNERAS` (21y22), `TERNERAS`+`20230terneras`+`HISTORICO TERNERAS` (2023), `TERNERAS` (2024), `TERNERAS` (2026) |
| Esquemas distintos entre esas 7 hojas | **1** — `(índice, #, NOMBRE, F NACIMIENTO, PADRE, MADRE)`; las columnas 7-15 sobrantes son padding vacío, no un esquema diferente |
| Filas animal-candidatas en TERNERAS (bruto, sin dedup entre archivos) | 190 |
| Números de chapeta con nombre **contradictorio** entre hojas TERNERAS (misma #, nombre distinto) | 9 (`166,167,168,169,170,175,187,188,189`) — la mayoría son **renombres cría→adulta**, no errores (ver §3) |

---

## 2. Casos de prueba Given/When/Then por parser

### 2.1 Parser: fecha de chequeo (título de hoja)

```
Given la hoja "chequeo 21 y 22.xlsx::CHEQUEO DIC 21-22" no tiene fila de encabezado
      y su título en r1 es "CHEQUEO DICIEMBR" (truncado por overflow de celda)
When el parser intenta resolver la fecha del chequeo
Then debe caer al nombre de hoja ("DIC 21-22") + heurística de "mitad de mes" o
     marcar normalizacion_issues="fecha_chequeo_ambigua" — nunca debe asumir un día
     por defecto silenciosamente distinto de lo declarado
```

```
Given la hoja "chequeo 21 y 22.xlsx::CHEQUEO nov 2020" con nombre de hoja "CHEQUEO nov 2020"
      y título r1 literal "CHEQUEO:NOVIEMBRE 20 DE 2020" (coinciden)
When se resuelve la fecha
Then debe dar 2020-11-20 exacto — caso feliz de control, no debe fallar por el ":"
     pegado a "CHEQUEO"
```

```
Given la hoja "chequeo 21 y 22.xlsx::Cheq jun 15-21" cuyo nombre sugiere junio
      pero cuyo título r1 es "CHEQUEO:AGOSTO 11 DE 2021"
When se resuelve la fecha
Then debe ganar el título (2021-08-11), no el nombre de hoja — y debe registrarse
     `normalizacion_issues` porque el nombre de hoja es objetivamente falso
     (riesgo: cualquier lógica que use el nombre de hoja como fallback "cuando el
     título parezca raro" tomará la fecha equivocada aquí, porque el título NO es raro,
     es simplemente inconsistente con el nombre)
```

### 2.2 Parser: SECAR / PP (re-derivación desde F Servicio)

```
Given F Servicio = 2020-05-30 (CAPELA, chequeo 21 y 22.xlsx::CHEQUEO JUNIO 9 2020::r9)
When se deriva SECAR y PP
Then PP = 2020-05-30 + 9 meses = 2021-02-28 (clamped, feb no tiene día 30)
     SECAR = 2020-05-30 + 7 meses = 2020-12-30 (exacto, dic sí tiene día 30)
     — el valor real en la planilla es SECAR=2020-12-30, PP=2021-02-28: coincide con
     "derivar directo de F Servicio", NO con "PP − 2 meses" (que daría 2020-12-28,
     2 días antes del valor real)
```

```
Given F Servicio = 2018-08-01 (GALAXIA, CHEQUEO_ENERO_2019::r25)
      con SECAR real en la planilla = 2019-03-07 y PP real = 2019-05-01
When se comparan ambas hipótesis de derivación
Then NINGUNA calza: serv+7mo=2019-03-01 (Δ6 días), pp-2mo=2019-03-01 (Δ6 días también)
     — es una anomalía real de la fuente (posible ajuste manual de Martha), no un bug
     de fórmula. El motor NO debe forzar recomputar SECAR sobre este dato: debe
     preservar el valor crudo y marcar `normalizacion_issues`, nunca sobreescribir
     silenciosamente un valor manual con el derivado
```

```
Given PAULA (CHEQUEO 2023 Y TERNERAS.xlsx::OCT 10 2023::r34) tiene F Servicio='o+'
      (texto, no fecha — es en realidad un código SX que se filtró a la columna
      equivocada) pero SECAR=2023-01-15 y PP=2024-03-15 sí están presentes como fechas
When el motor intenta re-derivar SECAR/PP desde F Servicio
Then no puede (no hay fecha de servicio parseable) — pero SECAR/PP en la celda son
     residuos de un chequeo ANTERIOR, con 14 meses de separación entre sí (no 2), y
     PP anterior a SECAR en algún caso similar (ver MONA abajo) — el motor debe
     ignorar/aislar estos valores heredados y NO usarlos para calcular estado actual;
     debe marcar la fila `normalizacion_issues="secar_pp_sin_servicio_actual"`
```

```
Given MONA (CHEQUEO VETE 2024.xlsx::ENERO 2024::r29) tiene SX='aborto', F Servicio
      = 2023-05-16, PP=2024-02-16 (coincide con +9 meses exacto) pero
      SECAR=2024-03-01 — es decir, SECAR es POSTERIOR a PP (invertido)
When el motor procesa esta fila
Then debe reconocer que SX='aborto' invalida la proyección de embarazo — SECAR/PP no
     deben tratarse como vigentes para una vaca que abortó, sin importar que las
     fechas estén technically presentes. Nunca generar una alerta `secado_due` o
     `parto_proximo` basada en fechas de una fila cuyo SX indica aborto/vacía/vendida
```

### 2.3 Parser: F Servicio (fechas rotas / multi-fecha)

```
Given F Servicio = '18/04/2024/ 8 /05/24 21/06/240' (CHEQUEO VETE 2024.xlsx::
      CHEQUEO AGOSTO 2024::r7, CAPERUZA — 3 fechas concatenadas con separadores
      inconsistentes y un "0" final espurio)
When el parser normaliza F Servicio
Then debe extraer las 3 fechas candidatas (2024-04-18, 2024-05-08, 2024-06-21) y
     preservar `fecha_servicio_raw` intacta; debe decidir cuál es "el servicio
     vigente" (probablemente la última) pero NUNCA colapsar a #VALUE! ni a una sola
     fecha sin dejar rastro de las otras — son 3 intentos reales de servicio (V7:
     "todos los intentos... deben quedar visibles")
```

```
Given F Servicio = '22/08/20220' (chequeo 21 y 22.xlsx::CHEQUEO SEP 2022::r26, MONA)
When el parser normaliza el año
Then debe interpretar "20220" como año 2022 con un "0" sobrante tecleado, dando
     2022-08-22 — no debe rechazar la celda completa solo porque el año tiene 5 dígitos
```

```
Given F Servicio = '15/015/2025' (mes "015" en vez de "05" o "15" — hallazgo previo,
      re-confirmado; no fue posible localizar la fila exacta en este barrido porque no
      apareció en las columnas mapeadas por nombre; probablemente en una fila
      con encabezado corrido — señal de que el propio parser de columnas puede estar
      point a la celda equivocada para ESTA fila específica)
When el parser intenta parsear el mes
Then debe fallar de forma controlada (mes fuera de 1-12) y marcar
     `normalizacion_issues`, nunca interpretar "015" como "1" o "5" por descarte de ceros
```

```
Given F Servicio = 'no serv' (CHEQUEO VETE 2024.xlsx::CHEQUEO MAYO 20 2024::r33 y
      ::MARZO 2024::r33, NONA — texto explícito de "no hubo servicio")
When el parser normaliza la celda
Then debe reconocerlo como "sin servicio registrado" (fecha_servicio=NULL,
     normalizacion_issues=null — esto NO es un dato ambiguo, es un dato explícito de
     ausencia) y no debe intentar extraer una fecha de "no serv"
```

```
Given F Servicio = "'PREÑADA 70%. CRIA 16%. RETRASO 14%'" (CHEQUEO_MARZO_2019::r59,
      fila sin nombre ni #) y F Servicio = "'OK'"/"'ok'"/"'vacia'" (decenas de filas,
      p.ej. CHEQUE MAYO 25::r16 ESMERALDA='vacia', ::r38 PIRINOLA='ok')
When el parser normaliza estas celdas
Then debe reconocerlas como estado/observación filtrada a la columna equivocada — no
     como fecha — y preservar el texto en `fecha_servicio_raw` con
     `normalizacion_issues`. Nótese que 19/69 de estas filas NO generan #VALUE! en
     TP/SECAR/PP (los valores derivados quedan simplemente vacíos, no rotos) — el
     motor debe reproducir ese mismo comportamiento benigno, no forzar un error
```

### 2.4 Parser: TP (columna a IGNORAR, nunca leer)

```
Given cualquier celda TP de cualquier hoja, de cualquier año (2019-2026)
When se calcula `fecha_implícita = F_Servicio_de_la_fila + TP × 30.44 días`
     y se agrupa por hoja
Then el resultado converge de forma consistente a 2026-06-17..2026-07-18 en 40+ de las
     45 hojas (incluidas las de 2019) — prueba que TP es una fórmula `TODAY()` de Excel
     congelada en el guardado más reciente del archivo completo, NO un valor histórico
     por chequeo. El motor NUNCA debe leer TP para ningún propósito (ni "meses" ni
     "semanas"); debe recalcular meses de preñez SIEMPRE desde
     `fecha_chequeo_resuelta − F_Servicio`, ignorando la celda TP por completo incluso
     como validación cruzada
```

```
Given AMAPOLA (CHEQUEO VETE 2024.xlsx::CHEQUEO AGOSTO 2024::r4), F Servicio=2024-05-14,
      TP=26 (valor crudo)
When se compara TP contra "meses transcurridos desde servicio hasta el chequeo real
     del 2024-08-09" (≈2,86 meses) o "semanas" (≈12,4)
Then NINGUNA unidad razonable explica 26 — confirma que TP no es reinterpretable por
     unidad, hay que descartarlo entero (no "elegir la unidad correcta", como sugería
     el primer barrido)
```

### 2.5 Parser: encabezado con columnas TP×4 (fallback posicional obligatorio)

```
Given la hoja "CHEQUEO 2023 Y TERNERAS.xlsx::AGOSTI 1 2023" cuyo encabezado real es
      ['#','Nombre','PL','#P2','Ultima Cria','SX','F Servicio','Toro','TP','TP','TP','TP','TTTO']
      (4 columnas literalmente llamadas "TP")
When un parser resuelve columnas por texto de encabezado (`startswith('TP')`)
Then busca las 4 en una lista `tp_all` sin distinguir cuál es TP real, cuál ESTADO,
     cuál SECAR, cuál PP
Given BRIGIDA en esa hoja (r4): fila cruda = [108,'BRIGIDA',20,4,2023-02-10,'ov',
      2023-05-01,'ins',38,None,2023-12-01,2024-02-01,None]
When el parser NO aplica fallback posicional
Then pierde SECAR=2023-12-01 y PP=2024-02-01 completos (quedan en un array sin
     etiquetar) — dato real perdido en al menos 5 filas de esta hoja
     (AMAPOLA r3, BRIGIDA r4, CAPERUZA r6 confirmadas con fecha real en la 3ª/4ª
     posición "TP")
Then el motor correcto debe usar fallback posicional EXACTO para este patrón:
     posición relativa (TP, ESTADO, SECAR, PP) en ese orden, igual que en las hojas
     Gen3 con encabezado correctamente nombrado
```

### 2.6 Parser: sub-tabla embebida con esquema ajeno (nuevo, no documentado en S1)

```
Given "CHEQUEO VETE 2024.xlsx::CHEQUEO AGOSTO 2024" filas 51-58, que tras el título
      "Deben entrar a servicio estas terneras " (r53, en la posición de columna
      "Nombre") contienen:
        r55: [None, 1, 149, 'RITA ', None, None, 'RICARENA', ...]
        r56: [None, 2, 161, 'BRENDA', None, None, 'BRISA', ...]
        r57: [None, 3, 163, 'VIRGO', None, 'jers', 'VIKINGA', ...]
        r58: [None, 4, 165, 'MIEL', None, None, 'MAGNIFICA', ...]
      — un esquema (índice 1-4, # real, nombre, [vacío], [vacío], madre) que NO es el
      esquema del encabezado de la hoja (#, Nombre, PL, #P2, Ultima Cria, SX, ...)
When el parser posicional de la hoja procesa estas filas con el colmap normal
Then produce basura: `nombre=149` (un número), `sx='RICARENA'` (un nombre de madre,
     no un código de monta) — exactamente lo que produjo la extracción ingenua de
     este barrido
Then el motor correcto debe: (a) detectar el título de sub-tabla en texto libre
     ("entrar a servicio", "terneras") como marcador de fin de tabla principal,
     (b) NUNCA alimentar esas filas al parser de fila-de-chequeo, (c) opcionalmente
     enrutarlas como candidatas de "novilla próxima a servicio" con su propio parser,
     pero solo si el # (149,161,163,165) hace match con un animal ya existente en
     `hato_animales` (los 4 aparecen en TERNERAS con esos mismos # y madre)
```

### 2.7 Parser: filas fantasma por columna de índice decorativa

```
Given "chequeo 21 y 22.xlsx::CHEQUE MAYO 25" tiene 274 filas físicas; la columna
      A contiene un índice secuencial 1..274 relleno por arrastre incluso donde
      TODAS las demás columnas están vacías (confirmado r51-r274 excepto r58)
When un filtro de "fila vacía" evalúa "¿alguna celda de la fila tiene contenido?"
Then falla: 225 de esas 274 filas se cuelan como "no vacías" (por la columna índice)
     pero no tienen ni # ni nombre — deben descartarse
Then el filtro correcto debe evaluar solo las columnas MAPEADAS por el colmap (num,
     nombre, sx, serv, ...), nunca la totalidad de celdas de la fila cruda
```

```
Given dentro de esa misma hoja, "CHEQUEO DIC 21-22" (headerless) tiene una fila
      real (ALTANERA, #113, r58) que aparece DESPUÉS de 6 filas en blanco (r51-r57,
      solo con índice decorativo) en medio del bloque de datos
When se procesa la hoja secuencialmente
Then ALTANERA debe seguir reconociéndose como fila de animal válida pese al hueco —
     un parser que se detenga en la "primera fila totalmente vacía" (asumiendo fin de
     tabla) la perdería
```

### 2.8 Parser: offset posicional en hojas sin encabezado

```
Given "CHEQUEO ABRIL 3 2020" (headerless, ambas copias en los 2 archivos) tiene una
      columna en blanco extra al inicio (offset=1: col0 vacía, col1=#, col2=Nombre...)
      pero "CHEQUEO JUNIO 9 2020" (headerless, mismos 2 archivos, misma época) NO
      tiene esa columna en blanco (offset=0: col0=#, col1=Nombre...)
When el parser posicional asume un offset fijo para "todas las hojas sin encabezado"
Then falla en una de las dos — el offset debe sniffearse por hoja (heurística:
     ¿col[k] es numérico Y col[k+1] es texto de longitud >2? probar k=0 y k=1,
     elegir el que maximice coincidencias)
```

```
Given "chequeo 21 y 22.xlsx::CHEQUEO DIC 21-22" (headerless) cuya primera columna
      real es un índice secuencial pequeño (14, 45, 31, 10, 38, 37, 30, ...) que NO
      es la chapeta — la chapeta real (108, 154, 98, 124...) está en la SEGUNDA
      columna
When el sniffer de offset de §2.8 (caso anterior) evalúa esta hoja
Then debe rechazar offset=0 (col0=14 parece plausible como # pero es sistemáticamente
     secuencial 1..N, patrón de índice de fila, no de chapeta real) y elegir offset=1
     — recomendación: además del sniffer numérico/texto, agregar una verificación de
     "¿los valores de esta columna aparecen también como # en hojas CON encabezado
     de fechas cercanas?" antes de aceptarla como chapeta
```

### 2.9 Parser: identidad — colisión de chapeta concurrente

```
Given en "CHEO VETE 2026.xlsx::CHEQUEO JULIO 2026" (el chequeo más reciente, target
      de la importación F1 "hato actual") aparecen simultáneamente:
        r18: #162, ESMERALDA, SX='A 205', F Servicio=2026-04-09
        r44: #162, VITROLA, SX=None
      y también:
        r27: #175, MARGARITA, SX=None
        r30: #175, MONA, SX='A212'
When el motor de resolución de identidad (§7.4) procesa este chequeo
Then NO puede asumir que # es único — debe generar una entrada en la lista de
     revisión (`resolution-report.md`) para AMBOS pares, marcando `confianza='baja'`,
     y NO debe insertar/actualizar `hato_animales` con `numero` UNIQUE hasta que
     Martha resuelva cuál de las dos vacas por par conserva el 162/175 (o si una de
     ellas necesita un número nuevo)
```

```
Given #43 aparece con DOS nombres (CUÑA, MONTAÑA) simultáneamente en 34 de las 45
      hojas de chequeo, desde CHEQUEO_ENERO_2019 hasta CHEQUEO JULIO 2026 — no es un
      error puntual, es sostenido durante 7 años
When se diseña la regla de importación histórica
Then el motor NO debe tratar esto como "typo aislado a corregir automáticamente" —
     es evidencia de que #43 nombra dos animales físicos distintos desde el origen
     de los datos. Debe entrar al reporte de calidad F4 como el caso #1 de mayor
     prioridad, no diluirse entre docenas de discrepancias menores
```

### 2.10 Parser: ESTADO/OBS con fecha filtrada (columna fantasma Gen1)

```
Given TURMALINA (CHEQUEO_JULIO__2019::r47): ESTADO/OBS=2019-05-28 Y la columna
      dedicada "parto real" (Gen1, misma hoja) = 2019-05-28 — el MISMO valor
      duplicado en dos celdas distintas de la misma fila
      F Servicio=2019-01-17, SECAR_esperado=2019-08-17, PP_esperado=2019-10-17
      (2019-05-28 no coincide con ninguna de las dos proyecciones — es ~3 meses
      ANTES de SECAR)
When el motor procesa esta fila
Then debe reconocer que la fecha en OBS/parto-real documenta un evento REAL de un
     ciclo reproductivo DISTINTO (anterior) al que describe el F Servicio de esta
     fila — nunca debe usarse para validar/invalidar el SECAR o PP de la fila actual.
     Debe crearse como `hato_eventos` de tipo ambiguo (parto_real o secado_real,
     sin certeza) con `confianza='baja'` y quedar en la lista de revisión
```

```
Given en la hoja "CHEQUEO_ENERO_2019" (encabezado dice "SEC REAL") 3 de 7 valores
      con fecha en esa columna quedan a ≤6 días del SECAR proyectado (BRENDA Δ6,
      ESTERCITA Δ3, MONTAÑA Δ4) pero los otros 4 quedan a 24-352 días de distancia
      (CONCHA Δ-352, POTENCIA Δ-290, RUBI Δ-40, VIOLA Δ-24)
When se evalúa si "SEC REAL" (Gen1 ene/mar 2019) es semánticamente equivalente a
     "parto real" (Gen1 may 2019+, misma posición de columna)
Then NO hay evidencia suficiente para asumir que ambos nombres describen el mismo
     hecho de forma consistente — ni siquiera dentro de UNA sola hoja el patrón es
     uniforme (57% cerca de SECAR, 43% lejos de ambas fechas). Este es un caso de
     "preguntar al dueño", no de inferencia por regla (ver §4.2)
```

### 2.11 Parser: SX inusuales (nuevos ejemplos con cita exacta, complementa doc previo)

```
Given SX = "A148**151?" (CHEQUEO ACTUALIZADO ENERO 2020.xlsx::CHEQUEO JUNIO 9 2020::r39
      y duplicado en chequeo 21 y 22.xlsx, mismo r39, y también en ::CHEQUEO AGOS 13::r39,
      VICTORINA — dos números de cría en un solo código, con un "?" de incertidumbre)
When el parser de SX intenta descomponer A{n}
Then no debe elegir arbitrariamente 148 o 151 — debe marcar `normalizacion_issues`
     con ambos candidatos y dejarlo para revisión humana, dado que además lleva "?"
```

```
Given SX = "gem+" (CUÑA, aparece en al menos 3 hojas: CHEQUE MAYO 25::r12,
      CHEQUEO SEP 2022::r11, CHEQUEO DIC 21-22::r11 — no es un error puntual)
When el parser mapea familias SX conocidas (OV/AV/A+/O+/A{n})
Then "gem+" no encaja en ninguna — probable "gemelos" (parto gemelar) que no está en
     la tabla de descomposición del plan (§7.1). Debe ir a `normalizacion_issues` Y
     señalarse explícitamente al dueño como posible código faltante (no es un typo
     aislado, CUÑA lo usa consistentemente)
```

```
Given SX = "RICARENA" (CHEQUEO VETE 2024.xlsx::CHEQUEO AGOSTO 2024::r55) — un nombre
      de vaca en la columna SX, PERO esta fila pertenece a la sub-tabla embebida de
      §2.6 (madre de una novilla), no es un error de digitación en una fila normal
When se cruza este hallazgo con §2.6
Then confirma que al menos algunos de los "nombres de vaca en SX" que reportó el
     primer barrido (RICARENA, BRISA, VIKINGA, MAGNIFICA) NO son errores de
     digitación sueltos — son el subproducto de la sub-tabla ajena mal alineada. El
     motor debe resolver §2.6 primero; lo que sobre después de excluir esas filas es
     el verdadero conjunto de "nombre en SX por error de digitación"
```

---

## 3. TERNERAS — hallazgos que el primer barrido no cubrió

**Esquema único confirmado** (no "5 hojas con esquemas distintos" como decía el primer
barrido): las 7 hojas físicas comparten exactamente
`(índice_fila, #, NOMBRE, F_NACIMIENTO, PADRE, MADRE)`; la variación de 7 a 15 columnas
totales es únicamente padding de columnas vacías al final, verificado en las 7 hojas.

```
Given "chequeo 21 y 22.xlsx::TERNERAS::r13" nombra a la cría #166 como 'campera '
      (nombre de cría/apodo)
      y "CHEQUEO 2023 Y TERNERAS.xlsx::TERNERAS::r12", "::20230terneras::r10" y
      "CHEQUEO VETE 2024.xlsx::TERNERAS::r8" nombran a la MISMA #166 como 'COPITA'
When se resuelve identidad de TERNERAS a través del tiempo
Then no es una contradicción de datos — es un renombre real (cría → nombre adulto).
     Confirmado también para #167 (flaca→FUERZA), #168 (champeta→CHISPA), #169
     (maraca→MARIMBA), #170 (vid→VIVIAN). El motor de resolución debe tratar el
     nombre de TERNERAS más antiguo como "posiblemente obsoleto" y preferir SIEMPRE
     el nombre más reciente por #, nunca alertar esto como error a Martha (es
     ruido esperado, no señal)
```

```
Given "CHEQUEO VETE 2024.xlsx::TERNERAS::r29,r30,r31" tienen # (187,188,189) pero
      NOMBRE=None (cría recién nacida, aún sin nombre al momento de ese registro)
      y "CHEO VETE 2026.xlsx::TERNERAS::r12,r13,r14" SÍ traen nombre para esos mismos
      # (RECOCHA, MARQUEZA, CARMESI)
When el importador carga TERNERAS 2024
Then debe aceptar nombre=NULL como válido ("aún sin nombre"), nunca como fila
     incompleta a descartar — y al cargar 2026 debe actualizar el nombre del mismo
     animal en vez de crear un registro duplicado
```

```
Given la columna PADRE en TERNERAS trae, en 89 de sus celdas no vacías, un nombre de
      RAZA (holstein 13, jersey 26, jers 6, jer 6, normando 4, norman 2, holst 3,
      jerico 2) en vez de un nombre de toro — y 3 valores (yaguen, fabace, 1) que no
      son ni raza reconocible ni coinciden con ningún valor visto en la columna
      `Toro` de las hojas de chequeo
When se puebla `hato_toros`/`hato_animales.padre_toro_id` desde TERNERAS
Then NO se puede asumir que PADRE = identidad de un toro específico salvo cuando el
     valor no es una de las razas conocidas — en la mayoría de los casos PADRE
     documenta solo la RAZA del padre (dato agronómico), no su identidad individual.
     `yaguen`/`fabace` necesitan revisión con el dueño: ¿son fincas de origen del
     semental, nombres de toro reales, o errores de digitación?
```

---

## 4. Contradicciones con el plan (`docs/plan_hato_lechero_module.md`)

### 4.1 §7.4 "dos activas jamás comparten numero" — violado en el hato ACTUAL, no solo histórico

**Evidencia**: §1 y §2.9 arriba. `#162` (ESMERALDA/VITROLA) y `#175` (MONA/MARGARITA)
están duplicados en `CHEQUEO JULIO 2026`, el chequeo exacto que la Épica F1 usará como
"hato actual". **Implicación**: el invariante de verificación F4 ("dos activas jamás
comparten numero") no puede tratarse como un chequeo post-importación que falla y se
corrige — hay que resolverlo ANTES de poder cargar F1 en absoluto, porque el UNIQUE
constraint sobre `hato_animales.numero` rechazará la segunda fila. Requiere decisión de
Martha por cada uno de los 9 pares confirmados (§0.2) antes de que el pipeline pueda
correr, no después.

### 4.2 §7.1 capa cruda "sobrevive a errores de normalización" — el TP asumido servible no lo es en ningún grado

**Evidencia**: §2.4. El plan (§7.3, motor de alertas) da por hecho que se puede leer un
histórico razonable de "meses de preñez" con algo de limpieza. La evidencia muestra que
NINGÚN valor histórico de TP es utilizable ni siquiera como aproximación gruesa — no es
un problema de "limpiar", es un valor que documenta el instante de guardado del archivo,
no el chequeo. **Implicación**: el motor debe recalcular meses de preñez 100% desde cero
(fecha_chequeo − F_Servicio) para TODO el histórico; guardar `tp_raw` en la capa cruda
es correcto (trazabilidad), pero ningún cálculo, ni siquiera de validación cruzada, debe
depender de él.

### 4.3 §7.1 "SECAR = PP − periodo de secado según raza" — la fórmula real de la fuente es independiente, no derivada de PP

**Evidencia**: §2.2, §0 (hallazgo #3). El plan describe (correctamente, para el cálculo
FUTURO/V6) `SECAR = PP − meses_secado(raza)`. Pero la fuente histórica calculaba
`SECAR = F Servicio + 7 meses` de forma independiente a `PP = F Servicio + 9 meses` —
matemáticamente equivalente SOLO cuando ninguna de las dos sumas de meses requiere
truncar por fin de mes. **Implicación**: si el motor implementa literalmente
`SECAR := PP − meses_secado(raza)` (derivando de un PP ya calculado y truncado), sus
resultados divergirán en 1-6 días respecto al histórico real en ~5% de los casos — no
alcanza el 99,4% de fidelidad que si se deriva `SECAR := F_Servicio + (9 − meses_secado)`
directamente. Para paridad con el histórico (útil en verificación F4/testing), la
segunda forma es la que hay que replicar; ambas son "correctas" hacia adelante, pero
solo una es fiel al criterio original que dejó el rastro de datos verificable.

### 4.4 §7.4 "el # es la llave visible en todo el módulo" — el nombre tampoco es estable, ni siquiera en TERNERAS

**Evidencia**: §3. El plan ya reconoce (correctamente) que el # es más fuerte que el
nombre para resolución de identidad, con el nombre como "validación". Pero la evidencia
muestra que el PROPIO REGISTRO DE NACIMIENTOS (TERNERAS) reescribe nombres con el tiempo
(cría→adulta) — por lo que ni siquiera es seguro usar "el primer nombre visto en
TERNERAS" como ancla de validación; hay que preferir siempre el nombre MÁS RECIENTE
observado para cada #, y tratar cualquier nombre de TERNERAS anterior a la fecha de la
hoja de chequeo más antigua donde aparece el mismo # como candidato "obsoleto", nunca
como contradicción a resolver con Martha.

---

## 5. Casos que requieren al dueño (Martha/Fernando) — no resolubles por regla

Separados explícitamente de los que sí tienen una regla determinística arriba.

1. **Los 9 pares de chapeta con colisión concurrente confirmada** (§0.2, §2.9): `43`
   (CUÑA/MONTAÑA), `113` (FLAUTA/ALTANERA), `151` (VENUS/CHAMPAÑA), `158`
   (CARMIÑA/CARMENZA), `162` (ESMERALDA/VITROLA — **vigente en 2026**), `175`
   (MONA/MARGARITA — **vigente en 2026**), `176` (FABIOLA/INDIRA), `181`
   (MARACA/MARIBEL), `182` (FLACA/FRESA). Para cada uno: ¿cuál de las dos vacas
   conserva la chapeta, y qué número nuevo recibe la otra? Sin esto, F1 no puede
   completarse — el UNIQUE de `numero` lo bloquea.
2. **Significado de `Mv`** (16 casos, ver hallazgo previo, confirmado sostenido en
   múltiples hojas, no un typo) y **`gem+`** (4 casos, confirmado en CUÑA de forma
   repetida en 3 hojas — probable "gemelos" pero sin confirmar).
3. **¿La fecha filtrada en OBS/ESTADO (Gen1 "SEC REAL"/"parto real") es siempre
   secado real, siempre parto real, o depende de la hoja?** La evidencia (§2.10) NO
   es concluyente ni siquiera dentro de UNA sola hoja (57%/43% split contra las dos
   proyecciones). No se puede resolver por regla — se necesita el criterio de Martha
   sobre qué anotaba en esa columna en 2019.
4. **`hato_pesajes_leche` AM/PM vs. total diario**: confirmado (nuevo dato) que el
   formato nuevo (`SEMANA 1..4`, 2 sub-columnas c/u) tampoco trae información de DÍA
   DE LA SEMANA exacto — ni el histórico corrupto (que sí tenía día-del-mes, aunque
   roto por Excel) ni el nuevo (que sólo dice "semana N") permiten derivar una fecha
   calendario exacta para cada una de las 2 lecturas semanales sin preguntarle a
   Martha/Fernando qué día de la semana se pesa. Esto es más severo que el "choque de
   esquema AM/PM" ya señalado: ni siquiera hay fecha exacta que insertar en
   `hato_pesajes_leche.fecha` para el formato nuevo.
5. **`FLUJO LECHE AÑOS 23-26.xlsx`**: 4 bloques apilados sin año explícito en ninguno
   (solo nombres de mes repetidos 4 veces) — la única pista es el nombre del archivo
   ("23-26") y el orden top-to-bottom. El primer bloque solo tiene 6 meses
   (enero-junio) poblados mientras los otros 3 tienen los 12 — ¿bloque 1 es un año
   parcial real, o los bloques no están ordenados 2023→2026 como se asume? No resoluble
   sin confirmar con el dueño cuál bloque es cuál año.
6. **PADRE en TERNERAS con valores `yaguen`, `fabace`** (§3): ¿nombres de toro reales,
   fincas de origen, o error de digitación? No coinciden con ningún valor de la
   columna `Toro` de las hojas de chequeo ni con ninguna raza conocida.
7. **La sub-tabla "Deben entrar a servicio estas terneras"** (§2.6): solo se encontró
   una vez en todo el corpus (`CHEQUEO AGOSTO 2024`), pero al ser una nota manual
   de Martha sin marcador estructural, es razonable esperar que reaparezca en
   chequeos futuros con formato ligeramente distinto — vale la pena preguntarle si
   este tipo de nota-al-final-de-hoja es una práctica que seguirá usando, para saber
   si construir un parser dedicado o simplemente instruirla a no escribirlo dentro del
   Excel de chequeo.

---

## 6. Cobertura y lo que este barrido NO verificó

- Se escanearon las 45 hojas de chequeo y las 7 hojas TERNERAS fila por fila
  programáticamente (no muestreo). Las 6 hojas de leche y la hoja `FLUJO LECHE` se
  inspeccionaron por completo (son pequeñas, ≤57 filas).
- **No se abrió** `GASTOS FOV ENERO 2026 (1).xlsx` — es un archivo de finanzas/Fovemsa
  fuera del alcance del módulo Hato Lechero (no está en el plan §6/§7.1), se dejó fuera
  deliberadamente.
- **No se verificó** el contenido de `Hoja1`/`Hoja2`/`Flujo Caja 2022-1` (hojas vacías o
  fuera de alcance detectadas en el inventario inicial).
- **No se intentó** resolver las 63 contradicciones de # menores dentro de TERNERAS
  (§ Invariantes) una por una — se documentó el patrón dominante (renombre cría→adulta)
  con ejemplos representativos; una resolución exhaustiva fila-por-fila de las 63 le
  corresponde al pipeline de importación (Épica F), no a esta matriz de QA.
- **No se verificó** el comportamiento del futuro parser contra estos casos — este
  documento es la especificación adversarial, no una suite ejecutable; el motor aún no
  existe en este branch.
