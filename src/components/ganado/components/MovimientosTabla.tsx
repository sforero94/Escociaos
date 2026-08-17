import { useState, Fragment } from 'react';
import { ChevronRight, Loader2 } from 'lucide-react';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { formatNumber, formatCurrency, formatWeight } from '@/utils/format';
import { formatearFecha } from '@/utils/fechas';
import type { MovimientoAgrupado, MovimientoConContexto, PuntaMovimiento } from '@/types/ganado';

interface MovimientosTablaProps {
  agrupados: MovimientoAgrupado[];
  canVerPlata: boolean;
  loading: boolean;
}

const TIPO_LABEL: Record<string, string> = {
  compra: 'Compra',
  venta: 'Venta',
  muerte: 'Muerte',
  traslado_entrada: 'Traslado (entrada)',
  traslado_salida: 'Traslado (salida)',
  ajuste: 'Ajuste',
  traslado: 'Traslado',
  conteo_fisico: 'Conteo físico',
};

const TIPO_BADGE: Record<string, string> = {
  compra: 'bg-green-100 text-green-800',
  venta: 'bg-blue-100 text-blue-800',
  muerte: 'bg-red-100 text-red-700',
  traslado_entrada: 'bg-purple-100 text-purple-700',
  traslado_salida: 'bg-purple-100 text-purple-700',
  traslado: 'bg-purple-100 text-purple-700',
  ajuste: 'bg-gray-100 text-gray-700',
  conteo_fisico: 'bg-gray-100 text-gray-700',
};

function TipoBadge({ tipo }: { tipo: string }) {
  return (
    <span
      className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium whitespace-nowrap ${
        TIPO_BADGE[tipo] || 'bg-gray-100 text-gray-700'
      }`}
    >
      {TIPO_LABEL[tipo] || tipo}
    </span>
  );
}

/** Celda con formato "número — o —" (R-1: sin dato nunca es 0). */
function CeldaOpcional({ value }: { value: string | null | undefined }) {
  return <span className={value == null ? 'text-brand-brown/30' : undefined}>{value ?? '—'}</span>;
}

function claveDeGrupo(a: MovimientoAgrupado, index: number): string {
  switch (a.clase) {
    case 'simple':
      return `s-${a.movimiento.id}`;
    case 'traslado':
      return `t-${a.grupo_id}`;
    case 'compra_venta':
      return `c-${a.transaccion_ganado_id}`;
    case 'conteo_fisico':
      return `f-${a.grupo_id}`;
    default:
      return `x-${index}`;
  }
}

/**
 * Tabla de movimientos ya agrupados por `agruparMovimientos` (§3.3 del plan
 * técnico): un traslado N→M, una compra/venta repartida o un conteo físico
 * son UNA fila desplegable, nunca N filas sueltas indistinguibles de N
 * hechos (R-2). La columna Valor no se renderiza en absoluto para quien no
 * puede ver plata (R-4) — nunca queda en blanco.
 */
export function MovimientosTabla({ agrupados, canVerPlata, loading }: MovimientosTablaProps) {
  const [expandidos, setExpandidos] = useState<Set<string>>(new Set());

  const toggle = (key: string) => {
    setExpandidos((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const columnas = canVerPlata ? 7 : 6;

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Fecha</TableHead>
          <TableHead>Evento</TableHead>
          <TableHead className="text-right">Cabezas</TableHead>
          {canVerPlata && <TableHead className="text-right">Valor</TableHead>}
          <TableHead className="text-right hidden sm:table-cell">Kilos</TableHead>
          <TableHead className="text-right hidden sm:table-cell">Peso del evento</TableHead>
          <TableHead className="text-right">Saldo</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {loading && agrupados.length === 0 ? (
          <TableRow>
            <TableCell colSpan={columnas} className="text-center py-10">
              <Loader2 className="w-5 h-5 animate-spin text-primary inline" />
            </TableCell>
          </TableRow>
        ) : agrupados.length === 0 ? (
          <TableRow>
            <TableCell colSpan={columnas} className="text-center py-10 text-brand-brown/50">
              Sin movimientos que coincidan con los filtros
            </TableCell>
          </TableRow>
        ) : (
          agrupados.map((agrupado, i) => {
            const key = claveDeGrupo(agrupado, i);
            return (
              <FilaAgrupado
                key={key}
                agrupado={agrupado}
                canVerPlata={canVerPlata}
                expandido={expandidos.has(key)}
                onToggle={() => toggle(key)}
              />
            );
          })
        )}
      </TableBody>
    </Table>
  );
}

function FilaAgrupado({
  agrupado,
  canVerPlata,
  expandido,
  onToggle,
}: {
  agrupado: MovimientoAgrupado;
  canVerPlata: boolean;
  expandido: boolean;
  onToggle: () => void;
}) {
  switch (agrupado.clase) {
    case 'simple': {
      const m = agrupado.movimiento;
      const esOrigen = m.tipo === 'traslado_salida' || m.tipo === 'venta' || m.tipo === 'muerte';
      const potrero = esOrigen ? m.potrero_origen : m.potrero_destino;
      const finca = esOrigen ? m.finca_origen : m.finca_destino;
      const lote = esOrigen ? m.lote_origen : m.lote_destino;
      const cabezas = Math.abs(m.novillos_delta) + Math.abs(m.toros_delta);
      return (
        <TableRow>
          <TableCell className="whitespace-nowrap">{formatearFecha(m.fecha)}</TableCell>
          <TableCell>
            <div className="flex items-start gap-2">
              <TipoBadge tipo={m.tipo} />
              <div>
                <p className="text-sm">
                  {potrero ? (
                    <>
                      {potrero}
                      {finca && <span className="text-brand-brown/50"> · {finca}{lote ? ` · ${lote}` : ''}</span>}
                    </>
                  ) : (
                    '—'
                  )}
                </p>
                {m.notas && <p className="text-xs text-brand-brown/50 max-w-xs truncate">{m.notas}</p>}
              </div>
            </div>
          </TableCell>
          <TableCell className="text-right tabular-nums">{formatNumber(cabezas)}</TableCell>
          {canVerPlata && (
            <TableCell className="text-right tabular-nums">
              <CeldaOpcional value={m.valor_total != null ? formatCurrency(m.valor_total) : null} />
            </TableCell>
          )}
          <TableCell className="text-right tabular-nums hidden sm:table-cell">
            <CeldaOpcional value={m.kilos_pagados != null ? `${formatNumber(m.kilos_pagados, 1)} kg` : null} />
          </TableCell>
          <TableCell className="text-right tabular-nums hidden sm:table-cell">
            <CeldaOpcional value={m.peso_promedio_kg != null ? formatWeight(m.peso_promedio_kg) : null} />
          </TableCell>
          <TableCell className="text-right tabular-nums">
            <CeldaOpcional value={agrupado.saldo != null ? formatNumber(agrupado.saldo) : null} />
          </TableCell>
        </TableRow>
      );
    }

    case 'traslado': {
      const { origenes, destinos, cabezas, fecha, notas } = agrupado;
      const esUnoAUno = origenes.length === 1 && destinos.length === 1;
      const puedeExpandir = origenes.length + destinos.length > 2;
      return (
        <Fragment>
          <TableRow>
            <TableCell className="whitespace-nowrap">{formatearFecha(fecha)}</TableCell>
            <TableCell>
              <div className="flex items-start gap-2">
                <TipoBadge tipo="traslado" />
                <div>
                  <p className="text-sm">
                    {esUnoAUno ? (
                      <>
                        {origenes[0].potrero} <span className="text-brand-brown/40">→</span> {destinos[0].potrero}
                      </>
                    ) : (
                      <>
                        {origenes.length} {origenes.length === 1 ? 'potrero' : 'potreros'}{' '}
                        <span className="text-brand-brown/40">→</span> {destinos.length}{' '}
                        {destinos.length === 1 ? 'potrero' : 'potreros'}
                      </>
                    )}
                  </p>
                  {notas && <p className="text-xs text-brand-brown/50 max-w-xs truncate">{notas}</p>}
                  {puedeExpandir && (
                    <button
                      type="button"
                      onClick={onToggle}
                      className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                    >
                      <ChevronRight className={`w-3 h-3 transition-transform ${expandido ? 'rotate-90' : ''}`} />
                      {expandido ? 'Ocultar' : 'Ver'} el detalle
                    </button>
                  )}
                </div>
              </div>
            </TableCell>
            <TableCell className="text-right tabular-nums">{formatNumber(cabezas)}</TableCell>
            {canVerPlata && (
              <TableCell className="text-right tabular-nums text-brand-brown/30">—</TableCell>
            )}
            <TableCell className="text-right tabular-nums hidden sm:table-cell text-brand-brown/30">—</TableCell>
            <TableCell className="text-right tabular-nums hidden sm:table-cell text-brand-brown/30">—</TableCell>
            <TableCell className="text-right tabular-nums">
              {esUnoAUno ? (
                <span>
                  {formatNumber(origenes[0].saldo ?? 0)} <span className="text-brand-brown/40">→</span>{' '}
                  {destinos[0].saldo != null ? formatNumber(destinos[0].saldo) : '—'}
                </span>
              ) : (
                <span className="text-brand-brown/30">—</span>
              )}
            </TableCell>
          </TableRow>
          {expandido && (
            <DetalleFila colSpan={canVerPlata ? 7 : 6}>
              <p className="text-xs font-semibold text-brand-brown/50 uppercase tracking-wide mb-1.5">Salen de</p>
              <DetallePuntas puntas={origenes} signo="neg" />
              <p className="text-xs font-semibold text-brand-brown/50 uppercase tracking-wide mt-3 mb-1.5">Entran a</p>
              <DetallePuntas puntas={destinos} signo="pos" />
            </DetalleFila>
          )}
        </Fragment>
      );
    }

    case 'compra_venta': {
      const { tipo, puntas, cabezas, fecha, valor_total, kilos_pagados } = agrupado;
      const unaSolaPunta = puntas.length === 1;
      const pesoPromedio = kilos_pagados != null && cabezas > 0 ? kilos_pagados / cabezas : null;
      return (
        <Fragment>
          <TableRow>
            <TableCell className="whitespace-nowrap">{formatearFecha(fecha)}</TableCell>
            <TableCell>
              <div className="flex items-start gap-2">
                <TipoBadge tipo={tipo} />
                <div>
                  <p className="text-sm">
                    {unaSolaPunta ? (
                      <>
                        {puntas[0].potrero}
                        <span className="text-brand-brown/50"> · {puntas[0].finca}</span>
                      </>
                    ) : (
                      <>
                        {formatNumber(cabezas)} cabezas <span className="text-brand-brown/40">→</span> {puntas.length} potreros
                      </>
                    )}
                  </p>
                  {!unaSolaPunta && (
                    <button
                      type="button"
                      onClick={onToggle}
                      className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                    >
                      <ChevronRight className={`w-3 h-3 transition-transform ${expandido ? 'rotate-90' : ''}`} />
                      {expandido ? 'Ocultar' : 'Ver'} el reparto
                    </button>
                  )}
                </div>
              </div>
            </TableCell>
            <TableCell className="text-right tabular-nums">{formatNumber(cabezas)}</TableCell>
            {canVerPlata && (
              <TableCell className="text-right tabular-nums">
                <CeldaOpcional value={valor_total != null ? formatCurrency(valor_total) : null} />
              </TableCell>
            )}
            <TableCell className="text-right tabular-nums hidden sm:table-cell">
              <CeldaOpcional value={kilos_pagados != null ? `${formatNumber(kilos_pagados, 1)} kg` : null} />
            </TableCell>
            <TableCell className="text-right tabular-nums hidden sm:table-cell">
              <CeldaOpcional value={pesoPromedio != null ? formatWeight(pesoPromedio) : null} />
            </TableCell>
            <TableCell className="text-right tabular-nums">
              {unaSolaPunta ? (
                <CeldaOpcional value={puntas[0].saldo != null ? formatNumber(puntas[0].saldo) : null} />
              ) : (
                <span className="text-brand-brown/30">—</span>
              )}
            </TableCell>
          </TableRow>
          {expandido && !unaSolaPunta && (
            <DetalleFila colSpan={canVerPlata ? 7 : 6}>
              <DetallePuntas puntas={puntas} signo={tipo === 'venta' ? 'neg' : 'pos'} />
            </DetalleFila>
          )}
        </Fragment>
      );
    }

    case 'conteo_fisico': {
      const { fecha, miembros, puntas, potrerosAfectados, deltaNeto, notas } = agrupado;
      return (
        <Fragment>
          <TableRow>
            <TableCell className="whitespace-nowrap">{formatearFecha(fecha)}</TableCell>
            <TableCell>
              <div className="flex items-start gap-2">
                <TipoBadge tipo="conteo_fisico" />
                <div>
                  <p className="text-sm">
                    Conteo físico · {formatNumber(potrerosAfectados)} {potrerosAfectados === 1 ? 'potrero' : 'potreros'}
                  </p>
                  {notas && <p className="text-xs text-brand-brown/50 max-w-xs truncate">{notas}</p>}
                  <button
                    type="button"
                    onClick={onToggle}
                    className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                  >
                    <ChevronRight className={`w-3 h-3 transition-transform ${expandido ? 'rotate-90' : ''}`} />
                    {expandido ? 'Ocultar' : 'Ver'} las {formatNumber(potrerosAfectados)} correcciones
                  </button>
                </div>
              </div>
            </TableCell>
            <TableCell className={`text-right tabular-nums font-medium ${deltaNeto > 0 ? 'text-green-700' : deltaNeto < 0 ? 'text-red-600' : ''}`}>
              {deltaNeto > 0 ? '+' : ''}
              {formatNumber(deltaNeto)}
            </TableCell>
            {canVerPlata && <TableCell className="text-right text-brand-brown/30">—</TableCell>}
            <TableCell className="text-right hidden sm:table-cell text-brand-brown/30">—</TableCell>
            <TableCell className="text-right hidden sm:table-cell text-brand-brown/30">—</TableCell>
            <TableCell className="text-right text-brand-brown/30">—</TableCell>
          </TableRow>
          {expandido && (
            <DetalleFila colSpan={canVerPlata ? 7 : 6}>
              <DetalleMiembrosAjuste miembros={miembros} puntas={puntas} />
            </DetalleFila>
          )}
        </Fragment>
      );
    }

    default:
      return null;
  }
}

function DetalleFila({ colSpan, children }: { colSpan: number; children: React.ReactNode }) {
  return (
    <TableRow className="bg-gray-50/60 hover:bg-gray-50/60">
      <TableCell colSpan={colSpan} className="py-3">
        {children}
      </TableCell>
    </TableRow>
  );
}

/** Detalle de puntas cuando la dirección ya la dice el título ("Salen de"/"Entran a"). */
function DetallePuntas({ puntas, signo }: { puntas: PuntaMovimiento[]; signo: 'pos' | 'neg' }) {
  return (
    <div className="grid gap-1">
      {puntas.map((p) => (
        <div key={p.movimiento_id} className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs">
          <span className="min-w-[220px] text-brand-brown/70">
            {p.finca} · {p.potrero}
            {p.lote && <span className="text-brand-brown/40"> ({p.lote})</span>}
          </span>
          <span className={`tabular-nums font-medium ${signo === 'neg' ? 'text-red-600' : 'text-green-700'}`}>
            {p.novillos > 0 && `${signo === 'neg' ? '−' : '+'}${formatNumber(p.novillos)} novillos`}
            {p.novillos > 0 && p.toros > 0 && ' · '}
            {p.toros > 0 && `${signo === 'neg' ? '−' : '+'}${formatNumber(p.toros)} toros`}
          </span>
          <span className="text-brand-brown/40">
            {p.saldo != null ? `queda ${formatNumber(p.saldo)}` : 'saldo —'}
          </span>
        </div>
      ))}
    </div>
  );
}

/**
 * Detalle de un conteo físico. Se recorre `miembros` (los `ajuste` crudos,
 * con su delta firmado) y no `puntas` (que son siempre positivas, R-8) —
 * un conteo físico es la excepción: el signo ES el dato (corrección hacia
 * arriba o hacia abajo), no una dirección redundante con el tipo.
 */
function DetalleMiembrosAjuste({
  miembros,
  puntas,
}: {
  miembros: MovimientoConContexto[];
  puntas: PuntaMovimiento[];
}) {
  const saldoPorPotrero = new Map(puntas.map((p) => [p.potrero_id, p]));
  return (
    <div className="grid gap-1">
      {miembros.map((m) => {
        const neto = m.novillos_delta + m.toros_delta;
        const potreroId = m.potrero_destino_id ?? m.potrero_origen_id;
        const punta = potreroId ? saldoPorPotrero.get(potreroId) : undefined;
        const finca = m.finca_destino ?? m.finca_origen;
        const lote = m.lote_destino ?? m.lote_origen;
        return (
          <div key={m.id} className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs">
            <span className="min-w-[220px] text-brand-brown/70">
              {finca ? `${finca} · ` : ''}
              {m.potrero_destino ?? m.potrero_origen ?? '—'}
              {lote && <span className="text-brand-brown/40"> ({lote})</span>}
            </span>
            <span className={`tabular-nums font-medium ${neto >= 0 ? 'text-green-700' : 'text-red-600'}`}>
              {neto > 0 ? '+' : ''}
              {formatNumber(neto)}
            </span>
            <span className="text-brand-brown/40">{punta?.saldo != null ? `queda ${formatNumber(punta.saldo)}` : 'saldo —'}</span>
          </div>
        );
      })}
    </div>
  );
}
