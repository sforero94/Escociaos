import { getSupabase } from '@/utils/supabase/client';
import { projectId } from '@/utils/supabase/info.tsx';
import { extraerCabecera } from './cabecera';
import { parsearRespuestaSnippets } from './snippets';
import type { InformeVisitaCabecera, SnippetPropuesto } from '@/types/informesVisita';

const EDGE_FUNCTION_BASE = `https://${projectId}.supabase.co/functions/v1`;

/** 404 = the route exists in git, not in the deployed `make-server-1ccce916`. */
export const MENSAJE_ENDPOINT_NO_DESPLEGADO =
  'El endpoint de propuestas no está desplegado. Hay que redesplegar la edge function make-server-1ccce916.';

export interface PropuestaSnippetsRespuesta {
  cabecera: InformeVisitaCabecera;
  snippets: SnippetPropuesto[];
  descartadosPorCita: number;
}

export function propuestaVacia(texto: string, fechaFallback: string): PropuestaSnippetsRespuesta {
  return {
    cabecera: extraerCabecera(texto, fechaFallback),
    snippets: [],
    descartadosPorCita: 0,
  };
}

/** Llama al edge function. Nunca persiste. Si no hay texto, no llama al modelo. */
export async function pedirSnippetsAlModelo(opts: {
  texto: string;
  piesDeFoto: string[];
  nFotos: number;
  fechaFallback: string;
}): Promise<PropuestaSnippetsRespuesta> {
  if (!opts.texto.trim()) {
    return propuestaVacia(opts.texto, opts.fechaFallback);
  }

  const supabase = getSupabase();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) {
    throw new Error('No hay sesión activa');
  }

  const res = await fetch(
    `${EDGE_FUNCTION_BASE}/make-server-1ccce916/informes-visita/snippets/proponer`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({
        texto: opts.texto,
        pies_de_foto: opts.piesDeFoto,
        n_fotos: opts.nFotos,
        fecha_fallback: opts.fechaFallback,
      }),
    },
  );

  const body = await res.json().catch(() => ({})) as {
    error?: string;
    cabecera?: InformeVisitaCabecera;
    snippets?: SnippetPropuesto[];
    descartadosPorCita?: number;
    bruto?: unknown;
  };

  if (!res.ok) {
    if (res.status === 404) {
      throw new Error(MENSAJE_ENDPOINT_NO_DESPLEGADO);
    }
    throw new Error(body.error || `Error del servidor: ${res.status}`);
  }

  if (body.cabecera && Array.isArray(body.snippets)) {
    return {
      cabecera: body.cabecera,
      snippets: body.snippets,
      descartadosPorCita: body.descartadosPorCita ?? 0,
    };
  }

  // Fallback: el endpoint devolvió el JSON del modelo crudo.
  if (body.bruto) {
    const parsed = parsearRespuestaSnippets(body.bruto, opts.texto, opts.nFotos, opts.fechaFallback);
    return parsed;
  }

  return propuestaVacia(opts.texto, opts.fechaFallback);
}
