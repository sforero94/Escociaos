import { Card } from '../ui/card';
import { Button } from '../ui/button';
import { Label } from '../ui/label';
import { toast } from 'sonner';
import { CatalogoPlagas } from './CatalogoPlagas';
import { CargaCSV } from './CargaCSV';
import { TablaMonitoreos } from './TablaMonitoreos';
import { RegistroMonitoreo } from './RegistroMonitoreo';
import { MonitoreoSubNav } from './MonitoreoSubNav';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../ui/tabs';
import { MapaCalorIncidencias } from './MapaCalorIncidencias';
import { 
  Bug,
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  Calendar,
  BarChart3,
  CheckCircle2,
  XCircle,
  Table,
  Download,
  Upload,
  Settings,
  Filter,
  Camera,
  ChevronUp,
  ChevronDown,
  Plus
} from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { getSupabase } from '../../utils/supabase/client';
import { formatearFechaCorta } from '../../utils/fechas';

// ============================================
// INTERFACES
// ============================================

interface UltimoMonitoreo {
  fechaInicio: string;
  fechaFin: string;
  incidenciaPromedio: number;
  incidenciaAnterior: number;
  plagasCriticas: { nombre: string; sublotes: number; incidenciaMax: number }[];
  plagasControladas: { nombre: string; incidenciaAnterior: number; incidenciaActual: number }[];
}

interface TendenciaData {
  semana?: string;               // LEGACY: Mantener para compatibilidad
  ocurrencia?: string;           // NUEVO: "Ocurrencia 1", "Ocurrencia 2", etc.
  fechaInicio?: string;          // NUEVO: Fecha más temprana de la ocurrencia
  fechaFin?: string;             // NUEVO: Fecha más tardía de la ocurrencia
  [plagaNombre: string]: number | string | undefined;
}

interface Insight {
  tipo: 'alerta' | 'alivio';
  lote: string;
  plaga: string;
  incidenciaAnterior: number;
  incidenciaActual: number;
}

interface PlagaCritica {
  plaga: string;
  lotes: {
    lote: string;
    incidenciaActual: number;
    incidenciaAnterior: number;
    tendencia: 'up' | 'down' | 'stable';
  }[];
}

type RangoPeriodo = 'semana' | 'mes' | 'trimestre' | 'todo';
type FiltroPlaga = 'interes' | 'cuarentenarias' | 'todos' | 'personalizar';

// Plagas de interés predefinidas
const PLAGAS_INTERES = [
  'Monalonion',
  'Ácaro',
  'Huevos de Ácaro',
  'Ácaro Cristalino',
  'Cucarrón marceño',
  'Trips'
];

// Plagas cuarentenarias
const PLAGAS_CUARENTENARIAS = [
  'Picudo',
  'Stenoma Catenifer',
  'Heilipus Lauri'
];

// ============================================
// COMPONENTE PRINCIPAL
// ============================================

export function MonitoreoDashboardV2() {
  const supabase = getSupabase();
  const navigate = useNavigate();

  // Estados
  const [isLoading, setIsLoading] = useState(true);
  const [ultimoMonitoreo, setUltimoMonitoreo] = useState<UltimoMonitoreo | null>(null);
  const [tendencias, setTendencias] = useState<TendenciaData[]>([]);
  const [insights, setInsights] = useState<Insight[]>([]);
  const [plagasCriticas, setPlagasCriticas] = useState<PlagaCritica[]>([]);
  
  // Selectores
  const [rangoSeleccionado, setRangoSeleccionado] = useState<RangoPeriodo>('mes');
  const [filtroPlaga, setFiltroPlaga] = useState<FiltroPlaga>('interes');
  const [plagasSeleccionadas, setPlagasSeleccionadas] = useState<string[]>([]);
  const [catalogoPlagas, setCatalogoPlagas] = useState<{ id: string; nombre: string }[]>([]);
  const [modoVisualizacion, setModoVisualizacion] = useState<'ultimo' | 'ultimos3' | 'ultimos6'>('ultimo');
  
  // UI
  const [plagasExpandidas, setPlagasExpandidas] = useState<Set<string>>(new Set());
  const [mostrarTablaCompleta, setMostrarTablaCompleta] = useState(false);
  const [mostrarCatalogo, setMostrarCatalogo] = useState(false);
  const [mostrarRegistroMonitoreo, setMostrarRegistroMonitoreo] = useState(false);
  const graficoRef = useRef<HTMLDivElement>(null);

  // Pestañas y mapa de calor
  const [tabActiva, setTabActiva] = useState<'general' | 'mapa-calor'>('general');
  const [monitoreosCargados, setMonitoreosCargados] = useState<any[]>([]);

  // ============================================
  // CARGAR DATOS INICIALES
  // ============================================

  // Cargar todos los datos al montar el componente
  useEffect(() => {
    cargarDatos();
  }, []);

  // Recargar insights y plagas críticas cuando cambia el período de comparación
  useEffect(() => {
    if (!isLoading) {
      cargarInsights();
      cargarPlagasCriticas();
    }
  }, [rangoSeleccionado]);

  // Recargar tendencias cuando cambian los filtros de plagas o modo de visualización
  useEffect(() => {
    if (filtroPlaga === 'todos' || filtroPlaga === 'interes' || filtroPlaga === 'cuarentenarias') {
      cargarTendencias();
    }
  }, [filtroPlaga, plagasSeleccionadas, modoVisualizacion]);

  async function cargarDatos() {
    setIsLoading(true);
    try {
      await Promise.all([
        cargarCatalogoPlagas(),
        cargarUltimoMonitoreo(),
        cargarTendencias(),
        cargarInsights(),
        cargarPlagasCriticas()
      ]);
    } catch (error) {
      toast.error('Error al cargar el dashboard');
    } finally {
      setIsLoading(false);
    }
  }

  // ============================================
  // 1. ÚLTIMO MONITOREO
  // ============================================

  async function cargarUltimoMonitoreo() {
    try {

      // Obtener todos los monitoreos con lotes
      const { data: monitoreos, error } = await supabase
        .from('monitoreos')
        .select(`
          id,
          fecha_monitoreo,
          lote_id,
          sublote_id,
          plaga_enfermedad_id,
          incidencia,
          lotes!inner(nombre),
          sublotes(nombre),
          plagas_enfermedades_catalogo!inner(nombre)
        `)
        .order('fecha_monitoreo', { ascending: false })
        .limit(2000);

      if (error) throw error;
      if (!monitoreos || monitoreos.length === 0) {
        setUltimoMonitoreo(null);
        return;
      }

      // Agrupar por lote y obtener fecha más reciente de cada lote
      const lotesFechas: { [loteId: string]: string } = {};
      monitoreos.forEach(m => {
        if (!lotesFechas[m.lote_id] || m.fecha_monitoreo > lotesFechas[m.lote_id]) {
          lotesFechas[m.lote_id] = m.fecha_monitoreo;
        }
      });

      // Filtrar solo los monitoreos del último monitoreo de cada lote
      const monitoreosUltimos = monitoreos.filter(m => 
        lotesFechas[m.lote_id] === m.fecha_monitoreo
      );

      // Calcular rango de fechas
      const fechas = monitoreosUltimos.map(m => m.fecha_monitoreo).sort();
      const fechaInicio = fechas[0];
      const fechaFin = fechas[fechas.length - 1];

      // Calcular incidencia promedio
      const incidenciaPromedio = monitoreosUltimos.reduce((sum, m) => sum + (m.incidencia || 0), 0) / monitoreosUltimos.length;

      // Obtener monitoreo anterior para comparación
      const fechasAnteriores = Object.values(lotesFechas);
      const segundaFechaMasReciente = [...new Set(monitoreos.map(m => m.fecha_monitoreo))]
        .filter(f => !fechasAnteriores.includes(f))
        .sort()
        .reverse()[0];

      const monitoreosAnteriores = segundaFechaMasReciente
        ? monitoreos.filter(m => m.fecha_monitoreo === segundaFechaMasReciente)
        : [];

      const incidenciaAnterior = monitoreosAnteriores.length > 0
        ? monitoreosAnteriores.reduce((sum, m) => sum + (m.incidencia || 0), 0) / monitoreosAnteriores.length
        : 0;

      // Plagas críticas: >30% en 2+ sublotes
      const plagasPorSublote: { [plagaId: string]: { nombre: string; sublotes: Set<string>; incidencias: number[] } } = {};
      
      monitoreosUltimos.forEach(m => {
        if ((m.incidencia || 0) > 30) {
          if (!plagasPorSublote[m.plaga_enfermedad_id]) {
            plagasPorSublote[m.plaga_enfermedad_id] = {
              nombre: (m.plagas_enfermedades_catalogo as any).nombre,
              sublotes: new Set(),
              incidencias: []
            };
          }
          plagasPorSublote[m.plaga_enfermedad_id].sublotes.add(m.sublote_id || m.lote_id);
          plagasPorSublote[m.plaga_enfermedad_id].incidencias.push(m.incidencia || 0);
        }
      });

      const plagasCriticas = Object.values(plagasPorSublote)
        .filter(p => p.sublotes.size >= 2)
        .map(p => ({
          nombre: p.nombre,
          sublotes: p.sublotes.size,
          incidenciaMax: Math.max(...p.incidencias)
        }));

      // Plagas controladas: estaba >10% antes y ahora está <10%
      const plagasControladas: { nombre: string; incidenciaAnterior: number; incidenciaActual: number }[] = [];
      
      const plagasActuales: { [plagaId: string]: { nombre: string; incidencia: number } } = {};
      monitoreosUltimos.forEach(m => {
        if (!plagasActuales[m.plaga_enfermedad_id]) {
          plagasActuales[m.plaga_enfermedad_id] = {
            nombre: (m.plagas_enfermedades_catalogo as any).nombre,
            incidencia: 0
          };
        }
        plagasActuales[m.plaga_enfermedad_id].incidencia += (m.incidencia || 0);
      });

      const plagasAnteriores: { [plagaId: string]: number } = {};
      monitoreosAnteriores.forEach(m => {
        if (!plagasAnteriores[m.plaga_enfermedad_id]) {
          plagasAnteriores[m.plaga_enfermedad_id] = 0;
        }
        plagasAnteriores[m.plaga_enfermedad_id] += (m.incidencia || 0);
      });

      Object.entries(plagasActuales).forEach(([plagaId, data]) => {
        const incActual = data.incidencia / monitoreosUltimos.filter(m => m.plaga_enfermedad_id === plagaId).length;
        const incAnt = plagasAnteriores[plagaId] 
          ? plagasAnteriores[plagaId] / monitoreosAnteriores.filter(m => m.plaga_enfermedad_id === plagaId).length
          : 0;

        // Plaga controlada: estaba >10% antes y ahora está <10%
        if (incAnt > 10 && incActual < 10) {
          plagasControladas.push({
            nombre: data.nombre,
            incidenciaAnterior: incAnt,
            incidenciaActual: incActual
          });
        }
      });

      setUltimoMonitoreo({
        fechaInicio,
        fechaFin,
        incidenciaPromedio,
        incidenciaAnterior,
        plagasCriticas,
        plagasControladas
      });

    } catch (error) {
    }
  }

  // ============================================
  // 2. CATÁLOGO DE PLAGAS
  // ============================================

  async function cargarCatalogoPlagas() {
    try {
      const { data, error } = await supabase
        .from('plagas_enfermedades_catalogo')
        .select('id, nombre')
        .eq('activo', true)
        .order('nombre');

      if (error) throw error;

      setCatalogoPlagas(data || []);
    } catch (error) {
    }
  }

  // ============================================
  // 3. GRÁFICA DE TENDENCIAS
  // ============================================

  async function cargarTendencias() {
    try {

      // Cargar TODOS los monitoreos disponibles (sin límite de período)
      const fechaFin = new Date();
      const fechaInicio = new Date('1900-01-01'); // Sin límite de fecha inicial

      // Determinar qué plagas filtrar
      let plagasAFiltrar: string[] = [];
      
      if (filtroPlaga === 'interes') {
        // Buscar IDs de plagas de interés
        const plagasInteresData = catalogoPlagas.filter(p => 
          PLAGAS_INTERES.some(nombre => p.nombre.toLowerCase().includes(nombre.toLowerCase()))
        );
        plagasAFiltrar = plagasInteresData.map(p => p.id);
      } else if (filtroPlaga === 'cuarentenarias') {
        // Buscar IDs de plagas cuarentenarias
        const plagasCuarentenariasData = catalogoPlagas.filter(p => 
          PLAGAS_CUARENTENARIAS.some(nombre => p.nombre.toLowerCase().includes(nombre.toLowerCase()))
        );
        plagasAFiltrar = plagasCuarentenariasData.map(p => p.id);
      } else if (filtroPlaga === 'personalizar') {
        plagasAFiltrar = plagasSeleccionadas;
      }
      // Si es 'todos', no filtramos

      // Query con paginación
      const BATCH_SIZE = 1000;
      let allData: any[] = [];
      let currentOffset = 0;
      let hasMore = true;

      while (hasMore && allData.length < 5000) {
        let query = supabase
          .from('monitoreos')
          .select(`
            *,
            plagas_enfermedades_catalogo!inner(nombre),
            sublotes!inner(nombre, lote_id),
            lotes!inner(nombre)
          `)
          .gte('fecha_monitoreo', fechaInicio.toISOString().split('T')[0])
          .lte('fecha_monitoreo', fechaFin.toISOString().split('T')[0])
          .order('fecha_monitoreo', { ascending: true })
          .range(currentOffset, currentOffset + BATCH_SIZE - 1);

        // Aplicar filtro de plagas si corresponde
        if (plagasAFiltrar.length > 0) {
          query = query.in('plaga_enfermedad_id', plagasAFiltrar);
        }

        const { data, error } = await query;

        if (error) throw error;

        if (data && data.length > 0) {
          allData = [...allData, ...data];
          currentOffset += BATCH_SIZE;
          hasMore = data.length === BATCH_SIZE;
        } else {
          hasMore = false;
        }
      }

      // Guardar monitoreos para el mapa de calor
      setMonitoreosCargados(allData);

      // PASO 1: Identificar todas las fechas únicas de monitoreo
      const fechasUnicasSet = new Set<string>();
      allData.forEach(m => {
        fechasUnicasSet.add(m.fecha_monitoreo);
      });

      // PASO 2: Ordenar fechas cronológicamente (más antigua a más reciente)
      const fechasOrdenadas = Array.from(fechasUnicasSet).sort((a, b) =>
        new Date(a).getTime() - new Date(b).getTime()
      );

      // PASO 3: Tomar las últimas N fechas según el modo
      const numOcurrencias = modoVisualizacion === 'ultimo' ? 1 :
                            modoVisualizacion === 'ultimos3' ? 3 : 6;
      const fechasSeleccionadas = fechasOrdenadas.slice(-numOcurrencias);

      // PASO 4: Para cada fecha (ocurrencia), agrupar y calcular promedios
      const datosFormateados: TendenciaData[] = fechasSeleccionadas.map((fecha, index) => {
        const monitoreosDeEstaFecha = allData.filter(m => m.fecha_monitoreo === fecha);

        // Agrupar por plaga y calcular promedio
        const promediosPorPlaga: { [plaga: string]: number } = {};
        const conteosPorPlaga: { [plaga: string]: number } = {};

        monitoreosDeEstaFecha.forEach(m => {
          const plagaNombre = (m.plagas_enfermedades_catalogo as any).nombre;
          const incidencia = parseFloat(m.incidencia) || 0;

          if (!promediosPorPlaga[plagaNombre]) {
            promediosPorPlaga[plagaNombre] = 0;
            conteosPorPlaga[plagaNombre] = 0;
          }

          promediosPorPlaga[plagaNombre] += incidencia;
          conteosPorPlaga[plagaNombre] += 1;
        });

        // Calcular promedios finales
        Object.keys(promediosPorPlaga).forEach(plaga => {
          promediosPorPlaga[plaga] = Math.round((promediosPorPlaga[plaga] / conteosPorPlaga[plaga]) * 10) / 10;
        });

        return {
          ocurrencia: `Ocurrencia ${index + 1}`,
          fechaInicio: fecha,
          fechaFin: fecha,
          ...promediosPorPlaga
        };
      });

      setTendencias(datosFormateados);
    } catch (error) {
    }
  }

  // ============================================
  // 4. INSIGHTS AUTOMÁTICOS
  // ============================================

  async function cargarInsights() {
    try {

      // Calcular fechas según período
      const fechaFin = new Date();
      let fechaInicio = new Date();
      let fechaInicioAnterior = new Date();

      switch (rangoSeleccionado) {
        case 'semana':
          fechaInicio.setDate(fechaFin.getDate() - 7);
          fechaInicioAnterior.setDate(fechaFin.getDate() - 14);
          break;
        case 'mes':
          fechaInicio.setDate(fechaFin.getDate() - 30);
          fechaInicioAnterior.setDate(fechaFin.getDate() - 60);
          break;
        case 'trimestre':
          fechaInicio.setDate(fechaFin.getDate() - 90);
          fechaInicioAnterior.setDate(fechaFin.getDate() - 180);
          break;
        case 'todo':
          // No generar insights para "todo"
          setInsights([]);
          return;
      }

      // Cargar datos del período actual y anterior
      const { data: datosActuales, error: error1 } = await supabase
        .from('monitoreos')
        .select(`
          lote_id,
          plaga_enfermedad_id,
          incidencia,
          lotes!inner(nombre),
          plagas_enfermedades_catalogo!inner(nombre)
        `)
        .gte('fecha_monitoreo', fechaInicio.toISOString().split('T')[0])
        .lte('fecha_monitoreo', fechaFin.toISOString().split('T')[0])
        .limit(5000);

      const { data: datosAnteriores, error: error2 } = await supabase
        .from('monitoreos')
        .select(`
          lote_id,
          plaga_enfermedad_id,
          incidencia,
          lotes!inner(nombre),
          plagas_enfermedades_catalogo!inner(nombre)
        `)
        .gte('fecha_monitoreo', fechaInicioAnterior.toISOString().split('T')[0])
        .lt('fecha_monitoreo', fechaInicio.toISOString().split('T')[0])
        .limit(5000);

      if (error1 || error2) throw error1 || error2;

      // Agrupar por lote y plaga
      const agruparDatos = (datos: any[]) => {
        const agrupado: { [key: string]: { sum: number; count: number; lote: string; plaga: string } } = {};
        datos?.forEach(m => {
          const key = `${m.lote_id}_${m.plaga_enfermedad_id}`;
          if (!agrupado[key]) {
            agrupado[key] = {
              sum: 0,
              count: 0,
              lote: (m.lotes as any).nombre,
              plaga: (m.plagas_enfermedades_catalogo as any).nombre
            };
          }
          agrupado[key].sum += m.incidencia || 0;
          agrupado[key].count += 1;
        });
        return agrupado;
      };

      const actuales = agruparDatos(datosActuales || []);
      const anteriores = agruparDatos(datosAnteriores || []);

      // Generar insights
      const insightsGenerados: Insight[] = [];

      Object.entries(actuales).forEach(([key, dataActual]) => {
        const dataAnterior = anteriores[key];
        if (!dataAnterior) return;

        const incidenciaActual = dataActual.sum / dataActual.count;
        const incidenciaAnterior = dataAnterior.sum / dataAnterior.count;

        // ALERTA: Aumento que lleva sobre 20%
        if (incidenciaAnterior < 20 && incidenciaActual >= 20) {
          insightsGenerados.push({
            tipo: 'alerta',
            lote: dataActual.lote,
            plaga: dataActual.plaga,
            incidenciaAnterior: Math.round(incidenciaAnterior * 10) / 10,
            incidenciaActual: Math.round(incidenciaActual * 10) / 10
          });
        }

        // ALIVIO: Reducción que regresa por debajo de 10% (si estaba >15%)
        if (incidenciaAnterior >= 15 && incidenciaActual < 10) {
          insightsGenerados.push({
            tipo: 'alivio',
            lote: dataActual.lote,
            plaga: dataActual.plaga,
            incidenciaAnterior: Math.round(incidenciaAnterior * 10) / 10,
            incidenciaActual: Math.round(incidenciaActual * 10) / 10
          });
        }
      });

      setInsights(insightsGenerados);
    } catch (error) {
    }
  }

  // ============================================
  // 5. PLAGAS CRÍTICAS
  // ============================================

  async function cargarPlagasCriticas() {
    try {

      // Calcular fechas según período
      const fechaFin = new Date();
      let fechaInicio = new Date();
      let fechaInicioAnterior = new Date();

      switch (rangoSeleccionado) {
        case 'semana':
          fechaInicio.setDate(fechaFin.getDate() - 7);
          fechaInicioAnterior.setDate(fechaFin.getDate() - 14);
          break;
        case 'mes':
          fechaInicio.setDate(fechaFin.getDate() - 30);
          fechaInicioAnterior.setDate(fechaFin.getDate() - 60);
          break;
        case 'trimestre':
          fechaInicio.setDate(fechaFin.getDate() - 90);
          fechaInicioAnterior.setDate(fechaFin.getDate() - 180);
          break;
        case 'todo':
          fechaInicio = new Date('1900-01-01');
          fechaInicioAnterior = new Date('1900-01-01');
          break;
      }

      // Cargar datos actuales
      const { data: datosActuales, error: error1 } = await supabase
        .from('monitoreos')
        .select(`
          lote_id,
          plaga_enfermedad_id,
          incidencia,
          lotes!inner(nombre),
          plagas_enfermedades_catalogo!inner(nombre)
        `)
        .gte('fecha_monitoreo', fechaInicio.toISOString().split('T')[0])
        .lte('fecha_monitoreo', fechaFin.toISOString().split('T')[0])
        .limit(5000);

      // Cargar datos anteriores (solo si no es 'todo')
      let datosAnteriores: any[] = [];
      if (rangoSeleccionado !== 'todo') {
        const { data, error } = await supabase
          .from('monitoreos')
          .select(`
            lote_id,
            plaga_enfermedad_id,
            incidencia,
            lotes!inner(nombre),
            plagas_enfermedades_catalogo!inner(nombre)
          `)
          .gte('fecha_monitoreo', fechaInicioAnterior.toISOString().split('T')[0])
          .lt('fecha_monitoreo', fechaInicio.toISOString().split('T')[0])
          .limit(5000);
        
        if (!error) datosAnteriores = data || [];
      }

      if (error1) throw error1;

      // Agrupar por plaga y lote
      const plagasLotes: { 
        [plagaNombre: string]: { 
          [loteNombre: string]: { 
            actual: number[]; 
            anterior: number[] 
          } 
        } 
      } = {};

      datosActuales?.forEach(m => {
        const plaga = (m.plagas_enfermedades_catalogo as any).nombre;
        const lote = (m.lotes as any).nombre;
        
        if (!plagasLotes[plaga]) plagasLotes[plaga] = {};
        if (!plagasLotes[plaga][lote]) plagasLotes[plaga][lote] = { actual: [], anterior: [] };
        
        plagasLotes[plaga][lote].actual.push(m.incidencia || 0);
      });

      datosAnteriores?.forEach(m => {
        const plaga = (m.plagas_enfermedades_catalogo as any).nombre;
        const lote = (m.lotes as any).nombre;
        
        if (!plagasLotes[plaga]) plagasLotes[plaga] = {};
        if (!plagasLotes[plaga][lote]) plagasLotes[plaga][lote] = { actual: [], anterior: [] };
        
        plagasLotes[plaga][lote].anterior.push(m.incidencia || 0);
      });

      // Filtrar plagas críticas (incidencia >30% en al menos un lote)
      const criticas: PlagaCritica[] = [];

      Object.entries(plagasLotes).forEach(([plaga, lotes]) => {
        const lotesData: PlagaCritica['lotes'] = [];
        let tieneCritico = false;

        Object.entries(lotes).forEach(([lote, data]) => {
          const incidenciaActual = data.actual.length > 0
            ? data.actual.reduce((a, b) => a + b, 0) / data.actual.length
            : 0;
          
          const incidenciaAnterior = data.anterior.length > 0
            ? data.anterior.reduce((a, b) => a + b, 0) / data.anterior.length
            : 0;

          if (incidenciaActual > 30) {
            tieneCritico = true;
          }

          let tendencia: 'up' | 'down' | 'stable' = 'stable';
          if (incidenciaActual > incidenciaAnterior + 5) tendencia = 'up';
          else if (incidenciaActual < incidenciaAnterior - 5) tendencia = 'down';

          lotesData.push({
            lote,
            incidenciaActual: Math.round(incidenciaActual * 10) / 10,
            incidenciaAnterior: Math.round(incidenciaAnterior * 10) / 10,
            tendencia
          });
        });

        if (tieneCritico) {
          criticas.push({
            plaga,
            lotes: lotesData.sort((a, b) => b.incidenciaActual - a.incidenciaActual)
          });
        }
      });

      setPlagasCriticas(criticas.sort((a, b) => 
        Math.max(...b.lotes.map(l => l.incidenciaActual)) - Math.max(...a.lotes.map(l => l.incidenciaActual))
      ));

    } catch (error) {
    }
  }

  // ============================================
  // FUNCIONES AUXILIARES
  // ============================================

  function getNumeroSemana(fecha: Date): number {
    const d = new Date(Date.UTC(fecha.getFullYear(), fecha.getMonth(), fecha.getDate()));
    const dayNum = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    return Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  }

  // Removed - now using formatearFechaCorta from utils/fechas

  function togglePlaga(plaga: string) {
    setPlagasExpandidas(prev => {
      const nuevo = new Set(prev);
      if (nuevo.has(plaga)) {
        nuevo.delete(plaga);
      } else {
        nuevo.add(plaga);
      }
      return nuevo;
    });
  }

  async function exportarGrafico() {
    // TODO: Implementar exportación con html2canvas
    toast.info('Funcionalidad de exportar gráfico próximamente disponible');
  }

  // ============================================
  // RENDER
  // ============================================

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-primary border-r-transparent mb-4"></div>
          <p className="text-brand-brown/70">Cargando dashboard...</p>
        </div>
      </div>
    );
  }

  // Obtener plagas únicas del gráfico para la leyenda
  const plagasEnGrafico = tendencias.length > 0
    ? Object.keys(tendencias[0]).filter(k => k !== 'semana' && k !== 'ocurrencia' && k !== 'fechaInicio' && k !== 'fechaFin')
    : [];

  // Custom tick component for X-axis
  const CustomAxisTick = ({ x, y, payload }: any) => {
    const punto = tendencias.find(t => t.ocurrencia === payload.value);
    if (!punto) return null;

    const fechaTexto = punto.fechaInicio === punto.fechaFin
      ? formatearFechaCorta(punto.fechaInicio || '')
      : `${formatearFechaCorta(punto.fechaInicio || '')} - ${formatearFechaCorta(punto.fechaFin || '')}`;

    return (
      <g transform={`translate(${x},${y})`}>
        <text x={0} y={0} dy={16} textAnchor="middle" className="text-xs fill-brand-brown">
          {payload.value}
        </text>
        <text x={0} y={16} dy={16} textAnchor="middle" className="text-[10px] fill-gray-500">
          {fechaTexto}
        </text>
      </g>
    );
  };

  const COLORES_PLAGAS = [
    '#73991C', // Verde aguacate
    '#E74C3C', // Rojo
    '#3498DB', // Azul
    '#F39C12', // Naranja
    '#9B59B6', // Púrpura
    '#1ABC9C', // Turquesa
    '#E67E22', // Naranja oscuro
    '#34495E', // Gris azulado
    '#16A085', // Verde azulado
    '#C0392B', // Rojo oscuro
  ];

  return (
    <div className="space-y-6">
      {/* SubNav de Monitoreo */}
      <MonitoreoSubNav />
      
      {/* Header del Tablero */}
      <div>
        <h2 className="text-2xl text-foreground mb-2">Tablero de Monitoreo</h2>
        <p className="text-sm text-brand-brown/70">
          Análisis de tendencias e insights automáticos
        </p>
      </div>
      
      {/* ============================================ */}
      {/* MODAL DE REGISTRO DE MONITOREO */}
      {/* ============================================ */}
      
      <RegistroMonitoreo
        open={mostrarRegistroMonitoreo}
        onClose={() => setMostrarRegistroMonitoreo(false)}
        onSuccess={() => cargarDatos()}
      />

      {/* ============================================ */}
      {/* TABLA COMPLETA DE MONITOREOS (CONDICIONAL) */}
      {/* ============================================ */}
      
      {mostrarTablaCompleta && (
        <div className="animate-in fade-in duration-300">
          <TablaMonitoreos />
        </div>
      )}

      {/* ============================================ */}
      {/* CATÁLOGO DE PLAGAS (CONDICIONAL) */}
      {/* ============================================ */}
      
      {mostrarCatalogo && (
        <div className="animate-in fade-in duration-300">
          <CatalogoPlagas />
        </div>
      )}

      {/* Mostrar el resto del dashboard solo si no hay tabla ni catálogo activos */}
      {!mostrarTablaCompleta && !mostrarCatalogo && (
        <>
          {/* ============================================ */}
          {/* FILTROS GLOBALES */}
          {/* ============================================ */}

          <Card className="p-6">
            <h3 className="text-sm font-medium text-foreground mb-4">Filtros de Visualización</h3>

            {/* Fila 1: Modo de Ocurrencias */}
            <div className="mb-4">
              <Label className="text-xs text-brand-brown/70 mb-2 block">Rango de Monitoreos</Label>
              <div className="flex gap-2">
                <Button
                  onClick={() => setModoVisualizacion('ultimo')}
                  variant={modoVisualizacion === 'ultimo' ? 'default' : 'outline'}
                  size="sm"
                  className={modoVisualizacion === 'ultimo' ? 'bg-primary hover:bg-primary-dark' : ''}
                >
                  Último monitoreo
                </Button>
                <Button
                  onClick={() => setModoVisualizacion('ultimos3')}
                  variant={modoVisualizacion === 'ultimos3' ? 'default' : 'outline'}
                  size="sm"
                  className={modoVisualizacion === 'ultimos3' ? 'bg-primary hover:bg-primary-dark' : ''}
                >
                  Últimos 3 monitoreos
                </Button>
                <Button
                  onClick={() => setModoVisualizacion('ultimos6')}
                  variant={modoVisualizacion === 'ultimos6' ? 'default' : 'outline'}
                  size="sm"
                  className={modoVisualizacion === 'ultimos6' ? 'bg-primary hover:bg-primary-dark' : ''}
                >
                  Últimos 6 monitoreos
                </Button>
              </div>
            </div>

            {/* Fila 2: Filtro de Plagas */}
            <div>
              <Label className="text-xs text-brand-brown/70 mb-2 block">Plagas a Visualizar</Label>
              <div className="flex gap-2 flex-wrap">
                <Button
                  onClick={() => setFiltroPlaga('interes')}
                  variant={filtroPlaga === 'interes' ? 'default' : 'outline'}
                  size="sm"
                  className={filtroPlaga === 'interes' ? 'bg-primary hover:bg-primary-dark' : ''}
                >
                  Plagas de Interés
                </Button>
                <Button
                  onClick={() => setFiltroPlaga('cuarentenarias')}
                  variant={filtroPlaga === 'cuarentenarias' ? 'default' : 'outline'}
                  size="sm"
                  className={filtroPlaga === 'cuarentenarias' ? 'bg-primary hover:bg-primary-dark' : ''}
                >
                  Plagas Cuarentenarias
                </Button>
                <Button
                  onClick={() => setFiltroPlaga('todos')}
                  variant={filtroPlaga === 'todos' ? 'default' : 'outline'}
                  size="sm"
                  className={filtroPlaga === 'todos' ? 'bg-primary hover:bg-primary-dark' : ''}
                >
                  Todas
                </Button>
                <Button
                  onClick={() => setFiltroPlaga('personalizar')}
                  variant={filtroPlaga === 'personalizar' ? 'default' : 'outline'}
                  size="sm"
                  className={filtroPlaga === 'personalizar' ? 'bg-primary hover:bg-primary-dark' : ''}
                >
                  <Filter className="w-4 h-4 mr-1" />
                  Personalizar
                </Button>
              </div>

              {/* Selector personalizado de plagas */}
              {filtroPlaga === 'personalizar' && (
                <div className="mt-4 p-4 bg-background rounded-lg">
                  <Label className="mb-2 block">Seleccionar plagas:</Label>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                    {catalogoPlagas.map(plaga => (
                      <label key={plaga.id} className="flex items-center gap-2 text-sm cursor-pointer hover:bg-white p-2 rounded transition-colors">
                        <input
                          type="checkbox"
                          checked={plagasSeleccionadas.includes(plaga.id)}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setPlagasSeleccionadas([...plagasSeleccionadas, plaga.id]);
                            } else {
                              setPlagasSeleccionadas(plagasSeleccionadas.filter(id => id !== plaga.id));
                            }
                          }}
                          className="rounded border-gray-300"
                        />
                        <span className="text-foreground">{plaga.nombre}</span>
                      </label>
                    ))}
                  </div>
                  <Button
                    onClick={cargarTendencias}
                    className="mt-3 bg-primary hover:bg-primary-dark"
                    size="sm"
                  >
                    Aplicar Filtro
                  </Button>
                </div>
              )}
            </div>
          </Card>

          {/* ============================================ */}
          {/* VISUALIZACIONES CON PESTAÑAS */}
          {/* ============================================ */}

          <Card className="p-6">
            <Tabs value={tabActiva} onValueChange={(value) => setTabActiva(value as 'general' | 'mapa-calor')} className="w-full">
              <TabsList className="grid w-full grid-cols-2 mb-6">
                <TabsTrigger value="general" className="flex items-center gap-2">
                  <TrendingUp className="w-4 h-4" />
                  Tendencias Generales
                </TabsTrigger>
                <TabsTrigger value="mapa-calor" className="flex items-center gap-2">
                  <BarChart3 className="w-4 h-4" />
                  Mapa de Calor por Lote
                </TabsTrigger>
              </TabsList>

              <TabsContent value="general">
                {/* GRÁFICA DE TENDENCIAS */}
            <div className="mb-6">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-lg text-foreground mb-1">Tendencias de Incidencia</h3>
                  <p className="text-sm text-brand-brown/60">
                    {tendencias.length > 0 && tendencias[0].fechaInicio && tendencias[tendencias.length - 1].fechaFin && (
                      <>Datos de: {formatearFechaCorta(tendencias[0].fechaInicio)} a: {formatearFechaCorta(tendencias[tendencias.length - 1].fechaFin)} • </>
                    )}
                    {tendencias.length} ocurrencia{tendencias.length !== 1 ? 's' : ''} registrada{tendencias.length !== 1 ? 's' : ''}
                  </p>
                </div>

                <Button
                  onClick={exportarGrafico}
                  variant="outline"
                  size="sm"
                >
                  <Camera className="w-4 h-4 mr-2" />
                  Exportar Gráfico
                </Button>
              </div>
            </div>

            {/* Gráfico */}
            <div ref={graficoRef} className="bg-white p-4 rounded-lg">
              <h4 className="text-center text-foreground mb-4">
                Tendencias de Incidencia - {rangoSeleccionado.charAt(0).toUpperCase() + rangoSeleccionado.slice(1)}
              </h4>
              
              {tendencias.length > 0 ? (
                <ResponsiveContainer width="100%" height={450}>
                  <LineChart data={tendencias} margin={{ top: 5, right: 30, left: 20, bottom: 40 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                    <XAxis
                      dataKey="ocurrencia"
                      tick={<CustomAxisTick />}
                      stroke="#9CA3AF"
                      height={80}
                    />
                    <YAxis 
                      label={{ value: 'Incidencia (%)', angle: -90, position: 'insideLeft', fill: '#4D240F' }}
                      tick={{ fill: '#4D240F', fontSize: 12 }}
                      stroke="#9CA3AF"
                    />
                    <Tooltip 
                      contentStyle={{ 
                        backgroundColor: 'white', 
                        border: '1px solid #E5E7EB',
                        borderRadius: '8px',
                        boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)'
                      }}
                    />
                    <Legend 
                      wrapperStyle={{ paddingTop: '20px' }}
                      iconType="line"
                    />
                    {plagasEnGrafico.map((plaga, index) => (
                      <Line
                        key={plaga}
                        type="monotone"
                        dataKey={plaga}
                        stroke={COLORES_PLAGAS[index % COLORES_PLAGAS.length]}
                        strokeWidth={2}
                        dot={{ r: 4 }}
                        activeDot={{ r: 6 }}
                        name={plaga}
                      />
                    ))}
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-[450px] flex items-center justify-center text-brand-brown/60">
                  <div className="text-center">
                    <Bug className="w-12 h-12 mx-auto mb-3 text-gray-300" />
                    <p>No hay datos para el período seleccionado</p>
                  </div>
                </div>
              )}
            </div>
              </TabsContent>

              <TabsContent value="mapa-calor">
                <MapaCalorIncidencias
                  monitoreos={monitoreosCargados}
                  rangoSeleccionado={rangoSeleccionado}
                  modoVisualizacion={modoVisualizacion}
                />
              </TabsContent>
            </Tabs>
          </Card>

          {/* ============================================ */}
          {/* 5. INSIGHTS AUTOMÁTICOS */}
          {/* ============================================ */}
          
          <Card className="p-6">
            <h3 className="text-lg text-foreground mb-4">Insights Automáticos</h3>
            
            {insights.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {(() => {
                  // Agrupar insights por plaga
                  const insightsPorPlaga: { [plaga: string]: Insight[] } = {};
                  insights.forEach(insight => {
                    if (!insightsPorPlaga[insight.plaga]) {
                      insightsPorPlaga[insight.plaga] = [];
                    }
                    insightsPorPlaga[insight.plaga].push(insight);
                  });

                  // Renderizar una tarjeta por plaga
                  return Object.entries(insightsPorPlaga).map(([plaga, insightsPlaga]) => {
                    // Determinar si todos los insights son del mismo tipo
                    const tipoMayoritario = insightsPlaga.filter(i => i.tipo === 'alerta').length >= insightsPlaga.length / 2 
                      ? 'alerta' 
                      : 'alivio';

                    return (
                      <div
                        key={plaga}
                        className="p-4 bg-white rounded-lg border border-gray-200 shadow-sm hover:shadow-md transition-shadow duration-200"
                      >
                        {/* Título de la plaga */}
                        <div className="flex items-start gap-3 mb-3 pb-3 border-b border-gray-100">
                          {tipoMayoritario === 'alerta' ? (
                            <AlertTriangle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
                          ) : (
                            <CheckCircle2 className="w-5 h-5 text-green-500 flex-shrink-0 mt-0.5" />
                          )}
                          <div className="flex-1">
                            <h4 className="font-semibold text-foreground">{plaga}</h4>
                            <p className="text-xs text-brand-brown/60 mt-0.5">
                              {insightsPlaga.length} lote{insightsPlaga.length !== 1 ? 's' : ''} con cambios
                            </p>
                          </div>
                        </div>

                        {/* Lista de lotes */}
                        <div className="space-y-2">
                          {insightsPlaga.map((insight, index) => (
                            <div key={index} className="pl-2">
                              <h5 className="text-sm text-foreground font-medium mb-1">
                                {insight.lote}
                              </h5>
                              <p className={`text-sm ${insight.tipo === 'alerta' ? 'text-red-700' : 'text-green-700'}`}>
                                {insight.tipo === 'alerta' ? 'Tendencia creciente' : 'Controlada'}:{' '}
                                <span className="font-medium">
                                  {insight.incidenciaAnterior}% → {insight.incidenciaActual}%
                                </span>
                              </p>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  });
                })()}
              </div>
            ) : (
              <div className="text-center py-8 text-brand-brown/60">
                <p>No hay cambios significativos en el período seleccionado</p>
                <p className="text-sm mt-1">Los insights se generan comparando con el período anterior</p>
              </div>
            )}
          </Card>

          {/* ============================================ */}
          {/* 6. PLAGAS CRÍTICAS */}
          {/* ============================================ */}
          
          <Card className="p-6">
            <h3 className="text-lg text-foreground mb-4">
              Plagas Críticas ({plagasCriticas.length})
            </h3>
            <p className="text-sm text-brand-brown/60 mb-6">
              Plagas con incidencia {'>'} 30% en uno o más lotes
            </p>

            {plagasCriticas.length > 0 ? (
              <div className="space-y-2">
                {plagasCriticas.map((pc) => {
                  const isExpanded = plagasExpandidas.has(pc.plaga);
                  const maxIncidencia = Math.max(...pc.lotes.map(l => l.incidenciaActual));

                  return (
                    <div key={pc.plaga} className="border border-gray-200 rounded-lg overflow-hidden">
                      {/* Header clickeable */}
                      <div
                        onClick={() => togglePlaga(pc.plaga)}
                        className="p-4 bg-gradient-to-r from-red-50 to-orange-50 hover:from-red-100 hover:to-orange-100 cursor-pointer transition-colors flex items-center justify-between"
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-6 h-6 flex items-center justify-center rounded-full bg-red-100">
                            {isExpanded ? (
                              <ChevronUp className="w-4 h-4 text-red-600" />
                            ) : (
                              <ChevronDown className="w-4 h-4 text-red-600" />
                            )}
                          </div>
                          <Bug className="w-5 h-5 text-red-600" />
                          <div>
                            <h4 className="text-foreground">{pc.plaga}</h4>
                            <p className="text-sm text-brand-brown/60">
                              {pc.lotes.length} lote{pc.lotes.length !== 1 ? 's' : ''} afectado{pc.lotes.length !== 1 ? 's' : ''}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="px-3 py-1 bg-red-500 text-white rounded-full text-sm">
                            Máx: {maxIncidencia}%
                          </span>
                          <span className="text-xs text-brand-brown/40">
                            {isExpanded ? 'Clic para colapsar' : 'Clic para expandir'}
                          </span>
                        </div>
                      </div>

                      {/* Contenido expandible */}
                      {isExpanded && (
                        <div className="p-4 bg-white space-y-3">
                          {pc.lotes.map((lote, index) => (
                            <div key={index} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                              <div className="flex-1">
                                <h5 className="text-sm text-foreground font-medium">{lote.lote}</h5>
                                <div className="flex items-center gap-4 mt-1">
                                  <span className="text-xs text-brand-brown/60">
                                    Actual: <span className="font-medium text-red-600">{lote.incidenciaActual}%</span>
                                  </span>
                                  <span className="text-xs text-brand-brown/60">
                                    Anterior: <span className="font-medium">{lote.incidenciaAnterior}%</span>
                                  </span>
                                </div>
                              </div>
                              
                              {/* Mini gráfico de tendencia */}
                              <div className="flex items-center gap-2">
                                {lote.tendencia === 'up' && (
                                  <div className="flex items-center gap-1 text-red-500">
                                    <TrendingUp className="w-4 h-4" />
                                    <span className="text-xs">↑ {(lote.incidenciaActual - lote.incidenciaAnterior).toFixed(1)}%</span>
                                  </div>
                                )}
                                {lote.tendencia === 'down' && (
                                  <div className="flex items-center gap-1 text-green-500">
                                    <TrendingDown className="w-4 h-4" />
                                    <span className="text-xs">↓ {(lote.incidenciaAnterior - lote.incidenciaActual).toFixed(1)}%</span>
                                  </div>
                                )}
                                {lote.tendencia === 'stable' && (
                                  <span className="text-xs text-gray-500">Estable</span>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="text-center py-8 text-brand-brown/60">
                <CheckCircle2 className="w-12 h-12 mx-auto mb-3 text-green-500" />
                <p className="text-green-600">¡Excelente! No hay plagas críticas en el período seleccionado</p>
              </div>
            )}
          </Card>
        </>
      )}

      {/* ============================================ */}
      {/* BOTÓN FLOTANTE DE ACCIONES */}
      {/* ============================================ */}

      <div className="fixed bottom-8 right-8 flex flex-col gap-3 z-40">
        {/* Botón: Nuevo Monitoreo */}
        <Button
          onClick={() => setMostrarRegistroMonitoreo(true)}
          className="h-14 px-6 bg-primary hover:bg-primary-dark text-white shadow-2xl hover:shadow-primary/30 rounded-2xl transition-all duration-300 hover:scale-105"
        >
          <Plus className="w-5 h-5 mr-2" />
          Nuevo Monitoreo
        </Button>

        {/* Botón: Carga Masiva */}
        <Button
          onClick={() => navigate('/monitoreo/carga-masiva')}
          variant="outline"
          className="h-12 px-5 bg-white hover:bg-background border-2 border-primary text-primary shadow-lg hover:shadow-xl rounded-xl transition-all duration-300 hover:scale-105"
        >
          <Upload className="w-4 h-4 mr-2" />
          Carga Masiva
        </Button>
      </div>
    </div>
  );
}