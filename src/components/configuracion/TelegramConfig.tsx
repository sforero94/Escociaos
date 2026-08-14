import { useState, useEffect, useMemo } from 'react';
import { Card } from '../ui/card';
import { Button } from '../ui/button';
import { Label } from '../ui/label';
import { Input } from '../ui/input';
import { Checkbox } from '../ui/checkbox';
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '../ui/dialog';
import { ConfirmDialog } from '../ui/confirm-dialog';
import { toast } from 'sonner';
import { useAuth } from '../../contexts/AuthContext';
import { getSupabase } from '../../utils/supabase/client';
import { formatearFechaHora } from '../../utils/fechas';
import { Send, Plus, Edit, RotateCcw, Trash2, Copy, CheckCircle2, Clock, AlertTriangle, User, Bell } from 'lucide-react';
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
import {
  agruparAlertasPorModulo,
  construirEstadoDesdeSuscripciones,
  alternarRecibe,
  alternarEscalamiento,
  construirFilasParaGuardar,
  contarSuscripcionesUsuario,
  formatearResumenAlertas,
  type AlertaCatalogoRow,
  type AlertaSuscripcionRow,
  type SuscripcionEstado,
} from '../../utils/telegramAlertas';

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
  const [alertasEstado, setAlertasEstado] = useState<SuscripcionEstado>({});

  // Catálogo de alertas (alertas_catalogo / telegram_alertas_suscripciones):
  // tablas nuevas que puede que aún no existan en producción. Se degradan a
  // "no disponible" en vez de romper el resto de la pantalla.
  const [catalogoAlertas, setCatalogoAlertas] = useState<AlertaCatalogoRow[]>([]);
  const [catalogoAlertasError, setCatalogoAlertasError] = useState(false);
  const [todasSuscripciones, setTodasSuscripciones] = useState<AlertaSuscripcionRow[]>([]);

  const gruposAlertas = useMemo(() => agruparAlertasPorModulo(catalogoAlertas), [catalogoAlertas]);

  useEffect(() => {
    if (profile && profile.rol !== 'Gerencia') {
      toast.error('No tienes permisos para acceder a esta sección');
      return;
    }
    cargarUsuarios();
    cargarUsuariosSistema();
    cargarCatalogoAlertas();
    cargarSuscripciones();
  }, [profile]);

  // Corrige una carrera de carga: `cargarUsuarios`/`cargarSuscripciones` se
  // disparan en paralelo al montar, así que si alguien abre "Editar" antes de
  // que las suscripciones hayan llegado, `abrirModalEditar` habría sembrado
  // el modal con casillas en falso -- y guardar así persiste "sin alertas"
  // por encima de lo que el usuario sí tenía. Re-sincroniza en cuanto llegan,
  // sin pisar ediciones en curso del usuario (solo corre cuando cambia el
  // array de suscripciones, no en cada toggle de casilla).
  useEffect(() => {
    if (modalOpen && modalMode === 'editar' && usuarioActual) {
      setAlertasEstado(
        construirEstadoDesdeSuscripciones(
          todasSuscripciones.filter((s) => s.telegram_usuario_id === usuarioActual.id),
        ),
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [todasSuscripciones]);

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

  // `alertas_catalogo`/`telegram_alertas_suscripciones` todavía no están en
  // `src/types/database.ts` generado (tablas nuevas) -- mismo cast puntual
  // que ya usan los hooks de hato/ganado (`getSupabase() as any`), nunca
  // sobre el resto del archivo.
  const cargarCatalogoAlertas = async () => {
    try {
      const supabase = getSupabase() as any;
      const { data, error } = await supabase
        .from('alertas_catalogo')
        .select('*')
        .eq('activo', true)
        .order('orden', { ascending: true });

      if (error) throw error;
      setCatalogoAlertas((data ?? []) as AlertaCatalogoRow[]);
      setCatalogoAlertasError(false);
    } catch (err: unknown) {
      // Secundario: la tabla puede no existir todavía en este entorno. La
      // sección de Alertas se degrada a un mensaje explícito, nunca a una
      // pantalla en blanco ni a una lista fantasma.
      const msg = err instanceof Error ? err.message : 'Error desconocido';
      console.error('Error al cargar catálogo de alertas:', msg);
      setCatalogoAlertas([]);
      setCatalogoAlertasError(true);
    }
  };

  const cargarSuscripciones = async () => {
    try {
      const supabase = getSupabase() as any;
      const { data, error } = await supabase
        .from('telegram_alertas_suscripciones')
        .select('*');

      if (error) throw error;
      setTodasSuscripciones((data ?? []) as AlertaSuscripcionRow[]);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error desconocido';
      console.error('Error al cargar suscripciones de alertas:', msg);
      setTodasSuscripciones([]);
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
    setAlertasEstado({});
    setModalOpen(true);
  };

  const abrirModalEditar = (usuario: TelegramUsuarioRow) => {
    setModalMode('editar');
    setUsuarioActual(usuario);
    setNombreDisplay(usuario.nombre_display);
    setRolBot(usuario.rol_bot);
    setModulosPermitidos([...(usuario.modulos_permitidos ?? [])]);
    setUsuarioVinculadoId(usuario.usuario_id);
    setAlertasEstado(
      construirEstadoDesdeSuscripciones(
        todasSuscripciones.filter((s) => s.telegram_usuario_id === usuario.id),
      ),
    );
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

        const { data: creado, error } = await supabase
          .from('telegram_usuarios')
          .insert({
            nombre_display: nombreDisplay.trim(),
            rol_bot: rolBot,
            modulos_permitidos: modulosPermitidos,
            usuario_id: usuarioVinculadoId,
            codigo_vinculacion: codigo,
            codigo_expira_at: expira,
            activo: true,
          })
          .select('id')
          .single();

        if (error) throw error;
        if (creado?.id) await guardarSuscripcionesAlertas(creado.id);
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
        await guardarSuscripcionesAlertas(usuarioActual.id);
        setModalOpen(false);
        toast.success('Usuario actualizado');
      }

      await cargarUsuarios();
      await cargarSuscripciones();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error desconocido';
      toast.error('Error al guardar: ' + msg);
    } finally {
      setSavingId(null);
    }
  };

  // Un solo upsert por (telegram_usuario_id, alerta_clave) -- se guarda junto
  // con el resto del formulario, nunca por casilla. Si el catálogo está
  // vacío o falló al cargar no hay nada que guardar. Un fallo aquí no debe
  // tumbar el guardado del usuario, que ya se confirmó -- se avisa aparte.
  const guardarSuscripcionesAlertas = async (usuarioId: string) => {
    if (catalogoAlertas.length === 0) return;
    try {
      const filas = construirFilasParaGuardar(usuarioId, alertasEstado, catalogoAlertas);
      // `updated_by` (migración 096) no tiene trigger que lo llene -- a
      // diferencia del patrón `created_by` de 040/050/063/074, acá se
      // espera que quien escribe lo declare.
      const filasConAutor = filas.map((f) => ({ ...f, updated_by: profile?.id ?? null }));
      const supabase = getSupabase() as any;
      const { error } = await supabase
        .from('telegram_alertas_suscripciones')
        .upsert(filasConAutor, { onConflict: 'telegram_usuario_id,alerta_clave' });

      if (error) throw error;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error desconocido';
      toast.error('Usuario guardado, pero no se pudieron guardar sus alertas: ' + msg);
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

  // Mismo estilo compacto que los chips de "Módulos permitidos" de arriba.
  function renderAlertasIndicador(usuario: TelegramUsuarioRow) {
    if (catalogoAlertasError) {
      return <span className="text-xs text-brand-brown/40">—</span>;
    }
    const resumen = contarSuscripcionesUsuario(todasSuscripciones, usuario.id);
    const activo = resumen.recibe > 0 || resumen.escalamiento > 0;
    return (
      <span
        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs ${
          activo ? 'bg-primary/10 text-primary' : 'bg-secondary/10 text-brand-brown/50'
        }`}
      >
        <Bell className="w-3 h-3" />
        {formatearResumenAlertas(resumen)}
      </span>
    );
  }

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
                  <th className="px-4 py-3 text-left text-sm font-medium text-foreground">Alertas</th>
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
                    <td className="px-4 py-3 text-sm">{renderAlertasIndicador(usuario)}</td>
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

          <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0 gap-4">
            <DialogBody className="space-y-4">
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

              {/* Alertas -- catálogo dinámico (alertas_catalogo), agrupado por
                  módulo. Hoy solo hay filas de `hato`; `aguacate`/`ganado`
                  aparecerán solos cuando existan, sin tocar este código. */}
              <div>
                <Label>Alertas</Label>
                {catalogoAlertasError ? (
                  <p className="text-xs text-destructive mt-2">
                    No se pudo cargar el catálogo de alertas. Intenta de nuevo más tarde.
                  </p>
                ) : gruposAlertas.length === 0 ? (
                  <p className="text-xs text-brand-brown/60 mt-2">
                    Todavía no hay alertas configuradas.
                  </p>
                ) : (
                  <div className="mt-2 space-y-4">
                    {gruposAlertas.map((grupo) => (
                      <div key={grupo.modulo}>
                        <p className="text-xs font-semibold text-brand-brown/70 uppercase tracking-wide mb-1.5">
                          {grupo.label}
                        </p>
                        <div className="rounded-lg border border-secondary/30 divide-y divide-secondary/20">
                          {grupo.alertas.map((alerta) => {
                            const estado = alertasEstado[alerta.clave] ?? { recibe: false, escalamiento: false };
                            return (
                              <div key={alerta.clave} className="flex items-start justify-between gap-3 p-2.5">
                                <div className="min-w-0">
                                  <p className="text-sm font-medium text-foreground">{alerta.nombre}</p>
                                  {alerta.descripcion && (
                                    <p className="text-xs text-brand-brown/60 mt-0.5">{alerta.descripcion}</p>
                                  )}
                                </div>
                                <div className="flex flex-shrink-0 gap-4">
                                  <label className="flex flex-col items-center gap-1 text-xs text-brand-brown/70">
                                    <Checkbox
                                      checked={estado.recibe}
                                      onCheckedChange={() =>
                                        setAlertasEstado((prev) => alternarRecibe(prev, alerta.clave))
                                      }
                                    />
                                    Recibe
                                  </label>
                                  <label className="flex flex-col items-center gap-1 text-xs text-brand-brown/70">
                                    <Checkbox
                                      checked={estado.escalamiento}
                                      onCheckedChange={() =>
                                        setAlertasEstado((prev) => alternarEscalamiento(prev, alerta.clave))
                                      }
                                    />
                                    Escalamiento
                                  </label>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

            </DialogBody>

            <DialogFooter className="gap-3">
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
            </DialogFooter>
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

          <DialogBody className="space-y-4">
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

          </DialogBody>

          <DialogFooter>
            <Button onClick={() => setCodigoModal(null)} className="w-full">
              Listo
            </Button>
          </DialogFooter>
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
