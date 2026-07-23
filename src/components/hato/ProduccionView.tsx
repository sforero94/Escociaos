import { useState, useCallback, useEffect } from 'react';
import { Droplets, Users, Gauge, CalendarClock } from 'lucide-react';
import { formatNumber, formatLongDate } from '@/utils/format';
import { calcularProductividad, calcularFechaUltimoDiaPesaje } from '@/utils/calculosHato';
import { useProduccionHato } from './hooks/useProduccionHato';
import { PesajeSemanalGrid } from './components/PesajeSemanalGrid';
import { ProduccionQuincenalForm } from './components/ProduccionQuincenalForm';
import type { HatoProduccionQuincenal } from '@/types/hato';

interface KPICardProps {
  titulo: string;
  valor: string;
  subtitulo: string;
  icono: React.ElementType;
  colorClase: string;
}

function KPICard({ titulo, valor, subtitulo, icono: Icono, colorClase }: KPICardProps) {
  return (
    <div className="bg-white rounded-2xl p-5 border border-gray-200">
      <div className={`w-10 h-10 ${colorClase} rounded-xl flex items-center justify-center mb-3`}>
        <Icono className="w-5 h-5 text-white" />
      </div>
      <p className="text-2xl font-bold text-gray-900">{valor}</p>
      <p className="text-sm text-gray-600 font-medium">{titulo}</p>
      <p className="text-xs text-gray-400 mt-1">{subtitulo}</p>
    </div>
  );
}

/**
 * `/hato-lechero/produccion` (S5 — Épica D, V2/V3/V4,
 * docs/plan_hato_lechero_module.md §7.5). Dos capturas distintas que
 * nunca se mezclan (decisión del dueño, segunda ronda 2026-07-22):
 *
 * - Pesaje semanal por vaca (D1) → productividad individual.
 * - Producción quincenal / litros al camión (D2/V3) → venta del hato,
 *   fuente de la productividad del hato completo (D4/V4:
 *   litros ÷ vacas en ordeño).
 */
export function ProduccionView() {
  const hook = useProduccionHato();
  const [ultimaQuincena, setUltimaQuincena] = useState<HatoProduccionQuincenal | null>(null);
  const [promedioPesajeSemana, setPromedioPesajeSemana] = useState<{ promedio: number; conteo: number; fecha: string } | null>(null);

  const cargarKPIs = useCallback(async () => {
    try {
      const historial = await hook.fetchHistorialQuincenal(1);
      setUltimaQuincena(historial[0] ?? null);
    } catch (err: unknown) {
      console.error('Error cargando KPIs de producción quincenal:', err);
    }

    try {
      const config = await hook.fetchDiaPesajeSemanal();
      const fecha = calcularFechaUltimoDiaPesaje(new Date().toISOString().slice(0, 10), config.iso);
      const pesajes = await hook.fetchPesajesPorFecha(fecha);
      if (pesajes.size > 0) {
        const total = Array.from(pesajes.values()).reduce((s, p) => s + p.litros_total, 0);
        setPromedioPesajeSemana({ promedio: total / pesajes.size, conteo: pesajes.size, fecha });
      } else {
        setPromedioPesajeSemana({ promedio: 0, conteo: 0, fecha });
      }
    } catch (err: unknown) {
      console.error('Error cargando resumen del pesaje semanal:', err);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    cargarKPIs();
  }, [cargarKPIs]);

  const productividadHato = ultimaQuincena
    ? calcularProductividad(ultimaQuincena.litros_total, ultimaQuincena.num_vacas_ordeno)
    : null;

  return (
    <div className="min-h-screen bg-gray-50 p-4 lg:p-8">
      <div className="max-w-7xl mx-auto w-full">
        <div className="mb-6">
          <h1 className="text-foreground mb-1">Producción</h1>
          <p className="text-sm text-gray-600">
            Pesaje semanal por vaca y producción quincenal del hato lechero
          </p>
        </div>

        {/* KPIs */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <KPICard
            titulo="Litros última quincena"
            valor={ultimaQuincena ? `${formatNumber(ultimaQuincena.litros_total, 0)} L` : '—'}
            subtitulo={
              ultimaQuincena
                ? `${['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'][ultimaQuincena.mes - 1]} ${ultimaQuincena.anio} · ${ultimaQuincena.quincena}ª quincena`
                : 'Sin registros aún'
            }
            icono={Droplets}
            colorClase="bg-blue-500"
          />
          <KPICard
            titulo="Productividad del hato"
            valor={productividadHato !== null ? `${formatNumber(productividadHato, 1)} L/vaca` : '—'}
            subtitulo="Litros de la quincena ÷ vacas en ordeño"
            icono={Gauge}
            colorClase="bg-primary"
          />
          <KPICard
            titulo="Vacas en ordeño"
            valor={ultimaQuincena?.num_vacas_ordeno != null ? formatNumber(ultimaQuincena.num_vacas_ordeno) : '—'}
            subtitulo="Capturado en la última quincena"
            icono={Users}
            colorClase="bg-amber-500"
          />
          <KPICard
            titulo="Promedio pesaje semanal"
            valor={
              promedioPesajeSemana && promedioPesajeSemana.conteo > 0
                ? `${formatNumber(promedioPesajeSemana.promedio, 1)} L`
                : '—'
            }
            subtitulo={
              promedioPesajeSemana
                ? promedioPesajeSemana.conteo > 0
                  ? `${promedioPesajeSemana.conteo} vacas pesadas · ${formatLongDate(promedioPesajeSemana.fecha)}`
                  : `Sin pesajes el ${formatLongDate(promedioPesajeSemana.fecha)}`
                : 'Cargando…'
            }
            icono={CalendarClock}
            colorClase="bg-blue-600"
          />
        </div>

        <div className="space-y-6">
          <PesajeSemanalGrid onSaved={cargarKPIs} />
          <ProduccionQuincenalForm onSaved={cargarKPIs} />
        </div>
      </div>
    </div>
  );
}
