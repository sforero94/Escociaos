# Entrega: corrección financiera protegida de ventas

## Estado

Fundamento local de la Opción 2 validado el 23 de octubre de 2026. Rama `codex/security-integrity-20261010`; base publicada `e550798b9bd4d41aee5e45ada4d01f1c4ac3dd0f`. La entrega crea un solo commit local; no se ha hecho push. Consulta `git rev-parse HEAD` para obtener su huella.

## Resultado comprobado

- Grafo de 62 candidatos: 269 comprobaciones nativas y 91 del SDK heredadas.
- Frente nuevo: 29 comprobaciones SQL, 11 comprobaciones de carreras y 3 esperas de bloqueo reales observadas.
- Los 8 campos financieros se corrigen, con comparación del plan y lectura independiente. Los demás campos y los orígenes de venta, evento y animal quedan preservados.
- Coinciden 545 huellas de fuentes y 6 snapshots. La base temporal quedó detenida y eliminada.
- Terminaron 1.524 consultas sin timeout; máximo de 2,02 segundos.
- Lint: 0 errores y 873 advertencias previas. Typecheck y 42 pruebas Python pasan. App: 316 archivos y 6.451 pruebas pasan con un solo worker en 43,51 segundos.

La evidencia funcional está en `financial-sale-correction-replay.json`; la revisión previa y sus limitaciones están en `financial-sale-correction-preflight.md/json`. `execution-status.md`, `financial-sale-correction-checkpoint.md` y `release-readiness.md` conservan el historial y el cierre actual. Las correcciones de las pruebas no alteraron el candidato SQL ni su generador respecto al paquete original.

## Continuación con otro agente

Este chat se detiene tras el commit. El siguiente frente es integrar los llamadores reales SDK/navegador de corrección de ventas. Después siguen los demás frentes descritos en `execution-status.md`; no están certificados por esta unidad.

En este mismo checkout, basta continuar desde HEAD. Para otro checkout que ya tenga la base publicada exacta, el bundle entregado incluye este único commit y declara esa base como requisito. Verifica el bundle antes de importarlo. Esta validación local no autoriza merge ni deploy a producción.

No se consultó producción ni se aplicaron migraciones. Los exports privados siguen fuera de Git. Para repetir el replay en otra máquina harán falta la copia privada aprobada de `schema-evidence`, PostgreSQL 17.6 y pg 8.16.3. No sustituyas los snapshots ni los obtengas de producción. Los auxiliares de la revisión offline permanecen en `/private/tmp/escocia-handoff-control` de este Mac y no forman una suite portable del repo.
