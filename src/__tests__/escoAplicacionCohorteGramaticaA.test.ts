import { describe, expect, it } from 'vitest';
import { pideComparacionFechasCohorte, pideFechasPlaneadas, planRespuestaAplicacion } from '../utils/escoConsultas';
describe('registered date pair grammar without prompt matching',()=>{
 it.each([
  'En esas aplicaciones, ¿hay diferencias entre las fechas planeadas y las fechas reales? Muéstralas sin corregir ningún registro.',
  'Compara las fechas planeadas y reales de esas aplicaciones.',
  'Compara la fecha planeada y real de esas aplicaciones.',
  'Muéstrame las fechas actuales frente a las planeadas de esas mismas aplicaciones.',
  'Compara las fechas reales y las planeadas de las aplicaciones que mostraste.',
  'Para estas aplicaciones, muéstrame las fechas reales junto a las fechas planificadas.',
  'Dame las fechas planeadas y las fechas de ejecución de las mismas aplicaciones.',
  'Quiero ver las fechas reales y planeadas de aquellas aplicaciones.',
  'Presenta las fechas planificadas y reales de dichas aplicaciones.',
  'Muestra las fechas reales y planeadas de las aplicaciones del listado.',
  'Compara fechas planeadas y reales en esas aplicaciones sin calcular duración.',
 ])('accepts components in different orders: %s',question=>expect(pideComparacionFechasCohorte(question)).toBe(true));
 it.each([
  'Compara fechas reales y planeadas de esas aplicaciones y explica por qué cambiaron.',
  'Compara fechas planeadas y reales de estas aplicaciones y calcula la duración.',
  'Dame las fechas planeadas y reales de esas aplicaciones con sus causas.',
  'Dame los días de retraso entre fechas planeadas y reales de esas aplicaciones.',
  'Compara el consumo real con las dosis planeadas de esas aplicaciones.',
  'Compara fechas planeadas y reales de esas aplicaciones y su cumplimiento.',
  'Compara fechas planeadas y reales de esas aplicaciones y corrige las fechas.',
  'Dame solo las fechas reales de esas aplicaciones.',
  'Dame fechas planeadas y reales de esos productos.',
  'Fechas planeadas y reales de esas aplicaciones.',
  'Compara las fechas planeadas y reales de la aplicación singular.',
 ])('does not extend the date operation: %s',question=>expect(pideComparacionFechasCohorte(question)).toBe(false));
});
describe('positive interrogative planned date basis',()=>{
 it.each([
  '¿Qué aplicaciones tienen fechas planeadas en abril de 2034?',
  '¿Cuáles aplicaciones tienen las fechas planificadas durante mayo de 2034?',
  '¿Qué fumigaciones con fechas planeadas para septiembre de 2034?',
  '¿Cuáles fertilizaciones tienen fechas de inicio planeadas entre el primero y el último día del mes?',
  'Solo lectura: ¿Qué aplicaciones tienen fechas planeadas en abril de 2034?',
 ])('recognizes direct planned questions: %s',q=>expect(pideFechasPlaneadas(q)).toBe(true));
 it.each([
  'Dame el estado de la aplicación cuya fecha planeada estaba mal.',
  '¿Qué aplicaciones cuya fecha planeada estaba mal están cerradas?',
  '¿Qué aplicaciones no tienen fechas planeadas en abril de 2034?',
  '¿Qué aplicaciones tienen fechas planeadas mal capturadas?',
  '¿Qué aplicaciones tienen fechas planeadas y reales en abril de 2034?',
  'Dame la fecha planeada y real de la aplicación sintética.',
  'No uses fechas planeadas; muestra las fechas reales de las aplicaciones.',
  '¿Qué aplicaciones tienen fechas planeadas en abril de 2034? No uses las fechas planeadas.',
 ])('does not grant planned basis from descriptions, denials or mixed dates: %s',q=>expect(pideFechasPlaneadas(q)).toBe(false));
});

 it.each(['¿Qué aplicaciones tienen fechas planeadas en abril de 2034?','¿Cuáles fumigaciones con fechas planificadas durante abril de 2034?'])('retains a verified planned plural collection in the legacy plan: %s',q=>{
  expect(planRespuestaAplicacion(q,'2034-05-08')).toMatchObject({tipo:'aplicacion',plural:true,base:'planned',rango:{desde:'2034-04-01',hasta:'2034-04-30'}});
 });
