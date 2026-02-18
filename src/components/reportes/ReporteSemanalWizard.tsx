import { useState, useEffect, useRef } from 'react';
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
} from '../../types/reporteSemanal';
import { formatearFechaCorta } from '../../utils/fechas';
import { formatNumber } from '../../utils/format';

// ============================================================================
// CONFIGURACIÓN DE PASOS
// ============================================================================

const PASOS = [
  { numero: 1, titulo: 'Configuración', descripcion: 'Semana y personal', icono: Settings },
  { numero: 2, titulo: 'Datos Operativos', descripcion: 'Jornales, aplicaciones, monitoreo', icono: BarChart3 },
  { numero: 3, titulo: 'Temas Adicionales', descripcion: 'Notas e imágenes', icono: MessageSquarePlus },
  { numero: 4, titulo: 'Generar Reporte', descripcion: 'Vista previa y PDF', icono: FileText },
];

// ============================================================================
// COMPONENTE PRINCIPAL
// ============================================================================

export function ReporteSemanalWizard() {
  const navigate = useNavigate();

  // Estado del wizard
  const [pasoActual, setPasoActual] = useState(1);
  const [loading, setLoading] = useState(false);
  const [generando, setGenerando] = useState(false);
  const [progresoMensaje, setProgresoMensaje] = useState('');

  // Paso 1: Configuración
  const [semana, setSemana] = useState<RangoSemana>(calcularSemanaAnterior);
  const [fallas, setFallas] = useState(0);
  const [permisos, setPermisos] = useState(0);

  // Paso 2: Datos auto-cargados
  const [datosReporte, setDatosReporte] = useState<DatosReporteSemanal | null>(null);
  const [errorDatos, setErrorDatos] = useState('');

  // Paso 3: Temas adicionales
  const [temasAdicionales, setTemasAdicionales] = useState<BloqueAdicional[]>([]);

  // Paso 4: Resultado
  const [htmlGenerado, setHtmlGenerado] = useState('');
  const [pdfBlob, setPdfBlob] = useState<Blob | null>(null);

  // ============================================================================
  // NAVEGACIÓN ENTRE PASOS
  // ============================================================================

  const handleSiguiente = async () => {
    if (pasoActual === 1) {
      // Al avanzar de paso 1 a 2, cargar datos
      await cargarDatos();
    }
    if (pasoActual < 4) {
      setPasoActual(pasoActual + 1);
    }
  };

  const handleAnterior = () => {
    if (pasoActual > 1) {
      setPasoActual(pasoActual - 1);
    }
  };

  // ============================================================================
  // CARGA DE DATOS (Paso 1 → Paso 2)
  // ============================================================================

  const cargarDatos = async () => {
    setLoading(true);
    setErrorDatos('');
    try {
      const datos = await fetchDatosReporteSemanal({
        semana,
        fallas,
        permisos,
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
  // GENERACIÓN DEL REPORTE (Paso 4)
  // ============================================================================

  const handleGenerar = async () => {
    if (!datosReporte) return;

    setGenerando(true);
    setHtmlGenerado('');
    setPdfBlob(null);

    try {
      // Actualizar datos con temas adicionales finales
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
      toast.success(`Reporte generado (${resultado.tokensUsados} tokens)`);
    } catch (error: any) {
      toast.error(error.message || 'Error al generar el reporte');
    } finally {
      setGenerando(false);
      setProgresoMensaje('');
    }
  };

  const handleDescargar = () => {
    if (!pdfBlob) return;
    const filename = `reporte-semana-${semana.ano}-S${String(semana.numero).padStart(2, '0')}.pdf`;
    descargarBlob(pdfBlob, filename);
    toast.success('PDF descargado');
  };

  // ============================================================================
  // MANEJO DE SEMANA (Paso 1)
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
  // MANEJO DE TEMAS ADICIONALES (Paso 3)
  // ============================================================================

  const agregarBloqueTexto = () => {
    setTemasAdicionales([...temasAdicionales, {
      tipo: 'texto',
      titulo: '',
      contenido: '',
    }]);
  };

  const agregarBloqueImagen = () => {
    setTemasAdicionales([...temasAdicionales, {
      tipo: 'imagen_con_texto',
      titulo: '',
      imagenBase64: '',
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

  const handleImageUpload = (index: number, file: File) => {
    if (file.size > 500 * 1024) {
      toast.error('La imagen debe ser menor a 500KB');
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      actualizarBloque(index, { imagenBase64: e.target?.result as string });
    };
    reader.readAsDataURL(file);
  };

  // ============================================================================
  // RENDER: INDICADOR DE PASOS
  // ============================================================================

  const renderPasos = () => (
    <div className="flex items-center justify-between mb-8 bg-white rounded-2xl p-4 border border-gray-200 shadow-sm">
      {PASOS.map((paso, i) => {
        const Icon = paso.icono;
        const esActual = paso.numero === pasoActual;
        const esCompletado = paso.numero < pasoActual;
        return (
          <div key={paso.numero} className="flex items-center flex-1">
            <div className="flex items-center gap-3">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all ${
                esActual ? 'bg-[#73991C] text-white shadow-md' :
                esCompletado ? 'bg-[#BFD97D] text-[#172E08]' :
                'bg-gray-100 text-gray-400'
              }`}>
                <Icon className="w-5 h-5" />
              </div>
              <div className="hidden md:block">
                <p className={`text-sm font-medium ${esActual ? 'text-[#172E08]' : 'text-gray-500'}`}>
                  {paso.titulo}
                </p>
                <p className="text-xs text-gray-400">{paso.descripcion}</p>
              </div>
            </div>
            {i < PASOS.length - 1 && (
              <div className={`flex-1 h-0.5 mx-4 ${
                esCompletado ? 'bg-[#BFD97D]' : 'bg-gray-200'
              }`} />
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
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-[#172E08]">
            <Calendar className="w-5 h-5 text-[#73991C]" />
            Semana del Reporte
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-4">
            <Button variant="outline" size="sm" onClick={() => handleCambiarSemana(-1)}>
              <ArrowLeft className="w-4 h-4" />
            </Button>
            <div className="flex-1 text-center">
              <p className="text-2xl font-bold text-[#172E08]">
                Semana {semana.numero}
              </p>
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
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-[#172E08]">
            <Users className="w-5 h-5 text-[#73991C]" />
            Personal
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-gray-500 mb-4">
            El total de trabajadores se calcula automáticamente. Ingresa fallas y permisos manualmente.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-[#4D240F] mb-1">
                Fallas (ausencias no justificadas)
              </label>
              <input
                type="number"
                min="0"
                value={fallas}
                onChange={(e) => setFallas(Math.max(0, parseInt(e.target.value) || 0))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#73991C] focus:border-[#73991C] outline-none"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-[#4D240F] mb-1">
                Permisos otorgados
              </label>
              <input
                type="number"
                min="0"
                value={permisos}
                onChange={(e) => setPermisos(Math.max(0, parseInt(e.target.value) || 0))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#73991C] focus:border-[#73991C] outline-none"
              />
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );

  // ============================================================================
  // RENDER: PASO 2 - DATOS OPERATIVOS
  // ============================================================================

  const renderPaso2 = () => {
    if (loading) {
      return (
        <div className="flex flex-col items-center justify-center py-20">
          <Loader2 className="w-8 h-8 text-[#73991C] animate-spin mb-4" />
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
        {/* Resumen de Personal */}
        <Card>
          <CardHeader>
            <CardTitle className="text-[#172E08]">Personal</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
              {[
                { label: 'Trabajadores', value: datosReporte.personal.totalTrabajadores },
                { label: 'Empleados', value: datosReporte.personal.empleados },
                { label: 'Contratistas', value: datosReporte.personal.contratistas },
                { label: 'Fallas', value: datosReporte.personal.fallas },
                { label: 'Permisos', value: datosReporte.personal.permisos },
              ].map(item => (
                <div key={item.label} className="text-center p-3 bg-[#F8FAF5] rounded-lg">
                  <p className="text-2xl font-bold text-[#172E08]">{item.value}</p>
                  <p className="text-xs text-gray-500">{item.label}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Matriz de Jornales */}
        <Card>
          <CardHeader>
            <CardTitle className="text-[#172E08]">
              Distribución de Jornales
              <Badge variant="secondary" className="ml-2">
                {datosReporte.jornales.totalGeneral.jornales.toFixed(2)} jornales
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {datosReporte.jornales.actividades.length === 0 ? (
              <p className="text-gray-400 text-center py-4">No hay registros de trabajo en esta semana</p>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="font-semibold">Actividad</TableHead>
                      {datosReporte.jornales.lotes.map(lote => (
                        <TableHead key={lote} className="text-center">{lote}</TableHead>
                      ))}
                      <TableHead className="text-center font-bold bg-[#F8FAF5]">Total</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {datosReporte.jornales.actividades.map(actividad => (
                      <TableRow key={actividad}>
                        <TableCell className="font-medium">{actividad}</TableCell>
                        {datosReporte.jornales.lotes.map(lote => {
                          const celda = datosReporte.jornales.datos[actividad]?.[lote];
                          return (
                            <TableCell key={lote} className="text-center">
                              {celda ? celda.jornales.toFixed(2) : '-'}
                            </TableCell>
                          );
                        })}
                        <TableCell className="text-center font-bold bg-[#F8FAF5]">
                          {(datosReporte.jornales.totalesPorActividad[actividad]?.jornales || 0).toFixed(2)}
                        </TableCell>
                      </TableRow>
                    ))}
                    {/* Fila de totales */}
                    <TableRow className="bg-[#F8FAF5] font-bold">
                      <TableCell>Total</TableCell>
                      {datosReporte.jornales.lotes.map(lote => (
                        <TableCell key={lote} className="text-center">
                          {(datosReporte.jornales.totalesPorLote[lote]?.jornales || 0).toFixed(2)}
                        </TableCell>
                      ))}
                      <TableCell className="text-center bg-[#73991C]/10">
                        {datosReporte.jornales.totalGeneral.jornales.toFixed(2)}
                      </TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Aplicaciones Planeadas */}
        {datosReporte.aplicaciones.planeadas.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-[#172E08]">
                Aplicaciones Planeadas
                <Badge className="ml-2">{datosReporte.aplicaciones.planeadas.length}</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {datosReporte.aplicaciones.planeadas.map(app => (
                <div key={app.id} className="p-4 bg-[#F8FAF5] rounded-lg border border-[#BFD97D]/30">
                  <div className="flex items-center gap-2 mb-2">
                    <Badge variant="outline">{app.tipo}</Badge>
                    <span className="font-medium text-[#172E08]">{app.nombre}</span>
                  </div>
                  <p className="text-sm text-gray-600 mb-2">{app.proposito}</p>
                  <p className="text-sm font-medium text-[#73991C]">
                    Costo estimado: ${formatNumber(app.costoTotalEstimado)} COP
                  </p>
                  <p className="text-xs text-gray-400 mt-1">
                    {app.listaCompras.length} productos en lista de compras
                  </p>
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        {/* Aplicaciones Activas */}
        {datosReporte.aplicaciones.activas.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-[#172E08]">
                Aplicaciones en Ejecución
                <Badge className="ml-2 bg-[#73991C]">{datosReporte.aplicaciones.activas.length}</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {datosReporte.aplicaciones.activas.map(app => (
                <div key={app.id} className="p-4 border rounded-lg">
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <Badge variant="outline">{app.tipo}</Badge>
                      <span className="ml-2 font-medium text-[#172E08]">{app.nombre}</span>
                    </div>
                    <span className="text-lg font-bold text-[#73991C]">{app.porcentajeGlobal}%</span>
                  </div>
                  {/* Barra de progreso global */}
                  <div className="w-full bg-gray-200 rounded-full h-2 mb-3">
                    <div
                      className="bg-[#73991C] h-2 rounded-full transition-all"
                      style={{ width: `${Math.min(100, app.porcentajeGlobal)}%` }}
                    />
                  </div>
                  <p className="text-sm text-gray-500 mb-2">
                    {app.totalEjecutado}/{app.totalPlaneado} {app.unidad}
                  </p>
                  {/* Detalle por lote */}
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                    {app.progresoPorLote.map(lote => (
                      <div key={lote.loteNombre} className="bg-gray-50 rounded p-2 text-xs">
                        <p className="font-medium">{lote.loteNombre}</p>
                        <p className="text-gray-500">
                          {lote.ejecutado}/{lote.planeado} ({lote.porcentaje}%)
                        </p>
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
              <CardTitle className="text-[#172E08]">
                Monitoreo Fitosanitario
                <Badge variant="secondary" className="ml-2">
                  {datosReporte.monitoreo.fechasMonitoreo.length} monitoreos
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Insights */}
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
              {/* Detalle por lote */}
              {datosReporte.monitoreo.detallePorLote.map(lote => (
                <div key={lote.loteNombre} className="border rounded-lg p-3">
                  <p className="font-medium text-[#172E08] mb-2">{lote.loteNombre}</p>
                  <div className="space-y-1">
                    {lote.sublotes.map((s, i) => (
                      <div key={i} className="flex items-center justify-between text-sm">
                        <span className="text-gray-600">{s.subloteNombre} — {s.plagaNombre}</span>
                        <Badge variant={
                          s.gravedad === 'Alta' ? 'destructive' :
                          s.gravedad === 'Media' ? 'default' : 'secondary'
                        }>
                          {s.incidencia.toFixed(1)}%
                        </Badge>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        )}
      </div>
    );
  };

  // ============================================================================
  // RENDER: PASO 3 - TEMAS ADICIONALES
  // ============================================================================

  const renderPaso3 = () => (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between text-[#172E08]">
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
              <p className="text-sm">Agrega bloques de texto o imágenes con los botones de arriba</p>
            </div>
          ) : (
            <div className="space-y-4">
              {temasAdicionales.map((bloque, index) => (
                <div key={index} className="border rounded-lg p-4 bg-white">
                  <div className="flex items-center justify-between mb-3">
                    <Badge variant="outline">
                      {bloque.tipo === 'texto' ? 'Texto' : 'Imagen'}
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

                  {/* Título (ambos tipos) */}
                  <input
                    type="text"
                    placeholder="Título (opcional)"
                    value={bloque.titulo || ''}
                    onChange={(e) => actualizarBloque(index, { titulo: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg mb-3 focus:ring-2 focus:ring-[#73991C] focus:border-[#73991C] outline-none text-sm"
                  />

                  {bloque.tipo === 'texto' ? (
                    <textarea
                      placeholder="Escribe el contenido (usa viñetas con - al inicio de cada línea)"
                      value={(bloque as BloqueTexto).contenido}
                      onChange={(e) => actualizarBloque(index, { contenido: e.target.value })}
                      rows={4}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#73991C] focus:border-[#73991C] outline-none text-sm resize-y"
                    />
                  ) : (
                    <>
                      {/* Upload de imagen */}
                      {!(bloque as BloqueImagenConTexto).imagenBase64 ? (
                        <label className="flex flex-col items-center justify-center border-2 border-dashed border-gray-300 rounded-lg p-6 cursor-pointer hover:border-[#73991C] transition-colors">
                          <Upload className="w-8 h-8 text-gray-400 mb-2" />
                          <p className="text-sm text-gray-500">Arrastra o haz clic para subir imagen</p>
                          <p className="text-xs text-gray-400">Máximo 500KB</p>
                          <input
                            type="file"
                            accept="image/*"
                            className="hidden"
                            onChange={(e) => {
                              const file = e.target.files?.[0];
                              if (file) handleImageUpload(index, file);
                            }}
                          />
                        </label>
                      ) : (
                        <div className="mb-3">
                          <img
                            src={(bloque as BloqueImagenConTexto).imagenBase64}
                            alt="Preview"
                            className="max-h-48 rounded-lg object-contain mx-auto"
                          />
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-red-500 mt-2"
                            onClick={() => actualizarBloque(index, { imagenBase64: '' })}
                          >
                            Eliminar imagen
                          </Button>
                        </div>
                      )}
                      <textarea
                        placeholder="Descripción de la imagen"
                        value={(bloque as BloqueImagenConTexto).descripcion}
                        onChange={(e) => actualizarBloque(index, { descripcion: e.target.value })}
                        rows={2}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#73991C] focus:border-[#73991C] outline-none text-sm resize-y mt-3"
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
  // RENDER: PASO 4 - GENERAR Y PREVIEW
  // ============================================================================

  const renderPaso4 = () => (
    <div className="space-y-6">
      {/* Botón de generar */}
      {!htmlGenerado && (
        <Card>
          <CardContent className="py-12 text-center">
            {generando ? (
              <div>
                <Loader2 className="w-12 h-12 text-[#73991C] animate-spin mx-auto mb-4" />
                <p className="text-lg font-medium text-[#172E08]">{progresoMensaje || 'Generando reporte...'}</p>
                <p className="text-sm text-gray-400 mt-2">Esto puede tomar 10-30 segundos</p>
              </div>
            ) : (
              <div>
                <FileText className="w-16 h-16 text-[#73991C] mx-auto mb-4 opacity-70" />
                <h3 className="text-xl font-bold text-[#172E08] mb-2">Listo para generar</h3>
                <p className="text-gray-500 mb-6">
                  El reporte será diseñado por IA con los datos de la semana {semana.numero}
                </p>
                <Button
                  size="lg"
                  className="bg-[#73991C] hover:bg-[#5a7a16] text-white px-8"
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

      {/* Preview y acciones */}
      {htmlGenerado && (
        <>
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-bold text-[#172E08]">Vista Previa</h3>
            <div className="flex gap-2">
              <Button variant="outline" onClick={handleGenerar} disabled={generando}>
                <RefreshCw className={`w-4 h-4 mr-1 ${generando ? 'animate-spin' : ''}`} />
                Regenerar
              </Button>
              <Button
                className="bg-[#73991C] hover:bg-[#5a7a16] text-white"
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
              className="w-full h-[800px] border-0"
              title="Vista previa del reporte"
            />
          </div>
        </>
      )}
    </div>
  );

  // ============================================================================
  // RENDER PRINCIPAL
  // ============================================================================

  return (
    <div className="max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate('/reportes')}
            className="mb-2 text-gray-500"
          >
            <ArrowLeft className="w-4 h-4 mr-1" /> Volver a Reportes
          </Button>
          <h1 className="text-2xl font-bold text-[#172E08]">Generar Reporte Semanal</h1>
        </div>
      </div>

      {/* Indicador de pasos */}
      {renderPasos()}

      {/* Contenido del paso actual */}
      {pasoActual === 1 && renderPaso1()}
      {pasoActual === 2 && renderPaso2()}
      {pasoActual === 3 && renderPaso3()}
      {pasoActual === 4 && renderPaso4()}

      {/* Navegación */}
      <div className="flex items-center justify-between mt-8 pt-4 border-t">
        <Button
          variant="outline"
          onClick={handleAnterior}
          disabled={pasoActual === 1}
        >
          <ArrowLeft className="w-4 h-4 mr-1" /> Anterior
        </Button>
        {pasoActual < 4 ? (
          <Button
            className="bg-[#73991C] hover:bg-[#5a7a16] text-white"
            onClick={handleSiguiente}
            disabled={loading}
          >
            {loading ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : null}
            Siguiente <ArrowRight className="w-4 h-4 ml-1" />
          </Button>
        ) : (
          <Button
            variant="outline"
            onClick={() => navigate('/reportes')}
          >
            Finalizar
          </Button>
        )}
      </div>
    </div>
  );
}
