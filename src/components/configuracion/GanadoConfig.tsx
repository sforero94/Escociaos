import { useState, useEffect, useCallback, useMemo } from 'react';
import { getSupabase } from '@/utils/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Pencil, Plus, Save, X } from 'lucide-react';
import { toast } from 'sonner';
import { formatNumber } from '@/utils/format';
import { derivarLoteEtapaDeNombre } from '@/utils/calculosGanado';
import { ORDEN_ETAPAS, ETIQUETA_ETAPA } from '@/types/ganado';
import type { GanUbicacion, GanFinca, GanLote, GanPotrero, EtapaProductiva } from '@/types/ganado';

const selectClass =
  'px-2 py-1.5 text-sm border border-gray-200 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-primary/20';

const ETAPAS_ASIGNABLES = ORDEN_ETAPAS.filter((e): e is EtapaProductiva => e !== 'sin_clasificar');

/**
 * CRUD de la jerarquía del inventario de ganado:
 * ubicaciones → fincas (con hectáreas) → lotes → potreros (lote + etapa).
 * Sin borrado físico — fincas, lotes y potreros se desactivan para
 * preservar el historial de movimientos.
 *
 * Lote y etapa son visibles para cualquier usuario con acceso al módulo;
 * solo Administrador/Gerencia pueden editarlos o crear/editar registros
 * (A-5, tercer criterio — mismo corte de escritura que la RLS de 044).
 */
export function GanadoConfig() {
  const supabase = getSupabase() as any; // eslint-disable-line @typescript-eslint/no-explicit-any
  const { profile } = useAuth();
  const canWrite = profile?.rol === 'Administrador' || profile?.rol === 'Gerencia';

  const [ubicaciones, setUbicaciones] = useState<GanUbicacion[]>([]);
  const [fincas, setFincas] = useState<GanFinca[]>([]);
  const [lotes, setLotes] = useState<GanLote[]>([]);
  const [potreros, setPotreros] = useState<GanPotrero[]>([]);
  const [cabezasPorPotrero, setCabezasPorPotrero] = useState<Record<string, number>>({});

  const cargar = useCallback(async () => {
    const [u, f, l, p, inv] = await Promise.all([
      supabase.from('gan_ubicaciones').select('id, nombre').order('nombre'),
      supabase.from('gan_fincas').select('id, nombre, ubicacion_id, hectareas, activa').order('nombre'),
      supabase.from('gan_lotes').select('id, finca_id, nombre, activo').order('nombre'),
      supabase.from('gan_potreros').select('id, nombre, finca_id, activo, lote_id, etapa').order('nombre'),
      supabase.from('gan_inventario').select('potrero_id, novillos, toros'),
    ]);
    setUbicaciones((u.data || []) as GanUbicacion[]);
    setFincas(((f.data || []) as any[]).map((x) => ({ ...x, hectareas: Number(x.hectareas) || 0 })) as GanFinca[]);
    setLotes((l.data || []) as GanLote[]);
    setPotreros((p.data || []) as GanPotrero[]);
    const mapa: Record<string, number> = {};
    ((inv.data || []) as any[]).forEach((r) => {
      mapa[r.potrero_id] = (r.novillos || 0) + (r.toros || 0);
    });
    setCabezasPorPotrero(mapa);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    cargar();
  }, [cargar]);

  return (
    <div className="space-y-6">
      <UbicacionesSection ubicaciones={ubicaciones} canWrite={canWrite} onChanged={cargar} />
      <FincasSection
        fincas={fincas}
        ubicaciones={ubicaciones}
        lotes={lotes}
        potreros={potreros}
        cabezasPorPotrero={cabezasPorPotrero}
        canWrite={canWrite}
        onChanged={cargar}
      />
      <LotesSection lotes={lotes} fincas={fincas} canWrite={canWrite} onChanged={cargar} />
      <PotrerosSection potreros={potreros} fincas={fincas} lotes={lotes} canWrite={canWrite} onChanged={cargar} />
    </div>
  );
}

function SectionCard({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <div className="bg-white/80 backdrop-blur-sm rounded-2xl border border-primary/10 p-4 lg:p-6 shadow-[0_4px_24px_rgba(115,153,28,0.08)]">
      <h3 className="text-lg text-foreground mb-1">{title}</h3>
      <p className="text-sm text-brand-brown/70 mb-4">{subtitle}</p>
      {children}
    </div>
  );
}

function UbicacionesSection({
  ubicaciones,
  canWrite,
  onChanged,
}: {
  ubicaciones: GanUbicacion[];
  canWrite: boolean;
  onChanged: () => void;
}) {
  const supabase = getSupabase() as any; // eslint-disable-line @typescript-eslint/no-explicit-any
  const [editId, setEditId] = useState<string | null>(null);
  const [nombre, setNombre] = useState('');
  const [creating, setCreating] = useState(false);

  const guardar = async () => {
    if (!nombre.trim()) {
      toast.error('El nombre es obligatorio');
      return;
    }
    const { error } = creating
      ? await supabase.from('gan_ubicaciones').insert({ nombre: nombre.trim() })
      : await supabase.from('gan_ubicaciones').update({ nombre: nombre.trim() }).eq('id', editId);
    if (error) {
      toast.error('Error guardando ubicación: ' + error.message);
      return;
    }
    toast.success(creating ? 'Ubicación creada' : 'Ubicación actualizada');
    setEditId(null);
    setCreating(false);
    setNombre('');
    onChanged();
  };

  return (
    <SectionCard title="Ubicaciones" subtitle="Nivel superior de la jerarquía (San Francisco, Supata, Subachoque)">
      <div className="space-y-2">
        {ubicaciones.map((u) =>
          editId === u.id ? (
            <div key={u.id} className="flex items-center gap-2">
              <Input value={nombre} onChange={(e) => setNombre(e.target.value)} className="max-w-xs" />
              <Button size="sm" onClick={guardar}><Save className="w-4 h-4" /></Button>
              <Button size="sm" variant="outline" onClick={() => { setEditId(null); setNombre(''); }}><X className="w-4 h-4" /></Button>
            </div>
          ) : (
            <div key={u.id} className="flex items-center justify-between rounded-lg border border-primary/10 px-3 py-2 max-w-md">
              <span className="text-sm font-medium">{u.nombre}</span>
              {canWrite && (
                <Button size="sm" variant="ghost" onClick={() => { setEditId(u.id); setCreating(false); setNombre(u.nombre); }}>
                  <Pencil className="w-4 h-4" />
                </Button>
              )}
            </div>
          )
        )}
        {canWrite &&
          (creating ? (
            <div className="flex items-center gap-2">
              <Input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Nombre de la ubicación..." className="max-w-xs" />
              <Button size="sm" onClick={guardar}><Save className="w-4 h-4" /></Button>
              <Button size="sm" variant="outline" onClick={() => { setCreating(false); setNombre(''); }}><X className="w-4 h-4" /></Button>
            </div>
          ) : (
            <Button variant="outline" size="sm" onClick={() => { setCreating(true); setEditId(null); setNombre(''); }}>
              <Plus className="w-4 h-4 mr-1.5" />
              Nueva ubicación
            </Button>
          ))}
      </div>
    </SectionCard>
  );
}

function FincasSection({
  fincas,
  ubicaciones,
  lotes,
  potreros,
  cabezasPorPotrero,
  canWrite,
  onChanged,
}: {
  fincas: GanFinca[];
  ubicaciones: GanUbicacion[];
  lotes: GanLote[];
  potreros: GanPotrero[];
  cabezasPorPotrero: Record<string, number>;
  canWrite: boolean;
  onChanged: () => void;
}) {
  const supabase = getSupabase() as any; // eslint-disable-line @typescript-eslint/no-explicit-any
  const [editId, setEditId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ nombre: '', ubicacion_id: '', hectareas: '', activa: true });
  const [confirmDesactivar, setConfirmDesactivar] = useState<{
    payload: { nombre: string; ubicacion_id: string | null; hectareas: number; activa: boolean };
    id: string;
    cabezas: number;
    potrerosCount: number;
  } | null>(null);

  const conteoPorFinca = useMemo(() => {
    const mapa = new Map<string, { lotes: number; potreros: number; cabezas: number }>();
    fincas.forEach((f) => mapa.set(f.id, { lotes: 0, potreros: 0, cabezas: 0 }));
    lotes.forEach((l) => {
      const c = mapa.get(l.finca_id);
      if (c && l.activo) c.lotes += 1;
    });
    potreros.forEach((p) => {
      const c = mapa.get(p.finca_id);
      if (!c || !p.activo) return;
      c.potreros += 1;
      c.cabezas += cabezasPorPotrero[p.id] || 0;
    });
    return mapa;
  }, [fincas, lotes, potreros, cabezasPorPotrero]);

  const iniciar = (f?: GanFinca) => {
    if (f) {
      setEditId(f.id);
      setCreating(false);
      setForm({ nombre: f.nombre, ubicacion_id: f.ubicacion_id || '', hectareas: String(f.hectareas || ''), activa: f.activa });
    } else {
      setEditId(null);
      setCreating(true);
      setForm({ nombre: '', ubicacion_id: '', hectareas: '', activa: true });
    }
  };

  const escribir = async (payload: { nombre: string; ubicacion_id: string | null; hectareas: number; activa: boolean }) => {
    const { error } = creating
      ? await supabase.from('gan_fincas').insert(payload)
      : await supabase.from('gan_fincas').update(payload).eq('id', editId);
    if (error) {
      toast.error('Error guardando finca: ' + error.message);
      return;
    }
    toast.success(creating ? 'Finca creada' : 'Finca actualizada');
    setEditId(null);
    setCreating(false);
    setConfirmDesactivar(null);
    onChanged();
  };

  const guardar = async () => {
    if (!form.nombre.trim()) {
      toast.error('El nombre es obligatorio');
      return;
    }
    const payload = {
      nombre: form.nombre.trim(),
      ubicacion_id: form.ubicacion_id || null,
      hectareas: Number(form.hectareas) || 0,
      activa: form.activa,
    };

    // Desactivar una finca con cabezas es una decisión que hay que confirmar
    // a ojos abiertos: esas cabezas dejan de contar en el total (§6.7).
    const conteo = editId ? conteoPorFinca.get(editId) : undefined;
    const fincaPrevia = editId ? fincas.find((f) => f.id === editId) : undefined;
    if (!creating && fincaPrevia?.activa && !payload.activa && conteo && conteo.cabezas > 0) {
      setConfirmDesactivar({ payload, id: editId as string, cabezas: conteo.cabezas, potrerosCount: conteo.potreros });
      return;
    }
    await escribir(payload);
  };

  const formRow = (
    <div className="flex flex-wrap items-center gap-2">
      <Input value={form.nombre} onChange={(e) => setForm((p) => ({ ...p, nombre: e.target.value }))} placeholder="Nombre..." className="w-44" />
      <select value={form.ubicacion_id} onChange={(e) => setForm((p) => ({ ...p, ubicacion_id: e.target.value }))} className={selectClass}>
        <option value="">Sin ubicación</option>
        {ubicaciones.map((u) => <option key={u.id} value={u.id}>{u.nombre}</option>)}
      </select>
      <Input
        type="number"
        min={0}
        value={form.hectareas}
        onChange={(e) => setForm((p) => ({ ...p, hectareas: e.target.value }))}
        onWheel={(e) => e.currentTarget.blur()}
        placeholder="Hectáreas"
        className="w-28"
      />
      <div className="flex items-center gap-1.5">
        <Switch checked={form.activa} onCheckedChange={(v) => setForm((p) => ({ ...p, activa: v }))} />
        <span className="text-xs text-brand-brown/70">Activa</span>
      </div>
      <Button size="sm" onClick={guardar}><Save className="w-4 h-4" /></Button>
      <Button size="sm" variant="outline" onClick={() => { setEditId(null); setCreating(false); }}><X className="w-4 h-4" /></Button>
    </div>
  );

  return (
    <SectionCard title="Fincas" subtitle="Fincas con hectáreas configuradas — base del KPI cabezas/ha">
      <div className="space-y-2">
        {fincas.map((f) => {
          const c = conteoPorFinca.get(f.id);
          return editId === f.id ? (
            <div key={f.id}>{formRow}</div>
          ) : (
            <div key={f.id} className={`flex items-center justify-between rounded-lg border border-primary/10 px-3 py-2 ${!f.activa ? 'opacity-50' : ''}`}>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                <span className="font-medium">{f.nombre}</span>
                <span className="text-brand-brown/60">{ubicaciones.find((u) => u.id === f.ubicacion_id)?.nombre || 'Sin ubicación'}</span>
                <span className="text-brand-brown/60">{formatNumber(f.hectareas, 1)} ha</span>
                {c && (
                  <span className="text-brand-brown/50 text-xs">
                    {formatNumber(c.lotes)} {c.lotes === 1 ? 'lote' : 'lotes'} · {formatNumber(c.potreros)}{' '}
                    {c.potreros === 1 ? 'potrero' : 'potreros'} · {formatNumber(c.cabezas)} cabezas
                  </span>
                )}
                {!f.activa && <span className="text-xs rounded-full bg-gray-100 px-2 py-0.5">Inactiva</span>}
              </div>
              {canWrite && (
                <Button size="sm" variant="ghost" onClick={() => iniciar(f)}>
                  <Pencil className="w-4 h-4" />
                </Button>
              )}
            </div>
          );
        })}
        {canWrite && (creating ? formRow : (
          <Button variant="outline" size="sm" onClick={() => iniciar()}>
            <Plus className="w-4 h-4 mr-1.5" />
            Nueva finca
          </Button>
        ))}
      </div>

      <AlertDialog open={!!confirmDesactivar} onOpenChange={(open) => { if (!open) setConfirmDesactivar(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Desactivar esta finca?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta finca tiene <strong>{confirmDesactivar ? formatNumber(confirmDesactivar.cabezas) : 0}</strong> cabezas en{' '}
              <strong>{confirmDesactivar ? formatNumber(confirmDesactivar.potrerosCount) : 0}</strong> potreros; al desactivarla dejan
              de contar en el total de inventario hasta que se reactive.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => confirmDesactivar && escribir(confirmDesactivar.payload)}>
              Desactivar de todas formas
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </SectionCard>
  );
}

function LotesSection({
  lotes,
  fincas,
  canWrite,
  onChanged,
}: {
  lotes: GanLote[];
  fincas: GanFinca[];
  canWrite: boolean;
  onChanged: () => void;
}) {
  const supabase = getSupabase() as any; // eslint-disable-line @typescript-eslint/no-explicit-any
  const [editId, setEditId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ nombre: '', finca_id: '', activo: true });

  const fincaNombre = (id: string) => fincas.find((f) => f.id === id)?.nombre || '—';

  const iniciar = (l?: GanLote) => {
    if (l) {
      setEditId(l.id);
      setCreating(false);
      setForm({ nombre: l.nombre, finca_id: l.finca_id, activo: l.activo });
    } else {
      setEditId(null);
      setCreating(true);
      setForm({ nombre: '', finca_id: '', activo: true });
    }
  };

  const guardar = async () => {
    if (!form.nombre.trim() || !form.finca_id) {
      toast.error('Nombre y finca son obligatorios');
      return;
    }
    const payload = { nombre: form.nombre.trim(), finca_id: form.finca_id, activo: form.activo };
    const { error } = creating
      ? await supabase.from('gan_lotes').insert(payload)
      : await supabase.from('gan_lotes').update(payload).eq('id', editId);
    if (error) {
      toast.error('Error guardando lote: ' + error.message);
      return;
    }
    toast.success(creating ? 'Lote creado' : 'Lote actualizado');
    setEditId(null);
    setCreating(false);
    onChanged();
  };

  const formRow = (
    <div className="flex flex-wrap items-center gap-2">
      <Input value={form.nombre} onChange={(e) => setForm((p) => ({ ...p, nombre: e.target.value }))} placeholder="Nombre del lote..." className="w-44" />
      <select value={form.finca_id} onChange={(e) => setForm((p) => ({ ...p, finca_id: e.target.value }))} className={selectClass}>
        <option value="">Seleccionar finca...</option>
        {fincas.filter((f) => f.activa).map((f) => <option key={f.id} value={f.id}>{f.nombre}</option>)}
      </select>
      <div className="flex items-center gap-1.5">
        <Switch checked={form.activo} onCheckedChange={(v) => setForm((p) => ({ ...p, activo: v }))} />
        <span className="text-xs text-brand-brown/70">Activo</span>
      </div>
      <Button size="sm" onClick={guardar}><Save className="w-4 h-4" /></Button>
      <Button size="sm" variant="outline" onClick={() => { setEditId(null); setCreating(false); }}><X className="w-4 h-4" /></Button>
    </div>
  );

  return (
    <SectionCard title="Lotes" subtitle="Nivel entre finca y potrero — el que hoy solo vive en el nombre del potrero">
      <div className="space-y-2">
        {lotes.map((l) =>
          editId === l.id ? (
            <div key={l.id}>{formRow}</div>
          ) : (
            <div key={l.id} className={`flex items-center justify-between rounded-lg border border-primary/10 px-3 py-2 ${!l.activo ? 'opacity-50' : ''}`}>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                <span className="font-medium">{l.nombre}</span>
                <span className="text-brand-brown/60">{fincaNombre(l.finca_id)}</span>
                {!l.activo && <span className="text-xs rounded-full bg-gray-100 px-2 py-0.5">Inactivo</span>}
              </div>
              {canWrite && (
                <Button size="sm" variant="ghost" onClick={() => iniciar(l)}>
                  <Pencil className="w-4 h-4" />
                </Button>
              )}
            </div>
          )
        )}
        {canWrite && (creating ? formRow : (
          <Button variant="outline" size="sm" onClick={() => iniciar()}>
            <Plus className="w-4 h-4 mr-1.5" />
            Nuevo lote
          </Button>
        ))}
        {lotes.length === 0 && !creating && (
          <p className="text-sm text-brand-brown/50">Sin lotes configurados todavía.</p>
        )}
      </div>
    </SectionCard>
  );
}

function PotrerosSection({
  potreros,
  fincas,
  lotes,
  canWrite,
  onChanged,
}: {
  potreros: GanPotrero[];
  fincas: GanFinca[];
  lotes: GanLote[];
  canWrite: boolean;
  onChanged: () => void;
}) {
  const supabase = getSupabase() as any; // eslint-disable-line @typescript-eslint/no-explicit-any
  const [editId, setEditId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState<{
    nombre: string;
    finca_id: string;
    lote_id: string;
    etapa: EtapaProductiva | '';
    activo: boolean;
  }>({ nombre: '', finca_id: '', lote_id: '', etapa: '', activo: true });
  // La sugerencia por nombre solo se aplica mientras el usuario no haya
  // tocado lote/etapa a mano — nunca pisa una elección explícita (§6.7).
  const [loteTocado, setLoteTocado] = useState(false);
  const [etapaTocada, setEtapaTocada] = useState(false);

  const fincaNombre = (id: string) => fincas.find((f) => f.id === id)?.nombre || '-';
  const loteNombre = (id: string | null) => (id ? lotes.find((l) => l.id === id)?.nombre : null);

  const lotesDeFinca = useMemo(
    () => lotes.filter((l) => l.activo && l.finca_id === form.finca_id),
    [lotes, form.finca_id]
  );

  const iniciar = (p?: GanPotrero) => {
    setLoteTocado(false);
    setEtapaTocada(false);
    if (p) {
      setEditId(p.id);
      setCreating(false);
      setForm({
        nombre: p.nombre,
        finca_id: p.finca_id,
        lote_id: p.lote_id || '',
        etapa: p.etapa || '',
        activo: p.activo,
      });
    } else {
      setEditId(null);
      setCreating(true);
      setForm({ nombre: '', finca_id: '', lote_id: '', etapa: '', activo: true });
    }
  };

  const handleNombreChange = (nombre: string) => {
    setForm((prev) => {
      if (!creating || !prev.finca_id) return { ...prev, nombre };
      const sugerido = derivarLoteEtapaDeNombre(nombre);
      const loteSugerido = sugerido.lote
        ? lotes.find((l) => l.finca_id === prev.finca_id && l.nombre.toLowerCase() === sugerido.lote!.toLowerCase())
        : undefined;
      return {
        ...prev,
        nombre,
        lote_id: !loteTocado && loteSugerido ? loteSugerido.id : prev.lote_id,
        etapa: !etapaTocada && sugerido.etapa ? sugerido.etapa : prev.etapa,
      };
    });
  };

  const guardar = async () => {
    if (!form.nombre.trim() || !form.finca_id) {
      toast.error('Nombre y finca son obligatorios');
      return;
    }
    const payload = {
      nombre: form.nombre.trim(),
      finca_id: form.finca_id,
      lote_id: form.lote_id || null,
      etapa: form.etapa || null,
      activo: form.activo,
    };
    const { error } = creating
      ? await supabase.from('gan_potreros').insert(payload)
      : await supabase.from('gan_potreros').update(payload).eq('id', editId);
    if (error) {
      toast.error('Error guardando potrero: ' + error.message);
      return;
    }
    toast.success(creating ? 'Potrero creado' : 'Potrero actualizado');
    setEditId(null);
    setCreating(false);
    onChanged();
  };

  const formRow = (
    <div className="flex flex-wrap items-center gap-2">
      <Input
        value={form.nombre}
        onChange={(e) => handleNombreChange(e.target.value)}
        placeholder="Nombre..."
        className="w-44"
      />
      <select
        value={form.finca_id}
        onChange={(e) => {
          setForm((p) => ({ ...p, finca_id: e.target.value, lote_id: '' }));
          setLoteTocado(false);
        }}
        className={selectClass}
      >
        <option value="">Seleccionar finca...</option>
        {fincas.filter((f) => f.activa).map((f) => <option key={f.id} value={f.id}>{f.nombre}</option>)}
      </select>
      <select
        value={form.lote_id}
        onChange={(e) => {
          setForm((p) => ({ ...p, lote_id: e.target.value }));
          setLoteTocado(true);
        }}
        className={selectClass}
        disabled={!form.finca_id}
      >
        <option value="">Sin lote</option>
        {lotesDeFinca.map((l) => <option key={l.id} value={l.id}>{l.nombre}</option>)}
      </select>
      <select
        value={form.etapa}
        onChange={(e) => {
          setForm((p) => ({ ...p, etapa: e.target.value as EtapaProductiva | '' }));
          setEtapaTocada(true);
        }}
        className={selectClass}
      >
        <option value="">Sin etapa</option>
        {ETAPAS_ASIGNABLES.map((etapa) => (
          <option key={etapa} value={etapa}>{ETIQUETA_ETAPA[etapa]}</option>
        ))}
      </select>
      <div className="flex items-center gap-1.5">
        <Switch checked={form.activo} onCheckedChange={(v) => setForm((p) => ({ ...p, activo: v }))} />
        <span className="text-xs text-brand-brown/70">Activo</span>
      </div>
      <Button size="sm" onClick={guardar}><Save className="w-4 h-4" /></Button>
      <Button size="sm" variant="outline" onClick={() => { setEditId(null); setCreating(false); }}><X className="w-4 h-4" /></Button>
    </div>
  );

  return (
    <SectionCard title="Potreros" subtitle="Unidad donde vive el inventario de cabezas — lote y etapa productiva">
      <div className="space-y-2">
        {potreros.map((p) =>
          editId === p.id ? (
            <div key={p.id}>{formRow}</div>
          ) : (
            <div key={p.id} className={`flex items-center justify-between rounded-lg border border-primary/10 px-3 py-2 ${!p.activo ? 'opacity-50' : ''}`}>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                <span className="font-medium">{p.nombre}</span>
                <span className="text-brand-brown/60">{fincaNombre(p.finca_id)}</span>
                <span className="text-brand-brown/50 text-xs">{loteNombre(p.lote_id) || 'Sin lote'}</span>
                <span className={`text-xs ${p.etapa ? 'text-brand-brown/70' : 'italic text-brand-brown/40'}`}>
                  {p.etapa ? ETIQUETA_ETAPA[p.etapa] : 'Sin clasificar'}
                </span>
                {!p.activo && <span className="text-xs rounded-full bg-gray-100 px-2 py-0.5">Inactivo</span>}
              </div>
              {canWrite && (
                <Button size="sm" variant="ghost" onClick={() => iniciar(p)}>
                  <Pencil className="w-4 h-4" />
                </Button>
              )}
            </div>
          )
        )}
        {canWrite && (creating ? formRow : (
          <Button variant="outline" size="sm" onClick={() => iniciar()}>
            <Plus className="w-4 h-4 mr-1.5" />
            Nuevo potrero
          </Button>
        ))}
      </div>
    </SectionCard>
  );
}
