// Regresiones de la revisión adversarial de M5 (Claude Code, PR #439–#444).
// Datos sintéticos; sin modelo, red ni producción.
import { describe, expect, it } from 'vitest';
import { ejecutarMonitoreo, renderMonitoreo } from '../utils/esco2/monitoreo.ts';
import { ejecutarClima, renderClima } from '../utils/esco2/clima.ts';
import { ejecutarPesajesLeche, renderPesajesLeche } from '../utils/esco2/leche.ts';
import { ejecutarHato } from '../utils/esco2/hato.ts';
import { renderMensaje } from '../utils/esco2/mensajes.ts';
import { sinCitasDeSolicitud } from '../utils/esco2/evaluacion.ts';
import { validarPlan } from '../utils/esco2/registro.ts';
import type { ResumenDiarioClima } from '../utils/esco2/climaTipos.ts';

const u = (n: number) => '00000000-0000-4000-8000-' + String(n).padStart(12, '0');
const consultaMon = (o: Record<string, unknown> = {}) => ({ ronda_ids: [], rondas: [], lote_ids: [], lotes: [], sublote_ids: [], sublotes: [], plaga_ids: [], plagas: [], agrupar_por: [], ...o }) as never;
const obs = (n: number, o: Record<string, unknown> = {}) => ({ id: u(1000 + n), ronda_id: u(1), fecha_monitoreo: '2026-10-02', lote_id: u(10), sublote_id: u(20), plaga_enfermedad_id: u(30), arboles_afectados: 1, arboles_monitoreados: 35, ...o });

describe('M5 revisión adversarial: monitoreo', () => {
  it('Given an incidence of 1/35, When rendered, Then it shows one decimal like the app', () => {
    const datos = { rondas: [{ id: u(1), nombre: 'R1', fecha_inicio: '2026-10-01', fecha_fin: null }], lotes: [{ id: u(10), nombre: 'L' }], sublotes: [{ id: u(20), nombre: 'S', lote_id: u(10) }], plagas: [{ id: u(30), nombre: 'Trips' }], observaciones: [obs(1)] };
    const texto = renderMonitoreo(ejecutarMonitoreo(consultaMon({ ronda_ids: [u(1)] }), datos as never, 'p1', '2026-11-05'));
    expect(texto).toContain('incidencia 2,9 %');
    expect(texto).not.toMatch(/2,857/);
  });

  it('Given all rounds by sublote for many pests, When rendered, Then the output is capped and says how many rows exist', () => {
    const rondas = Array.from({ length: 10 }, (_, i) => ({ id: u(100 + i), nombre: `R${i}`, fecha_inicio: `2026-0${(i % 9) + 1}-01`, fecha_fin: null }));
    const plagas = Array.from({ length: 8 }, (_, i) => ({ id: u(200 + i), nombre: `Plaga ${i}` }));
    const datos = { rondas, lotes: [{ id: u(10), nombre: 'L' }], sublotes: [{ id: u(20), nombre: 'S', lote_id: u(10) }], plagas, observaciones: rondas.flatMap((r, i) => plagas.map((pl, j) => obs(i * 10 + j, { ronda_id: r.id, plaga_enfermedad_id: pl.id }))) };
    const r = ejecutarMonitoreo(consultaMon({ seleccion_ronda: 'todas', agrupar_por: ['sublote'] }), datos as never, 'p1', '2026-11-05');
    expect(r.filas.length).toBe(80);
    const texto = renderMonitoreo(r);
    expect(texto.split('\n').filter(l => l.startsWith('- ')).length).toBe(30);
    expect(texto).toContain('Se muestran 30 de 80 filas');
  });

  it('Given two lots with a sublote of the same name, When the user names the lot, Then the sublote resolves inside that lot', () => {
    const datos = { rondas: [{ id: u(1), nombre: 'R1', fecha_inicio: '2026-10-01', fecha_fin: null }], lotes: [{ id: u(10), nombre: 'Irlanda' }, { id: u(11), nombre: 'Acueducto' }], sublotes: [{ id: u(20), nombre: 'Sublote 1', lote_id: u(10) }, { id: u(21), nombre: 'Sublote 1', lote_id: u(11) }], plagas: [{ id: u(30), nombre: 'Trips' }], observaciones: [obs(1)] };
    const conLote = ejecutarMonitoreo(consultaMon({ rondas: ['R1'], lotes: ['Irlanda'], sublotes: ['Sublote 1'] }), datos as never, 'p1', '2026-11-05');
    expect(conLote.estado).toBe('ok');
    expect(conLote.filtros_visibles?.sublotes).toEqual(['Sublote 1']);
    const sinLote = ejecutarMonitoreo(consultaMon({ rondas: ['R1'], sublotes: ['Sublote 1'] }), datos as never, 'p1', '2026-11-05');
    expect(sinLote.estado).toBe('no_resuelto');
  });
});

describe('M5 revisión adversarial: clima', () => {
  const dia = (fecha: string, o: Partial<ResumenDiarioClima> = {}): ResumenDiarioClima => ({ fecha, station_id: 'EST', temp_c_min: 10, temp_c_max: 25, temp_c_avg: 18, humedad_pct_min: 30, humedad_pct_max: 90, humedad_pct_avg: 60, viento_kmh_avg: 4, rafaga_kmh_max: 10, viento_dir_predominante: 90, lluvia_total_mm: 2, lluvia_confianza: 'ok', lluvia_mm_evento: null, radiacion_wm2_avg: 100, radiacion_wm2_max: 600, uv_index_max: 5, horas_sol_duracion: 4, lecturas_count: 288, cobertura_hueco_max_min: 10, ...o });
  it('Given unreliable rain days, When asked which days, Then the answer names them and a 0 mm lower bound is sin dato', () => {
    const filas = [dia('2026-10-01'), dia('2026-10-02', { lluvia_total_mm: 0, lluvia_confianza: 'cobertura_parcial', cobertura_hueco_max_min: 300 }), dia('2026-10-04', { lluvia_total_mm: 8, lluvia_confianza: 'cobertura_parcial', cobertura_hueco_max_min: 200 })];
    const r = ejecutarClima({ desde: '2026-10-01', hasta: '2026-10-04', variables: ['lluvia_total_mm'] }, filas, 'p1', '2026-11-05');
    expect(r.resumen[0].lluvia).toMatchObject({ dias_completos: 1, dias_cota_inferior: 1, cota_inferior_medida: 8, dias_sin_dato: 2 });
    const texto = renderClima(r);
    expect(texto).toContain('Días sin dato usable de lluvia: 2026-10-02, 2026-10-03.');
    expect(texto).toContain('Días con solo cota inferior de lluvia: 2026-10-04.');
    expect(texto).not.toMatch(/d[ií]a seco/i);
  });
});

describe('M5 revisión adversarial: hato y leche', () => {
  it('Given a pesaje with NULL fuente, When rendered, Then it is not labelled as an animal without a name', () => {
    const r = ejecutarPesajesLeche({ animal_ids: [u(1)], nombres: [], chapetas: [], desde: '2026-10-01', hasta: '2026-10-07' }, { animales: [{ id: u(1), numero: 1, nombre: 'A1' }], pesajes: [{ id: u(5), animal_id: u(1), fecha: '2026-10-01', litros_total: 10, litros_am: 5, litros_pm: 5, fuente: null }] } as never, 'p1', '2026-11-05');
    const texto = renderPesajesLeche(r);
    expect(texto).toContain('fuente sin fuente registrada');
    expect(texto).not.toContain('Animal sin nombre registrado');
  });

  it.each([{ meses_gestacion_default: 0 }, { meses_gestacion_default: -3 }, { meses_secado_por_raza: { 'qa-raza': 12, _default: 1 } }])('Given an out-of-range hato_config %j, When computing reproduction, Then no probable date is published', o => {
    const CFG: Record<string, unknown> = { razas: ['qa-raza'], meses_secado_por_raza: { 'qa-raza': 2, _default: 1 }, meses_gestacion_default: 9, umbral_partos_reemplazo: 3, ventana_proxima_secar_dias: 11, ventana_proximo_parir_dias: 13, dias_parto_proximo_alerta: 17, dias_servicio_sin_confirmacion: 41, dias_rechequeo_due: 43, dias_espera_voluntaria_post_parto: 47, meses_ternera_leche_max: 4, meses_ternera_max: 14, ...o };
    const config = Object.entries(CFG).map(([clave, valor]) => ({ clave, valor }));
    const animal = { id: u(1), numero: 1, nombre: 'A1', sexo: 'hembra', etapa: 'vaca', raza: 'qa-raza', estado: 'activa', fecha_estado: null, fecha_nacimiento: '2020-01-01', fecha_nacimiento_confianza: 'exacta', madre_id: null, padre_id: null, padre_toro_id: null, finca_id: null, origen: 'nacimiento', confianza: 'alta', etapa_forzada: false };
    const vista = { animal_id: u(1), etapa: 'vaca', raza: 'qa-raza', estado: 'activa', num_partos: 2, ultimo_chequeo_fecha: null, ultimo_servicio_fecha: '2026-08-01', ultimo_parto_fecha: '2026-01-01', ultimo_secado_real_fecha: null, ultima_confirmacion_prenez_fecha: null, ultima_confirmacion_prenez_metodo: null, ultimo_evento_fecha: '2026-08-01', ultimo_aborto_fecha: null, ultimo_estado_chequeo: null, fecha_nacimiento: '2020-01-01', etapa_forzada: false };
    const r = ejecutarHato({ animal_ids: [u(1)], nombres: [], chapetas: [] } as never, { animales: [animal], estados: [vista], config } as never, 'p1', '2026-11-05').filas[0].reproduccion;
    expect(r.estado).not.toBe('ok');
    expect(r.derivado?.fecha_probable_parto ?? null).toBeNull();
  });
});

describe('M5 revisión adversarial: mensajes, planificador y evaluador', () => {
  it('Given only clarification parts, When rendered, Then no partial-answer notice about shown data is added', () => {
    const texto = renderMensaje([], undefined, undefined, { version: 1, estado: 'declarada_validada', exhaustividad: 'no_certificada', partes: [{ id: 's1', texto: 'la vaca 192', capacidad: 'hato', disposicion: 'aclarar', resultado_ids: [] }] } as never);
    expect(texto).not.toContain('Respuesta parcial');
  });

  it('Given a quoted sub-part with a date, When scoring, Then the quote is not read as an asserted date', () => {
    const respuesta = 'Subpartes de tu solicitud:\n- Parte 1, solicitud del usuario: «y el 12 de mayo de 2026». Respondida con los resultados vinculados.\nTotal: 4 jornales.';
    expect(sinCitasDeSolicitud(respuesta)).not.toContain('12 de mayo');
    expect(sinCitasDeSolicitud(respuesta)).toContain('Total: 4 jornales.');
  });
});

describe('M5 revisión adversarial: pesajes no se responden con litros quincenales', () => {
  const inventario = (texto: string) => ({ version: 1, partes: [{ id: 's1', texto, capacidad: 'litros_quincenales', disposicion: 'consultar' }] });
  const llamada = (texto: string) => [{ nombre: 'consultar_litros_quincenales', argumentos: JSON.stringify({ desde: '2026-10-01', hasta: '2026-10-31', parte_ids: ['s1'], cobertura: inventario(texto) }) }];
  it.each(['¿Cuántos litros de leche se pesaron en octubre de 2026?', 'el pesaje de octubre de 2026'])('Given a weighing question %j routed to fortnight litres, Then the plan is rejected with a closed reason', texto => {
    expect(() => validarPlan(llamada(texto), { pregunta: texto, exigirCobertura: true })).toThrow('cobertura_no_valida:pesaje_como_quincenal');
  });
  it('Given a fortnight question that mentions pesos (money), Then the guard does not fire', () => {
    const texto = '¿Cuántos litros quincenales y cuántos pesos dejó octubre de 2026?';
    expect(() => validarPlan(llamada(texto), { pregunta: texto, exigirCobertura: true })).not.toThrow(/pesaje_como_quincenal/);
  });
});
