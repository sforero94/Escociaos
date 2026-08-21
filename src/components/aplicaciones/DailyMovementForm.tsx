import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useFormDraft } from '@/hooks/useFormDraft';
import { FormDraftBanner } from '@/components/shared/FormDraftBanner';
import {
  Save,
  Calendar as CalendarIcon,
  Package,
  User,
  Trash2,
  AlertTriangle,
  AlertCircle,
  FileText,
  Cloud,
  Clock,
  ArrowLeft,
  ChevronRight,
  Search,
} from 'lucide-react';
import { getSupabase } from '../../utils/supabase/client';
import { obtenerFechaHoy } from '../../utils/fechas';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Textarea } from '../ui/textarea';
import { DateInput } from '../ui/date-input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '../ui/popover';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '../ui/command';
import { Field, FieldLabel, FieldDescription, FieldError } from '../ui/field';
import { InputGroup, InputGroupAddon, InputGroupInput } from '../ui/input-group';
import { Item, ItemMedia, ItemContent, ItemTitle, ItemDescription, ItemGroup } from '../ui/item';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../ui/tabs';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../ui/tooltip';
import { Badge } from '../ui/badge';
import { Alert, AlertTitle, AlertDescription } from '../ui/alert';
import { Empty, EmptyDescription, EmptyMedia, EmptyTitle } from '../ui/empty';
import { Spinner } from '../ui/spinner';
import { Sheet, SheetContent, SheetFooter, SheetHeader, SheetTitle, SheetDescription } from '../ui/sheet';
import { Drawer, DrawerContent, DrawerTitle, DrawerDescription } from '../ui/drawer';
import { cn } from '../ui/utils';
import type {
  Aplicacion,
  MovimientoDiarioProducto,
  LoteSeleccionado,
  UnidadMedida,
  FraccionJornal,
} from '../../types/aplicaciones';
import type {
  Empleado,
  Contratista,
  Trabajador,
  WorkMatrix,
  ObservacionesMatrix,
} from '../../types/shared';
import { JornalFractionMatrix } from '../shared/JornalFractionMatrix';
import { calculateLaborCost, calculateContractorCost } from '../../utils/laborCosts';
import { formatearNumero } from '@/utils/format';

interface DailyMovementFormProps {
  aplicacion: Aplicacion;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

interface ProductoFormulario {
  producto_id: string;
  producto_nombre: string;
  producto_categoria: string;
  cantidad_utilizada: string;
  unidad_producto: string; // unidad_medida del producto desde BD (Litros o Kilos)
  presentacion_kg_l?: number; // SOLO para fertilización: cuántos Kg por bulto
}

interface ErroresCampo {
  fecha?: string;
  lote?: string;
  canecas?: string;
  bultos?: string;
  responsable?: string;
  productos?: string;
}

/** Nombre corto para la tira de chips ("Clara Yaneth Ríos Gómez" → "Clara Y."). */
function nombreCorto(nombre: string): string {
  const partes = nombre.trim().split(/\s+/).filter(Boolean);
  if (partes.length <= 1) return partes[0] ?? '';
  return `${partes[0]} ${partes[1][0].toUpperCase()}.`;
}

/** Iniciales para el avatar circular del chip/fila ("Clara Yaneth" → "CY"). */
function iniciales(nombre: string): string {
  const partes = nombre.trim().split(/\s+/).filter(Boolean);
  const a = partes[0]?.[0] ?? '';
  const b = partes[1]?.[0] ?? '';
  return (a + b).toUpperCase() || '?';
}

function trabajadorKey(t: Trabajador): string {
  return `${t.type}-${t.data.id ?? ''}`;
}

/** Persona elegible como Responsable — mismo universo (empleados + contratistas
 * activos) que el selector de cuadrilla, aplanado para el Command/Popover. */
interface PersonaResponsable {
  id: string;
  nombre: string;
  tipo: 'empleado' | 'contratista';
  subtitulo?: string;
}

/** `true` si el error luce como el `TypeError: Failed to fetch` de una señal intermitente. */
function esErrorDeRed(mensaje: string): boolean {
  return /failed to fetch|network|conexión|connection/i.test(mensaje);
}

/** Breakpoint local para elegir Sheet (escritorio) vs Drawer de pantalla completa (móvil). */
const MOBILE_BREAKPOINT = 768;

export function DailyMovementForm({ aplicacion, open, onOpenChange, onSuccess }: DailyMovementFormProps) {
  const supabase = getSupabase();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [erroresCampo, setErroresCampo] = useState<ErroresCampo>({});

  const [isMobile, setIsMobile] = useState(() =>
    typeof window !== 'undefined' ? window.innerWidth < MOBILE_BREAKPOINT : false
  );
  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < MOBILE_BREAKPOINT);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  // Vista interna: campos principales o selector de personal a pantalla completa dentro
  // del mismo Sheet/Drawer (nunca se rediseñan TrabajadorMultiSelect/JornalFractionMatrix
  // como componentes compartidos — viven en src/components/shared/ y los usa también
  // Labores; esta vista es propia de este formulario, ver W02-movimientos.md §8).
  const [vistaPersonal, setVistaPersonal] = useState(false);
  const [searchTermPersonal, setSearchTermPersonal] = useState('');
  const [workerTab, setWorkerTab] = useState<'empleados' | 'contratistas'>('empleados');

  useEffect(() => {
    if (open) setVistaPersonal(false);
  }, [open]);

  // Estados del formulario
  const [fechaMovimiento, setFechaMovimiento] = useState(obtenerFechaHoy());
  const [loteId, setLoteId] = useState('');
  const [numeroCanecas, setNumeroCanecas] = useState(''); // Total para fumigación/drench
  const [numeroBultos, setNumeroBultos] = useState(''); // Total para fertilización
  const [equipoAplicacion, setEquipoAplicacion] = useState('');
  const [personal, setPersonal] = useState('');
  const [horaInicio, setHoraInicio] = useState('07:20');
  const [horaFin, setHoraFin] = useState('15:50');
  const [responsable, setResponsable] = useState('');
  const [responsablePopoverOpen, setResponsablePopoverOpen] = useState(false);
  // Nombre de perfil (`usuarios.nombre_completo`) del usuario logueado — se
  // usa para autocompletar Responsable, pero SOLO si coincide con un
  // empleado/contratista real (ver efecto más abajo): con el picker, ya no
  // vale un nombre que no esté en esa lista.
  const [nombreUsuarioActual, setNombreUsuarioActual] = useState<string | null>(null);
  const [condicionesMeteorologicas, setCondicionesMeteorologicas] = useState('');
  const [notas, setNotas] = useState('');

  // Productos agregados (lista dinámica)
  const [productosAgregados, setProductosAgregados] = useState<ProductoFormulario[]>([]);
  const [productoSeleccionadoId, setProductoSeleccionadoId] = useState('');

  // Datos de la aplicación
  const [lotes, setLotes] = useState<LoteSeleccionado[]>([]);
  const [productosDisponibles, setProductosDisponibles] = useState<any[]>([]);
  const [canecasPorLote, setCanecasPorLote] = useState<Record<string, number>>({});
  const [bultosPorLote, setBultosPorLote] = useState<Record<string, number>>({});
  const [loteToMezclaMap, setLoteToMezclaMap] = useState<Record<string, string>>({});
  const [productosPorMezcla, setProductosPorMezcla] = useState<Record<string, any[]>>({});
  // Estado real de carga del catalogo de la aplicacion: arranca en true y solo
  // pasa a false cuando cargarDatosAplicacion termina (con exito o con error).
  const [cargandoProductos, setCargandoProductos] = useState(true);
  const [errorProductos, setErrorProductos] = useState<string | null>(null);
  // Token para descartar precargas obsoletas cuando el lote cambia rapido.
  const precargaTokenRef = useRef(0);

  // Worker tracking (employees + contractors)
  const [empleadosDisponibles, setEmpleadosDisponibles] = useState<Empleado[]>([]);
  const [contratistasDisponibles, setContratistasDisponibles] = useState<Contratista[]>([]);
  const [selectedTrabajadores, setSelectedTrabajadores] = useState<Trabajador[]>([]);
  const [workMatrix, setWorkMatrix] = useState<WorkMatrix>({});
  const [observacionesMatrix, setObservacionesMatrix] = useState<ObservacionesMatrix>({});

  // Draft persistence
  const draft = useFormDraft(`mov-diario-${aplicacion.id}-v1`, {
    fechaMovimiento, loteId, numeroCanecas, numeroBultos,
    equipoAplicacion, personal, horaInicio, horaFin,
    responsable, condicionesMeteorologicas, notas,
    productosAgregados, selectedTrabajadores, workMatrix, observacionesMatrix,
  }, { debounceMs: 2000 });

  const handleRestoreDraft = useCallback(() => {
    if (!draft.draftData) return;
    const d = draft.draftData;
    setFechaMovimiento(d.fechaMovimiento);
    setLoteId(d.loteId);
    setNumeroCanecas(d.numeroCanecas);
    setNumeroBultos(d.numeroBultos);
    setEquipoAplicacion(d.equipoAplicacion);
    setPersonal(d.personal);
    setHoraInicio(d.horaInicio);
    setHoraFin(d.horaFin);
    setResponsable(d.responsable);
    setCondicionesMeteorologicas(d.condicionesMeteorologicas);
    setNotas(d.notas);
    setProductosAgregados(d.productosAgregados);
    setSelectedTrabajadores(d.selectedTrabajadores);
    setWorkMatrix(d.workMatrix);
    setObservacionesMatrix(d.observacionesMatrix);
    draft.acceptDraft();
  }, [draft]);

  // 🔧 Productos filtrados según el lote seleccionado
  // Si hay un lote seleccionado, mostrar solo productos de su mezcla
  // Si no hay lote seleccionado, mostrar todos los de la aplicación
  const productosParaMostrar = useMemo(() => {
    const mezclaId = loteId ? loteToMezclaMap[loteId] : undefined;
    if (mezclaId) {
      return productosPorMezcla[mezclaId] || [];
    }
    return productosDisponibles;
  }, [loteId, loteToMezclaMap, productosPorMezcla, productosDisponibles]);

  // Cargar datos cuando el Sheet/Drawer se abre (el formulario permanece montado
  // detrás para que la animación de cierre corra completa — ver §6 del diseño).
  useEffect(() => {
    if (!open) return;
    cargarDatosAplicacion();
    cargarUsuarioActual();
    cargarTrabajadores();
  }, [open, aplicacion.id]);

  // Autocompleta Responsable con el usuario logueado SOLO si su nombre de
  // perfil coincide EXACTO con un empleado/contratista activo real — el
  // picker exige que Responsable sea alguien del sistema (ver CLAUDE.md del
  // módulo), así que ya no basta con `usuarios.nombre_completo` si esa
  // persona no está en la nómina/planilla (p. ej. un usuario Gerencia sin
  // ficha de empleado). No pisa una selección ya hecha por el usuario.
  useEffect(() => {
    if (!nombreUsuarioActual || responsable) return;
    const coincide =
      empleadosDisponibles.some(e => e.nombre === nombreUsuarioActual) ||
      contratistasDisponibles.some(c => c.nombre === nombreUsuarioActual);
    if (coincide) setResponsable(nombreUsuarioActual);
  }, [nombreUsuarioActual, empleadosDisponibles, contratistasDisponibles, responsable]);

  // 🔧 Precargar productos apenas se conocen, sin esperar a que se elija lote.
  // No hay forma manual de agregar productos en este formulario, así que si la
  // precarga no corre el movimiento no se puede guardar (validarFormulario exige
  // al menos un producto). Al cambiar de lote se recalcula la lista conservando
  // las cantidades ya digitadas.
  useEffect(() => {
    if (productosParaMostrar.length > 0) {
      precargarProductos(productosParaMostrar);
    }
  }, [productosParaMostrar]);

  const cargarDatosAplicacion = async () => {
    setCargandoProductos(true);
    setErrorProductos(null);
    try {
      // Cargar lotes de la aplicación
      const { data: lotesData, error: errorLotes } = await supabase
        .from('aplicaciones_lotes')
        .select(`
          lote_id,
          lotes (
            id,
            nombre
          )
        `)
        .eq('aplicacion_id', aplicacion.id);

      if (errorLotes) throw errorLotes;

      const lotesFormateados: LoteSeleccionado[] = (lotesData || []).map(l => ({
        lote_id: l.lote_id,
        nombre: l.lotes?.nombre || 'Sin nombre',
        area_hectareas: 0,
        conteo_arboles: { grandes: 0, medianos: 0, pequenos: 0, clonales: 0, total: 0 }
      }));

      setLotes(lotesFormateados);

      // Cargar cálculos por lote según tipo de aplicación (incluyendo mezcla_id)
      const { data: calculosData, error: errorCalculos } = await supabase
        .from('aplicaciones_calculos')
        .select('lote_id, numero_canecas, numero_bultos, mezcla_id')
        .eq('aplicacion_id', aplicacion.id);

      // Map lote_id → mezcla_id
      const loteToMezclaMapTemp: Record<string, string> = {};

      if (!errorCalculos && calculosData) {
        // Build lote → mezcla mapping (with type assertion)
        (calculosData as any[]).forEach((calc: any) => {
          if (calc.mezcla_id) {
            loteToMezclaMapTemp[calc.lote_id] = calc.mezcla_id;
          }
        });

        // Store in state
        setLoteToMezclaMap(loteToMezclaMapTemp);

        if (aplicacion.tipo_aplicacion === 'Fumigación' || aplicacion.tipo_aplicacion === 'Drench') {
          // Cargar canecas planeadas por lote
          const canecasMap: Record<string, number> = {};
          calculosData.forEach(calc => {
            if (calc.numero_canecas) {
              canecasMap[calc.lote_id] = calc.numero_canecas;
            }
          });
          setCanecasPorLote(canecasMap);
        } else if (aplicacion.tipo_aplicacion === 'Fertilización') {
          // Cargar bultos planeados por lote
          const bultosMap: Record<string, number> = {};
          calculosData.forEach(calc => {
            if (calc.numero_bultos) {
              bultosMap[calc.lote_id] = calc.numero_bultos;
            }
          });
          setBultosPorLote(bultosMap);
        }
      }

      // Cargar productos de las mezclas
      const { data: mezclasData, error: errorMezclas } = await supabase
        .from('aplicaciones_mezclas')
        .select('id')
        .eq('aplicacion_id', aplicacion.id);

      if (errorMezclas) throw errorMezclas;

      if (mezclasData && mezclasData.length > 0) {
        const mezclaIds = (mezclasData as any[]).map((m: any) => m.id);

        const { data: productosData, error: errorProductosQuery } = await supabase
          .from('aplicaciones_productos')
          .select(`
            mezcla_id,
            producto_id,
            producto_nombre,
            producto_categoria,
            producto_unidad,
            cantidad_total_necesaria
          `)
          .in('mezcla_id', mezclaIds);

        if (errorProductosQuery) throw errorProductosQuery;

        // Organizar productos por mezcla
        const productosPorMezclaTemp: Record<string, any[]> = {};
        (productosData || []).forEach((p: any) => {
          if (!productosPorMezclaTemp[p.mezcla_id]) {
            productosPorMezclaTemp[p.mezcla_id] = [];
          }
          productosPorMezclaTemp[p.mezcla_id].push({
            producto_id: p.producto_id,
            producto_nombre: p.producto_nombre,
            producto_categoria: p.producto_categoria,
            producto_unidad: p.producto_unidad,
            cantidad_total_necesaria: p.cantidad_total_necesaria,
            mezcla_id: p.mezcla_id
          });
        });

        setProductosPorMezcla(productosPorMezclaTemp);

        // Para compatibilidad, mantener la lista completa de productos disponibles
        const productosUnicos = new Map<string, any>();
        (productosData || []).forEach((p: any) => {
          if (!productosUnicos.has(p.producto_id)) {
            productosUnicos.set(p.producto_id, {
              producto_id: p.producto_id,
              producto_nombre: p.producto_nombre,
              producto_categoria: p.producto_categoria,
              producto_unidad: p.producto_unidad,
              cantidad_total_necesaria: p.cantidad_total_necesaria,
              mezcla_id: p.mezcla_id
            });
          }
        });

        const productosArray = Array.from(productosUnicos.values());
        setProductosDisponibles(productosArray);
      } else {
        setProductosPorMezcla({});
        setProductosDisponibles([]);
      }
    } catch (err: any) {
      setError('Error al cargar los datos de la aplicación');
      setErrorProductos('No se pudieron cargar los productos de la aplicación.');
    } finally {
      setCargandoProductos(false);
    }
  };

  // 🆕 Precargar todos los productos de la mezcla que aplica al lote elegido.
  // Conserva las cantidades ya digitadas (mismo producto_id) para que cambiar de
  // lote no borre lo que el usuario venía escribiendo.
  const precargarProductos = async (productos: any[]) => {
    const token = ++precargaTokenRef.current;

    // presentacion_kg_l SOLO se usa en fertilización, y se pide en una sola
    // consulta: antes era un select por producto, en serie.
    const presentaciones = new Map<string, number>();
    if (aplicacion.tipo_aplicacion === 'Fertilización') {
      const ids = productos.map(p => p.producto_id).filter(Boolean);
      if (ids.length > 0) {
        try {
          const { data, error: errorProductosQuery } = await supabase
            .from('productos')
            .select('id, presentacion_kg_l')
            .in('id', ids);

          if (errorProductosQuery) {
            console.error('Failed to fetch productos presentacion_kg_l:', errorProductosQuery);
          } else {
            (data || []).forEach((p: any) => {
              if (p.presentacion_kg_l != null) {
                presentaciones.set(p.id, p.presentacion_kg_l);
              }
            });
          }
        } catch (err) {
          console.error('Failed to fetch productos presentacion_kg_l:', err);
        }
      }
    }

    // Una precarga posterior ya ganó la carrera: descartamos esta.
    if (token !== precargaTokenRef.current) return;

    setProductosAgregados(prev => {
      const cantidadesPrevias = new Map(
        prev.map(p => [p.producto_id, p.cantidad_utilizada])
      );

      return productos.map(producto => ({
        producto_id: producto.producto_id,
        producto_nombre: producto.producto_nombre,
        producto_categoria: producto.producto_categoria,
        cantidad_utilizada: cantidadesPrevias.get(producto.producto_id) ?? '',
        unidad_producto: producto.producto_unidad,
        presentacion_kg_l: presentaciones.get(producto.producto_id)
      }));
    });
  };

  const cargarUsuarioActual = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        // `usuarios.id` ES el uid de auth (así lo asume get_user_role() en las
        // políticas RLS). No existe columna `user_id`: filtrar por ella devolvía 400
        // y el responsable nunca se autocompletaba.
        const { data: profile } = await supabase
          .from('usuarios')
          .select('nombre_completo')
          .eq('id', user.id)
          .single();

        if (profile?.nombre_completo) {
          // No se autocompleta directo: Responsable ahora es un picker sobre
          // empleados/contratistas, y el perfil de `usuarios` puede no
          // coincidir con ninguno de los dos (p. ej. un usuario Gerencia que
          // no está en nómina). Se resuelve en el efecto que cruza este
          // nombre contra `empleadosDisponibles`/`contratistasDisponibles`.
          setNombreUsuarioActual(profile.nombre_completo);
        }
      }
    } catch (err) {
      console.error('Failed to load current user profile:', err);
    }
  };

  const cargarTrabajadores = async () => {
    try {
      // Load employees
      const { data: empleados, error: errorEmpleados } = await supabase
        .from('empleados')
        .select('*')
        .eq('estado', 'Activo')
        .order('nombre');

      if (!errorEmpleados && empleados) {
        setEmpleadosDisponibles(empleados as Empleado[]);
      }

      // Load contractors
      const { data: contratistas, error: errorContratistas } = await supabase
        .from('contratistas')
        .select('*')
        .eq('estado', 'Activo')
        .order('nombre');

      if (!errorContratistas && contratistas) {
        setContratistasDisponibles(contratistas as Contratista[]);
      }
    } catch (err: any) {
      console.error('Error al cargar trabajadores:', err);
    }
  };

  // Pre-existente y sin uso desde la UI (no hay forma manual de agregar un producto
  // fuera de la precarga por mezcla) — se conserva tal cual, fuera de alcance de este
  // rediseño visual (ver reporte de la sesión).
  const agregarProducto = async () => {
    if (!productoSeleccionadoId) {
      setError('Selecciona un producto para agregar');
      return;
    }

    if (productosAgregados.some(p => p.producto_id === productoSeleccionadoId)) {
      setError('Este producto ya fue agregado');
      return;
    }

    const producto = productosDisponibles.find(p => p.producto_id === productoSeleccionadoId);
    if (!producto) return;

    let presentacionKgL: number | undefined;
    if (aplicacion.tipo_aplicacion === 'Fertilización') {
      try {
        const { data: productoData, error: errorProducto } = await supabase
          .from('productos')
          .select('presentacion_kg_l')
          .eq('id', productoSeleccionadoId)
          .single();

        if (errorProducto) {
          console.error('Failed to fetch product presentacion_kg_l for selection:', errorProducto);
        } else {
          presentacionKgL = productoData?.presentacion_kg_l ?? undefined;
        }
      } catch (err) {
        console.error('Failed to fetch product presentacion_kg_l for new product:', err);
      }
    }

    const nuevoProducto: ProductoFormulario = {
      producto_id: producto.producto_id,
      producto_nombre: producto.producto_nombre,
      producto_categoria: producto.producto_categoria,
      cantidad_utilizada: '',
      unidad_producto: producto.producto_unidad,
      presentacion_kg_l: presentacionKgL
    };

    setProductosAgregados([...productosAgregados, nuevoProducto]);
    setProductoSeleccionadoId('');
    setError(null);
  };

  const eliminarProducto = (index: number) => {
    setProductosAgregados(productosAgregados.filter((_, i) => i !== index));
  };

  const actualizarCantidadProducto = (index: number, cantidad: string) => {
    const nuevosProductos = [...productosAgregados];
    nuevosProductos[index].cantidad_utilizada = cantidad;
    setProductosAgregados(nuevosProductos);
  };

  // Pre-existente y sin uso desde la UI — se conserva tal cual (ver nota en agregarProducto).
  const actualizarUnidadProducto = (index: number, unidad: 'cc' | 'L') => {
    const nuevosProductos = [...productosAgregados];
    nuevosProductos[index].unidad_producto = unidad;
    setProductosAgregados(nuevosProductos);
  };

  /**
   * Valida el formulario y llena `erroresCampo` por campo (para `FieldError` puntual)
   * en vez de un único string global. El banner global (`error`) queda reservado para
   * fallas de envío no asociadas a un campo — típicamente de red (ver M8 del diseño).
   */
  const validarFormulario = (): boolean => {
    const errores: ErroresCampo = {};

    if (!fechaMovimiento) {
      errores.fecha = 'La fecha es requerida';
    }
    if (!loteId) {
      errores.lote = 'Debes seleccionar un lote';
    }

    if (aplicacion.tipo_aplicacion === 'Fumigación' || aplicacion.tipo_aplicacion === 'Drench') {
      if (!numeroCanecas || parseFloat(numeroCanecas) <= 0) {
        errores.canecas = 'El número de canecas debe ser mayor a 0';
      }
    }

    if (aplicacion.tipo_aplicacion === 'Fertilización') {
      if (!numeroBultos || parseFloat(numeroBultos) <= 0) {
        errores.bultos = 'El número de bultos debe ser mayor a 0';
      }
    }

    if (!responsable.trim()) {
      errores.responsable = 'El responsable es requerido';
    }

    if (productosAgregados.length === 0) {
      errores.productos = 'Debes agregar al menos un producto';
    } else {
      const productoInvalido = productosAgregados.find(
        p => !p.cantidad_utilizada || parseFloat(p.cantidad_utilizada) <= 0
      );
      if (productoInvalido) {
        errores.productos = `El producto "${productoInvalido.producto_nombre}" necesita una cantidad válida`;
      }
    }

    setErroresCampo(errores);
    return Object.keys(errores).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validarFormulario()) {
      return;
    }
    setError(null);

    try {
      setLoading(true);

      // Obtener usuario actual
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Usuario no autenticado');

      // Encontrar información del lote
      const lote = lotes.find(l => l.lote_id === loteId);
      if (!lote) throw new Error('Lote no encontrado');

      // 1. Crear movimiento diario (padre)
      const nuevoMovimiento = {
        aplicacion_id: aplicacion.id,
        fecha_movimiento: fechaMovimiento,
        lote_id: loteId,
        lote_nombre: lote.nombre,
        numero_canecas: (aplicacion.tipo_aplicacion === 'Fumigación' || aplicacion.tipo_aplicacion === 'Drench') ? parseFloat(numeroCanecas) : undefined,
        numero_bultos: aplicacion.tipo_aplicacion === 'Fertilización' ? parseInt(numeroBultos, 10) : undefined,
        equipo_aplicacion: equipoAplicacion.trim() || undefined,
        personal: personal.trim() || undefined,
        hora_inicio: horaInicio || undefined,
        hora_fin: horaFin || undefined,
        responsable: responsable.trim(),
        condiciones_meteorologicas: condicionesMeteorologicas.trim() || undefined,
        notas: notas.trim() || undefined,
        created_by: user.id,
      };

      const { data: movimientoCreado, error: errorMovimiento } = await supabase
        .from('movimientos_diarios')
        .insert([nuevoMovimiento as any])
        .select()
        .single();

      if (errorMovimiento) throw errorMovimiento;
      if (!movimientoCreado) throw new Error('No se pudo crear el movimiento');

      // 2. Crear productos del movimiento (hijos)
      // 🚨 NORMALIZACIÓN DE UNIDADES USANDO EL ENUM unidad_medida:
      // - productos.unidad_medida viene como 'Litros', 'Kilos', 'Unidades' (ENUM)
      // - Se guarda en movimientos_diarios_productos.unidad como 'Litros' o 'Kilos'
      // - Fertilización: bultos → Kilos (usando presentacion_kg_l)
      // - Fumigación/Drench: cantidad directa en Litros o Kilos
      const productosParaInsertar: Omit<MovimientoDiarioProducto, 'id' | 'created_at'>[] = productosAgregados.map(p => {
        let cantidadFinal: number;
        let unidadFinal: UnidadMedida;

        if (aplicacion.tipo_aplicacion === 'Fertilización') {
          // Convertir bultos a Kilos
          if (!p.presentacion_kg_l) {
            throw new Error(`El producto ${p.producto_nombre} no tiene presentación en Kg/bulto configurada`);
          }
          cantidadFinal = parseFloat(p.cantidad_utilizada) * p.presentacion_kg_l;
          unidadFinal = 'Kilos';
        } else {
          // Fumigación/Drench: Ya viene en Litros o Kilos desde la BD
          cantidadFinal = parseFloat(p.cantidad_utilizada);
          unidadFinal = p.unidad_producto as UnidadMedida; // Cast seguro porque viene del ENUM
        }

        return {
          movimiento_diario_id: movimientoCreado.id,
          producto_id: p.producto_id,
          producto_nombre: p.producto_nombre,
          producto_categoria: p.producto_categoria,
          cantidad_utilizada: cantidadFinal,
          unidad: unidadFinal
        };
      });

      const { error: errorProductos } = await supabase
        .from('movimientos_diarios_productos')
        .insert(productosParaInsertar);

      if (errorProductos) {
        // Si falla, intentar eliminar el movimiento creado
        await supabase.from('movimientos_diarios').delete().eq('id', movimientoCreado.id);
        throw errorProductos;
      }

      // 3. Save worker tracking data (employees + contractors)
      if (selectedTrabajadores.length > 0) {
        const trabajadoresData = selectedTrabajadores
          .flatMap(trabajador => {
            const trabajadorId = trabajador.data.id ?? '';
            const fraccion = workMatrix[trabajadorId]?.[loteId] || '0.0';
            if (parseFloat(fraccion) === 0) return [];

            // Type-aware cost calculation
            let costoJornal: number;
            let valorJornal: number;

            if (trabajador.type === 'empleado') {
              const { totalCost } = calculateLaborCost({
                salary: trabajador.data.salario || 0,
                benefits: trabajador.data.prestaciones_sociales || 0,
                allowances: trabajador.data.auxilios_no_salariales || 0,
                weeklyHours: trabajador.data.horas_semanales || 48,
                fractionWorked: parseFloat(fraccion),
              });
              costoJornal = totalCost;
              valorJornal = trabajador.data.salario || 0;
            } else {
              // Contractor: simple flat rate
              const { totalCost } = calculateContractorCost(
                trabajador.data.tarifa_jornal || 0,
                parseFloat(fraccion)
              );
              costoJornal = totalCost;
              valorJornal = trabajador.data.tarifa_jornal || 0;
            }

            return [{
              movimiento_diario_id: movimientoCreado.id,
              empleado_id: trabajador.type === 'empleado' ? trabajador.data.id : null,
              contratista_id: trabajador.type === 'contratista' ? trabajador.data.id : null,
              lote_id: loteId,
              fraccion_jornal: fraccion as FraccionJornal,
              observaciones: observacionesMatrix[trabajadorId]?.[loteId] || null,
              valor_jornal_trabajador: valorJornal,
              costo_jornal: costoJornal,
            }];
          });

        if (trabajadoresData.length > 0) {
          const { error: errorTrabajadores } = await supabase
            .from('movimientos_diarios_trabajadores')
            .insert(trabajadoresData as any);

          if (errorTrabajadores) {
            // If worker save fails, delete the movement and products
            await supabase.from('movimientos_diarios').delete().eq('id', movimientoCreado.id);
            throw errorTrabajadores;
          }
        }
      }

      // Limpiar formulario
      setFechaMovimiento(obtenerFechaHoy());
      setLoteId('');
      setNumeroCanecas('');
      setNumeroBultos('');
      setEquipoAplicacion('');
      setPersonal('');
      setHoraInicio('07:20');
      setHoraFin('15:50');
      setCondicionesMeteorologicas('');
      setNotas('');
      setProductosAgregados([]);
      setSelectedTrabajadores([]);
      setWorkMatrix({});
      setObservacionesMatrix({});
      setErroresCampo({});
      setVistaPersonal(false);
      setSearchTermPersonal('');

      draft.clearDraft();
      onSuccess();

    } catch (err: any) {
      setError(err.message || 'Error al guardar el movimiento');
    } finally {
      setLoading(false);
    }
  };

  // Universo de personas elegibles como Responsable: mismos empleados +
  // contratistas activos que el selector de cuadrilla (cargados por
  // `cargarTrabajadores`), aplanado para el Command/Popover. El filtrado por
  // texto lo hace `cmdk` internamente sobre `CommandItem.value`.
  const personasResponsable = useMemo<PersonaResponsable[]>(() => [
    ...empleadosDisponibles.map(e => ({
      id: e.id ?? '', nombre: e.nombre, tipo: 'empleado' as const, subtitulo: e.cargo,
    })),
    ...contratistasDisponibles.map(c => ({
      id: c.id ?? '', nombre: c.nombre, tipo: 'contratista' as const, subtitulo: c.tipo_contrato,
    })),
  ], [empleadosDisponibles, contratistasDisponibles]);

  // ---------------------------------------------------------------------------------
  // Selección de personal — filtrado, selección y helpers puramente presentacionales.
  // ---------------------------------------------------------------------------------

  const empleadosFiltrados = useMemo(() => {
    if (!searchTermPersonal) return empleadosDisponibles;
    const term = searchTermPersonal.toLowerCase();
    return empleadosDisponibles.filter(
      e => e.nombre.toLowerCase().includes(term) || (e.cargo ?? '').toLowerCase().includes(term)
    );
  }, [empleadosDisponibles, searchTermPersonal]);

  const contratistasFiltrados = useMemo(() => {
    if (!searchTermPersonal) return contratistasDisponibles;
    const term = searchTermPersonal.toLowerCase();
    return contratistasDisponibles.filter(
      c => c.nombre.toLowerCase().includes(term) || (c.tipo_contrato ?? '').toLowerCase().includes(term)
    );
  }, [contratistasDisponibles, searchTermPersonal]);

  const estaSeleccionado = useCallback(
    (id: string | undefined, tipo: 'empleado' | 'contratista') => {
      if (!id) return false;
      return selectedTrabajadores.some(t => t.type === tipo && t.data.id === id);
    },
    [selectedTrabajadores]
  );

  const alternarTrabajador = useCallback(
    (id: string, tipo: 'empleado' | 'contratista', data: Empleado | Contratista) => {
      setSelectedTrabajadores(prev => {
        const yaEsta = prev.some(t => t.type === tipo && t.data.id === id);
        if (yaEsta) {
          return prev.filter(t => !(t.type === tipo && t.data.id === id));
        }
        return [...prev, { type: tipo, data } as Trabajador];
      });
    },
    []
  );

  const alternarSeleccionarTodos = useCallback(() => {
    const lista = workerTab === 'empleados' ? empleadosFiltrados : contratistasFiltrados;
    const tipo = workerTab === 'empleados' ? 'empleado' : 'contratista';
    const todosSeleccionados = lista.length > 0 && lista.every(w => estaSeleccionado(w.id, tipo));

    if (todosSeleccionados) {
      setSelectedTrabajadores(prev =>
        prev.filter(t => t.type !== tipo || !lista.some(w => w.id === t.data.id))
      );
    } else {
      setSelectedTrabajadores(prev => {
        const existentes = new Set(prev.filter(t => t.type === tipo).map(t => t.data.id));
        const nuevos = lista
          .filter(w => !existentes.has(w.id))
          .map(w => ({ type: tipo, data: w } as Trabajador));
        return [...prev, ...nuevos];
      });
    }
  }, [workerTab, empleadosFiltrados, contratistasFiltrados, estaSeleccionado]);

  // ---------------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------------

  const totalDisponibles = empleadosDisponibles.length + contratistasDisponibles.length;

  const tituloHeader = vistaPersonal ? 'Selección de Personal' : 'Nuevo Movimiento';
  const subtituloHeader = vistaPersonal
    ? `${selectedTrabajadores.length} de ${totalDisponibles} seleccionados`
    : aplicacion.nombre_aplicacion || 'Movimiento diario';

  function renderListaTrabajadores(lista: (Empleado | Contratista)[], tipo: 'empleado' | 'contratista') {
    const todosSeleccionados = lista.length > 0 && lista.every(w => estaSeleccionado(w.id, tipo));
    return (
      <div>
        <div className="mb-2 flex items-center justify-between">
          <span className="text-xs text-muted-foreground">{lista.length} activos</span>
          {lista.length > 0 && (
            <button
              type="button"
              onClick={alternarSeleccionarTodos}
              className="text-xs font-semibold text-primary hover:underline"
            >
              {todosSeleccionados ? 'Deseleccionar todos' : 'Seleccionar todos'}
            </button>
          )}
        </div>

        {lista.length === 0 ? (
          <Empty className="border-none py-8">
            <EmptyMedia variant="icon">
              <Search />
            </EmptyMedia>
            <EmptyTitle>Sin resultados</EmptyTitle>
            <EmptyDescription>
              {searchTermPersonal
                ? `No hay coincidencias para "${searchTermPersonal}"`
                : `No hay ${tipo === 'empleado' ? 'empleados' : 'contratistas'} disponibles`}
            </EmptyDescription>
          </Empty>
        ) : (
          <ItemGroup className="max-h-[300px] overflow-y-auto pr-1">
            {lista.map(w => {
              const seleccionado = estaSeleccionado(w.id, tipo);
              const cargoOCargoContrato = tipo === 'empleado' ? (w as Empleado).cargo : (w as Contratista).tipo_contrato;
              return (
                <Item
                  key={w.id}
                  asChild
                  variant={seleccionado ? 'outline' : 'default'}
                  className={cn(
                    'cursor-pointer',
                    seleccionado ? 'border-primary/30 bg-primary/5' : 'hover:bg-muted/70'
                  )}
                >
                  <label>
                    <ItemMedia
                      variant="icon"
                      className={cn('text-[0.7rem] font-bold', seleccionado && 'border-primary bg-primary text-primary-foreground')}
                    >
                      {iniciales(w.nombre)}
                    </ItemMedia>
                    <ItemContent>
                      <ItemTitle>{w.nombre}</ItemTitle>
                      {cargoOCargoContrato && (
                        <ItemDescription className="line-clamp-none">{cargoOCargoContrato}</ItemDescription>
                      )}
                    </ItemContent>
                    <input
                      type="checkbox"
                      checked={seleccionado}
                      onChange={() => alternarTrabajador(w.id ?? '', tipo, w)}
                      disabled={loading}
                      aria-label={`Seleccionar a ${w.nombre}`}
                      className="size-5 shrink-0 accent-primary disabled:opacity-50"
                    />
                  </label>
                </Item>
              );
            })}
          </ItemGroup>
        )}
      </div>
    );
  }

  function renderTiraSeleccionados(soloResumen: boolean) {
    if (selectedTrabajadores.length === 0) return null;
    const visibles = soloResumen ? selectedTrabajadores.slice(0, 5) : selectedTrabajadores;
    const restantes = soloResumen ? selectedTrabajadores.length - visibles.length : 0;
    return (
      <TooltipProvider>
        {visibles.map(t => (
          <Tooltip key={trabajadorKey(t)}>
            <TooltipTrigger asChild>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card py-0.5 pl-0.5 pr-2 text-xs font-medium text-foreground">
                <span className="flex size-[22px] shrink-0 items-center justify-center rounded-full bg-primary text-[0.6rem] font-bold text-primary-foreground">
                  {iniciales(t.data.nombre)}
                </span>
                {nombreCorto(t.data.nombre)}
              </span>
            </TooltipTrigger>
            <TooltipContent>{t.data.nombre}</TooltipContent>
          </Tooltip>
        ))}
        {restantes > 0 && <span className="text-xs text-muted-foreground">+{restantes}</span>}
      </TooltipProvider>
    );
  }

  function renderSelectorPersonal() {
    return (
      <div className="p-4">
        {selectedTrabajadores.length > 0 && (
          <div className="mb-3 flex flex-wrap items-center gap-2 rounded-xl bg-muted p-3">
            <span className="text-xs font-semibold text-muted-foreground">Seleccionados</span>
            {renderTiraSeleccionados(false)}
          </div>
        )}

        <div className="relative mb-3">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="text"
            placeholder="Buscar por nombre…"
            value={searchTermPersonal}
            onChange={(e) => setSearchTermPersonal(e.target.value)}
            className="pl-9"
          />
        </div>

        <Tabs value={workerTab} onValueChange={(v) => setWorkerTab(v as 'empleados' | 'contratistas')}>
          <TabsList className="w-full">
            <TabsTrigger value="empleados" className="flex-1 gap-1.5">
              Empleados
              <Badge variant="outline" className="border-border bg-card">{empleadosDisponibles.length}</Badge>
            </TabsTrigger>
            <TabsTrigger value="contratistas" className="flex-1 gap-1.5">
              Contratistas
              <Badge variant="outline" className="border-border bg-card">{contratistasDisponibles.length}</Badge>
            </TabsTrigger>
          </TabsList>
          <TabsContent value="empleados">{renderListaTrabajadores(empleadosFiltrados, 'empleado')}</TabsContent>
          <TabsContent value="contratistas">{renderListaTrabajadores(contratistasFiltrados, 'contratista')}</TabsContent>
        </Tabs>
      </div>
    );
  }

  function renderCamposPrincipales() {
    return (
      <div className="pb-2">
        <FormDraftBanner
          variant="available"
          show={draft.hasDraft}
          onRestore={handleRestoreDraft}
          onDiscard={draft.discardDraft}
        />

        {error && (
          esErrorDeRed(error) ? (
            <Alert variant="warning" className="mx-4 mb-4 mt-4">
              <AlertTriangle />
              <AlertTitle>No se pudo guardar — sin conexión.</AlertTitle>
              <AlertDescription>
                Tu información quedó en este dispositivo. Vuelve a intentar cuando tengas señal; nada se perdió.
              </AlertDescription>
            </Alert>
          ) : (
            <Alert variant="destructive" className="mx-4 mb-4 mt-4">
              <AlertCircle />
              <AlertTitle>No se pudo guardar</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )
        )}

        {/* Fecha y lote */}
        <div className="px-4 pt-4">
          <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-foreground">
            <CalendarIcon className="size-4 text-primary" /> Fecha y lote
          </div>

          <Field>
            <FieldLabel>
              Fecha del Movimiento <span className="text-destructive">*</span>
            </FieldLabel>
            <DateInput value={fechaMovimiento} onChange={setFechaMovimiento} max={obtenerFechaHoy()} disabled={loading} />
            <FieldDescription>Hoy en hora local — no permite fechas futuras</FieldDescription>
            <FieldError>{erroresCampo.fecha}</FieldError>
          </Field>

          <Field className="mt-4">
            <FieldLabel>
              Lote Aplicado <span className="text-destructive">*</span>
            </FieldLabel>
            <Select value={loteId} onValueChange={setLoteId} disabled={loading}>
              <SelectTrigger className="w-full" aria-invalid={!!erroresCampo.lote}>
                <SelectValue placeholder="Selecciona un lote" />
              </SelectTrigger>
              <SelectContent>
                {lotes.map(lote => (
                  <SelectItem key={lote.lote_id} value={lote.lote_id}>
                    {lote.nombre}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <FieldError>{erroresCampo.lote}</FieldError>
          </Field>

          <Field className="mt-4">
            <FieldLabel>Equipo de Aplicación</FieldLabel>
            <Select value={equipoAplicacion} onValueChange={setEquipoAplicacion} disabled={loading}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Selecciona el equipo (opcional)" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Bomba espalda">🎒 Bomba espalda</SelectItem>
                <SelectItem value="Bomba estacionaria">⚙️ Bomba estacionaria</SelectItem>
                <SelectItem value="Fumiducto">🚜 Fumiducto</SelectItem>
              </SelectContent>
            </Select>
          </Field>
        </div>

        {/* Selección de Personal */}
        <div className="border-t border-border/60 px-4 pt-4">
          <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-foreground">
            <User className="size-4 text-primary" /> Selección de Personal
          </div>
          <button
            type="button"
            onClick={() => setVistaPersonal(true)}
            disabled={loading}
            className="flex w-full items-center gap-3 rounded-xl border border-border bg-muted/50 p-3 text-left transition-colors hover:bg-muted disabled:opacity-50"
          >
            {selectedTrabajadores.length === 0 ? (
              <span className="text-sm text-muted-foreground">Seleccionar personal (opcional)</span>
            ) : (
              <div className="flex flex-1 flex-wrap items-center gap-2">
                <span className="text-xs font-semibold text-muted-foreground">
                  {selectedTrabajadores.length} seleccionado{selectedTrabajadores.length === 1 ? '' : 's'}
                </span>
                {renderTiraSeleccionados(true)}
              </div>
            )}
            <ChevronRight className="ml-auto size-4 shrink-0 text-muted-foreground" />
          </button>

          {selectedTrabajadores.length > 0 && loteId && (
            <div className="mt-4">
              <JornalFractionMatrix
                trabajadores={selectedTrabajadores}
                lotes={lotes.filter(l => l.lote_id === loteId).map(l => ({
                  id: l.lote_id,
                  nombre: l.nombre,
                  area_hectareas: l.area_hectareas
                }))}
                workMatrix={workMatrix}
                observaciones={observacionesMatrix}
                onFraccionChange={(trabajadorId, loteIdMatriz, frac) => {
                  setWorkMatrix(prev => ({
                    ...prev,
                    [trabajadorId]: { ...prev[trabajadorId], [loteIdMatriz]: frac }
                  }));
                }}
                onObservacionesChange={(trabajadorId, loteIdMatriz, obs) => {
                  setObservacionesMatrix(prev => ({
                    ...prev,
                    [trabajadorId]: { ...prev[trabajadorId], [loteIdMatriz]: obs }
                  }));
                }}
                onRemoveTrabajador={(trabajadorId) => {
                  setSelectedTrabajadores(prev =>
                    prev.filter(t => t.data.id !== trabajadorId)
                  );
                }}
                disabled={loading}
                showCostPreview={true}
              />
            </div>
          )}
        </div>

        {/* Horario */}
        <div className="border-t border-border/60 px-4 pt-4">
          <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-foreground">
            <Clock className="size-4 text-primary" /> Horario
          </div>
          <div className="flex gap-3">
            <Field className="flex-1">
              <FieldLabel>Hora Inicio</FieldLabel>
              <Input type="time" value={horaInicio} onChange={(e) => setHoraInicio(e.target.value)} disabled={loading} />
            </Field>
            <Field className="flex-1">
              <FieldLabel>Hora Fin</FieldLabel>
              <Input type="time" value={horaFin} onChange={(e) => setHoraFin(e.target.value)} disabled={loading} />
            </Field>
          </div>
        </div>

        {/* Número de Canecas - PARA FUMIGACIÓN Y DRENCH */}
        {(aplicacion.tipo_aplicacion === 'Fumigación' || aplicacion.tipo_aplicacion === 'Drench') && (
          <div className="border-t border-border/60 px-4 pt-4">
            <Field>
              <FieldLabel>
                Número TOTAL de Canecas Aplicadas <span className="text-destructive">*</span>
              </FieldLabel>
              <InputGroup>
                <InputGroupInput
                  type="number"
                  step="any"
                  min="0"
                  value={numeroCanecas}
                  onChange={(e) => setNumeroCanecas(e.target.value)}
                  placeholder="0"
                  disabled={loading}
                  aria-invalid={!!erroresCampo.canecas}
                />
                <InputGroupAddon align="inline-end">canecas</InputGroupAddon>
              </InputGroup>
              <FieldError>{erroresCampo.canecas}</FieldError>
              {loteId && canecasPorLote[loteId] ? (
                <FieldDescription className="rounded-md border border-primary/20 bg-primary/5 px-3 py-2 text-xs text-muted-foreground">
                  Planeado: {formatearNumero(canecasPorLote[loteId], 1)} canecas para este lote
                </FieldDescription>
              ) : null}
            </Field>
          </div>
        )}

        {/* Número de Bultos - SOLO PARA FERTILIZACIÓN */}
        {aplicacion.tipo_aplicacion === 'Fertilización' && (
          <div className="border-t border-border/60 px-4 pt-4">
            <Field>
              <FieldLabel>
                Número TOTAL de Bultos Usados <span className="text-destructive">*</span>
              </FieldLabel>
              <InputGroup>
                <InputGroupInput
                  type="number"
                  step="1"
                  min="0"
                  value={numeroBultos}
                  onChange={(e) => setNumeroBultos(e.target.value)}
                  placeholder="0"
                  disabled={loading}
                  aria-invalid={!!erroresCampo.bultos}
                />
                <InputGroupAddon align="inline-end">bultos</InputGroupAddon>
              </InputGroup>
              <FieldError>{erroresCampo.bultos}</FieldError>
              {loteId && bultosPorLote[loteId] ? (
                <FieldDescription className="rounded-md border border-primary/20 bg-primary/5 px-3 py-2 text-xs text-muted-foreground">
                  Planeado: {formatearNumero(bultosPorLote[loteId], 0)} bultos para este lote
                </FieldDescription>
              ) : null}
            </Field>
          </div>
        )}

        {/* Productos Utilizados */}
        <div className="border-t border-border/60 px-4 pt-4">
          <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-foreground">
            <Package className="size-4 text-primary" />
            {aplicacion.tipo_aplicacion === 'Fertilización'
              ? 'Bultos Usados de cada Producto'
              : 'Cantidad aplicada de cada producto'}
            <span className="text-destructive">*</span>
          </div>

          {erroresCampo.productos && (
            <p role="alert" className="mb-3 flex items-center gap-1.5 text-sm font-medium text-destructive">
              <AlertCircle className="size-3.5 shrink-0" /> {erroresCampo.productos}
            </p>
          )}

          {productosAgregados.length > 0 ? (
            <div className="flex flex-col gap-3">
              {productosAgregados.map((producto, index) => (
                <Field key={index}>
                  <FieldLabel>{producto.producto_nombre}</FieldLabel>
                  <div className="flex items-center gap-2">
                    <InputGroup className="flex-1">
                      <InputGroupInput
                        type="number"
                        step="0.01"
                        min="0"
                        value={producto.cantidad_utilizada}
                        onChange={(e) => actualizarCantidadProducto(index, e.target.value)}
                        placeholder="0"
                        disabled={loading}
                      />
                      <InputGroupAddon align="inline-end">
                        {aplicacion.tipo_aplicacion === 'Fertilización' ? 'bultos' : producto.unidad_producto}
                      </InputGroupAddon>
                    </InputGroup>
                    <button
                      type="button"
                      onClick={() => eliminarProducto(index)}
                      disabled={loading}
                      aria-label={`Eliminar ${producto.producto_nombre}`}
                      className="rounded-lg p-2.5 text-destructive transition-colors hover:bg-destructive/10 disabled:opacity-50"
                    >
                      <Trash2 className="size-4" />
                    </button>
                  </div>
                  <FieldDescription>{producto.producto_categoria}</FieldDescription>
                </Field>
              ))}
            </div>
          ) : cargandoProductos ? (
            <div className="flex flex-col items-center gap-3 rounded-xl border-2 border-dashed border-border py-8 text-center">
              <Spinner className="size-6 text-primary" />
              <p className="text-sm text-muted-foreground">Cargando productos...</p>
            </div>
          ) : (
            <div className="rounded-xl border-2 border-dashed border-destructive/30 bg-destructive/5 px-4 py-8 text-center">
              <AlertTriangle className="mx-auto mb-3 size-10 text-destructive/60" />
              <p className="text-sm text-destructive">
                {errorProductos
                  ? errorProductos
                  : loteId
                    ? 'La mezcla asignada a este lote no tiene productos configurados.'
                    : 'Esta aplicación no tiene productos configurados en su mezcla.'}
              </p>
              <p className="mt-2 text-xs text-destructive/70">
                Revisa la mezcla de la aplicación en la Calculadora antes de registrar el movimiento.
              </p>
            </div>
          )}
        </div>

        {/* Responsable — picker sobre empleados/contratistas activos (mismo universo
            que la cuadrilla): ya no es texto libre, ver CLAUDE.md del módulo. */}
        <div className="border-t border-border/60 px-4 pt-4">
          <Field>
            <FieldLabel>
              Responsable <span className="text-destructive">*</span>
            </FieldLabel>
            <Popover open={responsablePopoverOpen} onOpenChange={setResponsablePopoverOpen}>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  disabled={loading}
                  aria-invalid={!!erroresCampo.responsable}
                  className="flex w-full items-center gap-2 rounded-md border border-input px-3 py-2.5 text-left text-sm transition-colors hover:border-ring disabled:opacity-50 aria-invalid:border-destructive"
                >
                  <Search className="size-4 flex-shrink-0 text-muted-foreground" />
                  <span className={cn('flex-1 truncate', !responsable && 'text-muted-foreground')}>
                    {responsable || 'Buscar responsable…'}
                  </span>
                </button>
              </PopoverTrigger>
              <PopoverContent align="start" className="p-0" style={{ width: 'var(--radix-popover-trigger-width)' }}>
                <Command>
                  <CommandInput placeholder="Buscar por nombre…" />
                  <CommandList>
                    <CommandEmpty>
                      {personasResponsable.length === 0
                        ? 'No hay empleados ni contratistas activos.'
                        : 'Sin resultados.'}
                    </CommandEmpty>
                    <CommandGroup>
                      {personasResponsable.map(p => (
                        <CommandItem
                          key={`${p.tipo}-${p.id}`}
                          value={p.nombre}
                          onSelect={() => {
                            setResponsable(p.nombre);
                            setResponsablePopoverOpen(false);
                          }}
                        >
                          <span className="min-w-0 flex-1 truncate">{p.nombre}</span>
                          <span className="flex-shrink-0 text-xs capitalize text-muted-foreground">
                            {p.subtitulo || (p.tipo === 'empleado' ? 'Empleado' : 'Contratista')}
                          </span>
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
            <FieldError>{erroresCampo.responsable}</FieldError>
          </Field>
        </div>

        {/* Condiciones Meteorológicas */}
        <div className="px-4 pt-4">
          <Field>
            <FieldLabel>
              <Cloud className="size-4 text-primary" /> Condiciones Meteorológicas
            </FieldLabel>
            <Select value={condicionesMeteorologicas} onValueChange={setCondicionesMeteorologicas} disabled={loading}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Selecciona las condiciones (opcional)" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="soleadas">☀️ Soleadas</SelectItem>
                <SelectItem value="nubladas">☁️ Nubladas</SelectItem>
                <SelectItem value="lluvia suave">🌦️ Lluvia Suave</SelectItem>
                <SelectItem value="lluvia fuerte">⛈️ Lluvia Fuerte</SelectItem>
              </SelectContent>
            </Select>
          </Field>
        </div>

        {/* Notas */}
        <div className="px-4 pt-4">
          <Field>
            <FieldLabel>
              <FileText className="size-4 text-primary" /> Notas (Opcional)
            </FieldLabel>
            <Textarea
              value={notas}
              onChange={(e) => setNotas(e.target.value)}
              placeholder="Observaciones adicionales..."
              rows={3}
              disabled={loading}
            />
          </Field>
        </div>

        {/* Info de movimiento provisional */}
        <div className="px-4 pb-4 pt-4">
          <p className="flex items-start gap-2 rounded-xl border border-primary/20 bg-primary/5 p-3 text-xs text-muted-foreground">
            <span className="mt-0.5 text-primary">ℹ️</span>
            <span>
              Este es un movimiento <strong>provisional</strong> que no afecta el inventario inmediatamente.
              {aplicacion.tipo_aplicacion === 'Fertilización'
                ? ' Se registran los bultos totales usados y los bultos de cada producto. Al cerrar la aplicación, se convertirán a Kg según la presentación de cada producto.'
                : ' Se registran las canecas totales aplicadas y las canecas de cada producto. Al cerrar la aplicación, se convertirán a litros.'}
            </span>
          </p>
        </div>
      </div>
    );
  }

  const pieVistaPersonal = (
    <Button type="button" className="w-full" onClick={() => setVistaPersonal(false)}>
      Confirmar personal ({selectedTrabajadores.length})
    </Button>
  );

  const pieCamposPrincipales = (
    <>
      <Button type="button" variant="outline" className="flex-1" onClick={() => onOpenChange(false)} disabled={loading}>
        Cancelar
      </Button>
      <Button type="submit" className="flex-1" disabled={loading}>
        {loading ? (
          <>
            <Spinner className="size-4" /> Guardando…
          </>
        ) : (
          <>
            <Save className="size-4" /> Registrar Movimiento
          </>
        )}
      </Button>
    </>
  );

  const cuerpo = vistaPersonal ? renderSelectorPersonal() : renderCamposPrincipales();

  return (
    <>
      {/* Escritorio: Sheet lateral, más ancho que el sm:max-w-sm por defecto — la
          matriz de jornal×lote sería inutilizable a 384px (ver §6 del diseño). */}
      <Sheet open={open && !isMobile} onOpenChange={onOpenChange}>
        <SheetContent className="flex w-full flex-col gap-0 p-0 sm:max-w-[480px]">
          <SheetHeader className="border-b border-border px-5 py-4">
            <SheetTitle>{tituloHeader}</SheetTitle>
            <SheetDescription>{subtituloHeader}</SheetDescription>
          </SheetHeader>
          {vistaPersonal && (
            <div className="px-5 pt-3">
              <Button type="button" variant="ghost" size="sm" onClick={() => setVistaPersonal(false)} className="gap-1.5 px-2 text-muted-foreground">
                <ArrowLeft className="size-4" /> Volver
              </Button>
            </div>
          )}
          <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
            <div className="flex-1 overflow-y-auto">{cuerpo}</div>
            <SheetFooter className="flex-row gap-3 border-t border-border px-5 py-4">
              {vistaPersonal ? pieVistaPersonal : pieCamposPrincipales}
            </SheetFooter>
          </form>
        </SheetContent>
      </Sheet>

      {/* Móvil: Drawer de PANTALLA COMPLETA — h-[100dvh], no el max-h-[80vh] parcial
          por defecto de vaul (ver §6 del diseño: 14 campos + matriz no caben en 80vh). */}
      <Drawer open={open && isMobile} onOpenChange={onOpenChange} direction="bottom">
        <DrawerContent
          className={cn(
            'h-[100dvh] max-h-[100dvh]',
            // Mismo selector con `data-[vaul-drawer-direction=bottom]:` que usa el primitivo
            // (drawer.tsx) para estas 4 propiedades: como esa variante agrega un selector de
            // atributo, tiene más especificidad que la clase plana equivalente y le ganaría a
            // un simple `rounded-t-none`/`border-t-0` sin el mismo prefijo.
            'data-[vaul-drawer-direction=bottom]:mt-0',
            'data-[vaul-drawer-direction=bottom]:max-h-[100dvh]',
            'data-[vaul-drawer-direction=bottom]:rounded-t-none',
            'data-[vaul-drawer-direction=bottom]:border-t-0'
          )}
        >
          <div className="flex h-full min-h-0 flex-col">
            <div className="flex items-center gap-3 border-b border-border px-4 py-3">
              <button
                type="button"
                onClick={() => (vistaPersonal ? setVistaPersonal(false) : onOpenChange(false))}
                aria-label={vistaPersonal ? 'Volver' : 'Cerrar sin guardar'}
                className="shrink-0 rounded-lg p-2 text-foreground hover:bg-muted"
              >
                <ArrowLeft className="size-5" />
              </button>
              <div className="min-w-0 flex-1">
                <DrawerTitle className="text-[0.95rem] font-semibold">{tituloHeader}</DrawerTitle>
                <DrawerDescription className="truncate text-xs">{subtituloHeader}</DrawerDescription>
              </div>
            </div>
            <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
              <div className="flex-1 overflow-y-auto">{cuerpo}</div>
              <div className="flex gap-3 border-t border-border p-4">
                {vistaPersonal ? pieVistaPersonal : pieCamposPrincipales}
              </div>
            </form>
          </div>
        </DrawerContent>
      </Drawer>
    </>
  );
}
