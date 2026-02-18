import { useState, useEffect } from 'react';
import { Download, Loader2, FileText, Calendar } from 'lucide-react';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../ui/table';
import { toast } from 'sonner';
import {
  fetchHistorialReportes,
  descargarReportePDF,
  descargarBlob,
} from '../../utils/reporteSemanalService';
import type { ReporteSemanalMetadata } from '../../types/reporteSemanal';
import { formatearFechaCorta, formatearFechaHora } from '../../utils/fechas';

export function HistorialReportes() {
  const [reportes, setReportes] = useState<ReporteSemanalMetadata[]>([]);
  const [loading, setLoading] = useState(true);
  const [descargando, setDescargando] = useState<string | null>(null);

  useEffect(() => {
    cargarHistorial();
  }, []);

  const cargarHistorial = async () => {
    try {
      setLoading(true);
      const data = await fetchHistorialReportes();
      setReportes(data);
    } catch (error: any) {
      toast.error('Error al cargar historial de reportes');
    } finally {
      setLoading(false);
    }
  };

  const handleDescargar = async (reporte: ReporteSemanalMetadata) => {
    try {
      setDescargando(reporte.id);
      const blob = await descargarReportePDF(reporte.url_storage);
      const filename = `reporte-semana-${reporte.ano || ''}-S${String(reporte.numero_semana).padStart(2, '0')}.pdf`;
      descargarBlob(blob, filename);
      toast.success('PDF descargado');
    } catch (error: any) {
      toast.error('Error al descargar el reporte');
    } finally {
      setDescargando(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 text-[#73991C] animate-spin" />
      </div>
    );
  }

  if (reportes.length === 0) {
    return (
      <div className="text-center py-12 text-gray-400">
        <FileText className="w-12 h-12 mx-auto mb-3 opacity-50" />
        <p>No hay reportes generados aún</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Semana</TableHead>
            <TableHead>Período</TableHead>
            <TableHead>Generado por</TableHead>
            <TableHead>Fecha</TableHead>
            <TableHead className="text-right">Acciones</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {reportes.map(reporte => (
            <TableRow key={reporte.id}>
              <TableCell>
                <Badge variant="secondary">
                  S{String(reporte.numero_semana).padStart(2, '0')}
                </Badge>
              </TableCell>
              <TableCell className="text-sm text-gray-600">
                {formatearFechaCorta(reporte.fecha_inicio)} — {formatearFechaCorta(reporte.fecha_fin)}
              </TableCell>
              <TableCell className="text-sm">{reporte.generado_por_nombre || '-'}</TableCell>
              <TableCell className="text-sm text-gray-500">
                {formatearFechaHora(reporte.created_at)}
              </TableCell>
              <TableCell className="text-right">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleDescargar(reporte)}
                  disabled={descargando === reporte.id}
                >
                  {descargando === reporte.id ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Download className="w-4 h-4" />
                  )}
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
