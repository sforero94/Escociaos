import { useCallback, useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { DailyMovementsDashboard } from './DailyMovementsDashboard';
import { AplicacionShell } from './shared/AplicacionShell';
import { Empty, EmptyContent, EmptyDescription, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { Skeleton } from '@/components/ui/skeleton';
import { getSupabase } from '../../utils/supabase/client';
import type { Aplicacion } from '../../types/aplicaciones';

const APLICACION_NO_ENCONTRADA = 'Aplicación no encontrada';

/**
 * `true` si el error luce como el `TypeError: Failed to fetch` que dispara D8 en
 * navegación fría (señal intermitente, servidor caído a mitad de carga). Distinto de
 * "Aplicación no encontrada", que es un 404 real donde reintentar no cambia nada.
 */
function esErrorDeRed(mensaje: string): boolean {
  return /failed to fetch|network|conexión|connection/i.test(mensaje);
}

/**
 * Wrapper que obtiene la aplicación desde la URL y la pasa al dashboard.
 *
 * D8: la navegación fría a esta ruta puede fallar con `TypeError: Failed to fetch`
 * (señal de campo intermitente). Antes el único camino era "Volver a Aplicaciones" —
 * ahora el estado de error ofrece Reintentar como acción primaria (vuelve a llamar
 * loadAplicacion) y Volver como secundaria.
 */
export function DailyMovementsDashboardWrapper() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [aplicacion, setAplicacion] = useState<Aplicacion | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadAplicacion = useCallback(async () => {
    if (!id) return;
    try {
      setLoading(true);
      setError(null);
      const supabase = getSupabase();

      const { data, error: fetchError } = await supabase
        .from('aplicaciones')
        .select('*')
        .eq('id', id)
        .single();

      if (fetchError) throw fetchError;

      if (!data) {
        setError(APLICACION_NO_ENCONTRADA);
        return;
      }

      setAplicacion(data as Aplicacion);
    } catch (err: any) {
      setError(err?.message || 'Error cargando la aplicación');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    if (!id) {
      navigate('/aplicaciones');
      return;
    }
    loadAplicacion();
  }, [id, loadAplicacion, navigate]);

  if (loading) {
    return (
      <AplicacionShell titulo="Movimientos Diarios">
        <div className="flex flex-col items-center justify-center gap-3 py-10">
          <Spinner className="size-8 text-primary" />
          <p className="text-sm text-muted-foreground">Cargando aplicación…</p>
        </div>
        <div className="space-y-4">
          <Skeleton className="h-24 w-full rounded-2xl" />
          <Skeleton className="h-40 w-full rounded-2xl" />
          <Skeleton className="h-24 w-full rounded-2xl" />
        </div>
      </AplicacionShell>
    );
  }

  if (error || !aplicacion) {
    const mensaje = error ?? 'No se pudo cargar la aplicación.';
    // "Aplicación no encontrada" es un 404 real — reintentar no cambia nada, así que se
    // muestra tal cual. Cualquier otra falla que luzca como `Failed to fetch` (D8, señal
    // intermitente) recibe el mensaje orientado a conexión; el resto muestra el error real.
    const descripcion =
      mensaje === APLICACION_NO_ENCONTRADA
        ? mensaje
        : esErrorDeRed(mensaje)
          ? 'Parece un problema de conexión. Verifica tu señal e intenta de nuevo — no se perdió ningún dato.'
          : mensaje;

    return (
      <AplicacionShell titulo="Movimientos Diarios">
        <Empty>
          <EmptyMedia variant="icon" className="bg-destructive/10 text-destructive">
            <AlertTriangle />
          </EmptyMedia>
          <EmptyTitle>No pudimos cargar los movimientos</EmptyTitle>
          <EmptyDescription>{descripcion}</EmptyDescription>
          <EmptyContent>
            <div className="flex flex-wrap items-center justify-center gap-3">
              <Button onClick={loadAplicacion}>
                <RefreshCw className="size-4" />
                Reintentar
              </Button>
              <Button variant="outline" onClick={() => navigate('/aplicaciones')}>
                Volver a Aplicaciones
              </Button>
            </div>
          </EmptyContent>
        </Empty>
      </AplicacionShell>
    );
  }

  return <DailyMovementsDashboard aplicacion={aplicacion} />;
}
