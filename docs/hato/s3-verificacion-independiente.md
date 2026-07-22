# S3 — Verificación independiente del coordinador

Mediciones hechas **por el coordinador de S3, con código propio**, sin compartir
una línea con los agentes que construyeron el pipeline. El propósito no es
repetir el barrido de S2 sino tener un número contra el cual contrastar la
salida del pipeline: si dos implementaciones independientes coinciden, la
coincidencia significa algo.

Todo lo de abajo salió de los `.xlsx` reales, solo lectura. Script:
`<scratchpad>/verificar_invariantes.py` + consultas ad-hoc con `openpyxl`.

Fecha: 2026-07-22.

---

## 1. Lo que confirma la matriz de QA (coincidencia exacta)

| Invariante | Coordinador | `s2-matriz-qa.md` §1 |
|---|---|---|
| Hojas de chequeo físicas | 45 | 45 ✅ |
| Fechas de chequeo únicas | **35** | 36 ❌ (ver §2.4) |
| Filas fantasma en `CHEQUE MAYO 25` | 225 | 225 ✅ |
| `#` distintos en `CHEQUEO JULIO 2026` | 37 | 37 ✅ |
| Colisiones de chapeta concurrentes | las 9 documentadas | 9 ✅ |
| …vigentes en julio 2026 | `162`, `175` | `162`, `175` ✅ |

Las cifras más flojas del barrido (filas brutas, "nombre sin #") **no** se
compararon: la heurística de identificación de filas del coordinador es
deliberadamente más cruda que la del pipeline, así que una diferencia ahí no
prueba nada. Se dejan fuera a propósito en vez de reportar una coincidencia
falsa.

---

## 2. Correcciones a documentos previos

### 2.1 Las 9 hojas repetidas NO son todas byte-idénticas — son 8

`s3-handoff.md` §2 y `s2-hallazgos-planillas.md` §1 dicen que las 9 hojas de
2019-2020 están duplicadas byte-a-byte entre `CHEQUEO ACTUALIZADO ENERO 2020.xlsx`
y `chequeo 21 y 22.xlsx`. **Ocho lo están. `CHEQUEO JUNIO 9 2020` no.**

Difiere en exactamente una fila — COQUETA, `#99`:

| Archivo | PL | Última cría |
|---|---|---|
| `CHEQUEO ACTUALIZADO ENERO 2020.xlsx` | 2 | **2021-05-03** |
| `chequeo 21 y 22.xlsx` | 1 | 2019-11-07 |

Una "última cría" de mayo 2021 en una hoja fechada en junio de 2020 es una
fecha **futura respecto al chequeo**: esa copia se editó después (el archivo se
llama, literalmente, "ACTUALIZADO").

**Consecuencia para el pipeline**: "conservar la primera hoja que se itere" no
es un desempate neutro — elige en silencio entre una lectura original y una
revisión posterior, y cuál gana depende del orden de los archivos. El dedupe
debe comparar contenido, no solo fecha resuelta, y emitir un issue nombrando
las filas que difieren en vez de descartar una copia calladamente.

### 2.2 `CHEQ MAZO 2025` y `diciembre 20224` sí son el mismo chequeo

Ambas hojas viven en `CHEO VETE 2026.xlsx` y comparten el título
`CHEQUEO Marzo 31 de 2025`. Sus 50 filas difieren **todas**, pero únicamente en
la **columna de índice decorativa** (`1,2,3,4…` vs `18,1,2,14…`): todos los
campos de animal son idénticos. Deduplicar por fecha resuelta es correcto aquí,
y el hallazgo corrobora de forma independiente que esa primera columna es
decorativa y jamás debe leerse como chapeta.

### 2.4 Las fechas de chequeo únicas son 35, no 36

`s2-matriz-qa.md` §1 dice "45 hojas (36 fechas únicas tras dedup)". Son **35**.

De los 45 títulos de r1, **diez** aparecen dos veces: los nueve pares cruzados
de 2019-2020 entre los dos primeros archivos, **más** el par
`CHEQ MAZO 2025` / `diciembre 20224` (§2.2), ambos titulados
`CHEQUEO Marzo 31 de   2025`. 45 − 10 = **35**.

El barrido de S2 documentó ese par en otro lado (`s2-hallazgos-planillas.md` §3
lo llama "un duplicado de marzo 2025") pero no lo restó del conteo. Es un
descuadre de uno, sin consecuencias de datos — pero `Load` no debe crear 36
filas en `hato_chequeos`.

### 2.3 El invariante "hato activo ≈ 45" mide una población distinta de la que se creía

> ⚠️ **Corregido más abajo.** Cuando se escribió esta sección aún no se habían
> cruzado las planillas de leche, y la conclusión fue "45 no corresponde a ningún
> número real". Es **falsa**: §3.6 muestra que 45 ≈ el hato **en ordeño** (43).
> Lo que sigue vale como medición; la conclusión correcta está en §3.6.

El plan §7.4 (paso 5, *Verify*) y `CLAUDE.md` dicen "hato activo ≈ ~45".
Medido:

| | Cantidad |
|---|---|
| `CHEQUEO JULIO 2026` — filas de animal | 39 |
| …**chapetas distintas** (`162` y `175` aparecen 2 veces c/u) | **37** |
| `TERNERAS` 2026 | 37 (números 179-215, corridos, sin huecos) |
| Presentes en ambas (novillas que entraron al hato) | 2 (`180`, `182`) |
| **Unión — animales vivos distintos** | **72** |

Ni 37 ni 72 es 45 — **pero 43 sí lo es**, y son las vacas en ordeño (§3.6).

Lo que queda en pie de esta sección es la conclusión de ingeniería, no la
alarma: *Verify* **no** debe afirmar una constante mágica. Debe reportar los
conteos de cada población por separado (en chequeo, en ordeño, vivas totales),
porque son tres números distintos que responden tres preguntas distintas. Un
`≈45` hardcodeado invita a alguien a "corregir" los datos hasta que dé 45 —
justo lo que este pipeline no puede permitirse.

---

## 3. Hallazgos nuevos

> ⚠️ **Corregido por la corrida real (2026-07-22).** El pipeline, leyendo la
> grilla con el parser probado, detecta **11** colisiones concurrentes, no las
> 12 de este barrido. La diferencia es `#158` (CARMENZA/CARMIÑA): la heurística
> de este documento emparejaba `(número, nombre)` mirando las primeras celdas
> no vacías de la fila, y ahí produjo un falso positivo. El pipeline manda.
> `NONA`, `FRESIA` y `CARMENZA` resultaron ser nombres de otros animales
> (`#169`, `#182`, `#85`), no miembros de una colisión. Se conserva la sección
> tal cual porque el ORDEN por número de hojas —que es lo que hace corta la
> sesión con Martha— sigue siendo válido.

### 3.1 Tres colisiones de chapeta que la matriz de QA no lista

Cada una aparece en **una sola hoja**, así que no pasan el filtro de
"persistente" de la matriz (cada nombre visto en ≥2 hojas) — son una **adición**,
no una contradicción:

`#116` NODRIZA/FABIOLA · `#179` FAUSTINA/TANIA · `#183` CHAMPAÑA/CHAMPETA

Dos observaciones que cambian cómo se le presentan a Martha:

- **Un nombre bajo dos números** es un modo de falla distinto de "un número, dos
  nombres", y se resuelve distinto: FABIOLA aparece en `#176` y en `#116`;
  CHAMPAÑA en `#151` y en `#183`.
- **Variantes de grafía a un carácter de distancia**: `#175` trae también NONA
  (junto a MONA/MARGARITA) y `#182` trae FRESIA (junto a FLACA/FRESA).
  MONA/NONA y FRESA/FRESIA no deben resolverse automáticamente, pero sí
  agruparse aparte de los casos de dos animales reales. Es la diferencia entre
  pedirle a Martha 12 decisiones o 3.

### 3.2 El número de hojas en que colisiona es la mejor señal para adjudicar

| Chapeta | Nombres | Hojas donde colisiona |
|---|---|---|
| `43` | CUÑA / MONTAÑA | **34** (2019→2026, sostenido 7 años) |
| `162` | ESMERALDA / VITROLA | 11 — **vigente en julio 2026** |
| `175` | MONA / MARGARITA / NONA | 5 — **vigente en julio 2026** |
| `113` | ALTANERA / FLAUTA | 4 |
| `151` | VENUS / CHAMPAÑA | 4 |
| `176` | FABIOLA / INDIRA | 4 |
| `158` | CARMENZA / CARMIÑA | 1 |
| `181` | MARACA / MARIBEL | 1 |
| `182` | FLACA / FRESA / FRESIA | 1 |

34 hojas a lo largo de 7 años es evidencia de **dos animales físicos distintos**;
una sola hoja es, con mucha probabilidad, un error de digitación. Presentar la
lista ordenada por esta columna es lo que hace corta la sesión con Martha.

### 3.3 Los números nuevos son correlativos → una colisión es un número RECICLADO

`TERNERAS` 2026 numera 179-215 sin huecos, mientras que las chapetas del chequeo
están dispersas entre 43 y 182. Los animales nuevos reciben el siguiente número
correlativo, así que una colisión en `#162` o `#175` es casi con certeza un
número **reutilizado** de un animal muerto o vendido, no un error de numeración.
Ese encuadre es probablemente lo que permite responder rápido.

### 3.4 La columna `Toro` mezcla tres cosas distintas

114 valores distintos por la detección de columna del coordinador (la matriz de
QA dice 99; la diferencia es un match de encabezado más laxo — vale la del
pipeline). Lo que importa es la **forma**:

1. **Raza, no identidad de toro** — el grupo más numeroso:
   `hol` 63 · `jers` 63 · `gir` 63 · `hols` 54 · `GIR` 38 · `JER` 30 · `HOL` 28 ·
   `HOLS` 24 · `JERSEY` 16 · `norm` 16 · `HOLST` 8 …
2. **Nombres de toro reales**: ~~`inook`/`INOOK` (61+49)~~ · `FABA` 22 ·
   `nitro` 16 · `steem` 11 · ~~`TJ` 9~~ · y `laredo`/`marquez`, vistos solo
   dentro de celdas compuestas.

   > ⚠️ **Corregido por el dueño (segunda ronda, 2026-07-22)**: `INOOK` **no
   > es un toro** — significa "la vaca está ok" (como `ok`; `rech` = necesita
   > rechequeo). La señal para detectarlo: no hay fecha de servicio asociada.
   > Habría sido el "toro" más frecuente del catálogo (110 apariciones) — el
   > tipo exacto de error plausible que solo el dueño podía atajar. Y `TJ` es
   > **jersey** (raza), no un nombre. `FABA` sí es un toro: se llama
   > **Fabace** (jersey), el mismo `fabace` de TERNERAS (§3.8, confirmado).
3. **Ni lo uno ni lo otro**: `ins` 44 (inseminación) y `T` 16 / `Toro` 14 (monta)
   son **tipo de servicio**; `ok` 49 · `OK` 10 · `rech` 14 · `rec` 9 son códigos
   de ESTADO **filtrados desde otra columna** — el mismo fenómeno que la matriz
   de QA documenta para `F Servicio`.

Celdas compuestas (`ins laredo`, `ins marquez`, `toro holst`, `INS MER`) llevan
tipo de servicio **y** toro-o-raza en una sola celda. El contrato ya separa
`tipoServicio` de `toroNombre` justamente por esto.

**Trampa concreta**: `hato_config.razas` siembra
`["jersey","holstein","normanda"]` — nombres canónicos completos. **Ninguna celda
de la planilla escribe una raza así.** Un `razas.includes(valor)` literal no
haría match con nada y dejaría pasar cada abreviatura a `toroNombre`, sembrando
`hato_toros` con toros falsos llamados `hol`, `jers` y `gir` — este último con
~101 apariciones, perfectamente plausible en el catálogo y muy difícil de
detectar después. `hato_toros.nombre` es `NOT NULL`, así que nada lo frenaría.

**`gyr` no está en `HatoConfig.razas`** y aparece ~101 veces. `parseSX` ya lo
reconoce (`/gu?ir/i -> 'gyr'`), así que hay precedente en el motor. La respuesta
cerrada de S2 ("por ahora todas holstein") era una decisión sobre
`meses_secado_por_raza`, **no** una licencia para descartar `gyr` en silencio.
Queda como pregunta abierta para el dueño.

---

## 3.5 `FLUJO LECHE`: la pregunta abierta #5 SÍ era resoluble

`s2-matriz-qa.md` §5.5 y `s3-handoff.md` §4 la listan como no resoluble sin el
dueño: *"4 bloques apilados sin año explícito en ninguno… la única pista es el
nombre del archivo y el orden top-to-bottom"*.

**Los cuatro bloques traen su año escrito.** El tercero simplemente pone el
título en la **columna B**, no en la A — por eso un barrido que solo mire la
primera columna no lo ve.

| Bloque | Filas | Año | Evidencia literal |
|---|---|---|---|
| 1 | r1-r9 | **2026** | `Flujo de leche  Fovemsa 2026` |
| 2 | r11-r21 | **2025** | `FLUJO LECHE ENERO DICIEMBRE 2025` |
| 3 | r23-r31 | **2024** | `Flujo de caja ENERO- DICIEMBRE 2024` ← **en columna B** |
| 4 | r33-… | **2023** | `Flujo de leche  Fovemsa Enero a Dic 2023` |

**El orden es DESCENDENTE (2026 → 2023)**, exactamente al revés del
`2023 → 2026` que se asumía. Asignar años por posición top-to-bottom habría
etiquetado mal los cuatro bloques, hasta con 3 años de error.

El bloque parcial de 6 meses (enero-junio) es **2026** porque el año va
corriendo — no es un año parcial anómalo, es el año en curso. Eso resuelve la
segunda mitad de la pregunta.

**Sale de la lista de Martha.** Lo que queda abierto de leche es otra cosa: que
`FLUJO LECHE` trae litros **mensuales** mientras `hato_produccion_quincenal` es
quincenal (pregunta #4 de S2, sigue viva y sí necesita al dueño).

**Error de dato encontrado de paso**: en el bloque 2025, febrero registra
`9.872.000` litros donde los meses vecinos rondan los 13.000. Es una cifra de
ingreso que quedó en la fila de litros. Si ese bloque se carga alguna vez, esa
celda no puede entrar tal cual.

---

## 3.6 Las planillas de leche resuelven las dos colisiones vigentes

Nadie había cruzado `PROMEDIO DE LECHE DESDE AÑO 2026.xlsx` (5 hojas,
MZO-JULIO 2026, 43 vacas) contra las hojas de chequeo. Ese cruce es la
evidencia más decisiva que produjo esta verificación.

| Chapeta | Nombre | ¿En la planilla de leche? | Litros (junio 2026) |
|---|---|---|---|
| `162` | ESMERALDA | sí, fila propia | 6, 7, 5, 6, 6, 6.5, 5, 6 |
| `162` | VITROLA | **sí, fila propia** | vacía (seca) |
| `175` | MONA | sí, fila propia | 11.5, 13, 10, 12, 10, 9, 7, 8 |
| `175` | MARGARITA | no aparece | — |

**Martha lleva ESMERALDA y VITROLA como dos filas separadas en su propia
planilla de leche.** Ya las trata como dos animales distintos. Es decir: las
colisiones vigentes **no son errores de digitación**, son dos animales reales
compartiendo una chapeta.

Eso cambia la pregunta que hay que hacerle. No es *"¿cuál de los dos nombres es
el correcto?"* sino *"¿cuál de las dos conserva el 162, y qué número nuevo
recibe la otra?"* — una decisión mucho más corta, y la única que destraba
`Load`.

### La reconciliación del "≈45": eran dos poblaciones distintas

| Población | Cantidad |
|---|---|
| Planillas de leche 2026 (**el hato en ordeño**) | **43** (42 en marzo, 43 abr-jul; muy estable) |
| `CHEQUEO JULIO 2026` (**el hato en chequeo reproductivo**) | 39 nombres / 37 chapetas |
| Unión | 47 |
| Ordeñadas pero **ausentes** del chequeo | 8 — CHISPA, DACOTA, MANU, MIEL, TINA, VANESA, VIDA, VIVIAN |
| En el chequeo pero **sin ordeñar** | 4 — CORAZA, MARGARITA, VANIDOSA, VIOLETA (casi con certeza secas) |

El "≈45" del plan **nunca estuvo mal**: mide el hato **en ordeño** (43), no la
población del chequeo (37). El plan confundió dos poblaciones distintas. Corregir
la redacción del invariante es mejor que corregir el número.

### Obstáculo real para el backfill de leche (S5)

**Las planillas de leche no traen chapeta en absoluto — solo nombre.** Así que
`hato_pesajes_leche.animal_id` (FK `NOT NULL`) solo puede resolverse por
**nombre**, justo la llave que sabemos inestable.

35 de los 43 nombres cruzan directo contra `CHEQUEO JULIO 2026`. Los otros 8 sí
resuelven, pero solo contra el corpus histórico completo — y **dos resuelven de
forma ambigua**:

- `CHISPA` → **38 ó 168** · `VIDA` → **133 ó 137** ← decisiones para Martha
- Sin ambigüedad: DACOTA 129 · MANU 145 · MIEL 165 · TINA 171 · VANESA 125 · VIVIAN 170

Conviene fijar este mapeo nombre→animal **ahora**, mientras Martha está mirando
el tema; si no, S5 reabre la misma pregunta en frío.

Detalle de formato, consistente con lo ya documentado: cada mes trae
`SEMANA 1..4` con **2 sub-columnas por semana y ningún rótulo de día**, así que
sigue sin haber fecha calendario que insertar en `hato_pesajes_leche.fecha`
(pregunta abierta #4 de S2, todavía viva). Hay mezcla de tipos en la misma fila
(`'11.5'` texto junto a `12` número) y filas enteras vacías (AMAPOLA, CAMILA,
CAPERUZA): eso es "no pesada = sin dato", **nunca 0** (D-1).

---

## 3.7 `Mv` y `gem+`: no se resuelven, pero la pregunta se vuelve corta

Ninguno de los dos se puede cerrar por regla — siguen siendo preguntas para
Martha. Pero medir **quién** los usa y **cómo se comportan** convierte una
pregunta abierta ("¿qué significa esto?") en una de sí/no.

### `Mv` — aparece en exactamente DOS animales, y parece un estado permanente

| Animal | PL | Partos | Última cría | Hojas donde aparece |
|---|---|---|---|---|
| CORDOBEZA `#165` | 10 | 6 | 2016-12-26 | ene y mar 2019 |
| MAMITA `#153` | 11 | 7 | 2017-09-09 | ene, mar, may, jul, sep, nov 2019 |

Las 16 apariciones que contó S2 son estos **dos animales** (duplicados entre los
dos archivos que comparten las hojas de 2019). El perfil es idéntico en ambos:
muchos partos (6-7), **sin cría nueva en 2+ años** al momento del chequeo, y el
código **no cambia nunca** de un chequeo al siguiente.

Eso no parece una observación del chequeo (como `ov`, `av`, `rech`, que cambian
ronda a ronda) sino un **estado permanente del animal**. La pregunta concreta
para Martha deja de ser "¿qué significa Mv?" y pasa a ser: *"¿`Mv` marcaba una
vaca retirada de la reproducción?"*

### `gem+` — la hipótesis "gemelos" NO se confirma en el registro de nacimientos

`gem+` aparece en **un solo animal**: CUÑA `#43`, en 5 hojas (may 2022 → may
2023), siempre con la misma `Ultima Cria = 2022-05-06`.

Si `gem+` fuera "parto gemelar", deberían existir **dos crías de CUÑA nacidas
alrededor del 2022-05-06** en TERNERAS. Buscadas: **no hay ninguna.** Lo único
registrado para CUÑA es `#141 cuca` (2019-07-07) y `#207 CUTA` (sin fecha). La
única cría cercana a esa fecha, `#166 campera` (2022-06-30), tiene madre COMETA.

Dos lecturas posibles, y **no** se puede elegir por regla:
- las crías no sobrevivieron, o fueron machos — y TERNERAS registra *terneras*,
  o sea **hembras**, así que un parto gemelar de machos no dejaría rastro ahí;
- o `gem+` significa otra cosa.

Lo verificable y útil: TERNERAS **sí** registra nacimientos de 2022 (ahí está
`#166`), así que la ausencia no se explica por un hueco en el registro de ese
año. Si `gem+` fuera gemelos hembras, faltarían dos filas.

---

## 3.8 `yaguen` / `fabace` sí se comportan como nombres de toro, no como raza

La matriz de QA §3 los deja como *"¿nombres de toro reales, fincas de origen, o
error de digitación?"*. Medido, el perfil es inequívocamente **de toro
individual**:

| Valor | Crías que nombra | Fechas de nacimiento | Dónde aparece |
|---|---|---|---|
| `yaguen` | 2 — `#122 juiciosa`, `#123 valenciana` | 2018-02-01, 2018-08-06 | solo TERNERAS más antiguas |
| `fabace` | 2 — `#128 arpa`, `#129 dacota` | 2018-04-06, 2018-09-06 | solo TERNERAS más antiguas |

(3 apariciones cada uno: una de las dos crías está duplicada entre archivos.)

El contraste con las razas es lo que decide: `jersey` (26) y `holstein` (13)
**recurren a lo largo de todo el corpus, 2018-2026**. `yaguen` y `fabace`
nombran **dos crías cada uno, todas nacidas en 2018**, y después desaparecen.
Ese es el patrón de un semental concreto usado una temporada — no el de una
raza.

**Pista cruzada para `fabace`**: la columna `Toro` de las hojas de chequeo trae
`FABA` **22 veces en 7 hojas**, con fechas de fila entre 2018-11-27 y 2020-01-23.
Las crías de `fabace` nacieron abr/sep 2018, o sea servicios de mediados/finales
de 2017 — justo **antes** de esa ventana, lo cual es consistente: el corpus de
chequeos arranca en enero de 2019, así que un servicio de 2017 no podía aparecer
ahí. La pregunta para Martha se vuelve concreta y de sí/no:
***¿`fabace` es el mismo toro que `FABA`?***

`yaguen` **no tiene contraparte en ninguna parte** de la columna `Toro`. Sigue
abierto, pero acotado: es un nombre que solo existe en el registro de
nacimientos de 2018.

---

## 3.9 `SEC REAL`/`parto real`: se intentó cerrarla y NO se logró

La pregunta #3 de S2 (¿la fecha en esa columna es secado real o parto real?)
sigue **abierta**. Se deja constancia del intento para que nadie lo repita
creyendo que es terreno virgen.

**Prueba aplicada**: si esa fecha fuera un *parto real*, debería reaparecer como
`Ultima Cria` del mismo animal en el chequeo **siguiente**. Se compararon las 7
hojas Gen 1 en orden cronológico (ene 2019 → ene 2020).

**Resultado**: 15 casos comparables, **0 coincidencias** (tolerancia ±3 días).

**Por qué NO se reporta como hallazgo**: 15 casos es una muestra delgada, y la
prueba presupone que `Ultima Cria` se actualiza puntualmente en la ronda
siguiente — cosa que no se pudo verificar de forma independiente. Un 0/15 es
evidencia *débil* en contra de "parto real", no una refutación. La medición
57/43 de la matriz de QA sigue siendo la mejor que hay.

Queda para Martha, tal como estaba.

---

## 3.10 Dos defectos que SOLO aparecieron al correr sobre los datos reales

Los dos pasaron los 146 tests unitarios. Ninguno era detectable con fixtures
sintéticos, porque los dos dependen de propiedades del corpus completo.

### (a) El chequeo de marzo 2019 se cargaba DOS veces

`aplicarDedupe` agrupaba solo por `chequeoFecha` resuelta. Pero el título de
`CHEQUEO_MARZO_2019` (`"CHEQUEO MARZO 2019"`) **no trae día**, así que ninguna
de sus dos copias byte-idénticas resolvía fecha, ninguna se agrupaba, y las dos
emitían sus filas.

**Arreglo**: cuando no hay fecha, el dedupe cae a una **firma de contenido**.
Sin fecha no se puede afirmar que dos hojas distintas sean el mismo chequeo,
pero sí se puede afirmar que dos hojas con contenido idéntico lo son.
Resultado: duplicadas 9 → **10**, filas 1.773 → **1.716**, y 35 chequeos
supervivientes — que es exactamente el conteo independiente de §2.4.

### (b) Nueve animales reales se fusionaban en silencio

El más grave. `resolverRenombres` excluía los números con colisión **vigente**
(presente en la lectura más reciente), pero trataba como *renombre* cualquier
otra colisión. Efecto: `#43` CUÑA/MONTAÑA —**concurrentes en 25 hojas a lo
largo de 7 años**— se resolvía como "un animal que cambió de nombre", fusionando
dos animales reales y **perdiendo uno**. Igual para `#113`, `#116`, `#151`,
`#176`, `#179`, `#181`, `#182`, `#183`.

Esto es exactamente lo que `s2-matriz-qa.md` §2.9 advierte por nombre para
`#43` ("NO debe tratarse como typo aislado a corregir automáticamente") y lo
que el contrato del pipeline prohíbe: descartar en silencio.

**Arreglo**: la concurrencia en CUALQUIER hoja prueba dos animales, sin importar
qué tan antigua sea. Una vaca no puede llamarse de dos formas el mismo día.
`vigente` se conserva solo para PRIORIZAR el reporte, nunca para decidir cuántos
animales hay detrás de un número. Resultado: **158 → 167 animales**.

### Lección

La cobertura unitaria era buena (146 tests, todos los casos duros de la matriz
de QA) y aun así los dos defectos pasaron. Ambos son propiedades del corpus
—"existe una hoja sin día", "existe una colisión que dejó de ser vigente"—
que un fixture sintético solo tiene si alguien ya sospechaba del caso. Correr
el pipeline sobre los 8 archivos reales no es la verificación final: es parte
de la verificación.

---

## 4. Lo que esta verificación NO cubrió

- Las hojas de leche (`PROMEDIO DE LECHE…`, `FLUJO LECHE…`): fuera del alcance
  de esta pasada, con preguntas abiertas sin resolver (no hay día de la semana
  para el formato nuevo, ni año explícito por bloque en `FLUJO LECHE`).
- `GASTOS FOV ENERO 2026 (1).xlsx`: fuera del módulo por diseño.
- No se re-verificaron las hipótesis de `SECAR`/`PP` ni el análisis de `TP`: S2
  ya los midió sobre 1.156 filas y el motor los encapsula.
