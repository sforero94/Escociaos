import {expect,it} from 'vitest';
import {resolverSeleccionAplicacion,type SolicitudAplicacion} from '../utils/escoConsultas';

const apps=[{id:'app-sol',nombre_aplicacion:'Aplicación Sol',fecha_inicio_ejecucion:'2034-05-02'},{id:'app-luna',nombre_aplicacion:'Aplicación Luna',fecha_inicio_ejecucion:'2034-05-03'}];
const lots=[{id:'lot-north',nombre:'Norte'},{id:'lot-south',nombre:'Sur'}];
const select=(anchorQuestion:string,currentQuestion='¿Y los jornales de esa aplicación?',a=apps,l=lots)=>resolverSeleccionAplicacion({pregunta:currentQuestion,referenciaUsuario:{anchorQuestion,currentQuestion}},a,l,false);
it('binds the original USER anchor after chained metric phrases without treating them as a name',()=>{
 expect(select('Estado de la aplicación Sol en el lote Norte del 2034-05-01 al 2034-05-07')).toMatchObject({estado:'verificada',aplicacion_ids:['app-sol'],lote_ids:['lot-north']});
});
it('preserves a contradictory USER application ID rather than erasing it during binding',()=>{
 expect(select('Estado de la aplicación Sol en el lote Norte con ID app-luna')).toMatchObject({estado:'aclarar'});
 expect(select('Estado de la aplicación Sol con ID app-sol')).toMatchObject({estado:'verificada',aplicacion_ids:['app-sol']});
 expect(select('Estado de la aplicación Sol','¿Y los jornales de esa aplicación con ID app-luna?')).toMatchObject({estado:'aclarar'});
 expect(select('Estado de la aplicación Sol','¿Y los jornales de esa aplicación con ID unknown-app?')).toMatchObject({estado:'aclarar'});
 expect(select('Estado de la aplicación Sol en el lote Norte','¿Y los jornales de esa aplicación con ID lot-north?')).toMatchObject({estado:'aclarar'});
});
it('uses the current explicit lot instead of a different prior lot',()=>{
 expect(select('Estado de la aplicación Sol en el lote Norte','Jornales de esa aplicación en el lote Sur')).toMatchObject({estado:'verificada',aplicacion_ids:['app-sol'],lote_ids:['lot-south']});
 expect(select('Estado de la aplicación Sol en el lote Norte','Jornales de esa aplicación en el lote Norte')).toMatchObject({estado:'verificada',lote_ids:['lot-north']});
});
it.each([
 ['Estado de la aplicación Sol sin lote Norte','¿Y los jornales de esa aplicación?'],
 ['Estado de la aplicación Sol en el lote Norte','Jornales de esa aplicación sin el lote Norte'],
 ['Estado de la aplicación Sol','Jornales de esa aplicación excepto la aplicación Luna'],
 ['Estado de la aplicación Sol en el lote Norte','Jornales de esa aplicación, excepto Norte'],
 ['Estado de la aplicación Sol en el lote Norte','Jornales de esa aplicación, sin Norte'],
 ['Estado de la aplicación Sol en el lote Norte','Jornales de esa aplicación, no incluyas Norte'],
])('never converts a negative population selector into inclusion', (anchor,current)=>{
 expect(select(anchor,current)).toMatchObject({estado:'aclarar'});
});
it('clarifies duplicate names and unknown/current conflicting lot identity',()=>{
 expect(select('Estado de la aplicación Sol',undefined,[...apps,{id:'app-sol-copy',nombre_aplicacion:'Aplicación Sol',fecha_inicio_ejecucion:'2034-05-02'}])).toMatchObject({estado:'aclarar'});
 expect(select('Estado de la aplicación Sol','Jornales de esa aplicación en el lote Sur con ID lot-north')).toMatchObject({estado:'aclarar'});
 expect(select('Estado de la aplicación Sol','Jornales de esa aplicación en el lote Inexistente')).toMatchObject({estado:'aclarar'});
});
it('does not obtain selector authority from proposed model arguments',()=>{
 const input:SolicitudAplicacion={pregunta:'¿Y los jornales de esa aplicación?',referenciaUsuario:{anchorQuestion:'Estado de la aplicación Sol',currentQuestion:'¿Y los jornales de esa aplicación?'}};
 expect(resolverSeleccionAplicacion(input,apps,lots,false)).toMatchObject({aplicacion_ids:['app-sol']});
});
