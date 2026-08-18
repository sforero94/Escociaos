# Brief de producto — Ganado v2: Inventario por finca y Movimientos legibles

**Rutas:** `/ganado` (Inventario) · `/ganado/movimientos` (Movimientos) · **Estado:** definición de producto (pre-diseño técnico) · **Fecha:** 2026-08-17
**Autor:** CPO · **Contratos leídos:** `CLAUDE.md` (raíz, sección *Cattle Inventory Module*), `src/components/finanzas/CLAUDE.md`, migraciones 044/045/059
**Código auditado:** `GanadoDashboard.tsx`, `GanadoMovimientos.tsx`, `GanadoSubNav.tsx`, `useGanadoInventario.ts`, `calculosGanado.ts`, `types/ganado.ts`, `MovimientoFormDialog.tsx`, `ConfirmarPendienteDialog.tsx`

Este documento define **qué** se construye y **por qué**. El **cómo** (DDL, triggers, ubicación de la lógica pura, secuenciación) es del CTO. Hay una pregunta de modelado que dejo explícitamente abierta en §7 con mi recomendación de producto, no con una decisión técnica.

---

## 1. Problema y usuario

**Hoy la página de Inventario es una tabla plana de 34 filas de potrero.** El total por finca no existe en ninguna parte de la app: para saber cuántas cabezas hay en Escocia, el dueño tiene que sumar 17 filas a ojo. La página de Movimientos es un log cronológico donde una sola reorganización de julio (11 traslados) aparece como 22 filas sueltas, sin plata, sin kilos y sin saldo.

**Decisiones concretas que hoy no se pueden tomar con la pantalla:**

| Pregunta del dueño | Por qué no se responde hoy |
|---|---|
| «¿Cuántas cabezas tengo en Carrizal y cómo están repartidas?» | El total por finca no se muestra; hay que sumar potreros manualmente |
| «¿Cuántos animales tengo en ceba listos para vender?» | La etapa productiva solo vive en el **nombre** del potrero ("Andalucía Ceba"), no es un dato sumable |
| «¿Estoy sobrecargando alguna finca?» | `hectareas = 0.00` en las 9 fincas → el KPI cabezas/ha existe y muestra "—" |
| «¿Qué pasó el 2 de julio?» | 22 filas de traslado sueltas; hay que reconstruir mentalmente qué salió de dónde y entró a dónde |
| «¿En cuánto vendí ese lote y a cuántos kilos?» | La plata vive en `fin_transacciones_ganado` y nunca se muestra al lado del movimiento |
| «¿Cómo quedó el potrero después de eso?» | No hay saldo por evento; solo el snapshot de hoy |

**Usuarios:**

- **Gerencia (Santiago) — primario, lectura.** Decide compras, ventas y carga por finca. Entra a mirar, no a capturar. Es quien necesita el total por finca y el desglose por etapa.
- **Administrador (Consuelo / Martha) — primario, escritura.** Captura la transacción en Finanzas y confirma el movimiento pendiente en Inventario. Es el cuello de botella real del puente Finanzas→Inventario.
- **Mayordomo — capturador de campo, indirecto.** Reporta traslados, muertes y conteos. **Pregunta abierta: no está confirmado que tenga cuenta en la app.** Los roles existentes son Gerencia / Administrador / Verificador / Monitor, y `Monitor` está bloqueado por `ProtectedRoute` (solo Telegram). Si el mayordomo no tiene acceso, toda captura pasa por Administrador — lo cual **refuerza** la recomendación de §7. No inventar la respuesta: preguntarla antes de diseñar cualquier flujo de captura nuevo.
- **Verificador — secundario, lectura.** Ve `gan_*` (RLS: SELECT para todo autenticado) pero **no** ve `fin_transacciones_ganado` si no es Gerencia ni Administrador. Ver R-4 en §6.

---

## 2. Decisiones del dueño — CERRADAS

Se transcriben para que ningún implementador tenga que ir a buscarlas. **No son reabribles.**

1. **Desagregación por etapa productiva.** Además de novillos/toros, se debe ver **Terneros · Levante · Ceba · Repele** como dato real y sumable por finca.
2. **Hectáreas solo por finca.** Se llenan las de las 6 fincas activas. A nivel de potrero la carga se muestra **"—"**, nunca 0 y nunca prorrateada.
3. **Movimientos debe mostrar:** (a) el traslado como **una sola fila** «Potrero A → Potrero B · N cabezas»; (b) el **valor $** de compras y ventas traído de `fin_transacciones_ganado`; (c) **kilos y peso promedio** del evento; (d) el **saldo del potrero** después del evento.
4. **Nomenclatura: "Potrero", no "Lote".** En toda la UI del módulo.

---

## 3. Alcance por página

### 3.0 Fase 0 — Compuerta de datos (bloqueante, **no** es una feature)

**Decisión de alcance: la limpieza de datos ENTRA, pero como compuerta previa y con escalada al dueño, no como trabajo de implementación autónomo.**

Justificación: el objetivo de esta iteración es que el número por finca sea **confiable**. Hoy el total de 388 cabezas está mal por 41: `fetchInventario` (`useGanadoInventario.ts:43-80`) filtra por `potrero.activo` pero **no** por `finca.activa`, así que Maryland (18) y Mochuelos (23), marcadas `activa = false`, siguen sumando. Agrupar por finca **empeora** ese bug en vez de esconderlo: el dueño va a ver "Maryland 18" en una finca que él cree cerrada, y va a dejar de creerle a toda la pantalla. Construir la vista jerárquica encima de un total equivocado es gastar la iteración.

Es además trabajo chico — horas, no días. Pero **qué hacer con esas 41 cabezas es decisión del dueño, no del implementador**, porque las dos salidas significan cosas distintas y una de ellas destruye información:

- (a) Los animales están ahí y las fincas se marcaron inactivas por error → **reactivar las fincas**.
- (b) Los animales ya no están → hay que registrar un **movimiento de salida** que lo explique.
- (c) ~~Filtrar por `finca.activa` y ya~~ → **prohibido**. Restaría 41 cabezas del total sin ningún evento que lo justifique, violando la regla del propio módulo de que `gan_movimientos` es la fuente de verdad. El inventario dejaría de ser reconstruible desde su historia.

**Entregable de Fase 0:**

| # | Ítem | Quién decide | Bloquea |
|---|---|---|---|
| F0-1 | Maryland (18) y Mochuelos (23): reactivar finca **o** registrar salida | Dueño | El total y todos los KPIs |
| F0-2 | Fincas basura sin potreros ni cabezas: "Escocia (lote)", "aumento emilio", "Macondo" | Dueño (borrar vs desactivar) | El selector de fincas y la vista jerárquica |
| F0-3 | Hectáreas de las 6 fincas activas | Dueño (dato de campo) | El KPI cabezas/ha, que hoy muestra "—" en todas |
| F0-4 | Etapa de los 34 potreros (ver §7) | Gerencia, una sola vez | Toda la Épica A |
| F0-5 | Corregir `fetchInventario` para respetar `finca.activa` | CTO, **después** de F0-1 | — |

Fase 0 se cierra con una escalada de una sola pantalla al dueño, con opciones seleccionables (no preguntas abiertas).

---

### 3.1 Página **Inventario** (`/ganado`)

**Entra en esta iteración:**

- Vista **jerárquica** ubicación → finca → potrero, reemplazando la tabla plana. La fila de finca es un **resumen real y visible sin desplegar** (cabezas, novillos, toros, desglose por etapa, ha, cabezas/ha), con los potreros colapsables debajo.
- **Desglose por etapa** sumable en el total, por ubicación y por finca, incluyendo el bucket **"Sin clasificar"**.
- **Hectáreas y cabezas/ha solo a nivel finca y ubicación.** Fila de potrero: **"—"**.
- **Filtro por etapa**, sumado a los tres filtros existentes (ubicación / finca / potrero).
- **Corrección de la columna "Peso Prom."**: hoy es engañosa. El trigger 044 hace `COALESCE(EXCLUDED.peso_promedio_kg, …)` — es *el peso del último evento que traía peso*, no un promedio ponderado del potrero. Se reetiqueta a **"Último peso registrado"** con su fecha, o queda en blanco. Se toca igual porque estamos reconstruyendo esa tabla.
- Se conservan: banner de pendientes, Ajuste masivo, Inventario inicial, KPI de variación 30 días.

**Queda fuera (y por qué):**

| Fuera | Razón |
|---|---|
| Edición en línea del inventario | La corrección ya tiene camino: Ajuste masivo, que deja rastro en `gan_movimientos`. Editar en línea lo saltaría |
| Hectáreas por potrero | Decisión cerrada del dueño (§2.2) |
| Gráfico de evolución de etapas en el tiempo | Bajo el modelo recomendado en §7 la etapa **no tiene historia**. Ver R-3 |
| Exportar CSV / PDF | *Could*. Sin demanda expresada |
| Peso individual / pesajes | `gan_pesos_historico` sigue sin UI desde 044. Iteración aparte |
| Costo o rentabilidad por potrero | Vive en `/finanzas/reportes` con el promedio móvil por cabeza de `costoVentaGanado.ts`. **Duplicarlo aquí produciría dos cifras de utilidad distintas** |

---

### 3.2 Página **Movimientos** (`/ganado/movimientos`)

**Entra en esta iteración:**

- **Traslado como una fila** «Potrero A → Potrero B · N cabezas», con la regla anti-invención de §6 (R-2).
- **Columna Valor ($)** para compra y venta, leída vía `gan_movimientos.transaccion_ganado_id` → `fin_transacciones_ganado.valor_total`. Visible por **rol**, no por resultado de consulta (R-4).
- **Kilos y peso promedio del evento** (`kilos_pagados`, `peso_promedio_kg`), con la regla de no fabricar (R-5).
- **Saldo del potrero después del evento** (R-6).
- Banner de pendientes con **antigüedad en días** («pendiente hace 12 días»), para que la deuda de confirmación sea visible y no solo contable.
- Contador **«transacciones de finanzas sin movimiento de inventario»** posteriores al lanzamiento — es a la vez mitigación y métrica (§8.3).

**Queda fuera (y por qué):**

| Fuera | Razón |
|---|---|
| Editar o borrar movimientos confirmados | El log es append-only por diseño; la corrección es un `ajuste` compensatorio. Cambiarlo es una decisión de arquitectura de datos, no de UI |
| Registrar compra/venta desde `/ganado` | **Deliberado.** La plata nace en Finanzas y baja al inventario por el trigger. Un segundo punto de entrada reabre el doble conteo que 044 cerró |
| Backfill de las 92 transacciones históricas sin movimiento | **Non-goal explícito.** Ver R-9 |
| Adjuntar documentos o fotos al movimiento | Sin demanda |
| Registro de traslados por Telegram | *Could*. El tool `get_ganado_inventory` de Esco hoy es solo lectura |

---

## 4. Historias de usuario

> Los criterios Given/When/Then son un **borrador de intención**, no el contrato final: QA los traduce y los endurece, y yo reviso que no se hayan desviado. Si un criterio no se puede verificar como está escrito, la historia está mal escrita — vuelve a mí, no se ajusta el criterio en silencio.

### Épica A — Saber qué tengo y dónde (página Inventario)

**A-1 · Total por finca sin sumar a mano — `Must`**
*Como Gerencia, quiero ver el total de cabezas de cada finca sin abrir sus potreros, para saber de un vistazo cómo está repartido el ganado.*

- **Dado** que Escocia tiene 17 potreros con 216 cabezas, **cuando** abro `/ganado`, **entonces** veo una fila de finca «Escocia · 216 cabezas» con los potreros colapsados debajo.
- **Dado** que expando Escocia, **cuando** sumo las cabezas de sus filas de potrero, **entonces** el resultado es exactamente el total de la fila de finca.
- **Dado** que filtro por la ubicación de Escocia, **cuando** miro el KPI Total Cabezas, **entonces** coincide con la suma de las fincas visibles.
- **Dado** que una finca no tiene potreros con cabezas, **entonces** su fila aparece con 0 cabezas y no desaparece de la lista (0 es un dato aquí: la finca existe y está vacía).

**A-2 · Desglose por etapa productiva — `Must`**
*Como Gerencia, quiero ver cuántos animales hay en Terneros, Levante, Ceba y Repele por finca, para planear ventas y rotación.*

- **Dado** que una finca tiene potreros de Ceba y de Levante, **cuando** miro su fila, **entonces** veo el conteo de cada etapa y su suma iguala el total de la finca.
- **Dado** que un potrero no tiene etapa asignada, **cuando** miro la fila de su finca, **entonces** sus cabezas aparecen bajo **"Sin clasificar"** y **nunca** se reparten ni se adivinan.
- **Dado** que ninguna etapa está configurada todavía, **cuando** abro la página, **entonces** el 100% de las cabezas cae en "Sin clasificar" y veo un aviso accionable «N potreros sin etapa (M cabezas)» — no una pantalla vacía ni un cero.
- **Dado** que filtro por etapa = Ceba, **entonces** solo veo fincas y potreros con cabezas en Ceba, y los KPIs se recalculan sobre ese subconjunto.

**A-3 · Carga por hectárea confiable — `Must`**
*Como Gerencia, quiero ver cabezas/ha por finca, para saber si estoy sobrecargando un potrero.*

- **Dado** que una finca tiene hectáreas cargadas, **cuando** miro su fila, **entonces** veo cabezas/ha con **un** decimal.
- **Dado** que una finca tiene `hectareas = 0`, **entonces** la celda muestra **"—"**, nunca `0,0` ni `∞`.
- **Dado** que miro una fila de **potrero**, **entonces** la celda cabezas/ha muestra **"—"** (decisión §2.2), no el valor heredado de la finca.

**A-4 · El peso que veo es el peso que hay — `Must`**
*Como Gerencia, quiero que la columna de peso diga qué es realmente, para no tomar decisiones de venta sobre un promedio que no existe.*

- **Dado** que un potrero tiene un peso proveniente de un movimiento, **entonces** la columna se titula **"Último peso registrado"** y muestra la fecha de ese evento.
- **Dado** que un potrero nunca recibió un peso, **entonces** la celda muestra **"—"**.

**A-5 · Configurar la etapa de un potrero — `Must`**
*Como Gerencia, quiero asignar la etapa productiva de cada potrero desde Configuración, para que el desglose funcione sin recapturar animales.*

- **Dado** que estoy en Configuración → Ganado, **cuando** edito un potrero, **entonces** puedo elegir Terneros / Levante / Ceba / Repele / sin etapa.
- **Dado** que cambio la etapa de un potrero, **cuando** vuelvo a `/ganado`, **entonces** sus cabezas se movieron de bucket **sin** que se haya creado ningún movimiento (cambiar una etiqueta no es mover animales).
- **Dado** que soy Verificador, **entonces** veo la etapa pero no puedo editarla.

### Épica B — Entender qué pasó (página Movimientos)

**B-1 · El traslado es un solo hecho — `Must`**
*Como Gerencia, quiero ver un traslado como una línea «A → B», para leer una reorganización sin reconstruirla mentalmente.*

- **Dado** un traslado de 12 cabezas de "Encantado Levante" a "La Joya Ceba", **cuando** abro Movimientos, **entonces** veo **una** fila «Encantado Levante → La Joya Ceba · 12 cabezas», no dos.
- **Dado** el día 2026-07-02 con 11 traslados, **entonces** veo 11 filas, no 22.
- **Dado** que una salida y una entrada **no** se pueden emparejar con certeza, **entonces** se muestran como dos filas etiquetadas «Traslado (salida)» y «Traslado (entrada)» — **nunca** se emparejan por aproximación (R-2).
- **Dado** que filtro por finca, **cuando** un traslado sale de esa finca y entra a otra, **entonces** la fila aparece una sola vez y muestra las dos puntas.

**B-2 · La plata al lado del animal — `Must`**
*Como Gerencia, quiero ver en cuánto compré o vendí cada lote, para juzgar la operación sin abrir Finanzas.*

- **Dado** un movimiento de venta vinculado a una transacción, **entonces** la fila muestra el valor total en formato colombiano sin decimales y sin sufijo COP.
- **Dado** un movimiento sin transacción vinculada (ajuste, muerte, traslado), **entonces** la celda de valor muestra **"—"**.
- **Dado** que soy un usuario que no es Gerencia ni Administrador, **entonces** la columna de valor **no se renderiza** — no aparece vacía (R-4).
- **Dado** un movimiento de compra pendiente de confirmar, **entonces** su valor ya es visible en el banner de pendientes (la plata se conoce antes que el potrero).

**B-3 · Kilos y peso del evento — `Should`**
*Como Gerencia, quiero ver los kilos negociados y el peso promedio, para evaluar el precio por kilo.*

- **Dado** una compra con `kilos_pagados`, **entonces** la fila muestra los kilos y el peso promedio del evento.
- **Dado** un evento sin kilos capturados, **entonces** la celda muestra **"—"**. **No** se calcula `peso_promedio × cabezas` para rellenarla (R-5).

**B-4 · Saldo después del evento — `Should`**
*Como Gerencia, quiero ver cómo quedó el potrero después de cada movimiento, para auditar el inventario sin hacer cuentas.*

- **Dado** un movimiento de muerte de 2 cabezas en un potrero que quedó en 40, **entonces** la fila muestra el saldo resultante 40.
- **Dado** un traslado en una sola fila, **entonces** se muestran **dos** saldos: el del potrero origen y el del destino después del evento.
- **Dado** que aplico un filtro de fecha o de tipo, **cuando** miro el saldo, **entonces** el número **no cambia** — se calcula sobre la historia completa del potrero, no sobre lo visible (R-6).
- **Dado** que la historia completa del potrero no se pudo cargar, **entonces** la celda muestra **"—"**, nunca un saldo aproximado.

**B-5 · Deuda de confirmación visible — `Should`**
*Como Administrador, quiero ver hace cuánto está esperando cada pendiente, para no dejar el inventario desfasado de Finanzas.*

- **Dado** un pendiente creado hace 12 días, **entonces** el banner muestra «pendiente hace 12 días».
- **Dado** que hay 0 pendientes, **entonces** el banner no se renderiza.

**B-6 · Filtro por etapa en el log — `Could`**
*Como Gerencia, quiero filtrar movimientos por la etapa del potrero involucrado, para ver solo el flujo de ceba.*

- **Dado** que filtro por etapa = Ceba, **entonces** veo movimientos cuyo potrero origen **o** destino es de Ceba.

### Épica C — No engañarse con los datos

**C-1 · Fincas inactivas resueltas — `Must` (Fase 0)**
*Como Gerencia, quiero que el total de cabezas sea el real, para poder confiar en la pantalla.*

- **Dado** que Maryland y Mochuelos están inactivas con 41 cabezas, **cuando** se cierra Fase 0, **entonces** o las fincas están activas, o existe un movimiento de salida que explica dónde fueron esas 41 cabezas.
- **Dado** que se resolvió, **entonces** ninguna cabeza aparece en el total sin pertenecer a una finca activa, y **ninguna desapareció sin un movimiento que lo registre**.

**C-2 · Fincas basura fuera del selector — `Must` (Fase 0)**

- **Dado** que "Escocia (lote)", "aumento emilio" y "Macondo" no tienen potreros ni cabezas, **cuando** abro cualquier selector de finca, **entonces** no aparecen.

---

## 5. Prioridad (MoSCoW consolidado)

| Prioridad | Historias |
|---|---|
| **Must** | C-1, C-2 (Fase 0) · A-1, A-2, A-3, A-4, A-5 · B-1, B-2 |
| **Should** | B-3, B-4, B-5 |
| **Could** | B-6 · exportar CSV · registro de traslados por Telegram |
| **Won't (esta iteración)** | Trazabilidad por animal individual · historia de etapa en el tiempo · UI de pesajes · edición de movimientos confirmados · backfill de las 92 transacciones históricas · renombrar "Potrero" a "Lote" · costo/rentabilidad por potrero |

Si hay que recortar: **B-4 (saldo) es lo primero que sale** — es lo más caro de calcular bien y lo único de la lista cuya ausencia no rompe una decisión del dueño. **A-2 no se recorta**: es la razón de ser de la iteración.

---

## 6. Reglas de negocio y contratos de visualización

Estas reglas ya existen en el proyecto. Se restablecen porque este módulo las va a tocar todas.

| # | Regla | Consecuencia concreta aquí |
|---|---|---|
| **R-1** | **"Sin dato" se muestra en blanco o "—", NUNCA como 0.** Regla transversal del proyecto (monitoreo, hato, clima). | Cabezas/ha sin hectáreas → "—". Peso nunca registrado → "—". Kilos no capturados → "—". Valor sin transacción → "—". **Un potrero con 0 cabezas sí muestra 0**: ahí el cero es el dato |
| **R-2** | **Nunca inventar un emparejamiento.** Hoy `registrarTraslado` (`useGanadoInventario.ts:167`) hace dos INSERT sin ninguna columna que los enlace. | Emparejar mal inventa un traslado entre dos potreros que nunca intercambiaron animales — peor que mostrar dos filas. Si no hay certeza, se muestran las dos filas. **Cómo se logra la certeza es del CTO** (columna de grupo vs heurística de lectura); el contrato de producto es solo: una fila o dos honestas, jamás una fila adivinada |
| **R-3** | **La etapa es estado actual, no historia.** | Bajo el modelo recomendado en §7, un movimiento pasado se lee con la etapa que el potrero tiene **hoy**. No hay reportes de "cuántas cabezas tenía en ceba en marzo" y no se deben construir |
| **R-4** | **La visibilidad se decide por ROL, no por resultado de consulta.** `fin_transacciones_ganado` tiene SELECT para Gerencia (023) y Administrador (059); `gan_*` tiene SELECT para todo autenticado (044). | Un Verificador con el módulo `ganado` vería la columna $ **vacía** — indistinguible de "no hubo plata". Se oculta la columna leyendo `useAuth().profile.rol`, no se deja en blanco. Es la misma lección que el `CLAUDE.md` raíz documenta para `/finanzas/reportes` |
| **R-5** | **No fabricar cifras derivadas y presentarlas como capturadas.** | `peso_promedio × cabezas` **no** es "kilos". Si `kilos_pagados` es NULL, la celda es "—" |
| **R-6** | **El saldo no depende de los filtros.** | Se calcula sobre la historia confirmada completa del potrero. Un filtro de fecha o tipo cambia **qué filas se ven**, nunca **qué dice la columna saldo** |
| **R-7** | **Formato colombiano** vía `src/utils/format.ts` (`formatNumber`, `formatCurrency`). Sin decimales en dinero, punto de miles, sin sufijo COP. Cabezas siempre enteras; cabezas/ha con 1 decimal; kg sin decimales. **Nunca formatear en línea** | |
| **R-8** | **Los valores son positivos; el signo vive aparte.** Contrato heredado de los reportes financieros. | En Movimientos se muestra «12 cabezas» + una dirección/tipo, no «-12». La representación interna con `novillos_delta` negativo no aflora a la pantalla |
| **R-9** | **`gan_movimientos` es la fuente de verdad; el snapshot es su consecuencia.** | Ninguna corrección de UI puede cambiar el total sin dejar un movimiento. Aplica directo a C-1 |
| **R-10** | **Las 92 transacciones históricas sin movimiento NO se backfillean.** La migración 044 §5 lo dice explícitamente: el trigger es solo `AFTER INSERT`, la historia no genera pendientes. | Crear 92 pendientes hoy generaría movimientos fantasma contra potreros que nadie puede asignar, y **doble conteo**: esos animales ya están en el snapshot vía la carga inicial |
| **R-11** | **Nomenclatura "Potrero"** en toda la UI, incluidos mensajes de error y de vacío | |
| **R-12** | Sistema de diálogos: `DialogContent size=` + `DialogBody`; `<form>` envolvente con `flex flex-col flex-1 min-h-0`. Inputs numéricos con `onWheel={(e) => e.currentTarget.blur()}`. Fechas con `obtenerFechaHoy()`, **nunca** `toISOString().split('T')[0]` | Verificado por `dialogScrollContract.test.ts` y `hatoFechaLocalGuard.test.ts` |

---

## 7. Pregunta abierta de modelado — para el CTO

**La decisión técnica es del CTO. Lo que sigue es la recomendación de producto y el análisis del impacto en el flujo de captura.**

### Las dos opciones

**(a) La etapa es atributo del potrero** — p. ej. `gan_potreros.etapa`.
**(b) La etapa es parte de la fila de inventario** — `gan_inventario` con clave `(potrero, etapa)`.

### Análisis desde el flujo de captura

| Dimensión | (a) Atributo del potrero | (b) Fila de inventario |
|---|---|---|
| **Carga inicial** | 34 etiquetas, una vez, por Gerencia desde Configuración. ~20 son inferibles del nombre actual | Reclasificar **388 cabezas** en 34 potreros × hasta 4 etapas. Conteo físico o estimación |
| **Costo por evento para el capturador** | **Cero.** Cambiar de etapa *es* mover el animal a otro potrero, que ya se registra como traslado | Cada movimiento — incluidas muertes y ajustes — debe declarar la etapa. Impuesto permanente sobre el eslabón más débil |
| **Ajuste masivo** | Sigue en 34 filas | Pasa de 34 filas a hasta 136 celdas |
| **Confirmación de pendientes** | Sin cambios: el potrero ya determina la etapa | Nuevo selector obligatorio de etapa. El trigger de Finanzas no conoce la etapa, así que no puede precargarla |
| **Potreros "General" (mezclan etapas)** | No se pueden etiquetar → sus cabezas caen en "Sin clasificar" | Se pueden representar fielmente |
| **Potreros sin etapa en el nombre** (Bosque, Quebradas, Colinas, Los Olivos) | "Sin clasificar" hasta que Gerencia decida | Igual: alguien tiene que decidir |
| **Riesgo de error silencioso** | Bajo: una etiqueta mal puesta mueve un bloque entero y se nota | Alto: 4 etapas × 2 sexos = hasta 8 buckets por potrero; una etapa mal tecleada parte un lote en dos sin que nada avise |
| **Superficie técnica** | Columna nueva + backfill por nombre. Trigger e índices intactos | `gan_inventario.potrero_id` es UNIQUE → hay que rehacer la clave, el `ON CONFLICT (potrero_id)` del trigger 044, y agregar etapa a `gan_movimientos`. **Ese mismo trigger ya tuvo que reescribirse una vez** (migración 045) por un bug de arbitraje de conflicto |

### Recomendación de producto: **(a), con salida de emergencia**

Cuatro razones, en orden de peso:

1. **Este módulo no rastrea animales, rastrea cabezas por potrero.** No hay `gan_animales` como sí hay `hato_animales`. Si la unidad de inventario es el potrero, la etapa es una propiedad del **lugar**. La opción (b) le pide al modelo una fidelidad de nivel-animal que el resto del módulo no tiene y no va a tener en esta iteración.
2. **El capturador es el cuello de botella, y (b) le cobra en cada evento.** La evidencia está en los números: 94 transacciones en Finanzas contra 2 movimientos de compra/venta en Inventario, 1 pendiente sin confirmar y 1 descartado. El puente ya está subutilizado con el costo actual. Subirlo es apostar contra la evidencia.
3. **La opción (a) hace visible el problema de los "General" en vez de esconderlo.** Bajo (b), un potrero "General" con las 4 etapas mezcladas queda registrado como configuración legítima y se queda así para siempre. Bajo (a), sus cabezas aparecen en "Sin clasificar" con un contador que empuja a partir el potrero — que es lo que operativamente hay que hacer de todos modos, y Configuración ya lo permite.
4. **(a) no cierra la puerta a (b); (b) sí cierra la puerta a (a).** Promover después la etapa del potrero a la fila de inventario es una migración aditiva. Volver de (b) a (a) implica colapsar filas y decidir cuál etapa gana.

**Salida de emergencia:** si aparece un potrero que mezcla etapas de forma permanente y legítima, la solución bajo (a) es **partirlo en dos potreros** desde Configuración. Es reversible, entendible por el mayordomo y no toca el esquema.

**El precio de (a), dicho en voz alta:** la etapa no tiene historia (R-3). Un movimiento de marzo se lee con la etapa que el potrero tiene hoy. Para "qué tengo y dónde" —que es la pregunta del dueño— eso es correcto. Para "cuántas cabezas tenía en ceba en marzo" es directamente falso, y por eso ese reporte queda **fuera de alcance y prohibido de construir** en esta iteración. Si el dueño lo pide después, es la señal para reconsiderar (b).

**Lo que sí necesito del CTO, no de mí:** cómo se garantiza R-2 (el traslado como una fila) — hoy no existe ninguna columna que enlace la salida con la entrada, y las 11 parejas históricas del 2026-07-02 comparten fecha, lo que hace frágil cualquier emparejamiento por aproximación. Y cómo se calcula el saldo de B-4 de forma que no dependa del `.limit(500)` ni de los filtros activos.

---

## 8. Métricas de éxito

Todas medibles con lo que la app ya registra. Sin instrumentación nueva.

| # | Métrica | Línea base (2026-08-17) | Objetivo a 90 días | Fuente |
|---|---|---|---|---|
| 8.1 | **Cabezas con etapa asignada** | 0 de 388 (0%) | ≥ 90% | Suma de cabezas en potreros con etapa ≠ null / total |
| 8.2 | **Fincas activas con hectáreas cargadas** | 0 de 6 | 6 de 6 → el KPI cabezas/ha deja de mostrar "—" | `gan_fincas.hectareas > 0 AND activa` |
| 8.3 | **Brecha Finanzas → Inventario**: pendientes con más de 7 días sin resolver | 1 pendiente (antigüedad desconocida) | 0 | `gan_movimientos` estado `pendiente` + `created_at` |
| 8.4 | **Cabezas fuera de finca activa** (indicador de que el total miente) | 41 | 0 | Cruce `gan_inventario` × `gan_fincas.activa` |
| 8.5 | **Traslados registrados por mes** — proxy de adopción; si nadie mueve, la etapa se congela y el modelo (a) deja de reflejar la realidad | 11 en un solo día (2026-07-02), 0 desde entonces | ≥ 1 traslado en cada uno de 2 meses consecutivos | `gan_movimientos.tipo` |
| 8.6 | **Descuadre en el próximo conteo físico**: Σ\|delta\| del ajuste masivo / total de cabezas | 24 ajustes históricos, magnitud sin medir | Medir esta vez y bajar en el siguiente | `gan_movimientos.tipo = 'ajuste'` |

8.1 y 8.2 se cierran en semanas y son de configuración. **8.3 y 8.5 son las que dicen si el módulo se usa** — y son las que valen.

---

## 9. Riesgos

| # | Riesgo | Prob. | Impacto | Mitigación |
|---|---|---|---|---|
| **R-A** | **Pedirle al usuario recapturar la etapa de 388 cabezas.** Sería un trabajo de campo que nadie va a hacer, y la feature nace muerta con el 100% en "Sin clasificar" | Alta bajo (b) · **Baja bajo (a)** | Crítico | **Es el argumento decisivo de §7.** Bajo (a) no hay recaptura: son 34 etiquetas puestas una vez por Gerencia, ~20 inferibles del nombre. Residual: los potreros "General" quedan sin clasificar — se acepta, se muestra el bucket y se nudgea con «N potreros sin etapa (M cabezas)», sin bloquear nada |
| **R-B** | **El puente con Finanzas sigue sin usarse.** Si nadie confirma pendientes, el inventario se desfasa y la columna $ queda vacía — la mitad del valor de la página nueva | Media | Alto | Banner con antigüedad en días (B-5) + contador de transacciones sin movimiento (§3.2) + métrica 8.3 con objetivo 0. **La columna $ es en sí misma la mitigación**: es la primera vez que confirmar un pendiente produce algo visible para Gerencia. Nota: la brecha 94-vs-2 es en su mayoría histórica y **no se backfillea** (R-10) |
| **R-C** | **El saldo por evento va a exponer descuadres** entre lo que dice el sistema y lo que el mayordomo cree. Se puede leer como «el sistema está mal» y quemar la confianza en el módulo entero | Media | Medio | Es el objetivo, no un efecto secundario — pero hay que anticiparlo. Las filas de `ajuste` se etiquetan como correcciones y la columna se titula explícitamente «saldo según el sistema». Avisarle al dueño **antes** de que lo vea solo |
| **R-D** | **La etapa se congela** (R-3): si nadie registra traslados, la clasificación queda como quedó el día que se configuró y el desglose miente en silencio | Media | Medio | Métrica 8.5 la vigila. En Inventario, mostrar la fecha del último movimiento del potrero para que un potrero estancado sea visible |
| **R-E** | **El emparejamiento de traslados falla** con las 11 parejas del mismo día y se muestra un traslado que nunca ocurrió | Media si se resuelve por heurística | Alto — dato falso | R-2 es innegociable: sin certeza, dos filas. Prefiero una página menos elegante que un movimiento inventado |
| **R-F** | **Fase 0 se salta** «para no bloquear» y la vista jerárquica sale con el total equivocado por 41 cabezas | Media | Alto | Fase 0 es compuerta, no backlog. C-1 y C-2 son `Must`. Y F0-1 requiere decisión del dueño: no hay forma de resolverlo por defecto sin violar R-9 |
| **R-G** | **Expectativa de peso.** Al reetiquetar la columna a "Último peso registrado", el dueño va a ver que prácticamente no hay datos de peso (solo los derivados de `kilos_pagados / cabezas` de 2 transacciones) | Alta | Bajo | Es información correcta reemplazando información engañosa. Decírselo al presentar el brief, no dejar que lo descubra en pantalla. Si le importa, la UI de pesajes (`gan_pesos_historico`, sin UI desde 044) es la siguiente iteración |
| **R-H** | **Colisión de numeración de migración.** Ya pasó 4 veces en este repo; hay una `093` escrita y **sin aplicar**, y el ledger de Supabase no es autoritativo | Media | Bajo | `ls src/sql/migrations/ \| tail -5` antes de crear el archivo, y reconciliar contra el catálogo vivo, no contra `list_migrations` |

---

## 10. Preguntas abiertas (bloquean diseño, no descubrimiento)

1. **¿El mayordomo tiene cuenta en la app?** Determina si el flujo de captura de traslados se diseña para móvil, para Telegram, o si sigue pasando por Administrador. **No asumir.**
2. **F0-1**: ¿Maryland y Mochuelos se reactivan o sus 41 cabezas salieron? Solo el dueño.
3. **F0-2**: las 3 fincas basura, ¿borrar o desactivar? (`gan_fincas` tiene FK desde `gan_potreros`; si están realmente vacías, borrar es limpio).
4. **Etapa de los potreros sin etapa en el nombre** (Bosque, Quebradas, Colinas, Los Olivos) y de los "General": ¿los partimos ahora o los dejamos en "Sin clasificar"? Mi recomendación: dejarlos, medir cuántas cabezas quedan ahí, y decidir con ese número a la vista.

---

*Documento de trabajo. Los criterios Given/When/Then son borrador de intención — QA los formaliza y el CPO revisa que no se hayan desviado de la historia.*
