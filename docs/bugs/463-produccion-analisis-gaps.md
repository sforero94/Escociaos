# #463 — Gaps del tablero analítico de Producción

Diagnóstico tras implementar filtros dinámicos y vistas una/varias cosechas
sin ampliar schema ni importar Excel/tracker.

## Unidad de agrupación

**Por cosecha** (`Principal 2027`, `Traviesa 2026`), nunca por año calendario.

El año de movimiento es un filtro opcional que solo acota qué cosechas se
listan. KPIs, comparación por lote, calidad y series usan identidades de
campaña.

## Qué sí cubre el repo hoy

| Capacidad | Fuente |
|-----------|--------|
| Identidad de cosecha `Principal 2027` | `produccion(ano, cosecha_tipo)` |
| Año de movimiento (filtro opcional) | Regla de producto: en año Y → Principal Y, Traviesa Y, Principal Y+1 |
| Producción / comparación por lote | `kg_totales` consolidados por cosecha (sin doble conteo lote/sublote) |
| Calidad export/nacional | `kg_exportacion` / `kg_nacional` opcionales |
| kg/árbol y t/ha honestos | `null` sin denominador; nunca cero inventado |
| Filtros dinámicos | Catálogo vivo de cosechas; sin listas hardcodeadas |

## Gaps explícitos (UI muestra «Sin dato»)

1. **Fecha de movimiento** — `produccion` no tiene columna de fecha. El filtro opcional de año usa la asociación de campaña; no inventa fechas diarias ni reagrupa por calendario.
2. **Evolución semanal / acumulado** — no hay entrada por canastilla ni serie ISO. El bloque del mock queda como gap; recomendación de eje relativo documentada en UI.
3. **Clasificación por calibre/comprador** — solo existe desglose export/nacional opcional.
4. **Despachos y conciliación de etapas** — no hay tabla de despachos; no se infiere merma ni se usan cifras del mock Figma.
5. **Producción = entrada neta** — el proxy actual es `kg_totales`. No se suman etapas.

## No objetivos respetados

Sin importación, sin migraciones en vivo, sin tocar captura manual como objetivo, sin merge/deploy, sin datos demo en producción.
