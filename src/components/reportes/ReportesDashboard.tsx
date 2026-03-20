import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, History, Zap, Loader2 } from 'lucide-react';
import { Button } from '../ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { HistorialReportes } from './HistorialReportes';
import { generarReporteRapido } from '../../utils/reporteSemanalService';
import { toast } from 'sonner';

export function ReportesDashboard() {
  const navigate = useNavigate();
  const [generandoRapido, setGenerandoRapido] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  const handleGenerarRapido = async () => {
    try {
      setGenerandoRapido(true);
      const resultado = await generarReporteRapido(undefined, (step) => {
        toast.loading(step, { id: 'generar-rapido' });
      });
      toast.dismiss('generar-rapido');
      if (resultado.ya_existia) {
        toast.info(`Ya existe un reporte para la semana S${String(resultado.semana.numero).padStart(2, '0')}`);
      } else {
        toast.success(`Reporte S${String(resultado.semana.numero).padStart(2, '0')} generado`);
      }
      setRefreshKey(k => k + 1);
    } catch (error: any) {
      toast.dismiss('generar-rapido');
      toast.error(error.message || 'Error al generar el reporte');
    } finally {
      setGenerandoRapido(false);
    }
  };

  return (
    <div className="max-w-6xl mx-auto">
      {/* Header + actions */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Reportes</h1>
          <p className="text-gray-500 mt-1">Genera y consulta reportes semanales de la operación</p>
        </div>
        <div className="flex items-center gap-2 sm:gap-3">
          <Button
            variant="outline"
            size="sm"
            onClick={handleGenerarRapido}
            disabled={generandoRapido}
            className="border-primary text-primary hover:bg-primary hover:text-white flex-1 sm:flex-none"
          >
            {generandoRapido ? (
              <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Generando...</>
            ) : (
              <><Zap className="w-4 h-4 mr-1.5" /><span className="hidden sm:inline">Generación </span>Rápida</>
            )}
          </Button>
          <Button
            size="sm"
            onClick={() => navigate('/reportes/generar')}
            className="bg-primary text-white hover:bg-primary/90 flex-1 sm:flex-none"
          >
            <Plus className="w-4 h-4 mr-1.5" />
            Nuevo<span className="hidden sm:inline"> Reporte</span>
          </Button>
        </div>
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
          <HistorialReportes refreshKey={refreshKey} />
        </CardContent>
      </Card>
    </div>
  );
}
