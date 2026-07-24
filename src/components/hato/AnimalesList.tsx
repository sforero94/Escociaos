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
// encabezados de columna ordenables A-Z (N.º/Nombre/Estado/PL/Próximo
// evento) y el botón "+ Registrar" gateado a Administrador/Gerencia.

import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Loader2, AlertTriangle, Search, Plus, ChevronUp, ChevronDown, ChevronsUpDown } from 'lucide-react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';
import { EstadoChip } from './components/EstadoChip';
import { HatoPageHeader } from './components/HatoPageHeader';
import { CrearAnimalDialog } from './components/CrearAnimalDialog';
import { useHatoAnimales, type AnimalHatoDerivado } from './hooks/useHatoAnimales';
import { chipEstadoReproductivo, chipProximaAReemplazo, chipNumeroProvisional } from '@/utils/hatoUi';
import { LABEL_CATEGORIA_HATO, type CategoriaHato } from '@/utils/hatoCategorias';
import {
  ordenarAnimalesHato,
  type ColumnaOrdenableAnimales as ColumnaOrdenable,
  type DireccionOrdenAnimales as DireccionOrden,
} from '@/utils/ordenarAnimalesHato';
import { formatNumber, formatShortDate } from '@/utils/format';

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

function TablaAnimales({ animales }: { animales: AnimalHatoDerivado[] }) {
  const [orden, setOrden] = useState<{ columna: ColumnaOrdenable; direccion: DireccionOrden }>({
    columna: 'numero',
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
              <th className="px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 whitespace-nowrap">Raza</th>
              <CabeceraOrdenable label="Estado" columna="estado" ordenActual={orden} onOrdenar={handleOrdenar} />
              <CabeceraOrdenable label="PL" columna="pl" ordenActual={orden} onOrdenar={handleOrdenar} align="right" />
              <CabeceraOrdenable label="Próximo evento" columna="proximo" ordenActual={orden} onOrdenar={handleOrdenar} />
              <th className="px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 whitespace-nowrap" />
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
                <td className="px-3 py-2.5 whitespace-nowrap text-gray-600">{animal.raza ?? '—'}</td>
                <td className="px-3 py-2.5 whitespace-nowrap">
                  <div className="flex flex-wrap items-center gap-1">
                    <EstadoChip chip={chipEstadoReproductivo(animal.derivado.estado)} />
                    {animal.numeroEsProvisional && <EstadoChip chip={chipNumeroProvisional()} />}
                    {animal.derivado.proxima_a_reemplazo && <EstadoChip chip={chipProximaAReemplazo()} />}
                  </div>
                </td>
                <td className="px-3 py-2.5 text-right whitespace-nowrap">
                  {animal.pl != null ? formatNumber(animal.pl, 1) : '—'}
                </td>
                <td className="px-3 py-2.5 whitespace-nowrap text-gray-600">{proximoEvento(animal)}</td>
                <td className="px-3 py-2.5 whitespace-nowrap text-right">
                  <Link to={`/hato-lechero/hato/${animal.animalId}`} className="text-xs text-primary hover:underline">
                    Ver ficha
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function AnimalesList() {
  const { animales, loading, error, reload } = useHatoAnimales();
  const { profile } = useAuth();
  const canEdit = profile?.rol === 'Administrador' || profile?.rol === 'Gerencia';
  const [busqueda, setBusqueda] = useState('');
  const [crearOpen, setCrearOpen] = useState(false);

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
          <Tabs defaultValue="hato">
            <TabsList>
              <TabsTrigger value="hato">{LABEL_CATEGORIA_HATO.hato} ({porCategoria.hato.length})</TabsTrigger>
              <TabsTrigger value="horro">{LABEL_CATEGORIA_HATO.horro} ({porCategoria.horro.length})</TabsTrigger>
              <TabsTrigger value="novilla">{LABEL_CATEGORIA_HATO.novilla} ({porCategoria.novilla.length})</TabsTrigger>
              <TabsTrigger value="ternera">{LABEL_CATEGORIA_HATO.ternera} ({porCategoria.ternera.length})</TabsTrigger>
            </TabsList>
            <TabsContent value="hato" className="mt-4">
              <TablaAnimales animales={porCategoria.hato} />
            </TabsContent>
            <TabsContent value="horro" className="mt-4">
              <TablaAnimales animales={porCategoria.horro} />
            </TabsContent>
            <TabsContent value="novilla" className="mt-4">
              <TablaAnimales animales={porCategoria.novilla} />
            </TabsContent>
            <TabsContent value="ternera" className="mt-4">
              <TablaAnimales animales={porCategoria.ternera} />
            </TabsContent>
          </Tabs>
        )}
      </div>

      {canEdit && (
        <CrearAnimalDialog open={crearOpen} onOpenChange={setCrearOpen} onCreado={reload} />
      )}
    </div>
  );
}
