// Independent acceptance of the owner's explicit currency rule through public renderers.
// Fixtures and amounts are synthetic; no private cases or expected evaluator anchors.
import { describe, expect, it } from 'vitest';
import { renderMensaje, validarMensajeFinal } from '../utils/esco2/mensajes.ts';
import { ejecutarCostosAplicacion, renderCostosAplicacion } from '../utils/esco2/costos.ts';
import { ejecutarLaborAplicacion, renderLaborAplicacion } from '../utils/esco2/laborAplicacion.ts';
import { numeroMensaje } from '../utils/esco2/formatoMensaje.ts';
import { formatCurrency } from '../utils/formatPuro.ts';
import type { DatosCostosAplicacion } from '../utils/esco2/costosTipos.ts';
import type { DatosLaborAplicacion } from '../utils/esco2/laborAplicacionTipos.ts';
import { resultadoMensaje } from './esco2MensajesFixtures.ts';

const uid = (n: number) => `d9000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const APP=uid(1),TASK=uid(2),LOT=uid(3),PRODUCT=uid(4);
function laborMessage(cost: number) {
  const result=resultadoMensaje({ total:{ jornales:1.25,costo:cost } });
  return { result, text:renderMensaje([result]) };
}
const MONEY_ORACLES: ReadonlyArray<readonly [number,string]> = [
  [0,'$0'],[-0,'$0'],[934567,'$934,567'],[999999,'$999,999'],
  [999999.6,'aprox. $1,000,000'],[1000000,'$1.0M'],[1100000,'$1.1M'],
  [1050000,'aprox. $1.1M'],[50400000,'$50.4M'],[95000000,'$95.0M'],
  [99999999,'aprox. $100.0M'],[100000000,'$100M'],
  [100499999,'aprox. $100M'],[233000000,'$233M'],
  [-934567,'-$934,567'],[-1000000,'-$1.0M'],[-50400000,'-$50.4M'],
  [-99999999,'aprox. -$100.0M'],[-100000000,'-$100M'],[-233400000,'aprox. -$233M'],
];

describe('Esco currency acceptance through factual labor/application renderers',()=>{
  it.each(MONEY_ORACLES)('renders the explicitly approved amount %s as %s without changing factual evidence',(amount,expected)=>{
    const { result,text }=laborMessage(amount);
    expect(text).toContain(`costo de mano de obra: ${expected}.`);
    expect(text).toContain('1,25 jornales');
    expect(result.total.costo).toBe(amount);
    expect(validarMensajeFinal(text,[result])).toBe(true);
    expect(text).not.toMatch(/\bCOP\b|millard|mil millones/i);
  });

  it('uses the same formatter for frozen application components and preserves full-precision values',()=>{
    const data: DatosCostosAplicacion={
      seleccion:'ok',aplicacion:{id:APP,nombre_aplicacion:'Aplicación de prueba',estado:'Cerrada'},
      costos:{id:APP,estado:'Cerrada',costo_total_insumos:934567,costo_total_mano_obra:50400000,costo_total:51334567},
      cierres:[{id:uid(10),aplicacion_id:APP,fecha_cierre:'2026-11-01'}],
    };
    const result=ejecutarCostosAplicacion({aplicacion_id:APP},data,'p1','2026-11-05');
    const text=renderCostosAplicacion(result);
    expect(text).toContain('Insumos: $934,567; mano de obra: $50.4M; total: aprox. $51.3M.');
    expect(result.congelado).toMatchObject({insumos:934567,mano_obra:50400000,total:51334567});
    expect(text).not.toContain('COP');
  });

  it('formats current price and amount as money while product quantities keep their Spanish decimal notation',()=>{
    const app={id:APP,nombre_aplicacion:'Aplicación de prueba',estado:'En ejecución' as const,tipo_aplicacion:'Fertilización'};
    const data:DatosCostosAplicacion={seleccion:'ok',aplicacion:app,costos:{id:APP,estado:'En ejecución'},
      cantidades:{seleccion:'ok',aplicacion:app,
        movimientos:[{id:uid(20),aplicacion_id:APP,lote_id:LOT,fecha_movimiento:'2026-11-01',numero_bultos:1}],
        productos_ejecutados:[{id:uid(21),movimiento_diario_id:uid(20),producto_id:PRODUCT,producto_nombre:'Ingrediente de prueba',cantidad_utilizada:1234.5,unidad:'Kilos'}],
        lotes:[{id:LOT,nombre:'Lote de prueba'}]},
      precios:[{id:PRODUCT,nombre:'Ingrediente de prueba',unidad_medida:'Kilos',precio_unitario:2000}]};
    const result=ejecutarCostosAplicacion({aplicacion_id:APP},data,'p1','2026-11-05');
    const text=renderCostosAplicacion(result);
    expect(text).toContain('1.234,5 kg');
    expect(text).toContain('a $2,000/kg');
    expect(text).toContain('aprox. $2.5M');
    expect(result.ejecucion?.total).toBe(2469000);
    expect(result.ejecucion?.filas[0].cantidad).toBe(1234.5);
  });

  it('applies the approved format to P3 linked-labor renderer without changing quantity formatting',()=>{
    const data:DatosLaborAplicacion={seleccion:'ok',
      aplicaciones:[{id:APP,nombre_aplicacion:'Aplicación de prueba',tarea_id:TASK}],
      tareas:[{id:TASK,nombre:'Labor de prueba'}],
      registros:[{id:uid(30),tarea_id:TASK,lote_id:LOT,fecha_trabajo:'2026-11-01',fraccion_jornal:0.25,costo_jornal:934567}],
      lotes:[{id:LOT,nombre:'Lote de prueba'}]};
    const result=ejecutarLaborAplicacion({aplicacion_ids:[APP],aplicaciones:[]},data,'p1','2026-11-05');
    const text=renderLaborAplicacion(result);
    expect(text).toContain('costo laboral registrado: $934,567');
    expect(text).toContain('0,25 jornales');
    expect(result.total.costo).toBe(934567);
  });

  it('keeps quantity and global Colombian currency APIs unchanged',()=>{
    expect(numeroMensaje(1234.5)).toBe('1.234,5');
    expect(numeroMensaje(1.234567)).toBe('1,234567');
    expect(formatCurrency(934567)).toBe('$934.567');
    expect(formatCurrency(50400000)).toBe('$50.400.000');
  });
});
