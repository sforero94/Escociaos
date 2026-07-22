# Documentación de Escocia OS

Esta carpeta contiene documentación vigente para operar, mantener y extender el sistema. Los planes cerrados, incidentes resueltos y guías de una sola vez están en [`archive/`](./archive/README.md).

## Referencias vigentes

- [`supabase_tablas.md`](./supabase_tablas.md) — referencia del esquema de base de datos. Debe validarse contra las migraciones antes de modificar datos o RLS.
- [`README_CARGA_CSV.md`](./README_CARGA_CSV.md) — importación masiva de monitoreos.
- [`GUIA_CONFIGURACION_LOTES_SUBLOTES.md`](./GUIA_CONFIGURACION_LOTES_SUBLOTES.md) — gestión de lotes y sublotes.
- [`plan_hato_lechero_module.md`](./plan_hato_lechero_module.md) — diseño activo del módulo Hato Lechero.
- [`hato/s3-handoff.md`](./hato/s3-handoff.md) — arranque en frío de S3 (importación histórica), **ya completada 2026-07-22** — se conserva como registro; el estado vigente está en el plan §8. Junto a él en [`hato/`](./hato/): el contrato del pipeline, el barrido de las planillas, la matriz adversarial de QA sobre las 45 hojas, y [`s3-verificacion-independiente.md`](./hato/s3-verificacion-independiente.md) — la verificación del coordinador que corrigió varios conteos de los barridos previos y cerró 5 preguntas del dueño por medición.
- [`PLAN_MEJORAS_MODULO_LABORES.md`](./PLAN_MEJORAS_MODULO_LABORES.md) — hoja de ruta del módulo de labores.
- [`PLAN_REPORTE_HTML_GEMINI.md`](./PLAN_REPORTE_HTML_GEMINI.md) — propuesta pendiente para el Reporte Semanal.
- [`SPEC_TELEGRAM_BOT.md`](./SPEC_TELEGRAM_BOT.md) — especificación del bot de campo.

## Contratos de implementación

- [`plan_reportes_finanzas.md`](./plan_reportes_finanzas.md) — reglas contables aprobadas para P&G y flujo de caja.
- [`plan_sidebar_modulos.md`](./plan_sidebar_modulos.md) — diseño implementado de navegación y acceso por módulo.
- [`PLAN_PRIORIZACION_MONITOREO.md`](./PLAN_PRIORIZACION_MONITOREO.md) — razonamiento y contrato de priorización de scouting.
- [`POC_PREDICCION_PLAGAS.md`](./POC_PREDICCION_PLAGAS.md) — POC cerrado; conserva el resultado NO-GO y la evidencia metodológica.

## Historial de bugs

Solo permanece fuera del archivo el contrato de scroll de diálogos: [`bugs/2026-07-21-dialog-sin-scroll-usuarios.md`](./bugs/2026-07-21-dialog-sin-scroll-usuarios.md). Los incidentes resueltos están en [`archive/incidents/`](./archive/incidents/).
