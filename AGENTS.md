# Instrucciones compartidas del proyecto

Lee `CLAUDE.md` para comandos, arquitectura y restricciones del repositorio.

## Esco 2.0: M5, M6 y preparación del piloto

Antes de trabajar en este frente, lee y aplica
[`docs/esco2/guia-entrega-m5-m6.md`](docs/esco2/guia-entrega-m5-m6.md).
Es la guía compartida de entrega; evita duplicar sus reglas en otros archivos.

- M4 está aceptado desde `main` `5367e060`; conserva sus regresiones.
- Confirma el alcance, los cortes y el presupuesto vigentes antes de ejecutar.
  Los valores históricos de M4 no autorizan M5, M6 ni un despliegue.
- Completa implementación, pruebas y evidencia real dentro de lo autorizado.
  Entrega a Claude Code un paquete funcional para confirmación y fusión.
- Usa implementador y QA separados; el coordinador verifica sus resultados.
  La independencia de M6 exige además otra sesión y custodia D17.
- Reutiliza autorizaciones concretas; escala solo decisiones o permisos faltantes.
  Una revisión automática rechazada se explica y nunca se evade.
- Publica solo agregados. Los casos, fuentes, respuestas y trazas privados quedan
  fuera de Git; no abras el held-out desde implementación.

La guía conserva límites y checkpoints fechados; no sustituye una instrucción
actual de Santiago ni concede permisos de producción o de envío de datos.
