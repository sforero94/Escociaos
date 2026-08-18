import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useSaludDatos } from './hooks/useSaludDatos';
import type { NivelSaludDato } from '@/utils/calculosSaludDatos';

/**
 * Bloque "Salud de los datos" del Tablero General
 * (`docs/plan_dashboard_centro_control.md` §4 Bloque 6 / §9.2). Última
 * sección de la pantalla, colapsada por defecto -- "es lo que hace
 * auditable todo lo que está más arriba".
 *
 * Se filtra por MÓDULO, nunca por rol (§8 del plan: a diferencia de
 * "Dinero", esta sección no tiene candado -- cada señal simplemente no se
 * calcula ni se muestra sin su módulo). `puedeAccederModulo` falla ABIERTO
 * con perfil nulo, así que durante la ventana en que `AuthContext` resuelve
 * el perfil este bloque puede empezar a consultar igual que el resto de
 * bloques no gateados por rol -- no hace falta un `authLoading` propio.
 *
 * En escritorio, "▾ Ver detalle" expande una tabla de dos columnas
 * (señal · edad). En móvil la fila se queda colapsada (§9.2): el disparador
 * ni siquiera se muestra, así que la tabla nunca se abre ahí -- la línea
 * colapsada ya trae el mismo texto.
 */

const DOT_CLASS: Record<NivelSaludDato, string> = {
  verde: 'bg-green-500',
  ambar: 'bg-amber-500',
  rojo: 'bg-red-500',
  gris: 'bg-gray-300',
};

const NIVEL_TEXTO: Record<NivelSaludDato, string> = {
  verde: 'al día',
  ambar: 'atención',
  rojo: 'atrasado',
  gris: 'sin dato',
};

function Punto({ nivel }: { nivel: NivelSaludDato }) {
  return (
    <span
      className={`inline-block w-2 h-2 rounded-full shrink-0 ${DOT_CLASS[nivel]}`}
      aria-hidden="true"
    />
  );
}

function SaludDatosSkeleton() {
  return (
    <div className="rounded-xl border border-gray-200 bg-white px-4 py-3 animate-pulse" aria-hidden="true">
      <div className="h-3 bg-gray-100 rounded w-40" />
    </div>
  );
}

export function SaludDatos() {
  const { hasModulo } = useAuth();
  const hasAguacate = hasModulo('aguacate');
  const hasHato = hasModulo('hato_lechero');
  const { estado, senales } = useSaludDatos({ hasAguacate, hasHato });
  const [open, setOpen] = useState(false);

  // Sin ningún módulo gobernado por esta sección, desaparece entera -- nunca
  // una fila vacía explicando por qué (§8 del plan: "nunca un mensaje de
  // 'sin permisos'").
  if (!hasAguacate && !hasHato) return null;

  if (estado === 'cargando') return <SaludDatosSkeleton />;
  if (senales.length === 0) return null;

  return (
    <section>
      <Collapsible open={open} onOpenChange={setOpen}>
        <div className="rounded-xl border border-gray-200 bg-white px-4 py-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-x-4 gap-y-1.5 flex-wrap min-w-0">
            <span className="text-xs uppercase tracking-wide text-brand-brown/60 shrink-0">
              Salud de los datos
            </span>
            {senales.map((s) => (
              <span key={s.clave} className="inline-flex items-center gap-1.5 text-xs text-brand-brown/70">
                <Punto nivel={s.nivel} />
                {s.etiqueta} {s.detalle}
              </span>
            ))}
          </div>
          <CollapsibleTrigger asChild>
            <button
              type="button"
              className="hidden lg:inline-flex items-center gap-1 text-xs text-brand-brown/60 hover:text-foreground shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
              aria-label={open ? 'Ocultar detalle de salud de los datos' : 'Ver detalle de salud de los datos'}
            >
              <ChevronDown
                className={`w-3.5 h-3.5 transition-transform ${open ? '' : '-rotate-90'}`}
                aria-hidden="true"
              />
              Ver detalle
            </button>
          </CollapsibleTrigger>
        </div>
        <CollapsibleContent className="mt-2">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Señal</TableHead>
                <TableHead>Edad</TableHead>
                <TableHead>Estado</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody striped>
              {senales.map((s) => (
                <TableRow key={s.clave}>
                  <TableCell>{s.etiqueta}</TableCell>
                  <TableCell>{s.detalle}</TableCell>
                  <TableCell>
                    <span className="inline-flex items-center gap-1.5">
                      <Punto nivel={s.nivel} />
                      {NIVEL_TEXTO[s.nivel]}
                    </span>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CollapsibleContent>
      </Collapsible>
    </section>
  );
}
