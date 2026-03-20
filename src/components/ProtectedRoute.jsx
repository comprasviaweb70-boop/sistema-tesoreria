
import React, { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContextObject';
import { useToast } from '@/hooks/use-toast';

const ProtectedRoute = ({ children, adminOnly = false }) => {
  const { isAuthenticated, loading, isAdmin } = useAuth();
  const { toast } = useToast();
  const [shouldRedirect, setShouldRedirect] = useState(false);

  useEffect(() => {
    if (!loading && isAuthenticated && adminOnly && !isAdmin) {
      toast({
        title: "Acceso Denegado",
        description: "No tienes permisos de administrador para ver esta página.",
        variant: "destructive",
      });
      setShouldRedirect(true);
    }
  }, [loading, isAuthenticated, adminOnly, isAdmin, toast]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen gradient-bg">
        <div className="text-center glass-card p-8">
          <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 accent-border border-t-transparent align-[-0.125em] motion-reduce:animate-[spin_1.5s_linear_infinite]"></div>
          <p className="mt-4 text-foreground font-medium">Cargando...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  if (shouldRedirect) {
    return <Navigate to="/venta-diaria" replace />;
  }

  if (adminOnly && !isAdmin) {
    return null; // Will redirect via the useEffect state update
  }

  return children;
};

export default ProtectedRoute;
