import { ProductDetail } from './components/inventory/ProductDetail';
import { ImportarProductosPage } from './components/inventory/ImportarProductosPage';
import { ComingSoon } from './components/shared/ComingSoon';
import { InventoryMovements } from './components/inventory/InventoryMovements';
import { MovementsDashboard } from './components/inventory/MovementsDashboard';
import { PurchaseHistory } from './components/inventory/PurchaseHistory';
import { ComprasIntegrado } from './components/inventory/ComprasIntegrado';
import { VerificacionesList } from './components/inventory/VerificacionesList';
import { NuevaVerificacion } from './components/inventory/NuevaVerificacion';
import { ConteoFisico } from './components/inventory/ConteoFisico';
import { AplicacionesList } from './components/aplicaciones/AplicacionesList';
import { CalculadoraAplicaciones } from './components/aplicaciones/CalculadoraAplicaciones';
import { DailyMovementsDashboardWrapper } from './components/aplicaciones/DailyMovementsDashboardWrapper';
import { CierreAplicacionWrapper } from './components/aplicaciones/CierreAplicacionWrapper';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { SafeModeProvider } from './contexts/SafeModeContext';
import { ProtectedRoute } from './components/auth/ProtectedRoute';
import { Login } from './components/Login';
import { Layout } from './components/Layout';
import { Dashboard } from './components/Dashboard';
import { InventoryList } from './components/inventory/InventoryList';
import { NewPurchase } from './components/inventory/NewPurchase';
import { MonitoreoDashboardV2 } from './components/monitoreo/MonitoreoDashboardV2';
import { RegistrosMonitoreo } from './components/monitoreo/RegistrosMonitoreo';
import { CargaMasiva } from './components/monitoreo/CargaMasiva';
import { CatalogoPlagas } from './components/monitoreo/CatalogoPlagas';
import { ConfiguracionDashboard } from './components/configuracion/ConfiguracionDashboard';
import { Empleados } from './components/empleados/Empleados';
import Personal from './components/empleados/Personal';
import Contratistas from './components/empleados/Contratistas';
import Labores from './components/labores/Labores';
import { FinanzasDashboard } from './components/finanzas/FinanzasDashboard';
import { GastosView } from './components/finanzas/GastosView';
import { IngresosView } from './components/finanzas/IngresosView';
import { ReportesView } from './components/finanzas/ReportesView';
import { ConfiguracionFinanzas } from './components/finanzas/ConfiguracionFinanzas';
import { ProduccionDashboard } from './components/produccion/ProduccionDashboard';

/**
 * Dashboard component - no wrapper needed
 */

/**
 * Layout con rutas anidadas
 */
function LayoutRoutes() {
  return (
    <Layout>
      <Routes>
        {/* Dashboard - Ruta principal */}
        <Route index element={<Dashboard />} />

        {/* Inventario - Rutas anidadas */}
        <Route path="inventario">
          <Route index element={<InventoryList />} />
          <Route path="dashboard" element={<MovementsDashboard />} />
          <Route path="compras" element={<ComprasIntegrado />} />
          <Route
            path="producto/:id"
            element={<ProductDetail />}
          />
          <Route path="movimientos" element={<InventoryMovements />} />
          <Route path="importar" element={<ImportarProductosPage />} />
          
          {/* Verificaciones - Rutas anidadas */}
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
          <Route path=":id/movimientos" element={<DailyMovementsDashboardWrapper />} />
          <Route path=":id/cierre" element={<CierreAplicacionWrapper />} />
        </Route>

        {/* Monitoreo */}
        <Route
          path="monitoreo"
          element={<MonitoreoDashboardV2 />}
        />
        <Route
          path="monitoreo/registros"
          element={<RegistrosMonitoreo />}
        />
        <Route
          path="monitoreo/carga-masiva"
          element={<CargaMasiva />}
        />
        <Route
          path="monitoreo/catalogo"
          element={<CatalogoPlagas />}
        />

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
          <Route path="gastos" element={<GastosView />} />
          <Route path="ingresos" element={<IngresosView />} />
          <Route path="reportes" element={<ReportesView />} />
          <Route path="configuracion" element={<ConfiguracionFinanzas />} />
        </Route>

        {/* Producción */}
        <Route path="produccion" element={<ProduccionDashboard />} />

        {/* Ventas */}
        <Route path="ventas" element={<ComingSoon moduleName="Ventas y Despachos" />} />

        {/* Lotes */}
        <Route path="lotes" element={<ComingSoon moduleName="Gestión de Lotes" />} />

        {/* Configuración */}
        <Route
          path="configuracion"
          element={<ConfiguracionDashboard />}
        />

        {/* Ruta 404 - Redirigir al dashboard */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Layout>
  );
}

/**
 * Contenido principal de la app con autenticación
 */
function AppContent() {
  const { isAuthenticated } = useAuth();

  return (
    <Routes>
      {/* Ruta de Login */}
      <Route
        path="/login"
        element={
          isAuthenticated ? (
            <Navigate to="/" replace />
          ) : (
            <Login onLoginSuccess={() => {}} />
          )
        }
      />

      {/* Rutas protegidas */}
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

/**
 * Componente raíz de la aplicación
 */
function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <SafeModeProvider>
          <AppContent />
        </SafeModeProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;