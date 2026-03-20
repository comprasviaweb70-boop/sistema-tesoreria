
import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/customSupabaseClient';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Trash2, Loader2, TrendingUp, TrendingDown, Calendar, Clock } from 'lucide-react';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import CajaSelector from '@/components/CajaSelector';

const OtrosMovimientosList = ({ refreshTrigger, globalCajaId, setGlobalCajaId }) => {
  const { toast } = useToast();
  const [movimientos, setMovimientos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const [fechaDesde, setFechaDesde] = useState('');
  const [fechaHasta, setFechaHasta] = useState('');
  const [turnoFiltro, setTurnoFiltro] = useState('all-shifts');
  const [tipoFiltro, setTipoFiltro] = useState('all');

  useEffect(() => { fetchMovimientos(); }, [refreshTrigger, globalCajaId, fechaDesde, fechaHasta, turnoFiltro, tipoFiltro]);

  const fetchMovimientos = async () => {
    setLoading(true);
    try {
      let query = supabase
        .from('otros_movimientos')
        .select('*, categorias_movimiento(nombre), cajas(nombre, numero_caja)')
        .order('fecha', { ascending: false })
        .order('created_at', { ascending: false });

      if (globalCajaId && globalCajaId !== 'all') query = query.eq('caja_id', globalCajaId);
      if (fechaDesde) query = query.gte('fecha', fechaDesde);
      if (fechaHasta) query = query.lte('fecha', fechaHasta);
      if (turnoFiltro !== 'all-shifts') query = query.eq('turno', turnoFiltro);
      if (tipoFiltro !== 'all') query = query.eq('tipo', tipoFiltro);

      const { data, error } = await query;
      if (error) throw error;
      setMovimientos(data || []);
    } catch (err) {
      toast({ title: 'Error cargando movimientos', description: err.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (!confirmDeleteId) return;
    setIsDeleting(true);

    try {
      // 1. Obtener el registro a eliminar para saber sus detalles
      const movimiento = movimientos.find(m => m.id === confirmDeleteId);
      if (!movimiento) throw new Error("No se encontró el movimiento en la lista actual");

      // 2. Sincronizar con Venta Diaria: Descontar el monto de su columna específica
      const col = getVentaDiariaColumn(movimiento.tipo, movimiento.categorias_movimiento?.nombre);
      
      if (col) {
        const { data: ventaDiaria, error: vdError } = await supabase
          .from('venta_diaria')
          .select(`id, ${col}`)
          .eq('fecha', movimiento.fecha)
          .eq('turno', movimiento.turno)
          .eq('caja_id', movimiento.caja_id)
          .maybeSingle();

        if (vdError) throw vdError;

        if (ventaDiaria) {
          // Restar el monto (asegurando no bajar de 0)
          const nuevoMonto = Math.max(0, (parseFloat(ventaDiaria[col]) || 0) - (parseFloat(movimiento.monto) || 0));
          
          const { error: updateError } = await supabase
            .from('venta_diaria')
            .update({ [col]: nuevoMonto })
            .eq('id', ventaDiaria.id);
            
          if (updateError) {
            console.error(`Error al actualizar la venta diaria (columna ${col}) durante el borrado:`, updateError);
            throw new Error(`No se pudo sincronizar el borrado con la Venta Diaria (${col}).`);
          }
        }
      }

      // 3. Eliminar el registro en sí
      const { error: deleteError } = await supabase.from('otros_movimientos').delete().eq('id', confirmDeleteId);
      if (deleteError) throw deleteError;
      
      toast({ title: 'Movimiento eliminado', description: 'El movimiento fue eliminado y sincronizado correctamente.' });
      setMovimientos(prev => prev.filter(m => m.id !== confirmDeleteId));
      
      // 4. Forzar refresco global si es necesario
      if (typeof refreshTrigger !== 'undefined' && refreshTrigger !== null) {
          // Llama al trigger global si existe en un contexto superior
      }
    } catch (err) {
      console.error(err);
      toast({ title: 'Error al eliminar', description: err.message, variant: 'destructive' });
    } finally {
      setIsDeleting(false);
      setConfirmDeleteId(null);
    }
  };

  const getVentaDiariaColumn = (tipo, catNombre) => {
    if (!catNombre) return null;
    const cat = catNombre.toLowerCase();

    if (tipo === 'egreso') {
      if (cat.startsWith('rrhh') || cat.startsWith('rr.hh') || cat.startsWith('recursos humanos')) return 'gastos_rrhh';
      if (cat.startsWith('servicios')) return 'servicios';
      if (cat.startsWith('gastos')) return 'gastos';
      if (cat.startsWith('correcci')) return 'correccion_boletas';
      if (cat.startsWith('traspaso') || cat.includes('entrega a tesorería')) return 'traspaso_tesoreria_egreso';
      if (cat.startsWith('otros') && cat.includes('egresos')) return 'otros_egresos';
    } else if (tipo === 'ingreso') {
      if (cat.startsWith('traspaso') || cat.includes('recepción de tesorería')) return 'traspaso_tesoreria_ingreso';
      return 'ingresos_efectivo'; // Cualquier otro ingreso se suma a ingresos_efectivo
    }
    return null;
  };

  const fmt = (v) => `$${parseFloat(v || 0).toLocaleString('es-CL')}`;

  const totalIngresos = movimientos.filter(m => m.tipo === 'ingreso').reduce((a, m) => a + (parseFloat(m.monto) || 0), 0);
  const totalEgresos  = movimientos.filter(m => m.tipo === 'egreso').reduce((a, m) => a + (parseFloat(m.monto) || 0), 0);
  const recordToDelete = movimientos.find(m => m.id === confirmDeleteId);

  return (
    <Card className="glass-card">
      <CardHeader className="border-b border-border/50 pb-4">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <CardTitle>Historial de Movimientos</CardTitle>
          <div className="w-full md:w-56">
            <CajaSelector value={globalCajaId} onChange={setGlobalCajaId} label="" showAllOption allOptionLabel="Todas las Cajas" />
          </div>
        </div>

        {/* Filtros */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-3">
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground flex items-center gap-1"><Calendar className="h-3 w-3"/>Desde</Label>
            <Input type="date" value={fechaDesde} onChange={e => setFechaDesde(e.target.value)} className="h-8 text-sm glass-input font-medium [color-scheme:dark] text-foreground/80"/>
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground flex items-center gap-1"><Calendar className="h-3 w-3"/>Hasta</Label>
            <Input type="date" value={fechaHasta} onChange={e => setFechaHasta(e.target.value)} className="h-8 text-sm glass-input font-medium [color-scheme:dark] text-foreground/80"/>
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground flex items-center gap-1"><Clock className="h-3 w-3"/>Turno</Label>
            <Select value={turnoFiltro} onValueChange={setTurnoFiltro}>
              <SelectTrigger className="h-8 text-sm"><SelectValue/></SelectTrigger>
              <SelectContent>
                <SelectItem value="all-shifts">Todos</SelectItem>
                <SelectItem value="Mañana">Mañana</SelectItem>
                <SelectItem value="Tarde">Tarde</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Tipo</Label>
            <Select value={tipoFiltro} onValueChange={setTipoFiltro}>
              <SelectTrigger className="h-8 text-sm"><SelectValue/></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="ingreso">Ingresos</SelectItem>
                <SelectItem value="egreso">Egresos</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </CardHeader>

      <CardContent className="p-0">
        {loading ? (
          <div className="flex justify-center items-center py-16 text-muted-foreground gap-3">
            <Loader2 className="animate-spin text-primary w-8 h-8"/>
            <p>Cargando movimientos...</p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="border-border hover:bg-transparent">
                    <TableHead className="px-4">Fecha</TableHead>
                    <TableHead>Turno</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead>Categoría</TableHead>
                    <TableHead>Descripción</TableHead>
                    <TableHead className="text-right">Monto</TableHead>
                    <TableHead className="w-[50px]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {movimientos.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center py-12 text-muted-foreground">
                        No hay movimientos para los filtros aplicados.
                      </TableCell>
                    </TableRow>
                  ) : movimientos.map(m => (
                    <TableRow key={m.id} className="border-border/50 hover:bg-secondary/40 transition-colors">
                      <TableCell className="px-4 font-medium whitespace-nowrap">{m.fecha}</TableCell>
                      <TableCell className="text-muted-foreground text-sm">{m.turno}</TableCell>
                      <TableCell>
                        <span className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2 py-0.5 rounded border ${
                          m.tipo === 'ingreso'
                            ? 'bg-green-500/10 text-green-400 border-green-500/30'
                            : 'bg-red-500/10 text-red-400 border-red-500/30'
                        }`}>
                          {m.tipo === 'ingreso'
                            ? <><TrendingUp className="h-3 w-3"/> Ingreso</>
                            : <><TrendingDown className="h-3 w-3"/> Egreso</>}
                        </span>
                      </TableCell>
                      <TableCell className="text-sm">{m.categorias_movimiento?.nombre || '—'}</TableCell>
                      <TableCell className="text-sm text-muted-foreground max-w-[200px] truncate">{m.descripcion || '—'}</TableCell>
                      <TableCell className={`text-right font-semibold whitespace-nowrap ${m.tipo === 'ingreso' ? 'text-green-400' : 'text-red-400'}`}>
                        {m.tipo === 'ingreso' ? '+' : '-'}{fmt(m.monto)}
                      </TableCell>
                      <TableCell>
                        <Button variant="ghost" size="icon" onClick={() => setConfirmDeleteId(m.id)}
                          className="text-red-400 hover:text-red-500 hover:bg-red-500/10 h-8 w-8">
                          <Trash2 className="h-4 w-4"/>
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            {movimientos.length > 0 && (
              <div className="border-t border-border/50 bg-secondary/20 p-4">
                <div className="flex flex-wrap gap-4 justify-end items-center">
                  <div className="flex items-center gap-2 text-sm">
                    <TrendingUp className="h-4 w-4 text-green-400"/>
                    <span className="text-muted-foreground">Total Ingresos:</span>
                    <span className="font-bold text-green-400">{fmt(totalIngresos)}</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    <TrendingDown className="h-4 w-4 text-red-400"/>
                    <span className="text-muted-foreground">Total Egresos:</span>
                    <span className="font-bold text-red-400">{fmt(totalEgresos)}</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm border-l border-border pl-4">
                    <span className="text-muted-foreground">Neto:</span>
                    <span className={`font-bold text-base ${totalIngresos - totalEgresos >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                      {fmt(totalIngresos - totalEgresos)}
                    </span>
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </CardContent>

      <Dialog open={!!confirmDeleteId} onOpenChange={(open) => !open && setConfirmDeleteId(null)}>
        <DialogContent className="sm:max-w-[420px]">
          <DialogHeader>
            <DialogTitle>¿Eliminar este movimiento?</DialogTitle>
            <DialogDescription>
              {recordToDelete && (
                <>{recordToDelete.tipo === 'ingreso' ? 'Ingreso' : 'Egreso'} de{' '}
                <strong>{fmt(recordToDelete.monto)}</strong> del{' '}
                <strong>{recordToDelete.fecha}</strong>. Esta acción no se puede deshacer.</>
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setConfirmDeleteId(null)} disabled={isDeleting} className="border-border text-foreground hover:bg-secondary">
              Cancelar
            </Button>
            <Button onClick={handleConfirmDelete} disabled={isDeleting} className="bg-red-500 hover:bg-red-600 text-white">
              {isDeleting ? 'Eliminando...' : 'Sí, eliminar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
};

export default OtrosMovimientosList;
