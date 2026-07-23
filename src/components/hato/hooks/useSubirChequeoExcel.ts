// ARCHIVO: components/hato/hooks/useSubirChequeoExcel.ts
// DESCRIPCIÓN: Sube un .xlsx de chequeo a
// `POST /make-server-1ccce916/hato/chequeo/preview` (B0/V10 -- el ÚNICO
// camino de entrada del chequeo desde D-4, 2026-07-22: no hay internet en la
// finca, así que el chequeo nunca se captura directo en la app). El endpoint
// SOLO devuelve un diff para aprobar -- nunca comete un INSERT/UPDATE, ver
// `src/supabase/functions/server/hato-chequeo-preview.ts`.
//
// Mismo patrón de auth que `ClimaCard.tsx`: `Authorization: Bearer
// <session.access_token>` (JWT del usuario, no el anon key -- el endpoint
// exige rol Administrador/Gerencia).
//
// ⚠️ LIMITACIÓN CONOCIDA (documentada en el reporte de S4, no silenciada
// aquí): la respuesta de este endpoint trae `diffChequeos.filas` --
// clasificación + SOLO los campos que cambiaron -- pero NO la fila
// normalizada completa (`raw`/`sx`/fechas de servicio) que se necesitaría
// para escribir `hato_chequeo_vacas` (capa cruda + normalizada completa) y
// derivar `hato_eventos` con `descomponerSX`. Por eso este hook expone el
// diff para revisión pero NO implementa una función de "aprobar y escribir":
// escribir con los datos parciales disponibles violaría la regla de "la capa
// cruda conserva la planilla verbatim" (CLAUDE.md, sección Hato Lechero) en
// vez de solo dejarlo pendiente. Ver el reporte de la sesión para el cambio
// de contrato de API necesario.

import { useState, useCallback } from 'react';
import { getSupabase } from '@/utils/supabase/client';
import { projectId } from '@/utils/supabase/info.tsx';
import type { ResultadoDiffChequeo } from '@/utils/importHato/diffChequeo';
import type { ManifiestoHoja, FilaTerneraNormalizada, FilaSubtablaNormalizada } from '@/utils/importHato/tipos';

const EDGE_FUNCTION_BASE = `https://${projectId}.supabase.co/functions/v1`;

export interface PreviewChequeoRespuesta {
  success: true;
  archivo: string;
  generadoEn: string;
  hojas: ManifiestoHoja[];
  diffChequeos: ResultadoDiffChequeo;
  terneras: FilaTerneraNormalizada[];
  subtablas: FilaSubtablaNormalizada[];
}

export function useSubirChequeoExcel() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resultado, setResultado] = useState<PreviewChequeoRespuesta | null>(null);

  const subir = useCallback(async (archivo: File) => {
    setLoading(true);
    setError(null);
    setResultado(null);
    try {
      const supabase = getSupabase();
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        throw new Error('Sesión no válida -- vuelve a iniciar sesión e intenta de nuevo.');
      }

      const formData = new FormData();
      formData.append('archivo', archivo);

      const res = await fetch(`${EDGE_FUNCTION_BASE}/make-server-1ccce916/hato/chequeo/preview`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${session.access_token}` },
        body: formData,
      });

      const body = await res.json();
      if (!res.ok || !body?.success) {
        throw new Error(body?.error || `El servidor respondió ${res.status} al procesar el archivo.`);
      }

      setResultado(body as PreviewChequeoRespuesta);
      return body as PreviewChequeoRespuesta;
    } catch (err) {
      const mensaje = err instanceof Error ? err.message : 'Error desconocido subiendo el chequeo';
      setError(mensaje);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const limpiar = useCallback(() => {
    setResultado(null);
    setError(null);
  }, []);

  return { subir, limpiar, loading, error, resultado };
}
