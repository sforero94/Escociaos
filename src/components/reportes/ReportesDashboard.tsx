import { useNavigate } from 'react-router-dom';
import { FileText, Plus, History } from 'lucide-react';
import { Button } from '../ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { HistorialReportes } from './HistorialReportes';

export function ReportesDashboard() {
  const navigate = useNavigate();

  return (
    <div className="max-w-6xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-[#172E08]">Reportes</h1>
        <p className="text-gray-500 mt-1">Genera y consulta reportes semanales de la operación</p>
      </div>

      {/* Acción principal */}
      <div
        onClick={() => navigate('/reportes/generar')}
        className="mb-8 bg-gradient-to-r from-[#73991C] to-[#5a7a16] rounded-2xl p-8 text-white cursor-pointer hover:shadow-xl transition-all group"
      >
        <div className="flex items-center gap-6">
          <div className="w-16 h-16 bg-white/20 rounded-2xl flex items-center justify-center group-hover:scale-110 transition-transform">
            <Plus className="w-8 h-8" />
          </div>
          <div>
            <h2 className="text-2xl font-bold">Generar Reporte Semanal</h2>
            <p className="text-white/80 mt-1">
              Crea un reporte PDF con personal, jornales, aplicaciones, monitoreo y más
            </p>
          </div>
        </div>
      </div>

      {/* Historial */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-[#172E08]">
            <History className="w-5 h-5 text-[#73991C]" />
            Reportes Anteriores
          </CardTitle>
        </CardHeader>
        <CardContent>
          <HistorialReportes />
        </CardContent>
      </Card>
    </div>
  );
}
