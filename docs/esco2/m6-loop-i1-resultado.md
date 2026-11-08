# M6 · Iteración 1 · Resultados observados

Fecha: 2026-11-07. Candidato: `7765ee19f77d8be7a8ae712de6e3b009b94ff95f`.
Control: `c85ce43bdf5a51e5b253489931fbdd3f2b6c2ba2`.

**No pasa la puerta interna.** Los resultados de DEV y SOMBRA y las tres
inestabilidades observadas impiden continuar a confirmación. No se ejecutaron
la tercera repetición ni la aceptación final; HO permanece cerrado.

Este informe reproduce exclusivamente agregados entregados por B. La campaña
pagada terminó. La revisión manual completa quedó sellada antes del automático.
La consolidación automática y la comprobación final de integridad quedaron cerradas.
Estos resultados no acreditan aceptación M6.

## Resultados y completitud

| Métrica | DEV | SOMBRA |
|---|---:|---:|
| Rep. 1: escenarios aprobados | 2/22 (9,09 %) | 8/50 (16,00 %) |
| Wilson 95 % descriptivo de rep. 1 | 2,53–27,81 % | 8,34–28,51 % |
| Rep. 2: aprobados entre los seleccionados | 0/2 | 7/8 |
| Escenarios cribados para rep. 2 por fallo previo | 20 | 42 |
| Inestabilidades observadas | 2/2 comparables | 1/8 comparables |
| Certificación en tres repeticiones / Wilson correspondiente | NA | NA |
| Confirmados / fallidos / no certificados bajo criterio de tres repeticiones | 0 / 22 / 0 | 0 / 43 / 7 |

Los siete SOMBRA no certificados aprobaron dos repeticiones, pero no tienen una
tercera. No se cuentan como fallos factuales. Los denominadores siguen siendo
22 y 50; las tasas de la segunda repetición son condicionales a la selección.
La puerta ya era inalcanzable tras DEV rep. 1, por lo que se aplicó la etapa corta.

Los imprescindibles binarios de los cinco dominios fallaron en ambas particiones.
B no reportó controles DEV sin asignar. Críticos observados: **0**.

## Comparación pareada de la primera repetición

| Partición | Control | Candidato | Diferencia descriptiva |
|---|---:|---:|---:|
| DEV | 0/22 | 2/22 | +9,09 puntos |
| SOMBRA | 6/50 | 8/50 | +4,00 puntos |

Pares SOMBRA: ambos pasan 4; solo candidato 4; solo control 2; ambos fallan 40.
En DEV solo candidato pasa 2 y ambos fallan 20. Esto compara rep. 1 con rep. 1,
no una repetición del control con tres del candidato.

## Llamadas y latencia observada

| Corrida | Llamadas / turnos | Llamadas por turno | HTTP p50 / p95 |
|---|---:|---:|---:|
| Candidato rep. 1 | 190/78 | 2,436 | 7,721 / 12,567 s |
| Candidato rep. 2 seleccionada | 26/11 | 2,364 | 6,818 / 11,193 s |
| Control rep. 1 | 133/78 | 1,705 | 4,118 / 11,471 s |

Percentiles por interpolación lineal, sin tiempo de revisión manual. Son medidas
del arnés HTTP de evaluación con captura fija, no una certificación de latencia
productiva, navegador o RLS en producción.

## Errores y familias

Candidato rep. 1: `error_plan` en 57/78 turnos:

| Código | Turnos |
|---|---:|
| `intencion_no_valida:selector` | 23 |
| `discrepancia_intencion` | 18 |
| `intencion_no_valida:metrica_o_grupo` | 4 |
| `argumentos_no_validos` | 2 |
| `intencion_no_valida:evidencia_actual` | 2 |
| `texto_no_literal` | 2 |
| `intencion_no_valida:dependencia` | 2 |
| `intencion_no_valida:comparacion` | 2 |
| `intencion_no_valida:obligacion` | 1 |
| `fuera_de_contrato_inconsistente` | 1 |

En rep. 2 hubo dos `error_plan`, ambos `discrepancia_intencion`.

Control: `error_plan` en 63/78 turnos: intencion_no_valida 45,
discrepancia_intencion 15 y argumentos_no_validos 3.

Familias del candidato rep. 1, en turnos etiquetados **no exclusivos**:
extractor 34; comparación de intención 18; cobertura 7; render 6; planificador 5;
historial 5; fuente 2; selección 2; métrica 2; guardia 1; precisión 1.
En rep. 2: intención 2; historial 1; cobertura 1; render 1.
Estas etiquetas pueden solaparse y no son un conteo adicional de escenarios.

Quemados: **0** en este corte; todavía no se divulgaron reproducciones estructurales
de SOMBRA. Las reproducciones sintéticas y la reposición corresponden a B.

## Gasto y evidencia

Gasto real conocido del loop y de esta iteración: **USD 0,332582440**, incluido
el control. Costos desconocidos y solicitudes en vuelo: **0**. Hay 349/349 recibos,
167 turnos y 167 revisiones manuales; B reportó cero pagos duplicados.
El gasto permanece dentro de USD 0,40 por iteración y USD 3 por loop.
El respaldo USD 4/12 no se activó. No habrá más inferencias en esta iteración.

El [CI del SHA exacto](https://github.com/sforero94/Escociaos/actions/runs/42386553643/job/128445077995)
estaba verde antes de congelar. A repitió 24/24 controles F8 y seguimiento.
El incidente del guard tuvo 392/392 controles aislados en B y QA pública de A;
no requirió cambiar producto. B verificó 47 controles del ledger.

El reinicio del arnés se hizo desde 18 turnos de SOMBRA pertenecientes a
17 escenarios completos. B preservó recibos, resultados favorables y fallidos,
y saldo; QA y coordinador B repitieron 55/55 controles sintéticos. El runner
original permaneció intacto y un suplemento sellado se verificó antes de cada
llamada; no hubo repetición de inferencias cobradas.

Auditoría final de B: cuatro sellos manuales anteriores al automático; 167/167
revisiones; 161 archivos de freeze, 33 originales DEV y suplemento sin deriva;
349 pares solicitud/recibo y cadena de hashes verificados. Cero reservas activas,
pendientes o duplicados. Referencias concluyentes en 22 DEV y 50 SOMBRA; cero
referencias inconclusas observadas. Ningún recibo excedió su reserva ni su cota
de entrada: el máximo de tokens de proveedor menos tokens reservados fue −3.922.

El automático comprobó la forma en 167/167 turnos. El chequeo parcial de contrato
y anclas disponibles aprobó 57/78 turnos del candidato rep. 1, 10/11 de rep. 2
y 56/78 del control. No son tasas de exactitud factual: hubo 98 discrepancias
manual/automático. Todos los aprobados manuales también pasaron el automático.
Para DEV se usan las anclas, origen y etiquetas disponibles; para SOMBRA el
automático verifica forma HTTP y la revisión factual depende del SQL independiente
y del examen manual. No certifica semántica factual ni RLS productiva. El checker
tuvo 69/69 controles sintéticos y una repetición de 69/69 por el coordinador B.

Saldo restante: USD 0,067417560 de esta iteración y USD 2,667417560 del loop.
Los procesos de pago quedaron cerrados. No se inició una nueva iteración.

Huella pública acordada por A y B, 73 archivos desde el manejador:
`3a1da3453c5489d6475ea96b541995e06b2e6d0681a4fdd2e5dfa8798098cd5f`.
Incluyendo `index.ts`, 74 archivos:
`94e178190a65b905af43b0432378ec7e9d3546c796325bc533de5588b9a625c3`.

Sin casos, preguntas originales, capturas, referencias ni trazas privadas en este
informe. Sin fusión, deploy, migraciones, secretos ni escrituras productivas.
D-L3 sigue pendiente y solo bloquea la puerta final.
