import { AplicacionesList } from './components/aplicaciones/AplicacionesList';
import { CalculadoraAplicaciones } from './components/aplicaciones/CalculadoraAplicaciones';
import { DailyMovements } from './components/aplicaciones/DailyMovements';

import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { ProtectedRoute } from './components/auth/ProtectedRoute';
import { Login } from './components/Login';
import { Layout } from './components/Layout';
import { Dashboard } from './components/Dashboard';
import { InventoryList } from './components/inventory/InventoryList';
import { NewPurchase } from './components/inventory/NewPurchase';
import { InventoryMovements } from './components/inventory/InventoryMovements';
import { MovementsDashboard } from './components/inventory/MovementsDashboard';
import { VerificacionesList } from './components/inventory/VerificacionesList';
import { NuevaVerificacion } from './components/inventory/NuevaVerificacion';
import { ConteoFisico } from './components/inventory/ConteoFisico';

/**
 * Componente de placeholder para módulos en desarrollo
 */
function ComingSoon({ moduleName }: { moduleName: string }) {
  return (
    <div className="text-center py-12">
      <div className="inline-flex items-center justify-center w-20 h-20 bg-gradient-to-br from-[#73991C]/10 to-[#BFD97D]/10 rounded-2xl mb-4 shadow-lg">
        <span className="text-3xl">🚧</span>
      </div>
      <h2 className="text-2xl text-[#172E08] mb-2">
        {moduleName} - En Desarrollo
      </h2>
      <p className="text-[#4D240F]/70">
        Esta funcionalidad estará disponible próximamente
      </p>
    </div>
  );
}

/**
 * Wrapper de Dashboard
 */
function DashboardWrapper() {
  return <Dashboard />;
}

/**
 * Layout con rutas anidadas
 */
function LayoutRoutes() {
  return (
    <Layout>
      <Routes>
        {/* Dashboard - Ruta principal */}
        <Route index element={<DashboardWrapper />} />

        {/* Inventario - Rutas anidadas */}
        <Route path="inventario">
          <Route index element={<InventoryList />} />
          <Route path="dashboard" element={<MovementsDashboard />} />
          <Route path="nueva-compra" element={<NewPurchase />} />
          <Route
            path="producto/:id"
            element={<ComingSoon moduleName="Detalle de Producto" />}
          />
          <Route path="movimientos" element={<InventoryMovements />} />
          
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
          <Route path=":id/editar" element={<CalculadoraAplicaciones />} />
          <Route path=":id/movimientos" element={<DailyMovements />} />
          <Route path=":id" element={<ComingSoon moduleName="Detalle de Aplicación" />} />
        </Route>

        {/* Monitoreo */}
        <Route
          path="monitoreo"
          element={<ComingSoon moduleName="Monitoreo de Plagas" />}
        />

        {/* Producción */}
        <Route
          path="produccion"
          element={<ComingSoon moduleName="Producción y Cosechas" />}
        />

        {/* Ventas */}
        <Route path="ventas" element={<ComingSoon moduleName="Ventas y Despachos" />} />

        {/* Lotes */}
        <Route path="lotes" element={<ComingSoon moduleName="Gestión de Lotes" />} />

        {/* Configuración */}
        <Route
          path="configuracion"
          element={<ComingSoon moduleName="Configuración" />}
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
        <AppContent />
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;