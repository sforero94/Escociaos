# P3 Task 4: costo por aplicación (D34)

Rama `codex/esco2-p3-task4`, independiente desde `main` `19bbc6ca`.
Operación cerrada `consultar_costos_aplicacion`, con selector singular y plan valorizado
solo mediante petición explícita. Revisión y merge corresponden a Santiago o Claude Code.

## Resultado

Una aplicación cerrada usa exclusivamente los tres importes congelados de `aplicaciones`
y un cierre único, legible y con fecha operativa válida de `aplicaciones_cierre`.
Cierre ausente, duplicado o no leído no acredita costo de cierre verificado. NULL nunca
se transforma en cero; un componente faltante o una suma que no cuadra retiene la
verificación del total y conserva los valores guardados con su estado.
`valor_jornal` no interviene. Se conserva la advertencia de precios mal capturados en origen.
No se corrigen datos ni se reconstruye el cierre con precios o labor vivos.

Para abiertas, la ejecución validada de Task 3 se multiplica por `precio_unitario` leído
hoy, por ID y unidad compatible. Se rotula subtotal de insumos a precio de hoy con fecha
Bogotá, separado del plan valorizado opcional. No se llama `calcularCostosVivosAplicacion`
ni se suman bases congeladas/actuales. Movimiento sin productos, precio NULL/no leído,
inventario no visible o unidad incompatible impiden total completo, conservando el subtotal
conocido. Un cambio de estado entre lecturas también retiene la valorización afectada.

Lectores caller-JWT con columnas fijas, conteo exacto, bloques `in` de 100 y pertenencia al
padre visible. Cerradas no consultan precios/cantidades salvo plan solicitado. Nombres
primero, UUID completo solo por ausencia o colisión; una línea por producto y limpieza
numérica a 12 cifras significativas. Motores originales de cantidades sin cambios.

## Verificación

QA independiente fijó oráculos literales/SQL antes de la integración y usa handler real,
SQL/RLS sintético y red prohibida. Cubre precio actual rotulado histórico, `valor_jornal`
confundido con total laboral, fan-out, plan sumado a ejecución, cierre duplicado/no leído,
NULL frente a cero, unidad incompatible, movimiento parcial sin productos, padre invisible,
101 precios en bloques de 100 y presentación por nombres. Cada mutación aplicable tiene
control positivo legítimo. El coordinador repitió los checks sobre fuentes congeladas.

| Check | Resultado del coordinador |
|---|---|
| `npm test` | 7.695 aprobadas, 328 archivos |
| Nuevas pruebas | 55: 29 backend y 26 QA |
| `npx tsc --noEmit` | Aprobado |
| `npm run lint` | 0 errores, 907 avisos existentes |
| Grafo desde `supabase/functions/esco-consultas/index.ts` | 30 módulos locales resueltos sin Deno; imports `.ts`, sin alias ni entorno de navegador |
| Deriva | Tres módulos nuevos listados en workflow y regex |
| Fuentes durante verificaciones | 38/38 huellas estables |
| Whitespace | Aprobado |

Simulación local sin red, solo tamaño sobre 24 aplicaciones reales del snapshot del
**2026-11-03**: consulta de costo, líneas mediana **5**, máximo **11**; caracteres mediana
**434,5**, máximo **643**. Con plan valorizado explícito: líneas mediana **12**, máximo **26**;
caracteres mediana **925**, máximo **1.721**. **0 respuestas con UUID** en ambas modalidades.
No se puntúan referencias ni se afirma vigencia de precios o aceptación funcional.
Solo se publican estos agregados; snapshot, respuestas e identificadores permanecen privados.

## Gasto y pendientes

Cero llamadas pagadas y **USD 0** incremental; acumulado publicado recibido **USD 0,0433 / 0,25**.
Sin preguntas semánticas esenciales abiertas. Prueba real v5 Gerencia 200 / Administrador 403
pendiente por navegador del agente deshabilitado y falta de sesión; cero envíos al modelo.
El PR reportará CI `verificacion` verde en su SHA exacto. Sin producción, deploy, migración,
secretos, held-out ni runner de cierre. Chat, Telegram y servidor legado permanecen intactos.
Tasks 5 y 6 son PRs independientes; cierre P3 solo tras confirmación de las tres en main.
