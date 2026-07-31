# Memoria — Usage Analytics

Escrita solo por el orquestador (ver `README.md`). Inyectada completa en el
prompt del agente en cada corrida.

## Estados aceptados
- Cobertura de pesajes de leche: junio 2026 tiene un hueco documentado y aceptado — excluirlo de las metricas de adopcion o marcarlo, nunca contarlo como caida de uso. [seed 2026-07-31]
- Filas creadas por el bot de Telegram llevan `created_by = NULL` (service role, sin `auth.uid()`) — 'Sin usuario' en gastos/ingresos post-triggers es el bot, no un bug de atribucion. [seed 2026-07-31]

## Refutaciones
| Fingerprint | Afirmacion | Por que murio | Corrida |
|---|---|---|---|

## Navegacion
(vacio)

## Baselines
| Metrica | Valor | Corrida |
|---|---|---|

## Archivo
(vacio)
