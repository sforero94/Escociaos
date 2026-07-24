# Limpieza del hato con el inventario final de Martha (MEV) — 2026-07-24

Aplicación a producción del inventario corregido que devolvió Martha
(archivo `inventario hato - respuestas MEV.xlsx`, pestaña **TAREA MEV**), sobre
la carga histórica del 2026-07-23 (168 animales). Cierra el follow-up #5 de la
sección Hato de CLAUDE.md ("102 activas vs. ~45 reales — revisar con Martha").

## Principio: borrado suave, no físico

El dueño pidió "quitar de la base lo vendido/descartado para que quede claro,
pero conservar esos nombres para identificar las madres del hato actual". Las
dos mitades solo son compatibles con **borrado suave** (`estado='vendida'`), no
un `DELETE`:

- La vista del hato filtra `estado='activa'`, así que marcar `vendida` los saca
  de la vista **sin perder la fila**.
- El nombre de la madre vive en `hato_animales.notas` (`Madre (crudo): …`) — al
  no borrar la fila, sigue disponible para la genealogía.

Un `DELETE` habría satisfecho "quitar" pero roto "conservar los nombres". Por eso
todo aquí es reversible y ninguna fila se eliminó.

## Coordinación (no hubo conflicto)

En paralelo corría la sesión de la PR #84 (`claude/hato-lechero-module-43e4dd`,
S6/S9/S10). Se verificó a nivel de código que su trabajo solo escribe
`hato_eventos` (limpieza de partos) y **nunca** `hato_animales.estado/etapa/
numero/notas/madre_id`, que no hay migración ≥067 en producción, y que el
re-Load está prohibido. Esta limpieza tocó únicamente `hato_animales`. Se les
notificó por mensaje entre sesiones.

## Qué cambió en producción (`hato_animales`)

Todo por `UPDATE … WHERE id` (patrón de `useActualizarHatoAnimal`), sin tocar
`notas`, `hato_eventos` ni el pipeline de import.

| Acción | N | Detalle |
|---|---|---|
| Marcadas `vendida` (activa→vendida) | 25 | Martha confirmó vendidas las que la heurística D5 había dejado activas |
| Etapa refinada (todas → `novilla`) | 39 | animales jóvenes que el loader marcó `ternera`/`vaca`, hoy novillas |
| Fichas nuevas creadas | 3 | #181 BRILLANTINA, #182 NORMA, #183 MORA — novillas activas del inventario de Martha, con chapeta reutilizada tras vender el animal en colisión que la portaba. `origen='nacimiento'` asumido, `confianza='media'` |
| `madre_id` resueltos | 85 | ver abajo |

**Estado final del registro (171 filas):** 80 activas (35 vaca + 42 novilla + 3
pendientes) · 91 vendidas · 85 con `madre_id`.

## Resolución de madres (`madre_id`)

Antes, `madre_id` era NULL en todo el hato; la madre solo existía como texto en
`notas`. Se resolvió por coincidencia de nombre contra el propio registro
(incluidas las vendidas — para esto se conservaron), con desempate por fecha de
nacimiento y verificación independiente (madre ≠ hijo, madre nace ≥18 meses
antes, sin ciclos). 104 animales traían nombre de madre; **85 resueltos** (79
alta + 6 desempatados por fecha), 52 de ellos en el hato activo. **Nunca se
adivinó**: los ambiguos y sin coincidencia quedaron sin resolver, para Martha.

## Pendiente de Martha (no se tocó — requiere su criterio)

### Estado/etapa sin confirmar (3)
- **#106 abundantia** — estado en blanco (quedó `activa`, etapa `ternera`)
- **#130 gala** — estado y etapa en blanco (quedó `activa`, `ternera`)
- **#163 VIRGO** — activa, etapa sin marcar (quedó `ternera`)

### Madres sin resolver del hato activo (11)
Sin coincidencia en el registro (la madre es un animal anterior al corpus, no
cargable):
- **#106 abundantia** → "amatista" · **#117 ELECTRA** → "eloisa" ·
  **#121 VEGA** → "victorina" · **#148 GALLEGA** → "VICTORINA"

Ambiguas (dos animales con el nombre de la madre, ambos plausibles):
- **#998 VITROLA** y **#999 ESMERALDA** → "VIDA": candidatas #133 VIDA
  (2018-12) y #137 vida (2019-03). Martha define cuál.

A revisar (la única candidata en el registro es más joven que el hijo → existe
otra madre homónima fuera del registro):
- **#140 AMAPOLA** → "arpa" · **#167 FUERZA** → "FLACA" · **#169 MARIMBA** →
  "MARACA" · **#194 FABULOSA** → "FLACA" · **#208 FLAUTA** → "FLACA"

(8 casos más sin resolver son animales ya `vendida` — menor prioridad, no son
del hato actual.)

## Cómo terminarlo

Todo lo pendiente se corrige **desde la app** (botón Editar en la Hoja de Vida),
no re-corriendo el pipeline. Las colisiones de chapeta vigentes (ESMERALDA/
VITROLA #162, MONA/MARGARITA #175) siguen con número provisional (900–999) hasta
que Martha compre las caravanas nuevas y renumere — su pestaña "Colisiones a
confirmar" quedó sin diligenciar.
