// ARCHIVO: components/hato/HatoDashboard.tsx
// DESCRIPCIÓN: Ruta `/hato-lechero` (Tablero). Rebuild Wave 1 del Figma
// alignment spec (`docs/.../hato-figma-spec.md` §2): header compartido
// (`HatoPageHeader`), 4 KPIs con datos reales (`HatoKpiCard`), panel
// "Vacas por estado" (barras horizontales), panel derivado "Tablero de
// alertas" (NO es la cola Telegram de S6 -- ver nota en `utils/hatoAlertas.ts`)
// y las 4 listas de acción de la Épica E1 restyleadas con pills de
// día/urgencia (`chipDiasRestantes`/`chipVencimiento`, hatoUi.ts).
//
// Todo sigue derivado por `derivarEstadoReproductivo` (calculosHato.ts) vía
// `useHatoAnimales` -- este archivo no calcula ningún umbral de negocio,
// solo particiona/formatea lo que el motor ya decidió. La derivación de las
// 4 señales de alerta (`derivarAlertasHato`) y sus metadatos/pill
// (`ALERTA_META`/`PILL_ALERTA`) viven en `utils/hatoAlertas.ts` -- Wave 2b
// las extrajo de aquí para que `AlertasView.tsx` (Cola de alertas) consuma
// EXACTAMENTE la misma derivación y nunca pueda divergir en la misma
// señal/animal.
//
// Litros/día del hato se lee de `hato_produccion_quincenal` (S5) -- hoy
// vacío en producción, así que la card muestra "—" hasta el primer
// registro (regla "sin dato, nunca 0", spec §0b). PL promedio usa
// `animales[].pl` (última lectura de PL por chequeo, `v_hato_estado_actual`).

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Loader2, AlertTriangle, Milk, Droplet, Gauge } from 'lucide-react';
import { useHatoAnimales, type AnimalHatoDerivado } from './hooks/useHatoAnimales';
import { useProduccionHato } from './hooks/useProduccionHato';
import { HatoPageHeader } from './components/HatoPageHeader';
import { HatoKpiCard } from './components/HatoKpiCard';
import { HatoReproCard } from './components/HatoReproCard';
import { EstadoChip } from './components/EstadoChip';
import { AnimalLabel } from './components/AnimalLabel';
import { ALERTA_META, PILL_ALERTA, derivarAlertasHato } from '@/utils/hatoAlertas';
import type { ChipEstilo } from '@/utils/hatoUi';
import { formatNumber } from '@/utils/format';
import { diferenciaEnDias } from '@/utils/fechas';
import type { HatoProduccionQuincenal } from '@/types/hato';

// ---------------------------------------------------------------------------
// "Vacas por estado" -- partición del hato activo (sin terneras) en 5
// grupos. JUICIO DE DISEÑO (documentar para revisión, ver reporte):
//   - Novillas / Secas (horro) = directo de `categoria` (ya derivada).
//   - Dentro de `categoria === 'hato'` (en ordeño), se separan las dos
//     señales reproductivas que el dueño ya usa como listas de acción --
//     Preñadas (`preñada` + `proxima_a_secar`, gestación tardía) y Por servir
//     (`estado === 'vacia_por_servir'`) -- y "En leche" es el RESTO de
//     `hato` (servida/parida reciente/indeterminado): vacas
//     lecheras sin ninguna de esas dos señales para destacar. Es decir,
//     "En leche" NO es "toda vaca ordeñando" -- una preñada o vacía por
//     servir también está ordeñando, pero se cuenta en su propio grupo para
//     que el panel sea útil como lista de prioridades, no solo un conteo.
// Total = novillas + hato + horro (excluye terneras y estados terminales,
// que `clasificarCategoriaHato` ya excluye devolviendo `null`).
// ---------------------------------------------------------------------------
interface BucketEstado {
  key: string;
  label: string;
  count: number;
  color: string;
}

export function HatoDashboard() {
  const { animales, loading, error } = useHatoAnimales();
  const { fetchHistorialQuincenal } = useProduccionHato();

  const [ultimaQuincena, setUltimaQuincena] = useState<HatoProduccionQuincenal | null>(null);

  const cargarQuincena = useCallback(async () => {
    try {
      const historial = await fetchHistorialQuincenal(1);
      setUltimaQuincena(historial[0] ?? null);
    } catch (err) {
      console.error('Error cargando litros/día del hato:', err);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    cargarQuincena();
  }, [cargarQuincena]);

  const hoy = useMemo(() => new Date().toISOString().slice(0, 10), []);

  const {
    enOrdeno,
    proximasASecar, proximasAParir, rechequeoPendiente, vaciasPorServir, filasAlertas,
    bucketsEstado, totalVacasPorEstado, prenadasCount, servidasCount, vaciasReproCount, plPromedio,
  } = useMemo(() => {
    const enOrdeno = animales.filter((a) => a.categoria === 'hato');
    const horro = animales.filter((a) => a.categoria === 'horro');
    const novillas = animales.filter((a) => a.categoria === 'novilla');
    // Las 4 señales de alerta y su aplanado en filas viven en
    // `utils/hatoAlertas.ts` -- ÚNICA fuente, compartida con
    // `AlertasView.tsx` (Cola de alertas), para que nunca puedan divergir.
    const { proximasASecar, proximasAParir, rechequeoPendiente, vaciasPorServir, filas: filasAlertas } =
      derivarAlertasHato(animales);
    // Desglose reproductivo del hato en ordeño (3 KPIs, decisión del dueño:
    // reemplaza la métrica única "% Preñez" por Preñadas/Servidas/Vacías).
    // Particiona el ordeño al 100%:
    //   - Preñadas: confirmadas ('preñada') + próximas a secar (gestación
    //     tardía, inequívocamente gestantes).
    //   - Servidas: montadas ('servida'), aún SIN confirmación de preñez
    //     (que este corpus histórico rara vez registra).
    //   - Vacías: el resto (vacía por servir + parida reciente sin servir +
    //     indeterminado) -- abiertas: ni preñadas ni montadas.
    // `servida` deliberadamente NO cuenta como preñada: contar solo 'preñada'
    // daba 0% con vacas claramente gestantes, y contar 'servida' inflaría con
    // montas no confirmadas.
    const prenadasCount = enOrdeno.filter(
      (a) => a.derivado.estado === 'preñada' || a.derivado.estado === 'proxima_a_secar',
    ).length;
    const servidasCount = enOrdeno.filter((a) => a.derivado.estado === 'servida').length;
    const vaciasReproCount = enOrdeno.length - prenadasCount - servidasCount;
    const enLecheCount = enOrdeno.length - vaciasPorServir.length - prenadasCount;

    const bucketsEstado: BucketEstado[] = [
      { key: 'en_leche', label: 'En leche', count: enLecheCount, color: 'var(--primary)' },
      { key: 'prenadas', label: 'Preñadas', count: prenadasCount, color: 'var(--secondary)' },
      { key: 'novillas', label: 'Novillas', count: novillas.length, color: 'var(--foreground)' },
      { key: 'secas', label: 'Secas (horro)', count: horro.length, color: 'var(--sidebar-accent)' },
      { key: 'por_servir', label: 'Por servir', count: vaciasPorServir.length, color: 'var(--brand-brown)' },
    ];
    const totalVacasPorEstado = novillas.length + enOrdeno.length + horro.length;

    const plValores = enOrdeno.map((a) => a.pl).filter((pl): pl is number => pl != null);
    const plPromedio = plValores.length > 0 ? plValores.reduce((s, v) => s + v, 0) / plValores.length : null;

    return {
      enOrdeno,
      proximasASecar, proximasAParir, rechequeoPendiente, vaciasPorServir, filasAlertas,
      bucketsEstado, totalVacasPorEstado, prenadasCount, servidasCount, vaciasReproCount, plPromedio,
    };
  }, [animales]);

  const litrosDia = useMemo(() => {
    if (!ultimaQuincena?.fecha_inicio || !ultimaQuincena.fecha_fin) return null;
    const dias = diferenciaEnDias(ultimaQuincena.fecha_inicio, ultimaQuincena.fecha_fin) + 1;
    if (dias <= 0) return null;
    return ultimaQuincena.litros_total / dias;
  }, [ultimaQuincena]);

  return (
    <div className="min-h-screen bg-gray-50 p-4 lg:p-8">
      <div className="max-w-7xl mx-auto w-full">
        <HatoPageHeader breadcrumb="Hato Lechero" section="Dashboard" title="Resumen del hato" subtitle="Finca Subachoque" />

        {error && (
          <div className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 mb-6 text-sm text-red-700">
            <AlertTriangle className="w-4 h-4 flex-shrink-0" />
            {error}
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-6 h-6 animate-spin text-primary" />
          </div>
        ) : (
          <>
            {/* KPI row -- 4 cards (grid-cols-2/lg:grid-cols-4 ya están
                compilados en el build congelado de Tailwind, así que no
                hace falta la regla custom .kpi-grid-hato que usaba el
                dashboard de 5 KPIs). */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
              <HatoKpiCard icon={Milk} tone="green" label="Vacas en ordeño" value={formatNumber(enOrdeno.length)} />
              <HatoKpiCard
                icon={Droplet}
                tone="blue"
                label="Litros/día del hato"
                value={litrosDia != null ? formatNumber(litrosDia) : '—'}
                unit={litrosDia != null ? 'L' : undefined}
                sub={litrosDia == null ? 'Sin registros' : undefined}
              />
              <HatoKpiCard
                icon={Gauge}
                tone="amber"
                label="PL promedio"
                value={plPromedio != null ? formatNumber(plPromedio, 1) : '—'}
                unit={plPromedio != null ? 'L/vaca' : undefined}
              />
              <HatoReproCard
                enOrdeno={enOrdeno.length}
                prenadas={prenadasCount}
                servidas={servidasCount}
                vacias={vaciasReproCount}
              />
            </div>

            {/* Row 2 -- Vacas por estado + Tablero de alertas */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
              <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
                <h3 className="text-sm font-semibold text-gray-900 mb-1">Vacas por estado</h3>
                <p className="text-xs text-gray-500 mb-4">{formatNumber(totalVacasPorEstado)} cabezas en total</p>
                <div className="space-y-3">
                  {bucketsEstado.map((b) => {
                    const pct = totalVacasPorEstado > 0 ? (b.count / totalVacasPorEstado) * 100 : 0;
                    return (
                      <div key={b.key} className="flex items-center gap-3">
                        <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: b.color }} />
                        <span className="w-28 flex-shrink-0 text-sm text-gray-700">{b.label}</span>
                        <div className="flex-1 min-w-0 h-2 rounded-full bg-gray-200 overflow-hidden">
                          <div
                            className={`h-full rounded-full ${b.key === 'secas' ? 'border border-gray-300' : ''}`}
                            style={{ width: `${pct}%`, backgroundColor: b.color }}
                          />
                        </div>
                        <span className="w-8 flex-shrink-0 text-right text-sm font-semibold text-gray-900">
                          {formatNumber(b.count)}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
                <div className="flex items-center justify-between mb-1">
                  <h3 className="text-sm font-semibold text-gray-900">Tablero de alertas</h3>
                  <span className="rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-600 flex-shrink-0">
                    {formatNumber(filasAlertas.length)} activas
                  </span>
                </div>
                <p className="text-xs text-gray-500 mb-4">
                  Señales derivadas del hato. El seguimiento de envío por Telegram (Enviada/Confirmada/Escalada) llega con el backend de S6.
                </p>
                {filasAlertas.length === 0 ? (
                  <p className="text-sm text-gray-400">Sin alertas activas.</p>
                ) : (
                  <ul className="divide-y divide-gray-100">
                    {filasAlertas.slice(0, 8).map((fila, i) => {
                      const meta = ALERTA_META[fila.tipo];
                      const Icon = meta.icon;
                      return (
                        <li key={`${fila.tipo}-${fila.animal.animalId}-${i}`} className="py-2">
                          <Link
                            to={`/hato-lechero/hato/${fila.animal.animalId}`}
                            className="flex items-center gap-3 hover:text-gray-900"
                          >
                            <span className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 ${meta.tono}`}>
                              <Icon className="w-4 h-4" />
                            </span>
                            <span className="flex-1 min-w-0 flex flex-wrap items-center gap-1.5 text-sm">
                              <AnimalLabel animal={fila.animal} />
                              <span className="text-gray-500">— {meta.mensaje}</span>
                            </span>
                            <EstadoChip chip={PILL_ALERTA[fila.tipo](fila.animal, hoy)} className="flex-shrink-0" />
                          </Link>
                        </li>
                      );
                    })}
                    {filasAlertas.length > 8 && (
                      <li className="pt-2 text-xs text-gray-400">y {filasAlertas.length - 8} más...</li>
                    )}
                  </ul>
                )}
              </div>
            </div>

            {/* Row 3 -- listas de acción */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <ListaAccion
                titulo="Próximas a secar"
                animales={proximasASecar}
                pill={(a) => PILL_ALERTA.secado(a, hoy)}
                vacio="Ninguna vaca próxima a secar."
              />
              <ListaAccion
                titulo="Próximas a parir"
                animales={proximasAParir}
                pill={(a) => PILL_ALERTA.parto(a, hoy)}
                vacio="Ninguna vaca próxima a parir."
              />
              <ListaAccion
                titulo="Rechequeo pendiente"
                animales={rechequeoPendiente}
                pill={(a) => PILL_ALERTA.rechequeo(a, hoy)}
                vacio="Sin rechequeos pendientes."
              />
              <ListaAccion
                titulo="Vacías por servir"
                animales={vaciasPorServir}
                pill={(a) => PILL_ALERTA.servir(a, hoy)}
                vacio="Ninguna vacía por servir."
              />
            </div>

            {animales.length === 0 && (
              <div className="rounded-xl border border-gray-200 bg-white p-8 text-center mt-6">
                <p className="text-sm text-gray-500">
                  Todavía no hay animales cargados en el hato. Sube el primer chequeo desde{' '}
                  <Link to="/hato-lechero/chequeos" className="text-primary hover:underline">Chequeos</Link>.
                </p>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function ListaAccion({
  titulo,
  animales,
  pill,
  vacio,
}: {
  titulo: string;
  animales: AnimalHatoDerivado[];
  pill: (animal: AnimalHatoDerivado) => ChipEstilo;
  vacio: string;
}) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <h3 className="text-sm font-semibold text-gray-900 mb-3">{titulo} ({animales.length})</h3>
      {animales.length === 0 ? (
        <p className="text-sm text-gray-400">{vacio}</p>
      ) : (
        <ul className="divide-y divide-gray-100">
          {animales.slice(0, 8).map((animal) => (
            <li key={animal.animalId} className="py-2">
              <Link
                to={`/hato-lechero/hato/${animal.animalId}`}
                className="flex items-center justify-between gap-2 text-sm hover:text-gray-900"
              >
                <AnimalLabel animal={animal} />
                <EstadoChip chip={pill(animal)} className="flex-shrink-0" />
              </Link>
            </li>
          ))}
          {animales.length > 8 && (
            <li className="pt-2 text-xs text-gray-400">y {animales.length - 8} más...</li>
          )}
        </ul>
      )}
    </div>
  );
}
