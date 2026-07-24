// ARCHIVO: components/hato/AlertasView.tsx
// DESCRIPCIÓN: Ruta `/hato-lechero/alertas` (Figma alignment spec Wave 2b,
// §7). Reemplaza el `ComingSoon`. El mock de Figma "⑥ Cola de alertas" es
// en realidad la cola de ENTREGA por Telegram del backend de S6 (columnas
// Tipo/Animal/Programada/Estado/Destinatario/Intentos/Respuesta, estados
// Enviada→Respondida→Confirmada→Escalada→Expirada) -- ese tick endpoint +
// cron NO está construido todavía (MAJOR DEVIATION frente al mock, a
// reportar).
//
// Esta vista es, en cambio, un tablero DERIVADO: las mismas 4 señales que
// ya alimentan el "Tablero de alertas" del Dashboard, calculadas por la
// MISMA función pura (`utils/hatoAlertas.ts::derivarAlertasHato`) para que
// las dos pantallas nunca puedan divergir sobre el mismo animal/señal.
// Solo se muestran las columnas que se pueden llenar honestamente: Tipo,
// Animal, Señal/fecha, Urgencia. Las columnas de entrega (Destinatario/
// Estado/Intentos/Respuesta) NUNCA se renderizan vacías simulando datos
// reales -- en su lugar, un banner explícito avisa que llegan con S6.

import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Loader2, AlertTriangle, Bell, Info } from 'lucide-react';
import { useHatoAnimales } from './hooks/useHatoAnimales';
import { HatoPageHeader } from './components/HatoPageHeader';
import { EstadoChip } from './components/EstadoChip';
import { AnimalLabel } from './components/AnimalLabel';
import { ALERTA_META, PILL_ALERTA, derivarAlertasHato, fechaSenalAlerta } from '@/utils/hatoAlertas';
import { formatShortDate, formatNumber, capitalize } from '@/utils/format';

export function AlertasView() {
  const { animales, loading, error } = useHatoAnimales();
  const hoy = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const { filas } = useMemo(() => derivarAlertasHato(animales), [animales]);

  return (
    <div className="min-h-screen-safe bg-gray-50 p-4 lg:p-8">
      <div className="max-w-7xl mx-auto w-full">
        <HatoPageHeader
          breadcrumb="Hato Lechero"
          section="Alertas"
          title="Cola de alertas"
          subtitle="Señales reproductivas y de manejo derivadas del hato"
          actions={
            <span className="rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-600">
              {formatNumber(filas.length)} activas
            </span>
          }
        />

        <div className="flex items-start gap-2 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 mb-6 text-sm text-blue-700">
          <Info className="w-4 h-4 flex-shrink-0 mt-1" />
          <p>
            Este tablero muestra las señales ya derivadas del hato (secado, parto, rechequeo, servicio). El
            seguimiento de envío por Telegram — Enviada / Confirmada / Escalada, con destinatario e intentos —
            llega con el backend de S6, que todavía no está construido, así que esas columnas no se muestran aquí.
          </p>
        </div>

        {error && (
          <div className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 mb-6 text-sm text-red-700">
            <AlertTriangle className="w-4 h-4 flex-shrink-0" />
            {error}
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin text-primary" />
          </div>
        ) : filas.length === 0 ? (
          <div className="rounded-xl border border-gray-200 bg-white p-8 text-center">
            <Bell className="w-10 h-10 text-gray-300 mx-auto mb-3" />
            <p className="text-sm text-gray-500">Sin alertas activas por ahora.</p>
          </div>
        ) : (
          <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 whitespace-nowrap">Tipo</th>
                    <th className="px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 whitespace-nowrap">Animal</th>
                    <th className="px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 whitespace-nowrap">Señal / fecha</th>
                    <th className="px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 whitespace-nowrap">Urgencia</th>
                  </tr>
                </thead>
                <tbody>
                  {filas.map((fila, i) => {
                    const meta = ALERTA_META[fila.tipo];
                    const Icon = meta.icon;
                    const fecha = fechaSenalAlerta(fila);
                    return (
                      <tr
                        key={`${fila.tipo}-${fila.animal.animalId}-${i}`}
                        className="border-t border-gray-100 hover:bg-gray-50"
                      >
                        <td className="px-3 py-2.5 whitespace-nowrap">
                          <span className="inline-flex items-center gap-2">
                            <span className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 ${meta.tono}`}>
                              <Icon className="w-4 h-4" />
                            </span>
                            <span className="font-medium text-gray-900">{meta.tipoLabel}</span>
                          </span>
                        </td>
                        <td className="px-3 py-2.5">
                          <Link to={`/hato-lechero/hato/${fila.animal.animalId}`} className="hover:text-gray-900">
                            <AnimalLabel animal={fila.animal} />
                          </Link>
                        </td>
                        <td className="px-3 py-2.5 whitespace-nowrap text-gray-600">
                          {capitalize(meta.mensaje)}
                          {fecha ? ` — ${formatShortDate(fecha)}` : ''}
                        </td>
                        <td className="px-3 py-2.5 whitespace-nowrap">
                          <EstadoChip chip={PILL_ALERTA[fila.tipo](fila.animal, hoy)} />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
