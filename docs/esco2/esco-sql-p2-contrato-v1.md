# Esco SQL — P2: contrato de respuesta v1

Implementación sobre `main` `5839ff62` (P1, PR #472). Alcance aprobado en
[el plan del PR #471](https://github.com/sforero94/Escociaos/blob/7425dc3828ec1937f9f710950e95bf94cfe65df6/docs/esco2/plan-migracion-esco2-sql.md), §4 y §8.
Este documento contiene solo estructura del contrato y evidencia agregada.

## Contrato

`manejarSql` devuelve `texto`, `bloques`, `sugerencias`, `aclaracion?`, `consultas`,
`uso`, `ms`, `motor` y `hoy`. Conserva `respuesta = texto` para los clientes actuales.
Las consultas incluyen SQL, propósito, conteo, truncado, error y duración; no filas.

El modelo usa `consultar_sql` para leer y `mostrar_visual` para escoger el tipo de
visual, el número de consulta (desde 1), las columnas, etiquetas y formatos.
Nunca envía valores de tabla, gráfica ni tarjeta. El servidor construye esos valores
exclusivamente desde las filas devueltas por la consulta indicada.

- Máximo cuatro consultas y cuatro bloques. Pedir un visual no consume una consulta;
  todavía puede visualizarse el resultado de la cuarta consulta.
- El servidor conserva hasta 500 filas por consulta. El contexto del modelo usa una
  muestra de hasta 20 filas y un límite de caracteres; el aviso pide agregar en SQL.
- Una tabla conserva la proyección completa de las columnas elegidas (hasta 500 filas).
  `filasTablaParaCanal` entrega las primeras 50 en web o 15 en Telegram. El futuro
  adaptador podrá exportar el resto sin ejecutar de nuevo la consulta.
- Una gráfica acepta hasta 60 puntos y series numéricas; los nulos se conservan.
  Una tarjeta exige exactamente una fila. No se agregan ni convierten cifras aquí.
- Un resultado truncado lleva `truncado` y `aviso` en todos sus visuales.
- El constructor rechaza consultas fallidas o inexistentes, columnas inexistentes,
  valores no escalares, propiedades extra, series no numéricas y límites excedidos.
  El registro del rechazo usa códigos cerrados, sin contenido privado.
- El contenido final admite `texto`, hasta tres `sugerencias` y una `aclaracion`
  opcional. Las sugerencias y opciones son texto breve sin cifras. El texto plano
  anterior sigue siendo aceptado. El texto no incluye JSON de gráficas.

`formatearValor` es la función común para los ocho formatos: moneda, número,
porcentaje, kg, litros, mm, fecha y texto. Usa separadores colombianos, moneda sin
COP ni decimales y millones enteros. `null` conserva «Sin dato», no se convierte en
cero. Las fechas de calendario conservan el día en Bogotá. Los valores del bloque
siguen crudos y exactos; el formato es solo presentación.

## Verificación y límites

Las pruebas usan un modelo y una RPC programados con datos sintéticos, recorriendo
el manejador, el loop y el constructor reales. Comprueban origen exacto de valores,
proyección, filas más allá de la muestra, rechazos, límites, metadatos y compatibilidad.
Esto verifica el contrato; no mide la calidad del modelo real ni acredita el gate D6.

La guarda numérica opcional del texto no se incorpora en P2. La factualidad del texto
conserva las reglas y el formateador determinista de P1.

## Puerta de aprobación

P2 requiere aprobación explícita de Santiago antes de desplegar `esco-consultas`:

```sh
npx supabase@2.117.0 functions deploy esco-consultas --project-ref ywhtjwawnkeqlwxbvgup --use-api
```

Debe conservar `verify_jwt = true`. P2 no introduce migraciones, secretos ni flags.
El despliegue y su comprobación productiva quedan pendientes de esa aprobación.
No se ha ejecutado el split held ni una campaña pagada. P3 se hace en otra sesión y
otro PR: SSE, adaptador web, persistencia, exportación y renderizado de los bloques.
