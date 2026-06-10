import { useState, useEffect, useCallback } from 'react';
import { getSupabase } from '@/utils/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Pencil, Plus, Save, X } from 'lucide-react';
import { toast } from 'sonner';
import { formatNumber } from '@/utils/format';
import type { GanUbicacion, GanFinca, GanPotrero } from '@/types/ganado';

const selectClass = 'px-2 py-1.5 text-sm border border-gray-200 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-primary/20';

/**
 * CRUD de la jerarquía del inventario de ganado:
 * ubicaciones → fincas (con hectáreas) → potreros.
 * Sin borrado físico — fincas y potreros se desactivan para preservar
 * el historial de movimientos.
 */
export function GanadoConfig() {
  const supabase = getSupabase() as any;

  const [ubicaciones, setUbicaciones] = useState<GanUbicacion[]>([]);
  const [fincas, setFincas] = useState<GanFinca[]>([]);
  const [potreros, setPotreros] = useState<GanPotrero[]>([]);

  const cargar = useCallback(async () => {
    const [u, f, p] = await Promise.all([
      supabase.from('gan_ubicaciones').select('id, nombre').order('nombre'),
      supabase.from('gan_fincas').select('id, nombre, ubicacion_id, hectareas, activa').order('nombre'),
      supabase.from('gan_potreros').select('id, nombre, finca_id, activo').order('nombre'),
    ]);
    setUbicaciones((u.data || []) as GanUbicacion[]);
    setFincas(((f.data || []) as any[]).map((x) => ({ ...x, hectareas: Number(x.hectareas) || 0 })) as GanFinca[]);
    setPotreros((p.data || []) as GanPotrero[]);
  }, []);

  useEffect(() => {
    cargar();
  }, [cargar]);

  return (
    <div className="space-y-6">
      <UbicacionesSection ubicaciones={ubicaciones} onChanged={cargar} />
      <FincasSection fincas={fincas} ubicaciones={ubicaciones} onChanged={cargar} />
      <PotrerosSection potreros={potreros} fincas={fincas} onChanged={cargar} />
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

function UbicacionesSection({ ubicaciones, onChanged }: { ubicaciones: GanUbicacion[]; onChanged: () => void }) {
  const supabase = getSupabase() as any;
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
              <Button size="sm" variant="ghost" onClick={() => { setEditId(u.id); setCreating(false); setNombre(u.nombre); }}>
                <Pencil className="w-4 h-4" />
              </Button>
            </div>
          )
        )}
        {creating ? (
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
        )}
      </div>
    </SectionCard>
  );
}

function FincasSection({ fincas, ubicaciones, onChanged }: { fincas: GanFinca[]; ubicaciones: GanUbicacion[]; onChanged: () => void }) {
  const supabase = getSupabase() as any;
  const [editId, setEditId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ nombre: '', ubicacion_id: '', hectareas: '', activa: true });

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
    onChanged();
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
        {fincas.map((f) =>
          editId === f.id ? (
            <div key={f.id}>{formRow}</div>
          ) : (
            <div key={f.id} className={`flex items-center justify-between rounded-lg border border-primary/10 px-3 py-2 ${!f.activa ? 'opacity-50' : ''}`}>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                <span className="font-medium">{f.nombre}</span>
                <span className="text-brand-brown/60">{ubicaciones.find((u) => u.id === f.ubicacion_id)?.nombre || 'Sin ubicación'}</span>
                <span className="text-brand-brown/60">{formatNumber(f.hectareas, 1)} ha</span>
                {!f.activa && <span className="text-xs rounded-full bg-gray-100 px-2 py-0.5">Inactiva</span>}
              </div>
              <Button size="sm" variant="ghost" onClick={() => iniciar(f)}>
                <Pencil className="w-4 h-4" />
              </Button>
            </div>
          )
        )}
        {creating ? formRow : (
          <Button variant="outline" size="sm" onClick={() => iniciar()}>
            <Plus className="w-4 h-4 mr-1.5" />
            Nueva finca
          </Button>
        )}
      </div>
    </SectionCard>
  );
}

function PotrerosSection({ potreros, fincas, onChanged }: { potreros: GanPotrero[]; fincas: GanFinca[]; onChanged: () => void }) {
  const supabase = getSupabase() as any;
  const [editId, setEditId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ nombre: '', finca_id: '', activo: true });

  const iniciar = (p?: GanPotrero) => {
    if (p) {
      setEditId(p.id);
      setCreating(false);
      setForm({ nombre: p.nombre, finca_id: p.finca_id, activo: p.activo });
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
      <Input value={form.nombre} onChange={(e) => setForm((p) => ({ ...p, nombre: e.target.value }))} placeholder="Nombre..." className="w-44" />
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
    <SectionCard title="Potreros" subtitle="Unidad donde vive el inventario de cabezas">
      <div className="space-y-2">
        {potreros.map((p) =>
          editId === p.id ? (
            <div key={p.id}>{formRow}</div>
          ) : (
            <div key={p.id} className={`flex items-center justify-between rounded-lg border border-primary/10 px-3 py-2 ${!p.activo ? 'opacity-50' : ''}`}>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                <span className="font-medium">{p.nombre}</span>
                <span className="text-brand-brown/60">{fincas.find((f) => f.id === p.finca_id)?.nombre || '-'}</span>
                {!p.activo && <span className="text-xs rounded-full bg-gray-100 px-2 py-0.5">Inactivo</span>}
              </div>
              <Button size="sm" variant="ghost" onClick={() => iniciar(p)}>
                <Pencil className="w-4 h-4" />
              </Button>
            </div>
          )
        )}
        {creating ? formRow : (
          <Button variant="outline" size="sm" onClick={() => iniciar()}>
            <Plus className="w-4 h-4 mr-1.5" />
            Nuevo potrero
          </Button>
        )}
      </div>
    </SectionCard>
  );
}
