import { useEffect, useState, useCallback } from 'react';
import { Loader2, Save, Trash2, Lock } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { NumberInput } from '@/components/ui/number-input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { RoleGuard } from '@/components/auth/RoleGuard';
import { formatNumber, formatShortDate, formatCurrency } from '@/utils/format';
import { resolverQuincena, rangoQuincena, calcularProductividad } from '@/utils/calculosHato';
import { calcularPrecioUnitarioQuincena } from '@/utils/hatoProduccion';
import { useProduccionHato, type HatoProduccionQuincenalConIngreso } from '../hooks/useProduccionHato';
import { useFinCatalogosVenta } from '../hooks/useFinCatalogosVenta';
import { obtenerFechaHoy } from '@/utils/fechas';

const MESES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];

// `obtenerFechaHoy()` -- NUNCA `new Date().toISOString().slice(0, 10)`, que
// es UTC y ya es "mañana" en Bogotá después de las 19:00.
const hoyIso = () => obtenerFechaHoy();

interface ProduccionQuincenalFormProps {
  onSaved?: () => void;
}

/**
 * Tarjeta que reemplaza el formulario para un rol sin permisos de Gerencia
 * (plan §4.3: "el gate es el ROL, no el resultado de la consulta" -- RLS
 * de `fin_ingresos` devuelve `[]` sin error, indistinguible de "no hay
 * ventas"). Mismo criterio que el bloque de Ventas del tablero (SOW 5).
 */
function CandadoGerencia() {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 flex items-center gap-3">
      <div className="w-9 h-9 rounded-lg bg-amber-100 flex items-center justify-center flex-shrink-0">
        <Lock className="w-4 h-4 text-amber-600" />
      </div>
      <div>
        <p className="text-sm font-semibold text-foreground">Producción quincenal (litros al camión)</p>
        <p className="text-xs text-gray-500">La captura de la venta quincenal requiere permisos de Gerencia.</p>
      </div>
    </div>
  );
}

/**
 * Producción quincenal — litros al camión por quincena (V3/D2), enlazada
 * 1:1 con su `fin_ingresos` (migración 070, RPC `fn_hato_guardar_quincena_
 * venta` — plan `docs/plan_hato_produccion_rework.md` §3/§6 SOW 3). Dato
 * distinto del pesaje semanal por vaca — ninguno de los dos alimenta al
 * otro (decisión del dueño, segunda ronda 2026-07-22).
 *
 * "Registro único" (plan §2.0): esta tarjeta captura EN UN SOLO guardado
 * los litros/vacas de Producción Y el valor/comprador/medio de pago del
 * ingreso — una sola escritura atómica vía `.rpc()`, nunca dos INSERT/
 * UPDATE sueltos. La fecha del ingreso (pago del Pomar) es un hecho
 * DISTINTO del periodo de producción (año/mes/quincena) — el Pomar paga
 * después de que cierra la quincena, así que no se valida una contra la
 * otra (ver la migración 070 para el detalle completo).
 *
 * Una quincena `origen_dato='derivado_mensual'` (backfill, SOW 4) es
 * read-only aquí: el RPC la rechaza explícitamente, así que el formulario
 * ni siquiera intenta editarla — se corrige desde `/finanzas/ingresos`.
 */
function ProduccionQuincenalFormInner({ onSaved }: ProduccionQuincenalFormProps) {
  const hook = useProduccionHato();
  const catalogos = useFinCatalogosVenta();

  const inicial = resolverQuincena(hoyIso());
  const [anio, setAnio] = useState(inicial.anio);
  const [mes, setMes] = useState(inicial.mes);
  const [quincena, setQuincena] = useState<1 | 2>(inicial.quincena);

  const [registroId, setRegistroId] = useState<string | null>(null);
  const [origenDato, setOrigenDato] = useState<HatoProduccionQuincenalConIngreso['origen_dato'] | null>(null);
  const [litrosTotal, setLitrosTotal] = useState<number | undefined>(undefined);
  const [litrosPomar, setLitrosPomar] = useState<number | undefined>(undefined);
  const [numVacasOrdeno, setNumVacasOrdeno] = useState<number | undefined>(undefined);
  const [notas, setNotas] = useState('');

  // Campos del `fin_ingresos` enlazado — NOT NULL en la tabla (CLAUDE.md R5)
  // salvo comprador. `fechaIngreso` es la fecha de PAGO del Pomar, no el
  // periodo de producción — se captura por separado a propósito.
  const [fechaIngreso, setFechaIngreso] = useState(hoyIso());
  const [valor, setValor] = useState<number | undefined>(undefined);
  const [regionId, setRegionId] = useState('');
  const [medioPagoId, setMedioPagoId] = useState('');
  const [compradorId, setCompradorId] = useState('');

  const [cargando, setCargando] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [eliminando, setEliminando] = useState(false);
  const [confirmEliminarOpen, setConfirmEliminarOpen] = useState(false);
  const [historial, setHistorial] = useState<HatoProduccionQuincenalConIngreso[]>([]);

  const rango = rangoQuincena(anio, mes, quincena);
  const soloLectura = origenDato === 'derivado_mensual';

  const resetIngreso = () => {
    setFechaIngreso(hoyIso());
    setValor(undefined);
    setRegionId('');
    setMedioPagoId('');
    setCompradorId('');
  };

  const cargarRegistro = useCallback(async () => {
    setCargando(true);
    try {
      const existente = await hook.fetchQuincena(anio, mes, quincena);
      if (existente) {
        setRegistroId(existente.id);
        setOrigenDato(existente.origen_dato);
        setLitrosTotal(existente.litros_total ?? undefined);
        setLitrosPomar(existente.litros_pomar_confirmado ?? undefined);
        setNumVacasOrdeno(existente.num_vacas_ordeno ?? undefined);
        setNotas(existente.notas ?? '');
        if (existente.finIngreso) {
          setFechaIngreso(existente.finIngreso.fecha);
          setValor(existente.finIngreso.valor);
          setRegionId(existente.finIngreso.region_id);
          setMedioPagoId(existente.finIngreso.medio_pago_id);
          setCompradorId(existente.finIngreso.comprador_id ?? '');
        } else {
          // El embed no llegó (RLS u otro motivo) -- el registro existe
          // pero no se puede prellenar el lado financiero; deja el
          // formulario en blanco en vez de fingir datos.
          resetIngreso();
        }
      } else {
        setRegistroId(null);
        setOrigenDato(null);
        setLitrosTotal(undefined);
        setLitrosPomar(undefined);
        setNumVacasOrdeno(undefined);
        setNotas('');
        resetIngreso();
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
    if (soloLectura) return;
    if (litrosTotal === undefined || litrosTotal === null) {
      toast.error('Ingresa los litros totales de la quincena');
      return;
    }
    if (!valor || valor <= 0) {
      toast.error('Ingresa el valor de la venta');
      return;
    }
    if (!regionId) {
      toast.error('Selecciona una región');
      return;
    }
    if (!medioPagoId) {
      toast.error('Selecciona un medio de pago');
      return;
    }

    setGuardando(true);
    try {
      await hook.guardarQuincena({
        quincenaId: registroId,
        anio,
        mes,
        quincena,
        fechaInicio: rango.fechaInicio,
        fechaFin: rango.fechaFin,
        litrosTotal,
        litrosPomarConfirmado: litrosPomar ?? null,
        numVacasOrdeno: numVacasOrdeno ?? null,
        notas: notas.trim() || null,
        finIngreso: {
          fecha: fechaIngreso,
          valor,
          regionId,
          medioPagoId,
          compradorId: compradorId || null,
          nombre: null,
        },
      });
      toast.success(registroId ? 'Quincena actualizada' : 'Quincena registrada');
      await Promise.all([cargarRegistro(), cargarHistorial()]);
      onSaved?.();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.toLowerCase().includes('unique') || msg.toLowerCase().includes('duplicate') || msg.includes('23505')) {
        toast.error('Ya existe un registro para esa quincena — recarga la página');
      } else {
        toast.error(`Error al guardar: ${msg}`);
      }
    } finally {
      setGuardando(false);
    }
  };

  const handleEliminar = async () => {
    if (!registroId) return;
    setEliminando(true);
    try {
      await hook.eliminarQuincena(registroId);
      toast.success('Quincena eliminada (junto con su ingreso enlazado)');
      await Promise.all([cargarRegistro(), cargarHistorial()]);
      onSaved?.();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(`Error al eliminar: ${msg}`);
    } finally {
      setEliminando(false);
      setConfirmEliminarOpen(false);
    }
  };

  const productividad = calcularProductividad(litrosTotal ?? null, numVacasOrdeno ?? null);
  const precioUnitario = calcularPrecioUnitarioQuincena(valor ?? null, litrosTotal ?? null);

  return (
    <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
      <div className="p-4 border-b border-gray-200">
        <h3 className="font-semibold text-foreground">Producción quincenal (litros al camión)</h3>
        <p className="text-xs text-gray-500">
          Total que recoge el Pomar en la quincena — un solo registro con la venta enlazada.
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
            {registroId && !soloLectura && <span className="ml-2 text-blue-600 font-medium">registro existente</span>}
            {soloLectura && <span className="ml-2 text-amber-600 font-medium">derivado de mensual — solo lectura</span>}
          </p>
        </div>

        {cargando ? (
          <div className="flex items-center py-4 text-sm text-gray-400">
            <Loader2 className="w-4 h-4 animate-spin mr-2" /> Cargando…
          </div>
        ) : soloLectura ? (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-3 text-sm text-amber-700">
            Esta quincena viene de la partición de un ingreso mensual histórico (backfill) y es de solo lectura.
            Para corregirla, edita el ingreso mensual desde <span className="font-medium">Finanzas → Ingresos</span>.
          </div>
        ) : (
          <>
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

            {productividad !== null && (
              <p className="text-xs text-gray-500">
                Productividad: <span className="font-medium text-foreground">{formatNumber(productividad, 1)} L/vaca</span>
              </p>
            )}

            {/* Venta enlazada — campos NOT NULL de fin_ingresos (CLAUDE.md R5,
                migración 070). "fecha" es la fecha de PAGO del Pomar, distinta
                del periodo de producción de arriba -- nunca se validan entre sí. */}
            <div className="border-t border-gray-100 pt-4 space-y-3">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Venta (fin_ingresos)</p>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="q-fecha-ingreso">Fecha de pago *</Label>
                  <Input
                    id="q-fecha-ingreso"
                    type="date"
                    value={fechaIngreso}
                    onChange={(e) => setFechaIngreso(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Valor total *</Label>
                  <NumberInput value={valor} onChange={setValor} decimals={0} placeholder="0" />
                </div>
                <div className="space-y-1.5">
                  <Label>Precio neto (calculado)</Label>
                  <div className="flex items-center h-9 px-3 rounded-md border bg-muted text-sm text-muted-foreground">
                    {precioUnitario != null ? `${formatCurrency(precioUnitario)} / L` : '—'}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="q-region">Región *</Label>
                  <Select value={regionId || undefined} onValueChange={setRegionId} disabled={catalogos.loading}>
                    <SelectTrigger id="q-region">
                      <SelectValue placeholder="Seleccionar región" />
                    </SelectTrigger>
                    <SelectContent>
                      {catalogos.regiones.map((r) => (
                        <SelectItem key={r.id} value={r.id}>{r.nombre}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="q-medio-pago">Medio de pago *</Label>
                  <Select value={medioPagoId || undefined} onValueChange={setMedioPagoId} disabled={catalogos.loading}>
                    <SelectTrigger id="q-medio-pago">
                      <SelectValue placeholder="Seleccionar medio de pago" />
                    </SelectTrigger>
                    <SelectContent>
                      {catalogos.mediosPago.map((m) => (
                        <SelectItem key={m.id} value={m.id}>{m.nombre}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="q-comprador">Comprador</Label>
                  <Select value={compradorId || undefined} onValueChange={setCompradorId} disabled={catalogos.loading}>
                    <SelectTrigger id="q-comprador">
                      <SelectValue placeholder="Opcional" />
                    </SelectTrigger>
                    <SelectContent>
                      {catalogos.compradores.map((c) => (
                        <SelectItem key={c.id} value={c.id}>{c.nombre}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>

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

            <div className="flex justify-between">
              {registroId ? (
                <Button
                  variant="outline"
                  className="border-red-200 text-red-600 hover:bg-red-50"
                  onClick={() => setConfirmEliminarOpen(true)}
                  disabled={guardando || cargando || eliminando}
                >
                  <Trash2 className="w-4 h-4 mr-2" /> Eliminar
                </Button>
              ) : <span />}
              <Button onClick={handleGuardar} disabled={guardando || cargando || eliminando}>
                {guardando ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
                {registroId ? 'Actualizar quincena' : 'Registrar quincena'}
              </Button>
            </div>
          </>
        )}
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
                        {h.origen_dato === 'derivado_mensual' && (
                          <span className="ml-2 px-2 py-1 text-xs font-medium rounded-md bg-amber-100 text-amber-700">
                            derivado de mensual
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-1.5 text-right whitespace-nowrap">
                        {h.litros_total != null ? formatNumber(h.litros_total, 1) : '—'}
                      </td>
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

      <ConfirmDialog
        open={confirmEliminarOpen}
        onOpenChange={setConfirmEliminarOpen}
        title="¿Eliminar esta quincena?"
        description="Se elimina la quincena y su venta enlazada (fin_ingresos) en una sola operación. Esta acción no se puede deshacer."
        confirmLabel="Eliminar"
        onConfirm={handleEliminar}
        destructive
      />
    </div>
  );
}

export function ProduccionQuincenalForm(props: ProduccionQuincenalFormProps) {
  return (
    <RoleGuard allowedRoles={['Gerencia']} fallback={<CandadoGerencia />}>
      <ProduccionQuincenalFormInner {...props} />
    </RoleGuard>
  );
}
