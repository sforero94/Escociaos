import { useMemo, useState } from 'react';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { ChevronRight, Loader2 } from 'lucide-react';
import { formatNumber, formatWeight } from '@/utils/format';
import { formatearFechaCorta } from '@/utils/fechas';
import { ChipsEtapa, BarraEtapa, EtapaChip } from './ChipsEtapa';
import type { NodoUbicacion, NodoFinca, NodoLote } from '@/types/ganado';

interface InventarioArbolProps {
  ubicaciones: NodoUbicacion[];
  loading: boolean;
}

/**
 * Vista jerárquica ubicación → finca → lote → potrero (A-1). La fila de
 * finca es un resumen real, legible sin desplegar; los lotes y potreros
 * viven colapsados debajo. El primitivo `Table` de `ui/table.tsx` cubre el
 * caso "lista" y ya envuelve en scroll horizontal propio — el body nunca
 * scrollea en horizontal.
 */
export function InventarioArbol({ ubicaciones, loading }: InventarioArbolProps) {
  const totalFincas = ubicaciones.reduce((s, u) => s + u.fincas.length, 0);

  const fincaMasGrande = useMemo(() => {
    let mejorId: string | null = null;
    let mejorCabezas = -1;
    ubicaciones.forEach((u) => {
      u.fincas.forEach((f) => {
        if (f.cabezas > mejorCabezas) {
          mejorCabezas = f.cabezas;
          mejorId = f.finca_id;
        }
      });
    });
    return mejorId;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [abiertas, setAbiertas] = useState<Set<string>>(
    () => new Set(fincaMasGrande ? [fincaMasGrande] : [])
  );

  const toggleFinca = (id: string) => {
    setAbiertas((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  if (loading && totalFincas === 0) {
    return (
      <div className="rounded-xl border border-primary/10 bg-white py-10 flex justify-center">
        <Loader2 className="w-5 h-5 animate-spin text-primary" />
      </div>
    );
  }

  if (totalFincas === 0) {
    return (
      <div className="rounded-xl border border-primary/10 bg-white py-10 text-center text-sm text-brand-brown/50">
        Sin fincas que coincidan con los filtros. Crea ubicaciones, fincas y potreros desde Configuración.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {ubicaciones.map((ubic) => (
        <div key={ubic.ubicacion_id ?? 'sin-ubicacion'} className="space-y-2.5">
          {ubicaciones.length > 1 && (
            <p className="text-xs font-semibold uppercase tracking-wide text-brand-brown/50 px-1">
              {ubic.ubicacion} · {formatNumber(ubic.cabezas)} cabezas
              {ubic.cabezasPorHa != null && ` · ${formatNumber(ubic.cabezasPorHa, 1)} cab/ha`}
            </p>
          )}
          <div className="space-y-2.5">
            {ubic.fincas.map((finca) => (
              <FincaCard
                key={finca.finca_id}
                finca={finca}
                abierta={abiertas.has(finca.finca_id)}
                onToggle={() => toggleFinca(finca.finca_id)}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function FincaCard({ finca, abierta, onToggle }: { finca: NodoFinca; abierta: boolean; onToggle: () => void }) {
  const lotesReales = finca.lotes.filter((l) => l.lote_id !== null).length;
  const potrerosCount = finca.lotes.reduce((s, l) => s + l.potreros.length, 0);

  return (
    <Collapsible open={abierta} onOpenChange={onToggle}>
      <div
        className={`rounded-xl border bg-white overflow-hidden transition-colors ${
          abierta ? 'border-primary/25' : 'border-primary/10'
        }`}
      >
        <CollapsibleTrigger asChild>
          <button
            type="button"
            className="w-full flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3.5 text-left hover:bg-gray-50/70 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:ring-inset"
          >
            <ChevronRight
              className={`w-4 h-4 text-brand-brown/40 flex-shrink-0 transition-transform ${abierta ? 'rotate-90' : ''}`}
              aria-hidden="true"
            />

            <div className="min-w-[150px]">
              <p className="text-base sm:text-sm font-semibold text-foreground">{finca.finca}</p>
              <p className="text-xs text-brand-brown/50 mt-0.5">
                {formatNumber(lotesReales)} {lotesReales === 1 ? 'lote' : 'lotes'} · {formatNumber(potrerosCount)}{' '}
                {potrerosCount === 1 ? 'potrero' : 'potreros'}
              </p>
            </div>

            <div className="flex-1 min-w-[120px] hidden sm:block">
              <BarraEtapa porEtapa={finca.porEtapa} total={finca.cabezas} />
            </div>

            <div className="text-right ml-auto">
              <p className="text-lg font-bold tabular-nums text-foreground leading-tight">
                {formatNumber(finca.cabezas)}
              </p>
              <p className="text-[10px] uppercase tracking-wide text-brand-brown/40">cabezas</p>
            </div>
            <div className="text-right hidden sm:block">
              <p className="text-sm font-medium tabular-nums text-brand-brown/50">
                {finca.cabezasPorHa != null ? formatNumber(finca.cabezasPorHa, 1) : '—'}
              </p>
              <p className="text-[10px] uppercase tracking-wide text-brand-brown/40">cab/ha</p>
            </div>
          </button>
        </CollapsibleTrigger>

        <div className="px-4 pb-2.5 sm:hidden">
          <BarraEtapa porEtapa={finca.porEtapa} total={finca.cabezas} />
        </div>

        <CollapsibleContent>
          <div className="border-t border-primary/10 bg-gray-50/40 px-2 sm:px-3 py-2">
            <PotrerosTabla lotes={finca.lotes} />
          </div>
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
}

function PotrerosTabla({ lotes }: { lotes: NodoLote[] }) {
  if (lotes.length === 0) {
    return <p className="text-sm text-brand-brown/40 text-center py-4">Sin potreros en esta finca</p>;
  }
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Lote / Potrero</TableHead>
          <TableHead>Etapa</TableHead>
          <TableHead className="text-right">Cabezas</TableHead>
          <TableHead className="text-right hidden sm:table-cell">Último peso</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {lotes.map((lote) => (
          <LoteFilas key={lote.lote_id ?? 'sin-lote'} lote={lote} />
        ))}
      </TableBody>
    </Table>
  );
}

function LoteFilas({ lote }: { lote: NodoLote }) {
  return (
    <>
      <TableRow className="bg-gray-50/80 hover:bg-gray-50/80">
        <TableCell className="font-semibold">
          <span className="inline-flex items-center gap-2">
            {lote.lote}
            <Badge variant="outline" className="text-[10px] font-normal text-brand-brown/50 border-gray-200">
              {lote.lote_id ? 'lote' : 'sin agrupar'}
            </Badge>
          </span>
        </TableCell>
        <TableCell>
          <ChipsEtapa porEtapa={lote.porEtapa} size="sm" />
        </TableCell>
        <TableCell className="text-right font-semibold tabular-nums">{formatNumber(lote.cabezas)}</TableCell>
        <TableCell className="text-right hidden sm:table-cell text-brand-brown/30">—</TableCell>
      </TableRow>
      {lote.potreros.map((p) => (
        <TableRow key={p.potrero_id}>
          <TableCell className="pl-8 text-brand-brown/80">{p.potrero}</TableCell>
          <TableCell>
            <EtapaChip etapa={p.etapa ?? 'sin_clasificar'} />
          </TableCell>
          <TableCell className="text-right tabular-nums">{formatNumber(p.cabezas)}</TableCell>
          <TableCell className="text-right hidden sm:table-cell tabular-nums">
            {p.ultimoPesoKg != null ? (
              <span>
                {formatWeight(p.ultimoPesoKg)}
                {p.ultimoPesoFecha && (
                  <span className="block text-[10px] text-brand-brown/40 font-normal">
                    {formatearFechaCorta(p.ultimoPesoFecha)}
                  </span>
                )}
              </span>
            ) : (
              <span className="text-brand-brown/30">—</span>
            )}
          </TableCell>
        </TableRow>
      ))}
    </>
  );
}
