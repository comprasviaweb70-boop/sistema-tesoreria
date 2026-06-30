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
    ajustes: [],
    otrosMovs: [],
    saldosDiarios: []
  });
  
  const [currentMonth, setCurrentMonth] = useState(() => {
    const saved = localStorage.getItem('fjc_currentMonth');
    return saved !== null ? parseInt(saved, 10) : new Date().getMonth();
  });
  const [currentYear, setCurrentYear] = useState(() => {
    const saved = localStorage.getItem('fjc_currentYear');
    return saved !== null ? parseInt(saved, 10) : new Date().getFullYear();
  });

  useEffect(() => { localStorage.setItem('fjc_currentMonth', currentMonth); }, [currentMonth]);
  useEffect(() => { localStorage.setItem('fjc_currentYear', currentYear); }, [currentYear]);

  const fetchBaseData = async () => {
    setLoading(true);
    try {
      const { data: pData } = await supabase.from('fjc_parametros').select('*');
      
      let finalParams = pData || [];
      
      if (!pData || pData.length === 0) {
          // Primera vez: tabla vacía. Sembrar SOLO si la tabla realmente está vacía
          // y solo insertar los keys que faltan (preservando los existentes si los hay).
          const defaults = [
              { field_key: 'venta_efectivo', label: 'Venta Efectivo', estimado_lun_jue: 0, estimado_vie_dom: 0 },
              { field_key: 'abonos_mp', label: 'Abonos Mercado Pago', estimado_lun_jue: 0, estimado_vie_dom: 0 },
              { field_key: 'abonos_bch', label: 'Abonos Banco Chile', estimado_lun_jue: 0, estimado_vie_dom: 0 },
              { field_key: 'pagos_proveedor_banco', label: 'Pagos Proveedor Banco', estimado_lun_jue: 0, estimado_vie_dom: 0 },
              { field_key: 'pagos_proveedor_caja', label: 'Pagos Proveedor Caja', estimado_lun_jue: 0, estimado_vie_dom: 0 },
              { field_key: 'servicios_gastos', label: 'Servicios y Gastos', estimado_lun_jue: 0, estimado_vie_dom: 0 },
              { field_key: 'rrhh', label: 'RRHH', estimado_lun_jue: 0, estimado_vie_dom: 0 },
              { field_key: 'initial_reserva', label: 'Saldo Inicial Reserva', estimado_lun_jue: 0, estimado_vie_dom: 0 },
              { field_key: 'initial_cajas', label: 'Saldo Inicial Cajas', estimado_lun_jue: 0, estimado_vie_dom: 0 },
              { field_key: 'initial_mp', label: 'Saldo Inicial Mercado Pago', estimado_lun_jue: 0, estimado_vie_dom: 0 },
              { field_key: 'initial_bch', label: 'Saldo Inicial Banco Chile', estimado_lun_jue: 0, estimado_vie_dom: 0 }
          ];
          finalParams = defaults;
          // Insertar solo si la tabla está completamente vacía (no upsert destructivo)
          try {
              const { error: insertError } = await supabase.from('fjc_parametros').insert(defaults);
              if (insertError) {
                  toast({
                    title: "Advertencia: Parámetros no inicializados",
                    description: "No se pudieron guardar los parámetros por defecto. Los valores se mostrarán en $0 hasta que se actualicen manualmente.",
                    variant: "destructive"
                  });
                  console.warn('No se pudieron insertar defaults:', insertError.message);
              }
          } catch (e) {
              toast({
                title: "Error al inicializar parámetros",
                description: "Ocurrió un error al crear los parámetros por defecto.",
                variant: "destructive"
              });
              console.warn('No se pudieron insertar defaults:', e.message);
          }
      }
      
      setParams(finalParams);
      setEditingParams(JSON.parse(JSON.stringify(finalParams)));

      const startDate = new Date(currentYear, currentMonth, 1);
      const endDate = new Date(currentYear, currentMonth + 1, 30); // Buffer for projection

      const startStr = startDate.toISOString().split('T')[0];
      const endStr = endDate.toISOString().split('T')[0];

      const [vd, pp, rm, aj, om, sd] = await Promise.all([
        supabase.from('venta_diaria').select('*').gte('fecha', startStr).lte('fecha', endStr),
        supabase.from('pagos_proveedor').select('*').gte('fecha_pago', startStr).lte('fecha_pago', endStr),
        supabase.from('reserva_movimientos').select('*').gte('fecha', startStr).lte('fecha', endStr),
        supabase.from('fjc_saldos_ajuste').select('*').gte('fecha', startStr).lte('fecha', endStr),
        supabase.from('otros_movimientos').select('*, categorias_movimiento(nombre)').gte('fecha', startStr).lte('fecha', endStr),
        supabase.from('saldos_diarios').select('*').gte('fecha', startStr).lte('fecha', endStr)
      ]);

      setHistoryData({
        ventaDiaria: vd.data || [],
        pagosProveedor: pp.data || [],
        reservaMovs: rm.data || [],
        ajustes: aj.data || [],
        otrosMovs: om.data || [],
        saldosDiarios: sd.data || []
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
  
  const scrollContainerRef = React.useRef(null);
  const topScrollRef = React.useRef(null);
  const [scrollX, setScrollX] = useState(0);

  const handleScrollSync = (e) => {
    const { scrollLeft } = e.target;
    setScrollX(scrollLeft);
    if (e.target === scrollContainerRef.current && topScrollRef.current) {
        topScrollRef.current.scrollLeft = scrollLeft;
    } else if (e.target === topScrollRef.current && scrollContainerRef.current) {
        scrollContainerRef.current.scrollLeft = scrollLeft;
    }
  };

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

    // Helper para calcular saldo de reserva desde saldos_diarios
    const getReservaFromSnapshot = (fecha) => {
      const saldo = historyData.saldosDiarios.find(s => s.fecha === fecha);
      if (!saldo) return null;
      return saldo.b20k + saldo.b10k + saldo.b5k + saldo.b2k + saldo.b1k + 
             saldo.m500 + saldo.m100 + saldo.m50 + saldo.m10;
    };

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

        // 1.1 DATA OTROS MOVIMIENTOS - Separar por cuenta (MP vs BCH)
        // El tag [Cuenta: MP] o [Cuenta: BCH] en descripcion identifica la cuenta
        const bankMovs = historyData.otrosMovs.filter(m => m.fecha === dStr && (m.caja_id === 'cuenta_corriente' || m.caja_id === null));
        
        // Dos agregados separados por cuenta
        const mpAgg = { ingresos: 0, egresos_prov: 0, egresos_rrhh: 0, egresos_gastos: 0 };
        const bchAgg = { ingresos: 0, egresos_prov: 0, egresos_rrhh: 0, egresos_gastos: 0 };

        bankMovs.forEach(m => {
          const monto = parseFloat(m.monto) || 0;
          const cat = (m.categorias_movimiento?.nombre || '').toLowerCase();
          const desc = (m.descripcion || '').toUpperCase();
          
          // Determinar cuenta destino según tag en descripcion
          // Sin tag → MP por defecto (cuenta principal de operaciones)
          const esMP = desc.includes('[CUENTA: MP]') || desc.includes('[CUENTA:MP]');
          const esBCH = desc.includes('[CUENTA: BCH]') || desc.includes('[CUENTA:BCH]');
          const agg = esBCH ? bchAgg : mpAgg; // default a MP
          
          if (m.tipo === 'ingreso') {
            agg.ingresos += monto;
          } else {
            if (cat.includes('proveedor')) {
              agg.egresos_prov += monto;
            } else if (cat.includes('rrhh') || cat.includes('sueldo') || cat.includes('personal')) {
              agg.egresos_rrhh += monto;
            } else {
              agg.egresos_gastos += monto;
            }
          }
        });

        // 1.2 RESERVA MOVIMIENTOS (retiros de caja a reserva)
        const reservMovs = historyData.reservaMovs.filter(m => m.fecha === dStr);
        let reservaIn = 0, reservaOut = 0;
        reservMovs.forEach(m => {
            const monto = parseFloat(m.monto_total) || 0;
            if (m.tipo === 'ingreso') reservaIn += monto;
            else reservaOut += monto;
        });

        // 1.3 AJUSTES MP (comisiones de Mercado Pago)
        const ajusteMP = historyData.ajustes
            .filter(a => a.fecha === dStr && a.campo === 'comision_mp')
            .reduce((acc, a) => acc + (parseFloat(a.monto) || 0), 0);

        // 2. DATA PROYECTADA (Usa parámetros si no hay real o si es futuro)
        const flow = {
            venta_efectivo: isProjected ? getParam('venta_efectivo') : realData.venta_efectivo,
            abonos_mp: isProjected ? getParam('abonos_mp') : (realData.abonos_mp + mpAgg.ingresos),
            abonos_bch: isProjected ? getParam('abonos_bch') : (realData.abonos_bch + bchAgg.ingresos),
            pago_banco: isProjected ? getParam('pagos_proveedor_banco') : (bchAgg.egresos_prov),
            pago_caja: isProjected ? getParam('pagos_proveedor_caja') : realData.pago_caja,
            gastos: isProjected ? getParam('servicios_gastos') : (realData.gastos + mpAgg.egresos_gastos + bchAgg.egresos_gastos),
            rrhh: isProjected ? getParam('rrhh') : (realData.rrhh + mpAgg.egresos_rrhh + bchAgg.egresos_rrhh),
            diferencia: isProjected ? 0 : realData.diferencia,
            mpEgresos: mpAgg.egresos_prov + mpAgg.egresos_rrhh + mpAgg.egresos_gastos,
        };

        const totalDia = (flow.venta_efectivo + flow.abonos_mp + flow.abonos_bch) - 
                        (flow.pago_banco + flow.pago_caja + flow.gastos + flow.rrhh) + flow.diferencia - ajusteMP;
        // Reserva: usar snapshot de saldos_diarios del día actual si existe
        const currentReservaSnapshot = getReservaFromSnapshot(dStr);
        if (currentReservaSnapshot !== null) {
          currentReserva = currentReservaSnapshot;
        }
        // Si no hay snapshot, mantener el último saldo conocido (no recalcular)


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

        // Actualizar saldos para el día siguiente
        // Separar gastos/rrhh de caja vs banco para asignar a la cuenta correcta
        const bankGastos = isProjected ? 0 : bchAgg.egresos_gastos;
        const bankRrhh = isProjected ? 0 : bchAgg.egresos_rrhh;
        const cajaGastos = flow.gastos - bankGastos - (isProjected ? 0 : mpAgg.egresos_gastos);
        const cajaRrhh = flow.rrhh - bankRrhh - (isProjected ? 0 : mpAgg.egresos_rrhh);

        // Cajas: venta efectivo - pagos en caja - gastos caja - rrhh caja + diferencia - retiros a reserva
        currentCajas += (flow.venta_efectivo - flow.pago_caja - cajaGastos - cajaRrhh + flow.diferencia - reservaIn + reservaOut);
        // MP: abonos MP + ingresos MP bancarios - comisiones MP - egresos MP (proveedor, rrhh, gastos)
        currentMP += (flow.abonos_mp - ajusteMP - flow.mpEgresos);
        // BCH: abonos banco + ingresos BCH bancarios - pagos proveedor BCH - gastos banco - rrhh banco
        currentBCH += (flow.abonos_bch - flow.pago_banco - bankGastos - bankRrhh);
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

        <Card className="glass-card overflow-hidden">
            <CardHeader className="pb-2 border-b border-border/50">
                <div className="flex items-center justify-between">
                    <CardTitle className="text-lg capitalize flex items-center gap-2">
                        <Calendar className="h-5 w-5 text-primary" />
                        {monthName}
                    </CardTitle>
                    <div className="flex items-center gap-1">
                        <Button variant="ghost" size="icon" className="h-8 w-8 hover:bg-white/10" onClick={handlePrevMonth}><ChevronLeft className="h-4 w-4" /></Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8 hover:bg-white/10" onClick={handleNextMonth}><ChevronRight className="h-4 w-4" /></Button>
                    </div>
                </div>
            </CardHeader>

            {/* BARRA DE DESPLAZAMIENTO SUPERIOR DISCRETA */}
            <div 
                ref={topScrollRef}
                onScroll={handleScrollSync}
                className="overflow-x-auto scrollbar-thin h-2 bg-background/80 relative z-30 border-b border-border/20 hover:h-3 transition-all duration-300"
            >
                <div style={{ width: dailyFlow.length * 120 + 240 + 'px', height: '1px' }}></div>
            </div>

            <CardContent className="p-0 relative">
                <div 
                    ref={scrollContainerRef}
                    onScroll={handleScrollSync}
                    className="overflow-x-auto scrollbar-none glass-table-container pb-4"
                >
                    <table className="w-full text-xs text-left border-collapse relative">
                        <thead className="sticky top-0 z-40">
                            <tr className="bg-background/95 backdrop-blur-md shadow-sm">
                                <th className="p-3 border-r border-border/50 min-w-[240px] sticky left-0 z-50 bg-background/95 border-b-2 border-primary/30">
                                  <div className="flex items-center justify-between text-[10px] text-primary uppercase font-bold tracking-widest">
                                    <span>CONCEPTO</span>
                                    <span>DETALLE</span>
                                  </div>
                                </th>
                                {dailyFlow.map(d => (
                                    <th key={d.fecha} className={`p-3 text-center border-r border-border/50 min-w-[120px] border-b-2 border-primary/30 transition-all duration-300 ${d.fecha === today ? 'bg-primary/30' : d.isProjected ? 'bg-blue-500/15' : d.isWeekend ? 'bg-primary/10' : ''}`}>
                                        <div className="font-dm-sans font-bold text-sm text-foreground">{new Date(d.fecha + 'T12:00:00').toLocaleDateString('es-CL', { day: '2-digit', month: 'short' })}</div>
                                        <div className={`text-[10px] uppercase font-mono mt-1 ${d.fecha === today ? 'text-primary font-bold sc-highlight' : 'opacity-60'}`}>
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
                                <tr key={row.key} className="bg-primary/5 font-bold text-xs uppercase text-muted-foreground border-b border-border/30 hover:bg-primary/10 transition-colors">
                                    <td className="p-3 border-r border-border/50 sticky left-0 bg-primary/20 backdrop-blur-sm z-10 flex items-center justify-between text-foreground">
                                      {row.label}
                                    </td>
                                    {dailyFlow.map((d, i) => (
                                        <td key={d.fecha} className={`p-3 text-right border-r border-border/50 pr-4 ${d.fecha === today ? 'bg-primary/10 relative' : d.isProjected ? 'bg-blue-500/10' : ''}`}>
                                            {i === 0 ? (
                                                <button
                                                    type="button"
                                                    onClick={() => setShowParams(true)}
                                                    className="w-full text-right font-extrabold text-primary text-sm bg-transparent border-none cursor-pointer hover:bg-primary/10 rounded px-1 -mr-1"
                                                    title="Click para editar saldos iniciales"
                                                >
                                                    {formatCurrency(d.saldos[row.account])}
                                                </button>
                                            ) : (
                                                <span className="opacity-90">{formatCurrency(d.saldos[row.account])}</span>
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
                                        <td key={d.fecha} className={`p-3 text-right border-r border-border/50 pr-4 ${d.fecha === today ? 'bg-primary/20 font-bold' : d.isProjected ? 'bg-blue-500/10' : ''} ${d.isProjected ? 'text-muted-foreground italic' : ''}`}>
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
                                        <td key={d.fecha} className={`p-3 text-right border-r border-border/50 pr-4 ${d.fecha === today ? 'bg-primary/20 font-bold' : d.isProjected ? 'bg-blue-500/10' : ''} ${d.isProjected ? 'text-muted-foreground italic' : 'text-red-400/80'}`}>
                                            {formatCurrency(d.flow[row.key])}
                                        </td>
                                    ))}
                                </tr>
                            ))}

                            <tr className="border-b border-border/50 transition-colors hover:bg-white/5">
                                <td className="p-3 border-r border-border/50 sticky left-0 bg-background/95 backdrop-blur-sm z-10 text-amber-400 font-semibold">Diferencia de Caja</td>
                                {dailyFlow.map(d => (
                                    <td key={d.fecha} className={`p-3 text-right border-r border-border/50 pr-4 ${d.fecha === today ? 'bg-primary/20 font-bold' : d.isProjected ? 'bg-blue-500/10' : ''} ${d.isProjected ? 'text-muted-foreground italic' : (d.flow.diferencia < 0 ? 'text-red-400' : 'text-green-400')}`}>
                                        {formatCurrency(d.flow.diferencia)}
                                    </td>
                                ))}
                            </tr>
                        </tbody>
                        <tfoot className="sticky bottom-0 z-20">
                             <tr className="bg-primary/30 font-extrabold border-t-2 border-primary shadow-[0_-4px_10px_rgba(0,0,0,0.2)]">
                                <td className="p-5 border-r border-border/50 sticky left-0 bg-primary/40 backdrop-blur-md z-30 text-sm tracking-wider">LIBRE DISPONIBILIDAD (Final)</td>
                                {dailyFlow.map(d => (
                                    <td key={d.fecha} className={`p-5 text-right border-r border-border/50 pr-4 text-primary text-base underline decoration-2 underline-offset-4 ${d.fecha === today ? 'bg-primary/50' : d.isProjected ? 'bg-blue-500/20' : ''}`}>
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
