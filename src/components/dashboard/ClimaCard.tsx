import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Cloud, Droplets, Wind, CloudRain, Sun, CloudOff } from 'lucide-react';
import { useClimaData } from '@/hooks/useClimaData';
import { getSupabase } from '@/utils/supabase/client';
import { projectId } from '@/utils/supabase/info.tsx';
import { aggregateRadiation } from '@/utils/calculosRadiacion';
import { fechaAISODate, obtenerFechaHoy } from '@/utils/fechas';
import { formatNumber } from '@/utils/format';
import {
  construirFranjaLluvia,
  calcularRachaSinLluvia,
  UMBRAL_LLUVIA_MATERIAL_MM,
  clasificarFrescuraLectura,
  etiquetaEdadLectura,
  minutosDesdeLectura,
} from '@/utils/calculosClima';
import { FranjaLluvia } from './FranjaLluvia';
import { RachaSinLluvia } from './RachaSinLluvia';
import type { ResumenClima } from '@/types/clima';

interface DiaPronostico {
  date: string;
  temp_min: number;
  temp_max: number;
  rain_probability_pct: number;
}

const EDGE_FUNCTION_BASE = `https://${projectId}.supabase.co/functions/v1`;

function sunHoursUltimos7Dias(resumenesDiarios: { fecha: string; radiacion_wm2_avg: number | null }[]): number | null {
  const cutoffStr = fechaAISODate(new Date(Date.now() - 7 * 24 * 60 * 60 * 1000));
  const rows = resumenesDiarios.filter((r) => r.fecha >= cutoffStr);
  return aggregateRadiation(rows).avgSunHours;
}

function nombreDia(fechaISO: string): string {
  const dias = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
  // fecha viene como YYYY-MM-DD; parsear como fecha local para evitar corrimiento de un día
  const [y, m, d] = fechaISO.split('-').map(Number);
  return dias[new Date(y, m - 1, d).getDay()];
}

/**
 * ClimaCard - Condiciones actuales + resumen de la semana, siempre visible
 * (no depende de umbrales de alerta). El resumen semanal sale de
 * clima_resumen_diario (ya agregado por el cron diario, sin depender del
 * edge function). El pronóstico de 3 días sí depende del edge function
 * clima/forecast; si no está desplegado o falla, la tarjeta simplemente
 * omite esa fila sin romperse.
 */
export function ClimaCard() {
  const navigate = useNavigate();
  const { lecturaActual, resumenPeriodos, resumenesDiarios, rawLecturas, loading, estacionConfigurada } = useClimaData();
  const [pronostico, setPronostico] = useState<DiaPronostico[] | null>(null);

  const sunHoursSemana = useMemo(() => sunHoursUltimos7Dias(resumenesDiarios), [resumenesDiarios]);

  // Franja de lluvia de los últimos 10 días (§4 Bloque 2.1 del plan del
  // tablero). `construirFranjaLluvia` ya pasa por `lluviaConfiableDeResumen`
  // -- un día `contador_congelado` (migración 068) o sin fila en absoluto
  // llega como 'sin_dato', nunca como 0mm.
  // `rawLecturas` (ventana viva de 5 min) va a las dos: el rollup nocturno
  // corre a las 00:15 y escribe el resumen de AYER, así que el día EN CURSO no
  // tiene fila en `clima_resumen_diario` hasta la madrugada siguiente. Sin las
  // lecturas vivas la última barra de la franja salía "sin dato" toda la tarde
  // y toda la noche, todos los días.
  const franjaLluvia10Dias = useMemo(
    () => construirFranjaLluvia(resumenesDiarios, 10, obtenerFechaHoy(), rawLecturas),
    [resumenesDiarios, rawLecturas],
  );

  // Racha de días sin lluvia material. Se corta SÓLO ante una lluvia confirmada
  // >= umbral; un día sin dato no la corta, se cuenta y se reporta aparte (ver
  // `calcularRachaSinLluvia`).
  const rachaSinLluvia = useMemo(
    () => calcularRachaSinLluvia(resumenesDiarios, obtenerFechaHoy(), UMBRAL_LLUVIA_MATERIAL_MM, rawLecturas),
    [resumenesDiarios, rawLecturas],
  );

  useEffect(() => {
    let cancelado = false;
    (async () => {
      try {
        const supabase = getSupabase();
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.access_token) return;

        const res = await fetch(`${EDGE_FUNCTION_BASE}/make-server-1ccce916/clima/forecast?days=3`, {
          headers: { Authorization: `Bearer ${session.access_token}` },
        });
        if (!res.ok) return;
        const body = await res.json();
        if (!cancelado && Array.isArray(body?.dias)) {
          setPronostico(body.dias);
        }
      } catch {
        // Pronóstico es una mejora progresiva — falla en silencio
      }
    })();
    return () => { cancelado = true; };
  }, []);

  if (loading) {
    return <div className="h-20 bg-gray-100 rounded-2xl animate-pulse" />;
  }

  // Única razón para no pintar nada: la estación nunca existió (ni una
  // lectura ni un resumen en toda la base). Que DEJE de reportar no es eso —
  // eso se dice, no se esconde. Antes esta guarda también cubría
  // `!lecturaActual`, y como el cron de la migración 036 poda
  // `clima_lecturas` a 24 h, una estación muda un día entero hacía
  // desaparecer la tarjeta del Tablero en silencio.
  if (!estacionConfigurada) {
    return null;
  }

  const resumenSemana = resumenPeriodos.find((p) => p.label === 'Semana')?.resumen ?? null;

  // Reja de frescura: `lecturaActual` es un `max by timestamp` sin noción de
  // edad, así que la última lectura de anoche llegaba acá indistinguible de
  // una de hace 5 minutos y se rotulaba "Ahora" (2026-08-19/20: 14 h de corte
  // de luz en la finca mostrando 19,5°C / 0 W/m² / 0 km/h como actuales).
  // Umbrales: UMBRAL_FRESCURA_LECTURA en calculosClima.ts.
  const minutosLectura = minutosDesdeLectura(lecturaActual);
  const frescura = clasificarFrescuraLectura(lecturaActual);
  if (frescura === 'obsoleta' || !lecturaActual || lecturaActual.temp_c === null) {
    return (
      <div
        onClick={() => navigate('/clima')}
        className="bg-white rounded-2xl p-4 border border-gray-200 hover:border-primary/40 transition-all cursor-pointer space-y-3"
      >
        <div className="flex items-start gap-3">
          <CloudOff className="w-6 h-6 text-brand-brown/40 shrink-0" aria-hidden="true" />
          <div className="min-w-0">
            <p className="text-sm font-medium text-foreground">Sin dato reciente del clima</p>
            <p className="text-xs text-brand-brown/60">
              {minutosLectura === null
                ? 'La estación no envía lecturas desde hace más de 24 h.'
                : `Última lectura ${etiquetaEdadLectura(minutosLectura)}.`}{' '}
              Los datos de abajo son historia, no condiciones actuales.
            </p>
          </div>
        </div>

        {resumenSemana && <ResumenSemana resumen={resumenSemana} sunHoursSemana={sunHoursSemana} />}

        <FranjaLluvia dias={franjaLluvia10Dias} visibleEnMovil={7} />
        <RachaSinLluvia racha={rachaSinLluvia} umbralMm={UMBRAL_LLUVIA_MATERIAL_MM} />
      </div>
    );
  }

  // A partir de acá la lectura existe, tiene temperatura y es 'fresca' o
  // 'demorada'. En 'demorada' los valores se atenúan y el rótulo deja de
  // decir "Ahora".
  const atenuado = frescura === 'demorada' ? 'opacity-60' : '';

  return (
    <div
      onClick={() => navigate('/clima')}
      className="bg-white rounded-2xl p-4 border border-gray-200 hover:border-primary/40 transition-all cursor-pointer space-y-3"
    >
      <div className="flex items-center gap-4 flex-wrap">
        <span className="text-[10px] uppercase text-brand-brown/40 tracking-wide">
          {frescura === 'fresca' ? 'Ahora' : etiquetaEdadLectura(minutosLectura)}
        </span>

        <div className={`flex items-center gap-2 ${atenuado}`}>
          <Cloud className="w-8 h-8 text-primary/70" />
          <span className="text-2xl font-semibold text-foreground">{Math.round(lecturaActual.temp_c)}°C</span>
        </div>

        <div className={`flex items-center gap-3 text-xs text-brand-brown/60 flex-wrap ${atenuado}`}>
          {lecturaActual.humedad_pct !== null && (
            <span className="flex items-center gap-1">
              <Droplets className="w-3.5 h-3.5" /> {Math.round(lecturaActual.humedad_pct)}%
            </span>
          )}
          {lecturaActual.viento_kmh !== null && (
            <span className="flex items-center gap-1">
              <Wind className="w-3.5 h-3.5" /> {Math.round(lecturaActual.viento_kmh)} km/h
            </span>
          )}
          {lecturaActual.lluvia_diaria_mm !== null && lecturaActual.lluvia_diaria_mm > 0 && (
            <span className="flex items-center gap-1">
              <CloudRain className="w-3.5 h-3.5" /> {lecturaActual.lluvia_diaria_mm.toFixed(1)} mm hoy
            </span>
          )}
          {lecturaActual.radiacion_wm2 !== null && (
            <span className="flex items-center gap-1">
              <Sun className="w-3.5 h-3.5" /> {Math.round(lecturaActual.radiacion_wm2)} W/m²
            </span>
          )}
        </div>

        {pronostico && pronostico.length > 0 && (
          <div className="flex items-center gap-3 ml-auto pl-3 border-l border-gray-100">
            {pronostico.map((dia) => (
              <div key={dia.date} className="text-center">
                <p className="text-[10px] text-brand-brown/50 uppercase">{nombreDia(dia.date)}</p>
                <p className="text-xs text-foreground font-medium">
                  {Math.round(dia.temp_max)}°/{Math.round(dia.temp_min)}°
                </p>
                {dia.rain_probability_pct >= 40 && (
                  <p className="text-[10px] text-blue-500">{Math.round(dia.rain_probability_pct)}% lluvia</p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {resumenSemana && <ResumenSemana resumen={resumenSemana} sunHoursSemana={sunHoursSemana} />}

      <FranjaLluvia dias={franjaLluvia10Dias} visibleEnMovil={7} />
      <RachaSinLluvia racha={rachaSinLluvia} umbralMm={UMBRAL_LLUVIA_MATERIAL_MM} />
    </div>
  );
}

function formatMm(mm: number): string {
  return `${formatNumber(mm, mm < 10 ? 1 : 0)} mm`;
}

// El resumen semanal y la franja de lluvia salen de `clima_resumen_diario`,
// no de la lectura en vivo: siguen siendo válidos (son historia) cuando la
// estación está muda, así que el estado "sin dato reciente" los conserva en
// vez de dejar la tarjeta hueca.
function ResumenSemana({
  resumen,
  sunHoursSemana,
}: {
  resumen: ResumenClima;
  sunHoursSemana: number | null;
}) {
  return (
    <div className="pt-3 border-t border-gray-100 flex items-center gap-4 flex-wrap text-xs text-brand-brown/70">
      <span className="text-[10px] uppercase text-brand-brown/40 tracking-wide">Esta semana</span>
      {resumen.lluvia_total_mm !== null && (
        <span className="flex items-center gap-1">
          <CloudRain className="w-3.5 h-3.5 text-blue-400" /> {formatMm(resumen.lluvia_total_mm)} acumulados
        </span>
      )}
      {resumen.temp_promedio_c !== null && (
        <span>
          Prom. {resumen.temp_promedio_c.toFixed(1)}°C
          {resumen.temp_max_c !== null && resumen.temp_min_c !== null && (
            <span className="text-brand-brown/50"> ({resumen.temp_min_c.toFixed(0)}°–{resumen.temp_max_c.toFixed(0)}°)</span>
          )}
        </span>
      )}
      {resumen.rafaga_max_kmh !== null && (
        <span className="flex items-center gap-1">
          <Wind className="w-3.5 h-3.5" /> ráfaga máx. {Math.round(resumen.rafaga_max_kmh)} km/h
        </span>
      )}
      {sunHoursSemana !== null && (
        <span className="flex items-center gap-1">
          <Sun className="w-3.5 h-3.5 text-amber-500" /> {sunHoursSemana.toFixed(1)} h-sol/día
        </span>
      )}
    </div>
  );
}
