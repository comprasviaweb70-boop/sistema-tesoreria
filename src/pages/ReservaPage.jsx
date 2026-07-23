import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
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
  Calculator,
  RotateCcw
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import Header from '@/components/Header';
import CajaSelector from '@/components/CajaSelector';
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

const DETAIL_STORAGE_KEYS = {
  fechaInicio: 'reserva_detalle_fechaInicio',
  fechaFin: 'reserva_detalle_fechaFin',
  search: 'reserva_detalle_search',
  filterCaja: 'reserva_detalle_filterCaja',
  filterFecha: 'reserva_detalle_filterFecha',
};

const SALDOS_STORAGE_KEYS = {
  fechaInicio: 'reserva_saldos_fechaInicio',
  fechaFin: 'reserva_saldos_fechaFin',
};

const LEGACY_STORAGE_KEYS = [
  { old: 'rpg_fechaInicio', next: DETAIL_STORAGE_KEYS.fechaInicio },
  { old: 'rpg_fechaFin', next: DETAIL_STORAGE_KEYS.fechaFin },
  { old: 'rpg_search', next: DETAIL_STORAGE_KEYS.search },
  { old: 'rpg_filterCaja', next: DETAIL_STORAGE_KEYS.filterCaja },
  { old: 'rpg_filterFecha', next: DETAIL_STORAGE_KEYS.filterFecha },
];

const safeGetItem = (key) => {
  if (typeof window === 'undefined') return null;
  try {
    const value = window.localStorage.getItem(key);
    if (value === null || value === 'undefined' || value === 'null') return null;
    return value;
  } catch (err) {
    console.warn('ReservaPage: error leyendo localStorage', key, err);
    return null;
  }
};

const safeSetItem = (key, value) => {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(key, value);
  } catch (err) {
    console.warn('ReservaPage: error guardando localStorage', key, err);
  }
};

const safeRemoveItem = (key) => {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(key);
  } catch (err) {
    console.warn('ReservaPage: error eliminando localStorage', key, err);
  }
};

const persistValue = (key, value, { allowEmpty = false } = {}) => {
  if (!allowEmpty && (value === null || value === undefined || value === '')) {
    safeRemoveItem(key);
    return;
  }
  safeSetItem(key, value ?? '');
};

const getTodayStr = () => new Date().toISOString().split('T')[0];
const getStartOfYearStr = () => {
  const d = new Date();
  return new Date(d.getFullYear(), 0, 1).toISOString().split('T')[0];
};

const formatDate = (dateStr) => {
  if (!dateStr) return '';
  return new Date(dateStr + 'T12:00:00').toLocaleDateString('es-CL');
};

export default function ReservaPage() {
  const { isAdmin } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  console.log("ReservaPage rendering, isAdmin:", isAdmin);
  const [selectedMovimiento, setSelectedMovimiento] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isHistoryExpanded, setIsHistoryExpanded] = useState(true);

  const [detalleFechaInicio, setDetalleFechaInicio] = useState(() => safeGetItem(DETAIL_STORAGE_KEYS.fechaInicio) || getStartOfYearStr());
  const [detalleFechaFin, setDetalleFechaFin] = useState(() => safeGetItem(DETAIL_STORAGE_KEYS.fechaFin) || getTodayStr());
  const [searchTerm, setSearchTerm] = useState(() => safeGetItem(DETAIL_STORAGE_KEYS.search) || '');
  const [filterCaja, setFilterCaja] = useState(() => safeGetItem(DETAIL_STORAGE_KEYS.filterCaja) || 'all');
  const [filterFecha, setFilterFecha] = useState(() => safeGetItem(DETAIL_STORAGE_KEYS.filterFecha) || '');

  const [saldosFechaInicio, setSaldosFechaInicio] = useState(() => safeGetItem(SALDOS_STORAGE_KEYS.fechaInicio) || getStartOfYearStr());
  const [saldosFechaFin, setSaldosFechaFin] = useState(() => safeGetItem(SALDOS_STORAGE_KEYS.fechaFin) || getTodayStr());

  const { movimientos, loading, refresh, deleteMovimiento } = useReserva(detalleFechaInicio, detalleFechaFin);
  const [saldosDiarios, setSaldosDiarios] = useState([]);
  const detalleDateWarningShown = useRef(false);
  const saldosDateWarningShown = useRef(false);

  // Migración única desde claves legacy rpg_* hacia los namespaces actuales
  useEffect(() => {
    LEGACY_STORAGE_KEYS.forEach(({ old, next }) => {
      const legacyValue = safeGetItem(old);
      if (legacyValue !== null && safeGetItem(next) === null) {
        safeSetItem(next, legacyValue);
      }
      safeRemoveItem(old);
    });
  }, []);

  const loadSaldos = useCallback(async () => {
    if (!saldosFechaInicio || !saldosFechaFin) return;
    try {
      const { data, error } = await supabase
        .from('saldos_diarios')
        .select('*')
        .gte('fecha', saldosFechaInicio)
        .lte('fecha', saldosFechaFin)
        .order('fecha', { ascending: true });
      if (error) throw error;
      setSaldosDiarios(data || []);
    } catch (err) {
      console.error('Error cargando saldos_diarios:', err);
      toast({ title: "No se pudieron cargar los saldos", description: err.message || 'Intente nuevamente.', variant: 'destructive' });
    }
  }, [saldosFechaInicio, saldosFechaFin, toast]);

  useEffect(() => {
    loadSaldos();
  }, [loadSaldos]);

  // Corrección automática de rangos inválidos en detalle
  useEffect(() => {
    if (!detalleFechaInicio || !detalleFechaFin) return;
    if (detalleFechaInicio > detalleFechaFin) {
      setDetalleFechaFin(detalleFechaInicio);
      if (!detalleDateWarningShown.current) {
        toast({ title: 'Rango inválido', description: 'El rango de detalle se ajustó porque la fecha de inicio era posterior a la de término.', variant: 'destructive' });
        detalleDateWarningShown.current = true;
      }
    } else {
      detalleDateWarningShown.current = false;
    }
  }, [detalleFechaInicio, detalleFechaFin, toast]);

  // Corrección automática de rangos inválidos en saldos
  useEffect(() => {
    if (!saldosFechaInicio || !saldosFechaFin) return;
    if (saldosFechaInicio > saldosFechaFin) {
      setSaldosFechaFin(saldosFechaInicio);
      if (!saldosDateWarningShown.current) {
        toast({ title: 'Rango inválido', description: 'El rango de saldos se ajustó porque la fecha de inicio era posterior a la de término.', variant: 'destructive' });
        saldosDateWarningShown.current = true;
      }
    } else {
      saldosDateWarningShown.current = false;
    }
  }, [saldosFechaInicio, saldosFechaFin, toast]);

  // Sanitización de la fecha puntual: si filterFecha queda fuera del rango
  // del detalle (ej: por cambiar detalleFechaInicio/Fin), la limpia silenciosamente
  // sin mostrar toast destructivo — es comportamiento esperado.
  useEffect(() => {
    if (!filterFecha) return;
    if ((detalleFechaInicio && filterFecha < detalleFechaInicio) || (detalleFechaFin && filterFecha > detalleFechaFin)) {
      setFilterFecha('');
    }
  }, [filterFecha, detalleFechaInicio, detalleFechaFin]);

  // Persistencia sincronizada de filtros del detalle
  useEffect(() => { persistValue(DETAIL_STORAGE_KEYS.fechaInicio, detalleFechaInicio); }, [detalleFechaInicio]);
  useEffect(() => { persistValue(DETAIL_STORAGE_KEYS.fechaFin, detalleFechaFin); }, [detalleFechaFin]);
  useEffect(() => { persistValue(DETAIL_STORAGE_KEYS.search, searchTerm, { allowEmpty: true }); }, [searchTerm]);
  useEffect(() => { persistValue(DETAIL_STORAGE_KEYS.filterCaja, filterCaja, { allowEmpty: true }); }, [filterCaja]);
  useEffect(() => { persistValue(DETAIL_STORAGE_KEYS.filterFecha, filterFecha, { allowEmpty: true }); }, [filterFecha]);

  // Persistencia sincronizada de filtros de saldos
  useEffect(() => { persistValue(SALDOS_STORAGE_KEYS.fechaInicio, saldosFechaInicio); }, [saldosFechaInicio]);
  useEffect(() => { persistValue(SALDOS_STORAGE_KEYS.fechaFin, saldosFechaFin); }, [saldosFechaFin]);

  const handleResetDetalle = () => {
    const defaultInicio = getStartOfYearStr();
    const defaultFin = getTodayStr();
    setDetalleFechaInicio(defaultInicio);
    setDetalleFechaFin(defaultFin);
    setSearchTerm('');
    setFilterCaja('all');
    setFilterFecha('');
  };

  const handleResetSaldos = () => {
    const defaultInicio = getStartOfYearStr();
    const defaultFin = getTodayStr();
    setSaldosFechaInicio(defaultInicio);
    setSaldosFechaFin(defaultFin);
  };

  console.log("Movimientos fetched:", movimientos.length, "Loading:", loading);

  const handleEdit = (mov) => {
    setSelectedMovimiento(mov);
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setSelectedMovimiento(null);
  };

  const handleResetFilters = () => {
    handleResetDetalle();
    handleResetSaldos();
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
    // 1. Saldos diarios desde la tabla saldos_diarios (source of truth vía trigger)
    const balances = (saldosDiarios || []).map(sd => {
      const tb = (sd.b20k||0)+(sd.b10k||0)+(sd.b5k||0)+(sd.b2k||0)+(sd.b1k||0);
      const tm = (sd.m500||0)+(sd.m100||0)+(sd.m50||0)+(sd.m10||0);
      return {
        fecha: sd.fecha,
        saldos: { b20k:sd.b20k||0, b10k:sd.b10k||0, b5k:sd.b5k||0, b2k:sd.b2k||0, b1k:sd.b1k||0, m500:sd.m500||0, m100:sd.m100||0, m50:sd.m50||0, m10:sd.m10||0 },
        totalBilletes: tb,
        totalMonedas: tm,
        totalGeneral: tb + tm
      };
    });

    // 2. Mapa de saldos diarios para mostrar en el detalle
    const saldoByDate = {};
    (saldosDiarios || []).forEach(sd => {
      saldoByDate[sd.fecha] = (sd.b20k||0)+(sd.b10k||0)+(sd.b5k||0)+(sd.b2k||0)+(sd.b1k||0)+(sd.m500||0)+(sd.m100||0)+(sd.m50||0)+(sd.m10||0);
    });

    // 3. Movimientos detallados con saldo del día desde saldos_diarios
    const detailed = (movimientos || []).map(mov => ({
      ...mov,
      totalGeneral: saldoByDate[mov.fecha] || (mov.monto_total || 0)
    }));

    return { dailyBalances: balances, detailedMovements: detailed };
  }, [movimientos, saldosDiarios]);

  const filteredMovements = useMemo(() => {
    const lowerSearch = searchTerm.toLowerCase();
    return detailedMovements.filter(mov => {
      const cajaNombre = mov.cajas?.nombre?.toLowerCase() || '';
      const cajaNumero = mov.cajas?.numero_caja?.toString() || '';
      const descripcion = mov.descripcion?.toLowerCase() || '';
      const monto = mov.monto_total?.toString() || '';
      const tipo = mov.tipo?.toLowerCase() || '';
      
      const matchesSearch = !searchTerm || 
             descripcion.includes(lowerSearch) || 
             monto.includes(lowerSearch) || 
             tipo.includes(lowerSearch) ||
             cajaNombre.includes(lowerSearch) ||
             cajaNumero.includes(lowerSearch);

      const matchesCaja = filterCaja === 'all' || mov.caja_id === filterCaja;
      const matchesFecha = !filterFecha || mov.fecha === filterFecha;

      return matchesSearch && matchesCaja && matchesFecha;
    });
  }, [detailedMovements, searchTerm, filterCaja, filterFecha]);

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
          <div className="flex flex-wrap items-end gap-4 justify-between">
            <div className="space-y-1">
              <p className="text-[10px] uppercase tracking-wide text-amber-500/80 font-bold">Saldos Diarios</p>
              <div className="flex flex-wrap items-end gap-4">
                <div className="space-y-2">
                  <label className="text-xs font-medium text-muted-foreground">Desde</label>
                  <div className="relative">
                    <CalendarIcon className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                      type="date"
                      value={saldosFechaInicio}
                      onChange={(e) => setSaldosFechaInicio(e.target.value)}
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
                      value={saldosFechaFin}
                      onChange={(e) => setSaldosFechaFin(e.target.value)}
                      className="glass-input pl-9 w-[180px] font-medium [color-scheme:dark] text-foreground/80"
                    />
                  </div>
                </div>
                <span className="text-[11px] text-muted-foreground italic">Se actualiza automáticamente</span>
              </div>
            </div>
            <div className="flex flex-wrap items-end gap-2">
              <Button onClick={handleResetSaldos} variant="outline" className="glass-button h-10 px-4">
                <RotateCcw className="h-4 w-4 mr-2" />
                Reset Saldos
              </Button>
            </div>
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
        <CardHeader className="space-y-4">
          <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
            <div className="flex items-center gap-3">
              <History className="h-5 w-5 text-primary" />
              <div>
                <CardTitle className="text-base">Detalle de Movimientos</CardTitle>
                <CardDescription className="text-xs">Lista completa de ingresos, egresos y responsables.</CardDescription>
              </div>
            </div>
            <Button variant="ghost" size="sm" className="gap-2 shrink-0 h-8" onClick={() => setIsHistoryExpanded(!isHistoryExpanded)}>
              {isHistoryExpanded ? <><ChevronUp className="h-4 w-4" /> Contraer</> : <><ChevronDown className="h-4 w-4" /> Expandir</>}
            </Button>
          </div>
          <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
            <div className="flex flex-wrap items-center gap-2">
              <Button onClick={handleResetDetalle} variant="ghost" className="glass-button h-10 px-3">
                <RotateCcw className="h-4 w-4" />
                Reset filtros Detalle
              </Button>
            </div>
            <div className="flex flex-wrap items-end gap-3 justify-end">
              <div className="flex items-center gap-1.5">
                <label className="text-[10px] text-muted-foreground uppercase font-bold shrink-0">Caja:</label>
                <CajaSelector 
                  value={filterCaja} 
                  onChange={setFilterCaja} 
                  showAllOption={true} 
                  allOptionLabel="TODAS"
                  label={null}
                  className="w-[110px] space-y-0"
                />
              </div>
              <div className="flex items-center gap-1.5">
                <label className="text-[10px] text-muted-foreground uppercase font-bold shrink-0">Fecha:</label>
                <Input
                  type="date"
                  value={filterFecha}
                  onChange={(e) => setFilterFecha(e.target.value)}
                  className="h-7 w-[125px] text-[11px] glass-input bg-white/5 font-medium [color-scheme:dark] px-2"
                />
              </div>
              <div className="relative">
                <Search className="absolute left-2 top-1.5 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  placeholder="Buscar descripción..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="h-7 w-[150px] pl-7 text-[11px] glass-input bg-white/5"
                />
              </div>
            </div>
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
                    <TableRow>
                      <TableCell colSpan={7} className="h-24">
                        <div className="h-full flex flex-col items-center justify-center gap-3 text-center text-sm text-muted-foreground">
                          <p>No se encontraron movimientos con los filtros actuales.</p>
                          <div className="flex flex-wrap items-center justify-center gap-2 text-[11px]">
                            <Badge variant="outline">Desde: {formatDate(detalleFechaInicio)}</Badge>
                            <Badge variant="outline">Hasta: {formatDate(detalleFechaFin)}</Badge>
                            {filterCaja !== 'all' && <Badge variant="outline">Caja: {filterCaja}</Badge>}
                            {filterFecha && <Badge variant="outline">Fecha puntual: {formatDate(filterFecha)}</Badge>}
                            {searchTerm && <Badge variant="outline">Texto: “{searchTerm}”</Badge>}
                          </div>
                          <Button size="sm" variant="ghost" onClick={handleResetDetalle} className="gap-2">
                            <RotateCcw className="h-4 w-4" /> Restablecer filtros de Detalle
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
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
