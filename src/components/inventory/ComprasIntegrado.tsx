import { useState } from 'react';
import { Plus, ShoppingCart } from 'lucide-react';
import { Button } from '../ui/button';
import { PurchaseHistory } from './PurchaseHistory';
import { NewPurchase } from './NewPurchase';
import { InventorySubNav } from './InventorySubNav';

/**
 * Vista integrada de Compras
 * Muestra un botón para registrar nueva compra y el historial de compras
 */
export function ComprasIntegrado() {
  const [mostrarNuevaCompra, setMostrarNuevaCompra] = useState(false);

  if (mostrarNuevaCompra) {
    return (
      <div className="space-y-6">
        <InventorySubNav />
        
        {/* Botón para volver al historial */}
        <div className="flex items-center justify-between">
          <h1 className="text-[#172E08]">Nueva Compra</h1>
          <Button
            onClick={() => setMostrarNuevaCompra(false)}
            variant="outline"
            className="border-[#73991C]/30 text-[#73991C] hover:bg-[#73991C]/5"
          >
            ← Ver Historial
          </Button>
        </div>

        <NewPurchase onSuccess={() => setMostrarNuevaCompra(false)} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <InventorySubNav />
      
      {/* Header con botón para nueva compra */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-[#172E08] mb-2">Compras</h1>
          <p className="text-[#4D240F]/70">Gestiona las compras de productos para el cultivo</p>
        </div>
        
        <Button
          onClick={() => setMostrarNuevaCompra(true)}
          className="bg-gradient-to-r from-[#73991C] to-[#BFD97D] hover:shadow-lg hover:shadow-[#73991C]/30 text-white rounded-xl transition-all duration-200 hover:-translate-y-0.5"
        >
          <Plus className="w-4 h-4 mr-2" />
          Registrar Nueva Compra
        </Button>
      </div>

      {/* Historial de Compras */}
      <div className="bg-gradient-to-br from-white via-[#F8FAF5] to-white/80 backdrop-blur-sm rounded-2xl border border-[#73991C]/10 p-6 shadow-[0_4px_24px_rgba(115,153,28,0.08)]">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 bg-gradient-to-br from-[#73991C] to-[#BFD97D] rounded-xl flex items-center justify-center shadow-lg shadow-[#73991C]/20">
            <ShoppingCart className="w-5 h-5 text-white" />
          </div>
          <div>
            <h2 className="text-lg text-[#172E08]">Historial de Compras</h2>
            <p className="text-sm text-[#4D240F]/60">Registro completo de todas las compras realizadas</p>
          </div>
        </div>

        <PurchaseHistory hideSubNav={true} />
      </div>
    </div>
  );
}
