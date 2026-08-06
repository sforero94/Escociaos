// ARCHIVO: components/hato/hooks/useOcrLiquidacionPomar.ts
// DESCRIPCIÓN: Sube 1..3 fotos de la liquidación quincenal de El Pomar a
// `POST /make-server-1ccce916/hato/produccion/quincena/foto` (S4,
// docs/plan_hato_ronda_agosto_2026.md D-8) y devuelve los campos
// interpretados para precargar `ProduccionQuincenalForm`. El endpoint NUNCA
// escribe en tablas de dominio -- el guardado real sigue pasando por
// `fn_hato_guardar_quincena_venta` cuando Gerencia confirma el formulario.
//
// Mismo patrón de auth que `useSubirChequeoExcel.ts`/`ClimaCard.tsx`:
// `Authorization: Bearer <session.access_token>`.

import { useState, useCallback } from 'react';
import { getSupabase } from '@/utils/supabase/client';
import { projectId } from '@/utils/supabase/info.tsx';

const EDGE_FUNCTION_BASE = `https://${projectId}.supabase.co/functions/v1`;

export type CampoLiquidacionOcr =
  | 'proveedor'
  | 'nit'
  | 'mes'
  | 'quincena'
  | 'periodo'
  | 'precioPromedio'
  | 'cantidad'
  | 'subtotal';

export interface DocumentoLiquidacionOcr {
  proveedor: string | null;
  nit: string | null;
  mes: number | null;
  mesNombre: string | null;
  quincena: 1 | 2 | null;
  periodoInicio: string | null;
  periodoFin: string | null;
  precioPromedioLitro: number | null;
  cantidadLitros: number | null;
  subtotal: number | null;
  camposNoConfiables: CampoLiquidacionOcr[];
}

export interface RespuestaOcrLiquidacionPomar {
  success: true;
  generadoEn: string;
  documento: DocumentoLiquidacionOcr;
  ocr: {
    modelo: string;
    fotos: { pagina: number; nombre: string; bytes: number }[];
    almacenamiento: { bucket: string; ok: boolean; errores: string[] };
    paginasNoLeidas: string[];
    camposNoConfiables: CampoLiquidacionOcr[];
    advertencias: string[];
    resumen: { fotosRecibidas: number; fotosLeidas: number; camposNoConfiables: number; campos: number };
  };
}

export function useOcrLiquidacionPomar() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resultado, setResultado] = useState<RespuestaOcrLiquidacionPomar | null>(null);

  const leerFotos = useCallback(async (fotos: File[]) => {
    setLoading(true);
    setError(null);
    setResultado(null);
    try {
      const supabase = getSupabase();
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session?.access_token) {
        throw new Error('Sesión no válida -- vuelve a iniciar sesión e intenta de nuevo.');
      }

      const formData = new FormData();
      fotos.forEach((f) => formData.append('fotos', f));

      const res = await fetch(`${EDGE_FUNCTION_BASE}/make-server-1ccce916/hato/produccion/quincena/foto`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${session.access_token}` },
        body: formData,
      });

      const body = await res.json();
      if (!res.ok || !body?.success) {
        throw new Error(body?.error || `El servidor respondió ${res.status} al leer la liquidación.`);
      }

      setResultado(body as RespuestaOcrLiquidacionPomar);
      return body as RespuestaOcrLiquidacionPomar;
    } catch (err) {
      const mensaje = err instanceof Error ? err.message : 'Error desconocido leyendo la liquidación';
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

  return { leerFotos, limpiar, loading, error, resultado };
}
