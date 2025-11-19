import { useState, useEffect } from 'react';
import { getSupabase } from '../../utils/supabase/client';
import { Card } from '../ui/card';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Button } from '../ui/button';
import { Search, Calendar, MapPin, Bug, Filter, X, ArrowUpDown, ArrowUp, ArrowDown, ChevronDown, ChevronUp } from 'lucide-react';
import { toast } from 'sonner';

interface Monitoreo {
  id: string;
  fecha_monitoreo: string;
  lote_nombre: string;
  sublote_nombre: string;
  plaga_nombre: string;
  arboles_monitoreados: number;
  arboles_afectados: number;
  individuos_encontrados: number;
  incidencia: number;
  severidad: number;
  gravedad_texto: string;
  gravedad_numerica: number;
  monitor: string | null;
  observaciones: string | null;
}

// ✅ NUEVO: Interface para agrupación por semana
interface GrupoSemana {
  semana: number;
  año: number;
  fechaInicio: string;
  fechaFin: string;
  registros: Monitoreo[];
  totalRegistros: number;
}

export function TablaMonitoreos() {
  const [monitoreos, setMonitoreos] = useState<Monitoreo[]>([]);
  const [loading, setLoading] = useState(true);
  const [filtroLote, setFiltroLote] = useState('');
  const [filtroPlaga, setFiltroPlaga] = useState('');
  const [filtroFechaDesde, setFiltroFechaDesde] = useState('');
  const [filtroFechaHasta, setFiltroFechaHasta] = useState('');
  const [mostrarFiltros, setMostrarFiltros] = useState(false);
  const [paginaActual, setPaginaActual] = useState(1);
  const registrosPorPagina = 50;
  
  // ✅ Estado de ordenamiento
  const [ordenarPor, setOrdenarPor] = useState<keyof Monitoreo | null>('fecha_monitoreo');
  const [direccionOrden, setDireccionOrden] = useState<'asc' | 'desc'>('desc');

  // ✅ NUEVO: Estado para controlar qué semanas están expandidas
  const [semanasExpandidas, setSemanasExpandidas] = useState<Set<string>>(new Set());

  const supabase = getSupabase();

  useEffect(() => {
    cargarMonitoreos();
  }, []);

  async function cargarMonitoreos() {
    try {
      setLoading(true);
      console.log('🔍 Cargando todos los monitoreos con paginación...');

      // ✅ SOLUCIÓN: Cargar en lotes de 1000 hasta completar 5000
      const BATCH_SIZE = 1000;
      const MAX_RECORDS = 5000;
      let allData: any[] = [];
      let currentOffset = 0;
      let hasMore = true;

      while (hasMore && allData.length < MAX_RECORDS) {
        console.log(`📦 Cargando lote ${currentOffset / BATCH_SIZE + 1}...`);
        
        const { data, error, count } = await supabase
          .from('monitoreos')
          .select(`
            id,
            fecha_monitoreo,
            arboles_monitoreados,
            arboles_afectados,
            individuos_encontrados,
            incidencia,
            severidad,
            gravedad_texto,
            gravedad_numerica,
            monitor,
            observaciones,
            lotes!inner(nombre),
            sublotes!inner(nombre),
            plagas_enfermedades_catalogo!inner(nombre)
          `, { count: 'exact' })
          .range(currentOffset, currentOffset + BATCH_SIZE - 1)
          .order('fecha_monitoreo', { ascending: false });

        if (error) {
          console.error('❌ Error cargando monitoreos:', error);
          throw error;
        }

        if (data && data.length > 0) {
          allData = [...allData, ...data];
          currentOffset += BATCH_SIZE;
          hasMore = data.length === BATCH_SIZE && allData.length < MAX_RECORDS;
          
          console.log(`✅ Lote cargado: ${data.length} registros (Total acumulado: ${allData.length})`);
          
          // Si ya alcanzamos el total de la BD, detener
          if (count && allData.length >= count) {
            hasMore = false;
          }
        } else {
          hasMore = false;
        }
      }

      console.log(`🎉 TOTAL CARGADO: ${allData.length} registros`);
      console.log('📊 Total en BD:', allData.length);

      // Mapear los datos
      const monitoreosFormateados = allData?.map((m: any) => ({
        id: m.id,
        fecha_monitoreo: m.fecha_monitoreo,
        lote_nombre: m.lotes?.nombre || 'N/A',
        sublote_nombre: m.sublotes?.nombre || 'N/A',
        plaga_nombre: m.plagas_enfermedades_catalogo?.nombre || 'N/A',
        arboles_monitoreados: m.arboles_monitoreados,
        arboles_afectados: m.arboles_afectados,
        individuos_encontrados: m.individuos_encontrados,
        incidencia: m.incidencia,
        severidad: m.severidad,
        gravedad_texto: m.gravedad_texto,
        gravedad_numerica: m.gravedad_numerica,
        monitor: m.monitor,
        observaciones: m.observaciones
      })) || [];

      setMonitoreos(monitoreosFormateados);

      if (monitoreosFormateados.length === 0) {
        toast.info('No hay registros de monitoreo en la base de datos');
      } else {
        toast.success(`${monitoreosFormateados.length} registros cargados`);
      }
    } catch (error) {
      console.error('Error cargando monitoreos:', error);
      toast.error('Error al cargar los monitoreos');
    } finally {
      setLoading(false);
    }
  }

  // Filtrar monitoreos
  const monitoreosFiltrados = monitoreos.filter(m => {
    if (filtroLote && !m.lote_nombre.toLowerCase().includes(filtroLote.toLowerCase())) {
      return false;
    }
    if (filtroPlaga && !m.plaga_nombre.toLowerCase().includes(filtroPlaga.toLowerCase())) {
      return false;
    }
    if (filtroFechaDesde && m.fecha_monitoreo < filtroFechaDesde) {
      return false;
    }
    if (filtroFechaHasta && m.fecha_monitoreo > filtroFechaHasta) {
      return false;
    }
    return true;
  });

  // ✅ Aplicar ordenamiento
  const monitoreosOrdenados = [...monitoreosFiltrados].sort((a, b) => {
    if (!ordenarPor) return 0;

    const valorA = a[ordenarPor];
    const valorB = b[ordenarPor];

    // Manejar valores null/undefined
    if (valorA == null && valorB == null) return 0;
    if (valorA == null) return direccionOrden === 'asc' ? 1 : -1;
    if (valorB == null) return direccionOrden === 'asc' ? -1 : 1;

    // Comparar según tipo
    let comparacion = 0;
    if (typeof valorA === 'string' && typeof valorB === 'string') {
      comparacion = valorA.localeCompare(valorB);
    } else if (typeof valorA === 'number' && typeof valorB === 'number') {
      comparacion = valorA - valorB;
    }

    return direccionOrden === 'asc' ? comparacion : -comparacion;
  });

  // ✅ NUEVO: Función para obtener número de semana ISO 8601
  const getNumeroSemana = (fecha: Date): number => {
    const d = new Date(Date.UTC(fecha.getFullYear(), fecha.getMonth(), fecha.getDate()));
    const dayNum = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    return Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  };

  // ✅ NUEVO: Agrupar monitoreos por semana
  const agruparPorSemana = (monitoreos: Monitoreo[]): GrupoSemana[] => {
    const grupos = new Map<string, GrupoSemana>();

    monitoreos.forEach(m => {
      const fecha = new Date(m.fecha_monitoreo);
      const año = fecha.getFullYear();
      const semana = getNumeroSemana(fecha);
      const key = `${año}-S${semana}`;

      if (!grupos.has(key)) {
        // Calcular fechas de inicio y fin de la semana
        const primerDia = new Date(fecha);
        primerDia.setDate(fecha.getDate() - (fecha.getDay() || 7) + 1); // Lunes
        const ultimoDia = new Date(primerDia);
        ultimoDia.setDate(primerDia.getDate() + 6); // Domingo

        grupos.set(key, {
          semana,
          año,
          fechaInicio: primerDia.toISOString().split('T')[0],
          fechaFin: ultimoDia.toISOString().split('T')[0],
          registros: [],
          totalRegistros: 0
        });
      }

      const grupo = grupos.get(key)!;
      grupo.registros.push(m);
      grupo.totalRegistros++;
    });

    // Convertir a array y ordenar por año y semana (descendente)
    return Array.from(grupos.values()).sort((a, b) => {
      if (a.año !== b.año) return b.año - a.año;
      return b.semana - a.semana;
    });
  };

  // ✅ NUEVO: Agrupar los datos ordenados
  const gruposSemanas = agruparPorSemana(monitoreosOrdenados);

  // ✅ NUEVO: Función para toggle expandir/colapsar semana
  const toggleSemana = (key: string) => {
    setSemanasExpandidas(prev => {
      const nuevo = new Set(prev);
      if (nuevo.has(key)) {
        nuevo.delete(key);
      } else {
        nuevo.add(key);
      }
      return nuevo;
    });
  };

  // ✅ NUEVO: Expandir/colapsar todas las semanas
  const expandirTodas = () => {
    const todasLasKeys = gruposSemanas.map(g => `${g.año}-S${g.semana}`);
    setSemanasExpandidas(new Set(todasLasKeys));
  };

  const colapsarTodas = () => {
    setSemanasExpandidas(new Set());
  };

  // ✅ Función para manejar click en header
  const handleOrdenar = (columna: keyof Monitoreo) => {
    if (ordenarPor === columna) {
      // Si ya está ordenando por esta columna, cambiar dirección
      setDireccionOrden(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      // Nueva columna, ordenar ascendente por defecto
      setOrdenarPor(columna);
      setDireccionOrden('asc');
    }
  };

  // ✅ Función para renderizar icono de ordenamiento
  const renderIconoOrden = (columna: keyof Monitoreo) => {
    if (ordenarPor !== columna) {
      return <ArrowUpDown className="w-3 h-3 opacity-30" />;
    }
    return direccionOrden === 'asc' 
      ? <ArrowUp className="w-3 h-3 text-[#73991C]" />
      : <ArrowDown className="w-3 h-3 text-[#73991C]" />;
  };

  // Paginación (ahora con datos ordenados)
  const indiceInicio = (paginaActual - 1) * registrosPorPagina;
  const indiceFin = indiceInicio + registrosPorPagina;
  const monitoreosPaginados = monitoreosOrdenados.slice(indiceInicio, indiceFin);
  const totalPaginas = Math.ceil(monitoreosOrdenados.length / registrosPorPagina);

  function limpiarFiltros() {
    setFiltroLote('');
    setFiltroPlaga('');
    setFiltroFechaDesde('');
    setFiltroFechaHasta('');
    setPaginaActual(1);
  }

  function getGravedadColor(gravedad: string) {
    switch (gravedad?.toLowerCase()) {
      case 'alta':
        return 'bg-red-100 text-red-800 border-red-200';
      case 'media':
        return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case 'baja':
        return 'bg-green-100 text-green-800 border-green-200';
      default:
        return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-[#73991C] border-r-transparent mb-4"></div>
          <p className="text-[#4D240F]/70">Cargando monitoreos...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header con filtros */}
      <Card className="p-4 bg-white">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-[#172E08]">
              Todos los Registros de Monitoreo
            </h3>
            <p className="text-sm text-[#4D240F]/60 mt-1">
              {monitoreosFiltrados.length} registro{monitoreosFiltrados.length !== 1 ? 's' : ''} encontrado{monitoreosFiltrados.length !== 1 ? 's' : ''}
            </p>
          </div>
          <Button
            onClick={() => setMostrarFiltros(!mostrarFiltros)}
            variant="outline"
            size="sm"
          >
            <Filter className="w-4 h-4 mr-2" />
            {mostrarFiltros ? 'Ocultar Filtros' : 'Mostrar Filtros'}
          </Button>
        </div>

        {/* Filtros */}
        {mostrarFiltros && (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 p-4 bg-[#F8FAF5] rounded-lg">
            <div>
              <Label htmlFor="filtro-lote">Lote</Label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <Input
                  id="filtro-lote"
                  value={filtroLote}
                  onChange={(e) => setFiltroLote(e.target.value)}
                  placeholder="Buscar lote..."
                  className="pl-9"
                />
              </div>
            </div>

            <div>
              <Label htmlFor="filtro-plaga">Plaga/Enfermedad</Label>
              <div className="relative">
                <Bug className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <Input
                  id="filtro-plaga"
                  value={filtroPlaga}
                  onChange={(e) => setFiltroPlaga(e.target.value)}
                  placeholder="Buscar plaga..."
                  className="pl-9"
                />
              </div>
            </div>

            <div>
              <Label htmlFor="filtro-fecha-desde">Desde</Label>
              <Input
                id="filtro-fecha-desde"
                type="date"
                value={filtroFechaDesde}
                onChange={(e) => setFiltroFechaDesde(e.target.value)}
              />
            </div>

            <div>
              <Label htmlFor="filtro-fecha-hasta">Hasta</Label>
              <Input
                id="filtro-fecha-hasta"
                type="date"
                value={filtroFechaHasta}
                onChange={(e) => setFiltroFechaHasta(e.target.value)}
              />
            </div>

            <div className="md:col-span-4 flex justify-end">
              <Button
                onClick={limpiarFiltros}
                variant="outline"
                size="sm"
              >
                <X className="w-4 h-4 mr-2" />
                Limpiar Filtros
              </Button>
            </div>
          </div>
        )}
      </Card>

      {/* Tabla */}
      <Card className="overflow-hidden">
        {/* Botones de Expandir/Colapsar Todo */}
        <div className="px-4 py-3 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
          <p className="text-sm text-[#4D240F]/70">
            Agrupado por semanas • {gruposSemanas.length} semana{gruposSemanas.length !== 1 ? 's' : ''}
          </p>
          <div className="flex gap-2">
            <Button
              onClick={expandirTodas}
              variant="ghost"
              size="sm"
              className="text-[#73991C] hover:text-[#5C7A16] hover:bg-[#73991C]/10"
            >
              <ChevronDown className="w-4 h-4 mr-1" />
              Expandir Todo
            </Button>
            <Button
              onClick={colapsarTodas}
              variant="ghost"
              size="sm"
              className="text-[#4D240F]/70 hover:text-[#4D240F] hover:bg-gray-100"
            >
              <ChevronUp className="w-4 h-4 mr-1" />
              Colapsar Todo
            </Button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gradient-to-r from-[#73991C]/10 to-[#BFD97D]/10">
              <tr>
                <th 
                  className="px-4 py-3 text-left text-[#172E08] cursor-pointer hover:bg-[#73991C]/10 transition-colors"
                  onClick={() => handleOrdenar('fecha_monitoreo')}
                >
                  <div className="flex items-center gap-2">
                    <Calendar className="w-4 h-4" />
                    Fecha
                    {renderIconoOrden('fecha_monitoreo')}
                  </div>
                </th>
                <th 
                  className="px-4 py-3 text-left text-[#172E08] cursor-pointer hover:bg-[#73991C]/10 transition-colors"
                  onClick={() => handleOrdenar('lote_nombre')}
                >
                  <div className="flex items-center gap-2">
                    <MapPin className="w-4 h-4" />
                    Lote
                    {renderIconoOrden('lote_nombre')}
                  </div>
                </th>
                <th 
                  className="px-4 py-3 text-left text-[#172E08] cursor-pointer hover:bg-[#73991C]/10 transition-colors"
                  onClick={() => handleOrdenar('sublote_nombre')}
                >
                  <div className="flex items-center gap-2">
                    Sublote
                    {renderIconoOrden('sublote_nombre')}
                  </div>
                </th>
                <th 
                  className="px-4 py-3 text-left text-[#172E08] cursor-pointer hover:bg-[#73991C]/10 transition-colors"
                  onClick={() => handleOrdenar('plaga_nombre')}
                >
                  <div className="flex items-center gap-2">
                    <Bug className="w-4 h-4" />
                    Plaga/Enfermedad
                    {renderIconoOrden('plaga_nombre')}
                  </div>
                </th>
                <th 
                  className="px-4 py-3 text-center text-[#172E08] text-xs cursor-pointer hover:bg-[#73991C]/10 transition-colors"
                  onClick={() => handleOrdenar('arboles_monitoreados')}
                >
                  <div className="flex items-center justify-center gap-1">
                    <span>Árboles<br/>Monitor.</span>
                    {renderIconoOrden('arboles_monitoreados')}
                  </div>
                </th>
                <th 
                  className="px-4 py-3 text-center text-[#172E08] text-xs cursor-pointer hover:bg-[#73991C]/10 transition-colors"
                  onClick={() => handleOrdenar('arboles_afectados')}
                >
                  <div className="flex items-center justify-center gap-1">
                    <span>Árboles<br/>Afectados</span>
                    {renderIconoOrden('arboles_afectados')}
                  </div>
                </th>
                <th 
                  className="px-4 py-3 text-center text-[#172E08] text-xs cursor-pointer hover:bg-[#73991C]/10 transition-colors"
                  onClick={() => handleOrdenar('individuos_encontrados')}
                >
                  <div className="flex items-center justify-center gap-1">
                    <span>Individuos<br/>Encontrados</span>
                    {renderIconoOrden('individuos_encontrados')}
                  </div>
                </th>
                <th 
                  className="px-4 py-3 text-center text-[#172E08] cursor-pointer hover:bg-[#73991C]/10 transition-colors"
                  onClick={() => handleOrdenar('incidencia')}
                >
                  <div className="flex items-center justify-center gap-1">
                    Incidencia
                    {renderIconoOrden('incidencia')}
                  </div>
                </th>
                <th 
                  className="px-4 py-3 text-center text-[#172E08] cursor-pointer hover:bg-[#73991C]/10 transition-colors"
                  onClick={() => handleOrdenar('severidad')}
                >
                  <div className="flex items-center justify-center gap-1">
                    Severidad
                    {renderIconoOrden('severidad')}
                  </div>
                </th>
                <th 
                  className="px-4 py-3 text-center text-[#172E08] cursor-pointer hover:bg-[#73991C]/10 transition-colors"
                  onClick={() => handleOrdenar('gravedad_numerica')}
                >
                  <div className="flex items-center justify-center gap-1">
                    Gravedad
                    {renderIconoOrden('gravedad_numerica')}
                  </div>
                </th>
                <th 
                  className="px-4 py-3 text-left text-[#172E08] cursor-pointer hover:bg-[#73991C]/10 transition-colors"
                  onClick={() => handleOrdenar('monitor')}
                >
                  <div className="flex items-center gap-2">
                    Monitor
                    {renderIconoOrden('monitor')}
                  </div>
                </th>
                <th className="px-4 py-3 text-left text-[#172E08]">
                  Observaciones
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {gruposSemanas.length === 0 ? (
                <tr>
                  <td colSpan={12} className="px-4 py-8 text-center text-[#4D240F]/60">
                    {monitoreos.length === 0 ? (
                      <>
                        <Bug className="w-12 h-12 mx-auto mb-3 text-gray-300" />
                        <p className="mb-2">No hay registros de monitoreo</p>
                        <p className="text-sm">Carga datos usando el botón "Cargar CSV" en el dashboard</p>
                      </>
                    ) : (
                      'No hay resultados con los filtros aplicados'
                    )}
                  </td>
                </tr>
              ) : (
                gruposSemanas.map((grupo) => {
                  const key = `${grupo.año}-S${grupo.semana}`;
                  const isExpanded = semanasExpandidas.has(key);

                  return (
                    <>
                      {/* HEADER DE SEMANA - Clickeable */}
                      <tr
                        key={`header-${key}`}
                        className="bg-gradient-to-r from-[#73991C]/5 to-[#BFD97D]/5 hover:from-[#73991C]/10 hover:to-[#BFD97D]/10 cursor-pointer transition-colors border-y-2 border-[#73991C]/20"
                        onClick={() => toggleSemana(key)}
                      >
                        <td colSpan={12} className="px-4 py-4">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-4">
                              {/* Icono de expandir/colapsar */}
                              <div className="w-6 h-6 flex items-center justify-center rounded-full bg-[#73991C]/10">
                                {isExpanded ? (
                                  <ChevronUp className="w-4 h-4 text-[#73991C]" />
                                ) : (
                                  <ChevronDown className="w-4 h-4 text-[#73991C]" />
                                )}
                              </div>

                              {/* Info de la semana */}
                              <div>
                                <h4 className="text-[#172E08] flex items-center gap-2">
                                  <Calendar className="w-4 h-4 text-[#73991C]" />
                                  <span>Semana {grupo.semana} • {grupo.año}</span>
                                </h4>
                                <p className="text-sm text-[#4D240F]/60 mt-0.5">
                                  {new Date(grupo.fechaInicio).toLocaleDateString('es-CO', { day: 'numeric', month: 'short' })}
                                  {' - '}
                                  {new Date(grupo.fechaFin).toLocaleDateString('es-CO', { day: 'numeric', month: 'short', year: 'numeric' })}
                                </p>
                              </div>
                            </div>

                            {/* Badge con cantidad de registros */}
                            <div className="flex items-center gap-3">
                              <span className="px-3 py-1 bg-[#73991C] text-white rounded-full text-sm">
                                {grupo.totalRegistros} registro{grupo.totalRegistros !== 1 ? 's' : ''}
                              </span>
                              <span className="text-xs text-[#4D240F]/40">
                                {isExpanded ? 'Clic para colapsar' : 'Clic para expandir'}
                              </span>
                            </div>
                          </div>
                        </td>
                      </tr>

                      {/* FILAS DE DATOS - Colapsables */}
                      {isExpanded && grupo.registros.map((m) => (
                        <tr key={m.id} className="hover:bg-[#F8FAF5]/50 transition-colors">
                          <td className="px-4 py-3 text-sm pl-16">
                            {new Date(m.fecha_monitoreo).toLocaleDateString('es-CO', {
                              year: 'numeric',
                              month: 'short',
                              day: 'numeric'
                            })}
                          </td>
                          <td className="px-4 py-3 text-sm text-[#172E08]">
                            {m.lote_nombre}
                          </td>
                          <td className="px-4 py-3 text-sm text-[#4D240F]/70">
                            {m.sublote_nombre}
                          </td>
                          <td className="px-4 py-3 text-sm text-[#172E08]">
                            {m.plaga_nombre}
                          </td>
                          <td className="px-4 py-3 text-center text-sm">
                            <span className="font-medium">{m.arboles_monitoreados}</span>
                          </td>
                          <td className="px-4 py-3 text-center text-sm">
                            <span className="font-medium">{m.arboles_afectados}</span>
                          </td>
                          <td className="px-4 py-3 text-center text-sm">
                            <span className="font-medium">{m.individuos_encontrados}</span>
                          </td>
                          <td className="px-4 py-3 text-center text-sm">
                            <span className="font-medium">{m.incidencia}%</span>
                          </td>
                          <td className="px-4 py-3 text-center text-sm">
                            <span className="font-medium">{m.severidad}</span>
                          </td>
                          <td className="px-4 py-3 text-center">
                            <span className={`inline-block px-2 py-1 rounded-full text-xs border ${getGravedadColor(m.gravedad_texto)}`}>
                              {m.gravedad_texto || 'N/A'}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-sm text-[#4D240F]/70 max-w-xs truncate">
                            {m.monitor || '-'}
                          </td>
                          <td className="px-4 py-3 text-sm text-[#4D240F]/70 max-w-xs truncate">
                            {m.observaciones || '-'}
                          </td>
                        </tr>
                      ))}
                    </>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Paginación */}
      {totalPaginas > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-[#4D240F]/60">
            Mostrando {indiceInicio + 1} - {Math.min(indiceFin, monitoreosFiltrados.length)} de {monitoreosFiltrados.length}
          </p>
          <div className="flex gap-2">
            <Button
              onClick={() => setPaginaActual(p => Math.max(1, p - 1))}
              disabled={paginaActual === 1}
              variant="outline"
              size="sm"
            >
              Anterior
            </Button>
            <div className="flex items-center gap-2 px-4">
              <span className="text-sm text-[#4D240F]/60">
                Página {paginaActual} de {totalPaginas}
              </span>
            </div>
            <Button
              onClick={() => setPaginaActual(p => Math.min(totalPaginas, p + 1))}
              disabled={paginaActual === totalPaginas}
              variant="outline"
              size="sm"
            >
              Siguiente
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}