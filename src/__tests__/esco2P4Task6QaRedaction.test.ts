// Independent P4-6 redaction oracles, frozen before the runtime repair.
// All dates, quantities, labels and identifiers are invented.
import type { PGlite } from '@electric-sql/pglite';
import { afterAll,beforeAll,beforeEach,describe,expect,it,vi } from 'vitest';
import { manejar } from '../../supabase/functions/esco-consultas/manejador.ts';
import type { CoberturaTurno } from '../utils/esco2/cobertura.ts';
import type { ResultadoClima } from '../utils/esco2/climaTipos.ts';
import type { ResultadoMonitoreo } from '../utils/esco2/monitoreoTipos.ts';
import { renderMensaje,validarMensajeFinal } from '../utils/esco2/mensajes.ts';
import { dependencies,forbidNetwork,request } from './esco2P2Harness.ts';
import { climaQaDb,climaQaSeed } from './esco2P4Task3QaHarness.ts';

let db:PGlite;
beforeAll(async()=>{forbidNetwork();db=await climaQaDb();},30000);
beforeEach(async()=>{await climaQaSeed(db);});
afterAll(async()=>{expect(fetch).not.toHaveBeenCalled();vi.unstubAllGlobals();await db?.close();});
const quoteSupported='Temperatura histórica de QA-A el 2026-10-01';
const quoteExcluded='Predice 999 mm para el lote 7';
const uuid='97000000-0000-4000-8000-000000000001';
async function http(extra:string|null=quoteExcluded) {
  const pregunta=quoteSupported+(extra?' y '+extra:'');
  const partes=[{id:'s1',texto:quoteSupported,capacidad:'clima',disposicion:'consultar'},...(extra?[{id:'s2',texto:extra,capacidad:'fuera_de_contrato',disposicion:'fuera_de_contrato'}]:[])];
  const h=dependencies(db,[{nombre:'consultar_clima',argumentos:JSON.stringify({desde:'2026-10-01',hasta:'2026-10-01',station_id:'QA-A',variables:['temp_c_avg'],parte_ids:['s1'],cobertura:{version:1,partes}})}],{modoCobertura:'obligatoria'});
  const response=await manejar(request({pregunta}),h.deps);const body=await response.json();
  expect(response.status).toBe(200);expect(body.origen).toBe('determinista');
  expect(body.resultados[0]).toMatchObject({tipo:'clima',estado:'ok',filas:[{valores:{temp_c_avg:10}}]});
  return {body,h};
}
function coverage(capacidad:'clima'|'monitoreo'):CoberturaTurno {
  return {version:1,estado:'declarada_validada',exhaustividad:'no_certificada',partes:[{id:'s1',texto:'Consulta histórica solicitada',capacidad,disposicion:'fuente_no_disponible',resultado_ids:['p1']}]};
}
const climateProfile:ResultadoClima={tipo:'clima',id:'p1',consulta:{desde:'2026-10-01',hasta:'2026-10-01',variables:['temp_c_avg']},estado:'no_disponible',alcance:{desde:'2026-10-01',hasta:'2026-10-01',hasta_recortado_a_hoy:false},filas:[],resumen:[],estaciones:[],avisos:[],fuente:'clima_resumen_diario'};
const monitoringProfile:ResultadoMonitoreo={tipo:'monitoreo',id:'p1',consulta:{ronda_ids:[],rondas:[],lote_ids:[],lotes:[],sublote_ids:[],sublotes:[],plaga_ids:[],plagas:[],agrupar_por:[]},estado:'no_disponible',filas:[],excluidos:{sin_ronda:0,padre_no_visible:0,incompatibles:0},avisos:[],fuente:'lecturas_independientes',unidad:'observaciones de árboles muestreados'};

describe('P4-6 independent redaction QA: literal request quotations and neutral partial scope',()=>{
  it('preserves the calendar date as part of the explicitly attributed user request',async()=>{
    const {body}=await http(null);
    const citation=body.respuesta.split('\n').find((line:string)=>line.includes('solicitud del usuario'));
    expect(citation).toContain(quoteSupported);expect(citation).not.toContain('dato numérico');
    expect(body.cobertura.partes[0].texto).toBe(quoteSupported);
  });

  it('preserves a numbered lot and an unsupported requested amount as a quote, without promoting either to an observed fact',async()=>{
    const {body}=await http();
    const citation=body.respuesta.split('\n').find((line:string)=>line.includes('Predice'));
    expect(citation).toContain(quoteExcluded);expect(citation).toMatch(/solicitud del usuario/);
    expect(body.cobertura.partes[1]).toMatchObject({texto:quoteExcluded,disposicion:'fuera_de_contrato',resultado_ids:[]});
    expect(body.resultados[0].resumen[0].variables.temp_c_avg.promedio).toBe(10);
    const outsideQuotes=body.respuesta.split('\n').filter((line:string)=>!line.includes('solicitud del usuario')).join('\n');
    expect(outsideQuotes).not.toContain('999');
  });

  it('keeps unsupported scope neutral in a non-cost climate response',async()=>{
    const {body}=await http();
    expect(body.respuesta).toMatch(/respuesta parcial/i);
    expect(body.respuesta).not.toMatch(/costo completo de producci[oó]n|\bcosto\b|\bdinero\b/i);
  });

  it('adding a quoted unsupported part leaves the supported calculations and dispositions unchanged',async()=>{
    const control=(await http(null)).body;const partial=(await http()).body;
    expect(control.cobertura.partes).toHaveLength(1);expect(partial.cobertura.partes).toHaveLength(2);
    expect(partial.resultados).toEqual(control.resultados);
    expect(partial.cobertura.partes[0]).toEqual(control.cobertura.partes[0]);
    expect(partial.cobertura.partes[1].disposicion).toBe('fuera_de_contrato');
    expect(partial.llamadas).toHaveLength(1);
  });

  it('hides an unasked UUID while preserving ordinary quoted numbers and escaping Markdown',async()=>{
    const excluded=`Predice **999** mm para [lote 7](https://qa.invalid) <script> ${uuid}`;
    const {body}=await http(excluded);
    expect(body.respuesta).not.toContain(uuid);
    expect(body.respuesta).toContain('999');expect(body.respuesta).toContain('lote 7');
    expect(body.respuesta).not.toContain('**999**');expect(body.respuesta).not.toContain('[lote 7](https://qa.invalid)');
    expect(body.respuesta).not.toContain('<script>');
    expect(body.cobertura.partes[1].texto).toBe(excluded);
  });

  it.each([{name:'clima',result:climateProfile},{name:'monitoreo',result:monitoringProfile}])('uses a neutral partial-scope notice for the typed $name unavailable-source profile',({result})=>{
    const original=structuredClone(result);const c=coverage(result.tipo);
    const text=renderMensaje([result],undefined,undefined,c);
    expect(text).toMatch(/respuesta parcial/i);expect(text).not.toMatch(/costo completo de producci[oó]n|\bcosto\b/i);
    expect(result).toEqual(original);expect(c.partes[0].disposicion).toBe('fuente_no_disponible');
    expect(validarMensajeFinal(text,[result],undefined,undefined,c)).toBe(true);
  });
});
