import {saleCorrectionFixture,OWNER,OTHER,KEY} from './financialSaleCorrection';
import type {GeneralCorrectionResult,GeneralCorrectionSource,GeneralCorrectionIntent,GeneralCorrectionPlan} from '@/utils/hato/financialGeneralCorrectionProtocol';
export {OWNER,OTHER,KEY};
export const TARGET='93000000-0000-4000-8000-000000000001';
export function generalCorrectionFixture(state:'pending'|'committed'='committed',shared=true):GeneralCorrectionResult{
 const old=saleCorrectionFixture(state),s=old.original!;
 const aliases=shared?[1,2].map(n=>({id:`94000000-0000-4000-8000-00000000000${n}`,anio:2093,mes:n,quincena:1,fecha_inicio:null,fecha_fin:null,litros_total:4,litros_pomar_confirmado:null,num_vacas_ordeno:null,notas:'Retained monthly history',fuente:'backfill',created_at:'2026-10-23T00:00:00+00:00',created_by:OWNER,fin_ingreso_id:TARGET,origen_dato:'derivado_mensual',num_vacas_ordeno_origen:null,updated_at:null,updated_by:null,precio_bruto_litro:null})):[];
 const source:GeneralCorrectionSource={production:null,income:{...s.income,id:TARGET},beforeRefs:s.beforeRefs,refs:s.refs,aliases};
 const intent:GeneralCorrectionIntent={version:1,kind:'generalFinancial',targetId:TARGET,fields:old.intent!.fields,observed:source};
 const plan:GeneralCorrectionPlan={...old.plan!,kind:'generalFinancial',beforeIncome:source.income,afterIncome:{...old.plan!.afterIncome,id:TARGET}};
 const receipt=old.receipt?{...old.receipt,intent,original:source,plan,before:{production:null,income:source.income},after:{production:null,income:{...plan.afterIncome,updated_at:old.receipt.recordedAt}}}:null;
 return JSON.parse(JSON.stringify({...old,intent,original:source,plan,receipt}));
}
