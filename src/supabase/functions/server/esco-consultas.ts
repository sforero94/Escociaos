import { hechosEjecucionAplicacion, estimacionDosisCanecas } from './escoAplicacionHechos.ts';
/** Consultas de evidencia de Esco (#311). Sin Deno/SDK; I/O inyectado y probado. */
export type FilaEsco = Record<string, unknown>;
export type ConsultaPagina = (tabla: string, query: string) => Promise<FilaEsco[]>;
export interface HerramientaConsulta {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}
const texto = (v: unknown): string => typeof v === 'string' ? v : '';
const numero = (v: unknown): number | null => v == null || v === '' ? null : Number.isFinite(Number(v)) ? Number(v) : null;
const suma = (filas: FilaEsco[], campo: string): number | null => filas.some(f => numero(f[campo]) == null) ? null : filas.reduce((s, f) => s + Number(f[campo]), 0);
const contiene = (v: unknown, filtro: unknown): boolean => !filtro || texto(v).toLocaleLowerCase().includes(texto(filtro).toLocaleLowerCase());
const identidad = (f?: FilaEsco) => f ? { id: f.id, numero: f.numero, nombre: f.nombre, estado: f.estado, sexo: f.sexo, fecha_nacimiento: f.fecha_nacimiento, fecha_nacimiento_confianza: f.fecha_nacimiento_confianza, numero_es_provisional: Number(f.numero) >= 800 && Number(f.numero) <= 999 } : null;
const mapa = (filas: FilaEsco[]) => new Map(filas.map(f => [texto(f.id), f]));
const animalCols = 'id,numero,nombre,sexo,etapa,estado,fecha_estado,fecha_nacimiento,fecha_nacimiento_confianza,madre_id,padre_id,padre_toro_id,raza';
const eventoCols = 'id,animal_id,tipo,fecha,fecha_confianza,cria_id,cria_destino,transaccion_ganado_id,fin_ingreso_id,fuente,datos';
const gastoCols = 'id,fecha,negocio_id,categoria_id,concepto_id,nombre,proveedor_id,valor,estado,compra_id,url_factura,observaciones';
const ingresoCols = 'id,fecha,negocio_id,categoria_id,nombre,comprador_id,valor,cantidad,precio_unitario,url_factura,observaciones';
const transCols = 'id,fecha,tipo,finca,cliente_proveedor,cantidad_cabezas,kilos_pagados,precio_kilo,valor_total,es_hato,hato_animal_id,peso_total_kg,destare_kg_cabeza';
const definiciones: Array<[string, string, boolean, Record<string, unknown>?, string[]?]> = [
  ['get_hato_partos', 'PARTOS OCURRIDOS en todo el hato por período: madre, cría vinculada o candidata por madre/fecha, nacimiento, destino y confianza. Usar SIEMPRE para partos nuevos/recientes o de un mes. No usar panorama reproductivo para negar partos.', true],
  ['get_hato_eventos', 'Historial de eventos del hato por período, incluyendo madres inactivas. Filtrar tipo (parto, servicio, secado, aborto, venta, muerte). No confundir con fechas probables futuras.', true, { tipo: { type: 'string' } }],
  ['get_hato_animales', 'Listado de animales con madre, padre y crías; filtrar nombre, chapeta, estado o fechas de nacimiento. Incluye inactivos salvo filtro explícito. Para tabla madre-cría de PARTOS usar get_hato_partos.', false, { estado: { type: 'string' } }],
  ['get_hato_tratamientos', 'Tratamientos prescritos y pasos programados/ejecutados/pendientes/vencidos. El rango filtra fecha de inicio del tratamiento, no fecha de cada paso; con rango y sin estado incluye todos los estados (activo, completado, cancelado); omitir rango para todos los tratamientos activos.', false, { estado: { type: 'string' } }],
  ['get_hato_chequeos', 'Historial de chequeos veterinarios y filas por animal/fecha, con datos normalizados, observaciones crudas e issues. No inferir evolución a partir del último chequeo solamente.', true],
  ['get_hato_salidas_finanzas', 'Ventas y salidas del hato enlazadas por IDs a ingresos/transacciones y estado del animal. Distingue venta de madre y venta de cría sin ficha; no contar macho_vendido como venta de la madre.', true],
  ['get_ganado_conciliacion', 'Transacciones de CEBA cruzadas con movimientos físicos confirmados/pendientes/descartados y existencias actuales. Cabezas compradas/vendidas vs movimientos vinculados; inventario actual no es saldo histórico.', true, { transaccion_id: { type: 'string' } }],
  ['get_ganado_movimientos_detalle', 'Historia completa de movimientos de ceba agrupados por grupo de traslado o transacción, con potreros/fincas; las dos patas del traslado no son dos hechos independientes.', true],
  ['get_cosecha_trazabilidad', 'Detalle de cosechas, responsables, canastillas, preselección y vínculos cosecha-despacho-cliente; kilos cosechados vs asignados, incluyendo despachos fuera del rango unidos por FK. Producción exportación/nacional es una fuente distinta.', true, { cosecha_id: { type: 'string' }, lote_name: { type: 'string' } }],
  ['get_produccion_calidad', 'Calidad registrada por lote/sublote/año/cosecha: exportación y nacional, porcentajes solo con desglose disponible. No convertir desglose nulo en cero.', false, { year: { type: 'number' }, cosecha_tipo: { type: 'string' }, lote_name: { type: 'string' } }],
  ['get_aplicaciones_ejecucion', 'Busca aplicaciones por nombre/estado y muestra historia real. Sin filtro explícito incluye todos los estados. Fechas reales por defecto; date_basis=planned solo si el usuario pide planeadas. Sin rango no inventa un período. Historia de intervenciones por lote y aplicación: fechas, productos/dosis planeados, consumos y trabajo real, cobertura planeada/registrada. No comparar dosis por caneca con cantidades consumidas sin conversión.', false, { application_id: { type: 'string' }, application_name: { type: 'string', description: 'Nombre parcial, normaliza tildes y espacios' }, estado: { type: 'string', enum: ['Calculada', 'En ejecución', 'Cerrada'], description: 'Filtro explícito de estado; omitir al descubrir estado por nombre/ID. Calculada se muestra Planificada en la UI'  }, alcance: { type: 'string', enum: ['actual', 'periodo'], description: 'actual: búsqueda actual; periodo requiere ambas fechas' }, date_basis: { type: 'string', enum: ['actual', 'planned'], default: 'actual' }, lote_name: { type: 'string' } }],
  ['get_recomendaciones_ejecucion', 'Recomendaciones de visita frente a aplicaciones: muestra recomendaciones y candidatas por insumo/fecha para revisión. No hay FK recomendación-aplicación; ninguna coincidencia demuestra cumplimiento.', true],
  ['get_carencia_cosecha', 'Carencia por lote a fecha de cosecha consultada, usando consumos reales y períodos del catálogo; faltantes dan no verificable, nunca autorización automática para cosechar.', false, { fecha_cosecha: { type: 'string', description: 'YYYY-MM-DD' }, lote_name: { type: 'string' } }, ['fecha_cosecha']],
  ['get_monitoreo_cobertura', 'Cobertura registrada de rondas por lote/sublote/plaga frente al catálogo actual. Sin registro no significa sin plaga; catálogo actual no demuestra alcance esperado histórico.', true, { ronda_id: { type: 'string' }, lote_name: { type: 'string' } }],
  ['get_inventario_conciliacion', 'Rondas de inventario, alcance congelado, conteos físicos, diferencias y desenlaces/explicaciones/capturas vinculadas. No modifica saldos ni publica valoraciones restringidas.', true, { ronda_id: { type: 'string' } }],
  ['get_producto_consumo', 'Consumos reales de un producto por aplicación/lote/fecha y movimientos de inventario con destino. Fuentes distintas: no sumar ambas como doble consumo.', true, { product_name: { type: 'string' } }],
  ['get_compra_detalle', 'Compra de insumo, soporte, gasto enlazado por compra_id y entradas candidatas por producto/factura. No existe compra_id en movimientos: coincidencia no prueba recepción.', true, { compra_id: { type: 'string' }, product_name: { type: 'string' } }],
  ['get_finanzas_detalle', 'Detalle de gastos, ingresos y transacciones; pendientes de confirmación y soportes ausentes. No confundir falta de archivo con factura inexistente. No calcular utilidad con esta herramienta.', true, { tipo: { type: 'string', enum: ['gastos', 'ingresos', 'ganado'] }, movimiento_id: { type: 'string' }, negocio_name: { type: 'string' }, solo_pendientes: { type: 'boolean' }, solo_sin_soporte: { type: 'boolean' } }],
  ['get_presupuesto_desviaciones', 'Explica desviaciones de presupuesto por concepto y movimientos Confirmados: presupuesto del período proporcional a trimestres como tablero existente. No sustituye P&G.', false, { anio: { type: 'number' }, quarters: { type: 'string' }, negocio_name: { type: 'string' }, categoria_name: { type: 'string' } }],
  ['get_tarea_ejecucion', 'Tareas con registros de trabajo y jornadas estimadas vs reales. Rango por fecha estimada de inicio, ejecución completa de las tareas seleccionadas aunque ocurra fuera del rango.', true, { tarea_id: { type: 'string' }, lote_name: { type: 'string' } }],
  ['get_clima_cobertura', 'Calidad y cobertura del historial diario de clima: días ausentes, lecturas, confianza de lluvia y huecos. No sumar lecturas de estaciones distintas como un día completo.', true],
  ['get_capturas_estado', 'Estado de capturas fotográficas, chequeos y previsualizaciones de inventario: desenlace e issues registrados. No existe registro persistente universal de toda importación rechazada.', true],
];
export const HERRAMIENTAS_CONSULTA: HerramientaConsulta[] = definiciones.map(([name, description, rango, extras = {}, required = []]) => ({
  name, description,
  parameters: { type: 'object', properties: {
    date_from: { type: 'string', description: 'Fecha inicial YYYY-MM-DD; en animales filtra nacimiento' },
    date_to: { type: 'string', description: 'Fecha final YYYY-MM-DD inclusiva' },
    ...(name === 'get_aplicaciones_ejecucion' ? {} : {
      nombre: { type: 'string', description: 'Nombre parcial de animal, cuando aplica' },
      numero: { type: 'number', description: 'Chapeta, cuando aplica; identidad definitiva es UUID' },
    }),
    detalle_offset: { type: 'integer', minimum: 0, description: 'Siguiente página de detalle; inicio por defecto 0, página de 100 hechos' },
    ...extras,
  }, required: [...(rango ? ['date_from', 'date_to'] : []), ...required] },
}));
export const ETIQUETAS_CONSULTA: Record<string, string> = Object.fromEntries([
  ['get_hato_partos', 'Partos y crías por período'], ['get_hato_eventos', 'Historia de eventos del hato'],
  ['get_hato_animales', 'Animales y genealogía'], ['get_hato_tratamientos', 'Tratamientos y pasos'],
  ['get_hato_chequeos', 'Historia de chequeos'], ['get_hato_salidas_finanzas', 'Salidas y ventas del hato'],
  ['get_ganado_conciliacion', 'Conciliación de ceba y finanzas'], ['get_ganado_movimientos_detalle', 'Historia de movimientos de ceba'],
  ['get_cosecha_trazabilidad', 'Detalle y trazabilidad de cosechas'], ['get_produccion_calidad', 'Calidad y destino de producción'],
  ['get_aplicaciones_ejecucion', 'Intervenciones planeadas y ejecutadas'], ['get_recomendaciones_ejecucion', 'Recomendaciones y aplicaciones candidatas'],
  ['get_carencia_cosecha', 'Carencia registrada antes de cosecha'], ['get_monitoreo_cobertura', 'Cobertura de rondas fitosanitarias'],
  ['get_inventario_conciliacion', 'Rondas y diferencias físicas'], ['get_producto_consumo', 'Consumo y destinos de productos'],
  ['get_compra_detalle', 'Compras y recepción por verificar'], ['get_finanzas_detalle', 'Movimientos y soportes financieros'],
  ['get_presupuesto_desviaciones', 'Desviaciones y gastos del presupuesto'], ['get_tarea_ejecucion', 'Ejecución frente a jornales estimados'],
  ['get_clima_cobertura', 'Cobertura de historia climática'], ['get_capturas_estado', 'Capturas y revisiones registradas'],
]);
export function fechaBogota(ahora = new Date()): string {
  const partes = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(ahora);
  const p = (tipo: string) => partes.find(x => x.type === tipo)!.value;
  return `${p('year')}-${p('month')}-${p('day')}`;
}
export function validarFecha(fecha: unknown): string {
  const s = texto(fecha);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) throw new Error('Fecha requerida en formato YYYY-MM-DD.');
  const [y, m, d] = s.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d));
  if (t.getUTCFullYear() !== y || t.getUTCMonth() !== m - 1 || t.getUTCDate() !== d) throw new Error('Fecha de calendario inválida.');
  return s;
}
function sumarDias(fecha: string, dias: number): string {
  const [y, m, d] = fecha.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + dias));
  return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, '0')}-${String(t.getUTCDate()).padStart(2, '0')}`;
}
/** El rango corto del servidor se descubre por Content-Range en el adaptador;
 * aquí usamos páginas de 200 (menor que max_rows=1000 verificado en producción).
 * Un tope nunca devuelve un total aparentemente completo. */
export async function leerCompleto(q: ConsultaPagina, tabla: string, query: string): Promise<FilaEsco[]> {
  const filas: FilaEsco[] = [];
  for (let offset = 0; offset < 20000; offset += 200) {
    const pagina = await q(tabla, `${query}&limit=200&offset=${offset}`);
    filas.push(...pagina);
    if (pagina.length < 200) return filas;
  }
  throw new Error(`Consulta incompleta en ${tabla}: supera 20000 filas. Reduce el rango.`);
}
export function resumirContexto(resultado: string, max = 24000): string {
  if (resultado.length <= max) return resultado;
  try {
    const parsed: unknown = JSON.parse(resultado);
    const r = parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as FilaEsco : {};
    const legacy = r._evidencia !== null && typeof r._evidencia === 'object' && !Array.isArray(r._evidencia) ? r._evidencia as FilaEsco : null;
    return JSON.stringify({
      ...(Object.prototype.hasOwnProperty.call(r, 'error') ? { error: 'La consulta anterior falló; vuelve a consultar.' } : {}),
      _evidencia: legacy ? { ...legacy, consulta_completa: false, detalle_completo: false } : null,
      resumen: r.resumen ?? null, contexto_recortado: true, instruccion: 'Vuelve a consultar la herramienta. Este contexto no contiene el detalle completo.' });
  } catch {
    return JSON.stringify({ contexto_recortado: true, instruccion: 'Resultado anterior no preservado; vuelve a consultar antes de concluir.' });
  }
}
export function normalizarTextoAplicacion(value: unknown): string {
  return texto(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim().replace(/\s+/g, ' ');
}
export function baseFechaAplicacion(args: FilaEsco): 'actual' | 'planned' {
  const base = args.date_basis ?? 'actual';
  if (base !== 'actual' && base !== 'planned') throw new Error('date_basis debe ser actual o planned.');
  return base;
}
export function requiereConsultaAplicaciones(pregunta: string): boolean {
  const q = normalizarTextoAplicacion(pregunta);
  // Exclude common non-farm meanings without routing every use of "application".
  if (!/\b(?:fumigaci(?:on|ones)|fertilizaci(?:on|ones))\b/.test(q) && /\b(?:aplicacion(?:es)? (?:movil|web|de empleo|para editar|de software))\b/.test(q)) return false;
  const farm = /\b(?:aplicaci(?:on|ones)|fumigaci(?:on|ones)|fertilizaci(?:on|ones))\b/.test(q);
  return farm && (/\b(?:como va|avance|progreso|estado|actual|en ejecucion|en curso|activas?|hay|existe(?:n)?|tenemos)\b/.test(q) || pideFechasPlaneadas(pregunta));
}
export function pideFechasPlaneadas(pregunta: string): boolean {
  const clauses = normalizarTextoAplicacion(pregunta).split(/[.;,!?]+|\b(?:pero|sino|en cambio)\b|\by (?=no\b)/);
  let requested: 'actual' | 'planned' | null = null;
  for (const part of clauses) {
    const clause = part.replace(/^[¿¡\s]+/, '').trim().replace(/^por favor\s+/, '')
      .replace(/^(?:consulta de )?solo lectura:\s*[¿¡]?\s*/, '');
    const negated = /^(?:no|nunca|sin|ignora|ignorar|excluye|excluir)\b/.test(clause);
    if (negated) {
      // Revocation need not authorize a new basis or guess verb conjugation.
      // A conservative explicit denial removes prior consent in this clause.
      // Without a named basis, do not guess the referent: withdraw planned consent.
      if ((requested === 'planned' && /\b(?:planeadas?|planificadas?)\b/.test(clause)) ||
          (requested === 'actual' && /\b(?:reales?|de ejecucion)\b/.test(clause)) ||
          (requested === 'planned' && !/\b(?:planeadas?|planificadas?|reales?|de ejecucion)\b/.test(clause))) requested = null;
      continue;
    }
    const body = clause;
    // Only a direct date-basis request is actionable. "Dame el estado de la
    // aplicación cuya fecha planeada..." describes a record, not a date basis.
    const direct = body.match(/^(?:por favor )?(?:us[ae]s?|usar|utiliza(?:r)?|consulta(?:r)?|prefiero|quiero|necesito|muestra(?:me)?|dame|busca(?:r)?|filtra(?:r)?|ignora(?:r)?|exclu(?:ye|ir))\s+(?:(?:por|segun|con) )?(?:(?:la|las) )?((?:fechas?(?: de (?:inicio|fin))? )?(?:planeadas?|planificadas?|reales?|de ejecucion)\b.*)$/);
    const question = body.match(/^(?:cual(?:es)?|que) (?:es |son )?(?:la |las )?fechas?(?: de (?:inicio|fin))? ((?:planeadas?|planificadas?|reales?|de ejecucion)\b.*)$/);
    const collection = body.match(/^(?:(?:dame|muestra(?:me)?|consulta|busca|lista) (?:el estado de |el resumen de |las )?)?(?:aplicaciones|fumigaciones|fertilizaciones) (?:por|segun|con base en) (?:la |las )?fechas? ((?:planeadas?|planificadas?|reales?|de ejecucion)\b.*)$/);
    // A direct plural planned-application request is explicit planned intent;
    // a relative clause merely describing one record is not.
    const plannedCollection = body.match(/^(?:dame|muestra(?:me)?|consulta|busca|lista) (?:las )?(?:aplicaciones|fumigaciones|fertilizaciones) ((?:planeadas?|planificadas?)\b.*)$/);
    // Direct interrogative selection, with an optional explicit temporal qualifier.
    // Relative descriptions ("cuya fecha planeada...") do not grant consent.
    const plannedQuestion = body.match(/^(?:que|cual(?:es)?) (?:es |son )?(?:la |las )?(?:aplicacion(?:es)?|fumigacion(?:es)?|fertilizacion(?:es)?) (?:(?:que )?(?:esta(?:n)?|hay|tenemos) )?((?:planeadas?|planificadas?)(?:$| (?:para\b|durante\b|entre\b|desde\b|hasta\b|en (?!ejecucion\b|curso\b)).*))$/);
    const basis = direct?.[1] ?? question?.[1] ?? collection?.[1] ?? plannedCollection?.[1] ?? plannedQuestion?.[1];
    if (!basis) continue;
    if (/\b(?:sin(?: usar| utilizar)?|no (?:uses|usar|utilices|utilizar)) (?:las )?fechas? (?:planeadas?|planificadas?)\b/.test(body)) { requested = null; continue; }
    const planned = /\b(?:planeadas?|planificadas?)\b/.test(basis);
    const actual = /\b(?:reales?|de ejecucion)\b/.test(basis);
    // A mixed clause is ambiguous: keep actual default. A later explicit
    // positive clause can resolve a preceding negation or contrast.
    requested = planned && !actual ? 'planned' : 'actual';
  }
  return requested === 'planned';
}

export interface SolicitudAplicacion { pregunta: string; anterior?: string }
type SeleccionAplicacion = { estado:'verificada'; version:'aplicacion_selector_v1'; aplicacion_ids:string[]|null; lote_ids:string[]|null; referencia:'actual'|'usuario_anterior' } | { estado:'aclarar'; mensaje:string };
const normalizarSelector = (v:unknown) => normalizarTextoAplicacion(v).replace(/[«»"'()[\],:;!?¿¡—–]/g,' ').replace(/\s+/g,' ').trim();
const palabrasNombre = (v:unknown) => normalizarSelector(v).split(' ').filter(w=>!['el','la','los','las','de','del','contra','control','aplicacion','fumigacion','fertilizacion'].includes(w)).join(' ');
/** Literal application/lot selectors against the already-read fresh catalogs. No model identity authority. */
export function resolverSeleccionAplicacion(s:SolicitudAplicacion, apps:FilaEsco[], lotes:FilaEsco[], plural:boolean):SeleccionAplicacion {
  const fail=(message:string):SeleccionAplicacion=>({estado:'aclarar',mensaje:message});
  const q=normalizarSelector(s.pregunta);
  const extract=(question:string,lot=false) => {
    const found=question.match(lot?/\blote\s+(.+)$/ : /\b(?:aplicacion|fumigacion|fertilizacion)\b\s*(.*)$/);
    if(!found)return '';
    return found[1].replace(/^(?:(?:llamada|denominada|nombre|id|contra|para|de)\s+)+/,'')
      .split(/\b(?:(?:en (?:el |la |ese |este |anterior )?)?lote|del? (?=\d)|desde|entre|(?:en|para|durante|de) (?:el mes de )?(?:enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre)|segun|sin|con (?:canecas|dosis)|hoy|ayer|anteayer|hace dos dias|este mes|mes pasado|esta semana|semana pasada|y (?:el |los |la |las )?(?:estado|fechas|consumo|jornales|mano de obra|costo laboral))\b/)[0].trim();
  };
  let reference:'actual'|'usuario_anterior'='actual', appSelector=extract(q), lotSelector=extract(q,true);
  if(!appSelector && /\b(?:esa|esta|anterior) aplicacion\b|\baplicacion anterior\b/.test(q)) {
    const previous=normalizarSelector(s.anterior ?? '');
    if(!/\b(?:aplicacion|fumigacion|fertilizacion)\b/.test(previous) || /\b(?:esa|esta|anterior) aplicacion\b/.test(previous)) return fail('Precisa el nombre o ID de la aplicación; la referencia anterior no es inequívoca.');
    appSelector=extract(previous); reference='usuario_anterior';
    if(!appSelector)return fail('Precisa el nombre o ID de la aplicación; no uso identidades del modelo o del texto de una respuesta anterior.');
    if(!lotSelector && /\b(?:ese|este|anterior) lote\b/.test(q))lotSelector=extract(previous,true);
  }

  const identityQuestion=reference==='usuario_anterior'?normalizarSelector(s.anterior??''):q;
  const idsMentioned=apps.filter(a=>texto(a.id) && (' '+identityQuestion+' ').includes(' '+normalizarSelector(a.id)+' '));
  let candidates=apps;
  if(!plural) {
    // An explicit user ID and name must agree. Model IDs are deliberately absent.
    if(idsMentioned.length>1)return fail('Hay varios IDs de aplicación en la petición; precisa uno.');
    const selectorWithoutId=idsMentioned.length===1 ? appSelector.replace(new RegExp(normalizarSelector(idsMentioned[0].id).replace(/[.*+?^${}()|[\]\\]/g,'\\$&'),'g'),'').replace(/\bid\b/g,'').trim():appSelector;
    const selector=palabrasNombre(selectorWithoutId);
    if(selector)candidates=apps.filter(a=>(' '+palabrasNombre(a.nombre_aplicacion)+' ').includes(' '+selector+' '));
    if(idsMentioned.length===1) {
      if(selector && !candidates.some(a=>a.id===idsMentioned[0].id))return fail('El nombre y el ID indicados por el usuario no corresponden a la misma aplicación.');
      candidates=idsMentioned;
    }
    if(!candidates.length)return fail('No pude vincular el nombre indicado a una aplicación del catálogo consultado. Precisa el nombre o ID; esto no prueba ausencia de actividad.');
    if(candidates.length!==1)return fail('Precisa cuál aplicación: '+candidates.slice(0,5).map(a=>literalMd(a.nombre_aplicacion)+' ('+literalMd(a.id)+')').join('; '));
  }
  if(!lotSelector && /\b(?:ese|este|anterior) lote\b/.test(q)) {
    const previous=normalizarSelector(s.anterior??''), previousApp=extract(previous);
    const matches=apps.filter(a=>normalizarSelector(a.id)===previousApp || (' '+palabrasNombre(a.nombre_aplicacion)+' ').includes(' '+palabrasNombre(previousApp)+' '));
    if(plural || candidates.length!==1 || !previousApp || matches.length!==1 || matches[0].id!==candidates[0].id)return fail('Precisa el lote; la referencia anterior no es inequívoca para esta aplicación.');
    lotSelector=extract(previous,true);if(!lotSelector)return fail('Precisa el nombre o ID del lote anterior.');
  }
  let selectedLots:FilaEsco[]|null=null;
  if(lotSelector) {
    const name=palabrasNombre(lotSelector);
    const exactIds=lotes.filter(l=>normalizarSelector(l.id)===normalizarSelector(lotSelector));
    selectedLots=exactIds.length?exactIds:lotes.filter(l=>(' '+palabrasNombre(l.nombre)+' ').includes(' '+name+' '));
    if(selectedLots.length!==1)return fail('Precisa un lote inequívoco del catálogo consultado; no sustituí el lote solicitado por el del modelo.');
  } else if(/\blote\b/.test(q))return fail('Precisa el nombre o ID del lote solicitado.');
  return {estado:'verificada',version:'aplicacion_selector_v1',aplicacion_ids:plural?null:candidates.map(a=>texto(a.id)),lote_ids:selectedLots?.map(l=>texto(l.id))??null,referencia:reference};
}

function normalizarPreguntaAplicacion(value:string):string {
  return normalizarTextoAplicacion(value)
    .replace(/^((?:(?:consulta de )?solo lectura:\s*)?[¿¡]?)y\s+(?=(?:cuantos?|cuantas?|como|cual(?:es)?|que)\b)/, '$1')
    .replace(/\b(aplicacion|fumigacion|fertilizacion):\s*/g,'$1 ')
    .replace(/,\s*(?=(?:en (?:el )?lote|del? \d|desde|entre|sin costos?|la aplicacion|el estado|las fechas|los jornales)\b)/g,' ');
}
export type PlanRespuestaAplicacion = { tipo: 'fuera'; motivo: string } | {
  tipo: 'aplicacion'; plural: boolean; base: 'actual' | 'planned';
  rango: { desde: string; hasta: string } | null; loteSolicitado: boolean;
  estadoFiltro: 'En ejecución' | 'Cerrada' | null;
  estado: boolean; fechas: boolean; consumos: boolean; trabajo: boolean; ocultarCostos: boolean; estimacion: boolean; planes: boolean;
};
/** Closed application operations, not a filter over arbitrary generated prose. */
export function planRespuestaAplicacion(pregunta: string, hoy = fechaBogota()): PlanRespuestaAplicacion {
  const q = normalizarPreguntaAplicacion(pregunta);
  const fuera = (motivo: string): PlanRespuestaAplicacion => ({ tipo: 'fuera', motivo });
  const operation=q.replace(/^(?:consulta de )?solo lectura:\s*/, '').replace(/^[¿¡]/, '').replace(/[?!.]+$/, '');
  if (!/\b(?:aplicacion(?:es)?|fumigacion(?:es)?|fertilizacion(?:es)?)\b/.test(q) ||
    (/\baplicacion(?:es)? (?:(?:de|para) )?(?:movil|web|empleo|editar|software|visa|visado|contrato)\b/.test(q) && !/\b(?:fumigacion|fertilizacion)\b/.test(q))) return fuera('otro_dominio');
  // Domain must be established before application-specific clarification rules.
  if (/[;:,.!?]/.test(operation)) return fuera('clausulas_adicionales_no_cubiertas');
  if (/\b(?:clima|pronostico|lluvia|inventario|stock|leche|partos?|ventas?|precio|carencia|cosecha|compatible)\b/.test(q)) return fuera('consulta_mixta');
  if (/\b(?:por que|causa|eficacia|recomienda|debo|puedo|conviene|quien|quienes|guarda|recuerda|porcentaje|cobertura)\b|%/.test(q)) return fuera('operacion_no_soportada');
  if (/\by (?:que|quien|quienes|como|por que|cual|cuales|cuando|donde)\b/.test(q)) return fuera('subpregunta_no_cubierta');
  if (/\b(?:rango|periodo) (?:solicitado|anterior|previo)|\b(?:mismo|ese) (?:rango|periodo)\b/.test(q)) return fuera('referencia_temporal_no_resuelta');
  // A second requested operation must be one of the explicitly rendered fields.
  if (/\by (?!\d{4}-\d{2}-\d{2}\b|\d{1,2}\/\d{1,2}\/\d{4}\b|(?:(?:el|los|la|las) )?(?:estado|fechas?|consumo|jornales?|mano de obra|costo laboral|canecas? (?:planeadas?|planificadas?))\b)/.test(q)) return fuera('subpregunta_no_cubierta');
  const plural = /\b(?:aplicaciones|fumigaciones|fertilizaciones)\b/.test(q);
  const listadoReal = /^(?:que|cuales) (?:son )?(?:las )?aplicaciones (?:que )?(?:hicimos|realizamos|ejecutamos|se hicieron|se realizaron|se ejecutaron|tuvieron ejecucion)\b/.test(operation);
  const tail = /\b(?:aplicaciones|fumigaciones|fertilizaciones)\b(.*)$/.exec(q)?.[1].trim() ?? '';
  const pluralTail = listadoReal ? tail.replace(/^(?:que )?(?:hicimos|realizamos|ejecutamos|se hicieron|se realizaron|se ejecutaron|tuvieron ejecucion)\b\s*/, '') : tail;
  if (plural && !listadoReal && pluralTail && !/^(?:[?.,!]|(?:(?:estan|hay|tenemos) )?(?:planeadas?|planificadas?|activas?|cerradas?)\b|en\b|(?:de|para|durante) (?:el mes de )?(?:enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre)\b|(?:del?|desde|entre) \d{4}-|(?:hoy|ayer|esta semana|este mes|semana pasada|mes pasado)\b|sin\b|y\b)/.test(pluralTail)) return fuera('subconjunto_plural_no_verificado');
  if (/\b(?:compara|comparacion|retraso|antes o despues|frente a|previstas?|vamos a ejecutar)\b/.test(q)) return fuera('comparacion_o_plan_no_soportado');
  const estimacion = /\b(?:estima|estimacion|teoric[oa]|hipotetic[oa])\b/.test(q);
  if (estimacion && (!/\bdosis\b/.test(q) || !/\bcanecas? (?:planeadas?|planificadas?)\b/.test(q) || /\b\d+(?:[.,]\d+)? canecas?\b/.test(q))) return fuera('parametros_teoricos_no_verificados');
  if (!estimacion && /\b(?:dosis|canecas?|bultos?|litros de mezcla)\b/.test(q)) return fuera('magnitud_no_soportada');
  const trabajo = /\b(?:jornales?|mano de obra|costo laboral)\b/.test(q);
  const ocultarCostos = /\bsin costos?\b|\bno (?:muestres|incluyas) (?:los )?costos?\b/.test(q);
  if (/\b(?:costo|costos|costo total|gasto|gastado)\b/.test(q) && !trabajo && !ocultarCostos) return fuera('costo_total_no_es_costo_laboral');
  const progreso = /\b(?:como va(?:n)?|avance|progreso)\b/.test(q);
  const estado = /\bestado\b/.test(q) || progreso || listadoReal;
  const plannedBasis = pideFechasPlaneadas(pregunta);
  const planes = plannedBasis && !estimacion;
  const sinConsumo = /\bsin (?:el )?consumo\b|\bno (?:muestres|incluyas|quiero) (?:el )?consumo\b/.test(q);
  const consumos = !sinConsumo && (progreso || /\b(?:consum\w*|utilizad\w*|usad[oa]s?)\b/.test(q)) && (!estimacion || /\b(?:real|reales|registrado|registrados)\b/.test(q));
  const fechas = /\bfechas?\b/.test(q) || progreso || planes || listadoReal;
  if (!estado && !planes && !consumos && !trabajo && !estimacion && !fechas) return fuera('pregunta_no_cubierta');
  const months = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
  const yearSuffix = listadoReal ? '(?:(?: de)? (\\d{4}))?' : '(?: de)? (\\d{4})';
  const namedPattern = new RegExp('\\b(?:' + months.join('|') + ')' + yearSuffix + '\\b','g');
  const periods = [...q.matchAll(namedPattern)].length + [...q.matchAll(/\b(?:hoy|ayer|anteayer|hace (?:dos|2) dias|este mes|mes pasado|esta semana|semana pasada)\b/g)].length;
  const isoDates=q.match(/\d{4}-\d{2}-\d{2}/g)?.length ?? 0;
  if (periods>1 || (isoDates>0 && (isoDates!==2 || periods>0))) return fuera('multiples_periodos_no_soportados');
  const named = new RegExp('\\b(?:para|en|durante|de) (?:el mes de )?(' + months.join('|') + ')' + yearSuffix + '\\b').exec(q);
  let rango: { desde: string; hasta: string } | null = null;
  const calendar = (y: number, m: number, d: number) => `${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
  const numeric = /\b(?:del?|desde|entre) (\d{1,2})\/(\d{1,2})\/(\d{4}) (?:al?|hasta|y) (\d{1,2})\/(\d{1,2})\/(\d{4})\b/.exec(q);
  const withinMonth = new RegExp('\\bdel? (\\d{1,2}) al? (\\d{1,2}) de ('+months.join('|')+')(?: de)? (\\d{4})\\b').exec(q);
  const iso = /\b(?:del?|desde|entre) (\d{4}-\d{2}-\d{2}) (?:al?|hasta|y) (\d{4}-\d{2}-\d{2})\b/.exec(q);
  if(numeric && (periods>0 || (q.match(/\d{1,2}\/\d{1,2}\/\d{4}/g)?.length??0)!==2))return fuera('multiples_periodos_no_soportados');
  if(numeric || withinMonth) {
    const from=numeric?calendar(Number(numeric[3]),Number(numeric[2]),Number(numeric[1])):calendar(Number(withinMonth![4]),months.indexOf(withinMonth![3])+1,Number(withinMonth![1]));
    const to=numeric?calendar(Number(numeric[6]),Number(numeric[5]),Number(numeric[4])):calendar(Number(withinMonth![4]),months.indexOf(withinMonth![3])+1,Number(withinMonth![2]));
    try {rango={desde:validarFecha(from),hasta:validarFecha(to)};}catch{return fuera('periodo_invalido');}
  } else if (named) {
    const month = months.indexOf(named[1]) + 1;
    // Omitted year is supported only for an execution-list request in the
    // current Bogota year, never by silently guessing a preceding year.
    if (!named[2] && (!listadoReal || month > Number(hoy.slice(5,7)))) return fuera('periodo_requiere_ano');
    const year = Number(named[2] ?? hoy.slice(0,4));
    if (year < 100) return fuera('periodo_no_soportado');
    rango = { desde: calendar(year,month,1), hasta: calendar(year,month,new Date(Date.UTC(year,month,0)).getUTCDate()) };
  } else {
    if (!iso && isoDates>0) return fuera('periodo_no_soportado');
    if (iso) { try { rango = { desde: validarFecha(iso[1]), hasta: validarFecha(iso[2]) }; } catch { return fuera('periodo_invalido'); } }
    else if (/\bhoy\b/.test(q)) rango = { desde: hoy, hasta: hoy };
    else if (/\b(?:anteayer|hace (?:dos|2) dias)\b/.test(q)) rango = { desde: sumarDias(hoy,-2), hasta: sumarDias(hoy,-2) };
    else if (/\bayer\b/.test(q)) rango = { desde: sumarDias(hoy,-1), hasta: sumarDias(hoy,-1) };
    else if (/\b(?:este mes|mes pasado)\b/.test(q)) {
      let [year,month] = hoy.split('-').map(Number);
      if (/\bmes pasado\b/.test(q) && --month === 0) { year--; month = 12; }
      rango = { desde: calendar(year,month,1), hasta: calendar(year,month,new Date(Date.UTC(year,month,0)).getUTCDate()) };
    } else if (/\b(?:esta semana|semana pasada)\b/.test(q)) {
      const [y,m,d] = hoy.split('-').map(Number), day = new Date(Date.UTC(y,m-1,d)).getUTCDay();
      const monday = sumarDias(hoy,-((day+6)%7)-(/semana pasada/.test(q)?7:0));
      rango = { desde: monday, hasta: sumarDias(monday,6) };
    } else if (/\b(?:mes(?:es)?|semanas?|trimestre|anos?|ultimos?|proximos?|hace|dias?)\b|\d{1,2}\/\d{1,2}\/\d{4}|\b(?:en|para|del?|entre|desde) \d/.test(q) || months.some(m=>new RegExp('\\b'+(plural?'':'(?:en|para|durante|de) (?:el mes de )?')+m+'\\b').test(q))) return fuera('periodo_no_soportado');
  }
  if (rango && rango.desde > rango.hasta) return fuera('periodo_invalido');
  // Require the entire cohort qualifier to be one of the existing parsed
  // periods; a matching prefix cannot hide a malformed year or extra filter.
  const periodoListado = pluralTail.replace(/[?!.]+$/, '');
  const relativo = /^(?:hoy|ayer|anteayer|hace (?:dos|2) dias|este mes|mes pasado|esta semana|semana pasada)$/.exec(periodoListado)?.[0];
  if (listadoReal && (!rango || ![named?.[0],numeric?.[0],withinMonth?.[0],iso?.[0],relativo].includes(periodoListado))) return fuera('periodo_no_soportado');
  return { tipo:'aplicacion', plural, base:plannedBasis?'planned':'actual', rango,
    estadoFiltro:/\b(?:en ejecucion|en curso|activas?)\b/.test(q)?'En ejecución':/\bcerradas?\b/.test(q)?'Cerrada':null,
    loteSolicitado:/\blotes?\b/.test(q), estado, fechas, consumos, trabajo:trabajo || progreso,
    ocultarCostos, estimacion, planes };
}
export function aclaracionPlanAplicacion(plan:PlanRespuestaAplicacion):string|null {
  return plan.tipo==='fuera' && /^(?:periodo_|multiples_periodos_|referencia_temporal_|comparacion_o_plan_|clausulas_adicionales_|subconjunto_plural_|subpregunta_)/.test(plan.motivo)
    ? 'Necesito precisar el alcance de aplicaciones: indica un período y nombre/lote inequívocos. Puedo mostrar fechas planeadas y reales registradas; esta respuesta no calcula comparaciones, retrasos ni asume un rango más amplio.' : null;
}
export function argumentosRespuestaAplicacion(plan: PlanRespuestaAplicacion, args: FilaEsco): FilaEsco {
  if (plan.tipo !== 'aplicacion') return args;
  const bound = { ...args, date_basis:plan.base, alcance:plan.rango?'periodo':'actual' } as FilaEsco;
  if (plan.rango) { bound.date_from = plan.rango.desde; bound.date_to = plan.rango.hasta; }
  else { delete bound.date_from; delete bound.date_to; }
  if (plan.plural) { delete bound.application_id; delete bound.application_name; delete bound.estado; }
  if (plan.estadoFiltro) bound.estado = plan.estadoFiltro; else delete bound.estado;
  if (!plan.loteSolicitado) delete bound.lote_name;
  return bound;
}
const literalMd = (value: unknown) => texto(value).replace(/[\\`*_{}[\]()#+.!|<>]/g, '\\$&').replace(/[\r\n]/g, ' ');
interface AplicacionParaRespuesta {
  id: string; nombre_aplicacion: string; estado: unknown; tarea_id?: unknown;
  fecha_inicio_planeada?: unknown; fecha_fin_planeada?: unknown; fecha_inicio_ejecucion?: unknown; fecha_fin_ejecucion?: unknown;
  fechas_inconsistentes?: unknown; movimientos: FilaEsco[]; registros_trabajo: FilaEsco[];
  hechos_ejecucion: ReturnType<typeof hechosEjecucionAplicacion>; plan_por_lote?: unknown; productos_planeados?: unknown;
}
interface EvidenciaParaRespuesta {
  error?: unknown; contexto_recortado?: unknown; seleccion?: SeleccionAplicacion;
  _evidencia: { herramienta: unknown; consulta_completa: unknown; detalle_completo: unknown; total_hechos: unknown; rango: {desde:string|null;hasta:string|null} };
  resumen?: {date_basis?:unknown;fechas_reales_ausentes?:number}; detalle: AplicacionParaRespuesta[];
}
/** Only a fresh execution result may reach this function from the loop. */
export function respuestaDeterministaAplicacion(plan: PlanRespuestaAplicacion, resultado: string, args: FilaEsco): { tipo:'fuera'; motivo:string } | { tipo:'texto'; texto:string } {
  if (plan.tipo !== 'aplicacion') return plan;
  const failure = (why: string) => ({ tipo:'texto' as const, texto:'No pude verificar '+why+'. No puedo inventar cantidades ni afirmar ausencia de actividad.' });
  try {
    const r = JSON.parse(resultado) as EvidenciaParaRespuesta;
    if(r?.seleccion?.estado==='aclarar' && r.error==='seleccion_no_resuelta')return {tipo:'texto',texto:r.seleccion.mensaje};
    if (!r || Array.isArray(r) || Object.prototype.hasOwnProperty.call(r,'error') || r.contexto_recortado === true ||
      r._evidencia?.herramienta !== 'get_aplicaciones_ejecucion' || r._evidencia?.consulta_completa !== true || !Array.isArray(r.detalle) ||
      typeof r._evidencia.detalle_completo !== 'boolean' || !Number.isSafeInteger(r._evidencia.total_hechos) || Number(r._evidencia.total_hechos)<r.detalle.length) return failure('la consulta de aplicaciones');
    if(r.seleccion?.estado!=='verificada' || r.seleccion.version!=='aplicacion_selector_v1')return failure('la selección de aplicación y lote');
    if(r.seleccion.aplicacion_ids && r.detalle.some(a=>!r.seleccion || r.seleccion.estado!=='verificada' || !r.seleccion.aplicacion_ids?.includes(a.id)))return failure('la identidad solicitada');
    const range = r._evidencia.rango;
    if (r.resumen?.date_basis !== plan.base || args.date_basis !== plan.base || range?.desde !== (args.date_from ?? null) || range?.hasta !== (args.date_to ?? null) ||
      (plan.rango && (range.desde !== plan.rango.desde || range.hasta !== plan.rango.hasta))) return failure('el alcance solicitado');
    if ((!plan.rango && (range.desde!==null || range.hasta!==null)) || (range.desde && validarFecha(range.desde)!==range.desde) || (range.hasta && validarFecha(range.hasta)!==range.hasta)) return failure('el período solicitado');
    const scope = `Filtro de inicio ${plan.base==='planned'?'planeado':'real'}: ${range.desde ?? 'sin límite inicial'} a ${range.hasta ?? 'sin límite final'}.`;
    const actualScope = `Consumos y trabajo: fechas reales ${range.desde ?? 'sin límite inicial'} a ${range.hasta ?? 'sin límite final'}${args.lote_name?', lote consultado '+literalMd(args.lote_name):', todos los lotes consultados'}.`;
    if (!r.detalle.length) {
      if (r._evidencia.detalle_completo !== true || r._evidencia.total_hechos !== 0) return failure('una página vacía parcial');
      return {tipo:'texto',texto:`No encontré registros de aplicaciones con esos filtros. ${scope} Esto no demuestra ausencia de actividad física${plan.base==='actual' && (r.resumen?.fechas_reales_ausentes ?? 0)>0?'; hay registros sin fecha real que no puedo ubicar en ese intervalo':''}.`};
    }
    if (r.detalle.some(a=>!texto(a.id) || !texto(a.nombre_aplicacion))) return failure('la identidad de la aplicación');
    if (!plan.plural && r.detalle.length>1) return {tipo:'texto',texto:'Encontré varias aplicaciones candidatas; precisa cuál: '+r.detalle.map(a=>literalMd(a.nombre_aplicacion)+' ('+literalMd(a.id)+')').join('; ')};
    const lines:string[] = [scope]; let renderedRows = 0;
    for (const a of r.detalle) {
      const f = a.hechos_ejecucion as ReturnType<typeof hechosEjecucionAplicacion>;
      if (JSON.stringify(f?.alcance?.lote_ids)!==JSON.stringify(r.seleccion.lote_ids) || f?.contrato !== 'aplicaciones_hechos_v1' || f.aplicacion_id !== a.id || f.alcance.desde !== range.desde || f.alcance.hasta !== range.hasta || f.alcance.base_seleccion_aplicacion !== plan.base ||
        !Array.isArray(a.movimientos) || !Array.isArray(a.registros_trabajo)) return failure('los hechos estructurados');
      const recomputed = hechosEjecucionAplicacion(a.movimientos,a.registros_trabajo,{aplicacionId:a.id,tareaId:a.tarea_id?texto(a.tarea_id):null,
        tareaExclusiva:f.trabajo.atribucion==='tarea_exclusiva',desde:range.desde,hasta:range.hasta,loteIds:f.alcance.lote_ids,consultaCompleta:true,baseSeleccion:plan.base});
      if (JSON.stringify(recomputed)!==JSON.stringify(f)) return failure('la consistencia de los hechos');
      lines.push('\n**'+literalMd(a.nombre_aplicacion)+'** (ID '+literalMd(a.id)+')');
      if (plan.estado || plan.planes) lines.push('Estado registrado: '+(['calculada','en ejecucion','cerrada'].includes(normalizarTextoAplicacion(a.estado))?literalMd(a.estado):'no verificable')+'.');
      if (plan.fechas) {
        const fecha = (value:unknown) => { if (!value) return 'no registrada'; try{return validarFecha(value);}catch{return 'no verificable';} };
        lines.push(`Fechas planeadas: ${fecha(a.fecha_inicio_planeada)} a ${fecha(a.fecha_fin_planeada)}. Fechas reales: ${fecha(a.fecha_inicio_ejecucion)} a ${fecha(a.fecha_fin_ejecucion)}.`);
        if (Array.isArray(a.fechas_inconsistentes) && a.fechas_inconsistentes.length) lines.push('Hay fechas contradictorias; no calculé duración ni corregí registros.');
      }
      if (plan.consumos) {
        lines.push(actualScope,'| Producto (ID) | Unidad | Cantidad registrada |','| --- | --- | --- |');
        if (!f.consumos.productos.length) lines.push('Sin cantidades de consumo verificadas; no equivale a consumo cero.');
        for (const p of f.consumos.productos) {
          if (++renderedRows>100) break;
          const amount = p.cantidad_total ?? (p.cantidad_verificada===null?'no verificable':p.cantidad_verificada+' (subtotal verificado; total desconocido)');
          lines.push(`| ${literalMd(p.producto_nombre)} (${literalMd(p.producto_id)})${p.nombre_recortado?' [nombre abreviado]':''} | ${literalMd(p.unidad)} | ${amount} |`);
        }
        if (!f.consumos.cobertura_cerrada) lines.push('Cobertura de consumo incompleta: faltan cantidades, identidades, unidades o detalle atribuible. Los subtotales no cierran el total.');
        if (!f.consumos.detalle_productos_completo || renderedRows>100) lines.push(`Detalle limitado: ${f.consumos.grupos_total} grupos de producto/unidad consultados; no afirmo que las filas mostradas sean toda la lista.`);
      }
      if (plan.trabajo) {
        const work=f.trabajo;
        lines.push(actualScope);
        if (work.atribucion !== 'tarea_exclusiva') {
          lines.push('El vínculo de tarea no permite atribuir un total de mano de obra exclusivo a esta aplicación.');
          if (work.atribucion==='tarea_compartida') lines.push(`Subtotal de la tarea compartida ${literalMd(work.tarea_id)}: ${work.jornales_verificados ?? 'no verificable'} jornales${plan.ocultarCostos?'':', '+(work.costo_verificado_cop ?? 'no verificable')+' COP'}; no lo atribuí a la aplicación.`);
        } else {
          lines.push('Mano de obra registrada: '+(work.jornales_total ?? (work.jornales_verificados===null?'jornales no verificables':work.jornales_verificados+' jornales verificados; total desconocido'))+(work.jornales_total===null?'':' jornales')+'.');
          if (!plan.ocultarCostos) lines.push('Costo laboral registrado: '+(work.costo_total_cop ?? (work.costo_verificado_cop===null?'no verificable':work.costo_verificado_cop+' (subtotal verificado; total desconocido)'))+' COP.');
        }
      }
      if (plan.estimacion) {
        lines.push('Estimación teórica por filas verificadas del plan y los lotes consultados; no es consumo real ni un total certificado del plan.'); let n=0; const usedLots=new Set<unknown>(), usedRecipes=new Set<unknown>();
        const lots=rowsPlan(a.plan_por_lote), recipes=rowsPlan(a.productos_planeados);
        for (const lot of lots) for (const recipe of recipes) {
          if (!texto(lot.id) || lots.filter(x=>x.id===lot.id || (x.mezcla_id===lot.mezcla_id && x.lote_id===lot.lote_id)).length!==1 ||
            !texto(recipe.id) || recipes.filter(x=>x.id===recipe.id || (x.mezcla_id===recipe.mezcla_id && x.producto_id===recipe.producto_id)).length!==1 ||
            lot.mezcla_id !== recipe.mezcla_id || !texto(lot.mezcla_id) || !texto(lot.lote_id) || !texto(recipe.producto_id) || !texto(recipe.unidad_dosis) ||
            (f.alcance.lote_ids && !f.alcance.lote_ids.includes(texto(lot.lote_id)))) continue;
          const value=estimacionDosisCanecas(recipe.dosis_por_caneca,lot.numero_canecas);
          if (value===null || n>=100) continue;
          n++; usedLots.add(lot.id); usedRecipes.add(recipe.id); lines.push(`Producto ${literalMd(recipe.producto_nombre)} (${literalMd(recipe.producto_id)}), lote ${literalMd(lot.lote_id)}: ${literalMd(String(recipe.dosis_por_caneca))} ${literalMd(recipe.unidad_dosis)}/caneca × ${literalMd(String(lot.numero_canecas))} canecas planeadas = ${value} ${literalMd(recipe.unidad_dosis)} estimados.`);
        }
        if (lots.some(l=>!usedLots.has(l.id)) || recipes.some(r=>!usedRecipes.has(r.id))) lines.push('Estimación parcial: hay filas del plan sin cantidad, unidad o vínculo verificable, fuera del lote consultado o no mostradas. No inferí sus cantidades.');
        if (!n) lines.push('Faltan dosis, unidad, canecas planeadas o un vínculo inequívoco de mezcla; no calculé la estimación.');
        if (n>=100) lines.push('Estimación limitada a 100 filas; precisa lote/producto para el detalle restante.');
      }
    }
    if (r._evidencia.detalle_completo !== true) lines.push('La página no contiene todas las aplicaciones consultadas; precisa filtros para completar el detalle.');
    lines.push('Estos son registros consultados, no una certificación de ejecución física completa.');
    const output=lines.join('\n');
    if (new TextEncoder().encode(output).length>24000) return {tipo:'texto',texto:'Los hechos verificados exceden el tamaño de esta respuesta. Precisa una aplicación, producto o lote; no sustituí el detalle por una estimación.'};
    return {tipo:'texto',texto:output};
  } catch { return failure('la respuesta estructurada de aplicaciones'); }
}
function rowsPlan(value: unknown): FilaEsco[] { return Array.isArray(value)?value.filter(x=>x && typeof x==='object' && !Array.isArray(x)):[]; }
/** Domain guard: a partial/other-domain query never proves application absence. */
export function respuestaSeguraAplicaciones(interacciones: Array<{ tool: string; result_summary: string }>, pregunta = ''): string | null {
  const unavailable = 'No pude verificar la aplicación con una consulta completa de ejecución. No puedo afirmar que no exista.';
  const last = [...interacciones].reverse().find(t => t.tool === 'get_aplicaciones_ejecucion');
  if (!last) return unavailable;
  try {
    const r = JSON.parse(last.result_summary);
    if (!r || typeof r !== 'object' || Object.prototype.hasOwnProperty.call(r, 'error') ||
      (Object.prototype.hasOwnProperty.call(r, 'contexto_recortado') && r.contexto_recortado !== false) ||
      r._evidencia?.herramienta !== 'get_aplicaciones_ejecucion' || r._evidencia?.consulta_completa !== true || r._evidencia?.detalle_completo !== true || !Array.isArray(r.detalle)) return unavailable;
    if (r.detalle.some((a: FilaEsco) => !a || typeof a.id !== 'string' || !texto(a.nombre_aplicacion).trim())) return unavailable;
    const collection = /\b(?:aplicaciones|fumigaciones|fertilizaciones)\b/.test(normalizarTextoAplicacion(pregunta)) && !/\b(?:la|esa|una|esta) aplicacion\b/.test(normalizarTextoAplicacion(pregunta));
    if (r.detalle.length > 1 && collection) {
      if (r.detalle.some((a: FilaEsco) => (a.fechas_inconsistentes != null && (!Array.isArray(a.fechas_inconsistentes) || a.fechas_inconsistentes.length > 0)) || (a.base_fecha_consultada !== 'planned' && a.fecha_real_ausente === true))) return 'Encontré aplicaciones, pero hay fechas reales ausentes o inconsistentes. No puedo confirmar su duración ni sustituirlas por fechas planeadas.';
      return null;
    }
    if (r.detalle.length > 1) return 'Encontré varias aplicaciones candidatas. Precisa cuál quieres consultar: ' + r.detalle.slice(0, 5).map((a: FilaEsco) => texto(a.nombre_aplicacion)).join('; ');
    if (!r.detalle.length && r.resumen?.fechas_inconsistentes > 0) return 'Hay registros con fechas inconsistentes; no puedo descartar una aplicación por este rango.';
    if (!r.detalle.length) return r.resumen?.fechas_reales_ausentes > 0 ? 'Hay aplicaciones sin fechas reales registradas; no puedo descartarlas por este rango.' : 'No encontré coincidencias dentro de los filtros consultados. Esto no demuestra ausencia fuera de ese alcance.';
    if (typeof r.detalle[0]?.id !== 'string' || !texto(r.detalle[0]?.nombre_aplicacion).trim()) return unavailable;
    if (r.detalle[0].base_fecha_consultada !== 'planned' && r.detalle[0].fecha_real_ausente === true) return `Encontré ${texto(r.detalle[0].nombre_aplicacion)}, estado ${texto(r.detalle[0].estado)}. No tiene fecha de inicio real registrada; la planeada no sustituye ese dato.`;
    if (r.detalle[0].fechas_inconsistentes?.length) return 'Encontré la aplicación, pero sus fechas registradas son inconsistentes. No puedo confirmar su duración sin aclararlas.';
    return null;
  } catch { return unavailable; }
}
export async function ejecutarConsultaEsco(nombre: string, args: FilaEsco, q: ConsultaPagina, hoy = fechaBogota(), solicitud?: SolicitudAplicacion): Promise<FilaEsco> {
  const def = HERRAMIENTAS_CONSULTA.find(t => t.name === nombre);
  if (!def) throw new Error(`Herramienta desconocida: ${nombre}`);
  const req = def.parameters.required as string[];
  for (const k of req) if (args[k] == null || args[k] === '') throw new Error(`Falta ${k}.`);
  const desde = args.date_from == null ? null : validarFecha(args.date_from);
  const hasta = args.date_to == null ? null : validarFecha(args.date_to);
  if (desde && hasta && desde > hasta) throw new Error('La fecha inicial es posterior a la final.');
  const offset = args.detalle_offset == null ? 0 : Number(args.detalle_offset);
  if (!Number.isInteger(offset) || offset < 0) throw new Error('detalle_offset inválido.');
  const fuentes: string[] = [];
  const cobertura: Record<string, number> = {};
  const limites: string[] = [];
  const read = async (tabla: string, cols: string, fecha?: string, filtro = '') => {
    fuentes.push(tabla);
    const timestamp = fecha === 'abierta_en' || fecha === 'creado_en';
    const rango = fecha ? `${desde ? `&${fecha}=gte.${encodeURIComponent(timestamp ? `${desde}T00:00:00-05:00` : desde)}` : ''}${hasta ? `&${fecha}=${timestamp ? 'lt' : 'lte'}.${encodeURIComponent(timestamp ? `${sumarDias(hasta, 1)}T00:00:00-05:00` : hasta)}` : ''}` : '';
    const rows = await leerCompleto(q, tabla, `select=${cols}&order=${fecha ? `${fecha}.asc,` : ''}${tabla === 'clima_resumen_diario' ? 'station_id.asc' : 'id.asc'}${rango}${filtro}`);
    cobertura[tabla] = (cobertura[tabla] ?? 0) + rows.length;
    return rows;
  };
  const related = async (tabla: string, cols: string, campo: string, ids: unknown[]) => {
    const unicos = [...new Set(ids.map(texto).filter(Boolean))];
    const rows: FilaEsco[] = [];
    for (let i = 0; i < unicos.length; i += 100) {
      const valores = unicos.slice(i, i + 100).map(v => `"${v.replace(/["\\]/g, '')}"`).join(',');
      rows.push(...await read(tabla, cols, undefined, `&${campo}=in.(${encodeURIComponent(valores)})`));
    }
    return rows;
  };
  const animals = async () => read('hato_animales', animalCols);
  const seleccionAnimal = (f: FilaEsco) => contiene(f.nombre, args.nombre) && (args.numero == null || Number(f.numero) === Number(args.numero));
  const finish = (detalle: FilaEsco[], resumen: FilaEsco = {}) => ({
    _evidencia: { herramienta: nombre, fuentes: [...new Set(fuentes)], rango: { desde, hasta }, consultado_en: hoy, consulta_completa: true, cobertura_registros: cobertura, total_hechos: detalle.length, detalle_completo: offset === 0 && detalle.length <= 100, detalle_offset: offset, siguiente_offset: offset + 100 < detalle.length ? offset + 100 : null, limites },
    resumen, detalle: detalle.slice(offset, offset + 100),
  });
  if (nombre === 'get_hato_partos' || nombre === 'get_hato_eventos' || nombre === 'get_hato_salidas_finanzas') {
    const [animales, eventos] = await Promise.all([animals(), read('hato_eventos', eventoCols, 'fecha', nombre === 'get_hato_partos' ? '&tipo=eq.parto' : '')]);
    const am = mapa(animales);
    let selected = eventos.filter(e => seleccionAnimal(am.get(texto(e.animal_id)) ?? {}));
    if (nombre === 'get_hato_eventos' && args.tipo) selected = selected.filter(e => e.tipo === args.tipo);
    if (nombre === 'get_hato_salidas_finanzas') selected = selected.filter(e => ['venta', 'muerte', 'descarte', 'salida'].includes(texto(e.tipo)) || e.transaccion_ganado_id || e.fin_ingreso_id || e.cria_destino === 'macho_vendido');
    const tm = mapa(await related('fin_transacciones_ganado', transCols, 'id', selected.map(e => e.transaccion_ganado_id)));
    const im = mapa(await related('fin_ingresos', ingresoCols, 'id', selected.map(e => e.fin_ingreso_id)));
    const transaccionesHato = nombre === 'get_hato_salidas_finanzas' ? await read('fin_transacciones_ganado', transCols, 'fecha', '&es_hato=eq.true') : [];
    const detalle = selected.map(ev => {
      const vinculada = am.get(texto(ev.cria_id));
      const candidatas = animales.filter(a => a.madre_id === ev.animal_id && a.fecha_nacimiento === ev.fecha);
      return { ...ev, madre_o_animal: identidad(am.get(texto(ev.animal_id))), cria_vinculada: identidad(vinculada), crias_por_madre_fecha: candidatas.map(a => identidad(a)), asociacion_cria: vinculada ? 'cria_id_confirmado' : candidatas.length ? 'candidatas_por_madre_fecha' : 'sin_ficha_vinculada', transaccion: tm.get(texto(ev.transaccion_ganado_id)) ?? null, ingreso: im.get(texto(ev.fin_ingreso_id)) ?? null };
    });
    limites.push('Parto sin ficha de cría sigue siendo un parto. Candidatas por madre/fecha no prueban identidad; no inferir venta de madre desde destino de cría.');
    return finish(detalle, { total_eventos: detalle.length, transacciones_hato_periodo: transaccionesHato.map(t => ({ ...t, animal_directo: identidad(am.get(texto(t.hato_animal_id))), eventos_vinculados: selected.filter(ev => ev.transaccion_ganado_id === t.id).map(ev => ev.id), vinculo_evento_en_periodo: selected.some(ev => ev.transaccion_ganado_id === t.id) ? 'vinculado' : 'sin_evento_en_periodo_consultado' })), por_tipo: selected.reduce<Record<string, number>>((a, e) => { a[texto(e.tipo)] = (a[texto(e.tipo)] ?? 0) + 1; return a; }, {}) });
  }
  if (nombre === 'get_hato_animales') {
    const rows = await animals(); const am = mapa(rows);
    const seleccion = rows.filter(a => seleccionAnimal(a) && (!args.estado || a.estado === args.estado) && (!desde || (texto(a.fecha_nacimiento) >= desde)) && (!hasta || (!!a.fecha_nacimiento && texto(a.fecha_nacimiento) <= hasta)));
    return finish(seleccion.map(a => ({ ...a, numero_es_provisional: identidad(a)?.numero_es_provisional, madre: identidad(am.get(texto(a.madre_id))), padre: identidad(am.get(texto(a.padre_id))), crias: rows.filter(c => c.madre_id === a.id).map(c => identidad(c)) })), { total_animales: seleccion.length });
  }
  if (nombre === 'get_hato_tratamientos') {
    const [as, tratamientos] = await Promise.all([animals(), read('hato_tratamientos', 'id,animal_id,chequeo_id,protocolo_id,nombre,fecha_inicio,estado,nota,fuente', 'fecha_inicio')]);
    const am = mapa(as);
    const ts = tratamientos.filter(t => seleccionAnimal(am.get(texto(t.animal_id)) ?? {}) && (args.estado ? t.estado === args.estado : (desde || hasta) ? true : t.estado === 'activo'));
    const protocolos = mapa(await related('hato_protocolos', 'id,nombre,descripcion', 'id', ts.map(t => t.protocolo_id)));
    const pasos = await related('hato_tratamiento_pasos', 'id,tratamiento_id,paso_num,descripcion,fecha_programada,fecha_ejecutada,requiere_confirmacion', 'tratamiento_id', ts.map(t => t.id));
    const activos = new Set(ts.filter(t => t.estado === 'activo').map(t => t.id));
    const clasificar = (p: FilaEsco) => p.fecha_ejecutada ? 'ejecutado' : !activos.has(p.tratamiento_id) ? 'no_ejecutado_tratamiento_inactivo' : texto(p.fecha_programada) < hoy ? 'vencido' : 'pendiente';
    return finish(ts.map(t => ({ ...t, animal: identidad(am.get(texto(t.animal_id))), protocolo: protocolos.get(texto(t.protocolo_id)) ?? null, pasos: pasos.filter(p => p.tratamiento_id === t.id).sort((a, b) => Number(a.paso_num) - Number(b.paso_num)).map(p => ({ ...p, situacion: clasificar(p) })) })), { tratamientos: ts.length, pasos_vencidos: pasos.filter(p => clasificar(p) === 'vencido').length, pasos_pendientes: pasos.filter(p => clasificar(p) === 'pendiente').length });
  }
  if (nombre === 'get_hato_chequeos') {
    const [as, chequeos] = await Promise.all([animals(), read('hato_chequeos', 'id,fecha,veterinario,estado,fuente,sheet_ref', 'fecha')]);
    const am = mapa(as); const cm = mapa(chequeos);
    const filas = await related('hato_chequeo_vacas', 'id,chequeo_id,animal_id,pl,num_partos,fecha_servicio,toro,tipo_servicio,meses_prenez,fecha_secar,fecha_probable_parto,estado,estado_raw,ttto_raw,normalizacion_issues', 'chequeo_id', chequeos.map(c => c.id));
    return finish(filas.filter(f => seleccionAnimal(am.get(texto(f.animal_id)) ?? {})).map(f => ({ ...f, chequeo: cm.get(texto(f.chequeo_id)), animal: identidad(am.get(texto(f.animal_id))) })), { chequeos: chequeos.length });
  }
  if (nombre === 'get_ganado_conciliacion' || nombre === 'get_ganado_movimientos_detalle') {
    const [trans, movs, inv, potreros, fincas] = await Promise.all([
      read('fin_transacciones_ganado', transCols, 'fecha', '&es_hato=eq.false'),
      read('gan_movimientos', 'id,tipo,estado,fecha,potrero_origen_id,potrero_destino_id,novillos_delta,toros_delta,peso_promedio_kg,transaccion_ganado_id,grupo_id,notas', 'fecha'),
      read('gan_inventario', 'id,potrero_id,novillos,toros,updated_at'), read('gan_potreros', 'id,nombre,finca_id,lote_id,etapa'), read('gan_fincas', 'id,nombre,ubicacion_id'),
    ]);
    const pm = mapa(potreros); const fm = mapa(fincas);
    const lugar = (id: unknown) => { const p = pm.get(texto(id)); return p ? { ...p, finca: fm.get(texto(p.finca_id)) ?? null } : null; };
    const shape = (m: FilaEsco) => ({ ...m, origen: lugar(m.potrero_origen_id), destino: lugar(m.potrero_destino_id) });
    if (nombre === 'get_ganado_movimientos_detalle') {
      const fueraGrupo = await related('gan_movimientos', 'id,tipo,estado,fecha,potrero_origen_id,potrero_destino_id,novillos_delta,toros_delta,transaccion_ganado_id,grupo_id,notas', 'grupo_id', movs.map(m => m.grupo_id));
      const fueraTrans = await related('gan_movimientos', 'id,tipo,estado,fecha,potrero_origen_id,potrero_destino_id,novillos_delta,toros_delta,transaccion_ganado_id,grupo_id,notas', 'transaccion_ganado_id', movs.map(m => m.transaccion_ganado_id));
      const completos = [...new Map([...movs, ...fueraGrupo, ...fueraTrans].map(m => [m.id, m])).values()];
      const grupos = new Map<string, FilaEsco[]>();
      for (const m of completos) { const k = m.grupo_id ? `grupo:${m.grupo_id}` : m.transaccion_ganado_id ? `transaccion:${m.transaccion_ganado_id}` : `fila:${m.id}`; grupos.set(k, [...(grupos.get(k) ?? []), m]); }
      limites.push('Traslados internos no son entradas/salidas del negocio; no sumar ambas patas como cabezas compradas.');
      return finish([...grupos].map(([grupo, ms]) => ({ grupo, movimientos: ms.map(shape), grupo_completo: true })), { hechos_en_periodo: grupos.size });
    }
    const ts = trans.filter(t => !args.transaccion_id || t.id === args.transaccion_id);
    const vinculados = await related('gan_movimientos', 'id,tipo,estado,fecha,potrero_origen_id,potrero_destino_id,novillos_delta,toros_delta,transaccion_ganado_id,grupo_id,notas', 'transaccion_ganado_id', ts.map(t => t.id));
    const detalle = ts.map(t => {
      const ms = vinculados.filter(m => m.transaccion_ganado_id === t.id);
      const validos = ms.filter(m => m.estado === 'confirmado' && m.tipo === t.tipo);
      const signoEsperado = texto(t.tipo) === 'compra' ? 1 : -1;
      const signosValidos = validos.every(m => Number(m.novillos_delta) * signoEsperado >= 0 && Number(m.toros_delta) * signoEsperado >= 0);
      const cabezas = validos.some(m => numero(m.novillos_delta) == null || numero(m.toros_delta) == null) ? null : validos.reduce((s, m) => s + Math.abs(Number(m.novillos_delta) + Number(m.toros_delta)), 0);
      return { ...t, movimientos: ms.map(shape), cabezas_fisicas_confirmadas: cabezas, diferencia_cabezas: cabezas == null || numero(t.cantidad_cabezas) == null ? null : Number(t.cantidad_cabezas) - cabezas, estado_conciliacion: !ms.length ? 'sin_movimientos_vinculados' : ms.some(m => m.estado === 'pendiente') ? 'pendiente_confirmacion' : signosValidos && cabezas === numero(t.cantidad_cabezas) ? 'cantidades_coinciden' : 'diferencia_o_movimiento_incompatible' };
    });
    limites.push('Inventario es actual; no demuestra saldo al cierre del período. Movimientos sin transacción son hechos sin vínculo, no necesariamente errores.');
    return finish(detalle, { transacciones: ts.length, movimientos_sin_transaccion: movs.filter(m => !m.transaccion_ganado_id).map(shape), inventario_actual: inv.map(i => ({ ...i, potrero: lugar(i.potrero_id) })) });
  }
  if (nombre === 'get_cosecha_trazabilidad') {
    const [cosechas, lotes, sublotes] = await Promise.all([read('cosechas', 'id,fecha_cosecha,lote_id,sublote_id,kilos_cosechados,numero_canastillas,responsables,observaciones', 'fecha_cosecha'), read('lotes', 'id,nombre'), read('sublotes', 'id,nombre,lote_id')]);
    const lm = mapa(lotes); const sm = mapa(sublotes);
    const cs = cosechas.filter(c => (!args.cosecha_id || c.id === args.cosecha_id) && contiene(lm.get(texto(c.lote_id))?.nombre, args.lote_name));
    const trazas = await related('despachos_trazabilidad', 'id,despacho_id,cosecha_id,kilos_de_esta_cosecha', 'cosecha_id', cs.map(c => c.id));
    const despachos = await related('despachos', 'id,fecha_despacho,cliente_id,kilos_despachados,precio_por_kilo,valor_total,numero_factura,numero_guia', 'id', trazas.map(t => t.despacho_id));
    const clientes = mapa(await related('clientes', 'id,nombre', 'id', despachos.map(d => d.cliente_id))); const dm = mapa(despachos);
    const trazasDespachos = await related('despachos_trazabilidad', 'id,despacho_id,cosecha_id,kilos_de_esta_cosecha', 'despacho_id', despachos.map(d => d.id));
    const despachosPeriodo = await read('despachos', 'id,fecha_despacho,cliente_id,kilos_despachados,precio_por_kilo,valor_total', 'fecha_despacho');
    const trazasPeriodo = await related('despachos_trazabilidad', 'id,despacho_id,cosecha_id,kilos_de_esta_cosecha', 'despacho_id', despachosPeriodo.map(d => d.id));
    const pre = await related('preselecciones', 'id,cosecha_id,fecha_preseleccion,kilos_clasificados,kilos_sanos,kilos_descarte,responsable', 'cosecha_id', cs.map(c => c.id));
    return finish(cs.map(c => { const tr = trazas.filter(t => t.cosecha_id === c.id); const kg = suma(tr, 'kilos_de_esta_cosecha'); return { ...c, lote: lm.get(texto(c.lote_id)), sublote: sm.get(texto(c.sublote_id)) ?? null, preselecciones: pre.filter(p => p.cosecha_id === c.id), kilos_asignados_despachos: kg, kilos_sin_asignar: numero(c.kilos_cosechados) == null || kg == null ? null : Number(c.kilos_cosechados) - kg, despachos: tr.map(t => { const d = dm.get(texto(t.despacho_id)); return { ...t, despacho: d ? { ...d, cliente: clientes.get(texto(d.cliente_id)) ?? null } : null }; }) }; }), { cosechas: cs.length, kilos_cosechados: suma(cs, 'kilos_cosechados'), conciliacion_despachos_vinculados: despachos.map(d => { const kg = suma(trazasDespachos.filter(t => t.despacho_id === d.id), 'kilos_de_esta_cosecha'); return { despacho_id: d.id, kilos_despachados: d.kilos_despachados, kilos_trazados: kg, diferencia: numero(d.kilos_despachados) == null || kg == null ? null : Number(d.kilos_despachados) - kg }; }), despachos_periodo_sin_trazabilidad: despachosPeriodo.filter(d => !trazasPeriodo.some(t => t.despacho_id === d.id)) });
  }
  if (nombre === 'get_produccion_calidad') {
    const [ps, lotes, sublotes] = await Promise.all([read('produccion', 'id,lote_id,sublote_id,ano,cosecha_tipo,kg_totales,kg_exportacion,kg_nacional,arboles_registrados'), read('lotes', 'id,nombre'), read('sublotes', 'id,nombre,lote_id')]);
    const lm = mapa(lotes); const sm = mapa(sublotes);
    const rows = ps.filter(p => (args.year == null || Number(p.ano) === Number(args.year)) && (!args.cosecha_tipo || p.cosecha_tipo === args.cosecha_tipo) && contiene(lm.get(texto(p.lote_id))?.nombre, args.lote_name));
    limites.push('Producción por año/cosecha no equivale a preselección de cada jornada. Fechas date_from/date_to no aplican a esta serie.');
    return finish(rows.map(p => ({ ...p, lote: lm.get(texto(p.lote_id)), sublote: sm.get(texto(p.sublote_id)) ?? null, exportacion_pct: numero(p.kg_exportacion) == null || !(Number(p.kg_totales) > 0) ? null : Number(p.kg_exportacion) / Number(p.kg_totales) * 100 })), { kilos: suma(rows, 'kg_totales'), registros_sin_desglose: rows.filter(p => p.kg_exportacion == null || p.kg_nacional == null).length });
  }
  if (['get_aplicaciones_ejecucion', 'get_carencia_cosecha', 'get_recomendaciones_ejecucion', 'get_producto_consumo'].includes(nombre)) {
    const carencia = nombre === 'get_carencia_cosecha';
    const fechaCosecha = carencia ? validarFecha(args.fecha_cosecha) : null;
    // Carencia necesita toda la historia anterior, no solo un rango corto arbitrario.
    const [apps, movimientos, productos, lotes] = await Promise.all([
      read('aplicaciones', 'id,nombre_aplicacion,tipo_aplicacion,estado,fecha_inicio_planeada,fecha_fin_planeada,fecha_inicio_ejecucion,fecha_fin_ejecucion,tarea_id'),
      read('movimientos_diarios', 'id,aplicacion_id,lote_id,fecha_movimiento,numero_canecas,numero_bultos,responsable,notas', carencia ? undefined : 'fecha_movimiento', carencia ? `&fecha_movimiento=lte.${fechaCosecha}` : ''),
      read('productos', 'id,nombre,unidad_medida,periodo_carencia_dias'), read('lotes', 'id,nombre'),
    ]);
    const seleccion = nombre==='get_aplicaciones_ejecucion' && solicitud ? resolverSeleccionAplicacion(solicitud,apps,lotes,planRespuestaAplicacion(solicitud.pregunta,hoy).tipo==='aplicacion' && /\b(?:aplicaciones|fumigaciones|fertilizaciones)\b/.test(normalizarTextoAplicacion(solicitud.pregunta))) : null;
    if(seleccion?.estado==='aclarar')return {error:'seleccion_no_resuelta',seleccion};
    if(seleccion?.estado==='verificada') {
      delete args.application_id; delete args.application_name; delete args.lote_name;
      if(seleccion.aplicacion_ids?.length===1)args.application_id=seleccion.aplicacion_ids[0];
      if(seleccion.lote_ids?.length===1)args.lote_name=texto(lotes.find(l=>l.id===seleccion.lote_ids![0])?.nombre);
    }
    const loteCoincide=(loteId:unknown)=>seleccion?.estado==='verificada' && seleccion.lote_ids ? seleccion.lote_ids.includes(texto(loteId)) : contiene(lotes.find(l=>l.id===loteId)?.nombre,args.lote_name);
    const lm = mapa(lotes); const pm = mapa(productos); const am = mapa(apps);
    const ms = movimientos.filter(m => (!args.application_id || m.aplicacion_id === args.application_id) && loteCoincide(m.lote_id));
    const consumos = await related('movimientos_diarios_productos', 'id,movimiento_diario_id,producto_id,producto_nombre,cantidad_utilizada,unidad', 'movimiento_diario_id', ms.map(m => m.id));
    const mm = mapa(ms);
    const consumoShape = (c: FilaEsco) => { const m = mm.get(texto(c.movimiento_diario_id)); return { ...c, movimiento: m, producto: pm.get(texto(c.producto_id)) ?? null, aplicacion: am.get(texto(m?.aplicacion_id)) ?? null, lote: lm.get(texto(m?.lote_id)) ?? null }; };
    if (carencia) {
      const filas = lotes.filter(l => contiene(l.nombre, args.lote_name)).map(l => {
        const ml = ms.filter(m => m.lote_id === l.id);
        const ids = new Set(ml.map(m => m.id)); const cs = consumos.filter(c => ids.has(c.movimiento_diario_id));
        const restricciones = cs.map(c => {
          const m = mm.get(texto(c.movimiento_diario_id))!; const p = pm.get(texto(c.producto_id));
          const dias = numero(p?.periodo_carencia_dias);
          const fin = dias == null || dias < 0 ? null : sumarDias(validarFecha(m.fecha_movimiento), Math.ceil(dias));
          return { ...consumoShape(c), periodo_carencia_dias: dias, fecha_fin_carencia: fin, vigente_en_fecha_consultada: fin == null ? null : fin > fechaCosecha! };
        });
        const incompleta = ml.some(m => !consumos.some(c => c.movimiento_diario_id === m.id)) || restricciones.some(r => r.fecha_fin_carencia == null);
        return { lote: l, fecha_cosecha: fechaCosecha, situacion: incompleta || !ml.length ? 'no_verificable' : restricciones.some(r => r.vigente_en_fecha_consultada) ? 'carencia_registrada_vigente' : 'sin_carencia_vigente_en_registros', restricciones };
      });
      limites.push('Usa carencia ACTUAL del catálogo, no etiqueta histórica ni aprobación agronómica. Sin movimientos o productos/carencia faltantes: no verificable. No certifica que todas las intervenciones estén capturadas.');
      return finish(filas);
    }
    if (nombre === 'get_producto_consumo') {
      const selected = consumos.filter(c => contiene(pm.get(texto(c.producto_id))?.nombre ?? c.producto_nombre, args.product_name));
      const ids = productos.filter(p => contiene(p.nombre, args.product_name)).map(p => p.id);
      const inv = await read('movimientos_inventario', 'id,fecha_movimiento,producto_id,tipo_movimiento,cantidad,unidad,lote_aplicacion,aplicacion_id,provisional,observaciones', 'fecha_movimiento');
      limites.push('Consumos operativos y movimientos de inventario son fuentes distintas del mismo proceso; no sumar cantidades de ambas como doble consumo.');
      return finish(selected.map(consumoShape), { movimientos_inventario: inv.filter(m => ids.includes(m.producto_id)), consumos: selected.length });
    }
    if (nombre === 'get_recomendaciones_ejecucion') {
      const visitas = await read('informes_visita', 'id,fecha_visita,agronoma,finca', 'fecha_visita');
      const snippets = await related('informes_visita_snippets', 'id,informe_id,texto,tipo,insumo,plaga,temas', 'informe_id', visitas.map(v => v.id));
      const vm = mapa(visitas);
      const recs = snippets.filter(s => ['rec_edafica', 'rec_foliar', 'rec_drench', 'labor'].includes(texto(s.tipo)));
      limites.push('No existe FK recomendación-aplicación. Candidatas por nombre de insumo y fecha son para revisión; no confirman cumplimiento ni incumplimiento.');
      return finish(recs.map(s => {
        const fecha = texto(vm.get(texto(s.informe_id))?.fecha_visita);
        const candidatos = consumos.filter(c => !!texto(s.insumo).trim() && contiene(pm.get(texto(c.producto_id))?.nombre ?? c.producto_nombre, s.insumo) && texto(mm.get(texto(c.movimiento_diario_id))?.fecha_movimiento) >= fecha);
        return { ...s, visita: vm.get(texto(s.informe_id)), estado_cumplimiento: 'sin_vinculo_confirmado', consumos_candidatos: candidatos.map(consumoShape) };
      }));
    }
    const allowed = new Set(['application_id', 'application_name', 'estado', 'alcance', 'date_basis', 'lote_name', 'date_from', 'date_to', 'detalle_offset']);
    if (Object.keys(args).some(key => !allowed.has(key))) throw new Error('Filtro de aplicación desconocido.');
    for (const key of ['lote_name', 'application_id', 'application_name', 'estado']) if (args[key] != null && (typeof args[key] !== 'string' || !normalizarTextoAplicacion(args[key]))) throw new Error(key + ' debe ser texto no vacío.');
    if (args.estado != null && !['calculada', 'en ejecucion', 'cerrada'].includes(normalizarTextoAplicacion(args.estado))) throw new Error('Estado de aplicación inválido.');
    const basis = baseFechaAplicacion(args);
    const scope = args.alcance ?? (desde || hasta ? 'periodo' : 'actual');
    if (scope !== 'actual' && scope !== 'periodo') throw new Error('alcance debe ser actual o periodo.');
    if (scope === 'periodo' && (!desde || !hasta)) throw new Error('El período requiere date_from y date_to.');
    const name = normalizarTextoAplicacion(args.application_name);
    const state = normalizarTextoAplicacion(args.estado ?? '');
    const matching = apps.filter(a => (!args.application_id || a.id === args.application_id) &&
      (!name || normalizarTextoAplicacion(a.nombre_aplicacion).includes(name)) &&
      (!state || normalizarTextoAplicacion(a.estado) === state));
    const dateKey = basis === 'actual' ? 'fecha_inicio_ejecucion' : 'fecha_inicio_planeada';
    const candidates = matching.filter(a => (!desde && !hasta) ||
      ((!!a[dateKey] && (!desde || texto(a[dateKey]) >= desde) && (!hasta || texto(a[dateKey]) <= hasta)) ||
       (basis === 'actual' && ms.some(m => m.aplicacion_id === a.id))));
    const dateIssues = (a: FilaEsco) => [['fecha_inicio_planeada', 'fecha_fin_planeada'], ['fecha_inicio_ejecucion', 'fecha_fin_ejecucion']].flatMap(([start, end]) => {
      try { if (a[start]) validarFecha(a[start]); if (a[end]) validarFecha(a[end]); }
      catch { return [start + ':fecha_invalida']; }
      return a[start] && a[end] && texto(a[start]) > texto(a[end]) ? [start + ':inicio_posterior_al_final'] : [];
    });
    const legacyPlans = await related('aplicaciones_lotes', 'id,aplicacion_id,lote_id,sublotes_ids,total_arboles', 'aplicacion_id', candidates.map(a => a.id));
    const planes = await related('aplicaciones_calculos', 'id,aplicacion_id,lote_id,lote_nombre,mezcla_id,litros_mezcla,numero_canecas,kilos_totales,numero_bultos', 'aplicacion_id', candidates.map(a => a.id));
    const selectedApps = candidates.filter(a => !args.lote_name || ms.some(m => m.aplicacion_id === a.id) || [...legacyPlans, ...planes].some(p => p.aplicacion_id === a.id && loteCoincide(p.lote_id)));
    const mezclas = await related('aplicaciones_mezclas', 'id,aplicacion_id,nombre_mezcla', 'aplicacion_id', selectedApps.map(a => a.id));
    const recetas = await related('aplicaciones_productos', 'id,mezcla_id,producto_id,producto_nombre,dosis_por_caneca,unidad_dosis,cantidad_total_necesaria', 'mezcla_id', mezclas.map(m => m.id));
    const trabajo = await related('registros_trabajo', 'id,tarea_id,lote_id,fecha_trabajo,fraccion_jornal,costo_jornal', 'tarea_id', selectedApps.map(a => a.tarea_id));
    limites.push('Consumido en rango; trabajo y plan por aplicación completa. Dosis por caneca y consumo total no se comparan sin unidad compatible. Sin captura no demuestra que no se ejecutó.');
    const scopeLotes = seleccion?.estado==='verificada' ? seleccion.lote_ids : args.lote_name ? lotes.filter(l => contiene(l.nombre, args.lote_name)).map(l => texto(l.id)) : null;
    const completed = finish(selectedApps.map(a => {
      const movements = ms.filter(m => m.aplicacion_id === a.id).map(m => ({ ...m, lote: lm.get(texto(m.lote_id)) ?? null, consumos: consumos.filter(c => c.movimiento_diario_id === m.id) }));
      const records = trabajo.filter(t => t.tarea_id === a.tarea_id);
      return { ...a, fechas_inconsistentes: dateIssues(a), base_fecha_consultada: basis, fecha_real_ausente: !a.fecha_inicio_ejecucion,
        alcance_planeado: legacyPlans.filter(p => p.aplicacion_id === a.id),
        plan_por_lote: planes.filter(p => p.aplicacion_id === a.id && loteCoincide(p.lote_id)).map(p => ({ ...p, lote: lm.get(texto(p.lote_id)) ?? null })),
        productos_planeados: recetas.filter(r => mezclas.some(m => m.id === r.mezcla_id && m.aplicacion_id === a.id)),
        movimientos: movements, registros_trabajo: records,
        hechos_ejecucion: hechosEjecucionAplicacion(movements, records, { aplicacionId: texto(a.id), tareaId: a.tarea_id ? texto(a.tarea_id) : null,
          tareaExclusiva: !!a.tarea_id && apps.filter(other => other.tarea_id === a.tarea_id).length === 1,
          desde, hasta, loteIds: scopeLotes, consultaCompleta: true, baseSeleccion: basis }),
      };
    }), { date_basis: basis, alcance: scope, coincidencias: selectedApps.length, fechas_reales_ausentes: matching.filter(a => { try { return !a.fecha_inicio_ejecucion || !validarFecha(a.fecha_inicio_ejecucion); } catch { return true; } }).length, fechas_inconsistentes: matching.filter(a => dateIssues(a).length).length });
    return seleccion ? {...completed,seleccion} : completed;
  }
  if (nombre === 'get_monitoreo_cobertura') {
    const [rondas, sublotes, lotes] = await Promise.all([read('rondas_monitoreo', 'id,nombre,fecha_inicio,fecha_fin', 'fecha_inicio'), read('sublotes', 'id,nombre,lote_id'), read('lotes', 'id,nombre,activo')]);
    const rs = rondas.filter(r => !args.ronda_id || r.id === args.ronda_id);
    const obs = await related('monitoreos', 'id,fecha_monitoreo,ronda_id,lote_id,sublote_id,plaga_enfermedad_id,arboles_monitoreados,arboles_afectados,incidencia', 'ronda_id', rs.map(r => r.id));
    const lm = mapa(lotes);
    limites.push('Catálogo actual de sublotes no prueba el alcance esperado en una ronda histórica. Sin fila no equivale a incidencia cero.');
    return finish(rs.map(r => { const os = obs.filter(o => o.ronda_id === r.id && contiene(lm.get(texto(o.lote_id))?.nombre, args.lote_name)); const sl = sublotes.filter(s => lm.get(texto(s.lote_id))?.activo !== false && contiene(lm.get(texto(s.lote_id))?.nombre, args.lote_name)); return { ...r, observaciones: os, sublotes_con_registro: sl.filter(s => os.some(o => o.sublote_id === s.id)), sublotes_catalogo_actual_sin_registro: sl.filter(s => !os.some(o => o.sublote_id === s.id)), alcance_esperado_historico: 'no_registrado' }; }));
  }
  if (nombre === 'get_inventario_conciliacion') {
    const rondas = await read('rondas_inventario', 'id,periodo,estado,abierta_en,cerrada_en,alcance_declarado,alcance_nota', 'abierta_en');
    const rs = rondas.filter(r => !args.ronda_id || r.id === args.ronda_id);
    // Alcance no tiene columna id: lectura propia con orden estable compuesto.
    fuentes.push('rondas_inventario_alcance');
    const alcance: FilaEsco[] = [];
    for (const r of rs) alcance.push(...await leerCompleto(q, 'rondas_inventario_alcance', `select=ronda_id,producto_id,cantidad_teorica,unidad,nombre_producto&order=ronda_id.asc,producto_id.asc&ronda_id=eq.${encodeURIComponent(texto(r.id))}`));
    cobertura.rondas_inventario_alcance = alcance.length;
    const ex = await related('rondas_excepciones', 'id,ronda_id,producto_id,estado,cantidad_fisica,fisico_origen,teorico_conteo,observacion_uriel,explicacion_david,captura_movimiento_id,propuesta_delta,propuesta_causa,decision_causa,aplicacion_movimiento_id', 'ronda_id', rs.map(r => r.id));
    limites.push('Saldo teórico congelado al abrir ronda no es saldo actual. No publica valoración ni aplica ajustes.');
    return finish(rs.map(r => ({ ...r, alcance: alcance.filter(a => a.ronda_id === r.id), excepciones: ex.filter(e => e.ronda_id === r.id).map(e => ({ ...e, diferencia_fisica: numero(e.cantidad_fisica) == null || numero(e.teorico_conteo) == null ? null : Number(e.cantidad_fisica) - Number(e.teorico_conteo) })) })));
  }
  if (nombre === 'get_compra_detalle') {
    const [compras, productos] = await Promise.all([read('compras', 'id,fecha_compra,proveedor,numero_factura,producto_id,cantidad,unidad,costo_unitario,costo_total,url_factura,link_factura', 'fecha_compra'), read('productos', 'id,nombre,unidad_medida')]);
    const pm = mapa(productos); const cs = compras.filter(c => (!args.compra_id || c.id === args.compra_id) && contiene(pm.get(texto(c.producto_id))?.nombre, args.product_name));
    const gastos = await related('fin_gastos', gastoCols, 'compra_id', cs.map(c => c.id));
    const movimientos = await related('movimientos_inventario', 'id,fecha_movimiento,producto_id,tipo_movimiento,cantidad,unidad,factura,provisional', 'producto_id', cs.map(c => c.producto_id));
    limites.push('No hay compra_id en movimientos. Producto+factura solo produce candidatas; no confirma recepción. Compra es adquisición registrada, no orden con recepción pendiente estructurada.');
    return finish(cs.map(c => ({ ...c, producto: pm.get(texto(c.producto_id)), gastos_vinculados: gastos.filter(g => g.compra_id === c.id), entradas_candidatas: movimientos.filter(m => m.producto_id === c.producto_id && m.tipo_movimiento === 'Entrada' && !!texto(c.numero_factura).trim() && texto(m.factura).trim() === texto(c.numero_factura).trim()), estado_recepcion: 'sin_vinculo_confirmado' })));
  }
  if (nombre === 'get_finanzas_detalle') {
    const negocios = await read('fin_negocios', 'id,nombre');
    const ns = negocios.filter(n => contiene(n.nombre, args.negocio_name)); const ids = new Set(ns.map(n => n.id)); const nm = mapa(negocios);
    const tipos = args.tipo ? [texto(args.tipo)] : ['gastos', 'ingresos', 'ganado'];
    if (tipos.some(t => !['gastos', 'ingresos', 'ganado'].includes(t))) throw new Error('tipo financiero inválido.');
    const proveedores = mapa(await read('fin_proveedores', 'id,nombre'));
    const compradores = mapa(await read('fin_compradores', 'id,nombre'));
    const categorias = mapa(await read('fin_categorias_gastos', 'id,nombre'));
    const conceptos = mapa(await read('fin_conceptos_gastos', 'id,nombre'));
    const filas: FilaEsco[] = [];
    for (const tipo of tipos) {
      const tabla = tipo === 'gastos' ? 'fin_gastos' : tipo === 'ingresos' ? 'fin_ingresos' : 'fin_transacciones_ganado';
      const rows = await read(tabla, tipo === 'gastos' ? gastoCols : tipo === 'ingresos' ? ingresoCols : transCols, 'fecha');
      filas.push(...rows.filter(f => (!args.movimiento_id || f.id === args.movimiento_id) && (!args.negocio_name || (tipo !== 'ganado' && ids.has(f.negocio_id))) && (!args.solo_pendientes || (tipo === 'gastos' && f.estado !== 'Confirmado' && f.estado !== 'Rechazado')) && (!args.solo_sin_soporte || (tipo !== 'ganado' && !texto(f.url_factura).trim()))).map(f => ({ ...f, fuente: tabla, negocio: nm.get(texto(f.negocio_id)) ?? null, proveedor: proveedores.get(texto(f.proveedor_id)) ?? null, comprador: compradores.get(texto(f.comprador_id)) ?? null, categoria_gasto: tipo === 'gastos' ? categorias.get(texto(f.categoria_id)) ?? null : null, concepto: conceptos.get(texto(f.concepto_id)) ?? null, soporte_registrado: tipo === 'ganado' ? 'campo_no_disponible' : !!texto(f.url_factura).trim() })));
    }
    limites.push('Sin archivo adjunto no significa factura inexistente; solo gastos tienen estado de confirmación. Transacciones no tienen negocio_id: filtro negocio no se aplica por inferencia. No es P&G.');
    return finish(filas);
  }
  if (nombre === 'get_presupuesto_desviaciones') {
    const anio = args.anio == null ? Number(hoy.slice(0, 4)) : Number(args.anio);
    if (!Number.isInteger(anio) || anio < 1900 || anio > 2200) throw new Error('Año inválido.');
    const qs = [...new Set(texto(args.quarters || String(Math.ceil(Number(hoy.slice(5, 7)) / 3))).split(',').map(Number))];
    if (!qs.length || qs.some(v => !Number.isInteger(v) || v < 1 || v > 4)) throw new Error('Trimestres inválidos.');
    const [negocios, categorias, conceptos, presupuestos, gastos] = await Promise.all([
      read('fin_negocios', 'id,nombre'), read('fin_categorias_gastos', 'id,nombre'), read('fin_conceptos_gastos', 'id,nombre,categoria_id'),
      read('fin_presupuestos', 'id,anio,negocio_id,categoria_id,concepto_id,monto_anual', undefined, `&anio=eq.${anio}`), read('fin_gastos', gastoCols, undefined, `&fecha=gte.${anio}-01-01&fecha=lte.${anio}-12-31&estado=eq.Confirmado`),
    ]);
    const ns = negocios.filter(n => contiene(n.nombre, args.negocio_name || 'Aguacate Hass'));
    if (ns.length !== 1) throw new Error('Precisa un negocio: no existe o el nombre es ambiguo.');
    const id = ns[0].id; const cm = mapa(categorias); const con = mapa(conceptos);
    const gs = gastos.filter(g => g.negocio_id === id && qs.includes(Math.ceil(Number(texto(g.fecha).slice(5, 7)) / 3)) && contiene(cm.get(texto(g.categoria_id))?.nombre, args.categoria_name));
    const ps = presupuestos.filter(p => p.negocio_id === id && contiene(cm.get(texto(p.categoria_id))?.nombre, args.categoria_name));
    const keys = [...new Set([...ps, ...gs].map(f => `${f.categoria_id}|${f.concepto_id ?? ''}`))];
    const rows = keys.map(k => { const p = ps.filter(f => `${f.categoria_id}|${f.concepto_id ?? ''}` === k); const g = gs.filter(f => `${f.categoria_id}|${f.concepto_id ?? ''}` === k); const base = p[0] ?? g[0]; const anual = suma(p, 'monto_anual'); const real = suma(g, 'valor'); const periodo = anual == null ? null : anual * qs.length / 4; return { categoria: cm.get(texto(base.categoria_id)), concepto: con.get(texto(base.concepto_id)) ?? null, presupuesto_anual: anual, presupuesto_periodo: periodo, gasto_confirmado: real, desviacion: real == null || periodo == null ? null : real - periodo, gastos: g.sort((a, b) => Number(b.valor) - Number(a.valor)) }; });
    limites.push('Presupuesto del período = anual × número de trimestres/4, como herramienta existente. No implica calendario real de desembolsos ni sustituye P&G.');
    return finish(rows, { negocio: ns[0], anio, trimestres: qs, gasto_confirmado: suma(gs, 'valor') });
  }
  if (nombre === 'get_tarea_ejecucion') {
    const [tareas, lotes] = await Promise.all([read('vista_tareas_resumen', 'id,nombre,estado,prioridad,lote_id,lote_ids,lote_nombres,responsable_nombre,fecha_estimada_inicio,fecha_estimada_fin,jornales_estimados,jornales_reales,costo_total', 'fecha_estimada_inicio'), read('lotes', 'id,nombre')]);
    const lotesFiltro = new Set(lotes.filter(l => contiene(l.nombre, args.lote_name)).map(l => l.id));
    const ts = tareas.filter(t => (!args.tarea_id || t.id === args.tarea_id) && (!args.lote_name || lotesFiltro.has(t.lote_id) || (Array.isArray(t.lote_ids) && t.lote_ids.some(id => lotesFiltro.has(id)))));
    const regs = await related('registros_trabajo', 'id,tarea_id,empleado_id,contratista_id,lote_id,fecha_trabajo,fraccion_jornal,costo_jornal,observaciones', 'tarea_id', ts.map(t => t.id));
    return finish(ts.map(t => { const r = regs.filter(x => x.tarea_id === t.id); const real = suma(r, 'fraccion_jornal'); const est = numero(t.jornales_estimados); return { ...t, registros: r, jornales_registrados: real, diferencia_jornales: real == null || est == null ? null : real - est, ejecucion_capturada: r.length > 0 }; }));
  }
  if (nombre === 'get_clima_cobertura') {
    const filas = await read('clima_resumen_diario', 'fecha,station_id,lecturas_count,lluvia_confianza,lluvia_total_mm,ultima_lectura_en,cobertura_hueco_max_min', 'fecha');
    const fechas = new Set(filas.map(f => f.fecha)); const ausentes: string[] = [];
    let diasEvaluados = 0;
    for (let d = desde!; d <= hasta!; d = sumarDias(d, 1)) { if (++diasEvaluados > 20000) throw new Error('Rango climático demasiado amplio.'); if (!fechas.has(d)) ausentes.push(d); }
    limites.push('Confianza de lluvia proviene del rollup oficial; no imponer un umbral nuevo de lecturas a estaciones históricas. Días ausentes no equivalen a cero lluvia.');
    return finish(filas, { dias_ausentes: ausentes, filas_sin_lluvia_verificable: filas.filter(f => f.lluvia_total_mm == null || ['contador_congelado', 'cobertura_parcial'].includes(texto(f.lluvia_confianza))).length });
  }
  if (nombre === 'get_capturas_estado') {
    const [fotos, chequeos, rondas] = await Promise.all([
      read('hato_capturas_foto', 'id,creado_en,tipo,origen,desenlace,fecha,storage_ok,fotos_recibidas,celdas_leidas_ocr,celdas_confirmadas,filas_escritas,detalle', 'creado_en'),
      read('hato_chequeos', 'id,fecha,estado,fuente,sheet_ref', 'fecha'), read('rondas_inventario', 'id,estado,abierta_en,periodo', 'abierta_en'),
    ]);
    const transcritos = await related('rondas_transcritos', 'id,ronda_id,estado,intentos_preview,confirmado_en,created_at', 'ronda_id', rondas.map(r => r.id));
    limites.push('No hay registro universal persistente de toda importación rechazada. Fechas son de creación de foto, fecha de chequeo y apertura de ronda, respectivamente.');
    return finish([...fotos.map(f => ({ fuente: 'hato_capturas_foto', ...f })), ...chequeos.map(c => ({ fuente: 'hato_chequeos', ...c })), ...transcritos.map(t => ({ fuente: 'rondas_transcritos', ...t }))]);
  }
  throw new Error(`Consulta no implementada: ${nombre}`);
}
/** Regla estrecha para el incidente: próximos/probables se consultan con panorama. */
export function requiereConsultaPartos(pregunta: string): boolean {
  const s = pregunta.toLocaleLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  return /\bpartos?\b/.test(s) && !/\b(proximos?|probables?|programados?|esperados?)\b/.test(s);
}
export function evidenciaPartosSuficiente(interacciones: Array<{ tool: string; result_summary: string }>): boolean {
  return interacciones.some(t => {
    if (t.tool !== 'get_hato_partos') return false;
    try {
      const r: unknown = JSON.parse(t.result_summary);
      if (!r || typeof r !== 'object' || Array.isArray(r)) return false;
      const result = r as FilaEsco;
      if (Object.prototype.hasOwnProperty.call(result, 'error')
        || (Object.prototype.hasOwnProperty.call(result, 'contexto_recortado') && result.contexto_recortado !== false)) return false;
      const evidence = result._evidencia as FilaEsco | undefined;
      const range = evidence?.rango as FilaEsco | undefined;
      return evidence?.consulta_completa === true && !!range?.desde && !!range?.hasta;
    } catch { return false; }
  });
}
