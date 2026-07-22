import { AlertTriangle, Info } from 'lucide-react';
import { formatCurrency } from '@/utils/format';
import type { AdvertenciaReporte } from '@/types/reportesFinancieros';

interface Props {
  advertencias: AdvertenciaReporte[];
}

/**
 * Banner de advertencias del reporte.
 *
 * No es decorativo: es lo que impide que una cifra silenciosamente incompleta
 * pase por correcta. Un gasto pendiente excluido, un ingreso sin etiqueta de
 * cosecha o unas cabezas vendidas sin inventario que las respalde cambian el
 * resultado, y el dueño tiene que verlo en la misma pantalla que el número.
 */
export function AdvertenciasReporte({ advertencias }: Props) {
  if (advertencias.length === 0) return null;

  return (
    <div className="space-y-2">
      {advertencias.map((adv, i) => {
        const esWarning = adv.severidad === 'warning';
        const Icono = esWarning ? AlertTriangle : Info;

        return (
          <div
            key={`${adv.codigo}-${i}`}
            className={`flex items-start gap-3 rounded-xl border p-4 ${
              esWarning
                ? 'bg-amber-50 border-amber-200'
                : 'bg-blue-50 border-blue-200'
            }`}
          >
            <Icono
              className={`w-5 h-5 flex-shrink-0 mt-0.5 ${
                esWarning ? 'text-amber-600' : 'text-blue-600'
              }`}
            />
            {/* El monto se anexa solo cuando es dinero. Las cantidades
                ('unidades') ya vienen narradas dentro del mensaje — anexarlas
                otra vez dejaba un «230» suelto al final de la frase. */}
            <div className={`text-sm ${esWarning ? 'text-amber-900' : 'text-blue-900'}`}>
              <span>{adv.mensaje}</span>
              {adv.valor != null && adv.formatoValor !== 'unidades' && (
                <span className="font-semibold"> {formatCurrency(adv.valor)}</span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
