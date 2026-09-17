# Novedades — el bloque que reemplaza "Acciones recomendadas"

**Brief de producto** · 2026-09-16 · CPO
Ruta afectada: `/` (`src/components/Dashboard.tsx` + `src/components/dashboard/*`)

> **Qué reemplaza.** Este documento sustituye el **bloque 4** de
> [`docs/plan_dashboard_centro_control.md`](plan_dashboard_centro_control.md) (§4 y §9.2) y con él
> todo [`docs/plan_motor_acciones_recomendadas.md`](plan_motor_acciones_recomendadas.md). La revisión
> *"seguir o retirar"* que §7.2 de ese documento fijó a las **6 semanas del release** (≈ 2026-09-28)
> **queda resuelta por decisión del dueño, dos semanas antes, en el sentido que ese mismo contrato
> declara: se retira, no se afina.** El bloque nuevo ocupa la misma ranura vertical.
>
> **Y revierte un "no" explícito del plan del tablero** (§5, punto 8: *"Un feed de 'actividad
> reciente' (quién registró qué). Interesante una vez, ruido siempre."*). Esa objeción se contesta en
> §6.1; no se ignora.

> Todos los números salen de producción, medidos el **2026-09-16**. Están puestos a propósito,
> incluidos los feos: son los casos que el diseño tiene que resolver.

---

## 1. El problema, medido

Lo pidió el dueño así: *"Ahora que el hato está al aire, Fernando está notificando cosas
frecuentemente que se actualizan correcta, pero **silenciosamente**."*

El problema no es de recomendación: es de **visibilidad compartida de lo que ya se capturó**. Hoy
cada captura confirma sólo a quien la hizo — el bot de Telegram responde en privado, la web muestra
un toast — y nadie más se entera. Los datos están bien; la gente no.

**Quién escribe, últimos 30 días** (filas · días con captura de 30):

| Fuente | Filas | Días | Quién |
|---|---|---|---|
| `registros_trabajo` (jornales) | 287 | 14 | David García |
| `fin_gastos` | 60 | 5 | Consuelito |
| `hato_pesajes_leche` | 52 | **1** | Martha Vega |
| `monitoreos` | 44 | **1** | David García |
| `hato_tratamientos` | 27 | 4 | Martha 25 · Fernando 2 |
| `hato_eventos` | 26 | 5 | Martha 17 · Fernando 6 · Santiago 1 · **sin autor 2** |
| `movimientos_diarios` | 26 | 9 | David García |
| `movimientos_inventario` | 12 | 3 | correo como texto libre |
| `hato_chequeos` · `informes_visita` · `gan_movimientos` · … | 1 c/u | 1 | Martha · Santiago · Santiago |

**Tres hechos que ordenan el diseño entero:**

1. **La mayoría de los días no pasa nada en la mayoría de las fuentes.** Jornales 14 de 30 días,
   gastos 5 de 30, monitoreo y pesaje **1 de 30**. El feed se diseña para el día vacío y para el día
   de captura masiva, no para un goteo uniforme.
2. **Se captura en lotes.** El 12 de septiembre David guardó **66 filas / 43,5 jornales / 9 personas**
   cubriendo **6 fechas de trabajo** (07-sep → 12-sep). Una línea por fila sería un log; una línea por
   sesión es una frase que se entiende.
3. **Hay un autor claro en casi todo** (~97 % de las filas), y es lo que hace posible "poner a todo el
   mundo en la misma página". El ruido está en `movimientos_inventario` (correo como texto libre) y en
   2 filas de `hato_eventos` sin autor.

**El caso que justifica el feature solo.** La captura del **15 de septiembre** trae 8 jornales de 8
personas con dos fechas de trabajo: **2025-09-14** y 2026-09-14 — un error de tecleo del año. **Nadie
lo vio, y 24 horas después sigue ahí.** Una línea que diga *"trabajo del 14 de septiembre de 2025 al
14 de septiembre de 2026"* lo delata sin una sola línea de inteligencia: sólo mostrando lo guardado.

---

## 2. Qué es una novedad

### 2.1 La definición

> Una **novedad** es un **hecho del negocio que una persona ya escribió en el sistema**, con su
> **autor**, su **momento de captura** y la **fecha del hecho**, que el resto del equipo no tendría
> cómo conocer por su cuenta.

Las cuatro cláusulas matan cuatro familias de basura. *"Ya escribió"* mata la proyección, el umbral y
la recomendación: la novedad es pasado. *"Una persona"* mata el churn del sistema contra sí mismo.
*"Autor y dos fechas"* mata la línea anónima. *"No tendría cómo conocer"* mata el eco de lo que ya
está en pantalla.

### 2.2 El criterio de admisión — cuatro preguntas binarias

Las cuatro dan **sí** o la candidata no entra. Dos personas aplicando la tabla al mismo hecho llegan
al mismo resultado; si alguna admite interpretación, se reescribe.

| # | Pregunta | Pasa | No pasa |
|---|---|---|---|
| **N-1** | ¿Es una **escritura hecha por una persona**? | Martha registra un parto · David guarda 66 jornales | las 59 `hato_alertas` que generó el tick · el rollup diario de clima · las 120 acciones del motor |
| **N-2** | ¿El **objeto es nombrable**? | la vaca ELECTRA (#117) · 9 personas · la ronda del 29 de agosto | "se actualizó una tabla" · un cambio de configuración |
| **N-3** | ¿Aporta algo **que el lector no vea ya en esta misma pantalla**? | el parto de anoche | "el hato va en 15,4 L/vaca" — titular del Pulso · "2 movimientos pendientes" — bloque 1 |
| **N-4** | ¿Se dice en **una línea, con autor y fecha, sin abrir nada**? | *"Consuelito registró 15 gastos del 8 al 11 de septiembre"* | un diff campo por campo — eso es una bitácora de auditoría, y esto no lo es (§6) |

**N-1 hace el trabajo pesado.** Deja fuera de un golpe las 59 alertas que el tick generó en 30 días,
los rollups de clima y las corridas del motor que se retira. Todo eso pasa cada día y nadie lo hizo:
un feed que lo incluya deja de ser "qué hizo el equipo" y pasa a ser "qué hizo el servidor".

**N-3 evita que el bloque se coma a sus vecinos**, y se comprueba mecánicamente contra tres cosas que
ya están en pantalla: las filas del bloque 1, los titulares del Pulso y las señales de Salud de los
datos.

**Una respuesta a una alerta de Telegram no es una novedad.** Lo que entra es el hecho de dominio que
produce —el `secado_real`, el `servicio`—, no el acto de responder: son el mismo hecho contado dos
veces.

### 2.3 Catálogo v1, por fuente

| Fuente | Una línea dice | Grano | Autor | Fecha del hecho | Módulo | |
|---|---|---|---|---|---|---|
| `hato_eventos` (`parto`, `secado_real`, `servicio`, `aborto`, `muerte`, `venta`) | *"Martha registró un servicio de ELECTRA (#117)"* | autor × tipo × día; **hasta 3 nombres**, luego *"y N más"* | `created_by` | `fecha` | `hato_lechero` | **Must** |
| `hato_pesajes_leche` | *"Martha registró el pesaje del 27 de agosto · **52 de 65 vacas**"* | autor × fecha de pesaje | `created_by` | `fecha` | `hato_lechero` | **Must** |
| `hato_tratamientos` | *"Martha registró 3 tratamientos"* | autor × día | `created_by` | `fecha_inicio` | `hato_lechero` | **Must** |
| `hato_chequeos` | *"Martha subió el chequeo del 8 de septiembre · 35 vacas"* | un chequeo | `created_by` | `fecha` | `hato_lechero` | **Must** |
| `registros_trabajo` | *"David registró 66 jornales de 9 personas"* | autor × día | `registrado_por` (074) | rango de `fecha_trabajo` | `aguacate` | **Must** |
| `monitoreos` + `rondas_monitoreo` | *"David registró la ronda del 29 de agosto · 44 lecturas · monitor: Efrain"* | **una ronda** (`ronda_id`, nunca `fecha_monitoreo`) | `user_id` (074) | fechas de la ronda | `aguacate` | **Must** |
| `movimientos_diarios` | *"David registró la ejecución del 15 de septiembre · 2 lotes"* | autor × día | `created_by` | `fecha` | `aguacate` | **Must** |
| `fin_gastos` | *"Consuelito registró 15 gastos"* | autor × día | `created_by` (050) | rango de `fecha` | `finanzas` **+ Gerencia** | **Must** |
| `fin_ingresos` | *"Martha registró un ingreso"* | autor × día | `created_by` (063) | `fecha` | `finanzas` **+ Gerencia** | Should |
| `hato_produccion_quincenal` | *"Martha registró la quincena 2026-08 Q2"* | una quincena | `created_by` (054; `updated_by` desde la 070) | quincena | **Gerencia** (§5) | Should |
| `movimientos_inventario` + `compras` | *"Entrada de 8 kg de Acondicionador sys"* | responsable × tipo × día | `responsable` (**texto libre**) | `fecha` | `aguacate` | Should |
| `aplicaciones` creada · `aplicaciones_cierre` | *"Se cerró la aplicación Drench septiembre"* | una aplicación | `cerrado_por` (correo, 106); `aplicaciones` **no tiene columna de capturador** | inicio / cierre | `aguacate` | Should |
| `fin_transacciones_ganado` + `gan_movimientos` confirmados | *"Santiago registró una venta de 12 cabezas"* | una transacción | `created_by` (050) | `fecha` | `ganado` (valor → Gerencia) | Should |
| `informes_visita` | *"Santiago subió el informe de visita de septiembre"* | un informe | `created_by` | `fecha_visita` | `aguacate` | Should |
| `produccion` (cosecha) | *"Se capturó la cosecha Principal 2026 de 3 lotes"* | día de captura | **ninguno — la tabla no tiene columna de autor** | año/cosecha | `aguacate` | Could |
| `tareas` | *"David creó 2 tareas"* | autor × día | `created_by` (040) | `fecha_estimada_inicio` | `aguacate` | Could |
| Ronda de inventario (`rondas_*`) | *"Uriel cerró la ronda de septiembre · 4 excepciones"* | una ronda | actor de la ronda | fechas de la ronda | `aguacate` | Could |
| **Correcciones** (`hato_correcciones`, `globalgap_correcciones`) | *"Santiago corrigió el evento de COMETA"* | una corrección | `auth.uid()` | — | — | **Fuera de v1 (§2.5)** |

**El catálogo es el costo.** Cada fuente necesita su resolución de autor y su plantilla de frase. La
v1 entrega las **8 Must**, y el bloque se construye de forma que **sumar una fuente no sea un
rediseño**: es una entrada más, con su grano y su plantilla declarados.

**Tres fuentes no tienen de dónde sacar el autor, y por eso ninguna es Must.** `produccion` **no
tiene columna de autor** (verificado contra `src/types/database.ts`), `aplicaciones` tampoco —sólo
`aplicaciones_cierre.cerrado_por`, y es un correo, no una llave—, y `movimientos_inventario` guarda
un correo en texto libre. Sus líneas dirían siempre *"sin autor registrado"* o mostrarían una cadena
cruda. Entran igual (el hecho vale aunque falte el nombre, §4.3), pero **entran después de las 8 que
sí tienen autor**, porque el valor central de este bloque es poner un nombre a cada captura.

### 2.4 Grano: la sesión de captura, no la fila

> **Una línea del feed = un autor × un tipo de hecho × un día de captura (hora Bogotá).**

Es la regla que convierte 66 filas en una frase. La línea declara siempre **el tamaño** (cuántas
filas, cuántos objetos) y **el rango de fechas del hecho**. Nunca parte una sesión ni mezcla dos
autores. Tres precisiones que la regla general no cubre:

- **Cuando el módulo ya tiene su unidad, manda el módulo.** Una ronda de monitoreo es **una** línea
  aunque cruce varios días — es el contrato del módulo. Un chequeo, un informe y una quincena, igual.
- **Cuando el hecho tiene nombre propio, el nombre va en la línea.** Hasta 3; más allá, *"ELECTRA,
  MONZA y 2 más"*. Un parto sin nombre de vaca no sirve para nada.
- **Un denominador obligatorio en su módulo sigue siéndolo aquí.** El pesaje dice *"52 de 65 vacas"*,
  nunca *"52 vacas"* — regla R-4 del hato: una vaca sin pesar no es un 0.

**Por qué no una línea por fila:** el 12 de septiembre habrían sido 66 líneas en la pantalla
principal. **Por qué no una línea por módulo:** *"hubo actividad en aguacate"* no dice quién ni qué,
que es lo único que este bloque tiene que decir.

### 2.5 Qué queda fuera de la v1, y por qué

- **Las correcciones (UPDATE/DELETE).** `hato_correcciones` (084) y `globalgap_correcciones` (113)
  sólo trazan **sesiones de navegador**: retornan temprano con `auth.uid()` NULL, así que una
  corrección hecha por Telegram, por el service role o por una migración **no deja fila**. Un feed que
  muestre unas correcciones y no otras enseña que "no aparece = no pasó", que es falso y es la regla
  *"sin dato nunca es 0"* rota en el sitio donde más se mira. Vuelven cuando la traza sea uniforme, o
  con la brecha declarada en la propia línea.
- **Todo lo que produce un cron** (N-1): las 59 alertas generadas en 30 días, el rollup de clima, las
  corridas del motor que se retira.
- **`logs_auditoria`.** 0 filas y nada la escribe. Cablearla es otra decisión, de otro documento; este
  bloque **no es** una bitácora de auditoría (§6).
- **Cualquier cosa derivada**: KPIs, umbrales, tendencias, proyecciones, faltantes de insumo.
- **Validaciones nuevas en los formularios.** La fila con año 2025 se hace **visible**; impedir que se
  escriba es otro feature, con su propio dueño.

---

## 3. Los tres momentos

Contra los tres momentos de `plan_dashboard_centro_control.md` §2. El contenido no cambia entre
momentos — cambia cuánto se ve sin desplazar.

| Momento | Qué se ve | Por qué sirve |
|---|---|---|
| **A · Barrido de las 6:00** · celular, 60–90 s | Las **3 líneas más recientes**, bajo su encabezado de día | El momento más fuerte del feature. Las capturas del hato por Telegram caen por la tarde-noche (15:43, 21:00): el parto de anoche es exactamente lo que el dueño pidió |
| **B · El lunes** · escritorio, 5–15 min | La ventana de 7 días entera, agrupada por día | El registro de la semana: quién capturó qué y cuándo, con sus rangos de fechas |
| **C · Antes de una conversación** · celular, 2–3 min | Lo mismo, leído buscando a una persona | *"¿qué registró David esta semana?"* se contesta barriendo. **Sin filtro por persona** (§5) |

**Posición: la misma ranura que deja el bloque 4**, entre *Pulso por negocio* y *Dinero*. Es su sitio
natural: el Pulso dice **cómo va** (estado) y Novedades dice **qué cambió y quién lo cambió** (delta)
— la relación que §3 del plan del tablero exige entre vecinos (*"nunca el mismo hecho en dos formatos
en la misma pantalla"*).

**Un solo cambio a la vez.** Mover además el bloque hacia arriba haría ilegible la evaluación de las
6 semanas. **Observable pre-autorizado:** si en la revisión Santiago dice que lee Novedades antes que
el Pulso, el orden se invierte — una línea, sin volver a decidirlo.

---

## 4. Anatomía de una novedad y estados de pantalla

### 4.1 La línea

Tres partes y nada más. Con datos reales de producción:

```
Novedades

Hoy
 ●  Martha Vega registró un servicio de ELECTRA (#117)                       21:00
    inseminación del 11 de agosto · por Telegram

Ayer — lunes 15 de septiembre
 ●  David García registró 8 jornales de 8 personas                           08:37
    trabajo del 14 de septiembre de 2025 al 14 de septiembre de 2026 · por la web
 ●  Martha Vega registró 3 tratamientos                                      13:35
    inicio 15 de septiembre · por la web

                                                        ver las 4 restantes ⌄
```

| Parte | Contenido | Regla |
|---|---|---|
| **1 · El hecho** | Frase en **pasado**, sujeto = autor, objeto nombrado. Una línea | Nunca imperativa: el imperativo era el lenguaje del bloque que se retira |
| **2 · El detalle** | Fecha o rango del hecho · tamaño · canal | Siempre las **dos** fechas: la del hecho acá, la de captura en la parte 3 |
| **3 · La captura** | Hora si es hoy; el día si no | Es lo que ordena el feed (§4.2) |

- **La línea entera navega** al objeto o a la lista con el filtro puesto (el parto → la ficha de la
  vaca; el lote de jornales → Labores con la fecha). Mínimo 44 px de alto en móvil.
- **Punto de color = módulo, nunca severidad.** El bloque **no lleva lenguaje de alerta**: sin ámbar,
  sin rojo, sin badges, sin contador de "nuevas". Ese lenguaje es del bloque 1, que sí es una bandeja
  con dueño y botón.
- Frase en cuerpo (`text-sm` / `text-base` móvil), detalle en metadato (`text-xs` / `text-sm`,
  `text-brand-brown/70`). **La frase manda, el detalle susurra.**

### 4.2 Las dos fechas

> **El feed se ordena por fecha de CAPTURA, descendente. Siempre se muestran las dos.**

Ordenar por fecha del hecho mandaría la fila de 2025 al fondo de una lista de 7 días, donde nadie la
vería — justo el caso que el bloque existe para atrapar. La pregunta que contesta el feed es *"¿qué
entró al sistema desde la última vez que miré?"*, y esa pregunta es de captura.

**Dos reglas de formato, deterministas, sin ningún umbral:**

1. **El rango se imprime completo siempre que haya más de una fecha del hecho.** Nunca *"varios
   días"*.
2. **El año se imprime cuando difiere del año de la captura.** Por defecto se omite (*"del 7 al 12 de
   septiembre"*); cuando difiere, aparece. Eso, y sólo eso, hace saltar el error del 15 de septiembre.

**No hay chip, ni color, ni alerta por desfase.** Un umbral ("más de N días entre el hecho y la
captura") necesita un número que nadie ha calibrado y dispararía en cada lote legítimo — el del 1 de
septiembre cubre 18 días de trabajo y es normal. La regla del año no necesita calibración.

**Única marca mecánica admitida:** si alguna fecha del hecho es **futura** respecto de hoy (Bogotá),
la línea añade un metadato neutro *"con fecha futura"*. Es binario, no es umbral, y atrapa una clase
de error ya documentada (las 12 filas de `fin_gastos` con fecha de mañana por el desfase UTC).

### 4.3 Autor y canal

Tres casos, **nunca confundidos**:

| Caso | Se muestra | Ejemplo |
|---|---|---|
| **Autor conocido** | Nombre + canal | *"Martha Vega · por Telegram"* |
| **Proceso automático** | *"Sistema · &lt;nombre del proceso&gt;"* | **No ocurre en la v1**: N-1 deja fuera todo lo que genera un cron. La etiqueta existe para que nunca se use por descuido |
| **Sin autor registrado** | Literal: *"sin autor registrado"* + el canal si se conoce | Las 2 filas de `hato_eventos` sin `created_by` (una de fuente `alerta`, una de la web) |

**Nunca se inventa un autor y nunca se escribe "Sistema" donde lo que hay es un hueco de
atribución.** Un hecho sin autor **sí aparece**: lo que falta es el nombre, no el hecho.

**`movimientos_inventario.responsable` es texto libre, no una llave.** Si resuelve contra
`usuarios.email`, se muestra el nombre; si no, se muestra **la cadena tal cual**
(`aescociahass@gmail.com`). No se normaliza ni se adivina — misma regla que el plan del tablero aplica
a la finca "santimp": *si el nombre está mal, que se vea*.

**Consecuencia conocida y deseada.** `telegram/conversations/jornal.ts`, `gasto.ts` y `monitoreo.ts`
**no** fijan el autor, y el bot escribe con `service_role` (`auth.uid()` NULL), así que los triggers
de atribución tampoco lo llenan. Hoy no se nota porque en 30 días todo eso entró por la web. El día
que alguien use `/jornal`, el feed dirá *"sin autor registrado"*. **Eso es el feed funcionando**; el
hallazgo de captura que destapa es un arreglo aparte.

### 4.4 Los cinco estados de pantalla

Ninguno es raro: tres se ven la primera semana.

| Estado | Qué se ve | Regla |
|---|---|---|
| **Con novedades** | Líneas agrupadas por día (*Hoy · Ayer · sábado 13*). **5 visibles** en escritorio, **3** en móvil, luego *"ver las N restantes"* que expande en sitio | Tope duro de **20 líneas** aun expandido; más allá, un pie *"y N más en los últimos 7 días"*. No hay pantalla `/novedades` en la v1 |
| **Ventana vacía** (el caso frecuente) | *"No se registró nada en aguacate en los últimos 7 días."* — **nombrando los módulos del lector** | **Jamás "0 novedades".** El alcance viaja en la frase para que "nada" sea verdad dentro de lo que ese lector ve, y nunca afirme que la finca estuvo quieta (§5) |
| **Día de captura masiva** | Nada especial: el grano ya lo colapsó. La línea **declara su tamaño** | 66 filas son una línea que dice 66 |
| **Una fuente falla** | Las demás líneas se pintan y aparece una línea gris: *"No se pudo leer el hato."* | **Un fallo nunca vacía el feed ni se calla.** Es la garantía más dura de §12 |
| **Cargando** | Skeleton de 3 líneas, del tamaño final | Vuelve a la regla general (§9.1 del plan). El bloque 4 no tenía skeleton porque podía no llegar nunca; éste siempre tiene contenido o un vacío honesto |

**Sin controles.** Cero filtros, cero pestañas, cero selector en la v1. A 5 líneas visibles y 7 días
de ventana un filtro no resuelve nada, y el Patrón B de `docs/sistema-visual.md` §3-bis admite a lo
sumo 2 controles en una fila de 375 px. El número correcto acá es cero.

---

## 5. Roles y visibilidad

**El feed es compartido y no se personaliza** — regla general del tablero (§3): *ninguna sección se
organiza alrededor de un lector concreto*. Lo que cambia entre lectores es **qué módulos ve**, nunca
**quién es**.

- **Filtro por `modulos_acceso`**, novedad por novedad, con `puedeAccederModulo`
  (`src/utils/modulosAcceso.ts`), la misma función pura del sidebar. Nunca una reimplementación.
- **Las novedades de `finanzas` se cierran por ROL, jamás por resultado de consulta.** Todas las
  `fin_*` son Gerencia-only por RLS: para un Administrador la consulta sale vacía y eso es
  indistinguible de "no hubo gastos". Se filtra antes de consultar.
- **La quincena de leche es Gerencia-only entera.** Los litros de una fila `medido` viven en
  `fin_ingresos.cantidad` vía el FK (migración 070) y `litros_total` es NULL por contrato: un lector
  no-Gerencia no puede leer la cifra, y media verdad no se publica.

| Lector | Qué ve |
|---|---|
| **Santiago, Martha, Consuelito, María Paula** (Gerencia) | Todo: hato, aguacate, ganado y finanzas |
| **David** (Administrador, `aguacate`) | Jornales, monitoreo, ejecución de aplicaciones, inventario, informes, tareas. **Ningún gasto, nada del hato** |
| **Fernando** (Administrador, `hato_lechero`) | Eventos, tratamientos, pesajes, chequeos. **No la quincena** (lleva plata) |
| **Uriel** (Administrador, `{}`) | El vacío honesto que el plan del tablero §8 ya define: *"Tu usuario todavía no tiene módulos asignados."* |

**No se muestra cuántas novedades hay ocultas.** Un *"y 12 que no puedes ver"* filtra volumen e invita
a pedir permisos que nadie pidió. El alcance se comunica **nombrando los módulos del lector en el
estado vacío**, y sólo ahí.

**No hay estado de "visto". Recomendación firme**, por cuatro razones: (a) el tablero no se
personaliza, así que un "visto" tendría que ser compartido, y entonces el primer Gerencia que lee
esconde el feed a los otros cuatro; (b) un "visto" por persona reintroduce por la puerta de atrás la
agenda por lector que §3 eliminó; (c) **un feed es una ventana de tiempo, no una bandeja** — la
bandeja es el bloque 1, que sí tiene dueño y botón; (d) `hato_alertas` ya enseñó qué pasa con una cola
que acumula estado y nadie vacía: 63 descartes de 64. **La ventana de 7 días hace el trabajo del
"visto", sin estado.**

---

## 6. Qué NO es

1. **No es una bitácora de auditoría.** No responde *"qué cambió en esta fila"*. `logs_auditoria`
   sigue con 0 filas y sin cablear, y ésa es una decisión aparte.
2. **No es una bandeja de tareas.** Sin estado, no se marca, no se vacía, no pide nada.
3. **No es el bloque 1.** Ahí entra sólo lo que tiene dueño = el lector y un botón que lo resuelve.
   Acá no hay nada que resolver: ya está hecho.
4. **No repite el Pulso.** El Pulso muestra el **ESTADO** (15,4 L/vaca, 369 cabezas, hace 13 días);
   Novedades muestra el **DELTA y el AUTOR**. Un hecho no aparece en los dos formatos.
5. **No es Salud de los datos.** Ese bloque contesta *"¿de cuándo es lo que veo?"* y *"¿alguien dejó
   de capturar?"* con un `MAX(fecha)` por fuente. Novedades contesta *"¿qué entró?"*. Complementarias,
   ninguna sustituye a la otra.
6. **No usa LLM.** El problema es de visibilidad, no de redacción: las frases salen de plantillas con
   ranuras tipadas.
7. **No es un resumen narrativo.** Ese producto ya existe: el Reporte Semanal, con sus fuentes.

### 6.1 La objeción del plan del tablero, contestada

§5 punto 8 dice, literal: *"Un feed de 'actividad reciente' (quién registró qué). Interesante una vez,
ruido siempre. La pregunta que sí importa —¿alguien dejó de capturar?— ya está en el bloque 6."* Se
escribió el 2026-08-16 y era correcta entonces. Tres cosas cambiaron:

1. **El hato entró en producción.** Hoy es la escritura humana más frecuente del sistema
   (`hato_eventos` + `hato_tratamientos` + `hato_pesajes_leche` = 105 filas en 30 días) y **casi toda
   entra por Telegram**, donde la confirmación es privada. El *"silenciosamente"* del dueño describe un
   canal que en agosto no tenía este volumen.
2. **Hoy se puede medir quién escribe.** Las migraciones 040/050/063/074/112 dejaron atribución en
   casi todo: **~97 %** de las filas de los últimos 30 días tienen autor resoluble. Un feed sin autor
   sí habría sido ruido; con autor es una conversación.
3. **Lo que ocupaba la ranura no funcionó**: 120 acciones publicadas, 8 descartes **todos en la
   primera semana**, cero desde entonces (§7).

**El "ruido siempre" se ataca con tres mecanismos que un feed ingenuo no tiene**: la regla de grano
(66 filas = 1 línea), la admisión N-1/N-3 (nada de un cron, nada que ya esté en pantalla) y el alcance
por módulo. **La segunda mitad de la objeción sigue en pie y no se toca**: *"¿alguien dejó de
capturar?"* la contesta el bloque 6, y Novedades no lo intenta.

---

## 7. Retiro de "Acciones recomendadas"

**Se retira por completo, en el mismo release en que aparece Novedades. No conviven.**

- **Es la misma ranura.** Dos bloques de "cosas para leer que no son decisiones" compitiendo por los
  mismos dos minutos enseñan a saltarse los dos.
- **La evidencia ya está y no va a mejorar.** 32 corridas, 120 acciones publicadas, **8 descartes
  entre el 19 y el 26 de agosto y ninguno desde entonces** (`aguacate.plaga.acaros_insecto_y_huevos`,
  `ganado.concentracion`, `ganado.fincas_sin_ha`, `ganado.ejecucion_presupuestal` ×3,
  `aguacate.tarea_atascada`, `ganado.variacion_30d`).
- **El umbral que importaba nunca se pudo medir, y nunca se va a poder.** K-2 de `plan_motor` §7.2
  —*indiferencia: >70 % de las publicadas sin clic y sin descarte*— era el modo de muerte que ese
  documento anticipó como el más probable. **No existe registro de clics: ni columna ni tabla.** Un mes
  más de corridas no produce el dato que falta.
- **El contrato ya lo decía.** §7.2 fijó la revisión a las 6 semanas y la regla *"retirar, no
  afinar"*, con *"démosle otro mes"* declarado inadmisible sin evidencia nueva.

| | Decisión |
|---|---|
| El bloque en el tablero | **Desaparece.** Mismo release |
| La generación diaria | **Se detiene.** Cuesta una llamada al modelo por día por un producto que nadie ve. El cómo es del CTO |
| El historial de corridas, acciones publicadas y descartes | **Se conserva.** 32 corridas de evidencia que no cuestan nada guardadas, y el único registro si alguien reabre esto |

**Dos cosas quedan huérfanas y hay que decirlo en voz alta**, o mueren en silencio:

1. **Las revisiones periódicas (O-8).** Las 4 cadencias que Santiago declaró —*"revisar la ejecución
   presupuestal"*, *"correr el análisis de productividad del hato"*— responden a una necesidad real que
   **Novedades no sirve**: Novedades muestra lo que pasó, no lo que lleva dos meses sin mirarse. Su
   sitio natural es **Salud de los datos**, que ya calcula `MAX(fecha)` por fuente. **Se traslada allí
   en una pasada posterior, no en ésta.**
2. **El faltante de insumo contra una aplicación programada.** *"La enmienda arranca el 18 y faltan
   4.694 kg de Silicalmag"* era la mejor acción que el motor podía producir y **no tiene otra casa**:
   es una proyección, no una captura. Tiene fecha y consecuencia, así que su sitio es el **bloque 1**.
   **Se evalúa como fila del bloque 1 en una pasada posterior.** Si no se hace, se pierde.

---

## 8. Historias de usuario

Agrupadas por objetivo del usuario. QA deriva los Given/When/Then de acá.

**O1 · Enterarme de lo que pasó sin preguntarle a nadie**

| | Como… quiero… para… | |
|---|---|---|
| U1.1 | Gerencia · ver los partos, secados y servicios registrados en los últimos días · enterarme sin que nadie me avise | **Must** |
| U1.2 | Gerencia · ver cuántos jornales se registraron y para qué días de trabajo · saber si la semana se capturó | **Must** |
| U1.3 | Gerencia · ver que entró una ronda de monitoreo nueva, con su fecha y cuántas lecturas trae · saber que hay dato fresco de plagas | **Must** |
| U1.4 | Gerencia · ver las 3 novedades más recientes sin desplazar en un teléfono de 375 px · resolver el barrido de las 6:00 | **Must** |
| U1.5 | Gerencia · ver la ventana entera de 7 días agrupada por día · el repaso del lunes | **Must** |
| U1.6 | Gerencia · abrir la ficha de la vaca o la lista filtrada desde la línea · pasar de enterarme a mirar | Should |

**O2 · Ver que lo que registré llegó bien**

| | Como… quiero… para… | |
|---|---|---|
| U2.1 | David · ver mi propia captura con su número de jornales y su rango de fechas · confirmar que quedó como la mandé | **Must** |
| U2.2 | Fernando · ver en el tablero el evento que registré por Telegram · saber que salió del chat y llegó al sistema | **Must** |
| U2.3 | Martha · que el pesaje diga sobre cuántas vacas se midió (*"52 de 65"*) · ver de inmediato si me faltaron animales | **Must** |

**O3 · Detectar un error de captura el mismo día**

| | Como… quiero… para… | |
|---|---|---|
| U3.1 | Gerencia · que la línea muestre el rango completo de fechas del hecho, con el año cuando difiere del de la captura · que una fecha mal tecleada salte a la vista | **Must** |
| U3.2 | Gerencia · que una fecha del hecho posterior a hoy se marque *"con fecha futura"* · atrapar el desfase de fin de día | Should |
| U3.3 | Quien capturó · llegar al registro desde la línea · corregirlo donde se corrige | Should |

**O4 · Saber quién capturó qué**

| | Como… quiero… para… | |
|---|---|---|
| U4.1 | Gerencia · ver el nombre de quien capturó y por qué canal · preguntarle a la persona correcta | **Must** |
| U4.2 | Gerencia · que una captura sin autor diga *"sin autor registrado"* · no atribuírsela a nadie por error | **Must** |
| U4.3 | Gerencia · que un responsable que es texto libre se muestre tal cual si no resuelve a una persona · ver el dato sucio en vez de una limpieza inventada | Should |

**O5 · Confiar en lo que el bloque dice**

| | Como… quiero… para… | |
|---|---|---|
| U5.1 | Cualquier lector · que un día sin capturas diga *"no se registró nada"* nombrando mis módulos, nunca *"0 novedades"* · no confundir silencio con cero | **Must** |
| U5.2 | Cualquier lector · que si una fuente falla se diga cuál, y el resto del feed se pinte igual · saber qué no estoy viendo | **Must** |
| U5.3 | David · no ver gastos ni nada del hato, y que el vacío diga *"en aguacate"* · que no me mienta sobre la finca | **Must** |
| U5.4 | Uriel, sin módulos · un mensaje que me diga que me faltan permisos · no quedarme con un tablero vacío | Should |
| U5.5 | Cualquier lector · que el bloque no me grite: sin rojos, sin ámbar, sin contadores de "nuevas" · saber que no me pide una acción | **Must** |

**O6 · Que el tablero no se contradiga**

| | Como… quiero… para… | |
|---|---|---|
| U6.1 | Gerencia · que Novedades no repita una fila de *Requiere tu decisión* ni un titular del Pulso · no leer el mismo hecho dos veces | **Must** |
| U6.2 | Gerencia · que el bloque 1 pinte antes que Novedades incluso con mala conexión · que lo urgente nunca espere a lo informativo | **Must** |
| U6.3 | Gerencia · ver *"Acciones recomendadas"* retirado del tablero, no conviviendo con Novedades · no tener dos bloques de lectura compitiendo | **Must** |

---

## 9. Éxito, revisión y umbral de retiro

**La fecha de revisión se pone en el calendario el día del release: 6 semanas después.** La decisión
es *seguir o retirar*. *"Démosle otro mes"* no es admisible sin evidencia nueva. Que nadie pusiera esa
fecha es la razón por la que `hato_alertas` llegó a 63 de 64 sin que nadie lo declarara.

**Lo que se mide solo, con lo que existe** (misma consulta que alimenta el feed; cero instrumentación):

| | Métrica | Línea base | Lectura |
|---|---|---|---|
| **M-1** | **Líneas por día**: mediana y máximo | No existe | **La métrica de salud del grano.** Mediana > 12 dos semanas seguidas ⇒ el feed es un log. Mediana < 2 ⇒ no justifica un bloque |
| **M-2** | **Días con la ventana vacía**, sobre el total | Jornales caen 14 de 30 días, así que una ventana de 7 casi siempre trae algo | > 50 % de días vacíos ⇒ la ventana o el catálogo están mal dimensionados |
| **M-3** | **Cobertura de atribución**: líneas con autor resoluble ÷ total | **≈ 97 %** (2 filas de `hato_eventos` + 3 de `movimientos_inventario` en 30 días) | Bajo **90 %** es un **hallazgo de captura** — casi seguro alguien empezó a usar `/jornal`, `/gasto` o `/monitoreo` (§4.3) — no un fallo del bloque |

**Lo que hay que instrumentar, y sólo es barato el día uno.** El bloque 4 murió sin poder evaluarse
porque nadie registró los clics; ese error no se repite. **M-4** expansiones de *"ver las N
restantes"* (única prueba de que alguien leyó más allá de la primera pantalla) y **M-5** navegaciones
desde una línea (prueba de que el feed llevó a alguien a mirar algo). **Prerrequisito de release, no
mejora** — misma lección que `plan_motor` §6.4.

**Lo que sólo puede contestar el lector.** El valor de este bloque es **epistémico**: que alguien se
entere de algo. No hay instrumento para eso que no sea preguntarle. Dos preguntas, **con la redacción
congelada desde ahora** para que la respuesta de dentro de seis semanas sea comparable:

- **E-1** · *"En las últimas dos semanas, ¿te enteraste por este bloque de algo que no sabías?"*
- **E-2** · *"¿Alguna vez viste acá un error de captura que si no, se te habría pasado?"*

**E-2 tiene un caso de referencia ya escrito**: la fila con `fecha_trabajo = 2025-09-14`, capturada el
15 de septiembre de 2026 y **todavía sin corregir el 16**. Si vuelve a ocurrir algo de esa clase y se
detecta en menos de 24 h, la respuesta es sí. **No es medible mecánicamente**: `registros_trabajo` no
está trazada ni por `hato_correcciones` (084) ni por `globalgap_correcciones` (113), así que la
corrección no deja fila. Se cuenta a mano durante las 6 semanas, y se dice que se cuenta a mano.

**Los umbrales de muerte:**

| | Criterio | Umbral | Consecuencia |
|---|---|---|---|
| **K-1 · Indiferencia** | **E-1 responde "no"** en la revisión | Cualitativo, y es el que manda | **Se retira.** El bloque existe para que alguien se entere; si nadie se entera, no hay nada que afinar |
| **K-2 · Ruido** | M-1 con mediana > 12 líneas/día dos semanas seguidas | Mecánico | **Un solo intento** de recortar el grano, declarado de antemano; si no baja, se retira |
| **K-3 · Mentira** | Un autor inventado · un "0" donde hay hueco · una línea con una sola de sus dos fechas · un feed vacío por un fallo de lectura | Cero tolerancia | **Bloqueo de release** y arreglo inmediato. No es criterio de muerte: es de corrección |

**K-2 es la única excepción a "retirar, no afinar", y está acotada a propósito**: el grano es un
parámetro con una respuesta correcta y medible, a diferencia del juicio de un modelo. Un intento,
declarado de antemano, y se acaba.

---

## 10. Fuera de alcance y v2

**Fuera de la v1:** pantalla propia `/novedades` con historial largo, búsqueda o filtros (la ventana
de 7 días en el tablero es todo el producto) · **filtro por persona** — no porque sea difícil, sino
porque personaliza la lectura de una pantalla que §3 decidió no personalizar; se reconsidera sólo si
M-1 muestra que el feed llega seguido al tope de 20 líneas · estado de "visto" (§5) · correcciones
(§2.5) · validaciones de captura.

**v2, en este orden:**

1. **Resumen diario por Telegram. No ahora**, por tres razones. (a) Casi todo el que lo recibiría es
   quien capturó la mayoría de lo que dice. (b) Telegram ya carga las confirmaciones de cada captura
   **y** el lazo de alertas, que por fin funciona: 23 confirmadas, 20 descartadas, 10 escaladas, 1
   respondida en 30 días. Sumar un broadcast diario compite con lo que está vivo, y el costo de
   saturar ese canal es una lección de hace una semana (migraciones 142 y 152: secado y tratamiento
   llegando a quien no era). (c) Un push necesita modelo de suscripción — y ya existe:
   `alertas_catalogo` + `telegram_alertas_suscripciones` (096) se diseñaron para esto, así que es
   barato después. **Se decide en la revisión de las 6 semanas, con E-1 respondida.**
2. **Esco.** No como feature propio: ya puede contestar *"¿qué se registró esta semana?"* con sus
   herramientas. Si algún día expone novedades, **consume la misma derivación de grano y autor, nunca
   una segunda** — este repositorio ya pagó cuatro veces por lógica espejada a mano
   (`reportes-financieros.ts`, `priorizacion-scouting.ts`, `calculosHato.ts`, `ganado-inventario.ts`).
3. **Trasladar las revisiones periódicas (O-8) a Salud de los datos** (§7).
4. **Evaluar el faltante de insumo como fila del bloque 1** (§7).

---

## 11. Decisiones para Santiago

Cinco. Todas se responden con una letra.

**D-1 · ¿Qué es una línea del feed?**

- **(a) Una línea por sesión de captura** — un autor, un tipo de hecho, un día: *"David registró 66
  jornales de 9 personas, trabajo del 7 al 12 de septiembre"*. ← *recomendada*
- (b) Una línea por cada registro guardado: el 12 de septiembre habrían sido 66 líneas.
- (c) Una línea por módulo por día: *"hubo actividad en aguacate"*.

*Por qué (a):* es la única que se lee en 60 segundos en un teléfono y sigue diciendo quién, cuánto y
de qué fechas. (b) convierte el tablero en un log; (c) no dice nada accionable.

**D-2 · ¿Cuántos días hacia atrás muestra el feed?**

- **(a) 7 días.** ← *recomendada*  ·  (b) 3 días.  ·  (c) 14 días.

*Por qué (a):* monitoreo y pesaje se capturan **1 día de cada 30**; con 3 días el feed estaría vacío
casi siempre. Con 14, la primera línea puede tener dos semanas y el repaso del lunes se vuelve
ilegible.

**D-3 · ¿Qué pasa con "Acciones recomendadas"?**

- **(a) Se retira del tablero en el mismo release en que aparece Novedades**, y la generación diaria se
  detiene. El historial de las 32 corridas se conserva. ← *recomendada*
- (b) Conviven un mes y después se decide.
- (c) Se quita de la pantalla pero el motor sigue generando todos los días.

*Por qué (a):* es la misma ranura, y dos bloques de lectura compitiendo enseñan a saltarse los dos. El
contrato del motor ya fijaba *"retirar, no afinar"*, y el umbral que lo habría salvado —el de
indiferencia— nunca se pudo medir porque no hay registro de clics. (c) paga una llamada al modelo cada
día por algo que nadie ve.

**D-4 · ¿Las correcciones (ediciones y borrados) entran al feed?**

- **(a) No en la v1.** ← *recomendada*
- (b) Sí, aunque sólo se vean las hechas desde la web.
- (c) Nunca.

*Por qué (a):* las bitácoras de corrección sólo trazan sesiones de navegador — una corrección hecha
por Telegram, por el service role o por una migración **no deja fila**. Mostrar unas y otras no enseña
que "no aparece = no pasó", que es falso. (c) cierra la puerta a algo que sí vale cuando la traza sea
pareja.

**D-5 · ¿Un resumen diario de novedades por Telegram?**

- **(a) No ahora. Se decide en la revisión de las 6 semanas.** ← *recomendada*
- (b) Sí, desde el día uno, además del bloque en el tablero.
- (c) No, nunca: el tablero es el único sitio.

*Por qué (a):* el lazo de alertas del hato por fin funciona (23 confirmadas y 1 respondida en 30 días)
y hace una semana hubo que corregir a quién le llegaba qué. Sumar un broadcast diario al mismo canal
antes de saber si la gente lee el bloque es apostar dos veces a la misma carta.

---

**Decisiones que tomo yo y quedan revisables** (no ocupan chip):

- **El nombre es "Novedades"** — la palabra que usó el dueño y la del oficio ("el parte de
  novedades"). Colisiona con *"novedades del chequeo"* (`docs/hato/brief_chequeo_novedades.md`), que
  significa otra cosa: una fila manuscrita que el roster impreso no anticipó. **Se acota el término
  del hato, no el del tablero:** ese concepto se nombra en la interfaz **"filas escritas a mano"** y
  sus documentos llevan la aclaración en el título. Es un término interno de un flujo de carga;
  "Novedades" lo lee todo el mundo en la pantalla principal. **No se usa "Actividad reciente"**: ese
  nombre arrastra la objeción de §5 del plan del tablero y este bloque no es eso.
- **La posición es la ranura que deja el bloque 4** (entre Pulso y Dinero), con el intercambio de orden
  pre-autorizado si en la revisión resulta que se lee antes que el Pulso (§3).
- **Sin filtros, sin estado de visto, sin pantalla propia** en la v1 (§5, §10).
- **La ventana no muestra más de 20 líneas** ni siquiera expandida.

---

## 12. Lo que este documento le exige al CTO

Garantías de producto, no soluciones. Tabla materializada, consulta en vivo, vista, trigger o edge
function: no lo decide este documento.

1. **Frescura: una captura aparece en el feed en menos de 10 minutos.** Sin eso, *"Martha acaba de
   registrar"* es mentira, y el barrido de las 6:00 tiene que incluir las capturas de Telegram de
   anoche (las del hato caen entre las 15:00 y las 21:00). A cambio, **el feed puede ser el bloque más
   lento de la página**.
2. **Nunca en el camino crítico.** El bloque 1 pinta primero, en un teléfono con mala conexión, sin
   esperar a nadie. Restricción intacta de §10 del plan del tablero.
3. **Un fallo de una fuente no vacía el feed ni se calla.** Degradación por fuente, con una línea
   explícita que nombre la que falló.
4. **La derivación de grano y autor existe UNA vez.** Si mañana la consumen Telegram o Esco, consumen
   ésa. Cuatro precedentes de lógica espejada a mano dicen por qué.
5. **"Hoy" es hora Bogotá** (`obtenerFechaHoy()`), tanto para agrupar por día como para la marca de
   fecha futura. Un corte UTC pone una captura de las 19:30 bajo "mañana" y rompe los encabezados *Hoy
   / Ayer* justo para las capturas de la tarde, que son las de Telegram.
6. **El gate de rol viaja con el dato, no con el render.** Una novedad de `fin_*` se filtra antes de
   que la consulta vuelva, no se esconde con CSS. Precedente: `/finanzas/reportes` y su `RoleGuard`.
7. **El autor nunca se inventa.** Si no resuelve, la línea dice *"sin autor registrado"*. Y
   `movimientos_inventario.responsable` se trata como **texto libre**, no como llave foránea.
8. **La instrumentación de M-4 y M-5 va desde el día uno** (§9). Es lo que le faltó al bloque que se
   retira, y por eso no se pudo evaluar. Barato ahora, imposible después.
9. **Cero LLM en este camino.**
10. **El feed no escribe en ninguna tabla de dominio.** Sólo lee. Lo único que escribe es su propia
    señal de uso (punto 8).
11. **El retiro del bloque 4 ocurre en el mismo release** (§7), incluida la parada de la generación
    diaria. El historial de corridas y de descartes se conserva.
12. **Ninguna cifra se recalcula acá.** El tamaño de una sesión, el denominador del pesaje y el rango
    de fechas salen de las mismas funciones puras que ya los producen en sus módulos. Una segunda
    aritmética es una segunda respuesta a la misma pregunta.

---

## 13. Los cuatro números que resumen este documento

- **66 filas en una sentada**, cubriendo 6 días de trabajo. Ésa es **una** línea del feed.
- **Una fila con fecha de trabajo 2025-09-14**, capturada el 15 de septiembre de 2026 y todavía sin
  corregir. Se delata sola con sólo imprimir el rango.
- **97 % de las filas de los últimos 30 días tienen autor resoluble.** Es lo que hace posible poner a
  todo el mundo en la misma página; el 3 % restante se dice *"sin autor registrado"*, nunca *"Sistema"*.
- **8 descartes en 30 días, todos en la primera semana, y cero registro de clics.** El bloque que se
  retira no se puede evaluar — y ése, no la calidad de sus frases, es el motivo por el que se retira.
