import {describe,it,expect} from 'vitest';
import {motivoRechazoIntencion,instruccionReintentoIntencion} from '../utils/esco2/intencionReintento.ts';
import {ErrorPlan} from '../utils/esco2/registro.ts';
import {ErrorLLM} from '../utils/esco2/llm.ts';
describe('Loop I0 F2 razones cerradas del extractor',()=>{
 it('clasifica JSON y rango mediante códigos propios',()=>{
  expect(motivoRechazoIntencion(new SyntaxError('PRIVATE_INVALID_PAYLOAD'))).toBe('json_no_valido');
  expect(motivoRechazoIntencion(new ErrorPlan('intencion_no_valida:evidencia_actual'))).toBe('evidencia_actual');
 });
 it('no convierte transporte o recibo desconocido en un error reparable de esquema',()=>expect(motivoRechazoIntencion(new ErrorLLM('UNKNOWN_RECEIPT'))).toBeNull());
 it('una razón desconocida nunca refleja texto de la salida rechazada',()=>{
  const code=motivoRechazoIntencion(new ErrorPlan('intencion_no_valida:PRIVATE_INVALID_PAYLOAD'));
  expect(code).toBe('forma');expect(instruccionReintentoIntencion(code!)).not.toContain('PRIVATE_INVALID_PAYLOAD');
  expect(instruccionReintentoIntencion(code!)).toContain('intencion_no_valida:forma');
 });
});
