import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { SafeModeProvider } from './contexts/SafeModeContext';
import { ProtectedRoute } from './components/auth/ProtectedRoute';
import { Login } from './components/Login';
import { Layout } from './components/Layout';
import { Toaster } from './components/ui/sonner';
import { ChatFAB } from './components/chat/ChatFAB';
import { Loader2 } from 'lucide-react';

// Route-level lazy imports — named exports
const Dashboard = lazy(() => import('./components/Dashboard').then(m => ({ default: m.Dashboard })));
const InventoryList = lazy(() => import('./components/inventory/InventoryList').then(m => ({ default: m.InventoryList })));
const InventoryDashboard = lazy(() => import('./components/inventory/dashboard/InventoryDashboard').then(m => ({ default: m.InventoryDashboard })));
const ComprasIntegrado = lazy(() => import('./components/inventory/ComprasIntegrado').then(m => ({ default: m.ComprasIntegrado })));
const ProductDetail = lazy(() => import('./components/inventory/ProductDetail').then(m => ({ default: m.ProductDetail })));
const InventoryMovements = lazy(() => import('./components/inventory/InventoryMovements').then(m => ({ default: m.InventoryMovements })));
const ImportarProductosPage = lazy(() => import('./components/inventory/ImportarProductosPage').then(m => ({ default: m.ImportarProductosPage })));
const VerificacionesList = lazy(() => import('./components/inventory/VerificacionesList').then(m => ({ default: m.VerificacionesList })));
const NuevaVerificacion = lazy(() => import('./components/inventory/NuevaVerificacion').then(m => ({ default: m.NuevaVerificacion })));
const ConteoFisico = lazy(() => import('./components/inventory/ConteoFisico').then(m => ({ default: m.ConteoFisico })));
const ComingSoon = lazy(() => import('./components/shared/ComingSoon').then(m => ({ default: m.ComingSoon })));
const MovementsDashboard = lazy(() => import('./components/inventory/MovementsDashboard').then(m => ({ default: m.MovementsDashboard })));
const PurchaseHistory = lazy(() => import('./components/inventory/PurchaseHistory').then(m => ({ default: m.PurchaseHistory })));
const NewPurchase = lazy(() => import('./components/inventory/NewPurchase').then(m => ({ default: m.NewPurchase })));
const AplicacionesList = lazy(() => import('./components/aplicaciones/AplicacionesList').then(m => ({ default: m.AplicacionesList })));
const CalculadoraAplicaciones = lazy(() => import('./components/aplicaciones/CalculadoraAplicaciones').then(m => ({ default: m.CalculadoraAplicaciones })));
const DailyMovementsDashboardWrapper = lazy(() => import('./components/aplicaciones/DailyMovementsDashboardWrapper').then(m => ({ default: m.DailyMovementsDashboardWrapper })));
const CierreAplicacionWrapper = lazy(() => import('./components/aplicaciones/CierreAplicacionWrapper').then(m => ({ default: m.CierreAplicacionWrapper })));
const ReporteAplicacionWrapper = lazy(() => import('./components/aplicaciones/ReporteAplicacionWrapper').then(m => ({ default: m.ReporteAplicacionWrapper })));
const DashboardMonitoreoV3 = lazy(() => import('./components/monitoreo/DashboardMonitoreoV3').then(m => ({ default: m.DashboardMonitoreoV3 })));
const RegistrosMonitoreo = lazy(() => import('./components/monitoreo/RegistrosMonitoreo').then(m => ({ default: m.RegistrosMonitoreo })));
const CargaMasiva = lazy(() => import('./components/monitoreo/CargaMasiva').then(m => ({ default: m.CargaMasiva })));
const CatalogoPlagas = lazy(() => import('./components/monitoreo/CatalogoPlagas').then(m => ({ default: m.CatalogoPlagas })));
const ConfigApiarios = lazy(() => import('./components/monitoreo/ConfigApiarios').then(m => ({ default: m.ConfigApiarios })));
const ClimaDashboard = lazy(() => import('./components/clima/ClimaDashboard').then(m => ({ default: m.ClimaDashboard })));
const ClimaHistorico = lazy(() => import('./components/clima/ClimaHistorico').then(m => ({ default: m.ClimaHistorico })));
const ConfiguracionDashboard = lazy(() => import('./components/configuracion/ConfiguracionDashboard').then(m => ({ default: m.ConfiguracionDashboard })));
const Empleados = lazy(() => import('./components/empleados/Empleados').then(m => ({ default: m.Empleados })));
const FinanzasDashboard = lazy(() => import('./components/finanzas/FinanzasDashboard').then(m => ({ default: m.FinanzasDashboard })));
const GastosView = lazy(() => import('./components/finanzas/GastosView').then(m => ({ default: m.GastosView })));
const IngresosView = lazy(() => import('./components/finanzas/IngresosView').then(m => ({ default: m.IngresosView })));
const ReportesView = lazy(() => import('./components/finanzas/ReportesView').then(m => ({ default: m.ReportesView })));
const ConfiguracionFinanzas = lazy(() => import('./components/finanzas/ConfiguracionFinanzas').then(m => ({ default: m.ConfiguracionFinanzas })));
const ProduccionDashboard = lazy(() => import('./components/produccion/ProduccionDashboard').then(m => ({ default: m.ProduccionDashboard })));
const ReportesDashboard = lazy(() => import('./components/reportes/ReportesDashboard').then(m => ({ default: m.ReportesDashboard })));
const ReporteSemanalWizard = lazy(() => import('./components/reportes/ReporteSemanalWizard').then(m => ({ default: m.ReporteSemanalWizard })));

// Default exports
const Personal = lazy(() => import('./components/empleados/Personal'));
const Contratistas = lazy(() => import('./components/empleados/Contratistas'));
const Labores = lazy(() => import('./components/labores/Labores'));

function RouteSpinner() {
  return (
    <div className="flex items-center justify-center h-64">
      <Loader2 className="w-6 h-6 animate-spin text-primary" />
    </div>
  );
}

function LayoutRoutes() {
  return (
    <Layout>
      <Suspense fallback={<RouteSpinner />}>
        <Routes>
          {/* Dashboard - Ruta principal */}
          <Route index element={<Dashboard />} />

          {/* Inventario - Rutas anidadas */}
          <Route path="inventario">
            <Route index element={<InventoryList />} />
            <Route path="dashboard" element={<InventoryDashboard />} />
            <Route path="compras" element={<ComprasIntegrado />} />
            <Route path="producto/:id" element={<ProductDetail />} />
            <Route path="movimientos" element={<InventoryMovements />} />
            <Route path="importar" element={<ImportarProductosPage />} />
            <Route path="verificaciones">
              <Route index element={<VerificacionesList />} />
              <Route path="nueva" element={<NuevaVerificacion />} />
              <Route path="conteo/:id" element={<ConteoFisico />} />
              <Route path=":id" element={<ComingSoon moduleName="Detalle de Verificación" />} />
            </Route>
          </Route>

          {/* Aplicaciones */}
          <Route path="aplicaciones">
            <Route index element={<AplicacionesList />} />
            <Route path="calculadora" element={<CalculadoraAplicaciones />} />
            <Route path="calculadora/:id" element={<CalculadoraAplicaciones />} />
            <Route path=":id/movimientos" element={<DailyMovementsDashboardWrapper />} />
            <Route path=":id/cierre" element={<CierreAplicacionWrapper />} />
            <Route path=":id/reporte" element={<ReporteAplicacionWrapper />} />
          </Route>

          {/* Monitoreo */}
          <Route path="monitoreo" element={<DashboardMonitoreoV3 />} />
          <Route path="monitoreo/registros" element={<RegistrosMonitoreo />} />
          <Route path="monitoreo/carga-masiva" element={<CargaMasiva />} />
          <Route path="monitoreo/catalogo" element={<CatalogoPlagas />} />
          <Route path="monitoreo/apiarios" element={<ConfigApiarios />} />

          {/* Clima */}
          <Route path="clima" element={<ClimaDashboard />} />
          <Route path="clima/historico" element={<ClimaHistorico />} />

          {/* Labores */}
          <Route path="labores" element={<Labores />} />

          {/* Empleados - Rutas anidadas */}
          <Route path="empleados" element={<Empleados />}>
            <Route index element={<Personal />} />
            <Route path="contratistas" element={<Contratistas />} />
          </Route>

          {/* Finanzas */}
          <Route path="finanzas">
            <Route index element={<FinanzasDashboard />} />
            <Route path="dashboard/aguacate" element={<FinanzasDashboard tab="aguacate" />} />
            <Route path="dashboard/hato" element={<FinanzasDashboard tab="hato" />} />
            <Route path="dashboard/ganado" element={<FinanzasDashboard tab="ganado" />} />
            <Route path="dashboard/caballos" element={<FinanzasDashboard tab="caballos" />} />
            <Route path="dashboard/agricola" element={<FinanzasDashboard tab="agricola" />} />
            <Route path="gastos" element={<GastosView />} />
            <Route path="ingresos" element={<IngresosView />} />
            <Route path="reportes" element={<ReportesView />} />
            <Route path="configuracion" element={<ConfiguracionFinanzas />} />
          </Route>

          {/* Reportes */}
          <Route path="reportes">
            <Route index element={<ReportesDashboard />} />
            <Route path="generar" element={<ReporteSemanalWizard />} />
          </Route>

          {/* Producción */}
          <Route path="produccion" element={<ProduccionDashboard />} />

          {/* Ventas */}
          <Route path="ventas" element={<ComingSoon moduleName="Ventas y Despachos" />} />

          {/* Lotes */}
          <Route path="lotes" element={<ComingSoon moduleName="Gestión de Lotes" />} />

          {/* Configuración */}
          <Route path="configuracion" element={<ConfiguracionDashboard />} />

          {/* Ruta 404 - Redirigir al dashboard */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </Layout>
  );
}

function AppContent() {
  const { isAuthenticated } = useAuth();

  return (
    <Routes>
      <Route
        path="/login"
        element={
          isAuthenticated ? (
            <Navigate to="/" replace />
          ) : (
            <Login onLoginSuccess={() => { }} />
          )
        }
      />
      <Route
        path="/*"
        element={
          <ProtectedRoute fallback={<Navigate to="/login" replace />}>
            <LayoutRoutes />
          </ProtectedRoute>
        }
      />
    </Routes>
  );
}

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <SafeModeProvider>
          <AppContent />
          <ChatFAB />
          <Toaster />
        </SafeModeProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
