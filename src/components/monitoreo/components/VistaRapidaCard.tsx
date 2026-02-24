// ARCHIVO: components/monitoreo/components/VistaRapidaCard.tsx
// DESCRIPCIÓN: Card clickeable para acceso rápido a vistas guardadas
// Propósito: Navegación rápida a configuraciones guardadas de monitoreo

import { Star, ChevronRight } from 'lucide-react';

interface VistaRapidaCardProps {
  titulo: string;
  descripcion: string;
  icono?: string;
  esFavorita?: boolean;
  onClick: () => void;
}

export function VistaRapidaCard({
  titulo,
  descripcion,
  icono = '📊',
  esFavorita = false,
  onClick
}: VistaRapidaCardProps) {
  return (
    <button
      onClick={onClick}
      className="bg-white rounded-xl border border-gray-200 p-4 hover:border-primary hover:shadow-md transition-all text-left w-full group"
    >
      <div className="flex items-start justify-between mb-2">
        <div className="text-2xl">{icono}</div>
        {esFavorita && (
          <Star className="w-4 h-4 text-yellow-500 fill-yellow-500" />
        )}
      </div>
      
      <h3 className="text-foreground mb-1 flex items-center gap-2">
        {titulo}
        <ChevronRight className="w-4 h-4 text-gray-400 group-hover:text-primary transition-colors" />
      </h3>
      
      <p className="text-brand-brown/70">
        {descripcion}
      </p>
    </button>
  );
}

// Componente para crear nueva vista
export function NuevaVistaCard({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="bg-gradient-to-br from-primary/10 to-secondary/10 rounded-xl border-2 border-dashed border-primary/30 p-4 hover:border-primary hover:shadow-md transition-all text-left w-full group min-h-[120px] flex flex-col items-center justify-center"
    >
      <div className="text-3xl mb-2 group-hover:scale-110 transition-transform">➕</div>
      <p className="text-foreground">Crear nueva vista</p>
      <p className="text-brand-brown/70 mt-1">Personaliza tus filtros</p>
    </button>
  );
}
