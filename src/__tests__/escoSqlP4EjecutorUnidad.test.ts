import { expect, it, vi } from 'vitest';
import { ejecutorSqlSupabase } from '../../supabase/functions/esco-consultas/manejadorSql.ts';
it('preserva solo motivos cerrados de validación para reformular', async () => {
  const rpc=vi.fn(async()=>({data:null,error:{code:'22023',message:'columna_no_admitida'}}));
  await expect(ejecutorSqlSupabase({rpc})('SELECT 1 AS total')).rejects.toMatchObject({codigo:'22023',message:'columna_no_admitida'});
});
it('un texto inesperado de validación no se vuelve mensaje del modelo', async () => {
  const rpc=vi.fn(async()=>({data:null,error:{code:'22023',message:'detalle inesperado sintético'}}));
  await expect(ejecutorSqlSupabase({rpc})('SELECT 1 AS total')).rejects.toMatchObject({codigo:'22023',message:'consulta_no_admitida'});
});
