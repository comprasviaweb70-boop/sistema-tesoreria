import React, { useState, useEffect, useMemo } from 'react';
import { Helmet } from 'react-helmet';
import { 
  BarChart3, 
  Calendar as CalendarIcon, 
  Search, 
  Users, 
  TrendingDown, 
  Building2, 
  ArrowUpDown,
  Filter,
  Download,
  Loader2,
  ChevronUp,
  ChevronDown,
  Calculator,
  History
} from 'lucide-react';
import { supabase } from '@/lib/customSupabaseClient';
import Header from '@/components/Header';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

const formatCurrency = (val) => new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP' }).format(val || 0);

const InformesPage = () => {
  const [loading, setLoading] = useState(false);
  const [isDetailsExpanded, setIsDetailsExpanded] = useState(true);
  const [isDailyExpanded, setIsDailyExpanded] = useState(true);

  const [fechaInicio, setFechaInicio] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().split('T')[0];
  });
  const [fechaFin, setFechaFin] = useState(new Date().toISOString().split('T')[0]);
  const [searchTerm, setSearchTerm] = useState('');
  const [movimientos, setMovimientos] = useState([]);
  const [pagos, setPagos] = useState([]);
  const [diariaData, setDiariaData] = useState([]);
  const [reservaMovimientos, setReservaMovimientos] = useState([]);
  const [cajas, setCajas] = useState([]);
  const [categorias, setCategorias] = useState({});

  const fetchCategorias = async () => {
    const { data } = await supabase.from('categorias_movimiento').select('id, nombre');
    if (data) {
      const catMap = {};
      data.forEach(c => catMap[c.id] = c.nombre);
      setCategorias(catMap);
    }
  };

  const fetchData = async () => {
    console.log("Fetching Informes data...");
    setLoading(true);
    try {
      // 1. Fetch Otros Movimientos
      const { data: mData, error: mError } = await supabase
        .from('otros_movimientos')
        .select('*')
        .gte('fecha', fechaInicio)
        .lte('fecha', fechaFin)
        .order('fecha', { ascending: false });
      
      if (mError) throw mError;

      // 2. Fetch Pagos Proveedores
      const { data: pData, error: pError } = await supabase
        .from('pagos_proveedor')
        .select('*, proveedores (nombre)')
        .gte('fecha_pago', fechaInicio)
        .lte('fecha_pago', fechaFin)
        .order('fecha_pago', { ascending: false });

      if (pError) throw pError;

      // 3. Fetch Venta Diaria para el consolidado
      const { data: dData, error: dError } = await supabase
        .from('venta_diaria')
        .select('*')
        .gte('fecha', fechaInicio)
        .lte('fecha', fechaFin)
        .order('fecha', { ascending: false });

      if (dError) throw dError;
      
      // 4. Fetch Reserva Movimientos
      const { data: rData, error: rError } = await supabase
        .from('reserva_movimientos')
        .select('*')
        .gte('fecha', fechaInicio)
        .lte('fecha', fechaFin)
        .order('fecha', { ascending: false });

      if (rError) throw rError;

      // 5. Fetch Cajas
      const { data: cData, error: cError } = await supabase
        .from('cajas')
        .select('id, nombre');
      
      if (cError) throw cError;

      setMovimientos(mData || []);
      setPagos(pData || []);
      setDiariaData(dData || []);
      setReservaMovimientos(rData || []);
      setCajas(cData || []);
    } catch (err) {
      console.error('Error fetching report data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCategorias();
    fetchData();
  }, [fechaInicio, fechaFin]);

  const results = useMemo(() => {
    const combined = [];
    movimientos.forEach(m => {
      combined.push({
        id: m.id,
        fecha: m.fecha,
        beneficiario: m.descripcion || 'Sin descripción',
        monto: m.monto,
        tipo: m.tipo,
        categoria: categorias[m.categoria_id] || 'General',
        origen: 'Otros Movimientos',
      });
    });

    pagos.forEach(p => {
      combined.push({
        id: p.id,
        fecha: p.fecha_pago,
        beneficiario: p.proveedores?.nombre || 'Proveedor desconocido',
        monto: p.monto_pagado,
        tipo: 'egreso',
        categoria: 'Pago Proveedor',
        origen: 'Pagos Proveedor',
      });
    });

    const search = searchTerm.toLowerCase();
    const filtered = combined.filter(item => 
      item.beneficiario.toLowerCase().includes(search) ||
      item.categoria.toLowerCase().includes(search) ||
      item.origen.toLowerCase().includes(search)
    );

    return filtered.sort((a, b) => new Date(b.fecha) - new Date(a.fecha));
  }, [movimientos, pagos, searchTerm, categorias]);
  const dailyBalances = useMemo(() => {
    // 1. Agrupar AJUSTES CRUCES desde Otros Movimientos por fecha
    const adjustments = movimientos.reduce((acc, curr) => {
      const catName = (categorias[curr.categoria_id] || '').toLowerCase();
      const isCorrection = catName.includes('correcci') || catName.includes('correccion') || catName.includes('corrección');
      
      if (isCorrection) {
        const key = `${curr.fecha}_${curr.caja_id || 'RESERVA'}`;
        if (!acc[key]) acc[key] = { cash: 0, card: 0 };
        const monto = parseFloat(curr.monto) || 0;
        
        if (catName.includes('debito por efectivo') || catName.includes('débito por efectivo')) {
          if (curr.tipo === 'egreso') {
            acc[key].cash -= monto;
            acc[key].card += monto;
          } else {
            acc[key].cash += monto;
            acc[key].card -= monto;
          }
        } else if (catName.includes('efectivo por debito') || catName.includes('efectivo por débito')) {
          if (curr.tipo === 'ingreso') {
            acc[key].cash += monto;
            acc[key].card -= monto;
          } else {
            acc[key].cash -= monto;
            acc[key].card += monto;
          }
        } else {
          const signado = curr.tipo === 'ingreso' ? monto : -monto;
          acc[key].cash += signado;
        }
      }
      return acc;
    }, {});

    // 2. Agrupar datos de venta_diaria por fecha y caja/turno
    const perBoxGroups = diariaData.reduce((acc, curr) => {
      const cajaNombre = cajas.find(c => c.id === curr.caja_id)?.nombre || `Caja ${curr.caja_id?.split('-')[0] || '?'}`;
      const groupKey = `${curr.fecha}_${curr.caja_id}_${curr.turno}`;
      
      if (!acc[groupKey]) {
        acc[groupKey] = {
          fecha: curr.fecha,
          caja_id: curr.caja_id,
          turno: curr.turno,
          cajero: cajaNombre,
          base_efectivo_neta: 0,
          base_card: 0,
          edenred: 0,
          transferencia: 0,
          credito: 0,
          pago_facturas_caja: 0,
          pago_facturas_ctacte: 0,
          gastos_rrhh_otros: 0,
          diferencia_caja: 0,
          cierre_caja: 0,
          ingreso_reserva: 0,
          retiro_reserva: 0
        };
      }
      
      acc[groupKey].base_efectivo_neta += (parseFloat(curr.venta_efectivo) || 0) - (parseFloat(curr.vuelta) || 0);
      acc[groupKey].base_card += (parseFloat(curr.redelcom) || 0) + (parseFloat(curr.tarjeta_credito) || 0);
      acc[groupKey].edenred += (parseFloat(curr.edenred) || 0);
      acc[groupKey].transferencia += (parseFloat(curr.transferencia) || 0);
      acc[groupKey].credito += (parseFloat(curr.credito) || 0);
      acc[groupKey].pago_facturas_caja += (parseFloat(curr.pago_facturas_caja) || 0);
      acc[groupKey].pago_facturas_ctacte += (parseFloat(curr.pago_facturas_cc) || 0);
      acc[groupKey].gastos_rrhh_otros += 
        (parseFloat(curr.gastos_rrhh) || 0) + (parseFloat(curr.servicios) || 0) + 
        (parseFloat(curr.gastos) || 0) + (parseFloat(curr.otros_egresos) || 0);
      acc[groupKey].diferencia_caja += (parseFloat(curr.diferencia_caja) || 0);
      
      if (curr.turno === 'Tarde') {
        acc[groupKey].cierre_caja += (parseFloat(curr.cierre_declarado_pdf) || 0);
      }
      acc[groupKey].ingreso_reserva += (parseFloat(curr.traspaso_tesoreria_ingreso) || 0);
      acc[groupKey].retiro_reserva += (parseFloat(curr.traspaso_tesoreria_egreso) || 0);
      
      return acc;
    }, {});

    // 3. Agrupar movimientos de RESERVA directos (sin caja_id)
    const reservaGroups = reservaMovimientos.reduce((acc, curr) => {
      if (curr.caja_id) return acc; // Saltar los que ya están en venta_diaria

      const groupKey = `${curr.fecha}_RESERVA_${curr.turno}`;
      if (!acc[groupKey]) {
        acc[groupKey] = {
          fecha: curr.fecha,
          caja_id: 'RESERVA',
          turno: curr.turno,
          cajero: 'RESERVA',
          base_efectivo_neta: 0,
          base_card: 0,
          edenred: 0,
          transferencia: 0,
          credito: 0,
          pago_facturas_caja: 0,
          pago_facturas_ctacte: 0,
          gastos_rrhh_otros: 0,
          diferencia_caja: 0,
          cierre_caja: 0,
          ingreso_reserva: 0,
          retiro_reserva: 0
        };
      }

      const monto = parseFloat(curr.monto_total) || 0;
      if (curr.tipo === 'egreso') {
        acc[groupKey].gastos_rrhh_otros += monto;
      } else {
        // Ingresos directos a reserva (ej: Giro Cta Cte)
        acc[groupKey].base_efectivo_neta += monto; // Mostrar como 'efectivo' para simplificar o dejar en 0 si no es venta
      }
      
      return acc;
    }, {});

    const allGroups = { ...perBoxGroups, ...reservaGroups };

    // 4. Finalizar totales ajustados y agregar filas de TOTAL diario
    const rows = Object.values(allGroups).map(entry => {
      const adjKey = `${entry.fecha}_${entry.caja_id}`;
      const adj = adjustments[adjKey] || { cash: 0, card: 0 };
      
      const ventaEfectivoFinal = entry.base_efectivo_neta + adj.cash;
      const cardFinal = entry.base_card + adj.card;
      const totalVentasFinal = ventaEfectivoFinal + cardFinal + entry.edenred + entry.transferencia + entry.credito;

      return {
        ...entry,
        venta_efectivo: ventaEfectivoFinal,
        redelcom: cardFinal,
        total_ventas: totalVentasFinal,
      };
    });

    // 5. Generar filas de TOTAL por fecha
    const dailyTotals = rows.reduce((acc, curr) => {
      if (!acc[curr.fecha]) {
        acc[curr.fecha] = {
          fecha: curr.fecha,
          cajero: 'TOTAL DÍA',
          isTotalLine: true,
          venta_efectivo: 0,
          redelcom: 0,
          edenred: 0,
          transferencia: 0,
          credito: 0,
          total_ventas: 0,
          pago_facturas_caja: 0,
          pago_facturas_ctacte: 0,
          gastos_rrhh_otros: 0,
          diferencia_caja: 0,
          cierre_caja: 0,
          ingreso_reserva: 0,
          retiro_reserva: 0
        };
      }
      
      acc[curr.fecha].venta_efectivo += curr.venta_efectivo;
      acc[curr.fecha].redelcom += curr.redelcom;
      acc[curr.fecha].edenred += curr.edenred;
      acc[curr.fecha].transferencia += curr.transferencia;
      acc[curr.fecha].credito += curr.credito;
      acc[curr.fecha].total_ventas += curr.total_ventas;
      acc[curr.fecha].pago_facturas_caja += curr.pago_facturas_caja;
      acc[curr.fecha].pago_facturas_ctacte += curr.pago_facturas_ctacte;
      acc[curr.fecha].gastos_rrhh_otros += curr.gastos_rrhh_otros;
      acc[curr.fecha].diferencia_caja += curr.diferencia_caja;
      acc[curr.fecha].cierre_caja += curr.cierre_caja;
      acc[curr.fecha].ingreso_reserva += curr.ingreso_reserva;
      acc[curr.fecha].retiro_reserva += curr.retiro_reserva;
      
      return acc;
    }, {});

    // Combinar y ordenar
    const finalResult = [...rows, ...Object.values(dailyTotals)];
    return finalResult.sort((a, b) => {
      if (a.fecha !== b.fecha) return new Date(b.fecha) - new Date(a.fecha);
      if (a.isTotalLine) return 1;
      if (b.isTotalLine) return -1;
      return a.cajero.localeCompare(b.cajero);
    });
  }, [diariaData, reservaMovimientos, movimientos, categorias, cajas]);



  const stats = useMemo(() => {
    const totalEgresos = results.reduce((acc, curr) => curr.tipo === 'egreso' ? acc + curr.monto : acc, 0);
    const totalIngresos = results.reduce((acc, curr) => curr.tipo === 'ingreso' ? acc + curr.monto : acc, 0);
    const rrhhTotal = results
      .filter(r => r.categoria.toLowerCase().includes('rrhh'))
      .reduce((acc, curr) => acc + curr.monto, 0);

    return { totalEgresos, totalIngresos, rrhhTotal, count: results.length };
  }, [results]);

  return (
    <div className="gradient-bg min-h-screen">
      <Helmet>
        <title>Informes y Auditoría - Iciz Market</title>
      </Helmet>

      <Header />

      <div className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h2 className="text-2xl font-bold text-foreground flex items-center gap-2">
              <BarChart3 className="h-6 w-6 text-primary" />
              Informes y Auditoría
            </h2>
            <p className="text-sm text-muted-foreground">Consolidado de pagos a proveedores y otros movimientos</p>
          </div>
          <Button onClick={fetchData} className="accent-button" disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Download className="h-4 w-4 mr-2" />}
            Actualizar Datos
          </Button>
        </div>

        {/* Filtros */}
        <Card className="glass-card">
          <CardContent className="p-6">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
              <div className="space-y-2">
                <Label className="text-xs uppercase text-muted-foreground font-bold">Desde</Label>
                <div className="relative">
                  <CalendarIcon className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input 
                    type="date" 
                    value={fechaInicio} 
                    onChange={e => setFechaInicio(e.target.value)}
                    className="glass-input font-medium [color-scheme:dark] text-foreground/80 pl-10"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label className="text-xs uppercase text-muted-foreground font-bold">Hasta</Label>
                <div className="relative">
                  <CalendarIcon className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input 
                    type="date" 
                    value={fechaFin} 
                    onChange={e => setFechaFin(e.target.value)}
                    className="glass-input font-medium [color-scheme:dark] text-foreground/80 pl-10"
                  />
                </div>
              </div>
              <div className="md:col-span-2 space-y-2">
                <Label className="text-xs uppercase text-muted-foreground font-bold">Buscador (Nombre, Empresa, RRHH...)</Label>
                <div className="relative">
                  <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input 
                    placeholder="Ej: Alejandra, Gabriel, Coca-Cola..." 
                    value={searchTerm}
                    onChange={e => setSearchTerm(e.target.value)}
                    className="glass-input pl-10"
                  />
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card className="glass-card border-l-4 border-l-red-500">
            <CardHeader className="py-3 px-6">
              <CardTitle className="text-xs font-bold text-muted-foreground uppercase">Total Egresos (Filtro)</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-red-500">{formatCurrency(stats.totalEgresos)}</div>
            </CardContent>
          </Card>
          <Card className="glass-card border-l-4 border-l-green-500">
            <CardHeader className="py-3 px-6">
              <CardTitle className="text-xs font-bold text-muted-foreground uppercase">Total Ingresos (Filtro)</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-500">{formatCurrency(stats.totalIngresos)}</div>
            </CardContent>
          </Card>
          <Card className="glass-card border-l-4 border-l-primary">
            <CardHeader className="py-3 px-6">
              <CardTitle className="text-xs font-bold text-muted-foreground uppercase">Consumo RRHH (Filtro)</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-primary">{formatCurrency(stats.rrhhTotal)}</div>
            </CardContent>
          </Card>
        </div>

        {/* Resumen Diario Consolidado */}
        <Card className="glass-card overflow-hidden">
          <CardHeader 
            className="cursor-pointer hover:bg-secondary/10 transition-colors py-4 px-6 flex flex-row items-center justify-between"
            onClick={() => setIsDailyExpanded(!isDailyExpanded)}
          >
            <div className="flex items-center gap-3">
              <Calculator className="h-5 w-5 text-primary" />
              <div>
                <CardTitle className="text-sm font-semibold text-foreground">Resumen Diario Consolidado</CardTitle>
                <CardDescription className="text-xs">Suma de cierres de todas las cajas por día</CardDescription>
              </div>
            </div>
            <Button variant="ghost" size="sm" className="gap-2">
              {isDailyExpanded ? <><ChevronUp className="h-4 w-4" /> Contraer</> : <><ChevronDown className="h-4 w-4" /> Expandir</>}
            </Button>
          </CardHeader>
          {isDailyExpanded && (
            <CardContent className="p-0 border-t border-border/50 animate-in slide-in-from-top-2 duration-200">
              <div className="overflow-x-auto">
                <Table className="text-[10px] uppercase font-bold text-center">
                  <TableHeader className="bg-secondary/20">
                    <TableRow className="hover:bg-transparent">
                      <TableHead className="text-center">DIA</TableHead>
                      <TableHead className="text-center">CAJERO</TableHead>
                      <TableHead className="text-center">VENTA EFECTIVO</TableHead>
                      <TableHead className="text-center">VENTAS CON TARJETA</TableHead>
                      <TableHead className="text-center">EDENRED</TableHead>
                      <TableHead className="text-center">TRANSF</TableHead>
                      <TableHead className="text-center">CREDITO</TableHead>
                      <TableHead className="text-center">TOTAL VENTAS</TableHead>
                      <TableHead className="text-center">PAGO FACTURAS CTA CTE</TableHead>
                      <TableHead className="text-center">PAGO FACTURAS CAJA</TableHead>
                      <TableHead className="text-center">GASTOS RRHH OTROS</TableHead>
                      <TableHead className="text-center">DIFERENCIA CAJA</TableHead>
                      <TableHead className="text-center">CIERRE CAJA</TableHead>
                      <TableHead className="text-center">INGRESO A RESERVA</TableHead>
                      <TableHead className="text-center">RETIRO DE RESERVA</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {loading ? (
                      <TableRow><TableCell colSpan={15} className="h-24 text-center italic">Cargando resúmenes...</TableCell></TableRow>
                    ) : dailyBalances.length === 0 ? (
                      <TableRow><TableCell colSpan={15} className="h-24 text-center italic text-muted-foreground">No hay datos de cierres para este periodo.</TableCell></TableRow>
                    ) : (
                      dailyBalances.map((day) => {
                        return (
                          <TableRow key={day.fecha + day.cajero + (day.turno || '')} className={`hover:bg-secondary/10 transition-colors border-b border-border/50 ${day.isTotalLine ? 'bg-primary/5 font-extrabold' : ''}`}>
                            <TableCell className="font-mono">
                              {day.isTotalLine ? '' : new Date(day.fecha + 'T12:00:00').toLocaleDateString('es-CL', { day: '2-digit', month: 'short' })}
                            </TableCell>
                            <TableCell className={day.isTotalLine ? 'text-primary' : (day.cajero === 'RESERVA' ? 'text-amber-500 italic' : '')}>
                              {day.cajero} {day.turno ? `(${day.turno[0]})` : ''}
                            </TableCell>
                            <TableCell className="text-right">$ {day.venta_efectivo.toLocaleString('es-CL')}</TableCell>
                            <TableCell className="text-right">$ {day.redelcom.toLocaleString('es-CL')}</TableCell>
                            <TableCell className="text-right">$ {day.edenred.toLocaleString('es-CL')}</TableCell>
                            <TableCell className="text-right">$ {day.transferencia.toLocaleString('es-CL')}</TableCell>
                            <TableCell className="text-right">$ {day.credito.toLocaleString('es-CL')}</TableCell>
                            <TableCell className="text-right font-bold text-primary">$ {day.total_ventas.toLocaleString('es-CL')}</TableCell>
                            <TableCell className="text-right">$ {day.pago_facturas_ctacte.toLocaleString('es-CL')}</TableCell>
                            <TableCell className="text-right text-red-500">$ {day.pago_facturas_caja.toLocaleString('es-CL')}</TableCell>
                            <TableCell className="text-right text-red-500">$ {day.gastos_rrhh_otros.toLocaleString('es-CL')}</TableCell>
                            <TableCell className={`text-right font-bold ${day.diferencia_caja < 0 ? 'text-red-500' : 'text-green-500'}`}>
                              {day.diferencia_caja > 0 ? '+' : ''} $ {day.diferencia_caja.toLocaleString('es-CL')}
                            </TableCell>
                            <TableCell className="text-right font-bold bg-secondary/5">$ {day.cierre_caja.toLocaleString('es-CL')}</TableCell>
                            <TableCell className="text-right text-green-500 items-center justify-end gap-1">
                              {day.ingreso_reserva > 0 && <span>$ {day.ingreso_reserva.toLocaleString('es-CL')}</span>}
                            </TableCell>
                            <TableCell className="text-right text-red-500 items-center justify-end gap-1">
                              {day.retiro_reserva > 0 && <span>$ {day.retiro_reserva.toLocaleString('es-CL')}</span>}
                            </TableCell>
                          </TableRow>
                        );
                      })
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          )}
        </Card>

        {/* Detalles de Movimientos */}
        <Card className="glass-card overflow-hidden">
          <CardHeader 
            className="cursor-pointer hover:bg-secondary/10 transition-colors py-4 px-6 flex flex-row items-center justify-between"
            onClick={() => setIsDetailsExpanded(!isDetailsExpanded)}
          >
            <div className="flex items-center gap-3">
              <History className="h-5 w-5 text-primary" />
              <div>
                <CardTitle className="text-sm font-semibold text-foreground">Detalle de Movimientos y Pagos ({stats.count})</CardTitle>
                <CardDescription className="text-xs">
                  Mostrando registros del {new Date(fechaInicio + 'T12:00:00').toLocaleDateString()} al {new Date(fechaFin + 'T12:00:00').toLocaleDateString()}
                </CardDescription>
              </div>
            </div>
            <Button variant="ghost" size="sm" className="gap-2">
              {isDetailsExpanded ? <><ChevronUp className="h-4 w-4" /> Contraer</> : <><ChevronDown className="h-4 w-4" /> Expandir</>}
            </Button>
          </CardHeader>
          {isDetailsExpanded && (
            <CardContent className="p-0 border-t border-border/50 animate-in slide-in-from-top-2 duration-200">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader className="bg-secondary/20">
                    <TableRow className="hover:bg-transparent">
                      <TableHead className="w-[120px]">Fecha</TableHead>
                      <TableHead>Beneficiario / Concepto</TableHead>
                      <TableHead>Categoría</TableHead>
                      <TableHead>Módulo</TableHead>
                      <TableHead className="text-right">Monto</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {loading ? (
                      <TableRow><TableCell colSpan={5} className="h-32 text-center italic">Cargando detalle...</TableCell></TableRow>
                    ) : results.length === 0 ? (
                      <TableRow><TableCell colSpan={5} className="h-32 text-center italic text-muted-foreground">No se encontraron movimientos para los criterios seleccionados.</TableCell></TableRow>
                    ) : (
                      results.map((item) => (
                        <TableRow key={item.id} className="hover:bg-secondary/10 transition-colors">
                          <TableCell className="font-mono text-xs">
                            {new Date(item.fecha + 'T12:00:00').toLocaleDateString('es-CL')}
                          </TableCell>
                          <TableCell className="font-medium">
                            <div className="flex flex-col">
                              <span>{item.beneficiario}</span>
                              {item.origen === 'Otros Movimientos' && <span className="text-[10px] opacity-40 uppercase">Efectivo Caja</span>}
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className="text-[10px] uppercase font-bold border-primary/20 bg-primary/5">
                              {item.categoria}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1.5 text-xs text-muted-foreground italic">
                              {item.origen === 'Pagos Proveedor' ? <Building2 className="h-3 w-3" /> : <ArrowUpDown className="h-3 w-3" />}
                              {item.origen}
                            </div>
                          </TableCell>
                          <TableCell className={`text-right font-bold ${item.tipo === 'ingreso' ? 'text-green-500' : 'text-red-500'}`}>
                            {item.tipo === 'ingreso' ? '+' : '-'} {item.monto.toLocaleString('es-CL')}
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
      </div>
    </div>
  );
};

export default InformesPage;
