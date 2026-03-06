import { useNavigate, useLocation } from 'react-router-dom';
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

  return (
    <div className="border-b border-primary/10 overflow-x-auto scrollbar-hide">
      <div className="flex gap-1 min-w-max">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => navigate(tab.path)}
            className={`px-4 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 transition-all ${
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
