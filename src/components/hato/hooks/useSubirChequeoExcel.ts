// ARCHIVO: components/hato/hooks/useSubirChequeoExcel.ts
// DESCRIPCIÓN: Sube un .xlsx de chequeo a
// `POST /make-server-1ccce916/hato/chequeo/preview` (B0/V10 -- el ÚNICO
// camino de entrada del chequeo desde D-4, 2026-07-22: no hay internet en la
// finca, así que el chequeo nunca se captura directo en la app). El endpoint
// SOLO devuelve un diff para aprobar -- nunca comete un INSERT/UPDATE, ver
// `src/supabase/functions/server/hato-chequeo-preview.ts`.
//
// El paso "Aprobar" (`commit`) llama a
// `POST /make-server-1ccce916/hato/chequeo/commit`
// (`src/supabase/functions/server/hato-chequeo-commit.ts`) con SOLO las
// filas de `filasNormalizadas` cuya clasificación en `diffChequeos.filas` es
// `sin_cambio`/`cambio` -- `nuevo` y `no_reconocido` NUNCA se envían, ese es
// el mismo alcance duro que el endpoint revalida del lado del servidor
// (`validarFilasCommit`, `src/utils/importHato/commitChequeo.ts`) antes de
// escribir una sola fila.
//
// Mismo patrón de auth que `ClimaCard.tsx`: `Authorization: Bearer
// <session.access_token>` (JWT del usuario, no el anon key -- ambos
// endpoints exigen rol Administrador/Gerencia).

import { useState, useCallback } from 'react';
import { getSupabase } from '@/utils/supabase/client';
import { projectId } from '@/utils/supabase/info.tsx';
import type { ResultadoDiffChequeo } from '@/utils/importHato/diffChequeo';
import type { FilaChequeoNormalizada, ManifiestoHoja, FilaTerneraNormalizada, FilaSubtablaNormalizada } from '@/utils/importHato/tipos';
import type { FilaRechazadaCommit } from '@/utils/importHato/commitChequeo';

const EDGE_FUNCTION_BASE = `https://${projectId}.supabase.co/functions/v1`;

export interface PreviewChequeoRespuesta {
  success: true;
  archivo: string;
  generadoEn: string;
  /** Fecha del chequeo resuelta del manifiesto (`null` si no se pudo
   * resolver) -- precarga `chequeo.fecha` del commit sin que el cliente
   * tenga que re-derivarla. */
  chequeoFecha: string | null;
  hojas: ManifiestoHoja[];
  diffChequeos: ResultadoDiffChequeo;
  /** Filas normalizadas COMPLETAS (raw + capa normalizada + issues),
   * joinables al diff por `fila` -- lo que `commit()` necesita para
   * escribir sin volver a parsear el .xlsx. */
  filasNormalizadas: FilaChequeoNormalizada[];
  terneras: FilaTerneraNormalizada[];
  subtablas: FilaSubtablaNormalizada[];
}

export interface CommitChequeoRespuesta {
  success: true;
  chequeoId: string;
  filasEscritas: number;
  eventosEscritos: number;
  torosCreados: number;
}

/** Error del commit cuando el servidor rechaza por 409 (el hato cambió
 * entre la vista previa y la aprobación) -- trae la lista de filas
 * rechazadas para que la UI las señale, en vez de un mensaje genérico. */
export class ErrorCommitChequeoRechazado extends Error {
  filasRechazadas: FilaRechazadaCommit[];
  constructor(mensaje: string, filasRechazadas: FilaRechazadaCommit[]) {
    super(mensaje);
    this.name = 'ErrorCommitChequeoRechazado';
    this.filasRechazadas = filasRechazadas;
  }
}

export function useSubirChequeoExcel() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resultado, setResultado] = useState<PreviewChequeoRespuesta | null>(null);
  const [comprometiendo, setComprometiendo] = useState(false);
  const [errorCommit, setErrorCommit] = useState<string | null>(null);
  const [filasRechazadas, setFilasRechazadas] = useState<FilaRechazadaCommit[] | null>(null);
  const [commitResultado, setCommitResultado] = useState<CommitChequeoRespuesta | null>(null);

  async function obtenerTokenSesion(): Promise<string> {
    const supabase = getSupabase();
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) {
      throw new Error('Sesión no válida -- vuelve a iniciar sesión e intenta de nuevo.');
    }
    return session.access_token;
  }

  const subir = useCallback(async (archivo: File) => {
    setLoading(true);
    setError(null);
    setResultado(null);
    setCommitResultado(null);
    setErrorCommit(null);
    setFilasRechazadas(null);
    try {
      const token = await obtenerTokenSesion();

      const formData = new FormData();
      formData.append('archivo', archivo);

      const res = await fetch(`${EDGE_FUNCTION_BASE}/make-server-1ccce916/hato/chequeo/preview`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
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

  /**
   * Aprueba el diff actual (`resultado`): envía SOLO las filas
   * `sin_cambio`/`cambio` de `filasNormalizadas` al commit path. Filas
   * `nuevo` (sin ficha todavía) y `no_reconocido` nunca se incluyen -- la UI
   * las señala aparte (ver `ChequeoDiffReview`), no se aprueban en silencio.
   */
  const comprometer = useCallback(
    async (veterinario?: string) => {
      if (!resultado) throw new Error('No hay una vista previa cargada para aprobar.');
      if (!resultado.chequeoFecha) {
        throw new Error('No se pudo resolver la fecha del chequeo desde el archivo -- no se puede aprobar sin fecha.');
      }

      const filasPorNumero = new Map(resultado.filasNormalizadas.map((f) => [f.fila, f]));
      const filasAprobables = resultado.diffChequeos.filas
        .filter((f) => f.clasificacion === 'sin_cambio' || f.clasificacion === 'cambio')
        .map((f) => filasPorNumero.get(f.fila))
        .filter((f): f is FilaChequeoNormalizada => f !== undefined);

      if (filasAprobables.length === 0) {
        throw new Error('No hay filas sin_cambio/cambio para aprobar en este diff.');
      }

      setComprometiendo(true);
      setErrorCommit(null);
      setFilasRechazadas(null);
      setCommitResultado(null);
      try {
        const token = await obtenerTokenSesion();
        const res = await fetch(`${EDGE_FUNCTION_BASE}/make-server-1ccce916/hato/chequeo/commit`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            archivo: resultado.archivo,
            generadoEn: resultado.generadoEn,
            chequeo: { fecha: resultado.chequeoFecha, veterinario: veterinario ?? null },
            filas: filasAprobables,
          }),
        });

        const body = await res.json();
        if (res.status === 409 && Array.isArray(body?.filasRechazadas)) {
          throw new ErrorCommitChequeoRechazado(
            body.error || 'El hato cambió desde la vista previa -- revisa de nuevo antes de aprobar.',
            body.filasRechazadas as FilaRechazadaCommit[],
          );
        }
        if (!res.ok || !body?.success) {
          throw new Error(body?.error || `El servidor respondió ${res.status} al aprobar el chequeo.`);
        }

        setCommitResultado(body as CommitChequeoRespuesta);
        return body as CommitChequeoRespuesta;
      } catch (err) {
        if (err instanceof ErrorCommitChequeoRechazado) {
          setErrorCommit(err.message);
          setFilasRechazadas(err.filasRechazadas);
        } else {
          setErrorCommit(err instanceof Error ? err.message : 'Error desconocido aprobando el chequeo');
        }
        throw err;
      } finally {
        setComprometiendo(false);
      }
    },
    [resultado],
  );

  const limpiar = useCallback(() => {
    setResultado(null);
    setError(null);
    setCommitResultado(null);
    setErrorCommit(null);
    setFilasRechazadas(null);
  }, []);

  return {
    subir,
    comprometer,
    limpiar,
    loading,
    error,
    resultado,
    comprometiendo,
    errorCommit,
    filasRechazadas,
    commitResultado,
  };
}
