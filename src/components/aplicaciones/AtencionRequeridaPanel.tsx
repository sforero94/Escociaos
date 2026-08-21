import { AlertTriangle } from 'lucide-react';
import { cn } from '@/components/ui/utils';
import { formatearMoneda, formatearNumero } from '@/utils/format';
import type {
  ExcepcionesCierre,
  InsumoCriticoExcepcion,
  LoteSinLaborExcepcion,
  RegistroSinTarifaExcepcion,
} from '@/utils/calculosCierreAplicacion';

interface AtencionRequeridaPanelProps {
  excepciones: ExcepcionesCierre;
  className?: string;
}

/**
 * Panel agregado de excepciones (`W03-cierre-v2.md` §1.1/§2) — junta 3 señales que el sistema ya
 * calculaba pero dejaba enterradas fila por fila dentro de lotes colapsados.
 *
 * **No hay versión vacía a propósito.** Cuando no hay ninguna excepción real (el caso normal, ver
 * el `.md` §6 "Estados nuevos") este componente no renderiza nada — ni un banner "todo bien" ni un
 * `null` disfrazado de tarjeta vacía. Un panel que siempre está ahí, con o sin novedades, es un
 * panel que el usuario aprende a ignorar.
 */
export function AtencionRequeridaPanel({ excepciones, className }: AtencionRequeridaPanelProps) {
  const { insumosCriticos, registrosSinTarifa, lotesSinLabor } = excepciones;
  const total = insumosCriticos.length + registrosSinTarifa.length + lotesSinLabor.length;

  if (total === 0) return null;

  return (
    <div
      className={cn(
        'rounded-lg border-[1.5px] border-dashed border-warning/40 bg-warning/5 p-4',
        className,
      )}
      role="region"
      aria-label="Atención requerida antes de cerrar"
    >
      <div className="mb-2.5 flex items-center gap-2">
        <AlertTriangle className="size-5 text-warning-foreground" aria-hidden="true" />
        <h4 className="text-sm font-semibold text-warning-foreground">Atención requerida</h4>
      </div>
      <ul className="flex flex-col gap-2">
        {lotesSinLabor.map((item) => (
          <ItemLoteSinLabor key={`lote-${item.lote_id}`} item={item} />
        ))}
        {insumosCriticos.map((item) => (
          <ItemInsumoCritico key={`insumo-${item.nombre}`} item={item} />
        ))}
        {registrosSinTarifa.length > 0 && <ItemRegistrosSinTarifa items={registrosSinTarifa} />}
      </ul>
    </div>
  );
}

function ItemLoteSinLabor({ item }: { item: LoteSinLaborExcepcion }) {
  return (
    <li className="flex gap-2 text-xs leading-relaxed text-foreground">
      <AlertTriangle className="mt-0.5 size-3 shrink-0 text-warning-foreground" aria-hidden="true" />
      <span>
        <b className="font-semibold">Lote {item.nombre}:</b> 0 jornales registrados — revisa si
        falta capturar el trabajo o el lote no tuvo labor esta vez.
      </span>
    </li>
  );
}

function ItemInsumoCritico({ item }: { item: InsumoCriticoExcepcion }) {
  const signo = item.diferencia > 0 ? '+' : '';
  return (
    <li className="flex gap-2 text-xs leading-relaxed text-foreground">
      <AlertTriangle className="mt-0.5 size-3 shrink-0 text-warning-foreground" aria-hidden="true" />
      <span>
        <b className="font-semibold">{item.nombre}:</b> desviación de {signo}
        {formatearNumero(item.diferencia, 2)} {item.unidad} respecto al plan — más del 15%.
      </span>
    </li>
  );
}

function ItemRegistrosSinTarifa({ items }: { items: RegistroSinTarifaExcepcion[] }) {
  return (
    <li className="flex gap-2 text-xs leading-relaxed text-foreground">
      <AlertTriangle className="mt-0.5 size-3 shrink-0 text-warning-foreground" aria-hidden="true" />
      <span>
        <b className="font-semibold">
          {items.length} {items.length === 1 ? 'registro' : 'registros'} con costo{' '}
          {formatearMoneda(0)}:
        </b>{' '}
        falta tarifa asignada a ese trabajador.
      </span>
    </li>
  );
}
