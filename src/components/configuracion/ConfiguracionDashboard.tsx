import { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs';
import { LotesConfig } from './LotesConfig';
import { SublotesConfig } from './SublotesConfig';
import { MapPin, Sprout, Settings } from 'lucide-react';

export function ConfiguracionDashboard() {
  const [activeTab, setActiveTab] = useState('lotes');

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#F8FAF5] via-white to-[#BFD97D]/10 p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-[#172E08] mb-2">Configuración</h1>
          <p className="text-[#4D240F]/70">
            Gestiona la configuración del sistema Escosia Hass
          </p>
        </div>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList className="bg-white/80 backdrop-blur-sm border border-[#BFD97D]/30 p-1">
            <TabsTrigger
              value="lotes"
              className="data-[state=active]:bg-gradient-to-br data-[state=active]:from-[#73991C] data-[state=active]:to-[#5c7a16] data-[state=active]:text-white"
            >
              <MapPin className="w-4 h-4 mr-2" />
              Lotes
            </TabsTrigger>
            <TabsTrigger
              value="sublotes"
              className="data-[state=active]:bg-gradient-to-br data-[state=active]:from-[#73991C] data-[state=active]:to-[#5c7a16] data-[state=active]:text-white"
            >
              <Sprout className="w-4 h-4 mr-2" />
              Sublotes
            </TabsTrigger>
            <TabsTrigger
              value="general"
              className="data-[state=active]:bg-gradient-to-br data-[state=active]:from-[#73991C] data-[state=active]:to-[#5c7a16] data-[state=active]:text-white"
              disabled
            >
              <Settings className="w-4 h-4 mr-2" />
              General
              <span className="ml-2 text-xs opacity-60">(Próximamente)</span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="lotes" className="space-y-6">
            <LotesConfig />
          </TabsContent>

          <TabsContent value="sublotes" className="space-y-6">
            <SublotesConfig />
          </TabsContent>

          <TabsContent value="general" className="space-y-6">
            <div className="text-center py-12">
              <Settings className="w-16 h-16 mx-auto text-[#BFD97D] mb-4" />
              <h3 className="text-[#172E08] mb-2">Configuración General</h3>
              <p className="text-[#4D240F]/70">
                Esta funcionalidad estará disponible próximamente
              </p>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}