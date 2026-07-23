// ARCHIVO: components/hato/HatoDashboard.tsx
// DESCRIPCIÓN: Ruta `/hato-lechero` (Tablero, S4, plan §7.5/§7.6 pantalla ①).
// KPIs de las 3 categorías del hato + listas de acción (Épica E1: próximas a
// secar/parir, rechequeo, vacías por servir), todo derivado por
// `derivarEstadoReproductivo` (calculosHato.ts) vía `useHatoAnimales`.
//
// Litros/quincena y PL promedio (E2) NO se muestran todavía: dependen de
// `hato_pesajes_leche`/`hato_produccion_quincenal`, que S5 (Producción)
// todavía no puebla -- mostrar un "0" ahí sería indistinguible de "el hato
// no produjo nada", lo que la regla "sin dato, nunca 0" prohíbe
// explícitamente. Se agregan cuando S5 cierre.

import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Loader2, AlertTriangle, Droplet, Baby, Milk, Repeat } from 'lucide-react';
import { useHatoAnimales, type AnimalHatoDerivado } from './hooks/useHatoAnimales';
import { chipEstadoReproductivo } from '@/utils/hatoUi';
import { formatNumber, formatShortDate } from '@/utils/format';

function KPICard({ icon: Icon, label, value, sub }: { icon: typeof Milk; label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      <div className="flex items-center gap-2 mb-1">
        <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center flex-shrink-0">
          <Icon className="w-4 h-4 text-white" />
        </div>
        <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">{label}</p>
      </div>
      <p className="text-2xl font-bold text-gray-900">{value}</p>
      {sub && <p className="text-xs text-gray-500 mt-1">{sub}</p>}
    </div>
  );
}

function ListaAccion({
  titulo,
  animales,
  columna,
  vacio,
}: {
  titulo: string;
  animales: AnimalHatoDerivado[];
  columna: (animal: AnimalHatoDerivado) => string;
  vacio: string;
}) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      <h3 className="text-sm font-semibold text-gray-900 mb-3">{titulo} ({animales.length})</h3>
      {animales.length === 0 ? (
        <p className="text-sm text-gray-400">{vacio}</p>
      ) : (
        <ul className="space-y-2">
          {animales.slice(0, 8).map((animal) => (
            <li key={animal.animalId}>
              <Link
                to={`/hato-lechero/hato/${animal.animalId}`}
                className="flex items-center justify-between gap-2 text-sm hover:text-primary"
              >
                <span className="font-medium text-gray-900">
                  {animal.numero != null ? `#${animal.numero}` : '—'} {animal.nombre ?? ''}
                </span>
                <span className="text-xs text-gray-500 whitespace-nowrap">{columna(animal)}</span>
              </Link>
            </li>
          ))}
          {animales.length > 8 && (
            <li className="text-xs text-gray-400">y {animales.length - 8} más...</li>
          )}
        </ul>
      )}
    </div>
  );
}

export function HatoDashboard() {
  const { animales, loading, error } = useHatoAnimales();

  const {
    enOrdeno, horro, terneras, proximasAReemplazo,
    proximasASecar, proximasAParir, rechequeoPendiente, vaciasPorServir,
  } = useMemo(() => {
    const enOrdeno = animales.filter((a) => a.categoria === 'hato');
    const horro = animales.filter((a) => a.categoria === 'horro');
    const terneras = animales.filter((a) => a.categoria === 'ternera');
    const proximasAReemplazo = animales.filter((a) => a.derivado.proxima_a_reemplazo);
    const proximasASecar = animales.filter((a) => a.derivado.alertas.secado_due || (a.derivado.estado === 'proxima_a_secar'));
    const proximasAParir = animales.filter((a) => a.derivado.alertas.parto_proximo);
    const rechequeoPendiente = animales.filter((a) => a.derivado.alertas.rechequeo_due);
    const vaciasPorServir = animales.filter((a) => a.derivado.estado === 'vacia_por_servir');
    return { enOrdeno, horro, terneras, proximasAReemplazo, proximasASecar, proximasAParir, rechequeoPendiente, vaciasPorServir };
  }, [animales]);

  return (
    <div className="min-h-screen min-h-[100dvh] bg-gray-50 p-4 lg:p-8">
      <div className="max-w-7xl mx-auto w-full">
        <div className="mb-6">
          <h1 className="text-foreground mb-1">Tablero — Hato Lechero</h1>
          <p className="text-sm text-gray-500">Finca Subachoque</p>
        </div>

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
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
              <KPICard icon={Milk} label="En ordeño" value={formatNumber(enOrdeno.length)} />
              <KPICard icon={Droplet} label="Horro (secas)" value={formatNumber(horro.length)} />
              <KPICard icon={Baby} label="Terneras" value={formatNumber(terneras.length)} />
              <KPICard icon={Repeat} label="Próximas a reemplazo" value={formatNumber(proximasAReemplazo.length)} />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <ListaAccion
                titulo="Próximas a secar (30 días)"
                animales={proximasASecar}
                columna={(a) => (a.derivado.fecha_secar ? formatShortDate(a.derivado.fecha_secar) : '—')}
                vacio="Ninguna vaca próxima a secar."
              />
              <ListaAccion
                titulo="Próximas a parir"
                animales={proximasAParir}
                columna={(a) => (a.derivado.fecha_probable_parto ? formatShortDate(a.derivado.fecha_probable_parto) : '—')}
                vacio="Ninguna vaca próxima a parir."
              />
              <ListaAccion
                titulo="Rechequeo pendiente"
                animales={rechequeoPendiente}
                columna={(a) => (a.ultimoChequeoFecha ? `Últ. chequeo: ${formatShortDate(a.ultimoChequeoFecha)}` : 'Sin chequeo')}
                vacio="Sin rechequeos pendientes."
              />
              <ListaAccion
                titulo="Vacías por servir"
                animales={vaciasPorServir}
                columna={(a) => {
                  const chip = chipEstadoReproductivo(a.derivado.estado);
                  return chip.label;
                }}
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
