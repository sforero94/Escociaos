import { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import * as TooltipPrimitive from '@radix-ui/react-tooltip';
import type { LucideIcon } from 'lucide-react';
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
  Wrench,
  DollarSign,
  FileText,
  PanelLeftClose,
  PanelLeftOpen,
  Cloud,
  Beef,
  Milk,
  ClipboardCheck,
  Bell,
  ChevronDown,
  TrendingDown,
  FileBarChart,
  Target,
  Syringe,
} from 'lucide-react';
import { Button } from './ui/button';
import { useAuth } from '../contexts/AuthContext';
import { puedeAccederModulo } from '@/utils/modulosAcceso';
import { ImageWithFallback } from './figma/ImageWithFallback';

interface LayoutProps {
  onNavigate?: (view: string) => void;
  children: React.ReactNode;
}

const SIDEBAR_COLLAPSED_KEY = 'sidebar_collapsed';

// ---------------------------------------------------------------------------
// Nav data model — grouped sidebar (accordion groups + single items)
// ---------------------------------------------------------------------------

type NavLeaf = {
  id: string;
  label: string;
  icon: LucideIcon;
  path: string;
  exact?: boolean;
  /** Extra prefix that also marks this leaf active (e.g. /finanzas dashboard sub-tabs). */
  matchPrefix?: string;
  soloGerencia?: boolean;
};
type NavGroup = { id: string; label: string; icon: LucideIcon; modulo: string; children: NavLeaf[] };
type NavEntry = (NavLeaf & { modulo?: string }) | NavGroup;

const isGroup = (e: NavEntry): e is NavGroup => 'children' in e;

const NAV: NavEntry[] = [
  { id: 'tablero', label: 'Tablero General', icon: LayoutDashboard, path: '/', exact: true },
  {
    id: 'aguacate', label: 'Aguacate', icon: Leaf, modulo: 'aguacate', children: [
      { id: 'labores', label: 'Labores', icon: Wrench, path: '/labores' },
      { id: 'monitoreo', label: 'Monitoreo', icon: Activity, path: '/monitoreo' },
      { id: 'aplicaciones', label: 'Aplicaciones', icon: Sprout, path: '/aplicaciones' },
      { id: 'inventario', label: 'Inventario', icon: Package, path: '/inventario/dashboard' },
      { id: 'clima', label: 'Clima', icon: Cloud, path: '/clima' },
      { id: 'produccion', label: 'Producción', icon: TrendingUp, path: '/produccion', soloGerencia: true },
      { id: 'reportes', label: 'Reportes', icon: FileText, path: '/reportes' },
    ],
  },
  {
    id: 'hato', label: 'Hato Lechero', icon: Milk, modulo: 'hato_lechero', children: [
      { id: 'hato-tablero', label: 'Tablero', icon: LayoutDashboard, path: '/hato-lechero', exact: true },
      { id: 'hato-produccion', label: 'Producción', icon: TrendingUp, path: '/hato-lechero/produccion' },
      { id: 'hato-hato', label: 'Hato', icon: Beef, path: '/hato-lechero/hato' },
      { id: 'hato-chequeos', label: 'Chequeos', icon: ClipboardCheck, path: '/hato-lechero/chequeos' },
      { id: 'hato-alertas', label: 'Alertas', icon: Bell, path: '/hato-lechero/alertas' },
      { id: 'hato-pajillas', label: 'Pajillas', icon: Syringe, path: '/hato-lechero/pajillas' },
    ],
  },
  { id: 'ganado', label: 'Ganado', icon: Beef, path: '/ganado', modulo: 'ganado' },
  {
    id: 'finanzas', label: 'Finanzas', icon: DollarSign, modulo: 'finanzas', children: [
      { id: 'fin-dashboard', label: 'Dashboard', icon: LayoutDashboard, path: '/finanzas', exact: true, matchPrefix: '/finanzas/dashboard' },
      { id: 'fin-gastos', label: 'Gastos', icon: TrendingDown, path: '/finanzas/gastos' },
      { id: 'fin-ingresos', label: 'Ingresos', icon: TrendingUp, path: '/finanzas/ingresos' },
      { id: 'fin-reportes', label: 'Reportes', icon: FileBarChart, path: '/finanzas/reportes' },
      { id: 'fin-presupuesto', label: 'Presupuesto', icon: Target, path: '/finanzas/presupuesto' },
      { id: 'fin-configuracion', label: 'Configuración', icon: Settings, path: '/finanzas/configuracion' },
    ],
  },
  { id: 'settings', label: 'Configuración', icon: Settings, path: '/configuracion' },
];

/** True when the current pathname should highlight this leaf. */
function leafMatches(leaf: NavLeaf, pathname: string): boolean {
  const base = leaf.exact || leaf.path === '/'
    ? pathname === leaf.path
    : pathname.startsWith(leaf.path);
  return base || (leaf.matchPrefix ? pathname.startsWith(leaf.matchPrefix) : false);
}

/** First group (in NAV order) containing a leaf matching the given pathname, if any. */
function getActiveGroupId(pathname: string): string | undefined {
  for (const entry of NAV) {
    if (isGroup(entry)) {
      if (entry.children.some((child) => leafMatches(child, pathname))) return entry.id;
    }
  }
  return undefined;
}

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

  // Accordion groups open state — initialized so the group containing the active route is open.
  const [openGroups, setOpenGroups] = useState<Set<string>>(() => {
    const activeId = getActiveGroupId(location.pathname);
    return activeId ? new Set([activeId]) : new Set();
  });

  // Auto-open the active group on navigation, without force-closing groups the user opened.
  useEffect(() => {
    const activeId = getActiveGroupId(location.pathname);
    if (!activeId) return;
    setOpenGroups((prev) => {
      if (prev.has(activeId)) return prev;
      const next = new Set(prev);
      next.add(activeId);
      return next;
    });
  }, [location.pathname]);

  // Lock body scroll when mobile menu is open
  useEffect(() => {
    if (mobileMenuOpen) {
      const scrollY = window.scrollY;
      document.body.style.overflow = 'hidden';
      document.body.style.position = 'fixed';
      document.body.style.top = `-${scrollY}px`;
      document.body.style.width = '100%';
      return () => {
        document.body.style.overflow = '';
        document.body.style.position = '';
        document.body.style.top = '';
        document.body.style.width = '';
        window.scrollTo(0, scrollY);
      };
    }
  }, [mobileMenuOpen]);

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

  const isActive = (leaf: NavLeaf) => leafMatches(leaf, location.pathname);

  const handleNavigateClick = (path: string, id: string) => {
    if (onNavigate) onNavigate(id);
    navigate(path);
    setMobileMenuOpen(false);
  };

  const toggleGroup = (groupId: string) => {
    setOpenGroups((prev) => {
      const next = new Set(prev);
      if (next.has(groupId)) next.delete(groupId);
      else next.add(groupId);
      return next;
    });
  };

  // Clicking a group icon while collapsed un-collapses the sidebar AND expands the group.
  const handleGroupIconClick = (groupId: string) => {
    setCollapsed(false);
    localStorage.setItem(SIDEBAR_COLLAPSED_KEY, 'false');
    setOpenGroups((prev) => {
      if (prev.has(groupId)) return prev;
      const next = new Set(prev);
      next.add(groupId);
      return next;
    });
  };

  // Fail-open: unconfirmed profile (null or rol==='') is treated as Gerencia for the
  // soloGerencia gate, consistent with puedeAccederModulo's fail-open behavior.
  const rolSinConfirmar = !profile || profile.rol === '';
  const esGerencia = profile?.rol === 'Gerencia';
  const leafVisible = (l: NavLeaf) => !l.soloGerencia || esGerencia || rolSinConfirmar;

  const visible = NAV
    .filter((e) => isGroup(e)
      ? puedeAccederModulo(profile, e.modulo)
      : (e.modulo ? puedeAccederModulo(profile, e.modulo) : true) && leafVisible(e as NavLeaf))
    .map((e) => isGroup(e) ? { ...e, children: e.children.filter(leafVisible) } : e)
    .filter((e) => !isGroup(e) || e.children.length > 0);

  // Render a single nav entry (group or leaf) for the DESKTOP sidebar (collapsed-aware).
  const renderDesktopEntry = (entry: NavEntry) => {
    if (isGroup(entry)) {
      const Icon = entry.icon;
      const groupActive = entry.children.some((c) => isActive(c));
      const open = openGroups.has(entry.id);

      if (collapsed) {
        return (
          <SidebarTooltip key={entry.id} label={entry.label} collapsed={collapsed}>
            <button
              onClick={() => handleGroupIconClick(entry.id)}
              className={`w-full flex items-center justify-center px-0 py-3 rounded-xl transition-all duration-200 ${
                groupActive ? 'nav-item-active font-semibold' : 'text-foreground hover:bg-muted/50'
              }`}
            >
              <Icon className="w-5 h-5 flex-shrink-0" />
            </button>
          </SidebarTooltip>
        );
      }

      return (
        <div key={entry.id}>
          <button
            onClick={() => toggleGroup(entry.id)}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 ${
              groupActive ? 'nav-item-active font-semibold' : 'text-foreground hover:bg-muted/50'
            }`}
          >
            <Icon className="w-5 h-5 flex-shrink-0" />
            <span className="flex-1 text-left truncate">{entry.label}</span>
            <ChevronDown className={`w-4 h-4 flex-shrink-0 transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
          </button>
          {open && (
            <div className="space-y-1 mt-1">
              {entry.children.map((child) => {
                const ChildIcon = child.icon;
                const childActive = isActive(child);
                return (
                  <button
                    key={child.id}
                    onClick={() => handleNavigateClick(child.path, child.id)}
                    className={`w-full flex items-center gap-3 pl-9 pr-4 py-2.5 rounded-xl transition-all duration-200 ${
                      childActive
                        ? 'nav-item-active font-semibold'
                        : 'text-foreground hover:bg-muted/50'
                    }`}
                  >
                    <ChildIcon className="w-4 h-4 flex-shrink-0" />
                    <span className="truncate">{child.label}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      );
    }

    const Icon = entry.icon;
    const active = isActive(entry);
    return (
      <SidebarTooltip key={entry.id} label={entry.label} collapsed={collapsed}>
        <button
          onClick={() => handleNavigateClick(entry.path, entry.id)}
          className={`w-full flex items-center rounded-xl transition-all duration-200 ${
            collapsed ? 'justify-center px-0 py-3' : 'gap-3 px-4 py-3'
          } ${
            active
              ? 'nav-item-active font-semibold'
              : 'text-foreground hover:bg-muted/50'
          }`}
        >
          <Icon className="w-5 h-5 flex-shrink-0" />
          {!collapsed && <span className="truncate">{entry.label}</span>}
        </button>
      </SidebarTooltip>
    );
  };

  // Render a single nav entry (group or leaf) for the MOBILE drawer (no collapse concept).
  const renderMobileEntry = (entry: NavEntry) => {
    if (isGroup(entry)) {
      const Icon = entry.icon;
      const groupActive = entry.children.some((c) => isActive(c));
      const open = openGroups.has(entry.id);

      return (
        <div key={entry.id}>
          <button
            onClick={() => toggleGroup(entry.id)}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 ${
              groupActive ? 'nav-item-active font-semibold' : 'text-foreground hover:bg-muted/50'
            }`}
          >
            <Icon className="w-5 h-5 flex-shrink-0" />
            <span className="flex-1 text-left truncate">{entry.label}</span>
            <ChevronDown className={`w-4 h-4 flex-shrink-0 transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
          </button>
          {open && (
            <div className="space-y-1 mt-1">
              {entry.children.map((child) => {
                const ChildIcon = child.icon;
                const childActive = isActive(child);
                return (
                  <button
                    key={child.id}
                    onClick={() => handleNavigateClick(child.path, child.id)}
                    className={`w-full flex items-center gap-3 pl-9 pr-4 py-3 rounded-xl transition-all duration-200 ${
                      childActive
                        ? 'nav-item-active font-semibold'
                        : 'text-foreground hover:bg-muted/50'
                    }`}
                  >
                    <ChildIcon className="w-5 h-5 flex-shrink-0" />
                    <span>{child.label}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      );
    }

    const Icon = entry.icon;
    const active = isActive(entry);
    return (
      <button
        key={entry.id}
        onClick={() => handleNavigateClick(entry.path, entry.id)}
        className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 ${
          active
            ? 'nav-item-active font-semibold'
            : 'text-foreground hover:bg-muted/50'
        }`}
      >
        <Icon className="w-5 h-5" />
        <span>{entry.label}</span>
      </button>
    );
  };

  return (
    <TooltipPrimitive.Provider delayDuration={0}>
      <div className="min-h-screen min-h-[100dvh] bg-background">
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
          className={`lg:hidden fixed top-[57px] left-0 right-0 bottom-0 bg-white/95 backdrop-blur-xl z-50 transform transition-transform duration-300 ${
            mobileMenuOpen ? 'translate-x-0' : '-translate-x-full'
          }`}
        >
          <div className="flex flex-col h-full">
            <nav className="flex-1 p-4 space-y-2 overflow-y-auto overscroll-contain">
              {visible.map((entry) => renderMobileEntry(entry))}
            </nav>

            <div className="flex-shrink-0 p-4 border-t border-primary/10 bg-white/80 backdrop-blur-xl pb-[env(safe-area-inset-bottom,1rem)]">
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
            {visible.map((entry) => renderDesktopEntry(entry))}
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
        <div id="main-content" className="transition-[margin] duration-300 min-h-[100dvh]">
          <main className="p-4 lg:p-8 pb-20 lg:pb-8">{children}</main>
        </div>
      </div>
    </TooltipPrimitive.Provider>
  );
}
