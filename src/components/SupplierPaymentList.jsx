
import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/customSupabaseClient';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Pencil, Trash2, Loader2, FileText, ExternalLink, Banknote, CreditCard, Search, Calendar, Clock, Building2, ChevronDown, ChevronUp, RefreshCcw } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { recalculateVentaDiaria } from '@/utils/ventaDiariaSync';
import CajaSelector from '@/components/CajaSelector';

const SupplierPaymentList = ({ refreshTrigger, globalCajaId, setGlobalCajaId }) => {
  const { toast } = useToast();
  const [payments, setPayments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [editingPayment, setEditingPayment] = useState(null);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editLoading, setEditLoading] = useState(false);
  const [isHistoryCollapsed, setIsHistoryCollapsed] = useState(false);

  // Filtros
  const [fechaDesde, setFechaDesde] = useState('');
  const [fechaHasta, setFechaHasta] = useState('');
  const [turnoFiltro, setTurnoFiltro] = useState('all-shifts');
  const [proveedorFiltro, setProveedorFiltro] = useState('all');
  const [metodoFiltro, setMetodoFiltro] = useState('all');
  const [listadoProveedores, setListadoProveedores] = useState([]);

  useEffect(() => {
    fetchProviders();
  }, []);

  const fetchProviders = async () => {
    const { data } = await supabase.from('proveedores').select('id, nombre').eq('activo', true).order('nombre');
    if (data) setListadoProveedores(data);
  };

  useEffect(() => {
    fetchPayments();
  }, [refreshTrigger, globalCajaId, fechaDesde, fechaHasta, turnoFiltro, proveedorFiltro, metodoFiltro]);

  const fetchPayments = async () => {
    setLoading(true);
    try {
      let query = supabase
        .from('pagos_proveedor')
        .select('*, proveedores(nombre), cajas(nombre, numero_caja), usuarios(nombre_completo)')
        .order('fecha_pago', { ascending: false });

      // Si hay una caja seleccionada, incluir sus pagos O los de Cuenta Corriente
      if (globalCajaId && globalCajaId !== 'all' && globalCajaId !== '') {
        query = query.or(`caja_id.eq.${globalCajaId},origen_fondos.ilike.%corriente%`);
      }
      
      if (fechaDesde) query = query.gte('fecha_pago', fechaDesde);
      if (fechaHasta) query = query.lte('fecha_pago', fechaHasta);
      if (turnoFiltro !== 'all-shifts') query = query.eq('turno', turnoFiltro);
      if (proveedorFiltro !== 'all') query = query.eq('proveedor_id', proveedorFiltro);
      if (metodoFiltro !== 'all') query = query.eq('origen_fondos', metodoFiltro);

      const { data, error } = await query;
      if (error) throw error;
      setPayments(data || []);
    } catch (error) {
      toast({ title: 'Error cargando pagos', description: error.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const handleUpdatePayment = async (e) => {
    e.preventDefault();
    if (!editingPayment) return;
    setEditLoading(true);

    try {
      // 1. Obtener el registro ORIGINAL antes de cualquier cambio
      const { data: oldPago, error: oldError } = await supabase
        .from('pagos_proveedor')
        .select('*')
        .eq('id', editingPayment.id)
        .single();
      
      if (oldError) throw oldError;

      // 2. Si la fecha/turno/caja cambió, recalcular el slot ORIGINAL primero
      //    (con el registro AÚN en la BD, el recalculo tendrá el valor viejo)
      const slotCambio = oldPago.fecha_pago !== editingPayment.fecha_pago ||
          oldPago.turno !== editingPayment.turno ||
          oldPago.caja_id !== editingPayment.caja_id;

      // 3. ACTUALIZAR el registro del pago
      const { error: updateError } = await supabase
        .from('pagos_proveedor')
        .update({
          proveedor_id: editingPayment.proveedor_id,
          fecha_pago: editingPayment.fecha_pago,
          monto_pagado: parseFloat(editingPayment.monto_pagado),
          origen_fondos: editingPayment.origen_fondos,
          turno: editingPayment.turno,
          caja_id: editingPayment.caja_id
        })
        .eq('id', editingPayment.id);
      
      if (updateError) throw updateError;

      // 4. Recalcular el slot NUEVO (ahora el pago ya tiene los datos actualizados)
      if (editingPayment.caja_id && editingPayment.fecha_pago) {
        await recalculateVentaDiaria(supabase, editingPayment.fecha_pago, editingPayment.turno, editingPayment.caja_id);
      }

      // 5. Si el slot original era distinto, también recalcularlo
      //    (el pago ya no pertenece a ese slot, por ende el total baja)
      if (slotCambio && oldPago.caja_id && oldPago.fecha_pago) {
        await recalculateVentaDiaria(supabase, oldPago.fecha_pago, oldPago.turno, oldPago.caja_id);
      }

      toast({ title: 'Pago actualizado', description: 'Los cambios fueron guardados y sincronizados correctamente.' });
      setIsEditModalOpen(false);
      fetchPayments();
    } catch (error) {
      console.error(error);
      toast({ title: 'Error al actualizar', description: error.message, variant: 'destructive' });
    } finally {
      setEditLoading(false);
    }
  };

  /**
   * Ajusta la venta diaria recalculando los totales
   */
  const adjustVentaDiaria = async (pago) => {
    if (!pago.caja_id || !pago.fecha_pago) return;
    await recalculateVentaDiaria(supabase, pago.fecha_pago, pago.turno, pago.caja_id);
  };

  const handleConfirmDelete = async () => {
    if (!confirmDeleteId) return;
    setIsDeleting(true);

    try {
      // 1. Obtener el registro a eliminar para saber sus detalles
      const pago = payments.find(p => p.id === confirmDeleteId);
      if (!pago) throw new Error("No se encontró el pago en la lista actual");

      // 2. Eliminar el registro de pagos_proveedor
      const { error: deleteError } = await supabase.from('pagos_proveedor').delete().eq('id', confirmDeleteId);
      if (deleteError) throw deleteError;

      // 3. Sincronizar con la Venta Diaria recalculando (DESPUÉS de eliminar)
      await adjustVentaDiaria(pago);
      
      toast({ title: 'Pago eliminado', description: 'El pago fue eliminado y sincronizado correctamente.' });
      setPayments(prev => prev.filter(p => p.id !== confirmDeleteId));
      
      // 4. Forzar refresco global si es necesario
      if (typeof refreshTrigger !== 'undefined' && refreshTrigger !== null) {
          // Llama al trigger global si existe en un contexto superior
      }
    } catch (error) {
      console.error(error);
      toast({ title: 'Error al eliminar', description: error.message, variant: 'destructive' });
    } finally {
      setIsDeleting(false);
      setConfirmDeleteId(null);
    }
  };

  const formatCurrency = (val) =>
    `$${parseFloat(val || 0).toLocaleString('es-CL')}`;

  /**
   * Fuerza la re-sincronización de un pago con su registro de Venta Diaria.
   * Útil para recuperar registros que quedaron desincronizados.
   */
  const handleForceResync = async (pago) => {
    if (!pago.caja_id || !pago.fecha_pago) {
      toast({ title: 'Sin datos suficientes', description: 'Este pago no tiene caja o fecha asignada.', variant: 'destructive' });
      return;
    }
    try {
      const result = await recalculateVentaDiaria(supabase, pago.fecha_pago, pago.turno, pago.caja_id);
      if (result?.action === 'updated') {
        toast({ title: 'Re-sincronizado', description: `Venta Diaria actualizada correctamente.`, className: 'bg-green-500/10 text-green-500 border-green-500/50' });
      } else if (result?.action === 'skipped') {
        toast({ title: 'Sin registro de Venta Diaria', description: `No existe un registro de Venta Diaria para ${pago.fecha_pago} (${pago.turno}). Créalo primero.`, variant: 'destructive' });
      }
    } catch (err) {
      toast({ title: 'Error en re-sincronización', description: err.message, variant: 'destructive' });
    }
  };

  const getTipoPago = (p) => p.tipo_pago || p.origen_fondos || 'efectivo';

  // Totales por tipo
  const totalEfectivo = payments
    .filter(p => getTipoPago(p) === 'efectivo' || getTipoPago(p) === 'caja')
    .reduce((acc, p) => acc + (parseFloat(p.monto_pagado) || 0), 0);

  const totalCC = payments
    .filter(p => getTipoPago(p) === 'cuenta_corriente')
    .reduce((acc, p) => acc + (parseFloat(p.monto_pagado) || 0), 0);

  const totalGeneral = totalEfectivo + totalCC;

  const recordToDelete = payments.find(p => p.id === confirmDeleteId);

  return (
    <Card className="glass-card">
      <CardHeader className="border-b border-border/50 pb-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <CardTitle>Historial de Pagos</CardTitle>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setIsHistoryCollapsed(!isHistoryCollapsed)}
              className="h-8 w-8 text-muted-foreground hover:text-primary transition-colors"
              title={isHistoryCollapsed ? "Mostrar historial" : "Ocultar historial"}
            >
              {isHistoryCollapsed ? <ChevronDown className="h-5 w-5" /> : <ChevronUp className="h-5 w-5" />}
            </Button>
          </div>
          <div className="w-full md:w-56">
            <CajaSelector
              value={globalCajaId}
              onChange={setGlobalCajaId}
              label=""
              showAllOption={true}
              allOptionLabel="Todas las Cajas"
              className="w-full"
            />
          </div>
        </div>

        {/* Filtros */}
        {!isHistoryCollapsed && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-3">
            <div className="space-y-1">
              <Label className="text-xs flex items-center gap-1 text-muted-foreground/80 font-medium ml-1">
                <Calendar className="h-3 w-3 text-primary/70" /> Desde
              </Label>
              <Input 
                type="date" 
                value={fechaDesde} 
                onChange={(e) => setFechaDesde(e.target.value)} 
                className="h-9 text-sm glass-input font-medium [color-scheme:dark] text-foreground/80" 
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs flex items-center gap-1 text-muted-foreground/80 font-medium ml-1">
                <Calendar className="h-3 w-3 text-primary/70" /> Hasta
              </Label>
              <Input 
                type="date" 
                value={fechaHasta} 
                onChange={(e) => setFechaHasta(e.target.value)} 
                className="h-9 text-sm glass-input font-medium [color-scheme:dark] text-foreground/80" 
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs flex items-center gap-1 text-muted-foreground">
                <Clock className="h-3 w-3" /> Turno
              </Label>
              <Select value={turnoFiltro} onValueChange={setTurnoFiltro}>
                <SelectTrigger className="h-8 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all-shifts">Todos los turnos</SelectItem>
                  <SelectItem value="Mañana">Mañana</SelectItem>
                  <SelectItem value="Tarde">Tarde</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs flex items-center gap-1 text-muted-foreground">
                <Building2 className="h-3 w-3" /> Proveedor
              </Label>
              <Select value={proveedorFiltro} onValueChange={setProveedorFiltro}>
                <SelectTrigger className="h-8 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos los proveedores</SelectItem>
                  {listadoProveedores.map(p => (
                    <SelectItem key={p.id} value={p.id}>{p.nombre}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs flex items-center gap-1 text-muted-foreground">
                <CreditCard className="h-3 w-3" /> Método de Pago
              </Label>
              <Select value={metodoFiltro} onValueChange={setMetodoFiltro}>
                <SelectTrigger className="h-9 text-sm glass-input">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos los métodos</SelectItem>
                  <SelectItem value="caja">Efectivo (Caja)</SelectItem>
                  <SelectItem value="cuenta_corriente">Cuenta Corriente</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        )}
      </CardHeader>

      {!isHistoryCollapsed && (
        <CardContent className="p-0">
          {loading ? (
            <div className="flex flex-col justify-center items-center py-16 text-muted-foreground gap-3">
              <Loader2 className="animate-spin text-primary w-8 h-8" />
              <p>Cargando registros...</p>
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="border-border hover:bg-transparent">
                      <TableHead className="px-4">Fecha</TableHead>
                      <TableHead>Turno</TableHead>
                      <TableHead>Proveedor</TableHead>
                      <TableHead>Caja</TableHead>
                      <TableHead>Tipo Pago</TableHead>
                      <TableHead className="text-right">Monto</TableHead>
                      <TableHead>Comprobante</TableHead>
                      <TableHead className="w-[50px]"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {payments.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={8} className="text-center py-12 text-muted-foreground">
                          <div className="flex flex-col items-center gap-2">
                            <FileText className="h-8 w-8 opacity-20" />
                            <p>No se encontraron pagos para los filtros aplicados.</p>
                          </div>
                        </TableCell>
                      </TableRow>
                    ) : (
                      payments.map(p => {
                        const tipoPago = getTipoPago(p);
                        const esEfectivo = tipoPago === 'efectivo' || tipoPago === 'caja';
                        
                        const todayStr = new Date().toISOString().split('T')[0];
                        const esFuturo = p.fecha_pago > todayStr;

                        return (
                          <TableRow 
                            key={p.id} 
                            className={`border-border/50 transition-colors ${
                              esFuturo 
                                ? 'bg-blue-500/5 hover:bg-blue-500/10' 
                                : 'hover:bg-secondary/40'
                            }`}
                          >
                            <TableCell className="px-4 whitespace-nowrap font-medium">{p.fecha_pago}</TableCell>
                            <TableCell className="text-muted-foreground">{p.turno}</TableCell>
                            <TableCell className="font-medium">{p.proveedores?.nombre || '—'}</TableCell>
                            <TableCell className="text-muted-foreground text-sm">
                              {!esEfectivo 
                                ? 'Cuenta Corriente' 
                                : (p.cajas?.nombre || (p.cajas?.numero_caja ? `Caja ${p.cajas.numero_caja}` : '—'))
                              }
                            </TableCell>
                            <TableCell>
                              <span className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2 py-0.5 rounded border ${
                                esEfectivo
                                  ? 'bg-amber-500/10 text-amber-400 border-amber-500/30'
                                  : 'bg-blue-500/10 text-blue-400 border-blue-500/30'
                              }`}>
                                {esEfectivo
                                  ? <><Banknote className="h-3 w-3" /> Efectivo</>
                                  : <><CreditCard className="h-3 w-3" /> Cta. Corriente</>
                                }
                              </span>
                              {esFuturo && (
                                <span className="block mt-1 text-[10px] text-blue-400/70 font-medium uppercase tracking-wider">
                                  Planificado
                                </span>
                              )}
                            </TableCell>
                            <TableCell className="text-right font-semibold whitespace-nowrap">
                              {formatCurrency(p.monto_pagado)}
                            </TableCell>
                            <TableCell>
                              {p.comprobante_url ? (
                                <a
                                  href={p.comprobante_url}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="text-primary hover:text-primary/80 flex items-center gap-1.5 text-xs bg-primary/5 hover:bg-primary/10 px-2 py-1 rounded border border-primary/20 w-fit transition-all"
                                >
                                  <FileText className="h-3.5 w-3.5 text-red-400" />
                                  <span className="truncate max-w-[80px]">{p.comprobante_nombre || 'Ver'}</span>
                                  <ExternalLink className="h-3 w-3 opacity-50" />
                                </a>
                              ) : (
                                <span className="text-muted-foreground text-xs italic opacity-60">Sin archivo</span>
                              )}
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-1">
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => handleForceResync(p)}
                                  className="text-green-400 hover:text-green-500 hover:bg-green-500/10 h-8 w-8"
                                  title="Re-sincronizar con Venta Diaria"
                                >
                                  <RefreshCcw className="h-4 w-4" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => {
                                    setEditingPayment({ ...p });
                                    setIsEditModalOpen(true);
                                  }}
                                  className="text-amber-400 hover:text-amber-500 hover:bg-amber-500/10 h-8 w-8"
                                >
                                  <Pencil className="h-4 w-4" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => setConfirmDeleteId(p.id)}
                                  className="text-red-400 hover:text-red-500 hover:bg-red-500/10 h-8 w-8"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        );
                      })
                    )}
                  </TableBody>
                </Table>
              </div>

              {/* Totales al pie */}
              {payments.length > 0 && (
                <div className="border-t border-border/50 bg-secondary/20 p-4">
                  <div className="flex flex-wrap gap-4 justify-end items-center">
                    <div className="flex items-center gap-2 text-sm">
                      <Banknote className="h-4 w-4 text-amber-400" />
                      <span className="text-muted-foreground">Total Efectivo:</span>
                      <span className="font-bold text-amber-400">{formatCurrency(totalEfectivo)}</span>
                    </div>
                    <div className="flex items-center gap-2 text-sm">
                      <CreditCard className="h-4 w-4 text-blue-400" />
                      <span className="text-muted-foreground">Total Cta. Corriente:</span>
                      <span className="font-bold text-blue-400">{formatCurrency(totalCC)}</span>
                    </div>
                    <div className="flex items-center gap-2 text-sm border-l border-border pl-4">
                      <span className="text-muted-foreground">Total General:</span>
                      <span className="font-bold text-foreground text-base">{formatCurrency(totalGeneral)}</span>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      )}

      {/* Dialog confirmación eliminación */}
      <Dialog open={!!confirmDeleteId} onOpenChange={(open) => !open && setConfirmDeleteId(null)}>
        {/* ... (Contenido del dialogo de borrado se mantiene igual) */}
        <DialogContent className="sm:max-w-[420px]">
          <DialogHeader>
            <DialogTitle>¿Eliminar este pago?</DialogTitle>
            <DialogDescription>
              {recordToDelete && (
                <>
                  Pago a <strong>{recordToDelete.proveedores?.nombre}</strong> del{' '}
                  <strong>{recordToDelete.fecha_pago}</strong> por{' '}
                  <strong>{formatCurrency(recordToDelete.monto_pagado)}</strong>.
                  Esta acción no se puede deshacer.
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => setConfirmDeleteId(null)}
              disabled={isDeleting}
              className="border-border text-foreground hover:bg-secondary"
            >
              Cancelar
            </Button>
            <Button
              onClick={handleConfirmDelete}
              disabled={isDeleting}
              className="bg-red-500 hover:bg-red-600 text-white"
            >
              {isDeleting ? 'Eliminando...' : 'Sí, eliminar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog Edición */}
      <Dialog open={isEditModalOpen} onOpenChange={setIsEditModalOpen}>
        <DialogContent className="sm:max-w-[500px] glass-card">
          <DialogHeader>
            <DialogTitle>Editar Pago</DialogTitle>
            <DialogDescription>
              Modifica los detalles del pago registrado.
            </DialogDescription>
          </DialogHeader>
          
          {editingPayment && (
            <form onSubmit={handleUpdatePayment} className="space-y-4 py-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <Label>Monto</Label>
                  <Input 
                    type="number" 
                    value={editingPayment.monto_pagado} 
                    onChange={(e) => setEditingPayment({...editingPayment, monto_pagado: e.target.value})}
                    className="glass-input"
                  />
                </div>
                <div className="space-y-1">
                  <Label>Fecha</Label>
                  <Input 
                    type="date" 
                    value={editingPayment.fecha_pago} 
                    onChange={(e) => setEditingPayment({...editingPayment, fecha_pago: e.target.value})}
                    className="glass-input font-medium [color-scheme:dark] text-foreground/80"
                  />
                </div>
                <div className="space-y-1">
                  <Label>Turno</Label>
                  <Select 
                    value={editingPayment.turno} 
                    onValueChange={(val) => setEditingPayment({...editingPayment, turno: val})}
                  >
                    <SelectTrigger className="glass-input">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Mañana">Mañana</SelectItem>
                      <SelectItem value="Tarde">Tarde</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label>Método</Label>
                  <Select 
                    value={editingPayment.origen_fondos} 
                    onValueChange={(val) => setEditingPayment({...editingPayment, origen_fondos: val})}
                  >
                    <SelectTrigger className="glass-input">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="caja">Efectivo (Caja)</SelectItem>
                      <SelectItem value="cuenta_corriente">Cuenta Corriente</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1 col-span-2">
                  <Label>Caja de Referencia</Label>
                  <CajaSelector 
                    value={editingPayment.caja_id}
                    onChange={(val) => setEditingPayment({...editingPayment, caja_id: val})}
                    label=""
                  />
                  <p className="text-[10px] text-muted-foreground mt-1">
                    * La caja es necesaria para la sincronización con los informes diarios.
                  </p>
                </div>
              </div>

              <DialogFooter className="pt-4">
                <Button 
                  type="button" 
                  variant="ghost" 
                  onClick={() => setIsEditModalOpen(false)}
                  disabled={editLoading}
                >
                  Cancelar
                </Button>
                <Button type="submit" className="accent-button" disabled={editLoading}>
                  {editLoading ? <Loader2 className="animate-spin h-4 w-4 mr-2" /> : null}
                  Guardar Cambios
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </Card>
  );
};

export default SupplierPaymentList;
