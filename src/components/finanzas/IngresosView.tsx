import { useState } from 'react';
import { RoleGuard } from '../auth/RoleGuard';
import { IngresosList } from './components/IngresosList';
import { IngresoForm } from './components/IngresoForm';
import { FinanzasSubNav } from './components/FinanzasSubNav';
import { Button } from '../ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs';
import { Plus, List } from 'lucide-react';

/**
 * Vista de Ingresos
 * Acceso exclusivo para rol Gerencia
 */
export function IngresosView() {
  const [activeTab, setActiveTab] = useState('lista');
  const [showForm, setShowForm] = useState(false);
  const [editingIngreso, setEditingIngreso] = useState<any>(null);
  const [refreshKey, setRefreshKey] = useState(0);

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
    // Trigger list refresh by incrementing the key
    setRefreshKey((prev: number) => prev + 1);
  };

  return (
    <RoleGuard allowedRoles={['Gerencia']}>
      <div className="space-y-6">
        {/* Navigation */}
        <FinanzasSubNav />

        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-foreground mb-2">Ingresos</h1>
            <p className="text-brand-brown/70">
              Gestión y registro de ingresos operativos
            </p>
          </div>

          <Button
            onClick={handleNewIngreso}
            className="bg-gradient-to-r from-primary to-secondary text-white hover:from-primary-dark hover:to-secondary-dark shadow-sm"
          >
            <Plus className="w-4 h-4 mr-2" />
            Nuevo Ingreso
          </Button>
        </div>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-1">
            <TabsTrigger value="lista" className="flex items-center gap-2">
              <List className="w-4 h-4" />
              Lista de Ingresos
            </TabsTrigger>
          </TabsList>

          <TabsContent value="lista" className="mt-6">
            <IngresosList key={refreshKey} onEdit={handleEditIngreso} />
          </TabsContent>
        </Tabs>

        {/* Form Dialog */}
        {showForm && (
          <IngresoForm
            open={showForm}
            onOpenChange={setShowForm}
            ingreso={editingIngreso}
            onSuccess={handleFormSuccess}
            onCancel={handleFormClose}
          />
        )}
      </div>
    </RoleGuard>
  );
}