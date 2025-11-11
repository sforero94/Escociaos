import { useState } from 'react';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { ProtectedRoute } from './components/auth/ProtectedRoute';
import { Login } from './components/Login';
import { Layout } from './components/Layout';
import { Dashboard } from './components/Dashboard';
import { InventoryList } from './components/inventory/InventoryList';
import { NewPurchase } from './components/inventory/NewPurchase';

type ViewType = 
  | 'dashboard' 
  | 'inventory' 
  | 'inventory-new-purchase'
  | 'inventory-detail'
  | 'applications'
  | 'monitoring'
  | 'production'
  | 'sales'
  | 'lots'
  | 'settings';

function AppContent() {
  const { isAuthenticated, profile, signOut: authSignOut } = useAuth();
  const [currentView, setCurrentView] = useState<ViewType>('dashboard');

  const handleNavigate = (view: string, productId?: number) => {
    setCurrentView(view as ViewType);
  };

  const handleLoginSuccess = () => {
    setCurrentView('dashboard');
  };

  // Renderizar contenido según la vista actual
  const renderContent = () => {
    switch (currentView) {
      case 'dashboard':
        return <Dashboard onNavigate={handleNavigate} />;
      
      case 'inventory':
        return <InventoryList onNavigate={handleNavigate} />;
      
      case 'inventory-new-purchase':
        return <NewPurchase onNavigate={handleNavigate} />;
      
      case 'applications':
      case 'monitoring':
      case 'production':
      case 'sales':
      case 'lots':
      case 'settings':
        return (
          <div className="text-center py-12">
            <div className="inline-flex items-center justify-center w-20 h-20 bg-gradient-to-br from-[#73991C]/10 to-[#BFD97D]/10 rounded-2xl mb-4 shadow-lg">
              <span className="text-3xl">🚧</span>
            </div>
            <h2 className="text-2xl text-[#172E08] mb-2">Módulo en Desarrollo</h2>
            <p className="text-[#4D240F]/70">
              Esta funcionalidad estará disponible próximamente
            </p>
          </div>
        );
      
      default:
        return <Dashboard onNavigate={handleNavigate} />;
    }
  };

  return (
    <ProtectedRoute fallback={<Login onLoginSuccess={handleLoginSuccess} />}>
      <Layout
        currentView={currentView}
        onNavigate={handleNavigate}
      >
        {renderContent()}
      </Layout>
    </ProtectedRoute>
  );
}

function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}

export default App;