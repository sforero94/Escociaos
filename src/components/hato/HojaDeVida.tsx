// ARCHIVO: components/hato/HojaDeVida.tsx
// DESCRIPCIÓN: Ruta `/hato-lechero/hato/:id` (S4, plan §7.5 pantalla ③).
// Ficha completa de un animal: identidad + franja de estadísticas + timeline
// reproductiva (A3, TODOS los servicios, V7) + genealogía (madre Y padre,
// A5/V8) + historial de chequeos.

import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Loader2, AlertTriangle, ArrowLeft, Pencil, HandCoins, Skull } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useHatoAnimal } from './hooks/useHatoAnimal';
import { EstadoChip } from './components/EstadoChip';
import { FranjaEstadisticas } from './components/FranjaEstadisticas';
import { EventoTimeline } from './components/EventoTimeline';
import { GenealogiaArbol } from './components/GenealogiaArbol';
import { EditarAnimalDialog } from './components/EditarAnimalDialog';
import { VentaAnimalDialog } from './components/VentaAnimalDialog';
import { MuerteAnimalDialog } from './components/MuerteAnimalDialog';
import { Button } from '@/components/ui/button';
import { chipEstadoReproductivo, chipVaciaEsProblema, chipProximaAReemplazo, chipNumeroProvisional } from '@/utils/hatoUi';
import { formatShortDate, formatNumber, capitalize } from '@/utils/format';

export function HojaDeVida() {
  const { id } = useParams<{ id: string }>();
  const { detalle, loading, error, reload } = useHatoAnimal(id);
  const { profile } = useAuth();
  const canEdit = profile?.rol === 'Administrador' || profile?.rol === 'Gerencia';
  const [editOpen, setEditOpen] = useState(false);
  const [ventaOpen, setVentaOpen] = useState(false);
  const [muerteOpen, setMuerteOpen] = useState(false);

  if (loading) {
    return (
      <div className="min-h-screen min-h-[100dvh] bg-gray-50 flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  if (error || !detalle) {
    return (
      <div className="min-h-screen min-h-[100dvh] bg-gray-50 p-4 lg:p-8">
        <div className="max-w-4xl mx-auto">
          <Link to="/hato-lechero/hato" className="inline-flex items-center gap-1 text-sm text-primary hover:underline mb-4">
            <ArrowLeft className="w-4 h-4" /> Volver al hato
          </Link>
          <div className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            <AlertTriangle className="w-4 h-4 flex-shrink-0" />
            {error ?? 'No se encontró el animal solicitado.'}
          </div>
        </div>
      </div>
    );
  }

  const { animal, derivado, eventos, chequeos, madre, padreToro, padreAnimal, crias, nombresToroPorId, numeroEsProvisional, pl, numPartos } = detalle;
  const hoy = new Date().toISOString().slice(0, 10);
  // Venta/muerte (S9) solo aplican a un animal todavía activo -- uno ya
  // vendido/muerto/descartado no puede volver a salir del hato por esta vía.
  const puedeRegistrarSalida = canEdit && animal.estado === 'activa';

  const proyectados = [
    ...(derivado.fecha_secar ? [{ tipo: 'secar' as const, fecha: derivado.fecha_secar }] : []),
    ...(derivado.fecha_probable_parto ? [{ tipo: 'parto_probable' as const, fecha: derivado.fecha_probable_parto }] : []),
  ];

  const vaciaChip = chipVaciaEsProblema(derivado.vacia_es_problema);

  return (
    <div className="min-h-screen min-h-[100dvh] bg-gray-50 p-4 lg:p-8">
      <div className="max-w-5xl mx-auto w-full space-y-6">
        <Link to="/hato-lechero/hato" className="inline-flex items-center gap-1 text-sm text-primary hover:underline">
          <ArrowLeft className="w-4 h-4" /> Volver al hato
        </Link>

        <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-foreground">
                  {animal.numero != null ? (
                    `#${animal.numero}`
                  ) : (
                    <span className="text-gray-400 italic">sin caravana</span>
                  )}{' '}
                  {animal.nombre ?? ''}
                </h1>
              </div>
              <p className="text-sm text-gray-500 mt-1">
                {capitalize(animal.etapa)}{animal.raza ? ` · ${capitalize(animal.raza)}` : ''}
                {animal.fecha_nacimiento ? ` · Nació ${formatShortDate(animal.fecha_nacimiento)}` : ''}
              </p>
            </div>
            <div className="flex flex-col items-end gap-2">
              <div className="flex flex-wrap items-center gap-1.5 justify-end">
                <EstadoChip chip={chipEstadoReproductivo(derivado.estado)} />
                {vaciaChip && <EstadoChip chip={vaciaChip} />}
                {derivado.proxima_a_reemplazo && <EstadoChip chip={chipProximaAReemplazo()} />}
                {numeroEsProvisional && <EstadoChip chip={chipNumeroProvisional()} />}
              </div>
              <div className="flex flex-wrap items-center gap-2 justify-end">
                {canEdit && (
                  <Button variant="outline" size="sm" onClick={() => setEditOpen(true)}>
                    <Pencil className="w-3.5 h-3.5 mr-1.5" /> Editar
                  </Button>
                )}
                {puedeRegistrarSalida && (
                  <>
                    <Button variant="outline" size="sm" onClick={() => setVentaOpen(true)}>
                      <HandCoins className="w-3.5 h-3.5 mr-1.5" /> Registrar venta
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => setMuerteOpen(true)}>
                      <Skull className="w-3.5 h-3.5 mr-1.5" /> Registrar muerte
                    </Button>
                  </>
                )}
              </div>
            </div>
          </div>

          <div className="mt-4">
            <FranjaEstadisticas
              pl={pl}
              numPartos={numPartos}
              diasAbiertos={derivado.dias_abiertos}
              fechaSecar={derivado.fecha_secar}
              fechaProbableParto={derivado.fecha_probable_parto}
            />
          </div>

          {animal.notas && (
            <p className="text-sm text-gray-600 mt-4 border-t border-gray-100 pt-3">{animal.notas}</p>
          )}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
            <h2 className="text-sm font-semibold text-gray-900 mb-4">Línea de tiempo reproductiva</h2>
            <EventoTimeline eventos={eventos} nombresToroPorId={nombresToroPorId} proyectados={proyectados} fechaHoy={hoy} />
          </div>

          <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
            <h2 className="text-sm font-semibold text-gray-900 mb-4">Genealogía</h2>
            <GenealogiaArbol
              madre={madre}
              padreToro={padreToro}
              padreAnimal={padreAnimal}
              actual={{ id: animal.id, numero: animal.numero, nombre: animal.nombre }}
              crias={crias}
            />
          </div>
        </div>

        <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-gray-900 mb-4">Historial de chequeos</h2>
          {chequeos.length === 0 ? (
            <p className="text-sm text-gray-500">Sin chequeos registrados todavía.</p>
          ) : (
            <div className="overflow-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Fecha</th>
                    <th className="px-3 py-2 text-right text-xs font-semibold uppercase tracking-wide text-gray-500">PL</th>
                    <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Servicio</th>
                    <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Toro</th>
                    <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Secar</th>
                    <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Parto probable</th>
                  </tr>
                </thead>
                <tbody>
                  {chequeos.map((c, i) => (
                    <tr key={c.id} className={`border-t border-gray-100 ${i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}`}>
                      <td className="px-3 py-2 whitespace-nowrap">{c.chequeoFecha ? formatShortDate(c.chequeoFecha) : '—'}</td>
                      <td className="px-3 py-2 text-right whitespace-nowrap">{c.pl != null ? formatNumber(c.pl, 1) : '—'}</td>
                      <td className="px-3 py-2 whitespace-nowrap">{c.fecha_servicio ? formatShortDate(c.fecha_servicio) : '—'}</td>
                      <td className="px-3 py-2 whitespace-nowrap">{c.toro ?? '—'}</td>
                      <td className="px-3 py-2 whitespace-nowrap">{c.fecha_secar ? formatShortDate(c.fecha_secar) : '—'}</td>
                      <td className="px-3 py-2 whitespace-nowrap">{c.fecha_probable_parto ? formatShortDate(c.fecha_probable_parto) : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {canEdit && (
        <EditarAnimalDialog
          open={editOpen}
          onOpenChange={setEditOpen}
          animal={animal}
          onGuardado={reload}
        />
      )}

      {/* Gateados por `canEdit`, no por `puedeRegistrarSalida`: ese último
          depende de `animal.estado`, que el propio guardado exitoso cambia
          -- condicionar el montaje del diálogo a él lo desmontaría a medio
          cerrar justo después de un guardado. El botón que los abre sí usa
          `puedeRegistrarSalida` (no tiene sentido ofrecer la acción sobre un
          animal ya vendido/muerto). */}
      {canEdit && (
        <>
          <VentaAnimalDialog
            open={ventaOpen}
            onOpenChange={setVentaOpen}
            animalId={animal.id}
            onGuardado={reload}
          />
          <MuerteAnimalDialog
            open={muerteOpen}
            onOpenChange={setMuerteOpen}
            animalId={animal.id}
            onGuardado={reload}
          />
        </>
      )}
    </div>
  );
}
