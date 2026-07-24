// ARCHIVO: components/hato/PajillasView.tsx
// DESCRIPCIÓN: Ruta `/hato-lechero/pajillas` (S10, plan §7.5/§8 — 6º ítem del
// sidebar del Hato Lechero, cableado por la sesión principal en `Layout.tsx`
// + `App.tsx`). Dos bloques independientes:
//
//   1. Catálogo de toros (G4/V12, `hato_toros`) -- fuente única del toro que
//      alimenta la genealogía (padre) y las pajillas/servicios.
//   2. Inventario de pajillas (G1-G3, `hato_pajillas`/`hato_pajillas_uso` +
//      `v_hato_pajillas_stock`, migración 057) -- deliberadamente mínimo, sin
//      proveedor/costo. El stock puede llegar a 0 o negativo: se advierte
//      con un chip ámbar, NUNCA se bloquea registrar un uso nuevo (G3).
//
// Escritura gateada a Administrador/Gerencia (mismo set que la RLS de las
// tablas `hato_*`, patrón 044) -- otros roles ven las mismas tablas en
// solo-lectura, igual que `GanadoDashboard.tsx`/`GanadoMovimientos.tsx`.

import { useEffect, useState } from 'react';
import { Loader2, AlertTriangle, Plus, Pencil, Syringe } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { EstadoChip } from './components/EstadoChip';
import { chipStockPajillas } from '@/utils/hatoUi';
import { useAuth } from '@/contexts/AuthContext';
import { useHatoToros } from './hooks/useHatoToros';
import { useHatoPajillas } from './hooks/useHatoPajillas';
import { ToroFormDialog } from './components/ToroFormDialog';
import { PajillaCompraDialog } from './components/PajillaCompraDialog';
import { PajillaUsoDialog } from './components/PajillaUsoDialog';
import type { HatoToroRow } from '@/types/hato';

const LABEL_TIPO: Record<string, string> = {
  monta: 'Monta',
  inseminacion: 'Inseminación',
};

export function PajillasView() {
  const { hasRole } = useAuth();
  const puedeEscribir = hasRole(['Administrador', 'Gerencia']);

  const { toros, loading: cargandoToros, error: errorToros, reload: recargarToros } = useHatoToros();
  const {
    pajillas,
    animales,
    loading: cargandoPajillas,
    error: errorPajillas,
    guardando,
    reload: recargarPajillas,
    registrarCompra,
    registrarUso,
  } = useHatoPajillas();

  const [dialogToro, setDialogToro] = useState<{ open: boolean; toro: HatoToroRow | null }>({ open: false, toro: null });
  const [dialogCompra, setDialogCompra] = useState(false);
  const [dialogUso, setDialogUso] = useState<{ open: boolean; pajillaId: string | null }>({ open: false, pajillaId: null });

  useEffect(() => {
    recargarToros();
    recargarPajillas();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const recargarTodo = () => {
    recargarToros();
    recargarPajillas();
  };

  const cargando = cargandoToros || cargandoPajillas;
  const error = errorToros ?? errorPajillas;

  return (
    <div className="min-h-screen min-h-[100dvh] bg-gray-50 p-4 lg:p-8">
      <div className="max-w-5xl mx-auto w-full space-y-6">
        <div>
          <h1 className="text-foreground mb-1">Pajillas de inseminación</h1>
          <p className="text-sm text-gray-500">Catálogo de toros e inventario de pajillas — inventario simple, sin proveedor ni costo.</p>
        </div>

        {error && (
          <div className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            <AlertTriangle className="w-4 h-4 flex-shrink-0" />
            {error}
          </div>
        )}

        {cargando ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-6 h-6 animate-spin text-primary" />
          </div>
        ) : (
          <>
            {/* Catálogo de toros (G4/V12) */}
            <section className="rounded-xl border border-gray-200 bg-white overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
                <div>
                  <h2 className="text-base font-medium text-foreground">Catálogo de toros</h2>
                  <p className="text-xs text-gray-500">Fuente única del toro para genealogía, servicios y pajillas.</p>
                </div>
                {puedeEscribir && (
                  <Button size="sm" onClick={() => setDialogToro({ open: true, toro: null })}>
                    <Plus className="w-4 h-4 mr-1.5" />
                    Nuevo toro
                  </Button>
                )}
              </div>
              {toros.length === 0 ? (
                <div className="px-4 py-8 text-center text-sm text-gray-500">Ningún toro en el catálogo todavía.</div>
              ) : (
                <div className="overflow-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 whitespace-nowrap">Nombre</th>
                        <th className="px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 whitespace-nowrap">Tipo</th>
                        <th className="px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 whitespace-nowrap">Raza</th>
                        <th className="px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 whitespace-nowrap">Estado</th>
                        {puedeEscribir && <th className="px-3 py-2.5" />}
                      </tr>
                    </thead>
                    <tbody>
                      {toros.map((t, i) => (
                        <tr key={t.id} className={`border-t border-gray-100 ${i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}`}>
                          <td className="px-3 py-2.5 whitespace-nowrap font-medium">{t.nombre}</td>
                          <td className="px-3 py-2.5 whitespace-nowrap text-gray-600">{t.tipo ? LABEL_TIPO[t.tipo] ?? t.tipo : '—'}</td>
                          <td className="px-3 py-2.5 whitespace-nowrap text-gray-600 capitalize">{t.raza ?? '—'}</td>
                          <td className="px-3 py-2.5 whitespace-nowrap">
                            {t.activo ? (
                              <span className="text-xs text-green-700">Activo</span>
                            ) : (
                              <span className="text-xs text-gray-400">Inactivo</span>
                            )}
                          </td>
                          {puedeEscribir && (
                            <td className="px-3 py-2.5 whitespace-nowrap text-right">
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => setDialogToro({ open: true, toro: t })}
                                aria-label={`Editar ${t.nombre}`}
                              >
                                <Pencil className="w-4 h-4" />
                              </Button>
                            </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            {/* Inventario de pajillas (G1-G3) */}
            <section className="rounded-xl border border-gray-200 bg-white overflow-hidden">
              <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 border-b border-gray-100">
                <div>
                  <h2 className="text-base font-medium text-foreground">Inventario de pajillas</h2>
                  <p className="text-xs text-gray-500">Cantidad actual = inicial − usos registrados. Puede quedar en 0 o negativo.</p>
                </div>
                {puedeEscribir && (
                  <div className="flex items-center gap-2">
                    <Button size="sm" variant="outline" onClick={() => setDialogCompra(true)}>
                      <Plus className="w-4 h-4 mr-1.5" />
                      Registrar compra
                    </Button>
                    <Button size="sm" onClick={() => setDialogUso({ open: true, pajillaId: null })} disabled={pajillas.length === 0}>
                      <Syringe className="w-4 h-4 mr-1.5" />
                      Registrar uso
                    </Button>
                  </div>
                )}
              </div>
              {pajillas.length === 0 ? (
                <div className="px-4 py-8 text-center text-sm text-gray-500">
                  Ningún lote de pajillas registrado todavía.
                </div>
              ) : (
                <div className="overflow-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 whitespace-nowrap">Toro</th>
                        <th className="px-3 py-2.5 text-right text-xs font-semibold uppercase tracking-wide text-gray-500 whitespace-nowrap">Cantidad inicial</th>
                        <th className="px-3 py-2.5 text-right text-xs font-semibold uppercase tracking-wide text-gray-500 whitespace-nowrap">Usos</th>
                        <th className="px-3 py-2.5 text-right text-xs font-semibold uppercase tracking-wide text-gray-500 whitespace-nowrap">Cantidad actual</th>
                        {puedeEscribir && <th className="px-3 py-2.5" />}
                      </tr>
                    </thead>
                    <tbody>
                      {pajillas.map((p, i) => {
                        const chip = chipStockPajillas(p.cantidad_actual);
                        return (
                          <tr key={p.pajilla_id} className={`border-t border-gray-100 ${i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}`}>
                            <td className="px-3 py-2.5 whitespace-nowrap font-medium">{p.toroNombre}</td>
                            <td className="px-3 py-2.5 text-right whitespace-nowrap">{p.cantidad_inicial}</td>
                            <td className="px-3 py-2.5 text-right whitespace-nowrap">{p.usos}</td>
                            <td className="px-3 py-2.5 text-right whitespace-nowrap">
                              <div className="flex items-center justify-end gap-1.5">
                                <span>{p.cantidad_actual}</span>
                                {chip && <EstadoChip chip={chip} />}
                              </div>
                            </td>
                            {puedeEscribir && (
                              <td className="px-3 py-2.5 whitespace-nowrap text-right">
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => setDialogUso({ open: true, pajillaId: p.pajilla_id })}
                                >
                                  Registrar uso
                                </Button>
                              </td>
                            )}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </>
        )}
      </div>

      {puedeEscribir && (
        <>
          <ToroFormDialog
            open={dialogToro.open}
            onOpenChange={(open) => setDialogToro((prev) => ({ ...prev, open }))}
            toro={dialogToro.toro}
            onGuardado={recargarTodo}
          />
          <PajillaCompraDialog
            open={dialogCompra}
            onOpenChange={setDialogCompra}
            toros={toros}
            registrarCompra={registrarCompra}
            guardando={guardando}
            onGuardado={recargarPajillas}
          />
          <PajillaUsoDialog
            open={dialogUso.open}
            onOpenChange={(open) => setDialogUso((prev) => ({ ...prev, open }))}
            pajillas={pajillas}
            animales={animales}
            pajillaIdInicial={dialogUso.pajillaId}
            registrarUso={registrarUso}
            guardando={guardando}
            onGuardado={recargarPajillas}
          />
        </>
      )}
    </div>
  );
}
