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

import { useState } from 'react';
import { Loader2, AlertTriangle, Upload, FileSpreadsheet } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useHatoChequeos } from './hooks/useHatoChequeos';
import { SubirChequeoExcel } from './components/SubirChequeoExcel';
import { formatShortDate, formatNumber } from '@/utils/format';

export function ChequeosList() {
  const { chequeos, loading, error, reload } = useHatoChequeos();
  const [mostrarSubida, setMostrarSubida] = useState(false);

  return (
    <div className="min-h-screen min-h-[100dvh] bg-gray-50 p-4 lg:p-8">
      <div className="max-w-5xl mx-auto w-full">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
          <div>
            <h1 className="text-foreground mb-1">Chequeos</h1>
            <p className="text-sm text-gray-500">Chequeo veterinario bimestral — sube el Excel que Martha ya diligencia</p>
          </div>
          <Button onClick={() => setMostrarSubida(true)}>
            <Upload className="w-4 h-4 mr-2" />
            Subir chequeo (.xlsx)
          </Button>
        </div>

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
                </tr>
              </thead>
              <tbody>
                {chequeos.map((c, i) => (
                  <tr key={c.id} className={`border-t border-gray-100 ${i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}`}>
                    <td className="px-3 py-2.5 whitespace-nowrap font-medium">{formatShortDate(c.fecha)}</td>
                    <td className="px-3 py-2.5 whitespace-nowrap">{c.veterinario ?? '—'}</td>
                    <td className="px-3 py-2.5 whitespace-nowrap capitalize">{c.fuente}</td>
                    <td className="px-3 py-2.5 text-right whitespace-nowrap">{formatNumber(c.totalVacas)}</td>
                    <td className="px-3 py-2.5 whitespace-nowrap capitalize">{c.estado}</td>
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
