# Eval suite de Esco SQL

Mide el motor SQL de Esco (`src/utils/escoSql/`, migración 192) contra preguntas reales y una verdad
escrita a mano. Es el baseline de Esco 2.0 (PR #464).

## Qué es y qué no es

- Corre el motor **real** (`responderPregunta`, el mismo prompt y el mismo modelo que `esco-consultas`).
- Lee la base de producción **solo en lectura**, vía Composio (`SUPABASE_RUN_READ_ONLY_QUERY`, cuenta `escocia-os`).
- Ese rol **no pasa por la RLS ni por la RPC `esco_sql_lectura`**. La seguridad se prueba aparte
  (`src/__tests__/escoSqlMigracion.test.ts` y `po_sonda`). Este eval mide **si las respuestas son correctas**.
- Un juez LLM (`openai/gpt-6-sol`) califica cada respuesta contra la verdad. Es un juez, no un oráculo: revisa
  a mano una muestra de sus veredictos antes de creerle un porcentaje.

## Privacidad: el banco NO va en el repo

El repo es público. El banco usa nombres reales (lotes, productos, aplicaciones) y los resultados traen cifras
de la finca. Por eso viven **fuera del repo**, en una carpeta que tú eliges (`--dir`):

| archivo | qué es |
|---|---|
| `banco.json` | preguntas: `id, modulo, pregunta, verdad (SQL sobre tablas base), espera, criterio, sigue_a, split` |
| `verdad.json` | resultado de ejecutar cada `verdad` (clave = id) |
| `resultados-<tag>.jsonl` | una línea por corrida: respuesta, consultas, veredicto del juez |
| `reporte-<tag>.json/.md` | agregados (sin preguntas ni respuestas literales); este sí se puede compartir |

`espera` ∈ `cifra | sin_dato | aclarar | rechazar | no_cubre | truncado`. `split` ∈ `dev | held`: se puede afinar el
prompt mirando `dev`; `held` no se mira para afinar, solo para medir.

## Cómo correrlo

```bash
# 1. verdad (una vez, o cuando cambien las preguntas)
python3 scripts/esco-sql-eval/verdad.py <carpeta>   # ejecuta cada `verdad` por Composio y escribe verdad.json

# 2. correr el suite (3 repeticiones, 5 a la vez, tope de gasto USD 3)
node --experimental-transform-types --no-warnings scripts/esco-sql-eval/run.mts \
  --dir <carpeta> --tag base1 --reps 3 --conc 5 --max-usd 3
#   filtros: --split dev|held|all   --ids 1,2,3

# 3. reporte agregado
python3 scripts/esco-sql-eval/reporte.py <carpeta> base1
```

**Evaluar una migración de vistas antes de aplicarla:** `--sombra <migracion.sql>` inyecta cada `CREATE VIEW v_esco_*` del archivo
como CTE delante de la consulta del modelo (solo lectura, no crea nada). **Antes y después por módulo:**
`python3 scripts/esco-sql-eval/comparar.py <carpeta> --split dev --antes base2,antes --despues p1c` (marca aparte las preguntas
cuya verdad cambió: `verdad_v2` en `banco.json`). Cuidado: el runner también ejecuta las preguntas `held` que son antecesoras de un
seguimiento de `dev`; excluye sus resultados de lo que publiques.

`--experimental-transform-types` es necesario porque `loop.ts` usa propiedades de parámetro en el constructor.
La llave de OpenRouter se lee de `.env.local` y nunca se imprime.

## Costo y tiempo

Cada corrida (Esco + juez) cuesta del orden de USD 0,005. Las llamadas a la base por Composio son lo lento:
cuenta con unos 6 a 8 segundos por corrida, divididos entre `--conc`.

## Reglas para no engañarse

1. **Verdad contra tablas base, no contra las vistas** `v_esco_*`. Si la verdad usa la vista, el eval no puede
   detectar un error de la vista.
2. **El juez se audita.** Mira una muestra de `CORRECTA` y todas las `PARCIAL`, y mide cuántas decisiones cambiarías.
3. **El `held` no se usa para afinar el prompt.** Si se usa, deja de medir y pasa a ser otro `dev`.
4. **Repetir importa.** Con `temperature: 0` el modelo igual varía; una pregunta que acierta 2 de 3 no está resuelta.
5. Una pregunta cuya verdad depende de la fecha ("ayer", "esta semana") se fija con `HOY` en `run.mts`
   (2026-11-08); si cambias la fecha, regenera `verdad.json`.
