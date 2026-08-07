// ARCHIVO: components/hato/ChequeoDetalle.tsx
// DESCRIPCIÓN: Ruta `/hato-lechero/chequeos/:id` (Figma alignment spec §5).
// Tabla de solo lectura de un chequeo ya cargado -- el dueño pidió esto
// porque, sin ella, la lista de chequeos "es una lista inútil" (D-4 sigue
// vigente: la captura sigue siendo solo por Excel, esta vista NO edita
// nada). Columnas modeladas sobre la grilla "Nuevo chequeo" del mock de
// Figma: #, Nombre, PL, #P, Últ. cría, SX, F Servicio, Toro, TP, Estado,
// Secar (auto), PP (auto).
//
// Cada celda prefiere el valor NORMALIZADO; si no existe, cae al crudo
// (`*_raw`, mostrado en gris itálica con tooltip) y solo si tampoco hay
// crudo muestra `—`. Tres columnas (Últ. cría, SX, TP) no tienen
// contraparte normalizada en el esquema (ver `types/hato.ts`) -- siempre
// muestran el dato crudo.

import { useMemo, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Loader2, AlertTriangle, ArrowLeft, FileSpreadsheet, FileDown, ChevronUp, ChevronDown, ChevronsUpDown } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { useHatoChequeoDetalle, type ChequeoVacaDetalle } from './hooks/useHatoChequeoDetalle';
import { HatoPageHeader } from './components/HatoPageHeader';
import { EstadoChip } from './components/EstadoChip';
import { chipTipoEstado, chipNumeroProvisional } from '@/utils/hatoUi';
import { ordenarPorValor, type DireccionOrdenAnimales as DireccionOrden } from '@/utils/ordenarAnimalesHato';
import { formatShortDate, formatNumber } from '@/utils/format';
import {
  descargarPlanillaChequeo,
  construirTituloHojaChequeo,
  construirNombreHojaChequeo,
  isoATextoDDMMYYYY,
  type FilaPlanillaChequeo,
} from '@/utils/hato/exportarPlanillaChequeo';

type ColumnaOrdenableChequeo = 'numero' | 'nombre';

function CabeceraOrdenable({
  label,
  columna,
  ordenActual,
  onOrdenar,
  align = 'left',
}: {
  label: string;
  columna: ColumnaOrdenableChequeo;
  ordenActual: { columna: ColumnaOrdenableChequeo; direccion: DireccionOrden };
  onOrdenar: (columna: ColumnaOrdenableChequeo) => void;
  align?: 'left' | 'right';
}) {
  const activa = ordenActual.columna === columna;
  return (
    <th className={`px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-gray-500 whitespace-nowrap ${align === 'right' ? 'text-right' : 'text-left'}`}>
      <button
        type="button"
        onClick={() => onOrdenar(columna)}
        className={`inline-flex items-center gap-1 hover:text-gray-900 ${activa ? 'text-gray-900' : ''}`}
      >
        {label}
        {activa ? (
          ordenActual.direccion === 'asc' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />
        ) : (
          <ChevronsUpDown className="w-3 h-3 text-gray-300" />
        )}
      </button>
    </th>
  );
}

/**
 * B5.2 -- export de un chequeo YA CARGADO, para record-keeping. Totalmente
 * poblado usando la capa CRUDA (`*_raw`) de cada campo -- el texto verbatim
 * que ya se normalizó una vez al cargar este chequeo, así que reparsearlo
 * (B5.3) reproduce EXACTAMENTE los mismos valores normalizados, sin
 * necesidad de reconstruir texto a partir de los normalizados. Identidad
 * (`#`/`Nombre`) sale del animal (`hato_animales`, vía el join de
 * `useHatoChequeoDetalle`), no tiene columna `_raw` propia.
 */
function filaPlanillaDesdeChequeoVaca(fila: ChequeoVacaDetalle): FilaPlanillaChequeo {
  return {
    numero: fila.numero,
    nombre: fila.nombre,
    pl: fila.pl_raw,
    numPartos: fila.np_raw,
    ultimaCria: fila.ultima_cria_raw,
    sexoCria: fila.sx_raw,
    fechaServicio: fila.fecha_servicio_raw,
    toro: fila.toro_raw,
    estado: fila.estado_raw,
    secar: isoATextoDDMMYYYY(fila.fecha_secar),
    partoProbable: isoATextoDDMMYYYY(fila.fecha_probable_parto),
    tratamiento: fila.ttto_raw,
  };
}

function Celda({
  valor,
  raw,
  formatter,
}: {
  valor: string | number | null;
  raw: string | null;
  formatter?: (v: string | number) => string;
}) {
  if (valor != null) {
    return <span>{formatter ? formatter(valor) : String(valor)}</span>;
  }
  if (raw) {
    return (
      <span className="text-gray-400 italic" title="Dato crudo de la planilla, sin normalizar">
        {raw}
      </span>
    );
  }
  return <span className="text-gray-300">—</span>;
}

/** Celda que SOLO tiene capa cruda (Últ. cría / SX / TP, ver docstring del
 * archivo) -- nunca hay un valor normalizado que preferir. */
function CeldaSoloRaw({ raw }: { raw: string | null }) {
  return raw ? <span>{raw}</span> : <span className="text-gray-300">—</span>;
}

function FilaChequeoVaca({ fila }: { fila: ChequeoVacaDetalle }) {
  return (
    <tr className="border-t border-gray-100">
      <td className="px-3 py-2.5 whitespace-nowrap font-medium">
        {fila.numero != null ? (
          <Link to={`/hato-lechero/hato/${fila.animal_id}`} className="hover:text-primary">
            #{fila.numero}
          </Link>
        ) : (
          <span className="text-gray-400 italic">sin caravana</span>
        )}
        {fila.numeroEsProvisional && <EstadoChip chip={chipNumeroProvisional()} className="ml-1" />}
      </td>
      <td className="px-3 py-2.5 whitespace-nowrap">
        <Link to={`/hato-lechero/hato/${fila.animal_id}`} className="hover:text-primary">
          {fila.nombre ?? '—'}
        </Link>
      </td>
      <td className="px-3 py-2.5 text-right whitespace-nowrap">
        <Celda valor={fila.pl} raw={fila.pl_raw} formatter={(v) => formatNumber(v as number, 1)} />
      </td>
      <td className="px-3 py-2.5 text-right whitespace-nowrap">
        <Celda valor={fila.num_partos} raw={fila.np_raw} formatter={(v) => formatNumber(v as number)} />
      </td>
      <td className="px-3 py-2.5 whitespace-nowrap"><CeldaSoloRaw raw={fila.ultima_cria_raw} /></td>
      <td className="px-3 py-2.5 whitespace-nowrap"><CeldaSoloRaw raw={fila.sx_raw} /></td>
      <td className="px-3 py-2.5 whitespace-nowrap">
        <Celda valor={fila.fecha_servicio} raw={fila.fecha_servicio_raw} formatter={(v) => formatShortDate(v as string)} />
      </td>
      <td className="px-3 py-2.5 whitespace-nowrap">
        <Celda valor={fila.toro} raw={fila.toro_raw} />
      </td>
      <td className="px-3 py-2.5 whitespace-nowrap"><CeldaSoloRaw raw={fila.tp_raw} /></td>
      <td className="px-3 py-2.5 whitespace-nowrap">
        {fila.estado != null ? (
          <EstadoChip chip={chipTipoEstado(fila.estado)} />
        ) : fila.estado_raw ? (
          <span className="text-gray-400 italic" title="Dato crudo de la planilla, sin normalizar">{fila.estado_raw}</span>
        ) : (
          <span className="text-gray-300">—</span>
        )}
      </td>
      <td className="px-3 py-2.5 whitespace-nowrap">
        <Celda valor={fila.fecha_secar} raw={fila.secar_raw} formatter={(v) => formatShortDate(v as string)} />
      </td>
      <td className="px-3 py-2.5 whitespace-nowrap">
        <Celda valor={fila.fecha_probable_parto} raw={fila.pp_raw} formatter={(v) => formatShortDate(v as string)} />
      </td>
    </tr>
  );
}

export function ChequeoDetalle() {
  const { id } = useParams<{ id: string }>();
  const { detalle, loading, error } = useHatoChequeoDetalle(id);
  const [exportando, setExportando] = useState(false);
  // Alfabético por defecto (T2, ronda agosto 2026) -- Martha ubica los
  // animales por nombre, no por número.
  const [orden, setOrden] = useState<{ columna: ColumnaOrdenableChequeo; direccion: DireccionOrden }>({
    columna: 'nombre',
    direccion: 'asc',
  });

  const handleOrdenar = (columna: ColumnaOrdenableChequeo) => {
    setOrden((prev) =>
      prev.columna === columna
        ? { columna, direccion: prev.direccion === 'asc' ? 'desc' : 'asc' }
        : { columna, direccion: 'asc' },
    );
  };

  const vacasOrdenadas = useMemo(() => {
    if (!detalle) return [];
    const extractor = orden.columna === 'nombre' ? (f: ChequeoVacaDetalle) => f.nombre : (f: ChequeoVacaDetalle) => f.numero;
    return ordenarPorValor(detalle.vacas, extractor, orden.direccion);
  }, [detalle, orden]);

  const handleExportar = async () => {
    if (!detalle) return;
    setExportando(true);
    try {
      const { chequeo, vacas } = detalle;
      await descargarPlanillaChequeo(
        {
          tituloHoja: construirTituloHojaChequeo(chequeo.fecha),
          nombreHoja: construirNombreHojaChequeo(chequeo.fecha),
          filas: vacas.map(filaPlanillaDesdeChequeoVaca),
        },
        `chequeo-${chequeo.fecha}.xlsx`,
      );
      toast.success('Chequeo exportado a Excel.');
    } catch {
      toast.error('No se pudo exportar el chequeo.');
    } finally {
      setExportando(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen-safe bg-background flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  if (error || !detalle) {
    return (
      <div className="min-h-screen-safe bg-background p-4 lg:p-8">
        <div className="max-w-4xl mx-auto">
          <Link to="/hato-lechero/chequeos" className="inline-flex items-center gap-1 text-sm text-primary hover:underline mb-4">
            <ArrowLeft className="w-4 h-4" /> Volver a chequeos
          </Link>
          <div className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            <AlertTriangle className="w-4 h-4 flex-shrink-0" />
            {error ?? 'No se encontró el chequeo solicitado.'}
          </div>
        </div>
      </div>
    );
  }

  const { chequeo, vacas } = detalle;
  const subtitulo = `${chequeo.veterinario ?? 'Sin veterinario registrado'} · Fuente: ${chequeo.fuente} · Estado: ${chequeo.estado} · ${formatNumber(vacas.length)} vacas`;

  return (
    <div className="min-h-screen-safe bg-background p-4 lg:p-8">
      <div className="max-w-7xl mx-auto w-full space-y-6">
        <Link to="/hato-lechero/chequeos" className="inline-flex items-center gap-1 text-sm text-primary hover:underline">
          <ArrowLeft className="w-4 h-4" /> Volver a chequeos
        </Link>

        <HatoPageHeader
          breadcrumb="Chequeos"
          section={formatShortDate(chequeo.fecha)}
          title={`Chequeo del ${formatShortDate(chequeo.fecha)}`}
          subtitle={subtitulo}
          actions={
            vacas.length > 0 && (
              <Button variant="outline" onClick={handleExportar} disabled={exportando}>
                {exportando ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <FileDown className="w-4 h-4 mr-2" />
                )}
                Exportar a Excel
              </Button>
            )
          }
        />

        {vacas.length === 0 ? (
          <div className="rounded-xl border border-gray-200 bg-white p-8 text-center">
            <FileSpreadsheet className="w-10 h-10 text-gray-300 mx-auto mb-3" />
            <p className="text-sm text-gray-500">Este chequeo no tiene filas de vacas cargadas.</p>
          </div>
        ) : (
          <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <CabeceraOrdenable label="#" columna="numero" ordenActual={orden} onOrdenar={handleOrdenar} />
                    <CabeceraOrdenable label="Nombre" columna="nombre" ordenActual={orden} onOrdenar={handleOrdenar} />
                    <th className="px-3 py-2.5 text-right text-xs font-semibold uppercase tracking-wide text-gray-500 whitespace-nowrap">PL</th>
                    <th className="px-3 py-2.5 text-right text-xs font-semibold uppercase tracking-wide text-gray-500 whitespace-nowrap">#P</th>
                    <th className="px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 whitespace-nowrap">Últ. cría</th>
                    <th className="px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 whitespace-nowrap">SX</th>
                    <th className="px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 whitespace-nowrap">F Servicio</th>
                    <th className="px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 whitespace-nowrap">Toro</th>
                    <th className="px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 whitespace-nowrap">TP</th>
                    <th className="px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 whitespace-nowrap">Estado</th>
                    <th className="px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 whitespace-nowrap">Secar (auto)</th>
                    <th className="px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 whitespace-nowrap">PP (auto)</th>
                  </tr>
                </thead>
                <tbody>
                  {vacasOrdenadas.map((fila) => (
                    <FilaChequeoVaca key={fila.id} fila={fila} />
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
