// ARCHIVO: components/hato/HojaDeVida.tsx
// DESCRIPCIÓN: Ruta `/hato-lechero/hato/:id` (S4, plan §7.5 pantalla ③).
// Ficha completa de un animal: identidad + franja de estadísticas + timeline
// reproductiva (A3, TODOS los servicios, V7) + genealogía (madre Y padre,
// A5/V8) + historial de chequeos. Figma alignment spec §3 (Wave 2a) agrega:
// `HatoPageHeader` compartido, la acción rápida "Registrar parto", la curva
// de PL por chequeo y la card de Tratamientos. La venta/muerte la aportó S9
// (`VentaAnimalDialog`/`MuerteAnimalDialog`), integrada aquí en el header.
// SOW 3 de `docs/plan_hato_produccion_rework.md` repuntó "Registrar venta"
// a `VentaAnimalesHatoDialog` (decisión 7 del dueño: terneros/descarte son
// flujos de `fin_ingresos`, no de `fin_transacciones_ganado` -- ver SOW 0
// del mismo plan). `MuerteAnimalDialog` no cambia: la muerte nunca fue una
// transacción financiera.
//
// SOW 5 (§4.4, decisión 9 del dueño): la curva SEMANAL
// (`CurvaSemanalProduccion`, `hato_pesajes_leche`) pasa a ser la curva
// PRINCIPAL de producción; la curva por chequeo (`CurvaProduccionLeche`,
// PL bimestral) se APARCA -- NO se borra, queda en un acordeón secundario
// rotulado "Estimación anterior".
//
// S3 T4a+T4b (docs/plan_hato_ciclo_manual_override.md): "Marcar ciclo"
// reemplaza el antiguo botón "Registrar parto" (`RegistrarPartoDialog`,
// borrado -- absorbido en la marca "parida" de `MarcarCicloDialog`).
// Gateado a Gerencia SOLA (D-7), distinto de `canEdit`
// (Administrador+Gerencia) que sigue gobernando editar/venta/muerte. La
// línea de tiempo gana acciones "Corregir" por evento (T4b, gateadas a
// `canEdit`) y la ficha gana la tarjeta de historial de correcciones.

import { useMemo, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Loader2, AlertTriangle, ArrowLeft, Pencil, HandCoins, RefreshCw, Skull, ChevronUp, ChevronDown } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useHatoAnimal } from './hooks/useHatoAnimal';
import { useHatoTratamientos } from './hooks/useHatoTratamientos';
import { usePesajesVaca } from './hooks/usePesajesVaca';
import { EstadoChip } from './components/EstadoChip';
import { FranjaEstadisticas } from './components/FranjaEstadisticas';
import { EventoTimeline } from './components/EventoTimeline';
import { GenealogiaArbol } from './components/GenealogiaArbol';
import { EditarAnimalDialog } from './components/EditarAnimalDialog';
import { MarcarCicloDialog } from './components/MarcarCicloDialog';
import { EditarEventoDialog } from './components/EditarEventoDialog';
import { HistorialCorreccionesCard } from './components/HistorialCorreccionesCard';
import { CurvaSemanalProduccion } from './components/CurvaSemanalProduccion';
import { CurvaProduccionLeche } from './components/CurvaProduccionLeche';
import { TratamientosCard } from './components/TratamientosCard';
import { HatoPageHeader } from './components/HatoPageHeader';
import { VentaAnimalesHatoDialog } from './components/VentaAnimalesHatoDialog';
import { MuerteAnimalDialog } from './components/MuerteAnimalDialog';
import { Button } from '@/components/ui/button';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { chipEstadoReproductivo, chipVaciaEsProblema, chipProximaAReemplazo, chipNumeroProvisional } from '@/utils/hatoUi';
import { ordenarPorValor, type DireccionOrdenAnimales as DireccionOrden } from '@/utils/ordenarAnimalesHato';
import { formatShortDate, formatNumber, capitalize } from '@/utils/format';
import { obtenerFechaHoy } from '@/utils/fechas';
import type { ChequeoHistorialItem } from './hooks/useHatoAnimal';
import type { HatoEventoRow } from '@/types/hato';

/** T2 (ronda agosto 2026): encabezado ordenable de la tabla de chequeos de
 * la Hoja de Vida. Sin columna de nombre (una sola ficha por página), así
 * que "ordenable" acá es Fecha asc/desc -- el default (desc, más reciente
 * primero) reproduce el orden que ya traía `useHatoAnimal` de fábrica. */
function CabeceraOrdenableChequeo({
  label,
  ordenActual,
  onOrdenar,
  align = 'left',
}: {
  label: string;
  ordenActual: DireccionOrden;
  onOrdenar: () => void;
  align?: 'left' | 'right';
}) {
  return (
    <th className={`px-3 py-2 text-xs font-semibold uppercase tracking-wide text-gray-500 ${align === 'right' ? 'text-right' : 'text-left'}`}>
      <button type="button" onClick={onOrdenar} className="inline-flex items-center gap-1 hover:text-gray-900 text-gray-900">
        {label}
        {ordenActual === 'asc' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
      </button>
    </th>
  );
}

export function HojaDeVida() {
  const { id } = useParams<{ id: string }>();
  const { detalle, loading, error, reload } = useHatoAnimal(id);
  const { tratamientos, loading: tratamientosLoading, error: tratamientosError } = useHatoTratamientos(id);
  const { pesajes } = usePesajesVaca(id);
  const { profile } = useAuth();
  // Fecha del último `parto` de `detalle.eventos` (ya trae TODOS los
  // eventos del animal, V7) -- decisión 11: sin ningún parto conocido, la
  // curva semanal cae al fallback de eje calendario, NUNCA se le imputa
  // una fecha. Hook llamado incondicionalmente (regla de React) aunque
  // `detalle` todavía sea `null` mientras carga.
  const fechaUltimoParto = useMemo(() => {
    const fechasParto = (detalle?.eventos ?? []).filter((e) => e.tipo === 'parto').map((e) => e.fecha);
    return fechasParto.length === 0 ? null : fechasParto.reduce((max, f) => (f > max ? f : max));
  }, [detalle]);
  const canEdit = profile?.rol === 'Administrador' || profile?.rol === 'Gerencia';
  // D-7 (docs/plan_hato_ronda_agosto_2026.md §0): solo Gerencia marca el
  // ciclo reproductivo -- el gate es el ROL, nunca el resultado de una
  // consulta. Distinto de `canEdit`, que sigue siendo Administrador+Gerencia
  // para el resto de acciones (editar/venta/muerte/correcciones).
  const canMarcarCiclo = profile?.rol === 'Gerencia';
  const [editOpen, setEditOpen] = useState(false);
  const [marcarCicloOpen, setMarcarCicloOpen] = useState(false);
  const [eventoSeleccionado, setEventoSeleccionado] = useState<HatoEventoRow | null>(null);
  const [ventaOpen, setVentaOpen] = useState(false);
  const [muerteOpen, setMuerteOpen] = useState(false);
  // Desc por defecto (más reciente primero) -- mismo orden que ya traía
  // `useHatoAnimal` (T2, ronda agosto 2026: encabezado ahora interactivo).
  const [ordenChequeos, setOrdenChequeos] = useState<DireccionOrden>('desc');
  const chequeosOrdenados = useMemo(
    () => ordenarPorValor(detalle?.chequeos ?? [], (c: ChequeoHistorialItem) => c.chequeoFecha || null, ordenChequeos),
    [detalle, ordenChequeos],
  );

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  if (error || !detalle) {
    return (
      <div className="min-h-screen bg-background p-4 lg:p-8">
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
  // `obtenerFechaHoy()` -- NUNCA `new Date().toISOString().slice(0, 10)`,
  // que es UTC y ya es "mañana" en Bogotá después de las 19:00.
  const hoy = obtenerFechaHoy();
  // Venta/muerte (S9) solo aplican a un animal todavía activo -- uno ya
  // vendido/muerto/descartado no puede volver a salir del hato por esta vía.
  const puedeRegistrarSalida = canEdit && animal.estado === 'activa';

  const proyectados = [
    ...(derivado.fecha_secar ? [{ tipo: 'secar' as const, fecha: derivado.fecha_secar }] : []),
    ...(derivado.fecha_probable_parto ? [{ tipo: 'parto_probable' as const, fecha: derivado.fecha_probable_parto }] : []),
  ];

  const vaciaChip = chipVaciaEsProblema(derivado.vacia_es_problema);

  // T4b: `chequeo_vaca_id -> hato_chequeos.fecha`, para el chip "Del
  // chequeo del {fecha}" de EventoTimeline y el aviso de caducidad de
  // EditarEventoDialog -- reusa `detalle.chequeos` (ya trae la fecha vía
  // join), sin una query nueva.
  const chequeoFechaPorChequeoVacaId = Object.fromEntries(
    chequeos.filter((c) => c.chequeoFecha).map((c) => [c.id, c.chequeoFecha]),
  );

  const identidad = `${animal.numero != null ? `#${animal.numero}` : 'Sin caravana'}${animal.nombre ? ` ${animal.nombre}` : ''}`;
  const subtitulo = `${capitalize(animal.etapa)}${animal.raza ? ` · ${capitalize(animal.raza)}` : ''}${
    animal.fecha_nacimiento ? ` · Nació ${formatShortDate(animal.fecha_nacimiento)}` : ''
  }`;

  return (
    <div className="min-h-screen bg-background p-4 lg:p-8">
      <div className="max-w-5xl mx-auto w-full space-y-6">
        <Link to="/hato-lechero/hato" className="inline-flex items-center gap-1 text-sm text-primary hover:underline">
          <ArrowLeft className="w-4 h-4" /> Volver al hato
        </Link>

        <HatoPageHeader
          breadcrumb="Animales"
          section={identidad}
          title={identidad}
          subtitle={subtitulo}
          actions={
            <>
              {canMarcarCiclo && (
                <Button variant="outline" size="sm" onClick={() => setMarcarCicloOpen(true)}>
                  <RefreshCw className="w-4 h-4 mr-1.5" /> Marcar ciclo
                </Button>
              )}
              {canEdit && (
                <>
                  {puedeRegistrarSalida && (
                    <>
                      <Button variant="outline" size="sm" onClick={() => setVentaOpen(true)}>
                        <HandCoins className="w-4 h-4 mr-1.5" /> Registrar venta
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => setMuerteOpen(true)}>
                        <Skull className="w-4 h-4 mr-1.5" /> Registrar muerte
                      </Button>
                    </>
                  )}
                  <Button variant="outline" size="sm" onClick={() => setEditOpen(true)}>
                    <Pencil className="w-4 h-4 mr-1.5" /> Editar
                  </Button>
                </>
              )}
            </>
          }
        />

        <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-center gap-1.5">
            <EstadoChip chip={chipEstadoReproductivo(derivado.estado)} />
            {vaciaChip && <EstadoChip chip={vaciaChip} />}
            {derivado.proxima_a_reemplazo && <EstadoChip chip={chipProximaAReemplazo()} />}
            {numeroEsProvisional && <EstadoChip chip={chipNumeroProvisional()} />}
          </div>

          <div className="mt-4">
            <FranjaEstadisticas
              pl={pl}
              numPartos={numPartos}
              estado={derivado.estado}
              diasAbiertos={derivado.dias_abiertos}
              tiempoPrenezDias={derivado.tiempo_prenez_dias}
              tiempoSecadaDias={derivado.tiempo_secada_dias}
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
            <EventoTimeline
              eventos={eventos}
              nombresToroPorId={nombresToroPorId}
              proyectados={proyectados}
              fechaHoy={hoy}
              chequeoFechaPorId={chequeoFechaPorChequeoVacaId}
              puedeEditar={canEdit}
              onEditar={setEventoSeleccionado}
            />
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

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <CurvaSemanalProduccion pesajes={pesajes} fechaUltimoParto={fechaUltimoParto} />
          <TratamientosCard tratamientos={tratamientos} loading={tratamientosLoading} error={tratamientosError} />
        </div>

        {/* Curva por chequeo (PL bimestral) -- APARCADA, no borrada
            (decisión 9 del dueño, plan §4.4): la curva semanal de arriba es
            ahora la principal. Colapsada por defecto para no competir
            visualmente con la curva vigente. */}
        <Accordion type="single" collapsible>
          <AccordionItem value="curva-pl-chequeo" className="rounded-xl border border-gray-200 bg-white px-5">
            <AccordionTrigger className="text-sm font-semibold text-gray-900">
              Estimación anterior — PL por chequeo (bimestral)
            </AccordionTrigger>
            <AccordionContent>
              <CurvaProduccionLeche chequeos={chequeos} />
            </AccordionContent>
          </AccordionItem>
        </Accordion>

        <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-gray-900 mb-4">Historial de chequeos</h2>
          {chequeos.length === 0 ? (
            <p className="text-sm text-gray-500">Sin chequeos registrados todavía.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <CabeceraOrdenableChequeo
                      label="Fecha"
                      ordenActual={ordenChequeos}
                      onOrdenar={() => setOrdenChequeos((prev) => (prev === 'asc' ? 'desc' : 'asc'))}
                    />
                    <th className="px-3 py-2 text-right text-xs font-semibold uppercase tracking-wide text-gray-500">PL</th>
                    <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Servicio</th>
                    <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Toro</th>
                    <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Secar</th>
                    <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Parto probable</th>
                  </tr>
                </thead>
                <tbody>
                  {chequeosOrdenados.map((c, i) => (
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

        <HistorialCorreccionesCard
          correcciones={detalle.correcciones}
          nombrePorUsuarioId={detalle.nombrePorUsuarioId}
          loading={false}
          error={null}
        />
      </div>

      {canEdit && (
        <>
          <EditarAnimalDialog
            open={editOpen}
            onOpenChange={setEditOpen}
            animal={animal}
            onGuardado={reload}
          />
          <EditarEventoDialog
            open={!!eventoSeleccionado}
            onOpenChange={(o) => {
              if (!o) setEventoSeleccionado(null);
            }}
            evento={eventoSeleccionado}
            chequeoFecha={
              eventoSeleccionado?.chequeo_vaca_id
                ? chequeoFechaPorChequeoVacaId[eventoSeleccionado.chequeo_vaca_id] ?? null
                : null
            }
            nombresToroPorId={nombresToroPorId}
            onGuardado={reload}
          />
        </>
      )}

      {canMarcarCiclo && (
        <MarcarCicloDialog
          open={marcarCicloOpen}
          onOpenChange={setMarcarCicloOpen}
          animalId={animal.id}
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
          <VentaAnimalesHatoDialog
            open={ventaOpen}
            onOpenChange={setVentaOpen}
            animalIdPreseleccionado={animal.id}
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
