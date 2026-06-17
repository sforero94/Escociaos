import { useRef } from 'react';
import { Upload, CheckCircle, X } from 'lucide-react';
import type { BatchRowDataIngreso } from '@/types/finanzas';
import type { IngresosCatalogs } from '../hooks/useIngresosCatalogs';
import { formatCurrency } from '@/utils/format';

interface IngresosBatchRowProps {
  row: BatchRowDataIngreso;
  index: number;
  catalogs: IngresosCatalogs;
  errors: Record<string, string>;
  onChange: (index: number, field: string, value: string | File | null) => void;
  onRemove: (index: number) => void;
  onCreateComprador: () => void;
}

const cellClass = 'px-3 py-2.5';
const inputBase =
  'w-full px-3 py-2 text-sm bg-white border rounded-xl transition-colors focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary';
const inputOk = `${inputBase} border-gray-200`;
const inputErr = `${inputBase} border-red-400 bg-red-50 focus:ring-red-200 focus:border-red-500`;

export function IngresosBatchRow({ row, index, catalogs, errors, onChange, onRemove, onCreateComprador }: IngresosBatchRowProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const categoriasFiltradas = row.negocio_id
    ? catalogs.getCategoriasPorNegocio(row.negocio_id)
    : [];

  // Determinar si el negocio seleccionado requiere campos de cantidad
  const negocio = catalogs.negocios.find((n) => n.id === row.negocio_id);
  const negocioNombre = negocio?.nombre ?? '';
  const esAguacate = negocioNombre.toLowerCase().includes('aguacate');
  const esHatoLechero =
    negocioNombre.toLowerCase().includes('hato') ||
    negocioNombre.toLowerCase().includes('lechero');
  const mostrarCantidad = esAguacate || esHatoLechero;
  const labelCantidad = esHatoLechero ? 'Cantidad (litros)' : 'Cantidad (kg)';
  const labelPrecio = esHatoLechero ? 'Precio / litro' : 'Precio / kg';
  const unidad = esHatoLechero ? 'L' : 'kg';

  // Auto-calcular precio unitario
  const cantidadNum = row.cantidad ? Number(row.cantidad) : 0;
  const valorNum = row.valor ? Number(row.valor) : 0;
  const precioComputado =
    cantidadNum > 0 && valorNum > 0 ? valorNum / cantidadNum : null;

  const cls = (field: string) => (errors[field] ? inputErr : inputOk);

  // Número total de columnas de la tabla (debe coincidir con COLUMN_HEADERS en IngresosBatchTable)
  const totalColumnas = 11;

  return (
    <>
      <tr className="border-b border-primary/5 hover:bg-muted/30 transition-colors">
        <td className={cellClass}>
          <input
            type="date"
            value={row.fecha}
            onChange={(e) => onChange(index, 'fecha', e.target.value)}
            className={cls('fecha')}
            style={{ minWidth: 130 }}
          />
        </td>
        <td className={cellClass}>
          <input
            type="text"
            value={row.nombre}
            onChange={(e) => onChange(index, 'nombre', e.target.value)}
            className={cls('nombre')}
            placeholder="Nombre del ingreso"
            style={{ minWidth: 160 }}
          />
        </td>
        <td className={cellClass}>
          <input
            type="number"
            value={row.valor}
            onChange={(e) => onChange(index, 'valor', e.target.value)}
            onWheel={(e) => e.currentTarget.blur()}
            className={cls('valor')}
            placeholder="0"
            min="0"
            style={{ minWidth: 110 }}
          />
        </td>
        <td className={cellClass}>
          <select
            value={row.negocio_id}
            onChange={(e) => {
              onChange(index, 'negocio_id', e.target.value);
              onChange(index, 'categoria_id', '');
              // Limpiar cantidad al cambiar negocio
              onChange(index, 'cantidad', '');
            }}
            className={cls('negocio_id')}
            style={{ minWidth: 130 }}
          >
            <option value="">Seleccionar</option>
            {catalogs.negocios.map((n) => (
              <option key={n.id} value={n.id}>{n.nombre}</option>
            ))}
          </select>
        </td>
        <td className={cellClass}>
          <select
            value={row.region_id}
            onChange={(e) => onChange(index, 'region_id', e.target.value)}
            className={cls('region_id')}
            style={{ minWidth: 120 }}
          >
            <option value="">Seleccionar</option>
            {catalogs.regiones.map((r) => (
              <option key={r.id} value={r.id}>{r.nombre}</option>
            ))}
          </select>
        </td>
        <td className={cellClass}>
          <select
            value={row.categoria_id}
            onChange={(e) => onChange(index, 'categoria_id', e.target.value)}
            className={cls('categoria_id')}
            disabled={!row.negocio_id}
            style={{ minWidth: 130 }}
          >
            <option value="">{row.negocio_id ? 'Seleccionar' : 'Elija negocio'}</option>
            {categoriasFiltradas.map((c) => (
              <option key={c.id} value={c.id}>{c.nombre}</option>
            ))}
          </select>
        </td>
        <td className={cellClass}>
          <div className="flex items-center gap-1">
            <select
              value={row.comprador_id}
              onChange={(e) => {
                if (e.target.value === '__CREATE__') {
                  onCreateComprador();
                  return;
                }
                onChange(index, 'comprador_id', e.target.value);
              }}
              className={inputOk}
              style={{ minWidth: 120 }}
            >
              <option value="">Opcional</option>
              {catalogs.compradores.map((c) => (
                <option key={c.id} value={c.id}>{c.nombre}</option>
              ))}
              <option value="__CREATE__">+ Crear nuevo</option>
            </select>
          </div>
        </td>
        <td className={cellClass}>
          <select
            value={row.medio_pago_id}
            onChange={(e) => onChange(index, 'medio_pago_id', e.target.value)}
            className={cls('medio_pago_id')}
            style={{ minWidth: 120 }}
          >
            <option value="">Seleccionar</option>
            {catalogs.mediosPago.map((m) => (
              <option key={m.id} value={m.id}>{m.nombre}</option>
            ))}
          </select>
        </td>
        <td className={cellClass}>
          <input
            type="text"
            value={row.observaciones}
            onChange={(e) => onChange(index, 'observaciones', e.target.value)}
            className={inputOk}
            placeholder="Notas"
            style={{ minWidth: 140 }}
          />
        </td>
        <td className={`${cellClass} text-center`}>
          <input
            ref={fileRef}
            type="file"
            accept="image/*,.pdf"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0] || null;
              onChange(index, 'factura_file', file);
              if (fileRef.current) fileRef.current.value = '';
            }}
          />
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="p-2 rounded-xl hover:bg-muted/50 transition-colors"
            title={row.factura_file ? row.factura_file.name : 'Subir factura'}
          >
            {row.factura_file ? (
              <CheckCircle className="w-4 h-4 text-green-600" />
            ) : (
              <Upload className="w-4 h-4 text-brand-brown/40" />
            )}
          </button>
        </td>
        <td className={`${cellClass} text-center`}>
          <button
            type="button"
            onClick={() => onRemove(index)}
            className="p-2 rounded-xl hover:bg-destructive/10 text-brand-brown/40 hover:text-destructive transition-colors"
            title="Eliminar fila"
          >
            <X className="w-4 h-4" />
          </button>
        </td>
      </tr>

      {/* Sub-fila de cantidad y precio — solo visible para Aguacate Hass y Hato Lechero */}
      {mostrarCantidad && (
        <tr className="border-b border-primary/5 bg-muted/20">
          <td colSpan={totalColumnas} className="px-3 py-2">
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '16px',
                flexWrap: 'wrap',
              }}
            >
              {/* Etiqueta del negocio */}
              <span
                style={{
                  fontSize: '0.75rem',
                  fontWeight: 600,
                  color: 'var(--color-primary)',
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                  whiteSpace: 'nowrap',
                }}
              >
                {negocioNombre}
              </span>

              {/* Campo cantidad */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <label
                  style={{
                    fontSize: '0.75rem',
                    color: 'var(--color-muted-foreground)',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {labelCantidad}
                </label>
                <input
                  type="number"
                  value={row.cantidad}
                  onChange={(e) => onChange(index, 'cantidad', e.target.value)}
                  onWheel={(e) => e.currentTarget.blur()}
                  placeholder="0"
                  min="0"
                  step="0.1"
                  style={{
                    width: 100,
                    padding: '4px 8px',
                    fontSize: '0.875rem',
                    border: '1px solid var(--color-border)',
                    borderRadius: '0.5rem',
                    background: 'white',
                    outline: 'none',
                  }}
                  aria-label={`${labelCantidad} fila ${index + 1}`}
                />
                <span style={{ fontSize: '0.75rem', color: 'var(--color-muted-foreground)' }}>
                  {unidad}
                </span>
              </div>

              {/* Precio unitario calculado (solo lectura) */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span
                  style={{
                    fontSize: '0.75rem',
                    color: 'var(--color-muted-foreground)',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {labelPrecio} (calculado):
                </span>
                <span
                  style={{
                    fontSize: '0.875rem',
                    fontWeight: 500,
                    color: precioComputado != null ? 'var(--color-foreground)' : 'var(--color-muted-foreground)',
                  }}
                >
                  {precioComputado != null ? formatCurrency(Math.round(precioComputado)) : '—'}
                </span>
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
