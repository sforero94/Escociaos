import { useNavigate, useLocation } from 'react-router-dom';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { DashboardTab } from '@/types/finanzas';

const TABS: { id: DashboardTab; label: string; path: string }[] = [
  { id: 'general', label: 'General', path: '/finanzas' },
  { id: 'aguacate', label: 'Aguacate Hass', path: '/finanzas/dashboard/aguacate' },
  { id: 'hato', label: 'Hato Lechero', path: '/finanzas/dashboard/hato' },
  { id: 'ganado', label: 'Ganado', path: '/finanzas/dashboard/ganado' },
  { id: 'caballos', label: 'Caballos', path: '/finanzas/dashboard/caballos' },
  { id: 'agricola', label: 'Agricola', path: '/finanzas/dashboard/agricola' },
];

interface DashboardSubNavProps {
  activeTab: DashboardTab;
}

export function DashboardSubNav({ activeTab }: DashboardSubNavProps) {
  const navigate = useNavigate();
  const active = TABS.find((tab) => tab.id === activeTab) ?? TABS[0];

  const irA = (id: string) => {
    const tab = TABS.find((t) => t.id === id);
    if (tab) navigate(tab.path);
  };

  return (
    <div className="border-b border-primary/10">
      {/* Móvil (<640px): los 6 negocios como pestañas envuelven a dos líneas
          a 375px — Patrón B de docs/sistema-visual.md §3-bis: se colapsan en
          un <Select> que muestra el negocio activo. */}
      <div className="py-3 sm:hidden">
        <Select value={activeTab} onValueChange={irA}>
          <SelectTrigger className="w-full">
            <SelectValue>{active.label}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            {TABS.map((tab) => (
              <SelectItem key={tab.id} value={tab.id}>
                {tab.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Escritorio: pestañas, sin cambios. */}
      <div className="hidden sm:flex sm:flex-wrap gap-x-1 gap-y-0">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => navigate(tab.path)}
            className={`px-3 lg:px-4 py-2 lg:py-2.5 text-sm font-medium whitespace-nowrap border-b-2 transition-all ${
              activeTab === tab.id
                ? 'border-primary text-foreground'
                : 'border-transparent text-brand-brown/50 hover:text-foreground hover:border-primary/20'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>
    </div>
  );
}
