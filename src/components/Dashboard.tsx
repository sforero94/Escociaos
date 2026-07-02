import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getSupabase } from '../utils/supabase/client';
import { formatNumber, formatCompact } from '../utils/format';
import {
  CompactAlertList,
  EstadoHeader,
  ClimaCard,
  QuickLinksRow,
  DashboardKPICard,
  PlagasKPICard,
  type Alerta,
  type PlagaKPI,
} from './dashboard/index';
import { useGanadoInventario } from './ganado/hooks/useGanadoInventario';
import { calcularKPIsInventario, calcularVariacion } from '../utils/calculosGanado';

interface KPIsDashboard {
  plagas: PlagaKPI[];
  plagasFecha: string | null;
  jornalesSemana: number;
  jornalesVariacion: number | undefined;
  jornalesSparkline: number[];
  jornalesContexto: string | null;
  gastoMes: number;
  gastoVariacion: number | undefined;
  gastoContexto: string | null;
  ganadoCabezas: number;
  ganadoNeto: number;
  ganadoContexto: string | null;
}

const KPIS_VACIO: KPIsDashboard = {
  plagas: [],
  plagasFecha: null,
  jornalesSemana: 0,
  jornalesVariacion: undefined,
  jornalesSparkline: [],
  jornalesContexto: null,
  gastoMes: 0,
  gastoVariacion: undefined,
  gastoContexto: null,
  ganadoCabezas: 0,
  ganadoNeto: 0,
  ganadoContexto: null,
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

    const loadPlagas = async (): Promise<{ plagas: PlagaKPI[]; fecha: string | null }> => {
      // 90 días = ventana amplia para asegurar al menos dos rondas de monitoreo recientes
      const hace90Dias = new Date(now);
      hace90Dias.setDate(hace90Dias.getDate() - 90);
      const { data, error } = await supabase
        .from('monitoreos')
        .select('fecha_monitoreo, ronda_id, arboles_monitoreados, arboles_afectados, plaga_enfermedad_id, plagas_enfermedades_catalogo(nombre)')
        .gte('fecha_monitoreo', hace90Dias.toISOString());
      if (error || !data || data.length === 0) return { plagas: [], fecha: null };

      // Agrupar por ronda de monitoreo (ronda_id) — es la unidad real de "un monitoreo"
      // en el módulo (ver DashboardMonitoreoV3.tsx / RegistroMonitoreo.tsx). Las filas
      // sin ronda_id (registros legado previos a Monitoreo 2.0) se agrupan por día
      // calendario de fecha_monitoreo como aproximación aceptable.
      const claveGrupo = (m: any): string =>
        m.ronda_id || `fecha:${String(m.fecha_monitoreo).slice(0, 10)}`;

      const grupos = new Map<string, { fechaMax: string; rows: any[] }>();
      for (const m of data) {
        const clave = claveGrupo(m);
        const entry = grupos.get(clave) || { fechaMax: m.fecha_monitoreo, rows: [] as any[] };
        if (String(m.fecha_monitoreo) > entry.fechaMax) entry.fechaMax = m.fecha_monitoreo;
        entry.rows.push(m);
        grupos.set(clave, entry);
      }

      const gruposOrdenados = Array.from(grupos.values()).sort((a, b) => b.fechaMax.localeCompare(a.fechaMax));
      if (gruposOrdenados.length === 0) return { plagas: [], fecha: null };

      const [ultimo, anterior] = gruposOrdenados;

      const incidenciaPorPlaga = (rows: any[]): Map<string, number> => {
        const acumulado = new Map<string, { afectados: number; monitoreados: number }>();
        for (const m of rows) {
          const nombre = m.plagas_enfermedades_catalogo?.nombre;
          if (!nombre) continue;
          const e = acumulado.get(nombre) || { afectados: 0, monitoreados: 0 };
          e.afectados += m.arboles_afectados || 0;
          e.monitoreados += m.arboles_monitoreados || 0;
          acumulado.set(nombre, e);
        }
        const resultado = new Map<string, number>();
        for (const [nombre, { afectados, monitoreados }] of acumulado) {
          resultado.set(nombre, monitoreados > 0 ? (afectados / monitoreados) * 100 : 0);
        }
        return resultado;
      };

      const incidenciaUltimo = incidenciaPorPlaga(ultimo.rows);
      const incidenciaAnterior = anterior ? incidenciaPorPlaga(anterior.rows) : new Map<string, number>();

      const plagas: PlagaKPI[] = Array.from(incidenciaUltimo.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([nombre, incidencia]) => {
          const prev = incidenciaAnterior.get(nombre);
          return {
            nombre,
            incidencia,
            deltaPp: prev !== undefined ? incidencia - prev : null,
          };
        });

      return { plagas, fecha: ultimo.fechaMax };
    };

    const loadJornales = async (): Promise<{ jornalesSemana: number; variacion: number | undefined; sparkline: number[]; contexto: string | null }> => {
      const diaSemana = now.getDay();
      const diasDesdeLunes = diaSemana === 0 ? 6 : diaSemana - 1;
      const lunesActual = new Date(now);
      lunesActual.setDate(now.getDate() - diasDesdeLunes);
      lunesActual.setHours(0, 0, 0, 0);
      const lunesAnterior = new Date(lunesActual);
      lunesAnterior.setDate(lunesActual.getDate() - 7);

      const { data, error } = await supabase
        .from('registros_trabajo')
        .select(`
          fecha_trabajo,
          fraccion_jornal,
          empleado_id,
          contratista_id,
          tareas!inner(tipo_tarea_id, tipos_tareas(nombre))
        `)
        .gte('fecha_trabajo', lunesAnterior.toISOString().split('T')[0])
        .lte('fecha_trabajo', now.toISOString().split('T')[0]);
      if (error || !data) return { jornalesSemana: 0, variacion: undefined, sparkline: [], contexto: null };

      const fechaLunesActual = lunesActual.toISOString().split('T')[0];
      let jornalesSemana = 0;
      let jornalesSemanaAnterior = 0;
      const porDia = new Map<string, number>();
      const actividadMap = new Map<string, number>();
      const trabajadoresUnicos = new Set<string>();

      data.forEach((r: any) => {
        const jornal = Number(r.fraccion_jornal) || 0;
        if (r.fecha_trabajo >= fechaLunesActual) {
          jornalesSemana += jornal;
          porDia.set(r.fecha_trabajo, (porDia.get(r.fecha_trabajo) || 0) + jornal);
          const nombreActividad = r.tareas?.tipos_tareas?.nombre || 'Sin tipo';
          actividadMap.set(nombreActividad, (actividadMap.get(nombreActividad) || 0) + jornal);
          if (r.empleado_id) trabajadoresUnicos.add(`e_${r.empleado_id}`);
          if (r.contratista_id) trabajadoresUnicos.add(`c_${r.contratista_id}`);
        } else {
          jornalesSemanaAnterior += jornal;
        }
      });

      const variacion = jornalesSemanaAnterior > 0
        ? ((jornalesSemana - jornalesSemanaAnterior) / jornalesSemanaAnterior) * 100
        : undefined;

      const sparkline: number[] = [];
      for (const d = new Date(lunesActual); d <= now; d.setDate(d.getDate() + 1)) {
        sparkline.push(porDia.get(d.toISOString().split('T')[0]) || 0);
      }

      const topActividad = Array.from(actividadMap.entries()).sort((a, b) => b[1] - a[1])[0];
      const contexto = trabajadoresUnicos.size > 0
        ? `${trabajadoresUnicos.size} activos${topActividad ? ` · ${topActividad[0]} lidera` : ''}`
        : null;

      return { jornalesSemana: Math.round(jornalesSemana * 100) / 100, variacion, sparkline, contexto };
    };

    const loadGasto = async (): Promise<{ gastoMes: number; variacion: number | undefined; contexto: string | null }> => {
      const inicioMesActual = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
      const inicioMesAnterior = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString().split('T')[0];
      const finMesAnterior = new Date(now.getFullYear(), now.getMonth(), 0).toISOString().split('T')[0];

      const { data, error } = await supabase
        .from('fin_gastos')
        .select('valor, fecha, categoria_id, fin_categorias_gastos(nombre)')
        .eq('estado', 'Confirmado')
        .gte('fecha', inicioMesAnterior)
        .lte('fecha', now.toISOString().split('T')[0]);
      if (error || !data) return { gastoMes: 0, variacion: undefined, contexto: null };

      let gastoMes = 0;
      let gastoMesAnterior = 0;
      const porCategoria = new Map<string, number>();
      data.forEach((g: any) => {
        const valor = Number(g.valor) || 0;
        if (g.fecha >= inicioMesActual) {
          gastoMes += valor;
          const nombreCategoria = g.fin_categorias_gastos?.nombre || 'Sin categoría';
          porCategoria.set(nombreCategoria, (porCategoria.get(nombreCategoria) || 0) + valor);
        } else if (g.fecha <= finMesAnterior) {
          gastoMesAnterior += valor;
        }
      });
      const variacion = gastoMesAnterior > 0
        ? ((gastoMes - gastoMesAnterior) / gastoMesAnterior) * 100
        : undefined;
      const topCategoria = Array.from(porCategoria.entries()).sort((a, b) => b[1] - a[1])[0];
      const contexto = topCategoria ? `Mayor: ${topCategoria[0]} ($${formatCompact(topCategoria[1])})` : null;

      return { gastoMes, variacion, contexto };
    };

    const loadGanado = async (): Promise<{ ganadoCabezas: number; neto: number; contexto: string | null }> => {
      try {
        const [rows, movimientos] = await Promise.all([fetchInventario(), fetchMovimientos()]);
        const kpisGanado = calcularKPIsInventario(rows);
        const hace30Dias = new Date(now);
        hace30Dias.setDate(hace30Dias.getDate() - 30);
        const variacionCabezas = calcularVariacion(movimientos, hace30Dias.toISOString().split('T')[0]);
        const contexto = variacionCabezas.entradas > 0 || variacionCabezas.salidas > 0
          ? `${variacionCabezas.entradas} entran · ${variacionCabezas.salidas} salen (30d)`
          : 'Sin movimientos en 30 días';
        return { ganadoCabezas: kpisGanado.totalCabezas, neto: variacionCabezas.neto, contexto };
      } catch {
        return { ganadoCabezas: 0, neto: 0, contexto: null };
      }
    };

    const [plagasRes, jornalesRes, gastoRes, ganadoRes] = await Promise.all([
      loadPlagas(),
      loadJornales(),
      loadGasto(),
      loadGanado(),
    ]);

    setKpis({
      plagas: plagasRes.plagas,
      plagasFecha: plagasRes.fecha,
      jornalesSemana: jornalesRes.jornalesSemana,
      jornalesVariacion: jornalesRes.variacion,
      jornalesSparkline: jornalesRes.sparkline,
      jornalesContexto: jornalesRes.contexto,
      gastoMes: gastoRes.gastoMes,
      gastoVariacion: gastoRes.variacion,
      gastoContexto: gastoRes.contexto,
      ganadoCabezas: ganadoRes.ganadoCabezas,
      ganadoNeto: ganadoRes.neto,
      ganadoContexto: ganadoRes.contexto,
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

      // --- Helper 3: Presupuesto — actual YTD vs. presupuesto acumulado al trimestre actual ---
      const loadPresupuestoAlertas = async (): Promise<Alerta[]> => {
        const anioActual = now.getFullYear();
        const inicioAnio = `${anioActual}-01-01`;
        const hoyStr = now.toISOString().split('T')[0];
        // Q1..Q4 según el mes actual (0-11) — ej. julio (mes 6) -> Q3
        const trimestreActual = Math.floor(now.getMonth() / 3) + 1;

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

        // fin_presupuestos tiene una fila por (año, negocio, concepto) — agregamos por
        // categoría sumando el monto_anual de todos sus conceptos antes de comparar,
        // para emitir a lo sumo UNA alerta por (negocio, categoría), no una por concepto.
        const presupuestoPorClave = new Map<string, { montoAnual: number; nombreCategoria: string }>();
        for (const p of presupuestosRes.data) {
          const clave = `${p.negocio_id}-${p.categoria_id}`;
          const entry = presupuestoPorClave.get(clave) || {
            montoAnual: 0,
            nombreCategoria: p.fin_categorias_gastos?.nombre || 'Categoría',
          };
          entry.montoAnual += Number(p.monto_anual) || 0;
          presupuestoPorClave.set(clave, entry);
        }

        const alertas: Alerta[] = [];
        for (const [clave, { montoAnual, nombreCategoria }] of presupuestoPorClave) {
          if (montoAnual <= 0) continue;
          const actual = actualPorClave.get(clave) || 0;
          if (actual === 0) continue;

          // "Para todo lo de presupuestos usemos el acumulado hasta el trimestre actual"
          const presupuestoAcumQ = (montoAnual * trimestreActual) / 4;
          if (presupuestoAcumQ <= 0) continue;
          const ritmo = actual / presupuestoAcumQ;
          if (ritmo < 0.9) continue;

          const pct = Math.round((actual / presupuestoAcumQ) * 100);
          alertas.push({
            id: `presupuesto-${clave}`,
            tipo: 'gasto',
            mensaje: `${nombreCategoria}: $${formatCompact(actual)} de $${formatCompact(presupuestoAcumQ)} presupuestado al Q${trimestreActual} (${pct}%)`,
            fecha: now.toISOString(),
            prioridad: ritmo > 1.0 ? 'alta' : 'media',
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
      {/* index.css es salida Tailwind precompilada: usar solo clases ya presentes (existe lg:col-span-1, no md:col-span-1) */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {isLoading ? (
          <>
            <KPITileSkeleton />
            <KPITileSkeleton />
            <KPITileSkeleton />
            <KPITileSkeleton />
          </>
        ) : (
          <>
            {/* Ancho completo en móvil/tablet: 3 filas de nombre+incidencia+delta no caben en media celda */}
            <div className="col-span-2 lg:col-span-1">
              <PlagasKPICard
                plagas={kpis.plagas}
                fecha={kpis.plagasFecha}
                onClick={() => navigate('/monitoreo')}
              />
            </div>
            <DashboardKPICard
              label="Jornales esta semana"
              valor={formatNumber(kpis.jornalesSemana)}
              variacion={kpis.jornalesVariacion}
              sparkline={kpis.jornalesSparkline}
              contexto={kpis.jornalesContexto ?? undefined}
              onClick={() => navigate('/labores')}
            />
            <DashboardKPICard
              label="Gasto del mes"
              valor={`$${formatCompact(kpis.gastoMes)}`}
              variacion={kpis.gastoVariacion}
              contexto={kpis.gastoContexto ?? undefined}
              onClick={() => navigate('/finanzas/gastos?tab=historial')}
            />
            <DashboardKPICard
              label="Cabezas de ganado"
              valor={formatNumber(kpis.ganadoCabezas)}
              variacionTexto={kpis.ganadoNeto !== 0 ? `${kpis.ganadoNeto > 0 ? '+' : ''}${kpis.ganadoNeto} neto` : undefined}
              variacionPositiva={kpis.ganadoNeto > 0}
              contexto={kpis.ganadoContexto ?? undefined}
              onClick={() => navigate('/ganado')}
            />
          </>
        )}
      </div>

      {/* Accesos rápidos a módulos sin tarjeta propia */}
      <QuickLinksRow />
    </div>
  );
}
