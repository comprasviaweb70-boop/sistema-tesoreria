import React from 'react';
import { useNavigate, Link, useLocation } from 'react-router-dom';
import { LogOut, Users, Receipt, Building2, ArrowUpDown, Package, History, BarChart2, ArrowRightLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContextObject';
import { useToast } from '@/hooks/use-toast';
const Header = () => {
  const {
    user,
    userProfile,
    isAuthenticated,
    isAdmin,
    signOut
  } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const {
    toast
  } = useToast();
  const handleLogout = async () => {
    await signOut();
    toast({
      title: "Sesión cerrada",
      description: "Has cerrado sesión correctamente"
    });
    navigate('/login');
  };
  const isActive = path => location.pathname === path;
  return <header className="glass-card rounded-none border-t-0 border-l-0 border-r-0 border-b border-border/50 sticky top-0 z-40">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-3">
              <img src="https://horizons-cdn.hostinger.com/0019dcfd-ef11-473e-8e4f-ebd47c2cf25e/3f118c8f22e480be172910d04de6b9bf.png" alt="ICL Market Logo" className="h-8 object-contain" />
              <div>
                <h1 className="text-xl font-bold text-foreground tracking-wide">Iciz Market</h1>
                <p className="text-xs accent-text font-medium">Sistema de Tesorería</p>
              </div>
            </div>

            {/* Navigation Links - visible para todo usuario autenticado */}
            {isAuthenticated && <nav className="flex items-center gap-2 ml-8 overflow-x-auto pb-1 no-scrollbar max-w-full">
                <div className="flex items-center gap-2 min-w-max">
                  <Link to="/venta-diaria">
                    <Button variant={isActive('/venta-diaria') ? 'default' : 'ghost'} size="sm" className={isActive('/venta-diaria') ? 'bg-primary/20 text-primary hover:bg-primary/30 border-none' : ''}>
                      <Receipt className="mr-2 h-4 w-4" />
                      Venta Diaria
                    </Button>
                  </Link>

                  <Link to="/suppliers">
                    <Button variant={isActive('/suppliers') ? 'default' : 'ghost'} size="sm" className={isActive('/suppliers') ? 'bg-primary/20 text-primary hover:bg-primary/30 border-none' : ''}>
                      <Building2 className="mr-2 h-4 w-4" />
                      Proveedores
                    </Button>
                  </Link>

                  <Link to="/otros-movimientos">
                    <Button variant={isActive('/otros-movimientos') ? 'default' : 'ghost'} size="sm" className={isActive('/otros-movimientos') ? 'bg-primary/20 text-primary hover:bg-primary/30 border-none' : ''}>
                      <ArrowUpDown className="mr-2 h-4 w-4" />
                      Otros Movimientos
                    </Button>
                  </Link>

                  <Link to="/reserva">
                    <Button variant={isActive('/reserva') ? 'default' : 'ghost'} size="sm" className={isActive('/reserva') ? 'bg-primary/20 text-primary hover:bg-primary/30 border-none font-bold ring-1 ring-primary/30' : 'font-bold'}>
                      <History className="mr-2 h-4 w-4" />
                      Reserva
                    </Button>
                  </Link>

                   <Link to="/flujo-caja">
                    <Button variant={isActive('/flujo-caja') ? 'default' : 'ghost'} size="sm" className={isActive('/flujo-caja') ? 'bg-primary/20 text-primary hover:bg-primary/30 border-none' : ''}>
                      <ArrowRightLeft className="mr-2 h-4 w-4" />
                      Flujo de Caja
                    </Button>
                  </Link>

                  <Link to="/informes">
                    <Button variant={isActive('/informes') ? 'default' : 'ghost'} size="sm" className={isActive('/informes') ? 'bg-primary/20 text-primary hover:bg-primary/30 border-none' : ''}>
                      <BarChart2 className="mr-2 h-4 w-4" />
                      Informes
                    </Button>
                  </Link>

                </div>
              </nav>}
          </div>

          <div className="flex items-center gap-4">
            {userProfile && <div className="text-right hidden sm:block">
                <p className="text-sm font-medium text-foreground">{userProfile.nombre}</p>
                <p className="text-xs accent-text">{userProfile.rol}</p>
              </div>}
            <Button variant="outline" size="sm" onClick={handleLogout} className="flex items-center gap-2 border-primary text-primary hover:bg-primary hover:text-white transition-colors">
              <LogOut className="h-4 w-4" />
              <span className="hidden sm:inline">Cerrar Sesión</span>
            </Button>
          </div>
        </div>
      </div>
    </header>;
};
export default Header;