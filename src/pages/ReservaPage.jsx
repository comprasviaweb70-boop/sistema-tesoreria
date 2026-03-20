import React, { useState, useMemo } from 'react';
import { 
  Plus, 
  TrendingUp, 
  TrendingDown, 
  Calendar as CalendarIcon,
  Search,
  History,
  Coins,
  Wallet,
  ArrowRightLeft,
  Users,
  Package,
  Pencil, 
  Trash2,
  ChevronDown,
  ChevronUp,
  Calculator
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import Header from '@/components/Header';
import { supabase } from '@/lib/customSupabaseClient';
import { useAuth } from '@/contexts/AuthContextObject';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { useReserva } from '@/hooks/useReserva';
import { NuevoMovimientoReservaModal } from '@/components/NuevoMovimientoReservaModal';
import { useToast } from '@/hooks/use-toast';

const formatCurrency = (val) => new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP' }).format(val || 0);

export default function ReservaPage() {
  const { isAdmin } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  console.log("ReservaPage rendering, isAdmin:", isAdmin);
  const [selectedMovimiento, setSelectedMovimiento] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isHistoryExpanded, setIsHistoryExpanded] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  const getTodayStr = () => new Date().toISOString().split('T')[0];
  const getStartOfMonthStr = () => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().split('T')[0];
  };

  const [fechaInicio, setFechaInicio] = useState(getStartOfMonthStr());
  const [fechaFin, setFechaFin] = useState(getTodayStr());
  const { movimientos, loading, refresh, deleteMovimiento } = useReserva(fechaInicio, fechaFin);
  console.log("Movimientos fetched:", movimientos.length, "Loading:", loading);

  const handleEdit = (mov) => {
    setSelectedMovimiento(mov);
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setSelectedMovimiento(null);
  };

  const handleDelete = async (id) => {
    if (!window.confirm("¿Está seguro que desea eliminar este movimiento?")) return;
    
    try {
      // 1. Obtener detalles del movimiento antes de borrarlo para revertir impacto en Venta Diaria
      const mov = movimientos.find(m => m.id === id);
      if (mov && mov.caja_id) {
        const campo = mov.tipo === 'ingreso' ? 'traspaso_tesoreria_egreso' : 'traspaso_tesoreria_ingreso';
        
        const { data: venta, error: fetchError } = await supabase
          .from('venta_diaria')
          .select(`id, ${campo}`)
          .eq('fecha', mov.fecha)
          .eq('turno', mov.turno)
          .eq('caja_id', mov.caja_id)
          .maybeSingle();

        if (fetchError) throw fetchError;

        if (venta) {
          const nuevoValor = Math.max(0, (parseFloat(venta[campo]) || 0) - (parseFloat(mov.monto_total) || 0));
          const { error: updateError } = await supabase
            .from('venta_diaria')
            .update({ [campo]: nuevoValor })
            .eq('id', venta.id);
          if (updateError) throw updateError;
        }
      }

      // 2. Eliminar el movimiento de reserva
      const ok = await deleteMovimiento(id);
      if (ok) {
        toast({ title: "Movimiento eliminado", description: "El registro ha sido borrado y sincronizado exitosamente." });
        refresh();
      } else {
        throw new Error("No se pudo eliminar el registro de reserva.");
      }
    } catch (err) {
      console.error("Error al eliminar movimiento:", err);
      toast({ title: "Error", description: err.message || "No se pudo eliminar el movimiento.", variant: "destructive" });
    }
  };

  const { dailyBalances, detailedMovements } = useMemo(() => {
    // 1. Preparar movimientos detallados con saldos parciales
    let rollingSaldo = {
      b20k: 0, b10k: 0, b5k: 0, b2k: 0, b1k: 0,
      m500: 0, m100: 0, m50: 0, m10: 0
    };

    const detailed = movimientos.map(mov => {
      const factor = mov.tipo === 'ingreso' ? 1 : -1;
      rollingSaldo = {
        b20k: rollingSaldo.b20k + ((mov.b20k || 0) * factor),
        b10k: rollingSaldo.b10k + ((mov.b10k || 0) * factor),
        b5k: rollingSaldo.b5k + ((mov.b5k || 0) * factor),
        b2k: rollingSaldo.b2k + ((mov.b2k || 0) * factor),
        b1k: rollingSaldo.b1k + ((mov.b1k || 0) * factor),
        m500: rollingSaldo.m500 + ((mov.m500 || 0) * factor),
        m100: rollingSaldo.m100 + ((mov.m100 || 0) * factor),
        m50: rollingSaldo.m50 + ((mov.m50 || 0) * factor),
        m10: rollingSaldo.m10 + ((mov.m10 || 0) * factor),
      };
      
      const tb = rollingSaldo.b20k + rollingSaldo.b10k + rollingSaldo.b5k + rollingSaldo.b2k + rollingSaldo.b1k;
      const tm = rollingSaldo.m500 + rollingSaldo.m100 + rollingSaldo.m50 + rollingSaldo.m10;

      return {
        ...mov,
        runningSaldo: { ...rollingSaldo },
        totalGeneral: tb + tm
      };
    });

    // 2. Preparar saldos diarios agrupados
    const groupedByDate = detailed.reduce((acc, mov) => {
      acc[mov.fecha] = mov; // Tomamos el último estado del día
      return acc;
    }, {});

    const balances = Object.keys(groupedByDate).sort().map(date => {
      const lastMov = groupedByDate[date];
      const tb = lastMov.runningSaldo.b20k + lastMov.runningSaldo.b10k + lastMov.runningSaldo.b5k + lastMov.runningSaldo.b2k + lastMov.runningSaldo.b1k;
      const tm = lastMov.runningSaldo.m500 + lastMov.runningSaldo.m100 + lastMov.runningSaldo.m50 + lastMov.runningSaldo.m10;
      
      return {
        fecha: date,
        saldos: { ...lastMov.runningSaldo },
        totalBilletes: tb,
        totalMonedas: tm,
        totalGeneral: tb + tm
      };
    });

    return { dailyBalances: balances, detailedMovements: detailed };
  }, [movimientos]);

  const filteredMovements = useMemo(() => {
    if (!searchTerm) return detailedMovements;
    const lowerSearch = searchTerm.toLowerCase();
    return detailedMovements.filter(mov => {
      const cajaNombre = mov.cajas?.nombre?.toLowerCase() || '';
      const cajaNumero = mov.cajas?.numero_caja?.toString() || '';
      const descripcion = mov.descripcion?.toLowerCase() || '';
      const monto = mov.monto_total?.toString() || '';
      const tipo = mov.tipo?.toLowerCase() || '';
      
      return descripcion.includes(lowerSearch) || 
             monto.includes(lowerSearch) || 
             tipo.includes(lowerSearch) ||
             cajaNombre.includes(lowerSearch) ||
             cajaNumero.includes(lowerSearch);
    });
  }, [detailedMovements, searchTerm]);

  const stockActual = dailyBalances[dailyBalances.length - 1] || {
    saldos: { b20k: 0, b10k: 0, b5k: 0, b2k: 0, b1k: 0, m500: 0, m100: 0, m50: 0, m10: 0 },
    totalGeneral: 0,
    totalBilletes: 0,
    totalMonedas: 0
  };

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <div className="p-6 space-y-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight mb-1 flex items-center gap-2">
              <History className="h-8 w-8 text-primary" />
              Control de Reserva
            </h1>
            <p className="text-muted-foreground italic">
              Seguimiento de stock de billetes y monedas por denominación.
            </p>
          </div>
          
          <div className="flex items-center gap-2 flex-wrap">
            {isAdmin && (
              <>
                <Button 
                  onClick={() => navigate('/admin/users')} 
                  variant="outline" 
                  className="glass-button border-primary/30 text-primary hover:bg-primary/10 gap-2"
                >
                  <Users className="h-4 w-4" />
                  Usuarios
                </Button>
                <Button 
                  onClick={() => navigate('/admin/cajas')} 
                  variant="outline" 
                  className="glass-button border-primary/30 text-primary hover:bg-primary/10 gap-2"
                >
                  <Package className="h-4 w-4" />
                  Cajas
                </Button>
              </>
            )}
            
            <Button onClick={() => setIsModalOpen(true)} className="glass-button bg-primary/20 hover:bg-primary/30 border-primary/50 text-white gap-2">
              <Plus className="h-4 w-4" />
              Nuevo Traspaso / Ajuste
            </Button>
          </div>
        </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="glass-card border-primary/20 bg-primary/5">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Wallet className="h-4 w-4" /> TOTAL RESERVA
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-primary">{formatCurrency(stockActual.totalGeneral)}</div>
          </CardContent>
        </Card>
        <Card className="glass-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Plus className="h-4 w-4 text-green-500" /> TOTAL BILLETES
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(stockActual.totalBilletes || 0)}</div>
          </CardContent>
        </Card>
        <Card className="glass-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Coins className="h-4 w-4 text-amber-500" /> TOTAL MONEDAS
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(stockActual.totalMonedas || 0)}</div>
          </CardContent>
        </Card>
      </div>

      <Card className="glass-card border-white/5">
        <CardContent className="pt-6">
          <div className="flex flex-wrap items-end gap-4">
            <div className="space-y-2">
              <label className="text-xs font-medium text-muted-foreground">Desde</label>
              <div className="relative">
                <CalendarIcon className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  type="date"
                  value={fechaInicio}
                  onChange={(e) => setFechaInicio(e.target.value)}
                  className="glass-input pl-9 w-[180px] font-medium [color-scheme:dark] text-foreground/80"
                />
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-xs font-medium text-muted-foreground">Hasta</label>
              <div className="relative">
                <CalendarIcon className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  type="date"
                  value={fechaFin}
                  onChange={(e) => setFechaFin(e.target.value)}
                  className="glass-input pl-9 w-[180px] font-medium [color-scheme:dark] text-foreground/80"
                />
              </div>
            </div>
            <Button onClick={refresh} variant="secondary" className="glass-button h-10 px-6">
              <Search className="h-4 w-4 mr-2" />
              Filtrar
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className="glass-card border-white/5 overflow-hidden">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Calculator className="h-4 w-4 text-primary" /> SALDOS DIARIOS (Control)
          </CardTitle>
          <CardDescription className="text-[11px]">Resumen acumulado por denominación al final de cada día.</CardDescription>
        </CardHeader>
        <CardContent className="p-0 border-t border-white/5">
          <div className="overflow-x-auto">
            <Table className="text-xs">
              <TableHeader className="bg-white/5">
                <TableRow className="hover:bg-transparent border-none">
                  <TableHead className="w-[100px] h-8 py-1">FECHA</TableHead>
                  <TableHead className="text-right h-8 py-1 bg-primary/5">$ 20.000</TableHead>
                  <TableHead className="text-right h-8 py-1 bg-primary/5">$ 10.000</TableHead>
                  <TableHead className="text-right h-8 py-1 bg-primary/5">$ 5.000</TableHead>
                  <TableHead className="text-right h-8 py-1 bg-primary/5">$ 2.000</TableHead>
                  <TableHead className="text-right h-8 py-1 bg-primary/5">$ 1.000</TableHead>
                  <TableHead className="text-right h-8 py-1 font-bold text-primary">BILLETES</TableHead>
                  <TableHead className="text-right h-8 py-1 bg-amber-500/5">$ 500</TableHead>
                  <TableHead className="text-right h-8 py-1 bg-amber-500/5">$ 100</TableHead>
                  <TableHead className="text-right h-8 py-1 bg-amber-500/5">$ 50</TableHead>
                  <TableHead className="text-right h-8 py-1 bg-amber-500/5">$ 10</TableHead>
                  <TableHead className="text-right h-8 py-1 font-bold text-amber-500">MONEDAS</TableHead>
                  <TableHead className="text-right h-8 py-1 font-bold bg-white/10">STOCK TOTAL</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow><TableCell colSpan={13} className="h-10 text-center italic">Cargando...</TableCell></TableRow>
                ) : dailyBalances.length === 0 ? (
                  <TableRow><TableCell colSpan={13} className="h-10 text-center italic">Sin registros.</TableCell></TableRow>
                ) : (
                  [...dailyBalances].reverse().map((row) => (
                    <TableRow key={row.fecha} className="hover:bg-white/5 border-white/5 h-8">
                      <TableCell className="font-mono py-1">{new Date(row.fecha + 'T12:00:00').toLocaleDateString('es-CL')}</TableCell>
                      <TableCell className="text-right font-mono py-1">{row.saldos.b20k.toLocaleString('es-CL')}</TableCell>
                      <TableCell className="text-right font-mono py-1">{row.saldos.b10k.toLocaleString('es-CL')}</TableCell>
                      <TableCell className="text-right font-mono py-1">{row.saldos.b5k.toLocaleString('es-CL')}</TableCell>
                      <TableCell className="text-right font-mono py-1">{row.saldos.b2k.toLocaleString('es-CL')}</TableCell>
                      <TableCell className="text-right font-mono py-1">{row.saldos.b1k.toLocaleString('es-CL')}</TableCell>
                      <TableCell className="text-right font-bold text-primary py-1">{row.totalBilletes.toLocaleString('es-CL')}</TableCell>
                      <TableCell className="text-right font-mono py-1">{row.saldos.m500.toLocaleString('es-CL')}</TableCell>
                      <TableCell className="text-right font-mono py-1">{row.saldos.m100.toLocaleString('es-CL')}</TableCell>
                      <TableCell className="text-right font-mono py-1">{row.saldos.m50.toLocaleString('es-CL')}</TableCell>
                      <TableCell className="text-right font-mono py-1">{row.saldos.m10.toLocaleString('es-CL')}</TableCell>
                      <TableCell className="text-right font-bold text-amber-500 py-1">{row.totalMonedas.toLocaleString('es-CL')}</TableCell>
                      <TableCell className="text-right font-extrabold bg-white/5 py-1">{row.totalGeneral.toLocaleString('es-CL')}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Card className="glass-card border-white/5 overflow-hidden">
        <CardHeader 
          className="cursor-pointer hover:bg-white/5 transition-colors py-3 flex flex-row items-center justify-between"
          onClick={() => setIsHistoryExpanded(!isHistoryExpanded)}
        >
          <div className="flex items-center gap-3">
            <History className="h-5 w-5 text-primary" />
            <div>
              <CardTitle className="text-base">Detalle de Movimientos</CardTitle>
              <CardDescription className="text-xs">Lista completa de ingresos, egresos y responsables.</CardDescription>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="relative" onClick={(e) => e.stopPropagation()}>
              <Search className="absolute left-2 top-1.5 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                placeholder="Buscar..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="h-7 w-[150px] sm:w-[200px] pl-7 text-[11px] glass-input bg-white/5"
              />
            </div>
            <Button variant="ghost" size="sm" className="gap-2 shrink-0">
              {isHistoryExpanded ? <><ChevronUp className="h-4 w-4" /> Contraer</> : <><ChevronDown className="h-4 w-4" /> Expandir</>}
            </Button>
          </div>
        </CardHeader>
        {isHistoryExpanded && (
          <CardContent className="p-0 border-t border-white/5 animate-in slide-in-from-top-2 duration-200">
            <div className="overflow-x-auto">
              <Table className="text-xs">
                <TableHeader className="bg-white/5">
                  <TableRow className="border-none text-[10px] uppercase text-muted-foreground bg-white/5">
                    <TableHead className="w-[70px] h-7 px-2">Fecha</TableHead>
                    <TableHead className="w-[80px] h-7 px-2">Caja</TableHead>
                    <TableHead className="w-[90px] h-7 px-2">Tipo</TableHead>
                    <TableHead className="h-7 px-2">Descripción</TableHead>
                    <TableHead className="text-right h-7 px-2 font-bold">Monto</TableHead>
                    <TableHead className="text-right h-7 px-2">Saldo Final</TableHead>
                    <TableHead className="text-center w-[80px] h-7 px-2">Acc.</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredMovements.length === 0 ? (
                    <TableRow><TableCell colSpan={7} className="h-10 text-center italic">Sin movimientos.</TableCell></TableRow>
                  ) : (
                    [...filteredMovements].reverse().map((mov) => (
                      <TableRow key={mov.id} className="hover:bg-white/5 border-white/5">
                        <TableCell className="font-mono">
                          {new Date(mov.fecha + 'T12:00:00').toLocaleDateString('es-CL', { day: '2-digit', month: '2-digit' })}
                        </TableCell>
                        <TableCell className="text-muted-foreground whitespace-nowrap">
                          {mov.cajas?.nombre || (mov.cajas?.numero_caja ? `Caja ${mov.cajas.numero_caja}` : '-')}
                        </TableCell>
                        <TableCell>
                          <Badge variant={mov.tipo === 'ingreso' ? 'success' : 'destructive'} className="text-[10px] py-0 h-5">
                            {mov.tipo === 'ingreso' ? 'INGRESO' : 'EGRESO'}
                          </Badge>
                        </TableCell>
                        <TableCell className="max-w-[200px] truncate py-1 px-2" title={mov.descripcion}>
                          <div className="flex flex-col">
                            <span className="font-medium">{mov.descripcion || '-'}</span>
                            <span className="text-[9px] text-muted-foreground opacity-70">Ref: {mov.id.split('-')[0]}</span>
                          </div>
                        </TableCell>
                        <TableCell className={`text-right font-bold ${mov.tipo === 'ingreso' ? 'text-green-400' : 'text-red-400'}`}>
                          {mov.tipo === 'ingreso' ? '+' : '-'} {mov.monto_total.toLocaleString('es-CL')}
                        </TableCell>
                        <TableCell className="text-right font-mono bg-white/5">
                          {mov.totalGeneral.toLocaleString('es-CL')}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center justify-center gap-1">
                            <Button variant="ghost" size="icon" onClick={() => handleEdit(mov)} className="h-7 w-7 text-primary hover:bg-primary/10">
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                            <Button variant="ghost" size="icon" onClick={() => handleDelete(mov.id)} className="h-7 w-7 text-red-500 hover:bg-red-500/10">
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        )}
      </Card>
            <NuevoMovimientoReservaModal 
        open={isModalOpen} 
        setOpen={handleCloseModal} 
        onSuccess={() => {
          refresh();
          handleCloseModal();
        }} 
        movimiento={selectedMovimiento}
      />
      </div>
    </div>
  );
}
