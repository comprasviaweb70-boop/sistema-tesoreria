
import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Helmet } from 'react-helmet';
import { ArrowUpDown, Tag, Package, Users } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import Header from '@/components/Header';
import { Button } from '@/components/ui/button';
import OtrosMovimientosForm from '@/components/OtrosMovimientosForm';
import OtrosMovimientosList from '@/components/OtrosMovimientosList';
import CategoriasMovimientosList from '@/components/CategoriasMovimientosList';
import { useAuth } from '@/contexts/AuthContextObject';

const OtrosMovimientosPage = () => {
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [globalCajaId, setGlobalCajaId] = useState(() => {
    const saved = localStorage.getItem('vd_cajaId');
    return (saved && saved !== 'all') ? saved : '';
  });
  const { isAdmin } = useAuth();

  // Sincronizar con localStorage para que otros módulos lo vean
  React.useEffect(() => {
    localStorage.setItem('vd_cajaId', globalCajaId);
  }, [globalCajaId]);

  return (
    <>
      <Helmet>
        <title>Otros Movimientos - Iciz Market</title>
        <meta name="description" content="Registro de ingresos y egresos de caja" />
      </Helmet>

      <div className="gradient-bg min-h-screen">
        <Header />

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <Tabs defaultValue="movimientos" className="w-full space-y-6">
            <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
              <div className="space-y-1">
                <h2 className="text-2xl font-bold text-foreground flex items-center gap-2">
                  <ArrowUpDown className="h-6 w-6 text-primary" />
                  Otros Movimientos de Caja
                </h2>
                <p className="text-sm text-muted-foreground">
                  Ingresos y egresos que afectan el saldo de caja
                </p>
              </div>

              <TabsList className="glass-card bg-secondary/30 border-border/50 h-auto">
                <TabsTrigger
                  value="movimientos"
                  className="data-[state=active]:bg-primary/20 data-[state=active]:text-primary rounded-md flex items-center gap-2"
                >
                  <ArrowUpDown className="w-4 h-4" />
                  Movimientos
                </TabsTrigger>
                <TabsTrigger
                  value="categorias"
                  className="data-[state=active]:bg-primary/20 data-[state=active]:text-primary rounded-md flex items-center gap-2"
                >
                  <Tag className="w-4 h-4" />
                  Categorías
                </TabsTrigger>
              </TabsList>

              {isAdmin && (
                <div className="flex flex-wrap gap-2">
                  <Link to="/admin/cajas">
                    <Button variant="outline" size="sm" className="border-primary/50 text-primary hover:bg-primary/10">
                      <Package className="mr-2 h-4 w-4" />
                      Gestionar Cajas
                    </Button>
                  </Link>
                  <Link to="/admin/users">
                    <Button variant="outline" size="sm" className="border-primary/50 text-primary hover:bg-primary/10">
                      <Users className="mr-2 h-4 w-4" />
                      Gestionar Cajeros
                    </Button>
                  </Link>
                </div>
              )}
            </div>

            <TabsContent value="movimientos" className="space-y-6 animate-in fade-in-50 duration-500">
              <OtrosMovimientosForm
                onSuccess={() => setRefreshTrigger(prev => prev + 1)}
                globalCajaId={globalCajaId}
                setGlobalCajaId={setGlobalCajaId}
              />
              <OtrosMovimientosList
                refreshTrigger={refreshTrigger}
                globalCajaId={globalCajaId}
                setGlobalCajaId={setGlobalCajaId}
              />
            </TabsContent>

            <TabsContent value="categorias" className="animate-in fade-in-50 duration-500">
              <CategoriasMovimientosList />
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </>
  );
};

export default OtrosMovimientosPage;
