import { useState, useEffect } from 'react';
import { Card } from '../ui/card';
import { Button } from '../ui/button';
import { Label } from '../ui/label';
import { Input } from '../ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '../ui/dialog';
import { ConfirmDialog } from '../ui/confirm-dialog';
import { toast } from 'sonner';
import { useAuth } from '../../contexts/AuthContext';
import { getSupabase } from '../../utils/supabase/client';
import { formatearFechaHora } from '../../utils/fechas';
import { Send, Plus, Edit, RotateCcw, Trash2, Copy, CheckCircle2, Clock, AlertTriangle, User } from 'lucide-react';
import {
  TELEGRAM_MODULES,
  ROLES_BOT,
  generarCodigoVinculacion,
  calcularExpiracion,
  getEstadoVinculacion,
  validarNuevoUsuario,
  toggleModulo,
  type TelegramUsuarioRow,
  type RolBot,
  type EstadoVinculacion,
} from '../../utils/telegramUsuarios';

interface UsuarioOption {
  id: string;
  nombre_completo: string | null;
  email: string;
  rol: string;
}

export function TelegramConfig() {
  const { profile } = useAuth();
  const [usuarios, setUsuarios] = useState<TelegramUsuarioRow[]>([]);
  const [usuariosSistema, setUsuariosSistema] = useState<UsuarioOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);

  // Modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<'crear' | 'editar'>('crear');
  const [usuarioActual, setUsuarioActual] = useState<TelegramUsuarioRow | null>(null);
  const [codigoModal, setCodigoModal] = useState<{ codigo: string; nombre: string } | null>(null);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [usuarioParaEliminar, setUsuarioParaEliminar] = useState<TelegramUsuarioRow | null>(null);

  // Form fields
  const [nombreDisplay, setNombreDisplay] = useState('');
  const [rolBot, setRolBot] = useState<RolBot>('campo');
  const [modulosPermitidos, setModulosPermitidos] = useState<string[]>(['labores']);
  const [usuarioVinculadoId, setUsuarioVinculadoId] = useState<string | null>(null);

  useEffect(() => {
    if (profile && profile.rol !== 'Gerencia') {
      toast.error('No tienes permisos para acceder a esta sección');
      return;
    }
    cargarUsuarios();
    cargarUsuariosSistema();
  }, [profile]);

  const cargarUsuarios = async () => {
    try {
      setLoading(true);
      const supabase = getSupabase();
      const { data, error } = await supabase
        .from('telegram_usuarios')
        .select('*')
        .order('nombre_display', { ascending: true });

      if (error) throw error;
      setUsuarios((data ?? []) as TelegramUsuarioRow[]);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error desconocido';
      toast.error('Error al cargar usuarios: ' + msg);
    } finally {
      setLoading(false);
    }
  };

  const cargarUsuariosSistema = async () => {
    try {
      const supabase = getSupabase();
      const { data, error } = await supabase
        .from('usuarios')
        .select('id, nombre_completo, email, rol')
        .eq('activo', true)
        .order('nombre_completo', { ascending: true });

      if (error) throw error;
      setUsuariosSistema((data ?? []) as UsuarioOption[]);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error desconocido';
      console.error('Error al cargar usuarios del sistema:', msg);
    }
  };

  // ---- Modal open helpers ----

  const abrirModalCrear = () => {
    setModalMode('crear');
    setUsuarioActual(null);
    setNombreDisplay('');
    setRolBot('campo');
    setModulosPermitidos(['labores']);
    setUsuarioVinculadoId(null);
    setModalOpen(true);
  };

  const abrirModalEditar = (usuario: TelegramUsuarioRow) => {
    setModalMode('editar');
    setUsuarioActual(usuario);
    setNombreDisplay(usuario.nombre_display);
    setRolBot(usuario.rol_bot);
    setModulosPermitidos([...(usuario.modulos_permitidos ?? [])]);
    setUsuarioVinculadoId(usuario.usuario_id);
    setModalOpen(true);
  };

  // ---- Form submit ----

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const validation = validarNuevoUsuario({
      nombre_display: nombreDisplay,
      rol_bot: rolBot,
      modulos_permitidos: modulosPermitidos,
    });
    if (!validation.valid) {
      toast.error(validation.error!);
      return;
    }

    try {
      setSavingId('modal');
      const supabase = getSupabase();

      if (modalMode === 'crear') {
        const codigo = generarCodigoVinculacion();
        const expira = calcularExpiracion();

        const { error } = await supabase
          .from('telegram_usuarios')
          .insert({
            nombre_display: nombreDisplay.trim(),
            rol_bot: rolBot,
            modulos_permitidos: modulosPermitidos,
            usuario_id: usuarioVinculadoId,
            codigo_vinculacion: codigo,
            codigo_expira_at: expira,
            activo: true,
          });

        if (error) throw error;
        setModalOpen(false);
        setCodigoModal({ codigo, nombre: nombreDisplay });
      } else if (usuarioActual) {
        const { error } = await supabase
          .from('telegram_usuarios')
          .update({
            nombre_display: nombreDisplay.trim(),
            rol_bot: rolBot,
            modulos_permitidos: modulosPermitidos,
            usuario_id: usuarioVinculadoId,
          })
          .eq('id', usuarioActual.id);

        if (error) throw error;
        setModalOpen(false);
        toast.success('Usuario actualizado');
      }

      await cargarUsuarios();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error desconocido';
      toast.error('Error al guardar: ' + msg);
    } finally {
      setSavingId(null);
    }
  };

  // ---- Row actions ----

  const regenerarCodigo = async (usuario: TelegramUsuarioRow) => {
    try {
      setSavingId(usuario.id);
      const codigo = generarCodigoVinculacion();
      const expira = calcularExpiracion();

      const supabase = getSupabase();
      const { error } = await supabase
        .from('telegram_usuarios')
        .update({ codigo_vinculacion: codigo, codigo_expira_at: expira })
        .eq('id', usuario.id);

      if (error) throw error;
      setCodigoModal({ codigo, nombre: usuario.nombre_display });
      await cargarUsuarios();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error desconocido';
      toast.error('Error al generar código: ' + msg);
    } finally {
      setSavingId(null);
    }
  };

  const toggleActivo = async (usuario: TelegramUsuarioRow) => {
    try {
      setSavingId(usuario.id);
      const supabase = getSupabase();
      const { error } = await supabase
        .from('telegram_usuarios')
        .update({ activo: !usuario.activo })
        .eq('id', usuario.id);

      if (error) throw error;
      toast.success(usuario.activo ? 'Usuario desactivado' : 'Usuario activado');
      await cargarUsuarios();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error desconocido';
      toast.error('Error: ' + msg);
    } finally {
      setSavingId(null);
    }
  };

  const eliminarUsuario = async () => {
    if (!usuarioParaEliminar) return;
    try {
      setSavingId(usuarioParaEliminar.id);
      const supabase = getSupabase();
      const { error } = await supabase
        .from('telegram_usuarios')
        .delete()
        .eq('id', usuarioParaEliminar.id);

      if (error) throw error;
      setConfirmDeleteOpen(false);
      setUsuarioParaEliminar(null);
      toast.success('Usuario eliminado');
      await cargarUsuarios();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error desconocido';
      toast.error('Error: ' + msg);
    } finally {
      setSavingId(null);
    }
  };

  const copiarCodigo = (codigo: string) => {
    navigator.clipboard.writeText(`/start ${codigo}`);
    toast.success('Código copiado al portapapeles');
  };

  // ---- Badge rendering ----

  function renderEstado(usuario: TelegramUsuarioRow) {
    const estado: EstadoVinculacion = getEstadoVinculacion(usuario);

    switch (estado) {
      case 'vinculado':
        return (
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-green-600" />
            <span className="text-green-600">
              Vinculado{usuario.telegram_username ? ` (@${usuario.telegram_username})` : ''}
            </span>
          </div>
        );
      case 'pendiente':
        return (
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-amber-600" />
            <span className="text-amber-600">
              Pendiente (vence {formatearFechaHora(usuario.codigo_expira_at)})
            </span>
          </div>
        );
      case 'expirado':
        return (
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-red-600" />
            <span className="text-red-600">Código expirado</span>
          </div>
        );
      case 'sin_codigo':
        return (
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-gray-400" />
            <span className="text-gray-400">Sin código</span>
          </div>
        );
    }
  }

  // ---- Render ----

  if (loading) {
    return <div className="text-center py-8">Cargando...</div>;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
            <Send className="w-5 h-5" /> Bot de Telegram
          </h2>
          <p className="text-sm text-brand-brown/70 mt-1">
            Gestiona el acceso de trabajadores de campo al bot de Telegram
          </p>
        </div>
        <Button onClick={abrirModalCrear} className="flex items-center gap-2">
          <Plus className="w-4 h-4" />
          Nuevo usuario
        </Button>
      </div>

      {/* User table */}
      <Card className="p-0 overflow-hidden">
        {usuarios.length === 0 ? (
          <div className="p-8 text-center text-brand-brown/60">
            No hay usuarios del bot configurados aún. Crea el primero.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-secondary/30 bg-secondary/5">
                  <th className="px-4 py-3 text-left text-sm font-medium text-foreground">Nombre</th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-foreground">Rol</th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-foreground">Módulos</th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-foreground">Estado</th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-foreground">Activo</th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-foreground">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-secondary/30">
                {usuarios.map((usuario) => (
                  <tr key={usuario.id} className="hover:bg-secondary/5 transition">
                    <td className="px-4 py-3 text-sm font-medium text-foreground">
                      <div>{usuario.nombre_display}</div>
                      {usuario.usuario_id && (
                        <div className="flex items-center gap-1 text-xs text-brand-brown/50 mt-0.5">
                          <User className="w-3 h-3" />
                          {usuariosSistema.find((u) => u.id === usuario.usuario_id)?.nombre_completo ?? 'Usuario vinculado'}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm text-brand-brown/70 capitalize">{usuario.rol_bot}</td>
                    <td className="px-4 py-3 text-sm text-brand-brown/70">
                      <div className="flex flex-wrap gap-1">
                        {(usuario.modulos_permitidos ?? []).map((mod) => {
                          const modDef = TELEGRAM_MODULES.find((m) => m.key === mod);
                          return (
                            <span
                              key={mod}
                              className={`inline-block px-2 py-0.5 rounded text-xs ${
                                modDef?.sensitive
                                  ? 'bg-amber-100 text-amber-700 border border-amber-300'
                                  : 'bg-primary/10 text-primary'
                              }`}
                            >
                              {modDef?.label ?? mod}
                            </span>
                          );
                        })}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm">{renderEstado(usuario)}</td>
                    <td className="px-4 py-3 text-sm">
                      <button
                        onClick={() => toggleActivo(usuario)}
                        disabled={savingId === usuario.id}
                        className={`px-3 py-1 rounded text-xs font-medium transition ${
                          usuario.activo
                            ? 'bg-green-100 text-green-700 hover:bg-green-200'
                            : 'bg-red-100 text-red-700 hover:bg-red-200'
                        } disabled:opacity-50`}
                      >
                        {usuario.activo ? 'Activo' : 'Inactivo'}
                      </button>
                    </td>
                    <td className="px-4 py-3 text-sm">
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => abrirModalEditar(usuario)}
                          disabled={savingId === usuario.id}
                          className="flex items-center gap-1"
                        >
                          <Edit className="w-3 h-3" />
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => regenerarCodigo(usuario)}
                          disabled={savingId === usuario.id}
                          className="flex items-center gap-1"
                        >
                          <RotateCcw className="w-3 h-3" />
                          Código
                        </Button>
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={() => {
                            setUsuarioParaEliminar(usuario);
                            setConfirmDeleteOpen(true);
                          }}
                          disabled={savingId === usuario.id}
                          className="flex items-center gap-1"
                          aria-label="Eliminar usuario"
                        >
                          <Trash2 className="w-3 h-3" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Modal: Create / Edit user */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent size="sm">
          <DialogHeader>
            <DialogTitle>
              {modalMode === 'crear' ? 'Crear usuario del bot' : 'Editar usuario del bot'}
            </DialogTitle>
            <DialogDescription>
              {modalMode === 'crear'
                ? 'Genera un código de acceso que compartirás con el usuario para vincular su cuenta de Telegram.'
                : 'Modifica el nombre, rol o módulos permitidos del usuario.'}
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Usuario vinculado */}
            <div>
              <Label htmlFor="usuario-vinculado">Usuario vinculado</Label>
              <select
                id="usuario-vinculado"
                value={usuarioVinculadoId ?? ''}
                onChange={(e) => {
                  const id = e.target.value || null;
                  setUsuarioVinculadoId(id);
                  if (id) {
                    const usr = usuariosSistema.find((u) => u.id === id);
                    if (usr?.nombre_completo) setNombreDisplay(usr.nombre_completo);
                  }
                }}
                className="w-full mt-1 px-3 py-2 border border-secondary/30 rounded-lg bg-white text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
              >
                <option value="">— Sin vincular —</option>
                {usuariosSistema.map((usr) => (
                  <option key={usr.id} value={usr.id}>
                    {usr.nombre_completo ?? usr.email} ({usr.rol})
                  </option>
                ))}
              </select>
              <p className="text-xs text-brand-brown/50 mt-1">
                Seleccionar un usuario auto-completa el nombre.
              </p>
            </div>

            {/* Nombre */}
            <div>
              <Label htmlFor="nombre">Nombre completo *</Label>
              <Input
                id="nombre"
                placeholder="Ej: Carlos Mendoza"
                value={nombreDisplay}
                onChange={(e) => setNombreDisplay(e.target.value)}
                className="mt-1"
              />
            </div>

            {/* Rol */}
            <div>
              <Label htmlFor="rol">Rol en el bot</Label>
              <select
                id="rol"
                value={rolBot}
                onChange={(e) => {
                  const val = e.target.value;
                  if (ROLES_BOT.some((r) => r.key === val)) {
                    setRolBot(val as RolBot);
                  }
                }}
                className="w-full mt-1 px-3 py-2 border border-secondary/30 rounded-lg bg-white text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
              >
                {ROLES_BOT.map((r) => (
                  <option key={r.key} value={r.key}>{r.label}</option>
                ))}
              </select>
            </div>

            {/* Modules */}
            <div>
              <Label>Módulos permitidos</Label>
              <div className="mt-2 space-y-2">
                {TELEGRAM_MODULES.map((mod) => (
                  <label
                    key={mod.key}
                    className={`flex items-start gap-2 p-2 rounded-lg border transition ${
                      mod.sensitive
                        ? 'border-amber-200 bg-amber-50/50'
                        : 'border-transparent'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={modulosPermitidos.includes(mod.key)}
                      onChange={() => setModulosPermitidos(toggleModulo(modulosPermitidos, mod.key))}
                      className="w-4 h-4 mt-0.5 rounded border-secondary/30"
                    />
                    <div>
                      <span className={`text-sm font-medium ${mod.sensitive ? 'text-amber-700' : 'text-foreground'}`}>
                        {mod.label}
                      </span>
                      <p className={`text-xs ${mod.sensitive ? 'text-amber-600' : 'text-brand-brown/60'}`}>
                        {mod.description}
                      </p>
                    </div>
                  </label>
                ))}
              </div>
            </div>

            {/* Buttons */}
            <div className="flex gap-3 pt-4">
              <Button type="button" variant="outline" onClick={() => setModalOpen(false)} className="flex-1">
                Cancelar
              </Button>
              <Button type="submit" disabled={savingId === 'modal'} className="flex-1">
                {savingId === 'modal'
                  ? 'Guardando...'
                  : modalMode === 'crear'
                    ? 'Crear usuario'
                    : 'Guardar cambios'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Modal: Show access code */}
      <Dialog open={!!codigoModal} onOpenChange={() => setCodigoModal(null)}>
        <DialogContent size="sm">
          <DialogHeader>
            <DialogTitle>Código de acceso generado</DialogTitle>
            <DialogDescription>
              Comparte este código con {codigoModal?.nombre} para que vincule su cuenta de Telegram.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="bg-secondary/10 p-4 rounded-lg border-2 border-primary">
              <p className="text-xs text-brand-brown/70 mb-2">Enviar este mensaje al bot:</p>
              <div className="flex items-center gap-2">
                <code className="flex-1 bg-white px-3 py-2 rounded font-mono text-sm font-semibold text-primary">
                  /start {codigoModal?.codigo}
                </code>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => copiarCodigo(codigoModal?.codigo || '')}
                  className="flex items-center gap-1"
                >
                  <Copy className="w-4 h-4" />
                </Button>
              </div>
            </div>

            <div className="bg-amber-50 p-3 rounded border border-amber-200 text-xs text-amber-800">
              <p>
                <strong>Válido por 7 días.</strong> Después de ese tiempo, deberás generar un nuevo código.
              </p>
            </div>

            <Button onClick={() => setCodigoModal(null)} className="w-full">
              Listo
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Confirm: Delete user */}
      <ConfirmDialog
        open={confirmDeleteOpen}
        onOpenChange={setConfirmDeleteOpen}
        title="Eliminar usuario del bot"
        description={`¿Estás seguro de que deseas eliminar a ${usuarioParaEliminar?.nombre_display}?${
          usuarioParaEliminar?.telegram_id ? ' Nota: Ya está vinculado a Telegram.' : ''
        }`}
        confirmLabel="Eliminar"
        cancelLabel="Cancelar"
        onConfirm={eliminarUsuario}
        destructive
      />
    </div>
  );
}
