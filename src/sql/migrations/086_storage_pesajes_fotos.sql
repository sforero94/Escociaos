-- Migración 086: bucket privado `hato-pesajes-fotos` + políticas RLS.
--
-- CONTEXTO (S5, docs/plan_hato_ronda_agosto_2026.md): la ruta de carga de la
-- planilla MENSUAL de pesaje POR FOTO (`POST
-- /make-server-1ccce916/hato/pesaje/foto`) recibe 1..N imágenes de la
-- planilla diligenciada a mano. Esa foto ES la capa cruda de la ruta -- el
-- mismo criterio que ya justificó `chequeos-fotos` (migración 072) y
-- `hato-liquidaciones-fotos` (migración 085): es la evidencia contra la cual
-- se audita cualquier duda posterior sobre lo que el OCR leyó, así que se
-- guarda SIEMPRE, aunque la lectura falle.
--
-- BUCKET PROPIO, no se reusa ninguno de los otros dos: la planilla de pesaje
-- es otro dominio, con otro ciclo de vida y (a diferencia del chequeo) sin
-- chapeta -- mismo argumento de aislamiento que ya se aplicó dos veces en
-- este módulo.
--
-- QUIÉN ESCRIBE Y QUIÉN LEE (idéntico a 072):
--   - El endpoint sube con la SERVICE ROLE key, que ignora RLS -- las
--     políticas de INSERT de abajo no son las que habilitan esa subida.
--     Existen para que, si algún día el frontend sube directo, el permiso
--     sea el mismo que el de escritura del módulo.
--   - El SELECT sí es imprescindible YA: la app podría generar URLs
--     firmadas (`createSignedUrl`) con la sesión del usuario para mostrar la
--     foto junto al diff.
--
-- ROLES: Administrador + Gerencia -- mismo set de escritura de todas las
-- tablas `hato_*` (patrón migración 044). El bucket es PRIVADO: la planilla
-- trae el hato completo de vacas en ordeño por nombre.
--
-- NO APLICADA a producción por esta sesión (backend, punto de parada del
-- brief S5) -- la aplica el main loop con el conector autenticado.

-- ---------------------------------------------------------------------------
-- 1. El bucket. Privado (`public = false`): nunca se sirve por URL directa.
-- ---------------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public)
VALUES ('hato-pesajes-fotos', 'hato-pesajes-fotos', false)
ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 2. Políticas. `DROP IF EXISTS` antes de cada `CREATE` para que la migración
--    sea re-ejecutable (mismo patrón que 019/039/072).
-- ---------------------------------------------------------------------------

-- Subir
DROP POLICY IF EXISTS "Hato: subir fotos de pesaje" ON storage.objects;
CREATE POLICY "Hato: subir fotos de pesaje"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'hato-pesajes-fotos' AND
  EXISTS (
    SELECT 1 FROM usuarios
    WHERE usuarios.id = auth.uid()
      AND usuarios.rol IN ('Administrador', 'Gerencia')
  )
);

-- Leer (necesario para `createSignedUrl` desde la app)
DROP POLICY IF EXISTS "Hato: leer fotos de pesaje" ON storage.objects;
CREATE POLICY "Hato: leer fotos de pesaje"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'hato-pesajes-fotos' AND
  EXISTS (
    SELECT 1 FROM usuarios
    WHERE usuarios.id = auth.uid()
      AND usuarios.rol IN ('Administrador', 'Gerencia')
  )
);

-- Actualizar (re-subida de una foto corregida)
DROP POLICY IF EXISTS "Hato: actualizar fotos de pesaje" ON storage.objects;
CREATE POLICY "Hato: actualizar fotos de pesaje"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'hato-pesajes-fotos' AND
  EXISTS (
    SELECT 1 FROM usuarios
    WHERE usuarios.id = auth.uid()
      AND usuarios.rol IN ('Administrador', 'Gerencia')
  )
);

-- Borrar. Deliberadamente GERENCIA SOLAMENTE, más estricto que el resto: la
-- foto es la capa cruda y la única evidencia de lo que decía el papel.
-- Borrarla destruye la trazabilidad del pesaje, así que no es una acción
-- operativa (mismo criterio que 072).
DROP POLICY IF EXISTS "Hato: eliminar fotos de pesaje" ON storage.objects;
CREATE POLICY "Hato: eliminar fotos de pesaje"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'hato-pesajes-fotos' AND
  EXISTS (
    SELECT 1 FROM usuarios
    WHERE usuarios.id = auth.uid()
      AND usuarios.rol = 'Gerencia'
  )
);
