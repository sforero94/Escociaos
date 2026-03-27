import { useState } from 'react';
import { RoleGuard } from '../auth/RoleGuard';
import { GastosList } from './components/GastosList';
import { GastoForm } from './components/GastoForm';
import { GastosBatchTable } from './components/GastosBatchTable';
import { CargaMasivaGastos } from './components/CargaMasivaGastos';
import { TransaccionGanadoForm } from './components/TransaccionGanadoForm';
import { FinanzasSubNav } from './components/FinanzasSubNav';
import { useGastosCatalogs } from './hooks/useGastosCatalogs';
import { Button } from '../ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs';
import { Plus, FileSpreadsheet, ClipboardList, History } from 'lucide-react';
import { toast } from 'sonner';

export function GastosView() {
  const [activeTab, setActiveTab] = useState('registrar');
  const [showForm, setShowForm] = useState(false);
  const [showCargaMasiva, setShowCargaMasiva] = useState(false);
  const [editingGasto, setEditingGasto] = useState<any>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [showGanadoForm, setShowGanadoForm] = useState(false);
  const catalogs = useGastosCatalogs();

  const handleNewGasto = () => {
    setEditingGasto(null);
    setShowForm(true);
  };

  const handleEditGasto = (gasto: any) => {
    setEditingGasto(gasto);
    setShowForm(true);
  };

  const handleFormClose = () => {
    setShowForm(false);
    setEditingGasto(null);
  };

  const handleFormSuccess = () => {
    setShowForm(false);
    setEditingGasto(null);
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
          <h1 className="text-foreground mb-2">Gastos</h1>
          <p className="text-brand-brown/70">
            Registro y gestion de gastos operativos
          </p>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} activationMode="manual" className="w-full">
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
                onClick={handleNewGasto}
                className="bg-gradient-to-r from-primary to-secondary text-white hover:from-primary-dark hover:to-secondary-dark shadow-sm"
              >
                <Plus className="w-4 h-4 mr-2" />
                Nuevo Gasto
              </Button>
              <Button
                onClick={() => setShowGanadoForm(true)}
                variant="outline"
                className="border-amber-600 text-amber-700 hover:bg-amber-50"
              >
                <Plus className="w-4 h-4 mr-2" />
                Compra Ganado
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

            <GastosBatchTable catalogs={catalogs} onSaved={handleBatchSaved} />
          </TabsContent>

          <TabsContent value="historial" className="mt-6">
            <GastosList key={refreshKey} onEdit={handleEditGasto} />
          </TabsContent>
        </Tabs>

        {showForm && (
          <GastoForm
            open={showForm}
            onOpenChange={setShowForm}
            gasto={editingGasto}
            onSuccess={handleFormSuccess}
            onCancel={handleFormClose}
          />
        )}

        <CargaMasivaGastos
          open={showCargaMasiva}
          onOpenChange={setShowCargaMasiva}
          onSuccess={(count) => {
            setRefreshKey((prev) => prev + 1);
            toast.success(`Se cargaron ${count} gastos correctamente`);
          }}
          onError={(message) => toast.error(message)}
        />

        <TransaccionGanadoForm
          open={showGanadoForm}
          onOpenChange={setShowGanadoForm}
          defaultTipo="compra"
          onSuccess={() => {
            setShowGanadoForm(false);
            setRefreshKey((prev) => prev + 1);
          }}
        />
      </div>
    </RoleGuard>
  );
}
