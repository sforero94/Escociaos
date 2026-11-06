import { describe, expect, it } from 'vitest';
import { ejecutarHato } from '../utils/esco2/hato.ts';
import { fuenteHatoSupabase } from '../utils/esco2/hatoFuente.ts';
import type { ConsultaHato, DatosHato } from '../utils/esco2/hatoTipos.ts';
import { clientePostgrestFalso } from './esco2PostgrestFalso.ts';
const id=(n:number)=>`da000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const consulta:ConsultaHato={animal_ids:[id(1)],nombres:[],chapetas:[]};
const config=[{clave:'razas',valor:['sintetica']},{clave:'meses_secado_por_raza',valor:{sintetica:2,_default:2}},...Object.entries({meses_gestacion_default:9,umbral_partos_reemplazo:8,ventana_proxima_secar_dias:20,ventana_proximo_parir_dias:20,dias_parto_proximo_alerta:10,dias_servicio_sin_confirmacion:40,dias_rechequeo_due:50,dias_espera_voluntaria_post_parto:60,meses_ternera_leche_max:3,meses_ternera_max:12}).map(([clave,valor])=>({clave,valor}))];
const datos=():DatosHato=>({
 animales:[{id:id(1),nombre:'Animal sintético',numero:900,sexo:'hembra',etapa:'vaca',estado:'activa',raza:'sintetica',fecha_estado:null,fecha_nacimiento:'2020-01-01',fecha_nacimiento_confianza:'exacta',madre_id:null,padre_id:null,padre_toro_id:null,finca_id:null,origen:'nacimiento',confianza:'alta',etapa_forzada:false}],
 toros:[],config,
 estados:[{animal_id:id(1),etapa:'vaca',raza:'sintetica',estado:'activa',num_partos:2,ultimo_chequeo_fecha:'2026-10-01',ultimo_servicio_fecha:'2026-09-01',ultimo_parto_fecha:'2026-07-01',ultimo_secado_real_fecha:null,ultima_confirmacion_prenez_fecha:'2026-09-02',ultima_confirmacion_prenez_metodo:null,ultimo_evento_fecha:'2026-09-02',ultimo_aborto_fecha:null,ultimo_estado_chequeo:null,fecha_nacimiento:'2020-01-01',etapa_forzada:false}],
});
describe('P4-4 ficha y reproducción backend',()=>{
 it('reutiliza el motor sin llamar palpación a método NULL',()=>{
  const r=ejecutarHato(consulta,datos(),'p1','2026-11-05');expect(r.estado).toBe('ok');
  expect(r.filas[0]).toMatchObject({animal_id:id(1),numero:900,reproduccion:{estado:'ok',num_partos:2,derivado:{estado:'servida',fecha_probable_parto:'2027-06-01',fecha_secar:'2027-04-01',dias_abiertos:62}}});
 });
 it.each(['config','estados'] as const)('la ficha sobrevive %s no leído sin inventar reproducción',campo=>{
  const d=datos();delete d[campo];const r=ejecutarHato(consulta,d,'p1','2026-11-05');
  expect(r.filas[0].nombre).toBe('Animal sintético');expect(r.filas[0].reproduccion).toMatchObject({estado:'no_disponible',derivado:null});
 });
 it.each([null,undefined,-1,NaN,0.5])('num_partos %s jamás se convierte en cero',n=>{
  const d=datos();d.estados![0].num_partos=n;const r=ejecutarHato(consulta,d,'p1','2026-11-05');
  expect(r.filas[0].reproduccion).toMatchObject({estado:'no_disponible',derivado:null,num_partos:null});
 });
 it('no desambigua homónimos seleccionando la activa',()=>{
  const d=datos();d.animales!.push({...d.animales![0],id:id(2),estado:'vendida'});
  const r=ejecutarHato({animal_ids:[],nombres:['Animal sintético'],chapetas:[]},d,'p1','2026-11-05');
  expect(r.estado).toBe('no_resuelto');expect(r.filas).toEqual([]);
 });
 it('no adjudica la madre por nombre aunque otra visible coincida',()=>{
  const d=datos();d.animales![0].madre_id=id(3);d.animales!.push({...d.animales![0],id:id(2),nombre:'Madre inventada',madre_id:null});
  const r=ejecutarHato(consulta,d,'p1','2026-11-05');expect(r.filas[0].ficha.parentescos.madre).toMatchObject({estado:'no_legible'});
 });
 it('pagina vista y configuración por sus claves reales con proyección fija',async()=>{
  const d=datos(),cliente=clientePostgrestFalso({hato_animales:d.animales!.map(r=>({...r})),hato_toros:[],v_hato_estado_actual:d.estados!.map(r=>({...r})),hato_config:config},{maxFilas:1});
  const fuente=fuenteHatoSupabase(cliente);expect((await fuente.catalogo()).animales).toHaveLength(1);expect(await fuente.leerEstadoActual()).toHaveLength(1);expect(await fuente.leerConfig()).toHaveLength(config.length);
  expect(cliente.llamadas.every(c=>!c.columnas.includes('*')&&!c.columnas.includes('notas'))).toBe(true);
 });
});
