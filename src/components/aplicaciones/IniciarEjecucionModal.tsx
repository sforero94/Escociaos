import { useState } from 'react';
import { Play, X, Calendar, AlertCircle } from 'lucide-react';
import { getSupabase } from '../../utils/supabase/client';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import type { Aplicacion } from '../../types/aplicaciones';

interface IniciarEjecucionModalProps {
  aplicacion: Aplicacion;
  onClose: () => void;
  onSuccess: () => void;
}

export function IniciarEjecucionModal({
  aplicacion,
  onClose,
  onSuccess,
}: IniciarEjecucionModalProps) {
  const supabase = getSupabase();
  const [fechaInicio, setFechaInicio] = useState<string>(
    new Date().toISOString().split('T')[0]
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleIniciar = async () => {
    try {
      setLoading(true);
      setError(null);

      // Validar fecha
      if (!fechaInicio) {
        setError('Debes seleccionar una fecha de inicio');
        return;
      }

      const fechaInicioDate = new Date(fechaInicio);
      const hoy = new Date();
      hoy.setHours(0, 0, 0, 0);

      if (fechaInicioDate > hoy) {
        setError('La fecha de inicio no puede ser futura');
        return;
      }

      // Actualizar aplicación a estado "En ejecución"
      const { error: updateError } = await supabase
        .from('aplicaciones')
        .update({
          estado: 'En ejecución',
          fecha_inicio_ejecucion: fechaInicio,
          updated_at: new Date().toISOString(),
        })
        .eq('id', aplicacion.id);

      if (updateError) throw updateError;

      onSuccess();
    } catch (err: any) {
      console.error('Error iniciando ejecución:', err);
      setError(err.message || 'Error al iniciar la ejecución');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-[#73991C]/10 rounded-xl flex items-center justify-center">
              <Play className="w-5 h-5 text-[#73991C]" />
            </div>
            <div>
              <h2 className="text-lg text-[#172E08]">Iniciar Ejecución</h2>
              <p className="text-sm text-[#4D240F]/60">{aplicacion.nombre}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-[#4D240F]/40 hover:text-[#4D240F] transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-4">
          {/* Info */}
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
            <div className="flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm text-blue-900 mb-1">
                  Al iniciar la ejecución podrás:
                </p>
                <ul className="text-xs text-blue-800 space-y-1 ml-4 list-disc">
                  <li>Registrar movimientos diarios de productos</li>
                  <li>Mantener trazabilidad para GlobalGAP</li>
                  <li>Comparar lo planificado vs lo ejecutado</li>
                </ul>
              </div>
            </div>
          </div>

          {/* Fecha de inicio */}
          <div>
            <label className="block text-sm text-[#172E08] mb-2">
              <Calendar className="w-4 h-4 inline mr-1" />
              Fecha de inicio de ejecución
            </label>
            <Input
              type="date"
              value={fechaInicio}
              onChange={(e) => setFechaInicio(e.target.value)}
              max={new Date().toISOString().split('T')[0]}
              className="w-full"
            />
            <p className="text-xs text-[#4D240F]/60 mt-1">
              Fecha en que comenzó la aplicación en campo
            </p>
          </div>

          {/* Error */}
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-4">
              <div className="flex items-center gap-2 text-red-600">
                <AlertCircle className="w-4 h-4" />
                <p className="text-sm">{error}</p>
              </div>
            </div>
          )}

          {/* Resumen */}
          <div className="bg-[#F8FAF5] rounded-xl p-4 space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-[#4D240F]/70">Estado actual:</span>
              <span className="text-[#172E08] px-2 py-0.5 bg-yellow-100 rounded">
                {aplicacion.estado}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-[#4D240F]/70">Nuevo estado:</span>
              <span className="text-[#172E08] px-2 py-0.5 bg-blue-100 rounded">
                En ejecución
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-[#4D240F]/70">Tipo:</span>
              <span className="text-[#172E08] capitalize">{aplicacion.tipo}</span>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center gap-3 p-6 border-t border-gray-200">
          <Button
            onClick={onClose}
            variant="outline"
            className="flex-1 border-gray-300 hover:bg-gray-50"
            disabled={loading}
          >
            Cancelar
          </Button>
          <Button
            onClick={handleIniciar}
            className="flex-1 bg-[#73991C] hover:bg-[#5f7d17] text-white"
            disabled={loading}
          >
            {loading ? (
              <>
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin mr-2" />
                Iniciando...
              </>
            ) : (
              <>
                <Play className="w-4 h-4 mr-2" />
                Iniciar Ejecución
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}