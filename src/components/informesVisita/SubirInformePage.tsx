import { useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2, Upload, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { DateInput } from '@/components/ui/date-input';
import { RoleGuard } from '@/components/auth/RoleGuard';
import { obtenerFechaHoy } from '@/utils/fechas';
import { extraerDocx, esDocx } from '@/utils/informesVisita/docx';
import { extraerCabecera } from '@/utils/informesVisita/cabecera';
import { pedirSnippetsAlModelo } from '@/utils/informesVisita/clienteProponer';
import { persistirInforme } from '@/utils/informesVisita/persistir';
import { snippetsListosParaPersistir } from '@/utils/informesVisita/confirmar';
import { proponerTemas, type TemaInforme } from '@/utils/informesVisita/temas';
import {
  MENSAJE_SIN_TEXTO,
  type AccionDecision,
  type DecisionSnippet,
  type InformeVisitaCabecera,
  type PropuestaInforme,
  type SnippetPropuesto,
} from '@/types/informesVisita';
import { EditarSnippetDialog, useFotoUrls } from './EditarSnippetDialog';
import { SnippetDeck } from './SnippetDeck';
import { TemasChips } from './TemasChips';

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
  const [decisiones, setDecisiones] = useState<Record<string, { accion: AccionDecision; edicion?: Partial<Omit<SnippetPropuesto, 'clave' | 'origen'>> }>>({});
  const [, setHistorial] = useState<string[]>([]);
  const [temas, setTemas] = useState<TemaInforme[]>([]);
  const [notas, setNotas] = useState('');
  const [editandoClave, setEditandoClave] = useState<string | null>(null);
  const [descartadosPorCita, setDescartadosPorCita] = useState(0);
  const [errorPropuesta, setErrorPropuesta] = useState<string | null>(null);

  const fotoUrls = useFotoUrls(propuesta?.fotos ?? []);

  const snippetsMostrados = useMemo(() => {
    if (!propuesta) return [];
    return propuesta.snippets.map((s) => {
      const ed = decisiones[s.clave]?.edicion;
      return ed ? { ...s, ...ed, clave: s.clave, origen: s.origen } : s;
    });
  }, [propuesta, decisiones]);

  const snippetEditando = snippetsMostrados.find((s) => s.clave === editandoClave) ?? null;

  const listaDecisiones: DecisionSnippet[] = useMemo(
    () => Object.entries(decisiones).map(([clave, d]) => ({
      clave,
      accion: d.accion,
      edicion: d.edicion,
    })),
    [decisiones],
  );

  const listo = Boolean(
    propuesta
    && cabecera.fecha_visita
    && (propuesta.snippets.length === 0 || (propuesta.snippets.every((s) => decisiones[s.clave]))),
  );

  async function handleArchivo(file: File) {
    if (!esDocx(file)) {
      toast.error('Solo se acepta .docx');
      return;
    }
    setExtrayendo(true);
    setErrorPropuesta(null);
    try {
      const bytes = await file.arrayBuffer();
      const extraido = await extraerDocx(bytes);
      const hoy = obtenerFechaHoy();
      let cab = extraerCabecera(extraido.texto, hoy);
      let snippets: SnippetPropuesto[] = [];
      let descartados = 0;

      if (!extraido.sinTexto && extraido.texto.trim()) {
        try {
          const propuestaModelo = await pedirSnippetsAlModelo({
            texto: extraido.texto,
            piesDeFoto: extraido.fotos.map((f) => f.pieDeFoto ?? ''),
            nFotos: extraido.fotos.length,
            fechaFallback: hoy,
          });
          cab = propuestaModelo.cabecera;
          snippets = propuestaModelo.snippets;
          descartados = propuestaModelo.descartadosPorCita;
        } catch (err) {
          console.error(err);
          const msg = err instanceof Error
            ? err.message
            : 'No se pudieron proponer ideas. Puedes guardar el archivo y añadir notas.';
          setErrorPropuesta(msg);
          toast.error(`No se pudieron proponer ideas: ${msg}`);
        }
      }

      const p: PropuestaInforme = {
        cabecera: cab,
        snippets,
        texto: extraido.texto,
        sinTexto: extraido.sinTexto,
        fotos: extraido.fotos,
      };
      setArchivo(file);
      setArchivoBytes(bytes);
      setPropuesta(p);
      setCabecera(p.cabecera.fecha_visita ? p.cabecera : { ...p.cabecera, fecha_visita: hoy });
      setDecisiones({});
      setHistorial([]);
      setTemas(proponerTemas(extraido.texto, snippets));
      setNotas('');
      setDescartadosPorCita(descartados);
      if (p.sinTexto) toast.warning(MENSAJE_SIN_TEXTO);
      else if (snippets.length > 0) {
        toast.success(`${snippets.length} idea(s) propuestas. Confirma o ignora cada una.`);
      }
    } catch (err) {
      console.error(err);
      toast.error('No se pudo leer el .docx');
    } finally {
      setExtrayendo(false);
    }
  }

  function decidir(clave: string, accion: AccionDecision) {
    setDecisiones((prev) => ({
      ...prev,
      [clave]: { accion, edicion: prev[clave]?.edicion },
    }));
    setHistorial((h) => [...h, clave]);
  }

  function deshacer() {
    setHistorial((h) => {
      const clave = h[h.length - 1];
      if (!clave) return h;
      setDecisiones((prev) => {
        const next = { ...prev };
        delete next[clave];
        return next;
      });
      return h.slice(0, -1);
    });
  }

  function confirmarRestantes() {
    if (!propuesta) return;
    setDecisiones((prev) => {
      const next = { ...prev };
      const nuevas: string[] = [];
      for (const s of propuesta.snippets) {
        if (!next[s.clave]) {
          next[s.clave] = { accion: 'confirmar' };
          nuevas.push(s.clave);
        }
      }
      if (nuevas.length > 0) setHistorial((h) => [...h, ...nuevas]);
      return next;
    });
  }

  function guardarEdicion(edicion: Partial<Omit<SnippetPropuesto, 'clave' | 'origen'>>) {
    if (!editandoClave) return;
    const clave = editandoClave;
    setDecisiones((prev) => {
      const yaEstaba = Boolean(prev[clave]);
      if (!yaEstaba) setHistorial((h) => [...h, clave]);
      return {
        ...prev,
        [clave]: {
          accion: prev[clave]?.accion ?? 'confirmar',
          edicion: { ...prev[clave]?.edicion, ...edicion },
        },
      };
    });
    setEditandoClave(null);
  }

  async function handleGuardar() {
    if (!archivo || !archivoBytes || !propuesta || !listo) return;
    setGuardando(true);
    try {
      snippetsListosParaPersistir(propuesta.snippets, listaDecisiones);
      const resultado = await persistirInforme({
        archivo,
        archivoBytes,
        cabecera,
        propuestas: propuesta.snippets,
        decisiones: listaDecisiones,
        temas,
        notas,
        fotos: propuesta.fotos,
        texto: propuesta.texto,
        sinTexto: propuesta.sinTexto,
      });
      toast.success(
        propuesta.sinTexto
          ? `Informe guardado. ${MENSAJE_SIN_TEXTO}.`
          : `Informe guardado con ${resultado.snippetsInsertados} idea(s).`,
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
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Subir informe de visita</h1>
        <p className="text-gray-500 mt-1">
          Solo .docx. El sistema propone ideas. Tú confirmas, editas o ignoras cada una antes de guardar.
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
          {extrayendo ? 'Extrayendo ideas…' : (archivo ? archivo.name : 'Elegir .docx')}
        </Button>
      </div>

      {propuesta?.sinTexto && (
        <div className="flex items-start gap-3 rounded-xl border border-amber-300 bg-amber-50 p-4 text-amber-950">
          <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" />
          <div>
            <p className="font-medium capitalize">{MENSAJE_SIN_TEXTO}</p>
            <p className="text-sm mt-1">Se guarda el archivo y las fotos. No se inventan ideas.</p>
          </div>
        </div>
      )}

      {errorPropuesta && (
        <div className="flex items-start gap-3 rounded-xl border border-red-300 bg-red-50 p-4 text-red-950">
          <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" />
          <div>
            <p className="font-medium">No se pudieron proponer ideas</p>
            <p className="text-sm mt-1">{errorPropuesta}</p>
            <p className="text-sm mt-1">
              El archivo y las fotos sí se leyeron. Completa la cabecera, revisa los temas y añade notas si hace falta.
            </p>
          </div>
        </div>
      )}

      {propuesta && descartadosPorCita > 0 && (
        <p className="text-sm text-amber-800">
          Se descartaron {descartadosPorCita} propuesta(s) del modelo porque no tenían una cita literal en el Word.
        </p>
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

          {propuesta.snippets.length > 0 && (
            <SnippetDeck
              snippets={snippetsMostrados}
              fotos={propuesta.fotos}
              fotoUrls={fotoUrls}
              decisiones={Object.fromEntries(Object.entries(decisiones).map(([k, v]) => [k, v.accion]))}
              bloqueado={Boolean(editandoClave)}
              onDecision={decidir}
              onUndo={deshacer}
              onEditar={setEditandoClave}
              onConfirmarRestantes={confirmarRestantes}
            />
          )}

          <div className="rounded-xl border border-border bg-card p-4 space-y-3">
            <h2 className="text-lg font-semibold">Temas de la visita</h2>
            <p className="text-sm text-gray-500">
              El sistema marca los temas que aparecen en el Word. Confirma o cambia los chips.
            </p>
            <TemasChips seleccionados={temas} onChange={setTemas} />
            <div>
              <Label htmlFor="notas-visita">Notas</Label>
              <Textarea
                id="notas-visita"
                value={notas}
                onChange={(e) => setNotas(e.target.value)}
                rows={4}
                placeholder="Algo que se habló en la visita y no está en el informe."
              />
            </div>
          </div>

          <div className="flex gap-3">
            <Button type="button" variant="outline" onClick={() => navigate('/informes-visita')}>Cancelar</Button>
            <Button type="button" onClick={() => void handleGuardar()} disabled={!listo || guardando}>
              {guardando && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Guardar informe
            </Button>
          </div>
        </>
      )}

      <EditarSnippetDialog
        abierto={Boolean(editandoClave)}
        snippet={snippetEditando}
        onCerrar={() => setEditandoClave(null)}
        onGuardar={guardarEdicion}
      />
    </div>
    </RoleGuard>
  );
}

function CampoTexto({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string | null;
  onChange: (v: string | null) => void;
}) {
  return (
    <div>
      <Label>{label}</Label>
      <Input value={value ?? ''} onChange={(e) => onChange(e.target.value || null)} />
    </div>
  );
}
