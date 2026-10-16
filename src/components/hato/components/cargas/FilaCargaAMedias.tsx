// ARCHIVO: components/hato/components/cargas/FilaCargaAMedias.tsx
// DESCRIPCIÓN: una carga que quedó a medias, DENTRO de su tarjeta (dueño,
// 2026-10-16: sin avisos arriba de las tarjetas). «Ver foto» abre la foto
// ya subida para tener los datos a mano; «Continuar» reabre el flujo.

import type { PendienteCarga } from '@/utils/hato/produccionV2';

export function FilaCargaAMedias({
  pendiente,
  onVerFoto,
  onContinuar,
}: {
  pendiente: PendienteCarga;
  onVerFoto: (p: PendienteCarga) => void;
  onContinuar: (p: PendienteCarga) => void;
}) {
  return (
    <div className="flex flex-col gap-1 rounded-md border border-amber-200 bg-amber-50 px-3 pt-2 pb-1 text-sm text-amber-800">
      <span>{pendiente.texto}</span>
      <span className="-mx-2 flex items-center justify-end">
        {pendiente.foto && (
          <button type="button" onClick={() => onVerFoto(pendiente)} className="h-11 rounded-md px-2 font-medium text-amber-700 hover:bg-amber-100 sm:h-9">
            Ver foto
          </button>
        )}
        <button type="button" onClick={() => onContinuar(pendiente)} className="h-11 rounded-md px-2 font-semibold hover:bg-amber-100 sm:h-9">
          Continuar ›
        </button>
      </span>
    </div>
  );
}
