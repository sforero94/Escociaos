import React, { useState, useEffect } from 'react';
import { Card } from '../ui/card';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { MonitoreoSubNav } from './MonitoreoSubNav';
import { MapaCalorIncidencias } from './MapaCalorIncidencias';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../ui/select';
import {
  Bug,
  Flower2,
  Zap,
  Hexagon,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Lock,
  ChevronDown,
  ChevronRight,
  Grid3X3,
  TrendingUp,
} from 'lucide-react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  BarChart,
  Bar,
  ReferenceArea,
} from 'recharts';
import { toast } from 'sonner';
import { getSupabase } from '../../utils/supabase/client';
import { formatearFechaCorta } from '../../utils/fechas';
import {
  calcularEstadoFloracion,
  calcularFloracionPorLote,
  calcularEstadoColmenas,
  calcularDistribucionCE,
  CE_UMBRAL_BAJO,
  CE_UMBRAL_ALTO,
  PLAGAS_INTERES,
} from '../../utils/calculosMonitoreoV2';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogBody,
  DialogTitle,
} from '../ui/dialog';
import type {
  RondaMonitoreo,
  EstadoSemaforo,
  MonitoreoConductividad,
  MonitoreoColmena,
  LecturaCE,
} from '../../types/monitoreo';
import type { Lote } from '../../types/shared';

// ============================================
// TYPES
// ============================================

interface MonitoreoRow {
  id: string;
  fecha_monitoreo: string;
  lote_id: string;
  sublote_id: string;
  plaga_enfermedad_id: string;
  arboles_monitoreados: number;
  arboles_afectados: number;
  incidencia: number;
  gravedad_texto: 'Baja' | 'Media' | 'Alta';
  floracion_sin_flor: number;
  floracion_brotes: number;
  floracion_flor_madura: number;
  floracion_cuaje: number;
  ronda_id: string | null;
  lotes: { nombre: string };
  sublotes: { nombre: string; lote_id: string };
  plagas_enfermedades_catalogo: { nombre: string };
}

interface LoteSnapshot {
  lote_id: string;
  lote_nombre: string;
  fecha_monitoreo: string;
  plagasIncidencia: Record<string, number>; // plaga_nombre → incidencia promedio
  arboles_monitoreados: number;
  floracion_sin_flor: number;
  floracion_brotes: number;
  floracion_flor_madura: number;
  floracion_cuaje: number;
  ce?: number;
  sublotes?: SubloteSnapshot[];
}

interface SubloteSnapshot {
  sublote_id: string;
  sublote_nombre: string;
  fecha_monitoreo: string;
  plagasIncidencia: Record<string, number>;
  arboles_monitoreados: number;
  floracion_sin_flor: number;
  floracion_brotes: number;
  floracion_flor_madura: number;
  floracion_cuaje: number;
}

interface CETemporalRow {
  fecha: string;
  fechaRaw: string;
  pctBajo: number;
  pctEnRango: number;
  pctAlto: number;
  totalArboles: number;
  promedio: number;
}

interface CEResumenLote {
  lote_id: string;
  lote_nombre: string;
  fecha: string;
  promedio: number;
  pctBajo: number;
  pctEnRango: number;
  pctAlto: number;
  lecturas: LecturaCE[];
}

type VistaMode = 'historico' | 'por_registro';
type CEVistaMode = VistaMode;
type SeccionDashboard = 'plagas' | 'floracion' | 'ce' | 'colmenas';

const DOMINIO_A_SECCION: Record<string, SeccionDashboard> = {
  'Floración': 'floracion',
  'CE': 'ce',
};

interface SemaforoCard {
  dominio: string;
  icon: typeof Bug;
  estado: EstadoSemaforo;
  label: string;
  detalle: string;
}

// ============================================
// CONSTANTS
// ============================================

const SEMAFORO_COLORS: Record<EstadoSemaforo, { bg: string; border: string; text: string; icon: typeof CheckCircle2 }> = {
  verde: { bg: 'bg-green-50', border: 'border-green-300', text: 'text-green-800', icon: CheckCircle2 },
  amarillo: { bg: 'bg-yellow-50', border: 'border-yellow-300', text: 'text-yellow-800', icon: AlertTriangle },
  rojo: { bg: 'bg-red-50', border: 'border-red-300', text: 'text-red-800', icon: AlertTriangle },
  sin_datos: { bg: 'bg-gray-50', border: 'border-gray-300', text: 'text-gray-500', icon: Clock },
};

const CHART_COLORS = ['#73991C', '#E6A817', '#D94F00', '#2563EB', '#7C3AED', '#EC4899', '#14B8A6', '#F97316', '#6366F1'];

const MESES_CORTOS = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

function generarEtiquetasRondas(rondas: { fecha_inicio: string }[]): string[] {
  // Count rondas per month
  const conteoMes = new Map<string, number>();
  const mesLabels = rondas.map(r => {
    const d = new Date(r.fecha_inicio + 'T00:00:00');
    const mes = `${MESES_CORTOS[d.getMonth()]} ${d.getFullYear()}`;
    const count = (conteoMes.get(mes) || 0) + 1;
    conteoMes.set(mes, count);
    return { mes, idx: count };
  });

  // If a month has >1 ronda, add suffix
  return mesLabels.map(({ mes, idx }) => {
    const total = conteoMes.get(mes) || 1;
    return total > 1 ? `${mes} - ${idx}` : mes;
  });
}

function incidenciaColor(val: number): string {
  if (val >= 30) return 'text-red-600 font-semibold';
  if (val >= 10) return 'text-yellow-600 font-semibold';
  return 'text-green-700';
}

function ceColor(val: number): string {
  if (val > CE_UMBRAL_ALTO) return 'text-red-600 font-semibold';
  if (val < CE_UMBRAL_BAJO) return 'text-yellow-600 font-semibold';
  return 'text-green-700';
}

// ============================================
// COMPONENT
// ============================================

export function DashboardMonitoreoV3() {
  const supabase = getSupabase();

  // Data
  const [rondas, setRondas] = useState<RondaMonitoreo[]>([]);
  const [rondaSeleccionada, setRondaSeleccionada] = useState('');
  const [monitoreos, setMonitoreos] = useState<MonitoreoRow[]>([]);
  const [lotes, setLotes] = useState<Lote[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Active section
  const [seccionActiva, setSeccionActiva] = useState<SeccionDashboard>('plagas');

  // Snapshot UI
  const [lotesExpandidos, setLotesExpandidos] = useState<Set<string>>(new Set());

  // Plagas sub-tab (heatmap vs tendencias)
  const [plagasTab, setPlagasTab] = useState<string>('heatmap');

  // Plagas trend
  const [lotesVisiblesPlagas, setLotesVisiblesPlagas] = useState<string[]>([]);
  const [plagasVisibles, setPlagasVisibles] = useState<string[]>([...PLAGAS_INTERES]);
  const [tendenciaPlagasData, setTendenciaPlagasData] = useState<any[]>([]);
  const [allMonitoreos, setAllMonitoreos] = useState<MonitoreoRow[]>([]);

  // CE new visualization
  const [ceHistorico, setCeHistorico] = useState<MonitoreoConductividad[]>([]);
  const [ceLoteFiltro, setCeLoteFiltro] = useState('general');
  const [ceDrilldownLote, setCeDrilldownLote] = useState<CEResumenLote | null>(null);
  const [ceVista, setCeVista] = useState<CEVistaMode>('historico');
  const [ceRegistroFecha, setCeRegistroFecha] = useState('');

  // Floración trend + "Por registro" view
  const [tendenciaFloracionData, setTendenciaFloracionData] = useState<any[]>([]);
  const [floracionVista, setFloracionVista] = useState<VistaMode>('historico');
  const [floracionRondaSel, setFloracionRondaSel] = useState('');

  // Colmenas trend
  const [tendenciaColmenasData, setTendenciaColmenasData] = useState<any[]>([]);

  // All plagas found (for checkbox selector)
  const [todasLasPlagas, setTodasLasPlagas] = useState<string[]>([]);

  // Colmenas independiente de rondas — último registro por apiario
  const [colmenasUltimo, setColmenasUltimo] = useState<(MonitoreoColmena & { total_apiario?: number })[]>([]);
  // Colmenas historical for stacked bar chart
  const [colmenasHistorico, setColmenasHistorico] = useState<any[]>([]);

  // Load on mount
  useEffect(() => {
    cargarRondas();
    cargarLotes();
    cargarColmenasUltimo();
    cargarCEHistorico();
  }, []);

  useEffect(() => {
    if (rondaSeleccionada) cargarDatosRonda();
  }, [rondaSeleccionada]);

  async function cargarLotes() {
    const { data } = await supabase.from('lotes').select('id, nombre').eq('activo', true).order('numero_orden');
    const lotesData = (data || []) as Lote[];
    setLotes(lotesData);
    setLotesVisiblesPlagas(lotesData.map(l => l.id));
  }

  async function cargarCEHistorico() {
    try {
      const { data } = await supabase
        .from('mon_conductividad')
        .select('id, fecha_monitoreo, lote_id, valor_ce, lecturas, lotes(nombre)')
        .order('fecha_monitoreo', { ascending: true })
        .order('created_at', { ascending: true });

      if (data) {
        setCeHistorico(
          (data as any[]).map(r => ({ ...r, lote_nombre: r.lotes?.nombre }))
        );
      }
    } catch {
      // silent
    }
  }

  async function cargarColmenasUltimo() {
    try {
      // Get all apiarios
      const { data: apiarios } = await supabase
        .from('apiarios')
        .select('id, nombre, total_colmenas')
        .eq('activo', true)
        .order('nombre');

      if (!apiarios || apiarios.length === 0) return;

      // For each apiario, get the latest mon_colmenas record
      const resultados: (MonitoreoColmena & { total_apiario?: number })[] = [];
      for (const apiario of apiarios) {
        const { data } = await supabase
          .from('mon_colmenas')
          .select('*')
          .eq('apiario_id', apiario.id)
          .order('fecha_monitoreo', { ascending: false })
          .limit(1)
          .single();

        if (data) {
          resultados.push({
            ...data,
            apiario_nombre: apiario.nombre,
            total_apiario: apiario.total_colmenas,
          } as any);
        } else {
          // Apiario without monitoring records
          resultados.push({
            id: apiario.id,
            fecha_monitoreo: '',
            apiario_id: apiario.id,
            colmenas_fuertes: 0,
            colmenas_debiles: 0,
            colmenas_muertas: 0,
            colmenas_con_reina: 0,
            apiario_nombre: apiario.nombre,
            total_apiario: apiario.total_colmenas,
          } as any);
        }
      }
      setColmenasUltimo(resultados);

      // Load historical data for stacked bar chart (all records, grouped by date+apiario)
      const { data: histData } = await supabase
        .from('mon_colmenas')
        .select('fecha_monitoreo, apiario_id, colmenas_fuertes, colmenas_debiles, colmenas_muertas, colmenas_con_reina, apiarios(nombre)')
        .order('fecha_monitoreo', { ascending: true });

      if (histData && histData.length > 0) {
        // Group by fecha_monitoreo, build one row per date with sub-keys per apiario
        const fechaMap = new Map<string, any>();
        const apiarioNames = new Map<string, string>();

        for (const r of histData as any[]) {
          const fecha = r.fecha_monitoreo;
          const apiarioNombre = r.apiarios?.nombre || r.apiario_id;
          apiarioNames.set(r.apiario_id, apiarioNombre);

          if (!fechaMap.has(fecha)) {
            fechaMap.set(fecha, { fecha: formatearFechaCorta(fecha) });
          }
          const row = fechaMap.get(fecha)!;
          row[`${apiarioNombre}_fuertes`] = r.colmenas_fuertes;
          row[`${apiarioNombre}_debiles`] = r.colmenas_debiles;
          row[`${apiarioNombre}_muertas`] = r.colmenas_muertas;
          row[`${apiarioNombre}_reina`] = r.colmenas_con_reina;
        }

        setColmenasHistorico(Array.from(fechaMap.values()));
      }
    } catch {
      // silent
    }
  }

  async function cargarRondas() {
    setIsLoading(true);
    try {
      const { data } = await supabase
        .from('rondas_monitoreo')
        .select('*')
        .order('fecha_inicio', { ascending: false });

      const rondasData = (data || []) as RondaMonitoreo[];
      setRondas(rondasData);
      if (rondasData.length > 0) setRondaSeleccionada(rondasData[0].id);
      await cargarTendencias(rondasData);
    } catch {
      toast.error('Error al cargar rondas');
    } finally {
      setIsLoading(false);
    }
  }

  async function cargarDatosRonda() {
    try {
      const { data } = await supabase
        .from('monitoreos')
        .select('id, fecha_monitoreo, lote_id, sublote_id, plaga_enfermedad_id, arboles_monitoreados, arboles_afectados, incidencia, gravedad_texto, floracion_sin_flor, floracion_brotes, floracion_flor_madura, floracion_cuaje, ronda_id, lotes(nombre), sublotes(nombre, lote_id), plagas_enfermedades_catalogo(nombre)')
        .eq('ronda_id', rondaSeleccionada);

      setMonitoreos((data || []) as any);
    } catch {
      toast.error('Error al cargar datos de la ronda');
    }
  }

  async function cargarTendencias(rondasList: RondaMonitoreo[]) {
    const ultimas = rondasList.slice(0, 10).reverse();
    if (ultimas.length === 0) return;
    const rondaIds = ultimas.map(r => r.id);

    try {
      const [monRes, colRes] = await Promise.all([
        supabase
          .from('monitoreos')
          .select('id, ronda_id, lote_id, fecha_monitoreo, sublote_id, arboles_monitoreados, arboles_afectados, incidencia, gravedad_texto, plaga_enfermedad_id, floracion_sin_flor, floracion_brotes, floracion_flor_madura, floracion_cuaje, plagas_enfermedades_catalogo(nombre), lotes(nombre), sublotes(nombre, lote_id)')
          .in('ronda_id', rondaIds),
        supabase
          .from('mon_colmenas')
          .select('ronda_id, colmenas_fuertes, colmenas_debiles, colmenas_muertas')
          .in('ronda_id', rondaIds),
      ]);

      const monData = (monRes.data || []) as any[];
      setAllMonitoreos(monData as MonitoreoRow[]);

      // Collect all unique plaga names
      const plagaSet = new Set<string>();
      for (const m of monData) {
        const nombre = m.plagas_enfermedades_catalogo?.nombre;
        if (nombre) plagaSet.add(nombre);
      }
      setTodasLasPlagas(Array.from(plagaSet).sort());

      // Plagas trend: group by ronda+plaga, avg incidencia
      // Structure: [{ ronda: 'R1', nombre: '...', fechas: '...', Monalonion: 5.2, Ácaro: 3.1, ... }]
      const plagasPorRondaPlaga = new Map<string, Map<string, { total: number; count: number }>>();
      const plagasPorRondaLotePlaga = new Map<string, Map<string, { total: number; count: number }>>();

      for (const m of monData) {
        const plagaNombre = m.plagas_enfermedades_catalogo?.nombre;
        if (!plagaNombre) continue;

        // Global
        if (!plagasPorRondaPlaga.has(m.ronda_id)) plagasPorRondaPlaga.set(m.ronda_id, new Map());
        const rondaMap = plagasPorRondaPlaga.get(m.ronda_id)!;
        const prev = rondaMap.get(plagaNombre) || { total: 0, count: 0 };
        prev.total += m.incidencia || 0;
        prev.count += 1;
        rondaMap.set(plagaNombre, prev);

        // Per lote
        const loteKey = `${m.ronda_id}|${m.lote_id}`;
        if (!plagasPorRondaLotePlaga.has(loteKey)) plagasPorRondaLotePlaga.set(loteKey, new Map());
        const loteMap = plagasPorRondaLotePlaga.get(loteKey)!;
        const lprev = loteMap.get(plagaNombre) || { total: 0, count: 0 };
        lprev.total += m.incidencia || 0;
        lprev.count += 1;
        loteMap.set(plagaNombre, lprev);
      }

      // Build trend data with all plagas as keys
      const etiquetas = generarEtiquetasRondas(ultimas);
      const tendPlagas = ultimas.map((r, i) => {
        const row: any = {
          ronda: `R${i + 1}`,
          nombre: r.nombre || `Ronda ${i + 1}`,
          fechas: etiquetas[i],
          fechasDetalle: `${formatearFechaCorta(r.fecha_inicio)}${r.fecha_fin ? ' - ' + formatearFechaCorta(r.fecha_fin) : ''}`,
          _rondaId: r.id,
        };
        const rondaMap = plagasPorRondaPlaga.get(r.id);
        if (rondaMap) {
          for (const [plaga, stats] of rondaMap) {
            row[plaga] = +(stats.total / stats.count).toFixed(1);
          }
        }
        // Per-lote data stored separately
        row._porLote = new Map<string, Record<string, number>>();
        for (const [key, loteMap] of plagasPorRondaLotePlaga) {
          if (key.startsWith(r.id + '|')) {
            const loteId = key.split('|')[1];
            const loteData: Record<string, number> = {};
            for (const [plaga, stats] of loteMap) {
              loteData[plaga] = +(stats.total / stats.count).toFixed(1);
            }
            row._porLote.set(loteId, loteData);
          }
        }
        return row;
      });
      setTendenciaPlagasData(tendPlagas);

      // Floración trend: group all records by ronda_id, aggregate farm-wide
      const recordsPorRonda = new Map<string, typeof monData>();
      for (const m of monData) {
        const arr = recordsPorRonda.get(m.ronda_id || '') || [];
        arr.push(m);
        recordsPorRonda.set(m.ronda_id || '', arr);
      }

      const tendFlor = ultimas.map((r, i) => {
        const records = recordsPorRonda.get(r.id) || [];
        const flor = calcularEstadoFloracion(records);
        return {
          ronda: `R${i + 1}`,
          fechas: etiquetas[i],
          sinFlor: flor.sinFlor,
          brotes: flor.brotes,
          flor: flor.florMadura,
          cuaje: flor.cuaje,
        };
      }).filter(d => d.sinFlor + d.brotes + d.flor + d.cuaje > 0);
      setTendenciaFloracionData(tendFlor);

      // Colmenas trend
      const colData = (colRes.data || []) as any[];
      const colPorRonda = new Map<string, { fuertes: number; total: number }>();
      for (const c of colData) {
        const prev = colPorRonda.get(c.ronda_id) || { fuertes: 0, total: 0 };
        prev.fuertes += c.colmenas_fuertes;
        prev.total += c.colmenas_fuertes + c.colmenas_debiles + c.colmenas_muertas;
        colPorRonda.set(c.ronda_id, prev);
      }
      const tendCol = ultimas.map((r, i) => {
        const stats = colPorRonda.get(r.id);
        return {
          ronda: `R${i + 1}`,
          fechas: etiquetas[i],
          pctFuertes: stats && stats.total > 0 ? Math.round((stats.fuertes / stats.total) * 100) : null,
        };
      });
      setTendenciaColmenasData(tendCol);
    } catch {
      // silent
    }
  }

  // ============================================
  // COMPUTED
  // ============================================

  const rondaActual = rondas.find(r => r.id === rondaSeleccionada);
  const esRondaAbierta = rondaActual?.fecha_fin == null;

  // Top 5 plagas by average incidencia in the ronda
  function calcularTopPlagas(): { nombre: string; incidenciaProm: number; estado: EstadoSemaforo }[] {
    if (monitoreos.length === 0) return [];

    const plagaStats = new Map<string, { total: number; count: number }>();
    for (const m of monitoreos) {
      const nombre = m.plagas_enfermedades_catalogo?.nombre;
      if (!nombre) continue;
      const prev = plagaStats.get(nombre) || { total: 0, count: 0 };
      prev.total += m.incidencia || 0;
      prev.count += 1;
      plagaStats.set(nombre, prev);
    }

    return Array.from(plagaStats.entries())
      .map(([nombre, stats]) => {
        const prom = +(stats.total / stats.count).toFixed(1);
        return {
          nombre,
          incidenciaProm: prom,
          estado: (prom >= 30 ? 'rojo' : prom >= 10 ? 'amarillo' : 'verde') as EstadoSemaforo,
        };
      })
      .sort((a, b) => b.incidenciaProm - a.incidenciaProm)
      .slice(0, 5);
  }

  const topPlagas = calcularTopPlagas();
  const plagasEstado: EstadoSemaforo = topPlagas.length === 0 ? 'sin_datos'
    : topPlagas[0].incidenciaProm >= 30 ? 'rojo'
    : topPlagas[0].incidenciaProm >= 10 ? 'amarillo' : 'verde';

  function calcularSemaforoFloracion(): SemaforoCard {
    const flor = calcularEstadoFloracion(monitoreos);
    if (flor.arbolesMonitoreados === 0) return { dominio: 'Floración', icon: Flower2, estado: 'sin_datos', label: 'Sin datos', detalle: 'No hay datos' };
    return { dominio: 'Floración', icon: Flower2, estado: 'verde', label: `${flor.arbolesMonitoreados} árboles`, detalle: `Sin flor ${flor.pctSinFlor}% · Brotes ${flor.pctBrotes}% · Flor ${flor.pctFlorMadura}% · Cuaje ${flor.pctCuaje}%` };
  }

  function calcularSemaforoCE(): SemaforoCard {
    const resumen = getCEResumenLotes();
    if (resumen.length === 0) {
      return { dominio: 'CE', icon: Zap, estado: 'sin_datos', label: 'Sin datos', detalle: 'No hay lecturas' };
    }

    // Use only the most recent fecha_monitoreo to avoid mixing dates
    const maxFecha = resumen.reduce((max, r) => r.fecha > max ? r.fecha : max, '');
    const resumenReciente = resumen.filter(r => r.fecha === maxFecha);

    const todasLecturas = resumenReciente.flatMap(r => r.lecturas);
    const dist = calcularDistribucionCE(todasLecturas);
    const estado: EstadoSemaforo = dist.pctEnRango > 80 ? 'verde' : dist.pctEnRango >= 50 ? 'amarillo' : 'rojo';
    return {
      dominio: 'CE',
      icon: Zap,
      estado,
      label: `${dist.pctEnRango}% en rango`,
      detalle: `Prom ${dist.promedio} dS/m · ${dist.totalArboles} árboles`,
    };
  }

  function calcularSemaforoColmenas(): SemaforoCard {
    const conDatos = colmenasUltimo.filter(c => c.fecha_monitoreo);
    if (conDatos.length === 0) return { dominio: 'Colmenas', icon: Hexagon, estado: 'sin_datos', label: 'Sin datos', detalle: 'No hay registros' };
    const col = calcularEstadoColmenas(conDatos);
    const totalReinas = conDatos.reduce((s, c) => s + (c.colmenas_con_reina || 0), 0);
    return { dominio: 'Colmenas', icon: Hexagon, estado: col.estado, label: `${col.pctFuertes}% fuertes`, detalle: `${totalReinas} con reina · ${col.totalFuertes}F · ${col.totalDebiles}D · ${col.totalMuertas}M` };
  }

  function calcularSnapshot(): LoteSnapshot[] {
    const lotesMap = new Map<string, {
      lote_id: string;
      lote_nombre: string;
      fecha_monitoreo: string;
      plagasMap: Map<string, { total: number; count: number }>;
      monitoreoRows: MonitoreoRow[];
      ce?: number;
      sublotesMap: Map<string, {
        sublote_id: string;
        sublote_nombre: string;
        fecha_monitoreo: string;
        plagasMap: Map<string, { total: number; count: number }>;
        monitoreoRows: MonitoreoRow[];
      }>;
    }>();

    for (const m of monitoreos) {
      const plagaNombre = m.plagas_enfermedades_catalogo?.nombre || '';

      if (!lotesMap.has(m.lote_id)) {
        lotesMap.set(m.lote_id, {
          lote_id: m.lote_id,
          lote_nombre: m.lotes?.nombre || m.lote_id,
          fecha_monitoreo: m.fecha_monitoreo,
          plagasMap: new Map(),
          monitoreoRows: [],
          sublotesMap: new Map(),
        });
      }

      const lote = lotesMap.get(m.lote_id)!;
      if (m.fecha_monitoreo > lote.fecha_monitoreo) lote.fecha_monitoreo = m.fecha_monitoreo;

      // Lote-level plaga aggregation
      const lp = lote.plagasMap.get(plagaNombre) || { total: 0, count: 0 };
      lp.total += m.incidencia || 0;
      lp.count += 1;
      lote.plagasMap.set(plagaNombre, lp);

      lote.monitoreoRows.push(m);

      // Sublote-level
      if (m.sublote_id) {
        if (!lote.sublotesMap.has(m.sublote_id)) {
          lote.sublotesMap.set(m.sublote_id, {
            sublote_id: m.sublote_id,
            sublote_nombre: m.sublotes?.nombre || m.sublote_id,
            fecha_monitoreo: m.fecha_monitoreo,
            plagasMap: new Map(),
            monitoreoRows: [],
          });
        }
        const sub = lote.sublotesMap.get(m.sublote_id)!;
        if (m.fecha_monitoreo > sub.fecha_monitoreo) sub.fecha_monitoreo = m.fecha_monitoreo;
        const sp = sub.plagasMap.get(plagaNombre) || { total: 0, count: 0 };
        sp.total += m.incidencia || 0;
        sp.count += 1;
        sub.plagasMap.set(plagaNombre, sp);
        sub.monitoreoRows.push(m);
      }
    }

    // Add CE from latest historical record per lote
    const ceResumen = getCEResumenLotes();
    for (const ce of ceResumen) {
      const lote = lotesMap.get(ce.lote_id);
      if (lote) lote.ce = ce.promedio;
    }

    // Convert Maps to plain objects, using calcularEstadoFloracion for deduplication
    return Array.from(lotesMap.values())
      .sort((a, b) => a.lote_nombre.localeCompare(b.lote_nombre))
      .map(l => {
        const plagasIncidencia: Record<string, number> = {};
        for (const [p, stats] of l.plagasMap) {
          plagasIncidencia[p] = +(stats.total / stats.count).toFixed(1);
        }
        const florLote = calcularEstadoFloracion(l.monitoreoRows);
        const sublotes = Array.from(l.sublotesMap.values())
          .sort((a, b) => a.sublote_nombre.localeCompare(b.sublote_nombre))
          .map(s => {
            const pi: Record<string, number> = {};
            for (const [p, stats] of s.plagasMap) pi[p] = +(stats.total / stats.count).toFixed(1);
            const florSub = calcularEstadoFloracion(s.monitoreoRows);
            return {
              sublote_id: s.sublote_id,
              sublote_nombre: s.sublote_nombre,
              fecha_monitoreo: s.fecha_monitoreo,
              plagasIncidencia: pi,
              arboles_monitoreados: florSub.arbolesMonitoreados,
              floracion_sin_flor: florSub.sinFlor,
              floracion_brotes: florSub.brotes,
              floracion_flor_madura: florSub.florMadura,
              floracion_cuaje: florSub.cuaje,
            } as SubloteSnapshot;
          });
        return {
          lote_id: l.lote_id,
          lote_nombre: l.lote_nombre,
          fecha_monitoreo: l.fecha_monitoreo,
          plagasIncidencia,
          arboles_monitoreados: florLote.arbolesMonitoreados,
          floracion_sin_flor: florLote.sinFlor,
          floracion_brotes: florLote.brotes,
          floracion_flor_madura: florLote.florMadura,
          floracion_cuaje: florLote.cuaje,
          ce: l.ce,
          sublotes,
        } as LoteSnapshot;
      });
  }

  function toggleLote(loteId: string) {
    setLotesExpandidos(prev => {
      const next = new Set(prev);
      if (next.has(loteId)) next.delete(loteId);
      else next.add(loteId);
      return next;
    });
  }

  function togglePlagaVisible(plaga: string) {
    setPlagasVisibles(prev =>
      prev.includes(plaga) ? prev.filter(p => p !== plaga) : [...prev, plaga]
    );
  }

  function toggleLotePlagas(loteId: string) {
    setLotesVisiblesPlagas(prev =>
      prev.includes(loteId) ? prev.filter(l => l !== loteId) : [...prev, loteId]
    );
  }

  // CE computed data for new visualization
  function getCETemporalData(): CETemporalRow[] {
    // Group ceHistorico by fecha, optionally filtered by lote
    const registros = ceLoteFiltro === 'general'
      ? ceHistorico
      : ceHistorico.filter(r => r.lote_id === ceLoteFiltro);

    // Group by fecha_monitoreo
    const fechaMap = new Map<string, LecturaCE[]>();
    for (const r of registros) {
      if (!r.lecturas || r.lecturas.length === 0) continue;
      const fecha = r.fecha_monitoreo;
      const existing = fechaMap.get(fecha) || [];
      existing.push(...r.lecturas);
      fechaMap.set(fecha, existing);
    }

    const rows: CETemporalRow[] = [];
    for (const [fecha, lecturas] of fechaMap) {
      const dist = calcularDistribucionCE(lecturas);
      if (dist.totalArboles === 0) continue;
      rows.push({
        fecha: formatearFechaCorta(fecha),
        fechaRaw: fecha,
        ...dist,
      });
    }

    return rows.sort((a, b) => a.fechaRaw.localeCompare(b.fechaRaw));
  }

  function getCEResumenLotes(): CEResumenLote[] {
    // For each lote, get the most recent CE record with lecturas
    const loteMasReciente = new Map<string, MonitoreoConductividad>();

    for (const r of ceHistorico) {
      if (!r.lecturas || r.lecturas.length === 0) continue;
      const existing = loteMasReciente.get(r.lote_id);
      if (!existing || r.fecha_monitoreo >= existing.fecha_monitoreo) {
        loteMasReciente.set(r.lote_id, r);
      }
    }

    const resumen: CEResumenLote[] = [];
    for (const [loteId, r] of loteMasReciente) {
      const dist = calcularDistribucionCE(r.lecturas!);
      resumen.push({
        lote_id: loteId,
        lote_nombre: r.lote_nombre || loteId,
        fecha: r.fecha_monitoreo,
        promedio: dist.promedio,
        pctBajo: dist.pctBajo,
        pctEnRango: dist.pctEnRango,
        pctAlto: dist.pctAlto,
        lecturas: r.lecturas!,
      });
    }

    return resumen.sort((a, b) => a.lote_nombre.localeCompare(b.lote_nombre));
  }

  // Get unique CE measurement dates (for "por registro" view selector)
  function getCEFechasDisponibles(): string[] {
    const fechas = new Set<string>();
    for (const r of ceHistorico) {
      if (r.lecturas && r.lecturas.length > 0) fechas.add(r.fecha_monitoreo);
    }
    return Array.from(fechas).sort().reverse();
  }

  // Get per-lote distribution for a specific date
  function getCEPorRegistro(fecha: string): CEResumenLote[] {
    const registros = ceHistorico.filter(r => r.fecha_monitoreo === fecha && r.lecturas && r.lecturas.length > 0);
    return registros
      .map(r => {
        const dist = calcularDistribucionCE(r.lecturas!);
        return {
          lote_id: r.lote_id,
          lote_nombre: r.lote_nombre || r.lote_id,
          fecha: r.fecha_monitoreo,
          promedio: dist.promedio,
          pctBajo: dist.pctBajo,
          pctEnRango: dist.pctEnRango,
          pctAlto: dist.pctAlto,
          lecturas: r.lecturas!,
        };
      })
      .sort((a, b) => a.lote_nombre.localeCompare(b.lote_nombre));
  }

  // Build trend chart data for plagas (filtered by vista and plagas visibles)
  const plagasTodosLotes = lotesVisiblesPlagas.length === lotes.length || lotesVisiblesPlagas.length === 0;

  function getTendenciaPlagasChart() {
    return tendenciaPlagasData.map(row => {
      const chartRow: any = { ronda: row.ronda, nombre: row.nombre, fechas: row.fechas, fechasDetalle: row.fechasDetalle };
      if (plagasTodosLotes) {
        // Global average per plaga
        for (const plaga of plagasVisibles) {
          chartRow[plaga] = row[plaga] ?? null;
        }
      } else {
        // One key per lote×plaga
        for (const loteId of lotesVisiblesPlagas) {
          const loteData = row._porLote?.get(loteId);
          const loteNombre = lotes.find(l => l.id === loteId)?.nombre || loteId;
          for (const plaga of plagasVisibles) {
            chartRow[`${loteNombre} — ${plaga}`] = loteData?.[plaga] ?? null;
          }
        }
      }
      return chartRow;
    });
  }

  function getPlagasChartKeys(): { key: string; color: string }[] {
    if (plagasTodosLotes) {
      return plagasVisibles.map((plaga, i) => ({
        key: plaga,
        color: CHART_COLORS[i % CHART_COLORS.length],
      }));
    }
    // One line per lote×plaga — cycle colors by lote, use dash patterns per plaga
    const keys: { key: string; color: string }[] = [];
    for (let li = 0; li < lotesVisiblesPlagas.length; li++) {
      const loteId = lotesVisiblesPlagas[li];
      const loteNombre = lotes.find(l => l.id === loteId)?.nombre || loteId;
      for (const plaga of plagasVisibles) {
        keys.push({
          key: `${loteNombre} — ${plaga}`,
          color: CHART_COLORS[li % CHART_COLORS.length],
        });
      }
    }
    return keys;
  }

  async function cerrarRonda() {
    if (!rondaActual) return;
    try {
      const { error } = await supabase
        .from('rondas_monitoreo')
        .update({ fecha_fin: new Date().toISOString().split('T')[0] })
        .eq('id', rondaActual.id);
      if (error) throw error;
      toast.success('Ronda cerrada');
      cargarRondas();
    } catch {
      toast.error('Error al cerrar la ronda');
    }
  }

  // ============================================
  // RENDER
  // ============================================

  const semaforosBase = [calcularSemaforoFloracion(), calcularSemaforoCE()];

  // Colmenas: overall estado based on all apiarios
  const colmenasConDatos = colmenasUltimo.filter(c => c.fecha_monitoreo);
  const colmenasOverall = calcularEstadoColmenas(colmenasConDatos);
  const colmenasEstado: EstadoSemaforo = colmenasConDatos.length === 0 ? 'sin_datos'
    : colmenasOverall.pctFuertes > 80 ? 'verde'
    : colmenasOverall.pctFuertes >= 50 ? 'amarillo' : 'rojo';
  const snapshot = calcularSnapshot();
  const plagasChartData = getTendenciaPlagasChart();

  if (isLoading) {
    return (<div><MonitoreoSubNav /><div className="text-center py-20 text-brand-brown/50">Cargando dashboard...</div></div>);
  }

  return (
    <div>
      <MonitoreoSubNav />
      <div className="space-y-6">

        {/* RONDA SELECTOR */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <Select value={rondaSeleccionada} onValueChange={setRondaSeleccionada}>
              <SelectTrigger className="w-80">
                <SelectValue placeholder="Seleccionar ronda" />
              </SelectTrigger>
              <SelectContent>
                {rondas.map(r => (
                  <SelectItem key={r.id} value={r.id}>
                    {r.nombre || 'Sin nombre'} — {formatearFechaCorta(r.fecha_inicio)}
                    {r.fecha_fin ? ` a ${formatearFechaCorta(r.fecha_fin)}` : ' (abierta)'}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {esRondaAbierta && <Badge variant="default" className="bg-green-600">Ronda abierta</Badge>}
          </div>
          {esRondaAbierta && (
            <Button variant="outline" size="sm" onClick={cerrarRonda}>
              <Lock className="w-4 h-4 mr-1" /> Cerrar ronda
            </Button>
          )}
        </div>

        {/* SEMAPHORE CARDS */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Plagas card — rows per plaga, top 5 by incidencia */}
          {(() => {
            const colors = SEMAFORO_COLORS[plagasEstado];
            const StatusIcon = colors.icon;
            return (
              <Card className={`p-4 border-2 cursor-pointer transition-shadow ${colors.border} ${colors.bg} ${seccionActiva === 'plagas' ? 'ring-2 ring-primary/50 shadow-md' : 'hover:shadow-sm'}`} onClick={() => setSeccionActiva('plagas')}>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <Bug className={`w-5 h-5 ${colors.text}`} />
                    <span className={`font-semibold text-sm ${colors.text}`}>Plagas</span>
                  </div>
                  <StatusIcon className={`w-5 h-5 ${colors.text}`} />
                </div>
                {topPlagas.length === 0 ? (
                  <>
                    <div className={`text-lg font-bold ${colors.text}`}>Sin datos</div>
                    <div className="text-xs text-brand-brown/60 mt-1">No hay registros</div>
                  </>
                ) : (
                  <div className="space-y-1.5 mt-1">
                    {topPlagas.map(p => {
                      const rowColor = p.estado === 'rojo' ? 'text-red-700'
                        : p.estado === 'amarillo' ? 'text-yellow-700' : 'text-green-700';
                      return (
                        <div key={p.nombre} className="flex items-center justify-between">
                          <span className={`text-sm font-medium ${rowColor}`}>{p.nombre}</span>
                          <span className={`text-sm font-semibold ${rowColor}`}>{p.incidenciaProm}%</span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </Card>
            );
          })()}

          {/* Floración + CE */}
          {semaforosBase.map(s => {
            const colors = SEMAFORO_COLORS[s.estado];
            const StatusIcon = colors.icon;
            const DomainIcon = s.icon;
            const seccion = DOMINIO_A_SECCION[s.dominio];
            return (
              <Card key={s.dominio} className={`p-4 border-2 cursor-pointer transition-shadow ${colors.border} ${colors.bg} ${seccionActiva === seccion ? 'ring-2 ring-primary/50 shadow-md' : 'hover:shadow-sm'}`} onClick={() => seccion && setSeccionActiva(seccion)}>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <DomainIcon className={`w-5 h-5 ${colors.text}`} />
                    <span className={`font-semibold text-sm ${colors.text}`}>{s.dominio}</span>
                  </div>
                  <StatusIcon className={`w-5 h-5 ${colors.text}`} />
                </div>
                <div className={`text-lg font-bold ${colors.text}`}>{s.label}</div>
                <div className="text-xs text-brand-brown/60 mt-1">{s.detalle}</div>
              </Card>
            );
          })}

          {/* Colmenas card — rows per apiario */}
          {(() => {
            const colors = SEMAFORO_COLORS[colmenasEstado];
            const StatusIcon = colors.icon;
            return (
              <Card className={`p-4 border-2 cursor-pointer transition-shadow ${colors.border} ${colors.bg} ${seccionActiva === 'colmenas' ? 'ring-2 ring-primary/50 shadow-md' : 'hover:shadow-sm'}`} onClick={() => setSeccionActiva('colmenas')}>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <Hexagon className={`w-5 h-5 ${colors.text}`} />
                    <span className={`font-semibold text-sm ${colors.text}`}>Colmenas</span>
                  </div>
                  <StatusIcon className={`w-5 h-5 ${colors.text}`} />
                </div>
                {colmenasConDatos.length === 0 ? (
                  <>
                    <div className={`text-lg font-bold ${colors.text}`}>Sin datos</div>
                    <div className="text-xs text-brand-brown/60 mt-1">No hay registros</div>
                  </>
                ) : (
                  <div className="space-y-2 mt-1">
                    {colmenasUltimo.map(c => {
                      const total = c.colmenas_fuertes + c.colmenas_debiles + c.colmenas_muertas;
                      const pct = total > 0 ? Math.round((c.colmenas_fuertes / total) * 100) : 0;
                      const rowColor = !c.fecha_monitoreo ? 'text-gray-400'
                        : pct > 80 ? 'text-green-800'
                        : pct >= 50 ? 'text-yellow-800' : 'text-red-800';
                      const vivas = c.colmenas_fuertes + c.colmenas_debiles;

                      return (
                        <div key={c.id}>
                          <div className={`text-sm font-semibold ${rowColor}`}>{c.apiario_nombre}</div>
                          <div className="text-xs text-brand-brown/60">
                            {c.fecha_monitoreo
                              ? `${vivas} vivas · ${c.colmenas_muertas} muertas · ${c.colmenas_con_reina} con reina`
                              : 'Sin visitas'
                            }
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </Card>
            );
          })()}
        </div>

        {/* ============================================ */}
        {/* SECTION 1: PLAGAS — Snapshot + Trend */}
        {/* ============================================ */}

        {seccionActiva === 'plagas' && (<><Card className="p-4">
          <h3 className="font-semibold text-foreground mb-4">
            Snapshot — {rondaActual?.nombre || 'Ronda seleccionada'}
          </h3>
          {snapshot.length === 0 ? (
            <div className="text-center py-8 text-brand-brown/50">No hay datos en esta ronda</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-brand-brown/60">
                    <th className="py-2 px-3 w-8"></th>
                    <th className="py-2 px-3">Lote</th>
                    <th className="py-2 px-3">Fecha</th>
                    {PLAGAS_INTERES.map(p => (
                      <th key={p} className="py-2 px-3 text-right text-xs">{p}</th>
                    ))}
                    <th className="py-2 px-3 text-right">Sin flor</th>
                    <th className="py-2 px-3 text-right">Brotes</th>
                    <th className="py-2 px-3 text-right">Flor</th>
                    <th className="py-2 px-3 text-right">Cuaje</th>
                    <th className="py-2 px-3 text-right">CE</th>
                  </tr>
                </thead>
                <tbody>
                  {snapshot.map(lote => {
                    const isExpanded = lotesExpandidos.has(lote.lote_id);
                    return (
                      <>
                        <tr key={lote.lote_id} className="border-b hover:bg-muted/50 cursor-pointer" onClick={() => toggleLote(lote.lote_id)}>
                          <td className="py-2 px-3">
                            {isExpanded ? <ChevronDown className="w-4 h-4 text-brand-brown/40" /> : <ChevronRight className="w-4 h-4 text-brand-brown/40" />}
                          </td>
                          <td className="py-2 px-3 font-medium">{lote.lote_nombre}</td>
                          <td className="py-2 px-3">{formatearFechaCorta(lote.fecha_monitoreo)}</td>
                          {PLAGAS_INTERES.map(p => {
                            const val = lote.plagasIncidencia[p];
                            return (
                              <td key={p} className={`py-2 px-3 text-right ${val != null ? incidenciaColor(val) : ''}`}>
                                {val != null ? `${val}%` : '—'}
                              </td>
                            );
                          })}
                          <td className="py-2 px-3 text-right">{lote.floracion_sin_flor || '—'}</td>
                          <td className="py-2 px-3 text-right">{lote.floracion_brotes || '—'}</td>
                          <td className="py-2 px-3 text-right">{lote.floracion_flor_madura || '—'}</td>
                          <td className="py-2 px-3 text-right">{lote.floracion_cuaje || '—'}</td>
                          <td className={`py-2 px-3 text-right ${lote.ce != null ? ceColor(lote.ce) : ''}`}>
                            {lote.ce != null ? lote.ce.toFixed(2) : '—'}
                          </td>
                        </tr>
                        {isExpanded && lote.sublotes?.map(sub => (
                          <tr key={sub.sublote_id} className="border-b bg-muted/30">
                            <td className="py-1.5 px-3"></td>
                            <td className="py-1.5 px-3 pl-8 text-brand-brown/70 text-xs">{sub.sublote_nombre}</td>
                            <td className="py-1.5 px-3 text-xs">{formatearFechaCorta(sub.fecha_monitoreo)}</td>
                            {PLAGAS_INTERES.map(p => {
                              const val = sub.plagasIncidencia[p];
                              return (
                                <td key={p} className={`py-1.5 px-3 text-right text-xs ${val != null ? incidenciaColor(val) : ''}`}>
                                  {val != null ? `${val}%` : '—'}
                                </td>
                              );
                            })}
                            <td className="py-1.5 px-3 text-right text-xs">{sub.floracion_sin_flor || '—'}</td>
                            <td className="py-1.5 px-3 text-right text-xs">{sub.floracion_brotes || '—'}</td>
                            <td className="py-1.5 px-3 text-right text-xs">{sub.floracion_flor_madura || '—'}</td>
                            <td className="py-1.5 px-3 text-right text-xs">{sub.floracion_cuaje || '—'}</td>
                            <td className="py-1.5 px-3 text-right text-xs">—</td>
                          </tr>
                        ))}
                      </>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <Card className="p-4">
          <Tabs value={plagasTab} onValueChange={setPlagasTab}>
            <TabsList className="grid w-full grid-cols-2 mb-4">
              <TabsTrigger value="heatmap" className="flex items-center gap-2">
                <Grid3X3 className="h-4 w-4" />
                Mapa de Calor
              </TabsTrigger>
              <TabsTrigger value="tendencias" className="flex items-center gap-2">
                <TrendingUp className="h-4 w-4" />
                Tendencias
              </TabsTrigger>
            </TabsList>

            <TabsContent value="heatmap">
              <div className="-m-4">
                <MapaCalorIncidencias
                  monitoreos={allMonitoreos as any}
                  rangoSeleccionado="todo"
                  modoVisualizacion="ultimos3"
                />
              </div>
            </TabsContent>

            <TabsContent value="tendencias">
              <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
                <h3 className="font-semibold text-foreground">Tendencia de Plagas (por ronda)</h3>
                <div className="flex gap-3">
                  <div className="relative">
                    <Button variant="outline" size="sm" className="text-xs" onClick={(e) => {
                      const el = e.currentTarget.nextElementSibling as HTMLElement;
                      el.classList.toggle('hidden');
                    }}>
                      Lotes ({lotesVisiblesPlagas.length}/{lotes.length})
                    </Button>
                    <div className="hidden absolute right-0 top-full mt-1 z-50 bg-white border rounded-md shadow-lg p-2 w-64">
                      <div className="flex gap-1 mb-2 border-b pb-2">
                        <button className="text-[10px] px-2 py-0.5 rounded bg-muted hover:bg-muted/80" onClick={() => setLotesVisiblesPlagas(lotes.map(l => l.id))}>Todos</button>
                        <button className="text-[10px] px-2 py-0.5 rounded bg-muted hover:bg-muted/80" onClick={() => setLotesVisiblesPlagas([])}>Ninguno</button>
                      </div>
                      <div className="max-h-52 overflow-y-auto space-y-0.5">
                        {lotes.map(l => (
                          <div key={l.id} className="flex items-center justify-between gap-1 px-1.5 py-0.5 hover:bg-muted/50 rounded group">
                            <label className="flex items-center gap-1.5 text-xs cursor-pointer flex-1 min-w-0">
                              <input type="checkbox" checked={lotesVisiblesPlagas.includes(l.id)} onChange={() => toggleLotePlagas(l.id)} className="w-3 h-3 shrink-0" />
                              <span className="truncate">{l.nombre}</span>
                            </label>
                            <button
                              className="text-[9px] text-brand-brown/40 hover:text-primary opacity-0 group-hover:opacity-100 shrink-0"
                              onClick={() => setLotesVisiblesPlagas([l.id])}
                            >
                              solo
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                  <div className="relative">
                    <Button variant="outline" size="sm" className="text-xs" onClick={(e) => {
                      const el = e.currentTarget.nextElementSibling as HTMLElement;
                      el.classList.toggle('hidden');
                    }}>
                      Plagas ({plagasVisibles.length}/{todasLasPlagas.length})
                    </Button>
                    <div className="hidden absolute right-0 top-full mt-1 z-50 bg-white border rounded-md shadow-lg p-2 w-64">
                      <div className="flex gap-1 mb-2 border-b pb-2">
                        <button className="text-[10px] px-2 py-0.5 rounded bg-muted hover:bg-muted/80" onClick={() => setPlagasVisibles([...todasLasPlagas])}>Todas</button>
                        <button className="text-[10px] px-2 py-0.5 rounded bg-muted hover:bg-muted/80" onClick={() => setPlagasVisibles([])}>Ninguna</button>
                      </div>
                      <div className="max-h-52 overflow-y-auto space-y-0.5">
                        {todasLasPlagas.map(p => (
                          <div key={p} className="flex items-center justify-between gap-1 px-1.5 py-0.5 hover:bg-muted/50 rounded group">
                            <label className="flex items-center gap-1.5 text-xs cursor-pointer flex-1 min-w-0">
                              <input type="checkbox" checked={plagasVisibles.includes(p)} onChange={() => togglePlagaVisible(p)} className="w-3 h-3 shrink-0" />
                              <span className="truncate">{p}</span>
                            </label>
                            <button
                              className="text-[9px] text-brand-brown/40 hover:text-primary opacity-0 group-hover:opacity-100 shrink-0"
                              onClick={() => setPlagasVisibles([p])}
                            >
                              solo
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
              {plagasChartData.length > 1 ? (
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={plagasChartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    <XAxis dataKey="fechas" fontSize={10} angle={-25} textAnchor="end" height={50} />
                    <YAxis fontSize={12} unit="%" />
                    <Tooltip formatter={(value: number, name: string) => [`${value}%`, name]} labelFormatter={(_: string, payload: any[]) => payload?.[0]?.payload?.fechasDetalle || payload?.[0]?.payload?.fechas || ''} />
                    <Legend />
                    {getPlagasChartKeys().map(({ key, color }) => (
                      <Line key={key} type="monotone" dataKey={key} stroke={color} strokeWidth={2} dot={{ r: 3 }} connectNulls />
                    ))}
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <div className="text-center py-8 text-brand-brown/50 text-sm">Se necesitan al menos 2 rondas para ver tendencias</div>
              )}
            </TabsContent>
          </Tabs>
        </Card></>)}

        {/* ============================================ */}
        {/* SECTION FLORACION — Table + Grouped Stacked Bar */}
        {/* ============================================ */}

        {seccionActiva === 'floracion' && (() => {
          const florData = calcularEstadoFloracion(monitoreos);

          return (
            <>
              <Card className="p-4">
                <h3 className="font-semibold text-foreground mb-4">
                  Floración — {rondaActual?.nombre || 'Ronda seleccionada'}
                </h3>
                {florData.arbolesMonitoreados === 0 ? (
                  <div className="text-center py-8 text-brand-brown/50">No hay datos de floración en esta ronda</div>
                ) : (
                  <>
                    <div className="grid grid-cols-4 gap-4 mb-4">
                      <div className="text-center p-3 rounded bg-gray-100">
                        <div className="text-2xl font-bold text-gray-700">{florData.pctSinFlor}%</div>
                        <div className="text-xs text-gray-600">Sin flor ({florData.sinFlor})</div>
                      </div>
                      <div className="text-center p-3 rounded bg-green-100">
                        <div className="text-2xl font-bold text-green-700">{florData.pctBrotes}%</div>
                        <div className="text-xs text-green-600">Brotes ({florData.brotes})</div>
                      </div>
                      <div className="text-center p-3 rounded bg-yellow-100">
                        <div className="text-2xl font-bold text-yellow-700">{florData.pctFlorMadura}%</div>
                        <div className="text-xs text-yellow-600">Flor Madura ({florData.florMadura})</div>
                      </div>
                      <div className="text-center p-3 rounded bg-orange-100">
                        <div className="text-2xl font-bold text-orange-700">{florData.pctCuaje}%</div>
                        <div className="text-xs text-orange-600">Cuaje ({florData.cuaje})</div>
                      </div>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b text-left text-brand-brown/60">
                            <th className="py-2 px-3 w-8"></th>
                            <th className="py-2 px-3">Lote</th>
                            <th className="py-2 px-3 text-right">Sin flor</th>
                            <th className="py-2 px-3 text-right">Brotes</th>
                            <th className="py-2 px-3 text-right">Flor Madura</th>
                            <th className="py-2 px-3 text-right">Cuaje</th>
                          </tr>
                        </thead>
                        <tbody>
                          {snapshot.map(lote => {
                            const isExpanded = lotesExpandidos.has(lote.lote_id);
                            return (
                              <React.Fragment key={lote.lote_id}>
                                <tr className="border-b hover:bg-muted/50 cursor-pointer" onClick={() => toggleLote(lote.lote_id)}>
                                  <td className="py-2 px-3">
                                    {isExpanded ? <ChevronDown className="w-4 h-4 text-brand-brown/40" /> : <ChevronRight className="w-4 h-4 text-brand-brown/40" />}
                                  </td>
                                  <td className="py-2 px-3 font-medium">{lote.lote_nombre}</td>
                                  {(() => {
                                    const sample = lote.arboles_monitoreados || 0;
                                    const pct = (v: number) => sample > 0 ? Math.round((v / sample) * 100) : 0;
                                    const fmt = (v: number) => v || sample ? <><span className="font-medium">{v}/{sample}</span> <span className="text-brand-brown/40">({pct(v)}%)</span></> : '—';
                                    return (<>
                                      <td className="py-2 px-3 text-right text-gray-700">{fmt(lote.floracion_sin_flor)}</td>
                                      <td className="py-2 px-3 text-right text-green-700">{fmt(lote.floracion_brotes)}</td>
                                      <td className="py-2 px-3 text-right text-yellow-700">{fmt(lote.floracion_flor_madura)}</td>
                                      <td className="py-2 px-3 text-right text-orange-700">{fmt(lote.floracion_cuaje)}</td>
                                    </>);
                                  })()}
                                </tr>
                                {isExpanded && lote.sublotes?.map(sub => {
                                  const subSample = sub.arboles_monitoreados || 0;
                                  const subPct = (v: number) => subSample > 0 ? Math.round((v / subSample) * 100) : 0;
                                  const subFmt = (v: number) => v || subSample ? <><span className="font-medium">{v}/{subSample}</span> <span className="text-brand-brown/40">({subPct(v)}%)</span></> : '—';
                                  return (
                                  <tr key={sub.sublote_id} className="border-b bg-muted/30">
                                    <td className="py-1.5 px-3"></td>
                                    <td className="py-1.5 px-3 pl-8 text-brand-brown/70 text-xs">{sub.sublote_nombre}</td>
                                    <td className="py-1.5 px-3 text-right text-xs text-gray-700">{subFmt(sub.floracion_sin_flor)}</td>
                                    <td className="py-1.5 px-3 text-right text-xs text-green-700">{subFmt(sub.floracion_brotes)}</td>
                                    <td className="py-1.5 px-3 text-right text-xs text-yellow-700">{subFmt(sub.floracion_flor_madura)}</td>
                                    <td className="py-1.5 px-3 text-right text-xs text-orange-700">{subFmt(sub.floracion_cuaje)}</td>
                                  </tr>
                                  );
                                })}
                              </React.Fragment>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </>
                )}
              </Card>

              {/* Evolución / Por registro chart */}
              {(() => {
                const florRondaId = floracionRondaSel || rondas[0]?.id || '';
                const florPorLoteData = floracionVista === 'por_registro'
                  ? calcularFloracionPorLote(
                      allMonitoreos.filter(m => m.ronda_id === florRondaId)
                    )
                  : [];

                return (
                  <Card className="p-4">
                    <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
                      <h3 className="font-semibold text-foreground">Evolución de Floración</h3>
                      <div className="flex gap-2 items-center">
                        <div className="flex border rounded-md overflow-hidden text-xs">
                          <button
                            className={`px-3 py-1.5 ${floracionVista === 'historico' ? 'bg-primary text-white' : 'bg-white text-brand-brown/70 hover:bg-muted/50'}`}
                            onClick={() => setFloracionVista('historico')}
                          >
                            Histórico
                          </button>
                          <button
                            className={`px-3 py-1.5 ${floracionVista === 'por_registro' ? 'bg-primary text-white' : 'bg-white text-brand-brown/70 hover:bg-muted/50'}`}
                            onClick={() => setFloracionVista('por_registro')}
                          >
                            Por registro
                          </button>
                        </div>
                        {floracionVista === 'por_registro' && (
                          <Select value={florRondaId} onValueChange={setFloracionRondaSel}>
                            <SelectTrigger className="w-56">
                              <SelectValue placeholder="Ronda" />
                            </SelectTrigger>
                            <SelectContent>
                              {rondas.map(r => (
                                <SelectItem key={r.id} value={r.id}>
                                  {r.nombre || formatearFechaCorta(r.fecha_inicio)}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        )}
                      </div>
                    </div>

                    {/* Legend */}
                    <div className="flex gap-4 text-xs mb-3">
                      <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm inline-block" style={{ backgroundColor: '#9ca3af' }} /> Sin flor</span>
                      <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm inline-block" style={{ backgroundColor: '#22c55e' }} /> Brotes</span>
                      <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm inline-block" style={{ backgroundColor: '#eab308' }} /> Flor Madura</span>
                      <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm inline-block" style={{ backgroundColor: '#f97316' }} /> Cuaje</span>
                    </div>

                    {floracionVista === 'historico' ? (
                      tendenciaFloracionData.length >= 1 ? (
                        <ResponsiveContainer width="100%" height={350}>
                          <BarChart data={tendenciaFloracionData} stackOffset="expand">
                            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" vertical={false} />
                            <XAxis dataKey="fechas" fontSize={11} />
                            <YAxis fontSize={12} tickFormatter={(v: number) => `${Math.round(v * 100)}%`} />
                            <Tooltip formatter={(value: number, name: string, props: any) => {
                              const total = (props.payload.sinFlor || 0) + (props.payload.brotes || 0) + (props.payload.flor || 0) + (props.payload.cuaje || 0);
                              const pct = total > 0 ? Math.round((value / total) * 100) : 0;
                              return [`${value} (${pct}%)`, name];
                            }} />
                            <Bar dataKey="sinFlor" name="Sin flor" stackId="flor" fill="#9ca3af" />
                            <Bar dataKey="brotes" name="Brotes" stackId="flor" fill="#22c55e" />
                            <Bar dataKey="flor" name="Flor Madura" stackId="flor" fill="#eab308" />
                            <Bar dataKey="cuaje" name="Cuaje" stackId="flor" fill="#f97316" radius={[2, 2, 0, 0]} />
                          </BarChart>
                        </ResponsiveContainer>
                      ) : (
                        <div className="text-center py-8 text-brand-brown/50 text-sm">No hay datos de floración</div>
                      )
                    ) : (
                      florPorLoteData.length > 0 ? (
                        <ResponsiveContainer width="100%" height={350}>
                          <BarChart data={florPorLoteData} barCategoryGap="20%">
                            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" vertical={false} />
                            <XAxis dataKey="loteNombre" fontSize={10} angle={-25} textAnchor="end" height={60} interval={0} />
                            <YAxis fontSize={12} label={{ value: 'Árboles', angle: -90, position: 'insideLeft', style: { fontSize: 11, fill: '#78716c' } }} />
                            <Tooltip formatter={(value: number, name: string) => [value, name]} />
                            <Bar dataKey="sinFlor" name="Sin flor" fill="#9ca3af" />
                            <Bar dataKey="brotes" name="Brotes" fill="#22c55e" />
                            <Bar dataKey="florMadura" name="Flor Madura" fill="#eab308" />
                            <Bar dataKey="cuaje" name="Cuaje" fill="#f97316" />
                          </BarChart>
                        </ResponsiveContainer>
                      ) : (
                        <div className="text-center py-8 text-brand-brown/50 text-sm">No hay datos de floración para esta ronda</div>
                      )
                    )}
                  </Card>
                );
              })()}
            </>
          );
        })()}

        {/* ============================================ */}
        {/* SECTION 2: CE — Distribution over time + Summary + Drill-down */}
        {/* ============================================ */}

        {seccionActiva === 'ce' && (() => {
          const ceTemporalData = getCETemporalData();
          const ceResumen = getCEResumenLotes();
          const ceFechas = getCEFechasDisponibles();
          const fechaSeleccionada = ceRegistroFecha || ceFechas[0] || '';
          const ceRegistroData = ceVista === 'por_registro' ? getCEPorRegistro(fechaSeleccionada) : [];

          return (
            <>
              <Card className="p-4">
                <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
                  <h3 className="font-semibold text-foreground">Distribución CE</h3>
                  <div className="flex gap-2 items-center">
                    {/* View toggle */}
                    <div className="flex border rounded-md overflow-hidden text-xs">
                      <button
                        className={`px-3 py-1.5 ${ceVista === 'historico' ? 'bg-primary text-white' : 'bg-white text-brand-brown/70 hover:bg-muted/50'}`}
                        onClick={() => setCeVista('historico')}
                      >
                        Histórico
                      </button>
                      <button
                        className={`px-3 py-1.5 ${ceVista === 'por_registro' ? 'bg-primary text-white' : 'bg-white text-brand-brown/70 hover:bg-muted/50'}`}
                        onClick={() => setCeVista('por_registro')}
                      >
                        Por registro
                      </button>
                    </div>
                    {/* Context-dependent selector */}
                    {ceVista === 'historico' ? (
                      <Select value={ceLoteFiltro} onValueChange={setCeLoteFiltro}>
                        <SelectTrigger className="w-56">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="general">General (toda la finca)</SelectItem>
                          {lotes.map(l => (
                            <SelectItem key={l.id} value={l.id}>{l.nombre}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <Select value={fechaSeleccionada} onValueChange={setCeRegistroFecha}>
                        <SelectTrigger className="w-56">
                          <SelectValue placeholder="Fecha" />
                        </SelectTrigger>
                        <SelectContent>
                          {ceFechas.map(f => (
                            <SelectItem key={f} value={f}>{formatearFechaCorta(f)}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  </div>
                </div>

                {/* Legend */}
                <div className="flex gap-4 text-xs mb-3">
                  <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm inline-block" style={{ backgroundColor: '#f87171' }} /> Bajo (&lt;0.5)</span>
                  <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm inline-block" style={{ backgroundColor: '#22c55e' }} /> En rango (0.5–1.5)</span>
                  <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm inline-block" style={{ backgroundColor: '#facc15' }} /> Alto (&gt;1.5)</span>
                </div>

                {ceVista === 'historico' ? (
                  /* ---- HISTORICO VIEW ---- */
                  ceTemporalData.length > 0 ? (
                    <ResponsiveContainer width="100%" height={300}>
                      <BarChart data={ceTemporalData} stackOffset="none">
                        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" vertical={false} />
                        <XAxis dataKey="fecha" fontSize={10} angle={-25} textAnchor="end" height={50} />
                        <YAxis fontSize={12} unit="%" domain={[0, 100]} />
                        <Tooltip
                          formatter={(value: number, name: string) => [`${value}%`, name]}
                          labelFormatter={(label: string, payload: any[]) => {
                            const row = payload?.[0]?.payload;
                            return row ? `${label} — Prom: ${row.promedio} dS/m · ${row.totalArboles} árboles` : label;
                          }}
                        />
                        <Bar dataKey="pctBajo" stackId="ce" fill="#f87171" name="Bajo" />
                        <Bar dataKey="pctEnRango" stackId="ce" fill="#22c55e" name="En rango" />
                        <Bar dataKey="pctAlto" stackId="ce" fill="#facc15" name="Alto" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="text-center py-8 text-brand-brown/50 text-sm">No hay datos de CE con lecturas por árbol</div>
                  )
                ) : (
                  /* ---- POR REGISTRO VIEW ---- */
                  ceRegistroData.length > 0 ? (
                    <ResponsiveContainer width="100%" height={300}>
                      <BarChart data={ceRegistroData} stackOffset="none">
                        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" vertical={false} />
                        <XAxis dataKey="lote_nombre" fontSize={10} angle={-25} textAnchor="end" height={60} interval={0} />
                        <YAxis fontSize={12} unit="%" domain={[0, 100]} />
                        <Tooltip
                          formatter={(value: number, name: string) => [`${value}%`, name]}
                          labelFormatter={(label: string, payload: any[]) => {
                            const row = payload?.[0]?.payload;
                            return row ? `${label} — Prom: ${row.promedio.toFixed(2)} dS/m` : label;
                          }}
                        />
                        <Bar dataKey="pctBajo" stackId="ce" fill="#f87171" name="Bajo" />
                        <Bar dataKey="pctEnRango" stackId="ce" fill="#22c55e" name="En rango" />
                        <Bar dataKey="pctAlto" stackId="ce" fill="#facc15" name="Alto" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="text-center py-8 text-brand-brown/50 text-sm">No hay datos de CE para esta fecha</div>
                  )
                )}
              </Card>

              {/* CE Summary table per lote (latest measurement) */}
              {ceResumen.length > 0 && (
                <Card className="p-4">
                  <h3 className="font-semibold text-foreground mb-4">Resumen CE por lote — Última medición</h3>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b text-left text-brand-brown/60">
                          <th className="py-2 px-3">Lote</th>
                          <th className="py-2 px-3">Fecha</th>
                          <th className="py-2 px-3 text-right">Promedio</th>
                          <th className="py-2 px-3 text-right text-red-600">% Bajo</th>
                          <th className="py-2 px-3 text-right text-green-600">% En rango</th>
                          <th className="py-2 px-3 text-right text-yellow-600">% Alto</th>
                        </tr>
                      </thead>
                      <tbody>
                        {ceResumen.map(r => (
                          <tr
                            key={r.lote_id}
                            className="border-b hover:bg-muted/50 cursor-pointer"
                            onClick={() => setCeDrilldownLote(r)}
                          >
                            <td className="py-2 px-3 font-medium">{r.lote_nombre}</td>
                            <td className="py-2 px-3">{formatearFechaCorta(r.fecha)}</td>
                            <td className="py-2 px-3 text-right font-medium">{r.promedio.toFixed(2)} dS/m</td>
                            <td className="py-2 px-3 text-right text-red-600 font-medium">{r.pctBajo}%</td>
                            <td className="py-2 px-3 text-right text-green-600 font-medium">{r.pctEnRango}%</td>
                            <td className="py-2 px-3 text-right text-yellow-600 font-medium">{r.pctAlto}%</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <p className="text-xs text-brand-brown/40 mt-2">Click en un lote para ver detalle por árbol</p>
                </Card>
              )}

              {/* CE Drill-down modal: bar chart per tree */}
              <Dialog open={!!ceDrilldownLote} onOpenChange={(open) => !open && setCeDrilldownLote(null)}>
                <DialogContent size="xl">
                  <DialogHeader>
                    <DialogTitle>
                      CE por árbol — {ceDrilldownLote?.lote_nombre} ({ceDrilldownLote?.fecha ? formatearFechaCorta(ceDrilldownLote.fecha) : ''})
                    </DialogTitle>
                  </DialogHeader>
                  <DialogBody>
                  {ceDrilldownLote && (() => {
                    const lecturas = ceDrilldownLote.lecturas
                      .filter(l => l.alta != null || l.baja != null)
                      .sort((a, b) => a.arbol - b.arbol);

                    const chartData = lecturas.map(l => ({
                      arbol: `#${l.arbol}`,
                      alta: l.alta ?? 0,
                      baja: l.baja ?? 0,
                    }));

                    const maxVal = Math.max(
                      ...lecturas.map(l => Math.max(l.alta ?? 0, l.baja ?? 0)),
                      CE_UMBRAL_ALTO + 0.5
                    );

                    return (
                      <div>
                        <div className="flex gap-4 text-xs mb-3">
                          <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-blue-500 inline-block" /> Baja</span>
                          <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-orange-400 inline-block" /> Alta</span>
                          <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-green-100 inline-block border border-green-300" /> Rango objetivo (0.5–1.5)</span>
                        </div>
                        <ResponsiveContainer width="100%" height={350}>
                          <BarChart data={chartData} barGap={1} barSize={8}>
                            <ReferenceArea y1={0} y2={CE_UMBRAL_BAJO} fill="#fef9c3" fillOpacity={0.4} />
                            <ReferenceArea y1={CE_UMBRAL_BAJO} y2={CE_UMBRAL_ALTO} fill="#dcfce7" fillOpacity={0.5} />
                            <ReferenceArea y1={CE_UMBRAL_ALTO} y2={maxVal} fill="#fef9c3" fillOpacity={0.4} />
                            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" vertical={false} />
                            <XAxis dataKey="arbol" fontSize={9} angle={-45} textAnchor="end" height={40} interval={0} />
                            <YAxis fontSize={10} unit=" dS/m" domain={[0, maxVal]} />
                            <Tooltip formatter={(value: number, name: string) => [`${value.toFixed(2)} dS/m`, name === 'baja' ? 'Baja' : 'Alta']} />
                            <Bar dataKey="baja" fill="#3b82f6" name="Baja" radius={[2, 2, 0, 0]} />
                            <Bar dataKey="alta" fill="#fb923c" name="Alta" radius={[2, 2, 0, 0]} />
                          </BarChart>
                        </ResponsiveContainer>
                        <div className="mt-3 grid grid-cols-3 gap-4 text-sm">
                          <div className="text-center p-2 rounded bg-red-50 border border-red-200">
                            <div className="font-semibold text-red-700">{ceDrilldownLote.pctBajo}%</div>
                            <div className="text-xs text-red-600">Bajo (&lt;{CE_UMBRAL_BAJO})</div>
                          </div>
                          <div className="text-center p-2 rounded bg-green-50 border border-green-200">
                            <div className="font-semibold text-green-700">{ceDrilldownLote.pctEnRango}%</div>
                            <div className="text-xs text-green-600">En rango ({CE_UMBRAL_BAJO}–{CE_UMBRAL_ALTO})</div>
                          </div>
                          <div className="text-center p-2 rounded bg-yellow-50 border border-yellow-200">
                            <div className="font-semibold text-yellow-700">{ceDrilldownLote.pctAlto}%</div>
                            <div className="text-xs text-yellow-600">Alto (&gt;{CE_UMBRAL_ALTO})</div>
                          </div>
                        </div>
                      </div>
                    );
                  })()}
                  </DialogBody>
                </DialogContent>
              </Dialog>
            </>
          );
        })()}

        {/* ============================================ */}
        {/* SECTION 3: COLMENAS — Table + Stacked Bar */}
        {/* ============================================ */}

        {seccionActiva === 'colmenas' && colmenasUltimo.length > 0 && (
          <Card className="p-4">
            <h3 className="font-semibold text-foreground mb-4">Salud de Colmenas (último registro por apiario)</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-brand-brown/60">
                    <th className="py-2 px-3">Apiario</th>
                    <th className="py-2 px-3">Última visita</th>
                    <th className="py-2 px-3 text-right text-green-700">Fuertes</th>
                    <th className="py-2 px-3 text-right text-yellow-700">Débiles</th>
                    <th className="py-2 px-3 text-right text-red-700">Muertas</th>
                    <th className="py-2 px-3 text-right text-blue-700">Con reina</th>
                    <th className="py-2 px-3 text-right">Total</th>
                    <th className="py-2 px-3 text-right">% Fuertes</th>
                  </tr>
                </thead>
                <tbody>
                  {colmenasUltimo.map(r => {
                    const total = r.colmenas_fuertes + r.colmenas_debiles + r.colmenas_muertas;
                    const pct = total > 0 ? Math.round((r.colmenas_fuertes / total) * 100) : 0;
                    return (
                      <tr key={r.id} className="border-b hover:bg-muted/50">
                        <td className="py-2 px-3 font-medium">{r.apiario_nombre}</td>
                        <td className="py-2 px-3">{r.fecha_monitoreo ? formatearFechaCorta(r.fecha_monitoreo) : <span className="text-brand-brown/40">Sin visitas</span>}</td>
                        <td className="py-2 px-3 text-right text-green-700 font-medium">{r.colmenas_fuertes}</td>
                        <td className="py-2 px-3 text-right text-yellow-700 font-medium">{r.colmenas_debiles}</td>
                        <td className="py-2 px-3 text-right text-red-700 font-medium">{r.colmenas_muertas}</td>
                        <td className="py-2 px-3 text-right text-blue-700 font-medium">{r.colmenas_con_reina}</td>
                        <td className="py-2 px-3 text-right">{total}</td>
                        <td className="py-2 px-3 text-right font-semibold">{pct}%</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        )}

        {seccionActiva === 'colmenas' && colmenasHistorico.length > 0 && (() => {
          // Flatten: one row per fecha+apiario, with fuertes/debiles/muertas/reina
          const flatData: { fecha: string; apiario: string; fuertes: number; debiles: number; muertas: number; reina: number }[] = [];
          const fechasVistas = new Set<string>();

          for (const row of colmenasHistorico) {
            const fecha = row.fecha;
            for (const key of Object.keys(row)) {
              if (key.endsWith('_fuertes')) {
                const apiario = key.replace('_fuertes', '');
                flatData.push({
                  fecha,
                  apiario,
                  fuertes: row[`${apiario}_fuertes`] || 0,
                  debiles: row[`${apiario}_debiles`] || 0,
                  muertas: row[`${apiario}_muertas`] || 0,
                  reina: row[`${apiario}_reina`] || 0,
                });
                fechasVistas.add(fecha);
              }
            }
          }

          // Group into chart rows: each bar = one apiario in one fecha
          // XAxis = apiario name, grouped visually by fecha via reference lines
          const fechas = Array.from(fechasVistas);

          return (
            <Card className="p-4">
              <h3 className="font-semibold text-foreground mb-4">Historial de Colmenas</h3>
              <div className="flex gap-6 overflow-x-auto pb-2">
                {fechas.map(fecha => {
                  const barras = flatData.filter(d => d.fecha === fecha);
                  return (
                    <div key={fecha} className="flex-shrink-0">
                      <div className="text-center text-xs font-medium text-brand-brown/70 mb-2">{fecha}</div>
                      <ResponsiveContainer width={barras.length * 80 + 40} height={220}>
                        <BarChart data={barras} barSize={30}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" vertical={false} />
                          <XAxis dataKey="apiario" fontSize={10} tickLine={false} axisLine={false} />
                          <YAxis fontSize={10} width={30} />
                          <Tooltip formatter={(value: number, name: string) => [value, name]} />
                          <Bar dataKey="fuertes" stackId="a" fill="#22c55e" name="Fuertes" />
                          <Bar dataKey="debiles" stackId="a" fill="#eab308" name="Débiles" />
                          <Bar dataKey="muertas" stackId="a" fill="#ef4444" name="Muertas" radius={[4, 4, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                      <div className="flex text-xs text-blue-700 mt-1" style={{ paddingLeft: 30 }}>
                        {barras.map(b => (
                          <span key={b.apiario} className="text-center" style={{ width: 80 }}>{b.reina}♛</span>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </Card>
          );
        })()}
      </div>
    </div>
  );
}
