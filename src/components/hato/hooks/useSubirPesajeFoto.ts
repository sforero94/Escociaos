// ARCHIVO: components/hato/hooks/useSubirPesajeFoto.ts
// DESCRIPCIÓN: S5 de `docs/plan_hato_ronda_agosto_2026.md` -- sube 1..6
// fotos de la planilla MENSUAL de pesaje a `POST
// /make-server-1ccce916/hato/pesaje/foto` (preview, NUNCA escribe) y
// aprueba el diff resultante contra `POST
// /make-server-1ccce916/hato/pesaje/commit` (escribe en
// `hato_pesajes_leche`).
//
// Gemelo, simplificado, de `useSubirChequeoExcel.ts`: la planilla de pesaje
// no tiene ruta `.xlsx` (D-8, S4/S5 comparten el mismo patrón "foto primero,
// archivo=otra fuente de la misma foto" que ya usa
// `useOcrLiquidacionPomar.ts`), así que solo hay una función de subida, no
// dos. `anio`/`mes` son requeridos: la planilla ya imprime la fecha real de
// cada semana (`exportarPlanillaPesajePDF.ts`), quien sube la foto solo
// confirma qué mes está mirando.
//
// Mismo patrón de auth que `useSubirChequeoExcel.ts`/`ClimaCard.tsx`:
// `Authorization: Bearer <session.access_token>`.

import { useState, useCallback } from 'react';
import { getSupabase } from '@/utils/supabase/client';
import { projectId } from '@/utils/supabase/info.tsx';
import { leerCuerpoEdgeFunction } from '@/utils/supabase/respuestaEdgeFunction';
import type { CeldaDiffPesaje, SemanaPesaje } from '@/utils/importHato/ocrPesaje';
import { construirDiffPesajeManual, type AnimalPesajeManual } from '@/utils/hato/pesajeManual';

const EDGE_FUNCTION_BASE = `https://${projectId}.supabase.co/functions/v1`;

export interface FilaNoLeidaPesaje {
  pagina: number;
  orden: number;
  nombreImpreso: string;
  motivo: string;
  detalle: string;
}

export interface VacaSinLeerPesaje {
  id: string;
  nombre: string;
}

export interface ReporteOcrPesaje {
  modelo: string;
  fotos: { pagina: number; nombre: string; bytes: number }[];
  almacenamiento: { bucket: string; ok: boolean; errores: string[] };
  paginasNoLeidas: string[];
  filasNoLeidas: FilaNoLeidaPesaje[];
  vacasSinLeer: VacaSinLeerPesaje[];
  advertencias: string[];
  resumen: {
    vacasEnRoster: number;
    fotosRecibidas: number;
    fotosLeidas: number;
    filasConfirmadas: number;
    filasNoLeidas: number;
    vacasSinLeer: number;
    celdasNoConfiables: number;
  };
}

export interface PreviewPesajeRespuesta {
  success: true;
  generadoEn: string;
  anio: number;
  mes: number;
  fechasPorSemana: Record<SemanaPesaje, string | null>;
  diff: CeldaDiffPesaje[];
  ocr: ReporteOcrPesaje;
}

export interface CeldaRechazadaPesaje {
  animalId: string;
  fecha: string;
  motivo: string;
}

export interface CommitPesajeRespuesta {
  success: true;
  guardados: number;
  actualizados: number;
  creados: number;
  celdasRechazadas: CeldaRechazadaPesaje[];
}

/** Payload mínimo que necesita el commit -- ver `hato-pesaje-commit.ts`. */
export interface CeldaParaCommit {
  animalId: string;
  fecha: string;
  litrosAm: number | null;
  litrosPm: number | null;
}

export function useSubirPesajeFoto() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resultado, setResultado] = useState<PreviewPesajeRespuesta | null>(null);
  const [comprometiendo, setComprometiendo] = useState(false);
  const [errorCommit, setErrorCommit] = useState<string | null>(null);
  const [commitResultado, setCommitResultado] = useState<CommitPesajeRespuesta | null>(null);

  async function obtenerTokenSesion(): Promise<string> {
    const supabase = getSupabase();
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) {
      throw new Error('Sesión no válida -- vuelve a iniciar sesión e intenta de nuevo.');
    }
    return session.access_token;
  }

  const subirFotos = useCallback(async (fotos: File[], anio: number, mes: number) => {
    setLoading(true);
    setError(null);
    setResultado(null);
    setCommitResultado(null);
    setErrorCommit(null);
    try {
      const token = await obtenerTokenSesion();

      const formData = new FormData();
      fotos.forEach((f) => formData.append('fotos', f));
      formData.append('anio', String(anio));
      formData.append('mes', String(mes));

      const res = await fetch(`${EDGE_FUNCTION_BASE}/make-server-1ccce916/hato/pesaje/foto`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });

      const resultadoCuerpo = await leerCuerpoEdgeFunction<PreviewPesajeRespuesta & { error?: string }>(res);
      if (!resultadoCuerpo.ok) {
        throw new Error(resultadoCuerpo.mensaje);
      }
      const body = resultadoCuerpo.body;
      if (!res.ok || !body?.success) {
        throw new Error(body?.error || `El servidor respondió ${res.status} al leer las fotos.`);
      }

      setResultado(body as PreviewPesajeRespuesta);
      return body as PreviewPesajeRespuesta;
    } catch (err) {
      const mensaje = err instanceof Error ? err.message : 'Error desconocido leyendo las fotos del pesaje';
      setError(mensaje);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  /** Aprueba las celdas que el usuario confirmó (posiblemente corregidas a
   * mano, D-6) -- nunca reenvía la foto. `anio`/`mes` viajan de nuevo porque
   * el commit revalida `hato_config.dia_pesaje_semanal` en fresco (puede
   * haber cambiado desde la vista previa). */
  const comprometer = useCallback(async (celdas: CeldaParaCommit[], anio: number, mes: number) => {
    if (celdas.length === 0) throw new Error('No hay celdas para aprobar.');

    setComprometiendo(true);
    setErrorCommit(null);
    setCommitResultado(null);
    try {
      const token = await obtenerTokenSesion();
      const res = await fetch(`${EDGE_FUNCTION_BASE}/make-server-1ccce916/hato/pesaje/commit`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ anio, mes, celdas }),
      });

      const resultadoCuerpo = await leerCuerpoEdgeFunction<CommitPesajeRespuesta & { error?: string }>(res);
      if (!resultadoCuerpo.ok) {
        throw new Error(resultadoCuerpo.mensaje);
      }
      const body = resultadoCuerpo.body;
      if (!res.ok || !body?.success) {
        throw new Error(body?.error || `El servidor respondió ${res.status} al aprobar el pesaje.`);
      }

      setCommitResultado(body as CommitPesajeRespuesta);
      return body as CommitPesajeRespuesta;
    } catch (err) {
      setErrorCommit(err instanceof Error ? err.message : 'Error desconocido aprobando el pesaje');
      throw err;
    } finally {
      setComprometiendo(false);
    }
  }, []);

  /** Modo "Ingresar a mano" (UI rework de Producción, 2026-08-06) -- arma la
   * MISMA forma de `resultado` que devuelve `subirFotos`, pero con el diff
   * en blanco (`construirDiffPesajeManual`) y SIN llamar al endpoint de OCR.
   * `ocr.resumen.fotosRecibidas` queda en 0 a propósito: es lo que usa
   * `SubirPesajeFoto.tsx` para no mostrar el resumen de "lectura de fotos"
   * cuando no hubo ninguna.
   *
   * DEVUELVE la respuesta además de guardarla en el estado, igual que
   * `subirFotos`: el llamador necesita el diff en el mismo tick para sembrar
   * las filas de la grilla, y leerlo del estado obligaría a un `useEffect`
   * que volvería a sembrarlas cada vez que el usuario las edite. */
  const iniciarManual = useCallback((anio: number, mes: number, animales: AnimalPesajeManual[], fechasPorSemana: Record<SemanaPesaje, string | null>): PreviewPesajeRespuesta => {
    setError(null);
    setCommitResultado(null);
    setErrorCommit(null);
    const diff = construirDiffPesajeManual(animales, fechasPorSemana);
    const respuesta: PreviewPesajeRespuesta = {
      success: true,
      generadoEn: new Date().toISOString(),
      anio,
      mes,
      fechasPorSemana,
      diff,
      ocr: {
        modelo: 'manual',
        fotos: [],
        almacenamiento: { bucket: '', ok: true, errores: [] },
        paginasNoLeidas: [],
        filasNoLeidas: [],
        vacasSinLeer: [],
        advertencias: [],
        resumen: {
          vacasEnRoster: animales.length,
          fotosRecibidas: 0,
          fotosLeidas: 0,
          filasConfirmadas: animales.length,
          filasNoLeidas: 0,
          vacasSinLeer: 0,
          celdasNoConfiables: 0,
        },
      },
    };
    setResultado(respuesta);
    return respuesta;
  }, []);

  const limpiar = useCallback(() => {
    setResultado(null);
    setError(null);
    setCommitResultado(null);
    setErrorCommit(null);
  }, []);

  return {
    subirFotos,
    iniciarManual,
    comprometer,
    limpiar,
    loading,
    error,
    resultado,
    comprometiendo,
    errorCommit,
    commitResultado,
  };
}
