import { useId } from 'react';
import {
  Users,
  Calendar as CalendarIcon,
  ChevronDown,
  Edit3,
  Trash2,
  Plus,
  AlertTriangle,
  CheckCircle2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from '@/components/ui/collapsible';
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '@/components/ui/table';
import {
  Select,
  SelectTrigger,
  SelectContent,
  SelectItem,
  SelectValue,
  SelectGroup,
  SelectLabel,
} from '@/components/ui/select';
import { Field, FieldLabel, FieldGroup } from '@/components/ui/field';
import { DateInput } from '@/components/ui/date-input';
import { Textarea } from '@/components/ui/textarea';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import { cn } from '@/components/ui/utils';
import { KPICard } from './shared/KPICard';
import { AtencionRequeridaPanel } from './AtencionRequeridaPanel';
import { SeccionHeader } from './SeccionInsumosCierre';
import { formatearFecha } from '@/utils/fechas';
import { formatearMoneda, formatearNumero } from '@/utils/format';
import {
  FRACCION_OPTIONS,
  type ExcepcionesCierre,
  type FuenteFechasEjecucion,
  type KPIsLabores,
  type RegistroPorLote,
} from '@/utils/calculosCierreAplicacion';
import type { RegistroTrabajoCierre } from '@/types/aplicaciones';

export interface LoteOpcion {
  lote_id: string;
  nombre: string;
  arboles: number;
}

export interface TrabajadorDisponible {
  id: string;
  nombre: string;
  tipo: 'empleado' | 'contratista';
  salario?: number;
  prestaciones?: number;
  auxilios?: number;
  horas_semanales?: number;
  tarifa_jornal?: number;
}

export interface NuevoRegistroForm {
  trabajador_id: string;
  trabajador_tipo: 'empleado' | 'contratista';
  lote_id: string;
  fecha_trabajo: string;
  fraccion_jornal: number;
}

interface SeccionLaboresCierreProps {
  lotes: LoteOpcion[];
  tieneTarea: boolean;
  registrosPorLote: Map<string, RegistroPorLote>;
  kpis: KPIsLabores;
  excepciones: ExcepcionesCierre;
  editandoRegistro: string | null;
  onIniciarEdicion: (regKey: string) => void;
  onCancelarEdicion: () => void;
  onEditarFraccion: (registroId: string, nuevaFraccion: number) => void;
  onEliminarRegistro: (index: number) => void;
  mostrarAgregarRegistro: boolean;
  onAbrirAgregarRegistro: () => void;
  onCancelarAgregarRegistro: () => void;
  nuevoRegistro: NuevoRegistroForm;
  onCambiarNuevoRegistro: (patch: Partial<NuevoRegistroForm>) => void;
  onConfirmarAgregarRegistro: () => void;
  trabajadoresDisponibles: TrabajadorDisponible[];
  fechaInicioReal: string;
  fechaFinReal: string;
  fuenteFechas: FuenteFechasEjecucion;
  onCambiarFechaInicio: (v: string) => void;
  onCambiarFechaFin: (v: string) => void;
  observaciones: string;
  onCambiarObservaciones: (v: string) => void;
}

/**
 * Sección ② del Cierre (`W03-cierre-v2.md` §2/§4) — donde vive el volumen real (jornales, N
 * lotes). Cada lote colapsa por defecto y se abre solo si tiene una excepción real o es el único
 * lote de la aplicación (la conveniencia que el módulo ya tenía para ese caso trivial). El panel
 * "Atención requerida" agrega las 3 señales que antes solo se veían abriendo cada lote a ciegas.
 */
export function SeccionLaboresCierre({
  lotes,
  tieneTarea,
  registrosPorLote,
  kpis,
  excepciones,
  editandoRegistro,
  onIniciarEdicion,
  onCancelarEdicion,
  onEditarFraccion,
  onEliminarRegistro,
  mostrarAgregarRegistro,
  onAbrirAgregarRegistro,
  onCancelarAgregarRegistro,
  nuevoRegistro,
  onCambiarNuevoRegistro,
  onConfirmarAgregarRegistro,
  trabajadoresDisponibles,
  fechaInicioReal,
  fechaFinReal,
  fuenteFechas,
  onCambiarFechaInicio,
  onCambiarFechaFin,
  observaciones,
  onCambiarObservaciones,
}: SeccionLaboresCierreProps) {
  const loteIdsConExcepcion = new Set(excepciones.registrosSinTarifa.map((r) => r.lote_id));
  const sinNovedades =
    excepciones.registrosSinTarifa.length === 0 && excepciones.lotesSinLabor.length === 0;
  const totalLotesConRegistro = registrosPorLote.size;

  return (
    <div className="space-y-4">
      <SeccionHeader
        numero={2}
        titulo="Labores"
        descripcion="Revisa los jornales registrados durante la ejecución. Los lotes sin novedades quedan colapsados — ábrelos si quieres verificar de todas formas."
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KPICard titulo="Jornales" valor={formatearNumero(kpis.totalJornales, 1)} icon={Users} tono="neutro" />
        <KPICard
          titulo="Costo Mano de Obra"
          valor={formatearMoneda(kpis.costoManoObra)}
          icon={Users}
          tono="neutro"
        />
        <KPICard titulo="Trabajadores" valor={String(kpis.trabajadoresUnicos)} icon={Users} tono="neutro" />
        <KPICard
          titulo="Días trabajados"
          valor={String(kpis.diasTrabajados)}
          icon={CalendarIcon}
          tono="neutro"
        />
      </div>

      {!tieneTarea && (
        <Alert variant="warning">
          <AlertTriangle />
          <AlertTitle>Esta aplicación no tiene tarea de labor vinculada</AlertTitle>
          <AlertDescription>
            Los jornales se registraron antes de implementar la vinculación automática. Puedes
            agregar registros manualmente usando el botón de abajo.
          </AlertDescription>
        </Alert>
      )}

      {tieneTarea && totalLotesConRegistro === 0 && (
        <Alert variant="warning">
          <AlertTriangle />
          <AlertTitle>No hay jornales registrados para esta aplicación</AlertTitle>
          <AlertDescription>
            Puedes agregar registros de trabajo manualmente o volver al módulo de Labores para
            registrarlos antes de cerrar.
          </AlertDescription>
        </Alert>
      )}

      {totalLotesConRegistro > 0 && sinNovedades && (
        <div className="flex items-center gap-2 rounded-lg border border-success/30 bg-success/10 px-4 py-3 text-sm text-primary-dark">
          <CheckCircle2 className="size-4 shrink-0 text-primary" aria-hidden="true" />
          <span>
            Sin novedades — los {totalLotesConRegistro}{' '}
            {totalLotesConRegistro === 1 ? 'lote tiene' : 'lotes tienen'} jornales registrados y
            ningún costo quedó en $0.
          </span>
        </div>
      )}

      <AtencionRequeridaPanel excepciones={excepciones} />

      {totalLotesConRegistro > 0 && (
        <div className="flex flex-col gap-2.5">
          {Array.from(registrosPorLote.entries()).map(([loteId, { lote_nombre, registros: regsLote }]) => {
            const totalLote = regsLote.reduce((s, r) => s + r.fraccion_jornal, 0);
            const costoLote = regsLote.reduce((s, r) => s + r.costo_jornal, 0);
            const tieneExcepcion = loteIdsConExcepcion.has(loteId);
            const defaultOpen = totalLotesConRegistro === 1 || tieneExcepcion;
            const arboles = lotes.find((l) => l.lote_id === loteId)?.arboles ?? 0;

            return (
              <LoteCollapsible
                key={loteId}
                loteNombre={lote_nombre}
                arboles={arboles}
                totalJornales={totalLote}
                costo={costoLote}
                defaultOpen={defaultOpen}
                registros={regsLote}
                editandoRegistro={editandoRegistro}
                onIniciarEdicion={onIniciarEdicion}
                onCancelarEdicion={onCancelarEdicion}
                onEditarFraccion={onEditarFraccion}
                onEliminarRegistro={onEliminarRegistro}
              />
            );
          })}
        </div>
      )}

      {!mostrarAgregarRegistro ? (
        <button
          type="button"
          onClick={onAbrirAgregarRegistro}
          className="flex w-full items-center justify-center gap-2 rounded-lg border-[1.5px] border-dashed border-primary/45 bg-primary/[0.03] py-3 text-sm font-medium text-primary-dark transition-colors hover:bg-primary/[0.07]"
        >
          <Plus className="size-4" aria-hidden="true" />
          Agregar registro de trabajo faltante
        </button>
      ) : (
        <FormularioNuevoRegistro
          lotes={lotes}
          trabajadoresDisponibles={trabajadoresDisponibles}
          nuevoRegistro={nuevoRegistro}
          onCambiarNuevoRegistro={onCambiarNuevoRegistro}
          onConfirmar={onConfirmarAgregarRegistro}
          onCancelar={onCancelarAgregarRegistro}
        />
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field>
          <FieldLabel>Fecha Inicio Real</FieldLabel>
          <DateInput value={fechaInicioReal} onChange={onCambiarFechaInicio} />
          {fuenteFechas !== 'ninguna' && (
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <CheckCircle2 className="size-3 shrink-0 text-primary" aria-hidden="true" />
              Detectado de los registros de labor y movimientos — corrígelo si no coincide con lo
              ejecutado.
            </p>
          )}
        </Field>
        <Field>
          <FieldLabel>Fecha Fin Real</FieldLabel>
          <DateInput value={fechaFinReal} onChange={onCambiarFechaFin} />
          {fuenteFechas !== 'ninguna' && (
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <CheckCircle2 className="size-3 shrink-0 text-primary" aria-hidden="true" />
              Detectado de los registros de labor y movimientos — corrígelo si no coincide con lo
              ejecutado.
            </p>
          )}
        </Field>
      </div>

      <Field>
        <FieldLabel>Observaciones de Cierre</FieldLabel>
        <Textarea
          rows={3}
          value={observaciones}
          onChange={(e) => onCambiarObservaciones(e.target.value)}
          placeholder="Describe cualquier incidencia, clima, rendimiento del personal, etc..."
        />
        <p className="text-xs text-muted-foreground">
          Único campo genuinamente irreducible de la pantalla — nadie más sabe si hubo lluvia o un
          problema de personal.
        </p>
      </Field>
    </div>
  );
}

function LoteCollapsible({
  loteNombre,
  arboles,
  totalJornales,
  costo,
  defaultOpen,
  registros,
  editandoRegistro,
  onIniciarEdicion,
  onCancelarEdicion,
  onEditarFraccion,
  onEliminarRegistro,
}: {
  loteNombre: string;
  arboles: number;
  totalJornales: number;
  costo: number;
  defaultOpen: boolean;
  registros: Array<RegistroTrabajoCierre & { _index: number }>;
  editandoRegistro: string | null;
  onIniciarEdicion: (regKey: string) => void;
  onCancelarEdicion: () => void;
  onEditarFraccion: (registroId: string, nuevaFraccion: number) => void;
  onEliminarRegistro: (index: number) => void;
}) {
  return (
    <Collapsible defaultOpen={defaultOpen} className="overflow-hidden rounded-lg border bg-card">
      <CollapsibleTrigger className="group flex w-full items-center justify-between gap-3 bg-muted px-4 py-3 text-left transition-colors hover:bg-muted/70">
        <span className="flex items-center gap-2.5 min-w-0">
          <ChevronDown className="size-4 shrink-0 text-muted-foreground transition-transform group-data-[state=open]:rotate-180" />
          <span className="truncate text-sm font-medium text-foreground">{loteNombre}</span>
          <span className="hidden shrink-0 text-xs text-muted-foreground sm:inline">
            {formatearNumero(arboles, 0)} árboles
          </span>
        </span>
        <span className="flex shrink-0 items-center gap-4 text-sm">
          <span className="hidden font-medium text-foreground sm:inline">
            {formatearNumero(totalJornales, 1)} jornales
          </span>
          <span className="font-semibold text-primary-dark">{formatearMoneda(costo)}</span>
        </span>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Fecha</TableHead>
              <TableHead>Trabajador</TableHead>
              <TableHead className="text-center">Tipo</TableHead>
              <TableHead className="text-center">Fracción</TableHead>
              <TableHead className="text-right">Costo</TableHead>
              <TableHead className="text-center">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {registros.map((reg) => {
              const regKey = reg.id || `new-${reg._index}`;
              const editando = editandoRegistro === regKey;
              return (
                <TableRow key={regKey} className={cn(reg._isNew && 'bg-success/5')}>
                  <TableCell className="text-foreground">{formatearFecha(reg.fecha_trabajo)}</TableCell>
                  <TableCell className="text-foreground">{reg.trabajador_nombre}</TableCell>
                  <TableCell className="text-center">
                    <span
                      className={cn(
                        'inline-flex rounded-full px-2 py-0.5 text-[10.5px] font-semibold',
                        reg.trabajador_tipo === 'empleado'
                          ? 'border border-border text-muted-foreground'
                          : 'bg-muted text-foreground',
                      )}
                    >
                      {reg.trabajador_tipo === 'empleado' ? 'Emp' : 'Cont'}
                    </span>
                  </TableCell>
                  <TableCell className="text-center">
                    {editando ? (
                      <Select
                        defaultOpen
                        value={String(reg.fraccion_jornal)}
                        onValueChange={(v) => onEditarFraccion(regKey, parseFloat(v))}
                        onOpenChange={(open) => {
                          if (!open) onCancelarEdicion();
                        }}
                      >
                        <SelectTrigger size="sm" className="mx-auto h-8 w-20">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {FRACCION_OPTIONS.map((f) => (
                            <SelectItem key={f} value={String(f)}>
                              {f}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <button
                        type="button"
                        onClick={() => onIniciarEdicion(regKey)}
                        className="border-b border-dashed border-border text-sm font-medium text-foreground hover:text-primary"
                        title="Clic para editar"
                      >
                        {reg.fraccion_jornal}
                      </button>
                    )}
                  </TableCell>
                  <TableCell className="text-right text-foreground">
                    <span className="inline-flex items-center gap-1">
                      {formatearMoneda(reg.costo_jornal)}
                      {reg.costo_jornal === 0 && (
                        <AlertTriangle className="size-3 text-warning-foreground" aria-hidden="true" />
                      )}
                    </span>
                  </TableCell>
                  <TableCell className="text-center">
                    <div className="flex items-center justify-center gap-1">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="size-7 text-muted-foreground hover:text-primary"
                        onClick={() => onIniciarEdicion(regKey)}
                        aria-label="Editar fracción de jornal"
                      >
                        <Edit3 className="size-3.5" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="size-7 text-muted-foreground hover:text-destructive"
                        onClick={() => onEliminarRegistro(reg._index)}
                        aria-label="Eliminar registro de jornal"
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </CollapsibleContent>
    </Collapsible>
  );
}

function FormularioNuevoRegistro({
  lotes,
  trabajadoresDisponibles,
  nuevoRegistro,
  onCambiarNuevoRegistro,
  onConfirmar,
  onCancelar,
}: {
  lotes: LoteOpcion[];
  trabajadoresDisponibles: TrabajadorDisponible[];
  nuevoRegistro: NuevoRegistroForm;
  onCambiarNuevoRegistro: (patch: Partial<NuevoRegistroForm>) => void;
  onConfirmar: () => void;
  onCancelar: () => void;
}) {
  const empleados = trabajadoresDisponibles.filter((t) => t.tipo === 'empleado');
  const contratistas = trabajadoresDisponibles.filter((t) => t.tipo === 'contratista');
  const formId = useId();

  return (
    <div className="rounded-lg border-2 border-primary/30 bg-card p-4">
      <h4 className="mb-3 text-sm font-medium text-foreground">Nuevo Registro de Trabajo</h4>
      <FieldGroup className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Field>
          <FieldLabel htmlFor={`${formId}-trabajador`}>Trabajador</FieldLabel>
          <Select
            value={nuevoRegistro.trabajador_id}
            onValueChange={(id) => {
              const t = trabajadoresDisponibles.find((t) => t.id === id);
              onCambiarNuevoRegistro({ trabajador_id: id, trabajador_tipo: t?.tipo || 'empleado' });
            }}
          >
            <SelectTrigger id={`${formId}-trabajador`} size="sm">
              <SelectValue placeholder="Seleccionar..." />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectLabel>Empleados</SelectLabel>
                {empleados.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.nombre}
                  </SelectItem>
                ))}
              </SelectGroup>
              <SelectGroup>
                <SelectLabel>Contratistas</SelectLabel>
                {contratistas.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.nombre}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </Field>

        <Field>
          <FieldLabel htmlFor={`${formId}-lote`}>Lote</FieldLabel>
          <Select
            value={nuevoRegistro.lote_id}
            onValueChange={(id) => onCambiarNuevoRegistro({ lote_id: id })}
          >
            <SelectTrigger id={`${formId}-lote`} size="sm">
              <SelectValue placeholder="Seleccionar..." />
            </SelectTrigger>
            <SelectContent>
              {lotes.map((l) => (
                <SelectItem key={l.lote_id} value={l.lote_id}>
                  {l.nombre}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>

        <Field>
          <FieldLabel>Fecha</FieldLabel>
          <DateInput
            value={nuevoRegistro.fecha_trabajo}
            onChange={(v) => onCambiarNuevoRegistro({ fecha_trabajo: v })}
          />
        </Field>

        <Field>
          <FieldLabel htmlFor={`${formId}-fraccion`}>Fracción</FieldLabel>
          <Select
            value={String(nuevoRegistro.fraccion_jornal)}
            onValueChange={(v) => onCambiarNuevoRegistro({ fraccion_jornal: parseFloat(v) })}
          >
            <SelectTrigger id={`${formId}-fraccion`} size="sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {FRACCION_OPTIONS.map((f) => (
                <SelectItem key={f} value={String(f)}>
                  {f}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>

        <div className="flex items-end gap-2">
          <Button
            type="button"
            size="sm"
            onClick={onConfirmar}
            disabled={!nuevoRegistro.trabajador_id || !nuevoRegistro.lote_id}
          >
            Agregar
          </Button>
          <Button type="button" size="sm" variant="ghost" onClick={onCancelar}>
            Cancelar
          </Button>
        </div>
      </FieldGroup>
    </div>
  );
}
