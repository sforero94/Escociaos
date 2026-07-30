-- Migración 072: bucket privado `chequeos-fotos` + políticas RLS.
--
-- CONTEXTO (docs/plan_chequeo_captura_foto.md, Fase 3b): la ruta de carga del
-- chequeo POR FOTO (`POST /make-server-1ccce916/hato/chequeo/foto`) recibe 1..N
-- imágenes de la planilla diligenciada a mano. Esa foto ES la capa cruda de la
-- ruta -- el equivalente exacto de las columnas `*_raw` de
-- `hato_chequeo_vacas` en la ruta `.xlsx`: es la evidencia contra la cual se
-- audita cualquier duda posterior sobre lo que el OCR leyó. Por eso se guarda
-- SIEMPRE, aunque la lectura falle, y por eso necesita su propio bucket en vez
-- de colgarse de `facturas` (otro dominio, otro ciclo de vida, otras personas).
--
-- QUIÉN ESCRIBE Y QUIÉN LEE:
--   - El endpoint sube con la SERVICE ROLE key, que ignora RLS -- así que las
--     políticas de INSERT de abajo NO son las que habilitan la subida del
--     endpoint. Existen para que, si algún día el frontend sube directo (o
--     alguien re-sube una foto desde la ventana de corrección), el permiso sea
--     el mismo que el de escritura del módulo.
--   - El SELECT sí es imprescindible YA: la app genera URLs firmadas
--     (`createSignedUrl`) con la sesión del usuario para mostrar la foto junto
--     al diff, y eso pasa por RLS.
--
-- ROLES: Administrador + Gerencia -- el mismo set de escritura de todas las
-- tablas `hato_*` (patrón de la migración 044) y el mismo que exige el
-- endpoint. El bucket es PRIVADO: la planilla trae el hato completo con
-- nombres, estado reproductivo y tratamientos.
--
-- NO APLICADA a producción por esta sesión (la aplica el main loop).

-- ---------------------------------------------------------------------------
-- 1. El bucket. Privado (`public = false`): nunca se sirve por URL directa,
--    siempre por URL firmada de vida corta.
-- ---------------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public)
VALUES ('chequeos-fotos', 'chequeos-fotos', false)
ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 2. Políticas. `DROP IF EXISTS` antes de cada `CREATE` para que la migración
--    sea re-ejecutable (mismo patrón que 019/039).
-- ---------------------------------------------------------------------------

-- Subir
DROP POLICY IF EXISTS "Hato: subir fotos de chequeo" ON storage.objects;
CREATE POLICY "Hato: subir fotos de chequeo"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'chequeos-fotos' AND
  EXISTS (
    SELECT 1 FROM usuarios
    WHERE usuarios.id = auth.uid()
      AND usuarios.rol IN ('Administrador', 'Gerencia')
  )
);

-- Leer (necesario para `createSignedUrl` desde la app)
DROP POLICY IF EXISTS "Hato: leer fotos de chequeo" ON storage.objects;
CREATE POLICY "Hato: leer fotos de chequeo"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'chequeos-fotos' AND
  EXISTS (
    SELECT 1 FROM usuarios
    WHERE usuarios.id = auth.uid()
      AND usuarios.rol IN ('Administrador', 'Gerencia')
  )
);

-- Actualizar (re-subida de una foto corregida)
DROP POLICY IF EXISTS "Hato: actualizar fotos de chequeo" ON storage.objects;
CREATE POLICY "Hato: actualizar fotos de chequeo"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'chequeos-fotos' AND
  EXISTS (
    SELECT 1 FROM usuarios
    WHERE usuarios.id = auth.uid()
      AND usuarios.rol IN ('Administrador', 'Gerencia')
  )
);

-- Borrar. Deliberadamente GERENCIA SOLAMENTE, más estricto que el resto: la
-- foto es la capa cruda y la única evidencia de lo que decía el papel. Borrarla
-- destruye la trazabilidad del chequeo, así que no es una acción operativa.
DROP POLICY IF EXISTS "Hato: eliminar fotos de chequeo" ON storage.objects;
CREATE POLICY "Hato: eliminar fotos de chequeo"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'chequeos-fotos' AND
  EXISTS (
    SELECT 1 FROM usuarios
    WHERE usuarios.id = auth.uid()
      AND usuarios.rol = 'Gerencia'
  )
);
