-- Local synthetic database only. Run before and after draft migration188.
CREATE TABLE public.aplicaciones (
 id text PRIMARY KEY, nombre text,
 fecha_inicio_planeada date, fecha_fin_planeada date,
 fecha_inicio_ejecucion date, fecha_fin_ejecucion date
);
INSERT INTO aplicaciones VALUES ('legacy', 'legacy synthetic', '2031-05-10', '2031-05-01', NULL, NULL);
