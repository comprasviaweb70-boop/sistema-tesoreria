
import React, { useState, useEffect } from 'react';
import { Helmet } from 'react-helmet';
import { Building2, Banknote, CreditCard, Wallet, Users, ChevronDown, ChevronUp, RefreshCcw, Loader2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { supabase } from '@/lib/customSupabaseClient';
import Header from '@/components/Header';
import SupplierPaymentForm from '@/components/SupplierPaymentForm';
import SupplierPaymentList from '@/components/SupplierPaymentList';
import ProveedoresList from '@/components/ProveedoresList';

// Error Boundary para mostrar el Header aunque el contenido falle
class PageErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="m-6 p-4 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm">
          <strong>Error en el contenido:</strong> {this.state.error?.message}
        </div>
      );
    }
    return this.props.children;
  }
}

const SupplierManagementPage = () => {
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [globalCajaId, setGlobalCajaId] = useState(() => {
    const saved = localStorage.getItem('vd_cajaId');
    return (saved && saved !== 'all') ? saved : '';
  });
  const [showDirectorio, setShowDirectorio] = useState(false);

  // Sincronizar con localStorage
  useEffect(() => {
    localStorage.setItem('vd_cajaId', globalCajaId);
  }, [globalCajaId]);
  const [showDashboard, setShowDashboard] = useState(false);
  const [stats, setStats] = useState({
    totalProveedores: 0,
    pagosMes: 0,
    efectivoMes: 0,
    ccMes: 0,
  });
  const [statsLoading, setStatsLoading] = useState(false);

  useEffect(() => {
    fetchStats();
  }, [refreshTrigger, globalCajaId]);

  const fetchStats = async () => {
    setStatsLoading(true);
    try {
      // 1. Contar proveedores activos - Forma más resiliente
      const { data: providersData, error: errPv } = await supabase
        .from('proveedores')
        .select('id')
        .eq('activo', true);
      
      if (errPv) {
        console.error('Error fetching providers for count:', errPv);
      } else if (providersData) {
        setStats(prev => ({ ...prev, totalProveedores: providersData.length }));
      }

      // 2. Definir rango: desde el primer día del mes actual (hora local)
      const now = new Date();
      const yr = now.getFullYear();
      const mo = now.getMonth() + 1;
      const startStr = `${yr}-${String(mo).padStart(2, '0')}-01`;

      console.log(`Fetching stats since: ${startStr}, Caja: ${globalCajaId}`);

      const todayStr = new Date().toISOString().split('T')[0];

      let query = supabase
        .from('pagos_proveedor')
        .select('monto_pagado, origen_fondos, caja_id') // Quitamos tipo_pago que es dudoso
        .gte('fecha_pago', startStr)
        .lte('fecha_pago', todayStr);

      // Si hay una caja seleccionada, incluir sus pagos O los de Cuenta Corriente
      if (globalCajaId && globalCajaId !== 'all' && globalCajaId !== '') {
        query = query.or(`caja_id.eq.${globalCajaId},origen_fondos.ilike.%corriente%`);
      }

      const { data: pagos, error: errPagos } = await query;

      if (errPagos) {
        console.error('Error fetching payments for summary:', errPagos);
      } else if (pagos) {
        const pagosMes = pagos.reduce((acc, p) => acc + (parseFloat(p.monto_pagado) || 0), 0);
        
        const efectivoMes = pagos
          .filter(p => {
            const t = (p.origen_fondos || '').toLowerCase(); // Solo origen_fondos
            return t === 'caja' || t === 'efectivo' || t.includes('efect');
          })
          .reduce((acc, p) => acc + (parseFloat(p.monto_pagado) || 0), 0);

        const ccMes = pagos
          .filter(p => (p.origen_fondos || '').toLowerCase().includes('corriente'))
          .reduce((acc, p) => acc + (parseFloat(p.monto_pagado) || 0), 0);

        setStats(prev => ({ 
          ...prev,
          pagosMes, 
          efectivoMes, 
          ccMes 
        }));
      }
    } catch (error) {
      console.error('Unexpected error in fetchStats:', error);
    } finally {
      setStatsLoading(false);
    }
  };

  const fmt = (v) => `$${parseFloat(v || 0).toLocaleString('es-CL')}`;

  return (
    <div className="gradient-bg min-h-screen">
      <Helmet>
        <title>Proveedores - Iciz Market</title>
      </Helmet>

      <Header />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        <div className="space-y-1">
          <h2 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Building2 className="h-6 w-6 text-primary" />
            Pagos a Proveedores
          </h2>
          <p className="text-sm text-muted-foreground">Registro y seguimiento de pagos a proveedores</p>
        </div>

        <PageErrorBoundary>
          <SupplierPaymentForm
            onSuccess={() => setRefreshTrigger(prev => prev + 1)}
            globalCajaId={globalCajaId === 'all' ? '' : globalCajaId}
            setGlobalCajaId={setGlobalCajaId}
            refreshTrigger={refreshTrigger}
          />
        </PageErrorBoundary>

        <PageErrorBoundary>
          <SupplierPaymentList
            refreshTrigger={refreshTrigger}
            globalCajaId={globalCajaId}
            setGlobalCajaId={setGlobalCajaId}
          />
        </PageErrorBoundary>

        {/* Resumen del Mes — colapsable */}
        <div className="glass-card overflow-hidden">
            <div className="w-full flex items-center justify-between px-5 py-4 hover:bg-secondary/30 transition-colors">
              <span className="font-semibold text-foreground flex items-center gap-2">
                <Wallet className="h-4 w-4 text-primary" />
                Resumen del Mes
                {statsLoading && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />}
              </span>
              <div className="flex items-center gap-3">
                <button 
                  onClick={(e) => { e.stopPropagation(); fetchStats(); }}
                  className="p-1 hover:bg-primary/20 rounded transition-colors"
                  title="Actualizar resumen"
                >
                  <RefreshCcw className={`h-3.5 w-3.5 text-muted-foreground ${statsLoading ? 'animate-spin' : ''}`} />
                </button>
                <div onClick={() => setShowDashboard(prev => !prev)} className="cursor-pointer">
                  {showDashboard ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                </div>
              </div>
            </div>
          {showDashboard && (
            <div className="px-5 pb-5 border-t border-border/50 pt-4">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <Card className="glass-card border-border/50">
                  <CardHeader className="flex flex-row items-center justify-between pb-2">
                    <CardTitle className="text-sm font-medium text-muted-foreground">Proveedores Activos</CardTitle>
                    <Building2 className="h-4 w-4 text-primary" />
                  </CardHeader>
                  <CardContent><div className="text-2xl font-bold text-foreground">{stats.totalProveedores}</div></CardContent>
                </Card>
                <Card className="glass-card border-border/50 border-amber-500/20 bg-amber-500/5">
                  <CardHeader className="flex flex-row items-center justify-between pb-2">
                    <CardTitle className="text-sm font-medium text-amber-400">Efectivo del Mes</CardTitle>
                    <Banknote className="h-4 w-4 text-amber-400" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold text-foreground">{fmt(stats.efectivoMes)}</div>
                    <p className="text-xs text-muted-foreground mt-1">Pagado desde caja</p>
                  </CardContent>
                </Card>
                <Card className="glass-card border-border/50 border-blue-500/20 bg-blue-500/5">
                  <CardHeader className="flex flex-row items-center justify-between pb-2">
                    <CardTitle className="text-sm font-medium text-blue-400">Cta. Corriente del Mes</CardTitle>
                    <CreditCard className="h-4 w-4 text-blue-400" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold text-foreground">{fmt(stats.ccMes)}</div>
                    <p className="text-xs text-muted-foreground mt-1">Pagado por CC</p>
                  </CardContent>
                </Card>
                <Card className="glass-card border-border/50">
                  <CardHeader className="flex flex-row items-center justify-between pb-2">
                    <CardTitle className="text-sm font-medium text-muted-foreground">Total del Mes</CardTitle>
                    <Wallet className="h-4 w-4 text-green-500" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold text-foreground">{fmt(stats.pagosMes)}</div>
                    <p className="text-xs text-muted-foreground mt-1">Efectivo + CC</p>
                  </CardContent>
                </Card>
              </div>
            </div>
          )}
        </div>

        {/* Directorio — colapsable */}
        <div className="glass-card overflow-hidden">
          <button
            onClick={() => setShowDirectorio(prev => !prev)}
            className="w-full flex items-center justify-between px-5 py-4 hover:bg-secondary/30 transition-colors"
          >
            <span className="font-semibold text-foreground flex items-center gap-2">
              <Users className="h-4 w-4 text-primary" />
              Directorio de Proveedores
            </span>
            {showDirectorio ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
          </button>
          {showDirectorio && (
            <div className="border-t border-border/50 p-4">
              <PageErrorBoundary>
                <ProveedoresList onSuccess={() => setRefreshTrigger(prev => prev + 1)} />
              </PageErrorBoundary>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default SupplierManagementPage;
