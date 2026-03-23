import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft, Calendar, FileText, Loader2,
  Droplet, Leaf, Target, ChevronDown, ChevronUp,
} from 'lucide-react';
import { Button } from '../../ui/button';
import { useReporteAplicacion } from '../../../hooks/useReporteAplicacion';
import { generarPDFReporteCierre } from '../../../utils/generarPDFReporteCierre';
import { fetchDatosReporteCierre } from '../../../utils/fetchDatosReporteCierre';
import { HeroKPICards } from './HeroKPICards';
import { TechnicalSection } from './TechnicalSection';
import { EconomicSection } from './EconomicSection';
import { ProductComparisonTable } from './ProductComparisonTable';

interface ApplicationResultsDashboardProps {
  aplicacionId: string;
}

function formatFechaCorta(fecha?: string): string {
  if (!fecha) return '-';
  const [year, month, day] = fecha.split('T')[0].split('-');
  const meses = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  return `${parseInt(day)} ${meses[parseInt(month) - 1]} ${year}`;
}

function getTipoIcon(tipo: string | null) {
  const t = (tipo || '').toLowerCase();
  if (t.includes('fumig')) return <Droplet className="w-4 h-4" />;
  if (t.includes('fertil')) return <Leaf className="w-4 h-4" />;
  return <Target className="w-4 h-4" />;
}

export function ApplicationResultsDashboard({ aplicacionId }: ApplicationResultsDashboardProps) {
  const navigate = useNavigate();
  const {
    reporte,
    loading,
    error,
    aplicacionesComparables,
    seleccionarAnterior,
  } = useReporteAplicacion(aplicacionId);

  const [generandoPDF, setGenerandoPDF] = useState(false);
  const [metadataOpen, setMetadataOpen] = useState(false);

  const handleClose = () => navigate('/aplicaciones');

  const descargarPDF = async () => {
    if (!reporte) return;
    setGenerandoPDF(true);
    try {
      const datos = await fetchDatosReporteCierre(aplicacionId);
      await generarPDFReporteCierre(datos);
    } finally {
      setGenerandoPDF(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <div className="inline-block w-12 h-12 border-4 border-primary/20 border-t-primary rounded-full animate-spin mb-4" />
          <p className="text-brand-brown/70">Cargando reporte...</p>
        </div>
      </div>
    );
  }

  if (error || !reporte) {
    return (
      <div className="text-center py-12">
        <div className="inline-flex items-center justify-center w-20 h-20 bg-red-100 rounded-2xl mb-4">
          <span className="text-3xl">!</span>
        </div>
        <h2 className="text-2xl text-foreground mb-2">Error</h2>
        <p className="text-brand-brown/70 mb-4">{error}</p>
        <button onClick={handleClose} className="px-6 py-2 bg-primary hover:bg-primary-dark text-white rounded-xl transition-colors">
          Volver a Aplicaciones
        </button>
      </div>
    );
  }

  const esFertilizacion = (reporte.tipo_aplicacion || '').includes('Fertil');
  const containerLabel = esFertilizacion ? 'Bultos' : 'Canecas';

  return (
    <div className="space-y-6 pb-8">
      {/* ============================================================ */}
      {/* [A] HEADER */}
      {/* ============================================================ */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <button onClick={handleClose} className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
            <ArrowLeft className="w-5 h-5 text-brand-brown" />
          </button>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold text-foreground">
                {reporte.nombre_aplicacion || reporte.codigo_aplicacion || 'Reporte'}
              </h1>
              <span className="px-3 py-1 bg-primary/10 text-primary rounded-lg text-sm font-medium flex items-center gap-1.5">
                {getTipoIcon(reporte.tipo_aplicacion)}
                {reporte.tipo_aplicacion}
              </span>
            </div>
            <div className="flex items-center gap-3 text-sm text-brand-brown/70 mt-1">
              <span className="flex items-center gap-1">
                <Calendar className="w-4 h-4" />
                {formatFechaCorta(reporte.fecha_inicio)} - {formatFechaCorta(reporte.fecha_fin)}
              </span>
              {reporte.dias_aplicacion > 0 && (
                <>
                  <span className="text-brand-brown/30">|</span>
                  <span>{reporte.dias_aplicacion} dias</span>
                </>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Comparison selector */}
          <select
            onChange={(e) => seleccionarAnterior(e.target.value || null)}
            defaultValue=""
            className="px-4 py-2 pr-8 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary text-sm bg-white min-w-[200px] appearance-none"
          >
            <option value="">Comparar con...</option>
            {aplicacionesComparables.map((app) => (
              <option key={app.id} value={app.id}>
                {app.nombre || app.codigo} ({formatFechaCorta(app.fecha_cierre)})
              </option>
            ))}
          </select>

          {/* PDF export */}
          <Button
            onClick={descargarPDF}
            disabled={generandoPDF}
            className="bg-primary hover:bg-primary-dark text-white"
          >
            {generandoPDF ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <FileText className="w-4 h-4 mr-2" />
            )}
            Exportar PDF
          </Button>
        </div>
      </div>

      {/* Anterior banner */}
      {reporte.aplicacion_anterior_nombre && (
        <div className="bg-primary/5 border border-primary/20 rounded-xl px-4 py-3 flex items-center justify-between">
          <p className="text-sm text-foreground">
            Comparando con: <strong>{reporte.aplicacion_anterior_nombre}</strong>
          </p>
          <button
            onClick={() => seleccionarAnterior(null)}
            className="text-sm text-primary hover:text-primary-dark font-medium"
          >
            Quitar comparacion
          </button>
        </div>
      )}

      {/* ============================================================ */}
      {/* [B] HERO KPIs */}
      {/* ============================================================ */}
      <HeroKPICards
        financiero={reporte.financiero}
        canecasTotales={reporte.detalle_canecas.totales.canecas}
        totalArboles={reporte.total_arboles}
        totalJornales={reporte.detalle_jornales.totales.jornales_total?.real || 0}
        containerLabel={containerLabel}
        anterior={reporte.anterior}
      />

      {/* ============================================================ */}
      {/* [C] TECHNICAL SECTION */}
      {/* ============================================================ */}
      <TechnicalSection
        canecasPorLote={reporte.detalle_canecas.por_lote}
        canecasTotales={reporte.detalle_canecas.totales}
        jornalesPorLote={reporte.detalle_jornales.por_lote}
        jornalesTotales={reporte.detalle_jornales.totales}
        graficoCanecas={reporte.grafico_canecas_por_lote}
        graficoJornales={reporte.grafico_jornales_por_lote}
        containerLabel={containerLabel}
        detalle_productos_por_lote={reporte.detalle_productos.por_lote}
      />

      {/* ============================================================ */}
      {/* [D] ECONOMIC SECTION */}
      {/* ============================================================ */}
      <EconomicSection
        financiero={reporte.financiero}
        detalle_productos_por_lote={reporte.detalle_productos.por_lote}
        jornalesPorLote={reporte.detalle_jornales.por_lote}
        valorJornal={reporte.detalle_jornales.valor_jornal}
      />

      {/* ============================================================ */}
      {/* [E] PRODUCT COMPARISON */}
      {/* ============================================================ */}
      <ProductComparisonTable productos={reporte.detalle_productos.totales} />

      {/* ============================================================ */}
      {/* [F] METADATA (collapsible) */}
      {/* ============================================================ */}
      <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
        <button
          onClick={() => setMetadataOpen(!metadataOpen)}
          className="w-full px-6 py-4 flex items-center justify-between hover:bg-gray-50 transition-colors"
        >
          <h3 className="text-lg font-semibold text-foreground flex items-center gap-2">
            <FileText className="w-5 h-5 text-primary" />
            Observaciones y Metadata
          </h3>
          {metadataOpen ? <ChevronUp className="w-5 h-5 text-gray-400" /> : <ChevronDown className="w-5 h-5 text-gray-400" />}
        </button>

        {metadataOpen && (
          <div className="px-6 pb-5 border-t border-gray-100 pt-4">
            {reporte.alertas.length > 0 && (
              <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-lg">
                <p className="text-sm font-medium text-amber-800 mb-1">Alertas</p>
                <ul className="text-sm text-amber-700 list-disc list-inside">
                  {reporte.alertas.map((a, i) => <li key={i}>{a}</li>)}
                </ul>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-3">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-brand-brown/60">Fecha inicio real</span>
                  <span className="text-foreground">{formatFechaCorta(reporte.fecha_inicio)}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-brand-brown/60">Fecha fin real</span>
                  <span className="text-foreground">{formatFechaCorta(reporte.fecha_fin)}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-brand-brown/60">Dias de ejecucion</span>
                  <span className="text-foreground">{reporte.dias_aplicacion} dias</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-brand-brown/60">Arboles totales</span>
                  <span className="text-foreground">{reporte.total_arboles.toLocaleString('es-CO')}</span>
                </div>
              </div>
              <div className="space-y-3">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-brand-brown/60">Valor jornal</span>
                  <span className="text-foreground">${reporte.detalle_jornales.valor_jornal.toLocaleString('es-CO')}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-brand-brown/60">Tamano caneca</span>
                  <span className="text-foreground">{reporte.tamano_caneca}L</span>
                </div>
                {reporte.codigo_aplicacion && (
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-brand-brown/60">Codigo</span>
                    <span className="text-foreground">{reporte.codigo_aplicacion}</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
