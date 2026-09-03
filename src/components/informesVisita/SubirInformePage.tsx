import { useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2, Upload, Check, X, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { DateInput } from '@/components/ui/date-input';
import { RoleGuard } from '@/components/auth/RoleGuard';
import { getSupabase } from '@/utils/supabase/client';
import { obtenerFechaHoy } from '@/utils/fechas';
import { extraerDocx, esDocx } from '@/utils/informesVisita/docx';
import { proponerInforme } from '@/utils/informesVisita/proponer';
import { aplicarDecisiones } from '@/utils/informesVisita/confirmar';
import { persistirInforme } from '@/utils/informesVisita/persistir';
import {
  ETIQUETAS_TIPO_OBSERVACION,
  MENSAJE_SIN_TEXTO,
  TIPOS_OBSERVACION_AGRONOMICA,
  type AccionDecision,
  type DecisionFila,
  type FilaPropuesta,
  type InformeVisitaCabecera,
  type PropuestaInforme,
  type TipoObservacionAgronomica,
} from '@/types/informesVisita';
import type { LoteCatalogo } from '@/utils/informesVisita/lotes';
import { resolverLoteId } from '@/utils/informesVisita/lotes';

type DecisionMap = Record<string, { accion: AccionDecision; edicion: Partial<FilaPropuesta> }>;

function cabeceraVacia(fecha: string): InformeVisitaCabecera {
  return {
    fecha_visita: fecha,
    agronoma: null,
    finca: null,
    especie: null,
    fenologia: null,
    materia_seca: null,
    proyeccion_cosecha: null,
  };
}

export function SubirInformePage() {
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);
  const [archivo, setArchivo] = useState<File | null>(null);
  const [archivoBytes, setArchivoBytes] = useState<ArrayBuffer | null>(null);
  const [extrayendo, setExtrayendo] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [propuesta, setPropuesta] = useState<PropuestaInforme | null>(null);
  const [cabecera, setCabecera] = useState<InformeVisitaCabecera>(cabeceraVacia(obtenerFechaHoy()));
  const [decisiones, setDecisiones] = useState<DecisionMap>({});
  const [lotes, setLotes] = useState<LoteCatalogo[]>([]);

  const resumen = useMemo(() => {
    if (!propuesta) return null;
    const lista: DecisionFila[] = Object.entries(decisiones).map(([clave, d]) => ({
      clave,
      accion: d.accion,
      edicion: d.edicion,
    }));
    return aplicarDecisiones(propuesta.filas, lista);
  }, [propuesta, decisiones]);

  const listo = Boolean(
    propuesta
    && cabecera.fecha_visita
    && (propuesta.filas.length === 0 || (resumen && resumen.pendientes.length === 0)),
  );

  async function handleArchivo(file: File) {
    if (!esDocx(file)) {
      toast.error('Solo se acepta .docx');
      return;
    }
    setExtrayendo(true);
    try {
      const bytes = await file.arrayBuffer();
      const extraido = await extraerDocx(bytes);
      const sb = getSupabase() as any;
      const { data: lotesData } = await sb.from('lotes').select('id, nombre').eq('activo', true);
      const catalogo: LoteCatalogo[] = lotesData ?? [];
      setLotes(catalogo);
      const p = proponerInforme({
        texto: extraido.texto,
        sinTexto: extraido.sinTexto,
        fotos: extraido.fotos,
        fechaFallback: obtenerFechaHoy(),
        lotes: catalogo,
      });
      setArchivo(file);
      setArchivoBytes(bytes);
      setPropuesta(p);
      setCabecera(p.cabecera.fecha_visita ? p.cabecera : { ...p.cabecera, fecha_visita: obtenerFechaHoy() });
      setDecisiones({});
      if (p.sinTexto) {
        toast.warning(MENSAJE_SIN_TEXTO);
      }
    } catch (err) {
      console.error(err);
      toast.error('No se pudo leer el .docx');
    } finally {
      setExtrayendo(false);
    }
  }

  function setDecision(clave: string, accion: AccionDecision) {
    setDecisiones((prev) => ({
      ...prev,
      [clave]: { accion, edicion: prev[clave]?.edicion ?? {} },
    }));
  }

  function editarFila(clave: string, patch: Partial<FilaPropuesta>) {
    setDecisiones((prev) => {
      const actual = prev[clave] ?? { accion: 'confirmar' as AccionDecision, edicion: {} };
      const edicion = { ...actual.edicion, ...patch };
      if ('lote' in patch) {
        edicion.lote_id = resolverLoteId(patch.lote ?? null, lotes);
      }
      return { ...prev, [clave]: { ...actual, edicion } };
    });
  }

  function confirmarRestantes() {
    if (!propuesta) return;
    setDecisiones((prev) => {
      const next = { ...prev };
      for (const f of propuesta.filas) {
        if (!next[f.clave]) next[f.clave] = { accion: 'confirmar', edicion: {} };
      }
      return next;
    });
  }

  async function handleGuardar() {
    if (!archivo || !archivoBytes || !propuesta || !listo) return;
    setGuardando(true);
    try {
      const lista: DecisionFila[] = propuesta.filas.map((f) => ({
        clave: f.clave,
        accion: decisiones[f.clave].accion,
        edicion: decisiones[f.clave]?.edicion,
      }));
      const resultado = await persistirInforme({
        archivo,
        archivoBytes,
        cabecera,
        propuestas: propuesta.filas,
        decisiones: lista,
        fotos: propuesta.fotos,
        texto: propuesta.texto,
        sinTexto: propuesta.sinTexto,
      });
      toast.success(
        propuesta.sinTexto
          ? `Informe guardado. ${MENSAJE_SIN_TEXTO}.`
          : `Informe guardado con ${resultado.filasInsertadas} observación(es).`,
      );
      navigate(`/informes-visita/${resultado.informeId}`);
    } catch (err) {
      console.error(err);
      toast.error(err instanceof Error ? err.message : 'No se pudo guardar el informe');
    } finally {
      setGuardando(false);
    }
  }

  return (
    <RoleGuard allowedRoles={['Administrador', 'Gerencia']}>
    <div className="max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Subir informe de visita</h1>
        <p className="text-gray-500 mt-1">
          Solo .docx. El sistema propone filas; tú confirmas, editas o descartas antes de guardar.
        </p>
      </div>

      <div className="rounded-xl border border-border bg-card p-4 space-y-3">
        <Label htmlFor="docx">Archivo Word</Label>
        <input
          id="docx"
          ref={inputRef}
          type="file"
          accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void handleArchivo(f);
            e.target.value = '';
          }}
        />
        <Button type="button" variant="outline" onClick={() => inputRef.current?.click()} disabled={extrayendo}>
          {extrayendo ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Upload className="w-4 h-4 mr-2" />}
          {archivo ? archivo.name : 'Elegir .docx'}
        </Button>
      </div>

      {propuesta?.sinTexto && (
        <div className="flex items-start gap-3 rounded-xl border border-amber-300 bg-amber-50 p-4 text-amber-950">
          <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" />
          <div>
            <p className="font-medium capitalize">{MENSAJE_SIN_TEXTO}</p>
            <p className="text-sm mt-1">Se guarda el archivo y las fotos. No se inventan observaciones.</p>
          </div>
        </div>
      )}

      {propuesta && (
        <>
          <div className="rounded-xl border border-border bg-card p-4 grid gap-4 sm:grid-cols-2">
            <div>
              <Label>Fecha de visita</Label>
              <DateInput value={cabecera.fecha_visita} onChange={(v) => setCabecera((c) => ({ ...c, fecha_visita: v }))} />
            </div>
            <CampoTexto label="Agrónoma" value={cabecera.agronoma} onChange={(v) => setCabecera((c) => ({ ...c, agronoma: v }))} />
            <CampoTexto label="Finca" value={cabecera.finca} onChange={(v) => setCabecera((c) => ({ ...c, finca: v }))} />
            <CampoTexto label="Especie" value={cabecera.especie} onChange={(v) => setCabecera((c) => ({ ...c, especie: v }))} />
            <CampoTexto label="Fenología" value={cabecera.fenologia} onChange={(v) => setCabecera((c) => ({ ...c, fenologia: v }))} />
            <CampoTexto label="Materia seca" value={cabecera.materia_seca} onChange={(v) => setCabecera((c) => ({ ...c, materia_seca: v }))} />
            <div className="sm:col-span-2">
              <CampoTexto label="Proyección de cosecha" value={cabecera.proyeccion_cosecha} onChange={(v) => setCabecera((c) => ({ ...c, proyeccion_cosecha: v }))} />
            </div>
            {propuesta.fotos.length > 0 && (
              <p className="sm:col-span-2 text-sm text-gray-500">{propuesta.fotos.length} foto(s) extraídas del Word.</p>
            )}
          </div>

          {propuesta.filas.length > 0 && (
            <div className="space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                <h2 className="text-lg font-semibold">Filas propuestas ({propuesta.filas.length})</h2>
                <Button type="button" variant="outline" size="sm" onClick={confirmarRestantes}>
                  Confirmar restantes
                </Button>
              </div>
              {resumen && resumen.pendientes.length > 0 && (
                <p className="text-sm text-amber-800">
                  Faltan {resumen.pendientes.length} fila(s) por confirmar o descartar.
                </p>
              )}
              {propuesta.filas.map((fila) => (
                <FilaEditor
                  key={fila.clave}
                  fila={{ ...fila, ...decisiones[fila.clave]?.edicion }}
                  accion={decisiones[fila.clave]?.accion}
                  onDecision={(a) => setDecision(fila.clave, a)}
                  onEdit={(patch) => editarFila(fila.clave, patch)}
                />
              ))}
            </div>
          )}

          <div className="flex gap-3">
            <Button type="button" variant="outline" onClick={() => navigate('/informes-visita')}>Cancelar</Button>
            <Button type="button" onClick={() => void handleGuardar()} disabled={!listo || guardando}>
              {guardando && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Guardar informe
            </Button>
          </div>
        </>
      )}
    </div>
    </RoleGuard>
  );
}

function CampoTexto({
  label,
  value,
  onChange,
  disabled,
}: {
  label: string;
  value: string | null;
  onChange: (v: string | null) => void;
  disabled?: boolean;
}) {
  return (
    <div>
      <Label>{label}</Label>
      <Input value={value ?? ''} onChange={(e) => onChange(e.target.value || null)} disabled={disabled} />
    </div>
  );
}

function FilaEditor({
  fila,
  accion,
  onDecision,
  onEdit,
}: {
  fila: FilaPropuesta;
  accion?: AccionDecision;
  onDecision: (a: AccionDecision) => void;
  onEdit: (patch: Partial<FilaPropuesta>) => void;
}) {
  const descartada = accion === 'descartar';
  return (
    <div className={`rounded-xl border p-4 space-y-3 ${descartada ? 'opacity-50 bg-muted/40' : 'bg-card'} ${accion === 'confirmar' ? 'border-primary/40' : 'border-border'}`}>
      <div className="flex flex-wrap items-center gap-2 justify-between">
        <Badge variant="secondary">{ETIQUETAS_TIPO_OBSERVACION[fila.tipo]}</Badge>
        <div className="flex gap-2">
          <Button type="button" size="sm" variant={accion === 'confirmar' ? 'default' : 'outline'} onClick={() => onDecision('confirmar')}>
            <Check className="w-4 h-4 mr-1" /> Confirmar
          </Button>
          <Button type="button" size="sm" variant={accion === 'descartar' ? 'destructive' : 'outline'} onClick={() => onDecision('descartar')}>
            <X className="w-4 h-4 mr-1" /> Descartar
          </Button>
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <div>
          <Label>Tipo</Label>
          <select
            className="border-input bg-input-background h-11 w-full rounded-md border px-3 text-sm"
            value={fila.tipo}
            disabled={descartada}
            onChange={(e) => onEdit({ tipo: e.target.value as TipoObservacionAgronomica })}
          >
            {TIPOS_OBSERVACION_AGRONOMICA.map((t) => (
              <option key={t} value={t}>{ETIQUETAS_TIPO_OBSERVACION[t]}</option>
            ))}
          </select>
        </div>
        <div>
          <Label>Fecha</Label>
          <DateInput value={fila.fecha} onChange={(v) => onEdit({ fecha: v })} disabled={descartada} />
        </div>
        <div>
          <Label>Fecha contexto</Label>
          <DateInput value={fila.fecha_contexto ?? ''} onChange={(v) => onEdit({ fecha_contexto: v || null })} disabled={descartada} />
        </div>
        <CampoTexto label="Lote / sector" value={fila.lote} onChange={(v) => onEdit({ lote: v })} disabled={descartada} />
        <CampoTexto label="Plaga / enfermedad" value={fila.plaga_enfermedad} onChange={(v) => onEdit({ plaga_enfermedad: v })} disabled={descartada} />
        <CampoTexto label="Insumo" value={fila.insumo} onChange={(v) => onEdit({ insumo: v })} disabled={descartada} />
        <div>
          <Label>Dosis</Label>
          <Input
            type="number"
            value={fila.dosis ?? ''}
            onChange={(e) => onEdit({ dosis: e.target.value === '' ? null : Number(e.target.value) })}
            disabled={descartada}
            onWheel={(e) => e.currentTarget.blur()}
          />
        </div>
        <CampoTexto label="Unidad" value={fila.unidad} onChange={(v) => onEdit({ unidad: v })} disabled={descartada} />
        <div>
          <Label>Carencia (días)</Label>
          <Input
            type="number"
            value={fila.periodo_carencia_dias ?? ''}
            onChange={(e) => onEdit({ periodo_carencia_dias: e.target.value === '' ? null : Number(e.target.value) })}
            disabled={descartada}
            onWheel={(e) => e.currentTarget.blur()}
          />
        </div>
        <CampoTexto label="Vía" value={fila.via} onChange={(v) => onEdit({ via: v })} disabled={descartada} />
        <CampoTexto label="Incidencia" value={fila.incidencia} onChange={(v) => onEdit({ incidencia: v })} disabled={descartada} />
        <CampoTexto label="Severidad" value={fila.severidad} onChange={(v) => onEdit({ severidad: v })} disabled={descartada} />
        <div className="sm:col-span-3">
          <Label>Notas</Label>
          <Textarea value={fila.notas ?? ''} onChange={(e) => onEdit({ notas: e.target.value || null })} disabled={descartada} />
        </div>
      </div>
    </div>
  );
}
