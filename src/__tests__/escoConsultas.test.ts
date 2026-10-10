import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { ejecutarConsultaEsco, leerCompleto, fechaBogota, validarFecha, resumirContexto, requiereConsultaPartos, evidenciaPartosSuficiente, HERRAMIENTAS_CONSULTA, type FilaEsco, type ConsultaPagina } from '@/utils/escoConsultas';
const rango = { date_from: '2026-09-01', date_to: '2026-10-07' };
function consulta(db: Record<string, FilaEsco[]>, calls: string[] = []): ConsultaPagina {
  return async (tabla, query) => {
    calls.push(`${tabla}?${query}`);
    const params = new URLSearchParams(query);
    let filas = db[tabla] ?? [];
    for (const [key, val] of params) {
      if (['select', 'order', 'limit', 'offset'].includes(key)) continue;
      const dot = val.indexOf('.'); const op = val.slice(0, dot); const arg = val.slice(dot + 1);
      filas = filas.filter(f => {
        const v = f[key];
        if (op === 'eq') return String(v) === arg;
        if (op === 'in') return arg.slice(1, -1).split(',').map(s => s.replace(/"/g, '')).includes(String(v));
        if (v == null) return false;
        if (op === 'gte') return String(v) >= arg;
        if (op === 'lte') return String(v) <= arg;
        if (op === 'lt') return String(v) < arg;
        throw new Error(`Filtro no soportado en fixture: ${op}`);
      });
    }
    const offset = Number(params.get('offset') ?? 0); const limit = Number(params.get('limit') ?? 200);
    return filas.slice(offset, offset + limit);
  };
}
const detalle = (r: FilaEsco) => r.detalle as FilaEsco[];
const evidencia = (r: FilaEsco) => r._evidencia as FilaEsco;
const resumen = (r: FilaEsco) => r.resumen as FilaEsco;
describe('Esco #311: evidencia completa por período', () => {
  it('recupera 3 partos de septiembre y 1 de octubre, madre inactiva y crías múltiples/sin ficha', async () => {
    const db = {
      hato_animales: [
        { id: 'a', numero: 1, nombre: 'MADRE A', estado: 'vendida' },
        { id: 'b', numero: 2, nombre: 'MADRE B', estado: 'activa' },
        { id: 'c1', numero: 3, madre_id: 'b', fecha_nacimiento: '2026-09-20', sexo: 'hembra' },
        { id: 'c2', numero: 4, madre_id: 'b', fecha_nacimiento: '2026-09-20', sexo: 'hembra' },
      ],
      hato_eventos: [
        { id: 'e1', tipo: 'parto', fecha: '2026-09-15', animal_id: 'a', cria_destino: 'muerta' },
        { id: 'e2', tipo: 'parto', fecha: '2026-09-20', animal_id: 'b', cria_destino: 'retenida', cria_id: 'c1' },
        { id: 'e3', tipo: 'parto', fecha: '2026-09-26', animal_id: 'b', cria_destino: 'retenida' },
        { id: 'e4', tipo: 'parto', fecha: '2026-10-05', animal_id: 'a', cria_destino: 'macho_vendido' },
        { id: 'old', tipo: 'parto', fecha: '2026-06-26', animal_id: 'b' },
        { id: 'service', tipo: 'servicio', fecha: '2026-09-20', animal_id: 'b' },
      ],
    };
    const r = await ejecutarConsultaEsco('get_hato_partos', rango, consulta(db), '2026-10-07');
    expect(detalle(r)).toHaveLength(4);
    expect(detalle(r)[0].madre_o_animal).toMatchObject({ estado: 'vendida' });
    expect(detalle(r)[1].crias_por_madre_fecha).toHaveLength(2);
    expect(detalle(r)[1].cria_vinculada).toMatchObject({ id: 'c1' });
    expect(detalle(r)[3].cria_vinculada).toBeNull();
    expect(evidencia(r)).toMatchObject({ consulta_completa: true, total_hechos: 4 });
    const septiembre = await ejecutarConsultaEsco('get_hato_partos', { ...rango, date_to: '2026-09-30' }, consulta(db));
    expect(detalle(septiembre)).toHaveLength(3);
  });
  it('paginar detalle no pierde el conteo completo y permite continuar', async () => {
    const rows = Array.from({ length: 1100 }, (_, i) => ({ id: `e${i}`, tipo: 'parto', fecha: '2026-09-15' }));
    const q = consulta({ hato_eventos: rows });
    const r = await ejecutarConsultaEsco('get_hato_partos', rango, q);
    expect(evidencia(r)).toMatchObject({ total_hechos: 1100, detalle_completo: false, siguiente_offset: 100 });
    const ultimo = await ejecutarConsultaEsco('get_hato_partos', { ...rango, detalle_offset: 1000 }, q);
    expect(detalle(ultimo)).toHaveLength(100);
    expect(evidencia(ultimo).siguiente_offset).toBeNull();
  });
  it('un fallo no se convierte en lista vacía ni evidencia completa', async () => {
    await expect(ejecutarConsultaEsco('get_hato_partos', rango, async () => { throw new Error('503'); })).rejects.toThrow('503');
  });
  it('el tope de consulta exige reducir el rango', async () => {
    await expect(leerCompleto(async () => Array.from({ length: 200 }, (_, id) => ({ id })), 'tabla', 'select=id')).rejects.toThrow('incompleta');
  });
  it('rechaza fechas inválidas, rango invertido y fecha obligatoria ausente', async () => {
    expect(() => validarFecha('2026-02-30')).toThrow();
    await expect(ejecutarConsultaEsco('get_hato_partos', {}, consulta({}))).rejects.toThrow('Falta date_from');
    await expect(ejecutarConsultaEsco('get_hato_partos', { date_from: '2026-10-07', date_to: '2026-09-01' }, consulta({}))).rejects.toThrow('posterior');
  });
  it('Bogotá sigue en el día anterior a las 02:00 UTC', () => {
    expect(fechaBogota(new Date('2026-10-08T02:00:00Z'))).toBe('2026-10-07');
  });
  it('rango de timestamps incluye todo el último día', async () => {
    const calls: string[] = [];
    const r = await ejecutarConsultaEsco('get_capturas_estado', rango, consulta({ hato_capturas_foto: [{ id: 'f', creado_en: '2026-10-07T23:59:00Z' }] }, calls));
    expect(detalle(r)).toHaveLength(1);
    expect(calls.some(c => c.includes('creado_en=lt.2026-10-08'))).toBe(true);
  });
});
describe('Conciliaciones operativas: FK y datos ausentes', () => {
  it('tratamiento activo muestra vencido; cancelado no genera paso vencido', async () => {
    const q = consulta({ hato_tratamientos: [{ id: 't', estado: 'activo', fecha_inicio: '2026-08-01' }, { id: 'c', estado: 'cancelado' }], hato_tratamiento_pasos: [{ id: 'p', tratamiento_id: 't', paso_num: 1, fecha_programada: '2026-10-01' }, { id: 'p2', tratamiento_id: 't', paso_num: 2, fecha_programada: '2026-10-02', fecha_ejecutada: '2026-10-03' }, { id: 'p3', tratamiento_id: 'c', paso_num: 1, fecha_programada: '2026-10-01' }] });
    const r = await ejecutarConsultaEsco('get_hato_tratamientos', {}, q, '2026-10-07');
    expect(resumen(r)).toMatchObject({ tratamientos: 1, pasos_vencidos: 1 });
    expect((detalle(r)[0].pasos as FilaEsco[])[1].situacion).toBe('ejecutado');
    const cancelado = await ejecutarConsultaEsco('get_hato_tratamientos', { estado: 'cancelado' }, q, '2026-10-07');
    expect(resumen(cancelado).pasos_vencidos).toBe(0);
  });
  it('ESCO-146: con rango y sin estado devuelve también los tratamientos completados del período', async () => {
    const q = consulta({ hato_tratamientos: [{ id: 'a', estado: 'activo', fecha_inicio: '2026-09-10' }, { id: 'c', estado: 'completado', fecha_inicio: '2026-09-15' }, { id: 'v', estado: 'completado', fecha_inicio: '2026-07-01' }] });
    const conRango = await ejecutarConsultaEsco('get_hato_tratamientos', rango, q, '2026-10-07');
    expect(detalle(conRango).map(t => t.id).sort()).toEqual(['a', 'c']);
    const sinRango = await ejecutarConsultaEsco('get_hato_tratamientos', {}, q, '2026-10-07');
    expect(detalle(sinRango).map(t => t.id)).toEqual(['a']);
    const conEstado = await ejecutarConsultaEsco('get_hato_tratamientos', { ...rango, estado: 'activo' }, q, '2026-10-07');
    expect(detalle(conEstado).map(t => t.id)).toEqual(['a']);
  });
  it('ceba agrega movimientos confirmados aunque estén fuera del período y señala pendientes', async () => {
    const r = await ejecutarConsultaEsco('get_ganado_conciliacion', rango, consulta({ fin_transacciones_ganado: [{ id: 't', fecha: '2026-09-02', es_hato: false, tipo: 'compra', cantidad_cabezas: 20 }], gan_movimientos: [{ id: 'm1', fecha: '2026-08-31', transaccion_ganado_id: 't', tipo: 'compra', estado: 'confirmado', novillos_delta: 8, toros_delta: 2 }, { id: 'm2', fecha: '2026-09-02', transaccion_ganado_id: 't', tipo: 'compra', estado: 'pendiente', novillos_delta: 10, toros_delta: 0 }] }));
    expect(detalle(r)[0]).toMatchObject({ cabezas_fisicas_confirmadas: 10, diferencia_cabezas: 10, estado_conciliacion: 'pendiente_confirmacion' });
  });
  it('las dos patas del traslado son un solo hecho, incluso cruzando fechas', async () => {
    const r = await ejecutarConsultaEsco('get_ganado_movimientos_detalle', rango, consulta({ gan_movimientos: [{ id: 'm1', fecha: '2026-08-31', grupo_id: 'g', tipo: 'traslado_salida' }, { id: 'm2', fecha: '2026-09-01', grupo_id: 'g', tipo: 'traslado_entrada' }] }));
    expect(detalle(r)).toHaveLength(1);
    expect(detalle(r)[0].movimientos).toHaveLength(2);
  });
  it('trazabilidad no pierde despacho posterior y calcula kilos sin asignar', async () => {
    const r = await ejecutarConsultaEsco('get_cosecha_trazabilidad', rango, consulta({ cosechas: [{ id: 'c', fecha_cosecha: '2026-09-01', kilos_cosechados: 100 }], despachos_trazabilidad: [{ id: 'tr', cosecha_id: 'c', despacho_id: 'd', kilos_de_esta_cosecha: 80 }], despachos: [{ id: 'd', fecha_despacho: '2026-10-20' }] }));
    expect(detalle(r)[0]).toMatchObject({ kilos_asignados_despachos: 80, kilos_sin_asignar: 20 });
    expect(((detalle(r)[0].despachos as FilaEsco[])[0].despacho as FilaEsco).fecha_despacho).toBe('2026-10-20');
  });
  it('calidad ausente no fabrica 0% de exportación', async () => {
    const r = await ejecutarConsultaEsco('get_produccion_calidad', { year: 2026 }, consulta({ produccion: [{ id: 'p', ano: 2026, kg_totales: 100, kg_exportacion: null, kg_nacional: null }] }));
    expect(detalle(r)[0].exportacion_pct).toBeNull();
  });
  it('compra y entrada por factura son candidatas, gasto sí se vincula por FK', async () => {
    const r = await ejecutarConsultaEsco('get_compra_detalle', rango, consulta({ compras: [{ id: 'c', fecha_compra: '2026-09-01', producto_id: 'p', numero_factura: 'F1' }], movimientos_inventario: [{ id: 'm', producto_id: 'p', factura: 'F1', tipo_movimiento: 'Entrada' }], fin_gastos: [{ id: 'g', compra_id: 'c' }] }));
    expect(detalle(r)[0].estado_recepcion).toBe('sin_vinculo_confirmado');
    expect(detalle(r)[0].gastos_vinculados).toHaveLength(1);
    expect(detalle(r)[0].entradas_candidatas).toHaveLength(1);
  });
  it('carencia faltante es no verificable; un período registrado puede seguir vigente', async () => {
    const db = { lotes: [{ id: 'l', nombre: 'Lote A' }], movimientos_diarios: [{ id: 'm', lote_id: 'l', fecha_movimiento: '2026-10-01' }], movimientos_diarios_productos: [{ id: 'c', movimiento_diario_id: 'm', producto_id: 'p' }], productos: [{ id: 'p', periodo_carencia_dias: null }] };
    const r = await ejecutarConsultaEsco('get_carencia_cosecha', { fecha_cosecha: '2026-10-07' }, consulta(db));
    expect(detalle(r)[0].situacion).toBe('no_verificable');
    const valido = await ejecutarConsultaEsco('get_carencia_cosecha', { fecha_cosecha: '2026-10-07' }, consulta({ ...db, productos: [{ id: 'p', periodo_carencia_dias: 15 }] }));
    expect(detalle(valido)[0].situacion).toBe('carencia_registrada_vigente');
  });
  it('recomendación y aplicación coincidentes no se dan por cumplidas', async () => {
    const r = await ejecutarConsultaEsco('get_recomendaciones_ejecucion', rango, consulta({ informes_visita: [{ id: 'v', fecha_visita: '2026-09-01' }], informes_visita_snippets: [{ id: 's', informe_id: 'v', tipo: 'rec_foliar', insumo: 'Producto A' }], movimientos_diarios: [{ id: 'm', fecha_movimiento: '2026-09-02' }], movimientos_diarios_productos: [{ id: 'c', movimiento_diario_id: 'm', producto_id: 'p' }], productos: [{ id: 'p', nombre: 'Producto A' }] }));
    expect(detalle(r)[0].estado_cumplimiento).toBe('sin_vinculo_confirmado');
    expect(detalle(r)[0].consumos_candidatos).toHaveLength(1);
  });
  it('tarea conserva ejecución fuera del rango y diferencia de jornales', async () => {
    const r = await ejecutarConsultaEsco('get_tarea_ejecucion', rango, consulta({ vista_tareas_resumen: [{ id: 't', fecha_estimada_inicio: '2026-09-01', jornales_estimados: 3 }], registros_trabajo: [{ id: 'r', tarea_id: 't', fecha_trabajo: '2026-10-20', fraccion_jornal: 4 }] }));
    expect(detalle(r)[0].diferencia_jornales).toBe(1);
  });
  it('desviación explica gastos Confirmados sin duplicar trimestres', async () => {
    const r = await ejecutarConsultaEsco('get_presupuesto_desviaciones', { anio: 2026, quarters: '3,3' }, consulta({ fin_negocios: [{ id: 'n', nombre: 'Aguacate Hass' }], fin_presupuestos: [{ id: 'p', anio: 2026, negocio_id: 'n', categoria_id: 'c', concepto_id: 'co', monto_anual: 400 }], fin_gastos: [{ id: 'g', fecha: '2026-09-01', estado: 'Confirmado', negocio_id: 'n', categoria_id: 'c', concepto_id: 'co', valor: 120 }, { id: 'g2', fecha: '2026-09-01', estado: 'Pendiente', negocio_id: 'n', categoria_id: 'c', concepto_id: 'co', valor: 1000 }] }));
    expect(detalle(r)[0]).toMatchObject({ presupuesto_periodo: 100, gasto_confirmado: 120, desviacion: 20 });
  });
  it('soporte ausente y pendiente se distinguen', async () => {
    const r = await ejecutarConsultaEsco('get_finanzas_detalle', { ...rango, tipo: 'gastos', solo_pendientes: true, solo_sin_soporte: true }, consulta({ fin_gastos: [{ id: 'p', fecha: '2026-09-01', estado: 'Pendiente', url_factura: null }, { id: 'c', fecha: '2026-09-01', estado: 'Confirmado', url_factura: null }] }));
    expect(detalle(r)).toHaveLength(1);
    expect(detalle(r)[0].soporte_registrado).toBe(false);
  });
  it('inventario cero físico es dato, no falta; no revela precios restringidos', async () => {
    const calls: string[] = [];
    const r = await ejecutarConsultaEsco('get_inventario_conciliacion', rango, consulta({ rondas_inventario: [{ id: 'r', abierta_en: '2026-09-01T08:00:00Z' }], rondas_excepciones: [{ id: 'e', ronda_id: 'r', cantidad_fisica: 0, teorico_conteo: 8 }] }, calls));
    expect((detalle(r)[0].excepciones as FilaEsco[])[0].diferencia_fisica).toBe(-8);
    expect(calls.join('\n')).not.toContain('precio_unitario');
  });
  it('monitoreo ausente no se convierte en incidencia cero', async () => {
    const r = await ejecutarConsultaEsco('get_monitoreo_cobertura', rango, consulta({ rondas_monitoreo: [{ id: 'r', fecha_inicio: '2026-09-01' }], sublotes: [{ id: 's', nombre: 'Sublote A' }] }));
    expect(detalle(r)[0].sublotes_catalogo_actual_sin_registro).toHaveLength(1);
    expect(detalle(r)[0].alcance_esperado_historico).toBe('no_registrado');
  });
  it('clima mantiene los días ausentes y la confianza oficial', async () => {
    const r = await ejecutarConsultaEsco('get_clima_cobertura', { date_from: '2026-10-01', date_to: '2026-10-02' }, consulta({ clima_resumen_diario: [{ fecha: '2026-10-01', station_id: 'historico', lecturas_count: 1, lluvia_confianza: 'reconstruido', lluvia_total_mm: 5 }] }));
    expect(resumen(r)).toMatchObject({ dias_ausentes: ['2026-10-02'], filas_sin_lluvia_verificable: 0 });
  });
});
describe('Contrato y enrutamiento', () => {
  for (const tool of HERRAMIENTAS_CONSULTA) it(`${tool.name}: consulta ejecutable con evidencia`, async () => {
    const r = await ejecutarConsultaEsco(tool.name, { ...rango, fecha_cosecha: '2026-10-07' }, consulta({ fin_negocios: [{ id: 'n', nombre: 'Aguacate Hass' }] }));
    expect(evidencia(r).consulta_completa).toBe(true);
  });
  it('sin evidencia exitosa del historial no permite respuesta global de partos', () => {
    expect(requiereConsultaPartos('¿Qué nuevos partos tenemos?')).toBe(true);
    expect(requiereConsultaPartos('¿Qué partos hay en septiembre y octubre?')).toBe(true);
    expect(requiereConsultaPartos('¿Qué próximos partos tenemos?')).toBe(false);
    expect(evidenciaPartosSuficiente([{ tool: 'get_hato_reproduccion', result_summary: '{}' }])).toBe(false);
    expect(evidenciaPartosSuficiente([{ tool: 'get_hato_partos', result_summary: '{"error":"503"}' }])).toBe(false);
  });
  it('el contexto recortado conserva metadatos y exige volver a consultar', () => {
    const r = JSON.stringify({ _evidencia: { consulta_completa: true, rango }, resumen: { total: 1000 }, detalle: 'x'.repeat(25000) });
    const s = JSON.parse(resumirContexto(r));
    expect(s.contexto_recortado).toBe(true);
    expect(s.resumen.total).toBe(1000);
    expect(s.detalle).toBeUndefined();
  });
  it('copias de motor y chat son idénticas; historial carga últimos 20', () => {
    const canonical = readFileSync('src/utils/escoConsultas.ts', 'utf8');
    for (const tree of ['src/supabase/functions/server', 'supabase/functions/make-server-1ccce916']) expect(readFileSync(`${tree}/esco-consultas.ts`, 'utf8')).toBe(canonical);
    const chat = readFileSync('src/supabase/functions/server/chat.tsx', 'utf8');
    expect(readFileSync('supabase/functions/make-server-1ccce916/chat.tsx', 'utf8')).toBe(chat);
    expect(chat).toContain('order=created_at.desc,id.desc&limit=20');
    expect(chat).toContain('history.reverse()');
    expect(chat).toContain("function: { name: 'get_hato_partos' }");
  });
});

describe('Contrato del esquema real, sin datos de negocio', () => {
  it('todas las selecciones literales existen en el catálogo verificado', async () => {
    const ts = await import('typescript');
    const schema = JSON.parse(readFileSync('src/__tests__/fixtures/esco-schema-columns.json', 'utf8')) as Record<string, string[]>;
    const source = readFileSync('src/utils/escoConsultas.ts', 'utf8');
    const ast = ts.createSourceFile('escoConsultas.ts', source, ts.ScriptTarget.Latest, true);
    let verificadas = 0;
    function visitar(node: import('typescript').Node) {
      if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && ['read', 'related'].includes(node.expression.text)) {
        const [table, cols] = node.arguments;
        if (table && cols && ts.isStringLiteral(table) && ts.isStringLiteral(cols)) {
          expect(schema[table.text], `tabla ${table.text}`).toBeDefined();
          for (const c of cols.text.split(',')) expect(schema[table.text], `${table.text}.${c}`).toContain(c);
          verificadas++;
        }
      }
      ts.forEachChild(node, visitar);
    }
    visitar(ast);
    expect(verificadas).toBeGreaterThan(35);
    for (const [name, table] of [['animalCols', 'hato_animales'], ['eventoCols', 'hato_eventos'], ['gastoCols', 'fin_gastos'], ['ingresoCols', 'fin_ingresos'], ['transCols', 'fin_transacciones_ganado']]) {
      const value = new RegExp(`const ${name} = '([^']+)'`).exec(source)![1];
      for (const c of value.split(',')) expect(schema[table], `${table}.${c}`).toContain(c);
    }
  });
});
