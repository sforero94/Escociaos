/**
 * EJEMPLO DE USO DE PROTECCIÓN POR ROLES
 * 
 * Este archivo muestra cómo usar RoleGuard para proteger secciones
 * según el rol del usuario
 */

import { RoleGuard } from '../auth/RoleGuard';
import { useAuth } from '../../contexts/AuthContext';
import { Shield, Users, Settings } from 'lucide-react';

export function ProtectedExample() {
  const { profile } = useAuth();

  return (
    <div className="space-y-6 p-6">
      <h1 className="text-2xl text-[#172E08]">
        Ejemplo de Protección por Roles
      </h1>

      {/* Información del usuario actual */}
      <div className="bg-white/80 backdrop-blur-sm rounded-2xl border border-[#73991C]/10 p-6">
        <h2 className="text-lg text-[#172E08] mb-4">Tu Perfil</h2>
        <div className="space-y-2">
          <p className="text-[#4D240F]/70">
            <strong>Nombre:</strong> {profile?.nombre}
          </p>
          <p className="text-[#4D240F]/70">
            <strong>Email:</strong> {profile?.email}
          </p>
          <p className="text-[#4D240F]/70">
            <strong>Rol:</strong> {profile?.rol}
          </p>
        </div>
      </div>

      {/* Sección solo para Gerentes */}
      <RoleGuard allowedRoles={['Gerente', 'Administrador']}>
        <div className="bg-gradient-to-br from-[#73991C]/10 to-[#BFD97D]/10 rounded-2xl border border-[#73991C]/20 p-6">
          <div className="flex items-center gap-3 mb-4">
            <Shield className="w-6 h-6 text-[#73991C]" />
            <h2 className="text-lg text-[#172E08]">
              Sección de Gerencia
            </h2>
          </div>
          <p className="text-[#4D240F]/70">
            Esta sección solo es visible para usuarios con rol de Gerente o Administrador.
            Aquí podrían ir reportes financieros, configuraciones avanzadas, etc.
          </p>
        </div>
      </RoleGuard>

      {/* Sección solo para Administradores */}
      <RoleGuard allowedRoles={['Administrador']}>
        <div className="bg-gradient-to-br from-[#BFD97D]/10 to-[#73991C]/10 rounded-2xl border border-[#73991C]/20 p-6">
          <div className="flex items-center gap-3 mb-4">
            <Settings className="w-6 h-6 text-[#73991C]" />
            <h2 className="text-lg text-[#172E08]">
              Panel de Administración
            </h2>
          </div>
          <p className="text-[#4D240F]/70">
            Esta sección solo es visible para Administradores.
            Aquí podrían ir configuraciones del sistema, gestión de usuarios, etc.
          </p>
        </div>
      </RoleGuard>

      {/* Sección para todos los usuarios autenticados */}
      <div className="bg-white/80 backdrop-blur-sm rounded-2xl border border-[#73991C]/10 p-6">
        <div className="flex items-center gap-3 mb-4">
          <Users className="w-6 h-6 text-[#73991C]" />
          <h2 className="text-lg text-[#172E08]">
            Sección General
          </h2>
        </div>
        <p className="text-[#4D240F]/70">
          Esta sección es visible para todos los usuarios autenticados,
          independientemente de su rol.
        </p>
      </div>
    </div>
  );
}
