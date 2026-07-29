// ARCHIVO: components/hato/components/DetalleQuincenaVentaDialog.tsx
// DESCRIPCIÓN: Diálogo de detalle que abre `GraficoLitrosQuincenal.tsx` al
// hacer clic en una barra (owner feedback, este rework: "If I click on one
// bar, I want to see a simple dialog showing total litros, money value, avg
// price, avg l/cow"). Toda la aritmética viene de
// `detalleQuincenaVenta` (`hatoProduccion.ts`) -- este componente solo
// consulta el resultado y renderiza. Contrato de diálogos (CLAUDE.md
// "Dialog Size System"): `DialogContent size="sm"` + `DialogBody`.
//
// La procedencia (medido/derivado_mensual) es ahora el hogar principal de
// ese dato -- el borde punteado ámbar que antes lo marcaba en la barra se
// retiró (owner feedback: "no dashed line ... seems cleaner").

import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogBody } from '@/components/ui/dialog';
import { formatNumber, formatCurrency, formatDateRange } from '@/utils/format';
import { detalleQuincenaVenta } from '@/utils/hatoProduccion';
import type { HatoProduccionQuincenalConIngreso } from '../hooks/useProduccionHato';

const MESES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];

function tituloQuincena(fila: HatoProduccionQuincenalConIngreso): string {
  if (fila.fecha_inicio && fila.fecha_fin) return formatDateRange(fila.fecha_inicio, fila.fecha_fin);
  return `${MESES[fila.mes - 1]} ${fila.anio} · ${fila.quincena}ª quincena`;
}

function FilaDato({ label, valor }: { label: string; valor: string }) {
  return (
    <div className="rounded-lg bg-gray-50 p-3">
      <p className="text-xs text-gray-500">{label}</p>
      <p className="text-lg font-bold text-gray-900" style={{ fontVariantNumeric: 'tabular-nums' }}>
        {valor}
      </p>
    </div>
  );
}

export function DetalleQuincenaVentaDialog({
  fila,
  open,
  onOpenChange,
}: {
  fila: HatoProduccionQuincenalConIngreso | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  if (!fila) return null;

  const detalle = detalleQuincenaVenta({
    litrosTotal: fila.litros_total,
    numVacasOrdeno: fila.num_vacas_ordeno,
    origenDato: fila.origen_dato,
    finIngreso: fila.finIngreso ? { valor: fila.finIngreso.valor, cantidad: fila.finIngreso.cantidad } : null,
  });
  const esDerivado = fila.origen_dato === 'derivado_mensual';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="sm">
        <DialogHeader>
          <DialogTitle>Detalle de la quincena</DialogTitle>
          <DialogDescription>{tituloQuincena(fila)}</DialogDescription>
        </DialogHeader>
        <DialogBody className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <FilaDato label="Litros totales" valor={detalle.litrosTotal != null ? `${formatNumber(detalle.litrosTotal, 1)} L` : '—'} />
            <FilaDato label="Valor" valor={detalle.valor != null ? formatCurrency(detalle.valor) : '—'} />
            <FilaDato label="Precio promedio" valor={detalle.precioPromedio != null ? `${formatCurrency(detalle.precioPromedio)}/L` : '—'} />
            <FilaDato label="L/vaca promedio" valor={detalle.lVacaPromedio != null ? `${formatNumber(detalle.lVacaPromedio, 1)} L` : '—'} />
          </div>

          {esDerivado ? (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
              <p className="text-xs font-semibold text-amber-700">Derivada de un ingreso mensual histórico</p>
              <p className="text-xs text-amber-700 mt-1">
                Esta fila es una partición de 15/N días de una factura mensual del Pomar anterior a la captura
                quincenal (backfill) — no es una venta confirmada por quincena. Es de solo lectura: se corrige desde
                Finanzas → Ingresos, nunca desde aquí.
              </p>
            </div>
          ) : (
            <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
              <p className="text-xs font-semibold text-gray-700">Quincena medida</p>
              <p className="text-xs text-gray-500 mt-1">
                Venta confirmada y enlazada 1:1 con su ingreso en Finanzas.
              </p>
            </div>
          )}
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
}
