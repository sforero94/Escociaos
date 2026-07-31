# Memoria — Security Compliance

Escrita solo por el orquestador (ver `README.md`). Inyectada completa en el
prompt del agente en cada corrida.

## Estados aceptados
- `puedeAccederModulo` falla ABIERTO por diseno (profile null o rol '' → true) — decision documentada en el CLAUDE.md raiz (Module Access Control) para no bloquear a Gerencia durante la ventana de 2s del perfil. No es un hallazgo. [seed 2026-07-31]
- El control de modulos (`modulos_acceso`) es visibilidad de navegacion, NO un data boundary — no hay RLS detras, por diseno documentado. Reportar solo si un dato Gerencia-only queda expuesto por otra via. [seed 2026-07-31]

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
