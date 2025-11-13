import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, X, CheckCircle, ClipboardList, Lock } from 'lucide-react';
import { getSupabase } from '../../utils/supabase/client';
import { Button } from '../ui/button';
import { DailyMovementsDashboard } from './DailyMovementsDashboard';
import { CierreAplicacion } from './CierreAplicacion';
import type { Aplicacion, TipoAplicacion, EstadoAplicacion, MovimientoDiario } from '../../types/aplicaciones';

export function DailyMovements() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const supabase = getSupabase();

  const [aplicacion, setAplicacion] = useState<Aplicacion | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mostrarCierre, setMostrarCierre] = useState(false);

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

      // Convertir tipo de aplicación
      let tipoAplicacion: TipoAplicacion = 'fumigacion';
      if (data.tipo_aplicacion === 'Fumigación') {
        tipoAplicacion = 'fumigacion';
      } else if (data.tipo_aplicacion === 'Fertilización') {
        tipoAplicacion = 'fertilizacion';
      } else if (data.tipo_aplicacion === 'Drench') {
        tipoAplicacion = 'drench';
      }

      // Convertir a formato Aplicacion
      const aplicacionData: Aplicacion = {
        id: data.id,
        nombre: data.nombre_aplicacion,
        tipo: tipoAplicacion,
        fecha_inicio: data.fecha_inicio_ejecucion || data.fecha_recomendacion,
        fecha_cierre: data.fecha_fin_ejecucion || undefined,
        estado: data.estado as EstadoAplicacion,
        proposito: data.proposito || undefined,
        agronomo_responsable: data.agronomo_responsable || undefined,
        configuracion: {} as any,
        mezclas: [],
        calculos: [],
        lista_compras: { 
          items: [], 
          costo_total_estimado: 0, 
          productos_sin_precio: 0, 
          productos_sin_stock: 0 
        },
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
                  <span>Tipo: <strong className="text-[#172E08] capitalize">{aplicacion.tipo}</strong></span>
                  <span>•</span>
                  <span>Inicio: <strong className="text-[#172E08]">
                    {new Date(aplicacion.fecha_inicio).toLocaleDateString('es-CO')}
                  </strong></span>
                  {aplicacion.fecha_cierre && (
                    <>
                      <span>•</span>
                      <span>Cierre: <strong className="text-[#172E08]">
                        {new Date(aplicacion.fecha_cierre).toLocaleDateString('es-CO')}
                      </strong></span>
                    </>
                  )}
                </div>
              </div>
            </div>
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
                Esta aplicación ya fue cerrada{' '}
                {aplicacion.fecha_cierre && `el ${new Date(aplicacion.fecha_cierre).toLocaleDateString('es-CO')}`}. 
                Los movimientos diarios que se registraron se pueden consultar pero no se pueden agregar nuevos.
              </p>
            </div>
          </div>
        )}

        {/* Dashboard completo */}
        <DailyMovementsDashboard aplicacion={aplicacion} />

        {/* Botón para cerrar la aplicación */}
        {aplicacion.estado === 'En ejecución' && (
          <div className="flex justify-end mt-8">
            <Button
              onClick={() => setMostrarCierre(true)}
              className="bg-[#73991C] hover:bg-[#5f7d17] text-white"
            >
              <Lock className="w-4 h-4 mr-2" />
              Cerrar Aplicación
            </Button>
          </div>
        )}

        {/* Modal para cerrar la aplicación */}
        {mostrarCierre && (
          <CierreAplicacion
            aplicacion={aplicacion}
            onClose={() => setMostrarCierre(false)}
            onCierreCompleto={() => {
              setMostrarCierre(false);
              cargarAplicacion(); // Recargar para actualizar el estado
            }}
          />
        )}
      </div>
    </div>
  );
}