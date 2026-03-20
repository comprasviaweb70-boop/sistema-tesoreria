import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Helmet } from 'react-helmet';
import { Calendar, Upload, AlertCircle, PlusCircle, LayoutDashboard, RefreshCcw, History } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/lib/customSupabaseClient';
import { useAuth } from '@/contexts/AuthContextObject';
import { useVentaDiariaRecord } from '@/hooks/useVentaDiariaRecord';
import Header from '@/components/Header';
import SummaryPanel from '@/components/SummaryPanel';
import SearchFilterBar from '@/components/SearchFilterBar';
import PDFUploadModal from '@/components/PDFUploadModal';
import CajaSelector from '@/components/CajaSelector';

const VentaDiariaPage = ({ hideHeader = false }) => {
  const [fecha, setFecha] = useState(() => localStorage.getItem('vd_fecha') || new Date().toISOString().split('T')[0]);
  const [turno, setTurno] = useState(() => localStorage.getItem('vd_turno') || 'Mañana');
  const [cajaId, setCajaId] = useState(() => {
    const saved = localStorage.getItem('vd_cajaId');
    return (saved && saved !== 'all') ? saved : '';
  });
  const [ventaData, setVentaData] = useState(null);
  const [isPDFModalOpen, setIsPDFModalOpen] = useState(false);
  const [searchResults, setSearchResults] = useState([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const { userProfile, isAdministrador } = useAuth();
  const { toast } = useToast();
  const [discrepanciasPdf, setDiscrepanciasPdf] = useState({ ingresos: null, retiros: null });

  const { record, setRecord, loading: hookLoading, createRecord } = useVentaDiariaRecord({
    fecha,
    turno,
    caja_id: cajaId,
    cajero_id: userProfile?.id,
    autoCreate: false,
  });

  useEffect(() => {
    if (record) {
      setVentaData(calculateTotals(record));
    } else {
      setVentaData(null);
    }
  }, [record]);

  useEffect(() => {
    localStorage.setItem('vd_fecha', fecha);
  }, [fecha]);

  useEffect(() => {
    localStorage.setItem('vd_turno', turno);
  }, [turno]);

  useEffect(() => {
    localStorage.setItem('vd_cajaId', cajaId);
  }, [cajaId]);

  const calculateTotals = (data) => {
    const saldo_inicial = parseFloat(data.saldo_inicial) || 0;
    const efectivo_bruto = parseFloat(data.venta_efectivo) || 0;
    const vuelto = parseFloat(data.vuelta) || 0;
    
    // Subtotal 1: Venta Efectiva Neta
    const venta_efectiva_neta = efectivo_bruto - vuelto;
    
    // Ingresos y Egresos sincronizados
    const traspaso_recibido = parseFloat(data.traspaso_tesoreria_ingreso) || 0;
    const entrega_tesoreria = parseFloat(data.traspaso_tesoreria_egreso) || 0;

    // 3. Ingresos (Agrupados)
    const subtotal_ingresos = traspaso_recibido + (parseFloat(data.ingresos_efectivo) || 0);

    // 4. Egresos (Agrupados - Incluye entrega a tesorería)
    const sumEgresosOperativos = 
      (parseFloat(data.pago_facturas_caja) || 0) +
      (parseFloat(data.gastos_rrhh) || 0) +
      (parseFloat(data.servicios) || 0) +
      (parseFloat(data.gastos) || 0) +
      (parseFloat(data.correccion_boletas) || 0) +
      (parseFloat(data.otros_egresos) || 0);
    
    const total_egresos = sumEgresosOperativos + entrega_tesoreria;

    // Total Efectivo Teórico (Lo que debería haber en caja físicamente)
    const cierre_caja_sistema = 
      saldo_inicial + 
      venta_efectiva_neta + 
      subtotal_ingresos - 
      total_egresos;

    // Diferencia entre la realidad declarada y el cálculo del sistema
    const cierre_declarado_pdf = parseFloat(data.cierre_declarado_pdf) || 0;
    const diferencia_caja = cierre_declarado_pdf - cierre_caja_sistema;

    // Subtotal 2: Ventas por otros métodos
    const otras_ventas = 
      (parseFloat(data.redelcom) || 0) +
      (parseFloat(data.tarjeta_credito) || 0) +
      (parseFloat(data.edenred) || 0) +
      (parseFloat(data.transferencia) || 0) +
      (parseFloat(data.credito) || 0);

    // Total General de Ventas (Efectivo Neto + Otras Ventas)
    const total_ventas = venta_efectiva_neta + otras_ventas;

    return {
      ...data,
      venta_efectiva_neta,
      efectivo_neto: venta_efectiva_neta,
      subtotal_ingresos,
      sumEgresosOperativos,
      total_egresos,
      total_ventas,
      cierre_caja_sistema,
      diferencia_caja,
    };
  };

  const handleCreateNewRecord = async () => {
    if (!cajaId) {
      toast({ title: 'Atención', description: 'Debe seleccionar una caja primero.', variant: 'destructive' });
      return;
    }
    const newRecord = await createRecord();
    if (newRecord) {
      setVentaData(calculateTotals(newRecord));
      setRecord(newRecord); // Asegurar sincronización inmediata
      toast({
        title: "Registro Creado",
        description: "El registro de venta diaria ha sido creado exitosamente.",
      });
    }
  };

  const handleFieldChange = async (field, value) => {
    if (ventaData.estado === 'Cerrado') {
      toast({
        title: "No permitido",
        description: "Este día está cerrado. Si necesitas editar, ábrelo primero.",
        variant: "destructive",
      });
      return;
    }

    const numValue = parseFloat(value) || 0;
    const updatedData = { ...ventaData, [field]: numValue };
    const calculatedData = calculateTotals(updatedData);

    setVentaData(calculatedData);
    setRecord(calculatedData); // Sincronizar con el hook para evitar que el useEffect lo sobrescriba

    try {
      // Determinamos qué campos enviar a la BD para no sobreescribir lo sincronizado
      const updatePayload = { [field]: numValue };
      
      // Si el campo afecta a los subtotales de venta, los incluimos calculados
      if (['venta_efectivo', 'vuelta', 'redelcom', 'tarjeta_credito', 'edenred', 'transferencia', 'credito'].includes(field)) {
        updatePayload.total_ventas = calculatedData.total_ventas;
      }

      const { error } = await supabase
        .from('venta_diaria')
        .update(updatePayload)
        .eq('id', ventaData.id);

      if (error) throw error;
    } catch (error) {
      console.error('Error saving:', error);
      toast({
        title: "Error al guardar",
        description: "No se pudo guardar el cambio",
        variant: "destructive",
      });
    }
  };

  const loadPreviousDaySaldo = async () => {
    if (!cajaId || !fecha) return;

    setSearchLoading(true);
    try {
      const { data, error } = await supabase
        .from('venta_diaria')
        .select('cierre_declarado_pdf, fecha, turno')
        .eq('caja_id', cajaId)
        .lt('fecha', fecha)
        .order('fecha', { ascending: false })
        .order('turno', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) throw error;

      if (data) {
        await handleFieldChange('saldo_inicial', data.cierre_declarado_pdf);
        toast({
          title: "Saldo Inicial cargado",
          description: `Se obtuvo del cierre del día ${data.fecha} (${data.turno}): $${data.cierre_declarado_pdf.toLocaleString('es-CL')}`,
        });
      } else {
        toast({
          title: "No se encontró registro anterior",
          description: "No hay cierres previos registrados para esta caja.",
          variant: "warning"
        });
      }
    } catch (error) {
      console.error('Error loading previous saldo:', error);
      toast({
        title: "Error",
        description: "No se pudo cargar el saldo del día anterior.",
        variant: "destructive"
      });
    } finally {
      setSearchLoading(false);
    }
  };

  const handlePDFDataExtracted = async (extractedData) => {
    let currentVentaData = ventaData;

    if (!currentVentaData) {
      toast({
        title: "Creando registro",
        description: "Iniciando registro de venta para cargar los datos del PDF...",
      });

      const newRecord = await createRecord();
      if (!newRecord) {
        toast({
          title: "Error",
          description: "No se pudo crear el registro automáticamente. Por favor créalo manualmente primero.",
          variant: "destructive",
        });
        return;
      }
      currentVentaData = calculateTotals(newRecord);
    }

    const updatedData = {
      ...currentVentaData,
      venta_efectivo: extractedData.venta_efectivo ?? currentVentaData.venta_efectivo,
      vuelta: extractedData.vuelta ?? currentVentaData.vuelta,
      // Ingresos y Retiros ya no se alimentan del PDF sino de los otros módulos
      // ingresos_efectivo: extractedData.ingresos_efectivo ?? currentVentaData.ingresos_efectivo,
      // retiros_efectivo: extractedData.retiros_efectivo ?? currentVentaData.retiros_efectivo,
      redelcom: extractedData.redelcom ?? currentVentaData.redelcom,
      tarjeta_credito: extractedData.tarjeta_credito ?? currentVentaData.tarjeta_credito,
      edenred: extractedData.edenred ?? currentVentaData.edenred,
      transferencia: extractedData.transferencia ?? currentVentaData.transferencia,
      credito: extractedData.credito ?? currentVentaData.credito,
      saldo_inicial: extractedData.saldo_inicial > 0 ? extractedData.saldo_inicial : currentVentaData.saldo_inicial,
      cierre_declarado_pdf: extractedData.cierre_declarado_pdf ?? currentVentaData.cierre_declarado_pdf,
      cierre_sistema_pdf: extractedData.cierre_sistema_pdf ?? currentVentaData.cierre_sistema_pdf,
    };

    const calculatedData = calculateTotals(updatedData);
    setVentaData(calculatedData);
    setRecord(updatedData); // Sincronizar con el hook para evitar clobbering del useEffect
    
    // Guardar discrepancias para mostrar advertencias visuales en el UI
    setDiscrepanciasPdf({
      ingresos: extractedData.ingresos_efectivo,
      retiros: extractedData.retiros_efectivo
    });

    try {
      // Solo enviar columnas confirmadas en la tabla venta_diaria
      // (basado en el schema del insert en useVentaDiariaRecord)
      const dbData = {
        saldo_inicial: calculatedData.saldo_inicial ?? 0,
        venta_efectivo: calculatedData.venta_efectivo ?? 0,
        redelcom: calculatedData.redelcom ?? 0,
        tarjeta_credito: calculatedData.tarjeta_credito ?? 0,
        edenred: calculatedData.edenred ?? 0,
        transferencia: calculatedData.transferencia ?? 0,
        credito: calculatedData.credito ?? 0,
        total_ventas: calculatedData.total_ventas ?? 0,
        pago_facturas_caja: calculatedData.pago_facturas_caja ?? 0,
        pago_facturas_cc: calculatedData.pago_facturas_cc ?? 0,
        gastos_rrhh: calculatedData.gastos_rrhh ?? 0,
        otros_gastos: calculatedData.otros_gastos ?? 0,
        servicios: calculatedData.servicios ?? 0,
        gastos: calculatedData.gastos ?? 0,
        correccion_boletas: calculatedData.correccion_boletas ?? 0,
        otros_egresos: calculatedData.otros_egresos ?? 0,
        traspaso_tesoreria_ingreso: calculatedData.traspaso_tesoreria_ingreso ?? 0,
        traspaso_tesoreria_egreso: calculatedData.traspaso_tesoreria_egreso ?? 0,
        cierre_declarado_pdf: calculatedData.cierre_declarado_pdf ?? 0,
      };

      // Agregar campos opcionales solo si existen en el registro actual
      if (currentVentaData.vuelta !== undefined) dbData.vuelta = calculatedData.vuelta ?? 0;
      if (currentVentaData.ingresos_efectivo !== undefined) dbData.ingresos_efectivo = calculatedData.ingresos_efectivo ?? 0;
      if (currentVentaData.retiros_efectivo !== undefined) dbData.retiros_efectivo = calculatedData.retiros_efectivo ?? 0;
      if (currentVentaData.cierre_sistema_pdf !== undefined) dbData.cierre_sistema_pdf = calculatedData.cierre_sistema_pdf ?? 0;

      const { error } = await supabase
        .from('venta_diaria')
        .update(dbData)
        .eq('id', currentVentaData.id);

      if (error) throw error;

      toast({
        title: "Datos del PDF guardados",
        description: "Los valores del PDF se han aplicado al formulario de forma exitosa.",
        className: "bg-green-500/10 text-green-500 border-green-500/50"
      });
    } catch (error) {
      console.error('Error saving PDF data:', error);
      toast({
        title: "Error",
        description: "No se pudieron guardar los datos extraídos en la base de datos.",
        variant: "destructive",
      });
    }
  };

  const handleCerrarDia = async () => {
    if (!ventaData) return;

    try {
      const { error } = await supabase
        .from('venta_diaria')
        .update({ estado: 'Cerrado' })
        .eq('id', ventaData.id);

      if (error) throw error;

      setVentaData({ ...ventaData, estado: 'Cerrado' });

      toast({
        title: "Día cerrado",
        description: "El día se ha cerrado correctamente",
      });
    } catch (error) {
      console.error('Error closing day:', error);
      toast({
        title: "Error al cerrar",
        description: "Hubo un problema cerrando el día",
        variant: "destructive",
      });
    }
  };

  const handleReabrirDia = async () => {
    if (!ventaData) return;

    if (!window.confirm("¿Está seguro que desea REABRIR el día? Esto permitirá editar manual y mediante PDF los valores calculados.")) {
      return;
    }

    try {
      const { error } = await supabase
        .from('venta_diaria')
        .update({ estado: 'Abierto' })
        .eq('id', ventaData.id);

      if (error) throw error;

      setVentaData({ ...ventaData, estado: 'Abierto' });
      toast({
        title: "Día reabierto",
        description: "El día se ha abierto correctamente para su edición",
      });
    } catch (error) {
      toast({
        title: "Error al reabrir",
        description: "Hubo un problema reabriendo el día",
        variant: "destructive",
      });
    }
  };

  const handleSearch = async (filters) => {
    setSearchLoading(true);
    try {
      let query = supabase.from('venta_diaria').select('*').order('fecha', { ascending: false });

      if (filters.fechaDesde) query = query.gte('fecha', filters.fechaDesde);
      if (filters.fechaHasta) query = query.lte('fecha', filters.fechaHasta);
      if (filters.cajeroId && filters.cajeroId !== 'all-users') query = query.eq('cajero_id', filters.cajeroId);
      if (filters.turno && filters.turno !== 'all-shifts') query = query.eq('turno', filters.turno);

      const { data, error } = await query;
      if (error) throw error;

      const results = data || [];
      setSearchResults(results);

      if (results.length === 0) {
        toast({ title: "Búsqueda completada", description: "No se encontraron registros.", variant: "default" });
      } else {
        toast({ title: "Búsqueda exitosa", description: `Se encontraron ${results.length} registros` });
      }
    } catch (error) {
      console.error('Error searching:', error);
      toast({ title: "Error", description: "No se pudo completar la búsqueda", variant: "destructive" });
    } finally {
      setSearchLoading(false);
    }
  };

  const handleDeleteRecord = (deletedId) => {
    setSearchResults((prev) => prev.filter((r) => r.id !== deletedId));
    // Si el registro eliminado es el que está cargado actualmente, limpiarlo
    if (ventaData?.id === deletedId) {
      setVentaData(null);
    }
    toast({
      title: "Registro eliminado",
      description: "El registro fue eliminado correctamente.",
      className: "bg-green-500/10 text-green-500 border-green-500/50"
    });
  };

  const getDiferenciaColor = (diferencia) => {
    if (diferencia >= 0 && diferencia <= 1000) return 'text-green-400';
    if (diferencia > 1000) return 'accent-text';
    return 'text-red-400';
  };

  const isToday = fecha === new Date().toISOString().split('T')[0];
  const canClose = ventaData?.estado === 'Abierto';
  const canEdit = ventaData?.estado === 'Abierto';

  const content = (
    <div className={`max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 ${hideHeader ? '' : 'py-8'}`}>
      <div className="flex flex-col lg:flex-row gap-6">
        <div className="flex-1 order-2 lg:order-1">
          <div className="mb-6">
            {!hideHeader && (
              <h2 className="text-2xl font-bold text-foreground mb-6 flex items-center justify-between gap-3 flex-wrap">
                <div className="flex items-center gap-3">
                  Registro Venta Diaria
                  {ventaData?.estado === 'Cerrado' && (
                    <span className="text-xs font-semibold px-2 py-1 rounded bg-primary/20 accent-text border border-primary/30 uppercase tracking-wider">
                      Cerrado
                    </span>
                  )}
                </div>
                
                <Link to="/reserva">
                  <Button variant="outline" size="sm" className="glass-button border-primary/30 text-primary hover:bg-primary/10 gap-2">
                    <History className="h-4 w-4" />
                    Ir al Control de Reserva
                  </Button>
                </Link>
              </h2>
            )}

            <div className="glass-card p-4 mb-6">
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <CajaSelector
                  value={cajaId}
                  onChange={setCajaId}
                  label="Seleccione Caja"
                  className="w-full"
                />

                <div className="space-y-2">
                  <Label htmlFor="fecha" className="flex items-center gap-2">
                    <Calendar className="h-4 w-4 accent-text" />
                    Fecha
                  </Label>
                  <Input
                    id="fecha"
                    type="date"
                    value={fecha}
                    onChange={(e) => setFecha(e.target.value)}
                    className="glass-input font-medium [color-scheme:dark] text-foreground/80"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="turno-principal">Turno</Label>
                  <Select value={turno} onValueChange={setTurno}>
                    <SelectTrigger id="turno-principal" className="border-2 border-primary/50 focus:border-primary bg-primary/10 font-bold text-foreground">
                      <SelectValue placeholder="Seleccione turno" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Mañana">Mañana</SelectItem>
                      <SelectItem value="Tarde">Tarde</SelectItem>

                    </SelectContent>
                  </Select>
                </div>

                <div className="flex items-end">
                  <Button
                    onClick={() => setIsPDFModalOpen(true)}
                    className="w-full accent-button bg-primary/20 hover:bg-primary/30 border border-primary"
                    disabled={!cajaId}
                  >
                    <Upload className="mr-2 h-4 w-4" />
                    Cargar PDF OCR
                  </Button>
                </div>
              </div>
            </div>



            {!cajaId ? (
              <div className="text-center py-16 text-muted-foreground glass-card flex flex-col items-center justify-center space-y-4">
                <LayoutDashboard className="w-12 h-12 text-muted-foreground/50" />
                <h3 className="text-lg font-medium text-foreground">Seleccione una caja</h3>
                <p className="text-sm opacity-80 max-w-md mx-auto">
                  Debe seleccionar una caja en la parte superior para ver o registrar las ventas.
                </p>
              </div>
            ) : hookLoading || searchLoading ? (
              <div className="text-center py-12 glass-card">
                <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 accent-border border-t-transparent"></div>
                <p className="mt-4 text-muted-foreground">Cargando datos...</p>
              </div>
            ) : ventaData ? (
              <div className="glass-card overflow-hidden">
                <div className="overflow-x-auto glass-table-container">
                  <Table>
                    <TableHeader>
                      <TableRow className="border-border hover:bg-transparent">
                        <TableHead className="w-[220px] text-muted-foreground font-semibold">Concepto</TableHead>
                        <TableHead className="text-right text-muted-foreground font-semibold">Monto ($)</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>

                      <TableRow className="hover:bg-transparent border-t border-border/50">
                        <TableCell colSpan={2} className="font-semibold text-primary py-4 uppercase tracking-wider text-xs">
                          1. Ventas en Efectivo
                        </TableCell>
                      </TableRow>

                      <TableRow className="bg-primary/5">
                        <TableCell className="font-medium text-foreground">Venta Efectivo (Bruto)</TableCell>
                        <TableCell className="text-right">
                          <Input
                            type="number"
                            value={ventaData.venta_efectivo}
                            onChange={(e) => handleFieldChange('venta_efectivo', e.target.value)}
                            onBlur={(e) => handleFieldChange('venta_efectivo', e.target.value)}
                            disabled={!canEdit}
                            className="text-right glass-input w-full max-w-[200px] ml-auto"
                            step="0.01"
                          />
                        </TableCell>
                      </TableRow>

                      <TableRow className="bg-primary/5">
                        <TableCell className="font-medium text-red-400 pl-8">- Vuelto</TableCell>
                        <TableCell className="text-right">
                          <Input
                            type="number"
                            value={ventaData.vuelta}
                            onChange={(e) => handleFieldChange('vuelta', e.target.value)}
                            onBlur={(e) => handleFieldChange('vuelta', e.target.value)}
                            disabled={!canEdit}
                            className="text-right glass-input w-full max-w-[200px] ml-auto text-red-400"
                            step="0.01"
                          />
                        </TableCell>
                      </TableRow>

                      <TableRow className="bg-primary/10 border-b border-primary/20">
                        <TableCell className="font-bold text-foreground pl-8">= Subtotal Venta Efectiva Neta</TableCell>
                        <TableCell className="text-right font-bold text-foreground pr-4">
                          ${ventaData.venta_efectiva_neta?.toLocaleString('es-CL')}
                        </TableCell>
                      </TableRow>

                      <TableRow className="hover:bg-transparent border-t border-border/50">
                        <TableCell colSpan={2} className="font-semibold text-primary py-4 uppercase tracking-wider text-xs">
                          2. Ventas por Otros Métodos
                        </TableCell>
                      </TableRow>

                      <TableRow>
                        <TableCell className="font-medium text-muted-foreground">Tarjeta Débito (Redcompra)</TableCell>
                        <TableCell className="text-right">
                          <Input
                            type="number"
                            value={ventaData.redelcom}
                            onChange={(e) => handleFieldChange('redelcom', e.target.value)}
                            onBlur={(e) => handleFieldChange('redelcom', e.target.value)}
                            disabled={!canEdit}
                            className="text-right glass-input w-full max-w-[200px] ml-auto"
                            step="0.01"
                          />
                        </TableCell>
                      </TableRow>

                      <TableRow>
                        <TableCell className="font-medium text-muted-foreground">Tarjeta Crédito</TableCell>
                        <TableCell className="text-right">
                          <Input
                            type="number"
                            value={ventaData.tarjeta_credito}
                            onChange={(e) => handleFieldChange('tarjeta_credito', e.target.value)}
                            onBlur={(e) => handleFieldChange('tarjeta_credito', e.target.value)}
                            disabled={!canEdit}
                            className="text-right glass-input w-full max-w-[200px] ml-auto"
                            step="0.01"
                          />
                        </TableCell>
                      </TableRow>

                      <TableRow>
                        <TableCell className="font-medium text-muted-foreground">Crédito</TableCell>
                        <TableCell className="text-right">
                          <Input
                            type="number"
                            value={ventaData.credito}
                            onChange={(e) => handleFieldChange('credito', e.target.value)}
                            onBlur={(e) => handleFieldChange('credito', e.target.value)}
                            disabled={!canEdit}
                            className="text-right glass-input w-full max-w-[200px] ml-auto"
                            step="0.01"
                          />
                        </TableCell>
                      </TableRow>

                      <TableRow>
                        <TableCell className="font-medium text-muted-foreground">Edenred</TableCell>
                        <TableCell className="text-right">
                          <Input
                            type="number"
                            value={ventaData.edenred}
                            onChange={(e) => handleFieldChange('edenred', e.target.value)}
                            onBlur={(e) => handleFieldChange('edenred', e.target.value)}
                            disabled={!canEdit}
                            className="text-right glass-input w-full max-w-[200px] ml-auto"
                            step="0.01"
                          />
                        </TableCell>
                      </TableRow>

                      <TableRow>
                        <TableCell className="font-medium text-muted-foreground">Transferencia</TableCell>
                        <TableCell className="text-right">
                          <Input
                            type="number"
                            value={ventaData.transferencia}
                            onChange={(e) => handleFieldChange('transferencia', e.target.value)}
                            onBlur={(e) => handleFieldChange('transferencia', e.target.value)}
                            disabled={!canEdit}
                            className="text-right glass-input w-full max-w-[200px] ml-auto"
                            step="0.01"
                          />
                        </TableCell>
                      </TableRow>

                      <TableRow className="bg-primary/10 border-t-2 border-primary/20">
                        <TableCell className="font-bold text-foreground pl-8">= Subtotal Otras Ventas</TableCell>
                        <TableCell className="text-right font-bold text-foreground pr-4">
                          ${(
                            (parseFloat(ventaData.redelcom) || 0) +
                            (parseFloat(ventaData.tarjeta_credito) || 0) +
                            (parseFloat(ventaData.edenred) || 0) +
                            (parseFloat(ventaData.transferencia) || 0) +
                            (parseFloat(ventaData.credito) || 0)
                          ).toLocaleString('es-CL')}
                        </TableCell>
                      </TableRow>

                      <TableRow className="bg-secondary/40 border-t-2 border-border/80">
                        <TableCell className="font-bold text-foreground">
                          TOTAL GENERAL VENTAS
                          {discrepanciasPdf.ingresos !== null && (
                            <div className="text-[10px] text-muted-foreground font-normal mt-1">
                              Ref. PDF (Ingresos Totales): ${discrepanciasPdf.ingresos.toLocaleString('es-CL')}
                            </div>
                          )}
                        </TableCell>
                        <TableCell className="text-right font-bold accent-text text-lg pr-4">
                          ${ventaData.total_ventas?.toLocaleString('es-CL')}
                        </TableCell>
                      </TableRow>

                      <TableRow className="hover:bg-transparent border-t border-border/50">
                        <TableCell colSpan={2} className="font-semibold text-primary py-4 uppercase tracking-wider text-xs">
                          3. Ingresos
                        </TableCell>
                      </TableRow>

                      <TableRow>
                        <TableCell className="font-medium text-muted-foreground">Traspasos de Tesorería</TableCell>
                        <TableCell className="text-right">
                          <Input
                            type="number"
                            value={ventaData.traspaso_tesoreria_ingreso}
                            disabled={true}
                            className="text-right glass-input w-full max-w-[200px] ml-auto bg-secondary/30"
                            title="Sincronizado desde Otros Movimientos"
                          />
                        </TableCell>
                      </TableRow>

                      <TableRow>
                        <TableCell className="font-medium text-muted-foreground">Otros Ingresos</TableCell>
                        <TableCell className="text-right">
                          <Input
                            type="number"
                            value={ventaData.ingresos_efectivo}
                            disabled={true}
                            className="text-right glass-input w-full max-w-[200px] ml-auto bg-secondary/30"
                            title="Sincronizado desde Otros Movimientos"
                          />
                        </TableCell>
                      </TableRow>

                      <TableRow className="bg-primary/10 border-b border-primary/20">
                        <TableCell className="font-bold text-foreground pl-8">= Subtotal Ingresos</TableCell>
                        <TableCell className="text-right font-bold text-foreground pr-4">
                          ${(ventaData.subtotal_ingresos || 0).toLocaleString('es-CL')}
                        </TableCell>
                      </TableRow>

                      <TableRow className="hover:bg-transparent border-t border-border/50">
                        <TableCell colSpan={2} className="font-semibold text-primary py-4 uppercase tracking-wider text-xs">
                          4. Egresos
                        </TableCell>
                      </TableRow>

                      <TableRow>
                        <TableCell className="font-medium text-muted-foreground">Pago Facturas Caja</TableCell>
                        <TableCell className="text-right">
                          <Input
                            type="number"
                            value={ventaData.pago_facturas_caja}
                            disabled={true}
                            className="text-right glass-input w-full max-w-[200px] ml-auto bg-secondary/30"
                            title="Sincronizado desde Proveedores"
                          />
                        </TableCell>
                      </TableRow>

                      <TableRow>
                        <TableCell className="font-medium text-muted-foreground">Gastos RRHH</TableCell>
                        <TableCell className="text-right">
                          <Input
                            type="number"
                            value={ventaData.gastos_rrhh}
                            disabled={true}
                            className="text-right glass-input w-full max-w-[200px] ml-auto bg-secondary/30"
                            title="Sincronizado desde Otros Movimientos"
                          />
                        </TableCell>
                      </TableRow>

                      <TableRow>
                        <TableCell className="font-medium text-muted-foreground">Servicios</TableCell>
                        <TableCell className="text-right">
                          <Input
                            type="number"
                            value={ventaData.servicios}
                            disabled={true}
                            className="text-right glass-input w-full max-w-[200px] ml-auto bg-secondary/30"
                            title="Sincronizado desde Otros Movimientos"
                          />
                        </TableCell>
                      </TableRow>

                      <TableRow>
                        <TableCell className="font-medium text-muted-foreground">Gastos</TableCell>
                        <TableCell className="text-right">
                          <Input
                            type="number"
                            value={ventaData.gastos}
                            disabled={true}
                            className="text-right glass-input w-full max-w-[200px] ml-auto bg-secondary/30"
                            title="Sincronizado desde Otros Movimientos"
                          />
                        </TableCell>
                      </TableRow>

                      <TableRow>
                        <TableCell className="font-medium text-muted-foreground">Corrección de Boletas</TableCell>
                        <TableCell className="text-right">
                          <Input
                            type="number"
                            value={ventaData.correccion_boletas}
                            disabled={true}
                            className="text-right glass-input w-full max-w-[200px] ml-auto bg-secondary/30"
                            title="Sincronizado desde Otros Movimientos"
                          />
                        </TableCell>
                      </TableRow>

                      <TableRow>
                        <TableCell className="font-medium text-muted-foreground">Otros Egresos</TableCell>
                        <TableCell className="text-right">
                          <Input
                            type="number"
                            value={ventaData.otros_egresos}
                            disabled={true}
                            className="text-right glass-input w-full max-w-[200px] ml-auto bg-secondary/30"
                            title="Sincronizado desde Otros Movimientos"
                          />
                        </TableCell>
                      </TableRow>

                      <TableRow className="bg-primary/10 border-b border-primary/20">
                        <TableCell className="font-bold text-foreground pl-8">= Subtotal Egresos Operativos</TableCell>
                        <TableCell className="text-right font-bold text-foreground pr-4">
                          ${(ventaData.sumEgresosOperativos || 0).toLocaleString('es-CL')}
                        </TableCell>
                      </TableRow>

                      <TableRow>
                        <TableCell className="font-medium text-red-400 font-bold pl-8">Retiros - Entrega a Tesorería</TableCell>
                        <TableCell className="text-right">
                          <Input
                            type="number"
                            value={ventaData.traspaso_tesoreria_egreso}
                            disabled={true}
                            className="text-right glass-input w-full max-w-[200px] ml-auto text-red-400 bg-secondary/30 font-bold"
                            title="Sincronizado desde Otros Movimientos"
                          />
                        </TableCell>
                      </TableRow>

                      <TableRow className="bg-secondary/40 border-t-2 border-border/80">
                        <TableCell className="font-bold text-foreground">
                          TOTAL GENERAL EGRESOS
                          {discrepanciasPdf.retiros !== null && (
                            <div className="text-[10px] text-muted-foreground font-normal mt-1">
                              Ref. PDF (Retiros Totales): ${discrepanciasPdf.retiros.toLocaleString('es-CL')}
                            </div>
                          )}
                        </TableCell>
                        <TableCell className="text-right font-bold accent-text text-lg pr-4">
                          ${(ventaData.total_egresos || 0).toLocaleString('es-CL')}
                        </TableCell>
                      </TableRow>

                    </TableBody>
                  </Table>
                </div>
              </div>
            ) : (
              <div className="text-center py-16 text-muted-foreground glass-card flex flex-col items-center justify-center space-y-4 shadow-sm border border-border/50">
                <div className="p-4 bg-primary/10 rounded-full mb-2">
                  <AlertCircle className="w-8 h-8 text-primary" />
                </div>
                <h3 className="text-lg font-medium text-foreground">No hay registro de venta</h3>
                <p className="text-sm opacity-80 max-w-md mx-auto">
                  No se encontró un registro de venta para la fecha <strong>{fecha}</strong> y turno <strong>{turno}</strong> en esta caja.
                  Presiona el botón abajo para inicializarla.
                </p>
                <Button onClick={handleCreateNewRecord} className="accent-button mt-4" size="lg">
                  <PlusCircle className="w-5 h-5 mr-2" />
                  Crear Nuevo Registro
                </Button>
              </div>
            )}
          </div>
        </div>

        <div className="w-full lg:w-80 order-1 lg:order-2">
                <SummaryPanel 
                  ventaData={ventaData} 
                  onCerrarDia={handleCerrarDia}
                  onReabrirDia={handleReabrirDia}
                  canClose={canClose}
                  canEdit={canEdit}
                  onFieldChange={handleFieldChange}
                  onLoadPreviousSaldo={loadPreviousDaySaldo}
                />
        </div>
      </div>

      <div className="mt-8 pt-8 border-t border-border/30">
        <h3 className="text-lg font-semibold text-foreground mb-4">Historial y Búsqueda de Registros</h3>
        <SearchFilterBar
          onSearch={handleSearch}
          results={searchResults}
          onDelete={handleDeleteRecord}
        />
      </div>

      <PDFUploadModal
        isOpen={isPDFModalOpen}
        onClose={() => setIsPDFModalOpen(false)}
        onDataExtracted={handlePDFDataExtracted}
      />
    </div>
  );

  if (hideHeader) {
    return content;
  }

  return (
    <>
      <Helmet>
        <title>Venta Diaria - ICL Market</title>
        <meta name="description" content="Gestión de ventas diarias de ICL Market" />
      </Helmet>

      <div className="gradient-bg min-h-screen">
        <Header />
        {content}
      </div>
    </>
  );
};

export default VentaDiariaPage;