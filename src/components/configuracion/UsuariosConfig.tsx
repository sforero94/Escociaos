import { useState, useEffect } from 'react';
import { Card } from '../ui/card';
import { Button } from '../ui/button';
import { Label } from '../ui/label';
import { Input } from '../ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '../ui/dialog';
import { toast } from 'sonner@2.0.3';
import { useAuth } from '../../contexts/AuthContext';
import { getSupabase } from '../../utils/supabase/client';
import { projectId, publicAnonKey } from '../../utils/supabase/info';
import { Users, Plus, Edit, Trash2, Eye, EyeOff, Shield, CheckCircle2, XCircle } from 'lucide-react';

interface Usuario {
  id: string;
  email: string;
  nombre_completo: string | null;
  rol: 'Administrador' | 'Verificador' | 'Gerencia';
  activo: boolean;
  created_at?: string;
  last_login?: string;
}

export function UsuariosConfig() {
  const { profile } = useAuth();
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<'crear' | 'editar'>('crear');
  const [usuarioActual, setUsuarioActual] = useState<Usuario | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  
  // Form fields
  const [nombreCompleto, setNombreCompleto] = useState('');
  const [email, setEmail] = useState('');
  const [rol, setRol] = useState<'Administrador' | 'Verificador' | 'Gerencia'>('Administrador');
  const [clave, setClave] = useState('');
  const [activo, setActivo] = useState(true);

  // Verificar que solo Gerencia puede acceder
  useEffect(() => {
    if (profile && profile.rol !== 'Gerencia') {
      toast.error('No tienes permisos para acceder a esta sección');
      return;
    }
    cargarUsuarios();
  }, [profile]);

  const cargarUsuarios = async () => {
    try {
      setLoading(true);
      const supabase = getSupabase();
      const { data, error } = await supabase
        .from('usuarios')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setUsuarios(data || []);
    } catch (error: any) {
      toast.error('Error al cargar usuarios: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const abrirModalCrear = () => {
    setModalMode('crear');
    setUsuarioActual(null);
    setNombreCompleto('');
    setEmail('');
    setRol('Administrador');
    setClave('');
    setActivo(true);
    setModalOpen(true);
  };

  const abrirModalEditar = (usuario: Usuario) => {
    setModalMode('editar');
    setUsuarioActual(usuario);
    setNombreCompleto(usuario.nombre_completo || '');
    setEmail(usuario.email);
    setRol(usuario.rol);
    setClave('');
    setActivo(usuario.activo);
    setModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Validaciones
    if (!nombreCompleto.trim()) {
      toast.error('El nombre completo es obligatorio');
      return;
    }
    if (!email.trim()) {
      toast.error('El email es obligatorio');
      return;
    }
    if (modalMode === 'crear' && !clave) {
      toast.error('La clave es obligatoria para crear usuario');
      return;
    }

    try {
      const url = `https://${projectId}.supabase.co/functions/v1/make-server-1ccce916/usuarios/${modalMode === 'crear' ? 'crear' : 'editar'}`;
      
      const body: any = {
        email,
        nombre_completo: nombreCompleto,
        rol,
        activo,
      };

      if (modalMode === 'editar' && usuarioActual) {
        body.id = usuarioActual.id;
      }

      // Solo incluir clave si se proporcionó
      if (clave) {
        body.password = clave;
      }

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${publicAnonKey}`,
        },
        body: JSON.stringify(body),
      });

      const result = await response.json();

      if (!result.success) {
        throw new Error(result.error || 'Error al guardar usuario');
      }

      toast.success(
        modalMode === 'crear' 
          ? 'Usuario creado exitosamente' 
          : 'Usuario actualizado exitosamente'
      );
      
      setModalOpen(false);
      cargarUsuarios();
    } catch (error: any) {
      toast.error(error.message);
    }
  };

  const eliminarUsuario = async (usuario: Usuario) => {
    if (!confirm(`¿Estás seguro de eliminar al usuario ${usuario.nombre_completo || usuario.email}?`)) {
      return;
    }

    try {
      const url = `https://${projectId}.supabase.co/functions/v1/make-server-1ccce916/usuarios/eliminar`;
      
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${publicAnonKey}`,
        },
        body: JSON.stringify({ id: usuario.id }),
      });

      const result = await response.json();

      if (!result.success) {
        throw new Error(result.error || 'Error al eliminar usuario');
      }

      toast.success('Usuario eliminado exitosamente');
      cargarUsuarios();
    } catch (error: any) {
      toast.error(error.message);
    }
  };

  const getRolColor = (rol: string) => {
    switch (rol) {
      case 'Gerencia':
        return 'bg-purple-100 text-purple-800 border-purple-200';
      case 'Administrador':
        return 'bg-blue-100 text-blue-800 border-blue-200';
      case 'Verificador':
        return 'bg-green-100 text-green-800 border-green-200';
      default:
        return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  if (profile?.rol !== 'Gerencia') {
    return (
      <Card className="p-8 text-center">
        <Shield className="w-16 h-16 mx-auto text-[#BFD97D] mb-4" />
        <h3 className="text-[#172E08] mb-2">Acceso Restringido</h3>
        <p className="text-[#4D240F]/70">
          Solo usuarios con rol de Gerencia pueden acceder a esta sección
        </p>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header con botón Agregar */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl text-[#172E08]">Gestión de Usuarios</h2>
          <p className="text-sm text-[#4D240F]/70 mt-1">
            Administra los usuarios del sistema Escosia Hass
          </p>
        </div>
        <Button
          onClick={abrirModalCrear}
          className="bg-gradient-to-br from-[#73991C] to-[#5c7a16] hover:from-[#5c7a16] hover:to-[#73991C] text-white shadow-md hover:shadow-lg transition-all"
        >
          <Plus className="w-4 h-4 mr-2" />
          Nuevo Usuario
        </Button>
      </div>

      {/* Tabla de usuarios */}
      <Card className="overflow-hidden border border-[#BFD97D]/30 shadow-md">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gradient-to-r from-[#73991C]/10 to-[#BFD97D]/10 border-b border-[#BFD97D]/30">
              <tr>
                <th className="px-6 py-3 text-left text-xs uppercase tracking-wider text-[#172E08]">
                  Usuario
                </th>
                <th className="px-6 py-3 text-left text-xs uppercase tracking-wider text-[#172E08]">
                  Email
                </th>
                <th className="px-6 py-3 text-left text-xs uppercase tracking-wider text-[#172E08]">
                  Rol
                </th>
                <th className="px-6 py-3 text-left text-xs uppercase tracking-wider text-[#172E08]">
                  Estado
                </th>
                <th className="px-6 py-3 text-right text-xs uppercase tracking-wider text-[#172E08]">
                  Acciones
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-[#BFD97D]/20">
              {loading ? (
                <tr>
                  <td colSpan={5} className="px-6 py-8 text-center text-[#4D240F]/70">
                    Cargando usuarios...
                  </td>
                </tr>
              ) : usuarios.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-8 text-center text-[#4D240F]/70">
                    <Users className="w-12 h-12 mx-auto mb-2 text-[#BFD97D]" />
                    No hay usuarios registrados
                  </td>
                </tr>
              ) : (
                usuarios.map((usuario) => (
                  <tr key={usuario.id} className="hover:bg-[#F8FAF5] transition-colors">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[#73991C] to-[#BFD97D] flex items-center justify-center text-white">
                          {usuario.nombre_completo?.charAt(0).toUpperCase() || usuario.email.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <div className="text-[#172E08]">
                            {usuario.nombre_completo || 'Sin nombre'}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-[#4D240F]/70">
                      {usuario.email}
                    </td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs border ${getRolColor(usuario.rol)}`}>
                        {usuario.rol}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      {usuario.activo ? (
                        <span className="inline-flex items-center gap-1 text-green-600">
                          <CheckCircle2 className="w-4 h-4" />
                          <span className="text-xs">Activo</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-red-600">
                          <XCircle className="w-4 h-4" />
                          <span className="text-xs">Inactivo</span>
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => abrirModalEditar(usuario)}
                          className="text-[#73991C] hover:bg-[#73991C]/10"
                        >
                          <Edit className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => eliminarUsuario(usuario)}
                          className="text-red-600 hover:bg-red-50"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Modal Crear/Editar Usuario */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle className="text-[#172E08]">
              {modalMode === 'crear' ? 'Nuevo Usuario' : 'Editar Usuario'}
            </DialogTitle>
            <DialogDescription className="text-[#4D240F]/70">
              {modalMode === 'crear' 
                ? 'Completa los datos para crear un nuevo usuario' 
                : 'Modifica los datos del usuario'
              }
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Nombre Completo */}
            <div>
              <Label htmlFor="nombre" className="text-[#172E08]">
                Nombre Completo *
              </Label>
              <Input
                id="nombre"
                value={nombreCompleto}
                onChange={(e) => setNombreCompleto(e.target.value)}
                placeholder="Ej: Juan Pérez García"
                required
                className="border-[#BFD97D]/30 focus:border-[#73991C]"
              />
            </div>

            {/* Email */}
            <div>
              <Label htmlFor="email" className="text-[#172E08]">
                Email *
              </Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="usuario@ejemplo.com"
                required
                disabled={modalMode === 'editar'}
                className="border-[#BFD97D]/30 focus:border-[#73991C] disabled:opacity-50"
              />
              {modalMode === 'editar' && (
                <p className="text-xs text-[#4D240F]/60 mt-1">
                  El email no se puede modificar
                </p>
              )}
            </div>

            {/* Rol */}
            <div>
              <Label htmlFor="rol" className="text-[#172E08]">
                Rol *
              </Label>
              <select
                id="rol"
                value={rol}
                onChange={(e) => setRol(e.target.value as any)}
                className="w-full px-3 py-2 border border-[#BFD97D]/30 rounded-md focus:outline-none focus:ring-2 focus:ring-[#73991C]/50 focus:border-[#73991C]"
                required
              >
                <option value="Administrador">Administrador</option>
                <option value="Verificador">Verificador</option>
                <option value="Gerencia">Gerencia</option>
              </select>
            </div>

            {/* Clave */}
            <div>
              <Label htmlFor="clave" className="text-[#172E08]">
                Clave {modalMode === 'crear' ? '*' : '(dejar vacío para no cambiar)'}
              </Label>
              <div className="relative">
                <Input
                  id="clave"
                  type={showPassword ? 'text' : 'password'}
                  value={clave}
                  onChange={(e) => setClave(e.target.value)}
                  placeholder={modalMode === 'crear' ? 'Mínimo 6 caracteres' : 'Nueva clave (opcional)'}
                  required={modalMode === 'crear'}
                  className="border-[#BFD97D]/30 focus:border-[#73991C] pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[#4D240F]/50 hover:text-[#4D240F]"
                >
                  {showPassword ? (
                    <EyeOff className="w-4 h-4" />
                  ) : (
                    <Eye className="w-4 h-4" />
                  )}
                </button>
              </div>
            </div>

            {/* Estado Activo/Inactivo */}
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="activo"
                checked={activo}
                onChange={(e) => setActivo(e.target.checked)}
                className="w-4 h-4 text-[#73991C] border-[#BFD97D]/30 rounded focus:ring-[#73991C]"
              />
              <Label htmlFor="activo" className="text-[#172E08] cursor-pointer">
                Usuario activo
              </Label>
            </div>

            {/* Botones */}
            <div className="flex gap-3 pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => setModalOpen(false)}
                className="flex-1"
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                className="flex-1 bg-gradient-to-br from-[#73991C] to-[#5c7a16] hover:from-[#5c7a16] hover:to-[#73991C] text-white"
              >
                {modalMode === 'crear' ? 'Crear Usuario' : 'Guardar Cambios'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
