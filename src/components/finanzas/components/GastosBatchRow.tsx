import { useRef } from 'react';
import { Upload, CheckCircle, X } from 'lucide-react';
import type { BatchRowData } from '@/types/finanzas';
import type { GastosCatalogs } from '../hooks/useGastosCatalogs';

interface GastosBatchRowProps {
  row: BatchRowData;
  index: number;
  catalogs: GastosCatalogs;
  errors: Record<string, string>;
  onChange: (index: number, field: string, value: string | File | null) => void;
  onRemove: (index: number) => void;
  onCreateProveedor: () => void;
}

const cellClass = 'px-3 py-2.5';
const inputBase =
  'w-full px-3 py-2 text-sm border rounded-xl transition-colors focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary';
const inputOk = `${inputBase} bg-white border-gray-200`;

const errorStyle: React.CSSProperties = {
  borderColor: 'var(--destructive)',
  backgroundColor: 'color-mix(in srgb, var(--destructive) 5%, white)',
  boxShadow: '0 0 0 2px color-mix(in srgb, var(--destructive) 20%, transparent)',
};

export function GastosBatchRow({ row, index, catalogs, errors, onChange, onRemove, onCreateProveedor }: GastosBatchRowProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const conceptosFiltrados = row.categoria_id
    ? catalogs.getConceptosPorCategoria(row.categoria_id)
    : [];

  const cls = (field: string) => (errors[field] ? `${inputBase} bg-white` : inputOk);
  const errStyle = (field: string): React.CSSProperties | undefined => errors[field] ? errorStyle : undefined;

  return (
    <tr className="border-b border-primary/5 hover:bg-muted/30 transition-colors">
      <td className={cellClass}>
        <input
          type="date"
          value={row.fecha}
          onChange={(e) => onChange(index, 'fecha', e.target.value)}
          className={cls('fecha')}
          style={{ minWidth: 130, ...errStyle('fecha') }}
        />
      </td>
      <td className={cellClass}>
        <input
          type="text"
          value={row.nombre}
          onChange={(e) => onChange(index, 'nombre', e.target.value)}
          className={cls('nombre')}
          placeholder="Nombre del gasto"
          style={{ minWidth: 160, ...errStyle('nombre') }}
        />
      </td>
      <td className={cellClass}>
        <input
          type="number"
          value={row.valor}
          onChange={(e) => onChange(index, 'valor', e.target.value)}
          className={cls('valor')}
          placeholder="0"
          min="0"
          style={{ minWidth: 110, ...errStyle('valor') }}
        />
      </td>
      <td className={cellClass}>
        <select
          value={row.negocio_id}
          onChange={(e) => onChange(index, 'negocio_id', e.target.value)}
          className={cls('negocio_id')}
          style={{ minWidth: 130, ...errStyle('negocio_id') }}
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
          style={{ minWidth: 120, ...errStyle('region_id') }}
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
          onChange={(e) => {
            onChange(index, 'categoria_id', e.target.value);
            onChange(index, 'concepto_id', '');
          }}
          className={cls('categoria_id')}
          style={{ minWidth: 130, ...errStyle('categoria_id') }}
        >
          <option value="">Seleccionar</option>
          {catalogs.categorias.map((c) => (
            <option key={c.id} value={c.id}>{c.nombre}</option>
          ))}
        </select>
      </td>
      <td className={cellClass}>
        <select
          value={row.concepto_id}
          onChange={(e) => onChange(index, 'concepto_id', e.target.value)}
          className={cls('concepto_id')}
          disabled={!row.categoria_id}
          style={{ minWidth: 130, ...errStyle('concepto_id') }}
        >
          <option value="">{row.categoria_id ? 'Seleccionar' : 'Elija categoria'}</option>
          {conceptosFiltrados.map((c) => (
            <option key={c.id} value={c.id}>{c.nombre}</option>
          ))}
        </select>
      </td>
      <td className={cellClass}>
        <div className="flex items-center gap-1">
          <select
            value={row.proveedor_id}
            onChange={(e) => {
              if (e.target.value === '__CREATE__') {
                onCreateProveedor();
                return;
              }
              onChange(index, 'proveedor_id', e.target.value);
            }}
            className={inputOk}
            style={{ minWidth: 120 }}
          >
            <option value="">Opcional</option>
            {catalogs.proveedores.map((p) => (
              <option key={p.id} value={p.id}>{p.nombre}</option>
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
          style={{ minWidth: 120, ...errStyle('medio_pago_id') }}
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
  );
}
