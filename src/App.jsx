
import React, { Suspense, lazy } from 'react';
import { Route, Routes, BrowserRouter as Router, Navigate } from 'react-router-dom';
import { AuthProvider } from '@/contexts/AuthContext';
import { useAuth } from '@/contexts/AuthContextObject';
import { Toaster } from '@/components/ui/toaster';
import ScrollToTop from '@/components/ScrollToTop';
import ProtectedRoute from '@/components/ProtectedRoute';
import LoginPage from '@/pages/LoginPage';
import VentaDiariaPage from '@/pages/VentaDiariaPage';
import AdminUsersPage from '@/pages/AdminUsersPage';
import AdminCajasPage from '@/pages/AdminCajasPage';
import SupplierManagementPage from '@/pages/SupplierManagementPage';
import ReservaPage from '@/pages/ReservaPage';
import InformesPage from '@/pages/InformesPage';

// Lazy-loaded para aislar errores de importación sin romper el resto de la app
const OtrosMovimientosPage = lazy(() => import('@/pages/OtrosMovimientosPage'));

const LoadingFallback = () => (
  <div className="flex items-center justify-center min-h-screen gradient-bg">
    <div className="text-center glass-card p-8">
      <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 accent-border border-t-transparent"></div>
      <p className="mt-4 text-foreground font-medium">Cargando módulo...</p>
    </div>
  </div>
);

const RedirectRoot = () => {
  const { isAuthenticated, loading } = useAuth();

  if (loading) {
    return <LoadingFallback />;
  }

  return isAuthenticated ? <Navigate to="/venta-diaria" replace /> : <Navigate to="/login" replace />;
};

function App() {
  return (
    <AuthProvider>
      <Router>
        <ScrollToTop />
        <Routes>
          <Route path="/" element={<RedirectRoot />} />
          <Route path="/login" element={<LoginPage />} />
          <Route
            path="/venta-diaria"
            element={
              <ProtectedRoute>
                <VentaDiariaPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/suppliers"
            element={
              <ProtectedRoute>
                <SupplierManagementPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/reserva"
            element={
              <ProtectedRoute>
                <ReservaPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/otros-movimientos"
            element={
              <ProtectedRoute>
                <Suspense fallback={<LoadingFallback />}>
                  < OtrosMovimientosPage />
                </Suspense>
              </ProtectedRoute>
            }
          />
          <Route
            path="/informes"
            element={
              <ProtectedRoute>
                <InformesPage />
              </ProtectedRoute>
            }
          />
            <Route
            path="/admin/users"
            element={
              <ProtectedRoute adminOnly={true}>
                <AdminUsersPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/cajas"
            element={
              <ProtectedRoute adminOnly={true}>
                <AdminCajasPage />
              </ProtectedRoute>
            }
          />
        </Routes>
        <Toaster />
      </Router>
    </AuthProvider>
  );
}

export default App;
