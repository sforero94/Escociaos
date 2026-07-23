import { useEffect, useState, useCallback } from 'react';
import { Loader2, Save } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { NumberInput } from '@/components/ui/number-input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { formatNumber, formatShortDate } from '@/utils/format';
import { resolverQuincena, rangoQuincena, calcularProductividad } from '@/utils/calculosHato';
import { useProduccionHato } from '../hooks/useProduccionHato';
import type { HatoProduccionQuincenal } from '@/types/hato';

const MESES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];

const hoyIso = () => new Date().toISOString().slice(0, 10);

interface ProduccionQuincenalFormProps {
  onSaved?: () => void;
}

/**
 * Producción quincenal — litros al camión por quincena (V3/D2), reemplaza
 * el concepto de "litros diarios" del diseño original: el camión recoge a
 * diario pero el sistema registra el total de la quincena (ciclo con el
 * que liquida el Pomar). Dato distinto del pesaje semanal por vaca —
 * ninguno de los dos alimenta al otro (decisión del dueño, segunda ronda
 * 2026-07-22).
 *
 * `hato_produccion_quincenal` se guarda UPDATE-por-id + INSERT (nunca
 * upsert de PostgREST) vía `useProduccionHato.guardarQuincena`.
 */
export function ProduccionQuincenalForm({ onSaved }: ProduccionQuincenalFormProps) {
  const hook = useProduccionHato();

  const inicial = resolverQuincena(hoyIso());
  const [anio, setAnio] = useState(inicial.anio);
  const [mes, setMes] = useState(inicial.mes);
  const [quincena, setQuincena] = useState<1 | 2>(inicial.quincena);

  const [registroId, setRegistroId] = useState<string | null>(null);
  const [litrosTotal, setLitrosTotal] = useState<number | undefined>(undefined);
  const [litrosPomar, setLitrosPomar] = useState<number | undefined>(undefined);
  const [numVacasOrdeno, setNumVacasOrdeno] = useState<number | undefined>(undefined);
  const [notas, setNotas] = useState('');

  const [cargando, setCargando] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [historial, setHistorial] = useState<HatoProduccionQuincenal[]>([]);

  const rango = rangoQuincena(anio, mes, quincena);

  const cargarRegistro = useCallback(async () => {
    setCargando(true);
    try {
      const existente = await hook.fetchQuincena(anio, mes, quincena);
      if (existente) {
        setRegistroId(existente.id);
        setLitrosTotal(existente.litros_total ?? undefined);
        setLitrosPomar(existente.litros_pomar_confirmado ?? undefined);
        setNumVacasOrdeno(existente.num_vacas_ordeno ?? undefined);
        setNotas(existente.notas ?? '');
      } else {
        setRegistroId(null);
        setLitrosTotal(undefined);
        setLitrosPomar(undefined);
        setNumVacasOrdeno(undefined);
        setNotas('');
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(`Error cargando quincena: ${msg}`);
    } finally {
      setCargando(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [anio, mes, quincena]);

  const cargarHistorial = useCallback(async () => {
    try {
      setHistorial(await hook.fetchHistorialQuincenal(8));
    } catch (err: unknown) {
      console.error('Error cargando historial de producción quincenal:', err);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    cargarRegistro();
  }, [cargarRegistro]);

  useEffect(() => {
    cargarHistorial();
  }, [cargarHistorial]);

  const handleGuardar = async () => {
    if (litrosTotal === undefined || litrosTotal === null) {
      toast.error('Ingresa los litros totales de la quincena');
      return;
    }
    setGuardando(true);
    try {
      await hook.guardarQuincena({
        anio,
        mes,
        quincena,
        fechaInicio: rango.fechaInicio,
        fechaFin: rango.fechaFin,
        litrosTotal,
        litrosPomarConfirmado: litrosPomar ?? null,
        numVacasOrdeno: numVacasOrdeno ?? null,
        notas: notas.trim() || null,
      });
      toast.success(registroId ? 'Quincena actualizada' : 'Quincena registrada');
      await Promise.all([cargarRegistro(), cargarHistorial()]);
      onSaved?.();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.toLowerCase().includes('unique') || msg.toLowerCase().includes('duplicate')) {
        toast.error('Ya existe un registro para esa quincena — recarga la página');
      } else {
        toast.error(`Error al guardar: ${msg}`);
      }
    } finally {
      setGuardando(false);
    }
  };

  const productividad = calcularProductividad(litrosTotal, numVacasOrdeno);

  return (
    <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
      <div className="p-4 border-b border-gray-200">
        <h3 className="font-semibold text-foreground">Producción quincenal (litros al camión)</h3>
        <p className="text-xs text-gray-500">
          Total que recoge el Pomar en la quincena — dato distinto del pesaje semanal por vaca.
        </p>
      </div>

      <div className="p-4 space-y-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="q-anio">Año</Label>
            <Select value={String(anio)} onValueChange={(v) => setAnio(parseInt(v, 10))}>
              <SelectTrigger id="q-anio" className="w-24">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {[inicial.anio - 1, inicial.anio, inicial.anio + 1].map((a) => (
                  <SelectItem key={a} value={String(a)}>{a}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="q-mes">Mes</Label>
            <Select value={String(mes)} onValueChange={(v) => setMes(parseInt(v, 10))}>
              <SelectTrigger id="q-mes" className="w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {MESES.map((nombre, idx) => (
                  <SelectItem key={idx + 1} value={String(idx + 1)}>{nombre}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="q-quincena">Quincena</Label>
            <Select value={String(quincena)} onValueChange={(v) => setQuincena(v === '1' ? 1 : 2)}>
              <SelectTrigger id="q-quincena" className="w-28">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="1">1ª (1-15)</SelectItem>
                <SelectItem value="2">2ª (16-fin)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <p className="text-xs text-gray-400">
            {formatShortDate(rango.fechaInicio)} – {formatShortDate(rango.fechaFin)}
            {registroId && <span className="ml-2 text-blue-600 font-medium">registro existente</span>}
          </p>
        </div>

        {cargando ? (
          <div className="flex items-center py-4 text-sm text-gray-400">
            <Loader2 className="w-4 h-4 animate-spin mr-2" /> Cargando…
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-1.5">
              <Label>Litros totales *</Label>
              <NumberInput value={litrosTotal} onChange={setLitrosTotal} decimals={1} placeholder="0" />
            </div>
            <div className="space-y-1.5">
              <Label>Litros confirmados por el Pomar</Label>
              <NumberInput value={litrosPomar} onChange={setLitrosPomar} decimals={1} placeholder="—" />
            </div>
            <div className="space-y-1.5">
              <Label>Vacas en ordeño</Label>
              <NumberInput value={numVacasOrdeno} onChange={setNumVacasOrdeno} decimals={0} placeholder="—" />
            </div>
          </div>
        )}

        {productividad !== null && (
          <p className="text-xs text-gray-500">
            Productividad: <span className="font-medium text-foreground">{formatNumber(productividad, 1)} L/vaca</span>
          </p>
        )}

        <div className="space-y-1.5">
          <Label htmlFor="q-notas">Notas</Label>
          <Textarea
            id="q-notas"
            value={notas}
            onChange={(e) => setNotas(e.target.value)}
            placeholder="Opcional"
            rows={2}
          />
        </div>

        <div className="flex justify-end">
          <Button onClick={handleGuardar} disabled={guardando || cargando}>
            {guardando ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
            {registroId ? 'Actualizar quincena' : 'Registrar quincena'}
          </Button>
        </div>
      </div>

      {historial.length > 0 && (
        <div className="border-t border-gray-200">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Quincena</th>
                  <th className="px-3 py-2 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide">Litros</th>
                  <th className="px-3 py-2 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide">Pomar</th>
                  <th className="px-3 py-2 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide">Vacas</th>
                  <th className="px-3 py-2 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide">L/vaca</th>
                </tr>
              </thead>
              <tbody>
                {historial.map((h, i) => {
                  const prod = calcularProductividad(h.litros_total, h.num_vacas_ordeno);
                  return (
                    <tr key={h.id} className={`border-t border-gray-100 ${i % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}`}>
                      <td className="px-3 py-1.5 whitespace-nowrap">
                        {MESES[h.mes - 1]} {h.anio} · {h.quincena}ª
                      </td>
                      <td className="px-3 py-1.5 text-right whitespace-nowrap">{formatNumber(h.litros_total, 1)}</td>
                      <td className="px-3 py-1.5 text-right whitespace-nowrap">
                        {h.litros_pomar_confirmado != null ? formatNumber(h.litros_pomar_confirmado, 1) : '—'}
                      </td>
                      <td className="px-3 py-1.5 text-right whitespace-nowrap">{h.num_vacas_ordeno ?? '—'}</td>
                      <td className="px-3 py-1.5 text-right whitespace-nowrap">
                        {prod !== null ? formatNumber(prod, 1) : '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
