# Evals de ruteo — ¿qué puede hacer el viernes solo?

Esta carpeta es la evidencia detrás de la rúbrica de ruteo ([`rubrica-ruteo.md`](rubrica-ruteo.md)) y
de la decisión de Santiago del 2026-10-26: el viernes aplica migraciones `ddl_aditivo`, y la opción A
del 2026-09-27 queda revocada para esa clase.

**La pregunta que mide:** si el lunes o el jueves clasifican un hallazgo con la rúbrica, ¿lo mandan
al viernes solo cuando el viernes puede resolverlo sin Santiago?

**El error que no se tolera es el falso autónomo:** algo que va al viernes y era de Santiago. El falso
FDS (algo que le llega a él y el viernes podía hacerlo) se acepta, pero se cuenta.

## Método

1. **Dataset (2026-08-24 → 2026-10-23).**
   - Los 24 PRs que abrió la Routine del viernes, con su hallazgo enlazado.
   - Los 73 hallazgos del ledger de Notion que fueron a Santiago: `Requiere aprobacion`, `Clase =
     datos` o `decision`, o severidad P0/P1.
2. **Etiquetado v0.** Dos etiquetadores independientes, a ciegas, con una rúbrica v0. Coincidieron en
   la ruta de 91 de 97 ítems. Los desacuerdos se resolvieron con seis reglas (R1–R6) y cinco
   respuestas de Santiago, y de ahí salió la rúbrica v1.
   - Etiquetas de consenso: [`datos/consenso_v0.jsonl`](datos/consenso_v0.jsonl).
3. **Set dorado.** 93 hallazgos, uno por ficha, con la ruta correcta bajo la rúbrica:
   [`datos/dorado_v1.1.jsonl`](datos/dorado_v1.1.jsonl).
   - Reparto: 66 `FDS`, 19 `VIERNES`, 5 `P0_AHORA` y 3 `MIXTO` (fichas que se debieron dividir).
4. **Eval a ciegas.** Dos clasificadores hacen de "lunes":
   - Solo ven lo que había **al filar** el hallazgo: título, evidencia, impacto, acción recomendada y
     severidad filada. No ven la clase, la aprobación, el cierre ni el PR.
   - La rúbrica que reciben no trae los IDs de los casos que la fijaron, así no pueden copiar la
     respuesta.
   - [`puntuar.py`](puntuar.py) compara su salida con el set dorado.

```bash
python3 -I puntuar.py datos/dorado_v1.1.jsonl datos/salida_v1.1_A.jsonl datos/salida_v1.1_B.jsonl
```

El repo es público, así que **la entrada cruda no se versiona**: el texto de los hallazgos trae
nombres y correos. Para volver a correr el eval se reconstruye desde Notion:
- base Mantenimiento, `Detectado` en la ventana;
- campos `Hallazgo`, `Resumen (ES)`, `Evidencia`, `Impacto` y `Accion recomendada` (1.500
  caracteres), `Severidad`, `Confianza`, `Esfuerzo`, `Modulo`, `Especialidad`, `Detectado`.

## Resultados

| Versión | Clasificador | Falsos autónomos | P0 perdidos | Sobre-escalados | Falsos FDS | Acuerdo A↔B |
|---|---|---|---|---|---|---|
| v1 | A | 2 (fuga de datos, ver abajo) | 0 | 1 | 6 | 81/93 |
| v1 | B | 2 partes (ESCO-160, ESCO-134) | 0 | 1 | 7 | |
| **v1.1** | **A** | **0** | **0** | 1 | 5 | **87/93** |
| **v1.1** | **B** | **0** | **0** | 2 | 6 | |

**Qué cambió de v1 a v1.1:**
- **V2** ahora dice explícitamente que un aviso nuevo en un informe y el ciclo de una alerta son "lo
  que recibe un usuario". Es la falla de ESCO-160 y ESCO-134.
- **Paso 2:** se divide solo si una parte es `VIERNES`, y se agrega `bloqueada_por`.
- **P0:** se precisan "exposición abierta" y "caída física".
- **`preaprobado`** exige cita literal.
- **V9** distingue el preflight de los pasos del runbook.

**Cómo se revisó:** las partes `VIERNES` que los clasificadores separaron de fichas `FDS` se miraron a
mano, una por una. En la v1.1 todas son legítimas: un chequeo de preflight, un doc que describe lo
que existe, o un arreglo de código separado de los datos o de la decisión. La regla R5 funciona así.

### Límites, dichos tal cual

- **Es un eval dentro de la muestra.** La rúbrica salió de estos mismos casos. Quitarle los IDs evita
  copiar respuestas, pero no evita que los criterios estén cortados a la medida de estos 93. **La
  prueba que cuenta es la de afuera:** los hallazgos nuevos desde el lunes 2026-11-02. Cada mes se
  agregan los resultados del viernes (fusionado sin cambios, rehecho o revertido) al set dorado y se
  vuelve a correr.
- **Fuga de datos en el texto filado.** En Notion, `Accion recomendada` a veces se reescribe después
  de que Santiago decide (ESCO-38, 39, 42, 44, 74, 75). En el eval de v1 eso hizo que A viera la
  decisión y mandara al viernes la implementación. Para la v1.1 esos textos se omitieron. **En la
  operación real eso no es un error:** una decisión ya tomada sí vuelve la implementación del viernes
  (`preaprobado`).
- **Errores que quedan, todos del lado seguro:**
  - ESCO-149, una herramienta de Esco caída, sale como P0 en los dos clasificadores.
  - ESCO-103 sale como P0 en B.
  - Los falsos FDS vienen de dividir de más.

  Candidatos para una v1.2, que exige volver a correr el eval:
  - "una herramienta que falla dentro de un módulo que funciona no es P0";
  - "`fusionar` nunca es una parte `VIERNES`", porque A propuso fusionar #275 como parte del viernes.

## Cuándo volver a correrlo

- **Antes de fusionar cualquier cambio a `rubrica-ruteo.md`.** Debe seguir dando 0 falsos autónomos y
  0 P0 perdidos.
- **Una vez al mes**, con los casos nuevos agregados al set dorado.
