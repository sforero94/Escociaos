# S1 — Data Quality Report (monitoring harmonization)

**Output:** `data/processed/monitoreo_lote.parquet` — 5864 rows
**Floración interim:** `data/interim/floracion_db.parquet` — 195 rows (DB era only)

## Row counts by year

| Year | Rows |
|---|---|
| 2022 | 11 |
| 2023 | 1719 |
| 2024 | 2141 |
| 2025 | 1413 |
| 2026 | 580 |

## Rows by focus pest_group

| pest_group | Rows |
|---|---|
| acaros | 1385 |
| cucarron_marceno | 479 |
| fungoso | 1112 |
| monalonion | 460 |
| mosca_ovario | 308 |
| thrips | 436 |

## Distinct lote_key x pest_key series and their span

Total distinct (lote_key, pest_key) series: 218

## Processing log (every drop/repair, in order)

- 2023: DROP impossible row fecha=2023-06-09 lote=6. La Unión pest=Ácaro arboles_monitoreados=100 arboles_afectados=359 incidencia_frac=3.59 (afectados > monitoreados — impossible; unrepairable, dropping)
- 2023: DROP impossible row fecha=2023-06-09 lote=6. La Unión pest=Huevos de acaro arboles_monitoreados=100 arboles_afectados=1264 incidencia_frac=12.64 (afectados > monitoreados — impossible; unrepairable, dropping)
- 2023: DROP impossible row fecha=2023-06-29 lote=9. Acueducto pest=Ácaro arboles_monitoreados=100 arboles_afectados=104 incidencia_frac=1.04 (afectados > monitoreados — impossible; unrepairable, dropping)
- 2023: 1786 raw rows -> 1783 kept after harmonization
- NOTE lote '7. El Triunfo' not in current DB lotes table (kept; likely low-volume/retired)
- NOTE lote '7. El Triunfo' not in current DB lotes table (kept; likely low-volume/retired)
- UNMAPPED lote raw='nan' — dropped
- 2024: DROP impossible row fecha=2024-03-05 lote=1. Piedra Paula pest=Huevos de acaro arboles_monitoreados=100 arboles_afectados=114 incidencia_frac=1.14 (afectados > monitoreados — impossible; unrepairable, dropping)
- 2024: DROP impossible row fecha=2024-03-05 lote=2. Salto de Tequendama pest=Huevos de acaro arboles_monitoreados=100 arboles_afectados=106 incidencia_frac=1.06 (afectados > monitoreados — impossible; unrepairable, dropping)
- 2024: 2565 raw rows -> 2562 kept after harmonization
- db: 4233 raw rows -> 4233 kept after harmonization
- aggregate: 4387 rows involved in same-source (fecha,lote,pest) duplicates — weighted-averaging
- aggregate: 8578 rows -> 5864 rows after arbol-weighted collapse
- SEAM CHECK: 0 cross-source (fecha,lote,pest) duplicates — 2024->2025 seam is clean
