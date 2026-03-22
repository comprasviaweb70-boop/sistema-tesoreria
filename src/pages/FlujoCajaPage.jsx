import React, { useState, useEffect, useMemo } from 'react';
import { Helmet } from 'react-helmet';
import { 
  TrendingUp, 
  TrendingDown, 
  Calendar, 
  Settings, 
  RefreshCcw, 
  Archive,
  ArrowRightLeft,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Download,
  Wallet
} from 'lucide-react';
import { supabase } from '@/lib/customSupabaseClient';
import { 
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import Header from '@/components/Header';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from '@/hooks/use-toast';

const formatCurrency = (val) => new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP' }).format(val || 0);

const FlujoCajaPage = () => {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [params, setParams] = useState([]);
  const [showParams, setShowParams] = useState(false);
  const [editingParams, setEditingParams] = useState([]);
  const [historyData, setHistoryData] = useState({
    ventaDiaria: [],
    pagosProveedor: [],
    reservaMovs: [],
    ajustes: []
  });
  
  const [currentMonth, setCurrentMonth] = useState(new Date().getMonth());
  const [currentYear, setCurrentYear] = useState(new Date().getFullYear());

  const fetchBaseData = async () => {
    setLoading(true);
    try {
      const { data: pData } = await supabase.from('fjc_parametros').select('*');
      if (pData) {
        setParams(pData);
        setEditingParams(JSON.parse(JSON.stringify(pData))); // Deep clone
      }

      const startDate = new Date(currentYear, currentMonth, 1);
      const endDate = new Date(currentYear, currentMonth + 1, 30); // Buffer for projection

      const startStr = startDate.toISOString().split('T')[0];
      const endStr = endDate.toISOString().split('T')[0];

      const [vd, pp, rm, aj] = await Promise.all([
        supabase.from('venta_diaria').select('*').gte('fecha', startStr).lte('fecha', endStr),
        supabase.from('pagos_proveedor').select('*').gte('fecha_pago', startStr).lte('fecha_pago', endStr),
        supabase.from('reserva_movimientos').select('*').gte('fecha', startStr).lte('fecha', endStr),
        supabase.from('fjc_saldos_ajuste').select('*').gte('fecha', startStr).lte('fecha', endStr)
      ]);

      setHistoryData({
        ventaDiaria: vd.data || [],
        pagosProveedor: pp.data || [],
        reservaMovs: rm.data || [],
        ajustes: aj.data || []
      });

    } catch (err) {
      console.error("Error fetching Cash Flow data:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleSaveParams = async () => {
    setLoading(true);
    try {
      const { error } = await supabase.from('fjc_parametros').upsert(editingParams);
      if (error) throw error;
      
      toast({
        title: "Parámetros actualizados",
        description: "Las proyecciones se han recalculado con éxito.",
      });
      setShowParams(false);
      fetchBaseData();
    } catch (err) {
      console.error("Error saving params:", err);
      toast({
        title: "Error al guardar",
        description: "No se pudieron actualizar los parámetros.",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const handleNextMonth = () => {
    if (currentMonth === 11) {
      setCurrentMonth(0);
      setCurrentYear(currentYear + 1);
    } else {
      setCurrentMonth(currentMonth + 1);
    }
  };

  const handlePrevMonth = () => {
    if (currentMonth === 0) {
      setCurrentMonth(11);
      setCurrentYear(currentYear - 1);
    } else {
      setCurrentMonth(currentMonth - 1);
    }
  };

  useEffect(() => {
    fetchBaseData();
  }, [currentMonth, currentYear]);

  const monthName = new Date(currentYear, currentMonth).toLocaleDateString('es-CL', { month: 'long', year: 'numeric' });
  const today = new Date().toISOString().split('T')[0];

  const handleInitialChange = async (key, val) => {
    try {
        const { error } = await supabase
            .from('fjc_parametros')
            .update({ estimado_lun_jue: val, estimado_vie_dom: val })
            .eq('field_key', key);
        
        if (error) throw error;
        fetchBaseData();
    } catch (err) {
        console.error("Error updating initial balance:", err);
    }
  };

  // Procesa los datos por día
  const dailyFlow = useMemo(() => {
    const today = new Date().toISOString().split('T')[0];
    const days = [];
    
    // Generar un rango desde el primer día del mes seleccionado
    const start = new Date(currentYear, currentMonth, 1);
    const numDays = 35; // Mostramos 5 semanas para tener contexto

    // Acumuladores para el saldo anterior inicial del mes
    const getInitial = (key) => params.find(p => p.field_key === key)?.estimado_lun_jue || 0;

    let currentReserva = getInitial('initial_reserva');
    let currentCajas = getInitial('initial_cajas');
    let currentMP = getInitial('initial_mp');
    let currentBCH = getInitial('initial_bch');

    for (let i = 0; i < numDays; i++) {
        const d = new Date(start);
        d.setDate(start.getDate() + i);
        const dStr = d.toISOString().split('T')[0];
        
        const isProjected = dStr > today;
        const dayOfWeek = d.getDay(); // 0=Sun, 1=Mon, ..., 6=Sat
        const isWeekendMode = [0, 5, 6].includes(dayOfWeek); // Viernes, Sábado, Domingo

        const getParam = (key) => {
          const p = params.find(item => item.field_key === key);
          if (!p) return 0;
          return isWeekendMode ? p.estimado_vie_dom : p.estimado_lun_jue;
        };

        // 1. DATA HISTÓRICA (Real)
        const realData = {
            venta_efectivo: historyData.ventaDiaria
                .filter(v => v.fecha === dStr)
                .reduce((acc, v) => acc + (parseFloat(v.venta_efectivo) || 0) - (parseFloat(v.vuelta) || 0), 0),
            abonos_mp: historyData.ventaDiaria
                .filter(v => v.fecha === dStr)
                .reduce((acc, v) => acc + (parseFloat(v.redelcom) || 0) + (parseFloat(v.tarjeta_credito) || 0), 0),
            abonos_bch: historyData.ventaDiaria
                .filter(v => v.fecha === dStr)
                .reduce((acc, v) => acc + (parseFloat(v.transferencia) || 0), 0),
            pago_banco: historyData.pagosProveedor
                .filter(p => p.fecha_pago === dStr && p.origen_fondos !== 'caja')
                .reduce((acc, p) => acc + (parseFloat(p.monto_pagado) || 0), 0),
            pago_caja: historyData.pagosProveedor
                .filter(p => p.fecha_pago === dStr && p.origen_fondos === 'caja')
                .reduce((acc, p) => acc + (parseFloat(p.monto_pagado) || 0), 0),
            gastos: historyData.ventaDiaria
                .filter(v => v.fecha === dStr)
                .reduce((acc, v) => acc + (parseFloat(v.servicios) || 0) + (parseFloat(v.gastos) || 0) + (parseFloat(v.otros_egresos) || 0), 0),
            rrhh: historyData.ventaDiaria
                .filter(v => v.fecha === dStr)
                .reduce((acc, v) => acc + (parseFloat(v.gastos_rrhh) || 0), 0),
            diferencia: historyData.ventaDiaria
                .filter(v => v.fecha === dStr)
                .reduce((acc, v) => acc + (parseFloat(v.diferencia_caja) || 0), 0),
        };

        // 2. DATA PROYECTADA (Usa parámetros si no hay real o si es futuro)
        const flow = {
            venta_efectivo: isProjected ? getParam('venta_efectivo') : realData.venta_efectivo,
            abonos_mp: isProjected ? getParam('abonos_mp') : realData.abonos_mp,
            abonos_bch: isProjected ? getParam('abonos_bch') : realData.abonos_bch,
            pago_banco: isProjected ? getParam('pagos_proveedor_banco') : realData.pago_banco,
            pago_caja: isProjected ? getParam('pagos_proveedor_caja') : realData.pago_caja,
            gastos: isProjected ? getParam('servicios_gastos') : realData.gastos,
            rrhh: isProjected ? getParam('rrhh') : realData.rrhh,
            diferencia: isProjected ? 0 : realData.diferencia,
        };

        const totalDia = (flow.venta_efectivo + flow.abonos_mp + flow.abonos_bch) - 
                        (flow.pago_banco + flow.pago_caja + flow.gastos + flow.rrhh) + flow.diferencia;

        const dataEntry = {
            fecha: dStr,
            isWeekend: isWeekendMode,
            isProjected,
            saldos: {
                reserva: currentReserva,
                cajas: currentCajas,
                mp: currentMP,
                bch: currentBCH,
                consolidado: currentReserva + currentCajas + currentMP + currentBCH
            },
            flow,
            totalDia
        };

        days.push(dataEntry);

        // Actualizar saldos para el día siguiente (Simulación de flujo)
        // Nota: En una lógica real, los abonos MP irían a MP, etc. 
        // Simplificaremos sumando todo al consolidado proporcionalmente por ahora.
        currentCajas += (flow.venta_efectivo - flow.pago_caja - flow.gastos - flow.rrhh + flow.diferencia);
        currentMP += flow.abonos_mp;
        currentBCH += (flow.abonos_bch - flow.pago_banco);
    }
    return days;
  }, [historyData, params, currentMonth, currentYear]);

  return (
    <div className="gradient-bg min-h-screen">
      <Helmet>
        <title>Flujo de Caja - Iciz Market</title>
      </Helmet>
      <Header />
      
      <div className="max-w-[1800px] mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-primary/10 rounded-lg">
                <Wallet className="h-6 w-6 text-primary" />
            </div>
            <div>
                <h2 className="text-2xl font-bold text-foreground">Flujo de Caja Proyectado</h2>
                <p className="text-sm text-muted-foreground">Control de liquidez, historia y proyecciones a 30 días</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
             <Button variant="outline" size="sm" onClick={() => setShowParams(true)} className="glass-button">
                <Settings className="h-4 w-4 mr-2" />
                Parámetros
             </Button>
             <Button className="accent-button" onClick={fetchBaseData} disabled={loading}>
                {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <RefreshCcw className="h-4 w-4 mr-2" />}
                Actualizar
             </Button>
          </div>
        </div>

        {/* DIALOGO DE PARÁMETROS */}
        <Dialog open={showParams} onOpenChange={setShowParams}>
            <DialogContent className="glass-card border-border/50 max-w-2xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <Settings className="h-5 w-5 text-primary" />
                        Configuración de Parámetros
                    </DialogTitle>
                    <DialogDescription>
                        Define las estimaciones diarias para las proyecciones futuras (30 días).
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-4 py-4">
                    <div className="grid grid-cols-12 gap-4 px-2 py-2 bg-secondary/20 rounded-t-lg text-[10px] font-bold uppercase text-muted-foreground">
                        <div className="col-span-6">Concepto</div>
                        <div className="col-span-3 text-center text-primary">Lun - Jue</div>
                        <div className="col-span-3 text-center text-accent">Vie - Dom</div>
                    </div>
                    {editingParams.map((p, idx) => (
                        <div key={p.field_key} className="grid grid-cols-12 gap-4 items-center border-b border-border/30 pb-2">
                            <div className="col-span-6 text-sm font-medium">{p.label}</div>
                            <div className="col-span-3">
                                <input 
                                    className="w-full bg-background/50 border border-border/50 rounded p-1 text-right text-sm"
                                    type="number"
                                    value={p.estimado_lun_jue}
                                    onChange={(e) => {
                                        const newParams = [...editingParams];
                                        newParams[idx].estimado_lun_jue = parseFloat(e.target.value) || 0;
                                        setEditingParams(newParams);
                                    }}
                                />
                            </div>
                            <div className="col-span-3">
                                <input 
                                    className="w-full bg-background/50 border border-border/50 rounded p-1 text-right text-sm"
                                    type="number"
                                    value={p.estimado_vie_dom}
                                    onChange={(e) => {
                                        const newParams = [...editingParams];
                                        newParams[idx].estimado_vie_dom = parseFloat(e.target.value) || 0;
                                        setEditingParams(newParams);
                                    }}
                                />
                            </div>
                        </div>
                    ))}
                </div>

                <DialogFooter className="gap-2">
                    <Button variant="ghost" onClick={() => setShowParams(false)} disabled={loading}>Cancelar</Button>
                    <Button className="accent-button" onClick={handleSaveParams} disabled={loading}>
                        {loading && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                        Guardar Cambios
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>

        <Card className="glass-card">
            <CardHeader className="pb-2 border-b border-border/50">
                <div className="flex items-center justify-between">
                    <CardTitle className="text-lg capitalize">{monthName}</CardTitle>
                    <div className="flex items-center gap-1">
                        <Button variant="ghost" size="icon" className="h-8 w-8 hover:bg-white/10" onClick={handlePrevMonth}><ChevronLeft className="h-4 w-4" /></Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8 hover:bg-white/10" onClick={handleNextMonth}><ChevronRight className="h-4 w-4" /></Button>
                    </div>
                </div>
            </CardHeader>
            <CardContent className="p-0">
                <div className="overflow-x-auto scrollbar-thin">
                    <table className="w-full text-xs text-left border-collapse">
                        <thead className="bg-secondary/20 sticky top-0 z-20">
                            <tr>
                                <th className="p-3 border-r border-border/50 min-w-[240px] bg-background/95 backdrop-blur-md sticky left-0 z-30">
                                  <div className="flex items-center justify-between text-[10px] text-muted-foreground uppercase font-bold tracking-wider">
                                    <span>CONCEPTO</span>
                                    <span>DETALLE</span>
                                  </div>
                                </th>
                                {dailyFlow.map(d => (
                                    <th key={d.fecha} className={`p-3 text-center border-r border-border/50 min-w-[120px] transition-all duration-300 ${d.fecha === today ? 'bg-primary/20 ring-2 ring-primary ring-inset shadow-[0_0_15px_rgba(245,158,11,0.2)]' : d.isWeekend ? 'bg-primary/10' : ''}`}>
                                        <div className="font-dm-sans font-bold text-sm">{new Date(d.fecha + 'T12:00:00').toLocaleDateString('es-CL', { day: '2-digit', month: 'short' })}</div>
                                        <div className={`text-[10px] uppercase font-mono mt-1 ${d.fecha === today ? 'text-primary font-bold' : 'opacity-60'}`}>
                                          {new Date(d.fecha + 'T12:00:00').toLocaleDateString('es-CL', { weekday: 'short' })}
                                        </div>
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {/* SALDOS ANTERIORES */}
                            {[
                                { key: 'initial_reserva', label: 'SALDO ANTERIOR RESERVA', account: 'reserva' },
                                { key: 'initial_cajas', label: 'SALDO ANTERIOR CAJAS', account: 'cajas' },
                                { key: 'initial_mp', label: 'SALDO ANTERIOR MERCADO PAGO', account: 'mp' },
                                { key: 'initial_bch', label: 'SALDO ANTERIOR BCO CHILE', account: 'bch' },
                            ].map((row) => (
                                <tr key={row.key} className="bg-primary/5 font-semibold text-[10px] uppercase text-muted-foreground border-b border-border/30 hover:bg-primary/10 transition-colors">
                                    <td className="p-2 border-r border-border/50 sticky left-0 bg-primary/10 backdrop-blur-sm z-10 flex items-center justify-between">
                                      {row.label}
                                    </td>
                                    {dailyFlow.map((d, i) => (
                                        <td key={d.fecha} className={`p-2 text-right border-r border-border/50 pr-4 ${d.fecha === today ? 'bg-primary/10 relative before:content-[""] before:absolute before:inset-0 before:ring-1 before:ring-primary/30' : ''}`}>
                                            {i === 0 ? (
                                                <input 
                                                    type="number"
                                                    className="w-full bg-transparent border-none text-right font-bold text-foreground focus:ring-1 focus:ring-primary rounded px-1 -mr-1"
                                                    defaultValue={Math.round(d.saldos[row.account])}
                                                    onBlur={(e) => handleInitialChange(row.key, parseFloat(e.target.value) || 0)}
                                                    onKeyDown={(e) => e.key === 'Enter' && e.target.blur()}
                                                />
                                            ) : (
                                                <span className="opacity-70">{formatCurrency(d.saldos[row.account])}</span>
                                            )}
                                        </td>
                                    ))}
                                </tr>
                            ))}

                            {/* INGRESOS */}
                            <tr className="bg-green-500/5 font-bold"><td colSpan={dailyFlow.length + 1} className="p-2 border-b border-border/50 px-4 text-green-500 flex items-center gap-2"><TrendingUp className="h-3 w-3"/> INGRESOS</td></tr>
                            {[
                                { key: 'venta_efectivo', label: 'Venta Efectivo' },
                                { key: 'abonos_mp', label: 'Abonos Mercado Pago' },
                                { key: 'abonos_bch', label: 'Abonos Banco Chile' }
                            ].map(row => (
                                <tr key={row.key} className="border-b border-border/30 transition-colors hover:bg-white/5">
                                    <td className="p-3 border-r border-border/50 sticky left-0 bg-background/95 backdrop-blur-sm z-10">{row.label}</td>
                                    {dailyFlow.map(d => (
                                        <td key={d.fecha} className={`p-3 text-right border-r border-border/50 pr-4 ${d.fecha === today ? 'bg-primary/20 font-bold' : ''} ${d.isProjected ? 'text-muted-foreground italic' : ''}`}>
                                            {formatCurrency(d.flow[row.key])}
                                        </td>
                                    ))}
                                </tr>
                            ))}

                            {/* EGRESOS */}
                            <tr className="bg-red-500/5 font-bold"><td colSpan={dailyFlow.length + 1} className="p-2 border-b border-border/50 px-4 text-red-400 flex items-center gap-2"><TrendingDown className="h-3 w-3"/> EGRESOS</td></tr>
                            {[
                                { key: 'pago_banco', label: 'Pago Proveedores (Banco)' },
                                { key: 'pago_caja', label: 'Pago Proveedores (Caja)' },
                                { key: 'gastos', label: 'Servicios y Gastos' },
                                { key: 'rrhh', label: 'RRHH' }
                            ].map(row => (
                                <tr key={row.key} className="border-b border-border/30 transition-colors hover:bg-white/5">
                                    <td className="p-3 border-r border-border/50 sticky left-0 bg-background/95 backdrop-blur-sm z-10">{row.label}</td>
                                    {dailyFlow.map(d => (
                                        <td key={d.fecha} className={`p-3 text-right border-r border-border/50 pr-4 ${d.fecha === today ? 'bg-primary/20 font-bold' : ''} ${d.isProjected ? 'text-muted-foreground italic' : 'text-red-400/80'}`}>
                                            {formatCurrency(d.flow[row.key])}
                                        </td>
                                    ))}
                                </tr>
                            ))}

                            <tr className="border-b border-border/50 transition-colors hover:bg-white/5">
                                <td className="p-3 border-r border-border/50 sticky left-0 bg-background/95 backdrop-blur-sm z-10 text-amber-400 font-semibold">Diferencia de Caja</td>
                                {dailyFlow.map(d => (
                                    <td key={d.fecha} className={`p-3 text-right border-r border-border/50 pr-4 ${d.fecha === today ? 'bg-primary/20 font-bold' : ''} ${d.isProjected ? 'text-muted-foreground italic' : (d.flow.diferencia < 0 ? 'text-red-400' : 'text-green-400')}`}>
                                        {formatCurrency(d.flow.diferencia)}
                                    </td>
                                ))}
                            </tr>
                        </tbody>
                        <tfoot className="sticky bottom-0 z-20">
                             <tr className="bg-primary/20 font-extrabold border-t-2 border-primary">
                                <td className="p-4 border-r border-border/50 sticky left-0 bg-primary/40 backdrop-blur-sm z-30">LIBRE DISPONIBILIDAD (Final)</td>
                                {dailyFlow.map(d => (
                                    <td key={d.fecha} className={`p-4 text-right border-r border-border/50 pr-4 text-primary underline ${d.fecha === today ? 'bg-primary/40' : ''}`}>
                                      {formatCurrency(d.saldos.consolidado + d.totalDia)}
                                    </td>
                                ))}
                            </tr>
                        </tfoot>
                    </table>
                </div>
            </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default FlujoCajaPage;
