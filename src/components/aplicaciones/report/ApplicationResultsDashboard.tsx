import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronDown, ChevronUp, FileText, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AplicacionShell } from '@/components/aplicaciones/shared/AplicacionShell';
import { useReporteAplicacion } from '@/hooks/useReporteAplicacion';
import { generarPDFReporteCierre } from '@/utils/generarPDFReporteCierre';
import { fetchDatosReporteCierre } from '@/utils/fetchDatosReporteCierre';
import { formatearMoneda, formatearNumero, formatDateRange, formatShortDate } from '@/utils/format';
import { HeroKPICards } from './HeroKPICards';
import { TechnicalSection } from './TechnicalSection';
import { EconomicSection } from './EconomicSection';
import { ProductComparisonTable } from './ProductComparisonTable';

interface ApplicationResultsDashboardProps {
  aplicacionId: string;
}

/** Envoltorio nulo-seguro sobre `formatDateRange` (format.ts) — un reporte cuya aplicación no
 * registró fecha de inicio/fin real muestra "—", nunca "Invalid Date". */
function rangoFechas(inicio?: string | null, fin?: string | null): string {
  if (!inicio || !fin) return '—';
  return formatDateRange(inicio, fin);
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

  // Loading / error: sin rediseño propio — funcionan, no están en la lista de defectos
  // (spec §4, "Estado que no diseñé a propósito").
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
  const titulo = reporte.nombre_aplicacion || reporte.codigo_aplicacion || 'Reporte';
  const subtitulo = [
    reporte.tipo_aplicacion || null,
    rangoFechas(reporte.fecha_inicio, reporte.fecha_fin),
    reporte.dias_aplicacion > 0 ? `${reporte.dias_aplicacion} día${reporte.dias_aplicacion === 1 ? '' : 's'}` : null,
  ].filter(Boolean).join(' · ');

  return (
    <AplicacionShell
      titulo={titulo}
      subtitulo={subtitulo}
      estado="Cerrada"
      acciones={(
        <>
          <Select
            value={reporte.aplicacion_anterior_id ?? undefined}
            onValueChange={(id) => seleccionarAnterior(id)}
          >
            <SelectTrigger className="min-w-[220px]" aria-label="Comparar con una aplicación anterior">
              <SelectValue placeholder="Comparar con…" />
            </SelectTrigger>
            <SelectContent>
              {aplicacionesComparables.map((app) => (
                <SelectItem key={app.id} value={app.id}>
                  {app.nombre || app.codigo}{app.fecha_cierre ? ` (${formatShortDate(app.fecha_cierre)})` : ''}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Button onClick={descargarPDF} disabled={generandoPDF}>
            {generandoPDF ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" aria-hidden="true" />
            ) : (
              <FileText className="w-4 h-4 mr-2" aria-hidden="true" />
            )}
            Exportar PDF
          </Button>
        </>
      )}
    >
      <div className="space-y-6 pb-8">
        {reporte.aplicacion_anterior_nombre && (
          <div className="flex items-center justify-between gap-3 rounded-xl border border-primary/25 bg-primary/5 px-4 py-3 flex-wrap">
            <p className="text-sm text-foreground">
              Comparando con: <strong>{reporte.aplicacion_anterior_nombre}</strong>
            </p>
            <button
              onClick={() => seleccionarAnterior(null)}
              className="text-sm font-medium text-primary hover:text-primary-dark"
            >
              Quitar comparación
            </button>
          </div>
        )}

        <HeroKPICards
          financiero={reporte.financiero}
          canecasTotales={reporte.detalle_canecas.totales.canecas}
          totalArboles={reporte.total_arboles}
          totalJornales={reporte.detalle_jornales.totales.jornales_total?.real || 0}
          containerLabel={containerLabel}
          anterior={reporte.anterior}
        />

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

        <EconomicSection
          financiero={reporte.financiero}
          detalle_productos_por_lote={reporte.detalle_productos.por_lote}
          jornalesPorLote={reporte.detalle_jornales.por_lote}
          valorJornal={reporte.detalle_jornales.valor_jornal}
        />

        <ProductComparisonTable productos={reporte.detalle_productos.totales} />

        <Collapsible open={metadataOpen} onOpenChange={setMetadataOpen}>
          <Card className="gap-0 overflow-hidden py-0">
            <CollapsibleTrigger className="flex w-full items-center justify-between gap-2 px-6 py-4 text-left transition-colors hover:bg-gray-50">
              <span className="flex items-center gap-2 text-lg font-semibold text-foreground">
                <FileText className="size-[18px] text-primary" aria-hidden="true" />
                Observaciones y Metadata
              </span>
              {metadataOpen ? (
                <ChevronUp className="size-4 text-gray-400" aria-hidden="true" />
              ) : (
                <ChevronDown className="size-4 text-gray-400" aria-hidden="true" />
              )}
            </CollapsibleTrigger>

            <CollapsibleContent className="border-t border-gray-100 px-6 pb-5 pt-4">
              {reporte.alertas.length > 0 && (
                <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-3">
                  <p className="mb-1 text-sm font-medium text-amber-800">Alertas</p>
                  <ul className="list-inside list-disc text-sm text-amber-700">
                    {reporte.alertas.map((a, i) => <li key={i}>{a}</li>)}
                  </ul>
                </div>
              )}

              <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                <div className="space-y-3">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Fecha inicio real</span>
                    <span className="tabular-nums text-foreground">{reporte.fecha_inicio ? formatShortDate(reporte.fecha_inicio) : '—'}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Fecha fin real</span>
                    <span className="tabular-nums text-foreground">{reporte.fecha_fin ? formatShortDate(reporte.fecha_fin) : '—'}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Días de ejecución</span>
                    <span className="tabular-nums text-foreground">{reporte.dias_aplicacion} día{reporte.dias_aplicacion === 1 ? '' : 's'}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Árboles totales</span>
                    <span className="tabular-nums text-foreground">{formatearNumero(reporte.total_arboles, 0)}</span>
                  </div>
                </div>
                <div className="space-y-3">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Valor jornal</span>
                    <span className="tabular-nums text-foreground">{formatearMoneda(reporte.detalle_jornales.valor_jornal)}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Tamaño caneca</span>
                    <span className="tabular-nums text-foreground">{reporte.tamano_caneca}L</span>
                  </div>
                  {reporte.codigo_aplicacion && (
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">Código</span>
                      <span className="tabular-nums text-foreground">{reporte.codigo_aplicacion}</span>
                    </div>
                  )}
                </div>
              </div>
            </CollapsibleContent>
          </Card>
        </Collapsible>
      </div>
    </AplicacionShell>
  );
}
