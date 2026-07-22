import { useMemo, useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs';
import { Button } from '../ui/button';
import { FileSpreadsheet, FileText, Loader2, TrendingUp, Wallet } from 'lucide-react';
import { toast } from 'sonner';
import { RoleGuard } from '../auth/RoleGuard';
import { ReportesControls } from './reportes/ReportesControls';
import { TablaPyG } from './reportes/TablaPyG';
import { TablaFlujoCaja } from './reportes/TablaFlujoCaja';
import { AdvertenciasReporte } from './reportes/AdvertenciasReporte';
import { useReportesFinancierosData } from './hooks/useReportesFinancierosData';
import { construirPeriodos } from '../../utils/periodosReporte';
import { construirPyG } from '../../utils/calculosPyG';
import { construirFlujoCaja } from '../../utils/calculosFlujoCaja';
import type { ModoReporte, VistaReporte } from '../../types/reportesFinancieros';

/** Los datos financieros arrancan en 2023. */
const PRIMER_ANIO = 2023;

function aniosDisponibles(): number[] {
  const actual = new Date().getFullYear();
  const anios: number[] = [];
  for (let a = actual; a >= PRIMER_ANIO; a -= 1) anios.push(a);
  return anios;
}

/**
 * Reportes Financieros: P&G por períodos acumulados y Flujo de Caja mensual.
 *
 * Gerencia-only por RoleGuard explícito. Las políticas RLS de `fin_gastos`,
 * `fin_ingresos` y `fin_transacciones_ganado` son Gerencia-only
 * (`es_usuario_gerencia()`), así que sin este guard un Administrador con el
 * módulo `finanzas` concedido vería un P&G lleno de ceros — indistinguible de
 * "no hay datos" — en vez de un mensaje que explique qué pasa.
 */
export function ReportesView() {
  return (
    <RoleGuard allowedRoles={['Gerencia']}>
      <ReportesContenido />
    </RoleGuard>
  );
}

function ReportesContenido() {
  const anios = useMemo(aniosDisponibles, []);
  const [anio, setAnio] = useState(anios[0]);
  const [vista, setVista] = useState<VistaReporte>('global');
  const [modo, setModo] = useState<ModoReporte>('trimestres');
  const [tab, setTab] = useState('pyg');
  const [exportando, setExportando] = useState(false);

  const { datos, loading, error } = useReportesFinancierosData(anio);

  // El modo cosecha solo tiene sentido en aguacate: es su ciclo productivo.
  const permiteModoCosecha = vista === 'aguacate';
  const modoEfectivo: ModoReporte = permiteModoCosecha ? modo : 'trimestres';

  const pyg = useMemo(() => {
    if (!datos) return null;
    return construirPyG(datos, construirPeriodos(anio, modoEfectivo), {
      vista,
      modo: modoEfectivo,
    });
  }, [datos, anio, vista, modoEfectivo]);

  const flujo = useMemo(() => {
    if (!datos) return null;
    return construirFlujoCaja(datos, vista);
  }, [datos, vista]);

  const handleExportPDF = async () => {
    if (!pyg || !flujo) return;
    setExportando(true);
    try {
      const { generarPDFReportesFinancieros } = await import(
        '../../utils/generarPDFReportesFinancieros'
      );
      await generarPDFReportesFinancieros(tab === 'flujo' ? { flujo } : { pyg });
      toast.success('PDF generado');
    } catch {
      toast.error('No se pudo generar el PDF.');
    } finally {
      setExportando(false);
    }
  };

  const handleExportExcel = async () => {
    if (!pyg || !flujo) return;
    setExportando(true);
    try {
      const { exportarExcelReportes } = await import('../../utils/exportarExcelReportes');
      await exportarExcelReportes(pyg, flujo);
      toast.success('Excel generado');
    } catch {
      toast.error('No se pudo generar el Excel.');
    } finally {
      setExportando(false);
    }
  };

  const advertencias = tab === 'flujo' ? flujo?.advertencias ?? [] : pyg?.advertencias ?? [];

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-foreground mb-2">Reportes Financieros</h1>
          <p className="text-brand-brown/70">
            Resultado del negocio y movimiento de la caja
          </p>
        </div>

        <div className="flex gap-2">
          <Button
            onClick={handleExportPDF}
            variant="outline"
            disabled={loading || exportando || !pyg}
            className="flex items-center gap-2"
          >
            <FileText className="w-4 h-4" />
            PDF
          </Button>
          <Button
            onClick={handleExportExcel}
            variant="outline"
            disabled={loading || exportando || !pyg}
            className="flex items-center gap-2"
          >
            <FileSpreadsheet className="w-4 h-4" />
            Excel
          </Button>
        </div>
      </div>

      <ReportesControls
        anio={anio}
        vista={vista}
        modo={modoEfectivo}
        aniosDisponibles={anios}
        permiteModoCosecha={permiteModoCosecha}
        onAnioChange={setAnio}
        onVistaChange={setVista}
        onModoChange={setModo}
      />

      {error && (
        <div className="bg-white rounded-xl border border-red-200 p-8 text-center text-red-600">
          <p>{error}</p>
        </div>
      )}

      {loading && (
        <div className="bg-white rounded-xl border border-gray-200 p-8">
          <div className="flex items-center justify-center text-brand-brown/70">
            <Loader2 className="w-6 h-6 text-primary animate-spin mr-2" />
            <span>Cargando datos financieros…</span>
          </div>
        </div>
      )}

      {!loading && !error && pyg && flujo && (
        <>
          <AdvertenciasReporte advertencias={advertencias} />

          <Tabs value={tab} onValueChange={setTab} className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="pyg" className="flex items-center gap-2">
                <TrendingUp className="w-4 h-4" />
                P&amp;G
              </TabsTrigger>
              <TabsTrigger value="flujo" className="flex items-center gap-2">
                <Wallet className="w-4 h-4" />
                Flujo de Caja
              </TabsTrigger>
            </TabsList>

            <TabsContent value="pyg" className="mt-6">
              <TablaPyG reporte={pyg} />
            </TabsContent>

            <TabsContent value="flujo" className="mt-6">
              <TablaFlujoCaja reporte={flujo} />
            </TabsContent>
          </Tabs>
        </>
      )}
    </div>
  );
}
