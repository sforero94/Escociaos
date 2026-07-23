// ARCHIVO: components/hato/components/GenealogiaArbol.tsx
// DESCRIPCIÓN: Componente canónico nuevo del plan §7.6 -- mini-árbol de
// genealogía: madre Y padre (A5/V8 -- el mock del Figma solo mostraba
// madre; el dueño pidió agregar el padre) -> esta vaca -> crías. "Sin
// registrar" cuando falta el padre (~60% de las terneras del histórico no
// lo traen) -- NUNCA en blanco, blanco no implica "sin padre" (regla
// explícita del plan).

import { Link } from 'react-router-dom';
import { esNumeroProvisional } from '@/utils/importHato/overridesChapeta';

export interface NodoGenealogia {
  id: string | null;
  numero: number | null;
  nombre: string | null;
}

function CajaAnimal({
  nodo,
  rol,
  sinRegistrar,
}: {
  nodo: NodoGenealogia | null;
  rol: string;
  sinRegistrar?: boolean;
}) {
  if (sinRegistrar || !nodo) {
    return (
      <div className="rounded-lg border border-dashed border-gray-300 bg-gray-50 px-3 py-2 text-center min-w-[120px]">
        <p className="text-xs text-gray-400 uppercase tracking-wide">{rol}</p>
        <p className="text-sm text-gray-400 italic">Sin registrar</p>
      </div>
    );
  }

  const contenido = (
    <div className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-center min-w-[120px] hover:border-primary transition-colors">
      <p className="text-xs text-gray-500 uppercase tracking-wide">{rol}</p>
      <p className="text-sm font-medium text-gray-900">
        {nodo.numero != null ? `#${nodo.numero}` : '—'}
        {nodo.numero != null && esNumeroProvisional(nodo.numero) && (
          <span className="text-amber-600"> (prov.)</span>
        )}
      </p>
      {nodo.nombre && <p className="text-xs text-gray-500">{nodo.nombre}</p>}
    </div>
  );

  return nodo.id ? (
    <Link to={`/hato-lechero/hato/${nodo.id}`}>{contenido}</Link>
  ) : (
    contenido
  );
}

export function GenealogiaArbol({
  madre,
  padreToro,
  padreAnimal,
  actual,
  crias,
}: {
  madre: NodoGenealogia | null;
  /** Padre desde el catálogo `hato_toros` (V12) -- caso más común. */
  padreToro: { id: string; nombre: string } | null;
  /** Padre propio del hato, solo si es un animal registrado (raro). */
  padreAnimal: NodoGenealogia | null;
  actual: NodoGenealogia;
  crias: NodoGenealogia[];
}) {
  const padreNodo: NodoGenealogia | null = padreAnimal ?? (padreToro ? { id: null, numero: null, nombre: padreToro.nombre } : null);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-center gap-4">
        <CajaAnimal nodo={madre} rol="Madre" sinRegistrar={!madre} />
        <span className="text-gray-300">+</span>
        <CajaAnimal nodo={padreNodo} rol="Padre" sinRegistrar={!padreNodo} />
      </div>
      <div className="flex justify-center">
        <div className="h-6 w-1 bg-gray-200" />
      </div>
      <div className="flex justify-center">
        <div className="rounded-lg border-2 border-primary bg-white px-4 py-2 text-center min-w-[120px]">
          <p className="text-xs text-primary uppercase tracking-wide">Esta vaca</p>
          <p className="text-sm font-semibold text-gray-900">
            {actual.numero != null ? `#${actual.numero}` : '—'}
          </p>
          {actual.nombre && <p className="text-xs text-gray-600">{actual.nombre}</p>}
        </div>
      </div>
      {crias.length > 0 && (
        <>
          <div className="flex justify-center">
            <div className="h-6 w-1 bg-gray-200" />
          </div>
          <div className="flex flex-wrap items-center justify-center gap-3">
            {crias.map((cria) => (
              <CajaAnimal key={cria.id ?? cria.numero} nodo={cria} rol="Cría" />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
