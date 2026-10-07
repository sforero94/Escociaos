# Revalidación de datos #263

Lectura de producción y fuente indicada por el dueño: **2026-10-07 UTC**.
La conciliación no requiere una corrección nueva demostrada. **Cero escrituras
en Supabase; cero reaplicaciones de migraciones.**

| Caso | Resultado verificado | Decisión |
| --- | --- | --- |
| ESCO-99 | Las siete personas del lote del 10 de septiembre suman ahora **1.0** cada una. No quedan excesos ese día. La cosecha conserva 1.0 el día 10; el Drench está el día 11, junto a cosecha de 0.5 + 0.5. | Mantener la corrección hecha el 16 de septiembre; no repetirla. |
| ESCO-95 | Permanecen **42 días-persona** históricos por encima de un jornal. Se revisaron 81 filas de la hoja fuente, incluidos los días 10/11 de septiembre, y las columnas de las personas afectadas. Las 42 sumas históricas difieren: 41 suman 1.0 en la fuente y una suma 1.5. | Mantener la aceptación registrada por Santiago el 16 de septiembre. No presentar los datos como alineados. |
| ESCO-98 | Ledger 147: `20260916154436`. La función viva exige `cantidad_fisica_confirmada`, conserva el bloqueo y tiene md5 `611a7d7b6ba8bc5e101e8782c0a40f49`. La única excepción tiene captura vinculada, estado resuelto y cantidad física 150. | Ya aplicada; descartar la reaplicación. |
| ESCO-87, datos | Los siete objetivos de fecha de la 153 y los cuatro de la 176 mantienen sus fechas corregidas. Los tratamientos de julio y sus pasos permanecen en julio, según la decisión registrada. | No volver a invertir fechas ni tocar alertas antiguas. |

## Por qué se conservan los 42 casos históricos

Mantenimiento ESCO-95 quedó `Done / Aceptado (no se arregla)` el 16 de septiembre:
«7/49 limpios vía ESCO-99. Santiago acepta ruido en los 42 restantes (>1 jornal
sin destino unívoco en Excel Labores). Move on.» Se conserva esa decisión.

La lectura nueva de `LABORES DETALLADAS` se hizo por fecha y columna de persona,
con valores numéricos sin formatear y posiciones de columnas conservadas. Se
contrastaron los 42 casos individualmente; el resultado detallado y los alias de
nombres permanecen en un informe local privado, **fuera del repositorio público**.
No se publican nombres de trabajadores, salarios, filas completas ni enlaces a
sus registros privados.

La discrepancia de suma no identifica por sí sola una fila que deba borrarse o
reducirse. Hay actividades distribuidas entre lotes, filas fuente sin lote y
tareas adicionales en la aplicación. Por ejemplo, una actividad sin lote puede
estar repartida en siete registros; otra jornada contiene una tarea adicional
que no aparece en la fuente. Normalizar proporcionalmente a 1.0 inventaría la
distribución de costos y borraría hechos sin evidencia. La fuente además tiene
un caso de 1.5, por lo que tampoco prueba que todo exceso sea imposible.

Para reabrir la corrección histórica harían falta decisiones de destino por
tarea/lote y UUID, además de respaldo recuperable y guardas de valores/cantidad.
Este informe documenta la conservación; no declara arregladas esas discrepancias.

## Verificaciones ya aplicadas

- ESCO-99: Mantenimiento registra que se borraron siete Drench de 0.5 duplicados
  del día 10 y conserva la referencia «snapshot en escocia-snapshots». Se verificó
  el resultado actual y el patrón de actividades de la fuente de los días 10/11.
  Seis columnas de cosecha tienen nombre; la séptima tiene el encabezado vacío.
  No se adjudica esa columna automáticamente a la contratista del sistema: su
  identidad no puede certificarse solo con esta hoja. El total actual de los siete
  casos y la corrección anterior están documentados en Mantenimiento; no se propone
  una nueva escritura. El artefacto de aquel snapshot no se ha recuperado en esta
  corrida; no se afirma haberlo validado.
- ESCO-98: no ejecutar el archivo completo 147. Su propia precondición aborta si
  la función ya exige la clave. El md5 coincide con el cuerpo corregido documentado.
- ESCO-87: 153 figura en ledger `20260915183535`; 176 en `20261006180445`.
  MARIPOSA mantiene **29 de junio**, conforme al diagnóstico y al chequeo; no es
  una fecha que se pueda transponer automáticamente. Los cuatro objetivos de 176
  mantienen 9 de marzo, 9 de abril, 9 de mayo y 9 de abril, respectivamente.

## Guardrail: verificación anterior al release

En la lectura previa al despliegue del 7 de octubre, la función edge estaba
ACTIVE en versión **268**, con hash
`07c0afa1235e75dd54c4a478051b6f2b4544314091ba272bdeed68f2538ab74f`, igual al registro
de despliegue versionado para el commit `08830c31d2409189be421bd40d5b4c1ce1a34759`.
Se inspeccionó el código de ese commit: el camino de servicio usa `leerFecha`,
ofrece ambas lecturas en palabras y exige que el usuario elija. La lectura directa
del cuerpo desplegado fue rechazada por tamaño de respuesta; esta revalidación
se apoya en metadata/hash y en el registro de despliegue, no en una descarga nueva
del bundle. No se hicieron escrituras de fechas.

El release posterior publicó v269 con ambos árboles sincronizados. Su evidencia
y la deriva v271 observada después están en el [registro de despliegue](despliegue-2026-10-07.md).
Esta sección conserva la medición inicial de #263; no presenta v268 como la
versión vigente ni autoriza repetir las correcciones de datos.

## Mantenimiento y validación

Se actualizaron y releyeron las cuatro notas de cierre de ESCO-95/99/98/87 con
esta revalidación y el enlace al PR del informe. Se preservaron el texto previo,
la aceptación de 95, los estados y las resoluciones existentes, y sus enlaces
anteriores. El estado original de las páginas se guardó en un respaldo local
privado antes de actualizar; se verificó que no habían cambiado entre lecturas.

La [consulta de revalidación](revalidacion-datos-263.sql) es solo lectura. Comprueba
conteos, ledger, checksum y valores esperados por UUID; no expone salarios.
Después de crear el PR, Chromium verificó las cuatro filas del informe y los
resultados SQL esperados; se inspeccionaron las capturas de escritorio/móvil.
Es una validación del informe y de los datos consultados, sin afirmar una prueba
de la aplicación desplegada ni una entrega Telegram real.
