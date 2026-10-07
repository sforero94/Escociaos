-- Solo lectura. No garantiza totalidad de un lote sin historial de ejecución.
WITH candidatos AS (
  SELECT id, 'estado_actual'::text evidencia
    FROM public.hato_animales WHERE fecha_estado = DATE '2026-08-11'
  UNION
  SELECT id, 'respaldo_153'
    FROM respaldos.backup_153_hato_animales
   WHERE estado = 'descartada' AND fecha_estado = DATE '2026-08-11'
  UNION
  SELECT fila_id, 'historial'
    FROM public.hato_correcciones
   WHERE tabla = 'hato_animales'
     AND ((datos_anteriores->>'estado' = 'descartada'
           AND datos_anteriores->>'fecha_estado' = '2026-08-11')
       OR (datos_nuevos->>'estado' = 'descartada'
           AND datos_nuevos->>'fecha_estado' = '2026-08-11'))
)
SELECT a.id, a.numero, a.nombre, a.estado, a.fecha_estado,
       array_agg(DISTINCT c.evidencia ORDER BY c.evidencia) fuentes,
       (SELECT count(*) FROM public.hato_eventos e WHERE e.animal_id = a.id) eventos,
       (SELECT count(*) FROM public.hato_chequeo_vacas v WHERE v.animal_id = a.id) chequeos,
       (SELECT count(*) FROM public.hato_pesajes_leche p WHERE p.animal_id = a.id) pesajes,
       (SELECT count(*) FROM public.hato_tratamientos t WHERE t.animal_id = a.id) tratamientos
  FROM candidatos c JOIN public.hato_animales a ON a.id = c.id
 GROUP BY a.id, a.numero, a.nombre, a.estado, a.fecha_estado
 ORDER BY a.numero;
