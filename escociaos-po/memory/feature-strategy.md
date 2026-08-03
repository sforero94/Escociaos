# Memoria — Feature Strategy

Escrita solo por el orquestador (ver `README.md`). Inyectada completa en el
prompt del agente en cada corrida. **Solo corre el primer lunes de cada mes.**

## Estados aceptados
- **Epica H / S10 (Ajustes del Hato) NUNCA se construyo.** grep de
  `hato_alertas_config` en `src/` (excluyendo `supabase/functions`) devuelve cero
  referencias de frontend; `hatoSchemaContract.test.ts:653` lo dice explicitamente
  ("antes de que exista la UI de Ajustes"). Consecuencia: la unica forma de configurar
  destinatarios o apagar un tipo de alerta es SQL manual en produccion. Es el objeto
  de la propuesta #1 de esta corrida. [corrida: 2026-08-03-lunes]
- **El motor de alertas no tiene fecha de corte.** `hatoAlertas.ts:262,278` estampan
  `fecha_programada: fechaReferencia` para `rechequeo_due` y `servicio_sin_confirmacion`,
  asi que el estado derivado de un backfill genera alertas fechadas el dia del tick.
  `hato-alertas-tick.ts:279` despacha con un `for` plano, un mensaje por alerta — la
  agregacion "por franja" que exige Epica C nunca se implemento.
  [corrida: 2026-08-03-lunes]
- **La raza no se persiste desde el chequeo.** `calculosHato.ts:343-348` extrae raza
  (solo gyr/holstein) pero ni `hato-chequeo-commit.ts` ni la RPC 065 la escriben.
  **No proponer "persistir la raza del parser"**: cubre 2 de 4 razas y la decision del
  dueno (Notion V1 Hato Lechero, Tabla C#11) es que la dicta Martha.
  [corrida: 2026-08-03-lunes]
- **Ventana externa fija: visita a la finca 6-21 de agosto de 2026** (plan §8). Es el
  checkpoint que desbloquea la calibracion presencial de `servicio_sin_confirmacion` y
  `parto_proximo`, y la captura de razas con Martha. Cualquier propuesta del hato debe
  medirse contra esa ventana; la siguiente cadencia de chequeo es bimestral.
  [corrida: 2026-08-03-lunes]

## Refutaciones
| Fingerprint | Afirmacion | Por que murio | Corrida |
|---|---|---|---|

## Navegacion
- Estado real de sesiones del hato: `docs/plan_hato_lechero_module.md` §8 (cierres por
  sesion) y §9 (registro de riesgos — **predijo la fatiga del bot y el quemado de
  confianza de Fernando como Alta/Critico**).
- Decisiones abiertas del dueno: Notion "V1 Hato Lechero"
  (`39867755-ed68-80e1-89b9-e8fb78371f62`), Tablas A-D. **Tabla D#2 (espera voluntaria
  60d) sigue sin confirmar** pese a decir "confirmar antes de que las alertas le
  escriban a Fernando".
- **Patron de referencia para captura masiva**: `src/components/produccion/CapturaCosechaGrid.tsx`
  + `useCapturaCosecha.ts` (reemplazo a `RegistrarProduccionDialog`). Es el precedente
  a citar en cualquier propuesta de grilla. Steppers de a uno que quedan:
  `src/components/inventory/ConteoFisico.tsx:64,207`. [corrida: 2026-08-03-lunes]
- **NO proponer prediccion de plagas / ML**: `docs/POC_PREDICCION_PLAGAS.md` es un
  NO-GO registrado con metodologia, y las condiciones empeoraron (cobertura por ronda
  cayendo porque Clara quedo sola desde mayo). Menos datos que cuando se rechazo.
  [corrida: 2026-08-03-lunes]

## Baselines
| Metrica | Valor | Corrida |
|---|---|---|
| Alertas hato | 46 enviadas (2026-08-01 05:45), 1 respondida = **2%**. **43 de 46 son backlog del backfill** (18 rechequeo_due + 25 servicio_sin_confirmacion con fecha_programada 2026-07-23/24). Solo 3 secado_due tienen fechas reales | 2026-08-03-lunes |
| telegram_usuarios | 2 filas: Santiago (gerencia), David Garcia (campo). **Sin Fernando, sin Martha** | 2026-08-03-lunes |
| Completitud del hato | 80 activas · 80 sin raza · 19 sin fecha_nacimiento · 28 sin madre · 8 provisionales · **0 fichas completas** | 2026-08-03-lunes |
| Conteo fisico | 1 verificacion en toda la historia (4a595f8c, 2026-07-30): 223 lineas, **0 contadas**, "En proceso" | 2026-08-03-lunes |
| Superficie construida y vacia | hato_protocolos=0, hato_tratamientos=0 (sin ruta) · hato_pajillas=0 (**CON ruta viva en el sidebar**) | 2026-08-03-lunes |

## Archivo
(vacio)
