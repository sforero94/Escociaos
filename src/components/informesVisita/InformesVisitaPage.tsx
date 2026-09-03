import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { FileText, Loader2, Plus, Search } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { DateInput } from '@/components/ui/date-input';
import { useAuth } from '@/contexts/AuthContext';
import { getSupabase } from '@/utils/supabase/client';
import { fetchAll } from '@/utils/supabase/fetchAll';
import { formatearFecha } from '@/utils/fechas';
import {
  ETIQUETAS_TIPO_SNIPPET,
  TIPOS_SNIPPET,
  type InformeVisitaSnippetRow,
} from '@/types/informesVisita';
import { TEMAS_INFORME, sanitizarTemas } from '@/utils/informesVisita/temas';
import { esTablaInformesAusente, MENSAJE_MIGRACION_PENDIENTE } from '@/utils/informesVisita/migracion';
import { TemasChips } from './TemasChips';

interface FilaLista extends InformeVisitaSnippetRow {
  informe?: {
    fecha_visita: string;
    agronoma: string | null;
    finca: string | null;
    archivo_nombre: string | null;
  } | null;
}

export function InformesVisitaPage() {
  const navigate = useNavigate();
  const { hasRole } = useAuth();
  const puedeEscribir = hasRole(['Administrador', 'Gerencia']);
  const [filas, setFilas] = useState<FilaLista[]>([]);
  const [cargando, setCargando] = useState(true);
  const [migracionPendiente, setMigracionPendiente] = useState(false);
  const [fechaDesde, setFechaDesde] = useState('');
  const [fechaHasta, setFechaHasta] = useState('');
  const [tipo, setTipo] = useState<string>('');
  const [tema, setTema] = useState<string>('');
  const [plaga, setPlaga] = useState('');
  const [insumo, setInsumo] = useState('');
  const [busqueda, setBusqueda] = useState('');
  const [busquedaAplicada, setBusquedaAplicada] = useState('');
  const [informesCoincidentes, setInformesCoincidentes] = useState<Array<{ id: string; fecha_visita: string; agronoma: string | null; archivo_nombre: string | null }>>([]);

  useEffect(() => {
    const t = setTimeout(() => setBusquedaAplicada(busqueda), 300);
    return () => clearTimeout(t);
  }, [busqueda]);

  useEffect(() => {
    void cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fechaDesde, fechaHasta, tipo, tema, plaga, insumo, busquedaAplicada]);

  async function cargar() {
    setCargando(true);
    setMigracionPendiente(false);
    try {
      const sb = getSupabase() as any;
      const q = busquedaAplicada.trim();
      let idsInforme: string[] | null = null;

      if (fechaDesde || fechaHasta) {
        let infFecha = sb.from('informes_visita').select('id');
        if (fechaDesde) infFecha = infFecha.gte('fecha_visita', fechaDesde);
        if (fechaHasta) infFecha = infFecha.lte('fecha_visita', fechaHasta);
        const { data: porFecha, error: fechaErr } = await infFecha;
        if (fechaErr) throw fechaErr;
        const dateIds = ((porFecha ?? []) as Array<{ id: string }>).map((r) => r.id);
        if (dateIds.length === 0) {
          setFilas([]);
          setInformesCoincidentes([]);
          setCargando(false);
          return;
        }
        idsInforme = dateIds;
      }

      if (q) {
        const [{ data: infData, error: infErr }, { data: snipData, error: snipErr }] = await Promise.all([
          sb.from('informes_visita').select('id, fecha_visita, agronoma, archivo_nombre').textSearch('texto_busqueda', q, { type: 'plain', config: 'spanish' }),
          sb.from('informes_visita_snippets').select('informe_id').textSearch('texto_busqueda', q, { type: 'plain', config: 'spanish' }),
        ]);
        if (infErr) throw infErr;
        if (snipErr) throw snipErr;
        const ids = new Set<string>([
          ...((infData ?? []) as Array<{ id: string }>).map((r) => r.id),
          ...((snipData ?? []) as Array<{ informe_id: string }>).map((r) => r.informe_id),
        ]);
        const coincidentes = (infData ?? []) as Array<{ id: string; fecha_visita: string; agronoma: string | null; archivo_nombre: string | null }>;
        if (idsInforme) {
          const permitidos = new Set(idsInforme);
          idsInforme = [...ids].filter((id) => permitidos.has(id));
          setInformesCoincidentes(coincidentes.filter((i) => permitidos.has(i.id)));
        } else {
          idsInforme = [...ids];
          setInformesCoincidentes(coincidentes);
        }
        if (idsInforme.length === 0) {
          setFilas([]);
          setCargando(false);
          return;
        }
      } else {
        setInformesCoincidentes([]);
      }

      const { filas: rows } = await fetchAll<FilaLista>((desde, hasta) => {
        let query = sb
          .from('informes_visita_snippets')
          .select('*, informe:informes_visita(fecha_visita, agronoma, finca, archivo_nombre)')
          .order('created_at', { ascending: false })
          .range(desde, hasta);
        if (tipo) query = query.eq('tipo', tipo);
        if (tema) query = query.contains('temas', [tema]);
        if (plaga.trim()) query = query.ilike('plaga', `%${plaga.trim()}%`);
        if (insumo.trim()) query = query.ilike('insumo', `%${insumo.trim()}%`);
        if (idsInforme) query = query.in('informe_id', idsInforme);
        return query;
      });
      setFilas(rows);
    } catch (err) {
      console.error(err);
      if (esTablaInformesAusente(err)) {
        setMigracionPendiente(true);
      } else {
        toast.error('No se pudieron cargar las ideas de visita');
      }
      setFilas([]);
      setInformesCoincidentes([]);
    } finally {
      setCargando(false);
    }
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Informes de visita</h1>
          <p className="text-gray-500 mt-1">
            Ideas del Word de la agrónoma, con temas por nota. No es el monitoreo de rondas de la app.
          </p>
        </div>
        {puedeEscribir && (
          <Button size="sm" onClick={() => navigate('/informes-visita/nuevo')}>
            <Plus className="w-4 h-4 mr-1.5" />
            Subir .docx
          </Button>
        )}
      </div>

      {migracionPendiente && (
        <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-amber-950">
          <p className="font-medium">{MENSAJE_MIGRACION_PENDIENTE}</p>
          <p className="text-sm mt-1">Cuando Santiago dé el go, se aplica la 134 y esta pantalla deja de estar vacía.</p>
        </div>
      )}

      <div className="rounded-xl border border-border bg-card p-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <div className="sm:col-span-2 lg:col-span-3">
          <Label htmlFor="fts">Buscar en las ideas y en el Word</Label>
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              id="fts"
              className="pl-9"
              placeholder="Proxam, ácaro, drench…"
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
            />
          </div>
        </div>
        <div>
          <Label>Fecha desde</Label>
          <DateInput value={fechaDesde} onChange={setFechaDesde} />
        </div>
        <div>
          <Label>Fecha hasta</Label>
          <DateInput value={fechaHasta} onChange={setFechaHasta} />
        </div>
        <div>
          <Label>Tema</Label>
          <select
            className="border-input bg-input-background h-11 w-full rounded-md border px-3 text-sm"
            value={tema}
            onChange={(e) => setTema(e.target.value)}
          >
            <option value="">Todos</option>
            {TEMAS_INFORME.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </div>
        <div>
          <Label>Tipo</Label>
          <select
            className="border-input bg-input-background h-11 w-full rounded-md border px-3 text-sm"
            value={tipo}
            onChange={(e) => setTipo(e.target.value)}
          >
            <option value="">Todos</option>
            {TIPOS_SNIPPET.map((t) => (
              <option key={t} value={t}>{ETIQUETAS_TIPO_SNIPPET[t]}</option>
            ))}
          </select>
        </div>
        <div>
          <Label>Plaga</Label>
          <Input value={plaga} onChange={(e) => setPlaga(e.target.value)} />
        </div>
        <div>
          <Label>Insumo</Label>
          <Input value={insumo} onChange={(e) => setInsumo(e.target.value)} />
        </div>
      </div>

      {informesCoincidentes.length > 0 && (
        <div className="rounded-xl border border-border p-4 space-y-2">
          <h2 className="text-sm font-semibold">Informes cuyo Word coincide</h2>
          {informesCoincidentes.map((inf) => (
            <Link key={inf.id} to={`/informes-visita/${inf.id}`} className="block text-sm hover:underline">
              {formatearFecha(inf.fecha_visita)}
              {inf.agronoma ? ` · ${inf.agronoma}` : ''}
              {inf.archivo_nombre ? ` · ${inf.archivo_nombre}` : ''}
            </Link>
          ))}
        </div>
      )}

      {cargando ? (
        <div className="flex justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-primary" />
        </div>
      ) : filas.length === 0 ? (
        <p className="text-gray-500 text-center py-12">
          {migracionPendiente ? 'Sin tablas todavía.' : 'No hay ideas con esos filtros.'}
        </p>
      ) : (
        <div className="rounded-xl border border-border divide-y">
          {filas.map((f) => (
              <Link
                key={f.id}
                to={`/informes-visita/${f.informe_id}`}
                className="flex flex-col sm:flex-row sm:items-center gap-2 p-4 hover:bg-gray-50"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2 mb-1">
                    <TemasChips compacto soloLectura seleccionados={sanitizarTemas(f.temas)} />
                    <span className="text-sm text-gray-500">
                      {f.informe?.fecha_visita ? formatearFecha(f.informe.fecha_visita) : ''}
                    </span>
                  </div>
                  <p className="font-medium text-foreground line-clamp-2">{f.texto}</p>
                </div>
                <FileText className="w-4 h-4 text-muted-foreground shrink-0" />
              </Link>
          ))}
        </div>
      )}
    </div>
  );
}
