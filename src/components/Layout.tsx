import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import * as TooltipPrimitive from '@radix-ui/react-tooltip';
import {
  LayoutDashboard,
  Package,
  Sprout,
  Activity,
  TrendingUp,
  Settings,
  Menu,
  X,
  LogOut,
  Leaf,
  Users,
  Wrench,
  DollarSign,
  FileText,
  PanelLeftClose,
  PanelLeftOpen,
  Cloud,
} from 'lucide-react';
import { Button } from './ui/button';
import { useAuth } from '../contexts/AuthContext';
import { ImageWithFallback } from './figma/ImageWithFallback';

interface LayoutProps {
  onNavigate?: (view: string) => void;
  children: React.ReactNode;
}

const SIDEBAR_COLLAPSED_KEY = 'sidebar_collapsed';

const menuStructure = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, path: '/' },
  { id: 'inventario', label: 'Inventario', icon: Package, path: '/inventario/dashboard' },
  { id: 'labores', label: 'Labores', icon: Wrench, path: '/labores' },
  { id: 'empleados', label: 'Empleados', icon: Users, path: '/empleados' },
  { id: 'finanzas', label: 'Finanzas', icon: DollarSign, path: '/finanzas' },
  { id: 'applications', label: 'Aplicaciones', icon: Sprout, path: '/aplicaciones' },
  { id: 'monitoring', label: 'Monitoreo', icon: Activity, path: '/monitoreo' },
  { id: 'clima', label: 'Clima', icon: Cloud, path: '/clima' },
  { id: 'production', label: 'Produccion', icon: TrendingUp, path: '/produccion' },
  { id: 'reportes', label: 'Reportes', icon: FileText, path: '/reportes' },
  { id: 'settings', label: 'Configuracion', icon: Settings, path: '/configuracion' },
];

interface SidebarTooltipProps {
  label: string;
  collapsed: boolean;
  children: React.ReactNode;
}

function SidebarTooltip({ label, collapsed, children }: SidebarTooltipProps) {
  if (!collapsed) return <>{children}</>;
  return (
    <TooltipPrimitive.Root delayDuration={0}>
      <TooltipPrimitive.Trigger asChild>
        {children}
      </TooltipPrimitive.Trigger>
      <TooltipPrimitive.Portal>
        <TooltipPrimitive.Content
          side="right"
          sideOffset={12}
          className="z-[100] px-3 py-1.5 text-sm font-medium rounded-lg shadow-xl"
          style={{ backgroundColor: '#172E08', color: '#ffffff' }}
        >
          {label}
          <TooltipPrimitive.Arrow style={{ fill: '#172E08' }} />
        </TooltipPrimitive.Content>
      </TooltipPrimitive.Portal>
    </TooltipPrimitive.Root>
  );
}

export function Layout({ onNavigate, children }: LayoutProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === 'true');
  const { profile, signOut } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await signOut();
  };

  const toggleCollapsed = () => {
    setCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem(SIDEBAR_COLLAPSED_KEY, String(next));
      return next;
    });
  };

  const isActive = (path: string) => {
    if (path === '/') return location.pathname === '/';
    return location.pathname.startsWith(path);
  };

  const handleNavigateClick = (path: string, id: string) => {
    if (onNavigate) onNavigate(id);
    navigate(path);
    setMobileMenuOpen(false);
  };

  return (
    <TooltipPrimitive.Provider delayDuration={0}>
      <div className="min-h-screen bg-background">
        {/* Mobile Header */}
        <div className="lg:hidden bg-white/80 backdrop-blur-xl border-b border-primary/10 px-4 py-3 flex items-center justify-between sticky top-0 z-50 shadow-sm">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 bg-gradient-to-br from-primary to-secondary rounded-xl flex items-center justify-center shadow-sm">
              <Leaf className="w-5 h-5 text-white" />
            </div>
            <span className="text-foreground">Escocia Hass</span>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="hover:bg-muted/50 rounded-xl"
          >
            {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </Button>
        </div>

        {/* Mobile Menu Overlay */}
        {mobileMenuOpen && (
          <div
            className="lg:hidden fixed inset-0 bg-foreground/20 backdrop-blur-sm z-40"
            onClick={() => setMobileMenuOpen(false)}
          />
        )}

        {/* Mobile Menu */}
        <div
          className={`lg:hidden fixed top-[57px] left-0 right-0 bottom-0 bg-white/95 backdrop-blur-xl z-50 transform transition-transform ${
            mobileMenuOpen ? 'translate-x-0' : '-translate-x-full'
          }`}
        >
          <nav className="p-4 space-y-2 overflow-y-auto h-[calc(100%-120px)]">
            {menuStructure.map((item) => {
              const Icon = item.icon;
              const active = isActive(item.path);
              return (
                <button
                  key={item.id}
                  onClick={() => handleNavigateClick(item.path, item.id)}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 ${
                    active
                      ? 'bg-gradient-to-r from-primary to-secondary text-white shadow-lg shadow-primary/20'
                      : 'text-foreground hover:bg-muted/50'
                  }`}
                >
                  <Icon className="w-5 h-5" />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </nav>

          <div className="absolute bottom-0 left-0 right-0 p-4 border-t border-primary/10 bg-white/80 backdrop-blur-xl">
            <div className="mb-3 px-4">
              <p className="text-sm text-foreground">{profile?.nombre || 'Usuario'}</p>
              <p className="text-xs text-brand-brown/60">{profile?.rol || 'Sin rol'}</p>
            </div>
            <Button
              onClick={handleLogout}
              variant="outline"
              className="w-full border-destructive/20 text-destructive hover:bg-destructive/5 rounded-xl"
            >
              <LogOut className="w-4 h-4 mr-2" />
              Cerrar Sesion
            </Button>
          </div>
        </div>

        {/* Desktop Sidebar */}
        <div
          className="hidden lg:block fixed left-0 top-0 bottom-0 bg-white/80 backdrop-blur-xl border-r border-primary/10 shadow-[4px_0_24px_rgba(115,153,28,0.04)] transition-[width] duration-300 z-40"
          style={{ width: collapsed ? '72px' : '16rem' }}
        >
        <div className="flex flex-col h-full">
          {/* Logo + collapse toggle */}
          <div className={`border-b border-primary/10 flex items-center flex-shrink-0 ${collapsed ? 'px-3 py-4 justify-center' : 'px-4 py-4 gap-3'}`}>
            <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center shadow-lg shadow-primary/20 overflow-hidden flex-shrink-0">
              <ImageWithFallback
                src="https://ywhtjwawnkeqlwxbvgup.supabase.co/storage/v1/object/sign/photos/ehlogo.png?token=eyJraWQiOiJzdG9yYWdlLXVybC1zaWduaW5nLWtleV80N2U5N2FlMi1lMDc1LTRiNzEtODI0Ny1mMzgwOGYzYzM0ODIiLCJhbGciOiJIUzI1NiJ9.eyJ1cmwiOiJwaG90b3MvZWhsb2dvLnBuZyIsImlhdCI6MTc2NDAzMzkwNSwiZXhwIjoyMDc5MzkzOTA1fQ.T74UbHfbH9pZ9Xqj35Ljb3dPmIP7f6YpSJPFRoN-83o"
                alt="Escocia Hass Logo"
                className="w-full h-full object-cover"
              />
            </div>
            {!collapsed && (
              <>
                <div className="flex-1 min-w-0">
                  <h2 className="text-foreground truncate">Escocia Hass</h2>
                  <p className="text-xs text-brand-brown/60">Sistema de Gestion</p>
                </div>
                <button
                  onClick={toggleCollapsed}
                  className="flex-shrink-0 p-1.5 rounded-lg hover:bg-muted/50 text-brand-brown/40 hover:text-foreground transition-colors"
                >
                  <PanelLeftClose className="w-4 h-4" />
                </button>
              </>
            )}
          </div>

          {/* Expand button when collapsed — sits right below logo */}
          {collapsed && (
            <div className="flex justify-center py-2 border-b border-primary/5 flex-shrink-0">
              <button
                onClick={toggleCollapsed}
                className="p-1.5 rounded-lg hover:bg-muted/50 text-brand-brown/40 hover:text-foreground transition-colors"
              >
                <PanelLeftOpen className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* Navigation */}
          <nav className={`flex-1 overflow-y-auto overflow-x-hidden space-y-1 ${collapsed ? 'px-2 py-2' : 'p-2'}`}>
            {menuStructure.map((item) => {
              const Icon = item.icon;
              const active = isActive(item.path);
              return (
                <SidebarTooltip key={item.id} label={item.label} collapsed={collapsed}>
                  <button
                    onClick={() => handleNavigateClick(item.path, item.id)}
                    className={`w-full flex items-center rounded-xl transition-all duration-200 ${
                      collapsed ? 'justify-center px-0 py-3' : 'gap-3 px-4 py-3'
                    } ${
                      active
                        ? 'bg-gradient-to-r from-primary to-secondary text-white shadow-lg shadow-primary/20'
                        : 'text-foreground hover:bg-muted/50'
                    }`}
                  >
                    <Icon className="w-5 h-5 flex-shrink-0" />
                    {!collapsed && <span className="truncate">{item.label}</span>}
                  </button>
                </SidebarTooltip>
              );
            })}
          </nav>

          {/* User Info - Desktop */}
          <div className="flex-shrink-0 border-t border-primary/10 bg-white/80 backdrop-blur-xl p-3">
            {!collapsed && (
              <div className="mb-2 px-2">
                <p className="text-sm text-foreground truncate">{profile?.nombre || 'Usuario'}</p>
                <p className="text-xs text-brand-brown/60">{profile?.rol || 'Sin rol'}</p>
              </div>
            )}
            <SidebarTooltip label="Cerrar Sesion" collapsed={collapsed}>
              <Button
                onClick={handleLogout}
                variant="outline"
                className={`w-full border-destructive/20 text-destructive hover:bg-destructive/5 rounded-xl ${collapsed ? 'px-0 justify-center' : ''}`}
              >
                <LogOut className="w-4 h-4 flex-shrink-0" />
                {!collapsed && <span className="ml-2">Cerrar Sesion</span>}
              </Button>
            </SidebarTooltip>
          </div>
        </div>
        </div>

        {/* Main Content — margin only on lg+ where sidebar is visible */}
        <style>{`
          @media (min-width: 1024px) {
            #main-content { margin-left: ${collapsed ? '72px' : '16rem'}; }
          }
        `}</style>
        <div id="main-content" className="transition-[margin] duration-300">
          <main className="p-4 lg:p-8">{children}</main>
        </div>
      </div>
    </TooltipPrimitive.Provider>
  );
}
