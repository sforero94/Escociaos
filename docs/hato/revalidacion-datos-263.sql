-- Solo lectura; no reaplicar 147, 153 ni 176.
WITH dias AS (
  SELECT coalesce(empleado_id, contratista_id) persona, fecha_trabajo,
         sum(fraccion_jornal::text::numeric) total
    FROM public.registros_trabajo
   GROUP BY coalesce(empleado_id, contratista_id), fecha_trabajo
), esperados(id, fecha) AS (
  VALUES
    ('62752808-3578-4063-a50f-2ee129af391c'::uuid, DATE '2026-09-01'),
    ('55acb180-10c9-4f65-88f7-7bbaade449ac'::uuid, DATE '2026-09-01'),
    ('f0f55d40-8b53-47d0-b4e6-ee719138677d'::uuid, DATE '2026-09-01'),
    ('945449bb-e942-4bb4-a9e4-630fd4e86eef'::uuid, DATE '2026-09-02'),
    ('7333a0d9-db02-4e8d-b25e-ca0f66eef50b'::uuid, DATE '2026-09-02'),
    ('2b8bc08f-dc86-4279-aabc-cc3d6de6d0da'::uuid, DATE '2026-09-02'),
    ('b509c8fb-79e5-46f6-9895-dfeab4d0eee0'::uuid, DATE '2026-06-29'),
    ('2feb80b5-dc92-4af5-a0ae-b6c95c6789ad'::uuid, DATE '2026-03-09'),
    ('716fead3-9d00-4235-9099-01e7ed496c42'::uuid, DATE '2026-04-09'),
    ('3e623fae-1240-4668-97fd-afa7b3bad4fc'::uuid, DATE '2026-05-09'),
    ('4242c49c-0dda-484a-af9c-f4e17a9b2342'::uuid, DATE '2026-04-09')
)
SELECT
  (SELECT count(*) FROM dias WHERE total > 1.0001) dias_persona_exceso,
  (SELECT count(*) FROM dias WHERE fecha_trabajo = '2026-09-10' AND total > 1.0001) excesos_septiembre10,
  (SELECT count(*) FROM esperados x JOIN public.hato_eventos e ON e.id = x.id AND e.fecha = x.fecha AND e.tipo = 'servicio') fechas_correctas_de_11,
  (SELECT md5(p.prosrc) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public' AND p.proname = 'fn_ronda_resolver_con_captura') checksum_rpc147,
  (SELECT jsonb_agg(jsonb_build_object('version',version,'name',name)) FROM supabase_migrations.schema_migrations WHERE name LIKE '147%' OR name = 'correccion_chequeo_2026_09_08' OR name LIKE '176%') ledger;
