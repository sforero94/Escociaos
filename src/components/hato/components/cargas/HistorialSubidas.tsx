// ARCHIVO: components/hato/components/cargas/HistorialSubidas.tsx
// DESCRIPCIÓN: "Historial de subidas" de Cargas v2 (comentario del dueño en
// el lienzo): tabla desplegable con las quincenas al camión y los pesajes,
// para ir a ver los datos crudos. Columnas: quincena o pesaje, mes, valor
// total y enlace a la foto. Una fila abre su detalle (quincena: litros,
// valor, precio; pesaje: mañana y tarde por vaca). El descarte de una
// subida de pesaje sigue en `SubidasPesajeMes`, al pie, solo Gerencia.

import { useMemo, useState } from 'react';
import { ChevronDown, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useAuth } from '@/contexts/AuthContext';
import { formatMillonesCOP, formatNumber } from '@/utils/format';
import { filasHistorialSubidas, type FilaHistorialSubida, type QuincenaClave, type TipoSubida } from '@/utils/hato/produccionV2';
import type { PesajeLecheVaca } from '@/utils/hatoProduccion';
import type { HatoProduccionQuincenalConIngreso } from '../../hooks/useProduccionHato';
import type { HistorialSubidasEstado } from '../../hooks/useHistorialSubidas';
import { DetalleQuincenaVentaDialog } from '../DetalleQuincenaVentaDialog';
import { SubidasPesajeMes } from '../SubidasPesajeMes';

type Filtro = 'todo' | TipoSubida;

const FILTROS: Array<{ id: Filtro; label: string }> = [
  { id: 'todo', label: 'Todo' },
  { id: 'quincena', label: 'Quincenas' },
  { id: 'pesaje', label: 'Pesajes' },
];

const FUENTE: Record<string, string> = { telegram: 'Telegram', foto: 'foto', web: 'web', importacion: 'importación' };

function valorTotal(fila: FilaHistorialSubida): string {
  const litros = fila.litros == null ? null : `${formatNumber(fila.litros)} L`;
  if (fila.tipo === 'quincena') {
    const valor = fila.valor == null ? null : formatMillonesCOP(fila.valor);
    return [valor, litros].filter(Boolean).join(' · ') || '—';
  }
  return litros ?? '—';
}

export function HistorialSubidas({
  historial,
  pesajes,
  fotos,
  desde,
  meses,
  onMasMeses,
  onAbrirPesaje,
  onAbrirQuincena,
  onCambio,
}: {
  historial: HatoProduccionQuincenalConIngreso[];
  pesajes: PesajeLecheVaca[];
  fotos: HistorialSubidasEstado;
  desde: string;
  meses: number;
  onMasMeses: () => void;
  onAbrirPesaje: (fecha: string) => void;
  /** Gerencia: abre la quincena para verla o completarla (p. ej. el número
   * de vacas). Quien no es Gerencia ve el detalle de solo lectura. */
  onAbrirQuincena: (q: QuincenaClave) => void;
  onCambio: () => void;
}) {
  const [filtro, setFiltro] = useState<Filtro>('todo');
  const [quincena, setQuincena] = useState<HatoProduccionQuincenalConIngreso | null>(null);
  const { hasRole } = useAuth();

  const filas = useMemo(
    () =>
      filasHistorialSubidas({
        quincenas: historial.map((h) => ({ ...h, valor: h.finIngreso?.valor ?? null })),
        pesajes,
        fotosLiquidacion: fotos.fotosLiquidacion,
        fotoPesajePorFecha: fotos.fotoPesajePorFecha,
        desde,
      }),
    [historial, pesajes, fotos.fotosLiquidacion, fotos.fotoPesajePorFecha, desde],
  );
  const visibles = filtro === 'todo' ? filas : filas.filter((f) => f.tipo === filtro);

  const abrirFila = (fila: FilaHistorialSubida) => {
    if (fila.tipo === 'pesaje') {
      onAbrirPesaje(fila.fecha);
      return;
    }
    const q = historial.find((h) => h.id === fila.clave) ?? null;
    if (!q) return;
    if (hasRole(['Gerencia'])) onAbrirQuincena({ anio: q.anio, mes: q.mes, quincena: q.quincena });
    else setQuincena(q);
  };

  return (
    <details className="group rounded-xl border border-gray-200 bg-white shadow-sm">
      <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 px-5 py-4 [&::-webkit-details-marker]:hidden">
        <span className="flex flex-col gap-0.5">
          <span className="text-sm font-semibold text-gray-900">Historial de subidas</span>
          <span className="text-xs text-gray-500">Quincenas al camión y pesajes · datos crudos</span>
        </span>
        <ChevronDown className="h-4 w-4 text-gray-500 transition-transform group-open:rotate-180" aria-hidden="true" />
      </summary>

      <div className="flex flex-col gap-3 px-5 pb-5">
        <div role="group" aria-label="Tipo de subida" className="flex flex-wrap gap-2">
          {FILTROS.map((f) => (
            <button
              key={f.id}
              type="button"
              aria-pressed={filtro === f.id}
              onClick={() => setFiltro(f.id)}
              className={`h-11 rounded-md border px-3 text-sm sm:h-9 ${
                filtro === f.id ? 'border-primary bg-primary text-primary-foreground' : 'border-gray-200 bg-white text-gray-700'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        {fotos.error && <p className="text-xs text-amber-700">{fotos.error} La tabla se muestra sin enlaces a las fotos.</p>}

          <Table className="min-w-[340px] text-gray-700">
            <TableHeader>
              <TableRow className="bg-gray-50 text-left">
                <TableHead scope="col">Quincena / pesaje</TableHead>
                <TableHead scope="col">Mes</TableHead>
                <TableHead scope="col" className="text-right">Valor total</TableHead>
                <TableHead scope="col">Foto</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visibles.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="text-gray-400">
                    Sin subidas en los últimos {meses} meses.
                  </TableCell>
                </TableRow>
              ) : (
                visibles.map((fila) => (
                  <TableRow key={`${fila.tipo}-${fila.clave}`}>
                    <TableCell>
                      <button type="button" onClick={() => abrirFila(fila)} className="text-left text-gray-900 hover:underline">
                        {fila.etiqueta}
                      </button>
                      {fila.tipo === 'pesaje' && fila.fuente && (
                        <span className="ml-1 text-gray-400">· {FUENTE[fila.fuente] ?? fila.fuente}</span>
                      )}
                    </TableCell>
                    <TableCell>{fila.mes}</TableCell>
                    <TableCell className="text-right" style={{ fontVariantNumeric: 'tabular-nums' }}>
                      {valorTotal(fila)}
                    </TableCell>
                    <TableCell>
                      {fotos.cargando ? (
                        <Loader2 className="h-3 w-3 animate-spin text-gray-400" aria-label="Cargando foto" />
                      ) : fila.foto ? (
                        <button
                          type="button"
                          className="font-medium text-primary hover:underline"
                          onClick={async () => {
                            const fallo = await fotos.abrirFoto(fila.foto!);
                            if (fallo) toast.error(fallo);
                          }}
                        >
                          Ver
                        </button>
                      ) : (
                        <span className="text-gray-400">Sin foto</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        <p className="text-xs text-gray-500">Toca una fila para ver los datos crudos.</p>
        <Button variant="ghost" className="text-primary" onClick={onMasMeses}>
          Ver más subidas
        </Button>

        {hasRole(['Gerencia']) && (
          <div className="border-t border-gray-100 pt-3">
            <SubidasPesajeMes onCambio={onCambio} />
          </div>
        )}
      </div>

      <DetalleQuincenaVentaDialog fila={quincena} open={quincena != null} onOpenChange={(o) => !o && setQuincena(null)} />
    </details>
  );
}
