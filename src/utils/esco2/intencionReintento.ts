import {ErrorPlan} from './registro.ts';
export const MAX_INTENTOS_EXTRACTOR=2;
export const MAX_LLAMADAS_MODELO_TURNO=4;
const CODIGOS=['forma','campo_no_registrado','obligacion','metrica_o_grupo','ultima_por_entidad','ranking','comparacion','evidencia','evidencia_actual','evidencia_historial','poblacion','selector','dependencia','filtros','filtro','periodo','condicion','sin_ancla_actual','residual','llamada_exclusiva','json_no_valido','salida_truncada'] as const;
export type MotivoRechazoIntencion=typeof CODIGOS[number];
/** Non-contract errors have no retry code: transport uncertainty stops the turn. */
export function motivoRechazoIntencion(error:unknown):MotivoRechazoIntencion|null{
 if(error instanceof SyntaxError)return 'json_no_valido';
 if(!(error instanceof ErrorPlan))return null;
 const codigo=error.message.startsWith('intencion_no_valida:')?error.message.slice('intencion_no_valida:'.length):'forma';
 return (CODIGOS as readonly string[]).includes(codigo)?codigo as MotivoRechazoIntencion:'forma';
}
const INDICACIONES:Partial<Record<MotivoRechazoIntencion,string>>={
 json_no_valido:'Devuelve argumentos JSON válidos en declarar_intencion.',
 llamada_exclusiva:'Llama únicamente declarar_intencion, una sola vez.',
 salida_truncada:'La salida debe estar completa dentro del límite y cumplir el esquema.',
 evidencia_actual:'Usa intervalos válidos del texto del mensaje actual.',
 evidencia_historial:'Solo puedes referenciar intervalos de mensajes anteriores del usuario.',
 sin_ancla_actual:'Incluye al menos una referencia de rango al mensaje actual.',
 selector:'Conserva una sola clase de selector explícito y sus valores.',
 dependencia:'Una población derivada solo puede referenciar obligaciones anteriores válidas.',
 condicion:'Usa métricas numéricas registradas y la unidad exacta de cada una.',
 periodo:'Conserva fechas calendario válidas, inclusivas, con su base temporal.',
};
export function instruccionReintentoIntencion(motivo:MotivoRechazoIntencion):string{
 return `intencion_no_valida:${motivo}. ${INDICACIONES[motivo]??'Conserva todas las obligaciones y usa únicamente los campos, valores y límites del contrato registrado.'} Reintenta una sola vez la extracción del último mensaje del usuario. No elabores un plan ni calcules datos. La salida rechazada no constituye contexto.`;
}
