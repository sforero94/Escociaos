import { AlertTriangle, Download } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { formatearMoneda } from '@/utils/format';
import { SeccionHeader } from './SeccionInsumosCierre';

interface SeccionConfirmarCierreProps {
  costoInsumos: number;
  costoManoObra: number;
  costoTotal: number;
  costoPorArbol: number;
  onDescargarPDF: () => void;
}

/**
 * Sección ③ del Cierre (`W03-cierre-v2.md` §1/§4) — el Resumen de Costos aparece UNA sola vez
 * acá (antes se repetía entre el paso de Labores y el de Confirmación); el recap completo de
 * "Información General"/"Ejecución" del antiguo Paso 3 se elimina por completo: esos datos ya
 * están visibles arriba, en la misma página con scroll continuo.
 */
export function SeccionConfirmarCierre({
  costoInsumos,
  costoManoObra,
  costoTotal,
  costoPorArbol,
  onDescargarPDF,
}: SeccionConfirmarCierreProps) {
  return (
    <div className="space-y-4">
      <SeccionHeader
        numero={3}
        titulo="Confirmar cierre"
        descripcion="Los números de arriba ya se vieron una vez — no se repiten aquí."
      />

      <Card className="grid grid-cols-2 gap-4 bg-gradient-to-br from-primary/5 to-secondary/10 p-5 sm:grid-cols-4">
        <CeldaCosto label="Insumos" valor={formatearMoneda(costoInsumos)} />
        <CeldaCosto label="Mano de Obra" valor={formatearMoneda(costoManoObra)} />
        <CeldaCosto label="Total" valor={formatearMoneda(costoTotal)} destacado />
        <CeldaCosto label="Costo/Árbol" valor={formatearMoneda(costoPorArbol)} />
      </Card>

      <Alert variant="warning">
        <AlertTriangle />
        <AlertDescription>
          <b className="font-semibold">Importante:</b> cerrar esta aplicación descuenta el
          inventario, completa la tarea de labor y congela el registro. No podrás deshacerlo —
          revisa el resumen antes de confirmar.
        </AlertDescription>
      </Alert>

      <Button type="button" variant="outline" className="w-full" onClick={onDescargarPDF}>
        <Download className="size-4" />
        Descargar Reporte de Cierre (PDF)
      </Button>
    </div>
  );
}

function CeldaCosto({
  label,
  valor,
  destacado = false,
}: {
  label: string;
  valor: string;
  destacado?: boolean;
}) {
  return (
    <div>
      <p className="mb-1 text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p
        className={
          destacado
            ? 'text-lg font-bold tabular-nums text-primary-dark'
            : 'text-base font-semibold tabular-nums text-foreground'
        }
      >
        {valor}
      </p>
    </div>
  );
}
