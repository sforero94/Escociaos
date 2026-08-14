import { useState, useEffect, useRef } from 'react';
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
  Wrench,
  DollarSign,
  FileText,
  PanelLeftClose,
  PanelLeftOpen,
  Cloud,
  Beef,
  ClipboardCheck,
  Bell,
  TrendingDown,
  FileBarChart,
  Target,
  Syringe,
} from 'lucide-react';
import { Button } from './ui/button';
import { useAuth } from '../contexts/AuthContext';
import { puedeAccederModulo } from '@/utils/modulosAcceso';
import { calcularScrollNearest } from '@/utils/scrollNearest';
import { ImageWithFallback } from './figma/ImageWithFallback';

interface LayoutProps {
  onNavigate?: (view: string) => void;
  children: React.ReactNode;
}

const SIDEBAR_COLLAPSED_KEY = 'sidebar_collapsed';

// ---------------------------------------------------------------------------
// Custom icons — no avocado/cow icon exists in lucide-react or any other
// icon set available to this project (verified). Kept minimal and matched
// to the lucide stroke conventions (stroke-based, strokeWidth 2, currentColor)
// so they sit visually consistent next to real lucide icons in the nav.
// ---------------------------------------------------------------------------

function AvocadoIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M12 2.5c-.9 0-1.6.6-1.9 1.5C7.8 4.6 6 7.3 6 11c0 5.7 3 9.5 6 9.5s6-3.8 6-9.5c0-3.7-1.8-6.4-4.1-7C13.6 3.1 12.9 2.5 12 2.5Z" />
      <circle cx="12" cy="13" r="3.4" />
    </svg>
  );
}

function CowIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={className}>
      <ellipse cx="12" cy="12.5" rx="5.6" ry="5" />
      <ellipse cx="6.2" cy="9" rx="1.7" ry="2.5" transform="rotate(-25 6.2 9)" />
      <ellipse cx="17.8" cy="9" rx="1.7" ry="2.5" transform="rotate(25 17.8 9)" />
      <path d="M9.7 6.3 9 4.5M14.3 6.3l.7-1.8" />
      <circle cx="9.8" cy="11.5" r=".8" fill="currentColor" />
      <circle cx="14.2" cy="11.5" r=".8" fill="currentColor" />
      <rect x="8.6" y="14.3" width="6.8" height="3.6" rx="1.8" />
      <circle cx="10.3" cy="16.1" r=".45" fill="currentColor" />
      <circle cx="13.7" cy="16.1" r=".45" fill="currentColor" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Nav data model — always-expanded modules (no accordion) + single items.
// A "module" (NavGroup) renders a fixed, non-clickable header with its
// children always visible below it. `cardStyle` marks single-item leaves
// (Ganado, Configuración) that should render with the same module-card
// treatment even though they have no children — see renderDesktopEntry.
// ---------------------------------------------------------------------------

type IconComponent = LucideIcon | React.FC<{ className?: string }>;

type NavLeaf = {
  id: string;
  label: string;
  icon: IconComponent;
  path: string;
  exact?: boolean;
  /** Extra prefix that also marks this leaf active (e.g. /finanzas dashboard sub-tabs). */
  matchPrefix?: string;
  soloGerencia?: boolean;
  /** Render as a module-style card (brand-brown header, bg-primary/5) even without children. */
  cardStyle?: boolean;
};
type NavGroup = { id: string; label: string; icon: IconComponent; modulo: string; children: NavLeaf[] };
type NavEntry = (NavLeaf & { modulo?: string }) | NavGroup;

const isGroup = (e: NavEntry): e is NavGroup => 'children' in e;

const NAV: NavEntry[] = [
  { id: 'tablero', label: 'Tablero General', icon: LayoutDashboard, path: '/', exact: true },
  {
    id: 'aguacate', label: 'Aguacate', icon: AvocadoIcon, modulo: 'aguacate', children: [
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
    id: 'hato', label: 'Hato Lechero', icon: CowIcon, modulo: 'hato_lechero', children: [
      { id: 'hato-tablero', label: 'Tablero', icon: LayoutDashboard, path: '/hato-lechero', exact: true },
      { id: 'hato-produccion', label: 'Producción', icon: TrendingUp, path: '/hato-lechero/produccion' },
      { id: 'hato-hato', label: 'Hato', icon: Beef, path: '/hato-lechero/hato' },
      { id: 'hato-chequeos', label: 'Chequeos', icon: ClipboardCheck, path: '/hato-lechero/chequeos' },
      { id: 'hato-alertas', label: 'Alertas', icon: Bell, path: '/hato-lechero/alertas' },
      { id: 'hato-pajillas', label: 'Pajillas', icon: Syringe, path: '/hato-lechero/pajillas' },
    ],
  },
  { id: 'ganado', label: 'Ganado', icon: Beef, path: '/ganado', modulo: 'ganado', cardStyle: true },
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
  { id: 'settings', label: 'Configuración', icon: Wrench, path: '/configuracion', cardStyle: true },
];

/** True when the current pathname should highlight this leaf. */
function leafMatches(leaf: NavLeaf, pathname: string): boolean {
  const base = leaf.exact || leaf.path === '/'
    ? pathname === leaf.path
    : pathname.startsWith(leaf.path);
  return base || (leaf.matchPrefix ? pathname.startsWith(leaf.matchPrefix) : false);
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

  // Refs for the scroll-into-view fix below. Only one entry can be active at
  // a time, so the same ref is safely reused across the branches of
  // renderDesktopEntry/renderMobileEntry that could render "the" active item.
  const desktopNavRef = useRef<HTMLElement>(null);
  const desktopActiveRef = useRef<HTMLButtonElement>(null);
  const mobileNavRef = useRef<HTMLElement>(null);
  const mobileActiveRef = useRef<HTMLButtonElement>(null);

  // Keep the active nav item visible inside its own scroll container.
  // Regression from turning the Tailwind compiler on (plan_tailwind_pipeline.md,
  // fase F2 #1): nav items grew from ~31px to 44-48px real padding, so with
  // all modules always expanded the nav's content can be taller than the
  // container — the container already scrolls, but nothing was moving that
  // scroll to the active item, so it could render clipped behind the profile
  // block. `calcularScrollNearest` returns null when the item is already
  // visible, so this never causes a jump on a navigation that didn't need
  // one. Depends on collapsed/mobileMenuOpen too (not just pathname) because
  // the sidebar can still be collapsed — or the mobile menu just opened — at
  // the exact moment the route changes; this re-checks once the layout
  // settles instead of racing that transition.
  useEffect(() => {
    const ajustar = (contenedor: HTMLElement | null, item: HTMLElement | null) => {
      if (!contenedor || !item) return;
      const contRect = contenedor.getBoundingClientRect();
      const itemRect = item.getBoundingClientRect();
      const nuevoScrollTop = calcularScrollNearest(
        { top: contRect.top, height: contRect.height, scrollTop: contenedor.scrollTop },
        { top: itemRect.top, height: itemRect.height },
      );
      if (nuevoScrollTop !== null) {
        contenedor.scrollTop = nuevoScrollTop;
      }
    };

    ajustar(desktopNavRef.current, desktopActiveRef.current);
    ajustar(mobileNavRef.current, mobileActiveRef.current);
  }, [location.pathname, collapsed, mobileMenuOpen]);

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

  // Every first-level rail icon (Tablero General, Aguacate, Hato Lechero,
  // Ganado, Finanzas, Configuración) shares one click handler: expand the
  // sidebar. There is no "closed group" to also open anymore — once
  // expanded, a module's children (or a card leaf's own row) are already
  // visible, so a single un-collapse is the whole interaction.
  const handleRailIconClick = () => {
    setCollapsed(false);
    localStorage.setItem(SIDEBAR_COLLAPSED_KEY, 'false');
  };

  /** True when a group has an active child, or a leaf is itself active. */
  const isEntryActive = (entry: NavEntry): boolean =>
    isGroup(entry) ? entry.children.some((c) => isActive(c)) : isActive(entry);

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
    // Collapsed rail: every first-level entry renders as the same centered
    // icon button. Children never show in this mode. A group has no path of
    // its own, so its icon just expands the rail (there is no "closed group"
    // to also open anymore); a leaf DOES have a path, so it keeps navigating
    // straight there in one click — same as today, don't make it two clicks.
    if (collapsed) {
      const Icon = entry.icon;
      const active = isEntryActive(entry);
      return (
        <SidebarTooltip key={entry.id} label={entry.label} collapsed={collapsed}>
          <button
            ref={active ? desktopActiveRef : undefined}
            onClick={isGroup(entry) ? handleRailIconClick : () => handleNavigateClick(entry.path, entry.id)}
            className={`w-full flex items-center justify-center px-0 py-3 rounded-xl transition-all duration-200 ${
              active ? 'nav-item-active font-semibold' : 'text-foreground hover:bg-muted/50'
            }`}
          >
            <Icon className="w-5 h-5 flex-shrink-0" />
          </button>
        </SidebarTooltip>
      );
    }

    // Module card: fixed, non-clickable header + always-visible children on
    // a connector line. No accordion — nothing to open or close.
    if (isGroup(entry)) {
      const Icon = entry.icon;

      return (
        <div key={entry.id} className="bg-primary/5 rounded-2xl pt-[7px] px-2 pb-2">
          <div className="flex items-center gap-2 px-2 h-7 text-brand-brown cursor-default">
            <Icon className="w-[15px] h-[15px] flex-shrink-0" />
            <span className="text-[11px] font-bold uppercase tracking-wide truncate">{entry.label}</span>
          </div>
          <div className="ml-[17px] pl-[15px] border-l border-border space-y-0.5">
            {entry.children.map((child) => {
              const childActive = isActive(child);
              return (
                <button
                  key={child.id}
                  ref={childActive ? desktopActiveRef : undefined}
                  onClick={() => handleNavigateClick(child.path, child.id)}
                  className={`w-full flex items-center px-2 h-[27px] rounded-lg text-[13px] font-medium transition-all duration-200 ${
                    childActive
                      ? 'nav-item-active font-semibold'
                      : 'text-foreground hover:bg-muted/50'
                  }`}
                >
                  <span className="truncate">{child.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      );
    }

    const Icon = entry.icon;
    const active = isActive(entry);

    // Card leaves (Ganado, Configuración): same module-card shell as a group,
    // but the header itself is the clickable/active row — there are no
    // children to reveal underneath it.
    if (entry.cardStyle) {
      return (
        <div key={entry.id} className="bg-primary/5 rounded-2xl pt-[7px] px-2 pb-2">
          <button
            ref={active ? desktopActiveRef : undefined}
            onClick={() => handleNavigateClick(entry.path, entry.id)}
            className={`w-full flex items-center gap-2 px-2 h-7 rounded-lg cursor-pointer transition-all duration-200 ${
              active ? 'nav-item-active font-semibold' : 'text-brand-brown hover:bg-primary/10'
            }`}
          >
            <Icon className="w-[15px] h-[15px] flex-shrink-0" />
            <span className="text-[11px] font-bold uppercase tracking-wide truncate">{entry.label}</span>
          </button>
        </div>
      );
    }

    // Plain single-item leaf (Tablero General): no card, but same brand-brown
    // resting color as every other top-level entry so it doesn't read as a
    // different (default-foreground/black) treatment next to them.
    return (
      <SidebarTooltip key={entry.id} label={entry.label} collapsed={collapsed}>
        <button
          ref={active ? desktopActiveRef : undefined}
          onClick={() => handleNavigateClick(entry.path, entry.id)}
          className={`w-full flex items-center gap-3 px-4 h-[34px] rounded-xl transition-all duration-200 ${
            active
              ? 'nav-item-active font-semibold'
              : 'text-brand-brown hover:bg-primary/10'
          }`}
        >
          <Icon className="w-5 h-5 flex-shrink-0" />
          <span className="truncate">{entry.label}</span>
        </button>
      </SidebarTooltip>
    );
  };

  // Render a single nav entry (group or leaf) for the MOBILE drawer (no collapse concept).
  // Same card/connector-line treatment as desktop; children stay at the 44px
  // touch floor instead of shrinking to the desktop 27px row.
  const renderMobileEntry = (entry: NavEntry) => {
    if (isGroup(entry)) {
      const Icon = entry.icon;

      return (
        <div key={entry.id} className="bg-primary/5 rounded-2xl pt-[7px] px-2 pb-2">
          <div className="flex items-center gap-2 px-2 h-7 text-brand-brown cursor-default">
            <Icon className="w-[15px] h-[15px] flex-shrink-0" />
            <span className="text-[11px] font-bold uppercase tracking-wide truncate">{entry.label}</span>
          </div>
          <div className="ml-[17px] pl-[15px] border-l border-border space-y-0.5 mt-1">
            {entry.children.map((child) => {
              const childActive = isActive(child);
              return (
                <button
                  key={child.id}
                  ref={childActive ? mobileActiveRef : undefined}
                  onClick={() => handleNavigateClick(child.path, child.id)}
                  className={`w-full flex items-center h-11 px-2 rounded-lg transition-all duration-200 ${
                    childActive
                      ? 'nav-item-active font-semibold'
                      : 'text-foreground hover:bg-muted/50'
                  }`}
                >
                  <span>{child.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      );
    }

    const Icon = entry.icon;
    const active = isActive(entry);

    // Card leaves (Ganado, Configuración): same brand-brown clickable card as desktop.
    if (entry.cardStyle) {
      return (
        <div key={entry.id} className="bg-primary/5 rounded-2xl pt-[7px] px-2 pb-2">
          <button
            ref={active ? mobileActiveRef : undefined}
            onClick={() => handleNavigateClick(entry.path, entry.id)}
            className={`w-full flex items-center gap-2 h-11 px-2 rounded-lg transition-all duration-200 ${
              active ? 'nav-item-active font-semibold' : 'text-brand-brown hover:bg-primary/10'
            }`}
          >
            <Icon className="w-[15px] h-[15px] flex-shrink-0" />
            <span className="text-[11px] font-bold uppercase tracking-wide truncate">{entry.label}</span>
          </button>
        </div>
      );
    }

    return (
      <button
        key={entry.id}
        ref={active ? mobileActiveRef : undefined}
        onClick={() => handleNavigateClick(entry.path, entry.id)}
        className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 ${
          active
            ? 'nav-item-active font-semibold'
            : 'text-brand-brown hover:bg-primary/10'
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
            <div className="w-9 h-9 bg-white rounded-xl flex items-center justify-center shadow-sm overflow-hidden flex-shrink-0">
              <ImageWithFallback
                src="https://ywhtjwawnkeqlwxbvgup.supabase.co/storage/v1/object/sign/photos/ehlogo.png?token=eyJraWQiOiJzdG9yYWdlLXVybC1zaWduaW5nLWtleV80N2U5N2FlMi1lMDc1LTRiNzEtODI0Ny1mMzgwOGYzYzM0ODIiLCJhbGciOiJIUzI1NiJ9.eyJ1cmwiOiJwaG90b3MvZWhsb2dvLnBuZyIsImlhdCI6MTc2NDAzMzkwNSwiZXhwIjoyMDc5MzkzOTA1fQ.T74UbHfbH9pZ9Xqj35Ljb3dPmIP7f6YpSJPFRoN-83o"
                alt="Escocia Hass Logo"
                className="w-full h-full object-cover"
              />
            </div>
            <span className="text-foreground">Escocia Hass</span>
          </div>
          {/* `size="icon"` y no `sm`: solo contiene un ícono, y esa variante da
              44x44 en móvil (piso táctil de docs/sistema-visual.md). Con `sm` el
              alto llegaba a 44 pero el ancho se quedaba en 36, y este es el
              control que más se toca en toda la app móvil. */}
          <Button
            variant="ghost"
            size="icon"
            aria-label={mobileMenuOpen ? 'Cerrar menú' : 'Abrir menú'}
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
            <nav ref={mobileNavRef} className="flex-1 p-4 space-y-2 overflow-y-auto overscroll-contain">
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
          style={{ width: collapsed ? '64px' : '236px' }}
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
          <nav ref={desktopNavRef} className={`flex-1 overflow-y-auto overflow-x-hidden space-y-1 ${collapsed ? 'px-2 py-2' : 'p-2'}`}>
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
            #main-content { margin-left: ${collapsed ? '64px' : '236px'}; }
          }
        `}</style>
        <div id="main-content" className="transition-[margin] duration-300 min-h-[100dvh]">
          <main className="p-4 lg:p-8 pb-20 lg:pb-8">{children}</main>
        </div>
      </div>
    </TooltipPrimitive.Provider>
  );
}
