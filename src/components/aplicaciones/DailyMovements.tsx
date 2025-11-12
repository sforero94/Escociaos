import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Plus, X, CheckCircle, ClipboardList } from 'lucide-react';
import { getSupabase } from '../../utils/supabase/client';
import { Button } from '../ui/button';
import { DailyMovementForm } from './DailyMovementForm';
import { DailyMovementsList } from './DailyMovementsList';
import type { Aplicacion } from '../../types/aplicaciones';

export function DailyMovements() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const supabase = getSupabase();

  const [aplicacion, setAplicacion] = useState<Aplicacion | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    if (id) {
      cargarAplicacion();
    }
  }, [id]);

  const cargarAplicacion = async () => {
    try {
      setLoading(true);
      setError(null);

      const { data, error: errorCarga } = await supabase
        .from('aplicaciones')
        .select('*')
        .eq('id', id)
        .single();

      if (errorCarga) throw errorCarga;

      if (!data) {
        throw new Error('Aplicación no encontrada');
      }

      // Convertir a formato Aplicacion
      const aplicacionData: Aplicacion = {
        id: data.id,
        nombre: data.nombre_aplicacion,
        tipo: data.tipo_aplicacion === 'Fumigación'
          ? 'fumigacion'
          : data.tipo_aplicacion === 'Fertilización'
          ? 'fertilizacion'
          : 'drench',
        fecha_inicio: data.fecha_recomendacion,
        fecha_cierre: data.fecha_fin_ejecucion || undefined,
        estado: data.estado,
        proposito: data.proposito || undefined,
        agronomo_responsable: data.agronomo_responsable || undefined,
        configuracion: {} as any, // Se cargará si es necesario
        mezclas: [],
        calculos: [],
        lista_compras: { items: [], costo_total_estimado: 0, productos_sin_precio: 0, productos_sin_stock: 0 },
        creado_en: data.created_at,
        creado_por: data.created_by,
        actualizado_en: data.updated_at,
      };

      setAplicacion(aplicacionData);

    } catch (err: any) {
      console.error('Error cargando aplicación:', err);
      setError(err.message || 'Error al cargar la aplicación');
    } finally {
      setLoading(false);
    }
  };

  const handleSuccess = () => {
    setShowForm(false);
    setRefreshKey(prev => prev + 1);
  };

  const handleRefresh = () => {
    setRefreshKey(prev => prev + 1);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#F8FAF5] flex items-center justify-center">
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-12 text-center max-w-md">
          <div className="w-12 h-12 border-4 border-[#73991C]/30 border-t-[#73991C] rounded-full animate-spin mx-auto mb-4" />
          <h2 className="text-xl text-[#172E08] mb-2">Cargando aplicación...</h2>
        </div>
      </div>
    );
  }

  if (error || !aplicacion) {
    return (
      <div className="min-h-screen bg-[#F8FAF5] flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-sm border border-red-200 p-12 text-center max-w-md">
          <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <X className="w-8 h-8 text-red-600" />
          </div>
          <h2 className="text-xl text-[#172E08] mb-2">Error</h2>
          <p className="text-[#4D240F]/70 mb-6">
            {error || 'No se pudo cargar la aplicación'}
          </p>
          <Button
            onClick={() => navigate('/aplicaciones')}
            className="bg-[#73991C] hover:bg-[#5f7d17] text-white"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Volver a Aplicaciones
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F8FAF5] py-8 px-4 sm:px-6 lg:px-8">
      <div className="max-w-[1400px] mx-auto">
        {/* Header */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-8 mb-8">
          <div className="flex items-start justify-between gap-4 mb-6">
            <div className="flex items-start gap-4">
              <button
                onClick={() => navigate('/aplicaciones')}
                className="w-12 h-12 bg-[#73991C]/10 rounded-xl flex items-center justify-center hover:bg-[#73991C]/20 transition-all flex-shrink-0"
              >
                <ArrowLeft className="w-5 h-5 text-[#73991C]" />
              </button>
              <div>
                <div className="flex items-center gap-3 mb-2">
                  <h1 className="text-[#172E08]">Registro de Movimientos Diarios</h1>
                  <span className={`px-3 py-1 rounded-lg text-xs uppercase tracking-wide ${
                    aplicacion.estado === 'En ejecución'
                      ? 'bg-blue-100 text-blue-700'
                      : aplicacion.estado === 'Cerrada'
                      ? 'bg-gray-100 text-gray-700'
                      : 'bg-yellow-100 text-yellow-700'
                  }`}>
                    {aplicacion.estado}
                  </span>
                </div>
                <p className="text-[#4D240F]/70 mb-2">{aplicacion.nombre}</p>
                <div className="flex items-center gap-4 text-sm text-[#4D240F]/60">
                  <span>Tipo: <strong className="text-[#172E08]">{aplicacion.tipo}</strong></span>
                  <span>•</span>
                  <span>Inicio: <strong className="text-[#172E08]">
                    {new Date(aplicacion.fecha_inicio).toLocaleDateString('es-CO')}
                  </strong></span>
                </div>
              </div>
            </div>

            {/* Botón para mostrar/ocultar formulario */}
            {aplicacion.estado === 'En ejecución' && (
              <Button
                onClick={() => setShowForm(!showForm)}
                className={`${
                  showForm
                    ? 'bg-gray-200 hover:bg-gray-300 text-[#172E08]'
                    : 'bg-[#73991C] hover:bg-[#5f7d17] text-white'
                } transition-all`}
              >
                {showForm ? (
                  <>
                    <X className="w-4 h-4 mr-2" />
                    Cerrar Formulario
                  </>
                ) : (
                  <>
                    <Plus className="w-4 h-4 mr-2" />
                    Nuevo Movimiento
                  </>
                )}
              </Button>
            )}
          </div>

          {/* Info de la funcionalidad */}
          <div className="bg-[#E7EDDD] border border-[#73991C]/20 rounded-xl p-4">
            <div className="flex items-start gap-3">
              <ClipboardList className="w-5 h-5 text-[#73991C] flex-shrink-0 mt-0.5" />
              <div>
                <h3 className="text-sm text-[#172E08] mb-1">
                  ¿Qué son los movimientos diarios?
                </h3>
                <p className="text-xs text-[#4D240F]/70">
                  Registra el uso diario de insumos durante el periodo de aplicación (que puede durar varios días).
                  Estos movimientos son <strong>provisionales</strong> y permiten mantener trazabilidad para GlobalGAP
                  sin afectar el inventario inmediatamente. Al cerrar la aplicación, podrás revisar y ajustar
                  si hay diferencias entre lo planeado y lo realmente utilizado.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Mensaje si la aplicación está cerrada */}
        {aplicacion.estado === 'Cerrada' && (
          <div className="bg-gray-50 border border-gray-200 rounded-2xl p-6 mb-8 flex items-start gap-4">
            <CheckCircle className="w-6 h-6 text-gray-600 flex-shrink-0 mt-1" />
            <div>
              <h3 className="text-lg text-[#172E08] mb-2">
                Aplicación Cerrada
              </h3>
              <p className="text-[#4D240F]/70">
                Esta aplicación ya fue cerrada el{' '}
                {aplicacion.fecha_cierre
                  ? new Date(aplicacion.fecha_cierre).toLocaleDateString('es-CO')
                  : 'N/A'
                }. Los movimientos diarios que se registraron se pueden consultar pero no se pueden agregar nuevos.
              </p>
            </div>
          </div>
        )}

        {/* Formulario (solo si está visible y la aplicación está en ejecución) */}
        {showForm && aplicacion.estado === 'En ejecución' && (
          <div className="mb-8">
            <DailyMovementForm
              aplicacion={aplicacion}
              onSuccess={handleSuccess}
              onCancel={() => setShowForm(false)}
            />
          </div>
        )}

        {/* Lista de movimientos */}
        <DailyMovementsList
          key={refreshKey}
          aplicacion={aplicacion}
          onRefresh={handleRefresh}
        />
      </div>
    </div>
  );
}
