# Plan — Hato Lechero: eventos por Telegram, 5 estados, display y pajillas

**Origen:** visita de campo del dueño a la finca (2026-08-13). Fernando registró en vivo una monta
(vio la vaca en celo y llevó el toro) sin ninguna forma de dejarlo asentado hasta el chequeo
bimensual. De ahí sale todo este alcance.

**Estado del documento:** grafo de trabajo aprobado. Ninguna tarea ejecutada todavía.

---

## 0. Decisiones del dueño (2026-08-13)

Estas cinco respuestas gobiernan el grafo. Cambiar una cambia la forma del grafo, no sólo un nodo.

| # | Decisión | Consecuencia |
|---|---|---|
| **D-A** | **Toros: borrar los no usados, desactivar los usados.** | `DELETE` físico de los toros del catálogo sin referencias; `activo=false` en los que sí aparecen en `hato_eventos`. Quedan activos únicamente los 2 de monta + los 6 de pajillas. La historia (232 servicios) sobrevive intacta. |
| **D-B** | **Telegram escribe directo**, marcado `fuente='telegram'`. | Sin cola de aprobación. El evento existe apenas Fernando lo registra; Martha lo corrige después desde la Hoja de Vida. Rompe la regla D-7 ("solo Gerencia marca el ciclo") para el canal Telegram — decisión explícita, ver R-3. |
| **D-C** | **Pesaje por foto con corrección en texto libre interpretada por Esco.** | El bot muestra la lectura, Fernando responde en lenguaje natural ("MONZA sem 2 AM son 6.5 y BONITA no se pesó"), Esco traduce a celdas, vuelve a mostrar el resumen y **sólo entonces** persiste. |
| **D-D** | **Cinco estados: vacía · servida · confirmada · por secar · seca.** Servida = preñada por presunción. Confirmada = palpada. | El estado ya no absorbe "aborto/indeterminado": eso vive en una **columna de alertas** aparte que dice qué pasó, y el dato se captura **manualmente**. |
| **D-E** | **La planilla del chequeo sale pre-impresa con lo registrado** (ej. "servida 10/ago, toro X") y al lado va la columna de Martha (ok / rech / nota manuscrita). | El chequeo deja de ser captura en blanco y pasa a ser **verificación de lo registrado**. Es el mecanismo de sincronía: lo que Fernando marcó en agosto llega al papel de la vet en agosto. |

**Nombres de los 2 toros de monta (resuelto 2026-08-13):** los animales todavía no tienen nombre
propio; se quedan como **`Jersey`** y **`Ternero Holstein`**. Ambas filas **ya existen** en
`hato_toros`, así que N14 no crea ninguna (ver N14). No queda ningún dato abierto: el grafo está
listo para ejecutarse completo.

---

## 1. Estado real verificado en producción (2026-08-13)

Todo el grafo está dimensionado contra esto, no contra suposiciones:

- `hato_toros`: **63** filas, **61** activas. **52** están referenciadas por **232** eventos de servicio.
  `hato_animales.padre_toro_id` está poblado en **0** filas.
- `hato_pajillas`: **0** filas. `hato_pajillas_uso`: **0**. *No hay inventario que borrar — sólo sembrar.*
- `hato_eventos`: servicio 412 · parto 300 · aborto 23 · venta 21 · **secado_real 10**. **31** eventos
  tienen `chequeo_vaca_id IS NULL` (manuales, intocables por el commit de chequeo).
- `hato_animales`: **65** activos, de los cuales **45** tienen `fecha_nacimiento` (20 no → la columna
  "Edad" nace con 20 celdas en `—`, nunca en 0).
- `hato_pesajes_leche`: 549 filas.
- **El LAZO ABIERTO documentado en `src/components/hato/CLAUDE.md` está cerrado**: los 5 tipos de
  `hato_alertas_config` ya tienen `destinatario_telegram_id = 8505349717` (Santiago) y están activos.
- Telegram: Fernando Jiménez (`8587641614`) ya existe y está activo, con rol **Administrador**.

---

## 2. El grafo

```mermaid
graph TD
  subgraph BASE["Capa 0 · Motor y contratos (bloquea casi todo)"]
    N1["N1 · Migración 094<br/>v_hato_estado_actual expone<br/>metodo de preñez + último aborto"]
    N2["N2 · Motor: 5 estados<br/>derivarEstadoReproductivo<br/>(trío de paridad)"]
    N3["N3 · Etiquetas de 5 estados<br/>+ señal de revisión<br/>(hatoUi)"]
  end

  subgraph TG_EV["Capa 1 · Telegram: eventos"]
    N4["N4 · Selector de vaca<br/>reutilizable (nombre/#,<br/>homónimas)"]
    N5["N5 · /evento monta e<br/>inseminación (+ uso de pajilla)"]
    N6["N6 · /evento secado<br/>(avisa si es antes de lo previsto)"]
    N7["N7 · /evento parto<br/>(sexo/destino de la cría)"]
    N8["N8 · /evento aborto y novedad<br/>(el dato de la columna de alertas)"]
    N9["N9 · Resumen + deshacer<br/>(compartido N5–N8)"]
    N10["N10 · Dedupe chequeo↔manual<br/>(sin esto, cada chequeo<br/>duplica la monta)"]
  end

  subgraph TG_PES["Capa 2 · Telegram: pesaje por foto"]
    N11["N11 · /pesaje por foto<br/>1..6 fotos → OCR → resumen"]
    N12["N12 · Corrección en texto libre<br/>interpretada por Esco"]
    N13["N13 · Persistir por celda<br/>(revalidación + fuente telegram)"]
  end

  subgraph TOROS["Capa 3 · Toros y pajillas"]
    N14["N14 · Migración 095<br/>limpieza del catálogo<br/>(los 2 de monta ya existen)"]
    N15["N15 · Seed de pajillas<br/>6 toros / 27 unidades"]
    N16["N16 · UI: selectores sólo<br/>toros activos"]
  end

  subgraph DISPLAY["Capa 4 · Display del hato"]
    N18["N18 · edadEnAnios (puro)"]
    N19["N19 · proximoEvento (puro)"]
    N17["N17 · AnimalesList: edad · partos ·<br/>última cría · estado · próximo<br/>evento · alerta"]
    N20["N20 · Coherencia Tablero /<br/>Hoja de Vida / Esco"]
  end

  subgraph CHEQ["Capa 5 · Chequeo sincronizado"]
    N21["N21 · Pre-llenado desde la capa<br/>de EVENTOS (no del último chequeo)"]
    N22["N22 · Planilla: columna 'Estado<br/>registrado' + columna de Martha<br/>(ok/rech/nota)"]
    N23["N23 · Diff/commit consciente:<br/>registrado vs. papel = conflicto"]
  end

  subgraph CIERRE["Capa 6 · Cierre"]
    N24["N24 · Tests + paridad de espejos"]
    N25["N25 · Deploy edge fn + curl<br/>a cada ruta nueva"]
    N26["N26 · Aplicar migraciones<br/>a producción"]
    N27["N27 · Destinatarios de alertas<br/>(Fernando en secado/parto)"]
  end

  N1 --> N2 --> N3
  N3 --> N17
  N3 --> N20
  N18 --> N17
  N2 --> N19 --> N17

  N4 --> N5
  N4 --> N6
  N4 --> N7
  N4 --> N8
  N2 --> N8
  N5 --> N9
  N6 --> N9
  N7 --> N9
  N8 --> N9
  N5 --> N10
  N7 --> N10

  N14 --> N15 --> N5
  N14 --> N16
  N15 --> N16

  N11 --> N12 --> N13

  N2 --> N21
  N5 --> N21
  N7 --> N21
  N21 --> N22 --> N23
  N10 --> N23

  N9 --> N24
  N13 --> N24
  N17 --> N24
  N23 --> N24
  N24 --> N25 --> N26
  N6 --> N27
```

**Camino crítico:** `N1 → N2 → N21 → N22 → N23 → N24 → N25 → N26`. Todo lo demás cuelga de él o
corre en paralelo.

---

## 3. Especificación por nodo

### Capa 0 — Motor y contratos

**N1 · Migración 094 — la vista expone el método de preñez y el último aborto**
`v_hato_estado_actual` hoy no distingue una confirmación por palpación de una por presunción, y
D-D las separa en dos estados distintos. Agrega dos columnas al final (`CREATE OR REPLACE VIEW` no
reordena): `ultima_confirmacion_prenez_metodo` (`datos->>'metodo'` de la confirmación más reciente)
y `ultimo_aborto_fecha`. Sin esto, N2 no tiene de dónde leer y N3 no tiene qué mostrar en la
columna de alertas.
*Sin dependencias. Bloquea N2.*

**N2 · Motor: los 5 estados**
`derivarEstadoReproductivo` (`src/utils/calculosHato.ts`, **trío protegido por paridad** — cambiar
en las 3 copias en el mismo commit y regenerar con el script, nunca a mano). Reclasificación:

| Hecho | Estado hoy | Estado nuevo |
|---|---|---|
| Servicio sin confirmar | `servida` | **Servida** |
| `confirmacion_prenez` con `metodo='presuncion'` | `preñada` | **Servida** ← cambia |
| `confirmacion_prenez` con `metodo='palpacion'` | `preñada` | **Confirmada** |
| Dentro de la ventana de secado | `proxima_a_secar` | **Por secar** |
| `secado_real` | `seca` | **Seca** |
| Parió y aún no la sirven | `parida_reciente` | **Vacía** (con la fecha de parto al lado) |
| Sin servicio ni confirmación | `vacia_por_servir` | **Vacía** |
| Evento posterior no clasificable | `indeterminado` | **no es un estado** → señal de revisión (N3) |

Trampa documentada que aplica aquí: `ultimo_evento_fecha` es `MAX(fecha)` sobre **toda** la tabla,
así que un `aborto` o un `celo` con fecha de hoy tira la vaca a `indeterminado`. Por eso N8
(registrar aborto desde Telegram) **depende de este nodo**: hay que decidir en el mismo commit
cómo trata el motor ese evento, o Fernando registrando un aborto rompería el estado de la vaca.
*Depende de N1. Bloquea N3, N8, N19, N21.*

**N3 · Etiquetas y señal de revisión**
`hatoUi.chipEstadoReproductivo` pasa a devolver las 5 etiquetas. Nueva función pura
`senalRevisionHato(fila)` → `{ tipo: 'aborto' | 'evento_posterior' | 'sin_datos', texto }` que
alimenta la columna de alertas de N17. Nunca se disfraza de estado.
*Depende de N2. Bloquea N17, N20.*

### Capa 1 — Telegram: eventos

**N4 · Selector de vaca reutilizable**
Búsqueda por nombre o chapeta, con desambiguación explícita de homónimas (el módulo ya sufrió el
caso MOCA #177/#183). Es la pieza compartida por N5–N8; construirla una vez evita cuatro variantes
que se desincronizan.
*Sin dependencias. Bloquea N5–N8.*

**N5 · `/evento` monta e inseminación**
`hato_eventos` tipo `servicio`, `tipo_servicio` `monta`|`inseminacion` (ambos ya en el CHECK),
`toro_id` del catálogo activo, `fuente='telegram'`. Si es inseminación con pajilla, registra además
`hato_pajillas_uso` contra el lote correspondiente (la vista de stock ya descuenta por uso).
`created_by` se setea **explícito** desde `telegram_usuarios.usuario_id` — el bot escribe con
service_role, donde `auth.uid()` es NULL.
*Depende de N4 y N15 (el selector de toro debe ofrecer 8 toros, no 63).*

**N6 · `/evento` secado**
`secado_real`. Compara la fecha contra la `fecha_secar` derivada por el motor y, si es
apreciablemente antes, lo dice en el resumen ("estás secando 5 semanas antes de lo previsto") sin
bloquear — es exactamente el caso de las 2 vacas de baja producción. Advertir, nunca bloquear:
regla general del módulo.
*Depende de N4.*

**N7 · `/evento` parto**
`parto` + `cria_destino`. Reusa el vocabulario que ya existe (`retenida`, `macho_vendido`,
`hembra_vendida`, `muerta`, `aborto`).
*Depende de N4.*

**N8 · `/evento` aborto y novedad**
Es la mitad que hace verdadera la columna de alertas de D-D: hoy un aborto entra sólo por la
planilla y deja la vaca en `indeterminado` sin explicación. Registrado a mano, la columna dice
"aborto 12/ago" en vez de un estado roto.
*Depende de N4 y **N2**.*

**N9 · Resumen y deshacer**
Cada registro responde con el resumen de lo guardado y un botón "deshacer" que borra el evento
recién creado. Es lo que hace tolerable escribir directo (D-B) sin cola de aprobación.
*Depende de N5–N8.*

**N10 · Dedupe chequeo ↔ evento manual**
El nodo que más silenciosamente puede romper todo. El commit del chequeo (`fn_hato_commit_chequeo`,
migración 065) deduplica servicios contra `seleccionarFechasServicioConocidasPorAnimal` y partos
contra `ultimaCriaAnterior`, y **ambas fuentes leen únicamente `hato_chequeo_vacas`**. La monta que
Fernando registre el 10/ago no está ahí, así que al aprobar el chequeo del 20/ago el sistema
generaría un **segundo** evento de servicio para la misma monta — el mismo bug que ya costó tres
rondas de limpieza en julio (385 servicios y 806 partos duplicados). Hay que extender ambos
lados a leer también `hato_eventos` con `chequeo_vaca_id IS NULL`.
*Depende de N5 y N7. Bloquea N23.*

### Capa 2 — Telegram: pesaje por foto

**N11 · `/pesaje` por foto**
Reemplaza la conversación actual vaca-por-vaca (256 líneas iterando 65 animales por chat: inviable
en el corral). Acepta 1..6 fotos, igual que la ruta web — la planilla real se fotografía por
franjas porque 35 filas en una toma salen ilegibles. La lógica de OCR ya está espejada en el árbol
Deno (`importHato/ocrPesaje.ts`): **no se escribe un segundo lector**.
*Sin dependencias.*

**N12 · Corrección en texto libre (D-C)**
El bot muestra la lectura en texto plano; Fernando confirma o describe el error en lenguaje
natural. Esco traduce a celdas concretas, vuelve a mostrar el resumen corregido, y sólo persiste
tras un "ok" explícito. Nada se escribe antes de esa confirmación.
*Depende de N11.*

**N13 · Persistencia por celda**
Reusa la revalidación de `hato-pesaje-commit.ts` (la vaca sigue en el roster, la fecha sigue siendo
una ocurrencia real del día de pesaje). Commit **por celda**, no todo-o-nada: una celda inválida se
rechaza sola. `fuente='telegram'`, `created_by` explícito.
*Depende de N12.*

### Capa 3 — Toros y pajillas

**N14 · Migración 095 — limpieza del catálogo (D-A)**
Guardada igual que 075/080/081: `RAISE EXCEPTION` si los conteos previos y posteriores no cuadran
exactamente, y respaldo en el esquema **`respaldos`**, nunca en `public` (lección de la alerta
crítica del linter del 2026-08-03). `DELETE` de los toros sin referencias en `hato_eventos` /
`hato_animales`; `activo=false` en los referenciados.

**No da de alta ningún toro de monta: los dos ya existen** (verificado en producción 2026-08-13).

| Fila | raza | tipo | activo hoy | eventos | Qué hace N14 |
|---|---|---|---|---|---|
| `Jersey` | Jersey | monta | sí | **44** | **Nada** — ya está exactamente como se necesita. Excepción explícita a la regla "desactivar los referenciados". |
| `Ternero Holstein` | Holstein | monta | **no** | 0 | **Reactivar** (`activo=true`). |
| `Holstein` *(histórico)* | — | — | sí | **48** | **Desactivar**, como cualquier otro referenciado. |

La tercera fila es la trampa de este nodo. `Holstein` a secas viene de la importación histórica,
donde la planilla escribía sólo la raza cuando el toro no tenía nombre (`parseToro` canonicaliza
`hol/hols/HOLST/…` a un único "Holstein"). **No se fusiona con `Ternero Holstein`**: no hay forma
de saber cuáles de esos 48 servicios corresponden a este ternero, y fusionar sería inventar
historia. Mismo criterio que la regla del módulo "dos nombres en la misma hoja son dos animales,
nunca un rename".

Consecuencia para el índice único: `hato_toros` tiene `UNIQUE (lower(nombre))`, así que un
`INSERT` de "Jersey" o "Ternero Holstein" habría fallado con `23505`. La migración usa
**SELECT-or-UPDATE por id**, nunca un upsert de PostgREST — mismo patrón que ya usa `PajillasView`.
*Sin dependencias. Bloquea N15 y N16.*

**N15 · Seed de pajillas**
6 toros `tipo='inseminacion'` + sus lotes en `hato_pajillas`, **27 unidades en total**:

| Toro | Raza | Pajillas |
|---|---|---|
| Matt | Jersey | 7 |
| Daily Double | Jersey | 5 |
| Ulozon | Normando | 3 |
| Hecker | Holstein | 1 |
| Márquez | Holstein | 1 |
| Valentino | Simental | 10 |

*Depende de N14. Bloquea N5 y N16.*

**N16 · UI de toros y pajillas**
Los selectores (Telegram y web) ofrecen sólo `activo=true`, con raza y tipo visibles. El catálogo
completo sigue consultable para leer la historia.
*Depende de N14 y N15.*

### Capa 4 — Display del hato

**N17 · Columnas nuevas en `AnimalesList`**
Orden pedido: **N.º · Nombre · Edad (años) · # Partos · Última cría · Estado (5) · Próximo evento ·
Alerta · Producción**. Sin fecha de nacimiento → `—`, nunca 0 ni una edad inventada (20 de 65
activos hoy).
*Depende de N3, N18, N19.*

**N18 · `edadEnAnios` (puro)**
Años con un decimal, o `null`. Nodo trivial y sin dependencias: se puede hacer primero.

**N19 · `proximoEvento` (puro)**
El más cercano entre parto probable, secado, rechequeo y "servir", con los días que faltan. El motor
ya calcula las cuatro fechas; este nodo sólo elige y rotula.
*Depende de N2.*

**N20 · Coherencia del resto del módulo**
`HatoReproCard`, `VacasPorEstadoCard`, `hatoCategorias.ts` y **las dos copias de
`hato-aggregation.ts`** (Esco) tienen que hablar el mismo vocabulario. La regla del módulo es dura:
la UI y Esco nunca pueden dar conteos distintos de lo mismo.
*Depende de N3.*

### Capa 5 — Chequeo sincronizado (D-E)

**N21 · Pre-llenado desde la capa de eventos**
La planilla **ya es incremental** (arrastra Fecha Servicio, Toro, Estado). Lo que falta es que esos
valores vengan de `hato_eventos` — incluyendo los manuales de Telegram — y no del último chequeo.
Ese es el mecanismo completo de sincronía que pediste: la monta del 10/ago aparece impresa en el
papel del chequeo del 20/ago para que la vet la verifique.
*Depende de N2, N5, N7.*

**N22 · Columnas nuevas de la planilla**
Una columna **"Estado registrado"** (pre-impresa, gris: lo que el sistema cree) y al lado la
**columna de Martha** (blanca: ok / rech / nota manuscrita). Toca `ENCABEZADOS_PLANILLA_CHEQUEO`,
`COLUMNAS_A_DILIGENCIAR`, los alias del parser en `grilla.ts`, `parseEstado` y el prompt del OCR.
Regla dura: los alias **se agregan**, nunca se reemplazan — el parser tiene que seguir leyendo las
3 generaciones históricas de planillas.
*Depende de N21.*

**N23 · Diff y commit conscientes del estado registrado**
La fila del diff muestra "registrado vs. papel" y marca conflicto explícito cuando difieren. El
evento manual nunca se pisa (ya lo garantiza `chequeo_vaca_id IS NULL`), pero la contradicción se
ve antes de aprobar.
*Depende de N22 y N10.*

### Capa 6 — Cierre

- **N24 · Tests.** Paridad del trío `calculosHato` + espejos de `importHato` + `hatoAlertas`;
  tests puros nuevos de N18/N19/N3; round-trip de la planilla (N22).
- **N25 · Deploy + `curl` a cada ruta nueva.** Un `404 Not Found` en texto plano significa que el
  deploy no incluyó la ruta — es literalmente el incidente del 2026-08-11.
- **N26 · Aplicar N1, N14 y N15 a producción**, verificadas contra el catálogo vivo.
- **N27 · Destinatarios de alertas.** Hoy las 5 alertas van sólo a Santiago. Agregar a Fernando en
  `secado_due` y `parto_proximo` cierra el circuito con el flujo manual de N6. Es configuración, no
  código.

---

## 4. Olas de ejecución (paralelizable)

| Ola | Nodos | Notas |
|---|---|---|
| 1 | N1 · N4 · N11 · N18 · N14 | Cinco frentes sin dependencias entre sí. Nada bloqueado: los 2 toros de monta ya existen en el catálogo. |
| 2 | N2 · N5 · N6 · N7 · N8 · N12 · N15 | N2 es el cuello de botella real del grafo. |
| 3 | N3 · N9 · N10 · N13 · N16 · N19 | |
| 4 | N17 · N20 · N21 | |
| 5 | N22 · N23 | La rama más delicada: toca el parser de las planillas históricas. |
| 6 | N24 · N25 · N26 · N27 | |

---

## 5. Riesgos

| # | Riesgo | Mitigación |
|---|---|---|
| **R-1** | N2 toca el motor protegido por paridad byte-idéntica en 3 copias, y cambia conteos que Esco también reporta. | Regenerar los espejos con el script (nunca editar a mano) y correr la paridad antes de tocar UI. |
| **R-2** | Un `aborto` o `celo` con fecha de hoy tira la vaca a `indeterminado` — la trampa que el módulo ya documenta. | N8 depende de N2 por eso: se decide el tratamiento del evento en el mismo commit que lo habilita. |
| **R-3** | D-B contradice D-7 ("sólo Gerencia marca el ciclo"): Fernando es Administrador y escribe directo por Telegram. | Decisión explícita del dueño. Se mitiga con `fuente='telegram'`, `created_by` real, el deshacer de N9 y la corrección de Martha en la Hoja de Vida. La RLS de la app no cambia. |
| **R-4** | Sin N10, cada chequeo duplica silenciosamente lo que Fernando registró — el bug más caro que ya tuvo este módulo. | N10 va en la misma ola que los flujos que lo causan, no después. |
| **R-5** | Cambiar los encabezados de la planilla puede romper la lectura de planillas históricas. | Alias aditivos + el test de round-trip existente. |
| **R-6** | El bot escribe con service_role: `auth.uid()` es NULL, así que ni los triggers de `created_by` ni la traza de `hato_correcciones` se disparan. | `created_by` explícito desde `telegram_usuarios.usuario_id` en todos los nodos de escritura (N5–N8, N13). |

---

## 6. Lo que este alcance NO incluye

- No se toca la contabilidad ni ninguna ruta de `fin_*`.
- No se reintroduce `PesajeSemanalGrid.tsx` (código muerto deliberado); N11–N13 son el camino de
  Telegram, y el flujo web de Martha sigue como está.
- No se cambia la RLS del módulo ni el gate de módulos por usuario.
- No se re-ejecuta `load.ts` (backfill único, para siempre).
