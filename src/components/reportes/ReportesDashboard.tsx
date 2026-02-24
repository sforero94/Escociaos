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
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-foreground">Reportes</h1>
        <p className="text-gray-500 mt-1">Genera y consulta reportes semanales de la operación</p>
      </div>

      {/* Acción principal */}
      <div
        onClick={() => navigate('/reportes/generar')}
        className="mb-8 bg-gradient-to-r from-primary to-primary-dark rounded-2xl p-8 text-white cursor-pointer hover:shadow-xl transition-all group"
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

      {/* Generación rápida */}
      <div className="mb-8 flex items-center gap-4 p-5 bg-background border border-primary/20 rounded-2xl">
        <div className="w-10 h-10 bg-primary/10 rounded-xl flex items-center justify-center shrink-0">
          <Zap className="w-5 h-5 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-foreground">Generación Rápida</p>
          <p className="text-xs text-gray-500">Sin wizard — genera el reporte de la semana anterior automáticamente</p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={handleGenerarRapido}
          disabled={generandoRapido}
          className="border-primary text-primary hover:bg-primary hover:text-white shrink-0"
        >
          {generandoRapido ? (
            <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Generando...</>
          ) : (
            <><Zap className="w-4 h-4 mr-2" />Generar</>
          )}
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
          <HistorialReportes refreshKey={refreshKey} />
        </CardContent>
      </Card>
    </div>
  );
}
