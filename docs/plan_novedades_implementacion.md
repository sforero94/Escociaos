# Plan de implementación — Novedades (Tablero General)

**Plan técnico** · 2026-09-16 · CTO
**Brief de producto:** [`docs/plan_novedades.md`](./plan_novedades.md) (CPO, 2026-09-16)
**Rutas afectadas:** `/` (`src/components/Dashboard.tsx` + `src/components/dashboard/*`)
**Estado:** diseño técnico. **No se construye en esta pasada** — el dueño hace commit del PRD y de
este plan, y abre el issue después.

> Se planifica sobre la opción **recomendada** de cada decisión de §11 del brief: D-1 (a) sesión de
> captura, D-2 (a) 7 días, D-3 (a) retiro en el mismo release, D-4 (a) sin correcciones, D-5 (a) sin
> Telegram. Cada sección dice qué cambia si Santiago elige otra letra.

---

## 0. Resumen ejecutivo

| | |
|---|---|
| **Dónde se deriva el feed** | **Navegador**, una consulta por fuente, agrupadas por **módulo**. Catálogo declarativo en TS. Sin tabla materializada, sin triggers, sin cron |
| **Consultas nuevas** | 9 para Gerencia (4 hato + 3 aguacate + 1 finanzas + 1 RPC de autor), 4 para David, 4–5 para Fernando, **0** para Uriel. El retiro del bloque 4 devuelve 2–5 |
| **Migraciones** | **2**, las dos de cero filas afectadas: `155` (RPC de autor + tabla de uso), `156` (retiro del cron + comentarios). Números tentativos, re-barrer antes de escribir (§10.3) |
| **Tablas nuevas** | 1: `novedades_uso` (instrumentación M-4/M-5) |
| **Funciones nuevas** | 1: `fn_novedades_autores(uuid[])`, `SECURITY DEFINER` acotada. Única excepción del plan; §3 explica por qué no hay alternativa |
| **Archivos TS nuevos** | ~12 en `src/utils/novedades/` + 3 en `src/components/dashboard/` |
| **Borrados (retiro)** | 4 componentes/hooks, 7 utils, 1 tipo, 9 edge × 2 árboles, 11 tests, 1 script, 3 documentos a `docs/archive/` |
| **Espejado a Deno** | **Ninguno en la v1.** Esco/Telegram es v2 y entonces va por generador, nunca a mano |
| **Fases** | 7 (F0 decisiones → F1 fundación → F2 núcleo puro → F3 pantalla → F4 intercambio → F5 atribución de Telegram, paralela → F6 revisión) |

**Las siete decisiones técnicas:**

1. **El feed se deriva en vivo desde el navegador**, no de una tabla materializada. La garantía §12.1
   («menos de 10 minutos») descarta de plano el patrón del motor que se retira: un tick diario es 24 h
   de latencia. Una lectura en vivo tiene latencia cero y no cuesta ni una tabla ni un trigger.
2. **Una consulta por fuente, en tres cargadores por módulo.** No un RPC único: §2.3 del brief exige
   que sumar una fuente no sea un rediseño, y con un `UNION ALL` en SQL cada fuente nueva es una
   migración. La degradación por módulo sale gratis con `Promise.allSettled`, y es la granularidad
   exacta que pide §4.4 («No se pudo leer **el hato**»).
3. **El nombre del autor lo resuelve un RPC `SECURITY DEFINER` acotadísimo.** La política SELECT de
   `usuarios` es `id = auth.uid() OR rol = 'Gerencia'`: **un Administrador sólo ve su propia fila**.
   Sin ese RPC, David y Fernando leerían «sin autor registrado» en todas las líneas menos las suyas.
4. **El día de captura se calcula con una función nueva, `diaBogota(iso)`**, no con
   `obtenerFechaHoy()`. Aquélla da el día local del navegador; aquí hay que convertir un `timestamptz`
   **ajeno** a día Bogotá. Confundirlas rompe los encabezados *Hoy / Ayer* justo para las capturas de
   Telegram de la tarde.
5. **Toda cifra sale de `fetchAll`.** Una carga masiva de monitoreo puede pasar de 1.000 filas en la
   ventana, y el tope silencioso de PostgREST convertiría «4.200 lecturas» en «1.000»: cifra
   inventada, o sea K-3.
6. **El retiro va en dos PR y un solo release.** El PR del bloque nuevo **no lo monta**; el PR del
   intercambio monta Novedades y borra Acciones en el mismo commit. Si el primero se despliega solo,
   los dos bloques conviven en producción, que es lo que §7 del brief prohíbe.
7. **El cron del motor se retira con `cron.unschedule`, no con `active := false`.** Un job pausado es
   indistinguible de uno que nunca debió correr — la 102 embarcó pausada y se reactivó fuera del
   fichero. El `cron.schedule` original queda en el ROLLBACK al pie de la migración.

---

## 1. Lo que verifiqué, y contra qué

**Medido contra producción el 2026-09-16** (viene del contexto del orquestador; no lo re-derivé):
actividad por tabla y autor de los últimos 30 días, padrón de 10 cuentas, las 9 sesiones de captura de
jornales, las 32 corridas / 120 acciones / 8 descartes del motor, y que `jornal.ts` / `gasto.ts` /
`monitoreo.ts` no fijan autor.

**Contado con `grep`/`ls` en este worktree, hoy:**

| Hecho | Verificación |
|---|---|
| **El tablero no hace *polling*.** Cero `setInterval` en todo `src/components/` | `grep -rn "setInterval" src/components/` → 0 |
| 19 apariciones de `.from(` en los hooks del tablero (no todas disparan en cada carga; 2 son escrituras) | conteo por archivo en `dashboard/hooks/` |
| `usuarios` se lee desde el navegador en **2** sitios: `utils/supabase/client.ts:41` (perfil propio) y `utils/reporteSemanalService.ts:368` | `grep -rn "from('usuarios')" src/` |
| `movimientos_diarios.created_by` **existe** y la web lo escribe (`DailyMovementForm.tsx:665`) | `src/types/database.ts` + grep |
| `hato_produccion_quincenal.created_by` **existe** desde la 054 | DDL de `054_create_hato_leche.sql` |
| `produccion` y `aplicaciones` **no tienen** columna de autor | `src/types/database.ts` |
| `NegocioAccion` (en `utils/accionesTipos.ts`) lo usa **`PulsoNegocio.tsx`**, que no se retira | `grep -rn "NegocioAccion" src/` |
| `useGanadoParaAcciones` tiene **un solo** consumidor: `Dashboard.tsx`, y sólo para el cotejo | `grep -rn "useGanadoParaAcciones" src/` |
| Migraciones hasta **154**; el **150** está ocupado en `origin/claude/po-datos-15-15-15-prueba` | `ls` + barrido de `origin/*` con `git ls-tree` |

**Dos correcciones que hay que llevar a `CLAUDE.md`:** (a) dice que «`movimientos_diarios*` todavía no
tiene columna de capturador» — **falso**, la columna existe y la web la llena; lo que falta es el
*trigger*, así que cualquier otro camino la deja NULL (para `aplicaciones` sí es cierto). (b)
`plan_dashboard_centro_control.md` §10 habla de «~10 consultas cada 2 minutos»: **hoy no hay ningún
temporizador**, el tablero consulta una vez por montaje, y el presupuesto de §8 se calcula contra eso.

**No tengo acceso a la base desde este worktree.** Todo lo que dependa del catálogo vivo —número de
migración libre, `jobid` del cron, estado del *ledger*— se re-verifica en la sesión que implemente.

---

## 2. Dónde se deriva el feed

### 2.1 Cuatro opciones

| | **(A) Navegador, una consulta por fuente** | **(B) Vista o RPC que devuelve la ventana agrupada** | **(C) Tabla materializada con triggers** | **(D) `pg_cron` que materializa a diario** |
|---|---|---|---|---|
| Latencia | **cero** | cero | cero | **24 h** |
| Consultas | 9 (Gerencia) | 1 | 1 | 1 |
| Sumar una fuente | un archivo + una entrada de catálogo | **una migración** (`CREATE OR REPLACE` sobre un `UNION ALL` de ~150 líneas) | **una migración + un trigger** | una migración |
| Pruebas | Vitest con *fixtures*, el estándar del repo | **no hay arnés SQL** | ídem | ídem |
| Degradación | por fuente, estructural | todo o nada | n/a | n/a |
| Corte por rol | la RLS lo hace sola | `SECURITY INVOKER` obligatorio | n/a | n/a |
| Resuelve el autor (§3) | no | no | **no** | no |

**Por qué (B) pierde a pesar de su mejor argumento.** Ese argumento es real: el agrupamiento existiría
una vez y lo consumirían igual el navegador, Telegram y Esco — lo que §12.4 pide y lo que el
repositorio pagó cuatro veces por no tener (`reportes-financieros.ts`, `priorizacion-scouting.ts`,
`calculos-hato.ts`, `ganado-inventario.ts`). Pierde por tres cosas: §2.3 del brief exige que sumar una
fuente no sea un rediseño; meter rangos, truncado de nombres y *bucket* por día Bogotá en SQL sería la
primera lógica de negocio sin prueba unitaria del proyecto; y una sentencia que toca 8 tablas es
**más** expuesta a un 504 de PostgREST que ocho pequeñas, y al caer se lleva el feed entero — el
repositorio acaba de añadir reintentos por eso (commit `c0e1fb1`, ESCO-97/ESCO-106).

**`SECURITY INVOKER` es obligatorio en (B) si toca `fin_*`.** Un `DEFINER` corre como su dueño y
**salta la RLS**: `fin_gastos` es Gerencia-only por `es_usuario_gerencia()`, así que un `DEFINER` sin
guarda propia entregaría los gastos confirmados a cualquier Administrador. Regla de la 082: *una
función `SECURITY DEFINER` tiene que comprobar a su propio llamante, porque la RLS por definición ya no
la protege.*

**(C) se descarta por lo que no compra.** Son **18 triggers** (uno por tabla admitida; el catálogo v1
ya son 8 y crece), cada uno con `search_path` pineado y `EXECUTE` revocado (082), más una segunda copia
de hechos que puede divergir sin que nada avise — **y no resuelve la atribución**, porque el bot
escribe con `service_role` donde `auth.uid()` es NULL y el trigger vería el mismo hueco de hoy.
Migración grande y riesgo permanente por **cero** latencia ganada frente a una lectura en vivo.

**(D) queda descartada sin discusión**: es el patrón del motor que se retira, y la captura de las 21:00
de Martha aparecería a las 05:50 del día siguiente — ocho horas y media contra una garantía de diez
minutos.

### 2.2 Recomendación: (A), con las fuentes agrupadas en tres cargadores por módulo

```
useNovedades(modulosPermitidos)
  └─ Promise.allSettled
       ├─ cargarHato()      → hato_eventos · hato_pesajes_leche · hato_tratamientos · hato_chequeos
       ├─ cargarAguacate()  → registros_trabajo · monitoreos(+rondas) · movimientos_diarios
       └─ cargarFinanzas()  → fin_gastos                 [sólo si módulo Y rol Gerencia]
  └─ fn_novedades_autores(ids únicos)     ← una llamada, ids deduplicados
  └─ agruparNovedades(crudas, hoyBogota)  ← PURO, sin red, sin React, con fixtures
```

Si el hato falla, aguacate y finanzas se pintan y aparece la línea gris *«No se pudo leer el hato.»*,
la redacción literal de §4.4.

**Qué me haría cambiar de opinión, dicho de antemano para que sea verificable:** si el catálogo pasara
de ~12 fuentes, o si Esco/Telegram consumieran el feed (v2 de §10), la duplicación de criterio pesa
más que la extensibilidad y **gana (B)** — la migración es mecánica, porque los cargadores ya
devuelven una forma común y sólo se cambia el `from` por un `rpc`. También gana (B) si M-1 mostrara
que el feed llega seguido al tope de 20 líneas, porque entonces el volumen justifica paginar del lado
del servidor. **(C) no vuelve a la mesa** mientras la atribución del `service_role` siga sin resolver.

**Si Santiago elige D-2 (c), 14 días:** nada cambia en la arquitectura; sube el riesgo de truncado de
§8.3 y el tope de 20 líneas empieza a morder. Con D-2 (b), 3 días, el feed queda vacío casi siempre
—monitoreo y pesaje se capturan 1 día de cada 30— y M-2 dispara su umbral en la primera revisión.

---

## 3. El muro de RLS de `usuarios` — la restricción que decide la arquitectura

La política SELECT de `usuarios`, tal como la dejó la migración 093:

```sql
-- "Usuario ve su perfil" [SELECT]
USING ((id = (SELECT auth.uid())) OR ((SELECT public.get_user_role()) = 'Gerencia'::rol_usuario))
```

**Un Administrador sólo puede leer su propia fila.** David, Fernando, Uriel y Santiago Admin son
Administrador. Cualquier `join` desde el navegador de `created_by` contra `usuarios.nombre_completo`
les devuelve **una sola coincidencia**: la de ellos mismos.

Sin arreglo, el feed de David diría «sin autor registrado» en cada línea que no sea suya. Eso no es el
hueco honesto que §4.3 del brief bendice —ahí el hueco es del **dato**— sino una ceguera del lector: el
autor existe, está guardado, y la pantalla dice que no. Rompe K-3 y vacía de sentido el objetivo O4
para 4 de 10 cuentas. **Ya hay un precedente latente del mismo error:**
`reporteSemanalService.ts:368` hace ese `join` para pintar quién generó cada informe semanal, y para un
lector no-Gerencia cae a `undefined` en silencio. No lo arreglo acá; lo dejo anotado.

**La solución mínima:**

```
fn_novedades_autores(p_ids uuid[]) RETURNS TABLE (id uuid, nombre text, correo text)
  SECURITY DEFINER · STABLE · search_path = public, pg_temp
```

- **Tres columnas y nada más.** `rol`, `activo` y `modulos_acceso` **nunca salen de la función**: son
  exactamente las columnas con las que se construye una escalada de privilegios, y la 073 existe por
  eso. `correo` sale porque `nombre_completo` es *nullable* y porque §4.3 del brief ya acepta mostrar
  un correo crudo cuando es lo único que hay.
- **Comprueba a su propio llamante** (regla 082): `RAISE EXCEPTION 42501` si
  `(SELECT public.get_user_role()) IS NULL`. Desde la 137 esa función ya filtra `activo = true`, así
  que una cuenta desactivada falla cerrada sin una línea más.
- **Tope de entrada:** `RAISE` si `array_length(p_ids, 1) > 100`. Una ventana de 7 días tiene como
  mucho una decena de autores; el tope convierte un uso indebido en un error ruidoso.
- **Un id que no esté en `usuarios` no devuelve fila.** El TS lo mapea a `null` y la línea dice «sin
  autor registrado». **Nunca se fabrica un nombre** (§12.7).
- `EXECUTE` sólo para `authenticated` y `service_role`; `REVOKE` para `anon` y `PUBLIC` (trampa 081).

> **Nota del orquestador (verificado contra producción el 2026-09-16):** las 10 cuentas de `usuarios`
> tienen `nombre_completo` poblado (0 filas NULL o vacías). La sesión que implemente debe preferir que la
> función devuelva **sólo `id` y `nombre`**, resolviendo el respaldo `COALESCE(nombre_completo, email)`
> **dentro** de la función: así el correo de un usuario nunca sale hacia un lector no-Gerencia salvo en
> el caso en que es literalmente lo único que hay. Dos columnas, no tres, y la misma guarda.

**Lo que esta función NO es:** no lee ninguna tabla de dominio, no toca `fin_*`, no decide visibilidad
y no conoce el catálogo de fuentes. Si alguien quiere ampliarla, ésa es la señal de que hay que
escribir otra función, no de que ésta crezca.

---

## 4. Grano, día Bogotá y las dos fechas

### 4.1 La regla y dónde vive

> Una línea = un **autor** × un **tipo de hecho** × un **día de captura en hora Bogotá**.
> Salvo cuando el módulo ya tiene su unidad (ronda, chequeo, informe, quincena): ahí manda el módulo.

Vive en **`src/utils/novedades/agrupar.ts`**, función pura, sin `new Date()` propio: recibe `hoy` como
parámetro, el patrón que ya usan `calculosRequiereDecision.ts` y `hatoAlertasTablero.ts` y que es lo
que hace posibles las pruebas de reloj fijo. La clave de agrupación **la declara cada fuente en su
entrada de catálogo**, no la adivina el agrupador:

| Grano | Clave | Fuentes |
|---|---|---|
| Sesión de captura | `<modulo>\|<fuente>\|<tipoHecho>\|<autorId ?? 'sin-autor'>\|<diaBogota>` | `hato_eventos`, `hato_tratamientos`, `registros_trabajo`, `movimientos_diarios`, `fin_gastos` |
| Unidad del módulo | `<fuente>\|<idUnidad>` | `monitoreos` (por `ronda_id`, **nunca** por `fecha_monitoreo`), `hato_chequeos`, `hato_pesajes_leche` (por `fecha` de pesaje) |

Dos autores el mismo día con el mismo tipo **nunca se funden**: la clave los separa, y eso no es una
comprobación que haya que recordar — es la clave.

### 4.2 `diaBogota()`, y por qué no basta con lo que hay

`obtenerFechaHoy()` construye la fecha desde `getFullYear`/`getMonth`/`getDate` **locales**: sirve para
«hoy» y se sigue usando para eso. Acá hace falta otra operación: convertir un `created_at`
(`timestamptz`, que llega en UTC) al **día calendario Bogotá** en que ocurrió. Con el navegador en
Bogotá coinciden; con el navegador en otro huso, no — y la garantía §12.5 es sobre Bogotá, no sobre el
huso del lector.

```ts
// src/utils/fechas.ts
export function diaBogota(iso: string): string  // 'AAAA-MM-DD', vía Intl con timeZone 'America/Bogota'
```

Es el **único** sitio del feed autorizado a convertir husos, y la guarda de §13.6 lo fija.
`toISOString().slice(0, 10)` sigue prohibido en todo `src/`. Lo que compra, concretamente: la captura
de Martha del 15 a las 21:00 Bogotá es `2026-09-16T02:00Z`; con un corte UTC cae bajo «mañana» y el
encabezado *Hoy* miente exactamente para las capturas de Telegram.

### 4.3 Orden y marcas mecánicas

- **Orden: `capturadoEn` descendente.** Sin excepciones.
- **Rango del hecho completo siempre que haya más de una fecha.** Nunca «varios días».
- **El año se imprime cuando difiere del año de la captura.** Comparación de dos enteros, sin umbral, y
  es lo único que hace saltar la fila de `2025-09-14`.
- **«con fecha futura»** si alguna fecha del hecho es `> hoyBogota`. Binario.

**Aviso al CPO, no un problema del plan:** esa marca va a disparar por una causa que no es un error de
tecleo. `telegram/conversations/gasto.ts:994` (y también `:273`) fija `fecha` con `new Date().toISOString().split("T")[0]`
y las *edge functions* corren en UTC, así que un gasto capturado por Telegram después de las 19:00
Bogotá nace con fecha de mañana — el mismo defecto que `CLAUDE.md` documenta con 12 filas históricas.
**No se arregla en este plan**; el feed haciéndolo visible es el feed funcionando.

### 4.4 Cifras que no se recalculan (§12.12)

| Cifra | De dónde sale | Nunca |
|---|---|---|
| «52 **de 65** vacas» | `contarVacasActivas(animales)` de `@/utils/hatoAlertasTablero`, la misma que usa `usePulsoHato` | un `count` propio ni `categoria === 'hato'` |
| «43,5 jornales» | suma de `registros_trabajo.fraccion_jornal` de las filas traídas | re-derivarla desde `costo_jornal` |
| «9 personas» | `empleado_id ?? contratista_id` distintos | un `join` a `contratistas` — Gerencia+Administrador desde la 123, levantaría otro muro |
| «35 vacas» del chequeo | `hato_chequeo_vacas(count)` embebido en el `select` | una segunda consulta |

El denominador del pesaje hereda una aproximación conocida de `usePulsoHato`: cuenta las vacas activas
**de hoy**, no las del día del pesaje. Se hereda a propósito — una segunda respuesta a la misma
pregunta sería peor que una aproximación compartida.

---

## 5. Autor y canal, fuente por fuente

| Fuente | Autor | Tipo | Canal | Módulo | Gate |
|---|---|---|---|---|---|
| `hato_eventos` | `created_by` → `auth.users` | uuid | **`fuente`** (`web`\|`telegram`\|`importacion`\|`alerta`\|`chequeo`) | `hato_lechero` | módulo |
| `hato_pesajes_leche` | `created_by` | uuid | `fuente` (TEXT libre, sin CHECK) | `hato_lechero` | módulo |
| `hato_tratamientos` | `created_by` | uuid | `fuente` (CHECK, migración 140) | `hato_lechero` | módulo |
| `hato_chequeos` | `created_by` | uuid | `fuente` (`web`\|`importacion`) | `hato_lechero` | módulo |
| `registros_trabajo` | `registrado_por` (074) | uuid | **ninguno** | `aguacate` | módulo |
| `monitoreos` | `user_id` (074) | uuid | **ninguno** | `aguacate` | módulo |
| `movimientos_diarios` | `created_by` (existe; sin trigger) | uuid | **ninguno** | `aguacate` | módulo |
| `fin_gastos` | `created_by` (050) | uuid | **ninguno** | `finanzas` | **módulo + rol Gerencia** |

**`monitoreos.monitor` es texto y NO es el autor.** Es quién caminó la ronda; el capturador es
`user_id`. La línea puede decir las dos cosas, nunca confundirlas.

**El canal sólo existe en las 4 fuentes del hato.** Las otras cuatro no tienen columna de la que
derivarlo, y **no se infiere**: hoy «autor presente ⇒ web» sería cierto por accidente y dejaría de
serlo el día que F5 arregle la atribución de Telegram. Donde no hay columna, el metadato de canal **se
omite** — omitir un metadato no es mentir; escribir «por la web» sin evidencia sí. Contradice el
ejemplo de §4.1 del brief: punto para el CPO (§17.1).

`hato_pesajes_leche.fuente` es TEXT libre: el catálogo mapea los valores conocidos y cualquier otro
produce **ningún canal**, nunca una etiqueta inventada. Y `movimientos_inventario.responsable` (fuente
*Should*) se intenta resolver por correo; si no resuelve, se pinta **la cadena tal cual**, sin
normalizar y sin adivinar (§12.7).

---

## 6. Arquitectura: archivos y contratos

```
src/utils/novedades/
  tipos.ts        NovedadCruda · Novedad · GrupoDia · ErrorModulo · FuenteNovedad
  catalogo.ts     una entrada por fuente: modulo, rol, grano, plantilla, ruta, cargador
  fuentes/        un archivo por fuente: hatoEventos.ts, registrosTrabajo.ts, …
  agrupar.ts      PURO: sesiones, rangos, nombres (hasta 3 + "y N más"), tope de 20
  frases.ts       PURO: plantillas con ranuras tipadas. Cero LLM, cero concatenación libre
src/components/dashboard/
  Novedades.tsx          los 5 estados de §4.4, móvil 3 / escritorio 5
  NovedadLinea.tsx       hecho · detalle · captura. Mínimo 44 px en móvil
  hooks/useNovedades.ts  SÓLO I/O: Promise.allSettled por módulo + el RPC de autor
src/utils/fechas.ts      + diaBogota(iso)
```

**`NovedadCruda` es el contrato entre cargadores y agrupador.** Una fuente nueva implementa esta forma
y aparece en el catálogo; el agrupador no cambia nunca.

```ts
interface NovedadCruda {
  fuente: FuenteNovedad;
  modulo: ModuloNovedad;                 // 'hato_lechero' | 'aguacate' | 'finanzas' | 'ganado'
  tipoHecho: string;                     // 'servicio', 'parto', 'jornal', 'gasto'…
  claveGrano: string;                    // §4.1 — la declara la fuente, no el agrupador
  autorId: string | null;                // uuid. NUNCA un nombre
  autorTextoLibre: string | null;        // sólo movimientos_inventario
  canal: CanalNovedad | null;            // null = la fuente no tiene de dónde saberlo
  capturadoEn: string;                   // created_at, ISO con huso
  fechaHecho: string | null;             // 'AAAA-MM-DD'; null = la fuente no tiene fecha del hecho
  objetoNombre: string | null;           // 'ELECTRA (#117)'
  tamano: { filas: number; objetos?: number; denominador?: number };
  ruta: string | null;                   // destino de la navegación
}
```

**`frases.ts` no concatena.** Cada plantilla es una función con parámetros tipados que devuelve una
estructura (`{ sujeto, verbo, objeto, detalle[] }`) y el componente la pinta. Es el mecanismo de
ranuras tipadas del motor que se retira; acá no hay modelo, así que la ranura sólo protege contra un
error de programación — se conserva porque cuesta lo mismo y hace triviales las pruebas de §13.2.

**Nada de esto importa React ni `@/utils/supabase/client`.** Es la condición para que, si Esco lo
consume (v2), el espejado a Deno sea un generador mecánico —`regenerar-copias-acciones.sh`,
`regenerar-copias-importhato.py`— y **jamás** una copia a mano. La ironía no se me escapa: el script
que se borra en F4 es el modelo del que se escribiría después.

---

## 7. RLS, roles y estados honestos

**Los tres gates, en este orden.** (1) **Módulo:** `puedeAccederModulo(profile, modulo)` de
`src/utils/modulosAcceso.ts`, la misma función pura del sidebar y de `ModuleGuard`; **nunca se
reimplementa**, ni en TS ni en SQL — es el motivo por el que la opción (B) no puede llevar el gate
adentro. (2) **Rol, para finanzas:** `hasModulo('finanzas') && profile.rol === 'Gerencia'`, la línea
`puedeGastos` que `Dashboard.tsx:63` ya tiene; se reutiliza y **se decide antes de consultar**, que es
la garantía §12.6 — para un Administrador con el módulo concedido la consulta a `fin_gastos` volvería
vacía por RLS, y vacío es indistinguible de «no hubo gastos». (3) **RLS de la base** como red, que no
se salta: por eso el RPC de §3 devuelve nombres y no filas de dominio.

**Ganado** (*Should*): `fin_transacciones_ganado` es Gerencia-only igual que el resto de `fin_*`, así
que una novedad de venta necesita el **mismo gate por rol** que finanzas aunque el módulo se llame
`ganado`. **Quincena de leche** (*Should*): Gerencia-only entera (§5 del brief) — los litros de una
fila `medido` viven en `fin_ingresos.cantidad` por FK y `litros_total` es NULL por contrato.

| Estado | Condición | Regla dura |
|---|---|---|
| Con novedades | ≥1 línea | 5 visibles en escritorio, 3 en móvil, tope de 20 aun expandido |
| Ventana vacía | 0 líneas, 0 errores | Nombra **los módulos del lector** con las etiquetas de `MODULOS` en `modulosAcceso.ts` (no se reescriben). **Jamás «0 novedades»** |
| Captura masiva | — | Nada especial: el grano ya colapsó; la línea declara su tamaño |
| Una fuente falla | ≥1 módulo rechazado | Las demás se pintan; línea gris nombrando el módulo. **Un fallo nunca vacía el feed ni se calla** |
| Cargando | — | *Skeleton* de 3 líneas del tamaño final |
| **Truncado** *(añade este plan)* | `fetchAll` devolvió `truncado: true` | Nota explícita en ese módulo y **sus cifras no se publican como totales** (§8.3) |

**Cero módulos (Uriel):** el bloque devuelve `null`, igual que `AccionesRecomendadas` hoy. El mensaje
que pide U5.4 **no existe hoy en ningún sitio del tablero**: es un cambio de nivel tablero, no del
bloque. Punto para el CPO (§17.3).

---

## 8. Frescura, rendimiento y presupuesto de consultas

**Frescura (§12.1).** La lectura es en vivo: la latencia entre la captura y su aparición es el tiempo
hasta la próxima carga de la pantalla, no un intervalo del sistema. Para el Momento A (abrir el
teléfono a las 6:00) eso es cero. El caso que queda —una pestaña abierta toda la noche— se resuelve
con **una recarga al volver a primer plano** (`document.visibilitychange` → `visible`), sin
temporizador, sin botón y sin control en pantalla (§4.4 del brief: cero controles). **Realtime
descartado:** ocho suscripciones para un bloque al que el brief le permite ser el más lento; además
respeta la RLS, así que reintroduce el muro de §3 por otra puerta, y añade un segundo camino de datos
que puede contradecir al primero.

**Presupuesto (§12.2).**

| Lector | Consultas nuevas | Que devuelve el retiro |
|---|---|---|
| Gerencia (4 módulos) | 9 (4 hato + 3 aguacate + 1 finanzas + 1 RPC de autor) | 2 de `useAccionesRecomendadas` + 3 de `useGanadoParaAcciones` |
| David (`aguacate`) | 4 (3 + RPC) | las mismas, salvo las de ganado |
| Fernando (`hato_lechero`) | 4–5 (3–4 + RPC) | ídem |
| Uriel (`{}`) | **0** — el bloque no se monta | — |

Dos mecanismos bajan el número sin caché: **un cargador no consulta el módulo que el lector no tiene**
(el gate vive en si el cargador se llama, igual que `usePulsoHato` documenta para su tarjeta), y **las
consultas de segundo nivel sólo se disparan si la de primer nivel trajo filas** — el denominador del
pesaje (`hato_animales`) sólo se pide si hubo pesajes, y hubo pesaje **1 día de cada 30**; en la
práctica el hato son 4 consultas casi siempre.

**Camino crítico.** `Novedades` monta después de `RequiereDecision` en el árbol de `Dashboard.tsx` y
sus efectos no bloquean el pintado de aquél. Lo que hay que cuidar es no meter el hook por encima de
`useRequiereDecision` y **no compartir estado** entre los dos. Se verifica en la revisión del PR.

**§8.3 El tope de 1.000 filas — no es un detalle.** `monitoreo/CargaMasiva` inserta un CSV entero en
una sesión. Una carga de 4.200 lecturas en la ventana se leería truncada a 1.000 **sin ningún error**,
y la línea diría «David registró 1.000 lecturas»: cifra inventada, o sea K-3, en la pantalla
principal. **Regla del plan:** toda fuente se lee con `fetchAll` (`src/utils/supabase/fetchAll.ts`),
`maxPaginas: 5`. Para las fuentes livianas es exactamente una ida y vuelta —una página corta termina
el bucle— así que no cuesta nada el 99 % de los días; si `truncado` vuelve `true`, ese módulo entra en
el sexto estado de §7 y no publica totales. La regla general que deja escrita: **`fetchAll` completo
para lo que tiene que estar completo; `fetchAll` con tope y bandera declarada para lo que es una
ventana. Un `.limit()` pelado no sirve para ninguno de los dos.**

---

## 9. Instrumentación de M-4 y M-5

El bloque que se retira murió **sin poder evaluarse** porque nadie registró los clics: el umbral K-2
de su propio contrato no se puede medir hoy ni se podrá nunca. Es barato sólo el día uno (§12.8).

**Tabla `novedades_uso`** (migración 155), una fila por evento: `id`; `tipo` (`expansion` = M-4 |
`navegacion` = M-5, CHECK, sin tercer valor «por si acaso»); `fuente_novedad` (la fuente de la línea
para M-5, NULL para M-4); `usuario_id` (`auth.uid()` por DEFAULT); `ocurrido_at`.

**Sin texto libre y sin `jsonb` de carga.** No guarda la frase ni el id del objeto: la pregunta que
contesta es «¿alguien leyó más allá de la primera pantalla y llegó a mirar algo?», y cualquier columna
de más invita a usarla para otra cosa.

**RLS y grants:** `INSERT` para `authenticated` con `WITH CHECK (usuario_id = (SELECT auth.uid()))` —
es lo único que el feed escribe en toda su vida (§12.10), y el `WITH CHECK` impide registrar uso
ajeno; `SELECT` **Gerencia-only** vía `(SELECT public.es_usuario_gerencia())`, porque es telemetría
sobre personas con nombre; **sin política de `UPDATE` ni de `DELETE`**, ni para Gerencia — es un
registro de sucesos; `REVOKE ALL … FROM anon` (trampa 081).

**Escritura desde el navegador: dispara y olvida.** Nunca bloquea el render, nunca reintenta, nunca
muestra un error — el patrón exacto del `PATCH` de `caducada_at` en `useAccionesRecomendadas.ts`.
Volumen: una decena de filas al día; **no hace falta cron de poda en la v1**, y decirlo evita que
alguien lo añada por prudencia.

---

## 10. Modelo de datos y migraciones

**`155_novedades_autor_y_uso.sql` — aditiva, cero filas afectadas.** (1) `CREATE TABLE
public.novedades_uso` + RLS + grants (§9). (2) `CREATE FUNCTION public.fn_novedades_autores(uuid[])`,
`SECURITY DEFINER`, `STABLE`, `search_path = public, pg_temp`, `EXECUTE` sólo para `authenticated` y
`service_role` (§3). (3) Post-condiciones: `anon` sin ningún privilegio sobre la tabla ni `EXECUTE`
sobre la función, y `prosecdef = true` con `proconfig` pineado — comprobado contra `pg_proc`, **no**
con un `ILIKE` sobre `pg_get_functiondef` (lección de la 130: el DDL omite lo que es *default*).

**`156_retirar_acciones_recomendadas.sql` — cero filas afectadas.**
(1) `SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname = 'acciones-recomendadas-tick';`
**Por nombre, nunca por el literal `6`** — un `jobid` copiado de un documento es el mismo error de
clase que el literal `1910` de la 103 y el `4000` de la 120. (2) `COMMENT ON TABLE` en las cuatro
tablas de la 101 con la fecha de retiro y el enlace a este documento (precedente: la 128 con
`vista_resumen_verificaciones`). (3) Guarda previa: aborta si el job no existe o si hay más de uno con
ese nombre. (4) **Bloque ROLLBACK ejecutable al pie** con el `cron.schedule` original de la 102,
literal.

**Ninguna edita una migración aplicada.** La 101 y la 102 no se tocan; lo que se actualiza es su
**entrada en `CLAUDE.md`**, con la nota de retiro y la fecha.

**§10.3 Números.** El repositorio llega a **154**; el **150** está ocupado en
`origin/claude/po-datos-15-15-15-prueba`; del **155** al **160** están libres en todas las ramas de
`origin` al 2026-09-16. **No puedo consultar el *ledger* de Supabase desde este worktree, y el
*ledger* tampoco es autoritativo.** La sesión que implemente re-barre las tres fuentes que manda
`CLAUDE.md` —ficheros en `main`, `supabase_migrations.schema_migrations`, esquema `respaldos`— **más
las ramas de `origin`**, que es la fuente que causó las tres renumeraciones forzadas de las últimas dos
semanas:

```sh
git fetch origin --prune
for r in $(git for-each-ref --format='%(refname)' refs/remotes/origin); do
  git ls-tree -r --name-only "$r" -- src/sql/migrations/ 2>/dev/null | grep -E "/155_" && echo "OCUPADO en $r"
done
```

---

## 11. Retiro de «Acciones recomendadas»

**§11.1 Qué se borra.**

| Categoría | Archivos |
|---|---|
| Componentes | `dashboard/AccionesRecomendadas.tsx`, `dashboard/AccionCard.tsx` |
| Hooks | `dashboard/hooks/useAccionesRecomendadas.ts`, `dashboard/hooks/useGanadoParaAcciones.ts` |
| Utils | `utils/acciones{Cotejo,Hechos,Orden,RecomendadasEstado,Render,Tipos,Validador}.ts` |
| Tipos | `types/acciones.ts` |
| Edge | `acciones-{hechos,motor,orden,paquete,paquete-io,render,tick,tipos,validador}.ts` **en los dos árboles** (9 × 2) + la ruta `POST /make-server-1ccce916/acciones/tick` y su `import` en `index.tsx` |
| Tests | los 11 `src/__tests__/acciones*.test.ts(x)` |
| Script y docs | `docs/acciones/regenerar-copias-acciones.sh`; `plan_motor_acciones_recomendadas.md`, `brief_tecnico_motor_acciones.md`, `set_referencia_acciones.md` → `docs/archive/` |

**Lo que NO se borra, y es el hallazgo del inventario:**

- **`NegocioAccion`**, el tipo `'hato_lechero' | 'aguacate' | 'ganado'` que hoy vive en
  `utils/accionesTipos.ts`, **lo usa `PulsoNegocio.tsx`**, que no se retira, y `Dashboard.tsx` para
  construir la lista de negocios. Borrar `accionesTipos.ts` rompe el bloque 3. **Se reubica** —
  propuesta: `src/utils/negociosTablero.ts`, junto con las etiquetas y rutas por negocio que hoy están
  duplicadas en `AccionesRecomendadas.tsx` y `AccionCard.tsx` y que Novedades también necesita.
- `useGanadoParaAcciones` **sí se borra**: único consumidor `Dashboard.tsx`, sólo para el cotejo.
  Repetir el `grep` antes de borrar, no confiar en esta línea.
- **`finTransaccionesGanadoEsHatoGuard.test.ts`** apareció en el listado por buscar `acciones*`:
  **no** es del motor. Comprobar el nombre exacto de cada test antes de borrarlo.
- **`hato-aggregation.ts:397`** nombra `accionesHechos.ts` **en un comentario**, no lo importa: se
  actualiza el comentario, no se rompe nada.

**§11.2 Las cuatro tablas de la 101: se conservan, sin migración de borrado, ni ahora ni después.**
Son la **única** evidencia de las 32 corridas, las 120 acciones y los 8 descartes si alguien reabre
esto, y el brief lo pide explícitamente. No cuestan nada: pequeñas, ya endurecidas por la 101, y tras
el retiro nadie las escribe. Un `DROP` es irreversible y no compra nada; lo que sí se hace es el
`COMMENT ON TABLE` de §10 — una tabla sin lector y sin comentario es una trampa para el próximo que la
encuentre. **`revisiones_periodicas` se conserva con más motivo:** es el huérfano O-8 del brief, tiene
4 filas sembradas y su destino declarado es Salud de los datos; borrarla mataría en silencio una
necesidad que el dueño sí declaró.

**§11.3 El secreto y el cron.** Orden: (1) aplicar la 156 (`cron.unschedule`); (2)
`npx supabase functions deploy make-server-1ccce916` sin la ruta; (3) borrar `ACCIONES_TICK_SECRET` de
los secretos de la *edge function* y `acciones_tick_secret` de Vault. Si alguien invierte 2 y 3 el
endpoint responde **503** (falla cerrada, nunca abierta), el mismo contrato que `CLIMA_SYNC_SECRET`:
no hay ventana peligrosa en ningún orden, pero conviene que el cron muera primero para que ningún
`net.http_post` quede volando. **En `CLAUDE.md` el secreto no se borra de la lista: se tacha**, con
fecha y motivo — el estilo que ya tiene la entrada de `HATO_ALERTAS_ESCALAMIENTO_TELEGRAM_ID`. Una
lápida cuesta una línea y evita que alguien lo reintroduzca.

**§11.4 Secuencia respecto del bloque nuevo: dos PR, un solo release.**
**PR 1 (F1–F3):** migración 155, `diaBogota()`, núcleo puro, cargadores, pantalla y pruebas.
**`Novedades` NO se monta** — Vercel despliega `main` solo, así que montarlo acá pondría los dos
bloques en producción a la vez, justo lo que §7 del brief prohíbe. **PR 2 (F4):** un commit que monta
`Novedades`, desmonta y borra `AccionesRecomendadas`, reubica `NegocioAccion`, aplica la 156 y
actualiza los documentos. Es el PR pequeño que el dueño mira y el que se puede revertir de una pieza.

**Consecuencia conocida de la carga diferida.** El PR 2 retira *chunks* con hash que una pestaña
abierta podría pedir; `vercel.json` reescribe todo a `index.html`, así que el navegador recibe HTML y
se queja del tipo MIME — un mensaje que no se parece a lo que pasó. **Ya está cubierto** por
`RouteErrorBoundary` desde el arreglo del 2026-09-08. No hace falta nada nuevo; hace falta no romperlo.

**Si Santiago elige D-3 (b) o (c):** con (b) los dos bloques conviven un mes, el PR 2 se parte en dos y
el retiro se difiere, con el costo que el propio brief describe. Con (c) se retira la pantalla pero
**no** se aplica la 156, y el motor sigue pagando una llamada al modelo por día. En los dos casos el
resto del plan no cambia.

---

## 12. Atribución del bot de Telegram

**No es prerrequisito de la v1, y sí es del mismo release.** *No bloquea* porque en los últimos 30
días **el 100 %** de los jornales, gastos y monitoreos entró por la web, así que el feed lee correcto
el día uno — y el brief ya bendice el hueco. *Va en el mismo release* porque cuesta poco, arregla un
agujero de calidad de dato independiente de este bloque, y M-3 (cobertura de atribución, hoy ≈ 97 %)
es una de las tres métricas de la revisión: si el primer `/jornal` ocurre durante la ventana de
evaluación, M-3 cae y el hallazgo se confunde con un fallo del bloque.

| Archivo | Trabajo | Tamaño |
|---|---|---|
| `telegram/conversations/monitoreo.ts` | **Una línea.** Ya carga la fila de `telegram_usuarios` completa (`select("*")`, línea 67): basta `user_id: user.usuario_id` en el `record` | S |
| `telegram/conversations/jornal.ts` | Añadir la búsqueda de `telegram_usuarios` (patrón de `eventoHato.ts:856-865`) y `registrado_por` en las filas de `insertRegistros` **y** en el camino de reemplazo de duplicados | S |
| `telegram/conversations/gasto.ts` | Ídem, `created_by` en el `insert` de `fin_gastos` | S |
| `telegram/conversations/ingreso.ts` | Ídem, `created_by` en el `insert` de `fin_ingresos` | S |

**Los dos árboles en el mismo commit**, y `npx supabase functions deploy make-server-1ccce916` después;
el único riesgo real de la fase es desplegar un árbol y no el otro. **No arregla, a propósito,** el
`toISOString().split("T")[0]` de `gasto.ts` (§4.3): es otro defecto, con su propio ticket, y mezclarlo
haría que un cambio de atribución tocara la fecha de un gasto.

---

## 13. Pruebas

1. **`novedadesAgrupar.test.ts`** — puro, con *fixtures* de los casos reales de producción: la sesión
   de 66 filas / 43,5 jornales / 9 personas / 6 fechas del 12-sep; las 8 filas del 15-sep con
   `2025-09-14` (el año **debe** imprimirse); un gasto con fecha futura; un pesaje 52/65; una ronda que
   cruza dos días naturales (una sola línea); dos autores el mismo día con el mismo tipo (**nunca** se
   funden); una fila con autor NULL.
2. **`novedadesFrases.test.ts`** — una prueba por plantilla: ninguna cifra sin su unidad; el literal
   exacto «sin autor registrado»; hasta 3 nombres y luego «y N más»; el denominador del pesaje nunca
   desaparece.
3. **`novedadesDiaBogota.test.ts`** — reloj fijo: `2026-09-16T02:00:00Z` cae bajo el día **15**;
   `04:59:59Z` bajo el 15 y `05:00:00Z` bajo el 16. Más la regresión que explica por qué existen las
   dos funciones: `obtenerFechaHoy()` y `diaBogota(now)` coinciden en Bogotá y pueden diferir fuera.
4. **`novedadesComponentes.test.tsx`** — los seis estados de §7; que el vacío nombre los módulos del
   lector; que el error de un módulo no borre las líneas de los otros; 3 en móvil y 5 en escritorio;
   el tope de 20 respetado al expandir.
5. **`novedadesFuentesAdmitidasGuard.test.ts`** — **guarda estática**, modelada sobre
   `climaTablaCorrectaGuard.test.ts` (lista blanca con motivo, comentarios descartados antes de
   buscar). Extrae todo `.from('<tabla>')` de `src/utils/novedades/` y de `useNovedades.ts` y falla si
   aparece una tabla fuera del catálogo admitido. Es la forma mecánica de hacer cumplir N-1:
   `hato_alertas`, `acciones_*`, `clima_*` y `logs_auditoria` no pueden entrar por descuido.
6. **Extender `hatoFechaLocalGuard.test.ts`** a `src/utils/novedades/` y a los componentes nuevos, y
   para que `diaBogota()` sea el **único** sitio de `src/` autorizado a nombrar `America/Bogota` o a
   usar `Intl.DateTimeFormat` con `timeZone`.
7. **Paridad Deno: ninguna en la v1**, porque no se espeja nada. Si Esco consume el feed (v2), la
   prueba de paridad nace junto con el generador, nunca después.

---

## 14. Plan por fases

| | Fase | Entregables | Criterio de aceptación | Compl. | Depende |
|---|---|---|---|---|---|
| **F0** | Decisiones | D-1…D-5 respondidas; los cinco puntos de §17 resueltos | Ninguna pregunta de §17 abierta | **S** | — |
| **F1** | Fundación | Migración 155 aplicada y verificada; `diaBogota()` + prueba; `tipos.ts` y `catalogo.ts` vacío; `NegocioAccion` reubicado | `fn_novedades_autores` devuelve a un Administrador el nombre de otro usuario; `anon` sin `EXECUTE`; `npm test` verde | **S/M** | F0 |
| **F2** | Núcleo puro | `agrupar.ts`, `frases.ts`, los 8 cargadores *Must*, pruebas 1–3 y 5 | Las *fixtures* de producción producen las frases de §4.1 del brief **literalmente** | **M/L** | F1 |
| **F3** | Pantalla | `Novedades.tsx`, `NovedadLinea.tsx`, `useNovedades.ts`, instrumentación M-4/M-5, prueba 4. **No se monta** | Los 6 estados se ven en pruebas; `novedades_uso` recibe filas al expandir y al navegar | **M** | F2 |
| **F4** | Intercambio *(el release)* | Monta Novedades; borra el motor (§11.1); migración 156; despliegue de *edge function*; borrado de secretos; `CLAUDE.md`, `docs/README.md`, archivo de los 3 documentos | El tablero muestra Novedades y **no** Acciones; `cron.job` sin `acciones-recomendadas-tick`; `npm run lint` y `npm test` verdes | **M** | F3 |
| **F5** | Atribución de Telegram *(paralela)* | Los 4 archivos × 2 árboles; despliegue | Un `/jornal` de prueba deja `registrado_por` poblado | **S/M** | ninguna |
| **F6** | Pulido y revisión | Fuentes *Should*; fecha de revisión en el calendario; E-1/E-2 congeladas | La revisión de las 6 semanas tiene fecha antes de cerrar F4 | **S** | F4 |

**Hitos.** M1 = fin de F1: la base soporta el feed. M2 = fin de F2: el criterio existe y está probado
sin una línea de React. M3 = fin de F3: la pantalla existe y no se ve. **M4 = fin de F4: el release.**
M5 = fin de F6: el bloque es evaluable.

**Qué debe estar resuelto antes de cada fase.** F1 → los cinco puntos de §17 y el número de migración
re-barrido. F2 → la redacción exacta de las 8 plantillas (sale de §2.3 del brief; el detalle de «y N
más» y la puntuación se congelan acá). F3 → nada nuevo. F4 → confirmación del dueño de que el motor se
retira ese día (es irreversible en la práctica, aunque el ROLLBACK exista). F6 → M-1/M-2/M-3 con dos
semanas de datos.

---

## 15. Riesgos técnicos

| | Riesgo | Mitigación |
|---|---|---|
| **R1** | El **muro de RLS de `usuarios`** deja sin nombre 4 de 10 cuentas | El RPC de §3, más la guarda estática que impide «simplificar» con el `join` directo |
| **R2** | **Truncado silencioso a 1.000 filas** en un día de carga masiva → cifra inventada (K-3) | `fetchAll` en todas las fuentes + estado de truncado declarado (§8.3) |
| **R3** | Borrar `accionesTipos.ts` **rompe el bloque 3** (`PulsoNegocio`) | `NegocioAccion` se reubica en F4; `grep` obligatorio antes de cada borrado |
| **R4** | Desplegar un árbol de *edge function* y no el otro en F5 | Los dos árboles en el mismo commit y `deploy` inmediatamente después |
| **R5** | **El número de migración se lo lleva una rama paralela** — tres veces en dos semanas | Barrido de `origin/*` con `git ls-tree` justo antes de escribir el fichero (§10.3), no `ls` del directorio |
| **R6** | «Con fecha futura» dispara por el defecto UTC de `gasto.ts` y se lee como falso positivo | Avisado al CPO (§17.5); el defecto tiene su propio ticket; el feed está haciendo su trabajo |
| **R7** | Una pestaña abierta rompe al retirar los *chunks* del motor | `RouteErrorBoundary` ya cubre ese modo de falla; no tocarlo |
| **R8** | El agrupamiento se «mejora» con una heurística (fusionar autores, adivinar canal) y el feed empieza a mentir | Pruebas 1, 2 y 5, y la regla escrita: **ante una forma inesperada se degrada a líneas sueltas — jamás se inventa un agrupamiento** (el criterio que la 100 aplicó a los traslados de ganado) |
| **R9** | La telemetría de §9 se convierte en bitácora de auditoría por acumulación de columnas | Sin texto libre, sin `jsonb`, sin `UPDATE`; y `logs_auditoria` sigue fuera de alcance por decisión de producto |

---

## 16. Lo que este plan NO hace

- **Cero LLM** en todo el camino (§12.9): las frases salen de plantillas con ranuras tipadas.
- **No cablea `logs_auditoria`.** Sigue con 0 filas y sin escritor; es otra decisión, de otro documento.
- **No crea 18 triggers `AFTER INSERT`.** La opción (A) alcanza, y la (C) ni siquiera resolvería la
  atribución (§2.1).
- **No edita ninguna migración aplicada.** La 101 y la 102 se comentan y se desprograman desde una
  migración nueva; sus ficheros no se tocan.
- **No escribe en ninguna tabla de dominio.** Lo único que el feed escribe es `novedades_uso`.
- **No añade *polling*.** El tablero hoy no tiene ninguno y este bloque no lo estrena.
- **No borra las cuatro tablas del motor** ni `revisiones_periodicas`.
- **No traslada las revisiones periódicas a Salud de los datos** ni evalúa el faltante de insumo como
  fila del bloque 1: son los dos huérfanos que §7 del brief declara para una pasada posterior. **Si no
  se hacen, se pierden** — este plan los deja nombrados, no resueltos.

---

## 17. Lo que este plan le devuelve al CPO

Cinco puntos. No los resuelvo: los marco.

1. **El canal no es derivable en 4 de las 8 fuentes *Must*.** Sólo el hato tiene columna `fuente`;
   `registros_trabajo`, `monitoreos`, `movimientos_diarios` y `fin_gastos` no tienen ninguna, y el
   ejemplo de §4.1 del brief imprime «· por la web» justo en una línea de jornales. **Inferirlo está
   prohibido** (§12.7): «autor presente ⇒ web» es cierto hoy por accidente y deja de serlo cuando F5
   arregle la atribución de Telegram. **Propuesta:** el canal se omite donde no hay columna y el
   ejemplo del brief se corrige. La alternativa —añadir `fuente` a esas cuatro tablas— es una migración
   con su propio alcance y un *backfill* imposible: la historia no sabe por dónde entró.
2. **`aplicaciones` y `produccion` no tienen autor, confirmado contra el esquema** — el brief ya lo
   anticipaba; lo confirmo para que no se vuelva a investigar. En cambio **sí existen** dos columnas
   que el brief marcaba con duda: `hato_produccion_quincenal.created_by` (migración 054, además del
   `updated_by` de la 070) y `movimientos_diarios.created_by`, esta última en contra de lo que dice hoy
   `CLAUDE.md`. La corrección va en F4.
3. **U5.4 (Uriel, sin módulos) no tiene dónde vivir.** El mensaje «tu usuario todavía no tiene módulos
   asignados» **no existe hoy en ningún sitio del tablero**. Novedades no puede ser quien lo diga: un
   bloque que no se monta no puede hablar, y si se monta sólo para eso se apropia de un problema que
   comparten los otros seis bloques. **Propuesta:** cambio de nivel `Dashboard.tsx`, fuera del alcance
   de este feature. Decide el CPO si entra igual.
4. **La navegación desde la línea (U1.6, U3.3) sólo existe para dos fuentes.**
   `/hato-lechero/hato/:id` y `/hato-lechero/chequeos/:id` aceptan un id; **`/labores` sólo acepta
   `?vista=`, `/monitoreo` no acepta filtro por ronda y `/finanzas/gastos` no acepta filtro por
   fecha.** Las tres necesitarían trabajo de filtros en sus propias pantallas. **Propuesta para la
   v1:** la línea navega a la pantalla del módulo **sin filtro aplicado**, que ya cumple «pasar de
   enterarme a mirar»; el filtro preaplicado se costea aparte. Si el CPO lo quiere en la v1, sube una
   talla y toca tres módulos ajenos.
5. **«Con fecha futura» va a disparar la primera semana por un defecto del servidor, no por un error de
   tecleo** (§4.3). Es correcto que el feed lo muestre; lo que hay que decidir es si el ticket de ese
   defecto entra en el mismo release para que la métrica de la revisión no quede contaminada.

**Nada del brief me parece técnicamente infactible.** Las cuatro garantías más duras —frescura menor a
10 minutos, fuera del camino crítico, degradación por fuente con la fuente nombrada, y el gate de rol
viajando con el dato— se cumplen con la arquitectura de §2, y la única que exigió una excepción (el
autor, §3) se resuelve con una función de tres columnas y una guarda.
