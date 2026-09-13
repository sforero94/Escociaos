// ARCHIVO: components/hato/hooks/useUltimaCapturaFoto.ts
// DESCRIPCIÓN: lee la ÚLTIMA fila de `hato_capturas_foto` (migración 146)
// de un tipo de planilla, para la línea "Última captura" de la tarjeta de
// Pesaje (hallazgo ESCO-76).
//
// Solo I/O -- la interpretación (qué dice esa fila, y cuándo decir "sin
// dato" en vez de 0) vive en `@/utils/hato/capturasFoto.ts`, puro y con
// tests.
//
// `getSupabase() as any` por la misma razón que el resto de los hooks del
// módulo: `src/types/database.ts` está desactualizado y no conoce ninguna
// tabla `hato_*` (follow-up #3 del contrato del módulo).
//
// Un fallo de lectura NUNCA rompe la tarjeta: deja `captura` en `null`, que
// la UI muestra como "sin dato". La tarjeta sirve para imprimir la planilla
// y subir la foto; no puede caerse porque el registro de intentos no
// responda.

import { useCallback, useEffect, useState } from 'react';
import { getSupabase } from '@/utils/supabase/client';
import {
  normalizarCapturaFoto,
  type CapturaFotoResumen,
  type FilaCapturaFotoDb,
  type TipoCapturaFoto,
} from '@/utils/hato/capturasFoto';

const COLUMNAS =
  'id, tipo, desenlace, creado_en, celdas_leidas_ocr, celdas_confirmadas, filas_escritas, fotos_recibidas, storage_ok, detalle';

export function useUltimaCapturaFoto(tipo: TipoCapturaFoto) {
  const [captura, setCaptura] = useState<CapturaFotoResumen | null>(null);
  const [loading, setLoading] = useState(true);

  const recargar = useCallback(async () => {
    setLoading(true);
    try {
      const supabase = getSupabase() as any;
      const { data, error } = await supabase
        .from('hato_capturas_foto')
        .select(COLUMNAS)
        .eq('tipo', tipo)
        .order('creado_en', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      setCaptura(normalizarCapturaFoto(data as FilaCapturaFotoDb | null));
    } catch (err) {
      console.error('[hato_capturas_foto] no se pudo leer la última captura', err);
      setCaptura(null);
    } finally {
      setLoading(false);
    }
  }, [tipo]);

  useEffect(() => {
    void recargar();
  }, [recargar]);

  return { captura, loading, recargar };
}
