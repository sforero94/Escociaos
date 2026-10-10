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
  ['get_aplicaciones_ejecucion', 'Historia de intervenciones por lote y aplicación: fechas, productos/dosis planeados, consumos y trabajo real, cobertura planeada/registrada. No comparar dosis por caneca con cantidades consumidas sin conversión.', true, { application_id: { type: 'string' }, lote_name: { type: 'string' } }],
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
    nombre: { type: 'string', description: 'Nombre parcial de animal, cuando aplica' },
    numero: { type: 'number', description: 'Chapeta, cuando aplica; identidad definitiva es UUID' },
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
    const r = JSON.parse(resultado);
    return JSON.stringify({ _evidencia: r._evidencia ?? null, resumen: r.resumen ?? null, contexto_recortado: true, instruccion: 'Vuelve a consultar la herramienta. Este contexto no contiene el detalle completo.' });
  } catch {
    return JSON.stringify({ contexto_recortado: true, instruccion: 'Resultado anterior no preservado; vuelve a consultar antes de concluir.' });
  }
}
export async function ejecutarConsultaEsco(nombre: string, args: FilaEsco, q: ConsultaPagina, hoy = fechaBogota()): Promise<FilaEsco> {
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
      read('aplicaciones', 'id,nombre_aplicacion,tipo_aplicacion,estado,fecha_inicio_planeada,fecha_inicio_ejecucion,fecha_fin_ejecucion,tarea_id'),
      read('movimientos_diarios', 'id,aplicacion_id,lote_id,fecha_movimiento,numero_canecas,numero_bultos,responsable,notas', carencia ? undefined : 'fecha_movimiento', carencia ? `&fecha_movimiento=lte.${fechaCosecha}` : ''),
      read('productos', 'id,nombre,unidad_medida,periodo_carencia_dias'), read('lotes', 'id,nombre'),
    ]);
    const lm = mapa(lotes); const pm = mapa(productos); const am = mapa(apps);
    const ms = movimientos.filter(m => (!args.application_id || m.aplicacion_id === args.application_id) && contiene(lm.get(texto(m.lote_id))?.nombre, args.lote_name));
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
    const candidates = apps.filter(a => (!args.application_id || a.id === args.application_id) && (ms.some(m => m.aplicacion_id === a.id) || ((!desde || texto(a.fecha_inicio_planeada) >= desde) && (!hasta || texto(a.fecha_inicio_planeada) <= hasta))));
    const legacyPlans = await related('aplicaciones_lotes', 'id,aplicacion_id,lote_id,sublotes_ids,total_arboles', 'aplicacion_id', candidates.map(a => a.id));
    const selectedApps = candidates.filter(a => !args.lote_name || ms.some(m => m.aplicacion_id === a.id) || legacyPlans.some(p => p.aplicacion_id === a.id && contiene(lm.get(texto(p.lote_id))?.nombre, args.lote_name)));
    const planes = await related('aplicaciones_lotes_planificado', 'id,aplicacion_id,lote_id,mezcla_id,litros_mezcla_planificado,canecas_planificado', 'aplicacion_id', selectedApps.map(a => a.id));
    const mezclas = await related('aplicaciones_mezclas', 'id,aplicacion_id,nombre_mezcla', 'aplicacion_id', selectedApps.map(a => a.id));
    const recetas = await related('aplicaciones_productos', 'id,mezcla_id,producto_id,producto_nombre,dosis_por_caneca,unidad_dosis,cantidad_total_necesaria', 'mezcla_id', mezclas.map(m => m.id));
    const trabajo = await related('registros_trabajo', 'id,tarea_id,lote_id,fecha_trabajo,fraccion_jornal,costo_jornal', 'tarea_id', selectedApps.map(a => a.tarea_id));
    limites.push('Consumido en rango; trabajo y plan por aplicación completa. Dosis por caneca y consumo total no se comparan sin unidad compatible. Sin captura no demuestra que no se ejecutó.');
    return finish(selectedApps.map(a => ({ ...a, alcance_planeado: legacyPlans.filter(p => p.aplicacion_id === a.id), plan_por_lote: planes.filter(p => p.aplicacion_id === a.id && contiene(lm.get(texto(p.lote_id))?.nombre, args.lote_name)).map(p => ({ ...p, lote: lm.get(texto(p.lote_id)) ?? null })), productos_planeados: recetas.filter(r => mezclas.some(m => m.id === r.mezcla_id && m.aplicacion_id === a.id)), movimientos: ms.filter(m => m.aplicacion_id === a.id).map(m => ({ ...m, lote: lm.get(texto(m.lote_id)) ?? null, consumos: consumos.filter(c => c.movimiento_diario_id === m.id) })), registros_trabajo: trabajo.filter(t => t.tarea_id === a.tarea_id) })));
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
    try { const r = JSON.parse(t.result_summary); return !r.error && r._evidencia?.consulta_completa === true && !!r._evidencia?.rango?.desde && !!r._evidencia?.rango?.hasta; } catch { return false; }
  });
}
