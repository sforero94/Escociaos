import { useState } from 'react';
import {
  LayoutDashboard,
  Package,
  Sprout,
  Activity,
  TrendingUp,
  DollarSign,
  MapPin,
  Settings,
  Menu,
  X,
  LogOut,
  Leaf,
} from 'lucide-react';
import { Button } from './ui/button';
import { useAuth } from '../contexts/AuthContext';

interface LayoutProps {
  currentView: string;
  onNavigate: (view: string) => void;
  children: React.ReactNode;
  userName?: string;
  userRole?: string;
  onLogout?: () => void;
}

export function Layout({ currentView, onNavigate, children }: LayoutProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const { profile, signOut } = useAuth();

  const handleLogout = async () => {
    await signOut();
  };

  const menuItems = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'inventory', label: 'Inventario', icon: Package },
    { id: 'applications', label: 'Aplicaciones', icon: Sprout },
    { id: 'monitoring', label: 'Monitoreo', icon: Activity },
    { id: 'production', label: 'Producción', icon: TrendingUp },
    { id: 'settings', label: 'Configuración', icon: Settings },
  ];

  return (
    <div className="min-h-screen bg-[#F8FAF5]">
      {/* Mobile Header */}
      <div className="lg:hidden bg-white/80 backdrop-blur-xl border-b border-[#73991C]/10 px-4 py-3 flex items-center justify-between sticky top-0 z-50 shadow-sm">
        <div className="flex items-center gap-2">
          <div className="w-9 h-9 bg-gradient-to-br from-[#73991C] to-[#BFD97D] rounded-xl flex items-center justify-center shadow-sm">
            <Leaf className="w-5 h-5 text-white" />
          </div>
          <span className="text-[#172E08]">Escocia Hass</span>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          className="hover:bg-[#E7EDDD]/50 rounded-xl"
        >
          {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
        </Button>
      </div>

      {/* Mobile Menu Overlay */}
      {mobileMenuOpen && (
        <div className="lg:hidden fixed inset-0 bg-[#172E08]/20 backdrop-blur-sm z-40" onClick={() => setMobileMenuOpen(false)} />
      )}

      {/* Mobile Menu */}
      <div
        className={`lg:hidden fixed top-[57px] left-0 right-0 bottom-0 bg-white/95 backdrop-blur-xl z-50 transform transition-transform ${
          mobileMenuOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <nav className="p-4 space-y-2">
          {menuItems.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                onClick={() => {
                  onNavigate(item.id);
                  setMobileMenuOpen(false);
                }}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 ${
                  currentView === item.id
                    ? 'bg-gradient-to-r from-[#73991C] to-[#BFD97D] text-white shadow-lg shadow-[#73991C]/20'
                    : 'text-[#172E08] hover:bg-[#E7EDDD]/50'
                }`}
              >
                <Icon className="w-5 h-5" />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>

        <div className="absolute bottom-0 left-0 right-0 p-4 border-t border-[#73991C]/10 bg-white/80 backdrop-blur-xl">
          <div className="mb-3 px-4">
            <p className="text-sm text-[#172E08]">{profile?.nombre || 'Usuario'}</p>
            <p className="text-xs text-[#4D240F]/60">{profile?.rol || 'Sin rol'}</p>
          </div>
          <Button
            onClick={handleLogout}
            variant="outline"
            className="w-full border-[#DC3545]/20 text-[#DC3545] hover:bg-[#DC3545]/5 rounded-xl"
          >
            <LogOut className="w-4 h-4 mr-2" />
            Cerrar Sesión
          </Button>
        </div>
      </div>

      {/* Desktop Sidebar */}
      <div className="hidden lg:block fixed left-0 top-0 bottom-0 w-64 bg-white/80 backdrop-blur-xl border-r border-[#73991C]/10 shadow-[4px_0_24px_rgba(115,153,28,0.04)]">
        {/* Logo */}
        <div className="p-6 border-b border-[#73991C]/10">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-gradient-to-br from-[#73991C] to-[#BFD97D] rounded-xl flex items-center justify-center shadow-lg shadow-[#73991C]/20">
              <Leaf className="w-7 h-7 text-white" />
            </div>
            <div>
              <h2 className="text-[#172E08]">Escocia Hass</h2>
              <p className="text-xs text-[#4D240F]/60">Sistema de Gestión</p>
            </div>
          </div>
        </div>

        {/* Navigation */}
        <nav className="p-4 space-y-2">
          {menuItems.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                onClick={() => onNavigate(item.id)}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 ${
                  currentView === item.id
                    ? 'bg-gradient-to-r from-[#73991C] to-[#BFD97D] text-white shadow-lg shadow-[#73991C]/20'
                    : 'text-[#172E08] hover:bg-[#E7EDDD]/50'
                }`}
              >
                <Icon className="w-5 h-5" />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>

        {/* User Info */}
        <div className="absolute bottom-0 left-0 right-0 p-4 border-t border-[#73991C]/10 bg-white/80 backdrop-blur-xl">
          <div className="mb-3 px-4">
            <p className="text-sm text-[#172E08]">{profile?.nombre || 'Usuario'}</p>
            <p className="text-xs text-[#4D240F]/60">{profile?.rol || 'Sin rol'}</p>
          </div>
          <Button
            onClick={handleLogout}
            variant="outline"
            className="w-full border-[#DC3545]/20 text-[#DC3545] hover:bg-[#DC3545]/5 rounded-xl"
          >
            <LogOut className="w-4 h-4 mr-2" />
            Cerrar Sesión
          </Button>
        </div>
      </div>

      {/* Main Content */}
      <div className="lg:ml-64">
        <main className="p-4 lg:p-8">{children}</main>
      </div>
    </div>
  );
}