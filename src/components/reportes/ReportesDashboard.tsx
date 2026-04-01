import { useNavigate } from 'react-router-dom';
import { Plus, History } from 'lucide-react';
import { Button } from '../ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { HistorialReportes } from './HistorialReportes';

export function ReportesDashboard() {
  const navigate = useNavigate();

  return (
    <div className="max-w-6xl mx-auto">
      {/* Header + actions */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Reportes</h1>
          <p className="text-gray-500 mt-1">Genera y consulta reportes semanales de la operación</p>
        </div>
        <Button
          size="sm"
          onClick={() => navigate('/reportes/generar')}
          className="bg-primary text-white hover:bg-primary/90 sm:flex-none"
        >
          <Plus className="w-4 h-4 mr-1.5" />
          Nuevo Reporte
        </Button>
      </div>

      {/* Historial */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-foreground">
            <History className="w-5 h-5 text-primary" />
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
