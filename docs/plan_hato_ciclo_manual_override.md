# S3 — Ciclo reproductivo manual + corrección transversal (T4a + T4b)

Contrato técnico de la sesión S3 de `docs/plan_hato_ronda_agosto_2026.md`.
Autor: CTO, 2026-08-06. Ejecutan: `backend` + `frontend`, con `qa` en paralelo.

Este documento es el brief. **No incluye código de producción**: define el modelo, los contratos, la
migración, el orden de ejecución, los criterios de aceptación y los riesgos.

---

## 0. Entradas que NO se re-discuten

Decisiones del dueño ya tomadas (§0 del plan de la ronda):

- **D-5** — las marcas del ciclo se registran como **eventos**, no como campos que pisan el cálculo.
  **Gana siempre el evento más reciente. Sin capa de override paralela.**
- **D-6** — debe existir corrección de cualquier dato ya registrado, incluso después de guardado.
- **D-7** — solo **Gerencia** edita el ciclo reproductivo.

Hechos verificados contra producción el 2026-08-06 (no re-verificar):

- `hato_eventos.tipo` CHECK admite `servicio, celo, confirmacion_prenez, parto, aborto, secado_real,
  venta, muerte, compra, cambio_etapa, rechequeo`; `fuente` admite `web`. → **T4a no necesita
  migración de esquema.**
- `hato_eventos` contiene hoy solo `servicio` (412), `parto` (300), `aborto` (23). **Cero
  `secado_real`.**
- 80 animales `activa`; el Excel de S1 deja 68.

Reglas del módulo que gobiernan todo lo de abajo (`src/components/hato/CLAUDE.md`, `CLAUDE.md` raíz):

1. Ningún umbral de negocio en código: todo sale de `hato_config`.
2. Ausencia de dato ≠ 0. Sin dato → `—`/`null`. Fecha que no se sabe → `fecha_confianza='desconocida'`,
   nunca una fecha inventada.
3. `calculosHato.ts` y `hatoAlertas.ts` viven en **tres copias**; se cambian en el mismo commit y se
   **regeneran con su script**, jamás a mano.
4. La UI y Esco nunca pueden discrepar en el mismo conteo (`hatoCategorias.ts` ↔ `categorizarAnimal`).
5. "Hoy" siempre en hora local (`obtenerFechaHoy()`), nunca `toISOString().slice(0,10)`.
6. ~~Tailwind congelado: toda clase nueva debe existir en `src/index.css` o entrar como regla real en
   `src/styles/globals.css`.~~ **Superado el 2026-08-06 por F1 de `docs/plan_tailwind_pipeline.md`**:
   el compilador corre en cada build, cualquier utilidad válida funciona y no hay que comprobar nada.
   CSS a mano en `globals.css` solo como excepción y **siempre dentro de `@layer`**. Aplica a todas
   las menciones de "Tailwind congelado" de este documento (criterio 28 y riesgo R-8 incluidos).

---

## 1. T4a — Modelo: las cuatro marcas

### 1.1 Mapeo a `hato_eventos.tipo`

| Marca (UI) | `tipo` | Campos que la distinguen | ¿Tipo nuevo? |
|---|---|---|---|
| **Preñada** | `confirmacion_prenez` | `datos.metodo = 'presuncion'` | no |
| **Confirmada** | `confirmacion_prenez` | `datos.metodo = 'palpacion'` | no |
| **Seca** | `secado_real` | — | no |
| **Parida** | `parto` | `cria_destino` (selector existente), `datos.nota?` | no |

Columnas comunes de las cuatro: `animal_id`, `fecha`, `fecha_confianza` (`exacta` \| `aproximada`),
`fuente='web'`, `created_by` = usuario de la sesión, `datos.origen='marca_manual'`.

### 1.2 Por qué "preñada" NO lleva tipo propio — y por qué eso importa técnicamente

El brief pedía resolver "preñada" sin inventar un `tipo`. Hay una razón mucho más fuerte que evitar
una migración: **`v_hato_estado_actual.ultimo_evento_fecha` es `MAX(fecha)` sobre TODO `hato_eventos`,
de cualquier tipo** (migración 056). Y `derivarEstadoReproductivo` tiene esta salvaguarda:

> si `ultimo_evento_fecha` es posterior al más reciente de los 4 tipos que sabe clasificar
> (`servicio`, `confirmacion_prenez`, `secado_real`, `parto`) → devuelve **`indeterminado`**.

Consecuencia dura: **cualquier evento de un tipo que el motor no clasifique, escrito con fecha de hoy,
tira al animal a `indeterminado`.** Un `tipo='prenez_presunta'` nuevo — o reutilizar `celo`, o
`rechequeo` — no dejaría a la vaca "preñada": la dejaría *indeterminada*, que es literalmente lo
contrario de lo que Martha quiso decir. Esto vale también para T4b y para cualquier sesión futura:
**agregar un `tipo` a `hato_eventos` obliga a decidir, en el mismo commit, cómo lo trata el motor.**

Entre "preñada" y "confirmada" la diferencia es de **evidencia**, no de estado: en las dos la vaca está
preñada; en una lo dice el ojo de Martha y en la otra la palpación del veterinario. El estado derivado
es el mismo (`preñada`, o `proxima_a_secar` si ya entró en ventana de secado) y la evidencia vive en
`datos.metodo`, que la UI muestra como chip ("presunta" / "confirmada"). Es el mismo criterio que el
módulo ya usó con `vacia_es_problema`: **distinguir sin multiplicar los valores de `EstadoReproductivo`.**

**Lo que explícitamente NO se hace:** usar `fecha_confianza` para expresar la confianza *en la preñez*.
Esa columna significa confianza en la **fecha** (`exacta` \| `aproximada` \| `desconocida`) y la usan el
importador, el commit de chequeo y los tres cleanups de partos. Sobrecargarla corrompería un campo con
semántica establecida.

### 1.3 La marca "parida" reemplaza el camino existente

`RegistrarPartoDialog` + `useEventoRapidoHato` (S8) ya escriben un `parto` manual. **Se absorben en el
camino nuevo y se borran** (git conserva la historia). Motivos:

- `useEventoRapidoHato.registrarParto` **no setea `created_by`** — `hato_eventos` no tiene trigger de
  atribución (ninguna de 040/050/063/074 lo cubre) y S9 sí lo setea explícito. Dejar dos caminos con
  atribución distinta para el mismo hecho es deuda gratuita.
- Un solo diálogo = una sola validación, una sola previsualización de estado, una sola forma de auditar.

---

## 2. T4a — Cambios al motor (`calculosHato.ts`)

Tres cambios, todos en `derivarEstadoReproductivo`, todos puros, **ninguno requiere migración**. Van en
las **tres** copias vía `python3 docs/hato/regenerar-copias-servidor.py`.

### 2.1 Desempate determinista cuando dos eventos comparten fecha (obligatorio)

Hoy los candidatos se ordenan solo por fecha:

```
candidatos.sort((a, b) => (a.fecha === b.fecha ? 0 : a.fecha < b.fecha ? 1 : -1));
```

`Array.prototype.sort` es estable (ES2019), así que **en un empate gana el que se insertó primero, que
es `servicio`** — el estado *menos* avanzado del ciclo. Con marcas manuales los empates dejan de ser
teóricos: Martha marca "seca" hoy y el mismo día entra un chequeo que deriva un `servicio` con esa
fecha → la vaca sigue apareciendo en ordeño. **D-5 ("gana el evento más reciente") no está definido a
nivel de día, y hay que definirlo.**

Regla: en empate de fecha gana el evento **más avanzado del ciclo**:

```
parto  >  secado_real  >  confirmacion  >  servicio
```

Justificación biológica: dentro de un mismo día la secuencia solo puede avanzar (no se sirve una vaca
que parió ese día; no se seca una que se confirmó ese día y luego se re-sirvió). **Deliberadamente NO
se desempata por `created_at`**: el commit de un chequeo borra y re-inserta sus eventos derivados
(migración 065), así que su `created_at` siempre es el más nuevo y ganaría todos los empates contra una
marca manual anterior — exactamente el bug que se quiere evitar.

Implementación: mapa de prioridad explícito + comentario, nunca "invertir el orden de los `push`" (un
refactor futuro lo revierte sin darse cuenta).

### 2.2 `confirmacion` / `secado_real` sin servicio ancla → ya no `indeterminado` (obligatorio)

Hoy, si el evento más reciente es `confirmacion_prenez` o `secado_real` y el animal **no tiene ningún
`servicio` registrado**, la función cae en la rama `if (!fila.ultimo_servicio_fecha)` y devuelve
`indeterminado`.

**Esto rompe el objetivo entero de la sesión.** El efecto colateral buscado de D-5 es que la primera
marca `seca` desinfle el conteo de vacas en ordeño. Pero:

- `indeterminado` → `clasificarCategoriaHato('vaca', 'indeterminado')` → **`hato`** (en ordeño).
- Es decir: **para toda vaca sin evento `servicio`, marcarla "seca" no la saca del ordeño.** El lazo
  no se cierra.

Cambio: cuando el más reciente sea `confirmacion` o `secado_real` **sin** `ultimo_servicio_fecha`,
devolver el estado real (`preñada` / `seca`) con **proyecciones en `null`**:

| Campo | Valor |
|---|---|
| `estado` | `preñada` o `seca` (nunca `indeterminado` por esta causa) |
| `fecha_secar`, `fecha_probable_parto` | `null` — no hay ancla, no se inventa |
| `tiempo_prenez_dias` | `null` |
| `tiempo_secada_dias` | días desde `ultimo_secado_real_fecha` (ese dato **sí** existe) |
| `alertas` | solo `rechequeo_due`; `secado_due`/`parto_proximo` en `false` (no hay fecha que comparar) |

Es la aplicación literal de la regla del módulo: *sin dato → `null`, nunca un valor inventado, y nunca
un estado falso*. `hatoAlertas.ts` ya guarda `if (derivado.alertas.secado_due && fila.ultimo_servicio_fecha
&& derivado.fecha_secar)`, así que **no genera alertas basura con este cambio** (verificar en tests, no
asumir).

La rama `indeterminado` **sigue existiendo** para su caso legítimo: `ultimo_evento_fecha` posterior a
los cuatro candidatos (aborto/venta/muerte/celo más recientes). Eso no se toca.

### 2.3 Pre-vuelo obligatorio antes de dar por buena la §2.2

Una consulta, después de que S1 aterrice, para dimensionar el caso:

```sql
SELECT COUNT(*) FROM hato_animales a
WHERE a.estado = 'activa' AND a.etapa = 'vaca'
  AND NOT EXISTS (SELECT 1 FROM hato_eventos e WHERE e.animal_id = a.id AND e.tipo = 'servicio');
```

Si el número es 0, la §2.2 es defensiva y barata igual (se implementa). Si es > 0 — que es lo esperado —
es la diferencia entre que T4a funcione y que no. **El resultado va al PR como evidencia.**

---

## 3. T4a — Contrato de operación

### 3.1 Lógica pura nueva: `src/utils/hatoCicloManual.ts`

Archivo nuevo, **fuera** de `calculosHato.ts` (mismo criterio que `hatoCategorias.ts`: la lógica de
producto no entra al trío protegido por paridad, para no obligar a regenerar copias cada vez que cambie
una etiqueta). Sin imports de Supabase ni de React. Tests en
`src/__tests__/hatoCicloManual.test.ts`.

```ts
export type MarcaCiclo = 'preñada' | 'confirmada' | 'seca' | 'parida';

/** Payload de INSERT en hato_eventos. `created_by` lo agrega el hook. */
construirEventosMarcaCiclo(input): EventoMarcaPayload[]   // 1 o 2 elementos, ver §3.3
validarMarcaCiclo(input, fila, config): ResultadoValidacion // { bloqueos[], advertencias[] }
proyectarEstadoTrasMarca(fila, marca, fecha, config): { antes: EstadoReproductivo; despues: EstadoReproductivo }
```

`proyectarEstadoTrasMarca` construye una `EstadoActualHatoRow` hipotética aplicando la marca y la pasa
por `derivarEstadoReproductivo` — **nunca reimplementa la máquina de estados**. Es lo que alimenta el
"Estado actual → quedará" del diálogo.

### 3.2 Validación: qué bloquea y qué solo advierte

Regla general del módulo: **advertir, no bloquear** (precedente: el chip ámbar de stock negativo en
pajillas, que avisa y nunca impide). Se bloquea únicamente lo que produciría un dato imposible.

**Bloqueos** (el botón Guardar queda deshabilitado, con el motivo visible):

| # | Condición | Motivo |
|---|---|---|
| B1 | `fecha > obtenerFechaHoy()` | No se registran hechos futuros. `obtenerFechaHoy()`, **nunca** UTC. |
| B2 | `hato_animales.estado !== 'activa'` | Un animal vendido/muerto no tiene ciclo. |
| B3 | rol ≠ Gerencia | D-7. |

**Advertencias** (se muestran, se confirman, se guarda igual):

| # | Condición | Texto |
|---|---|---|
| A1 | marca `parida` y ya existe un `parto` a menos de `meses_gestacion_default` meses | "Ya hay un parto registrado el {fecha}. Dos partos en menos de {N} meses no son biológicamente posibles — ¿es una corrección?" |
| A2 | marca `seca` sin señal de preñez (sin `servicio` ni `confirmacion_prenez` posteriores al último parto) | "No hay preñez registrada para esta vaca. Se marcará como seca de todos modos." |
| A3 | existe un evento **posterior** a la fecha de la marca | "Hay un {tipo} registrado el {fecha}, posterior a esta marca. Ese evento seguirá siendo el más reciente." — la marca no tendrá efecto visible; decirlo **antes**, no después. |
| A4 | `preñada`/`confirmada` sin ancla de servicio y sin que Martha aporte una (§3.3) | "Sin fecha de servicio no se puede calcular fecha probable de parto ni de secado. La vaca quedará como preñada, sin fechas." |

A1 usa `meses_gestacion_default` de `hato_config`. **No se introduce una constante de 270 días**
(la migración 080 la usó en un script de una sola vez; aquí sería una constante de negocio en código,
prohibida). `DIAS_MINIMOS_ENTRE_PARTOS = 60` del motor **no se toca ni se reutiliza**: gobierna el
clustering de lecturas de planilla, no la captura manual.

### 3.3 El ancla de servicio para "preñada" / "confirmada"

Marcar preñez sin saber desde cuándo deja al sistema sin poder proyectar `SECAR` ni `parto probable` —
que es justo lo que alimenta las alertas a Fernando. El diálogo, cuando la vaca **no** tiene
`ultimo_servicio_fecha` (o el que tiene es anterior a su último parto), ofrece **tres** salidas, en
este orden:

1. **Fecha de servicio conocida** → se escribe también un `hato_eventos` `tipo='servicio'`,
   `fecha_confianza='exacta'`.
2. **Meses de preñez** (lo que dice el veterinario) → se deriva la fecha de servicio
   (`fecha_marca − meses × 30.44`, la misma aritmética que `calcularMesesPrenez` invertida, en
   `hatoCicloManual.ts`) y se escribe el `servicio` con **`fecha_confianza='aproximada'`**.
3. **Ninguna de las dos** → se escribe solo la confirmación, la vaca queda `preñada` sin fechas
   (§2.2), y se muestra la advertencia A4. **Nunca se inventa una fecha ancla.**

Atomicidad de los casos 1 y 2 (dos eventos): un **único** `.insert([servicio, confirmacion])`.
PostgREST manda un solo `INSERT` con dos filas — una sentencia, una transacción. **No** dos llamadas
sueltas (el patrón de `useRegistrarSalidaHato`, que reporta cuál mitad quedó a medias, existe porque
ahí las dos escrituras van a tablas distintas; aquí no hace falta).

### 3.4 Escritura

`src/components/hato/hooks/useMarcarCicloHato.ts`. `getSupabase() as any` (mismo cast que el resto del
módulo mientras `src/types/database.ts` siga desactualizado). `created_by` explícito desde
`useAuth().user.id` — **`hato_eventos` no tiene trigger de atribución**.

Un solo `INSERT`. Nada de RPC: no hay ninguna escritura cruzada que necesite `SECURITY DEFINER`, la RLS
de escritura de `hato_eventos` (patrón 044) ya cubre a Gerencia, y un DEFINER innecesario es superficie
de ataque gratis (precedente: `fn_cleanup_compra_dependencies`, migración 082).

### 3.5 UI

- **Componente**: `src/components/hato/components/MarcarCicloDialog.tsx`. Un solo diálogo con selector
  segmentado de las 4 marcas + campos contextuales. `DialogContent size="sm"` + `DialogBody` +
  `<form className="flex flex-col flex-1 min-h-0 gap-4">` (contrato de diálogos del `CLAUDE.md` raíz;
  hay un test estático que lo verifica).
- **Cabecera fija del diálogo**: `Estado actual: {antes} → quedará: {despues}` (de
  `proyectarEstadoTrasMarca`). Es lo que hace visible D-5 sin explicárselo a nadie.
- **Puntos de entrada** (los dos, mismo diálogo):
  1. `HojaDeVida.tsx`, en el slot de acciones de `HatoPageHeader`, junto a Registrar venta/muerte.
  2. Acción por fila en `AnimalesList.tsx` — Martha tiene que marcar ~9 vacas seca de un tirón (S6);
     obligarla a abrir 9 fichas es fricción evitable.
- **Gate**: `RoleGuard allowedRoles={['Gerencia']}` con tarjeta de fallback explícita. **El gate es el
  ROL, nunca el resultado de la consulta** (precedente SOW 3). Mientras `useAuth().isLoading`, skeleton
  — no un hueco en blanco (QA FIX 5).
- **RLS no se toca.** Sigue siendo el patrón 044 (Administrador + Gerencia). Hoy ningún Administrador
  puede llegar al módulo (`modulos_acceso = ['aguacate']` en las dos cuentas), así que el delta entre la
  RLS y D-7 es teórico. Endurecer la RLS a Gerencia-only es una migración con radio de impacto sobre el
  commit path y sobre S9: **fuera de alcance, anotado**.

---

## 4. T4b — Decisión de arquitectura: corrección **en sitio con traza**

### 4.1 La decisión

> **Opción A: corrección en sitio, con una traza append-only obligatoria que guarda el valor anterior.**
> Se descarta la Opción B (evento correctivo que supersede al anterior).

### 4.2 Argumento

**1. El módulo ya corrige en sitio en tres de las cuatro superficies. B las volvería inconsistentes.**

| Superficie | Cómo se corrige HOY |
|---|---|
| `hato_pesajes_leche` | `UPDATE` por id (`useProduccionHato.guardarPesajes`) |
| `hato_produccion_quincenal` | `UPDATE`-por-id dentro del RPC `fn_hato_guardar_quincena_venta` (070) |
| `hato_animales` | `UPDATE` por id (`EditarAnimalDialog`, camino oficial de la renumeración de chapetas) |
| `hato_eventos` | **no hay UI** — pero la RLS es `FOR ALL`, así que Gerencia ya puede borrar y editar por PostgREST, **sin traza** |

Adoptar B solo para `hato_eventos` dejaría un módulo donde tres superficies se corrigen editando y una
se corrige apilando. Eso no es pureza arquitectónica: es un modelo mental partido para la única usuaria.

**2. El "append-only" de `hato_eventos` ya no es un invariante, es una descripción histórica.**
`fn_hato_commit_chequeo` (065) **borra y re-inserta** eventos acotados a su chequeo. Las tres rondas de
limpieza de partos borraron 806 + 33 eventos y actualizaron 364 **en sitio**. La de servicios borró 385.
`load.ts` borra por `origen`. Diseñar T4b contra una invariante que el código no sostiene sería
justamente lo aspiracional que el `CLAUDE.md` prohíbe.

**3. B es exactamente la forma que D-5 rechazó, mudada de tabla.** "Un evento que supersede al anterior"
es una capa de override paralela. D-5 dice, para T4a, *sin capa de override paralela*. Montarla en T4b
sería contradecir la decisión del dueño en la tabla de al lado.

**4. B cuesta desproporcionadamente más, y el costo cae en el sitio más delicado.** Para que el motor
ignore un evento superseded, **toda `v_hato_estado_actual` hay que reescribirla**: los seis CTEs
(`ultimo_servicio`, `ultimo_parto` — que además es el `COUNT(*)` de `num_partos` —, `ultimo_secado_real`,
`ultima_confirmacion`, `ultimo_evento`, `ultimo_chequeo`) tendrían que filtrar `anulado`. Y si el evento
correctivo es a su vez una fila de `hato_eventos`, `ultimo_evento` = `MAX(fecha)` **lo recoge y tira al
animal a `indeterminado`** (§1.2). Es decir: B introduce, de fábrica, el mismo bug que §1.2 documenta,
en la vista que alimenta el tablero, las alertas y Esco.

**5. Lo que B protege, A también lo protege — con una traza.** El argumento real de B es "no perder el
valor original". Eso se consigue con una tabla de traza append-only que guarda el `antes` completo, sin
tocar la vista, sin tocar el motor y sin tocar `num_partos`.

### 4.3 Qué se pierde al descartar B (dicho sin adornos)

- **La reconstrucción del estado a una fecha pasada ("¿qué veía el tablero el 1 de agosto?") deja de ser
  una consulta y pasa a ser una reconstrucción manual** desde `hato_correcciones`. Con B saldría de un
  `WHERE anulado_en > fecha`. Hoy nadie pide esa capacidad; si alguna vez se pide, la traza tiene los
  datos para construirla, solo que con trabajo.
- **La corrección no queda en la línea de tiempo del animal como un hecho más.** Con B, "el 12 de agosto
  corregimos la fecha del parto" sería una entrada visible; con A es una consulta a otra tabla. Se
  mitiga: el timeline marca con chip los eventos que tienen correcciones y el detalle las muestra.
- **La traza vive en una tabla aparte, no en la fuente de verdad.** Un `DELETE` sobre
  `hato_correcciones` por `service_role` borraría la historia de correcciones sin dejar rastro. Es el
  mismo nivel de confianza que ya se le da a `service_role` en todo el sistema.

### 4.4 Relación con `fn_hato_commit_chequeo` (065): se apoya, no lo contradice

El brief pregunta explícitamente por esto. La respuesta:

> **065 sigue siendo la autoridad sobre los eventos derivados de SU chequeo. T4b no le disputa ese
> terreno.**

065 borra `hato_eventos WHERE chequeo_vaca_id IN (filas de ese chequeo)`. Por lo tanto:

- Un evento **manual** (`chequeo_vaca_id IS NULL`) es **intocable** por cualquier re-aprobación de
  cualquier chequeo. Las 4 marcas de T4a caen aquí.
- Un evento **derivado de chequeo** (`chequeo_vaca_id IS NOT NULL`) se puede corregir a mano, pero la
  corrección **caduca** si Martha vuelve a aprobar ESE chequeo. Es una consecuencia del diseño de 065,
  no un bug de T4b.

Regla operativa que sale de ahí, y que la UI debe hacer visible con un chip:

> **La corrección de un evento que vino de un chequeo es temporal. Si el dato malo está en la planilla,
> el camino correcto es corregir la planilla y re-subirla (camino 065). Corregir el evento sirve para
> arreglar el ahora.**

**No se toca el contrato de 065 en esta sesión.** Cambiarlo (por ejemplo, para que respete correcciones
manuales sobre sus propios eventos) es una decisión de CTO con su propio análisis de impacto — está
anotada como riesgo R-3, no ejecutada.

### 4.5 Superficie corregible: qué sí y qué no

| Tabla | Editar | Eliminar | Camino | Estado |
|---|---|---|---|---|
| `hato_eventos` | sí (§4.6) | sí | PostgREST por `id` | **nuevo en S3** |
| `hato_pesajes_leche` | sí | **sí** | PostgREST por `id` | editar ya existe; **eliminar es nuevo** |
| `hato_produccion_quincenal` | sí | sí | RPC 070 | ya existe, sin cambios |
| `hato_animales` | sí | no | `EditarAnimalDialog` | ya existe, sin cambios |
| `hato_chequeo_vacas` | **no** | no | re-subida (065) | **fuera de alcance, a propósito** |

**Por qué `hato_chequeo_vacas` queda fuera** (esto es una decisión, no un olvido): editar una celda
normalizada de un chequeo **no re-deriva sus eventos**. Cambiar `fecha_servicio` en la fila del chequeo
dejaría el evento `servicio` con la fecha vieja y la evidencia con la nueva — dos verdades. Construir un
recompute parcial de una fila es reconstruir medio commit path. La línea que se traza:

> **La capa de eventos es la fuente de verdad del estado; la fila de chequeo es evidencia. Corregir la
> evidencia nunca reescribe el estado en silencio.**

Si el OCR leyó mal una fecha de servicio, el camino es corregir **el evento** (una sola escritura, en el
sitio que efectivamente manda) o re-subir la planilla corregida. Y no se pierde nada por no editar ahí:
la capa cruda de esa fila sigue intacta (`hato_chequeo_vacas.*_raw` en la ruta `.xlsx`, la foto del
bucket `chequeos-fotos` de la 072 en la ruta OCR), que es la evidencia contra la que se audita
cualquier duda posterior.

**Eliminar un pesaje es necesario, no un extra.** Hoy `guardarPesajes` solo escribe entradas con valor:
vaciar una celda **no borra la fila**. Si un OCR (S5) inventa un pesaje para una vaca que no se pesó, no
hay forma de quitarlo — y "sin dato" es un estado que el módulo garantiza (`—`, nunca 0). Sin el
`DELETE`, S5 no tiene camino de corrección para su falla más probable.

### 4.6 Qué campos son editables en un evento — y cuál no

Editables: `fecha`, `fecha_confianza`, `tipo_servicio`, `toro_id`, `cria_destino`, `datos.nota`.

**`tipo` NO es editable.** Convertir un `servicio` en un `parto` no es corregir un valor: es afirmar un
hecho distinto bajo el mismo `id`, dejando una traza ilegible (`antes: servicio / después: parto` sobre
la misma fila) y arrastrando columnas que ya no aplican. El camino es **eliminar y crear**, que deja dos
entradas honestas en la traza.

`animal_id` tampoco es editable (mismo argumento: es otro animal, no otro valor).

---

## 5. Migración 083 — `hato_correcciones`

Única migración de S3. **T4a no necesita ninguna.**

Archivo: `src/sql/migrations/083_hato_correcciones.sql`. Siguiente número libre (082 es el último;
recordar que el ledger de Supabase **no es autoritativo** — reconciliar contra el catálogo vivo).

### 5.1 Tabla

`public.hato_correcciones`, append-only:

| Columna | Tipo | Nota |
|---|---|---|
| `id` | uuid PK | |
| `tabla` | text NOT NULL | CHECK IN las 5 tablas con trigger |
| `fila_id` | uuid NOT NULL | |
| `operacion` | text NOT NULL | CHECK IN (`update`, `delete`) |
| `datos_anteriores` | jsonb NOT NULL | `to_jsonb(OLD)` completo |
| `datos_nuevos` | jsonb | `to_jsonb(NEW)`; NULL en `delete` |
| `animal_id` | uuid | desnormalizado, para "correcciones de este animal" sin conocer la forma de cada tabla |
| `motivo` | text | §5.3 |
| `corregido_por` | uuid REFERENCES auth.users(id) | |
| `corregido_en` | timestamptz NOT NULL DEFAULT now() | |

Índices: `(tabla, fila_id)` y `(animal_id, corregido_en DESC)`.

### 5.2 Trigger genérico

`fn_hato_registrar_correccion()`, `AFTER UPDATE OR DELETE FOR EACH ROW`, sobre **cinco** tablas:
`hato_eventos`, `hato_pesajes_leche`, `hato_produccion_quincenal`, `hato_animales`,
`hato_chequeo_vacas`.

Se ponen las cinco aunque solo tres tengan UI de edición nueva: `hato_animales` ya se edita hoy sin
traza (y viene una re-caravanación completa del hato, D-1/D-3), y `hato_chequeo_vacas` es barato dejarlo
cubierto por si alguna vez se toca. Un trigger de auditoría sobre una tabla que nadie edita no cuesta
nada; una edición sin traza sí.

**Por qué un trigger y no un RPC.** Un trigger corre por definición en la misma transacción que la
escritura: **es imposible que exista la corrección sin su traza, o la traza sin la corrección**. Un RPC
exige que todos los llamadores se acuerden de usarlo, y basta un `PATCH` directo para saltárselo. Es el
mismo criterio de "empuja el trabajo repetible a herramienta determinista" que ya se aplicó en
040/050/063/074 para `created_by`.

Reglas del cuerpo:

1. **`IF auth.uid() IS NULL THEN RETURN COALESCE(NEW, OLD); END IF;`** — nada de lo que escriba una ruta
   de máquina se audita: el commit de chequeo (`service_role`, borra y re-inserta por contrato y ya
   tiene su capa cruda), las migraciones (incluida la de S1, que hará ~68 `UPDATE`s sobre
   `hato_animales` y llenaría la tabla de ruido), el bot de Telegram. **La tabla registra correcciones
   humanas hechas desde la app.** Limitación conocida y documentada, idéntica a la de 050/063/074.
2. **No-op**: `IF TG_OP='UPDATE' AND to_jsonb(OLD) = to_jsonb(NEW) THEN RETURN NEW; END IF;`
3. `animal_id` = `to_jsonb(OLD) ->> 'animal_id'`, y `to_jsonb(OLD) ->> 'id'` cuando
   `TG_TABLE_NAME = 'hato_animales'`. Sin SQL dinámico: `to_jsonb` resuelve columnas que no existen en
   todas las tablas sin romper la compilación de plpgsql.
4. `SECURITY DEFINER` (la tabla deniega INSERT a los roles del navegador; el trigger es el único
   escritor) con **`SET search_path = public, pg_temp`** — `pg_temp` al final, obligatorio (migración
   082 parte 3).
5. `REVOKE EXECUTE ... FROM PUBLIC, anon, authenticated` (082 parte 2). **Es seguro**: está verificado
   dos veces contra producción que un trigger dispara aunque el rol que escribe no tenga `EXECUTE` — el
   privilegio se comprueba en `CREATE TRIGGER`, no por disparo.

### 5.3 `motivo`

El trigger lo toma de `to_jsonb(NEW) -> 'datos' ->> 'motivo_correccion'` cuando existe (aplica a
`hato_eventos`, que es donde una corrección más necesita explicación). En `DELETE` y en tablas sin
`datos` queda NULL. No se intenta capturarlo con GUCs de sesión: cada request de PostgREST es su propia
transacción y un `SET LOCAL` no sobrevive. **Quién, cuándo y qué cambió es la parte que sostiene la
auditoría; el porqué es opcional.**

### 5.4 Permisos y RLS

- `ENABLE ROW LEVEL SECURITY`.
- Una sola política: `SELECT TO authenticated USING (TRUE)` — las cinco tablas de origen ya son
  SELECT-authenticated, la traza no expone nada nuevo. Predicados escritos como `(SELECT auth.uid())`
  si los hubiera (migración 077).
- **Sin política de INSERT/UPDATE/DELETE** → denegado para los roles del navegador. El trigger DEFINER
  escribe igual.
- **`REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON hato_correcciones FROM anon, authenticated`.** Esto no
  es decoración: Supabase trae `ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon,
  authenticated`, que es exactamente cómo la migración 081 terminó con un backup expuesto al mundo. La
  RLS y los grants son dos capas distintas y aquí se quieren las dos.
- La tabla va en `public` (no en `respaldos`): es operativa y se lee desde la app; `respaldos` es para
  respaldos forenses que PostgREST no debe exponer.

### 5.5 Guardas de la migración

Patrón 080/081: `RAISE EXCEPTION` si al final no se cumple **todo** esto —

- la tabla existe y tiene RLS activa,
- hay exactamente 1 política (SELECT) sobre ella,
- `has_table_privilege('anon', 'hato_correcciones', 'INSERT')` es `false` (ídem `authenticated`),
- hay exactamente **5** triggers `AFTER UPDATE OR DELETE` apuntando a `fn_hato_registrar_correccion`,
- `prosecdef = true` y `proconfig` contiene `search_path=public, pg_temp` en esa función.

Idempotente (`CREATE TABLE IF NOT EXISTS`, `DROP TRIGGER IF EXISTS` + `CREATE TRIGGER`,
`CREATE OR REPLACE FUNCTION`).

---

## 6. Archivos tocados y orden de ejecución

### Fase 1 — Motor (backend) · **M** · sin dependencias

| Archivo | Qué |
|---|---|
| `src/utils/calculosHato.ts` | §2.1 desempate + §2.2 sin-ancla |
| `src/supabase/functions/server/calculos-hato.ts` | **regenerado** |
| `supabase/functions/make-server-1ccce916/calculos-hato.ts` | **regenerado** |
| `src/__tests__/calculosHato*.test.ts` | casos nuevos |

Comando obligatorio, no edición manual: `python3 docs/hato/regenerar-copias-servidor.py`.
`calculosHatoParidad.test.ts` falla si alguna copia se editó a mano.

Verificar además que `hatoAlertas.ts` (y sus dos copias) **no** cambia de comportamiento; si cambiara,
regenerar con `python3 docs/hato/regenerar-copias-hato-alertas.py`.

> **Milestone M1**: `npm test` verde con los casos nuevos. Nada visible para el usuario todavía.
> Desplegable solo. Requiere `npx supabase functions deploy make-server-1ccce916`.

### Fase 2 — T4a UI (frontend) · **M** · depende de Fase 1

| Archivo | Qué |
|---|---|
| `src/utils/hatoCicloManual.ts` | **nuevo**, puro |
| `src/__tests__/hatoCicloManual.test.ts` | **nuevo** |
| `src/components/hato/hooks/useMarcarCicloHato.ts` | **nuevo** |
| `src/components/hato/components/MarcarCicloDialog.tsx` | **nuevo** |
| `src/components/hato/HojaDeVida.tsx` | punto de entrada |
| `src/components/hato/AnimalesList.tsx` | acción por fila |
| `src/components/hato/components/RegistrarPartoDialog.tsx` | **borrar** (absorbido) |
| `src/components/hato/hooks/useEventoRapidoHato.ts` | **borrar** (absorbido) |

> **Milestone M2**: Martha puede marcar las 4 y ve el "antes → después". Cierra el objetivo de D-5.

### Fase 3 — T4b migración (backend) · **M** · sin dependencias (paralelizable con 1 y 2)

| Archivo | Qué |
|---|---|
| `src/sql/migrations/083_hato_correcciones.sql` | **nuevo** |

Aplicar a producción por el conector de claude.ai (la CLI no tiene la contraseña de BD). Registrar la
verificación post-aplicación en el PR.

> **Milestone M3**: migración aplicada y verificada. Toda edición humana desde la app ya deja traza,
> incluidas las que existen hoy (`EditarAnimalDialog`, `guardarPesajes`, el RPC quincenal).

### Fase 4 — T4b UI (frontend) · **M** · depende de Fase 3

| Archivo | Qué |
|---|---|
| `src/components/hato/components/EditarEventoDialog.tsx` | **nuevo** |
| `src/components/hato/hooks/useCorregirEventoHato.ts` | **nuevo** (update + delete) |
| `src/components/hato/components/EventoTimeline.tsx` | acciones por evento + chip "viene del chequeo" |
| `src/types/hato.ts` | `HatoEventoRow` gana `chequeo_vaca_id` (hoy no está) |
| `src/components/hato/hooks/useHatoAnimal.ts` | traer `chequeo_vaca_id` y las correcciones del animal |
| `src/components/hato/components/PesajeSemanalGrid.tsx` | eliminar pesaje (celda vacía → borrar fila) |
| `src/components/hato/hooks/useProduccionHato.ts` | `eliminarPesaje(id)` |
| `src/components/hato/components/HistorialCorreccionesCard.tsx` | **nuevo**, en Hoja de Vida |

> **Milestone M4**: D-6 cumplido. **S4 y S5 quedan desbloqueadas** — ya hay salida para un OCR
> equivocado.

### Fase 5 — opcional, decidir antes de empezar · **M**

Partos manuales conocidos en el commit path (ver R-3). Solo si el dueño/CPO lo aprueba.

### Paralelización

`backend` corre Fase 1 → Fase 3. `frontend` corre Fase 2 (tras M1) → Fase 4 (tras M3). `qa` escribe los
criterios de §7 **antes** de que backend implemente y trabaja contra ellos en paralelo.

---

## 7. Criterios de aceptación (los escribe `qa` antes de implementar)

### T4a — motor

1. **Desempate.** Fila con `ultimo_servicio_fecha` = `ultimo_secado_real_fecha` = `2026-08-10` →
   `estado === 'seca'`. (Hoy da `servida`.) Las cuatro combinaciones de empate se prueban una por una.
2. **Secado sin ancla.** Fila con `ultimo_parto_fecha` = `2026-01-15`, `ultimo_servicio_fecha` = `null`,
   `ultimo_secado_real_fecha` = `2026-08-06` → `estado === 'seca'`, `fecha_secar === null`,
   `fecha_probable_parto === null`, `tiempo_secada_dias === 0`, `alertas.secado_due === false`.
3. **Confirmación sin ancla** → `estado === 'preñada'`, ambas fechas `null`,
   `tiempo_prenez_dias === null`.
4. **`indeterminado` sobrevive** para su caso legítimo: `ultimo_evento_fecha` posterior a los cuatro
   candidatos.
5. **Cierra el lazo, medido**: sobre un fixture del hato real, contar `categoria === 'hato'` antes y
   después de inyectar `secado_real` en N vacas → baja exactamente en N. **Y lo mismo con
   `categorizarAnimal` de `hato-aggregation.ts`: la UI y Esco dan el mismo número.**
6. **Paridad**: `calculosHatoParidad.test.ts` verde (estructural **y** de comportamiento).
7. **Alertas sin regresión**: `hatoAlertas` no genera ninguna alerta nueva para los casos 2 y 3.

### T4a — captura

8. B1: fecha futura (contra `obtenerFechaHoy()`, **local**) → Guardar deshabilitado. Test de reloj fijo
   a las 21:00 Bogotá que verifique que "hoy" no es mañana.
9. B2/B3: animal no `activa`, o rol ≠ Gerencia → sin camino de escritura. El gate depende del **rol**,
   no de que la consulta devuelva vacío.
10. A1..A4: cada advertencia aparece cuando debe, y **ninguna bloquea** el guardado.
11. `preñada` con "meses de preñez = 3" → se escriben **dos** eventos en **un solo** `insert`, el
    `servicio` con `fecha_confianza='aproximada'` y fecha = marca − 3×30.44 días.
12. `preñada` sin ancla ni datos → se escribe **un** evento, la vaca queda `preñada` sin fechas, A4
    visible.
13. Todo evento escrito lleva `created_by` = usuario de la sesión y `datos.origen='marca_manual'`.
14. `proyectarEstadoTrasMarca` coincide con lo que devuelve `derivarEstadoReproductivo` después de
    guardar de verdad — en los 4 × (estado previo) casos. **Si el "quedará" miente, la función es peor
    que no tenerla.**

### T4a — falsificación de "gana el evento más reciente" (encargo explícito a `qa`)

15. Marca `secado_real` el 2026-08-10 → re-aprobar el chequeo del 2026-07-09 → **la vaca sigue `seca`**
    (los eventos derivados llevan fechas ≤ chequeo, y 065 solo borra los que tienen su
    `chequeo_vaca_id`).
16. Marca `secado_real` el 2026-08-10 → subir un chequeo NUEVO del 2026-08-20 cuya `F Servicio` diga
    `2026-08-15` → la vaca pasa a `servida`. **Correcto por diseño** (el dato posterior dice eso);
    documentado, no un bug.
17. Marca manual `parto` + re-aprobación de un chequeo cuya `Última Cría` describe **ese mismo**
    nacimiento → verificar cuántos `parto` quedan. **Se espera que queden dos** (ver R-3). El test
    documenta el comportamiento real; no se marca verde a la fuerza.
18. Marca retroactiva (fecha anterior a un evento existente) → A3 se muestra **antes** de guardar y el
    estado derivado efectivamente no cambia.

### T4b

19. `UPDATE` sobre cada una de las 5 tablas desde una sesión de navegador → exactamente **una** fila en
    `hato_correcciones`, con `datos_anteriores` completo y `corregido_por` correcto.
20. `DELETE` → una fila con `operacion='delete'` y `datos_nuevos IS NULL`.
21. `UPDATE` que no cambia nada → **cero** filas.
22. Escritura por `service_role` (commit de chequeo, migración) → **cero** filas. Re-aprobar un chequeo
    de 40 vacas no debe dejar 40 filas de traza.
23. `anon` y `authenticated` no pueden `INSERT`/`UPDATE`/`DELETE` sobre `hato_correcciones`
    (`has_table_privilege` = false **y** sin política). Un `SELECT` sí funciona.
24. Editar un evento derivado de chequeo muestra el chip "viene del chequeo del {fecha}" **y** el aviso
    de caducidad, antes de guardar.
25. `tipo` no es editable en ninguna ruta de la UI.
26. Borrar un pesaje: la vaca vuelve a renderizar `—`, **nunca `0`**, en el grid, en el ranking, en el
    tracker y en la curva de la Hoja de Vida.
27. Borrar el último pesaje de una semana no rompe `rangoVacasMedidas` ni deja el tracker en `NaN`.
28. `dialogScrollContract.test.ts` y el guard de Tailwind congelado pasan sobre todos los archivos
    nuevos.

---

## 8. Riesgos

| # | Riesgo | Impacto | Mitigación |
|---|---|---|---|
| **R-1** | El cambio §2.2 altera el estado derivado de animales que hoy salen `indeterminado`, cambiando conteos del tablero y de Esco sin que nadie lo haya pedido. | Medio | El pre-vuelo §2.3 cuantifica cuántos animales cambian **antes** de mergear. Si son > 5, se listan uno por uno en el PR. Criterio 5 mide el delta. |
| **R-2** | El desempate §2.1 cambia el estado de animales con fechas empatadas ya existentes en el histórico. | Medio | Consulta de pre-vuelo: animales con dos eventos de tipos distintos en la misma fecha. Se listan en el PR. |
| **R-3** | **Doble `parto`**: una marca manual `parto` y la re-aprobación de un chequeo que describe el mismo nacimiento producen dos eventos. `num_partos` es un `COUNT(*)`, así que infla el KPI y puede disparar `umbral_partos_reemplazo`. El clustering `agruparPartosPorProximidad` **no ve** los eventos manuales. | **Alto** | (a) Advertencia A1 en captura — obligatoria. (b) Criterio 17 lo documenta. (c) Arreglo de raíz = pasar los partos manuales conocidos al commit path, exactamente la misma forma que el fix de `fechasServicioConocidas` de 2026-07-24: **Fase 5, opcional, decisión del dueño**. **Riesgo preexistente** (el `parto` manual existe desde S8), agravado por S3 al promoverlo. |
| **R-4** | Corregir un evento derivado de chequeo y perderlo en la siguiente re-aprobación. | Medio | Chip + aviso explícito (criterio 24). No se toca 065. |
| **R-5** | La marca `seca` funciona pero Martha marca menos vacas de las que corresponde y el denominador de ordeño queda a medio desinflar — peor que estar claramente mal, porque parece correcto. | Medio | La Producción ya escribe `num_vacas_ordeno` **medido**, no derivado (decisión del dueño 2026-07-28): el número que importa no depende de esto. Además el tablero debe mostrar el conteo de `horro` para que el avance sea visible. |
| **R-6** | `hato_correcciones` crece sin control si alguien automatiza ediciones. | Bajo | Volumen real: correcciones manuales de una usuaria. La guarda `auth.uid() IS NULL` deja fuera todas las rutas de máquina. Revisar si supera ~10k filas. |
| **R-7** | Se descubre a mitad de camino que hay que endurecer la RLS de `hato_eventos` a Gerencia-only. | Bajo | Fuera de alcance por decisión. Hoy ningún Administrador puede llegar al módulo. Si cambia, es su propia migración con análisis del commit path y de S9. |
| **R-8** | Tailwind congelado: clases nuevas en los diálogos que no existen en `index.css` y no aplican **en silencio**. | Medio | Guard estático sobre los archivos nuevos, patrón `hatoProduccionTableroTailwind.test.ts`. |

---

## 9. Decisiones que necesita el dueño (no están en el plan de la ronda)

| # | Pregunta | Por qué importa | Default si no responde |
|---|---|---|---|
| **P-1** | ¿"Preñada" y "confirmada" deben **verse distinto** en el tablero y en los KPIs, o basta con que se distingan en la ficha del animal? | Hoy `HatoReproCard` parte el hato en Preñadas / Servidas / Vacías. Si "preñada presunta" debe contar aparte de "confirmada", son **tres** categorías y hay que tocar la tarjeta, `hatoCategorias.ts` **y** `hato-aggregation.ts` (la UI y Esco no pueden discrepar). | Mismo estado derivado (`preñada`), chip distinto en la ficha. **No** se parte el KPI. |
| **P-2** | ¿Se puede **borrar** un evento, o solo corregirlo? | Borrar es la única salida limpia para un evento creado por error (un parto duplicado, un OCR que inventó un servicio). Con traza, el borrado es reversible a mano. Sin borrado, el error queda para siempre y hay que enseñarle a Martha a "neutralizarlo" editando la fecha, que es peor. | **Se permite borrar**, con confirmación y traza (`datos_anteriores` completo). |
| **P-3** | R-3: ¿se arregla el doble parto en esta ronda (Fase 5) o se acepta la advertencia y se difiere? | Es el único riesgo Alto. Arreglarlo toca el motor (3 copias) y el handler del commit. | Se difiere; la advertencia A1 lo contiene. Se re-plantea en S6, cuando `num_partos` alimente las categorías de D-13. |
| **P-4** | `dias_espera_voluntaria_post_parto` sigue en **60 provisional, sin confirmar** desde la migración 062. | No bloquea S3, pero clasifica vacías como "problema" y S6 va a mandarle alertas a Fernando con ese número. | Se deja en 60 y se marca en Ajustes como provisional. |

---

## 10. Actualizaciones de memoria al cerrar

Al terminar S3, actualizar **`src/components/hato/CLAUDE.md`** (no el raíz — se mantiene chico a
propósito) con:

- El mapeo de las 4 marcas y la razón de §1.2 (**todo `tipo` nuevo en `hato_eventos` obliga a decidir
  cómo lo trata el motor, o el animal cae en `indeterminado`**). Es la trampa más cara de este módulo.
- La regla de desempate por avance de ciclo.
- La regla de precedencia 065 ↔ correcciones manuales (§4.4).
- La frontera "eventos = estado, chequeo = evidencia" (§4.5).

Y **`CLAUDE.md` raíz**, solo la entrada de la migración 083 en la lista de migraciones (una entrada,
con el patrón de las demás: qué hace, por qué, y la guarda `auth.uid() IS NULL`).
