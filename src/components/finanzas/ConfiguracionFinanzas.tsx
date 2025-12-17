import { useState } from 'react';
import { RoleGuard } from '../auth/RoleGuard';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs';
import { ProveedoresConfig } from './components/ProveedoresConfig';
import { CompradoresConfig } from './components/CompradoresConfig';
import { MediosPagoConfig } from './components/MediosPagoConfig';
import { FinanzasSubNav } from './components/FinanzasSubNav';
import { Building2, Users, CreditCard } from 'lucide-react';

/**
 * Vista de Configuración Financiera
 * Acceso exclusivo para rol Gerencia
 */
export function ConfiguracionFinanzas() {
  const [activeTab, setActiveTab] = useState('proveedores');

  return (
    <RoleGuard allowedRoles={['Gerencia']}>
      <div className="space-y-6">
        {/* Navigation */}
        <FinanzasSubNav />

        {/* Header */}
        <div className="relative">
          <div className="absolute -top-4 -left-4 w-32 h-32 bg-[#73991C]/5 rounded-full blur-2xl"></div>
          <div className="relative">
            <h1 className="text-[#172E08] mb-2">Configuración Financiera</h1>
            <p className="text-[#4D240F]/70">
              Gestión de catálogos, proveedores, compradores y medios de pago
            </p>
          </div>
        </div>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="proveedores" className="flex items-center gap-2">
              <Building2 className="w-4 h-4" />
              Proveedores
            </TabsTrigger>
            <TabsTrigger value="compradores" className="flex items-center gap-2">
              <Users className="w-4 h-4" />
              Compradores
            </TabsTrigger>
            <TabsTrigger value="medios-pago" className="flex items-center gap-2">
              <CreditCard className="w-4 h-4" />
              Medios de Pago
            </TabsTrigger>
          </TabsList>

          <TabsContent value="proveedores" className="mt-6">
            <ProveedoresConfig />
          </TabsContent>

          <TabsContent value="compradores" className="mt-6">
            <CompradoresConfig />
          </TabsContent>

          <TabsContent value="medios-pago" className="mt-6">
            <MediosPagoConfig />
          </TabsContent>
        </Tabs>

        {/* Información adicional */}
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-6">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center flex-shrink-0">
              <span className="text-xl">ℹ️</span>
            </div>
            <div>
              <h3 className="text-lg font-semibold text-blue-900 mb-2">
                Información de Configuración
              </h3>
              <ul className="text-sm text-blue-800 space-y-1">
                <li>• Los proveedores se utilizan en el registro de gastos</li>
                <li>• Los compradores se utilizan en el registro de ingresos</li>
                <li>• Los medios de pago están disponibles para gastos e ingresos</li>
                <li>• Los elementos inactivos no aparecerán en los formularios de registro</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </RoleGuard>
  );
}