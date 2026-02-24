import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { DailyMovementsDashboard } from './DailyMovementsDashboard';
import { getSupabase } from '../../utils/supabase/client';
import type { Aplicacion } from '../../types/aplicaciones';

/**
 * Wrapper que obtiene la aplicación desde la URL y la pasa al dashboard
 */
export function DailyMovementsDashboardWrapper() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [aplicacion, setAplicacion] = useState<Aplicacion | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) {
      navigate('/aplicaciones');
      return;
    }

    loadAplicacion();
  }, [id]);

  const loadAplicacion = async () => {
    try {
      setLoading(true);
      setError(null);
      const supabase = getSupabase();

      const { data, error } = await supabase
        .from('aplicaciones')
        .select('*')
        .eq('id', id)
        .single();

      if (error) throw error;

      if (!data) {
        setError('Aplicación no encontrada');
        return;
      }

      setAplicacion(data);
    } catch (err: any) {
      setError(err.message || 'Error cargando la aplicación');
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    navigate('/aplicaciones');
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <div className="inline-block w-12 h-12 border-4 border-primary/20 border-t-primary rounded-full animate-spin mb-4"></div>
          <p className="text-brand-brown/70">Cargando aplicación...</p>
        </div>
      </div>
    );
  }

  if (error || !aplicacion) {
    return (
      <div className="text-center py-12">
        <div className="inline-flex items-center justify-center w-20 h-20 bg-red-100 rounded-2xl mb-4">
          <span className="text-3xl">⚠️</span>
        </div>
        <h2 className="text-2xl text-foreground mb-2">Error</h2>
        <p className="text-brand-brown/70 mb-4">
          {error || 'No se pudo cargar la aplicación'}
        </p>
        <button
          onClick={handleClose}
          className="px-6 py-2 bg-primary hover:bg-primary-dark text-white rounded-xl transition-colors"
        >
          Volver a Aplicaciones
        </button>
      </div>
    );
  }

  return (
    <DailyMovementsDashboard 
      aplicacion={aplicacion} 
      onClose={handleClose}
    />
  );
}
