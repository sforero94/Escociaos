import { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { ProveedoresConfig } from './components/ProveedoresConfig';
import { CompradoresConfig } from './components/CompradoresConfig';
import { MediosPagoConfig } from './components/MediosPagoConfig';
import { ConfigReportesFinancieros } from './components/ConfigReportesFinancieros';
import { Building2, Users, CreditCard, SlidersHorizontal } from 'lucide-react';

const TABS_CONFIG = [
  { value: 'proveedores', label: 'Proveedores', Icon: Building2 },
  { value: 'compradores', label: 'Compradores', Icon: Users },
  { value: 'medios-pago', label: 'Medios de Pago', Icon: CreditCard },
  { value: 'reportes', label: 'Reportes', Icon: SlidersHorizontal },
] as const;

/**
 * Vista de Configuración Financiera
 * Acceso exclusivo para rol Gerencia
 */
export function ConfiguracionFinanzas() {
  const [activeTab, setActiveTab] = useState('proveedores');
  const activeConfig = TABS_CONFIG.find((t) => t.value === activeTab) ?? TABS_CONFIG[0];

  return (
    <div className="space-y-6">
      {/* Navigation */}

      {/* Header */}
      <div className="relative">
        <div className="absolute -top-4 -left-4 w-32 h-32 bg-primary/5 rounded-full blur-2xl"></div>
        <div className="relative">
          <h1 className="text-foreground mb-2">Configuración Financiera</h1>
          <p className="text-brand-brown/70">
            Gestión de catálogos, proveedores, compradores y medios de pago
          </p>
        </div>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        {/* Móvil (<640px): las 4 pestañas se superponían icono-sobre-rótulo a
            375px — Patrón B de docs/sistema-visual.md §3-bis: se colapsan en
            un <Select> que muestra la pestaña activa. */}
        <div className="sm:hidden">
          <Select value={activeTab} onValueChange={setActiveTab}>
            <SelectTrigger className="w-full">
              <SelectValue>
                <span className="flex items-center gap-2">
                  <activeConfig.Icon className="w-4 h-4" />
                  {activeConfig.label}
                </span>
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {TABS_CONFIG.map(({ value, label }) => (
                <SelectItem key={value} value={value}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Escritorio: pestañas, sin cambios. La clasificación de costos y
            los parámetros contables comparten la pestaña «Reportes»;
            separarlos es una decisión de producto. */}
        <TabsList className="hidden sm:grid w-full grid-cols-4">
          {TABS_CONFIG.map(({ value, label, Icon }) => (
            <TabsTrigger key={value} value={value} className="flex items-center gap-2">
              <Icon className="w-4 h-4" />
              {label}
            </TabsTrigger>
          ))}
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

        <TabsContent value="reportes" className="mt-6">
          <ConfigReportesFinancieros />
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
  );
}