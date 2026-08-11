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
// filas cuya clasificación en el diff VIGENTE es `sin_cambio`/`cambio` --
// `nuevo` y `no_reconocido` NUNCA se envían, ese es el mismo alcance duro que
// el endpoint revalida del lado del servidor (`validarFilasCommit`,
// `src/utils/importHato/commitChequeo.ts`) antes de escribir una sola fila.
//
// Desde la Fase 3a (`docs/plan_chequeo_captura_foto.md`, ventana de
// corrección) las filas y la fecha pueden venir CORREGIDAS por un humano: ver
// `comprometer` y `useRevisionChequeo.ts`.
//
// Mismo patrón de auth que `ClimaCard.tsx`: `Authorization: Bearer
// <session.access_token>` (JWT del usuario, no el anon key -- ambos
// endpoints exigen rol Administrador/Gerencia).

import { useState, useCallback } from 'react';
import { getSupabase } from '@/utils/supabase/client';
import { projectId } from '@/utils/supabase/info.tsx';
import { leerCuerpoEdgeFunction } from '@/utils/supabase/respuestaEdgeFunction';
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
  /** SOLO en la ruta por FOTO (Fase 3b). Ausente cuando el chequeo vino de un
   * `.xlsx`. Es el reporte de calidad de la lectura: qué no se pudo leer y qué
   * se leyó con poca confianza. **Debe mostrarse siempre** -- sin esto, una
   * vaca que el OCR no encontró se ve idéntica a una vaca sin cambios, que es
   * exactamente el modo de fallo silencioso que el módulo prohíbe. */
  ocr?: ReporteOcrChequeo;
}

/** Reporte de calidad del OCR. Se tipa solo lo que la UI consume; el endpoint
 * devuelve más detalle (recortes por celda) que hoy nadie renderiza. */
export interface ReporteOcrChequeo {
  modelo: string;
  fotos: { pagina: number; nombre: string; bytes: number }[];
  almacenamiento: { bucket: string; ok: boolean; errores: string[] };
  /** Páginas cuya lectura falló entera (timeout, rechazo del proveedor…). */
  paginasNoLeidas: string[];
  /** Filas que el modelo leyó pero NO se pudieron anclar a una vaca del
   * roster: nunca se desplazan, se reportan. */
  filasNoLeidas: { pagina: number; numeroImpreso: string | null; nombreImpreso: string | null; motivo: string }[];
  /** Vacas activas que no aparecieron en ninguna foto -- así una página
   * faltante o una foto cortada se detecta sola. */
  vacasSinLeer: { numero: number | null; nombre: string | null; motivo: string }[];
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

      const resultadoCuerpo = await leerCuerpoEdgeFunction<PreviewChequeoRespuesta & { error?: string }>(res);
      if (!resultadoCuerpo.ok) {
        throw new Error(resultadoCuerpo.mensaje);
      }
      const body = resultadoCuerpo.body;
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
   * Fase 3b -- misma vista previa, pero desde FOTOS de la planilla impresa y
   * diligenciada a mano, en vez del `.xlsx`.
   *
   * Es deliberadamente un gemelo de `subir`: el endpoint `/hato/chequeo/foto`
   * devuelve la MISMA forma de respuesta que `/preview` (más un bloque `ocr`
   * con la confianza por celda y las filas que no ancló), justamente para que
   * la ventana de corrección, el commit y todo lo que sigue no distingan de
   * qué ruta vino el chequeo. El OCR reemplaza la lectura de la grilla, no el
   * pipeline.
   *
   * `fecha` es opcional y va cuando el usuario ya la fijó: la foto no trae
   * título parseable, así que sin ella el servidor devuelve `chequeoFecha:
   * null` y la ventana de corrección obliga a escribirla antes de aprobar
   * (nunca se inventa una fecha leída de la imagen).
   */
  const subirFotos = useCallback(async (fotos: File[], fecha?: string) => {
    setLoading(true);
    setError(null);
    setResultado(null);
    setCommitResultado(null);
    setErrorCommit(null);
    setFilasRechazadas(null);
    try {
      const token = await obtenerTokenSesion();

      const formData = new FormData();
      // El campo se repite una vez por foto -- el servidor lee `fotos` como
      // lista (1..6, una por página de la planilla).
      fotos.forEach((f) => formData.append('fotos', f));
      if (fecha) formData.append('fecha', fecha);

      const res = await fetch(`${EDGE_FUNCTION_BASE}/make-server-1ccce916/hato/chequeo/foto`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });

      const resultadoCuerpo = await leerCuerpoEdgeFunction<PreviewChequeoRespuesta & { error?: string }>(res);
      if (!resultadoCuerpo.ok) {
        throw new Error(resultadoCuerpo.mensaje);
      }
      const body = resultadoCuerpo.body;
      if (!res.ok || !body?.success) {
        throw new Error(body?.error || `El servidor respondió ${res.status} al leer las fotos.`);
      }

      setResultado(body as PreviewChequeoRespuesta);
      return body as PreviewChequeoRespuesta;
    } catch (err) {
      const mensaje = err instanceof Error ? err.message : 'Error desconocido leyendo las fotos del chequeo';
      setError(mensaje);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  /**
   * Aprueba el diff actual (`resultado`): envía SOLO las filas
   * `sin_cambio`/`cambio` al commit path. Filas `nuevo` (sin ficha todavía) y
   * `no_reconocido` nunca se incluyen -- la UI las señala aparte (ver
   * `ChequeoDiffReview`), no se aprueban en silencio.
   *
   * `opciones.filas` y `opciones.fecha` son la vía de la VENTANA DE CORRECCIÓN
   * (Fase 3a, `useRevisionChequeo`): las filas CORREGIDAS y la fecha del
   * chequeo fijada a mano. Sin ellas se cae al comportamiento original --
   * filas tal como salieron del archivo y la fecha que el parser resolvió del
   * título. Esto es seguro por construcción: el commit revalida las filas que
   * recibe corriendo `construirDiffChequeo` contra el estado fresco de la BD
   * (`hato-chequeo-commit.ts`), no re-parsea el `.xlsx`, así que un valor
   * corregido solo puede cambiar la clasificación entre `sin_cambio` y
   * `cambio` -- ambas escribibles -- y cualquier fila degradada vuelve como
   * 409 sin escribir nada.
   */
  const comprometer = useCallback(
    async (opciones?: { veterinario?: string; fecha?: string; filas?: FilaChequeoNormalizada[] }) => {
      if (!resultado) throw new Error('No hay una vista previa cargada para aprobar.');
      const veterinario = opciones?.veterinario;
      const fechaChequeo = opciones?.fecha ?? resultado.chequeoFecha;
      if (!fechaChequeo) {
        throw new Error('No se pudo resolver la fecha del chequeo desde el archivo -- no se puede aprobar sin fecha.');
      }

      const filasPorNumero = new Map(resultado.filasNormalizadas.map((f) => [f.fila, f]));
      const filasAprobables =
        opciones?.filas ??
        resultado.diffChequeos.filas
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
            chequeo: { fecha: fechaChequeo, veterinario: veterinario ?? null },
            filas: filasAprobables,
          }),
        });

        const resultadoCuerpo = await leerCuerpoEdgeFunction<{
          success?: boolean;
          error?: string;
          filasRechazadas?: FilaRechazadaCommit[];
        }>(res);
        if (!resultadoCuerpo.ok) {
          throw new Error(resultadoCuerpo.mensaje);
        }
        const body = resultadoCuerpo.body;
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
    subirFotos,
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
