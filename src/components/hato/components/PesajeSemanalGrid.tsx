import { useEffect, useState, useCallback } from 'react';
import { Loader2, Save, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { NumberInput } from '@/components/ui/number-input';
import { formatNumber, formatLongDate } from '@/utils/format';
import { calcularFechaUltimoDiaPesaje } from '@/utils/calculosHato';
import { useProduccionHato } from '../hooks/useProduccionHato';
import type { HatoVacaActiva, HatoPesajeLeche } from '@/types/hato';

interface FilaPesaje {
  animal: HatoVacaActiva;
  existenteId: string | undefined;
  litros: number | undefined;
}

/**
 * Pesaje semanal por vaca (D1/V2) — una lectura por vaca por jornada de
 * pesaje (litros_total ya sumado am+pm, migración 061). Ausencia de fila
 * en `hato_pesajes_leche` significa "no pesada", nunca 0 (regla D del
 * plan §6 Épica D) — por eso una vaca sin valor digitado simplemente no se
 * envía, en vez de guardarse como cero.
 *
 * La fecha por defecto es el último día de pesaje configurado en
 * `hato_config.dia_pesaje_semanal` (migración 064, decisión del dueño:
 * miércoles) — nunca un día hardcodeado (CLAUDE.md).
 */
export function PesajeSemanalGrid({ onSaved }: { onSaved?: () => void }) {
  const hook = useProduccionHato();

  const [diaPesajeNombre, setDiaPesajeNombre] = useState<string | null>(null);
  const [fecha, setFecha] = useState<string | null>(null);
  const [filas, setFilas] = useState<FilaPesaje[]>([]);
  const [cargando, setCargando] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [errorConfig, setErrorConfig] = useState<string | null>(null);

  const cargar = useCallback(async (fechaObjetivo?: string) => {
    setCargando(true);
    setErrorConfig(null);
    try {
      const [config, vacas] = await Promise.all([
        hook.fetchDiaPesajeSemanal(),
        hook.fetchVacasActivas(),
      ]);
      setDiaPesajeNombre(config.nombre || `día ISO ${config.iso}`);

      const hoyIso = new Date().toISOString().slice(0, 10);
      const fechaUsar = fechaObjetivo ?? calcularFechaUltimoDiaPesaje(hoyIso, config.iso);
      setFecha(fechaUsar);

      const pesajes = await hook.fetchPesajesPorFecha(fechaUsar);
      setFilas(
        vacas.map((animal) => {
          const existente: HatoPesajeLeche | undefined = pesajes.get(animal.id);
          return { animal, existenteId: existente?.id, litros: existente?.litros_total };
        }),
      );
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setErrorConfig(msg);
    } finally {
      setCargando(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const actualizarLitros = (animalId: string, litros: number | undefined) => {
    setFilas((prev) => prev.map((f) => (f.animal.id === animalId ? { ...f, litros } : f)));
  };

  const handleGuardar = async () => {
    if (!fecha) return;
    const entradas = filas
      .filter((f) => f.litros !== undefined && f.litros !== null)
      .map((f) => ({ animal_id: f.animal.id, litros_total: f.litros as number, existenteId: f.existenteId }));

    if (entradas.length === 0) {
      toast.error('No hay pesajes digitados para guardar');
      return;
    }

    setGuardando(true);
    try {
      const { guardados } = await hook.guardarPesajes(fecha, entradas);
      toast.success(`${guardados} pesaje${guardados > 1 ? 's' : ''} guardado${guardados > 1 ? 's' : ''}`);
      await cargar(fecha);
      onSaved?.();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(`Error al guardar pesajes: ${msg}`);
    } finally {
      setGuardando(false);
    }
  };

  if (errorConfig) {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-700">
        {errorConfig}
      </div>
    );
  }

  const pesadas = filas.filter((f) => f.litros !== undefined && f.litros !== null).length;

  return (
    <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 p-4 border-b border-gray-200">
        <div>
          <h3 className="font-semibold text-foreground">Pesaje semanal por vaca</h3>
          <p className="text-xs text-gray-500">
            {diaPesajeNombre ? `Se pesa los ${diaPesajeNombre}` : 'Cargando configuración…'}
            {fecha ? ` · ${formatLongDate(fecha)}` : ''}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Label htmlFor="fecha-pesaje" className="text-xs text-gray-500">
            Fecha
          </Label>
          <input
            id="fecha-pesaje"
            type="date"
            value={fecha ?? ''}
            onChange={(e) => cargar(e.target.value)}
            className="px-2 py-1.5 text-sm border border-gray-200 rounded-xl bg-white focus:outline-none focus:ring-2"
          />
          <Button variant="outline" size="sm" disabled={cargando} onClick={() => cargar(fecha ?? undefined)}>
            {cargando ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
          </Button>
        </div>
      </div>

      {cargando ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-5 h-5 animate-spin text-primary" />
        </div>
      ) : filas.length === 0 ? (
        <div className="text-center py-12 text-sm text-gray-400">
          No hay vacas activas registradas en el hato.
        </div>
      ) : (
        <>
          <div className="overflow-y-auto" style={{ maxHeight: '28rem' }}>
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-gray-50">
                <tr>
                  <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">#</th>
                  <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Nombre</th>
                  <th className="px-3 py-2 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide w-32">Litros</th>
                </tr>
              </thead>
              <tbody>
                {filas.map((f, i) => (
                  <tr key={f.animal.id} className={`border-t border-gray-100 ${i % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}`}>
                    <td className="px-3 py-1.5 whitespace-nowrap text-gray-600">{f.animal.numero ?? '—'}</td>
                    <td className="px-3 py-1.5 whitespace-nowrap">{f.animal.nombre ?? 'Sin nombre'}</td>
                    <td className="px-3 py-1 text-right">
                      <NumberInput
                        value={f.litros}
                        onChange={(v) => actualizarLitros(f.animal.id, v)}
                        decimals={1}
                        placeholder="—"
                        className="w-24 ml-auto text-right"
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 p-4 border-t border-gray-200 bg-gray-50/50">
            <p className="text-xs text-gray-500">
              {pesadas} de {filas.length} vacas pesadas
              {pesadas > 0 && (
                <>
                  {' · promedio '}
                  {formatNumber(
                    filas.reduce((s, f) => s + (f.litros ?? 0), 0) / pesadas,
                    1,
                  )}{' '}
                  L
                </>
              )}
            </p>
            <Button onClick={handleGuardar} disabled={guardando || pesadas === 0}>
              {guardando ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
              Guardar pesajes
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
