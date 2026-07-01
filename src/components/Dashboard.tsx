import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getSupabase } from '../utils/supabase/client';
import { formatNumber, formatCompact } from '../utils/format';
import {
  CompactAlertList,
  EstadoHeader,
  ClimaCard,
  QuickLinksRow,
  type Alerta,
} from './dashboard/index';
import { KPIScorecard } from './finanzas/dashboard/components/KPIScorecard';
import { useGanadoInventario } from './ganado/hooks/useGanadoInventario';
import { calcularKPIsInventario, calcularVariacion } from '../utils/calculosGanado';

// Plagas de interés para el KPI de incidencia
const PLAGAS_INTERES = [
  'Monalonion',
  'Ácaro',
  'Huevos de Ácaro',
  'Ácaro Cristalino',
  'Cucarrón marceño',
  'Trips',
];

interface KPIsDashboard {
  incidencia: number | null;
  incidenciaVariacion: number | undefined;
  jornalesSemana: number;
  jornalesVariacion: number | undefined;
  gastoMes: number;
  gastoVariacion: number | undefined;
  ganadoCabezas: number;
  ganadoVariacion: number | undefined;
}

const KPIS_VACIO: KPIsDashboard = {
  incidencia: null,
  incidenciaVariacion: undefined,
  jornalesSemana: 0,
  jornalesVariacion: undefined,
  gastoMes: 0,
  gastoVariacion: undefined,
  ganadoCabezas: 0,
  ganadoVariacion: undefined,
};

function KPITileSkeleton() {
  return (
    <div className="rounded-xl border border-primary/10 bg-white p-4 shadow-sm animate-pulse">
      <div className="h-3 bg-gray-200 rounded w-16 mb-2" />
      <div className="h-6 bg-gray-200 rounded w-20" />
    </div>
  );
}

/**
 * Dashboard Principal — feed de alertas + pulso de la finca, pensado para
 * un vistazo rápido entre tareas de campo (no un reporte de escritorio).
 */
export function Dashboard() {
  const navigate = useNavigate();
  const { fetchInventario, fetchMovimientos, countPendientes } = useGanadoInventario();
  const [alertas, setAlertas] = useState<Alerta[]>([]);
  const [kpis, setKpis] = useState<KPIsDashboard>(KPIS_VACIO);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadDashboardData();

    // Auto-refresh cada 2 minutos
    const interval = setInterval(loadDashboardData, 2 * 60 * 1000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadDashboardData = async () => {
    try {
      const supabase = getSupabase();

      await Promise.all([
        loadKPIs(supabase),
        loadAlertas(supabase),
      ]);
    } catch (err) {
      console.error('Failed to load dashboard stats:', err);
    } finally {
      setIsLoading(false);
    }
  };

  /**
   * Cargar KPIs — un número + tendencia por módulo, sin gráficas ni
   * detalle: son un vistazo, no un reporte.
   */
  const loadKPIs = async (supabase: any) => {
    const now = new Date();

    const loadIncidencia = async (): Promise<{ incidencia: number | null; variacion: number | undefined }> => {
      const { data: catalogoPlagas, error: errorCatalogo } = await supabase
        .from('plagas_enfermedades_catalogo')
        .select('id, nombre')
        .eq('activo', true);
      if (errorCatalogo) return { incidencia: null, variacion: undefined };

      const plagasInteresIds = catalogoPlagas
        ?.filter((p: any) => PLAGAS_INTERES.some(nombre => p.nombre.toLowerCase().includes(nombre.toLowerCase())))
        .map((p: any) => p.id) || [];
      if (plagasInteresIds.length === 0) return { incidencia: null, variacion: undefined };

      const hace14Dias = new Date(now);
      hace14Dias.setDate(hace14Dias.getDate() - 14);
      const { data, error } = await supabase
        .from('monitoreos')
        .select('fecha_monitoreo, arboles_monitoreados, arboles_afectados')
        .in('plaga_enfermedad_id', plagasInteresIds)
        .gte('fecha_monitoreo', hace14Dias.toISOString());
      if (error || !data || data.length === 0) return { incidencia: null, variacion: undefined };

      const hace7Dias = new Date(now);
      hace7Dias.setDate(hace7Dias.getDate() - 7);
      const calcularIncidencia = (rows: any[]): number | null => {
        const afectados = rows.reduce((s, m) => s + (m.arboles_afectados || 0), 0);
        const monitoreados = rows.reduce((s, m) => s + (m.arboles_monitoreados || 0), 0);
        return monitoreados > 0 ? (afectados / monitoreados) * 100 : null;
      };
      const actual = calcularIncidencia(data.filter((m: any) => new Date(m.fecha_monitoreo) >= hace7Dias));
      const anterior = calcularIncidencia(data.filter((m: any) => new Date(m.fecha_monitoreo) < hace7Dias));
      const variacion = actual !== null && anterior !== null && anterior > 0
        ? ((actual - anterior) / anterior) * 100
        : undefined;
      return { incidencia: actual, variacion };
    };

    const loadJornales = async (): Promise<{ jornalesSemana: number; variacion: number | undefined }> => {
      const diaSemana = now.getDay();
      const diasDesdeLunes = diaSemana === 0 ? 6 : diaSemana - 1;
      const lunesActual = new Date(now);
      lunesActual.setDate(now.getDate() - diasDesdeLunes);
      lunesActual.setHours(0, 0, 0, 0);
      const lunesAnterior = new Date(lunesActual);
      lunesAnterior.setDate(lunesActual.getDate() - 7);

      const { data, error } = await supabase
        .from('registros_trabajo')
        .select('fecha_trabajo, fraccion_jornal')
        .gte('fecha_trabajo', lunesAnterior.toISOString().split('T')[0])
        .lte('fecha_trabajo', now.toISOString().split('T')[0]);
      if (error || !data) return { jornalesSemana: 0, variacion: undefined };

      const fechaLunesActual = lunesActual.toISOString().split('T')[0];
      let jornalesSemana = 0;
      let jornalesSemanaAnterior = 0;
      data.forEach((r: any) => {
        const jornal = Number(r.fraccion_jornal) || 0;
        if (r.fecha_trabajo >= fechaLunesActual) jornalesSemana += jornal;
        else jornalesSemanaAnterior += jornal;
      });
      const variacion = jornalesSemanaAnterior > 0
        ? ((jornalesSemana - jornalesSemanaAnterior) / jornalesSemanaAnterior) * 100
        : undefined;
      return { jornalesSemana: Math.round(jornalesSemana * 100) / 100, variacion };
    };

    const loadGasto = async (): Promise<{ gastoMes: number; variacion: number | undefined }> => {
      const inicioMesActual = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
      const inicioMesAnterior = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString().split('T')[0];
      const finMesAnterior = new Date(now.getFullYear(), now.getMonth(), 0).toISOString().split('T')[0];

      const { data, error } = await supabase
        .from('fin_gastos')
        .select('valor, fecha')
        .eq('estado', 'Confirmado')
        .gte('fecha', inicioMesAnterior)
        .lte('fecha', now.toISOString().split('T')[0]);
      if (error || !data) return { gastoMes: 0, variacion: undefined };

      let gastoMes = 0;
      let gastoMesAnterior = 0;
      data.forEach((g: any) => {
        const valor = Number(g.valor) || 0;
        if (g.fecha >= inicioMesActual) gastoMes += valor;
        else if (g.fecha <= finMesAnterior) gastoMesAnterior += valor;
      });
      const variacion = gastoMesAnterior > 0
        ? ((gastoMes - gastoMesAnterior) / gastoMesAnterior) * 100
        : undefined;
      return { gastoMes, variacion };
    };

    const loadGanado = async (): Promise<{ ganadoCabezas: number; variacion: number | undefined }> => {
      try {
        const [rows, movimientos] = await Promise.all([fetchInventario(), fetchMovimientos()]);
        const kpisGanado = calcularKPIsInventario(rows);
        const hace30Dias = new Date(now);
        hace30Dias.setDate(hace30Dias.getDate() - 30);
        const variacionCabezas = calcularVariacion(movimientos, hace30Dias.toISOString().split('T')[0]);
        const variacion = kpisGanado.totalCabezas > 0
          ? (variacionCabezas.neto / kpisGanado.totalCabezas) * 100
          : undefined;
        return { ganadoCabezas: kpisGanado.totalCabezas, variacion };
      } catch {
        return { ganadoCabezas: 0, variacion: undefined };
      }
    };

    const [incidenciaRes, jornalesRes, gastoRes, ganadoRes] = await Promise.all([
      loadIncidencia(),
      loadJornales(),
      loadGasto(),
      loadGanado(),
    ]);

    setKpis({
      incidencia: incidenciaRes.incidencia,
      incidenciaVariacion: incidenciaRes.variacion,
      jornalesSemana: jornalesRes.jornalesSemana,
      jornalesVariacion: jornalesRes.variacion,
      gastoMes: gastoRes.gastoMes,
      gastoVariacion: gastoRes.variacion,
      ganadoCabezas: ganadoRes.ganadoCabezas,
      ganadoVariacion: ganadoRes.variacion,
    });
  };

  /**
   * Cargar alertas cross-module (Pulso de Gestión)
   */
  const loadAlertas = async (supabase: any) => {
    try {
      const now = new Date();

      // --- Helper 1: Monitoreo — Pest Spikes (last 14 days) ---
      const loadMonitoreoAlertas = async (): Promise<Alerta[]> => {
        const hace14Dias = new Date(now);
        hace14Dias.setDate(hace14Dias.getDate() - 14);

        const { data, error } = await supabase
          .from('monitoreos')
          .select('incidencia, arboles_monitoreados, arboles_afectados, plagas_enfermedades_catalogo(nombre)')
          .gte('fecha_monitoreo', hace14Dias.toISOString());

        if (error || !data) return [];

        const porPlaga: Record<string, { afectados: number; monitoreados: number }> = {};
        for (const m of data) {
          const nombre = m.plagas_enfermedades_catalogo?.nombre;
          if (!nombre) continue;
          if (!porPlaga[nombre]) porPlaga[nombre] = { afectados: 0, monitoreados: 0 };
          porPlaga[nombre].afectados += (m as any).arboles_afectados || 0;
          porPlaga[nombre].monitoreados += (m as any).arboles_monitoreados || 0;
        }

        const alertas: Alerta[] = [];
        for (const [nombre, { afectados, monitoreados }] of Object.entries(porPlaga)) {
          const avg = monitoreados > 0 ? (afectados / monitoreados) * 100 : 0;
          if (avg > 10) {
            alertas.push({
              id: `monitoreo-${nombre}`,
              tipo: 'monitoreo',
              mensaje: `${nombre} con incidencia promedio del ${Math.round(avg)}% en últimas 2 semanas`,
              fecha: now.toISOString(),
              prioridad: avg > 20 ? 'alta' : 'media',
            });
          }
        }
        return alertas;
      };

      // --- Helper 2: Aplicaciones — Stuck Operations ---
      const loadAplicacionesAlertas = async (): Promise<Alerta[]> => {
        const { data, error } = await supabase
          .from('aplicaciones')
          .select('id, nombre_aplicacion, estado, created_at, fecha_inicio_planeada')
          .in('estado', ['Calculada', 'En ejecución']);

        if (error || !data) return [];

        const alertas: Alerta[] = [];
        for (const a of data) {
          const ref = a.estado === 'Calculada' ? a.created_at : a.fecha_inicio_planeada;
          if (!ref) continue;
          const diasDesde = Math.floor((now.getTime() - new Date(ref).getTime()) / (1000 * 60 * 60 * 24));
          const umbral = a.estado === 'Calculada' ? 7 : 14;
          if (diasDesde > umbral) {
            alertas.push({
              id: `aplicacion-${a.id}`,
              tipo: 'aplicacion',
              mensaje: `'${a.nombre_aplicacion}' lleva ${diasDesde} días en ${a.estado === 'Calculada' ? 'estado Calculada' : 'ejecución'}`,
              fecha: ref,
              prioridad: 'media',
            });
          }
        }
        return alertas;
      };

      // --- Helper 3: Presupuesto — actual YTD vs. ritmo esperado del presupuesto anual ---
      const loadPresupuestoAlertas = async (): Promise<Alerta[]> => {
        const anioActual = now.getFullYear();
        const inicioAnio = `${anioActual}-01-01`;
        const hoyStr = now.toISOString().split('T')[0];
        const diaDelAnio = Math.floor((now.getTime() - new Date(anioActual, 0, 1).getTime()) / (1000 * 60 * 60 * 24)) + 1;
        const esBisiesto = (anioActual % 4 === 0 && anioActual % 100 !== 0) || anioActual % 400 === 0;
        const fraccionTranscurrida = Math.min(diaDelAnio / (esBisiesto ? 366 : 365), 1);

        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- fin_presupuestos not yet in generated DB types
        const sb = supabase as any;
        const [presupuestosRes, gastosRes] = await Promise.all([
          sb
            .from('fin_presupuestos')
            .select('negocio_id, categoria_id, monto_anual, fin_categorias_gastos(nombre)')
            .eq('anio', anioActual),
          supabase
            .from('fin_gastos')
            .select('valor, negocio_id, categoria_id')
            .eq('estado', 'Confirmado')
            .gte('fecha', inicioAnio)
            .lte('fecha', hoyStr),
        ]);

        // RLS scopes fin_presupuestos to Gerencia — vacío para otros roles, no es un error
        if (presupuestosRes.error || !presupuestosRes.data?.length || gastosRes.error) return [];

        const actualPorClave = new Map<string, number>();
        for (const g of gastosRes.data || []) {
          const clave = `${g.negocio_id}-${g.categoria_id}`;
          actualPorClave.set(clave, (actualPorClave.get(clave) || 0) + (Number(g.valor) || 0));
        }

        const alertas: Alerta[] = [];
        for (const p of presupuestosRes.data) {
          const montoAnual = Number(p.monto_anual) || 0;
          if (montoAnual <= 0) continue;
          const clave = `${p.negocio_id}-${p.categoria_id}`;
          const actual = actualPorClave.get(clave) || 0;
          if (actual === 0) continue;

          const esperado = montoAnual * fraccionTranscurrida;
          if (esperado <= 0) continue;
          const ritmo = actual / esperado;
          if (ritmo < 1.15) continue;

          const pctAnual = Math.round((actual / montoAnual) * 100);
          const nombreCategoria = p.fin_categorias_gastos?.nombre || 'Categoría';
          alertas.push({
            id: `presupuesto-${clave}`,
            tipo: 'gasto',
            mensaje: `${nombreCategoria}: $${formatCompact(actual)} de $${formatCompact(montoAnual)} presupuestado (${pctAnual}%)`,
            fecha: now.toISOString(),
            prioridad: ritmo >= 1.5 ? 'alta' : 'media',
          });
        }
        return alertas;
      };

      // --- Helper 4: Inventario — High-Value Expiring Stock ---
      const loadVencimientoAlertas = async (): Promise<Alerta[]> => {
        const en30Dias = new Date(now);
        en30Dias.setDate(en30Dias.getDate() + 30);

        const { data, error } = await supabase
          .from('compras')
          .select('cantidad, costo_unitario, fecha_vencimiento, producto_id, productos(nombre)')
          .gte('fecha_vencimiento', now.toISOString())
          .lte('fecha_vencimiento', en30Dias.toISOString());

        if (error || !data) return [];

        const alertas: Alerta[] = [];
        for (const c of data) {
          const valor = (c.cantidad || 0) * (c.costo_unitario || 0);
          if (valor < 500000) continue;
          const diasRestantes = Math.ceil((new Date(c.fecha_vencimiento).getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
          const nombre = c.productos?.nombre || 'Producto';
          alertas.push({
            id: `venc-${c.producto_id}-${c.fecha_vencimiento}`,
            tipo: 'vencimiento',
            mensaje: `${nombre} por $${formatCompact(valor)} vence en ${diasRestantes} días`,
            fecha: c.fecha_vencimiento,
            prioridad: 'alta',
          });
        }
        return alertas;
      };

      // --- Helper 5: Labores — Workforce Gap ---
      const loadLaboresAlertas = async (): Promise<Alerta[]> => {
        // Only alert past Wednesday (day 3) to avoid false positives
        if (now.getDay() < 3) return [];

        const hace5Semanas = new Date(now);
        hace5Semanas.setDate(hace5Semanas.getDate() - 35);

        const { data, error } = await supabase
          .from('registros_trabajo')
          .select('fecha_trabajo, fraccion_jornal')
          .gte('fecha_trabajo', hace5Semanas.toISOString());

        if (error || !data) return [];

        const porSemana: Record<string, number> = {};
        for (const r of data) {
          const fecha = new Date(r.fecha_trabajo);
          const startOfYear = new Date(fecha.getFullYear(), 0, 1);
          const weekNum = Math.ceil(((fecha.getTime() - startOfYear.getTime()) / (1000 * 60 * 60 * 24) + startOfYear.getDay() + 1) / 7);
          const key = `${fecha.getFullYear()}-W${weekNum}`;
          porSemana[key] = (porSemana[key] || 0) + (r.fraccion_jornal || 0);
        }

        const semanas = Object.entries(porSemana).sort(([a], [b]) => a.localeCompare(b));
        if (semanas.length < 2) return [];

        const semanaActualKey = semanas[semanas.length - 1][0];
        const totalActual = semanas[semanas.length - 1][1];

        const anteriores = semanas.slice(0, -1).slice(-4);
        if (anteriores.length === 0) return [];
        const promedio = anteriores.reduce((s, [, v]) => s + v, 0) / anteriores.length;
        if (promedio === 0) return [];

        const porcentajeAbajo = ((promedio - totalActual) / promedio) * 100;
        if (porcentajeAbajo > 50) {
          return [{
            id: `labor-${semanaActualKey}`,
            tipo: 'labor',
            mensaje: `Jornales registrados esta semana un ${Math.round(porcentajeAbajo)}% por debajo del promedio`,
            fecha: now.toISOString(),
            prioridad: 'media',
          }];
        }
        return [];
      };

      // --- Helper 6: Ganado — Pending confirmations ---
      const loadGanadoAlertas = async (): Promise<Alerta[]> => {
        const count = await countPendientes();
        if (!count) return [];
        return [{
          id: 'ganado-pendientes',
          tipo: 'ganado',
          mensaje: `${count} ${count === 1 ? 'movimiento' : 'movimientos'} de ganado ${count === 1 ? 'pendiente' : 'pendientes'} de confirmar`,
          fecha: now.toISOString(),
          prioridad: 'media',
        }];
      };

      const results = await Promise.all([
        loadMonitoreoAlertas(),
        loadAplicacionesAlertas(),
        loadPresupuestoAlertas(),
        loadVencimientoAlertas(),
        loadLaboresAlertas(),
        loadGanadoAlertas(),
      ]);

      const nuevasAlertas = results.flat();

      const alertasOrdenadas = nuevasAlertas
        .sort((a, b) => {
          if (a.prioridad === 'alta' && b.prioridad !== 'alta') return -1;
          if (a.prioridad !== 'alta' && b.prioridad === 'alta') return 1;
          if (!a.fecha) return 1;
          if (!b.fecha) return -1;
          return new Date(b.fecha).getTime() - new Date(a.fecha).getTime();
        })
        .slice(0, 6);

      setAlertas(alertasOrdenadas);
    } catch {
      setAlertas([]);
    }
  };

  const handleAlertClick = (alerta: Alerta) => {
    switch (alerta.tipo) {
      case 'monitoreo': navigate('/monitoreo'); break;
      case 'aplicacion': navigate('/aplicaciones'); break;
      case 'gasto': navigate('/finanzas/presupuesto'); break;
      case 'ganado': navigate('/ganado/movimientos'); break;
      case 'stock':
      case 'vencimiento': navigate('/inventario'); break;
      case 'labor': navigate('/labores'); break;
    }
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="relative">
        <div className="absolute -top-4 -left-4 w-32 h-32 bg-primary/5 rounded-full blur-2xl"></div>
        <div className="relative space-y-1.5">
          <h1 className="text-foreground">Dashboard</h1>
          <EstadoHeader alertas={alertas} loading={isLoading} />
        </div>
      </div>

      {/* Alertas — colapsa a nada cuando no hay ninguna */}
      {isLoading ? (
        <div className="h-16 bg-gray-100 rounded-xl animate-pulse" />
      ) : (
        <CompactAlertList alertas={alertas} onAlertClick={handleAlertClick} />
      )}

      {/* Clima — siempre visible, no depende de alertas */}
      <ClimaCard />

      {/* KPI scoreboard */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {isLoading ? (
          <>
            <KPITileSkeleton />
            <KPITileSkeleton />
            <KPITileSkeleton />
            <KPITileSkeleton />
          </>
        ) : (
          <>
            <div onClick={() => navigate('/monitoreo')} className="cursor-pointer">
              <KPIScorecard
                label="Incidencia"
                valor={kpis.incidencia ?? 0}
                valorFormateado={kpis.incidencia !== null ? `${kpis.incidencia.toFixed(1)}%` : 'Sin datos'}
                variacion={kpis.incidencia !== null ? kpis.incidenciaVariacion : undefined}
                size="sm"
              />
            </div>
            <div onClick={() => navigate('/labores')} className="cursor-pointer">
              <KPIScorecard
                label="Jornales esta semana"
                valor={kpis.jornalesSemana}
                valorFormateado={formatNumber(kpis.jornalesSemana)}
                variacion={kpis.jornalesVariacion}
                size="sm"
              />
            </div>
            <div onClick={() => navigate('/finanzas/gastos')} className="cursor-pointer">
              <KPIScorecard
                label="Gasto del mes"
                valor={kpis.gastoMes}
                valorFormateado={`$${formatCompact(kpis.gastoMes)}`}
                variacion={kpis.gastoVariacion}
                size="sm"
              />
            </div>
            <div onClick={() => navigate('/ganado')} className="cursor-pointer">
              <KPIScorecard
                label="Cabezas de ganado"
                valor={kpis.ganadoCabezas}
                valorFormateado={formatNumber(kpis.ganadoCabezas)}
                variacion={kpis.ganadoVariacion}
                size="sm"
              />
            </div>
          </>
        )}
      </div>

      {/* Accesos rápidos a módulos sin tarjeta propia */}
      <QuickLinksRow />
    </div>
  );
}
