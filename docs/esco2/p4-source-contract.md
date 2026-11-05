# Esco 2.0 P4: contrato de fuentes de monitoreo, clima y hato lechero

Fecha: 2026-11-05. Base de inspección: `main` `1dabf041` (P3 integrado y registro de v6).
**Contrato documental verificado contra catálogo. No autoriza implementación.**
Santiago autorizó únicamente preparar este contrato, la división de tareas y los oráculos.
No se ejecutan runtime P4, runner P4, modelos, deploy, migraciones ni escrituras productivas.
No se modifican `chat.tsx`, los árboles de servidor legado, Telegram ni `make-server-1ccce916`.
D17: held-out y su hoja permanecen cerrados. El documento público contiene esquema y reglas;
no contiene filas, casos, referencias, respuestas, identificadores productivos ni trazas.

## Autoridad y verificación

Fuentes de significado inspeccionadas: [contrato P3](p3-source-contract.md), sección Monitoring
del `CLAUDE.md` raíz, sus entradas 068, 103, 115, 122, 151, 158, 159 y 183, y
`src/components/hato/CLAUDE.md`. Los motores y lectores del módulo precisan las reglas;
las migraciones y los tipos locales identificaron qué contrastar; el catálogo vivo confirma
columnas, tipos, NULL permitidos, PK/FK, UNIQUE/índices parciales, CHECK y políticas de lectura.

**Verificación viva realizada el 5 de noviembre de 2026**, por CTO y QA independiente,
exclusivamente con Composio `SUPABASE_RUN_READ_ONLY_QUERY`, cuenta `escocia-os`, proyecto
autorizado de la organización `thinksid`. Tras reparar la conexión original, esta ruta funciona;
los rechazos 403 iniciales no se tomaron como prueba de ausencia de esquema ni motivaron otro
canal de acceso. D38–D41 están resueltas por Santiago en esta tarea; D42 precisa la unidad de
agregación existente a partir de su aclaración y del lector de tendencias del módulo.

Se contrastaron `information_schema.columns`, constraints e índices únicos, CHECK,
`pg_policies`, `relrowsecurity`, ACL/grants y, para la vista del hato,
`security_invoker` y sus dependencias reales. Que una lectura administrativa funcione no
demuestra permisos de un JWT de Gerencia; eso se comprobará después en pruebas autorizadas.

Consulta reproducible de columnas (metadatos, sin filas de negocio):

```sql
SELECT table_name, column_name, data_type, udt_name, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name IN (
    'monitoreos','rondas_monitoreo','mon_conductividad','sublotes','lotes',
    'plagas_enfermedades_catalogo','clima_resumen_diario',
    'hato_animales','hato_toros','hato_eventos','hato_chequeos','hato_chequeo_vacas',
    'hato_config','v_hato_estado_actual','hato_pesajes_leche',
    'hato_produccion_quincenal','fin_ingresos')
ORDER BY table_name, ordinal_position;
```

Sobre ese mismo conjunto se contrastaron `pg_get_constraintdef` (PK/FK/UNIQUE/CHECK),
`pg_indexes` (también índices únicos parciales), `pg_policies` (`SELECT` y `ALL`),
`pg_class.relacl/reloptions` y `has_table_privilege` para `anon` y `authenticated`.
`information_schema.role_table_grants` no devolvió filas al rol lector; se comprobó el ACL en
catálogo en vez de interpretar esa ausencia como falta de grants. Se leyó la definición de la
vista y sus cuatro dependencias: no sustituye comprobar su población con un JWT concreto.
No llamar RPCs: en particular `fn_clima_rollup_diario` escribe y poda lecturas globalmente.

Cobertura publicada solo como conteos: total de filas por tabla, NULL por campo usado,
vínculos NULL/huérfanos, claves repetidas y contradicciones de denominador; en clima,
días con/sin cada variable, confianza de lluvia y metadato de hueco presente/ausente;
en hato, número de hechos disponibles por animal y quincenas por origen/ingreso legible.
No copiar filas ni valores de configuración, nombres, fechas particulares o JSON de negocio al repo.
Consultas y resultados completos permanecen locales fuera de Git; el contrato recibe solo
metadatos y agregados. Las tablas de contraste al final registran todas las columnas utilizadas.

## Catálogo vivo: columnas y cobertura verificadas

Las 123 columnas de lectura y soporte listadas aquí existen en las 17 relaciones; se verificaron
sus tipos y NULL permitidos. `?` significa nullable según PostgreSQL, no dato necesariamente
faltante. La vista marca todas sus columnas nullable en catálogo; sus conteos efectivos se leen
aparte. `uuid`, `date`, `timestamptz`, `text`, `numeric`, `int2/int4/int8`, `bool` y
`jsonb` son los tipos del catálogo. Los estados/orígenes del hato y confianza de lluvia son
`text` con CHECK, no enums supuestos por los tipos TypeScript.
Las columnas auxiliares de eventos/chequeos son dependencias comprobadas de la vista; no
conceden una herramienta nueva de lectura de notas, historial libre o dinero.

| Relación | Columnas:tipo (`?` permite NULL) |
|---|---|
| `monitoreos` | `id:uuid`, `ronda_id:uuid?`, `fecha_monitoreo:date`, `lote_id:uuid`, `sublote_id:uuid?`, `plaga_enfermedad_id:uuid`, `arboles_monitoreados:int4`, `arboles_afectados:int4` |
| `rondas_monitoreo` | `id:uuid`, `nombre:text?`, `fecha_inicio:date`, `fecha_fin:date?` |
| `mon_conductividad` | `id:uuid`, `lote_id:uuid`, `ronda_id:uuid?`, `fecha_monitoreo:date`, `valor_ce:numeric`, `lecturas:jsonb?`, `num_arboles:int4?`, `ph:numeric?` |
| `lotes` | `id:uuid`, `nombre:text` |
| `sublotes` | `id:uuid`, `lote_id:uuid`, `nombre:text` |
| `plagas_enfermedades_catalogo` | `id:uuid`, `nombre:text` |
| `clima_resumen_diario` | `fecha:date`, `station_id:text`, `temp_c_min:numeric?`, `temp_c_max:numeric?`, `temp_c_avg:numeric?`, `humedad_pct_min:numeric?`, `humedad_pct_max:numeric?`, `humedad_pct_avg:numeric?`, `viento_kmh_avg:numeric?`, `rafaga_kmh_max:numeric?`, `viento_dir_predominante:numeric?`, `lluvia_total_mm:numeric?`, `lluvia_confianza:text`, `lluvia_mm_evento:numeric?`, `radiacion_wm2_avg:numeric?`, `radiacion_wm2_max:numeric?`, `uv_index_max:int2?`, `horas_sol_duracion:numeric?`, `lecturas_count:int4`, `cobertura_hueco_max_min:numeric?` |
| `hato_animales` | `id:uuid`, `numero:int4?`, `nombre:text?`, `sexo:text?`, `etapa:text`, `raza:text?`, `estado:text`, `fecha_estado:date?`, `fecha_nacimiento:date?`, `fecha_nacimiento_confianza:text`, `madre_id:uuid?`, `padre_id:uuid?`, `padre_toro_id:uuid?`, `finca_id:uuid?`, `origen:text?`, `confianza:text`, `etapa_forzada:bool` |
| `hato_toros` | `id:uuid`, `nombre:text` |
| `v_hato_estado_actual` | `animal_id:uuid?`, `etapa:text?`, `raza:text?`, `estado:text?`, `num_partos:int8?`, `ultimo_chequeo_fecha:date?`, `ultimo_servicio_fecha:date?`, `ultimo_parto_fecha:date?`, `ultimo_secado_real_fecha:date?`, `ultima_confirmacion_prenez_fecha:date?`, `ultima_confirmacion_prenez_metodo:text?`, `ultimo_evento_fecha:date?`, `ultimo_aborto_fecha:date?`, `ultimo_estado_chequeo:text?`, `fecha_nacimiento:date?`, `etapa_forzada:bool?` |
| `hato_config` | `clave:text`, `valor:jsonb` |
| `hato_eventos` | `id:uuid`, `animal_id:uuid`, `tipo:text`, `fecha:date`, `datos:jsonb?`, `created_at:timestamptz?`, `toro_id:uuid?`, `tipo_servicio:text?` |
| `hato_chequeos` | `id:uuid`, `fecha:date` |
| `hato_chequeo_vacas` | `id:uuid`, `animal_id:uuid`, `chequeo_id:uuid`, `created_at:timestamptz?`, `pl:numeric?`, `meses_prenez:numeric?`, `fecha_secar:date?`, `fecha_probable_parto:date?`, `estado:text?` |
| `hato_pesajes_leche` | `id:uuid`, `animal_id:uuid`, `fecha:date`, `litros_total:numeric`, `litros_am:numeric?`, `litros_pm:numeric?`, `fuente:text?` |
| `hato_produccion_quincenal` | `id:uuid`, `anio:int4`, `mes:int4`, `quincena:int4`, `fecha_inicio:date?`, `fecha_fin:date?`, `origen_dato:text`, `litros_total:numeric?`, `fin_ingreso_id:uuid`, `num_vacas_ordeno:int4?`, `num_vacas_ordeno_origen:text?` |
| `fin_ingresos` | `id:uuid`, `cantidad:numeric?` |

### Claves, índices y seguridad de lectura

Las 16 tablas tienen RLS activa. Las 17 relaciones (incluida la vista) tienen grant SELECT de
objeto para `anon` y `authenticated`; eso no evita la evaluación de RLS ni demuestra acceso
anónimo a filas. No se cambiaron grants/políticas. `get_user_role()` y
`es_usuario_gerencia()` son SECURITY DEFINER con `search_path=public,pg_temp` y consultan
`auth.uid()` con `usuarios.activo=true`; la segunda exige rol Gerencia.

| Relaciones | Políticas SELECT/ALL vigentes que alcanzan lectura |
|---|---|
| `clima_resumen_diario` | `clima_resumen_select_authenticated`: SELECT a authenticated, `true`. |
| `mon_conductividad` | `Usuarios autenticados pueden leer mon_conductividad`: SELECT a authenticated, `true`. |
| `rondas_monitoreo` | `Usuarios autenticados pueden leer rondas_monitoreo`: SELECT a authenticated, `true`. |
| `monitoreos` | `Usuarios autenticados pueden leer monitoreos`: SELECT authenticated `true`; `Administrador puede todo en monitoreos` y `Gerencia acceso total`: ALL a public con `get_user_role()` correspondiente. |
| `lotes` | `Usuarios autenticados pueden leer lotes`: SELECT authenticated si `get_user_role() IS NOT NULL`; `Administrador lee lotes`: SELECT public por rol; `Gerencia acceso total`: ALL public por rol. |
| `sublotes` | `Usuarios autenticados pueden leer sublotes`: SELECT authenticated `true`; `Administrador lee sublotes`: SELECT public por rol; `Gerencia acceso total`: ALL public por rol. |
| `plagas_enfermedades_catalogo` | `Usuarios autenticados pueden leer plagas_enfermedades_catalogo`: SELECT authenticated `true`; `Administrador lee plagas`: SELECT public por rol; `Gerencia acceso total`: ALL public por rol. |
| `hato_animales`, `hato_toros`, `hato_eventos`, `hato_chequeos`, `hato_chequeo_vacas`, `hato_pesajes_leche`, `hato_produccion_quincenal` | Cada tabla tiene `<tabla>_select_authenticated`: SELECT authenticated `true`, y `<tabla>_write_admin_gerencia`: ALL authenticated si `get_user_role()` es Administrador/Gerencia. ALL también participa en SELECT. |
| `hato_config` | `hato_config_select`: SELECT authenticated `true`. |
| `fin_ingresos` | `fin_ingresos_select`: SELECT public mediante `es_usuario_gerencia()`. Solo la cantidad vinculada entra en P4. |
| `v_hato_estado_actual` | Vista `security_invoker=true`, sin política propia; respeta permisos/RLS del solicitante en `hato_animales`, `hato_eventos`, `hato_chequeos`, `hato_chequeo_vacas`. |

La amplitud de varios SELECT de módulo no es permiso de Esco: la puerta Gerencia del servidor
sigue obligatoria. La vista parte de animales e incorpora hechos por `animal_id`; no calcula
por chapeta. Sus máximos y conteos no prueban estado histórico ni completitud de captura.

| Dominio | Claves e índices comprobados relevantes para la cardinalidad |
|---|---|
| Monitoreo | PK `id` en observaciones, rondas, CE, lotes, sublotes y catálogo. FK observación→ronda/lote/sublote/plaga; CE→lote/ronda; sublote→lote. UNIQUE sublote `(lote_id,numero_sublote)`, nombres de lote y plaga. No UNIQUE de ronda/lote/sublote/plaga ni identidad de muestra. |
| Clima | PK `(fecha,station_id)`, ninguna PK global por fecha. CHECK de lluvia: `ok`, `contador_congelado`, `sin_time_piezo`, `cobertura_parcial`, `reconstruido`. |
| Ficha y hechos hato | PK `id` de tablas base; FK de madre/padre a animal y padre_toro a toros; eventos/chequeo_vacas/pesajes a animal; chequeo_vacas a chequeos. UNIQUE `(chequeo_id,animal_id)`; índice único de `lower(hato_toros.nombre)` y `hato_config.clave`. `numero` es único solo en activas no NULL; nunca clave de join. |
| Eventos hato | Índice único parcial manual `(animal_id,tipo,fecha,COALESCE(toro_id,...),COALESCE(tipo_servicio,...))` cuando `chequeo_vaca_id IS NULL`; no convierte todos los eventos en una fila por fecha. La vista usa la fecha del hecho y `created_at` como desempate solo en las selecciones que lo declaran. |
| Pesajes | UNIQUE `(animal_id,fecha)`, FK `animal_id→hato_animales.id`. |
| Quincenas | UNIQUE `(anio,mes,quincena)`; FK NOT NULL `fin_ingreso_id→fin_ingresos.id` con DELETE RESTRICT; índice único de `fin_ingreso_id` solo cuando `origen_dato='medido'`. CHECK exige litros locales NULL para medido y no NULL para derivado; meses 1–12, quincena 1/2, litros no negativos y procedencia del número de vacas cuando este existe. |

Los siguientes son agregados administrativos al corte, no población efectiva de un JWT ni
garantía de calidad futura. En cada relación, las otras columnas listadas arriba tienen 0 NULL
en las filas observadas; esto nunca permite quitar el estado NULL del contrato.

| Relación | Filas | Campos con NULL: número de filas |
|---|---|---|
| `monitoreos` | 4.346 | `ronda_id`: 86 |
| `rondas_monitoreo` | 35 | `fecha_fin`: 2 |
| `mon_conductividad` | 147 | `ph`: 147, `ronda_id`: 147 |
| `lotes` | 9 | Ninguno en las columnas verificadas |
| `sublotes` | 24 | Ninguno en las columnas verificadas |
| `plagas_enfermedades_catalogo` | 32 | Ninguno en las columnas verificadas |
| `clima_resumen_diario` | 1.985 | `cobertura_hueco_max_min`: 1853, `horas_sol_duracion`: 1858, `lluvia_mm_evento`: 1831, `lluvia_total_mm`: 54, `radiacion_wm2_avg`: 1776, `radiacion_wm2_max`: 1776, `rafaga_kmh_max`: 2, `temp_c_max`: 19, `temp_c_min`: 19, `uv_index_max`: 1776, `viento_dir_predominante`: 1757, `viento_kmh_avg`: 2 |
| `hato_animales` | 180 | `fecha_estado`: 113, `fecha_nacimiento`: 71, `finca_id`: 180, `madre_id`: 91, `padre_id`: 180, `padre_toro_id`: 179, `raza`: 177 |
| `hato_toros` | 51 | Ninguno en las columnas verificadas |
| `v_hato_estado_actual` | 180 | `fecha_nacimiento`: 71, `raza`: 177, `ultima_confirmacion_prenez_fecha`: 180, `ultima_confirmacion_prenez_metodo`: 180, `ultimo_aborto_fecha`: 173, `ultimo_chequeo_fecha`: 58, `ultimo_estado_chequeo`: 162, `ultimo_evento_fecha`: 45, `ultimo_parto_fecha`: 73, `ultimo_secado_real_fecha`: 167, `ultimo_servicio_fecha`: 75 |
| `hato_config` | 14 | Ninguno en las columnas verificadas |
| `hato_eventos` | 804 | `datos`: 662, `tipo_servicio`: 707, `toro_id`: 544 |
| `hato_chequeos` | 34 | Ninguno en las columnas verificadas |
| `hato_chequeo_vacas` | 1.513 | `estado`: 1228, `fecha_probable_parto`: 564, `fecha_secar`: 564, `meses_prenez`: 565, `pl`: 700 |
| `hato_pesajes_leche` | 807 | `litros_pm`: 3 |
| `hato_produccion_quincenal` | 87 | `litros_total`: 8, `num_vacas_ordeno`: 72, `num_vacas_ordeno_origen`: 72 |
| `fin_ingresos` | 252 | `cantidad`: 105 |

Calidad y vínculos comprobados solo como agregados:

- Monitoreo: 0 denominadores no positivos, 0 afectados fuera de `[0, monitoreados]`,
  0 sublotes de otro lote y 0 vínculos huérfanos a ronda/lote/sublote/plaga.
  Las 86 observaciones sin ronda permanecen separadas. Las 357 observaciones en 177 grupos
  con varias filas conservan su peso muestral según la precisión D42; no son duplicados probados.
- CE: 147 arreglos JSON no vacíos, 0 estructuras no array, 0 CE negativas y 0 vínculos
  huérfanos de lote/ronda. Las 147 filas sin ronda confirman la necesidad de D39; no se inventa una.
- Clima: 0 fechas solapadas entre estaciones al corte. De 1.985 filas, 54 tienen lluvia NULL
  y otras 27 son `contador_congelado` con número crudo que el resolver descarta: 81 sin lluvia
  usable. Hay 19 cotas parciales (14 con valor 0), 11 reconstruidas y 1.928 `ok`.
  0 duraciones solares no NULL con hueco conocido >45 minutos; 7 duraciones tienen hueco
  desconocido. No declarar completas estas últimas ni deducir cobertura por sensor del metadato global.
- Hato: 180 fichas y 180 filas de vista, 0 fichas sin vista, 0 parentescos huérfanos ni
  hijos de eventos/chequeos/pesajes con animal ausente. La vista no encuentra confirmación
  de preñez en 180 filas: ese NULL no convierte presunción en palpación ni autoriza inferir estado.
- Pesajes: 804 filas con ambos turnos, 3 con un solo turno, 0 jornadas históricas de solo total
  en esta población y 0 discrepancias AM+PM frente al total cuando ambos están presentes.
  El contrato conserva la jornada histórica para otras poblaciones; el turno faltante no es 0.
- Quincenas: 8 medidas y 79 derivadas. Las 8 medidas tienen `litros_total` NULL deliberado;
  las 79 derivadas tienen su partición local. Hay 0 vínculos a ingreso huérfanos y 0 cantidades
  NULL en ingresos vinculados, pero 72 quincenas sin número de vacas. Hay 36 ingresos compartidos
  por varias quincenas: el join no se suma una vez por cada hija. No usar el conteo global de
  ingresos con cantidad NULL para invalidar las quincenas cuyo vínculo sí fue leído.

## Población visible, disponibilidad y fechas comunes

- Mantener puerta de Gerencia activa en servidor y lectores con JWT del solicitante, sin service
  role. La consulta de catálogo administrativa no es la fuente de respuestas. Padres e hijos se
  intersectan por sus IDs visibles; un hijo legible no demuestra que su padre sea visible.
- Lectores fijos, columnas explícitas, paginación con conteo exacto, IDs únicos y referencias
  validadas como en `src/utils/esco2/fuente.ts`. Fallo, truncamiento o campo requerido omitido
  es **no leído**; nunca vacío. No hacer un lenguaje general de consultas.
- Distinguir **NULL registrado**, **sin fila tras lectura completa**, **cero explícito**,
  **sin vínculo** y **vínculo presente no legible**. Una falla opcional no borra otra parte válida.
  Retener filas incompatibles con su estado y conteo de exclusión; no hacerlas desaparecer.
- Identidad por ID de ronda, observación, lote, sublote, plaga, animal e ingreso. Nombres y
  chapetas solo resuelven opciones y se muestran; no son claves de join. Nombres duplicados
  exigen aclaración; no desempatar por similitud o actividad. Mostrar nombres antes que UUID.
- Intervalos inclusivos de fechas calendario; hoy inyectado en Bogotá. DATE no se desplaza de
  zona y TIMESTAMPTZ se convierte explícitamente a Bogotá. Fecha operativa no es `created_at`.
  Lecturas de varias tablas son independientes, sin promesa de snapshot transaccional.
- Sin pronósticos, prescripciones agronómicas/veterinarias, captura, corrección, alertas nuevas,
  finanzas ni ganado de ceba. Los litros pueden requerir un vínculo financiero; eso no habilita
  dinero ni campos financieros ajenos a la cantidad. No se importan herramientas del legado.

## Preguntas esenciales y fuentes

### 1. Monitoreo: incidencia y gravedad por ronda, lote/sublote y plaga

**Respuesta:** observaciones de la ronda pedida; incidencia con numerador y denominador
compatibles, gravedad calculada por el motor compartido y cobertura de las combinaciones
solicitadas. Una ronda puede abarcar varias fechas. Agrupar por `ronda_id`, jamás fabricar una
ronda agrupando `fecha_monitoreo`. La fecha del registro se puede presentar como procedencia.

**Columnas verificadas:**
`monitoreos.id,ronda_id,fecha_monitoreo,lote_id,sublote_id,plaga_enfermedad_id,
arboles_monitoreados,arboles_afectados`;
`rondas_monitoreo.id,nombre,fecha_inicio,fecha_fin`;
`sublotes.id,lote_id,nombre`; `lotes.id,nombre`;
`plagas_enfermedades_catalogo.id,nombre`.
No leer observaciones libres ni atribución personal para este alcance.

**Claves:** observación→ronda, lote, sublote y plaga por sus FK. Confirmar que el lote del
sublote coincide con el de la observación y que no hay registros duplicados para la población
que se sumará. Una PK distinta no prueba que dos filas midan árboles distintos. Sin identidad
de árbol, el resultado agregado mide observaciones de árboles, no árboles únicos de la finca.
No sumar denominadores de varias plagas como si fueran nuevos árboles ni promediar porcentajes.

**Cálculo:** validar números finitos, `monitoreados > 0` y `0 <= afectados <= monitoreados`;
sumar miembros compatibles de una misma plaga y ronda, después llamar
`calcularIncidencia(Σ afectados, Σ monitoreados)` y `clasificarGravedad` de
`src/utils/calculosMonitoreo.ts` (10% / 30%). Su retorno 0 con denominador 0 no autoriza
publicar 0%: el lector debe declarar denominador inválido antes de invocarlo.
Si hay filas incompatibles, conservarlas como no calculables y no llamar completo al agregado.
La `gravedad` es la banda de incidencia; no renombrarla silenciosamente como severidad.
La densidad `individuos / afectados` tiene otra unidad y está definida por `calcularDensidad`
y el encabezado de importación «Severidad (Ind/Arbol)» en `src/types/monitoreo.ts`.
**D38 resuelta:** P4 solo responde incidencia/gravedad; rechaza correctamente severidad y
densidad. No lee esos campos para ampliar alcance. **Precisión D42:** las filas de una misma
ronda/lote/sublote/plaga son observaciones con su propio número de árboles muestreados y
afectados. La tendencia existente suma ambos contadores y calcula la razón ponderada de esas
observaciones. No deduplicar ni tomar MAX por fecha, y no llamarla incidencia de árboles únicos.

**Ausencias:** sin fila para una combinación = **no revisado**, nunca 0%, ausencia de plaga ni
gravedad baja. Sin observaciones completas no hay ranking. Para una lectura «última» distinguir
la última ronda global de la última lectura disponible por combinación; no mezclar ambas.
Una comparación fija debe informar qué rondas compara y no interpolar las ausentes.

### 2. Monitoreo: conductividad eléctrica de suelo

**Columnas verificadas:** `mon_conductividad.id,lote_id,ronda_id,fecha_monitoreo,
valor_ce,lecturas,num_arboles,ph`; `lotes.id,nombre`; `rondas_monitoreo.id` si hay vínculo real.
Validar además que `lecturas` es JSON y su estructura de árbol, alta y baja, sin volcarla al repo.
Unidad del módulo: CE en dS/m. pH es otra magnitud y no se convierte a CE.

**Respuesta y claves:** registro por ID y lote; usar `ronda_id` solo cuando existe y es legible.
La captura actual de `RegistroConductividad.tsx` no envía ronda; no atribuirle una por
coincidencia de fecha. **D39 resuelta:** CE se consulta por fecha operativa en una sección
propia, nunca atribuyendo una ronda por proximidad o coincidencia de fecha.

`valor_ce` es el promedio guardado; `lecturas` conserva mediciones alta/baja. No presentar el
promedio de promedios como promedio de todas las mediciones sin definir ponderación y base.
`calcularDistribucionCE` promedia alta/baja disponibles por árbol y clasifica contra los umbrales
del módulo, pero devuelve ceros con población vacía: validar al menos un árbol con lectura antes
de usarlo. NULL en alta o baja no es 0. `num_arboles` no prueba completitud del JSON.
Sin registro = sin medición, nunca CE 0 ni suelo en rango. Sin calibración/unidad conocida,
presentar solo dato registrado y límite; no producir recomendaciones.

### 3. Clima: historia observada y cobertura por variable

**Única fuente de historia:** `clima_resumen_diario`. `clima_lecturas` es una ventana de 24 h y
queda fuera del lector P4, también como fallback para hoy, huecos o historia. No backfill ni
llamadas a estación/proveedores. Sin fila de hoy aún = resumen diario no disponible.

**Columnas verificadas:** `fecha,station_id,temp_c_min,temp_c_max,temp_c_avg,
humedad_pct_min,humedad_pct_max,humedad_pct_avg,viento_kmh_avg,rafaga_kmh_max,
viento_dir_predominante,lluvia_total_mm,lluvia_confianza,lluvia_mm_evento,
radiacion_wm2_avg,radiacion_wm2_max,uv_index_max,horas_sol_duracion,
lecturas_count,cobertura_hueco_max_min`.
PK real `(fecha,station_id)`: fecha no es única entre estaciones. **D41 resuelta:** publicar
observaciones con cobertura explícita; pedir aclaración de estación si hay solapamiento,
sin priorizar una fuente ni sumar estaciones silenciosamente.

**Lluvia:** toda lectura pasa por `lluviaConfiableDeResumen` y conserva `lluvia_confianza`;
usar también `esCotaInferior`, ambos en `src/utils/escoClimaCalidad.ts` y reexportados por
`calculosClima.ts`. `contador_congelado` no aporta dato aunque tenga valor crudo histórico.
Desde 122, `cobertura_parcial` con número es una **cota inferior medida**, no un total diario;
«al menos 0 mm» nunca demuestra día seco. NULL permanece sin dato. `reconstruido` conserva
su procedencia; no comparar hoy con ayer para redetectar el defecto ya corregido en 183.
Una suma con cotas o huecos no se llama lluvia total completa: separar subtotal de días
completos, cota inferior medida y días sin dato. No reemplazar por `lluvia_mm_evento` a voluntad.

**Cobertura:** por cada variable dividir los días solicitados entre con valor usable, con fila
pero valor NULL/no usable y sin fila. La calidad/cobertura desconocida es una dimensión aparte
que puede superponerse a esos estados: no se suma de nuevo al denominador. Declarar las causas
conocidas. El conteo global de lecturas no prueba
cobertura temporal ni cobertura del sensor específico. `cobertura_hueco_max_min` describe
huecos del muestreo del día, no necesariamente de cada variable. Historia sin ese metadato
no se declara completa; tampoco se invalida solo por `lecturas_count=1` (histórico importado).
El criterio temporal vigente de 159 supera los antiguos umbrales por conteo de 103/158.
Con D41, los agregados se rotulan como observaciones disponibles con su cobertura; nunca
como historia completa de una variable cuya completitud no se ha acreditado.

**Sol y otras magnitudes:** `horas_sol_duracion` son horas, radiación media es W/m² y su
energía diaria kWh/m² es distinta. No traducir energía a duración. Días truncados mantienen
duración NULL, nunca 0; si llega duración no NULL contradictoria con cobertura, retener
contradicción y no usarla como día completo. No recalcular desde lecturas crudas. Temperatura
°C, humedad %, viento km/h, radiación W/m² y UV sin unidad física no se suman entre sí.
Promedios de días con dato se rotulan como tales, con su denominador; no interpolar ni rellenar.

### 4. Hato lechero: ficha y estado reproductivo actual

**Columnas verificadas de ficha:** `hato_animales.id,numero,nombre,sexo,etapa,raza,estado,
fecha_estado,fecha_nacimiento,fecha_nacimiento_confianza,madre_id,padre_id,padre_toro_id,
finca_id,origen,confianza,etapa_forzada`; `hato_toros.id,nombre` para etiquetas.
Los vínculos de parentesco apuntan a IDs; una chapeta provisional no es identidad nueva.
Las notas libres, fotos y documentos no forman parte de este lector.

**Hechos verificados:** `v_hato_estado_actual.animal_id,etapa,raza,estado,num_partos,
ultimo_chequeo_fecha,ultimo_servicio_fecha,ultimo_parto_fecha,ultimo_secado_real_fecha,
ultima_confirmacion_prenez_fecha,ultima_confirmacion_prenez_metodo,ultimo_evento_fecha,
ultimo_aborto_fecha,ultimo_estado_chequeo,fecha_nacimiento,etapa_forzada`;
`hato_config.clave,valor`. Verificar la vista y sus fuentes `hato_eventos`, `hato_chequeos` y
`hato_chequeo_vacas`; no tomar fechas derivadas legacy de la vista como autoridad del motor.

**Motor:** `construirHatoConfigDesdeFilas` valida la configuración completa;
`derivarEstadoReproductivo` recibe hechos, configuración y fecha de referencia explícita.
Presunción no es palpación: método NULL no prueba confirmación. Conservar los estados y
calificadores del motor, sus señales de revisión y fechas probables, sin convertirlas en hechos
confirmados. Categorías y etapa forzada usan `hatoCategorias.ts`, no otra regla local.
Sin configuración válida o vista no leída, el estado derivado es no disponible; no pasar una
fila sintética con cero partos o eventos vacíos para obtener una clasificación aparentemente válida.

**Alcance temporal:** estado actual al corte, no reconstrucción histórica de quién estaba en
ordeño. Consultar hechos fechados puede explicar el estado, pero un filtro por fecha no produce
por sí solo un estado histórico. No contar partos/animales ausentes como cero por un fallo.

### 5. Hato lechero: pesajes y litros quincenales, sin dinero

**Pesajes verificados:** `hato_pesajes_leche.id,animal_id,fecha,litros_total,litros_am,litros_pm,
fuente`; ficha por `animal_id`. Contrastar UNIQUE `(animal_id,fecha)`. Una fecha/animal sin
fila = sin dato. Un cero registrado sigue siendo cero con procedencia. Un único turno presente
es jornada incompleta; ambos NULL pueden ser jornada histórica de total único, según el
contrato existente. No producir turnos en cero. Sumar muestras fechadas no demuestra producción
continua ni litros vendidos: mantener separados pesaje, promedio de días pesados y venta.

**Quincenas verificadas:** `hato_produccion_quincenal.id,anio,mes,quincena,fecha_inicio,fecha_fin,
origen_dato,litros_total,fin_ingreso_id,num_vacas_ordeno,num_vacas_ordeno_origen`;
del ingreso vinculado, exclusivamente `fin_ingresos.id,cantidad`. No seleccionar valor,
precio, comprador, medio de pago ni datos financieros libres. Validar FK e índice único parcial
del vínculo medido; el histórico derivado puede ser N:1 con un ingreso mensual.

`resolverLitrosQuincenal` documenta la distinción: `medido` obtiene litros del ingreso vinculado
y no de `litros_total` (NULL deliberado); `derivado_mensual` obtiene la partición histórica de
`litros_total`. **D40 resuelta:** se admiten ambos orígenes, separados y rotulados como litros
de leche medidos o derivados; los subtotales mantienen el origen. No sumar el ingreso mensual una vez por quincena
derivada. Vínculo ausente/oculto/fallido produce estados distintos, nunca cero ni fallback local.
Mantener período de producción y origen; la fecha contable del ingreso no sustituye quincena.
L/vaca es una reutilización potencial, fuera de la primera entrega solicitada de pesajes y
litros quincenales. Si se autoriza después, requiere litros y número de vacas válidos, sin
reconstruir vacas con el roster actual.
Una quincena abierta/faltante no prueba producción cero ni comparación negativa.

## Reutilización de motores y condiciones para el edge

| Fuente existente | Qué se reutiliza | Condiciones / trabajo previo a un futuro PR runtime |
|---|---|---|
| `calculosMonitoreo.ts` | `calcularIncidencia`, `clasificarGravedad` | Cero imports: importable con ruta relativa `.ts`. Validar denominador y población primero; sus ceros de guarda no representan ausencia. Severidad/densidad rechazadas por D38. |
| `calculosMonitoreoV2.ts` | Aritmética CE de `calcularDistribucionCE` | Módulo mezcla funciones puras con `asignarRonda` que escribe y usa tipos `@/`. Extraer función pura sin cambiar la captura ni asignar rondas; validar JSON y no vacío. |
| `priorizacionMonitoreo.ts` | Regla existente de ronda actual/tendencia | No habilita priorización/prescripción en este contrato. Import extensionless impide entrada edge directa; requiere alcance nuevo si se pide ranking de intervención. |
| `escoClimaCalidad.ts` | `lluviaConfiableDeResumen`, `esCotaInferior` | Cero imports, listo para import relativo `.ts`; la cobertura y denominadores deben rodear el resultado. |
| `calculosClima.ts` | Fórmulas históricas como evidencia del módulo | Alias `@/`, imports extensionless y funciones de ventana viva; no importar entero. Su resumen pierde cobertura por variable y suma cotas: no es el contrato P4. Extraer únicamente agregación aprobada con cobertura explícita. |
| `calculosRadiacion.ts` | Conversión de magnitudes, si se solicita energía | Puro; inspeccionar grafo antes de incluir. No sustituye duración ni justifica el total de un día truncado; clasificaciones agronómicas fuera de alcance. |
| `calculosHato.ts` | `derivarEstadoReproductivo`, etiquetas, quincenas | Cero imports y hoy explícito. Importar fuente pura de `src/utils/` con `.ts`; no tocar ni importar copias de los dos servidores legados. No cambiar lógica ni constantes espejadas. |
| `hatoConfigDesdeTabla.ts`, `hatoCategorias.ts` | Construcción estricta y categorías del motor existente | Cambiar/extraer imports `@/` y extensionless en futuro PR acotado, manteniendo comportamiento y precondiciones. Sin defaults nuevos. |
| `hatoProduccion.ts` | `resolverLitrosQuincenal` | Puro pero grafo amplio con alias. Extraer resolver mínimo con paridad, sin arrastrar ventas, dinero, proyección ni reconstrucción histórica. Conservar ambos orígenes rotulados (D40). |
| `hato/litrosPesados.ts`, `hato/produccionV2.ts` | Detección de turno incompleto y agregados de muestras | Dependencias alias/extensionless y proyección/dinero; extraer solo piezas necesarias con paridad y denominadores explícitos. No importar hooks React. |
| `esco2/fuente.ts`, calendario, registro, estado y renderer | Patrón lector/JWT, fechas y operaciones cerradas | Cambios futuros por dominio, sin SQL generado por modelo ni generalizar un lenguaje de consultas. Mantener NULL y D26. |

Todo archivo nuevo en `src/` que alcance el bundle debe usar imports relativos `.ts`, sin `@/`.
Recorrer el grafo desde `supabase/functions/esco-consultas/index.ts`; añadir al workflow de
deriva rutas fuera de `src/utils/esco2` que no estén cubiertas. No copiar código al legado.

## Decisiones de significado confirmadas por Santiago

| ID | Decisión del 5 de noviembre de 2026 | Consecuencia |
|---|---|---|
| D38 | Solo incidencia/gravedad; rechazo correcto de severidad. | No leer ni calcular densidad/severidad como capacidad P4. |
| D39 | CE por fecha operativa en sección propia. | Nunca inferir ronda por fecha; conservar la falta de vínculo como estado. |
| D40 | Admitir litros de leche medidos y derivados, separados y rotulados por origen. | Resolver por fuente existente, sin dinero ni reutilizar el ingreso mensual varias veces. |
| D41 | Publicar observaciones climáticas con cobertura explícita; aclarar estación si solapa. | Sin fuente preferida implícita, sin rellenar faltantes ni prometer completitud por variable. |

## D42: precisión de la unidad de incidencia (resuelta)

Santiago aclaró que el registro lleva los árboles afectados y los árboles muestreados para la
población de ronda/lote/sublote/plaga. `RegistroMonitoreo.tsx` inserta una fila por plaga con
el denominador de la captura; el lector de tendencias de `DashboardMonitoreoV3.tsx` suma
afectados y muestreados por ronda/plaga (y ronda/lote/plaga). Ese cálculo ya define una
**razón ponderada de observaciones**, no un censo de árboles únicos.

Con numeradores/denominadores válidos de la misma población y una misma plaga:
`incidencia = calcularIncidencia(Σ arboles_afectados, Σ arboles_monitoreados)`.
Cada observación válida entra una vez. No mezclar plagas ni deduplicar por fecha, tomar MAX
o excluir un grupo solo por tener varias filas o no tener ID de árbol. Las opciones iniciales
de bloquear esos grupos se retiran: exigían disjunción física para una métrica que cuenta
observaciones ponderadas y no necesita demostrar árboles únicos.

Al corte hay 177 grupos con varias filas y 357 observaciones; 141 grupos tienen diferencias en
numerador o denominador (147 si también se compara el contador de individuos). Esto evidencia
heterogeneidad de captura, no prueba duplicados ni revisitas. No identificar ni corregir filas
desde esos agregados. Declarar cobertura y la unidad «observaciones de árboles muestreados»;
si se pide número de árboles únicos, la fuente no lo acredita y se declara ese límite.
El snapshot del dashboard usa MAX por sublote para otro denominador compartido entre plagas;
no se importa ese MAX como oráculo de la incidencia P4 de una plaga.

Si una forma de pregunta exige más de dos
excepciones nuevas o un lenguaje general de consultas, detenerla y presentar 2–3 opciones de
alcance a Santiago, sin expandir el registro por heurísticas.

## División propuesta (cada entrega un PR desde main vigente)

| Tarea | Dependencia | Entrega y límite | Oráculos que QA debe congelar antes de implementar |
|---|---|---|---|
| P4-0 · Cerrar contrato y catálogo | Catálogo y decisiones D38–D41 comprobados; precisión D42; QA independiente | Este documento contrastado, columnas/claves/RLS y cobertura agregada; sin runtime | Inventario exacto de columnas/tipos/NULL/FK/índices, vista invoker/dependencias, grants/policies y consultas reproducibles. No es prueba JWT. |
| P4-1 · Monitoreo por ronda | P4-0 | Lector fijo y operación cerrada incidencia/gravedad | Ronda multifecha; dos rondas misma fecha; varias observaciones válidas del mismo grupo sumadas una vez sin MAX/dedupe; plaga ausente vs cero explícito; denominador 0/NULL; sublote ajeno; IDs repetidos de transporte; razón ponderada rotulada como observaciones; límites 10/30; hijo visible/padre oculto; lectura incompleta. |
| P4-2 · CE de suelo | P4-1, D39 | Extracción mínima aritmética CE y lector separado | Alta/baja NULL y cero, JSON vacío/malformado, árbol repetido, promedio guardado vs individual, vínculo ronda NULL/oculto, dS/m y pH separados; sin recomendaciones. |
| P4-3 · Clima histórico | P4-0, D41 | Lector diario y agregados con cobertura por variable | Valor crudo congelado no usable; cota parcial positiva/cero/NULL; reconstruido; día sin fila; sensor NULL con otros presentes; 48 muestras completas vs 288 truncadas; hueco desconocido; estaciones solapadas; energía vs duración; corte Bogotá. |
| P4-4 · Ficha y reproducción | P4-0 | Lector por ID, motor actual/config estricta | Chapetas/nombres duplicados, provisional, parentesco no legible, config faltante/mal tipada, método NULL/presunción/palpación, aborto posterior, empates de eventos, etapa forzada, inactivo, vista fallida; cero partos solo explícito. |
| P4-5 · Pesajes y litros quincenales | P4-4, D40 | Lectores por ID/fecha y cantidad vinculada; sin dinero | Sin fila vs cero, un turno vs jornada histórica, duplicación de join, quincena medida con litros local NULL, ingreso oculto/NULL/no leído, histórico N:1 y origen, vacas NULL, quincena faltante/abierta; no sumar venta y muestra. |
| P4-6 · Integración y regresión | P4-1–5 aprobados | Multipartes/seguimiento, renderer y grafo edge, sin deploy | Falla de un dominio conserva otros, D26, Gerencia/Administrador, herramientas cerradas, no consultas legado/captura, todas las rutas edge cubiertas por deriva, salida compacta y cero UUID no pedido. |

Las tareas son propuesta, no permiso runtime. QA mantiene sus oráculos sintéticos independientes;
los datos de desarrollo y sus referencias requerirán custodia/autorización separada. No abrir
held-out ni reutilizarlo como dev-set. La evidencia de cada futuro PR incluirá test, tipos,
lint con errores/avisos, `verificacion` verde sobre SHA exacto, gasto y preguntas abiertas.

## Puerta de salida documental

Pendiente: revisión de Santiago/Claude Code. Catálogo vivo y cobertura agregada contrastados
por CTO y QA independiente; D38–D41 resueltas y D42 precisada con el contrato del módulo.
No aceptar M5 por este documento.
La implementación P4 requiere otra aprobación; P3 conserva su propia puerta de aceptación.

## Contraste independiente y comprobaciones de esta entrega

QA independiente contrastó columnas, claves y políticas con el catálogo vivo y los módulos y
motores existentes; no quedaron contradicciones materiales de esa inspección. Se precisaron
la partición de cobertura climática y que litros/vaca es reutilización potencial fuera de la
primera entrega. Se conserva como límite que catálogo/grants administrativos no prueban por sí
solos la población efectiva de un JWT. D42 se cerró como precisión de la unidad del cálculo
existente, sin modificar código ni decidir una deduplicación de datos.

El coordinador repitió `npm test`: 7.777/7.777, 335 archivos; `npx tsc --noEmit` aprobado;
`npm run lint`: 0 errores y 907 avisos existentes. `git diff --check` limpio. No hubo llamadas
de modelo P4. CI `verificacion` del SHA de este PR pendiente de publicación; no quedan preguntas
esenciales de significado abiertas para este alcance documental.
