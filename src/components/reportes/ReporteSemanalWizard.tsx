import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Settings,
  BarChart3,
  MessageSquarePlus,
  FileText,
  ArrowLeft,
  ArrowRight,
  Plus,
  Trash2,
  Upload,
  Image,
  Type,
  Loader2,
  Download,
  RefreshCw,
  ChevronUp,
  ChevronDown,
  Calendar,
  Users,
  AlertTriangle,
  CheckSquare,
  Square,
  X,
} from 'lucide-react';
import { Button } from '../ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Badge } from '../ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../ui/table';
import { toast } from 'sonner';
import {
  calcularSemanaAnterior,
  calcularSemanaDesdeLunes,
  fetchDatosReporteSemanal,
  fetchListaAplicacionesCerradas,
} from '../../utils/fetchDatosReporteSemanal';
import {
  generarReporteCompleto,
  descargarBlob,
} from '../../utils/reporteSemanalService';
import type {
  RangoSemana,
  DatosReporteSemanal,
  BloqueAdicional,
  BloqueTexto,
  BloqueImagenConTexto,
  DetalleFallaPermiso,
} from '../../types/reporteSemanal';
import { formatearFechaCorta } from '../../utils/fechas';
import { formatNumber } from '../../utils/format';

// ============================================================================
// CONFIGURACIÓN DE PASOS
// ============================================================================

const PASOS = [
  { numero: 1, titulo: 'Configuración', descripcion: 'Semana y personal', icono: Settings },
  { numero: 2, titulo: 'Aplicaciones', descripcion: 'Cierres a incluir', icono: CheckSquare },
  { numero: 3, titulo: 'Datos Operativos', descripcion: 'Jornales, aplicaciones, monitoreo', icono: BarChart3 },
  { numero: 4, titulo: 'Temas Adicionales', descripcion: 'Notas e imágenes', icono: MessageSquarePlus },
  { numero: 5, titulo: 'Generar Reporte', descripcion: 'Vista previa y PDF', icono: FileText },
];

// ============================================================================
// HELPERS
// ============================================================================

function formatFecha(iso: string): string {
  if (!iso) return '—';
  try { return new Date(iso + 'T00:00:00').toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' }); }
  catch { return iso; }
}

// ============================================================================
// COMPONENTE PRINCIPAL
// ============================================================================

export function ReporteSemanalWizard() {
  const navigate = useNavigate();

  // Wizard state
  const [pasoActual, setPasoActual] = useState(1);
  const [loading, setLoading] = useState(false);
  const [generando, setGenerando] = useState(false);
  const [progresoMensaje, setProgresoMensaje] = useState('');

  // Paso 1: Configuración
  const [semana, setSemana] = useState<RangoSemana>(calcularSemanaAnterior);
  const [fallas, setFallas] = useState(0);
  const [permisos, setPermisos] = useState(0);
  const [ingresos, setIngresos] = useState(0);
  const [retiros, setRetiros] = useState(0);
  const [detalleFallas, setDetalleFallas] = useState<DetalleFallaPermiso[]>([]);
  const [detallePermisos, setDetallePermisos] = useState<DetalleFallaPermiso[]>([]);

  // Paso 2: Selección de aplicaciones cerradas
  const [listaAplicacionesCerradas, setListaAplicacionesCerradas] = useState<
    { id: string; nombre: string; tipo: string; fechaCierre: string }[]
  >([]);
  const [loadingCierres, setLoadingCierres] = useState(false);
  const [cerradasSeleccionadas, setCerradasSeleccionadas] = useState<string[]>([]);

  // Paso 3: Auto-loaded data
  const [datosReporte, setDatosReporte] = useState<DatosReporteSemanal | null>(null);
  const [errorDatos, setErrorDatos] = useState('');

  // Paso 4: Additional topics
  const [temasAdicionales, setTemasAdicionales] = useState<BloqueAdicional[]>([]);

  // Paso 5: Result
  const [htmlGenerado, setHtmlGenerado] = useState('');
  const [pdfBlob, setPdfBlob] = useState<Blob | null>(null);
  const [errorGeneracion, setErrorGeneracion] = useState('');

  // Load closed applications list when entering paso 2
  useEffect(() => {
    if (pasoActual === 2 && listaAplicacionesCerradas.length === 0 && !loadingCierres) {
      setLoadingCierres(true);
      fetchListaAplicacionesCerradas()
        .then(list => setListaAplicacionesCerradas(list))
        .catch(() => toast.error('No se pudo cargar la lista de aplicaciones cerradas'))
        .finally(() => setLoadingCierres(false));
    }
  }, [pasoActual]);

  // ============================================================================
  // NAVIGATION
  // ============================================================================

  const handleSiguiente = async () => {
    if (pasoActual === 2) {
      // When advancing from paso 2 to 3, load the data
      await cargarDatos();
    }
    if (pasoActual < 5) {
      setPasoActual(pasoActual + 1);
    }
  };

  const handleAnterior = () => {
    if (pasoActual > 1) {
      setPasoActual(pasoActual - 1);
    }
  };

  // ============================================================================
  // DATA LOADING (Paso 2 → Paso 3)
  // ============================================================================

  const cargarDatos = async () => {
    setLoading(true);
    setErrorDatos('');
    try {
      const datos = await fetchDatosReporteSemanal({
        semana,
        fallas,
        permisos,
        ingresos,
        retiros,
        detalleFallas,
        detallePermisos,
        cerradasIds: cerradasSeleccionadas,
        temasAdicionales,
      });
      setDatosReporte(datos);
    } catch (error: any) {
      setErrorDatos(error.message || 'Error al cargar datos');
      toast.error('Error al cargar datos del reporte');
    } finally {
      setLoading(false);
    }
  };

  // ============================================================================
  // REPORT GENERATION (Paso 5)
  // ============================================================================

  const handleGenerar = async () => {
    if (!datosReporte) return;

    setGenerando(true);
    setHtmlGenerado('');
    setPdfBlob(null);
    setErrorGeneracion('');

    try {
      const datosFinales: DatosReporteSemanal = {
        ...datosReporte,
        temasAdicionales,
      };

      const resultado = await generarReporteCompleto(
        datosFinales,
        undefined,
        (step) => setProgresoMensaje(step)
      );

      setHtmlGenerado(resultado.html);
      setPdfBlob(resultado.pdfBlob);
      if (resultado.metadata) {
        toast.success('Reporte generado y guardado');
      } else if (resultado.storageWarning) {
        toast.warning(resultado.storageWarning, { duration: 8000 });
      } else {
        toast.warning('Reporte generado pero no se pudo guardar en almacenamiento.', { duration: 8000 });
      }
    } catch (error: any) {
      console.error('[ReporteSemanal] Error en handleGenerar:', error);
      const errorMsg = error.message || 'Error desconocido al generar el reporte';
      setErrorGeneracion(errorMsg);
      toast.error(errorMsg, { duration: 10000 });
    } finally {
      setGenerando(false);
      setProgresoMensaje('');
    }
  };

  const handleDescargar = () => {
    if (!pdfBlob) {
      toast.error('No hay PDF disponible para descargar. Genere el reporte primero.');
      return;
    }

    if (pdfBlob.size === 0) {
      toast.error('El PDF generado está vacío. Por favor intente generar nuevamente.');
      return;
    }

    const filename = `reporte-slides-semana-${semana.ano}-S${String(semana.numero).padStart(2, '0')}.pdf`;
    descargarBlob(pdfBlob, filename);
    toast.success('PDF descargado');
  };

  // ============================================================================
  // WEEK SELECTOR (Paso 1)
  // ============================================================================

  const handleCambiarSemana = (offset: number) => {
    const fechaActual = new Date(semana.inicio + 'T00:00:00');
    fechaActual.setDate(fechaActual.getDate() + (offset * 7));
    const anio = fechaActual.getFullYear();
    const mes = String(fechaActual.getMonth() + 1).padStart(2, '0');
    const dia = String(fechaActual.getDate()).padStart(2, '0');
    setSemana(calcularSemanaDesdeLunes(`${anio}-${mes}-${dia}`));
  };

  // ============================================================================
  // DETALLE FALLAS / PERMISOS helpers
  // ============================================================================

  const syncDetalleFallas = (count: number) => {
    const arr = [...detalleFallas];
    while (arr.length < count) arr.push({ empleado: '', razon: '' });
    setDetalleFallas(arr.slice(0, count));
  };

  const syncDetallePermisos = (count: number) => {
    const arr = [...detallePermisos];
    while (arr.length < count) arr.push({ empleado: '', razon: '' });
    setDetallePermisos(arr.slice(0, count));
  };

  // ============================================================================
  // ADDITIONAL TOPICS (Paso 4)
  // ============================================================================

  const agregarBloqueTexto = () => {
    setTemasAdicionales([...temasAdicionales, { tipo: 'texto', titulo: '', contenido: '' }]);
  };

  const agregarBloqueImagen = () => {
    setTemasAdicionales([...temasAdicionales, {
      tipo: 'imagen_con_texto',
      titulo: '',
      imagenesBase64: [],
      descripcion: '',
    }]);
  };

  const actualizarBloque = (index: number, updates: Partial<BloqueTexto | BloqueImagenConTexto>) => {
    const nuevos = [...temasAdicionales];
    nuevos[index] = { ...nuevos[index], ...updates } as BloqueAdicional;
    setTemasAdicionales(nuevos);
  };

  const eliminarBloque = (index: number) => {
    setTemasAdicionales(temasAdicionales.filter((_, i) => i !== index));
  };

  const moverBloque = (index: number, direction: -1 | 1) => {
    const newIndex = index + direction;
    if (newIndex < 0 || newIndex >= temasAdicionales.length) return;
    const nuevos = [...temasAdicionales];
    [nuevos[index], nuevos[newIndex]] = [nuevos[newIndex], nuevos[index]];
    setTemasAdicionales(nuevos);
  };

  const handleImageUpload = (index: number, file: File, slot: number) => {
    if (file.size > 800 * 1024) {
      toast.error('La imagen debe ser menor a 800KB');
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      const bloque = temasAdicionales[index] as BloqueImagenConTexto;
      const imgs = [...(bloque.imagenesBase64 || [])];
      imgs[slot] = e.target?.result as string;
      actualizarBloque(index, { imagenesBase64: imgs });
    };
    reader.readAsDataURL(file);
  };

  const handleRemoveImage = (index: number, slot: number) => {
    const bloque = temasAdicionales[index] as BloqueImagenConTexto;
    const imgs = [...(bloque.imagenesBase64 || [])];
    imgs.splice(slot, 1);
    actualizarBloque(index, { imagenesBase64: imgs });
  };

  // ============================================================================
  // RENDER: STEP INDICATOR
  // ============================================================================

  const renderPasos = () => (
    <div className="flex items-center justify-between mb-8 bg-white rounded-2xl p-4 border border-gray-200 shadow-sm">
      {PASOS.map((paso, i) => {
        const Icon = paso.icono;
        const esActual = paso.numero === pasoActual;
        const esCompletado = paso.numero < pasoActual;
        return (
          <div key={paso.numero} className="flex items-center flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-shrink-0">
              <div className={`w-9 h-9 rounded-xl flex items-center justify-center transition-all ${
                esActual ? 'bg-primary text-white shadow-md' :
                esCompletado ? 'bg-secondary text-foreground' :
                'bg-gray-100 text-gray-400'
              }`}>
                <Icon className="w-4 h-4" />
              </div>
              <div className="hidden lg:block">
                <p className={`text-xs font-medium ${esActual ? 'text-foreground' : 'text-gray-500'}`}>
                  {paso.titulo}
                </p>
                <p className="text-xs text-gray-400">{paso.descripcion}</p>
              </div>
            </div>
            {i < PASOS.length - 1 && (
              <div className={`flex-1 h-0.5 mx-2 ${esCompletado ? 'bg-secondary' : 'bg-gray-200'}`} />
            )}
          </div>
        );
      })}
    </div>
  );

  // ============================================================================
  // RENDER: PASO 1 - CONFIGURACIÓN Y PERSONAL
  // ============================================================================

  const renderPaso1 = () => (
    <div className="space-y-6">
      {/* Selector de semana */}
      <Card className="rounded-xl">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-foreground text-lg">
            <Calendar className="w-5 h-5 text-primary" />
            Semana del Reporte
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-4">
            <Button variant="outline" size="sm" onClick={() => handleCambiarSemana(-1)}>
              <ArrowLeft className="w-4 h-4" />
            </Button>
            <div className="flex-1 text-center">
              <p className="text-2xl font-bold text-foreground">Semana {semana.numero}</p>
              <p className="text-sm text-gray-500">
                {formatearFechaCorta(semana.inicio)} — {formatearFechaCorta(semana.fin)}
              </p>
            </div>
            <Button variant="outline" size="sm" onClick={() => handleCambiarSemana(1)}>
              <ArrowRight className="w-4 h-4" />
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Personal */}
      <Card className="rounded-xl">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-foreground text-lg">
            <Users className="w-5 h-5 text-primary" />
            Personal
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-gray-500">
            El total de trabajadores y jornales se calcula automáticamente. Completa los datos manuales.
          </p>

          {/* Counters row */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { label: 'Fallas (ausencias)', value: fallas, setter: (v: number) => { setFallas(v); syncDetalleFallas(v); } },
              { label: 'Permisos otorgados', value: permisos, setter: (v: number) => { setPermisos(v); syncDetallePermisos(v); } },
              { label: 'Ingresos (nuevos)', value: ingresos, setter: setIngresos },
              { label: 'Retiros', value: retiros, setter: setRetiros },
            ].map(item => (
              <div key={item.label}>
                <label className="block text-sm font-medium text-brand-brown mb-1">{item.label}</label>
                <input
                  type="number" min="0" value={item.value}
                  onChange={(e) => item.setter(Math.max(0, parseInt(e.target.value) || 0))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary outline-none"
                />
              </div>
            ))}
          </div>

          {/* Detalle de fallas */}
          {fallas > 0 && (
            <div>
              <p className="text-sm font-medium text-brand-brown mb-2">Detalle de fallas (opcional)</p>
              <div className="space-y-2">
                {detalleFallas.map((f, i) => (
                  <div key={i} className="flex gap-2">
                    <input
                      type="text" placeholder="Nombre del trabajador"
                      value={f.empleado}
                      onChange={(e) => {
                        const arr = [...detalleFallas];
                        arr[i] = { ...arr[i], empleado: e.target.value };
                        setDetalleFallas(arr);
                      }}
                      className="flex-1 px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary outline-none"
                    />
                    <input
                      type="text" placeholder="Razón (opcional)"
                      value={f.razon || ''}
                      onChange={(e) => {
                        const arr = [...detalleFallas];
                        arr[i] = { ...arr[i], razon: e.target.value };
                        setDetalleFallas(arr);
                      }}
                      className="flex-1 px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary outline-none"
                    />
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Detalle de permisos */}
          {permisos > 0 && (
            <div>
              <p className="text-sm font-medium text-brand-brown mb-2">Detalle de permisos (opcional)</p>
              <div className="space-y-2">
                {detallePermisos.map((p, i) => (
                  <div key={i} className="flex gap-2">
                    <input
                      type="text" placeholder="Nombre del trabajador"
                      value={p.empleado}
                      onChange={(e) => {
                        const arr = [...detallePermisos];
                        arr[i] = { ...arr[i], empleado: e.target.value };
                        setDetallePermisos(arr);
                      }}
                      className="flex-1 px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary outline-none"
                    />
                    <input
                      type="text" placeholder="Razón (opcional)"
                      value={p.razon || ''}
                      onChange={(e) => {
                        const arr = [...detallePermisos];
                        arr[i] = { ...arr[i], razon: e.target.value };
                        setDetallePermisos(arr);
                      }}
                      className="flex-1 px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary outline-none"
                    />
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );

  // ============================================================================
  // RENDER: PASO 2 - SELECCIONAR APLICACIONES CERRADAS
  // ============================================================================

  const renderPaso2 = () => (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-foreground">
            <CheckSquare className="w-5 h-5 text-primary" />
            Aplicaciones Cerradas a Incluir
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-gray-500 mb-4">
            Selecciona las aplicaciones cerradas cuyo reporte de resultados quieres incluir en las diapositivas.
            Puedes omitir este paso si no deseas incluir cierres.
          </p>

          {loadingCierres ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-6 h-6 text-primary animate-spin mr-2" />
              <span className="text-gray-500 text-sm">Cargando aplicaciones...</span>
            </div>
          ) : listaAplicacionesCerradas.length === 0 ? (
            <div className="text-center py-8 text-gray-400">
              <CheckSquare className="w-10 h-10 mx-auto mb-2 opacity-40" />
              <p>No hay aplicaciones cerradas disponibles</p>
            </div>
          ) : (
            <div className="space-y-2">
              {listaAplicacionesCerradas.map(app => {
                const selected = cerradasSeleccionadas.includes(app.id);
                return (
                  <div
                    key={app.id}
                    onClick={() => {
                      setCerradasSeleccionadas(prev =>
                        selected ? prev.filter(id => id !== app.id) : [...prev, app.id]
                      );
                    }}
                    className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                      selected
                        ? 'bg-primary/10 border-primary/40'
                        : 'bg-white border-gray-200 hover:bg-gray-50'
                    }`}
                  >
                    {selected
                      ? <CheckSquare className="w-5 h-5 text-primary flex-shrink-0" />
                      : <Square className="w-5 h-5 text-gray-400 flex-shrink-0" />
                    }
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm text-foreground truncate">{app.nombre}</p>
                      <p className="text-xs text-gray-500">
                        {app.tipo} · Cerrada: {formatFecha(app.fechaCierre)}
                      </p>
                    </div>
                    <Badge variant={selected ? 'default' : 'outline'} className="text-xs flex-shrink-0">
                      {selected ? 'Incluida' : 'Excluida'}
                    </Badge>
                  </div>
                );
              })}
            </div>
          )}

          {cerradasSeleccionadas.length > 0 && (
            <p className="text-sm text-primary font-medium mt-3">
              {cerradasSeleccionadas.length} aplicación{cerradasSeleccionadas.length !== 1 ? 'es' : ''} seleccionada{cerradasSeleccionadas.length !== 1 ? 's' : ''}
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );

  // ============================================================================
  // RENDER: PASO 3 - DATOS OPERATIVOS
  // ============================================================================

  const renderPaso3 = () => {
    if (loading) {
      return (
        <div className="flex flex-col items-center justify-center py-20">
          <Loader2 className="w-8 h-8 text-primary animate-spin mb-4" />
          <p className="text-gray-500">Cargando datos de la semana...</p>
        </div>
      );
    }

    if (errorDatos) {
      return (
        <div className="text-center py-20">
          <AlertTriangle className="w-12 h-12 text-red-400 mx-auto mb-4" />
          <p className="text-red-600 mb-4">{errorDatos}</p>
          <Button onClick={cargarDatos}>Reintentar</Button>
        </div>
      );
    }

    if (!datosReporte) return null;

    return (
      <div className="space-y-6">
        {/* Personal summary - Redesigned with clear hierarchy */}
        <Card className="rounded-xl">
          <CardHeader className="pb-2">
            <CardTitle className="text-foreground text-lg">Personal</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Primary metric: Total trabajadores */}
            <div className="flex items-center justify-between p-4 bg-primary/5 rounded-xl border border-primary/10">
              <div>
                <p className="text-sm text-gray-500 font-medium">Total Trabajadores</p>
                <div className="flex items-baseline gap-2 mt-1">
                  <p className="text-4xl font-bold text-foreground">{datosReporte.personal.totalTrabajadores}</p>
                  <span className="text-sm text-gray-400">
                    ({datosReporte.personal.empleados} emp + {datosReporte.personal.contratistas} cont)
                  </span>
                </div>
              </div>
              <div className="text-right">
                <p className="text-sm text-gray-500">Eficiencia</p>
                <p className="text-3xl font-bold text-primary">{datosReporte.personal.eficienciaOperativa}%</p>
                <p className="text-xs text-gray-400 mt-1">
                  {datosReporte.personal.jornalesTrabajados.toFixed(1)} / {datosReporte.personal.jornalesPosibles} jornales
                </p>
              </div>
            </div>

            {/* Secondary metrics grid */}
            <div className="grid grid-cols-2 gap-3">
              {/* Asistencia */}
              <div className="p-3 bg-yellow-50 rounded-xl border border-yellow-100">
                <p className="text-xs text-yellow-600 font-medium uppercase tracking-wide mb-2">Asistencia</p>
                <div className="flex justify-between items-center">
                  <div className="text-center">
                    <p className="text-2xl font-bold text-yellow-700">{datosReporte.personal.fallas}</p>
                    <p className="text-xs text-yellow-600">Fallas</p>
                  </div>
                  <div className="text-center">
                    <p className="text-2xl font-bold text-yellow-700">{datosReporte.personal.permisos}</p>
                    <p className="text-xs text-yellow-600">Permisos</p>
                  </div>
                </div>
              </div>

              {/* Movimientos */}
              <div className="p-3 bg-blue-50 rounded-xl border border-blue-100">
                <p className="text-xs text-blue-600 font-medium uppercase tracking-wide mb-2">Movimientos</p>
                <div className="flex justify-between items-center">
                  <div className="text-center">
                    <p className="text-2xl font-bold text-blue-700">{datosReporte.personal.ingresos}</p>
                    <p className="text-xs text-blue-600">Ingresos</p>
                  </div>
                  <div className="text-center">
                    <p className="text-2xl font-bold text-blue-700">{datosReporte.personal.retiros}</p>
                    <p className="text-xs text-blue-600">Retiros</p>
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Labores programadas */}
        {datosReporte.labores.programadas.length > 0 && (
          <Card className="rounded-xl">
            <CardHeader className="pb-2">
              <CardTitle className="text-foreground text-lg">
                Labores Programadas
                <Badge variant="secondary" className="ml-2">{datosReporte.labores.programadas.length}</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto rounded-lg border border-gray-200">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-gray-50">
                      <TableHead className="text-left px-4 py-3">Tarea</TableHead>
                      <TableHead className="px-4 py-3">Tipo</TableHead>
                      <TableHead className="px-4 py-3">Estado</TableHead>
                      <TableHead className="px-4 py-3">Inicio</TableHead>
                      <TableHead className="px-4 py-3">Fin</TableHead>
                      <TableHead className="px-4 py-3">Lotes</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {datosReporte.labores.programadas.map((labor, idx) => (
                      <TableRow key={labor.id} className={idx % 2 === 1 ? 'bg-gray-50/50' : ''}>
                        <TableCell className="font-medium px-4 py-3">{labor.nombre}</TableCell>
                        <TableCell className="text-sm text-gray-500 px-4 py-3">{labor.tipoTarea}</TableCell>
                        <TableCell className="px-4 py-3">
                          <Badge variant={
                            labor.estado === 'Terminada' ? 'default' :
                            labor.estado === 'En proceso' ? 'secondary' : 'outline'
                          }>
                            {labor.estado}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm px-4 py-3">{formatFecha(labor.fechaInicio)}</TableCell>
                        <TableCell className="text-sm px-4 py-3">{labor.fechaFin ? formatFecha(labor.fechaFin) : '—'}</TableCell>
                        <TableCell className="text-xs text-gray-500 px-4 py-3">{labor.lotes.join(', ') || '—'}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Jornales matrix */}
        <Card className="rounded-xl">
          <CardHeader className="pb-2">
            <CardTitle className="text-foreground text-lg">
              Distribución de Jornales
              <Badge variant="secondary" className="ml-2">
                {datosReporte.labores.matrizJornales.totalGeneral.jornales.toFixed(2)} jornales
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {datosReporte.labores.matrizJornales.actividades.length === 0 ? (
              <p className="text-gray-400 text-center py-4">No hay registros de trabajo en esta semana</p>
            ) : (
              <div className="overflow-x-auto rounded-lg border border-gray-200">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-gray-50">
                      <TableHead className="font-semibold text-left px-4 py-3">Actividad</TableHead>
                      {datosReporte.labores.matrizJornales.lotes.map(lote => (
                        <TableHead key={lote} className="text-center px-3 py-3 font-medium">{lote}</TableHead>
                      ))}
                      <TableHead className="text-center font-bold px-4 py-3 bg-primary/5">Total</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {datosReporte.labores.matrizJornales.actividades.map((actividad, idx) => (
                      <TableRow key={actividad} className={idx % 2 === 1 ? 'bg-gray-50/50' : ''}>
                        <TableCell className="font-medium px-4 py-3">{actividad}</TableCell>
                        {datosReporte.labores.matrizJornales.lotes.map(lote => {
                          const celda = datosReporte.labores.matrizJornales.datos[actividad]?.[lote];
                          return (
                            <TableCell key={lote} className="text-center px-3 py-3 text-sm">
                              {celda ? celda.jornales.toFixed(2) : '-'}
                            </TableCell>
                          );
                        })}
                        <TableCell className="text-center font-semibold px-4 py-3 bg-primary/5">
                          {(datosReporte.labores.matrizJornales.totalesPorActividad[actividad]?.jornales || 0).toFixed(2)}
                        </TableCell>
                      </TableRow>
                    ))}
                    <TableRow className="bg-primary/10 font-bold border-t-2 border-primary/20">
                      <TableCell className="px-4 py-3">Total</TableCell>
                      {datosReporte.labores.matrizJornales.lotes.map(lote => (
                        <TableCell key={lote} className="text-center px-3 py-3">
                          {(datosReporte.labores.matrizJornales.totalesPorLote[lote]?.jornales || 0).toFixed(2)}
                        </TableCell>
                      ))}
                      <TableCell className="text-center px-4 py-3 bg-primary/20">
                        {datosReporte.labores.matrizJornales.totalGeneral.jornales.toFixed(2)}
                      </TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Aplicaciones cerradas */}
        {datosReporte.aplicaciones.cerradas.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-foreground">
                Aplicaciones Cerradas incluidas
                <Badge className="ml-2">{datosReporte.aplicaciones.cerradas.length}</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {datosReporte.aplicaciones.cerradas.map(app => (
                <div key={app.id} className="p-4 bg-background rounded-lg border border-secondary/30">
                  <div className="flex items-center gap-2 mb-1">
                    <Badge variant="outline">{app.tipo}</Badge>
                    <span className="font-medium text-foreground">{app.nombre}</span>
                  </div>
                  <p className="text-xs text-gray-500">
                    {formatFecha(app.fechaInicio)} — {formatFecha(app.fechaFin)} · {app.diasEjecucion} días
                  </p>
                  <p className="text-sm font-medium text-primary mt-1">
                    Costo real: {formatNumber(app.general.costoReal)} COP
                  </p>
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        {/* Aplicaciones planeadas */}
        {datosReporte.aplicaciones.planeadas.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-foreground">
                Aplicaciones Planeadas
                <Badge className="ml-2">{datosReporte.aplicaciones.planeadas.length}</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {datosReporte.aplicaciones.planeadas.map(app => (
                <div key={app.id} className="p-4 bg-background rounded-lg border border-secondary/30">
                  <div className="flex items-center gap-2 mb-2">
                    <Badge variant="outline">{app.tipo}</Badge>
                    <span className="font-medium text-foreground">{app.nombre}</span>
                  </div>
                  <p className="text-sm text-gray-600 mb-1">{app.proposito}</p>
                  <p className="text-sm font-medium text-primary">
                    Costo estimado: ${formatNumber(app.costoTotalEstimado)} COP
                  </p>
                  <p className="text-xs text-gray-400 mt-1">
                    {app.listaCompras.length} productos · {app.mezclas.length} mezclas
                  </p>
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        {/* Aplicaciones activas */}
        {datosReporte.aplicaciones.activas.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-foreground">
                Aplicaciones en Ejecución
                <Badge className="ml-2 bg-primary">{datosReporte.aplicaciones.activas.length}</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {datosReporte.aplicaciones.activas.map(app => (
                <div key={app.id} className="p-4 border rounded-lg">
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <Badge variant="outline">{app.tipo}</Badge>
                      <span className="ml-2 font-medium text-foreground">{app.nombre}</span>
                    </div>
                    <span className="text-lg font-bold text-primary">{app.porcentajeGlobal}%</span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2 mb-3">
                    <div
                      className="bg-primary h-2 rounded-full transition-all"
                      style={{ width: `${Math.min(100, app.porcentajeGlobal)}%` }}
                    />
                  </div>
                  <p className="text-sm text-gray-500 mb-2">
                    {app.totalEjecutado}/{app.totalPlaneado} {app.unidad}
                  </p>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                    {app.progresoPorLote.map(lote => (
                      <div key={lote.loteNombre} className="bg-gray-50 rounded p-2 text-xs">
                        <p className="font-medium">{lote.loteNombre}</p>
                        <p className="text-gray-500">{lote.ejecutado}/{lote.planeado} ({lote.porcentaje}%)</p>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        {/* Monitoreo */}
        {datosReporte.monitoreo.fechasMonitoreo.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-foreground">
                Monitoreo Fitosanitario
                <Badge variant="secondary" className="ml-2">
                  {datosReporte.monitoreo.fechasMonitoreo.length} monitoreos
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {datosReporte.monitoreo.insights.length > 0 && (
                <div className="space-y-2">
                  {datosReporte.monitoreo.insights.map((insight, i) => (
                    <div
                      key={i}
                      className={`p-3 rounded-lg border-l-4 ${
                        insight.tipo === 'urgente' ? 'bg-red-50 border-red-500' :
                        insight.tipo === 'atencion' ? 'bg-yellow-50 border-yellow-500' :
                        'bg-green-50 border-green-500'
                      }`}
                    >
                      <p className="font-medium text-sm">{insight.titulo}</p>
                      <p className="text-xs text-gray-600">{insight.descripcion}</p>
                    </div>
                  ))}
                </div>
              )}
              <p className="text-xs text-gray-400">
                Fechas: {datosReporte.monitoreo.fechasMonitoreo.join(', ')}
              </p>
              <p className="text-xs text-gray-400">
                {datosReporte.monitoreo.vistasPorLote.length} lotes ·{' '}
                {datosReporte.monitoreo.vistasPorSublote.length} vistas por sublote
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    );
  };

  // ============================================================================
  // RENDER: PASO 4 - TEMAS ADICIONALES
  // ============================================================================

  const renderPaso4 = () => (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between text-foreground">
            <span>Temas Adicionales</span>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={agregarBloqueTexto}>
                <Type className="w-4 h-4 mr-1" /> Texto
              </Button>
              <Button size="sm" variant="outline" onClick={agregarBloqueImagen}>
                <Image className="w-4 h-4 mr-1" /> Imagen
              </Button>
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {temasAdicionales.length === 0 ? (
            <div className="text-center py-12 text-gray-400">
              <MessageSquarePlus className="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p>No hay temas adicionales</p>
              <p className="text-sm">Cada bloque se convierte en una diapositiva separada</p>
            </div>
          ) : (
            <div className="space-y-4">
              {temasAdicionales.map((bloque, index) => (
                <div key={index} className="border rounded-lg p-4 bg-white">
                  <div className="flex items-center justify-between mb-3">
                    <Badge variant="outline">
                      {bloque.tipo === 'texto' ? 'Texto' : 'Imagen (hasta 2 fotos)'}
                    </Badge>
                    <div className="flex gap-1">
                      <Button size="sm" variant="ghost" onClick={() => moverBloque(index, -1)} disabled={index === 0}>
                        <ChevronUp className="w-4 h-4" />
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => moverBloque(index, 1)} disabled={index === temasAdicionales.length - 1}>
                        <ChevronDown className="w-4 h-4" />
                      </Button>
                      <Button size="sm" variant="ghost" className="text-red-500" onClick={() => eliminarBloque(index)}>
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>

                  <input
                    type="text"
                    placeholder="Título (opcional)"
                    value={bloque.titulo || ''}
                    onChange={(e) => actualizarBloque(index, { titulo: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg mb-3 focus:ring-2 focus:ring-primary focus:border-primary outline-none text-sm"
                  />

                  {bloque.tipo === 'texto' ? (
                    <textarea
                      placeholder="Escribe el contenido (usa viñetas con - al inicio de cada línea)"
                      value={(bloque as BloqueTexto).contenido}
                      onChange={(e) => actualizarBloque(index, { contenido: e.target.value })}
                      rows={4}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary outline-none text-sm resize-y"
                    />
                  ) : (
                    <>
                      {/* Two image slots */}
                      <div className="grid grid-cols-2 gap-3 mb-3">
                        {[0, 1].map(slot => {
                          const imgBloque = bloque as BloqueImagenConTexto;
                          const imgUrl = imgBloque.imagenesBase64?.[slot];
                          return (
                            <div key={slot}>
                              {!imgUrl ? (
                                <label className="flex flex-col items-center justify-center border-2 border-dashed border-gray-300 rounded-lg p-4 cursor-pointer hover:border-primary transition-colors h-32">
                                  <Upload className="w-6 h-6 text-gray-400 mb-1" />
                                  <p className="text-xs text-gray-500">Foto {slot + 1}</p>
                                  <p className="text-xs text-gray-400">Max 800KB</p>
                                  <input
                                    type="file" accept="image/*" className="hidden"
                                    onChange={(e) => {
                                      const file = e.target.files?.[0];
                                      if (file) handleImageUpload(index, file, slot);
                                    }}
                                  />
                                </label>
                              ) : (
                                <div className="relative">
                                  <img
                                    src={imgUrl}
                                    alt={`Foto ${slot + 1}`}
                                    className="h-32 w-full rounded-lg object-cover"
                                  />
                                  <button
                                    onClick={() => handleRemoveImage(index, slot)}
                                    className="absolute top-1 right-1 bg-white rounded-full p-1 shadow text-red-500 hover:bg-red-50"
                                  >
                                    <X className="w-3 h-3" />
                                  </button>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                      <textarea
                        placeholder="Descripción / texto de la diapositiva"
                        value={(bloque as BloqueImagenConTexto).descripcion}
                        onChange={(e) => actualizarBloque(index, { descripcion: e.target.value })}
                        rows={2}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary outline-none text-sm resize-y"
                      />
                    </>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );

  // ============================================================================
  // RENDER: PASO 5 - GENERAR Y PREVIEW
  // ============================================================================

  const renderPaso5 = () => (
    <div className="space-y-6">
      {!htmlGenerado && (
        <Card>
          <CardContent className="py-12 text-center">
            {generando ? (
              <div>
                <Loader2 className="w-12 h-12 text-primary animate-spin mx-auto mb-4" />
                <p className="text-lg font-medium text-foreground">{progresoMensaje || 'Generando reporte...'}</p>
                <p className="text-sm text-gray-400 mt-2">Esto puede tomar 10-30 segundos</p>
              </div>
            ) : (
              <div>
                <FileText className="w-16 h-16 text-primary mx-auto mb-4 opacity-70" />
                <h3 className="text-xl font-bold text-foreground mb-2">Listo para generar</h3>
                <p className="text-gray-500 mb-6">
                  El reporte en formato diapositivas (landscape) será generado para la Semana {semana.numero}
                </p>
                <Button
                  size="lg"
                  className="bg-primary hover:bg-primary-dark text-white px-8"
                  onClick={handleGenerar}
                >
                  <FileText className="w-5 h-5 mr-2" />
                  Generar Reporte con IA
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {errorGeneracion && !generando && (
        <Card className="border-red-300 bg-red-50">
          <CardContent className="py-6">
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-6 h-6 text-red-500 flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <h4 className="font-medium text-red-800 mb-1">Error al generar el reporte</h4>
                <p className="text-sm text-red-700">{errorGeneracion}</p>
                <Button
                  size="sm" variant="outline"
                  className="mt-3 border-red-300 text-red-700 hover:bg-red-100"
                  onClick={handleGenerar}
                >
                  <RefreshCw className="w-4 h-4 mr-1" />
                  Reintentar
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {htmlGenerado && (
        <>
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-bold text-foreground">Vista Previa</h3>
            <div className="flex gap-2">
              <Button variant="outline" onClick={handleGenerar} disabled={generando}>
                <RefreshCw className={`w-4 h-4 mr-1 ${generando ? 'animate-spin' : ''}`} />
                Regenerar
              </Button>
              <Button
                className="bg-primary hover:bg-primary-dark text-white"
                onClick={handleDescargar}
                disabled={!pdfBlob}
              >
                <Download className="w-4 h-4 mr-1" />
                Descargar PDF
              </Button>
            </div>
          </div>
          <div className="border rounded-xl overflow-hidden shadow-lg bg-white">
            <iframe
              srcDoc={htmlGenerado}
              className="w-full border-0"
              style={{ height: 'calc(100vh - 200px)', minHeight: '900px' }}
              title="Vista previa del reporte"
            />
          </div>
        </>
      )}
    </div>
  );

  // ============================================================================
  // MAIN RENDER
  // ============================================================================

  return (
    <div className="max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <Button
            variant="ghost" size="sm"
            onClick={() => navigate('/reportes')}
            className="mb-2 text-gray-500"
          >
            <ArrowLeft className="w-4 h-4 mr-1" /> Volver a Reportes
          </Button>
          <h1 className="text-2xl font-bold text-foreground">Generar Reporte Semanal (Diapositivas)</h1>
        </div>
      </div>

      {renderPasos()}

      {pasoActual === 1 && renderPaso1()}
      {pasoActual === 2 && renderPaso2()}
      {pasoActual === 3 && renderPaso3()}
      {pasoActual === 4 && renderPaso4()}
      {pasoActual === 5 && renderPaso5()}

      <div className="flex items-center justify-between mt-8 pt-4 border-t">
        <Button
          variant="outline"
          onClick={handleAnterior}
          disabled={pasoActual === 1}
        >
          <ArrowLeft className="w-4 h-4 mr-1" /> Anterior
        </Button>
        {pasoActual < 5 ? (
          <Button
            className="bg-primary hover:bg-primary-dark text-white"
            onClick={handleSiguiente}
            disabled={loading}
          >
            {loading ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : null}
            Siguiente <ArrowRight className="w-4 h-4 ml-1" />
          </Button>
        ) : (
          <Button variant="outline" onClick={() => navigate('/reportes')}>
            Finalizar
          </Button>
        )}
      </div>
    </div>
  );
}
