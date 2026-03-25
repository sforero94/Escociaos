import { useState, useCallback } from 'react';
import { FileDown, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogBody,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { generarPDFInformeEsco } from '@/utils/generarPDFInformeEsco';
import type { ChartSpec } from '@/types/chat';

interface ContentBlock {
  type: 'text' | 'chart';
  value?: string;
  spec?: ChartSpec;
}

export interface ExportData {
  bloques: ContentBlock[];
  userQuestion: string;
  bubbleElement: HTMLElement;
}

interface ExportarInformeDialogProps {
  data: ExportData | null;
  titulo: string;
  onTituloChange: (titulo: string) => void;
  onClose: () => void;
}

async function captureCharts(container: HTMLElement): Promise<Map<number, string>> {
  const html2canvas = (await import('html2canvas')).default;
  const charts = container.querySelectorAll<HTMLElement>('.recharts-wrapper');
  const images = new Map<number, string>();

  for (let i = 0; i < charts.length; i++) {
    const canvas = await html2canvas(charts[i], {
      scale: 2,
      backgroundColor: '#ffffff',
      logging: false,
    });
    images.set(i, canvas.toDataURL('image/png'));
  }

  return images;
}

export function ExportarInformeDialog({
  data,
  titulo,
  onTituloChange,
  onClose,
}: ExportarInformeDialogProps) {
  const [generating, setGenerating] = useState(false);

  const handleDownload = useCallback(async () => {
    if (!data) return;
    setGenerating(true);

    try {
      const chartImages = await captureCharts(data.bubbleElement);

      let chartIndex = 0;
      const pdfBloques = data.bloques.map((b) => {
        if (b.type === 'chart' && b.spec) {
          const img = chartImages.get(chartIndex++);
          return { type: 'chart' as const, chartImage: img, chartTitle: b.spec.title };
        }
        return { type: 'text' as const, value: b.value };
      });

      await generarPDFInformeEsco({
        titulo,
        bloques: pdfBloques,
        fechaGeneracion: new Date(),
      });

      toast.success('Informe descargado exitosamente');
      onClose();
    } catch (err) {
      console.error('Error generating PDF:', err);
      toast.error('No se pudo generar el informe. Intenta de nuevo.');
    } finally {
      setGenerating(false);
    }
  }, [data, titulo, onClose]);

  return (
    <Dialog open={!!data} onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        size="sm"
        style={{ zIndex: 100 }}
        overlayStyle={{ zIndex: 99 }}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileDown className="h-5 w-5 text-primary" />
            Exportar como informe
          </DialogTitle>
          <DialogDescription>
            Genera un PDF con esta respuesta formateado como informe profesional.
          </DialogDescription>
        </DialogHeader>

        <DialogBody>
          <div className="space-y-4 py-2">
            <div>
              <label className="mb-1.5 block text-sm font-medium">
                Título del informe
              </label>
              <input
                type="text"
                value={titulo}
                onChange={(e) => onTituloChange(e.target.value)}
                className="w-full rounded-lg border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                placeholder="Título del informe..."
              />
            </div>

            {/* Mini preview */}
            <div className="rounded-lg border bg-muted/30 p-4">
              <p className="mb-1 text-xs text-muted-foreground">Vista previa</p>
              <div className="rounded border bg-white p-3 shadow-sm" style={{ maxHeight: '200px', overflow: 'hidden' }}>
                <div className="mb-2 border-b border-primary/30 pb-2">
                  <p className="text-xs font-bold text-primary">{titulo || 'Sin título'}</p>
                  <p className="text-[9px] text-muted-foreground">
                    Finca Escocia · {new Date().toLocaleDateString('es-CO')}
                  </p>
                </div>
                <div className="space-y-1">
                  {data?.bloques.slice(0, 3).map((b, i) =>
                    b.type === 'text' ? (
                      <p key={i} className="line-clamp-2 text-[9px] text-muted-foreground">
                        {b.value?.replace(/[#*`]/g, '').slice(0, 120)}
                      </p>
                    ) : (
                      <div key={i} className="flex h-6 items-center gap-1 rounded bg-primary/5 px-1">
                        <div className="h-3 w-3 rounded-sm bg-primary/20" />
                        <span className="text-[8px] text-primary/60">{b.spec?.title}</span>
                      </div>
                    ),
                  )}
                </div>
              </div>
            </div>
          </div>
        </DialogBody>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={generating}>
            Cancelar
          </Button>
          <Button onClick={handleDownload} disabled={generating}>
            {generating ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Generando...
              </>
            ) : (
              <>
                <FileDown className="mr-2 h-4 w-4" />
                Descargar PDF
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
