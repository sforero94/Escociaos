import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { FileText, Loader2, Plus, Search } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { DateInput } from '@/components/ui/date-input';
import { useAuth } from '@/contexts/AuthContext';
import { getSupabase } from '@/utils/supabase/client';
import { fetchAll } from '@/utils/supabase/fetchAll';
import { formatearFecha } from '@/utils/fechas';
import {
  ETIQUETAS_TIPO_OBSERVACION,
  TIPOS_OBSERVACION_AGRONOMICA,
  type ObservacionAgronomicaRow,
  type TipoObservacionAgronomica,
} from '@/types/informesVisita';

interface FilaLista extends ObservacionAgronomicaRow {
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
  const [fechaDesde, setFechaDesde] = useState('');
  const [fechaHasta, setFechaHasta] = useState('');
  const [tipo, setTipo] = useState<string>('');
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
  }, [fechaDesde, fechaHasta, tipo, plaga, insumo, busquedaAplicada]);

  async function cargar() {
    setCargando(true);
    try {
      const sb = getSupabase() as any;
      let idsInforme: string[] | null = null;
      const q = busquedaAplicada.trim();
      if (q) {
        const { data, error } = await sb
          .from('informes_visita')
          .select('id, fecha_visita, agronoma, archivo_nombre')
          .textSearch('texto_busqueda', q, { type: 'plain', config: 'spanish' });
        if (error) throw error;
        const ids = ((data ?? []) as Array<{ id: string }>).map((r) => r.id);
        idsInforme = ids;
        setInformesCoincidentes(data ?? []);
        if (ids.length === 0) {
          setFilas([]);
          setCargando(false);
          return;
        }
      } else {
        setInformesCoincidentes([]);
      }

      const { filas: rows } = await fetchAll<FilaLista>((desde, hasta) => {
        let query = sb
          .from('observaciones_agronomicas')
          .select('*, informe:informes_visita(fecha_visita, agronoma, finca, archivo_nombre)')
          .order('fecha', { ascending: false })
          .range(desde, hasta);
        if (fechaDesde) query = query.gte('fecha', fechaDesde);
        if (fechaHasta) query = query.lte('fecha', fechaHasta);
        if (tipo) query = query.eq('tipo', tipo);
        if (plaga.trim()) query = query.ilike('plaga_enfermedad', `%${plaga.trim()}%`);
        if (insumo.trim()) query = query.ilike('insumo', `%${insumo.trim()}%`);
        if (idsInforme) query = query.in('informe_id', idsInforme);
        return query;
      });
      setFilas(rows);
    } catch (err) {
      console.error(err);
      toast.error('No se pudieron cargar las observaciones');
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
            Observaciones del Word de la agrónoma. No es el monitoreo de rondas de la app.
          </p>
        </div>
        {puedeEscribir && (
          <Button size="sm" onClick={() => navigate('/informes-visita/nuevo')}>
            <Plus className="w-4 h-4 mr-1.5" />
            Subir .docx
          </Button>
        )}
      </div>

      <div className="rounded-xl border border-border bg-card p-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <div className="sm:col-span-2 lg:col-span-3">
          <Label htmlFor="fts">Buscar en el texto del Word</Label>
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
          <Label>Tipo</Label>
          <select
            className="border-input bg-input-background h-11 w-full rounded-md border px-3 text-sm"
            value={tipo}
            onChange={(e) => setTipo(e.target.value)}
          >
            <option value="">Todos</option>
            {TIPOS_OBSERVACION_AGRONOMICA.map((t) => (
              <option key={t} value={t}>{ETIQUETAS_TIPO_OBSERVACION[t]}</option>
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
        <p className="text-gray-500 text-center py-12">No hay observaciones con esos filtros.</p>
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
                  <Badge variant="secondary">{ETIQUETAS_TIPO_OBSERVACION[f.tipo as TipoObservacionAgronomica] ?? f.tipo}</Badge>
                  <span className="text-sm text-gray-500">{formatearFecha(f.fecha)}</span>
                  {f.fecha_contexto && (
                    <span className="text-xs text-gray-400">contexto {formatearFecha(f.fecha_contexto)}</span>
                  )}
                </div>
                <p className="font-medium text-foreground truncate">
                  {f.insumo || f.plaga_enfermedad || f.notas || 'Sin detalle'}
                </p>
                <p className="text-sm text-gray-500 truncate">
                  {[f.lote, f.dosis != null ? `${f.dosis} ${f.unidad ?? ''}`.trim() : null, f.periodo_carencia_dias != null ? `carencia ${f.periodo_carencia_dias} d` : null]
                    .filter(Boolean)
                    .join(' · ')}
                </p>
              </div>
              <FileText className="w-4 h-4 text-muted-foreground shrink-0" />
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
