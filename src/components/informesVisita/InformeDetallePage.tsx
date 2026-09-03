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
  ETIQUETAS_TIPO_OBSERVACION,
  type InformeVisitaFotoRow,
  type InformeVisitaRow,
  type ObservacionAgronomicaRow,
  type TipoObservacionAgronomica,
} from '@/types/informesVisita';

export function InformeDetallePage() {
  const { id } = useParams<{ id: string }>();
  const [informe, setInforme] = useState<InformeVisitaRow | null>(null);
  const [fotos, setFotos] = useState<Array<InformeVisitaFotoRow & { url?: string }>>([]);
  const [filas, setFilas] = useState<ObservacionAgronomicaRow[]>([]);
  const [cargando, setCargando] = useState(true);
  const [textoAbierto, setTextoAbierto] = useState(false);

  useEffect(() => {
    if (!id) return;
    void cargar(id);
  }, [id]);

  async function cargar(informeId: string) {
    setCargando(true);
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

      const { data: obs, error: obsErr } = await sb
        .from('observaciones_agronomicas')
        .select('*')
        .eq('informe_id', informeId)
        .order('fecha', { ascending: true });
      if (obsErr) throw obsErr;
      setFilas(obs ?? []);
    } catch (err) {
      console.error(err);
      toast.error('No se pudo cargar el informe');
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

  if (!informe) {
    return (
      <div className="max-w-3xl mx-auto py-12 text-center text-gray-500">
        Informe no encontrado.{' '}
        <Link to="/informes-visita" className="text-primary underline">Volver</Link>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6">
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
        <h2 className="text-lg font-semibold mb-3">Observaciones ({filas.length})</h2>
        {filas.length === 0 ? (
          <p className="text-gray-500">Este informe no tiene filas confirmadas.</p>
        ) : (
          <div className="space-y-3">
            {filas.map((f) => (
              <div key={f.id} className="rounded-xl border border-border bg-card p-4">
                <div className="flex flex-wrap gap-2 mb-2">
                  <Badge variant="secondary">{ETIQUETAS_TIPO_OBSERVACION[f.tipo as TipoObservacionAgronomica] ?? f.tipo}</Badge>
                  <span className="text-sm text-gray-500">{formatearFecha(f.fecha)}</span>
                </div>
                <p className="font-medium">{f.insumo || f.plaga_enfermedad || '—'}</p>
                <p className="text-sm text-gray-600 mt-1">
                  {[
                    f.lote,
                    f.dosis != null ? `${f.dosis} ${f.unidad ?? ''}`.trim() : null,
                    f.periodo_carencia_dias != null ? `carencia ${f.periodo_carencia_dias} días` : null,
                    f.via,
                    f.incidencia ? `inc. ${f.incidencia}` : null,
                    f.severidad ? `sev. ${f.severidad}` : null,
                  ].filter(Boolean).join(' · ')}
                </p>
                {f.notas && <p className="text-sm mt-2">{f.notas}</p>}
              </div>
            ))}
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
