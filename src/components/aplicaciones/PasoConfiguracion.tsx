import { useState, useEffect, useRef } from 'react';
import { MapPin, AlertCircle, Search, ChevronDown, X, Bug, ShoppingCart } from 'lucide-react';
import { getSupabase } from '../../utils/supabase/client';
import { formatearNumero, formatearMoneda } from '../../utils/format';
import { DateInput } from '../ui/date-input';
import { ToggleGroup, ToggleGroupItem } from '../ui/toggle-group';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Field, FieldLabel, FieldDescription, FieldGroup } from '../ui/field';
import { Input } from '../ui/input';
import { Textarea } from '../ui/textarea';
import { InputGroup, InputGroupAddon, InputGroupInput } from '../ui/input-group';
import { Checkbox } from '../ui/checkbox';
import { Badge } from '../ui/badge';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '../ui/collapsible';
import { Popover, PopoverContent, PopoverTrigger } from '../ui/popover';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '../ui/command';
import { Alert, AlertDescription } from '../ui/alert';
import { Card } from '../ui/card';
import { cn } from '../ui/utils';
import { sugerirFechaFin, sugerirNombreAplicacion } from '../../utils/calculadoraAplicacionesHelpers';
import { MezclaPlanSection, type EstimadoCompra, type EstadoAsignacionMezcla } from './PasoMezcla';
import type {
  ConfiguracionAplicacion,
  LoteSeleccionado,
  LoteCatalogo,
  TipoAplicacionLocal,
  BlancoBiologico,
  Mezcla,
  CalculosPorLote,
} from '../../types/aplicaciones';

interface PasoConfiguracionProps {
  configuracion: ConfiguracionAplicacion | null;
  onUpdate: (configuracion: ConfiguracionAplicacion) => void;
  mezclas: Mezcla[];
  onUpdateMezclas: (mezclas: Mezcla[], calculos: CalculosPorLote[]) => void;
  estadosAsignacion?: Record<string, EstadoAsignacionMezcla>;
  onReintentarAsignacion?: () => void;
  /** El error de validación general del wizard (se mantiene a nivel de paso, no inline por
   * campo — decisión ya tomada en W01-calculadora-v2.md §9, no se re-abre acá). */
  errorGeneral?: string;
}

const TIPO_OPCIONES: { value: TipoAplicacionLocal; label: string }[] = [
  { value: 'fumigacion', label: 'Fumigación' },
  { value: 'fertilizacion', label: 'Fertilización' },
  { value: 'drench', label: 'Drench' },
];

/**
 * Paso "Plan" (1 de 2) de la Calculadora — W01 v2. Absorbe lo que antes eran DOS pasos
 * separados (Configuración y Mezcla): tipo, fechas, lotes, mezcla, productos y dosis viven
 * en una sola pantalla con scroll, con un rail lateral de resumen + estimado de compra en
 * vivo (`W01-calculadora-v2.md`). La lógica de mezcla/productos/dosis vive en
 * `MezclaPlanSection` (PasoMezcla.tsx) — este archivo es dueño de nombre/tipo/fechas/
 * recomendación/lotes y compone esa sección debajo.
 */
export function PasoConfiguracion({
  configuracion,
  onUpdate,
  mezclas,
  onUpdateMezclas,
  estadosAsignacion,
  onReintentarAsignacion,
  errorGeneral,
}: PasoConfiguracionProps) {
  const supabase = getSupabase();

  const [formData, setFormData] = useState<Partial<ConfiguracionAplicacion>>({
    nombre: configuracion?.nombre || '',
    tipo: configuracion?.tipo || 'fumigacion',
    fecha_inicio_planeada: configuracion?.fecha_inicio_planeada || '',
    fecha_fin_planeada: configuracion?.fecha_fin_planeada || '',
    fecha_recomendacion: configuracion?.fecha_recomendacion || '',
    proposito: configuracion?.proposito || '',
    agronomo_responsable: configuracion?.agronomo_responsable || '',
    blanco_biologico: configuracion?.blanco_biologico || [],
    lotes_seleccionados: configuracion?.lotes_seleccionados || [],
  });

  // El nombre deja de auto-sugerirse en cuanto el usuario lo toca (o ya traía un valor al
  // montar — edición, o un borrador restaurado por useFormPersistence). Nunca se pisa una
  // edición real con la sugerencia (riesgo señalado en W01-calculadora-v2.md §7).
  const nombreTocadoRef = useRef(!!configuracion?.nombre?.trim());
  const fechaFinTocadaRef = useRef(!!configuracion?.fecha_fin_planeada);

  const [lotesCatalogo, setLotesCatalogo] = useState<LoteCatalogo[]>([]);
  const [cargandoLotes, setCargandoLotes] = useState(true);
  const [busquedaLote, setBusquedaLote] = useState('');

  const [blancosBiologicos, setBlancosBiologicos] = useState<BlancoBiologico[]>([]);
  const [busquedaBlanco, setBusquedaBlanco] = useState('');
  const [blancoAbierto, setBlancoAbierto] = useState(false);

  const [errores, setErrores] = useState<Record<string, string>>({});
  const [estimado, setEstimado] = useState<EstimadoCompra | null>(null);

  const tipoActual = formData.tipo;
  const tieneDatosRecomendacion = !!(
    configuracion?.proposito ||
    configuracion?.agronomo_responsable ||
    configuracion?.fecha_recomendacion ||
    (configuracion?.blanco_biologico && configuracion.blanco_biologico.length > 0)
  );
  const [detalleAbierto, setDetalleAbierto] = useState(
    () => tipoActual === 'fumigacion' || tieneDatosRecomendacion,
  );

  useEffect(() => {
    if (tipoActual === 'fumigacion' && (formData.blanco_biologico?.length ?? 0) === 0) {
      setDetalleAbierto(true);
    }
  }, [tipoActual]); // eslint-disable-line react-hooks/exhaustive-deps

  /** CARGAR LOTES DEL CATÁLOGO */
  useEffect(() => {
    (async () => {
      try {
        const { data, error } = await supabase
          .from('lotes')
          .select(
            `
            id, nombre, area_hectareas,
            arboles_grandes, arboles_medianos, arboles_pequenos, arboles_clonales, total_arboles,
            sublotes ( id, nombre )
          `,
          )
          .eq('activo', true)
          .order('nombre');

        if (error) throw error;

        setLotesCatalogo(
          (data || []).map((lote) => ({
            id: lote.id,
            nombre: lote.nombre,
            area_hectareas: lote.area_hectareas ?? 0,
            sublotes: lote.sublotes || [],
            conteo_arboles: {
              grandes: lote.arboles_grandes || 0,
              medianos: lote.arboles_medianos || 0,
              pequenos: lote.arboles_pequenos || 0,
              clonales: lote.arboles_clonales || 0,
              total: lote.total_arboles || 0,
            },
          })),
        );
      } catch (err) {
        console.error('Failed to load lotes catalog:', err);
      } finally {
        setCargandoLotes(false);
      }
    })();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  /** CARGAR BLANCOS BIOLÓGICOS */
  useEffect(() => {
    (async () => {
      try {
        const { data, error } = await supabase
          .from('plagas_enfermedades_catalogo')
          .select('id, nombre, tipo, descripcion, link_info, activo')
          .eq('activo', true)
          .order('nombre');
        if (error) throw error;
        setBlancosBiologicos((data || []) as BlancoBiologico[]);
      } catch {
        setBlancosBiologicos([]);
      }
    })();
  }, []);

  const blancosSeleccionados = blancosBiologicos.filter((b) => formData.blanco_biologico?.includes(b.id));
  const blancosDisponibles = blancosBiologicos.filter((b) => !formData.blanco_biologico?.includes(b.id));

  const agregarBlanco = (id: string) => {
    setFormData((prev) => ({ ...prev, blanco_biologico: [...(prev.blanco_biologico || []), id] }));
    setBusquedaBlanco('');
    setBlancoAbierto(false);
  };
  const quitarBlanco = (id: string) => {
    setFormData((prev) => ({ ...prev, blanco_biologico: (prev.blanco_biologico || []).filter((b) => b !== id) }));
  };

  /** TOGGLE LOTE — misma interacción para seleccionar y para quitar (tocar la tarjeta). No
   * hay una segunda lista de "lotes seleccionados" debajo (campo #10 de la auditoría). */
  const toggleLote = (lote: LoteCatalogo) => {
    const yaSeleccionado = formData.lotes_seleccionados?.some((l) => l.lote_id === lote.id);
    if (yaSeleccionado) {
      setFormData((prev) => ({
        ...prev,
        lotes_seleccionados: prev.lotes_seleccionados?.filter((l) => l.lote_id !== lote.id),
      }));
      return;
    }
    const nuevoLote: LoteSeleccionado = {
      lote_id: lote.id,
      nombre: lote.nombre,
      sublotes_ids: lote.sublotes.map((s) => s.id),
      area_hectareas: lote.area_hectareas,
      conteo_arboles: lote.conteo_arboles,
      calibracion_litros_arbol:
        formData.tipo === 'fumigacion' || formData.tipo === 'drench' ? 20 : undefined,
      tamano_caneca: formData.tipo === 'fumigacion' || formData.tipo === 'drench' ? 200 : undefined,
    };
    setFormData((prev) => ({
      ...prev,
      lotes_seleccionados: [...(prev.lotes_seleccionados || []), nuevoLote],
    }));
  };

  const actualizarLote = (loteId: string, campo: 'calibracion_litros_arbol' | 'tamano_caneca', valor: number) => {
    setFormData((prev) => ({
      ...prev,
      lotes_seleccionados: prev.lotes_seleccionados?.map((l) => (l.lote_id === loteId ? { ...l, [campo]: valor } : l)),
    }));
  };

  /** VALIDAR (mismo criterio que antes, ahora en un solo lugar porque ya no hay Paso 2 aparte) */
  const validar = (data: Partial<ConfiguracionAplicacion>): boolean => {
    const nuevosErrores: Record<string, string> = {};
    if (!data.nombre?.trim()) nuevosErrores.nombre = 'El nombre es requerido';
    if (!data.fecha_inicio_planeada) nuevosErrores.fecha_inicio_planeada = 'La fecha de inicio es requerida';
    if (!data.lotes_seleccionados || data.lotes_seleccionados.length === 0) {
      nuevosErrores.lotes = 'Debes seleccionar al menos un lote';
    }
    if (data.tipo === 'fumigacion' && (!data.blanco_biologico || data.blanco_biologico.length === 0)) {
      nuevosErrores.blanco_biologico = 'Debes seleccionar al menos un blanco biológico para fumigaciones';
    }
    if (data.tipo === 'fumigacion' || data.tipo === 'drench') {
      data.lotes_seleccionados?.forEach((lote) => {
        if (!lote.calibracion_litros_arbol || lote.calibracion_litros_arbol <= 0 || !lote.tamano_caneca) {
          nuevosErrores[`lote_${lote.lote_id}`] = 'Falta calibración o tamaño de caneca';
        }
      });
    }
    setErrores(nuevosErrores);
    return Object.keys(nuevosErrores).length === 0;
  };

  /** AUTO-SUGERIR nombre y fecha fin, y propagar al padre en cuanto lo mínimo esté completo —
   * mismo patrón de auto-guardado que ya usaba este paso, extendido con las dos sugerencias. */
  useEffect(() => {
    const numLotes = formData.lotes_seleccionados?.length ?? 0;

    let nombreEfectivo = formData.nombre || '';
    if (!nombreTocadoRef.current) {
      const sugerido = sugerirNombreAplicacion(formData.tipo, numLotes, formData.fecha_inicio_planeada || '');
      if (sugerido && sugerido !== nombreEfectivo) {
        nombreEfectivo = sugerido;
        setFormData((prev) => ({ ...prev, nombre: sugerido }));
        return; // el cambio de estado dispara este mismo efecto de nuevo con el valor ya puesto
      }
    }

    let fechaFinEfectiva = formData.fecha_fin_planeada || '';
    if (!fechaFinTocadaRef.current && formData.fecha_inicio_planeada) {
      const sugerida = sugerirFechaFin(formData.fecha_inicio_planeada);
      if (sugerida && sugerida !== fechaFinEfectiva) {
        fechaFinEfectiva = sugerida;
        setFormData((prev) => ({ ...prev, fecha_fin_planeada: sugerida }));
        return;
      }
    }

    if (formData.nombre && formData.tipo && formData.fecha_inicio_planeada && numLotes > 0) {
      validar(formData);
      onUpdate(formData as ConfiguracionAplicacion);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formData]);

  const totales = (formData.lotes_seleccionados || []).reduce(
    (acc, lote) => ({
      area: acc.area + lote.area_hectareas,
      arboles: acc.arboles + lote.conteo_arboles.total,
    }),
    { area: 0, arboles: 0 },
  );

  const usaCalibracion = formData.tipo === 'fumigacion' || formData.tipo === 'drench';

  return (
    <div className="grid grid-cols-1 xl:grid-cols-[1fr_300px] gap-6 items-start">
      <div className="space-y-8 min-w-0">
        {errorGeneral && (
          <Alert variant="destructive">
            <AlertCircle />
            <AlertDescription>{errorGeneral}</AlertDescription>
          </Alert>
        )}

        {/* NOMBRE — sugerido automáticamente, editable con un clic. AplicacionShell (fuera de
            este alcance) solo acepta un título de texto plano en el header, así que el campo
            editable real vive acá, primero en la pantalla — ver nota en el reporte final. */}
        <Field>
          <FieldLabel htmlFor="nombre-aplicacion">
            Nombre de la Aplicación <span className="text-destructive">*</span>
          </FieldLabel>
          <Input
            id="nombre-aplicacion"
            value={formData.nombre || ''}
            onChange={(e) => {
              nombreTocadoRef.current = true;
              setFormData((prev) => ({ ...prev, nombre: e.target.value }));
            }}
            placeholder="Se sugiere automáticamente al elegir tipo, lotes y fecha"
            aria-invalid={!!errores.nombre}
          />
          {errores.nombre ? (
            <p className="text-sm text-destructive flex items-center gap-1">
              <AlertCircle className="w-3.5 h-3.5" />
              {errores.nombre}
            </p>
          ) : (
            <FieldDescription>
              Se sugiere solo — puedes aceptarla tal cual o escribir la tuya en cualquier momento.
            </FieldDescription>
          )}
        </Field>

        {/* TIPO + FECHAS.
            Antes: `sm:grid-cols-[auto_1fr]`. Con el rail de 300px a la derecha, a "Ventana de
            ejecución" le quedaban ~180px para DOS DateInput, y cada uno arrastra 72px de padding
            (`px-4 pr-10`) — el texto se quedaba sin espacio y solo se veía el ícono de calendario,
            como si el campo estuviera roto. Ahora cada uno ocupa su propia fila hasta lg, y desde
            lg comparten en 50/50 (no auto/1fr), que es cuando de verdad hay ancho. */}
        <FieldGroup className="grid grid-cols-1 lg:grid-cols-2 gap-x-6 gap-y-5">
          <Field>
            <FieldLabel>
              Tipo de Aplicación <span className="text-destructive">*</span>
            </FieldLabel>
            <div className="hidden sm:block">
              <ToggleGroup
                type="single"
                variant="outline"
                value={formData.tipo}
                onValueChange={(v) => {
                  if (!v) return;
                  setFormData((prev) => ({
                    ...prev,
                    tipo: v as TipoAplicacionLocal,
                    lotes_seleccionados: prev.lotes_seleccionados?.map((l) => ({
                      ...l,
                      calibracion_litros_arbol: v === 'fumigacion' || v === 'drench' ? l.calibracion_litros_arbol ?? 20 : undefined,
                      tamano_caneca: v === 'fumigacion' || v === 'drench' ? l.tamano_caneca ?? 200 : undefined,
                    })),
                  }));
                }}
                aria-label="Tipo de aplicación"
              >
                {TIPO_OPCIONES.map((opt) => (
                  <ToggleGroupItem key={opt.value} value={opt.value} aria-label={opt.label}>
                    {opt.label}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
            </div>
            <div className="sm:hidden">
              <Select
                value={formData.tipo}
                onValueChange={(v) => setFormData((prev) => ({ ...prev, tipo: v as TipoAplicacionLocal }))}
              >
                <SelectTrigger aria-label="Tipo de aplicación">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TIPO_OPCIONES.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <FieldDescription>Determina si abajo se piden canecas o dosis por tamaño de árbol.</FieldDescription>
          </Field>

          <Field>
            <FieldLabel>
              Ventana de ejecución <span className="text-destructive">*</span>
            </FieldLabel>
            <div className="flex flex-col gap-2 min-[520px]:flex-row min-[520px]:items-center min-[520px]:gap-2.5">
              <div className="min-w-0 flex-1">
                <DateInput
                  value={formData.fecha_inicio_planeada || ''}
                  onChange={(v) => setFormData((prev) => ({ ...prev, fecha_inicio_planeada: v }))}
                  required
                />
              </div>
              <span aria-hidden="true" className="hidden min-[520px]:block text-sm text-muted-foreground flex-shrink-0">→</span>
              <div className="min-w-0 flex-1">
                <DateInput
                  value={formData.fecha_fin_planeada || ''}
                  onChange={(v) => {
                    fechaFinTocadaRef.current = true;
                    setFormData((prev) => ({ ...prev, fecha_fin_planeada: v }));
                  }}
                />
              </div>
            </div>
            {errores.fecha_inicio_planeada ? (
              <p className="text-sm text-destructive flex items-center gap-1">
                <AlertCircle className="w-3.5 h-3.5" />
                {errores.fecha_inicio_planeada}
              </p>
            ) : (
              <FieldDescription>
                Fecha fin se propone a partir del inicio (+1 mes) — editable.
              </FieldDescription>
            )}
          </Field>
        </FieldGroup>

        {/* DETALLES DE LA RECOMENDACIÓN — colapsable, se auto-abre si es obligatorio o si ya
            trae datos (nunca esconde un campo requerido). */}
        <Collapsible open={detalleAbierto} onOpenChange={setDetalleAbierto} className="border border-border rounded-xl overflow-hidden">
          <CollapsibleTrigger className="w-full flex items-center justify-between gap-3 px-4 py-3.5 bg-card text-left">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center flex-shrink-0">
                <Bug className="w-4 h-4" />
              </div>
              <div>
                <p className="text-sm font-bold text-foreground">Detalles de la recomendación</p>
                <p className="text-xs text-muted-foreground">
                  Fecha de recomendación, agrónomo, propósito y blanco biológico — opcional, no bloquea el cálculo
                </p>
              </div>
            </div>
            <ChevronDown className={cn('w-4.5 h-4.5 text-muted-foreground transition-transform flex-shrink-0', detalleAbierto && 'rotate-180')} />
          </CollapsibleTrigger>
          <CollapsibleContent className="px-4 pb-5 pt-1 border-t border-border bg-background">
            <FieldGroup className="grid grid-cols-1 sm:grid-cols-2 gap-5 pt-4">
              <Field>
                <FieldLabel>
                  Fecha de Recomendación <span className="text-muted-foreground font-normal text-xs">(opcional)</span>
                </FieldLabel>
                <DateInput
                  value={formData.fecha_recomendacion || ''}
                  onChange={(v) => setFormData((prev) => ({ ...prev, fecha_recomendacion: v }))}
                />
                <FieldDescription>Puede ser muy anterior a la ejecución — no se autocompleta.</FieldDescription>
              </Field>

              <Field>
                <FieldLabel htmlFor="agronomo">
                  Agrónomo Responsable <span className="text-muted-foreground font-normal text-xs">(opcional)</span>
                </FieldLabel>
                <Input
                  id="agronomo"
                  value={formData.agronomo_responsable || ''}
                  onChange={(e) => setFormData((prev) => ({ ...prev, agronomo_responsable: e.target.value }))}
                  placeholder="Nombre del agrónomo"
                />
                <FieldDescription>Hoy solo queda registrado — no se muestra aún en PDF ni reportes.</FieldDescription>
              </Field>

              <Field className="sm:col-span-2">
                <FieldLabel htmlFor="proposito">
                  Propósito / Observaciones <span className="text-muted-foreground font-normal text-xs">(opcional)</span>
                </FieldLabel>
                <Textarea
                  id="proposito"
                  value={formData.proposito || ''}
                  onChange={(e) => setFormData((prev) => ({ ...prev, proposito: e.target.value }))}
                  placeholder="Describe el objetivo de esta aplicación..."
                  rows={3}
                />
              </Field>

              {tipoActual === 'fertilizacion' ? (
                <div className="sm:col-span-2">
                  <Alert>
                    <Bug />
                    <AlertDescription>
                      <strong>Blanco Biológico</strong> no aplica a Fertilización — es exclusivo de tratamientos
                      fitosanitarios (Fumigación / Drench).
                    </AlertDescription>
                  </Alert>
                </div>
              ) : (
                <div className="sm:col-span-2 space-y-2.5">
                  <FieldLabel>
                    Blancos Biológicos (Plagas/Enfermedades){' '}
                    {tipoActual === 'fumigacion' ? (
                      <span className="text-destructive">*</span>
                    ) : (
                      <span className="text-muted-foreground font-normal text-xs">(opcional)</span>
                    )}
                  </FieldLabel>
                  <Popover open={blancoAbierto} onOpenChange={setBlancoAbierto}>
                    <PopoverTrigger asChild>
                      <button
                        type="button"
                        className="w-full flex items-center gap-2 px-3 py-2.5 border border-input rounded-md text-sm text-muted-foreground hover:border-ring transition-colors"
                      >
                        <Search className="w-4 h-4 flex-shrink-0" />
                        Buscar plaga o enfermedad…
                      </button>
                    </PopoverTrigger>
                    <PopoverContent align="start" className="p-0" style={{ width: 'var(--radix-popover-trigger-width)' }}>
                      <Command>
                        <CommandInput placeholder="Buscar..." value={busquedaBlanco} onValueChange={setBusquedaBlanco} />
                        <CommandList>
                          <CommandEmpty>Sin resultados.</CommandEmpty>
                          <CommandGroup>
                            {blancosDisponibles.map((blanco) => (
                              <CommandItem key={blanco.id} value={blanco.nombre} onSelect={() => agregarBlanco(blanco.id)}>
                                <span className="flex-1 min-w-0 truncate">{blanco.nombre}</span>
                                <span className="text-xs text-muted-foreground capitalize flex-shrink-0">{blanco.tipo}</span>
                              </CommandItem>
                            ))}
                          </CommandGroup>
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>
                  {blancosSeleccionados.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {blancosSeleccionados.map((blanco) => (
                        <Badge key={blanco.id} variant="secondary" className="gap-1.5 py-1 pl-2.5 pr-1.5">
                          {blanco.nombre}
                          <button
                            type="button"
                            onClick={() => quitarBlanco(blanco.id)}
                            aria-label={`Quitar ${blanco.nombre}`}
                            className="hover:text-destructive"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </Badge>
                      ))}
                    </div>
                  )}
                  {errores.blanco_biologico && (
                    <p className="text-sm text-destructive flex items-center gap-1">
                      <AlertCircle className="w-3.5 h-3.5" />
                      {errores.blanco_biologico}
                    </p>
                  )}
                </div>
              )}
            </FieldGroup>
          </CollapsibleContent>
        </Collapsible>

        {/* LOTES A APLICAR */}
        <div>
          <h4 className="text-sm font-bold text-foreground mb-1">Lotes a Aplicar</h4>
          <p className="text-xs text-muted-foreground mb-3">Toca una tarjeta para seleccionarla o quitarla — la misma acción sirve para ambas.</p>

          <div className="relative mb-3.5">
            <Search className="w-4 h-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <Input
              value={busquedaLote}
              onChange={(e) => setBusquedaLote(e.target.value)}
              placeholder="Buscar lote por nombre..."
              className="pl-9"
              disabled={cargandoLotes}
            />
          </div>

          {cargandoLotes ? (
            <div className="p-8 bg-muted rounded-xl text-center text-sm text-muted-foreground">Cargando lotes...</div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
              {lotesCatalogo
                .filter((lote) => lote.nombre.toLowerCase().includes(busquedaLote.toLowerCase()))
                .map((lote) => {
                  const seleccionado = formData.lotes_seleccionados?.some((l) => l.lote_id === lote.id);
                  return (
                    <label
                      key={lote.id}
                      className={cn(
                        'flex items-start gap-3 rounded-xl border px-4 py-3.5 cursor-pointer transition-colors min-h-11',
                        seleccionado ? 'border-primary bg-primary/5' : 'border-border hover:border-secondary',
                      )}
                    >
                      <Checkbox checked={!!seleccionado} onCheckedChange={() => toggleLote(lote)} className="mt-0.5" />
                      <span className="flex-1 min-w-0">
                        <span className="block text-sm font-medium text-foreground">{lote.nombre}</span>
                        <span className="block text-xs text-muted-foreground mt-0.5">
                          {formatearNumero(lote.area_hectareas, 1)} ha · {formatearNumero(lote.conteo_arboles.total, 0)} árboles
                        </span>
                      </span>
                    </label>
                  );
                })}
            </div>
          )}

          {errores.lotes && (
            <p className="text-sm text-destructive flex items-center gap-1 mt-3">
              <AlertCircle className="w-3.5 h-3.5" />
              {errores.lotes}
            </p>
          )}

          {/* Calibración / caneca por lote — solo Fumigación/Drench (KEEP-reducido, campo #10) */}
          {usaCalibracion && (formData.lotes_seleccionados?.length ?? 0) > 0 && (
            <div className="mt-4 space-y-2.5">
              <h5 className="text-xs font-bold text-foreground uppercase tracking-wide">Calibración por lote</h5>
              {formData.lotes_seleccionados?.map((lote) => (
                <div key={lote.lote_id} className="border border-border rounded-lg p-3.5 bg-card">
                  <p className="text-sm font-medium text-foreground flex items-center gap-1.5 mb-2.5">
                    <MapPin className="w-3.5 h-3.5 text-primary" />
                    {lote.nombre}
                  </p>
                  <div className="grid grid-cols-2 gap-3">
                    <Field>
                      <FieldLabel htmlFor={`calibracion-${lote.lote_id}`} className="text-xs">
                        Calibración
                      </FieldLabel>
                      <InputGroup>
                        <InputGroupInput
                          id={`calibracion-${lote.lote_id}`}
                          type="number"
                          onWheel={(e) => e.currentTarget.blur()}
                          step="0.1"
                          min={0}
                          value={lote.calibracion_litros_arbol ?? ''}
                          onChange={(e) =>
                            actualizarLote(lote.lote_id, 'calibracion_litros_arbol', parseFloat(e.target.value) || 0)
                          }
                        />
                        <InputGroupAddon align="inline-end">L/árbol</InputGroupAddon>
                      </InputGroup>
                    </Field>
                    <Field>
                      <FieldLabel className="text-xs">Tamaño de Caneca</FieldLabel>
                      <Select
                        value={String(lote.tamano_caneca ?? 200)}
                        onValueChange={(v) => actualizarLote(lote.lote_id, 'tamano_caneca', parseInt(v, 10))}
                      >
                        <SelectTrigger size="sm">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {[20, 200, 500, 1000].map((v) => (
                            <SelectItem key={v} value={String(v)}>
                              {v}L
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </Field>
                  </div>
                  {errores[`lote_${lote.lote_id}`] && (
                    <p className="text-xs text-destructive flex items-center gap-1 mt-2">
                      <AlertCircle className="w-3 h-3" />
                      {errores[`lote_${lote.lote_id}`]}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* MEZCLA Y PRODUCTOS */}
        {formData.lotes_seleccionados && formData.lotes_seleccionados.length > 0 && (
          <MezclaPlanSection
            configuracion={formData as ConfiguracionAplicacion}
            mezclas={mezclas}
            estadosAsignacion={estadosAsignacion}
            onUpdate={onUpdateMezclas}
            onEstimadoChange={setEstimado}
            onReintentarAsignacion={onReintentarAsignacion}
          />
        )}
      </div>

      {/* RAIL — resumen + estimado de compra en vivo. Se apila debajo del contenido en
          pantallas angostas (sin Drawer: mismo dato, layout de una columna). */}
      <div className="xl:sticky xl:top-6 space-y-4">
        <Card className="p-4">
          <h5 className="text-sm font-bold text-foreground mb-3">Resumen</h5>
          <div className="grid grid-cols-3 gap-2 text-center">
            <div>
              <p className="text-lg font-bold tabular-nums text-foreground">{formData.lotes_seleccionados?.length ?? 0}</p>
              <p className="text-xs text-muted-foreground">Lotes</p>
            </div>
            <div>
              <p className="text-lg font-bold tabular-nums text-foreground">{formatearNumero(totales.area, 1)}</p>
              <p className="text-xs text-muted-foreground">ha</p>
            </div>
            <div>
              <p className="text-lg font-bold tabular-nums text-foreground">{formatearNumero(totales.arboles, 0)}</p>
              <p className="text-xs text-muted-foreground">Árboles</p>
            </div>
          </div>
        </Card>

        <Card className="p-4">
          <h5 className="text-sm font-bold text-foreground mb-3 flex items-center gap-1.5">
            <ShoppingCart className="w-4 h-4" />
            Estimado de Compra
          </h5>
          {estimado === null || estimado.items.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              {mezclas.length === 0
                ? 'Agrega una mezcla con productos para ver el impacto en compras.'
                : 'Todo lo necesario ya está disponible en inventario.'}
            </p>
          ) : (
            <div className="space-y-2">
              {estimado.items.map((item) => (
                <div key={item.producto_id} className="rounded-lg bg-destructive/5 border border-destructive/20 px-3 py-2">
                  <p className="text-sm font-bold text-foreground">{item.producto_nombre}</p>
                  <p className="text-xs text-destructive">
                    Faltante {formatearNumero(item.cantidad_faltante)} {item.unidad}
                    {item.costo_estimado ? ` · ≈ ${formatearMoneda(item.costo_estimado)}` : ''}
                  </p>
                </div>
              ))}
              <p className="text-[0.6875rem] text-muted-foreground pt-1">
                Se recalcula con cada producto que agregas — no hace falta llegar al Paso 2 para ver el impacto.
              </p>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
