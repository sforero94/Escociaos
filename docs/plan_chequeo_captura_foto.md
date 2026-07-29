# Plan — Captura del chequeo: planilla imprimible + subida por foto (OCR)

**Fecha:** 2026-07-29 · **Estado:** plan aprobado en decisiones, pendiente de ejecución
**Origen:** reto planteado por el dueño — la planilla que exporta la app no es imprimible, no
arrastra el estado anterior, y cuando se sube el archivo el sistema no siempre entiende lo escrito.
**Antecedente:** B5 (`docs/hato/sesiones-b5-d7-e3.md`), B0/V10 (flujo de subida `.xlsx`, en producción).

---

## 1. Estado verificado (no supuesto)

Contra el código y contra producción, el 2026-07-29:

| Afirmación | Realidad |
|---|---|
| La planilla no trae el **sexo de la cría** | **Correcto**, y hay un hueco de datos detrás — ver §2. La fecha de la última cría **sí** sale (34/35 vacas activas tienen `ultimo_parto_fecha`); la columna `Sexo cría` sale en blanco (`ChequeosList.tsx:66`). |
| Fecha de servicio / Toro / Estado | También en `null` fijo (`ChequeosList.tsx:67-69`), pese a que la vista los expone: 34/35 con fecha de servicio, 19/35 con toro. Mismo arreglo, misma fase. |
| "No tiene paginación" | `Print_Titles` **sí** se escribe (Excel repite el encabezado al imprimir). Lo que SheetJS Community **no** escribe es `pageSetup` (horizontal, ajuste a ancho), saltos de página **ni ningún estilo de celda** (negrilla, bordes, alto de fila). De ahí el aspecto plano. |
| Ventana de corrección | No existe. `ChequeoDiffReview.tsx` es puramente presentacional; `nuevo` y `no_reconocido` no se pueden aprobar por ningún camino. |

**Habilitador ya pagado:** pre-llenar Fecha Servicio / Última Cría habría sido peligroso hasta hace
una semana — esas fechas repetidas generaban eventos `parto`/`servicio` duplicados. Los bugfixes de
julio 2026 (`agruparPartosPorProximidad`, `fechasServicioConocidas`) ya tratan una fecha repetida como
**marcador de estado, no como evento nuevo**, y la limpieza corrió en producción. La planilla
incremental es segura ahora y no lo era antes.

---

## 2. El sexo de la cría — hueco de datos y cómo se cierra

La celda `SX` de la planilla histórica **no codifica solo el sexo**: codifica sexo **y destino** de la
cría en un código de dos caracteres (`calculosHato.ts::parseSX`, ya en producción y con paridad):

| Código | Significado |
|---|---|
| `OV` | macho, vendido |
| `AV` | hembra, vendida |
| `A{n}` | hembra, **retenida** — `{n}` es la chapeta de la cría |
| `A+` / `O+` | cría muerta (`O+` además es ambiguo con aborto) |
| `gem+` | parto gemelar |

Ese código **se parsea pero nunca se persiste normalizado**: `hato_chequeo_vacas` guarda `sx_raw`
(crudo) y no tiene columna normalizada; `hato_eventos` de tipo `parto` solo lleva `numero_cria` (83
filas) y `gemelar` (1) en `datos` — **no lleva sexo**. Por eso la planilla no lo puede imprimir: no
hay de dónde leerlo sin volver a parsear el crudo.

**El dato es 100% recuperable, verificado en producción:** los **333** eventos `parto` tienen los
tres elementos necesarios — `chequeo_vaca_id` (333/333), `sx_raw` de esa fila (333/333) y fecha.
Distribución: 174 macho vendido · 83 hembra retenida · 20 hembra vendida · 23 muerta/ambigua · el
resto otros códigos.

**Regla de sexo confirmada por el dueño (2026-07-29): `A` = hembra, `O` = macho, `+` = murió (por la
cruz), y el número es la chapeta asignada a esa cría.** La letra inicial define el sexo en **toda** la
familia `A*`/`O*` — `OV` (macho vendido), `AV` (hembra vendida), `A{n}` (hembra retenida, `{n}` =
chapeta de la cría), `A+`/`O+` (murió) — sin excepción y sin ambigüedad. Esto **desacopla** dos
preguntas que el código traía mezcladas en un mismo comentario: la ambigüedad real de `O+`/`A+` que
señala `descomponerSX` (`calculosHato.ts:1382-1415`) es si el evento fue **parto o aborto** (una vaca
puede reportar "cría muerta" sin que haya habido parto) — nunca el sexo, que ya viene resuelto por la
letra. Cuando esa ambigüedad se resuelve como aborto, no hay cría que registrar, así que no hay sexo
que persistir — coherente, no es un caso perdido.

**No es una columna nueva.** `Sexo cría` ya existe en el template (`ENCABEZADOS_PLANILLA_CHEQUEO`,
`FilaPlanillaChequeo.sexoCria`) — hoy está clasificada junto con Fecha Servicio/Toro/Estado/Tratamiento
como columna "que el veterinario actualiza, queda en blanco" (`exportarPlanillaChequeo.ts:46-49`). El
pedido del dueño cambia su tratamiento: pasa a comportarse como **Última Cría** — prefill con el
último valor conocido, editable si Martha registra un parto nuevo en este chequeo. Es el mismo cambio
de patrón que Fecha Servicio/Toro/Estado, no una pieza aparte.

**Cierre en dos movimientos:**

1. **Persistir el sexo/destino en el evento `parto`**, que es a donde pertenece (no a la fila de
   chequeo): `datos.cria_sexo` (`hembra`/`macho`, de la letra) + `datos.cria_destino` (`vendida`/
   `retenida`/`muerta`, ya lo resuelve `parseSX`) + `datos.cria_numero` (la chapeta, ya existe como
   `numero_cria`). Derivado con `parseSX` — nunca un segundo parser. Backfill de los 333 vía
   `chequeo_vaca_id → sx_raw`, y derivación en vivo en el commit path para los que vengan.
2. **Imprimirlo legible** (petición del dueño: "limpiar esa información para que sea más clara a la
   hora de leer"): en vez de reimprimir `OV` / `A 206`, la planilla dice **"Macho (vendido)"** /
   **"Hembra (retenida #206)"**.

> ⚠️ **Tensión de round-trip, resuelta por el cambio a foto.** Mientras la subida era `.xlsx`, todo lo
> impreso tenía que ser re-parseable, así que la etiqueta amigable habría obligado a enseñarle al
> parser un alias nuevo. Con la foto, lo impreso es **para leer** y lo que se carga es lo que Martha
> escribe a mano — la etiqueta legible ya no compromete el parseo. La ruta `.xlsx` de respaldo sí
> necesita el alias; es un mapa chico y va con la Fase 1.

---

## 3. Jobs to be done

| # | Job | Quién | Estado |
|---|---|---|---|
| 1 | Llegar al corral con una hoja legible y escribible a mano | Martha | ❌ |
| 2 | No re-preguntar lo que el sistema ya sabe — ver el último estado y solo anotar cambios | Martha / veterinario | ❌ falta sexo de la cría, fecha de servicio, toro; **Estado sí debe seguir pre-llenado** (confirmado por el dueño — "es el punto") |
| 3 | Que lo impreso se **entienda de un vistazo**, sin descifrar códigos | Martha | ❌ `OV`/`A 206` sin traducir |
| 4 | Pasar del papel al sistema sin transcribir a mano | Martha | ❌ hoy exige retipear en Excel |
| 5 | Aprobar con confianza: ver qué va a cambiar y resolver lo ambiguo sin salir del flujo | Martha | ❌ diff de solo lectura |
| 6 | Que lo aprobado alimente la planilla del próximo chequeo | Sistema | ⚠️ depende de 2 y 5 |

Los jobs 1 y 4 son **dos artefactos distintos** fundidos hoy en un solo `.xlsx`: imprimir quiere un
PDF, cargar quiere datos estructurados. Un `.xlsx` no puede ser las dos cosas.

---

## 4. Decisiones del dueño (2026-07-29)

| # | Decisión |
|---|---|
| **D-A** | La planilla lista **solo el hato — vacas adultas activas** (35 filas), como hoy. *(Corrige una instrucción previa de incluir las 42 novillas: el chequeo se hace solo sobre el hato.)* |
| **D-B** | **PDF para imprimir + foto de la planilla diligenciada para cargar (OCR)**, con un paso de **confirmar los datos leídos** antes del paso de **confirmar el commit**. Elimina la transcripción a Excel. |
| **D-C** | La ventana de corrección permite **editar celdas y resolver ambiguos**: corregir valores mal leídos, fijar la fecha del chequeo, adjudicar colisiones de chapeta y crear la ficha de un animal `nuevo` sin salir del flujo. |
| **D-D** | **Quien escribe en la planilla es Martha**, no el veterinario. Martha también toma la foto, **con su celular y con conexión a internet**. |
| **D-E** | El **sexo de la cría** se imprime, y se imprime en lenguaje claro, no en código. |

**Decisión derivada (asumida y declarada):** la ruta `.xlsx` **se conserva** como respaldo. No se
retira un camino que funciona para estrenar uno no probado; la foto pasa a ser la ruta principal solo
cuando la Fase 0 demuestre que aguanta.

**Consecuencia de D-A que hay que tener presente:** si Martha anota una novilla en la hoja, esa fila
llega como `nuevo` y hoy **no se puede aprobar por ningún camino**. La ventana de corrección (D-C) es
la salida — crear la ficha ahí mismo. Es otra razón por la que D-C no es opcional.

**Lo que D-D mejora, y no es menor:** el OCR ya no enfrenta la letra rotativa de un veterinario
distinto cada vez, sino la de **una sola persona**, consistente en el tiempo y que además conoce los
códigos del formato. Es un salto real de viabilidad para la Fase 0.

---

## 5. Arquitectura — dónde entra la foto

La observación que gobierna todo el diseño:

> **El OCR reemplaza únicamente al parser, no al pipeline.**

El riel que ya existe y está probado en producción es:

```
  fuente → FilaChequeoNormalizada[] → construirDiffChequeo → revisión humana → commit (RPC 065)
```

La ruta `.xlsx` produce `FilaChequeoNormalizada[]` con `importHato/{grilla,chequeos}.ts`. La ruta
foto debe producir **exactamente el mismo tipo**, y de ahí en adelante todo es camino ya construido:
mismo diff, misma ventana de revisión, mismo commit atómico, misma capa cruda. Por eso la Fase 3
sirve a las dos rutas y la foto es un front-end intercambiable, no un segundo sistema.

**Tres propiedades hacen tratable el OCR de escritura a mano:**

1. **La planilla va pre-llenada.** Martha solo escribe en las columnas en blanco. El modelo no lee un
   formulario abierto: lee *deltas* sobre una estructura que el sistema ya conoce.
2. **`#` y `Nombre` van impresos.** Son el ancla de fila. El modelo nunca tiene que descifrar una
   chapeta manuscrita para saber de qué vaca se trata.
3. **El vocabulario es cerrado y conocido.** Los toros salen de `hato_toros`, los códigos SX y estados
   del catálogo del motor, las fechas del formato `D/M/AAAA`. Todo eso viaja en el prompt como
   restricción, no como adivinanza.

**Anti-row-drift (el fallo más peligroso: el dato de una vaca en la fila de otra).** El modelo debe
devolver, por cada fila, el `#` y el `Nombre` **que lee impresos** junto a lo manuscrito. El servidor
los coteja contra lo que realmente imprimió en esa posición; si no coinciden, la fila entera se marca
**no leída** y nunca se desplaza. Validación barata que mata la clase de error más costosa.

**Capa cruda.** La foto **es** la nueva capa cruda — el equivalente del `*_raw` de la ruta `.xlsx`.
Se guarda en Storage (patrón del bucket `facturas`) y se enlaza al chequeo; es la evidencia contra la
cual se audita cualquier duda posterior.

**Captura y confirmación se desacoplan (consecuencia de D-D).** Martha sube desde el celular; la
ventana de corrección **no tiene que resolverse ahí mismo** — la foto ya quedó guardada y el borrador
persiste. Corregir 35 filas en un teléfono es hostil; el flujo debe permitir subir desde el celular y
confirmar después desde el computador, sin perder nada. La subida debe funcionar en móvil; la
corrección se diseña para pantalla grande y se degrada con dignidad en móvil.

---

## 6. Fases

### Fase 0 — Spike de viabilidad del OCR *(primero, antes de construir nada)*

Fotografiar 2–3 planillas reales ya diligenciadas por Martha y pasarlas por el modelo de visión
(`google/gemini-3-flash-preview` vía OpenRouter, ya configurado en el edge function) con el prompt
restringido descrito arriba. Medir **exactitud por celda escrita** y **row drift**.

- **Criterio de aceptación:** ≥95% de celdas escritas correctas y **cero** row drift no detectado.
- **Si pasa:** la foto es la ruta principal, el `.xlsx` queda de respaldo.
- **Si no pasa:** el `.xlsx` sigue siendo la ruta principal y el OCR entra como asistente que
  pre-llena la ventana de corrección. **Las fases 1, 2 y 3 se hacen igual en ambos escenarios** —
  solo cambia cuál ruta se rotula como principal.

Un día de trabajo que decide el orden de todo lo demás. No construir el endpoint antes.

### Fase 1 — Contenido de la planilla

- **Sexo/destino de la cría** (§2): persistir en `hato_eventos.datos` (`cria_sexo`/`cria_destino`)
  derivándolo con `parseSX`, backfill de los 333 partos vía `chequeo_vaca_id → sx_raw`, y derivación
  en vivo en el commit path. Exponerlo en la vista y **imprimirlo en lenguaje claro** (D-E).
- Exponer `ultimo_servicio_fecha`, `ultimo_servicio_toro_id`, `ultimo_tipo_servicio` y
  `ultimo_estado_chequeo` en `useAnimalesParaPlanillaChequeo` y mapearlos en la fila del export. El
  texto de la celda `Toro` se reconstruye con `textoCeldaToro`, **que ya existe** y antepone
  `Toro `/`Ins ` — el prefijo exacto que `parseToro` reconoce. **`Estado` se pre-llena siempre**
  (confirmado por el dueño: es el punto de arrastrar el chequeo anterior) — hoy solo 5 de 35 vacas
  activas tienen `ultimo_estado_chequeo`, así que la mayoría de esa columna sale en blanco al
  arrancar; eso es correcto ("sin dato, nunca inventado"), no un bug, y se va llenando chequeo a
  chequeo a medida que el motor la deriva.
- Universo: **sin cambios**, solo vacas adultas activas (D-A).
- Alias de las etiquetas legibles en el parser `.xlsx` de respaldo.
- Regla intacta: `null` → celda vacía, nunca `0` ni un valor inventado.

Requiere una migración chica (o script de backfill) + desplegar el edge function.

### Fase 2 — PDF imprimible

`jspdf-autotable`, **que ya es dependencia del repo** (no se agrega ninguna). Repite encabezado por
página de forma nativa, horizontal, altos de fila y bordes bajo control.

Requisitos de layout, que son también los que hacen viable el OCR:

- Una fila por vaca, alto fijo, **cada celda escribible con recuadro visible** (el recuadro ancla la
  celda para el modelo).
- **Letra ≥11pt** (confirmado por el dueño — es lo que hoy hace legible la planilla en papel) y
  **35 filas en ~2 páginas** horizontal, que es el punto de referencia real: mismo orden de magnitud
  que la planilla actual, así que el layout nuevo no debe alejarse de ahí sin una razón. Si con el
  sexo de la cría y las columnas ampliadas de la Fase 1 el ancho ya no cabe en 2 páginas a esa letra,
  la salida es **más páginas, nunca letra más chica** — la legibilidad manda sobre el conteo de hojas.
- Columnas pre-llenadas en gris tenue; columnas a diligenciar en blanco con borde marcado.
- Encabezado repetido, número de página, y un **código corto por página** (p. ej. `E7A3-p2`) que
  amarra la foto a este export específico.
- Regla operativa: **nunca comillas de repetición ni "igual"** — cada celda se escribe completa o se
  deja vacía.

### Fase 3 — Carga por foto + ventana de corrección *(el grueso)*

1. **Endpoint nuevo** `POST /make-server-1ccce916/hato/chequeo/foto` (par sincronizado en los dos
   árboles de edge functions, como todo el módulo): recibe las imágenes, llama al modelo de visión,
   valida el ancla de fila, y devuelve `FilaChequeoNormalizada[]` **más** confianza y crudo por celda.
   Guarda las fotos en Storage.
2. **Confianza explícita por celda:** `alta` / `baja` / `no leída`. Baja o no leída se **marca**,
   nunca se rellena. Es "sin dato, nunca 0" aplicado a la lectura.
3. **Ventana de corrección** (`ChequeoDiffReview` editable, sirve a las dos rutas): editar celdas,
   fijar la fecha del chequeo, adjudicar colisiones de chapeta, crear ficha de un animal `nuevo`.
   Re-diffea en cliente con el mismo motor puro y manda las filas corregidas al commit existente.
4. **Sin cambios en el RPC.** El commit ya re-corre `construirDiffChequeo` sobre las filas que envía
   el cliente (`hato-chequeo-commit.ts:279`), no sobre el archivo — un valor corregido en pantalla es
   aceptable por construcción.
5. **Divergencia crudo↔normalizado:** editar una celda hace que el crudo (lo que decía el papel) deje
   de coincidir con el normalizado (lo que resolvió el humano). Eso es **correcto y deseado**, pero
   debe quedar marcado como decisión humana, con la foto guardada como respaldo.

### Fase 4 — Verificación de ciclo cerrado

Extender el test de round-trip: exportar planilla pre-llenada → simular lo que escribe Martha →
cargar → aprobar → **re-exportar** y comprobar que arrastra lo aprobado **sin eventos duplicados**.
Es lo único que prueba que el job 6 existe de verdad.

---

## 7. Riesgos y reglas duras

| Riesgo | Mitigación |
|---|---|
| **Row drift** — el dato de una vaca cae en la fila de otra | El modelo devuelve el `#`/`Nombre` impresos que lee; el servidor los coteja y descarta la fila si no cuadran. Nunca desplaza. |
| El modelo **inventa** un valor plausible en una celda ilegible | Confianza obligatoria por celda; baja o ilegible → se marca, jamás se rellena. |
| Foto borrosa, cortada o mal iluminada | El código de página valida que estén todas las páginas del export; falta una → se dice cuál, no se carga parcial en silencio. |
| Se retira el `.xlsx` antes de tiempo | Se conserva como respaldo hasta que la Fase 0 y un chequeo real completo demuestren la ruta foto. |
| Corregir 35 filas en un celular | Captura y confirmación desacopladas: se sube desde el móvil, se confirma después desde el computador. |
| Un toro nuevo escrito a mano no está en el catálogo | El commit ya hace SELECT-o-INSERT en `hato_toros`; se muestra en la ventana de corrección como alta nueva, para que sea decisión y no efecto colateral. |
| Una **novilla** anotada en la hoja llega como `nuevo` | Crear la ficha desde la ventana de corrección (D-C). Sin eso, la fila se pierde. |

**Reglas que no se negocian** (heredadas del módulo): la foto es capa cruda y se preserva; nada se
descarta en silencio; ninguna fila ambigua se adjudica sola; toda escritura pasa por
`fn_hato_commit_chequeo` (065); los espejos de `importHato/` se regeneran, nunca se editan a mano;
`parseSX` es el único intérprete del código SX en todo el repo.

---

## 8. Preguntas cerradas (2026-07-29)

1. **Sexo en `A+`/`O+`:** `A` = hembra, `O` = macho, `+` = murió, el número es la chapeta de la cría.
   La letra siempre define el sexo, en toda la familia `A*`/`O*` — ver §2, ya reflejado en el diseño
   del backfill.
2. **Columna `Estado` pre-llenada:** sí, es el punto del arrastre incremental. Sale en blanco para las
   30 vacas sin `ultimo_estado_chequeo` hoy — correcto, no es un bug — y se va llenando con el uso.
3. **Tamaño de página:** ~2 páginas a letra ≥11pt es el punto de referencia. Fija el presupuesto de
   ancho de columna de la Fase 2; si las columnas nuevas no caben ahí, se agregan páginas antes que
   reducir la letra.

## 9. Preguntas abiertas
