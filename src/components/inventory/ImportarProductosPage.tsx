import { InventorySubNav } from './InventorySubNav';
import { ImportarProductosCSV } from './ImportarProductosCSV';

export function ImportarProductosPage() {
  return (
    <div className="space-y-6">
      <InventorySubNav />
      <ImportarProductosCSV />
    </div>
  );
}
