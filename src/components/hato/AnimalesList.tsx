// ARCHIVO: components/hato/AnimalesList.tsx
// DESCRIPCIÓN: Ruta `/hato-lechero/hato` (S4, plan §7.5). Lista del hato con
// las TRES categorías que pidió el dueño (decisión 2026-07-22, ver
// `utils/hatoCategorias.ts`): terneras, hato (en ordeño), horro (secas). El
// sub-nav horizontal del mock NO se implementa (resuelto por el sidebar de
// producción, ver plan §7.6 "Decisiones que el prototipo no resuelve" #1) --
// las 3 categorías se navegan con tabs internos de esta vista.

import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Loader2, AlertTriangle, Search } from 'lucide-react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { EstadoChip } from './components/EstadoChip';
import { useHatoAnimales, type AnimalHatoDerivado } from './hooks/useHatoAnimales';
import { chipEstadoReproductivo, chipProximaAReemplazo, chipNumeroProvisional } from '@/utils/hatoUi';
import { LABEL_CATEGORIA_HATO, type CategoriaHato } from '@/utils/hatoCategorias';
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

function TablaAnimales({ animales }: { animales: AnimalHatoDerivado[] }) {
  if (animales.length === 0) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white px-4 py-8 text-center text-sm text-gray-500">
        Ningún animal en esta categoría con los filtros actuales.
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
      <div className="overflow-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 whitespace-nowrap">N.º</th>
              <th className="px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 whitespace-nowrap">Nombre</th>
              <th className="px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 whitespace-nowrap">Raza</th>
              <th className="px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 whitespace-nowrap">Estado</th>
              <th className="px-3 py-2.5 text-right text-xs font-semibold uppercase tracking-wide text-gray-500 whitespace-nowrap">PL</th>
              <th className="px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 whitespace-nowrap">Próximo evento</th>
              <th className="px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 whitespace-nowrap" />
            </tr>
          </thead>
          <tbody>
            {animales.map((animal, i) => (
              <tr
                key={animal.animalId}
                className={`border-t border-gray-100 ${i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}`}
              >
                <td className="px-3 py-2.5 whitespace-nowrap font-medium">
                  <Link to={`/hato-lechero/hato/${animal.animalId}`} className="hover:text-primary">
                    {animal.numero != null ? `#${animal.numero}` : '—'}
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
  const { animales, loading, error } = useHatoAnimales();
  const [busqueda, setBusqueda] = useState('');

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
        <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
          <div>
            <h1 className="text-foreground mb-1">Hato</h1>
            <p className="text-sm text-gray-500">Terneras, novillas, hato en ordeño y horro (secas) — Finca Subachoque</p>
          </div>
          <div className="relative w-full max-w-xs">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <Input
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Buscar por número o nombre..."
              className="pl-9"
            />
          </div>
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
    </div>
  );
}
