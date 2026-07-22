# S3 — Contrato entre Extract/Normalize y Resolve

Dos agentes trabajan en paralelo sobre `scripts/import-hato/`. Este archivo es la
frontera entre ellos: **ninguno de los dos la cambia por su cuenta.** Si te
estorba, dilo en tu reporte y el coordinador la ajusta — no la edites.

> Documentos hermanos, todos en `docs/hato/`:
> [`s3-handoff.md`](./s3-handoff.md) (por dónde empezar) ·
> [`s2-hallazgos-planillas.md`](./s2-hallazgos-planillas.md) (primer barrido) ·
> [`s2-matriz-qa.md`](./s2-matriz-qa.md) (barrido adversarial de las 45 hojas).

## Pipeline (plan §7.4)

```
Extract → Normalize → Resolve → [CHECKPOINT MARTHA] → Load → Verify
         ^^^^^^^^^^^^^^^^^^^^   ^^^^^^^
         agente 1               agente 2
```

`Load` y `Verify` NO se construyen todavía (dependen de la Tabla A de Martha).

## Regla que gobierna todo el pipeline

Una celda o fila no interpretable **nunca se descarta**: se emite con
`issues[]` y el crudo intacto. Misma regla que `calculosHato.ts`. Un import que
"limpia" datos perdiendo procedencia es peor que no importar.

## Reusar, no reimplementar

`src/utils/calculosHato.ts` ya resuelve el nivel de CELDA y está probado (80
casos sobre valores verbatim): `parseFechasServicio`, `parseSX`,
`parseFechaChequeo`, `parseValorNumerico`, `parseEstado`,
`calcularPartoProbable`, `calcularFechaSecar`, `detectarColisionesChapeta`.
**Impórtalas. No escribas un segundo parser de celdas** — el plan §7.4 exige un
solo parser para importación y captura, y hay un test de paridad que lo protege.

Lo que S2 dejó explícitamente fuera y S3 debe resolver es el nivel de **GRILLA**
(estructura 2D de la hoja), no el de celda.

## Dónde vive el código (ajuste del coordinador, 2026-07-22)

El contrato original decía "ambos agentes trabajan sobre `scripts/import-hato/`".
Se ajustó al arrancar S3 porque `scripts/` no lo cubre **ninguna** de las tres
redes del repo: `tsconfig.json` tiene `"include": ["src"]`, `npm run lint` corre
sobre `src/`, y los tests viven en `src/__tests__/`. Lógica de grilla e identidad
sin typecheck, sin lint y sin tests es exactamente lo que este pipeline no puede
permitirse.

| Capa | Dónde | Por qué |
|---|---|---|
| Lógica pura (grilla, normalización, identidad, verificación) | `src/utils/importHato/*.ts` | typecheck + lint + Vitest, igual que `calculosPyG`/`priorizacionMonitoreo` |
| Tests | `src/__tests__/importHato*.test.ts` | patrón del repo |
| Runners de I/O (leer `.xlsx`, escribir `out/`) | `scripts/import-hato/*.ts` | única capa que toca disco y `xlsx`; sin lógica de negocio |

La frontera de tipos es **`src/utils/importHato/tipos.ts`** (ya escrito, no lo
edites). El JSON intermedio sigue en `scripts/import-hato/out/`, fuera de git.

Corolario: el normalizador recibe `HojaCruda` (una matriz de celdas), no una
ruta de archivo. Eso es lo que lo hace testeable sin abrir un `.xlsx`.

## El tipo de la frontera

Fuente de verdad: [`src/utils/importHato/tipos.ts`](../../src/utils/importHato/tipos.ts).
Lo de abajo es la versión resumida con la que se acordó el corte.

```ts
/** Una fila de animal en una hoja de chequeo, ya resuelta a nivel de grilla
 *  y normalizada a nivel de celda. Es la salida de Extract+Normalize y la
 *  entrada de Resolve. */
export interface FilaChequeoNormalizada {
  // --- procedencia (nunca se pierde) ---
  archivo: string;              // 'CHEO VETE 2026.xlsx'
  hoja: string;                 // 'CHEQUEO JULIO 2026'
  fila: number;                 // 1-indexed, como lo ve Excel
  generacionEncabezado: 1 | 2 | 3 | 'sin_encabezado';

  // --- identidad cruda ---
  numero: number | null;        // chapeta; null si la celda venía vacía
  nombre: string | null;

  // --- fecha del chequeo (resuelta por hoja, igual para todas sus filas) ---
  chequeoFecha: string | null;  // ISO yyyy-mm-dd
  chequeoFechaConfianza: 'exacta' | 'aproximada' | 'desconocida';

  // --- capa cruda: verbatim, tal cual la celda ---
  raw: {
    pl: string | null;
    np: string | null;
    ultimaCria: string | null;
    sx: string | null;
    fechaServicio: string | null;
    toro: string | null;
    tp: string | null;          // se conserva pero NUNCA se interpreta
    estado: string | null;
    secar: string | null;
    pp: string | null;
    ttto: string | null;
  };

  // --- capa normalizada (salida de calculosHato.ts) ---
  pl: number | null;
  numPartos: number | null;
  fechasServicio: string[];     // puede traer 2-3 (V7)
  sx: ResultadoSX | null;
  estado: TipoEstado | null;
  fechaSecar: string | null;        // RE-DERIVADA, no leída de la celda
  fechaProbableParto: string | null; // RE-DERIVADA
  toroNombre: string | null;
  tipoServicio: 'monta' | 'inseminacion' | null;

  issues: ParseIssue[];
}

/** Una fila de las hojas TERNERAS. Esquema distinto, tabla distinta. */
export interface FilaTerneraNormalizada {
  archivo: string;
  hoja: string;
  fila: number;
  numero: number | null;
  nombre: string | null;
  fechaNacimiento: string | null;
  fechaNacimientoConfianza: 'exacta' | 'aproximada' | 'desconocida';
  padreRaw: string | null;      // incluye 'yaguen'/'fabace' — pregunta abierta
  madreRaw: string | null;
  issues: ParseIssue[];
}
```

## Formato de intercambio en disco

Extract escribe `scripts/import-hato/out/normalizado.json`:

```json
{
  "generadoEn": "<timestamp inyectado por el caller, NO Date.now() dentro de lógica pura>",
  "hojas": [ { "archivo": "...", "hoja": "...", "chequeoFecha": "...",
               "generacionEncabezado": 3, "filasDescartadas": 12, "issues": [] } ],
  "chequeos": [ /* FilaChequeoNormalizada[] */ ],
  "terneras": [ /* FilaTerneraNormalizada[] */ ]
}
```

Resolve lo lee. Mientras Extract no exista, Resolve trabaja contra un fixture
sintético con esa MISMA forma (mínimo 20 filas cubriendo los casos difíciles).

## Dónde viven los .xlsx

En la raíz del worktree. **Están untracked a propósito: son datos reales del
hato. Nunca los commitees, nunca uses `git add -A`, nunca los muevas.**
`scripts/import-hato/out/` también debe quedar fuera de git.

`node_modules` está vacío y **no se debe correr `npm install`**. Para leer
`.xlsx` en exploración usa `python3` + `openpyxl` (disponible). El script de
producción de S3 sí puede depender de `xlsx` (ya está en package.json) siempre
que no lo ejecutes ahora.
