import { useState } from 'react';
import { RoleGuard } from '../auth/RoleGuard';
import { GastosList } from './components/GastosList';
import { GastoForm } from './components/GastoForm';
import { FinanzasSubNav } from './components/FinanzasSubNav';
import { Button } from '../ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs';
import { Plus, List } from 'lucide-react';

/**
 * Vista de Gastos
 * Acceso exclusivo para rol Gerencia
 */
export function GastosView() {
  const [activeTab, setActiveTab] = useState('lista');
  const [showForm, setShowForm] = useState(false);
  const [editingGasto, setEditingGasto] = useState<any>(null);
  const [refreshKey, setRefreshKey] = useState(0);

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
            <h1 className="text-foreground mb-2">Gastos</h1>
            <p className="text-brand-brown/70">
              Gestión y registro de gastos operativos
            </p>
          </div>

          <Button
            onClick={handleNewGasto}
            className="bg-gradient-to-r from-primary to-secondary text-white hover:from-primary-dark hover:to-secondary-dark shadow-sm"
          >
            <Plus className="w-4 h-4 mr-2" />
            Nuevo Gasto
          </Button>
        </div>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-1">
            <TabsTrigger value="lista" className="flex items-center gap-2">
              <List className="w-4 h-4" />
              Lista de Gastos
            </TabsTrigger>
          </TabsList>

          <TabsContent value="lista" className="mt-6">
            <GastosList key={refreshKey} onEdit={handleEditGasto} />
          </TabsContent>
        </Tabs>

        {/* Form Dialog */}
        {showForm && (
          <GastoForm
            open={showForm}
            onOpenChange={setShowForm}
            gasto={editingGasto}
            onSuccess={handleFormSuccess}
            onCancel={handleFormClose}
          />
        )}
      </div>
    </RoleGuard>
  );
}