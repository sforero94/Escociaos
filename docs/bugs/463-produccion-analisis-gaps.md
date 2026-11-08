# #463 — Gaps del tablero analítico de Producción

Diagnóstico tras implementar filtros dinámicos y vistas una/varias cosechas
sin ampliar schema ni importar Excel/tracker.

## Qué sí cubre el repo hoy

| Capacidad | Fuente |
|-----------|--------|
| Identidad de cosecha `Principal 2027` | `produccion(ano, cosecha_tipo)` |
| Año de movimiento (asociación) | Regla de producto: en año Y → Principal Y, Traviesa Y, Principal Y+1 |
| Producción / comparación por lote | `kg_totales` consolidados (sin doble conteo lote/sublote) |
| Calidad export/nacional | `kg_exportacion` / `kg_nacional` opcionales |
| kg/árbol y t/ha honestos | `null` sin denominador; nunca cero inventado |
| Filtros dinámicos | `DISTINCT` vivo; sin listas hardcodeadas |

## Gaps explícitos (UI muestra «Sin dato»)

1. **Fecha de movimiento** — `produccion` no tiene columna de fecha. El filtro «año del movimiento» usa la asociación de campaña (misma familia que `opcionesCosecha` en finanzas), no fechas diarias inventadas.
2. **Evolución semanal / acumulado** — no hay entrada por canastilla ni serie ISO. El bloque del mock queda como gap; recomendación de eje relativo documentada en UI.
3. **Clasificación por calibre/comprador** — solo existe desglose export/nacional opcional.
4. **Despachos y conciliación de etapas** — no hay tabla de despachos; no se infiere merma ni se usan cifras del mock Figma.
5. **Producción = entrada neta** — el proxy actual es `kg_totales`. No se suman etapas.

## No objetivos respetados

Sin importación, sin migraciones en vivo, sin tocar captura manual como objetivo, sin merge/deploy, sin datos demo en producción.
