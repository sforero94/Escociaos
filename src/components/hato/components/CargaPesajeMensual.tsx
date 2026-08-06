// ARCHIVO: components/hato/components/CargaPesajeMensual.tsx
// DESCRIPCIÓN: S5 de `docs/plan_hato_ronda_agosto_2026.md` -- el bloque de
// `/hato-lechero/produccion` (pestaña Registrar) que reúne los dos
// artefactos de la planilla MENSUAL de pesaje: exportar el PDF en blanco
// para imprimir (punto 1 del brief -- "lo de mayor valor de la sesión") y
// cargar la planilla ya diligenciada por foto (punto 2). Un mes elegido en
// un único selector gobierna ambos: el PDF que se imprime y la foto que se
// sube deben referirse al MISMO mes, o el round-trip no cierra.
//
// El roster que exporta el PDF es SIEMPRE el vigente en el momento de
// exportar (`etapa='vaca' AND estado='activa'`, `useProduccionHato.
// fetchVacasActivas` -- MISMO universo que ya usa el grid semanal) -- así
// se evita el problema que motivó esta sesión: la planilla de junio traía
// CHISPA y DACOTA (vendidas hace rato) y le faltaba VICTORIA.

import { useState } from 'react';
import { Loader2, Printer, Camera } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useProduccionHato } from '../hooks/useProduccionHato';
import { SubirPesajeFoto } from './SubirPesajeFoto';
import { descargarPlanillaPesajePDF } from '@/utils/hato/exportarPlanillaPesajePDF';
import { fechasPorSemanaDelMes } from '@/utils/hato/exportarPlanillaPesaje';
import { obtenerFechaHoy } from '@/utils/fechas';

function mesActualISO(): string {
  return obtenerFechaHoy().slice(0, 7); // 'AAAA-MM'
}

export function CargaPesajeMensual({ onGuardado }: { onGuardado?: () => void }) {
  const hook = useProduccionHato();
  const [mesSeleccionado, setMesSeleccionado] = useState(mesActualISO());
  const [exportandoPdf, setExportandoPdf] = useState(false);
  const [subirOpen, setSubirOpen] = useState(false);

  const [anioTexto, mesTexto] = mesSeleccionado.split('-');
  const anio = parseInt(anioTexto, 10);
  const mes = parseInt(mesTexto, 10);
  const mesValido = Number.isInteger(anio) && Number.isInteger(mes) && mes >= 1 && mes <= 12;

  const handleExportarPdf = async () => {
    if (!mesValido) return;
    setExportandoPdf(true);
    try {
      const [config, vacas] = await Promise.all([hook.fetchDiaPesajeSemanal(), hook.fetchVacasActivas()]);
      const fechasPorSemana = fechasPorSemanaDelMes(anio, mes, config.iso);
      // `HatoVacaActiva.nombre` es `string | null` (columna nullable); una
      // vaca activa sin nombre no puede imprimirse en la planilla (D-1, el
      // nombre ES la identidad) -- se excluye en vez de imprimir una fila
      // sin ancla, misma regla que `construirRosterPlanilla` (chequeo).
      const animales = vacas.filter((v): v is typeof v & { nombre: string } => Boolean(v.nombre?.trim()));
      await descargarPlanillaPesajePDF(
        { anio, mes, fechasPorSemana, animales },
        `planilla-pesaje-${mesSeleccionado}.pdf`,
      );
      toast.success('Planilla lista para imprimir.');
    } catch (err) {
      const mensaje = err instanceof Error ? err.message : 'No se pudo generar el PDF de la planilla.';
      toast.error(mensaje);
    } finally {
      setExportandoPdf(false);
    }
  };

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <h3 className="text-sm font-semibold text-gray-900">Planilla mensual de pesaje</h3>
      <p className="text-xs text-gray-500 mb-3">
        Imprime la planilla en blanco del mes, diligénciala en el corral y súbela por foto.
      </p>

      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="mes-planilla-pesaje" className="text-xs text-gray-500">
            Mes
          </Label>
          <Input
            id="mes-planilla-pesaje"
            type="month"
            value={mesSeleccionado}
            onChange={(e) => setMesSeleccionado(e.target.value)}
            className="w-auto"
          />
        </div>

        <Button variant="outline" size="sm" onClick={handleExportarPdf} disabled={exportandoPdf || !mesValido}>
          {exportandoPdf ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <Printer className="w-4 h-4 mr-1.5" />}
          Planilla para imprimir (PDF)
        </Button>

        <Button size="sm" onClick={() => setSubirOpen(true)} disabled={!mesValido}>
          <Camera className="w-4 h-4 mr-1.5" /> Cargar pesaje por foto
        </Button>
      </div>

      {mesValido && (
        <SubirPesajeFoto
          open={subirOpen}
          onOpenChange={setSubirOpen}
          anioInicial={anio}
          mesInicial={mes}
          onCompletado={onGuardado}
        />
      )}
    </div>
  );
}
