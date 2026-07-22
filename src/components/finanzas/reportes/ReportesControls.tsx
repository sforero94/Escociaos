import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { VISTAS } from '@/types/reportesFinancieros';
import type { ModoReporte, VistaReporte } from '@/types/reportesFinancieros';

interface Props {
  anio: number;
  vista: VistaReporte;
  modo: ModoReporte;
  aniosDisponibles: number[];
  /** El modo cosecha solo aplica a aguacate y solo en el P&G. */
  permiteModoCosecha: boolean;
  onAnioChange: (anio: number) => void;
  onVistaChange: (vista: VistaReporte) => void;
  onModoChange: (modo: ModoReporte) => void;
}

/**
 * Controles del reporte: año, vista y eje de columnas.
 *
 * No reutiliza `FiltrosGlobales` a propósito. Ese componente ofrece región y
 * multi-negocio: la región NO existe en `fin_transacciones_ganado`, así que
 * filtrar por ella borraría todo el ganado en silencio.
 */
export function ReportesControls({
  anio,
  vista,
  modo,
  aniosDisponibles,
  permiteModoCosecha,
  onAnioChange,
  onVistaChange,
  onModoChange,
}: Props) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4">
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="flex-1">
          <label className="block text-sm text-brand-brown/70 mb-1">Negocio</label>
          <Select value={vista} onValueChange={(v) => onVistaChange(v as VistaReporte)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {VISTAS.map((v) => (
                <SelectItem key={v.key} value={v.key}>
                  {v.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex-1">
          <label className="block text-sm text-brand-brown/70 mb-1">Año</label>
          <Select value={String(anio)} onValueChange={(v) => onAnioChange(Number(v))}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {aniosDisponibles.map((a) => (
                <SelectItem key={a} value={String(a)}>
                  {a}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {permiteModoCosecha && (
          <div className="flex-1">
            <label className="block text-sm text-brand-brown/70 mb-1">Columnas</label>
            <Select value={modo} onValueChange={(v) => onModoChange(v as ModoReporte)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="trimestres">Trimestres acumulados</SelectItem>
                <SelectItem value="cosecha">Por cosecha</SelectItem>
              </SelectContent>
            </Select>
          </div>
        )}
      </div>
    </div>
  );
}
