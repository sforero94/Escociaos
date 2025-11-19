// ARCHIVO: components/monitoreo/components/InsightCard.tsx
// DESCRIPCIÓN: Card para mostrar insights automáticos (urgente, atención, bueno)
// Propósito: Visualización de alertas y recomendaciones del sistema de monitoreo

import { AlertTriangle, AlertCircle, CheckCircle, ArrowRight } from 'lucide-react';
import { Insight } from '../../../types/monitoreo';

interface InsightCardProps {
  insight: Insight;
  onVerDetalles?: () => void;
}

export function InsightCard({ insight, onVerDetalles }: InsightCardProps) {
  const config = {
    urgente: {
      icon: AlertTriangle,
      bgColor: 'bg-red-50',
      borderColor: 'border-red-200',
      iconColor: 'text-red-600',
      textColor: 'text-red-900'
    },
    atencion: {
      icon: AlertCircle,
      bgColor: 'bg-orange-50',
      borderColor: 'border-orange-200',
      iconColor: 'text-orange-600',
      textColor: 'text-orange-900'
    },
    bueno: {
      icon: CheckCircle,
      bgColor: 'bg-green-50',
      borderColor: 'border-green-200',
      iconColor: 'text-green-600',
      textColor: 'text-green-900'
    }
  };

  const { icon: Icon, bgColor, borderColor, iconColor, textColor } = config[insight.tipo];

  return (
    <div className={`${bgColor} ${borderColor} border-l-4 rounded-lg p-4 mb-3`}>
      <div className="flex items-start gap-3">
        <Icon className={`w-5 h-5 ${iconColor} mt-0.5 flex-shrink-0`} />
        
        <div className="flex-1 min-w-0">
          <h4 className={`${textColor} mb-1`}>
            {insight.tipo === 'urgente' && '🔴 URGENTE: '}
            {insight.tipo === 'atencion' && '🟡 ATENCIÓN: '}
            {insight.tipo === 'bueno' && '🟢 BUENAS NOTICIAS: '}
            {insight.titulo}
          </h4>
          
          <p className={`${textColor} mb-2`}>
            {insight.descripcion}
          </p>
          
          {insight.accion && (
            <p className={`${textColor}`}>
              💊 Recomendación: {insight.accion}
            </p>
          )}
          
          {onVerDetalles && (
            <button
              onClick={onVerDetalles}
              className={`mt-2 ${iconColor} hover:underline flex items-center gap-1`}
            >
              Ver detalles
              <ArrowRight className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
