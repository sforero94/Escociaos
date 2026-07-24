// ARCHIVO: components/hato/ChequeosList.tsx
// DESCRIPCIÓN: Ruta `/hato-lechero/chequeos` (S4, plan §7.5). Lista de
// chequeos ya cargados + botón para subir un chequeo nuevo (B0/V10 -- el
// ÚNICO camino de entrada del chequeo desde D-4, 2026-07-22: no hay
// internet en la finca).
//
// `ChequeoCapturaGrid` (B1, captura manual en grilla) NO se implementa en
// esta sesión -- ver la decisión D-4 del dueño (2026-07-22, plan §8):
// "B1 ChequeoCapturaGrid se elimina del alcance. La ruta
// /hato-lechero/chequeos/:id ya no necesita una grilla editable de
// captura; sí una vista de revisión del diff antes de comprometer." Esa
// nota reemplaza explícitamente al bullet de alcance de S4 que todavía
// mencionaba la grilla como entregable -- se documenta también en el
// reporte de esta sesión.
//
// Figma alignment spec §5 (Wave 2a) agrega: `HatoPageHeader` compartido y
// filas clicables -> `/hato-lechero/chequeos/:id` (`ChequeoDetalle.tsx`) --
// "de lo contrario es una lista inútil" (palabras del dueño).

import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Loader2, AlertTriangle, Upload, FileSpreadsheet, ChevronRight, FileDown } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { useHatoChequeos } from './hooks/useHatoChequeos';
import { useAnimalesParaPlanillaChequeo } from './hooks/useAnimalesParaPlanillaChequeo';
import { SubirChequeoExcel } from './components/SubirChequeoExcel';
import { HatoPageHeader } from './components/HatoPageHeader';
import { formatShortDate, formatNumber } from '@/utils/format';
import {
  descargarPlanillaChequeo,
  construirTituloHojaChequeo,
  construirNombreHojaChequeo,
  isoATextoDDMMYYYY,
  type FilaPlanillaChequeo,
} from '@/utils/hato/exportarPlanillaChequeo';

/**
 * B5.1 -- planilla PRE-LLENADA para el PRÓXIMO chequeo (aún sin fecha real:
 * D-4, no hay internet en la finca, así que el chequeo nunca se agenda en la
 * app). El título/nombre de hoja usan la fecha de HOY como placeholder --
 * quien transcriba las notas del veterinario debe corregir la celda del
 * título a la fecha real del examen antes de volver a subir el archivo
 * (misma columna que gobierna la fecha de cualquier chequeo, ver
 * `parseFechaChequeo`). Las columnas que el veterinario actualiza (Sexo
 * cría, Fecha Servicio, Toro, Estado, Tratamiento) quedan en blanco;
 * identidad + PL/#Partos/Última Cría + Secar/Parto Probable (referencia de
 * solo lectura, ya derivados por el motor) se pre-llenan.
 */
function filaPlanillaPrellenada(animal: {
  numero: number | null;
  nombre: string | null;
  pl: number | null;
  numPartos: number;
  ultimoPartoFecha: string | null;
  fechaSecar: string | null;
  fechaProbableParto: string | null;
}): FilaPlanillaChequeo {
  return {
    numero: animal.numero,
    nombre: animal.nombre,
    pl: animal.pl,
    numPartos: animal.numPartos,
    ultimaCria: isoATextoDDMMYYYY(animal.ultimoPartoFecha),
    sexoCria: null,
    fechaServicio: null,
    toro: null,
    estado: null,
    secar: isoATextoDDMMYYYY(animal.fechaSecar),
    partoProbable: isoATextoDDMMYYYY(animal.fechaProbableParto),
    tratamiento: null,
  };
}

export function ChequeosList() {
  const { chequeos, loading, error, reload } = useHatoChequeos();
  const { animales: animalesParaPlanilla, loading: cargandoAnimales } = useAnimalesParaPlanillaChequeo();
  const [mostrarSubida, setMostrarSubida] = useState(false);
  const [exportando, setExportando] = useState(false);

  const handleExportarPlanilla = async () => {
    setExportando(true);
    try {
      const hoy = new Date().toISOString().slice(0, 10);
      await descargarPlanillaChequeo(
        {
          tituloHoja: construirTituloHojaChequeo(hoy),
          nombreHoja: construirNombreHojaChequeo(hoy),
          filas: animalesParaPlanilla.map(filaPlanillaPrellenada),
        },
        `planilla-proximo-chequeo-${hoy}.xlsx`,
      );
      toast.success('Planilla exportada. Actualiza la fecha del título con la del chequeo real antes de subirla.');
    } catch {
      toast.error('No se pudo exportar la planilla.');
    } finally {
      setExportando(false);
    }
  };

  return (
    <div className="min-h-screen min-h-[100dvh] bg-gray-50 p-4 lg:p-8">
      <div className="max-w-5xl mx-auto w-full">
        <HatoPageHeader
          breadcrumb="Hato Lechero"
          section="Chequeos"
          title="Chequeos"
          subtitle="Chequeo veterinario bimestral — sube el Excel que Martha ya diligencia"
          actions={
            <div className="flex flex-wrap items-center gap-3">
              <Button
                variant="outline"
                onClick={handleExportarPlanilla}
                disabled={exportando || cargandoAnimales}
              >
                {exportando ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <FileDown className="w-4 h-4 mr-2" />
                )}
                Exportar planilla para el próximo chequeo
              </Button>
              <Button onClick={() => setMostrarSubida(true)}>
                <Upload className="w-4 h-4 mr-2" />
                Subir chequeo (.xlsx)
              </Button>
            </div>
          }
        />

        {error && (
          <div className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 mb-6 text-sm text-red-700">
            <AlertTriangle className="w-4 h-4 flex-shrink-0" />
            {error}
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-6 h-6 animate-spin text-primary" />
          </div>
        ) : chequeos.length === 0 ? (
          <div className="rounded-xl border border-gray-200 bg-white p-8 text-center">
            <FileSpreadsheet className="w-10 h-10 text-gray-300 mx-auto mb-3" />
            <p className="text-sm text-gray-500 mb-4">Todavía no se ha cargado ningún chequeo.</p>
            <Button onClick={() => setMostrarSubida(true)} variant="outline">
              <Upload className="w-4 h-4 mr-2" />
              Subir el primer chequeo
            </Button>
          </div>
        ) : (
          <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Fecha</th>
                  <th className="px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Veterinario</th>
                  <th className="px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Fuente</th>
                  <th className="px-3 py-2.5 text-right text-xs font-semibold uppercase tracking-wide text-gray-500">Vacas</th>
                  <th className="px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Estado</th>
                  <th className="px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-gray-500" />
                </tr>
              </thead>
              <tbody>
                {chequeos.map((c, i) => (
                  <tr key={c.id} className={`border-t border-gray-100 hover:bg-gray-50 ${i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}`}>
                    <td className="px-3 py-2.5 whitespace-nowrap font-medium">
                      <Link to={`/hato-lechero/chequeos/${c.id}`} className="hover:text-primary">
                        {formatShortDate(c.fecha)}
                      </Link>
                    </td>
                    <td className="px-3 py-2.5 whitespace-nowrap">{c.veterinario ?? '—'}</td>
                    <td className="px-3 py-2.5 whitespace-nowrap capitalize">{c.fuente}</td>
                    <td className="px-3 py-2.5 text-right whitespace-nowrap">{formatNumber(c.totalVacas)}</td>
                    <td className="px-3 py-2.5 whitespace-nowrap capitalize">{c.estado}</td>
                    <td className="px-3 py-2.5 whitespace-nowrap text-right">
                      <Link
                        to={`/hato-lechero/chequeos/${c.id}`}
                        className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                      >
                        Ver detalle <ChevronRight className="w-3 h-3" />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <SubirChequeoExcel
          open={mostrarSubida}
          onOpenChange={setMostrarSubida}
          onCompletado={reload}
        />
      </div>
    </div>
  );
}
