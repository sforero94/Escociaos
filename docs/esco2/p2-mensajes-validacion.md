# P2: cierre de mensajes y preservación de evidencia

2026-11-04. El coordinador verificó el añadido sobre la recuperación P2-A pendiente.
La rama de revisión es `codex/esco2-p2-mensajes`, basada en el main remoto
`9d3ed18d172108ef7e12f9694bbcf321aa477152`. El avance concurrente de main
solo añadió tres documentos sobre la migración 190; se incorporó sin cambiar
el runtime ni consultar producción. El handoff local ajeno queda fuera del PR.

## Resultado final independiente

| Check ejecutado por el coordinador | Resultado |
|---|---|
| `npm test` | 7.399/7.399 pruebas, 306 archivos |
| `./node_modules/.bin/tsc --noEmit` | Correcto |
| `npm run lint` | 0 errores, 907 advertencias existentes |
| Build productivo en un directorio temporal nuevo | Correcto |
| Pruning de la pantalla/cliente diagnóstico | Cuatro marcadores ausentes |
| JSON P1 conservado | 13 archivos de evidencia y un tsconfig idénticos |
| Manifiesto congelado P0 | 5/5 huellas correctas |
| Código probado | 43 huellas comparadas antes de publicar |

Las pruebas incluyen 79 controles nuevos de QA independiente, 12 unitarios de
mensajes y 10 de escritura de evidencia, además de los 108 controles P2 previos.
Los trece estados tienen textos españoles completos esperados; las ocho clases
de mutación alteran ahora el texto final y conservan sus controles positivos.
Una auditoría de todos los números de las salidas representativas liga cada
aparición a entidad, campo, unidad y contexto temporal. D30 conserva el alcance
de tarea completa, distinto del trabajo registrado en el período.

La primera corrida completa encontró una guarda estática de calendario en rojo.
Se retiró una conversión innecesaria del renderer porque sus entradas ya son
fechas calendario. La corrida final anterior está íntegramente aprobada. QA
también comprobó las veinte pruebas de formato en UTC, Bogotá y Nueva York;
no se añadieron excepciones a la guarda. El build existente no se abrió ni alteró.

## Escritura explícita de evidencia

Los dos teardowns históricos solo crean carpetas o escriben JSON cuando
`ESCO2_RECOVERY_WRITE` vale exactamente `1`. Sin variable, vacía, `0` o `true`,
no escriben. Diez pruebas ejecutan esos callbacks reales en un VM con filesystem
simulado; incluso el control positivo no puede tocar los artefactos.

No se ejecutaron los runners históricos completos contra el runtime reparado.
Conservan sus caracterizaciones históricas y siguen fuera del descubrimiento
por defecto. La guarda explícita evita escrituras también si alguien los ejecuta
individualmente. Los resultados, referencias e iteraciones P1 no cambiaron.

## Reproducción y entrega

```sh
npm test
./node_modules/.bin/tsc --noEmit
npm run lint
./node_modules/.bin/vite build --outDir /private/tmp/esco2-mensajes-build-final --emptyOutDir
git diff --check
```

Los [ejemplos antes/después](p2-mensajes.md) se copian íntegros al cuerpo del PR.
La [revisión independiente](p2-mensajes-qa.md) explica los libros literales y sus
versiones. El [manifiesto](../../scripts/esco2/p2/mensajes-validation.json)
registra comandos, conteos y huellas. El check remoto `verificacion` se comprueba
contra el SHA exacto publicado antes de informar el cierre.

Esta entrega permite revisión por PR, sin merge ni push directo a main. No
autoriza P3, campañas de modelos, acceso al held-out, producción, migraciones,
secretos, despliegue manual ni piloto. Mantiene los límites de estado efímero,
lecturas independientes y aceptación funcional pendiente documentados en P2.
