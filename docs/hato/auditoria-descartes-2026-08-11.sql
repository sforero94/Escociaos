-- Solo lectura. No garantiza totalidad de un lote sin historial de ejecución.
-- Version posterior a 178: incluye la ficha espuria eliminada desde su respaldo.
WITH candidatos AS (
  SELECT id, 'estado_actual'::text evidencia
    FROM public.hato_animales WHERE fecha_estado = DATE '2026-08-11'
  UNION
  SELECT id, 'respaldo_153'
    FROM respaldos.backup_153_hato_animales
   WHERE estado = 'descartada' AND fecha_estado = DATE '2026-08-11'
  UNION
  SELECT id, 'respaldo_178_identidad_conciliada'
    FROM respaldos.backup_178_pacha_morocha
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
SELECT c.id, COALESCE(a.numero, b.numero) numero,
       COALESCE(a.nombre, b.nombre) nombre,
       a.estado, a.fecha_estado, a.id IS NULL ficha_retirada,
       array_agg(DISTINCT c.evidencia ORDER BY c.evidencia) fuentes,
       (SELECT count(*) FROM public.hato_eventos e WHERE e.animal_id = a.id) eventos,
       (SELECT count(*) FROM public.hato_chequeo_vacas v WHERE v.animal_id = a.id) chequeos,
       (SELECT count(*) FROM public.hato_pesajes_leche p WHERE p.animal_id = a.id) pesajes,
       (SELECT count(*) FROM public.hato_tratamientos t WHERE t.animal_id = a.id) tratamientos
  FROM candidatos c
  LEFT JOIN public.hato_animales a ON a.id = c.id
  LEFT JOIN respaldos.backup_178_pacha_morocha b ON b.id = c.id
 GROUP BY c.id, a.id, a.numero, a.nombre, a.estado, a.fecha_estado, b.numero, b.nombre
 ORDER BY numero;
