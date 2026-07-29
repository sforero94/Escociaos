# Plan — Captura del chequeo: planilla imprimible + subida por foto (OCR)

**Fecha:** 2026-07-29 · **Estado:** plan aprobado en decisiones, pendiente de ejecución
**Origen:** reto planteado por el dueño — la planilla que exporta la app no es imprimible, no
arrastra el estado anterior, y cuando Martha sube el archivo el sistema no siempre entiende lo que
ella escribió.
**Antecedente:** B5 (`docs/hato/sesiones-b5-d7-e3.md`), B0/V10 (flujo de subida `.xlsx` ya en producción).

---

## 1. Estado verificado (no supuesto)

Contra el código y contra producción, el 2026-07-29:

| Afirmación | Realidad |
|---|---|
| "El export no incluye la última cría" | **Sí la incluye** (`ChequeosList.tsx:65`), y hay dato: 34 de 35 vacas activas tienen `ultimo_parto_fecha`. |
| "El export no incluye la fecha de servicio" | **Correcto.** `fechaServicio`, `toro` y `estado` están hardcodeados en `null` (`ChequeosList.tsx:67-69`) pese a que la vista los expone (34/35 con servicio, 19/35 con toro). |
| "No tiene paginación" | `Print_Titles` **sí** se escribe (Excel repite el encabezado al imprimir). Lo que SheetJS Community **no** escribe es `pageSetup` (horizontal, ajuste a ancho), saltos de página **ni ningún estilo de celda** (negrilla, bordes, alto de fila). De ahí el aspecto plano. |
| Universo de la planilla | **35 filas.** El filtro es `etapa='vaca' AND estado='activa'` (`useAnimalesParaPlanillaChequeo.ts:63`); las **42 novillas activas** quedan fuera por completo. |
| Ventana de corrección | No existe. `ChequeoDiffReview.tsx` es puramente presentacional; `nuevo` y `no_reconocido` no se pueden aprobar por ningún camino. |

**Habilitador ya pagado:** pre-llenar Fecha Servicio / Última Cría habría sido peligroso hasta hace
una semana — esas fechas repetidas generaban eventos `parto`/`servicio` duplicados. Los tres bugfixes
de julio 2026 (`agruparPartosPorProximidad`, `fechasServicioConocidas`) ya tratan una fecha repetida
como **marcador de estado, no como evento nuevo**, y la limpieza corrió en producción. La planilla
incremental es segura ahora y no lo era antes.

---

## 2. Jobs to be done

| # | Job | Quién | Estado |
|---|---|---|---|
| 1 | Llegar al corral con una hoja legible y escribible a mano | Martha | ❌ |
| 2 | No re-preguntar lo que el sistema ya sabe — ver el último estado y solo anotar cambios | Veterinario | ⚠️ falta Fecha Servicio, Toro, Estado |
| 3 | Que la hoja liste el universo correcto de animales | Martha / vet | ❌ 35 de 77 activas |
| 4 | Pasar del papel al sistema sin transcribir a mano | Quien transcribe | ❌ hoy exige retipear ~77 filas en Excel |
| 5 | Aprobar con confianza: ver qué va a cambiar y resolver lo ambiguo sin salir del flujo | Martha | ❌ diff de solo lectura |
| 6 | Que lo aprobado alimente la planilla del próximo chequeo | Sistema | ⚠️ depende de 2 y 5 |

Los jobs 1 y 4 son **dos artefactos distintos** fundidos hoy en un solo `.xlsx`: imprimir quiere un
PDF, cargar quiere datos estructurados. Un `.xlsx` no puede ser las dos cosas.

---

## 3. Decisiones del dueño (2026-07-29)

| # | Decisión |
|---|---|
| **D-A** | La planilla lista **vacas + novillas** (35 + 42 = 77 filas). Las novillas se sirven y se preñan; hoy son invisibles, y si alguien las escribe a mano llegan como `nuevo` y el commit no las puede escribir. |
| **D-B** | **PDF para imprimir + foto de las anotaciones a mano para cargar (OCR)**, con un paso de **confirmar los datos leídos** antes del paso de **confirmar el commit**. Elimina la transcripción a Excel. |
| **D-C** | La ventana de corrección permite **editar celdas y resolver ambiguos**: corregir valores mal leídos, fijar la fecha del chequeo, adjudicar colisiones de chapeta y crear la ficha de un animal `nuevo` sin salir del flujo. |

**Decisión derivada (no consultada, se asume y se declara):** la ruta `.xlsx` **se conserva** como
respaldo. Nunca se retira un camino que funciona para estrenar uno no probado; la foto se vuelve la
ruta principal solo cuando la Fase 0 demuestre que aguanta.

---

## 4. Arquitectura — dónde entra la foto

La observación que gobierna todo el diseño:

> **El OCR reemplaza únicamente al parser, no al pipeline.**

El riel que ya existe y está probado en producción es:

```
  fuente → FilaChequeoNormalizada[] → construirDiffChequeo → revisión humana → commit (RPC 065)
```

La ruta `.xlsx` produce `FilaChequeoNormalizada[]` con `importHato/{grilla,chequeos}.ts`. La ruta
foto debe producir **exactamente el mismo tipo**, y de ahí en adelante todo es el camino ya
construido: mismo diff, misma ventana de revisión, mismo commit atómico, misma capa cruda. Eso hace
que la Fase 3 (ventana de corrección) sirva a las dos rutas y que la foto sea un front-end
intercambiable, no un segundo sistema.

**Tres propiedades del diseño hacen tratable el OCR de escritura a mano:**

1. **La planilla va pre-llenada.** El veterinario solo escribe en las columnas en blanco. El modelo
   no lee un formulario abierto: lee *deltas* sobre una estructura que el sistema ya conoce.
2. **`#` y `Nombre` van impresos.** Son el ancla de fila. El modelo nunca tiene que descifrar una
   chapeta manuscrita para saber de qué vaca se trata.
3. **El vocabulario es cerrado y conocido.** Los toros salen de `hato_toros`, los estados y códigos
   SX del catálogo del motor, las fechas del formato `D/M/AAAA`. Todo eso viaja en el prompt como
   restricción, no como adivinanza.

**Anti-row-drift (el fallo más peligroso: escribir el dato de una vaca en la fila de otra).** El
modelo debe devolver, por cada fila, el `#` y el `Nombre` **que lee impresos** junto a lo manuscrito.
El servidor los coteja contra lo que realmente imprimió en esa posición; si no coinciden, la fila
entera se marca **no leída** y nunca se desplaza. Es una validación barata que mata la clase de error
más costosa.

**Capa cruda.** La foto **es** la nueva capa cruda — el equivalente del `*_raw` de la ruta `.xlsx`.
Se guarda en Storage (patrón del bucket `facturas`) y se enlaza al chequeo; es la evidencia contra la
cual se audita cualquier duda posterior.

---

## 5. Fases

### Fase 0 — Spike de viabilidad del OCR *(primero, antes de construir nada)*

Fotografiar 2–3 planillas reales ya diligenciadas y pasarlas por el modelo de visión
(`google/gemini-3-flash-preview` vía OpenRouter, ya configurado en el edge function) con el prompt
restringido descrito arriba. Medir **exactitud por celda escrita** y **row drift**.

- **Criterio de aceptación:** ≥95% de celdas escritas correctas y **cero** row drift no detectado.
- **Si pasa:** la foto es la ruta principal, el `.xlsx` queda de respaldo.
- **Si no pasa:** el `.xlsx` sigue siendo la ruta principal y el OCR entra como asistente
  (pre-llena la ventana de corrección, que igual hay que construir). **Las fases 1, 2 y 3 se hacen
  igual en ambos escenarios** — solo cambia cuál ruta se rotula como principal.

Esta fase es de un día y decide el orden de todo lo demás. No construir el endpoint antes.

### Fase 1 — Contenido de la planilla

- Exponer `ultimo_servicio_fecha`, `ultimo_servicio_toro_id`, `ultimo_tipo_servicio` y
  `ultimo_estado_chequeo` en `useAnimalesParaPlanillaChequeo`, y mapearlos en la fila del export.
  El texto de la celda `Toro` se reconstruye con `textoCeldaToro`, que **ya existe** y antepone
  `Toro `/`Ins ` — el prefijo exacto que `parseToro` reconoce, para que el round-trip conserve el
  tipo de servicio.
- Ampliar el universo a vacas + novillas activas (D-A).
- Regla intacta: `null` → celda vacía, nunca `0` ni una fecha inventada.

### Fase 2 — PDF imprimible

`jspdf-autotable`, **que ya es dependencia del repo** (no se agrega ninguna). Repite encabezado por
página de forma nativa, horizontal, altos de fila y bordes bajo control.

Requisitos de layout, que son también los que hacen viable el OCR:

- Una fila por vaca, alto fijo, **cada celda escribible con recuadro visible** (el recuadro es lo que
  ancla la celda para el modelo).
- Columnas pre-llenadas en gris tenue; columnas a diligenciar en blanco con borde marcado.
- Encabezado repetido, número de página, y un **código corto por página** (p. ej. `E7A3-p2`) que
  amarra la foto a este export específico.
- Regla operativa para el veterinario: **nunca comillas de repetición ni "igual"** — cada celda se
  escribe completa o se deja vacía.

### Fase 3 — Carga por foto + ventana de corrección *(el grueso)*

1. **Endpoint nuevo** `POST /make-server-1ccce916/hato/chequeo/foto` (par sincronizado en los dos
   árboles de edge functions, como todo el módulo): recibe las imágenes, llama al modelo de visión,
   valida el ancla de fila, y devuelve `FilaChequeoNormalizada[]` **más** una confianza y el crudo
   por celda. Guarda las fotos en Storage.
2. **Confianza explícita por celda:** `alta` / `baja` / `no leída`. Baja o no leída se **marca**,
   nunca se rellena. Es la misma regla de "sin dato, nunca 0" del resto del módulo, aplicada a la
   lectura.
3. **Ventana de corrección** (`ChequeoDiffReview` editable, sirve a las dos rutas): editar celdas,
   fijar la fecha del chequeo, adjudicar colisiones de chapeta, crear ficha de un animal `nuevo`.
   Re-diffea en cliente con el mismo motor puro y manda las filas corregidas al commit existente.
4. **Sin cambios en el RPC.** El commit ya re-corre `construirDiffChequeo` sobre las filas que envía
   el cliente (`hato-chequeo-commit.ts:279`), no sobre el archivo — un valor corregido en pantalla es
   aceptable por construcción.
5. **Divergencia crudo↔normalizado:** editar una celda hace que el `raw` (lo que decía el papel) deje
   de coincidir con el normalizado (lo que resolvió el humano). Eso es **correcto y deseado**, pero
   debe quedar marcado como decisión humana y con la foto guardada como respaldo.

Requiere una migración chica (enlace chequeo → fotos) y desplegar el edge function.

### Fase 4 — Verificación de ciclo cerrado

Extender el test de round-trip: exportar planilla pre-llenada → simular lo que escribe el veterinario
→ cargar → aprobar → **re-exportar** y comprobar que arrastra lo aprobado **sin eventos duplicados**.
Esto es lo único que prueba que el job 6 existe de verdad.

---

## 6. Riesgos y reglas duras

| Riesgo | Mitigación |
|---|---|
| **Row drift** — el dato de una vaca cae en la fila de otra | El modelo devuelve el `#`/`Nombre` impresos que lee; el servidor los coteja y descarta la fila si no cuadran. Nunca desplaza. |
| El modelo **inventa** un valor plausible en una celda ilegible | Confianza obligatoria por celda; baja o ilegible → se marca, jamás se rellena. Misma regla que "sin dato, nunca 0". |
| Foto borrosa, cortada o mal iluminada | El código de página valida que estén todas las páginas del export; falta una → se dice cuál, no se carga parcial en silencio. |
| Se retira el `.xlsx` antes de tiempo | Se conserva como respaldo hasta que la Fase 0 y un chequeo real completo demuestren la ruta foto. |
| Un toro nuevo escrito a mano no está en el catálogo | El commit ya hace SELECT-o-INSERT en `hato_toros`; se muestra en la ventana de corrección como alta nueva, para que sea una decisión y no un efecto colateral. |

**Reglas que no se negocian** (heredadas del módulo): la foto es capa cruda y se preserva; nada se
descarta en silencio; ninguna fila ambigua se adjudica sola; toda escritura pasa por
`fn_hato_commit_chequeo` (065); los espejos de `importHato/` se regeneran, nunca se editan a mano.

---

## 7. Preguntas abiertas

1. ¿El veterinario escribe sobre la planilla impresa **o** en su propia libreta? El plan asume lo
   primero — es lo que hace tratable el OCR. Si es lo segundo, la Fase 0 cambia de objeto.
2. ¿Quién toma la foto y desde dónde se sube? (Sin internet en la finca, D-4: se asume foto en el
   corral, carga después.) Un flujo desde el celular cambiaría la UI de la Fase 3.
3. ¿Las novillas comparten las mismas columnas que las vacas, o el veterinario les anota otra cosa?
   Afecta el layout del PDF (bloque único vs. dos secciones).
