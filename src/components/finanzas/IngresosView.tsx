import { useState } from 'react';
import { RoleGuard } from '../auth/RoleGuard';
import { IngresosList } from './components/IngresosList';
import { IngresoForm } from './components/IngresoForm';
import { IngresosBatchTable } from './components/IngresosBatchTable';
import { CargaMasivaIngresos } from './components/CargaMasivaIngresos';
import { TransaccionGanadoForm } from './components/TransaccionGanadoForm';
import { FinanzasSubNav } from './components/FinanzasSubNav';
import { useIngresosCatalogs } from './hooks/useIngresosCatalogs';
import { Button } from '../ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs';
import { Plus, FileSpreadsheet, ClipboardList, History } from 'lucide-react';
import { toast } from 'sonner';

export function IngresosView() {
  const [activeTab, setActiveTab] = useState('registrar');
  const [showForm, setShowForm] = useState(false);
  const [showCargaMasiva, setShowCargaMasiva] = useState(false);
  const [editingIngreso, setEditingIngreso] = useState<any>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [showGanadoForm, setShowGanadoForm] = useState(false);
  const catalogs = useIngresosCatalogs();

  const handleNewIngreso = () => {
    setEditingIngreso(null);
    setShowForm(true);
  };

  const handleEditIngreso = (ingreso: any) => {
    setEditingIngreso(ingreso);
    setShowForm(true);
  };

  const handleFormClose = () => {
    setShowForm(false);
    setEditingIngreso(null);
  };

  const handleFormSuccess = () => {
    setShowForm(false);
    setEditingIngreso(null);
    setRefreshKey((prev) => prev + 1);
  };

  const handleBatchSaved = () => {
    setRefreshKey((prev) => prev + 1);
  };

  return (
    <RoleGuard allowedRoles={['Gerencia']}>
      <div className="space-y-6">
        <FinanzasSubNav />

        <div>
          <h1 className="text-foreground mb-2">Ingresos</h1>
          <p className="text-brand-brown/70">
            Registro y gestion de ingresos operativos
          </p>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="registrar" className="flex items-center gap-2">
              <ClipboardList className="w-4 h-4" />
              Registrar
            </TabsTrigger>
            <TabsTrigger value="historial" className="flex items-center gap-2">
              <History className="w-4 h-4" />
              Historial
            </TabsTrigger>
          </TabsList>

          <TabsContent value="registrar" className="mt-6 space-y-6">
            <div className="flex flex-wrap gap-3">
              <Button
                onClick={handleNewIngreso}
                className="bg-gradient-to-r from-primary to-secondary text-white hover:from-primary-dark hover:to-secondary-dark shadow-sm"
              >
                <Plus className="w-4 h-4 mr-2" />
                Nuevo Ingreso
              </Button>
              <Button
                onClick={() => setShowGanadoForm(true)}
                variant="outline"
                className="border-amber-600 text-amber-700 hover:bg-amber-50"
              >
                <Plus className="w-4 h-4 mr-2" />
                Venta Ganado
              </Button>
              <Button
                onClick={() => setShowCargaMasiva(true)}
                variant="outline"
                className="border-primary text-primary hover:bg-primary/10"
              >
                <FileSpreadsheet className="w-4 h-4 mr-2" />
                Carga Masiva
              </Button>
            </div>

            <IngresosBatchTable catalogs={catalogs} onSaved={handleBatchSaved} />
          </TabsContent>

          <TabsContent value="historial" className="mt-6">
            <IngresosList key={refreshKey} onEdit={handleEditIngreso} />
          </TabsContent>
        </Tabs>

        {showForm && (
          <IngresoForm
            open={showForm}
            onOpenChange={setShowForm}
            ingreso={editingIngreso}
            onSuccess={handleFormSuccess}
            onCancel={handleFormClose}
          />
        )}

        <CargaMasivaIngresos
          open={showCargaMasiva}
          onOpenChange={setShowCargaMasiva}
          onSuccess={(count) => {
            setRefreshKey((prev) => prev + 1);
            toast.success(`Se cargaron ${count} ingresos correctamente`);
          }}
          onError={(message) => toast.error(message)}
        />

        <TransaccionGanadoForm
          open={showGanadoForm}
          onOpenChange={setShowGanadoForm}
          defaultTipo="venta"
          onSuccess={() => {
            setShowGanadoForm(false);
            setRefreshKey((prev) => prev + 1);
          }}
        />
      </div>
    </RoleGuard>
  );
}
