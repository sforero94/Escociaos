import { useState, useEffect, useMemo } from 'react';
import { getSupabase } from '@/utils/supabase/client';
import { useFormPersistence } from '@/hooks/useFormPersistence';
import { FormDraftBanner } from '@/components/shared/FormDraftBanner';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogBody, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Loader2, Plus } from 'lucide-react';
import { ProveedorDialog } from '@/components/shared/ProveedorDialog';
import { CompradorDialog } from './CompradorDialog';
import { RepartoPotreros, FILA_REPARTO_VACIA } from '@/components/ganado/components/RepartoPotreros';
import { useGanadoInventario } from '@/components/ganado/hooks/useGanadoInventario';
import type { TransaccionGanado, Proveedor, Comprador } from '@/types/finanzas';
import type { GanFinca, GanLote, GanPotrero } from '@/types/ganado';
import type { RepartoFila } from '@/utils/calculosGanado';
import { validarExistencias } from '@/utils/calculosGanado';
import {
  DESTARE_CHIPS_KG_CABEZA,
  calcularPesosVentaGanado,
  errorDestareVenta,
  errorPotreroOrigenVenta,
} from '@/utils/calculosVentaGanado';
import { formatCurrency, formatNumber } from '@/utils/format';
import { cn } from '@/components/ui/utils';
import { toast } from 'sonner';
import { obtenerFechaHoy } from '@/utils/fechas';

interface TransaccionGanadoFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  transaccion?: TransaccionGanado | null;
  defaultTipo?: 'compra' | 'venta';
  onSuccess: () => void;
  /**
   * Prefill hato lechero (S9, plan §7.2/§8): abre el formulario compartido
   * desde la ficha de un animal en vez de duplicarlo. Con estas props la
   * venta no exige potrero de ceba ni destare (issue #215; el hato no
   * toca gan_inventario). `undefined` en Finanzas e Inventario.
   */
  hatoAnimalId?: string;
  hatoCantidadCabezasDefault?: number;
  /**
   * Se llama justo después de un INSERT exitoso (nunca en edición) cuando
   * `hatoAnimalId` está presente, con la fila recién creada -- el caller
   * (`VentaAnimalDialog`) lo usa para registrar el evento `venta` en
   * `hato_eventos` y marcar el animal `vendida`. Un fallo ahí no bloquea el
   * cierre del diálogo: la transacción financiera ya quedó guardada y
   * reabrir el formulario para reintentar duplicaría el dinero -- el caller
   * decide cómo avisar del a-medias (ver `useRegistrarSalidaHato`).
   */
  onGuardadoTransaccion?: (transaccion: { id: string; fecha: string; tipo: 'compra' | 'venta' }) => void | Promise<void>;
}

const selectClass = 'w-full px-3 py-2 text-sm border border-gray-200 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-primary/20';

function parseOpcional(value: string): number | null {
  if (value.trim() === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export function TransaccionGanadoForm({ open, onOpenChange, transaccion, defaultTipo = 'compra', onSuccess, hatoAnimalId, hatoCantidadCabezasDefault, onGuardadoTransaccion }: TransaccionGanadoFormProps) {
  const isEditing = !!transaccion;
  const { fetchEstructura, fetchInventario, confirmarPendiente } = useGanadoInventario();

  const [formData, setFormData, clearFormData, wasRestored] = useFormPersistence({
    // Un `hatoAnimalId` distinto usa una key de borrador propia -- evita que
    // el flujo de venta de una vaca puntual choque con un borrador de ganado
    // de ceba sin relación guardado bajo la key genérica 'ganado-new-v1'.
    key: transaccion?.id ? `ganado-edit-${transaccion.id}` : hatoAnimalId ? `ganado-hato-venta-${hatoAnimalId}` : 'ganado-new-v2',
    initialState: {
      fecha: obtenerFechaHoy(),
      tipo: defaultTipo as 'compra' | 'venta',
      finca: '',
      cliente_proveedor: '',
      cantidad_cabezas: hatoCantidadCabezasDefault != null ? String(hatoCantidadCabezasDefault) : '',
      kilos_pagados: '',
      peso_total_kg: '',
      destare_kg_cabeza: '',
      precio_kilo: '',
      valor_total: '',
      valor_manual: 'false',
      observaciones: '',
    },
  });
  const [saving, setSaving] = useState(false);
  const [filasReparto, setFilasReparto] = useState<RepartoFila[]>([{ ...FILA_REPARTO_VACIA }]);

  useEffect(() => {
    if (open) return;
    setFilasReparto([{ ...FILA_REPARTO_VACIA }]);
  }, [open]);

  // Catalog state
  const [fincas, setFincas] = useState<string[]>([]);
  const [fincasGan, setFincasGan] = useState<GanFinca[]>([]);
  const [lotes, setLotes] = useState<GanLote[]>([]);
  const [potreros, setPotreros] = useState<GanPotrero[]>([]);
  const [existencias, setExistencias] = useState<Record<string, { novillos: number; toros: number }>>({});
  const [proveedores, setProveedores] = useState<Proveedor[]>([]);
  const [compradores, setCompradores] = useState<Comprador[]>([]);
  const [newFinca, setNewFinca] = useState(false);
  const [showProveedorDialog, setShowProveedorDialog] = useState(false);
  const [showCompradorDialog, setShowCompradorDialog] = useState(false);

  const isCompra = formData.tipo === 'compra';
  const isVentaCeba = formData.tipo === 'venta' && !hatoAnimalId;
  const cantidadCabezas = Math.round(Number(formData.cantidad_cabezas) || 0);
  const pesoTotalKg = parseOpcional(formData.peso_total_kg);
  const destareKgCabeza = parseOpcional(formData.destare_kg_cabeza);
  const precioKilo = parseOpcional(formData.precio_kilo);
  const pesos = calcularPesosVentaGanado({
    pesoTotalKg,
    destareKgCabeza,
    cantidadCabezas,
    precioKilo,
  });
  const valorManual = formData.valor_manual === 'true';

  // Load catalogs
  useEffect(() => {
    if (!open) return;
    const supabase = getSupabase() as any;

    // Fincas: catálogo compartido con el inventario de ganado (gan_fincas,
    // issue #51). Fallback a las fincas históricas de transacciones si el
    // catálogo aún no está desplegado o está vacío.
    supabase.from('gan_fincas').select('nombre').eq('activa', true).order('nombre').then(({ data, error }: any) => {
      if (!error && data && data.length > 0) {
        setFincas((data as any[]).map((r: any) => r.nombre as string));
        return;
      }
      supabase.from('fin_transacciones_ganado').select('finca').then(({ data: txData }: any) => {
        if (!txData) return;
        const seen = new Map<string, string>();
        (txData as any[]).forEach((r: any) => {
          if (r.finca && !seen.has(r.finca.toLowerCase())) {
            seen.set(r.finca.toLowerCase(), r.finca);
          }
        });
        setFincas(Array.from(seen.values()).sort((a, b) => a.localeCompare(b, 'es', { sensitivity: 'base' })));
      });
    });

    loadProveedores();
    loadCompradores();
  }, [open]);

  useEffect(() => {
    if (!open || !isVentaCeba) return;
    let cancelado = false;
    (async () => {
      try {
        const [estructura, inventario] = await Promise.all([fetchEstructura(), fetchInventario()]);
        if (cancelado) return;
        setFincasGan(estructura.fincas);
        setLotes(estructura.lotes);
        setPotreros(estructura.potreros);
        const map: Record<string, { novillos: number; toros: number }> = {};
        inventario.forEach((r) => {
          map[r.potrero_id] = { novillos: r.novillos, toros: r.toros };
        });
        setExistencias(map);
      } catch {
        // El formulario de finanzas sigue usable: el guard de potrero
        // bloqueará el save de una venta de ceba si no hay catálogo.
      }
    })();
    return () => {
      cancelado = true;
    };
  }, [open, isVentaCeba, fetchEstructura, fetchInventario]);

  const loadProveedores = async () => {
    const { data } = await getSupabase().from('fin_proveedores').select('*').eq('activo', true).order('nombre');
    if (data) setProveedores(data as Proveedor[]);
  };

  const loadCompradores = async () => {
    const { data } = await getSupabase().from('fin_compradores').select('*').eq('activo', true).order('nombre');
    if (data) setCompradores(data as Comprador[]);
  };

  useEffect(() => {
    if (transaccion) {
      setFormData({
        fecha: transaccion.fecha,
        tipo: transaccion.tipo,
        finca: transaccion.finca || '',
        cliente_proveedor: transaccion.cliente_proveedor || '',
        cantidad_cabezas: String(transaccion.cantidad_cabezas || ''),
        kilos_pagados: String(transaccion.kilos_pagados || ''),
        peso_total_kg: transaccion.peso_total_kg != null ? String(transaccion.peso_total_kg) : '',
        destare_kg_cabeza: transaccion.destare_kg_cabeza != null ? String(transaccion.destare_kg_cabeza) : '',
        precio_kilo: String(transaccion.precio_kilo || ''),
        valor_total: String(transaccion.valor_total || ''),
        valor_manual: 'true',
        observaciones: transaccion.observaciones || '',
      });
      // If editing and finca is not in the list, show text input
      if (transaccion.finca && !fincas.some((f) => f.toLowerCase() === transaccion.finca?.toLowerCase())) {
        setNewFinca(true);
      }
    }
  }, [transaccion, fincas]);

  useEffect(() => {
    if (!open) return;
    if (isEditing) return;
    setFilasReparto((prev) => {
      if (prev.length !== 1 || prev[0].toros !== 0) return prev;
      const novillos = isVentaCeba ? cantidadCabezas : prev[0].novillos;
      if (prev[0].novillos === novillos) return prev;
      return [{ ...prev[0], novillos }];
    });
  }, [open, isEditing, isVentaCeba, cantidadCabezas]);

  useEffect(() => {
    if (!open || isEditing || !isVentaCeba || valorManual) return;
    if (pesos.valorCalculado == null) return;
    const actual = formData.valor_total;
    const siguiente = String(pesos.valorCalculado);
    if (actual === siguiente) return;
    setFormData((prev) => ({ ...prev, valor_total: siguiente }));
  }, [open, isEditing, isVentaCeba, valorManual, pesos.valorCalculado, formData.valor_total, setFormData]);

  const update = (field: string, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const handleFincaChange = (value: string) => {
    if (value === '__new__') {
      setNewFinca(true);
      update('finca', '');
    } else {
      setNewFinca(false);
      update('finca', value);
    }
  };

  const handleProveedorCreated = async (proveedorId: string) => {
    await loadProveedores();
    // Find the new proveedor name and set it
    const { data } = await getSupabase().from('fin_proveedores').select('nombre').eq('id', proveedorId).single();
    if (data) update('cliente_proveedor', (data as any).nombre);
  };

  const handleCompradorCreated = async (compradorId: string) => {
    await loadCompradores();
    const { data } = await getSupabase().from('fin_compradores').select('nombre').eq('id', compradorId).single();
    if (data) update('cliente_proveedor', (data as any).nombre);
  };

  const nombrePotrero = useMemo(() => {
    const map = new Map(potreros.map((p) => [p.id, p.nombre]));
    return (id: string) => map.get(id) || 'El potrero';
  }, [potreros]);

  const handleDestareChip = (kg: number) => {
    const actual = parseOpcional(formData.destare_kg_cabeza);
    update('destare_kg_cabeza', actual === kg ? '' : String(kg));
  };

  const handleValorChange = (value: string) => {
    setFormData((prev) => ({ ...prev, valor_total: value, valor_manual: 'true' }));
  };

  const handleRecalcularValor = () => {
    if (pesos.valorCalculado == null) return;
    setFormData((prev) => ({
      ...prev,
      valor_total: String(pesos.valorCalculado),
      valor_manual: 'false',
    }));
  };

  const handleSubmit = async () => {
    if (!formData.fecha || !formData.valor_total) {
      toast.error('Fecha y valor total son requeridos');
      return;
    }

    const destareError = isVentaCeba
      ? errorDestareVenta({
          pesoTotalKg,
          destareKgCabeza,
          cantidadCabezas,
          precioKilo,
        })
      : null;
    if (destareError) {
      toast.error(destareError);
      return;
    }

    const potreroError = errorPotreroOrigenVenta({
      tipo: formData.tipo,
      esHato: Boolean(hatoAnimalId),
      esEdicion: isEditing,
      filas: filasReparto,
      cantidadCabezas,
    });
    if (potreroError) {
      toast.error(potreroError);
      return;
    }

    if (isVentaCeba && !isEditing && Object.keys(existencias).length > 0) {
      const existenciasError = validarExistencias(filasReparto, existencias, nombrePotrero);
      if (existenciasError) {
        toast.error(existenciasError);
        return;
      }
    }

    setSaving(true);
    try {
      const kilosPagados = isVentaCeba
        ? pesos.pesoNetoKg
        : formData.kilos_pagados
          ? Number(formData.kilos_pagados)
          : null;

      const payload = {
        fecha: formData.fecha,
        tipo: formData.tipo,
        finca: formData.finca || null,
        cliente_proveedor: formData.cliente_proveedor || null,
        cantidad_cabezas: cantidadCabezas,
        kilos_pagados: kilosPagados,
        peso_total_kg: isVentaCeba ? pesoTotalKg : null,
        destare_kg_cabeza: isVentaCeba ? destareKgCabeza : null,
        precio_kilo: precioKilo,
        valor_total: Number(formData.valor_total),
        observaciones: formData.observaciones || null,
        // Vínculo hato lechero (migración 059) -- solo al crear, nunca al
        // editar: una transacción ya existente no cambia de dueño de módulo.
        ...(hatoAnimalId && !isEditing ? { es_hato: true, hato_animal_id: hatoAnimalId } : {}),
      };

      const supabase = getSupabase() as any;

      // Si la finca es nueva, registrarla en el catálogo compartido para
      // que el inventario de ganado y futuros formularios la vean.
      if (newFinca && formData.finca.trim()) {
        try {
          const { data: existente } = await supabase
            .from('gan_fincas')
            .select('id')
            .ilike('nombre', formData.finca.trim())
            .limit(1);
          if (!existente || existente.length === 0) {
            await supabase.from('gan_fincas').insert({ nombre: formData.finca.trim() });
          }
        } catch {
          // Catálogo no desplegado aún — la transacción guarda el texto igual
        }
      }

      if (isEditing) {
        const { error } = await supabase
          .from('fin_transacciones_ganado')
          .update(payload)
          .eq('id', transaccion!.id);
        if (error) throw error;
        toast.success('Transaccion actualizada');
      } else if (hatoAnimalId) {
        // Necesitamos la fila insertada (id + fecha) para que el caller pueda
        // registrar el evento `venta` en hato_eventos con el vínculo
        // financiero correcto -- el `.insert()` plano de abajo no la trae.
        const { data, error } = await supabase
          .from('fin_transacciones_ganado')
          .insert(payload)
          .select('id, fecha, tipo')
          .single();
        if (error) throw error;
        toast.success('Transaccion registrada');
        if (onGuardadoTransaccion) {
          // Fallo aquí no debe bloquear el cierre del diálogo: la
          // transacción financiera ya se guardó, y dejar el formulario
          // abierto invita a un reintento que duplicaría la transacción. El
          // caller (VentaAnimalDialog) es responsable de avisar del a-medias.
          try {
            await onGuardadoTransaccion(data as { id: string; fecha: string; tipo: 'compra' | 'venta' });
          } catch {
            // onGuardadoTransaccion ya debe manejar y reportar sus propios
            // errores (ver useRegistrarSalidaHato) -- este catch solo evita
            // que una excepción no controlada interrumpa el cierre normal.
          }
        }
      } else {
        const { data, error } = await supabase
          .from('fin_transacciones_ganado')
          .insert(payload)
          .select('id')
          .single();
        if (error) throw error;

        if (isVentaCeba && data?.id) {
          try {
            const { data: pendiente, error: errorPendiente } = await supabase
              .from('gan_movimientos')
              .select('id')
              .eq('transaccion_ganado_id', data.id)
              .eq('estado', 'pendiente')
              .maybeSingle();
            if (errorPendiente) throw errorPendiente;
            if (!pendiente?.id) {
              throw new Error('No se creó el movimiento pendiente de inventario');
            }
            await confirmarPendiente({ movimientoId: pendiente.id, filas: filasReparto });
            toast.success('Venta registrada e inventario actualizado');
          } catch (inventarioError: unknown) {
            const message = inventarioError instanceof Error ? inventarioError.message : 'Error desconocido';
            toast.error(
              'La venta quedó en Finanzas. Confirma el potrero en Inventario → Movimientos. ' + message
            );
          }
        } else {
          toast.success('Transaccion registrada');
        }
      }

      clearFormData();
      setFilasReparto([{ ...FILA_REPARTO_VACIA }]);
      onSuccess();
      onOpenChange(false);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Error desconocido';
      toast.error('Error: ' + message);
    } finally {
      setSaving(false);
    }
  };

  const titulo = isEditing
    ? 'Editar Transaccion Ganado'
    : isCompra
      ? 'Nueva compra de ganado'
      : 'Nueva venta de ganado';

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent size={isVentaCeba ? 'lg' : 'md'}>
          <DialogHeader>
            <DialogTitle>{titulo}</DialogTitle>
          </DialogHeader>
          <DialogBody>
            <FormDraftBanner variant="restored" show={wasRestored} onDiscard={clearFormData} />
            <div className="space-y-4 p-1">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label>Fecha *</Label>
                  <Input type="date" value={formData.fecha} onChange={(e) => update('fecha', e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label>Tipo *</Label>
                  <select
                    value={formData.tipo}
                    onChange={(e) => update('tipo', e.target.value)}
                    className={selectClass}
                    disabled={Boolean(hatoAnimalId)}
                  >
                    <option value="compra">Compra</option>
                    <option value="venta">Venta</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                {/* Finca dropdown */}
                <div className="space-y-1.5">
                  <Label>Finca</Label>
                  {newFinca ? (
                    <div className="flex gap-1.5">
                      <Input
                        value={formData.finca}
                        onChange={(e) => update('finca', e.target.value)}
                        placeholder="Nueva finca..."
                        className="flex-1"
                      />
                      <button
                        type="button"
                        onClick={() => { setNewFinca(false); update('finca', ''); }}
                        className="px-2 text-xs text-gray-500 hover:text-gray-700"
                      >
                        Cancelar
                      </button>
                    </div>
                  ) : (
                    <select
                      value={formData.finca}
                      onChange={(e) => handleFincaChange(e.target.value)}
                      className={selectClass}
                    >
                      <option value="">Seleccionar...</option>
                      {fincas.map((f) => <option key={f} value={f}>{f}</option>)}
                      <option value="__new__">+ Nueva finca</option>
                    </select>
                  )}
                </div>

                {/* Proveedor (compra) or Cliente (venta) dropdown */}
                <div className="space-y-1.5">
                  <Label>{isCompra ? 'Proveedor' : 'Cliente'}</Label>
                  <div className="flex gap-1.5">
                    <select
                      value={formData.cliente_proveedor}
                      onChange={(e) => update('cliente_proveedor', e.target.value)}
                      className={`${selectClass} flex-1`}
                    >
                      <option value="">Seleccionar...</option>
                      {isCompra
                        ? proveedores.map((p) => <option key={p.id} value={p.nombre}>{p.nombre}</option>)
                        : compradores.map((c) => <option key={c.id} value={c.nombre}>{c.nombre}</option>)
                      }
                    </select>
                    <button
                      type="button"
                      onClick={() => isCompra ? setShowProveedorDialog(true) : setShowCompradorDialog(true)}
                      className="p-2 rounded-xl border border-gray-200 hover:bg-gray-50 text-gray-500 hover:text-primary transition-colors flex-shrink-0"
                      title={isCompra ? 'Nuevo proveedor' : 'Nuevo cliente'}
                    >
                      <Plus className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label>Cabezas</Label>
                <Input
                  type="number"
                  value={formData.cantidad_cabezas}
                  onChange={(e) => update('cantidad_cabezas', e.target.value)}
                  onWheel={(e) => e.currentTarget.blur()}
                  placeholder="0"
                />
              </div>

              {isVentaCeba ? (
                <>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <Label>Peso total (báscula) kg</Label>
                      <Input
                        type="number"
                        step="0.1"
                        value={formData.peso_total_kg}
                        onChange={(e) => update('peso_total_kg', e.target.value)}
                        onWheel={(e) => e.currentTarget.blur()}
                        placeholder="0"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Destare kg/cabeza</Label>
                      <div className="flex flex-wrap items-center gap-2">
                        {DESTARE_CHIPS_KG_CABEZA.map((kg) => {
                          const activo = destareKgCabeza === kg;
                          return (
                            <button
                              key={kg}
                              type="button"
                              onClick={() => handleDestareChip(kg)}
                              className={cn(
                                'px-3 py-1.5 text-sm rounded-xl border transition-colors',
                                activo
                                  ? 'border-primary bg-primary/10 text-primary'
                                  : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50'
                              )}
                            >
                              {kg}
                            </button>
                          );
                        })}
                        <Input
                          type="number"
                          step="0.1"
                          value={formData.destare_kg_cabeza}
                          onChange={(e) => update('destare_kg_cabeza', e.target.value)}
                          onWheel={(e) => e.currentTarget.blur()}
                          placeholder="Otro"
                          className="w-24"
                        />
                      </div>
                      <p className="text-xs text-brand-brown/60">Sin default. 10 y 15 son atajos; otro valor también vale.</p>
                    </div>
                  </div>

                  <div className="rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-brand-brown/80 space-y-1">
                    <p>
                      Destare total:{' '}
                      <strong>
                        {pesos.destareTotalKg != null ? `${formatNumber(pesos.destareTotalKg, 1)} kg` : '—'}
                      </strong>
                      {destareKgCabeza != null && cantidadCabezas > 0
                        ? ` (${formatNumber(destareKgCabeza, 1)} × ${formatNumber(cantidadCabezas)})`
                        : ''}
                    </p>
                    <p>
                      Peso neto (kilos pagados):{' '}
                      <strong>
                        {pesos.pesoNetoKg != null ? `${formatNumber(pesos.pesoNetoKg, 1)} kg` : '—'}
                      </strong>
                    </p>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <Label>$/Kilo (sobre neto)</Label>
                      <Input
                        type="number"
                        value={formData.precio_kilo}
                        onChange={(e) => update('precio_kilo', e.target.value)}
                        onWheel={(e) => e.currentTarget.blur()}
                        placeholder="0"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Valor Total *</Label>
                      <Input
                        type="number"
                        value={formData.valor_total}
                        onChange={(e) => handleValorChange(e.target.value)}
                        onWheel={(e) => e.currentTarget.blur()}
                        placeholder="0"
                      />
                      {pesos.valorCalculado != null && (
                        <p className="text-xs text-brand-brown/60">
                          Cálculo: neto × precio = {formatCurrency(pesos.valorCalculado)}
                          {valorManual && (
                            <>
                              {' · '}
                              <button
                                type="button"
                                className="text-primary hover:underline"
                                onClick={handleRecalcularValor}
                              >
                                Usar cálculo
                              </button>
                            </>
                          )}
                        </p>
                      )}
                    </div>
                  </div>

                  {!isEditing && (
                    <RepartoPotreros
                      label="Potrero de origen *"
                      filas={filasReparto}
                      onChange={setFilasReparto}
                      fincas={fincasGan}
                      lotes={lotes}
                      potreros={potreros}
                      existencias={existencias}
                      disabled={saving}
                    />
                  )}
                </>
              ) : (
                <>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <Label>Kilos</Label>
                      <Input
                        type="number"
                        value={formData.kilos_pagados}
                        onChange={(e) => update('kilos_pagados', e.target.value)}
                        onWheel={(e) => e.currentTarget.blur()}
                        placeholder="0"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label>$/Kilo</Label>
                      <Input
                        type="number"
                        value={formData.precio_kilo}
                        onChange={(e) => update('precio_kilo', e.target.value)}
                        onWheel={(e) => e.currentTarget.blur()}
                        placeholder="0"
                      />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <Label>Valor Total *</Label>
                    <Input
                      type="number"
                      value={formData.valor_total}
                      onChange={(e) => update('valor_total', e.target.value)}
                      onWheel={(e) => e.currentTarget.blur()}
                      placeholder="0"
                    />
                  </div>
                </>
              )}

              <div className="space-y-1.5">
                <Label>Observaciones</Label>
                <Textarea value={formData.observaciones} onChange={(e) => update('observaciones', e.target.value)} placeholder="Notas adicionales..." rows={2} />
              </div>
            </div>
          </DialogBody>
          <DialogFooter>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => { clearFormData(); setFilasReparto([{ ...FILA_REPARTO_VACIA }]); onOpenChange(false); }} disabled={saving}>Cancelar</Button>
              <Button onClick={handleSubmit} disabled={saving}>
                {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                {isEditing ? 'Guardar' : 'Registrar'}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ProveedorDialog
        open={showProveedorDialog}
        onOpenChange={setShowProveedorDialog}
        onSuccess={handleProveedorCreated}
        onError={(msg) => toast.error(msg)}
      />

      <CompradorDialog
        open={showCompradorDialog}
        onOpenChange={setShowCompradorDialog}
        onSuccess={handleCompradorCreated}
        onError={(msg) => toast.error(msg)}
      />
    </>
  );
}
