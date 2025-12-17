import { useState } from 'react';
import { RoleGuard } from '../auth/RoleGuard';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs';
import { PyGReport } from './components/PyGReport';
import { FiltrosGlobales } from './components/FiltrosGlobales';
import { FinanzasSubNav } from './components/FinanzasSubNav';
import { Button } from '../ui/button';
import { Download, FileText, FileSpreadsheet, TrendingUp } from 'lucide-react';
import { generarPDFPyG } from '../../utils/generarPDFPyG';
import type { FiltrosFinanzas, ReportePyG } from '../../types/finanzas';

/**
 * Vista de Reportes Financieros
 * Acceso exclusivo para rol Gerencia
 */
export function ReportesView() {
  const [activeTab, setActiveTab] = useState('pyg');
  const [filtros, setFiltros] = useState<FiltrosFinanzas>({
    periodo: 'mes_actual'
  });
  const [reporteData, setReporteData] = useState<ReportePyG | null>(null);

  const handleExportPDF = () => {
    if (!reporteData) {
      alert('No hay datos para exportar. Genere un reporte primero.');
      return;
    }

    try {
      generarPDFPyG({
        reporte: reporteData,
        filtros,
        titulo: 'Reporte P&L - Escocia Hass',
        empresa: 'Escocia Hass'
      });
    } catch (error) {
      alert('Error al generar el PDF. Intente nuevamente.');
    }
  };

  const handleExportExcel = () => {
    // TODO: Implement Excel export
    alert('Exportación a Excel próximamente disponible');
  };

  const handleReporteGenerated = (reporte: ReportePyG) => {
    setReporteData(reporte);
  };

  return (
    <RoleGuard allowedRoles={['Gerencia']}>
      <div className="space-y-6">
        {/* Navigation */}
        <FinanzasSubNav />

        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-[#172E08] mb-2">Reportes Financieros</h1>
            <p className="text-[#4D240F]/70">P&L y análisis financiero detallado</p>
          </div>

          {/* Export buttons */}
          <div className="flex gap-2">
            <Button
              onClick={handleExportPDF}
              variant="outline"
              className="flex items-center gap-2"
            >
              <FileText className="w-4 h-4" />
              Exportar PDF
            </Button>
            <Button
              onClick={handleExportExcel}
              variant="outline"
              className="flex items-center gap-2"
            >
              <FileSpreadsheet className="w-4 h-4" />
              Exportar Excel
            </Button>
          </div>
        </div>

        {/* Global Filters */}
        <FiltrosGlobales
          filtros={filtros}
          onFiltrosChange={setFiltros}
          onAplicarFiltros={() => {
            // The PyGReport component will automatically update when filtros change
          }}
        />

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="pyg" className="flex items-center gap-2">
              <TrendingUp className="w-4 h-4" />
              P&L (Pérdidas y Ganancias)
            </TabsTrigger>
            <TabsTrigger value="flujo" className="flex items-center gap-2">
              <Download className="w-4 h-4" />
              Flujo de Caja
            </TabsTrigger>
          </TabsList>

          <TabsContent value="pyg" className="mt-6">
            <PyGReport filtros={filtros} onReporteGenerated={handleReporteGenerated} />
          </TabsContent>

          <TabsContent value="flujo" className="mt-6">
            <div className="bg-white rounded-2xl p-8 border border-gray-200 text-center">
              <div className="w-16 h-16 bg-blue-100 rounded-2xl mx-auto mb-4 flex items-center justify-center">
                <Download className="w-8 h-8 text-blue-600" />
              </div>
              <h3 className="text-lg text-[#172E08] mb-2">Flujo de Caja</h3>
              <p className="text-[#4D240F]/70">
                Reporte de flujo de caja próximamente disponible
              </p>
            </div>
          </TabsContent>
        </Tabs>

        {/* Information */}
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-6">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center flex-shrink-0">
              <span className="text-xl">ℹ️</span>
            </div>
            <div>
              <h3 className="text-lg font-semibold text-blue-900 mb-2">
                Información de Reportes
              </h3>
              <ul className="text-sm text-blue-800 space-y-1">
                <li>• Los reportes se generan en tiempo real basados en los datos registrados</li>
                <li>• Utilice los filtros globales para cambiar el período de análisis</li>
                <li>• Los comparativos muestran variaciones porcentuales y absolutas</li>
                <li>• Los reportes pueden exportarse en formato PDF o Excel</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </RoleGuard>
  );
}