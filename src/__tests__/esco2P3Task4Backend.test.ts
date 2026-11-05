import { describe, expect, it } from 'vitest';
import { ejecutarCostosAplicacion, renderCostosAplicacion } from '@/utils/esco2/costos';
import type { DatosCostosAplicacion } from '@/utils/esco2/costosTipos';
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const A=id(1), P=id(2), M=id(3);
function cerrada(): DatosCostosAplicacion {
  return { seleccion: 'ok', aplicacion: {id:A,nombre_aplicacion:'Aplicación sintética',estado:'Cerrada'}, costos:{id:A,estado:'Cerrada',costo_total_insumos:120,costo_total_mano_obra:80,costo_total:200},cierres:[{id:id(4),aplicacion_id:A,fecha_cierre:'2026-11-01'}] };
}
function abierta(): DatosCostosAplicacion {
  const aplicacion = {id:A,nombre_aplicacion:'Aplicación sintética',estado:'En ejecución' as const,tipo_aplicacion:'Fertilización'};
  return {seleccion:'ok',aplicacion,costos:{id:A,estado:'En ejecución'},cantidades:{seleccion:'ok',aplicacion,movimientos:[{id:M,aplicacion_id:A,lote_id:null,fecha_movimiento:'2026-11-01',numero_bultos:1}],productos_ejecutados:[{id:id(5),movimiento_diario_id:M,producto_id:P,producto_nombre:'Producto sintético',cantidad_utilizada:2,unidad:'Kilos'},{id:id(6),movimiento_diario_id:M,producto_id:P,producto_nombre:'Producto sintético',cantidad_utilizada:3,unidad:'Kilos'}],mezclas:[{id:id(7),aplicacion_id:A}],productos_plan:[{id:id(8),mezcla_id:id(7),producto_id:P,producto_nombre:'Producto sintético',producto_unidad:'Kilos',cantidad_total_necesaria:100}]},precios:[{id:P,nombre:'Producto sintético',unidad_medida:'Kilos',precio_unitario:7}]};
}
describe('Task4 frozen and current monetary bases',()=>{
  it('reads frozen amounts only with an operational closure',()=>{
    const r=ejecutarCostosAplicacion({aplicacion_id:A},cerrada(),'p1','2026-11-05');
    expect(r.congelado).toMatchObject({estado:'conocido',insumos:120,mano_obra:80,total:200,fecha_cierre:'2026-11-01'});
    const text=renderCostosAplicacion(r);expect(text).toMatch(/costo congelado al cierre/i);expect(text).toContain('1 de noviembre de 2026');expect(text).toContain('precios mal capturados');expect(text).not.toContain(A);
  });
  it.each(['ausente','duplicado','no_leido'] as const)('withholds unverified closure %s',modo=>{
    const d=cerrada();if(modo==='ausente')d.cierres=[];if(modo==='duplicado')d.cierres!.push({...d.cierres![0],id:id(9)});if(modo==='no_leido')delete d.cierres;
    const r=ejecutarCostosAplicacion({aplicacion_id:A},d,'p1','2026-11-05');expect(r.congelado!.total).toBeNull();expect(renderCostosAplicacion(r)).toMatch(/sin costo de cierre verificado/i);
  });
  it('preserves NULL costs and retains a contradictory saved amount without publishing an exact total',()=>{
    const d=cerrada();d.costos!.costo_total_mano_obra=null;
    const r=ejecutarCostosAplicacion({aplicacion_id:A},d,'p1','2026-11-05');expect(r.congelado!.total).toBeNull();expect(r.congelado!.insumos).toBe(120);
    const mismatch=cerrada();mismatch.costos!.costo_total=999;const x=ejecutarCostosAplicacion({aplicacion_id:A},mismatch,'p1','2026-11-05');expect(x.congelado!.estado).toBe('discrepancia');expect(x.congelado!.total).toBeNull();expect(x.congelado!.total_guardado).toBe(999);
  });
  it('values executed quantities once, with the saved plan separate and opt-in',()=>{
    const r=ejecutarCostosAplicacion({aplicacion_id:A},abierta(),'p1','2026-11-05');expect(r.ejecucion!.total).toBe(35);expect(r.plan).toBeUndefined();
    const x=ejecutarCostosAplicacion({aplicacion_id:A,incluir_plan:true},abierta(),'p1','2026-11-05');expect(x.ejecucion!.total).toBe(35);expect(x.plan!.total).toBe(700);
    expect(renderCostosAplicacion(x)).toContain('a precio de hoy');expect(renderCostosAplicacion(x)).not.toContain('735');expect(renderCostosAplicacion(x)).not.toContain(A);
  });
  it.each([null,undefined] as const)('NULL or unread price %s never becomes zero',precio=>{
    const d=abierta();d.precios![0].precio_unitario=precio;const r=ejecutarCostosAplicacion({aplicacion_id:A},d,'p1','2026-11-05');expect(r.ejecucion!.total).toBeNull();expect(r.ejecucion!.filas[0].costo).toBeNull();
  });
  it('keeps registered zero price and rejects incompatible units or hidden inventory',()=>{
    const d=abierta();d.precios![0].precio_unitario=0;expect(ejecutarCostosAplicacion({aplicacion_id:A},d,'p1','2026-11-05').ejecucion!.total).toBe(0);
    d.precios![0].unidad_medida='Litros';expect(ejecutarCostosAplicacion({aplicacion_id:A},d,'p1','2026-11-05').ejecucion!.total).toBeNull();
    d.precios=[];expect(ejecutarCostosAplicacion({aplicacion_id:A},d,'p1','2026-11-05').ejecucion!.filas[0].estado).toBe('inventario_no_disponible');
  });
  it('does not certify a monetary zero from empty or unread movements',()=>{
    for(const movimientos of [[],undefined]){const d=abierta();d.cantidades!.movimientos=movimientos;const r=ejecutarCostosAplicacion({aplicacion_id:A},d,'p1','2026-11-05');expect(r.ejecucion!.total).toBeNull();}
  });
  it('rejects a mismatched quantity parent and an unread current application state',()=>{
    const d=abierta();d.cantidades!.aplicacion={...d.aplicacion!,id:id(99)};expect(ejecutarCostosAplicacion({aplicacion_id:A},d,'p1','2026-11-05').ejecucion!.total).toBeNull();
    delete d.aplicacion!.estado;expect(ejecutarCostosAplicacion({aplicacion_id:A},d,'p1','2026-11-05').estado).toBe('no_disponible');
  });
  it('withholds complete execution cost when another selected movement has no product rows',()=>{
    const d=abierta();d.cantidades!.movimientos!.push({id:id(90),aplicacion_id:A,lote_id:null,fecha_movimiento:'2026-11-02',numero_bultos:1});
    const r=ejecutarCostosAplicacion({aplicacion_id:A},d,'p1','2026-11-05');expect(r.ejecucion!.total).toBeNull();expect(r.ejecucion!.subtotal_conocido).toBe(35);
  });
  it('includes the full application UUID only when the visible name collides',()=>{
    const d=cerrada();d.aplicacion_nombre_repetido=true;expect(renderCostosAplicacion(ejecutarCostosAplicacion({aplicacion_id:A},d,'p1','2026-11-05'))).toContain(A);
  });

  it('does not value an open base if the separately read quantity parent has become closed',()=>{
    const d=abierta();d.cantidades!.aplicacion={...d.aplicacion!,estado:'Cerrada'};
    expect(ejecutarCostosAplicacion({aplicacion_id:A},d,'p1','2026-11-05').ejecucion!.total).toBeNull();
  });

});
