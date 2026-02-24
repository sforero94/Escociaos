import { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs';
import { LotesConfig } from './LotesConfig';
import { SublotesConfig } from './SublotesConfig';
import { UsuariosConfig } from './UsuariosConfig';
import { useAuth } from '../../contexts/AuthContext';
import { useSafeMode } from '../../contexts/SafeModeContext';
import { MapPin, Sprout, Settings, Users, Shield, AlertTriangle } from 'lucide-react';

export function ConfiguracionDashboard() {
  const { profile } = useAuth();
  const { isSafeModeEnabled, toggleSafeMode } = useSafeMode();
  const [activeTab, setActiveTab] = useState('general');

  const isGerencia = profile?.rol === 'Gerencia';

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-white to-secondary/10 p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-foreground mb-2">Configuración</h1>
          <p className="text-brand-brown/70">
            Gestiona la configuración del sistema Escosia Hass
          </p>
        </div>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList className="bg-white/80 backdrop-blur-sm border border-secondary/30 p-1">
            <TabsTrigger
              value="general"
              className="data-[state=active]:bg-gradient-to-br data-[state=active]:from-primary data-[state=active]:to-primary-dark data-[state=active]:text-white"
            >
              <Settings className="w-4 h-4 mr-2" />
              General
            </TabsTrigger>
            
            {isGerencia && (
              <TabsTrigger
                value="usuarios"
                className="data-[state=active]:bg-gradient-to-br data-[state=active]:from-primary data-[state=active]:to-primary-dark data-[state=active]:text-white"
              >
                <Users className="w-4 h-4 mr-2" />
                Usuarios
              </TabsTrigger>
            )}
            
            <TabsTrigger
              value="lotes"
              className="data-[state=active]:bg-gradient-to-br data-[state=active]:from-primary data-[state=active]:to-primary-dark data-[state=active]:text-white"
            >
              <MapPin className="w-4 h-4 mr-2" />
              Lotes
            </TabsTrigger>
            <TabsTrigger
              value="sublotes"
              className="data-[state=active]:bg-gradient-to-br data-[state=active]:from-primary data-[state=active]:to-primary-dark data-[state=active]:text-white"
            >
              <Sprout className="w-4 h-4 mr-2" />
              Sublotes
            </TabsTrigger>
          </TabsList>

          <TabsContent value="general" className="space-y-6">
            {/* Modo Seguro */}
            <div className="bg-white/80 backdrop-blur-sm rounded-2xl border border-primary/10 p-6 shadow-[0_4px_24px_rgba(115,153,28,0.08)]">
              <div className="flex items-start gap-4">
                <div className={`w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 ${isSafeModeEnabled ? 'bg-green-500' : 'bg-orange-500'}`}>
                  <Shield className="w-6 h-6 text-white" />
                </div>
                <div className="flex-1">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="text-lg text-foreground">Modo Seguro</h3>
                    <button
                      onClick={toggleSafeMode}
                      className={`relative inline-flex h-8 w-14 items-center rounded-full transition-colors ${
                        isSafeModeEnabled ? 'bg-green-500' : 'bg-gray-300'
                      }`}
                    >
                      <span
                        className={`inline-block h-6 w-6 transform rounded-full bg-white transition-transform ${
                          isSafeModeEnabled ? 'translate-x-7' : 'translate-x-1'
                        }`}
                      />
                    </button>
                  </div>
                  <p className="text-sm text-brand-brown/70 mb-4">
                    {isSafeModeEnabled
                      ? 'El modo seguro está activado. Los productos no permitidos por gerencia están ocultos en toda la aplicación.'
                      : 'El modo seguro está desactivado. Todos los productos son visibles en la aplicación.'}
                  </p>

                  {/* Info adicional */}
                  <div className={`p-4 rounded-lg border ${isSafeModeEnabled ? 'bg-green-50 border-green-200' : 'bg-orange-50 border-orange-200'}`}>
                    <div className="flex items-start gap-3">
                      <AlertTriangle className={`w-5 h-5 mt-0.5 flex-shrink-0 ${isSafeModeEnabled ? 'text-green-600' : 'text-orange-600'}`} />
                      <div className="flex-1">
                        <p className={`text-sm ${isSafeModeEnabled ? 'text-green-800' : 'text-orange-800'}`}>
                          {isSafeModeEnabled ? (
                            <>
                              <strong>Modo seguro activado:</strong> Los productos marcados como "No permitidos por gerencia" no aparecerán en ninguna lista, formulario o selección dentro de los módulos de Inventario y Aplicaciones. Esto previene su uso accidental.
                            </>
                          ) : (
                            <>
                              <strong>Modo seguro desactivado:</strong> Todos los productos están visibles. Los productos no permitidos por gerencia se mostrarán en <span className="text-red-600 font-bold">rojo y negrita</span> para identificarlos fácilmente.
                            </>
                          )}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </TabsContent>

          {isGerencia && (
            <TabsContent value="usuarios" className="space-y-6">
              <UsuariosConfig />
            </TabsContent>
          )}

          <TabsContent value="lotes" className="space-y-6">
            <LotesConfig />
          </TabsContent>

          <TabsContent value="sublotes" className="space-y-6">
            <SublotesConfig />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}