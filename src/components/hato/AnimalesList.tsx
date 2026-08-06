// ARCHIVO: components/hato/AnimalesList.tsx
// DESCRIPCIÓN: Ruta `/hato-lechero/hato` (S4, plan §7.5). Lista del hato con
// las CUATRO categorías que pidió el dueño (decisión 2026-07-22, tercera
// ronda -- ver `utils/hatoCategorias.ts`): terneras, novillas, hato (en
// ordeño), horro (secas). El sub-nav horizontal del mock NO se implementa
// (resuelto por el sidebar de producción, ver plan §7.6 "Decisiones que el
// prototipo no resuelve" #1) -- las 4 categorías se navegan con tabs
// internos de esta vista.
//
// Figma alignment spec §4 (Wave 2a) agrega: `HatoPageHeader` compartido,
// encabezados de columna ordenables A-Z y el botón "+ Registrar" gateado a
// Administrador/Gerencia.
//
// S3 T4a (docs/plan_hato_ciclo_manual_override.md §3.5) agrega la acción
// por fila "Marcar ciclo" (Gerencia sola, D-7) -- Martha necesita marcar
// varias vacas seca de un tirón (S6) sin abrir 9 fichas.
//
// Orden de columnas (pedido del dueño, 2026-08-06): N.º · Nombre · Estado ·
// Último parto · Próximo evento · Raza · Producción · Acciones. Raza se
// corrió al final (hoy vacía en las 179 fichas -- nada la puebla todavía) y
// PL (del último chequeo bimestral) se reemplaza por "Producción": litros/
// día del PESAJE SEMANAL más reciente, la misma métrica "actual" (promedio
// móvil de 4 semanas, `rendimientoPorVaca`) que ya usa `RankingVacas` --
// nunca una tercera fórmula. `Último parto`/`Producción` son de solo
// lectura, no sorteables todavía (mismo tratamiento que `Raza`).

import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Loader2, AlertTriangle, Search, Plus, RefreshCw, ChevronUp, ChevronDown, ChevronsUpDown } from 'lucide-react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';
import { EstadoChip } from './components/EstadoChip';
import { HatoPageHeader } from './components/HatoPageHeader';
import { ChipVejezPesajes } from './components/ChipVejezPesajes';
import { CrearAnimalDialog } from './components/CrearAnimalDialog';
import { MarcarCicloDialog } from './components/MarcarCicloDialog';
import { useHatoAnimales, type AnimalHatoDerivado } from './hooks/useHatoAnimales';
import { usePesajesYPartos } from './hooks/usePesajesYPartos';
import { chipEstadoReproductivo, chipProximaAReemplazo, chipNumeroProvisional, chipSubetapaTernera } from '@/utils/hatoUi';
import { LABEL_CATEGORIA_HATO, type CategoriaHato } from '@/utils/hatoCategorias';
import {
  ordenarAnimalesHato,
  type ColumnaOrdenableAnimales as ColumnaOrdenable,
  type DireccionOrdenAnimales as DireccionOrden,
} from '@/utils/ordenarAnimalesHato';
import { rendimientoPorVaca, fechaAnclaProduccion, vejezPesajes, type RendimientoVaca } from '@/utils/hatoProduccion';
import { formatNumber, formatShortDate } from '@/utils/format';
import { obtenerFechaHoy } from '@/utils/fechas';

/** Texto de la columna "Producción" (litros/día, promedio móvil de la
 * ventana actual de `rendimientoPorVaca` -- MISMA métrica que
 * `RankingVacas`, nunca una segunda fórmula). Sin pesajes en la ventana:
 * `—`, nunca 0 (regla dura del módulo). */
function produccionTexto(animal: AnimalHatoDerivado, rendimientoPorAnimal: Map<string, RendimientoVaca>): string {
  const actual = rendimientoPorAnimal.get(animal.animalId)?.actual;
  return actual != null ? `${formatNumber(actual, 1)} L/día` : '—';
}

function proximoEvento(animal: AnimalHatoDerivado): string {
  if (animal.derivado.fecha_probable_parto) {
    return `Parto: ${formatShortDate(animal.derivado.fecha_probable_parto)}`;
  }
  if (animal.derivado.fecha_secar) {
    return `Secar: ${formatShortDate(animal.derivado.fecha_secar)}`;
  }
  return '—';
}

function CabeceraOrdenable({
  label,
  columna,
  ordenActual,
  onOrdenar,
  align = 'left',
}: {
  label: string;
  columna: ColumnaOrdenable;
  ordenActual: { columna: ColumnaOrdenable; direccion: DireccionOrden };
  onOrdenar: (columna: ColumnaOrdenable) => void;
  align?: 'left' | 'right';
}) {
  const activa = ordenActual.columna === columna;
  return (
    <th className={`px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-gray-500 whitespace-nowrap ${align === 'right' ? 'text-right' : 'text-left'}`}>
      <button
        type="button"
        onClick={() => onOrdenar(columna)}
        className={`inline-flex items-center gap-1 hover:text-gray-900 ${activa ? 'text-gray-900' : ''}`}
      >
        {label}
        {activa ? (
          ordenActual.direccion === 'asc' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />
        ) : (
          <ChevronsUpDown className="w-3 h-3 text-gray-300" />
        )}
      </button>
    </th>
  );
}

function TablaAnimales({
  animales,
  canMarcarCiclo,
  onMarcarCiclo,
  rendimientoPorAnimal,
}: {
  animales: AnimalHatoDerivado[];
  canMarcarCiclo: boolean;
  onMarcarCiclo: (animalId: string) => void;
  rendimientoPorAnimal: Map<string, RendimientoVaca>;
}) {
  // Alfabético por defecto (T2, ronda agosto 2026): Martha ubica los
  // animales por nombre, no por número -- ver CLAUDE.md del módulo.
  const [orden, setOrden] = useState<{ columna: ColumnaOrdenable; direccion: DireccionOrden }>({
    columna: 'nombre',
    direccion: 'asc',
  });

  const handleOrdenar = (columna: ColumnaOrdenable) => {
    setOrden((prev) =>
      prev.columna === columna
        ? { columna, direccion: prev.direccion === 'asc' ? 'desc' : 'asc' }
        : { columna, direccion: 'asc' },
    );
  };

  const animalesOrdenados = useMemo(() => ordenarAnimalesHato(animales, orden.columna, orden.direccion), [animales, orden]);

  if (animales.length === 0) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white px-4 py-8 text-center text-sm text-gray-500">
        Ningún animal en esta categoría con los filtros actuales.
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50">
            <tr>
              <CabeceraOrdenable label="N.º" columna="numero" ordenActual={orden} onOrdenar={handleOrdenar} />
              <CabeceraOrdenable label="Nombre" columna="nombre" ordenActual={orden} onOrdenar={handleOrdenar} />
              <CabeceraOrdenable label="Estado" columna="estado" ordenActual={orden} onOrdenar={handleOrdenar} />
              <th className="px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 whitespace-nowrap">Último parto</th>
              <CabeceraOrdenable label="Próximo evento" columna="proximo" ordenActual={orden} onOrdenar={handleOrdenar} />
              <th className="px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 whitespace-nowrap">Raza</th>
              <th className="px-3 py-2.5 text-right text-xs font-semibold uppercase tracking-wide text-gray-500 whitespace-nowrap">Producción</th>
              <th className="px-3 py-2.5 text-right text-xs font-semibold uppercase tracking-wide text-gray-500 whitespace-nowrap">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {animalesOrdenados.map((animal, i) => (
              <tr
                key={animal.animalId}
                className={`border-t border-gray-100 ${i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}`}
              >
                <td className="px-3 py-2.5 whitespace-nowrap font-medium">
                  <Link to={`/hato-lechero/hato/${animal.animalId}`} className="hover:text-primary">
                    {animal.numero != null ? (
                      `#${animal.numero}`
                    ) : (
                      <span className="text-gray-400 italic">sin caravana</span>
                    )}
                  </Link>
                </td>
                <td className="px-3 py-2.5 whitespace-nowrap">
                  <Link to={`/hato-lechero/hato/${animal.animalId}`} className="hover:text-primary">
                    {animal.nombre ?? '—'}
                  </Link>
                </td>
                <td className="px-3 py-2.5 whitespace-nowrap">
                  <div className="flex flex-wrap items-center gap-1">
                    <EstadoChip chip={chipEstadoReproductivo(animal.derivado.estado)} />
                    {animal.categoria === 'ternera' && (
                      <EstadoChip chip={chipSubetapaTernera(animal.subetapaTernera)} />
                    )}
                    {animal.numeroEsProvisional && <EstadoChip chip={chipNumeroProvisional()} />}
                    {animal.derivado.proxima_a_reemplazo && <EstadoChip chip={chipProximaAReemplazo()} />}
                  </div>
                </td>
                <td className="px-3 py-2.5 whitespace-nowrap text-gray-600">
                  {animal.ultimoPartoFecha ? formatShortDate(animal.ultimoPartoFecha) : '—'}
                </td>
                <td className="px-3 py-2.5 whitespace-nowrap text-gray-600">{proximoEvento(animal)}</td>
                <td className="px-3 py-2.5 whitespace-nowrap text-gray-600">{animal.raza ?? '—'}</td>
                <td className="px-3 py-2.5 text-right whitespace-nowrap">
                  {produccionTexto(animal, rendimientoPorAnimal)}
                </td>
                <td className="px-3 py-2.5 whitespace-nowrap text-right">
                  <div className="flex items-center justify-end gap-2">
                    {canMarcarCiclo && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => onMarcarCiclo(animal.animalId)}
                      >
                        <RefreshCw /> Marcar ciclo
                      </Button>
                    )}
                    <Button asChild variant="ghost" size="sm">
                      <Link to={`/hato-lechero/hato/${animal.animalId}`}>Ver ficha</Link>
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/** Resumen "por separado" de leche/concentrado/sin dato dentro de la
 * pestaña Terneras (D-13, ronda agosto 2026) -- Santiago quiere poder
 * CONTAR cada subgrupo sin abrir nada, para proyectar consumo de
 * concentrado más adelante. Lee `subetapaTernera` de los MISMOS animales
 * que ya decidieron la pestaña (nunca un segundo cálculo), así que nunca
 * puede contradecir el chip por fila ni el total de la pestaña. */
function ResumenSubetapaTerneras({ animales }: { animales: AnimalHatoDerivado[] }) {
  const conteo = useMemo(() => {
    let leche = 0;
    let concentrado = 0;
    let sinDato = 0;
    for (const animal of animales) {
      if (animal.subetapaTernera === 'leche') leche += 1;
      else if (animal.subetapaTernera === 'concentrado') concentrado += 1;
      else sinDato += 1;
    }
    return { leche, concentrado, sinDato };
  }, [animales]);

  if (animales.length === 0) return null;

  return (
    <div className="mb-3 flex flex-wrap items-center gap-4 rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm text-gray-600">
      <span className="font-medium text-gray-900">Por etapa de alimentación:</span>
      <span className="inline-flex items-center gap-1.5">
        <span className="inline-block w-2 h-2 rounded-full bg-blue-500" />
        Leche (0-3 m): <strong className="text-gray-900">{conteo.leche}</strong>
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span className="inline-block w-2 h-2 rounded-full bg-gray-400" />
        Concentrado (3-12 m): <strong className="text-gray-900">{conteo.concentrado}</strong>
      </span>
      {conteo.sinDato > 0 && (
        <span className="inline-flex items-center gap-1.5 text-amber-700">
          <span className="inline-block w-2 h-2 rounded-full bg-amber-500" />
          Sin dato de edad: <strong>{conteo.sinDato}</strong>
        </span>
      )}
    </div>
  );
}

export function AnimalesList() {
  const { animales, loading, error, reload } = useHatoAnimales();
  const { pesajes, partos, loading: loadingPesajes, error: errorPesajes } = usePesajesYPartos();
  const { profile } = useAuth();
  const canEdit = profile?.rol === 'Administrador' || profile?.rol === 'Gerencia';
  // D-7: solo Gerencia marca el ciclo reproductivo -- el gate es el ROL
  // (MarcarCicloDialog lo vuelve a comprobar internamente, defensa en
  // profundidad, mismo criterio que HojaDeVida.tsx).
  const canMarcarCiclo = profile?.rol === 'Gerencia';
  const [busqueda, setBusqueda] = useState('');
  const [crearOpen, setCrearOpen] = useState(false);
  const [marcarCicloOpen, setMarcarCicloOpen] = useState(false);
  const [animalCicloId, setAnimalCicloId] = useState<string | undefined>(undefined);

  const abrirMarcarCiclo = (animalId: string) => {
    setAnimalCicloId(animalId);
    setMarcarCicloOpen(true);
  };

  const animalesFiltrados = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    if (!q) return animales;
    return animales.filter((a) => {
      const numero = a.numero != null ? String(a.numero) : '';
      return numero.includes(q) || (a.nombre ?? '').toLowerCase().includes(q);
    });
  }, [animales, busqueda]);

  const porCategoria = useMemo(() => {
    const grupos: Record<CategoriaHato, AnimalHatoDerivado[]> = { ternera: [], novilla: [], hato: [], horro: [] };
    for (const animal of animalesFiltrados) {
      if (animal.categoria) grupos[animal.categoria].push(animal);
    }
    return grupos;
  }, [animalesFiltrados]);

  // Columna "Producción" (litros/día): MISMA métrica "actual" que
  // `RankingVacas` (`rendimientoPorVaca`, promedio móvil de 4 semanas),
  // anclada al pesaje MÁS RECIENTE del hato (`fechaAnclaProduccion`) --
  // nunca a "hoy" literal, para no vaciar la columna entera por backlog
  // operativo (mismo criterio que `ProduccionView.tsx`, QA fix FIX 3).
  const hoy = obtenerFechaHoy();
  const fechaAncla = useMemo(() => fechaAnclaProduccion(pesajes, hoy), [pesajes, hoy]);
  const rendimientoPorAnimal = useMemo(() => {
    const mapa = new Map<string, RendimientoVaca>();
    for (const r of rendimientoPorVaca(pesajes, partos, fechaAncla)) {
      mapa.set(r.animalId, r);
    }
    return mapa;
  }, [pesajes, partos, fechaAncla]);
  // Vejez del pesaje semanal contra "hoy" REAL (nunca contra `fechaAncla`,
  // que se moverla siempre a "ok" comparándose consigo misma) -- se
  // muestra SIEMPRE junto a la columna "Producción" para que nadie la lea
  // como litros de hoy (decisión del dueño, 2026-08-06).
  const vejez = useMemo(() => vejezPesajes(pesajes, hoy), [pesajes, hoy]);

  const cargando = loading || loadingPesajes;
  const errorCombinado = error ?? errorPesajes;

  return (
    <div className="min-h-screen min-h-[100dvh] bg-gray-50 p-4 lg:p-8">
      <div className="max-w-7xl mx-auto w-full">
        <HatoPageHeader
          breadcrumb="Hato Lechero"
          section="Animales"
          title="Hato"
          subtitle="Terneras, novillas, hato en ordeño y horro (secas) — Finca Subachoque"
          actions={
            <>
              <div className="relative w-full max-w-xs">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <Input
                  value={busqueda}
                  onChange={(e) => setBusqueda(e.target.value)}
                  placeholder="Buscar por número o nombre..."
                  className="pl-9"
                />
              </div>
              {canEdit && (
                <Button onClick={() => setCrearOpen(true)}>
                  <Plus className="w-4 h-4 mr-1.5" /> Registrar
                </Button>
              )}
            </>
          }
        />

        {errorCombinado && (
          <div className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 mb-6 text-sm text-red-700">
            <AlertTriangle className="w-4 h-4 flex-shrink-0" />
            {errorCombinado}
          </div>
        )}

        {cargando ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-6 h-6 animate-spin text-primary" />
          </div>
        ) : (
          <>
            <div className="mb-4 flex flex-wrap items-center gap-2 text-sm text-gray-600">
              <span>Columna &quot;Producción&quot;:</span>
              <ChipVejezPesajes vejez={vejez} />
            </div>
            <Tabs defaultValue="hato">
              <TabsList>
                <TabsTrigger value="hato">{LABEL_CATEGORIA_HATO.hato} ({porCategoria.hato.length})</TabsTrigger>
                <TabsTrigger value="horro">{LABEL_CATEGORIA_HATO.horro} ({porCategoria.horro.length})</TabsTrigger>
                <TabsTrigger value="novilla">{LABEL_CATEGORIA_HATO.novilla} ({porCategoria.novilla.length})</TabsTrigger>
                <TabsTrigger value="ternera">{LABEL_CATEGORIA_HATO.ternera} ({porCategoria.ternera.length})</TabsTrigger>
              </TabsList>
              <TabsContent value="hato" className="mt-4">
                <TablaAnimales
                  animales={porCategoria.hato}
                  canMarcarCiclo={canMarcarCiclo}
                  onMarcarCiclo={abrirMarcarCiclo}
                  rendimientoPorAnimal={rendimientoPorAnimal}
                />
              </TabsContent>
              <TabsContent value="horro" className="mt-4">
                <TablaAnimales
                  animales={porCategoria.horro}
                  canMarcarCiclo={canMarcarCiclo}
                  onMarcarCiclo={abrirMarcarCiclo}
                  rendimientoPorAnimal={rendimientoPorAnimal}
                />
              </TabsContent>
              <TabsContent value="novilla" className="mt-4">
                <TablaAnimales
                  animales={porCategoria.novilla}
                  canMarcarCiclo={canMarcarCiclo}
                  onMarcarCiclo={abrirMarcarCiclo}
                  rendimientoPorAnimal={rendimientoPorAnimal}
                />
              </TabsContent>
              <TabsContent value="ternera" className="mt-4">
                <ResumenSubetapaTerneras animales={porCategoria.ternera} />
                <TablaAnimales
                  animales={porCategoria.ternera}
                  canMarcarCiclo={canMarcarCiclo}
                  onMarcarCiclo={abrirMarcarCiclo}
                  rendimientoPorAnimal={rendimientoPorAnimal}
                />
              </TabsContent>
            </Tabs>
          </>
        )}
      </div>

      {canEdit && (
        <CrearAnimalDialog open={crearOpen} onOpenChange={setCrearOpen} onCreado={reload} />
      )}

      {canMarcarCiclo && (
        <MarcarCicloDialog
          open={marcarCicloOpen}
          onOpenChange={setMarcarCicloOpen}
          animalId={animalCicloId}
          onGuardado={reload}
        />
      )}
    </div>
  );
}
