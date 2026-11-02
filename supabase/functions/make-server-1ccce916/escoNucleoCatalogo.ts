import {CLOCK_ESCO} from './escoEvidencia.ts';
/** One effective catalogue: selected readable operations plus unchanged conditional tools. */
import {HERRAMIENTAS_NUCLEO} from './escoNucleoComun.ts';
export const RUTAS_ACOTADAS_PREVIAS=['get_labor_summary','get_inventory_status','get_climate_data','get_aplicaciones_ejecucion','get_application_summary','get_hato_produccion','get_financial_summary','get_recorded_state_definition','get_hato_partos','get_hato_eventos','get_hato_animales','get_lot_info','get_weekly_overview'] as const;
export const RUTAS_CONDICIONALES=['get_employee_activity','propose_memory_save','commit_memory_save','forget_memory'] as const;
export const NUCLEO_EJECUTABLE:ReadonlySet<string>=new Set([...RUTAS_ACOTADAS_PREVIAS,...HERRAMIENTAS_NUCLEO,...RUTAS_CONDICIONALES]);
export const LIMITES_NUCLEO={
 get_hato_tratamientos:'Tratamientos y protocolos no están incluidos. Sí puedo consultar eventos registrados del hato.',
 get_hato_chequeos:'Los chequeos veterinarios detallados no están incluidos. No inferí evolución clínica.',
 get_hato_salidas_finanzas:'El cruce de salidas del hato con finanzas no está incluido. Un parto o estado no prueba una venta.',
 get_ganado_conciliacion:'La conciliación financiera/física de ganado no está incluida. Sí puedo consultar existencias y movimientos registrados.',
 get_cosecha_trazabilidad:'El enlace completo cosecha-despacho no está incluido. Sí puedo mostrar ambas series registradas sin afirmar cumplimiento.',
 get_recomendaciones_ejecucion:'La comparación de recomendaciones con aplicaciones no está incluida. Sí puedo consultar la ejecución registrada.',
 get_carencia_cosecha:'La evaluación de carencia no está incluida. Esta limitación no autoriza cosechar.',
 get_monitoreo_cobertura:'La cobertura de rondas frente al catálogo no está incluida. Sí puedo consultar incidencia y severidad registradas.',
 get_inventario_conciliacion:'La conciliación de conteos físicos no está incluida. Sí puedo consultar saldos y movimientos registrados.',
 get_producto_consumo:'El rastreo transversal de un producto no está incluido. Sí puedo consultar consumo de una aplicación inequívoca.',
 get_compra_detalle:'El enlace compra-factura-recepción no está incluido. Sí puedo consultar compras y costos registrados.',
 get_finanzas_detalle:'El detalle de soportes y pendientes financieros no está incluido. Sí puedo consultar montos registrados de gastos e ingresos.',
 get_presupuesto_desviaciones:'Las desviaciones presupuestales no están incluidas. No sustituí presupuesto por gasto registrado.',
 get_tarea_ejecucion:'La comparación de estimado contra ejecución de cada tarea no está incluida. Sí puedo consultar tareas y trabajo registrado por separado.',
 get_clima_cobertura:'La auditoría completa de cobertura climática no está incluida. Sí puedo mostrar cobertura de lluvia y radiación en sus consultas.',
 get_capturas_estado:'La revisión de capturas fotográficas no está incluida. No consulté imágenes, documentos ni revisores.',
 get_informes_visita:'Los informes de visita no están incluidos. No consulté documentos ni extraje conclusiones de ellos.',
 get_application_details:'El detalle completo de cierre no está incluido. Sí puedo consultar estado, fechas y consumos/trabajo registrados de la aplicación.',
 get_application_cost_by_lote:'El costo completo de insumos por lote no está incluido. El costo laboral registrado no lo reemplaza.',
 get_cost_by_lote:'El costo completo agregado de aplicaciones no está incluido. Sí puedo consultar costo laboral registrado por lote.',
 web_search_agronomic:'La búsqueda externa no está incluida en este núcleo. No envié contexto privado a un buscador.',
 get_weather_forecast:'El pronóstico no está incluido. La lluvia y radiación registradas no son un pronóstico.',
 get_beehive_data:'El seguimiento de colmenas no está incluido en este núcleo.',
 get_budget_data:'El presupuesto no está incluido. No presenté gastos como presupuesto.',
 get_pyg_flujo_caja:'El P&G y flujo de caja no están incluidos. Ingresos menos gastos no sustituye sus reglas contables.',
 get_hato_animal:'La ficha completa y genealogía individual no están incluidas. Sí puedo consultar el listado y eventos registrados disponibles.',
 get_hato_reproduccion:'El panorama de alertas reproductivas no está incluido. Los partos registrados son una fuente diferente.',
 get_weekly_reports:'Los documentos de reportes semanales no están incluidos. No abrí archivos ni envié su contenido.',
 get_pest_risk_priorizacion:'La priorización de riesgo de plagas no está incluida. Sí puedo consultar monitoreos registrados sin inferir causas.',
} as const;
export function limiteNucleo(name:string):string|null {return Object.prototype.hasOwnProperty.call(LIMITES_NUCLEO,name)?LIMITES_NUCLEO[name as keyof typeof LIMITES_NUCLEO]:null;}
export function filtrarCatalogoNucleo(names:readonly string[]):string[]{return names.filter(n=>NUCLEO_EJECUTABLE.has(n));}
export const DESCRIPCIONES_NUCLEO:Readonly<Record<string,string>>={
 get_application_summary:'Consulta acotada de estados y fechas registradas de aplicaciones. Para consumos reales y trabajo usa get_aplicaciones_ejecucion; los planes no sustituyen consumo ni costo completo.',
 get_aplicaciones_ejecucion:'Estado, fechas planeadas/reales y registros actuales de aplicaciones con identidad/período/lote validados; consumo y trabajo se calculan desde movimientos registrados, no desde dosis planeadas ni prosa. Comparación literal de fechas con cohorte confiable; no cumplimiento físico.',
 get_recorded_state_definition:'Metadatos sin lectura operativa: domain=application explica Calculada/En ejecución/Cerrada; domain=capability y state=nombre de herramienta excluida explica su límite y alternativa acotada. No afirma hechos de registros.',
 get_weekly_overview:'Alias acotado de jornales/costos históricos de la semana. Para otras partes del panorama propone sus herramientas específicas; no cubre por sí solo todos los dominios.',
 get_lot_info:'Descubrimiento de IDs y nombres de lotes; no acredita áreas, árboles, edades ni productividad.',
 get_hato_produccion:'Pesajes observados de leche: cuenta, volumen y media por pesaje; perfiles limitados y explícitos. No ventas ni producción quincenal física inferida.',
 get_financial_summary:'Gastos Confirmados e ingresos registrados en período explícito. No P&G, caja, prueba de cobro ni recepción física.',
 get_labor_summary:'Jornales y costos históricos registrados por lote, sin datos individuales por defecto. Requiere período explícito.',
 get_ganado_inventory:'Existencias registradas de ceba por jerarquía y etapa; densidad solo con área compatible, último peso con fecha, variación y pendientes globales claramente separados. No hato lechero ni dinero.',
 get_ganado_movimientos_detalle:'Historial registrado de ceba con eventos agrupados sin duplicar patas de traslado, ubicaciones y fechas; no prueba recepción física ni pago.',
 get_production_data:'Kilos y productividad agrícola registrada por año/cosecha/lote. Distingue media de productividades registradas y ratio con denominador acreditado.',
 get_produccion_calidad:'Kilos exportación/nacional registrados por año/cosecha/lote. Nulos no son cero; porcentajes solo con denominador compatible.',
 get_monitoring_data:'Observaciones de monitoreo por lote/plaga/período; incidencia ponderada y severidad con denominador observado. No informes de visita ni causalidad.',
 get_harvest_shipments:'Cosechas y despachos como poblaciones registradas separadas. Cliente solo cuando lo pide el usuario. No acredita entrega, recepción ni cobro.',
 get_purchase_history:'Compras, cantidades y costos históricos registrados por producto/período. Proveedor solo cuando se pide, sin facturas, documentos, notas ni datos personales adicionales.',
 get_inventory_movements:'Entradas, salidas y ajustes registrados por producto/período; separa unidades y no duplica movimientos. No incluye conciliación física ni verificaciones.',
 get_tareas:'Labores del tablero por estado, categoría, lote y fechas estimadas/reales registradas; sin responsables, salarios ni observaciones individuales. No equivale a jornales ejecutados.',
 get_radiation_context:'Radiación registrada: energía diaria, duración de sol, cobertura y comparación acotada; bandas configuradas, no diagnóstico causal ni garantía agronómica.',
 get_conductivity_data:'CE y pH registrados por lote/período, con nulos y cobertura explícitos. No infiere causa, fertilización necesaria ni ausencia física.',
};
export function promptPlanificadorNucleo(referenceDay:string,memory=false):string {
 return `Eres Esco, planificador de consultas de Escocia. Responde en español. Fecha de referencia del turno en ${CLOCK_ESCO}: ${referenceDay}.
${memory?'Esta solicitud trata únicamente memoria propia; usa sus herramientas y no consultes datos operativos.':'Solo puedes proponer las herramientas ofrecidas del núcleo fiable. No simules herramientas excluidas.'}
La pregunta actual y selectores explícitos del usuario definen el alcance. No inventes IDs, nombres, períodos ni valores faltantes. Los argumentos son propuestas: el servidor los valida contra catálogos y fechas.
CANTIDADES DE APLICACIONES (consumo frente a plan):
- El consumo registrado está en movimientos[].consumos[].cantidad_utilizada y su unidad; conserva producto, lote y fecha_movimiento. productos_planeados.dosis_por_caneca es una dosis planeada por caneca y cantidad_total_necesaria es una cantidad planeada: no sustituyen el consumo registrado. No sustituyas consumo registrado por dosis × numero_canecas. Si el usuario pide un cálculo teórico, muéstralo como plan/estimación con fórmula, sin llamarlo consumo realizado.
- Para un total consumido suma únicamente cantidades registradas del mismo producto y unidad, en los movimientos del rango consultado. No sumes unidades distintas; una conversión requiere equivalencia explícita y fórmula visible. Mantén separados el plan de la aplicación completa y el consumo en rango. No uses costos como cantidades.
- Una cantidad ausente o una fuente incompleta no implica cero. Responde las cantidades verificadas y señala qué subtotal o comparación no puede completarse; no rellenes faltantes con dosis o cantidades planeadas.
- Antes de responder, coteja cada cantidad de consumo con el resultado de la consulta actual. Si el historial contiene otra cifra, corrígela con la evidencia nueva; si el contexto perdió el detalle, vuelve a consultar. Una consulta completa acredita registros consultados, no prueba que todo el trabajo de campo se haya capturado.

Separa poblaciones, unidades, fechas reales y planeadas, año/cosecha y stock actual. No cambies un filtro para obtener filas. Para una pregunta mixta propone las operaciones correspondientes a sus partes.
Usa get_recorded_state_definition con domain=capability y state=nombre de operación excluida para comunicar su límite; no sustituyas su tarea con otra.
Los hechos y cálculos finales los construye el servidor desde fuentes verificadas. No aportes números, causalidad, cobros, recepción física ni éxito operativo desde tu memoria o prosa. No generes gráficos, HTML, URLs o búsquedas externas con datos.
Si falta un selector, no lo deduzcas de una respuesta anterior. Los resultados anteriores no certifican un dato actual. Usa solo el esquema de argumentos declarado.`;
}
