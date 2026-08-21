import { useCallback, useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { CierreAplicacion } from './CierreAplicacion';
import { AplicacionShell } from './shared/AplicacionShell';
import { Empty, EmptyContent, EmptyDescription, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { Skeleton } from '@/components/ui/skeleton';
import { getSupabase } from '../../utils/supabase/client';
import type { Aplicacion } from '../../types/aplicaciones';

const APLICACION_NO_ENCONTRADA = 'Aplicación no encontrada';

/**
 * Wrapper que obtiene la aplicación desde la URL y la pasa al cierre.
 *
 * Solo fetch + pasar `aplicacion` — no absorbe lógica de UI propia (W03-cierre-v2.md §9 riesgo
 * #6, heredado de v1 sin cambios): loading/error usan `AplicacionShell` + `Empty`, el mismo
 * patrón que ya usa `DailyMovementsDashboardWrapper.tsx` en vez de markup a mano.
 */
export function CierreAplicacionWrapper() {
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
      <AplicacionShell titulo="Cerrar Aplicación">
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
    return (
      <AplicacionShell titulo="Cerrar Aplicación">
        <Empty>
          <EmptyMedia variant="icon" className="bg-destructive/10 text-destructive">
            <AlertTriangle />
          </EmptyMedia>
          <EmptyTitle>No pudimos cargar la aplicación</EmptyTitle>
          <EmptyDescription>{mensaje}</EmptyDescription>
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

  return <CierreAplicacion aplicacion={aplicacion} />;
}
