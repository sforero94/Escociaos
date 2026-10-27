# Rúbrica de ruteo — v1.1 (2026-10-26)

**Quién la usa:** el lunes y el jueves, al filar cada hallazgo. **Qué decide:** la `Ruta` de la ficha
en Notion. El viernes verifica la ruta antes de actuar y no la cambia por su cuenta: si cree que está
mal, la manda al FDS con el motivo.

**De dónde sale:** del eval sobre 97 casos reales (24 PRs del viernes y 73 hallazgos que fueron a
Santiago, 2026-08-24 → 2026-10-23). Resultados y método: [`README.md`](README.md). Si cambias un
criterio, vuelve a correr el eval antes de fusionar. **Debe seguir dando 0 falsos autónomos.**

Decisiones de Santiago del 2026-10-26 que esta rúbrica aplica:
- Revoca la opción A del 2026-09-27: el viernes **aplica** migraciones `ddl_aditivo`.
- Aprueba las 6 reglas R1–R6.
- Confirma la línea de P0, P1 en el viernes, cambios a la propia operación y preparación para el FDS.

---

## Las tres rutas

| `Ruta` | Qué pasa |
|---|---|
| `P0_AHORA` | Te notifica de inmediato. No espera al fin de semana. |
| `VIERNES` | El viernes lo resuelve solo: PR, y migración aplicada si es `ddl_aditivo`. Tú solo fusionas. |
| `FDS` | Va al reporte del sábado, con las opciones ya escritas. Tú decides o apruebas. |

## Paso 1 — ¿Es P0?

Aplica el §5 de la constitución **literalmente**, sin importar la etiqueta que traiga el hallazgo. Es
`P0_AHORA` si se cumple al menos una:
- producción está caída, entera o un módulo (un motor que no corre, una superficie que no responde);
- se están perdiendo datos de forma irrecuperable;
- hay una exposición de seguridad abierta ahora mismo.

Por ejemplo, un cron que pierde la mitad de las lecturas cada día es P0 aunque lo hayan filado como
P1. Casos que lo fijaron: ESCO-36, ESCO-57, ESCO-97 y ESCO-106.

Dos precisiones (v1.1, por ESCO-96 y ESCO-137):
- **"Exposición abierta"** significa que alguien **fuera del grupo autorizado** puede entrar ahora: `anon`, internet, o una cuenta inactiva o de alguien que ya no está. Una cuenta activa del equipo con más permisos de los debidos es P1 y va al `FDS`, no es P0.
- **Una caída física** (luz o wifi en la finca) que pierde datos es P0 **solo si no existe ya una alerta propia que avise a tiempo**. Desde la migración 180, la estación de clima sin datos avisa por Telegram a las 3 h, así que esa caída no se vuelve a escalar como P0. Si Santiago ya conoce la causa, tampoco.

## Paso 2 — Una ficha, una clase (R5)

Si el arreglo tiene partes de clases distintas (código, DDL, datos o decisión), **fila una ficha por
parte** y enlázalas. Cada parte se rutea sola.

El caso que lo fijó es ESCO-139: código, DDL, una migración de datos con fechas que solo tenía Santiago
y una regla contable, todo en una ficha marcada `codigo`.

- **Divide solo si al menos una parte es `VIERNES`.** Si todas las partes son `FDS`, deja una sola
  ficha `FDS` con los pasos en orden.
- **Una parte `VIERNES` que necesita el resultado de una parte `FDS`** (un valor que hay que decidir,
  una DDL que debe aplicarse antes) lleva `bloqueada_por: ESCO-NNN`. No es elegible hasta que esa
  ficha se cierre. Casos: ESCO-45 y ESCO-115.

## Paso 3 — ¿Puede ir al viernes?

`VIERNES` solo si se cumplen **todos** estos criterios. Si falla uno, la ruta es `FDS`, y la ficha
lleva el criterio que falló.

| # | Criterio | Falla si… | Caso |
|---|---|---|---|
| V1 | Verificable sin Santiago | No se puede comprobar con una prueba, una consulta o la suite. | — |
| V2 | Sin decisión de negocio | Elige una regla contable, un umbral o una regla de valoración. O cambia qué ve o recibe un usuario: un aviso o mensaje nuevo en una pantalla o un informe, o el ciclo de una alerta (cuándo nace, se descarta o escala, y a quién llega). **Corregir un texto que hoy dice algo falso no falla V2.** | ESCO-160, ESCO-134; corregir: ESCO-89 |
| V2a | **R1 — El acceso es de Santiago** | Cambia quién lee o escribe: RLS, `GRANT`/`REVOKE`, roles, políticas de Storage. Va al FDS aunque la sintaxis sea aditiva. | PR-182 |
| V2b | **R3 — Un parámetro "a confirmar" es una decisión** | El hallazgo deja un valor abierto (N minutos, un umbral). Primero lo eliges tú y después el viernes lo implementa. | PR-196 |
| V3 | Sin información que solo tiene Santiago | Necesita fechas, hechos de campo o la confirmación de qué pasó. | PR-333 |
| V4 | **R6 — Sin escritura de filas** | Hace `UPDATE`, `DELETE` o `INSERT` de datos de dominio en producción. **Aunque esté preaprobado**: eso lo ejecuta la sesión del sábado, contigo presente. | PR-225 |
| V5 | **R2 — DDL aditivo en sintaxis y en efecto** | Cambia el comportamiento de algo que ya existe. Ver la lista de abajo. | PR-222, ESCO-55 |
| V6 | Dentro del carril | Necesita el panel de Storage, Vault o secretos, cambiar cuentas o roles, o algo físico en la finca. | ESCO-75 |
| V7 | **R4 — Sin superficie nueva sin aprobar** | Crea una feature, un endpoint, un botón o un camino de escritura. El jueves la propone y tú la apruebas el sábado. Después, un viernes la construye con la bandera `preaprobado` y la cita de tu aprobación. | PR-291 |
| V8 | Severidad | Es P0. Un P1 solo es del viernes si el arreglo es del repo (tests, CI, docs) o código sin decisión. | ESCO-125, ESCO-149 |
| V9 | No cambia las reglas de la operación | Toca topes, elegibilidad, guardarraíles, roster, cadencia, la plantilla de despacho o cualquier paso de un runbook (por ejemplo, el protocolo del commit de memoria). Sí son del viernes: los docs que describen lo que ya existe y un chequeo nuevo de **preflight** (Fase 0). | ESCO-85 (`FDS`), ESCO-131 (`VIERNES`) |

**R5 vale también aquí:** si una ficha cumple todo excepto una parte, divídela (paso 2). No la mandes
entera al viernes.

### Qué cuenta como aditivo (V5)

| Aditivo: sí es del viernes | **No** aditivo: va al FDS |
|---|---|
| `CREATE INDEX` | `CREATE OR REPLACE FUNCTION` / `VIEW` sobre un objeto que **ya existe** |
| `ALTER TABLE … ADD COLUMN` nullable o con `DEFAULT` constante | `ALTER POLICY`, `DROP POLICY`, `REVOKE`, `GRANT` (también fallan V2a) |
| `COMMENT ON` | `ALTER TABLE … ALTER/DROP COLUMN`, `DROP` de lo que sea |
| `DO $$ … $$` que solo hace `RAISE EXCEPTION` de guarda | `cron.schedule`, `cron.alter_job` o `cron.unschedule` sobre un job existente |
| `CREATE TABLE` nueva **con** `ENABLE ROW LEVEL SECURITY` en el mismo archivo | `CREATE FUNCTION`, `CREATE TRIGGER` y `ADD CONSTRAINT … NOT VALID` (ver abajo) |
| | Cualquier `UPDATE`/`DELETE`/`INSERT` de datos (V4) |

**El hook es el piso mecánico de esta tabla** (`.claude/hooks/supabase-guard.py`, 2026-10-26). Deja pasar el
apply del viernes solo si cada sentencia es de la columna "sí". Por eso tres tipos que la v1.1 contaba como
aditivos pasan a "no": **el hook no puede comprobar su efecto**. Una función nueva queda ejecutable por
`PUBLIC`, un trigger `BEFORE` puede reescribir cada escritura futura, y un `CHECK … NOT VALID` igual bloquea
escrituras nuevas, como hizo la 184. Esos van al `FDS` como `datos`: el viernes los prepara y la sesión del
sábado los aplica. **El set dorado no tenía ningún caso `VIERNES` de esos tres tipos**, así que el cambio no
mueve ningún resultado del eval (comprobado 2026-10-26).

## Paso 4 — Si es `FDS`, ¿de qué tipo?

| `Tipo FDS` | Qué trae el reporte del sábado |
|---|---|
| `decision` | Opciones A/B/(C) con su consecuencia y tu recomendación. Respondes `ESCO-NNN A`. |
| `datos` | Una migración que el viernes no puede aplicar: datos, o DDL que **no** es aditiva (V5). Viene escrita y ensayada en `po_sonda`, con pre-estado y post-estado. Respondes `ESCO-NNN aplicar`. |
| `propuesta` | Feature o recomendación del jueves. Respondes `ESCO-NNN si` o `ESCO-NNN no`. |
| `accion_externa` | Lo que solo tú puedes hacer (Storage panel, Vault, la finca), con los pasos. |

**El viernes prepara las fichas `FDS`** (respuesta 5 de Santiago): escribe las opciones, el borrador
de migración con `TODO` donde falta tu dato y la consulta de pre-estado. **Nunca aplica nada de una
ficha `FDS`.** Así el sábado solo eliges.

## Banderas

- `requiere_deploy`: el arreglo es del viernes, pero necesita desplegar la edge function. El reporte
  del sábado lo pone en "PRs para fusionar" con el orden de despliegue.
- `preaprobado`: hay una decisión escrita de Santiago. **Cita literal, entre comillas, con fecha.**
  Una paráfrasis ("Santiago pidió un botón") no vale (ESCO-127). Si Santiago pide algo en una sesión
  en vivo, quien lo fila copia sus palabras textuales.
- `p1`: solo en un P1 cuya ruta es `VIERNES` (pasó por V8).
- `bloqueada_por: ESCO-NNN`: ver el paso 2.

## Cómo se mide un error

- **Falso autónomo:** la ruta dice `VIERNES` y debió ser `FDS` o `P0_AHORA`. **Tolerancia: cero.**
- **Falso FDS:** la ruta dice `FDS` y el viernes podía resolverlo. Se acepta, pero se cuenta: es
  tiempo tuyo.
- **P0 perdido:** debió ser `P0_AHORA` y no lo fue. Tolerancia: cero.
