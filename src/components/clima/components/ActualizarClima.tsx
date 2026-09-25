import { useState } from 'react';
import { Loader2, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';
import { getSupabase } from '@/utils/supabase/client';

/**
 * Botón «Actualizar» de la vista de Clima (ESCO-127).
 *
 * Un clic, sin elegir fechas: el endpoint mira los últimos 7 días, escoge sólo
 * los incompletos y les vuelve a preguntar a Ecowitt. Existe porque hasta
 * ahora no había forma de completar la historia sin pedir un backfill en una
 * sesión, y Ecowitt sólo entrega resolución de 5 minutos unos 90 días hacia
 * atrás: un día que no se repara a tiempo la pierde para siempre.
 *
 * Sólo Gerencia. No es cosmético: `verificarAccesoClima` ya restringe el
 * disparo manual a Gerencia del lado del servidor, así que mostrarle el botón
 * a otro rol sería ofrecerle un 403.
 */

type Desenlace = 'recuperado' | 'sin_cambio' | 'sin_datos_ecowitt' | 'error';

interface DiaReportado {
  fecha: string;
  desenlace: Desenlace;
  detalle?: string;
}

interface RespuestaActualizar {
  message?: string;
  error?: string;
  ocupado?: boolean;
  desde?: string;
  hasta?: string;
  resumen?: { revisados: number; recuperados: number; sinCambio: number; sinDatos: number; errores: number };
  dias?: DiaReportado[];
}

/** El lenguaje del proyecto: «sin dato» nunca se pinta como 0, y un día que
 *  sigue incompleto no se anuncia como recuperado. */
const TEXTO_DESENLACE: Record<Desenlace, string> = {
  recuperado: 'recuperado',
  sin_cambio: 'sigue sin dato — Ecowitt no tiene más',
  sin_datos_ecowitt: 'Ecowitt no tiene ese día',
  error: 'no se pudo consultar',
};

const COLOR_DESENLACE: Record<Desenlace, string> = {
  recuperado: 'text-primary',
  sin_cambio: 'text-gray-500',
  sin_datos_ecowitt: 'text-gray-500',
  error: 'text-red-600',
};

export function ActualizarClima() {
  const { profile } = useAuth();
  const [cargando, setCargando] = useState(false);
  const [resultado, setResultado] = useState<RespuestaActualizar | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (profile?.rol !== 'Gerencia') return null;

  const handleActualizar = async () => {
    setCargando(true);
    setError(null);
    setResultado(null);
    try {
      const { projectId } = await import('@/utils/supabase/info');
      const { data: { session } } = await getSupabase().auth.getSession();
      if (!session?.access_token) {
        setError('Sesión no válida — vuelve a iniciar sesión e intenta de nuevo.');
        return;
      }

      const res = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-1ccce916/clima/actualizar`,
        { method: 'POST', headers: { Authorization: `Bearer ${session.access_token}` } },
      );
      const cuerpo: RespuestaActualizar = await res.json().catch(() => ({}));

      if (!res.ok) {
        setError(cuerpo.message || cuerpo.error || `No se pudo actualizar (HTTP ${res.status}).`);
        return;
      }
      setResultado(cuerpo);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setCargando(false);
    }
  };

  const resumen = resultado?.resumen;

  return (
    <div className="flex flex-col items-start gap-2 sm:items-end">
      <Button variant="outline" size="sm" onClick={handleActualizar} disabled={cargando}>
        {cargando
          ? <Loader2 className="w-4 h-4 animate-spin" />
          : <RefreshCw className="w-4 h-4" />}
        {cargando ? 'Consultando la estación…' : 'Actualizar'}
      </Button>

      {cargando && (
        <p className="text-xs text-gray-500">
          Revisando los últimos 7 días. Puede tardar hasta un minuto.
        </p>
      )}

      {error && (
        <p className="text-xs text-red-600 max-w-xs text-left sm:text-right">{error}</p>
      )}

      {resultado && !error && (
        <div className="text-xs text-gray-600 max-w-xs text-left sm:text-right">
          {resumen && resumen.revisados === 0 ? (
            <p>Todo al día: los últimos 7 días ya están completos.</p>
          ) : (
            <>
              <p className="font-medium text-gray-700">
                {resumen?.recuperados ?? 0} de {resumen?.revisados ?? 0} día(s) recuperado(s)
              </p>
              <ul className="mt-1 space-y-0.5">
                {(resultado.dias ?? []).map((dia) => (
                  <li key={dia.fecha} className={COLOR_DESENLACE[dia.desenlace]}>
                    {dia.fecha}: {TEXTO_DESENLACE[dia.desenlace]}
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}
    </div>
  );
}
