import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Download, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { getSupabase } from '@/utils/supabase/client';
import { formatearFecha } from '@/utils/fechas';
import {
  BUCKET_INFORMES_VISITA,
  type InformeVisitaFotoRow,
  type InformeVisitaRow,
  type InformeVisitaSnippetRow,
} from '@/types/informesVisita';
import { esTablaInformesAusente, MENSAJE_MIGRACION_PENDIENTE } from '@/utils/informesVisita/migracion';
import { chipsDeSnippet } from './EditarSnippetDialog';

export function InformeDetallePage() {
  const { id } = useParams<{ id: string }>();
  const [informe, setInforme] = useState<InformeVisitaRow | null>(null);
  const [fotos, setFotos] = useState<Array<InformeVisitaFotoRow & { url?: string }>>([]);
  const [snippets, setSnippets] = useState<InformeVisitaSnippetRow[]>([]);
  const [cargando, setCargando] = useState(true);
  const [textoAbierto, setTextoAbierto] = useState(false);
  const [migracionPendiente, setMigracionPendiente] = useState(false);

  useEffect(() => {
    if (!id) return;
    void cargar(id);
  }, [id]);

  async function cargar(informeId: string) {
    setCargando(true);
    setMigracionPendiente(false);
    try {
      const sb = getSupabase() as any;
      const { data: inf, error: infErr } = await sb
        .from('informes_visita')
        .select('*')
        .eq('id', informeId)
        .maybeSingle();
      if (infErr) throw infErr;
      if (!inf) {
        setInforme(null);
        return;
      }
      setInforme(inf);

      const { data: fotosData, error: fotosErr } = await sb
        .from('informes_visita_fotos')
        .select('*')
        .eq('informe_id', informeId)
        .order('orden');
      if (fotosErr) throw fotosErr;

      const conUrl: Array<InformeVisitaFotoRow & { url?: string }> = [];
      for (const f of fotosData ?? []) {
        const { data } = await sb.storage.from(BUCKET_INFORMES_VISITA).createSignedUrl(f.storage_path, 60 * 60);
        conUrl.push({ ...f, url: data?.signedUrl });
      }
      setFotos(conUrl);

      const { data: snips, error: snipErr } = await sb
        .from('informes_visita_snippets')
        .select('*')
        .eq('informe_id', informeId)
        .order('created_at', { ascending: true });
      if (snipErr) throw snipErr;
      setSnippets(snips ?? []);
    } catch (err) {
      console.error(err);
      if (esTablaInformesAusente(err)) {
        setMigracionPendiente(true);
        setInforme(null);
      } else {
        toast.error('No se pudo cargar el informe');
      }
    } finally {
      setCargando(false);
    }
  }

  async function descargar() {
    if (!informe) return;
    const sb = getSupabase() as any;
    const { data, error } = await sb.storage
      .from(BUCKET_INFORMES_VISITA)
      .createSignedUrl(informe.archivo_path, 60);
    if (error || !data?.signedUrl) {
      toast.error('No se pudo abrir el archivo');
      return;
    }
    window.open(data.signedUrl, '_blank', 'noopener');
  }

  if (cargando) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  if (migracionPendiente) {
    return (
      <div className="max-w-3xl mx-auto py-12 text-center text-gray-500">
        {MENSAJE_MIGRACION_PENDIENTE}{' '}
        <Link to="/informes-visita" className="text-primary underline">Volver</Link>
      </div>
    );
  }

  if (!informe) {
    return (
      <div className="max-w-3xl mx-auto py-12 text-center text-gray-500">
        Informe no encontrado.{' '}
        <Link to="/informes-visita" className="text-primary underline">Volver</Link>
      </div>
    );
  }

  const fotoPorId = new Map(fotos.map((f) => [f.id, f]));

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div>
          <p className="text-sm text-gray-500">
            <Link to="/informes-visita" className="hover:underline">Informes de visita</Link>
          </p>
          <h1 className="text-2xl font-bold text-foreground mt-1">
            Visita {formatearFecha(informe.fecha_visita)}
          </h1>
          <p className="text-gray-500 mt-1">
            {[informe.agronoma, informe.finca, informe.especie].filter(Boolean).join(' · ')}
          </p>
        </div>
        <Button type="button" variant="outline" onClick={() => void descargar()}>
          <Download className="w-4 h-4 mr-1.5" />
          Descargar original
        </Button>
      </div>

      <dl className="rounded-xl border border-border bg-card p-4 grid gap-3 sm:grid-cols-2 text-sm">
        <Dato etiqueta="Fenología" valor={informe.fenologia} />
        <Dato etiqueta="Materia seca" valor={informe.materia_seca} />
        <Dato etiqueta="Proyección de cosecha" valor={informe.proyeccion_cosecha} />
        <Dato etiqueta="Archivo" valor={informe.archivo_nombre} />
        {informe.sin_texto && <Dato etiqueta="Texto" valor="sin texto para extraer" />}
      </dl>

      {fotos.length > 0 && (
        <div>
          <h2 className="text-lg font-semibold mb-3">Fotos del Word</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {fotos.map((f) => (
              <figure key={f.id} className="rounded-lg border border-border overflow-hidden bg-muted">
                {f.url ? (
                  <img src={f.url} alt={f.pie_de_foto || f.nombre_original || 'foto'} className="w-full h-36 object-cover" />
                ) : (
                  <div className="h-36 flex items-center justify-center text-xs text-gray-500">Sin vista</div>
                )}
                {f.pie_de_foto && (
                  <figcaption className="p-2 text-xs text-gray-600">{f.pie_de_foto}</figcaption>
                )}
              </figure>
            ))}
          </div>
        </div>
      )}

      {informe.texto_extraido && (
        <div>
          <Button type="button" variant="ghost" size="sm" onClick={() => setTextoAbierto((v) => !v)}>
            {textoAbierto ? 'Ocultar texto extraído' : 'Ver texto extraído'}
          </Button>
          {textoAbierto && (
            <pre className="mt-2 whitespace-pre-wrap text-sm rounded-xl border border-border bg-muted/40 p-4 max-h-80 overflow-y-auto">
              {informe.texto_extraido}
            </pre>
          )}
        </div>
      )}

      <div>
        <h2 className="text-lg font-semibold mb-3">Ideas ({snippets.length})</h2>
        {snippets.length === 0 ? (
          <p className="text-gray-500">Este informe no tiene ideas confirmadas.</p>
        ) : (
          <div className="space-y-3">
            {snippets.map((s) => {
              const chips = chipsDeSnippet(s);
              const foto = s.foto_id ? fotoPorId.get(s.foto_id) : undefined;
              return (
                <div key={s.id} className="rounded-xl border border-border bg-card p-4 space-y-2">
                  <div className="flex flex-wrap gap-2">
                    {chips.map((c) => (
                      <Badge key={c} variant="secondary">{c}</Badge>
                    ))}
                    {s.origen === 'conversacion' && (
                      <Badge variant="outline">Conversación</Badge>
                    )}
                  </div>
                  <p>{s.texto}</p>
                  {s.cita_word && (
                    <p className="text-xs text-muted-foreground italic">«{s.cita_word}»</p>
                  )}
                  {foto?.url && (
                    <img src={foto.url} alt={foto.pie_de_foto || ''} className="w-full max-h-40 object-cover rounded-lg" />
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function Dato({ etiqueta, valor }: { etiqueta: string; valor: string | null }) {
  if (!valor) return null;
  return (
    <div>
      <dt className="text-gray-500">{etiqueta}</dt>
      <dd className="font-medium">{valor}</dd>
    </div>
  );
}
